import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Button } from '@/components/mobile-ui';
import { ThemedText } from '@/components/themed-text';
import { useBeePalette, useBeeStyles, type BeePalette, Radii } from '@/constants/theme';
import { useUserData, type Quest } from '@/hooks/use-user-data';
import { useQuestPriority } from '@/context/quest-priority-context';
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
  const { ranked } = useQuestPriority();
  const status = useQuestNotificationStatus();
  const busy = useRef(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const active = ranked.filter(item => item.quest.status === 'active');
  const open = (quest: Quest) => router.push({ pathname: '/quests', params: { questId: quest.id } });
  const act = async (quest: Quest) => {
    if (questNeedsOpen(quest)) { open(quest); return; }
    if (busy.current) return;
    busy.current = true;
    setCompletingId(quest.id);
    setFeedback(null);
    try {
      const result = await completeQuest(quest.id);
      if (result.success) setFeedback('Quest complete. Your progress has been saved.');
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
        <View style={styles.header}>
          <View style={styles.copy}><ThemedText style={styles.title}>Notifications</ThemedText><ThemedText style={styles.subtitle}>A little nudge toward your next win.</ThemedText></View>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close notifications" style={styles.close} onPress={() => router.back()}>
            <Ionicons name="close" size={22} color={COLORS.ink} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void refresh()} tintColor={COLORS.honeyDark} />}>
          <View style={styles.statusCard}>
            <Ionicons name={status === 'ready' ? 'notifications-outline' : 'notifications-off-outline'} size={22} color={COLORS.honeyDeep} />
            <View style={styles.copy}>
              <ThemedText style={styles.cardTitle}>{statusCopy[status]}</ThemedText>
              <ThemedText style={styles.detail}>At scheduled start, one hour before a deadline, and when you enter a saved quest location.</ThemedText>
            </View>
            {Platform.OS === 'android' && status !== 'ready' && (
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={status === 'denied' ? 'Open notification settings' : 'Retry notification setup'} disabled={retrying} onPress={() => void retry()} style={styles.secondaryButton}>
                {retrying ? <ActivityIndicator color={COLORS.honeyDeep} /> : <ThemedText style={styles.buttonText}>{status === 'denied' ? 'Settings' : 'Retry'}</ThemedText>}
              </TouchableOpacity>
            )}
          </View>
          {feedback && <View style={styles.success} accessibilityLiveRegion="polite"><Ionicons name="checkmark-circle" size={20} color={COLORS.success} /><ThemedText style={styles.feedback}>{feedback}</ThemedText></View>}
          <View style={styles.sectionHeading}><ThemedText style={styles.sectionTitle}>Your quests</ThemedText><ThemedText style={styles.count}>{active.length} active</ThemedText></View>
          <ThemedText style={styles.hint}>Complete a simple quest here. Open quests that need proof or a prerequisite check.</ThemedText>
          {isLoading && <ActivityIndicator color={COLORS.honeyDark} accessibilityLabel="Loading quests" />}
          {error && <View><ThemedText style={styles.error}>{error}</ThemedText><Button intent="quiet" label="Retry quests" onPress={() => void retryWorkspace('quests')} /></View>}
          {!isLoading && !error && active.length === 0 && (
            <View style={styles.empty}><Ionicons name="checkmark-done-outline" size={32} color={COLORS.success} /><ThemedText style={styles.cardTitle}>All clear for now</ThemedText><ThemedText style={styles.detail}>Your active quests will appear here.</ThemedText></View>
          )}
          {active.map(({ quest, nearby }) => {
            const needsOpen = questNeedsOpen(quest);
            const working = completingId === quest.id;
            return (
              <View key={quest.id} style={styles.questCard}>
                <View style={styles.row}>
                  <View style={[styles.icon, nearby && styles.nearbyIcon]}><Ionicons name={nearby ? 'location-outline' : quest.requires_proof ? 'attach-outline' : 'flag-outline'} size={22} color={COLORS.honeyDeep} /></View>
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel={'Open ' + quest.title} onPress={() => open(quest)} style={styles.copy}>
                    <ThemedText style={styles.cardTitle}>{quest.title}</ThemedText>
                    <ThemedText style={styles.detail}>{quest.category} · +{quest.xp} XP</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel={(needsOpen ? 'Open ' : 'Complete ') + quest.title} accessibilityState={{ disabled: !!completingId, busy: working }} disabled={!!completingId} onPress={() => void act(quest)} style={[styles.action, needsOpen && styles.openAction, !!completingId && styles.disabled]}>
                    {working ? <ActivityIndicator color={COLORS.honeyDeep} /> : <ThemedText style={[styles.buttonText, !needsOpen && { color: '#2D241D' }]}>{needsOpen ? 'Open' : 'Complete'}</ThemedText>}
                  </TouchableOpacity>
                </View>
                <View style={styles.meta}>
                  {nearby && <ThemedText style={styles.tag}>Nearby</ThemedText>}
                  {quest.requires_proof && <ThemedText style={styles.tag}>Proof required</ThemedText>}
                  {!!quest.prerequisite_quest_id && <ThemedText style={styles.tag}>Prerequisite check</ThemedText>}
                </View>
                {quest.scheduled_at && <ThemedText style={styles.detail}>Starts {dateLabel(quest.scheduled_at)}</ThemedText>}
                {quest.deadline_at && <ThemedText style={styles.detail}>Due {dateLabel(quest.deadline_at)}</ThemedText>}
                {!quest.scheduled_at && !quest.deadline_at && <ThemedText style={styles.detail}>No timed reminder set</ThemedText>}
              </View>
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
  container: { flex: 1, backgroundColor: COLORS.background }, safeArea: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 20, paddingVertical: 16 },
  title: { fontSize: 28, fontWeight: '700', color: COLORS.ink , lineHeight: 34}, subtitle: { fontSize: 14, color: COLORS.muted, marginTop: 4 , lineHeight: 20},
  close: { minWidth: 44, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: Radii.md, backgroundColor: COLORS.card },
  content: { paddingHorizontal: 20, paddingBottom: 40, gap: 32, width: '100%', maxWidth: 720, alignSelf: 'center' },
  statusCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.honeySoft, borderRadius: 24, padding: 20 },
  copy: { flex: 1, minWidth: 100 }, cardTitle: { color: COLORS.ink, fontSize: 17, fontWeight: '700' , lineHeight: 24}, detail: { color: COLORS.muted, fontSize: 14, lineHeight: 20, marginTop: 3 },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: COLORS.ink, marginTop: 8 , lineHeight: 28}, count: { color: COLORS.muted, fontSize: 14 , lineHeight: 20}, hint: { color: COLORS.muted, fontSize: 14, lineHeight: 20 },
  questCard: { backgroundColor: COLORS.card, borderRadius: 24, padding: 20 }, row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  icon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.honeySoft }, nearbyIcon: { backgroundColor: COLORS.mint },
  action: { backgroundColor: COLORS.honey, minHeight: 48, minWidth: 80, paddingHorizontal: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  openAction: { backgroundColor: COLORS.surfaceWarm }, secondaryButton: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 8 }, buttonText: { color: COLORS.honeyDeep, fontSize: 14, fontWeight: '700' , lineHeight: 20}, disabled: { opacity: 0.5 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }, tag: { color: COLORS.honeyDeep, backgroundColor: COLORS.surfaceWarm, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, fontSize: 14 , lineHeight: 20},
  activity: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: COLORS.card, borderRadius: Radii.md },
  empty: { padding: 28, gap: 8, alignItems: 'center', backgroundColor: COLORS.card, borderRadius: Radii.lg },
  success: { padding: 14, flexDirection: 'row', gap: 8, backgroundColor: COLORS.mint, borderRadius: Radii.md }, feedback: { flex: 1, fontSize: 14, color: COLORS.ink , lineHeight: 20}, error: { color: COLORS.danger, fontSize: 14 , lineHeight: 20} });
