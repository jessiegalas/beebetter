# BeeBetter Admin

## Setup

1. Copy `.env.example` to `.env.local` and fill in the Supabase project URL and publishable key.
2. Run `supabase/004_admin_student_access.sql`, `005_students.sql`, `006_admin_quest_management.sql`, and `007_super_admin_management.sql` in order in the Supabase SQL Editor.
3. Create or use an Auth account, then bootstrap the first Super Admin with:
  `update public.admin_users set role = 'super_admin', is_active = true where id = 'AUTH_USER_UUID';`
4. Start the app with `npm run dev`.

The Users screen reads student records through the guarded `admin_list_students()` RPC. Student information is stored in `public.students`, while `public.profiles` continues to hold level, XP, and streak progress. Apply `supabase/005_students.sql` after the existing migrations to backfill current accounts and enable student editing through `admin_update_student()`.

Super Admins see the Admins section and can grant admin access to existing Supabase Auth users, change roles, disable access, or remove admin access. Regular admins retain student and quest permissions but cannot manage admins. Creating the underlying Auth account must be done in Supabase Auth or through a server-side invite flow; the browser admin app never receives a service-role key.

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
