const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.argv[2] || '@electric-sql/pglite');

const db = new PGlite();
const migration = name => fs.readFileSync(path.resolve(__dirname, name), 'utf8');
const ids = {
  admin: '10000000-0000-0000-0000-000000000001',
  first: '20000000-0000-0000-0000-000000000001',
  second: '20000000-0000-0000-0000-000000000002',
};

async function asUser(id, action) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec('set role authenticated');
  try { return await action(); } finally { await db.exec('reset role'); }
}

async function addUser(id, index) {
  const metadata = {
    student_number: `20260000${index}`, name: index === 1 ? 'Student One' : 'Student Two',
    course: 'BSCS', year_level: '4th Year', campus: 'Main Campus', section: 'A', goal: 'Improve',
  };
  await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)', [
    id, `student${index}@example.invalid`, JSON.stringify(metadata),
  ]);
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
  await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,'admin@example.invalid','{}')", [ids.admin]);
  await db.query("insert into public.admin_users(id,role) values($1,'super_admin')", [ids.admin]);
  await db.exec(migration('011_student_registration_validation.sql'));
  await db.query("insert into public.student_enrollment_options(course,year_level,campus,section) values('BSCS','4th Year','Main Campus','A')");
  await addUser(ids.first, 1);
  await addUser(ids.second, 2);
  await db.exec('grant all on public.profiles, public.students, public.quests, public.user_locations to authenticated; grant all on storage.objects to authenticated;');
  for (const file of [
    '012_wellbeing_and_osas_foundation.sql', '013_check_in_motivation.sql',
    '014_osas_support_staff_directory.sql', '015_osas_analytics_dashboard.sql',
    '016_system_hardening_phase_a.sql',
  ]) await db.exec(migration(file));

  let ordinaryQuest;
  let proofQuest;
  let secondQuest;
  await asUser(ids.first, async () => {
    await db.query("update public.profiles set display_name='Updated Student' where id=$1", [ids.first]);
    assert.equal((await db.query('select display_name from public.profiles where id=$1', [ids.first])).rows[0].display_name, 'Updated Student');
    await db.query("update public.students set goal='Updated goal' where id=$1", [ids.first]);

    for (const sql of [
      'update public.profiles set total_xp=9999 where id=$1',
      'update public.profiles set level=99 where id=$1',
      'update public.profiles set current_streak=999 where id=$1',
      "update public.students set status='Inactive' where id=$1",
    ]) await assert.rejects(db.query(sql, [ids.first]), /permission|policy/i);

    ordinaryQuest = (await db.query(
      "insert into public.quests(owner_id,title,category,xp) values($1,'Ordinary','Academics',25) returning id",
      [ids.first],
    )).rows[0].id;
    proofQuest = (await db.query(
      "insert into public.quests(owner_id,title,category,xp,requires_proof) values($1,'Proof','Academics',30,true) returning id",
      [ids.first],
    )).rows[0].id;

    await assert.rejects(db.query(
      "insert into public.quests(owner_id,title,category,xp,status) values($1,'Forged','Academics',25,'completed')",
      [ids.first],
    ), /permission|policy/i);
    await assert.rejects(db.query("update public.quests set status='completed' where id=$1", [ordinaryQuest]), /permission/i);
    await assert.rejects(db.query("update public.quests set completed_at=now() where id=$1", [ordinaryQuest]), /permission/i);
    await assert.rejects(db.query("update public.quests set proof_path='forged',proof_mime_type='x' where id=$1", [proofQuest]), /permission/i);
    await assert.rejects(db.query('select public.complete_quest($1,null,null)', [proofQuest]), /proof/i);

    await db.query('select public.complete_quest($1,null,null)', [ordinaryQuest]);
    const completed = (await db.query('select status,completed_at,proof_path from public.quests where id=$1', [ordinaryQuest])).rows[0];
    assert.equal(completed.status, 'completed');
    assert(completed.completed_at);
    assert.equal(completed.proof_path, null);
    assert.equal((await db.query('select total_xp from public.profiles where id=$1', [ids.first])).rows[0].total_xp, 25);
    assert.equal((await db.query('select count(*)::int count from public.quest_completion_history where quest_id=$1', [ordinaryQuest])).rows[0].count, 1);
  });

  await db.query("insert into storage.objects(bucket_id,name) values('quest-proofs',$1)", [
    `${ids.first}/${proofQuest}/evidence.jpg`,
  ]);
  await asUser(ids.first, async () => {
    await db.query("select public.complete_quest($1,$2,'image/jpeg')", [
      proofQuest, `${ids.first}/${proofQuest}/evidence.jpg`,
    ]);
    const proof = (await db.query('select status,proof_path,proof_mime_type,proof_submitted_at from public.quests where id=$1', [proofQuest])).rows[0];
    assert.equal(proof.status, 'completed');
    assert.equal(proof.proof_mime_type, 'image/jpeg');
    assert(proof.proof_submitted_at);
    assert.equal((await db.query('select total_xp from public.profiles where id=$1', [ids.first])).rows[0].total_xp, 55);

    await db.query(`insert into public.student_check_ins(
      student_id,check_in_date,overall_wellbeing,stress_level,energy_level
    ) values($1,current_date,3,3,3)`, [ids.first]);
    await assert.rejects(db.query(`insert into public.student_check_ins(
      student_id,check_in_date,overall_wellbeing,stress_level,energy_level
    ) values($1,current_date + 1,3,3,3)`, [ids.first]), /future/i);
    await db.query(`insert into public.self_management_reflections(
      student_id,quest_id,period_start,period_end,planning_score,follow_through_score,confidence_score
    ) values($1,$2,current_date - 6,current_date,4,4,4)`, [ids.first, ordinaryQuest]);
    await assert.rejects(db.query(`insert into public.self_management_reflections(
      student_id,period_start,period_end,planning_score,follow_through_score,confidence_score
    ) values($1,current_date,current_date + 1,4,4,4)`, [ids.first]), /future/i);
  });

  await asUser(ids.second, async () => {
    secondQuest = (await db.query(
      "insert into public.quests(owner_id,title,category,xp) values($1,'Second quest','Academics',20) returning id",
      [ids.second],
    )).rows[0].id;
    await assert.rejects(db.query(`insert into public.self_management_reflections(
      student_id,quest_id,period_start,period_end,planning_score,follow_through_score,confidence_score
    ) values($1,$2,current_date - 1,current_date,3,3,3)`, [ids.second, ordinaryQuest]), /belong/i);
    await db.query(`insert into public.self_management_reflections(
      student_id,quest_id,period_start,period_end,planning_score,follow_through_score,confidence_score
    ) values($1,$2,current_date - 1,current_date,3,3,3)`, [ids.second, secondQuest]);
  });

  // Suspension remains available through the existing authorized admin RPC.
  await asUser(ids.admin, () => db.query(
    "select public.admin_update_student($1,'202600001','Student One','student1@example.invalid','BSCS','4th Year','A','Main Campus','Updated goal','Inactive')",
    [ids.first],
  ));
  await asUser(ids.first, async () => {
    assert.equal((await db.query('select status from public.students where id=$1', [ids.first])).rows[0].status, 'Inactive');
    await assert.rejects(db.query("update public.students set status='Active' where id=$1", [ids.first]), /permission|policy/i);
    await assert.rejects(db.query(
      "insert into public.quests(owner_id,title,category,xp) values($1,'Blocked','Academics',20)", [ids.first],
    ), /policy/i);
    await assert.rejects(db.query(`insert into public.student_check_ins(
      student_id,check_in_date,overall_wellbeing,stress_level,energy_level
    ) values($1,current_date - 1,3,3,3)`, [ids.first]), /policy/i);
    await assert.rejects(db.query(`insert into public.support_requests(
      student_id,category,message,preferred_contact,consent_to_contact
    ) values($1,'academic','Help','email',true)`, [ids.first]), /policy/i);
    await assert.rejects(db.query('select public.complete_quest($1,null,null)', [ordinaryQuest]), /inactive/i);
  });

  console.log('PASS Phase A blocks forged progression/completion/reactivation and preserves validated operations');
  await db.close();
})().catch(async error => {
  console.error(error);
  await db.close();
  process.exitCode = 1;
});
