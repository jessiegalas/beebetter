import { DarkTheme, DefaultTheme } from 'expo-router';
import { BeeBetterColors as light, BeeBetterDarkColors as dark, Radii, type BeePalette } from '@/constants/theme';
import tokens from '@/constants/design-tokens.json';

type CamelCase<S extends string> = S extends `${infer Head}-${infer Tail}` ? `${Head}${Capitalize<CamelCase<Tail>>}` : S;
type SemanticTheme = { [K in keyof typeof tokens.roles as CamelCase<K>]: string };
function semanticColors(palette: BeePalette): SemanticTheme {
  return Object.fromEntries(Object.entries(tokens.roles).map(([role, key]) => [role.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()), palette[key as keyof BeePalette]])) as SemanticTheme;
}
export const THEME = { light: { ...semanticColors(light), radius: Radii.md + 'px' }, dark: { ...semanticColors(dark), radius: Radii.md + 'px' } };
export const NAV_THEME = {
  light: { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: light.background, card: light.card, text: light.foreground, primary: light.primary, border: light.border, notification: light.danger } },
  dark: { ...DarkTheme, colors: { ...DarkTheme.colors, background: dark.background, card: dark.card, text: dark.foreground, primary: dark.primary, border: dark.border, notification: dark.danger } },
};
