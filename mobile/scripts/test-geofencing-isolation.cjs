const assert = require('node:assert/strict');
const { hooks, load } = require('./test-harness.cjs');
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const place = (id, active = true, owner = 'a') => ({ id, owner_id: owner, name: id, latitude: 14, longitude: 121, radius: 123, is_active: active });

function fixture({ enabled = true, running = false, available = true, background = 'granted', wait } = {}) {
  const h = hooks(), features = { MOBILE_GEOFENCING_ENABLED: enabled };
  const state = { user: { id: 'a' }, places: [place('a-place'), place('inactive', false)], starts: [], stops: 0,
    running, available, background, wait, backgroundRequests: 0, clears: 0, watches: 0, removed: 0, locationsUpdatedAt: 1 };
  const native = {
    Accuracy: { Balanced: 1 }, GeofencingEventType: { Enter: 1, Exit: 2 },
    requestForegroundPermissionsAsync: async () => ({ status: 'granted' }),
    requestBackgroundPermissionsAsync: async () => { state.backgroundRequests++; if (state.wait) await state.wait.promise; return { status: state.background }; },
    getBackgroundPermissionsAsync: async () => ({ status: state.background }),
    watchPositionAsync: async (_, listener) => { state.watches++; state.position = listener; return { remove() { state.removed++; } }; },
    hasServicesEnabledAsync: async () => true, hasStartedGeofencingAsync: async () => state.running,
    startGeofencingAsync: async (_, regions) => { state.starts.push(regions); state.running = true; },
    stopGeofencingAsync: async () => { state.running = false; state.stops++; },
  };
  const taskManager = {
    defineTask: (_, task) => { state.task = task; },
    isAvailableAsync: async () => { if (state.available instanceof Error) throw state.available; return state.available; },
  };
  // Native geofencing has no notification or Supabase mocks: an import would fail.
  const geofencing = load('src/hooks/use-geofencing.ts', {
    '@/constants/features': features, 'expo-location': native, 'expo-task-manager': taskManager,
    '@/lib/geofence-events': { recordGeofenceEvent: async (...args) => { state.events ??= []; state.events.push(args); } },
  }, { console: { ...console, log() {} } });
  // Foreground GPS has no TaskManager mock and cannot depend on background startup.
  const foreground = load('src/hooks/use-current-location.ts', {
    react: h.react, 'react-native': { Platform: { OS: 'android' } }, 'expo-location': native,
    '@/lib/quest-priority': { distanceMeters: () => 0 },
  });
  let current;
  const feature = load('src/components/geofencing-feature.tsx', {
    react: h.react, 'react-native': { Platform: { OS: 'android' } }, 'expo-location': native, 'expo-task-manager': taskManager,
    '@/constants/features': features, '@/context/user-data-context': { useUserData: () => ({ user: state.user }) },
    '@/context/location-context': { useLocationContext: () => ({ ...current, activeLocations: state.places, locationsUpdatedAt: state.locationsUpdatedAt }) },
    '@/lib/geofence-events': { clearGeofenceEvents: async () => { state.clears++; } },
    '@/hooks/use-geofencing': geofencing,
  });
  h.mount(() => { current = foreground.useCurrentLocation(state.places, !!state.user); feature.GeofencingFeature(); return current; });
  return { h, state, geofencing };
}

