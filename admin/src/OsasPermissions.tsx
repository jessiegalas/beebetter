export type PermissionAdmin = { id: string; email: string; displayName: string; role: 'admin' | 'super_admin'; isActive: boolean; createdAt: string };

export function OsasPermissions({ admins }: { admins: PermissionAdmin[] }) {
  return <section className="panel table-panel">
    <div className="table-toolbar"><div><h2>OSAS access</h2><p>All active admins receive aggregate reporting and support-case access automatically.</p></div></div>
    <div className="permission-list">
      <div className="permission-row permission-header"><span>PERSONNEL</span><span>ADMIN STATUS</span><span>AGGREGATE REPORTS</span><span>IDENTIFIABLE SUPPORT CASES</span></div>
      {admins.map(admin => <div className="permission-row" key={admin.id}>
        <div className="row-copy"><b>{admin.displayName}</b><small>{admin.email}</small></div>
        <span className={`status ${admin.isActive ? 'active' : 'inactive'}`}><i />{admin.isActive ? 'Active' : 'Inactive'}</span>
        <span>{admin.isActive ? 'Included' : 'Unavailable'}</span><span>{admin.isActive ? 'Included' : 'Unavailable'}</span>
      </div>)}
    </div>
    <p className="permission-note">OSAS access follows active admin status and is enforced by the database. Inactive administrators have no effective access. Admin-account management remains exclusive to Super Admins.</p>
  </section>;
}
