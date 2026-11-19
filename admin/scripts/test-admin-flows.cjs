const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const { hookHarness, flush, deferred } = require('./test-admin-access.cjs');

const root = path.resolve(__dirname, '../..');
const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
function load(source, h, mocks = {}) {
  const timers = new Map(); let timerId = 0;
  const code = ts.transpileModule(fs.readFileSync(path.join(root, source), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, Error, AbortController,
    require: name => name === 'react' ? h.react : name === 'react/jsx-runtime' ? { jsx, jsxs: jsx, Fragment: 'fragment' } : mocks[name] ?? {},
    setTimeout: fn => { timers.set(++timerId, fn); return timerId; },
    clearTimeout: id => timers.delete(id),
    window: { confirm: () => true },
    FormData: class { constructor(values) { this.values = values; } get(key) { return this.values[key] ?? null; } },
  });
  return { exports: module.exports, timers: () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(fn => fn()); } };
}
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object') return [];
  if (typeof tree.type === 'function' && ['SearchField', 'PageSize', 'Pagination', 'SectionError', 'Status', 'ConsoleTable', 'ConsoleCell'].includes(tree.type.name)) return nodes(tree.type(tree.props));
  return [tree, ...nodes(tree.props?.children)];
}
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join('');
  if (tree == null || typeof tree === 'boolean') return '';
  return typeof tree === 'object' ? text(tree.props?.children) : String(tree);
}
const find = (tree, type, predicate = () => true) => {
  const node = nodes(tree).find(node => node.type === type && predicate(node));
  assert(node, 'Missing ' + type); return node;
};
const button = (tree, label) => find(tree, 'button', node => text(node) === label);
const event = values => ({ preventDefault() {}, currentTarget: values, nativeEvent: { submitter: { getAttribute: () => 'publish' } } });
let count = 0;
async function test(name, run) { await run(); count++; console.log('PASS ' + name); }

