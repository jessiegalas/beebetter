# Supabase guidance

## Identity & Stack

PostgreSQL/Auth/Storage backend: RLS, grants, SECURITY DEFINER RPCs, history triggers, and notification Edge Function.
Read [root rules](../AGENTS.md) first. Numbered SQL lives in `migrations/`; do not assume configured CLI migration support.

## Strict Guardrails

- For database structure, tables, columns, relationships, RPCs/functions, triggers, RLS policies, grants, indexes, or other PostgreSQL/Supabase schema details, inspect relevant definitions in [the current deployed `public` schema snapshot](../docs/agent/db-schema.sql). Do not preload the entire file or read it for unrelated tasks.
- Prefer the snapshot over older documentation for deployed `public` structure. Numbered migrations remain the source of historical change intent and rollout order; inspect relevant migrations and replacement definitions in numeric order before changing behavior.
- NEVER manually edit `docs/agent/db-schema.sql` during normal feature work or use it as a replacement for migrations. Regenerate it from the hosted Supabase database after schema changes are deployed; never expose secrets or connection credentials.
- Add the next unused three-digit migration with transactional style and explicit security declarations; 028 already exists.
- ALWAYS preserve restricted SECURITY DEFINER search paths and explicit revokes/grants.
- ALWAYS test authorization with unprivileged roles; owner/service-role success does not prove RLS.
- Keep `complete_quest` row locks, active-account/status/prerequisite/proof checks, atomic progression/history, and idempotency.
- ALWAYS preserve nullable legacy category IDs, compatibility projections, enrollment composite FKs, and event-time facts.
- Keep case changes/withdrawal in their locked, authorized RPCs with event inserts.
- NEVER delete Storage metadata directly; proof cleanup requires Storage API deletion and confirmed success.
- Keep push device/delivery tables private and delivery claims service-only.
- Validate clean installs and legacy upgrades/backfills; apply authorized migrations in order, each succeeding before the next.

## Commands

There is no package manifest/npm test command here. From the root, only on an explicitly authorized disposable stack:

```powershell
./supabase/verify-local-supabase.ps1 -DatabaseUrl <local-db-url>
```

The runner mutates the database and currently reads old flat SQL paths; zero applied migrations is not validation.
Read [testing](../docs/agent/testing.md) for prerequisites/path mismatch and the removed account-access suite.

## Documentation Map

Read only for the task; paths are relative to this directory.

- Current deployed `public` schema definitions (only for schema-related tasks) → [schema snapshot](../docs/agent/db-schema.sql); contracts/history/rollout → [database contracts](../docs/agent/database-contracts.md) and relevant numbered migrations.
- Completion/proof/category/progression/history → [quest system](../docs/agent/quest-system.md).
- Signup/semesters/enrollment/Auth hook → [enrollment](../docs/agent/enrollment.md).
- OSAS/reporting/cases/privacy → [admin and OSAS](../docs/agent/admin-osas.md) and [privacy and security](../docs/agent/privacy-security.md).
- Push registration/claims/delivery → [location and notifications](../docs/agent/location-and-notifications.md).
- Disposable regressions/coverage gaps → [testing](../docs/agent/testing.md); operational limits → [known limitations](../docs/agent/known-limitations.md).
