# Privacy and security boundaries

Read for Auth/access, wellness/reflections, reporting disclosure, exports, support permissions, or sensitive Storage/data handling.

## Client and database trust

- RLS/RPC/grants/constraints are authoritative; client admission and UI guards improve UX only. Active-account checks must remain effective on database writes, including with old tokens.
- Both apps use publishable Supabase credentials. Public-prefixed environment variables are bundled into clients. Service-role keys/database passwords belong only in trusted server environments; never commit credentials, environment files, or backups, or log environment values. `.gitignore` does not cover every secret filename.
- SECURITY DEFINER RPCs require restricted search paths, explicit grants/revokes, and operation-specific authorization. Validate with unprivileged roles; service-role or owner success is not an RLS test.
- Access-token hook 027 requires separate Auth activation and must preserve existing hook transformations; see [enrollment](enrollment.md). Push tables/claims in 028 are private/service-only; notification credentials belong in trusted function/EAS/Vault configuration, not client assets.

## Voluntary student records

Mobile wellness, reflection, history, and support routes use `mobile/src/lib/wellbeing-data.ts`. Check-ins upsert by student/date; reflections may reference an owned quest; support requests require consent. Raw check-ins/reflections remain owner-private. Numeric context reads use explicit projections; private notes/reflection text are excluded from recommendation inputs.

These records are voluntary self-reports, not clinical diagnoses or verified improvement. Withdrawal uses the student RPC and retains the case history.

## Reporting and support access

- Every active admin, including super-admins, receives aggregate reporting and identifiable support-case access. Inactive admins, students, pending applicants, and anonymous callers receive no OSAS staff access. Student-owned support access remains separate. See [glossary](../../GLOSSARY.md) and migration 033 rollout in [admin and OSAS](admin-osas.md).
- Aggregate reports must not expose raw wellness text, precise location, identifiable case details, or support messages/notes. Use server-computed analytics and audited exports; details in [admin and OSAS](admin-osas.md).
- Preserve one demographic dimension, five-student minimum cohorts, complementary suppression, contributor/trend checks, and null/withheld semantics. Legacy summary RPCs are distinct from the audited dashboard.
- Optional motivation and support-status breakdowns lack independent five-contributor checks for every subgroup. Preserve this concern and review privacy before extending disclosure.
- Case updates/withdrawal preserve locked RPC authorization, retained notes/assignment, and event inserts. No direct client case-state writes or editable case/report audit logs.
- Enrollment history, quest snapshots, support events, and report audits are durable facts. FK cascades/nulling do not authorize ad hoc cleanup; see [enrollment](enrollment.md) and [quest system](quest-system.md).

Proof Storage is private, referenced objects are protected, and cleanup must use Storage API with confirmed success; see [quest system](quest-system.md). Do not use real student data as validation fixtures.
