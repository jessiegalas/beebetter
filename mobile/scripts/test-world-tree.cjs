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
const generated = load('src/prototypes/skill-tree/generated-tree-layout.ts');
const { layoutGeneratedTree, treeScene, treeArtwork, GRAPHIC_TARGET_CAP } = generated;
const { generatedTreeFixtures } = load('src/prototypes/skill-tree/generated-tree-fixtures.ts');
function assertQuestSpacing(world) {
  const quests = world.nodes.filter(node => node.kind === 'quest');
  for (const [index, node] of quests.entries()) {
    for (const other of quests.slice(index + 1)) {
      assert.ok(Math.abs(node.x - other.x) >= 10 || Math.abs(node.y - other.y) >= 10,
        `${node.id} and ${other.id} have room for the bud or leaf silhouette`);
    }
  }
}
for (const { data } of generatedTreeFixtures) {
  const world = layoutGeneratedTree(data);
  const reversed = Object.fromEntries(Object.entries(data).map(([key, rows]) => [key, [...rows].reverse()]));
  assert.deepEqual(layoutGeneratedTree(reversed), world);
  assert.equal(world.nodes.length, data.domains.length + data.lines.length + data.quests.length);
  assertQuestSpacing(world);
  for (const node of world.nodes) {
    assert.ok(Number.isInteger(node.x) && Number.isInteger(node.y));
    assert.ok(node.x >= 0 && node.x <= world.width && node.y >= 0 && node.y <= world.height);
    assert.match(node.edge, /^M\d+ \d+(?:H\d+V\d+)+$/);
  }
  const focuses = [{}, ...data.domains.map(({ id }) => ({ domainId: id })),
    ...data.lines.map(({ domainId, id }) => ({ domainId, lineId: id }))];
  for (const focus of focuses) for (const width of [192, 272, 312, 420]) {
    const scene = treeScene(world, data, focus, width, 440);
    assert.ok(scene.targets.length <= GRAPHIC_TARGET_CAP);
    const boxes = scene.targets.map(target => {
      assert.equal(target.x, world.byId.get(target.id).x);
      assert.equal(target.y, world.byId.get(target.id).y);
      assert.ok(target.width >= 48 && target.height >= 48);
      return { x: target.x * scene.camera.scale + scene.camera.x - target.width / 2,
        y: target.y * scene.camera.scale + scene.camera.y + target.topOffset, width: target.width, height: target.height };
    });
    for (const [i, box] of boxes.entries()) {
      assert.ok(box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= 440);
      assert.ok(boxes.slice(i + 1).every(other => !overlaps(box, other)));
    }
    assert.ok(scene.camera.x % 3 === 0 && scene.camera.y % 3 === 0);
    if (focus.domainId && !focus.lineId) {
      const trunkX = world.center * scene.camera.scale + scene.camera.x;
      assert.ok(trunkX > 0 && trunkX < width, 'focused framing retains the trunk');
      for (const line of data.lines.filter(line => line.domainId === focus.domainId)) {
        const node = world.byId.get(line.id);
        assert.ok(node.x * scene.camera.scale + scene.camera.x > 0);
        assert.ok(node.y * scene.camera.scale + scene.camera.y < 440);
      }
    }
    const paint = treeArtwork(world, data, focus);
    const glyphs = Object.entries(paint).filter(([key]) => key.startsWith('glyph-'))
      .reduce((total, [, path]) => total + (path.match(/M/g)?.length ?? 0), 0);
    assert.equal(glyphs, data.quests.length, 'every quest keeps its silhouette at every focus');
    assert.ok(!Object.keys(paint).some(key => key.startsWith('mass-')), 'foliage stays separate from branches');
    if (focus.domainId && data.domains.length > 1) {
      assert.ok(paint['branch:dim'] && paint['branch:highlight'], 'siblings stay drawn while the active path is highlighted');
    }
  }
}
const mixed = generatedTreeFixtures[2].data;
const world = layoutGeneratedTree(mixed);
const midterms = { domainId: 'academics', lineId: 'midterms' };
const before = treeScene(world, mixed, midterms, 312, 440);
const completed = { ...mixed, quests: mixed.quests.map(quest =>
  quest.id === 'review' ? { ...quest, state: 'completed' }
    : quest.id === 'quiz' ? { ...quest, state: 'active' } : quest) };