async function reports() {
  const h = hookHarness(), requests = [], semesterRequests = [], audits = [], downloads = [];
  let auditWait = null, auditError = null;
  const mod = load('admin/src/OsasDashboard.tsx', h, {
    'radix-ui': { Tabs: { Root: 'tabs-root', List: 'tabs-list', Trigger: 'tabs-trigger', Content: 'tabs-content' } },
    './osas-data': {
      getReportingTimezone: async () => 'Asia/Manila',
      getDashboardAnalytics: filters => { const pending = deferred(); requests.push({ filters, pending }); return pending.promise; },
      getSemesterWellness: filters => { const pending = deferred(); semesterRequests.push({ filters, pending }); return pending.promise; },
      logDashboardExport: async filters => { audits.push(filters); if (auditWait) await auditWait.promise; if (auditError) throw auditError; },
    },
    './osas-report': { downloadOsasReportCsv: (data, rows) => downloads.push({ data, rows }) },
  });
  const permissions = { can_view_aggregates: true, can_manage_support_requests: false };
  let view = 'Reports';
  const goTo = section => { view = section; h.render(); };
  h.mount(() => mod.exports.OsasDashboard({ view, permissions, assignmentRevision: 0, onOpenQuest() {}, onCreateQuest() {}, onNavigate: goTo }));
  const result = (index, id) => ({
    id, suppressed: false, participation: { registered_students: 10, participating_students: 6, completion_events: 7 }, activity_trends: [], wellbeing_trends: [],
    student_interests: [], first_week: null, assignment_outcomes: [],
    repeat_participation: [
      { week_start: '2026-01-05', next_week_start: '2026-01-12', eligible: 16, completed: 8, rate: 50 },
      { week_start: '2026-01-12', next_week_start: '2026-01-19', eligible: null, completed: null, rate: null },
    ],
    cohort_as_of: '2026-02-28',
    period_start: requests[index].filters.startDate, period_end: requests[index].filters.endDate,
  });
  const applyDate = async date => {
    const dates = nodes(h.value).filter(node => node.type === 'input' && node.props.type === 'date');
    dates[0].props.onChange({ target: { value: date } }); await flush();
    find(h.value, 'input', node => node.props.type === 'date' && node.props.min === date).props.onChange({ target: { value: '2026-03-01' } });
    await flush(); find(h.value, 'form').props.onSubmit({ preventDefault() {} }); await flush();
  };
  await flush();
  assert.equal((Date.parse(requests[0].filters.endDate) - Date.parse(requests[0].filters.startDate)) / 86_400_000, 29);
  find(h.value, 'select').props.onChange({ target: { value: 'custom' } });
  await flush();
  await applyDate('2026-01-01');
  requests[1].pending.resolve(result(1, 'current')); await flush();
  assert.equal(button(h.value, 'Export CSV').props.disabled, true, 'Wait for the matching semester report before export');
  const currentSemester = [{ semester_id: 'current-semester', academic_year: '2025-2026', term: '2nd Semester',
    year_level: '1st Year', respondents: 6, average_wellbeing: 3.5, average_stress: 2, average_energy: 4 }];
  semesterRequests[1].pending.resolve(currentSemester); await flush();
  requests[0].pending.resolve(result(0, 'stale')); await flush();
  semesterRequests[0].pending.resolve([]); await flush();
  goTo('Wellness'); await flush();
  const checkIns = nodes(h.value).find(node => node.type?.name === 'CheckIns');
  assert.deepEqual(checkIns.props.semester.rows, currentSemester);
  assert(!nodes(h.value).some(node => node.type?.name === 'QuestEngagement'), 'Wellness has its own screen');
  goTo('Engagement');
  const displayed = nodes(h.value).find(node => node.type?.name === 'QuestEngagement');
  assert.equal(displayed.props.data.id, 'current');
  const engagement = displayed.type(displayed.props);
  const participation = find(engagement, 'tabs-content', node => node.props.value === 'participation').props.children;
  const participationSummary = participation.type(participation.props);
  assert(!nodes(participationSummary).some(node => node.type?.name === 'CompletionChart'));
  const completions = find(engagement, 'tabs-content', node => node.props.value === 'completions').props.children;
  const completionSummary = completions.type(completions.props);
  const completionMetrics = nodes(completionSummary).find(node => node.type?.name === 'EngagementMetrics').props.metrics;
  assert.equal(completionMetrics.find(metric => metric.label === 'Next-week repeat').value, null,
    'A withheld latest pair must not be replaced by an older released pair.');
  const chart = nodes(completionSummary).find(node => node.type?.name === 'CompletionChart');
  assert(!nodes(chart.type(chart.props)).some(node => node.type === 'details'), 'An empty trend should not offer an unavailable-only table');
  const chartTable = find(chart.type({ data: {
    ...displayed.props.data, period_start: '2026-09-01', period_end: '2026-09-03',
    activity_trends: [{ bucket_start: '2026-09-01', student_count: 5, completion_events: 6 }, { bucket_start: '2026-09-03', student_count: 5, completion_events: 8 }],
  } }), 'tbody');
  const withheldRow = find(chartTable, 'tr', node => text(node).includes('Unavailable'));
  assert.equal(find(withheldRow, 'time').props.dateTime, '2026-09-02');
  assert.deepEqual(nodes(withheldRow).filter(node => node.type === 'td').map(text), ['Unavailable', 'Unavailable']);
  goTo('Reports'); await flush();
  button(h.value, 'Export CSV').props.onClick(); await flush();
  assert.equal(downloads[0].data.id, 'current');
  assert.deepEqual(downloads[0].rows, currentSemester);
  assert.deepEqual({ ...audits[0] }, { startDate: '2026-01-01', endDate: '2026-03-01' });

  auditError = new Error('Audit rejected');
  button(h.value, 'Export CSV').props.onClick(); await flush();
  assert.equal(downloads.length, 1, 'Failed audit must prevent download');
  auditError = null; auditWait = deferred();
  button(h.value, 'Retry').props.onClick(); await flush();
  await applyDate('2026-02-01');
  auditWait.resolve(); await flush();
  assert.equal(downloads.length, 1, 'Changed report must cancel the pending download');
  requests[2].pending.resolve({ ...result(2, 'withheld'), suppressed: true, minimum_cohort: 5 }); await flush();
  assert.equal(button(h.value, 'Export CSV').props.disabled, true);
  const queriesBeforeOverview = semesterRequests.length;
  goTo('Overview');
  assert.equal((Date.parse(requests[3].filters.endDate) - Date.parse(requests[3].filters.startDate)) / 86_400_000, 29);
  requests[3].pending.resolve(result(3, 'overview')); await flush();
  assert.equal(semesterRequests.length, queriesBeforeOverview, 'Overview does not query semester comparisons');
  const overview = nodes(h.value).find(node => node.type?.name === 'ExecutiveOverview');
  const glance = overview.type(overview.props);
  assert.equal(nodes(glance).filter(node => node.type === 'dt').length, 4);
  assert.equal(nodes(glance).filter(node => node.type?.name === 'WellnessTrend').length, 1);
  assert(!nodes(h.value).some(node => ['form', 'table'].includes(node.type) || node.type?.name === 'RecentAssignments'));
  button(glance, 'View wellness').props.onClick();
  assert.equal(view, 'Wellness');
  assert.equal(requests[4].filters.startDate, '2026-02-01', 'Drill-down restores the report date filter');
  h.unmount();
}

