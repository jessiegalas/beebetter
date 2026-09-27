import { PROGRAMS, YEARS, LIMITS, cleanName, cleanStudentNumber, normalizeProgram, normalizeYear, validateStudent, studentPayload, type StudentFields, type EnrollmentOption } from '../../mobile/src/lib/student-validation'
import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { supabase } from './supabase'
import type { Admin, Quest, QuestDraft, User } from './admin-types'
import { searchActiveStudents } from './admin-data'
import { initials } from './AdminShell'
import { Status } from './AdminTables'

export function AdminModal({ onClose, onSave }: { onClose: () => void; onSave: (id: string, role: Admin['role']) => Promise<void> }) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    void onSave(String(data.get('userId') || ''), String(data.get('role')) as Admin['role'])
  }
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={onClose}>×</button><span className="eyebrow">ADMIN ACCESS</span><h2>Add an admin</h2><p>The user must already exist in Supabase Authentication.</p><form onSubmit={submit}><label>Auth user UUID<input name="userId" required placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" /></label><label>Role<select name="role" defaultValue="admin"><option value="admin">Admin</option><option value="super_admin">Super Admin</option></select></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit">Grant access</button></div></form></div></div>
}

function Drawer({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return <div className="drawer-backdrop" onClick={onClose}><aside className="drawer" onClick={(event) => event.stopPropagation()}><button className="drawer-close" onClick={onClose}>×</button>{children}</aside></div>
}

export function UserDetails({ user, onClose, onEdit, onToggleStatus }: { user: User; onClose: () => void; onEdit: () => void; onToggleStatus: () => void }) {
  return <Drawer onClose={onClose}><span className="eyebrow">STUDENT PROFILE</span><div className="drawer-avatar">{initials(user.name)}</div><h2>{user.name}</h2><p className="drawer-muted">{user.email}</p><Status status={user.status} /><div className="detail-grid"><div><small>STUDENT NUMBER</small><b>{user.studentNumber}</b></div><div><small>COURSE</small><b>{user.course}</b></div><div><small>YEAR / SECTION</small><b>{user.yearLevel} / {user.section}</b></div><div><small>CAMPUS</small><b>{user.campus}</b></div><div><small>GOAL</small><b>{user.goal || 'No goal set'}</b></div><div><small>QUESTS COMPLETED</small><b>{user.quests}</b></div></div><h3>Admin actions</h3><button className="drawer-action" onClick={onEdit}>Edit student information</button><button className="drawer-action danger" onClick={onToggleStatus}>{user.status === 'Active' ? 'Set account inactive' : 'Reactivate account'}</button></Drawer>
}

function questStatusLabel(status: Quest['status']) {
  return status === 'active' ? 'Published' : status === 'pending' ? 'Draft' : status === 'completed' ? 'Completed' : 'Rejected'
}

export function QuestDetails({ quest, onClose, onEdit }: { quest: Quest; onClose: () => void; onEdit: () => void }) {
  const editable = quest.status === 'active' || quest.status === 'pending'
  return <Drawer onClose={onClose}><span className="eyebrow">QUEST DETAILS</span><div className="drawer-quest-icon">Q</div><h2>{quest.title}</h2><p className="drawer-muted">{quest.description || 'No description provided.'}</p><p className="drawer-muted">{quest.category} / {quest.difficulty} / {quest.xp} XP</p><Status status={questStatusLabel(quest.status)} /><div className="detail-grid"><div><small>COMPLETION</small><b>{quest.completions === '1' ? 'Completed' : 'Not completed'}</b></div><div><small>ASSIGNED TO</small><b>{quest.assignee}</b></div></div><h3>Quest actions</h3>{editable ? <button className="drawer-action" onClick={onEdit}>Edit this assignment</button> : <p className="drawer-muted">Completed and rejected assignments cannot be edited.</p>}</Drawer>
}

export function UserActions({ user, onClose, onOpenProfile, onToggleStatus }: { user: User; onClose: () => void; onOpenProfile: () => void; onToggleStatus: () => void }) {
  return <Drawer onClose={onClose}><span className="eyebrow">USER ACTIONS</span><h2>{user.name}</h2><p className="drawer-muted">Choose an available account-management action.</p><button className="drawer-action" onClick={onOpenProfile}>View profile</button><button className="drawer-action danger" onClick={onToggleStatus}>{user.status === 'Active' ? 'Set account inactive' : 'Reactivate account'}</button></Drawer>
}

export function QuestModal({ initialQuest, users, onClose, onSave }: { initialQuest: Quest | null; users: User[]; onClose: () => void; onSave: (quest: QuestDraft) => Promise<void> }) {
  const editing = Boolean(initialQuest)
  const [assigneeSearch,setAssigneeSearch]=useState('')
  const [assigneeOptions,setAssigneeOptions]=useState(users.filter(user=>user.status==='Active').map(user=>({id:user.id,name:user.name,studentNumber:user.studentNumber})))
  const [assigneeError,setAssigneeError]=useState('')
  useEffect(()=>{ if(editing)return; const timer=setTimeout(()=>{void searchActiveStudents(assigneeSearch).then(setAssigneeOptions).catch(reason=>setAssigneeError(reason instanceof Error?reason.message:'Could not search students.'))},300); return()=>clearTimeout(timer) },[assigneeSearch,editing])
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const submitter = (event.nativeEvent as SubmitEvent).submitter
    void onSave({
      title: String(data.get('title')),
      description: String(data.get('description') || ''),
      category: String(data.get('category')) as QuestDraft['category'],
      difficulty: String(data.get('difficulty')) as QuestDraft['difficulty'],
      assigneeId: editing ? initialQuest!.ownerId : String(data.get('assignee') || '') || null,
      publish: editing ? data.get('status') === 'active' : submitter?.getAttribute('value') === 'publish',
    })
  }
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={onClose}>x</button><span className="eyebrow">QUEST STUDIO</span><h2>{editing ? 'Edit quest assignment' : 'Create a new quest'}</h2><p>{editing ? `Update the assignment for ${initialQuest!.assignee}. This will not create another quest.` : "Create a quest that appears in the selected student's mobile quest board."}</p><form onSubmit={submit}><label>Quest title<input name="title" required maxLength={100} defaultValue={initialQuest?.title} placeholder="e.g. Take a mindful break" /></label><label>Description<textarea name="description" rows={3} defaultValue={initialQuest?.description} placeholder="What should the student do?" /></label>{editing ? <div className="assignment-note">Assigned to {initialQuest!.assignee}</div> : <><label>Find a student<input value={assigneeSearch} onChange={event=>setAssigneeSearch(event.target.value)} placeholder="Name, student number, or email" /></label>{assigneeError&&<small className="form-error">{assigneeError}</small>}<label>Send this quest to<select name="assignee" defaultValue=""><option value="">Everyone</option>{assigneeOptions.map((user) => <option key={user.id} value={user.id}>{user.name} / {user.studentNumber}</option>)}</select></label><div className="assignment-note">Search returns up to 50 active students. Everyone assigns one copy to every active student account.</div></>}<label>Category<select name="category" defaultValue={initialQuest?.category || 'Habits'}><option>Academics</option><option>Habits</option><option>Social</option><option>Health</option></select></label><label>Difficulty<select name="difficulty" defaultValue={initialQuest?.difficulty || 'Easy'}><option>Easy</option><option>Medium</option><option>Hard</option></select></label>{editing ? <label>Status<select name="status" defaultValue={initialQuest?.status === 'active' ? 'active' : 'pending'}><option value="pending">Draft</option><option value="active">Published</option></select></label> : null}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button>{editing ? <button className="primary-button" type="submit">Save changes</button> : <><button className="secondary-button" type="submit" value="draft">Save draft</button><button className="primary-button" type="submit" value="publish">Publish quest</button></>}</div></form></div></div>
}

