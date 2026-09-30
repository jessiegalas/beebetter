# BeeBetter repository guidance

## Start here

BeeBetter supports student self-management through quests, XP, contextual recommendations, voluntary wellness/reflections, and OSAS reporting/support. This directory is the repository root; the surrounding THESIS directory is not the application root.

Read this guide, then the relevant [mobile](mobile/AGENTS.md), [admin](admin/AGENTS.md), or [Supabase](supabase/AGENTS.md) guide before changing a module. For cross-module work, read all affected guides. Verify claims against current code and the latest numbered SQL definitions; older documentation is not schema authority.

## Scope and efficiency

For future tasks:
- Prefer the smallest safe diff that satisfies the request.
- Do not broaden into unrelated subsystems unless required for correctness or security.
- Do not update AGENTS.md, documentation, or verification reports unless the task explicitly requires it or a repository contract materially changed.
- Run targeted validation first; do not run every available test suite by default.
- Report unrelated issues instead of fixing them.
- Reassess scope before editing more than 8 files.

## Architecture and ownership

| Area | Responsibility and entry points |
| --- | --- |
| `mobile/` | Expo SDK 57, React 19.2, React Native 0.86, TypeScript 6. Expo Router enters through `mobile/src/app/_layout.tsx`; native/web tabs are separate components. |
| `admin/` | React 19.2, Vite 8, TypeScript 6 browser app. `admin/src/main.tsx` mounts `admin/src/App.tsx`; navigation is local section state, not React Router. |
| `supabase/` | PostgreSQL migrations 001-027, Auth signup trigger, RLS, column grants, RPCs, constraints, history triggers, and private Storage policies. No application API server or cleanup-worker implementation is checked in. |
| Application data | Each app has its own `src/supabase.ts` client using Supabase JS 2 and publishable credentials. Mobile combines direct owner-scoped table access with RPCs; admin management/reporting primarily uses guarded RPCs. |

There is no root npm package/workspace. Each app has its own package manifest and lockfile. One important cross-app dependency is `admin/src/AdminModals.tsx` importing pure validation from `mobile/src/lib/student-validation.ts`.

## Task-to-file map

Paths below are relative to this repository root. Follow the scoped guides for supporting files and SQL ownership.

| Task | Begin with |
| --- | --- |
| Registration/profile | `mobile/src/app/auth.tsx`, `mobile/src/app/(tabs)/profile.tsx`, `mobile/src/lib/student-validation.ts`, `mobile/src/hooks/use-enrollment-options.ts`; student writes in `mobile/src/context/user-data-context.tsx` |
| Quest creation/completion/proofs/XP | `mobile/src/app/add-quest.tsx`, `mobile/src/app/(tabs)/quests.tsx`, `mobile/src/context/user-data-context.tsx`; SQL 008, 016, 018, 020, 024, 026 |
| Recommendation ranking | `mobile/src/lib/quest-priority.ts`, `mobile/src/context/quest-priority-context.tsx`, `mobile/src/lib/quest-discovery.ts`, `mobile/src/lib/recommendation-events.ts`; SQL 023 |
| Geofencing/location/scheduling | `mobile/src/context/location-context.tsx`, `mobile/src/hooks/use-current-location.ts`, `mobile/src/hooks/use-geofencing.ts`, `mobile/src/lib/quest-time.ts`, `mobile/src/lib/quest-notifications.ts` |
| Admin students/quests | `admin/src/App.tsx`, `admin/src/admin-data.ts`, `admin/src/AdminModals.tsx`, `admin/src/AdminTables.tsx`; SQL 011, 017, 022 |
| Semesters/sections | `admin/src/SemesterManagement.tsx`, `admin/src/semester-data.ts`, `mobile/src/hooks/use-enrollment-options.ts`; SQL 025-026 |
| Wellness/reflections/student support | `mobile/src/lib/wellbeing-data.ts` and corresponding routes in `mobile/src/app/`; SQL 012-014, 016, 018 |
| OSAS reporting/cases/permissions | `admin/src/OsasDashboard.tsx`, `admin/src/osas-data.ts`, `admin/src/osas-report.ts`, `admin/src/SupportRequests.tsx`, `admin/src/OsasPermissions.tsx`; SQL 018-022 |
| Schema/authorization | `supabase/AGENTS.md`; search every migration for the table/function/policy, then inspect its latest definition, grants, callers, and triggers |

## Safe change rules