const after = treeScene(world, completed, midterms, 312, 440);
const root = treeScene(world, mixed, {}, 312, 440);
const domainAnchor = world.byId.get('academics');
const lineAnchor = world.byId.get('midterms');
const centerOn = (anchor, zoom) => {
  const scale = root.rootScale * zoom;
  return { x: 156 - anchor.x * scale, y: 220 - anchor.y * scale, scale };
};
const { clampTreeCamera, semanticTreeFocus, canTapTree, zoomTreeAt } = generated;
const bounded = clampTreeCamera({ x: -99999, y: 99999, scale: 100 }, 312, 440, world.width, world.height, root.rootScale, true);
assert.equal(bounded.scale, root.rootScale * 4.8);
assert.ok(bounded.x >= 312 - world.width * bounded.scale && bounded.y <= 0);
assert.ok(bounded.x % 3 === 0 && bounded.y % 3 === 0);
assert.equal(clampTreeCamera({ x: 900, y: 900, scale: 0 }, 312, 440, world.width, world.height, root.rootScale).scale, root.rootScale);
const anchored = zoomTreeAt(root.camera, root.camera.scale * 2, 100, 130);
assert.equal((100 - root.camera.x) / root.camera.scale, (100 - anchored.x) / anchored.scale);
assert.equal((130 - root.camera.y) / root.camera.scale, (130 - anchored.y) / anchored.scale);
const focusAt = (focus, anchor, zoom) => semanticTreeFocus(world, focus, centerOn(anchor, zoom), root.rootScale, 312, 440);
assert.equal(focusAt({}, domainAnchor, 1.4).domainId, undefined);
assert.equal(focusAt({}, domainAnchor, 1.6).domainId, 'academics');
assert.equal(focusAt({ domainId: 'academics' }, domainAnchor, 1.4).domainId, 'academics');
assert.equal(focusAt({ domainId: 'academics' }, domainAnchor, 1.2).domainId, undefined);
assert.equal(focusAt({ domainId: 'academics' }, lineAnchor, 2.3).lineId, undefined);
assert.equal(focusAt({ domainId: 'academics' }, lineAnchor, 2.4).lineId, 'midterms');
assert.equal(focusAt(midterms, lineAnchor, 2.1).lineId, 'midterms');
assert.equal(focusAt(midterms, lineAnchor, 1.9).lineId, undefined);
assert.equal(canTapTree(0), true);
assert.equal(canTapTree(generated.PAN_THRESHOLD), false, 'an activated drag cannot open a target');
assert.equal(canTapTree(90), false);
const denseData = generatedTreeFixtures[3].data;
const denseWorld = layoutGeneratedTree(denseData);
assert.ok(denseWorld.forks.length < denseWorld.nodes.filter(node => node.kind === 'quest').length / 3,
  'crowded nodes share cluster forks');
const withMoreThesisQuests = (count) => ({
  ...denseData,
  quests: [...denseData.quests, ...Array.from({ length: count }, (_, index) => ({
    id: 'extra-' + String(index).padStart(2, '0'), domainId: 'academics', lineId: 'thesis',
    title: 'Extra practice', state: 'active', createdAt: '2026-11-12T00:00:00Z',
  }))],
});
for (const added of [1, 3]) {
  const grown = layoutGeneratedTree(withMoreThesisQuests(added));
  for (const { id, x, y } of denseWorld.nodes.filter(node => node.kind === 'quest')) {
    const after = grown.byId.get(id);
    assert.deepEqual([after.x, after.y], [x, y], `${id} keeps its slot at ${57 + added} Thesis quests`);
  }
}
for (const added of [13, 24]) {
  const grown = layoutGeneratedTree(withMoreThesisQuests(added));
  assert.equal(grown.forks.filter(item => item.parentId === 'thesis').length, Math.ceil((57 + added) / 16));
  assert.equal(grown.nodes.filter(item => item.parentId === 'thesis').length, 57 + added);
  assertQuestSpacing(grown);
}
assert.deepEqual(layoutGeneratedTree(completed), world, 'completion does not change any world position or edge');
assert.deepEqual(after.targets.map(({ id, x, y, width, height }) => ({ id, x, y, width, height })),
  before.targets.map(({ id, x, y, width, height }) => ({ id, x, y, width, height })));
