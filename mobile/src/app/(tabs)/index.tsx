import { useContext, useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { BottomTabBarHeightContext } from 'expo-router/js-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { PixelButton } from '@/components/pixel/pixel-button';
import { PixelFrame } from '@/components/pixel/pixel-frame';
import { CategoryBadge } from '@/components/quest-visuals';
import { XpBadge, XpProgress } from '@/components/xp-visuals';
import { ThemedText } from '@/components/themed-text';
import { Button, IconButton, ScreenFrame, Sheet, StatusMessage } from '@/components/mobile-ui';
import { HomeMenu } from '@/components/home-menu';
import { DailyCheckIn } from '@/components/daily-check-in';
import { Controls, Layout, PixelBorders, PixelSpacing, Typography, useBeePalette } from '@/constants/theme';
import { MOBILE_NOTIFICATIONS_ENABLED, MOBILE_WELLNESS_AND_SUPPORT_ENABLED } from '@/constants/features';
import { useQuestPriority } from '@/context/quest-priority-context';
import { useLocationContext } from '@/context/location-context';
import { useUserData } from '@/hooks/use-user-data';
import { GROUP_LABELS, recommendationGroup } from '@/lib/quest-discovery';
import { timestamp } from '@/lib/quest-time';
import { branchProgressList } from '@/lib/progression';
import { useHomeRecommendationVisibility, useRecommendationMeasurement } from '@/hooks/use-recommendation-measurement';
import { checkInDateKey, useDailyCheckIn } from '@/hooks/use-daily-check-in';

const OUTLINE = { appearance: 'flat', borderWidth: PixelBorders.default, cornerStep: PixelSpacing.px1 } as const;
const START_QUEST = 'Start quest';
const WEEK_DAYS = 7;
const MOODS = [{ label: 'Low', score: 2 }, { label: 'Okay', score: 3 }, { label: 'Good', score: 4 }] as const;
const STREAK_CELL_SIZE = PixelSpacing.px8 + PixelSpacing.px2;
const HONEYCOMB = 'M4 0H6V1H8V2H9V3H10V8H9V9H8V10H6V11H4V10H2V9H1V8H0V3H1V2H2V1H4Z';

export default function HomeScreen() {
  const { user, profile, progressSummary, isLoading, isRefreshing, levelProgress, refresh, workspaceErrors, retryWorkspace } = useUserData();
  const c = useBeePalette();
  const [whyOpen, setWhyOpen] = useState(false);
  const [wellnessOpen, setWellnessOpen] = useState(false), [menuOpen, setMenuOpen] = useState(false);
  const { checkIn } = useLocalSearchParams<{ checkIn?: string }>();
  const canPrompt = !whyOpen && !wellnessOpen && !menuOpen && !(isLoading && !profile);
  const { day: checkInDay, initialWellbeing, open: openCheckIn, close: closeCheckIn } = useDailyCheckIn(user?.id, canPrompt);
  useEffect(() => {
    if (checkIn !== '1' || !canPrompt || !user?.id) return;
    openCheckIn();
    router.setParams({ checkIn: '' });
  }, [checkIn, canPrompt, user?.id, openCheckIn]);
  const { fontScale } = useWindowDimensions();
  const largeText = fontScale >= Layout.largeTextScale;
  const { bottom } = useSafeAreaInsets();
  const tabBarHeight = useContext(BottomTabBarHeightContext);
  // The measured tab bar already includes its bottom safe-area inset.
  const bottomPadding = Math.max(bottom, tabBarHeight ?? 0) + PixelSpacing.px2;
  const { recommendations, now, snoozesReady, snoozedCount, contextError, retryContext, undoSnooze, restoreSnoozes, lastSnoozedId } = useQuestPriority();
  const { locations } = useLocationContext();
  const next = recommendations.find(item => recommendationGroup(item) === 'upcoming') ?? recommendations[0];
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
  const group = next ? recommendationGroup(next) : undefined;
  const scheduled = timestamp(next?.quest.scheduled_at);
  const scheduledTime = scheduled === null ? undefined : new Date(scheduled).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const questContext = [group === 'upcoming' ? 'Next quest' : group && GROUP_LABELS[group], scheduledTime].filter(Boolean).join(' · ');
  const xpRemaining = levelProgress.xpForNextLevel - levelProgress.currentLevelXp;
  const reachesNextLevel = next && xpRemaining > 0 && Number.isFinite(next.quest.xp) && next.quest.xp >= xpRemaining;
  const levelUpCopy = reachesNextLevel ? `Finish this to reach Level ${levelProgress.level + 1}` : null;
  const streak = Math.max(0, profile?.current_streak ?? 0);
  const filledCells = Math.min(streak, WEEK_DAYS);
  const daysLeft = WEEK_DAYS - filledCells;
  const streakCopy = streak ? `${streak}-day streak` : 'Start your streak today';
  const streakSummary = `${streak ? `${streak} day streak` : streakCopy}, ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} to go this week`;
  const completed = progressSummary?.totalCompleted ?? 0;
  const completionCopy = `${completed} ${completed === 1 ? 'quest' : 'quests'} completed`;
  const branches = branchProgressList(progressSummary?.byCategoryXp, progressSummary?.byCategory).length;
  const displayName = profile?.display_name?.trim() || profile?.name?.trim() || 'Explorer';
  const avatarUri = typeof user?.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : undefined;
  const whyButton = <IconButton icon="information-circle-outline" label="Why this quest" onPress={() => setWhyOpen(true)} />;
  const greeting = <View style={[s.copy, largeText && s.greetingLarge]}>
    <ThemedText type="title">Hi, {displayName}!</ThemedText>
    <ThemedText style={s.metadata}>
      {new Date(now).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · Level {levelProgress.level}
    </ThemedText>
  </View>;
  return <>
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: c.background }]} />
    <ScreenFrame tab viewportRef={viewportRef} contentStyle={[s.content, { paddingBottom: bottomPadding }]}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={c.primary} colors={[c.primary]} />}>
      <View style={[s.header, largeText && s.headerLarge]}>
        <IconButton icon="menu-outline" label="Open menu" onPress={() => setMenuOpen(true)} />
        {!largeText && greeting}
        {MOBILE_NOTIFICATIONS_ENABLED && <IconButton icon="notifications-outline" label="Open notifications" onPress={() => router.push('/notifications')} />}
        {largeText && greeting}
      </View>
      {isLoading && !profile ? <StatusMessage loading message="Loading your overview…" /> : <>
        <View style={s.section}>
          <View ref={recommendationRef} collapsable={false}>
            {next ? <View style={[s.recommendation, { borderStartColor: c.primary }]}>
              <View style={s.recommendationHeading}>
                <View style={s.copy}>
                  <ThemedText style={[s.metadata, { color: c.muted }]}>{questContext}</ThemedText>
                  <ThemedText type="subtitle" accessibilityRole="header">{next.quest.title}</ThemedText>
                  {levelUpCopy && <ThemedText style={[s.metadata, { color: c.muted }]}>{levelUpCopy}</ThemedText>}
                </View>
                {!largeText && whyButton}
              </View>
              <View style={s.recommendationFooter}>
                <View style={s.recommendationMetadata}>
                  <CategoryBadge label={next.quest.category} />
                  {Number.isFinite(next.quest.xp) && <XpBadge xp={next.quest.xp} />}
                </View>
                <View style={s.recommendationActions}>
                  <PixelButton layout="wrap" label={START_QUEST} onPress={() => {
                    measurement.action(next, 1, 'selection');
                    router.push({ pathname: '/quests', params: { questId: next.quest.id } });
                  }} style={s.recommendationAction} />
                  {largeText && whyButton}
                </View>
              </View>
            </View> : <View style={s.emptyRecommendation}>
              <ThemedText type="label" accessibilityRole="header" accessibilityLiveRegion="polite" style={s.emptyRecommendationTitle}>{emptyRecommendationTitle}</ThemedText>
              <View style={s.recommendationActions}>
                <Button intent="quiet" label="Explore quests" icon="arrow-forward" style={s.exploreQuests} onPress={() => router.push('/quests')} />
                {contextError && <IconButton icon="information-circle-outline" label="Recommendation status" onPress={() => setWhyOpen(true)} />}
              </View>
            </View>}
          </View>
          {lastSnoozedId && <View accessibilityLiveRegion="polite"><ThemedText style={s.metadata}>Quest snoozed for one hour.</ThemedText><Button intent="quiet" label="Undo" onPress={undoSnooze}/></View>}
          {snoozedCount > 0 && <Button intent="quiet" label="Restore snoozed quests" onPress={restoreSnoozes}/>}
          {workspaceErrors.quests && <View accessibilityLiveRegion="polite">
            <ThemedText style={[s.metadata, { color: c.danger }]}>{workspaceErrors.quests}</ThemedText>
            <Button intent="quiet" label="Retry quests" onPress={() => void retryWorkspace('quests')} />
          </View>}
        </View>
        <View style={s.section}>
          <XpProgress progress={levelProgress} scope="Account" layout="summary" captionStyle={[s.metadata, { color: c.foreground }]} />
          <View accessible accessibilityRole="text" accessibilityLabel={`${streakSummary}. ${completionCopy}`}>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden style={s.streak}>
              <View style={s.streakCells}>
                {Array.from({ length: WEEK_DAYS }, (_, index) =>
                  <Svg key={index} width={STREAK_CELL_SIZE} height={STREAK_CELL_SIZE + PixelSpacing.px1} viewBox="0 0 10 11">
                    <Path d={HONEYCOMB} fill={index < filledCells ? c.accent : c.surfaceMuted} />
                  </Svg>
                )}
              </View>
              <ThemedText style={s.metadata}>{streakCopy} · {completionCopy}</ThemedText>
            </View>
          </View>
          {(workspaceErrors.profile || workspaceErrors.streak || workspaceErrors.progress) && <View accessibilityLiveRegion="polite">
            <ThemedText style={[s.metadata, { color: c.danger }]}>Some progress could not be refreshed. Your saved information is still shown.</ThemedText>
            <Button intent="quiet" label="Retry progress" onPress={() => { for (const slice of ['profile', 'streak', 'progress'] as const) if (workspaceErrors[slice]) void retryWorkspace(slice); }} />
          </View>}
        </View>
        <View style={[s.divided, { borderColor: c.border }]}>
          <View style={s.checkInHeader}>
            <ThemedText type="label" accessibilityRole="header" style={s.sectionTitle}>How are you feeling?</ThemedText>
            <HomeTextAction label="Full check-in" onPress={() => openCheckIn()} />
          </View>
          <View style={s.moods}>
            {MOODS.map(({ label, score }) =>
              <MoodButton key={score} label={label} onPress={() => openCheckIn(undefined, score)} />
            )}
          </View>
        </View>
        <View style={[s.divided, { borderColor: c.border }]}>
          <HomeEntry title="Skill Tree" description={`${branches} branches`} role="link" onPress={() => router.push('/skill-tree')} />
        </View>
        {MOBILE_WELLNESS_AND_SUPPORT_ENABLED && <View style={s.section}>
          <ThemedText type="label">A moment for you</ThemedText>
          <HomeEntry icon="heart-outline" title="Wellness" description="Optional, private check-ins and reflections" onPress={() => setWellnessOpen(true)} />
          <HomeEntry icon="people-outline" title="Request OSAS support" description="Choose to contact authorized support personnel" onPress={() => router.push('/support-requests')} />
        </View>}
      </>}
      <Sheet title={next ? 'Why this quest' : 'Recommendation status'} visible={whyOpen} onClose={() => setWhyOpen(false)}>
        {next && <>
          <ThemedText type="label">{next.quest.title}</ThemedText>
          <ThemedText style={s.metadata}>{questContext}</ThemedText>
          <CategoryBadge label={next.quest.category} />
          {group !== 'now' && <ThemedText>This is an alternative to a recommendation for right now.</ThemedText>}
          {next.reasons.map(reason => <ThemedText key={reason}>{reason}</ThemedText>)}
          {next.constraints.map(reason => <ThemedText key={reason}>{reason}</ThemedText>)}
          {place && <ThemedText>Saved place: {place.name}</ThemedText>}
          {!!next.quest.description?.trim() && <ThemedText>{next.quest.description}</ThemedText>}
        </>}
        {(contextError || (next && !next.fresh)) && <>
          {(!contextError || !next?.constraints.includes(contextError)) && <ThemedText>{contextError || 'Recommendation context is out of date.'}</ThemedText>}
          <Button intent="quiet" label="Retry context" onPress={retryContext} />
        </>}
      </Sheet>
      {MOBILE_WELLNESS_AND_SUPPORT_ENABLED && <Sheet title="Wellness" visible={wellnessOpen} onClose={() => setWellnessOpen(false)}>
        <ThemedText>These records are optional and private to you.</ThemedText>
        {[{ label: 'Daily check-in', route: '/wellness-check-in' }, { label: 'Self-management reflection', route: '/self-management-reflection' }, { label: 'My history and trends', route: '/wellness-history' }].map(item => <Button key={item.route} intent="secondary" label={item.label} onPress={() => { setWellnessOpen(false); router.push(item.route as '/wellness-check-in'); }} />)}
      </Sheet>}
    </ScreenFrame>
    <Sheet title="Daily check-in" visible={!!checkInDay} onClose={closeCheckIn} adjustKeyboardInsets expanded>
      {user && checkInDay && <DailyCheckIn key={`${user.id}:${checkInDateKey(checkInDay)}`} studentId={user.id} day={checkInDay} initialWellbeing={initialWellbeing}
        onClose={closeCheckIn} onHistory={() => {
          closeCheckIn();
          router.push('/wellness-history');
        }} />}
    </Sheet>
    <HomeMenu visible={menuOpen} onClose={() => setMenuOpen(false)} displayName={displayName} avatarUri={avatarUri} />
  </>;
}

