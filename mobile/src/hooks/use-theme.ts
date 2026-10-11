import { Colors, useAppColorScheme } from '@/constants/theme';

export function useTheme() {
  return Colors[useAppColorScheme()];
}
