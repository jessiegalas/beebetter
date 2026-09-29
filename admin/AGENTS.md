# Admin guidance

Read [the root guide](../AGENTS.md) first. Paths here are relative to `admin/` unless prefixed with `../`.

## Architecture and task owners

- `src/main.tsx` mounts `src/App.tsx`. Navigation is the `Section` union in `src/admin-types.ts`: Overview, Users, Quests, Semesters & Sections, Support Requests, Admins. There is no URL-router layer. OSAS dashboard, support, permission, and semester components are lazy loaded.
- `src/App.tsx` handles session/role checks, section state, list loading, student edits/suspension, quest creation/editing, and super-admin actions. `src/AdminShell.tsx` contains authentication/shell elements; `src/AdminTables.tsx` renders lists; `src/AdminModals.tsx` contains forms/details. Styling is in `src/App.css` and `src/index.css`.
- `src/admin-data.ts` maps paginated RPC results to UI types and maps difficulty to XP (Easy 20, Medium 35, Hard 60). Preserve server pagination/search/filtering and stale-request guards. Assignment search uses a separate bounded active-student RPC, not the currently displayed page.
- `src/SemesterManagement.tsx` and `src/semester-data.ts` own semester/section UI and RPC mapping. `src/osas-data.ts` owns report/support/permission contracts; `src/OsasDashboard.tsx`, `src/SupportRequests.tsx`, and `src/OsasPermissions.tsx` implement the corresponding workflows. `src/osas-report.ts` builds/downloads CSV.
- `src/supabase.ts` uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Keep privileged operations in guarded database RPCs. Existing files vary in semicolon/formatting style; match the file being edited.

## Preserve existing behavior

- Session presence is insufficient for admin access: `admin_get_my_role` must return an active role. Super-admin grants operate on existing Auth users; this UI does not create Auth accounts. OSAS aggregate and support grants are separate and are not implied by super-admin status.
- Student editing calls `admin_update_student`; suspension updates the student status and server write eligibility, not an Auth ban. Auth remains the login/email authority. `src/AdminModals.tsx` imports `../mobile/src/lib/student-validation.ts` via its source-relative `../../mobile/...` import; keep validation changes compatible with both apps and legacy enrollment values.
- Admin-created quests use four default categories and active/pending publication states. Assigning to Everyone inserts one owned quest per eligible active student, excluding admin identities. Editing uses `admin_update_quest`, cannot reassign an owner, and is limited by SQL to active/pending quests. It is not a proof-review or completion-awarding operation.
- Only one semester is active. Activate a draft after explicitly adding sections; activation archives the old active semester without copying sections or automatically moving students. Archived semesters are read-only. Associated sections cannot be renamed; removal archives associated sections and deletes only unused ones. Preserve historical associations.
- Support case updates and withdrawal must keep the RPC-generated event trail. Assignment choices come from `osas_list_support_staff`, not a broad admin-directory query. Withdrawal retains prior assignment/notes; support UI must not erase them or permit editing a withdrawn case.

## Reporting and privacy

- Render server-computed analytics from `osas_dashboard_analytics`; do not rebuild aggregates from raw student wellness data. The current dashboard uses migration 021, historical enrollment at period end, quest lifecycle events, institutional-time boundaries, and student-weighted averages.
- Keep one demographic filter at a time, minimum five-student cohorts, suppression of complementary groups of one to four, and existing contributor/bucket checks. A missing/suppressed value is not zero. Do not claim every nested metric independently has five contributors: optional motivation and support status subgroups warrant further privacy review.
- Preserve explicit permission denial/loading/error states. `src/OsasDashboard.tsx` must successfully call `osas_log_dashboard_export` before CSV download. Preserve suppression refusal, spreadsheet-formula escaping, and omission of identities, wellness text, support messages/notes, quest details, and precise locations in `src/osas-report.ts`.
- Legacy summary wrappers remain in `src/osas-data.ts` for RPCs from migration 012; they are not the dashboard's newer audited reporting path. Do not switch the dashboard to them as a fallback.
- UI default report dates currently hardcode Asia/Manila while SQL reads configuration. Any timezone-policy change must inspect both. Dashboard requests/exported filters and cached data should be checked for consistency when changing asynchronous loading.

## Validation

Run from this directory:

```powershell
npm run build
npm run lint
npm run test:report
```

Build runs `tsc -b` followed by Vite. Lint is Oxlint, not ESLint. Report tests cover CSV content, suppression, missing values, and spreadsheet escaping; they do not execute RLS/RPCs. For shared validation changes also run mobile TypeScript and student tests.

For affected flows, verify ordinary-admin versus super-admin versus each OSAS permission, revoked/inactive access, pagination/search, RPC errors, semester lifecycle, support-event preservation, and suppressed/export-failure states with authorized test data. No checked-in browser end-to-end suite establishes these behaviors. Do not use real student data as fixtures.

`README.md` is an older setup reference; it names unpaginated RPCs superseded in this UI by migration 022. Follow [DEPLOYMENT.md](../DEPLOYMENT.md) and current code for deployment requirements.
