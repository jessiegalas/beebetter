# BeeBetter Comprehensive System Diagnostic

**Audit date:** 2026-09-27  
**Scope:** `mobile/src`, `admin/src`, Supabase migrations `001`–`015`, configuration, and automated tests. Generated directories were excluded.  
**Method:** Targeted source inspection and non-destructive TypeScript and automated test execution. No migration was applied to a deployed database, and no production or HTML build was generated.

## 1. Executive Summary

BeeBetter has a coherent working core: student-owned records are generally isolated by RLS; quest completion through `complete_quest` is atomic; completion history survives quest deletion; wellness notes and written reflections are omitted from OSAS analytics; support-case access is separated from aggregate reporting; recommendation ordering is deterministic and tested; and the dashboard and CSV use the same aggregate payload.

The system is not ready for uncontrolled deployment without integrity hardening. The most serious issue is that RLS protects rows by owner but does not protect server-controlled columns or state transitions. An authenticated student can directly update their own `profiles.total_xp`, `profiles.level`, and `profiles.current_streak`, and can directly change an owned quest to `completed`, bypassing the proof-aware completion RPC. Students can also restore their own `students.status` to `Active`, while the admin UI describes that field as account suspension even though it does not block authentication or data access.

The admin application still contains several demonstrably simulated functions: messaging, reminders, activity history, notifications, archive, quest “edit,” and time-period leaderboard values. These can create false operational claims during thesis evaluation. The OSAS dashboard itself is materially stronger, but minimum-cell suppression is vulnerable to difference attacks across overlapping filters, and historical results use current student demographics rather than demographics at event time.

No Critical issue was identified that directly exposes all private records without authorization. Four High-priority groups require attention before deployment:

1. Protect XP and quest state transitions at the database layer.
2. Replace the misleading suspension mechanism with enforceable access status.
3. remove or implement simulated admin actions and fabricated leaderboard periods.
4. Harden aggregate disclosure protection against repeated overlapping queries.

### Verified strengths

- Student check-ins and reflections use owner RLS in `012_wellbeing_and_osas_foundation.sql`.
- Identifiable cases require `manage_support_requests`; aggregate reporting separately requires `view_aggregates`.
- Inactive admin accounts fail `is_active_admin` and therefore lose effective OSAS access.
- `complete_quest` locks the quest row and updates completion, durable history, and XP in one transaction.
- Prerequisite graphs are owner-scoped and serialized with an advisory transaction lock.
- Quest completion history retains title/category/time after quest deletion.
- Analytics and CSV exclude note, written reflection, case-message, identity, and location fields.
- Check-ins are limited to one record per student per date.
- Support submission requires explicit true consent and starts in `submitted` without assignment or resolution fields.

### Checks executed

| Check | Result |
| --- | --- |
| Mobile TypeScript | Passed |
| Admin TypeScript | Passed |
| Admin lint | Passed |
| Recommendation/unit suite | 44 passed |
| Student validation suite | 6 passed |
| Database integration suite | 24 passed |
| Wellness/OSAS authorization suite | Passed |
| Motivation migration suite | Passed |
| CSV report suite | Passed |

These tests establish valuable behavior but do not invalidate the findings below; several risky direct database operations are not tested.

## 2. Confirmed Functional Defects

### F-01 — “Suspend account” neither blocks access nor remains authoritative

- **Status / severity / scope:** Confirmed — **High** — Database, mobile, admin.
- **Evidence:** `admin/src/App.tsx` labels the status toggle “Suspend account.” `admin_update_student` in migrations `007` and `011` only updates `students.status`. Authentication, quest RLS, wellness RLS, support RLS, and application session loading never check that status. The student update policy in `005_students.sql` permits the owner to update the whole row, including `status`.
- **Impact:** A supposedly suspended student can continue signing in, using quests, submitting private records and support requests, and can set their own status back to `Active` through the API. The UI communicates an enforcement capability that does not exist.
- **Corrective action:** Make account availability a server-enforced field that students cannot update. Check it in sensitive RPCs and write policies, and use a controlled Auth suspension/ban process if login itself must be blocked. Rename the UI until enforcement exists.

### F-02 — Admin messaging, reminders, archive, notifications, and activity are simulated

