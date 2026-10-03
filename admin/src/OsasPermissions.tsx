import { useEffect, useRef, useState } from 'react';
import { listOsasPermissionRows, setOsasPermissions, type OsasPermissionRow } from './osas-data';
export type PermissionAdmin = { id: string; email: string; displayName: string; role: 'admin' | 'super_admin'; isActive: boolean; createdAt: string };
export function OsasPermissions({ admins, onChanged }: { admins: PermissionAdmin[]; onChanged: () => Promise<void> }) {
  const request = useRef(0);
  const mounted = useRef(true);
  const busy = useRef(false);
  const [rows, setRows] = useState<OsasPermissionRow[]>([]); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState<string | null>(null); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const load = async () => { const id = ++request.current; setLoading(true); setError(''); try { const data = await listOsasPermissionRows(); if (id === request.current) setRows(data); } catch (reason) { if (id === request.current) setError(reason instanceof Error ? reason.message : 'Could not load admin capabilities.'); } finally { if (id === request.current) setLoading(false); } };
  useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false; request.current++; }; }, []);
  const change = async (admin: PermissionAdmin, field: 'aggregate' | 'support', checked: boolean) => {
    if (busy.current || loading || error || !admin.isActive) return;
    const current = rows.find(row => row.user_id === admin.id);
    const view = field === 'aggregate' ? checked : current?.can_view_aggregates ?? false;
    const support = field === 'support' ? checked : current?.can_manage_support_requests ?? false;
    busy.current = true; setSaving(admin.id); setError(''); setNotice('');
    try {
      await setOsasPermissions(admin.id, view, support, true);
      if (!mounted.current) return;
      await load();
      if (!mounted.current) return;
      await onChanged();
      if (mounted.current) setNotice(view || support ? `Admin capabilities updated for ${admin.email}.` : `Admin capabilities revoked for ${admin.email}.`);
    } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : 'Could not update admin capabilities.'); }
    finally { busy.current = false; if (mounted.current) setSaving(null); }
  };
  return <section className="panel table-panel"><div className="table-toolbar"><div><h2>Admin capabilities</h2><p>Assign reporting and support capabilities to OSAS administrators.</p></div><button className="secondary-button" onClick={() => void load()} disabled={loading || !!saving}>Refresh</button></div>{notice && <div className="case-notice" role="status">{notice}</div>}{error && <div className="empty-state" role="alert">Admin capabilities could not load: {error}</div>}{loading ? <div className="empty-state">Loading admin capabilities...</div> : <div className="permission-list"><div className="permission-row permission-header"><span>PERSONNEL</span><span>ADMIN STATUS</span><span>AGGREGATE REPORTS</span><span>IDENTIFIABLE SUPPORT CASES</span></div>{admins.map(admin => { const permission = rows.find(row => row.user_id === admin.id); const disabled = !admin.isActive || !!saving || loading || !!error; return <div className="permission-row" key={admin.id}><div className="row-copy"><b>{admin.displayName}</b><small>{admin.email}</small></div><span className={`status ${admin.isActive ? 'active' : 'inactive'}`}><i />{admin.isActive ? 'Active' : 'Inactive'}</span><label className="permission-toggle"><input type="checkbox" checked={permission?.can_view_aggregates ?? false} disabled={disabled} onChange={event => void change(admin, 'aggregate', event.target.checked)} /><span>{permission?.can_view_aggregates ? 'Granted' : 'Not granted'}</span></label><label className="permission-toggle"><input type="checkbox" checked={permission?.can_manage_support_requests ?? false} disabled={disabled} onChange={event => void change(admin, 'support', event.target.checked)} /><span>{permission?.can_manage_support_requests ? 'Granted' : 'Not granted'}</span></label></div>; })}</div>}<p className="permission-note">Inactive administrators have no effective OSAS access even if a stored permission row exists. Clearing both permissions revokes and removes that row.</p></section>;
}
