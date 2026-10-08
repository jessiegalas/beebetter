const assert = require('node:assert/strict');
const { previewRepair, applyRepair } = require('../repair-student-email-confirmation.cjs');
const url = 'https://example.supabase.co';
const created = '2026-09-01T00:00:00.000Z';
const cutoff = '2026-10-08T00:00:00.000Z';
const id = number => '03400000-0000-4000-8000-' + String(number).padStart(12, '0');
function fixture(count = 10) {
  const students = new Map(), users = new Map(), admins = new Map(), updates = [];
  for (let n = 1; n <= count; n++) {
    students.set(id(n), { id: id(n), status: 'Active', created_at: created });
    users.set(id(n), { id: id(n), email: 'synthetic@example.invalid', email_confirmed_at: null, created_at: created, user_metadata: {} });
  }
  const client = {
    from(table) {
      let range = [0, Infinity]; const filters = [];
      const query = { select() { return query; }, order() { return query; }, range(a, b) { range = [a, b]; return query; }, eq(key, value) { filters.push([key, value]); return query; } };
      const rows = () => [...(table === 'students' ? students : admins).values()].filter(row => filters.every(([key, value]) => row[key] === value)).sort((a, b) => a.id.localeCompare(b.id)).slice(range[0], range[1] + 1);
      query.then = (resolve, reject) => Promise.resolve({ data: rows(), error: null }).then(resolve, reject);
      query.maybeSingle = async () => ({ data: rows()[0] || null, error: null });
      return query;
    },
    auth: { admin: {
      getUserById: async uuid => ({ data: { user: users.get(uuid) || null }, error: null }),
      updateUserById: async (uuid, data) => { updates.push({ uuid, data }); users.get(uuid).email_confirmed_at = cutoff; return { data: { user: users.get(uuid) }, error: null }; },
    } },
  };
  return { client, students, users, admins, updates };
}
const cases = [];
const test = (name, fn) => cases.push({ name, fn });
test('preview matches UUIDs and excludes administrators, inactive, incomplete and confirmed identities', async () => {
  const f = fixture();
  f.admins.set(id(2), { id: id(2), is_active: false });
  f.students.get(id(3)).status = 'Inactive';
  f.users.get(id(4)).user_metadata.signup_intent = 'student_registration';
  f.users.get(id(5)).user_metadata.signup_intent = 'admin_access_request';
  f.users.get(id(6)).email_confirmed_at = created;
  f.users.get(id(7)).is_anonymous = true;
  f.users.get(id(8)).user_metadata.registration_draft = { version: 1 };
  f.users.get(id(9)).id = id(100);
  f.users.delete(id(10));
  const preview = await previewRepair(f.client, url, cutoff);
  assert.deepEqual(preview.students.map(row => row.id), [id(1)]); assert.equal(f.updates.length, 0);
  assert(!JSON.stringify(preview).includes('email')); assert(!JSON.stringify(preview).includes('synthetic'));
});
test('preview excludes identities/student rows created after its cutoff and paginates', async () => {
  const f = fixture(1002); f.users.get(id(1)).created_at = '2026-10-09T00:00:00.000Z';
  f.students.get(id(2)).created_at = '2026-10-09T00:00:00.000Z';
  const preview = await previewRepair(f.client, url, cutoff);
  assert.equal(preview.students.length, 1000); assert.equal(preview.students.at(-1).id, id(1002));
});
test('apply rechecks eligibility and frozen row identity, and never discovers additional accounts', async () => {
  const f = fixture(); const preview = await previewRepair(f.client, url, cutoff);
  f.students.get(id(2)).status = 'Inactive'; f.admins.set(id(3), { id: id(3) });
  f.users.get(id(4)).email_confirmed_at = created; f.users.get(id(5)).user_metadata.signup_intent = 'student_registration';
  f.users.get(id(6)).created_at = '2026-09-02T00:00:00.000Z'; f.students.delete(id(7));
  f.students.get(id(8)).created_at = '2026-09-02T00:00:00.000Z'; f.users.delete(id(9));
  f.students.set(id(11), { id: id(11), status: 'Active', created_at: created });
  f.users.set(id(11), { id: id(11), email: 'new@example.invalid', created_at: created, user_metadata: {} });
  assert.deepEqual(await applyRepair(f.client, preview, url), { repaired: 2, skipped: 8 });
  assert.deepEqual(f.updates.map(row => row.uuid), [id(1), id(10)]);
  assert(f.updates.every(row => JSON.stringify(row.data) === '{"email_confirm":true}'));
  assert.equal(f.students.get(id(2)).status, 'Inactive');
  assert.deepEqual(await applyRepair(f.client, preview, url), { repaired: 0, skipped: 10 });
});
test('apply refuses a foreign project or malformed/duplicate manifest before mutation', async () => {
  const f = fixture(1); const preview = await previewRepair(f.client, url, cutoff);
  await assert.rejects(applyRepair(f.client, preview, 'https://other.supabase.co'));
  await assert.rejects(applyRepair(f.client, { ...preview, students: [...preview.students, ...preview.students] }, url));
  await assert.rejects(applyRepair(f.client, { ...preview, students: [{ ...preview.students[0], id: 'invalid' }] }, url));
  assert.equal(f.updates.length, 0);
});
test('read failure stops the repair without confirming an unchecked identity', async () => {
  const f = fixture(1); const preview = await previewRepair(f.client, url, cutoff);
  f.client.auth.admin.getUserById = async () => ({ error: { status: 503, message: 'sensitive diagnostic' }, data: null });
  await assert.rejects(applyRepair(f.client, preview, url), error => !error.message.includes('sensitive diagnostic'));
  assert.equal(f.updates.length, 0);
});
(async () => {
  for (const entry of cases) { await entry.fn(); console.log('PASS ' + entry.name); }
  console.log(cases.length + ' student email repair regressions passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
