import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Tabs } from 'radix-ui'
import { listQuests } from './admin-data'
import { Status, TableLoading, questStatusLabel } from './AdminTables'
import type { Quest } from './admin-types'
import { getDashboardAnalytics, getReportingTimezone, logDashboardExport, type DashboardAnalytics, type DashboardFilters, type OsasPermissions } from './osas-data'
import { downloadOsasReportCsv } from './osas-report'

const DAY = 86_400_000
const dayNumber = (date: string) => Date.parse(date + 'T00:00:00Z') / DAY
const dateKey = (day: number) => new Date(day * DAY).toISOString().slice(0, 10)
const shortDateFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
const rangeFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' })
const labelDate = (date: string) => shortDateFormatter.format(dayNumber(date) * DAY)
const reportDate = (date: string) => rangeFormatter.format(dayNumber(date) * DAY)
const reportDates = (from: string, to: string) => rangeFormatter.formatRange(dayNumber(from) * DAY, dayNumber(to) * DAY)
const count = (value: number) => value.toLocaleString()
const score = (value: number) => value.toFixed(2) + ' / 5'
const reportCount = (value: number | null) => value == null ? 'Unavailable' : count(value)
const reportPercent = (value: number | null) => value == null ? 'Unavailable' : value.toLocaleString(undefined, { maximumFractionDigits: 1 }) + '%'
const reportDecimal = (value: number | null, digits: number) => value == null ? 'Unavailable' : value.toFixed(digits)

