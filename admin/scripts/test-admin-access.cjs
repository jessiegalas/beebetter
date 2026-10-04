const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');

function hookHarness() {
  const slots = [];
  let cursor = 0, effects = [], component, value, queued = false;
  const equalDeps = (a, b) => a && b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
  const render = () => {
    cursor = 0;
    value = component();
    const todo = effects;
    effects = [];
    todo.forEach(effect => effect());
    return value;
  };
  const schedule = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; render(); });
  };
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
      const set = next => {
        const result = typeof next === 'function' ? next(slots[index].value) : next;
        if (!Object.is(result, slots[index].value)) { slots[index].value = result; schedule(); }
      };
      return [slots[index].value, set];
    },
    useRef(initial) { const index = cursor++; return slots[index] ?? (slots[index] = { current: initial }); },
    useCallback(fn, deps) {
      const index = cursor++;
      if (!slots[index] || !equalDeps(slots[index].deps, deps)) slots[index] = { deps, value: fn };
      return slots[index].value;
    },
    useEffect(fn, deps) {
      const index = cursor++;
      if (!slots[index] || !equalDeps(slots[index].deps, deps)) {
        const previous = slots[index];
        slots[index] = { deps };
        effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = fn(); });
      }
    },
  };
  return { react, mount(fn) { component = fn; return render(); }, render, unmount() { slots.forEach(slot => slot?.cleanup?.()); }, get value() { return value; } };
}
const pause = () => new Promise(resolve => setTimeout(resolve, 5));
async function flush() { for (let i = 0; i < 5; i++) await pause(); }
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
const user = id => ({ id, email: id + '@example.test', user_metadata: { display_name: id } });
const ok = data => ({ data, error: null });

function provider(initial = null) {
  const h = hookHarness();
  let authCallback;
  const handlers = { focus: new Set(), visibilitychange: new Set(), interval: new Set() };
  const state = { session: initial ? { user: initial } : null, roles: {}, requests: {}, profiles: {}, requestsQueried: 0, signUpOptions: null, signOutError: null, sessionError: null, sessionWait: null, sessionReads: 0, accessWait: null };
  const emit = session => { state.session = session ? { user: session } : null; authCallback('SIGNED_IN', state.session); };
  const supabase = {
    auth: {
      getSession: async () => { state.sessionReads++; return state.sessionWait ? state.sessionWait.promise : { data: { session: state.session }, error: state.sessionError }; },
      onAuthStateChange: fn => { authCallback = fn; return { data: { subscription: { unsubscribe() {} } } }; },
      signInWithPassword: async () => ({ error: null }),
      signUp: async args => { state.signUpOptions = args.options; return { data: { session: null }, error: null }; },
      signOut: async () => ({ error: state.signOutError }),
    },
    rpc: async name => {
      if (name === 'admin_get_my_role') {
        const configured = state.roles[state.session?.user.id];
        if (configured?.wait) return configured.wait.promise;
        if (configured?.error) return { data: null, error: configured.error };
        return ok(configured ? [configured] : []);
      }
      if (name === 'admin_request_access') return state.accessWait ? state.accessWait.promise : { error: null };
      throw new Error('Unexpected RPC ' + name);
    },
    from: table => {
      let id;
      const query = {
        select: () => query,
        eq: (_column, value) => { id = value; return query; },
        order: () => query,
        limit: () => query,
        maybeSingle: async () => {
          if (table === 'profiles') return ok(state.profiles[id] ?? null);
          state.requestsQueried++;
          return ok(state.requests[id] ?? null);
        },
      };
      return query;
    },
  };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', 'src/admin-access.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports,
    require: name => name === 'react' ? h.react : name === './supabase' ? { supabase } : name === './osas-data' ? { getMyOsasPermissions: async () => { const active = state.roles[state.session?.user.id]?.is_active === true; return { can_view_aggregates: active, can_manage_support_requests: active, is_active: active }; } } : {},
    window: { setInterval: fn => { handlers.interval.add(fn); return fn; }, clearInterval: fn => handlers.interval.delete(fn), addEventListener: (name, fn) => handlers[name]?.add(fn), removeEventListener: (name, fn) => handlers[name]?.delete(fn) },
    document: { visibilityState: 'visible', addEventListener: (name, fn) => handlers[name]?.add(fn), removeEventListener: (name, fn) => handlers[name]?.delete(fn) },
  });
  h.mount(() => module.exports.useAdminAccess());
  return { h, state, emit, automaticCheck: name => handlers[name].forEach(fn => fn()) };
}

