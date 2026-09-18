import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import './App.css'
import { supabase } from './supabase'

type Section = 'Overview' | 'Users' | 'Quests' | 'Leaderboard'
type User = { id: string; studentNumber: string; name: string; email: string; course: string; yearLevel: string; section: string; campus: string; goal: string; joined: string; quests: string; status: 'Active' | 'Inactive' }
type Quest = { id: string; ownerId: string; title: string; category: string; difficulty: string; completions: string; status: 'Published' | 'Draft'; assignee: string }
type QuestDraft = { title: string; description: string; category: 'Academics' | 'Habits' | 'Social' | 'Health'; difficulty: 'Easy' | 'Medium' | 'Hard'; assigneeId: string | null }

const initialQuests: Quest[] = []

function App() {
  const [authenticated, setAuthenticated] = useState(false)
  const [authChecking, setAuthChecking] = useState(true)
  const [section, setSection] = useState<Section>('Overview')
  const [dark, setDark] = useState(() => localStorage.getItem('beebetter-theme') === 'dark')
  const [users, setUsers] = useState<User[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersError, setUsersError] = useState('')
  const [quests, setQuests] = useState(initialQuests)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [newQuestOpen, setNewQuestOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [selectedQuest, setSelectedQuest] = useState<Quest | null>(null)
  const [userActions, setUserActions] = useState<User | null>(null)
  const [notice, setNotice] = useState('')
  const [editingQuest, setEditingQuest] = useState<Quest | null>(null)
  const [messageUser, setMessageUser] = useState<User | null>(null)
  const [activityUser, setActivityUser] = useState<User | null>(null)
  const [editingUser, setEditingUser] = useState<User | null>(null)

  const loadUsers = async () => {
    setUsersLoading(true)
    setUsersError('')
    const { data, error } = await supabase.rpc('admin_list_students')
    if (error) {
      setUsersError(error.message)
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
    const { data, error } = await supabase.rpc('admin_list_quests')
    if (error) {
      setNotice(`Could not load quests: ${error.message}`)
      setQuests([])
      return
    }
    setQuests((data ?? []).map((quest: { id: string; owner_id: string; title: string; category: string; xp: number; status: string; completions: number; assignee: string }) => ({
      id: quest.id,
      ownerId: quest.owner_id,
      title: quest.title,
      category: quest.category,
      difficulty: quest.xp >= 50 ? 'Hard' : quest.xp >= 30 ? 'Medium' : 'Easy',
      completions: String(quest.completions ?? 0),
      status: quest.status === 'active' ? 'Published' : 'Draft',
      assignee: quest.assignee,
    })))
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthenticated(Boolean(session))
      setAuthChecking(false)
      if (session) { void loadUsers(); void loadQuests() }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthenticated(Boolean(session))
      setAuthChecking(false)
      if (session) { void loadUsers(); void loadQuests() }
      else setUsers([])
    })

    return () => subscription.unsubscribe()
  }, [])

  const toggleTheme = () => {
    setDark((value) => {
      localStorage.setItem('beebetter-theme', value ? 'light' : 'dark')
      return !value
    })
  }
  const navigate = (next: Section) => {
    setSection(next)
    setNotificationsOpen(false)
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
    const { error } = await supabase.rpc('admin_create_quest', {
      title_value: draft.title,
      description_value: draft.description,
      category_value: draft.category,
      xp_value: xp,
      status_value: 'active',
      assignee_id: draft.assigneeId,
    })
    if (error) {
      setNotice(`Could not assign quest: ${error.message}`)
      return
    }
    await loadQuests()
    setNewQuestOpen(false)
    setEditingQuest(null)
    setNotice(draft.assigneeId ? 'Quest assigned successfully.' : 'Quest assigned to every active student.')
  }

  if (authChecking) return <div className="auth-shell"><div className="auth-card"><p>Checking admin session...</p></div></div>
  if (!authenticated) return <AuthScreen onSuccess={() => setAuthenticated(true)} dark={dark} onToggleTheme={toggleTheme} />

  return (
    <div className={dark ? 'app-shell dark' : 'app-shell'}>
      <aside className="sidebar">
        <Brand />
        <span className="admin-label">ADMIN CONSOLE</span>
        <nav>{(['Overview', 'Users', 'Quests', 'Leaderboard'] as Section[]).map((item) => <button className={section === item ? 'nav-item active' : 'nav-item'} onClick={() => navigate(item)} key={item}><span>{item === 'Overview' ? '▦' : item === 'Users' ? '♙' : item === 'Quests' ? '⚑' : '♛'}</span>{item}</button>)}</nav>
        <div className="sidebar-tools"><button onClick={toggleTheme}>◐ <span>{dark ? 'Light mode' : 'Dark mode'}</span></button><button onClick={() => void supabase.auth.signOut()}>↪ <span>Sign out</span></button></div>
        <ProfileBadge onClick={() => setProfileOpen((value) => !value)} />
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="mobile-brand"><Brand /></div>
          <div className="top-actions">
            <button className="icon-button" aria-label="Toggle theme" onClick={toggleTheme}>{dark ? '☀' : '☾'}</button>
            <button className="icon-button notification-button" aria-label="Notifications" onClick={() => setNotificationsOpen((value) => !value)}>♧<i /></button>
            <button className="avatar-button" onClick={() => setProfileOpen((value) => !value)}><span className="avatar">JD</span></button>
          </div>
          {notificationsOpen && <div className="popover notification-popover"><b>Notifications</b><p><span className="notification-dot">✦</span> New quest submitted for review</p><p><span className="notification-dot">♙</span> 12 new users joined today</p><button className="link-button" onClick={() => setNotificationsOpen(false)}>Mark all as read</button></div>}
          {profileOpen && <div className="popover profile-popover"><b>Administrator</b><small>Supabase admin account</small><button onClick={toggleTheme}>◐ {dark ? 'Switch to light mode' : 'Switch to dark mode'}</button><button onClick={() => void supabase.auth.signOut()}>↪ Sign out</button></div>}
        </header>
        <nav className="mobile-nav">{(['Overview', 'Users', 'Quests', 'Leaderboard'] as Section[]).map((item) => <button className={section === item ? 'mobile-nav-item active' : 'mobile-nav-item'} onClick={() => navigate(item)} key={item}>{item}</button>)}</nav>
        <div className="content">
          <div className="heading-row"><div><span className="eyebrow">TUESDAY, SEPTEMBER 15, 2026</span><h1>{section === 'Overview' ? 'Good evening, Jessie' : section}</h1><p>{section === 'Overview' ? 'Here is what is happening in BeeBetter today.' : `Manage and monitor ${section.toLowerCase()} in your app.`}</p></div>{section === 'Quests' && <button className="primary-button" onClick={() => setNewQuestOpen(true)}>＋ New quest</button>}</div>
          {section === 'Overview' && <Overview navigate={navigate} users={users} quests={quests} onUserClick={setSelectedUser} onQuestClick={setSelectedQuest} />}
          {section === 'Users' && <DataTable kind="users" users={users} loading={usersLoading} error={usersError} onRefresh={loadUsers} onUserClick={setSelectedUser} onUserActions={setUserActions} />}
          {section === 'Quests' && <DataTable kind="quests" quests={quests} onQuestClick={setSelectedQuest} />}
          {section === 'Leaderboard' && <Leaderboard users={users} />}
        </div>
      </main>
      {(newQuestOpen || editingQuest) && <QuestModal initialQuest={editingQuest} users={users} onClose={() => { setNewQuestOpen(false); setEditingQuest(null) }} onSave={createQuest} />}
      {selectedUser && <UserDetails user={selectedUser} onClose={() => setSelectedUser(null)} onEdit={() => { setEditingUser(selectedUser); setSelectedUser(null) }} onMessage={() => { setMessageUser(selectedUser); setSelectedUser(null) }} onActivity={() => { setActivityUser(selectedUser); setSelectedUser(null) }} onToggleStatus={() => { void saveStudent({ ...selectedUser, status: selectedUser.status === 'Active' ? 'Inactive' : 'Active' }) }} />}
      {selectedQuest && <QuestDetails quest={selectedQuest} onClose={() => setSelectedQuest(null)} onNotice={setNotice} onEdit={() => { setEditingQuest(selectedQuest); setSelectedQuest(null) }} onArchive={() => { setQuests((current) => current.filter((item) => item.title !== selectedQuest.title)); setSelectedQuest(null); setNotice(`"${selectedQuest.title}" was archived.`) }} />}
      {userActions && <UserActions user={userActions} onClose={() => setUserActions(null)} onOpenProfile={() => { setSelectedUser(userActions); setUserActions(null) }} onMessage={() => { setMessageUser(userActions); setUserActions(null) }} onToggleStatus={() => { void saveStudent({ ...userActions, status: userActions.status === 'Active' ? 'Inactive' : 'Active' }) }} />}
      {messageUser && <MessageModal user={messageUser} onClose={() => setMessageUser(null)} onSend={(message) => { setMessageUser(null); setNotice(`Message sent to ${messageUser.name}: "${message}"`) }} />}
      {activityUser && <ActivityModal user={activityUser} onClose={() => setActivityUser(null)} />}
      {editingUser && <StudentModal user={editingUser} onClose={() => setEditingUser(null)} onSave={(user) => { void saveStudent(user) }} />}
      {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice('')}>×</button></div>}
    </div>
  )
}

