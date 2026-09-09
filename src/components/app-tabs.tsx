import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { BeeBetterColors } from '@/constants/theme';

export default function AppTabs() {
  return (
    <NativeTabs
      backgroundColor={BeeBetterColors.background}
      indicatorColor={BeeBetterColors.honey}
      tintColor={BeeBetterColors.ink}
      labelStyle={{ selected: { color: BeeBetterColors.ink } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="house" drawable="ic_menu_view" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="quests">
        <NativeTabs.Trigger.Label>Quests</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="list.clipboard" drawable="ic_menu_agenda" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="skill-tree">
        <NativeTabs.Trigger.Label>Skill Tree</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="point.3.connected.trianglepath.dotted" drawable="ic_menu_share" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person" drawable="ic_menu_myplaces" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
