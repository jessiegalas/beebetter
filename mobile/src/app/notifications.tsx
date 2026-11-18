import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Button, IconButton, ScreenHeader, Surface } from '@/components/mobile-ui';
import { CategoryBadge, QuestStatus, questVisualState } from '@/components/quest-visuals';
import { PixelGlyph } from '@/components/pixel/pixel-glyph';
import { XpBadge } from '@/components/xp-visuals';
import type { CompletionReceipt } from '@/lib/quest-completion';
import { ThemedText } from '@/components/themed-text';
import { useBeePalette, useBeeStyles, type BeePalette, ContentColumn, Radii, SectionColumn, Spacing, Typography } from '@/constants/theme';
import { useUserData, type Quest } from '@/hooks/use-user-data';
import { prerequisiteMessage } from '@/lib/quest-context';
import { calculateLevel, completionFeedback } from '@/lib/progression';
import { useQuestBrowsing } from '@/hooks/use-quest-browsing';
import { questNeedsOpen, retryQuestNotifications, useQuestNotificationStatus } from '@/lib/quest-notifications';

const dateLabel = (value: string) => new Date(value).toLocaleString(undefined, {
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const statusCopy = {
  checking: 'Checking notification setup', ready: 'Push registered on this device',
  denied: 'Notifications are turned off', unavailable: 'Push reminders are available on Android',
  error: 'Push setup needs attention' };

export default function NotificationsScreen() {
  const COLORS = useBeePalette();
  const styles = useBeeStyles(makeStyles);
  const { user, completionHistory, completeQuest, refresh, isLoading, isRefreshing, workspaceErrors, retryWorkspace } = useUserData();
  const error = workspaceErrors.quests;
  const { items } = useQuestBrowsing();
  const status = useQuestNotificationStatus();
  const busy = useRef(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [feedback, setFeedback] = useState<CompletionReceipt | null>(null);
  const rewardLevel = feedback?.status === 'completed' ? calculateLevel(feedback.total_xp).level : null;
  const levelChanged = feedback?.status === 'completed' && rewardLevel !== null && rewardLevel > calculateLevel(feedback.total_xp - feedback.awarded_xp).level;
  const active = items.filter(item => item.quest.status === 'active');
  const open = (quest: Quest) => router.push({ pathname: '/quests', params: { questId: quest.id } });
  const act = async (quest: Quest) => {
    if (questNeedsOpen(quest)) { open(quest); return; }
    if (busy.current) return;
    busy.current = true;
    setCompletingId(quest.id);
    setFeedback(null);
    try {
      const result = await completeQuest(quest.id);
      if (result.success) setFeedback(result.receipt);
      else Alert.alert('Could not complete quest', result.error || 'Please try again.', [
        { text: 'Dismiss', style: 'cancel' }, { text: 'Open', onPress: () => open(quest) },
      ]);
    } finally { busy.current = false; setCompletingId(null); }
  };
  const retry = async () => {
    if (retrying || !user) return;
    setRetrying(true);
    try {
      if (status === 'denied') { await Linking.openSettings(); return; }
      await retryQuestNotifications(user.id);
    } catch { Alert.alert('Push setup unavailable', 'Check your connection and try again. If this continues, the app notification service may need configuration.'); }
    finally { setRetrying(false); }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader title="Notifications" subtitle="A little nudge toward your next win." style={styles.header}
          trailing={<IconButton icon="close" label="Close notifications" onPress={() => router.back()} />} />
        <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void refresh()} tintColor={COLORS.honeyDark} />}>
          <View style={styles.statusCard}>
            <Ionicons name={status === 'ready' ? 'notifications-outline' : 'notifications-off-outline'} size={22} color={COLORS.honeyDeep} />
            <View style={styles.copy}>
              <ThemedText style={styles.cardTitle}>{statusCopy[status]}</ThemedText>
              <ThemedText style={styles.detail}>At scheduled start, one hour before a deadline, and when you enter a saved quest location.</ThemedText>
            </View>
            {Platform.OS === 'android' && status !== 'ready' && (
              <Button intent="quiet" label={status === 'denied' ? 'Settings' : 'Retry'}
                accessibilityLabel={status === 'denied' ? 'Open notification settings' : 'Retry notification setup'} loading={retrying} onPress={() => void retry()} />
            )}
          </View>
          {feedback && <View style={[styles.success, feedback.status === 'already_completed' && styles.neutralFeedback]} accessibilityLiveRegion="polite" accessible accessibilityLabel={completionFeedback(feedback)}>
            {feedback.status === 'completed' && <PixelGlyph name="leaf" />}
            <View style={styles.copy}>
              <ThemedText style={styles.feedback}>{feedback.status === 'completed' ? 'Quest complete' : completionFeedback(feedback)}</ThemedText>
              {feedback.status === 'completed' && <XpBadge xp={feedback.awarded_xp} earned />}
              {levelChanged && <ThemedText style={styles.feedback}>You reached Level {rewardLevel}!</ThemedText>}
            </View>
          </View>}
          {feedback && workspaceErrors.progress && <Button label="Refresh progress" intent="quiet" onPress={() => void retryWorkspace('progress')} />}
          <View style={styles.sectionHeading}><ThemedText style={styles.sectionTitle}>Your quests</ThemedText><ThemedText style={styles.count}>{active.length} active</ThemedText></View>
          <ThemedText style={styles.hint}>Complete a simple quest here. Open quests that need proof or a prerequisite check.</ThemedText>
          {isLoading && <ActivityIndicator color={COLORS.honeyDark} accessibilityLabel="Loading quests" />}
          {error && <View><ThemedText style={styles.error}>{error}</ThemedText><Button intent="quiet" label="Retry quests" onPress={() => void retryWorkspace('quests')} /></View>}
          {!isLoading && !error && active.length === 0 && (
            <View style={styles.empty}><Ionicons name="checkmark-done-outline" size={32} color={COLORS.success} /><ThemedText style={styles.cardTitle}>All clear for now</ThemedText><ThemedText style={styles.detail}>Your active quests will appear here.</ThemedText></View>
          )}
          {active.map(({ quest, nearby, locked, prerequisiteState, prerequisiteTitle }) => {
            const needsOpen = questNeedsOpen(quest);
            const working = completingId === quest.id;
            const prerequisiteWarning = prerequisiteMessage(prerequisiteState, prerequisiteTitle);
            const state = questVisualState(quest.status, locked || !!prerequisiteWarning, quest.requires_proof);
            return (
              <Surface key={quest.id}>
                <View style={styles.row}>
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel={'Open ' + quest.title} onPress={() => open(quest)} style={styles.copy}>
                    <ThemedText style={styles.cardTitle}>{quest.title}</ThemedText>
                    <CategoryBadge label={quest.category} />
                    <XpBadge xp={quest.xp} />
                  </TouchableOpacity>
                  <Button intent={needsOpen ? 'secondary' : 'accent'} label={needsOpen ? 'Open' : 'Complete'}
                    accessibilityLabel={(needsOpen ? 'Open ' : 'Complete ') + quest.title} loading={working}
                    disabled={!!completingId && !working} onPress={() => void act(quest)} />
                </View>
                <View style={styles.meta}>
                  {nearby && <ThemedText style={styles.tag}>Nearby</ThemedText>}
                  {state !== 'available' && <QuestStatus state={state} explanation={state === 'locked' ? prerequisiteWarning : undefined} />}
                  {state === 'locked' && quest.requires_proof && <QuestStatus state="proof" />}
                </View>
                {quest.scheduled_at && <ThemedText style={styles.detail}>Starts {dateLabel(quest.scheduled_at)}</ThemedText>}
                {quest.deadline_at && <ThemedText style={styles.detail}>Due {dateLabel(quest.deadline_at)}</ThemedText>}
                {!quest.scheduled_at && !quest.deadline_at && <ThemedText style={styles.detail}>No timed reminder set</ThemedText>}
              </Surface>
            );
          })}
          {workspaceErrors.progress && <View><ThemedText style={styles.error}>{workspaceErrors.progress}</ThemedText><Button intent="quiet" label="Retry activity history" onPress={() => void retryWorkspace('progress')} /></View>}
          {completionHistory.length > 0 && <>
            <ThemedText style={styles.sectionTitle}>Recent activity</ThemedText>
            {completionHistory.slice(0, 5).map(item => <View key={item.id} style={styles.activity}>
              <Ionicons name="checkmark-circle-outline" size={23} color={COLORS.success} />
              <View style={styles.copy}><ThemedText style={styles.cardTitle}>{item.title}</ThemedText><ThemedText style={styles.detail}>Completed · {dateLabel(item.completed_at)}</ThemedText></View>
            </View>)}
          </>}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
const makeStyles = (COLORS: BeePalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' }, safeArea: { flex: 1 },
  header: { ...ContentColumn, paddingVertical: Spacing.lg },
  content: SectionColumn,
  statusCard: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.md, backgroundColor: COLORS.surface, borderRadius: Radii.lg, padding: Spacing.gutter },
  copy: { flex: 1, minWidth: 100 }, cardTitle: { ...Typography.item, color: COLORS.ink }, detail: { ...Typography.metadata, color: COLORS.muted, marginTop: Spacing.xs },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.sm },
  sectionTitle: { ...Typography.section, color: COLORS.ink, marginTop: Spacing.sm }, count: { ...Typography.metadata, color: COLORS.muted }, hint: { ...Typography.metadata, color: COLORS.muted },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.md },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm }, tag: { ...Typography.metadata, color: COLORS.honeyDeep, backgroundColor: COLORS.surfaceWarm, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs, borderRadius: Radii.sm },
  activity: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.lg, backgroundColor: COLORS.card, borderRadius: Radii.md },
  empty: { padding: Spacing.section, gap: Spacing.sm, alignItems: 'center', backgroundColor: COLORS.card, borderRadius: Radii.lg },
  neutralFeedback: { backgroundColor: COLORS.surfaceMuted },
  success: { padding: Spacing.lg, flexDirection: 'row', gap: Spacing.sm, backgroundColor: COLORS.mint, borderRadius: Radii.md }, feedback: { ...Typography.metadata, flex: 1, color: COLORS.ink }, error: { ...Typography.metadata, color: COLORS.danger } });
