import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { InlineMessage, PrivacyNote, WellnessHeader } from '@/components/wellness-ui';
import { BeeBetterColors as COLORS, BeeBetterShadow, MaxContentWidth, Radii } from '@/constants/theme';
import { useUserData } from '@/hooks/use-user-data';
import { listMyCheckIns, listMyReflections, type SelfManagementReflection, type WellbeingCheckIn } from '@/lib/wellbeing-data';

type ViewMode = 'check-ins' | 'reflections';

export default function WellnessHistoryScreen() {
  const { user, quests } = useUserData();
  const [mode, setMode] = useState<ViewMode>('check-ins');
  const [checkIns, setCheckIns] = useState<WellbeingCheckIn[]>([]);
  const [reflections, setReflections] = useState<SelfManagementReflection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (refresh = false) => {
    if (!user) { setLoading(false); return; }
    if (refresh) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const [nextCheckIns, nextReflections] = await Promise.all([listMyCheckIns(user.id), listMyReflections(user.id)]);
      setCheckIns(nextCheckIns);
      setReflections(nextReflections);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not load your private history.');
    } finally { setLoading(false); setRefreshing(false); }
  }, [user]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const averages = useMemo(() => {
    if (!checkIns.length) return null;
    const average = (key: 'overall_wellbeing' | 'stress_level' | 'energy_level') =>
      checkIns.reduce((sum, record) => sum + record[key], 0) / checkIns.length;
    return { wellbeing: average('overall_wellbeing'), stress: average('stress_level'), energy: average('energy_level') };
  }, [checkIns]);

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <WellnessHeader title="My private history" subtitle="Review your check-ins and self-management reflections" />
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} colors={[COLORS.honeyDark]} tintColor={COLORS.honeyDark} />}>
          <PrivacyNote>Only you can open these individual entries. Trend scores summarize your own responses and are not clinical assessments.</PrivacyNote>
          <View style={styles.tabs}>
            {(['check-ins', 'reflections'] as const).map(value => <TouchableOpacity key={value} style={[styles.tab, mode === value && styles.tabSelected]} onPress={() => setMode(value)} accessibilityRole="tab" accessibilityState={{ selected: mode === value }}><Ionicons name={value === 'check-ins' ? 'pulse-outline' : 'compass-outline'} size={17} color={mode === value ? COLORS.honeyDeep : COLORS.muted} /><ThemedText style={[styles.tabText, mode === value && styles.tabTextSelected]}>{value === 'check-ins' ? 'Check-ins' : 'Reflections'}</ThemedText></TouchableOpacity>)}
          </View>
          {error ? <><InlineMessage message={error} tone="error" /><TouchableOpacity style={styles.retryButton} onPress={() => void load()}><ThemedText style={styles.retryText}>Try again</ThemedText></TouchableOpacity></> : loading ? <View style={styles.loading}><ActivityIndicator color={COLORS.honeyDark} /><ThemedText style={styles.body}>Loading your history…</ThemedText></View> : mode === 'check-ins' ? (
            checkIns.length ? <>
              {averages && <View style={styles.trendCard}><View style={styles.sectionHeading}><View><ThemedText style={styles.sectionTitle}>Your trend snapshot</ThemedText><ThemedText style={styles.body}>Average across {checkIns.length} check-in{checkIns.length === 1 ? '' : 's'}</ThemedText></View><Ionicons name="stats-chart-outline" size={22} color={COLORS.honeyDeep} /></View><View style={styles.averageRow}><AverageStat label="Well-being" value={averages.wellbeing} tone={COLORS.honey} /><AverageStat label="Stress" value={averages.stress} tone={COLORS.lavender} /><AverageStat label="Energy" value={averages.energy} tone={COLORS.mint} /></View><ThemedText style={styles.disclaimer}>Higher stress means greater reported stress. These patterns help with personal reflection and do not diagnose a condition.</ThemedText></View>}
              <View style={styles.sectionHeading}><ThemedText style={styles.sectionTitle}>Recent check-ins</ThemedText><ThemedText style={styles.count}>{checkIns.length} total</ThemedText></View>
              {checkIns.map(record => <CheckInCard key={record.id} record={record} />)}
            </> : <EmptyState icon="pulse-outline" title="No check-ins yet" body="When you choose to check in, your entries and personal trends will appear here." />
          ) : reflections.length ? <>
            <View style={styles.sectionHeading}><ThemedText style={styles.sectionTitle}>Your reflections</ThemedText><ThemedText style={styles.count}>{reflections.length} total</ThemedText></View>
            {reflections.map(reflection => <ReflectionCard key={reflection.id} reflection={reflection} questTitle={quests.find(quest => quest.id === reflection.quest_id)?.title} />)}
          </> : <EmptyState icon="compass-outline" title="No reflections yet" body="Your private planning and follow-through reflections will appear here when you decide to add one." />}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function AverageStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <View style={styles.averageStat}><View style={[styles.averageDot, { backgroundColor: tone }]} /><ThemedText style={styles.averageValue}>{value.toFixed(1)}</ThemedText><ThemedText style={styles.averageLabel}>{label}</ThemedText></View>;
}

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return <View style={styles.scoreLine}><ThemedText style={styles.scoreLabel}>{label}</ThemedText><View style={styles.scoreTrack}><View style={[styles.scoreFill, { width: `${value * 20}%`, backgroundColor: color }]} /></View><ThemedText style={styles.scoreValue}>{value}/5</ThemedText></View>;
}

