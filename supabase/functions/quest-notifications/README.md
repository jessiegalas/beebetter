# Quest notifications: deployment and verification

Android uses Expo Push (FCM), with Supabase as the scheduling authority. The mobile app registers a token using the authenticated `register_quest_push_device` RPC. Migration `028_quest_notifications.sql` adds private device and delivery tables and the service-only claim RPC. No hosted changes are made by adding these files.

## Enable delivery

1. Validate migration 028 on an explicitly authorized disposable Supabase stack containing migrations 001–027, then apply it to staging before releasing the mobile client. These migrations are flat SQL files; do not run `supabase db push` against this directory.
2. Register Firebase's Android application with package `com.anonymous.beebetter`. Set the mobile build environment variable `GOOGLE_SERVICES_JSON` to the path of its `google-services.json` file (an EAS file environment variable can provide this path). `mobile/app.config.js` reads it. Upload the matching **FCM v1 service-account key to EAS credentials**, not to mobile assets or public environment variables. Keep credential files outside the repository. See [Expo FCM setup](https://docs.expo.dev/push-notifications/fcm-credentials/).
3. Set Edge Function secret `QUEST_NOTIFICATION_SECRET` to a strong random value. Set `EXPO_ACCESS_TOKEN` if Expo enhanced push security is enabled. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are supplied by the Supabase function runtime. No service-role key belongs in the app.
4. From the repository root, after deployment is authorized, deploy `supabase functions deploy quest-notifications --project-ref YOUR_PROJECT_REF --no-verify-jwt`. The function authenticates every POST using `x-notification-secret`; disabling the gateway JWT check does not make sending public.
5. Enable Supabase Cron and pg_net. Store `quest_notifications_url` (the full deployed function URL) and `quest_notification_secret` in Supabase Vault. Schedule the SQL below once per minute. The Vault secret must match the function secret. See [Supabase scheduled functions](https://supabase.com/docs/guides/functions/schedule-functions).
6. Build/install an Android development or release build with those credentials. Sign in as an active student and grant notification permission. Expo Go is not an acceptance environment.

```sql
select cron.schedule(
  'quest-notifications-every-minute',
  '* * * * *',
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
```

## Behavior and limits

- One cloud reminder at scheduled start and one an hour before deadline. Absolute timestamps handle timezone conversion; no daily recurrence or blanket 18:00 alerts. The worker catches up at most 15 minutes and never backfills older reminders. Unscheduled quests receive no timed push.
- Each event/device is unique. Workers claim up to 100 with row locks and two-minute leases; send failures retry at most three times. Provider/network failures can still cause duplicate delivery after an ambiguous send; completion remains idempotent in `complete_quest`. Push delivery is best effort, not an exact-time alarm.
- Tickets are checked for receipts after 15 minutes. A successful receipt means provider acceptance, not that a student saw the message. Invalid tokens are removed; receipt errors and exhausted work must be monitored in `quest_push_deliveries` and function logs. Delivery rows expire after seven days and inactive device registrations after 30 days. Registration refreshes while the app is active.
- Android geofence **entry** generates one local notification for an active quest at that saved place, with a one-hour per-account/place cooldown. It fetches current owned quests and active student/place state; offline entries are skipped. Background location and notification permissions are required. Exits produce no notification.
- Complete automatically brings the app forward and submits an eligible quest without another confirmation. Open brings up the exact quest details for proof or prerequisite checks. Old notification payloads cannot bypass fresh ownership/status/proof checks or the completion RPC. Signed-out users must sign in; another account's action is ignored.
- Logout attempts token revocation before removing Auth credentials and clears scheduled/delivered local notifications. Offline logout cannot revoke a cloud token until connectivity/registration recovers, and already in-flight notifications cannot be recalled. Always verify account switching on devices.
- The redesigned screen shows current quests and recent completion activity; it is not a persisted read/unread inbox. Android system notifications use OS styling and the app's action categories.

## Acceptance checks

From `mobile`: `npx tsc --noEmit`, `npm run lint`, `npm run test:auth`, `npm run test:context`, and `node scripts/test-quest-notifications.cjs`.

On an authorized disposable database, verify: anonymous/other-owner/inactive registration rejection; owner unregister; no authenticated reads of tokens/deliveries; service-only claims; scheduled and deadline events; no past backfill; overlapping claim calls; changed dates, deleted/completed quests, inactive students and token reassignment cancelling old jobs; bounded retries. Do not use owner/service-role execution to claim RLS has been tested.

On real Android hardware, test foreground/background/cold-start Open and Complete, notification body taps, duplicate taps, proof added after delivery, prerequisites, offline failure, expired Auth, token rotation, permission denial/re-enabling, geofence cooldown/exit/offline behavior, and logout/account switching. Confirm one XP award despite duplicate or concurrent completion. Inspect the layout at large text size and narrow phone widths.

Rollback: unschedule `quest-notifications-every-minute` to stop cloud sends. Retain the additive tables/RPC until all clients depending on them have been retired; do not drop historical migrations.
