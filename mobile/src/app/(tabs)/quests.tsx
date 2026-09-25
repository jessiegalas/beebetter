import { useMemo, useRef, useState } from 'react';
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

import { XpBadge, QuestReward } from '@/components/xp-visuals';
import { ThemedText } from '@/components/themed-text';
import { SectionTitle } from '@/components/bee-visuals';
import { BeeBetterColors as COLORS, BeeBetterShadow, Radii } from '@/constants/theme';
import { useUserData, Quest, Category, QuestStatus, ProofFile } from '@/hooks/use-user-data';
import { useQuestCategories } from '@/hooks/use-quest-categories';
import { useQuestPriority } from '@/context/quest-priority-context';
import { activeFilterCount, DEFAULT_FILTERS, filterAllQuests, recommendedQuests, type QuestFilters } from '@/lib/quest-discovery';



const categoryVisuals: Record<Category, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  Academics: { icon: 'book-outline', color: '#EAF1FF' },
  Habits: { icon: 'checkmark-done-outline', color: '#FFF1C2' },
  Social: { icon: 'people-outline', color: '#FBEAF2' },
  Health: { icon: 'heart-outline', color: '#E9F7EB' },
};

const statusCopy: Record<QuestStatus, { label: string; color: string }> = {
  active: { label: 'Active', color: COLORS.success },
  rejected: { label: 'Needs revision', color: COLORS.danger },
  pending: { label: 'Pending review', color: COLORS.honeyDark },
  completed: { label: 'Completed', color: COLORS.success },
};

