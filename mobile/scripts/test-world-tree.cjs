const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { hooks, load } = require('./test-harness.cjs');
const { compileTree } = require('./build-world-tree-art.cjs');
const source = require('../src/constants/design-tokens.json');
const compiled = require('../assets/skill-tree/world-tree-art.json');
const tokens = load('src/constants/tokens.ts', { './design-tokens.json': source });
const model = load('src/prototypes/skill-tree/forest-model.ts', { '@/constants/tokens': tokens });
const nodes = value => !value || typeof value !== 'object' ? [] : Array.isArray(value) ? value.flatMap(nodes) : [value, ...nodes(value.props?.children)];
const flatten = styles => Object.assign({}, ...[styles].flat(Infinity).filter(Boolean));
const overlaps = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
const compiledAgain = compileTree(fs.readFileSync(path.join(__dirname, '../assets/skill-tree', compiled.source)));
assert.deepEqual(compiledAgain, compiled, 'runtime paths match the approved source and current tokens');
assert.equal(compiled.width * tokens.ArtPixelDp, model.TREE_SIZE.width);
assert.equal(compiled.height * tokens.ArtPixelDp, model.TREE_SIZE.height);
assert.deepEqual([...new Set(compiled.paths.map(part => part.layer))], ['wood', 'academics', 'social', 'habits', 'health']);
const occupied = new Set();
for (const part of compiled.paths) {
  assert.ok(part.color in source.light);
  const rectangles = [...part.d.matchAll(/M(\d+) (\d+)h(\d+)v1h-(\d+)Z/g)];
  assert.equal(rectangles.map(match => match[0]).join(''), part.d, 'only whole-cell rectangles; no fractional/curved edges');
  for (const [, sx, sy, sw, reverse] of rectangles) {
    const x = Number(sx), y = Number(sy), width = Number(sw);
    assert.equal(width, Number(reverse));
    assert.ok(width > 0 && x >= 0 && y >= 0 && x + width <= compiled.width && y < compiled.height);
    for (let column = x; column < x + width; column++) {
      const key = column + ',' + y;
      assert.ok(!occupied.has(key), 'art cells do not overlap across layers');
      occupied.add(key);
    }
  }
}
assert.equal(occupied.size, compiled.opaqueCells);
assert.ok(occupied.size > 3000 && occupied.size < compiled.width * compiled.height * 0.8, 'tree contains wood/foliage and open transparent space');

for (const width of [320, 360, 360.5, 393, 412, 600]) {
  const targets = model.overviewCanopyTargets(width);
  assert.equal(targets.length, 4);
  assert.ok(tokens.isOnPixelGrid(model.overviewOrigin(width)));
  assert.ok(model.overviewOrigin(width) + model.TREE_SIZE.width <= width);
  for (const target of targets) {
    assert.ok(target.width >= 48 && target.height >= 48);
    assert.ok([target.x, target.y, target.width, target.height].every(tokens.isOnPixelGrid));
    assert.ok(target.x >= 0 && target.x + target.width <= width);
    assert.ok(target.y >= 0 && target.y + target.height <= model.TREE_SIZE.height);
    for (const other of targets) if (other.id !== target.id) assert.ok(!overlaps(target, other), width + 'dp: overlapping canopies');
  }

}
const skillIds = model.DOMAINS.flatMap(domain => domain.nodes.map(node => node.id));
assert.equal(new Set(skillIds).size, skillIds.length);
for (const domain of model.DOMAINS) {
  assert.equal(domain.summary, undefined, 'missing progress stays absent');
  assert.ok(Object.values(domain.labelCenter).every(tokens.isOnPixelGrid));
  let area = 0, sumX = 0, sumY = 0;
  for (const part of compiled.paths.filter(part => part.layer === domain.id)) {
    for (const match of part.d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+Z/g)) {
      const x = Number(match[1]), y = Number(match[2]), width = Number(match[3]);
      area += width; sumX += width * (x + width / 2); sumY += width * (y + 0.5);
    }
  }
  assert.ok(Math.abs(domain.labelCenter.x / tokens.ArtPixelDp - sumX / area) <= 0.5, domain.id + ' label centered on leaf pixels horizontally');
  assert.ok(Math.abs(domain.labelCenter.y / tokens.ArtPixelDp - sumY / area) <= 0.5, domain.id + ' label centered on leaf pixels vertically');
  for (const node of domain.nodes) assert.ok(Object.values(node.position).every(tokens.isOnPixelGrid));
}


