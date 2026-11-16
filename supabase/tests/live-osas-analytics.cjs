// Run with an installed @electric-sql/pglite package path as the first argument.
// The in-memory databases use the reporting-related tables from the schema snapshot.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.argv[2] || '@electric-sql/pglite');

const snapshotFile = fs.readFileSync(path.join(__dirname, '../../docs/agent/db-schema.sql'));
const snapshot = snapshotFile.toString(snapshotFile.readUInt16LE(0) === 0xfeff ? 'utf16le' : 'utf8');
const migration = fs.readFileSync(path.join(__dirname, '../migrations/044_live_osas_analytics.sql'), 'utf8');
const table = name => snapshot.match(new RegExp(`CREATE TABLE public\\.${name} \\(\\r?\\n[\\s\\S]*?\\r?\\n\\);`))[0];
const routine = name => snapshot.match(new RegExp(`CREATE FUNCTION public\\.${name}\\([\\s\\S]*?\\r?\\n\\$\\$;`))[0];
const id = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const from = '2026-09-01';
const through = '2026-09-30';

async function database(existingProvenance) {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    ${['students', 'quests', 'admin_users', 'quest_lifecycle_events', 'quest_completion_history',
      'student_check_ins', 'system_configuration', 'osas_report_audit_log'].map(table).join('\n')}
    alter table public.quests add primary key(id);
    create unique index created_once on public.quest_lifecycle_events(quest_id) where event_type='created';
    create unique index completed_once on public.quest_lifecycle_events(quest_id) where event_type='completed';
    insert into public.system_configuration(singleton,institutional_timezone) values(true,'Asia/Manila');
    ${['is_active_admin', 'has_osas_permission', 'institutional_timezone', 'record_quest_lifecycle_event'].map(routine).join('\n')}
    create trigger lifecycle after insert or delete or update of status on public.quests
      for each row execute function public.record_quest_lifecycle_event();
    ${existingProvenance ? `${table('admin_quest_assignments')}
      alter table public.admin_quest_assignments add primary key(original_quest_id),
        add unique(quest_id), add foreign key(quest_id) references public.quests(id) on delete set null;` : ''}
  `);
  await db.exec(migration);
  return db;
}

async function authenticate(db, student) {
  await db.exec('set role authenticated');
  await db.query('select set_config($1,$2,false)', ['request.jwt.claim.sub', id(student)]);
}

async function report(db, start = from, end = through) {
  return (await db.query('select public.osas_dashboard_analytics_v2($1,$2) result', [start, end])).rows[0].result;
}

async function event(db, { quest, student, kind, date, category = 'Habits', status = null, origin = null, recordedAt = date }) {
  await db.query(`insert into public.quest_lifecycle_events
    (quest_id,owner_id,event_type,title,category,xp,occurred_at,recorded_at,to_status,student_created)
    values($1,$2,$3,'Private fixture text',$4,20,$5,$6,$7,$8)`,
  [id(quest), id(student), kind, category, date, recordedAt, status, origin]);
}

async function verify() {
  const clean = await database(false);
  await clean.close();
  const db = await database(true);
  try {
    for (const student of [...Array.from({ length: 11 }, (_, i) => i+1), 98, 99]) {
      await db.query('insert into auth.users(id) values($1)', [id(student)]);
      await db.query(`insert into public.students(id,student_number,name,email,created_at) values($1,$2,'','',$3)`,
        [id(student), String(student).padStart(9, '0'), student === 11 ? '2026-09-28T00:00:00+08:00' : '2026-09-01T00:00:00+08:00']);
    }
    await db.query('insert into public.admin_users(id,is_active) values($1,true),($2,false)', [id(99), id(98)]);

    await db.exec('set role anon');
    await assert.rejects(report(db), /permission denied/);
    await db.exec('reset role');
    await authenticate(db, 1);
    await assert.rejects(report(db), /OSAS aggregate permission required/);
    await assert.rejects(db.query('select public.admin_get_quest_activity_code($1)', [id(500)]), /Active admin access required/);
    await db.exec('reset role');
    await authenticate(db, 98);
    await assert.rejects(report(db), /OSAS aggregate permission required/);
    await db.exec('reset role');

    // Exercise the actor-based provenance trigger with a student-authored quest.
    await db.query('select set_config($1,$2,false)', ['request.jwt.claim.sub', id(1)]);
    await db.query(`insert into public.quests(id,owner_id,title,category,created_at)
      values($1,$2,'Private fixture text','Habits','2026-09-03T08:00:00+08:00')`, [id(101),id(1)]);
    assert.equal((await db.query('select student_created from public.quest_lifecycle_events where quest_id=$1', [id(101)])).rows[0].student_created,true);

    await authenticate(db, 99);
    const issued = (await db.query(`select * from public.admin_create_quest('Activity title','', 'Academics',20,'active')`)).rows;
    assert.equal(issued.length, 11);
    const codes = [];
    for (const quest of issued) codes.push((await db.query('select public.admin_get_quest_activity_code($1) value',[quest.id])).rows[0].value);
    assert.ok(codes[0]);
    assert.equal(new Set(codes).size, 1);
    const draft = (await db.query(`select * from public.admin_create_quest('Draft','', 'Health',20,'pending',$1)`,[id(1)])).rows[0];
    assert.equal((await db.query('select public.admin_get_quest_activity_code($1) value',[draft.id])).rows[0].value, null);
    await db.query(`select public.admin_update_quest($1,'Draft','', 'Social',20,'active')`,[draft.id]);
    const draftCode = (await db.query('select public.admin_get_quest_activity_code($1) value',[draft.id])).rows[0].value;
    assert.ok(draftCode);
    await db.query(`select public.admin_update_quest($1,'Edited draft','', 'Health',20,'pending')`,[draft.id]);
    await db.query(`select public.admin_update_quest($1,'Republished draft','', 'Health',20,'active')`,[draft.id]);
    assert.equal((await db.query('select public.admin_get_quest_activity_code($1) value',[draft.id])).rows[0].value, draftCode);
    const recent = await db.query('select public.osas_dashboard_analytics_v2(current_date-1,current_date+1) report');
    assert.equal(recent.rows[0].report.assignment_outcomes[0].in_progress, true);
    assert.equal(recent.rows[0].report.assignment_outcomes[0].completed, null);
    await db.exec('reset role');
    assert.equal((await db.query('select published_category from public.admin_quest_assignments where original_quest_id=$1',[draft.id])).rows[0].published_category,'Social');

    // Put the verified batch in a past reporting window and seed durable events.
    await db.query(`update public.admin_quest_assignments set published_at='2026-09-08T00:00:00+08:00' where publish_batch_id=$1`, [codes[0]]);
    for (let student=1; student<=10; student++) {
      if (student>=2 && student<=5) await event(db,{quest:100+student,student,kind:'created',date:'2026-09-03T08:00:00+08:00',origin:true});
      if (student<=5) {
        await event(db,{quest:100+student,student,kind:'completed',date:'2026-09-04T08:00:00+08:00'});
        await event(db,{quest:300+student,student,kind:'completed',date:'2026-09-16T08:00:00+08:00'});
        await db.query(`insert into public.student_check_ins(student_id,check_in_date,overall_wellbeing,stress_level,energy_level,note)
          values($1,'2026-09-09',$2,3,4,'Private check-in note')`,[id(student),student===1?1:5]);
      }
      await event(db,{quest:200+student,student,kind:'completed',date:'2026-09-08T00:00:00+08:00'});
      await db.query('insert into public.admin_quest_assignments(original_quest_id,owner_id) values($1,$2)', [id(400+student),id(student)]);
      await event(db,{quest:400+student,student,kind:'created',date:'2026-09-09T08:00:00+08:00',status:'active',category:'Health'});
      if (student<=5) await event(db,{quest:400+student,student,kind:'completed',date:'2026-09-10T08:00:00+08:00',category:'Health'});
    }
    await db.query(`insert into public.student_check_ins(student_id,check_in_date,overall_wellbeing,stress_level,energy_level)
      values($1,'2026-09-10',5,3,4)`,[id(1)]);
    await db.query(`insert into public.student_check_ins(student_id,check_in_date,overall_wellbeing,stress_level,energy_level)
      select id,'2026-09-17',3,3,4 from public.students where id between $1 and $2`,[id(1),id(7)]);
    await db.query('insert into public.admin_quest_assignments(original_quest_id,owner_id) values($1,$2)',[id(450),id(11)]);
    await event(db,{quest:450,student:11,kind:'created',date:'2026-09-09T08:00:00+08:00',recordedAt:'2026-10-01T08:00:00+08:00',status:'active',category:'Health'});
    for (const [index, hours] of [1,5,25,30,40,336].entries()) {
      const quest = issued.find(row => row.owner_id===id(index+1));
      await db.query(`insert into public.quest_lifecycle_events(quest_id,owner_id,event_type,title,category,xp,occurred_at)
        values($1,$2,'completed','Activity title','Academics',20,'2026-09-08T00:00:00+08:00'::timestamptz + $3 * interval '1 hour')`,
      [quest.id,quest.owner_id,hours]);
      if (index===0) await db.query('delete from public.quests where id=$1',[quest.id]);
    }

    await authenticate(db, 99);
    const data = await report(db);
    assert.equal(data.participation.registered_students,11);
    assert.deepEqual(data.first_week,{eligible:10,completed:5,rate:50});
    assert.deepEqual(data.student_interests.find(row=>row.category==='Habits'), {category:'Habits',creators:5,completers:5});
    assert.equal(data.student_interests.find(row=>row.category==='Academics').creators,null);
    const repeat = data.repeat_participation.find(row=>row.week_start==='2026-09-07');
    assert.deepEqual(repeat, {week_start:'2026-09-07',next_week_start:'2026-09-14',eligible:10,completed:5,rate:50});
    const weekly = data.wellbeing_trends.find(row=>row.bucket_start==='2026-09-07');
    assert.equal(weekly.average_wellbeing,4.6);
    assert.equal(weekly.student_count,5);
    assert.equal(weekly.registered_students,10);
    assert.equal(weekly.coverage,50);
    const smallComplement = data.wellbeing_trends.find(row=>row.bucket_start==='2026-09-14');
    assert.equal(smallComplement.student_count,null);
    assert.equal(smallComplement.coverage,null);
    assert.equal(smallComplement.average_wellbeing,null);
    assert.equal(data.wellbeing,null);
    assert.equal(data.wellbeing_trends[0].partial,true);
    assert.equal(data.wellbeing_trends.at(-1).partial,true);
    assert.deepEqual(data.assignment_outcomes.find(row=>row.activity_code===codes[0]),{
      activity_code:codes[0],published_date:'2026-09-08',category:'Academics',assigned:11,in_progress:false,completed:5,rate:45.5,median_hours:25,
    });
    assert.equal(data.assignment_outcomes.find(row=>row.activity_code===null).assigned,10);
    assert.equal(JSON.stringify(data).includes('Private'),false);
    assert.equal(JSON.stringify(data).includes('Activity title'),false);

    await db.query('select public.osas_log_dashboard_export_v2($1,$2)',[from,through]);
    assert.equal((await report(db,'2026-08-01','2026-08-02')).suppressed,true);
    await assert.rejects(db.query('select public.osas_log_dashboard_export_v2($1,$2)',['2026-08-01','2026-08-02']), /suppressed/);
    await db.exec('reset role');
    const audit = (await db.query(`select action,outcome from public.osas_report_audit_log where period_start='2026-09-01' order by action`)).rows;
    assert.deepEqual(audit,[{action:'export',outcome:'released'},{action:'query',outcome:'released'}]);
    console.log('PASS live OSAS analytics, publication batches, privacy, and audit on disposable PostgreSQL fixtures');
  } finally {
    await db.close();
  }
}

verify().catch(error => { console.error(error); process.exitCode = 1; });
