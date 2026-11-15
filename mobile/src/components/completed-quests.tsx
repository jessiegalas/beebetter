import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, View } from 'react-native';
import { Button, StatusMessage, Surface } from '@/components/mobile-ui';
import { CategoryBadge } from '@/components/quest-visuals';
import { PixelGlyph } from '@/components/pixel/pixel-glyph';
import { ThemedText } from '@/components/themed-text';
import { Layout, Spacing } from '@/constants/theme';
import type { CompletionRecord } from '@/lib/student-workspace';
import { supabase } from '@/supabase';

const PAGE_SIZE = 50;

export function useCompletedCategories(enabled: boolean) {
  const [labels, setLabels] = useState<string[]>([]);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void (async () => {
      setError(false);
      try {
        const result = await supabase.rpc('student_list_completed_quest_categories').abortSignal(controller.signal);
        if (result.error) throw result.error;
        if (!controller.signal.aborted) setLabels(result.data ?? []);
      } catch {
        if (!controller.signal.aborted) setError(true);
      }
    })();
    return () => controller.abort();
  }, [enabled, attempt]);
  return { labels, error, retry: () => setAttempt(value => value + 1) };
}

export function CompletedQuests({ category, revision }: { category: string | null; revision?: string }) {
  const [rows, setRows] = useState<CompletionRecord[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<'first' | 'more' | null>(null);
  const active = useRef<AbortController | null>(null);

  const load = useCallback(async (cursor?: CompletionRecord) => {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setLoading(true);
    setFailed(null);
    try {
      const result = await supabase.rpc('student_list_completed_quests', {
        page_size: PAGE_SIZE + 1,
        category_value: category,
        before_completed_at: cursor?.completed_at ?? null,
        before_id: cursor?.id ?? null,
      }).abortSignal(controller.signal);
      if (result.error) throw result.error;
      if (controller.signal.aborted) return;
      const page = (result.data ?? []) as CompletionRecord[];
      setRows(previous => cursor ? [...previous, ...page.slice(0, PAGE_SIZE)] : page.slice(0, PAGE_SIZE));
      setHasMore(page.length > PAGE_SIZE);
    } catch {
      if (!controller.signal.aborted) setFailed(cursor ? 'more' : 'first');
    } finally {
      if (active.current === controller) {
        active.current = null;
        setLoading(false);
      }
    }
  }, [category]);

  useEffect(() => {
    let current = true;
    void Promise.resolve().then(() => { if (current) void load(); });
    return () => {
      current = false;
      active.current?.abort();
      active.current = null;
    };
  }, [load, revision]);

  const retry = () => void load(failed === 'more' ? rows.at(-1) : undefined);
  return <FlatList<CompletionRecord> style={{ flex: 1 }} data={rows} keyExtractor={row => row.id}
    contentContainerStyle={{ width: '100%', maxWidth: Layout.maxContentWidth, alignSelf: 'center', padding: Spacing.gutter, gap: Spacing.sm }}
    renderItem={({ item }) => <Surface>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
        <PixelGlyph name="leaf" />
        <ThemedText type="item" style={{ flexShrink: 1 }}>{item.title}</ThemedText>
      </View>
      <CategoryBadge label={item.category} />
      <ThemedText type="small">{new Date(item.completed_at).toLocaleDateString()}</ThemedText>
    </Surface>}
    ListEmptyComponent={!loading && !failed ? <StatusMessage message="No completed quests in this view." /> : null}
    ListFooterComponent={<View>
      {loading && <StatusMessage loading message="Loading completed quests…" />}
      {failed && <StatusMessage error message="Could not load completed quests.">
        <Button label="Retry completed quests" onPress={retry} />
      </StatusMessage>}
      {!loading && !failed && hasMore && <Button label="Load more completed quests" intent="secondary" onPress={() => void load(rows.at(-1))} />}
    </View>} />;
}
