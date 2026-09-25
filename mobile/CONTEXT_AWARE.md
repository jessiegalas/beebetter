# Context-aware quests

## Setup

Apply `supabase/008_context_aware_quests.sql` in Supabase SQL Editor after the existing migrations, before running the updated app. The migration is transactional and repeatable. It adds optional context columns, completion history, dependency validation, and the atomic `complete_quest` RPC. Existing quests and admin-created quests default to normal importance with no time constraints. Existing completed quests are backfilled into history.

The app continues to read older quest records. Saving context fields and completing quests with the new RPC require migration 008; the app reports a setup error if it is absent. No hosted database is changed by the test scripts.

## How it works

- `src/lib/quest-priority.ts` is the pure ranking engine. It ranks saved quests, not example templates.
- `QuestPriorityProvider` combines quests, history, live coordinates, saved places, geofence events and the current time. Both Home and Quests consume the same result.
- The engine combines geofence proximity/distance, scheduled or preferred time, deadlines, importance, time since the last matching activity/category, age and dependencies. Location and timing reinforce each other. Each factor is bounded; no location flag is an automatic highest priority.
- Recommended now contains strong, currently suitable matches. Up next contains weaker or upcoming matches. Other quests stay visible. Completed/pending quests are retained separately. If no strong match exists, the dashboard labels fallback items â€œTo consider.â€
- Ranking is advisory. Location, schedule and prerequisite preferences never disable manual completion. Proof requirements still apply.
- The Nearby filter uses live context, not the legacy `is_nearby` tag. Each quest is checked against its own place, including overlapping regions.
- GPS older than five minutes or too inaccurate for the saved radius is ignored. Recent geofence entry/exit events can supersede older GPS; those also expire after five minutes. Unknown location does not become a false nearby match.
- Foreground GPS works even without background permission. Native background geofencing uses the existing Expo task and saves entry/exit events; the ranking consumes them while running or on resume. Background execution remains subject to OS support and permissions. It is not a continuously running background ranking service.
- Ranking refreshes immediately when inputs change, every 30 seconds while active, and on resume. Quests/history and saved places refresh every 60 seconds while active and on resume, so remote edits work without enabling Supabase Realtime.
- Creation and editing share `add-quest.tsx` (edit via its `id` parameter). Timing fields are optional. A quest can have one scheduled instant OR a preferred time of day; deadlines are independent. Scheduled times/deadlines entered locally are converted to UTC. Preferred time follows the device's local clock, including after a timezone change. It does not create recurring quests.
- Completion is one database transaction: status, timestamp, history, XP and level. Duplicate completion calls do not award XP twice. History survives quest deletion. One optional prerequisite is supported per quest; chains are allowed, cycles and cross-owner links are rejected. Deleting a prerequisite clears the link.
- Quick-start templates remain creation ideas. They are not the saved-quest recommendation engine and never claim a live place match.

## Validation

From `mobile`:

```powershell
npm run test:context
npx tsc --noEmit
```

The database integration test runs actual migrations 001â€“003 and 008 in an isolated PGlite PostgreSQL runtime with minimal Supabase auth/storage fixtures:

```powershell
# From the THESIS workspace root; keeps the optional test dependency outside the app.
npm install --prefix .context-validation --no-save --package-lock=false --ignore-scripts @electric-sql/pglite
cd beebetter/mobile
node scripts/test-context-database.cjs ../../../.context-validation/node_modules/@electric-sql/pglite
```

The database test covers migration/backfill compatibility, all four location/time combinations, edits/clearing fields, constraints, dependency cycles/ownership, atomic completion, proof checks, history persistence, RLS and repeated migration. PGlite serializes queries; it does not simulate concurrent PostgreSQL connections.

On a physical device, verify: permission allowed/denied, background denied with foreground allowed, entering/leaving overlapping saved regions, disabling a place, resume after the scheduled time, selecting a lower-ranked quest, proof completion, and editing/removing time/place preferences. Verify hosted Supabase with a test account after applying the migration.
