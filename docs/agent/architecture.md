# Architecture and ownership

Read this for cross-module changes or to locate an implementation. Paths are relative to the repository root. Verify behavior against current code and the latest numbered SQL definitions.

## Modules

| Area | Stack and ownership |
| --- | --- |
| `mobile/` | Expo SDK 57, React 19.2, React Native 0.86, TypeScript 6, Expo Router. `mobile/src/app/_layout.tsx` is the entry layout; native/web tabs have separate implementations. |
| `admin/` | React 19.2, Vite 8, TypeScript 6. `admin/src/main.tsx` mounts `admin/src/App.tsx`; navigation uses local section state, not React Router. |
| `supabase/` | PostgreSQL, Auth signup/access hooks, RLS, column grants, RPCs, constraints, history triggers, private Storage. Numbered SQL is currently in `supabase/migrations/`; notification delivery has an Edge Function in `supabase/functions/quest-notifications/`. |
| Data clients | Each app has its own `src/supabase.ts`, using Supabase JS 2 and publishable credentials. Mobile mixes owner-scoped table access with RPCs; admin management/reporting primarily uses guarded RPCs. |

There is no root npm package/workspace or general application API server. Each app owns its manifest and lockfile. No proof-cleanup worker implementation is checked in; the notification Edge Function is a separate subsystem.

`admin/src/AdminModals.tsx` imports pure validation from `mobile/src/lib/student-validation.ts`. Keep that module free of React Native and environment-dependent imports. Changes to shared validation or RPC names/arguments/results, selected columns, statuses, category compatibility labels, and nullable legacy values require checking both clients. Do not silently substitute weaker direct writes for missing RPCs.

## Task owners

| Task | Start with | Contract details |
| --- | --- | --- |
| Registration/profile | `mobile/src/app/auth.tsx`, `mobile/src/app/(tabs)/profile.tsx`, `mobile/src/lib/student-validation.ts`, `mobile/src/hooks/use-enrollment-options.ts`, `mobile/src/context/user-data-context.tsx` | [Enrollment](enrollment.md) |
| Quest creation/completion/proof/XP | `mobile/src/app/add-quest.tsx`, `mobile/src/app/(tabs)/quests.tsx`, `mobile/src/context/user-data-context.tsx` | [Quest system](quest-system.md) |
| Ranking/discovery/events | `mobile/src/lib/quest-priority.ts`, `mobile/src/context/quest-priority-context.tsx`, `mobile/src/lib/quest-discovery.ts`, `mobile/src/lib/recommendation-events.ts` | [Recommendations](recommendations.md) |
| Location/scheduling/reminders | `mobile/src/context/location-context.tsx`, `mobile/src/hooks/use-current-location.ts`, `mobile/src/hooks/use-geofencing.ts`, `mobile/src/lib/quest-time.ts`, `mobile/src/lib/quest-notifications.ts` | [Location and notifications](location-and-notifications.md) |
| Admin students/quests | `admin/src/App.tsx`, `admin/src/admin-data.ts`, `admin/src/AdminModals.tsx`, `admin/src/AdminTables.tsx` | [Admin and OSAS](admin-osas.md) |
| Semesters/sections | `admin/src/SemesterManagement.tsx`, `admin/src/semester-data.ts`, `mobile/src/hooks/use-enrollment-options.ts` | [Enrollment](enrollment.md) |
| Wellness/reflections/support | `mobile/src/lib/wellbeing-data.ts` and routes under `mobile/src/app/` | [Privacy and security](privacy-security.md) |
| OSAS analytics/cases/permissions | `admin/src/OsasDashboard.tsx`, `admin/src/osas-data.ts`, `admin/src/osas-report.ts`, `admin/src/SupportRequests.tsx`, `admin/src/OsasPermissions.tsx` | [Admin and OSAS](admin-osas.md) |
| Schema/authorization | Inspect relevant deployed `public` definitions in the snapshot only for schema-related tasks; inspect relevant numbered migrations, grants, callers, constraints, and triggers before changing behavior | [Schema snapshot](db-schema.sql) and [database contracts](database-contracts.md) |

Identify UI, business-logic, data-access, and database owners before editing a contract; plan complex/cross-module changes first. Preserve platform alternatives and asynchronous request/unmount guards. Match nearby formatting; it varies by file.
