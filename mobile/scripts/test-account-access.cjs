const assert = require('node:assert/strict');
const { hooks, load } = require('./test-harness.cjs');
const access = load('src/lib/account-access.ts');
const validation = load('src/lib/student-validation.ts');
const authFlow = load('src/lib/auth-flow.ts', { './student-validation': validation });
const pause = () => new Promise(resolve => setTimeout(resolve, 5));
async function flush() { for (let i = 0; i < 4; i++) await pause(); }
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
const user = id => ({ id, email: `${id}@example.test`, user_metadata: {} });
const quest = { id: 'q1', owner_id: 'a', title: 'Example', status: 'active', category: 'Habits', xp: 20 };
const ok = data => ({ data, error: null });
const registrationOption = { id: '03400000-0000-4000-8000-000000000101', semester_id: '03400000-0000-4000-8000-000000000102', academic_year: '2026-2027', term: '1st Semester', course: 'BSCS', year_level: '4th Year', campus: 'Bacoor', section: '1' };
const registrationDraft = { version: 1, semesterId: registrationOption.semester_id, enrollmentOptionId: registrationOption.id,
  student: { name: 'Maria Cruz', student_number: '202311197', goal: 'Build habits', course: 'BSCS', year_level: '4th Year', campus: 'Bacoor', section: '1' } };
const studentIdentity = { name: '', student_number: '202311197' };
const identityDraft = { version: 2, student: studentIdentity };
const { course, year_level, campus, section } = registrationOption;
const expectedLabels = { course, year_level, campus, section };
const savedDraft = authFlow.readRegistrationDraft(registrationDraft);
const enrolledRegistration = { ...savedDraft, enrollment: { ...savedDraft.enrollment, labels: expectedLabels } };
const assignment = { semester_id: registrationOption.semester_id, enrollment_option_id: registrationOption.id };
const pendingStudent = (id, draft = registrationDraft) => ({ ...user(id), user_metadata: { signup_intent: 'student_registration', registration_draft: draft } });

function provider(initialUser = user('a'), initialState = {}, notificationLifecycle) {
  const h = hooks();
  let authCallback;
  const appCallbacks = new Set();
  const state = { session: initialUser ? { user: initialUser } : null, status: 'Active', queries: [], signouts: [], cancellations: 0, authCalls: 0, ...initialState };
  const emit = (next, event = next ? 'SIGNED_IN' : 'SIGNED_OUT') => {
    state.session = next ? { user: next } : null;
    authCallback(event, state.session);
  };
  const supabase = {
    functions: {
      invoke: async (name, { body }) => {
        assert.equal(name, 'student-auth');
        state.authCalls++; state.authInput = body;
        if (state.loginWait) await state.loginWait.promise;
        if (state.authError) return { error: {}, response: { status: state.authStatus, json: async () => ({ code: state.authError }) } };
        return ok({ access_token: 'student-access', refresh_token: 'student-refresh' });
      },
    },
    auth: {
      startAutoRefresh: () => { state.refreshStarts = (state.refreshStarts || 0) + 1; }, stopAutoRefresh: () => { state.refreshStops = (state.refreshStops || 0) + 1; },
      updateUser: async input => {
        state.updated = input;
        if (state.updateWait) await state.updateWait.promise;
        if (!state.updateError && input.data && state.session) emit({ ...state.session.user, user_metadata: { ...state.session.user.user_metadata, ...input.data } }, 'USER_UPDATED');
        return { error: state.updateError || null };
      },
      exchangeCodeForSession: async code => { state.exchange = code; emit(state.callbackUser || user('a')); return { error: state.exchangeError || null }; },
      setSession: async tokens => { state.tokens = tokens; emit(user('a')); return { error: null }; },
      getSession: async () => { if (state.sessionError) throw new Error('Storage unavailable'); return { data: { session: state.session }, error: null }; },
      onAuthStateChange: fn => { authCallback = fn; return { data: { subscription: { unsubscribe() {} } } }; },
      signOut: async options => {
        state.signouts.push(options.scope);
        if (state.signoutWait) await state.signoutWait.promise;
        if (state.signoutThrows) throw new Error('Storage removal failed');
        if (state.signoutError) return { error: new Error('Offline') };
        emit(null);
        return { error: null };
      },
    },
    from(table) {
      let action = 'select', payload;
      const query = {};
      for (const name of ['select', 'eq', 'neq', 'order', 'abortSignal']) query[name] = () => query;
      for (const name of ['update', 'insert', 'delete']) query[name] = data => { action = name; payload = data; return query; };
      const run = async () => {
        state.queries.push(`${table}:${action}`);
        if (state.query) { const result = state.query(table, action, payload); if (result !== undefined) return result; }
        if (table === 'students') {
          if (state.studentError) throw new Error('Network failed');
          return ok(state.missing ? null : {
            id: state.session?.user.id, name: 'Student', student_number: studentIdentity.student_number, status: state.status,
            ...(state.unassigned ? {} : assignment),
          });
        }
        if (table === 'profiles') return ok({ display_name: 'Student', total_xp: 0 });
        return ok(null);
      };
      query.maybeSingle = query.single = run;
      query.then = (resolve, reject) => run().then(resolve, reject);
      return query;
    },
    rpc: (name, args) => {
      const task = (async () => {
      state.rpcCalls ??= []; state.rpcCalls.push({ name, args });
      if (state.rpc) { const result = state.rpc(name, args); if (result !== undefined) return result; }
      if (name === 'complete_quest_v2') return ok({ status: 'completed', title: 'Quest', awarded_xp: 25, total_xp: 25 });
      return ok(name === 'student_list_recommendation_candidates' ? [quest] : name === 'student_get_current_streak' ? 0 : name === 'student_get_registration_state' ? (state.registrationState || (state.missing ? 'unavailable' : 'active')) : []);
    })(); task.abortSignal = () => task; return task; },
    storage: { from: () => ({
      upload: async (path, bytes, options) => { state.uploads ??= []; state.uploads.push({ path, bytes, options }); return state.upload ? state.upload() : ok(null); },
      remove: async paths => { state.removals ??= []; state.removals.push(paths); return ok(null); },
    }) },
  };
  const notifications = {
    start: (ownerId, isCurrent) => {
      state.notificationLifetimes ??= []; state.notificationLifetimes.push({ ownerId, isCurrent });
      return () => { state.notificationStops = (state.notificationStops || 0) + 1; };
    },
    cleanup: async () => { state.cancellations++; if (state.cancelWait) await state.cancelWait.promise; if (state.cancelError) throw new Error('Native cleanup failed'); },
  };
  const mod = load('src/context/user-data-context.tsx', {
    react: h.react,
    'expo-linking': { createURL: (path, options) => 'beebetter://' + path + (options.queryParams ? '?flow=recovery' : ''), getInitialURL: async () => state.initialUrl || null, addEventListener: (_, fn) => { state.link = fn; return { remove() {} }; } },
    '@/lib/auth-flow': authFlow, '@/lib/student-validation': validation,
    '@/lib/progression': load('src/lib/progression.ts'),
    '@/lib/recommendation-facts': load('src/lib/recommendation-facts.ts'),
    '@/lib/student-workspace': load('src/lib/student-workspace.ts', {}),
    '@/lib/quest-completion': load('src/lib/quest-completion.ts'),
    '@/lib/quest-completion-adapter': load('src/lib/quest-completion-adapter.ts', { './quest-completion': load('src/lib/quest-completion.ts') }, { fetch: async uri => ({ arrayBuffer: async () => state.readProof ? state.readProof(uri) : new ArrayBuffer(2) }) }),
    'react-native': { Platform: { OS: 'android' }, AppState: { currentState: 'active', addEventListener: (_, fn) => { appCallbacks.add(fn); return { remove() { appCallbacks.delete(fn); } }; } } },
    '@/supabase': { supabase, authRecoveryStorage: { get: async () => state.recoveryMarker, set: async () => { state.recoveryMarker = true; }, clear: async () => { state.recoveryMarker = false; } } }, '@/lib/account-access': access,
    // No concrete notification mock: importing it from core fails this harness.
  }, { console: { warn: (...args) => { state.warnings ??= []; state.warnings.push(args); } },
    setInterval: (fn, delay) => { if (delay === 60_000) state.poll = fn; return 0; } });
  h.mount(() => mod.UserDataProvider({ children: null, notificationLifecycle: notificationLifecycle ?? notifications }));
  return { h, state, emit, resume: () => [...appCallbacks].forEach(fn => fn('active')), background: () => [...appCallbacks].forEach(fn => fn('background')), close: () => h.unmount() };
}

