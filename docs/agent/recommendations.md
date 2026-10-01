# Recommendations and discovery

Read for ranking, displayed reasons, candidate retrieval, wellness/location context, or effectiveness events. Paths are relative to `mobile/`.

- `src/lib/quest-priority.ts` is the pure deterministic engine. `src/context/quest-priority-context.tsx` supplies quests, history, goal, numeric wellness context, saved places, GPS/geofence events, and time; Home and Quests share it.
- `src/lib/quest-discovery.ts` owns independent display filters. `src/lib/quest-suggestions.ts` contains creation ideas, not rankings of saved quests.
- Preserve stable ordering, visible reasons, stale/unknown-location handling, and small wellness adjustments within existing tiers. Private notes/reflection text are deliberately excluded.
- Ranking ignores GPS/events older than five minutes and evaluates each quest's own place. Never use deprecated `is_nearby` as live proximity.
- Active/resume ranking refreshes every 30 seconds. Background geofence tasks record events; they do not continuously rank quests.
- `src/lib/recommendation-events.ts` records exposure/selection/dismissal through migration 023's RPC. Reason-code changes must match its allowlist. Completion attribution is server-generated.

Candidates exclude completed quests (023); recent history is separately loaded and bounded. Preserve server completion rules when investigating ranking disagreements. Read [known limitations](known-limitations.md) for completed-prerequisite, completed-filter, rejected-status, and history-bound issues; reproduce through provider/RPC flow, not just engine fixtures with completed quests.