function Brand() { return <div className="brand"><span className="brand-mark">✦</span><strong>BeeBetter</strong></div> }
function ProfileBadge({ onClick }: { onClick: () => void }) { return <button className="side-profile" onClick={onClick}><span className="avatar">JD</span><span><b>Jessie Dela Cruz</b><small>Administrator</small></span><span>•••</span></button> }

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

function Overview({ navigate, users, quests, onUserClick, onQuestClick }: { navigate: (section: Section) => void; users: User[]; quests: Quest[]; onUserClick: (user: User) => void; onQuestClick: (quest: Quest) => void }) {
  const stats = [['♙', 'Total users', '1,284', '+12.5%', 'yellow'], ['◉', 'Active today', '846', '+8.2%', 'green'], ['✓', 'Quests completed', '3,642', '+18.7%', 'blue'], ['⚑', 'Open quests', '28', '-2.4%', 'orange']]
  return <><div className="stats">{stats.map(([icon, label, value, change, tone]) => <div className="stat-card" key={label}><span className={`stat-icon ${tone}`}>{icon}</span><small>{label}</small><div><strong>{value}</strong><em className={change.startsWith('-') ? 'negative' : ''}>{change}</em></div></div>)}</div><section className="panel"><div className="panel-heading"><div><h2>User activity</h2><p>Active users over the last 7 days</p></div><select className="select" defaultValue="7"><option value="7">This week</option><option value="30">This month</option><option value="365">This year</option></select></div><div className="chart">{[42, 62, 48, 75, 58, 91, 69].map((height, i) => <div className="bar-column" key={i}><span style={{ height: `${height}%` }} /><small>{['M', 'T', 'W', 'T', 'F', 'S', 'S'][i]}</small></div>)}</div></section><div className="two-panels"><section className="panel"><PanelHeading title="Recent users" subtitle="Latest people to join BeeBetter" action={() => navigate('Users')} />{users.slice(0, 3).map((user) => <UserRow user={user} onClick={() => onUserClick(user)} key={user.email} />)}</section><section className="panel"><PanelHeading title="Popular quests" subtitle="Most completed this week" action={() => navigate('Quests')} />{quests.slice(0, 3).map((quest) => <QuestRow quest={quest} onClick={() => onQuestClick(quest)} key={quest.title} />)}</section></div></>
}