const cases = [];
const test = (name, fn) => cases.push({ name, fn });
test('active student is admitted only after student verification', async () => {
  const p = provider();
  assert.equal(p.h.value.access, 'checking');
  await flush();
  assert.equal(p.h.value.access, 'active');
  assert.equal(p.state.queries[0], 'students:select');
  assert.equal(p.h.value.user.id, 'a');
  p.close();
});
for (const mode of ['Inactive', 'missing', 'unknown']) test(`${mode} restored account cannot enter protected state`, async () => {
  const p = provider();
  p.state.status = mode === 'missing' ? 'Active' : mode;
  p.state.missing = mode === 'missing';
  await flush();
  assert.equal(p.h.value.access, 'blocked');
  assert.equal(p.h.value.user, null);
  assert.deepEqual(p.state.signouts, ['local']);
  assert(!p.state.queries.includes('profiles:select'));
  if (mode === 'Inactive') assert.equal(p.h.value.accessMessage, access.SUSPENDED_MESSAGE);
  p.close();
});
test('student ID login still respects provider admission', async () => {
  const p = provider(null); await flush();
  p.state.status = 'Inactive';
  const denied = await p.h.value.signIn(studentIdentity.student_number, 'password'); await flush();
  assert.equal(denied.status, 'session_created');
  assert.equal(p.h.value.access, 'blocked');
  p.state.status = 'Active';
  const admitted = await p.h.value.signIn(studentIdentity.student_number, 'password'); await flush();
  assert.equal(admitted.status, 'session_created');
  assert.equal(p.h.value.access, 'active');
  p.state.authError = 'invalid_credentials';
  const failed = await p.h.value.signIn(studentIdentity.student_number, 'wrong');
  assert.equal(failed.status, 'error');
  assert.equal(failed.code, 'invalid_credentials');
  p.close();
});
test('verification failure closes access and retry recovers', async () => {
  const p = provider(); p.state.studentError = true; await flush();
  assert.equal(p.h.value.access, 'verification_error');
  assert.equal(p.h.value.user, null);
  assert.equal(p.state.signouts.length, 0);
  p.state.studentError = false; await p.h.value.refresh(); await flush();
  assert.equal(p.h.value.access, 'active');
  assert.equal(p.h.value.isRefreshing, false);
  p.close();
});
test('session storage read failure is recoverable', async () => {
  const p = provider(null); await flush();
  p.state.sessionError = true;
  await p.h.value.refresh(); await flush();
  assert.equal(p.h.value.access, 'verification_error');
  p.state.sessionError = false;
  await p.h.value.signOut(); await flush();
  assert.equal(p.h.value.access, 'signed_out');
  p.close();
});
test('suspension while open is detected on resume', async () => {
  const p = provider(); await flush();
  p.state.status = 'Inactive'; p.resume(); await flush();
  assert.equal(p.h.value.access, 'blocked');
  assert.equal(p.h.value.quests.length, 0);
  assert.equal(p.h.value.isLoading, false);
  p.close();
});
test('duplicate logout shares cleanup and blocks late refresh events', async () => {
  const p = provider(); await flush();
  p.state.signoutWait = deferred();
  const first = p.h.value.signOut(); const second = p.h.value.signOut();
  assert.equal(first, second);
  await flush();
  assert.equal(p.h.value.user, null);
  p.emit(user('a'), 'TOKEN_REFRESHED'); await flush();
  assert.equal(p.h.value.access, 'signed_out');
  assert.equal((await p.h.value.signIn(studentIdentity.student_number, 'password')).status, 'error');
  p.state.signoutWait.resolve(); assert.equal((await first).status, 'signed_out'); await flush();
  assert.deepEqual(p.state.signouts, ['global']);
  assert.equal(p.h.value.isSigningOut, false);
  p.close();
});
for (const failure of ['signoutError', 'signoutThrows']) test(`${failure} is contained and sign-out can be retried`, async () => {
  const p = provider(); await flush(); p.state[failure] = true;
  const result = await p.h.value.signOut(); await flush();
  assert.equal(result.status, 'retry_required');
  assert.equal(p.h.value.access, 'blocked');
  assert.equal(p.h.value.user, null);
  assert.equal(p.h.value.isSigningOut, false);
  assert.equal((await p.h.value.signIn(studentIdentity.student_number, 'password')).status, 'error');
  p.state[failure] = false; await p.h.value.signOut(); await flush();
  assert.equal(p.h.value.access, 'signed_out');
  assert.equal((await p.h.value.signIn(studentIdentity.student_number, 'password')).status, 'session_created');
  p.close();
});
test('successful logout clears access and allows a later login', async () => {
  const p = provider(); await flush();
  assert.equal((await p.h.value.signOut()).status, 'signed_out'); await flush();
  assert.equal(p.h.value.access, 'signed_out');
  assert.equal((await p.h.value.signIn(studentIdentity.student_number, 'password')).status, 'session_created'); await flush();
  assert.equal(p.h.value.access, 'active');
  p.close();
});
test('logout with no session is safe and notification cleanup failure is independent', async () => {
  const p = provider(null); await flush(); p.state.cancelError = true;
  await p.h.value.signOut(); await flush();
  assert.equal(p.h.value.access, 'signed_out');
  assert.equal(p.h.value.isSigningOut, false);
  assert(p.state.warnings.some(args => args[0] === 'Push cleanup pending:'));
  p.close();
});
test('authentication works with an explicitly disabled notification integration', async () => {
  const p = provider(null, {}, { start: () => () => {}, cleanup: async () => {} }); await flush();
  assert.equal((await p.h.value.signIn(studentIdentity.student_number, 'password')).status, 'session_created'); await flush();
  assert.equal(p.h.value.access, 'active'); assert.equal(p.h.value.user.id, 'a');
  assert.equal((await p.h.value.signOut()).status, 'signed_out'); await flush();
  assert.equal(p.h.value.access, 'signed_out'); assert.equal(p.state.cancellations, 0); p.close();
});
test('Auth session loss reports notification cleanup failures', async () => {
  const p = provider(); await flush(); p.state.cancelError = true;
  p.emit(null); await flush();
  assert.equal(p.h.value.access, 'signed_out'); assert.equal(p.h.value.user, null);
  assert(p.state.warnings.some(args => args[0] === 'Reminder cleanup failed:')); p.close();
});
test('account switching replaces the admitted notification owner and fences old work', async () => {
  const p = provider(); await flush(); const old = p.state.notificationLifetimes[0];
  p.emit(user('b')); assert.equal(old.isCurrent(), false); await flush();
  assert.equal(p.state.notificationStops, 1);
  assert.deepEqual(p.state.notificationLifetimes.map(item => item.ownerId), ['a', 'b']);
  assert.equal(p.state.notificationLifetimes[1].isCurrent(), true);
  assert.equal(p.h.value.user.id, 'b'); p.close();
});
test('notification lifetime follows admission and stays stable during same-account refresh', async () => {
  const p = provider(); await flush();
  assert.equal(p.state.notificationLifetimes.length, 1);
  const admitted = p.state.notificationLifetimes[0]; assert.equal(admitted.ownerId, 'a'); assert.equal(admitted.isCurrent(), true);
  await p.h.value.refresh(); await flush(); assert.equal(p.state.notificationLifetimes.length, 1);
  p.state.cancelWait = deferred(); const logout = p.h.value.signOut(); await flush();
  assert.equal(admitted.isCurrent(), false); assert.equal(p.state.notificationStops, 1); assert.equal(p.state.signouts.length, 0);
  p.state.cancelWait.resolve(); await logout; assert.equal(p.state.signouts.length, 1); p.close();
});
test('logout during student loading cannot resurrect the account', async () => {
  const wait = deferred(); const p = provider();
  p.state.query = table => table === 'students' ? wait.promise : undefined;
  await flush(); await p.h.value.signOut();
  wait.resolve(ok({ status: 'Active' })); await flush();
  assert.equal(p.h.value.user, null); assert.equal(p.h.value.profile, null);
  assert.equal(p.h.value.isLoading, false); p.close();
});
test('late quest insertion and deletion rollback cannot restore logged-out data', async () => {
  const p = provider(); await flush(); const insert = deferred(), deletion = deferred();
  p.state.query = (table, action) => table === 'quests' ? action === 'insert' ? insert.promise : deletion.promise : undefined;
  const add = p.h.value.addQuest({ title: 'Later', category: 'Habits', xp: 20 });
  const remove = p.h.value.deleteQuest('q1');
  await p.h.value.signOut();
  insert.resolve(ok(quest)); deletion.resolve({ error: new Error('Denied') });
  const [added] = await Promise.all([add, remove]); await flush();
  assert.equal(added.success, false);
  assert.equal(p.h.value.quests.length, 0); p.close();
});
test('newly assigned uncached quest uses an owned lookup and server completion', async () => {
  const p = provider(); await flush(); let completions = 0;
  p.state.query = table => table === 'quests' ? ok({ status: 'active', requires_proof: false }) : undefined;
  p.state.rpc = name => { if (name === 'complete_quest_v2') { completions++; return ok({ status: 'completed', title: 'Quest', awarded_xp: 25, total_xp: 25 }); } };
  assert.equal((await p.h.value.completeQuest('new-quest')).success, true);
  assert.equal(completions, 1); assert.ok(p.state.queries.includes('quests:select')); p.close();
});
test('missing or proof-required uncached quests do not dispatch completion', async () => {
  const p = provider(); await flush(); let completions = 0;
  p.state.rpc = name => { if (name === 'complete_quest_v2') { completions++; return ok({ status: 'completed', title: 'Quest', awarded_xp: 25, total_xp: 25 }); } };
  assert.equal((await p.h.value.completeQuest('foreign-quest')).success, false);
  p.state.query = table => table === 'quests' ? ok({ status: 'active', requires_proof: true }) : undefined;
  assert.match((await p.h.value.completeQuest('proof-quest')).error, /proof/);
  assert.equal(completions, 0); p.close();
});
test('logout during an uncached quest lookup prevents completion', async () => {
  const p = provider(); await flush(); const wait = deferred(); let completions = 0;
  p.state.query = table => table === 'quests' ? wait.promise : undefined;
  p.state.rpc = name => { if (name === 'complete_quest_v2') { completions++; return ok({ status: 'completed', title: 'Quest', awarded_xp: 25, total_xp: 25 }); } };
  const completing = p.h.value.completeQuest('new-quest'); await p.h.value.signOut();
  wait.resolve(ok({ status: 'active', requires_proof: false }));
  assert.equal((await completing).success, false); assert.equal(completions, 0); p.close();
});
test('completion finishing after logout does not trigger another user load', async () => {
  const p = provider(); await flush(); const wait = deferred();
  p.state.rpc = name => name === 'complete_quest_v2' ? wait.promise : undefined;
  const complete = p.h.value.completeQuest('q1'); await p.h.value.signOut();
  const count = p.state.queries.length;
  wait.resolve(ok({ status: 'completed', title: 'Quest', awarded_xp: 25, total_xp: 25 })); await complete; await flush();
  assert.equal(p.state.queries.length, count); assert.equal(p.h.value.user, null); p.close();
});

