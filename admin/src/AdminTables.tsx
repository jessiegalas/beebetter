import { useEffect, useState } from 'react'
import type { Admin, ListQuery, Quest, User } from './admin-types'

function questStatusLabel(status: Quest['status']) { return status === 'active' ? 'Published' : status === 'pending' ? 'Draft' : status === 'completed' ? 'Completed' : 'Rejected' }

function UserRow({ user, onClick }: { user: User; onClick?: () => void }) { return <button className="recent-row clickable-row" onClick={onClick}><span className="table-avatar">{user.name.split(' ').map((name) => name[0]).join('')}</span><div className="row-copy"><b>{user.name}</b><small>{user.email}</small></div><Status status={user.status} /></button> }
export function Status({ status }: { status: string }) { return <span className={`status ${status.toLowerCase()}`}><i />{status}</span> }

export function DataTable({ kind, users = [], quests = [], total, query, loading = false, error = '', onRefresh, onQueryChange, onUserClick, onUserActions, onQuestClick }: { kind: 'users' | 'quests'; users?: User[]; quests?: Quest[]; total: number; query: ListQuery; loading?: boolean; error?: string; onRefresh?: () => void; onQueryChange: (query: ListQuery) => void; onUserClick?: (user: User) => void; onUserActions?: (user: User) => void; onQuestClick?: (quest: Quest) => void }) {
  const isUsers = kind === 'users'
  const [search, setSearch] = useState(query.search)
  useEffect(() => { const timer=setTimeout(()=>{ if(search!==query.search)onQueryChange({...query,page:0,search}) },300); return()=>clearTimeout(timer) },[search,query,onQueryChange])
  const pages=Math.max(1,Math.ceil(total/query.pageSize))
  return (
    <section className="panel table-panel">
      <div className="table-toolbar">
        <div className="search">⌕ <input aria-label={`Search ${kind}`} placeholder={`Search ${kind}`} value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        <select className="filter" value={query.filter} onChange={(event) => onQueryChange({...query,page:0,filter:event.target.value})}>
          <option>All</option>
          {isUsers ? <><option>Active</option><option>Inactive</option></> : <><option value="active">Published</option><option value="pending">Draft</option><option value="completed">Completed</option><option value="rejected">Rejected</option><option>Easy</option><option>Medium</option><option>Hard</option></>}
        </select>
        {onRefresh && <button className="secondary-button" onClick={onRefresh}>Refresh</button>}
      </div>
      {error && <div className="empty-state">{error}</div>}
      {loading ? <div className="empty-state">Loading {isUsers ? 'students' : 'quests'}...</div> : error ? null : isUsers ? <UserRows users={users} search={query.search} onUserClick={onUserClick} onUserActions={onUserActions} /> : <QuestRows quests={quests} search={query.search} onQuestClick={onQuestClick} />}
      {!loading&&!error&&total>0&&<div className="report-actions"><button className="secondary-button" disabled={query.page===0} onClick={()=>onQueryChange({...query,page:query.page-1})}>Previous</button><span>Page {query.page+1} of {pages} · {total} records</span><button className="secondary-button" disabled={query.page+1>=pages} onClick={()=>onQueryChange({...query,page:query.page+1})}>Next</button></div>}
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

export function AdminTable({ admins, loading, error, onRefresh, onAdd, onUpdate, onRemove }: { admins: Admin[]; loading: boolean; error: string; onRefresh: () => void; onAdd: () => void; onUpdate: (admin: Admin, role: Admin['role'], isActive: boolean) => void; onRemove: (admin: Admin) => void }) {
  return <section className="panel table-panel"><div className="table-toolbar"><div><h2>Admin access</h2><p>Manage who can access the admin console.</p></div><div><button className="secondary-button" onClick={onRefresh}>Refresh</button><button className="primary-button" onClick={onAdd}>＋ Add admin</button></div></div>{error && <div className="empty-state">Could not load admins: {error}. Apply 007_super_admin_management.sql.</div>}{loading ? <div className="empty-state">Loading admins...</div> : admins.length === 0 ? <div className="empty-state">No admin records found.</div> : <div className="table-scroll"><div className="table-row table-header"><span>ADMIN</span><span>ROLE</span><span>STATUS</span><span>ADDED</span><span>ACTIONS</span></div>{admins.map((admin) => <div className="table-row" key={admin.id}><div className="row-copy"><b>{admin.displayName}</b><small>{admin.email}</small></div><select value={admin.role} onChange={(event) => onUpdate(admin, event.target.value as Admin['role'], admin.isActive)}><option value="admin">Admin</option><option value="super_admin">Super Admin</option></select><Status status={admin.isActive ? 'Active' : 'Inactive'} /><span>{admin.createdAt}</span><div><button className="secondary-button" onClick={() => onUpdate(admin, admin.role, !admin.isActive)}>{admin.isActive ? 'Disable' : 'Enable'}</button><button className="row-menu" onClick={() => onRemove(admin)}>×</button></div></div>)}</div>}</section>
}

