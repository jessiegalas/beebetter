import { NativeTabs } from 'expo-router/unstable-native-tabs';

const COLORS = {
  bg: '#FFF9ED',
  honey: '#F6C445',
  black: '#2D241D',
  gray: '#88796B',
};

export default function AppTabs() {
  return (
    <NativeTabs
      backgroundColor={COLORS.bg}
      indicatorColor={COLORS.honey}
      tintColor={COLORS.black}
      labelStyle={{ default: { color: COLORS.gray }, selected: { color: COLORS.black } }}>
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