/**
 * Static React Native sources for the pixel button pack.
 *
 * Regenerate the PNGs with `node scripts/build-pixel-assets.cjs` after changing
 * `assets/pixel-button-pack/`. Each face is cut into left cap / stretchable
 * middle / right cap; every entry is `[left, middle, right]`.
 */
export type PixelSlice = readonly [number, number, number];
export type PixelTheme = 'light' | 'dark';
export type PixelIntent = 'primary' | 'secondary' | 'quiet' | 'destructive' | 'accent' | 'accent-quiet';
export type PixelSpinnerTone = 'cream' | 'dark' | 'ink';

const slice = (left: number, middle: number, right: number): PixelSlice => [left, middle, right];

export const FACES: Record<PixelTheme, Record<PixelIntent, { normal: PixelSlice; pressed: PixelSlice }> & { disabled: PixelSlice }> = {
  light: {
    primary: {
      normal: slice(
        require('../../../assets/pixel/button/light/primary-normal-left.png'),
        require('../../../assets/pixel/button/light/primary-normal-middle.png'),
        require('../../../assets/pixel/button/light/primary-normal-right.png'),
      ),
      pressed: slice(
        require('../../../assets/pixel/button/light/primary-pressed-left.png'),
        require('../../../assets/pixel/button/light/primary-pressed-middle.png'),
        require('../../../assets/pixel/button/light/primary-pressed-right.png'),
      ),
    },
    secondary: {
      normal: slice(
        require('../../../assets/pixel/button/light/secondary-normal-left.png'),
        require('../../../assets/pixel/button/light/secondary-normal-middle.png'),
        require('../../../assets/pixel/button/light/secondary-normal-right.png'),
      ),
      pressed: slice(
        require('../../../assets/pixel/button/light/secondary-pressed-left.png'),
        require('../../../assets/pixel/button/light/secondary-pressed-middle.png'),
        require('../../../assets/pixel/button/light/secondary-pressed-right.png'),
      ),
    },
    quiet: {
      normal: slice(
        require('../../../assets/pixel/button/light/quiet-normal-left.png'),
        require('../../../assets/pixel/button/light/quiet-normal-middle.png'),
        require('../../../assets/pixel/button/light/quiet-normal-right.png'),
      ),
      pressed: slice(
        require('../../../assets/pixel/button/light/quiet-pressed-left.png'),
        require('../../../assets/pixel/button/light/quiet-pressed-middle.png'),
        require('../../../assets/pixel/button/light/quiet-pressed-right.png'),
      ),
    },
    destructive: {
      normal: slice(
        require('../../../assets/pixel/button/light/destructive-normal-left.png'),
        require('../../../assets/pixel/button/light/destructive-normal-middle.png'),
        require('../../../assets/pixel/button/light/destructive-normal-right.png'),
      ),
      pressed: slice(
        require('../../../assets/pixel/button/light/destructive-pressed-left.png'),
        require('../../../assets/pixel/button/light/destructive-pressed-middle.png'),
        require('../../../assets/pixel/button/light/destructive-pressed-right.png'),
      ),
    },
    accent: {
      normal: slice(
        require('../../../assets/pixel/button/light/accent-normal-left.png'),
        require('../../../assets/pixel/button/light/accent-normal-middle.png'),
        require('../../../assets/pixel/button/light/accent-normal-right.png'),
      ),
      pressed: slice(
        require('../../../assets/pixel/button/light/accent-pressed-left.png'),
        require('../../../assets/pixel/button/light/accent-pressed-middle.png'),
        require('../../../assets/pixel/button/light/accent-pressed-right.png'),
      ),
    },
    'accent-quiet': {
      normal: slice(
        require('../../../assets/pixel/button/light/accent-quiet-normal-left.png'),
        require('../../../assets/pixel/button/light/accent-quiet-normal-middle.png'),
        require('../../../assets/pixel/button/light/accent-quiet-normal-right.png'),
      ),
      pressed: slice(
        require('../../../assets/pixel/button/light/accent-quiet-pressed-left.png'),
        require('../../../assets/pixel/button/light/accent-quiet-pressed-middle.png'),
        require('../../../assets/pixel/button/light/accent-quiet-pressed-right.png'),
      ),
    },
    disabled: slice(
      require('../../../assets/pixel/button/light/disabled-left.png'),
      require('../../../assets/pixel/button/light/disabled-middle.png'),
      require('../../../assets/pixel/button/light/disabled-right.png'),
    ),
  },
  dark: {
    primary: {
      normal: slice(
        require('../../../assets/pixel/button/dark/primary-normal-left.png'),
        require('../../../assets/pixel/button/dark/primary-normal-middle.png'),
        require('../../../assets/pixel/button/dark/primary-normal-right.png'),
      ),
      pressed: slice(
        require('../../../assets/pixel/button/dark/primary-pressed-left.png'),
        require('../../../assets/pixel/button/dark/primary-pressed-middle.png'),
        require('../../../assets/pixel/button/dark/primary-pressed-right.png'),
      ),
    },
    secondary: {
      normal: slice(
        require('../../../assets/pixel/button/dark/secondary-normal-left.png'),
        require('../../../assets/pixel/button/dark/secondary-normal-middle.png'),
        require('../../../assets/pixel/button/dark/secondary-normal-right.png'),
      ),
      pressed: slice(
        require('../../../assets/pixel/button/dark/secondary-pressed-left.png'),
        require('../../../assets/pixel/button/dark/secondary-pressed-middle.png'),
        require('../../../assets/pixel/button/dark/secondary-pressed-right.png'),
      ),
    },
    quiet: {
      normal: slice(
        require('../../../assets/pixel/button/dark/quiet-normal-left.png'),
        require('../../../assets/pixel/button/dark/quiet-normal-middle.png'),
        require('../../../assets/pixel/button/dark/quiet-normal-right.png'),
      ),
      pressed: slice(
        require('../../../assets/pixel/button/dark/quiet-pressed-left.png'),
        require('../../../assets/pixel/button/dark/quiet-pressed-middle.png'),
        require('../../../assets/pixel/button/dark/quiet-pressed-right.png'),
      ),
    },
    destructive: {
      normal: slice(
        require('../../../assets/pixel/button/dark/destructive-normal-left.png'),
        require('../../../assets/pixel/button/dark/destructive-normal-middle.png'),
        require('../../../assets/pixel/button/dark/destructive-normal-right.png'),
      ),
      pressed: slice(
        require('../../../assets/pixel/button/dark/destructive-pressed-left.png'),
        require('../../../assets/pixel/button/dark/destructive-pressed-middle.png'),
        require('../../../assets/pixel/button/dark/destructive-pressed-right.png'),
      ),
    },
    accent: {
      normal: slice(
        require('../../../assets/pixel/button/dark/accent-normal-left.png'),
        require('../../../assets/pixel/button/dark/accent-normal-middle.png'),
        require('../../../assets/pixel/button/dark/accent-normal-right.png'),
      ),
      pressed: slice(
        require('../../../assets/pixel/button/dark/accent-pressed-left.png'),
        require('../../../assets/pixel/button/dark/accent-pressed-middle.png'),
        require('../../../assets/pixel/button/dark/accent-pressed-right.png'),
      ),
    },
    'accent-quiet': {
      normal: slice(
        require('../../../assets/pixel/button/dark/accent-quiet-normal-left.png'),
        require('../../../assets/pixel/button/dark/accent-quiet-normal-middle.png'),
        require('../../../assets/pixel/button/dark/accent-quiet-normal-right.png'),
      ),
      pressed: slice(
        require('../../../assets/pixel/button/dark/accent-quiet-pressed-left.png'),
        require('../../../assets/pixel/button/dark/accent-quiet-pressed-middle.png'),
        require('../../../assets/pixel/button/dark/accent-quiet-pressed-right.png'),
      ),
    },
    disabled: slice(
      require('../../../assets/pixel/button/dark/disabled-left.png'),
      require('../../../assets/pixel/button/dark/disabled-middle.png'),
      require('../../../assets/pixel/button/dark/disabled-right.png'),
    ),
  },
};

