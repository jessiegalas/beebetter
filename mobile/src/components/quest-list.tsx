import { useState } from 'react';
import { ActivityIndicator, Pressable, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { QuestCard as WizardCard, QuestText } from '@/components/quest-wizard';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ThemedText } from '@/components/themed-text';
import { XpBadge } from '@/components/xp-visuals';
import { CategoryBadge, QuestStatus, questVisualState } from '@/components/quest-visuals';
import { PixelChoice } from '@/components/pixel/pixel-choice';
import { Controls, Layout, Spacing, useBeePalette } from '@/constants/theme';
import type { PrerequisiteState } from '@/lib/quest-priority';
import { prerequisiteMessage } from '@/lib/quest-context';
import type { Quest } from '@/hooks/use-user-data';

export function QuestListHeader({ onSettings, compact = false }: { onSettings: () => void; compact?: boolean }) {
  const c = useBeePalette();
  const [focused, setFocused] = useState(false);
  return <View className="flex-row items-center justify-between gap-md" style={{ marginBottom: compact ? 0 : Spacing.gutter }}>
    <ThemedText type="title" style={{ flex: 1 }}>Quests</ThemedText>
    <Pressable accessibilityRole="button" accessibilityLabel="Quest settings" onPress={onSettings} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} className="min-h-control min-w-control items-center justify-center rounded-pill border-focus active:opacity-60" style={{ borderColor: focused ? c.focus : 'transparent' }}>
      <Ionicons name="settings-outline" size={Controls.iconSize} color={c.foreground} accessible={false} />
    </Pressable>
  </View>;
}

export function QuestListTab({ label, selected, stacked = false, onPress }: { label: string; selected: boolean; stacked?: boolean; onPress: () => void }) {
  return <PixelChoice role="tab" equalWidth={!stacked} label={label} selected={selected} onPress={onPress} />;
}

type QuestRowProps = {
  quest: Quest;
  locked?: boolean;
  prerequisiteState: PrerequisiteState;
  prerequisiteTitle?: string;
  onRetryContext?: () => void;
  completing?: boolean;
  onOpen: () => void;
  onComplete: () => void;
};

export function AllQuestRow(props: QuestRowProps) {
  const c = useBeePalette();
  const [retryFocused, setRetryFocused] = useState(false);
  return <WizardCard className="px-sm py-sm"><QuestRowContent {...props} />
    {props.prerequisiteState === 'unknown' && <Pressable accessibilityRole="button" accessibilityLabel={'Retry prerequisite status for ' + props.quest.title} onPress={props.onRetryContext} onFocus={() => setRetryFocused(true)} onBlur={() => setRetryFocused(false)} style={{ borderColor: retryFocused ? c.focus : 'transparent' }} className="min-h-control justify-center rounded-xl border-focus px-md active:opacity-60"><QuestText>Retry context</QuestText></Pressable>}
  </WizardCard>;
}

const contextMessages = new Set([
  'Outside your saved place', 'Away from your saved place', 'Saved place is inactive',
  'Location unavailable', 'Scheduled for later', 'Outside your preferred time', 'Prerequisite unavailable',
]);

export function RecommendedQuestCard({ reasons, constraints = [], groupLabel, expanded, onExpandedChange, onDismiss, ...row }: QuestRowProps & {
  reasons: string[];
  constraints?: string[];
  groupLabel?: string;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onDismiss: () => void;
}) {
  const c = useBeePalette();
  const [focused, setFocused] = useState<'reasons' | 'dismiss' | null>(null);
  const explanations = [...new Set(reasons.filter(reason => reason.trim()))].slice(0, 3);
  const context = [...new Set([...constraints, ...explanations.filter(reason => contextMessages.has(reason) || reason.startsWith('Do after: '))])];
  const positive = explanations.filter(reason => !context.includes(reason));
  const summary = positive[0] ?? 'Suggested from your unfinished quests';
  return <WizardCard className="px-sm py-sm">
    {groupLabel && <QuestText accessibilityRole="header" className="text-label">{groupLabel}</QuestText>}
    <QuestRowContent {...row} />
    <Accordion type="single" collapsible value={expanded ? 'why' : ''} onValueChange={(value: string | undefined) => onExpandedChange(value === 'why')} className="mt-xs">
      <AccordionItem value="why" className="border-0">
        <View className="flex-row items-center gap-xs border-t border-border">
          <AccordionTrigger headerClassName="min-w-0 flex-1" accessibilityLabel={(expanded ? 'Hide' : 'Show') + ' why ' + row.quest.title + ' is recommended'} onFocus={() => setFocused('reasons')} onBlur={() => setFocused(null)} className="min-h-control items-center gap-xs rounded-xl border-focus px-sm py-xs" style={{ borderColor: focused === 'reasons' ? c.focus : 'transparent' }}>
            <QuestText className="flex-1 text-label">Why recommended</QuestText>
          </AccordionTrigger>
          <Pressable accessibilityRole="button" accessibilityLabel={'Not now: ' + row.quest.title} accessibilityState={{ disabled: row.completing }} disabled={row.completing} onPress={onDismiss} onFocus={() => setFocused('dismiss')} onBlur={() => setFocused(null)} className={'min-h-control items-center justify-center rounded-xl border-focus px-sm active:opacity-60 ' + (row.completing ? 'opacity-50' : '')} style={{ borderColor: focused === 'dismiss' ? c.focus : 'transparent' }}>
            <QuestText className="text-metadata text-muted-foreground">Not now</QuestText>
          </Pressable>
        </View>
        <AccordionContent className="px-md pb-sm pt-xs">
          <View className="gap-xs">
            {!positive.length && <QuestText className="text-metadata">{summary}</QuestText>}
            {positive.map(reason => <QuestText key={reason} className="text-metadata text-muted-foreground">{reason}</QuestText>)}
            {context.map(reason => <QuestText key={reason} className="text-metadata text-muted-foreground">{reason}</QuestText>)}
          </View>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  </WizardCard>;
}

