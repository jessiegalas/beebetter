import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { UserLocation } from './use-user-locations';

type LocationState = {
  coords: Location.LocationObjectCoords | null;
  locationName: string | null;        // Nearest user place name (e.g., "Gym")
  locationId: string | null;          // ID of the nearest user place
  isInsideGeofence: boolean;          // True if within radius of a user place
  permissionStatus: Location.PermissionStatus | null;
  isTracking: boolean;
  error: string | null;
};

const DEFAULT_RADIUS = 100; // meters fallback

export function useCurrentLocation(userLocations: UserLocation[] = []) {
  const [state, setState] = useState<LocationState>({
    coords: null,
    locationName: null,
    locationId: null,
    isInsideGeofence: false,
    permissionStatus: null,
    isTracking: false,
    error: null,
  });

  const watchIdRef = useRef<Location.LocationSubscription | null>(null);
  const activeLocationsRef = useRef<UserLocation[]>([]);
  const isTrackingRef = useRef(false);

  // Keep reference to latest locations for geofence checks
  useEffect(() => {
    activeLocationsRef.current = userLocations.filter((l) => l.is_active);
  }, [userLocations]);

  // Calculate distance between two points (Haversine)
  const getDistance = useCallback((
    lat1: number, lon1: number,
    lat2: number, lon2: number
  ): number => {
    const R = 6371000; // Earth radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }, []);

  // Find nearest active user location within its radius
  const findNearestLocation = useCallback((
    latitude: number,
    longitude: number
  ): { location: UserLocation; distance: number } | null => {
    let nearest: { location: UserLocation; distance: number } | null = null;

    for (const loc of activeLocationsRef.current) {
      const distance = getDistance(latitude, longitude, loc.latitude, loc.longitude);
      if (distance <= (loc.radius || DEFAULT_RADIUS)) {
        if (!nearest || distance < nearest.distance) {
          nearest = { location: loc, distance };
        }
      }
    }
    return nearest;
  }, [getDistance]);

  // Request permissions
  const requestPermissions = useCallback(async (): Promise<Location.PermissionStatus> => {
    try {
      const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
      if (fgStatus !== 'granted') {
        setState((prev) => ({ ...prev, permissionStatus: fgStatus, error: 'Location permission denied' }));
        return fgStatus;
      }

      if (!(await TaskManager.isAvailableAsync())) {
        setState((prev) => ({ ...prev, permissionStatus: fgStatus, error: null }));
        return fgStatus;
      }

      const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
      setState((prev) => ({
        ...prev,
        permissionStatus: bgStatus,
        error: bgStatus === 'granted' ? null : 'Background location permission is required for geofencing',
      }));
      return bgStatus;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to request location permissions';
      const deniedStatus = 'denied' as Location.PermissionStatus;
      setState((prev) => ({ ...prev, permissionStatus: deniedStatus, error: message }));
      return deniedStatus;
    }
  }, []);

  // Get current position once
  const getCurrentPosition = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, error: null }));
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setState((prev) => ({ ...prev, coords: location.coords }));

      // Check geofence
      const nearest = findNearestLocation(location.coords.latitude, location.coords.longitude);
      if (nearest) {
        setState((prev) => ({
          ...prev,
          locationName: nearest.location.name,
          locationId: nearest.location.id,
          isInsideGeofence: true,
        }));
      } else {
        setState((prev) => ({
          ...prev,
          locationName: null,
          locationId: null,
          isInsideGeofence: false,
        }));
      }
    } catch (err) {
      setState((prev) => ({ ...prev, error: err instanceof Error ? err.message : 'Failed to get location' }));
    }
  }, [findNearestLocation]);

  // Start watching position (foreground)
  const startTracking = useCallback(async () => {
    if (isTrackingRef.current) return;

    const status = await requestPermissions();
    setState((prev) => ({ ...prev, permissionStatus: status }));

    if (status !== 'granted') {
      setState((prev) => ({ ...prev, error: 'Location permission denied' }));
      return;
    }

    try {
      setState((prev) => ({ ...prev, error: null, isTracking: true }));
      isTrackingRef.current = true;

      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 10000,
          distanceInterval: 50,
        },
        (location) => {
          setState((prev) => ({ ...prev, coords: location.coords }));

          const nearest = findNearestLocation(location.coords.latitude, location.coords.longitude);
          if (nearest) {
            setState((prev) => ({
              ...prev,
              locationName: nearest.location.name,
              locationId: nearest.location.id,
              isInsideGeofence: true,
            }));
          } else {
            setState((prev) => ({
              ...prev,
              locationName: null,
              locationId: null,
              isInsideGeofence: false,
            }));
          }
        }
      );

      watchIdRef.current = subscription;
    } catch (err) {
      isTrackingRef.current = false;
      setState((prev) => ({ ...prev, error: err instanceof Error ? err.message : 'Failed to start tracking', isTracking: false }));
    }
  }, [requestPermissions, findNearestLocation]);

  // Stop watching
  const stopTracking = useCallback(async () => {
    if (watchIdRef.current !== null) {
      watchIdRef.current.remove();
      watchIdRef.current = null;
    }
    isTrackingRef.current = false;
    setState((prev) => ({ ...prev, isTracking: false }));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        watchIdRef.current.remove();
      }
    };
  }, []);

  return {
    ...state,
    requestPermissions,
    getCurrentPosition,
    startTracking,
    stopTracking,
  };
}

// Helper: Check if background geofencing is supported
export function isGeofencingSupported(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}