const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');

// Execute the real TS modules with deterministic service/native mocks. This is
// a small hook lifecycle harness, not a substitute for Android navigation tests.
function hooks() {
  const slots = [];
  let cursor = 0, pending = [], component, output, queued = false, alive = true;
  const same = (a, b) => a && b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
  function render() {
    if (!alive) return;
    cursor = 0;
    output = component();
    const effects = pending; pending = [];
    effects.forEach(fn => fn());
    return output;
  }
  function schedule() {
    if (!alive || queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; render(); });
  }
  const react = {
    createContext: () => ({ Provider: 'provider' }),
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) {
      const i = cursor++;
      if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial };
      const set = value => {
        const next = typeof value === 'function' ? value(slots[i].value) : value;
        if (!Object.is(next, slots[i].value)) { slots[i].value = next; schedule(); }
      };
      return [slots[i].value, set];
    },
    useRef(initial) { const i = cursor++; return slots[i] ?? (slots[i] = { current: initial }); },
    useMemo(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { deps, value: fn() };
      return slots[i].value;
    },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) {
        const previous = slots[i];
        slots[i] = { deps };
        pending.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); });
      }
    },
  };
  react.useLayoutEffect = react.useEffect;
  return {
    react,
    mount(fn) { component = fn; return render(); },
    render,
    get value() { return output?.type === 'provider' ? output.props.value : output; },
    unmount() { alive = false; slots.forEach(slot => slot?.cleanup?.()); },
  };
}
const silentConsole = { ...console, warn() {}, error() {} };
function load(relative, mocks = {}, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports,
    require: name => { if (name in mocks) return mocks[name]; throw new Error(`Unexpected import ${name} in ${relative}`); },
    React: mocks.react, AbortController, console: silentConsole, setTimeout, clearTimeout,
    setInterval: () => 0, clearInterval() {}, ...globals,
  }, { filename: relative });
  return module.exports;
}
const access = load('src/lib/account-access.ts');
const pause = () => new Promise(resolve => setTimeout(resolve, 5));
async function flush() { for (let i = 0; i < 4; i++) await pause(); }
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
const user = id => ({ id, email: `${id}@example.test`, user_metadata: {} });
const quest = { id: 'q1', owner_id: 'a', title: 'Example', status: 'active', category: 'Habits', xp: 20 };
const ok = data => ({ data, error: null });

