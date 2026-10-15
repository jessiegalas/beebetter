import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { IconButton, useReducedMotion } from './mobile-ui';
import { ThemedText } from './themed-text';
import { UserAvatar } from './user-avatar';
import { Borders, Controls, Layout, Radii, Spacing, States, useBeePalette } from '@/constants/theme';
import { useUserData } from '@/hooks/use-user-data';

const SCRIM_OPACITY = 0.36;
const SCRIM_FADE_DURATION = 140;

export function HomeMenu({ visible, onClose, displayName, avatarUri }: { visible: boolean; onClose: () => void; displayName: string; avatarUri?: string }) {
  const c = useBeePalette(), reduced = useReducedMotion();
  const { width } = useWindowDimensions();
  const { levelProgress, signOut, isSigningOut } = useUserData();
  const [profileFocused, setProfileFocused] = useState(false);
  const panelWidth = Math.min(320, width * 0.84);
  const [slideX] = useState(() => new Animated.Value(-panelWidth));
  const [scrimOpacity] = useState(() => new Animated.Value(0));
  const modalMountedRef = useRef(visible);
  const modalShownRef = useRef(false);
  const visibleRef = useRef(visible);
  useLayoutEffect(() => { visibleRef.current = visible; }, [visible]);
  const [modalMounted, setModalMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      modalMountedRef.current = true;
      queueMicrotask(() => { if (visibleRef.current) setModalMounted(true); });
      slideX.stopAnimation();
      scrimOpacity.stopAnimation();
      if (reduced) {
        slideX.setValue(0);
        scrimOpacity.setValue(SCRIM_OPACITY);
      } else if (modalShownRef.current) {
        Animated.parallel([
          Animated.timing(slideX, {
            toValue: 0,
            duration: 380,
            easing: Easing.bezier(0.22, 1, 0.36, 1),
            useNativeDriver: true,
          }),
          Animated.timing(scrimOpacity, {
            toValue: SCRIM_OPACITY,
            duration: SCRIM_FADE_DURATION,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]).start();
      } else {
        slideX.setValue(-panelWidth);
        scrimOpacity.setValue(0);
      }
      return;
    } else if (!modalMountedRef.current) {
      return;
    }

    if (reduced) {
      slideX.setValue(-panelWidth);
      scrimOpacity.setValue(0);
      modalMountedRef.current = false;
      modalShownRef.current = false;
      queueMicrotask(() => { if (!visibleRef.current) setModalMounted(false); });
      return;
    }

    slideX.stopAnimation();
    scrimOpacity.stopAnimation();
    Animated.parallel([
      Animated.timing(slideX, {
        toValue: -panelWidth,
        duration: 320,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(scrimOpacity, {
        toValue: 0,
        duration: SCRIM_FADE_DURATION,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished && !visibleRef.current) {
        modalMountedRef.current = false;
        modalShownRef.current = false;
        setModalMounted(false);
      }
    });
  }, [visible, panelWidth, reduced, slideX, scrimOpacity]);

  const handleModalShow = () => {
    modalShownRef.current = true;
    if (!visibleRef.current || reduced) return;
    slideX.stopAnimation();
    scrimOpacity.stopAnimation();
    Animated.parallel([
      Animated.timing(slideX, {
        toValue: 0,
        duration: 380,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        useNativeDriver: true,
      }),
      Animated.timing(scrimOpacity, {
        toValue: SCRIM_OPACITY,
        duration: SCRIM_FADE_DURATION,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  };

  const percent = Math.max(0, Math.min(100, levelProgress.progressPercent));
  const open = (route: '/profile' | '/manage-locations' | '/skill-tree' | '/notifications' | '/settings') => { onClose(); router.push(route); };
  const logout = () => {
    if (isSigningOut) return;
    Alert.alert('Sign Out', 'Are you sure you want to sign out of BeeBetter?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => { void signOut(); } },
    ]);
  };
  return <Modal visible={modalMounted} transparent animationType="none" onShow={handleModalShow} onRequestClose={onClose}>
    <View style={s.overlay}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim, opacity: scrimOpacity }]} />
      <Animated.View style={{ width: panelWidth, flexDirection: 'row', transform: [{ translateX: slideX }] }}>
        <SafeAreaView edges={['top', 'bottom']} accessibilityViewIsModal style={[s.panel, { width: panelWidth, backgroundColor: c.background }]}>
          <ScrollView contentContainerStyle={s.contents} showsVerticalScrollIndicator={false}>
            <View style={s.identity}>
              <Pressable cssInterop={false} accessibilityRole="button" accessibilityLabel={'Open profile for ' + displayName + ', level ' + levelProgress.level} onPress={() => open('/profile')} onFocus={() => setProfileFocused(true)} onBlur={() => setProfileFocused(false)} style={({ pressed }) => [s.profileLink, { backgroundColor: pressed ? c.surfaceMuted : 'transparent', borderColor: profileFocused ? c.focus : 'transparent' }]}>
                <UserAvatar uri={avatarUri} name={displayName} />
                <View style={s.copy}>
                  <ThemedText type="item" numberOfLines={2}>{displayName}</ThemedText>
                  <ThemedText type="small" style={{ color: c.muted }}>Level {levelProgress.level}</ThemedText>
                </View>
                <View style={s.profileChevron} accessible={false}>
                  <Ionicons name="chevron-forward" size={14} color={c.muted} accessible={false} style={{ width: Controls.iconSize, lineHeight: Controls.iconSize, textAlign: 'center', includeFontPadding: false }} />
                </View>
              </Pressable>
              <IconButton icon="close" label="Close menu" onPress={onClose} />
            </View>
            <View style={s.summary}>
              <View style={[s.track, { backgroundColor: c.surfaceMuted }]} accessibilityRole="progressbar" accessibilityLabel="Level progress" accessibilityValue={{ min: 0, max: 100, now: percent }}>
                <View style={{ height: '100%', width: `${percent}%`, backgroundColor: c.accent }} />
              </View>
              <ThemedText type="small" style={{ color: c.muted }}>{levelProgress.currentLevelXp} / {levelProgress.xpForNextLevel} XP</ThemedText>
            </View>
            <View style={[s.divider, { backgroundColor: c.border }]} />
            <View style={s.group}>
              <MenuItem icon="bookmark-outline" label="Save Places" featured onPress={() => open('/manage-locations')} />
              <MenuItem icon="git-network-outline" label="Skill Tree" featured onPress={() => open('/skill-tree')} />
            </View>
            <View style={[s.divider, { backgroundColor: c.surfaceMuted }]} />
            <View style={s.group}>
              <MenuItem icon="settings-outline" label="Settings" onPress={() => open('/settings')} />
              <MenuItem icon="help-circle-outline" label="Help & Support" disabled />
              <MenuItem icon="notifications-outline" label="Notifications" onPress={() => open('/notifications')} />
              <MenuItem icon="log-out-outline" label="Log Out" danger busy={isSigningOut} onPress={logout} />
            </View>
          </ScrollView>
          <View style={s.footer}>
            <Image source={require('../../assets/images/beebetter-logo.png')} style={s.logo} contentFit="contain" accessible={false} />
            <ThemedText type="small" style={{ color: c.muted, textAlign: 'center' }}>Small steps. Big progress.</ThemedText>
          </View>
        </SafeAreaView>
      </Animated.View>
      <Pressable cssInterop={false} style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel="Close menu backdrop" onPress={onClose} />
    </View>
  </Modal>;
}

function MenuItem({ icon, label, onPress, featured = false, disabled = false, danger = false, busy = false }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress?: () => void; featured?: boolean; disabled?: boolean; danger?: boolean; busy?: boolean }) {
  const c = useBeePalette(), [focused, setFocused] = useState(false);
  return <Pressable cssInterop={false} onPress={onPress} disabled={disabled || busy} accessibilityRole="button" accessibilityLabel={label} accessibilityHint={disabled ? 'Coming soon' : undefined} accessibilityState={{ disabled: disabled || busy, busy }} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={({ pressed }) => [s.row, { backgroundColor: disabled ? c.disabled : pressed ? c.surfaceMuted : featured ? c.card : 'transparent', borderColor: focused && !danger ? c.focus : 'transparent' }, danger && { borderWidth: 0, opacity: focused ? States.pressedOpacity : 1 }]}>
    {busy ? <ActivityIndicator color={c.danger} /> : <Ionicons name={icon} size={Controls.iconSize} color={disabled ? c.disabledForeground : danger ? c.danger : c.foreground} accessible={false} />}
    <ThemedText type={disabled ? 'small' : 'label'} style={[s.copy, { color: disabled ? c.disabledForeground : danger ? c.danger : c.foreground }]}>{label}</ThemedText>
    {featured && <Ionicons name="chevron-forward" size={16} color={c.muted} accessible={false} />}
  </Pressable>;
}

const s = StyleSheet.create({
  overlay: { flex: 1, flexDirection: 'row' },
  panel: { maxWidth: Layout.maxSheetWidth, borderTopRightRadius: Radii.xl, borderBottomRightRadius: Radii.xl, overflow: 'hidden' },
  contents: { padding: Spacing.lg, gap: Spacing.lg },
  identity: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  profileLink: { flex: 1, minWidth: 0, minHeight: Controls.minHeight, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xs, borderWidth: Borders.focus, borderRadius: Radii.md },
  profileChevron: { alignSelf: 'stretch', width: Controls.minHeight, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0 },
  summary: { gap: Spacing.xs },
  track: { height: Spacing.sm, borderRadius: Radii.pill, overflow: 'hidden' },
  group: { gap: Spacing.sm },
  row: { minHeight: Controls.minHeight, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderWidth: Borders.focus, borderRadius: Radii.md },
  divider: { height: Borders.default },
  logo: { width: Controls.minHeight, height: Controls.minHeight, borderRadius: Radii.sm },
  footer: { padding: Spacing.lg, alignItems: 'center', gap: Spacing.sm },
});
