import { useEffect, useState } from 'react';
import { getDashboardAnalytics, getDashboardFilterOptions, type DashboardAnalytics, type DashboardFilterOption, type DashboardFilters, type OsasPermissions } from './osas-data';

const iso = (date: Date) => date.toISOString().slice(0, 10);
const initialFilters = (): DashboardFilters => {
  const end = new Date(); const start = new Date(end); start.setDate(start.getDate() - 29);
  return { startDate: iso(start), endDate: iso(end), campus: null, course: null, yearLevel: null };
};
const number = (value: number | null | undefined) => value == null ? '—' : Number(value).toLocaleString();
const score = (value: number | null | undefined) => value == null ? '—' : `${Number(value).toFixed(2)} / 5`;
const labelDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export function OsasDashboard({ permissions, onOpenSupport }: { permissions: OsasPermissions; onOpenSupport: () => void }) {
  const [draft, setDraft] = useState<DashboardFilters>(initialFilters);
  const [filters, setFilters] = useState<DashboardFilters>(initialFilters);
  const [options, setOptions] = useState<DashboardFilterOption[]>([]);
  const [data, setData] = useState<DashboardAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const values = (dimension: DashboardFilterOption['dimension']) => options.filter((option) => option.dimension === dimension).map((option) => option.value);

  useEffect(() => {
    if (!permissions.can_view_aggregates) return;
    void getDashboardFilterOptions().then(setOptions).catch((reason: Error) => setError(reason.message));
  }, [permissions.can_view_aggregates]);
  useEffect(() => {
    if (!permissions.can_view_aggregates) return;
    setLoading(true); setError('');
    void getDashboardAnalytics(filters).then(setData).catch((reason: Error) => { setData(null); setError(reason.message); }).finally(() => setLoading(false));
  }, [filters, permissions.can_view_aggregates]);

  if (!permissions.can_view_aggregates) return <section className="panel dashboard-denied"><h2>OSAS reporting permission required</h2><p>This dashboard contains privacy-protected aggregate student information. A Super Admin must explicitly grant Aggregate reporting access.</p></section>;

  return <div className="osas-dashboard">
    <section className="panel dashboard-filters">
      <div><h2>Reporting filters</h2><p>All results use the same period and student cohort. Groups with fewer than five students are withheld.</p></div>
      <div className="dashboard-filter-grid">
        <label>FROM<input type="date" value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} /></label>
        <label>TO<input type="date" value={draft.endDate} onChange={(event) => setDraft({ ...draft, endDate: event.target.value })} /></label>
        <Filter label="CAMPUS" value={draft.campus} options={values('campus')} onChange={(campus) => setDraft({ ...draft, campus })} />
        <Filter label="PROGRAM" value={draft.course} options={values('course')} onChange={(course) => setDraft({ ...draft, course })} />
        <Filter label="YEAR LEVEL" value={draft.yearLevel} options={values('year_level')} onChange={(yearLevel) => setDraft({ ...draft, yearLevel })} />
        <button className="primary-button" onClick={() => setFilters(draft)} disabled={!draft.startDate || !draft.endDate}>Apply filters</button>
      </div>
    </section>
    {loading && <section className="panel dashboard-state">Loading protected aggregate reports…</section>}
    {error && <section className="panel dashboard-state error">Dashboard could not load: {error}. Apply migration 015 after migrations 012–014.</section>}
    {!loading && !error && data?.suppressed && <section className="panel dashboard-state"><h2>Insufficient cohort size</h2><p>This filter matches fewer than {data.minimum_cohort} registered students, so all results are withheld to protect privacy.</p></section>}
    {!loading && !error && data && !data.suppressed && <DashboardContent data={data} canManageSupport={permissions.can_manage_support_requests} onOpenSupport={onOpenSupport} />}
  </div>;
}

