import { useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import './App.css'

type Section = 'Overview' | 'Users' | 'Quests' | 'Leaderboard'
type User = { name: string; email: string; joined: string; quests: string; status: 'Active' | 'Inactive' }
type Quest = { title: string; category: string; difficulty: string; completions: string; status: 'Published' | 'Draft'; assignee: string }

const initialUsers: User[] = [
  { name: 'Mia Santos', email: 'mia.santos@email.com', joined: 'Sep 12, 2026', quests: '24', status: 'Active' },
  { name: 'James Wu', email: 'james.wu@email.com', joined: 'Sep 11, 2026', quests: '18', status: 'Active' },
  { name: 'Leah Garcia', email: 'leah.garcia@email.com', joined: 'Sep 10, 2026', quests: '9', status: 'Inactive' },
  { name: 'Noah Kim', email: 'noah.kim@email.com', joined: 'Sep 09, 2026', quests: '31', status: 'Active' },
  { name: 'Ava Reyes', email: 'ava.reyes@email.com', joined: 'Sep 08, 2026', quests: '14', status: 'Active' },
]
const initialQuests: Quest[] = [
  { title: 'Take a mindful walk', category: 'Wellness', difficulty: 'Easy', completions: '238', status: 'Published', assignee: 'Everyone' },
  { title: 'Learn something new', category: 'Growth', difficulty: 'Medium', completions: '184', status: 'Published', assignee: 'Everyone' },
  { title: 'Connect with someone', category: 'Relationships', difficulty: 'Easy', completions: '126', status: 'Draft', assignee: 'Everyone' },
  { title: 'Try a new healthy recipe', category: 'Lifestyle', difficulty: 'Medium', completions: '92', status: 'Published', assignee: 'Everyone' },
]

function App() {
  const [authenticated, setAuthenticated] = useState(false)
  const [section, setSection] = useState<Section>('Overview')
  const [dark, setDark] = useState(() => localStorage.getItem('beebetter-theme') === 'dark')
  const [users, setUsers] = useState(initialUsers)
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

  if (!authenticated) return <AuthScreen onSuccess={() => setAuthenticated(true)} dark={dark} onToggleTheme={toggleTheme} />

  return (
    <div className={dark ? 'app-shell dark' : 'app-shell'}>
      <aside className="sidebar">
        <Brand />
        <span className="admin-label">ADMIN CONSOLE</span>
        <nav>{(['Overview', 'Users', 'Quests', 'Leaderboard'] as Section[]).map((item) => <button className={section === item ? 'nav-item active' : 'nav-item'} onClick={() => navigate(item)} key={item}><span>{item === 'Overview' ? '▦' : item === 'Users' ? '♙' : item === 'Quests' ? '⚑' : '♛'}</span>{item}</button>)}</nav>
        <div className="sidebar-tools"><button onClick={toggleTheme}>◐ <span>{dark ? 'Light mode' : 'Dark mode'}</span></button><button onClick={() => setAuthenticated(false)}>↪ <span>Sign out</span></button></div>
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
          {profileOpen && <div className="popover profile-popover"><b>Jessie Dela Cruz</b><small>Administrator</small><button onClick={toggleTheme}>◐ {dark ? 'Switch to light mode' : 'Switch to dark mode'}</button><button onClick={() => setAuthenticated(false)}>↪ Sign out</button></div>}
        </header>
        <nav className="mobile-nav">{(['Overview', 'Users', 'Quests', 'Leaderboard'] as Section[]).map((item) => <button className={section === item ? 'mobile-nav-item active' : 'mobile-nav-item'} onClick={() => navigate(item)} key={item}>{item}</button>)}</nav>
        <div className="content">
          <div className="heading-row"><div><span className="eyebrow">TUESDAY, SEPTEMBER 15, 2026</span><h1>{section === 'Overview' ? 'Good evening, Jessie' : section}</h1><p>{section === 'Overview' ? 'Here is what is happening in BeeBetter today.' : `Manage and monitor ${section.toLowerCase()} in your app.`}</p></div>{section === 'Quests' && <button className="primary-button" onClick={() => setNewQuestOpen(true)}>＋ New quest</button>}</div>
          {section === 'Overview' && <Overview navigate={navigate} users={users} quests={quests} onUserClick={setSelectedUser} onQuestClick={setSelectedQuest} />}
          {section === 'Users' && <DataTable kind="users" users={users} onUserClick={setSelectedUser} onUserActions={setUserActions} />}
          {section === 'Quests' && <DataTable kind="quests" quests={quests} onQuestClick={setSelectedQuest} />}
          {section === 'Leaderboard' && <Leaderboard users={users} />}
        </div>
      </main>
      {(newQuestOpen || editingQuest) && <QuestModal initialQuest={editingQuest} users={users} onClose={() => { setNewQuestOpen(false); setEditingQuest(null) }} onSave={(quest) => { setQuests((current) => editingQuest ? current.map((item) => item.title === editingQuest.title ? quest : item) : [...current, quest]); setNewQuestOpen(false); setEditingQuest(null); setNotice(editingQuest ? 'Quest updated successfully.' : 'Quest saved as a draft.') }} />}
      {selectedUser && <UserDetails user={selectedUser} onClose={() => setSelectedUser(null)} onMessage={() => { setMessageUser(selectedUser); setSelectedUser(null) }} onActivity={() => { setActivityUser(selectedUser); setSelectedUser(null) }} onToggleStatus={() => { const nextStatus = selectedUser.status === 'Active' ? 'Inactive' : 'Active'; setUsers((current) => current.map((item) => item.email === selectedUser.email ? { ...item, status: nextStatus } : item)); setSelectedUser({ ...selectedUser, status: nextStatus }); setNotice(`${selectedUser.name} is now ${nextStatus.toLowerCase()}.`) }} />}
      {selectedQuest && <QuestDetails quest={selectedQuest} onClose={() => setSelectedQuest(null)} onNotice={setNotice} onEdit={() => { setEditingQuest(selectedQuest); setSelectedQuest(null) }} onArchive={() => { setQuests((current) => current.filter((item) => item.title !== selectedQuest.title)); setSelectedQuest(null); setNotice(`"${selectedQuest.title}" was archived.`) }} />}
      {userActions && <UserActions user={userActions} onClose={() => setUserActions(null)} onOpenProfile={() => { setSelectedUser(userActions); setUserActions(null) }} onMessage={() => { setMessageUser(userActions); setUserActions(null) }} onToggleStatus={() => { const nextStatus = userActions.status === 'Active' ? 'Inactive' : 'Active'; setUsers((current) => current.map((item) => item.email === userActions.email ? { ...item, status: nextStatus } : item)); setUserActions(null); setNotice(`${userActions.name} is now ${nextStatus.toLowerCase()}.`) }} />}
      {messageUser && <MessageModal user={messageUser} onClose={() => setMessageUser(null)} onSend={(message) => { setMessageUser(null); setNotice(`Message sent to ${messageUser.name}: "${message}"`) }} />}
      {activityUser && <ActivityModal user={activityUser} onClose={() => setActivityUser(null)} />}
      {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice('')}>×</button></div>}
    </div>
  )
}

