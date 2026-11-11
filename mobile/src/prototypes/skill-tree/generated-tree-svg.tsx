import { useLayoutEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, Easing, useAnimatedProps, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { ThemedText } from '@/components/themed-text';
import { useBeePalette } from '@/constants/theme';
import { Pixel, TypographyRoles } from '@/constants/tokens';
import { CAMERA_MS, GROWTH_MS, PAN_THRESHOLD, canTapTree, clampTreeCamera, questGlyph, zoomTreeAt, type Camera, type TreeWorld, type TreeTarget } from './generated-tree-layout';

const AnimatedGroup = Animated.createAnimatedComponent(G);
const bark = Pixel.worldTree;
const motion = { duration: CAMERA_MS, easing: Easing.inOut(Easing.cubic) };
type CameraValues = { x: SharedValue<number>; y: SharedValue<number>; scale: SharedValue<number> };

export function targetLabel(target: Pick<TreeTarget, 'title' | 'count' | 'state'>) {
  if (target.count !== undefined) return target.title + ' · ' + target.count;
  switch (target.state) {
    case 'locked': return target.title + ' · Locked';
    case 'completed': return target.title + ' · Completed';
    case 'pending': return target.title + ' · Pending';
    case 'rejected': return target.title + ' · Needs revision';
    default: return target.title + ' · Active';
  }
}

export function GeneratedTreeSvg({ world, scene, artwork, width, height, grownId, reducedMotion, interactive, onTarget, onCameraChange }: {
  world: TreeWorld;
  scene: { camera: Camera; rootScale: number; targets: TreeTarget[]; focusedId?: string };
  artwork: Record<string, string>;
  width: number;
  height: number;
  grownId?: string;
  reducedMotion: boolean;
  interactive: boolean;
  onTarget: (target: TreeTarget) => void;
  onCameraChange: (camera: Camera) => void;
}) {
  const { x, y, scale } = scene.camera;
  const cameraX = useSharedValue(x);
  const cameraY = useSharedValue(y);
  const cameraScale = useSharedValue(scale);
  const growth = useSharedValue(1);
  const panStart = useSharedValue({ x, y });
  const pinchStart = useSharedValue({ x, y, scale, focalX: 0, focalY: 0 });
  const pinching = useSharedValue(false);
  const travel = useSharedValue(0);
  const rootScale = scene.rootScale;
  const worldWidth = world.width, worldHeight = world.height;
  const grown = grownId ? world.byId.get(grownId) : undefined;
  const growX = grown?.x ?? 0, growY = grown?.y ?? 0;
  useLayoutEffect(() => {
    cameraX.value = reducedMotion ? x : withTiming(x, motion);
    cameraY.value = reducedMotion ? y : withTiming(y, motion);
    cameraScale.value = reducedMotion ? scale : withTiming(scale, motion);
  }, [cameraX, cameraY, cameraScale, reducedMotion, x, y, scale]);
  useLayoutEffect(() => {
    growth.value = !grownId || reducedMotion ? 1 : 0;
    if (grownId && !reducedMotion) growth.value = withTiming(1, { duration: GROWTH_MS });
  }, [grownId, growth, reducedMotion]);
  const worldTransform = useAnimatedStyle(() => ({
    transform: [{ translateX: cameraX.value }, { translateY: cameraY.value }, { scale: cameraScale.value }],
  }));
  const near = useAnimatedProps(() => ({
    opacity: Math.max(0, Math.min(1, (cameraScale.value / rootScale - 1.2) / 0.45)),
  }));
  const revealStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.5 + Math.floor(growth.value * 4) / 8 }],
  }));
  const batches = Object.entries(artwork);
  const applyCamera = (next: Camera) => {
    'worklet';
    const bounded = clampTreeCamera(next, width, height, worldWidth, worldHeight, rootScale);
    cameraX.set(bounded.x);
    cameraY.set(bounded.y);
    cameraScale.set(bounded.scale);
  };
  const freezeCamera = () => {
    'worklet';
    cancelAnimation(cameraX); cancelAnimation(cameraY); cancelAnimation(cameraScale);
  };
  const settle = () => {
    'worklet';
    const rest = clampTreeCamera({ x: cameraX.value, y: cameraY.value, scale: cameraScale.value },
      width, height, worldWidth, worldHeight, rootScale, true);
    scheduleOnRN(onCameraChange, rest);
  };
  const pan = Gesture.Pan().enabled(interactive).maxPointers(1).minDistance(PAN_THRESHOLD)
    .onStart(() => { freezeCamera(); panStart.value = { x: cameraX.value, y: cameraY.value }; travel.value = PAN_THRESHOLD; })
    .onUpdate(event => {
      if (!pinching.value) applyCamera({ x: panStart.value.x + event.translationX,
        y: panStart.value.y + event.translationY, scale: cameraScale.value });
    }).onEnd(() => { if (!pinching.value) settle(); });
  const pinch = Gesture.Pinch().enabled(interactive)
    .onStart(event => {
      freezeCamera(); pinching.value = true; travel.value = PAN_THRESHOLD;
      pinchStart.value = { x: cameraX.value, y: cameraY.value, scale: cameraScale.value, focalX: event.focalX, focalY: event.focalY };
    }).onUpdate(event => {
      const start = pinchStart.value;
      const zoom = Math.min(rootScale * 4.8, Math.max(rootScale, start.scale * event.scale));
      const anchored = zoomTreeAt(start, zoom, start.focalX, start.focalY);
      applyCamera({ x: anchored.x + event.focalX - start.focalX, y: anchored.y + event.focalY - start.focalY, scale: zoom });
    }).onFinalize(() => { if (pinching.value) { pinching.value = false; settle(); } });
  const hit = (px: number, py: number, pose: Camera, double: boolean) => {
    const target = scene.targets.find(item => {
      const left = item.x * pose.scale + pose.x - item.width / 2;
      const top = item.y * pose.scale + pose.y + item.topOffset;
      return px >= left && px <= left + item.width && py >= top && py <= top + item.height;
    });
    if (target && (!double || target.kind !== 'quest')) onTarget(target);
  };
  const tap = (count: number) => Gesture.Tap().enabled(interactive).numberOfTaps(count).maxDistance(PAN_THRESHOLD)
    .onBegin(() => { travel.value = 0; })
    .onEnd((event, success) => {
      if (success && canTapTree(travel.value)) scheduleOnRN(hit, event.x, event.y,
        { x: cameraX.value, y: cameraY.value, scale: cameraScale.value }, count === 2);
    });
  const gestures = Gesture.Race(Gesture.Simultaneous(pan, pinch), Gesture.Exclusive(tap(2), tap(1)));
  const draw = (path: string, key: string) => {
    const [kind, tone] = key.split(':');
    const isEdge = kind === 'fork' || kind === 'detail' || kind === 'vein';
    const isLimb = kind === 'branch' || kind === 'line';
    const isGlyph = kind.startsWith('glyph-');
    const wood = tone === 'highlight' ? bark.barkHighlight : bark.barkMid;
    const fill = isLimb ? wood : kind === 'wrap' ? bark.barkDeep
      : kind === 'glyph-completed' ? bark.leafBase
      : kind === 'glyph-active' ? bark.barkHighlight
      : kind === 'glyph-locked' ? bark.barkLight : bark.barkShade;
    return <Path key={key} d={path} opacity={tone === 'dim' ? 0.30 : 1}
      fill={isEdge ? 'none' : fill}
      stroke={kind === 'vein' ? bark.leafHighlight : isEdge ? wood : isLimb || isGlyph ? bark.barkOutline : undefined}
      strokeWidth={kind === 'fork' ? 2.4 : isEdge ? 1.2 : isLimb ? 0.8 : isGlyph ? 0.6 : undefined} />;
  };
  return <GestureDetector gesture={gestures}><View collapsable={false} style={[styles.scene, { width, height }]}>
    <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
      <Animated.View style={[styles.world, { width: world.width, height: world.height }, worldTransform]}>
        <Svg width={world.width} height={world.height} viewBox={`0 0 ${world.width} ${world.height}`}>
          {batches.filter(([key]) => key.startsWith('fork:')).map(([key, path]) => draw(path, key))}
          {batches.filter(([key]) => /^(branch|line|detail):/.test(key)).map(([key, path]) => draw(path, key))}
          <Path d={world.roots} fill={bark.barkShade} stroke={bark.barkOutline} strokeWidth={0.7} />
          <Path d={world.trunk} fill={bark.barkMid} stroke={bark.barkOutline} strokeWidth={1} />
          <Path d={world.trunkLight} fill={bark.barkLight} />
          {batches.filter(([key]) => key.startsWith('glyph-')).map(([key, path]) => draw(path, key))}
          {batches.filter(([key]) => key.startsWith('wrap:')).map(([key, path]) => draw(path, key))}
          <AnimatedGroup animatedProps={near}>
            {batches.filter(([key]) => !key.endsWith(':dim') && key.startsWith('vein:')).map(([key, path]) => draw(path, key))}
          </AnimatedGroup>
        </Svg>
        {grown && <Animated.View style={[styles.reveal, { left: growX - 7, top: growY - 7 }, revealStyle]}>
          <Svg width={14} height={14} viewBox={`${growX - 7} ${growY - 7} 14 14`}>
            <Path d={questGlyph(grown, 'completed')} fill={bark.leafHighlight} stroke={bark.barkOutline} strokeWidth={0.7} />
          </Svg>
        </Animated.View>}
      </Animated.View>
    </View>
    {scene.targets.map(target => <CameraTarget key={target.kind + ':' + target.id}
      target={target} camera={{ x: cameraX, y: cameraY, scale: cameraScale }} destination={scene.camera} onTarget={onTarget} />)}
  </View></GestureDetector>;
}

