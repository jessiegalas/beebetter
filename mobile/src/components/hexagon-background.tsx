import { useEffect, useState } from 'react';
import { AppState, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { cancelAnimation, Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Defs, G, Pattern, Polygon, Rect } from 'react-native-svg';

import { useReducedMotion } from '@/components/mobile-ui';
import { useBeePalette } from '@/constants/theme';

// Staggered, separated hexagons follow the supplied pattern reference.
const TILE_WIDTH = 192;
const TILE_HEIGHT = 116;
const ROTATION = -20;
const LOOP_DURATION = 420_000;
const DRIFT_X = TILE_WIDTH;
const DRIFT_Y = TILE_HEIGHT * 2;
const HEXAGON = '-54,0 -27,-46.765 27,-46.765 54,0 27,46.765 -27,46.765';

export function HexagonBackground() {
  const c = useBeePalette();
  const { width, height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const [active, setActive] = useState(AppState.currentState === 'active');
  const progress = useSharedValue(0);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setActive(state === 'active'));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (active && !reducedMotion) {
      // Whole tile periods make the loop and resume seamless at any phase.
      progress.value = withRepeat(withTiming(progress.value + 1, {
        duration: LOOP_DURATION,
        easing: Easing.linear,
        reduceMotion: ReduceMotion.System,
      }), -1, false, undefined, ReduceMotion.System);
    }
    return () => cancelAnimation(progress);
  }, [active, reducedMotion, progress]);

  const drift = useAnimatedStyle(() => ({
    transform: [
      { translateX: (progress.value % 1) * DRIFT_X },
      { translateY: (progress.value % 1) * DRIFT_Y },
    ],
  }));

  // Project the viewport into the rotated plane, then add the entire drift
  // on BOTH sides. Landscape tablets stay covered at every animation phase.
  const angle = Math.abs(ROTATION) * Math.PI / 180;
  const planeWidth = Math.ceil(width * Math.cos(angle) + height * Math.sin(angle) + 2 * (DRIFT_X + TILE_WIDTH));
  const planeHeight = Math.ceil(width * Math.sin(angle) + height * Math.cos(angle) + 2 * (DRIFT_Y + TILE_HEIGHT));

  return (
    <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.viewport}>
      <View style={{ width: planeWidth, height: planeHeight, left: (width - planeWidth) / 2, top: (height - planeHeight) / 2, transform: [{ rotate: `${ROTATION}deg` }] }}>
        <Animated.View style={drift}>
          <Svg width={planeWidth} height={planeHeight}>
            <Defs>
              <Pattern id="app-hexagons" width={TILE_WIDTH} height={TILE_HEIGHT} patternUnits="userSpaceOnUse">
                <G fill="none" stroke={c.primary} strokeWidth={1} strokeOpacity={0.075}>
                  {/* Edge copies complete hexagons crossing a tile boundary. */}
                  <Polygon points={HEXAGON} />
                  <Polygon points={HEXAGON} transform={`translate(${TILE_WIDTH}, 0)`} />
                  <Polygon points={HEXAGON} transform={`translate(${TILE_WIDTH / 2}, ${TILE_HEIGHT / 2})`} />
                  <Polygon points={HEXAGON} transform={`translate(0, ${TILE_HEIGHT})`} />
                  <Polygon points={HEXAGON} transform={`translate(${TILE_WIDTH}, ${TILE_HEIGHT})`} />
                </G>
              </Pattern>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#app-hexagons)" />
          </Svg>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
});
