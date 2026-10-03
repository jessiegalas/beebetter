import { type FormEvent, useEffect, useRef, useState } from 'react'
import {
  activateSemester,archiveSemester,createSemester,createSemesterSection,listSemesters,
  listSemesterSections,removeSemesterSection,updateSemesterSection,
  type AcademicSemester,type SemesterSection,
} from './semester-data'

const YEARS=['1st Year','2nd Year','3rd Year','4th Year','5th Year']
const CAMPUS='Cavite State University Bacoor City Campus'
const currentYear=Number(new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'Asia/Manila'}).format(new Date()))
const defaultAcademicYear=`${currentYear}-${currentYear+1}`
const academicYearChoices=Array.from({length:9},(_,index)=>`${currentYear-3+index}-${currentYear-2+index}`)
const positiveSection=/^[1-9][0-9]{0,29}$/
const emptySection={course:'BSCS',yearLevel:'1st Year',campus:CAMPUS,section:''}

export function SemesterManagement(){
  const[semesters,setSemesters]=useState<AcademicSemester[]>([])
  const[selectedId,setSelectedId]=useState('')
  const[sections,setSections]=useState<SemesterSection[]>([])
  const[loading,setLoading]=useState(true)
  const[sectionsLoading,setSectionsLoading]=useState(false)
  const[working,setWorking]=useState(false)
  const[error,setError]=useState('')
  const[notice,setNotice]=useState('')
  const[academicYear,setAcademicYear]=useState(defaultAcademicYear)
  const[term,setTerm]=useState('1st Semester')
  const[draft,setDraft]=useState(emptySection)
  const[editingId,setEditingId]=useState<string|null>(null)
  const semesterRequest=useRef(0)
  const sectionRequest=useRef(0)
  const mounted=useRef(true)
  const busy=useRef(false)
  const[sectionsForId,setSectionsForId]=useState('')
  const selected=semesters.find(item=>item.id===selectedId)??null
  const editable=!!selected&&selected.status!=='archived'
  const sectionsReady=sectionsForId===selectedId&&!sectionsLoading&&!loading
  const activeSectionCount=sectionsReady?sections.filter(item=>item.isActive).length:0
  const registrationSemester=semesters.find(item=>item.status==='active')
  const editing=sections.find(item=>item.id===editingId)
  const lockedLabels=!!editing&&editing.studentCount>0
  const legacySection=!!editing&&!positiveSection.test(editing.section)
  const yearChoices=[...new Set([...academicYearChoices,...semesters.map(item=>item.academicYear).filter(value=>/^[0-9]{4}-[0-9]{4}$/.test(value))])].sort()

  const loadSemesters=async(preferred?:string)=>{
    const request=++semesterRequest.current
    setLoading(true);setError('')
    try{
      const rows=await listSemesters();if(request!==semesterRequest.current)return;setSemesters(rows)
      setSelectedId(current=>preferred??(rows.some(item=>item.id===current)?current:(rows.find(item=>item.status==='active')??rows[0])?.id??''))
    }catch(reason){if(request!==semesterRequest.current)return;setError(reason instanceof Error?reason.message:'Could not load semesters')}
    finally{if(request===semesterRequest.current)setLoading(false)}
  }
  const loadSections=async(id:string)=>{
    const request=++sectionRequest.current
    setSectionsForId('')
    if(!id){setSections([]);setSectionsLoading(false);return}
    setSections([]);setSectionsLoading(true);setError('')
    try{const rows=await listSemesterSections(id);if(request===sectionRequest.current){setSections(rows);setSectionsForId(id)}}
    catch(reason){if(request!==sectionRequest.current)return;setError(reason instanceof Error?reason.message:'Could not load sections');setSections([])}
    finally{if(request===sectionRequest.current)setSectionsLoading(false)}
  }
  useEffect(()=>{
    mounted.current=true
    void loadSemesters()
    return()=>{mounted.current=false;semesterRequest.current++;sectionRequest.current++}
  },[])
  useEffect(()=>{
    setEditingId(null);setDraft(emptySection)
    void loadSections(selectedId)
    return()=>{sectionRequest.current++}
  },[selectedId])
  const perform=async(action:()=>Promise<unknown>,success:string)=>{
    if(busy.current)return false
    busy.current=true
    setWorking(true)
    setError('');setNotice('')
    try{await action();if(!mounted.current)return false;if(success)setNotice(success);await loadSemesters(selectedId);if(mounted.current&&selectedId)await loadSections(selectedId);return mounted.current}
    catch(reason){if(mounted.current)setError(reason instanceof Error?reason.message:'The operation could not be completed');return false}
    finally{busy.current=false;if(mounted.current)setWorking(false)}
  }
  const submitSemester=(event:FormEvent)=>{
    event.preventDefault()
    void perform(()=>createSemester(academicYear,term),'Draft semester created.').then(saved=>{if(saved){setAcademicYear(defaultAcademicYear);setTerm('1st Semester')}})
  }
  const submitSection=(event:FormEvent)=>{
    event.preventDefault()
    if(!selected||!editable||!sectionsReady||busy.current)return
    if(editingId&&!editing){setError('This section is no longer available. Refresh and select it again.');return}
    if((!editing||draft.section!==editing.section)&&!positiveSection.test(draft.section)){setError('Enter a positive whole section number, up to 30 digits.');return}
    void perform(()=>editing
      ? updateSemesterSection({...editing,...draft})
      : createSemesterSection(selected.id,draft),editingId?'Section updated.':'Section added.').then(saved=>{if(saved){setDraft(emptySection);setEditingId(null)}})
  }
  const beginEdit=(item:SemesterSection)=>{setEditingId(item.id);setDraft({course:item.course,yearLevel:item.yearLevel,campus:item.campus,section:item.section})}
  const activate=()=>{if(selected&&sectionsReady&&activeSectionCount>0&&window.confirm(`Activate ${selected.academicYear} / ${selected.term}? Registration will use only this semester's ${activeSectionCount} active section(s). The current active semester will be archived.`))void perform(()=>activateSemester(selected.id),'Semester activated. Registration now uses its active sections; the previous active semester was archived.')}
  const archive=()=>{if(selected&&window.confirm(`Archive ${selected.academicYear} / ${selected.term}? ${selected.status==='active'?'Student registration will have no sections until another semester is activated.':'Registration will not use its sections.'}`))void perform(()=>archiveSemester(selected.id),'Semester archived.')}
  const remove=(item:SemesterSection)=>{if(!busy.current&&window.confirm(`Remove section ${item.section}? Associated sections will be archived instead of deleted.`))void perform(async()=>{const result=await removeSemesterSection(item.id);if(mounted.current)setNotice(result==='archived'?'Section has associations and was deactivated.':'Section deleted.')},'')}
  const toggle=(item:SemesterSection)=>{if(window.confirm(`${item.isActive?'Deactivate':'Reactivate'} section ${item.section}?`))void perform(()=>updateSemesterSection({...item,isActive:!item.isActive}),`Section ${item.isActive?'deactivated':'reactivated'}.`)}

  return <div className="semester-layout">
    <section className="panel">
      <div className="panel-heading"><div><h2>Academic semesters</h2><p>One semester can be active. Archived semesters remain read-only.</p></div><button className="secondary-button" disabled={working||loading||sectionsLoading} onClick={()=>{void loadSemesters();void loadSections(selectedId)}}>Refresh</button></div>
      {!loading&&<p className="enrollment-status"><strong>Active registration semester: </strong>{registrationSemester?`${registrationSemester.academicYear} / ${registrationSemester.term}. Student registration uses its active sections.`:'None. Add sections to a draft and activate it to make student registration available.'}</p>}
      {error&&<div className="case-notice semester-error" role="alert">{error}</div>}
      {notice&&<div className="case-notice" role="status">{notice}</div>}
      {working&&<div className="case-notice" role="status">Saving changes...</div>}
      <h3>Choose a semester to manage</h3>
      <p>Selection opens its sections below. It does not change the active registration semester.</p>
      {loading?<div className="empty-state">Loading semesters...</div>:semesters.length===0?<div className="empty-state">No semesters configured.</div>:<div className="semester-list">{semesters.map(item=><button key={item.id} aria-pressed={selectedId===item.id} className={selectedId===item.id?'semester-card selected':'semester-card'} disabled={working} onClick={()=>setSelectedId(item.id)}>
        <span><b>{item.academicYear}</b><small>{item.term}</small></span><span className={`status ${item.status==='active'?'active':item.status==='draft'?'draft':'inactive'}`}>{item.status}</span>
        <small>{item.sectionCount} sections / {item.studentCount} associated students{selectedId===item.id?' · Selected for management':''}</small>
      </button>)}</div>}
      <h3>Create a draft semester</h3>
      <form className="semester-create" onSubmit={submitSemester}>
        <label>Academic year<select required name="academicYear" value={academicYear} onChange={e=>setAcademicYear(e.target.value)}>{yearChoices.map(value=><option key={value}>{value}</option>)}</select></label>
        <label>Term<input required name="term" autoComplete="off" maxLength={40} value={term} onChange={e=>setTerm(e.target.value)} placeholder="1st Semester"/></label>
        <button className="primary-button" disabled={working||!academicYear.trim()||!term.trim()}>Create draft</button>
      </form>
    </section>
    <section className="panel">
      {!selected?<div className="empty-state">Select a semester to manage its sections.</div>:<>
        <div className="panel-heading"><div><h2>Sections for {selected.academicYear} / {selected.term}</h2><p>{selected.status==='active'?'Active registration semester':selected.status==='draft'?'Draft - add sections before activation':'Archived historical semester - read only'}</p></div><div className="semester-actions">{selected.status==='draft'&&<button disabled={working||!sectionsReady||activeSectionCount===0} className="primary-button" onClick={activate}>Activate</button>}{selected.status!=='archived'&&<button disabled={working} className="secondary-button" onClick={archive}>Archive</button>}</div></div>
        {selected.status==='draft'&&sectionsReady&&activeSectionCount===0&&<p className="enrollment-status" role="status">Add at least one active section before activation. Registration will only offer the sections configured for the active semester.</p>}{editable&&<form className="section-form" onSubmit={submitSection}>
          <label>Course<input required name="course" autoComplete="off" readOnly={lockedLabels} maxLength={60} value={draft.course} onChange={e=>setDraft({...draft,course:e.target.value})}/></label>
          <label>Year level<select name="yearLevel" disabled={lockedLabels} value={draft.yearLevel} onChange={e=>setDraft({...draft,yearLevel:e.target.value})}>{[...new Set([...YEARS,draft.yearLevel])].map(value=><option key={value}>{value}</option>)}</select></label>
          <label>Campus<input name="campus" readOnly value={draft.campus}/></label>
          <label>Section<input required name="section" autoComplete="off" type={legacySection?'text':'number'} min={legacySection?undefined:1} step={legacySection?undefined:1} inputMode={legacySection?undefined:'numeric'} readOnly={lockedLabels||legacySection} value={draft.section} onChange={e=>setDraft({...draft,section:e.target.value})}/></label>
          {(lockedLabels||legacySection)&&<p className="enrollment-status">Historical section labels are preserved. To change them, deactivate this section and add a replacement.</p>}
          <div className="semester-actions">{editingId&&<button disabled={working} type="button" className="secondary-button" onClick={()=>{setEditingId(null);setDraft(emptySection)}}>Cancel edit</button>}<button disabled={working||!sectionsReady} className="primary-button">{editingId?'Save section':'Add section'}</button></div>
        </form>}
        {sectionsLoading?<div className="empty-state">Loading sections...</div>:sections.length===0?<div className="empty-state">No sections in this semester. Sections are never copied automatically.</div>:<div className="section-list">
          <div className="section-row section-header"><span>COURSE / YEAR</span><span>CAMPUS</span><span>SECTION</span><span>ASSOCIATIONS</span><span>ACTIONS</span></div>
          {sections.map(item=><div className="section-row" key={item.id}><span><b>{item.course}</b><small>{item.yearLevel}</small></span><span>{item.campus}</span><span><b>{item.section}</b>{!item.isActive&&<small>Inactive</small>}</span><span>{item.studentCount} student{item.studentCount===1?'':'s'}</span><span className="semester-actions">{editable&&<><button disabled={working} className="link-button" onClick={()=>beginEdit(item)}>Edit</button><button disabled={working} className="link-button" onClick={()=>toggle(item)}>{item.isActive?'Deactivate':'Reactivate'}</button><button disabled={working} className="link-button danger-text" onClick={()=>remove(item)}>Remove</button></>}</span></div>)}
        </div>}
      </>}
    </section>
  </div>
}