- **Status / severity / scope:** Confirmed — **High** — Admin.
- **Evidence:** In `admin/src/App.tsx`, `MessageModal` only produces a local toast; “Send reminder” only calls `setNotice`; archive only removes matching titles from React state; `ActivityModal` contains fixed “Take a mindful walk” and badge events; the notification popover always reports a new review and “12 new users.” No corresponding RPC, message table, notification send, archive state, or activity query exists.
- **Impact:** Administrators can be told that communication or archival occurred when nothing was persisted or delivered. Fabricated student activity is especially unsuitable for OSAS or thesis demonstrations.
- **Corrective action:** Remove or clearly disable these controls until backed by auditable server operations. Replace activity with durable, authorized records only. Never report a successful external action from local state alone.

### F-03 — Admin quest “Edit” creates another assignment

- **Status / severity / scope:** Confirmed — **Medium** — Admin, database.
- **Evidence:** `QuestDetails` opens `QuestModal`, but its heading changes to “Assign another quest”; submission always calls `createQuest`/`admin_create_quest`. There is no admin update RPC. Description, assignee, category, and difficulty do not initialize consistently from the selected quest.
- **Impact:** An administrator expecting an edit creates duplicate quest rows, potentially for every active student.
- **Corrective action:** Rename the action to duplicate/reassign immediately, or implement an owner-scoped admin update operation with an explicit multi-assignment model.

### F-04 — The leaderboard fabricates reporting periods

- **Status / severity / scope:** Confirmed — **High** — Admin.
- **Evidence:** `Leaderboard` in `admin/src/App.tsx` sorts the all-time count from `admin_list_students`. Selecting “This month” multiplies it by `1.4`; “This week” leaves it unchanged. Labels such as “on a roll” are unconditional. The underlying count uses surviving completed quest rows, not period-filtered durable history.
- **Impact:** Displayed rankings and period values are mathematically invented and can contradict the analytics dashboard.
- **Corrective action:** Remove the period selector and decorative claims, or query durable completion history for the exact selected period. Consider whether a competitive student leaderboard is appropriate for OSAS use.

### F-05 — Admin accounts contaminate operational student lists and mass assignment

- **Status / severity / scope:** Confirmed — **Medium** — Database, admin.
- **Evidence:** `handle_new_user` in `005_students.sql` creates a `students` row for every Auth user, including admin signups. Migration `015` explicitly excludes `admin_users` from analytics, but `admin_list_students` and `admin_create_quest` do not. “Everyone” inserts one quest for every active `students` row.
- **Impact:** Administrators appear as students and may receive quests. Counts differ between management pages and the OSAS dashboard.
- **Corrective action:** Separate account/person roles or consistently exclude active admin IDs from student-only queries and assignment. Migrate existing dual-role records deliberately.

### F-06 — Fresh installations have a registration catalogue bootstrap cycle

- **Status / severity / scope:** Confirmed — **High** — Database, deployment, mobile.
- **Evidence:** Migration `011` seeds `student_enrollment_options` only from already-valid student records. New registration requires a catalogue match in `validate_student_information`. A fresh database has no valid school combinations unless they are inserted manually; no admin catalogue UI exists.
- **Impact:** Student registration can be impossible after a clean deployment even though the application is otherwise configured.
- **Corrective action:** Treat the catalogue as required deployment data, supply an institution-approved seed/migration, or build a super-admin catalogue workflow before opening registration.

### F-07 — Streak is displayed but never maintained

- **Status / severity / scope:** Confirmed — **Medium** — Database, mobile, admin.
- **Evidence:** `profiles.current_streak` is created in migration `001` and displayed on Home/Profile/admin. No trigger or RPC updates it. Client fallbacks even use `1` when profile data is absent in `user-data-context.tsx`.
- **Impact:** Streak UI is static or misleading and cannot reliably represent engagement.
- **Corrective action:** Define the exact streak event and timezone, update it transactionally, or remove the indicator.

### F-08 — Collected motivation is absent from personal history

- **Status / severity / scope:** Confirmed — **Low** — Mobile.
- **Evidence:** Check-in creation stores `motivation_level`, but `wellness-history.tsx` averages and renders only well-being, stress, and energy.
- **Impact:** Students cannot review one of the signals used in their recommendations, reducing transparency.
- **Corrective action:** Include optional motivation with clear missing-response handling, or stop collecting it if it is not useful to students.

