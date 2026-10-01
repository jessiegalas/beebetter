# Location, time, and notifications

Read for GPS/geofencing, scheduling, reminders/actions, native permissions, or account-switch cleanup. Paths are repository-relative. Current notification code includes pre-existing working-tree changes; source presence does not establish deployment.

## Location and scheduling

- `mobile/src/context/location-context.tsx` coordinates `use-user-locations.ts`, `use-current-location.ts`, and `use-geofencing.ts` in `mobile/src/hooks/`.
- Background tasks record entry/exit through `mobile/src/lib/geofence-events.ts`; they are not continuously running ranking services. Ranking evaluates each quest's own place and ignores GPS/events older than five minutes.
- Background permission denial must not disable foreground GPS. Never use deprecated `is_nearby` as live proximity. Preserve overlapping-region, stale/unknown-location, resume, and logout handling.
- Ranking refreshes every 30 seconds active/on resume; user data and location refresh on a 60-second active cadence/on resume.
- `mobile/src/lib/quest-time.ts` converts local schedule/deadline inputs to timestamps. Preferred time follows device time and does not create recurrence. SQL rejects newly assigned past dates but permits unchanged overdue dates.
- Schedule/location influence recommendations; prerequisites, active status, and proof are enforced by `complete_quest`.

## Current notification contract

`mobile/src/lib/quest-notifications.ts` now registers Android Expo push tokens via `register_quest_push_device` (028) and removes legacy quest schedules. It no longer schedules up to three quests at local 18:00. Preserve fresh session/generation checks and serialized registration/logout cleanup.

The [notification function README](../../supabase/functions/quest-notifications/README.md) owns deployment, credentials, worker timing/retries/retention, rollback, and acceptance details. Current behavior includes:

- One cloud reminder at scheduled start and one an hour before deadline; absolute timestamps, no recurrence or blanket 18:00 alerts. Worker catch-up is limited to 15 minutes; unscheduled quests have no timed push.
- Private devices/deliveries, authenticated owner registration, and service-only claims. Cron/function/EAS/FCM configuration is separate from adding source files. Delivery is best effort; ambiguous sends may duplicate notifications, but completion must remain idempotent.
- Android geofence entry can produce one local notification for an active quest at the saved place, with a one-hour account/place cooldown. It checks current owned quests and active student/place state; offline entries are skipped and exits do not notify. Background location and notification permission are required.
- Open routes to exact quest details for proof/prerequisite checks; Complete brings the app forward and submits an eligible quest without another confirmation. Fresh ownership/status/proof checks and `complete_quest` remain mandatory, even for old payloads. Other-account actions are ignored; signed-out users must sign in.
- Logout attempts token revocation before Auth credentials are removed and clears local scheduled/delivered notifications. Offline revocation and in-flight sends remain limitations; verify account switching on hardware.
- The notifications screen shows current quests/recent completion activity, not a persisted read/unread inbox. OS notifications retain Android styling/action categories.

Android Maps requires `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` and native configuration. Expo Go/web cannot establish background geofencing or push acceptance. Use [testing](testing.md) for hardware checks; former `ACCOUNT_ACCESS_VERIFICATION.md` is absent in the current tree.
