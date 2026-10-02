# Android push acceptance record — 2026-10-02

Implementation and test-only cloud rollout are in place. **Full Android acceptance is pending. General delivery is disabled.**

## Cloud configuration verified

- BeeBetter Supabase project: yykibnpalombfszomhwk.
- Migration 028 notification and completion RPC bodies matched the existing deployed snapshot before migration 029 was applied.
- Migration 029 applied; quest-notifications deployed with gateway JWT verification disabled and its shared-secret POST authentication intact.
- Worker mode: test. The only allowed owner is synthetic student aae8c902-486c-4559-b8f2-9641a6d17517, created through Auth admin with email confirmation and no email sent.
- Matching FCM v1 credentials assigned in EAS for Firebase project beebetter-2b712 and Android package com.anonymous.beebetter.
- EAS development environment configured with the client-safe Supabase/Maps variables and GOOGLE_SERVICES_JSON file variable.
- Matching Vault entries and one-minute cron configured. Actual cron runs at 15:41, 15:42, and 15:43 Manila time succeeded. Worker health returned 200, test mode, and no error codes.

## Automated verification completed

- Mobile TypeScript passed. Admin production build and lint also passed.
- 34 account-access and 48 context regressions passed.
- Notification regressions passed, including supplied native tokens, in-flight deduplication, forced server registration, corrupt storage, permission recovery, logout/account fencing, timeout, effect replay after completion dispatch, independent receipts/sends, mixed tickets, stale leases, retry exhaustion, receipt expiry, refreshed-device protection, test-owner isolation, Android task presentation, and the offline alert Open button after response cleanup with account-switch fencing.
- Firebase build tests passed: missing/malformed/mismatched cloud file rejection and matching-file/local-fallback success.
- Uncached mobile lint passed with the two existing BOM warnings in app-tabs.web.tsx and theme.ts.
- Deno checked the deployed worker. Diff whitespace checks passed.
- Disposable native PostgreSQL 18.6 applied all 29 migrations with minimal Auth/Storage infrastructure fixtures. Anonymous/authenticated/inactive/foreign-owner checks, private tables, service-only claims, owner isolation, empty allowlist, stale leases, cancellation, retry limits, and one XP award/history record after duplicate completion passed.
- Two independent psql connections claimed the same due work without overlap.
- A separate synthetic 028 database upgraded to 029; legacy sent timestamps and receipt scheduling backfilled correctly, and notification assertions passed after upgrade.
- Docker's local Supabase stack could not start here. CI now provisions a real empty Supabase stack outside the checkout and applies repository migrations once; that CI job has not been run in this session.

## Physical phone evidence

Phone: Infinix X6852, Android 15, connected through USB debugging.

The existing development client loaded the current mobile code through Metro. Its synthetic student signed in, notification permission was granted, and one server registration was observed without exposing the token.

Direct push a0e5caf9-4b60-4eee-bcca-d32f25d37d4e appeared in the phone's BeeBetter notification tray with the expected title and Open category. Its Expo provider receipt was successful.

The minute worker delivered both scheduled synthetic reminders to the physical phone:

| Delivery ID | Quest | Send time (Manila) | Attempts | Provider receipt |
| --- | --- | --- | --- | --- |
| d96bf9ad-63af-417a-8b6d-303aea047c3d | SYNTHETIC scheduled Open | 15:41:00 | 1 | ok |
| 62021816-5bdb-4135-8d66-c4e9a1f2bebf | SYNTHETIC scheduled Complete | 15:42:01 | 1 | ok |

The initial provider receipts were queried without changing sent timestamps. The one-minute cron later processed both normally and marked them delivered. Successful provider receipts alone are not treated as device delivery.

## Build and remaining acceptance

[EAS development build e0ce5aa6-7398-4c8d-afff-ab6f11380fcc](https://expo.dev/accounts/itsjessie25/projects/beebetter/builds/e0ce5aa6-7398-4c8d-afff-ab6f11380fcc) finished successfully. The APK was downloaded outside the repository.

Android rejected the in-place update with INSTALL_FAILED_UPDATE_INCOMPATIBLE. After explicit approval, the user-0 installation was replaced and the new EAS APK installed successfully. It loads the current code through Metro; a development client needs that server for these checks.

Observed on the new APK:

- The notification screen showed Push registered on this device after the server RPC. A direct push appeared, and its body tap opened SYNTHETIC scheduled Open with proof controls.
- The background test exposed missing buttons in FCM-rendered notifications. The worker now sends high-priority data-only messages; the registered Expo task checks device/session, permission, category and expiry, then presents the local notification. A native record showed actions=2 and the visible Complete/Open buttons.
- Background Complete finished SYNTHETIC scheduled Complete. A second notification's Complete tap left XP at 25 and exactly one durable completion history row.
- With the BeeBetter process confirmed absent, a cold-start Complete tap finished a different synthetic quest, adding exactly 25 XP and one history row (total 50).
- A stale Complete category after requires_proof changed opened proof submission without completing that quest.
- Complete for an unfinished prerequisite opened SYNTHETIC prerequisite child with its locked explanation; it stayed active.
- With Wi-Fi/mobile data temporarily disabled, Complete showed the connection-error alert. Original network settings were restored in finally. After response cleanup, the alert Open button successfully reached the exact synthetic prerequisite parent. A fresh foreground Complete action then completed it, adding exactly 25 XP/history once (observed total 100 across four completed synthetic quests).
- Android Settings denial was observed as Notifications are turned off with a Settings button. Re-enabling in Android Settings changed the screen back to Push registered on this device and restored one server registration. The code also handles Android's denied status even if its runtime granted flag remains true.
- The revised scheduled reminder 74a6cd09-c368-42ab-82df-d9924d298e69 was sent at 20:36:00 Manila, had an ok provider receipt, and appeared as a native quests-channel notification with actions=1. With the BeeBetter process confirmed absent, its Open action opened SYNTHETIC scheduled Open and the required-proof controls.
- Logout was confirmed on the phone: zero server registrations, no BeeBetter notifications, and the sign-in screen. Signing back in restored exactly one server registration and the Push registered on this device status.

Still pending: the remaining action combinations/repeated Open scenarios and a device switch between two different accounts. Core foreground/background/cold-start Complete and cold-start Open, proof/prerequisite denial, offline recovery, permission re-enabling, and logout/re-registration were observed. Account-switch behavior and effect/session fencing have automated coverage. Physical geofence acceptance is explicitly deferred at the user's request; its automated regressions pass. USB disconnects and a restarted Metro server interrupted some checks; interrupted attempts are not counted as passes.

The full hosted public-schema snapshot was regenerated with schema-only pg_dump using the existing postgres role from Supabase's official export command. No temporary role grant or permission change was needed; the snapshot retains its original UTF-16LE encoding.

Keep test mode restricted to this synthetic student. To stop all future sends, set mode off and unschedule the minute job, retaining migration 029. Do not treat this record as completed Android acceptance.
