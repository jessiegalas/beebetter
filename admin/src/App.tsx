import { PROGRAMS, YEARS, LIMITS, cleanName, cleanStudentNumber, normalizeProgram, normalizeYear, validateStudent, studentPayload, type StudentFields, type EnrollmentOption } from '../../mobile/src/lib/student-validation'
import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import './App.css'
import { supabase } from './supabase'
import { getMyOsasPermissions, type OsasPermissions as OsasPermissionState } from './osas-data'
import { SupportRequests } from './SupportRequests'
import { OsasPermissions } from './OsasPermissions'
import { OsasDashboard } from './OsasDashboard'

type Section = 'Overview' | 'Users' | 'Quests' | 'Support Requests' | 'Admins'
type User = { id: string; studentNumber: string; name: string; email: string; course: string; yearLevel: string; section: string; campus: string; goal: string; joined: string; quests: string; status: 'Active' | 'Inactive' }
type Quest = { id: string; ownerId: string; title: string; description: string; category: QuestDraft['category']; xp: number; difficulty: QuestDraft['difficulty']; completions: string; status: 'active' | 'pending' | 'completed' | 'rejected'; assignee: string }
type QuestDraft = { title: string; description: string; category: 'Academics' | 'Habits' | 'Social' | 'Health'; difficulty: 'Easy' | 'Medium' | 'Hard'; assigneeId: string | null; publish: boolean }
type Admin = { id: string; email: string; displayName: string; role: 'admin' | 'super_admin'; isActive: boolean; createdAt: string }
type AdminIdentity = { name: string; email: string }



