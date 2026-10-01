# Targeted validation and coverage limits

Read when choosing checks for affected behavior. Batch related edits, run targeted checks first, and report actual commands/results/warnings/skipped checks; old audits are not current verification. Install locked dependencies with `npm ci` only when setup is needed and within scope.

## Client commands

| Working directory | Commands and triggers |
| --- | --- |
| `mobile/` | `npx tsc --noEmit`; `npm run lint`; `npm run test:context` for ranking/context; `npm run test:students` for student validation; `npm run test:auth` for account/session lifecycle. |
| `mobile/` | `node scripts/test-quest-notifications.cjs` for current notification actions/registration (present in working tree; no npm script). |
| `admin/` | `npm run build` (`tsc -b` plus Vite); `npm run lint` (Oxlint, not ESLint); `npm run test:report` for CSV/report behavior. |
| Repository root | `git diff --check`; inspect changed-file scope and documentation paths. |

Shared validation or cross-client contracts require checks in both apps. For shared student validation, include mobile TypeScript/student tests and admin checks. Do not use mobile's template `reset-project` script as validation. Documentation-only tasks require diff/path/reference checks, not application test suites or migration execution.

Mobile tests are Node `.cjs` scripts transpiling TypeScript, not Jest/device tests. Auth uses a small hook lifecycle harness and mocked service/native APIs; former `ACCOUNT_ACCESS_VERIFICATION.md` supplied device acceptance but is absent. Admin report tests cover CSV content, suppression, missing values, and formula escaping, not database RLS/RPCs. There is no checked-in admin browser end-to-end suite.

## Device and UI acceptance

- Native location: foreground allowed/denied, background denied, stale GPS, overlapping regions, resume, sign-out cleanup, proof-required completion. Physical hardware is required; Expo Go/web cannot establish background geofencing.
- Account/session/notifications: routing and account switching on hardware; notification denial/re-enable, body/Open/Complete taps, duplicate taps, foreground/background/cold start, proof changed after delivery, prerequisites, offline failure, expired Auth, token rotation, logout, geofence cooldown/exit/offline behavior. See the [function acceptance guide](../../supabase/functions/quest-notifications/README.md).
- Admin: ordinary/super-admin versus each OSAS permission, revoked/inactive access, pagination/search, RPC errors, semester lifecycle, support-event retention, suppressed/export-failure states. Use authorized synthetic data, never real student fixtures.

## Database commands and gaps

There is no package manifest/test command in `supabase/`. The documented root command is:

```powershell
./supabase/verify-local-supabase.ps1 -DatabaseUrl <local-db-url>
```

This is a **mutating migration runner**, not a dry run/assertion suite. It requires psql and a provisioned disposable Supabase with Auth/Storage, accepts loopback hosts only, and uses `ON_ERROR_STOP`. Migration execution requires explicit authorization even locally; never run it for documentation/review tasks.

**Current path mismatch:** the runner enumerates SQL directly in `supabase/`, while numbered files now live in `supabase/migrations/`. It can report zero migrations as success; do not treat that as full-chain verification. Confirm/fix the runner only in an authorized tooling task. Moving the directory does not establish configured CLI migration support.

Former root command `node supabase/test_account_access.cjs` is **unavailable**: the suite and its setup reference `DEPLOYMENT.md` were removed from the current tree. Preserve its coverage requirements for future authorized database work: real Auth/student suspension on a configured disposable loopback stack with hook 027 enabled; active login, suspension by admin RPC, denied inactive login/refresh, old-token write rejection, hook execution denial for clients, suspended logout, reactivation, and active-admin exemption. It created/removed synthetic users; retained anonymous history could remain until stack disposal. Test clean and upgraded synthetic pre-027 data plus staging signup/email confirmation. An absent/disabled hook must fail inactive-login checks. This was account-access coverage, not full-schema coverage; do not claim it was run or restore scripts during unrelated tasks.

`mobile/scripts/test-context-database.cjs` uses optional external PGlite (not an app dependency), supplied by module-path argument, fake Auth/Storage, and selected migrations through 011 in test-specific order. It still reads old flat SQL paths. Do not run it for no-migration tasks or treat it as 012-028, real Auth/Storage, or concurrent PostgreSQL coverage. Do not silently install dependencies or invent missing commands.

For authorized SQL changes, establish disposable-stack checks for unauthorized/cross-owner/inactive writes, duplicate/concurrent completion, proof metadata/deletion, history after deletion, unchanged legacy enrollment edits, semester activation/archival/FKs, OSAS grant revocation/cohort suppression/export audits, and support-event retention. For 028, include private-token access, service-only claims, registration ownership, event timing, concurrent claims, stale/cancelled jobs, and bounded retries. Run affected client checks; report gaps separately.
