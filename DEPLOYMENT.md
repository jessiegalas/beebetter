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

Apply `supabase/001_initial_schema.sql` through `supabase/022_scalable_data_access.sql` in numeric order. Each migration must succeed before continuing. Review and apply manually to staging before production. Migration 022 is required for paginated admin lists, bounded activity history, and progression summaries.

The database requires Supabase Auth and Storage schemas, PostgreSQL `pgcrypto`, and the private `quest-proofs` bucket created by migration 003. Migration 020 defines `Asia/Manila` as the institutional timezone.

## Local Supabase migration verification

PGlite provides fast adversarial tests, but releases must also verify all migrations against a disposable local Supabase stack because Auth, Storage, roles, and RLS are Supabase dependencies.

1. Install Docker, Supabase CLI, and `psql`.
2. Start a disposable project with `supabase init` and `supabase start`.
3. Obtain its local PostgreSQL URL from `supabase status`.
4. Confirm the hostname is `localhost` or `127.0.0.1`.
5. Run `./supabase/verify-local-supabase.ps1 -DatabaseUrl <local-db-url>`; it refuses non-local hosts and applies migrations 001–022 with `ON_ERROR_STOP`.
6. Run the targeted `supabase/test_*.cjs` suites.
7. Destroy it with `supabase stop --no-backup`.

Never run verification scripts against production.

## Authorization setup

- Create users through Supabase Auth.
- Grant admin roles through the Super Admin workflow.
- Grant aggregate OSAS and identifiable support permissions separately.
- Ordinary administrators receive neither sensitive permission automatically.
- Confirm RLS remains enabled after restoring or cloning a database.

## Proof retention worker

Migration 018 queues replaced/deleted proofs and detects abandoned uploads. A scheduled trusted worker is still required:

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
- Mobile loads at most 200 unresolved/non-completed quests. A visible load-more workflow is needed if a student can have more.
- Pre-migration enrollment changes and deleted quests cannot be reconstructed.
