# BeeBetter mobile UI specification

[Login](../mobile/src/app/auth.tsx) sets the visual direction for controls. [Skill Tree](../mobile/src/app/(tabs)/skill-tree.tsx) sets the visual direction for growth and rewards. Use pixel styling for prominent actions, XP, and growth cues. Keep forms and dense lists easy to scan.

This spec takes precedence over older defaults for new or deliberately migrated pixel components. See the [frontend design guide](agent/frontend-design.md) and [mobile UI guide](agent/mobile-ui.md) for shared layout and control behavior.

## Gamified UI rollout

1. **Start with the quest loop.** Show the next quest and its potential XP with `XpBadge`. Show confirmed XP and any level change with `RewardPanel`. Carry the same `XpProgress` into Home, Profile, and the selected Skill Tree branch, with clear labels for account and branch progress. Use the growth leaf to connect completion visually to the tree. Preserve the [existing reward and progression rules](agent/quest-system.md#completion-and-history).
2. **Migrate existing screens by repeated pattern.** Replace duplicate XP labels, meters, or reward layouts with shared components first. Apply `PixelButton` to the main action where it helps the student move through the quest loop. Keep shared controls for forms, navigation, and routine actions.
3. **Build future UI from the same pieces.** Decide whether it helps the student choose a quest, act, see a reward, or review growth. Reuse an existing component, add a variant when the same component needs a different presentation, and extract a new shared component when the same pattern is needed in multiple places.
4. **Review one complete flow before expanding.** Follow a quest from Home through completion to updated progress. Check that XP amounts and labels agree, the reward reads clearly, and the layout works in both themes at narrow widths and enlarged text.

## Reuse and tokens

- Use [`PixelButton`](../mobile/src/components/pixel/pixel-button.tsx) for pixel actions, [`PixelFrame`](../mobile/src/components/pixel/pixel-frame.tsx) for stepped frames, and [`XpBadge`, `XpProgress`, and `RewardPanel`](../mobile/src/components/xp-visuals.tsx) for reward UI. Reuse shared form and navigation controls from [`mobile-ui`](../mobile/src/components/mobile-ui.tsx).
- Keep values in [`design-tokens.json`](../mobile/src/constants/design-tokens.json). Import pixel values through [`tokens.ts`](../mobile/src/constants/tokens.ts) and theme-aware roles through [`theme.ts`](../mobile/src/constants/theme.ts).
- Use semantic colors for each theme. The [PNG atlas](../mobile/assets/pixel-button-pack/pixel-button.atlas.json) and `DerivedRamps` describe shipped artwork. The experimental SVG button uses `pixel.button.ramps`. Atlas regeneration requires explicit approval.

## Typography — provisional

Use the bundled, single-weight **VT323-Regular** through `TypographyRoles`. Keep text live and scalable, use the role's line height, and omit `fontWeight`.

| Role | Size / line height (dp) |
| --- | --- |
| Heading | 28 / 32 |
| Label | 22 / 24 |
| Body | 20 / 24 |
| Metadata | 16 / 20 |

Use the **body** role for field labels, hints, errors, and short input text. Use platform sans at the same metrics for multiline input or an explicit fallback. Secure fields still need native iOS and Android checks for masking, clipping, and reveal/hide alignment before choosing their font.

## Pixel grid, dimensions and rendering

See [How to build pixel assets](pixel-assets.md) for the workflow from source artwork to app-ready assets.

- **1 art pixel = 3dp.** Use `PixelSpacing` and `PixelBorders` for new pixel geometry. The default border is **3dp**, emphasis is **6dp**, and minimum horizontal text padding in framed controls is **18dp**. Convert raw art-pixel counts once at the rendering boundary.
- Use stepped SVG geometry for stretchable frames and panels. Render fixed raster artwork at integer scale with nearest-neighbor sampling. The default button face is **16 art pixels / 48dp**. Atlas insets are **4 art pixels** for the face and **7** for the focus ring.
- Keep interactive targets at least **48 × 48dp**. Let labels wrap and layouts grow at larger text sizes.

## Approved colors and interaction policy

- Use the canonical primary and pressed colors in each theme. The approved accent base is **#D29D30** and its highlight is **#F5B83D**. Use `accentForeground` for text on the accent fill.
- Filled pressed buttons use the pressed base, the normal base as the highlight, and a single **3dp** face offset. Keep shadow and outline colors consistent between states.
- Quiet and accent-quiet stay transparent with a uniform **3dp** outline and readable foreground text. Accent-quiet uses an accent outline.
- Use explicit per-theme, per-variant disabled ramps and `disabledForeground`. Show visible focus and busy feedback. Loading blocks repeat activation while preserving layout.
- Verify both themes at narrow widths and enlarged text. Check focus, pressed, disabled, and loading states. Maintain **4.5:1** contrast for normal text and **3:1** for large text and meaningful control boundaries and icons. Give meaningful controls explicit names, use cues beyond color, and respect reduced motion.

## World tree — staged implementation

See the [prototype guide](../mobile/src/prototypes/skill-tree/README.md) for artwork, canopy targets, and current behavior. The camera is a later slice, pending static artwork review.

- Keep overview and domain focus in one mounted scene with a continuous zoom and pan between them. Enter focus only from a canopy target, reveal nodes in focus, and reset to overview on reopen. Back, close, or zooming below **1.1×** overview scale exits focus. Zoom jitter cannot re-enter it. Dragging cancels a tap.
- Use the existing UI-thread camera stack, clamp pan and zoom, and snap resting position to the **3dp** grid and resting zoom to supported integer scales. Use a short fade for reduced motion. Verify sharp resting frames and 60fps in the native Android build before enabling the camera.
