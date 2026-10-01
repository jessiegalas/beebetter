# Quests, completion, and progression

Read for quest creation/editing, proof Storage, completion, XP/levels/streaks, or history. Paths are repository-relative. SQL ownership: 008, 016, 018, 020, 024, 026; latest `complete_quest` is in 018.

## Creation and editing

- `mobile/src/app/add-quest.tsx` handles creation and editing via `id`; `mobile/src/hooks/use-quest-categories.ts` loads shared/private categories. UserData writes permitted fields directly under RLS.
- Clients still send category text. Migration 026 resolves authorized server-controlled `category_id`; unmatched legacy categories may retain null IDs. Do not impose NOT NULL without reviewed correction.
- Quest location/prerequisite ownership and cycle checks are server-enforced. New/changed schedule dates use server time; unchanged overdue dates remain valid for completion.
- `mobile/src/lib/quest-time.ts` converts local schedule/deadline inputs to timestamps. Preferred time follows the device clock and does not create recurrence. Schedule/location affect ranking, not completion authorization.
- Admin creation uses four default categories and active/pending publication states. Everyone assignment inserts one owned quest per eligible active student, excluding admin identities. `admin_update_quest` cannot reassign owners and edits only active/pending quests; it does not review proof or award completion.

## Completion and history

- Only `complete_quest` awards student completion XP. It locks the owned row, checks active student/active quest, prerequisites and proof, and atomically updates status/XP with history/streak triggers. Duplicate successful completion must not award XP again.
- Mobile uploads proof to private `quest-proofs` under a user/quest-prefixed path, calls the RPC, and reloads server state. Preserve duplicate guards, errors, and failed-upload cleanup. Never award XP or set completion state locally.
- Client-writable quest `xp` is a reward field, not permission to write `profiles.total_xp` or completion status. Existing protections do not establish that every possible reward-policy abuse is fixed.
- `calculateLevel` is display logic. SQL constrains level to integer `total_xp / 100 + 1`.
- Streaks count consecutive institutional calendar completion days ending today or yesterday (default Asia/Manila). SQL recalculates on reads because cached streaks age.
- Preserve completion/lifecycle snapshots after mutable records change or quests are deleted. FK nulling/cascades do not authorize ad hoc historical cleanup.
- All-time totals/category summaries use a summary RPC; newest 100 completion events are a separate read. Candidates page all non-completed quests in batches of 200; they do not include completion history. See [known limitations](known-limitations.md) before changing filters or prerequisite ranking.

## Proof retention

Proof validation checks user/quest path, Storage object metadata, allowed MIME types, and positive size up to 10 MiB. Migration 024 blocks owner deletion of referenced objects. Migration 018 queues retired proofs after 30 days and discovers unreferenced uploads older than seven days.

A trusted external worker must delete through the Storage API and confirm success; never delete Storage metadata rows directly. No proof-cleanup worker is checked in. Preserve historical references and failed-upload cleanup separately from retention jobs. Former `DEPLOYMENT.md` documented worker operations but is absent; confirm the actual worker setup before changing retention.
