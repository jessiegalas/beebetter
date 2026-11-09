import { artPixelsToDp, ArtPixelDp, TouchTarget } from '@/constants/tokens';

export type DomainId = 'academics' | 'habits' | 'social' | 'health';
export type SkillNode = { id: string; label: string; position: { x: number; y: number } };
export type TreeDomain = {
  id: DomainId;
  name: string;
  /** Optional display copy supplied by the future adapter; never calculated here. */
  summary?: string;
  canopy: { x: number; y: number; width: number; height: number };
  labelCenter: { x: number; y: number };
  nodes: readonly SkillNode[];
};

export const TREE_SIZE = { width: artPixelsToDp(96), height: artPixelsToDp(128) };
const point = (x: number, y: number) => ({ x: artPixelsToDp(x), y: artPixelsToDp(y) });
const canopy = (x: number, y: number) => ({ ...point(x, y), width: artPixelsToDp(46), height: artPixelsToDp(28) });
// Neutral fixtures only: no XP, prerequisites, completion, levels or unlock rules.
export const DOMAINS: readonly TreeDomain[] = [
  { id: 'academics', name: 'Academics', canopy: canopy(0, 10), labelCenter: point(22, 23), nodes: [
    { id: 'academics-notes', label: 'Review notes', position: point(15, 18) },
    { id: 'academics-practice', label: 'Practice', position: point(31, 25) },
    { id: 'academics-reading', label: 'Read a chapter', position: point(21, 33) },
  ] },
  { id: 'habits', name: 'Habits', canopy: canopy(0, 44), labelCenter: point(17, 58), nodes: [
    { id: 'habits-plan', label: 'Plan the day', position: point(12, 52) },
    { id: 'habits-space', label: 'Tidy a space', position: point(29, 58) },
    { id: 'habits-prepare', label: 'Prepare for class', position: point(20, 66) },
  ] },
  { id: 'social', name: 'Social', canopy: canopy(50, 4), labelCenter: point(75, 17), nodes: [
    { id: 'social-connect', label: 'Catch up', position: point(65, 12) },
    { id: 'social-share', label: 'Share a meal', position: point(82, 21) },
    { id: 'social-help', label: 'Help someone', position: point(72, 30) },
  ] },
  { id: 'health', name: 'Health', canopy: canopy(50, 43), labelCenter: point(78, 56), nodes: [
    { id: 'health-walk', label: 'Take a walk', position: point(65, 48) },
    { id: 'health-stretch', label: 'Stretch', position: point(83, 56) },
    { id: 'health-rest', label: 'Make time to rest', position: point(74, 64) },
  ] },
];

/** Whole-grid centering; the illustration never scales down to fit. */
export function overviewOrigin(availableWidth: number) {
  return Math.max(0, Math.floor((availableWidth - TREE_SIZE.width) / (2 * ArtPixelDp)) * ArtPixelDp);
}
export function overviewCanopyTargets(availableWidth: number, treeTop = 0) {
  const left = overviewOrigin(availableWidth);
  return DOMAINS.map(domain => ({
    id: domain.id, name: domain.name,
    x: left + domain.canopy.x, y: treeTop + domain.canopy.y,
    labelX: left + domain.labelCenter.x, labelY: treeTop + domain.labelCenter.y,
    width: Math.max(TouchTarget.minWidth, domain.canopy.width),
    height: Math.max(TouchTarget.minHeight, domain.canopy.height),
  }));
}

const snap = (value: number) => Math.round(value / ArtPixelDp) * ArtPixelDp;
export function treeSceneLayout(width: number, height: number) {
  const rootLine = snap(height * 0.75);
  return { left: overviewOrigin(width), top: Math.max(0, rootLine + artPixelsToDp(8) - TREE_SIZE.height), rootLine };
}
