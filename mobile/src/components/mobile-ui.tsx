import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions, type RefreshControlProps, type TextInputProps, type ViewStyle, type StyleProp } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from './themed-text';
import { Fonts, MaxContentWidth, Radii, useBeePalette } from '@/constants/theme';
type Icon = keyof typeof Ionicons.glyphMap;
export function ScreenFrame({ children, tab = false, scroll = true, refreshControl }: {
    children: ReactNode;
    tab?: boolean;
    scroll?: boolean;
    refreshControl?: React.ReactElement<RefreshControlProps>;
}) {
    const c = useBeePalette(), { width } = useWindowDimensions();
    const content = { width: '100%' as const, maxWidth: MaxContentWidth, alignSelf: 'center' as const, paddingHorizontal: width >= 600 ? 24 : 20, paddingTop: 20, paddingBottom: tab && Platform.OS === 'web' ? 112 : 32, gap: 32 };
    return <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={tab ? ['top'] : ['top', 'bottom']}>
    {scroll ? <ScrollView contentContainerStyle={content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} refreshControl={refreshControl}>
        {children}
        </ScrollView> : <View style={[content, { flex: 1 }]}>
        {children}
        </View>}
  </SafeAreaView>;
}
export function Surface({ children, featured = false, style }: {
    children: ReactNode;
    featured?: boolean;
    style?: StyleProp<ViewStyle>;
}) {
    const c = useBeePalette();
    return <View style={[{ backgroundColor: featured ? c.surfaceWarm : c.card, borderRadius: Radii.lg, padding: 20, gap: 16 }, style]}>
    {children}
    </View>;
}
export function Button({ label, onPress, intent = 'primary', icon, disabled = false, loading = false, style }: {
    label: string;
    onPress: () => void;
    intent?: 'primary' | 'secondary' | 'quiet' | 'destructive';
    icon?: Icon;
    disabled?: boolean;
    loading?: boolean;
    style?: StyleProp<ViewStyle>;
}) {
    const c = useBeePalette(), [focused, setFocused] = useState(false), blocked = disabled || loading;
    const color = intent === 'primary' ? '#2D241D' : intent === 'destructive' ? c.danger : c.ink;
    return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: blocked, busy: loading }} disabled={blocked} onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={({ pressed }) => [s.button, { backgroundColor: intent === 'primary' ? c.honey : intent === 'quiet' ? 'transparent' : c.card, borderColor: focused ? c.honeyDark : 'transparent', opacity: blocked ? 0.5 : pressed ? 0.75 : 1 }, style]}>
    {loading ? <ActivityIndicator color={color}/> : icon && <Ionicons name={icon} size={20} color={color} accessible={false}/>}
    <ThemedText type="label" style={{ color, flexShrink: 1, textAlign: 'center' }}>
    {label}
    </ThemedText>
  </Pressable>;
}
export function IconButton({ icon, label, onPress, disabled = false }: {
    icon: Icon;
    label: string;
    onPress: () => void;
    disabled?: boolean;
}) {
    const c = useBeePalette(), [focused, setFocused] = useState(false);
    return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={({ pressed }) => [s.iconButton, { backgroundColor: pressed ? c.surfaceMuted : 'transparent', borderColor: focused ? c.honeyDark : 'transparent', opacity: disabled ? .5 : 1 }]}>
    <Ionicons name={icon} size={20} color={c.ink} accessible={false}/>
    </Pressable>;
}
export function Field({ label, hint, error, style, ...props }: TextInputProps & {
    label: string;
    hint?: string;
    error?: string;
}) {
    const c = useBeePalette(), [focused, setFocused] = useState(false);
    return <View style={s.field}>
    <ThemedText type="label">
    {label}
    </ThemedText>
        {hint && <ThemedText type="small" style={{ color: c.muted }}>
        {hint}
        </ThemedText>}
    <TextInput {...props} accessibilityLabel={props.accessibilityLabel ?? label} placeholderTextColor={c.muted} onFocus={event => { setFocused(true); props.onFocus?.(event); }} onBlur={event => { setFocused(false); props.onBlur?.(event); }} style={[s.input, { backgroundColor: c.card, color: c.ink, borderColor: error ? c.danger : focused ? c.honeyDark : c.surfaceMuted }, style]}/>
        {error && <ThemedText type="small" accessibilityRole="alert" style={{ color: c.danger }}>
        {error}
        </ThemedText>}
    </View>;
}
export function ChoiceChip({ label, selected, onPress }: {
    label: string;
    selected: boolean;
    onPress: () => void;
}) {
    const c = useBeePalette();
    return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [s.button, { backgroundColor: selected ? c.honeySoft : c.card, borderColor: selected ? c.honeyDark : 'transparent', opacity: pressed ? .75 : 1 }]}>
    <ThemedText type="label">
    {label}
    </ThemedText>
    </Pressable>;
}
export function useReducedMotion() {
    const [reduced, setReduced] = useState(false);
    useEffect(() => {
        let active = true;
        void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active)
            setReduced(value); }).catch(() => { if (active)
            setReduced(true); });
        const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
        return () => { active = false; listener.remove(); };
    }, []);
    return reduced;
}
export function Sheet({ title, visible, onClose, children }: {
    title: string;
    visible: boolean;
    onClose: () => void;
    children: ReactNode;
}) {
    const c = useBeePalette(), reduced = useReducedMotion();
    return <Modal transparent visible={visible} animationType={reduced ? 'none' : 'slide'} onRequestClose={onClose}>
    <View style={s.scrim}>
    <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel={'Close ' + title}/>
    <SafeAreaView accessibilityViewIsModal style={[s.sheet, { backgroundColor: c.background }]} edges={['bottom']}>
    <View style={s.heading}>
    <ThemedText type="subtitle" style={{ flex: 1 }}>
    {title}
    </ThemedText>
    <IconButton icon="close" label={'Close ' + title} onPress={onClose}/>
    </View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 16 }}>
    {children}
    </ScrollView>
    </SafeAreaView>
    </View>
    </Modal>;
}
export function Disclosure({ title, summary, children, defaultOpen = false }: {
    title: string;
    summary?: string;
    children: ReactNode;
    defaultOpen?: boolean;
}) {
    const c = useBeePalette(), [open, setOpen] = useState(defaultOpen);
    return <View>
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={({ pressed }) => [s.heading, { paddingHorizontal: 0, opacity: pressed ? .7 : 1 }]}>
    <View style={{ flex: 1, gap: 4 }}>
    <ThemedText type="subtitle">
    {title}
    </ThemedText>
        {summary && <ThemedText type="small" style={{ color: c.muted }}>
        {summary}
        </ThemedText>}
    </View>
    <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={c.muted} accessible={false}/>
    </Pressable>
        {open && <View style={{ gap: 16, paddingTop: 16 }}>
        {children}
        </View>}
    </View>;
}
const s = StyleSheet.create({ button: { minHeight: 48, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderRadius: Radii.md, borderWidth: 2 }, iconButton: { minWidth: 48, minHeight: 48, borderRadius: Radii.md, borderWidth: 2, alignItems: 'center', justifyContent: 'center' }, field: { gap: 8 }, input: { fontFamily: Fonts.sans, minHeight: 48, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, lineHeight: 24, borderRadius: Radii.md, borderWidth: 1 }, scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,.5)' }, sheet: { width: '100%', maxWidth: 640, alignSelf: 'center', maxHeight: '88%', borderTopLeftRadius: Radii.xl, borderTopRightRadius: Radii.xl }, heading: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 20, paddingTop: 12 } });
