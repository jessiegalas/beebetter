import { useRef, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { XpProgress } from '@/components/xp-visuals';
import { ThemedText } from '@/components/themed-text';
import { Button, IconButton, ScreenFrame, Sheet, StatusMessage, Surface } from '@/components/mobile-ui';
import { Card, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { RankedQuest } from '@/lib/quest-priority';
import { HomeMenu } from '@/components/home-menu';
import { Borders, Controls, Layout, Radii, Spacing, States, Typography, useBeePalette } from '@/constants/theme';
import { MOBILE_WELLNESS_AND_SUPPORT_ENABLED } from '@/constants/features';
import { useQuestPriority } from '@/context/quest-priority-context';
import { useLocationContext } from '@/context/location-context';
import { useUserData } from '@/hooks/use-user-data';
import { GROUP_LABELS, recommendationGroup } from '@/lib/quest-discovery';
import { useHomeRecommendationVisibility, useRecommendationMeasurement } from '@/hooks/use-recommendation-measurement';

const DEFAULT_QUEST_ILLUSTRATION = require('../../../assets/svg/book-svgrepo-com.svg');
// Static asset references let Metro bundle every category illustration.
const QUEST_ILLUSTRATIONS = new Map<string, number>([
  ['academics', DEFAULT_QUEST_ILLUSTRATION],
  ['health', require('../../../assets/svg/health-insurance-round-svgrepo-com.svg')],
  ['social', require('../../../assets/svg/user-social-network-svgrepo-com.svg')],
  ['habits', require('../../../assets/svg/infinite-symbol-svgrepo-com.svg')],
]);

export default function HomeScreen() {
  const { user, profile, progressSummary, isLoading, isRefreshing, levelProgress, refresh, workspaceErrors, retryWorkspace } = useUserData();
  const c = useBeePalette();
  const [whyOpen, setWhyOpen] = useState(false);
  const [helpFocused, setHelpFocused] = useState(false);
  const [wellnessOpen, setWellnessOpen] = useState(false), [menuOpen, setMenuOpen] = useState(false);
  const { fontScale } = useWindowDimensions();
  const expanded = fontScale >= Layout.largeTextScale;
  const { recommendations, snoozesReady, snoozedCount, contextError, retryContext, undoSnooze, restoreSnoozes, lastSnoozedId } = useQuestPriority();
  const { locations } = useLocationContext();
  const next = recommendations[0];
  const recommendationRef = useRef<View>(null);
  const viewportRef = useRef<View>(null);
  const measurement = useRecommendationMeasurement('home', next ? [next] : [], snoozesReady && !menuOpen && !wellnessOpen && !whyOpen && !isLoading);
  useHomeRecommendationVisibility(recommendationRef, viewportRef, next?.quest.id, measurement.active, measurement.setVisible);
  const summary = recommendationSummary(next);
  const illustration = QUEST_ILLUSTRATIONS.get(next?.quest.category?.trim().toLowerCase() ?? '') ?? DEFAULT_QUEST_ILLUSTRATION;
  const place = next?.quest.location_id ? locations.find(item => item.id === next.quest.location_id) : undefined;
  const displayName = profile?.display_name?.trim() || profile?.name?.trim() || user?.email?.split('@')[0] || 'Explorer';
  const avatarUri = typeof user?.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : undefined;
  return <>
    <ScreenFrame tab viewportRef={viewportRef} refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={c.primary} colors={[c.primary]} />}>
      <View style={s.header}>
        <IconButton icon="menu-outline" label="Open menu" onPress={() => setMenuOpen(true)} />
        <View style={s.identity}>
          <View style={s.copy}>
            <ThemedText type="subtitle" numberOfLines={1} ellipsizeMode="tail">Hi, {displayName}!</ThemedText>
            <ThemedText type="small" numberOfLines={1} style={{ color: c.muted }}>
              {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
            </ThemedText>
          </View>
        </View>
        <IconButton icon="notifications-outline" label="Open notifications" onPress={() => router.push('/notifications')} />
      </View>
      {isLoading && !profile ? <StatusMessage loading message="Loading your overview…" /> : <>
        <View style={s.section}>
          <View style={s.heading}>
            <ThemedText type="subtitle" accessibilityRole="header">{next ? GROUP_LABELS[recommendationGroup(next)] : 'Recommended now'}</ThemedText>
          </View>
          <View ref={recommendationRef} collapsable={false}>
            <Card className="gap-0 border-0 py-0 shadow-none" style={[s.recommendation, { backgroundColor: c.card }]}>
              <View style={s.questArt} pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants">
                <Image source={illustration} style={s.book} tintColor={c.primary} contentFit="contain" accessible={false} />
              </View>
              <CardHeader className="p-0" style={s.recommendationHeader}>
                <View style={s.recommendationCopy}>
                  <CardTitle numberOfLines={expanded ? undefined : 2} style={[Typography.section, { color: c.foreground }]}>{next ? next.quest.title : !snoozesReady && contextError ? 'Recommendations unavailable' : !snoozesReady || (isLoading && !next) ? 'Loading recommendations…' : snoozedCount ? 'Your quests are snoozed for now' : contextError ? 'Refresh to check recommendations' : 'Nothing fits your current context right now'}</CardTitle>
                  {!next && <ThemedText type="small" style={{ color: c.muted }}>Browse All Quests or restore snoozed quests.</ThemedText>}
                </View>
                {next && Number.isFinite(next.quest.xp) && <ThemedText type="item" style={[s.recommendationXp, { color: c.primary }]}>+{next.quest.xp} XP</ThemedText>}
              </CardHeader>
              <Separator style={{ backgroundColor: c.border, zIndex: 1 }} />
              <CardFooter className="p-0" style={[s.recommendationFooter, expanded && s.recommendationFooterExpanded]}>
                <Pressable cssInterop={false} accessibilityRole="button" accessibilityLabel={next ? 'Why this quest' : 'Recommendation status'} accessibilityHint="Opens the full recommendation explanation." accessibilityState={{ expanded: whyOpen }} onPress={() => setWhyOpen(true)} onFocus={() => setHelpFocused(true)} onBlur={() => setHelpFocused(false)} style={({ pressed }) => [s.recommendationReason, expanded && { flex: 0, alignSelf: 'stretch' }, { borderColor: helpFocused ? c.focus : 'transparent', backgroundColor: pressed ? c.surfaceMuted : 'transparent' }]}>
                  <Ionicons name={summary.icon} size={20} color={c.muted} accessible={false}/>
                  <ThemedText type="small" style={{ color: c.muted, flexShrink: 1 }}>{summary.label}</ThemedText>
                </Pressable>
                <Button intent="quiet" foregroundColor={c.foreground} label={next ? 'View quest' : 'Explore quests'} icon="arrow-forward" onPress={() => { if (next) { measurement.action(next, 1, 'selection'); router.push({ pathname: '/quests', params: { questId: next.quest.id } }); } else router.push('/quests'); }} style={s.recommendationView}/>
              </CardFooter>
            </Card>
          </View>
          {lastSnoozedId && <View accessibilityLiveRegion="polite"><ThemedText type="small">Quest snoozed for one hour.</ThemedText><Button intent="quiet" label="Undo" onPress={undoSnooze}/></View>}
          {snoozedCount > 0 && <Button intent="quiet" label="Restore snoozed quests" onPress={restoreSnoozes}/>}
          {workspaceErrors.quests && <View accessibilityLiveRegion="polite">
            <ThemedText type="small" style={{ color: c.danger }}>{workspaceErrors.quests}</ThemedText>
            <Button intent="quiet" label="Retry quests" onPress={() => void retryWorkspace('quests')} />
          </View>}
        </View>
        <View style={s.section}>
          <View style={[s.divider, { backgroundColor: c.surfaceMuted }]} />
          <View style={s.heading}>
            <ThemedText type="subtitle">Your progress</ThemedText>
            <Pressable cssInterop={false} accessibilityRole="button" accessibilityLabel={'Open Skill Tree, level ' + levelProgress.level} onPress={() => router.push('/skill-tree')} style={({ pressed }) => [s.levelLink, { opacity: pressed ? States.pressedOpacity : 1 }]}>
              <Ionicons name="ribbon" size={Controls.iconSize} color={c.primary} accessible={false} />
              <ThemedText type="item">Level {levelProgress.level}</ThemedText>
              <Ionicons name="chevron-forward" size={16} color={c.muted} accessible={false} />
            </Pressable>
          </View>
          <XpProgress progress={levelProgress} compact />
          <View style={s.stats}>
            <Surface style={[s.stat, expanded && s.statExpanded]}>
              <View style={s.statValue}><Ionicons name="calendar-outline" size={Controls.iconSize} color={c.primary} accessible={false} /><ThemedText type="subtitle" accessibilityLabel={'Current streak: ' + (profile?.current_streak ?? 0) + ((profile?.current_streak ?? 0) === 1 ? ' day' : ' days')}>{profile?.current_streak ?? 0}</ThemedText></View>
              <ThemedText type="small" style={{ color: c.muted, textAlign: 'center' }}>Current streak</ThemedText>
            </Surface>
            <Surface style={[s.stat, expanded && s.statExpanded]}>
              <View style={s.statValue}><Ionicons name="checkbox-outline" size={Controls.iconSize} color={c.primary} accessible={false} /><ThemedText type="subtitle">{progressSummary.totalCompleted}</ThemedText></View>
              <ThemedText type="small" style={{ color: c.muted, textAlign: 'center' }}>Quests completed</ThemedText>
            </Surface>
          </View>
          {(workspaceErrors.profile || workspaceErrors.streak || workspaceErrors.progress) && <View accessibilityLiveRegion="polite">
            <ThemedText type="small" style={{ color: c.danger }}>Some progress could not be refreshed. Your saved information is still shown.</ThemedText>
            <Button intent="quiet" label="Retry progress" onPress={() => { for (const slice of ['profile', 'streak', 'progress'] as const) if (workspaceErrors[slice]) void retryWorkspace(slice); }} />
          </View>}
        </View>
        <View style={s.section}>
          <View style={[s.divider, { backgroundColor: c.surfaceMuted }]} />
          <View style={[s.shortcuts, expanded && { flexDirection: 'column' }]}>
            <Shortcut icon="person-outline" label="Profile" onPress={() => router.push('/profile')} />
            <Shortcut icon="bookmark-outline" label="Save Places" onPress={() => router.push('/manage-locations')} />
            <Shortcut icon="git-network-outline" label="Skill Tree" onPress={() => router.push('/skill-tree')} />
          </View>
        </View>
        {MOBILE_WELLNESS_AND_SUPPORT_ENABLED && <View style={s.section}>
          <ThemedText type="subtitle">A moment for you</ThemedText>
          <HomeEntry icon="heart-outline" title="Wellness" description="Optional, private check-ins and reflections" onPress={() => setWellnessOpen(true)} />
          <HomeEntry icon="people-outline" title="Request OSAS support" description="Choose to contact authorized support personnel" onPress={() => router.push('/support-requests')} />
        </View>}
      </>}
      <Sheet title={next ? 'Why this quest' : 'Recommendation status'} visible={whyOpen} onClose={() => setWhyOpen(false)}>
        {next && <>
          <ThemedText type="item">{next.quest.title}</ThemedText>
          <ThemedText type="small">{GROUP_LABELS[recommendationGroup(next)]}</ThemedText>
          {recommendationGroup(next) !== 'now' && <ThemedText type="small">This is an alternative to a recommendation for right now.</ThemedText>}
          {next.reasons.map(reason => <ThemedText key={reason} type="small">{reason}</ThemedText>)}
          {next.constraints.map(reason => <ThemedText key={reason} type="small">{reason}</ThemedText>)}
          {place && <ThemedText type="small">Saved place: {place.name}</ThemedText>}
          {!!next.quest.description?.trim() && <ThemedText type="small">{next.quest.description}</ThemedText>}
        </>}
        {contextError && <><ThemedText type="small">{contextError}</ThemedText><Button intent="quiet" label="Retry context" onPress={retryContext}/></>}
        {!next && !contextError && <ThemedText type="small">Browse All Quests or restore snoozed quests.</ThemedText>}
      </Sheet>
      {MOBILE_WELLNESS_AND_SUPPORT_ENABLED && <Sheet title="Wellness" visible={wellnessOpen} onClose={() => setWellnessOpen(false)}>
        <ThemedText type="small" style={{ color: c.muted }}>These records are optional and private to you.</ThemedText>
        {[{ label: 'Daily check-in', route: '/wellness-check-in' }, { label: 'Self-management reflection', route: '/self-management-reflection' }, { label: 'My history and trends', route: '/wellness-history' }].map(item => <Button key={item.route} intent="secondary" label={item.label} onPress={() => { setWellnessOpen(false); router.push(item.route as '/wellness-check-in'); }} />)}
      </Sheet>}
    </ScreenFrame>
    <HomeMenu visible={menuOpen} onClose={() => setMenuOpen(false)} displayName={displayName} avatarUri={avatarUri} />
  </>;
}

type SummaryIcon = 'location-outline' | 'time-outline' | 'flag-outline' | 'repeat-outline' | 'git-network-outline' | 'help-circle-outline' | 'refresh-outline' | 'create-outline';
function recommendationSummary(item?: RankedQuest): { label: string; icon: SummaryIcon } {
  if (!item) return { label: 'Recommendation status', icon: 'help-circle-outline' };
  if (!item.fresh) return { label: 'Refresh recommendations', icon: 'refresh-outline' };
  if (item.quest.status === 'rejected') return { label: 'Quest needs revision', icon: 'create-outline' };
  const evidence = [...(item.evidence ?? [])].filter(e => e.kind === 'positive').sort((a, b) => b.contribution - a.contribution)[0];
  const code = evidence?.code ?? '';
  if (code === 'location_at' || code === 'location_nearby') return { label: 'Location-based quest', icon: 'location-outline' };
  if (code === 'location_time') return { label: 'Time and location fit', icon: 'location-outline' };
  if (code === 'deadline_overdue') return { label: 'Overdue deadline', icon: 'time-outline' };
  if (code.startsWith('deadline_')) return { label: 'Deadline approaching', icon: 'time-outline' };
  if (code.startsWith('schedule_') || code.startsWith('preferred_')) return { label: 'Time-based quest', icon: 'time-outline' };
  if (code === 'importance_high') return { label: 'High importance', icon: 'flag-outline' };
  if (code === 'goal_alignment') return { label: 'Shared goal term', icon: 'flag-outline' };
  if (code === 'activity_gap' || code === 'activity_variety') return { label: 'Recorded activity', icon: 'repeat-outline' };
  if (code === 'unlocks_quest') return { label: 'Unlocks other quests', icon: 'git-network-outline' };
  return { label: 'Why this quest', icon: 'help-circle-outline' };
}

function Shortcut({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  const c = useBeePalette(), [focused, setFocused] = useState(false);
  return <Pressable cssInterop={false} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={({ pressed }) => [s.shortcut, { backgroundColor: pressed ? c.surfaceMuted : c.card, borderColor: focused ? c.focus : 'transparent' }]}>
    <View style={[s.shortcutIcon, { backgroundColor: c.surface }]}><Ionicons name={icon} size={Controls.iconSize} color={c.foreground} accessible={false} /></View>
    <View style={s.shortcutLabel}><ThemedText style={s.shortcutText}>{label}</ThemedText><Ionicons name="chevron-forward" size={12} color={c.muted} accessible={false} /></View>
  </Pressable>;
}

function HomeEntry({ icon, title, description, onPress }: { icon: keyof typeof Ionicons.glyphMap; title: string; description: string; onPress: () => void }) {
  const c = useBeePalette();
  return <Pressable cssInterop={false} accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => [s.entry, { opacity: pressed ? States.pressedOpacity : 1 }]}>
    <Ionicons name={icon} size={Controls.iconSize} color={c.foreground} accessible={false} />
    <View style={s.copy}><ThemedText type="item">{title}</ThemedText><ThemedText type="small" style={{ color: c.muted }}>{description}</ThemedText></View>
    <Ionicons name="chevron-forward" size={Controls.iconSize} color={c.muted} accessible={false} />
  </Pressable>;
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  identity: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  copy: { flex: 1, minWidth: 0 },
  section: { gap: Spacing.md },
  heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  divider: { height: Borders.default },
  levelLink: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, minHeight: Controls.minHeight, paddingHorizontal: Spacing.xs },
  recommendation: { position: 'relative', overflow: 'hidden', padding: Spacing.gutter, gap: Spacing.lg, borderRadius: Radii.xl },
  recommendationHeader: { zIndex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.lg, paddingHorizontal: 0, minHeight: 56 },
  recommendationCopy: { flex: 1, minWidth: 0, gap: Spacing.sm },
  recommendationXp: { flexShrink: 0, paddingTop: Spacing.xs },
  recommendationFooter: { zIndex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md, paddingHorizontal: 0 },
  recommendationFooterExpanded: { flexDirection: 'column', alignItems: 'stretch', gap: Spacing.sm },
  recommendationReason: { flex: 1, minWidth: 0, minHeight: Controls.minHeight, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xs, paddingHorizontal: Spacing.xs, borderWidth: Borders.focus, borderRadius: Radii.sm },
  recommendationView: { alignSelf: 'flex-end', minWidth: 108, flexDirection: 'row-reverse', paddingHorizontal: Spacing.xs },
  questArt: { position: 'absolute', zIndex: 0, bottom: -Spacing.section, right: -Spacing.page, width: Spacing.page * 5, height: Spacing.page * 5, alignItems: 'center', justifyContent: 'center', opacity: 0.2 },
  book: { width: Spacing.page * 5, height: Spacing.page * 5, transform: [{ rotate: '15deg' }] },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  stat: { flexGrow: 1, flexBasis: '45%', minWidth: 0, minHeight: Controls.minHeight * 2 + Spacing.lg, alignItems: 'center', justifyContent: 'center', padding: Spacing.md, gap: Spacing.sm },
  statValue: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  statExpanded: { flexBasis: '100%' },
  shortcuts: { flexDirection: 'row', gap: Spacing.sm },
  shortcut: { flex: 1, minWidth: 0, minHeight: Controls.minHeight, padding: Spacing.sm, gap: Spacing.sm, borderRadius: Radii.lg, borderWidth: Borders.focus },
  shortcutIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: Radii.pill },
  shortcutLabel: { minHeight: (Typography.metadata.lineHeight ?? 20) * 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.xs },
  shortcutText: { ...Typography.label, flex: 1, minWidth: 0 },
  entry: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: Spacing.lg, paddingVertical: Spacing.md },
});