test('duplicate completion is blocked while pending and a failed quest can retry', async () => {
  const p = provider(); await flush(); const wait = deferred();
  p.state.rpc = name => name === 'complete_quest_v2' ? wait.promise : undefined;
  const first = p.h.value.completeQuest('q1');
  assert.match((await p.h.value.completeQuest('q1')).error, /already being completed/);
  wait.resolve({ error: { message: 'Offline' } }); assert.equal((await first).success, false);
  p.state.rpc = undefined; assert.equal((await p.h.value.completeQuest('q1')).success, true); p.close();
});
test('different quests complete independently and completed targets bypass dispatch', async () => {
  const p = provider(); await flush(); const wait = deferred();
  p.state.query = table => table === 'quests' ? ok({ status: 'active', requires_proof: false }) : undefined;
  let calls = 0; p.state.rpc = name => name === 'complete_quest_v2' ? (++calls === 1 ? wait.promise : ok({ status: 'completed', title: 'Quest', awarded_xp: 25, total_xp: 25 })) : undefined;
  const first = p.h.value.completeQuest('q1'); assert.equal((await p.h.value.completeQuest('other')).success, true);
  wait.resolve(ok({ status: 'completed', title: 'Quest', awarded_xp: 25, total_xp: 25 })); assert.equal((await first).success, true);
  p.state.query = table => table === 'quests' ? ok({ status: 'completed', requires_proof: true }) : undefined;
  assert.equal((await p.h.value.completeQuest('done')).success, true); assert.equal(calls, 2); p.close();
});
test('proof success uploads once and force-refreshes authoritative workspace slices', async () => {
  const p = provider(); await flush(); const count = p.state.rpcCalls.length;
  assert.equal((await p.h.value.completeQuest('q1', { uri: 'file:///proof.jpg', name: 'proof.jpg', mimeType: 'image/jpeg' })).success, true);
  assert.equal(p.state.uploads.length, 1); assert.equal(p.state.removals, undefined);
  const calls = p.state.rpcCalls.slice(count).map(call => call.name);
  assert.equal(calls.filter(name => name === 'complete_quest_v2').length, 1);
  assert(calls.includes('student_list_recommendation_candidates')); assert(calls.includes('student_list_completion_history')); p.close();
});
for (const phase of ['readProof', 'upload']) test('logout during proof ' + phase + ' prevents RPC dispatch', async () => {
  const p = provider(); await flush(); const wait = deferred(); p.state[phase] = () => wait.promise;
  const task = p.h.value.completeQuest('q1', { uri: 'file:///proof.jpg', name: 'proof.jpg', mimeType: 'image/jpeg' });
  await flush(); await p.h.value.signOut(); wait.resolve(phase === 'readProof' ? new ArrayBuffer(2) : ok(null));
  assert.equal((await task).error, 'Session ended.');
  assert(!p.state.rpcCalls.some(call => call.name === 'complete_quest_v2')); assert.equal(p.state.removals, undefined); p.close();
});
test('old completion cannot release the new account duplicate guard or reload it', async () => {
  const p = provider(); await flush(); const oldWait = deferred(), nextWait = deferred(); let calls = 0;
  p.state.rpc = name => name === 'complete_quest_v2' ? (++calls === 1 ? oldWait.promise : nextWait.promise) : undefined;
  const oldTask = p.h.value.completeQuest('q1'); p.emit(user('b')); await flush();
  const nextTask = p.h.value.completeQuest('q1'); const queryCount = p.state.queries.length;
  oldWait.resolve(ok({ status: 'completed', title: 'Quest', awarded_xp: 25, total_xp: 25 })); assert.equal((await oldTask).error, 'Session ended.'); await flush();
  assert.equal(p.state.queries.length, queryCount); assert.equal(p.h.value.user.id, 'b');
  assert.match((await p.h.value.completeQuest('q1')).error, /already being completed/);
  nextWait.resolve(ok({ status: 'completed', title: 'Quest', awarded_xp: 25, total_xp: 25 })); assert.equal((await nextTask).success, true); p.close();
});
test('workspace failure after completion preserves admission and referenced proof', async () => {
  const p = provider(); await flush();
  p.state.query = table => table === 'profiles' ? { error: { message: 'Profile unavailable' } } : undefined;
  assert.equal((await p.h.value.completeQuest('q1', { uri: 'file:///proof.jpg', name: 'proof.jpg', mimeType: 'image/jpeg' })).success, true);
  await flush(); assert.equal(p.h.value.access, 'active'); assert(p.h.value.workspaceErrors.profile);
  assert.equal(p.state.removals, undefined); p.close();
});

test('account switch discards the previous profile response', async () => {
  const p = provider(); const wait = deferred();
  p.state.query = table => table === 'profiles' ? wait.promise : undefined;
  await flush();
  p.state.query = undefined; p.emit(user('b')); await flush();
  wait.resolve(ok({ display_name: 'Old student' })); await flush();
  assert.equal(p.h.value.user.id, 'b'); assert.equal(p.h.value.profile.id, 'b');
  assert.notEqual(p.h.value.profile.display_name, 'Old student'); p.close();
});

