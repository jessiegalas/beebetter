# BeeBetter mobile UI specification

This is the decision record for the reusable mobile UI library. Read it with
[frontend design guidance](agent/frontend-design.md). It takes precedence over
older mobile presentation defaults where they differ. Auth remains the visual
starting reference; existing screens are not migrated by this specification.

## Typography — provisional

Use the bundled `VT323-Regular`. It is single-weight: omit `fontWeight`; do not
apply synthetic bold or inherit a weight from the legacy type scale.

| Role | Font size | Line height |
| --- | --- | --- |
| heading | 28 | 32 |
| label | 22 | 24 |
| body | 20 | 24 |
| metadata | 16 | 20 |

These metrics are provisional. The minimum library font size is 16. Preserve
system text scaling; the minimum is not a maximum or a reason to disable scaling.
These font metrics are independent of the art geometry grid below.

`TypographyRoles` contains these four styles without weights; `TypographySpec`
records their provisional status and minimum size. The existing `TypographyScale`
and `Typography` exports retain the legacy platform-font scale for unmigrated
consumers. They must not supply weights to new VT323 styles.

### Inputs

Use the VT323 **body** role (20/24, no weight) for input labels, hints, errors
and short input text. A field label uses body, not the general library label role.
Use the existing platform sans family for multiline text or an explicit fallback prop;
the fallback changes family without introducing a new size/weight scale.
Do not make users read unsupported glyph boxes or lose entered text when falling
back. Use sans for any multiline input or an explicit font-fallback prop; do not perform runtime glyph detection.

**Password-mask rendering is a required native gallery check.** Verify secure
input dots/bullets, clipping, reveal/hide behavior and alignment on iOS/Android;
do not assume VT323 contains the mask glyph or that native secure inputs render
identically. The password fallback choice depends on that check. No inputs are
migrated by this documentation update.

## Pixel grid, dimensions and rendering

Source: the existing [PixelButton atlas](../mobile/assets/pixel-button.atlas.json),
also present in [the designer pack](../mobile/assets/pixel-button-pack/pixel-button.atlas.json).
The two JSON copies match at the time of this report.

- The default face is **16 art pixels = 48dp**, giving **3dp per art pixel**.
  This also agrees with `grid.display_scale_default = 3` and the existing asset
  builder's `DP_PER_ART_PX` calculation.
- New pixel-library spacing, border widths and insets must be whole multiples of
  that 3dp unit. Use `artPixelsToDp` for whole art-pixel counts; do not silently
  round off-grid values or reinterpret existing dp values as art pixels.
- Raster scaling is integer-only, nearest-neighbor, with no smoothing. The current
  atlas exports scales 1/2/3; default display scale is 3. Export scale is distinct
  from device pixel density. No fractional raster transforms are allowed.
- Keep 9-slice insets in **art pixels**. Face insets are 4 on all four edges
  (12dp at default scale). Focus-ring insets are 7 on all four edges (21dp).
  Convert only at the rendering boundary; never apply the conversion twice.
- Stretchable frames and panels use SVG stepped geometry. Small fixed artwork
  stays PNG. This is a library rendering policy, not authorization to replace
  existing controls or rebuild the PNG pack in this task.
- Minimum touch target is **48 × 48dp**, regardless of visible artwork size.

### Approved pixel spacing and borders

`PixelSpacing` and `PixelBorders` are available from the pure token entry and
theme adapter; their values live under `pixel.spacing` and `pixel.borders`.
`pxN` means N art pixels, already converted to dp; do not multiply it again.

| Spacing token | dp |
| --- | --- |
| px1 | 3 |
| px2 | 6 |
| px3 | 9 |
| px4 | 12 |
| px5 | 15 |
| px6 | 18 |
| px8 | 24 |
| px12 | 36 |
| px16 | 48 |

Default pixel border: `px1` (3dp). Emphasis pixel border: `px2` (6dp).
These widths do not redefine the art-pixel slice insets or prescribe a new focus
ring width. Some existing panel border/highlight/corner values and the 4-unit
spacing scale remain off-grid legacy values. **Migrate them only when that
component is touched**; do not bulk-round values or change legacy `Spacing` and
`Borders` exports. A migrated component must resolve its relevant geometry.