function Brand() { return <div className="brand"><span className="brand-mark">✦</span><strong>BeeBetter</strong></div> }
function ProfileBadge({ onClick }: { onClick: () => void }) { return <button className="side-profile" onClick={onClick}><span className="avatar">JD</span><span><b>Jessie Dela Cruz</b><small>Administrator</small></span><span>•••</span></button> }

function AuthScreen({ onSuccess, dark, onToggleTheme }: { onSuccess: () => void; dark: boolean; onToggleTheme: () => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [error, setError] = useState('')
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setError(''); onSuccess() }
  return <div className={dark ? 'auth-shell dark' : 'auth-shell'}><button className="auth-theme" onClick={onToggleTheme}>{dark ? '☀ Light mode' : '☾ Dark mode'}</button><div className="auth-art"><Brand /><div className="orb orb-one" /><div className="orb orb-two" /><div className="art-copy"><span className="eyebrow">THE BETTER WAY TO GROW</span><h1>Make every day<br /><em>a little better.</em></h1><p>One mindful action at a time, powered by a community that cares.</p><div className="mini-stat"><b>✦ 3,642</b><span>positive moments created this week</span></div></div></div><div className="auth-card"><div className="auth-heading"><span className="eyebrow">WELCOME BACK</span><h2>{mode === 'login' ? 'Welcome back, Jessie' : 'Create your admin account'}</h2><p>{mode === 'login' ? 'Sign in to continue to your console.' : 'Start managing your BeeBetter community.'}</p></div><form onSubmit={submit}>{mode === 'signup' && <label>Full name<input required placeholder="Jessie Dela Cruz" /></label>}<label>Email address<input required type="email" placeholder="you@beebetter.app" /></label><label>Password<input required type="password" placeholder="••••••••" /></label>{mode === 'login' && <button type="button" className="forgot" onClick={() => setError('Password reset is available after database connection. For demo mode, use any password.')}>Forgot password?</button>}{error && <p className="form-error">{error}</p>}<button className="auth-submit" type="submit">{mode === 'login' ? 'Sign in →' : 'Create account →'}</button></form><p className="switch-auth">{mode === 'login' ? 'New to BeeBetter?' : 'Already have an account?'} <button onClick={() => { setError(''); setMode(mode === 'login' ? 'signup' : 'login') }}>{mode === 'login' ? 'Create an account' : 'Sign in'}</button></p><div className="demo-note">Demo mode · any valid email and password works</div></div></div>
}

