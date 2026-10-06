import { Platform, StyleSheet, Text, type TextProps } from 'react-native';
import { Fonts, type ThemeColor, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
export type ThemedTextProps = TextProps & { type?: 'default' | 'title' | 'small' | 'smallBold' | 'subtitle' | 'link' | 'linkPrimary' | 'code' | 'item' | 'label'; themeColor?: ThemeColor };
export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  return <Text style={[{ color: theme[themeColor ?? 'text'], fontFamily: Fonts.sans }, styles[type], style]} {...rest} />;
}
const styles = StyleSheet.create({
  default: Typography.body, title: Typography.page, subtitle: Typography.section, item: Typography.item, label: Typography.label,
  small: Typography.metadata, smallBold: Typography.label, link: { ...Typography.label, textDecorationLine: 'underline' }, linkPrimary: { ...Typography.label, textDecorationLine: 'underline' },
  code: { fontFamily: Fonts.mono, fontSize: 14, lineHeight: 20, fontWeight: Platform.OS === 'android' ? '600' : '400' },
});
