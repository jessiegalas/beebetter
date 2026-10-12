import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View, type TextProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Polygon } from 'react-native-svg';
import { Fonts, useAppColorScheme } from '@/constants/theme';

type IconName = keyof typeof Ionicons.glyphMap;
export function QuestText({ className = '', style, ...props }: TextProps) {
  return <Text className={`text-[15px] leading-[21px] text-[#432914] dark:text-[#f8edda] ${className}`} style={[{ fontFamily: Fonts.rounded }, style]} {...props} />;
}
export function QuestCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <View className={`rounded-[22px] border border-[#eee1c8] bg-[#fffdf7] shadow-sm shadow-[#977243]/15 dark:border-[#64513b] dark:bg-[#30291f] ${className}`}>{children}</View>;
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
  return <View className="flex-row items-center gap-1" accessible accessibilityLabel={`Step ${step} of 2`}>
    {([1, 2] as const).map((number, index) => <View key={number} className="flex-row items-center gap-1">
      {index > 0 && <QuestText className="text-[#d7c5a0] tracking-[2px]">••••</QuestText>}
      <View className="h-12 w-11 items-center justify-center">
        <Svg width={44} height={48} viewBox="0 0 44 48" accessible={false}><Polygon points="22,2 41,12 41,36 22,46 3,36 3,12" fill={number === step ? '#ffda7a' : '#fffaf0'} stroke={number === step ? '#ad6b11' : '#cfbea0'} strokeWidth={2} strokeLinejoin="round" /></Svg>
        <Text className="absolute text-[21px] font-bold" style={{ color: number === step ? '#55330d' : '#988468', fontFamily: Fonts.rounded }}>{number}</Text>
      </View>
    </View>)}
  </View>;
}
function IllustrationPlaceholder({ compact = false }: { compact?: boolean }) {
  return <View accessibilityLabel={compact ? 'Resting companion illustration placeholder' : 'Adventure companion illustration placeholder'} className={`items-center justify-center rounded-[24px] border border-[#c9c7bf] bg-[#deded7] dark:border-[#68665e] dark:bg-[#49483f] ${compact ? 'h-[82px] w-[90px]' : 'h-[168px] w-[46%]'}`}>
    <Ionicons name="image-outline" size={compact ? 25 : 38} color="#74746b" />
    <QuestText className="px-2 pt-2 text-center text-[11px] leading-[14px] text-[#58594f] dark:text-[#e1e1d7]">{compact ? 'Resting companion' : 'Adventure companion'}{'\n'}Illustration</QuestText>
  </View>;
}
export function QuestWizardHeader({ step, editing, onBack, onClose }: { step: 1 | 2; editing: boolean; onBack: () => void; onClose: () => void }) {
  const color = useAppColorScheme() === 'dark' ? '#f8edda' : '#432914';
  return <View className="px-4 pb-4 pt-2">
    <View className="z-10 mb-3 flex-row items-center justify-between">
      <Pressable accessibilityRole="button" accessibilityLabel={step === 2 ? 'Back to quest details' : 'Back'} onPress={onBack} className="h-12 w-12 items-center justify-center rounded-full border border-[#ead5a6] bg-[#fff9e5] active:opacity-60 dark:border-[#77603b] dark:bg-[#3d3325]"><Ionicons name="arrow-back" size={24} color={color} /></Pressable>
      {step === 2 ? <StepIndicator step={step} /> : <View />}
      <Pressable accessibilityRole="button" accessibilityLabel="Close quest form" onPress={onClose} className="h-12 w-12 items-center justify-center rounded-full border border-[#ead5a6] bg-[#fff9e5] active:opacity-60 dark:border-[#77603b] dark:bg-[#3d3325]"><Ionicons name="close" size={25} color={color} /></Pressable>
    </View>
    {step === 1 ? <View className="-mt-12 flex-row items-center gap-4">
      <IllustrationPlaceholder /><View className="flex-1 gap-2"><StepIndicator step={step} /><QuestText accessibilityRole="header" className="text-[22px] font-bold leading-[28px]">{editing ? 'Edit Quest' : 'Quest Details'}</QuestText><QuestText className="text-[13px] leading-5">Let’s set up your quest!</QuestText></View>
    </View> : <View className="min-h-[90px] flex-row items-center gap-2">
      <View className="flex-1 gap-2"><QuestText accessibilityRole="header" className="text-[24px] font-bold leading-[30px]">Optional Settings</QuestText><QuestText className="text-[13px] leading-5 text-[#6d5d4d] dark:text-[#c6b9a7]">Add extra details (these are optional).</QuestText></View><IllustrationPlaceholder compact />
    </View>}
  </View>;
}
export function QuestAccordion({ title, subtitle, icon, tone, open, onToggle, children }: { title: string; subtitle: string; icon: IconName; tone: keyof typeof tones; open: boolean; onToggle: () => void; children: ReactNode }) {
  const color = useAppColorScheme() === 'dark' ? '#f8edda' : '#54351e';
  return <QuestCard><Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ expanded: open }} onPress={onToggle} className="min-h-[88px] flex-row items-center gap-3 p-4 active:opacity-70">
    <QuestIcon icon={icon} tone={tone} /><View className="flex-1 gap-1"><QuestText className="text-[16px] font-bold leading-[22px]">{title}</QuestText><QuestText className="text-[12px] leading-[18px] text-[#796e64] dark:text-[#c6b9a7]">{subtitle}</QuestText></View><Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={color} />
  </Pressable>{open && <View className="gap-3 px-4 pb-4">{children}</View>}</QuestCard>;
}
export function QuestChoice({ label, selected, onPress, compact = false }: { label: string; selected: boolean; onPress: () => void; compact?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} className={`min-h-12 items-center justify-center rounded-full border py-2 active:opacity-60 ${compact ? 'flex-1 px-2' : 'px-3'} ${selected ? 'border-[#dc970f] bg-[#ffe8a1] dark:border-[#d4a552] dark:bg-[#71541f]' : 'border-[#e9dcc4] bg-[#fffdf7] dark:border-[#64513b] dark:bg-[#30291f]'}`}><QuestText className="text-[13px] leading-[18px]">{label}</QuestText></Pressable>;
}
export function QuestSelect({ label, value, options, onChange, icon, children, selectedValue }: { label: string; value: string; options: { label: string; value: string }[]; onChange: (value: string) => void; icon?: IconName; children?: ReactNode; selectedValue?: string }) {
  const [open, setOpen] = useState(false);
  const color = useAppColorScheme() === 'dark' ? '#f8edda' : '#54351e';
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} accessibilityState={{ expanded: open }} onPress={() => setOpen(true)} className="min-h-12 flex-row items-center gap-3 rounded-[12px] border border-[#d8cbb2] bg-[#fffefa] px-3 py-3 active:opacity-70 dark:border-[#76634b] dark:bg-[#342c22]">
      {!!icon && <Ionicons name={icon} size={20} color={color} />}<QuestText className="flex-1 text-[14px]">{value}</QuestText><Ionicons name="chevron-down" size={17} color={color} />
    </Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}><View className="flex-1 justify-end bg-black/35">
      <Pressable className="flex-1" accessibilityLabel={`Dismiss ${label}`} accessibilityRole="button" onPress={() => setOpen(false)} />
      <SafeAreaView edges={['bottom']} className="max-h-[75%] rounded-t-[28px] bg-[#fffdf7] p-5 dark:bg-[#30291f]" accessibilityViewIsModal>
        <View className="mb-3 flex-row items-center justify-between"><QuestText className="flex-1 text-xl font-bold">{label}</QuestText><Pressable accessibilityRole="button" accessibilityLabel={`Close ${label}`} onPress={() => setOpen(false)} className="h-12 w-12 items-center justify-center"><Ionicons name="close" size={24} color={color} /></Pressable></View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-2 pb-4">{options.map(option => <QuestChoice key={option.value} label={option.label} selected={selectedValue !== undefined ? selectedValue === option.value : value === option.label} onPress={() => { onChange(option.value); setOpen(false); }} />)}{children}</ScrollView>
      </SafeAreaView>
    </View></Modal>
  </>;
}
export function QuestNote({ children, icon = 'sparkles-outline' }: { children: ReactNode; icon?: IconName }) {
  return <View className="flex-row items-start gap-2 rounded-[12px] border border-[#f0e5cf] bg-[#fff7e3] p-3 dark:border-[#675235] dark:bg-[#403523]"><Ionicons name={icon} size={19} color="#d3911d" /><QuestText className="flex-1 text-[12px] leading-[18px] text-[#756554] dark:text-[#e2d2b9]">{children}</QuestText></View>;
}
export function QuestFieldLabel({ label, icon }: { label: string; icon: IconName }) {
  return <View className="mb-2 flex-row items-center gap-2"><View className="h-9 w-9 items-center justify-center rounded-full bg-[#fff3d8] dark:bg-[#5b4726]"><Ionicons name={icon} size={23} color="#a56813" /></View><QuestText className="flex-1 font-semibold">{label}</QuestText></View>;
}
export function QuestWizardFooter({ xp, label, disabled, busy, feedback, onPress }: { xp: number; label: string; disabled: boolean; busy: boolean; feedback: string | null; onPress: () => void }) {
  return <View className="rounded-t-[30px] border border-[#ead9b7] bg-[#fff9eb] px-5 pb-3 pt-4 shadow-sm dark:border-[#64513b] dark:bg-[#30291f]">
    {!!feedback && <QuestText accessibilityLiveRegion="polite" className="mb-3 text-[13px] text-[#ae3428] dark:text-[#ffb4a9]">{feedback}</QuestText>}
    <View className="flex-row flex-wrap items-center justify-between gap-3">
      <View className="flex-row items-center gap-2"><Ionicons name="star" size={31} color="#eeb64b" /><View><QuestText className="font-semibold text-[#85490e] dark:text-[#f4cc81]">{xp} XP</QuestText><QuestText className="text-[12px] leading-[18px] text-[#796b5c] dark:text-[#c6b9a7]">on completion</QuestText></View></View>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled, busy }} disabled={disabled} onPress={onPress} className={`min-h-14 flex-row items-center justify-center gap-3 rounded-full border border-[#d58d10] bg-[#ffda78] px-6 py-3 shadow-sm active:bg-[#f5c65f] ${disabled ? 'opacity-50' : ''}`}>
        {busy && <ActivityIndicator size="small" color="#54310b" />}<Text className="text-[16px] font-bold text-[#432914]" style={{ fontFamily: Fonts.rounded }}>{label}</Text><Ionicons name={label === 'Continue' ? 'arrow-forward' : 'sparkles-outline'} size={20} color="#805013" />
      </Pressable>
    </View>
  </View>;
}
