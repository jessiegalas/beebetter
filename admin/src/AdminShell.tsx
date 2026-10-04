import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { AuthActionResult, OwnAccessRequest } from './admin-access'
import type { AdminIdentity } from './admin-types'

export function Brand() { return <div className="brand"><span className="brand-mark">✦</span><strong>BeeBetter</strong></div> }
export function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'AD' }
export function ProfileBadge({ identity, onClick }: { identity: AdminIdentity; onClick: () => void }) { return <button className="side-profile" aria-label={`Open admin information for ${identity.name}`} onClick={onClick}><span className="avatar">{initials(identity.name)}</span><span><b>{identity.name}</b><small>{identity.email || 'Administrator'}</small></span><span aria-hidden="true">...</span></button> }

export function AdminInfoPanel({ identity, role, permissions, onClose, onSignOut }: {
  identity: AdminIdentity
  role: 'admin' | 'super_admin'
  permissions: { can_view_aggregates: boolean; can_manage_support_requests: boolean }
  onClose: () => void
  onSignOut: () => void
}) {
  const closeButton = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLElement>(null)
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeButton.current?.focus()
    const containFocus = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onClose(); return }
      if (event.key !== 'Tab') return
      const focusable = panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', containFocus)
    return () => {
      document.removeEventListener('keydown', containFocus)
      previousFocus?.focus()
    }
  }, [onClose])

  const capability = (label: string, granted: boolean) => <div className="admin-info-capability" key={label}>
    <span>{label}</span><b className={granted ? 'capability-granted' : 'capability-denied'}>{granted ? 'Included' : 'Not verified'}</b>
  </div>

  return <div className="admin-info-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <aside ref={panel} className="admin-info-panel" role="dialog" aria-modal="true" aria-labelledby="admin-info-title">
      <div className="admin-info-heading"><div><span className="eyebrow">ADMIN CONSOLE</span><h2 id="admin-info-title">Admin information</h2></div><button ref={closeButton} className="admin-info-close" aria-label="Close admin information" onClick={onClose}>×</button></div>
      <div className="admin-info-identity"><span className="drawer-avatar">{initials(identity.name)}</span><div><b>{identity.name}</b><small>{identity.email || 'Signed-in account'}</small></div></div>
      <section className="admin-info-section" aria-labelledby="admin-session-title"><h3 id="admin-session-title">Current session</h3><div className="admin-info-value"><span>Account status</span><b className="capability-granted">Active</b></div><div className="admin-info-value"><span>Admin role</span><b>{role === 'super_admin' ? 'Super Admin' : 'Admin'}</b></div></section>
      <section className="admin-info-section" aria-labelledby="admin-permissions-title"><h3 id="admin-permissions-title">OSAS access</h3><p>Reporting and support access are included for all active admins.</p>{capability('Admin console access', true)}{capability('OSAS aggregate reports', permissions.can_view_aggregates)}{capability('OSAS support case management', permissions.can_manage_support_requests)}</section>
      <button className="admin-info-signout" onClick={onSignOut}>Sign out</button>
    </aside>
  </div>
}

export function AuthScreen({ onSignIn, onSignUp, dark, onToggleTheme }: {
  onSignIn: (email: string, password: string) => Promise<AuthActionResult>
  onSignUp: (name: string, email: string, password: string) => Promise<AuthActionResult>
  dark: boolean
  onToggleTheme: () => void
}) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)
    const data = new FormData(event.currentTarget)
    const email = String(data.get('email') || '').trim().toLowerCase()
    const password = String(data.get('password') || '')
    const name = String(data.get('name') || '').trim()
    try {
      const result = mode === 'login'
        ? await onSignIn(email, password)
        : await onSignUp(name, email, password)
      if (result.status === 'error') setError(result.message)
      else if (result.status === 'confirmation_required') setSuccess('Account created. Confirm your email, then sign in to request admin access.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Authentication could not be completed.')
    } finally {
      setLoading(false)
    }
  }
  return <div className={dark ? 'auth-shell dark' : 'auth-shell'}>
    <button className="auth-theme" onClick={onToggleTheme}>{dark ? '☀ Light mode' : '☾ Dark mode'}</button>
    <div className="auth-art">
      <Brand />
      <div className="art-copy"><h1>A little better.<br /><em>Every day.</em></h1><p>Support student growth, one mindful action at a time.</p></div>
      <p className="auth-art-footer">BeeBetter Admin Console</p>
    </div>
    <div className="auth-form-area"><div className="auth-card">
      <div className="auth-heading"><span className="eyebrow">Admin access</span><h2>{mode === 'login' ? 'Sign in to BeeBetter' : 'Create an admin account'}</h2><p>{mode === 'login' ? 'Use your approved admin account to continue.' : 'Confirm your account, then request admin access for super-admin review.'}</p></div>
      <form onSubmit={submit}>
        {mode === 'signup' && <label>Full name<input name="name" required autoComplete="name" placeholder="Admin name" /></label>}
        <label>Email address<input name="email" required type="email" autoComplete="email" placeholder="admin@beebetter.app" /></label>
        <label>Password<input name="password" required type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="••••••••" /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        {success && <p className="form-success" role="status">{success}</p>}
        <button className="auth-submit" type="submit" disabled={loading}>{loading ? 'Connecting...' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
      </form>
      <p className="switch-auth">{mode === 'login' ? 'Need an admin account?' : 'Already have an account?'} <button onClick={() => { setError(''); setSuccess(''); setMode(mode === 'login' ? 'signup' : 'login') }}>{mode === 'login' ? 'Create one' : 'Sign in'}</button></p>
    </div></div>
  </div>
}

export function AccessScreen({ identity, request, requestLoading, operationError, accessError, adminManaged, onRequest, onRefresh, onSignOut, dark }: {
  identity: AdminIdentity
  request: OwnAccessRequest
  requestLoading: boolean
  operationError: string
  accessError?: string
  adminManaged: boolean
  onRequest: () => void
  onRefresh: () => void
  onSignOut: () => void
  dark: boolean
}) {
  const pending = request?.status === 'pending'
  const declined = request?.status === 'declined'
  return <div className={dark ? 'auth-shell access-shell dark' : 'auth-shell access-shell'}><div className="auth-card"><Brand /><span className="eyebrow">Admin access</span><h2>{accessError ? 'Could not verify access' : 'Admin access unavailable'}</h2><p>{accessError || (adminManaged ? 'Admin access for this account is inactive. Contact a super-admin to restore access.' : pending ? 'Your admin access request is waiting for super-admin review.' : declined ? 'Your previous request was declined. You may submit a new request.' : 'Signed in as ' + (identity.email || identity.name) + '. Request ordinary admin access for review.')}</p>{operationError && <p className="form-error" role="alert">{operationError}</p>}{accessError || adminManaged ? <button className="secondary-button" onClick={onRefresh}>{accessError ? 'Retry access check' : 'Check access status'}</button> : pending ? <button className="secondary-button" onClick={onRefresh}>Check access status</button> : <button className="auth-submit" onClick={onRequest} disabled={requestLoading}>{requestLoading ? 'Submitting...' : declined ? 'Request again' : 'Request admin access'}</button>}<button className="mode-button" onClick={onSignOut}>Sign out</button></div></div>
}
