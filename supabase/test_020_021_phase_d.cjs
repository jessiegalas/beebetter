const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.argv[2] || '@electric-sql/pglite');
const db = new PGlite();
const migration = name => fs.readFileSync(path.resolve(__dirname, name), 'utf8');
const admin = '10000000-0000-0000-0000-000000000001';
const students = Array.from({ length: 6 }, (_, i) => `20000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`);
async function asUser(id, action) { await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]); await db.exec('set role authenticated'); try { return await action(); } finally { await db.exec('reset role'); } }
(async () => {
  await db.exec(`
    create role authenticated; create role anon; create role service_role;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.role() returns text language sql as $$select current_user::text$$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb default '{}'::jsonb,created_at timestamptz default now());
    alter table storage.objects enable row level security;
    create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
    grant usage on schema public,auth,storage to authenticated,service_role;
  `);
  for (const number of ['001','002','003','004','005','006','007','008','009','010']) {
    const file = fs.readdirSync(__dirname).find(name => name.startsWith(number + '_'));
    await db.exec(migration(file).replace('create extension if not exists "pgcrypto";', ''));
  }
  await db.query("insert into auth.users values($1,'admin@example.invalid','{}')", [admin]);
  await db.query("insert into public.admin_users(id,role) values($1,'super_admin')", [admin]);
  await db.exec(migration('011_student_registration_validation.sql'));
  await db.query("insert into public.student_enrollment_options(course,year_level,campus,section) values('BSCS','4th Year','Main','A'),('BSCS','4th Year','Other','A')");
  for (let i = 0; i < students.length; i++) {
    const names = ['Student One','Student Two','Student Three','Student Four','Student Five','Student Six'];
    const metadata = { student_number: `20260000${i + 1}`, name: names[i], course: 'BSCS', year_level: '4th Year', campus: i === 5 ? 'Other' : 'Main', section: 'A', goal: 'Improve' };
    await db.query('insert into auth.users values($1,$2,$3)', [students[i], `student${i + 1}@example.invalid`, JSON.stringify(metadata)]);
  }
  await db.exec('grant all on public.profiles,public.students,public.quests,public.user_locations to authenticated; grant all on storage.objects to authenticated;');
  for (const file of ['012_wellbeing_and_osas_foundation.sql','013_check_in_motivation.sql','014_osas_support_staff_directory.sql','015_osas_analytics_dashboard.sql','016_system_hardening_phase_a.sql','017_admin_functionality_cleanup.sql','018_privacy_and_case_accountability.sql','019_osas_reporting_privacy.sql','020_longitudinal_data_foundation.sql','021_osas_longitudinal_analytics.sql']) await db.exec(migration(file));
  await asUser(admin, () => db.query('select public.super_admin_set_osas_permissions($1,true,true,true)', [admin]));

  let requestId;
  await asUser(students[0], async () => {
    requestId = (await db.query("insert into public.support_requests(student_id,category,message,preferred_contact,consent_to_contact) values($1,'academic','Need assistance','email',true) returning id", [students[0]])).rows[0].id;
  });
  await asUser(admin, async () => {
    await db.query("select public.osas_update_support_request($1,'in_progress',$2,'Initial follow-up')", [requestId, admin]);
    const events = (await db.query('select * from public.osas_list_support_request_events($1)', [requestId])).rows;
    assert.deepEqual(events.map(e => e.event_type).sort(), ['assigned', 'follow_up', 'status_changed', 'submitted']);
    await assert.rejects(db.query("update public.support_request_events set note='tampered' where request_id=$1", [requestId]), /permission|policy/i);
  });
  await asUser(students[0], () => db.query('select public.student_withdraw_support_request($1)', [requestId]));
  const withdrawn = (await db.query('select status,assigned_to,resolution_note,withdrawn_at from public.support_requests where id=$1', [requestId])).rows[0];
  assert.equal(withdrawn.status, 'withdrawn'); assert.equal(withdrawn.assigned_to, admin); assert.equal(withdrawn.resolution_note, 'Initial follow-up'); assert(withdrawn.withdrawn_at);

  await asUser(admin, async () => {
    await assert.rejects(db.query("select public.osas_dashboard_analytics(current_date-7,current_date,'Main','BSCS',null)"), /one demographic filter/i);
    const suppressed = (await db.query("select public.osas_dashboard_analytics(current_date-7,current_date,'Main',null,null) value")).rows[0].value;
    assert.equal(suppressed.suppressed, true);
    const released = (await db.query("select public.osas_dashboard_analytics(current_date-7,current_date,null,null,null) value")).rows[0].value;
    assert.equal(released.suppressed, false); assert.equal(released.participation.participating_students, null);
    await db.query("select public.osas_log_dashboard_export(current_date-7,current_date,null,null,null)");
    const actions = (await db.query('select action,outcome from public.osas_report_audit_log order by created_at')).rows;
    assert(actions.some(row => row.action === 'query' && row.outcome === 'suppressed'));
    assert(actions.some(row => row.action === 'export' && row.outcome === 'released'));
  });

  let questId;
  await asUser(students[0], async () => { questId = (await db.query("insert into public.quests(owner_id,title,category,xp,requires_proof) values($1,'Proof quest','Health',20,true) returning id", [students[0]])).rows[0].id; });
  const proofPath = `${students[0]}/${questId}/proof.pdf`;
  await db.query("insert into storage.objects(bucket_id,name,metadata) values('quest-proofs',$1,$2)", [proofPath, JSON.stringify({ mimetype: 'application/pdf', size: '10485761' })]);
  await asUser(students[0], () => assert.rejects(db.query("select public.complete_quest($1,$2,'application/pdf')", [questId, proofPath]), /10 MB/i));
  await db.query("update storage.objects set metadata=$2 where name=$1", [proofPath, JSON.stringify({ mimetype: 'application/pdf', size: '1024' })]);
  await asUser(students[0], () => db.query("select public.complete_quest($1,$2,'application/pdf')", [questId, proofPath]));
  assert.equal((await db.query('select status from public.quests where id=$1', [questId])).rows[0].status, 'completed');

  assert.equal((await db.query('select public.institutional_timezone() value')).rows[0].value, 'Asia/Manila');
  await asUser(admin, () => db.query("select * from public.admin_update_student($1,'202600006','Student Six','student6@example.invalid','BSCS','4th Year','A','Main','Improve','Active')", [students[5]]));
  const enrollmentPeriods = (await db.query('select campus,valid_to from public.student_enrollment_history where student_id=$1 order by valid_from', [students[5]])).rows;
  assert.equal(enrollmentPeriods.length, 2); assert.equal(enrollmentPeriods[0].campus, 'Other'); assert(enrollmentPeriods[0].valid_to); assert.equal(enrollmentPeriods[1].campus, 'Main'); assert.equal(enrollmentPeriods[1].valid_to, null);

  const lifecycleQuestIds = [];
  for (let i=0;i<students.length;i++) {
    const created = await asUser(students[i], () => db.query("insert into public.quests(owner_id,title,category,xp) values($1,'Lifecycle','Academics',10) returning id", [students[i]]));
    const id=created.rows[0].id; lifecycleQuestIds.push(id);
    if(i<5) await asUser(students[i], () => db.query('select public.complete_quest($1,null,null)', [id]));
  }
  await asUser(students[5], () => db.query('delete from public.quests where id=$1', [lifecycleQuestIds[5]]));
  assert.deepEqual((await db.query('select event_type from public.quest_lifecycle_events where quest_id=$1 order by occurred_at', [lifecycleQuestIds[5]])).rows.map(r=>r.event_type), ['created','deleted']);
  await asUser(students[0], () => assert.rejects(db.query("update public.quest_lifecycle_events set title='Changed' where quest_id=$1", [lifecycleQuestIds[0]]), /permission|policy/i));

  for(let i=0;i<5;i++) await asUser(students[i], () => db.query('insert into public.student_check_ins(student_id,overall_wellbeing,stress_level,energy_level,check_in_date) values($1,$2,3,3,current_date)', [students[i], i===0?1:5]));
  await asUser(students[0], () => db.query('insert into public.student_check_ins(student_id,overall_wellbeing,stress_level,energy_level,check_in_date) values($1,1,3,3,current_date-1)', [students[0]]));
  await asUser(admin, async () => {
    const analytics=(await db.query("select public.osas_dashboard_analytics(current_date-2,current_date,null,null,null) value")).rows[0].value;
    assert.equal(analytics.institutional_timezone,'Asia/Manila'); assert.equal(Number(analytics.wellbeing.average_wellbeing),4.2);
    assert(analytics.participation.quests_created >= 6); assert(analytics.participation.quests_completed >= 5); assert(analytics.participation.quest_completion_rate > 0);
  });

  await db.query("insert into public.quest_completion_history(owner_id,quest_id,title,category,completed_at) values($1,null,'Prior one','Habits',(current_date-1)::timestamp at time zone 'Asia/Manila'),($1,null,'Prior two','Habits',(current_date-2)::timestamp at time zone 'Asia/Manila')", [students[0]]);
  assert.equal((await db.query('select public.refresh_student_streak($1) value', [students[0]])).rows[0].value, 3);
  console.log('PASS Phase D institutional time, enrollment history, lifecycle denominators, student-weighted averages, and streaks');
  await db.close();
})().catch(async error => { console.error(error); await db.close(); process.exitCode = 1; });
