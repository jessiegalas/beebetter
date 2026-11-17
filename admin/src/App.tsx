import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Dialog } from 'radix-ui'
import './App.css'
import { supabase } from './supabase'
import type { Admin, AdminAccessRequest, Quest, QuestDraft, QuestListQuery, Section, StudentListQuery, User } from './admin-types'
import { listAdminAccessRequests, listAdmins, listQuests, listStudents, questXp, reviewAdminAccessRequest } from './admin-data'
import { AccessScreen, AdminInfoPanel, AuthScreen, Brand, ProfileBadge } from './AdminShell'
import { AdminAccessRequests, AdminTable, DataTable } from './AdminTables'
import { AdminModal, QuestDetails, QuestModal, StudentModal, UserActions, UserDetails } from './AdminModals'
import { useAdminAccess } from './admin-access'
import { ADMIN_SUPPORT_REQUESTS_ENABLED } from './admin-features'

const PAGE_SIZE = 10
const SECTION_LABELS: Record<Section, string> = {
  Overview: 'Overview',
  Wellness: 'Student Wellness',
  Engagement: 'Quest Engagement',
  Reports: 'OSAS Reports',
  Quests: 'Quest Assignments',
  Students: 'Students',
  'Semesters & Sections': 'Semesters & Sections',
  'Data Testing': 'Data Testing',
  'Support Requests': 'Support Requests',
  Admins: 'Admin Access',
}
const SupportRequests = ADMIN_SUPPORT_REQUESTS_ENABLED
  ? lazy(() => import('./SupportRequests').then(module => ({ default: module.SupportRequests })))
  : null
const OsasPermissions=lazy(()=>import('./OsasPermissions').then(module=>({default:module.OsasPermissions})))
const OsasDashboard=lazy(()=>import('./OsasDashboard').then(module=>({default:module.OsasDashboard})))
const SemesterManagement = lazy(() => import('./SemesterManagement').then(module => ({ default: module.SemesterManagement })))
const DataTesting = lazy(() => import('./DataTesting'))

type AppIconName = 'overview' | 'wellness' | 'engagement' | 'reports' | 'users' | 'quests' | 'semesters' | 'testing' | 'support' | 'admins' | 'sun' | 'moon' | 'signOut' | 'menu' | 'close'