function presetRange(days: number, timezone: string): DashboardFilters {
  const parts = new Intl.DateTimeFormat('en', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const get = (key: string) => parts.find(part => part.type === key)?.value
  const endDate = [get('year'), get('month'), get('day')].join('-')
  return { startDate: dateKey(dayNumber(endDate) - days + 1), endDate }
}

type ReportResult = { range: DashboardFilters; data: DashboardAnalytics } | { range: DashboardFilters; error: true }
type Preset = '7' | '30' | 'custom'

export function OsasDashboard({ permissions, reportControlsHost, assignmentRevision, onOpenQuest, onCreateQuest, onReviewAssignments }: {
  permissions: OsasPermissions
  reportControlsHost?: HTMLDivElement | null
  assignmentRevision: number
  onOpenQuest: (quest: Quest) => void
  onCreateQuest: () => void
  onReviewAssignments?: () => void
}) {
  const [timezone, setTimezone] = useState('')
  const [timezoneError, setTimezoneError] = useState(false)
  const [timezoneRetry, setTimezoneRetry] = useState(0)
  const [preset, setPreset] = useState<Preset>('30')
  const [draft, setDraft] = useState<DashboardFilters>({ startDate: '', endDate: '' })
  const [range, setRange] = useState<DashboardFilters | null>(null)
  const [result, setResult] = useState<ReportResult | null>(null)
  const [exportStatus, setExportStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [exporting, setExporting] = useState(false)
  const exportBusy = useRef(false)
  const reportGeneration = useRef(0)
  const allowed = permissions.can_view_aggregates
  const current = result?.range === range ? result : null
  const data = allowed && current && 'data' in current ? current.data : null
  const reportError = Boolean(current && 'error' in current)
  const loading = !timezoneError && !current
  const daySpan = dayNumber(draft.endDate) - dayNumber(draft.startDate)
  const validRange = daySpan >= 0 && daySpan <= 366
  const availableReport = data && !data.suppressed && data.participation ? data : null

  useEffect(() => {
    if (!allowed) return
    let active = true
    void getReportingTimezone().then(value => {
      if (!active) return
      const initialRange = presetRange(30, value)
      setTimezone(value)
      setRange(initialRange)
      setDraft(initialRange)
      setPreset('30')
    }).catch(() => {
      if (active) setTimezoneError(true)
    })
    return () => { active = false }
  }, [allowed, timezoneRetry])

  useEffect(() => {
    if (!range || !allowed) return
    const generation = ++reportGeneration.current
    void getDashboardAnalytics(range).then(data => {
      if (generation !== reportGeneration.current) return
      if (data.period_start !== range.startDate || data.period_end !== range.endDate) {
        setResult({ range, error: true })
        return
      }
      setResult({ range, data })
    }).catch(() => {
      if (generation === reportGeneration.current) setResult({ range, error: true })
    })
    return () => { reportGeneration.current++ }
  }, [allowed, range])

  function requestReport(next: DashboardFilters) {
    reportGeneration.current++
    setRange({ ...next })
    setExportStatus('idle')
  }

  function changePreset(next: Preset) {
    setPreset(next)
    if (next === 'custom') {
      if (range) setDraft(range)
      return
    }
    requestReport(presetRange(Number(next), timezone))
  }

  async function exportCsv() {
    if (!data || !range || data.suppressed || !data.participation || !allowed || exportBusy.current) return
    exportBusy.current = true
    const generation = reportGeneration.current
    setExportStatus('idle')
    setExporting(true)
    try {
      await logDashboardExport(range)
      if (generation !== reportGeneration.current) return
      downloadOsasReportCsv(data)
      setExportStatus('success')
    } catch {
      if (generation === reportGeneration.current) setExportStatus('error')
    } finally {
      exportBusy.current = false
      setExporting(false)
    }
  }

  const reportControls = <div className="overview-toolbar">
    <form className="overview-report-controls" onSubmit={event => {
      event.preventDefault()
      if (validRange) requestReport(draft)
    }}>
      <label><span className="sr-only">Reporting period</span>
        <select value={preset} disabled={!timezone} onChange={event => changePreset(event.target.value as Preset)}>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="custom">Custom dates</option>
        </select>
      </label>
      {preset === 'custom' && <>
        <label>From<input type="date" required value={draft.startDate} max={draft.endDate || undefined}
          onChange={event => setDraft({ ...draft, startDate: event.target.value })} /></label>
        <label>To<input type="date" required value={draft.endDate} min={draft.startDate || undefined}
          onChange={event => setDraft({ ...draft, endDate: event.target.value })} /></label>
        <button className="secondary-button" type="submit" disabled={!validRange}>Apply dates</button>
      </>}
    </form>
    <button className="secondary-button overview-export" type="button" onClick={() => void exportCsv()}
      disabled={!availableReport || exporting}>
      {exporting ? 'Preparing CSV…' : 'Export CSV'}
    </button>
  </div>

  return <div className="osas-overview">
    {allowed ? <>
      {reportControlsHost ? createPortal(reportControls, reportControlsHost) : reportControls}
      {preset === 'custom' && daySpan > 366 && <p className="overview-error" role="alert">Choose dates no more than 366 days apart.</p>}
      {range && <p className="overview-report-date"><span>{reportDates(range.startDate, range.endDate)}</span><span>{data?.institutional_timezone ?? timezone}</span></p>}
      {exportStatus === 'success' && <p className="overview-report-date" role="status">CSV download started and logged.</p>}
      {exportStatus === 'error' && <SectionError message="Could not export the report." onRetry={() => void exportCsv()} />}

      {timezoneError && <SectionError message="Could not load the reporting timezone." onRetry={() => {
        setTimezoneError(false)
        setTimezoneRetry(value => value + 1)
      }} />}
      {reportError && range && <SectionError message="Could not load student analytics." onRetry={() => requestReport(range)} />}
      {loading && <div className="overview-report-loading" role="status" aria-label="Loading student analytics">
        <div className="overview-skeleton overview-chart-skeleton" aria-hidden="true" />
      </div>}
      {data?.suppressed && <section className="overview-section">
        <h2>Report withheld for privacy</h2>
        <p className="overview-muted">Try a different date range. Reports require at least {data.minimum_cohort} registered students.</p>
      </section>}
      {availableReport && <Participation data={availableReport} />}
    </> : <section className="overview-section">
      <h2>Could not verify reporting access</h2>
      <p className="overview-muted">Reload to check your OSAS reporting permissions.</p>
      <button className="secondary-button" onClick={() => window.location.reload()}>Reload page</button>
    </section>}

    <ReportTopics data={availableReport} onReviewAssignments={onReviewAssignments}>
      <RecentAssignments revision={assignmentRevision} onOpenQuest={onOpenQuest} onCreateQuest={onCreateQuest} />
    </ReportTopics>
  </div>
}

function SectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="overview-error-row">
    <p className="overview-error" role="alert">{message}</p>
    <button className="secondary-button" type="button" onClick={onRetry}>Retry</button>
  </div>
}

function Participation({ data }: { data: DashboardAnalytics }) {
  const participation = data.participation!
  const repeat = data.repeat_participation.at(-1)
  return <section className="engagement-summary" aria-label="Engagement summary">
    <div className="engagement-trend">
      <dl className="engagement-metrics">
        <div className="engagement-metric-lead">
          <dt>Students participating</dt>
          <dd data-unavailable={participation.participating_students == null || undefined}>{reportCount(participation.participating_students)}</dd>
          <dd>Created or completed a quest</dd>
        </div>
        <div>
          <dt>Quest completions</dt>
          <dd data-unavailable={participation.completion_events == null || undefined}>{reportCount(participation.completion_events)}</dd>
        </div>
        <div>
          <dt>Registered accounts</dt>
          <dd>{count(participation.registered_students)}</dd>
          <dd>As of {reportDate(data.cohort_as_of)}</dd>
        </div>
      </dl>
      <CompletionChart data={data} />
    </div>
    <aside className="engagement-rates" aria-labelledby="engagement-rates-heading">
      <h2 id="engagement-rates-heading">First and repeat completions</h2>
      <dl>
        <div>
          <dt>First-week completion</dt>
          <dd data-unavailable={data.first_week?.rate == null || undefined}>{reportPercent(data.first_week?.rate ?? null)}</dd>
          <dd>{data.first_week?.completed != null && data.first_week.eligible != null
            ? count(data.first_week.completed) + ' of ' + count(data.first_week.eligible) + ' eligible new accounts'
            : 'Requires seven days of follow-up and enough data to report.'}</dd>
        </div>
        <div>
          <dt>Completed again next week</dt>
          <dd data-unavailable={repeat?.rate == null || undefined}>{reportPercent(repeat?.rate ?? null)}</dd>
          {repeat && <dd>Weeks starting {labelDate(repeat.week_start)} and {labelDate(repeat.next_week_start)}</dd>}
          <dd>{repeat?.completed != null && repeat.eligible != null
            ? count(repeat.completed) + ' of ' + count(repeat.eligible) + ' prior-week completers'
            : repeat ? 'No publishable rate for these weeks.' : 'Select a period with two complete weeks.'}</dd>
        </div>
      </dl>
    </aside>
  </section>
}

type CompletionRow = { date: string; activity?: DashboardAnalytics['activity_trends'][number] }

function CompletionPlot({ rows, weekly, ticks }: { rows: CompletionRow[]; weekly: boolean; ticks: number[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const width = rows.length
  const x = (index: number) => (index + 0.5) / width * 100
  const y = (value: number) => 100 - value / ticks[0] * 100
  const path = rows.map(({ activity }, index) => activity
    ? (rows[index - 1]?.activity ? 'L' : 'M') + x(index) + ',' + y(activity.completion_events)
    : '').join(' ')
  const columns = { gridTemplateColumns: 'repeat(' + width + ', minmax(0, 1fr))' }
  const labels = new Set([0, ...[1, 2, 3, 4].map(part => Math.round((width - 1) * part / 4))])
  const active = activeIndex == null ? null : rows[activeIndex]
  function trackPointer(event: PointerEvent<HTMLDivElement>) {
    const plot = event.currentTarget.getBoundingClientRect()
    setActiveIndex(Math.min(width - 1, Math.max(0, Math.floor((event.clientX - plot.left) / plot.width * width))))
  }

  return <>
    <p className="overview-axis-label" aria-hidden="true">Completions</p>
    <div className="overview-plot">
      <div className="overview-plot-axis" aria-hidden="true">{ticks.map(value => <span key={value}>{count(value)}</span>)}</div>
      <div className="overview-plot-body">
        <div className="overview-plot-interactive" role="group" tabIndex={0} aria-label="Quest completions chart" aria-describedby="completion-chart-help"
          onPointerMove={trackPointer} onPointerDown={trackPointer}
          onPointerLeave={event => { if (document.activeElement !== event.currentTarget) setActiveIndex(null) }}
          onFocus={() => setActiveIndex(index => index ?? 0)} onBlur={() => setActiveIndex(null)}
          onKeyDown={event => {
            if (event.key === 'Escape') { setActiveIndex(null); return }
            const index = activeIndex ?? 0
            const next = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: width - 1 }[event.key]
            if (next == null) return
            event.preventDefault()
            setActiveIndex(Math.max(0, Math.min(width - 1, next)))
          }}>
          <div className="overview-plot-grid" aria-hidden="true">{ticks.map(value => <span key={value} />)}</div>
          <svg className="overview-plot-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d={path} /></svg>
          {rows.map(({ date, activity }, index) => {
            const isolated = activity && !rows[index - 1]?.activity && !rows[index + 1]?.activity
            return (isolated || (activity && index === activeIndex)) && <span key={date} className="overview-plot-point" aria-hidden="true"
              style={{ left: x(index) + '%', top: y(activity.completion_events) + '%' }} />
          })}
          {active && activeIndex != null && <>
            <div className="overview-plot-guide" style={{ left: x(activeIndex) + '%' }} aria-hidden="true" />
            <div className="overview-plot-tooltip" style={{ '--plot-x': x(activeIndex) + '%' } as React.CSSProperties} aria-hidden="true"
              onPointerMove={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()}>
              <strong>{weekly ? 'Week of ' : ''}{labelDate(active.date)}</strong>
              <span>{active.activity ? count(active.activity.completion_events) + ' completions' : 'No publishable count'}</span>
              {active.activity && <span>{count(active.activity.student_count)} students</span>}
            </div>
          </>}
          <span className="sr-only" role="status">{active && <>
            {weekly ? 'Week of ' : ''}{labelDate(active.date)}. {active.activity
              ? count(active.activity.completion_events) + ' completions, ' + count(active.activity.student_count) + ' students.'
              : 'No publishable count.'}
          </>}</span>
        </div>
        <div className="overview-plot-dates" style={columns} aria-hidden="true">
          {rows.map(({ date }, index) => labels.has(index) && <span key={date} style={{ gridColumn: index + 1 }}>{labelDate(date)}</span>)}
        </div>
        <p className="overview-axis-label overview-x-axis" aria-hidden="true">{weekly ? 'Week starting' : 'Reporting date'}</p>
      </div>
    </div>
    <p id="completion-chart-help" className="sr-only">Use the left and right arrow keys to inspect dates. The data table follows the chart.</p>
  </>
}

function CompletionChart({ data }: { data: DashboardAnalytics }) {
  const start = dayNumber(data.period_start)
  const end = dayNumber(data.period_end)
  const weekly = end - start > 31
  const first = weekly ? start - (new Date(start * DAY).getUTCDay() + 6) % 7 : start
  const step = weekly ? 7 : 1
  const byDate = new Map(data.activity_trends.map(row => [row.bucket_start, row]))
  const dates = Array.from({ length: Math.floor((end - first) / step) + 1 }, (_, index) => dateKey(first + index * step))
  const rows = dates.map(date => ({ date, activity: byDate.get(date) }))
  const peak = Math.max(1, ...data.activity_trends.map(row => row.completion_events))
  const tick = Math.ceil(peak / 4)
  const ticks = [tick * 4, tick * 3, tick * 2, tick, 0]

  return <section className="engagement-chart" aria-labelledby="completion-heading">
    <div className="engagement-chart-heading">
      <h2 id="completion-heading">Quest completions over time</h2>
      {data.activity_trends.length > 0 && rows.some(row => !row.activity) && <p>Gaps indicate unavailable counts</p>}
    </div>
    {data.activity_trends.length > 0 ? <CompletionPlot rows={rows} weekly={weekly} ticks={ticks} />
      : <p className="overview-empty">No publishable completion trend. Choose a different reporting period to check for activity.</p>}
    <details className="overview-disclosure">
      <summary>View data</summary>
      <div className="console-table-scroll" role="region" aria-label="Quest completion figures" tabIndex={0}><table className="overview-table overview-numeric-table">
        <caption className="sr-only">Quest completion figures by reporting period</caption>
        <thead><tr><th scope="col">{weekly ? 'Week of' : 'Date'}</th><th scope="col">Completions</th><th scope="col">Students</th></tr></thead>
        <tbody>{rows.map(({ date, activity }) => <tr key={date}>
          <th scope="row"><time dateTime={date}>{labelDate(date)}</time></th>
          <td>{activity ? count(activity.completion_events) : 'Unavailable'}</td>
          <td>{activity ? count(activity.student_count) : 'Unavailable'}</td>
        </tr>)}</tbody>
      </table></div>
    </details>
  </section>
}

function RecentAssignments({ revision, onOpenQuest, onCreateQuest }: {
  revision: number
  onOpenQuest: (quest: Quest) => void
  onCreateQuest: () => void
}) {
  const [rows, setRows] = useState<Quest[] | null>(null)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let active = true
    void listQuests({ page: 0, pageSize: 5, search: '', status: 'All', difficulty: 'All' }).then(result => {
      if (active) {
        setRows(result.rows)
        setError(false)
      }
    }).catch(() => {
      if (active) setError(true)
    })
    return () => { active = false }
  }, [revision, retry])

  return <section className="report-section" aria-labelledby="assignments-heading">
    <h2 id="assignments-heading">Recent OSAS assignments</h2>
    <p className="overview-muted">Latest assignments across all dates</p>
    {error && <SectionError message="Could not load recent assignments." onRetry={() => {
      setError(false)
      setRetry(value => value + 1)
    }} />}
    {!rows && !error && <TableLoading label="Loading assignments" />}
    {rows?.length === 0 && !error && <div className="overview-empty">
      <p>No OSAS assignments yet.</p>
      <button className="secondary-button" onClick={onCreateQuest}>Create a quest</button>
    </div>}
    {rows && rows.length > 0 && <div className="console-table-scroll" role="region" aria-label="Recent assignment records" tabIndex={0}><table className="overview-table overview-assignment-table" role="table" aria-labelledby="assignments-heading">
      <thead role="rowgroup"><tr role="row">
        <th scope="col" role="columnheader">Quest</th><th scope="col" role="columnheader">Assigned to</th>
        <th scope="col" role="columnheader">Category</th><th scope="col" role="columnheader">Status</th>
      </tr></thead>
      <tbody role="rowgroup">{rows.map(quest => <tr key={quest.id} role="row">
        <th scope="row" role="rowheader"><button className="overview-quest-link" type="button" onClick={() => onOpenQuest(quest)}>{quest.title}</button></th>
        <td role="cell"><span className="overview-cell-label" aria-hidden="true">Assigned to</span>{quest.assignee || '—'}</td>
        <td role="cell"><span className="overview-cell-label" aria-hidden="true">Category</span>{quest.category}</td>
        <td role="cell"><span className="overview-cell-label" aria-hidden="true">Status</span><Status status={questStatusLabel(quest.status)} /></td>
      </tr>)}</tbody>
    </table></div>}
  </section>
}

