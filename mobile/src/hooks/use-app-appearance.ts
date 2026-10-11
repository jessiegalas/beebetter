import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colorScheme } from 'nativewind';
import { APP_COLOR_SCHEME, useAppColorScheme } from '@/constants/theme';

const STORAGE_KEY = 'beebetter:appearance:v1';
let revision = 0;
let writes = Promise.resolve();

export function setAppAppearance(next: 'light' | 'dark') {
  revision += 1;
  colorScheme.set(next);
  // Serialize rapid toggles so the last choice also wins on disk.
  writes = writes.catch(() => {}).then(() => AsyncStorage.setItem(STORAGE_KEY, next));
  void writes.catch(() => console.warn('Could not save appearance preference.'));
}

export function useAppAppearance() {
  const scheme = useAppColorScheme();
  return { scheme, toggleTheme: () => setAppAppearance(scheme === 'light' ? 'dark' : 'light') };
}

export function useRestoreAppAppearance() {
  useEffect(() => {
    let mounted = true;
    const startedAt = revision;
    colorScheme.set(APP_COLOR_SCHEME);
    void AsyncStorage.getItem(STORAGE_KEY).then(saved => {
      // A tap during startup must win over a late storage read.
      if (mounted && revision === startedAt && (saved === 'light' || saved === 'dark')) colorScheme.set(saved);
    }).catch(() => {});
    return () => { mounted = false; };
  }, []);
}
