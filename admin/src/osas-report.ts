import type { DashboardAnalytics, DashboardFilters } from './osas-data';

const unavailable = 'Unavailable: no records or fewer than five distinct contributors';
const cell = (value: unknown): string => {
  if (value == null) return 'Unavailable';
  const text = String(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
};
const csvCell = (value: unknown) => `"${cell(value).replaceAll('"', '""')}"`;

export function buildOsasReportCsv(data: DashboardAnalytics, filters: DashboardFilters, generatedAt = new Date()): string {
  if (data.suppressed || !data.participation) throw new Error(`Export unavailable because the selected cohort contains fewer than ${data.minimum_cohort} students.`);
  const rows: unknown[][] = [];
  const add = (...values: unknown[]) => rows.push(values);
  const p = data.participation;
  add('BeeBetter OSAS Student Development and Well-being Report');
  add('Generated at', generatedAt.toISOString());
  add('Reporting period', data.period_start, data.period_end);
  add('Campus', filters.campus ?? 'All'); add('Program', filters.course ?? 'All'); add('Year level', filters.yearLevel ?? 'All');
  add('Privacy threshold', `${data.minimum_cohort} distinct students`);
  add('Privacy notice', 'This aggregate report excludes student identities, wellness notes, written reflections, support messages, case notes, quest details, and precise location data.');
  add('Interpretation notice', 'Self-ratings are voluntary and descriptive. Quest participation is not evidence of clinical status or verified personal improvement.');
  add(); add('Section', 'Metric', 'Value', 'Distinct students / denominator', 'Definition or limitation');
  add('Participation', 'Registered students', p.registered_students, p.registered_students, 'Current student records matching the demographic filters; admin accounts are excluded.');
  add('Participation', 'Students with quest activity', p.participating_students, p.registered_students, 'Unique students with a quest created or a durable completion event during the period.');
  add('Participation', 'Completion events', p.completion_events, p.participating_students, 'Durable quest completion-history records during the period; deleted quests remain counted.');
  add('Participation', 'Students with goals', p.students_with_goals, p.registered_students, 'Current matching students with a non-empty, non-placeholder goal.');
  add('Participation', 'Surviving quests created', p.current_quests_created, p.registered_students, 'Current quest rows created during the reporting period.');
  add('Participation', 'Surviving quests completed', p.current_quests_completed, p.current_quests_created, 'Surviving quests created in the period and completed by its end.');
  add('Participation', 'Current quest completion rate (%)', p.current_quest_completion_rate, p.current_quests_created || 'No valid denominator', 'Completed surviving quests divided by surviving quests created in the period. Deleted quests cannot be included in this denominator.');
  if (data.wellbeing) {
    const w = data.wellbeing;
    add('Well-being', 'Participating students', w.student_count, p.registered_students, 'Distinct students submitting voluntary check-ins.'); add('Well-being', 'Check-ins', w.check_in_count, w.student_count, 'Total voluntary check-in submissions.');
    add('Well-being', 'Average reported well-being (1-5)', w.average_wellbeing, w.check_in_count, 'Average across check-in responses; 1 is low and 5 is high.'); add('Well-being', 'Average reported stress (1-5)', w.average_stress, w.check_in_count, 'Average across check-in responses; higher means greater reported stress.');
    add('Well-being', 'Average reported energy (1-5)', w.average_energy, w.check_in_count, 'Average across check-in responses; 1 is low and 5 is high.'); add('Well-being', 'Average reported motivation (1-5)', w.average_motivation, w.motivation_response_count || 'No responses', 'Average across optional motivation responses only.');
  } else add('Well-being', 'Aggregate indicators', unavailable, '', 'Suppressed unless at least five distinct students contributed check-ins.');
  if (data.self_management) {
    const s = data.self_management;
    add('Self-management', 'Participating students', s.student_count, p.registered_students, 'Distinct students submitting voluntary reflections.'); add('Self-management', 'Reflections', s.reflection_count, s.student_count, 'Total voluntary reflection submissions.');
    add('Self-management', 'Average planning (1-5)', s.average_planning, s.reflection_count, 'Average self-rating across reflections.'); add('Self-management', 'Average follow-through (1-5)', s.average_follow_through, s.reflection_count, 'Average self-rating across reflections.'); add('Self-management', 'Average confidence (1-5)', s.average_confidence, s.reflection_count, 'Average self-rating across reflections.');
  } else add('Self-management', 'Aggregate indicators', unavailable, '', 'Suppressed unless at least five distinct students contributed reflections.');
  if (data.support) {
    const s = data.support;
    add('Support', 'Requesting students', s.student_count, p.registered_students, 'Distinct students voluntarily submitting requests.'); add('Support', 'Total requests', s.request_count, s.student_count, 'Total voluntary support requests created during the period.');
    add('Support', 'Submitted', s.submitted_count, s.request_count, 'Requests with database status submitted.'); add('Support', 'Acknowledged', s.acknowledged_count, s.request_count, 'Requests with database status acknowledged.'); add('Support', 'In progress', s.in_progress_count, s.request_count, 'Requests with database status in_progress.'); add('Support', 'Resolved', s.resolved_count, s.request_count, 'Requests with database status resolved.'); add('Support', 'Withdrawn', s.withdrawn_count, s.request_count, 'Requests with database status withdrawn.');
  } else add('Support', 'Aggregate indicators', unavailable, '', 'Suppressed unless at least five distinct students submitted requests.');
  add(); add('Trend section', 'Period/category', 'Value', 'Distinct students', 'Additional values');
  for (const row of data.activity_trends) add('Quest completion trend', row.bucket_start, row.completion_events, row.student_count, 'Durable completion events');
  for (const row of data.category_participation) add('Development category', row.category, row.completion_events, row.student_count, 'Durable completion events');
  for (const row of data.wellbeing_trends) add('Well-being trend', row.bucket_start, row.check_in_count, row.student_count, `Well-being ${cell(row.average_wellbeing)}; stress ${cell(row.average_stress)}; energy ${cell(row.average_energy)}; motivation ${cell(row.average_motivation)} (${row.motivation_response_count} responses)`);
  for (const row of data.reflection_trends) add('Self-management trend', row.bucket_start, row.reflection_count, row.student_count, `Planning ${cell(row.average_planning)}; follow-through ${cell(row.average_follow_through)}; confidence ${cell(row.average_confidence)}`);
  for (const row of data.support_trends) add('Support-request trend', row.bucket_start, row.request_count, row.student_count, 'Voluntary requests');
  for (const row of data.support_categories) add('Support category', row.category, row.request_count, row.student_count, 'Voluntary requests');
  add(); add('Trend limitation', 'Detailed trend/category rows appear only when that individual cell contains at least five distinct students. Missing cells are withheld and must not be interpreted as zero.');
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
}

export function downloadOsasReportCsv(data: DashboardAnalytics, filters: DashboardFilters): void {
  const blob = new Blob([buildOsasReportCsv(data, filters)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = `beebetter-osas-report-${data.period_start}-to-${data.period_end}.csv`;
  document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
}
