# Student authentication rollout

Source files and migration names do not establish hosted deployment state. On 2026-10-08, read-only requests against the mobile-configured project verified that email confirmation is enabled and registration_enrollment_options_v2 returns one option for 2026-2027 / 1st Semester at Cavite State University Bacoor City Campus. The restricted student_get_registration_state endpoint exists and rejects anonymous access. These checks do not establish the protected completion signature, individual account eligibility, Auth hook configuration or real delivery.

## Established student login repair

Supabase rejects an unconfirmed identity before the mobile app receives a session. Keep global Confirm Email enabled for new registrations. Established active student identities with missing confirmation require a targeted operator repair; no client-side guard can substitute for it.

The server-only repair-student-email-confirmation.cjs script uses the installed mobile Supabase SDK and operator-supplied SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. It does not read client .env files or print credentials, emails or names. Never put the privileged key in EXPO_PUBLIC_ configuration.

From the repository root, with server-only credentials supplied through the operator environment:

~~~powershell
node supabase/repair-student-email-confirmation.cjs --preview
node supabase/repair-student-email-confirmation.cjs --apply <reviewed-preview-file>
~~~

Preview is read-only against the backend and writes a private UUID/timestamp manifest under ignored supabase/.temp/. Review this frozen roster with an authorized operator before applying it. Preview requires matching Auth/student UUIDs, Active student status, an unconfirmed non-anonymous email identity, no administrator row (including inactive administrators), and no student_registration/admin_access_request intent or incomplete draft. It excludes identities and student rows created after preview began.

Apply accepts only that project-bound roster and rechecks eligibility and row creation timestamps before each auth.admin.updateUserById(id, { email_confirm: true }). It never expands the roster or changes passwords, student status, enrollment or history. Rerunning the same manifest skips already-confirmed/ineligible accounts. Any API failure stops the run; a partial apply is retried with the same manifest. Hosted account changes require separate rollout authorization. No hosted repair was executed during implementation.

## Signup and confirmation

The signup form now collects email, password, full name, student number, program, year, campus, section and goal before account creation. Choices are limited to active options of the active semester; option and semester IDs are retained explicitly. Signup rechecks the current catalogue immediately before creating the Auth account and saves a version-1 registration_draft alongside signup_intent=student_registration. It does not persist the password in metadata.

After confirmation (native/web callback or manual login), provider-owned admission restores the draft and automatically invokes student_complete_registration once per login. Server failure, duplicate student number or changed enrollment leaves an editable populated form. Legacy incomplete registrations without a valid draft still use manual onboarding. Completion remains guarded by the RPC, creates student/history atomically and is idempotent. Successful completion clears the metadata draft best effort; cleanup failure does not revoke committed registration. Recovery, logout and account-switch fencing remain in effect.

Verify deployed migration state and the protected student_complete_registration(text,text,text,uuid,uuid) contract before release. The v2 catalogue is a rollout check, not proof of every protected function. Inspect handle_new_user against migration 030/034 and preserve administrator and older-client behavior. Migration 034 must exist before this signup client is released; do not rerun it merely because old notes described it as pending. Do not edit applied migrations or manually edit the schema snapshot.

## Release verification

1. Inspect hosted confirmation/password/redirect settings, SMTP delivery and whether migration 027's access-token hook is enabled. Preserve existing claim transformations and active administrator access. Keep Confirm Email enabled. Set hosted minimum new/reset password length to 15 characters with the backend-compatible 72-byte maximum; existing shorter login passwords remain valid.
2. On an explicitly authorized disposable Supabase database, apply migrations in order and run tests/student-registration.sql with psql -X -v ON_ERROR_STOP=1 -f. Verify authorization, unconfirmed/direct-insert denial, administrator/suspended denial, uniqueness, idempotency, history, legacy signup and semester rollover. Concurrent same-account calls must produce one student/history row; competing student numbers must produce one success. Installing SQL alone does not enable the Auth hook.
3. Register exact native redirects beebetter://auth and beebetter://auth?flow=recovery plus approved web /auth and /auth?flow=recovery origins. Web hosting must serve /auth cold starts. Test PKCE on the requesting device/browser, manual login after cross-device confirmation, and legacy implicit callbacks only on the Auth route.
4. Verify repaired synthetic legacy login without email interaction, unchanged shorter passwords, suspended-account denial, new-account confirmation, signup fields/current-semester choices, automatic completion, restart/manual login, correction/retry, duplicate numbers and semester changes. Also test delivery/network errors, expired/reused links, cold/warm recovery, logout during delayed completion and account switching. Recovery remains restricted until successful password update/logout clears its persisted marker.
5. Run mobile TypeScript/lint/auth/student tests, admin enrollment-flow tests and node supabase/tests/student-email-repair.cjs. Repair tests use in-memory synthetic accounts; mocked tests do not establish hosted delivery, protected PostgreSQL behavior, native deep linking or database concurrency.
6. Regenerate docs/agent/db-schema.sql only after separately authorized schema deployment if needed. Monitor sanitized failure categories without recording emails, student numbers, passwords, tokens or callback URLs. Retain existing records and history; do not reclaim student numbers automatically.
