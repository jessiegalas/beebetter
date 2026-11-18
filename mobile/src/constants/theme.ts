/** BeeBetter presentation tokens. Business and progression rules live elsewhere. */
import '@/global.css';
import { Platform } from 'react-native';
import { useMemo } from 'react';
import { useColorScheme } from 'nativewind';
import tokens from './tokens';

export { AppFont, DesignTokens, Palettes, PixelSpacing, PixelBorders, PixelGrid, SliceInsetsArtPx, ArtPixelDp, DerivedRamps, TypographyRoles, TypographyRoles as Typography, TypographySpec, TouchTarget, artPixelsToDp, isOnPixelGrid } from './tokens';
export type { DesignScheme, ColorToken, SpacingToken, PixelSpacingToken, TypographyRole } from './tokens';

// Compatibility aliases let existing screens adopt the palette incrementally.
// New styles should use the semantic names on the palette.
function paletteWithAliases(palette: typeof tokens.light) {
  return {
    ...palette,
    ink: palette.foreground, honey: palette.accent, honeyDark: palette.primary,
    honeyDeep: palette.foreground, honeySoft: palette.surface, surfaceWarm: palette.surface,
    lavender: palette.surfaceMuted, peach: palette.dangerSurface, mint: palette.successSurface,
  };
}
export const BeeBetterColors = paletteWithAliases(tokens.light);
export type BeePalette = typeof BeeBetterColors;
export const BeeBetterDarkColors: BeePalette = paletteWithAliases(tokens.dark);
export const Colors = {
  light: { text: BeeBetterColors.foreground, background: BeeBetterColors.background, backgroundElement: BeeBetterColors.card, backgroundSelected: BeeBetterColors.surface, textSecondary: BeeBetterColors.muted },
  dark: { text: BeeBetterDarkColors.foreground, background: BeeBetterDarkColors.background, backgroundElement: BeeBetterDarkColors.card, backgroundSelected: BeeBetterDarkColors.surface, textSecondary: BeeBetterDarkColors.muted },
};
// Default appearance until a saved user preference is restored.
export const APP_COLOR_SCHEME: keyof typeof Colors = 'light';
export type ThemeColor = keyof typeof Colors.light;
export const Spacing = tokens.spacing;
export const Pixel = tokens.pixel;
export const Radii = tokens.radii;
export const Borders = tokens.borders;
export const Controls = tokens.controls;
export const Layout = tokens.layout;
export const States = tokens.states;
export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = Layout.maxContentWidth;
export const ContentColumn = {
  width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingHorizontal: Spacing.gutter,
} as const;
export const SectionColumn = { ...ContentColumn, gap: Spacing.section, paddingBottom: Spacing.page } as const;
// Ordinary surfaces remain flat; only overlays and navigation use elevation.
export const BeeBetterShadow = tokens.elevation;
export function useAppColorScheme(): keyof typeof Colors { return useColorScheme().colorScheme ?? APP_COLOR_SCHEME; }
export function useBeePalette(): BeePalette { return { light: BeeBetterColors, dark: BeeBetterDarkColors }[useAppColorScheme()]; }
export function useBeeStyles<T>(factory: (palette: BeePalette) => T): T { const palette = useBeePalette(); return useMemo(() => factory(palette), [factory, palette]); }