export default function QuestsScreen() {
  const {
    user,
    levelProgress,
    isLoading,
    isRefreshing,
    error: loadError,
    refresh,
    completeQuest,
    deleteQuest,
  } = useUserData();
  const { categories } = useQuestCategories();
  const [reward, setReward] = useState<{ title: string; xp: number; previousLevel: number } | null>(null);
  const completionBusy = useRef(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const dismissReward = () => setReward(null);
  const { questId } = useLocalSearchParams<{ questId?: string }>();
  const closeDetails = () => router.setParams({ questId: '' });
  const { ranked, locationAvailable, now } = useQuestPriority();
  const selected = ranked.find(item => item.quest.id === questId);
  const [view, setView] = useState<'context' | 'all'>('context');

  const [appliedFilters, setAppliedFilters] = useState<QuestFilters>(DEFAULT_FILTERS);
  const [draftFilters, setDraftFilters] = useState<QuestFilters>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const isAuthenticated = Boolean(user);
  const filterCount = activeFilterCount(appliedFilters);
  const openFilters = () => { setDraftFilters({ ...appliedFilters }); setFiltersOpen(true); };
  const visibleRanked = useMemo(() => view === 'context'
    ? recommendedQuests(ranked)
    : filterAllQuests(ranked, appliedFilters, now), [ranked, appliedFilters, view, now]);
  const visibleQuests = visibleRanked.map(item => item.quest);

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

    if (completionBusy.current || quest.status === 'completed') return;
    completionBusy.current = true;
    setCompletingId(quest.id);
    const previousLevel = levelProgress.level;
    const result = await completeQuest(quest.id, proof);
    completionBusy.current = false;
    setCompletingId(null);
    if (result.success) {
      setReward({ title: quest.title, xp: quest.xp, previousLevel });
    } else {
      Alert.alert('Could not complete quest', result.error || 'Please try again.');
    }
  };

  return (
    <View style={styles.container}>
      <Modal visible={!!reward && !questId} transparent animationType="fade" onRequestClose={dismissReward}>
        <View style={styles.rewardBackdrop}><ScrollView contentContainerStyle={styles.rewardContent}>{reward && <QuestReward {...reward} progress={levelProgress} onClose={dismissReward} />}</ScrollView></View>
      </Modal>
      <Modal visible={filtersOpen} transparent animationType="slide" onRequestClose={() => setFiltersOpen(false)}>
        <View style={styles.sheetBackdrop}>
          <SafeAreaView style={styles.filterSheet} edges={['bottom']} accessibilityViewIsModal>
            <View style={styles.listHeading}>
              <ThemedText style={styles.sectionTitle}>Filter All Quests</ThemedText>
              <TouchableOpacity style={styles.deleteIconButton} accessibilityRole="button" accessibilityLabel="Close filters without applying" onPress={() => setFiltersOpen(false)}><Ionicons name="close" size={24} color={COLORS.ink} /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.sheetContent}>
              <FilterOptions label="Category" value={draftFilters.category ?? ''} options={[
                { value: '', label: 'All categories' }, ...Array.from(new Set([...categories.map(category => category.name), ...ranked.map(item => item.quest.category)])).sort().map(value => ({ value, label: value })),
              ]} onChange={value => setDraftFilters({ ...draftFilters, category: value || null })} />
              <FilterOptions label="Status" value={draftFilters.status} options={[
                { value: 'all', label: 'All statuses' }, { value: 'active', label: 'Active' }, { value: 'rejected', label: 'Needs revision' }, { value: 'pending', label: 'Pending review' }, { value: 'completed', label: 'Completed' },
              ]} onChange={value => setDraftFilters({ ...draftFilters, status: value as QuestFilters['status'] })} />
              <FilterOptions label="Schedule & time" value={draftFilters.time} options={[
                { value: 'all', label: 'Any time' }, { value: 'today', label: 'Today' }, { value: 'overdue', label: 'Overdue' }, { value: 'scheduled', label: 'Has timing' }, { value: 'anytime', label: 'No timing set' },
              ]} onChange={value => setDraftFilters({ ...draftFilters, time: value as QuestFilters['time'] })} />
              <ThemedText style={styles.contextHint}>Today includes scheduled dates, deadlines and daily preferred times. Overdue includes active quests and quests needing revision.</ThemedText>
              <View style={styles.listHeading}>
                <ThemedText style={styles.sectionTitle}>Nearby quests only</ThemedText>
                <Switch accessibilityLabel="Nearby quests only" value={draftFilters.nearby} onValueChange={nearby => setDraftFilters({ ...draftFilters, nearby })} trackColor={{ false: COLORS.surfaceMuted, true: COLORS.honey }} />
              </View>
              {!locationAvailable && <ThemedText style={styles.contextHint}>Location unavailable. Nearby results appear only when a recent location or saved-place event confirms proximity.</ThemedText>}
            </ScrollView>
            <View style={styles.sheetActions}>
              <TouchableOpacity style={styles.filterPill} accessibilityRole="button" onPress={() => { setDraftFilters({ ...DEFAULT_FILTERS }); setAppliedFilters({ ...DEFAULT_FILTERS }); }}><ThemedText style={styles.filterText}>Reset Filters</ThemedText></TouchableOpacity>
              <TouchableOpacity style={[styles.filterPill, styles.filterPillActive]} accessibilityRole="button" onPress={() => { setAppliedFilters({ ...draftFilters }); setFiltersOpen(false); }}><ThemedText style={styles.filterTextActive}>Apply Filters</ThemedText></TouchableOpacity>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
      <Modal visible={!!questId} animationType="slide" onRequestClose={reward ? dismissReward : closeDetails}>
        <SafeAreaView style={styles.container}>
          <ScrollView contentContainerStyle={styles.content}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close quest details" onPress={() => { dismissReward(); closeDetails(); }} style={{ minHeight: 44, justifyContent: 'center' }}><ThemedText>Close details</ThemedText></TouchableOpacity>
            <SectionTitle title="Quest details" />
            {reward && <QuestReward {...reward} progress={levelProgress} onClose={dismissReward} />}
            {!reward && (selected ? <QuestCard key={selected.quest.id} quest={selected.quest} completing={completingId === selected.quest.id} reasons={selected.reasons} nearby={selected.nearby} details onEdit={() => { closeDetails(); router.push({ pathname: '/add-quest', params: { id: selected.quest.id } }); }} onComplete={proof => void handleComplete(selected.quest, proof)} onDelete={() => handleConfirmDelete(selected.quest)} /> : <ThemedText>{isLoading ? 'Loading quest...' : 'This quest is no longer available.'}</ThemedText>)}
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
            <TouchableOpacity style={styles.heroAddButton} accessibilityRole="button" accessibilityLabel="Create quest" onPress={() => router.push(isAuthenticated ? '/add-quest' : '/auth')} activeOpacity={0.8}>
              <Ionicons name={isAuthenticated ? 'add' : 'log-in-outline'} size={21} color={COLORS.ink} />
            </TouchableOpacity>
          </View>

          <View style={styles.viewToggle}>
            {(['context', 'all'] as const).map(value => (
              <TouchableOpacity key={value} accessibilityRole="button" accessibilityState={{ selected: view === value }} style={[styles.viewButton, view === value && styles.filterPillActive]} onPress={() => setView(value)}>
                <ThemedText style={[styles.filterText, view === value && styles.filterTextActive]}>{value === 'context' ? 'Recommended Quests' : 'All Quests'}</ThemedText>
              </TouchableOpacity>
            ))}
          </View>
          {view === 'context' ? <ThemedText style={styles.contextHint}>
            Ranked for your place, timing and activity. Choose the step that works for you.
            {!locationAvailable ? ' Location unavailable; timing and activity still guide recommendations.' : ''}
          </ThemedText> : <View style={styles.listHeading}>
            <ThemedText style={styles.contextHint}>Your quests, newest first</ThemedText>
            <TouchableOpacity style={styles.filterButton} accessibilityRole="button" accessibilityLabel={filterCount ? 'Filter, ' + filterCount + ' active filters' : 'Filter quests'} onPress={openFilters}>
              <Ionicons name="options-outline" size={18} color={COLORS.ink} /><ThemedText style={styles.filterTextActive}>Filter</ThemedText>
              {filterCount > 0 && <ThemedText style={styles.filterBadge}>{filterCount}</ThemedText>}
            </TouchableOpacity>
          </View>}
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
                completing={completingId === item.quest.id}
                reasons={item.reasons}
                priority={view === 'context' ? index + 1 : undefined}
                nearby={item.nearby}
                onOpen={view === 'context' ? () => router.setParams({ questId: item.quest.id }) : undefined}
                onComplete={(proof) => void handleComplete(item.quest, proof)}
                onDelete={() => handleConfirmDelete(item.quest)}
              />
            ))}

          {!isLoading && !loadError && visibleQuests.length === 0 && (
            <EmptyState
              icon="sparkles-outline"
              title="No quests in this view"
              subtitle={
                view === 'context' ? 'No actionable quests to recommend. Browse All Quests to check your goals and submissions.' : filterCount ? 'No quests match these filters. Try resetting them to see your collection.' : 'A small, specific quest is the best place to start.'
              }
              actionLabel={view === 'context' ? 'Browse All Quests' : filterCount ? 'Reset Filters' : 'New quest'}
              onPress={() => view === 'context' ? setView('all') : filterCount ? setAppliedFilters({ ...DEFAULT_FILTERS }) : router.push(user ? '/add-quest' : '/auth')}
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
  priority,
  nearby = false,
  onOpen,
  details = false,
  completing = false,
  onEdit,
  onComplete,
  onDelete,
}: {
  quest: Quest;
  reasons: string[];
  priority?: number;
  nearby?: boolean;
  onOpen?: () => void;
  details?: boolean;
  completing?: boolean;
  onEdit?: () => void;
  onComplete: (proof?: ProofFile) => void;
  onDelete: () => void;
}) {
  const [proof, setProof] = useState<ProofFile | undefined>();
  const [isPickingProof, setIsPickingProof] = useState(false);
  const visual = Object.hasOwn(categoryVisuals, quest.category) ? categoryVisuals[quest.category] : categoryVisuals.Habits;
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

      <View style={[styles.questCard, priority === 1 && styles.topRecommendation, isCompleted && styles.completedQuestCard]}>
      {priority !== undefined && <View style={styles.priorityRow}><ThemedText style={styles.rankBadge}>#{priority}</ThemedText><ThemedText style={styles.reasonText}>{priority === 1 ? 'Your next step' : 'Recommended'}</ThemedText></View>}
      <View style={[styles.questIcon, { backgroundColor: visual.color }]}>
        <Ionicons name={visual.icon} size={22} color={COLORS.ink} />
      </View>

      <View style={styles.questInfo}>
        <View style={styles.titleRow}>
          <ThemedText
            style={[styles.questTitle, isCompleted && styles.completedQuestTitle]}
            numberOfLines={details ? undefined : 2}>
            {quest.title}
          </ThemedText>
          {nearby && <Ionicons name="location" size={13} color={COLORS.honeyDark} />}
        </View>

        <ThemedText style={styles.questSubtitle} numberOfLines={details ? undefined : 2}>
          {quest.description || `${quest.category} quest`}
        </ThemedText>

        {(priority !== undefined || details) && !isCompleted && <ThemedText style={styles.reasonText}>{reasons.slice(0, 2).join(' / ')}</ThemedText>}
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
        {onOpen ? <TouchableOpacity style={styles.rewardAction} accessibilityRole="button" onPress={onOpen}><ThemedText style={styles.filterTextActive}>View quest</ThemedText><XpBadge xp={quest.xp} /></TouchableOpacity> : !isCompleted ? (
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
                disabled={!proof || completing}
                activeOpacity={0.7}
                accessibilityLabel={`Submit proof and complete quest for ${quest.xp} XP`}>
                <Ionicons name="cloud-upload-outline" size={14} color={COLORS.ink} />
                <ThemedText style={styles.proofSubmitText}>
                  {completing ? 'Submitting...' : proof ? 'Submit proof' : 'Choose proof'}
                </ThemedText>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.rewardAction}
                accessibilityRole="button"
                disabled={completing}
                accessibilityState={{ busy: completing, disabled: completing }}
                onPress={() => onComplete()}
                activeOpacity={0.7}
                accessibilityLabel={`Complete quest and earn ${quest.xp} XP`}>
                <Ionicons name="checkmark-circle-outline" size={20} color={COLORS.honeyDeep} /><ThemedText style={styles.filterTextActive}>{completing ? 'Completing...' : 'Complete quest'}</ThemedText><XpBadge xp={quest.xp} />
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

function FilterOptions({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return <View style={styles.optionGroup}>
    <ThemedText style={styles.sectionTitle}>{label}</ThemedText>
    <View style={styles.optionWrap}>{options.map(option => <TouchableOpacity key={option.value} accessibilityRole="button" accessibilityState={{ selected: value === option.value }} style={[styles.filterPill, value === option.value && styles.filterPillActive]} onPress={() => onChange(option.value)}><ThemedText style={[styles.filterText, value === option.value && styles.filterTextActive]}>{option.label}</ThemedText></TouchableOpacity>)}</View>
  </View>;
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
  rewardBackdrop: { flex: 1, backgroundColor: 'rgba(45,36,29,0.45)' },
  rewardContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  rewardAction: { minHeight: 48, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: COLORS.honeySoft, borderRadius: Radii.md, padding: 10 },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(45,36,29,0.35)' },
  filterSheet: { maxHeight: '90%', width: '100%', maxWidth: 640, alignSelf: 'center', backgroundColor: COLORS.background, borderTopLeftRadius: Radii.xl, borderTopRightRadius: Radii.xl, paddingHorizontal: 20, paddingTop: 12 },
  sheetContent: { gap: 18, paddingVertical: 12 },
  sheetActions: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, paddingVertical: 16 },
  optionGroup: { gap: 10 },
  optionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  viewButton: { flex: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center', padding: 10, borderRadius: Radii.md, backgroundColor: COLORS.card },
  filterButton: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 12, backgroundColor: COLORS.card, borderRadius: Radii.md },
  filterBadge: { color: COLORS.ink, backgroundColor: COLORS.honey, borderRadius: 12, paddingHorizontal: 7, fontSize: 12 },
  topRecommendation: { backgroundColor: COLORS.honeySoft, borderColor: COLORS.honey, borderWidth: 2, padding: 18 },
  priorityRow: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 10 },
  rankBadge: { backgroundColor: COLORS.honey, color: COLORS.honeyDeep, borderRadius: Radii.md, paddingHorizontal: 10, paddingVertical: 5, fontWeight: '800', fontSize: 16 },
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
  content: { gap: 12, paddingHorizontal: 20, paddingBottom: 112 },
  filterPill: { backgroundColor: COLORS.card, borderRadius: Radii.pill, paddingHorizontal: 14, paddingVertical: 9, minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: '#F1E4CF', ...BeeBetterShadow },
  filterPillActive: { backgroundColor: COLORS.honey },
  filterText: { color: COLORS.muted, fontSize: 12, fontWeight: '700' },
  filterTextActive: { color: COLORS.ink },
  listHeading: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between', marginTop: 7 },
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
