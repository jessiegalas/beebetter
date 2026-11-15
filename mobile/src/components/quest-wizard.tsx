import { useState, type ReactNode } from 'react';
import { Pressable, Text, View, type TextProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Polygon } from 'react-native-svg';
import { Button, ChoiceChip, IconButton, Sheet } from '@/components/mobile-ui';
import { PixelButton } from '@/components/pixel/pixel-button';
import { QuestCompanion } from '@/components/quest-companion';
import { XpBadge } from '@/components/xp-visuals';
import { Borders, Fonts, useAppColorScheme, useBeePalette } from '@/constants/theme';

type IconName = keyof typeof Ionicons.glyphMap;
export function QuestText({ className = '', style, ...props }: TextProps) {
  return <Text className={`text-body text-foreground ${className}`} style={[{ fontFamily: Fonts.rounded }, style]} {...props} />;
}
export function QuestCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <View className={`rounded-lg border border-border bg-card ${className}`}>{children}</View>;
}
const tones = {
  amber: { background: 'bg-[#ffda8b] dark:bg-[#725321]', color: '#995607' },
  green: { background: 'bg-[#b9dfae] dark:bg-[#365436]', color: '#2f7434' },
  red: { background: 'bg-[#ffaaa1] dark:bg-[#703d37]', color: '#b52e28' },
  purple: { background: 'bg-[#dfb8f6] dark:bg-[#593b70]', color: '#8531b6' },
  blue: { background: 'bg-[#a7d5ff] dark:bg-[#2e5274]', color: '#147ac6' },
};
export function QuestIcon({ icon, tone = 'amber', small = false }: { icon: IconName; tone?: keyof typeof tones; small?: boolean }) {
  const dark = useAppColorScheme() === 'dark';
  return <View className={`items-center justify-center rounded-full ${small ? 'h-10 w-10' : 'h-14 w-14'} ${tones[tone].background}`}><Ionicons name={icon} size={small ? 23 : 31} color={dark ? '#fff1d4' : tones[tone].color} /></View>;
}
function StepIndicator({ step }: { step: 1 | 2 }) {
  const c = useBeePalette();
  return <View className="flex-row items-center gap-1" accessible accessibilityLabel={`Step ${step} of 2`}>
    {([1, 2] as const).map((number, index) => <View key={number} className="flex-row items-center gap-1">
      {index > 0 && <QuestText className="text-muted-foreground tracking-[2px]">••••</QuestText>}
      <View className="h-12 w-11 items-center justify-center">
        <Svg width={44} height={48} viewBox="0 0 44 48" accessible={false}><Polygon points="22,2 41,12 41,36 22,46 3,36 3,12" fill={number === step ? c.surface : c.card} stroke={number === step ? c.primary : c.input} strokeWidth={2} strokeLinejoin="round" /></Svg>
        <Text className="absolute text-[21px] font-bold" style={{ color: c.foreground, fontFamily: Fonts.rounded }}>{number}</Text>
      </View>
    </View>)}
  </View>;
}
export function QuestWizardHeader({ step, editing, onBack, onClose }: { step: 1 | 2; editing: boolean; onBack: () => void; onClose: () => void }) {
  return <View className="px-4 pb-4 pt-2">
    <View className="z-10 mb-3 flex-row items-center justify-between">
      <IconButton icon="arrow-back" label={step === 2 ? 'Back to quest details' : 'Back'} onPress={onBack} />
      {step === 2 ? <StepIndicator step={step} /> : <View />}
      <IconButton icon="close" label="Close quest form" onPress={onClose} />
    </View>
    {step === 1 ? <View className="flex-row items-center gap-4">
      <QuestCompanion pose="adventure" /><View className="flex-1 gap-2"><StepIndicator step={step} /><QuestText accessibilityRole="header" className="text-[22px] font-bold leading-[28px]">{editing ? 'Edit Quest' : 'Quest Details'}</QuestText><QuestText className="text-[13px] leading-5">Let’s set up your quest!</QuestText></View>
    </View> : <View className="min-h-[90px] flex-row items-center gap-2">
      <View className="flex-1 gap-2"><QuestText accessibilityRole="header" className="text-[24px] font-bold leading-[30px]">Optional Settings</QuestText><QuestText className="text-[13px] leading-5 text-muted-foreground">Add extra details (these are optional).</QuestText></View><QuestCompanion pose="resting" />
    </View>}
  </View>;
}
export function QuestAccordion({ title, subtitle, icon, tone, open, onToggle, children }: { title: string; subtitle: string; icon: IconName; tone: keyof typeof tones; open: boolean; onToggle: () => void; children: ReactNode }) {
  const c = useBeePalette();
  const [focused, setFocused] = useState(false);
  return <QuestCard><Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ expanded: open }} onPress={onToggle} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    className="min-h-control flex-row items-center gap-md p-lg" style={({ pressed }) => ({
      borderWidth: Borders.focus, borderColor: focused ? c.focus : 'transparent',
      backgroundColor: pressed ? c.surfaceMuted : 'transparent',
    })}>
    <QuestIcon icon={icon} tone={tone} /><View className="flex-1 gap-1"><QuestText className="text-[16px] font-bold leading-[22px]">{title}</QuestText><QuestText className="text-[12px] leading-[18px] text-muted-foreground">{subtitle}</QuestText></View><Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={c.foreground} />
  </Pressable>{open && <View className="gap-3 px-4 pb-4">{children}</View>}</QuestCard>;
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
  return <View className="flex-row items-start gap-2 rounded-md border border-border bg-muted p-md"><Ionicons name={icon} size={19} color={c.primary} accessible={false} /><QuestText className="flex-1 text-[12px] leading-[18px] text-muted-foreground">{children}</QuestText></View>;
}
export function QuestFieldLabel({ label, icon }: { label: string; icon: IconName }) {
  return <View className="mb-2 flex-row items-center gap-2"><View className="h-9 w-9 items-center justify-center rounded-full bg-[#fff3d8] dark:bg-[#5b4726]"><Ionicons name={icon} size={23} color="#a56813" /></View><QuestText className="flex-1 font-semibold">{label}</QuestText></View>;
}
export function QuestWizardFooter({ xp, label, disabled, busy, feedback, onPress }: { xp: number; label: string; disabled: boolean; busy: boolean; feedback: string | null; onPress: () => void }) {
  return <View className="rounded-t-xl border border-border bg-card px-gutter pb-md pt-lg">
    {!!feedback && <QuestText accessibilityRole="alert" className="mb-md text-destructive">{feedback}</QuestText>}
    <View className="flex-row flex-wrap items-center justify-between gap-md">
      <View>
        <XpBadge xp={xp} />
        <QuestText className="text-metadata text-muted-foreground">on completion</QuestText>
      </View>
      <PixelButton layout="wrap" label={label} loading={busy} disabled={disabled && !busy} onPress={onPress} />
    </View>
  </View>;
}
