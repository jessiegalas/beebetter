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

- Root `README.md` is minimal; `admin/README.md` describes older unpaginated access superseded by 022.
- Former `SYSTEM_DIAGNOSTIC.md` and `PHASE_6_VERIFICATION.md` described the 001-015 era, including issues later addressed; both are absent in the current tree. The removed mobile navigator is not active architecture.
- Former `mobile/CONTEXT_AWARE.md` predates server-enforced prerequisites/current candidate retrieval and has an incomplete database-test list. Former `mobile/STUDENT_REGISTRATION.md` stops at 025 and omits later migrations/separate Auth hook activation. Both are absent in the current working tree; do not route tasks to them.
- Former `DEPLOYMENT.md` described flat SQL paths and 001-027; it, `DATABASE_NORMALIZATION_AUDIT.md`, and `ACCOUNT_ACCESS_VERIFICATION.md` are absent. The current tree has numbered files under `supabase/migrations/` and 028 plus a notification Edge Function. Use [database contracts](database-contracts.md) and the [function README](../../supabase/functions/quest-notifications/README.md), then confirm actual deployment. Recover relevant historical procedures/preflight queries from Git only when needed; verify against current code.
- The old three-quest local 18:00 reminder description is superseded by cloud registration and schedule/deadline push in current source. See [location and notifications](location-and-notifications.md).
- `verify-local-supabase.ps1` and the optional PGlite fixture still read old flat paths; the runner can apply zero migrations. The former real database account-access suite `supabase/test_account_access.cjs` is also absent. Current full-chain/broader SQL regression coverage is not established; see [testing](testing.md).

## Operational readiness

Source alone cannot establish configured Auth/email redirects, hook activation, approved active-semester sections, explicit admin/OSAS grants, private Storage, an operated proof-cleanup worker, native background-location correctness, or deployed push credentials/function/Cron.

Proof cleanup has no checked-in worker; notification delivery does have an Edge Function but requires separate operational setup. Push is best effort, with offline token-revocation and in-flight delivery limitations. UI report dates hardcode Asia/Manila while SQL reads configuration; inspect both before changing timezone policy. Do not describe old audit results or source availability as current operational verification.
