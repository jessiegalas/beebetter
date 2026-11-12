import { useCallback, useEffect, useMemo, useState } from 'react';
import { BackHandler, StyleSheet, useWindowDimensions, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { router, useFocusEffect, useIsFocused } from 'expo-router';
import { ScreenFrame, Sheet, StatusMessage, useReducedMotion } from '@/components/mobile-ui';
import { PixelButton } from '@/components/pixel/pixel-button';
import { PixelFrame } from '@/components/pixel/pixel-frame';
import { ThemedText } from '@/components/themed-text';
import { GrowthLeaf } from '@/components/xp-visuals';
import { PixelSpacing, TypographyRoles } from '@/constants/tokens';
import { useBeePalette } from '@/constants/theme';
import { useQuestPriority } from '@/context/quest-priority-context';
import { useUserData } from '@/hooks/use-user-data';
import type { CompletionRecord } from '@/lib/student-workspace';
import { buildStudentSkillTree } from '@/lib/student-skill-tree';
import { acknowledgeGrowth, unseenGrowth } from '@/lib/tree-growth';
import { clampTreeCamera, layoutGeneratedTree, semanticTreeFocus, treeArtwork, treeCameraAtRest, treeScene, zoomTreeAt,
  type Camera, type TreeFocus, type TreeTarget } from '@/prototypes/skill-tree/generated-tree-layout';
import { GeneratedTreeSvg, targetLabel } from '@/prototypes/skill-tree/generated-tree-svg';
import { ProofMedia } from '@/prototypes/skill-tree/proof-root-content';
import { createProofSource, type ProofNode } from '@/prototypes/skill-tree/proof-roots-data';
import { supabase } from '@/supabase';

export default function SkillTreeScreen() {
  const { user, access } = useUserData();
  return user && access === 'active' ? <StudentTree key={user.id} owner={user.id} /> : null;
}

function StudentTree({ owner }: { owner: string }) {
  const { quests, completionHistory, recommendationData, workspaceErrors, retryWorkspace } = useUserData();
  const latestCompletionId = completionHistory[0]?.id;
  const focused = useIsFocused();
  const { width, height, fontScale } = useWindowDimensions();
  const colors = useBeePalette();
  const reducedMotion = useReducedMotion();
  const [loadedHistory, setLoadedHistory] = useState<CompletionRecord[]>();
  const [focus, setFocus] = useState<TreeFocus>({});
  const [manual, setManual] = useState<Camera>();
  const [viewport, setViewport] = useState<{ width: number; height: number }>();
  const [list, setList] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const [leaf, setLeaf] = useState<CompletionRecord | null>(null);
  const [batch, setBatch] = useState<CompletionRecord[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [seenWrite, setSeenWrite] = useState<(() => void) | null>(null);

  // Also re-read if a notification completes a quest while this tab is focused.
  useEffect(() => {
    if (!focused) return;
    const controller = new AbortController();
    const isCurrent = () => !controller.signal.aborted;
    void Promise.resolve().then(async () => {
      if (!isCurrent()) return;
      setLoading(true);
      setError(false);
      setBatch([]);
      setSeenWrite(null);
      try {
        const { data, error: readError } = await supabase.rpc('student_list_completion_history', {
          page_size: 100, page_offset: 0,
        }).abortSignal(controller.signal);
        if (readError) throw readError;
        if (!isCurrent()) return;
        const history = (data ?? []) as CompletionRecord[];
        setLoadedHistory(history);
        const unseen = await unseenGrowth(owner, history, isCurrent);
        if (!isCurrent()) return;
        if (unseen.length && history[0]) {
          const latest = history[0];
          setBatch(unseen);
          setSeenWrite(() => () => {
            void acknowledgeGrowth(owner, latest, history.map(row => row.id), isCurrent).catch(() => {});
          });
        }
      } catch {
        if (isCurrent()) setError(true);
      } finally {
        if (isCurrent()) setLoading(false);
      }
    });
    return () => controller.abort();
  }, [owner, focused, retry, latestCompletionId]);

  const rows = loadedHistory ?? completionHistory;
  const { data, leaves } = useMemo(() => buildStudentSkillTree(quests, rows, recommendationData),
    [quests, rows, recommendationData]);
  const world = useMemo(() => layoutGeneratedTree(data), [data]);
  const selected = data.domains.find(domain => domain.id === focus.domainId);
  const treeFocus = useMemo(() => selected ? focus : {}, [focus, selected]);
  const canvasWidth = viewport?.width ?? Math.min(460, width - 48);
  const canvasHeight = viewport?.height ?? Math.max(160, Math.floor(height / 2));
  const verticalPanRange = Math.min(144, canvasHeight * 0.3);
  const scene = useMemo(() => treeScene(world, data, treeFocus, canvasWidth, canvasHeight, undefined, manual, verticalPanRange),
    [world, data, treeFocus, canvasWidth, canvasHeight, manual, verticalPanRange]);
  const artwork = useMemo(() => treeArtwork(world, data, treeFocus, undefined, undefined, scene.targets),
    [world, data, treeFocus, scene.targets]);
  const needsList = fontScale > 1.3 || width < 240;
  const showList = list || needsList;

  const resetView = useCallback(() => {
    setFocus({});
    setManual(undefined);
  }, []);
  const back = useCallback(() => {
    if (leaf) { setLeaf(null); return true; }
    if (showRecent) { setShowRecent(false); return true; }
    if (!treeFocus.domainId && !manual) return false;
    resetView();
    return true;
  }, [leaf, showRecent, treeFocus.domainId, manual, resetView]);
  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', back);
    return () => subscription.remove();
  }, [back]));

  const select = (target: Pick<TreeTarget, 'kind' | 'id'>) => {
    if (target.kind === 'domain') {
      setFocus({ domainId: target.id });
      setManual(undefined);
    } else if (target.kind === 'quest') {
      const saved = leaves.get(target.id);
      if (saved) setLeaf(saved);
      else router.push({ pathname: '/quests', params: { questId: target.id } });
    }
  };
  const commitCamera = (camera: Camera) => {
    const centered = clampTreeCamera({ x: 0, y: 0, scale: scene.rootScale },
      canvasWidth, canvasHeight, world.width, world.height, scene.rootScale, true);
    if (treeCameraAtRest(camera, centered)) { resetView(); return; }
    setManual(camera);
    setFocus(semanticTreeFocus(world, treeFocus, camera, scene.rootScale, canvasWidth, canvasHeight));
  };
  const minZoom = scene.rootScale;
  const maxZoom = minZoom * 4.8;
  const zoom = (factor: number) => {
    const scale = Math.min(maxZoom, Math.max(minZoom, scene.camera.scale * factor));
    commitCamera(clampTreeCamera(zoomTreeAt(scene.camera, scale, canvasWidth / 2, canvasHeight / 2),
      canvasWidth, canvasHeight, world.width, world.height, scene.rootScale, true, verticalPanRange));
  };
  return <GestureHandlerRootView style={styles.fill}><ScreenFrame tab scroll={showList}>
    <View style={[styles.content, !showList && styles.fill]}>
      <View style={[styles.controls, styles.controlRow]}>
        {(selected || manual) && <PixelButton label="Back" intent="secondary" style={styles.utilityButton}
          labelStyle={TypographyRoles.label} onPress={back} />}
        <ThemedText accessibilityRole="header" accessibilityLiveRegion="polite" style={[TypographyRoles.heading, styles.title]}>
          {selected?.title ?? 'Skill Tree'}
        </ThemedText>
      </View>
      {!needsList && <View style={styles.controls}>
        {!showList && <>
          <PixelButton label="+" accessibilityLabel="Zoom in" intent="secondary" labelStyle={TypographyRoles.label}
            disabled={scene.camera.scale >= maxZoom - 0.001} onPress={() => zoom(1.35)} />
          <PixelButton label="−" accessibilityLabel="Zoom out" intent="secondary" labelStyle={TypographyRoles.label}
            disabled={scene.camera.scale <= minZoom + 0.001} onPress={() => zoom(1 / 1.35)} />
          <PixelButton label="Reset" accessibilityLabel="Reset view" intent="secondary" style={styles.utilityButton}
            labelStyle={TypographyRoles.label} disabled={!selected && !manual} onPress={resetView} />
        </>}
        <PixelButton label={showList ? 'Tree' : 'List'} accessibilityLabel={showList ? 'Show graphic' : 'Browse as list'}
          intent="secondary" style={styles.utilityButton} labelStyle={TypographyRoles.label} onPress={() => setList(!showList)} />
      </View>}
      {loading && !rows.length && <StatusMessage message="Loading your tree…" loading />}
      {(error || workspaceErrors.quests) && <StatusMessage message="Could not refresh your tree." error>
        <PixelButton label="Try again" labelStyle={TypographyRoles.label} onPress={() => {
          if (error) setRetry(value => value + 1);
          if (workspaceErrors.quests) void retryWorkspace('quests');
        }} />
      </StatusMessage>}
      {!!batch.length && seenWrite && <GrowthBatch count={batch.length} onSeen={seenWrite} onClose={() => setBatch([])} />}
      {showList ? <View style={styles.content}>
        {scene.entries.map(entry => <TreeListAction key={entry.id} label={targetLabel(entry)}
          wrapLabel={fontScale > 1.3} onPress={() => select(entry)} />)}
      </View> : <View style={styles.viewportFrame}>
        <View style={styles.viewport} onLayout={({ nativeEvent: { layout } }) => {
          const next = { width: Math.floor(layout.width), height: Math.floor(layout.height) };
          if (next.width > 48 && next.height > 48) setViewport(previous =>
            previous?.width === next.width && previous.height === next.height ? previous : next);
        }}>
          <GeneratedTreeSvg world={world} scene={scene} artwork={artwork} width={canvasWidth} height={canvasHeight}
            reducedMotion={reducedMotion} interactive={focused} singleTap verticalPanRange={verticalPanRange}
            onTarget={select} onCameraChange={commitCamera} />
        </View>
        <View pointerEvents="none" accessible={false} style={StyleSheet.absoluteFill}>
          <PixelFrame appearance="flat" style={styles.fill}
            ramp={{ base: null, highlight: null, shadow: colors.primary, outline: colors.primary }} />
        </View>
      </View>}
      {!loading && (selected ? !scene.entries.length : !data.quests.length) &&
        <ThemedText style={TypographyRoles.body}>Quests will appear here as buds and grow into leaves when completed.</ThemedText>}
      <View style={[styles.controls, !showList && styles.controlRow]}>
        {!!rows.length && <PixelButton label="Recent leaves" intent="secondary" style={styles.footerButton}
          labelStyle={TypographyRoles.label} onPress={() => setShowRecent(true)} />}
        {!showList && scene.entries.length > scene.targets.length && <PixelButton label={selected ? 'More quests' : 'More categories'}
          intent="secondary" style={styles.footerButton} labelStyle={TypographyRoles.label} onPress={() => setList(true)} />}
      </View>
    </View>
    {showRecent && <Sheet title="Recent leaves" visible onClose={() => setShowRecent(false)}>
      {rows.slice(0, 3).map(row => <TreeListAction key={row.id} label={row.title} wrapLabel={fontScale > 1.3} onPress={() => {
        setShowRecent(false);
        setLeaf(row);
      }} />)}
    </Sheet>}
    {leaf && <LeafDetails key={leaf.id} owner={owner} leaf={leaf} wrapLabels={fontScale > 1.3} onClose={() => setLeaf(null)} />}
  </ScreenFrame></GestureHandlerRootView>;
}

