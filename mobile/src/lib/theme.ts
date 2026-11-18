import { DarkTheme, DefaultTheme } from 'expo-router';
import { AppFont, BeeBetterColors as light, BeeBetterDarkColors as dark, Radii, type BeePalette } from '@/constants/theme';
import tokens from '@/constants/design-tokens.json';

type CamelCase<S extends string> = S extends `${infer Head}-${infer Tail}` ? `${Head}${Capitalize<CamelCase<Tail>>}` : S;
type SemanticTheme = { [K in keyof typeof tokens.roles as CamelCase<K>]: string };
function semanticColors(palette: BeePalette): SemanticTheme {
  return Object.fromEntries(Object.entries(tokens.roles).map(([role, key]) => [role.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()), palette[key as keyof BeePalette]])) as SemanticTheme;
}
export const THEME = { light: { ...semanticColors(light), radius: Radii.md + 'px' }, dark: { ...semanticColors(dark), radius: Radii.md + 'px' } };
const navFace = { fontFamily: AppFont, fontWeight: 'normal' } as const;
const fonts = { regular: navFace, medium: navFace, bold: navFace, heavy: navFace };
export const NAV_THEME = {
  light: { ...DefaultTheme, fonts, colors: { ...DefaultTheme.colors, background: light.background, card: light.card, text: light.foreground, primary: light.primary, border: light.border, notification: light.danger } },
  dark: { ...DarkTheme, fonts, colors: { ...DarkTheme.colors, background: dark.background, card: dark.card, text: dark.foreground, primary: dark.primary, border: dark.border, notification: dark.danger } },
};
