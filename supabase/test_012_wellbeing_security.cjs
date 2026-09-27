const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.argv[2] || '@electric-sql/pglite');

const db = new PGlite();
const migration = name => fs.readFileSync(path.resolve(__dirname, name), 'utf8');
const ids = {
  superAdmin: '10000000-0000-0000-0000-000000000001',
  regularAdmin: '11000000-0000-0000-0000-000000000002',
  aggregateStaff: '12000000-0000-0000-0000-000000000003',
  supportStaff: '13000000-0000-0000-0000-000000000004',
  students: Array.from({ length: 6 }, (_, index) => `${20 + index}000000-0000-0000-0000-00000000000${index + 1}`),
};

async function asUser(id, action) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec('set role authenticated');
  try { return await action(); } finally { await db.exec('reset role'); }
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
    grant usage on schema public, auth to authenticated;
  `);

  for (const number of ['001', '002', '003', '004', '005', '006', '007', '008', '009', '010']) {
    const filename = fs.readdirSync(__dirname).find(name => name.startsWith(number + '_'));
    const sql = migration(filename).replace('create extension if not exists "pgcrypto";', '');
    await db.exec(sql);
  }

  const adminIds = [ids.superAdmin, ids.regularAdmin, ids.aggregateStaff, ids.supportStaff];
  for (const [index, id] of adminIds.entries()) {
    await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)', [
      id, `admin${index}@example.invalid`, JSON.stringify({ display_name: `Admin ${index}` }),
    ]);
  }
  for (const id of adminIds) await db.query('insert into public.admin_users(id) values($1)', [id]);
  await db.query("update public.admin_users set role='super_admin' where id=$1", [ids.superAdmin]);

  await db.exec(migration('011_student_registration_validation.sql'));
  await db.query("insert into public.student_enrollment_options(course,year_level,campus,section) values('BSCS','4th Year','Main Campus','A')");
  for (const [index, id] of ids.students.entries()) {
    const metadata = {
      student_number: `20260000${index + 1}`, name: `Student ${String.fromCharCode(65 + index)}`,
      course: 'BSCS', year_level: '4th Year', campus: 'Main Campus', section: 'A', goal: 'Build healthy routines',
    };
    await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)', [id, `student${index}@example.invalid`, JSON.stringify(metadata)]);
  }
  await db.exec(migration('012_wellbeing_and_osas_foundation.sql'));
  await db.exec(migration('012_wellbeing_and_osas_foundation.sql'));
  await db.exec(migration('013_check_in_motivation.sql'));
  await db.exec(migration('014_osas_support_staff_directory.sql'));
  await db.exec(migration('014_osas_support_staff_directory.sql'));
  await db.exec(migration('015_osas_analytics_dashboard.sql'));
  await db.exec(migration('015_osas_analytics_dashboard.sql'));

  for (const [index, id] of ids.students.entries()) {
    await asUser(id, () => db.query(
      'insert into public.student_check_ins(student_id,check_in_date,overall_wellbeing,stress_level,energy_level,note) values($1,$2,$3,3,4,$4)',
      [id, `2026-09-${20 + index}`, 3 + (index % 2), `Private note ${index}`],
    ));
  }

  await asUser(ids.students[0], async () => {
    assert.equal((await db.query('select count(*)::int count from public.student_check_ins')).rows[0].count, 1);
    await db.query(`
      insert into public.student_check_ins(student_id,check_in_date,overall_wellbeing,stress_level,energy_level,note)
      values($1,'2026-09-20',5,2,5,'Updated private note')
      on conflict(student_id,check_in_date) do update set overall_wellbeing=excluded.overall_wellbeing,
        stress_level=excluded.stress_level,energy_level=excluded.energy_level,note=excluded.note
    `, [ids.students[0]]);
    const updatedCheckIn = (await db.query('select * from public.student_check_ins')).rows[0];
    assert.equal(updatedCheckIn.overall_wellbeing, 5);
    assert.equal((await db.query('select count(*)::int count from public.student_check_ins')).rows[0].count, 1);
    await assert.rejects(db.query(
      'insert into public.student_check_ins(student_id,overall_wellbeing,stress_level,energy_level) values($1,3,3,3)',
      [ids.students[1]],
    ));
    await db.query(`
      insert into public.self_management_reflections(
        student_id,period_start,period_end,planning_score,follow_through_score,confidence_score,challenge
      ) values($1,'2026-09-20','2026-09-26',4,3,4,'Private challenge')
    `, [ids.students[0]]);
  });
  await asUser(ids.students[1], async () => {
    assert.equal((await db.query('select count(*)::int count from public.self_management_reflections')).rows[0].count, 0);
    await assert.rejects(db.query(`
      insert into public.self_management_reflections(
        student_id,period_start,period_end,planning_score,follow_through_score,confidence_score
      ) values($1,'2026-09-20','2026-09-26',3,3,3)
    `, [ids.students[0]]));
  });

  await asUser(ids.regularAdmin, async () => {
    assert.equal((await db.query('select count(*)::int count from public.student_check_ins')).rows[0].count, 0);
    await assert.rejects(db.query("select * from public.osas_check_in_summary('2026-09-01','2026-09-30','all')"), /permission/i);
    await assert.rejects(db.query("select public.osas_dashboard_analytics('2026-09-01','2026-09-30',null,null,null)"), /permission/i);
    await assert.rejects(db.query('select * from public.osas_list_support_staff()'), /permission/i);
  });

  await asUser(ids.superAdmin, async () => {
    await db.query('select public.super_admin_set_osas_permissions($1,true,false,true)', [ids.aggregateStaff]);
    await db.query('select public.super_admin_set_osas_permissions($1,false,true,true)', [ids.supportStaff]);
  });
  for (const [index, id] of ids.students.entries()) {
    await db.query(`insert into public.quest_completion_history(owner_id,title,category,completed_at)
      values($1,$2,'Academics',$3)`, [id, `Completed quest ${index + 1}`, `2026-09-${20 + index}`]);
  }

  await asUser(ids.aggregateStaff, async () => {
    assert.equal((await db.query('select count(*)::int count from public.student_check_ins')).rows[0].count, 0);
    const summary = (await db.query("select * from public.osas_check_in_summary('2026-09-01','2026-09-30','all')")).rows[0];
    assert.equal(Number(summary.student_count), 6);
    assert.equal(Number(summary.check_in_count), 6);
    assert.equal((await db.query("select * from public.osas_check_in_summary('2026-09-20','2026-09-23','all')")).rows.length, 0);
    const dashboard = (await db.query("select public.osas_dashboard_analytics('2026-09-01','2026-09-30',null,null,null) dashboard")).rows[0].dashboard;
    assert.equal(dashboard.suppressed, false);
    assert.equal(Number(dashboard.participation.registered_students), 6);
    assert.equal(Number(dashboard.participation.participating_students), 6);
    assert.equal(Number(dashboard.participation.completion_events), 6);
    assert.equal(dashboard.category_participation.length, 1);
    assert.equal(dashboard.category_participation[0].category, 'Academics');
    assert.equal(Number(dashboard.wellbeing.student_count), 6);
    assert.equal(Number(dashboard.wellbeing.check_in_count), 6);
    assert.equal(dashboard.self_management, null);
    assert.equal(dashboard.support, null);
    assert.equal(JSON.stringify(dashboard).includes('Private note'), false);
    const suppressed = (await db.query("select public.osas_dashboard_analytics('2026-09-01','2026-09-30','Other Campus',null,null) dashboard")).rows[0].dashboard;
    assert.equal(suppressed.suppressed, true);
    assert.equal(suppressed.participation, null);
    const options = (await db.query('select * from public.osas_dashboard_filter_options()')).rows;
    assert(options.some(option => option.dimension === 'campus' && option.value === 'Main Campus'));
    await assert.rejects(db.query("select public.osas_dashboard_analytics('2026-09-30','2026-09-01',null,null,null)"), /valid reporting period/i);
    await assert.rejects(db.query('select * from public.osas_list_support_requests(null)'), /permission/i);
  });

  let supportId;
  await asUser(ids.students[0], async () => {
    await assert.rejects(db.query(`
      insert into public.support_requests(student_id,category,message,preferred_contact,consent_to_contact)
      values($1,'personal','No consent','email',false)
    `, [ids.students[0]]));
    supportId = (await db.query(`
      insert into public.support_requests(student_id,category,message,preferred_contact,consent_to_contact)
      values($1,'personal','I would like to talk.','email',true) returning id
    `, [ids.students[0]])).rows[0].id;
  });
  await asUser(ids.students[1], async () => {
    assert.equal((await db.query('select count(*)::int count from public.support_requests')).rows[0].count, 0);
    await assert.rejects(db.query('select public.student_withdraw_support_request($1)', [supportId]));
  });
  await asUser(ids.supportStaff, async () => {
    const directory = (await db.query('select * from public.osas_list_support_staff()')).rows;
    assert.deepEqual(directory.map(person => person.id), [ids.supportStaff]);
    const cases = (await db.query('select * from public.osas_list_support_requests(null)')).rows;
    assert.equal(cases.length, 1);
    assert.equal(cases[0].student_id, ids.students[0]);
    assert.equal((await db.query('select count(*)::int count from public.student_check_ins')).rows[0].count, 0);
    assert.equal((await db.query('select count(*)::int count from public.self_management_reflections')).rows[0].count, 0);
    await assert.rejects(db.query("select public.osas_update_support_request($1,'in_progress',$2,null)", [supportId, ids.aggregateStaff]), /assignee/i);
    await db.query("select public.osas_update_support_request($1,'in_progress',$2,null)", [supportId, ids.supportStaff]);
  });
  await asUser(ids.students[0], async () => {
    assert.equal((await db.query('select status from public.support_requests where id=$1', [supportId])).rows[0].status, 'in_progress');
    await db.query('select public.student_withdraw_support_request($1)', [supportId]);
    assert.equal((await db.query('select status from public.support_requests where id=$1', [supportId])).rows[0].status, 'withdrawn');
  });
  await asUser(ids.supportStaff, async () => {
    await assert.rejects(db.query("select public.osas_update_support_request($1,'resolved',$2,'Completed follow-up')", [supportId, ids.supportStaff]), /withdrawn/i);
  });

  let resolvedId;
  await asUser(ids.students[2], async () => {
    resolvedId = (await db.query(`insert into public.support_requests(student_id,category,message,preferred_contact,contact_detail,consent_to_contact,priority)
      values($1,'academic','Need academic guidance.','email','student2@example.invalid',true,'soon') returning id`, [ids.students[2]])).rows[0].id;
  });
  await asUser(ids.supportStaff, async () => {
    await db.query("select public.osas_update_support_request($1,'resolved',$2,'Guidance appointment completed')", [resolvedId, ids.supportStaff]);
    const resolved = (await db.query('select status,resolution_note,resolved_at from public.support_requests where id=$1', [resolvedId])).rows[0];
    assert.equal(resolved.status, 'resolved'); assert.equal(resolved.resolution_note, 'Guidance appointment completed'); assert(resolved.resolved_at);
  });
  await asUser(ids.superAdmin, async () => {
    await db.query("select public.super_admin_update_admin($1,'admin',false)", [ids.supportStaff]);
  });
  await asUser(ids.supportStaff, async () => {
    await assert.rejects(db.query('select * from public.osas_list_support_requests(null)'), /permission/i);
  });
  await asUser(ids.superAdmin, async () => {
    await db.query("select public.super_admin_update_admin($1,'admin',true)", [ids.supportStaff]);
  });
  await asUser(ids.supportStaff, async () => {
    assert.equal((await db.query('select * from public.osas_list_support_staff()')).rows.length, 1);
  });

  for (let index = 1; index < ids.students.length; index += 1) {
    await asUser(ids.students[index], () => db.query(`insert into public.self_management_reflections(
      student_id,period_start,period_end,planning_score,follow_through_score,confidence_score
    ) values($1,'2026-09-20','2026-09-26',4,3,4)`, [ids.students[index]]));
  }
  for (const index of [1, 3, 4, 5]) {
    await asUser(ids.students[index], () => db.query(`insert into public.support_requests(
      student_id,category,message,preferred_contact,consent_to_contact
    ) values($1,'academic','Request for academic support.','email',true)`, [ids.students[index]]));
  }
  await asUser(ids.aggregateStaff, async () => {
    const dashboard = (await db.query("select public.osas_dashboard_analytics('2026-09-01','2026-09-30',null,null,null) dashboard")).rows[0].dashboard;
    assert.equal(Number(dashboard.self_management.student_count), 6);
    assert.equal(Number(dashboard.self_management.reflection_count), 6);
    assert.equal(Number(dashboard.support.student_count), 6);
    assert.equal(Number(dashboard.support.request_count), 6);
    assert.equal(Number(dashboard.support.submitted_count), 4);
    assert.equal(Number(dashboard.support.resolved_count), 1);
    assert.equal(Number(dashboard.support.withdrawn_count), 1);
    assert.equal(dashboard.support_categories.length, 1);
    assert.equal(dashboard.support_categories[0].category, 'academic');
    assert.equal(JSON.stringify(dashboard).includes('Request for academic support'), false);
    assert.equal(JSON.stringify(dashboard).includes('Private challenge'), false);
  });

  await asUser(ids.superAdmin, async () => {
    await db.query('select public.super_admin_set_osas_permissions($1,false,false,true)', [ids.supportStaff]);
    await db.query('select public.super_admin_set_osas_permissions($1,false,false,true)', [ids.aggregateStaff]);
    assert.equal((await db.query('select count(*)::int count from public.osas_staff_permissions')).rows[0].count, 0);
  });
  await asUser(ids.supportStaff, async () => {
    await assert.rejects(db.query('select * from public.osas_list_support_requests(null)'), /permission/i);
    await assert.rejects(db.query('select * from public.osas_list_support_staff()'), /permission/i);
  });
  await asUser(ids.aggregateStaff, async () => {
    await assert.rejects(db.query("select * from public.osas_check_in_summary('2026-09-01','2026-09-30','all')"), /permission/i);
    await assert.rejects(db.query("select public.osas_dashboard_analytics('2026-09-01','2026-09-30',null,null,null)"), /permission/i);
  });

  console.log('PASS wellness privacy and Phase 4 support authorization workflows');
  await db.close();
})().catch(async error => {
  console.error(error);
  await db.close();
  process.exitCode = 1;
});
