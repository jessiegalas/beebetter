# Supabase guidance

Read [the root guide](../AGENTS.md) first. This directory contains flat numbered SQL migrations, not a checked-in Supabase CLI migrations project. Paths in the migration map are relative to this directory.

## Migration map and effective authority

Review all definitions of a changed function/policy in numeric order. An early definition or migration comment does not describe the effective schema after later replacements.

| Migrations | Responsibilities |
| --- | --- |
| `001_initial_schema.sql` | Profiles, quests, Auth signup profile trigger, initial owner RLS; requires pgcrypto. |
| `002_locations_and_quest_places.sql`, `003_quest_proofs.sql` | Owned saved places and quest links; private quest-proofs bucket and initial Storage policies. |
| `004_admin_student_access.sql`, `005_students.sql`, `006_admin_quest_management.sql`, `007_super_admin_management.sql` | Admin access, student identity/signup records, per-student quest assignment, active admin/super-admin roles and guarded management RPCs. |
| `008_context_aware_quests.sql`, `009_quest_categories.sql`, `010_quest_date_validation.sql`, `011_student_registration_validation.sql` | Quest timing/prerequisites, completion history/RPC, shared/private categories, date checks, enrollment catalogue and changed-field student validation. |
| `012_wellbeing_and_osas_foundation.sql`, `013_check_in_motivation.sql`, `014_osas_support_staff_directory.sql`, `015_osas_analytics_dashboard.sql` | Private wellness/reflections, voluntary support, separate OSAS permissions, motivation, authorized assignee directory, initial dashboard. |
| `016_system_hardening_phase_a.sql`, `017_admin_functionality_cleanup.sql` | Active-student writes, protected columns/completion, ownership/date validation; admin/student separation and guarded quest editing. |
| `018_privacy_and_case_accountability.sql`, `019_osas_reporting_privacy.sql` | Current completion proof validation, case events/withdrawal, cleanup queue, audit log, one-filter/cohort/complement reporting protections. |
| `020_longitudinal_data_foundation.sql`, `021_osas_longitudinal_analytics.sql` | Institutional timezone, enrollment periods, lifecycle events, streaks; current dashboard/export definitions with historical cohorts and student-weighted averages. |
| `022_scalable_data_access.sql`, `023_recommendation_quality.sql`, `024_final_integration_fixes.sql` | Paginated lists, progression summary, removal of writable is_nearby; recommendation candidates/events; referenced-proof deletion protection. |
| `025_semester_section_management.sql`, `026_database_normalization.sql` | Semester-scoped sections/admin RPCs and enrollment associations; canonical category FK, enrollment composite FKs, derived-level constraint. |
| `027_student_auth_access.sql` | Auth-only access-token hook rejecting inactive students while preserving active administrator access; requires separate Auth configuration. |

Current definitions to start with: `complete_quest` in 018; `admin_update_student` in 011 plus validation triggers replaced by 025; admin quest writes in 017; dashboard/export in 021; list/summary RPCs in 022; candidates/events in 023; enrollment validation/history in 025; category validation/grants in 026; the student access-token hook in 027.

## Database invariants

