# BeeBetter pixel button pack v0.4.0 (light + dark)

Six variants (primary, secondary, quiet, destructive, accent, accent-quiet), each with normal + pressed faces,
one shared disabled face per theme, a focus-ring overlay per theme, and a loading spinner. 16x16 9-slice sprites
(4px insets), exported at 1x/2x/3x with nearest-neighbor scaling. Insets and states are in `pixel-button.atlas.json`.

- Light faces live in `button/`, dark faces in `button/dark/` (all six dark variants have their own faces).
- Content insets are in **dp** (at the 3x default scale). Center the real text label in the clear zone.
- Loading = the variant's pressed face + spinner (non-interactive). Reduced motion: use spinner frame index 6.
- The focus ring extends outside the button's layout box: the wrapper must allow overflow.
- Files are plain `.png`, not `.9.png`, so Android tooling doesn't treat them as nine-patch files.
- Light theme and dark theme use real BeeBetter tokens (dark values from design-tokens.json). DERIVED, no token exists:
  the highlight/shade lip colors, the dark accent pressed fill (#BE8B27), and the dark disabled outline/highlight/shade.
  Edit the THEMES block in `build.py` and re-run to regenerate.
- Spinner: 30dp (3x) when the button is at least 54dp wide, otherwise 20dp (2x). Compact buttons are the same sprite
  9-sliced to 14 art px tall at 3x (42dp), not a fractionally scaled bitmap.

## Follow-up
- Selected state for chips/tabs/toggles (belongs with the chip and tab assets).
- Light accent is #F5B83D but the accent token is #D29D30: decide whether to regenerate the light accent on-token.
- Quiet / accent-quiet keep an outlined look. Update tokens to match, or request borderless transparent versions.
