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
    console, setTimeout, clearTimeout, AbortSignal, Response, ...globals }, { filename: file });
  return exports;
}
async function actionScenario({ proof = false, state = 'active', owner = 'a', action = 'COMPLETE_QUEST', prerequisite = null, failure = false, replay = false } = {}) {
  let effect, calls = 0, refreshed = 0;
  const routes = [], alerts = [];
  const response = { actionIdentifier: action, notification: { request: { identifier: 'notice', content: { data: { questId: 'q', ownerId: owner } } } } };
  const mod = load('src/components/quest-notification-response.tsx', {
    react: { useRef: value => ({ current: value }), useEffect: fn => { effect = fn; } },
    'react-native': { Platform: { OS: 'android' }, Alert: { alert: (...args) => alerts.push(args) } },
    'expo-router': { router: { push: value => routes.push(value) } },
    'expo-notifications': { useLastNotificationResponse: () => response, DEFAULT_ACTION_IDENTIFIER: 'default', clearLastNotificationResponseAsync: async () => {}, dismissNotificationAsync: async () => {} },
    '@/context/user-data-context': { useUserData: () => ({ user: { id: 'a' }, access: 'active', isLoading: false, refresh: async () => { refreshed++; } }) },
    '@/lib/quest-notifications': { COMPLETE_QUEST_ACTION: 'COMPLETE_QUEST', OPEN_QUEST_ACTION: 'OPEN_QUEST' },
    '@/supabase': { supabase: {
      from: () => { let id; const query = { select: () => query, eq: (key, value) => { if (key === 'id') id = value; return query; },
        maybeSingle: async () => ({ data: id === 'q' ? { id: 'q', requires_proof: proof, status: state, prerequisite_quest_id: prerequisite ? 'p' : null } : { status: prerequisite }, error: null }) }; return query; },
      rpc: async () => { calls++; return { error: failure ? new Error('offline') : null }; },
    } },
  });
  mod.QuestNotificationResponse(); const cleanup = effect();
  if (replay) { cleanup(); effect(); }
  await flush();
  effect(); await flush();
  return { calls, refreshed, routes, alerts };
}
async function workerScenario({ receipt = false, sendFailure = false, tokenError = false, authorized = true } = {}) {
  let handler;
  const updates = [], deletions = [], requests = [];
  const job = { delivery_id: 'd', token: 'ExpoPushToken[x]', owner_id: 'a', quest_id: 'q', title: 'Read', kind: 'scheduled', can_complete: false };
  const db = {
    rpc: async () => ({ data: receipt ? [] : [job], error: null }),
    from: table => {
      let operation, values;
      const query = { select: () => { operation = 'select'; return query; }, update: value => { operation = 'update'; values = value; return query; },
        delete: () => { operation = 'delete'; return query; }, eq: () => query, lt: () => query, in: () => query, limit: () => query,
        then: resolve => {
          if (operation === 'update') updates.push(values);
          if (operation === 'delete') deletions.push(table);
          return Promise.resolve({ data: operation === 'select' && receipt ? [{ id: 'd', token: job.token, ticket_id: 'ticket', updated_at: new Date(Date.now() - 20 * 60_000).toISOString() }] : [], error: null }).then(resolve);
        } };
      return query;
    },
  };
  load('../supabase/functions/quest-notifications/index.ts', { 'npm:@supabase/supabase-js@2.116.0': { createClient: () => db } }, {
    Deno: { env: { get: name => name === 'QUEST_NOTIFICATION_SECRET' ? 'secret' : undefined }, serve: fn => { handler = fn; } },
    fetch: async (url, options) => {
      requests.push(JSON.parse(options.body));
      if (sendFailure) return new Response('', { status: 503 });
      return Response.json({ data: receipt ? { ticket: { status: 'error', details: { error: 'DeviceNotRegistered' } } } : [{ status: tokenError ? 'error' : 'ok', id: tokenError ? undefined : 'ticket', details: tokenError ? { error: 'DeviceNotRegistered' } : undefined }] });
    },
    console: { error() {} },
  });
  const result = await handler(new Request('http://localhost', { method: 'POST', headers: { 'x-notification-secret': authorized ? 'secret' : 'wrong' } }));
  return { result, updates, deletions, requests };
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

(async () => {
  await geofenceScenario();
  console.log('PASS geofence entry, proof Open action, cooldown, exit and inactive/signed-out suppression');
  let result = await actionScenario();
  assert.equal(result.calls, 1); assert.equal(result.refreshed, 1); assert.equal(result.routes.length, 0);
  result = await actionScenario({ replay: true }); assert.equal(result.calls, 1);
  console.log('PASS cold-start Complete and interrupted-effect replay call the RPC once');
  for (const scenario of [{ proof: true }, { action: 'OPEN_QUEST' }, { action: 'default' }, { prerequisite: 'active' }]) {
    result = await actionScenario(scenario); assert.equal(result.calls, 0); assert.equal(result.routes[0].params.questId, 'q');
  }
  console.log('PASS proof, open/body taps and blocked prerequisites open the exact quest');
  result = await actionScenario({ prerequisite: 'completed' }); assert.equal(result.calls, 1);
  result = await actionScenario({ owner: 'another-account' }); assert.equal(result.calls, 0); assert.equal(result.routes.length, 0);
  result = await actionScenario({ state: 'completed' }); assert.equal(result.calls, 0);
  result = await actionScenario({ failure: true }); assert.equal(result.refreshed, 0); assert.match(result.alerts[0][0], /Could not/);
  console.log('PASS stale, foreign-account and failed completion actions cannot claim success');
  result = await workerScenario();
  assert.equal(result.result.status, 200); assert.equal(result.requests[0][0].categoryId, 'QUEST_OPEN'); assert.equal(result.updates[0].status, 'sent');
  result = await workerScenario({ authorized: false }); assert.equal(result.result.status, 401); assert.equal(result.requests.length, 0);
  result = await workerScenario({ sendFailure: true }); assert.equal(result.result.status, 500); assert.equal(result.updates[0].status, 'pending');
  for (const scenario of [{ receipt: true }, { tokenError: true }]) {
    result = await workerScenario(scenario); assert(result.deletions.includes('quest_push_devices'));
  }
  console.log('PASS worker auth, action category, tickets, retry and invalid-token receipts');
})().catch(error => { console.error(error); process.exitCode = 1; });
