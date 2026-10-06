import { Tabs, TabList, TabSlot, TabTrigger, TabTriggerSlotProps } from 'expo-router/ui';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useBeePalette, BeeBetterShadow, Radii } from '@/constants/theme';

type TabButtonProps = TabTriggerSlotProps & {
  icon: keyof typeof Ionicons.glyphMap;
};

export default function AppTabs() {
  const c = useBeePalette();
  return (
    <Tabs>
      <TabSlot style={styles.slot} />
      <TabList style={[styles.tabList, { backgroundColor: c.card }]}>
        <TabTrigger name="index" href="/" asChild>
          <TabButton icon="home-outline">Home</TabButton>
        </TabTrigger>
        <TabTrigger name="quests" href="/quests" asChild>
          <TabButton icon="list-outline">Quests</TabButton>
        </TabTrigger>
        <TabTrigger name="skill-tree" href="/skill-tree" asChild>
          <TabButton icon="git-network-outline">Skill Tree</TabButton>
        </TabTrigger>
        <TabTrigger name="profile" href="/profile" asChild>
          <TabButton icon="person-outline">Profile</TabButton>
        </TabTrigger>
      </TabList>
    </Tabs>
  );
}

function TabButton({ children, icon, isFocused, ...props }: TabButtonProps) {
  const c = useBeePalette();
  const [focused, setFocused] = useState(false);
  const color = isFocused ? c.ink : c.muted;

  return (
    <Pressable
      {...props}
      accessibilityRole="tab" accessibilityState={{ selected: isFocused }}
      onFocus={event => { setFocused(true); props.onFocus?.(event); }} onBlur={event => { setFocused(false); props.onBlur?.(event); }}
      style={({ pressed }) => [styles.tabButton, { borderWidth: 2, borderColor: focused ? c.honeyDark : 'transparent' }, pressed && styles.tabButtonPressed]}>
      <View style={[styles.tabIcon, isFocused && { backgroundColor: c.honeySoft }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={[styles.tabLabel, { color }]}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  slot: { height: '100%' },
  tabList: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 4,
    width: '92%', maxWidth: 520,
    padding: 8,
    borderRadius: Radii.xl,
    ...BeeBetterShadow,
  },
  tabButton: {
    alignItems: 'center',
    gap: 3,
    flex: 1, minHeight: 64, minWidth: 0,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: Radii.lg,
  },
  tabButtonPressed: { opacity: 0.65 },
  tabIcon: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radii.md,
  },
  tabLabel: { fontSize: 14, lineHeight: 20, fontWeight: '600', textAlign: 'center' },
});
