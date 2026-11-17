const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('../../mobile/node_modules/typescript');

const source = fs.readFileSync(path.join(__dirname, '../functions/student-auth/index.ts'), 'utf8');
const script = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.deepEqual(script.diagnostics, []);

const password = 'a synthetic password';
const studentNumber = '943000001';
const storedEmail = 'legacy@example.invalid';
const generatedEmail = 'student-00000000-0000-4000-8000-000000000001@beebetter.invalid';
const tokens = { access_token: 'test-access', refresh_token: 'test-refresh' };
const enrollment = {
  name: 'Maria Cruz', goal: 'Build habits',
  semester_id: '03400000-0000-4000-8000-000000000102',
  enrollment_option_id: '03400000-0000-4000-8000-000000000101',
  expected_labels: { course: 'BSCS', year_level: '4th Year', campus: 'Bacoor', section: '1' },
};

function fixture(options = {}) {
  let handler;
  const calls = [];
  let catalogueReads = 0;
  let lookups = 0;
  const admin = {
    rpc(name, args) {
      calls.push({ name, args });
      if (name === 'student_password_identity') return {
        maybeSingle: async () => ({ data: ++lookups === 1 ? options.account : options.claimed ?? options.account, error: options.lookupError }),
      };
      if (name === 'registration_enrollment_options_v2') {
        const filters = {};
        const query = { eq(key, value) { filters[key] = value; return query; }, async maybeSingle() {
          calls.push({ name: 'catalogue_filters', args: filters });
          return { data: options.catalogue?.[catalogueReads++] ? null : { id: enrollment.enrollment_option_id } };
        } };
        return query;
      }
      return Promise.resolve({ data: options.allowed ?? true });
    },
    auth: { admin: { async createUser(args) {
      calls.push({ name: 'createUser', args });
      return { error: options.creationError };
    } } },
  };
  const auth = { auth: { async signInWithPassword(args) {
    calls.push({ name: 'signInWithPassword', args });
    return { data: { session: options.authError ? null : tokens }, error: options.authError };
  } } };
  vm.runInNewContext(script.outputText, {
    exports: {},
    require: () => ({ createClient: (_url, key) => key === 'SUPABASE_SERVICE_ROLE_KEY' ? admin : auth }),
    Deno: { env: { get: name => name }, serve: fn => { handler = fn; } },
    crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000001' },
    Response,
    TextEncoder,
  });
  return { calls, request: body => handler(new Request('http://localhost/student-auth', {
    method: 'POST', body: JSON.stringify({ student_number: studentNumber, password, ...body }),
  })) };
}

(async () => {
  const signup = fixture();
  const created = await signup.request({ action: 'sign_up', name: '' });
  assert.equal(created.status, 200);
  assert.deepEqual(await created.json(), tokens);
  assert.equal(created.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(signup.calls.map(call => call.name), [
    'student_password_identity', 'reserve_student_signup', 'createUser', 'signInWithPassword',
  ]);
  const provision = signup.calls[2].args;
  assert.equal(provision.email, generatedEmail);
  assert.equal(provision.email_confirm, true);
  assert.equal(provision.app_metadata.student_login, 'id_password');
  assert.equal(provision.user_metadata.student_number, studentNumber);
  assert.equal(provision.user_metadata.name, '');

  const enrolled = fixture();
  const enrolledResponse = await enrolled.request({ action: 'sign_up_enrolled', ...enrollment, course: 'ignored' });
  assert.equal(enrolledResponse.status, 200);
  assert.deepEqual(await enrolledResponse.json(), tokens);
  const enrolledUser = enrolled.calls.find(call => call.name === 'createUser').args;
  assert.equal(enrolledUser.email_confirm, true);
  assert.deepEqual(JSON.parse(JSON.stringify(enrolledUser.user_metadata)), {
    student_number: studentNumber, name: enrollment.name,
    initial_enrollment: { goal: enrollment.goal, semester_id: enrollment.semester_id,
      enrollment_option_id: enrollment.enrollment_option_id, expected_labels: enrollment.expected_labels },
  });
  assert.deepEqual(enrolled.calls.find(call => call.name === 'catalogue_filters').args,
    { semester_id: enrollment.semester_id, id: enrollment.enrollment_option_id, ...enrollment.expected_labels });
  for (const invalid of [{ name: '' }, { goal: ' ' }, { semester_id: 'wrong' }, { enrollment_option_id: undefined }, { expected_labels: null }]) {
    const request = fixture();
    const response = await request.request({ action: 'sign_up_enrolled', ...enrollment, ...invalid });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { code: 'invalid_registration' });
    assert.equal(request.calls.length, 0);
  }
  for (const changed of [fixture({ catalogue: [true] }), fixture({ catalogue: [false, true], creationError: { code: 'unexpected_failure' } })]) {
    const response = await changed.request({ action: 'sign_up_enrolled', ...enrollment });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { code: 'enrollment_changed' });
    assert(!changed.calls.some(call => call.name === 'signInWithPassword'));
  }
  const raced = fixture({ claimed: { email: storedEmail, status: 'Active' }, creationError: { code: 'unexpected_failure' } });
  const racedResponse = await raced.request({ action: 'sign_up_enrolled', ...enrollment });
  assert.deepEqual(await racedResponse.json(), { code: 'student_number_unavailable' });
  assert(!raced.calls.some(call => call.name === 'signInWithPassword'));

  for (const email of [storedEmail, generatedEmail]) {
    const login = fixture({ account: { email, status: 'Active' } });
    const signedIn = await login.request({ action: 'sign_in', student_number: 'legacy-ID' });
    assert.equal(signedIn.status, 200);
    assert.deepEqual(await signedIn.json(), tokens);
    assert.equal(login.calls[0].args.student_number_value, 'legacy-ID');
    assert.equal(login.calls[1].args.email, email);
  }

  const suspended = fixture({ account: { email: storedEmail, status: 'Inactive' } });
  const denied = await suspended.request({ action: 'sign_in' });
  assert.equal(denied.status, 401);
  assert.deepEqual(await denied.json(), { code: 'invalid_credentials' });
  assert.equal(suspended.calls.length, 1);
  const duplicate = await suspended.request({ action: 'sign_up', name: '' });
  assert.equal(duplicate.status, 409);
  assert.deepEqual(await duplicate.json(), { code: 'student_number_unavailable' });

  const limited = fixture({ allowed: false });
  const blocked = await limited.request({ action: 'sign_up', name: '' });
  assert.equal(blocked.status, 429);
  assert(!limited.calls.some(call => call.name === 'createUser'));

  const oldPending = fixture({ account: { email: storedEmail, status: 'Active' }, authError: { code: 'email_not_confirmed' } });
  const oldDenied = await oldPending.request({ action: 'sign_in' });
  assert.deepEqual(await oldDenied.json(), { code: 'legacy_confirmation_required' });
  console.log('PASS enrolled and legacy signup, stale enrollment, concurrent claims, login, suspension, rate limit, and incomplete legacy accounts');
})().catch(error => { console.error(error); process.exitCode = 1; });
