const assert = require('node:assert/strict');
const tokens = require('../src/constants/design-tokens.json');
function luminance(hex) {
  const [r, g, b] = hex.slice(1).match(/../g).map(value => {
    const n = parseInt(value, 16) / 255;
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
for (const scheme of ['light', 'dark']) {
  const p = tokens[scheme];
  assert.deepEqual(Object.keys(p).sort(), Object.keys(tokens.light).sort(), 'themes expose the same roles');
  const pairs = [
    ...['background', 'card', 'surface', 'surfaceMuted'].flatMap(bg => [['foreground', bg], ['muted', bg]]),
    ['primaryForeground', 'primary'], ['primaryForeground', 'primaryPressed'], ['accentForeground', 'accent'],
    ['disabledForeground', 'disabled'], ['success', 'successSurface'], ['warning', 'warningSurface'], ['danger', 'dangerSurface'],
    ['dangerForeground', 'danger'], ['dangerForeground', 'dangerPressed'], ['danger', 'background'], ['danger', 'card'], ['danger', 'surface'],
  ];
  for (const [fg, bg] of pairs) {
    const ratio = contrast(p[fg], p[bg]);
    assert.ok(ratio >= 4.5, scheme + ' ' + fg + '/' + bg + ': ' + ratio.toFixed(2) + ' < 4.5');
  }
  for (const [fg, bg] of [['focus', 'background'], ['focus', 'card'], ['focus', 'surface'], ['input', 'card']]) {
    assert.ok(contrast(p[fg], p[bg]) >= 3, scheme + ' control contrast: ' + fg + '/' + bg);
  }
  for (const key of Object.values(tokens.roles)) assert.ok(p[key], 'unresolved semantic role: ' + key);
  console.log(scheme + ': text, pressed, disabled, status and control contrast passed');
}
assert.ok(contrast(tokens.light.accentForeground, tokens.light.accent) >= 4.5);
console.log('Cream/primary: ' + contrast(tokens.light.primaryForeground, tokens.light.primary).toFixed(2) + ':1; brown/amber: ' + contrast(tokens.light.accentForeground, tokens.light.accent).toFixed(2) + ':1');

// Verify actual class-merging behavior, not just the configured token names.
const { load } = require('./test-harness.cjs');
const { cn } = load('src/lib/utils.ts', {
  clsx: require('clsx'), 'tailwind-merge': require('tailwind-merge'), '@/constants/design-tokens.json': tokens,
});
const merged = cn('text-foreground text-body border-focus border-transparent gap-lg px-lg', 'text-label text-primary-foreground px-sm');
for (const utility of ['text-label', 'text-primary-foreground', 'border-focus', 'border-transparent', 'gap-lg', 'px-sm']) assert.ok(merged.split(' ').includes(utility), 'lost utility: ' + utility);
for (const utility of ['text-body', 'text-foreground', 'px-lg']) assert.ok(!merged.split(' ').includes(utility), 'conflicting utility retained: ' + utility);
assert.equal(cn('bg-primary active:bg-primary-pressed', 'bg-disabled active:bg-disabled'), 'bg-disabled active:bg-disabled');
console.log('Named NativeWind typography, border widths, spacing and disabled overrides merge correctly.');

// Verify that text, views, navigation and NativeWind use the selected appearance.
const { hooks } = require('./test-harness.cjs');
for (const deviceScheme of ['light', 'dark']) {
  const h = hooks();
  const native = {
    Platform: { OS: 'android', select: values => values.default },
    StyleSheet: { create: value => value }, Text: 'Text', View: 'View',
    useColorScheme: () => deviceScheme,
  };
  const theme = load('src/constants/theme.ts', {
    '@/global.css': {}, react: h.react, 'react-native': native,
    nativewind: { useColorScheme: () => ({ colorScheme: deviceScheme }) }, './design-tokens.json': tokens,
  });
  assert.equal(theme.APP_COLOR_SCHEME, 'light');
  const appearance = load('src/hooks/use-theme.ts', {
    '@/constants/theme': theme, '@/hooks/use-color-scheme': { useColorScheme: () => deviceScheme },
  });
  const mocks = { react: h.react, 'react-native': native, '@/constants/theme': theme, '@/hooks/use-theme': appearance };
  const text = load('src/components/themed-text.tsx', mocks);
  const view = load('src/components/themed-view.tsx', mocks);
  const style = element => Object.assign({}, ...element.props.style.filter(Boolean));
  for (const surface of ['background', 'backgroundElement', 'backgroundSelected']) {
    const background = style(view.ThemedView({ type: surface })).backgroundColor;
    for (const role of ['text', 'textSecondary']) {
      const foreground = style(text.ThemedText({ themeColor: role })).color;
      assert.ok(contrast(foreground, background) >= 4.5, deviceScheme + ' device: ' + role + '/' + surface);
    }
  }
  assert.equal(style(text.ThemedText({})).color, theme.useBeePalette().foreground);
  assert.equal(style(view.ThemedView({})).backgroundColor, theme.useBeePalette().background);
  const navigation = load('src/lib/theme.ts', {
    '@/constants/theme': theme, '@/constants/design-tokens.json': tokens,
    'expo-router': { DefaultTheme: { colors: {} }, DarkTheme: { colors: {} } },
  });
  const applied = [];
  const pass = () => null;
  const layout = load('src/app/_layout.tsx', {
    '@/global.css': {}, react: h.react, 'react-native': native,
    nativewind: { colorScheme: { set: value => applied.push(value) } },
    '@/hooks/use-app-appearance': { useAppAppearance: () => ({ scheme: deviceScheme }), useRestoreAppAppearance() {} },
    'expo-status-bar': { StatusBar: 'StatusBar' },
    '@/components/hexagon-background': { HexagonBackground: pass },
    '@/constants/theme': theme, '@/lib/theme': navigation,
    'expo-router': { Stack: 'Stack', ThemeProvider: 'ThemeProvider' },
    'expo-splash-screen': { preventAutoHideAsync: async () => {} },
    '@rn-primitives/portal': { PortalHost: 'PortalHost' },
    '@/constants/features': { MOBILE_WELLNESS_AND_SUPPORT_ENABLED: false },
    '@/components/quest-notification-response': { QuestNotificationResponse: pass },
    '@/components/animated-icon': { AnimatedSplashOverlay: pass },
    '@/context/user-data-context': { UserDataProvider: 'UserDataProvider' },
    '@/context/location-context': { LocationProvider: 'LocationProvider' },
    '@/context/quest-priority-context': { QuestPriorityProvider: 'QuestPriorityProvider' },
  });
  h.mount(() => layout.default());
  let element = h.value;
  while (element.type !== 'ThemeProvider') element = element.props.children[0];
  assert.equal(element.props.value.colors.text, theme.useBeePalette().foreground);
  assert.equal(element.props.value.colors.background, theme.useBeePalette().background);
  assert.equal(theme.useAppColorScheme(), deviceScheme);
  h.unmount();
}
console.log('Light and dark selections stay readable and share text, surfaces and navigation palettes.');

// Compile the actual Android stylesheet: manual appearance must reach native CSS variables too.
process.env.NATIVEWIND_OS = 'android';
const postcss = require('postcss');
const tailwind = require('tailwindcss');
const { cssToReactNativeRuntime } = require('react-native-css-interop/css-to-rn');
postcss([tailwind(require('../tailwind.config.js'))])
  .process(require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/global.css'), 'utf8'), { from: 'src/global.css' })
  .then(result => {
    const compiled = cssToReactNativeRuntime(result.css);
    assert.equal(compiled.flags.darkMode, 'class dark');
    for (const role of ['foreground', 'card', 'primary', 'primary-foreground']) {
      assert.ok(compiled.rootVariables['--' + role].light, 'missing native light variable: ' + role);
      assert.ok(compiled.rootVariables['--' + role].dark, 'missing native dark variable: ' + role);
    }
    console.log('Android CSS compiles with paired light/dark variables and manual appearance.');
  }).catch(error => { console.error(error); process.exitCode = 1; });
