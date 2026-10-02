# Quest notifications: deployment and Android acceptance

Android uses Supabase scheduling, Expo Push, and Firebase/FCM v1. Migration 028 preserves the authenticated registration and completion interfaces. Migration 029 adds guarded claims and fair receipt scheduling. Adding source files alone does not enable delivery.

## Build credentials

Register Firebase's Android application as **com.anonymous.beebetter**. Store its client configuration as the EAS **file** variable GOOGLE_SERVICES_JSON in the development environment. Cloud Android builds require a readable file with the matching Android package. Local development retains the ignored root google-services.json fallback.

Set EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, and EXPO_PUBLIC_GOOGLE_MAPS_API_KEY in that same EAS environment. Upload the matching FCM v1 service-account JSON using the Android EAS credentials menu. Keep that privileged JSON outside the repository and out of app assets/environment variables. The client configuration and service-account key are different files. See [Expo FCM setup](https://docs.expo.dev/push-notifications/fcm-credentials/).

From mobile, build with:

    eas build --platform android --profile development

The development profile explicitly selects the development environment and produces an internal development APK. Expo Go, web, and emulators do not establish physical-device acceptance.

## Verification and rollout

1. Check hosted notification tables, RLS/grants, and RPC definitions against the deployed snapshot and migration 028 before applying 029. Do not rewrite 028 or change register_quest_push_device / complete_quest.
2. Provision a fresh disposable Supabase stack with Auth/Storage and run the verification command below. The runner fails on zero migrations, applies numbered files from supabase/migrations exactly once, then executes role-based and concurrent-claim assertions. CI initializes its empty stack outside the checkout to prevent automatic double application. Also verify the 028-to-029 receipt backfill with synthetic sent records.
3. After those checks pass and rollout is authorized, apply **029 only** through the linked SQL interface. Historical three-digit filenames are not configured CLI migration history; do not blindly use db push. Regenerate the deployed snapshot after successful deployment.
4. Deploy the function using the command below. It authenticates every POST with x-notification-secret.
5. Create one clearly marked synthetic active student through the Auth admin API with a confirmed synthetic email, without sending email. Use an existing valid enrollment option.
6. Configure QUEST_NOTIFICATION_SECRET, QUEST_NOTIFICATION_MODE=test, and QUEST_NOTIFICATION_TEST_OWNER_IDS=<synthetic-student-uuid>. Test mode requires a nonempty comma-separated UUID allowlist and scopes discovery, claims, retries, cleanup, and receipts. Omitted mode defaults off; invalid configuration fails closed. General delivery requires a later deliberate switch to all after acceptance. Set EXPO_ACCESS_TOKEN only if Expo enhanced push security is enabled.
7. Enable Cron and pg_net. Store the deployed function URL as quest_notifications_url and the same shared secret as quest_notification_secret in Vault. Schedule exactly one minute-level job using the SQL below.

    ./supabase/verify-local-supabase.ps1 -DatabaseUrl <loopback-postgres-url>
    supabase functions deploy quest-notifications --project-ref YOUR_PROJECT_REF --no-verify-jwt

~~~sql
select cron.schedule(
  'quest-notifications-every-minute', '* * * * *',
  $$select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'quest_notifications_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-notification-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'quest_notification_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );$$
);
~~~

SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the function runtime. Never put service keys, Vault values, or worker secrets in the mobile app or repository. See [Supabase scheduled functions](https://supabase.com/docs/guides/functions/schedule-functions).

## Runtime behavior

- Registration runs after active-student admission, on resume, hourly while active, and on native-token changes. Quest changes do not restart it. The refresh listener supplies its native token to Expo conversion and shares identical in-flight registration. A cached token still requires successful server registration before showing “Push registered on this device.” Retry forces registration.
- Denied permissions, unsupported runtimes (including Expo Go), and registration errors are distinct. Corrupt stored registrations are discarded. Logout serializes revocation before Auth removal and preserves generation checks. Offline logout and already in-flight notifications remain limitations.
- Reminders retain scheduled-start and one-hour-before-deadline timing, a 15-minute window, batches of 100, two-minute leases, and at most three send attempts. Transient errors retry exponentially. Claim identifiers and expected-status/lease guards prevent expired workers from updating replacement attempts. Current account/device, ownership, dates, and schedule are validated again before sending.
- Android reminders use a high-priority data-only push. The registered Expo background task validates the admitted device/session, permission, payload category and expiry, then presents one local notification on the quests channel with native Open/Complete buttons. Foreground handling suppresses the raw data message. A top-level FCM title/body/channelId bypasses these categories while backgrounded, so retain the data-only format. Deploy this client/task before enabling general delivery; older clients cannot present it. Android force-stop and OS background restrictions can still prevent delivery. See [Expo notification types](https://docs.expo.dev/push-notifications/what-you-need-to-know/) and [SDK 57 background tasks](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/#registertaskasynctaskname).
- Sending and receipts have independent failure boundaries. Receipts begin 15 minutes after the immutable send timestamp, reschedule missing/provider-failed checks by five minutes, and expire after 24 hours. Ordering by next-check time and ID prevents starvation. Invalid tokens are removed only if the device has not registered again since that attempt; legacy receipts without that timestamp cannot revoke a device.
- Successful receipts mean provider acceptance, **not observed phone delivery**. Counts and sanitized error codes are returned/logged without tokens or credentials. Monitor sent, retried, failed, stale, receipts_checked, and provider_accepted.
- Geofence entry retains one local notification per active account/place per hour, fresh ownership/student/place checks, offline skipping, and no exit notification. Android background location and notification permission are required.
- Open routes to the exact quest. Complete uses fresh ownership/proof/prerequisite checks and the provider's session/duplicate guards before server-authoritative completion. Effect replay cannot redispatch an already-submitted action. The server awards XP once.

## Acceptance

See the [current device verification record](ACCEPTANCE.md) for observed results and remaining checks.

Run mobile TypeScript, uncached lint, account/context tests, and the notification regression script. Type-check the function with Deno. Disposable SQL checks cover anonymous/inactive/foreign-owner denial, private tables, service-only claims, owner isolation, empty allowlists, lease recovery, stale claims, changed schedules, cancellation, retry limits, concurrent claims, and duplicate completion.

On the connected Android phone:

1. Install the development APK. Start Metro with the commands below, then open the development client.
2. Sign in only as the synthetic student, grant notification permission, and confirm both the screen status and private server registration row.
3. Send a direct synthetic push and observe it on the phone. Create scheduled quests and verify worker tickets, successful provider receipts, and actual phone delivery.
4. Verify foreground/background/cold-start body/Open/Complete, duplicate taps, proof changes, prerequisites, offline recovery, permission denial/re-enabling, logout/account switching, and geofence entry/cooldown/exit/offline behavior. Confirm one XP increment and history row despite duplicate attempts.
5. Record build ID, device/Android version, owner UUID, delivery IDs, receipt status, and observed scenarios. Keep credentials/tokens out of the record. Tickets, receipts, mocks, or an installed APK alone do not establish acceptance.

    npx expo start --dev-client --localhost
    adb reverse tcp:8081 tcp:8081

## Rollback

Set QUEST_NOTIFICATION_MODE=off and unschedule the job to stop future sends:

~~~sql
select cron.unschedule('quest-notifications-every-minute');
~~~

Retain additive migration 029 and the existing mobile RPC interfaces. General delivery stays disabled until device acceptance is complete.