function CheckInCard({ record }: { record: WellbeingCheckIn }) {
  return <View style={styles.entryCard}><View style={styles.entryHeader}><View><ThemedText style={styles.entryTitle}>{formatDate(record.check_in_date)}</ThemedText><ThemedText style={styles.entryMeta}>Daily check-in</ThemedText></View><View style={styles.wellbeingBadge}><ThemedText style={styles.wellbeingBadgeText}>{record.overall_wellbeing}/5</ThemedText></View></View><ScoreBar label="Well-being" value={record.overall_wellbeing} color={COLORS.honey} /><ScoreBar label="Stress" value={record.stress_level} color={COLORS.lavender} /><ScoreBar label="Energy" value={record.energy_level} color={COLORS.mint} />{record.note && <View style={styles.note}><Ionicons name="lock-closed-outline" size={14} color={COLORS.muted} /><ThemedText style={styles.noteText}>{record.note}</ThemedText></View>}</View>;
}

function ReflectionCard({ reflection, questTitle }: { reflection: SelfManagementReflection; questTitle?: string }) {
  return <View style={styles.entryCard}><View style={styles.entryHeader}><View style={styles.flex}><ThemedText style={styles.entryTitle}>{formatPeriod(reflection.period_start, reflection.period_end)}</ThemedText><ThemedText style={styles.entryMeta}>{questTitle ? `Related to: ${questTitle}` : 'General reflection'}</ThemedText></View><Ionicons name="compass-outline" size={21} color={COLORS.honeyDeep} /></View><ScoreBar label="Planning" value={reflection.planning_score} color={COLORS.honey} /><ScoreBar label="Follow-through" value={reflection.follow_through_score} color={COLORS.lavender} /><ScoreBar label="Confidence" value={reflection.confidence_score} color={COLORS.mint} />{reflection.accomplishment && <ReflectionText label="Accomplishment" value={reflection.accomplishment} />}{reflection.challenge && <ReflectionText label="Challenge" value={reflection.challenge} />}{reflection.next_step && <ReflectionText label="Next step" value={reflection.next_step} />}</View>;
}

function ReflectionText({ label, value }: { label: string; value: string }) {
  return <View style={styles.reflectionText}><ThemedText style={styles.reflectionLabel}>{label}</ThemedText><ThemedText style={styles.noteText}>{value}</ThemedText></View>;
}

