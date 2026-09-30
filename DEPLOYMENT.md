# BeeBetter deployment and operations

## Applications

The mobile app uses Expo Router from `mobile/src/app`. The admin app uses Vite React from `admin/src/main.tsx`. The removed `mobile/src/navigator` tree was an unused pre-Expo-Router implementation.

Verify each app independently:

```powershell
cd mobile
npm ci
npx tsc --noEmit
npm run lint

cd ../admin
npm ci
npm run build
npm run lint
npm run test:report
```

## Environment variables

Mobile (`mobile/.env.local`):

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`

Admin (`admin/.env.local`):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Only publishable/anon credentials belong in clients. Never place a database password or service-role key in either client.

## Database migration order

Apply `supabase/001_initial_schema.sql` through `supabase/027_student_auth_access.sql` in numeric order. Each migration must succeed before continuing. Review and apply manually to staging before production. Migration 022 is required for paginated admin lists, bounded activity history, and progression summaries. Migration 023 is required for complete paged recommendation candidates and privacy-bounded recommendation effectiveness events. Migration 024 prevents students from deleting proof objects while a quest still references them. Migration 025 adds academic semesters, semester-scoped sections, and durable student enrollment associations. Migration 026 adds canonical quest-category references and consistency constraints for enrollment and derived levels.

Migration 025 places existing enrollment options and students into an active `Legacy / Current` semester so no academic year is invented during migration. After deployment, an active administrator must create the real upcoming semester as a draft, explicitly add its valid sections, and activate it. Activation archives the previous active semester. Sections are not copied automatically.

The database requires Supabase Auth and Storage schemas, PostgreSQL `pgcrypto`, and the private `quest-proofs` bucket created by migration 003. Migration 020 defines `Asia/Manila` as the institutional timezone.

## Local Supabase migration verification

PGlite provides fast adversarial tests, but releases must also verify all migrations against a disposable local Supabase stack because Auth, Storage, roles, and RLS are Supabase dependencies.

1. Install Docker, Supabase CLI, and `psql`.
2. Start a disposable project with `supabase init` and `supabase start`.
3. Obtain its local PostgreSQL URL from `supabase status`.
4. Confirm the hostname is `localhost` or `127.0.0.1`.
5. Run `./supabase/verify-local-supabase.ps1 -DatabaseUrl <local-db-url>`; it refuses non-local hosts and applies all numbered migrations, currently 001-027, with `ON_ERROR_STOP`.
6. Enable the Auth hook and run `node supabase/test_account_access.cjs` as described below. This suite covers account access, not the entire database.
7. Destroy it with `supabase stop --no-backup`.

Never run verification scripts against production.

## Release and rollback

1. Take and verify a database backup before applying migrations.
2. Apply migrations to a disposable local Supabase stack, then staging, in numeric order.
3. Run the database regressions and smoke-test registration, suspension, quest completion with and without proof, OSAS permissions, case updates, analytics suppression, and exports.
4. Deploy clients only after the database migration they depend on has succeeded.
5. Start and monitor the proof-cleanup worker before treating proof retention as operationally complete.
6. If validation fails before client deployment, stop and restore the pre-migration backup. If a client regression appears afterward, roll the client back first while preserving the additive database schema.
7. Do not remove columns, tables, policies, or audit history as an ad hoc rollback. Restore the tested backup or use a separately reviewed compensating migration.

## Authorization setup

- Create users through Supabase Auth.
- Grant admin roles through the Super Admin workflow.
- Grant aggregate OSAS and identifiable support permissions separately.
- Ordinary administrators receive neither sensitive permission automatically.
- Confirm RLS remains enabled after restoring or cloning a database.

## Proof retention worker

Migration 018 queues replaced/deleted proofs and detects abandoned uploads. Migration 024 prevents client deletion while a quest references a proof. A scheduled trusted worker is still required:

1. Use the service-role key in a server-only environment.
2. Call `quest_proof_cleanup_candidates(batch_size)`.
3. Delete returned objects through the Supabase Storage API from `quest-proofs`.
4. Pass successfully deleted paths to `confirm_quest_proof_cleanup(cleaned_paths)`.
5. Record failures and retry with backoff.

Run it at least daily. Do not delete rows directly from `storage.objects`.

## Operational checks

- Monitor failed support-case updates and report audit-log growth.
- Review OSAS query/export logs for repeated differencing patterns.
- Monitor proof cleanup queue depth and its oldest eligible item.
- Back up the database before migrations.
- Test background location behavior on physical Android hardware.

## Known limits

- Admin offset pagination is capped at 100,000 rows; use cursor pagination beyond that range.
- Mobile displays the newest 100 completion events. All-time totals and categories come from `student_progress_summary`.
- Mobile retrieves unresolved/non-completed quests in bounded 200-row pages before ranking. The RPC rejects offsets above 100,000; use keyset pagination if a single student can exceed that operational bound.
- Pre-migration enrollment changes and deleted quests cannot be reconstructed.

## Student suspension and Auth hook (027)

Migration 027 installs `public.student_access_token_hook(event jsonb)`. **Applying SQL alone does not enable it.** After applying 001-027 to the authorized target, open Supabase Dashboard > Authentication > Hooks > Custom Access Token, choose the Postgres function `public.student_access_token_hook`, and enable/save it. Inspect any existing Custom Access Token hook before changing this setting; its claim transformations must be preserved when integrating this check.

For a disposable CLI project, add this to that project's `supabase/config.toml` and restart its local stack:

```toml
[auth.hook.custom_access_token]
enabled = true
uri = "pg-functions://postgres/public/student_access_token_hook"
```

The hook checks current database status on login and refresh. It rejects existing `Inactive` students with "Your account is suspended. Contact your administrator." and preserves active administrator access for legacy identities with student rows. Allowed requests retain their original claims. Only `supabase_auth_admin` may execute the hook; it has column-level read grants and dedicated SELECT policies. Mobile independently requires an `Active` student row before opening protected routes, including for administrator identities.

Existing JWTs are not immediately revoked. Existing active-student write guards still apply; unchanged read policies may permit previously issued tokens until expiration. Mobile revalidates on launch, auth events, resume, and every 60 seconds while foregrounded. Verification errors lock protected screens and offer retry/sign-out. This release does not provide immediate push revocation or an Auth user ban.

### Disposable Auth integration test

Requires a running local Supabase with 001-027 applied, the hook enabled, and at least one active-semester enrollment option. The test creates two synthetic Auth users, grants one administrator access, changes their statuses, then deletes both users. Use an authorized disposable stack only; retained anonymous history can remain until the stack is discarded. The test refuses non-loopback URLs.

Set `BEEBETTER_TEST_DISPOSABLE=yes`, `BEEBETTER_TEST_URL`, `BEEBETTER_TEST_PUBLISHABLE_KEY`, and `BEEBETTER_TEST_SERVICE_ROLE_KEY` in the trusted test runner's environment. Do not store the privileged test key in either client environment file. With mobile dependencies installed, run from the repository root:

```powershell
node supabase/test_account_access.cjs
```

This verifies active login, suspension through the real admin RPC, denied password login/refresh, old-token write rejection, hook execution denial for clients, suspended logout, reactivation, and the active-administrator exemption. Run on both a clean stack and an upgraded disposable copy containing synthetic pre-027 data. Verify sign-up/email confirmation on staging as well. An absent or disabled hook must cause the inactive-login assertion to fail.

Run `npm run test:auth` in `mobile/` for mocked admission, logout, routing, storage, notification, and location race regressions. These do not establish native Android navigation behavior. Complete the physical-device matrix in [ACCOUNT_ACCESS_VERIFICATION.md](ACCOUNT_ACCESS_VERIFICATION.md) before release.

Deploy the migration and enable/test the hook before releasing the mobile build. Monitor Auth hook errors and login failures, especially active-student and administrator failures. If the hook unexpectedly blocks eligible accounts, restore the previous hook configuration while investigating and retain the mobile access guard; server-side suspension enforcement is incomplete during that rollback. Do not remove historical migrations or data.
