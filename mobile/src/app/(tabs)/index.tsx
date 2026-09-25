import { Platform, ActivityIndicator, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { XpBadge, XpProgress } from '@/components/xp-visuals';
import { ThemedText } from '@/components/themed-text';
import { BeeMark } from '@/components/bee-visuals';
import { BeeBetterColors as COLORS, BeeBetterShadow, MaxContentWidth, Radii } from '@/constants/theme';
import { useQuestPriority } from '@/context/quest-priority-context';
import { useUserData } from '@/hooks/use-user-data';

export default function HomeScreen() {
  const { user, profile, quests, completedQuests, isLoading, isRefreshing, error, levelProgress, refresh } = useUserData();
  const displayName = profile?.display_name?.trim() || profile?.name?.trim() || user?.email?.split('@')[0] || (user ? 'Explorer' : 'Guest');
  const { ranked, locationAvailable } = useQuestPriority();
  const recommendations = ranked.filter(({ quest, tier }) => tier !== 'history' && (!quest.prerequisite_quest_id || quests.some(q => q.id === quest.prerequisite_quest_id && q.status === 'completed'))).slice(0, 1);
  const streak = profile?.current_streak ?? 0;

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} colors={[COLORS.honeyDark]} tintColor={COLORS.honeyDark} />}>
          <View style={styles.header}>
            <BeeMark size={40} />
            <View style={styles.copy}>
              <ThemedText style={styles.greeting} numberOfLines={1}>Hi, {displayName}</ThemedText>
            </View>
            <TouchableOpacity style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Open notifications" onPress={() => router.push('/notifications')} activeOpacity={0.8}>
              <Ionicons name="notifications-outline" size={21} color={COLORS.ink} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Open profile" onPress={() => router.push('/profile')}><Ionicons name="person-outline" size={21} color={COLORS.ink} /></TouchableOpacity>
          </View>
          <ThemedText style={styles.intro}>A little progress, every day.</ThemedText>

          {isLoading ? (
            <View style={styles.stateCard} accessibilityLiveRegion="polite">
              <ActivityIndicator color={COLORS.honeyDark} />
              <ThemedText style={styles.body}>Loading your overview...</ThemedText>
            </View>
          ) : error ? (
            <View style={styles.card} accessibilityLiveRegion="polite">
              <ThemedText style={styles.sectionTitle}>Could not load your overview</ThemedText>
              <ThemedText style={styles.body}>Please try again to see your latest progress.</ThemedText>
              <OverviewAction label="Try again" onPress={() => void refresh()} />
            </View>
          ) : (
            <>
              <View style={[styles.card, styles.nextStepCard]}>
                <View style={styles.sectionHeading}>
                  <ThemedText style={styles.sectionTitle}>Your Next Step</ThemedText>
                  <Ionicons name="sparkles-outline" size={22} color={COLORS.honeyDeep} />
                </View>
                {recommendations.length ? recommendations.map(({ quest, reasons }) => (
                  <View key={quest.id} style={styles.questPreview}>
                    <View style={styles.questCopy}>
                      <View style={styles.sectionHeading}><ThemedText style={styles.eyebrow}>{quest.category.toUpperCase()}</ThemedText><XpBadge xp={quest.xp} /></View>
                      <ThemedText style={styles.questTitle} numberOfLines={2}>{quest.title}</ThemedText>
                      {!!quest.description && <ThemedText style={styles.body} numberOfLines={2}>{quest.description}</ThemedText>}
                      <ThemedText style={styles.body}>{reasons.slice(0, 2).join(' / ')}</ThemedText>
                      {!locationAvailable && <ThemedText style={styles.count}>Location unavailable. Timing and activity still guide suggestions.</ThemedText>}
                      <OverviewAction primary label="View quest details" onPress={() => router.push({ pathname: '/quests', params: { questId: quest.id } })} />
                    </View>
                  </View>
                )) : (
                  <View style={styles.emptyPreview}>
                    <ThemedText style={styles.questTitle}>Room for a new little win.</ThemedText>
                    <ThemedText style={styles.body}>Visit your quest board to add a goal or check your submissions.</ThemedText>
                  </View>
                )}
                {!recommendations.length && <OverviewAction primary label="Explore quests" onPress={() => router.push('/quests')} />}
              </View>

              <View style={styles.progressCard}>
                <View style={styles.sectionHeading}>
                  <View style={styles.copy}>
                    <ThemedText style={[styles.eyebrow, styles.onDarkMuted]}>YOUR PROGRESS</ThemedText>
                    {!user && <ThemedText style={styles.levelTitle}>Small steps start here.</ThemedText>}
                  </View>
                  {user && (
                    <View style={styles.streakBadge}>
                      <Ionicons name="flame-outline" size={16} color={COLORS.honey} />
                      <ThemedText style={styles.streakText}>{streak} day{streak === 1 ? '' : 's'} streak</ThemedText>
                    </View>
                  )}
                </View>
                {user ? (
                  <>
                    <XpProgress progress={levelProgress} />
                    <ThemedText style={styles.progressText}>{completedQuests.length} quests completed</ThemedText>
                    <OverviewAction label="View profile & achievements" onPress={() => router.push('/profile')} onDark />
                  </>
                ) : (
                  <>
                    <ThemedText style={styles.progressText}>Turn everyday goals into quests and watch yourself grow.</ThemedText>
                    <OverviewAction label="Sign in to start" onPress={() => router.push('/auth')} onDark />
                  </>
                )}
              </View>

              {!!recommendations.length && <OverviewAction label="Explore all quests" onPress={() => router.push('/quests')} />}
              <TouchableOpacity style={styles.growthCard} accessibilityRole="button" accessibilityLabel="View skill tree" onPress={() => router.push('/skill-tree')} activeOpacity={0.8}>
                <View style={styles.growthIcon}><Ionicons name="git-network-outline" size={23} color={COLORS.ink} /></View>
                <View style={styles.copy}>
                  <ThemedText style={styles.sectionTitle}>Skill tree</ThemedText>
                  <ThemedText style={styles.body}>See the strengths you can grow.</ThemedText>
                </View>
                <Ionicons name="chevron-forward" size={19} color={COLORS.muted} />
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function OverviewAction({ label, onPress, onDark = false, primary = false }: { label: string; onPress: () => void; onDark?: boolean; primary?: boolean }) {
  return (
    <TouchableOpacity style={[styles.action, onDark && styles.actionOnDark, primary && styles.primaryAction]} onPress={onPress} accessibilityRole="button" activeOpacity={0.8}>
      <ThemedText style={[styles.actionText, onDark && styles.actionTextOnDark]}>{label}</ThemedText>
      <Ionicons name="arrow-forward" size={18} color={COLORS.ink} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  nextStepCard: { backgroundColor: COLORS.honeySoft, borderColor: COLORS.honey },
  primaryAction: { backgroundColor: COLORS.honey, borderTopWidth: 0, borderRadius: Radii.md, paddingHorizontal: 12, paddingVertical: 12, marginTop: 12 },
  container: { flex: 1, backgroundColor: COLORS.background },
  safeArea: { flex: 1 },
  content: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: Platform.OS === 'web' ? 112 : 32, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  copy: { flex: 1, minWidth: 0 },
  eyebrow: { fontSize: 10, lineHeight: 16, fontWeight: '800', letterSpacing: 1, color: COLORS.muted },
  greeting: { fontSize: 22, lineHeight: 29, fontWeight: '800', color: COLORS.ink, marginTop: 2 },
  headerButton: { width: 44, height: 44, borderRadius: Radii.md, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.surfaceMuted },
  intro: { fontSize: 14, lineHeight: 20, color: COLORS.muted, marginTop: -8 },
  progressCard: { backgroundColor: COLORS.card, borderRadius: Radii.lg, padding: 18, gap: 10, ...BeeBetterShadow },
  onDarkMuted: { color: COLORS.muted },
  levelTitle: { fontSize: 22, lineHeight: 28, fontWeight: '800', color: COLORS.ink, marginTop: 4 },
  streakBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 7, paddingHorizontal: 10, borderRadius: Radii.pill, backgroundColor: '#734A2C' },
  streakText: { fontSize: 12, lineHeight: 18, fontWeight: '700', color: COLORS.honeySoft },
  progressText: { color: COLORS.muted, fontSize: 13, lineHeight: 20 },
  progressTrack: { height: 7, backgroundColor: COLORS.surfaceMuted, borderRadius: Radii.pill, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: COLORS.honey, borderRadius: Radii.pill },
  card: { backgroundColor: COLORS.card, borderRadius: Radii.lg, padding: 20, gap: 16, borderWidth: 1, borderColor: COLORS.surfaceMuted, ...BeeBetterShadow },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  sectionTitle: { fontSize: 17, lineHeight: 24, fontWeight: '800', color: COLORS.ink },
  count: { fontSize: 12, lineHeight: 18, color: COLORS.muted, fontWeight: '600' },
  questPreview: { gap: 12 },
  questCopy: { gap: 8 },
  questIcon: { width: 44, height: 44, borderRadius: Radii.md, backgroundColor: COLORS.honeySoft, alignItems: 'center', justifyContent: 'center' },
  questTitle: { fontSize: 23, lineHeight: 30, fontWeight: '700', color: COLORS.ink, marginVertical: 3 },
  body: { fontSize: 13, lineHeight: 20, color: COLORS.muted },
  emptyPreview: { gap: 4 },
  nearbySummary: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  action: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.surfaceMuted },
  actionOnDark: { borderTopColor: COLORS.surfaceMuted, marginTop: 4 },
  actionText: { flex: 1, fontSize: 13, lineHeight: 20, fontWeight: '800', color: COLORS.ink },
  actionTextOnDark: { color: COLORS.ink },
  growthCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 18, backgroundColor: COLORS.surfaceWarm, borderRadius: Radii.lg, borderWidth: 1, borderColor: COLORS.surfaceMuted },
  growthIcon: { width: 44, height: 44, borderRadius: Radii.md, backgroundColor: COLORS.mint, alignItems: 'center', justifyContent: 'center' },
  stateCard: { padding: 32, alignItems: 'center', gap: 12, backgroundColor: COLORS.card, borderRadius: Radii.lg },
});