export const RINGS: Record<PixelTheme, PixelSlice> = {
  light: slice(
    require('../../../assets/pixel/button/light/focus-ring-left.png'),
    require('../../../assets/pixel/button/light/focus-ring-middle.png'),
    require('../../../assets/pixel/button/light/focus-ring-right.png'),
  ),
  dark: slice(
    require('../../../assets/pixel/button/dark/focus-ring-left.png'),
    require('../../../assets/pixel/button/dark/focus-ring-middle.png'),
    require('../../../assets/pixel/button/dark/focus-ring-right.png'),
  ),
};

export const SPINNERS: Record<PixelSpinnerTone, number> = {
  cream: require('../../../assets/pixel/button/spinner/cream.png'),
  dark: require('../../../assets/pixel/button/spinner/dark.png'),
  ink: require('../../../assets/pixel/button/spinner/ink.png'),
};

/** Spinner ink per theme/variant, matching the pack atlas. */
export const SPINNER_TONE: Record<PixelTheme, Record<PixelIntent, PixelSpinnerTone>> = {
  light: { primary: 'cream', secondary: 'dark', quiet: 'dark', destructive: 'cream', accent: 'dark', 'accent-quiet': 'dark' },
  dark: { primary: 'ink', secondary: 'cream', quiet: 'cream', destructive: 'ink', accent: 'dark', 'accent-quiet': 'cream' },
};
