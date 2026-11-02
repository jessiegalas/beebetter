/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Analyze emitted imports: type-only references must not become native coupling.
const root = path.resolve(__dirname, '../src');
const graph = new Map();
const sources = new Map();
const local = name => path.join(root, name);
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(file); continue; }
    if (!/\.tsx?$/.test(file) || file.endsWith('.d.ts')) continue;
    const source = fs.readFileSync(file, 'utf8');
    sources.set(file, ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true));
    const emitted = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const deps = [...emitted.matchAll(/require\(["']([^"']+)["']\)/g)].map(([, name]) => {
      const base = name.startsWith('@/') ? local(name.slice(2)) : name.startsWith('.') ? path.resolve(path.dirname(file), name) : null;
      return base ? [base + '.ts', base + '.tsx', path.join(base, 'index.ts'), path.join(base, 'index.tsx')].find(p => fs.existsSync(p)) ?? name : name;
    });
    graph.set(file, deps);
  }
}
walk(root);

const visited = new Set(), active = new Set();
function acyclic(file) {
  assert(!active.has(file), 'Runtime import cycle at ' + file);
  if (visited.has(file)) return;
  active.add(file);
  for (const dep of graph.get(file) ?? []) acyclic(dep);
  active.delete(file); visited.add(file);
}
for (const file of graph.keys()) acyclic(file);
console.log('PASS zero runtime import cycles across ' + graph.size + ' source modules');

function closure(file, found = new Set()) {
  if (found.has(file)) return found;
  found.add(file);
  for (const dep of graph.get(file) ?? []) closure(dep, found);
  return found;
}
const implementation = local('lib/quest-notifications.ts');
const response = local('components/quest-notification-response.tsx');
const entry = local('components/notification-feature.tsx');
const screen = local('app/notifications.tsx');
for (const core of ['context/user-data-context.tsx', 'lib/quest-completion.ts', 'lib/quest-completion-adapter.ts']) {
  const deps = closure(local(core));
  for (const forbidden of [implementation, response, entry, screen, 'expo-notifications', 'expo-task-manager']) {
    assert(!deps.has(forbidden), core + ' imports ' + forbidden);
  }
}
// Navigation affordances consume only the pure flag, never native implementations.
for (const file of ['app/(tabs)/index.tsx', 'components/home-menu.tsx', 'constants/features.ts']) {
  for (const forbidden of [implementation, response, entry, screen, 'expo-notifications']) {
    assert(!(graph.get(local(file)) ?? []).includes(forbidden), file + ' imports ' + forbidden);
  }
}
console.log('PASS authentication/completion stay independent of notification implementations');

const geofencing = local('hooks/use-geofencing.ts');
const geofencingEntry = local('components/geofencing-feature.tsx');
for (const producer of [geofencing, local('lib/geofence-events.ts')]) {
  const deps = closure(producer);
  for (const forbidden of [implementation, entry, response, 'expo-notifications', local('supabase.ts')]) {
    assert(!deps.has(forbidden), producer + ' imports ' + forbidden);
  }
}
for (const core of ['context/location-context.tsx', 'hooks/use-user-locations.ts', 'hooks/use-current-location.ts']) {
  const deps = closure(local(core));
  for (const forbidden of [geofencing, geofencingEntry, implementation, 'expo-task-manager', 'expo-notifications']) {
    assert(!deps.has(forbidden), core + ' imports ' + forbidden);
  }
}
assert(!closure(implementation).has(geofencing));
assert(!closure(implementation).has(geofencingEntry));
console.log('PASS foreground location, geofencing and notification implementations have independent import paths');

const layout = local('app/_layout.tsx');
assert(graph.get(layout).includes(entry));
assert(!graph.get(layout).includes(implementation));
assert(!graph.get(layout).includes(response));
assert(graph.get(entry).includes(implementation));
assert(graph.get(entry).includes(response));
assert(closure(layout).has(local('hooks/use-geofencing.ts')));
assert(graph.get(layout).includes(geofencingEntry));
assert(graph.get(geofencingEntry).includes(geofencing));
console.log('PASS root composes one static notification entry and retains the geofencing startup path');

function moduleScopeCall(file, name) {
  const source = sources.get(file);
  let found = false;
  function scan(node) {
    if (ts.isFunctionLike(node)) return;
    if (ts.isCallExpression(node) && node.expression.getText(source) === name) found = true;
    ts.forEachChild(node, scan);
  }
  scan(source);
  return found;
}
assert(moduleScopeCall(implementation, 'Notifications.setNotificationHandler'));
assert(moduleScopeCall(implementation, 'TaskManager.defineTask'));
assert(moduleScopeCall(implementation, 'setGeofenceEntryHandler'));
assert(moduleScopeCall(local('hooks/use-geofencing.ts'), 'TaskManager.defineTask'));
console.log('PASS push/foreground/geofencing native definitions remain at module scope');
console.log('5 notification/geofencing isolation regressions passed.');