function AppIcon({ name }: { name: AppIconName }) {
  return <svg className="app-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    {name === 'overview' && <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></>}
    {name === 'wellness' && <path d="M12 20 4.8 13a4.8 4.8 0 0 1 6.8-6.8l.4.4.4-.4a4.8 4.8 0 0 1 6.8 6.8L12 20Z" />}
    {name === 'engagement' && <path d="M4 4v16h16M8 16l4-5 3 2 5-7" />}
    {name === 'reports' && <><path d="M14 3h-7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8L14 3v5h5M8 12h8M8 16h8" /></>}
    {name === 'users' && <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20v-1.2a5.5 5.5 0 0 1 11 0V20M16 5.2a3.2 3.2 0 0 1 0 6.1M17 14a5.2 5.2 0 0 1 3.5 4.9V20" /></>}
    {name === 'quests' && <><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" /></>}
    {name === 'support' && <><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5 8 8 0 0 1-3.3-.7L4 20l1.7-4.5a7.5 7.5 0 1 1 14.3-4Z" /><path d="M8.5 11.5h7M8.5 14.5h4.5" /></>}
    {name === 'admins' && <><path d="M12 3 20 6v5.3c0 4.6-3.2 7.8-8 9.7-4.8-1.9-8-5.1-8-9.7V6l8-3Z" /><circle cx="12" cy="10" r="2.2" /><path d="M8.5 16a3.8 3.8 0 0 1 7 0" /></>}
    {name === 'sun' && <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2.5 12h2m15 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>}
    {name === 'moon' && <path d="M19.5 15.2A8.2 8.2 0 0 1 8.8 4.5 8.5 8.5 0 1 0 19.5 15.2Z" />}
    {name === 'signOut' && <><path d="M10 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H10M14 16l4-4-4-4M18 12H9" /></>}
    {name === 'menu' && <path d="M4 6h16M4 12h16M4 18h16" />}
    {name === 'semesters' && <><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M7.5 3.5v3M16.5 3.5v3M3.5 9.5h17M8 13h3M8 16.5h3M14 13h2.5" /></>}
    {name === 'testing' && <path d="M9 3h6M10 3v6l-5.5 8.5A2.2 2.2 0 0 0 6.4 21h11.2a2.2 2.2 0 0 0 1.9-3.5L14 9V3M7 14h10" />}
    {name === 'close' && <path d="m6 6 12 12M18 6 6 18" />}
  </svg>
}

function SectionIcon({ section }: { section: Section }) {
  const names: Record<Section, AppIconName> = {
    Overview: 'overview',
    Wellness: 'wellness',
    Engagement: 'engagement',
    Reports: 'reports',
    Students: 'users',
    Quests: 'quests',
    'Semesters & Sections': 'semesters',
    'Data Testing': 'testing',
    'Support Requests': 'support',
    Admins: 'admins',
  }
  return <AppIcon name={names[section]} />
}

const headerDate = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' })
const headerTime = new Intl.DateTimeFormat('en-PH', { timeStyle: 'short', timeZone: 'Asia/Manila' })

function HeaderClock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    let timer: number
    function update() {
      const current = new Date()
      setNow(current)
      timer = window.setTimeout(update, 60_000 - current.getTime() % 60_000)
    }
    update()
    return () => window.clearTimeout(timer)
  }, [])

  return <time className="workspace-clock" dateTime={now.toISOString()} title="Asia/Manila">
    <strong>{headerTime.format(now)}</strong>
    <span>{headerDate.format(now)}</span>
  </time>
}

function App() {
  const access = useAdminAccess()
  const [dark, setDark] = useState(() => localStorage.getItem('beebetter-theme') === 'dark')
  const toggleTheme = () => {
    setDark((value) => {
      localStorage.setItem('beebetter-theme', value ? 'light' : 'dark')
      return !value
    })
  }
  if (access.phase === 'signed_out') return <AuthScreen onSignIn={access.signIn} onSignUp={access.signUp} dark={dark} onToggleTheme={toggleTheme} />
  if (access.phase === 'error' || access.phase === 'denied') return <AccessScreen identity={access.identity} request={access.accessRequest} adminManaged={access.adminManaged} requestLoading={access.requestLoading} operationError={access.operationError} accessError={access.phase === 'error' ? access.error : undefined} onRequest={() => { void access.requestAccess() }} onRefresh={() => { void access.refresh() }} onSignOut={() => { void access.signOut() }} dark={dark} />
  if (access.phase !== 'active' || !access.role) return <div className={dark ? 'auth-shell access-shell dark' : 'auth-shell access-shell'}><div className="auth-card"><Brand /><p role="status">Checking admin access...</p></div></div>
  return <AdminWorkspace key={access.identity.id} access={access} adminRole={access.role} dark={dark} toggleTheme={toggleTheme} />
}

function AdminWorkspace({ access, adminRole, dark, toggleTheme }: { access: ReturnType<typeof useAdminAccess>; adminRole: Admin['role']; dark: boolean; toggleTheme: () => void }) {
  const mounted = useRef(true)
  const userRequest = useRef(0)
  const questRequest = useRef(0)
  const adminRequest = useRef(0)
  const accessListRequest = useRef(0)
  const { identity: adminIdentity, osasPermissions, operationError, signOut } = access
  const canManageSupport = ADMIN_SUPPORT_REQUESTS_ENABLED && osasPermissions.can_manage_support_requests
  const [section, setSection] = useState<Section>('Overview')
  const headingRef = useRef<HTMLHeadingElement>(null)
  const focusHeading = useRef(false)
  const [users, setUsers] = useState<User[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersError, setUsersError] = useState('')
  const [userQuery, setUserQuery] = useState<StudentListQuery>({ page: 0, pageSize: PAGE_SIZE, search: '', status: 'All' })
  const [userTotal, setUserTotal] = useState(0)
  const [questsLoading, setQuestsLoading] = useState(false)
  const [questsError, setQuestsError] = useState('')
  const [quests, setQuests] = useState<Quest[]>([])
  const [questQuery, setQuestQuery] = useState<QuestListQuery>({ page: 0, pageSize: 50, search: '', status: 'All', difficulty: 'All' })
  const [questTotal, setQuestTotal] = useState(0)
  const [assignmentRevision, setAssignmentRevision] = useState(0)
  const [admins, setAdmins] = useState<Admin[]>([])
  const [adminAccessRequests, setAdminAccessRequests] = useState<AdminAccessRequest[]>([])
  const [accessRequestsLoading, setAccessRequestsLoading] = useState(false)
  const [accessRequestsError, setAccessRequestsError] = useState('')
  const [adminsLoading, setAdminsLoading] = useState(false)
  const [adminsError, setAdminsError] = useState('')
  const [adminModalOpen, setAdminModalOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const profileAfterNavigation = useRef(false)
  const [newQuestOpen, setNewQuestOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [selectedQuest, setSelectedQuest] = useState<Quest | null>(null)
  const [userActions, setUserActions] = useState<User | null>(null)
  const [notice, setNotice] = useState<{ message: string; tone: 'success' | 'error' | 'warning' } | null>(null)
  const [editingQuest, setEditingQuest] = useState<Quest | null>(null)
  const [editingUser, setEditingUser] = useState<User | null>(null)

  function showNotice(message: string, tone: 'success' | 'error' | 'warning' = 'success') {
    setNotice({ message, tone })
  }

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; userRequest.current++; questRequest.current++; adminRequest.current++; accessListRequest.current++ }
  }, [])

  const loadUsers = useCallback(async () => {
    if (!mounted.current) return
    const request=++userRequest.current
    setUsersLoading(true)
    setUsersError('')
    try {
      const result=await listStudents(userQuery)
      if(request!==userRequest.current)return
      if(result.rows.length===0&&userQuery.page>0){setUserQuery(current=>({...current,page:0}));return}
      setUsers(result.rows); setUserTotal(result.total)
    } catch(reason) {
      if(request!==userRequest.current)return
      setUsersError(`Student table could not load: ${reason instanceof Error?reason.message:'Unknown error'}`)
      setUsers([])
      setUserTotal(0)
    }
    if(request===userRequest.current)setUsersLoading(false)
  }, [userQuery])

  const loadQuests = useCallback(async () => {
    if (!mounted.current) return
    const request=++questRequest.current
    setQuestsLoading(true)
    setQuestsError('')
    try {
      const result=await listQuests(questQuery)
      if(request!==questRequest.current)return
      if(result.rows.length===0&&questQuery.page>0){setQuestQuery(current=>({...current,page:0}));return}
      setQuests(result.rows); setQuestTotal(result.total)
    } catch(reason) {
      if(request!==questRequest.current)return
      setQuestsError(`Quest table could not load: ${reason instanceof Error?reason.message:'Unknown error'}`)
      setQuests([])
      setQuestTotal(0)
    }
    if(request===questRequest.current)setQuestsLoading(false)
  }, [questQuery])

  const loadAdmins = useCallback(async () => {
    if (!mounted.current || adminRole !== 'super_admin') return
    const request = ++adminRequest.current
    setAdminsLoading(true)
    setAdminsError('')
    try {
      const rows = await listAdmins()
      if (request === adminRequest.current) setAdmins(rows)
    } catch(reason) {
      if (request !== adminRequest.current) return
      setAdminsError(reason instanceof Error?reason.message:'Could not load administrators')
      setAdmins([])
    } finally {
      if (request === adminRequest.current) setAdminsLoading(false)
    }
  }, [adminRole])

  const loadAccessRequests = useCallback(async () => {
    if (!mounted.current || adminRole !== 'super_admin') return
    const request = ++accessListRequest.current
    setAccessRequestsLoading(true)
    setAccessRequestsError('')
    try {
      const rows = await listAdminAccessRequests()
      if (request === accessListRequest.current) setAdminAccessRequests(rows)
    } catch(reason) {
      if (request !== accessListRequest.current) return
      setAccessRequestsError(reason instanceof Error ? reason.message : 'Could not load access requests')
      setAdminAccessRequests([])
    } finally {
      if (request === accessListRequest.current) setAccessRequestsLoading(false)
    }
  }, [adminRole])

  useEffect(() => {
    if (section === 'Admins' && adminRole === 'super_admin') {
      void loadAdmins()
      void loadAccessRequests()
    } else if (adminRole !== 'super_admin') {
      setAdmins([])
      setAdminAccessRequests([])
    }
    return () => { adminRequest.current++; accessListRequest.current++ }
  }, [section, adminRole, loadAdmins, loadAccessRequests])

  useEffect(() => { if (section === 'Students') void loadUsers(); return () => { userRequest.current++ } }, [section, loadUsers])
  useEffect(() => { if (section === 'Quests') void loadQuests(); return () => { questRequest.current++ } }, [section, loadQuests])

  useEffect(() => {
    if ((section === 'Admins' && adminRole !== 'super_admin') || (section === 'Support Requests' && !canManageSupport)) setSection('Overview')
    if (adminRole !== 'super_admin') setAdminModalOpen(false)
  }, [section, adminRole, canManageSupport])
  const closeProfile = useCallback(() => setProfileOpen(false), [])
  const openProfile = () => {
    if (mobileNavOpen) {
      profileAfterNavigation.current = true
      setMobileNavOpen(false)
    } else {
      setProfileOpen(true)
    }
  }
  const navigate = (next: Section) => {
    focusHeading.current = section !== next
    setSection(next)
    setProfileOpen(false)
    setMobileNavOpen(false)
    if (section !== next) window.scrollTo(0, 0)
  }
  useEffect(() => {
    if (!focusHeading.current) return
    focusHeading.current = false
    headingRef.current?.focus({ preventScroll: true })
  }, [section])

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
      showNotice(`Could not save ${student.name || 'student ' + student.studentNumber}: ${error.message}`, 'error')
      throw error
    }
    if (!mounted.current) return
    const saved = { ...student, status: data?.status || student.status }
    setUsers((current) => current.map((item) => item.id === saved.id ? saved : item))
    setSelectedUser(null)
    setEditingUser(null)
    setUserActions(null)
    await loadUsers()
    showNotice(`${saved.name}'s student information was updated.`)
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
      showNotice(`Could not assign quest: ${error.message}`, 'error')
      return
    }
    if (!data?.length) {
      showNotice('No eligible active student accounts were available, so no quest was created.', 'warning')
      return
    }
    if (!mounted.current) return
    if (section === 'Quests') await loadQuests()
    setAssignmentRevision(value => value + 1)
    setNewQuestOpen(false)
    setEditingQuest(null)
    showNotice(draft.publish
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
      showNotice(`Could not update quest: ${error.message}`, 'error')
      return
    }
    if (!mounted.current) return
    if (section === 'Quests') await loadQuests()
    setAssignmentRevision(value => value + 1)
    setEditingQuest(null)
    showNotice(`"${draft.title}" was updated.`)
  }

  const grantAdmin = async (adminId: string, role: Admin['role']) => {
    if (adminRole !== 'super_admin' || adminId.trim() === adminIdentity.id) throw new Error('Only a Super Admin can grant access to another account.')
    const { error } = await supabase.rpc('super_admin_grant_admin', { target_user_id: adminId.trim(), role_value: role })
    if (error) { showNotice(`Could not add admin: ${error.message}`, 'error'); throw error }
    setAdminModalOpen(false)
    await loadAdmins()
    showNotice('Admin access granted.')
  }

  const updateAdmin = async (admin: Admin, role: Admin['role'], isActive: boolean) => {
    if (adminRole !== 'super_admin' || admin.id === adminIdentity.id) return
    const { error } = await supabase.rpc('super_admin_update_admin', { target_user_id: admin.id, role_value: role, is_active_value: isActive })
    if (error) { showNotice(`Could not update ${admin.email}: ${error.message}`, 'error'); return }
    await loadAdmins()
    showNotice(`${admin.email} was updated.`)
  }

  const removeAdmin = async (admin: Admin) => {
    if (adminRole !== 'super_admin' || admin.id === adminIdentity.id) return
    if (!window.confirm(`Remove admin access for ${admin.email}?`)) return
    const { error } = await supabase.rpc('super_admin_remove_admin', { target_user_id: admin.id })
    if (error) { showNotice(`Could not remove ${admin.email}: ${error.message}`, 'error'); return }
    await loadAdmins()
    showNotice(`${admin.email} no longer has admin access.`)
  }

  const decideAccessRequest = async (request: AdminAccessRequest, approve: boolean) => {
    if (adminRole !== 'super_admin' || request.userId === adminIdentity.id) return
    try {
      await reviewAdminAccessRequest(request.id, approve)
      await loadAccessRequests()
      if (approve) await loadAdmins()
      showNotice(approve ? 'Admin access granted to ' + request.email + '.' : 'Access request from ' + request.email + ' declined.')
    } catch (reason) {
      showNotice('Could not review access request: ' + (reason instanceof Error ? reason.message : 'Unknown error'), 'error')
    }
  }

  const sections: Section[] = ['Wellness', 'Engagement', 'Reports', 'Quests', 'Students', 'Semesters & Sections', 'Data Testing']
  if (canManageSupport) sections.push('Support Requests')
  const sectionLabel = SECTION_LABELS[section]
  const analyticsView = section === 'Overview' || section === 'Wellness' || section === 'Engagement' || section === 'Reports' ? section : null
  const navItem = (item: Section) => <button className={section === item ? 'nav-item active' : 'nav-item'} onClick={() => navigate(item)} key={item}
    aria-label={SECTION_LABELS[item]} title={SECTION_LABELS[item]} aria-current={section === item ? 'page' : undefined}>
    <SectionIcon section={item} /><span className="nav-label">{SECTION_LABELS[item]}</span>
  </button>
  const navigation = <>
    <div className="workspace-profile"><ProfileBadge identity={adminIdentity} onClick={openProfile} /></div>
    <nav aria-label="Admin navigation">
      <div className="workspace-overview-link">{navItem('Overview')}</div>
      {sections.map(navItem)}
      {adminRole === 'super_admin' && <div className="admin-nav-group" role="group" aria-label="Administration">
        <span className="admin-nav-heading" aria-hidden="true">Administration</span>
        {navItem('Admins')}
      </div>}
    </nav>
    <div className="sidebar-tools">
      <button onClick={() => { setMobileNavOpen(false); void signOut() }} aria-label="Sign out" title="Sign out">
        <AppIcon name="signOut" /><span>Sign out</span>
      </button>
    </div>
  </>

  return (
    <div className={dark ? 'app-shell dark' : 'app-shell'}>
      <a href="#workspace-content" className="workspace-skip-link">Skip to content</a>
      <aside className="sidebar workspace-sidebar">
        <Brand />
        {navigation}
      </aside>
      <main className="main">
        <header className="topbar workspace-header">
          <div className="workspace-header-primary">
            <Dialog.Root open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <Dialog.Trigger asChild><button className="icon-button workspace-menu-trigger" aria-label="Open navigation"><AppIcon name="menu" /></button></Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="workspace-nav-overlay" />
                <Dialog.Content className={dark ? 'sidebar workspace-nav-drawer dark' : 'sidebar workspace-nav-drawer'} aria-describedby={undefined}
                  onCloseAutoFocus={() => {
                    if (!profileAfterNavigation.current) return
                    profileAfterNavigation.current = false
                    setProfileOpen(true)
                  }}>
                  <Dialog.Title className="sr-only">Admin navigation</Dialog.Title>
                  <div className="workspace-drawer-heading">
                    <Brand /><Dialog.Close className="icon-button" aria-label="Close navigation"><AppIcon name="close" /></Dialog.Close>
                  </div>
                  {navigation}
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
            <h1 id="console-heading" tabIndex={-1} ref={headingRef}>{sectionLabel}</h1>
          </div>
          <div className="top-actions">
            <HeaderClock />
            <button className="icon-button" aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} onClick={toggleTheme}><AppIcon name={dark ? 'sun' : 'moon'} /></button>
          </div>
        </header>
        <div className="content" id="workspace-content" tabIndex={-1}>
          {operationError && <p className="form-error" role="alert">{operationError}</p>}
          <Suspense fallback={<div className="overview-skeleton overview-chart-skeleton" role="status" aria-label="Loading section" />}>
          {analyticsView && <OsasDashboard view={analyticsView} permissions={osasPermissions} assignmentRevision={assignmentRevision}
            onOpenQuest={setSelectedQuest} onCreateQuest={() => setNewQuestOpen(true)} onReviewAssignments={() => navigate('Quests')} onNavigate={navigate} />}
          {section === 'Students' && <DataTable kind="users" users={users} total={userTotal} query={userQuery} loading={usersLoading} error={usersError} onRefresh={loadUsers} onQueryChange={setUserQuery} onUserClick={setSelectedUser} onUserActions={setUserActions} />}
          {section === 'Quests' && <DataTable kind="quests" quests={quests} total={questTotal} query={questQuery} loading={questsLoading} error={questsError} onRefresh={loadQuests} onQueryChange={setQuestQuery} onQuestClick={setSelectedQuest} onCreateQuest={() => setNewQuestOpen(true)} />}
          {section === 'Semesters & Sections' && <SemesterManagement />}
          {section === 'Data Testing' && <DataTesting />}
          {section === 'Support Requests' && canManageSupport && SupportRequests && <SupportRequests />}
          {section === 'Admins' && adminRole === 'super_admin' && <><AdminAccessRequests requests={adminAccessRequests} loading={accessRequestsLoading} error={accessRequestsError} onRefresh={loadAccessRequests} onReview={(request, approve) => { void decideAccessRequest(request, approve) }} /><AdminTable admins={admins} currentAdminId={adminIdentity.id} loading={adminsLoading} error={adminsError} onRefresh={loadAdmins} onAdd={() => setAdminModalOpen(true)} onUpdate={updateAdmin} onRemove={removeAdmin} /><OsasPermissions admins={admins} loading={adminsLoading} error={adminsError} /></>}
          </Suspense>
        </div>
      </main>
      {(newQuestOpen || editingQuest) && <QuestModal initialQuest={editingQuest} users={users} onClose={() => { setNewQuestOpen(false); setEditingQuest(null) }} onSave={(draft) => editingQuest ? updateQuest(editingQuest, draft) : createQuest(draft)} />}
      {profileOpen && <AdminInfoPanel identity={adminIdentity} role={adminRole} permissions={osasPermissions} onClose={closeProfile} onSignOut={() => { closeProfile(); void signOut() }} />}
      {selectedUser && <UserDetails user={selectedUser} onClose={() => setSelectedUser(null)} onEdit={() => { setEditingUser(selectedUser); setSelectedUser(null) }} onToggleStatus={() => { void saveStudent({ ...selectedUser, status: selectedUser.status === 'Active' ? 'Inactive' : 'Active' }).catch(() => {}) }} />}
      {selectedQuest && <QuestDetails quest={selectedQuest} onClose={() => setSelectedQuest(null)} onEdit={() => { setEditingQuest(selectedQuest); setSelectedQuest(null) }} />}
      {userActions && <UserActions user={userActions} onClose={() => setUserActions(null)} onOpenProfile={() => { setSelectedUser(userActions); setUserActions(null) }} onToggleStatus={() => { void saveStudent({ ...userActions, status: userActions.status === 'Active' ? 'Inactive' : 'Active' }).catch(() => {}) }} />}
      {editingUser && <StudentModal user={editingUser} onClose={() => setEditingUser(null)} onSave={saveStudent} />}
      {adminModalOpen && <AdminModal onClose={() => setAdminModalOpen(false)} onSave={grantAdmin} />}
      {notice && <div className="toast admin-alert" data-tone={notice.tone}>
        <span role={notice.tone === 'error' ? 'alert' : 'status'}>{notice.message}</span>
        <button type="button" aria-label="Dismiss notification" onClick={() => setNotice(null)}>×</button>
      </div>}
    </div>
  )
}

export default App