**Confirmed: minimum horizontal text padding is `PixelSpacing.px6` (18dp).**
It stays on-grid and preserves the previous 16dp minimum. Horizontal text
clearance and the four-art-pixel slice caps remain separate measurements.

## Approved colors and interaction policy

Primary is confirmed: light **#854D0D**, dark **#F7EA87**. These already match the
canonical palette; no semantic palette change is necessary. The historical atlas
inventory below remains intact so it can be compared with future regenerated art.

| Regeneration target | Decision |
| --- | --- |
| Light primary pressed base | Canonical **#6D3D09**, replacing atlas #6F3F08 |
| Dark primary pressed base | Existing canonical **#E1D373** |
| Accent base, both themes | Canonical **#D29D30** |
| Accent highlight step, both themes | **#F5B83D**; verify in the gallery |

The approved highlight replaces the current accent highlight in each theme;
do not keep #F5B83D as the light accent base. Remaining atlas/semantic differences
in the report are not silently approved for reconciliation by these decisions.

- **Quiet and accent-quiet:** transparent outlined treatment in every state, same dimensions and 48dp minimum target. Accent-quiet uses an accent outline. No text-only variant.
- **Disabled:** fixed per-theme, per-variant desaturated ramps, no opacity. Exact colors are below.
- **Pressed (supersedes the earlier one-step shift):** base = canonical pressed token; highlight = normal base; shadow and outline unchanged; face offset = 1 art pixel (3dp). Highlight is derived from normal base, not independently selected. Outlined variants retain transparent faces.

These are policies for the reusable pixel library, not changes to existing screen
or control behavior. Legacy opacity states are retained only until the affected
component is intentionally migrated.

## Atlas colors versus canonical tokens — report before color changes

Compared atlas version 0.4.0 against `design-tokens.json` before adding derived
ramp records. This report reads JSON metadata, not sampled PNG pixels. Hex colors
are compared case-insensitively. Atlas bytes and canonical light/dark palettes
remain unchanged. This historical comparison predates the approved decisions
above; it describes existing artwork rather than regeneration targets.

Baseline SHA-256 values for this comparison:

- Atlas: `6198b57979f7d526f7ccc4046d1017a4b174f0bb9a3c66c6731d3a36a695706e`
- Canonical `{light,dark}` JSON serialization: `f48989c150fed34900d43a5d1c7bfe57a0c0d96ba88e3d86c3a7b43cf8fbb808`

### Normal and pressed fills

The comparison roles below follow the existing shared `mobile-ui` Button behavior:
primary/primaryPressed, card/surfaceMuted for secondary, transparent/surfaceMuted
for quiet, danger/dangerPressed for destructive, accent in both accent states,
and transparent in both accent-quiet states (pressed feedback uses opacity).
These are explicit comparison mappings, not a claim that every atlas variant has
a corresponding dedicated semantic token. `null` atlas fill means transparent.

| Theme / variant | Atlas normal | Canonical normal | Atlas pressed | Canonical pressed |
| --- | --- | --- | --- | --- |
| light primary | #854D0D | #854D0D | #6F3F08 | #6D3D09 |
| light secondary | #F3E3C0 | #FFFDF2 | #E6D3A8 | #EAE5CE |
| light quiet | transparent | transparent | #EAD9B5 | #EAE5CE |
| light destructive | #B8322A | #A33128 | #9C2A23 | #8B251F |
| light accent | #F5B83D | #D29D30 | #E3A12B | #D29D30 |
| light accent-quiet | #FFF0C2 | transparent | #F8DD8E | transparent |
| dark primary | #F7EA87 | #F7EA87 | #E1D373 | #E1D373 |
| dark secondary | #30261A | #30261A | #493D2A | #493D2A |
| dark quiet | transparent | transparent | #493D2A | #493D2A |
| dark destructive | #FFB4A8 | #FFB4A8 | #F09E91 | #F09E91 |
| dark accent | #D29D30 | #D29D30 | #BE8B27 | #D29D30 |
| dark accent-quiet | #40351B | transparent | #493D2A | transparent |

### Atlas shading ramps

