# BeeBetter Admin

## Setup

Follow the repository [local setup](../README.md#local-setup) for prerequisites, `admin/.env.local`, installation and startup. This console requires an active role from `admin_get_my_role`; a Supabase session alone does not grant access.

The Users screen reads student records through the guarded `admin_list_students_page()` RPC. Database migrations and administrator bootstrap are operational tasks; follow the current contracts in [admin and OSAS](../docs/agent/admin-osas.md), [database contracts](../docs/agent/database-contracts.md), and [Supabase guidance](../supabase/AGENTS.md).

Every active admin receives OSAS reporting and support access. Super Admins also approve access requests and manage admin roles/status. Signup creates an Auth identity and allows an access request; approval remains a guarded Super Admin operation. The browser never receives a service-role key.

Useful checks are `npm run lint`, `npm run build`, `npm run test:report`, `npm run test:auth`, and `npm run test:flows`.
