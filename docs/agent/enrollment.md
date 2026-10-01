# Registration, identity, and enrollment

Read for signup/profile validation, admin student edits, semesters/sections, or enrollment history. Paths are repository-relative.

## Identity and shared validation

- Auth owns credentials, login identity, and email. `handle_new_user` creates profile/student rows from normalized signup metadata; validation still applies to signup.
- `profiles` is the progression/display projection; `students` is current identity/enrollment; history stores event-time facts. Overlapping fields do not justify merging them.
- `mobile/src/app/auth.tsx` sends metadata. `mobile/src/components/student-information-fields.tsx`, `mobile/src/hooks/use-enrollment-options.ts`, and `mobile/src/lib/student-validation.ts` own choices/validation. Profile edits use the provider's student update and display-name update.
- `admin/src/AdminModals.tsx` imports the same pure validation with source-relative `../../mobile/src/lib/student-validation`. Keep both clients compatible; do not add React Native or environment-dependent imports.
- Preserve unchanged legacy fields during unrelated edits. Do not invent catalogue entries or normalize historical labels wholesale.
- Admin student editing uses `admin_update_student` (011, with validation triggers replaced by 025). Suspension changes student status and server write eligibility, not an Auth ban.
- Migration 027's access-token hook rejects inactive-student login/refresh while preserving active administrator access only when separately enabled in Auth configuration. SQL installation alone is insufficient; preserve any existing hook claim transformations. Former `DEPLOYMENT.md` and `ACCOUNT_ACCESS_VERIFICATION.md` are absent; see [testing](testing.md) for coverage limits and device checks.

## Semesters and historical associations

`admin/src/SemesterManagement.tsx` and `admin/src/semester-data.ts` own the management UI/RPC mapping. Migrations 025-026 own semester-scoped options and enrollment consistency.

- Only one semester is active. Activate a draft after explicitly adding sections; activation archives the previous active semester without copying sections or automatically moving students.
- Archived semesters are read-only. Associated sections cannot be renamed. Removal archives used sections and deletes only unused sections.
- Migration 025 seeds `Legacy / Current`, not an invented academic year. Registration exposes only active sections of the active semester, including to anon through `registration_enrollment_options`.
- Enrollment changes close the current validity period and append another. Preserve past labels, associations, and validity periods; they are historical facts, not redundant mutable profile data.
- Migration 026 enforces paired option/semester values and exact option-to-semester composite FKs on current and historical rows. Course/year/campus/section text preserves legacy spelling and event-time labels.
- Check existing-data backfill anomalies and constraint failures before changing these relationships. Former `DATABASE_NORMALIZATION_AUDIT.md` contained 026 preflight queries but is absent; inspect migration 026 and historical Git content before using those queries.

Validate shared changes in both clients using [testing](testing.md). Pre-migration enrollment changes cannot be reconstructed; see [known limitations](known-limitations.md).