function App() {
  const [authenticated, setAuthenticated] = useState(false)
  const [authChecking, setAuthChecking] = useState(true)
  const [adminChecking, setAdminChecking] = useState(true)
  const [adminIdentity, setAdminIdentity] = useState<AdminIdentity>({ name: 'Administrator', email: '' })
  const [section, setSection] = useState<Section>('Overview')
  const [dark, setDark] = useState(() => localStorage.getItem('beebetter-theme') === 'dark')
  const [users, setUsers] = useState<User[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersError, setUsersError] = useState('')
  const [questsLoading, setQuestsLoading] = useState(false)
  const [questsError, setQuestsError] = useState('')
  const [quests, setQuests] = useState<Quest[]>([])
  const [adminRole, setAdminRole] = useState<'admin' | 'super_admin' | null>(null)
  const [osasPermissions, setOsasPermissions] = useState<OsasPermissionState>({ can_view_aggregates: false, can_manage_support_requests: false, is_active: false })
  const [admins, setAdmins] = useState<Admin[]>([])
  const [adminsLoading, setAdminsLoading] = useState(false)
  const [adminsError, setAdminsError] = useState('')
  const [adminModalOpen, setAdminModalOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [newQuestOpen, setNewQuestOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [selectedQuest, setSelectedQuest] = useState<Quest | null>(null)
  const [userActions, setUserActions] = useState<User | null>(null)
  const [notice, setNotice] = useState('')
  const [editingQuest, setEditingQuest] = useState<Quest | null>(null)
  const [editingUser, setEditingUser] = useState<User | null>(null)

  const loadUsers = async () => {
    setUsersLoading(true)
    setUsersError('')
    const { data, error } = await supabase.rpc('admin_list_students')
    if (error) {
      setUsersError(`Student table could not load: ${error.message}. Apply 005_students.sql in Supabase SQL Editor.`)
      setUsers([])
    } else {
      setUsers(
        (data ?? []).map((student: { id: string; student_number: string; name: string; email: string | null; course: string; year_level: string; section: string; campus: string; goal: string; status: 'Active' | 'Inactive'; created_at: string; quests_completed: number }) => ({
          id: student.id,
          studentNumber: student.student_number,
          name: student.name || student.email?.split('@')[0] || 'Bee Explorer',
          email: student.email || 'No email',
          course: student.course,
          yearLevel: student.year_level,
          section: student.section,
          campus: student.campus,
          goal: student.goal,
          joined: new Date(student.created_at).toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' }),
          quests: String(student.quests_completed),
          status: student.status,
        }))
      )
    }
    setUsersLoading(false)
  }

  const loadQuests = async () => {
    setQuestsLoading(true)
    setQuestsError('')
    const { data, error } = await supabase.rpc('admin_list_quests')
    if (error) {
      setQuestsError(`Quest table could not load: ${error.message}. Apply 006_admin_quest_management.sql in Supabase SQL Editor.`)
      setQuests([])
      setQuestsLoading(false)
      return
    }
    setQuests((data ?? []).map((quest: { id: string; owner_id: string; title: string; description: string | null; category: QuestDraft['category']; xp: number; status: Quest['status']; completions: number; assignee: string }) => ({
      id: quest.id,
      ownerId: quest.owner_id,
      title: quest.title,
      description: quest.description ?? '',
      category: quest.category,
      xp: quest.xp,
      difficulty: quest.xp >= 50 ? 'Hard' : quest.xp >= 30 ? 'Medium' : 'Easy',
      completions: String(quest.completions ?? 0),
      status: quest.status,
      assignee: quest.assignee,
    })))
    setQuestsLoading(false)
  }

  const loadAdminRole = async () => {
    const { data } = await supabase.rpc('admin_get_my_role')
    const current = data?.[0]
    setAdminRole(current?.is_active ? current.role : null)
    return current?.is_active ? current.role : null
  }

  const loadOsasPermissions = async () => {
    try {
      const permissions = await getMyOsasPermissions()
      setOsasPermissions(permissions)
      return permissions
    } catch {
      const empty = { can_view_aggregates: false, can_manage_support_requests: false, is_active: false }
      setOsasPermissions(empty)
      return empty
    }
  }

  const loadAdmins = async () => {
    
    setAdminsLoading(true)
    setAdminsError('')
    const { data, error } = await supabase.rpc('super_admin_list_admins')
    if (error) {
      setAdminsError(error.message)
      setAdmins([])
    } else {
      setAdmins((data ?? []).map((admin: { id: string; email: string; display_name: string | null; role: 'admin' | 'super_admin'; is_active: boolean; created_at: string }) => ({
        id: admin.id,
        email: admin.email,
        displayName: admin.display_name || admin.email,
        role: admin.role,
        isActive: admin.is_active,
        createdAt: new Date(admin.created_at).toLocaleDateString(),
      })))
    }
    setAdminsLoading(false)
  }

  useEffect(() => {
    let active = true
    const applySession = async (session: Session | null) => {
      if (!active) return
      if (!session) {
        setAuthenticated(false)
        setAuthChecking(false)
        setAdminChecking(false)
        setUsers([])
        setQuests([])
        setAdmins([])
        setAdminRole(null)
        setOsasPermissions({ can_view_aggregates: false, can_manage_support_requests: false, is_active: false })
        return
      }
      setAuthenticated(true)
      setAdminChecking(true)
      setAdminIdentity({
        name: session.user.user_metadata?.display_name || session.user.user_metadata?.name || session.user.email || 'Administrator',
        email: session.user.email || '',
      })
      const role = await loadAdminRole()
      if (!active) return
      if (!role) {
        setUsers([])
        setQuests([])
        setAdmins([])
        setOsasPermissions({ can_view_aggregates: false, can_manage_support_requests: false, is_active: false })
        setAdminChecking(false)
        setAuthChecking(false)
        return
      }
      const tasks: Promise<unknown>[] = [loadUsers(), loadQuests(), loadOsasPermissions()]
      if (role === 'super_admin') tasks.push(loadAdmins())
      await Promise.all(tasks)
      if (active) {
        setAdminChecking(false)
        setAuthChecking(false)
      }
    }
    void supabase.auth.getSession().then(({ data: { session } }) => applySession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      void applySession(session)
    })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const toggleTheme = () => {
    setDark((value) => {
      localStorage.setItem('beebetter-theme', value ? 'light' : 'dark')
      return !value
    })
  }
  const navigate = (next: Section) => {
    setSection(next)
    setProfileOpen(false)
  }

  const saveStudent = async (student: User) => {
    const { data, error } = await supabase.rpc('admin_update_student', {
      student_id: student.id,
      student_number_value: student.studentNumber,
      name_value: student.name,
      email_value: student.email,
      course_value: student.course,
      year_level_value: student.yearLevel,
      section_value: student.section,
      campus_value: student.campus,
      goal_value: student.goal,
      status_value: student.status,
    })
    if (error) {
      setNotice(`Could not save ${student.name}: ${error.message}`)
      return
    }
    const saved = { ...student, status: data?.status || student.status }
    setUsers((current) => current.map((item) => item.id === saved.id ? saved : item))
    setSelectedUser(null)
    setEditingUser(null)
    setNotice(`${saved.name}'s student information was updated.`)
  }

  const createQuest = async (draft: QuestDraft) => {
    const xp = draft.difficulty === 'Hard' ? 60 : draft.difficulty === 'Medium' ? 35 : 20
    const { data, error } = await supabase.rpc('admin_create_quest', {
      title_value: draft.title,
      description_value: draft.description,
      category_value: draft.category,
      xp_value: xp,
      status_value: draft.publish ? 'active' : 'pending',
      assignee_id: draft.assigneeId,
    })
    if (error) {
      setNotice(`Could not assign quest: ${error.message}`)
      return
    }
    if (!data?.length) {
      setNotice('No eligible active student accounts were available, so no quest was created.')
      return
    }
    await loadQuests()
    setNewQuestOpen(false)
    setEditingQuest(null)
    setNotice(draft.publish
      ? (draft.assigneeId ? 'Quest published and assigned successfully.' : 'Quest published for every active student.')
      : (draft.assigneeId ? 'Quest saved as a draft for the selected student.' : 'Quest saved as a draft for every active student.'))
  }

  const updateQuest = async (quest: Quest, draft: QuestDraft) => {
    const xp = draft.difficulty === 'Hard' ? 60 : draft.difficulty === 'Medium' ? 35 : 20
    const { error } = await supabase.rpc('admin_update_quest', {
      quest_id_value: quest.id,
      title_value: draft.title,
      description_value: draft.description,
      category_value: draft.category,
      xp_value: xp,
      status_value: draft.publish ? 'active' : 'pending',
    })
    if (error) {
      setNotice(`Could not update quest: ${error.message}`)
      return
    }
    await loadQuests()
    setEditingQuest(null)
    setNotice(`"${draft.title}" was updated.`)
  }

  const grantAdmin = async (adminId: string, role: Admin['role']) => {
    const { error } = await supabase.rpc('super_admin_grant_admin', { target_user_id: adminId.trim(), role_value: role })
    if (error) { setNotice(`Could not add admin: ${error.message}`); return }
    setAdminModalOpen(false)
    await loadAdmins()
    setNotice('Admin access granted.')
  }

  const updateAdmin = async (admin: Admin, role: Admin['role'], isActive: boolean) => {
    const { error } = await supabase.rpc('super_admin_update_admin', { target_user_id: admin.id, role_value: role, is_active_value: isActive })
    if (error) { setNotice(`Could not update ${admin.email}: ${error.message}`); return }
    await loadAdmins()
    setNotice(`${admin.email} was updated.`)
  }

  const removeAdmin = async (admin: Admin) => {
    if (!window.confirm(`Remove admin access for ${admin.email}?`)) return
    const { error } = await supabase.rpc('super_admin_remove_admin', { target_user_id: admin.id })
    if (error) { setNotice(`Could not remove ${admin.email}: ${error.message}`); return }
    await loadAdmins()
    setNotice(`${admin.email} no longer has admin access.`)
  }

  if (authChecking || (authenticated && adminChecking)) return <div className="auth-shell"><div className="auth-card"><p>Checking admin access...</p></div></div>
  if (!authenticated) return <AuthScreen onSuccess={() => { setAuthenticated(true); setAdminChecking(true) }} dark={dark} onToggleTheme={toggleTheme} />
  if (!adminRole) return <div className={dark ? 'auth-shell dark' : 'auth-shell'}><div className="auth-card"><span className="eyebrow">ADMIN ACCESS</span><h2>Access unavailable</h2><p>This account is not an active BeeBetter administrator.</p><button className="auth-submit" onClick={() => void supabase.auth.signOut()}>Sign out</button></div></div>
  const sections = ['Overview', 'Users', 'Quests', ...(osasPermissions.can_manage_support_requests ? ['Support Requests'] : []), ...(adminRole === 'super_admin' ? ['Admins'] : [])] as Section[]

  return (
    <div className={dark ? 'app-shell dark' : 'app-shell'}>
      <aside className="sidebar">
        <Brand />
        <span className="admin-label">ADMIN CONSOLE</span>
        <nav>{sections.map((item) => <button className={section === item ? 'nav-item active' : 'nav-item'} onClick={() => navigate(item)} key={item}><span>{item === 'Overview' ? '▦' : item === 'Users' ? '♙' : item === 'Quests' ? '⚑' : item === 'Support Requests' ? '✉' : item === 'Admins' ? '♙' : '♛'}</span>{item}</button>)}</nav>
        <div className="sidebar-tools"><button onClick={toggleTheme}>◐ <span>{dark ? 'Light mode' : 'Dark mode'}</span></button><button onClick={() => void supabase.auth.signOut()}>↪ <span>Sign out</span></button></div>
        <ProfileBadge identity={adminIdentity} onClick={() => setProfileOpen((value) => !value)} />
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="mobile-brand"><Brand /></div>
          <div className="top-actions">
            <button className="icon-button" aria-label="Toggle theme" onClick={toggleTheme}>{dark ? '☀' : '☾'}</button>
            <button className="avatar-button" aria-label="Open administrator profile" onClick={() => setProfileOpen((value) => !value)}><span className="avatar">{initials(adminIdentity.name)}</span></button>
          </div>
          {profileOpen && <div className="popover profile-popover"><b>{adminIdentity.name}</b><small>{adminIdentity.email || 'Supabase admin account'}</small><button onClick={toggleTheme}>◐ {dark ? 'Switch to light mode' : 'Switch to dark mode'}</button><button onClick={() => void supabase.auth.signOut()}>↪ Sign out</button></div>}
        </header>
        <nav className="mobile-nav">{sections.map((item) => <button className={section === item ? 'mobile-nav-item active' : 'mobile-nav-item'} onClick={() => navigate(item)} key={item}>{item}</button>)}</nav>
        <div className="content">
          <div className="heading-row"><div><span className="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()}</span><h1>{section === 'Overview' ? 'Student Development & Well-being' : section}</h1><p>{section === 'Overview' ? 'Privacy-conscious OSAS insights from BeeBetter participation and voluntary student reports.' : `Manage and monitor ${section.toLowerCase()} in your app.`}</p></div>{section === 'Quests' && <button className="primary-button" onClick={() => setNewQuestOpen(true)}>＋ New quest</button>}</div>
          {section === 'Overview' && <OsasDashboard permissions={osasPermissions} onOpenSupport={() => navigate('Support Requests')} />}
          {section === 'Users' && <DataTable kind="users" users={users} loading={usersLoading} error={usersError} onRefresh={loadUsers} onUserClick={setSelectedUser} onUserActions={setUserActions} />}
          {section === 'Quests' && <DataTable kind="quests" quests={quests} loading={questsLoading} error={questsError} onRefresh={loadQuests} onQuestClick={setSelectedQuest} />}
          {section === 'Support Requests' && osasPermissions.can_manage_support_requests && <SupportRequests />}
          {section === 'Admins' && adminRole === 'super_admin' && <><AdminTable admins={admins} loading={adminsLoading} error={adminsError} onRefresh={loadAdmins} onAdd={() => setAdminModalOpen(true)} onUpdate={updateAdmin} onRemove={removeAdmin} /><OsasPermissions admins={admins} /></>}
        </div>
      </main>
      {(newQuestOpen || editingQuest) && <QuestModal initialQuest={editingQuest} users={users} onClose={() => { setNewQuestOpen(false); setEditingQuest(null) }} onSave={(draft) => editingQuest ? updateQuest(editingQuest, draft) : createQuest(draft)} />}
      {selectedUser && <UserDetails user={selectedUser} onClose={() => setSelectedUser(null)} onEdit={() => { setEditingUser(selectedUser); setSelectedUser(null) }} onToggleStatus={() => { void saveStudent({ ...selectedUser, status: selectedUser.status === 'Active' ? 'Inactive' : 'Active' }) }} />}
      {selectedQuest && <QuestDetails quest={selectedQuest} onClose={() => setSelectedQuest(null)} onEdit={() => { setEditingQuest(selectedQuest); setSelectedQuest(null) }} />}
      {userActions && <UserActions user={userActions} onClose={() => setUserActions(null)} onOpenProfile={() => { setSelectedUser(userActions); setUserActions(null) }} onToggleStatus={() => { void saveStudent({ ...userActions, status: userActions.status === 'Active' ? 'Inactive' : 'Active' }) }} />}
      {editingUser && <StudentModal user={editingUser} onClose={() => setEditingUser(null)} onSave={(user) => { void saveStudent(user) }} />}
      {adminModalOpen && <AdminModal onClose={() => setAdminModalOpen(false)} onSave={grantAdmin} />}
      {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice('')}>×</button></div>}
    </div>
  )
}

function Brand() { return <div className="brand"><span className="brand-mark">✦</span><strong>BeeBetter</strong></div> }
function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'AD' }
function ProfileBadge({ identity, onClick }: { identity: AdminIdentity; onClick: () => void }) { return <button className="side-profile" onClick={onClick}><span className="avatar">{initials(identity.name)}</span><span><b>{identity.name}</b><small>{identity.email || 'Administrator'}</small></span><span>...</span></button> }

function AuthScreen({ onSuccess, dark, onToggleTheme }: { onSuccess: () => void; dark: boolean; onToggleTheme: () => void }) {
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

function UserRow({ user, onClick }: { user: User; onClick?: () => void }) { return <button className="recent-row clickable-row" onClick={onClick}><span className="table-avatar">{user.name.split(' ').map((name) => name[0]).join('')}</span><div className="row-copy"><b>{user.name}</b><small>{user.email}</small></div><Status status={user.status} /></button> }
function Status({ status }: { status: string }) { return <span className={`status ${status.toLowerCase()}`}><i />{status}</span> }

function DataTable({ kind, users = [], quests = [], loading = false, error = '', onRefresh, onUserClick, onUserActions, onQuestClick }: { kind: 'users' | 'quests'; users?: User[]; quests?: Quest[]; loading?: boolean; error?: string; onRefresh?: () => void; onUserClick?: (user: User) => void; onUserActions?: (user: User) => void; onQuestClick?: (quest: Quest) => void }) {
  const isUsers = kind === 'users'
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('All')
  const normalizedSearch = search.trim().toLocaleLowerCase()
  const filteredUsers = useMemo(() => users.filter((user) => `${user.studentNumber} ${user.name} ${user.email} ${user.course} ${user.yearLevel} ${user.section} ${user.campus} ${user.goal}`.toLocaleLowerCase().includes(normalizedSearch) && (filter === 'All' || user.status === filter)), [users, normalizedSearch, filter])
  const filteredQuests = useMemo(() => quests.filter((quest) => `${quest.title} ${quest.category} ${quest.difficulty} ${quest.assignee}`.toLocaleLowerCase().includes(normalizedSearch) && (filter === 'All' || quest.status === filter || quest.difficulty === filter)), [quests, normalizedSearch, filter])
  return (
    <section className="panel table-panel">
      <div className="table-toolbar">
        <div className="search">⌕ <input aria-label={`Search ${kind}`} placeholder={`Search ${kind}`} value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        <select className="filter" value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option>All</option>
          {isUsers ? <><option>Active</option><option>Inactive</option></> : <><option value="active">Published</option><option value="pending">Draft</option><option value="completed">Completed</option><option value="rejected">Rejected</option><option>Easy</option><option>Medium</option><option>Hard</option></>}
        </select>
        {onRefresh && <button className="secondary-button" onClick={onRefresh}>Refresh</button>}
      </div>
      {error && <div className="empty-state">{error}</div>}
      {loading ? <div className="empty-state">Loading {isUsers ? 'students' : 'quests'}...</div> : isUsers ? <UserRows users={filteredUsers} search={search} onUserClick={onUserClick} onUserActions={onUserActions} /> : <QuestRows quests={filteredQuests} search={search} onQuestClick={onQuestClick} />}
    </section>
  )
}

function UserRows({ users, search, onUserClick, onUserActions }: { users: User[]; search: string; onUserClick?: (user: User) => void; onUserActions?: (user: User) => void }) {
  if (users.length === 0) return <div className="empty-state">No users match “{search}”. Try another search.</div>
  return <div className="table-scroll"><div className="table-row table-header">{['STUDENT', 'COURSE', 'GOAL', 'JOINED', 'STATUS', ''].map((head) => <span key={head}>{head}</span>)}</div>{users.map((row) => <div className="table-row" key={row.id}><UserRow user={row} onClick={() => onUserClick?.(row)} /><span>{row.course}</span><span>{row.goal || 'No goal set'}</span><span>{row.joined}</span><Status status={row.status} /><button className="row-menu" onClick={() => onUserActions?.(row)}>•••</button></div>)}</div>
}

function QuestRows({ quests, search, onQuestClick }: { quests: Quest[]; search: string; onQuestClick?: (quest: Quest) => void }) {
  if (quests.length === 0) return <div className="empty-state">No quests match “{search}”. Try another search.</div>
  return <div className="table-scroll"><div className="table-row table-header">{['QUEST', 'CATEGORY', 'DIFFICULTY', 'ASSIGNED TO', 'STATUS'].map((head) => <span key={head}>{head}</span>)}</div>{quests.map((row) => <button className="table-row clickable-row" onClick={() => onQuestClick?.(row)} key={row.id}><div className="quest-cell"><span className="quest-icon">✦</span><b>{row.title}</b></div><span>{row.category}</span><span>{row.difficulty}</span><span>{row.assignee}</span><Status status={questStatusLabel(row.status)} /></button>)}</div>
}

function AdminTable({ admins, loading, error, onRefresh, onAdd, onUpdate, onRemove }: { admins: Admin[]; loading: boolean; error: string; onRefresh: () => void; onAdd: () => void; onUpdate: (admin: Admin, role: Admin['role'], isActive: boolean) => void; onRemove: (admin: Admin) => void }) {
  return <section className="panel table-panel"><div className="table-toolbar"><div><h2>Admin access</h2><p>Manage who can access the admin console.</p></div><div><button className="secondary-button" onClick={onRefresh}>Refresh</button><button className="primary-button" onClick={onAdd}>＋ Add admin</button></div></div>{error && <div className="empty-state">Could not load admins: {error}. Apply 007_super_admin_management.sql.</div>}{loading ? <div className="empty-state">Loading admins...</div> : admins.length === 0 ? <div className="empty-state">No admin records found.</div> : <div className="table-scroll"><div className="table-row table-header"><span>ADMIN</span><span>ROLE</span><span>STATUS</span><span>ADDED</span><span>ACTIONS</span></div>{admins.map((admin) => <div className="table-row" key={admin.id}><div className="row-copy"><b>{admin.displayName}</b><small>{admin.email}</small></div><select value={admin.role} onChange={(event) => onUpdate(admin, event.target.value as Admin['role'], admin.isActive)}><option value="admin">Admin</option><option value="super_admin">Super Admin</option></select><Status status={admin.isActive ? 'Active' : 'Inactive'} /><span>{admin.createdAt}</span><div><button className="secondary-button" onClick={() => onUpdate(admin, admin.role, !admin.isActive)}>{admin.isActive ? 'Disable' : 'Enable'}</button><button className="row-menu" onClick={() => onRemove(admin)}>×</button></div></div>)}</div>}</section>
}

function AdminModal({ onClose, onSave }: { onClose: () => void; onSave: (id: string, role: Admin['role']) => Promise<void> }) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    void onSave(String(data.get('userId') || ''), String(data.get('role')) as Admin['role'])
  }
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={onClose}>×</button><span className="eyebrow">ADMIN ACCESS</span><h2>Add an admin</h2><p>The user must already exist in Supabase Authentication.</p><form onSubmit={submit}><label>Auth user UUID<input name="userId" required placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" /></label><label>Role<select name="role" defaultValue="admin"><option value="admin">Admin</option><option value="super_admin">Super Admin</option></select></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit">Grant access</button></div></form></div></div>
}

