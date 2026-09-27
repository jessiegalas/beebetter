import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from './supabase'
import type { AdminIdentity } from './admin-types'

export function Brand() { return <div className="brand"><span className="brand-mark">✦</span><strong>BeeBetter</strong></div> }
export function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'AD' }
export function ProfileBadge({ identity, onClick }: { identity: AdminIdentity; onClick: () => void }) { return <button className="side-profile" onClick={onClick}><span className="avatar">{initials(identity.name)}</span><span><b>{identity.name}</b><small>{identity.email || 'Administrator'}</small></span><span>...</span></button> }

export function AuthScreen({ onSuccess, dark, onToggleTheme }: { onSuccess: () => void; dark: boolean; onToggleTheme: () => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    const data = new FormData(event.currentTarget)
    const email = String(data.get('email') || '').trim().toLowerCase()
    const password = String(data.get('password') || '')
    const result = mode === 'login'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { data: { display_name: String(data.get('name') || '').trim() } } })
    setLoading(false)
    if (result.error) {
      setError(result.error.message)
      return
    }
    if (mode === 'signup' && !result.data.session) {
      setError('Account created. Confirm the email before signing in.')
      return
    }
    onSuccess()
  }
  return <div className={dark ? 'auth-shell dark' : 'auth-shell'}><button className="auth-theme" onClick={onToggleTheme}>{dark ? '☀ Light mode' : '☾ Dark mode'}</button><div className="auth-art"><Brand /><div className="orb orb-one" /><div className="orb orb-two" /><div className="art-copy"><span className="eyebrow">THE BETTER WAY TO GROW</span><h1>Make every day<br /><em>a little better.</em></h1><p>One mindful action at a time, powered by a community that cares.</p><div className="mini-stat"><b>✦ Student data</b><span>securely managed through Supabase</span></div></div></div><div className="auth-card"><div className="auth-heading"><span className="eyebrow">ADMIN ACCESS</span><h2>{mode === 'login' ? 'Sign in to BeeBetter' : 'Create an admin account'}</h2><p>{mode === 'login' ? 'Use an approved Supabase admin account.' : 'An existing admin must approve this account in Supabase.'}</p></div><form onSubmit={submit}>{mode === 'signup' && <label>Full name<input name="name" required placeholder="Admin name" /></label>}<label>Email address<input name="email" required type="email" placeholder="admin@beebetter.app" /></label><label>Password<input name="password" required type="password" placeholder="••••••••" /></label>{error && <p className="form-error">{error}</p>}<button className="auth-submit" type="submit" disabled={loading}>{loading ? 'Connecting...' : mode === 'login' ? 'Sign in →' : 'Create account →'}</button></form><p className="switch-auth">{mode === 'login' ? 'Need an admin account?' : 'Already have an account?'} <button onClick={() => { setError(''); setMode(mode === 'login' ? 'signup' : 'login') }}>{mode === 'login' ? 'Create one' : 'Sign in'}</button></p></div></div>
}

