import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  StyleSheet,
  Switch,
  TouchableOpacity,
  View,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { BeeBetterColors as COLORS, BeeBetterShadow } from '@/constants/theme';
import { useUserData, Quest, Category, QuestStatus } from '@/hooks/use-user-data';

const filters = ['All', 'Academics', 'Habits', 'Social', 'Health'] as const;

const categoryVisuals: Record<Category, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  Academics: { icon: 'book-outline', color: '#EAF1FF' },
  Habits: { icon: 'checkmark-done-outline', color: '#FFF1C2' },
  Social: { icon: 'people-outline', color: '#FBEAF2' },
  Health: { icon: 'heart-outline', color: '#E9F7EB' },
};

const statusCopy: Record<QuestStatus, { label: string; color: string }> = {
  active: { label: 'Ready', color: COLORS.success },
  rejected: { label: 'Needs revision', color: COLORS.danger },
  pending: { label: 'Pending review', color: COLORS.honeyDark },
  completed: { label: 'Completed', color: COLORS.success },
};

export default function QuestsScreen() {
  const {
    user,
    quests,
    isLoading,
    isRefreshing,
    error: loadError,
    refresh,
    completeQuest,
    deleteQuest,
  } = useUserData();

  const [activeFilter, setActiveFilter] = useState<(typeof filters)[number]>('All');
  const [locationOnly, setLocationOnly] = useState(false);
  const isAuthenticated = Boolean(user);

  const visibleQuests = useMemo(
    () =>
      quests.filter(
        (quest) =>
          (activeFilter === 'All' || quest.category === activeFilter) &&
          (!locationOnly || quest.is_nearby)
      ),
    [activeFilter, locationOnly, quests]
  );

  const availableXp = visibleQuests
    .filter((quest) => quest.status === 'active')
    .reduce((total, quest) => total + quest.xp, 0);

  const handleConfirmDelete = (quest: Quest) => {
    Alert.alert(
      'Delete Quest',
      `Are you sure you want to delete "${quest.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteQuest(quest.id),
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Ionicons name="list-outline" size={22} color={COLORS.ink} />
          </View>
          <View style={styles.headerText}>
            <ThemedText style={styles.greeting}>Quest board</ThemedText>
            <ThemedText style={styles.subGreeting}>
              {isAuthenticated ? 'Your saved quests, in one place.' : 'Sign in to begin your journey.'}
            </ThemedText>
          </View>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => router.push(isAuthenticated ? '/add-quest' : '/auth')}
            activeOpacity={0.75}>
            <Ionicons name={isAuthenticated ? 'add' : 'log-in-outline'} size={21} color={COLORS.ink} />
          </TouchableOpacity>
        </View>

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
          {/* Summary Card */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryIcon}>
              <Ionicons name="flag" size={21} color={COLORS.honeyDark} />
            </View>
            <View style={styles.summaryCopy}>
              <ThemedText style={styles.summaryLabel}>YOUR NEXT WIN</ThemedText>
              <ThemedText style={styles.summaryTitle}>
                {isAuthenticated
                  ? `${visibleQuests.filter((q) => q.status === 'active').length} active · ${availableXp} XP ready`
                  : 'Create an account to save progress'}
              </ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#BEBEBE" />
          </View>

          {/* Category Filter Pills */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterRow}>
                {filters.map((filter) => {
                  const selected = activeFilter === filter;
                  return (
                    <TouchableOpacity
                      key={filter}
                      style={[styles.filterPill, selected && styles.filterPillActive]}
                      onPress={() => setActiveFilter(filter)}
                      activeOpacity={0.75}>
                      <ThemedText style={[styles.filterText, selected && styles.filterTextActive]}>
                        {filter}
                      </ThemedText>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Location Filter Switch */}
              <View style={styles.locationCard}>
                <View style={styles.locationIcon}>
                  <Ionicons name="location-outline" size={18} color={COLORS.honeyDark} />
                </View>
                <View style={styles.locationCopy}>
                  <ThemedText style={styles.locationTitle}>Nearby quests only</ThemedText>
                  <ThemedText style={styles.locationSubtitle}>Show opportunities around you</ThemedText>
                </View>
                <Switch
                  value={locationOnly}
                  onValueChange={setLocationOnly}
                  trackColor={{ false: COLORS.surfaceMuted, true: COLORS.honey }}
                  thumbColor="#FFFFFF"
                />
              </View>

              {/* List Header */}
              <View style={styles.listHeading}>
                <ThemedText style={styles.sectionTitle}>
                  {activeFilter === 'All' ? 'All quests' : activeFilter}
                </ThemedText>
                <ThemedText style={styles.resultCount}>{visibleQuests.length} showing</ThemedText>
              </View>

          {/* List Content States */}
          {isLoading && (
            <View style={styles.stateCard}>
              <ActivityIndicator color={COLORS.honeyDark} />
              <ThemedText style={styles.stateText}>Loading your quests...</ThemedText>
            </View>
          )}

          {!isLoading && loadError && (
            <EmptyState
              icon="alert-circle-outline"
              title="Could not load quests"
              subtitle={loadError}
              actionLabel="Try again"
              onPress={() => refresh()}
            />
          )}

          {!isLoading &&
            !loadError &&
            visibleQuests.map((quest) => (
              <QuestCard
                key={quest.id}
                quest={quest}
                onComplete={() => completeQuest(quest.id)}
                onDelete={() => handleConfirmDelete(quest)}
              />
            ))}

          {!isLoading && !loadError && visibleQuests.length === 0 && (
            <EmptyState
              icon="sparkles-outline"
              title="No quests in this view"
              subtitle={
                locationOnly
                  ? 'No nearby quests found. Turn off the nearby filter or add a new quest.'
                  : 'A small, specific quest is the best place to start.'
              }
              actionLabel="New quest"
              onPress={() => router.push('/add-quest')}
            />
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function QuestCard({
  quest,
  onComplete,
  onDelete,
}: {
  quest: Quest;
  onComplete: () => void;
  onDelete: () => void;
}) {
  const visual = categoryVisuals[quest.category] || categoryVisuals.Habits;
  const status = statusCopy[quest.status] || statusCopy.active;
  const isCompleted = quest.status === 'completed';

  return (
    <View style={[styles.questCard, isCompleted && styles.completedQuestCard]}>
      <View style={[styles.questIcon, { backgroundColor: visual.color }]}>
        <Ionicons name={visual.icon} size={22} color={COLORS.ink} />
      </View>

      <View style={styles.questInfo}>
        <View style={styles.titleRow}>
          <ThemedText
            style={[styles.questTitle, isCompleted && styles.completedQuestTitle]}
            numberOfLines={1}>
            {quest.title}
          </ThemedText>
          {quest.is_nearby && <Ionicons name="location" size={13} color={COLORS.honeyDark} />}
        </View>

        <ThemedText style={styles.questSubtitle} numberOfLines={2}>
          {quest.description || `${quest.category} quest`}
        </ThemedText>

        <View style={styles.metaRow}>
          <View style={[styles.statusDot, { backgroundColor: status.color }]} />
          <ThemedText style={[styles.statusText, { color: status.color }]}>{status.label}</ThemedText>
          <ThemedText style={styles.categoryText}>{quest.category}</ThemedText>
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.questActions}>
        {!isCompleted ? (
          <>
            <TouchableOpacity
              style={styles.xpBadge}
              onPress={onComplete}
              activeOpacity={0.7}
              accessibilityLabel={`Complete quest and earn ${quest.xp} XP`}>
              <ThemedText style={styles.xpText}>+{quest.xp}</ThemedText>
              <ThemedText style={styles.xpUnit}>XP</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.deleteIconButton}
              onPress={onDelete}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <Ionicons name="trash-outline" size={15} color={COLORS.muted} />
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.completedBadge}>
            <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
          </View>
        )}
      </View>
    </View>
  );
}

function EmptyState({
  icon,
  title,
  subtitle,
  actionLabel,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  actionLabel: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={26} color={COLORS.honeyDark} />
      </View>
      <ThemedText style={styles.emptyTitle}>{title}</ThemedText>
      <ThemedText style={styles.emptySubtitle}>{subtitle}</ThemedText>
      <TouchableOpacity style={styles.emptyButton} onPress={onPress} activeOpacity={0.8}>
        <ThemedText style={styles.emptyButtonText}>{actionLabel}</ThemedText>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  safeArea: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 14 },
  headerIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.honey, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  greeting: { fontSize: 18, fontWeight: '800', color: COLORS.ink },
  subGreeting: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  addButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center', ...BeeBetterShadow },
  content: { gap: 12, paddingHorizontal: 20, paddingBottom: 112 },
  summaryCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, borderRadius: 18, backgroundColor: COLORS.ink, ...BeeBetterShadow },
  summaryIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: COLORS.honeySoft, alignItems: 'center', justifyContent: 'center' },
  summaryCopy: { flex: 1 },
  summaryLabel: { color: '#FFD968', fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  summaryTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', marginTop: 3 },
  filterRow: { gap: 8, paddingVertical: 2 },
  filterPill: { backgroundColor: COLORS.card, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8, ...BeeBetterShadow },
  filterPillActive: { backgroundColor: COLORS.honey },
  filterText: { color: COLORS.muted, fontSize: 12, fontWeight: '700' },
  filterTextActive: { color: COLORS.ink },
  locationCard: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12, backgroundColor: COLORS.card, borderRadius: 16, ...BeeBetterShadow },
  locationIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: COLORS.honeySoft, alignItems: 'center', justifyContent: 'center' },
  locationCopy: { flex: 1 },
  locationTitle: { color: COLORS.ink, fontSize: 13, fontWeight: '800' },
  locationSubtitle: { color: COLORS.muted, fontSize: 11, marginTop: 2 },
  listHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 7 },
  sectionTitle: { color: COLORS.ink, fontSize: 15, fontWeight: '800' },
  resultCount: { color: COLORS.muted, fontSize: 11, fontWeight: '700' },
  questCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: COLORS.card, borderRadius: 17, ...BeeBetterShadow },
  completedQuestCard: { opacity: 0.82, backgroundColor: '#FAFAFA' },
  questIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  questInfo: { flex: 1, gap: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  questTitle: { flexShrink: 1, color: COLORS.ink, fontSize: 14, fontWeight: '800' },
  completedQuestTitle: { textDecorationLine: 'line-through', color: COLORS.muted },
  questSubtitle: { color: COLORS.muted, fontSize: 11, lineHeight: 15 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: '800' },
  categoryText: { fontSize: 10, color: COLORS.muted, marginLeft: 3 },
  questActions: { alignItems: 'center', gap: 6 },
  xpBadge: { minWidth: 46, alignItems: 'center', borderRadius: 13, backgroundColor: COLORS.honey, paddingHorizontal: 9, paddingVertical: 7 },
  xpText: { color: COLORS.ink, fontSize: 11, fontWeight: '800' },
  xpUnit: { color: COLORS.ink, fontSize: 8, fontWeight: '800', marginTop: 1 },
  deleteIconButton: { padding: 4 },
  completedBadge: { paddingHorizontal: 8 },
  stateCard: { alignItems: 'center', gap: 10, padding: 28, backgroundColor: COLORS.card, borderRadius: 18, ...BeeBetterShadow },
  stateText: { color: COLORS.muted, fontSize: 12, fontWeight: '700' },
  emptyState: { alignItems: 'center', gap: 7, backgroundColor: COLORS.card, borderRadius: 18, padding: 28, marginTop: 4, ...BeeBetterShadow },
  emptyIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: COLORS.honeySoft, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: COLORS.ink, fontSize: 15, fontWeight: '800', marginTop: 4 },
  emptySubtitle: { color: COLORS.muted, fontSize: 12, lineHeight: 17, textAlign: 'center' },
  emptyButton: { backgroundColor: COLORS.ink, borderRadius: 12, marginTop: 8, paddingHorizontal: 16, paddingVertical: 10 },
  emptyButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
});
