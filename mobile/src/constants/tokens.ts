/**
 * Framework-independent entry point for the mobile UI library.
 * Numeric/color values live in design-tokens.json, also consumed by Tailwind
 * and theme:sync. This module groups that source; it does not select a theme,
 * load fonts, import native APIs, or apply styles to any screen.
 *
 * Spec: docs/ui-spec.md (includes provisional decisions and legacy conflicts).
 * Atlas artwork/ramp values are recorded without rebuilding or recoloring PNGs.
 */
import source from './design-tokens.json';

export const Palettes = { light: source.light, dark: source.dark } as const;
// Legacy dp scales stay intact for existing consumers; new pixel geometry uses
// the art-pixel grid. Do not round these legacy values into a new named scale.
export const Spacing = source.spacing;
export const Borders = source.borders;
export const Pixel = source.pixel;
export const PixelSpacing = source.pixel.spacing;
export const PixelBorders = source.pixel.borders;
export const PixelGrid = source.pixel.grid;
export const SliceInsetsArtPx = PixelGrid.sliceInsetsArtPx;
export const ArtPixelDp = PixelGrid.dpPerArtPixel;
// Existing atlas inventory only; approved regeneration targets live in the spec.
// Primary colors are confirmed, but asset regeneration is not yet authorized.
export const DerivedRamps = source.pixel.derivedRamps;
export const FontFamilies = source.fonts;
// Existing general type metrics are retained for compatibility. They are not
// an approved pixel display scale and are not automatically applied to VT323.
export const TypographyScale = source.typography;
// Provisional VT323 roles deliberately omit weights (the font is single-weight).
export const TypographyRoles = source.typographyRoles;
export const TypographySpec = source.typographySpec;

export function isOnPixelGrid(dp: number): boolean {
  return Number.isFinite(dp) && dp >= 0 && Number.isSafeInteger(dp / ArtPixelDp);
}

/** Convert whole art pixels to dp once, including 9-slice inset values. */
export function artPixelsToDp(artPixels: number): number {
  const dp = artPixels * ArtPixelDp;
  if (!Number.isSafeInteger(artPixels) || artPixels < 0 || !Number.isSafeInteger(dp)) {
    throw new RangeError('Pixel geometry requires a non-negative whole art-pixel count.');
  }
  return dp;
}
// The documented minimum is 48 in both dimensions. Reuse its existing source
// value, which already supplies both Tailwind min-h-control and min-w-control.
export const TouchTarget = {
  minWidth: source.controls.minHeight,
  minHeight: source.controls.minHeight,
} as const;

export const DesignTokens = {
  colors: Palettes,
  spacing: Spacing,
  borders: Borders,
  pixel: Pixel,
  derivedRamps: DerivedRamps,
  typography: {
    families: FontFamilies,
    roles: TypographyRoles,
    scale: TypographyScale,
    status: TypographySpec.status,
    minimumFontSize: TypographySpec.minimumFontSize,
  },
  touchTarget: TouchTarget,
} as const;

export type DesignScheme = keyof typeof Palettes;
export type ColorToken = keyof typeof source.light;
export type SpacingToken = keyof typeof Spacing;
export type PixelSpacingToken = keyof typeof PixelSpacing;
export type TypographyRole = keyof typeof TypographyRoles;

// App theme adapters retain access to existing layout/radius/state tokens.
export default source;