function PanelHeading({ title, subtitle, action }: { title: string; subtitle: string; action: () => void }) { return <div className="panel-heading"><div><h2>{title}</h2><p>{subtitle}</p></div><button className="link-button" onClick={action}>View all →</button></div> }
function UserRow({ user, onClick }: { user: User; onClick?: () => void }) { return <button className="recent-row clickable-row" onClick={onClick}><span className="table-avatar">{user.name.split(' ').map((name) => name[0]).join('')}</span><div className="row-copy"><b>{user.name}</b><small>{user.email}</small></div><Status status={user.status} /></button> }
function QuestRow({ quest, onClick }: { quest: Quest; onClick?: () => void }) { return <button className="recent-row clickable-row" onClick={onClick}><span className="quest-icon">✦</span><div className="row-copy"><b>{quest.title}</b><small>{quest.completions} completions</small></div><span>›</span></button> }
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
          {isUsers ? <><option>Active</option><option>Inactive</option></> : <><option>Published</option><option>Draft</option><option>Easy</option><option>Medium</option></>}
        </select>
        {onRefresh && <button className="secondary-button" onClick={onRefresh}>Refresh</button>}
      </div>
      {error && <div className="empty-state">{error}</div>}
      {loading ? <div className="empty-state">Loading students...</div> : isUsers ? <UserRows users={filteredUsers} search={search} onUserClick={onUserClick} onUserActions={onUserActions} /> : <QuestRows quests={filteredQuests} search={search} onQuestClick={onQuestClick} />}
    </section>
  )
}

