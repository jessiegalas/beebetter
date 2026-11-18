import { PROGRAMS, YEARS, LIMITS, cleanName, cleanStudentNumber, normalizeProgram, normalizeYear, validateStudent, studentPayload, type StudentFields, type EnrollmentOption } from '../../mobile/src/lib/student-validation'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { supabase } from './supabase'
import type { Admin, Quest, QuestDraft, User } from './admin-types'
import { getQuestActivityCode, searchActiveStudents } from './admin-data'
import { initials } from './AdminShell'
import { Status, questStatusLabel } from './AdminTables'
import { WorkspaceDialog } from './WorkspaceDialog'

export function AdminModal({ onClose, onSave }: { onClose: () => void; onSave: (id: string, role: Admin['role']) => Promise<void> }) {
  const busy = useRef(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy.current) return
    const data = new FormData(event.currentTarget)
    busy.current = true; setSaving(true); setError('')
    try { await onSave(String(data.get('userId') || ''), String(data.get('role')) as Admin['role']) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not grant admin access. Try again.') }
    finally { busy.current = false; setSaving(false) }
  }
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={onClose}>×</button><span className="eyebrow">ADMIN ACCESS</span><h2>Add an admin</h2><p>The user must already exist in Supabase Authentication.</p><form onSubmit={submit}>{error && <p className="form-error" role="alert">{error}</p>}<label>Auth user UUID<input name="userId" required placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" /></label><label>Role<select name="role" defaultValue="admin"><option value="admin">Admin</option><option value="super_admin">Super Admin</option></select></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit" disabled={saving}>{saving ? 'Granting access...' : 'Grant access'}</button></div></form></div></div>
}

function Drawer({ children, label, onClose }: { children: ReactNode; label: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    const trigger = document.activeElement
    dialog?.showModal()
    return () => {
      dialog?.close()
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus()
    }
  }, [])
  return <dialog ref={ref} className="drawer detail-dialog" aria-label={label}
    onCancel={event => { event.preventDefault(); onClose() }}
    onClick={event => {
      if (event.target !== event.currentTarget) return
      const bounds = event.currentTarget.getBoundingClientRect()
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose()
    }}>
    <button className="drawer-close" aria-label="Close details" onClick={onClose}>×</button>
    {children}
  </dialog>
}

export function UserDetails({ user, onClose, onEdit, onToggleStatus }: { user: User; onClose: () => void; onEdit: () => void; onToggleStatus: () => void }) {
  return <Drawer label="Student profile" onClose={onClose}><span className="eyebrow">STUDENT PROFILE</span><div className="drawer-avatar">{initials(user.name)}</div><h2>{user.name || 'Student ' + user.studentNumber}</h2><p className="drawer-muted">{user.email}</p><Status status={user.status} /><div className="detail-grid"><div><small>STUDENT NUMBER</small><b>{user.studentNumber}</b></div><div><small>COURSE</small><b>{user.course}</b></div><div><small>YEAR / SECTION</small><b>{user.yearLevel} / {user.section}</b></div><div><small>CAMPUS</small><b>{user.campus}</b></div><div><small>GOAL</small><b>{user.goal || 'No goal set'}</b></div><div><small>QUESTS COMPLETED</small><b>{user.quests}</b></div></div><h3>Admin actions</h3><button className="drawer-action" onClick={onEdit}>Edit student information</button><button className="drawer-action danger" onClick={onToggleStatus}>{user.status === 'Active' ? 'Set account inactive' : 'Reactivate account'}</button></Drawer>
}

