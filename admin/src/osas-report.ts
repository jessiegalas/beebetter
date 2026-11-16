import type { DashboardAnalytics } from './osas-data'

const csvCell = (value: unknown): string => {
  const text = value == null ? 'Unavailable' : String(value)
  const safe = /^[=+\-@]/.test(text) ? "'" + text : text
  return '"' + safe.replaceAll('"', '""') + '"'
}

export function buildOsasReportCsv(data: DashboardAnalytics, generatedAt = new Date()): string {
  if (data.suppressed || !data.participation) throw new Error('Export unavailable because the report is withheld for privacy.')
  const rows: unknown[][] = []
  const add = (...values: unknown[]) => rows.push(values)
  const participation = data.participation
  add('BeeBetter OSAS Student Analytics')
  add('Generated at', generatedAt.toISOString())
  add('Reporting period', data.period_start, data.period_end)
  add('Institutional timezone', data.institutional_timezone)
  add('Accounts as of', data.cohort_as_of)
  add('Privacy threshold', data.minimum_cohort + ' distinct students')
  add('Data availability', 'Unavailable values and omitted periods have no publishable count.')
  add()
  add('Section', 'Metric', 'Value', 'Definition')
  add('Participation', 'Students participating', participation.participating_students, 'Unique students who created or completed a quest in the reporting period.')
  add('Participation', 'Quest completions', participation.completion_events, 'Durable quest completion events recorded in the reporting period.')
  add('Participation', 'Registered BeeBetter accounts', participation.registered_students, 'Registered student accounts as of the period end, excluding admin accounts.')

  if (data.wellbeing) {
    const checkIns = data.wellbeing
    add('Daily check-ins', 'Respondents', checkIns.student_count, 'Distinct students who submitted a voluntary check-in.')
    add('Daily check-ins', 'Average well-being (1–5)', checkIns.average_wellbeing, 'Mean well-being rating with equal weight per responding student.')
    add('Daily check-ins', 'Average stress (1–5)', checkIns.average_stress, 'Mean stress rating with equal weight per responding student. Higher means greater reported stress.')
    add('Daily check-ins', 'Average energy (1–5)', checkIns.average_energy, 'Mean energy rating with equal weight per responding student.')
  } else {
    add('Daily check-ins', 'Summary', null, 'A summary requires at least five distinct respondents.')
  }

  add()
  add('Quest completion period start', 'Completions', 'Distinct students')
  for (const row of data.activity_trends) add(row.bucket_start, row.completion_events, row.student_count)
  add()
  add('Check-in week start', 'Dates from', 'Dates through', 'Week coverage', 'Respondents', 'Registered accounts', 'Coverage (%)', 'Average well-being (1–5)', 'Average stress (1–5)', 'Average energy (1–5)')
  for (const row of data.wellbeing_trends) {
    add(row.bucket_start, row.from_date, row.through_date, row.partial ? 'Partial week' : 'Full week', row.student_count,
      row.registered_students, row.coverage, row.average_wellbeing, row.average_stress, row.average_energy)
  }

  add()
  add('Student-chosen interests', 'Distinct students creating', 'Distinct students completing')
  for (const row of data.student_interests) add(row.category, row.creators, row.completers)
  add('Interest basis', 'Quests with recorded student origin. Custom categories appear under Other.')

  add()
  add('Participation measure', 'Students eligible', 'Students completing', 'Rate (%)')
  add('Completed a quest within seven days of registration', data.first_week?.eligible, data.first_week?.completed, data.first_week?.rate)
  add('First-week eligibility', 'Accounts registered during the period with seven full days by the reporting cutoff.')
  add('First week start', 'Following week start', 'Distinct first-week completers', 'Distinct students completing both weeks', 'Repeat rate (%)')
  for (const row of data.repeat_participation) add(row.week_start, row.next_week_start, row.eligible, row.completed, row.rate)

  add()
  add('OSAS activity code', 'Publication date', 'Category', 'Students assigned', 'Outcome window', 'Completed within 14 days', 'Completion rate (%)', 'Median hours to complete')
  for (const row of data.assignment_outcomes) {
    add(row.activity_code ?? 'Historical assignments', row.published_date ?? 'Multiple dates', row.category, row.assigned,
      row.in_progress ? 'In progress' : 'Complete', row.completed, row.rate, row.median_hours)
  }
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n')
}

export function downloadOsasReportCsv(data: DashboardAnalytics): void {
  const blob = new Blob([buildOsasReportCsv(data)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'beebetter-osas-report-' + data.period_start + '-to-' + data.period_end + '.csv'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
