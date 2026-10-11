import '@/global.css';
import { PortalHost } from '@rn-primitives/portal';
import { ThemeProvider, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { Platform, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useAppAppearance, useRestoreAppAppearance } from '@/hooks/use-app-appearance';
import { useBeePalette } from '@/constants/theme';

import { QuestNotificationResponse } from '@/components/quest-notification-response';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { HexagonBackground } from '@/components/hexagon-background';
import { UserDataProvider, useUserData } from '@/context/user-data-context';
import { QuestPriorityProvider } from '@/context/quest-priority-context';
import { LocationProvider } from '@/context/location-context';
import { NAV_THEME } from '@/lib/theme';
import { MOBILE_WELLNESS_AND_SUPPORT_ENABLED } from '@/constants/features';

void SplashScreen.preventAutoHideAsync().catch(() => {});

function AppNavigator() {
  const { access } = useUserData();
  // Keep the navigator mounted through logout; only admitted accounts own these routes.
  return (
    <Stack unstable_nativeProps={{ nativeContainerStyle: { backgroundColor: 'transparent' } }} screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}>
      <Stack.Protected guard={access !== 'active'}>
        <Stack.Screen name="auth" options={{ gestureEnabled: false }} />
      </Stack.Protected>
      <Stack.Protected guard={access === 'active'}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="notifications" options={{ presentation: 'modal' }} />
        <Stack.Screen name="add-quest" options={{ presentation: 'modal' }} />
        <Stack.Screen name="manage-locations" />
        <Stack.Screen name="settings/index" />
        <Stack.Screen name="settings/general" />
        <Stack.Protected guard={MOBILE_WELLNESS_AND_SUPPORT_ENABLED}>
          <Stack.Screen name="wellness-check-in" />
          <Stack.Screen name="self-management-reflection" />
          <Stack.Screen name="wellness-history" />
          <Stack.Screen name="support-requests" />
        </Stack.Protected>
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const palette = useBeePalette();
  const { scheme } = useAppAppearance();
  useRestoreAppAppearance();
  return (
    <UserDataProvider>
      <LocationProvider>
        <QuestPriorityProvider>
          <ThemeProvider value={NAV_THEME[scheme]}>
            <View style={{ flex: 1, backgroundColor: palette.background }}>
              <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
              <HexagonBackground />
              <AnimatedSplashOverlay />
              <AppNavigator />
              {Platform.OS === 'android' && <QuestNotificationResponse />}
              <PortalHost />
            </View>
          </ThemeProvider>
        </QuestPriorityProvider>
      </LocationProvider>
    </UserDataProvider>
  );
}
