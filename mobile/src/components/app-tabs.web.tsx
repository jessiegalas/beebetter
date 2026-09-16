import { Tabs, TabList, TabSlot, TabTrigger, TabTriggerSlotProps } from 'expo-router/ui';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BeeBetterColors, BeeBetterShadow } from '@/constants/theme';

type TabButtonProps = TabTriggerSlotProps & {
  icon: keyof typeof Ionicons.glyphMap;
};

export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={styles.slot} />
      <TabList style={styles.tabList}>
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
  const color = isFocused ? BeeBetterColors.ink : BeeBetterColors.muted;

  return (
    <Pressable
      {...props}
      style={({ pressed }) => [styles.tabButton, pressed && styles.tabButtonPressed]}>
      <View style={[styles.tabIcon, isFocused && styles.tabIconFocused]}>
        <Ionicons name={icon} size={18} color={color} />
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
    gap: 6,
    padding: 8,
    backgroundColor: BeeBetterColors.card,
    borderRadius: 24,
    ...BeeBetterShadow,
  },
  tabButton: {
    alignItems: 'center',
    gap: 3,
    minWidth: 58,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 18,
  },
  tabButtonPressed: { opacity: 0.65 },
  tabIcon: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  tabIconFocused: { backgroundColor: BeeBetterColors.honey },
  tabLabel: { fontSize: 10, fontWeight: '700' },
});
