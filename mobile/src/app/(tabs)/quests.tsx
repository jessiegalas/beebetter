import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
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
import { router, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import { ThemedText } from '@/components/themed-text';
import { SectionTitle } from '@/components/bee-visuals';
import { BeeBetterColors as COLORS, BeeBetterShadow, Radii } from '@/constants/theme';
import { useUserData, Quest, Category, QuestStatus, ProofFile } from '@/hooks/use-user-data';
import { useQuestPriority } from '@/context/quest-priority-context';
import { TIER_LABELS } from '@/lib/quest-priority';

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
    isLoading,
    isRefreshing,
    error: loadError,
    refresh,
    completeQuest,
    deleteQuest,
  } = useUserData();
  const { questId } = useLocalSearchParams<{ questId?: string }>();
  const closeDetails = () => router.setParams({ questId: '' });
  const { ranked, locationAvailable } = useQuestPriority();
  const selected = ranked.find(item => item.quest.id === questId);
  const [view, setView] = useState<'context' | 'all'>('context');

  const [activeFilter, setActiveFilter] = useState<(typeof filters)[number]>('All');
  const [locationOnly, setLocationOnly] = useState(false);
  const isAuthenticated = Boolean(user);

  const visibleRanked = useMemo(() => {
    const filtered = ranked.filter(item =>
      (activeFilter === 'All' || item.quest.category === activeFilter) &&
      (!locationOnly || item.nearby)
    );
    return view === 'context' ? filtered : [...filtered].sort((a, b) => b.quest.created_at.localeCompare(a.quest.created_at));
  }, [activeFilter, locationOnly, ranked, view]);
  const visibleQuests = visibleRanked.map(item => item.quest);
  const availableXp = visibleQuests.filter(quest => quest.status === 'active' || quest.status === 'rejected')
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

  const handleComplete = async (quest: Quest, proof?: ProofFile) => {

    const result = await completeQuest(quest.id, proof);
    if (result.success) {
      Alert.alert('Quest complete!', `+${quest.xp} XP earned. Keep the momentum going.`);
    } else {
      Alert.alert('Could not complete quest', result.error || 'Please try again.');
    }
  };

  return (
    <View style={styles.container}>
      <Modal visible={!!questId} animationType="slide" onRequestClose={closeDetails}>
        <SafeAreaView style={styles.container}>
          <ScrollView contentContainerStyle={styles.content}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close quest details" onPress={closeDetails} style={{ minHeight: 44, justifyContent: 'center' }}><ThemedText>Close details</ThemedText></TouchableOpacity>
            <SectionTitle title="Quest details" />
            {selected ? <QuestCard key={selected.quest.id} quest={selected.quest} reasons={selected.reasons} details onEdit={() => { closeDetails(); router.push({ pathname: '/add-quest', params: { id: selected.quest.id } }); }} onComplete={proof => void handleComplete(selected.quest, proof)} onDelete={() => handleConfirmDelete(selected.quest)} /> : <ThemedText>{isLoading ? 'Loading quest...' : 'This quest is no longer available.'}</ThemedText>}
          </ScrollView>
        </SafeAreaView>
      </Modal>
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
          <View style={styles.questHero}>
            <View style={styles.questHeroIcon}><Ionicons name="sparkles" size={29} color={COLORS.honeyDeep} /></View>
            <View style={styles.questHeroCopy}>
              <ThemedText style={styles.questHeroEyebrow}>YOUR ADVENTURE BOARD</ThemedText>
              <ThemedText style={styles.questHeroTitle}>Choose one brave little step.</ThemedText>
              <ThemedText style={styles.questHeroSubtitle}>{isAuthenticated ? 'Every quest adds a little more momentum.' : 'Sign in to save your progress.'}</ThemedText>
            </View>
            <TouchableOpacity style={styles.heroAddButton} onPress={() => router.push(isAuthenticated ? '/add-quest' : '/auth')} activeOpacity={0.8}>
              <Ionicons name={isAuthenticated ? 'add' : 'log-in-outline'} size={21} color={COLORS.ink} />
            </TouchableOpacity>
          </View>

          {/* Summary Card */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryIcon}>
              <Ionicons name="flag" size={21} color={COLORS.honeyDark} />
            </View>
            <View style={styles.summaryCopy}>
              <ThemedText style={styles.summaryLabel}>YOUR NEXT WIN</ThemedText>
              <ThemedText style={styles.summaryTitle}>
                {isAuthenticated
                  ? `${visibleQuests.filter((q) => q.status === 'active').length} active \u00b7 ${availableXp} XP ready`
                  : 'Create an account to save progress'}
              </ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#BEBEBE" />
          </View>

          <View style={styles.viewToggle}>
            {(['context', 'all'] as const).map(value => (
              <TouchableOpacity key={value} accessibilityRole="button" accessibilityState={{ selected: view === value }} style={[styles.filterPill, view === value && styles.filterPillActive]} onPress={() => {
                setView(value);
                if (value === 'all') { setActiveFilter('All'); setLocationOnly(false); }
              }}>
                <ThemedText style={styles.filterTextActive}>{value === 'context' ? 'For you' : 'All quests'}</ThemedText>
              </TouchableOpacity>
            ))}
          </View>
          <ThemedText style={styles.contextHint}>
            Suggestions adapt to your place, timing and activity. Choose any quest, in any order.
            {!locationAvailable ? ' Location unavailable; other context still works.' : ''}
          </ThemedText>
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
                  <ThemedText style={styles.locationSubtitle}>Based on your current location</ThemedText>
                </View>
                <Switch
                  value={locationOnly}
                  onValueChange={setLocationOnly}
                  trackColor={{ false: COLORS.surfaceMuted, true: COLORS.honey }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <ThemedText style={styles.resultCount}>{visibleQuests.length} quest{visibleQuests.length === 1 ? '' : 's'} showing</ThemedText>

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
            visibleRanked.map((item, index) => (
              <QuestCard
                key={item.quest.id}
                quest={item.quest}
                reasons={item.reasons}
                heading={view === 'context' && (index === 0 || visibleRanked[index - 1].tier !== item.tier) ? TIER_LABELS[item.tier] : undefined}
                onComplete={(proof) => void handleComplete(item.quest, proof)}
                onDelete={() => handleConfirmDelete(item.quest)}
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
              onPress={() => router.push(user ? '/add-quest' : '/auth')}
            />
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function QuestCard({
  quest,
  reasons,
  heading,
  details = false,
  onEdit,
  onComplete,
  onDelete,
}: {
  quest: Quest;
  reasons: string[];
  heading?: string;
  details?: boolean;
  onEdit?: () => void;
  onComplete: (proof?: ProofFile) => void;
  onDelete: () => void;
}) {
  const [proof, setProof] = useState<ProofFile | undefined>();
  const [isPickingProof, setIsPickingProof] = useState(false);
  const visual = categoryVisuals[quest.category] || categoryVisuals.Habits;
  const status = statusCopy[quest.status] || statusCopy.active;
  const isCompleted = quest.status === 'completed';

  const chooseMediaProof = async () => {
    setIsPickingProof(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setProof({
          uri: asset.uri,
          name: asset.fileName || `quest-proof-${Date.now()}`,
          mimeType: asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'),
        });
      }
    } finally {
      setIsPickingProof(false);
    }
  };

  const chooseFileProof = async () => {
    setIsPickingProof(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setProof({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType || 'application/octet-stream' });
      }
    } finally {
      setIsPickingProof(false);
    }
  };

  return (
    <View style={styles.questGroup}>
      {heading && <SectionTitle title={heading} />}
      <View style={[styles.questCard, isCompleted && styles.completedQuestCard]}>
      <View style={[styles.questIcon, { backgroundColor: visual.color }]}>
        <Ionicons name={visual.icon} size={22} color={COLORS.ink} />
      </View>

      <View style={styles.questInfo}>
        <View style={styles.titleRow}>
          <ThemedText
            style={[styles.questTitle, isCompleted && styles.completedQuestTitle]}
            numberOfLines={details ? undefined : 1}>
            {quest.title}
          </ThemedText>
          {quest.is_nearby && <Ionicons name="location" size={13} color={COLORS.honeyDark} />}
        </View>

        <ThemedText style={styles.questSubtitle} numberOfLines={details ? undefined : 2}>
          {quest.description || `${quest.category} quest`}
        </ThemedText>

        {!isCompleted && <ThemedText style={styles.reasonText}>{reasons.join(' \u00b7 ')}</ThemedText>}
        {(quest.scheduled_at || quest.preferred_time || quest.deadline_at) && (
          <ThemedText style={styles.questSubtitle}>
            {[
              quest.scheduled_at ? 'Scheduled: ' + new Date(quest.scheduled_at).toLocaleString() : null,
              quest.preferred_time ? 'Preferred: ' + quest.preferred_time.slice(0, 5) : null,
              quest.deadline_at ? 'Due: ' + new Date(quest.deadline_at).toLocaleString() : null,
            ].filter(Boolean).join('\n')}
          </ThemedText>
        )}
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
            {quest.requires_proof && (
              <View style={styles.proofActions}>
                <ThemedText style={styles.proofRequiredText}>Proof required</ThemedText>
                {proof ? (
                  <TouchableOpacity style={styles.proofSelected} onPress={() => setProof(undefined)}>
                    <Ionicons name="checkmark-circle" size={15} color={COLORS.success} />
                    <ThemedText style={styles.proofSelectedText} numberOfLines={1}>{proof.name}</ThemedText>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.proofPickerRow}>
                    <TouchableOpacity style={styles.proofPickerButton} onPress={chooseMediaProof} disabled={isPickingProof}>
                      <Ionicons name="image-outline" size={14} color={COLORS.ink} />
                      <ThemedText style={styles.proofPickerText}>Photo/video</ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.proofPickerButton} onPress={chooseFileProof} disabled={isPickingProof}>
                      <Ionicons name="document-attach-outline" size={14} color={COLORS.ink} />
                      <ThemedText style={styles.proofPickerText}>File</ThemedText>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
            {quest.requires_proof ? (
              <TouchableOpacity
                style={[styles.proofSubmitButton, !proof && styles.xpBadgeDisabled]}
                onPress={() => onComplete(proof)}
                disabled={!proof}
                activeOpacity={0.7}
                accessibilityLabel={`Submit proof and complete quest for ${quest.xp} XP`}>
                <Ionicons name="cloud-upload-outline" size={14} color={COLORS.ink} />
                <ThemedText style={styles.proofSubmitText}>
                  {proof ? 'Submit proof' : 'Choose proof'}
                </ThemedText>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.xpBadge}
                onPress={() => onComplete()}
                activeOpacity={0.7}
                accessibilityLabel={`Complete quest and earn ${quest.xp} XP`}>
                <ThemedText style={styles.xpText}>+{quest.xp}</ThemedText>
                <ThemedText style={styles.xpUnit}>XP</ThemedText>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.deleteIconButton} accessibilityRole="button" accessibilityLabel={`Edit ${quest.title}`} onPress={onEdit ?? (() => router.push({ pathname: '/add-quest', params: { id: quest.id } }))}>
              <Ionicons name="create-outline" size={20} color={COLORS.muted} />
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
  viewToggle: { flexDirection: 'row', gap: 10 },
  contextHint: { fontSize: 12, lineHeight: 18, color: COLORS.muted },
  questGroup: { gap: 10 },
  reasonText: { fontSize: 12, lineHeight: 18, color: COLORS.honeyDeep, marginTop: 5 },
  container: { flex: 1, backgroundColor: COLORS.background },
  safeArea: { flex: 1 },
  questHero: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8, marginBottom: 4, padding: 18, borderRadius: Radii.xl, backgroundColor: COLORS.surfaceWarm, borderWidth: 1, borderColor: '#F4DFAE' },
  questHeroIcon: { width: 56, height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.honey },
  questHeroCopy: { flex: 1 },
  questHeroEyebrow: { color: COLORS.honeyDark, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  questHeroTitle: { color: COLORS.ink, fontSize: 19, lineHeight: 23, fontWeight: '900', marginTop: 4 },
  questHeroSubtitle: { color: COLORS.muted, fontSize: 11, lineHeight: 15, marginTop: 4 },
  heroAddButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.card },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 14 },
  headerIcon: { width: 46, height: 46, borderRadius: Radii.md, backgroundColor: COLORS.honey, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#FFF2C9' },
  headerText: { flex: 1 },
  greeting: { fontSize: 18, fontWeight: '800', color: COLORS.ink },
  subGreeting: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  addButton: { width: 42, height: 42, borderRadius: Radii.md, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#F1E4CF', ...BeeBetterShadow },
  content: { gap: 12, paddingHorizontal: 20, paddingBottom: 112 },
  categoryTiles: { gap: 10, paddingVertical: 4, paddingRight: 20 },
  summaryCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: Radii.xl, backgroundColor: COLORS.honeyDeep, ...BeeBetterShadow },
  summaryIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: COLORS.honeySoft, alignItems: 'center', justifyContent: 'center' },
  summaryCopy: { flex: 1 },
  summaryLabel: { color: '#FFD968', fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  summaryTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', marginTop: 3 },
  filterRow: { gap: 8, paddingVertical: 2 },
  filterPill: { backgroundColor: COLORS.card, borderRadius: Radii.pill, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: '#F1E4CF', ...BeeBetterShadow },
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
  questCard: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: 13, backgroundColor: COLORS.card, borderRadius: Radii.md, borderWidth: 1, borderColor: '#F1E4CF', ...BeeBetterShadow },
  completedQuestCard: { opacity: 0.82, backgroundColor: '#FAFAFA' },
  questIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  questInfo: { flex: 1, minWidth: 180, gap: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  questTitle: { flexShrink: 1, color: COLORS.ink, fontSize: 14, fontWeight: '800' },
  completedQuestTitle: { textDecorationLine: 'line-through', color: COLORS.muted },
  questSubtitle: { color: COLORS.muted, fontSize: 11, lineHeight: 15 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: '800' },
  categoryText: { fontSize: 10, color: COLORS.muted, marginLeft: 3 },
  questActions: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: 12 },
  proofActions: { width: 150, alignItems: 'flex-end', gap: 5, marginBottom: 2 },
  proofRequiredText: { color: COLORS.danger, fontSize: 9, fontWeight: '800' },
  proofPickerRow: { flexDirection: 'row', gap: 4 },
  proofPickerButton: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: COLORS.honeySoft, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 5 },
  proofPickerText: { color: COLORS.ink, fontSize: 9, fontWeight: '800' },
  proofSelected: { maxWidth: 150, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#E9F7EB', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 5 },
  proofSelectedText: { flexShrink: 1, color: COLORS.success, fontSize: 9, fontWeight: '800' },
  proofSubmitButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minWidth: 104, borderRadius: 10, backgroundColor: COLORS.honey, paddingHorizontal: 8, paddingVertical: 8 },
  proofSubmitText: { color: COLORS.ink, fontSize: 10, fontWeight: '800' },
  xpBadge: { minWidth: 46, alignItems: 'center', borderRadius: 13, backgroundColor: COLORS.honey, paddingHorizontal: 9, paddingVertical: 7 },
  xpBadgeDisabled: { backgroundColor: COLORS.surfaceMuted },
  xpText: { color: COLORS.ink, fontSize: 11, fontWeight: '800' },
  xpUnit: { color: COLORS.ink, fontSize: 8, fontWeight: '800', marginTop: 1 },
  deleteIconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
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
