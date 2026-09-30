import { useCallback, useState, useMemo, useLayoutEffect } from 'react';
import { SessionFence } from '@/lib/account-access';
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
  const [fence] = useState(() => new SessionFence());
  useLayoutEffect(() => {
    fence.accept(user?.id ?? null);
    return () => { fence.invalidate(); };
  }, [user?.id, fence]);
  const [locations, setLocations] = useState<UserLocation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLocations = useCallback(async () => {
    const isCurrent = fence.capture(user?.id);
    if (!isCurrent()) return;
    if (!user) {
      setLocations([]);
      setIsLoading(false);
      setError(null);
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

      if (!isCurrent()) return;
      if (fetchError) throw fetchError;
      const next = (data as UserLocation[]) ?? [];
      setLocations(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    } catch (err) {
      if (isCurrent()) setError(err instanceof Error ? err.message : 'Failed to load locations');
    } finally {
      if (isCurrent()) setIsLoading(false);
    }
  }, [user, fence]);

  const addLocation = useCallback(async (newLoc: NewLocation): Promise<{ success: boolean; error?: string }> => {
    if (!user || !fence.capture(user.id)()) return { success: false, error: 'Not signed in' };
    const isCurrent = fence.capture(user.id);

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
      if (data && isCurrent()) {
        setLocations((prev) => [data as UserLocation, ...prev]);
      }
      return isCurrent() ? { success: true } : { success: false, error: 'Session ended.' };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to add location' };
    }
  }, [user, fence]);

  const updateLocation = useCallback(async (
    id: string,
    updates: Partial<Pick<UserLocation, 'name' | 'label' | 'latitude' | 'longitude' | 'radius' | 'is_active'>>
  ): Promise<{ success: boolean; error?: string }> => {
    if (!user || !fence.capture(user.id)()) return { success: false, error: 'Not signed in' };
    const isCurrent = fence.capture(user.id);

    try {
      const { error: updateError } = await supabase
        .from('user_locations')
        .update(updates)
        .eq('id', id)
        .eq('owner_id', user.id);

      if (updateError) throw updateError;
      if (isCurrent()) setLocations((prev) => prev.map((loc) => (loc.id === id ? { ...loc, ...updates } : loc)));
      return isCurrent() ? { success: true } : { success: false, error: 'Session ended.' };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to update location' };
    }
  }, [user, fence]);

  const deleteLocation = useCallback(async (id: string): Promise<{ success: boolean; error?: string }> => {
    if (!user || !fence.capture(user.id)()) return { success: false, error: 'Not signed in' };
    const isCurrent = fence.capture(user.id);

    try {
      const { error: deleteError } = await supabase
        .from('user_locations')
        .delete()
        .eq('id', id)
        .eq('owner_id', user.id);

      if (deleteError) throw deleteError;
      if (isCurrent()) setLocations((prev) => prev.filter((loc) => loc.id !== id));
      return isCurrent() ? { success: true } : { success: false, error: 'Session ended.' };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to delete location' };
    }
  }, [user, fence]);

  const toggleActive = useCallback(async (id: string, isActive: boolean) => {
    return updateLocation(id, { is_active: isActive });
  }, [updateLocation]);

  // Never expose a previous account's places while the new fetch is pending.
  const visibleLocations = useMemo(() => user ? locations.filter(location => location.owner_id === user.id) : [], [locations, user]);
  const activeLocations = useMemo(() => visibleLocations.filter((l) => l.is_active), [visibleLocations]);

  return {
    user,
    locations: visibleLocations,
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
