import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Sheet, StatusMessage } from '@/components/mobile-ui';
import { PixelButtonSvg } from '@/components/pixel/pixel-button-svg';
import { PixelFrame } from '@/components/pixel/pixel-frame';
import { Fonts, useBeePalette } from '@/constants/theme';
import { Pixel, PixelBorders, PixelSpacing, TypographyRoles } from '@/constants/tokens';
import type { ProofNode, ProofSource } from './proof-roots-data';
import { useProofUrl } from './use-proof-roots';
import { RootKnot, RootStem, rootNodeLayout } from './world-tree-root-art';

const imageProof = (node: ProofNode) => node.proof_mime_type.startsWith('image/');
const frame = { shadow: Pixel.worldTree.barkDeep, outline: Pixel.worldTree.barkMid, highlight: null };

export function ProofRootNode({ node, index, width, largeText, visible, last, source, onOpen }: {
  node: ProofNode;
  index: number;
  width: number;
  largeText: boolean;
  visible: boolean;
  last: boolean;
  source: ProofSource;
  onOpen: (node: ProofNode) => void;
}) {
  const c = useBeePalette();
  const [focused, setFocused] = useState(false);
  const { axis, side, nodeWidth, left } = rootNodeLayout(width, index, largeText);
  const date = node.completed_at ? new Date(node.completed_at).toLocaleDateString() : null;
  const photo = imageProof(node);

  return <View style={styles.row}>
    <RootStem axis={axis} end={last} />
    <RootKnot axis={axis} top={side ? 48 : 3} side={side} />
    <Pressable accessibilityRole="button" accessibilityLabel={`${node.title}, ${photo ? 'photo' : 'video'} proof${date ? ', ' + date : ''}`}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onPress={() => onOpen(node)}
      style={({ pressed }) => ({ width: nodeWidth, marginLeft: left, opacity: pressed ? 0.85 : 1 })}>
      <PixelFrame appearance="flat" focused={focused} ramp={{ ...frame, base: c.card }} borderWidth={PixelBorders.default}>
        <View style={styles.nodeContent}>
          <View style={[styles.preview, { backgroundColor: c.surfaceMuted }]}>
            {photo ? (visible && <ProofPhoto source={source} node={node} />)
              : <Ionicons name="play-circle-outline" size={36} color={c.primary} />}
          </View>
          <Text style={[TypographyRoles.label, { color: c.foreground }]}>{node.title}</Text>
          {date && <Text style={[TypographyRoles.metadata, { color: c.muted }]}>{date}</Text>}
        </View>
      </PixelFrame>
    </Pressable>
  </View>;
}

function ProofPhoto({ node, source }: { node: ProofNode; source: ProofSource }) {
  const c = useBeePalette();
  const media = useProofUrl(source, node);
  if (media.error) return <Text style={[styles.previewError, { color: c.foreground }]}>Preview unavailable</Text>;
  if (!media.url) return <ActivityIndicator color={c.primary} />;
  return <Image source={media.url} style={StyleSheet.absoluteFill} cachePolicy="none"
    contentFit="cover" onError={media.fail} accessible={false} />;
}

export function ProofViewer({ node, source, note, onSave, onClose }: {
  node: ProofNode;
  source: ProofSource;
  note: string;
  onSave: (id: string, note: string) => void;
  onClose: () => void;
}) {
  const c = useBeePalette();
  const [draft, setDraft] = useState(note);
  const [saved, setSaved] = useState(false);
  const unchanged = draft.trim() === note;

  return <Sheet title={node.title} visible onClose={onClose}>
    <ProofMedia node={node} source={source} />
    <Text style={[TypographyRoles.label, { color: c.foreground }]}>Note for this visit</Text>
    <TextInput accessibilityLabel="Note for this visit" value={draft} onChangeText={text => { setDraft(text); setSaved(false); }}
      multiline textAlignVertical="top" style={[styles.note, { color: c.foreground, borderColor: c.input, backgroundColor: c.surface }]} />
    <PixelButtonSvg label="Save note" intent="secondary" disabled={unchanged} onPress={() => {
      onSave(node.id, draft);
      setSaved(true);
    }} />
    {saved && <Text accessibilityLiveRegion="polite" style={[TypographyRoles.metadata, { color: c.foreground }]}>
      {note ? 'Note saved for this visit.' : 'Note cleared.'}
    </Text>}
  </Sheet>;
}

export function ProofMedia({ node, source }: { node: ProofNode; source: ProofSource }) {
  const media = useProofUrl(source, node);
  if (media.error) return <StatusMessage message="Proof unavailable." error>
    <PixelButtonSvg label="Retry proof" intent="secondary" onPress={media.retry} />
  </StatusMessage>;
  if (!media.url) return <StatusMessage message="Loading proof…" loading />;
  return imageProof(node)
    ? <Image source={media.url} cachePolicy="none" contentFit="contain" onError={media.fail}
      style={styles.viewerMedia} accessibilityLabel={`Photo proof for ${node.title}`} />
    : <ProofVideo url={media.url} onError={media.fail} />;
}

function ProofVideo({ url, onError }: { url: string; onError: () => void }) {
  const player = useVideoPlayer({ uri: url, useCaching: false }, instance => {
    instance.allowsExternalPlayback = false;
  });

  useEventListener(player, 'statusChange', ({ status }) => {
    if (status === 'error') onError();
  });

  useEffect(() => {
    if (player.status === 'error') onError();
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') player.pause();
    });
    return () => subscription.remove();
  }, [player, onError]);

  return <VideoView player={player} nativeControls contentFit="contain" style={styles.viewerMedia} />;
}

const styles = StyleSheet.create({
  row: { paddingVertical: 30 },
  nodeContent: { padding: PixelSpacing.px3, gap: PixelSpacing.px2 },
  preview: { height: 84, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  previewError: { ...TypographyRoles.metadata, textAlign: 'center' },
  viewerMedia: { width: '100%', height: 240, backgroundColor: Pixel.worldTree.barkOutline },
  note: { ...TypographyRoles.body, fontFamily: Fonts.sans, minHeight: 84, borderWidth: PixelBorders.default, padding: PixelSpacing.px4 },
});