function EmptyState({ icon, title, body }: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }) {
  return <View style={styles.empty}><View style={styles.emptyIcon}><Ionicons name={icon} size={28} color={COLORS.honeyDeep} /></View><ThemedText style={styles.sectionTitle}>{title}</ThemedText><ThemedText style={styles.emptyBody}>{body}</ThemedText></View>;
}

function formatDate(value: string) { return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }); }
function formatPeriod(start: string, end: string) { return start === end ? formatDate(end) : `${formatDate(start)} – ${formatDate(end)}`; }

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background }, safeArea: { flex: 1 },
  content: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: 48, gap: 12 },
  tabs: { flexDirection: 'row', gap: 8, padding: 4, borderRadius: Radii.md, backgroundColor: COLORS.surfaceMuted },
  tab: { flex: 1, minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 12 }, tabSelected: { backgroundColor: COLORS.card },
  tabText: { color: COLORS.muted, fontSize: 12, fontWeight: '800' }, tabTextSelected: { color: COLORS.ink },
  loading: { minHeight: 240, alignItems: 'center', justifyContent: 'center', gap: 10 }, body: { color: COLORS.muted, fontSize: 11, lineHeight: 17 },
  retryButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.honey, borderRadius: Radii.md }, retryText: { color: COLORS.ink, fontSize: 12, fontWeight: '900' },
  trendCard: { padding: 18, borderRadius: Radii.lg, backgroundColor: COLORS.surfaceWarm, gap: 15, ...BeeBetterShadow },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, sectionTitle: { color: COLORS.ink, fontSize: 17, lineHeight: 23, fontWeight: '900' }, count: { color: COLORS.muted, fontSize: 11, fontWeight: '700' },
  averageRow: { flexDirection: 'row', gap: 8 }, averageStat: { flex: 1, alignItems: 'center', padding: 11, borderRadius: Radii.md, backgroundColor: COLORS.card },
  averageDot: { width: 7, height: 7, borderRadius: 4, marginBottom: 5 }, averageValue: { color: COLORS.ink, fontSize: 21, fontWeight: '900' }, averageLabel: { color: COLORS.muted, fontSize: 9, marginTop: 2 },
  disclaimer: { color: COLORS.muted, fontSize: 10, lineHeight: 15 }, entryCard: { padding: 17, borderRadius: Radii.lg, backgroundColor: COLORS.card, gap: 11, borderWidth: 1, borderColor: COLORS.surfaceMuted },
  entryHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }, flex: { flex: 1 }, entryTitle: { color: COLORS.ink, fontSize: 14, lineHeight: 20, fontWeight: '900' }, entryMeta: { color: COLORS.muted, fontSize: 10, lineHeight: 15, marginTop: 1 },
  wellbeingBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radii.pill, backgroundColor: COLORS.honeySoft }, wellbeingBadgeText: { color: COLORS.honeyDeep, fontSize: 11, fontWeight: '900' },
  scoreLine: { flexDirection: 'row', alignItems: 'center', gap: 8 }, scoreLabel: { width: 85, color: COLORS.muted, fontSize: 10, fontWeight: '700' }, scoreTrack: { flex: 1, height: 7, borderRadius: Radii.pill, backgroundColor: COLORS.surfaceMuted, overflow: 'hidden' }, scoreFill: { height: '100%', borderRadius: Radii.pill }, scoreValue: { width: 25, color: COLORS.ink, fontSize: 10, fontWeight: '800', textAlign: 'right' },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.surfaceMuted }, noteText: { flex: 1, color: COLORS.ink, fontSize: 11, lineHeight: 17 },
  reflectionText: { paddingTop: 9, borderTopWidth: 1, borderTopColor: COLORS.surfaceMuted }, reflectionLabel: { color: COLORS.muted, fontSize: 9, fontWeight: '900', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 3 },
  empty: { minHeight: 260, alignItems: 'center', justifyContent: 'center', padding: 28 }, emptyIcon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.honeySoft, marginBottom: 12 }, emptyBody: { color: COLORS.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 5, maxWidth: 300 },
});
