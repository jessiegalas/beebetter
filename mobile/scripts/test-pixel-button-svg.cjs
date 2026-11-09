const assert = require('node:assert/strict');
const { hooks, load } = require('./test-harness.cjs');
const tokens = require('../src/constants/design-tokens.json');
const nodes = value => !value || typeof value !== 'object' ? [] : Array.isArray(value) ? value.flatMap(nodes) : [value, ...nodes(value.props?.children)];
const find = (tree, type) => nodes(tree).find(node => node.type === type);
const flush = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };
const native = { StyleSheet: { create: value => value }, View: 'View', Text: 'Text', Pressable: 'Pressable' };
const svg = { __esModule: true, default: 'Svg', Path: 'Path', Rect: 'Rect' };

(async () => {
  let buttonRenders = 0, frameRenders = 0;
  for (const scheme of ['light', 'dark']) {
    const h = hooks();
    const theme = { ...tokens, PixelSpacing: tokens.pixel.spacing, TypographyRoles: tokens.typographyRoles, useAppColorScheme: () => scheme, Controls: tokens.controls, Spacing: tokens.spacing, Typography: tokens.typography, Fonts: tokens.fonts.default, useBeePalette: () => tokens[scheme] };
    const react = { ...h.react, memo: fn => fn };
    const { PixelButtonSvg } = load('src/components/pixel/pixel-button-svg.tsx', {
      react, 'react-native': native, 'react-native-svg': svg, '@/constants/theme': theme, '@/constants/design-tokens.json': tokens,
      '@/components/mobile-ui': { useReducedMotion: () => true }, './pixel-frame': { PixelFrame: 'Frame' },
    });
    let props = { label: 'A long label that must wrap instead of truncating', onPress() {}, intent: 'primary' };
    h.mount(() => { buttonRenders++; return PixelButtonSvg(props); });
    const text = find(h.value, 'Text');
    assert.equal(text.props.allowFontScaling, true);
    assert.equal(text.props.numberOfLines, undefined);
    assert.equal(h.value.props.style[0].minHeight, 48);
    assert.equal(h.value.props.style[0].height, undefined);
    for (const intent of ['primary', 'secondary', 'quiet', 'destructive', 'accent', 'accent-quiet']) {
      props = { ...props, intent }; h.render();
      const ramps = tokens.pixel.button.ramps[scheme][intent];
      assert.deepEqual(find(h.value, 'Frame').props.ramp, ramps.normal);
      h.value.props.onPressIn(); await flush();
      assert.equal(find(h.value, 'Frame').props.pressed, true);
      assert.deepEqual(find(h.value, 'Frame').props.ramp, ramps.pressed);
      assert.equal(ramps.pressed.highlight, ramps.normal.base);
      assert.equal(ramps.pressed.shadow, ramps.normal.shadow);
      assert.equal(ramps.pressed.outline, ramps.normal.outline);
      h.value.props.onPressOut(); await flush();
      assert.equal(find(h.value, 'Frame').props.pressed, false);
    }
    props = { ...props, intent: 'primary' }; h.render();
    const before = buttonRenders;
    h.value.props.onPressIn(); await flush();
    h.value.props.onPressOut(); await flush();
    assert.equal(buttonRenders - before, 2);
    h.value.props.onFocus(); await flush();
    assert.equal(find(h.value, 'Frame').props.focused, true);
    props = { ...props, loading: true }; h.render();
    assert.equal(h.value.props.disabled, true);
    assert.equal(h.value.props.accessibilityState.busy, true);
    assert.equal(find(h.value, 'Frame').props.focused, false);
    assert.equal(find(h.value, 'Text').props.children.join(''), props.label);
    assert.equal(find(h.value, 'Text').props.style.at(-1).opacity, 0);
    props = { ...props, disabled: true }; h.render();
    assert.deepEqual(find(h.value, 'Frame').props.ramp, tokens.pixel.button.ramps[scheme].primary.disabled);
    assert.equal(find(h.value, 'Frame').props.pressed, false);
    h.unmount();

    const f = hooks();
    const { PixelFrame } = load('src/components/pixel/pixel-frame.tsx', {
      react: { ...f.react, memo: fn => fn }, 'react-native': native, 'react-native-svg': svg, '@/constants/theme': theme,
    });
    let frameProps = {};
    f.mount(() => { frameRenders++; return PixelFrame(frameProps); });
    assert.equal(find(f.value, 'Svg'), undefined);
    const layout = (width, height) => f.value.props.onLayout({ nativeEvent: { layout: { width, height } } });
    layout(180.25, 72.5); await flush();
    assert.equal(find(f.value, 'Svg').props.width, 181);
    assert.equal(find(f.value, 'Svg').props.height, 73);
    assert.equal(find(f.value, 'Svg').props.shapeRendering, 'crispEdges');
    const beforeLayout = frameRenders;
    layout(180.3, 72.5); await flush();
    assert.equal(frameRenders, beforeLayout);
    layout(180.3, 120.2); await flush();
    assert.equal(find(f.value, 'Svg').props.height, 121);
    frameProps = { focused: true, pressed: true }; f.render();
    assert.equal(nodes(f.value).filter(node => node.type === 'Path').length, 4);
    for (const node of nodes(f.value).filter(node => node.type === 'Path')) {
      assert.ok(Object.values(tokens[scheme]).includes(node.props.fill));
      assert.equal(node.props.d.includes('.'), false);
    }
    frameProps = { ramp: tokens.pixel.button.ramps[scheme].quiet.normal }; f.render();
    const quietPaths = nodes(f.value).filter(node => node.type === 'Path');
    assert.equal(quietPaths.length, 2, 'outlined quiet has a border and transparent face, without raised depth');
    assert.equal(quietPaths[1].props.fill, 'none');
    const borderPath = quietPaths[0].props.d;
    frameProps = { ...frameProps, pressed: true }; f.render();
    assert.equal(nodes(f.value).find(node => node.type === 'Path').props.d, borderPath, 'pressing quiet keeps the uniform outer border stable');
    f.unmount();
  }
  console.log('PASS SVG button intents, press/focus/disabled/loading, scalable wrapping layout, token fills and integer paths in both themes');
  console.log('PASS deterministic hook harness: 2 button renders per press/release; identical rounded layout adds 0 frame renders (not native profiling)');
})().catch(error => { console.error(error); process.exitCode = 1; });
