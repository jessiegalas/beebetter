export type AccountAccess = 'checking' | 'active' | 'signed_out' | 'blocked' | 'verification_error' | 'onboarding_required' | 'recovery_required';

export const SUSPENDED_MESSAGE = 'Your account is suspended. Contact your administrator.';
export const VERIFICATION_MESSAGE = 'Could not verify your account. Check your connection and retry, or sign out.';

export function studentAccessMessage(student: { status?: unknown } | null): string | null {
  if (student?.status === 'Active') return null;
  if (student?.status === 'Inactive') return SUSPENDED_MESSAGE;
  return 'Your student account is unavailable. Contact your administrator.';
}

// Session lifetime is independent of individual refresh requests.
export class SessionFence {
  private generation = 0;
  private id: string | null = null;
  private blocked = false;

  accept(id: string | null) {
    if (id && this.blocked) return false;
    if (id !== this.id) { this.generation += 1; this.id = id; }
    return true;
  }
  invalidate() { this.generation += 1; }
  close() { this.invalidate(); this.id = null; this.blocked = true; }
  beginAuthentication() { this.invalidate(); this.id = null; this.blocked = false; }
  capture(id?: string) {
    const generation = this.generation;
    return () => generation === this.generation && !this.blocked && (id === undefined || id === this.id);
  }
}
