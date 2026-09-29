import { supabase } from './supabase'

export type SemesterStatus='draft'|'active'|'archived'
export type AcademicSemester={
  id:string; academicYear:string; term:string; status:SemesterStatus;
  activatedAt:string|null; archivedAt:string|null; createdAt:string;
  sectionCount:number; studentCount:number
}
export type SemesterSection={
  id:string; course:string; yearLevel:string; campus:string; section:string;
  isActive:boolean; studentCount:number; createdAt:string; updatedAt:string
}
const semester=(row:any):AcademicSemester=>({
  id:row.id,academicYear:row.academic_year,term:row.term,status:row.status,
  activatedAt:row.activated_at,archivedAt:row.archived_at,createdAt:row.created_at,
  sectionCount:Number(row.section_count),studentCount:Number(row.student_count),
})
const section=(row:any):SemesterSection=>({
  id:row.id,course:row.course,yearLevel:row.year_level,campus:row.campus,section:row.section,
  isActive:row.is_active,studentCount:Number(row.student_count),createdAt:row.created_at,updatedAt:row.updated_at,
})
export async function listSemesters():Promise<AcademicSemester[]>{const{data,error}=await supabase.rpc('admin_list_semesters');if(error)throw error;return(data??[]).map(semester)}
export async function listSemesterSections(id:string):Promise<SemesterSection[]>{const{data,error}=await supabase.rpc('admin_list_semester_sections',{semester_id_value:id});if(error)throw error;return(data??[]).map(section)}
export async function createSemester(academicYear:string,term:string){const{error}=await supabase.rpc('admin_create_semester',{academic_year_value:academicYear,term_value:term});if(error)throw error}
export async function activateSemester(id:string){const{error}=await supabase.rpc('admin_activate_semester',{semester_id_value:id});if(error)throw error}
export async function archiveSemester(id:string){const{error}=await supabase.rpc('admin_archive_semester',{semester_id_value:id});if(error)throw error}
export async function createSemesterSection(semesterId:string,input:Omit<SemesterSection,'id'|'isActive'|'studentCount'|'createdAt'|'updatedAt'>){
  const{error}=await supabase.rpc('admin_create_semester_section',{semester_id_value:semesterId,course_value:input.course,year_level_value:input.yearLevel,campus_value:input.campus,section_value:input.section});if(error)throw error
}
export async function updateSemesterSection(input:SemesterSection){
  const{error}=await supabase.rpc('admin_update_semester_section',{section_id_value:input.id,course_value:input.course,year_level_value:input.yearLevel,campus_value:input.campus,section_value:input.section,active_value:input.isActive});if(error)throw error
}
export async function removeSemesterSection(id:string){const{data,error}=await supabase.rpc('admin_remove_semester_section',{section_id_value:id});if(error)throw error;return data as 'archived'|'deleted'}
