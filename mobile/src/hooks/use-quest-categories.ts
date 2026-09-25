import { useEffect, useState } from 'react';
import { supabase } from '@/supabase';
import { useUserData } from '@/hooks/use-user-data';
export type QuestCategory = { id: string; name: string; owner_id: string | null };
export function useQuestCategories() {
  const { user } = useUserData();
  const userId = user?.id;
  const [retry, setRetry] = useState(0);
  const key = (userId ?? 'guest') + ':' + retry;
  const [result, setResult] = useState<{ key: string; categories: QuestCategory[]; error: string | null } | null>(null);
  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const { data, error } = await supabase.from('quest_categories').select('id,name,owner_id').or('owner_id.is.null,owner_id.eq.' + userId).order('name').abortSignal(controller.signal);
        if (!controller.signal.aborted) setResult({ key, categories: error ? [] : data ?? [], error: error ? 'Categories could not be loaded. Please try again.' : null });
      } catch {
        if (!controller.signal.aborted) setResult({ key, categories: [], error: 'Categories could not be loaded. Please try again.' });
      }
    })();
    return () => controller.abort();
  }, [userId, key]);
  const current = result?.key === key ? result : null;
  const categories = current?.categories ?? [];
  const createCategory = async (value: string) => {
    const name = value.trim();
    if (!name || name.length > 40) throw new Error('Use a category name between 1 and 40 characters.');
    if (!userId) throw new Error('Sign in to create a category.');
    const existing = categories.find(c => c.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    if (existing) return existing;
    const { data, error } = await supabase.from('quest_categories').insert({ name, owner_id: userId }).select('id,name,owner_id').single();
    if (error) throw new Error(error.code === '23505' ? 'This category already exists. Reload categories to select it.' : 'Could not create category. Please try again.');
    setResult(previous => previous?.key === key ? { ...previous, categories: [...previous.categories, data].sort((a, b) => a.name.localeCompare(b.name)) } : previous);
    return data as QuestCategory;
  };
  return { categories, loading: !!userId && !current, error: current?.error ?? null, refresh: () => setRetry(value => value + 1), createCategory };
}