function UserRows({ users, search, onUserClick, onUserActions }: { users: User[]; search: string; onUserClick?: (user: User) => void; onUserActions?: (user: User) => void }) {
  if (users.length === 0) return <div className="empty-state">No users match “{search}”. Try another search.</div>
  return <div className="table-scroll"><div className="table-row table-header">{['STUDENT', 'COURSE', 'GOAL', 'JOINED', 'STATUS', ''].map((head) => <span key={head}>{head}</span>)}</div>{users.map((row) => <div className="table-row" key={row.id}><UserRow user={row} onClick={() => onUserClick?.(row)} /><span>{row.course}</span><span>{row.goal || 'No goal set'}</span><span>{row.joined}</span><Status status={row.status} /><button className="row-menu" onClick={() => onUserActions?.(row)}>•••</button></div>)}</div>
}

function QuestRows({ quests, search, onQuestClick }: { quests: Quest[]; search: string; onQuestClick?: (quest: Quest) => void }) {
  if (quests.length === 0) return <div className="empty-state">No quests match “{search}”. Try another search.</div>
  return <div className="table-scroll"><div className="table-row table-header">{['QUEST', 'CATEGORY', 'DIFFICULTY', 'ASSIGNED TO', 'STATUS'].map((head) => <span key={head}>{head}</span>)}</div>{quests.map((row) => <button className="table-row clickable-row" onClick={() => onQuestClick?.(row)} key={row.id}><div className="quest-cell"><span className="quest-icon">✦</span><b>{row.title}</b></div><span>{row.category}</span><span>{row.difficulty}</span><span>{row.assignee}</span><Status status={row.status} /></button>)}</div>
}

function Leaderboard({ users }: { users: User[] }) {
  const [period, setPeriod] = useState('week')
  const leaders = [...users].sort((a, b) => Number(b.quests) - Number(a.quests)).map((user, index) => [user.name, period === 'month' ? String(Math.round(Number(user.quests) * 1.4)) : user.quests, String(index + 1)])
  return <section className="panel leaderboard-panel"><div className="leaderboard-hero"><span className="trophy">♛</span><div><span className="eyebrow">COMMUNITY MOMENTUM</span><h2>Leaderboard</h2><p>Celebrate the people making progress every day.</p></div><select className="select" value={period} onChange={(event) => setPeriod(event.target.value)}><option value="week">This week</option><option value="month">This month</option></select></div>{leaders.map(([name, score, rank]) => <div className="leader-row" key={name}><strong className={`rank rank-${rank}`}>{rank}</strong><span className="table-avatar">{name.split(' ').map((part) => part[0]).join('')}</span><div className="row-copy"><b>{name}</b><small>Personal growth champion</small></div><strong>{score} quests</strong><span className="streak">✦ on a roll</span></div>)}</section>
}

