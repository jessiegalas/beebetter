# Student authentication rollout

## Student ID and password

The mobile app signs students in with their Student ID and password. New students supply a nine-digit ID, a password, and an optional name or nickname. Successful signup opens a session immediately. Existing students use the Student ID on their record and their current password. For password help, students contact their school administrator. An authorized Auth operator can set a new password after the school verifies account ownership.

The mobile client invokes the student-auth Edge Function. The function uses a service-only lookup to resolve the Auth identity for an active student. Existing Auth accounts keep their password and UUID. For new accounts, the Auth Admin API generates an opaque address under the reserved beebetter.invalid domain because Supabase's password API needs an email or phone identifier. The address is internal to Auth, has no mailbox, and is never used to send confirmation or recovery email. The public Student email projection stays empty for those accounts.

Migration 043 provisions each new student, profile, and initial history period in the Auth insert transaction. The Student ID unique constraint protects concurrent signup. The Edge Function validates inputs, applies a shared limit before privileged account creation, and returns only a session or a mapped error. The app independently verifies admission as it does for restored sessions.

## Deployment and verification

1. Verify current hosted definitions against the public schema snapshot, then apply pending migrations in order through 043. Migration 042 is required by 043.
2. Deploy student-auth with the JWT precheck disabled for this function alone, as configured in config.toml. The endpoint needs to accept a request before the student has a session. Its service role key and Auth credentials stay in the function runtime. Keep Confirm Email enabled for the existing administrator signup flow.
3. Run the rollback-only student-registration and registration-hardening SQL suites on an authorized disposable Supabase database. Run node supabase/tests/student-auth-edge.cjs for mocked function checks. Verify hosted Auth Admin creation, wrong password, inactivity, duplicate IDs, email-free signup, and returning sign-in from a second device with the same ID and password.
4. Confirm that an existing email-based student can sign in with the recorded ID and their existing password, with the same Student and history rows. Older accounts that still require confirmation need school administrator help. Already-issued confirmation and recovery links remain usable according to their original expiry and redirect rules. Verify native/web deep links and the existing access-token hook separately.
5. Release the mobile app after the function and database contract are available on the same project. Verify Profile changes, including clearing the optional name and signing in with an updated Student ID.

## Legacy details

Migrations 034–035 introduced pending email drafts and enrollment locking. The existing student_complete_registration RPC still completes older confirmed drafts. Migration 036 projects Auth-owned emails for existing accounts and preserves legacy update grants. Migration 042 introduced the two-field student identity form and null enrollment support. Preserve historical enrollment and existing credentials throughout rollout.
