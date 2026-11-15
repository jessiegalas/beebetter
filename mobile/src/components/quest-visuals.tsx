import { StyleSheet, Text, View } from 'react-native';
import { PixelGlyph, type PixelGlyphName } from '@/components/pixel/pixel-glyph';
import { PixelSpacing, TypographyRoles, useBeePalette } from '@/constants/theme';
import type { QuestStatus as SavedQuestStatus } from '@/hooks/use-user-data';

const categoryGlyphs = new Map<string, PixelGlyphName>([
  ['academics', 'book'], ['habits', 'repeat'], ['social', 'people'], ['health', 'heart'],
]);

export function CategoryGlyph({ label, scale }: { label: string | null; scale?: 1 | 2 }) {
  return <PixelGlyph name={categoryGlyphs.get(label?.trim().toLowerCase() ?? '') ?? 'quest'} scale={scale} />;
}

export function CategoryBadge({ label, size = 'compact' }: { label: string | null; size?: 'compact' | 'featured' }) {
  const colors = useBeePalette();
  return <View style={styles.row}>
    <CategoryGlyph label={label} scale={size === 'featured' ? 2 : 1} />
    <Text style={[styles.label, size === 'featured' && TypographyRoles.body, { color: colors.foreground }]}>{label?.trim() ? label : 'Uncategorized'}</Text>
  </View>;
}

const statuses = {
  available: { title: 'Available', glyph: 'bud' },
  proof: { title: 'Proof required', glyph: 'proof' },
  locked: { title: 'Locked', glyph: 'lock' },
  pending: { title: 'Pending review', glyph: 'proof' },
  revision: { title: 'Needs revision', glyph: 'revision' },
  completed: { title: 'Completed', glyph: 'leaf' },
} satisfies Record<string, { title: string; glyph: PixelGlyphName }>;

export type QuestVisualState = keyof typeof statuses;

export function questVisualState(status: SavedQuestStatus, locked: boolean, requiresProof: boolean): QuestVisualState {
  const savedStates = { completed: 'completed', pending: 'pending', rejected: 'revision' } as const;
  if (status !== 'active') return savedStates[status];
  if (locked) return 'locked';
  return requiresProof ? 'proof' : 'available';
}

export function QuestStatus({ state, explanation }: { state: QuestVisualState; explanation?: string }) {
  const colors = useBeePalette();
  const { title, glyph } = statuses[state];
  return <View style={styles.row}>
    <PixelGlyph name={glyph} />
    <Text style={[styles.label, { color: state === 'revision' ? colors.danger : colors.foreground }]}>{explanation || title}</Text>
  </View>;
}

const achievementGlyphs = new Map<string, PixelGlyphName>([
  ['first_quest', 'flight'], ['five_quests', 'worker'], ['level_2', 'rising'], ['streak_3', 'streak'], ['level_5', 'pollinator'],
]);

export function AchievementEmblem({ id, earned }: { id: string; earned: boolean }) {
  return <PixelGlyph name={achievementGlyphs.get(id) ?? 'quest'} muted={!earned} />;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: PixelSpacing.px2, alignSelf: 'flex-start', maxWidth: '100%' },
  label: { ...TypographyRoles.metadata, flexShrink: 1 },
});
