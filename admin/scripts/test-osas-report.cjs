const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const filename = path.resolve(__dirname, '../src/osas-report.ts');
const source = fs.readFileSync(filename, 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 } }).outputText;
const reportModule = new Module(filename, module); reportModule.filename = filename; reportModule.paths = module.paths; reportModule._compile(compiled, filename);
const { buildOsasReportCsv } = reportModule.exports;

const data = {
  suppressed: false, minimum_cohort: 5, period_start: '2026-09-01', period_end: '2026-09-30', institutional_timezone: 'Asia/Manila', cohort_as_of: '2026-09-30',
  participation: { registered_students: 12, participating_students: 6, completion_events: 7 },
  wellbeing: { student_count: 6, average_wellbeing: 3.5, average_stress: 2.75, average_energy: 4 },
  activity_trends: [{ bucket_start: '2026-09-20', student_count: 5, completion_events: 6 }],
  wellbeing_trends: [{ bucket_start: '2026-08-31', from_date: '2026-09-01', through_date: '2026-09-06', partial: true, student_count: 6, registered_students: 12, coverage: 50, average_wellbeing: 3.5, average_stress: 2.5, average_energy: 4 }],
  student_interests: [{ category: 'Habits', creators: 6, completers: null }],
  first_week: { eligible: 12, completed: 6, rate: 50 },
  repeat_participation: [{ week_start: '2026-09-07', next_week_start: '2026-09-14', eligible: 12, completed: 6, rate: 50 }],
  assignment_outcomes: [
    { activity_code: 'activity-one', published_date: '2026-09-01', category: 'Health', assigned: 12, in_progress: false, completed: 6, rate: 50, median_hours: 25 },
    { activity_code: 'activity-two', published_date: '2026-09-24', category: 'Social', assigned: 12, in_progress: true, completed: null, rate: null, median_hours: null },
  ],
};
const csv = buildOsasReportCsv({ ...data, participation: { ...data.participation, completion_events: null } }, new Date('2026-10-01T00:00:00Z'));
assert(csv.startsWith('\uFEFF'));
for (const value of ['2026-09-01', '2026-09-30', 'Asia/Manila', 'Registered BeeBetter accounts', 'Students participating', 'Quest completion period start', 'Daily check-ins', 'Unavailable', 'Student-chosen interests', 'Repeat rate (%)', 'Partial week']) assert(csv.includes(value), `missing ${value}`);
assert(csv.includes('"activity-one","2026-09-01","Health","12","Complete","6","50","25"'));
assert(csv.includes('"activity-two","2026-09-24","Social","12","In progress","Unavailable","Unavailable","Unavailable"'));
for (const excluded of ['"Campus"', '"Program"', 'Year level', 'goals', 'Self-management', 'Support', 'Motivation']) assert.equal(csv.includes(excluded), false, `unexpected ${excluded}`);
assert(buildOsasReportCsv({ ...data, institutional_timezone: '=unsafe' }).includes('"' + "'=unsafe" + '"'));
assert.throws(() => buildOsasReportCsv({ ...data, suppressed: true, participation: null }), /withheld for privacy/i);
console.log('PASS OSAS CSV report content, unavailable values, suppression, and spreadsheet escaping');