function HomeTextAction({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useBeePalette();
  const [focused, setFocused] = useState(false);
  return <Pressable cssInterop={false} accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    style={({ pressed }) => [s.textAction, {
      borderColor: focused ? c.focus : 'transparent',
      backgroundColor: pressed ? c.surfaceMuted : 'transparent',
    }]}>
    <ThemedText style={[s.metadata, s.actionLabel, { color: c.foreground }]}>{label}</ThemedText>
    <Ionicons name="chevron-forward" size={PixelSpacing.px4} color={c.foreground} accessible={false} />
  </Pressable>;
}

function MoodButton({ label, onPress }: { label: string; onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  return <Pressable cssInterop={false} accessibilityRole="button"
    accessibilityLabel={`${label} well-being, open daily check-in`} onPress={onPress}
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={s.mood}>
    {({ pressed }) => {
      const tone = pressed ? 'border' : 'surfaceMuted';
      return <PixelFrame {...OUTLINE} fill={tone} border={tone} focused={focused}>
        <View style={s.moodContent}>
          <ThemedText type="label" style={s.moodLabel}>{label}</ThemedText>
        </View>
      </PixelFrame>;
    }}
  </Pressable>;
}

function HomeEntry({ icon, title, description, onPress, role = 'button' }: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  onPress: () => void;
  role?: 'button' | 'link';
}) {
  const c = useBeePalette();
  const [focused, setFocused] = useState(false);
  return <Pressable cssInterop={false} accessibilityRole={role} accessibilityLabel={`${title}, ${description}`} onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={({ pressed }) => [s.entry, !icon && s.inlineEntry, { borderColor: focused ? c.focus : 'transparent', backgroundColor: pressed ? c.surfaceMuted : 'transparent' }]}>
    {icon && <Ionicons name={icon} size={Controls.iconSize} color={c.foreground} accessible={false} />}
    <View style={[s.copy, !icon && s.inlineCopy]}>
      <ThemedText type="label">{title}</ThemedText>
      <ThemedText style={s.metadata}>{description}</ThemedText>
    </View>
    <Ionicons name="chevron-forward" size={icon ? Controls.iconSize : PixelSpacing.px4} color={c.foreground} accessible={false} />
  </Pressable>;
}

const s = StyleSheet.create({
  content: { gap: PixelSpacing.px8, paddingHorizontal: PixelSpacing.px8, paddingTop: PixelSpacing.px6 },
  header: { flexDirection: 'row', alignItems: 'center', gap: PixelSpacing.px2 },
  headerLarge: { flexWrap: 'wrap', justifyContent: 'space-between' },
  greetingLarge: { flexBasis: '100%' },
  copy: { flex: 1, minWidth: 0 },
  metadata: Typography.homeMetadata,
  section: { gap: PixelSpacing.px3 },
  recommendation: { borderStartWidth: PixelBorders.default, paddingStart: PixelSpacing.px4, gap: PixelSpacing.px2 },
  recommendationHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: PixelSpacing.px2 },
  recommendationFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: PixelSpacing.px2 },
  recommendationMetadata: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', maxWidth: '100%', columnGap: PixelSpacing.px4, rowGap: PixelSpacing.px2 },
  recommendationActions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', maxWidth: '100%', gap: PixelSpacing.px2 },
  recommendationAction: { flexShrink: 1, maxWidth: '100%' },
  textAction: { minHeight: Controls.minHeight, minWidth: Controls.minHeight, maxWidth: '100%', borderWidth: PixelBorders.default, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: PixelSpacing.px1 },
  actionLabel: { flexShrink: 1 },
  emptyRecommendation: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: PixelSpacing.px2 },
  emptyRecommendationTitle: { flexGrow: 1, flexShrink: 1, flexBasis: Controls.minHeight * 3 },
  exploreQuests: { paddingHorizontal: PixelSpacing.px2 },
  streak: { gap: PixelSpacing.px3, paddingTop: PixelSpacing.px2 },
  streakCells: { flexDirection: 'row', flexWrap: 'wrap', gap: PixelSpacing.px2 },
  divided: { borderTopWidth: PixelBorders.default, paddingTop: PixelSpacing.px3, gap: PixelSpacing.px1 },
  checkInHeader: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between', columnGap: PixelSpacing.px3 },
  sectionTitle: { flexShrink: 1, maxWidth: '100%' },
  moods: { flexDirection: 'row', flexWrap: 'wrap', gap: PixelSpacing.px2 },
  mood: { flexGrow: 1, flexBasis: PixelSpacing.px16, minWidth: Controls.minHeight, minHeight: Controls.minHeight },
  moodContent: { minHeight: Controls.minHeight, justifyContent: 'center', paddingHorizontal: PixelSpacing.px2, paddingVertical: PixelSpacing.px3 },
  moodLabel: { textAlign: 'center' },
  entry: { minHeight: Controls.minHeight, flexDirection: 'row', alignItems: 'center', gap: PixelSpacing.px3, padding: PixelSpacing.px3, borderWidth: PixelBorders.default },
  inlineEntry: { padding: 0, gap: PixelSpacing.px1 },
  inlineCopy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', columnGap: PixelSpacing.px3 },
});