### F-09 — Verified institutional resource access is not implemented

- **Status / severity / scope:** Confirmed missing capability — **Medium** — Mobile, deployment.
- **Evidence:** `support-requests.tsx` explicitly states that no verified resource links are configured.
- **Impact:** Students with urgent needs receive only generic advice to contact OSAS or emergency services.
- **Corrective action:** Add institution-owned, versioned resources with campus applicability and an accountable update process. This is content/deployment work, not clinical screening.

## 3. Security and Data Integrity Risks

### S-01 — Students can directly forge XP, levels, and streaks

- **Status / severity / scope:** Confirmed — **High** — Database, mobile/admin integrity.
- **Evidence:** The `profiles` update policy in `001_initial_schema.sql` permits any authenticated owner to update their entire profile row. There are no column-level revokes or validation trigger protecting `total_xp`, `level`, or `current_streak`. `complete_quest` assumes these are server-maintained.
- **Impact:** A student can award arbitrary XP and levels through the Supabase API, invalidating Skill Tree progress, achievements, admin displays, and any future XP analytics.
- **Corrective action:** Revoke direct updates to progression columns. Expose a narrow profile-name RPC or column privilege, and make XP/streak changes possible only through server-validated RPCs. Add an invariant test that a student cannot alter progression directly.

### S-02 — Direct quest updates bypass proof-aware completion and can fabricate history

- **Status / severity / scope:** Confirmed — **High** — Database, analytics.
- **Evidence:** The owner update policy on `quests` from migration `001` permits changing `status`. A direct `status='completed'` update fires `stamp_quest_completion` and `record_quest_completion` but bypasses `complete_quest` proof validation. The client uses the RPC, but RLS does not require it.
- **Impact:** Students can fabricate completion history and OSAS participation/category metrics without required proof. XP may then disagree with completion state because the direct update does not award XP.
- **Corrective action:** Prevent client updates to server-controlled status/proof/completion fields; route completion through the RPC. Add database tests for direct-update denial and consistency between status, history, proof, and XP.

### S-03 — Aggregate suppression is vulnerable to difference attacks

- **Status / severity / scope:** Confirmed architectural risk — **High** — Database, admin reporting.
- **Evidence:** `osas_dashboard_analytics` suppresses direct cohorts below five, but authorized staff can repeatedly query overlapping all/campus/course/year combinations. Exact counts, sums implied by counts and averages, and status totals allow subtraction between a cohort of six and an overlapping cohort of five to isolate the remaining person. There is no complementary suppression, query auditing, rate limit, or privacy budget.
- **Impact:** Repeated legitimate-looking requests can infer an individual’s participation, check-in contribution, or support-request state in small institutions.
- **Corrective action:** Use approved non-overlapping cohort definitions, complementary suppression, rounded/coarsened outputs, minimum population rules across query history, or a disclosure-control service. Log export/query activity and conduct a re-identification review.

### S-04 — Wellness and reflection dates accept future or strategically overlapping records

- **Status / severity / scope:** Confirmed — **Medium** — Database, mobile recommendations, analytics.
- **Evidence:** `student_check_ins.check_in_date` has no “not future” constraint. Reflections constrain ordering and duration but not future dates or overlap. Recommendation loading selects the latest date, so a future record can hide a legitimate recent record; analytics accepts it when that future range is queried.
- **Impact:** Accidental clock errors or deliberate API calls can distort trends and recommendation context.
- **Corrective action:** Define allowed date windows server-side, validate period semantics, and decide whether overlapping reflections are permissible. Select the latest eligible record rather than simply the greatest date.

### S-05 — Reflection-to-quest association does not validate ownership

- **Status / severity / scope:** Confirmed — **Medium** — Database.
- **Evidence:** `self_management_reflections.quest_id` is a plain FK to `quests(id)`. RLS checks only `student_id = auth.uid()`; no trigger requires the referenced quest owner to match the student.
- **Impact:** A known or leaked quest UUID can create cross-student associations and corrupt relational meaning, even though quest RLS prevents normal discovery and written reflection content remains private.
- **Corrective action:** Add an ownership validation trigger or composite relationship and test cross-owner rejection.

### S-06 — Proof storage lacks file governance and cleanup guarantees

