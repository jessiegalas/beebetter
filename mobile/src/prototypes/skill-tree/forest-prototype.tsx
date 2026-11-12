import { useCallback, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type ViewToken } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusMessage, useReducedMotion } from '@/components/mobile-ui';
import { PixelButtonSvg } from '@/components/pixel/pixel-button-svg';
import { useBeePalette } from '@/constants/theme';
import { Pixel, PixelSpacing, TypographyRoles, artPixelsToDp } from '@/constants/tokens';
import { DOMAINS, TREE_SIZE, overviewCanopyTargets, treeSceneLayout, type DomainId } from './forest-model';
import { TREE_PALETTE, WorldTreeArt, WorldTreeGround, WorldTreeName, WorldTreeSky } from './world-tree-art';
import { WorldTreeClouds, WorldTreeGrass, WorldTreeSun } from './world-tree-scenery';
import { WorldTreeSoilDetails } from './world-tree-soil';
import { ProofRootNode, ProofViewer } from './proof-root-content';
import { withProofNote, type ProofNode, type ProofSource } from './proof-roots-data';
import { useProofRoots } from './use-proof-roots';
import { RootKnot, RootStem, rootNodeLayout } from './world-tree-root-art';

export default function ForestPrototype({ source }: { source: ProofSource }) {
  const c = useBeePalette();
  const { width, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const scroll = useRef<FlatList<ProofNode>>(null);
  const [viewport, setViewport] = useState({ width, height: 0 });
  const [soilContentHeight, setSoilContentHeight] = useState(0);
  const [opened, setOpened] = useState<ProofNode | null>(null);
  const [notes, setNotes] = useState(() => new Map<string, string>());
  const [visible, setVisible] = useState<ReadonlySet<string>>(() => new Set());
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken<ProofNode>[] }) => {
    setVisible(new Set(viewableItems.map(item => item.key)));
  }, []);
  const [selected, setSelected] = useState<DomainId | null>(null);
  const [focused, setFocused] = useState<DomainId | null>(null);
  const [hovered, setHovered] = useState<DomainId | null>(null);
  const [pressed, setPressed] = useState<DomainId | null>(null);
  const root = useProofRoots(source, selected);
  const active = hovered ?? pressed ?? focused ?? selected;
  const select = (id: DomainId) => {
    if (id !== selected) setOpened(null);
    setSelected(id);
    setFocused(null);
    scroll.current?.scrollToOffset({ offset: viewport.height, animated: !reducedMotion });
  };
  const layout = treeSceneLayout(viewport.width, viewport.height);
  const groundTop = layout.rootLine - artPixelsToDp(24);
  const soilStart = groundTop + artPixelsToDp(12);
  const soilOverviewHeight = Math.max(0, viewport.height - soilStart);
  const soilWorldHeight = soilOverviewHeight + Math.max(132, soilContentHeight);
  const largeText = fontScale > 1.3;
  const { axis } = rootNodeLayout(viewport.width, 0, largeText);
  const hasNodes = root.nodes.length > 0;
  const backToTree = () => scroll.current?.scrollToOffset({ offset: 0, animated: !reducedMotion });

  return <SafeAreaView edges={['left', 'right']} style={s.root}>
    <FlatList ref={scroll} testID="world-tree-scroll" style={s.scroll} bounces={false} overScrollMode="never" removeClippedSubviews={false}
      data={root.nodes} keyExtractor={node => node.id} onViewableItemsChanged={onViewableItemsChanged}
      contentContainerStyle={{ minHeight: viewport.height * 2, paddingBottom: insets.bottom + PixelSpacing.px6 }}
      renderItem={({ item, index }) => <ProofRootNode node={item} index={index} width={viewport.width}
        largeText={largeText} visible={visible.has(item.id)} last={index === root.nodes.length - 1 && !root.next}
        source={source} onOpen={setOpened} />}
      keyboardShouldPersistTaps="handled" onLayout={({ nativeEvent: { layout: measured } }) =>
      setViewport(previous => previous.width === measured.width && previous.height === measured.height ? previous : { width: measured.width, height: measured.height })}
      ListHeaderComponent={<>
        <View testID="world-tree-overview" style={[s.scene, { height: viewport.height }]}>
          <View pointerEvents="none" style={s.sky}><WorldTreeSky width={viewport.width} height={viewport.height} /></View>
          {viewport.height > 0 && <>
            <View testID="world-tree-sun-layer" pointerEvents="none" style={s.sky}><WorldTreeSun width={viewport.width} height={viewport.height} /></View>
            <View testID="world-tree-cloud-layer" pointerEvents="none" style={s.sky}><WorldTreeClouds width={viewport.width} height={viewport.height} /></View>
            <View testID="world-tree-soil-fill" pointerEvents="none" style={[s.soilFill, { top: groundTop + artPixelsToDp(12) }]} />
            <View testID="world-tree-root-soil" pointerEvents="none" style={[s.ground, { top: groundTop }]}>
              <WorldTreeGround width={viewport.width} />
            </View>
            <View testID="world-tree-soil-details" pointerEvents="none" style={[s.soilDetails, { top: soilStart }]}>
              <WorldTreeSoilDetails width={viewport.width} height={soilOverviewHeight} worldHeight={soilWorldHeight} />
            </View>
            <View testID="world-tree-grass-layer" pointerEvents="none" style={[s.grass, { top: groundTop - PixelSpacing.px3 }]}>
              <WorldTreeGrass width={viewport.width} />
            </View>
            {selected && <RootStem axis={axis} top={Math.min(viewport.height, layout.top + TREE_SIZE.height - 18)} />}
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
        {viewport.height > 0 && <View testID="world-tree-soil-content"
          onLayout={({ nativeEvent: { layout: measured } }) => setSoilContentHeight(previous => previous === measured.height ? previous : measured.height)} style={[s.futureContent, {
          minHeight: 132, paddingBottom: PixelSpacing.px6,
        }]}>
          <View testID="world-tree-deep-soil-details" pointerEvents="none" style={s.soilDetails}>
            <WorldTreeSoilDetails width={viewport.width} height={Math.max(132, soilContentHeight)} worldHeight={soilWorldHeight} offsetY={soilOverviewHeight} />
          </View>
          {selected && <><RootStem axis={axis} end={!hasNodes} /><RootKnot axis={axis} top={12} /></>}
          <PixelButtonSvg label="Back to tree" intent="secondary" style={s.back} onPress={backToTree} />
          <Text accessibilityRole="header" style={[TypographyRoles.heading, s.rootHeading]}>{DOMAINS.find(domain => domain.id === selected)?.name ?? 'Your branches'}</Text>
        </View>}
      </>}
      ListFooterComponent={selected ? <View style={s.footer}>
        {root.loading && <View style={[s.status, { backgroundColor: c.background }]}><StatusMessage message="Loading completions…" loading /></View>}
        {root.error && <View style={[s.status, { backgroundColor: c.background }]}><StatusMessage message="Could not load completions." error>
          <PixelButtonSvg label="Retry completions" intent="secondary" onPress={root.load} />
        </StatusMessage></View>}
        {!root.loading && !root.error && !root.next && !hasNodes
          && <Text style={[TypographyRoles.body, s.soilText]}>No completed quests with photo or video proof yet.</Text>}
        {!root.loading && !root.error && root.next
          && <PixelButtonSvg label="Load older completions" intent="secondary" onPress={root.load} />}
      </View> : null}
    />
    {opened && <ProofViewer key={opened.id} node={opened} source={source} note={notes.get(opened.id) ?? ''}
      onClose={() => setOpened(null)} onSave={(id, note) => setNotes(current => withProofNote(current, id, note))} />}
  </SafeAreaView>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: TREE_PALETTE.foreground },
  scroll: { flex: 1, backgroundColor: TREE_PALETTE.foreground },
  scene: { overflow: 'hidden', backgroundColor: Pixel.worldTree.skyTop },
  sky: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  soilFill: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: TREE_PALETTE.foreground },
  soilDetails: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  ground: { position: 'absolute', left: 0, right: 0, height: artPixelsToDp(12) },
  grass: { position: 'absolute', left: 0, right: 0, height: artPixelsToDp(16) },
  art: { position: 'absolute', width: TREE_SIZE.width, height: TREE_SIZE.height },
  callout: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  legend: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: TREE_PALETTE.foreground },
  legendItem: { minHeight: PixelSpacing.px16, justifyContent: 'center' },
  futureContent: { backgroundColor: TREE_PALETTE.foreground, paddingHorizontal: PixelSpacing.px6, paddingTop: PixelSpacing.px12, gap: PixelSpacing.px6 },
  back: { alignSelf: 'flex-start' },
  rootHeading: { alignSelf: 'flex-start', color: TREE_PALETTE.background, backgroundColor: TREE_PALETTE.foreground, paddingRight: PixelSpacing.px3 },
  footer: { gap: PixelSpacing.px4, alignItems: 'center', paddingHorizontal: PixelSpacing.px6, paddingTop: PixelSpacing.px6 },
  status: { borderRadius: 3 },
  soilText: { color: TREE_PALETTE.background, textAlign: 'center' },
});
