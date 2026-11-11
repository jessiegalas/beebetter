export type QuestState = 'active' | 'locked' | 'completed' | 'pending' | 'rejected';
export type TreeDomain = { id: string; title: string };
export type QuestLine = { id: string; domainId: string; title: string };
export type TreeQuest = {
  id: string; domainId: string; lineId?: string; title: string;
  createdAt: string; prerequisiteId?: string; state: QuestState;
};
export type TreeData = { domains: TreeDomain[]; lines: QuestLine[]; quests: TreeQuest[] };
export type TreeFocus = { domainId?: string; lineId?: string };
export type TreeTarget = {
  id: string; kind: 'domain' | 'line' | 'quest'; title: string;
  count?: number; state?: QuestState; prerequisiteLabel?: string;
  x: number; y: number; width: number; height: number; topOffset: number; showTitle: boolean;
};
type Entry = Omit<TreeTarget, 'x' | 'y' | 'width' | 'height' | 'topOffset' | 'showTitle'>;

export const GRAPHIC_TARGET_CAP = 8;
const compareText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const compareQuest = (a: TreeQuest, b: TreeQuest) => compareText(a.createdAt, b.createdAt) || compareText(a.id, b.id);
const hash = (id: string) => {
  let value = 2166136261;
  for (const char of id) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
};

function treeEntries(data: TreeData, focus: TreeFocus): Entry[] {
  if (!focus.domainId) return [...data.domains].sort((a, b) => compareText(a.id, b.id)).map(domain => ({
    id: domain.id, title: domain.title, kind: 'domain',
    count: data.quests.filter(quest => quest.domainId === domain.id).length,
  }));
  const domainQuests = data.quests.filter(quest => quest.domainId === focus.domainId);
  const lines: Entry[] = focus.lineId ? [] : data.lines.filter(line => line.domainId === focus.domainId)
    .sort((a, b) => compareText(a.id, b.id)).map(line => ({
      id: line.id, title: line.title, kind: 'line', count: domainQuests.filter(quest => quest.lineId === line.id).length,
    }));
  const quests = domainQuests.filter(quest => quest.lineId === focus.lineId);
  const byId = new Map(quests.map(quest => [quest.id, quest]));
  const depth = (quest: TreeQuest) => {
    const seen = new Set([quest.id]);
    let parent = quest.prerequisiteId;
    while (parent && byId.has(parent) && !seen.has(parent)) {
      seen.add(parent);
      parent = byId.get(parent)?.prerequisiteId;
    }
    return seen.size - 1;
  };
  return [...lines, ...quests.sort((a, b) => (focus.lineId ? depth(a) - depth(b) : 0) || compareQuest(a, b)).map((quest): Entry => {
    const parent = quest.prerequisiteId ? data.quests.find(item => item.id === quest.prerequisiteId) : undefined;
    const external = parent && (parent.domainId !== quest.domainId || parent.lineId !== quest.lineId);
    const parentScope = external && [data.domains.find(domain => domain.id === parent.domainId)?.title,
      data.lines.find(line => line.id === parent.lineId)?.title].filter(Boolean).join(' / ');
    return {
      id: quest.id, title: quest.title, kind: 'quest', state: quest.state,
      prerequisiteLabel: quest.state !== 'locked' ? undefined : parent
        ? `Complete “${parent.title}” first${parentScope ? ' · ' + parentScope : ''}` : 'Prerequisite details unavailable',
    };
  })];
}

export type WorldNode = { id: string; kind: Entry['kind']; parentId?: string; x: number; y: number; edge: string; limb?: string };
export type TreeWorld = {
  width: number; height: number; center: number;
  trunk: string; trunkLight: string; roots: string;
  forks: { parentId: string; edge: string }[];
  nodes: WorldNode[]; byId: Map<string, WorldNode>;
};
export type Camera = { x: number; y: number; scale: number };
export const CAMERA_MS = 360;
export const GROWTH_MS = 520;

type Point = { x: number; y: number };
type Limb = { points: Point[]; thickness: number };
type DraftNode = Omit<WorldNode, 'edge' | 'limb'> & { from: Point; wood?: Limb };

