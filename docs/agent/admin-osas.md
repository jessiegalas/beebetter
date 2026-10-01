# Admin, OSAS reporting, and support

Read for admin UI/data access, role management, reporting/CSV, support cases, or OSAS permissions. Paths here are relative to `admin/`.

## Ownership and management

- `src/main.tsx` mounts `src/App.tsx`. Navigation uses the `Section` union in `src/admin-types.ts`: Overview, Users, Quests, Semesters & Sections, Support Requests, Admins. There is no URL-router layer; OSAS/support/permissions/semester components are lazy loaded.
- `src/App.tsx` owns session/role checks, section state, lists, student edits/suspension, quest creation/editing, and super-admin actions. `src/AdminShell.tsx` owns auth/shell, `src/AdminTables.tsx` lists, `src/AdminModals.tsx` forms/details; styles are in `src/App.css` and `src/index.css`.
- `src/admin-data.ts` maps paginated RPC results and difficulty rewards (Easy 20, Medium 35, Hard 60). Preserve server pagination/search/filtering and stale-request guards. Assignment search uses a separate bounded active-student RPC, not the displayed page.
- `src/SemesterManagement.tsx` and `src/semester-data.ts` own semester/section UI and mapping; see [enrollment](enrollment.md). Quest assignment/edit limits are in [quest system](quest-system.md).
- `src/supabase.ts` uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Keep privileged operations in guarded database RPCs. Match the edited file's formatting.
- Session presence is insufficient: `admin_get_my_role` must return an active role. Super-admin grants target existing Auth users; this UI does not create Auth accounts. Neither ordinary-admin nor super-admin status implies OSAS aggregate/support grants.

## Analytics and exports

`src/osas-data.ts` owns report/support/permission contracts. `src/OsasDashboard.tsx`, `src/SupportRequests.tsx`, and `src/OsasPermissions.tsx` implement workflows; `src/osas-report.ts` builds/downloads CSV.

- Render server analytics from `osas_dashboard_analytics`, not client aggregates from raw wellness data. Migration 021 uses historical enrollment at period end, lifecycle events, institutional-time boundaries, and student-weighted averages.
- Permit one demographic filter at a time. Preserve minimum five-student cohorts, complementary-group suppression for one to four, and contributor/bucket/trend checks. Missing/suppressed is not zero.
- Do not claim every nested metric independently has five contributors: optional motivation and support-status subgroups require further privacy review before extending disclosure.
- Keep permission denial/loading/error states explicit. The dashboard must successfully call `osas_log_dashboard_export` before downloading CSV. Preserve suppression refusal, formula escaping, and omission of identities, raw wellness text, support messages/notes, quest details, and precise locations.
- Migration 012 legacy summary wrappers remain in `src/osas-data.ts`; they are distinct from the audited dashboard and must not become a fallback.
- UI default dates hardcode Asia/Manila while SQL reads configuration. Timezone-policy changes must inspect both. When changing async loading, check request/export filters against cached data.

## Support cases

Use `osas_update_support_request` for updates and `student_withdraw_support_request` for withdrawal. Preserve row locks, assignment authorization, RPC event inserts, and retained prior assignments/notes. Assignment options come from `osas_list_support_staff`, not a broad admin-directory query. Withdrawn cases must not be editable; withdrawal must not erase history.

See [privacy and security](privacy-security.md) for raw-record boundaries and [testing](testing.md) for role, suppression, and export-failure checks. `admin/README.md` names older unpaginated RPCs superseded by 022 in the current UI.
