import { useEffect, useRef, useState } from 'react';
import { getDashboardAnalytics, getDashboardFilterOptions, logDashboardExport, type DashboardAnalytics, type DashboardFilterOption, type DashboardFilters, type OsasPermissions } from './osas-data';
import { downloadOsasReportCsv } from './osas-report';

const INSTITUTIONAL_TIMEZONE = 'Asia/Manila';
const institutionalToday = () => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: INSTITUTIONAL_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
};
const initialFilters = (): DashboardFilters => {
  const endDate = institutionalToday(); const start = new Date(`${endDate}T12:00:00Z`); start.setUTCDate(start.getUTCDate() - 29);
  return { startDate: start.toISOString().slice(0, 10), endDate, campus: null, course: null, yearLevel: null };
};
const number = (value: number | null | undefined) => value == null ? '—' : Number(value).toLocaleString();
const score = (value: number | null | undefined) => value == null ? '—' : `${Number(value).toFixed(2)} / 5`;
const labelDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export function OsasDashboard({ permissions, onOpenSupport }: { permissions: OsasPermissions; onOpenSupport: () => void }) {
  const [draft, setDraft] = useState<DashboardFilters>(initialFilters);
  const [filters, setFilters] = useState<DashboardFilters>(initialFilters);
  const [options, setOptions] = useState<DashboardFilterOption[]>([]);
  const [result, setResult] = useState<{ data: DashboardAnalytics; filters: DashboardFilters; reload: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [exportNotice, setExportNotice] = useState('');
  const [exporting, setExporting] = useState(false);
  const exportBusy = useRef(false);
  const reportGeneration = useRef(0);
  const [optionsError, setOptionsError] = useState('');
  const data = result?.filters === filters && result.reload === reload ? result.data : null;
  const invalidDates = !draft.startDate || !draft.endDate || draft.startDate > draft.endDate;
  const values = (dimension: DashboardFilterOption['dimension']) => options.filter((option) => option.dimension === dimension).map((option) => option.value);

  useEffect(() => {
    if (!permissions.can_view_aggregates) return;
    let cancelled = false;
    setOptionsError('');
    void getDashboardFilterOptions().then(rows => { if (!cancelled) setOptions(rows); }).catch((reason: Error) => { if (!cancelled) setOptionsError(reason.message); });
    return () => { cancelled = true; };
  }, [permissions.can_view_aggregates, reload]);
  useEffect(() => {
    reportGeneration.current++;
    if (!permissions.can_view_aggregates) return;
    let cancelled = false;
    setLoading(true); setError('');
    void getDashboardAnalytics(filters)
      .then(data => { if (!cancelled) setResult({ data, filters, reload }); })
      .catch((reason: Error) => { if (!cancelled) { setResult(null); setError(reason.message); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; reportGeneration.current++; };
  }, [filters, permissions.can_view_aggregates, reload]);

  const exportCsv = async () => {
    if (!data || !result || data.suppressed || loading || !permissions.can_view_aggregates || exportBusy.current) return;
    exportBusy.current = true;
    const generation = reportGeneration.current;
    setExporting(true); setExportNotice('');
    try {
      await logDashboardExport(result.filters);
      if (generation !== reportGeneration.current) return;
      downloadOsasReportCsv(result.data, result.filters);
      setExportNotice('CSV report downloaded and recorded in the report audit log.');
    }
    catch (reason) { setExportNotice(reason instanceof Error ? reason.message : 'Report export failed.'); }
    finally { exportBusy.current = false; setExporting(false); }
  };

  if (!permissions.can_view_aggregates) return <section className="panel dashboard-denied" role="alert"><h2>Could not verify OSAS access</h2><p>All active admins receive OSAS reporting and support access automatically. Reload the page to verify access again.</p><button className="secondary-button" onClick={() => window.location.reload()}>Reload page</button></section>;

  return <div className="osas-dashboard">
    <section className="panel dashboard-filters">
      <div><h2>Reporting filters</h2><p>Choose one demographic dimension at a time. Small cohorts and small complementary groups are withheld, and queries and exports are audited.</p></div>
      <div className="dashboard-filter-grid">
        <label>FROM<input type="date" value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} /></label>
        <label>TO<input type="date" value={draft.endDate} onChange={(event) => setDraft({ ...draft, endDate: event.target.value })} /></label>
        <Filter label="CAMPUS" value={draft.campus} options={values('campus')} onChange={(campus) => setDraft({ ...draft, campus, course: null, yearLevel: null })} />
        <Filter label="PROGRAM" value={draft.course} options={values('course')} onChange={(course) => setDraft({ ...draft, campus: null, course, yearLevel: null })} />
        <Filter label="YEAR LEVEL" value={draft.yearLevel} options={values('year_level')} onChange={(yearLevel) => setDraft({ ...draft, campus: null, course: null, yearLevel })} />
        <button className="primary-button" onClick={() => { reportGeneration.current++; setExportNotice(''); setFilters({ ...draft }); }} disabled={invalidDates}>Apply filters</button>
      </div>
      {draft.startDate > draft.endDate && <p className="form-error" role="alert">The start date must be on or before the end date.</p>}
      {optionsError && <p className="form-error" role="alert">Filter choices could not load: {optionsError} <button className="secondary-button" onClick={() => setReload(value => value + 1)}>Retry</button></p>}
      <div className="report-actions"><button className="secondary-button" onClick={() => void exportCsv()} disabled={!data || data.suppressed || loading || exporting}>{exporting ? 'Recording export…' : 'Export displayed data as CSV'}</button>{exportNotice && <span role="status">{exportNotice}</span>}</div>
    </section>
    {loading && <section className="panel dashboard-state">Loading protected aggregate reports…</section>}
    {error && <section className="panel dashboard-state error" role="alert">Dashboard could not load: {error}<br /><button className="secondary-button" onClick={() => setReload((value) => value + 1)}>Retry</button></section>}
    {!loading && !error && data?.suppressed && <section className="panel dashboard-state"><h2>Report withheld for privacy</h2><p>The selected cohort or its complementary group is smaller than {data.minimum_cohort} students, so all results are withheld.</p></section>}
    {!loading && !error && data && !data.suppressed && <DashboardContent data={data} canManageSupport={permissions.can_manage_support_requests} onOpenSupport={onOpenSupport} />}
  </div>;
}

function Filter({ label, value, options, onChange }: { label: string; value: string | null; options: string[]; onChange: (value: string | null) => void }) {
  return <label>{label}<select value={value ?? ''} onChange={(event) => onChange(event.target.value || null)}><option value="">All</option>{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
}

function DashboardContent({ data, canManageSupport, onOpenSupport }: { data: DashboardAnalytics; canManageSupport: boolean; onOpenSupport: () => void }) {
  const p = data.participation!;
  return <>
    <p className="dashboard-period">Showing {labelDate(data.period_start)}–{labelDate(data.period_end)} in {data.institutional_timezone}. Enrollment cohort is evaluated as of {labelDate(data.cohort_as_of)}. Counts identify participation records, not verified personal improvement.</p>
    <div className="stats dashboard-stats">
      <Metric icon="S" label="Registered students" value={number(p.registered_students)} detail="Students matching the selected cohort" />
      <Metric icon="A" tone="green" label="Students with quest activity" value={number(p.participating_students)} detail="Unique students creating or completing quests" />
      <Metric icon="C" tone="blue" label="Completion events" value={number(p.completion_events)} detail="Durable completions in the period" />
      <Metric icon="G" tone="orange" label="Students with goals" value={number(p.students_with_goals)} detail="Current student records with a goal" />
    </div>
    <div className="two-panels dashboard-panels">
      <section className="panel"><PanelTitle title="Quest completion activity" subtitle={`${number(p.quests_completed)} of ${number(p.quests_created)} quests created in this period were completed by period end`} /><BarChart rows={data.activity_trends.map((row) => ({ label: labelDate(row.bucket_start), value: row.completion_events }))} empty="No trend cell reached five participating students." /><p className="metric-footnote">Lifecycle completion rate: <b>{p.quest_completion_rate == null ? 'No privacy-safe denominator' : `${p.quest_completion_rate}%`}</b>. Deleted quests remain in the immutable lifecycle denominator.</p></section>
      <section className="panel"><PanelTitle title="Development categories" subtitle="Durable quest completions by category" /><RankBars rows={data.category_participation.map((row) => ({ label: row.category, value: row.completion_events, detail: `${row.student_count} students` }))} empty="No category reached five participating students." /></section>
    </div>
    <section className="dashboard-section"><h2>Reported well-being</h2><p>Voluntary 1–5 self-ratings. These values are descriptive and are not clinical assessments.</p></section>
    {data.wellbeing ? <><div className="stats dashboard-stats"><Metric label="Well-being" value={score(data.wellbeing.average_wellbeing)} detail={`${data.wellbeing.check_in_count} check-ins from ${data.wellbeing.student_count} students`} /><Metric label="Stress" value={score(data.wellbeing.average_stress)} detail="Student-weighted; 1 low, 5 high" /><Metric label="Energy" value={score(data.wellbeing.average_energy)} detail="Student-weighted; 1 low, 5 high" /><Metric label="Motivation" value={score(data.wellbeing.average_motivation)} detail={`${data.wellbeing.motivation_response_count} optional responses`} /></div><section className="panel"><PanelTitle title="Check-in trends" subtitle="Each participating student has equal weight within a period" /><ScoreChart rows={data.wellbeing_trends} series={[['average_wellbeing', 'Well-being'], ['average_stress', 'Stress'], ['average_energy', 'Energy'], ['average_motivation', 'Motivation']]} /></section></> : <ProtectedEmpty label="well-being check-ins" />}
    <section className="dashboard-section"><h2>Self-management reflection</h2><p>Aggregated voluntary scores; written accomplishments, challenges, and next steps remain private.</p></section>
    {data.self_management ? <><div className="stats dashboard-stats"><Metric label="Planning" value={score(data.self_management.average_planning)} detail="Equal weight per participating student" /><Metric label="Follow-through" value={score(data.self_management.average_follow_through)} detail="Equal weight per participating student" /><Metric label="Confidence" value={score(data.self_management.average_confidence)} detail="Equal weight per participating student" /><Metric label="Reflection participation" value={number(data.self_management.reflection_count)} detail={`${data.self_management.student_count} unique students`} /></div><section className="panel"><PanelTitle title="Reflection trends" subtitle="Student-weighted planning, follow-through, and confidence" /><ScoreChart rows={data.reflection_trends} series={[['average_planning', 'Planning'], ['average_follow_through', 'Follow-through'], ['average_confidence', 'Confidence']]} /></section></> : <ProtectedEmpty label="self-management reflections" />}
    <section className="dashboard-section support-heading"><div><h2>Voluntary support requests</h2><p>Aggregate status and category counts only. Concerns and case notes are excluded.</p></div>{canManageSupport ? <button className="primary-button" onClick={onOpenSupport}>Manage support requests</button> : <span className="permission-chip">Support access not verified</span>}</section>
    {data.support ? <><div className="stats dashboard-stats"><Metric label="Total requests" value={number(data.support.request_count)} detail={`${data.support.student_count} unique students`} /><Metric label="Submitted" value={number(data.support.submitted_count)} detail="Awaiting acknowledgement" /><Metric label="Active follow-up" value={number(data.support.acknowledged_count + data.support.in_progress_count)} detail="Acknowledged or in progress" /><Metric label="Closed" value={number(data.support.resolved_count + data.support.withdrawn_count)} detail={`${data.support.resolved_count} resolved, ${data.support.withdrawn_count} withdrawn`} /></div><div className="two-panels dashboard-panels"><section className="panel"><PanelTitle title="Request trends" subtitle="Total voluntary requests over time" /><BarChart rows={data.support_trends.map((row) => ({ label: labelDate(row.bucket_start), value: row.request_count }))} empty="No trend cell reached five requesting students." /></section><section className="panel"><PanelTitle title="Support categories" subtitle="Categories with at least five requesting students" /><RankBars rows={data.support_categories.map((row) => ({ label: row.category, value: row.request_count, detail: `${row.student_count} students` }))} empty="No category reached the privacy threshold." /></section></div></> : <ProtectedEmpty label="support requests" />}
    <p className="privacy-note">Privacy: only aggregated numeric records are returned. Wellness notes, written reflections, student identities, request messages, quest details, and location data are not included.</p>
  </>;
}

function Metric({ icon, tone = '', label, value, detail }: { icon?: string; tone?: string; label: string; value: string; detail: string }) {
  return <article className="stat-card">
    <div className="metric-heading"><div className="metric-value"><small>{label}</small><strong>{value}</strong></div>{icon && <span className={`stat-icon ${tone}`} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {icon === 'S' && <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M17 14a5 5 0 0 1 4 5v1" /></>}
      {icon === 'A' && <><path d="M3 12h4l3-7 4 14 3-7h4" /><path d="M3 4v16h18" /></>}
      {icon === 'C' && <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="m8 12 3 3 5-6" /></>}
      {icon === 'G' && <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>}
    </svg></span>}</div>
    <p>{detail}</p>
  </article>;
}
function PanelTitle({ title, subtitle }: { title: string; subtitle: string }) { return <div className="panel-heading"><div><h2>{title}</h2><p>{subtitle}</p></div></div>; }
function ProtectedEmpty({ label }: { label: string }) { return <section className="panel dashboard-state"><p>No {label} can be displayed. There may be no records in this period, or fewer than five distinct students contributed.</p></section>; }
function BarChart({ rows, empty }: { rows: { label: string; value: number }[]; empty: string }) {
  const max = Math.max(...rows.map((row) => Number(row.value)), 1);
  if (!rows.length) return <div className="chart-empty">{empty}</div>;
  return <><div className="dashboard-bars" role="list" aria-label="Trend bar chart">{rows.map((row) => <div key={row.label} role="listitem" aria-label={`${row.label}: ${row.value}`}><span aria-hidden="true" style={{ height: `${Math.max(8, Number(row.value) / max * 100)}%` }} /><small>{row.label}</small></div>)}</div><ChartDataTable columns={['Period', 'Completions']} rows={rows.map((row) => [row.label, row.value])} /></>;
}
function RankBars({ rows, empty }: { rows: { label: string; value: number; detail: string }[]; empty: string }) {
  const max = Math.max(...rows.map((row) => Number(row.value)), 1);
  if (!rows.length) return <div className="chart-empty">{empty}</div>;
  return <div className="rank-bars">{rows.map((row) => <div key={row.label}><span><b>{row.label}</b><small>{row.detail}</small></span><i><em style={{ width: `${Number(row.value) / max * 100}%` }} /></i><strong>{row.value}</strong></div>)}</div>;
}
function ScoreChart<T extends { bucket_start: string }>({ rows, series }: { rows: T[]; series: [keyof T, string][] }) {
  const colors = ['var(--chart-honey)', 'var(--chart-coral)', 'var(--chart-green)', 'var(--honey-deep)'];
  const points = (key: keyof T) => rows.map((row, index) => `${rows.length === 1 ? 50 : index * 100 / (rows.length - 1)},${100 - (Number(row[key]) - 1) * 25}`).join(' ');
  if (!rows.length) return <div className="chart-empty">No trend cell reached five participating students.</div>;
  return <div className="score-chart"><div className="score-legend">{series.map(([, label], index) => <span key={label}><i style={{ background: colors[index] }} />{label}</span>)}</div><svg viewBox="0 -5 100 110" preserveAspectRatio="none" role="img" aria-label={`Average rating trends from one to five. Series: ${series.map(([, label]) => label).join(', ')}. Use the data table for values.`}>{[0, 25, 50, 75, 100].map((y) => <line key={y} x1="0" x2="100" y1={y} y2={y} />)}{series.map(([key], index) => <polyline key={String(key)} points={points(key)} style={{ stroke: colors[index] }} />)}</svg><div className="score-labels">{rows.map((row) => <small key={row.bucket_start}>{labelDate(row.bucket_start)}</small>)}</div><ChartDataTable columns={['Period', ...series.map(([, label]) => label)]} rows={rows.map((row) => [labelDate(row.bucket_start), ...series.map(([key]) => row[key] == null ? 'Not available' : Number(row[key]).toFixed(1))])} /></div>;
}
function ChartDataTable({ columns, rows }: { columns: string[]; rows: (string | number)[][] }) {
  return <details className="chart-data"><summary>View data table</summary><div className="chart-data-scroll"><table><thead><tr>{columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${String(row[0])}-${index}`}>{row.map((value, cell) => <td key={`${cell}-${String(value)}`}>{value}</td>)}</tr>)}</tbody></table></div></details>;
}
