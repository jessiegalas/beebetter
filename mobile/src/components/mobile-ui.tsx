import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions, type RefreshControlProps, type TextInputProps, type ViewStyle, type StyleProp } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from './themed-text';
import { PixelChoice } from './pixel/pixel-choice';
import { Borders, ContentColumn, Controls, Layout, Radii, Spacing, States, Typography, useBeePalette } from '@/constants/theme';
// StyleSheet-only controls bypass CSS interop so native pressed-style callbacks stay intact.
type Icon = keyof typeof Ionicons.glyphMap;
export function ScreenFrame({ children, tab = false, scroll = true, refreshControl, viewportRef, contentStyle }: {
    children: ReactNode;
    tab?: boolean;
    scroll?: boolean;
    refreshControl?: React.ReactElement<RefreshControlProps>;
    viewportRef?: React.RefObject<View | null>;
    contentStyle?: StyleProp<ViewStyle>;
}) {
    const { width } = useWindowDimensions();
    const content = [{ ...ContentColumn, paddingHorizontal: width >= Layout.wideBreakpoint ? Spacing.xl : Spacing.gutter, paddingTop: Spacing.gutter, paddingBottom: Spacing.section, gap: Spacing.section }, contentStyle];
    return <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent' }} edges={tab ? ['top'] : ['top', 'bottom']}>
    <View ref={viewportRef} collapsable={false} style={{ flex: 1 }}>{scroll ? <ScrollView contentContainerStyle={content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} refreshControl={refreshControl}>
        {children}
        </ScrollView> : <View style={[content, { flex: 1 }]}>
        {children}
        </View>}</View>
  </SafeAreaView>;
}
export function Surface({ children, featured = false, style }: {
    children: ReactNode;
    featured?: boolean;
    style?: StyleProp<ViewStyle>;
}) {
    const c = useBeePalette();
    return <View style={[{ backgroundColor: featured ? c.surface : c.card, borderRadius: Radii.lg, padding: Spacing.gutter, gap: Spacing.lg }, style]}>
    {children}
    </View>;
}
export function ScreenHeader({ title, subtitle, leading, trailing, style }: {
    title: string;
    subtitle?: string;
    leading?: ReactNode;
    trailing?: ReactNode;
    style?: StyleProp<ViewStyle>;
}) {
    const c = useBeePalette();
    return <View style={[s.screenHeader, style]}>
        {leading}
        <View style={s.screenHeaderCopy}>
            <ThemedText type="title">{title}</ThemedText>
            {subtitle && <ThemedText type="small" style={{ color: c.muted }}>{subtitle}</ThemedText>}
        </View>
        {trailing}
    </View>;
}
export function Button({ label, onPress, intent = 'primary', icon, disabled = false, loading = false, foregroundColor, accessibilityLabel = label, style }: {
    label: string;
    onPress: () => void;
    intent?: 'primary' | 'secondary' | 'quiet' | 'destructive' | 'accent' | 'accent-quiet';
    icon?: Icon;
    disabled?: boolean;
    loading?: boolean;
    foregroundColor?: string;
    accessibilityLabel?: string;
    style?: StyleProp<ViewStyle>;
}) {
    const c = useBeePalette(), [focused, setFocused] = useState(false), blocked = disabled || loading;
    const color = disabled ? c.disabledForeground : foregroundColor ?? (intent === 'primary' ? c.primaryForeground : intent === 'accent' ? c.accentForeground : intent === 'accent-quiet' ? c.accent : intent === 'destructive' ? c.dangerForeground : intent === 'quiet' ? c.primary : c.foreground);
    return <Pressable cssInterop={false} accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled: blocked, busy: loading }} disabled={blocked} onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={({ pressed }) => {
        let backgroundColor = 'transparent';
        if (intent === 'accent') backgroundColor = c.accent;
        if (intent === 'primary') backgroundColor = pressed ? c.primaryPressed : c.primary;
        if (intent === 'secondary') backgroundColor = pressed ? c.surfaceMuted : c.card;
        if (intent === 'quiet' && pressed) backgroundColor = c.surfaceMuted;
        if (intent === 'destructive') backgroundColor = pressed ? c.dangerPressed : c.danger;
        const focusColor = intent === 'primary' ? c.primaryForeground : intent === 'accent' ? c.accentForeground : intent === 'accent-quiet' ? c.accent : intent === 'destructive' ? c.dangerForeground : c.focus;
        return [s.button, { backgroundColor: disabled ? c.disabled : backgroundColor, borderColor: focused ? focusColor : intent === 'secondary' && !disabled ? c.input : 'transparent' }, (intent === 'accent' || intent === 'accent-quiet') && pressed && { opacity: States.pressedOpacity }, style];
    }}>
    {loading ? <ActivityIndicator color={color}/> : icon && <Ionicons name={icon} size={Controls.iconSize} color={color} accessible={false}/>}
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
    return <Pressable cssInterop={false} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={({ pressed }) => [s.iconButton, { backgroundColor: disabled || pressed ? c.disabled : 'transparent', borderColor: focused ? c.focus : 'transparent' }]}>
    <Ionicons name={icon} size={Controls.iconSize} color={disabled ? c.disabledForeground : c.foreground} accessible={false}/>
    </Pressable>;
}
export function Field({ label, hint, error, style, ...props }: TextInputProps & {
    label: string;
    hint?: string;
    error?: string;
}) {
    const c = useBeePalette(), [focused, setFocused] = useState(false);
    // Screens customize input sizing; this primitive owns state colors and stable borders.
    return <View style={s.field}>
    <ThemedText type="label">
    {label}
    </ThemedText>
        {hint && <ThemedText type="small" style={{ color: c.muted }}>
        {hint}
        </ThemedText>}
    <TextInput {...props} accessibilityLabel={props.accessibilityLabel ?? label} placeholderTextColor={c.muted} selectionColor={c.primary} onFocus={event => { setFocused(true); props.onFocus?.(event); }} onBlur={event => { setFocused(false); props.onBlur?.(event); }} style={[s.input, props.multiline && s.multilineInput, style, { backgroundColor: props.editable === false ? c.disabled : c.card, color: props.editable === false ? c.disabledForeground : c.foreground, borderWidth: Borders.focus, borderColor: error ? c.danger : focused ? c.focus : c.input }]}/>
        {error && <ThemedText type="small" accessibilityRole="alert" style={{ color: c.danger }}>
        {error}
        </ThemedText>}
    </View>;
}
export function ChoiceChip({ label, selected, onPress, appearance = 'standard', disabled = false, leading, role = 'button' }: {
    label: string;
    selected: boolean;
    onPress: () => void;
    appearance?: 'standard' | 'pixel';
    disabled?: boolean;
    leading?: ReactNode;
    role?: 'button' | 'radio';
}) {
    const c = useBeePalette(), [focused, setFocused] = useState(false);
    if (appearance === 'pixel') return <PixelChoice label={label} selected={selected} disabled={disabled} leading={leading} role={role} onPress={onPress} />;
    const selection = role === 'radio' ? { checked: selected } : { selected };
    return <Pressable cssInterop={false} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} accessibilityRole={role} accessibilityState={{ ...selection, disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [s.button, { backgroundColor: disabled ? c.disabled : pressed ? c.surfaceMuted : selected ? c.surface : c.card, borderColor: focused && !disabled ? c.focus : selected ? c.primary : c.input }]}>
    {role === 'radio' && <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={Controls.iconSize}
      color={disabled ? c.disabledForeground : selected ? c.primary : c.foreground} accessible={false} />}
    {leading}
    <ThemedText type="label" style={{ flexShrink: 1, color: disabled ? c.disabledForeground : c.foreground }}>
    {label}
    </ThemedText>
    </Pressable>;
}
export function useReducedMotion() {
    // Stay static until the system motion preference is known.
    const [reduced, setReduced] = useState(true);
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
export function Sheet({ title, visible, onClose, children, adjustKeyboardInsets = false, expanded = false }: {
    title: string;
    visible: boolean;
    onClose: () => void;
    children: ReactNode;
    adjustKeyboardInsets?: boolean;
    expanded?: boolean;
}) {
    const c = useBeePalette(), reduced = useReducedMotion();
    const { height } = useWindowDimensions();
    const [progress] = useState(() => new Animated.Value(0));
    const [presentation, setPresentation] = useState({ visible, reduced });
    // Android recreates a visible dialog when its animation type changes.
    if (presentation.visible !== visible) {
        setPresentation({ visible, reduced: visible ? reduced : presentation.reduced });
    }
    const animatePanel = expanded && !presentation.reduced;
    useLayoutEffect(() => {
        if (!visible) {
            progress.stopAnimation();
            progress.setValue(0);
        }
        return () => progress.stopAnimation();
    }, [progress, visible]);

    function showPanel() {
        if (!visible || !animatePanel) return;
        Animated.timing(progress, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }

    const panel = <SafeAreaView accessibilityViewIsModal style={[expanded ? s.panelFill : s.sheet, s.panelCorners, { backgroundColor: c.background }]} edges={['bottom']}>
    <View style={s.heading}>
    <ThemedText type="subtitle" style={{ flex: 1 }}>
    {title}
    </ThemedText>
    <IconButton icon="close" label={'Close ' + title} onPress={onClose}/>
    </View>
    <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={adjustKeyboardInsets} contentContainerStyle={{ padding: Spacing.gutter, gap: Spacing.lg }}>
    {children}
    </ScrollView>
    </SafeAreaView>;
    return <Modal transparent visible={visible} animationType={expanded || presentation.reduced ? 'none' : 'slide'}
        onShow={expanded ? showPanel : undefined} onRequestClose={onClose}>
    <View style={s.scrim}>
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim, opacity: animatePanel ? progress : 1 }]} />
    <Pressable cssInterop={false} style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel={'Close ' + title}/>
    {expanded ? <Animated.View style={[s.sheet, s.expandedSheet, animatePanel && { transform: [{
        translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }),
    }] }]}>{panel}</Animated.View> : panel}
    </View>
    </Modal>;
}
export function Disclosure({ title, summary, children, defaultOpen = false }: {
    title: string;
    summary?: string;
    children: ReactNode;
    defaultOpen?: boolean;
}) {
    const c = useBeePalette(), [open, setOpen] = useState(defaultOpen), [focused, setFocused] = useState(false);
    const { width, fontScale } = useWindowDimensions();
    const expandedLayout = width < Layout.wideBreakpoint && fontScale >= Layout.largeTextScale;
    return <View>
    <Pressable cssInterop={false} accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={({ pressed }) => [s.disclosure, expandedLayout && { flexDirection: 'column', alignItems: 'flex-end' }, { borderColor: focused ? c.focus : 'transparent', opacity: pressed ? States.pressedOpacity : 1 }]}>
    <View style={{ flex: expandedLayout ? undefined : 1, alignSelf: expandedLayout ? 'stretch' : undefined, minWidth: 0, gap: Spacing.xs }}>
    <ThemedText type="subtitle">
    {title}
    </ThemedText>
        {summary && <ThemedText type="small" style={{ color: c.muted }}>
        {summary}
        </ThemedText>}
    </View>
    <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={Controls.iconSize} color={c.muted} accessible={false}/>
    </Pressable>
        {open && <View style={{ gap: Spacing.lg, paddingTop: Spacing.lg }}>
        {children}
        </View>}
    </View>;
}
/** Static badges always pair color with a readable label. */
export function Badge({ label, intent = 'accent', icon }: { label: string; intent?: 'accent' | 'neutral' | 'success' | 'warning' | 'danger'; icon?: Icon }) {
    const c = useBeePalette();
    const backgroundColor = intent === 'success' ? c.successSurface : intent === 'warning' ? c.warningSurface : intent === 'danger' ? c.dangerSurface : intent === 'neutral' ? c.surfaceMuted : c.surface;
    const color = intent === 'success' ? c.success : intent === 'warning' ? c.warning : intent === 'danger' ? c.danger : c.foreground;
    return <View style={[s.badge, { backgroundColor }]}>
        {icon && <Ionicons name={icon} size={16} color={color} accessible={false} />}
        <ThemedText type="label" style={{ color }}>{label}</ThemedText>
    </View>;
}
export function StatusMessage({ message, loading = false, error = false, children }: { message: string; loading?: boolean; error?: boolean; children?: ReactNode }) {
    const c = useBeePalette();
    return <View style={s.status} accessibilityLiveRegion="polite">
        {loading && <ActivityIndicator color={c.primary} />}
        <ThemedText accessibilityRole={error ? 'alert' : undefined} style={{ color: error ? c.danger : c.muted, textAlign: 'center' }}>{message}</ThemedText>
        {children}
    </View>;
}
const s = StyleSheet.create({
    screenHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    screenHeaderCopy: { flex: 1, minWidth: 0, gap: Spacing.xs },
    button: { minHeight: Controls.minHeight, minWidth: Controls.minHeight, maxWidth: '100%', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderRadius: Radii.md, borderWidth: Borders.focus },
    iconButton: { minWidth: Controls.minHeight, minHeight: Controls.minHeight, borderRadius: Radii.md, borderWidth: Borders.focus, alignItems: 'center', justifyContent: 'center' },
    field: { gap: Spacing.sm },
    input: { ...Typography.body, minHeight: Controls.minHeight, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderRadius: Radii.md, borderWidth: Borders.focus },
    multilineInput: { minHeight: Controls.minHeight * 2, textAlignVertical: 'top' },
    scrim: { flex: 1, justifyContent: 'flex-end' },
    sheet: { width: '100%', maxWidth: Layout.maxSheetWidth, alignSelf: 'center', maxHeight: '88%' },
    expandedSheet: { height: '88%' },
    panelFill: { flex: 1 },
    panelCorners: { borderTopLeftRadius: Radii.xl, borderTopRightRadius: Radii.xl },
    heading: { minHeight: Controls.minHeight, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md, paddingHorizontal: Spacing.gutter, paddingTop: Spacing.md },
    disclosure: { minHeight: Controls.minHeight, flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm, borderWidth: Borders.focus, borderRadius: Radii.sm },
    badge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: Spacing.xs, borderRadius: Radii.pill, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs },
    status: { paddingVertical: Spacing.section, alignItems: 'center', gap: Spacing.lg },
});
