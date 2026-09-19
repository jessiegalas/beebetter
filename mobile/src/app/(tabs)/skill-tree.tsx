import { StyleSheet, View, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Line } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { BeeMark, VisualTile } from '@/components/bee-visuals';
import { BeeBetterColors as COLORS, BeeBetterShadow, Radii } from '@/constants/theme';
import { useUserData, Category } from '@/hooks/use-user-data';

const CANVAS = 300;
const CENTER = { x: 150, y: 150 };

const habitNodes = [
  { id: 1, label: 'Focus', x: 70, y: 65, minXp: 25 },
  { id: 2, label: 'Discipline', x: 230, y: 65, minXp: 50 },
  { id: 3, label: 'Fitness', x: 38, y: 155, minXp: 75 },
  { id: 4, label: 'Nutrition', x: 262, y: 155, minXp: 100 },
  { id: 5, label: 'Study', x: 70, y: 245, minXp: 125 },
  { id: 6, label: 'Rest', x: 230, y: 245, minXp: 150 },
];

export default function SkillTreeScreen() {
  const { profile, completedQuests, isRefreshing, refresh } = useUserData();

  const totalXp = profile?.total_xp ?? 0;

  const getCategoryCount = (category: Category) => {
    return completedQuests.filter((q) => q.category === category).length;
  };

  const categories = [
    {
      id: 1,
      title: 'Academics',
      completed: getCategoryCount('Academics'),
      icon: 'book-outline' as const,
    },
    {
      id: 2,
      title: 'Habits',
      completed: getCategoryCount('Habits'),
      icon: 'checkmark-done-outline' as const,
    },
    {
      id: 3,
      title: 'Social',
      completed: getCategoryCount('Social'),
      icon: 'people-outline' as const,
    },
    {
      id: 4,
      title: 'Health',
      completed: getCategoryCount('Health'),
      icon: 'heart-outline' as const,
    },
  ];

  const totalSkillsUnlocked = habitNodes.filter((node) => totalXp >= node.minXp).length;

  return (
    <View style={styles.container}>
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
          <View style={styles.skillHero}>
            <View style={styles.skillHeroTop}><BeeMark size={58} /><View style={styles.skillHeroBadge}><Ionicons name="sparkles" size={14} color={COLORS.honeyDeep} /><ThemedText style={styles.skillHeroBadgeText}>{totalXp} XP</ThemedText></View></View>
            <ThemedText style={styles.skillHeroEyebrow}>YOUR GROWTH MAP</ThemedText>
            <ThemedText style={styles.skillHeroTitle}>Watch your strengths bloom.</ThemedText>
            <ThemedText style={styles.skillHeroSubtitle}>{totalSkillsUnlocked} of {habitNodes.length} milestones unlocked. Keep exploring.</ThemedText>
          </View>

          {/* Category Summary Cards */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryTiles}>
            {categories.map((cat) => <VisualTile key={cat.id} icon={cat.icon} label={`${cat.title}\n${cat.completed} done`} color={cat.id % 2 === 0 ? COLORS.honeySoft : COLORS.lavender} />)}
          </ScrollView>

          {/* Habit Tree Radial Diagram */}
          <View style={styles.diagramHeader}>
            <View style={styles.diagramHeaderLeft}>
              <Ionicons name="git-network-outline" size={16} color={COLORS.ink} />
              <ThemedText style={styles.sectionTitle}>Progression Tree</ThemedText>
            </View>
            <ThemedText style={styles.seeAll}>
              {totalSkillsUnlocked}/{habitNodes.length} Unlocked
            </ThemedText>
          </View>

          <View style={styles.diagramCard}>
            <View style={{ width: CANVAS, height: CANVAS, alignSelf: 'center' }}>
              <Svg width={CANVAS} height={CANVAS} style={StyleSheet.absoluteFill}>
                {habitNodes.map((node) => {
                  const isUnlocked = totalXp >= node.minXp;
                  return (
                    <Line
                      key={node.id}
                      x1={CENTER.x}
                      y1={CENTER.y}
                      x2={node.x}
                      y2={node.y}
                      stroke={isUnlocked ? COLORS.honey : COLORS.surfaceMuted}
                      strokeWidth={isUnlocked ? 2.5 : 1.5}
                    />
                  );
                })}
              </Svg>

              {/* Center Core Node */}
              <View style={[styles.centerNode, { left: CENTER.x - 36, top: CENTER.y - 16 }]}>
                <ThemedText style={styles.centerNodeText}>Core Hive</ThemedText>
              </View>

              {/* Orbital Nodes */}
              {habitNodes.map((node) => {
                const isUnlocked = totalXp >= node.minXp;
                return (
                  <View
                    key={node.id}
                    style={[styles.nodeWrap, { left: node.x - 20, top: node.y - 20 }]}>
                    <View style={[styles.node, !isUnlocked && styles.nodeLocked]}>
                      <Ionicons
                        name={isUnlocked ? 'checkmark' : 'lock-closed'}
                        size={15}
                        color={isUnlocked ? COLORS.ink : COLORS.muted}
                      />
                    </View>
                    <ThemedText
                      style={[styles.nodeLabel, !isUnlocked && styles.nodeLabelLocked]}>
                      {node.label}
                    </ThemedText>
                  </View>
                );
              })}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  safeArea: { flex: 1 },
  skillHero: { marginHorizontal: 20, marginTop: 8, padding: 20, borderRadius: Radii.xl, backgroundColor: COLORS.honeyDeep, ...BeeBetterShadow },
  skillHeroTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  skillHeroBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: Radii.pill, backgroundColor: COLORS.honeySoft },
  skillHeroBadgeText: { color: COLORS.ink, fontSize: 11, fontWeight: '900' },
  skillHeroEyebrow: { color: '#FFD978', fontSize: 9, fontWeight: '900', letterSpacing: 1, marginTop: 18 },
  skillHeroTitle: { color: '#FFFFFF', fontSize: 25, lineHeight: 30, fontWeight: '900', marginTop: 4 },
  skillHeroSubtitle: { color: '#F6E8D1', fontSize: 12, lineHeight: 17, marginTop: 4 },
  categoryTiles: { gap: 10, paddingVertical: 4, paddingRight: 20 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: Radii.md,
    backgroundColor: COLORS.honey,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1 },
  greeting: { fontSize: 17, fontWeight: '800', color: COLORS.ink },
  subGreeting: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  headerButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...BeeBetterShadow,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 112,
    gap: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  gridCard: {
    width: '48.5%',
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 13,
    gap: 6,
    ...BeeBetterShadow,
  },
  gridThumb: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: COLORS.honeySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridTitle: { fontSize: 13, fontWeight: '800', color: COLORS.ink },
  gridSubtitle: { fontSize: 11, color: COLORS.muted },
  diagramHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  diagramHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: COLORS.ink },
  seeAll: { fontSize: 12, color: COLORS.honeyDark, fontWeight: '800' },
  diagramCard: {
    backgroundColor: COLORS.card,
    borderRadius: Radii.md,
    paddingVertical: 20,
    alignItems: 'center',
    ...BeeBetterShadow,
  },
  centerNode: {
    position: 'absolute',
    width: 72,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.ink,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  centerNodeText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },
  nodeWrap: {
    position: 'absolute',
    width: 44,
    alignItems: 'center',
    gap: 4,
    zIndex: 2,
  },
  node: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.honey,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    ...BeeBetterShadow,
  },
  nodeLocked: {
    backgroundColor: COLORS.surfaceMuted,
  },
  nodeLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.ink,
    textAlign: 'center',
  },
  nodeLabelLocked: {
    color: COLORS.muted,
  },
});