function Drawer({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return <div className="drawer-backdrop" onClick={onClose}><aside className="drawer" onClick={(event) => event.stopPropagation()}><button className="drawer-close" onClick={onClose}>×</button>{children}</aside></div>
}

function UserDetails({ user, onClose, onEdit, onToggleStatus }: { user: User; onClose: () => void; onEdit: () => void; onToggleStatus: () => void }) {
  return <Drawer onClose={onClose}><span className="eyebrow">STUDENT PROFILE</span><div className="drawer-avatar">{initials(user.name)}</div><h2>{user.name}</h2><p className="drawer-muted">{user.email}</p><Status status={user.status} /><div className="detail-grid"><div><small>STUDENT NUMBER</small><b>{user.studentNumber}</b></div><div><small>COURSE</small><b>{user.course}</b></div><div><small>YEAR / SECTION</small><b>{user.yearLevel} / {user.section}</b></div><div><small>CAMPUS</small><b>{user.campus}</b></div><div><small>GOAL</small><b>{user.goal || 'No goal set'}</b></div><div><small>QUESTS COMPLETED</small><b>{user.quests}</b></div></div><h3>Admin actions</h3><button className="drawer-action" onClick={onEdit}>Edit student information</button><button className="drawer-action danger" onClick={onToggleStatus}>{user.status === 'Active' ? 'Set account inactive' : 'Reactivate account'}</button></Drawer>
}

function questStatusLabel(status: Quest['status']) {
  return status === 'active' ? 'Published' : status === 'pending' ? 'Draft' : status === 'completed' ? 'Completed' : 'Rejected'
}

function QuestDetails({ quest, onClose, onEdit }: { quest: Quest; onClose: () => void; onEdit: () => void }) {
  const editable = quest.status === 'active' || quest.status === 'pending'
  return <Drawer onClose={onClose}><span className="eyebrow">QUEST DETAILS</span><div className="drawer-quest-icon">Q</div><h2>{quest.title}</h2><p className="drawer-muted">{quest.description || 'No description provided.'}</p><p className="drawer-muted">{quest.category} / {quest.difficulty} / {quest.xp} XP</p><Status status={questStatusLabel(quest.status)} /><div className="detail-grid"><div><small>COMPLETION</small><b>{quest.completions === '1' ? 'Completed' : 'Not completed'}</b></div><div><small>ASSIGNED TO</small><b>{quest.assignee}</b></div></div><h3>Quest actions</h3>{editable ? <button className="drawer-action" onClick={onEdit}>Edit this assignment</button> : <p className="drawer-muted">Completed and rejected assignments cannot be edited.</p>}</Drawer>
}

function UserActions({ user, onClose, onOpenProfile, onToggleStatus }: { user: User; onClose: () => void; onOpenProfile: () => void; onToggleStatus: () => void }) {
  return <Drawer onClose={onClose}><span className="eyebrow">USER ACTIONS</span><h2>{user.name}</h2><p className="drawer-muted">Choose an available account-management action.</p><button className="drawer-action" onClick={onOpenProfile}>View profile</button><button className="drawer-action danger" onClick={onToggleStatus}>{user.status === 'Active' ? 'Set account inactive' : 'Reactivate account'}</button></Drawer>
}

function QuestModal({ initialQuest, users, onClose, onSave }: { initialQuest: Quest | null; users: User[]; onClose: () => void; onSave: (quest: QuestDraft) => Promise<void> }) {
  const editing = Boolean(initialQuest)
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const submitter = (event.nativeEvent as SubmitEvent).submitter
    void onSave({
      title: String(data.get('title')),
      description: String(data.get('description') || ''),
      category: String(data.get('category')) as QuestDraft['category'],
      difficulty: String(data.get('difficulty')) as QuestDraft['difficulty'],
      assigneeId: editing ? initialQuest!.ownerId : String(data.get('assignee') || '') || null,
      publish: editing ? data.get('status') === 'active' : submitter?.getAttribute('value') === 'publish',
    })
  }
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={onClose}>x</button><span className="eyebrow">QUEST STUDIO</span><h2>{editing ? 'Edit quest assignment' : 'Create a new quest'}</h2><p>{editing ? `Update the assignment for ${initialQuest!.assignee}. This will not create another quest.` : "Create a quest that appears in the selected student's mobile quest board."}</p><form onSubmit={submit}><label>Quest title<input name="title" required maxLength={100} defaultValue={initialQuest?.title} placeholder="e.g. Take a mindful break" /></label><label>Description<textarea name="description" rows={3} defaultValue={initialQuest?.description} placeholder="What should the student do?" /></label>{editing ? <div className="assignment-note">Assigned to {initialQuest!.assignee}</div> : <><label>Send this quest to<select name="assignee" defaultValue=""><option value="">Everyone</option>{users.filter((user) => user.status === 'Active').map((user) => <option key={user.id} value={user.id}>{user.name} / {user.studentNumber}</option>)}</select></label><div className="assignment-note">Everyone assigns one copy to each active student account.</div></>}<label>Category<select name="category" defaultValue={initialQuest?.category || 'Habits'}><option>Academics</option><option>Habits</option><option>Social</option><option>Health</option></select></label><label>Difficulty<select name="difficulty" defaultValue={initialQuest?.difficulty || 'Easy'}><option>Easy</option><option>Medium</option><option>Hard</option></select></label>{editing ? <label>Status<select name="status" defaultValue={initialQuest?.status === 'active' ? 'active' : 'pending'}><option value="pending">Draft</option><option value="active">Published</option></select></label> : null}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button>{editing ? <button className="primary-button" type="submit">Save changes</button> : <><button className="secondary-button" type="submit" value="draft">Save draft</button><button className="primary-button" type="submit" value="publish">Publish quest</button></>}</div></form></div></div>
}