const QUESTS_PER_BRANCHLET = 16;
const BRANCHLET_SPACING = 35;
const PAIR_SPACING = 13;
const GROUP_GAP = 14;
const DOMAIN_GAP = 24;
const ART_MARGIN = 12;

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const snap = (n: number) => Math.round(n / 3) * 3;
const mix = (from: number, to: number, t: number) => from + (to - from) * t;

function sampledLimb(from: Point, to: Point, thickness: number, sample: (t: number) => Point): Limb {
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 2));
  return { points: Array.from({ length: steps + 1 }, (_, i) => sample(i / steps)), thickness };
}

function curvedLimb(from: Point, to: Point, thickness: number, bend: number): Limb {
  return sampledLimb(from, to, thickness, t => ({
    x: mix(from.x, to.x, t),
    y: mix(from.y, to.y, t) - bend * 4 * t * (1 - t),
  }));
}

function taperedPath({ points, thickness }: Limb) {
  const start = points[0], end = points[points.length - 1];
  const horizontal = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
  const offset = (point: Point, index: number, side: number) => {
    const radius = Math.max(1, Math.round(thickness * (1 - index / (points.length - 1)) / 2));
    return [point.x + (horizontal ? 0 : side * radius), point.y + (horizontal ? side * radius : 0)];
  };
  const boundary = [...points.map((point, index) => offset(point, index, -1)),
    ...points.map((point, index) => offset(point, index, 1)).reverse()];
  if (horizontal ? end.x < start.x : end.y > start.y) boundary.reverse();
  return boundary.map(([x, y], i) => i ? `H${x}V${y}` : `M${x} ${y}`).join('') + 'Z';
}

function steppedEdge(points: Point[]) {
  return points.map(({ x, y }, index) => index ? `H${x}V${y}` : `M${x} ${y}`).join('');
}