export function QuestDetails({ quest, onClose, onEdit }: { quest: Quest; onClose: () => void; onEdit: () => void }) {
  const [activityCode, setActivityCode] = useState<{ questId: string; value: string | null; failed?: boolean } | null>(null)
  useEffect(() => {
    let active = true
    void getQuestActivityCode(quest.id).then(value => {
      if (active) setActivityCode({ questId: quest.id, value })
    }).catch(() => {
      if (active) setActivityCode({ questId: quest.id, value: null, failed: true })
    })
    return () => { active = false }
  }, [quest.id])
  const activity = activityCode?.questId === quest.id ? activityCode : null
  const editable = quest.status === 'active' || quest.status === 'pending'
  return <Drawer label={quest.title} onClose={onClose}><span className="eyebrow">QUEST DETAILS</span><div className="drawer-quest-icon">Q</div><h2>{quest.title}</h2><p className="drawer-muted">{quest.description || 'No description provided.'}</p><p className="drawer-muted">{quest.category} / {quest.difficulty} / {quest.xp} XP</p><Status status={questStatusLabel(quest.status)} /><div className="detail-grid"><div><small>COMPLETION</small><b>{quest.completions === '1' ? 'Completed' : 'Not completed'}</b></div><div><small>ASSIGNED TO</small><b>{quest.assignee}</b></div></div>{activity?.value && <p className="drawer-muted">Activity code <code style={{ overflowWrap: 'anywhere' }}>{activity.value}</code></p>}{activity?.failed && <p className="drawer-muted" role="status">Activity code unavailable.</p>}<h3>Quest actions</h3>{editable ? <button className="drawer-action" onClick={onEdit}>Edit this assignment</button> : <p className="drawer-muted">Completed and rejected assignments cannot be edited.</p>}</Drawer>
}

export function UserActions({ user, onClose, onOpenProfile, onToggleStatus }: { user: User; onClose: () => void; onOpenProfile: () => void; onToggleStatus: () => void }) {
  return <Drawer label="Student account actions" onClose={onClose}><span className="eyebrow">USER ACTIONS</span><h2>{user.name || 'Student ' + user.studentNumber}</h2><p className="drawer-muted">Choose an available account-management action.</p><button className="drawer-action" onClick={onOpenProfile}>View profile</button><button className="drawer-action danger" onClick={onToggleStatus}>{user.status === 'Active' ? 'Set account inactive' : 'Reactivate account'}</button></Drawer>
}

type Assignee = Awaited<ReturnType<typeof searchActiveStudents>>[number]

