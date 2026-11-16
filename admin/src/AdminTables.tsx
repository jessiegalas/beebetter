import { useEffect, useState, type ReactNode } from 'react'
import type { Admin, AdminAccessRequest, Quest, QuestListQuery, StudentListQuery, User } from './admin-types'

export function questStatusLabel(status: Quest['status']) { return status === 'active' ? 'Published' : status === 'pending' ? 'Draft' : status === 'completed' ? 'Completed' : 'Rejected' }

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

export function ConsoleTable({ label, columns, variant, children }: {
  label: string
  columns: readonly string[]
  variant?: string
  children: ReactNode
}) {
  return <div className="console-table-scroll" role="region" aria-label={label} tabIndex={0}>
    <table className={variant ? 'console-table console-table-' + variant : 'console-table'} role="table" aria-label={label}>
      <thead role="rowgroup"><tr role="row">
        {columns.map(column => <th key={column} role="columnheader" scope="col">{column}</th>)}
      </tr></thead>
      <tbody role="rowgroup">{children}</tbody>
    </table>
  </div>
}

export function ConsoleCell({ label, heading = false, numeric = false, children }: {
  label?: string
  heading?: boolean
  numeric?: boolean
  children: ReactNode
}) {
  if (heading) return <th scope="row" role="rowheader">{children}</th>
  return <td role="cell" className={numeric ? 'console-cell-numeric' : undefined}>
    {label && <span className="overview-cell-label" aria-hidden="true">{label}</span>}
    <div>{children}</div>
  </td>
}

export function TableLoading({ label }: { label: string }) {
  return <div className="console-table-loading" role="status" aria-label={label}>
    <div className="overview-skeleton" aria-hidden="true" />
    <div className="overview-skeleton" aria-hidden="true" />
    <div className="overview-skeleton" aria-hidden="true" />
  </div>
}

function StudentTable(props: StudentTableProps) {
  const { users, total, query, loading = false, error = '', onRefresh, onQueryChange, onUserClick, onUserActions } = props
  const [search, setSearch] = useSearchDraft(query, onQueryChange)
  const hasFilters = Boolean(query.search) || query.status !== 'All'
  const clearFilters = () => { setSearch(''); onQueryChange({ ...query, page: 0, search: '', status: 'All' }) }
  return <section className="panel table-panel" aria-label="Student records">
    <div className="list-controls">
      <SearchField label="Search students" value={search} onChange={setSearch} />
      <label className="filter-field"><span>Status</span><select className="filter" aria-label="Filter students by status" value={query.status} onChange={event => onQueryChange({ ...query, page: 0, status: event.target.value as StudentListQuery['status'] })}><option value="All">All statuses</option><option value="Active">Active</option><option value="Inactive">Inactive</option></select></label>
      <PageSize value={query.pageSize} onChange={pageSize => onQueryChange({ ...query, page: 0, pageSize })} />
      {onRefresh && <button className="secondary-button list-refresh" onClick={onRefresh} disabled={loading}>Refresh</button>}
    </div>
    {error && <div className="empty-state list-error" role="alert">{error}</div>}
    {loading ? <TableLoading label="Loading students" /> : !error && (users.length === 0
      ? <div className="empty-state">{hasFilters ? 'No students match these filters.' : 'No student records are available yet.'}{hasFilters && <button className="link-button clear-filters" onClick={clearFilters}>Clear filters</button>}</div>
      : <ConsoleTable label="Student records" columns={['Student', 'Program / section', 'Year', 'Campus', 'Status', 'Actions']} variant="students">
        {users.map(user => <tr key={user.id} role="row">
          <ConsoleCell heading><button className="student-cell console-record-link" onClick={() => onUserClick?.(user)}>
            <span className="row-copy"><b>{user.name || 'Student ' + user.studentNumber}</b><small>{user.studentNumber} · {user.email}</small></span>
          </button></ConsoleCell>
          <ConsoleCell label="Program / section">{user.course}<small className="table-secondary">{user.section || 'No section'}</small></ConsoleCell>
          <ConsoleCell label="Year">{user.yearLevel}</ConsoleCell>
          <ConsoleCell label="Campus">{user.campus}</ConsoleCell>
          <ConsoleCell label="Status"><Status status={user.status} /></ConsoleCell>
          <ConsoleCell label="Actions"><button className="row-menu" aria-label={'More actions for ' + (user.name || 'student ' + user.studentNumber)} onClick={() => onUserActions?.(user)}>•••</button></ConsoleCell>
        </tr>)}
      </ConsoleTable>)}
    {!loading && !error && total > 0 && <Pagination page={query.page} pageSize={query.pageSize} total={total} onPageChange={page => onQueryChange({ ...query, page })} />}
  </section>
}

