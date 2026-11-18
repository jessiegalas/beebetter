import { Switch, View } from 'react-native';
import { router } from 'expo-router';
import { IconButton, ScreenFrame, ScreenHeader, Surface } from '@/components/mobile-ui';
import { ThemedText } from '@/components/themed-text';
import { Controls, Spacing, useBeePalette } from '@/constants/theme';
import { setAppAppearance, useAppAppearance } from '@/hooks/use-app-appearance';

export default function GeneralSettingsScreen() {
  const c = useBeePalette();
  const { scheme } = useAppAppearance();
  return <ScreenFrame>
    <ScreenHeader title="General" leading={<IconButton icon="arrow-back" label="Back to Settings" onPress={() => router.back()} />} />
    <Surface style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.lg, minHeight: Controls.minHeight }}>
      <View style={{ flex: 1, minWidth: 0, gap: Spacing.xs }}>
        <ThemedText type="item">Dark Mode</ThemedText>
        <ThemedText type="small" style={{ color: c.muted }}>Use a darker appearance throughout the app.</ThemedText>
      </View>
      <Switch accessibilityLabel="Dark Mode" value={scheme === 'dark'} onValueChange={enabled => setAppAppearance(enabled ? 'dark' : 'light')} trackColor={{ false: c.input, true: c.primary }} thumbColor={scheme === 'dark' ? c.primaryForeground : c.card} style={{ minHeight: Controls.minHeight, minWidth: Controls.minHeight }} />
    </Surface>
  </ScreenFrame>;
}
