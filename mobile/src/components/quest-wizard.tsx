import { useState, type ReactNode } from 'react';
import { Pressable, Text as NativeText, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Polygon } from 'react-native-svg';
import { Button, ChoiceChip, IconButton, Sheet } from '@/components/mobile-ui';
import { PixelButton } from '@/components/pixel/pixel-button';
import { QuestCompanion } from '@/components/quest-companion';
import { XpBadge } from '@/components/xp-visuals';
import { Text } from '@/components/ui/text';
import { Borders, Controls, Spacing, TypographyRoles, useBeePalette } from '@/constants/theme';

type IconName = keyof typeof Ionicons.glyphMap;
export { Text as QuestText };
export function QuestCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <View className={`rounded-lg border border-border bg-card ${className}`}>{children}</View>;
}
export function QuestIcon({ icon, small = false }: { icon: IconName; small?: boolean }) {
  const c = useBeePalette();
  const footprint = small ? Spacing.section : Controls.minHeight;
  return <View className="shrink-0 items-center justify-center rounded-pill bg-surface" style={{ width: footprint, height: footprint }}>
    <Ionicons name={icon} size={Controls.iconSize} color={c.primary} accessible={false} />
  </View>;
}
function StepIndicator({ step }: { step: 1 | 2 }) {
  const c = useBeePalette();
  return <View className="flex-row items-center gap-xs" accessible accessibilityLabel={`Step ${step} of 2`}>
    {([1, 2] as const).map((number, index) => <View key={number} className="flex-row items-center gap-xs">
      {index > 0 && <Text className="text-muted-foreground tracking-[2px]">••••</Text>}
      <View className="h-12 w-11 items-center justify-center">
        <Svg width={44} height={48} viewBox="0 0 44 48" accessible={false}><Polygon points="22,2 41,12 41,36 22,46 3,36 3,12" fill={number === step ? c.surface : c.card} stroke={number === step ? c.primary : c.input} strokeWidth={2} strokeLinejoin="round" /></Svg>
        <NativeText accessible={false} className="absolute" style={[TypographyRoles.label, { color: c.foreground }]}>{number}</NativeText>
      </View>
    </View>)}
  </View>;
}
export function QuestWizardHeader({ step, editing, onBack, onClose }: { step: 1 | 2; editing: boolean; onBack: () => void; onClose: () => void }) {
  return <View className="px-lg pb-lg pt-sm">
    <View className="z-10 mb-md flex-row items-center justify-between">
      <IconButton icon="arrow-back" label={step === 2 ? 'Back to quest details' : 'Back'} onPress={onBack} />
      {step === 2 ? <StepIndicator step={step} /> : <View />}
      <IconButton icon="close" label="Close quest form" onPress={onClose} />
    </View>
    {step === 1 ? <View className="flex-row items-center gap-lg">
      <QuestCompanion pose="adventure" /><View className="flex-1 gap-sm"><StepIndicator step={step} /><Text variant="h1">{editing ? 'Edit Quest' : 'Quest Details'}</Text><Text className="text-metadata">Let’s set up your quest!</Text></View>
    </View> : <View className="flex-row items-center gap-sm">
      <View className="flex-1 gap-sm"><Text variant="h1">Optional Settings</Text><Text className="text-metadata text-muted-foreground">Add extra details (these are optional).</Text></View><QuestCompanion pose="resting" />
    </View>}
  </View>;
}
export function QuestAccordion({ title, subtitle, icon, open, onToggle, children }: { title: string; subtitle: string; icon: IconName; open: boolean; onToggle: () => void; children: ReactNode }) {
  const c = useBeePalette();
  const [focused, setFocused] = useState(false);
  return <QuestCard><Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ expanded: open }} onPress={onToggle} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    className="min-h-control flex-row items-center gap-md p-lg" style={({ pressed }) => ({
      borderWidth: Borders.focus, borderColor: focused ? c.focus : 'transparent',
      backgroundColor: pressed ? c.surfaceMuted : 'transparent',
    })}>
    <QuestIcon icon={icon} /><View className="min-w-0 flex-1 gap-xs"><Text className="text-item">{title}</Text><Text className="text-metadata text-muted-foreground">{subtitle}</Text></View><Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={Controls.iconSize} color={c.foreground} accessible={false} />
  </Pressable>{open && <View className="gap-md px-lg pb-lg">{children}</View>}</QuestCard>;
}
export function QuestChoice({ label, selected, onPress, compact = false }: { label: string; selected: boolean; onPress: () => void; compact?: boolean }) {
  return <View style={compact ? { flexGrow: 1 } : undefined}><ChoiceChip appearance="pixel" label={label} selected={selected} onPress={onPress} /></View>;
}
export function QuestSelect({ label, value, options, onChange, icon, children, selectedValue }: { label: string; value: string; options: { label: string; value: string }[]; onChange: (value: string) => void; icon?: IconName; children?: ReactNode; selectedValue?: string }) {
  const [open, setOpen] = useState(false);
  return <>
    <Button label={value} accessibilityLabel={label + ': ' + value} intent="secondary"
      icon={icon ?? 'chevron-down'} onPress={() => setOpen(true)} />
    <Sheet title={label} visible={open} onClose={() => setOpen(false)}>
      {options.map(option => <ChoiceChip appearance="pixel" key={option.value} label={option.label}
        selected={selectedValue !== undefined ? selectedValue === option.value : value === option.label}
        onPress={() => { onChange(option.value); setOpen(false); }} />)}
      {children}
    </Sheet>
  </>;
}
export function QuestNote({ children, icon = 'sparkles-outline' }: { children: ReactNode; icon?: IconName }) {
  const c = useBeePalette();
  return <View className="flex-row items-start gap-sm rounded-md border border-border bg-muted p-md"><Ionicons name={icon} size={19} color={c.primary} accessible={false} /><Text className="flex-1 text-metadata text-muted-foreground">{children}</Text></View>;
}
export function QuestFieldLabel({ label, icon }: { label: string; icon: IconName }) {
  return <View className="mb-sm flex-row items-center gap-sm"><QuestIcon icon={icon} small /><Text className="flex-1 text-label">{label}</Text></View>;
}
export function QuestWizardFooter({ xp, label, disabled, busy, feedback, onPress }: { xp: number; label: string; disabled: boolean; busy: boolean; feedback: string | null; onPress: () => void }) {
  return <View className="rounded-t-xl border border-border bg-card px-gutter pb-md pt-lg">
    {!!feedback && <Text accessibilityRole="alert" className="mb-md text-destructive">{feedback}</Text>}
    <View className="flex-row flex-wrap items-center justify-between gap-md">
      <View>
        <XpBadge xp={xp} />
        <Text className="text-metadata text-muted-foreground">on completion</Text>
      </View>
      <PixelButton layout="wrap" label={label} loading={busy} disabled={disabled && !busy} onPress={onPress} />
    </View>
  </View>;
}
