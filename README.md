# BeeBetter

BeeBetter provides student quests, XP and contextual recommendations through an Expo/React Native app, with a React/Vite console for OSAS student management, reporting and support. Supabase supplies PostgreSQL, Auth and private Storage.

Mobile wellness, reflections and student support are currently disabled; their implementations and records are retained. See the [provisional-feature guidance](docs/agent/mobile-ui.md#system-note-provisional-features-disabled).

## Prerequisites

- Node.js 22.x, version 22.13.0 or later, with npm; this satisfies both apps' current engine requirements.
- A Supabase project with the required deployed contracts and its URL and publishable key. Administrator access requires an active database admin role.
- For native mobile development, an installed development client and a device/emulator; local native builds also require the platform SDK. See [mobile runtime](docs/agent/mobile-runtime.md) and [Android build/push setup](supabase/functions/quest-notifications/README.md).

Each app owns its package and lockfile. Run installation and application commands inside that app; there is no root npm workspace.

## Local setup

Create `mobile/.env.local`:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=YOUR_PROJECT_URL
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=YOUR_ANDROID_MAPS_KEY
```

Create `admin/.env.local`:

```dotenv
VITE_SUPABASE_URL=YOUR_PROJECT_URL
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

These variables are bundled into clients. Keep database passwords, service-role keys and environment files out of the repository. Android Maps needs native configuration; Firebase/EAS push configuration is covered by the Android guide above.

Start mobile from the repository root:

```powershell
cd mobile
npm ci
npm run start
```

In another terminal at the repository root, start the admin console:

```powershell
cd admin
npm ci
npm run dev
```

## Verification and development

| Directory | Essential checks |
| --- | --- |
| `mobile/` | `npx tsc --noEmit`, `npm run lint`, `npm run test:context` |
| `admin/` | `npm run lint`, `npm run build`, `npm run test:report` |
| Repository root | `git diff --check` |

Select additional checks from [testing](docs/agent/testing.md). Start with [repository guidance](AGENTS.md), [architecture and ownership](docs/agent/architecture.md), and the authoritative [glossary](GLOSSARY.md); [admin and OSAS](docs/agent/admin-osas.md) describes console workflows.

[Database contracts](docs/agent/database-contracts.md) and [student authentication rollout](supabase/STUDENT_AUTH_ROLLOUT.md) cover schema and Auth release requirements. The [public schema snapshot](docs/agent/db-schema.sql) records hosted definitions. Migrations, deployments and database resets require explicit authorization; the local verification runner mutates a separately provisioned disposable Supabase stack.
