# BeeBetter Database Normalization Audit

## Scope and method

This audit evaluates the effective PostgreSQL schema after migrations 001-025. Later `create or replace` definitions were treated as authoritative. Historical event tables were assessed by their event-time meaning rather than compared mechanically with current mutable rows.

Migration 026 addresses the confirmed integrity gaps without deleting columns or rewriting historical records.

## Relation inventory

| Relation | Key and important dependencies | Assessment |
| --- | --- | --- |
| `profiles` | `id -> total_xp, level, current_streak`; `total_xp -> level` | Progress projection; migration 026 constrains the derived level. |
| `students` | `id -> student identity and current enrollment`; `enrollment_option_id -> semester_id` | Compatibility projection; composite FK enforces option/semester scope while legacy labels remain supported. |
| `admin_users` | `id -> role, is_active` | Auth-user subtype in 3NF. |
| `osas_staff_permissions` | `user_id -> aggregate/support permissions` | Admin subtype in 3NF with separate sensitive authorization. |
| `academic_semesters` | `id -> academic_year, term, status`; `(academic_year,term) -> id` | 3NF; partial unique index enforces one active row. |
| `student_enrollment_options` | `id -> semester/course/year/campus/section`; natural composite key is unique | Semester-scoped section relation in 3NF. |
| `student_enrollment_history` | `id -> student, option, event-time labels, validity period` | Temporal snapshot; one open period per student. |
| `quests` | `id -> owner, category, schedule, state, proof`; `category_id -> category label` | Category FK added; text retained as a constrained compatibility label. |
| `quest_categories` | `id -> owner, name`; scoped case-insensitive name keys are unique | 3NF. |
| `user_locations` | `id -> owner, coordinates, radius, active state` | 3NF; quest ownership validation prevents cross-owner references. |
| `quest_completion_history` | `id -> owner, quest reference, event-time title/category/time` | Immutable historical snapshot. |
| `quest_lifecycle_events` | `id -> quest identity and event-time quest/enrollment facts` | Immutable analytical event snapshot. |
| `recommendation_events` | `id -> student, quest, event, session, rank, reasons` | Append-only measurement event with bounded reason payload. |
| `student_check_ins` | `id -> student/date/scores/note`; `(student,date)` is unique | 3NF and owner-private. |
| `self_management_reflections` | `id -> student, optional owned quest, period, scores, text` | 3NF; optional quest does not determine the reflection. |
| `support_requests` | `id -> student, concern, consent, current case state` | Current case projection. |
| `support_request_events` | `id -> request, actor, transition/assignment/note/time` | Immutable case-history facts. |
| `osas_report_audit_log` | `id -> actor, query dimensions, disclosure outcome` | Immutable audit relation. |
| `quest_proof_cleanup_queue` | `proof_path -> reason, eligibility, queued time` | Work queue in 3NF. |
| `system_configuration` | singleton key -> institutional timezone | Deliberate singleton configuration relation. |

## Normal-form assessment

### First Normal Form

The operational tables have stable primary keys and scalar attributes. PostgreSQL arrays in `recommendation_events.reason_codes` are a bounded event payload, not an independently updated business entity. Splitting them would add joins without resolving an existing update anomaly.

No confirmed 1NF violation requires migration.

### Second Normal Form

Most tables use UUID primary keys. Natural candidate keys are additionally enforced where required, including one check-in per student/date, one enrollment combination per semester, and one recommendation event per student/quest/type/session. Non-key attributes depend on the whole key.

No confirmed 2NF violation requires migration.

### Third Normal Form

The following dependencies required stronger enforcement:

1. `quests.id -> quests.category -> quest_categories.id` previously depended on matching free text. Migration 026 adds `quests.category_id`, backfills it, and makes the category row canonical while retaining the text label for client compatibility.
2. `enrollment_option_id -> semester_id`. Migration 026 adds composite foreign keys so an enrollment option cannot be associated with the wrong semester. Course, year, campus, and section text remains intentionally independent on student and history rows because migrations 011 and 025 explicitly preserve legacy spelling and event-time labels.
3. `profiles.total_xp -> profiles.level`. Level is retained as a server-maintained read cache, and migration 026 adds the exact derivation constraint after safely reconciling existing profile rows.

## Intentional denormalization and snapshots

