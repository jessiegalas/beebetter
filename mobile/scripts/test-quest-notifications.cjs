const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const flush = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); };
function load(file, mocks, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.resolve(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, require: name => { if (!(name in mocks)) throw Error('Unexpected import ' + name); return mocks[name]; },
    console, setTimeout, clearTimeout, AbortController, AbortSignal, Response, ...globals }, { filename: file });
  return exports;
}
async function actionScenario({ proof = false, state = 'active', owner = 'a', action = 'COMPLETE_QUEST', prerequisite = null, failure = false, replay = false, replayAfterDispatch = false, recoveryAfterCleanup = false, switchedBeforeRecovery = false } = {}) {
  let effect, admissionRef, calls = 0, refreshed = 0;
  let releaseCompletion;
  const completionWait = replayAfterDispatch ? new Promise(resolve => { releaseCompletion = resolve; }) : Promise.resolve();
  const routes = [], alerts = [];
  const response = { actionIdentifier: action, notification: { request: { identifier: 'notice', content: { data: { questId: 'q', ownerId: owner } } } } };
  const mod = load('src/components/quest-notification-response.tsx', {
    react: { useRef: value => { const ref = { current: value }; if (value?.access) admissionRef = ref; return ref; }, useEffect: fn => { effect = fn; } },
    'react-native': { Platform: { OS: 'android' }, Alert: { alert: (...args) => alerts.push(args) } },
    'expo-router': { router: { push: value => routes.push(value) } },
    'expo-notifications': { useLastNotificationResponse: () => response, DEFAULT_ACTION_IDENTIFIER: 'default', clearLastNotificationResponseAsync: async () => {}, dismissNotificationAsync: async () => {} },
    '@/context/user-data-context': { useUserData: () => ({ user: { id: 'a' }, access: 'active', isLoading: false, refresh: async () => { refreshed++; }, completeQuest: async () => { calls++; await completionWait; if (!failure) refreshed++; return { success: !failure, error: failure ? 'offline' : undefined }; } }) },
    '@/lib/quest-notifications': { COMPLETE_QUEST_ACTION: 'COMPLETE_QUEST', OPEN_QUEST_ACTION: 'OPEN_QUEST' },
    '@/supabase': { supabase: {
      from: () => { let id; const query = { select: () => query, eq: (key, value) => { if (key === 'id') id = value; return query; },
        maybeSingle: async () => ({ data: id === 'q' ? { id: 'q', requires_proof: proof, status: state, prerequisite_quest_id: prerequisite ? 'p' : null } : { status: prerequisite }, error: null }) }; return query; },
      rpc: async () => { calls++; return { error: failure ? new Error('offline') : null }; },
    } },
  });
  mod.QuestNotificationResponse(); const cleanup = effect();
  if (replay) { cleanup(); effect(); }
  if (replayAfterDispatch) { await flush(); cleanup(); effect(); releaseCompletion(); }
  await flush();
  effect(); await flush();
  if (recoveryAfterCleanup) {
    cleanup?.();
    if (switchedBeforeRecovery) admissionRef.current = { userId: 'b', access: 'active' };
    alerts.at(-1)?.[2]?.find(button => button.text === 'Open')?.onPress();
  }
  return { calls, refreshed, routes, alerts };
}
async function workerScenario(options = {}) {
  const { receipt = false, sendFailure = false, receiptFailure = false, tokenError = false, authorized = true,
    mode = 'test', testOwners = '11111111-1111-4111-8111-111111111111', attempts = 1, mixed = false,
    staleLease = false, refreshedDevice = false, missingReceipt = false, expiredReceipt = false, ticketCode,
    foreign = false, current = true } = options;
  let handler;
  const updates = [], deletions = [], requests = [], rpcCalls = [], filters = [];
  const job = { delivery_id: 'd', token: 'ExpoPushToken[x]', owner_id: foreign ? '22222222-2222-4222-8222-222222222222' : '11111111-1111-4111-8111-111111111111',
    quest_id: 'q', title: 'Read', kind: 'scheduled', can_complete: false, due_at: new Date(Date.now() - 1000).toISOString(),
    attempts, claim_id: '33333333-3333-4333-8333-333333333333', device_registered_at: new Date(Date.now() - 60_000).toISOString() };
  const jobs = receipt && !receiptFailure ? [] : mixed ? [job, { ...job, delivery_id: 'd2' }] : [job];
  const deliveries = jobs.map(j => ({ id: j.delivery_id, ...j, status: 'sending', updated_at: new Date().toISOString() }));
  if (receipt || receiptFailure) deliveries.push({ id: 'receipt', token: job.token, owner_id: job.owner_id, status: 'sent', ticket_id: 'ticket',
    sent_at: new Date(Date.now() - (expiredReceipt ? 25 * 60 : 20) * 60_000).toISOString(),
    receipt_available_at: new Date(Date.now() - 60_000).toISOString(), device_registered_at: job.device_registered_at });
  const devices = [{ token: job.token, updated_at: refreshedDevice ? new Date().toISOString() : job.device_registered_at }];
  const db = {
    rpc: async (name, args) => { rpcCalls.push({ name, args }); return { data: name === 'claim_quest_push_deliveries' ? jobs : current ? jobs.map(job => ({ delivery_id: job.delivery_id })) : [], error: null }; },
    from: table => {
      let operation = 'select', values;
      const conditions = [];
      const q = {
        select: () => q, update: value => { operation = 'update'; values = value; return q; },
        delete: () => { operation = 'delete'; return q; },
        order: key => { filters.push(['order', key]); return q; }, limit: () => q,
        then: resolve => {
          const list = table === 'quest_push_devices' ? devices : deliveries;
          const matches = row => conditions.every(([key, op, value]) => {
            const actual = key === 'quests.owner_id' ? row.owner_id : row[key];
            return op === 'eq' ? actual === value : op === 'in' ? value.includes(actual) : op === 'gt' ? actual > value : actual <= value;
          });
          const selected = list.filter(matches);
          if (operation === 'update') {
            updates.push({ ...values });
            selected.forEach(row => Object.assign(row, values));
          }
          if (operation === 'delete' && selected.length) {
            deletions.push(table);
            selected.forEach(row => list.splice(list.indexOf(row), 1));
          }
          return Promise.resolve({ data: selected.map(row => ({ ...row })), error: null }).then(resolve);
        },
      };
      for (const op of ['eq','lte','gt','in']) q[op] = (key, value) => { conditions.push([key, op, value]); filters.push([op, key, value]); return q; };
      return q;
    },
  };
  load('../supabase/functions/quest-notifications/index.ts', { 'npm:@supabase/supabase-js@2.116.0': { createClient: () => db } }, {
    Deno: { env: { get: name => ({ QUEST_NOTIFICATION_SECRET: 'secret', QUEST_NOTIFICATION_MODE: mode, QUEST_NOTIFICATION_TEST_OWNER_IDS: testOwners })[name] }, serve: fn => { handler = fn; } },
    fetch: async (url, options) => {
      const body = JSON.parse(options.body);
      requests.push(body);
      if (staleLease && url.endsWith('/send')) deliveries[0].claim_id = '44444444-4444-4444-8444-444444444444';
      if ((sendFailure && url.endsWith('/send')) || (receiptFailure && url.endsWith('/getReceipts'))) return new Response('', { status: 503 });
      const code = ticketCode || (tokenError ? 'DeviceNotRegistered' : undefined);
      return Response.json({ data: url.endsWith('/getReceipts') ? missingReceipt ? {} : { ticket: { status: 'error', details: { error: 'DeviceNotRegistered' } } }
        : jobs.map((_, i) => ({ status: code || (mixed && i === 1) ? 'error' : 'ok', id: code || (mixed && i === 1) ? undefined : 'ticket',
          details: code || (mixed && i === 1) ? { error: code || 'MessageRateExceeded' } : undefined })) });
    },
    console: { error() {}, log() {} },
  });
  const result = await handler(new Request('http://localhost', { method: 'POST', headers: { 'x-notification-secret': authorized ? 'secret' : 'wrong' } }));
  const body = result.headers.get('content-type')?.includes('json') ? await result.json() : null;
  return { result, body, updates, deletions, requests, rpcCalls, filters, deliveries, devices };
}

