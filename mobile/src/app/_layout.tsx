import { DarkTheme, DefaultTheme, ThemeProvider, Stack, useSegments, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme, View, ActivityIndicator, StyleSheet } from 'react-native';
import { useEffect } from 'react';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { UserDataProvider, useUserData } from '@/context/user-data-context';
import { QuestPriorityProvider } from '@/context/quest-priority-context';
import { LocationProvider } from '@/context/location-context';
import { BeeBetterColors as COLORS } from '@/constants/theme';

SplashScreen.preventAutoHideAsync();

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useUserData();
  const segments = useSegments();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === 'auth';

    if (!user && !inAuthGroup) {
      // Redirect unauthenticated users straight to login / sign up
      router.replace('/auth');
    } else if (user && inAuthGroup) {
      // Once authenticated, send to main app tabs
      router.replace('/(tabs)');
    }
  }, [user, isLoading, segments]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.honeyDark} />
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <UserDataProvider>
      <LocationProvider>
      <QuestPriorityProvider>
      <AuthGuard>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <AnimatedSplashOverlay />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="auth" options={{ gestureEnabled: false }} />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="notifications" options={{ presentation: 'modal' }} />
            <Stack.Screen name="add-quest" options={{ presentation: 'modal' }} />
            <Stack.Screen name="manage-locations" />
          </Stack>
        </ThemeProvider>
      </AuthGuard>
      </QuestPriorityProvider>
      </LocationProvider>
    </UserDataProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
