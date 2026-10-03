import { supabase } from './supabase';
import type { Admin, PageResult, Quest, QuestDraft, QuestListQuery, StudentListQuery, User } from './admin-types';

export async function listStudents(query: StudentListQuery): Promise<PageResult<User>> {
  const { data,error }=await supabase.rpc('admin_list_students_page',{page_size:query.pageSize,page_offset:query.page*query.pageSize,search_query:query.search.trim()||null,status_filter:query.status==='All'?null:query.status});
  if(error) throw error;
  const rows=(data??[]).map((student: any):User=>({id:student.id,studentNumber:student.student_number,name:student.name||student.email?.split('@')[0]||'Bee Explorer',email:student.email||'No email',course:student.course,yearLevel:student.year_level,section:student.section,campus:student.campus,goal:student.goal,joined:new Date(student.created_at).toLocaleDateString(undefined,{month:'short',day:'2-digit',year:'numeric'}),quests:String(student.quests_completed),status:student.status}));
  return {rows,total:Number(data?.[0]?.total_count??0)};
}
export async function listQuests(query: QuestListQuery):Promise<PageResult<Quest>> {
  const {data,error}=await supabase.rpc('admin_list_quests_page',{
    page_size:query.pageSize,
    page_offset:query.page*query.pageSize,
    search_query:query.search.trim()||null,
    status_filter:query.status==='All'?null:query.status,
    difficulty_filter:query.difficulty==='All'?null:query.difficulty,
  });
  if(error) throw error;
  const rows=(data??[]).map((quest:any):Quest=>({id:quest.id,ownerId:quest.owner_id,title:quest.title,description:quest.description??'',category:quest.category,xp:quest.xp,difficulty:quest.xp>=50?'Hard':quest.xp>=30?'Medium':'Easy',completions:String(quest.completions??0),status:quest.status,assignee:quest.assignee}));
  return {rows,total:Number(data?.[0]?.total_count??0)};
}
export async function listAdmins():Promise<Admin[]> { const {data,error}=await supabase.rpc('super_admin_list_admins'); if(error) throw error; return (data??[]).map((a:any)=>({id:a.id,email:a.email,displayName:a.display_name||a.email,role:a.role,isActive:a.is_active,createdAt:new Date(a.created_at).toLocaleDateString()})); }

export async function listAdminAccessRequests(): Promise<import('./admin-types').AdminAccessRequest[]> {
  const { data, error } = await supabase.rpc('super_admin_list_access_requests');
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.request_id,
    userId: row.user_id,
    email: row.email || '',
    displayName: row.display_name || row.email || 'New administrator',
    submittedAt: new Date(row.submitted_at).toLocaleDateString(),
  }));
}
export async function reviewAdminAccessRequest(requestId: string, approve: boolean): Promise<void> {
  const { error } = await supabase.rpc('super_admin_review_access_request', {
    request_id_value: requestId,
    approve_value: approve,
  });
  if (error) throw error;
}

export const questXp=(difficulty:QuestDraft['difficulty'])=>difficulty==='Hard'?60:difficulty==='Medium'?35:20;
export async function searchActiveStudents(search:string):Promise<Pick<User,'id'|'name'|'studentNumber'>[]> { const {data,error}=await supabase.rpc('admin_search_active_students',{search_query:search.trim()||null,result_limit:50}); if(error)throw error; return (data??[]).map((row:any)=>({id:row.id,name:row.name,studentNumber:row.student_number})); }
