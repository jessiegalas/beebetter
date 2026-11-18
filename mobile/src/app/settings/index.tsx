import { router } from 'expo-router';
import { Button, IconButton, ScreenFrame, ScreenHeader } from '@/components/mobile-ui';

export default function SettingsScreen() {
  return <ScreenFrame>
    <ScreenHeader title="Settings" leading={<IconButton icon="arrow-back" label="Back from Settings" onPress={() => router.back()} />} />
    <Button intent="secondary" icon="chevron-forward" label="General" onPress={() => router.push('/settings/general')} />
  </ScreenFrame>;
}