function Overview({ navigate, users, quests, onUserClick, onQuestClick }: { navigate: (section: Section) => void; users: User[]; quests: Quest[]; onUserClick: (user: User) => void; onQuestClick: (quest: Quest) => void }) {
  const stats = [['♙', 'Total users', '1,284', '+12.5%', 'yellow'], ['◉', 'Active today', '846', '+8.2%', 'green'], ['✓', 'Quests completed', '3,642', '+18.7%', 'blue'], ['⚑', 'Open quests', '28', '-2.4%', 'orange']]
  return <><div className="stats">{stats.map(([icon, label, value, change, tone]) => <div className="stat-card" key={label}><span className={`stat-icon ${tone}`}>{icon}</span><small>{label}</small><div><strong>{value}</strong><em className={change.startsWith('-') ? 'negative' : ''}>{change}</em></div></div>)}</div><section className="panel"><div className="panel-heading"><div><h2>User activity</h2><p>Active users over the last 7 days</p></div><select className="select" defaultValue="7"><option value="7">This week</option><option value="30">This month</option><option value="365">This year</option></select></div><div className="chart">{[42, 62, 48, 75, 58, 91, 69].map((height, i) => <div className="bar-column" key={i}><span style={{ height: `${height}%` }} /><small>{['M', 'T', 'W', 'T', 'F', 'S', 'S'][i]}</small></div>)}</div></section><div className="two-panels"><section className="panel"><PanelHeading title="Recent users" subtitle="Latest people to join BeeBetter" action={() => navigate('Users')} />{users.slice(0, 3).map((user) => <UserRow user={user} onClick={() => onUserClick(user)} key={user.email} />)}</section><section className="panel"><PanelHeading title="Popular quests" subtitle="Most completed this week" action={() => navigate('Quests')} />{quests.slice(0, 3).map((quest) => <QuestRow quest={quest} onClick={() => onQuestClick(quest)} key={quest.title} />)}</section></div></>
}

function PanelHeading({ title, subtitle, action }: { title: string; subtitle: string; action: () => void }) { return <div className="panel-heading"><div><h2>{title}</h2><p>{subtitle}</p></div><button className="link-button" onClick={action}>View all →</button></div> }
function UserRow({ user, onClick }: { user: User; onClick?: () => void }) { return <button className="recent-row clickable-row" onClick={onClick}><span className="table-avatar">{user.name.split(' ').map((name) => name[0]).join('')}</span><div className="row-copy"><b>{user.name}</b><small>{user.email}</small></div><Status status={user.status} /></button> }
function QuestRow({ quest, onClick }: { quest: Quest; onClick?: () => void }) { return <button className="recent-row clickable-row" onClick={onClick}><span className="quest-icon">✦</span><div className="row-copy"><b>{quest.title}</b><small>{quest.completions} completions</small></div><span>›</span></button> }
function Status({ status }: { status: string }) { return <span className={`status ${status.toLowerCase()}`}><i />{status}</span> }

function DataTable({ kind, users = [], quests = [], onUserClick, onUserActions, onQuestClick }: { kind: 'users' | 'quests'; users?: User[]; quests?: Quest[]; onUserClick?: (user: User) => void; onUserActions?: (user: User) => void; onQuestClick?: (quest: Quest) => void }) {
  const isUsers = kind === 'users'
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('All')
  const filteredUsers = useMemo(() => users.filter((user) => `${user.name} ${user.email}`.toLowerCase().includes(search.toLowerCase()) && (filter === 'All' || user.status === filter)), [users, search, filter])
  const filteredQuests = useMemo(() => quests.filter((quest) => `${quest.title} ${quest.category}`.toLowerCase().includes(search.toLowerCase()) && (filter === 'All' || quest.status === filter || quest.difficulty === filter)), [quests, search, filter])
  return (
    <section className="panel table-panel">
      <div className="table-toolbar">
        <div className="search">⌕ <input aria-label={`Search ${kind}`} placeholder={`Search ${kind}`} value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        <select className="filter" value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option>All</option>
          {isUsers ? <><option>Active</option><option>Inactive</option></> : <><option>Published</option><option>Draft</option><option>Easy</option><option>Medium</option></>}
        </select>
      </div>
      {isUsers ? <UserRows users={filteredUsers} search={search} onUserClick={onUserClick} onUserActions={onUserActions} /> : <QuestRows quests={filteredQuests} search={search} onQuestClick={onQuestClick} />}
    </section>
  )
}

