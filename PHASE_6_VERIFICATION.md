# BeeBetter Phase 6 verification and deployment guide

## Implemented system

BeeBetter combines student-owned quest planning with optional wellness check-ins, self-management reflections, and voluntary support requests. Check-ins and reflection text remain private. OSAS receives only minimum-cohort aggregate analytics unless a staff member separately receives identifiable support-case permission.

The mobile application implements registration and authentication, validated student profiles, quest creation/editing/completion/deletion, custom categories, proof uploads, XP and levels, Skill Tree progress, achievements, scheduling, deadlines, prerequisites, saved locations, geofencing, durable completion history, contextual recommendation ordering, wellness check-ins, reflections, personal history, and voluntary support requests.

The admin application implements student and quest management, administrator and Super Admin roles, OSAS permission management, authorized support-case management, aggregate dashboard filtering, and CSV analytics reports.

## Migration order

Apply the SQL files in numeric order from `001` through `015`. The OSAS phases depend specifically on:

1. `012_wellbeing_and_osas_foundation.sql`
2. `013_check_in_motivation.sql`
3. `014_osas_support_staff_directory.sql`
4. `015_osas_analytics_dashboard.sql`

These migrations are additive. They are not applied automatically by either application.

After migration, a Super Admin must grant `can_view_aggregates` to reporting personnel and `can_manage_support_requests` only to personnel authorized to handle identifiable voluntary requests. Revoking the permission row or deactivating the admin account immediately removes effective access.

## Student-to-OSAS data flow

1. The authenticated student writes records under their Supabase user ID. RLS limits check-ins, reflections, and support-request history to that student.
2. Private check-in notes and written reflection fields remain in their source tables and are never selected by the analytics RPC.
3. `osas_dashboard_analytics` checks `view_aggregates`, applies the selected date and demographic filters, and excludes admin accounts from the student cohort.
4. A cohort containing fewer than five registered students is suppressed completely. Each sensitive metric, trend bucket, and category cell also requires five distinct contributors.
5. The admin dashboard and CSV export consume the same RPC response. The export performs no additional database query and contains no identifiable case fields.
6. Identifiable support cases use separate RPCs guarded by `manage_support_requests`. Reporting permission alone cannot read them.

## Metric definitions

| Metric | Source and calculation |
| --- | --- |
| Registered students | Current `students` records matching campus/course/year filters, excluding IDs in `admin_users`. Date does not change this current cohort count. |
| Students with quest activity | Unique cohort students with a current quest created or a durable completion-history event during the period. |
| Completion events | `quest_completion_history` records completed during the period. Deleting the source quest does not remove this history. |
| Students with goals | Current cohort students whose goal is neither empty nor the legacy `Not specified` placeholder. |
| Current quest completion rate | Surviving quests created during the period and completed by period end, divided by surviving quests created during the period. It is unavailable when the denominator is zero. Deleted quests cannot be reconstructed in this denominator. |
| Check-in participation | Distinct students and total `student_check_ins` in the selected date range. These are separate counts. |
| Well-being, stress, energy | Arithmetic mean of the corresponding 1–5 response across check-ins. Higher stress means greater reported stress. |
| Motivation | Mean across non-null optional motivation responses; its own response count is the denominator. |
| Reflection participation | Distinct students and total reflections whose `period_end` is inside the selected range. |
| Planning, follow-through, confidence | Arithmetic mean of each 1–5 reflection score. Written fields are excluded. |
| Support requests | Requests created during the period, grouped by exact database status and category. Unique requesting students and total requests are shown separately. |
| Trend buckets | Daily for periods up to 31 days and weekly for longer periods. Every returned bucket/category has at least five distinct contributors. |

Ratings describe voluntary self-reports. They are not diagnoses, validated clinical measures, or proof that quest participation caused student development.

## Report behavior

The CSV report records the reporting period, campus, program, year level, metric definitions, denominators, privacy notes, summary indicators, and all displayed trend/category rows. Unavailable metrics are labelled unavailable rather than converted to zero. Export is disabled when the complete cohort is suppressed. Spreadsheet formula prefixes in database-derived text are escaped.

## Privacy boundaries

- Students can access only their own check-ins, reflections, and requests through RLS.
- Ordinary admins receive no aggregate wellness permission automatically.
- Reporting-only staff cannot list identifiable support cases.
- Support-only staff cannot read raw check-ins or reflections.
- Super Admin status manages permissions but does not bypass the permission checks used by reporting and support RPCs.
- Consent is required by the `support_requests` constraint and insert policy.
- Reports exclude names, student numbers, email, messages, contact details, notes, reflection text, precise location, and individual quest details.

## Deployment and manual verification

1. Back up the target database and apply migrations in numeric order through `015` in the Supabase SQL Editor or the project's controlled migration process.
2. Configure mobile and admin Supabase environment variables.
3. Grant test accounts the two OSAS permissions independently and verify revocation with fresh sessions.
4. Use at least five consenting synthetic students per tested aggregate cell; smaller groups are intentionally hidden.
5. Test CSV download in each supported desktop browser and open it in the institution's spreadsheet software.
6. Complete Android-device checks for background geofencing, notification delivery/actions, camera or gallery proof selection, keyboard avoidance, long-form scrolling, and file upload under interrupted networks. These native behaviors cannot be fully verified by TypeScript, web export, or PGlite.

## Known limitations and future work

- PDF export is not included; CSV is portable, auditable, and generated without adding a document-rendering dependency.
- Sparse trend/category cells disappear because of the privacy threshold and must not be interpreted as zero.
- Historical student demographics are not versioned, so current campus/course/year values determine historical cohort membership.
- The system does not collect clinical screening data and must not be used to infer a diagnosis.
- Native background behavior and institutional resource URLs require deployment-specific physical-device verification.
- Messaging, automatic intervention, predictive risk scoring, and additional analytics are outside Phases 1–6.
