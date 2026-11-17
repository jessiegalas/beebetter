# Admin, OSAS reporting, and support

Read for admin UI/data access, role management, reporting/CSV, support cases, or OSAS permissions. Paths here are relative to `admin/`.

## Ownership and management

- `src/main.tsx` mounts `src/App.tsx`. Navigation uses the `Section` union in `src/admin-types.ts` with no URL-router layer. The admin Support Requests screen and its access indicators are paused by `ADMIN_SUPPORT_REQUESTS_ENABLED` in `src/admin-features.ts`. The server still derives support permissions from active admin status.
- `src/admin-access.ts` owns session observation, active-role lookup, server-confirmed OSAS access, access-request status, and Auth actions. Its states distinguish checking, signed out, denied, lookup failure, and active access, and discard stale lookups after account changes. `src/App.tsx` owns section state, lists, student edits/suspension, quest creation/editing, and super-admin actions. `src/AdminShell.tsx` owns auth/access screens, `src/AdminTables.tsx` lists, `src/AdminModals.tsx` forms/details; styles are in `src/App.css` and `src/index.css`.
- `src/admin-data.ts` maps paginated RPC results and difficulty rewards (Easy 20, Medium 35, Hard 60). Preserve server pagination/search/filtering and stale-request guards. Assignment search uses a separate bounded active-student RPC, not the displayed page.
- Student lists default to ten rows with 10/20/50/100 choices; size changes reset the page and preserve filters. Quest lists retain the existing fifty-row default and `admin_list_quests_page` contract; creation retains `admin_create_quest`.
- Automatic access checks skip signed-out sessions, preserving login/signup forms. Same-account background access checks preserve the mounted workspace; failed verification or revoked access closes it. The workspace is keyed by Auth account so lists, selected records, and drafts cannot carry into another account. Lists load on their management section, discard stale responses, and return an empty out-of-range page to page zero. Student saves reload the current filters and totals.
- OSAS and Admin describe the same staff identity in the UI. Every active admin receives aggregate reporting and identifiable support access automatically, enforced by the database. See [glossary](../../GLOSSARY.md). Only Super Admins manage roles, and self-role/status/removal controls are locked; the corresponding guarded RPCs remain authoritative.
- Semesters & Sections manages enrollment options and activation. See [enrollment](enrollment.md) for enrollment contracts and [quest system](quest-system.md) for quest assignment and edit limits.
- `src/supabase.ts` uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Keep privileged operations in guarded database RPCs. Match the edited file's formatting.
- Session presence is insufficient: `admin_get_my_role` must return an active role. Authenticated admin sign-up marks intent only, then `admin_request_access` records an ordinary-admin request; a super-admin reviews it through guarded list/review RPCs. Clients never write `admin_users`; approval creates active `admin` at most. Super-admin grants and promotions remain in the separate privileged management flow. Active ordinary-admin and super-admin status includes both OSAS capabilities; inactive accounts have neither.

## Analytics and exports


`src/osas-data.ts` owns report/support/permission contracts. `src/OsasDashboard.tsx`, `src/SupportRequests.tsx`, implement workflows; `src/OsasPermissions.tsx` explains included access without permission editing; `src/osas-report.ts` builds/downloads CSV.

- Overview uses `osas_dashboard_analytics_v2` from migration 044 for four summary metrics and the weekly well-being trend over the last 30 days. The detail screens share a separate date filter. Use the database's `institutional_timezone` for date presets and plot gaps for unpublished buckets.
- The report shows first-week completion, repeat completion across fully observed Monday–Sunday weeks, interest by category, OSAS activity outcomes, and student-weighted wellness with weekly coverage. Mark partial wellness weeks. Count student-chosen interests only where the creation event records an authenticated student creator. Historical events with unverified origin have no interest attribution.
- Student Wellness holds the rating selector, weekly check-in details and year-level comparisons. The semester comparison uses `osas_wellness_by_semester` from migration 046 and the student's enrollment when each check-in was recorded during a matching semester. Choose Last 12 months or custom dates to compare terms.
- Quest Engagement separates Participation (distinct students, registered accounts, and creators by category) from Completions (events, completion trend, and follow-up rates). Tables for completion buckets and rates are expandable. The repeat summary uses the latest fully observed week pair, including when its rate is withheld.
- OSAS Reports holds activity outcomes, the latest five assignments across all dates, and audited CSV export via `osas_log_dashboard_export_v2`. The CSV includes the accepted semester comparison for the same dates when available.
- Data Testing is below Semesters & Sections in the admin navigation. It renders the same wellness and quest engagement components with local fixtures for populated, privacy-gap, and no-activity states. This screen does not call the reporting RPCs or offer live report exports.
- Per-activity outcomes use the first verified publication and a 14-day window. Publishing to everyone creates a single batch. Retain publication metadata when assignments are edited, republished, or deleted. Release dates, broad categories, and activity codes in aggregates. Older assignments with reliably recorded publication events appear under Historical assignments by category.
- Preserve the five-student minimum, contributor checks, and small-complement suppression for new ratios. Represent withheld data as unavailable. The CSV contains the selected period, metric definitions, and the aggregate results for the shared detail date filter. Exclude identities, student-written text, case details, and precise locations. Preserve formula escaping.
- After the matching audit succeeds, download the accepted report. Cancel the download if the displayed report changes while logging and ignore stale query results. Keep permission, error, and loading feedback explicit.

## Support cases

Use `osas_update_support_request` for updates and `student_withdraw_support_request` for withdrawal. Preserve row locks, assignment authorization, RPC event inserts, and retained prior assignments/notes. Assignment options come from `osas_list_support_staff`, not a broad admin-directory query. Withdrawn cases must not be editable; withdrawal must not erase history.

See [privacy and security](privacy-security.md) for raw-record boundaries and [testing](testing.md) for role, suppression, and export-failure checks.

## Unified OSAS rollout

Migration `033_unify_admin_osas_access.sql` replaces access helpers without changing RPC signatures. The [hosted public schema snapshot](db-schema.sql) derives both capabilities from active admin status. Legacy permission rows remain historical records and no longer authorize access; the obsolete setter is not executable by clients.

For a separately authorized rollout, verify the deployed helpers/grants before releasing dependent console changes, refresh the session, and check the real Overview and support directory. Use the disposable regression coverage in [testing](testing.md) for inactive/non-admin denial, legacy-row independence, deactivation, suppression and audits. Snapshot definitions and client tests do not establish those mutation or device checks.
