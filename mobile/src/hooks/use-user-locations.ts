import { useCallback, useState, useMemo } from 'react';
import { supabase } from '@/supabase';
import { useUserData } from '@/hooks/use-user-data';

export type UserLocation = {
  id: string;
  owner_id: string;
  name: string;
  label: string | null;
  latitude: number;
  longitude: number;
  radius: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type NewLocation = {
  name: string;
  label?: string;
  latitude: number;
  longitude: number;
  radius?: number;
};

export function useUserLocations() {
  const { user } = useUserData();
  const [locations, setLocations] = useState<UserLocation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLocations = useCallback(async () => {
    if (!user) {
      setLocations([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('user_locations')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setLocations((data as UserLocation[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load locations');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const addLocation = useCallback(async (newLoc: NewLocation): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: 'Not signed in' };

    try {
      const { data, error: insertError } = await supabase
        .from('user_locations')
        .insert({
          owner_id: user.id,
          name: newLoc.name.trim(),
          label: newLoc.label?.trim() || null,
          latitude: newLoc.latitude,
          longitude: newLoc.longitude,
          radius: newLoc.radius ?? 100,
          is_active: true,
        })
        .select('*')
        .single();

      if (insertError) throw insertError;
      if (data) {
        setLocations((prev) => [data as UserLocation, ...prev]);
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to add location' };
    }
  }, [user]);

  const updateLocation = useCallback(async (
    id: string,
    updates: Partial<Pick<UserLocation, 'name' | 'label' | 'latitude' | 'longitude' | 'radius' | 'is_active'>>
  ): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: 'Not signed in' };

    try {
      const { error: updateError } = await supabase
        .from('user_locations')
        .update(updates)
        .eq('id', id)
        .eq('owner_id', user.id);

      if (updateError) throw updateError;
      setLocations((prev) => prev.map((loc) => (loc.id === id ? { ...loc, ...updates } : loc)));
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to update location' };
    }
  }, [user]);

  const deleteLocation = useCallback(async (id: string): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: 'Not signed in' };

    try {
      const { error: deleteError } = await supabase
        .from('user_locations')
        .delete()
        .eq('id', id)
        .eq('owner_id', user.id);

      if (deleteError) throw deleteError;
      setLocations((prev) => prev.filter((loc) => loc.id !== id));
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to delete location' };
    }
  }, [user]);

  const toggleActive = useCallback(async (id: string, isActive: boolean) => {
    return updateLocation(id, { is_active: isActive });
  }, [updateLocation]);

  // Active locations only (for geofencing)
  const activeLocations = useMemo(() => locations.filter((l) => l.is_active), [locations]);

  return {
    user,
    locations,
    activeLocations,
    isLoading,
    error,
    fetchLocations,
    addLocation,
    updateLocation,
    deleteLocation,
    toggleActive,
  };
}
