import { supabase } from './supabase';
import type { Admin, PageResult, Quest, QuestDraft, User } from './admin-types';

export async function listStudents(page: number,pageSize: number,search: string,filter: string): Promise<PageResult<User>> {
  const { data,error }=await supabase.rpc('admin_list_students_page',{page_size:pageSize,page_offset:page*pageSize,search_query:search.trim()||null,status_filter:filter==='All'?null:filter});
  if(error) throw error;
  const rows=(data??[]).map((student: any):User=>({id:student.id,studentNumber:student.student_number,name:student.name||student.email?.split('@')[0]||'Bee Explorer',email:student.email||'No email',course:student.course,yearLevel:student.year_level,section:student.section,campus:student.campus,goal:student.goal,joined:new Date(student.created_at).toLocaleDateString(undefined,{month:'short',day:'2-digit',year:'numeric'}),quests:String(student.quests_completed),status:student.status}));
  return {rows,total:Number(data?.[0]?.total_count??0)};
}
export async function listQuests(page:number,pageSize:number,search:string,filter:string):Promise<PageResult<Quest>> {
  const status=['active','pending','completed','rejected'].includes(filter)?filter:null;
  const difficulty=['Easy','Medium','Hard'].includes(filter)?filter:null;
  const {data,error}=await supabase.rpc('admin_list_quests_page',{page_size:pageSize,page_offset:page*pageSize,search_query:search.trim()||null,status_filter:status,difficulty_filter:difficulty});
  if(error) throw error;
  const rows=(data??[]).map((quest:any):Quest=>({id:quest.id,ownerId:quest.owner_id,title:quest.title,description:quest.description??'',category:quest.category,xp:quest.xp,difficulty:quest.xp>=50?'Hard':quest.xp>=30?'Medium':'Easy',completions:String(quest.completions??0),status:quest.status,assignee:quest.assignee}));
  return {rows,total:Number(data?.[0]?.total_count??0)};
}
export async function listAdmins():Promise<Admin[]> { const {data,error}=await supabase.rpc('super_admin_list_admins'); if(error) throw error; return (data??[]).map((a:any)=>({id:a.id,email:a.email,displayName:a.display_name||a.email,role:a.role,isActive:a.is_active,createdAt:new Date(a.created_at).toLocaleDateString()})); }
export const questXp=(difficulty:QuestDraft['difficulty'])=>difficulty==='Hard'?60:difficulty==='Medium'?35:20;
export async function searchActiveStudents(search:string):Promise<Pick<User,'id'|'name'|'studentNumber'>[]> { const {data,error}=await supabase.rpc('admin_search_active_students',{search_query:search.trim()||null,result_limit:50}); if(error)throw error; return (data??[]).map((row:any)=>({id:row.id,name:row.name,studentNumber:row.student_number})); }
