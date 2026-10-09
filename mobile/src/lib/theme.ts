import { DarkTheme, DefaultTheme } from 'expo-router';
import { BeeBetterColors as light, BeeBetterDarkColors as dark, type BeePalette } from '@/constants/theme';

function semanticColors(palette: BeePalette) {
  return {
    background: palette.background, foreground: palette.ink,
    card: palette.card, cardForeground: palette.ink,
    popover: palette.card, popoverForeground: palette.ink,
    primary: palette.honey, primaryForeground: light.ink,
    secondary: palette.surfaceMuted, secondaryForeground: palette.ink,
    muted: palette.surfaceMuted, mutedForeground: palette.muted,
    accent: palette.honeySoft, accentForeground: palette.ink,
    destructive: palette.danger, destructiveForeground: palette.background,
    border: palette.surfaceMuted, input: palette.surfaceMuted, ring: palette.honeyDark,
    radius: '10px',
  };
}

export const THEME = { light: semanticColors(light), dark: semanticColors(dark) };
export const NAV_THEME = {
  light: { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: light.background, card: light.card, text: light.ink, primary: light.honeyDark, border: light.surfaceMuted, notification: light.danger } },
  dark: { ...DarkTheme, colors: { ...DarkTheme.colors, background: dark.background, card: dark.card, text: dark.ink, primary: dark.honeyDark, border: dark.surfaceMuted, notification: dark.danger } },
};
