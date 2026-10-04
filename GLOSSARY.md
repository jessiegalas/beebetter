# BeeBetter glossary

- **Admin Console (`/admin`)**: The OSAS administrative application. Its student, quest, semester, reporting, and support workflows are OSAS work.
- **Admin**: A person with an active `admin` or `super_admin` record in `admin_users`. Every active admin has OSAS aggregate-reporting and support-case access. A signed-in account or pending access request is not an admin.
- **Super Admin**: An active admin who can also approve admin access requests and manage admin accounts. This role does not require a separate OSAS grant.
- **Inactive admin**: An admin record with `is_active = false`. The person has no effective Admin Console, aggregate-reporting, or support-case access.
- **OSAS access**: Access derived from active admin status in database authorization checks. Legacy `osas_staff_permissions` rows are retained for history but do not grant or revoke access.
- **Aggregate reporting**: Privacy-protected, server-computed OSAS analytics. Cohort and complementary suppression, null/withheld values, and audited exports still apply to every admin.
- **Support case access**: The ability of an active admin to manage identifiable voluntary support requests through guarded RPCs. Student ownership and withdrawal protections remain separate.