function StudentModal({ user, onClose, onSave }: { user: User; onClose: () => void; onSave: (user: User) => void }) {
  const original: StudentFields = { name: user.name, student_number: user.studentNumber, course: user.course, year_level: user.yearLevel, campus: user.campus, section: user.section, goal: user.goal }
  const [draft, setDraft] = useState(original)
  const [status, setStatus] = useState(user.status)
  const [other, setOther] = useState(!(PROGRAMS as readonly string[]).includes(normalizeProgram(user.course)))
  const [options, setOptions] = useState<EnrollmentOption[]>([])
  const [optionError, setOptionError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      try {
        const { data, error } = await supabase.from('student_enrollment_options').select('id,course,year_level,campus,section').order('campus').order('section').abortSignal(controller.signal)
        if (!controller.signal.aborted) { setOptions(data ?? []); setOptionError(error ? 'Could not load school options.' : '') }
      } catch { if (!controller.signal.aborted) setOptionError('Could not load school options.') }
    })()
    return () => controller.abort()
  }, [retry])
  const errors = validateStudent(draft, options, original)
  const change = (field: keyof StudentFields, value: string) => setDraft(previous => ({ ...previous, [field]: value, ...(['course', 'year_level', 'campus'].includes(field) ? { section: '' } : {}) }))
  const message = (field: keyof StudentFields) => errors[field] ? <small role="alert" style={{ color: '#a83434' }}>{errors[field]}</small> : null
  const legacy = (field: keyof StudentFields, values: string[]) => draft[field] === original[field] && draft[field] && !values.includes(draft[field]) ? [draft[field], ...values] : values
  const campuses = legacy('campus', Array.from(new Set(options.map(o => o.campus))).sort())
  const sections = legacy('section', Array.from(new Set(options.filter(o => o.campus === draft.campus && o.course === normalizeProgram(draft.course) && o.year_level === normalizeYear(draft.year_level)).map(o => o.section))).sort())
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (Object.keys(errors).length) return
    const value = studentPayload(draft, original)
    onSave({ ...user, ...value, studentNumber: value.student_number, yearLevel: value.year_level, status })
  }
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={event => event.stopPropagation()}><button className="modal-close" onClick={onClose} aria-label="Close">{'\u00d7'}</button><span className="eyebrow">STUDENT RECORD</span><h2>Edit student information</h2><p>Required fields use official school information. Unchanged legacy values are preserved.</p>
    {optionError && <p role="alert">{optionError} <button type="button" onClick={() => setRetry(n => n + 1)}>Retry</button></p>}
    <form onSubmit={submit}>
      <label>Student number *<input value={draft.student_number} onChange={e => change('student_number', cleanStudentNumber(e.target.value))} inputMode="numeric" maxLength={9} />{message('student_number')}</label>
      <label>Full name *<input value={draft.name} onChange={e => change('name', cleanName(e.target.value))} maxLength={30} />{message('name')}</label>
      <label>Email<input type="email" value={user.email} readOnly /></label>
      <label>Course / Program *<select value={other ? 'Others' : normalizeProgram(draft.course)} onChange={e => { setOther(e.target.value === 'Others'); change('course', e.target.value === 'Others' ? '' : e.target.value) }}><option value="">Choose program</option>{[...PROGRAMS, 'Others'].map(value => <option key={value}>{value}</option>)}</select></label>
      {other && <label>Specify program *<input value={draft.course} maxLength={LIMITS.course} onChange={e => change('course', e.target.value)} /></label>}{message('course')}
      <label>Year level *<select value={draft.year_level} onChange={e => change('year_level', e.target.value)}><option value="">Choose year</option>{legacy('year_level', [...YEARS]).map(value => <option key={value}>{value}</option>)}</select>{message('year_level')}</label>
      <label>Campus *<select value={draft.campus} onChange={e => change('campus', e.target.value)}><option value="">Choose campus</option>{campuses.map(value => <option key={value}>{value}</option>)}</select>{message('campus')}</label>
      <label>Section *<select value={draft.section} onChange={e => change('section', e.target.value)}><option value="">Choose section</option>{sections.map(value => <option key={value}>{value}</option>)}</select>{message('section')}</label>
      {!sections.length && <p>No sections configured for this combination. Update student_enrollment_options in Supabase with approved school values.</p>}
      <label>Goal *<input value={draft.goal} maxLength={LIMITS.goal} onChange={e => change('goal', e.target.value)} />{message('goal')}</label>
      <label>Status<select value={status} onChange={e => setStatus(e.target.value as User['status'])}><option>Active</option><option>Inactive</option></select></label>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit" disabled={Object.keys(errors).length > 0}>Save student</button></div>
    </form></div></div>
}


export default App
