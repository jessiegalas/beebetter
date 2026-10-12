import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Alert, Pressable, RefreshControl, StyleSheet, Switch, TouchableOpacity, View, ScrollView, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { XpBadge, QuestReward } from '@/components/xp-visuals';
import { ThemedText } from '@/components/themed-text';
import { Button, IconButton, Surface } from '@/components/mobile-ui';
import { useBeePalette, useBeeStyles, type BeePalette, Borders, Controls, Layout, Radii, Spacing, States, Typography } from '@/constants/theme';
import { useUserData, Quest, QuestStatus, ProofFile } from '@/hooks/use-user-data';
import { useQuestCategories } from '@/hooks/use-quest-categories';
import { useQuestPriority } from '@/context/quest-priority-context';
import { activeFilterCount, DEFAULT_FILTERS, filterAllQuests, recommendedQuests, type QuestFilters } from '@/lib/quest-discovery';
import { createRecommendationSession, recordRecommendationEvent } from '@/lib/recommendation-events';
const statusCopy: Record<QuestStatus, {
    label: string;
}> = { active: { label: 'Active' }, rejected: { label: 'Needs revision' }, pending: { label: 'Pending review' }, completed: { label: 'Completed' } };
export default function QuestsScreen() {
    const { user } = useUserData();
    return <QuestList key={user?.id ?? 'signed-out'}/>;
}
function QuestList() {
    const COLORS = useBeePalette();
    const styles = useBeeStyles(makeStyles);
    const { user, levelProgress, questsHasMore, isLoading, isRefreshing, workspaceErrors, retryWorkspace, refresh, completeQuest, deleteQuest } = useUserData();
    const { width, fontScale } = useWindowDimensions();
    const expandedTabs = fontScale >= Layout.largeTextScale && width < Layout.wideBreakpoint;
    const loadError = workspaceErrors.quests;
    const { categories } = useQuestCategories();
    const [proofDrafts, setProofDrafts] = useState<Record<string, ProofFile | undefined>>({});
    const mounted = useRef(true);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    const [reward, setReward] = useState<{
        title: string;
        xp: number;
        previousLevel: number;
    } | null>(null);
    const completionBusy = useRef(false);
    const [completingId, setCompletingId] = useState<string | null>(null);
    const dismissReward = () => setReward(null);
    const { questId } = useLocalSearchParams<{
        questId?: string;
    }>();
    const closeDetails = () => router.setParams({ questId: '' });
    const { ranked, locationAvailable, now } = useQuestPriority();
    const selected = ranked.find(item => item.quest.id === questId);
    const [view, setView] = useState<'context' | 'all'>('context');
    const recommendationSession = useRef(createRecommendationSession());
    const [dismissed, setDismissed] = useState<Set<string>>(new Set());
    const [appliedFilters, setAppliedFilters] = useState<QuestFilters>(DEFAULT_FILTERS);
    const [draftFilters, setDraftFilters] = useState<QuestFilters>(DEFAULT_FILTERS);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const isAuthenticated = Boolean(user);
    const filterCount = activeFilterCount(appliedFilters);
    const openFilters = () => { setDraftFilters({ ...appliedFilters }); setFiltersOpen(true); };
    const visibleRanked = useMemo(() => view === 'context'
        ? recommendedQuests(ranked).filter(item => !dismissed.has(item.quest.id))
        : filterAllQuests(ranked, appliedFilters, now), [ranked, appliedFilters, view, now, dismissed]);
    const visibleQuests = visibleRanked.map(item => item.quest);
    useEffect(() => {
        if (view !== 'context' || isLoading || loadError)
            return;
        visibleRanked.slice(0, 10).forEach((item, index) => {
            void recordRecommendationEvent({ questId: item.quest.id, eventType: 'exposure',
                sessionId: recommendationSession.current, rankPosition: index + 1, reasonCodes: item.reasonCodes }).catch(() => undefined);
        });
    }, [view, isLoading, loadError, visibleRanked]);
    const openRecommendation = (item: typeof visibleRanked[number], index: number) => {
        void recordRecommendationEvent({ questId: item.quest.id, eventType: 'selection',
            sessionId: recommendationSession.current, rankPosition: index + 1, reasonCodes: item.reasonCodes }).catch(() => undefined);
        router.setParams({ questId: item.quest.id });
    };
    const dismissRecommendation = (item: typeof visibleRanked[number], index: number) => {
        void recordRecommendationEvent({ questId: item.quest.id, eventType: 'dismissal',
            sessionId: recommendationSession.current, rankPosition: index + 1, reasonCodes: item.reasonCodes }).catch(() => undefined);
        setDismissed(current => new Set(current).add(item.quest.id));
    };
    const handleConfirmDelete = (quest: Quest) => {
        Alert.alert('Delete Quest', `Are you sure you want to delete "${quest.title}"?`, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete',
                style: 'destructive',
                onPress: () => deleteQuest(quest.id)
            },
        ]);
    };
    const handleComplete = async (quest: Quest, proof?: ProofFile) => {
        if (completionBusy.current || quest.status === 'completed')
            return;
        completionBusy.current = true;
        setCompletingId(quest.id);
        const previousLevel = levelProgress.level;
        try {
            const result = await completeQuest(quest.id, proof);
            if (!mounted.current)
                return;
            if (result.success) {
                setProofDrafts(current => ({ ...current, [quest.id]: undefined }));
                setReward({ title: quest.title, xp: quest.xp, previousLevel });
            }
            else
                Alert.alert('Could not complete quest', result.error || 'Please try again.');
        }
        catch {
            if (mounted.current)
                Alert.alert('Could not complete quest', 'Please try again. Your selected proof is still available.');
        }
        finally {
            completionBusy.current = false;
            if (mounted.current)
                setCompletingId(null);
        }
    };
    return <View style={styles.container}>
      <Modal visible={!!reward && !questId} transparent animationType="fade" onRequestClose={dismissReward}>
    <View style={styles.rewardBackdrop}>
    <ScrollView contentContainerStyle={styles.rewardContent}>
    {reward && <QuestReward {...reward} progress={levelProgress} onClose={dismissReward}/>}
    </ScrollView>
    </View>
    </Modal>
      <Modal visible={filtersOpen} transparent animationType="slide" onRequestClose={() => setFiltersOpen(false)}>
        <View style={styles.sheetBackdrop}>
          <SafeAreaView style={styles.filterSheet} edges={['bottom']} accessibilityViewIsModal>
            <View style={styles.listHeading}>
              <ThemedText style={styles.sectionTitle}>Filter All Quests</ThemedText>
              <TouchableOpacity style={styles.deleteIconButton} accessibilityRole="button" accessibilityLabel="Close filters without applying" onPress={() => setFiltersOpen(false)}>
    <Ionicons name="close" size={24} color={COLORS.ink}/>
    </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.sheetContent}>
              <FilterOptions label="Category" value={draftFilters.category ?? ''} options={[
            { value: '', label: 'All categories' }, ...Array.from(new Set([...categories.map(category => category.name), ...ranked.map(item => item.quest.category)])).sort().map(value => ({ value, label: value })),
        ]} onChange={value => setDraftFilters({ ...draftFilters, category: value || null })}/>
              <FilterOptions label="Status" value={draftFilters.status} options={[
            { value: 'all', label: 'All statuses' }, { value: 'active', label: 'Active' }, { value: 'rejected', label: 'Needs revision' }, { value: 'pending', label: 'Pending review' }, { value: 'completed', label: 'Completed' },
        ]} onChange={value => setDraftFilters({ ...draftFilters, status: value as QuestFilters['status'] })}/>
              <FilterOptions label="Schedule & time" value={draftFilters.time} options={[
            { value: 'all', label: 'Any time' }, { value: 'today', label: 'Today' }, { value: 'overdue', label: 'Overdue' }, { value: 'scheduled', label: 'Has timing' }, { value: 'anytime', label: 'No timing set' },
        ]} onChange={value => setDraftFilters({ ...draftFilters, time: value as QuestFilters['time'] })}/>
              <ThemedText style={styles.contextHint}>Today includes scheduled dates, deadlines and daily preferred times. Overdue includes active quests and quests needing revision.</ThemedText>
              <View style={styles.listHeading}>
                <ThemedText style={styles.sectionTitle}>Nearby quests only</ThemedText>
                <Switch accessibilityLabel="Nearby quests only" value={draftFilters.nearby} onValueChange={nearby => setDraftFilters({ ...draftFilters, nearby })} trackColor={{ false: COLORS.surfaceMuted, true: COLORS.honey }}/>
              </View>
              {!locationAvailable && <ThemedText style={styles.contextHint}>Location unavailable. Nearby results appear only when a recent location or saved-place event confirms proximity.</ThemedText>}
            </ScrollView>
            <View style={styles.sheetActions}>
              <TouchableOpacity style={styles.filterPill} accessibilityRole="button" onPress={() => { setDraftFilters({ ...DEFAULT_FILTERS }); setAppliedFilters({ ...DEFAULT_FILTERS }); }}>
    <ThemedText style={styles.filterText}>Reset Filters</ThemedText>
    </TouchableOpacity>
              <TouchableOpacity style={[styles.filterPill, styles.filterPillActive]} accessibilityRole="button" onPress={() => { setAppliedFilters({ ...draftFilters }); setFiltersOpen(false); }}>
    <ThemedText style={styles.filterTextActive}>Apply Filters</ThemedText>
    </TouchableOpacity>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
      <Modal visible={!!questId} animationType="slide" onRequestClose={reward ? dismissReward : closeDetails}>
        <SafeAreaView style={styles.container}>
    <View style={styles.detailHeader}>
    <ThemedText type="title">Quest details</ThemedText>
    <IconButton icon="close" label="Close quest details" onPress={() => { dismissReward(); closeDetails(); }}/>
    </View>
    <ScrollView contentContainerStyle={styles.content}>
          {reward ? <QuestReward {...reward} progress={levelProgress} onClose={dismissReward}/> : selected ? <QuestCard key={selected.quest.id} quest={selected.quest} reasons={selected.reasons} locked={selected.locked} details completing={completingId === selected.quest.id} proof={proofDrafts[selected.quest.id]} onProofChange={proof => setProofDrafts(current => ({ ...current, [selected.quest.id]: proof }))} onEdit={() => { closeDetails(); router.push({ pathname: '/add-quest', params: { id: selected.quest.id } }); }} onComplete={proof => void handleComplete(selected.quest, proof)} onDelete={() => handleConfirmDelete(selected.quest)}/> : <ThemedText>
        {isLoading ? 'Loading quest…' : 'This quest is no longer available.'}
        </ThemedText>}
        </ScrollView>
    </SafeAreaView>
      </Modal>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.listControls}>
          <View style={[styles.viewToggle, expandedTabs && styles.expandedViews]} accessibilityRole="tablist">
            {(['context', 'all'] as const).map(value => <QuestViewTab key={value} label={value === 'context' ? 'Recommended' : 'All Quests'} selected={view === value} onPress={() => setView(value)}/>)}
          </View>
          <View style={styles.listToolbar}>
            <View style={styles.toolbarCount}>
              <ThemedText type="small" style={{ color: COLORS.muted }}>{visibleQuests.length + (visibleQuests.length === 1 ? ' quest' : ' quests')}</ThemedText>
            </View>
            <View aria-hidden={view !== 'all'} pointerEvents={view === 'all' ? 'auto' : 'none'} accessibilityElementsHidden={view !== 'all'} importantForAccessibility={view === 'all' ? 'auto' : 'no-hide-descendants'} style={[styles.toolbarFilter, view !== 'all' && styles.hiddenControl]}>
              <Button intent="quiet" icon="options-outline" label={filterCount ? 'Filters (' + filterCount + ')' : 'Filters'} disabled={view !== 'all'} onPress={openFilters}/>
            </View>
          </View>
          {questsHasMore && <ThemedText type="small">More quests are loading. Suggestions may reorder.</ThemedText>}
          {loadError && <View accessibilityLiveRegion="polite">
            <ThemedText type="small" style={{ color: COLORS.danger }}>{loadError}</ThemedText>
            <Button intent="quiet" label="Retry quests" onPress={() => void retryWorkspace('quests')}/>
          </View>}
        </View>
        <FlatList style={styles.list} data={visibleRanked} keyExtractor={item => item.quest.id} extraData={completingId} contentContainerStyle={[styles.content, styles.listContent, visibleQuests.length === 0 && styles.emptyListContent]} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={COLORS.honeyDark} colors={[COLORS.honeyDark]}/>} ItemSeparatorComponent={() => <View style={{ height: 16 }}/>} renderItem={({ item, index }) => <QuestCard quest={item.quest} reasons={item.reasons} priority={view === 'context' ? index + 1 : undefined} locked={item.locked} nearby={item.nearby} completing={completingId === item.quest.id} proof={proofDrafts[item.quest.id]} onProofChange={proof => setProofDrafts(current => ({ ...current, [item.quest.id]: proof }))} onOpen={() => view === 'context' ? openRecommendation(item, index) : router.setParams({ questId: item.quest.id })} onDismiss={view === 'context' ? () => dismissRecommendation(item, index) : undefined} onComplete={proof => { if (completionBusy.current)
        return; if (view === 'context')
        void recordRecommendationEvent({ questId: item.quest.id, eventType: 'selection', sessionId: recommendationSession.current, rankPosition: index + 1, reasonCodes: item.reasonCodes }).catch(() => undefined); void handleComplete(item.quest, proof); }} onDelete={() => handleConfirmDelete(item.quest)}/>} ListEmptyComponent={isLoading ? <View style={styles.stateCard}>
        <ActivityIndicator color={COLORS.honeyDark}/>
        <ThemedText>Loading your quests…</ThemedText>
        </View> : !loadError ? <EmptyState title="No quests in this view" subtitle={view === 'all' && filterCount ? 'Try resetting filters to see your quests.' : 'Create a small, specific quest to get started.'} actionLabel={view === 'all' && filterCount ? 'Reset filters' : 'New quest'} actionIcon={view === 'all' && filterCount ? 'refresh-outline' : 'add'} onPress={() => view === 'all' && filterCount ? setAppliedFilters({ ...DEFAULT_FILTERS }) : router.push(isAuthenticated ? '/add-quest' : '/auth')} onBrowse={view === 'context' ? () => setView('all') : undefined}/> : null}/>
      </SafeAreaView>
    </View>;
}
function QuestCard({ quest, reasons, priority, locked = false, details = false, completing = false, proof, onProofChange, onOpen, onDismiss, onEdit, onComplete, onDelete }: {
    quest: Quest;
    reasons: string[];
    priority?: number;
    nearby?: boolean;
    locked?: boolean;
    details?: boolean;
    completing?: boolean;
    proof?: ProofFile;
    onProofChange: (proof?: ProofFile) => void;
    onOpen?: () => void;
    onDismiss?: () => void;
    onEdit?: () => void;
    onComplete: (proof?: ProofFile) => void;
    onDelete: () => void;
}) {
    const COLORS = useBeePalette();
    const styles = useBeeStyles(makeStyles);
    const setProof = onProofChange;
    const [isPickingProof, setIsPickingProof] = useState(false);
    const chooseMediaProof = async () => {
        setIsPickingProof(true);
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.All,
                quality: 0.8
            });
            if (!result.canceled && result.assets[0]) {
                const asset = result.assets[0];
                setProof({
                    uri: asset.uri,
                    name: asset.fileName || `quest-proof-${Date.now()}`,
                    mimeType: asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg')
                });
            }
        }
        finally {
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
        }
        finally {
            setIsPickingProof(false);
        }
    };
    const status = { label: statusCopy[quest.status]?.label ?? 'Active', color: quest.status === 'rejected' ? COLORS.danger : quest.status === 'pending' ? COLORS.honeyDark : COLORS.success };
    const canComplete = quest.status === 'active' && !locked;
    const timing = quest.deadline_at ? 'Due ' + new Date(quest.deadline_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : quest.scheduled_at ? 'Scheduled ' + new Date(quest.scheduled_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : quest.preferred_time ? 'Preferred at ' + quest.preferred_time.slice(0, 5) : '';
    if (!details)
        return <Surface featured={priority === 1}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={'View ' + quest.title} onPress={onOpen} style={{ minHeight: 48, gap: 8 }}>
        <View style={styles.listHeading}>
        <ThemedText type="small" style={{ color: COLORS.muted }}>
        {quest.category}
        </ThemedText>
        <XpBadge xp={quest.xp}/>
        </View>
        <ThemedText type="item">
        {quest.title}
        </ThemedText>
        <ThemedText type="small" style={{ color: status.color }}>
        {locked ? 'Prerequisite required' : status.label}
        </ThemedText>
            {!!timing && <ThemedText type="small" style={{ color: COLORS.muted }}>
            {timing}
            </ThemedText>}{reasons[0] && <ThemedText type="small" aria-hidden={priority === undefined} accessibilityElementsHidden={priority === undefined} importantForAccessibility={priority === undefined ? 'no-hide-descendants' : 'auto'} style={[{ color: COLORS.muted }, priority === undefined && styles.hiddenControl]}>
            {reasons[0]}
            </ThemedText>}
        </TouchableOpacity>
        <View style={styles.compactActions}>
        {canComplete && !quest.requires_proof ? <Button label="Complete" icon="checkmark-outline" intent={priority === 1 ? 'primary' : 'secondary'} loading={completing} onPress={() => onComplete()}/> : <Button label={quest.requires_proof ? 'View proof requirements' : 'View details'} intent="secondary" onPress={() => onOpen?.()}/>}<View aria-hidden={!onDismiss} pointerEvents={onDismiss ? 'auto' : 'none'} accessibilityElementsHidden={!onDismiss} importantForAccessibility={onDismiss ? 'auto' : 'no-hide-descendants'} style={!onDismiss && styles.hiddenControl}>
          <Button label="Not now" intent="quiet" disabled={!onDismiss} onPress={() => onDismiss?.()}/>
        </View>
        </View>
        </Surface>;
    return <Surface>
    <View style={styles.listHeading}>
    <ThemedText type="small" style={{ color: COLORS.muted }}>
    {quest.category}
    </ThemedText>
    <XpBadge xp={quest.xp}/>
    </View>
    <ThemedText type="title">
    {quest.title}
    </ThemedText>
    <ThemedText type="small" style={{ color: status.color }}>
    {status.label}
    </ThemedText>
        {!!quest.description && <ThemedText>
        {quest.description}
        </ThemedText>}{locked && <ThemedText style={{ color: COLORS.danger }}>Complete the prerequisite quest first.</ThemedText>}{[quest.scheduled_at ? 'Scheduled: ' + new Date(quest.scheduled_at).toLocaleString() : '', quest.preferred_time ? 'Preferred time: ' + quest.preferred_time.slice(0, 5) : '', quest.deadline_at ? 'Deadline: ' + new Date(quest.deadline_at).toLocaleString() : ''].filter(Boolean).map(label => <ThemedText key={label} type="small" style={{ color: COLORS.muted }}>
        {label}
        </ThemedText>)}{reasons.length > 0 && <View style={{ gap: 8 }}>
        <ThemedText type="label">Why this quest</ThemedText>
            {reasons.map(reason => <ThemedText key={reason} type="small" style={{ color: COLORS.muted }}>
            {reason}
            </ThemedText>)}
        </View>}
    {quest.status !== 'completed' && <>
            {quest.requires_proof && <View style={{ gap: 12 }}>
            <ThemedText type="subtitle">Proof of completion</ThemedText>
                {proof ? <>
                <ThemedText>
                {proof.name}
                </ThemedText>
                <Button label="Remove selected proof" intent="quiet" disabled={completing} onPress={() => setProof(undefined)}/>
                </> : <View style={styles.compactActions}>
                <Button label="Photo or video" icon="image-outline" intent="secondary" disabled={isPickingProof || completing} onPress={() => void chooseMediaProof().catch(() => Alert.alert('Could not select proof', 'Try selecting the file again.'))}/>
                <Button label="File" icon="document-attach-outline" intent="secondary" disabled={isPickingProof || completing} onPress={() => void chooseFileProof().catch(() => Alert.alert('Could not select proof', 'Try selecting the file again.'))}/>
                </View>}
            </View>}
        <Button label={quest.requires_proof ? 'Submit proof and complete' : 'Complete quest'} loading={completing} disabled={!canComplete || (quest.requires_proof && !proof) || isPickingProof} onPress={() => onComplete(proof)}/>
        <View style={styles.compactActions}>
        <Button label="Edit quest" icon="create-outline" intent="quiet" disabled={completing} onPress={() => onEdit?.()}/>
        <Button label="Delete quest" icon="trash-outline" intent="destructive" disabled={completing} onPress={onDelete}/>
        </View>
        </>}
  </Surface>;
}
function FilterOptions({ label, value, options, onChange }: {
    label: string;
    value: string;
    options: {
        value: string;
        label: string;
    }[];
    onChange: (value: string) => void;
}) {
    const styles = useBeeStyles(makeStyles);
    return <View style={styles.optionGroup}>
    <ThemedText style={styles.sectionTitle}>
    {label}
    </ThemedText>
    <View style={styles.optionWrap}>
        {options.map(option => <TouchableOpacity key={option.value} accessibilityRole="button" accessibilityState={{ selected: value === option.value }} style={[styles.filterPill, value === option.value && styles.filterPillActive]} onPress={() => onChange(option.value)}>
        <ThemedText style={[styles.filterText, value === option.value && styles.filterTextActive]}>
        {option.label}
        </ThemedText>
        </TouchableOpacity>)}
    </View>
  </View>;
}
function QuestViewTab({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
    const COLORS = useBeePalette();
    const styles = useBeeStyles(makeStyles);
    const [focused, setFocused] = useState(false);
    return <Pressable cssInterop={false} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected }} onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={({ pressed }) => [styles.viewButton, { backgroundColor: pressed ? COLORS.surfaceMuted : 'transparent', borderColor: focused ? COLORS.focus : 'transparent', borderBottomColor: selected ? COLORS.accent : COLORS.surfaceMuted }]}>
      <ThemedText style={[styles.viewLabel, { color: selected ? COLORS.foreground : COLORS.muted }]}>{label}</ThemedText>
    </Pressable>;
}
function EmptyState({ title, subtitle, actionLabel, actionIcon, onPress, onBrowse }: {
    title: string;
    subtitle: string;
    actionLabel: string;
    actionIcon: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
    onBrowse?: () => void;
}) {
    const COLORS = useBeePalette();
    const styles = useBeeStyles(makeStyles);
    const [focused, setFocused] = useState(false);
    const [browseFocused, setBrowseFocused] = useState(false);
    return <View style={styles.emptyState}>
      {/* Reserved for the supplied bee artwork. */}
      <View style={styles.emptyIllustration} accessible={false} importantForAccessibility="no-hide-descendants">
        <Ionicons name="image-outline" size={16} color={COLORS.border} accessible={false} />
      </View>
      <ThemedText accessibilityRole="header" style={styles.emptyTitle}>{title}</ThemedText>
      <ThemedText style={styles.emptySubtitle}>{subtitle}</ThemedText>
      <Pressable cssInterop={false} accessibilityRole="button" accessibilityLabel={actionLabel} onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={({ pressed }) => [styles.emptyButton, { borderColor: focused ? COLORS.foreground : 'transparent', opacity: pressed ? States.pressedOpacity : 1 }]}>
        <Ionicons name={actionIcon} size={16} color={COLORS.accentForeground} accessible={false} />
        <ThemedText style={styles.emptyButtonText}>{actionLabel}</ThemedText>
      </Pressable>
      <View aria-hidden={!onBrowse} pointerEvents={onBrowse ? 'auto' : 'none'} accessibilityElementsHidden={!onBrowse} importantForAccessibility={onBrowse ? 'auto' : 'no-hide-descendants'} style={[styles.browseRow, !onBrowse && styles.hiddenControl]}>
        <ThemedText style={styles.browseHint}>or browse</ThemedText>
        <Pressable cssInterop={false} accessibilityRole="button" accessibilityLabel="Browse All Quests" disabled={!onBrowse} onPress={onBrowse} onFocus={() => setBrowseFocused(true)} onBlur={() => setBrowseFocused(false)} style={({ pressed }) => [styles.browseLink, { borderColor: browseFocused ? COLORS.focus : 'transparent', opacity: pressed ? States.pressedOpacity : 1 }]}>
          <ThemedText style={styles.browseText}>All Quests</ThemedText>
        </Pressable>
      </View>
    </View>;
}
const makeStyles = (COLORS: BeePalette) => StyleSheet.create({
    listControls: { gap: Spacing.lg, width: '100%', maxWidth: Layout.maxContentWidth, alignSelf: 'center', paddingHorizontal: Spacing.gutter, paddingTop: Spacing.xl, paddingBottom: Spacing.lg },
    list: { flex: 1 },
    listContent: { paddingTop: 0, paddingBottom: Spacing.lg },
    emptyListContent: { flexGrow: 1, justifyContent: 'center', paddingTop: Spacing.lg, paddingBottom: Spacing.lg },
    listToolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm, minHeight: Controls.minHeight },
    toolbarCount: { minHeight: Controls.minHeight, justifyContent: 'center' },
    toolbarFilter: { minHeight: Controls.minHeight, justifyContent: 'center' },
    hiddenControl: { opacity: 0 },
    detailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20 },
    compactActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    rewardBackdrop: { flex: 1, backgroundColor: 'rgba(45,36,29,0.45)' },
    rewardContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },
    sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(45,36,29,0.35)' },
    filterSheet: { maxHeight: '90%', width: '100%', maxWidth: 640, alignSelf: 'center', backgroundColor: COLORS.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 12 },
    sheetContent: { gap: 18, paddingVertical: 12 },
    sheetActions: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, paddingVertical: 16 },
    optionGroup: { gap: 10 },
    optionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    viewButton: { flex: 1, minHeight: Controls.minHeight, justifyContent: 'center', alignItems: 'center', paddingHorizontal: Spacing.xs, paddingVertical: Spacing.md, borderWidth: Borders.focus },
    viewToggle: { flexDirection: 'row' },
    expandedViews: { flexDirection: 'column' },
    viewLabel: { ...Typography.item, fontWeight: '600', textAlign: 'center' },
    contextHint: { fontSize: 14, lineHeight: 20, color: COLORS.muted },
    container: { flex: 1, backgroundColor: 'transparent' },
    safeArea: { flex: 1 },
    content: { width: '100%', maxWidth: Layout.maxContentWidth, alignSelf: 'center', paddingHorizontal: Spacing.gutter, paddingTop: Spacing.xl, paddingBottom: Spacing.section },
    filterPill: { backgroundColor: COLORS.card, borderRadius: Radii.pill, paddingHorizontal: 14, paddingVertical: 9, minHeight: 48, justifyContent: 'center', borderWidth: 1, borderColor: COLORS.surfaceMuted },
    filterPillActive: { backgroundColor: COLORS.honeySoft },
    filterText: { color: COLORS.muted, fontSize: 14, fontWeight: '700', lineHeight: 20 },
    filterTextActive: { color: COLORS.ink },
    listHeading: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between', marginTop: 7 },
    sectionTitle: { color: COLORS.ink, fontSize: 20, fontWeight: '700', lineHeight: 28 },
    deleteIconButton: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
    stateCard: { alignItems: 'center', gap: 10, padding: 20, backgroundColor: COLORS.card, borderRadius: 24 },
    emptyState: { alignItems: 'center', paddingTop: Spacing.lg, paddingBottom: Spacing.lg },
    emptyIllustration: { width: 40, height: 32, borderWidth: Borders.default, borderStyle: 'dashed', borderColor: COLORS.border, borderRadius: Radii.md, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm },
    emptyTitle: { ...Typography.item, color: COLORS.foreground, fontWeight: '700', textAlign: 'center' },
    emptySubtitle: { ...Typography.metadata, color: COLORS.foreground, textAlign: 'center', maxWidth: 240, marginTop: Spacing.xs },
    emptyButton: { minHeight: Controls.minHeight, width: 140, maxWidth: '100%', backgroundColor: COLORS.accent, borderRadius: Radii.md, marginTop: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, flexDirection: 'row', gap: Spacing.sm, alignItems: 'center', justifyContent: 'center', borderWidth: Borders.focus },
    emptyButtonText: { ...Typography.label, color: COLORS.accentForeground, flexShrink: 1, textAlign: 'center' },
    browseRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', columnGap: Spacing.xs, marginTop: Spacing.xs },
    browseHint: { ...Typography.metadata, color: COLORS.muted },
    browseLink: { minHeight: Controls.minHeight, justifyContent: 'center', paddingHorizontal: Spacing.xs, borderWidth: Borders.focus, borderRadius: Radii.sm },
    browseText: { ...Typography.metadata, color: COLORS.primary, textDecorationLine: 'underline' }
});
