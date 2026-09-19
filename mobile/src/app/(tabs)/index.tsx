import { StyleSheet, View, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { BeeMark, PillButton, SectionTitle, VisualTile } from '@/components/bee-visuals';
import { BeeBetterColors as COLORS, BeeBetterShadow, Radii } from '@/constants/theme';
import { useUserData, Category } from '@/hooks/use-user-data';

const categoryVisuals: Record<Category, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  Academics: { icon: 'book-outline', color: '#EAF1FF' },
  Habits: { icon: 'checkmark-done-outline', color: '#FFF1C2' },
  Social: { icon: 'people-outline', color: '#FBEAF2' },
  Health: { icon: 'walk-outline', color: '#E9F7EB' },
};

export default function HomeScreen() {
  const {
    user,
    profile,
    activeQuests,
    completedQuests,
    isLoading,
    isRefreshing,
    levelProgress,
    refresh,
    completeQuest,
  } = useUserData();

  const displayName = profile?.display_name || user?.email?.split('@')[0] || (user ? 'Explorer' : 'Guest');
  const nearbyQuestsCount = activeQuests.filter((q) => q.is_nearby).length;

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={refresh}
              colors={[COLORS.honeyDark]}
              tintColor={COLORS.honeyDark}
            />
          }>
          <View style={styles.heroHeader}>
            <View style={styles.heroHeaderTop}>
              <View style={styles.heroIdentity}>
                <TouchableOpacity onPress={() => (user ? router.push('/profile') : router.push('/auth'))} activeOpacity={0.8}>
                  <BeeMark size={52} />
                </TouchableOpacity>
                <View>
                  <ThemedText style={styles.eyebrow}>GOOD DAY, EXPLORER</ThemedText>
                  <ThemedText style={styles.greeting}>Hi, {displayName}</ThemedText>
                </View>
              </View>
              <TouchableOpacity style={styles.headerButton} onPress={() => router.push('/notifications')} activeOpacity={0.7}>
                <Ionicons name="notifications-outline" size={20} color={COLORS.ink} />
              </TouchableOpacity>
            </View>
            <ThemedText style={styles.heroTitle}>Small steps make a brighter you.</ThemedText>
            <ThemedText style={styles.heroSubtitle}>Keep your rhythm going and make today count.</ThemedText>
          </View>

          <View style={styles.todayCard}>
            <View style={styles.todayTopRow}>
              <View>
                <ThemedText style={styles.eyebrow}>TODAY&apos;S PROGRESS</ThemedText>
                <ThemedText style={styles.todayTitle}>
                  {profile && profile.current_streak > 0
                    ? `You are on a ${profile.current_streak}-day streak.`
                    : 'Start a quest to build your streak.'}
                </ThemedText>
              </View>
              <View style={styles.streakBadge}>
                <Ionicons name="flame" size={20} color={COLORS.honeyDark} />
              </View>
            </View>

            <View style={styles.progressLabels}>
              <ThemedText style={styles.progressText}>
                {levelProgress.currentLevelXp} / {levelProgress.xpForNextLevel} XP to Level {levelProgress.level + 1}
              </ThemedText>
              <ThemedText style={styles.progressPercent}>{levelProgress.progressPercent}%</ThemedText>
            </View>

            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${levelProgress.progressPercent}%` }]} />
            </View>

            <PillButton label={user ? 'Continue your quests' : 'Sign in to start'} icon="arrow-forward" onPress={() => router.push(user ? '/quests' : '/auth')} />
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.visualTileRow}>
            <VisualTile icon="book-outline" label="Learning" color={COLORS.lavender} onPress={() => router.push('/quests')} />
            <VisualTile icon="leaf-outline" label="Healthy habits" color={COLORS.mint} onPress={() => router.push('/quests')} />
            <VisualTile icon="people-outline" label="Connection" color={COLORS.peach} onPress={() => router.push('/quests')} />
            <VisualTile icon="sparkles-outline" label="New goals" color={COLORS.honeySoft} onPress={() => router.push('/add-quest')} />
          </ScrollView>

          {/* Stats Row */}
          <View style={styles.statsRow}>
            <Stat icon="checkmark-circle" value={String(activeQuests.length)} label="Active" />
            <Stat icon="trophy" value={String(completedQuests.length)} label="Completed" />
            <Stat icon="sparkles" value={String(profile?.total_xp ?? 0)} label="XP earned" />
          </View>

          {/* Location / Nearby Card */}
          <TouchableOpacity
            style={styles.locationCard}
            onPress={() => router.push('/quests')}
            activeOpacity={0.8}>
            <View style={styles.locationIcon}>
              <Ionicons name="location" size={18} color={COLORS.honeyDark} />
            </View>
            <View style={styles.locationCopy}>
              <ThemedText style={styles.locationTitle}>Nearby quests</ThemedText>
              <ThemedText style={styles.locationText}>
                {nearbyQuestsCount > 0
                  ? `${nearbyQuestsCount} quest${nearbyQuestsCount === 1 ? '' : 's'} available around your area`
                  : 'Tap to view and filter quests by location'}
              </ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />
          </TouchableOpacity>

          {/* Up Next / Active Quests */}
          <SectionTitle title="Your next wins" action={`See all (${activeQuests.length})`} onAction={() => router.push('/quests')} />

          {isLoading ? (
            <View style={styles.stateCard}>
              <ActivityIndicator color={COLORS.honeyDark} />
              <ThemedText style={styles.stateText}>Loading your quests...</ThemedText>
            </View>
          ) : activeQuests.length > 0 ? (
            activeQuests.slice(0, 4).map((quest) => {
              const visual = categoryVisuals[quest.category] || categoryVisuals.Habits;
              return (
                <View key={quest.id} style={styles.questCard}>
                  <View style={[styles.questIcon, { backgroundColor: visual.color }]}>
                    <Ionicons name={visual.icon} size={21} color={COLORS.ink} />
                  </View>
                  <View style={styles.questInfo}>
                    <View style={styles.titleRow}>
                      <ThemedText style={styles.questTitle} numberOfLines={1}>
                        {quest.title}
                      </ThemedText>
                      {quest.is_nearby && <Ionicons name="location" size={13} color={COLORS.honeyDark} />}
                    </View>
                    <ThemedText style={styles.questSubtitle} numberOfLines={1}>
                      {quest.description || `${quest.category} quest`}
                    </ThemedText>
                  </View>
                  <View style={styles.cardActions}>
                    <View style={styles.xpTag}>
                      <ThemedText style={styles.xpTagText}>+{quest.xp} XP</ThemedText>
                    </View>
                    <TouchableOpacity
                      style={styles.completeCheckButton}
                      onPress={() => completeQuest(quest.id)}
                      activeOpacity={0.7}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          ) : (
            <View style={styles.emptyCard}>
              <Ionicons name="sparkles-outline" size={24} color={COLORS.honeyDark} />
              <ThemedText style={styles.emptyTitle}>No active quests</ThemedText>
              <ThemedText style={styles.emptySubtitle}>
                Add a new task to turn it into an active quest and earn XP!
              </ThemedText>
              <TouchableOpacity
                style={styles.addQuestButton}
                onPress={() => router.push(user ? '/add-quest' : '/auth')}
                activeOpacity={0.8}>
                <Ionicons name="add" size={16} color="#FFFFFF" />
                <ThemedText style={styles.addQuestButtonText}>Create a quest</ThemedText>
              </TouchableOpacity>
            </View>
          )}

          {/* Completed Quests Section */}
          <View style={styles.sectionHeading}>
            <ThemedText style={styles.sectionTitle}>Your little victories</ThemedText>
            <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
          </View>

          {completedQuests.length > 0 ? (
            completedQuests.slice(0, 3).map((quest) => {
              const visual = categoryVisuals[quest.category] || categoryVisuals.Habits;
              return (
                <View key={quest.id} style={[styles.questCard, styles.completedCard]}>
                  <View style={[styles.questIcon, { backgroundColor: visual.color, opacity: 0.8 }]}>
                    <Ionicons name={visual.icon} size={20} color={COLORS.ink} />
                  </View>
                  <View style={styles.questInfo}>
                    <ThemedText style={styles.questTitle} numberOfLines={1}>
                      {quest.title}
                    </ThemedText>
                    <ThemedText style={styles.questSubtitle} numberOfLines={1}>
                      Earned +{quest.xp} XP · {quest.category}
                    </ThemedText>
                  </View>
                  <View style={styles.checkBadge}>
                    <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                  </View>
                </View>
              );
            })
          ) : (
            <View style={styles.emptyCompletedCard}>
              <ThemedText style={styles.emptyCompletedText}>
                No quests completed yet. Finish an active quest above to level up!
              </ThemedText>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function Stat({ icon, value, label }: { icon: keyof typeof Ionicons.glyphMap; value: string; label: string }) {
  return (
    <View style={styles.statCard}>
      <Ionicons name={icon} size={18} color={COLORS.honeyDark} />
      <ThemedText style={styles.statValue}>{value}</ThemedText>
      <ThemedText style={styles.statLabel}>{label}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  safeArea: { flex: 1 },
  heroHeader: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 4 },
  heroHeaderTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroIdentity: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroTitle: { color: COLORS.ink, fontSize: 27, lineHeight: 32, fontWeight: '900', marginTop: 18, maxWidth: 310 },
  heroSubtitle: { color: COLORS.muted, fontSize: 13, lineHeight: 19, marginTop: 6, marginBottom: 8 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16, gap: 12 },
  avatar: { width: 46, height: 46, borderRadius: Radii.md, backgroundColor: COLORS.honey, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#FFF2C9' },
  headerText: { flex: 1 },
  greeting: { fontSize: 17, fontWeight: '800', color: COLORS.ink },
  subGreeting: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  headerButton: { width: 42, height: 42, borderRadius: Radii.md, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#F1E4CF', ...BeeBetterShadow },
  content: { paddingHorizontal: 20, paddingBottom: 112, gap: 12 },
  visualTileRow: { gap: 10, paddingVertical: 6, paddingRight: 20 },
  guestBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.honeySoft, borderRadius: 16, padding: 14, gap: 12 },
  guestBannerCopy: { flex: 1 },
  guestBannerTitle: { fontSize: 13, fontWeight: '800', color: COLORS.ink },
  guestBannerSubtitle: { fontSize: 11, color: COLORS.ink, marginTop: 2, opacity: 0.8 },
  guestSignInButton: { backgroundColor: COLORS.ink, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  guestSignInButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  todayCard: { marginTop: 4, backgroundColor: COLORS.honeyDeep, borderRadius: Radii.xl, padding: 20, gap: 12, ...BeeBetterShadow },
  todayTopRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: '#FFD968' },
  todayTitle: { fontSize: 19, lineHeight: 25, fontWeight: '800', color: '#FFFFFF', marginTop: 5, maxWidth: 230 },
  streakBadge: { width: 46, height: 46, borderRadius: Radii.md, backgroundColor: COLORS.honeySoft, alignItems: 'center', justifyContent: 'center' },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressText: { fontSize: 11, color: '#E5E5E5' },
  progressPercent: { fontSize: 11, fontWeight: '800', color: '#FFD968' },
  progressTrack: { height: 7, backgroundColor: '#4C4C4C', borderRadius: 8, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: COLORS.honey, borderRadius: 8 },
  primaryButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, backgroundColor: COLORS.honey, paddingVertical: 13, borderRadius: Radii.md, marginTop: 2 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  statsRow: { flexDirection: 'row', gap: 9 },
  statCard: { flex: 1, minHeight: 94, backgroundColor: COLORS.card, borderRadius: Radii.md, padding: 13, justifyContent: 'space-between', borderWidth: 1, borderColor: '#F1E4CF', ...BeeBetterShadow },
  statValue: { fontSize: 20, fontWeight: '800', color: COLORS.ink, marginTop: 5 },
  statLabel: { fontSize: 10, color: COLORS.muted, fontWeight: '600' },
  locationCard: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: COLORS.surfaceWarm, borderRadius: Radii.md, padding: 14, borderWidth: 1, borderColor: '#F4DFAE' },
  locationIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.card },
  locationCopy: { flex: 1 },
  locationTitle: { fontSize: 12, fontWeight: '800', color: COLORS.ink },
  locationText: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 1 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: COLORS.ink },
  seeAll: { color: COLORS.honeyDark, fontSize: 12, fontWeight: '800' },
  questCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.card, borderRadius: Radii.md, padding: 13, borderWidth: 1, borderColor: '#F1E4CF', ...BeeBetterShadow },
  completedCard: { opacity: 0.88, backgroundColor: '#FAFAFA' },
  questIcon: { width: 46, height: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  questInfo: { flex: 1, gap: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  questTitle: { fontSize: 14, fontWeight: '800', color: COLORS.ink },
  questSubtitle: { fontSize: 12, color: COLORS.muted },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  xpTag: { backgroundColor: COLORS.honey, borderRadius: 14, paddingHorizontal: 9, paddingVertical: 6 },
  xpTagText: { fontSize: 10, fontWeight: '800', color: COLORS.ink },
  completeCheckButton: { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.success, alignItems: 'center', justifyContent: 'center' },
  checkBadge: { width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.success, alignItems: 'center', justifyContent: 'center' },
  stateCard: { alignItems: 'center', gap: 10, padding: 24, backgroundColor: COLORS.card, borderRadius: 18, ...BeeBetterShadow },
  stateText: { color: COLORS.muted, fontSize: 12, fontWeight: '700' },
  emptyCard: { alignItems: 'center', gap: 6, padding: 22, backgroundColor: COLORS.card, borderRadius: 18, ...BeeBetterShadow },
  emptyTitle: { color: COLORS.ink, fontSize: 14, fontWeight: '800' },
  emptySubtitle: { color: COLORS.muted, fontSize: 11, textAlign: 'center', maxWidth: 240 },
  addQuestButton: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.ink, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, marginTop: 6 },
  addQuestButtonText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  emptyCompletedCard: { padding: 16, backgroundColor: COLORS.card, borderRadius: 14, alignItems: 'center', ...BeeBetterShadow },
  emptyCompletedText: { color: COLORS.muted, fontSize: 11, textAlign: 'center' },
});