- `quest_completion_history` preserves title and category after a quest is edited or deleted. These are immutable event snapshots.
- `quest_lifecycle_events` preserves quest and enrollment attributes at event time for longitudinal reporting.
- `student_enrollment_history` preserves readable enrollment attributes for historical analytics. Migration 025 prevents associated section labels from being renamed, and migration 026 ties identified periods to the exact option.
- `support_request_events` preserves status, assignment, actor, and follow-up facts at each case transition. `support_requests` remains the current case projection.
- `quests.completed_at` and current `status` are the current aggregate state; completion history is the durable event record. Server-only completion and triggers keep them synchronized.
- `profiles.total_xp`, `level`, and `current_streak` are server-maintained progression projections. XP is updated transactionally, level is now constrained to XP, and streak is recomputed from completion history using institutional time.
- `students.email` mirrors the Auth identity used by current RPCs. It is retained because the application and historical exports depend on it; Auth remains the login authority.
- `profiles.display_name` and `students.name` have overlapping values but different scopes: the former is an application display identity and the latter is validated student information. They are not merged without an institution-approved naming policy.
- `quests.is_nearby` is a deprecated cache. Recommendation code derives proximity from saved locations and live context; clients cannot write the flag after migration 022.

## Domain-specific findings

- **Students and profiles:** The one-to-one subtype keys are valid. Progression values are protected server-side. Level needed a derivation constraint; names and email remain compatibility/application projections.
- **Semesters and sections:** `student_enrollment_options` represents the semester-scoped section identity. Its natural uniqueness is enforced. Enrollment history is temporal and intentionally retains readable snapshots. Composite foreign keys prevent an option from being paired with the wrong semester without rewriting legacy labels.
- **Quests and categories:** Category text without a foreign key was the primary relational gap. Current quests now reference `quest_categories`; completion/lifecycle category text remains historical.
- **Wellness and reflections:** Check-ins and reflections contain facts determined by their row IDs, with owner/date and quest-owner integrity already enforced. Written responses are attributes of a reflection, not repeating groups.
- **Support cases:** The request row is current state and the event table is immutable history. OSAS permissions form a one-to-one extension of an admin account and do not grant ordinary admins sensitive access.
- **Administrators:** `admin_users` is an authorized-role subtype of Auth users. OSAS permissions are separately keyed and checked, which is preferable to copying permission state into the admin row.

## Deferred or unsafe transformations

- Existing columns retained for compatibility are not dropped. Removing them would require coordinated client and reporting migrations plus a staged deprecation period.
- Historical category text, enrollment labels, and case-event fields are not rewritten because doing so would destroy event-time meaning.
- Migration 026 leaves an unmatched legacy quest `category_id` null rather than inventing a category. New and edited quests always resolve to an authorized category. Deployers should inspect unmatched rows before considering a future `NOT NULL` constraint.
- Auth email normalization requires an explicit institutional policy for login email versus contact email. No destructive merge was assumed.

## Deployment checks

Before applying migration 026 to staging, inspect legacy category and enrollment anomalies. These queries are read-only:

```sql
select q.id, q.owner_id, q.category
from public.quests q
where not exists (
  select 1 from public.quest_categories c
  where c.name=q.category and (c.owner_id is null or c.owner_id=q.owner_id)
);

select s.id, s.semester_id, s.enrollment_option_id
from public.students s
left join public.student_enrollment_options o on o.id=s.enrollment_option_id
where (s.semester_id is null) <> (s.enrollment_option_id is null)
   or (s.enrollment_option_id is not null and s.semester_id is distinct from o.semester_id);

select h.id, h.student_id, h.semester_id, h.enrollment_option_id
from public.student_enrollment_history h
left join public.student_enrollment_options o on o.id=h.enrollment_option_id
where (h.semester_id is null) <> (h.enrollment_option_id is null)
   or (h.enrollment_option_id is not null and h.semester_id is distinct from o.semester_id);
```

If either enrollment query returns rows, stop and review the records rather than forcing a correction. Migration 026 validates its constraints transactionally and will roll back on inconsistent enrollment data.

Apply migrations in numeric order through `026_database_normalization.sql` on a disposable local Supabase stack, then staging. Afterward, confirm that the category backfill has no unmatched rows:

```sql
select id, owner_id, category from public.quests where category_id is null;
```

If rows are returned, create or map an authorized category through a separately reviewed data correction before considering `category_id NOT NULL`. Do not rewrite completion or lifecycle snapshots.
