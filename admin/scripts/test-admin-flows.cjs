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
  if (typeof tree.type === 'function' && ['SearchField', 'PageSize', 'Pagination', 'Filter', 'Status'].includes(tree.type.name)) return nodes(tree.type(tree.props));
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
  const h = hookHarness(), requests = [], audits = [], downloads = [];
  let auditWait = null, auditError = null;
  const mod = load('admin/src/OsasDashboard.tsx', h, {
    './osas-data': {
      getDashboardFilterOptions: async () => [],
      getDashboardAnalytics: filters => { const pending = deferred(); requests.push({ filters, pending }); return pending.promise; },
      logDashboardExport: async filters => { audits.push(filters); if (auditWait) await auditWait.promise; if (auditError) throw auditError; },
    },
    './osas-report': { downloadOsasReportCsv: (data, filters) => downloads.push({ data, filters }) },
  });
  const permissions = { can_view_aggregates: true, can_manage_support_requests: false };
  h.mount(() => mod.exports.OsasDashboard({ permissions, onOpenSupport() {} }));
  const result = id => ({ id, suppressed: false, participation: {}, activity_trends: [], category_participation: [] });
  const applyDate = async date => {
    find(h.value, 'input', node => node.props.type === 'date').props.onChange({ target: { value: date } });
    await flush(); button(h.value, 'Apply filters').props.onClick(); await flush();
  };
  await flush();
  await applyDate('2026-01-01');
  requests[1].pending.resolve(result('current')); await flush();
  requests[0].pending.resolve(result('stale')); await flush();
  const displayed = nodes(h.value).find(node => typeof node.type === 'function' && node.props.data);
  assert.equal(displayed.props.data.id, 'current');
  button(h.value, 'Export displayed data as CSV').props.onClick(); await flush();
  assert.equal(downloads[0].data.id, 'current');
  assert.equal(downloads[0].filters.startDate, '2026-01-01');
  assert.equal(audits[0], downloads[0].filters);

  auditError = new Error('Audit rejected');
  button(h.value, 'Export displayed data as CSV').props.onClick(); await flush();
  assert.equal(downloads.length, 1, 'Failed audit must prevent download');
  auditError = null; auditWait = deferred();
  button(h.value, 'Export displayed data as CSV').props.onClick(); await flush();
  await applyDate('2026-02-01');
  auditWait.resolve(); await flush();
  assert.equal(downloads.length, 1, 'Changed report must cancel the pending download');
  requests[2].pending.resolve({ ...result('withheld'), suppressed: true, minimum_cohort: 5 }); await flush();
  assert.equal(button(h.value, 'Export displayed data as CSV').props.disabled, true);
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
  const h = hookHarness(), writes = []; let refreshed = 0;
  const pending = deferred(); let rows = [];
  const mod = load('admin/src/OsasPermissions.tsx', h, {
    './osas-data': {
      listOsasPermissionRows: async () => rows,
      setOsasPermissions: async (...args) => { writes.push(args); await pending.promise; rows = [{ user_id: 'self', can_view_aggregates: args[1], can_manage_support_requests: args[2], is_active: true }]; },
    },
  });
  h.mount(() => mod.exports.OsasPermissions({ admins: [{ id: 'self', displayName: 'Admin', email: 'admin@example.test', isActive: true }], onChanged: async () => { refreshed++; } }));
  await flush();
  const toggles = nodes(h.value).filter(node => node.type === 'input');
  toggles[0].props.onChange({ target: { checked: true } });
  toggles[1].props.onChange({ target: { checked: true } });
  await flush(); assert.equal(writes.length, 1, 'Capability changes must serialize whole-row writes');
  pending.resolve(); await flush();
  assert.equal(refreshed, 1, 'Successful capability changes must refresh current effective access');
  assert.equal(nodes(h.value).filter(node => node.type === 'input')[0].props.checked, true);
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

async function enrollment() {
  const h = hookHarness(), requests = [];
  let context = 'sign-in', appState;
  const mod = load('mobile/src/hooks/use-enrollment-options.ts', h, {
    'react-native': { AppState: { currentState: 'active', addEventListener: (_event, fn) => { appState = fn; return { remove() {} }; } } },
    '@/supabase': { supabase: { rpc: () => ({ abortSignal: signal => { const pending = deferred(); requests.push({ signal, pending }); return pending.promise; } }) } },
  });
  h.mount(() => mod.exports.useEnrollmentOptions(context));
  requests[0].pending.resolve({ data: [], error: null }); await flush();
  context = 'sign-up'; h.render();
  assert.equal(h.value.loading, true);
  const fresh = [{ id: 'b', course: 'BSCS', year_level: '4th Year', campus: 'Campus', section: 'B' }];
  requests[1].pending.resolve({ data: fresh, error: null }); await flush();
  assert.equal(h.value.options[0].section, 'B');
  h.value.retry(); await flush();
  assert.equal(requests[1].signal.aborted, true);
  requests[2].pending.resolve({ data: null, error: new Error('Offline') }); await flush();
  assert(h.value.error); assert.equal(h.value.options.length, 0);
  appState('background'); appState('active'); await flush();
  requests[3].pending.resolve({ data: fresh, error: null }); await flush();
  assert.equal(h.value.options[0].id, 'b'); assert.equal(h.value.error, null);
  h.value.retry(); await flush(); h.unmount();
  assert.equal(requests[4].signal.aborted, true);
}

async function main() {
  await test('reports reject stale results, audit matching filters and cancel changed exports', reports);
  await test('student search, filters and pagination preserve query and retry behavior', tables);
  await test('self role, status and removal controls are locked while other roles are editable', roleControls);
  await test('student drafts survive failed saves and duplicate submissions are blocked', studentSave);
  await test('capability changes serialize writes and refresh effective access', capabilities);
  await test('semester switch resets section edits and activation uses explicit sections', semesters);
  await test('registration reloads on form entry, retry and foreground with cancellation', enrollment);
  console.log(count + ' admin/enrollment flow regressions passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
