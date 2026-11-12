import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { Badge, Button } from '@/components/mobile-ui';
import { ThemedText } from '@/components/themed-text';
import { useBeePalette, useBeeStyles, type BeePalette, Radii, Typography, Spacing, Borders } from '@/constants/theme';
import type { LevelProgress } from '@/hooks/use-user-data';

export function XpBadge({ xp }: { xp: number }) {
  return <Badge label={'+' + xp + ' XP'} icon="sparkles" />;
}
export function XpProgress({ progress, compact = false }: { progress: LevelProgress; compact?: boolean }) {
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
    {!compact && <View style={s.row}>
      <View style={s.level}><Ionicons name="ribbon" size={22} color={C.foreground} /><ThemedText style={s.levelText}>Level {progress.level}</ThemedText></View>
      <ThemedText style={s.caption}>{progress.currentLevelXp} / {progress.xpForNextLevel} XP</ThemedText>
    </View>}
    <View style={[s.track, compact && s.compactTrack]} accessibilityRole="progressbar" accessibilityLabel={'XP progress toward level ' + (progress.level + 1)} accessibilityValue={{ min: 0, max: 100, now: percent }}>
      <Animated.View style={[s.fill, { width: fill.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }, compact && s.compactFill]} />
    </View>
    {compact && <ThemedText style={s.compactXp}>{progress.currentLevelXp} / {progress.xpForNextLevel} XP</ThemedText>}
    <ThemedText style={[s.caption, compact && s.compactCaption]}><ThemedText style={compact ? s.compactCaption : s.remaining}>{Math.max(0, progress.xpForNextLevel - progress.currentLevelXp)} XP</ThemedText> to Level {progress.level + 1}</ThemedText>
  </View>;
}
export function GrowthLeaf({ animate = false, small = false }: { animate?: boolean; small?: boolean }) {
  const C = useBeePalette();
  const phase = useSharedValue(animate ? 0 : 3);
  useEffect(() => {
    phase.value = animate ? withTiming(3, { duration: 720, reduceMotion: ReduceMotion.System }) : 3;
  }, [animate, phase]);
  const growth = useAnimatedStyle(() => ({ transform: [{ scale: (1 + Math.floor(phase.value)) / 4 }] }));
  return <Reanimated.View style={growth} accessible={false}>
    <Svg width={small ? 24 : 48} height={small ? 24 : 48} viewBox="0 0 48 48">
      <Path d="M6 42H12V30H9V21H12V15H18V9H27V6H42V21H39V30H33V36H18V42H12V45H6Z" fill={C.foreground} />
      <Path d="M15 30V21H18V15H27V12H36V21H33V27H27V30H21V36H15Z" fill={C.success} />
      <Path d="M18 33V27H24V21H30V15H33V24H27V30H21V36H15V33Z" fill={C.honey} />
    </Svg>
  </Reanimated.View>;
}

export function QuestReward({ title, xp, previousLevel, progress, onClose }: { title: string; xp: number; previousLevel: number; progress: LevelProgress; onClose: () => void }) {
  const C = useBeePalette();
  const s = useBeeStyles(makeStyles);
  const leveledUp = progress.level > previousLevel;
  return <View style={s.reward} accessibilityLiveRegion="polite">
    <View style={s.emblem}><Ionicons name={leveledUp ? 'trophy' : 'checkmark-done'} size={40} color={C.foreground} /></View>
    <ThemedText style={s.rewardTitle}>{leveledUp ? 'A new level of you.' : 'A little win. Real progress.'}</ThemedText>
    <ThemedText style={s.questName}>{title}</ThemedText>
    <ThemedText style={s.rewardXp}>+{xp} <ThemedText style={s.rewardUnit}>XP</ThemedText></ThemedText>
    <ThemedText style={s.caption}>{leveledUp ? 'You reached Level ' + progress.level + '!' : 'Quest complete. Keep growing at your own pace.'}</ThemedText>
    <View style={s.rewardProgress}><XpProgress progress={progress} /></View>
    <Button label="Keep growing" icon="arrow-forward" onPress={onClose} style={{ width: '100%' }} />
  </View>;
}
const makeStyles = (C: BeePalette) => StyleSheet.create({
  progress: { gap: Spacing.sm },
  compactTrack: { height: Spacing.md },
  compactFill: { borderWidth: 0, borderRadius: Radii.pill },
  compactXp: { ...Typography.section, color: C.foreground, marginTop: Spacing.xs },
  compactCaption: { ...Typography.body, color: C.muted },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: Spacing.sm },
  level: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  levelText: { ...Typography.section, color: C.foreground },
  caption: { ...Typography.metadata, color: C.muted },
  remaining: { ...Typography.label, color: C.foreground },
  track: { height: Spacing.sm, borderRadius: Radii.pill, backgroundColor: C.surfaceMuted, overflow: 'hidden', borderWidth: 0 },
  fill: { height: '100%', backgroundColor: C.accent, borderWidth: Borders.default, borderColor: C.primary, borderRadius: Radii.sm, overflow: 'hidden' },
  reward: { width: '100%', maxWidth: 420, alignSelf: 'center', alignItems: 'center', padding: Spacing.xl, gap: Spacing.md, borderRadius: Radii.xl, backgroundColor: C.background, borderWidth: 1, borderColor: C.accent },
  emblem: { width: 86, height: 86, borderRadius: Radii.xl, backgroundColor: C.surface, borderWidth: 4, borderColor: C.accent, justifyContent: 'center', alignItems: 'center' },
  rewardTitle: { ...Typography.section, textAlign: 'center', color: C.foreground },
  questName: { fontSize: 14, lineHeight: 20, color: C.muted, textAlign: 'center' },
  rewardXp: { ...Typography.page, color: C.foreground },
  rewardUnit: { ...Typography.section, color: C.foreground},
  rewardProgress: { width: '100%', paddingVertical: Spacing.md } });