function ReportTopics({ data, onReviewAssignments, children }: {
  data: DashboardAnalytics | null
  onReviewAssignments?: () => void
  children: ReactNode
}) {
  const [topic, setTopic] = useState('activities')

  return <Tabs.Root value={data ? topic : 'activities'} onValueChange={setTopic} activationMode="manual" className="report-topics">
    <Tabs.List className="report-tab-list" aria-label="Reporting topics">
      <Tabs.Trigger value="activities">OSAS activities</Tabs.Trigger>
      <Tabs.Trigger value="participation" disabled={!data}>Participation</Tabs.Trigger>
      <Tabs.Trigger value="interests" disabled={!data}>Student interests</Tabs.Trigger>
      <Tabs.Trigger value="wellbeing" disabled={!data}>Well-being</Tabs.Trigger>
    </Tabs.List>
    <Tabs.Content value="activities" forceMount className="report-topic-panel">
      <div className="report-section">
        <div className="overview-section-heading">
          <h2>OSAS activity outcomes</h2>
          {onReviewAssignments && <button className="secondary-button" onClick={onReviewAssignments}>Review assignments</button>}
        </div>
        {data && <AssignmentOutcomes rows={data.assignment_outcomes} />}
      </div>
      {children}
    </Tabs.Content>
    <Tabs.Content value="participation" className="report-topic-panel">
      {data && <StudentParticipation data={data} />}
    </Tabs.Content>
    <Tabs.Content value="interests" className="report-topic-panel">
      {data && <StudentInterests rows={data.student_interests} />}
    </Tabs.Content>
    <Tabs.Content value="wellbeing" className="report-topic-panel">
      {data && <CheckIns data={data} />}
    </Tabs.Content>
  </Tabs.Root>
}

