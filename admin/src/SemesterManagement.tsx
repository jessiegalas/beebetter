import { type FormEvent, useEffect, useState } from 'react'
import {
  activateSemester,archiveSemester,createSemester,createSemesterSection,listSemesters,
  listSemesterSections,removeSemesterSection,updateSemesterSection,
  type AcademicSemester,type SemesterSection,
} from './semester-data'

const YEARS=['1st Year','2nd Year','3rd Year','4th Year','5th Year']
const emptySection={course:'BSCS',yearLevel:'1st Year',campus:'',section:''}

export function SemesterManagement(){
  const[semesters,setSemesters]=useState<AcademicSemester[]>([])
  const[selectedId,setSelectedId]=useState('')
  const[sections,setSections]=useState<SemesterSection[]>([])
  const[loading,setLoading]=useState(true)
  const[sectionsLoading,setSectionsLoading]=useState(false)
  const[working,setWorking]=useState(false)
  const[error,setError]=useState('')
  const[notice,setNotice]=useState('')
  const[academicYear,setAcademicYear]=useState('')
  const[term,setTerm]=useState('1st Semester')
  const[draft,setDraft]=useState(emptySection)
  const[editingId,setEditingId]=useState<string|null>(null)
  const selected=semesters.find(item=>item.id===selectedId)??null
  const editable=selected?.status!=='archived'

  const loadSemesters=async(preferred?:string)=>{
    setLoading(true);setError('')
    try{
      const rows=await listSemesters();setSemesters(rows)
      setSelectedId(current=>preferred??(rows.some(item=>item.id===current)?current:(rows.find(item=>item.status==='active')??rows[0])?.id??''))
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not load semesters');setSemesters([])}
    finally{setLoading(false)}
  }
  const loadSections=async(id:string)=>{
    setSectionsLoading(true);setError('')
    try{setSections(await listSemesterSections(id))}
    catch(reason){setError(reason instanceof Error?reason.message:'Could not load sections');setSections([])}
    finally{setSectionsLoading(false)}
  }
  useEffect(()=>{void loadSemesters()},[])
  useEffect(()=>{if(selectedId)void loadSections(selectedId);else setSections([])},[selectedId])
  const perform=async(action:()=>Promise<unknown>,success:string)=>{
    if(working)return false
    setWorking(true)
    setError('');setNotice('')
    try{await action();if(success)setNotice(success);await loadSemesters(selectedId);if(selectedId)await loadSections(selectedId);return true}
    catch(reason){setError(reason instanceof Error?reason.message:'The operation could not be completed');return false}
    finally{setWorking(false)}
  }
  const submitSemester=(event:FormEvent)=>{
    event.preventDefault()
    void perform(()=>createSemester(academicYear,term),'Draft semester created.').then(saved=>{if(saved){setAcademicYear('');setTerm('1st Semester')}})
  }
  const submitSection=(event:FormEvent)=>{
    event.preventDefault()
    if(!selected)return
    const operation=editingId
      ? updateSemesterSection({...sections.find(item=>item.id===editingId)!,...draft})
      : createSemesterSection(selected.id,draft)
    void perform(()=>operation,editingId?'Section updated.':'Section added.').then(saved=>{if(saved){setDraft(emptySection);setEditingId(null)}})
  }
  const beginEdit=(item:SemesterSection)=>{setEditingId(item.id);setDraft({course:item.course,yearLevel:item.yearLevel,campus:item.campus,section:item.section})}
  const activate=()=>{if(selected&&window.confirm(`Activate ${selected.academicYear} / ${selected.term}? The current active semester will be archived.`))void perform(()=>activateSemester(selected.id),'Semester activated and the previous active semester archived.')}
  const archive=()=>{if(selected&&window.confirm(`Archive ${selected.academicYear} / ${selected.term}? Registration will not use its sections.`))void perform(()=>archiveSemester(selected.id),'Semester archived.')}
  const remove=(item:SemesterSection)=>{if(!working&&window.confirm(`Remove section ${item.section}? Associated sections will be archived instead of deleted.`))void (async()=>{setWorking(true);setError('');setNotice('');try{const result=await removeSemesterSection(item.id);setNotice(result==='archived'?'Section has associations and was deactivated.':'Section deleted.');await loadSemesters(selectedId);await loadSections(selectedId)}catch(reason){setError(reason instanceof Error?reason.message:'The section could not be removed')}finally{setWorking(false)}})()}
  const toggle=(item:SemesterSection)=>{if(window.confirm(`${item.isActive?'Deactivate':'Reactivate'} section ${item.section}?`))void perform(()=>updateSemesterSection({...item,isActive:!item.isActive}),`Section ${item.isActive?'deactivated':'reactivated'}.`)}

  return <div className="semester-layout">
    <section className="panel">
      <div className="panel-heading"><div><h2>Academic semesters</h2><p>One semester can be active. Archived semesters remain read-only.</p></div><button className="secondary-button" onClick={()=>void loadSemesters()}>Refresh</button></div>
      {error&&<div className="case-notice semester-error" role="alert">{error}</div>}
      {notice&&<div className="case-notice" role="status">{notice}</div>}
      {working&&<div className="case-notice" role="status">Saving changes...</div>}
      <form className="semester-create" onSubmit={submitSemester}>
        <label>Academic year<input required maxLength={30} value={academicYear} onChange={e=>setAcademicYear(e.target.value)} placeholder="AY 2026-2027"/></label>
        <label>Term<input required maxLength={40} value={term} onChange={e=>setTerm(e.target.value)} placeholder="1st Semester"/></label>
        <button className="primary-button" disabled={working||!academicYear.trim()||!term.trim()}>Create draft</button>
      </form>
      {loading?<div className="empty-state">Loading semesters...</div>:semesters.length===0?<div className="empty-state">No semesters configured.</div>:<div className="semester-list">{semesters.map(item=><button key={item.id} className={selectedId===item.id?'semester-card selected':'semester-card'} onClick={()=>setSelectedId(item.id)}>
        <span><b>{item.academicYear}</b><small>{item.term}</small></span><span className={`status ${item.status==='active'?'active':item.status==='draft'?'draft':'inactive'}`}>{item.status}</span>
        <small>{item.sectionCount} sections / {item.studentCount} students</small>
      </button>)}</div>}
    </section>
    <section className="panel">
      {!selected?<div className="empty-state">Select a semester to manage its sections.</div>:<>
        <div className="panel-heading"><div><h2>{selected.academicYear} / {selected.term}</h2><p>{selected.status==='active'?'Active registration semester':selected.status==='draft'?'Draft - add sections before activation':'Archived historical semester - read only'}</p></div><div className="semester-actions">{selected.status==='draft'&&<button disabled={working} className="primary-button" onClick={activate}>Activate</button>}{selected.status!=='archived'&&<button disabled={working} className="secondary-button" onClick={archive}>Archive</button>}</div></div>
        {editable&&<form className="section-form" onSubmit={submitSection}>
          <label>Course<input required maxLength={60} value={draft.course} onChange={e=>setDraft({...draft,course:e.target.value})}/></label>
          <label>Year level<select value={draft.yearLevel} onChange={e=>setDraft({...draft,yearLevel:e.target.value})}>{YEARS.map(value=><option key={value}>{value}</option>)}</select></label>
          <label>Campus<input required maxLength={80} value={draft.campus} onChange={e=>setDraft({...draft,campus:e.target.value})}/></label>
          <label>Section<input required maxLength={30} value={draft.section} onChange={e=>setDraft({...draft,section:e.target.value})}/></label>
          <div className="semester-actions">{editingId&&<button disabled={working} type="button" className="secondary-button" onClick={()=>{setEditingId(null);setDraft(emptySection)}}>Cancel edit</button>}<button disabled={working} className="primary-button">{editingId?'Save section':'Add section'}</button></div>
        </form>}
        {sectionsLoading?<div className="empty-state">Loading sections...</div>:sections.length===0?<div className="empty-state">No sections in this semester. Sections are never copied automatically.</div>:<div className="section-list">
          <div className="section-row section-header"><span>COURSE / YEAR</span><span>CAMPUS</span><span>SECTION</span><span>ASSOCIATIONS</span><span>ACTIONS</span></div>
          {sections.map(item=><div className="section-row" key={item.id}><span><b>{item.course}</b><small>{item.yearLevel}</small></span><span>{item.campus}</span><span><b>{item.section}</b>{!item.isActive&&<small>Inactive</small>}</span><span>{item.studentCount} student{item.studentCount===1?'':'s'}</span><span className="semester-actions">{editable&&<><button disabled={working} className="link-button" onClick={()=>beginEdit(item)}>Edit</button><button disabled={working} className="link-button" onClick={()=>toggle(item)}>{item.isActive?'Deactivate':'Reactivate'}</button><button disabled={working} className="link-button danger-text" onClick={()=>remove(item)}>Remove</button></>}</span></div>)}
        </div>}
      </>}
    </section>
  </div>
}
