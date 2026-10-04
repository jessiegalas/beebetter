# Admin, OSAS reporting, and support

Read for admin UI/data access, role management, reporting/CSV, support cases, or OSAS permissions. Paths here are relative to `admin/`.

## Ownership and management

- `src/main.tsx` mounts `src/App.tsx`. Navigation uses the `Section` union in `src/admin-types.ts`: Overview, Students, Quests, Semesters & Sections, Support Requests, Admins. There is no URL-router layer; OSAS/support/permissions/semester components are lazy loaded.
- `src/admin-access.ts` owns session observation, active-role lookup, server-confirmed OSAS access, access-request status, and Auth actions. Its states distinguish checking, signed out, denied, lookup failure, and active access, and discard stale lookups after account changes. `src/App.tsx` owns section state, lists, student edits/suspension, quest creation/editing, and super-admin actions. `src/AdminShell.tsx` owns auth/access screens, `src/AdminTables.tsx` lists, `src/AdminModals.tsx` forms/details; styles are in `src/App.css` and `src/index.css`.
- `src/admin-data.ts` maps paginated RPC results and difficulty rewards (Easy 20, Medium 35, Hard 60). Preserve server pagination/search/filtering and stale-request guards. Assignment search uses a separate bounded active-student RPC, not the displayed page.
- Student lists default to ten rows with 10/20/50/100 choices; size changes reset the page and preserve filters. Quest lists retain the existing fifty-row default and `admin_list_quests_page` contract; creation retains `admin_create_quest`.
- Automatic access checks skip signed-out sessions, preserving login/signup forms. Same-account background access checks preserve the mounted workspace; failed verification or revoked access closes it. The workspace is keyed by Auth account so lists, selected records, and drafts cannot carry into another account. Lists load on their management section, discard stale responses, and return an empty out-of-range page to page zero. Student saves reload the current filters and totals.
- OSAS and Admin describe the same staff identity in the UI. Every active admin receives aggregate reporting and identifiable support access automatically, enforced by the database. See [glossary](../../GLOSSARY.md). Only Super Admins manage roles, and self-role/status/removal controls are locked; the corresponding guarded RPCs remain authoritative.
- `src/SemesterManagement.tsx` and `src/semester-data.ts` own semester/section UI and mapping; see [enrollment](enrollment.md). Quest assignment/edit limits are in [quest system](quest-system.md).
- `src/supabase.ts` uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Keep privileged operations in guarded database RPCs. Match the edited file's formatting.
- Session presence is insufficient: `admin_get_my_role` must return an active role. Authenticated admin sign-up marks intent only, then `admin_request_access` records an ordinary-admin request; a super-admin reviews it through guarded list/review RPCs. Clients never write `admin_users`; approval creates active `admin` at most. Super-admin grants and promotions remain in the separate privileged management flow. Active ordinary-admin and super-admin status includes both OSAS capabilities; inactive accounts have neither.

## Analytics and exports


`src/osas-data.ts` owns report/support/permission contracts. `src/OsasDashboard.tsx`, `src/SupportRequests.tsx`, implement workflows; `src/OsasPermissions.tsx` explains included access without permission editing; `src/osas-report.ts` builds/downloads CSV.

- Render server analytics from `osas_dashboard_analytics`, not client aggregates from raw wellness data. Migration 021 uses historical enrollment at period end, lifecycle events, institutional-time boundaries, and student-weighted averages.
- Permit one demographic filter at a time. Preserve minimum five-student cohorts, complementary-group suppression for one to four, and contributor/bucket/trend checks. Missing/suppressed is not zero.
- Do not claim every nested metric independently has five contributors: optional motivation and support-status subgroups require further privacy review before extending disclosure.
- Keep permission denial/loading/error states explicit. The dashboard must successfully call `osas_log_dashboard_export` before downloading CSV. Preserve suppression refusal, formula escaping, and omission of identities, raw wellness text, support messages/notes, quest details, and precise locations.
- Migration 012 legacy summary wrappers remain in `src/osas-data.ts`; they are distinct from the audited dashboard and must not become a fallback.
- UI default dates hardcode Asia/Manila while SQL reads configuration. Timezone-policy changes must inspect both. When changing async loading, check request/export filters against cached data.
- Accepted report results retain their exact request filters; stale responses are ignored. Export logs those accepted filters before download and cancels download if the displayed report changes while logging. Filter-choice errors have their own retry state.

## Support cases

Use `osas_update_support_request` for updates and `student_withdraw_support_request` for withdrawal. Preserve row locks, assignment authorization, RPC event inserts, and retained prior assignments/notes. Assignment options come from `osas_list_support_staff`, not a broad admin-directory query. Withdrawn cases must not be editable; withdrawal must not erase history.

See [privacy and security](privacy-security.md) for raw-record boundaries and [testing](testing.md) for role, suppression, and export-failure checks. `admin/README.md` names older unpaginated RPCs superseded by 022 in the current UI.

## Unified OSAS rollout

Migration `033_unify_admin_osas_access.sql` replaces the access helpers without changing RPC signatures. Legacy permission rows remain historical records and no longer authorize access. The obsolete setter is not executable by clients. Apply 033 with explicit authorization before releasing the matching console changes, refresh the session, verify the real Overview, and regenerate the deployed schema snapshot. Migration 033 was executed through the hosted SQL editor on 2026-10-04. A read-only transaction under the authenticated role verified both OSAS capabilities for all four active admins (three ordinary admins and one super-admin), the support staff directory, unknown-capability denial, and non-admin denial. No inactive admin records were present for a live inactive-account check. Client execution of the obsolete setter and anonymous permission lookup were denied. The real signed-in Overview rendered metrics and report panels with privacy withholding intact. Full schema snapshot regeneration remains pending PostgreSQL connection credentials; the existing snapshot has not been hand-edited. The disposable fixture suite remains unexecuted; these live read-only checks do not claim clean-install, upgrade, deactivation-mutation, or exhaustive legacy-row coverage.