assert.notDeepEqual(treeArtwork(world, completed, midterms), treeArtwork(world, mixed, midterms));
assert.ok(before.entries.findIndex(target => target.id === 'review') < before.entries.findIndex(target => target.id === 'quiz'));
assert.match(treeScene(world, mixed, { domainId: 'academics', lineId: 'thesis' }, 312, 440)
  .entries.find(target => target.id === 'rehearse').prerequisiteLabel, /Academics \/ Midterm prep/);
assert.match(treeScene(world, mixed, { domainId: 'creative', lineId: 'studio' }, 312, 440)
  .entries[0].prerequisiteLabel, /Academics \/ Thesis/);
console.log('PASS one generated world, stable slots, camera bounds, dimmed context and uncapped art');
{
  const h = hooks();
  let fontScale = 1;
  let reduced = false;
  const timers = [];
  const renderer = 'GeneratedTreeSvg';
  const { default: Preview } = load('src/app/generated-tree-preview.tsx', {
    react: h.react,
    'react-native': { View: 'View', StyleSheet: { create: styles => styles },
      BackHandler: { addEventListener: () => ({ remove() {} }) },
      useWindowDimensions: () => ({ width: 360, height: 780, fontScale }) },
    'expo-router': { Redirect: 'Redirect', useFocusEffect: effect => h.react.useEffect(effect, [effect]) },
    'react-native-gesture-handler': { GestureHandlerRootView: 'GestureHandlerRootView' },
    '@/components/mobile-ui': { Button: 'Button', IconButton: 'IconButton', ScreenFrame: 'ScreenFrame',
      Sheet: 'Sheet', useReducedMotion: () => reduced },
    '@/components/themed-text': { ThemedText: 'Text' },
    '@/constants/tokens': tokens,
    '@/prototypes/skill-tree/generated-tree-layout': generated,
    '@/prototypes/skill-tree/generated-tree-fixtures': { generatedTreeFixtures },
    '@/prototypes/skill-tree/generated-tree-svg': { GeneratedTreeSvg: renderer, targetLabel: item => item.title + ' · ' + item.state },
  }, { __DEV__: true, setTimeout: (run, ms) => { timers.push({ run, ms }); return timers.length; }, clearTimeout() {} });
  h.mount(() => Preview().type());
  const canvas = () => nodes(h.value).find(node => node.type === renderer);
  const button = label => nodes(h.value).find(node => (node.type === 'Button' || node.type === 'IconButton') && node.props.label === label);
  const select = id => { canvas().props.onTarget(canvas().props.scene.entries.find(entry => entry.id === id)); h.render(); };
  const initialWorld = canvas().props.world;
  const rootCamera = canvas().props.scene.camera;
  select('academics');
  const domainCamera = canvas().props.scene.camera;
  assert.notDeepEqual(domainCamera, rootCamera);
  select('midterms');
  assert.equal(canvas().props.world, initialWorld);
  button('Back').props.onPress(); h.render();
  assert.deepEqual(canvas().props.scene.camera, domainCamera);
  select('midterms'); select('review');
  assert.ok(nodes(h.value).some(node => node.type === 'Sheet'));
  button('Simulate completion').props.onPress(); h.render();
  assert.equal(canvas().props.scene.focusedId, 'review');
  assert.equal(canvas().props.grownId, undefined);
  assert.ok(timers[0].ms >= generated.CAMERA_MS);
  timers.shift().run(); h.render();
  assert.equal(canvas().props.grownId, 'review');
  assert.equal(canvas().props.world, initialWorld);
  assert.equal(canvas().props.scene.entries.find(entry => entry.id === 'quiz').state, 'active');
  timers.shift().run(); h.render();
  assert.deepEqual(canvas().props.scene.camera, rootCamera);
  button('Fixtures · Mixed tree').props.onPress(); h.render();
  button('Crowded domain').props.onPress(); h.render();
  select('academics');
  select('thesis');
  assert.ok(canvas().props.scene.targets.length <= GRAPHIC_TARGET_CAP);
  assert.ok(canvas().props.scene.targets.length > 0 && canvas().props.scene.targets.every(target => !target.showTitle));
  assert.ok(canvas().props.scene.entries.length > 50);
  button('More quests').props.onPress(); h.render();
  assert.equal(canvas(), undefined);
  assert.ok(button('Practice exercise 54 · active'));
  button('Show graphic').props.onPress(); reduced = true; h.render();
  assert.equal(canvas().props.reducedMotion, true);
  button('Zoom in').props.onPress(); h.render();
  assert.ok(canvas().props.scene.camera.scale > canvas().props.scene.rootScale);
  button('Reset view').props.onPress(); h.render();
  assert.equal(canvas().props.scene.focusedId, undefined);
  select('academics');
  select('thesis');
  fontScale = 1.5; h.render();
  assert.equal(canvas(), undefined);
  assert.ok(button('Practice exercise 54 · active'));
  h.unmount();
}
console.log('PASS camera drill-down/back, on-tree reveal, overflow and enlarged-text fallback');
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
const soilArt = load('src/prototypes/skill-tree/world-tree-soil.tsx', {
  react: { ...hooks().react, memo: component => component, useMemo: compute => compute() },
  'react-native-svg': svg, '@/constants/tokens': tokens,
});
for (const width of [320, 360, 360.5, 393, 412, 600]) {
  const worldHeight = 903;
  const upper = soilArt.WorldTreeSoilDetails({ width, height: 231, worldHeight });
  const lower = soilArt.WorldTreeSoilDetails({ width, height: 672, worldHeight, offsetY: 231 });
  assert.equal(upper.props.width, Math.ceil(width / 3) * 3);
  assert.equal(lower.props.viewBox, '0 231 ' + upper.props.width + ' 672');
  assert.equal(lower.props.pointerEvents, 'none');
  assert.equal(lower.props.accessible, false);
  assert.equal(lower.props['aria-hidden'], true);
  const upperPaths = nodes(upper).filter(node => node.type === 'Path');
  const lowerPaths = nodes(lower).filter(node => node.type === 'Path');
  assert.deepEqual(upperPaths.map(node => node.props.d), lowerPaths.map(node => node.props.d), 'both sections crop the same world-coordinate artwork, preventing seams');
  assert.ok(upperPaths.length <= 11, 'soil batches sprites into a bounded number of native SVG paths');
  const rectangleY = [];
  for (const part of upperPaths) {
    assert.ok(Object.values(colors).includes(part.props.fill));
    const runs = [...part.props.d.matchAll(/M(\d+) (\d+)h(\d+)v(\d+)h-(\d+)Z/g)];
    assert.equal(runs.map(run => run[0]).join(''), part.props.d);
    for (const [, x, y, w, h, reverse] of runs) {
      assert.equal(w, reverse);
      assert.ok([x, y, w, h].map(Number).every(tokens.isOnPixelGrid));
      rectangleY.push(Number(y));
    }
  }
  assert.ok(rectangleY.some(y => y < 231) && rectangleY.some(y => y > 700), 'details continue through the lower scrolling soil');
}
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
      './world-tree-soil': { WorldTreeSoilDetails: 'SoilArt' },
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
    const soilDetails = findId('world-tree-soil-details'), deepSoilDetails = findId('world-tree-deep-soil-details');
    assert.equal(soilDetails.props.pointerEvents, 'none');
    assert.equal(deepSoilDetails.props.pointerEvents, 'none');
    assert.ok(drawn.indexOf(soilDetails) < drawn.indexOf(artNode()), 'buried details remain behind the tree roots');
    const soilSlices = drawn.filter(node => node.type === 'SoilArt');
    assert.equal(soilSlices.length, 2);
    assert.equal(flatten(soilDetails.props.style).top + soilSlices[0].props.height, 672);
    assert.equal(soilSlices[1].props.offsetY, soilSlices[0].props.height);
    assert.equal(soilSlices[0].props.worldHeight, soilSlices[1].props.worldHeight);
    future.props.onLayout({ nativeEvent: { layout: { height: 900 } } });
    await Promise.resolve();
    const grownSlices = nodes(h.value).filter(node => node.type === 'SoilArt');
    assert.equal(grownSlices[1].props.height, 900, 'scenery covers taller content and enlarged text');
    assert.equal(grownSlices[0].props.worldHeight, grownSlices[0].props.height + 900);
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
  console.log('PASS continuous soil composition across scroll sections, grid-aligned token sprites, bounded native paths and taller-content coverage');
})().catch(error => { console.error(error); process.exitCode = 1; });