function TreeListAction({ label, wrapLabel, onPress }: { label: string; wrapLabel: boolean; onPress: () => void }) {
  if (!wrapLabel) return <PixelButton label={label} intent="secondary" labelStyle={TypographyRoles.label} onPress={onPress} />;
  return <View style={styles.listAction}>
    <ThemedText style={TypographyRoles.body}>{label}</ThemedText>
    <PixelButton label="Open" accessibilityLabel={'Open ' + label} intent="secondary" style={styles.utilityButton}
      labelStyle={TypographyRoles.label} onPress={onPress} />
  </View>;
}

function GrowthBatch({ count, onSeen, onClose }: { count: number; onSeen: () => void; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onSeen, 720);
    return () => clearTimeout(timer);
  }, [onSeen]);
  return <View style={styles.batch} accessibilityLiveRegion="polite">
    <GrowthLeaf animate />
    <ThemedText style={TypographyRoles.label}>{count} {count === 1 ? 'leaf' : 'leaves'} grew while you were away</ThemedText>
    <PixelButton label="Done" intent="secondary" style={styles.utilityButton} labelStyle={TypographyRoles.label}
      onPress={() => { onSeen(); onClose(); }} />
  </View>;
}

function LeafDetails({ owner, leaf, wrapLabels, onClose }: {
  owner: string; leaf: CompletionRecord; wrapLabels: boolean; onClose: () => void;
}) {
  const { quests } = useUserData();
  const { recommendations } = useQuestPriority();
  const [original, setOriginal] = useState<{ id: string; proof_path: string | null; proof_mime_type: string | null } | null>(null);
  const [error, setError] = useState(false);
  const source = useMemo(() => createProofSource(supabase, owner), [owner]);
  useEffect(() => {
    const controller = new AbortController();
    if (leaf.quest_id) {
      void (async () => {
        try {
          const { data, error: readError } = await supabase.from('quests')
            .select('id,proof_path,proof_mime_type').eq('id', leaf.quest_id).eq('owner_id', owner)
            .eq('status', 'completed').abortSignal(controller.signal).maybeSingle();
          if (readError) throw readError;
          if (!controller.signal.aborted) setOriginal(data);
        } catch {
          if (!controller.signal.aborted) setError(true);
        }
      })();
    }
    return () => controller.abort();
  }, [leaf.quest_id, owner]);

  const proof: ProofNode | null = original?.proof_path && original.proof_mime_type &&
    /^(image\/(jpeg|png|webp)|video\/(mp4|quicktime))$/.test(original.proof_mime_type)
    ? { id: original.id, title: leaf.title, completed_at: leaf.completed_at,
      proof_path: original.proof_path, proof_mime_type: original.proof_mime_type }
    : null;
  const followUps = original ? quests.filter(quest => quest.status === 'active' && quest.prerequisite_quest_id === original.id) : [];
  const suggested = !followUps.length ? recommendations.find(item =>
    item.quest.status === 'active' && item.quest.category === leaf.category)?.quest : undefined;
  return <Sheet title={leaf.title} visible onClose={onClose}>
    <ThemedText style={TypographyRoles.metadata}>{leaf.category} · {new Date(leaf.completed_at).toLocaleDateString()}</ThemedText>
    {error && <ThemedText style={TypographyRoles.metadata}>Quest details are unavailable.</ThemedText>}
    {proof && <ProofMedia node={proof} source={source} />}
    {(followUps.length ? followUps : suggested ? [suggested] : []).map(quest =>
      <TreeListAction key={quest.id} label={(followUps.length ? 'Follow-up' : 'Suggested next') + ' · ' + quest.title}
        wrapLabel={wrapLabels} onPress={() => {
          onClose();
          router.push({ pathname: '/quests', params: { questId: quest.id } });
        }} />)}
    {original && <PixelButton label="Add a follow-up" labelStyle={TypographyRoles.label} onPress={() => {
      onClose();
      router.push({ pathname: '/add-quest', params: { after: original.id, afterTitle: leaf.title, category: leaf.category } });
    }} />}
  </Sheet>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { gap: PixelSpacing.px2 },
  viewportFrame: { flex: 1 },
  viewport: { flex: 1, overflow: 'hidden' },
  controls: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: PixelSpacing.px3 },
  controlRow: { minHeight: 48 },
  title: { flex: 1 },
  utilityButton: { width: 84 },
  footerButton: { flexBasis: 135, flexGrow: 1 },
  listAction: { alignItems: 'flex-start', gap: PixelSpacing.px1 },
  batch: { alignItems: 'center', gap: PixelSpacing.px2 },
});