- Inspect existing implementations and identify UI, business-logic, data-access, and database owners before coding. Plan complex or cross-module changes first; prefer targeted edits and preserve behavior unless the task explicitly changes it.
- Treat RLS, RPCs, column grants, and constraints as authoritative. Client guards improve UX but do not grant permission. Never use privileged client credentials or direct writes to bypass server-controlled completion, progression, or authorization.
- Preserve historical enrollment labels, quest completion/lifecycle snapshots, support-case events, and report audits. Enrollment triggers may close the current validity period and append another; do not rewrite past enrollment facts as cleanup. History is not redundant mutable profile data.
- Keep OSAS aggregate and identifiable support permissions separate from ordinary admin access. Preserve minimum-cohort/complement suppression and audited exports; never expose raw wellness text, precise location, or case details through aggregate reporting.
- Coordinate database contracts with both clients: RPC names/arguments/results, status values, category compatibility labels, shared validation, and nullable legacy data. Do not silently replace missing RPCs with weaker direct writes.
- For schema changes, add the next numbered migration (currently 028); do not rewrite applied historical migrations. Verify existing-data backfills and compatibility with old and new clients.
- Do not execute hosted migrations, deploy, reset databases, or merge branches without explicit authorization. A task limited to review/documentation does not authorize any migration execution, including local scripts.
- Never commit credentials, environment files, or database backups. Public-prefixed environment values are bundled into clients; service-role keys and database passwords belong only in trusted server environments. Do not rely on `.gitignore` to cover every secret filename.
- Follow nearby TypeScript, hooks, component, CSS, and SQL patterns; formatting varies across files. Avoid repository-wide formatting, dependency upgrades, or new abstractions unrelated to the task. Preserve platform-specific mobile implementations and request/unmount guards.
- Run relevant regressions and report actual commands, results, warnings, and skipped checks. Do not describe old audit results as current verification.

## Validation and deployment

Run commands from the named app directory; install locked dependencies with `npm ci` only when setup is needed and within task scope.

| Directory | Checks for affected code |
| --- | --- |
| `mobile/` | `npx tsc --noEmit`; `npm run lint`; `npm run test:context`; `npm run test:students` |
| `admin/` | `npm run build` (TypeScript plus Vite); `npm run lint` (Oxlint); `npm run test:report` |
| Repository root | `git diff --check`; inspect changed-file scope and validate documentation paths |

Run both app checks when shared validation or contracts change. Run `npm run test:auth` for account/session lifecycle changes. SQL changes additionally require authorized disposable-Supabase validation and appropriate authorization/data regression scenarios; see the Supabase guide for the current testing gap. Do not use `mobile`'s template `reset-project` script as validation.

Migrations are flat `supabase/NNN_description.sql` files, applied 001 through 027 in numeric order, each succeeding before the next. Later replacements override earlier function definitions. The whole chain is not safely rerunnable. Deploy compatible database changes before dependent clients, with disposable local validation and staging first when authorized. See [DEPLOYMENT.md](DEPLOYMENT.md) for environment names, operations, and release/rollback procedures, and [DATABASE_NORMALIZATION_AUDIT.md](DATABASE_NORMALIZATION_AUDIT.md) for compatibility columns, immutable snapshots, and migration 026 anomaly checks.

## Documentation caveats and operational limits

- `README.md` is minimal. `admin/README.md` describes older unpaginated access; `SYSTEM_DIAGNOSTIC.md` and `PHASE_6_VERIFICATION.md` describe the 001-015 era, including issues later addressed. The removed mobile navigator is not an active architecture.
- `mobile/CONTEXT_AWARE.md` predates current completion restrictions and candidate retrieval: prerequisites are server-enforced, and candidates exclude completed quests. Its database-test migration list is incomplete. `mobile/STUDENT_REGISTRATION.md` stops at 025; the full current deployment includes 027 and separately configured Auth hook activation.
- `DEPLOYMENT.md` includes the loopback-only `supabase/test_account_access.cjs` suite; broader SQL regression suites are still absent. The checked-in optional PGlite script tests selected migrations only through 011, not current hardening. Full-chain execution has to be verified separately; documentation is not evidence of a deployed schema.
- Production readiness depends on configured Auth/email redirects, approved active-semester sections, explicit admin/OSAS grants, private Storage, a separately operated proof-cleanup worker, and real-device background-location testing. These cannot be established from source alone.
- Mobile loads the newest 100 completion events and all non-completed candidates in 200-row pages; all-time totals come from a summary RPC. Offset RPCs reject offsets above 100,000. Pre-migration deleted quests/enrollment changes cannot be reconstructed.
- Investigate, rather than silently fix during unrelated work: completed prerequisites missing from candidate-based ranking; the completed filter with non-completed candidate data; rejected quests treated as actionable by ranking but rejected by `complete_quest`; and report privacy for optional-motivation/status subgroups. Scoped guides identify these boundaries.
