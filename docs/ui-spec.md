# BeeBetter mobile UI specification

[Login](../mobile/src/app/auth.tsx) sets the visual direction for controls. [Skill Tree](../mobile/src/app/(tabs)/skill-tree.tsx) sets the visual direction for growth and rewards. Use pixel styling for prominent actions, XP, and growth cues. Keep forms and dense lists easy to scan.

This spec takes precedence over older defaults for new or deliberately migrated pixel components. See the [frontend design guide](agent/frontend-design.md) and [mobile UI guide](agent/mobile-ui.md) for shared layout and control behavior.

## Gamified UI rollout

1. **Start with the quest loop.** Show the next quest and its potential XP. Use inline XP in the Home hero and `XpBadge` in quest lists. Show confirmed XP and any level change with `RewardPanel`. Carry the same `XpProgress` into Home, Profile, and the selected Skill Tree branch, with clear labels for account and branch progress. Use the growth leaf to connect completion visually to the tree. Preserve the [existing reward and progression rules](agent/quest-system.md#completion-and-history).
2. **Migrate existing screens by repeated pattern.** Replace duplicate XP labels, meters, or reward layouts with shared components first. Apply `PixelButton` to the main action where it helps the student move through the quest loop. Keep shared controls for forms, navigation, and routine actions.
3. **Build future UI from the same pieces.** Decide whether it helps the student choose a quest, act, see a reward, or review growth. Reuse an existing component, add a variant when the same component needs a different presentation, and extract a new shared component when the same pattern is needed in multiple places.
4. **Review one complete flow before expanding.** Follow a quest from Home through completion to updated progress. Check that XP amounts and labels agree, the reward reads clearly, and the layout works in both themes at narrow widths and enlarged text.

## Reuse and tokens

See the [gamified UI library catalog](mobile-gamified-ui-library.md) for existing components, proposed assets, and screen replacements.

- Use [`PixelButton`](../mobile/src/components/pixel/pixel-button.tsx) for pixel actions, [`PixelFrame`](../mobile/src/components/pixel/pixel-frame.tsx) for stepped frames, and [`XpBadge`, `XpProgress`, and `RewardPanel`](../mobile/src/components/xp-visuals.tsx) for reward UI. Reuse shared form and navigation controls from [`mobile-ui`](../mobile/src/components/mobile-ui.tsx).
- Keep values in [`design-tokens.json`](../mobile/src/constants/design-tokens.json). Import pixel values through [`tokens.ts`](../mobile/src/constants/tokens.ts) and theme-aware roles through [`theme.ts`](../mobile/src/constants/theme.ts).
- Use semantic colors for each theme. The [PNG atlas](../mobile/assets/pixel-button-pack/pixel-button.atlas.json) and `DerivedRamps` describe shipped artwork. The wrapping `PixelButton` uses SVG and `pixel.button.ramps`. Atlas regeneration requires explicit approval.

## Typography

Use the bundled, single-weight **VT323-Regular** for all app text, including titles, body copy, metadata, button labels, fields, placeholders, and secure entry. `design-tokens.json` owns the family and role metrics. Use `ThemedText`, NativeWind `Text`, or `TypographyRoles` when composing a control directly. Keep text live and scalable, use the role's line height, and omit `fontWeight`.

| Role | Size / line height (dp) |
| --- | --- |
| Heading | 28 / 32 |
| Section | 26 / 30 |
| Item | 24 / 28 |
| Label | 22 / 24 |
| Body | 20 / 24 |
| Metadata | 18 / 22 |
| Home metadata | 16 / 20 |

Use `Field` for visible labels, hints, errors, and text entry. The operating system renders native dialogs, permissions, and picker chrome in its own font.

## Home

- Place the account level beside the date below the greeting. Follow with one featured quest on a flat surface with a primary left rule, then unboxed account progress, Daily check-in and Skill Tree. Home uses heading, label, body and Home metadata.
- Feature the highest-ranked upcoming quest. Fall back to the leading recommendation when none is upcoming. Show **Next quest** for an upcoming quest and append its scheduled start in device-local time when available. Show category and `XpBadge` beside the primary pixel action. **Start quest** opens the existing quest details and the information control opens **Why this quest**. Show the conditional level-up message with the title and let the footer wrap when space is limited.
- Place the current level and remaining XP above the meter. Show seven honeycomb cells, capped at seven filled cells. Combine the streak and completed-quest count on one metadata line and expose a single accessibility summary. At zero, use **Start your streak today**.
- Separate Daily check-in and Skill Tree with rules. Low, Okay, and Good open the full Daily check-in with well-being set to 2, 3, or 4. The form requires well-being, stress, and energy before saving. **Full check-in** opens it without a preset. Show the account's branch count alongside the Skill Tree label.
- Reserve the measured bottom bar height, including the bottom safe area, plus `PixelSpacing.px2` after the last item.

## Pixel grid, dimensions and rendering

See [How to build pixel assets](pixel-assets.md) for the workflow from source artwork to app-ready assets.

- **1 art pixel = 3dp.** Use `PixelSpacing` and `PixelBorders` for new pixel geometry. The default border is **3dp**, emphasis is **6dp**, and minimum horizontal text padding in framed controls is **18dp**. Convert raw art-pixel counts once at the rendering boundary.
- Use the wrapping SVG `PixelButton` for text actions, including Login. Its target starts at **48dp** and grows with the label. The fixed raster variant is available explicitly as `layout="fixed"` for artwork that fits its **16 art pixel / 48dp** face. Render raster artwork at integer scale with nearest-neighbor sampling. Atlas insets are **4 art pixels** for the face and **7** for the focus ring.
- Keep interactive targets at least **48 × 48dp**. Let labels wrap and layouts grow at larger text sizes.

## Approved colors and interaction policy

- Use the canonical primary and pressed colors in each theme. The approved accent base is **#D29D30** and its highlight is **#F5B83D**. Use `accentForeground` for text on the accent fill.
- Filled pressed buttons use the pressed base, the normal base as the highlight, and a single **3dp** face offset. Keep shadow and outline colors consistent between states.
- Quiet and accent-quiet stay transparent with a uniform **3dp** outline and readable foreground text. Accent-quiet uses an accent outline.
- Use explicit per-theme, per-variant disabled ramps. Use `disabledForeground` on neutral surfaces and the semantic foreground paired with a filled ramp for readable labels. Show visible focus and busy feedback. Loading blocks repeat activation while preserving layout.
- Verify both themes at narrow widths and enlarged text. Check focus, pressed, disabled, and loading states. Maintain **4.5:1** contrast for normal text and **3:1** for large text and meaningful control boundaries and icons. Give meaningful controls explicit names, use cues beyond color, and respect reduced motion.

## World tree — staged implementation

See the [prototype guide](../mobile/src/prototypes/skill-tree/README.md) for artwork, canopy targets, and current behavior. The camera is a later slice, pending static artwork review.

- Keep overview and domain focus in one mounted scene with a continuous zoom and pan between them. Enter focus only from a canopy target, reveal nodes in focus, and reset to overview on reopen. Back, close, or zooming below **1.1×** overview scale exits focus. Zoom jitter cannot re-enter it. Dragging cancels a tap.
- Use the existing UI-thread camera stack, clamp pan and zoom, and snap resting position to the **3dp** grid and resting zoom to supported integer scales. Use a short fade for reduced motion. Verify sharp resting frames and 60fps in the native Android build before enabling the camera.
