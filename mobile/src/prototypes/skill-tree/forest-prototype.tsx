import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from '@/components/mobile-ui';
import { PixelButtonSvg } from '@/components/pixel/pixel-button-svg';
import { Pixel, PixelSpacing, TypographyRoles, artPixelsToDp } from '@/constants/tokens';
import { DOMAINS, TREE_SIZE, overviewCanopyTargets, treeSceneLayout, type DomainId } from './forest-model';
import { TREE_PALETTE, WorldTreeArt, WorldTreeGround, WorldTreeName, WorldTreeSky } from './world-tree-art';
import { WorldTreeClouds, WorldTreeGrass, WorldTreeSun } from './world-tree-scenery';

/** One scrolling world: tree overview above, reserved soil content below. */
export default function ForestPrototype() {
  const { width, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const scroll = useRef<ScrollView>(null);
  const [viewport, setViewport] = useState({ width, height: 0 });
  const [selected, setSelected] = useState<DomainId | null>(null);
  const [focused, setFocused] = useState<DomainId | null>(null);
  const [hovered, setHovered] = useState<DomainId | null>(null);
  const [pressed, setPressed] = useState<DomainId | null>(null);
  const active = hovered ?? pressed ?? focused ?? selected;
  const select = (id: DomainId) => {
    setSelected(id);
    setFocused(null);
    scroll.current?.scrollTo({ x: 0, y: viewport.height, animated: !reducedMotion });
  };
  const layout = treeSceneLayout(viewport.width, viewport.height);
  const groundTop = layout.rootLine - artPixelsToDp(24);
  const largeText = fontScale > 1.3;

  return <SafeAreaView edges={['left', 'right']} style={s.root}>
    <ScrollView ref={scroll} testID="world-tree-scroll" style={s.scroll} bounces={false} overScrollMode="never" removeClippedSubviews={false}
      keyboardShouldPersistTaps="handled" onLayout={({ nativeEvent: { layout: measured } }) =>
      setViewport(previous => previous.width === measured.width && previous.height === measured.height ? previous : { width: measured.width, height: measured.height })}>
    <View testID="world-tree-overview" style={[s.scene, { height: viewport.height }]}>
      <View pointerEvents="none" style={s.sky}><WorldTreeSky width={viewport.width} height={viewport.height} /></View>
      {viewport.height > 0 && <>
        <View testID="world-tree-sun-layer" pointerEvents="none" style={s.sky}><WorldTreeSun width={viewport.width} height={viewport.height} /></View>
        <View testID="world-tree-cloud-layer" pointerEvents="none" style={s.sky}><WorldTreeClouds width={viewport.width} height={viewport.height} /></View>
        <View testID="world-tree-soil-fill" pointerEvents="none" style={[s.soilFill, { top: groundTop + artPixelsToDp(12) }]} />
        <View testID="world-tree-root-soil" pointerEvents="none" style={[s.ground, { top: groundTop }]}>
          <WorldTreeGround width={viewport.width} />
        </View>
        <View testID="world-tree-grass-layer" pointerEvents="none" style={[s.grass, { top: groundTop - PixelSpacing.px3 }]}>
          <WorldTreeGrass width={viewport.width} />
        </View>
        <View testID="tree-art-canvas" pointerEvents="none" style={[s.art, { left: layout.left, top: layout.top }]}><WorldTreeArt active={active} /></View>
        {overviewCanopyTargets(viewport.width, layout.top).map(target => <Pressable cssInterop={false} key={target.id}
          testID={'domain-canopy-' + target.id} accessibilityRole="button" accessibilityLabel={'Explore ' + target.name}
          accessibilityHint="Scrolls to this domain's soil area" accessibilityState={{ selected: selected === target.id }}
          onPress={() => select(target.id)} onFocus={() => setFocused(target.id)} onBlur={() => setFocused(null)}
          onHoverIn={() => setHovered(target.id)} onHoverOut={() => setHovered(null)}
          onPressIn={() => setPressed(target.id)} onPressOut={() => setPressed(null)}
          style={{ position: 'absolute', left: target.x, top: target.y, width: target.width, height: target.height }}>
          {!largeText && <View pointerEvents="none" style={[s.callout, { width: target.width, height: target.height,
            left: target.labelX - target.x - target.width / 2, top: target.labelY - target.y - target.height / 2 }]}>
            <WorldTreeName name={target.name} width={target.width} fontScale={fontScale} active={active === target.id} />
          </View>}
        </Pressable>)}
        {largeText && <ScrollView testID="world-tree-large-labels" style={[s.legend, { top: layout.top + TREE_SIZE.height }]}
          contentContainerStyle={{ paddingHorizontal: PixelSpacing.px6, paddingBottom: insets.bottom + PixelSpacing.px6 }}>
          {DOMAINS.map(domain => <Pressable cssInterop={false} key={domain.id} accessibilityRole="button"
            accessibilityLabel={'Explore ' + domain.name} accessibilityState={{ selected: selected === domain.id }}
            onPress={() => select(domain.id)} onFocus={() => setFocused(domain.id)} onBlur={() => setFocused(null)}
            onHoverIn={() => setHovered(domain.id)} onHoverOut={() => setHovered(null)}
            onPressIn={() => setPressed(domain.id)} onPressOut={() => setPressed(null)} style={s.legendItem}>
            <Text style={[TypographyRoles.label, { color: TREE_PALETTE.background }]}>{domain.name}</Text>
          </Pressable>)}
        </ScrollView>}
      </>}
    </View>
    {viewport.height > 0 && <View testID="world-tree-soil-content" style={[s.futureContent, {
      minHeight: viewport.height, paddingBottom: insets.bottom + PixelSpacing.px6,
    }]}>
      <PixelButtonSvg label="Back to tree" intent="secondary" style={s.back}
        onPress={() => scroll.current?.scrollTo({ x: 0, y: 0, animated: !reducedMotion })} />
      <Text accessibilityRole="header" style={[TypographyRoles.heading, s.soilText]}>{DOMAINS.find(domain => domain.id === selected)?.name ?? 'Your branches'}</Text>
      <Text style={[TypographyRoles.body, s.soilText]}>Reserved for future content.</Text>
    </View>}
    </ScrollView>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: TREE_PALETTE.foreground },
  scroll: { flex: 1, backgroundColor: TREE_PALETTE.foreground },
  scene: { overflow: 'hidden', backgroundColor: Pixel.worldTree.skyTop },
  sky: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  soilFill: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: TREE_PALETTE.foreground },
  ground: { position: 'absolute', left: 0, right: 0, height: artPixelsToDp(12) },
  grass: { position: 'absolute', left: 0, right: 0, height: artPixelsToDp(16) },
  art: { position: 'absolute', width: TREE_SIZE.width, height: TREE_SIZE.height },
  callout: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  legend: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: TREE_PALETTE.foreground },
  legendItem: { minHeight: PixelSpacing.px16, justifyContent: 'center' },
  futureContent: { backgroundColor: TREE_PALETTE.foreground, paddingHorizontal: PixelSpacing.px6, paddingTop: PixelSpacing.px12, gap: PixelSpacing.px6 },
  back: { alignSelf: 'flex-start' },
  soilText: { color: TREE_PALETTE.background },
});