Map atlas `highlight → highlight`, `fill → base`, `shade → shadow`, and
`outline → outline`. Preserve `press_fill` and `press_shade` as pressed base and
shadow. The atlas supplies no independent pressed highlight/outline slots, so no
new ones are fabricated. `null` is preserved rather than replaced by a guessed
color. These are existing atlas colors; no new shades are calculated.

| Theme / variant | Highlight | Base | Shadow | Outline | Pressed shadow |
| --- | --- | --- | --- | --- | --- |
| light primary | #A8681E | #854D0D | #5E3508 | #3B2410 | #5E3508 |
| light secondary | #FFF8E6 | #F3E3C0 | #D9C28F | #3B2410 | #D9C28F |
| light quiet | null | null | #D8C7A1 | #6B4A26 | #D8C7A1 |
| light destructive | #D9584E | #B8322A | #8A221B | #4A140F | #8A221B |
| light accent | #FFE08A | #F5B83D | #C98410 | #3B2410 | #C98410 |
| light accent-quiet | #FFF9E0 | #FFF0C2 | #F2D88A | #A8700F | #E8C766 |
| dark primary | #FFF7BF | #F7EA87 | #C9BC63 | #3A200C | #C9BC63 |
| dark secondary | #403424 | #30261A | #221A10 | #A59473 | #30261A |
| dark quiet | null | null | #30261A | #A59473 | #30261A |
| dark destructive | #FFD3CB | #FFB4A8 | #D98C80 | #48271F | #D98C80 |
| dark accent | #E8B957 | #D29D30 | #9A6F1A | #3A200C | #9A6F1A |
| dark accent-quiet | #504223 | #40351B | #2E2613 | #D29D30 | #40351B |

Many light shading/outline values have no exact canonical match. Dark secondary
outline matches `input`, its base matches `card`, and several dark pressed values
match `surfaceMuted`. Those coincidences do not assign new semantic roles to art
shading. The atlas explicitly calls some dark shading values derived assumptions.

### Labels and focus

Atlas labels are metadata; PixelButton draws real text using canonical label
roles, so a metadata difference is not automatically a rendered text difference.

| Item | Atlas | Canonical comparison | Result |
| --- | --- | --- | --- |
| light primary/destructive label | #F8F7DE | primaryForeground/dangerForeground #F8F7DE | match |
| other light variant labels | #3B2410 | foreground/accentForeground #3A200C | different |
| light disabled label | #4F4840 | disabledForeground #69543C | different |
| all dark variant labels | per-variant metadata | corresponding canonical label roles | match |
| dark disabled label | #D1C4A6 | disabledForeground #D1C4A6 | match |
| light focus ring | #854D0D | focus #854D0D | match |
| dark focus ring | #F7EA87 | focus #F7EA87 | match |

The atlas does not define complete disabled highlight/base/shadow/outline ramps;
no disabled ramp is inferred from filenames, label colors or other variants.

## Token ownership and rollout

- [design-tokens.json](../mobile/src/constants/design-tokens.json) remains the
  value source. [tokens.ts](../mobile/src/constants/tokens.ts) is its pure library
  entry; `theme.ts` remains the app/theme adapter. CSS and Tailwind keep their
  existing canonical source.
- Promote the existing atlas shading records as `DerivedRamps` for both themes,
  separate from semantic palettes. Their status is
  `atlas-inventory-regeneration-pending`. Primary is confirmed; the recorded ramps
  still describe the unchanged atlas, not a complete approved replacement palette.
- Keep legacy type/spacing/border consumers intact during this foundation step.
  New pixel components use the provisional roles and grid policy. Never mix the
  legacy weighted scale into VT323 styles.
- Primary confirmation permits **planning only**. Do not regenerate either atlas
  or the PNG pack until the user explicitly authorizes execution after reviewing
  the plan below. This task does not run the asset builder, recolor assets, migrate
  screens, or replace the current auth button.

## Atlas regeneration plan — not executed

1. **Use the resolved decisions and review the Codex defaults below.** Keep atlas execution on hold.
2. **Prepare an isolated staging build after execution is authorized.** Preserve
   a hash manifest of source PNGs, both atlas copies and density exports. Inventory
   actual PNG colors against metadata (the current report covers JSON only).
   Preserve transparency masks, stepped corners, dimensions and art-pixel insets.
