const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');
const file = path.resolve(__dirname, '../src/lib/student-workspace.ts');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: exportsObject, AbortController, Date, console });
const { createStudentWorkspaceReader } = exportsObject;
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const ok = data => ({ data, error: null });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); };
const input = (id = 'a', isCurrent = () => true) => ({ user: { id, email: id + '@example.test' }, student: { id, name: 'Student', student_number: '2026-1', status: 'Active' }, isCurrent });
function adapter() {
  const state = { calls: [], handler: null };
  const query = (name, args) => {
    const call = { name, args }; state.calls.push(call);
    const run = async () => {
      const result = state.handler?.(call); if (result !== undefined) return result;
      return ok(name === 'profiles' ? { display_name: 'Profile', level: 2, total_xp: 120, current_streak: 3 } : name === 'student_get_current_streak' ? 4 : []);
    };
    const q = { select: () => q, eq: (_, id) => { call.owner = id; return q; },
      abortSignal: signal => { call.signal = signal; return q; }, maybeSingle: run, then: (resolve, reject) => run().then(resolve, reject) };
    return q;
  };
  return { state, reader: createStudentWorkspaceReader({ from: table => query(table), rpc: query }) };
}
test('all independent reads start together and map Student/legacy profile fallbacks', async () => {
  const { state, reader } = adapter(); const wait = deferred(); state.handler = () => wait.promise;
  const task = reader.read(input()); await flush(); assert.equal(state.calls.length, 5);
  assert(state.calls.every(call => call.signal instanceof AbortSignal)); wait.resolve(ok(null));
  const result = await task; const profile = result.updateProfile(null);
  assert.equal(profile.id, 'a'); assert.equal(profile.name, 'Student'); assert.equal(profile.student_number, '2026-1');
  assert.equal(profile.course, 'Undeclared'); assert.equal(profile.current_streak, 0);
  assert.equal(Object.keys(result.errors).length, 0); assert.equal(result.quests.length, 0);
  assert.equal(result.history.rows.length, 0); assert.equal(result.history.hasMore, false);
  assert(!state.calls.some(call => call.name === 'students' || call.name === 'student_get_registration_state'));
});
test('returned and thrown profile errors preserve prior XP while unrelated slices succeed', async () => {
  for (const throws of [true, false]) {
    const { state, reader } = adapter(); state.handler = call => {
      if (call.name !== 'profiles') return undefined;
      if (throws) throw Error('offline'); return { data: null, error: { code: 'network_error' } };
    };
    const result = await reader.read(input()); const profile = result.updateProfile({ total_xp: 900, level: 10, current_streak: 2 });
    assert(result.errors.profile); assert.equal(profile.total_xp, 900); assert.equal(profile.level, 10); assert.equal(profile.current_streak, 4);
    assert.equal(result.quests.length, 0); assert.equal(result.history.rows.length, 0);
  }
});
test('a successful summary overrides stale profile XP/streak and retains category/history contracts', async () => {
  const { state, reader } = adapter(); state.handler = call => call.name === 'student_progress_summary'
    ? ok([{ total_completed: '8', academics_completed: '2', habits_completed: '3', social_completed: '1', health_completed: '2', total_xp: '800', level: '9', current_streak: '6' }])
    : call.name === 'student_list_completion_history' ? ok([{ id: 'history', total_count: 201 }]) : undefined;
  const result = await reader.read(input()); const profile = result.updateProfile(null);
  assert.equal(profile.total_xp, 800); assert.equal(profile.current_streak, 6); assert.equal(profile.level, 9);
  assert.equal(result.history.hasMore, true); assert.equal(result.progressSummary.byCategory.Academics, 2);
  assert.equal(result.progressSummary.totalCompleted, 8);
});
test('failed history does not discard a successful summary, and failed summary does not discard history', async () => {
  for (const failed of ['student_list_completion_history', 'student_progress_summary']) {
    const { state, reader } = adapter(); state.handler = call => call.name === failed ? Promise.reject(Error('offline'))
      : call.name === 'student_list_completion_history' ? ok([{ total_count: 1 }])
      : call.name === 'student_progress_summary' ? ok([{ total_completed: 1, academics_completed: 1, habits_completed: 0, social_completed: 0, health_completed: 0, total_xp: 100, level: 2, current_streak: 1 }]) : undefined;
    const result = await reader.read(input()); assert(result.errors.progress);
    assert.equal(!!result.history, failed !== 'student_list_completion_history');
    assert.equal(!!result.progressSummary, failed !== 'student_progress_summary');
  }
});
test('candidate pagination is atomic and keeps every page including completed quests', async () => {
  const { state, reader } = adapter(); const page = Array.from({ length: 200 }, (_, i) => ({ id: String(i), status: 'completed' }));
  state.handler = call => call.name === 'student_list_recommendation_candidates' ? ok(call.args.page_offset === 0 ? page : [{ id: 'last' }]) : undefined;
  const result = await reader.read(input(), 'quests'); assert.equal(result.quests.length, 201);
  assert.deepEqual(state.calls.map(call => call.args.page_offset), [0, 200]);
  state.handler = call => { if (call.args.page_offset === 200) throw Error('page failed'); return ok(page); };
  const failed = await reader.read(input(), 'quests'); assert(failed.errors.quests); assert.equal(failed.quests, undefined);
});
test('overlapping full and scoped reads coalesce at each slice', async () => {
  const { state, reader } = adapter(); const wait = deferred(); state.handler = () => wait.promise;
  const first = reader.read(input()), second = reader.read(input(), 'quests'), third = reader.read(input());
  await flush(); assert.equal(state.calls.length, 5); wait.resolve(ok(null));
  const results = await Promise.all([first, second, third]); assert(results.every(result => result !== null));
});
test('a scoped retry reads only that slice and preserves unrelated profile fields', async () => {
  const { state, reader } = adapter(); const previous = { name: 'Kept', total_xp: 500, current_streak: 1 };
  const result = await reader.read(input(), 'streak'); assert.equal(state.calls.length, 1); assert.equal(state.calls[0].name, 'student_get_current_streak');
  const profile = result.updateProfile(previous); assert.equal(profile.name, 'Kept'); assert.equal(profile.total_xp, 500); assert.equal(profile.current_streak, 4);
  assert.equal(result.quests, undefined); assert.equal(result.history, undefined);
});
test('cancel invalidates a late result even when the transport ignores abort', async () => {
  const { state, reader } = adapter(); const wait = deferred(); state.handler = () => wait.promise;
  const task = reader.read(input()); await flush(); reader.cancel();
  assert(state.calls.every(call => call.signal.aborted)); wait.resolve(ok([])); assert.equal(await task, null);
});
test('account switch cancels old queries without overwriting the replacement account', async () => {
  const { state, reader } = adapter(); const wait = deferred(); state.handler = () => wait.promise;
  const old = reader.read(input('a')); await flush(); state.handler = null;
  const next = await reader.read(input('b')); assert.equal(next.updateProfile(null).id, 'b');
  assert(state.calls.slice(0, 5).every(call => call.signal.aborted)); wait.resolve(ok([])); assert.equal(await old, null);
});
test('an invalid admission fence prevents reads and stops additional candidate pages', async () => {
  const { state, reader } = adapter(); let current = false;
  assert.equal(await reader.read(input('a', () => current)), null); assert.equal(state.calls.length, 0);
  current = true; state.handler = () => { current = false; return ok(Array.from({ length: 200 }, () => ({ id: 'old' }))); };
  assert.equal(await reader.read(input('a', () => current), 'quests'), null); assert.equal(state.calls.length, 1);
});
(async () => { for (const { name, fn } of tests) { await fn(); console.log('PASS ' + name); } console.log(tests.length + ' Student workspace interface tests passed.'); })().catch(error => { console.error(error); process.exitCode = 1; });