function QuestTable(props: QuestTableProps) {
  const { quests, total, query, loading = false, error = '', onRefresh, onQueryChange, onQuestClick } = props
  const [search, setSearch] = useSearchDraft(query, onQueryChange)
  const hasFilters = Boolean(query.search) || query.status !== 'All' || query.difficulty !== 'All'
  const clearFilters = () => { setSearch(''); onQueryChange({ ...query, page: 0, search: '', status: 'All', difficulty: 'All' }) }
  return <section className="panel table-panel" aria-label="Quest assignments">
    <div className="list-controls quest-controls">
      <SearchField label="Search quests" value={search} onChange={setSearch} />
      <label className="filter-field"><span>Status</span><select className="filter" aria-label="Filter quests by status" value={query.status} onChange={event => onQueryChange({ ...query, page: 0, status: event.target.value as QuestListQuery['status'] })}><option value="All">All statuses</option><option value="active">Published</option><option value="pending">Draft</option><option value="completed">Completed</option><option value="rejected">Rejected</option></select></label>
      <label className="filter-field"><span>Difficulty</span><select className="filter" aria-label="Filter quests by difficulty" value={query.difficulty} onChange={event => onQueryChange({ ...query, page: 0, difficulty: event.target.value as QuestListQuery['difficulty'] })}><option value="All">All difficulties</option><option>Easy</option><option>Medium</option><option>Hard</option></select></label>
      {onRefresh && <button className="secondary-button list-refresh" onClick={onRefresh} disabled={loading}>Refresh</button>}
    </div>
    {error && <div className="empty-state list-error" role="alert">{error}</div>}
    {loading ? <TableLoading label="Loading quests" /> : !error && (quests.length === 0
      ? <div className="empty-state">{hasFilters ? 'No quests match these filters.' : 'No quests are available yet.'}{hasFilters && <button className="link-button clear-filters" onClick={clearFilters}>Clear filters</button>}</div>
      : <ConsoleTable label="Quest records" columns={['Quest', 'Category', 'Difficulty', 'Assigned to', 'Status']} variant="quests">
        {quests.map(quest => <tr key={quest.id} role="row">
          <ConsoleCell heading><button className="console-record-link" aria-label={`Open quest ${quest.title}`} onClick={() => onQuestClick?.(quest)}>{quest.title}</button></ConsoleCell>
          <ConsoleCell label="Category">{quest.category}</ConsoleCell>
          <ConsoleCell label="Difficulty">{quest.difficulty}</ConsoleCell>
          <ConsoleCell label="Assigned to">{quest.assignee}</ConsoleCell>
          <ConsoleCell label="Status"><Status status={questStatusLabel(quest.status)} /></ConsoleCell>
        </tr>)}
      </ConsoleTable>)}
    {!loading && !error && total > 0 && <Pagination page={query.page} pageSize={query.pageSize} total={total} onPageChange={page => onQueryChange({ ...query, page })} />}
  </section>
}

