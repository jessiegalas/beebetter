import { useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { PixelButton } from '@/components/pixel/pixel-button';
import { PixelGlyph } from '@/components/pixel/pixel-glyph';
import { CategoryBadge } from '@/components/quest-visuals';
import { XpBadge, XpProgress } from '@/components/xp-visuals';
import { ThemedText } from '@/components/themed-text';
import { Button, IconButton, ScreenFrame, Sheet, StatusMessage, Surface } from '@/components/mobile-ui';
import { HomeMenu } from '@/components/home-menu';
import { DailyCheckIn } from '@/components/daily-check-in';
import { Borders, Controls, Layout, PixelBorders, PixelSpacing, Radii, Spacing, States, Typography, useBeePalette } from '@/constants/theme';
import { MOBILE_NOTIFICATIONS_ENABLED, MOBILE_WELLNESS_AND_SUPPORT_ENABLED } from '@/constants/features';
import { useQuestPriority } from '@/context/quest-priority-context';
import { useLocationContext } from '@/context/location-context';
import { useUserData } from '@/hooks/use-user-data';
import { GROUP_LABELS, recommendationGroup } from '@/lib/quest-discovery';
import { useHomeRecommendationVisibility, useRecommendationMeasurement } from '@/hooks/use-recommendation-measurement';
import { checkInDateKey, useDailyCheckIn } from '@/hooks/use-daily-check-in';

export default function HomeScreen() {
  const { user, profile, progressSummary, isLoading, isRefreshing, levelProgress, refresh, workspaceErrors, retryWorkspace } = useUserData();
  const c = useBeePalette();
  const [whyOpen, setWhyOpen] = useState(false);
  const [wellnessOpen, setWellnessOpen] = useState(false), [menuOpen, setMenuOpen] = useState(false);
  const { checkIn } = useLocalSearchParams<{ checkIn?: string }>();
  const canPrompt = !whyOpen && !wellnessOpen && !menuOpen && !(isLoading && !profile);
  const { day: checkInDay, open: openCheckIn, close: closeCheckIn } = useDailyCheckIn(user?.id, canPrompt);
  useEffect(() => {
    if (checkIn !== '1' || !canPrompt || !user?.id) return;
    openCheckIn();
    router.setParams({ checkIn: '' });
  }, [checkIn, canPrompt, user?.id, openCheckIn]);
  const { fontScale } = useWindowDimensions();
  const expanded = fontScale >= Layout.largeTextScale;
  const { recommendations, snoozesReady, snoozedCount, contextError, retryContext, undoSnooze, restoreSnoozes, lastSnoozedId } = useQuestPriority();
  const { locations } = useLocationContext();
  const next = recommendations[0];
  const recommendationRef = useRef<View>(null);
  const viewportRef = useRef<View>(null);
  const measurement = useRecommendationMeasurement('home', next ? [next] : [], snoozesReady && canPrompt && !checkInDay && !isLoading);
  useHomeRecommendationVisibility(recommendationRef, viewportRef, next?.quest.id, measurement.active, measurement.setVisible);
  const emptyRecommendationTitle = !snoozesReady && contextError ? 'Recommendations unavailable'
    : !snoozesReady || isLoading ? 'Loading recommendations…'
    : snoozedCount ? 'Your quests are snoozed'
    : contextError ? 'Recommendations need a refresh'
    : 'No quest recommended right now';
  const place = next?.quest.location_id ? locations.find(item => item.id === next.quest.location_id) : undefined;
  const whyButton = <IconButton icon="information-circle-outline" label="Why this quest" onPress={() => setWhyOpen(true)} />;
  const displayName = profile?.display_name?.trim() || profile?.name?.trim() || 'Explorer';
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
        {MOBILE_NOTIFICATIONS_ENABLED && <IconButton icon="notifications-outline" label="Open notifications" onPress={() => router.push('/notifications')} />}
      </View>
      {isLoading && !profile ? <StatusMessage loading message="Loading your overview…" /> : <>
        <View style={s.section}>
          <View ref={recommendationRef} collapsable={false}>
            {next ? <View style={[s.recommendation, { borderStartColor: c.primary }]}>
              <View style={s.recommendationHeading}>
                <View style={s.copy}>
                  <ThemedText type="small" style={{ color: c.muted }}>{GROUP_LABELS[recommendationGroup(next)]}</ThemedText>
                  <ThemedText type="subtitle" accessibilityRole="header">{next.quest.title}</ThemedText>
                </View>
                {!expanded && whyButton}
              </View>
              <View style={s.recommendationFooter}>
                <View style={s.recommendationMetadata}>
                  <CategoryBadge label={next.quest.category} />
                  {Number.isFinite(next.quest.xp) && <XpBadge xp={next.quest.xp} />}
                </View>
                <View style={s.recommendationActions}>
                  <PixelButton layout="wrap" label="View quest" onPress={() => {
                    measurement.action(next, 1, 'selection');
                    router.push({ pathname: '/quests', params: { questId: next.quest.id } });
                  }} style={s.recommendationAction} />
                  {expanded && whyButton}
                </View>
              </View>
            </View> : <View style={s.emptyRecommendation}>
              <ThemedText type="item" accessibilityRole="header" accessibilityLiveRegion="polite" style={s.emptyRecommendationTitle}>{emptyRecommendationTitle}</ThemedText>
              <View style={s.recommendationActions}>
                <Button intent="quiet" label="Explore quests" icon="arrow-forward" style={s.exploreQuests} onPress={() => router.push('/quests')} />
                {contextError && <IconButton icon="information-circle-outline" label="Recommendation status" onPress={() => setWhyOpen(true)} />}
              </View>
            </View>}
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
              <ThemedText type="item">Account level {levelProgress.level}</ThemedText>
              <Ionicons name="chevron-forward" size={16} color={c.muted} accessible={false} />
            </Pressable>
          </View>
          <XpProgress progress={levelProgress} compact />
          <View style={s.stats}>
            <Surface style={[s.stat, expanded && s.statExpanded]}>
              <View style={s.statValue}><PixelGlyph name="streak" /><ThemedText type="subtitle" accessibilityLabel={'Current streak: ' + (profile?.current_streak ?? 0) + ((profile?.current_streak ?? 0) === 1 ? ' day' : ' days')}>{profile?.current_streak ?? 0}</ThemedText></View>
              <ThemedText type="small" style={{ color: c.muted, textAlign: 'center' }}>Current streak</ThemedText>
            </Surface>
            <Surface style={[s.stat, expanded && s.statExpanded]}>
              <View style={s.statValue}><PixelGlyph name="leaf" /><ThemedText type="subtitle">{progressSummary.totalCompleted}</ThemedText></View>
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
        {!MOBILE_WELLNESS_AND_SUPPORT_ENABLED && <View style={s.section}>
          <View style={[s.divider, { backgroundColor: c.surfaceMuted }]} />
          <HomeEntry icon="heart-outline" title="Daily check-in" description="Optional well-being, stress, and energy ratings" onPress={() => openCheckIn()} />
        </View>}
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
        {(contextError || (next && !next.fresh)) && <>
          {(!contextError || !next?.constraints.includes(contextError)) && <ThemedText type="small">{contextError || 'Recommendation context is out of date.'}</ThemedText>}
          <Button intent="quiet" label="Retry context" onPress={retryContext} />
        </>}
      </Sheet>
      {MOBILE_WELLNESS_AND_SUPPORT_ENABLED && <Sheet title="Wellness" visible={wellnessOpen} onClose={() => setWellnessOpen(false)}>
        <ThemedText type="small" style={{ color: c.muted }}>These records are optional and private to you.</ThemedText>
        {[{ label: 'Daily check-in', route: '/wellness-check-in' }, { label: 'Self-management reflection', route: '/self-management-reflection' }, { label: 'My history and trends', route: '/wellness-history' }].map(item => <Button key={item.route} intent="secondary" label={item.label} onPress={() => { setWellnessOpen(false); router.push(item.route as '/wellness-check-in'); }} />)}
      </Sheet>}
    </ScreenFrame>
    <Sheet title="Daily check-in" visible={!!checkInDay} onClose={closeCheckIn} adjustKeyboardInsets expanded>
      {user && checkInDay && <DailyCheckIn key={`${user.id}:${checkInDateKey(checkInDay)}`} studentId={user.id} day={checkInDay}
        onClose={closeCheckIn} onHistory={() => {
          closeCheckIn();
          router.push('/wellness-history');
        }} />}
    </Sheet>
    <HomeMenu visible={menuOpen} onClose={() => setMenuOpen(false)} displayName={displayName} avatarUri={avatarUri} />
  </>;
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
  const [focused, setFocused] = useState(false);
  return <Pressable cssInterop={false} accessibilityRole="button" accessibilityLabel={title} accessibilityHint={description} onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={({ pressed }) => [s.entry, { borderColor: focused ? c.focus : 'transparent', backgroundColor: pressed ? c.surfaceMuted : 'transparent' }]}>
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
  recommendation: { borderStartWidth: PixelBorders.default, paddingStart: PixelSpacing.px4, gap: PixelSpacing.px2 },
  recommendationHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: PixelSpacing.px2 },
  recommendationFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: PixelSpacing.px2 },
  recommendationMetadata: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', maxWidth: '100%', columnGap: PixelSpacing.px4, rowGap: PixelSpacing.px2 },
  recommendationActions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', maxWidth: '100%', gap: PixelSpacing.px2 },
  recommendationAction: { flexShrink: 1, maxWidth: '100%' },
  emptyRecommendation: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: PixelSpacing.px2 },
  emptyRecommendationTitle: { flexGrow: 1, flexShrink: 1, flexBasis: 144 },
  exploreQuests: { paddingHorizontal: PixelSpacing.px2 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  stat: { flexGrow: 1, flexBasis: '45%', minWidth: 0, minHeight: Controls.minHeight * 2 + Spacing.lg, alignItems: 'center', justifyContent: 'center', padding: Spacing.md, gap: Spacing.sm },
  statValue: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  statExpanded: { flexBasis: '100%' },
  shortcuts: { flexDirection: 'row', gap: Spacing.sm },
  shortcut: { flex: 1, minWidth: 0, minHeight: Controls.minHeight, padding: Spacing.sm, gap: Spacing.sm, borderRadius: Radii.lg, borderWidth: Borders.focus },
  shortcutIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: Radii.pill },
  shortcutLabel: { minHeight: (Typography.metadata.lineHeight ?? 20) * 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.xs },
  shortcutText: { ...Typography.label, flex: 1, minWidth: 0 },
  entry: { minHeight: Controls.minHeight, flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.sm, borderWidth: Borders.focus, borderRadius: Radii.md },
});