function Drawer({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return <div className="drawer-backdrop" onClick={onClose}><aside className="drawer" onClick={(event) => event.stopPropagation()}><button className="drawer-close" onClick={onClose}>×</button>{children}</aside></div>
}

function UserDetails({ user, onClose, onEdit, onMessage, onActivity, onToggleStatus }: { user: User; onClose: () => void; onEdit: () => void; onMessage: () => void; onActivity: () => void; onToggleStatus: () => void }) {
  return <Drawer onClose={onClose}><span className="eyebrow">STUDENT PROFILE</span><div className="drawer-avatar">{user.name.split(' ').map((name) => name[0]).join('')}</div><h2>{user.name}</h2><p className="drawer-muted">{user.email}</p><Status status={user.status} /><div className="detail-grid"><div><small>STUDENT NUMBER</small><b>{user.studentNumber}</b></div><div><small>COURSE</small><b>{user.course}</b></div><div><small>YEAR / SECTION</small><b>{user.yearLevel} / {user.section}</b></div><div><small>CAMPUS</small><b>{user.campus}</b></div><div><small>GOAL</small><b>{user.goal || 'No goal set'}</b></div><div><small>QUESTS COMPLETED</small><b>{user.quests}</b></div></div><h3>Admin actions</h3><button className="drawer-action" onClick={onEdit}>✎ Edit student information</button><button className="drawer-action" onClick={onMessage}>✉ Send message</button><button className="drawer-action" onClick={onActivity}>◉ View activity</button><button className="drawer-action danger" onClick={onToggleStatus}>{user.status === 'Active' ? '⊘ Suspend account' : '◉ Unsuspend account'}</button></Drawer>
}

function QuestDetails({ quest, onClose, onNotice, onEdit, onArchive }: { quest: Quest; onClose: () => void; onNotice: (notice: string) => void; onEdit: () => void; onArchive: () => void }) {
  return <Drawer onClose={onClose}><span className="eyebrow">QUEST DETAILS</span><div className="drawer-quest-icon">✦</div><h2>{quest.title}</h2><p className="drawer-muted">{quest.category} · {quest.difficulty}</p><Status status={quest.status} /><div className="detail-grid"><div><small>COMPLETIONS</small><b>{quest.completions}</b></div><div><small>ASSIGNED TO</small><b>{quest.assignee}</b></div></div><h3>Quest actions</h3><button className="drawer-action" onClick={onEdit}>✎ Edit quest</button><button className="drawer-action" onClick={() => onNotice(`Reminder sent to ${quest.assignee}.`)}>↗ Send reminder</button><button className="drawer-action danger" onClick={onArchive}>⌫ Archive quest</button></Drawer>
}

function UserActions({ user, onClose, onOpenProfile, onMessage, onToggleStatus }: { user: User; onClose: () => void; onOpenProfile: () => void; onMessage: () => void; onToggleStatus: () => void }) {
  return <Drawer onClose={onClose}><span className="eyebrow">USER ACTIONS</span><h2>{user.name}</h2><p className="drawer-muted">Choose an action to manage this account.</p><button className="drawer-action" onClick={onOpenProfile}>◉ View profile</button><button className="drawer-action" onClick={onMessage}>✉ Message user</button><button className="drawer-action danger" onClick={onToggleStatus}>{user.status === 'Active' ? '⊘ Suspend account' : '◉ Unsuspend account'}</button></Drawer>
}

function QuestModal({ initialQuest, users, onClose, onSave }: { initialQuest: Quest | null; users: User[]; onClose: () => void; onSave: (quest: QuestDraft) => Promise<void> }) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    void onSave({
      title: String(data.get('title')),
      description: String(data.get('description') || ''),
      category: String(data.get('category')) as QuestDraft['category'],
      difficulty: String(data.get('difficulty')) as QuestDraft['difficulty'],
      assigneeId: String(data.get('assignee') || '') || null,
    })
  }
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={onClose}>×</button><span className="eyebrow">QUEST STUDIO</span><h2>{initialQuest ? 'Assign another quest' : 'Create a new quest'}</h2><p>Create a quest that appears in the selected student's mobile quest board.</p><form onSubmit={submit}><label>Quest title<input name="title" required defaultValue={initialQuest?.title} placeholder="e.g. Take a mindful break" /></label><label>Description<textarea name="description" rows={3} placeholder="What should the student do?" /></label><label>Send this quest to<select name="assignee" defaultValue=""><option value="">Everyone</option>{users.filter((user) => user.status === 'Active').map((user) => <option key={user.id} value={user.id}>{user.name} · {user.studentNumber}</option>)}</select></label><label>Category<select name="category" defaultValue="Habits"><option>Academics</option><option>Habits</option><option>Social</option><option>Health</option></select></label><label>Difficulty<select name="difficulty" defaultValue="Easy"><option>Easy</option><option>Medium</option><option>Hard</option></select></label><div className="assignment-note">✦ Everyone assigns one copy to each active student.</div><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit">Assign quest</button></div></form></div></div>
}