function CheckIns({ data }: { data: DashboardAnalytics }) {
  const checkIns = data.wellbeing
  return <section className="report-section" aria-labelledby="check-ins-heading">
    <h2 id="check-ins-heading">Check-in participation and ratings</h2>
    <p className="overview-muted">Ratings are voluntary and give each respondent equal weight. Weekly coverage is the share of registered accounts that responded.</p>
    {checkIns ? <dl className="wellbeing-summary">
      <div><dt>Check-in respondents</dt><dd>{count(checkIns.student_count)}</dd></div>
      <div><dt>Well-being</dt><dd>{score(checkIns.average_wellbeing)}</dd></div>
      <div><dt>Stress</dt><dd>{score(checkIns.average_stress)}</dd></div>
      <div><dt>Energy</dt><dd>{score(checkIns.average_energy)}</dd></div>
    </dl> : <p className="overview-empty">Check-in summary unavailable for this period.</p>}
    {data.wellbeing_trends.length > 0 ? <ReportTable label="Weekly check-in ratings"
      columns={['Dates covered', 'Respondents', 'Accounts', 'Coverage', 'Well-being / 5', 'Stress / 5', 'Energy / 5']}
      rows={data.wellbeing_trends.map(row => ({
        id: row.bucket_start,
        heading: <>{reportDates(row.from_date, row.through_date)}{row.partial && <small className="report-row-note">Partial week</small>}</>,
        cells: [reportCount(row.student_count), reportCount(row.registered_students), reportPercent(row.coverage),
          reportDecimal(row.average_wellbeing, 2), reportDecimal(row.average_stress, 2), reportDecimal(row.average_energy, 2)],
      }))} />
      : <p className="overview-empty">No weekly check-in figures are available for these dates.</p>}
  </section>
}

