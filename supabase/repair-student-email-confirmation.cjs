// Server-only operator tool. Uses the installed mobile Supabase SDK, never its .env.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function projectUrl(value) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Use the project base URL.');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('Use HTTPS or a disposable localhost project.');
  return url.origin;
}
function checked(result, operation) {
  if (result.error) throw new Error(operation + ' failed. No credentials or account details were logged.');
  return result.data;
}
async function listRows(client, table, columns, activeOnly = false) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    let query = client.from(table).select(columns).order('id').range(offset, offset + 999);
    if (activeOnly) query = query.eq('status', 'Active');
    const page = checked(await query, 'Reading ' + table) ?? [];
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}
async function identity(client, id) {
  const result = await client.auth.admin.getUserById(id);
  if (result.error?.status === 404) return null;
  return checked(result, 'Reading Auth eligibility')?.user ?? null;
}
function eligible(student, authUser, isAdmin, cutoff) {
  const intent = authUser?.user_metadata?.signup_intent;
  return student?.status === 'Active' && authUser?.id === student.id && !isAdmin
    && !!authUser.email && !authUser.email_confirmed_at && !authUser.is_anonymous
    && intent !== 'student_registration' && intent !== 'admin_access_request'
    && !authUser.user_metadata?.registration_draft
    && Number.isFinite(Date.parse(student.created_at)) && Date.parse(student.created_at) <= Date.parse(cutoff)
    && Number.isFinite(Date.parse(authUser.created_at)) && Date.parse(authUser.created_at) <= Date.parse(cutoff);
}
async function previewRepair(client, url, createdAt = new Date().toISOString()) {
  const active = await listRows(client, 'students', 'id,status,created_at', true);
  const admins = new Set((await listRows(client, 'admin_users', 'id')).map(row => row.id));
  const students = [];
  for (const student of active) {
    if (admins.has(student.id)) continue;
    const authUser = await identity(client, student.id);
    if (eligible(student, authUser, false, createdAt)) students.push({
      id: student.id, studentCreatedAt: student.created_at, authCreatedAt: authUser.created_at,
    });
  }
  return { version: 1, projectUrl: projectUrl(url), createdAt, students };
}
function validateManifest(value, url) {
  if (value?.version !== 1 || value.projectUrl !== projectUrl(url) || !Number.isFinite(Date.parse(value.createdAt))
    || !Array.isArray(value.students)) throw new Error('Preview does not match this project or has an invalid format.');
  const ids = new Set();
  for (const row of value.students) {
    if (!row || typeof row.id !== 'string' || !UUID.test(row.id) || ids.has(row.id)
      || !Number.isFinite(Date.parse(row.studentCreatedAt)) || !Number.isFinite(Date.parse(row.authCreatedAt))) throw new Error('Invalid or duplicate account in preview.');
    ids.add(row.id);
  }
}
async function applyRepair(client, manifest, url) {
  validateManifest(manifest, url);
  let repaired = 0, skipped = 0;
  for (const frozen of manifest.students) {
    const student = checked(await client.from('students').select('id,status,created_at').eq('id', frozen.id).maybeSingle(), 'Rechecking student');
    const admin = checked(await client.from('admin_users').select('id').eq('id', frozen.id).maybeSingle(), 'Rechecking administrator');
    const authUser = await identity(client, frozen.id);
    if (!eligible(student, authUser, !!admin, manifest.createdAt)
      || student.created_at !== frozen.studentCreatedAt || authUser.created_at !== frozen.authCreatedAt) { skipped++; continue; }
    // This is the only mutation. It does not change passwords or student status.
    checked(await client.auth.admin.updateUserById(frozen.id, { email_confirm: true }), 'Confirming eligible account');
    repaired++;
  }
  return { repaired, skipped };
}
async function main(args = process.argv.slice(2)) {
  if (args[0] === '--help') {
    console.log('Preview: node supabase/repair-student-email-confirmation.cjs --preview');
    console.log('Apply reviewed preview: node supabase/repair-student-email-confirmation.cjs --apply <preview-file>');
    console.log('Provide server-only SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY through the operator environment.');
    return;
  }
  if (!(args.length === 1 && args[0] === '--preview') && !(args.length === 2 && args[0] === '--apply')) throw new Error('Use --preview or --apply <preview-file>.');
  const url = projectUrl(process.env.SUPABASE_URL || '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('A server-only SUPABASE_SERVICE_ROLE_KEY is required.');
  const requireMobile = createRequire(path.join(__dirname, '../mobile/package.json'));
  const { createClient } = requireMobile('@supabase/supabase-js');
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  if (args[0] === '--preview') {
    const manifest = await previewRepair(client, url);
    const directory = path.join(__dirname, '.temp');
    fs.mkdirSync(directory, { recursive: true });
    const filename = path.join(directory, 'student-email-repair-' + manifest.createdAt.replace(/[:.]/g, '-') + '.json');
    fs.writeFileSync(filename, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ eligibleAccounts: manifest.students.length, previewFile: filename }));
  } else {
    const manifest = JSON.parse(fs.readFileSync(path.resolve(args[1]), 'utf8'));
    console.log(JSON.stringify(await applyRepair(client, manifest, url)));
  }
}
module.exports = { previewRepair, applyRepair, validateManifest, eligible };
if (require.main === module) main().catch(() => {
  console.error('Student email repair failed. Stop and verify configuration/eligibility with an authorized operator. A partial apply can be retried using the same preview.');
  process.exitCode = 1;
});
