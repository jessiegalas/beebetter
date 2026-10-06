import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { CompletionRecord } from './quest-priority';
import type { ProgressSummary, Quest, UserProfile } from '@/context/user-data-context';

export type WorkspaceSlice = 'profile' | 'streak' | 'progress' | 'quests';
export type WorkspaceErrors = Partial<Record<WorkspaceSlice, string>>;
type HistoryRow = CompletionRecord & { total_count: number };
type SummaryRow = { total_completed: number; academics_completed: number; habits_completed: number; social_completed: number; health_completed: number; total_xp: number; level: number; current_streak: number };
type ReadResult<T> = { data: T | null; failed: boolean };
type WorkspaceInput = { user: Pick<User, 'id' | 'email'>; student: Partial<UserProfile>; isCurrent: () => boolean };
export type WorkspaceRead = {
  slices: WorkspaceSlice[];
  errors: WorkspaceErrors;
  updateProfile: (previous: UserProfile | null) => UserProfile | null;
  quests?: Quest[];
  history?: { rows: CompletionRecord[]; hasMore: boolean };
  progressSummary?: ProgressSummary;
};
const slices: WorkspaceSlice[] = ['profile', 'streak', 'progress', 'quests'];
const messages: Record<WorkspaceSlice, string> = {
  profile: 'Profile refresh failed.', streak: 'Streak refresh failed.', progress: 'Progress refresh failed.', quests: 'Quest refresh failed.',
};

/** Reads only for an already admitted account. The provider owns admission and
 * state; cancel invalidates results even when the transport ignores abortion. */
export function createStudentWorkspaceReader(client: Pick<SupabaseClient, 'from' | 'rpc'>) {
  let owner: string | undefined;
  let generation = 0;
  const pending = new Map<WorkspaceSlice, { task: Promise<unknown>; controller: AbortController }>();
  const cancel = () => {
    generation += 1;
    pending.forEach(value => value.controller.abort());
    pending.clear(); owner = undefined;
  };
  return {
    cancel,
    async read(input: WorkspaceInput, scope: WorkspaceSlice | 'all' = 'all'): Promise<WorkspaceRead | null> {
      if (!input.isCurrent()) return null;
      if (owner !== input.user.id) { cancel(); owner = input.user.id; }
      const version = generation;
      const isCurrent = () => version === generation && input.isCurrent();
      const attempted = scope === 'all' ? slices : [scope];
      const safeRead = async <T,>(operation: () => PromiseLike<{ data: T | null; error: unknown }>): Promise<ReadResult<T>> => {
        try { const result = await operation(); return { data: result.data, failed: !!result.error }; }
        catch { return { data: null, failed: true }; }
      };
      const readSlice = <T,>(slice: WorkspaceSlice, operation: (signal: AbortSignal) => PromiseLike<{ data: T | null; error: unknown }>): Promise<ReadResult<T>> | undefined => {
        if (!attempted.includes(slice)) return undefined;
        const existing = pending.get(slice);
        if (existing) return existing.task as Promise<ReadResult<T>>;
        const controller = new AbortController();
        const task = safeRead(() => operation(controller.signal));
        const entry = { task, controller }; pending.set(slice, entry);
        void task.finally(() => { if (pending.get(slice) === entry) pending.delete(slice); });
        return task;
      };
      // Independent slices start together; a failed query cannot suppress another.
      const [profile, streak, progress, quests] = await Promise.all([
        readSlice<Partial<UserProfile>>('profile', signal => client.from('profiles').select('*').eq('id', input.user.id).abortSignal(signal).maybeSingle()),
        readSlice<number>('streak', signal => client.rpc('student_get_current_streak').abortSignal(signal)),
        readSlice('progress', async signal => {
          const [history, summary] = await Promise.all([
            safeRead<HistoryRow[]>(() => client.rpc('student_list_completion_history', { page_size: 100, page_offset: 0 }).abortSignal(signal)),
            safeRead<SummaryRow[]>(() => client.rpc('student_progress_summary').abortSignal(signal)),
          ]);
          return { data: { history, summary }, error: null };
        }),
        readSlice<Quest[]>('quests', async signal => {
          const rows: Quest[] = [];
          const pageSize = 200;
          while (isCurrent() && !signal.aborted) {
            const result = await client.rpc('student_list_recommendation_candidates', { page_size: pageSize, page_offset: rows.length }).abortSignal(signal);
            if (result.error) return { data: null, error: result.error };
            if (!isCurrent() || signal.aborted) return { data: null, error: 'cancelled' };
            const page = (result.data ?? []) as Quest[];
            rows.push(...page);
            if (page.length < pageSize) return { data: rows, error: null };
          }
          return { data: null, error: 'cancelled' };
        }),
      ]);
      if (!isCurrent()) return null;
      const errors: WorkspaceErrors = {};
      if (profile?.failed) errors.profile = messages.profile;
      if (streak?.failed) errors.streak = messages.streak;
      if (progress?.failed || progress?.data?.history.failed || progress?.data?.summary.failed) errors.progress = messages.progress;
      if (quests?.failed) errors.quests = messages.quests;
      const summary = progress?.data?.summary;
      const summaryRow = !summary?.failed ? summary?.data?.[0] : undefined;
      const history = progress?.data?.history;
      const profileRow = !profile?.failed ? profile?.data : null;
      const student = input.student;
      return {
        slices: attempted,
        errors,
        updateProfile(previous) {
          let next = previous;
          if (profile) {
            next = {
              id: input.user.id,
              display_name: profileRow?.display_name ?? student.name ?? null,
              student_number: student.student_number ?? 'LEGACY-' + input.user.id.replaceAll('-', '').slice(0, 8).toUpperCase(),
              name: student.name ?? profileRow?.display_name ?? input.user.email?.split('@')[0] ?? 'Bee Explorer',
              email: student.email ?? input.user.email ?? '', course: student.course ?? 'Undeclared',
              year_level: student.year_level ?? 'Not specified', section: student.section ?? 'Not specified', campus: student.campus ?? 'Not specified',
              goal: student.goal ?? '', status: 'Active',
              level: profileRow?.level ?? previous?.level ?? 1, total_xp: profileRow?.total_xp ?? previous?.total_xp ?? 0,
              current_streak: profileRow?.current_streak ?? previous?.current_streak ?? 0,
              created_at: profileRow?.created_at ?? student.created_at ?? new Date().toISOString(),
              updated_at: profileRow?.updated_at ?? student.updated_at ?? new Date().toISOString(),
            };
          }
          if (next && !streak?.failed && typeof streak?.data === 'number') next = { ...next, current_streak: streak.data };
          if (next && summaryRow) next = { ...next, total_xp: Number(summaryRow.total_xp), level: Number(summaryRow.level), current_streak: Number(summaryRow.current_streak) };
          return next;
        },
        ...(!quests?.failed && quests?.data ? { quests: quests.data } : {}),
        ...(history && !history.failed ? { history: { rows: history.data ?? [], hasMore: Number(history.data?.[0]?.total_count ?? 0) > (history.data?.length ?? 0) } } : {}),
        ...(summaryRow ? { progressSummary: { totalCompleted: Number(summaryRow.total_completed), byCategory: {
          Academics: Number(summaryRow.academics_completed), Habits: Number(summaryRow.habits_completed), Social: Number(summaryRow.social_completed), Health: Number(summaryRow.health_completed),
        } } } : {}),
      };
    },
  };
}
