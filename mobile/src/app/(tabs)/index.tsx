import { useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { XpProgress } from '@/components/xp-visuals';
import { ThemedText } from '@/components/themed-text';
import { Button, IconButton, ScreenFrame, Sheet, StatusMessage, Surface } from '@/components/mobile-ui';
import { HomeMenu } from '@/components/home-menu';
import { UserAvatar } from '@/components/user-avatar';
import { Borders, Controls, Layout, Radii, Spacing, States, Typography, useBeePalette } from '@/constants/theme';
import { MOBILE_WELLNESS_AND_SUPPORT_ENABLED } from '@/constants/features';
import { useAppAppearance } from '@/hooks/use-app-appearance';
import { useQuestPriority } from '@/context/quest-priority-context';
import { useLocationContext } from '@/context/location-context';
import { useUserData } from '@/hooks/use-user-data';
import { recommendedQuests } from '@/lib/quest-discovery';

export default function HomeScreen() {
  const { user, profile, progressSummary, isLoading, isRefreshing, levelProgress, refresh, workspaceErrors, retryWorkspace } = useUserData();
  const c = useBeePalette();
  const [wellnessOpen, setWellnessOpen] = useState(false), [menuOpen, setMenuOpen] = useState(false);
  const { fontScale } = useWindowDimensions();
  const expanded = fontScale >= Layout.largeTextScale;
  const { scheme, toggleTheme } = useAppAppearance();
  const { ranked, locationAvailable } = useQuestPriority();
  const { locations } = useLocationContext();
  const next = recommendedQuests(ranked)[0];
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
        <IconButton icon={scheme === 'light' ? 'sunny-outline' : 'moon-outline'} label={scheme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'} onPress={toggleTheme} />
      </View>
      {isLoading && !profile ? <StatusMessage loading message="Loading your overview…" /> : <>
        <View style={s.section}>
          <Surface style={s.recommendation}>
            <View style={s.labelRow}>
              <Ionicons name="sparkles" size={16} color={c.primary} accessible={false} />
              <ThemedText type="small" style={{ color: c.muted }}>Recommended Quest</ThemedText>
            </View>
            {next ? <>
              <ThemedText type="subtitle">{next.quest.title}</ThemedText>
              {(next.quest.description?.trim() || next.reasons[0]) && <ThemedText type="small" numberOfLines={3} style={{ color: c.muted }}>{next.quest.description?.trim() || next.reasons[0]}</ThemedText>}
              <View style={s.questFooter}>
                <View style={[s.metadata, s.copy]}>
                  {place && <View style={s.labelRow}><Ionicons name="location-outline" size={16} color={c.muted} accessible={false} /><ThemedText type="small" style={{ color: c.muted, flexShrink: 1 }}>{place.name}</ThemedText></View>}
                  {Number.isFinite(next.quest.xp) && <ThemedText type="small" style={{ color: c.muted }}>+{next.quest.xp} XP</ThemedText>}
                </View>
                <Button intent="accent" label="View quest" icon="arrow-forward" onPress={() => router.push({ pathname: '/quests', params: { questId: next.quest.id } })} style={{ borderRadius: Radii.pill }} />
              </View>
            </> : <>
              <ThemedText type="subtitle">Choose your next small step</ThemedText>
              <ThemedText type="small" style={{ color: c.muted }}>Browse your quests or create a goal that fits your day.</ThemedText>
              <Button intent="accent" label="Explore quests" icon="arrow-forward" onPress={() => router.push('/quests')} />
            </>}
          </Surface>
          {next && !locationAvailable && <ThemedText type="small" style={{ color: c.muted }}>Timing and activity still guide suggestions when location is unavailable.</ThemedText>}
          {workspaceErrors.quests && <View accessibilityLiveRegion="polite">
            <ThemedText type="small" style={{ color: c.danger }}>{workspaceErrors.quests}</ThemedText>
            <Button intent="quiet" label="Retry quests" onPress={() => void retryWorkspace('quests')} />
          </View>}
        </View>
        <View style={s.section}>
          <View style={s.heading}>
            <ThemedText type="subtitle">Your progress</ThemedText>
            <View style={s.labelRow}><Ionicons name="ribbon-outline" size={Controls.iconSize} color={c.primary} accessible={false} /><ThemedText type="label">Level {levelProgress.level}</ThemedText></View>
          </View>
          <XpProgress progress={levelProgress} compact />
          <View style={s.stats}>
            <Surface style={[s.stat, expanded && s.statExpanded]}>
              <Ionicons name="calendar-outline" size={Controls.iconSize} color={c.foreground} accessible={false} />
              <View style={s.copy}><ThemedText type="item">{profile?.current_streak ?? 0} days</ThemedText><ThemedText type="small" style={{ color: c.muted }}>Current streak</ThemedText></View>
            </Surface>
            <Surface style={[s.stat, expanded && s.statExpanded]}>
              <Ionicons name="checkbox-outline" size={Controls.iconSize} color={c.foreground} accessible={false} />
              <View style={s.copy}><ThemedText type="item">{progressSummary.totalCompleted}</ThemedText><ThemedText type="small" style={{ color: c.muted }}>Quests completed · all time</ThemedText></View>
            </Surface>
          </View>
          {(workspaceErrors.profile || workspaceErrors.streak || workspaceErrors.progress) && <View accessibilityLiveRegion="polite">
            <ThemedText type="small" style={{ color: c.danger }}>Some progress could not be refreshed. Your saved information is still shown.</ThemedText>
            <Button intent="quiet" label="Retry progress" onPress={() => { for (const slice of ['profile', 'streak', 'progress'] as const) if (workspaceErrors[slice]) void retryWorkspace(slice); }} />
          </View>}
        </View>
        <View style={[s.shortcuts, expanded && { flexDirection: 'column' }]}>
          <Shortcut icon="person-outline" label="Profile" onPress={() => router.push('/profile')} />
          <Shortcut icon="bookmark-outline" label="Save Places" onPress={() => router.push('/manage-locations')} />
          <Shortcut icon="git-network-outline" label="Skill Tree" onPress={() => router.push('/skill-tree')} />
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
  recommendation: { padding: Spacing.lg, gap: Spacing.sm },
  questFooter: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.sm },
  metadata: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.sm },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  stat: { flexGrow: 1, flexBasis: '45%', minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', padding: Spacing.md, gap: Spacing.sm },
  statExpanded: { flexBasis: '100%' },
  shortcuts: { flexDirection: 'row', gap: Spacing.sm },
  shortcut: { flex: 1, minWidth: 0, minHeight: Controls.minHeight, padding: Spacing.sm, gap: Spacing.sm, borderRadius: Radii.lg, borderWidth: Borders.focus },
  shortcutIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: Radii.pill },
  shortcutLabel: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.xs },
  shortcutText: { ...Typography.metadata, flexShrink: 1 },
  entry: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: Spacing.lg, paddingVertical: Spacing.md },
});
