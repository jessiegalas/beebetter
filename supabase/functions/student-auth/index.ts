import { createClient } from 'npm:@supabase/supabase-js@2.116.0';

const url = Deno.env.get('SUPABASE_URL')!;
const authOptions = { persistSession: false, autoRefreshToken: false };
const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: authOptions });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const labelFields = ['course', 'year_level', 'campus', 'section'] as const;
type EnrollmentLabels = Record<typeof labelFields[number], string>;
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
};

function failure(code: string, status: number) {
  return Response.json({ code }, { status, headers });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return failure('invalid_request', 405);
  try {
    const text = await request.text();
    if (text.length > 4096) return failure('invalid_request', 413);
    let body: Record<string, unknown>;
    try { body = JSON.parse(text); } catch { return failure('invalid_request', 400); }
    if (!body || typeof body !== 'object'
      || (body.action !== 'sign_in' && body.action !== 'sign_up' && body.action !== 'sign_up_enrolled')) {
      return failure('invalid_request', 400);
    }

    if (typeof body.student_number !== 'string') return failure('invalid_student_id', 400);
    const studentNumber = body.student_number.trim();
    const enrolledSignup = body.action === 'sign_up_enrolled';
    const signup = body.action !== 'sign_in';
    if (!studentNumber || studentNumber.length > 64 || (signup && !/^[0-9]{9}$/.test(studentNumber))) {
      return failure('invalid_student_id', 400);
    }
    const password = body.password;
    if (typeof password !== 'string' || !password || password.length > 1024) {
      return failure(signup ? 'weak_password' : 'invalid_credentials', 400);
    }

    let name = '';
    if (signup) {
      if (Array.from(password).length < 15 || new TextEncoder().encode(password).length > 72) {
        return failure('weak_password', 400);
      }
      if (typeof body.name !== 'string') return failure('invalid_registration', 400);
      name = body.name.normalize('NFC').trim().replace(/\s+/g, ' ');
      if (name && (name.length > 30 || !/\p{L}/u.test(name) || !/^[\p{L}\p{M} .'\u2019-]+$/u.test(name))) {
        return failure('invalid_registration', 400);
      }
    }

    let enrollment: { goal: string; semester_id: string; enrollment_option_id: string; expected_labels: EnrollmentLabels } | undefined;
    if (enrolledSignup) {
      const { goal, semester_id, enrollment_option_id } = body;
      const labels = body.expected_labels as EnrollmentLabels | null;
      if (!name || typeof goal !== 'string' || !goal.trim() || goal.trim().length > 200
        || typeof semester_id !== 'string' || !uuid.test(semester_id)
        || typeof enrollment_option_id !== 'string' || !uuid.test(enrollment_option_id)
        || !labels || !labelFields.every(field => typeof labels[field] === 'string' && labels[field].trim())) {
        return failure('invalid_registration', 400);
      }
      const { course, year_level, campus, section } = labels;
      enrollment = { goal: goal.trim(), semester_id, enrollment_option_id, expected_labels: { course, year_level, campus, section } };
    }

    const lookup = () => admin.rpc('student_password_identity', { student_number_value: studentNumber }).maybeSingle();
    const { data: account, error: lookupError } = await lookup();
    if (lookupError) return failure('student_auth_unavailable', 503);

    let authIdentifier: string;
    if (signup) {
      if (account) return failure('student_number_unavailable', 409);
      const checkEnrollment = (choice: NonNullable<typeof enrollment>) =>
        admin.rpc('registration_enrollment_options_v2')
          .eq('semester_id', choice.semester_id).eq('id', choice.enrollment_option_id)
          .eq('course', choice.expected_labels.course).eq('year_level', choice.expected_labels.year_level)
          .eq('campus', choice.expected_labels.campus).eq('section', choice.expected_labels.section).maybeSingle();
      if (enrollment) {
        const { data: selected, error: selectionError } = await checkEnrollment(enrollment);
        if (selectionError) return failure('student_auth_unavailable', 503);
        if (!selected) return failure('enrollment_changed', 409);
      }
      const { data: allowed, error: limitError } = await admin.rpc('reserve_student_signup');
      if (limitError) return failure('student_auth_unavailable', 503);
      if (!allowed) return failure('over_request_rate_limit', 429);

      authIdentifier = 'student-' + crypto.randomUUID() + '@beebetter.invalid';
      const { error } = await admin.auth.admin.createUser({
        email: authIdentifier,
        password,
        email_confirm: true,
        app_metadata: { student_login: 'id_password' },
        user_metadata: { student_number: studentNumber, name, ...(enrollment && { initial_enrollment: enrollment }) },
      });
      if (error) {
        if (error.code === 'weak_password') return failure('weak_password', 400);
        // The Auth insert and Student trigger share a transaction. A concurrent
        // signup may have claimed the ID after the first lookup.
        const { data: claimed } = await lookup();
        if (claimed) return failure('student_number_unavailable', 409);
        if (enrollment) {
          const { data: selected, error: selectionError } = await checkEnrollment(enrollment);
          if (!selectionError && !selected) return failure('enrollment_changed', 409);
        }
        return failure('student_auth_unavailable', 503);
      }
    } else {
      if (!account?.email || account.status !== 'Active') return failure('invalid_credentials', 401);
      authIdentifier = account.email;
    }

    const auth = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: authOptions });
    const { data, error } = await auth.auth.signInWithPassword({ email: authIdentifier, password });
    if (error || !data.session) {
      if (error?.status === 429) return failure('over_request_rate_limit', 429);
      if (error?.code === 'email_not_confirmed') return failure('legacy_confirmation_required', 403);
      if (!signup && error?.code === 'invalid_credentials') return failure('invalid_credentials', 401);
      return failure(signup ? 'student_account_created' : 'student_auth_unavailable', 503);
    }
    return Response.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    }, { headers });
  } catch {
    return failure('student_auth_unavailable', 503);
  }
});