function StudentInterests({ rows }: { rows: DashboardAnalytics['student_interests'] }) {
  const maximum = Math.max(1, ...rows.map(row => row.creators ?? 0))
  return <section className="report-section" aria-labelledby="interests-heading">
    <h2 id="interests-heading">Student-chosen interests</h2>
    <p className="overview-muted">Distinct students by category, based on quests with a recorded student creator.</p>
    {rows.length > 0 ? <ReportTable label="Student-created quest participation" numericFrom={2}
      columns={['Category', 'Students creating', 'Students completing']}
      rows={rows.map(row => ({
        id: row.category,
        heading: row.category,
        cells: [<div className="interest-volume">
          {row.creators != null && <span className="interest-track" aria-hidden="true"><span style={{ width: row.creators / maximum * 100 + '%' }} /></span>}
          <span>{reportCount(row.creators)}</span>
        </div>, reportCount(row.completers)],
      }))} />
      : <p className="overview-empty">No student interest breakdown is available for these dates.</p>}
  </section>
}

function StudentParticipation({ data }: { data: DashboardAnalytics }) {
  return <>
    <section className="report-section" aria-labelledby="first-week-heading">
      <h2 id="first-week-heading">First-week completion</h2>
      <p className="overview-muted">New accounts that had a full seven days to complete their first quest.</p>
      <ReportTable label="First-week quest completion" columns={['Cohort', 'Eligible accounts', 'Completed', 'Completion rate']}
        rows={[{ id: 'first-week', heading: 'New accounts', cells: [
          reportCount(data.first_week?.eligible ?? null), reportCount(data.first_week?.completed ?? null), reportPercent(data.first_week?.rate ?? null),
        ] }]} />
    </section>
    <section className="report-section" aria-labelledby="repeat-heading">
      <h2 id="repeat-heading">Completed again next week</h2>
      <p className="overview-muted">Of the students who completed a quest in the first week, how many completed one the following week?</p>
      {data.repeat_participation.length > 0 ? <ReportTable label="Participation across consecutive completed weeks" numericFrom={2}
        columns={['First week of', 'Following week of', 'First-week completers', 'Completed both weeks', 'Repeat rate']}
        rows={data.repeat_participation.map(row => ({
          id: row.week_start,
          heading: reportDate(row.week_start),
          cells: [reportDate(row.next_week_start), reportCount(row.eligible), reportCount(row.completed), reportPercent(row.rate)],
        }))} /> : <p className="overview-empty">Select a range with two consecutive completed Monday–Sunday weeks.</p>}
    </section>
  </>
}

