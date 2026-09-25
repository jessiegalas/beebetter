import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import type { UserLocation } from './use-user-locations';
import { distanceMeters } from '@/lib/quest-priority';

export function useCurrentLocation(userLocations: UserLocation[] = []) {
  const [coords, setCoords] = useState<Location.LocationObjectCoords | null>(null);
  const [locationUpdatedAt, setLocationUpdatedAt] = useState<number | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<Location.PermissionStatus | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const watch = useRef<Location.LocationSubscription | null>(null);
  const starting = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(true);

  const acceptPosition = useCallback((position: Location.LocationObject) => {
    if (!mounted.current) return;
    setCoords(position.coords);
    setLocationUpdatedAt(position.timestamp);
    setError(null);
  }, []);

  const requestPermissions = useCallback(async (): Promise<Location.PermissionStatus> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (mounted.current) {
        setPermissionStatus(status);
        if (status !== 'granted') { setCoords(null); setLocationUpdatedAt(null); }
        setError(status === 'granted' ? null : 'Location permission denied');
      }
      // Background permission is optional: its denial must not disable foreground location.
      if (status === 'granted' && Platform.OS !== 'web' && await TaskManager.isAvailableAsync()) {
        try { await Location.requestBackgroundPermissionsAsync(); } catch { /* Foreground still works. */ }
      }
      return status;
    } catch {
      if (mounted.current) { setError('Location unavailable'); setCoords(null); setLocationUpdatedAt(null); }
      return 'denied' as Location.PermissionStatus;
    }
  }, []);

  const getCurrentPosition = useCallback(async () => {
    const version = generation.current;
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (mounted.current) setPermissionStatus(status);
      if (status !== 'granted') {
        if (mounted.current) { setCoords(null); setLocationUpdatedAt(null); }
        return null;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (version === generation.current) acceptPosition(position);
      return position.coords;
    } catch {
      if (mounted.current) { setError('Unable to update location'); setCoords(null); setLocationUpdatedAt(null); }
      return null;
    }
  }, [acceptPosition]);

  const startTracking = useCallback(async () => {
    if (watch.current || starting.current) return;
    starting.current = true;
    const version = generation.current;
    try {
      const status = await requestPermissions();
      if (!mounted.current || version !== generation.current || status !== 'granted') return;
      const subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 10_000, distanceInterval: 25 },
        position => { if (version === generation.current) acceptPosition(position); }
      );
      if (!mounted.current || version !== generation.current) subscription.remove();
      else { watch.current = subscription; setIsTracking(true); }
    } catch {
      if (mounted.current) setError('Unable to track location');
    } finally { starting.current = false; }
  }, [acceptPosition, requestPermissions]);

  const stopTracking = useCallback(async () => {
    generation.current += 1;
    watch.current?.remove();
    watch.current = null;
    if (mounted.current) { setIsTracking(false); setCoords(null); setLocationUpdatedAt(null); }
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current += 1; watch.current?.remove(); watch.current = null; };
  }, []);

  // Re-evaluate saved places on edits too, including overlapping geofences.
  const nearest = useMemo(() => {
    if (!coords) return null;
    return userLocations.filter(place => place.is_active)
      .map(place => ({ place, distance: distanceMeters(coords, place) }))
      .filter(item => item.distance <= item.place.radius)
      .sort((a, b) => a.distance - b.distance)[0]?.place ?? null;
  }, [coords, userLocations]);

  return {
    coords, locationUpdatedAt, permissionStatus, isTracking, error,
    locationName: nearest?.name ?? null, locationId: nearest?.id ?? null,
    isInsideGeofence: !!nearest, requestPermissions, getCurrentPosition, startTracking, stopTracking,
  };
}
export function isGeofencingSupported(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}
