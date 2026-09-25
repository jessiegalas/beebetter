import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { useCurrentLocation } from '@/hooks/use-current-location';
import { syncGeofences, unregisterAllGeofences } from '@/hooks/use-geofencing';
import { useUserLocations, type UserLocation } from '@/hooks/use-user-locations';

interface LocationContextType {
  // User-defined places
  locations: UserLocation[];
  activeLocations: UserLocation[];
  isLoadingLocations: boolean;
  addLocation: (loc: { name: string; label?: string; latitude: number; longitude: number; radius?: number }) => Promise<{ success: boolean; error?: string }>;
  updateLocation: (id: string, updates: Partial<UserLocation>) => Promise<{ success: boolean; error?: string }>;
  deleteLocation: (id: string) => Promise<{ success: boolean; error?: string }>;
  toggleActive: (id: string, isActive: boolean) => Promise<{ success: boolean; error?: string }>;
  refreshLocations: () => Promise<void>;

  // Current location / geofence state
  coords: { latitude: number; longitude: number; accuracy?: number | null } | null;
  locationUpdatedAt: number | null;
  currentLocationName: string | null;     // e.g., "Gym"
  currentLocationId: string | null;       // ID of the nearest user place
  isInsideGeofence: boolean;              // true if within radius of any active location
  permissionStatus: 'granted' | 'denied' | 'undetermined' | null;
  isTracking: boolean;
  locationError: string | null;

  // Actions
  requestPermissions: () => Promise<Location.PermissionStatus>;
  getCurrentPosition: () => Promise<Location.LocationObjectCoords | null>;
  startTracking: () => Promise<void>;
  stopTracking: () => Promise<void>;
}

const LocationContext = createContext<LocationContextType | null>(null);

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const {
    user,
    locations,
    activeLocations,
    isLoading: isLoadingLocations,
    addLocation,
    updateLocation,
    deleteLocation,
    toggleActive,
    fetchLocations: refreshLocations,
  } = useUserLocations();

  const {
    coords,
    locationUpdatedAt,
    locationName,
    locationId,
    isInsideGeofence,
    permissionStatus,
    isTracking,
    error: locationError,
    requestPermissions,
    getCurrentPosition,
    startTracking,
    stopTracking,
  } = useCurrentLocation(activeLocations);

  const [hasInitialized, setHasInitialized] = useState(false);

  // Initialize the location watcher once per signed-in user.
  useEffect(() => {
    let mounted = true;

    async function initialize() {
      if (!user) {
        await stopTracking();
        await refreshLocations();
        await unregisterAllGeofences();
        setHasInitialized(false);
        return;
      }

      // Load locations before enabling location features.
      await refreshLocations();
      await startTracking();

      if (mounted) {
        setHasInitialized(true);
      }
    }

    initialize();

    return () => {
      mounted = false;
    };
  }, [user, refreshLocations, startTracking, stopTracking]);

  // Register the latest regions after locations load or change.
  useEffect(() => {
    if (!hasInitialized || !user) return;
    void syncGeofences(activeLocations);
  }, [activeLocations, hasInitialized, user]);

  // A stationary device may not emit watch events. Refresh on resume and while visible.
  useEffect(() => {
    if (!user) return;
    const update = () => {
      if (AppState.currentState === 'active') {
        void getCurrentPosition();
        void refreshLocations();
      }
    };
    update();
    const timer = setInterval(update, 60_000);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') { update(); void startTracking(); }
    });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [user, getCurrentPosition, refreshLocations, startTracking]);

  // Stop tracking on unmount
  useEffect(() => {
    return () => {
      stopTracking();
    };
  }, [stopTracking]);

  const value = useMemo<LocationContextType>(() => ({
    // User places
    locations,
    activeLocations,
    isLoadingLocations,
    addLocation,
    updateLocation,
    deleteLocation,
    toggleActive,
    refreshLocations,

    // Current location state
    coords,
    locationUpdatedAt,
    currentLocationName: locationName,
    currentLocationId: locationId,
    isInsideGeofence,
    permissionStatus,
    isTracking,
    locationError,

    // Actions
    requestPermissions,
    getCurrentPosition,
    startTracking,
    stopTracking,
  }), [
    locations,
    activeLocations,
    isLoadingLocations,
    addLocation,
    updateLocation,
    deleteLocation,
    toggleActive,
    refreshLocations,
    coords,
    locationUpdatedAt,
    locationName,
    locationId,
    isInsideGeofence,
    permissionStatus,
    isTracking,
    locationError,
    requestPermissions,
    getCurrentPosition,
    startTracking,
    stopTracking,
  ]);

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocationContext() {
  const context = useContext(LocationContext);
  if (!context) {
    throw new Error('useLocationContext must be used within a LocationProvider');
  }
  return context;
}
