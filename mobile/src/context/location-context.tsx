import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { clearGeofenceEvents } from '@/lib/geofence-events';
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
  } = useCurrentLocation(activeLocations, Boolean(user));

  const initialization = useMemo(() => ({ user }), [user]);
  const [initializedFor, setInitializedFor] = useState<object | null>(null);
  const hasInitialized = initializedFor === initialization;

  // Each admitted account owns its initialization. Check after every await.
  useEffect(() => {
    let mounted = true;
    const cleanup = async () => {
      const results = await Promise.allSettled([
        stopTracking(), unregisterAllGeofences(), clearGeofenceEvents(),
      ]);
      results.forEach(result => { if (result.status === 'rejected') console.warn('Location cleanup failed:', result.reason); });
    };
    async function initialize() {
      await cleanup();
      if (!mounted) return;
      await refreshLocations();
      if (!mounted || !user) return;
      await startTracking();
      if (mounted) setInitializedFor(initialization);
    }
    void initialize().catch(error => console.warn('Location initialization failed:', error));
    return () => { mounted = false; void cleanup(); };
  }, [user, refreshLocations, startTracking, stopTracking, initialization]);

  // Register the latest regions after locations load or change.
  useEffect(() => {
    if (!hasInitialized || !user) return;
    void syncGeofences(activeLocations).catch(error => console.warn('Geofence sync failed:', error));
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