async function tables() {
  const h = hookHarness(); let refreshes = 0;
  let query = { page: 3, pageSize: 50, search: '', status: 'All' };
  const mod = load('admin/src/AdminTables.tsx', h);
  const props = () => ({ kind: 'users', users: [], total: 0, query, error: 'Offline', onRefresh: () => refreshes++, onQueryChange: value => { query = value; h.render(); } });
  h.mount(() => { const table = mod.exports.DataTable(props()); return table.type(table.props); });
  find(h.value, 'input').props.onChange({ target: { value: 'Ana' } }); await flush(); mod.timers(); await flush();
  assert.equal(query.search, 'Ana'); assert.equal(query.page, 0);
  find(h.value, 'select').props.onChange({ target: { value: 'Inactive' } }); await flush();
  assert.equal(query.status, 'Inactive'); assert.equal(query.search, 'Ana');
  query.page = 2;
  find(h.value, 'select', node => node.props['aria-label'] === 'Rows per page').props.onChange({ target: { value: '20' } }); await flush();
  assert.equal(query.page, 0); assert.equal(query.pageSize, 20); assert.equal(query.search, 'Ana'); assert.equal(query.status, 'Inactive');
  button(h.value, 'Refresh').props.onClick(); assert.equal(refreshes, 1);
  h.unmount();


}

async function roleControls() {
  const h = hookHarness(); const mod = load('admin/src/AdminTables.tsx', h);
  const self = { id: 'self', displayName: 'Current Admin', email: 'self@example.test', role: 'super_admin', isActive: true };
  const other = { id: 'other', displayName: 'Other Admin', email: 'other@example.test', role: 'admin', isActive: true };
  const tree = mod.exports.AdminTable({ admins: [self, other], currentAdminId: 'self', loading: false, error: '', onRefresh() {}, onAdd() {}, onUpdate() {}, onRemove() {} });
  const ownRow = nodes(tree).find(node => node.props?.className?.includes('self-admin-row'));
  assert.equal(find(ownRow, 'select').props.disabled, true);
  assert.equal(button(ownRow, 'Disable').props.disabled, true);
  assert.equal(find(ownRow, 'button', node => node.props['aria-label'] === 'Remove admin access for Current Admin').props.disabled, true);
  assert.equal(find(tree, 'select', node => node.props['aria-label'] === 'Role for Other Admin').props.disabled, false);
}

