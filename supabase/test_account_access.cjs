// Mutating integration test: only a disposable loopback Supabase with 001-027
// applied AND student_access_token_hook enabled. Never load client .env files.
const assert = require('node:assert/strict');
const { randomUUID, randomInt } = require('node:crypto');
const { createClient } = require('../mobile/node_modules/@supabase/supabase-js');
const url = process.env.BEEBETTER_TEST_URL;
const publishable = process.env.BEEBETTER_TEST_PUBLISHABLE_KEY;
const secret = process.env.BEEBETTER_TEST_SERVICE_ROLE_KEY;
if (!url || !publishable || !secret || process.env.BEEBETTER_TEST_DISPOSABLE !== 'yes') {
  console.error('Requires BEEBETTER_TEST_DISPOSABLE=yes and BEEBETTER_TEST_URL, BEEBETTER_TEST_PUBLISHABLE_KEY, BEEBETTER_TEST_SERVICE_ROLE_KEY for a disposable local stack.');
  process.exit(1);
}
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) {
  console.error('Refusing a non-loopback test server.'); process.exit(1);
}
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const client = () => createClient(url, publishable, options);
const service = createClient(url, secret, options);
const ids = [];
const suspensionMessage = 'Your account is suspended. Contact your administrator.';
function checked(result) { if (result.error) throw result.error; return result.data; }
async function fixture(name, enrollment) {
  const email = `auth-regression-${randomUUID()}@example.test`;
  const password = `Test-${randomUUID()}!`;
  const { user } = checked(await service.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { ...enrollment, name, display_name: name, student_number: String(randomInt(100000000, 999999999)), goal: 'Test account access' },
  }));
  ids.push(user.id);
  return { id: user.id, email, password };
}
async function setStudentStatus(admin, id, status) {
  const row = checked(await service.from('students').select('*').eq('id', id).single());
  checked(await admin.rpc('admin_update_student', {
    student_id: id, student_number_value: row.student_number, name_value: row.name, email_value: row.email,
    course_value: row.course, year_level_value: row.year_level, section_value: row.section,
    campus_value: row.campus, goal_value: row.goal, status_value: status,
  }));
}
(async () => {
  try {
    const anon = client();
    const enrollment = checked(await anon.rpc('registration_enrollment_options'))?.[0];
    assert(enrollment, 'Provision an active semester with at least one enrollment option first.');
    const student = await fixture('Test Student', enrollment);
    const admin = await fixture('Test Administrator', enrollment);
    checked(await service.from('admin_users').insert({ id: admin.id, role: 'admin', is_active: true }));
    const adminClient = client();
    checked(await adminClient.auth.signInWithPassword({ email: admin.email, password: admin.password }));
    const studentClient = client();
    const { session } = checked(await studentClient.auth.signInWithPassword({ email: student.email, password: student.password }));
    assert(session, 'Active student must receive a session.');
    console.log('PASS active student login');

    await setStudentStatus(adminClient, student.id, 'Inactive');
    const denied = await client().auth.signInWithPassword({ email: student.email, password: student.password });
    assert(denied.error, 'Inactive login succeeded: verify the Auth hook is enabled.');
    assert.equal(denied.error.message, suspensionMessage);
    assert(!denied.data.session);
    const refresh = await client().auth.refreshSession({ refresh_token: session.refresh_token });
    assert(refresh.error, 'Inactive refresh must be denied.');
    assert.equal(refresh.error.message, suspensionMessage);
    console.log('PASS inactive password login and token refresh denied');

    // Previous JWTs remain valid until expiry. Policy must check current status.
    const oldTokenClient = createClient(url, publishable, { ...options, global: { headers: { Authorization: `Bearer ${session.access_token}` } } });
    const write = await oldTokenClient.from('quests').insert({ owner_id: student.id, title: 'Must fail', category: 'Habits', xp: 20 });
    assert(write.error, 'An inactive student must not create quests using an old JWT.');
    for (const caller of [anon, oldTokenClient]) {
      const hook = await caller.rpc('student_access_token_hook', { event: { user_id: student.id, claims: {} } });
      assert(hook.error, 'Clients must not execute the Auth-only hook.');
    }
    checked(await studentClient.auth.signOut({ scope: 'local' }));
    console.log('PASS inactive write denial, private hook, and suspended logout');

    await setStudentStatus(adminClient, student.id, 'Active');
    assert(checked(await client().auth.signInWithPassword({ email: student.email, password: student.password })).session);
    console.log('PASS reactivation restores login');

    await setStudentStatus(adminClient, admin.id, 'Inactive');
    assert(checked(await client().auth.signInWithPassword({ email: admin.email, password: admin.password })).session);
    checked(await service.from('admin_users').update({ is_active: false }).eq('id', admin.id));
    const inactiveAdmin = await client().auth.signInWithPassword({ email: admin.email, password: admin.password });
    assert.equal(inactiveAdmin.error?.message, suspensionMessage);
    console.log('PASS active administrator exemption and revoked-admin denial');
  } finally {
    const results = await Promise.allSettled(ids.map(async id => checked(await service.auth.admin.deleteUser(id))));
    if (results.some(result => result.status === 'rejected')) throw new Error('Could not remove every disposable test account. Discard the test stack.');
  }
})().catch(error => { console.error('Account-access integration failed:', error.message); process.exitCode = 1; });
