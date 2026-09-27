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
  participation: { registered_students: 6, participating_students: 6, completion_events: 7, students_with_goals: 5, quests_created: 4, quests_completed: 3, quest_completion_rate: 75 },
  wellbeing: { student_count: 6, check_in_count: 8, motivation_response_count: 5, averaging_method: 'equal weight per participating student', average_wellbeing: 3.5, average_stress: 2.75, average_energy: 4, average_motivation: 3.2 },
  self_management: null,
  support: { student_count: 5, request_count: 6, submitted_count: 2, acknowledged_count: 1, in_progress_count: 1, resolved_count: 1, withdrawn_count: 1 },
  activity_trends: [{ bucket_start: '2026-09-20', student_count: 5, completion_events: 6 }],
  category_participation: [{ category: '=Academics', student_count: 5, completion_events: 6 }],
  wellbeing_trends: [{ bucket_start: '2026-09-20', student_count: 6, check_in_count: 6, motivation_response_count: 5, average_wellbeing: 3.5, average_stress: 2.5, average_energy: 4, average_motivation: 3 }],
  reflection_trends: [], support_trends: [], support_categories: [],
};
const filters = { startDate: '2026-09-01', endDate: '2026-09-30', campus: 'Main Campus', course: 'BSCS', yearLevel: '4th Year' };
const csv = buildOsasReportCsv(data, filters, new Date('2026-10-01T00:00:00Z'));
assert(csv.startsWith('\uFEFF'));
for (const value of ['2026-09-01', '2026-09-30', 'Main Campus', 'BSCS', 'Registered students', 'Durable quest completion-history', 'Unavailable: no records', "'=Academics"]) assert(csv.includes(value), `missing ${value}`);
for (const privateValue of ['Private note from Student A', 'student@example.com', 'I need confidential support', '14.5995,120.9842']) assert.equal(csv.includes(privateValue), false);
assert.throws(() => buildOsasReportCsv({ ...data, suppressed: true, participation: null }, filters), /fewer than 5 students/i);
console.log('PASS OSAS CSV report content, unavailable values, suppression, and spreadsheet escaping');
