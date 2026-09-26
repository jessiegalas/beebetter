const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.argv[2] || '@electric-sql/pglite');
const db = new PGlite();
const sql = name => fs.readFileSync(path.resolve(__dirname, name), 'utf8');
(async () => {
  await db.exec('create table public.student_check_ins(id uuid primary key default gen_random_uuid());');
  await db.exec(sql('013_check_in_motivation.sql')); await db.exec(sql('013_check_in_motivation.sql'));
  await db.query('insert into public.student_check_ins(motivation_level) values($1),($2)', [null, 3]);
  await assert.rejects(db.query('insert into public.student_check_ins(motivation_level) values(0)'));
  await assert.rejects(db.query('insert into public.student_check_ins(motivation_level) values(6)'));
  assert.equal((await db.query('select count(*)::int count from public.student_check_ins')).rows[0].count, 2);
  console.log('PASS migration 013 is repeatable and validates optional motivation'); await db.close();
})().catch(async error => { console.error(error); await db.close(); process.exitCode = 1; });