export function QuestModal({ initialQuest, onClose, onSave }: {
  initialQuest: Quest | null
  onClose: () => void
  onSave: (quest: QuestDraft) => Promise<void>
}) {
  const [audience, setAudience] = useState('everyone')
  const [search, setSearch] = useState('')
  const [result, setResult] = useState<{ options: Assignee[] } | { error: string } | null>(null)
  const [retry, setRetry] = useState(0)
  const [student, setStudent] = useState<Assignee | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const busy = useRef(false)
  const individual = !initialQuest && audience === 'student'
  const query = search.trim()

  useEffect(() => {
    if (!individual) return
    let active = true
    const timer = setTimeout(() => {
      void searchActiveStudents(query).then(options => {
        if (active) setResult({ options })
      }).catch(() => {
        if (active) setResult({ error: 'Could not search for active students.' })
      })
    }, 300)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [individual, query, retry])

  const matches = result && 'options' in result ? result.options : []
  const options = student && !matches.some(item => item.id === student.id) ? [student, ...matches] : matches

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy.current || (individual && !student)) return
    const data = new FormData(event.currentTarget)
    const submitter = (event.nativeEvent as SubmitEvent).submitter
    busy.current = true
    setSaving(true)
    setSaveError('')
    try {
      await onSave({
        title: String(data.get('title')),
        description: String(data.get('description') || ''),
        category: String(data.get('category')) as QuestDraft['category'],
        difficulty: String(data.get('difficulty')) as QuestDraft['difficulty'],
        assigneeId: initialQuest ? initialQuest.ownerId : individual ? student!.id : null,
        publish: initialQuest ? data.get('status') === 'active' : submitter?.getAttribute('value') === 'publish',
      })
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : 'Could not save the quest. Try again.')
    } finally {
      busy.current = false
      setSaving(false)
    }
  }

  return <WorkspaceDialog title={initialQuest ? 'Edit quest assignment' : 'Create quest'}
    description={initialQuest ? 'Assigned to ' + initialQuest.assignee + '.' : 'Published quests appear on the recipients’ mobile quest boards.'}
    busy={saving} onClose={onClose}>
    <form className="workspace-dialog-form" onSubmit={submit} aria-busy={saving}>
      <div className="workspace-dialog-body">
        <fieldset disabled={saving}>
          <label>Quest title<input name="title" required maxLength={100} defaultValue={initialQuest?.title} placeholder="e.g. Take a mindful break" /></label>
          <label>Description (optional)<textarea name="description" rows={3} defaultValue={initialQuest?.description} /></label>
          <div className="quest-dialog-fields">
            <label>Category<select name="category" defaultValue={initialQuest?.category || 'Habits'}>
              <option>Academics</option><option>Habits</option><option>Social</option><option>Health</option>
            </select></label>
            <label>Difficulty<select name="difficulty" defaultValue={initialQuest?.difficulty || 'Easy'}>
              <option>Easy</option><option>Medium</option><option>Hard</option>
            </select></label>
          </div>
          {initialQuest ? <label>Status<select name="status" defaultValue={initialQuest.status === 'active' ? 'active' : 'pending'}>
            <option value="pending">Draft</option><option value="active">Published</option>
          </select></label> : <>
            <label>Assign to<select value={audience} onChange={event => { setAudience(event.target.value); setResult(null) }}>
              <option value="everyone">Everyone (all active students)</option>
              <option value="student">One student</option>
            </select></label>
            {individual && <>
              <label>Find a student<input type="search" value={search} onChange={event => {
                const next = event.target.value
                if (next.trim() !== query) setResult(null)
                setSearch(next)
              }} placeholder="Name, student number, or email" /></label>
              <label>Student<select value={student?.id ?? ''} required onChange={event => {
                setStudent(options.find(item => item.id === event.target.value) ?? null)
              }}>
                <option value="">Choose an active student</option>
                {options.map(item => <option key={item.id} value={item.id}>
                  {item.name ? item.name + ' / ' + item.studentNumber : item.studentNumber}
                </option>)}
              </select></label>
              {!result && <p className="overview-muted" role="status">Searching for active students…</p>}
              {result && 'error' in result && <div className="admin-alert admin-alert-actions" data-tone="error">
                <p role="alert">{result.error}</p>
                <button type="button" className="secondary-button" onClick={() => { setResult(null); setRetry(value => value + 1) }}>Retry</button>
              </div>}
              {result && 'options' in result && !matches.length && <p className="overview-muted" role="status">No active students match this search.</p>}
            </>}
          </>}
        </fieldset>
      </div>
      <div className="workspace-dialog-footer">
        {saveError && <p className="form-error" role="alert">{saveError}</p>}
        {saving && <p className="overview-muted" role="status">Saving quest…</p>}
        <div className="workspace-dialog-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>Cancel</button>
          {initialQuest ? <button className="primary-button" type="submit" disabled={saving}>Save changes</button> : <>
            <button className="secondary-button" type="submit" value="draft" disabled={saving || (individual && !student)}>Save draft</button>
            <button className="primary-button" type="submit" value="publish" disabled={saving || (individual && !student)}>Publish quest</button>
          </>}
        </div>
      </div>
    </form>
  </WorkspaceDialog>
}