- **Status / severity / scope:** Confirmed limitation — **Medium** — Storage, mobile, operations.
- **Evidence:** Storage policies in migration `003` restrict the first folder to the user but impose no MIME allowlist, maximum size, or quota. `complete_quest` verifies path existence, not object MIME/size. Client cleanup occurs only on caught completion failure; crashes and quest deletion leave objects.
- **Impact:** Orphaned or oversized private files can accumulate, increase cost, and create content-handling risk.
- **Corrective action:** Enforce bucket MIME/size policies, add object metadata validation, quota/retention rules, and cleanup for abandoned or deleted quest proofs.

### S-07 — Support withdrawal destroys case-management context

- **Status / severity / scope:** Confirmed — **Medium** — Database, OSAS case management.
- **Evidence:** `student_withdraw_support_request` clears `assigned_to`, `resolution_note`, and `resolved_at`, including for acknowledged/in-progress cases. Case updates overwrite one mutable note and assignment; no event/audit table exists.
- **Impact:** Legitimate staff work and accountability history can be erased, and the system cannot reconstruct who did what or when.
- **Corrective action:** Preserve immutable case events and withdrawal timestamps. Hide or restrict active handling after withdrawal without deleting prior audit data.

### S-08 — Precise location permission is requested automatically on sign-in

- **Status / severity / scope:** Confirmed privacy/UX risk — **Medium** — Mobile.
- **Evidence:** `LocationProvider` automatically calls `startTracking`; `useCurrentLocation` requests foreground and then background permission. This occurs as part of provider initialization rather than an explicit saved-location/recommendation opt-in.
- **Impact:** Students may face foreground/background location prompts before understanding the optional feature. This can reduce trust and permission acceptance.
- **Corrective action:** Request foreground/background permissions progressively when a student enables nearby recommendations or geofencing. Explain local processing, saved coordinates, retention, and how to disable it.

## 4. Architecture and Technical Debt

### A-01 — Expo Router and an unused legacy navigator coexist

- **Status / severity / scope:** Confirmed — **Medium** — Mobile.
- **Evidence:** The package entry is `expo-router/entry` and active routes live under `mobile/src/app`. A separate `src/navigator` tree contains `AppNavigator`, auth stack, tabs, and duplicate screens, with no import from the active root.
- **Impact:** Developers may fix or test the wrong screen; dependencies and lint surface are larger; behavior can diverge between duplicate implementations.
- **Corrective action:** Confirm no native entry consumes the legacy tree, then remove it and document Expo Router as the single navigation architecture.

### A-02 — Admin is a tightly coupled monolith with obsolete features mixed into real management

- **Status / severity / scope:** Confirmed — **Medium** — Admin.
- **Evidence:** `admin/src/App.tsx` owns authentication, all section routing, student/quest/admin state, CRUD modals, leaderboard, simulated actions, and permission integration in one file. Styling is similarly concentrated in a compressed `App.css`.
- **Impact:** Security-sensitive and placeholder flows are hard to distinguish, test, and review. Small changes risk unrelated regressions.
- **Corrective action:** Split route-level features and data hooks, define typed service boundaries, and add component tests around real mutations.

### A-03 — Progression state is duplicated and can drift

- **Status / severity / scope:** Confirmed — **Medium** — Database, mobile.
- **Evidence:** `profiles` stores both `total_xp` and `level`; mobile also derives level with `calculateLevel`. Direct profile updates compound the risk. Skill Tree node names are unlocked solely by global XP, not demonstrated category-specific capability.
- **Impact:** Stored and derived levels can disagree, and “Focus,” “Fitness,” or “Nutrition” milestones imply skills not evidenced by the data.
- **Corrective action:** Store one authoritative progression value or enforce a generated invariant. Rename milestones as XP milestones or define evidence-based category progression.

### A-04 — Large unpaginated reads will degrade with real usage

- **Status / severity / scope:** Probable at scale — **Medium** — Mobile, admin, database.
- **Evidence:** Mobile fetches all quests and completion history; wellness history fetches all records. Admin loads all students, quests, support cases, and admins, then filters in memory. Quest/Home/Skill Tree primarily use `ScrollView` and mapped children rather than virtualized lists.
- **Impact:** Memory use, network time, render cost, and lower-end Android responsiveness worsen as records accumulate.
- **Corrective action:** Add server pagination/range queries, bounded history windows, virtualized lists, and indexes aligned with final query patterns.