function provider(initialUser = user('a')) {
  const h = hooks();
  let authCallback;
  const appCallbacks = new Set();
  const state = { session: initialUser ? { user: initialUser } : null, status: 'Active', queries: [], signouts: [], cancellations: 0, authCalls: 0, signupSession: false };
  const emit = (next, event = next ? 'SIGNED_IN' : 'SIGNED_OUT') => {
    state.session = next ? { user: next } : null;
    authCallback(event, state.session);
  };
  const supabase = {
    auth: {
      getSession: async () => { if (state.sessionError) throw new Error('Storage unavailable'); return { data: { session: state.session }, error: null }; },
      signInWithPassword: async () => { state.authCalls++; if (state.authError) return { error: new Error(state.authError) }; emit(user('a')); return { error: null }; },
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
      for (const name of ['select', 'eq', 'neq', 'order']) query[name] = () => query;
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
    rpc: async name => {
      if (state.rpc) { const result = state.rpc(name); if (result !== undefined) return result; }
      return ok(name === 'student_list_recommendation_candidates' ? [quest] : name === 'student_get_current_streak' ? 0 : []);
    },
    storage: { from: () => ({ remove: async () => ok(null) }) },
  };
  const notifications = {
    COMPLETE_QUEST_ACTION: 'complete', configureQuestNotifications: async () => {
      if (state.notificationError) throw new Error('Native notifications unavailable');
      return false;
    },
    scheduleQuestNotifications: async () => {},
    cancelQuestNotifications: async () => { state.cancellations++; if (state.cancelError) throw new Error('Native cleanup failed'); },
  };
  const mod = load('src/context/user-data-context.tsx', {
    react: h.react,
    'react-native': { AppState: { currentState: 'active', addEventListener: (_, fn) => { appCallbacks.add(fn); return { remove() { appCallbacks.delete(fn); } }; } } },
    '@/supabase': { supabase }, '@/lib/account-access': access,
    'expo-notifications': { addPushTokenListener: () => { if (state.listenerError) throw new Error('Native listener failure'); return { remove() { if (state.listenerCleanupError) throw new Error('Native listener removal failure'); } }; } },
    '@/lib/quest-notifications': notifications,
  }, { setInterval: (fn, delay) => { if (delay === 60_000) state.poll = fn; return 0; } });
  h.mount(() => mod.UserDataProvider({ children: null }));
  return { h, state, emit, resume: () => [...appCallbacks].forEach(fn => fn('active')), close: () => h.unmount() };
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
  assert.equal(denied.status, 'authenticated');
  assert.equal(p.h.value.access, 'blocked');
  p.state.status = 'Active';
  const admitted = await p.h.value.signIn('a@example.test', 'password'); await flush();
  assert.equal(admitted.status, 'authenticated');
  assert.equal(p.h.value.access, 'active');
  p.state.authError = 'Invalid login credentials';
  const failed = await p.h.value.signIn('a@example.test', 'wrong');
  assert.equal(failed.status, 'error');
  assert.equal(failed.message, 'Invalid login credentials');
  p.state.authError = null;
  assert.equal((await p.h.value.signUp('a@example.test', 'password', { name: 'Student' }, 'beebetter://auth')).status, 'confirmation_required');
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
  assert.equal((await p.h.value.signIn('a@example.test', 'password')).status, 'authenticated');
  p.close();
});
test('successful logout clears access and allows a later login', async () => {
  const p = provider(); await flush();
  assert.equal((await p.h.value.signOut()).status, 'signed_out'); await flush();
  assert.equal(p.h.value.access, 'signed_out');
  assert.equal((await p.h.value.signIn('a@example.test', 'password')).status, 'authenticated'); await flush();
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
test('native notification initialization rejection is contained', async () => {
  const p = provider(); p.state.notificationError = true; await flush();
  assert.equal(p.h.value.access, 'active'); p.close();
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
  const layout = load('src/app/_layout.tsx', {
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
  for (currentAccess of ['checking', 'signed_out', 'blocked', 'verification_error']) assert.deepEqual(routes(layout.default()), ['auth']);
  currentAccess = 'active';
  const privateRoutes = routes(layout.default());
  assert(privateRoutes.includes('(tabs)')); assert(privateRoutes.includes('add-quest'));
  assert(privateRoutes.includes('support-requests')); assert(!privateRoutes.includes('auth'));
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
    'react-native': { Platform: { OS: 'android' } },
    'expo-notifications': {
      setNotificationHandler() {}, setNotificationChannelAsync: async () => {}, registerTaskAsync: async () => {},
      getPermissionsAsync: async () => ({ granted: true }), setNotificationCategoryAsync: async () => {},
      AndroidImportance: { DEFAULT: 1 }, getExpoPushTokenAsync: async () => ({ data: 'ExpoPushToken[test]' }),
      getAllScheduledNotificationsAsync: async () => [], cancelAllScheduledNotificationsAsync: async () => {}, dismissAllNotificationsAsync: async () => {},
    },
  });
  await notifications.configureQuestNotifications();
  const task = notifications.scheduleQuestNotifications([quest]);
  await flush();
  const cleanup = notifications.cancelQuestNotifications();
  wait.resolve(); await Promise.all([task, cleanup]);
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
for (const failure of ['listenerError', 'listenerCleanupError']) test(failure + ' cannot crash admission or logout', async () => {
  const p = provider(); p.state[failure] = true; await flush();
  assert.equal(p.h.value.access, 'active');
  await p.h.value.signOut(); await flush();
  assert.equal(p.h.value.access, 'signed_out'); p.close();
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

(async () => {
  for (const { name, fn } of cases) { await fn(); console.log(`PASS ${name}`); }
  console.log(`${cases.length} account access regressions passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
