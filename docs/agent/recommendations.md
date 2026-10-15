# Recommendations and discovery

Paths below are relative to mobile/. Existing server completion/proof/XP checks remain authoritative.

## Data and selection
- Workspace retrieval pages non-completed candidates, then batches `student_get_recommendation_facts(quest_ids)` (037) in groups of 200. Candidate and fact versions must match; one complete retry handles edits during retrieval. Failed facts leave candidates browsable with an explicit context error.
- Facts resolve prerequisite status from current owned quests and activity/category recency from full completion history. The 100-row UI history does not establish eligibility or feed ranking.
- Recommendation evaluation samples current wall time whenever source data changes, including between 30-second ticks; fresh reads must never look future-dated merely because the previous tick is older. GPS/geofence timestamps never advance this clock.
- Provider state tracks successful candidate, fact, profile and saved-place read times. Five-minute expiry prevents stale immediate recommendations; stale goal/activity facts contribute no boost.
- `quest-priority.ts` preserves deterministic scoring and emits structured evidence, at most three positive explanations, and independently visible constraints. GPS/events must be recent and valid; a newer exit means outside with distance unknown. Device timestamps never advance the clock.
- `quest-discovery.ts` selects Recommended now / Upcoming / Other options / Needs revision for both screens. Starts more than 30 minutes ahead cannot be recommended now. Unknown/incomplete prerequisites, pending review and completed quests are excluded.
- `recommendation-reasons.ts` formats evidence in device-local time. Goal matching excludes English/Filipino function words and names the shared lexical term; it makes no semantic alignment claim.
- Home uses a title/XP header, separator, and footer with a short evidence-based explanation link and View quest action. Full descriptions, reasons, constraints, and refresh diagnostics live in the Why this quest sheet. Quest cards keep explanations inside their accordion. Shared refresh errors live in a separate collapsed status disclosure, and saved-place failures only affect status when candidates require a place.
- Wellness remains disabled. Private notes/reflection text never enters ranking.
- `recommendation-snooze.ts` stores one-hour snoozes per account, serializes hydration/updates and supports Undo/Restore. Home and Quests wait for hydration. Snoozed quests remain in All Quests.

## Measurement
- `MOBILE_RECOMMENDATION_MEASUREMENT_ENABLED` defaults to false. Hooks and provider create no measurement timers/events, queue writes, or delivery while disabled. Existing queues remain intact; enabling prunes expired entries before retry. Ranking and snooze remain available.
- Migration 038 introduces separate `recommendation_events_v2` and a new recorder RPC. Keep legacy events and contracts unchanged; do not pool v1 and v2 statistics.
- A card qualifies for exposure at >=50% visibility for one continuous second while focused/foreground. FlatList supplies actual viewability; Home measures intersection with its clipped scroll viewport. Modals disable underlying exposures.
- Impression identity changes with rank, group, quest version, reasons or constraints. Direct actions remain recordable before exposure qualification.
- Persisted account queues are bounded to 100 events/24 hours. Foreground entry, web online events, successful workspace reads and 30-second active retries resume delivery. Native connectivity recovery is detected through successful reads/retries without adding an SDK dependency.
- RPC validation fixes metadata per impression and deduplicates owner/impression/event. Invalid/deleted events are dropped; transport failures remain queued. Development diagnostics contain no context text.
- Migration 039 adds the service-role-only `recommendation_completion_attributions_v2` view: one row per durable completion, with nullable latest preceding exposure within the inclusive 30-day window and descending event ID tie-breaking. Matching uses owner/quest/event time, so accepted late deliveries revise attribution at query time. Deleted-quest and unmatched histories remain unattributed.
- This view is the authoritative rules-v2 completion metric. Record report extraction time. Existing v2 completion events are preserved ingestion-time observations; never add them to view counts or pool with legacy metrics. Attribution remains observational.
- Payloads contain IDs, surface, group, rank, version, reason codes and timestamps; no precise location, goal text, rendered explanation or private reflection text.

## Validation and rollout
Run `npm run test:context`, `npm run test:workspace`, `node scripts/test-recommendation-regressions.cjs`, completion/UI/auth checks, TypeScript and lint.
Deploy 037, 038, then 039 before dependent clients; verify clean installs and upgrades on an explicitly authorized disposable stack. Run `supabase/tests/recommendations.sql` after 039 with an active registration option; fixtures roll back. This review does not establish hosted deployment or database execution.
Check hardware focus/resume, navigation overlays, card clipping, denied background location, enlarged text/dark mode, offline recovery, one-hour expiry, account switch and proof completion.
Keep measurement disabled until database attribution/authorization/concurrency and device/web visibility checks pass; enable only in a separate reviewed release change.
See [recommendation evaluation](recommendation-evaluation.md) for user validation.
