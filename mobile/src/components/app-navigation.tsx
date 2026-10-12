import { Tabs } from 'expo-router';
import { AppBottomBar } from './app-bottom-bar';

export default function AppTabs() {
  return (
    <Tabs
      tabBar={props => <AppBottomBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: 'transparent' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="quests" options={{ title: 'Quests' }} />
      <Tabs.Screen name="skill-tree" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
  );
}