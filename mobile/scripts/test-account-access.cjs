const assert = require('node:assert/strict');
const { hooks, load } = require('./test-harness.cjs');
const access = load('src/lib/account-access.ts');
const authFlow = load('src/lib/auth-flow.ts');
const validation = load('src/lib/student-validation.ts');
const pause = () => new Promise(resolve => setTimeout(resolve, 5));
async function flush() { for (let i = 0; i < 4; i++) await pause(); }
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
const user = id => ({ id, email: `${id}@example.test`, user_metadata: {} });
const quest = { id: 'q1', owner_id: 'a', title: 'Example', status: 'active', category: 'Habits', xp: 20 };
const ok = data => ({ data, error: null });

function provider(initialUser = user('a'), initialState = {}) {
  const h = hooks();
  let authCallback;
  const appCallbacks = new Set();
  const state = { session: initialUser ? { user: initialUser } : null, status: 'Active', queries: [], signouts: [], cancellations: 0, authCalls: 0, signupSession: false, ...initialState };
  const emit = (next, event = next ? 'SIGNED_IN' : 'SIGNED_OUT') => {
    state.session = next ? { user: next } : null;
    authCallback(event, state.session);
  };
  const supabase = {
    auth: {
      startAutoRefresh: () => { state.refreshStarts = (state.refreshStarts || 0) + 1; }, stopAutoRefresh: () => { state.refreshStops = (state.refreshStops || 0) + 1; },
      resetPasswordForEmail: async (email, options) => { state.reset = { email, options }; return { error: null }; },
      updateUser: async input => { state.updated = input; return { error: state.updateError || null }; },
      exchangeCodeForSession: async code => { state.exchange = code; emit(user('a')); return { error: state.exchangeError || null }; },
      setSession: async tokens => { state.tokens = tokens; emit(user('a')); return { error: null }; },
      getSession: async () => { if (state.sessionError) throw new Error('Storage unavailable'); return { data: { session: state.session }, error: null }; },
      signInWithPassword: async () => { state.authCalls++; if (state.loginWait) await state.loginWait.promise; if (state.authError) return { error: typeof state.authError === 'string' ? new Error(state.authError) : state.authError }; emit(user('a')); return { error: null }; },
      signUp: async () => { state.authCalls++; if (state.authError) return { data: { session: null }, error: new Error(state.authError) }; if (state.signupSession) emit(user('a')); return { data: { session: state.signupSession ? { user: user('a') } : null }, error: null }; },
      resend: async () => { state.resendCalls = (state.resendCalls || 0) + 1; return state.authError ? { error: new Error(state.authError) } : { error: null }; },
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
          return ok(state.missing ? null : { id: state.session?.user.id, name: 'Student', status: state.status });
        }
        if (table === 'profiles') return ok({ display_name: 'Student', total_xp: 0 });
        return ok(null);
      };
      query.maybeSingle = query.single = run;
      query.then = (resolve, reject) => run().then(resolve, reject);
      return query;
    },
    rpc: (name, args) => { const task = (async () => {
      state.rpcCalls ??= []; state.rpcCalls.push({ name, args });
      if (state.rpc) { const result = state.rpc(name); if (result !== undefined) return result; }
      return ok(name === 'student_list_recommendation_candidates' ? [quest] : name === 'student_get_current_streak' ? 0 : name === 'student_get_registration_state' ? (state.registrationState || (state.missing ? 'unavailable' : 'active')) : []);
    })(); task.abortSignal = () => task; return task; },
    storage: { from: () => ({
      upload: async (path, bytes, options) => { state.uploads ??= []; state.uploads.push({ path, bytes, options }); return state.upload ? state.upload() : ok(null); },
      remove: async paths => { state.removals ??= []; state.removals.push(paths); return ok(null); },
    }) },
  };
  const notifications = {
    startQuestNotificationLifetime: (ownerId, isCurrent) => {
      state.notificationLifetimes ??= []; state.notificationLifetimes.push({ ownerId, isCurrent });
      return () => { state.notificationStops = (state.notificationStops || 0) + 1; };
    },
    cancelQuestNotifications: async () => { state.cancellations++; if (state.cancelWait) await state.cancelWait.promise; if (state.cancelError) throw new Error('Native cleanup failed'); },
  };
  const mod = load('src/context/user-data-context.tsx', {
    react: h.react,
    'expo-linking': { createURL: (path, options) => 'beebetter://' + path + (options.queryParams ? '?flow=recovery' : ''), getInitialURL: async () => state.initialUrl || null, addEventListener: (_, fn) => { state.link = fn; return { remove() {} }; } },
    '@/lib/auth-flow': authFlow, '@/lib/student-validation': validation,
    '@/lib/student-workspace': load('src/lib/student-workspace.ts', {}),
    '@/lib/quest-completion': load('src/lib/quest-completion.ts'),
    '@/lib/quest-completion-adapter': load('src/lib/quest-completion-adapter.ts', {}, { fetch: async uri => ({ arrayBuffer: async () => state.readProof ? state.readProof(uri) : new ArrayBuffer(2) }) }),
    'react-native': { Platform: { OS: 'android' }, AppState: { currentState: 'active', addEventListener: (_, fn) => { appCallbacks.add(fn); return { remove() { appCallbacks.delete(fn); } }; } } },
    '@/supabase': { supabase, authRecoveryStorage: { get: async () => state.recoveryMarker, set: async () => { state.recoveryMarker = true; }, clear: async () => { state.recoveryMarker = false; } } }, '@/lib/account-access': access,
    '@/lib/quest-notifications': notifications,
  }, { setInterval: (fn, delay) => { if (delay === 60_000) state.poll = fn; return 0; } });
  h.mount(() => mod.UserDataProvider({ children: null }));
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
test('context owns login, signup, and confirmation resend operations', async () => {
  const p = provider(null); await flush();
  p.state.status = 'Inactive';
  const denied = await p.h.value.signIn('a@example.test', 'password'); await flush();
  assert.equal(denied.status, 'session_created');
  assert.equal(p.h.value.access, 'blocked');
  p.state.status = 'Active';
  const admitted = await p.h.value.signIn('a@example.test', 'password'); await flush();
  assert.equal(admitted.status, 'session_created');
  assert.equal(p.h.value.access, 'active');
  p.state.authError = 'Invalid login credentials';
  const failed = await p.h.value.signIn('a@example.test', 'wrong');
  assert.equal(failed.status, 'error');
  assert.equal(failed.message, 'Invalid login credentials');
  p.state.authError = null;
  assert.equal((await p.h.value.signUp('a@example.test', 'a'.repeat(15), { name: 'Student' }, 'beebetter://auth')).status, 'confirmation_required');
  assert.equal((await p.h.value.resendConfirmation('a@example.test', 'beebetter://auth')).status, 'completed');
  assert.equal(p.state.resendCalls, 1);
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
  assert.equal((await p.h.value.signIn('a@example.test', 'password')).status, 'error');
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
  assert.equal((await p.h.value.signIn('a@example.test', 'password')).status, 'error');
  p.state[failure] = false; await p.h.value.signOut(); await flush();
  assert.equal(p.h.value.access, 'signed_out');
  assert.equal((await p.h.value.signIn('a@example.test', 'password')).status, 'session_created');
  p.close();
});
test('successful logout clears access and allows a later login', async () => {
  const p = provider(); await flush();
  assert.equal((await p.h.value.signOut()).status, 'signed_out'); await flush();
  assert.equal(p.h.value.access, 'signed_out');
  assert.equal((await p.h.value.signIn('a@example.test', 'password')).status, 'session_created'); await flush();
  assert.equal(p.h.value.access, 'active');
  p.close();
});
test('logout with no session is safe and notification cleanup failure is independent', async () => {
  const p = provider(null); await flush(); p.state.cancelError = true;
  await p.h.value.signOut(); await flush();
  assert.equal(p.h.value.access, 'signed_out');
  assert.equal(p.h.value.isSigningOut, false);
  p.close();
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
  p.state.rpc = name => { if (name === 'complete_quest') { completions++; return ok(null); } };
  assert.equal((await p.h.value.completeQuest('new-quest')).success, true);
  assert.equal(completions, 1); assert.ok(p.state.queries.includes('quests:select')); p.close();
});
test('missing or proof-required uncached quests do not dispatch completion', async () => {
  const p = provider(); await flush(); let completions = 0;
  p.state.rpc = name => { if (name === 'complete_quest') { completions++; return ok(null); } };
  assert.equal((await p.h.value.completeQuest('foreign-quest')).success, false);
  p.state.query = table => table === 'quests' ? ok({ status: 'active', requires_proof: true }) : undefined;
  assert.match((await p.h.value.completeQuest('proof-quest')).error, /proof/);
  assert.equal(completions, 0); p.close();
});
test('logout during an uncached quest lookup prevents completion', async () => {
  const p = provider(); await flush(); const wait = deferred(); let completions = 0;
  p.state.query = table => table === 'quests' ? wait.promise : undefined;
  p.state.rpc = name => { if (name === 'complete_quest') { completions++; return ok(null); } };
  const completing = p.h.value.completeQuest('new-quest'); await p.h.value.signOut();
  wait.resolve(ok({ status: 'active', requires_proof: false }));
  assert.equal((await completing).success, false); assert.equal(completions, 0); p.close();
});
test('completion finishing after logout does not trigger another user load', async () => {
  const p = provider(); await flush(); const wait = deferred();
  p.state.rpc = name => name === 'complete_quest' ? wait.promise : undefined;
  const complete = p.h.value.completeQuest('q1'); await p.h.value.signOut();
  const count = p.state.queries.length;
  wait.resolve(ok(null)); await complete; await flush();
  assert.equal(p.state.queries.length, count); assert.equal(p.h.value.user, null); p.close();
});