### A-05 — Migration history repeatedly replaces functions and is only partly rerunnable

- **Status / severity / scope:** Confirmed technical debt — **Medium** — Database, deployment.
- **Evidence:** Admin functions and `handle_new_user` are redefined in multiple migrations. Later behavior depends strictly on numeric order. Newer migrations use defensive drops, but migration `001` creates policies without `drop policy if exists`, so the complete chain is not globally repeatable. Tests selectively reapply only later migrations.
- **Impact:** Partial deployments and manual reruns are difficult to reason about; a failed mid-chain installation can leave older authorization behavior.
- **Corrective action:** Add a schema-version/deployment checklist, test a clean full chain and supported upgrade paths, and use one-way migration tooling rather than treating every historical file as rerunnable.

### A-06 — Legacy and derived context fields remain in the model

- **Status / severity / scope:** Confirmed — **Low** — Database, mobile.
- **Evidence:** `quests.is_nearby` is stored and written by clients, while ranking explicitly refuses to treat it as live proximity. Location is actually derived from coordinates/geofence events.
- **Impact:** The field invites misuse and creates contradictory representations.
- **Corrective action:** Deprecate/remove it in a future migration after compatibility review, or document it strictly as legacy metadata.

## 5. Context-Aware System Weaknesses

### C-01 — Context changes ordering, but effectiveness is not measured

- **Status / severity / scope:** Confirmed limitation — **Medium** — Cross-system/research validity.
- **Evidence:** `quest-priority.ts` has deterministic weights and 44 passing ordering tests, but the system records no recommendation exposure, selected rank, reason shown, acceptance, dismissal, or completion attributable to a recommendation.
- **Impact:** The thesis can show that the algorithm changes order, but cannot establish that recommendations improved self-management or engagement.
- **Corrective action:** If approved in a future phase, collect minimal privacy-conscious recommendation interaction events and predefine evaluation measures. Do not infer effectiveness from explanations alone.

### C-02 — XP is a weak proxy for effort and drives “manageable” wellness adaptation

- **Status / severity / scope:** Confirmed conceptual weakness — **Medium** — Mobile, recommendation design.
- **Evidence:** Low energy/stress/low scores favor quests with `xp <= 30`. Students choose XP for their own quests, and admins map only Easy/Medium/Hard to 20/35/60. No duration, complexity calibration, or observed effort exists.
- **Impact:** A difficult task assigned low XP may be recommended as manageable; an easy high-XP task may be suppressed. Skill Tree progress has the same validity problem.
- **Corrective action:** Relabel XP as reward points, not effort, or add a separate validated effort/duration field. Test adaptation against user-rated effort.

### C-03 — Prerequisites influence ranking but do not enforce completion order

- **Status / severity / scope:** Confirmed design limitation — **Medium** — Database, mobile.
- **Evidence:** Waiting prerequisites reduce score/tier, but `complete_quest` does not check prerequisite completion. The database test explicitly confirms a dependent quest can be completed manually.
- **Impact:** The UI suggests sequencing while the transaction model permits bypass, which can surprise users and weaken progression semantics.
- **Corrective action:** Decide whether prerequisites are advice or rules. Label them accordingly; if rules, enforce them in `complete_quest` with a documented override policy.

### C-04 — Wellness adaptation is intentionally subtle and may be invisible

- **Status / severity / scope:** Confirmed behavior, runtime value requires evaluation — **Low** — Mobile.
- **Evidence:** Wellness adds only 3–6 points after the main tier is chosen; location/schedule/deadline weights reach 32–46. Reasons are truncated to three, although the personal reason is inserted when applicable.
- **Impact:** This correctly avoids overriding the original hierarchy, but many real quest sets will show little or no observable reorder. Users may expect a stronger response after check-in.
- **Corrective action:** Explain that wellness is a tie-breaker, display when context was considered, and validate behavior with representative quest datasets before changing weights.

### C-05 — Wellness context does not refresh from remote changes while the provider stays mounted

- **Status / severity / scope:** Probable — **Low** — Mobile.
- **Evidence:** `QuestPriorityProvider` loads wellness on user change and a process-local listener fired by local saves. Unlike quest data, it has no app-resume or periodic remote refresh.
- **Impact:** A check-in/reflection written on another device may not affect recommendations until remount or local submission.
- **Corrective action:** Refresh eligible context on app resume/explicit refresh or subscribe to scoped Realtime changes.

