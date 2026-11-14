# How to build pixel assets for BeeBetter

Use [Login](../mobile/src/app/auth.tsx) as the reference for pixel controls and [Skill Tree](../mobile/src/app/(tabs)/skill-tree.tsx) for growth artwork. Before drawing, identify what the asset communicates in the quest flow and check whether the [shared UI components](ui-spec.md#reuse-and-tokens) already have a suitable asset.

## Design and draw

1. **Choose the format and display size.** Use transparent PNGs for fixed sprites and illustrations. Reuse `PixelFrame` or stepped SVG for stretchable surfaces. For small UI icons that need to follow theme tokens, use grid-aligned SVG paths as in [`XpBadge` and `GrowthLeaf`](../mobile/src/components/xp-visuals.tsx).
2. **Draw on the art grid.** Work at one source pixel per cell and map each cell to **3dp** at the default display scale. For example, a 6 × 6 mark displays at 18 × 18dp. Use whole cells, a clear silhouette, and hard edges. Use fully transparent pixels around isolated sprites. Use the [existing palette roles](../mobile/src/constants/design-tokens.json) and check the silhouette against light and dark surfaces.
3. **Prepare the source.** Keep an editable source at the original grid size and give the asset a name that describes its role. If you start from an image-generated concept, clean it up to the intended grid, palette, and transparency before exporting. Use the same canvas and anchor for frames or states to keep the art from jumping. Render readable labels and XP values as live text.

## Export and integrate

- **Fixed PNGs.** Use nearest-neighbor scaling at integer multiples. At the default 3dp art scale, a 6 × 6 source needs 18 × 18px for `name.png`, 36 × 36px for `name@2x.png`, and 54 × 54px for `name@3x.png`. The component displays all three at 18 × 18dp. Keep source art and runtime exports identifiable.
- **Theme-aware SVG icons.** Use a `viewBox` in art pixels, draw paths on whole-cell coordinates, and size the rendered SVG at 3dp per cell. Take fills from the app palette. Hide decorative art from accessibility and expose the meaning through the surrounding control or label.
- **Existing asset packs.** The [button pack](../mobile/assets/pixel-button-pack/README.md) has its own [density export script](../mobile/scripts/build-pixel-assets.cjs). The [World Tree workflow](../mobile/src/prototypes/skill-tree/README.md#artwork-preparation) compiles the approved concept into token-indexed runtime art. Use these builders for their respective assets. Atlas regeneration follows the [mobile UI specification](ui-spec.md#reuse-and-tokens).

## Verify in the app

Inspect the result at its actual size in both themes. Check for soft edges, fringes, cropping, alignment shifts, and legibility beside enlarged text. If an asset has states, check focus, pressed, disabled, and loading as applicable. Keep interactive targets at least **48 × 48dp**, and check the reduced-motion treatment for animation. Inspect on a native build to verify device-density rendering.
