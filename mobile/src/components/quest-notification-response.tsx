import { useEffect, useRef } from 'react';
import { Alert, Platform } from 'react-native';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useUserData } from '@/context/user-data-context';
import { COMPLETE_QUEST_ACTION, OPEN_QUEST_ACTION } from '@/lib/quest-notifications';
import { supabase } from '@/supabase';

/** Handles both warm taps and the notification that launched the app. */
export function QuestNotificationResponse() {
  const response = Notifications.useLastNotificationResponse();
  const { user, access, isLoading, refresh } = useUserData();
  const userId = user?.id;
  const handled = useRef(new Set<string>());
  useEffect(() => {
    if (Platform.OS !== 'android' || !response || access !== 'active' || !userId || isLoading) return;
    const { questId, ownerId, notificationId } = response.notification.request.content.data ?? {};
    const action = response.actionIdentifier;
    const handledResponses = handled.current;
    const key = `${notificationId ?? response.notification.request.identifier}:${action}`;
    if (handledResponses.has(key)) return;
    handledResponses.add(key);
    // Clear after work, so the hook does not cancel its own async handler.
    if (ownerId !== userId || typeof questId !== 'string' ||
      ![COMPLETE_QUEST_ACTION, OPEN_QUEST_ACTION, Notifications.DEFAULT_ACTION_IDENTIFIER].includes(action)) {
      void Notifications.clearLastNotificationResponseAsync().catch(() => {});
      return;
    }
    let current = true;
    let finished = false;
    const open = () => router.push({ pathname: '/quests', params: { questId } });
    void (async () => {
      const { data: quest, error } = await supabase.from('quests')
        .select('id,status,requires_proof,prerequisite_quest_id').eq('id', questId).eq('owner_id', userId).maybeSingle();
      if (!current) return;
      if (error) throw error;
      if (!quest) { Alert.alert('Quest unavailable', 'This quest was removed or is no longer available.'); return; }
      if (action !== COMPLETE_QUEST_ACTION || quest.requires_proof || quest.status !== 'active') {
        if (quest.status === 'completed') Alert.alert('Already complete', 'This quest has already been completed.');
        else { await refresh(); if (current) open(); }
        return;
      }
      if (quest.prerequisite_quest_id) {
        const { data: prerequisite, error: prerequisiteError } = await supabase.from('quests')
          .select('status').eq('id', quest.prerequisite_quest_id).eq('owner_id', userId).maybeSingle();
        if (!current) return;
        if (prerequisiteError) throw prerequisiteError;
        if (prerequisite?.status !== 'completed') { await refresh(); if (current) open(); return; }
      }
      const { error: completionError } = await supabase.rpc('complete_quest', {
        quest_id_value: questId, proof_path_value: null, proof_mime_type_value: null,
      });
      if (!current) return;
      if (completionError) throw completionError;
      Alert.alert('Quest complete', 'Your progress has been saved.');
      await Notifications.dismissNotificationAsync(response.notification.request.identifier).catch(() => {});
      await refresh();
    })().catch(() => {
      if (current) Alert.alert('Could not complete this action', 'Check your connection and open the quest to try again.', [
        { text: 'Dismiss', style: 'cancel' }, { text: 'Open', onPress: open },
      ]);
    }).finally(() => {
      if (current) { finished = true; void Notifications.clearLastNotificationResponseAsync().catch(() => {}); }
    });
    return () => {
      current = false;
      // React effect replay or a session refresh must not lose an unfinished action.
      if (!finished) handledResponses.delete(key);
    };
  }, [response, access, userId, isLoading, refresh]);
  return null;
}