async function main() {
  const signedOut = provider();
  await flush();
  const restoreReads = signedOut.state.sessionReads;
  signedOut.state.sessionWait = deferred();
  for (const trigger of ['focus', 'visibilitychange', 'interval']) {
    signedOut.automaticCheck(trigger); await flush();
    assert.equal(signedOut.h.value.phase, 'signed_out', trigger + ' must keep the login/signup form mounted');
    assert.equal(signedOut.state.sessionReads, restoreReads, trigger + ' must skip a signed-out session lookup');
  }
  signedOut.h.unmount();

  const automatic = provider(user('automatic'));
  automatic.state.roles.automatic = { role: 'admin', is_active: true };
  await flush();
  const automaticRole = deferred();
  automatic.state.roles.automatic = { wait: automaticRole };
  automatic.automaticCheck('focus'); await flush();
  assert.equal(automatic.h.value.phase, 'active', 'Automatic checks still preserve the signed-in workspace');
  automaticRole.resolve(ok([{ role: 'admin', is_active: false }])); await flush();
  assert.equal(automatic.h.value.phase, 'denied', 'Automatic checks still enforce revoked access');
  assert.equal(automatic.h.value.role, null);
  automatic.h.unmount();

  const denied = provider(user('requester'));
  denied.state.requests.requester = { id: 'req-1', status: 'pending', submitted_at: '2026-01-01T00:00:00Z' };
  await flush();
  assert.equal(denied.h.value.phase, 'denied');
  assert.equal(denied.h.value.accessRequest.status, 'pending');

  const inactive = provider(user('inactive'));
  inactive.state.roles.inactive = { role: 'admin', is_active: false };
  await flush();
  assert.equal(inactive.h.value.phase, 'denied');
  assert.equal(inactive.h.value.adminManaged, true);
  assert.equal(inactive.state.requestsQueried, 0);

  const failed = provider(user('broken'));
  failed.state.roles.broken = { error: new Error('Role lookup offline') };
  await flush();
  assert.equal(failed.h.value.phase, 'error');
  assert.equal(failed.h.value.error, 'Role lookup offline');

  const switching = provider();
  await flush();
  const oldRole = deferred();
  switching.state.roles.old = { wait: oldRole };
  switching.emit(user('old'));
  await pause();
  switching.state.roles.new = { role: 'admin', is_active: true };
  switching.emit(user('new'));
  await flush();
  assert.equal(switching.h.value.phase, 'active');
  assert.deepEqual(JSON.parse(JSON.stringify(switching.h.value.osasPermissions)), { can_view_aggregates: true, can_manage_support_requests: true, is_active: true });
  assert.equal(switching.h.value.identity.email, 'new@example.test');
  assert.equal(switching.h.value.identity.id, 'new');
  oldRole.resolve(ok([]));
  await flush();
  assert.equal(switching.h.value.phase, 'active');
  assert.equal(switching.h.value.identity.email, 'new@example.test');

  const profileName = provider(user('profile-name'));
  profileName.state.roles['profile-name'] = { role: 'admin', is_active: true };
  profileName.state.profiles['profile-name'] = { display_name: 'Taylor Administrator' };
  await flush();
  assert.equal(profileName.h.value.identity.name, 'Taylor Administrator');
  assert.equal(profileName.h.value.identity.id, 'profile-name');

  const signup = provider();
  await flush();
  await signup.h.value.signUp('New Admin', 'new@example.test', 'password');
  assert.equal(signup.state.signUpOptions.data.signup_intent, 'admin_access_request');
  signup.emit(user('signup'));
  await flush();
  assert.equal((await signup.h.value.requestAccess()).success, true);
  assert.equal(signup.h.value.accessRequest.status, 'pending');

  const refreshing = provider(user('verified'));
  refreshing.state.roles.verified = { role: 'super_admin', is_active: true };
  refreshing.state.profiles.verified = { display_name: 'Verified Admin' };
  await flush();
  assert.equal(refreshing.h.value.osasPermissions.can_view_aggregates, true);
  assert.equal(refreshing.h.value.osasPermissions.can_manage_support_requests, true);
  const delayedRefresh = deferred();
  refreshing.state.roles.verified = { wait: delayedRefresh };
  const refresh = refreshing.h.value.refresh();
  await flush();
  assert.equal(refreshing.h.value.phase, 'active', 'Background verification must preserve the mounted workspace');
  assert.equal(refreshing.h.value.role, 'super_admin');
  assert.equal(refreshing.h.value.identity.name, 'Verified Admin');
  delayedRefresh.resolve(ok([{ role: 'super_admin', is_active: true }]));
  await refresh;
  await flush();
  assert.equal(refreshing.h.value.phase, 'active');

  refreshing.state.roles.verified = { role: 'super_admin', is_active: false };
  await refreshing.h.value.refresh();
  await flush();
  assert.equal(refreshing.h.value.phase, 'denied', 'Revocation must remove active access');
  assert.equal(refreshing.h.value.osasPermissions.can_view_aggregates, false);
  assert.equal(refreshing.h.value.osasPermissions.can_manage_support_requests, false);
  assert.equal(refreshing.h.value.role, null);

  profileName.state.roles['profile-name'] = { error: new Error('Revalidation failed') };
  await profileName.h.value.refresh();
  await flush();
  assert.equal(profileName.h.value.phase, 'error');
  assert.equal(profileName.h.value.role, null);

  switching.state.sessionError = new Error('Session expired');
  await switching.h.value.refresh();
  await flush();
  assert.equal(switching.h.value.phase, 'error');
  assert.equal(switching.h.value.role, null);

  const requestRace = provider(user('request-one'));
  await flush();
  requestRace.state.accessWait = deferred();
  const accessPromise = requestRace.h.value.requestAccess();
  requestRace.emit(user('request-two'));
  await flush();
  requestRace.state.accessWait.resolve({ error: null });
  await accessPromise;
  await flush();
  assert.equal(requestRace.h.value.identity.id, 'request-two');
  assert.equal(requestRace.h.value.accessRequest, null, 'Old account request must not populate the new account');
  assert.equal(requestRace.h.value.requestLoading, false);

  const logoutRace = provider(user('logout'));
  logoutRace.state.roles.logout = { role: 'admin', is_active: true };
  await flush();
  const lateVerification = deferred();
  logoutRace.state.roles.logout = { wait: lateVerification };
  const inFlight = logoutRace.h.value.refresh(); await flush();
  logoutRace.emit(null); await flush();
  lateVerification.resolve(ok([{ role: 'admin', is_active: true }]));
  await inFlight; await flush();
  assert.equal(logoutRace.h.value.phase, 'signed_out');
  assert.equal(logoutRace.h.value.role, null, 'A late verification must not reopen a signed-out workspace');

  console.log('14 admin access regressions passed.');
}
module.exports = { hookHarness, flush, deferred };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
