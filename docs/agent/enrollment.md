# Registration, identity, and enrollment

Read for signup/profile validation, admin student edits, semesters/sections, or enrollment history. Paths are repository-relative.

## Identity and shared validation

- Students use their student ID and password. The signup wizard collects a nine-digit ID, password, first and last names, optional middle name and suffix, an active-semester section, and a goal. It joins the name fields into the full name before calling `student-auth`. Migration 045 creates the student, profile, and initial assigned enrollment period atomically. Supabase Auth uses an internal identifier and the app opens a session immediately.
- On updated builds, active students with no assignment finish the enrollment wizard on their existing record through `student_complete_enrollment`. After rollover, students with an existing assignment enter normally. Older confirmed drafts with a valid enrollment can still complete through `student_complete_registration`. Stale or incomplete drafts open the wizard for correction. Compatibility contracts for installed builds remain available.
- `profiles` is the progression/display projection; `students` is current identity/enrollment; history stores event-time facts. Overlapping fields do not justify merging them.
- The auth wizard and mobile profile share identity validation in `mobile/src/lib/student-validation.ts`. Profile edits send only the student ID and name. The database synchronizes the display name as part of the student update, including when a student clears it.
- `admin/src/AdminModals.tsx` imports the same pure validation with source-relative `../../mobile/src/lib/student-validation`. Keep both clients compatible; do not add React Native or environment-dependent imports.
- Preserve unchanged legacy fields during unrelated edits. Do not invent catalogue entries or normalize historical labels wholesale.
- Admin student editing uses `admin_update_student` (011, with validation triggers replaced by 025). Suspension changes student status and server write eligibility, not an Auth ban.
- Migration 027's access-token hook rejects inactive-student login/refresh while preserving active administrator access only when separately enabled in Auth configuration. SQL installation alone is insufficient; preserve any existing hook claim transformations. Former `DEPLOYMENT.md` and `ACCOUNT_ACCESS_VERIFICATION.md` are absent; see [testing](testing.md) for coverage limits and device checks.

## Semesters and historical associations

`admin/src/SemesterManagement.tsx` and `admin/src/semester-data.ts` own the management UI/RPC mapping. Migrations 025-026 own semester-scoped options and enrollment consistency.

- Only one semester is active. Activate a draft after explicitly adding sections; activation archives the previous active semester without copying sections or automatically moving students.
- Selecting a semester in the admin panel only selects its management view. Section drafts reset on selection; activation is disabled until its active sections have loaded. Saves are serialized before calling the RPC, and semester selection is disabled while a save is pending. Refresh reloads both the semester list and its sections.
- Archived semesters are read-only. Associated sections cannot be renamed. Removal archives used sections and deletes only unused sections.
- New admin section forms fix campus to `Cavite State University Bacoor City Campus`; there is no campus selector. Academic years are generated choices, and new section labels use a positive whole-number input. Existing campus/year/section labels remain unchanged; associated or nonnumeric legacy section labels are read-only. Migration 032 defines consecutive `YYYY-YYYY` years and Bacoor/numeric labels on creation or changed labels, while allowing unchanged legacy status edits. It does not rewrite stored enrollment or registration contracts.
- Migration 025 seeds `Legacy / Current`, not an invented academic year. Registration exposes only active sections of the active semester, including to anon through `registration_enrollment_options`.
- The wizard uses `registration_enrollment_options_v2`. It submits the section and semester IDs and checks that the displayed labels still match. OSAS can manage the catalogue in **Semesters & Sections** and assign enrollment through the student record editor.
- Enrollment changes close the current validity period and append another. Preserve past labels, associations, and validity periods; they are historical facts, not redundant mutable profile data.
- Migration 026 enforces paired option/semester values and exact option-to-semester composite FKs on current and historical rows. Course/year/campus/section text preserves legacy spelling and event-time labels.
- Check existing-data backfill anomalies and constraint failures before changing these relationships. Former `DATABASE_NORMALIZATION_AUDIT.md` contained 026 preflight queries but is absent; inspect migration 026 and historical Git content before using those queries.

Validate shared changes in both clients using [testing](testing.md). Pre-migration enrollment changes cannot be reconstructed; see [known limitations](known-limitations.md).

Migration 034 contract checks, established-student email repair, and hosted Auth/deep-link release checks: [student authentication rollout](../../supabase/STUDENT_AUTH_ROLLOUT.md). New/reset passwords require 15 characters; existing shorter login passwords remain valid.

## Registration client boundaries

Signup and onboarding share `use-registration-form.ts`. Draft initialization is account-scoped, and metadata refreshes preserve in-progress edits. When a pending draft supplies enrollment IDs, the database checks them against the active semester.

Migrations 035/036 define enrollment locking and Auth-owned student email/grants. Migration 043 preserves the Auth-owned email for older accounts and leaves the email field empty in new student records. See [rollout](../../supabase/STUDENT_AUTH_ROLLOUT.md).
