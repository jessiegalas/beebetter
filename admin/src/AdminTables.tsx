import { useEffect, useState } from 'react'
import type { Admin, AdminAccessRequest, Quest, QuestListQuery, StudentListQuery, User } from './admin-types'

function questStatusLabel(status: Quest['status']) { return status === 'active' ? 'Published' : status === 'pending' ? 'Draft' : status === 'completed' ? 'Completed' : 'Rejected' }

export function Status({ status }: { status: string }) { return <span className={`status ${status.toLowerCase()}`}><i />{status}</span> }

type StudentTableProps = {
  kind: 'users'
  users: User[]
  total: number
  query: StudentListQuery
  loading?: boolean
  error?: string
  onRefresh?: () => void
  onQueryChange: (query: StudentListQuery) => void
  onUserClick?: (user: User) => void
  onUserActions?: (user: User) => void
}
type QuestTableProps = {
  kind: 'quests'
  quests: Quest[]
  total: number
  query: QuestListQuery
  loading?: boolean
  error?: string
  onRefresh?: () => void
  onQueryChange: (query: QuestListQuery) => void
  onQuestClick?: (quest: Quest) => void
}
type DataTableProps = StudentTableProps | QuestTableProps

export function DataTable(props: DataTableProps) {
  return props.kind === 'users' ? <StudentTable {...props} /> : <QuestTable {...props} />
}

function useSearchDraft<Q extends { page: number; search: string }>(query: Q, onQueryChange: (query: Q) => void) {
  const [search, setSearch] = useState(query.search)
  useEffect(() => setSearch(query.search), [query.search])
  useEffect(() => {
    if (search === query.search) return
    const timer = setTimeout(() => onQueryChange({ ...query, page: 0, search }), 300)
    return () => clearTimeout(timer)
  }, [search, query, onQueryChange])
  return [search, setSearch] as const
}

function SearchField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="search-field"><span aria-hidden="true">⌕</span><input type="search" aria-label={label} placeholder={label} value={value} onChange={event => onChange(event.target.value)} /></label>
}