async function studentSave() {
  const h = hookHarness(); let saves = 0, fail = true;
  const validation = load('mobile/src/lib/student-validation.ts', h).exports;
  const option = { id: 's', course: 'BSCS', year_level: '4th Year', campus: 'Campus', section: 'A' };
  const mod = load('admin/src/AdminModals.tsx', h, {
    '../../mobile/src/lib/student-validation': validation,
    './supabase': { supabase: { rpc: () => ({ abortSignal: async () => ({ data: [option], error: null }) }) } },
  });
  const user = { id: 'ana', name: 'Ana Student', studentNumber: '202311197', email: 'ana@example.test', course: 'BSCS', yearLevel: '4th Year', campus: 'Campus', section: 'A', goal: 'Learn', status: 'Active' };
  h.mount(() => mod.exports.StudentModal({ user, onClose() {}, onSave: async () => { saves++; if (fail) throw new Error('Save unavailable'); } }));
  await flush();
  find(h.value, 'input', node => node.props.value === 'Ana Student').props.onChange({ target: { value: 'Updated Name' } }); await flush();
  const submit = find(h.value, 'form').props.onSubmit;
  await Promise.all([submit(event({})), submit(event({}))]); await flush();
  assert.equal(saves, 1, 'Duplicate student saves must be rejected while pending');
  assert.equal(find(h.value, 'input', node => node.props.value === 'Updated Name').props.value, 'Updated Name');
  assert(text(h.value).includes('Save unavailable'));
  fail = false; await find(h.value, 'form').props.onSubmit(event({})); await flush();
  assert.equal(saves, 2); assert(!text(h.value).includes('Save unavailable'));
  h.unmount();
}

async function capabilities() {
  const h = hookHarness();
  const tables = load('admin/src/AdminTables.tsx', h).exports;
  const features = load('admin/src/admin-features.ts', h).exports;
  const mod = load('admin/src/OsasPermissions.tsx', h, { './AdminTables': tables, './admin-features': features });
  const admins = [
    { id: 'ordinary', displayName: 'Ordinary', email: 'ordinary@example.test', role: 'admin', isActive: true },
    { id: 'super', displayName: 'Super', email: 'super@example.test', role: 'super_admin', isActive: true },
    { id: 'inactive', displayName: 'Inactive', email: 'inactive@example.test', role: 'admin', isActive: false },
  ];
  h.mount(() => mod.exports.OsasPermissions({ admins }));
  assert.equal(nodes(h.value).filter(node => node.type === 'input' || node.type === 'button').length, 0);
  assert.equal(nodes(h.value).some(node => node.type === 'th' && text(node) === 'Support cases'), features.ADMIN_SUPPORT_REQUESTS_ENABLED);
  const rows = nodes(find(h.value, 'tbody')).filter(node => node.type === 'tr');
  assert.equal(rows.length, 3);
  assert(text(rows[0]).includes('Included'));
  assert(text(rows[1]).includes('Included'));
  assert(text(rows[2]).includes('Unavailable'));
  assert(!text(rows[2]).includes('Included'));
  h.unmount();
}

