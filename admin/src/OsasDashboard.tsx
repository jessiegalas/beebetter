import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
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
          <label><span className="overview-period-label">Reporting period</span><select value={preset} disabled={!timezone} onChange={event => changePreset(event.target.value as Preset)}>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="custom">Custom</option>
          </select></label>
          {preset === 'custom' && <>
            <label>From<input type="date" required value={draft.startDate} max={draft.endDate || undefined}
              onChange={event => setDraft({ ...draft, startDate: event.target.value })} /></label>
            <label>To<input type="date" required value={draft.endDate} min={draft.startDate || undefined}
              onChange={event => setDraft({ ...draft, endDate: event.target.value })} /></label>
            <button className="secondary-button" type="submit" disabled={!validRange}>Apply dates</button>
          </>}
        </form>
        <button className="secondary-button overview-export" type="button" onClick={() => void exportCsv()}
          disabled={!data?.participation || data.suppressed || exporting}>
          {exporting ? 'Preparing CSV…' : 'Export CSV'}
        </button>
      </div>

  return <div className="osas-overview">
    {allowed ? <>
      {reportControlsHost ? createPortal(reportControls, reportControlsHost) : reportControls}
      {preset === 'custom' && daySpan > 366 && <p className="overview-error" role="alert">Choose dates no more than 366 days apart.</p>}
      {range && <p className="overview-report-date">{rangeFormatter.formatRange(dayNumber(range.startDate) * DAY, dayNumber(range.endDate) * DAY)} · {data?.institutional_timezone ?? timezone}</p>}
      {exportStatus === 'success' && <p className="overview-report-date" role="status">CSV download started and logged.</p>}
      {exportStatus === 'error' && <SectionError message="Could not export the report." onRetry={() => void exportCsv()} />}

      {timezoneError && <SectionError message="Could not load the reporting timezone." onRetry={() => {
        setTimezoneError(false)
        setTimezoneRetry(value => value + 1)
      }} />}
      {reportError && range && <SectionError message="Could not load student analytics." onRetry={() => requestReport(range)} />}
      {loading && <div className="overview-report-loading" role="status" aria-label="Loading student analytics">
        <div className="overview-kpis" aria-hidden="true">
          <div className="overview-skeleton" /><div className="overview-skeleton" /><div className="overview-skeleton" /><div className="overview-skeleton" />
        </div>
        <div className="overview-skeleton overview-chart-skeleton" aria-hidden="true" />
      </div>}
      {data?.suppressed && <section className="overview-section">
        <h2>Report withheld for privacy</h2>
        <p className="overview-muted">Try a different date range. Reports require at least {data.minimum_cohort} registered students.</p>
      </section>}
      {data && !data.suppressed && data.participation && <Participation data={data} />}
    </> : <section className="overview-section">
      <h2>Could not verify reporting access</h2>
      <p className="overview-muted">Reload to check your OSAS reporting permissions.</p>
      <button className="secondary-button" onClick={() => window.location.reload()}>Reload page</button>
    </section>}

    {data && !data.suppressed && <>
      <CheckIns data={data} />
      <StudentParticipation data={data} />
      <AssignmentOutcomes rows={data.assignment_outcomes} />
    </>}
    <RecentAssignments revision={assignmentRevision} onOpenQuest={onOpenQuest} onCreateQuest={onCreateQuest} onReviewAssignments={onReviewAssignments} />
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
  return <>
    <dl className="overview-kpis">
      <div className="overview-kpi overview-kpi-lead">
        <dt>Students participating</dt>
        <dd>{participation.participating_students == null ? 'Unavailable' : count(participation.participating_students)}</dd>
        <dd>Created or completed a quest in this period</dd>
      </div>
      <div className="overview-kpi">
        <dt>Quest completions</dt>
        <dd>{participation.completion_events == null ? 'Unavailable' : count(participation.completion_events)}</dd>
        <dd>Recorded completions in this period</dd>
      </div>
      <div className="overview-kpi">
        <dt>Registered BeeBetter accounts</dt>
        <dd>{count(participation.registered_students)}</dd>
        <dd>Student accounts as of the period end</dd>
      </div>
      <div className="overview-kpi">
        <dt>Check-in respondents</dt>
        <dd>{data.wellbeing ? count(data.wellbeing.student_count) : 'Unavailable'}</dd>
        <dd>Students who shared a daily check-in</dd>
      </div>
    </dl>
    <CompletionChart data={data} />
  </>
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

  return <section className="overview-section overview-chart" aria-labelledby="completion-heading">
    <h2 id="completion-heading">Quest completions over time</h2>
    <p className="overview-muted">Gaps indicate periods without a publishable count.</p>
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