3. **Generate or recolor source artwork by explicit palette roles.** The existing
   [asset builder](../mobile/scripts/build-pixel-assets.cjs) only crops/scales
   existing PNGs; editing atlas metadata alone does not recolor art. Add a
   source-art step that maps highlight/base/shadow/outline without changing masks.
   Generate per-variant disabled sprites and model the 3dp pressed face movement
   exactly once, either in artwork or rendering, never both. Keep stretchable
   frames/panels on the SVG path and small fixed art on PNG.
4. **Synchronize metadata and exports in staging.** Update both atlas copies
   identically with approved palettes, state paths and agreed padding. Extend the
   builder's current shared-disabled-sprite handling for per-variant art before
   producing density exports. Its existing output uses three horizontal slices
   at fixed height, not a general nine-slice renderer. Preserve integer
   nearest-neighbor scaling at 3 × density (1x/2x/3x); verify dimensions, palette
   membership, alpha masks and identical atlas metadata. No smoothing.
5. **Review the component gallery before adoption.** Compare every variant in
   light/dark: normal, pressed, focus, disabled and loading. Check stable layout,
   48dp minimum targets, transparent outlined quiet, fixed disabled colors without
   opacity, 3dp face movement without double offset, and pressed highlight derived from normal base. Explicitly inspect **accent #D29D30 base / #F5B83D highlight** in
   both themes, including text contrast. Check VT323 body input roles, multiline/explicit-prop
   fallback, native password masks, enlarged text and wrapping.
6. **Adopt only in deliberately touched components.** Replace staged assets only
   after review, then migrate the relevant legacy geometry/state styling and run
   targeted component tests plus mobile type/lint/UI checks. Do not bulk-migrate
   screens or automatically substitute the experimental SVG button for auth.

The Button gallery now implements these rules through the existing SVG button.
Production auth/PNG controls remain unchanged.
Neither the source-art step nor the existing asset builder has been run.

## Decided by Codex, pending review