async function semesters() {
  const h = hookHarness(), writes = [], reads = [];
  const section = { id: 'section-a', course: 'BSCS', yearLevel: '4th Year', campus: 'Campus', section: 'A', isActive: true, studentCount: 1 };
  let semesters = [{ id: 'a', academicYear: '2025-2026', term: 'First', status: 'active' }, { id: 'b', academicYear: '2026-2027', term: 'First', status: 'draft' }];
  let bSections = [];
  const mod = load('admin/src/SemesterManagement.tsx', h, {
    './semester-data': {
      listSemesters: async () => semesters,
      listSemesterSections: id => { const pending = deferred(); reads.push({ id, pending }); return pending.promise; },
      createSemesterSection: async (id, draft) => { writes.push({ kind: 'create', id, draft }); bSections = [{ ...section, ...draft, id: 'section-b' }]; },
      updateSemesterSection: async row => writes.push({ kind: 'update', row }),
      activateSemester: async id => { writes.push({ kind: 'activate', id }); semesters = semesters.map(row => ({ ...row, status: row.id === id ? 'active' : 'archived' })); },
    },
  });
  h.mount(mod.exports.SemesterManagement); await flush();
  reads.find(row => row.id === 'a').pending.resolve([section]); await flush();
  button(h.value, 'Edit').props.onClick(); await flush();
  assert.equal(find(h.value, 'input', node => node.props.name === 'section').props.value, 'A');
  assert.equal(find(h.value, 'input', node => node.props.name === 'section').props.readOnly, true);
  assert.equal(find(h.value, 'input', node => node.props.name === 'campus').props.value, 'Campus');
  assert.equal(find(h.value, 'input', node => node.props.name === 'campus').props.readOnly, true);
  find(h.value, 'button', node => node.props.className?.includes('semester-card') && text(node).includes('2026-2027')).props.onClick(); await flush();
  reads.find(row => row.id === 'b').pending.resolve([]); await flush();
  assert.equal(button(h.value, 'Activate').props.disabled, true);
  assert(!text(h.value).includes('Save section'), 'Old section edit must reset after semester selection');
  const campus = find(h.value, 'input', node => node.props.name === 'campus');
  assert.equal(campus.props.value, 'Cavite State University Bacoor City Campus'); assert.equal(campus.props.readOnly, true);
  const year = find(h.value, 'select', node => node.props.name === 'academicYear');
  assert(nodes(year).filter(node => node.type === 'option').every(node => /^[0-9]{4}-[0-9]{4}$/.test(text(node))));
  const number = () => find(h.value, 'input', node => node.props.name === 'section');
  assert.equal(number().props.type, 'number'); assert.equal(number().props.min, 1); assert.equal(number().props.step, 1);
  for (const invalid of ['0', '-1', '1.5', '1e2', 'A']) {
    number().props.onChange({ target: { value: invalid } }); await flush();
    find(h.value, 'form', node => node.props.className === 'section-form').props.onSubmit(event({})); await flush();
    assert.equal(writes.length, 0, 'Invalid section number must not write');
  }
  number().props.onChange({ target: { value: '2' } }); await flush();
  const save = find(h.value, 'form', node => node.props.className === 'section-form').props.onSubmit(event({})); await flush();
  reads.at(-1).pending.resolve(bSections); await flush(); await save;
  assert.equal(writes[0].kind, 'create'); assert.equal(writes[0].id, 'b'); assert.equal(writes[0].draft.section, '2');
  assert.equal(writes[0].draft.campus, 'Cavite State University Bacoor City Campus');
  assert.equal(button(h.value, 'Activate').props.disabled, false);
  button(h.value, 'Activate').props.onClick(); await flush(); reads.at(-1).pending.resolve(bSections); await flush();
  assert.equal(writes[1].kind, 'activate'); assert.equal(writes[1].id, 'b');
  assert(text(h.value).includes('Active registration semester: 2026-2027'));
  h.unmount();
}

