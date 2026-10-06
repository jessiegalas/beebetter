import { RefreshControl, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Line } from 'react-native-svg';
import { ThemedText } from '@/components/themed-text';
import { ScreenFrame, Surface } from '@/components/mobile-ui';
import { useBeePalette } from '@/constants/theme';
import { useUserData, type Category } from '@/hooks/use-user-data';
const habitNodes = [
    { id: 1, label: '25 XP', x: 70, y: 65, minXp: 25 },
    { id: 2, label: '50 XP', x: 230, y: 65, minXp: 50 },
    { id: 3, label: '75 XP', x: 38, y: 155, minXp: 75 },
    { id: 4, label: '100 XP', x: 262, y: 155, minXp: 100 },
    { id: 5, label: '125 XP', x: 70, y: 245, minXp: 125 },
    { id: 6, label: '150 XP', x: 230, y: 245, minXp: 150 },
];
export default function SkillTreeScreen() {
    const c = useBeePalette(), { width, fontScale } = useWindowDimensions();
    const { profile, progressSummary, isRefreshing, refresh } = useUserData();
    const totalXp = profile?.total_xp ?? 0, reached = habitNodes.filter(node => totalXp >= node.minXp).length;
    const canvas = Math.min(420, width - (width >= 600 ? 48 : 40) - 40), ratio = canvas / 300;
    const rows = canvas < 300 || fontScale > 1.2;
    const categories: {
        title: Category;
        icon: keyof typeof Ionicons.glyphMap;
    }[] = [{ title: 'Academics', icon: 'book-outline' }, { title: 'Habits', icon: 'checkmark-done-outline' }, { title: 'Social', icon: 'people-outline' }, { title: 'Health', icon: 'heart-outline' }];
    return <ScreenFrame tab refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={c.honeyDark}/>}>
   <View style={{ gap: 8 }}>
    <ThemedText type="title">Skill Tree</ThemedText>
    <ThemedText style={{ color: c.muted }}>
    {reached} of {habitNodes.length} milestones reached · {totalXp} XP</ThemedText>
    <ThemedText type="small" style={{ color: c.muted }}>XP reflects quest activity, not verified mastery.</ThemedText>
    </View>
   <View style={{ gap: 20 }}>
    <ThemedText type="subtitle">Quest activity</ThemedText>
        {categories.map(category => <View key={category.title} style={s.row}>
        <Ionicons name={category.icon} size={20} color={c.muted}/>
        <ThemedText style={{ flex: 1 }}>
        {category.title}
        </ThemedText>
        <ThemedText type="small" style={{ color: c.muted }}>
        {progressSummary.byCategory[category.title] ?? 0} completed</ThemedText>
        </View>)}
    </View>
   <View style={{ gap: 16 }}>
    <ThemedText type="subtitle">XP milestones</ThemedText>
    <Surface>
        {rows ? habitNodes.map(node => <View key={node.id} style={s.row}>
        <Ionicons name={totalXp >= node.minXp ? 'checkmark-circle' : 'lock-closed-outline'} size={20} color={totalXp >= node.minXp ? c.success : c.muted}/>
        <ThemedText style={{ flex: 1 }}>
        {node.label}
        </ThemedText>
        <ThemedText type="small" style={{ color: c.muted }}>
        {totalXp >= node.minXp ? 'Reached' : 'Upcoming'}
        </ThemedText>
        </View>) : <View style={{ width: canvas, height: canvas + 24, alignSelf: 'center' }}>
        <Svg width={canvas} height={canvas} style={StyleSheet.absoluteFill}>
        {habitNodes.map(node => <Line key={node.id} x1={canvas / 2} y1={canvas / 2} x2={node.x * ratio} y2={node.y * ratio} stroke={totalXp >= node.minXp ? c.honey : c.surfaceMuted} strokeWidth={2}/>)}
        </Svg>
        <View style={[s.center, { left: canvas / 2 - 48, top: canvas / 2 - 20, backgroundColor: c.surfaceMuted }]}>
        <ThemedText type="label">Quest XP</ThemedText>
        </View>
            {habitNodes.map(node => <View key={node.id} accessible accessibilityLabel={node.label + (totalXp >= node.minXp ? ', reached' : ', upcoming')} style={[s.node, { left: node.x * ratio - 34, top: node.y * ratio - 20 }]}>
            <View style={[s.circle, { backgroundColor: totalXp >= node.minXp ? c.honeySoft : c.surfaceMuted }]}>
            <Ionicons name={totalXp >= node.minXp ? 'checkmark' : 'lock-closed-outline'} size={20} color={totalXp >= node.minXp ? c.honeyDeep : c.muted}/>
            </View>
            <ThemedText type="small">
            {node.label}
            </ThemedText>
            </View>)}
        </View>}
    </Surface>
    </View>
 </ScreenFrame>;
}
const s = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }, node: { position: 'absolute', width: 68, alignItems: 'center', gap: 8 }, circle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }, center: { position: 'absolute', width: 96, minHeight: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' } });
