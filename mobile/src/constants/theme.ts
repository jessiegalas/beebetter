/** BeeBetter presentation tokens. Business and progression rules live elsewhere. */
import '@/global.css';
import { Platform } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useMemo } from 'react';
export const BeeBetterColors = {
  background: '#F7F8FA', card: '#FFFFFF', honey: '#F6C445', honeyDark: '#86551A', honeyDeep: '#5B351A',
  ink: '#2D241D', muted: '#6B625A', surfaceMuted: '#E7E9EE', surfaceWarm: '#FAF6EC',
  success: '#2E724A', danger: '#B23E32', lavender: '#E9E3FA', peach: '#FCE2D7', mint: '#DFF1E5', honeySoft: '#FFF3CE',
} as const;
export type BeePalette = { [K in keyof typeof BeeBetterColors]: string };
export const BeeBetterDarkColors: BeePalette = {
  background: '#181A1E', card: '#24272C', honey: '#F6C445', honeyDark: '#E9BC63', honeyDeep: '#F5D791',
  ink: '#F4F2EE', muted: '#C0BBB4', surfaceMuted: '#41464E', surfaceWarm: '#302D26',
  success: '#91D3A7', danger: '#F4A69A', lavender: '#373147', peach: '#46342D', mint: '#283E33', honeySoft: '#39321F',
};
export const Colors = {
  light: { text: BeeBetterColors.ink, background: BeeBetterColors.background, backgroundElement: BeeBetterColors.card, backgroundSelected: BeeBetterColors.honeySoft, textSecondary: BeeBetterColors.muted },
  dark: { text: BeeBetterDarkColors.ink, background: BeeBetterDarkColors.background, backgroundElement: BeeBetterDarkColors.card, backgroundSelected: BeeBetterDarkColors.honeySoft, textSecondary: BeeBetterDarkColors.muted },
};
export type ThemeColor = keyof typeof Colors.light;
export const Fonts = Platform.select({ ios: { sans: 'Avenir Next', serif: 'ui-serif', rounded: 'Avenir Next', mono: 'ui-monospace' }, default: { sans: 'sans-serif', serif: 'serif', rounded: 'sans-serif', mono: 'monospace' }, web: { sans: 'var(--font-display)', serif: 'var(--font-serif)', rounded: 'var(--font-display)', mono: 'var(--font-mono)' } })!;
export const Spacing = { half: 2, one: 4, two: 8, three: 16, four: 24, five: 32, six: 64, xs: 4, sm: 8, md: 12, lg: 16, gutter: 20, xl: 24, section: 32, page: 48 } as const;
export const Radii = { sm: 10, md: 14, lg: 24, xl: 28, pill: 999 } as const;
export const Typography = { page: { fontSize: 28, lineHeight: 34, fontWeight: '700' }, section: { fontSize: 20, lineHeight: 28, fontWeight: '700' }, item: { fontSize: 17, lineHeight: 24, fontWeight: '600' }, body: { fontSize: 16, lineHeight: 24, fontWeight: '400' }, label: { fontSize: 14, lineHeight: 20, fontWeight: '600' }, metadata: { fontSize: 14, lineHeight: 20, fontWeight: '400' } } as const;
export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 720;
// Ordinary surfaces remain flat; this token is only for overlays and navigation.
export const BeeBetterShadow = { shadowColor: '#000000', shadowOpacity: 0.07, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 } as const;
export function useBeePalette(): BeePalette { return useColorScheme() === 'dark' ? BeeBetterDarkColors : BeeBetterColors; }
export function useBeeStyles<T>(factory: (palette: BeePalette) => T): T { const palette = useBeePalette(); return useMemo(() => factory(palette), [factory, palette]); }
