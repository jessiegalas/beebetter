# Recommendation validation and user evaluation

## Technical release checks
1. On an authorized disposable stack apply migrations 037, 038, then 039, in the existing chain. Run the rollback-only recommendations SQL assertions as a privileged test runner; checks switch to unprivileged roles.
2. Test a fresh install and an upgrade with existing legacy recommendation events. Validate completed prerequisites, full-history aggregates, unauthorized/cross-owner/inactive denial, reason allowlists, immutable impression metadata, and idempotent event insertion.
3. On hardware and web test Home and board clipping, 49%/50% visibility, one-second timing, scroll-away, focus loss, overlays, background/resume, route details, large text and dark mode. No exposure may be emitted for hidden cards.
4. Simulate offline delivery and recovery, restart during snooze, expiry at one hour, Undo/Restore, rapid taps, account changes during reads/saves and changed prerequisite/proof requirements. Preserve server completion validation.
5. On two disposable database sessions, insert a completion and its preceding exposure concurrently for the same synthetic owned quest, exercising both commit orders. After both commit, the canonical view must return exactly one row for that history ID and the correct exposure. Repeat with multiple out-of-order exposures and equal event timestamps; highest event ID wins ties. A statement started before a concurrent commit may use its ordinary database snapshot; the next query must reflect both commits.
6. Test two concurrent same-impression requests: identical metadata must deduplicate; conflicting metadata must reject one request. Test independent impression IDs and account isolation.
7. Treat automated client mocks as client evidence; record database/device results separately. Deployment, disposable database execution and participant recruitment require their own authorization.

Use only `recommendation_completion_attributions_v2` for v2 completion attribution; include unmatched completions and record extraction time. Late accepted deliveries can revise results. Stored v2 completion events remain historical ingestion-time records and must not be counted again.

Measurement defaults to disabled. Test enabled behavior through explicit test fixtures and an authorized validation build. Leave the production flag false until database and hardware/web checks pass; enable in a separate reviewed release change. Retained queues are pruned to the existing 100-event/24-hour limits when delivery resumes.

## User study protocol
Use consenting student participants and their voluntarily supplied supported context. Do not infer health, free time or preferences the app does not collect.
Compare rules-v2 against a deterministic deadline/importance baseline over the same eligible candidates. The baseline orders by overdue, deadlines within two hours, deadlines within one day, high importance, creation time and ID; it shares prerequisite/status eligibility and labels.
Counterbalance order by participant and use the same candidate/context snapshot for paired relevance and explanation tasks. Keep baseline behind a study harness; do not change ordinary production ranking.
For each choice ask for relevance (1-5), explanation accuracy (1-5), understanding of the actual trigger, and whether the quest is feasible now. Measure time to choose, selection, snooze and optional later completion.
Primary outcomes: within-participant relevance difference and correct explanation comprehension. Secondary outcomes: choice time, snooze rate and completion within 24 hours among qualified exposures.
Report participant count, missing context, source failures, exposure/queue delivery exclusions, uncertainty intervals, and per-surface results. Report observational attribution separately from causal comparisons.
Pilot to estimate variance and set the sample-size requirement before a confirmatory study. Do not claim proven effectiveness from clicks, a small pilot, or attributed completion alone.
