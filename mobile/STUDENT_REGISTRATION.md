# Student registration and standardized information

Apply `supabase/011_student_registration_validation.sql` after migrations 001-010 before deploying this registration form. No hosted database changes are made by the code or test scripts.

The migration adds a small `student_enrollment_options` catalogue containing only campus/program/year/section combinations. It seeds recognizable combinations from existing student records, without rewriting those records. Review seeded entries for spelling or duplicate school names. If there are no valid existing combinations, an administrator must populate this table with the school's official options before new students can register. Do not insert example campuses or sections into production. Active admins can maintain the catalogue under row-level security; anonymous visitors can only read these non-personal dropdown options, not student records.

Programs BSCS, BSIT, BSHM and BSCrim are available alongside Others. Others saves the actual specified program, not the word "Others"; its campus/year/section combination must also be configured in the catalogue. Years use 1st Year through 5th Year. Selecting a different program, year, or campus clears the old section. Sections are filtered using all three fields.

Registration, profile editing, and admin editing share the pure validation in `src/lib/student-validation.ts`:

- Full name: up to 30 characters, Unicode letters, spaces, periods, hyphens, and apostrophes.
- Student number: exactly 9 ASCII digits; keyboard and paste filtering prevent other characters.
- Email: valid format, maximum 254 characters; registration trims and lowercases it.
- Password: existing minimum of 6 characters retained; maximum 72 characters and 72 UTF-8 bytes. Passwords remain handled only by Supabase Auth. Keep the hosted Auth minimum password length at least 6; stronger hosted settings remain authoritative and their errors are displayed. No raw passwords are written to student metadata or tables. See https://supabase.com/docs/guides/auth/password-security and https://github.com/supabase/auth/blob/master/internal/api/password.go.
- Program: maximum 60 characters; campus 80; section 30; goal 200. These fields remain required, matching the existing registration flow.

Database triggers validate new student rows created through the existing Auth signup trigger, as well as changed fields written directly or through admin RPCs. Legacy values remain readable and can remain unchanged during unrelated edits; changing an old number/name or school combination brings that field under the new rules. Common program aliases and numeric years are normalized for new/changed school combinations. Existing email/password login and confirmation/resend flows remain in place. No destructive data cleanup or student-field duplication is performed.

Validation:

```powershell
# From mobile
npm run test:students
npm run test:context
node scripts/test-context-database.cjs ../../../.context-validation/node_modules/@electric-sql/pglite
npx tsc --noEmit
```

The database suite uses an isolated PostgreSQL runtime and real migrations/triggers, including signup metadata validation, duplicate student numbers, catalogue permissions, legacy edits, and admin RPCs. It does not exercise hosted email delivery, password hashing, or real device keyboards. Verify signup, confirmation, login, dropdown searches, and profile edits on a device after configuring the hosted catalogue and Auth settings.