const cases = [], test = (name, run) => cases.push({ name, run });
test('enabled geofencing registers unchanged active regions after foreground permission', async () => {
  const p = fixture(); await p.h.value.startTracking(); await flush();
  assert.equal(p.h.value.isTracking, true); assert.equal(p.state.backgroundRequests, 1);
  assert.equal(p.state.starts.length, 1); assert.equal(p.state.starts[0].length, 1);
  assert.equal(p.state.starts[0][0].radius, 123); assert.equal(p.state.starts[0][0].notifyOnEnter, true);
  assert.equal(p.state.starts[0][0].notifyOnExit, true);
  p.state.position({ coords: { latitude: 14, longitude: 121 }, timestamp: Date.now() }); await flush();
  assert.equal(p.h.value.locationId, 'a-place'); p.h.unmount(); await flush(); assert.equal(p.state.running, false);
});
test('disabled geofencing retires native regions while foreground GPS and saved places remain available', async () => {
  const p = fixture({ enabled: false, running: true }); await p.h.value.startTracking(); await flush();
  assert.equal(p.h.value.isTracking, true); assert.equal(p.state.starts.length, 0);
  assert.equal(p.state.running, false); assert(p.state.stops > 0); assert(p.state.clears > 0);
  assert.equal(p.state.backgroundRequests, 0);
  p.state.position({ coords: { latitude: 14, longitude: 121 }, timestamp: Date.now() }); await flush();
  assert.equal(p.h.value.locationName, 'a-place');
  await p.state.task({ data: { eventType: 1, region: { identifier: 'a-place' } } });
  assert.equal(p.state.events, undefined);
  await p.geofencing.registerGeofences(p.state.places); assert.equal(p.state.starts.length, 0); p.h.unmount();
});
test('unchanged place refreshes do not restart native regions while place edits still synchronize', async () => {
  const p = fixture(); await p.h.value.startTracking(); await flush();
  p.state.locationsUpdatedAt = 2; p.h.render(); await flush(); assert.equal(p.state.starts.length, 1);
  p.state.places = [{ ...place('a-place'), radius: 234 }]; p.h.render(); await flush();
  assert.equal(p.state.starts.length, 2); assert.equal(p.state.starts[1][0].radius, 234); p.h.unmount();
});
for (const available of [false, new Error('TaskManager unavailable')]) test('background unavailability cannot stop foreground tracking: ' + String(available), async () => {
  const p = fixture({ available }); await p.h.value.startTracking(); await flush();
  assert.equal(p.h.value.isTracking, true); assert.equal(p.state.starts.length, 0); p.h.unmount();
});
test('denied background permission retains foreground tracking', async () => {
  const p = fixture({ background: 'denied' }); await p.h.value.startTracking(); await flush();
  assert.equal(p.h.value.isTracking, true); assert.equal(p.state.starts.length, 0); p.h.unmount();
});
test('late background permission cannot register after logout', async () => {
  const wait = deferred(), p = fixture({ wait }); await p.h.value.startTracking(); await flush();
  p.state.user = null; p.h.render(); wait.resolve(); await flush();
  assert.equal(p.state.starts.length, 0); assert.equal(p.state.running, false); p.h.unmount();
});
test('late background permission cannot register old regions after account switching', async () => {
  const wait = deferred(), p = fixture({ wait }); await p.h.value.startTracking(); await flush();
  p.state.wait = null; p.state.user = { id: 'b' }; p.state.places = [place('b-place', true, 'b')]; p.h.render(); await flush();
  wait.resolve(); await flush();
  assert.deepEqual(p.state.starts.map(regions => regions[0].identifier), ['b-place']); p.h.unmount();
});
test('native task records entry and exit without notification integration', async () => {
  const p = fixture();
  for (const eventType of [1, 2]) await p.state.task({ data: { eventType, region: { identifier: 'a-place' } } });
  assert.deepEqual(p.state.events, [['a-place', true], ['a-place', false]]); p.h.unmount();
});
test('shared store expires old events and remains usable without a presentation handler', async () => {
  let stored = JSON.stringify({ stale: { inside: true, timestamp: Date.now() - 300_001 } });
  const events = load('src/lib/geofence-events.ts', { '@react-native-async-storage/async-storage': {
    getItem: async () => stored, setItem: async (_, value) => { stored = value; }, removeItem: async () => { stored = null; },
  } });
  await events.recordGeofenceEvent('current', true);
  const snapshot = await events.readGeofenceEvents(); assert.equal(snapshot.stale, undefined); assert.equal(snapshot.current.inside, true);
});
test('event clear invalidates presentation without waiting for notification IO', async () => {
  let stored = '{}', entry; const wait = deferred();
  const events = load('src/lib/geofence-events.ts', { '@react-native-async-storage/async-storage': {
    getItem: async () => stored, setItem: async (_, value) => { stored = value; }, removeItem: async () => { stored = null; },
  } });
  events.setGeofenceEntryHandler(async value => { entry = value; await wait.promise; });
  const writing = events.recordGeofenceEvent('current', true); await flush(); assert.equal(entry.isCurrent(), true);
  await events.clearGeofenceEvents(); assert.equal(entry.isCurrent(), false); assert.equal(stored, null);
  wait.resolve(); await writing;
});

(async () => { for (const { name, run } of cases) { await run(); console.log('PASS ' + name); } console.log(cases.length + ' geofencing isolation regressions passed.'); })()
  .catch(error => { console.error(error); process.exitCode = 1; });
