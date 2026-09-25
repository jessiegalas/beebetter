import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { BeeBetterColors as C } from '@/constants/theme';
import type { LevelProgress } from '@/hooks/use-user-data';

export function XpBadge({ xp }: { xp: number }) {
  return <View style={s.badge}><Ionicons name="sparkles" size={14} color={C.honeyDeep} /><ThemedText style={s.badgeText}>+{xp} XP</ThemedText></View>;
}
export function XpProgress({ progress }: { progress: LevelProgress }) {
  const [fill] = useState(() => new Animated.Value(0));
  const percent = Math.max(0, Math.min(100, progress.progressPercent));
  useEffect(() => {
    let active = true;
    const update = (reduce: boolean) => {
      if (!active) return;
      fill.stopAnimation();
      if (reduce) fill.setValue(percent);
      else Animated.timing(fill, { toValue: percent, duration: 650, useNativeDriver: false }).start();
    };
    void AccessibilityInfo.isReduceMotionEnabled().then(update).catch(() => update(true));
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', update);
    return () => { active = false; listener.remove(); fill.stopAnimation(); };
  }, [fill, percent]);
  return <View style={s.progress}>
    <View style={s.row}>
      <View style={s.level}><Ionicons name="ribbon" size={22} color={C.honeyDeep} /><ThemedText style={s.levelText}>Level {progress.level}</ThemedText></View>
      <ThemedText style={s.caption}>{progress.currentLevelXp} / {progress.xpForNextLevel} XP</ThemedText>
    </View>
    <View style={s.track} accessibilityRole="progressbar" accessibilityLabel={'XP progress toward level ' + (progress.level + 1)} accessibilityValue={{ min: 0, max: 100, now: percent }}>
      <Animated.View style={[s.fill, { width: fill.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }]}><View style={s.shine} /></Animated.View>
      <View pointerEvents="none" style={s.ticks}>{[1, 2, 3, 4].map(tick => <View key={tick} style={s.tick} />)}</View>
    </View>
    <ThemedText style={s.caption}><ThemedText style={s.remaining}>{Math.max(0, progress.xpForNextLevel - progress.currentLevelXp)} XP</ThemedText> to Level {progress.level + 1}</ThemedText>
  </View>;
}
export function QuestReward({ title, xp, previousLevel, progress, onClose }: { title: string; xp: number; previousLevel: number; progress: LevelProgress; onClose: () => void }) {
  const leveledUp = progress.level > previousLevel;
  return <View style={s.reward} accessibilityLiveRegion="polite">
    <View style={s.emblem}><Ionicons name={leveledUp ? 'trophy' : 'checkmark-done'} size={40} color={C.honeyDeep} /></View>
    <ThemedText style={s.rewardTitle}>{leveledUp ? 'A new level of you.' : 'A little win. Real progress.'}</ThemedText>
    <ThemedText style={s.questName}>{title}</ThemedText>
    <ThemedText style={s.rewardXp}>+{xp} <ThemedText style={s.rewardUnit}>XP</ThemedText></ThemedText>
    <ThemedText style={s.caption}>{leveledUp ? 'You reached Level ' + progress.level + '!' : 'Quest complete. Keep growing at your own pace.'}</ThemedText>
    <View style={s.rewardProgress}><XpProgress progress={progress} /></View>
    <TouchableOpacity style={s.continueButton} accessibilityRole="button" onPress={onClose}><ThemedText style={s.badgeText}>Keep growing</ThemedText><Ionicons name="arrow-forward" size={18} color={C.honeyDeep} /></TouchableOpacity>
  </View>;
}
const s = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: C.honeySoft, borderWidth: 1, borderColor: C.honey, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { fontSize: 13, lineHeight: 20, fontWeight: '800', color: C.honeyDeep },
  progress: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  level: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  levelText: { fontSize: 20, lineHeight: 28, fontWeight: '800', color: C.ink },
  caption: { fontSize: 12, lineHeight: 19, color: C.muted },
  remaining: { fontSize: 12, lineHeight: 19, fontWeight: '800', color: C.honeyDeep },
  track: { height: 18, borderRadius: 12, backgroundColor: C.surfaceMuted, overflow: 'hidden', borderWidth: 1, borderColor: '#EADBC6' },
  fill: { height: '100%', backgroundColor: C.honey, borderRadius: 10, overflow: 'hidden' },
  shine: { position: 'absolute', top: 3, left: 3, right: 3, height: 4, borderRadius: 6, backgroundColor: '#FFE79B' },
  ticks: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-evenly' },
  tick: { width: 1, backgroundColor: 'rgba(255,255,255,0.6)' },
  reward: { width: '100%', maxWidth: 420, alignSelf: 'center', alignItems: 'center', padding: 24, gap: 12, borderRadius: 28, backgroundColor: C.background, borderWidth: 1, borderColor: C.honey },
  emblem: { width: 86, height: 86, borderRadius: 30, backgroundColor: C.honeySoft, borderWidth: 4, borderColor: C.honey, justifyContent: 'center', alignItems: 'center' },
  rewardTitle: { fontSize: 23, lineHeight: 30, fontWeight: '800', textAlign: 'center', color: C.ink },
  questName: { fontSize: 14, lineHeight: 21, color: C.muted, textAlign: 'center' },
  rewardXp: { fontSize: 48, lineHeight: 58, fontWeight: '900', color: C.honeyDeep },
  rewardUnit: { fontSize: 22, fontWeight: '800', color: C.honeyDeep },
  rewardProgress: { width: '100%', paddingVertical: 12 },
  continueButton: { width: '100%', minHeight: 48, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12, backgroundColor: C.honey, borderRadius: 16, padding: 12 },
});