function QuestRowContent({ quest, locked = false, prerequisiteState = 'none', prerequisiteTitle, completing = false, onOpen, onComplete }: QuestRowProps) {
  const c = useBeePalette();
  const { fontScale } = useWindowDimensions();
  const [focused, setFocused] = useState<'checkbox' | 'details' | null>(null);
  const completed = quest.status === 'completed';
  const prerequisiteWarning = prerequisiteMessage(prerequisiteState, prerequisiteTitle);
  const canComplete = quest.status === 'active' && !locked && !prerequisiteWarning && !quest.requires_proof;
  const state = questVisualState(quest.status, locked || !!prerequisiteWarning, quest.requires_proof);
  const explanation = state === 'locked' ? prerequisiteWarning : undefined;
  const timing = quest.deadline_at ? `Due ${formatTiming(quest.deadline_at)}` : quest.scheduled_at ? `Scheduled ${formatTiming(quest.scheduled_at)}` : quest.preferred_time ? `Preferred at ${quest.preferred_time.slice(0, 5)}` : '';
  return <View className="flex-row items-center gap-sm">
    <Pressable accessibilityRole={completed || canComplete ? 'checkbox' : 'button'} accessibilityLabel={completed ? `${quest.title}, completed` : canComplete ? `Complete ${quest.title}` : `View requirements for ${quest.title}`} accessibilityHint={completed ? undefined : prerequisiteWarning || (canComplete ? 'Submits quest completion immediately.' : quest.requires_proof ? 'Proof required' : undefined)} accessibilityState={{ checked: completed, disabled: completed || completing, busy: completing }} disabled={completed || completing} onPress={() => { if (!completed && !completing) { if (canComplete) onComplete(); else onOpen(); } }} onFocus={() => setFocused('checkbox')} onBlur={() => setFocused(null)} className="min-h-control min-w-control shrink-0 items-center justify-center rounded-xl border-focus active:opacity-60" style={{ borderColor: focused === 'checkbox' ? c.focus : 'transparent' }}>
      <View className={`h-6 w-6 items-center justify-center rounded-sm border-focus ${completed ? 'border-primary bg-accent' : 'border-input bg-card'}`}>
        {completing ? <ActivityIndicator size="small" color={c.primary} /> : completed ? <Ionicons name="checkmark" size={18} color={c.accentForeground} accessible={false} /> : null}
      </View>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={`View ${quest.title}`} onPress={onOpen} onFocus={() => setFocused('details')} onBlur={() => setFocused(null)} className="min-h-control flex-1 rounded-xl border-focus py-xs pr-xs active:opacity-60" style={{ borderColor: focused === 'details' ? c.focus : 'transparent' }}>
      <View className={fontScale >= Layout.largeTextScale ? 'gap-1' : 'flex-row items-start gap-2'}>
        <View className="flex-1 gap-xs">
          <QuestText className={`text-item ${completed ? 'text-muted-foreground line-through' : ''}`}>{quest.title}</QuestText>
          <CategoryBadge label={quest.category} />
          {!!prerequisiteWarning && prerequisiteWarning !== explanation && !completed && <QuestText className="text-metadata">{prerequisiteWarning}</QuestText>}
          {!!timing && <QuestText className="text-metadata text-muted-foreground">{timing}</QuestText>}
          {state !== 'available' && <QuestStatus state={state} explanation={explanation} />}
        </View>
        {!completed && <XpBadge xp={quest.xp} />}
      </View>
    </Pressable>
  </View>;
}

function formatTiming(value: string) {
  return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
