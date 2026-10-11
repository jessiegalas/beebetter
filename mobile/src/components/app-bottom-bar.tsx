import { useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, type Tabs } from 'expo-router';

import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Polygon } from 'react-native-svg';
import { ThemedText } from './themed-text';
import { Borders, Controls, Layout, Radii, Spacing, useBeePalette } from '@/constants/theme';

type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

export function AppBottomBar({ state, navigation }: BottomTabBarProps) {
  const navigate = (name: string) => {
    const route = state.routes.find(item => item.name === name);
    if (!route) return;
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!event.defaultPrevented) navigation.navigate(route.name, route.params);
  };
  return <BottomNavigation active={state.routes[state.index]?.name} onHome={() => navigate('index')} onQuests={() => navigate('quests')} onCreate={() => router.push('/add-quest')} />;
}

/** Shared native/web presentation; the navigator continues owning route state. */
export function BottomNavigation({ active, onHome, onQuests, onCreate }: { active?: string; onHome: () => void; onQuests: () => void; onCreate: () => void }) {
  const c = useBeePalette();
  const [createFocused, setCreateFocused] = useState(false);
  return <SafeAreaView edges={['bottom']} style={s.safeArea}>
    <View style={[s.bar, { backgroundColor: c.card }]}>
      <NavigationItem label="Home" icon="home" active={active === 'index'} onPress={onHome} />
      <Pressable cssInterop={false} accessibilityRole="button" accessibilityLabel="Create quest" onPress={onCreate} onFocus={() => setCreateFocused(true)} onBlur={() => setCreateFocused(false)} style={({ pressed }) => [s.create, { backgroundColor: pressed ? c.surface : 'transparent', borderColor: createFocused ? c.focus : 'transparent' }]}>
        <Svg width={64} height={64} viewBox="0 0 64 64" accessible={false}>
          <Polygon points="32,2 58,17 58,47 32,62 6,47 6,17" fill={c.accent} />
          <Path d="M32 22v20M22 32h20" stroke={c.accentForeground} strokeWidth={2} strokeLinecap="round" />
        </Svg>
      </Pressable>
      <NavigationItem label="Quests" icon="clipboard-outline" active={active === 'quests'} onPress={onQuests} />
    </View>
  </SafeAreaView>;
}

function NavigationItem({ label, icon, active, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; active: boolean; onPress: () => void }) {
  const c = useBeePalette(), [focused, setFocused] = useState(false);
  return <Pressable cssInterop={false} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: active }} onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={({ pressed }) => [s.item, { borderColor: focused ? c.focus : 'transparent', backgroundColor: pressed ? c.surfaceMuted : 'transparent' }]}>
    <Ionicons name={icon} size={Controls.iconSize} color={active ? c.primary : c.muted} accessible={false} />
    <ThemedText type="small" style={{ color: active ? c.primary : c.muted }}>{label}</ThemedText>
    <View style={[s.indicator, { backgroundColor: active ? c.accent : 'transparent' }]} />
  </Pressable>;
}

const s = StyleSheet.create({
  safeArea: { paddingHorizontal: Spacing.gutter, paddingBottom: Spacing.sm },
  bar: { width: '100%', maxWidth: Layout.maxContentWidth, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs, borderRadius: Radii.xl },
  item: { flex: 1, minWidth: 0, minHeight: Controls.minHeight, alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, padding: Spacing.sm, borderRadius: Radii.lg, borderWidth: Borders.focus },
  create: { minWidth: 68, minHeight: 68, alignItems: 'center', justifyContent: 'center', borderRadius: Radii.lg, borderWidth: Borders.focus },
  indicator: { width: Spacing.xl, height: Spacing.half, borderRadius: Radii.pill },
});
