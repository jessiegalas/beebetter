# BeeBetter repository guidance

## Task Execution & Autonomy
- For implementation or fix requests, carry the authorized work through implementation and relevant verification. Do not stop at a proposed plan when you can proceed.
- Make reasonable assumptions for routine, reversible decisions. Ask a focused question when missing information materially affects correctness, scope, or authorization.
- Continue with authorized read-only actions, local worktrees, branch edits, and appropriate tests without repeatedly asking.
- Before requesting approval, finish the preparation that is already authorized and present a concrete, reviewable result.
- Respect required approval gates. Ask before destructive, irreversible, or otherwise unauthorized actions.
- Avoid boilerplate warnings about hypothetical risks. Explain concrete blockers or material risks when relevant.

### Instruction Conflicts
- Explicit user instructions take precedence over conflicting skill guidelines, subject to higher-priority instructions and actual permission boundaries.
- If a skill causes a pause or deviation, identify the file and relevant rule, and explain whether it is an explicit requirement or your interpretation. Continue any unaffected authorized work.

### Style & Output
- Lead with the result. Use plain language, active voice, and concise paragraphs. Include technical details that help assess the work.
- Use lists when they improve readability; avoid repetitive transitions and stock phrases such as "it's worth noting", "delve", "leverage", and "Bottom line".
- Report what changed, what was verified, and any remaining uncertainty.

### Verification
- Match verification to the scope and impact of the change. Complete required checks; expand testing when a concrete unresolved concern justifies it.

## Identity & Stack

BeeBetter provides student quests/XP, contextual recommendations, voluntary wellness/reflections, and OSAS support/reporting.
Terminology is authoritative in [GLOSSARY.md](GLOSSARY.md): `/admin` is exclusively OSAS, and every active admin receives reporting and support access.
This is the repository root; the surrounding THESIS directory is not. Mobile: Expo/React Native; admin: React/Vite; backend: Supabase PostgreSQL/Auth/Storage.
Each app owns its package/lockfile; there is no root npm workspace.

## Frontend design

For any frontend design or UI change, ALWAYS read [frontend design instructions](docs/agent/frontend-design.md) and the affected app guide. Follow user references closely; favor clean, minimal layouts with whitespace and typography over repeated boxed cards.

## Strict Guardrails

- ALWAYS read the affected [mobile](mobile/AGENTS.md), [admin](admin/AGENTS.md), or [Supabase](supabase/AGENTS.md) guide; read all affected scopes for cross-module work.
- NEVER treat client guards as authorization; database RLS/RPC/grants/constraints are authoritative.
- NEVER bypass server completion/progression or substitute weaker direct writes for missing RPCs.
- NEVER commit credentials, environment files, or backups; keep privileged keys/passwords out of clients and logs.
- ALWAYS preserve enrollment periods/labels, quest completion/lifecycle snapshots, support events, and report audits.
- ALWAYS derive OSAS reporting/support access from active admin status in the database; preserve suppression and audited exports.
- NEVER expose raw wellness text, precise locations, or identifiable case details through aggregate reports.
- ALWAYS check both clients when changing RPC signatures/results, statuses, category labels, shared validation, or nullable legacy contracts.
- NEVER rewrite applied migrations. Do not execute migrations (including local runners), deploy, reset databases, or merge without explicit authorization.
- ALWAYS verify claims against current code and, for deployed `public` schema details, the current schema snapshot; inspect relevant migrations before changing database behavior. Documentation and old audits do not establish deployed behavior.

Efficiency rules:

- Keep investigation proportional to the task; prefer targeted searches over repository-wide scans.
- Make the smallest safe diff and preserve behavior unless requested; report observed unrelated issues without investigating/fixing them.
- Update documentation only when requested or behavior/contracts changed.
- Batch related edits before validation; run targeted checks first.
- Reassess scope before a large cross-module diff or editing more than eight files.
- Avoid unrelated formatting, abstractions, or dependency upgrades.

## Commands

Run from this repository root:

```powershell
git diff --check
```

Use affected scoped commands; check both apps for shared contracts. Report actual results and skipped checks.
For documentation-only work, inspect the diff and links; do not run broad application suites or migrations.
Use `npm ci` inside an app only when dependency setup is needed and authorized by task scope.

## Documentation Map

Read only the documents needed for the task; do not preload this directory.
Paths below are relative to this repository root.

- Cross-module ownership/file lookup → [architecture](docs/agent/architecture.md).
- Database structure/tables/columns/relationships/RPCs/functions/triggers/RLS/grants/indexes → inspect relevant definitions in the [current deployed `public` schema snapshot](docs/agent/db-schema.sql) and [database contracts](docs/agent/database-contracts.md); read relevant numbered migrations before changing behavior. Do not preload the snapshot or read it for unrelated tasks.
- Registration/profile/semesters/history → [enrollment](docs/agent/enrollment.md).
- Mobile routing/session/native configuration → [mobile runtime](docs/agent/mobile-runtime.md).
- Quest completion/proof/XP/streaks → [quest system](docs/agent/quest-system.md).
- Ranking/discovery/recommendation events → [recommendations](docs/agent/recommendations.md).
- GPS/geofencing/scheduling/reminders → [location and notifications](docs/agent/location-and-notifications.md).
- Admin management/OSAS/reporting/support → [admin and OSAS](docs/agent/admin-osas.md).
- Sensitive data/access/report disclosure → [privacy and security](docs/agent/privacy-security.md).
- Check selection/device/database coverage → [testing](docs/agent/testing.md).
- Affected known issues/old docs/readiness → [known limitations](docs/agent/known-limitations.md).
