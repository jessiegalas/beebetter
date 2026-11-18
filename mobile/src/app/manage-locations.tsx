import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  Keyboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Field, IconButton, ScreenHeader } from '@/components/mobile-ui';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Circle, Marker, type MapPressEvent } from 'react-native-maps';
import { router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { useBeePalette, useBeeStyles, type BeePalette, Controls, ContentColumn, Radii, SectionColumn, Spacing, Typography } from '@/constants/theme';
import { useLocationContext } from '@/context/location-context';
import type { UserLocation } from '@/hooks/use-user-locations';

type LocationForm = {
  name: string;
  label: string;
  latitude: string;
  longitude: string;
  radius: string;
};

const DEFAULT_RADIUS = 100;
const RADIUS_STEP = 10;

export default function ManageLocationsScreen() {
  const COLORS = useBeePalette();
  const styles = useBeeStyles(makeStyles);
  const {
    locations,
    activeLocations,
    isLoadingLocations,
    addLocation,
    updateLocation,
    deleteLocation,
    toggleActive,
    coords,
    requestPermissions,
    getCurrentPosition } = useLocationContext();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<LocationForm>({
    name: '',
    label: '',
    latitude: '',
    longitude: '',
    radius: String(DEFAULT_RADIUS) });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const resetForm = () => {
    setForm({ name: '', label: '', latitude: '', longitude: '', radius: String(DEFAULT_RADIUS) });
    setEditingId(null);
    setFeedback(null);
  };

  const handleEdit = (loc: UserLocation) => {
    setForm({
      name: loc.name,
      label: loc.label || '',
      latitude: String(loc.latitude),
      longitude: String(loc.longitude),
      radius: String(loc.radius) });
    setEditingId(loc.id);
    setFeedback(null);
  };

  const handleDelete = (loc: UserLocation) => {
    Alert.alert(
      'Delete location?',
      `Remove "${loc.name}"? This will also stop geofence monitoring for it.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const result = await deleteLocation(loc.id);
            if (!result.success) {
              setFeedback(result.error || 'Failed to delete');
            }
          } },
      ]
    );
  };

  const handleToggle = async (loc: UserLocation) => {
    const result = await toggleActive(loc.id, !loc.is_active);
    if (!result.success) {
      setFeedback(result.error || 'Failed to update');
    }
  };

  const useCurrentLocation = async () => {
    setFeedback(null);
    try {
      await requestPermissions();
      const currentCoords = await getCurrentPosition();
      if (currentCoords) {
        setForm((prev) => ({ ...prev, latitude: String(currentCoords.latitude), longitude: String(currentCoords.longitude) }));
      } else setFeedback('Could not get current location. Try again.');
    } catch {
      setFeedback('Failed to get location');
    }
  };

  const mapLatitude = Number(form.latitude) || coords?.latitude || 14.5995;
  const mapLongitude = Number(form.longitude) || coords?.longitude || 120.9842;
  const mapRadius = Math.min(5000, Math.max(10, Number(form.radius) || DEFAULT_RADIUS));

  const adjustRadius = (change: number) => {
    setForm((prev) => {
      const currentRadius = Number(prev.radius) || DEFAULT_RADIUS;
      const nextRadius = Math.min(5000, Math.max(10, currentRadius + change));
      return { ...prev, radius: String(nextRadius) };
    });
  };

  const handleMapPress = (event: MapPressEvent) => {
    const { latitude, longitude } = event.nativeEvent.coordinate;
    setForm((prev) => ({ ...prev, latitude: latitude.toFixed(6), longitude: longitude.toFixed(6) }));
  };

  const validateForm = (): { lat: number; lng: number; rad: number } | null => {
    const lat = parseFloat(form.latitude);
    const lng = parseFloat(form.longitude);
    const rad = parseInt(form.radius, 10);

    if (!form.name.trim()) {
      setFeedback('Name is required');
      return null;
    }
    if (isNaN(lat) || lat < -90 || lat > 90) {
      setFeedback('Valid latitude required (-90 to 90)');
      return null;
    }
    if (isNaN(lng) || lng < -180 || lng > 180) {
      setFeedback('Valid longitude required (-180 to 180)');
      return null;
    }
    if (isNaN(rad) || rad < 10 || rad > 5000) {
      setFeedback('Radius must be between 10 and 5000 meters');
      return null;
    }
    return { lat, lng, rad };
  };

  const handleSubmit = async () => {
    Keyboard.dismiss();
    const validated = validateForm();
    if (!validated) return;

    setIsSubmitting(true);
    setFeedback(null);

    try {
      let result;
      if (editingId) {
        result = await updateLocation(editingId, {
          name: form.name.trim(),
          label: form.label.trim() || null,
          latitude: validated.lat,
          longitude: validated.lng,
          radius: validated.rad });
      } else {
        result = await addLocation({
          name: form.name.trim(),
          label: form.label.trim() || undefined,
          latitude: validated.lat,
          longitude: validated.lng,
          radius: validated.rad });
      }

      if (result.success) {
        resetForm();
      } else {
        setFeedback(result.error || 'Failed to save');
      }
    } catch {
      setFeedback('Unexpected error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderLocationCard = (loc: UserLocation) => (
    <View key={loc.id} style={[styles.locationCard, !loc.is_active && styles.locationCardInactive]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <ThemedText style={styles.cardName}>{loc.name}</ThemedText>
          {!loc.is_active && <ThemedText style={styles.inactiveBadge}>Inactive</ThemedText>}
        </View>
        {loc.label && <ThemedText style={styles.cardLabel}>{loc.label}</ThemedText>}
      </View>

      <View style={styles.cardDetails}>
        <ThemedText style={styles.detailText}>
          <Ionicons name="pin-outline" size={12} color={COLORS.muted} style={{ marginRight: Spacing.xs }} />
          {loc.latitude.toFixed(6)}, {loc.longitude.toFixed(6)}
        </ThemedText>
        <ThemedText style={styles.detailText}>
          <Ionicons name="resize-outline" size={12} color={COLORS.muted} style={{ marginRight: Spacing.xs }} />
          Radius: {loc.radius}m
        </ThemedText>
      </View>

      <View style={styles.cardActions}>
        <Button label={loc.is_active ? 'Active' : 'Inactive'}
          accessibilityLabel={(loc.is_active ? 'Deactivate ' : 'Activate ') + loc.name}
          intent="secondary" onPress={() => void handleToggle(loc)} />
        <Button label="Edit" accessibilityLabel={'Edit ' + loc.name} icon="create-outline"
          intent="quiet" onPress={() => handleEdit(loc)} />
        <Button label="Delete" accessibilityLabel={'Delete ' + loc.name} icon="trash-outline"
          intent="destructive" onPress={() => handleDelete(loc)} />
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader title="My Places" subtitle={activeLocations.length + ' active, ' + locations.length + ' total'}
          leading={<IconButton icon="chevron-back" label="Back from Saved Places" onPress={() => router.back()} />} style={styles.header} />

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">

          {/* Add/Edit Form */}
          <View style={[styles.formCard, editingId && styles.formCardEditing]}>
            <ThemedText style={styles.formTitle}>
              {editingId ? 'Edit Place' : 'Add New Place'}
            </ThemedText>

            {feedback && <ThemedText style={[styles.feedback, feedback.startsWith('Could not') ? styles.feedbackWarning : styles.feedbackError]}>{feedback}</ThemedText>}

            <Field label="Name *"
              placeholder="e.g., Gym, School, Home"
              value={form.name}
              onChangeText={(v) => setForm((p) => ({ ...p, name: v }))}
              autoCapitalize="words"
              maxLength={30}
            />

            <Field label="Label (optional)"
              placeholder="e.g., Leg Day Spot, Main Campus"
              value={form.label}
              onChangeText={(v) => setForm((p) => ({ ...p, label: v }))}
              autoCapitalize="words"
              maxLength={40}
            />

            <View style={styles.coordsRow}>
              <View style={styles.coordInputWrapper}>
                <Field label="Latitude *"
                  placeholder="40.7128"
                  value={form.latitude}
                  onChangeText={(v) => setForm((p) => ({ ...p, latitude: v }))}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.coordInputWrapper}>
                <Field label="Longitude *"
                  placeholder="-74.0060"
                  value={form.longitude}
                  onChangeText={(v) => setForm((p) => ({ ...p, longitude: v }))}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            <ThemedText style={styles.label}>Choose on map</ThemedText>
            <MapView
              style={styles.map}
              region={{ latitude: mapLatitude, longitude: mapLongitude, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
              onPress={handleMapPress}
              showsUserLocation
              showsMyLocationButton>
              {form.latitude && form.longitude && (
                <>
                  <Circle
                    center={{ latitude: mapLatitude, longitude: mapLongitude }}
                    radius={mapRadius}
                    strokeColor={COLORS.success}
                    fillColor={COLORS.mapRadiusFill}
                    strokeWidth={2}
                  />
                  <Marker coordinate={{ latitude: mapLatitude, longitude: mapLongitude }} title={form.name || 'Saved place'} />
                </>
              )}
            </MapView>

            <Button label="Use Current Location" intent="secondary" icon="locate-outline" onPress={useCurrentLocation} />

            <ThemedText style={styles.label}>Radius (meters) *</ThemedText>
            <View style={styles.radiusControl}>
              <IconButton icon="remove" label="Decrease radius" onPress={() => adjustRadius(-RADIUS_STEP)} />
              <TextInput accessibilityLabel="Radius in meters, required" style={styles.radiusInput}
                placeholder="100"
                value={form.radius}
                onChangeText={(v) => setForm((p) => ({ ...p, radius: v.replace(/[^0-9]/g, '') }))}
                keyboardType="numeric"
                maxLength={4}
                textAlign="center"
              />
              <IconButton icon="add" label="Increase radius" onPress={() => adjustRadius(RADIUS_STEP)} />
            </View>
            <View style={styles.radiusHintRow}>
              <View style={styles.radiusLegend}>
                <View style={styles.radiusLegendDot} />
                <ThemedText style={styles.radiusHint}>Green area: {mapRadius}m coverage</ThemedText>
              </View>
              <ThemedText style={styles.radiusHint}>10–5000m</ThemedText>
            </View>

            <View style={styles.formActions}>
              {editingId && <Button label="Cancel" intent="secondary" onPress={resetForm} />}
              <Button label={editingId ? 'Save Changes' : 'Add Place'} intent="accent"
                loading={isSubmitting} onPress={handleSubmit} style={styles.submitButton} />
            </View>
          </View>

          {/* Locations List */}
          {isLoadingLocations ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.honeyDark} />
              <ThemedText style={styles.loadingText}>Loading places...</ThemedText>
            </View>
          ) : locations.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="location-outline" size={48} color={COLORS.muted} />
              <ThemedText style={styles.emptyTitle}>No places saved</ThemedText>
              <ThemedText style={styles.emptySubtitle}>
                Add your gym, school, home, or any spot to get context-aware quest suggestions.
              </ThemedText>
            </View>
          ) : (
            <>
              <ThemedText style={styles.sectionTitle}>Saved Places</ThemedText>
              {locations.map(renderLocationCard)}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const makeStyles = (COLORS: BeePalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  safeArea: { flex: 1 },
  header: {
    ...ContentColumn,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg },
  content: SectionColumn,
  formCard: { backgroundColor: COLORS.card, borderRadius: Radii.xl, padding: Spacing.gutter, gap: Spacing.lg },
  formCardEditing: { borderWidth: 1.5, borderColor: COLORS.honey },
  formTitle: { ...Typography.item, color: COLORS.ink },
  feedback: { ...Typography.metadata },
  feedbackError: { color: COLORS.danger },
  feedbackWarning: { color: COLORS.honeyDark },
  label: { ...Typography.label, color: COLORS.ink, marginTop: Spacing.xs },
  map: { height: 190, borderRadius: Radii.lg, overflow: 'hidden' },
  radiusControl: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  radiusInput: { ...Typography.body, flex: 1, minWidth: 0, minHeight: Controls.minHeight, backgroundColor: COLORS.surfaceMuted, borderRadius: Radii.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, color: COLORS.ink },
  radiusHintRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.xs },
  radiusLegend: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  radiusLegendDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.success },
  radiusHint: { ...Typography.metadata, color: COLORS.muted },
  coordsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  coordInputWrapper: { flex: 1, minWidth: 140 },
  formActions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginTop: Spacing.xs },
  submitButton: { flexGrow: 1 },
  sectionTitle: { ...Typography.section, color: COLORS.ink, marginTop: Spacing.sm },
  locationCard: { backgroundColor: COLORS.card, borderRadius: Radii.xl, padding: Spacing.gutter, gap: Spacing.md },
  locationCardInactive: { opacity: 0.6, borderWidth: 1, borderColor: COLORS.surfaceMuted },
  cardHeader: { gap: Spacing.half },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  cardName: { ...Typography.label, color: COLORS.ink },
  inactiveBadge: { ...Typography.label, color: COLORS.muted, backgroundColor: COLORS.surfaceMuted, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.half, borderRadius: Radii.sm },
  cardLabel: { ...Typography.metadata, color: COLORS.muted },
  cardDetails: { gap: Spacing.xs, paddingTop: Spacing.half },
  detailText: { ...Typography.metadata, color: COLORS.muted, flexDirection: 'row', alignItems: 'center' },
  cardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.xs },
  loadingContainer: { alignItems: 'center', paddingVertical: Spacing.page, gap: Spacing.md },
  loadingText: { ...Typography.metadata, color: COLORS.muted },
  emptyState: { alignItems: 'center', paddingVertical: Spacing.page, gap: Spacing.md },
  emptyTitle: { ...Typography.item, color: COLORS.ink },
  emptySubtitle: { ...Typography.metadata, color: COLORS.muted, textAlign: 'center', paddingHorizontal: Spacing.gutter } });
