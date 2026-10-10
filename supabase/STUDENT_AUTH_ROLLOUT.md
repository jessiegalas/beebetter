# Student authentication rollout

Source files and migration names do not establish hosted deployment state. Inspect the [current public schema snapshot](../docs/agent/db-schema.sql) for deployed registration definitions and verify Auth settings separately. Catalogue availability does not establish protected completion behavior, individual account eligibility, Auth hook configuration or real email delivery.

## Established student confirmation

Supabase rejects an unconfirmed identity before the app receives a session. Keep Confirm Email enabled. For this rollout, established students must confirm through email: use the app's resend action, verify SMTP/inbox delivery, open the latest link, and sign in again. Existing shorter login passwords remain valid.

The server-only repair-student-email-confirmation.cjs utility remains available for separately approved operator work, but automatic confirmation is not part of this rollout. Do not run its --apply mode as a substitute for student email confirmation.

## Signup and confirmation

The signup form now collects email, password, full name, student number, program, year, campus, section and goal before account creation. Choices are limited to active options of the active semester; option and semester IDs are retained explicitly. Signup rechecks the current catalogue immediately before creating the Auth account and saves a version-1 registration_draft alongside signup_intent=student_registration. It does not persist the password in metadata.

After confirmation (native/web callback or manual login), provider-owned admission restores the draft and automatically invokes student_complete_registration once per login. Server failure, duplicate student number or changed enrollment leaves an editable populated form. Legacy incomplete registrations without a valid draft still use manual onboarding. Completion remains guarded by the RPC, creates student/history atomically and is idempotent. Successful completion clears the metadata draft best effort; cleanup failure does not revoke committed registration. Recovery, logout and account-switch fencing remain in effect.

Verify deployed migration state and the protected student_complete_registration(text,text,text,uuid,uuid) contract before release. The v2 catalogue is a rollout check, not proof of every protected function. Inspect handle_new_user against migration 030/034 and preserve administrator and older-client behavior. Migration 034 must exist before this signup client is released; do not rerun it merely because old notes described it as pending. Do not edit applied migrations or manually edit the schema snapshot.

## Release verification

1. Inspect hosted confirmation/password/redirect settings, SMTP delivery and whether migration 027's access-token hook is enabled. Preserve existing claim transformations and active administrator access. Keep Confirm Email enabled. Set hosted minimum new/reset password length to 15 characters with the backend-compatible 72-byte maximum; existing shorter login passwords remain valid.
2. On an explicitly authorized disposable Supabase database, run verify-local-supabase.ps1, which applies migrations once and executes notification, registration, hardening, and concurrency suites. Verify authorization, unconfirmed/direct-insert denial, administrator/suspended denial, uniqueness, idempotency, history, legacy signup and semester rollover. Concurrent same-account calls must produce one student/history row; competing student numbers must produce one success. Installing SQL alone does not enable the Auth hook.
3. Register exact native redirects beebetter://auth and beebetter://auth?flow=recovery plus approved web /auth and /auth?flow=recovery origins. Web hosting must serve /auth cold starts. Test PKCE on the requesting device/browser, manual login after cross-device confirmation, and legacy implicit callbacks only on the Auth route.
4. Verify synthetic legacy login after email confirmation, unchanged shorter passwords, suspended-account denial, new-account confirmation, signup fields/current-semester choices, automatic completion, restart/manual login, correction/retry, duplicate numbers and semester changes. Also test delivery/network errors, expired/reused links, cold/warm recovery, logout during delayed completion and account switching. Recovery remains restricted until successful password update/logout clears its persisted marker.
5. Run mobile TypeScript/lint/auth/student tests, admin enrollment-flow tests and node supabase/tests/student-email-repair.cjs. Repair tests use in-memory synthetic accounts; mocked tests do not establish hosted delivery, protected PostgreSQL behavior, native deep linking or database concurrency.
6. Regenerate docs/agent/db-schema.sql only after separately authorized schema deployment if needed. Monitor sanitized failure categories without recording emails, student numbers, passwords, tokens or callback URLs. Retain existing records and history; do not reclaim student numbers automatically.

## Client boundaries and compatible hardening

See [registration client boundaries](../docs/agent/enrollment.md#registration-client-boundaries) for shared form/catalogue ownership, refresh validation and retained drafts.

Authentication serialization and busy state remain in user-data-context. Screens retain only immediate tap guards. Admission, recovery, notification cleanup, session/account fencing, and protected routes remain provider-owned. New profile saves omit email.

Migration contracts (verify against hosted definitions before rollout):

- 035_registration_enrollment_locking.sql locks semesters before sections and serializes draft activation with section edits/removal.
- 036_student_auth_email_and_grants.sql derives student email from Auth, synchronizes subsequent valid Auth changes, reconciles current projections without rewriting history, and removes destructive grants on affected tables. Existing authenticated email-update column permission is retained for installed older clients.

Before deployment, run the read-only tests/registration-preflight.sql through an authorized metadata connection and compare hosted functions, triggers, policies, and grants against migrations 025/032/034/035/036. The checked-in public schema snapshot was refreshed from the hosted database on 2026-10-10; inspect its current registration definitions instead of inferring deployment from older notes. Do not execute 034 again based on old documentation. Verify trigger ordering, Auth-hook access, service-role jobs, legacy updates, and schema drift before approving 035/036.

Apply compatible database changes before releasing the client. Test an older installed build against the resulting backend. Revoke legacy email-update permission only after those builds are retired. Keep consent, progression, OSAS suppression/audits, history, and provisional-feature flags intact.

Visual checks use the isolated synthetic preview adapter, without Supabase. Loading/empty/error/refresh/correction states, narrow/large/tablet/landscape viewports, light/dark appearance, and enlarged text are represented. Static screenshots do not prove native font scaling, keyboard clearance, screen-reader operation, email delivery, or deep-link integration; verify these on devices and authorized staging identities before release.