function UserRows({ users, search, onUserClick, onUserActions }: { users: User[]; search: string; onUserClick?: (user: User) => void; onUserActions?: (user: User) => void }) {
  if (users.length === 0) return <div className="empty-state">No users match “{search}”. Try another search.</div>
  return <div className="table-scroll"><div className="table-row table-header">{['USER', 'JOINED', 'QUESTS', 'STATUS', ''].map((head) => <span key={head}>{head}</span>)}</div>{users.map((row) => <div className="table-row" key={row.email}><UserRow user={row} onClick={() => onUserClick?.(row)} /><span>{row.joined}</span><span>{row.quests}</span><Status status={row.status} /><button className="row-menu" onClick={() => onUserActions?.(row)}>•••</button></div>)}</div>
}

function QuestRows({ quests, search, onQuestClick }: { quests: Quest[]; search: string; onQuestClick?: (quest: Quest) => void }) {
  if (quests.length === 0) return <div className="empty-state">No quests match “{search}”. Try another search.</div>
  return <div className="table-scroll"><div className="table-row table-header">{['QUEST', 'CATEGORY', 'DIFFICULTY', 'COMPLETIONS', 'STATUS'].map((head) => <span key={head}>{head}</span>)}</div>{quests.map((row) => <button className="table-row clickable-row" onClick={() => onQuestClick?.(row)} key={row.title}><div className="quest-cell"><span className="quest-icon">✦</span><b>{row.title}</b></div><span>{row.category}</span><span>{row.difficulty}</span><span>{row.completions}</span><Status status={row.status} /></button>)}</div>
}

function Leaderboard({ users }: { users: User[] }) {
  const [period, setPeriod] = useState('week')
  const leaders = [...users].sort((a, b) => Number(b.quests) - Number(a.quests)).map((user, index) => [user.name, period === 'month' ? String(Math.round(Number(user.quests) * 1.4)) : user.quests, String(index + 1)])
  return <section className="panel leaderboard-panel"><div className="leaderboard-hero"><span className="trophy">♛</span><div><span className="eyebrow">COMMUNITY MOMENTUM</span><h2>Leaderboard</h2><p>Celebrate the people making progress every day.</p></div><select className="select" value={period} onChange={(event) => setPeriod(event.target.value)}><option value="week">This week</option><option value="month">This month</option></select></div>{leaders.map(([name, score, rank]) => <div className="leader-row" key={name}><strong className={`rank rank-${rank}`}>{rank}</strong><span className="table-avatar">{name.split(' ').map((part) => part[0]).join('')}</span><div className="row-copy"><b>{name}</b><small>Personal growth champion</small></div><strong>{score} quests</strong><span className="streak">✦ on a roll</span></div>)}</section>
}

