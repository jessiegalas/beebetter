import { useCallback, useEffect, useMemo, useState } from 'react';
import { BackHandler, StyleSheet, useWindowDimensions, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Redirect, useFocusEffect } from 'expo-router';
import { Button, IconButton, ScreenFrame, Sheet, useReducedMotion } from '@/components/mobile-ui';
import { ThemedText } from '@/components/themed-text';
import { PixelSpacing, TypographyRoles } from '@/constants/tokens';
import { generatedTreeFixtures } from '@/prototypes/skill-tree/generated-tree-fixtures';
import { CAMERA_MS, GROWTH_MS, clampTreeCamera, layoutGeneratedTree, semanticTreeFocus, treeArtwork, treeScene, zoomTreeAt, type Camera, type TreeFocus, type TreeTarget } from '@/prototypes/skill-tree/generated-tree-layout';
import { GeneratedTreeSvg, targetLabel } from '@/prototypes/skill-tree/generated-tree-svg';

export default function GeneratedTreePreviewRoute() {
  return __DEV__ ? <FixturePreview /> : <Redirect href="/" />;
}

function FixturePreview() {
  const [fixtureIndex, setFixtureIndex] = useState(2);
  const [focus, setFocus] = useState<TreeFocus>({});
  const [manual, setManual] = useState<Camera>();
  const [viewport, setViewport] = useState<{ width: number; height: number }>();
  const [fixturesOpen, setFixturesOpen] = useState(false);
  const [list, setList] = useState(false);
  const [leaf, setLeaf] = useState<string>();
  const [finished, setFinished] = useState<string[]>([]);
  const [reveal, setReveal] = useState<{ id: string; stage: 'approach' | 'grow' }>();
  const fixture = generatedTreeFixtures[fixtureIndex];
  const { width, height, fontScale } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const needsList = fontScale > 1.3 || width < 240;
  const showList = list || needsList;
  const data = useMemo(() => ({
    ...fixture.data,
    quests: fixture.data.quests.map(quest => finished.includes(quest.id) ? { ...quest, state: 'completed' as const }
      : quest.state === 'locked' && quest.prerequisiteId && finished.includes(quest.prerequisiteId)
        ? { ...quest, state: 'active' as const } : quest),
  }), [fixture, finished]);
  const world = useMemo(() => layoutGeneratedTree(fixture.data), [fixture]);
  const canvasWidth = viewport?.width ?? Math.min(460, width - 48);
  const canvasHeight = viewport?.height ?? Math.max(160, Math.floor(height * 0.5));
  const grownId = reveal?.stage === 'grow' ? reveal.id : undefined;
  const scene = useMemo(() => treeScene(world, data, focus, canvasWidth, canvasHeight, reveal?.id, reveal ? undefined : manual),
    [world, data, focus, canvasWidth, canvasHeight, reveal, manual]);
  const artwork = useMemo(() => treeArtwork(world, data, focus, reveal?.id, grownId),
    [world, data, focus, reveal?.id, grownId]);
  useEffect(() => {
    if (!reveal) return;
    const timer = setTimeout(() => {
      if (reveal.stage === 'approach') {
        setFinished(previous => [...previous, reveal.id]);
        setReveal({ id: reveal.id, stage: 'grow' });
      } else {
        setFocus({}); setManual(undefined);
        setReveal(undefined);
      }
    }, reveal.stage === 'approach' ? reducedMotion ? 0 : CAMERA_MS + 40 : GROWTH_MS + 160);
    return () => clearTimeout(timer);
  }, [reveal, reducedMotion]);
  const domain = data.domains.find(item => item.id === focus.domainId);
  const line = data.lines.find(item => item.id === focus.lineId);
  const opened = scene.entries.find(item => item.id === leaf && item.kind === 'quest');
  const back = useCallback(() => {
    if (leaf) { setLeaf(undefined); return true; }
    if (reveal) { setReveal(undefined); return true; }
    if (focus.lineId) { setFocus({ domainId: focus.domainId }); setManual(undefined); return true; }
    if (focus.domainId || manual) { setFocus({}); setManual(undefined); return true; }
    return false;
  }, [focus, leaf, manual, reveal]);
  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', back);
    return () => subscription.remove();
  }, [back]));

  const select = (target: Pick<TreeTarget, 'kind' | 'id'>) => {
    if (reveal) return;
    if (target.kind === 'quest') { setLeaf(target.id); return; }
    setManual(undefined);
    setFocus(target.kind === 'domain' ? { domainId: target.id } : { domainId: focus.domainId, lineId: target.id });
  };
  const commitCamera = (camera: Camera) => {
    if (reveal) return;
    setManual(camera);
    setFocus(semanticTreeFocus(world, focus, camera, scene.rootScale, canvasWidth, canvasHeight));
  };
  const zoom = (factor: number) => {
    const scale = Math.min(scene.rootScale * 4.8, Math.max(scene.rootScale, scene.camera.scale * factor));
    commitCamera(clampTreeCamera(zoomTreeAt(scene.camera, scale, canvasWidth / 2, canvasHeight / 2),
      canvasWidth, canvasHeight, world.width, world.height, scene.rootScale, true));
  };
  return <GestureHandlerRootView style={styles.root}><ScreenFrame scroll={showList}>
    <View style={[styles.content, !showList && styles.root]}>
    <ThemedText accessibilityRole="header" style={TypographyRoles.heading}>Generated tree preview</ThemedText>
    <Button label={'Fixtures · ' + fixture.label} intent="quiet" onPress={() => setFixturesOpen(value => !value)} />
    {fixturesOpen && (
      <View style={styles.controls}>
        {generatedTreeFixtures.map((option, index) => <Button key={option.label} label={option.label}
          intent={fixtureIndex === index ? 'primary' : 'quiet'} onPress={() => {
            setFixtureIndex(index); setFocus({}); setManual(undefined); setFinished([]); setLeaf(undefined);
            setList(false); setReveal(undefined); setFixturesOpen(false);
          }} />)}
      </View>
    )}
    <View style={styles.heading}>
      <View style={styles.breadcrumb}>
        <View style={styles.backSlot}>
          {(focus.domainId || manual) && <IconButton label="Back" icon="arrow-back" onPress={back} />}
        </View>
        <ThemedText accessibilityRole="header" accessibilityLiveRegion="polite" numberOfLines={showList ? undefined : 1}
          style={[TypographyRoles.heading, styles.breadcrumbTitle]}>
          {line ? domain?.title + ' / ' + line.title : domain?.title ?? 'Your tree'}
        </ThemedText>
      </View>
      <View style={styles.controls}>
        {!showList && <>
          <IconButton label="Zoom in" icon="add" disabled={!!reveal} onPress={() => zoom(1.35)} />
          <IconButton label="Zoom out" icon="remove" disabled={!!reveal} onPress={() => zoom(1 / 1.35)} />
          <IconButton label="Reset view" icon="refresh" disabled={!!reveal} onPress={() => { setFocus({}); setManual(undefined); }} />
        </>}
        {!needsList && <Button label={showList ? 'Show graphic' : 'Browse as list'} intent="quiet" disabled={!!reveal} onPress={() => setList(!showList)} />}
      </View>
    </View>
    {showList ? <View style={styles.list}>
      {scene.entries.map(entry => <Button key={entry.kind + ':' + entry.id} label={targetLabel(entry)}
        intent="quiet" onPress={() => select(entry)} />)}
    </View> : <>
      <View style={styles.viewport} onLayout={({ nativeEvent: { layout } }) => {
        const next = { width: Math.floor(layout.width), height: Math.floor(layout.height) };
        if (next.width > 48 && next.height > 48) setViewport(previous =>
          previous?.width === next.width && previous.height === next.height ? previous : next);
      }}>
        <GeneratedTreeSvg world={world} scene={scene} artwork={artwork} width={canvasWidth} height={canvasHeight}
          grownId={grownId} reducedMotion={reducedMotion} interactive={!reveal} onTarget={select} onCameraChange={commitCamera} />
      </View>
      <View style={styles.overflow}>
      {!reveal && scene.entries.length > scene.targets.length && <Button
        label={line ? 'More quests' : domain ? 'More in ' + domain.title : 'More domains'}
        onPress={() => setList(true)} />}
      </View>
    </>}
    {!scene.entries.length && <ThemedText style={TypographyRoles.body}>No quests in this branch yet.</ThemedText>}
    {opened && <Sheet title={opened.title} visible onClose={() => setLeaf(undefined)}>
      <ThemedText style={TypographyRoles.body}>{targetLabel(opened).slice(opened.title.length + 3)}</ThemedText>
      {opened.prerequisiteLabel && <ThemedText style={TypographyRoles.body}>{opened.prerequisiteLabel}</ThemedText>}
      {opened.state === 'active' && <Button label="Simulate completion" onPress={() => {
        setLeaf(undefined);
        if (needsList) { setFinished(previous => [...previous, opened.id]); return; }
        setList(false); setManual(undefined);
        setReveal({ id: opened.id, stage: 'approach' });
      }} />}
    </Sheet>}
    </View>
  </ScreenFrame></GestureHandlerRootView>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { gap: PixelSpacing.px3 },
  viewport: { flex: 1, overflow: 'hidden' },
  overflow: { minHeight: 48 },
  heading: { gap: PixelSpacing.px2 },
  breadcrumb: { flexDirection: 'row', alignItems: 'center', minHeight: 48 },
  breadcrumbTitle: { flex: 1 },
  backSlot: { width: 48 },
  controls: { flexDirection: 'row', flexWrap: 'wrap', gap: PixelSpacing.px2 },
  list: { gap: PixelSpacing.px1 },
});