test('duplicate completion is blocked while pending and a failed quest can retry', async () => {
  const p = provider(); await flush(); const wait = deferred();
  p.state.rpc = name => name === 'complete_quest' ? wait.promise : undefined;
  const first = p.h.value.completeQuest('q1');
  assert.match((await p.h.value.completeQuest('q1')).error, /already being completed/);
  wait.resolve({ error: { message: 'Offline' } }); assert.equal((await first).success, false);
  p.state.rpc = undefined; assert.equal((await p.h.value.completeQuest('q1')).success, true); p.close();
});
test('different quests complete independently and completed targets bypass dispatch', async () => {
  const p = provider(); await flush(); const wait = deferred();
  p.state.query = table => table === 'quests' ? ok({ status: 'active', requires_proof: false }) : undefined;
  let calls = 0; p.state.rpc = name => name === 'complete_quest' ? (++calls === 1 ? wait.promise : ok(null)) : undefined;
  const first = p.h.value.completeQuest('q1'); assert.equal((await p.h.value.completeQuest('other')).success, true);
  wait.resolve(ok(null)); assert.equal((await first).success, true);
  p.state.query = table => table === 'quests' ? ok({ status: 'completed', requires_proof: true }) : undefined;
  assert.equal((await p.h.value.completeQuest('done')).success, true); assert.equal(calls, 2); p.close();
});
test('proof success uploads once and force-refreshes authoritative workspace slices', async () => {
  const p = provider(); await flush(); const count = p.state.rpcCalls.length;
  assert.equal((await p.h.value.completeQuest('q1', { uri: 'file:///proof.jpg', name: 'proof.jpg', mimeType: 'image/jpeg' })).success, true);
  assert.equal(p.state.uploads.length, 1); assert.equal(p.state.removals, undefined);
  const calls = p.state.rpcCalls.slice(count).map(call => call.name);
  assert.equal(calls.filter(name => name === 'complete_quest').length, 1);
  assert(calls.includes('student_list_recommendation_candidates')); assert(calls.includes('student_list_completion_history')); p.close();
});
for (const phase of ['readProof', 'upload']) test('logout during proof ' + phase + ' prevents RPC dispatch', async () => {
  const p = provider(); await flush(); const wait = deferred(); p.state[phase] = () => wait.promise;
  const task = p.h.value.completeQuest('q1', { uri: 'file:///proof.jpg', name: 'proof.jpg', mimeType: 'image/jpeg' });
  await flush(); await p.h.value.signOut(); wait.resolve(phase === 'readProof' ? new ArrayBuffer(2) : ok(null));
  assert.equal((await task).error, 'Session ended.');
  assert(!p.state.rpcCalls.some(call => call.name === 'complete_quest')); assert.equal(p.state.removals, undefined); p.close();
});
test('old completion cannot release the new account duplicate guard or reload it', async () => {
  const p = provider(); await flush(); const oldWait = deferred(), nextWait = deferred(); let calls = 0;
  p.state.rpc = name => name === 'complete_quest' ? (++calls === 1 ? oldWait.promise : nextWait.promise) : undefined;
  const oldTask = p.h.value.completeQuest('q1'); p.emit(user('b')); await flush();
  const nextTask = p.h.value.completeQuest('q1'); const queryCount = p.state.queries.length;
  oldWait.resolve(ok(null)); assert.equal((await oldTask).error, 'Session ended.'); await flush();
  assert.equal(p.state.queries.length, queryCount); assert.equal(p.h.value.user.id, 'b');
  assert.match((await p.h.value.completeQuest('q1')).error, /already being completed/);
  nextWait.resolve(ok(null)); assert.equal((await nextTask).success, true); p.close();
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
  const features = load('src/constants/features.ts');
  const layout = load('src/app/_layout.tsx', {
    '@/constants/features': features,
    react, 'expo-router': { Stack: stack, ThemeProvider: pass },
    'expo-splash-screen': { preventAutoHideAsync: async () => {} },
    'react-native': { useColorScheme: () => 'light', Platform: { OS: 'android' } },
    '@/components/quest-notification-response': { QuestNotificationResponse: () => null },
    '@/components/animated-icon': { AnimatedSplashOverlay: () => null },
    '@/context/user-data-context': { UserDataProvider: pass, useUserData: () => ({ access: currentAccess }) },
    '@/context/location-context': { LocationProvider: pass },
    '@/context/quest-priority-context': { QuestPriorityProvider: pass },
  });
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
  assert.deepEqual(privateRoutes, ['(tabs)', 'notifications', 'add-quest', 'manage-locations']);
  // Retained screens can return after a product decision, still behind admission.
  features.MOBILE_WELLNESS_AND_SUPPORT_ENABLED = true;
  assert(routes(layout.default()).includes('support-requests'));
  currentAccess = 'signed_out';
  assert.deepEqual(routes(layout.default()), ['auth']);
});