export function StudentModal({ user, onClose, onSave }: { user: User; onClose: () => void; onSave: (user: User) => Promise<void> }) {
  const original: StudentFields = { name: user.name, student_number: user.studentNumber, course: user.course, year_level: user.yearLevel, campus: user.campus, section: user.section, goal: user.goal }
  const [draft, setDraft] = useState(original)
  const [status, setStatus] = useState(user.status)
  const [other, setOther] = useState(!(PROGRAMS as readonly string[]).includes(normalizeProgram(user.course)))
  const [options, setOptions] = useState<EnrollmentOption[]>([])
  const [optionError, setOptionError] = useState('')
  const [optionsLoading, setOptionsLoading] = useState(true)
  const [retry, setRetry] = useState(0)
  const busy = useRef(false)
  const [saving,setSaving] = useState(false)
  const [saveError,setSaveError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    setOptionsLoading(true)
    setOptionError('')
    void (async () => {
      try {
        const { data, error } = await supabase.rpc('registration_enrollment_options').abortSignal(controller.signal)
        if (!controller.signal.aborted) { setOptions(data ?? []); setOptionError(error ? 'Could not load school options.' : '') }
      } catch { if (!controller.signal.aborted) setOptionError('Could not load school options.') }
      finally { if (!controller.signal.aborted) setOptionsLoading(false) }
    })()
    return () => controller.abort()
  }, [retry])
  const errors = validateStudent(draft, options, original)
  const change = (field: keyof StudentFields, value: string) => setDraft(previous => ({ ...previous, [field]: value, ...(['course', 'year_level', 'campus'].includes(field) ? { section: '' } : {}) }))
  const message = (field: keyof StudentFields) => errors[field] ? <small role="alert" style={{ color: '#a83434' }}>{errors[field]}</small> : null
  const legacy = (field: keyof StudentFields, values: string[]) => draft[field] === original[field] && draft[field] && !values.includes(draft[field]) ? [draft[field], ...values] : values
  const campuses = legacy('campus', Array.from(new Set(options.map(o => o.campus))).sort())
  const sections = legacy('section', Array.from(new Set(options.filter(o => o.campus === draft.campus && o.course === normalizeProgram(draft.course) && o.year_level === normalizeYear(draft.year_level)).map(o => o.section))).sort())
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy.current || Object.keys(errors).length) return
    const value = studentPayload(draft, original)
    busy.current=true;setSaving(true);setSaveError('')
    try { await onSave({ ...user, ...value, studentNumber: value.student_number, yearLevel: value.year_level, status }) }
    catch(reason) { setSaveError(reason instanceof Error?reason.message:'Could not save this student. Try again.') }
    finally { busy.current=false;setSaving(false) }
  }
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={event => event.stopPropagation()}><button className="modal-close" onClick={onClose} aria-label="Close">{'\u00d7'}</button><span className="eyebrow">STUDENT RECORD</span><h2>Edit student information</h2><p>Required fields use official school information. Unchanged legacy values are preserved.</p>
    {optionError && <div className="admin-alert admin-alert-actions" data-tone="error"><p role="alert">{optionError}</p><button type="button" className="secondary-button" onClick={() => setRetry(n => n + 1)}>Retry</button></div>}
    {saveError && <p className="form-error" role="alert">{saveError}</p>}<form onSubmit={submit}>
      <label>Student number *<input value={draft.student_number} onChange={e => change('student_number', cleanStudentNumber(e.target.value))} inputMode="numeric" maxLength={9} />{message('student_number')}</label>
      <label>Name or nickname<input value={draft.name} onChange={e => change('name', cleanName(e.target.value))} maxLength={30} />{message('name')}</label>
      <label>Email<input type="email" value={user.email} readOnly /></label>
      <label>Course / Program *<select value={other ? 'Others' : normalizeProgram(draft.course)} onChange={e => { setOther(e.target.value === 'Others'); change('course', e.target.value === 'Others' ? '' : e.target.value) }}><option value="">Choose program</option>{[...PROGRAMS, 'Others'].map(value => <option key={value}>{value}</option>)}</select></label>
      {other && <label>Specify program *<input value={draft.course} maxLength={LIMITS.course} onChange={e => change('course', e.target.value)} /></label>}{message('course')}
      <label>Year level *<select value={draft.year_level} onChange={e => change('year_level', e.target.value)}><option value="">Choose year</option>{legacy('year_level', [...YEARS]).map(value => <option key={value}>{value}</option>)}</select>{message('year_level')}</label>
      <label>Campus *<select value={draft.campus} onChange={e => change('campus', e.target.value)}><option value="">Choose campus</option>{campuses.map(value => <option key={value}>{value}</option>)}</select>{message('campus')}</label>
      <label>Section *<select value={draft.section} onChange={e => change('section', e.target.value)}><option value="">Choose section</option>{sections.map(value => <option key={value}>{value}</option>)}</select>{message('section')}</label>
      {optionsLoading && <p className="enrollment-status" role="status">Loading active-semester section options...</p>}
      {!sections.length && !optionsLoading && !optionError && <div className="enrollment-empty"><p>{options.length ? 'No active section matches this program, year, and campus.' : 'No active-semester sections are available.'}</p><button type="button" className="link-button" onClick={() => setRetry(value => value + 1)}>Refresh section options</button></div>}
      <label>Goal *<input value={draft.goal} maxLength={LIMITS.goal} onChange={e => change('goal', e.target.value)} />{message('goal')}</label>
      <label>Status<select value={status} onChange={e => setStatus(e.target.value as User['status'])}><option>Active</option><option>Inactive</option></select></label>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit" disabled={saving || Object.keys(errors).length > 0}>{saving ? 'Saving...' : 'Save student'}</button></div>
    </form></div></div>
}
