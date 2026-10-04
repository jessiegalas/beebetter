# Database contracts and migrations

Read for schema, RLS, grants, RPCs, triggers, backfills, or migration operations.

## Current deployed schema reference

[db-schema.sql](db-schema.sql) is the current deployed `public` schema snapshot from the hosted Supabase database. Inspect relevant definitions only when a task involves database structure, tables, columns, relationships, RPCs/functions, triggers, RLS policies, grants, indexes, or other PostgreSQL/Supabase schema details. Do not preload the entire file or read it for unrelated tasks.

Snapshot refresh is pending after migration 033 was deployed on 2026-10-04. Its OSAS helper definitions and grants still show the earlier separate-permission model; inspect migration 033 and the live database for current OSAS authorization. Do not hand-edit the snapshot.

Prefer the snapshot over older documentation when determining deployed `public` structure. Numbered SQL in `supabase/migrations/` remains the source of historical change intent and rollout order, and the snapshot does not replace migrations. Before changing behavior, inspect the relevant migrations and replacement definitions in numeric order, including grants, callers, constraints, and triggers.

Do not manually edit `db-schema.sql` during normal feature work. Regenerate it from the hosted Supabase database after schema changes are deployed. Never expose secrets or connection credentials when inspecting or regenerating it.

## Migration map

| Migration(s) | Responsibilities |
| --- | --- |
| `001_initial_schema.sql` | Profiles, quests, Auth signup profile trigger, initial owner RLS; requires pgcrypto. |
| `002_locations_and_quest_places.sql`, `003_quest_proofs.sql` | Owned places/quest links; private quest-proofs bucket and initial Storage policies. |
| `004_admin_student_access.sql`, `005_students.sql`, `006_admin_quest_management.sql`, `007_super_admin_management.sql` | Admin access, student identity/signup records, per-student assignment, active admin/super-admin roles and management RPCs. |
| `008_context_aware_quests.sql`, `009_quest_categories.sql`, `010_quest_date_validation.sql`, `011_student_registration_validation.sql` | Timing/prerequisites, completion/history RPC, shared/private categories, date checks, catalogue and changed-field student validation. |
| `012_wellbeing_and_osas_foundation.sql`, `013_check_in_motivation.sql`, `014_osas_support_staff_directory.sql`, `015_osas_analytics_dashboard.sql` | Private wellness/reflections, voluntary support, separate OSAS permissions, motivation, authorized assignee directory, initial dashboard. |
| `016_system_hardening_phase_a.sql`, `017_admin_functionality_cleanup.sql` | Active-student writes, protected columns/completion, ownership/date validation; admin/student separation and guarded quest editing. |
| `018_privacy_and_case_accountability.sql`, `019_osas_reporting_privacy.sql` | Current completion proof validation, case events/withdrawal, cleanup queue, audits, one-filter/cohort/complement protections. |
| `020_longitudinal_data_foundation.sql`, `021_osas_longitudinal_analytics.sql` | Institutional timezone, enrollment periods, lifecycle events, streaks; current historical dashboard/export and student-weighted averages. |
| `022_scalable_data_access.sql`, `023_recommendation_quality.sql`, `024_final_integration_fixes.sql` | Pagination, progression summary, removal of writable `is_nearby`; candidates/events; referenced-proof deletion protection. |
| `025_semester_section_management.sql`, `026_database_normalization.sql` | Semester-scoped sections/admin RPCs and enrollment associations; canonical category FK, enrollment composite FKs, derived-level constraint. |
| `027_student_auth_access.sql` | Auth-only access-token hook rejecting inactive students while preserving active administrator access; separate Auth activation required. |
| `028_quest_notifications.sql` | Private push devices/deliveries, authenticated registration, service-only delivery claims. |
| `029_quest_notification_reliability.sql` | Delivery claim identifiers, receipt timing, and reliable notification processing. Use the schema snapshot to determine current deployed `public` definitions. |
| `030_admin_access_requests.sql` | Admin-intent Auth signup profile handling; requester-only access-request reads; authenticated request submission; super-admin-only queue/review RPCs; approval grants active ordinary `admin` only. Pending requests are unique per user. |
| `032_bacoor_semester_input_rules.sql` (pending) | Consecutive academic years for new semesters; Bacoor campus and positive integer labels for new/changed sections; unchanged legacy labels and associated-section protections retained. |
| `033_unify_admin_osas_access.sql` (deployed 2026-10-04) | Both OSAS capabilities derive from active admin status; support directory includes all active admins; obsolete client permission setter revoked. Legacy records retained. |

Migration entry points: `complete_quest` in 018; `admin_update_student` in 011 with validation triggers replaced by 025; admin quest writes in 017; dashboard/export in 021; list/summary RPCs in 022; candidates/events in 023; enrollment validation/history in 025; category validation/grants in 026; access-token hook in 027; push registration/claims in 028-029; admin access-request submission/review in 030. Check relevant snapshot definitions for deployed structure and search migrations for later replacements before editing.

## Authorization and contract changes

- Authorization combines RLS, SQL column privileges, and explicit SECURITY DEFINER guards. Preserve restricted search paths and explicit revoke/grant declarations.
- Test anon, authenticated owners, other users, inactive students/admins, and active ordinary/super-admin OSAS staff with missing, disabled, or restrictive legacy permission rows. Owner/service-role execution does not prove RLS correctness.
- Inspect both clients' signatures, selected columns, status values, category labels, and nullable legacy values. Preserve compatibility projections and event snapshots; do not replace missing RPCs with weaker direct writes.
- Auth credentials/identity, current profile/student projections, and event-time history have distinct ownership. See [enrollment](enrollment.md). Admin signup metadata signals profile-only onboarding but grants no authority; all decisions and `admin_users` changes stay behind guarded RPCs. OSAS reporting/support access follows active admin status after migration 033; see [glossary](../../GLOSSARY.md). See [admin and OSAS](admin-osas.md).
- Completion locking/idempotency, server progression, category compatibility, date validation, proof retention, and snapshots are detailed in [quest system](quest-system.md).
- Wellness privacy, active-admin OSAS access, audited suppression, and case event retention are detailed in [privacy and security](privacy-security.md) and [admin and OSAS](admin-osas.md).

## Migration operations

- Add the next unused three-digit migration using existing transactional style and explicit security declarations; 028 is already present, so verify the next number rather than assuming 028 is free. Never rewrite applied migrations.
- Test clean setup and upgrades with existing/legacy data, backfill anomalies, and constraint validation failures. Former `DATABASE_NORMALIZATION_AUDIT.md` contained 026 preflight queries but is absent; inspect migration 026 and Git history before relying on those queries.
- The chain is not safely rerunnable: 001 contains unguarded policy creation. Apply numbered files in ascending order, each succeeding before the next, only in an authorized operation. Auth/Storage schemas and roles must exist first.
- Deploy compatible database changes before dependent clients; validate on an authorized disposable stack and staging first. A review/documentation task authorizes no migration execution, including local scripts.
- Former `DEPLOYMENT.md` covered environment names, release/rollback, Auth configuration, and proof worker operations, with old flat SQL paths and the 001-027 chain; it is absent in the current tree. Recover relevant historical procedures from Git and verify against current source before operations. Current notification deployment instructions are in the [function README](../../supabase/functions/quest-notifications/README.md).
- Moving files into `supabase/migrations/` does not establish a configured Supabase CLI project or authorize `supabase db push`. Confirm tooling before use. The existing PowerShell runner and PGlite fixture still use old paths; see [testing](testing.md).
