# Known limitations and documentation caveats

Read for affected behavior before relying on old documentation or asserting production readiness. These are investigation boundaries, not authorization to fix unrelated issues. Retain uncertain concerns until reproduced against current provider/RPC/source flow.

## Data and recommendation boundaries

- Mobile loads the newest 100 completion events and all non-completed candidates in 200-row pages. All-time totals use a summary RPC; history-dependent ranking sees only loaded recent history. Offset RPCs reject offsets above 100,000.
- Migration 023 excludes completed quests from candidates, but ranking checks prerequisite completion in its candidate map. Completed prerequisites may appear unavailable despite history. Reproduce through provider/RPC flow, not only engine fixtures containing completed quests.
- The board has a completed filter, while candidate data excludes completed rows; separate history is not merged into that list.
- Ranking treats rejected quests as actionable, but `complete_quest` accepts only active quests. Do not weaken completion authorization to match this UI discrepancy.
- Progress-summary category columns cover four defaults even though mobile permits private categories.
- Wellness/support history reads are not paginated. Notification routing/account-switch cleanup still requires device verification when touched.
- Optional-motivation and support-status reporting subgroups lack independent five-contributor checks for every nested metric. Review privacy before extending disclosure; do not claim comprehensive subgroup suppression.
- Pre-migration deleted quests and enrollment changes cannot be reconstructed. Server-controlled progression does not establish that all reward-policy abuse is prevented.

## Historical documentation

- Older removed audits/setup guides describe earlier migration chains, flat SQL paths and superseded clients. Use [database contracts](database-contracts.md), [testing](testing.md) and the [notification function README](../../supabase/functions/quest-notifications/README.md). Recover historical procedures from Git only when needed and verify them against current source and deployed definitions.
- The old three-quest local 18:00 reminder description is superseded by cloud registration and schedule/deadline push in current source. See [location and notifications](location-and-notifications.md).
- `verify-local-supabase.ps1` reads numbered files from `supabase/migrations/` and fails on zero files. Only the optional PGlite fixture still uses old flat paths. The former real database account-access suite is absent; available SQL suites and unverified coverage are documented in [testing](testing.md).

## Operational readiness

Source alone cannot establish configured Auth/email redirects, hook activation, approved active-semester sections, active admin roles, private Storage, an operated proof-cleanup worker, native background-location correctness, or deployed push credentials/function/Cron.

Proof cleanup has no checked-in worker; notification delivery does have an Edge Function but requires separate operational setup. Push is best effort, with offline token-revocation and in-flight delivery limitations. UI report dates hardcode Asia/Manila while SQL reads configuration; inspect both before changing timezone policy. Do not describe old audit results or source availability as current operational verification.
