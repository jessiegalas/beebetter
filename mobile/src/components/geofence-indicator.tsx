import { StyleSheet, View, TouchableOpacity, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useLocationContext } from '@/context/location-context';
import { ThemedText } from '@/components/themed-text';
import { type BeePalette, Controls, Radii, Spacing, useBeePalette, useBeeStyles } from '@/constants/theme';

export function GeofenceIndicator({ style, compact = false }: { style?: StyleProp<ViewStyle>; compact?: boolean }) {
  const COLORS = useBeePalette();
  const styles = useBeeStyles(makeStyles);
  const { currentLocationName, isInsideGeofence } = useLocationContext();

  if (!isInsideGeofence || !currentLocationName) {
    return null;
  }

  if (compact) {
    return (
      <TouchableOpacity
        accessibilityRole="button"
        style={[styles.compactContainer, style]}
        onPress={() => router.push('/manage-locations')}
        activeOpacity={0.8}
        accessibilityLabel={`Currently at ${currentLocationName}`}
      >
        <View style={styles.compactDot} />
        <ThemedText type="label" style={styles.compactText} numberOfLines={1}>
          {currentLocationName}
        </ThemedText>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      accessibilityRole="button"
        style={[styles.container, style]}
      onPress={() => router.push('/manage-locations')}
      activeOpacity={0.8}
      accessibilityLabel={`Currently at ${currentLocationName}. Tap to manage places.`}
    >
      <View style={styles.iconWrapper}>
        <Ionicons name="location" size={Controls.iconSize} color={COLORS.honeyDark} />
      </View>
      <View style={styles.textContainer}>
        <ThemedText type="label" style={styles.label}>At</ThemedText>
        <ThemedText type="label" style={styles.name} numberOfLines={1}>
          {currentLocationName}
        </ThemedText>
      </View>
      <Ionicons name="chevron-forward" size={Controls.iconSize} color={COLORS.muted} />
    </TouchableOpacity>
  );
}

export function GeofenceStatusBadge({ style }: { style?: StyleProp<ViewStyle> }) {
  const COLORS = useBeePalette();
  const styles = useBeeStyles(makeStyles);
  const { isInsideGeofence, currentLocationName, permissionStatus } = useLocationContext();

  if (!permissionStatus) {
    return null;
  }

  if (permissionStatus !== 'granted') {
    return (
      <TouchableOpacity
        accessibilityRole="button"
        style={[styles.permissionContainer, style]}
        onPress={() => router.push('/manage-locations')}
        activeOpacity={0.8}
      >
        <Ionicons name="location-outline" size={Controls.iconSize} color={COLORS.danger} />
        <ThemedText type="label" style={styles.permissionText}>Location off</ThemedText>
      </TouchableOpacity>
    );
  }

  if (!isInsideGeofence) {
    return (
      <View style={[styles.outsideContainer, style]}>
        <View style={styles.outsideDot} />
        <ThemedText type="label" style={styles.outsideText}>No place nearby</ThemedText>
      </View>
    );
  }

  return (
    <TouchableOpacity
      accessibilityRole="button"
        style={[styles.activeContainer, style]}
      onPress={() => router.push('/manage-locations')}
      activeOpacity={0.8}
    >
      <View style={styles.activeDot} />
      <ThemedText type="label" style={styles.activeText}>{currentLocationName}</ThemedText>
    </TouchableOpacity>
  );
}

const makeStyles = (COLORS: BeePalette) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: COLORS.honeySoft,
    borderRadius: Radii.xl,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  iconWrapper: {
    width: Spacing.xl,
    height: Spacing.xl,
    borderRadius: Radii.md,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flexDirection: 'column',
  },
  label: {
    color: COLORS.muted,
    textTransform: 'uppercase',
  },
  name: {
    color: COLORS.ink,
  },
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: COLORS.honeySoft,
    borderRadius: Radii.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  compactDot: {
    width: 6,
    height: 6,
    borderRadius: Radii.pill,
    backgroundColor: COLORS.honeyDark,
  },
  compactText: {
    color: COLORS.ink,
  },
  permissionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: COLORS.dangerSurface,
    borderRadius: Radii.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  permissionText: {
    color: COLORS.danger,
  },
  outsideContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: COLORS.surfaceMuted,
    borderRadius: Radii.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  outsideDot: {
    width: 6,
    height: 6,
    borderRadius: Radii.pill,
    backgroundColor: COLORS.muted,
  },
  outsideText: {
    color: COLORS.muted,
  },
  activeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: COLORS.honeySoft,
    borderRadius: Radii.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: Radii.pill,
    backgroundColor: COLORS.honeyDark,
  },
  activeText: {
    color: COLORS.ink,
  },
});