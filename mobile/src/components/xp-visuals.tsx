import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/mobile-ui';
import { ThemedText } from '@/components/themed-text';
import { useBeePalette, useBeeStyles, type BeePalette } from '@/constants/theme';
import type { LevelProgress } from '@/hooks/use-user-data';

export function XpBadge({ xp }: { xp: number }) {
  const C = useBeePalette();
  const s = useBeeStyles(makeStyles);
  return <View style={s.badge}><Ionicons name="sparkles" size={14} color={C.honeyDeep} /><ThemedText style={s.badgeText}>+{xp} XP</ThemedText></View>;
}
export function XpProgress({ progress }: { progress: LevelProgress }) {
  const C = useBeePalette();
  const s = useBeeStyles(makeStyles);
  const [fill] = useState(() => new Animated.Value(Math.max(0, Math.min(100, progress.progressPercent))));
  const percent = Math.max(0, Math.min(100, progress.progressPercent));
  useEffect(() => {
    let active = true;
    const update = (reduce: boolean) => {
      if (!active) return;
      fill.stopAnimation();
      if (reduce) fill.setValue(percent);
      else Animated.timing(fill, { toValue: percent, duration: 200, useNativeDriver: false }).start();
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
      <Animated.View style={[s.fill, { width: fill.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }]} />
    </View>
    <ThemedText style={s.caption}><ThemedText style={s.remaining}>{Math.max(0, progress.xpForNextLevel - progress.currentLevelXp)} XP</ThemedText> to Level {progress.level + 1}</ThemedText>
  </View>;
}
export function QuestReward({ title, xp, previousLevel, progress, onClose }: { title: string; xp: number; previousLevel: number; progress: LevelProgress; onClose: () => void }) {
  const C = useBeePalette();
  const s = useBeeStyles(makeStyles);
  const leveledUp = progress.level > previousLevel;
  return <View style={s.reward} accessibilityLiveRegion="polite">
    <View style={s.emblem}><Ionicons name={leveledUp ? 'trophy' : 'checkmark-done'} size={40} color={C.honeyDeep} /></View>
    <ThemedText style={s.rewardTitle}>{leveledUp ? 'A new level of you.' : 'A little win. Real progress.'}</ThemedText>
    <ThemedText style={s.questName}>{title}</ThemedText>
    <ThemedText style={s.rewardXp}>+{xp} <ThemedText style={s.rewardUnit}>XP</ThemedText></ThemedText>
    <ThemedText style={s.caption}>{leveledUp ? 'You reached Level ' + progress.level + '!' : 'Quest complete. Keep growing at your own pace.'}</ThemedText>
    <View style={s.rewardProgress}><XpProgress progress={progress} /></View>
    <Button label="Keep growing" icon="arrow-forward" onPress={onClose} style={{ width: '100%' }} />
  </View>;
}
const makeStyles = (C: BeePalette) => StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: C.honeySoft, borderWidth: 0, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: C.honeyDeep },
  progress: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  level: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  levelText: { fontSize: 20, lineHeight: 28, fontWeight: '700', color: C.ink },
  caption: { fontSize: 14, lineHeight: 20, color: C.muted },
  remaining: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: C.honeyDeep },
  track: { height: 8, borderRadius: 12, backgroundColor: C.surfaceMuted, overflow: 'hidden', borderWidth: 0 },
  fill: { height: '100%', backgroundColor: C.honey, borderRadius: 10, overflow: 'hidden' },
  reward: { width: '100%', maxWidth: 420, alignSelf: 'center', alignItems: 'center', padding: 24, gap: 12, borderRadius: 28, backgroundColor: C.background, borderWidth: 1, borderColor: C.honey },
  emblem: { width: 86, height: 86, borderRadius: 30, backgroundColor: C.honeySoft, borderWidth: 4, borderColor: C.honey, justifyContent: 'center', alignItems: 'center' },
  rewardTitle: { fontSize: 23, lineHeight: 34, fontWeight: '700', textAlign: 'center', color: C.ink },
  questName: { fontSize: 14, lineHeight: 20, color: C.muted, textAlign: 'center' },
  rewardXp: { fontSize: 28, lineHeight: 34, fontWeight: '700', color: C.honeyDeep },
  rewardUnit: { fontSize: 22, fontWeight: '700', color: C.honeyDeep , lineHeight: 34},
  rewardProgress: { width: '100%', paddingVertical: 12 } });
