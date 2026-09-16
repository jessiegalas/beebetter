import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useLocationContext } from '@/context/location-context';
import { BeeBetterColors as COLORS, BeeBetterShadow } from '@/constants/theme';

export function GeofenceIndicator({ style, compact = false }: { style?: StyleProp<ViewStyle>; compact?: boolean }) {
  const { currentLocationName, isInsideGeofence } = useLocationContext();

  if (!isInsideGeofence || !currentLocationName) {
    return null;
  }

  if (compact) {
    return (
      <TouchableOpacity
        style={[styles.compactContainer, style]}
        onPress={() => router.push({ pathname: '/manage-locations' } as any)}
        activeOpacity={0.8}
        accessibilityLabel={`Currently at ${currentLocationName}`}
      >
        <View style={styles.compactDot} />
        <Text style={styles.compactText} numberOfLines={1}>
          {currentLocationName}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.container, style]}
      onPress={() => router.push({ pathname: '/manage-locations' } as any)}
      activeOpacity={0.8}
      accessibilityLabel={`Currently at ${currentLocationName}. Tap to manage places.`}
    >
      <View style={styles.iconWrapper}>
        <Ionicons name="location" size={14} color={COLORS.honeyDark} />
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.label}>At</Text>
        <Text style={styles.name} numberOfLines={1}>
          {currentLocationName}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={14} color={COLORS.muted} />
    </TouchableOpacity>
  );
}

export function GeofenceStatusBadge({ style }: { style?: StyleProp<ViewStyle> }) {
  const { isInsideGeofence, currentLocationName, permissionStatus } = useLocationContext();

  if (!permissionStatus) {
    return null;
  }

  if (permissionStatus !== 'granted') {
    return (
      <TouchableOpacity
        style={[styles.permissionContainer, style]}
        onPress={() => router.push({ pathname: '/manage-locations' } as any)}
        activeOpacity={0.8}
      >
        <Ionicons name="location-outline" size={14} color={COLORS.danger} />
        <Text style={styles.permissionText}>Location off</Text>
      </TouchableOpacity>
    );
  }

  if (!isInsideGeofence) {
    return (
      <View style={[styles.outsideContainer, style]}>
        <View style={styles.outsideDot} />
        <Text style={styles.outsideText}>No place nearby</Text>
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.activeContainer, style]}
      onPress={() => router.push({ pathname: '/manage-locations' } as any)}
      activeOpacity={0.8}
    >
      <View style={styles.activeDot} />
      <Text style={styles.activeText}>{currentLocationName}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.honeySoft,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    ...BeeBetterShadow,
  },
  iconWrapper: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flexDirection: 'column',
  },
  label: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  name: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.ink,
  },
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.honeySoft,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    ...BeeBetterShadow,
  },
  compactDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.honeyDark,
  },
  compactText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.ink,
  },
  permissionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FDEDEC',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    ...BeeBetterShadow,
  },
  permissionText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.danger,
  },
  outsideContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.surfaceMuted,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  outsideDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.muted,
  },
  outsideText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.muted,
  },
  activeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.honeySoft,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    ...BeeBetterShadow,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.honeyDark,
  },
  activeText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.ink,
  },
});