function PageSize({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <label className="filter-field"><span>Rows per page</span><select className="filter" aria-label="Rows per page" value={value} onChange={event => onChange(Number(event.target.value))}>{[10, 20, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}</select></label>
}

function Pagination({ page, pageSize, total, onPageChange }: { page: number; pageSize: number; total: number; onPageChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const first = total === 0 ? 0 : page * pageSize + 1
  const last = Math.min((page + 1) * pageSize, total)
  return <div className="list-pagination" aria-label="List pagination">
    <span>Showing {first}–{last} of {total}</span>
    <div><button className="secondary-button" aria-label="Previous page" disabled={page === 0} onClick={() => onPageChange(page - 1)}>Previous</button><span className="page-count">Page {page + 1} of {pages}</span><button className="secondary-button" aria-label="Next page" disabled={page + 1 >= pages} onClick={() => onPageChange(page + 1)}>Next</button></div>
  </div>
}

function StudentTable(props: StudentTableProps) {
  const { users, total, query, loading = false, error = '', onRefresh, onQueryChange, onUserClick, onUserActions } = props
  const [search, setSearch] = useSearchDraft(query, onQueryChange)
  const hasFilters = Boolean(query.search) || query.status !== 'All'
  const clearFilters = () => { setSearch(''); onQueryChange({ ...query, page: 0, search: '', status: 'All' }) }
  return <section className="panel table-panel" aria-labelledby="students-list-title">
    <div className="table-toolbar"><div><h2 id="students-list-title">Students</h2><p>Search and manage enrolled student records.</p></div>{onRefresh && <button className="secondary-button" onClick={onRefresh} disabled={loading}>Refresh</button>}</div>
    <div className="list-controls"><SearchField label="Search students" value={search} onChange={setSearch} /><label className="filter-field"><span>Status</span><select className="filter" aria-label="Filter students by status" value={query.status} onChange={event => onQueryChange({ ...query, page: 0, status: event.target.value as StudentListQuery['status'] })}><option value="All">All statuses</option><option value="Active">Active</option><option value="Inactive">Inactive</option></select></label><PageSize value={query.pageSize} onChange={pageSize => onQueryChange({ ...query, page: 0, pageSize })} /></div>
    {error && <div className="empty-state list-error" role="alert">{error}</div>}
    {loading ? <div className="empty-state" role="status">Loading students...</div> : error ? null : users.length === 0 ? <div className="empty-state">{hasFilters ? <>No students match these filters. Try another search or clear the filters.</> : 'No student records are available yet.'}{hasFilters && <button className="link-button clear-filters" onClick={clearFilters}>Clear filters</button>}</div> : <div className="table-scroll" role="region" aria-label="Student records" tabIndex={0}><div className="table-row table-header student-grid"><span>STUDENT</span><span>PROGRAM / SECTION</span><span>YEAR</span><span>CAMPUS</span><span>STATUS</span><span>ACTIONS</span></div>{users.map(user => <div className="table-row student-grid" key={user.id}><button className="student-cell" onClick={() => onUserClick?.(user)}><span className="table-avatar">{user.name.split(/\s+/).filter(Boolean).slice(0, 2).map(name => name[0]?.toUpperCase()).join('')}</span><span className="row-copy"><b>{user.name}</b><small>{user.studentNumber} · {user.email}</small></span></button><span>{user.course}<small className="table-secondary">{user.section || 'No section'}</small></span><span>{user.yearLevel}</span><span>{user.campus}</span><Status status={user.status} /><button className="row-menu" aria-label={`More actions for ${user.name}`} onClick={() => onUserActions?.(user)}>•••</button></div>)}</div>}
    {!loading && !error && total > 0 && <Pagination page={query.page} pageSize={query.pageSize} total={total} onPageChange={page => onQueryChange({ ...query, page })} />}
  </section>
}

function QuestTable(props: QuestTableProps) {
  const { quests, total, query, loading = false, error = '', onRefresh, onQueryChange, onQuestClick } = props
  const [search, setSearch] = useSearchDraft(query, onQueryChange)
  const hasFilters = Boolean(query.search) || query.status !== 'All' || query.difficulty !== 'All'
  const clearFilters = () => { setSearch(''); onQueryChange({ ...query, page: 0, search: '', status: 'All', difficulty: 'All' }) }
  return <section className="panel table-panel" aria-labelledby="quests-list-title">
    <div className="table-toolbar"><div><h2 id="quests-list-title">Quests</h2><p>Find and manage student development quests.</p></div>{onRefresh && <button className="secondary-button" onClick={onRefresh} disabled={loading}>Refresh</button>}</div>
    <div className="list-controls quest-controls"><SearchField label="Search quests" value={search} onChange={setSearch} /><label className="filter-field"><span>Status</span><select className="filter" aria-label="Filter quests by status" value={query.status} onChange={event => onQueryChange({ ...query, page: 0, status: event.target.value as QuestListQuery['status'] })}><option value="All">All statuses</option><option value="active">Published</option><option value="pending">Draft</option><option value="completed">Completed</option><option value="rejected">Rejected</option></select></label><label className="filter-field"><span>Difficulty</span><select className="filter" aria-label="Filter quests by difficulty" value={query.difficulty} onChange={event => onQueryChange({ ...query, page: 0, difficulty: event.target.value as QuestListQuery['difficulty'] })}><option value="All">All difficulties</option><option>Easy</option><option>Medium</option><option>Hard</option></select></label></div>
    {error && <div className="empty-state list-error" role="alert">{error}</div>}
    {loading ? <div className="empty-state" role="status">Loading quests...</div> : error ? null : quests.length === 0 ? <div className="empty-state">{hasFilters ? <>No quests match these filters. Try another search or clear the filters.</> : 'No quests are available yet.'}{hasFilters && <button className="link-button clear-filters" onClick={clearFilters}>Clear filters</button>}</div> : <div className="table-scroll" role="region" aria-label="Quest records" tabIndex={0}><div className="table-row table-header quest-grid">{['QUEST', 'CATEGORY', 'DIFFICULTY', 'ASSIGNED TO', 'STATUS'].map(head => <span key={head}>{head}</span>)}</div>{quests.map(quest => <button className="table-row clickable-row quest-grid" aria-label={`Open quest ${quest.title}`} onClick={() => onQuestClick?.(quest)} key={quest.id}><span className="quest-cell"><span className="quest-icon" aria-hidden="true">✦</span><b>{quest.title}</b></span><span>{quest.category}</span><span>{quest.difficulty}</span><span>{quest.assignee}</span><Status status={questStatusLabel(quest.status)} /></button>)}</div>}
    {!loading && !error && total > 0 && <Pagination page={query.page} pageSize={query.pageSize} total={total} onPageChange={page => onQueryChange({ ...query, page })} />}
  </section>
}

export function AdminTable({ admins, currentAdminId, loading, error, onRefresh, onAdd, onUpdate, onRemove }: { admins: Admin[]; currentAdminId: string; loading: boolean; error: string; onRefresh: () => void; onAdd: () => void; onUpdate: (admin: Admin, role: Admin['role'], isActive: boolean) => void; onRemove: (admin: Admin) => void }) {
  return <section className="panel table-panel"><div className="table-toolbar"><div><h2>Admin access</h2><p>Manage who can access the admin console.</p></div><div><button className="secondary-button" onClick={onRefresh} disabled={loading}>Refresh</button><button className="primary-button" onClick={onAdd}>＋ Add admin</button></div></div>{error && <div className="empty-state" role="alert">Could not load admins: {error}</div>}{loading ? <div className="empty-state" role="status">Loading admins...</div> : error ? null : admins.length === 0 ? <div className="empty-state">No admin records found.</div> : <div className="table-scroll" role="region" aria-label="Admin access records" tabIndex={0}><div className="table-row table-header admin-grid"><span>ADMIN</span><span>ROLE</span><span>STATUS</span><span>ADDED</span><span>ACTIONS</span></div>{admins.map(admin => {
    const isSelf = admin.id === currentAdminId
    return <div className={`table-row admin-grid${isSelf ? ' self-admin-row' : ''}`} key={admin.id}><div className="row-copy"><b>{admin.displayName}{isSelf && <span className="you-tag">You</span>}</b><small>{admin.email}</small>{isSelf && <small className="self-admin-note" id="self-admin-lockout">Your account is protected from role and access changes.</small>}</div><select aria-label={`Role for ${admin.displayName}`} aria-describedby={isSelf ? 'self-admin-lockout' : undefined} disabled={isSelf} title={isSelf ? 'You cannot change your own admin role.' : undefined} value={admin.role} onChange={event => onUpdate(admin, event.target.value as Admin['role'], admin.isActive)}><option value="admin">Admin</option><option value="super_admin">Super Admin</option></select><Status status={admin.isActive ? 'Active' : 'Inactive'} /><span>{admin.createdAt}</span><div className="admin-row-actions"><button className="secondary-button" disabled={isSelf} title={isSelf ? 'You cannot change your own admin status.' : undefined} onClick={() => onUpdate(admin, admin.role, !admin.isActive)}>{admin.isActive ? 'Disable' : 'Enable'}</button><button className="row-menu" aria-label={`Remove admin access for ${admin.displayName}`} disabled={isSelf} title={isSelf ? 'You cannot remove your own admin access.' : undefined} onClick={() => onRemove(admin)}>×</button></div></div>
  })}</div>}</section>
}

export function AdminAccessRequests({ requests, loading, error, onRefresh, onReview }: {
  requests: AdminAccessRequest[]
  loading: boolean
  error: string
  onRefresh: () => void
  onReview: (request: AdminAccessRequest, approve: boolean) => void
}) {
  return <section className="panel table-panel"><div className="table-toolbar"><div><h2>Access requests</h2><p>Review requests for ordinary admin access.</p></div><button className="secondary-button" onClick={onRefresh} disabled={loading}>Refresh</button></div>{error && <div className="empty-state" role="alert">{error}</div>}{loading ? <div className="empty-state" role="status">Loading requests...</div> : error ? null : requests.length === 0 ? <div className="empty-state">No pending access requests.</div> : <div className="table-scroll" role="region" aria-label="Admin access requests" tabIndex={0}><div className="table-row table-header request-grid"><span>REQUESTER</span><span>SUBMITTED</span><span>ACTIONS</span></div>{requests.map(request => <div className="table-row request-grid" key={request.id}><div className="row-copy"><b>{request.displayName}</b><small>{request.email}</small></div><span>{request.submittedAt}</span><div className="admin-row-actions"><button className="primary-button" onClick={() => onReview(request, true)}>Approve</button><button className="secondary-button" onClick={() => onReview(request, false)}>Decline</button></div></div>)}</div>}</section>
}
