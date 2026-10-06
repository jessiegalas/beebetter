const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
function load(relative, globals = {}) {
  const file = path.join(__dirname, '..', relative), exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, Error, Date, ...globals }, { filename: file });
  return exports;
}
const { createQuestCompletion } = load('src/lib/quest-completion.ts');
const tests = [], test = (name, fn) => tests.push({ name, fn });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 3; i++) await new Promise(resolve => setImmediate(resolve)); };
const proof = { uri: 'file:///synthetic-proof.jpg', name: 'Evidence.J-P_G', mimeType: 'image/jpeg' };
const bytes = new ArrayBuffer(4);
function fixture() {
  const calls = [], handlers = {}, state = { current: true };
  const adapter = Object.fromEntries(['readProof', 'uploadProof', 'complete', 'removeProof'].map(name => [name, async (...args) => {
    calls.push({ name, args });
    if (handlers[name]) return handlers[name](...args);
    return name === 'readProof' ? bytes : undefined;
  }]));
  const module = createQuestCompletion(adapter, () => 123);
  const run = attachment => module.run({ ownerId: 'student-a', questId: 'quest-1', proof: attachment, isCurrent: () => state.current });
  return { calls, handlers, state, run };
}
const names = f => f.calls.map(call => call.name);
test('completion without proof sends null proof arguments once', async () => {
  const f = fixture(); assert.equal((await f.run()).status, 'completed');
  assert.deepEqual(names(f), ['complete']); assert.deepEqual(f.calls[0].args, ['quest-1', null, null]);
});
test('proof bytes, sanitized extension and MIME reach completion in order', async () => {
  const f = fixture(); assert.equal((await f.run(proof)).status, 'completed');
  assert.deepEqual(names(f), ['readProof', 'uploadProof', 'complete']);
  assert.equal(f.calls[0].args[0], proof);
  assert.deepEqual(f.calls[1].args, ['student-a/quest-1/123.jpg', bytes, 'image/jpeg']);
  assert.deepEqual(f.calls[2].args, ['quest-1', 'student-a/quest-1/123.jpg', 'image/jpeg']);
});
test('legacy filename fallback and names without dots keep their path behavior', async () => {
  for (const [name, extension] of [['proof.', 'bin'], ['proof.!!!', 'bin'], ['proof', 'proof']]) {
    const f = fixture(); await f.run({ ...proof, name });
    assert.equal(f.calls[1].args[0], 'student-a/quest-1/123.' + extension);
  }
});
for (const phase of ['readProof', 'uploadProof', 'complete']) test(phase + ' failure removes allocated proof and preserves the original error', async () => {
  const f = fixture(); f.handlers[phase] = () => { throw new Error('Synthetic ' + phase + ' failure'); };
  const result = await f.run(proof);
  assert.equal(result.status, 'failed'); assert.equal(result.message, 'Synthetic ' + phase + ' failure');
  assert.equal(names(f).at(-1), 'removeProof'); assert.deepEqual(f.calls.at(-1).args, ['student-a/quest-1/123.jpg']);
  assert.equal(f.calls.filter(call => call.name === 'complete').length, phase === 'complete' ? 1 : 0);
});
test('plain RPC errors and missing-contract feedback remain usable', async () => {
  for (const [error, message] of [[{ message: 'Denied' }, 'Denied'], [{ code: 'PGRST202' }, 'Quest completion needs the context-aware database update (008).'], [null, 'Failed to complete quest.']]) {
    const f = fixture(); f.handlers.complete = () => { throw error; };
    assert.equal((await f.run()).message, message); assert.deepEqual(names(f), ['complete']);
  }
});
test('cleanup failure never replaces the mutation failure', async () => {
  const f = fixture(); f.handlers.complete = () => { throw { message: 'RPC offline' }; };
  f.handlers.removeProof = () => { throw Error('Removal offline'); };
  assert.equal((await f.run(proof)).message, 'RPC offline');
});
test('an already invalid session dispatches no IO', async () => {
  const f = fixture(); f.state.current = false;
  assert.equal((await f.run(proof)).status, 'cancelled'); assert.deepEqual(names(f), []);
});
for (const phase of ['readProof', 'uploadProof', 'complete']) test('invalidation during ' + phase + ' stops later work without cleanup', async () => {
  const f = fixture(), wait = deferred(); f.handlers[phase] = () => wait.promise;
  const task = f.run(proof); await flush(); f.state.current = false; wait.resolve(phase === 'readProof' ? bytes : undefined);
  assert.equal((await task).status, 'cancelled');
  assert.deepEqual(names(f), ['readProof', 'uploadProof', 'complete'].slice(0, ['readProof', 'uploadProof', 'complete'].indexOf(phase) + 1));
});
test('late thrown failure preserves its error and skips removal for the old session', async () => {
  const f = fixture(), wait = deferred(); f.handlers.uploadProof = () => wait.promise;
  const task = f.run(proof); await flush(); f.state.current = false; wait.reject({ message: 'Late upload failure' });
  assert.equal((await task).message, 'Late upload failure'); assert.deepEqual(names(f), ['readProof', 'uploadProof']);
});
test('acknowledged completion never removes proof', async () => {
  const f = fixture(); await f.run(proof); assert(!names(f).includes('removeProof'));
});
function productionFixture() {
  const calls = [], state = {};
  const { createQuestCompletionAdapter } = load('src/lib/quest-completion-adapter.ts', {
    fetch: async uri => { calls.push(['fetch', uri]); if (state.readError) throw state.readError; return { arrayBuffer: async () => bytes }; },
  });
  const client = {
    storage: { from: bucket => ({
      upload: async (...args) => { calls.push(['upload', bucket, ...args]); if (state.uploadThrows) throw state.uploadThrows; return { error: state.uploadError || null }; },
      remove: async paths => { calls.push(['remove', bucket, paths]); if (state.removeThrows) throw state.removeThrows; return { error: state.removeError || null }; },
    }) },
    rpc: async (...args) => { calls.push(['rpc', ...args]); if (state.rpcThrows) throw state.rpcThrows; return { error: state.rpcError || null }; },
  };
  return { calls, state, module: createQuestCompletion(createQuestCompletionAdapter(client), () => 123) };
}
const productionInput = { ownerId: 'student-a', questId: 'quest-1', proof, isCurrent: () => true };
test('production adapter preserves private bucket, upload options and RPC contract', async () => {
  const f = productionFixture(); assert.equal((await f.module.run(productionInput)).status, 'completed');
  assert.deepEqual(f.calls[0], ['fetch', proof.uri]);
  assert.equal(f.calls[1][0], 'upload'); assert.equal(f.calls[1][1], 'quest-proofs');
  assert.equal(f.calls[1][2], 'student-a/quest-1/123.jpg'); assert.equal(f.calls[1][3], bytes);
  assert.equal(f.calls[1][4].contentType, 'image/jpeg'); assert.equal(f.calls[1][4].upsert, false);
  assert.equal(f.calls[2][0], 'rpc'); assert.equal(f.calls[2][1], 'complete_quest');
  assert.equal(JSON.stringify(f.calls[2][2]), JSON.stringify({ quest_id_value: 'quest-1', proof_path_value: 'student-a/quest-1/123.jpg', proof_mime_type_value: 'image/jpeg' }));
});
for (const kind of ['uploadError', 'uploadThrows', 'rpcError', 'rpcThrows']) test('production ' + kind + ' triggers best-effort removal once', async () => {
  const f = productionFixture(); f.state[kind] = { message: kind };
  f.state.removeError = { message: 'Ignored returned removal error' };
  assert.equal((await f.module.run(productionInput)).message, kind);
  assert.equal(f.calls.filter(call => call[0] === 'rpc').length, kind.startsWith('upload') ? 0 : 1);
  assert.equal(f.calls.filter(call => call[0] === 'remove').length, 1);
  assert.equal(f.calls.at(-1)[1], 'quest-proofs'); assert.equal(f.calls.at(-1)[2][0], 'student-a/quest-1/123.jpg');
});
test('production removal rejection preserves RPC error without redispatch', async () => {
  const f = productionFixture(); f.state.rpcError = { code: 'PGRST202' }; f.state.removeThrows = Error('Removal failed');
  assert.match((await f.module.run(productionInput)).message, /database update [(]008[)]/);
  assert.equal(f.calls.filter(call => call[0] === 'rpc').length, 1);
});
(async () => {
  for (const { name, fn } of tests) { await fn(); console.log('PASS ' + name); }
  console.log(tests.length + ' quest completion tests passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