function AssignmentOutcomes({ rows }: { rows: DashboardAnalytics['assignment_outcomes'] }) {
  return <>
    <p className="overview-muted">Outcomes cover the first 14 days after publication. Activity codes match the codes in Quest Details.</p>
    {rows.length > 0 ? <ReportTable label="OSAS assignment outcomes" numericFrom={3}
      columns={['Activity', 'Category', 'Published', 'Assigned', 'Completed', 'Completion rate', 'Median hours']}
      rows={rows.map(row => ({
        id: row.activity_code ?? row.category,
        heading: row.activity_code ? <code>{row.activity_code}</code> : 'Historical assignments',
        cells: [row.category, row.published_date ? reportDate(row.published_date) : 'Multiple dates', count(row.assigned),
          ...(row.in_progress ? [<span className="outcome-window">Window open</span>, '—', '—']
            : [reportCount(row.completed), reportPercent(row.rate), reportDecimal(row.median_hours, 1)])],
      }))} /> : <p className="overview-empty">No OSAS activity outcomes are available for these dates.</p>}
  </>
}

type ReportRow = { id: string; heading: ReactNode; cells: ReactNode[] }

function ReportTable({ label, columns, rows, numericFrom = 1 }: {
  label: string
  columns: string[]
  rows: ReportRow[]
  numericFrom?: number
}) {
  return <div className="console-table-scroll" role="region" aria-label={label} tabIndex={0}>
    <table className="overview-table report-table" role="table">
      <caption className="sr-only">{label}</caption>
      <thead role="rowgroup"><tr role="row">{columns.map((column, index) =>
        <th scope="col" role="columnheader" className={index >= numericFrom ? 'report-number' : undefined} key={column}>{column}</th>
      )}</tr></thead>
      <tbody role="rowgroup">{rows.map(row => <tr key={row.id} role="row">
        <th scope="row" role="rowheader">{row.heading}</th>
        {row.cells.map((value, index) => <td role="cell" className={index + 1 >= numericFrom ? 'report-number' : undefined} key={columns[index + 1]}>
          <span className="overview-cell-label" aria-hidden="true">{columns[index + 1]}</span>
          <div>{value}</div>
        </td>)}
      </tr>)}</tbody>
    </table>
  </div>
}
