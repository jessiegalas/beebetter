import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import * as Location from 'expo-location';
import { useCurrentLocation } from '@/hooks/use-current-location';
import { registerGeofences, syncGeofences } from '@/hooks/use-geofencing';
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
  coords: { latitude: number; longitude: number } | null;
  currentLocationName: string | null;     // e.g., "Gym"
  currentLocationId: string | null;       // ID of the nearest user place
  isInsideGeofence: boolean;              // true if within radius of any active location
  permissionStatus: 'granted' | 'denied' | 'undetermined' | null;
  isTracking: boolean;
  locationError: string | null;

  // Actions
  requestPermissions: () => Promise<Location.PermissionStatus>;
  getCurrentPosition: () => Promise<void>;
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
        setHasInitialized(true);
        return;
      }

      // Load locations before enabling location features.
      await refreshLocations();
      await requestPermissions();
      await startTracking();

      if (mounted) {
        setHasInitialized(true);
      }
    }

    initialize();

    return () => {
      mounted = false;
    };
  }, [user, refreshLocations, requestPermissions, startTracking]);

  // Register the latest regions after locations load or change.
  useEffect(() => {
    if (!hasInitialized || !user) return;
    void syncGeofences(activeLocations);
  }, [activeLocations, hasInitialized, user]);

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