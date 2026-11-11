const { load } = require('./test-harness.cjs');

const treeDirectory = 'src/prototypes/skill-tree';
const { layoutGeneratedTree, questGlyph, treeArtwork } = load(treeDirectory + '/generated-tree-layout.ts');
const { generatedTreeFixtures } = load(treeDirectory + '/generated-tree-fixtures.ts');

// The generator emits explicit move, horizontal, vertical, and close commands.
// Fail visibly if a future generator introduces a path command we can't measure.
function pathVertices(path) {
  const tokens = path.match(/[a-z]|[-+]?(?:\d*\.)?\d+/gi) ?? [];
  const points = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i < tokens.length; i++) {
    const command = tokens[i];
    switch (command) {
      case 'M': x = Number(tokens[++i]); y = Number(tokens[++i]); break;
      case 'H': x = Number(tokens[++i]); break;
      case 'V': y = Number(tokens[++i]); break;
      case 'h': x += Number(tokens[++i]); break;
      case 'v': y += Number(tokens[++i]); break;
      case 'Z': continue;
      default: throw new Error('Unsupported generated path command: ' + command);
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Invalid generated path: ' + path);
    points.push({ x, y });
  }
  return points;
}

function bounds(points) {
  const x = points.map(point => point.x);
  const y = points.map(point => point.y);
  return { minX: Math.min(...x), minY: Math.min(...y), maxX: Math.max(...x), maxY: Math.max(...y) };
}

function boxesOverlap(a, b) {
  return a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;
}

function convexHull(points) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
    .filter((point, index, all) => !index || point.x !== all[index - 1].x || point.y !== all[index - 1].y);
  if (sorted.length <= 2) return sorted;
  const half = ordered => {
    const edge = [];
    for (const point of ordered) {
      while (edge.length >= 2) {
        const [a, b] = edge.slice(-2);
        if ((b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x) > 0) break;
        edge.pop();
      }
      edge.push(point);
    }
    return edge.slice(0, -1);
  };
  return [...half(sorted), ...half(sorted.reverse())];
}

function hullsOverlap(a, b) {
  // A gap on any edge normal separates the two convex polygons. Touching
  // edges count as zero area, just like touching node boxes.
  for (const hull of [a, b]) {
    for (let i = 0; i < hull.length; i++) {
      const start = hull[i];
      const end = hull[(i + 1) % hull.length];
      const project = point => point.x * (end.y - start.y) - point.y * (end.x - start.x);
      const left = a.map(project);
      const right = b.map(project);
      if (Math.max(...left) <= Math.min(...right) || Math.max(...right) <= Math.min(...left)) return false;
    }
  }
  return true;
}

function printPairs(label, items, overlaps) {
  const pairs = [];
  for (const [index, left] of items.entries()) {
    for (const right of items.slice(index + 1)) {
      if (overlaps(left, right)) pairs.push(left.id + ' × ' + right.id);
    }
  }
  console.log(`  ${label} (${pairs.length})`);
  for (const pair of pairs) console.log('    ' + pair);
}

function inspectFixture({ label, data }) {
  const world = layoutGeneratedTree(data);
  const artwork = treeArtwork(world, data, {});
  const art = [world.trunk, world.trunkLight, world.roots, ...Object.values(artwork)].flatMap(pathVertices);
  const quests = new Map(data.quests.map(quest => [quest.id, quest]));
  const vertices = new Map(world.nodes.filter(node => node.kind === 'quest')
    .map(node => [node.id, pathVertices(questGlyph(node, quests.get(node.id).state))]));
  const nodes = world.nodes.filter(node => vertices.has(node.id))
    .map(node => ({ id: `${node.kind}/${node.id}`, box: bounds(vertices.get(node.id)) }));
  const makeHull = (id, nodeIds) => ({ id, polygon: convexHull(nodeIds.flatMap(nodeId => vertices.get(nodeId) ?? [])) });
  const domains = data.domains.map(domain => makeHull('domain/' + domain.id,
    data.quests.filter(quest => quest.domainId === domain.id).map(quest => quest.id)));
  const clusters = [
    ...data.lines.map(line => makeHull('line/' + line.id,
      data.quests.filter(quest => quest.lineId === line.id).map(quest => quest.id))),
    ...data.domains.map(domain => makeHull('ungrouped/' + domain.id,
      data.quests.filter(quest => quest.domainId === domain.id && !quest.lineId).map(quest => quest.id))),
  ];
  const printHullPairs = (name, hulls) => printPairs(name, hulls.filter(hull => hull.polygon.length >= 3),
    (left, right) => hullsOverlap(left.polygon, right.polygon));

  console.log('\n' + label);
  console.log(`  World box (0, 0) to (${world.width}, ${world.height})`);
  const { minX, minY, maxX, maxY } = bounds(art);
  console.log(`  Art bounds (${minX}, ${minY}) to (${maxX}, ${maxY})`);
  printPairs('Overlapping node boxes', nodes, (left, right) => boxesOverlap(left.box, right.box));
  printHullPairs('Overlapping domain hulls', domains);
  printHullPairs('Overlapping line/ungrouped hulls', clusters);
}

console.log('World units. Art bounds include all detail levels and exclude stroke width.');
console.log('Node boxes and cluster hulls use quest glyphs. Wood and labels are excluded.');
for (const fixture of generatedTreeFixtures) inspectFixture(fixture);
