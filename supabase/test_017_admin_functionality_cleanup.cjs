const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.argv[2] || '@electric-sql/pglite');
const db = new PGlite();
const migration = name => fs.readFileSync(path.resolve(__dirname, name), 'utf8');
const ids = {
  superAdmin: '10000000-0000-0000-0000-000000000001',
  disabledAdmin: '11000000-0000-0000-0000-000000000002',
  first: '20000000-0000-0000-0000-000000000001',
  second: '20000000-0000-0000-0000-000000000002',
};
async function asUser(id, action) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec('set role authenticated');
  try { return await action(); } finally { await db.exec('reset role'); }
}
async function addUser(id, email, metadata) {
  await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)', [id, email, JSON.stringify(metadata)]);
}
(async () => {
  await db.exec(`
    create role authenticated; create role anon;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create table storage.buckets(id text primary key, name text, public boolean);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1, '/') $$;
    grant usage on schema public, auth, storage to authenticated;
  `);
  for (const number of ['001','002','003','004','005','006','007','008','009','010']) {
    const file = fs.readdirSync(__dirname).find(name => name.startsWith(number + '_'));
    await db.exec(migration(file).replace('create extension if not exists "pgcrypto";', ''));
  }
  await addUser(ids.superAdmin, 'super@example.invalid', { display_name: 'Super Admin' });
  await addUser(ids.disabledAdmin, 'disabled@example.invalid', { display_name: 'Disabled Admin' });
  await db.query("insert into public.admin_users(id,role) values($1,'super_admin'),($2,'admin')", [ids.superAdmin, ids.disabledAdmin]);
  await db.exec(migration('011_student_registration_validation.sql'));
  await db.query("insert into public.student_enrollment_options(course,year_level,campus,section) values('BSCS','4th Year','Main Campus','A')");
  const student = (number, name) => ({ student_number: number, name, course: 'BSCS', year_level: '4th Year', campus: 'Main Campus', section: 'A', goal: 'Improve' });
  await addUser(ids.first, 'one@example.invalid', student('202600001', 'Student One'));
  await addUser(ids.second, 'two@example.invalid', student('202600002', 'Student Two'));
  await db.exec('grant all on public.profiles, public.students, public.quests, public.user_locations to authenticated; grant all on storage.objects to authenticated;');
  for (const file of [
    '012_wellbeing_and_osas_foundation.sql', '013_check_in_motivation.sql',
    '014_osas_support_staff_directory.sql', '015_osas_analytics_dashboard.sql',
    '016_system_hardening_phase_a.sql', '017_admin_functionality_cleanup.sql',
  ]) await db.exec(migration(file));

  await asUser(ids.first, async () => {
    assert.equal((await db.query('select * from public.admin_get_my_role()')).rows.length, 0);
    await assert.rejects(db.query(
      "select * from public.admin_create_quest('Unauthorized','No','Academics',20,'active',null)",
    ), /active admins/i);
  });

  let firstQuest;
  await asUser(ids.superAdmin, async () => {
    const students = (await db.query('select * from public.admin_list_students()')).rows;
    assert.deepEqual(students.map(row => row.id).sort(), [ids.first, ids.second].sort());

    await assert.rejects(db.query(
      "select * from public.admin_create_quest('Admin quest','No','Academics',20,'active',$1)",
      [ids.disabledAdmin],
    ), /selected student/i);

    const created = (await db.query(
      "select * from public.admin_create_quest('Shared quest','Original','Academics',20,'active',null)",
    )).rows;
    assert.equal(created.length, 2);
    assert.deepEqual(created.map(row => row.owner_id).sort(), [ids.first, ids.second].sort());
    firstQuest = created.find(row => row.owner_id === ids.first).id;

    const beforeCount = (await db.query('select count(*)::int count from public.admin_list_quests()')).rows[0].count;
    const edited = (await db.query(
      "select (public.admin_update_quest($1,'Edited quest','Updated once','Health',35,'pending')).*",
      [firstQuest],
    )).rows[0];
    const afterCount = (await db.query('select count(*)::int count from public.admin_list_quests()')).rows[0].count;
    assert.equal(afterCount, beforeCount);
    assert.equal(edited.title, 'Edited quest');
    assert.equal(edited.description, 'Updated once');
    assert.equal(edited.category, 'Health');
    assert.equal(edited.xp, 35);
    assert.equal(edited.status, 'pending');
    assert.equal(edited.owner_id, ids.first);
    const untouched = (await db.query("select count(*)::int count from public.admin_list_quests() where title='Shared quest'")).rows[0].count;
    assert.equal(untouched, 1);

    await db.query("select public.super_admin_update_admin($1,'admin',false)", [ids.disabledAdmin]);
  });

  await asUser(ids.disabledAdmin, async () => {
    assert.equal((await db.query('select * from public.admin_get_my_role()')).rows[0].is_active, false);
    assert.equal((await db.query('select * from public.admin_list_students()')).rows.length, 0);
    await assert.rejects(db.query(
      "select * from public.admin_create_quest('Disabled','No','Academics',20,'active',null)",
    ), /active admins/i);
    await assert.rejects(db.query(
      "select public.admin_update_quest($1,'Disabled','No','Academics',20,'active')", [firstQuest],
    ), /active admins/i);
  });

  // Completed assignments remain immutable through the admin edit RPC.
  await db.query("update public.quests set status='active' where id=$1", [firstQuest]);
  await asUser(ids.first, () => db.query('select public.complete_quest($1,null,null)', [firstQuest]));
  await asUser(ids.superAdmin, async () => {
    await assert.rejects(db.query(
      "select public.admin_update_quest($1,'Rewrite completion','No','Academics',20,'active')", [firstQuest],
    ), /not found/i);
    const listed = (await db.query('select * from public.admin_list_quests()')).rows;
    assert.equal(listed.length, 2);
    assert(listed.every(row => row.owner_id !== ids.superAdmin && row.owner_id !== ids.disabledAdmin));
  });

  console.log('PASS Phase B enforces admin gating, student separation, and in-place quest editing');
  await db.close();
})().catch(async error => {
  console.error(error);
  await db.close();
  process.exitCode = 1;
});