test('logout revokes a push registration already in flight', async () => {
  const wait = deferred(); let stored = null; const calls = [];
  const notifications = load('src/lib/quest-notifications.ts', {
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
    '@react-native-async-storage/async-storage': {}, 'expo-notifications': {}, '@/supabase': {}, '@/lib/quest-notifications': {},
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
    '@/lib/quest-priority': { distanceMeters: () => 0 },
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
  await p.h.value.signIn('a@example.test', 'password'); await flush();
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
    '@/hooks/use-user-data': { useUserData: () => ({ user: currentUser }) },
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
  let starts = 0, stops = 0, unregisters = 0, clears = 0;
  const refresh = () => currentUser ? wait.promise : Promise.resolve();
  const start = async () => { starts++; };
  const stop = async () => { stops++; throw new Error('Native removal failure'); };
  const mod = load('src/context/location-context.tsx', {
    react: h.react, 'expo-location': {},
    'react-native': { AppState: { currentState: 'background', addEventListener: () => ({ remove() {} }) } },
    '@/hooks/use-user-locations': { useUserLocations: () => ({ user: currentUser, locations: [], activeLocations: [], fetchLocations: refresh }) },
    '@/hooks/use-current-location': { useCurrentLocation: () => ({ startTracking: start, stopTracking: stop }) },
    '@/hooks/use-geofencing': { unregisterAllGeofences: async () => { unregisters++; }, syncGeofences: async () => {} },
    '@/lib/geofence-events': { clearGeofenceEvents: async () => { clears++; throw new Error('Storage unavailable'); } },
  });
  h.mount(() => mod.LocationProvider({ children: null })); await flush();
  currentUser = null; h.render(); wait.resolve(); await flush();
  assert.equal(starts, 0); assert(stops > 0); assert(unregisters > 0); assert(clears > 0); h.unmount();
});
for (const foreground of ['denied', 'granted']) test('foreground ' + foreground + ' with background denied remains safe', async () => {
  const h = hooks(); let starts = 0, removals = 0;
  const mod = load('src/hooks/use-current-location.ts', {
    react: h.react, 'react-native': { Platform: { OS: 'android' } },
    '@/lib/quest-priority': { distanceMeters: () => 0 },
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
  const login = p.h.value.signIn('a@example.test', 'legacy'); await pause();
  const logout = p.h.value.signOut(); let settled = false; logout.then(() => { settled = true; });
  await flush(); assert.equal(settled, false); assert.equal(p.h.value.user, null);
  p.state.loginWait.resolve(); assert.equal((await login).code, 'operation_cancelled'); await logout; await flush();
  assert.equal(p.state.session, null); assert.equal(p.h.value.access, 'signed_out'); p.close();
});
test('structured unconfirmed failures and returning-account resend remain available', async () => {
  const p = provider(null); await flush(); p.state.authError = { code: 'email_not_confirmed', message: 'Localized text' };
  const result = await p.h.value.signIn('returning@example.test', 'legacy');
  assert.equal(result.code, 'email_not_confirmed'); p.state.authError = null;
  assert.equal((await p.h.value.resendConfirmation('returning@example.test')).status, 'completed'); p.close();
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
test('confirmed incomplete registrations restore onboarding and submit explicit identities', async () => {
  const p = provider(); p.state.missing = true; p.state.registrationState = 'onboarding_required'; await flush();
  assert.equal(p.h.value.access, 'onboarding_required'); assert.equal(p.h.value.user, null);
  p.state.rpc = name => { if (name === 'student_complete_registration') { p.state.missing = false; p.state.registrationState = 'active'; return ok({ status: 'completed' }); } };
  const result = await p.h.value.completeRegistration({ name: 'Student', studentNumber: '2026-12345', goal: 'Build habits', semesterId: 'semester', enrollmentOptionId: 'option' });
  assert.equal(result.status, 'completed'); await flush(); assert.equal(p.h.value.access, 'active');
  const call = p.state.rpcCalls.find(x => x.name === 'student_complete_registration');
  assert.equal(call.args.semester_id_value, 'semester'); assert.equal(call.args.enrollment_option_id_value, 'option'); p.close();
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
  p.state.query = null; wait.resolve(ok({ id: 'a', name: 'Student', status: 'Active' })); await Promise.all([first, second]); await flush();
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
test('new signup is gated by the additive contract and enforces new-password policy', async () => {
  const p = provider(null); await flush(); assert.equal((await p.h.value.signUp('a@example.test', 'short')).code, 'weak_password');
  p.state.rpc = name => name === 'registration_enrollment_options_v2' ? { data: null, error: { code: 'PGRST202' } } : undefined;
  assert.equal((await p.h.value.signUp('a@example.test', 'a'.repeat(15))).code, 'registration_unavailable'); assert.equal(p.state.authCalls, 0); p.close();
});


function screen(relative, context, options = []) {
  context = { isAuthBusy: false, isSigningOut: false, ...context };
  const h = hooks(); const native = Object.fromEntries(['ActivityIndicator','KeyboardAvoidingView','TextInput','TouchableOpacity','View','ScrollView'].map(x => [x,x]));
  native.Platform = { OS: 'web' }; native.StyleSheet = { create: x => x };
  const enrollment = { options, loading: false, error: null, retry() {} };
  const mod = load(relative, { react: h.react, 'react-native': native,
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' }, '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/hooks/use-user-data': { useUserData: () => context }, '@/components/themed-text': { ThemedText: 'Text' },
    '@/components/student-onboarding': { StudentOnboarding: 'Onboarding' }, '@/components/student-information-fields': { StudentInformationFields: 'Fields' },
    '@/hooks/use-enrollment-options': { useEnrollmentOptions: () => enrollment }, '@/lib/student-validation': validation,
    '@/constants/theme': { Fonts: { sans: 'sans-serif' }, BeeBetterColors: {}, Radii: {}, BeeBetterShadow: {}, useBeePalette: () => ({}), useBeeStyles: factory => factory({}) },
    '@/components/mobile-ui': { Button: 'ActionButton', Field: 'Field' },
    '@/components/bee-visuals': { BeeMark: 'BeeMark' },
  });
  h.mount(() => relative.endsWith('auth.tsx') ? mod.default() : mod.StudentOnboarding());
  const nodes = value => !value || typeof value !== 'object' ? [] : Array.isArray(value) ? value.flatMap(nodes) : [value, ...nodes(value.props?.children)];
  const text = node => !node ? '' : typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : text(node.props?.children);
  return { h, enrollment, find: predicate => nodes(h.value).find(predicate), button: label => nodes(h.value).find(x => x.type === 'ActionButton' && x.props.label === label) || nodes(h.value).find(x => x.type === 'TouchableOpacity' && text(x) === label) };
}
test('Auth UI captures unconfirmed recipient even when email is edited', async () => {
  let recipient; const context = { access: 'signed_out', signIn: async () => ({ status: 'error', code: 'email_not_confirmed', message: 'Confirm email' }), resendConfirmation: async email => { recipient = email; return { status: 'completed' }; } };
  const s = screen('src/app/auth.tsx', context); const input = () => s.find(x => x.props?.accessibilityLabel === 'Email address, required');
  input().props.onChangeText('first@example.test'); s.find(x => x.props?.accessibilityLabel === 'Password, required').props.onChangeText('old'); await flush();
  await s.button('Sign in').props.onPress(); await flush();
  input().props.onChangeText('second@example.test'); await flush(); await s.button('Resend').props.onPress(); await flush(); assert.equal(recipient, 'first@example.test'); s.h.unmount();
});
test('pending Auth UI prevents duplicate requests and mode changes', async () => {
  const wait = deferred(); let requests = 0; const s = screen('src/app/auth.tsx', { access: 'signed_out', signIn: () => { requests++; return wait.promise; } });
  s.find(x => x.props?.accessibilityLabel === 'Email address, required').props.onChangeText('first@example.test');
  s.find(x => x.props?.accessibilityLabel === 'Password, required').props.onChangeText('old'); await flush();
  const submit = s.button('Sign in');
  submit.props.onPress(); submit.props.onPress(); await flush(); assert.equal(requests, 1); assert.equal(s.find(x => x.type === 'TouchableOpacity' && x.props.accessibilityState?.selected === false).props.disabled, true);
  wait.resolve({ status: 'error', code: 'network_error', message: 'Retry' }); await flush(); s.h.unmount();
});
test('onboarding preserves explicit semester identity and requires reselection after rollover', async () => {
  let submitted; const option = { id: 'option-a', semester_id: 'semester-a', academic_year: '2026-2027', term: 'First', course: 'BSCS', year_level: '4th Year', campus: 'Bacoor', section: '1' };
  const s = screen('src/components/student-onboarding.tsx', { registrationEmail: 'a@example.test', completeRegistration: async input => { submitted = input; return { status: 'error', code: 'network_error', message: 'Retry' }; } }, [option]);
  const draft = { name: 'Maria Cruz', student_number: '202311197', goal: 'Build habits', course: 'BSCS', year_level: '4th Year', campus: 'Bacoor', section: '1' };
  s.find(x => x.type === 'Fields').props.onChange(draft, 'section'); await flush();
  assert.equal(s.button('Complete registration').props.disabled, false); await s.button('Complete registration').props.onPress(); await flush();
  assert.equal(submitted.semesterId, 'semester-a'); assert.equal(s.find(x => x.type === 'Fields').props.value.name, 'Maria Cruz');
  s.enrollment.options = [{ ...option, id: 'option-b', semester_id: 'semester-b' }]; s.h.render(); assert.equal(s.button('Complete registration').props.disabled, true);
  s.find(x => x.type === 'Fields').props.onChange(draft, 'section'); await flush(); await s.button('Complete registration').props.onPress(); await flush();
  assert.equal(submitted.semesterId, 'semester-b'); assert.equal(submitted.enrollmentOptionId, 'option-b'); s.h.unmount();
});

(async () => {
  for (const { name, fn } of cases) { await fn(); console.log(`PASS ${name}`); }
  console.log(`${cases.length} account access regressions passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