function Drawer({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return <div className="drawer-backdrop" onClick={onClose}><aside className="drawer" onClick={(event) => event.stopPropagation()}><button className="drawer-close" onClick={onClose}>×</button>{children}</aside></div>
}

function UserDetails({ user, onClose, onMessage, onActivity, onToggleStatus }: { user: User; onClose: () => void; onMessage: () => void; onActivity: () => void; onToggleStatus: () => void }) {
  return <Drawer onClose={onClose}><span className="eyebrow">USER PROFILE</span><div className="drawer-avatar">{user.name.split(' ').map((name) => name[0]).join('')}</div><h2>{user.name}</h2><p className="drawer-muted">{user.email}</p><Status status={user.status} /><div className="detail-grid"><div><small>QUESTS COMPLETED</small><b>{user.quests}</b></div><div><small>JOINED</small><b>{user.joined}</b></div></div><h3>Admin actions</h3><button className="drawer-action" onClick={onMessage}>✉ Send message</button><button className="drawer-action" onClick={onActivity}>◉ View activity</button><button className="drawer-action danger" onClick={onToggleStatus}>{user.status === 'Active' ? '⊘ Suspend account' : '◉ Unsuspend account'}</button></Drawer>
}

function QuestDetails({ quest, onClose, onNotice, onEdit, onArchive }: { quest: Quest; onClose: () => void; onNotice: (notice: string) => void; onEdit: () => void; onArchive: () => void }) {
  return <Drawer onClose={onClose}><span className="eyebrow">QUEST DETAILS</span><div className="drawer-quest-icon">✦</div><h2>{quest.title}</h2><p className="drawer-muted">{quest.category} · {quest.difficulty}</p><Status status={quest.status} /><div className="detail-grid"><div><small>COMPLETIONS</small><b>{quest.completions}</b></div><div><small>ASSIGNED TO</small><b>{quest.assignee}</b></div></div><h3>Quest actions</h3><button className="drawer-action" onClick={onEdit}>✎ Edit quest</button><button className="drawer-action" onClick={() => onNotice(`Reminder sent to ${quest.assignee}.`)}>↗ Send reminder</button><button className="drawer-action danger" onClick={onArchive}>⌫ Archive quest</button></Drawer>
}

function UserActions({ user, onClose, onOpenProfile, onMessage, onToggleStatus }: { user: User; onClose: () => void; onOpenProfile: () => void; onMessage: () => void; onToggleStatus: () => void }) {
  return <Drawer onClose={onClose}><span className="eyebrow">USER ACTIONS</span><h2>{user.name}</h2><p className="drawer-muted">Choose an action to manage this account.</p><button className="drawer-action" onClick={onOpenProfile}>◉ View profile</button><button className="drawer-action" onClick={onMessage}>✉ Message user</button><button className="drawer-action danger" onClick={onToggleStatus}>{user.status === 'Active' ? '⊘ Suspend account' : '◉ Unsuspend account'}</button></Drawer>
}

function QuestModal({ initialQuest, users, onClose, onSave }: { initialQuest: Quest | null; users: User[]; onClose: () => void; onSave: (quest: Quest) => void }) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    onSave({
      title: String(data.get('title')),
      category: String(data.get('category')),
      difficulty: String(data.get('difficulty')),
      completions: initialQuest?.completions || '0',
      status: initialQuest?.status || 'Draft',
      assignee: String(data.get('assignee')),
    })
  }
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={onClose}>×</button><span className="eyebrow">QUEST STUDIO</span><h2>{initialQuest ? 'Edit quest' : 'Create a new quest'}</h2><p>Draft a meaningful challenge for the BeeBetter community.</p><form onSubmit={submit}><label>Quest title<input name="title" required defaultValue={initialQuest?.title} placeholder="e.g. Take a mindful break" /></label><label>Send this quest to<select name="assignee" defaultValue={initialQuest?.assignee || 'Everyone'}><option>Everyone</option>{users.filter((user) => user.status === 'Active').map((user) => <option key={user.email}>{user.name}</option>)}</select></label><label>Category<select name="category" defaultValue={initialQuest?.category || 'Wellness'}><option>Wellness</option><option>Growth</option><option>Lifestyle</option><option>Relationships</option></select></label><label>Difficulty<select name="difficulty" defaultValue={initialQuest?.difficulty || 'Easy'}><option>Easy</option><option>Medium</option><option>Hard</option></select></label><div className="assignment-note">✦ Choose Everyone or a specific active user for this quest.</div><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit">{initialQuest ? 'Save changes' : 'Create quest'}</button></div></form></div></div>
}

function MessageModal({ user, onClose, onSend }: { user: User; onClose: () => void; onSend: (message: string) => void }) {
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const message = String(new FormData(event.currentTarget).get('message') || '').trim(); if (message) onSend(message) }
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={onClose}>×</button><span className="eyebrow">MESSAGE CENTER</span><h2>Message {user.name}</h2><p>Send a direct message to this user.</p><form onSubmit={submit}><label>Message<textarea name="message" required rows={5} placeholder="Write your message..." /></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit">Send message</button></div></form></div></div>
}

function ActivityModal({ user, onClose }: { user: User; onClose: () => void }) {
  return <Drawer onClose={onClose}><span className="eyebrow">ACTIVITY</span><h2>{user.name}</h2><p className="drawer-muted">Recent activity in BeeBetter.</p><div className="activity-item"><b>Completed a quest</b><small>Take a mindful walk · Today</small></div><div className="activity-item"><b>Earned a growth badge</b><small>Personal momentum · Yesterday</small></div><div className="activity-item"><b>Joined BeeBetter</b><small>{user.joined}</small></div></Drawer>
}

export default App