for (const height of [480, 600, 672, 800]) {
  const layout = model.treeSceneLayout(360, height);
  assert.equal(layout.top + model.TREE_SIZE.height, layout.rootLine + 24, 'root ends overlap the permanent ground');
  assert.ok(Math.abs(layout.rootLine / height - 0.75) < 0.004);
  assert.ok([layout.left, layout.top, layout.rootLine].every(tokens.isOnPixelGrid));
  const shifted = model.overviewCanopyTargets(360, layout.top);
  assert.equal(shifted[0].y - layout.top, model.DOMAINS[0].canopy.y);
}
assert.equal(model.soilSheetSnaps, undefined, 'canceled sheet state removed');
assert.equal(model.settleSoilSheet, undefined);
const native = { StyleSheet: { create: s => s }, View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView' };
const svg = { __esModule: true, default: 'Svg', G: 'G', Path: 'Path', Defs: 'Defs', LinearGradient: 'LinearGradient', Stop: 'Stop', Rect: 'Rect', Text: 'SvgText' };
const art = load('src/prototypes/skill-tree/world-tree-art.tsx', {
  react: hooks().react, 'react-native-svg': svg, '@/constants/tokens': tokens, './forest-model': model,
  '../../../assets/skill-tree/world-tree-art.json': compiled,
});
const tree = art.WorldTreeArt();
assert.equal(tree.props.width, model.TREE_SIZE.width);
assert.equal(tree.props.height, model.TREE_SIZE.height);
assert.equal(nodes(tree).find(node => node.type === 'G').props.scale, 3);
const colors = source.pixel.worldTree;
const scenery = load('src/prototypes/skill-tree/world-tree-scenery.tsx', {
  react: hooks().react, 'react-native-svg': svg, '@/constants/tokens': tokens,
});
for (const width of [320, 360, 360.5, 393, 412, 600]) {
  const geometry = scenery.grassGeometry(width);
  assert.ok(geometry.width >= width && geometry.width < width + 3, 'grass covers the entire viewport, including fractional right edges');
  assert.ok(geometry.surface.startsWith('M0 '));
  assert.ok(geometry.surface.includes('L' + geometry.width + ' '), 'grass surface reaches the right edge');
  for (const d of [geometry.surface, geometry.shade, geometry.blades]) {
    assert.ok(d.match(/-?\d+/g).map(Number).every(value => tokens.isOnPixelGrid(Math.abs(value))), 'grass geometry stays on the 3dp grid');
  }
  const grass = scenery.WorldTreeGrass({ width });
  assert.equal(grass.props.width, geometry.width);
  assert.equal(grass.props.pointerEvents, 'none');
  assert.deepEqual(nodes(grass).filter(node => node.type === 'Path').map(node => node.props.fill), [colors.grassShade, colors.grassBase, colors.grassHighlight]);
  for (const height of [480, 672, 800]) {
    const positions = scenery.sceneryLayout(width, height);
    for (const position of [positions.sun, ...positions.clouds]) assert.ok([position.x, position.y].every(tokens.isOnPixelGrid));
    assert.ok(positions.sun.x >= 0 && positions.sun.x + 72 <= width);
    for (const decoration of [scenery.WorldTreeSun({ width, height }), scenery.WorldTreeClouds({ width, height })]) {
      assert.equal(decoration.props.pointerEvents, 'none');
      assert.equal(decoration.props.accessible, false);
      assert.equal(decoration.props['aria-hidden'], true);
      for (const group of nodes(decoration).filter(node => node.type === 'G' && node.props.scale !== undefined)) assert.equal(group.props.scale, 3);
      for (const part of nodes(decoration).filter(node => node.props.fill)) assert.ok(Object.values(colors).includes(part.props.fill));
    }
  }
}
for (const part of nodes(tree).filter(node => node.type === 'Path')) assert.ok(Object.values(colors).includes(part.props.fill));
for (const group of nodes(tree).filter(node => node.type === 'G')) assert.equal(group.props.opacity, undefined);
assert.equal(art.treePartColor('wood', 'background'), colors.barkLight);
assert.equal(art.treePartColor('wood', 'surfaceMuted'), colors.barkMid);
assert.equal(art.treePartColor('academics', 'success'), colors.leafBase);
assert.equal(art.treePartColor('health', 'successSurface'), colors.leafHighlight);
for (const active of model.DOMAINS) {
  for (const domain of model.DOMAINS) {
    assert.equal(art.treePartColor(domain.id, 'success', active.id), domain.id === active.id ? colors.leafActiveBase : colors.leafDimBase);
    assert.equal(art.treePartColor(domain.id, 'successSurface', active.id), domain.id === active.id ? colors.leafActiveHighlight : colors.leafDimHighlight);
    assert.equal(art.treePartColor(domain.id, 'accent', active.id), domain.id === active.id ? colors.leafActiveAccent : colors.leafDimAccent);
  }
  assert.equal(art.treePartColor('wood', 'background', active.id), colors.barkLight, 'hover/selection never recolors wood');
}
for (const role of ['barkLight', 'barkMid', 'barkShade', 'barkDeep', 'barkOutline']) {
  const [r, g, b] = colors[role].slice(1).match(/../g).map(hex => parseInt(hex, 16));
  assert.ok(r > g && g > b, role + ' remains a brown ramp');
}
const sky = art.WorldTreeSky({ width: 360, height: 672 });
const stops = nodes(sky).filter(node => node.type === 'Stop');
assert.deepEqual(stops.map(stop => stop.props.stopColor), [colors.skyTop, colors.skyMiddle, colors.skyBottom]);
const cap = art.WorldTreeGround({ width: 360.5 });
assert.ok(cap.props.width >= 360.5 && cap.props.width < 363.5);
assert.equal(cap.props.height, 36);
assert.equal(nodes(cap).filter(node => node.type === 'Path')[1].props.fill, source.light.foreground);
for (const part of nodes(cap).filter(node => node.type === 'Path')) assert.ok(part.props.d.match(/-?\d+/g).map(Number).every(value => tokens.isOnPixelGrid(Math.abs(value))));

for (const fontScale of [0.85, 1, 1.3, 2]) {
  const label = art.WorldTreeName({ name: 'Academics', width: 138, fontScale, active: false });
  const glyphs = nodes(label).filter(node => node.type === 'SvgText');
  assert.equal(glyphs.length, 2);
  for (const key of ['x', 'y', 'fontFamily', 'fontSize', 'textAnchor']) assert.equal(glyphs[0].props[key], glyphs[1].props[key], 'stroke/fill share ' + key);
  assert.deepEqual(glyphs[0].props.children, glyphs[1].props.children);
  assert.equal(glyphs[0].props.strokeWidth, tokens.PixelBorders.default);
  assert.equal(glyphs[0].props.strokeLinejoin, 'miter');
  assert.ok(glyphs[1].props.fontSize >= tokens.TypographySpec.minimumFontSize);
  assert.equal(glyphs[1].props.fontFamily, tokens.TypographyRoles.label.fontFamily);
}

(async () => {
  for (const { fontScale, reduced } of [{ fontScale: 1, reduced: false }, { fontScale: 1, reduced: true }, { fontScale: 1.5, reduced: false }, { fontScale: 2, reduced: true }]) {
    const h = hooks();
    const scrollCalls = [];
    const Screen = load('src/prototypes/skill-tree/forest-prototype.tsx', {
      react: h.react, 'react-native': { ...native, useWindowDimensions: () => ({ width: 360, fontScale }) },
      'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ bottom: 24 }) },
      '@/components/mobile-ui': { useReducedMotion: () => reduced },
      '@/components/pixel/pixel-button-svg': { PixelButtonSvg: 'Button' },
      '@/constants/tokens': tokens, './forest-model': model,
      './world-tree-art': { TREE_PALETTE: source.light, WorldTreeArt: 'TreeArt', WorldTreeSky: 'SkyArt', WorldTreeGround: 'GroundArt', WorldTreeName: 'NameArt' },
      './world-tree-scenery': { WorldTreeSun: 'SunArt', WorldTreeClouds: 'CloudArt', WorldTreeGrass: 'GrassArt' },
    }).default;
    h.mount(Screen);
    const scene = () => nodes(h.value).find(node => node.props?.testID === 'world-tree-overview');
    const scroller = nodes(h.value).find(node => node.props?.testID === 'world-tree-scroll');
    assert.equal(scroller.props.removeClippedSubviews, false, 'tree stays attached throughout the scroll');
    scroller.props.ref.current = { scrollTo: options => scrollCalls.push(options) };
    scroller.props.onLayout({ nativeEvent: { layout: { width: 360, height: 672 } } });
    await Promise.resolve();
    const findId = id => nodes(h.value).find(node => node.props?.testID === id);
    const artNode = () => findId('tree-art-canvas');
    const before = flatten(artNode().props.style);
    assert.equal(before.top, model.treeSceneLayout(360, 672).top);
    const soil = findId('world-tree-root-soil'), fill = findId('world-tree-soil-fill');
    assert.equal(flatten(soil.props.style).top, model.treeSceneLayout(360, 672).rootLine - 72, 'soil surrounds the full root fan');
    assert.equal(flatten(fill.props.style).top, flatten(soil.props.style).top + 36);
    assert.equal(flatten(fill.props.style).bottom, 0);
    assert.equal(flatten(fill.props.style).backgroundColor, source.light.foreground);
    const drawn = nodes(h.value);
    const sunLayer = findId('world-tree-sun-layer'), cloudLayer = findId('world-tree-cloud-layer'), grassLayer = findId('world-tree-grass-layer');
    assert.ok(drawn.indexOf(sunLayer) < drawn.indexOf(cloudLayer) && drawn.indexOf(cloudLayer) < drawn.indexOf(soil));
    assert.ok(drawn.indexOf(soil) < drawn.indexOf(grassLayer) && drawn.indexOf(grassLayer) < drawn.indexOf(artNode()), 'grass sits on soil behind the roots');
    for (const layer of [sunLayer, cloudLayer, grassLayer]) assert.equal(layer.props.pointerEvents, 'none');
    const grassFrame = flatten(grassLayer.props.style);
    assert.equal(grassFrame.left, 0);
    assert.equal(grassFrame.right, 0);
    assert.equal(grassFrame.top + tokens.PixelSpacing.px3, flatten(soil.props.style).top, 'grass follows the soil surface without a gap');
    for (const type of ['SunArt', 'CloudArt', 'GrassArt']) assert.equal(drawn.filter(node => node.type === type).length, 1);
    assert.equal(drawn.find(node => node.type === 'GrassArt').props.width, 360);
    assert.ok(drawn.indexOf(soil) < drawn.indexOf(artNode()), 'soil is behind the roots, never a covering panel');
    assert.equal(drawn.filter(node => node.type === 'TreeArt').length, 1);
    assert.equal(drawn.filter(node => node.type === 'GroundArt').length, 1);
    assert.equal(drawn.filter(node => node.type === 'SkyArt').length, 1);
    assert.equal(drawn.filter(node => node.type === 'SoilSheet' || node.type === 'GestureDetector').length, 0);
    assert.equal(drawn.filter(node => node.type === 'Button').length, 1, 'only the return-to-tree control is added');
    assert.equal(drawn.filter(node => node.type === 'ScrollView').length, fontScale > 1.3 ? 2 : 1);
    assert.equal(flatten(scene().props.style).height, 672);
    const future = findId('world-tree-soil-content');
    assert.equal(flatten(future.props.style).minHeight, 672, 'reserved soil spans another viewport');
    assert.equal(flatten(future.props.style).backgroundColor, source.light.foreground, 'soil has no color seam');
    const canopies = drawn.filter(node => node.props?.testID?.startsWith('domain-canopy-'));
    assert.equal(canopies.length, 4);
    for (const canopy of canopies) {
      assert.equal(canopy.props.style.backgroundColor, undefined);
      assert.equal(canopy.props.style.borderWidth, undefined);
      assert.ok(canopy.props.style.width >= 48 && canopy.props.style.height >= 48);
    }
    const labels = drawn.filter(node => node.type === 'NameArt');
    assert.equal(labels.length, fontScale > 1.3 ? 0 : 4);
    if (fontScale <= 1.3) for (const canopy of canopies) {
      const target = model.overviewCanopyTargets(360, before.top).find(item => 'domain-canopy-' + item.id === canopy.props.testID);
      const labelLayout = flatten(nodes(canopy).find(node => node.type === 'View').props.style);
      assert.equal(canopy.props.style.left + labelLayout.left + labelLayout.width / 2, target.labelX);
      assert.equal(canopy.props.style.top + labelLayout.top + labelLayout.height / 2, target.labelY);
      assert.equal(labelLayout.justifyContent, 'center');
      assert.equal(labelLayout.alignItems, 'center');
    }
    assert.equal(scene().props.onPress, undefined);
    const active = () => nodes(h.value).find(node => node.type === 'TreeArt').props.active;
    assert.equal(active(), null);
    canopies[0].props.onPress();
    await Promise.resolve();
    assert.equal(findId('domain-canopy-academics').props.accessibilityState.selected, true);
    assert.equal(active(), 'academics');
    assert.deepEqual({ ...scrollCalls[0] }, { x: 0, y: 672, animated: !reduced }, 'click scrolls to soil with system motion preference');
    canopies[1].props.onHoverIn(); await Promise.resolve(); assert.equal(active(), 'habits');
    canopies[1].props.onHoverOut(); await Promise.resolve(); assert.equal(active(), 'academics', 'hover-out restores clicked branch');
    canopies[2].props.onFocus(); await Promise.resolve(); assert.equal(active(), 'social');
    canopies[2].props.onBlur(); await Promise.resolve(); assert.equal(active(), 'academics');
    canopies[3].props.onPressIn(); await Promise.resolve(); assert.equal(active(), 'health');
    canopies[3].props.onPressOut(); await Promise.resolve(); assert.equal(active(), 'academics', 'canceled press restores selection');
    assert.equal(scrollCalls.length, 1, 'hover/focus/canceled touches never start a scroll');
    canopies[3].props.onPress(); await Promise.resolve(); assert.equal(active(), 'health', 'tap persists highlight');
    assert.equal(scrollCalls.length, 2);
    nodes(h.value).find(node => node.type === 'Button' && node.props.label === 'Back to tree').props.onPress();
    assert.deepEqual({ ...scrollCalls.at(-1) }, { x: 0, y: 0, animated: !reduced });
    assert.equal(active(), 'health', 'return preserves the selected canopy');
    assert.deepEqual(flatten(artNode().props.style), before, 'native scrolling preserves scene geometry');
    h.unmount();
  }
  console.log('PASS original tree grid/source intact, brown wood + vibrant green token ramps, unchanged blue sky, lower-quarter root anchoring');
  console.log('PASS permanent full-width soil behind roots with matching bottom fill; no sheet, gesture handlers or theme toolbar');
  console.log('PASS aligned SVG text stroke/fill, VT323/scaling, separate >=48dp canopy regions and large-text legend');
  console.log('PASS captions centered on leaf-pixel centroids; hover/focus/press/click brighten active canopy and darken peers with selection restored on exit');
  console.log('PASS domain tap scrolls to reserved soil viewport; no scroll on hover/focus/cancel; return to tree and reduced-motion scrolling');
  console.log('PASS separate decorative sun/cloud/grass layers, integer pixel scale, unobstructed controls and full-width grass across 320–600dp viewports');
})().catch(error => { console.error(error); process.exitCode = 1; });