- Auth owns credentials and login identity. `handle_new_user` creates profile/student rows; student validation still applies to signup metadata. `profiles` holds progression/display projection, `students` holds current identity/enrollment, and history stores event-time facts. Do not merge these merely because fields overlap.
- Authorization combines RLS, SQL column privileges, and explicit guards in SECURITY DEFINER RPCs. Preserve restricted search paths and explicit revoke/grant declarations. Test as anon/authenticated owners, other users, inactive students/admins, and separately permitted OSAS staff; owner/service-role execution cannot prove RLS correctness.
- Only `complete_quest` awards student completion XP. Its latest definition locks the owned row, checks active student/active quest, prerequisites, and proof, then updates status/XP atomically with history/streak triggers. Repeating successful completion must not award XP again. Client-writable quest `xp` is a reward field, not permission to mutate `profiles.total_xp` or completion status; do not describe the current schema as fixing all possible reward-policy abuse.
- Quest location/prerequisite ownership and cycle checks remain server-enforced. New/changed schedule dates use server time; existing overdue dates remain valid for completion. Category names remain client compatibility inputs; 026 resolves authorized category IDs. Unmatched legacy categories may retain null IDs; do not impose NOT NULL without reviewed correction.
- Streaks count consecutive institutional calendar completion days ending today or yesterday, default Asia/Manila. SQL recalculates on reads because cached streaks can age. Level is constrained to integer `total_xp / 100 + 1`.
- Enrollment changes close one current history period and append another. Preserve past labels/validity and quest completion/lifecycle snapshots even after mutable records change or quests are deleted. Support case events and report audit rows are not editable client logs. Existing FK nulling/cascades do not authorize ad hoc history cleanup.
- 025 seeds a Legacy / Current semester, not an invented academic year. Registration exposes only active sections of the active semester, including to anon via `registration_enrollment_options`. Activation does not migrate students. Used sections are archived rather than removed/renamed. 026 enforces paired option/semester values and exact option-to-semester relationships on current and history rows.
- Raw check-ins/reflections stay owner-private. Active-admin status alone grants neither OSAS capability. Current dashboard queries enforce one demographic dimension, five-student cohort thresholds, complement suppression, and contributor/trend checks, and append audits. Preserve null/withheld semantics. Legacy summary RPCs in 012 remain distinct from the audited dashboard; optional motivation and support-status breakdowns do not each have independent five-contributor checks and need review before extending disclosure.
- Case changes use `osas_update_support_request`; withdrawal uses `student_withdraw_support_request`. Preserve their row locks, assignment authorization, retained notes, and event inserts. Do not implement direct client case-state updates.
- Private proofs are checked against user/quest path, Storage object metadata, allowed MIME types, and positive size up to 10 MiB. 024 blocks owner deletion of referenced proof objects. 018 queues retired proofs after 30 days and discovers unreferenced uploads older than seven days. A trusted external worker must delete via Storage API and confirm success; never delete Storage metadata rows directly. No worker implementation is present here.

## Schema changes and operations

- Add the next unused three-digit migration (028 at this review), with the existing transactional style and explicit security declarations. Do not edit applied migrations or assume the full chain is idempotent: 001 contains unguarded policy creation.
- Inspect both clients' RPC signatures, selected columns, statuses, category labels, and nullable values before changing SQL. Preserve compatibility projections and event snapshots. Test clean setup and upgrades with existing/legacy data, including backfill anomalies and constraint validation failures.
- Apply 001-027 in ascending order only in an authorized operation; each file must succeed before continuing. Auth and Storage schemas/roles must exist first. Database changes precede dependent client releases.
- Read [DEPLOYMENT.md](../DEPLOYMENT.md) for rollout/rollback and worker operations and [DATABASE_NORMALIZATION_AUDIT.md](../DATABASE_NORMALIZATION_AUDIT.md) for 026 preflight queries. Do not run hosted migrations, deploy, reset, or merge without explicit authorization. Never use a documentation/review task as permission to run local migrations either.

## Verification and current gaps

There is no package manifest/test command in this directory. `verify-local-supabase.ps1` requires psql and an already provisioned disposable Supabase database with Auth/Storage. From the repository root, the documented invocation is:

```powershell
./supabase/verify-local-supabase.ps1 -DatabaseUrl <local-db-url>
```

This is a **mutating migration runner**, not a dry run or an assertion suite. It accepts loopback hosts only, enumerates numbered SQL files, and runs psql with ON_ERROR_STOP. Use only when local migration execution is authorized. Do not execute it during review-only/no-migration tasks.

`test_account_access.cjs` exercises real Auth and student suspension on an explicitly configured disposable loopback stack with hook 027 enabled. See `../DEPLOYMENT.md` for environment variables and invocation. It is not full-schema regression coverage. `../mobile/scripts/test-context-database.cjs` is an optional PGlite fixture suite (external dependency/module-path argument) that executes selected migrations through 011 in test-specific order. It does not validate 012-027, real Auth/Storage, or concurrent PostgreSQL sessions. Report this gap; do not invent missing commands or silently install dependencies.

For a future SQL change, establish appropriate disposable-stack regressions: direct unauthorized writes, cross-owner access, inactive-account writes, duplicate/concurrent completion, proof metadata/deletion, history after quest deletion, unchanged legacy enrollment edits, semester activation/archival and FK compatibility, OSAS grant revocation/cohort suppression/export auditing, and support-event retention. Run affected client checks from their guides. For documentation-only changes, verify paths, migration references, commands, and `git diff --check`; do not execute migrations.
