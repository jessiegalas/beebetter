import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { Collapsible, Tabs } from 'radix-ui'
import { listQuests } from './admin-data'
import { Status, TableLoading, questStatusLabel } from './AdminTables'
import type { AnalyticsSection, Quest } from './admin-types'
import {
  getDashboardAnalytics, getReportingTimezone, getSemesterWellness, logDashboardExport,
  type DashboardAnalytics, type DashboardFilters, type OsasPermissions, type SemesterWellness, type WellnessRatings,
} from './osas-data'
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
type Preset = '7' | '30' | '365' | 'custom'
type SemesterResult = { range: DashboardFilters; rows: SemesterWellness[] | null }

export function OsasDashboard({ view, permissions, assignmentRevision, onOpenQuest, onCreateQuest, onReviewAssignments, onNavigate }: {
  view: AnalyticsSection
  permissions: OsasPermissions
  assignmentRevision: number
  onOpenQuest: (quest: Quest) => void
  onCreateQuest: () => void
  onReviewAssignments?: () => void
  onNavigate: (section: 'Wellness' | 'Engagement') => void
}) {
  const [timezone, setTimezone] = useState('')
  const [timezoneError, setTimezoneError] = useState(false)
  const [timezoneRetry, setTimezoneRetry] = useState(0)
  const [preset, setPreset] = useState<Preset>('30')
  const [draft, setDraft] = useState<DashboardFilters>({ startDate: '', endDate: '' })
  const [overviewRange, setOverviewRange] = useState<DashboardFilters | null>(null)
  const [detailRange, setDetailRange] = useState<DashboardFilters | null>(null)
  const [result, setResult] = useState<ReportResult | null>(null)
  const [semesterResult, setSemesterResult] = useState<SemesterResult | null>(null)
  const [exportStatus, setExportStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [exporting, setExporting] = useState(false)
  const exportBusy = useRef(false)
  const exportGeneration = useRef(0)
  const reportGeneration = useRef(0)
  const isOverview = view === 'Overview'
  const needsSemester = view === 'Wellness' || view === 'Reports'
  const range = isOverview ? overviewRange : detailRange
  const allowed = permissions.can_view_aggregates
  const current = result?.range === range ? result : null
  const data = allowed && current && 'data' in current ? current.data : null
  const reportError = Boolean(current && 'error' in current)
  const loading = !timezoneError && !current
  const daySpan = dayNumber(draft.endDate) - dayNumber(draft.startDate)
  const validRange = daySpan >= 0 && daySpan <= 366
  const availableReport = data && !data.suppressed && data.participation ? data : null
  const semester = semesterResult?.range === range ? semesterResult : null

  useEffect(() => {
    if (!allowed) return
    let active = true
    void getReportingTimezone().then(value => {
      if (!active) return
      const initialRange = presetRange(30, value)
      setTimezone(value)
      setOverviewRange(initialRange)
      setDetailRange(initialRange)
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

  useEffect(() => {
    if (!range || !allowed || !needsSemester) return
    let active = true
    void getSemesterWellness(range).then(rows => {
      if (active) setSemesterResult({ range, rows })
    }).catch(() => {
      if (active) setSemesterResult({ range, rows: null })
    })
    return () => { active = false }
  }, [allowed, needsSemester, range])

  useEffect(() => {
    if (view !== 'Reports' || !allowed) return
    setExportStatus('idle')
    return () => { exportGeneration.current++ }
  }, [view, allowed])

  function requestReport(next: DashboardFilters) {
    reportGeneration.current++
    exportGeneration.current++
    if (isOverview) setOverviewRange({ ...next })
    else setDetailRange({ ...next })
    setExportStatus('idle')
  }

  function changePreset(next: Preset) {
    setPreset(next)
    if (next === 'custom') {
      if (detailRange) setDraft(detailRange)
      return
    }
    requestReport(presetRange(Number(next), timezone))
  }

  async function exportCsv() {
    if (view !== 'Reports' || !availableReport || !range || !semester || exportBusy.current) return
    exportBusy.current = true
    const generation = exportGeneration.current
    setExportStatus('idle')
    setExporting(true)
    try {
      await logDashboardExport(range)
      if (generation !== exportGeneration.current) return
      downloadOsasReportCsv(availableReport, semester.rows ?? [])
      setExportStatus('success')
    } catch {
      if (generation === exportGeneration.current) setExportStatus('error')
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
          <option value="365">Last 12 months</option>
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
    {view === 'Reports' && <button className="secondary-button" type="button" onClick={() => void exportCsv()}
      disabled={!availableReport || !semester || exporting}>
      {exporting ? 'Preparing CSV…' : 'Export CSV'}
    </button>}
  </div>

  return <div className="osas-overview">
    {allowed ? <>
      {!isOverview && <div className="analytics-report-bar">
        {range && <p className="overview-report-date"><span>{reportDates(range.startDate, range.endDate)}</span><span>{data?.institutional_timezone ?? timezone}</span></p>}
        {reportControls}
      </div>}
      {!isOverview && preset === 'custom' && daySpan > 366 && <p className="admin-alert" data-tone="error" role="alert">Choose dates no more than 366 days apart.</p>}
      {view === 'Reports' && exportStatus === 'success' && <p className="admin-alert" data-tone="success" role="status">CSV download started and logged.</p>}
      {view === 'Reports' && exportStatus === 'error' && <SectionError message="Could not export the report." onRetry={() => void exportCsv()} />}

      {timezoneError && <SectionError message="Could not load the reporting timezone." onRetry={() => {
        setTimezoneError(false)
        setTimezoneRetry(value => value + 1)
      }} />}
      {reportError && range && <SectionError message="Could not load student analytics." onRetry={() => requestReport(range)} />}
      {loading && <div className="overview-report-loading" role="status" aria-label="Loading student analytics">
        <div className="overview-skeleton overview-chart-skeleton" aria-hidden="true" />
      </div>}
      {!isOverview && data?.suppressed && <section className="admin-alert" data-tone="warning" role="status">
        <h2>Report withheld for privacy</h2>
        <p className="overview-muted">Try a different date range. Reports require at least {data.minimum_cohort} registered students.</p>
      </section>}
      {isOverview && data && range && <ExecutiveOverview data={availableReport} range={range} withheld={data.suppressed} onNavigate={onNavigate} />}
      {view === 'Wellness' && availableReport && <CheckIns data={availableReport} semester={semester?.rows ? { rows: semester.rows }
          : semester && { retry: () => requestReport(semester.range) }} />}
      {view === 'Engagement' && <QuestEngagement data={availableReport} />}
      {view === 'Reports' && <div className="overview-section">
        <div className="report-section">
          <div className="overview-section-heading">
            <h2>OSAS activity outcomes</h2>
            {onReviewAssignments && <button className="secondary-button" onClick={onReviewAssignments}>Review assignments</button>}
          </div>
          {availableReport && <AssignmentOutcomes rows={availableReport.assignment_outcomes} />}
        </div>
        <RecentAssignments revision={assignmentRevision} onOpenQuest={onOpenQuest} onCreateQuest={onCreateQuest} />
      </div>}
    </> : <section className="overview-section">
      <h2>Could not verify reporting access</h2>
      <p className="overview-muted">Reload to check your OSAS reporting permissions.</p>
      <button className="secondary-button" onClick={() => window.location.reload()}>Reload page</button>
    </section>}
  </div>
}

function SectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="admin-alert admin-alert-actions" data-tone="error">
    <p role="alert">{message}</p>
    <button className="secondary-button" type="button" onClick={onRetry}>Retry</button>
  </div>
}

function ExecutiveOverview({ data, range, withheld, onNavigate }: {
  data: DashboardAnalytics | null
  range: DashboardFilters
  withheld: boolean
  onNavigate: (section: 'Wellness' | 'Engagement') => void
}) {
  const wellbeing = data?.wellbeing
  const participation = data?.participation
  const metrics = [
    { label: 'Average well-being', value: wellbeing ? wellbeing.average_wellbeing.toFixed(2) : null, unit: '/ 5' },
    { label: 'Check-in respondents', value: wellbeing ? count(wellbeing.student_count) : null },
    { label: 'Quest participants', value: participation?.participating_students == null ? null : count(participation.participating_students) },
    { label: 'Registered accounts', value: participation ? count(participation.registered_students) : null },
  ]

  return <>
    <div className="executive-context">
      <p className="overview-report-date"><strong>Last 30 days</strong><span>{reportDates(range.startDate, range.endDate)}</span></p>
      <button className="chart-action" type="button" onClick={() => onNavigate('Engagement')}>View engagement</button>
    </div>
    <dl className="executive-kpis" aria-label="Summary metrics">
      {metrics.map(({ label, value, unit }) => <div className="executive-kpi" key={label}>
        <dt>{label}</dt>
        <dd>{value == null ? <span className="executive-unavailable" title="Unavailable"><span aria-hidden="true">—</span><span className="sr-only">Unavailable</span></span>
          : <>{value}{unit && <small> {unit}</small>}</>}</dd>
      </div>)}
    </dl>
    <section className="overview-section chart-panel executive-trend" aria-labelledby="overview-trend-heading">
      <div className="chart-panel-heading">
        <h2 id="overview-trend-heading">Weekly well-being trend</h2>
        <button className="chart-action" type="button" onClick={() => onNavigate('Wellness')}>View wellness</button>
      </div>
      <figure className="chart-frame" aria-labelledby="overview-trend-heading">
        <WellnessTrend rows={data?.wellbeing_trends ?? []} measure="average_wellbeing" emptyMessage={withheld ? 'Report withheld for privacy' : undefined} />
      </figure>
    </section>
  </>
}

function EngagementMetrics({ label, metrics }: { label: string; metrics: { label: string; value: string | null; note?: string }[] }) {
  return <div>
    <dl className="engagement-metrics" aria-label={label}>
      {metrics.map(metric => <div className="executive-kpi" key={metric.label}>
        <dt>{metric.label}</dt>
        <dd>{metric.value ?? <><span className="executive-unavailable" aria-hidden="true">—</span><span className="sr-only">Unavailable</span></>}</dd>
        {metric.note && <dd className="engagement-metric-note">{metric.note}</dd>}
      </div>)}
    </dl>
    {metrics.some(metric => metric.value == null) && <p className="engagement-unavailable">— No reportable value</p>}
  </div>
}

function Participation({ data }: { data: DashboardAnalytics }) {
  const participation = data.participation!
  return <>
    <EngagementMetrics label="Participation metrics" metrics={[
      { label: 'Participating students', value: participation.participating_students == null ? null : count(participation.participating_students), note: 'Created or completed a quest' },
      { label: 'Registered accounts', value: count(participation.registered_students) },
    ]} />
    <StudentInterests rows={data.student_interests} />
  </>
}

function Completions({ data }: { data: DashboardAnalytics }) {
  const total = data.participation?.completion_events
  const firstRate = data.first_week?.rate
  const repeatRate = data.repeat_participation.at(-1)?.rate
  return <>
    <EngagementMetrics label="Completion metrics" metrics={[
      { label: 'Quest completions', value: total == null ? null : count(total) },
      { label: 'First-week completion', value: firstRate == null ? null : reportPercent(firstRate) },
      { label: 'Next-week repeat', value: repeatRate == null ? null : reportPercent(repeatRate) },
    ]} />
    <CompletionChart data={data} />
    <CompletionDetails data={data} />
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
  if (data.activity_trends.length === 0) return <section className="overview-section chart-panel" aria-labelledby="completion-heading">
    <h2 id="completion-heading">Quest completions over time</h2>
    <p className="overview-muted">No reportable completions.</p>
  </section>

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

  return <section className="overview-section chart-panel engagement-chart" aria-labelledby="completion-heading">
    <div className="chart-panel-heading"><h2 id="completion-heading">Quest completions over time</h2></div>
    <figure className="chart-frame" aria-labelledby="completion-heading">
      <CompletionPlot rows={rows} weekly={weekly} ticks={ticks} />
      {rows.some(row => !row.activity) && <figcaption className="wellness-chart-note">Gaps indicate unavailable counts</figcaption>}
    </figure>
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

export function QuestEngagement({ data }: { data: DashboardAnalytics | null }) {
  const [topic, setTopic] = useState('participation')
  if (!data) return null

  return <Tabs.Root value={topic} onValueChange={setTopic} activationMode="manual">
    <Tabs.List className="report-tab-list" aria-label="Quest engagement">
      <Tabs.Trigger value="participation">Participation</Tabs.Trigger>
      <Tabs.Trigger value="completions">Completions</Tabs.Trigger>
    </Tabs.List>
    <Tabs.Content value="participation" className="report-topic-panel">
      <Participation data={data} />
    </Tabs.Content>
    <Tabs.Content value="completions" className="report-topic-panel">
      <Completions data={data} />
    </Tabs.Content>
  </Tabs.Root>
}

const wellnessMeasures = {
  average_wellbeing: 'Well-being',
  average_stress: 'Stress',
  average_energy: 'Energy',
} satisfies Record<keyof WellnessRatings, string>
type WellnessMeasure = keyof typeof wellnessMeasures
const wellnessTicks = [5, 4, 3, 2, 1]

function WellnessTrend({ rows, measure, emptyMessage = 'No reportable weekly ratings' }: {
  rows: DashboardAnalytics['wellbeing_trends']; measure: WellnessMeasure; emptyMessage?: string
}) {
  const x = (index: number) => (index + 0.5) / rows.length * 100
  const y = (value: number) => (5 - value) / 4 * 100
  const path = rows.map((row, index) => {
    const value = row[measure]
    if (value == null) return ''
    return (rows[index - 1]?.[measure] == null ? 'M' : 'L') + x(index) + ',' + y(value)
  }).join(' ')
  const empty = !path.trim()
  const label = wellnessMeasures[measure]
  const last = rows.length - 1
  const labels = new Set([0, ...(rows.length >= 5 ? [Math.round(last / 2)] : []), last])
  return <div className="overview-plot wellness-trend" role="img" aria-label={empty
    ? label + ' chart. ' + emptyMessage + '.'
    : label + ' trend by week, rated from 1 to 5.'}>
    <div className="overview-plot-axis" aria-hidden="true">{wellnessTicks.map(value => <span key={value}>{value}</span>)}</div>
    <div className="overview-plot-body" aria-hidden="true">
      <div className="wellness-trend-track">
        <div className="overview-plot-grid">{wellnessTicks.map(value => <span key={value} />)}</div>
        {empty ? <p className="wellness-trend-empty">{emptyMessage}</p>
          : <svg className="overview-plot-line" viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false"><path d={path} /></svg>}
        {rows.map((row, index) => {
          const value = row[measure]
          return value == null ? null : <span key={row.bucket_start} className="overview-plot-point"
            title={reportDates(row.from_date, row.through_date) + ' · ' + score(value)}
            style={{ left: x(index) + '%', top: y(value) + '%' }} />
        })}
      </div>
      {rows.length > 0 && <div className="overview-plot-dates" style={{ gridTemplateColumns: 'repeat(' + rows.length + ', minmax(0, 1fr))' }}>
        {rows.map((row, index) => labels.has(index) && <span key={row.bucket_start} style={{ gridColumn: index + 1 }}>{labelDate(row.from_date)}</span>)}
      </div>}
    </div>
  </div>
}

function SemesterComparison({ rows, measure }: { rows: SemesterWellness[]; measure: WellnessMeasure }) {
  const semesters = new Map<string, SemesterWellness[]>()
  for (const row of rows) {
    const cohorts = semesters.get(row.semester_id)
    if (cohorts) cohorts.push(row)
    else semesters.set(row.semester_id, [row])
  }
  return <div className="wellness-semesters">
      {Array.from(semesters, ([id, cohorts]) => <div className="wellness-semester" key={id}>
        <h3>{cohorts[0].term} <span>· {cohorts[0].academic_year}</span></h3>
        <div className="wellness-comparison-row wellness-comparison-axis" aria-hidden="true">
          <span />
          <div>{[...wellnessTicks].reverse().map(tick => <span key={tick}>{tick}</span>)}</div>
          <span />
        </div>
        <ul aria-label={cohorts[0].term + ' ' + cohorts[0].academic_year + ' ratings by year level'}>
          {cohorts.map(row => {
            const value = row[measure]
            return <li className="wellness-comparison-row" key={row.year_level}>
              <span>{row.year_level}</span>
              <span className="wellness-comparison-track" aria-hidden="true">
                {value != null && <span className="wellness-comparison-point" style={{ left: (value - 1) * 25 + '%' }} />}
              </span>
              <span className="wellness-comparison-value" title={value == null ? 'Rating unavailable' : row.respondents == null ? undefined : count(row.respondents) + ' respondents'}>
                {value == null ? <><span aria-hidden="true">—</span><span className="sr-only">Rating unavailable</span></> : value.toFixed(2)}
              </span>
            </li>
          })}
        </ul>
      </div>)}
    </div>
}

export function CheckIns({ data, semester }: { data: DashboardAnalytics; semester: { rows: SemesterWellness[] } | { retry: () => void } | null }) {
  const [measure, setMeasure] = useState<WellnessMeasure>('average_wellbeing')
  const checkIns = data.wellbeing
  const rows = semester && 'rows' in semester ? semester.rows : null
  return <Collapsible.Root className="wellness-overview wellness-charts" role="region" aria-label="Wellness check-ins">
    <section className="overview-section chart-panel wellness-weekly" aria-labelledby="weekly-wellness-heading">
      <div className="chart-panel-heading">
        <h2 id="weekly-wellness-heading">Weekly trend</h2>
        <Collapsible.Trigger className="chart-action wellness-details-toggle">Check-in details</Collapsible.Trigger>
      </div>
      <figure className="chart-frame" aria-labelledby="weekly-wellness-heading">
        <WellnessTrend rows={data.wellbeing_trends} measure={measure} />
        {measure === 'average_stress' && <figcaption className="wellness-chart-note">Higher scores indicate more stress.</figcaption>}
      </figure>
    </section>
    <section className="overview-section chart-panel wellness-by-year" aria-labelledby="semester-wellness-heading">
      <div className="chart-panel-heading">
        <h2 id="semester-wellness-heading">By year level and semester</h2>
        <label className="wellness-controls">
          <span className="sr-only">Rating</span>
          <select className="wellness-measure" value={measure} onChange={event => setMeasure(event.target.value as WellnessMeasure)}>
            {Object.entries(wellnessMeasures).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>
      {!semester ? <p className="overview-muted" role="status">Loading semester comparisons…</p>
        : 'retry' in semester ? <SectionError message="Could not load semester comparisons." onRetry={semester.retry} />
        : rows?.length ? <figure className="chart-frame" aria-labelledby="semester-wellness-heading">
          <SemesterComparison rows={rows} measure={measure} />
          <figcaption className="wellness-chart-note">
            {rows.some(row => row[measure] == null) && <span>— Rating unavailable · </span>}Grouped by enrollment at check-in.
          </figcaption>
        </figure> : <p className="overview-muted">No semesters in this period</p>}
    </section>
    <Collapsible.Content className="overview-section wellness-details" role="region" aria-labelledby="check-in-details-heading">
      <div className="chart-panel-heading">
        <h2 id="check-in-details-heading">Check-in details</h2>
        <p className="overview-report-date">{reportDates(data.period_start, data.period_end)}</p>
      </div>
      {checkIns ? <dl className="wellbeing-summary">
        <div><dt>Check-in respondents</dt><dd>{count(checkIns.student_count)}</dd></div>
        <div><dt>Well-being</dt><dd>{score(checkIns.average_wellbeing)}</dd></div>
        <div><dt>Stress</dt><dd>{score(checkIns.average_stress)}</dd></div>
        <div><dt>Energy</dt><dd>{score(checkIns.average_energy)}</dd></div>
      </dl> : <p className="wellness-chart-note">Check-in summary unavailable for this period.</p>}
      {data.wellbeing_trends.length > 0 && <section className="report-section" aria-labelledby="weekly-coverage-heading">
        <h3 id="weekly-coverage-heading">Weekly ratings and coverage</h3>
        <ReportTable label="Weekly check-in ratings"
          columns={['Dates covered', 'Respondents', 'Accounts', 'Coverage', 'Well-being / 5', 'Stress / 5', 'Energy / 5']}
          rows={data.wellbeing_trends.map(row => ({
            id: row.bucket_start,
            heading: <>{reportDates(row.from_date, row.through_date)}{row.partial && <small className="report-row-note">Partial week</small>}</>,
            cells: [reportCount(row.student_count), reportCount(row.registered_students), reportPercent(row.coverage),
              reportDecimal(row.average_wellbeing, 2), reportDecimal(row.average_stress, 2), reportDecimal(row.average_energy, 2)],
          }))} />
      </section>}
      <p className="wellness-chart-note">Voluntary ratings give each respondent equal weight.</p>
    </Collapsible.Content>
  </Collapsible.Root>
}

function StudentInterests({ rows }: { rows: DashboardAnalytics['student_interests'] }) {
  const creators = rows.filter(row => row.creators != null)
  const maximum = Math.max(1, ...rows.map(row => row.creators ?? 0))
  return <section className="overview-section chart-panel report-section" aria-labelledby="interests-heading">
    <div className="chart-panel-heading"><h2 id="interests-heading">Students creating quests by category</h2></div>
    {creators.length > 0 ? <figure className="chart-frame" aria-labelledby="interests-heading">
      <ReportTable label="Distinct student creators by quest category" numericFrom={2}
        columns={['Category', 'Students']}
        rows={creators.map(({ category, creators }) => ({
          id: category,
          heading: category,
          cells: [<div className="interest-volume">
            <span className="interest-track" aria-hidden="true"><span style={{ width: (creators ?? 0) / maximum * 100 + '%' }} /></span>
            <span>{reportCount(creators)}</span>
          </div>],
        }))} />
    </figure>
      : <p className="overview-muted">No reportable category data.</p>}
  </section>
}

function CompletionDetails({ data }: { data: DashboardAnalytics }) {
  const first = data.first_week
  const repeat = data.repeat_participation
  const categories = data.student_interests.filter(row => row.completers != null)
  if (first?.rate == null && !repeat.some(row => row.rate != null) && categories.length === 0) return null

  return <details className="overview-section overview-disclosure completion-details">
    <summary>Completion details</summary>
    {first?.rate != null && <section className="report-section" aria-labelledby="first-week-heading">
      <h2 id="first-week-heading">First-week completion</h2>
      <p className="overview-muted">First quest completed within seven days of signup.</p>
      <ReportTable label="First-week quest completion" columns={['Cohort', 'Eligible accounts', 'Completed', 'Rate']}
        rows={[{ id: 'first-week', heading: 'New accounts', cells: [
          reportCount(first.eligible), reportCount(first.completed), reportPercent(first.rate),
        ] }]} />
    </section>}
    {repeat.some(row => row.rate != null) && <section className="report-section" aria-labelledby="repeat-heading">
      <h2 id="repeat-heading">Next-week repeat</h2>
      <p className="overview-muted">Students who completed quests in both weeks.</p>
      <ReportTable label="Repeat completions across consecutive weeks" numericFrom={2}
        columns={['First week', 'Next week', 'First-week completers', 'Completed both weeks', 'Rate']}
        rows={repeat.map(row => ({
          id: row.week_start,
          heading: reportDate(row.week_start),
          cells: [reportDate(row.next_week_start), reportCount(row.eligible), reportCount(row.completed), reportPercent(row.rate)],
        }))} />
    </section>}
    {categories.length > 0 && <section className="report-section" aria-labelledby="completion-categories-heading">
      <h2 id="completion-categories-heading">Student-created quests by category</h2>
      <ReportTable label="Distinct students completing student-created quests" columns={['Category', 'Students completing']}
        rows={categories.map(row => ({ id: row.category, heading: row.category, cells: [reportCount(row.completers)] }))} />
    </section>}
  </details>
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
