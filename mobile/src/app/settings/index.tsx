import { View } from 'react-native';
import { router } from 'expo-router';
import { Button, IconButton, ScreenFrame } from '@/components/mobile-ui';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

export default function SettingsScreen() {
  return <ScreenFrame>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
      <IconButton icon="arrow-back" label="Back from Settings" onPress={() => router.back()} />
      <ThemedText type="title">Settings</ThemedText>
    </View>
    <Button intent="secondary" icon="chevron-forward" label="General" onPress={() => router.push('/settings/general')} />
  </ScreenFrame>;
}