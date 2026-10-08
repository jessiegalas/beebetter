import { LIMITS, type StudentFields } from './student-validation';

export type AuthFailure = { status: 'error'; code: string; message: string };
export type AuthOperationResult = { status: 'completed' } | AuthFailure;
export type AuthenticationResult = { status: 'session_created' | 'confirmation_required' } | AuthFailure;

export function authFailure(error: unknown): AuthFailure {
  const value = error as { code?: string; message?: string } | null;
  const code = value?.code ?? 'network_error';
  const messages: Record<string, string> = {
    email_not_confirmed: 'Confirm your email before signing in. You can resend the confirmation below.',
    invalid_credentials: 'Email or password is incorrect. Check your details and try again.',
    over_email_send_rate_limit: 'Too many email attempts. Wait a few minutes before trying again.',
    over_request_rate_limit: 'Too many attempts. Wait a few minutes before trying again.',
    user_already_exists: 'Check your email for next steps, or sign in if you already have an account.',
    weak_password: 'Choose a stronger password with at least 15 characters.',
    otp_expired: 'This link has expired or was already used. Request another email.',
    flow_state_not_found: 'Open the newest link on the device that requested it, or sign in after confirming your email.',
    flow_state_expired: 'This link has expired. Request another email.',
    registration_unavailable: 'Account creation is temporarily unavailable. Please try again later.',
    invalid_registration: 'Check your student information and try again.',
    enrollment_changed: 'The enrollment choices changed. Select your section again for the current semester.',
    student_number_unavailable: 'This student number is unavailable. Check it or contact your administrator.',
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

export type RegistrationInput = {
  name: string; studentNumber: string; goal: string; semesterId: string; enrollmentOptionId: string;
};

export type RegistrationDraft = {
  version: 1;
  student: StudentFields;
  semesterId: string;
  enrollmentOptionId: string;
};

export const emptyStudentFields = (): StudentFields => ({
  name: '', student_number: '', course: '', year_level: '', section: '', campus: '', goal: '',
});

// Auth metadata is editable input, never evidence of student admission.
export function readRegistrationDraft(value: unknown): RegistrationDraft | null {
  if (!value || typeof value !== 'object') return null;
  const draft = value as Partial<RegistrationDraft>;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (draft.version !== 1 || typeof draft.semesterId !== 'string' || !uuid.test(draft.semesterId)
    || typeof draft.enrollmentOptionId !== 'string' || !uuid.test(draft.enrollmentOptionId)
    || !draft.student || typeof draft.student !== 'object') return null;
  const student = emptyStudentFields();
  for (const field of Object.keys(student) as (keyof StudentFields)[]) {
    const text = draft.student[field];
    if (typeof text !== 'string' || text.length > (field === 'year_level' ? 30 : LIMITS[field])) return null;
    student[field] = text;
  }
  return { version: 1, student, semesterId: draft.semesterId, enrollmentOptionId: draft.enrollmentOptionId };
}

export function registrationInput(draft: RegistrationDraft): RegistrationInput {
  return { name: draft.student.name, studentNumber: draft.student.student_number, goal: draft.student.goal,
    semesterId: draft.semesterId, enrollmentOptionId: draft.enrollmentOptionId };
}