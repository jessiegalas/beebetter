const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../src/lib/student-validation.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} }; vm.runInThisContext('(function(exports){' + source + '\n})')(mod.exports);
const { cleanName, cleanStudentNumber, validateStudent, studentPayload, normalizeProgram, normalizeYear, emailError, passwordError } = mod.exports;
const options = [{ id: '1', course: 'BSCS', year_level: '4th Year', campus: 'Test Campus', section: 'A' }, { id: '2', course: 'BSEd', year_level: '1st Year', campus: 'Test Campus', section: 'B' }];
const valid = { name: "Ana-Maria O'Neil", student_number: '202311197', course: 'BSCS', year_level: '4th Year', campus: 'Test Campus', section: 'A', goal: 'Learn more' };
let count = 0;
function test(name, run) { run(); count++; console.log('PASS ' + name); }
test('names support accents, spaces, hyphens and apostrophes', () => {
  for (const name of [valid.name, 'José Dela Cruz', 'Ana O’Neil', 'A. Cruz', 'Jose\u0301 Cruz']) assert.equal(validateStudent({ ...valid, name }, options).name, undefined);
  for (const name of ['123', 'Ana123', '@@', '- -', 'A'.repeat(31)]) assert(validateStudent({ ...valid, name }, options).name);
  assert.equal(cleanName('Ana123!'), 'Ana'); assert.equal(cleanName('A'.repeat(35)).length, 30);
});
test('student number accepts exactly nine digits and strips invalid input', () => {
  for (const student_number of ['12345678', '1234567890', '2023-1197', 'abcdefghi']) assert(validateStudent({ ...valid, student_number }, options).student_number);
  assert.equal(cleanStudentNumber('2023-11197abc88'), '202311197'); assert.deepEqual(validateStudent(valid, options), {});
});
test('email and password boundaries retain six-character minimum', () => {
  assert.equal(emailError('user+tag@example.edu'), undefined); assert(emailError('a@b')); assert(emailError('a b@c.edu')); assert(emailError('a'.repeat(250) + '@b.edu'));
  assert(passwordError('12345')); assert.equal(passwordError('123456'), undefined); assert.equal(passwordError('a'.repeat(72)), undefined); assert(passwordError('a'.repeat(73))); assert(passwordError('é'.repeat(37)));
});
test('dropdown combinations and custom programs are validated', () => {
  assert(validateStudent({ ...valid, section: 'B' }, options).section);
  assert(validateStudent({ ...valid, year_level: '6' }, options).year_level);
  assert(validateStudent({ ...valid, campus: 'Unknown' }, options).campus);
  assert.deepEqual(validateStudent({ ...valid, course: 'BSEd', year_level: '1st Year', section: 'B' }, options), {});
  assert(validateStudent({ ...valid, course: 'Others' }, options).course);
});
test('normalization uses canonical program and year without changing legacy fields', () => {
  assert.equal(normalizeProgram('constructor'), 'constructor'); assert.equal(normalizeProgram('__proto__'), '__proto__');
  assert.equal(normalizeProgram('bs computer science'), 'BSCS'); assert.equal(normalizeYear('4'), '4th Year');
  assert.equal(studentPayload({ ...valid, name: '  Ana   Cruz  ' }).name, 'Ana Cruz');
  const legacy = { ...valid, student_number: 'LEGACY-123', course: 'Undeclared', year_level: 'Not specified', campus: 'Not specified', section: 'Not specified' };
  assert.deepEqual(validateStudent({ ...legacy, goal: 'New goal' }, [], legacy), {});
  assert.equal(studentPayload({ ...legacy, goal: 'New goal' }, legacy).student_number, 'LEGACY-123');
  assert(validateStudent({ ...legacy, student_number: 'bad' }, [], legacy).student_number);
});
test('required fields and goal limits prevent invalid submission', () => {
  assert(validateStudent({ ...valid, goal: '' }, options).goal); assert(validateStudent({ ...valid, goal: 'a'.repeat(201) }, options).goal);
  assert(validateStudent(valid, []).section);
});
console.log(count + ' student validation tests passed.');