export function StudentModal({ user, onClose, onSave }: { user: User; onClose: () => void; onSave: (user: User) => void }) {
  const original: StudentFields = { name: user.name, student_number: user.studentNumber, course: user.course, year_level: user.yearLevel, campus: user.campus, section: user.section, goal: user.goal }
  const [draft, setDraft] = useState(original)
  const [status, setStatus] = useState(user.status)
  const [other, setOther] = useState(!(PROGRAMS as readonly string[]).includes(normalizeProgram(user.course)))
  const [options, setOptions] = useState<EnrollmentOption[]>([])
  const [optionError, setOptionError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      try {
        const { data, error } = await supabase.from('student_enrollment_options').select('id,course,year_level,campus,section').order('campus').order('section').abortSignal(controller.signal)
        if (!controller.signal.aborted) { setOptions(data ?? []); setOptionError(error ? 'Could not load school options.' : '') }
      } catch { if (!controller.signal.aborted) setOptionError('Could not load school options.') }
    })()
    return () => controller.abort()
  }, [retry])
  const errors = validateStudent(draft, options, original)
  const change = (field: keyof StudentFields, value: string) => setDraft(previous => ({ ...previous, [field]: value, ...(['course', 'year_level', 'campus'].includes(field) ? { section: '' } : {}) }))
  const message = (field: keyof StudentFields) => errors[field] ? <small role="alert" style={{ color: '#a83434' }}>{errors[field]}</small> : null
  const legacy = (field: keyof StudentFields, values: string[]) => draft[field] === original[field] && draft[field] && !values.includes(draft[field]) ? [draft[field], ...values] : values
  const campuses = legacy('campus', Array.from(new Set(options.map(o => o.campus))).sort())
  const sections = legacy('section', Array.from(new Set(options.filter(o => o.campus === draft.campus && o.course === normalizeProgram(draft.course) && o.year_level === normalizeYear(draft.year_level)).map(o => o.section))).sort())
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (Object.keys(errors).length) return
    const value = studentPayload(draft, original)
    onSave({ ...user, ...value, studentNumber: value.student_number, yearLevel: value.year_level, status })
  }
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={event => event.stopPropagation()}><button className="modal-close" onClick={onClose} aria-label="Close">{'\u00d7'}</button><span className="eyebrow">STUDENT RECORD</span><h2>Edit student information</h2><p>Required fields use official school information. Unchanged legacy values are preserved.</p>
    {optionError && <p role="alert">{optionError} <button type="button" onClick={() => setRetry(n => n + 1)}>Retry</button></p>}
    <form onSubmit={submit}>
      <label>Student number *<input value={draft.student_number} onChange={e => change('student_number', cleanStudentNumber(e.target.value))} inputMode="numeric" maxLength={9} />{message('student_number')}</label>
      <label>Full name *<input value={draft.name} onChange={e => change('name', cleanName(e.target.value))} maxLength={30} />{message('name')}</label>
      <label>Email<input type="email" value={user.email} readOnly /></label>
      <label>Course / Program *<select value={other ? 'Others' : normalizeProgram(draft.course)} onChange={e => { setOther(e.target.value === 'Others'); change('course', e.target.value === 'Others' ? '' : e.target.value) }}><option value="">Choose program</option>{[...PROGRAMS, 'Others'].map(value => <option key={value}>{value}</option>)}</select></label>
      {other && <label>Specify program *<input value={draft.course} maxLength={LIMITS.course} onChange={e => change('course', e.target.value)} /></label>}{message('course')}
      <label>Year level *<select value={draft.year_level} onChange={e => change('year_level', e.target.value)}><option value="">Choose year</option>{legacy('year_level', [...YEARS]).map(value => <option key={value}>{value}</option>)}</select>{message('year_level')}</label>
      <label>Campus *<select value={draft.campus} onChange={e => change('campus', e.target.value)}><option value="">Choose campus</option>{campuses.map(value => <option key={value}>{value}</option>)}</select>{message('campus')}</label>
      <label>Section *<select value={draft.section} onChange={e => change('section', e.target.value)}><option value="">Choose section</option>{sections.map(value => <option key={value}>{value}</option>)}</select>{message('section')}</label>
      {!sections.length && <p>No sections configured for this combination. Update student_enrollment_options in Supabase with approved school values.</p>}
      <label>Goal *<input value={draft.goal} maxLength={LIMITS.goal} onChange={e => change('goal', e.target.value)} />{message('goal')}</label>
      <label>Status<select value={status} onChange={e => setStatus(e.target.value as User['status'])}><option>Active</option><option>Inactive</option></select></label>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit" disabled={Object.keys(errors).length > 0}>Save student</button></div>
    </form></div></div>
}
