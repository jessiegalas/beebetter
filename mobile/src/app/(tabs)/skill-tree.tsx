import { Pressable, RefreshControl, StyleSheet, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Line } from 'react-native-svg';
import { ThemedText } from '@/components/themed-text';
import { ScreenFrame, Surface } from '@/components/mobile-ui';
import { useBeePalette } from '@/constants/theme';
import { useUserData } from '@/hooks/use-user-data';
import { branchProgressList, countReachedMilestones, milestoneWindow } from '@/lib/progression';
const branchIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
    Academics: 'book-outline',
    Habits: 'checkmark-done-outline',
    Social: 'people-outline',
    Health: 'heart-outline',
};
const nodePositions = [
    { x: 70, y: 65 },
    { x: 230, y: 65 },
    { x: 38, y: 155 },
    { x: 262, y: 155 },
    { x: 70, y: 245 },
    { x: 230, y: 245 },
];
const positionFor = (index: number) => nodePositions[index % nodePositions.length];
export default function SkillTreeScreen() {
    const c = useBeePalette(), { width, fontScale } = useWindowDimensions();
    const { profile, progressSummary, isRefreshing, refresh } = useUserData();
    const totalXp = profile?.total_xp ?? 0, milestones = milestoneWindow(totalXp), reached = countReachedMilestones(totalXp);
    const branches = branchProgressList(progressSummary.byCategoryXp ?? {}, progressSummary.byCategory);
    const canvas = Math.min(420, width - (width >= 600 ? 48 : 40) - 40), ratio = canvas / 300;
    const rows = canvas < 300 || fontScale > 1.2;
    return <ScreenFrame tab refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={c.honeyDark}/>}>
   <View style={{ gap: 8 }}>
    <ThemedText type="title">Skill Tree</ThemedText>
    <ThemedText style={{ color: c.muted }}>
    {reached} milestones reached · {totalXp} XP</ThemedText>
    <ThemedText type="small" style={{ color: c.muted }}>XP reflects quest activity, not verified mastery.</ThemedText>
    <Pressable cssInterop={false} accessibilityRole="button" accessibilityLabel="Open interactive skill tree prototype"
      onPress={() => router.push('/skill-tree-prototype')}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, opacity: pressed ? 0.7 : 1 })}>
      <Ionicons name="leaf-outline" size={20} color={c.primary} />
      <ThemedText style={{ color: c.primary, fontWeight: '600' }}>Open prototype</ThemedText>
      <Ionicons name="arrow-forward" size={18} color={c.primary} />
    </Pressable>
    </View>
   <View style={{ gap: 20 }}>
    <ThemedText type="subtitle">Branch progress</ThemedText>
        {branches.map(branch => <View key={branch.category} style={s.row}>
        <Ionicons name={branchIcons[branch.category] ?? 'pricetag-outline'} size={20} color={c.muted}/>
        <View style={{ flex: 1 }}>
        <ThemedText>
        {branch.category}
        </ThemedText>
        <ThemedText type="small" style={{ color: c.muted }}>
        {branch.completed} completed</ThemedText>
        </View>
        <ThemedText type="small" style={{ color: c.muted }}>
        Level {branch.level} · {branch.xp} XP</ThemedText>
        </View>)}
    </View>
   <View style={{ gap: 16 }}>
    <ThemedText type="subtitle">XP milestones</ThemedText>
    <Surface>
        {rows ? milestones.map(node => <View key={node.id} style={s.row}>
        <Ionicons name={totalXp >= node.xp ? 'checkmark-circle' : 'lock-closed-outline'} size={20} color={totalXp >= node.xp ? c.success : c.muted}/>
        <ThemedText style={{ flex: 1 }}>
        {node.label}
        </ThemedText>
        <ThemedText type="small" style={{ color: c.muted }}>
        {totalXp >= node.xp ? 'Reached' : 'Upcoming'}
        </ThemedText>
        </View>) : <View style={{ width: canvas, height: canvas + 24, alignSelf: 'center' }}>
        <Svg width={canvas} height={canvas} style={StyleSheet.absoluteFill}>
        {milestones.map((node, index) => {
            const position = positionFor(index);
            return <Line key={node.id} x1={canvas / 2} y1={canvas / 2} x2={position.x * ratio} y2={position.y * ratio} stroke={totalXp >= node.xp ? c.honey : c.surfaceMuted} strokeWidth={2}/>;
        })}
        </Svg>
        <View style={[s.center, { left: canvas / 2 - 48, top: canvas / 2 - 20, backgroundColor: c.surfaceMuted }]}>
        <ThemedText type="label">Quest XP</ThemedText>
        </View>
            {milestones.map((node, index) => {
                const position = positionFor(index);
                return <View key={node.id} accessible accessibilityLabel={node.label + (totalXp >= node.xp ? ', reached' : ', upcoming')} style={[s.node, { left: position.x * ratio - 34, top: position.y * ratio - 20 }]}>
            <View style={[s.circle, { backgroundColor: totalXp >= node.xp ? c.honeySoft : c.surfaceMuted }]}>
            <Ionicons name={totalXp >= node.xp ? 'checkmark' : 'lock-closed-outline'} size={20} color={totalXp >= node.xp ? c.honeyDeep : c.muted}/>
            </View>
            <ThemedText type="small">
            {node.label}
            </ThemedText>
            </View>;
            })}
        </View>}
    </Surface>
    </View>
 </ScreenFrame>;
}
const s = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }, node: { position: 'absolute', width: 68, alignItems: 'center', gap: 8 }, circle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }, center: { position: 'absolute', width: 96, minHeight: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' } });
