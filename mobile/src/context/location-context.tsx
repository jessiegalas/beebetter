import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { clearGeofenceEvents, readGeofenceEvents, subscribeGeofenceEvents, type GeofenceEvents } from '@/lib/geofence-events';
import { AppState, Platform } from 'react-native';
import * as Location from 'expo-location';
import { useCurrentLocation } from '@/hooks/use-current-location';
import { useUserLocations, type UserLocation } from '@/hooks/use-user-locations';

interface LocationContextType {
  // User-defined places
  locations: UserLocation[];
  activeLocations: UserLocation[];
  isLoadingLocations: boolean;
  locationsUpdatedAt: number | null;
  locationsError: string | null;
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
  geofenceEvents: GeofenceEvents;

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
    locationsUpdatedAt,
    error: locationsError,
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
  const [eventSnapshot, setEventSnapshot] = useState<{ lifetime: object; events: GeofenceEvents } | null>(null);
  const geofenceEvents = useMemo(() => eventSnapshot?.lifetime === initialization ? eventSnapshot.events : {}, [eventSnapshot, initialization]);

  // Share one account-fenced event reader with browsing and recommendations.
  useEffect(() => {
    if (!user) return;
    let alive = true, readVersion = 0;
    const update = () => {
      const version = ++readVersion;
      void readGeofenceEvents().then(events => {
        if (alive && version === readVersion) setEventSnapshot({ lifetime: initialization, events });
      }).catch(() => {});
    };
    update();
    const timer = setInterval(() => { if (AppState.currentState === 'active') update(); }, 30_000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') update(); });
    const unsubscribe = subscribeGeofenceEvents(events => {
      if (!alive) return;
      readVersion += 1; setEventSnapshot({ lifetime: initialization, events });
    });
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.addEventListener('online', update);
    return () => { alive = false; clearInterval(timer); subscription.remove(); unsubscribe();
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.removeEventListener('online', update); };
  }, [user, initialization]);

  // Each admitted account owns its initialization. Check after every await.
  useEffect(() => {
    let mounted = true;
    const cleanup = async () => {
      const results = await Promise.allSettled([
        stopTracking(), clearGeofenceEvents(),
      ]);
      results.forEach(result => { if (result.status === 'rejected') console.warn('Location cleanup failed:', result.reason); });
    };
    async function initialize() {
      await cleanup();
      if (!mounted) return;
      await refreshLocations();
      if (!mounted || !user) return;
      await startTracking();
    }
    void initialize().catch(error => console.warn('Location initialization failed:', error));
    return () => { mounted = false; void cleanup(); };
  }, [user, refreshLocations, startTracking, stopTracking, initialization]);

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
    locationsUpdatedAt,
    locationsError,
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
    geofenceEvents,

    // Actions
    requestPermissions,
    getCurrentPosition,
    startTracking,
    stopTracking,
  }), [
    locations,
    activeLocations,
    isLoadingLocations,
    locationsUpdatedAt,
    locationsError,
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
    geofenceEvents,
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
