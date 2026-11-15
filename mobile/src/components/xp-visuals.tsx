import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text, View } from 'react-native';
import Reanimated, { ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Button } from '@/components/mobile-ui';
import { PixelButton, type PixelButtonIntent } from '@/components/pixel/pixel-button';
import { PixelFrame } from '@/components/pixel/pixel-frame';
import { PixelGlyph } from '@/components/pixel/pixel-glyph';
import { useBeeStyles, type BeePalette, PixelBorders, PixelSpacing, TypographyRoles } from '@/constants/theme';
import type { LevelProgress } from '@/hooks/use-user-data';

export function XpBadge({ xp, earned = false }: { xp: number; earned?: boolean }) {
  const styles = useBeeStyles(makeStyles);
  return <View style={styles.badge}>
    <PixelGlyph name="xp" />
    <Text style={earned ? styles.earnedXp : styles.xpText}>+{xp} XP</Text>
  </View>;
}

export function XpProgress({ progress, compact = false, scope }: { progress: LevelProgress; compact?: boolean; scope?: 'Account' | 'Branch' }) {
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
    {(!compact || scope) && <View style={s.row}>
      <Text style={s.levelText}>{scope ? scope + ' level' : 'Level'} {progress.level}</Text>
      {!compact && <Text style={s.xpText}>{progress.currentLevelXp} / {progress.xpForNextLevel} XP</Text>}
    </View>}
    <View style={[s.track, compact && s.compactTrack]} accessibilityRole="progressbar" accessibilityLabel={(scope ? scope + ' ' : '') + 'XP progress toward level ' + (progress.level + 1)} accessibilityValue={{ min: 0, max: 100, now: percent }}>
      <View style={s.trackCaps} />
      <View style={s.trackCenter}>
        <View style={s.trackInterior}>
          <Animated.View style={[s.fill, { width: fill.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }]}>
            <View style={s.fillEdge} />
          </Animated.View>
        </View>
      </View>
    </View>
    {compact && <Text style={s.xpText}>{progress.currentLevelXp} / {progress.xpForNextLevel} XP</Text>}
    <Text style={s.caption}>{Math.max(0, progress.xpForNextLevel - progress.currentLevelXp)} XP to Level {progress.level + 1}</Text>
  </View>;
}
export function GrowthLeaf({ animate = false, small = false }: { animate?: boolean; small?: boolean }) {
  const phase = useSharedValue(animate ? 0 : 3);
  useEffect(() => {
    phase.value = animate ? withTiming(3, { duration: 720, reduceMotion: ReduceMotion.System }) : 3;
  }, [animate, phase]);
  const growth = useAnimatedStyle(() => ({ transform: [{ scale: (1 + Math.floor(phase.value)) / 4 }] }));
  return <Reanimated.View style={growth} accessible={false}>
    <PixelGlyph name={small ? 'leaf' : 'leafFull'} />
  </Reanimated.View>;
}

export function RewardPanel({ title, emblem, children, actionLabel, actionIntent, onAction }: {
  title: string;
  emblem?: ReactNode;
  children?: ReactNode;
  actionLabel: string;
  actionIntent?: PixelButtonIntent;
  onAction: () => void;
}) {
  const s = useBeeStyles(makeStyles);
  return <PixelFrame appearance="flat" fill="card" border="primary" cornerStep={PixelSpacing.px1} borderWidth={PixelBorders.default} style={s.rewardFrame}>
    <View style={s.reward} accessibilityLiveRegion="polite">
      {emblem}
      <Text accessibilityRole="header" style={s.rewardTitle}>{title}</Text>
      {children}
      <PixelButton layout="wrap" label={actionLabel} intent={actionIntent} onPress={onAction} style={s.rewardAction} />
    </View>
  </PixelFrame>;
}

export function QuestReward({ title, xp, previousLevel, progress, onClose, onRefreshProgress }: { title: string; xp: number; previousLevel: number; progress: LevelProgress; onClose: () => void; onRefreshProgress?: () => void }) {
  const s = useBeeStyles(makeStyles);
  const leveledUp = progress.level > previousLevel;
  return <RewardPanel title={leveledUp ? 'A new level of you.' : 'A little win. Real progress.'}
    emblem={<GrowthLeaf />} actionLabel="Keep growing" onAction={onClose}>
    <Text style={[s.levelText, s.centered]}>{title}</Text>
    <View style={s.rewardBadge}><XpBadge xp={xp} earned /></View>
    <Text style={[s.caption, s.centered]}>{leveledUp ? 'You reached Level ' + progress.level + '!' : 'Quest complete. Keep growing at your own pace.'}</Text>
    <View style={s.rewardProgress}><XpProgress progress={progress} scope="Account" /></View>
    {onRefreshProgress && <Button label="Refresh progress" intent="quiet" onPress={onRefreshProgress} />}
  </RewardPanel>;
}

const makeStyles = (C: BeePalette) => StyleSheet.create({
  badge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: PixelSpacing.px2, maxWidth: '100%' },
  xpText: { ...TypographyRoles.body, color: C.foreground, flexShrink: 1 },
  earnedXp: { ...TypographyRoles.heading, color: C.foreground, flexShrink: 1 },
  progress: { gap: PixelSpacing.px2 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: PixelSpacing.px2 },
  levelText: { ...TypographyRoles.label, color: C.foreground, flexShrink: 1 },
  caption: { ...TypographyRoles.body, color: C.muted },
  track: { height: PixelSpacing.px6 },
  compactTrack: { height: PixelSpacing.px5 },
  trackCaps: { position: 'absolute', top: 0, bottom: 0, left: PixelSpacing.px1, right: PixelSpacing.px1, backgroundColor: C.foreground },
  trackCenter: { flex: 1, marginVertical: PixelSpacing.px1, paddingHorizontal: PixelSpacing.px1, backgroundColor: C.foreground },
  trackInterior: { flex: 1, backgroundColor: C.surfaceMuted },
  fill: { height: '100%', backgroundColor: C.accent, overflow: 'hidden' },
  fillEdge: { position: 'absolute', top: 0, bottom: 0, end: 0, width: PixelSpacing.px1, backgroundColor: C.accentForeground },
  rewardFrame: { width: '100%', maxWidth: 420, alignSelf: 'center' },
  reward: { alignItems: 'center', gap: PixelSpacing.px4, padding: PixelSpacing.px6 },
  rewardTitle: { ...TypographyRoles.heading, color: C.foreground, textAlign: 'center' },
  centered: { textAlign: 'center' },
  rewardBadge: { alignItems: 'center' },
  rewardProgress: { width: '100%' },
  rewardAction: { width: '100%' },
});