### C-06 — Reporting dates and timestamps use different timezone semantics

- **Status / severity / scope:** Confirmed architectural limitation — **Medium** — Database, analytics.
- **Evidence:** Check-ins/reflections use `date`; quest/support events use `timestamptz` bounded by `start_date::timestamptz` and bucketed with server-session casts. The institution timezone is not an RPC parameter or explicit conversion.
- **Impact:** Events near midnight can appear on different reporting dates from the student’s Manila-local experience.
- **Corrective action:** Define the institutional reporting timezone and use explicit `AT TIME ZONE` conversions consistently in ranges and buckets.

## 6. OSAS Analytics and Reporting Limitations

### O-01 — Historical reports use current demographics

- **Status / severity / scope:** Confirmed — **Medium** — Database, reporting.
- **Evidence:** Migration `015` joins event records to the current `students.course`, `year_level`, and `campus`; no demographic history exists.
- **Impact:** Editing or advancing a student retroactively moves old check-ins, completions, reflections, and requests between cohorts.
- **Corrective action:** Snapshot approved demographic dimensions on events or maintain effective-dated enrollment history.

### O-02 — Response averages give frequent submitters more weight

- **Status / severity / scope:** Confirmed, accurately documented but potentially misleading — **Medium** — Analytics/admin.
- **Evidence:** Dashboard averages use `avg()` across check-ins/reflections, while distinct student counts are displayed separately. A student with many responses contributes more weight than one with one response.
- **Impact:** OSAS may interpret results as an average student rather than an average submission.
- **Corrective action:** Label them “average response,” and consider also reporting the mean of per-student means with the same suppression controls.

### O-03 — Completion rate has survivorship bias

- **Status / severity / scope:** Confirmed and disclosed — **Medium** — Analytics.
- **Evidence:** The denominator is current quest rows created in the period; deleted quests are absent. Durable history preserves completion events but cannot reconstruct all deleted created quests.
- **Impact:** Deleting incomplete quests can inflate the rate. The CSV and dashboard disclose this, but the metric remains unsuitable for longitudinal performance claims.
- **Corrective action:** Add immutable quest-created/closed history before using completion rate as an institutional KPI.

### O-04 — Overall participation can report fewer than five active contributors

- **Status / severity / scope:** Confirmed privacy limitation — **Medium** — Database/admin.
- **Evidence:** Once the registered cohort reaches five, `participating_students` and total `completion_events` are returned even when only one student had activity. Trend/category cells require five contributors, but the top-level activity summary does not.
- **Impact:** Narrow demographic filters may reveal that one member participated, especially when combined with external knowledge.
- **Corrective action:** Apply contributor thresholds or complementary suppression to top-level activity metrics as well.

### O-05 — Empty and suppressed metric states are intentionally indistinguishable

- **Status / severity / scope:** Confirmed tradeoff — **Low** — Admin/reporting.
- **Evidence:** `ProtectedEmpty` and CSV both combine “no records” with “fewer than five contributors.”
- **Impact:** This protects privacy but limits operational interpretation; staff cannot tell non-use from suppression.
- **Corrective action:** Retain nondisclosure, but document the ambiguity prominently and avoid decisions based on absence.

### O-06 — Filter options come from the catalogue, not observed report cohorts

- **Status / severity / scope:** Confirmed limitation — **Low** — Database/admin.
- **Evidence:** `osas_dashboard_filter_options` reads `student_enrollment_options` rather than current student records.
- **Impact:** Users may select valid catalogue values with no current students and receive suppression/empty results; legacy student values may be unavailable as filters.
- **Corrective action:** Decide whether filters represent official catalogue or observed cohorts. If observed, return privacy-safe distinct dimensions from eligible students without counts.

### O-07 — CSV is consistent with the dashboard but is a client-side artifact

- **Status / severity / scope:** Confirmed limitation — **Low** — Admin/governance.
- **Evidence:** `osas-report.ts` exports the current RPC payload, includes definitions, escapes formula prefixes, and blocks fully suppressed cohorts. There is no report audit record, server signature, retention policy, or revocation after download.
- **Impact:** Once downloaded, sensitive aggregate files are outside application access control.
- **Corrective action:** Establish institutional handling policy and optionally log exports with actor, filters, and timestamp without storing report contents.