test('all private routes are excluded for every non-active access state', () => {
  const react = hooks().react;
  const stack = Object.assign(() => null, { Protected: 'Protected', Screen: 'Screen' });
  let currentAccess;
  const pass = ({ children }) => children;
  const notifications = { startQuestNotificationLifetime() {}, cancelQuestNotifications: async () => {} };
  const notificationFeature = load('src/components/notification-feature.tsx', {
    react, 'react-native': { Platform: { OS: 'android' } },
    '@/constants/features': load('src/constants/features.ts'),
    '@/components/quest-notification-response': { QuestNotificationResponse: () => null },
    '@/lib/quest-notifications': notifications,
  });
  const features = load('src/constants/features.ts');
  const layout = load('src/app/_layout.tsx', {
    'expo-font': { useFonts: () => [true] }, '@/assets/fonts/VT323/VT323-Regular.ttf': 1,
    '@/global.css': {}, '@rn-primitives/portal': { PortalHost: 'PortalHost' },
    '@/constants/features': features,
    '@/constants/theme': { APP_COLOR_SCHEME: 'light', useBeePalette: () => ({ background: '#f8f7de' }) },
    nativewind: { colorScheme: { set() {} } },
    '@/hooks/use-app-appearance': { useAppAppearance: () => ({ scheme: 'light' }), useRestoreAppAppearance() {} },
    'expo-status-bar': { StatusBar: 'StatusBar' },
    '@/lib/theme': { NAV_THEME: { light: {}, dark: {} } },
    react, 'expo-router': { Stack: stack, ThemeProvider: pass },
    'expo-splash-screen': { preventAutoHideAsync: async () => {} },
    'react-native': { View: 'View', useColorScheme: () => 'light', Platform: { OS: 'android' } },
    '@/components/notification-feature': notificationFeature,
    '@/components/geofencing-feature': { GeofencingFeature: () => null },
    '@/components/animated-icon': { AnimatedSplashOverlay: () => null },
    '@/components/hexagon-background': { HexagonBackground: () => null },
    '@/context/user-data-context': { UserDataProvider: pass, useUserData: () => ({ access: currentAccess }) },
    '@/context/location-context': { LocationProvider: pass },
    '@/context/quest-priority-context': { QuestPriorityProvider: pass },
  });
  const integration = layout.default().props.notificationLifecycle;
  assert.equal(integration.start, notifications.startQuestNotificationLifetime);
  assert.equal(integration.cleanup, notifications.cancelQuestNotifications);
  assert.equal(layout.default().props.notificationLifecycle, integration);
  function routes(element) {
    if (!element) return [];
    if (Array.isArray(element)) return element.flatMap(routes);
    if (element.type === stack) return routes(element.props.children);
    if (typeof element.type === 'function') return routes(element.type(element.props));
    if (element.type === 'Protected' && !element.props.guard) return [];
    if (element.type === 'Screen') return [element.props.name];
    return routes(element.props.children);
  }
  for (currentAccess of ['checking', 'signed_out', 'blocked', 'verification_error', 'onboarding_required', 'recovery_required']) assert.deepEqual(routes(layout.default()), ['auth']);
  currentAccess = 'active';
  const privateRoutes = routes(layout.default());
  assert(privateRoutes.includes('(tabs)')); assert(privateRoutes.includes('add-quest'));
  assert(!privateRoutes.includes('auth'));
  assert.deepEqual(privateRoutes, ['(tabs)', 'notifications', 'add-quest', 'manage-locations', 'skill-tree-prototype', 'settings/index', 'settings/general', 'wellness-check-in', 'wellness-history']);
  features.MOBILE_NOTIFICATIONS_ENABLED = false;
  assert.deepEqual(routes(layout.default()), privateRoutes.filter(route => route !== 'notifications'));
  features.MOBILE_NOTIFICATIONS_ENABLED = true;
  // Retained screens can return after a product decision, still behind admission.
  features.MOBILE_WELLNESS_AND_SUPPORT_ENABLED = true;
  assert(routes(layout.default()).includes('support-requests'));
  currentAccess = 'signed_out';
  assert.deepEqual(routes(layout.default()), ['auth']);
});

test('logout revokes a push registration already in flight', async () => {
  const wait = deferred(); let stored = null; const calls = [];
  const notifications = load('src/lib/quest-notifications.ts', {
    '@/lib/geofence-events': { setGeofenceEntryHandler() {} },
    '@/constants/features': { MOBILE_NOTIFICATIONS_ENABLED: true },
    'expo-task-manager': { isTaskDefined: () => false, defineTask() {}, isTaskRegisteredAsync: async () => false },
    react: { useSyncExternalStore() {} },
    'expo-constants': { expoConfig: { extra: { eas: { projectId: 'project' } } } },
    '@react-native-async-storage/async-storage': {
      getItem: async () => stored, setItem: async (_, value) => { stored = value; }, removeItem: async () => { stored = null; },
    },
    '@/supabase': { supabase: {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'a' } } } }) },
      rpc: (_, args) => ({ abortSignal: async () => { calls.push(args.enabled_value); if (args.enabled_value) await wait.promise; return { error: null }; } }),
    } },
    'react-native': { Platform: { OS: 'android' }, AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } },
    'expo-notifications': {
      addPushTokenListener: () => ({ remove() {} }), setNotificationHandler() {}, setNotificationChannelAsync: async () => {}, registerTaskAsync: async () => {},
      getPermissionsAsync: async () => ({ granted: true }), setNotificationCategoryAsync: async () => {},
      AndroidImportance: { DEFAULT: 1 }, getExpoPushTokenAsync: async () => ({ data: 'ExpoPushToken[test]' }),
      getAllScheduledNotificationsAsync: async () => [], cancelAllScheduledNotificationsAsync: async () => {}, dismissAllNotificationsAsync: async () => {},
    },
  }, { setInterval: () => 0 });
  notifications.startQuestNotificationLifetime('a', () => true);
  await flush();
  const cleanup = notifications.cancelQuestNotifications();
  wait.resolve(); await cleanup;
  assert.deepEqual(calls, [true, false]); assert.equal(stored, null);
});

test('queued geofence registration cannot restart tracking after logout', async () => {
  const wait = deferred(); let starts = 0, running = false;
  const geofencing = load('src/hooks/use-geofencing.ts', {
    '@/constants/features': { MOBILE_GEOFENCING_ENABLED: true },
    '@/lib/geofence-events': { recordGeofenceEvent: async () => {} },
    'expo-task-manager': { defineTask() {}, isAvailableAsync: () => wait.promise },
    'expo-location': {
      hasServicesEnabledAsync: async () => true, getBackgroundPermissionsAsync: async () => ({ status: 'granted' }),
      hasStartedGeofencingAsync: async () => running,
      startGeofencingAsync: async () => { starts++; running = true; },
      stopGeofencingAsync: async () => { running = false; },
    },
  });
  const task = geofencing.syncGeofences([{ id: 'place', is_active: true }]);
  await flush(); const cleanup = geofencing.unregisterAllGeofences();
  wait.resolve(true); await Promise.all([task, cleanup]);
  assert.equal(starts, 0); assert.equal(running, false);
});

test('geofence storage cleanup wins over an in-flight write', async () => {
  const wait = deferred(); let stored = '{}'; const events = [];
  const mod = load('src/lib/geofence-events.ts', {
    '@react-native-async-storage/async-storage': {
      getItem: async () => stored,
      setItem: async (_, value) => { await wait.promise; stored = value; },
      removeItem: async () => { stored = null; },
    },
  });
  mod.subscribeGeofenceEvents(event => events.push(event));
  const task = mod.recordGeofenceEvent('old-place', true); await flush();
  const cleanup = mod.clearGeofenceEvents(); wait.resolve(); await Promise.all([task, cleanup]);
  assert.equal(stored, null); assert.equal(Object.keys(events.at(-1)).length, 0);
});

test('pending Android permission result cannot start a watcher after logout', async () => {
  const h = hooks(); const permission = deferred(); let starts = 0, enabled = true;
  const mod = load('src/hooks/use-current-location.ts', {
    react: h.react, 'react-native': { Platform: { OS: 'android' } },
    '@/lib/quest-context': { distanceMeters: () => 0 },
    'expo-task-manager': { isAvailableAsync: async () => true },
    'expo-location': {
      requestForegroundPermissionsAsync: () => permission.promise,
      requestBackgroundPermissionsAsync: async () => {}, Accuracy: { Balanced: 1 },
      watchPositionAsync: async () => { starts++; return { remove() {} }; },
    },
  });
  h.mount(() => mod.useCurrentLocation([], enabled));
  const start = h.value.startTracking(); enabled = false; h.render();
  await h.value.stopTracking(); permission.resolve({ status: 'granted' }); await start; await flush();
  assert.equal(starts, 0); assert.equal(h.value.isTracking, false); h.unmount();
});

