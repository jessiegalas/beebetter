import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { XpBadge, XpProgress } from '@/components/xp-visuals';
import { ThemedText } from '@/components/themed-text';
import { BeeMark } from '@/components/bee-visuals';
import { Button, IconButton, ScreenFrame, Sheet, Surface } from '@/components/mobile-ui';
import { useBeePalette } from '@/constants/theme';
import { MOBILE_WELLNESS_AND_SUPPORT_ENABLED } from '@/constants/features';
import { useQuestPriority } from '@/context/quest-priority-context';
import { useUserData } from '@/hooks/use-user-data';
import { recommendedQuests } from '@/lib/quest-discovery';
export default function HomeScreen() {
    const { user, profile, progressSummary, isLoading, isRefreshing, levelProgress, refresh, workspaceErrors, retryWorkspace } = useUserData();
    const c = useBeePalette(), [wellnessOpen, setWellnessOpen] = useState(false);
    const { ranked, locationAvailable } = useQuestPriority();
    const next = recommendedQuests(ranked)[0];
    const displayName = profile?.display_name?.trim() || profile?.name?.trim() || user?.email?.split('@')[0] || 'Explorer';
    return <ScreenFrame tab refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={c.honeyDark} colors={[c.honeyDark]}/>}>
    <View style={s.header}>
    <BeeMark size={36}/>
    <View style={s.copy}>
    <ThemedText type="title">Hi, {displayName}
    </ThemedText>
    <ThemedText type="small" style={{ color: c.muted }}>
    {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
    </ThemedText>
    </View>
    <IconButton icon="notifications-outline" label="Open notifications" onPress={() => router.push('/notifications')}/>
    </View>
    {isLoading && !profile ? <View style={s.loading} accessibilityLiveRegion="polite">
        <ActivityIndicator color={c.honeyDark}/>
        <ThemedText>Loading your overview…</ThemedText>
        </View> : <>
      <Surface>
        <ThemedText type="subtitle">Your progress</ThemedText>
        <XpProgress progress={levelProgress}/>
        <View style={s.stats}>
        <View style={s.copy}>
        <ThemedText type="item">
        {profile?.current_streak ?? 0} days</ThemedText>
        <ThemedText type="small" style={{ color: c.muted }}>Current streak</ThemedText>
        </View>
        <View style={s.copy}>
        <ThemedText type="item">
        {progressSummary.totalCompleted}
        </ThemedText>
        <ThemedText type="small" style={{ color: c.muted }}>Quests completed · all time</ThemedText>
        </View>
        </View>
        </Surface>
      {(workspaceErrors.profile || workspaceErrors.streak || workspaceErrors.progress) && <View accessibilityLiveRegion="polite">
            <ThemedText type="small" style={{ color: c.danger }}>Some progress could not be refreshed. Your saved information is still shown.</ThemedText>
            <Button intent="quiet" label="Retry progress" onPress={() => { for (const slice of ['profile', 'streak', 'progress'] as const)
                if (workspaceErrors[slice])
                    void retryWorkspace(slice); }}/>
            </View>}
      <View style={s.section}>
        <View style={s.heading}>
        <ThemedText type="subtitle">A next step</ThemedText>
        <Button intent="quiet" label="All quests" onPress={() => router.push('/quests')}/>
        </View>
        <Surface featured>
            {next ? <>
            <View style={s.heading}>
            <ThemedText type="small" style={{ color: c.muted }}>
            {next.quest.category}
            </ThemedText>
            <XpBadge xp={next.quest.xp}/>
            </View>
            <ThemedText type="item">
            {next.quest.title}
            </ThemedText>
                {next.reasons[0] && <ThemedText type="small" style={{ color: c.muted }}>
                {next.reasons[0]}
                </ThemedText>}
            <Button label="View quest" onPress={() => router.push({ pathname: '/quests', params: { questId: next.quest.id } })}/>
            </> : <>
            <ThemedText type="item">Choose your next small step</ThemedText>
            <ThemedText>Browse your quests or create a goal that fits your day.</ThemedText>
            <Button label="Explore quests" onPress={() => router.push('/quests')}/>
            </>}{!locationAvailable && <ThemedText type="small" style={{ color: c.muted }}>Timing and activity still guide suggestions when location is unavailable.</ThemedText>}
        </Surface>
            {workspaceErrors.quests && <View accessibilityLiveRegion="polite">
            <ThemedText type="small" style={{ color: c.danger }}>
            {workspaceErrors.quests}
            </ThemedText>
            <Button intent="quiet" label="Retry quests" onPress={() => void retryWorkspace('quests')}/>
            </View>}
        </View>
      {MOBILE_WELLNESS_AND_SUPPORT_ENABLED && <View style={s.section}>
        <ThemedText type="subtitle">A moment for you</ThemedText>
        <HomeEntry icon="heart-outline" title="Wellness" description="Optional, private check-ins and reflections" onPress={() => setWellnessOpen(true)}/>
        <HomeEntry icon="people-outline" title="Request OSAS support" description="Choose to contact authorized support personnel" onPress={() => router.push('/support-requests')}/>
        </View>}
    </>}
    {MOBILE_WELLNESS_AND_SUPPORT_ENABLED && <Sheet title="Wellness" visible={wellnessOpen} onClose={() => setWellnessOpen(false)}>
    <ThemedText type="small" style={{ color: c.muted }}>These records are optional and private to you.</ThemedText>
    {[{ label: 'Daily check-in', route: '/wellness-check-in' }, { label: 'Self-management reflection', route: '/self-management-reflection' }, { label: 'My history and trends', route: '/wellness-history' }].map(item => <Button key={item.route} intent="secondary" label={item.label} onPress={() => { setWellnessOpen(false); router.push(item.route as '/wellness-check-in'); }}/>)}
    </Sheet>}
  </ScreenFrame>;
}
function HomeEntry({ icon, title, description, onPress }: {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    description: string;
    onPress: () => void;
}) {
    const c = useBeePalette();
    return <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => [s.entry, { opacity: pressed ? .7 : 1 }]}>
    <Ionicons name={icon} size={20} color={c.ink} accessible={false}/>
    <View style={s.copy}>
    <ThemedText type="item">
    {title}
    </ThemedText>
    <ThemedText type="small" style={{ color: c.muted }}>
    {description}
    </ThemedText>
    </View>
    <Ionicons name="chevron-forward" size={20} color={c.muted} accessible={false}/>
    </Pressable>;
}
const s = StyleSheet.create({ header: { flexDirection: 'row', alignItems: 'center', gap: 12 }, copy: { flex: 1, minWidth: 0 }, section: { gap: 16 }, heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 20 }, entry: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 12 }, loading: { paddingVertical: 32, alignItems: 'center', gap: 16 } });