export function layoutGeneratedTree(data: TreeData): TreeWorld {
  const draft: DraftNode[] = [];
  const branchlets: { parentId: string; points: Point[] }[] = [];
  const sideHeights = [32, 49];
  const trunkAt = (y: number): Point => ({ x: -4 + 9 * Math.min(1, y / 155) ** 2, y });

  for (const [index, domain] of treeEntries(data, {}).entries()) {
    const sideIndex = index % 2;
    const side = sideIndex ? 1 : -1;
    const level = Math.floor(index / 2);
    const domainFocus = { domainId: domain.id };
    const entries = treeEntries(data, domainFocus);
    const groups = entries.filter(entry => entry.kind === 'line').map(line => ({
      line, quests: treeEntries(data, { ...domainFocus, lineId: line.id }),
    }));
    const loose = entries.filter(entry => entry.kind === 'quest');
    const bands = [...groups, ...(loose.length ? [{ line: undefined, quests: loose }] : [])].map(group => ({
      ...group, rows: Math.max(1, Math.ceil(group.quests.length / QUESTS_PER_BRANCHLET)),
    }));

    let floor = sideHeights[sideIndex];
    const from = trunkAt(floor + 4);
    const reach = bands.length ? Math.max(47, 73 - level * 10) + hash(domain.id) % 7 : 32;
    const rise = bands.length
      ? bands.reduce((sum, band) => sum + band.rows * BRANCHLET_SPACING + GROUP_GAP, 0) - GROUP_GAP - 12
      : 14;
    const boughAt = (t: number): Point => ({
      x: from.x + side * reach * (1 - (1 - t) ** 1.4),
      y: from.y + rise * t,
    });
    const tip = boughAt(1);
    draft.push({ id: domain.id, kind: 'domain', ...tip, from, wood: sampledLimb(from, tip, 15, boughAt) });

    for (const { line, quests, rows } of bands) {
      const bandMiddle = floor + rows * BRANCHLET_SPACING / 2;
      const junction = boughAt(clamp((bandMiddle - from.y) / rise, 0.2, 0.92));
      const parentId = line?.id ?? domain.id;
      const hub = { x: side * (reach + (line ? 17 : 12)), y: bandMiddle + 3 };
      const limb = curvedLimb(junction, hub, line ? 7 : 5, Math.min(4, Math.abs(hub.x - junction.x) * 0.12));
      if (line) {
        draft.push({ id: line.id, kind: 'line', parentId: domain.id, ...hub, from: junction, wood: limb });
      } else {
        branchlets.push({ parentId, points: limb.points });
      }
      for (let row = 0; row < rows && row * QUESTS_PER_BRANCHLET < quests.length; row++) {
        const rowQuests = quests.slice(row * QUESTS_PER_BRANCHLET, (row + 1) * QUESTS_PER_BRANCHLET);
        const pairs = Math.ceil(rowQuests.length / 2);
        const rowY = floor + row * BRANCHLET_SPACING + BRANCHLET_SPACING / 2;
        const stagger = rows === 1 ? 0 : (row * 3 + hash(parentId)) % 4 * 3;
        const elbow = { x: hub.x + side * (12 + stagger), y: rowY };
        const rowAt = (distance: number): Point => ({ x: elbow.x + side * distance,
          y: rowY + Math.round(Math.min(9, distance / 10)) });
        const start = rows === 1 ? hub : limb.points[Math.floor((0.65 + 0.35 * row / (rows - 1)) * (limb.points.length - 1))];
        const end = rowAt(7 + (pairs - 1) * PAIR_SPACING + 4);
        branchlets.push({ parentId, points: [...curvedLimb(start, elbow, 2, 1.5).points,
          ...Array.from({ length: pairs }, (_, pair) => rowAt(7 + pair * PAIR_SPACING)), end] });
        for (const [i, quest] of rowQuests.entries()) {
          const branch = rowAt(7 + Math.floor(i / 2) * PAIR_SPACING);
          const seed = hash(quest.id);
          draft.push({ id: quest.id, kind: 'quest', parentId, from: branch,
            x: branch.x + side * (i % 2 ? 4 + seed % 2 : 2 + seed % 2),
            y: branch.y + (i % 2 ? -1 : 1) * (9 + seed % 3) });
        }
      }
      floor += rows * BRANCHLET_SPACING + GROUP_GAP;
    }
    sideHeights[sideIndex] = Math.max(floor - GROUP_GAP, tip.y + 7) + DOMAIN_GAP;
  }

  const topDomain = Math.max(54, ...draft.filter(node => node.kind === 'domain').map(node => node.y)) + 8;
  const foot = trunkAt(0), top = trunkAt(topDomain);
  const trunk = sampledLimb(foot, top, 30, t => trunkAt(t * topDomain));
  const lightTop = trunkAt(topDomain * 0.72);
  const trunkLight = sampledLimb(foot, lightTop, 6, t => {
    const { x, y } = trunkAt(mix(5, lightTop.y, t));
    return { x: x - mix(5, 2, t), y };
  });
  const roots = [curvedLimb(trunkAt(5), { x: -34, y: -5 }, 12, 2),
    curvedLimb(trunkAt(5), { x: 30, y: -6 }, 11, 3)];
  const art = [...trunk.points, ...roots.flatMap(root => root.points), ...draft,
    ...branchlets.flatMap(branch => branch.points)];
  const left = Math.floor(Math.min(...art.map(point => point.x))) - ART_MARGIN;
  const right = Math.ceil(Math.max(...art.map(point => point.x))) + ART_MARGIN;
  const bottom = Math.floor(Math.min(...art.map(point => point.y))) - ART_MARGIN;
  const ceiling = Math.ceil(Math.max(...art.map(point => point.y))) + ART_MARGIN;
  const project = ({ x, y }: Point): Point => ({ x: Math.round(x) - left, y: ceiling - Math.round(y) });
  const paint = (limb: Limb) => taperedPath({ ...limb, points: limb.points.map(project) });
  const nodes = draft.map(({ id, kind, parentId, from: start, wood, ...point }): WorldNode => ({
    id, kind, ...(parentId ? { parentId } : {}), ...project(point),
    edge: steppedEdge([start, { x: mix(start.x, point.x, 0.52), y: mix(start.y, point.y, 0.42) }, point].map(project)),
    ...(wood ? { limb: paint(wood) } : {}),
  }));
  return { width: right - left, height: ceiling - bottom, center: -left,
    trunk: paint(trunk), trunkLight: paint(trunkLight), roots: roots.map(paint).join(''),
    nodes, byId: new Map(nodes.map(node => [node.id, node])),
    forks: branchlets.map(({ parentId, points }) => ({ parentId, edge: steppedEdge(points.map(project)) })) };
}