async function geofenceScenario() {
  let task; let owner = 'a'; let active = true; let sends = 0;
  const stored = new Map();
  const query = table => {
    const chain = { select: () => chain, eq: () => chain, order: () => chain, limit: () => chain, maybeSingle: () => chain,
      then: resolve => Promise.resolve({ error: null, data: table === 'students' ? { status: active ? 'Active' : 'Inactive' }
        : table === 'user_locations' ? { id: 'place' } : [{ id: 'q', title: 'Read', status: 'active', requires_proof: true }] }).then(resolve) };
    return chain;
  };
  load('src/hooks/use-geofencing.ts', {
    '@react-native-async-storage/async-storage': { getItem: async key => stored.get(key), setItem: async (key, value) => { stored.set(key, value); } },
    'expo-notifications': { SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval' }, scheduleNotificationAsync: async value => { assert.equal(value.content.categoryIdentifier, 'QUEST_OPEN'); assert.equal(value.content.data.ownerId, 'a'); sends++; } },
    '@/supabase': { supabase: { auth: { getSession: async () => ({ data: { session: owner ? { user: { id: owner } } : null } }) }, from: query } },
    '@/lib/quest-notifications': { configureQuestNotifications: async request => { assert.equal(request, false); return true; }, questNeedsOpen: quest => quest.requires_proof,
      QUEST_CHANNEL_ID: 'quests', QUEST_NOTIFICATION_CATEGORY: 'QUEST_ACTIONS', QUEST_OPEN_CATEGORY: 'QUEST_OPEN' },
    '@/lib/geofence-events': { recordGeofenceEvent: async () => {} },
    'expo-task-manager': { defineTask: (_, fn) => { task = fn; } },
    'expo-location': { GeofencingEventType: { Enter: 1, Exit: 2 } },
  });
  const event = (eventType, id) => task({ data: { eventType, region: { identifier: id } } });
  await event(2, 'place'); assert.equal(sends, 0);
  await event(1, 'place'); await event(1, 'place'); assert.equal(sends, 1);
  active = false; await event(1, 'another-place'); assert.equal(sends, 1);
  owner = null; await event(1, 'another-place'); assert.equal(sends, 1);
}

async function registrationScenario({ storedValue = null, permission = true, permissionStatus, platform = 'android', expoGo = false, tokenTimeout = false, rpcError = false, setupError = false } = {}) {
  let stored = storedValue;
  const nativeListeners = new Set(), appListeners = new Set(), timers = new Set();
  const appState = { currentState: 'active', addEventListener: (_, fn) => {
    appListeners.add(fn); return { remove() { appListeners.delete(fn); if (state.listenerCleanupError) throw Error('Native removal failed'); } };
  } };
  const state = { owner: 'a', permission, permissionStatus, rpcError, setupError, tokenTimeout, stored: () => stored,
    rpc: [], tokens: [], permissionCalls: 0, presented: [], permissionReads: 0, canAskAgain: false,
    nativeListeners, appListeners, timers,
    moveApp(value) { appState.currentState = value; [...appListeners].forEach(fn => fn(value)); },
    nativeToken(value) { [...nativeListeners].forEach(fn => fn(value)); },
    tick() { [...timers].forEach(fn => fn()); },
  };
  const mod = load('src/lib/quest-notifications.ts', {
    'expo-task-manager': { isTaskDefined: () => false, defineTask: (_, fn) => { state.task = fn; }, isTaskRegisteredAsync: async () => false },
    react: { useSyncExternalStore: (_, snapshot) => snapshot() },
    'react-native': { Platform: { OS: platform }, AppState: appState },
    'expo-constants': { executionEnvironment: expoGo ? 'storeClient' : 'standalone', expoConfig: { extra: { eas: { projectId: 'project' } } } },
    '@react-native-async-storage/async-storage': {
      getItem: async () => stored, setItem: async (_, value) => { stored = value; }, removeItem: async () => { stored = null; },
    },
    '@/supabase': { supabase: {
      auth: { getSession: async () => ({ data: { session: state.owner ? { user: { id: state.owner } } : null } }) },
      rpc: (_, args) => ({ abortSignal: async () => { state.rpc.push(args); if (args.enabled_value && state.rpcWait) await state.rpcWait; return { error: state.rpcError && args.enabled_value ? new Error('offline') : null }; } }),
    } },
    'expo-notifications': {
      addPushTokenListener(fn) {
        if (state.listenerError) throw Error('Native listener failed');
        nativeListeners.add(fn); return { remove() { nativeListeners.delete(fn); if (state.listenerCleanupError) throw Error('Native removal failed'); } };
      },
      setNotificationHandler(value) { state.handler = value.handleNotification; }, setNotificationChannelAsync: async () => {},
      registerTaskAsync: async () => {}, scheduleNotificationAsync: async value => { state.presented.push(value); },
      getPermissionsAsync: async () => { state.permissionReads++; if (state.setupWait) await state.setupWait; if (state.setupError) throw Error('Native setup failed'); return { granted: state.permission, status: state.permissionStatus ?? (state.permission ? 'granted' : 'denied'), canAskAgain: state.canAskAgain }; },
      requestPermissionsAsync: async () => { state.permissionCalls++; return { granted: state.permission, status: state.permissionStatus ?? (state.permission ? 'granted' : 'denied') };  },
      setNotificationCategoryAsync: async () => {}, AndroidImportance: { DEFAULT: 1 },
      getExpoPushTokenAsync: async options => { state.tokens.push(options); if (state.tokenWait) await state.tokenWait; if (state.tokenTimeout) await new Promise(() => {}); return { data: 'ExpoPushToken[new]' }; },
      getAllScheduledNotificationsAsync: async () => [], cancelAllScheduledNotificationsAsync: async () => {}, dismissAllNotificationsAsync: async () => {},
    },
  }, {
    setInterval: fn => { timers.add(fn); return fn; }, clearInterval: fn => { timers.delete(fn); },
    ...(tokenTimeout ? { setTimeout: fn => setTimeout(fn, 1) } : {}),
    console: { ...console, warn() {} },
  });
  return { mod, state };
}


(async () => {
  await geofenceScenario();
  console.log('PASS geofence entry, proof Open action, cooldown, exit and inactive/signed-out suppression');
  let result = await actionScenario();
  assert.equal(result.calls, 1); assert.equal(result.refreshed, 1); assert.equal(result.routes.length, 0);
  result = await actionScenario({ replay: true }); assert.equal(result.calls, 1);
  result = await actionScenario({ replayAfterDispatch: true }); assert.equal(result.calls, 1);
  console.log('PASS cold-start Complete and interrupted-effect replay call the RPC once');
  for (const scenario of [{ proof: true }, { action: 'OPEN_QUEST' }, { action: 'default' }, { prerequisite: 'active' }]) {
    result = await actionScenario(scenario); assert.equal(result.calls, 0); assert.equal(result.routes[0].params.questId, 'q');
  }
  console.log('PASS proof, open/body taps and blocked prerequisites open the exact quest');
  result = await actionScenario({ prerequisite: 'completed' }); assert.equal(result.calls, 1);
  result = await actionScenario({ owner: 'another-account' }); assert.equal(result.calls, 0); assert.equal(result.routes.length, 0);
  result = await actionScenario({ state: 'completed' }); assert.equal(result.calls, 0);
  result = await actionScenario({ failure: true }); assert.equal(result.refreshed, 0); assert.match(result.alerts[0][0], /Could not/);
  result = await actionScenario({ failure: true, recoveryAfterCleanup: true }); assert.equal(result.routes.length, 1);
  result = await actionScenario({ failure: true, recoveryAfterCleanup: true, switchedBeforeRecovery: true }); assert.equal(result.routes.length, 0);
  console.log('PASS stale, foreign-account and failed completion actions cannot claim success');
  result = await workerScenario();
  assert.equal(result.result.status, 200); assert.equal(result.requests[0][0].data.categoryId, 'QUEST_OPEN'); assert.equal(result.updates[0].status, 'sent');
  result = await workerScenario({ authorized: false }); assert.equal(result.result.status, 401); assert.equal(result.requests.length, 0);
  result = await workerScenario({ sendFailure: true }); assert.equal(result.result.status, 503); assert.equal(result.updates[0].status, 'pending');
  for (const scenario of [{ receipt: true }, { tokenError: true }]) {
    result = await workerScenario(scenario); assert(result.deletions.includes('quest_push_devices'));
  }
  result = await workerScenario();
  assert.equal(result.requests[0][0].title, undefined); assert.equal(result.requests[0][0].channelId, undefined);
  assert.equal(result.requests[0][0].data.transport, 'quest-push-v1'); assert.equal(result.requests[0][0].priority, 'high');
  console.log('PASS worker auth, Android data-message action payload, tickets, retry and invalid-token receipts');
  // The worker must continue sending when the independent receipt service is down.
  result = await workerScenario({ receiptFailure: true });
  assert.equal(result.body.sent, 1); assert.equal(result.result.status, 503);
  assert(result.requests.some(body => Array.isArray(body)));
  result = await workerScenario({ mixed: true });
  assert.equal(result.body.sent, 1); assert.equal(result.body.retried, 1);
  result = await workerScenario({ attempts: 3, ticketCode: 'MessageRateExceeded' });
  assert.equal(result.body.failed, 1); assert.equal(result.body.retried, 0);
  result = await workerScenario({ staleLease: true });
  assert.equal(result.body.sent, 0); assert.equal(result.deliveries[0].status, 'sending');
  result = await workerScenario({ current: false });
  assert.equal(result.requests.length, 0);
  result = await workerScenario({ foreign: true });
  assert.equal(result.requests.length, 0);
  result = await workerScenario({ mode: 'off' });
  assert.equal(result.rpcCalls.length, 0); assert.equal(result.requests.length, 0);
  result = await workerScenario({ testOwners: '' });
  assert.equal(result.result.status, 503); assert.equal(result.rpcCalls.length, 0);
  result = await workerScenario({ receipt: true, refreshedDevice: true });
  assert.equal(result.devices.length, 1); assert.equal(result.deletions.length, 0);
  result = await workerScenario({ receipt: true, missingReceipt: true });
  assert.equal(result.deliveries[0].status, 'sent');
  assert(Date.parse(result.deliveries[0].receipt_available_at) > Date.now());
  assert(result.filters.some(filter => filter[0] === 'order' && filter[1] === 'receipt_available_at'));
  assert(result.filters.some(filter => filter[0] === 'in' && filter[1] === 'quests.owner_id'));
  result = await workerScenario({ receipt: true, missingReceipt: true, expiredReceipt: true });
  assert.equal(result.deliveries[0].status, 'failed'); assert.equal(result.deliveries[0].last_error, 'ReceiptExpired'); assert.equal(result.body.failed, 1);
  console.log('PASS receipt isolation, partial tickets, retry exhaustion, stale leases, fair receipt expiry, refreshed-device safety and test-only scope');

  const push = await registrationScenario({ storedValue: JSON.stringify({ token: 'ExpoPushToken[cached]', ownerId: 'a', registeredAt: Date.now() }) });
  const payload = { transport: 'quest-push-v1', questId: 'q', ownerId: 'a', notificationId: 'delivery', title: 'Quest', message: 'Read', categoryId: 'QUEST_ACTIONS', expiresAt: new Date(Date.now() + 60_000).toISOString() };
  const receive = value => push.state.task({ data: { notification: null, data: { dataString: JSON.stringify(value) } } });
  await receive(payload); assert.equal(push.state.presented.length, 1);
  assert.equal(push.state.presented[0].content.categoryIdentifier, 'QUEST_ACTIONS');
  assert.equal(push.state.presented[0].content.data.transport, undefined);
  assert.equal((await push.state.handler({ request: { content: { data: payload } } })).shouldShowBanner, false);
  await receive({ ...payload, ownerId: 'b' }); await receive({ ...payload, expiresAt: new Date(0).toISOString() });
  await push.state.task({ data: { notification: null, data: { dataString: '{broken' } } });
  await push.state.task({ data: { actionIdentifier: 'COMPLETE_QUEST' } });
  push.state.permission = false; await receive(payload); push.state.permission = true;
  push.state.owner = null; await receive(payload); assert.equal(push.state.presented.length, 1);
  push.state.owner = 'a'; await push.mod.cancelQuestNotifications(); await receive(payload);
  assert.equal(push.state.presented.length, 1);
  console.log('PASS Android task presents guarded action buttons and suppresses foreign/expired/denied/logged-out/replayed payloads');
  // Exercise the admitted lifetime instead of arranging configure/register phases.
  for (const storedValue of ['{broken', JSON.stringify({ token: 42 }), JSON.stringify(null)]) {
    const { mod, state } = await registrationScenario({ storedValue });
    const stop = mod.startQuestNotificationLifetime('a', () => true); await flush();
    assert.equal(state.tokens.length, 1); assert.equal(state.rpc[0].enabled_value, true); assert.equal(mod.useQuestNotificationStatus(), 'ready'); stop();
  }
  let registration = await registrationScenario({ storedValue: JSON.stringify({ token: 'ExpoPushToken[cached]', ownerId: 'a', registeredAt: Date.now() }) });
  let { mod, state } = registration;
  let stop = mod.startQuestNotificationLifetime('a', () => state.owner === 'a'); await flush();
  assert.equal(state.tokens.length, 0); assert.equal(state.rpc.length, 1);
  state.moveApp('active'); await flush();
  assert.equal(state.tokens.length, 0); assert.equal(state.rpc.length, 2);
  state.moveApp('background'); state.tick(); await flush(); assert.equal(state.rpc.length, 2);
  state.moveApp('active'); await flush(); state.tick(); await flush();
  assert.equal(state.tokens.length, 1); assert.equal(mod.useQuestNotificationStatus(), 'ready');
  state.rpcError = true;
  await assert.rejects(mod.retryQuestNotifications('a'), /offline/);
  assert.equal(mod.useQuestNotificationStatus(), 'error');
  state.rpcError = false;
  const first = mod.retryQuestNotifications('a'), second = mod.retryQuestNotifications('a');
  assert.equal(first, second); const beforeRetry = state.rpc.length; await Promise.all([first, second]);
  assert.equal(state.rpc.length, beforeRetry + 1); assert.equal(mod.useQuestNotificationStatus(), 'ready');
  const nativeToken = { type: 'android', data: 'native-token' };
  const beforeToken = state.tokens.length;
  state.nativeToken(nativeToken); state.nativeToken(nativeToken); await flush();
  assert.equal(state.tokens.length, beforeToken + 1); assert.deepEqual(state.tokens.at(-1).devicePushToken, nativeToken);
  const oldNativeCallback = [...state.nativeListeners][0], oldResume = [...state.appListeners][0];
  state.owner = 'b'; const beforeSwitch = state.rpc.length;
  oldNativeCallback(nativeToken); oldResume('active'); await mod.retryQuestNotifications('a'); await flush();
  assert.equal(state.rpc.length, beforeSwitch);
  const stopB = mod.startQuestNotificationLifetime('b', () => state.owner === 'b'); stop(); await flush();
  assert.equal(state.rpc.at(-1).owner_id_value, 'b');
  assert.equal(state.nativeListeners.size, 1); assert.equal(state.appListeners.size, 1); assert.equal(state.timers.size, 1);
  const callsB = state.rpc.length;
  oldNativeCallback(nativeToken); oldResume('active'); await mod.retryQuestNotifications('a'); await flush();
  assert.equal(state.rpc.length, callsB);
  stopB(); stopB(); state.tick(); state.moveApp('active'); state.nativeToken(nativeToken); await mod.retryQuestNotifications('b'); await flush();
  assert.equal(state.rpc.length, callsB); assert.equal(state.nativeListeners.size, 0); assert.equal(state.appListeners.size, 0); assert.equal(state.timers.size, 0);
  assert.notEqual(state.stored(), null); // Disposal does not revoke an admitted device.
  console.log('PASS lifetime launch/resume/cache, active hourly refresh, explicit retry, token deduplication, account fencing and disposal');

  registration = await registrationScenario({ permission: true, permissionStatus: 'denied', storedValue: JSON.stringify({ token: 'ExpoPushToken[cached]', ownerId: 'a', registeredAt: Date.now() }) });
  ({ mod, state } = registration); state.canAskAgain = true;
  stop = mod.startQuestNotificationLifetime('a', () => true); await flush();
  assert.equal(mod.useQuestNotificationStatus(), 'denied'); assert.equal(state.permissionCalls, 1);
  assert.equal(state.rpc.at(-1).enabled_value, false); assert.equal(state.stored(), null);
  state.moveApp('active'); await flush(); assert.equal(state.permissionCalls, 1); // Resume must not prompt.
  state.permissionStatus = 'granted'; state.moveApp('active'); await flush();
  assert.equal(mod.useQuestNotificationStatus(), 'ready'); assert.equal(state.rpc.at(-1).enabled_value, true);
  state.permission = false; state.canAskAgain = false; state.nativeToken(nativeToken); await flush();
  assert.equal(mod.useQuestNotificationStatus(), 'denied'); assert.equal(state.rpc.at(-1).enabled_value, false); stop();
  registration = await registrationScenario({ setupError: true }); ({ mod, state } = registration);
  stop = mod.startQuestNotificationLifetime('a', () => true); await flush(); assert.equal(mod.useQuestNotificationStatus(), 'error');
  state.setupError = false; await mod.retryQuestNotifications('a'); assert.equal(mod.useQuestNotificationStatus(), 'ready'); stop();
  registration = await registrationScenario({ tokenTimeout: true }); ({ mod, state } = registration);
  stop = mod.startQuestNotificationLifetime('a', () => true); await new Promise(resolve => setTimeout(resolve, 15)); await flush();
  assert.equal(mod.useQuestNotificationStatus(), 'error');
  state.tokenTimeout = false; await mod.retryQuestNotifications('a'); assert.equal(mod.useQuestNotificationStatus(), 'ready'); stop();
  for (const options of [{ platform: 'web' }, { platform: 'ios' }, { expoGo: true }]) {
    const { mod, state } = await registrationScenario(options);
    const stop = mod.startQuestNotificationLifetime('a', () => true); await mod.retryQuestNotifications('a');
    assert.equal(state.tokens.length, 0); assert.equal(state.nativeListeners.size, 0); assert.equal(state.timers.size, 0);
    assert.equal(mod.useQuestNotificationStatus(), 'unavailable'); stop();
  }
  for (const failure of ['listenerError', 'listenerCleanupError']) {
    const { mod, state } = await registrationScenario(); state[failure] = true;
    const stop = mod.startQuestNotificationLifetime('a', () => true); await flush();
    assert.equal(mod.useQuestNotificationStatus(), 'ready'); stop();
    assert.equal(state.nativeListeners.size, 0); assert.equal(state.appListeners.size, 0); assert.equal(state.timers.size, 0);
  }
  console.log('PASS permission revocation/recovery without repeat prompts, setup/network retry, timeouts, unsupported runtimes and listener failures');

  // Setup/token responses that arrive after logout cannot register or overwrite status.
  for (const phase of ['setupWait', 'tokenWait']) {
    const { mod, state } = await registrationScenario(); let release;
    state[phase] = new Promise(resolve => { release = resolve; });
    mod.startQuestNotificationLifetime('a', () => true); await flush();
    const cleanup = mod.cancelQuestNotifications(); await flush(); release(); await cleanup; await flush();
    assert.equal(state.rpc.length, 0); assert.equal(state.stored(), null); assert.equal(mod.useQuestNotificationStatus(), 'checking');
    assert.equal(state.nativeListeners.size, 0); assert.equal(state.appListeners.size, 0); assert.equal(state.timers.size, 0);
  }
  registration = await registrationScenario(); ({ mod, state } = registration); let release;
  state.rpcWait = new Promise(resolve => { release = resolve; });
  mod.startQuestNotificationLifetime('a', () => true); await flush();
  let settled = false; const logout = mod.cancelQuestNotifications().then(() => { settled = true; }); await flush();
  assert.equal(settled, false); assert.equal(state.nativeListeners.size, 0);
  release(); await logout; assert.deepEqual(state.rpc.map(call => call.enabled_value), [true, false]); assert.equal(state.stored(), null);
  // A disposed launch cannot steal the registration promise from a replacement lifetime.
  registration = await registrationScenario(); ({ mod, state } = registration);
  let releaseOld; state.tokenWait = new Promise(resolve => { releaseOld = resolve; });
  const oldStop = mod.startQuestNotificationLifetime('a', () => true); await flush(); oldStop();
  state.tokenWait = null; const newStop = mod.startQuestNotificationLifetime('a', () => true);
  releaseOld(); await flush(); assert.equal(state.rpc.filter(call => call.enabled_value).length, 1);
  assert.equal(mod.useQuestNotificationStatus(), 'ready'); newStop();
  console.log('PASS late setup/token suppression, awaited in-flight revocation and lifetime replacement');

})().catch(error => { console.error(error); process.exitCode = 1; });
