export type Section = 'Overview' | 'Students' | 'Quests' | 'Semesters & Sections' | 'Support Requests' | 'Admins';
export type User = { id: string; studentNumber: string; name: string; email: string; course: string; yearLevel: string; section: string; campus: string; goal: string; joined: string; quests: string; status: 'Active' | 'Inactive' };
export type QuestDraft = { title: string; description: string; category: 'Academics' | 'Habits' | 'Social' | 'Health'; difficulty: 'Easy' | 'Medium' | 'Hard'; assigneeId: string | null; publish: boolean };
export type Quest = { id: string; ownerId: string; title: string; description: string; category: QuestDraft['category']; xp: number; difficulty: QuestDraft['difficulty']; completions: string; status: 'active' | 'pending' | 'completed' | 'rejected'; assignee: string };
export type Admin = { id: string; email: string; displayName: string; role: 'admin' | 'super_admin'; isActive: boolean; createdAt: string };
export type AdminAccessRequest = { id: string; userId: string; email: string; displayName: string; submittedAt: string };
export type AdminIdentity = { id: string; name: string; email: string };
export type PageResult<T> = { rows: T[]; total: number };
export type StudentListQuery = { page: number; pageSize: number; search: string; status: 'All' | 'Active' | 'Inactive' };
export type QuestListQuery = {
  page: number;
  pageSize: number;
  search: string;
  status: 'All' | Quest['status'];
  difficulty: 'All' | QuestDraft['difficulty'];
};
