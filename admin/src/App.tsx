import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import './App.css'
import { supabase } from './supabase'
import { getMyOsasPermissions, type OsasPermissions as OsasPermissionState } from './osas-data'
import type { Admin, AdminIdentity, ListQuery, Quest, QuestDraft, Section, User } from './admin-types'
import { listAdmins, listQuests, listStudents, questXp } from './admin-data'
import { AuthScreen, Brand, ProfileBadge, initials } from './AdminShell'
import { AdminTable, DataTable } from './AdminTables'
import { AdminModal, QuestDetails, QuestModal, StudentModal, UserActions, UserDetails } from './AdminModals'

const PAGE_SIZE = 50
const SupportRequests=lazy(()=>import('./SupportRequests').then(module=>({default:module.SupportRequests})))
const OsasPermissions=lazy(()=>import('./OsasPermissions').then(module=>({default:module.OsasPermissions})))
const OsasDashboard=lazy(()=>import('./OsasDashboard').then(module=>({default:module.OsasDashboard})))
const SemesterManagement=lazy(()=>import('./SemesterManagement').then(module=>({default:module.SemesterManagement})))



function App() {
  const userRequest = useRef(0)
  const questRequest = useRef(0)
  const [authenticated, setAuthenticated] = useState(false)
  const [authChecking, setAuthChecking] = useState(true)
  const [adminChecking, setAdminChecking] = useState(true)
  const [adminIdentity, setAdminIdentity] = useState<AdminIdentity>({ name: 'Administrator', email: '' })
  const [section, setSection] = useState<Section>('Overview')
  const [dark, setDark] = useState(() => localStorage.getItem('beebetter-theme') === 'dark')
  const [users, setUsers] = useState<User[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersError, setUsersError] = useState('')
  const [userQuery, setUserQuery] = useState<ListQuery>({ page: 0, pageSize: PAGE_SIZE, search: '', filter: 'All' })
  const [userTotal, setUserTotal] = useState(0)
  const [questsLoading, setQuestsLoading] = useState(false)
  const [questsError, setQuestsError] = useState('')
  const [quests, setQuests] = useState<Quest[]>([])
  const [questQuery, setQuestQuery] = useState<ListQuery>({ page: 0, pageSize: PAGE_SIZE, search: '', filter: 'All' })
  const [questTotal, setQuestTotal] = useState(0)
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
    const request=++userRequest.current
    setUsersLoading(true)
    setUsersError('')
    try {
      const result=await listStudents(userQuery.page,userQuery.pageSize,userQuery.search,userQuery.filter)
      if(request!==userRequest.current)return
      if(result.rows.length===0&&userQuery.page>0){setUserQuery(current=>({...current,page:current.page-1}));return}
      setUsers(result.rows); setUserTotal(result.total)
    } catch(reason) {
      if(request!==userRequest.current)return
      setUsersError(`Student table could not load: ${reason instanceof Error?reason.message:'Unknown error'}. Verify migration 022.`)
      setUsers([])
      setUserTotal(0)
    }
    if(request===userRequest.current)setUsersLoading(false)
  }

  const loadQuests = async () => {
    const request=++questRequest.current
    setQuestsLoading(true)
    setQuestsError('')
    try {
      const result=await listQuests(questQuery.page,questQuery.pageSize,questQuery.search,questQuery.filter)
      if(request!==questRequest.current)return
      if(result.rows.length===0&&questQuery.page>0){setQuestQuery(current=>({...current,page:current.page-1}));return}
      setQuests(result.rows); setQuestTotal(result.total)
    } catch(reason) {
      if(request!==questRequest.current)return
      setQuestsError(`Quest table could not load: ${reason instanceof Error?reason.message:'Unknown error'}. Verify migration 022.`)
      setQuests([])
      setQuestTotal(0)
    }
    if(request===questRequest.current)setQuestsLoading(false)
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
    try {
      setAdmins(await listAdmins())
    } catch(reason) {
      setAdminsError(reason instanceof Error?reason.message:'Could not load administrators')
      setAdmins([])
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
      const tasks: Promise<unknown>[] = [loadOsasPermissions()]
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

  useEffect(() => { if (adminRole) void loadUsers() }, [adminRole,userQuery])
  useEffect(() => { if (adminRole) void loadQuests() }, [adminRole,questQuery])

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
    const xp = questXp(draft.difficulty)
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
    const xp = questXp(draft.difficulty)
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
  const sections = ['Overview', 'Users', 'Quests', 'Semesters & Sections', ...(osasPermissions.can_manage_support_requests ? ['Support Requests'] : []), ...(adminRole === 'super_admin' ? ['Admins'] : [])] as Section[]

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
          <Suspense fallback={<section className="panel dashboard-state">Loading section...</section>}>
          {section === 'Overview' && <OsasDashboard permissions={osasPermissions} onOpenSupport={() => navigate('Support Requests')} />}
          {section === 'Users' && <DataTable kind="users" users={users} total={userTotal} query={userQuery} loading={usersLoading} error={usersError} onRefresh={loadUsers} onQueryChange={setUserQuery} onUserClick={setSelectedUser} onUserActions={setUserActions} />}
          {section === 'Quests' && <DataTable kind="quests" quests={quests} total={questTotal} query={questQuery} loading={questsLoading} error={questsError} onRefresh={loadQuests} onQueryChange={setQuestQuery} onQuestClick={setSelectedQuest} />}
          {section === 'Semesters & Sections' && <SemesterManagement />}
          {section === 'Support Requests' && osasPermissions.can_manage_support_requests && <SupportRequests />}
          {section === 'Admins' && adminRole === 'super_admin' && <><AdminTable admins={admins} loading={adminsLoading} error={adminsError} onRefresh={loadAdmins} onAdd={() => setAdminModalOpen(true)} onUpdate={updateAdmin} onRemove={removeAdmin} /><OsasPermissions admins={admins} /></>}
          </Suspense>
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

export default App
