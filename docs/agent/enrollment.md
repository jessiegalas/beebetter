# Registration, identity, and enrollment

Read for signup/profile validation, admin student edits, semesters/sections, or enrollment history. Paths are repository-relative.

## Identity and shared validation

- Students use their student ID and password. Mobile signup collects a nine-digit ID and an optional name or nickname. The `student-auth` Edge Function uses the Auth Admin API to create a student with an internal Auth identifier and immediately starts a session. Migration 043 creates the student, profile and initial unassigned enrollment period atomically. Existing students sign in using their recorded ID and existing password. Administrator signup still uses its separate Auth and access-request flow.
- Older confirmed accounts can resume an existing signup draft through their issued links or a restored session. The provider calls `student_complete_registration` once per session. Migration 042 allows the RPC to provision without a semester, section or goal. A pending version-1 draft keeps an active enrollment when available and retries without it after rollover. Failed drafts stay editable. Draft cleanup is best effort after completion. Legacy full-metadata signup still validates enrollment.
- `profiles` is the progression/display projection; `students` is current identity/enrollment; history stores event-time facts. Overlapping fields do not justify merging them.
- Signup, onboarding, and the mobile profile share `mobile/src/components/student-information-fields.tsx` and student identity validation in `mobile/src/lib/student-validation.ts`. Profile edits send only the student ID and name. The database synchronizes the display name as part of the student update, including when a student clears it.
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
- Older mobile releases still use `registration_enrollment_options_v2` and can complete registration with explicit option and semester IDs. New mobile releases register without the catalogue. OSAS can assign enrollment through the existing student record editor.
- Enrollment changes close the current validity period and append another. Preserve past labels, associations, and validity periods; they are historical facts, not redundant mutable profile data.
- Migration 026 enforces paired option/semester values and exact option-to-semester composite FKs on current and historical rows. Course/year/campus/section text preserves legacy spelling and event-time labels.
- Check existing-data backfill anomalies and constraint failures before changing these relationships. Former `DATABASE_NORMALIZATION_AUDIT.md` contained 026 preflight queries but is absent; inspect migration 026 and historical Git content before using those queries.

Validate shared changes in both clients using [testing](testing.md). Pre-migration enrollment changes cannot be reconstructed; see [known limitations](known-limitations.md).

Migration 034 contract checks, established-student email repair, and hosted Auth/deep-link release checks: [student authentication rollout](../../supabase/STUDENT_AUTH_ROLLOUT.md). New/reset passwords require 15 characters; existing shorter login passwords remain valid.

## Registration client boundaries

Signup and onboarding share `use-registration-form.ts`. Draft initialization is account-scoped, and metadata refreshes preserve in-progress edits. When a pending draft supplies enrollment IDs, the database checks them against the active semester.

Migrations 035/036 define enrollment locking and Auth-owned student email/grants. Migration 043 preserves the Auth-owned email for older accounts and leaves the email field empty in new student records. See [rollout](../../supabase/STUDENT_AUTH_ROLLOUT.md).
