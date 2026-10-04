# Registration, identity, and enrollment

Read for signup/profile validation, admin student edits, semesters/sections, or enrollment history. Paths are repository-relative.

## Identity and shared validation

- Auth owns credentials, login identity, and email. Pending migration 034 makes new mobile signup (`signup_intent=student_registration`) create an Auth identity and minimal profile only. After email confirmation, `student_complete_registration` creates the Student and enrollment history atomically using explicit semester/option IDs. Legacy full-metadata signup still creates profile/student rows; student validation still applies. Admin signup uses the explicit `signup_intent=admin_access_request` marker to create a profile without a student row, then must submit a separately authenticated access-request RPC. That client-supplied marker never grants admin access; guarded database RPCs own request decisions and role grants.
- `profiles` is the progression/display projection; `students` is current identity/enrollment; history stores event-time facts. Overlapping fields do not justify merging them.
- `mobile/src/app/auth.tsx` collects credentials; `mobile/src/components/student-onboarding.tsx` collects confirmed-account enrollment. `mobile/src/components/student-information-fields.tsx`, `mobile/src/hooks/use-enrollment-options.ts`, and `mobile/src/lib/student-validation.ts` own choices/validation. Profile edits use the provider's student update and display-name update.
- `admin/src/AdminModals.tsx` imports the same pure validation with source-relative `../../mobile/src/lib/student-validation`. Keep both clients compatible; do not add React Native or environment-dependent imports.
- Preserve unchanged legacy fields during unrelated edits. Do not invent catalogue entries or normalize historical labels wholesale.
- Admin student editing uses `admin_update_student` (011, with validation triggers replaced by 025). Suspension changes student status and server write eligibility, not an Auth ban.
- Migration 027's access-token hook rejects inactive-student login/refresh while preserving active administrator access only when separately enabled in Auth configuration. SQL installation alone is insufficient; preserve any existing hook claim transformations. Former `DEPLOYMENT.md` and `ACCOUNT_ACCESS_VERIFICATION.md` are absent; see [testing](testing.md) for coverage limits and device checks.

## Semesters and historical associations

`admin/src/SemesterManagement.tsx` and `admin/src/semester-data.ts` own the management UI/RPC mapping. Migrations 025-026 own semester-scoped options and enrollment consistency.

- Only one semester is active. Activate a draft after explicitly adding sections; activation archives the previous active semester without copying sections or automatically moving students.
- Selecting a semester in the admin panel only selects its management view. Section drafts reset on selection; activation is disabled until its active sections have loaded. Saves are serialized before calling the RPC, and semester selection is disabled while a save is pending. Refresh reloads both the semester list and its sections.
- Archived semesters are read-only. Associated sections cannot be renamed. Removal archives used sections and deletes only unused sections.
- New admin section forms fix campus to `Cavite State University Bacoor City Campus`; there is no campus selector. Academic years are generated choices, and new section labels use a positive whole-number input. Existing campus/year/section labels remain unchanged; associated or nonnumeric legacy section labels are read-only. Pending migration 032 enforces consecutive `YYYY-YYYY` years and Bacoor/numeric labels on creation or changed labels, while allowing unchanged legacy status edits. It does not rewrite stored enrollment or registration contracts.
- Migration 025 seeds `Legacy / Current`, not an invented academic year. Registration exposes only active sections of the active semester, including to anon through `registration_enrollment_options`.
- Mobile onboarding enrollment choices use `registration_enrollment_options_v2` and retain explicit option/semester identity. They reload when onboarding mounts, when the app returns to the foreground, and on explicit retry. Pending requests are aborted when replaced or unmounted; validation uses the refreshed active-semester catalogue without rewriting legacy enrollment values.
- Enrollment changes close the current validity period and append another. Preserve past labels, associations, and validity periods; they are historical facts, not redundant mutable profile data.
- Migration 026 enforces paired option/semester values and exact option-to-semester composite FKs on current and historical rows. Course/year/campus/section text preserves legacy spelling and event-time labels.
- Check existing-data backfill anomalies and constraint failures before changing these relationships. Former `DATABASE_NORMALIZATION_AUDIT.md` contained 026 preflight queries but is absent; inspect migration 026 and historical Git content before using those queries.

Validate shared changes in both clients using [testing](testing.md). Pre-migration enrollment changes cannot be reconstructed; see [known limitations](known-limitations.md).

Pending migration 034 and hosted Auth/deep-link release checks: [student authentication rollout](../../supabase/STUDENT_AUTH_ROLLOUT.md). New/reset passwords require 15 characters; existing shorter login passwords remain valid.