function RecentAssignments({ revision, onOpenQuest, onCreateQuest, onReviewAssignments }: {
  revision: number
  onOpenQuest: (quest: Quest) => void
  onCreateQuest: () => void
  onReviewAssignments?: () => void
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

  return <section className="overview-section" aria-labelledby="assignments-heading">
    <div className="overview-section-heading">
      <div><h2 id="assignments-heading">Recent OSAS assignments</h2><p className="overview-muted">Latest assignments across all dates</p></div>
      {onReviewAssignments && <button className="secondary-button" onClick={onReviewAssignments}>Review assignments</button>}
    </div>
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

function CheckIns({ data }: { data: DashboardAnalytics }) {
  const checkIns = data.wellbeing
  return <section className="overview-section" aria-labelledby="check-ins-heading">
    <h2 id="check-ins-heading">Weekly wellness trends</h2>
    <p className="overview-muted">Voluntary ratings give each respondent equal weight. Coverage is the share of registered accounts that responded.</p>
    {checkIns ? <dl className="overview-check-in-stats">
        <div><dt>Well-being</dt><dd>{score(checkIns.average_wellbeing)}</dd></div>
        <div><dt>Stress</dt><dd>{score(checkIns.average_stress)}</dd></div>
        <div><dt>Energy</dt><dd>{score(checkIns.average_energy)}</dd></div>
      </dl> : <p className="overview-muted">Check-in summary unavailable for this period.</p>}
    {data.wellbeing_trends.length > 0 && <ReportTable label="Weekly check-in ratings" columns={['Dates covered', 'Respondents', 'Accounts', 'Coverage', 'Well-being / 5', 'Stress / 5', 'Energy / 5']}>
      {data.wellbeing_trends.map(row => <tr key={row.bucket_start}>
        <th scope="row">{rangeFormatter.formatRange(dayNumber(row.from_date) * DAY, dayNumber(row.through_date) * DAY)}{row.partial && ' (partial)'}</th>
        <td>{reportCount(row.student_count)}</td><td>{reportCount(row.registered_students)}</td><td>{reportPercent(row.coverage)}</td>
        <td>{reportDecimal(row.average_wellbeing, 2)}</td><td>{reportDecimal(row.average_stress, 2)}</td><td>{reportDecimal(row.average_energy, 2)}</td>
      </tr>)}
    </ReportTable>}
  </section>
}

function StudentParticipation({ data }: { data: DashboardAnalytics }) {
  return <>
    <section className="overview-section" aria-labelledby="interests-heading">
      <h2 id="interests-heading">Student-chosen interests</h2>
      <p className="overview-muted">Distinct students by quest category. This measures quests with a recorded student creator.</p>
      <ReportTable label="Student-created quest participation" columns={['Category', 'Students creating', 'Students completing']}>
        {data.student_interests.map(row => <tr key={row.category}>
          <th scope="row">{row.category}</th><td>{reportCount(row.creators)}</td><td>{reportCount(row.completers)}</td>
        </tr>)}
      </ReportTable>
    </section>
    <section className="overview-section" aria-labelledby="student-participation-heading">
      <h2 id="student-participation-heading">First-week and repeat participation</h2>
      <dl className="overview-check-in-stats">
        <div><dt>Completed a quest in their first seven days</dt><dd>{reportPercent(data.first_week?.rate ?? null)}</dd></div>
        <div><dt>New accounts with seven days to participate</dt><dd>{reportCount(data.first_week?.eligible ?? null)}</dd></div>
        <div><dt>New students completing a quest</dt><dd>{reportCount(data.first_week?.completed ?? null)}</dd></div>
      </dl>
      <h3>Completed a quest again the following week</h3>
      {data.repeat_participation.length > 0 ? <ReportTable label="Participation across consecutive completed weeks" columns={['First week of', 'Following week of', 'First-week completers', 'Completed both weeks', 'Repeat rate']}>
        {data.repeat_participation.map(row => <tr key={row.week_start}>
          <th scope="row">{labelDate(row.week_start)}</th><td>{labelDate(row.next_week_start)}</td>
          <td>{reportCount(row.eligible)}</td><td>{reportCount(row.completed)}</td><td>{reportPercent(row.rate)}</td>
        </tr>)}
      </ReportTable> : <p className="overview-muted">Select a range with two consecutive completed Monday–Sunday weeks.</p>}
    </section>
  </>
}

function AssignmentOutcomes({ rows }: { rows: DashboardAnalytics['assignment_outcomes'] }) {
  return <section className="overview-section" aria-labelledby="assignment-outcomes-heading">
    <h2 id="assignment-outcomes-heading">OSAS activity outcomes</h2>
    <p className="overview-muted">Outcomes cover the first 14 days after publication. Match an activity code in Quest Details.</p>
    {rows.length > 0 ? <ReportTable label="OSAS assignment outcomes" columns={['Activity', 'Category', 'Published', 'Students assigned', 'Completed in 14 days', 'Completion rate', 'Median hours to complete']}>
      {rows.map(row => <tr key={row.activity_code ?? row.category}>
        <th scope="row">{row.activity_code ? <code>{row.activity_code}</code> : 'Historical assignments'}</th>
        <td>{row.category}</td><td>{row.published_date ? labelDate(row.published_date) : 'Multiple dates'}</td><td>{count(row.assigned)}</td>
        {row.in_progress ? <td colSpan={3}>In progress</td> : <>
          <td>{reportCount(row.completed)}</td><td>{reportPercent(row.rate)}</td><td>{reportDecimal(row.median_hours, 1)}</td>
        </>}
      </tr>)}
    </ReportTable> : <p className="overview-muted">No OSAS activity outcomes are available for these dates.</p>}
  </section>
}

function ReportTable({ label, columns, children }: { label: string; columns: string[]; children: ReactNode }) {
  return <div className="console-table-scroll" role="region" aria-label={label} tabIndex={0}>
    <table className={columns.length > 4 ? 'overview-table overview-wide-results-table' : 'overview-table'}>
      <caption className="sr-only">{label}</caption>
      <thead><tr>{columns.map(column => <th scope="col" key={column}>{column}</th>)}</tr></thead>
      <tbody>{children}</tbody>
    </table>
  </div>
}