export function AdminTable({ admins, currentAdminId, loading, error, onRefresh, onAdd, onUpdate, onRemove }: { admins: Admin[]; currentAdminId: string; loading: boolean; error: string; onRefresh: () => void; onAdd: () => void; onUpdate: (admin: Admin, role: Admin['role'], isActive: boolean) => void; onRemove: (admin: Admin) => void }) {
  return <section className="panel table-panel">
    <div className="table-toolbar"><h2>Administrators</h2><div className="console-actions"><button className="secondary-button" onClick={onRefresh} disabled={loading}>Refresh</button><button className="primary-button" onClick={onAdd}>Add admin</button></div></div>
    {error && <div className="empty-state list-error" role="alert">Could not load admins: {error}</div>}
    {loading ? <TableLoading label="Loading admins" /> : !error && (admins.length === 0
      ? <div className="empty-state">No admin records found.</div>
      : <ConsoleTable label="Admin access records" columns={['Admin', 'Role', 'Status', 'Added', 'Actions']} variant="admins">
        {admins.map(admin => {
          const isSelf = admin.id === currentAdminId
          return <tr className={isSelf ? 'self-admin-row' : undefined} key={admin.id} role="row">
            <ConsoleCell heading><div className="row-copy"><b>{admin.displayName}{isSelf && <span className="you-tag">You</span>}</b><small>{admin.email}</small>{isSelf && <small className="self-admin-note" id="self-admin-lockout">Your account is protected from role and access changes.</small>}</div></ConsoleCell>
            <ConsoleCell label="Role"><select aria-label={`Role for ${admin.displayName}`} aria-describedby={isSelf ? 'self-admin-lockout' : undefined} disabled={isSelf} title={isSelf ? 'You cannot change your own admin role.' : undefined} value={admin.role} onChange={event => onUpdate(admin, event.target.value as Admin['role'], admin.isActive)}><option value="admin">Admin</option><option value="super_admin">Super Admin</option></select></ConsoleCell>
            <ConsoleCell label="Status"><Status status={admin.isActive ? 'Active' : 'Inactive'} /></ConsoleCell>
            <ConsoleCell label="Added" numeric>{admin.createdAt}</ConsoleCell>
            <ConsoleCell label="Actions"><div className="admin-row-actions">
              <button className="secondary-button" disabled={isSelf} title={isSelf ? 'You cannot change your own admin status.' : undefined} onClick={() => onUpdate(admin, admin.role, !admin.isActive)}>{admin.isActive ? 'Disable' : 'Enable'}</button>
              <button className="row-menu" aria-label={`Remove admin access for ${admin.displayName}`} disabled={isSelf} title={isSelf ? 'You cannot remove your own admin access.' : undefined} onClick={() => onRemove(admin)}>×</button>
            </div></ConsoleCell>
          </tr>
        })}
      </ConsoleTable>)}
  </section>
}

export function AdminAccessRequests({ requests, loading, error, onRefresh, onReview }: {
  requests: AdminAccessRequest[]
  loading: boolean
  error: string
  onRefresh: () => void
  onReview: (request: AdminAccessRequest, approve: boolean) => void
}) {
  return <section className="panel table-panel">
    <div className="table-toolbar"><h2>Access requests</h2><button className="secondary-button" onClick={onRefresh} disabled={loading}>Refresh</button></div>
    {error && <div className="empty-state list-error" role="alert">{error}</div>}
    {loading ? <TableLoading label="Loading requests" /> : !error && (requests.length === 0
      ? <div className="empty-state">No pending access requests.</div>
      : <ConsoleTable label="Admin access requests" columns={['Requester', 'Submitted', 'Actions']} variant="requests">
        {requests.map(request => <tr key={request.id} role="row">
          <ConsoleCell heading><div className="row-copy"><b>{request.displayName}</b><small>{request.email}</small></div></ConsoleCell>
          <ConsoleCell label="Submitted" numeric>{request.submittedAt}</ConsoleCell>
          <ConsoleCell label="Actions"><div className="admin-row-actions">
            <button className="primary-button" onClick={() => onReview(request, true)}>Approve</button>
            <button className="secondary-button" onClick={() => onReview(request, false)}>Decline</button>
          </div></ConsoleCell>
        </tr>)}
      </ConsoleTable>)}
  </section>
}