## 7. Mobile and Admin UX Issues

### U-01 — Home and Quests present high information density

- **Status / severity / scope:** Subjective improvement supported by structure — **Low** — Mobile.
- **Evidence:** Home combines recommendation, quick actions, XP, three wellness actions, support, and Skill Tree. Quests combines two views, filters, grouped tiers, proof controls, details, edit/delete, and rewards in one screen.
- **Impact:** New users may have difficulty identifying the primary next action; lower-end devices render many nested mapped views.
- **Corrective action:** Validate with task-based usability testing, progressive disclosure, and virtualized lists before redesigning.

### U-02 — Background location permission lacks an in-app decision point

- **Status / severity / scope:** Confirmed — **Medium** — Mobile.
- **Evidence:** See S-08. Permission is triggered by provider startup, while saved-location management is a separate screen.
- **Impact:** Permission prompts lack context and can feel mandatory although quest functionality works without location.
- **Corrective action:** Gate permission behind a clear optional feature explanation and provide a visible disable control.

### U-03 — Admin dialogs lack robust dialog accessibility

- **Status / severity / scope:** Probable — **Medium** — Admin.
- **Evidence:** Drawers/modals are generic `div`/`aside` overlays without `role="dialog"`, `aria-modal`, focus trapping, Escape handling, or focus restoration. Many icon close buttons lack descriptive labels.
- **Impact:** Keyboard and screen-reader users can lose context or navigate behind open overlays.
- **Corrective action:** Introduce an accessible dialog primitive and test keyboard-only workflows.

### U-04 — Skill Tree labels overstate what XP demonstrates

- **Status / severity / scope:** Confirmed conceptual UX issue — **Medium** — Mobile.
- **Evidence:** Static nodes named Focus, Discipline, Fitness, Nutrition, Study, and Rest unlock from total XP regardless of quest category or evidence.
- **Impact:** The UI presents reward accumulation as specific skill development.
- **Corrective action:** Rename them to neutral XP milestones or define category-specific, evidence-backed progression.

### U-05 — Support priority is self-selected without service-level semantics

- **Status / severity / scope:** Confirmed limitation — **Low** — Mobile/admin.
- **Evidence:** Students choose Normal/Soon/Urgent; the database stores it, but there is no response-time rule, escalation, notification, or emergency routing. The UI correctly warns that response is not immediate.
- **Impact:** “Urgent” may create expectations the workflow cannot meet.
- **Corrective action:** Define institution-approved meanings and operating procedures, or relabel as requested response priority.

## 8. Missing Test Coverage

### T-01 — Server-controlled column attacks are not tested

- **Status / severity / scope:** Confirmed gap — **High** — Database tests.
- **Evidence:** Tests exercise `complete_quest`, ownership, proof, and atomic XP, but do not assert denial of direct profile XP updates, direct quest completion, or student status reactivation.
- **Impact:** The most important integrity bypasses coexist with a green suite.
- **Corrective action:** Add adversarial authenticated-client tests before implementing the policy fix, then retain them as regression tests.

### T-02 — Disclosure control is tested per query, not across queries

- **Status / severity / scope:** Confirmed gap — **High** — Analytics/security tests.
- **Evidence:** `test_012_wellbeing_security.cjs` verifies a cohort below five is suppressed but does not test differencing between overlapping allowed cohorts.
- **Impact:** Minimum-cell tests create false confidence against re-identification.
- **Corrective action:** Add a disclosure-threat test matrix and document which repeated-query attacks the chosen controls prevent.

### T-03 — Admin mutations and UI claims lack integration tests

- **Status / severity / scope:** Confirmed gap — **Medium** — Admin.
- **Evidence:** Only CSV has an admin-specific automated test. There are no UI/service tests for student updates, assignment, admin roles, support filtering/update, revocation during an active session, or the simulated controls.
- **Impact:** Broken or fake workflows can ship while TypeScript and lint pass.
- **Corrective action:** Add service-level tests against local Supabase/PGlite where possible and browser component/E2E tests for critical admin actions.

### T-04 — Wellness persistence tests omit adversarial time and relationship cases