export const PAN_THRESHOLD = 8;
export const canTapTree = (distance: number) => {
  'worklet';
  return distance < PAN_THRESHOLD;
};

export function clampTreeCamera(camera: Camera, width: number, height: number, worldWidth: number, worldHeight: number, minScale: number, resting = false): Camera {
  'worklet';
  const scale = Math.min(minScale * 4.8, Math.max(minScale, camera.scale));
  const axis = (offset: number, view: number, world: number) => {
    const remaining = view - world * scale;
    if (remaining >= 0) return resting ? Math.round(remaining / 6) * 3 : remaining / 2;
    const position = resting ? Math.round(offset / 3) * 3 : offset;
    return Math.max(resting ? Math.ceil(remaining / 3) * 3 : remaining, Math.min(0, position));
  };
  return { x: axis(camera.x, width, worldWidth), y: axis(camera.y, height, worldHeight), scale };
}

export function zoomTreeAt(camera: Camera, scale: number, x: number, y: number): Camera {
  'worklet';
  const ratio = scale / camera.scale;
  return { x: x - (x - camera.x) * ratio, y: y - (y - camera.y) * ratio, scale };
}

export function semanticTreeFocus(world: TreeWorld, focus: TreeFocus, camera: Camera, rootScale: number, width: number, height: number): TreeFocus {
  const zoom = camera.scale / rootScale;
  if (zoom < (focus.domainId ? 1.25 : 1.55)) return {};
  const x = (width / 2 - camera.x) / camera.scale;
  const y = (height / 2 - camera.y) / camera.scale;
  const nearest = (kind: 'domain' | 'line', parentId?: string) => {
    const distance = (node: WorldNode) => Math.hypot(node.x - x, node.y - y);
    return world.nodes.filter(node => node.kind === kind && (!parentId || node.parentId === parentId))
      .sort((a, b) => distance(a) - distance(b) || compareText(a.id, b.id))[0];
  };
  const domain = nearest('domain');
  if (!domain) return {};
  const current = focus.domainId ? world.byId.get(focus.domainId) : undefined;
  const keepCurrent = current && Math.hypot(current.x - x, current.y - y) <= Math.hypot(domain.x - x, domain.y - y) + 16;
  const domainId = keepCurrent ? current.id : domain.id;
  const line = zoom >= (focus.lineId ? 1.95 : 2.35) ? nearest('line', domainId) : undefined;
  return line ? { domainId, lineId: line.id } : { domainId };
}

