const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const values = new Map();
const storage = {
  async getItem(key) { return values.get(key) ?? null; },
  async setItem(key, value) { values.set(key, value); },
};
function load(file, requireModule) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: requireModule });
  return exports;
}
const queue = load('src/lib/recommendation-snooze.ts');
const { unseenGrowth, acknowledgeGrowth, acknowledgeImmediateGrowth } = load('src/lib/tree-growth.ts', name =>
  name === '@react-native-async-storage/async-storage' ? { __esModule: true, default: storage } : queue);
const current = () => true;
const row = (id, fraction) => ({ id, completed_at: '2026-11-11T02:00:00.' + fraction + '+00:00' });
const ids = rows => Array.from(rows, item => item.id);

async function main() {
  const old = row('a', '123451');
  const notification = row('b', '123452');
  const immediate = row('c', '123453');
  const rows = [immediate, notification, old];
  assert.deepEqual(ids(await unseenGrowth('student-a', [old], current)), []);
  await acknowledgeImmediateGrowth('student-a', immediate.id, current);
  assert.deepEqual(ids(await unseenGrowth('student-a', rows, current)), ['b']);
  await acknowledgeGrowth('student-a', immediate, ids(rows), current);
  assert.deepEqual(ids(await unseenGrowth('student-a', rows, current)), []);

  await unseenGrowth('student-b', [], current);
  await acknowledgeGrowth('student-b', old, ['a'], () => false);
  await acknowledgeImmediateGrowth('student-b', old.id, () => false);
  assert.deepEqual(ids(await unseenGrowth('student-b', [old], current)), ['a']);
  assert.deepEqual(ids(await unseenGrowth('student-a', [old], current)), []);

  const tied = row('0', '123453');
  assert.deepEqual(ids(await unseenGrowth('student-a', [tied, ...rows], current)), ['0']);
  for (let index = 0; index <= 100; index++) {
    await acknowledgeImmediateGrowth('student-b', String(index), current);
  }
  assert.equal(JSON.parse(values.get('beebetter:tree-growth:student-b')).immediate.length, 100);
  console.log('PASS tree growth baseline, catch-up, ordering, deduplication, account fencing and storage bound');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
