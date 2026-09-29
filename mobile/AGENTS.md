# Mobile guidance

Read [the root guide](../AGENTS.md) first. Paths here are relative to `mobile/` unless prefixed with `../`.

## Entry points and ownership

- `package.json` uses `expo-router/entry`. `src/app/_layout.tsx` nests UserData, Location, and QuestPriority providers around AuthGuard and the router stack. AuthGuard redirects by session presence; database active-account checks remain authoritative.
- `src/app/(tabs)/_layout.tsx` delegates to `src/components/app-tabs.tsx` (native tabs) or `src/components/app-tabs.web.tsx` (Expo Router UI). Active tabs: Home (`index`), Quests, Skill Tree, Profile. Other stack routes: auth, notifications, add-quest, manage-locations, wellness-check-in, self-management-reflection, wellness-history, support-requests.
- `src/context/user-data-context.tsx` owns session/profile/quest state, RPC reads, mutations, proof uploads, notification responses, refreshes, and sign-out. `src/hooks/use-user-data.ts` is a compatibility re-export, not another state implementation.
- `src/supabase.ts` handles the client, AsyncStorage session persistence, and web-rendering guards. `app.config.js` extends `app.json` with the Android Maps key; `eas.json` defines build profiles. Do not expose environment values in logs.
- Use the existing `@/` aliases, `src/constants/theme.ts`, and common components. Preserve `.web.tsx` alternatives, including date/time controls. Before writing Expo-dependent code, read the versioned SDK 57 documentation at https://docs.expo.dev/versions/v57.0.0/ (the repository's existing Expo guidance).

## Workflows and contracts

**Registration and enrollment:** `src/app/auth.tsx` sends normalized student metadata to Supabase Auth signup. SQL `handle_new_user` creates profile/student rows; later validation triggers resolve enrollment against active-semester sections. `src/components/student-information-fields.tsx`, `src/hooks/use-enrollment-options.ts`, and `src/lib/student-validation.ts` drive form choices and validation. Profile edits call the provider's student update and display-name update. The admin app imports this same pure validation module: do not add React Native or environment-dependent imports to it. Preserve unchanged legacy fields during unrelated edits; do not invent catalogue entries or normalize old history wholesale.

**Quests and progression:** `src/app/add-quest.tsx` serves both creation and editing via its `id` parameter; `src/hooks/use-quest-categories.ts` loads shared/private categories. The provider writes permitted quest fields directly under RLS. Clients still send category text; migration 026 resolves server-controlled `category_id`. Completion uploads to private `quest-proofs` at a user/quest-prefixed path, calls `complete_quest`, and reloads server state. Preserve duplicate-completion guards, error handling, and failed-upload cleanup; referenced proofs cannot be deleted by students. Never award XP or set completion state locally. `calculateLevel` is a display calculation; SQL is progression authority. All-time totals/category summaries and the newest 100 history events are separate reads.

**Recommendations:** `src/lib/quest-priority.ts` is the pure deterministic engine. `src/context/quest-priority-context.tsx` supplies quests, history, goal, numeric wellness context, saved places, GPS/geofence events, and time; Home and Quests share it. `src/lib/quest-discovery.ts` implements independent display filters. `src/lib/quest-suggestions.ts` contains creation ideas, not saved-quest rankings. Preserve stable ordering, visible reasons, stale/unknown-location handling, and small wellness adjustments within existing tiers. Private notes/reflection text are deliberately excluded. `src/lib/recommendation-events.ts` records exposure/selection/dismissal through migration 023's RPC; reason-code changes must match its allowlist. Completion attribution is server-generated.

**Location and time:** `src/context/location-context.tsx` coordinates `src/hooks/use-user-locations.ts`, `src/hooks/use-current-location.ts`, and `src/hooks/use-geofencing.ts`. The background task records entry/exit in `src/lib/geofence-events.ts`; it is not a continuously running ranking service. Ranking ignores GPS/events older than five minutes and evaluates each quest's own place. Background permission denial must not disable foreground GPS. Never use deprecated `is_nearby` as live proximity. Ranking refreshes every 30 seconds while active/on resume; user data and location refresh on a 60-second active cadence/on resume.

`src/lib/quest-time.ts` converts local scheduled/deadline inputs to timestamps; preferred time follows the device clock and does not create recurrence. SQL rejects newly assigned past dates but permits unchanged overdue dates. Schedule and location influence recommendations, while prerequisites, active status, and proof are enforced on completion. `src/lib/quest-notifications.ts` currently schedules up to three active quests at the next local 18:00, not at each quest's schedule/deadline, and cancels existing scheduled notifications first. Preserve that distinction when describing reminders.

**Wellness and support:** The wellness, reflection, history, and support routes use `src/lib/wellbeing-data.ts`. Check-ins upsert by student/date, reflections may reference an owned quest, and requests require consent. Raw records stay owner-scoped; numeric context reads use explicit projections. Student withdrawal calls an RPC and retains case history. These are voluntary self-reports, not clinical diagnosis or verified improvement.

## Validation

Run from this directory:

```powershell
npx tsc --noEmit
npm run lint
npm run test:context
npm run test:students
```

Tests are Node `.cjs` scripts transpiling pure TypeScript, not a Jest/device suite. For shared student-validation edits also run the admin checks. For native changes, test foreground allowed/denied, background denied, stale GPS, overlapping regions, resume, sign-out cleanup, and proof-required completion on physical hardware. Android Maps requires `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` and the native configuration; Expo Go/web cannot establish background-geofencing correctness.

`scripts/test-context-database.cjs` requires optional external PGlite (not an app dependency), accepts its module path as an argument, and executes selected older migrations through 011 using fake Auth/Storage. Do not run it during no-migration tasks or treat it as current-schema coverage. See [Supabase guidance](../supabase/AGENTS.md).

## Investigate before relying on these behaviors

- Migration 023 excludes completed quests from candidates, while the ranking engine checks prerequisite completion only in its candidate map. Completed prerequisites can therefore appear unavailable despite completion history; reproduce with the provider/RPC flow, not only engine fixtures containing completed quests.
- The quest board still has a completed filter, but provider candidates exclude completed rows. Completion history is separate and is not merged into that candidate list.
- Ranking treats rejected quests as actionable; the current completion RPC accepts only active quests. Do not weaken the RPC to accommodate this UI mismatch.
- Progress-summary category columns cover the four defaults, although mobile permits private categories. History-dependent ranking uses only the loaded recent history.
- Wellness/support history reads are not paginated, unlike quest/admin lists. Notification routing and account-switch cleanup need device verification when touched.

Read [CONTEXT_AWARE.md](CONTEXT_AWARE.md) and [STUDENT_REGISTRATION.md](STUDENT_REGISTRATION.md) for background with the root guide's staleness caveats.
