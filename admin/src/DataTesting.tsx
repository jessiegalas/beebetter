import { useState } from 'react'
import { CheckIns, QuestEngagement } from './OsasDashboard'
import type { DashboardAnalytics, SemesterWellness, WellnessRatings } from './osas-data'

const scenarios = {
  populated: { label: 'Populated charts', description: 'Switch the rating or compare two semesters.' },
  withheld: { label: 'Privacy gaps', description: 'See gaps in the weekly charts and withheld year-level ratings.' },
  empty: { label: 'No activity', description: 'This sample has registered students and no check-ins or quest activity.' },
}
type Scenario = keyof typeof scenarios

const sampleWeeks = [
  { from: '2025-12-01', to: '2025-12-07', wellbeing: 3.15, stress: 3.5, energy: 2.85, completions: 26 },
  { from: '2025-12-08', to: '2025-12-14', wellbeing: 3.35, stress: 3.1, energy: 3.15, completions: 34 },
  { from: '2025-12-15', to: '2025-12-21', wellbeing: 3.6, stress: 2.8, energy: 3.5, completions: 44 },
  { from: '2025-12-22', to: '2025-12-28', wellbeing: 3.7, stress: 2.55, energy: 3.75, completions: 29 },
  { from: '2025-12-29', to: '2026-01-04', wellbeing: 3.4, stress: 3.2, energy: 3.25, completions: 22 },
  { from: '2026-01-05', to: '2026-01-11', wellbeing: 3.8, stress: 2.65, energy: 3.7, completions: 41 },
  { from: '2026-01-12', to: '2026-01-18', wellbeing: 3.65, stress: 2.75, energy: 3.85, completions: 49 },
  { from: '2026-01-19', to: '2026-01-25', wellbeing: 4, stress: 2.35, energy: 4.05, completions: 55 },
]
const yearLevels = ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year']
const terms = ['2nd Semester', '1st Semester']
const registered = 125

const unavailable: WellnessRatings = { average_wellbeing: null, average_stress: null, average_energy: null }

function sampleReport(scenario: Scenario): { data: DashboardAnalytics; rows: SemesterWellness[] } {
  const empty = scenario === 'empty'
  const gaps = scenario === 'withheld'
  const missingWeek = (index: number) => empty || (gaps && index === 4)
  const activity = sampleWeeks.flatMap(({ from, completions }, index) => missingWeek(index) ? [] : [{
    bucket_start: from, student_count: 15 + index, completion_events: completions,
  }])
  const rows = terms.flatMap((term, semester) => yearLevels.map((year_level, year) => {
    const withheld = empty || (gaps && (year === 4 || (semester === 0 && year === 2)))
    const ratings = withheld ? unavailable : {
      average_wellbeing: (semester === 0 ? [3.85, 4.15, 3.6, 3.8, 3.5] : [3.35, 3.55, 3.85, 3.2, 3.75])[year],
      average_stress: (semester === 0 ? [2.4, 2.2, 3.15, 2.8, 3] : [3.3, 2.8, 2.6, 3.4, 2.55])[year],
      average_energy: (semester === 0 ? [3.9, 4.15, 3.4, 3.6, 3.35] : [3.45, 3.6, 3.95, 3.2, 3.8])[year],
    }
    return { semester_id: term, academic_year: '2025–2026', term, year_level, respondents: withheld ? null : 15, ...ratings }
  }))
  return {
    rows,
    data: {
      suppressed: false, minimum_cohort: 5, period_start: sampleWeeks[0].from, period_end: sampleWeeks[7].to,
      cohort_as_of: sampleWeeks[7].to, institutional_timezone: 'Asia/Manila',
      participation: {
        registered_students: registered, participating_students: empty ? null : 54,
        completion_events: empty ? null : sampleWeeks.reduce((total, week) => total + week.completions, 0),
      },
      wellbeing: empty ? null : { student_count: 88, average_wellbeing: 3.61, average_stress: 2.89, average_energy: 3.55 },
      wellbeing_trends: sampleWeeks.map(({ from, to, wellbeing, stress, energy }, index) => ({
        bucket_start: from, from_date: from, through_date: to, partial: false, registered_students: registered,
        ...(missingWeek(index) ? { student_count: null, coverage: null, ...unavailable } : {
          student_count: 65, coverage: 52, average_wellbeing: wellbeing, average_stress: stress, average_energy: energy,
        }),
      })),
      activity_trends: activity,
      first_week: empty ? null : { eligible: 20, completed: 12, rate: 60 },
      repeat_participation: [{ week_start: '2026-01-12', next_week_start: '2026-01-19', ...(empty || gaps
        ? { eligible: null, completed: null, rate: null } : { eligible: 16, completed: 8, rate: 50 }) }],
      student_interests: empty ? [] : [
        { category: 'Study', creators: 19, completers: 13 },
        { category: 'Habits', creators: 12, completers: gaps ? null : 8 },
      ],
      assignment_outcomes: [],
    },
  }
}

export default function DataTesting() {
  const [scenario, setScenario] = useState<Scenario>('populated')
  const { data, rows } = sampleReport(scenario)

  return <div className="osas-overview">
    <div className="data-testing-toolbar overview-toolbar">
      <div>
        <strong>Sample data</strong>
        <p className="overview-muted" role="status">{scenarios[scenario].description}</p>
      </div>
      <label className="overview-report-controls">Scenario
        <select value={scenario} onChange={event => setScenario(event.target.value as Scenario)}>
          {Object.entries(scenarios).map(([value, { label }]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
    </div>
    <CheckIns data={data} semester={{ rows }} />
    <QuestEngagement data={data} />
  </div>
}
