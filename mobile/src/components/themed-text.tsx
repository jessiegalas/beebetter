import { StyleSheet, Text, type TextProps } from 'react-native';
import { type ThemeColor, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
export type ThemedTextProps = TextProps & { type?: 'default' | 'title' | 'small' | 'smallBold' | 'subtitle' | 'link' | 'linkPrimary' | 'code' | 'item' | 'label'; themeColor?: ThemeColor };
export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  return <Text accessibilityRole={type === 'title' ? 'header' : undefined} style={[styles[type], { color: theme[themeColor ?? 'text'] }, style]} {...rest} />;
}
const styles = StyleSheet.create({
  default: Typography.body, title: Typography.heading, subtitle: Typography.section, item: Typography.item, label: Typography.label,
  small: Typography.metadata, smallBold: Typography.label, link: { ...Typography.label, textDecorationLine: 'underline' }, linkPrimary: { ...Typography.label, textDecorationLine: 'underline' }, code: Typography.metadata,
});
