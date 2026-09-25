const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.argv[2] || '@electric-sql/pglite');
const db = new PGlite();
const ts = require('typescript');
const vm = require('node:vm');
function loadEngine(name) {
  const filename = path.resolve(__dirname, '../src/lib', name + '.ts');
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInThisContext('(function(require,module,exports){' + compiled + '\n})', { filename })(
    name => loadEngine(name.replace('./', '')), module, module.exports);
  return module.exports;
}
const { prioritizeQuests } = loadEngine('quest-priority');

const schema = name => fs.readFileSync(path.resolve(__dirname, '../../supabase', name), 'utf8');
let count = 0;
async function test(name, fn) { await fn(); count++; console.log('PASS ' + name); }
const owner = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
async function create(title, fields = {}, user = owner) {
  const values = { owner_id: user, title, category: 'Habits', ...fields };
  const keys = Object.keys(values);
  return (await db.query('insert into public.quests (' + keys.join(',') + ') values (' +
    keys.map((_, index) => '$' + (index + 1)).join(',') + ') returning *', Object.values(values))).rows[0];
}
const get = async id => (await db.query('select * from public.quests where id=$1', [id])).rows[0];
const complete = id => db.query('select public.complete_quest($1)', [id]);
(async () => {
  // Minimal Supabase infrastructure; all app tables/triggers come from real migrations.
  await db.exec(`
    create role authenticated; create role anon;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table storage.buckets(id text primary key, name text, public boolean);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1, '/') $$;
  `);
  // gen_random_uuid is built into PostgreSQL; this test runtime doesn't need pgcrypto.
  await db.exec(schema('001_initial_schema.sql').replace('create extension if not exists "pgcrypto";', ''));
  await db.exec(schema('002_locations_and_quest_places.sql'));
  await db.exec(schema('003_quest_proofs.sql'));
  await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)', [owner, 'test@example.invalid', other, 'other@example.invalid']);
  const legacy = await create('Legacy completion', { status: 'completed' });
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [owner]);

  await test('migration applies to existing schema and preserves legacy quests', async () => {
    await db.exec(schema('008_context_aware_quests.sql'));
    assert.equal((await get(legacy.id)).importance, 'normal');
    assert.equal((await db.query('select count(*)::int n from public.quest_completion_history where quest_id=$1', [legacy.id])).rows[0].n, 1);
  });
  const place = (await db.query('insert into public.user_locations(owner_id,name,latitude,longitude) values($1,$2,14.6,121) returning id', [owner, 'Place'])).rows[0].id;
  await test('all four location/time combinations persist', async () => {
    for (const location_id of [null, place]) {
      for (const preferred_time of [null, '10:00']) {
        const q = await create('Combination', { location_id, preferred_time });
        assert.equal(q.location_id, location_id);
        assert.equal(q.preferred_time, preferred_time && preferred_time + ':00');
      }
    }
  });
  await test('editing can add and clear context fields', async () => {
    const q = await create('Edit me');
    await db.query("update public.quests set scheduled_at='2026-09-25T10:00:00Z', deadline_at='2026-09-25T12:00:00Z', importance='high' where id=$1", [q.id]);
    assert.equal((await get(q.id)).importance, 'high');
    await db.query('update public.quests set scheduled_at=null, deadline_at=null, location_id=null where id=$1', [q.id]);
    assert.equal((await get(q.id)).scheduled_at, null);
  });
  await test('database rejects invalid schedule combinations', async () => {
    await assert.rejects(create('Both times', { scheduled_at: '2026-09-25T10:00Z', preferred_time: '10:00' }));
    await assert.rejects(create('Bad order', { scheduled_at: '2026-09-25T12:00Z', deadline_at: '2026-09-25T10:00Z' }));
    await assert.rejects(create('Bad importance', { importance: 'urgent' }));
    await assert.rejects(create('Bad preferred', { preferred_time: '24:00' }));
  });
  const parent = await create('Parent');
  const child = await create('Child', { prerequisite_quest_id: parent.id });
  await test('dependency cycles and cross-owner dependencies are rejected', async () => {
    await assert.rejects(db.query('update public.quests set prerequisite_quest_id=$1 where id=$2', [child.id, parent.id]));
    await assert.rejects(db.query('update public.quests set prerequisite_quest_id=id where id=$1', [parent.id]));
    await assert.rejects(create('Wrong owner', { prerequisite_quest_id: parent.id }, other));
    await assert.rejects(create('Wrong place', { location_id: place }, other));
  });
  await test('atomic completion stamps time, saves history, and awards XP once', async () => {
    const before = (await db.query('select total_xp from public.profiles where id=$1', [owner])).rows[0].total_xp;
    await complete(parent.id); await complete(parent.id);
    assert.equal((await get(parent.id)).status, 'completed');
    assert((await get(parent.id)).completed_at);
    const after = (await db.query('select total_xp from public.profiles where id=$1', [owner])).rows[0].total_xp;
    assert.equal(after - before, parent.xp);
    assert.equal((await db.query('select count(*)::int n from public.quest_completion_history where quest_id=$1', [parent.id])).rows[0].n, 1);
  });
  await test('editing a completed quest does not fabricate a new completion', async () => {
    await db.query("update public.quests set title='Changed later', updated_at=now() where id=$1", [parent.id]);
    const records = (await db.query('select * from public.quest_completion_history where quest_id=$1', [parent.id])).rows;
    assert.equal(records.length, 1); assert.equal(records[0].title, 'Parent');
  });
  await test('rank does not restrict manually completing a dependent quest', async () => {
    const p = await create('Unfinished parent');
    const c = await create('Manual choice', { prerequisite_quest_id: p.id, location_id: place, scheduled_at: '2099-01-01T12:00Z' });
    await complete(c.id);
    assert.equal((await get(c.id)).status, 'completed');
    assert.equal((await get(p.id)).status, 'active');
  });
  await test('proof remains required and a failed completion leaves no history or XP', async () => {
    const q = await create('Proof quest', { requires_proof: true });
    await assert.rejects(complete(q.id));
    assert.equal((await get(q.id)).status, 'active');
    assert.equal((await db.query('select count(*)::int n from public.quest_completion_history where quest_id=$1', [q.id])).rows[0].n, 0);
    await assert.rejects(db.query('select public.complete_quest($1,$2,$3)', [q.id, 'wrong/file.jpg', 'image/jpeg']));
    const proof = owner + '/' + q.id + '/proof.jpg';
    await db.query("insert into storage.objects(bucket_id,name) values('quest-proofs',$1)", [proof]);
    await db.query('select public.complete_quest($1,$2,$3)', [q.id, proof, 'image/jpeg']);
    assert.equal((await get(q.id)).proof_path, proof);
  });
  await test('another user cannot complete a quest', async () => {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [other]);
    await assert.rejects(complete(child.id));
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [owner]);
  });
  await test('deleting a quest retains history and clears dependent references', async () => {
    await db.query('delete from public.quests where id=$1', [parent.id]);
    assert.equal((await get(child.id)).prerequisite_quest_id, null);
    assert.equal((await db.query("select count(*)::int n from public.quest_completion_history where title='Parent' and quest_id is null")).rows[0].n, 1);
  });
  await test('history RLS separates users and disallows client fabrication', async () => {
    await db.exec('grant usage on schema public, auth to authenticated; set role authenticated;');
    assert((await db.query('select * from public.quest_completion_history')).rows.length > 0);
    await assert.rejects(db.query("insert into public.quest_completion_history(owner_id,title,category,completed_at) values($1,'fake','Habits',now())", [owner]));
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [other]);
    assert.equal((await db.query('select * from public.quest_completion_history')).rows.length, 0);
    await db.exec('reset role;');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [owner]);
  });
  await test('persisted context, edits and completion feed the actual ranking engine', async () => {
    const now = Date.now();
    const timed = await create('Roundtrip timed', { location_id: place, scheduled_at: new Date(now).toISOString() });
    const anytime = await create('Roundtrip anytime', { location_id: place });
    const rankSaved = async (coords = { latitude: 14.6, longitude: 121 }) => {
      const quests = (await db.query('select * from public.quests where id in ($1,$2)', [timed.id, anytime.id])).rows;
      const history = (await db.query('select * from public.quest_completion_history where owner_id=$1', [owner])).rows;
      const places = (await db.query('select * from public.user_locations where owner_id=$1', [owner])).rows;
      // Supabase REST serializes database timestamps as ISO strings.
      return prioritizeQuests(JSON.parse(JSON.stringify(quests)), {
        now, coords, locationUpdatedAt: now, places, history: JSON.parse(JSON.stringify(history)),
      });
    };
    assert.equal((await rankSaved())[0].quest.id, timed.id);
    assert.equal((await rankSaved())[0].tier, 'now');
    assert.notEqual((await rankSaved({ latitude: 15, longitude: 121 }))[0].tier, 'now');
    await db.query('update public.quests set scheduled_at=$1 where id=$2', [new Date(now + 86400000).toISOString(), timed.id]);
    assert.equal((await rankSaved())[0].quest.id, anytime.id);
    await complete(anytime.id);
    assert.equal((await rankSaved()).find(item => item.quest.id === anytime.id).tier, 'history');
  });
  await test('migration is safely repeatable without duplicating history', async () => {
    const before = (await db.query('select count(*)::int n from public.quest_completion_history')).rows[0].n;
    await db.exec(schema('008_context_aware_quests.sql'));
    assert.equal((await db.query('select count(*)::int n from public.quest_completion_history')).rows[0].n, before);
  });
  console.log(count + ' database integration tests passed.');
  await db.close();
})().catch(async error => { console.error(error); await db.close(); process.exitCode = 1; });
