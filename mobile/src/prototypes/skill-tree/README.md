# World tree prototype

The legacy proof-only prototype remains at `/skill-tree-prototype` and in
the developer gallery. **Home → Skill Tree** opens the completion-based pilot.

Tap a canopy to scroll to the category's root on the same page. Each node
shows a completed quest with a saved photo or video proof. The latest
completions appear nearest the surface. Use **Load older completions** to
extend the root and **Back to tree** to return while keeping the selected
highlight. Hover and focus alone do not scroll. System reduced motion disables
the automatic scroll animation.

Open a node to view its photo or play its video. Optional notes stay in memory
for the current visit and clear when the prototype is reopened. This
read-only prototype uses the signed-in student's completed quest records
and the private proof bucket. The standalone gallery uses synthetic data.
PDFs, proof-free completions and deleted quest records are outside the
prototype. Video uses the SDK-compatible development build with expo-video.

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
  moss/grass tufts, edge roots and broken sediment pockets. The overview and underground header crop the same composition. Root nodes
  continue into the same soil fill.
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
