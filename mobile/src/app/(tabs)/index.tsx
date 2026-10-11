import { useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { XpProgress } from '@/components/xp-visuals';
import { ThemedText } from '@/components/themed-text';
import { Button, IconButton, ScreenFrame, Sheet, StatusMessage, Surface } from '@/components/mobile-ui';
import { HomeMenu } from '@/components/home-menu';
import { UserAvatar } from '@/components/user-avatar';
import { Borders, Controls, Layout, Radii, Spacing, States, Typography, useBeePalette } from '@/constants/theme';
import { MOBILE_WELLNESS_AND_SUPPORT_ENABLED } from '@/constants/features';
import { useQuestPriority } from '@/context/quest-priority-context';
import { useLocationContext } from '@/context/location-context';
import { useUserData } from '@/hooks/use-user-data';
import { recommendedQuests } from '@/lib/quest-discovery';

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
  const [wellnessOpen, setWellnessOpen] = useState(false), [menuOpen, setMenuOpen] = useState(false);
  const { fontScale } = useWindowDimensions();
  const expanded = fontScale >= Layout.largeTextScale;
  const { ranked, locationAvailable } = useQuestPriority();
  const { locations } = useLocationContext();
  const next = recommendedQuests(ranked)[0];
  const illustration = QUEST_ILLUSTRATIONS.get(next?.quest.category?.trim().toLowerCase() ?? '') ?? DEFAULT_QUEST_ILLUSTRATION;
  const place = next?.quest.location_id ? locations.find(item => item.id === next.quest.location_id) : undefined;
  const displayName = profile?.display_name?.trim() || profile?.name?.trim() || user?.email?.split('@')[0] || 'Explorer';
  const avatarUri = typeof user?.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : undefined;
  return <>
    <ScreenFrame tab refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={c.primary} colors={[c.primary]} />}>
      <View style={s.header}>
        <IconButton icon="menu-outline" label="Open menu" onPress={() => setMenuOpen(true)} />
        <View style={s.identity}>
          <UserAvatar uri={avatarUri} />
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
          <Surface style={[s.recommendation, expanded && s.recommendationExpanded]}>
            <View style={s.questArt} pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants">
              <Image source={illustration} style={s.book} tintColor={c.primary} contentFit="contain" accessible={false} />
            </View>
            <View style={s.recommendationCopy}>
              <View style={s.labelRow}>
                <Ionicons name="sparkles" size={16} color={c.accent} accessible={false} />
                <ThemedText type="small" style={{ color: c.muted }}>Recommended Quest</ThemedText>
              </View>
              <ThemedText type="item">{next ? next.quest.title : 'Choose your next small step'}</ThemedText>
              {next ? (next.quest.description?.trim() || next.reasons[0]) && <ThemedText type="small" numberOfLines={expanded ? undefined : 3} style={{ color: c.muted }}>{next.quest.description?.trim() || next.reasons[0]}</ThemedText> : <ThemedText type="small" style={{ color: c.muted }}>Browse your quests or create a goal that fits your day.</ThemedText>}
              {next && <View style={s.metadata}>
                {place && <View style={[s.labelRow, { flexShrink: 1 }]}><Ionicons name="location-outline" size={16} color={c.muted} accessible={false} /><ThemedText type="small" style={{ color: c.muted, flexShrink: 1 }}>{place.name}</ThemedText></View>}
                {Number.isFinite(next.quest.xp) && <ThemedText type="small" style={{ color: c.muted }}>+{next.quest.xp} XP</ThemedText>}
              </View>}
            </View>
            <View style={[s.recommendationAction, expanded && { width: '100%' }]}>
              <Button intent="accent-quiet" foregroundColor="#000000" label={next ? 'View quest' : 'Explore quests'} icon="arrow-forward" onPress={() => next ? router.push({ pathname: '/quests', params: { questId: next.quest.id } }) : router.push('/quests')} style={{ paddingHorizontal: Spacing.sm, width: '100%', flexDirection: 'row-reverse', flexWrap: 'nowrap' }} />
            </View>
          </Surface>
          {next && !locationAvailable && <ThemedText type="small" style={{ color: c.muted }}>Timing and activity still guide suggestions when location is unavailable.</ThemedText>}
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
      {MOBILE_WELLNESS_AND_SUPPORT_ENABLED && <Sheet title="Wellness" visible={wellnessOpen} onClose={() => setWellnessOpen(false)}>
        <ThemedText type="small" style={{ color: c.muted }}>These records are optional and private to you.</ThemedText>
        {[{ label: 'Daily check-in', route: '/wellness-check-in' }, { label: 'Self-management reflection', route: '/self-management-reflection' }, { label: 'My history and trends', route: '/wellness-history' }].map(item => <Button key={item.route} intent="secondary" label={item.label} onPress={() => { setWellnessOpen(false); router.push(item.route as '/wellness-check-in'); }} />)}
      </Sheet>}
    </ScreenFrame>
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
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  divider: { height: Borders.default },
  levelLink: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, minHeight: Controls.minHeight, paddingHorizontal: Spacing.xs },
  recommendation: { position: 'relative', overflow: 'hidden', padding: Spacing.lg, gap: Spacing.md, flexDirection: 'row', alignItems: 'center' },
  recommendationExpanded: { flexDirection: 'column', alignItems: 'stretch' },
  recommendationCopy: { zIndex: 1, flex: 1, minWidth: 0, gap: Spacing.sm },
  recommendationAction: { zIndex: 1, width: 120, minHeight: Controls.minHeight * 2 + Spacing.lg, alignSelf: 'stretch', justifyContent: 'flex-end', alignItems: 'center' },
  questArt: { position: 'absolute', zIndex: 0, bottom: -Spacing.section, right: -Spacing.page, width: Spacing.page * 5, height: Spacing.page * 5, alignItems: 'center', justifyContent: 'center', opacity: 0.2 },
  book: { width: Spacing.page * 5, height: Spacing.page * 5, transform: [{ rotate: '15deg' }] },
  metadata: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.sm },
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