Routine decisions following the user's working rule:
- Soil detail uses an asymmetrical, manually arranged composition of larger rock clusters, small pebbles, moss/grass tufts, wall roots and faint broken sediment pockets. No tile grid or repeated scatter rows. Both scrolling sections crop the same world-coordinate SVG composition, avoiding a seam; scenery stays behind content and ignores touches. Sprites use integer 3dp geometry, scoped illustration tokens and one batched path per color. Content growth expands the composition's depth.
- Scenery layers: separate static pixel-art sun, clouds and grass SVGs sit behind the tree and ignore touches/accessibility focus. Sun/cloud art uses integer 3dp scaling with grid-snapped positions. Grass follows the stepped soil surface and spans the entire viewport, rounding its width up to the grid and clipping at the screen edge so fractional widths cannot leave a gap. Scene colors live under `pixel.worldTree`; ambient animation remains a later slice.
- Scenery layers: separate static pixel-art sun, clouds and grass SVGs sit behind the tree and ignore touches/accessibility focus. Sun/cloud art uses integer 3dp scaling with grid-snapped positions. Grass follows the stepped soil surface and spans the entire viewport, rounding its width up to the grid and clipping at the screen edge so fractional widths cannot leave a gap. Scene colors live under `pixel.worldTree`; ambient animation remains a later slice.
- Domain clicks now scroll down to a second, viewport-sized soil section on the same page, reserved for future content. Native scrolling handles the transition; reduced motion disables animation. The tree remains mounted/attached, the soil fill is continuous, and no route or bottom sheet is opened. Back to tree scrolls to offset zero while preserving selection. Hover/focus/canceled touches change highlight only and do not scroll. No skill content, progression or unlock behavior is introduced.
- Canopy captions are centered on the visible leaf-pixel centroids, rounded to the 3dp grid, rather than placed above the canopy bounds. Hover, keyboard focus and touch-down temporarily highlight a branch; click/tap persists selection. The active canopy uses brighter token ramps and peer canopies use darker ramps. Exiting a temporary highlight restores the clicked selection (or normal colors if none). Wood, soil, geometry and text-outline alignment remain unchanged.
- Canopy captions are centered on the visible leaf-pixel centroids, rounded to the 3dp grid, rather than placed above the canopy bounds. Hover, keyboard focus and touch-down temporarily highlight a branch; click/tap persists selection. The active canopy uses brighter token ramps and peer canopies use darker ramps. Exiting a temporary highlight restores the clicked selection (or normal colors if none). Wood, soil, geometry and text-outline alignment remain unchanged.
- Latest visual revision (2026-11-10): the bottom-sheet experiment is canceled. Soil is permanent scenery behind the full root fan, continuing to the viewport bottom. Its surface starts 72dp above the root anchor, so outer roots lie over earth rather than empty sky. The canceled sheet component, snap state and gesture handlers are removed.
- The trunk now uses a warm brown ramp and foliage a brighter green/lime ramp under `pixel.worldTree`. These scoped illustration tokens leave semantic app colors and the source tree geometry unchanged. The blue-to-white sky and lower-quarter root placement remain.
- Name borders now use SVG text stroke and fill passes with identical font, coordinates, size and baseline; no offset native Text copies. The outline is the default 3dp border with miter joins. Settings owns appearance changes; no local mode or target-debug buttons are present. Domain selection is a small label mark while camera focus remains pending.
- Integrated artwork: the selected second concept is compiled onto a 96 × 128 art-pixel grid and rendered at 3dp per cell (288 × 384dp). The source PNG under `mobile/assets/skill-tree/concepts/` stays untouched. Runtime uses token-indexed vector runs in `world-tree-art.json`, with separate wood and four canopy groups, hard transparency, no bitmap resampling and no generated haze. The compiler records source/palette SHA-256 values and has a reproducibility check.
- Ground is a separate SVG underlay: fixed-size, grid-aligned terrain at the root contact plus a matching solid token fill extending to the viewport's bottom edge and lower safe area. The ground spans the viewport width and the cap's final row matches the fill exactly. Generated soil PNGs remain composition references, not runtime assets. Both tree and ground use the canonical light illustration palette in both appearances to preserve pale bark and earthy soil; text and controls follow the selected theme.
- Revised domain-entry direction: the four canopy clusters become the domain buttons, superseding the earlier arrow-only design when implemented. Retain independent targets of at least 48 × 48dp, non-overlap, drag-cancels-tap behavior, and no domain entry from other tree taps. Camera implementation remains gated on static artwork review.
- Animation direction for a later slice: wood and four foliage groups are separate. Sparse frame-based leaf rustling and occasional falling leaves remain planned, with ambient motion disabled for reduced motion. No motion or new library was added in this integration slice.
- Static layout: Academics upper-left, Social upper-right, Habits lower-left and Health lower-right. Tall screens grow the solid soil continuation; short screens scroll without shrinking the art. Labels use VT323 roles and move into a flowing soil-area legend above 130% text scaling to avoid overlapping canopy controls.
- Domain fixtures expose stable IDs, names, optional display-only summaries, presentation coordinates and neutral node labels. Missing summaries are omitted. No XP, levels, prerequisites, completion or unlock rules are derived.
- Canopy targets replace the former arrows: four independent 138 × 84dp regions, with no overlap at 320–600dp tested widths. They remain explicitly disabled until camera implementation. The Targets control outlines their full bounds for review.
- Gallery theme switching uses the existing appearance owner, just like the button/panel galleries; it updates the app's saved appearance preference.
- Planned camera method: animate a containing SVG group's translate/scale with Reanimated animated props, rather than scaling the entire native View. Text and touch overlays remain screen-sized. SVG redraws as vectors at rest; no cached bitmap scaling or new rendering library. This camera is not implemented in the static slice.
- Disabled conversion: mix each normal RGB color **60%** toward an achromatic gray with the same HSL lightness: gray = (max(R,G,B) + min(R,G,B)) / 2; output channel = round(0.4 × channel + 0.6 × gray). Mix in encoded sRGB. Transparent slots stay transparent. No opacity.
- Ramps live under `pixel.button.ramps`, separate from unchanged `DerivedRamps` atlas inventory. SVG gallery uses them; PNG/auth remains unchanged.
- Secondary base/pressed use canonical card/surfaceMuted. Primary and destructive use their canonical base/pressed tokens. Accent pressed retains existing atlas press_fill (#E3A12B light, #BE8B27 dark), now explicitly recorded as its button pressed token. Existing non-accent shading and outlines are retained. Accent highlight is #F5B83D.
- Disabled text uses canonical disabledForeground, rather than applying the decorative ramp mixing formula to text.
- Gallery previews cover every variant in normal, pressed, focus, disabled and loading states. Loading does not force a pressed appearance.
- Gallery regular labels use the 22/24 role; simulated 150% labels use 33/36. Legacy comparison headings appear only above the PNG/SVG pairs.
- Outlined buttons use a uniform default 3dp border, with no raised bottom-depth band. Accent-quiet keeps the accent outline and uses canonical foreground text for readability (accent-colored text on the light background lacks sufficient contrast).
- Inputs use sans for any multiline input or explicit prop; no character threshold or runtime glyph detection. Prop naming will be settled when the existing field is touched.

| Theme / variant | Disabled highlight | Disabled base | Disabled shadow | Disabled outline |
| --- | --- | --- | --- | --- |
| light primary | #7F6547 | #614B31 | #443422 | #2E251D |
| light secondary | #F8F5EE | #FBFAF6 | #C3BAA5 | #2E251D |
| light quiet | transparent | transparent | #C8C1B2 | #56493B |
| light destructive | #AF7C78 | #7E514D | #693F3C | #382321 |
| light accent | #BEA574 | #A18C61 | #927648 | #2E251D |
| light accent-quiet | transparent | transparent | #D3C8A9 | #A18C61 |
| dark primary | #ECE9D2 | #D5D0A9 | #AAA582 | #2C221A |
| dark secondary | #38332C | #292521 | #1D1915 | #968F82 |
| dark quiet | transparent | transparent | #292521 | #968F82 |
| dark destructive | #EFDEDB | #E5C7C2 | #BEA09B | #3C2F2B |
| dark accent | #BEA574 | #A18C61 | #746240 | #2C221A |
| dark accent-quiet | transparent | transparent | #26231B | #A18C61 |

## Password-mask verification

The bundled VT323 cmap contains U+2022 BULLET and U+002A ASTERISK, but lacks
U+25CF BLACK CIRCLE (verified directly from its TrueType cmap). This is font
coverage evidence, not a guarantee about which glyph a native password field uses.
Font coverage is checked separately from platform rendering. Native secure-input
rendering, clipping and reveal/hide behavior still require an iOS/Android device;
a web gallery or font cmap cannot establish those results. Do not claim native
verification from a synthetic preview.
The Android device is now authorized through ADB. Native password-mask inspection
has still not been performed: device connectivity alone does not establish rendering.

### Gallery review follow-up

Button and panel regression checks cover both themes, state transitions, wrapping,
minimum sizes, transparent quiet faces and a stable uniform outlined border.
The isolated web bundle compiles, but the in-app browser displayed an empty root;
native browser access was denied. Visual approval and native password-mask checks
remain pending. No atlas regeneration was performed.

## Open questions

No remaining decision blocks the Button gallery. Native password-mask behavior
remains a verification item. Atlas regeneration still requires explicit authorization.

## World tree — staged implementation

The isolated native Skill Tree prototype now previews one Yggdrasil-style tree.
Review it in the mobile app via **Home → Skill Tree → Open prototype**; no
browser is needed. It is also available in the optional interactive web gallery at
`?screen=pixel-buttons&experiment=tree`. The production Skill Tree and its
database-backed progress are unchanged. The static slice shows the complete
tree and four domain names, with no individual skill nodes. Review this slice
in light/dark before implementing the camera.

### Approved interaction contract — camera/gestures pending

- Keep a single mounted scene and two states: overview and focus(domainId).
  Reopening always starts in overview; do not persist camera/focus state.
- In the revised artwork direction, only a domain's canopy button enters focus
  (superseding the earlier arrow-only design). The current visual preview uses
  a small selection mark; camera focus is still pending. The soil-sheet
  experiment was canceled, so selection does not open a panel.
  Other tree taps and overview pinch-zoom never choose a domain. Each canopy
  control has at least a 48 × 48dp target. Targets must not overlap at
  approximately 360dp screen width. Dragging from a target cancels its tap.
- Enter and leave with one continuous zoom-plus-pan camera animation, with
  other branches receding but remaining visible as context. Do not navigate,
  replace the scene, flash or remount. Reveal individual nodes only in focus.
- Back/close, Android back and zooming out return to overview. Use hysteresis:
  focus is entered through a domain control only; exit below 1.1× the overview scale.
  Remaining above that threshold retains the current domain. After exiting,
  zoom jitter cannot re-enter focus. Add boundary/jitter regression checks with
  the camera/gesture slices, before enabling these interactions.
- Pan/pinch and animations run on the UI thread through the existing
  Reanimated/Gesture Handler libraries. Clamp the camera so the tree cannot be
  lost. Snap resting zoom to supported integer scales and positions to the 3dp
  grid; transient softness during motion is accepted. Do not scale raster art
  fractionally. Reduced motion uses a short fade around the camera change.
- Verify animated 60fps and sharp, grid-snapped resting frames on the authorized
  real Android device. A web preview or geometry test does not establish either.
  If SVG cannot sustain 60fps, stop and propose a fallback with trade-offs;
  adding Skia or any other library requires explicit approval.

### Verification and review gate

ADB reported the connected Infinix X6852 as `device` (authorized) on 2026-11-09.
Recheck authorization before camera work. Static regression coverage includes
both palettes, one SVG tree, whole art-pixel/axis-aligned geometry, neutral data,
hidden nodes, and four non-overlapping 48dp targets at 320, 360, 360.5, 393, 412
and 600dp screen widths. Native render inspection and animated camera checks
are separate evidence. Pause after this static slice for the user's gallery
review; camera, hysteresis behavior, gestures and Android-back handling remain
unimplemented until that review is approved.

The earlier static overview was inspected in the native Android app on the Infinix X6852
in both light and dark at its 360dp logical width / 3× device density. The whole
tree remains visible and the resting stepped edges look sharp at the initial
integer 1× art scale. The visible arrows were moved into clear foliage after
that first inspection, then rechecked in the native dark preview. Four-target
separation is covered by geometry regression tests; the native target-outline
inspection was interrupted when the phone changed apps. This is static render
evidence only: animated 60fps and sharp resting frames at the future camera's
zoom levels remain unverified and mandatory for the camera slice.

### Selected-artwork integration verification

The selected gnarled tree and separate soil are now integrated into the same
native prototype and optional gallery consumer. ADB authorization was rechecked.
Native light/dark screenshots on the 360dp Infinix X6852 show the whole tree,
sharp resting art cells, and soil extending continuously to the screen bottom.
The native target-guide preview shows four separate canopy regions. Source
reproducibility, exact token colors, whole-cell paths, five rendering groups,
non-overlapping >=48dp targets at 320/360/360.5/393/412/600dp, and exact matching
soil continuation are covered by regression checks. Label layout is checked in
both themes at 100/150/200% text scaling; enlarged text still needs visual device
review. Camera, gestures, ambient animation, hysteresis behavior and animated
60fps remain unimplemented for the next approved slices. Production screens,
progression, database behavior and libraries remain unchanged by this integration.

### Brown tree and restored root soil — 2026-11-10

The soil is fixed behind the complete root fan, with a matching opaque fill to
the screen bottom. The sheet component and its gesture/snap/back state have
been removed. The tree keeps its lower-quarter root anchor and integer 3dp art
grid. Wood now uses scoped brown ramps, with saturated green/lime foliage;
semantic palettes and original source geometry are unchanged. The blue sky
retains its subtle white transition near the bottom. Settings remains the only
appearance control.

Domain-name outlines use identical SVG glyph positions for stroke and fill,
with the default 3dp outline and VT323 metrics. This replaces the visibly
misregistered native Text copies. Phone inspection confirmed brown bark,
brighter leaves and aligned labels. The ground cap was then raised to cover
the full root spread. Regression checks cover ground draw order/coverage,
absence of sheet state, new color ramps, text alignment/scaling and unchanged
canopy bounds. Camera and ambient motion remain later work.