function StudentModal({ user, onClose, onSave }: { user: User; onClose: () => void; onSave: (user: User) => void }) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    onSave({
      ...user,
      studentNumber: String(data.get('studentNumber') || '').trim(),
      name: String(data.get('name') || '').trim(),
      email: String(data.get('email') || '').trim().toLowerCase(),
      course: String(data.get('course') || '').trim(),
      yearLevel: String(data.get('yearLevel') || '').trim(),
      section: String(data.get('section') || '').trim(),
      campus: String(data.get('campus') || '').trim(),
      goal: String(data.get('goal') || '').trim(),
      status: String(data.get('status') || 'Active') as User['status'],
    })
  }
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={onClose}>×</button><span className="eyebrow">STUDENT RECORD</span><h2>Edit student information</h2><form onSubmit={submit}><label>Student number<input name="studentNumber" required defaultValue={user.studentNumber} /></label><label>Name<input name="name" required defaultValue={user.name} /></label><label>Email<input name="email" required type="email" defaultValue={user.email} readOnly /></label><label>Course<input name="course" required defaultValue={user.course} /></label><label>Year level<input name="yearLevel" required defaultValue={user.yearLevel} /></label><label>Section<input name="section" required defaultValue={user.section} /></label><label>Campus<input name="campus" required defaultValue={user.campus} /></label><label>Goal<input name="goal" required defaultValue={user.goal} placeholder="Predefined or custom goal" /></label><label>Status<select name="status" defaultValue={user.status}><option>Active</option><option>Inactive</option></select></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit">Save student</button></div></form></div></div>
}

function MessageModal({ user, onClose, onSend }: { user: User; onClose: () => void; onSend: (message: string) => void }) {
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const message = String(new FormData(event.currentTarget).get('message') || '').trim(); if (message) onSend(message) }
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={onClose}>×</button><span className="eyebrow">MESSAGE CENTER</span><h2>Message {user.name}</h2><p>Send a direct message to this user.</p><form onSubmit={submit}><label>Message<textarea name="message" required rows={5} placeholder="Write your message..." /></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit">Send message</button></div></form></div></div>
}

function ActivityModal({ user, onClose }: { user: User; onClose: () => void }) {
  return <Drawer onClose={onClose}><span className="eyebrow">ACTIVITY</span><h2>{user.name}</h2><p className="drawer-muted">Recent activity in BeeBetter.</p><div className="activity-item"><b>Completed a quest</b><small>Take a mindful walk · Today</small></div><div className="activity-item"><b>Earned a growth badge</b><small>Personal momentum · Yesterday</small></div><div className="activity-item"><b>Joined BeeBetter</b><small>{user.joined}</small></div></Drawer>
}

export default App
