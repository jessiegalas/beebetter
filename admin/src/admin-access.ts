import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { getMyOsasPermissions, type OsasPermissions } from './osas-data'
import type { AdminIdentity } from './admin-types'

export type AdminAccessPhase = 'checking' | 'signed_out' | 'denied' | 'error' | 'active'
export type OwnAccessRequest = { id: string; status: 'pending' | 'approved' | 'declined'; submittedAt: string } | null
export type AuthActionResult = { status: 'accepted' | 'confirmation_required' } | { status: 'error'; message: string }
export type AccessActionResult = { success: true } | { success: false; error: string }

const emptyPermissions: OsasPermissions = { can_view_aggregates: false, can_manage_support_requests: false, is_active: false }

export function useAdminAccess() {
  const generation = useRef(0)
  const sessionRef = useRef<Session | null>(null)
  const verifiedUser = useRef<string | null>(null)
  const [phase, setPhase] = useState<AdminAccessPhase>('checking')
  const [identity, setIdentity] = useState<AdminIdentity>({ id: '', name: 'Administrator', email: '' })
  const [role, setRole] = useState<'admin' | 'super_admin' | null>(null)
  const [osasPermissions, setOsasPermissions] = useState<OsasPermissions>(emptyPermissions)
  const [accessRequest, setAccessRequest] = useState<OwnAccessRequest>(null)
  const [adminManaged, setAdminManaged] = useState(false)
  const [error, setError] = useState('')
  const [operationError, setOperationError] = useState('')
  const [requestLoading, setRequestLoading] = useState(false)

  const resolveSession = useCallback(async (session: Session | null) => {
    const request = ++generation.current
    const background = !!session && verifiedUser.current === session.user.id
    sessionRef.current = session
    setError('')
    if (!background) {
      verifiedUser.current = null
      setOperationError('')
      setRequestLoading(false)
      setRole(null)
      setOsasPermissions(emptyPermissions)
    }
    setAccessRequest(null)
    setAdminManaged(false)
    if (!session) {
      setIdentity({ id: '', name: 'Administrator', email: '' })
      setPhase('signed_out')
      return
    }

    const metadataName = String(session.user.user_metadata?.display_name || session.user.user_metadata?.name || '').trim()
    const email = session.user.email || ''
    const fallbackName = email.split('@')[0] || 'Administrator'
    if (!background) setIdentity({
      id: session.user.id,
      name: metadataName || fallbackName,
      email: session.user.email || '',
    })
    if (!background) setPhase('checking')

    const failAccess = (message: string) => {
      verifiedUser.current = null
      setRole(null)
      setOsasPermissions(emptyPermissions)
      setPhase('error')
      setError(message)
    }

    let roleResult
    try {
      roleResult = await supabase.rpc('admin_get_my_role')
    } catch (reason) {
      if (request !== generation.current) return
      failAccess(reason instanceof Error ? reason.message : 'Could not verify admin access.')
      return
    }
    if (request !== generation.current) return
    if (roleResult.error) {
      failAccess(roleResult.error.message || 'Could not verify admin access.')
      return
    }

    const current = roleResult.data?.[0]
    if (!current || !current.is_active || (current.role !== 'admin' && current.role !== 'super_admin')) {
      verifiedUser.current = null
      setRole(null)
      setOsasPermissions(emptyPermissions)
    }
    if (current && (!current.is_active || (current.role !== 'admin' && current.role !== 'super_admin'))) {
      setAdminManaged(true)
      setPhase('denied')
      return
    }
    if (!current) {
      setPhase('denied')
      try {
        const { data, error: requestError } = await supabase.from('admin_access_requests')
          .select('id,status,submitted_at')
          .eq('user_id', session.user.id)
          .order('submitted_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (request !== generation.current) return
        if (requestError) {
          setOperationError(requestError.message)
          return
        }
        setAccessRequest(data ? { id: data.id, status: data.status, submittedAt: data.submitted_at } : null)
      } catch (reason) {
        if (request === generation.current) setOperationError(reason instanceof Error ? reason.message : 'Could not load the access request.')
      }
      return
    }

    setRole(current.role)
    let resolvedName = metadataName || fallbackName
    const permissionRequest = getMyOsasPermissions().catch(() => emptyPermissions)
    try {
      const { data: profile, error: profileError } = await supabase.from('profiles')
        .select('display_name')
        .eq('id', session.user.id)
        .maybeSingle()
      if (request !== generation.current) return
      if (!profileError && typeof profile?.display_name === 'string' && profile.display_name.trim()) {
        resolvedName = profile.display_name.trim()
      }
    } catch {
      // The session metadata remains a usable identity if profile lookup is unavailable.
    }
    if (request !== generation.current) return
    setIdentity({ id: session.user.id, name: resolvedName, email })
    const permissions = await permissionRequest
    if (request === generation.current) {
      verifiedUser.current = session.user.id
      setRole(current.role)
      setOsasPermissions(permissions)
      setPhase('active')
    }
  }, [])

  useEffect(() => {
    let active = true
    let authEventReceived = false
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      authEventReceived = true
      if (active) void resolveSession(session)
    })
    void supabase.auth.getSession().then(({ data: { session }, error: sessionError }) => {
      if (!active || authEventReceived) return
      if (sessionError) throw sessionError
      void resolveSession(session)
    }).catch(reason => {
      if (!active || authEventReceived) return
      generation.current += 1
      sessionRef.current = null
      verifiedUser.current = null
      setPhase('error')
      setError(reason instanceof Error ? reason.message : 'Could not restore the admin session.')
    })
    return () => {
      active = false
      generation.current += 1
      verifiedUser.current = null
      subscription.unsubscribe()
    }
  }, [resolveSession])

  const signIn = useCallback(async (email: string, password: string): Promise<AuthActionResult> => {
    setOperationError('')
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
      return authError ? { status: 'error', message: authError.message } : { status: 'accepted' }
    } catch (reason) {
      return { status: 'error', message: reason instanceof Error ? reason.message : 'Could not sign in.' }
    }
  }, [])

  const signUp = useCallback(async (name: string, email: string, password: string): Promise<AuthActionResult> => {
    setOperationError('')
    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: name, signup_intent: 'admin_access_request' } },
      })
      if (authError) return { status: 'error', message: authError.message }
      return data.session ? { status: 'accepted' } : { status: 'confirmation_required' }
    } catch (reason) {
      return { status: 'error', message: reason instanceof Error ? reason.message : 'Could not create the account.' }
    }
  }, [])

  const signOut = useCallback(async (): Promise<AccessActionResult> => {
    setOperationError('')
    try {
      const { error: authError } = await supabase.auth.signOut()
      if (authError) {
        setOperationError(authError.message)
        return { success: false, error: authError.message }
      }
      return { success: true }
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Could not sign out.'
      setOperationError(message)
      return { success: false, error: message }
    }
  }, [])

  const requestAccess = useCallback(async (): Promise<AccessActionResult> => {
    const request = generation.current
    setRequestLoading(true)
    setOperationError('')
    try {
      const { error: requestError } = await supabase.rpc('admin_request_access')
      if (request !== generation.current) return { success: false, error: 'The signed-in account changed. Please try again.' }
      if (requestError) {
        setOperationError(requestError.message)
        return { success: false, error: requestError.message }
      }
      if (sessionRef.current) setAccessRequest({ id: '', status: 'pending', submittedAt: new Date().toISOString() })
      return { success: true }
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Could not submit the access request.'
      if (request === generation.current) setOperationError(message)
      return { success: false, error: message }
    } finally {
      if (request === generation.current) setRequestLoading(false)
    }
  }, [])

  const refresh = useCallback(async () => {
    const request = generation.current
    if (!verifiedUser.current) setPhase('checking')
    setError('')
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      if (request !== generation.current) return
      await resolveSession(session)
    } catch (reason) {
      if (request !== generation.current) return
      verifiedUser.current = null
      setRole(null)
      setOsasPermissions(emptyPermissions)
      setPhase('error')
      setError(reason instanceof Error ? reason.message : 'Could not refresh admin access.')
    }
  }, [resolveSession])

  useEffect(() => {
    const revalidate = () => { if (document.visibilityState === 'visible' && sessionRef.current) void refresh() }
    const timer = window.setInterval(revalidate, 60_000)
    window.addEventListener('focus', revalidate)
    document.addEventListener('visibilitychange', revalidate)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', revalidate)
      document.removeEventListener('visibilitychange', revalidate)
    }
  }, [refresh])

  return { phase, identity, role, osasPermissions, accessRequest, adminManaged, error, operationError, requestLoading, signIn, signUp, signOut, requestAccess, refresh }
}