test('storage removal errors reach Auth instead of being silently swallowed', async () => {
  let config;
  load('src/supabase.ts', {
    'react-native-url-polyfill/auto': {}, 'react-native': { Platform: { OS: 'android' } },
    '@react-native-async-storage/async-storage': { removeItem: async () => { throw new Error('disk failure'); } },
    '@supabase/supabase-js': { createClient: (_, __, options) => { config = options; return {}; } },
  }, { process: { env: { EXPO_PUBLIC_SUPABASE_URL: 'https://example.test', EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test' } } });
  await assert.rejects(config.auth.storage.removeItem('session'), /disk failure/);
});

test('foreground polling detects suspension without an Auth event', async () => {
  const p = provider(); await flush();
  p.state.status = 'Inactive'; p.state.poll(); await flush();
  assert.equal(p.h.value.access, 'blocked'); p.close();
});
test('callbacks retained from an earlier login cannot mutate a new session', async () => {
  const p = provider(); await flush(); const oldAdd = p.h.value.addQuest;
  await p.h.value.signOut(); await flush();
  await p.h.value.signIn(studentIdentity.student_number, 'password'); await flush();
  const count = p.state.queries.length;
  const result = await oldAdd({ title: 'Old callback', category: 'Habits', xp: 20 });
  assert.equal(result.success, false); assert.equal(p.state.queries.length, count); p.close();
});
for (const initialState of [{ recoveryMarker: true }, { missing: true, registrationState: 'onboarding_required' }, { status: 'Inactive' }, { studentError: true }]) test('unadmitted account never starts notification lifetime: ' + JSON.stringify(initialState), async () => {
  const p = provider(user('a'), initialState); await flush();
  assert.equal(p.state.notificationLifetimes?.length || 0, 0); p.close();
});
test('a delayed location read cannot leak old places after switching accounts', async () => {
  const h = hooks(); let currentUser = user('a'); const wait = deferred();
  let queryResult = wait.promise;
  const query = { select: () => query, eq: () => query, order: () => queryResult };
  const mod = load('src/hooks/use-user-locations.ts', {
    react: h.react, '@/lib/account-access': access,
    '@/context/user-data-context': { useUserData: () => ({ user: currentUser }) },
    '@/supabase': { supabase: { from: () => query } },
  });
  h.mount(() => mod.useUserLocations());
  const first = h.value.fetchLocations();
  currentUser = user('b'); h.render();
  queryResult = Promise.resolve(ok([{ id: 'b-place', owner_id: 'b', is_active: true }]));
  await h.value.fetchLocations();
  wait.resolve(ok([{ id: 'a-place', owner_id: 'a', is_active: true }])); await first; await flush();
  assert.equal(h.value.locations.length, 1); assert.equal(h.value.locations[0].owner_id, 'b');
  currentUser = null; h.render(); assert.equal(h.value.locations.length, 0); h.unmount();
});
test('location initialization cannot start tracking after logout, even if cleanup fails', async () => {
  const h = hooks(); const wait = deferred(); let currentUser = user('a');
  let starts = 0, stops = 0, clears = 0;
  const refresh = () => currentUser ? wait.promise : Promise.resolve();
  const start = async () => { starts++; };
  const stop = async () => { stops++; throw new Error('Native removal failure'); };
  const mod = load('src/context/location-context.tsx', {
    react: h.react, 'expo-location': {},
    'react-native': { Platform: { OS: 'android' }, AppState: { currentState: 'background', addEventListener: () => ({ remove() {} }) } },
    '@/hooks/use-user-locations': { useUserLocations: () => ({ user: currentUser, locations: [], activeLocations: [], fetchLocations: refresh }) },
    '@/hooks/use-current-location': { useCurrentLocation: () => ({ startTracking: start, stopTracking: stop }) },
    '@/lib/geofence-events': { clearGeofenceEvents: async () => { clears++; throw new Error('Storage unavailable'); }, readGeofenceEvents: async () => ({}), subscribeGeofenceEvents: () => () => {} },
  });
  h.mount(() => mod.LocationProvider({ children: null })); await flush();
  currentUser = null; h.render(); wait.resolve(); await flush();
  assert.equal(starts, 0); assert(stops > 0); assert(clears > 0); h.unmount();
});
test('shared geofence context rejects delayed reads and retired subscriptions across accounts', async () => {
  const h = hooks(), wait = deferred(); let currentUser = user('a'), listener; const retired = [];
  const noWork = async () => {};
  const mod = load('src/context/location-context.tsx', {
    react: h.react, 'expo-location': {},
    'react-native': { Platform: { OS: 'android' }, AppState: { currentState: 'background', addEventListener: () => ({ remove() {} }) } },
    '@/hooks/use-user-locations': { useUserLocations: () => ({ user: currentUser, locations: [], activeLocations: [], fetchLocations: noWork }) },
    '@/hooks/use-current-location': { useCurrentLocation: () => ({ startTracking: noWork, stopTracking: noWork }) },
    '@/lib/geofence-events': { clearGeofenceEvents: noWork,
      readGeofenceEvents: () => currentUser.id === 'a' ? wait.promise : Promise.resolve({ b: { inside: true, timestamp: 2 } }),
      subscribeGeofenceEvents: callback => { listener = callback; return () => retired.push(callback); } },
  });
  h.mount(() => mod.LocationProvider({ children: null })); const oldListener = listener;
  currentUser = user('b'); h.render(); assert.equal(Object.keys(h.value.geofenceEvents).length, 0);
  await flush(); assert.equal(h.value.geofenceEvents.b.inside, true);
  oldListener({ a: { inside: true, timestamp: 1 } }); wait.resolve({ a: { inside: true, timestamp: 1 } }); await flush();
  assert.equal(h.value.geofenceEvents.a, undefined); assert.equal(h.value.geofenceEvents.b.inside, true);
  currentUser = null; h.render(); assert.equal(Object.keys(h.value.geofenceEvents).length, 0); h.unmount(); assert.equal(retired.length, 2);
});
for (const foreground of ['denied', 'granted']) test('foreground ' + foreground + ' with background denied remains safe', async () => {
  const h = hooks(); let starts = 0, removals = 0;
  const mod = load('src/hooks/use-current-location.ts', {
    react: h.react, 'react-native': { Platform: { OS: 'android' } },
    '@/lib/quest-context': { distanceMeters: () => 0 },
    'expo-task-manager': { isAvailableAsync: async () => true },
    'expo-location': {
      requestForegroundPermissionsAsync: async () => ({ status: foreground }),
      requestBackgroundPermissionsAsync: async () => ({ status: 'denied' }), Accuracy: { Balanced: 1 },
      watchPositionAsync: async () => { starts++; return { remove() { removals++; } }; },
    },
  });
  h.mount(() => mod.useCurrentLocation([], true)); await h.value.startTracking(); await flush();
  assert.equal(starts, foreground === 'granted' ? 1 : 0);
  await h.value.stopTracking(); await flush();
  assert.equal(h.value.isTracking, false); assert.equal(removals, starts); h.unmount();
});


test('logout waits for a delayed login and removes its persisted SDK session', async () => {
  const p = provider(null); await flush(); p.state.loginWait = deferred();
  const login = p.h.value.signIn(studentIdentity.student_number, 'legacy'); await pause();
  const logout = p.h.value.signOut(); let settled = false; logout.then(() => { settled = true; });
  await flush(); assert.equal(settled, false); assert.equal(p.h.value.user, null);
  p.state.loginWait.resolve(); assert.equal((await login).code, 'operation_cancelled'); await logout; await flush();
  assert.equal(p.state.session, null); assert.equal(p.h.value.access, 'signed_out'); p.close();
});
test('student ID login preserves the older-account help error', async () => {
  const p = provider(null); await flush(); p.state.authError = 'legacy_confirmation_required';
  const result = await p.h.value.signIn(studentIdentity.student_number, 'legacy');
  assert.equal(result.code, 'legacy_confirmation_required');
  assert.equal(p.state.tokens, undefined); p.close();
});
test('a missing student-auth endpoint reports a server issue and leaves the user signed out', async () => {
  const p = provider(null, { authError: 'NOT_FOUND', authStatus: 404 }); await flush();
  const result = await p.h.value.signIn(studentIdentity.student_number, 'example-password');
  assert.equal(result.code, 'student_auth_endpoint_missing');
  assert.match(result.message, /unavailable on this server/i);
  assert.equal(p.h.value.access, 'signed_out');
  assert.equal(p.state.tokens, undefined);
  p.close();
});
test('cold-start recovery persists its restriction until password update succeeds', async () => {
  const p = provider(user('a'), { initialUrl: 'beebetter://auth?code=recovery-code&flow=recovery' }); await flush();
  assert.equal(p.state.exchange, 'recovery-code'); assert.equal(p.state.recoveryMarker, true);
  assert.equal(p.h.value.access, 'recovery_required'); assert.equal(p.h.value.user, null);
  assert(!p.state.queries.includes('profiles:select'));
  p.state.updateError = { code: 'network_error', message: 'Offline' };
  assert.equal((await p.h.value.updateRecoveryPassword('a'.repeat(15))).status, 'error');
  assert.equal(p.state.recoveryMarker, true); p.state.updateError = null;
  assert.equal((await p.h.value.updateRecoveryPassword('a'.repeat(15))).status, 'completed'); await flush();
  assert.equal(p.state.recoveryMarker, false); assert.equal(p.h.value.access, 'active'); p.close();
});
test('restored recovery marker keeps an existing Student outside workspace', async () => {
  const p = provider(user('a'), { recoveryMarker: true }); await flush();
  assert.equal(p.h.value.access, 'recovery_required'); assert.equal(p.h.value.user, null); p.close();
});
test('implicit links remain supported and foreign URLs cannot exchange credentials', async () => {
  const p = provider(null); await flush();
  await p.h.value.handleAuthCallback('https://foreign.test/auth?code=unsafe'); assert.equal(p.state.exchange, undefined);
  await p.h.value.handleAuthCallback('beebetter://auth#access_token=synthetic&refresh_token=synthetic&type=signup'); await flush();
  assert.equal(p.state.tokens.access_token, 'synthetic'); assert.equal(p.h.value.access, 'active');
  const expired = await p.h.value.handleAuthCallback('beebetter://auth?error_code=otp_expired'); assert.equal(expired.code, 'otp_expired'); p.close();
});
test('confirmed incomplete registrations submit the required name and enrollment', async () => {
  const p = provider(); p.state.missing = true; p.state.registrationState = 'onboarding_required'; await flush();
  assert.equal(p.h.value.access, 'onboarding_required'); assert.equal(p.h.value.user, null);
  p.state.rpc = name => { if (name === 'student_complete_registration') { p.state.missing = false; p.state.registrationState = 'active'; return ok({ status: 'completed' }); } };
  assert.equal((await p.h.value.completeRegistration({ ...studentIdentity, goal: '' })).code, 'invalid_registration');
  const result = await p.h.value.completeRegistration(enrolledRegistration);
  assert.equal(result.status, 'completed'); await flush(); assert.equal(p.h.value.access, 'active');
  const call = p.state.rpcCalls.find(x => x.name === 'student_complete_registration');
  assert.deepEqual({ ...call.args }, {
    student_number_value: studentIdentity.student_number, name_value: 'Maria Cruz', goal_value: 'Build habits',
    semester_id_value: registrationOption.semester_id, enrollment_option_id_value: registrationOption.id,
  }); p.close();
});
test('unassigned students enroll on their own record before opening the workspace', async () => {
  const p = provider(user('a'), { unassigned: true }); await flush();
  assert.equal(p.h.value.access, 'onboarding_required');
  assert.equal(p.h.value.registrationDraft.existingStudent, true);
  assert.equal(p.h.value.registrationDraft.student_number, studentIdentity.student_number);
  assert(!p.state.queries.includes('profiles:select'));
  p.state.rpc = name => name === 'student_complete_enrollment' ? ok({ status: 'error', code: 'enrollment_changed' }) : undefined;
  assert.equal((await p.h.value.completeRegistration(enrolledRegistration)).code, 'enrollment_changed');
  assert.equal(p.h.value.access, 'onboarding_required');
  p.state.rpc = name => {
    if (name === 'student_complete_enrollment') { p.state.unassigned = false; return ok({ status: 'completed' }); }
  };
  assert.equal((await p.h.value.completeRegistration(enrolledRegistration)).status, 'completed'); await flush();
  assert.equal(p.h.value.access, 'active');
  const call = p.state.rpcCalls.find(call => call.name === 'student_complete_enrollment');
  assert.equal(call.args.semester_id_value, registrationOption.semester_id);
  assert(!('student_number_value' in call.args)); p.close();
});
test('workspace exceptions retain verified admission and retry recovers', async () => {
  const p = provider(); p.state.rpc = name => { if (name === 'student_get_current_streak') throw new Error('Offline'); }; await flush();
  assert.equal(p.h.value.access, 'active'); assert.equal(p.h.value.user.id, 'a'); assert(p.h.value.error);
  p.state.rpc = null; await p.h.value.refresh(); assert.equal(p.h.value.error, null); p.close();
});
test('overlapping full refreshes coalesce after an admission-only read', async () => {
  const p = provider(); await flush(); const wait = deferred(); const profiles = p.state.queries.filter(x => x === 'profiles:select').length;
  p.state.query = table => table === 'students' ? wait.promise : undefined;
  p.emit(user('a'), 'TOKEN_REFRESHED'); await flush();
  const first = p.h.value.refresh(), second = p.h.value.refresh(); await flush();
  p.state.query = null; wait.resolve(ok({ id: 'a', name: 'Student', status: 'Active', ...assignment })); await Promise.all([first, second]); await flush();
  assert.equal(p.state.queries.filter(x => x === 'profiles:select').length, profiles + 1); assert.equal(p.h.value.isRefreshing, false); p.close();
});
test('workspace slice errors preserve unrelated data and remain visible after token refresh', async () => {
  const p = provider(); p.state.rpc = name => name === 'student_get_current_streak' ? { data: null, error: { code: 'network_error' } } : undefined; await flush();
  assert.equal(p.h.value.access, 'active'); assert(p.h.value.workspaceErrors.streak); assert.equal(p.h.value.quests.length, 1);
  p.emit(user('a'), 'TOKEN_REFRESHED'); await flush(); assert(p.h.value.error); assert(p.h.value.workspaceErrors.streak); p.close();
});
test('scoped retry revalidates admission and clears only the attempted workspace error', async () => {
  const p = provider(); p.state.rpc = name => ['student_get_current_streak', 'student_list_recommendation_candidates'].includes(name) ? { data: null, error: { code: 'network_error' } } : undefined; await flush();
  assert(p.h.value.workspaceErrors.streak); assert(p.h.value.workspaceErrors.quests);
  p.state.rpc = null; const before = p.state.rpcCalls.length; const profiles = p.state.queries.filter(x => x === 'profiles:select').length;
  await p.h.value.retryWorkspace('streak'); await flush();
  assert.equal(p.h.value.workspaceErrors.streak, undefined); assert(p.h.value.workspaceErrors.quests); assert(p.h.value.error);
  assert.equal(p.state.queries.filter(x => x === 'profiles:select').length, profiles);
  assert.deepEqual(p.state.rpcCalls.slice(before).map(call => call.name), ['student_get_registration_state', 'student_get_current_streak']);
  p.state.status = 'Inactive'; const calls = p.state.rpcCalls.length;
  await p.h.value.retryWorkspace('quests'); await flush(); assert.equal(p.h.value.access, 'blocked');
  assert(!p.state.rpcCalls.slice(calls).some(call => call.name === 'student_list_recommendation_candidates')); p.close();
});
test('token refresh verifies admission without reloading workspace', async () => {
  const p = provider(); await flush(); const profiles = p.state.queries.filter(x => x === 'profiles:select').length;
  p.emit(user('a'), 'TOKEN_REFRESHED'); await flush();
  assert.equal(p.state.queries.filter(x => x === 'profiles:select').length, profiles);
  p.state.status = 'Inactive'; p.emit(user('a'), 'TOKEN_REFRESHED'); await flush(); assert.equal(p.h.value.access, 'blocked'); p.close();
});
test('native token refresh follows foreground and background transitions', async () => {
  const p = provider(null); await flush(); assert.equal(p.state.refreshStarts, 1);
  p.background(); assert.equal(p.state.refreshStops, 1); p.resume(); assert.equal(p.state.refreshStarts, 2); p.close(); assert.equal(p.state.refreshStops, 2);
});
test('web callbacks enforce the app origin and preserve recovery semantics', () => {
  assert.equal(authFlow.parseAuthCallback('https://app.example.test/auth?code=synthetic&flow=recovery', 'https://app.example.test').recovery, true);
  assert.equal(authFlow.parseAuthCallback('https://foreign.test/auth?code=synthetic', 'https://app.example.test'), null);
  assert.equal(authFlow.parseAuthCallback('https://app.example.test/private?code=synthetic', 'https://app.example.test'), null);
});
test('signup rejects an invalid student ID or a short password before creating an account', async () => {
  const p = provider(null); await flush();
  assert.equal((await p.h.value.signUp(studentIdentity, 'short')).code, 'weak_password');
  assert.equal((await p.h.value.signUp({ ...studentIdentity, student_number: '123' }, 'a'.repeat(15))).code, 'invalid_registration');
  assert.equal(p.state.authCalls, 0); p.close();
});

function screen(relative, context) {
  context = { isAuthBusy: false, isSigningOut: false, ...context };
  const h = hooks(); const native = Object.fromEntries(['ActivityIndicator','KeyboardAvoidingView','TextInput','TouchableOpacity','View','ScrollView'].map(x => [x,x]));
  native.Platform = { OS: 'web' }; native.StyleSheet = { create: x => x };
  native.Keyboard = { dismiss() {} };
  native.BackHandler = { addEventListener: () => ({ remove() {} }) };
  native.Animated = { View: 'AnimatedView', Value: class { stopAnimation() {} setValue() {} } };
  const catalogue = { options: [registrationOption], loading: false, ready: true, retry() {}, ...context.catalogue };
  for (const key of ['signIn', 'signUp', 'updateRecoveryPassword', 'completeRegistration']) {
    const operation = context[key];
    if (operation) context[key] = (...args) => {
      context.isAuthBusy = true; h.render();
      return Promise.resolve().then(() => operation(...args)).finally(() => { context.isAuthBusy = false; h.render(); });
    };
  }
  const mod = load(relative, { react: h.react, 'react-native': native,
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' }, '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/lib/auth-flow': authFlow,
    '@/hooks/use-user-data': { useUserData: () => context }, '@/components/themed-text': { ThemedText: 'Text' },
    '@/components/student-enrollment-fields': { StudentEnrollmentFields: 'EnrollmentFields' },
    '@/hooks/use-enrollment-options': { useEnrollmentOptions: () => catalogue },
    '@/hooks/use-registration-form': load('src/hooks/use-registration-form.ts', { react: h.react, '@/lib/auth-flow': authFlow, '@/lib/student-validation': validation }),
    '@/lib/student-validation': validation,
    '@/constants/theme': { ...require('../src/constants/design-tokens.json'), Borders: { focus: 2 }, Controls: { minHeight: 48 }, Typography: require('../src/constants/design-tokens.json').typography, Fonts: { sans: 'sans-serif' }, Radii: {}, useBeePalette: () => require('../src/constants/design-tokens.json').light, useBeeStyles: factory => factory(require('../src/constants/design-tokens.json').light) },
    '@/components/mobile-ui': { Button: 'ActionButton', Field: 'Field', IconButton: 'IconButton', useReducedMotion: () => true },
    '@/components/pixel/pixel-button': { PixelButton: 'ActionButton' },
    '@/components/bee-visuals': { BeeMark: 'BeeMark' },
  });
  h.mount(() => { const view = mod.default(); return typeof view.type === 'function' ? view.type(view.props) : view; });
  const nodes = value => !value || typeof value !== 'object' ? [] : Array.isArray(value) ? value.flatMap(nodes) : [value, ...nodes(value.props?.children)];
  const text = node => !node ? '' : typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : text(node.props?.children);
  return { h, find: predicate => nodes(h.value).find(predicate), button: label => nodes(h.value).find(x => x.type === 'ActionButton' && x.props.label === label) || nodes(h.value).find(x => x.type === 'TouchableOpacity' && text(x) === label) };
}
const field = (screen, label) => screen.find(node => node.props?.accessibilityLabel === label);
async function enter(screen, label, value) { field(screen, label).props.onChangeText(value); await flush(); }
async function press(screen, label) { screen.button(label).props.onPress(); await flush(); }
async function enterId(screen) { await enter(screen, 'Student ID, required', studentIdentity.student_number); await press(screen, 'Continue'); }
test('password visibility and focus preserve the entered value and do not submit Auth', async () => {
  let calls = 0;
  const s = screen('src/app/auth.tsx', { access: 'signed_out', signIn() { calls++; } });
  await enterId(s);
  const input = () => s.find(node => node.props?.accessibilityLabel === 'Password, required');
  input().props.onChangeText('my password'); await flush();
  assert.equal(input().props.secureTextEntry, true);
  input().props.onFocus(); await flush();
  const row = () => s.find(node => node.type === 'View' && node.props.children?.some?.(child => child?.type === 'TextInput'));
  const flatten = styles => Object.assign({}, ...styles.filter(Boolean));
  const width = flatten(row().props.style).borderWidth;
  assert.equal(flatten(row().props.style).borderColor, require('../src/constants/design-tokens.json').light.focus);
  s.find(node => node.type === 'IconButton' && node.props.label === 'Show password').props.onPress(); await flush();
  assert.equal(input().props.value, 'my password'); assert.equal(input().props.secureTextEntry, false);
  input().props.onBlur(); await flush(); assert.equal(flatten(row().props.style).borderWidth, width);
  assert.equal(calls, 0); s.h.unmount();
});

test('sign-in uses student ID and password without an email field', async () => {
  let attempted;
  const s = screen('src/app/auth.tsx', { access: 'signed_out', signIn: async (...args) => { attempted = args; return { status: 'session_created' }; } });
  assert(!s.find(node => node.props?.accessibilityLabel === 'Email address, required'));
  assert(!field(s, 'Password, required'));
  await enterId(s);
  await enter(s, 'Password, required', 'old password');
  await press(s, '‹ Back');
  assert.equal(field(s, 'Student ID, required').props.value, studentIdentity.student_number);
  await press(s, 'Continue');
  assert.equal(field(s, 'Password, required').props.value, 'old password');
  await flush(); await s.button('Sign in').props.onPress(); await flush();
  assert.deepEqual(attempted, [studentIdentity.student_number, 'old password']); s.h.unmount();
});
test('pending Auth UI prevents duplicate requests and mode changes', async () => {
  const wait = deferred(); let requests = 0; const s = screen('src/app/auth.tsx', { access: 'signed_out', signIn: () => { requests++; return wait.promise; } });
  await enterId(s);
  await enter(s, 'Password, required', 'old');
  const submit = s.button('Sign in');
  submit.props.onPress(); submit.props.onPress(); await flush(); assert.equal(requests, 1);
  assert.equal(s.button('‹ Back').props.disabled, true);
  wait.resolve({ status: 'error', code: 'network_error', message: 'Retry' }); await flush(); s.h.unmount();
});
test('signup sends the student details and exact enrollment pair and opens a session', async () => {
  const p = provider(null); await flush();
  assert.equal((await p.h.value.signUp(enrolledRegistration, 'a'.repeat(15))).status, 'session_created');
  assert.deepEqual({ ...p.state.authInput }, {
    action: 'sign_up_enrolled', student_number: studentIdentity.student_number, name: 'Maria Cruz',
    password: 'a'.repeat(15), goal: 'Build habits', ...assignment, expected_labels: expectedLabels,
  });
  assert.equal(p.state.tokens.access_token, 'student-access');
  await flush(); assert.equal(p.h.value.access, 'active'); p.close();
});
for (const value of [undefined, { version: 3 }, { version: 2 }, { ...identityDraft, student: { ...studentIdentity, name: 17 } }]) test('missing/malformed metadata keeps manual onboarding available: ' + String(value?.version), async () => {
  const account = { ...user('a'), user_metadata: { signup_intent: 'student_registration', registration_draft: value } };
  const p = provider(account, { missing: true, registrationState: 'onboarding_required' }); await flush();
  assert.equal(p.h.value.access, 'onboarding_required'); assert.equal(p.h.value.registrationDraft, null);
  assert(!p.state.rpcCalls.some(call => call.name === 'student_complete_registration')); p.close();
});
function allowRegistration(p) {
  p.state.rpc = name => {
    if (name === 'student_complete_registration') {
      p.state.missing = false; p.state.registrationState = 'active'; return ok({ status: 'completed' });
    }
  };
}
for (const entry of ['restart', 'confirmation callback']) test('saved registration completes automatically after ' + entry, async () => {
  const p = provider(entry === 'restart' ? pendingStudent('a') : null, { missing: true, registrationState: 'onboarding_required' });
  allowRegistration(p);
  if (entry !== 'restart') {
    await flush();
    p.state.callbackUser = pendingStudent('a'); await p.h.value.handleAuthCallback('beebetter://auth?code=confirmed');
  }
  await flush(); await flush();
  assert.equal(p.h.value.access, 'active'); assert.equal(p.h.value.user.id, 'a');
  const calls = p.state.rpcCalls.filter(call => call.name === 'student_complete_registration');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args.enrollment_option_id_value, registrationOption.id);
  assert.equal(calls[0].args.student_number_value, studentIdentity.student_number);
  assert.equal(p.state.updated.data.registration_draft, null);
  assert.equal(p.state.session.user.user_metadata.registration_draft, null); p.close();
});
for (const stale of [false, true]) test('pending legacy enrollment is preserved when available: ' + !stale, async () => {
  const p = provider(pendingStudent('a', registrationDraft), { missing: true, registrationState: 'onboarding_required' });
  allowRegistration(p);
  const complete = p.state.rpc;
  p.state.rpc = (name, args) => {
    if (stale && name === 'student_complete_registration' && args.enrollment_option_id_value) return ok({ code: 'enrollment_changed' });
    return complete(name);
  };
  await flush(); await flush();
  const calls = p.state.rpcCalls.filter(call => call.name === 'student_complete_registration');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args.enrollment_option_id_value, registrationOption.id);
  assert.equal(calls[0].args.name_value, 'Maria Cruz');
  assert.equal(p.h.value.access, stale ? 'onboarding_required' : 'active');
  if (stale) assert.match(p.h.value.registrationError, /enrollment choices changed/i);
  p.close();
});

for (const code of ['student_number_unavailable', 'invalid_registration', 'network_error']) test('automatic failure preserves a correction form without retry loops: ' + code, async () => {
  const p = provider(pendingStudent('a'), { missing: true, registrationState: 'onboarding_required' });
  p.state.rpc = name => name === 'student_complete_registration' ? (code === 'network_error' ? { error: { code, message: 'Retry' }, data: null } : ok({ status: 'error', code })) : undefined;
  await flush(); await flush();
  assert.equal(p.h.value.access, 'onboarding_required'); assert(p.h.value.registrationError);
  assert.equal(p.h.value.registrationDraft.student_number, studentIdentity.student_number);
  assert(!p.state.queries.includes('profiles:select'));
  p.emit(pendingStudent('a'), 'TOKEN_REFRESHED'); await flush(); await p.h.value.refresh(); await flush();
  assert.equal(p.state.rpcCalls.filter(call => call.name === 'student_complete_registration').length, 1);
  allowRegistration(p);
  assert.equal((await p.h.value.completeRegistration(enrolledRegistration)).status, 'completed');
  await flush(); assert.equal(p.h.value.access, 'active'); p.close();
});
test('failed draft cleanup leaves successful registration admitted and idempotent', async () => {
  const p = provider(pendingStudent('a'), { missing: true, registrationState: 'onboarding_required', updateError: { code: 'network_error' } });
  allowRegistration(p); await flush(); await flush();
  assert.equal(p.h.value.access, 'active');
  p.emit(pendingStudent('a'), 'TOKEN_REFRESHED'); await flush();
  assert.equal(p.state.rpcCalls.filter(call => call.name === 'student_complete_registration').length, 1); p.close();
});
test('recovery does not automatically complete a saved registration', async () => {
  const p = provider(pendingStudent('a'), { missing: true, registrationState: 'onboarding_required', recoveryMarker: true });
  await flush(); assert.equal(p.h.value.access, 'recovery_required');
  assert(!p.state.rpcCalls?.some(call => call.name === 'student_complete_registration')); p.close();
});
for (const end of ['logout', 'account switch', 'unmount']) test('delayed automatic registration cannot resurrect an account after ' + end, async () => {
  const wait = deferred(); const p = provider(pendingStudent('a'), { missing: true, registrationState: 'onboarding_required' });
  p.state.rpc = name => name === 'student_complete_registration' ? wait.promise : undefined;
  await flush(); assert.equal(p.state.rpcCalls.filter(call => call.name === 'student_complete_registration').length, 1);
  p.emit(pendingStudent('a'), 'TOKEN_REFRESHED'); await flush();
  assert.equal(p.state.rpcCalls.filter(call => call.name === 'student_complete_registration').length, 1);
  let logout;
  if (end === 'logout') logout = p.h.value.signOut();
  else if (end === 'account switch') { p.state.missing = false; p.state.registrationState = 'active'; p.emit(user('b')); await flush(); }
  else p.close();
  wait.resolve(ok({ status: 'completed' })); if (logout) await logout; await flush();
  assert.equal(p.state.updated, undefined);
  if (end === 'logout') { assert.equal(p.h.value.access, 'signed_out'); assert.equal(p.h.value.user, null); }
  if (end === 'account switch') assert.equal(p.h.value.user.id, 'b');
  p.close();
});
test('signup shows required student fields and preserves the draft across a failed submission', async () => {
  const wait = deferred(); let calls = 0, submitted, refreshes = 0;
  const s = screen('src/app/auth.tsx', { access: 'signed_out', catalogue: { retry: () => { refreshes++; } },
    signUp: draft => { calls++; submitted = draft; return wait.promise; } });
  await press(s, 'Create account');
  await enterId(s);
  await enter(s, 'Password, required', 'a'.repeat(15)); await press(s, 'Continue');
  await press(s, 'Continue');
  assert.equal(field(s, 'First name, required').props.error, 'Enter your first name.');
  assert.equal(field(s, 'Last name, required').props.error, 'Enter your last name.');
  await enter(s, 'First name, required', 'Maria');
  await enter(s, 'Middle name, optional', ' Luz ');
  await enter(s, 'Last name, required', 'De la Cruz');
  await enter(s, 'Suffix, optional', 'Jr.');
  await press(s, 'Continue');
  const enrollment = () => s.find(node => node.type === 'EnrollmentFields');
  for (const key of ['course', 'year_level', 'campus', 'section']) {
    enrollment().props.form.change(key, registrationOption[key]); await flush();
  }
  await press(s, 'Continue');
  await enter(s, 'Your goal, required', 'Build habits');
  assert.equal(calls, 0);
  const button = s.button('Create account'); button.props.onPress(); button.props.onPress(); await flush();
  assert.equal(calls, 1); assert.equal(submitted.student_number, studentIdentity.student_number);
  assert.equal(submitted.name, 'Maria Luz De la Cruz Jr.');
  assert.equal(submitted.enrollment.semesterId, registrationOption.semester_id);
  assert.equal(field(s, 'Your goal, required').props.editable, false);
  wait.resolve({ status: 'error', code: 'enrollment_changed', message: 'Choose your section again' }); await flush();
  assert.equal(refreshes, 1); assert.equal(enrollment().props.form.labels.section, '');
  assert.equal(enrollment().props.form.goal, 'Build habits');
  assert.equal(enrollment().props.form.name, 'Maria Luz De la Cruz Jr.'); s.h.unmount();
});
test('onboarding restores saved fields and server feedback for correction', async () => {
  const s = screen('src/app/auth.tsx', { access: 'onboarding_required', registrationDraft: enrolledRegistration,
    registrationError: 'This student ID is unavailable.' });
  await flush(); assert.equal(field(s, 'Student ID, required').props.value, '202311197');
  assert.equal(field(s, 'First name, required').props.value, 'Maria');
  assert.equal(field(s, 'Last name, required').props.value, 'Cruz');
  assert(s.find(node => node.props?.accessibilityRole === 'alert' && node.props.children.includes('This student ID is unavailable.')));
  s.h.unmount();
});
test('ambiguous saved names are shown for review without guessing a surname', async () => {
  const name = 'Maria De la Cruz';
  const s = screen('src/app/auth.tsx', { access: 'onboarding_required',
    registrationDraft: { ...enrolledRegistration, name, existingStudent: true } });
  assert(s.find(node => node.type === 'Text' && node.props.children?.includes(name)));
  assert.equal(field(s, 'Last name, required').props.value, '');
  await enter(s, 'First name, required', 'Maria');
  await enter(s, 'Last name, required', 'De la Cruz');
  await press(s, 'Continue');
  assert.equal(s.find(node => node.type === 'EnrollmentFields').props.form.name, name);
  s.h.unmount();
});
test('unavailable catalogue blocks enrollment and existing IDs cannot be edited in onboarding', async () => {
  const s = screen('src/app/auth.tsx', { access: 'onboarding_required', catalogue: { ready: false, options: [] },
    registrationDraft: { ...enrolledRegistration, existingStudent: true } });
  assert(!field(s, 'Student ID, required'));
  assert.equal(field(s, 'First name, required').props.value, 'Maria');
  assert.equal(field(s, 'Last name, required').props.value, 'Cruz');
  await press(s, 'Continue');
  assert.equal(s.button('Continue').props.disabled, true);
  s.h.unmount();
});
test('shared student fields show just the required ID and optional name', () => {
  const h = hooks();
  let next;
  const { StudentInformationFields } = load('src/components/student-information-fields.tsx', {
    react: h.react, '@/components/mobile-ui': { Field: 'Field' }, '@/lib/student-validation': validation,
  });
  h.mount(() => StudentInformationFields({ value: studentIdentity, errors: {}, onChange: value => { next = value; } }));
  const fields = h.value.props.children;
  assert.equal(fields.length, 2);
  assert.equal(fields[0].props.accessibilityLabel, 'Student ID, required');
  assert.equal(fields[1].props.label, 'Name or nickname (optional)');
  fields[0].props.onChangeText('2023-11198');
  assert.equal(next.student_number, '202311198');
  fields[1].props.onChangeText('');
  assert.equal(next.name, ''); h.unmount();
});

test('registration form preserves edits and requires a new selection after catalogue rollover', async () => {
  const h = hooks(); let options = [registrationOption], draft = enrolledRegistration;
  const mod = load('src/hooks/use-registration-form.ts', { react: h.react, '@/lib/student-validation': validation });
  h.mount(() => mod.useRegistrationForm(draft, options));
  h.value.setNamePart('first', 'Local'); h.value.setNamePart('last', 'Name'); await flush();
  draft = { ...draft, name: 'Remote Name' }; h.render();
  assert.equal(h.value.name, 'Local Name');
  assert.equal(h.value.labels.section, registrationOption.section);
  h.value.change('section', registrationOption.section); await flush();
  options = [{ ...registrationOption, section: '2' }]; h.render();
  assert.equal(h.value.selectionChanged, true);
  assert.equal(h.value.selection, null);
  options = [{ ...registrationOption, id: 'new-option', semester_id: 'new-semester' }]; h.render();
  assert.equal(h.value.selectionChanged, true);
  assert.equal(h.value.selection, null);
  assert.equal(h.value.goal, 'Build habits'); h.unmount();
});

test('profile saves send only the student ID and name', async () => {
  const p = provider(); await flush(); let payload;
  p.state.query = (table, action, value) => {
    if (table === 'students' && action === 'update') { payload = value; return ok({ id: 'a', name: value.name, status: 'Active' }); }
  };
  assert.equal((await p.h.value.updateProfile({ ...registrationDraft.student, name: '' })).success, true);
  assert.deepEqual({ ...payload }, studentIdentity);
  p.close();
});

test('submission exposes empty password feedback without starting Auth', async () => {
  let calls = 0; const s = screen('src/app/auth.tsx', { access: 'signed_out', signIn: async () => { calls++; } });
  await enterId(s);
  await s.button('Sign in').props.onPress(); await flush();
  assert.equal(calls, 0);
  assert(s.find(node => node.props?.accessibilityRole === 'alert' && node.props.children.includes('Enter your password.')));
  s.h.unmount();
});

(async () => {
  for (const { name, fn } of cases) { await fn(); console.log(`PASS ${name}`); }
  console.log(`${cases.length} account access regressions passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
