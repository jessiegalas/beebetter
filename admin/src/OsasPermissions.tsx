import { ConsoleCell, ConsoleTable, Status, TableLoading } from './AdminTables';
import { ADMIN_SUPPORT_REQUESTS_ENABLED } from './admin-features';

export type PermissionAdmin = { id: string; email: string; displayName: string; role: 'admin' | 'super_admin'; isActive: boolean; createdAt: string };

export function OsasPermissions({ admins, loading, error }: { admins: PermissionAdmin[]; loading?: boolean; error?: string }) {
  const columns = ['Personnel', 'Admin status', 'Aggregate reports'];
  if (ADMIN_SUPPORT_REQUESTS_ENABLED) columns.push('Support cases');
  return <section className="panel table-panel">
    <div className="table-toolbar"><div><h2>OSAS access</h2><p>All active admins receive aggregate reporting access automatically.</p></div></div>
    {loading ? <TableLoading label="Loading OSAS access" /> : error ? <p className="empty-state list-error" role="alert">Could not load OSAS access details.</p>
      : admins.length ? <ConsoleTable label="OSAS access by administrator" columns={columns}>
        {admins.map(admin => <tr key={admin.id} role="row">
          <ConsoleCell heading><div className="row-copy"><b>{admin.displayName}</b><small>{admin.email}</small></div></ConsoleCell>
          <ConsoleCell label="Admin status"><Status status={admin.isActive ? 'Active' : 'Inactive'} /></ConsoleCell>
          <ConsoleCell label="Aggregate reports">{admin.isActive ? 'Included' : 'Unavailable'}</ConsoleCell>
          {ADMIN_SUPPORT_REQUESTS_ENABLED && <ConsoleCell label="Support cases">{admin.isActive ? 'Included' : 'Unavailable'}</ConsoleCell>}
        </tr>)}
      </ConsoleTable> : <p className="empty-state">No administrators to display.</p>}
    <p className="permission-note">OSAS access follows active admin status and is enforced by the database. Inactive administrators have no effective access. Admin-account management remains exclusive to Super Admins.</p>
  </section>;
}
