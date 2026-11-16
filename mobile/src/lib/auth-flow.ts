import { LIMITS, type StudentIdentity } from './student-validation';

export type AuthFailure = { status: 'error'; code: string; message: string };
export type AuthOperationResult = { status: 'completed' } | AuthFailure;
export type AuthenticationResult = { status: 'session_created' } | AuthFailure;

export function authFailure(error: unknown): AuthFailure {
  const value = error as { code?: string; message?: string } | null;
  const code = value?.code ?? 'network_error';
  const messages: Record<string, string> = {
    invalid_credentials: 'Student ID or password is incorrect. Check your details and try again.',
    invalid_student_id: 'Enter your student ID.',
    over_request_rate_limit: 'Too many attempts. Wait a few minutes before trying again.',
    legacy_confirmation_required: 'This older account needs help from your school administrator before you can sign in.',
    student_auth_unavailable: 'Student sign-in is temporarily unavailable. Try again in a moment.',
    student_account_created: 'Your account was created. Use your student ID and password to sign in.',
    weak_password: 'Choose a stronger password with at least 15 characters.',
    otp_expired: 'This link has expired or was already used. Request another email.',
    flow_state_not_found: 'Open the newest link on the device that requested it, or sign in after confirming your email.',
    flow_state_expired: 'This link has expired. Request another email.',
    registration_unavailable: 'Account creation is temporarily unavailable. Please try again later.',
    invalid_registration: 'Check your student information and try again.',
    enrollment_changed: 'The enrollment choices changed. Select your section again for the current semester.',
    student_number_unavailable: 'This student ID is unavailable. If you already have an account, sign in.',
    operation_cancelled: 'This operation was cancelled. Please try again.',
  };
  const category = Object.hasOwn(messages, code) ? code : ['network_error', 'operation_busy', 'enrollment_changed', 'invalid_registration', 'student_number_unavailable', 'recovery_session_missing'].includes(code) ? code : 'other';
  console.warn('Authentication failure category:', category);
  return { status: 'error', code, message: (code === 'weak_password' ? value?.message : undefined) ?? messages[code] ?? value?.message ?? 'Check your connection and try again.' };
}

export type AuthCallback =
  | { kind: 'error'; code: string }
  | { kind: 'code'; code: string; recovery: boolean }
  | { kind: 'tokens'; accessToken: string; refreshToken: string; recovery: boolean };

// Only the app's Auth route may consume credentials. Never log the URL or tokens.
export function parseAuthCallback(raw: string, webOrigin?: string): AuthCallback | null {
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  const native = url.protocol === 'beebetter:' && url.hostname === 'auth' && !url.pathname;
  const web = !!webOrigin && url.origin === webOrigin && url.pathname === '/auth';
  if (!native && !web) return null;
  const fragment = new URLSearchParams(url.hash.slice(1));
  const read = (key: string) => url.searchParams.get(key) ?? fragment.get(key);
  const error = read('error_code') ?? read('error');
  if (error) return { kind: 'error', code: error };
  const recovery = read('flow') === 'recovery' || read('type') === 'recovery';
  const code = read('code');
  if (code) return { kind: 'code', code, recovery };
  const accessToken = read('access_token'), refreshToken = read('refresh_token');
  return accessToken && refreshToken ? { kind: 'tokens', accessToken, refreshToken, recovery } : null;
}

export type RegistrationDraft = StudentIdentity & {
  enrollment?: { goal: string; semesterId: string; enrollmentOptionId: string };
};

// Auth metadata is editable input, never evidence of student admission.
export function readRegistrationDraft(value: unknown): RegistrationDraft | null {
  if (!value || typeof value !== 'object') return null;
  const draft = value as { version?: unknown; student?: unknown; semesterId?: unknown; enrollmentOptionId?: unknown };
  if ((draft.version !== 1 && draft.version !== 2) || !draft.student || typeof draft.student !== 'object') return null;
  const student = draft.student as { student_number?: unknown; name?: unknown; goal?: unknown };
  if (typeof student.student_number !== 'string' || student.student_number.length > LIMITS.student_number
    || typeof student.name !== 'string' || student.name.length > LIMITS.name) return null;
  const identity = { student_number: student.student_number, name: student.name };
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (draft.version === 1 && typeof student.goal === 'string' && student.goal.trim() && student.goal.length <= LIMITS.goal
    && typeof draft.semesterId === 'string' && uuid.test(draft.semesterId)
    && typeof draft.enrollmentOptionId === 'string' && uuid.test(draft.enrollmentOptionId)) {
    return { ...identity, enrollment: { goal: student.goal, semesterId: draft.semesterId, enrollmentOptionId: draft.enrollmentOptionId } };
  }
  return identity;
}
