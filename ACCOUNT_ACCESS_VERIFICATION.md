# Account suspension and Android logout verification

## Investigation

The former admin flow wrote `students.status = 'Inactive'` through `admin_update_student` (latest definition in migration 011). It did not restrict Auth session issuance. Mobile password login navigated on session success; the root guard checked only user presence. The user-data provider published that user before reading student status and fabricated Active status when the row was missing. These paths explain why suspended users could enter the app.

The reported Android crash has not been reproduced. The old Profile logout callback awaited sign-out without a catch and then navigated while the root guard also redirected. The provider ignored returned Auth errors. Location initialization could continue after logout, location reads lacked session guards, and notification setup promises lacked rejection handling. These are concrete failure/race paths, not proof of a particular native crash cause.

The fix adds verified admission and root protected routes; a single idempotent logout; session-generation checks for late responses; handled storage/Auth errors; and cancellation of queued reminders, geofences, and location initialization. During implementation a mocked cleanup failure exposed an unhandled promise from the Auth sign-out event; the regression now covers that path.

## Automated checks

From mobile: `npx tsc --noEmit`, `npm run lint`, `npm run test:auth`, `npm run test:context`, `npm run test:students`. From admin: `npm run build`, `npm run lint`, `npm run test:report`. From the repository root: `git diff --check`.

The Auth suite executes production TypeScript modules using a small hook lifecycle harness and mocked native/service APIs. It covers admission, verification errors, restored sessions, suspension, reactivation, duplicate/failed logout, delayed reads/mutations, account switches, protected route declarations, and storage/native cleanup races. It is not a React Native renderer or a device test.

For real Auth/RLS tests use `supabase/test_account_access.cjs` only in the disposable environment described in [DEPLOYMENT.md](DEPLOYMENT.md). No hosted migration or hook configuration was performed during implementation. No device was attached and no disposable Supabase server was running during initial validation.

## Android acceptance matrix

Use synthetic accounts and a development or release Android build against the configured test server. Capture React Native and Android runtime logs (for example `adb logcat -s AndroidRuntime ReactNativeJS`) without recording passwords, tokens, or real student data.

| Scenario | Expected result |
| --- | --- |
| Active student signs in | Protected tabs open only after student verification. |
| Admin suspends student before login | Auth rejects credentials with the suspension message; protected screens never open. |
| Suspended persisted session opens or resumes | Protected content stays closed or closes after verification; suspension message survives logout. |
| Admin suspends foreground account | Account closes at the next status refresh, within the foreground polling interval. |
| Network/status read fails | Recoverable verification screen; Retry can recover and Sign out remains available. |
| Sign out twice; expired session; offline sign out | No crash, duplicate transition, or stuck loading state. Failed cleanup keeps access closed and offers retry. |
| Sign out with a modal/deep link open; Android Back afterward | Login remains the destination; private screens cannot be reopened. |
| Logout during location permission prompt or saved-place loading | Late work cannot start tracking or restore old places. Repeat with foreground denied and background denied. |
| Reminder/native location cleanup fails | Remaining cleanup still runs; failures do not escape as unhandled promises. |
| Logout while notification/geofence registration or quest save is pending | Pending completion cannot restore user data, reminders, geofences, or navigate away from login. |
| Sign out then sign in as another student | No previous profile, quests, places, wellness, or geofence context appears. |
| Admin reactivates the student | A fresh login succeeds without clearing app storage manually. |

Passing source/mocked tests does not establish that the original Android crash is resolved. Record device/build information, exact reproduction steps, and any stack trace when this matrix is executed.

## Implementation validation results

- Mobile TypeScript (`npx tsc --noEmit`): passed.
- Mobile lint (`npm run lint`): passed with two existing Unicode BOM warnings in `src/components/app-tabs.web.tsx` and `src/constants/theme.ts`.
- Mobile Auth regressions (`npm run test:auth`): 31 passed.
- Existing mobile regressions: 48 context tests and 6 student-validation tests passed.
- Admin build, lint, and CSV report regression suite: passed.
- `node --check supabase/test_account_access.cjs`: passed; real Auth/RLS execution remains pending.
- `git diff --check`, plus whitespace/conflict-marker checks on new files: passed.
- Disposable full-chain migration/Auth-hook checks: not run; Docker engine was unavailable and no local Supabase instance was provisioned. The Supabase CLI and psql were not available on PATH.
- Android reproduction: not run; `adb devices` reported no attached device. The exact original crash remains unconfirmed.

Workspace writes and cache/build commands needed sandbox escalation. The admin build and mobile lint succeeded when rerun with that access. No credentials, dependencies, hosted configuration, or historical SQL migrations were changed.