function CameraTarget({ target, camera, destination, onTarget }: {
  target: TreeTarget; camera: CameraValues; destination: Camera;
  onTarget: (target: TreeTarget) => void;
}) {
  const colors = useBeePalette();
  const position = useAnimatedStyle(() => {
    const x = target.x * camera.scale.value + camera.x.value;
    const y = target.y * camera.scale.value + camera.y.value;
    const distance = Math.max(Math.abs(camera.x.value - destination.x), Math.abs(camera.y.value - destination.y),
      Math.abs(camera.scale.value - destination.scale) * 80);
    return { opacity: Math.max(0, 1 - distance / 48),
      transform: [{ translateX: x - target.width / 2 }, { translateY: y + target.topOffset }] };
  });
  return <Animated.View pointerEvents="none" style={[styles.target, { width: target.width, height: target.height }, position]}>
    <Pressable cssInterop={false} accessibilityRole="button" accessibilityLabel={targetLabel(target)}
      accessibilityHint={target.prerequisiteLabel} onPress={() => {
        if (Math.abs(camera.scale.value - destination.scale) < 0.03 &&
          Math.abs(camera.x.value - destination.x) < 3 && Math.abs(camera.y.value - destination.y) < 3) onTarget(target);
      }} style={styles.pressable}>
      {target.showTitle && <ThemedText numberOfLines={2} style={[TypographyRoles.metadata, styles.label, {
        color: colors.foreground, textShadowColor: colors.background,
        textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 3,
      }]}>{target.count === undefined ? target.title : targetLabel(target)}</ThemedText>}
    </Pressable>
  </Animated.View>;
}

const styles = StyleSheet.create({
  scene: { alignSelf: 'center', overflow: 'hidden' },
  world: { position: 'absolute', top: 0, left: 0, transformOrigin: 'top left' },
  reveal: { position: 'absolute' },
  target: { position: 'absolute', top: 0, left: 0 },
  pressable: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  label: { paddingHorizontal: 3, textAlign: 'center' },
});