function Filter({ label, value, options, onChange }: { label: string; value: string | null; options: string[]; onChange: (value: string | null) => void }) {
  return <label>{label}<select value={value ?? ''} onChange={(event) => onChange(event.target.value || null)}><option value="">All</option>{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
}

function DashboardContent({ data, canManageSupport, onOpenSupport }: { data: DashboardAnalytics; canManageSupport: boolean; onOpenSupport: () => void }) {
  const p = data.participation!;
  return <>
    <p className="dashboard-period">Showing {labelDate(data.period_start)}–{labelDate(data.period_end)}. Counts identify participation records, not verified personal improvement.</p>
    <div className="stats dashboard-stats">
      <Metric icon="S" label="Registered students" value={number(p.registered_students)} detail="Students matching the selected cohort" />
      <Metric icon="A" tone="green" label="Students with quest activity" value={number(p.participating_students)} detail="Unique students creating or completing quests" />
      <Metric icon="C" tone="blue" label="Completion events" value={number(p.completion_events)} detail="Durable completions in the period" />
      <Metric icon="G" tone="orange" label="Students with goals" value={number(p.students_with_goals)} detail="Current student records with a goal" />
    </div>
    <div className="two-panels dashboard-panels">
      <section className="panel"><PanelTitle title="Quest completion activity" subtitle={`${number(p.current_quests_completed)} of ${number(p.current_quests_created)} surviving quests created in this period were completed`} /><BarChart rows={data.activity_trends.map((row) => ({ label: labelDate(row.bucket_start), value: row.completion_events }))} empty="No trend cell reached five participating students." /><p className="metric-footnote">Current quest completion rate: <b>{p.current_quest_completion_rate == null ? 'No valid denominator' : `${p.current_quest_completion_rate}%`}</b>. Deleted quests remain represented only in completion events.</p></section>
      <section className="panel"><PanelTitle title="Development categories" subtitle="Durable quest completions by category" /><RankBars rows={data.category_participation.map((row) => ({ label: row.category, value: row.completion_events, detail: `${row.student_count} students` }))} empty="No category reached five participating students." /></section>
    </div>
    <section className="dashboard-section"><h2>Reported well-being</h2><p>Voluntary 1–5 self-ratings. These values are descriptive and are not clinical assessments.</p></section>
    {data.wellbeing ? <><div className="stats dashboard-stats"><Metric label="Well-being" value={score(data.wellbeing.average_wellbeing)} detail={`${data.wellbeing.check_in_count} check-ins from ${data.wellbeing.student_count} students`} /><Metric label="Stress" value={score(data.wellbeing.average_stress)} detail="1 low, 5 high" /><Metric label="Energy" value={score(data.wellbeing.average_energy)} detail="1 low, 5 high" /><Metric label="Motivation" value={score(data.wellbeing.average_motivation)} detail={`${data.wellbeing.motivation_response_count} optional responses`} /></div><section className="panel"><PanelTitle title="Check-in trends" subtitle="Cohort-protected averages over time" /><ScoreChart rows={data.wellbeing_trends} series={[['average_wellbeing', 'Well-being'], ['average_stress', 'Stress'], ['average_energy', 'Energy'], ['average_motivation', 'Motivation']]} /></section></> : <ProtectedEmpty label="well-being check-ins" />}
    <section className="dashboard-section"><h2>Self-management reflection</h2><p>Aggregated voluntary scores; written accomplishments, challenges, and next steps remain private.</p></section>
    {data.self_management ? <><div className="stats dashboard-stats"><Metric label="Planning" value={score(data.self_management.average_planning)} detail="Average self-rating" /><Metric label="Follow-through" value={score(data.self_management.average_follow_through)} detail="Average self-rating" /><Metric label="Confidence" value={score(data.self_management.average_confidence)} detail="Average self-rating" /><Metric label="Reflection participation" value={number(data.self_management.reflection_count)} detail={`${data.self_management.student_count} unique students`} /></div><section className="panel"><PanelTitle title="Reflection trends" subtitle="Planning, follow-through, and confidence over time" /><ScoreChart rows={data.reflection_trends} series={[['average_planning', 'Planning'], ['average_follow_through', 'Follow-through'], ['average_confidence', 'Confidence']]} /></section></> : <ProtectedEmpty label="self-management reflections" />}
    <section className="dashboard-section support-heading"><div><h2>Voluntary support requests</h2><p>Aggregate status and category counts only. Concerns and case notes are excluded.</p></div>{canManageSupport ? <button className="primary-button" onClick={onOpenSupport}>Manage support requests</button> : <span className="permission-chip">Identifiable case access not granted</span>}</section>
    {data.support ? <><div className="stats dashboard-stats"><Metric label="Total requests" value={number(data.support.request_count)} detail={`${data.support.student_count} unique students`} /><Metric label="Submitted" value={number(data.support.submitted_count)} detail="Awaiting acknowledgement" /><Metric label="Active follow-up" value={number(data.support.acknowledged_count + data.support.in_progress_count)} detail="Acknowledged or in progress" /><Metric label="Closed" value={number(data.support.resolved_count + data.support.withdrawn_count)} detail={`${data.support.resolved_count} resolved, ${data.support.withdrawn_count} withdrawn`} /></div><div className="two-panels dashboard-panels"><section className="panel"><PanelTitle title="Request trends" subtitle="Total voluntary requests over time" /><BarChart rows={data.support_trends.map((row) => ({ label: labelDate(row.bucket_start), value: row.request_count }))} empty="No trend cell reached five requesting students." /></section><section className="panel"><PanelTitle title="Support categories" subtitle="Categories with at least five requesting students" /><RankBars rows={data.support_categories.map((row) => ({ label: row.category, value: row.request_count, detail: `${row.student_count} students` }))} empty="No category reached the privacy threshold." /></section></div></> : <ProtectedEmpty label="support requests" />}
    <p className="privacy-note">Privacy: only aggregated numeric records are returned. Wellness notes, written reflections, student identities, request messages, quest details, and location data are not included.</p>
  </>;
}

function Metric({ icon, tone = '', label, value, detail }: { icon?: string; tone?: string; label: string; value: string; detail: string }) { return <article className="stat-card">{icon && <span className={`stat-icon ${tone}`}>{icon}</span>}<small>{label}</small><div><strong>{value}</strong></div><p>{detail}</p></article>; }
function PanelTitle({ title, subtitle }: { title: string; subtitle: string }) { return <div className="panel-heading"><div><h2>{title}</h2><p>{subtitle}</p></div></div>; }
function ProtectedEmpty({ label }: { label: string }) { return <section className="panel dashboard-state"><p>No {label} can be displayed. There may be no records in this period, or fewer than five distinct students contributed.</p></section>; }
function BarChart({ rows, empty }: { rows: { label: string; value: number }[]; empty: string }) {
  const max = Math.max(...rows.map((row) => Number(row.value)), 1);
  if (!rows.length) return <div className="chart-empty">{empty}</div>;
  return <div className="dashboard-bars" aria-label="Trend bar chart">{rows.map((row) => <div key={row.label}><span title={`${row.label}: ${row.value}`} style={{ height: `${Math.max(8, Number(row.value) / max * 100)}%` }} /><small>{row.label}</small></div>)}</div>;
}
function RankBars({ rows, empty }: { rows: { label: string; value: number; detail: string }[]; empty: string }) {
  const max = Math.max(...rows.map((row) => Number(row.value)), 1);
  if (!rows.length) return <div className="chart-empty">{empty}</div>;
  return <div className="rank-bars">{rows.map((row) => <div key={row.label}><span><b>{row.label}</b><small>{row.detail}</small></span><i><em style={{ width: `${Number(row.value) / max * 100}%` }} /></i><strong>{row.value}</strong></div>)}</div>;
}
function ScoreChart<T extends { bucket_start: string }>({ rows, series }: { rows: T[]; series: [keyof T, string][] }) {
  const colors = ['#e7b329', '#e56b5d', '#5fba75', '#6c9bea'];
  const points = (key: keyof T) => rows.map((row, index) => `${rows.length === 1 ? 50 : index * 100 / (rows.length - 1)},${100 - (Number(row[key]) - 1) * 25}`).join(' ');
  if (!rows.length) return <div className="chart-empty">No trend cell reached five participating students.</div>;
  return <div className="score-chart"><div className="score-legend">{series.map(([, label], index) => <span key={label}><i style={{ background: colors[index] }} />{label}</span>)}</div><svg viewBox="0 -5 100 110" preserveAspectRatio="none" role="img" aria-label="Average rating trends from one to five">{[0, 25, 50, 75, 100].map((y) => <line key={y} x1="0" x2="100" y1={y} y2={y} />)}{series.map(([key], index) => <polyline key={String(key)} points={points(key)} style={{ stroke: colors[index] }} />)}</svg><div className="score-labels">{rows.map((row) => <small key={row.bucket_start}>{labelDate(row.bucket_start)}</small>)}</div></div>;
}
