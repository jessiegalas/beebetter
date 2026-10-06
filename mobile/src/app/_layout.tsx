import { DarkTheme, DefaultTheme, ThemeProvider, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { Platform, useColorScheme } from 'react-native';

import { QuestNotificationResponse } from '@/components/quest-notification-response';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { UserDataProvider, useUserData } from '@/context/user-data-context';
import { QuestPriorityProvider } from '@/context/quest-priority-context';
import { LocationProvider } from '@/context/location-context';
import { MOBILE_WELLNESS_AND_SUPPORT_ENABLED } from '@/constants/features';

void SplashScreen.preventAutoHideAsync().catch(() => {});

function AppNavigator() {
  const { access } = useUserData();
  // Keep the navigator mounted through logout; only admitted accounts own these routes.
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={access !== 'active'}>
        <Stack.Screen name="auth" options={{ gestureEnabled: false }} />
      </Stack.Protected>
      <Stack.Protected guard={access === 'active'}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="notifications" options={{ presentation: 'modal' }} />
        <Stack.Screen name="add-quest" options={{ presentation: 'modal' }} />
        <Stack.Screen name="manage-locations" />
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
  const colorScheme = useColorScheme();
  return (
    <UserDataProvider>
      <LocationProvider>
        <QuestPriorityProvider>
          <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            <AnimatedSplashOverlay />
            <AppNavigator />
            {Platform.OS === 'android' && <QuestNotificationResponse />}
          </ThemeProvider>
        </QuestPriorityProvider>
      </LocationProvider>
    </UserDataProvider>
  );
}
