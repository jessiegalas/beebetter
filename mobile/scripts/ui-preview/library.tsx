import { StyleSheet, Text, View } from 'react-native';
import { ChoiceChip } from '@/components/mobile-ui';
import { PixelButton } from '@/components/pixel/pixel-button';
import { PixelButtonSvg } from '@/components/pixel/pixel-button-svg';
import { PixelFrame } from '@/components/pixel/pixel-frame';
import { QuestCompanion } from '@/components/quest-companion';
import { AchievementEmblem, CategoryBadge, QuestStatus } from '@/components/quest-visuals';
import { QuestReward, XpBadge, XpProgress } from '@/components/xp-visuals';
import { PixelSpacing, TypographyRoles, useBeePalette } from '@/constants/theme';
import { ACHIEVEMENTS, calculateLevel } from '@/lib/progression';

const noop = () => {};
const progress = calculateLevel(135);

export default function PixelLibraryPreview() {
  const colors = useBeePalette();
  const heading = [TypographyRoles.heading, { color: colors.foreground }];
  const body = [TypographyRoles.body, { color: colors.foreground }];
  return <View style={styles.page}>
    <Text accessibilityRole="header" style={heading}>BeeBetter pixel UI</Text>
    <Text accessibilityRole="header" style={heading}>Quest actions</Text>
    <PixelButton layout="wrap" label="Submit proof and complete" onPress={noop} />
    <PixelButton layout="wrap" label="Submit proof and complete" loading onPress={noop} />
    <PixelButtonSvg label="Focused" previewState="focused" onPress={noop} />
    <PixelButtonSvg label="Pressed" previewState="pressed" onPress={noop} />
    <PixelButton layout="wrap" label="Disabled" disabled onPress={noop} />

    <Text accessibilityRole="header" style={heading}>Categories and choices</Text>
    <PixelFrame appearance="flat" border="primary"><View style={styles.inset}>
      <CategoryBadge label="Academics" size="featured" />
      <View style={styles.row}>{['Habits', 'Social', 'Health', 'Reading'].map(label => <CategoryBadge key={label} label={label} />)}</View>
    </View></PixelFrame>
    <View style={styles.row}>
      <ChoiceChip appearance="pixel" label="Selected" selected onPress={noop} />
      <ChoiceChip appearance="pixel" label="Unselected" selected={false} onPress={noop} />
      <ChoiceChip appearance="pixel" label="Disabled" selected={false} disabled onPress={noop} />
    </View>

    <Text accessibilityRole="header" style={heading}>Quest states</Text>
    <View style={styles.row}>{(['available', 'proof', 'locked', 'pending', 'revision', 'completed'] as const).map(state => <QuestStatus key={state} state={state} />)}</View>
    <Text accessibilityRole="header" style={heading}>Progress and rewards</Text>
    <XpBadge xp={35} />
    <XpProgress progress={progress} compact scope="Branch" />
    <QuestReward title="Review notes for tomorrow’s class" xp={35} previousLevel={1} progress={progress} onClose={noop} />

    <Text accessibilityRole="header" style={heading}>Achievements and companion</Text>
    {ACHIEVEMENTS.map(badge => <View key={badge.id} style={styles.row}>
      <AchievementEmblem id={badge.id} earned />
      <AchievementEmblem id={badge.id} earned={false} />
      <Text style={body}>{badge.title}</Text>
    </View>)}
    <View style={styles.row}><QuestCompanion pose="adventure" /><QuestCompanion pose="resting" /></View>
  </View>;
}

const styles = StyleSheet.create({
  page: { padding: PixelSpacing.px6, gap: PixelSpacing.px4 },
  inset: { padding: PixelSpacing.px6, gap: PixelSpacing.px3 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: PixelSpacing.px3 },
});