- **Status / severity / scope:** Confirmed gap — **Medium** — Database/mobile.
- **Evidence:** Existing tests cover owner isolation, one-day upsert behavior, and aggregate threshold, but not future dates, overlapping periods, cross-owner `quest_id`, deletes, or concurrent same-day writes.
- **Impact:** Integrity edge cases remain unverified.
- **Corrective action:** Add database tests for each invariant and a deliberate policy for delete/edit history.

### T-05 — Native Android behavior remains unverified

- **Status / severity / scope:** Requires runtime verification — **High** — Mobile/device.
- **Evidence:** Unit/PGlite tests do not execute Android background geofencing, OEM task killing, runtime permission sequences, notification actions, camera/gallery proof selection, large upload interruption, keyboard resize, or map performance.
- **Impact:** Core contextual and proof workflows may behave differently on target hardware despite web/TypeScript success.
- **Corrective action:** Run a physical-device matrix covering at least one low-memory Android device and the deployment Android version; record permission and background-state evidence.

### T-06 — Clean and partial migration deployment paths are under-tested

- **Status / severity / scope:** Confirmed gap — **Medium** — Database/deployment.
- **Evidence:** Tests construct simplified Auth/Storage schemas and selectively rerun migrations. They do not use a real Supabase local stack or test failures/resumption after every migration boundary.
- **Impact:** PostgreSQL/Supabase-specific privileges, storage behavior, and manual partial application can differ from PGlite.
- **Corrective action:** Add a Supabase CLI CI job for clean migration application and representative upgrades, while retaining fast PGlite tests.

### T-07 — Performance and accessibility have no automated thresholds

- **Status / severity / scope:** Confirmed gap — **Low** — Mobile/admin.
- **Evidence:** No list-size, render-performance, keyboard-navigation, focus, screen-reader, or color-contrast tests are present.
- **Impact:** Usability regressions are likely to emerge only during final device evaluation.
- **Corrective action:** Add representative large fixtures, React performance profiling on target Android, and an admin accessibility scan plus manual keyboard test.

## 9. Recommended Improvement Roadmap

### Phase A — Integrity and access enforcement

1. Lock down `profiles` progression fields and `quests` completion/proof fields.
2. Make student inactive/suspension status server-enforced and student-immutable.
3. Add adversarial tests for XP forgery, direct completion, proof bypass, and reactivation.
4. Add reflection quest-ownership validation and future-date rules.

This phase should precede analytics refinement because current completion and XP data can be forged.

### Phase B — Remove deceptive admin behavior

1. Remove/disable simulated message, reminder, notification, archive, and activity controls.
2. Replace the fabricated leaderboard with durable period queries or remove it.
3. Correct quest Edit semantics.
4. Exclude admin accounts from student lists and “Everyone” assignment.
5. Gate the admin shell on an active admin role, not merely an authenticated session.

### Phase C — Privacy and case accountability

1. Design complementary suppression/non-overlapping reporting cohorts and query/export audit logs.
2. Apply contributor thresholds to top-level participation metrics.
3. Add immutable support-case events; preserve assignment and follow-up history on withdrawal.
4. Add proof upload limits, validation, cleanup, and retention policy.

### Phase D — Data semantics and longitudinal accuracy

1. Define the institutional timezone and update report boundaries/buckets.
2. Add effective-dated enrollment or demographic snapshots.
3. Add immutable quest lifecycle history for valid completion denominators.
4. Decide whether averages represent submissions or students and label both clearly.
5. Define and implement streak semantics or remove streak UI.

### Phase E — Architecture and scalability

1. Remove the unused legacy navigation tree after confirming the active entry path.
2. Split the admin monolith into route-level features and typed services.
3. Add pagination, bounded history queries, and virtualized mobile lists.
4. Consolidate progression truth and deprecate `is_nearby`.
5. Move migration verification to a real local Supabase CI environment.

### Phase F — Recommendation and UX validation

1. Clarify XP versus effort and prerequisites as advice versus enforcement.
2. Add transparent context-considered indicators and refresh remote wellness context.
3. Request location progressively rather than at provider startup.
4. Conduct task-based usability and accessibility testing.
5. Complete the physical Android matrix before final thesis evaluation.

The roadmap deliberately preserves working RLS isolation, atomic completion logic, durable history, OSAS permission separation, and the existing deterministic ranking hierarchy while correcting the controls and claims that currently undermine trust in those features.