async function questDeadlines() {
  const timeHarness = hookHarness();
  const time = load('mobile/src/lib/quest-time.ts', timeHarness).exports;
  const modal = (initialQuest, onSave) => {
    const h = hookHarness();
    const mod = load('admin/src/AdminModals.tsx', h, {
      '../../mobile/src/lib/student-validation': {},
      '../../mobile/src/lib/quest-time': time,
      './supabase': { supabase: {} },
      './admin-data': { searchActiveStudents: async () => [] },
      './AdminShell': { initials: () => '' },
      './AdminTables': { Status: 'Status', questStatusLabel: value => value },
      './WorkspaceDialog': { WorkspaceDialog: ({ children }) => jsx('section', {}, children) },
    });
    h.mount(() => mod.exports.QuestModal({ initialQuest, onClose() {}, onSave }));
    return h;
  };
  const deadlineInput = (offsetMs) => time.formatLocalDateTime(new Date(Date.now() + offsetMs).toISOString()).replace(' ', 'T');
  const values = deadline_at => ({
    title: 'Review notes', description: '', category: 'Habits', difficulty: 'Easy',
    deadline_at, status: 'active',
  });
  const saved = [];
  const createHarness = modal(null, async draft => saved.push(draft));
  const form = () => find(createHarness.value, 'form', node => node.props.className === 'workspace-dialog-form');
  const future = deadlineInput(60 * 60 * 1000);
  await form().props.onSubmit(event(values(future)));
  assert.equal(saved[0].deadlineAt, time.parseLocalDateTime(future));
  await form().props.onSubmit(event(values('')));
  assert.equal(saved[1].deadlineAt, null, 'Deadline remains optional');
  createHarness.unmount();

  const originalDeadline = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const existing = {
    id: 'quest-a', ownerId: 'student-a', title: 'Review notes', description: '',
    category: 'Habits', xp: 20, difficulty: 'Easy', deadlineAt: originalDeadline,
    completions: '0', status: 'active', assignee: 'Student A',
  };
  const edited = [];
  const editHarness = modal(existing, async draft => edited.push(draft));
  await find(editHarness.value, 'form', node => node.props.className === 'workspace-dialog-form')
    .props.onSubmit(event(values(time.formatLocalDateTime(originalDeadline).replace(' ', 'T'))));
  assert.equal(edited[0].deadlineAt, originalDeadline, 'Unchanged overdue deadline keeps its exact stored value');
  editHarness.unmount();

  const rejected = [];
  const futureQuest = { ...existing, deadlineAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() };
  const invalidHarness = modal(futureQuest, async draft => rejected.push(draft));
  await find(invalidHarness.value, 'form', node => node.props.className === 'workspace-dialog-form')
    .props.onSubmit(event(values(deadlineInput(-60 * 60 * 1000))));
  assert.equal(rejected.length, 0, 'Changed deadline in the past is rejected');
  assert(nodes(invalidHarness.value).some(node => node.props?.role === 'alert' && text(node).includes('Deadline cannot be in the past')));
  invalidHarness.unmount();

  const unavailableHarness = modal({ ...existing, deadlineAt: null, deadlineSupported: false }, async () => {});
  const deadlineField = find(unavailableHarness.value, 'input', node => node.props.name === 'deadline_at');
  assert.equal(deadlineField.props.disabled, true, 'Do not imply deadlines are editable when the database RPC is missing');
  assert(text(find(unavailableHarness.value, 'small')).includes('database update'));
  unavailableHarness.unmount();
  timeHarness.unmount();
}

async function questListCompatibility() {
  const calls = [];
  const mod = load('admin/src/admin-data.ts', hookHarness(), {
    './supabase': { supabase: { rpc: async name => {
      calls.push(name);
      if (name === 'admin_list_quests_page_with_deadline') return { data: null, error: { code: 'PGRST202', message: 'Function not found' } };
      return { data: [{
        id: 'quest-a', owner_id: 'student-a', title: 'Review notes', description: '',
        category: 'Habits', xp: 20, status: 'active', completions: 0,
        assignee: 'Student A', total_count: 1,
      }], error: null };
    } } },
  });
  const result = await mod.exports.listQuests({ page: 0, pageSize: 5, search: '', status: 'All', difficulty: 'All' });
  assert.deepEqual(calls, ['admin_list_quests_page_with_deadline', 'admin_list_quests_page']);
  assert.equal(result.rows.length, 1, 'Legacy list RPC keeps the quest table and recent assignments available');
  assert.equal(result.rows[0].deadlineAt, null);
  assert.equal(result.rows[0].deadlineSupported, false);
}

async function main() {
  await test('reports reject stale results, audit matching filters and cancel changed exports', reports);
  await test('student search, filters and pagination preserve query and retry behavior', tables);
  await test('self role, status and removal controls are locked while other roles are editable', roleControls);
  await test('student drafts survive failed saves and duplicate submissions are blocked', studentSave);
  await test('OSAS access is included for active admins without capability controls', capabilities);
  await test('semester switch resets section edits and activation uses explicit sections', semesters);
  await test('admin quest deadlines use mobile time rules and preserve unchanged overdue assignments', questDeadlines);
  await test('quest lists fall back safely when the optional deadline RPC is not deployed', questListCompatibility);
  console.log(count + ' admin flow regressions passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
