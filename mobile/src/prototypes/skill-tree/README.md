# World tree prototype

Open **Home → Skill Tree → Open prototype** in the native app.

Tap a canopy to scroll smoothly down into its reserved soil area on the same
page. The soil content is a placeholder for future work, with no progression
or unlock rules. **Back to tree** scrolls to the overview and preserves the
selected highlight. Hover/focus do not scroll. System reduced motion disables
the automatic scroll animation. Both areas stay mounted in one native
ScrollView, with a continuous soil fill and no navigation or bottom sheet.

The selected tree silhouette stays on a 96 × 128 art grid, rendered at 3dp per
cell (288 × 384dp). The tree is centered horizontally with its root end near the
lower quarter of the available scene. A blue sky fades subtly toward white
near the bottom. Appearance changes remain in Settings.

## Current visual review

- Separate pixel-art sun, cloud and grass layers sit behind the tree. Grass follows
  the soil surface through both viewport edges, rounding up fractional widths to
  avoid gaps. Scenery uses scoped tokens, 3dp geometry and ignores touches. These
  layers are static for now.
- Brown bark and saturated green/lime foliage use scoped illustration ramps in
  `pixel.worldTree`; other screens' semantic palettes remain unchanged.
- Permanent stepped soil sits behind the full root fan, then joins a solid fill
  through the screen bottom. It has no handle, drag behavior or expandable panel.
- Soil has an uneven, manually composed arrangement of rock clusters, pebbles,
  moss/grass tufts, edge roots and broken sediment pockets. Both scroll sections
  crop the same composition, keeping details continuous without repeated tiles.
  Decorations remain behind content, ignore touches and use batched token paths.
- Domain names use VT323 SVG text: one stroke pass and one fill pass with identical
  coordinates and metrics. This replaces the misaligned native Text copies.
- Transparent canopy targets stay at least 48dp and do not overlap. Names are
  centered on the leaf-pixel centroids, snapped to the 3dp grid. Hover, focus,
  touch-down and click brighten the active canopy and darken peers; hover-out
  or a canceled press restores the clicked selection. Wood/soil stay unchanged.
  Camera/focus animation is pending.
- Above 130% system text size, a static scrolling name legend occupies the soil
  area so labels can grow without obscuring other canopy targets.

The soil-sheet experiment was canceled and its component/state removed.
There is no local theme or target-debug toolbar. The original PNG concept and
tree geometry are preserved; only the rendering palette changes.

## Artwork preparation

`node scripts/build-world-tree-art.cjs` compiles the original selected PNG into
`assets/skill-tree/world-tree-art.json`. Source and base-palette hashes are
recorded. Runtime maps its wood/canopy color roles to the scoped illustration
ramps. This allows recoloring without resampling the source or changing its
silhouette. `--check` verifies source reproducibility.

## Verification

Run from mobile:

- `node scripts/build-world-tree-art.cjs --check`
- `node scripts/test-world-tree.cjs`
- `npx tsc --noEmit`
- `npm run lint`
- `npm run test:context`
- `npm run test:ui`
- `node scripts/test-design-tokens.cjs`

Coverage includes source/grid integrity, brown/green ramps, soil draw order and
root coverage, exact stroke/fill alignment, minimum targets and separate canopy
bounds at 320/360/360.5/393/412/600dp, full-width grass and scenery draw order,
centered roots at several scene heights, and normal/enlarged labels. Native visual review uses the authorized Android
phone. Camera/ambient animation and their 60fps checks remain a later slice.