export function treeScene(world: TreeWorld, data: TreeData, focus: TreeFocus, width: number, height: number, revealId?: string, manual?: Camera) {
  const entries = treeEntries(data, focus);
  const rootScale = Math.min((width - 18) / world.width, (height - 18) / world.height);
  const focused = world.byId.get(revealId ?? focus.lineId ?? focus.domainId ?? '');
  const zoom = rootScale * (revealId ? 4.1 : focus.lineId ? 3 : focus.domainId ? 1.85 : 1);
  let requestedScale = zoom;
  let aimX = focused?.x ?? world.width / 2;
  let aimY = focused?.y ?? world.height / 2;
  if (focused && !revealId) {
    const branch = world.nodes.filter(node => node.id === focused.id || node.parentId === focused.id ||
      (focused.kind === 'domain' && node.parentId && world.byId.get(node.parentId)?.parentId === focused.id));
    const xs = branch.map(node => node.x);
    const ys = branch.map(node => node.y);
    if (focused.kind === 'domain') xs.push(world.center);
    const left = Math.min(...xs), right = Math.max(...xs);
    const top = Math.min(...ys), bottom = Math.max(...ys);
    aimX = (left + right) / 2;
    aimY = (top + bottom) / 2 + 8;
    requestedScale = Math.min(zoom,
      (width - 62) / Math.max(1, right - left), (height - 76) / Math.max(1, bottom - top));
  }
  // Quantize only the destination. The camera interpolates freely between poses.
  const scale = Math.max(rootScale, Math.floor(requestedScale * 4) / 4);
  const destination: Camera = {
    x: snap(width / 2 - aimX * scale),
    y: snap(height / 2 - aimY * scale), scale,
  };
  const camera = manual ? clampTreeCamera(manual, width, height, world.width, world.height, rootScale, true) : destination;
  const targets: TreeTarget[] = [];
  // At the fitted view of a long line, titles would sit on adjacent twigs.
  // Keep the glyphs readable and reserve titles for a closer zoom or the list.
  const showTitle = !focus.lineId || entries.length <= QUESTS_PER_BRANCHLET || camera.scale / rootScale >= 3.4;
  const topOffset = showTitle ? -9 : -24;
  const labelWidth = !showTitle ? 48 : focus.domainId ? clamp(Math.floor(width / 3), 48, 102)
    : clamp(Math.floor(108 * camera.scale) - 2, 48, 102);
  if (!revealId) for (const entry of entries) {
    const node = world.byId.get(entry.id);
    if (!node || targets.length >= GRAPHIC_TARGET_CAP) continue;
    if (entry.kind === 'quest' && !focus.lineId && camera.scale / rootScale < 1.65) continue;
    const left = node.x * camera.scale + camera.x - labelWidth / 2;
    const top = node.y * camera.scale + camera.y + topOffset;
    if (left < 0 || left + labelWidth > width || top < 0 || top + 48 > height) continue;
    if (targets.some(other => {
      const otherLeft = other.x * camera.scale + camera.x - other.width / 2;
      const otherTop = other.y * camera.scale + camera.y + other.topOffset;
      return left < otherLeft + other.width && left + labelWidth > otherLeft &&
        top < otherTop + other.height && top + 48 > otherTop;
    })) continue;
    targets.push({ ...entry, x: node.x, y: node.y, width: labelWidth, height: 48, topOffset, showTitle });
  }
  return { camera, rootScale, entries, targets, focusedId: focused?.id };
}

export function questGlyph(node: WorldNode, state: QuestState) {
  const { x, y } = node;
  if (state === 'completed') {
    const side = hash(node.id) % 2 ? -1 : 1;
    return `M${x - 4 * side} ${y + 4}h${3 * side}v-1h${4 * side}v-2h${2 * side}v-6h${-5 * side}v1h${-2 * side}v2h${-2 * side}Z`;
  }
  return `M${x - 2} ${y + 4}v-1h-2v-5h1v-1h1v-1h4v1h1v1h1v5h-2v1Z`;
}

export function treeArtwork(world: TreeWorld, data: TreeData, focus: TreeFocus, revealId?: string, grownId?: string) {
  const focusId = revealId ?? focus.lineId ?? focus.domainId;
  const ancestors = new Set<string>();
  for (let id = focusId; id; id = world.byId.get(id)?.parentId) ancestors.add(id);
  const quests = new Map(data.quests.map(quest => [quest.id, quest]));
  const batches: Record<string, string> = {};
  const append = (key: string, path: string) => { batches[key] = (batches[key] ?? '') + path; };
  const toneFor = (node: WorldNode) => {
    let inside = !focusId;
    for (let id: string | undefined = node.id; !inside && id; id = world.byId.get(id)?.parentId) inside = id === focusId;
    return ancestors.has(node.id) ? 'highlight' : inside ? 'normal' : 'dim';
  };
  for (const fork of world.forks) {
    const parent = world.byId.get(fork.parentId);
    if (parent) append(`fork:${toneFor(parent)}`, fork.edge);
  }
  for (const node of world.nodes) {
    const tone = toneFor(node);
    const kind = node.kind === 'quest' ? 'detail' : node.kind === 'line' ? 'line' : 'branch';
    append(`${kind}:${tone}`, node.limb ?? node.edge);
    if (node.kind !== 'quest') continue;
    const state = quests.get(node.id)?.state;
    if (!state || node.id === grownId) continue;
    append(`glyph-${state}:${tone}`, questGlyph(node, state));
    const { x, y } = node;
    if (state === 'locked') append(`wrap:${tone}`, `M${x - 4} ${y - 1}h8v2h-8Z`);
    if (state === 'completed') {
      const side = hash(node.id) % 2 ? -1 : 1;
      append(`vein:${tone}`, `M${x - 3 * side} ${y + 3}h${3 * side}v-2h${2 * side}v-2h${side}`);
    }
  }
  return batches;
}
