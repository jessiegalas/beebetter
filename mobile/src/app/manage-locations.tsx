import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Circle, Marker, type MapPressEvent } from 'react-native-maps';
import { router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { BeeBetterColors as COLORS, BeeBetterShadow } from '@/constants/theme';
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
    getCurrentPosition,
  } = useLocationContext();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<LocationForm>({
    name: '',
    label: '',
    latitude: '',
    longitude: '',
    radius: String(DEFAULT_RADIUS),
  });
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
      radius: String(loc.radius),
    });
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
          },
        },
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
          radius: validated.rad,
        });
      } else {
        result = await addLocation({
          name: form.name.trim(),
          label: form.label.trim() || undefined,
          latitude: validated.lat,
          longitude: validated.lng,
          radius: validated.rad,
        });
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
          <Ionicons name="pin-outline" size={12} color={COLORS.muted} style={{ marginRight: 4 }} />
          {loc.latitude.toFixed(6)}, {loc.longitude.toFixed(6)}
        </ThemedText>
        <ThemedText style={styles.detailText}>
          <Ionicons name="resize-outline" size={12} color={COLORS.muted} style={{ marginRight: 4 }} />
          Radius: {loc.radius}m
        </ThemedText>
      </View>

      <View style={styles.cardActions}>
        <TouchableOpacity
          style={[
            styles.actionButton,
            loc.is_active ? styles.actionButtonActive : styles.actionButtonInactive,
          ]}
          onPress={() => handleToggle(loc)}>
          <Ionicons name={loc.is_active ? 'checkmark-circle' : 'radio-button-off'} size={16} color="#fff" />
          <ThemedText style={styles.actionButtonText}>{loc.is_active ? 'Active' : 'Inactive'}</ThemedText>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButtonEdit}
          onPress={() => handleEdit(loc)}>
          <Ionicons name="create-outline" size={16} color={COLORS.ink} />
          <ThemedText style={styles.actionButtonTextEdit}>Edit</ThemedText>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButtonDelete}
          onPress={() => handleDelete(loc)}>
          <Ionicons name="trash-outline" size={16} color={COLORS.danger} />
          <ThemedText style={styles.actionButtonTextDelete}>Delete</ThemedText>
        </TouchableOpacity>
      </View>
    </View>
  );

  const submitButtonStyle = [
    styles.submitButton,
    isSubmitting && styles.submitButtonDisabled,
    editingId && styles.submitButtonEditing,
  ];

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={24} color={COLORS.ink} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <ThemedText style={styles.headerTitle}>My Places</ThemedText>
            <ThemedText style={styles.headerSubtitle}>
              {activeLocations.length} active, {locations.length} total
            </ThemedText>
          </View>
          <View style={styles.headerSpacer} />
        </View>

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

            <ThemedText style={styles.label}>Name *</ThemedText>
            <TextInput
              style={styles.input}
              placeholder="e.g., Gym, School, Home"
              value={form.name}
              onChangeText={(v) => setForm((p) => ({ ...p, name: v }))}
              autoCapitalize="words"
              maxLength={30}
            />

            <ThemedText style={styles.label}>Label (optional)</ThemedText>
            <TextInput
              style={styles.input}
              placeholder="e.g., Leg Day Spot, Main Campus"
              value={form.label}
              onChangeText={(v) => setForm((p) => ({ ...p, label: v }))}
              autoCapitalize="words"
              maxLength={40}
            />

            <View style={styles.coordsRow}>
              <View style={styles.coordInputWrapper}>
                <ThemedText style={styles.label}>Latitude *</ThemedText>
                <TextInput
                  style={styles.input}
                  placeholder="40.7128"
                  value={form.latitude}
                  onChangeText={(v) => setForm((p) => ({ ...p, latitude: v }))}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.coordInputWrapper}>
                <ThemedText style={styles.label}>Longitude *</ThemedText>
                <TextInput
                  style={styles.input}
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
                    strokeColor="#2E9B62"
                    fillColor="rgba(46, 155, 98, 0.22)"
                    strokeWidth={2}
                  />
                  <Marker coordinate={{ latitude: mapLatitude, longitude: mapLongitude }} title={form.name || 'Saved place'} />
                </>
              )}
            </MapView>

            <TouchableOpacity style={styles.currentLocationButton} onPress={useCurrentLocation} activeOpacity={0.8}>
              <ThemedText style={styles.currentLocationButtonText}>Use Current Location</ThemedText>
            </TouchableOpacity>

            <ThemedText style={styles.label}>Radius (meters) *</ThemedText>
            <View style={styles.radiusControl}>
              <TouchableOpacity
                style={styles.radiusButton}
                onPress={() => adjustRadius(-RADIUS_STEP)}
                accessibilityLabel="Decrease radius"
                activeOpacity={0.75}>
                <Ionicons name="remove" size={20} color={COLORS.ink} />
              </TouchableOpacity>
              <TextInput
                style={styles.radiusInput}
                placeholder="100"
                value={form.radius}
                onChangeText={(v) => setForm((p) => ({ ...p, radius: v.replace(/[^0-9]/g, '') }))}
                keyboardType="numeric"
                maxLength={4}
                textAlign="center"
              />
              <TouchableOpacity
                style={styles.radiusButton}
                onPress={() => adjustRadius(RADIUS_STEP)}
                accessibilityLabel="Increase radius"
                activeOpacity={0.75}>
                <Ionicons name="add" size={20} color={COLORS.ink} />
              </TouchableOpacity>
            </View>
            <View style={styles.radiusHintRow}>
              <View style={styles.radiusLegend}>
                <View style={styles.radiusLegendDot} />
                <ThemedText style={styles.radiusHint}>Green area: {mapRadius}m coverage</ThemedText>
              </View>
              <ThemedText style={styles.radiusHint}>10–5000m</ThemedText>
            </View>

            <View style={styles.formActions}>
              {editingId && (
                <TouchableOpacity style={styles.cancelButton} onPress={resetForm} activeOpacity={0.8}>
                  <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={submitButtonStyle}
                onPress={handleSubmit}
                disabled={isSubmitting}
                activeOpacity={0.8}>
                {isSubmitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <ThemedText style={styles.submitButtonText}>
                    {editingId ? 'Save Changes' : 'Add Place'}
                  </ThemedText>
                )}
              </TouchableOpacity>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    gap: 12,
  },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center', ...BeeBetterShadow },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 19, fontWeight: '800', color: COLORS.ink },
  headerSubtitle: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  headerSpacer: { width: 40 },
  content: { paddingHorizontal: 20, paddingBottom: 40, gap: 16 },
  formCard: { backgroundColor: COLORS.card, borderRadius: 18, padding: 18, gap: 14, ...BeeBetterShadow },
  formCardEditing: { borderWidth: 1.5, borderColor: COLORS.honey },
  formTitle: { fontSize: 16, fontWeight: '800', color: COLORS.ink },
  feedback: { fontSize: 12, lineHeight: 18 },
  feedbackError: { color: COLORS.danger },
  feedbackWarning: { color: COLORS.honeyDark },
  label: { fontSize: 12, fontWeight: '800', color: COLORS.ink, marginTop: 4 },
  input: { backgroundColor: COLORS.surfaceMuted, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: COLORS.ink },
  map: { height: 190, borderRadius: 14, overflow: 'hidden' },
  radiusControl: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  radiusButton: { width: 42, height: 42, borderRadius: 12, backgroundColor: COLORS.honeySoft, alignItems: 'center', justifyContent: 'center' },
  radiusInput: { flex: 1, backgroundColor: COLORS.surfaceMuted, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, fontWeight: '800', color: COLORS.ink },
  radiusHintRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: -6 },
  radiusLegend: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  radiusLegendDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#2E9B62' },
  radiusHint: { fontSize: 11, color: COLORS.muted },
  coordsRow: { flexDirection: 'row', gap: 10 },
  coordInputWrapper: { flex: 1 },
  currentLocationButton: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: COLORS.honeySoft, borderRadius: 12 },
  currentLocationButtonText: { color: COLORS.honeyDark, fontSize: 12, fontWeight: '700' },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelButton: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: COLORS.surfaceMuted },
  cancelButtonText: { color: COLORS.muted, fontSize: 13, fontWeight: '800' },
  submitButton: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: COLORS.ink, ...BeeBetterShadow },
  submitButtonEditing: { flex: 1 },
  submitButtonDisabled: { opacity: 0.65 },
  submitButtonText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: COLORS.ink, marginTop: 8 },
  locationCard: { backgroundColor: COLORS.card, borderRadius: 16, padding: 14, gap: 10, ...BeeBetterShadow },
  locationCardInactive: { opacity: 0.6, borderWidth: 1, borderColor: COLORS.surfaceMuted },
  cardHeader: { gap: 2 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardName: { fontSize: 14, fontWeight: '800', color: COLORS.ink },
  inactiveBadge: { fontSize: 10, fontWeight: '700', color: COLORS.muted, backgroundColor: COLORS.surfaceMuted, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  cardLabel: { fontSize: 11, color: COLORS.muted },
  cardDetails: { gap: 4, paddingTop: 2 },
  detailText: { fontSize: 11, color: COLORS.muted, flexDirection: 'row', alignItems: 'center' },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  actionButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 10 },
  actionButtonActive: { backgroundColor: COLORS.honey },
  actionButtonInactive: { backgroundColor: COLORS.surfaceMuted },
  actionButtonText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  actionButtonEdit: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 10, backgroundColor: COLORS.surfaceMuted, borderWidth: 1, borderColor: COLORS.honey },
  actionButtonTextEdit: { color: COLORS.honeyDark, fontSize: 11, fontWeight: '800' },
  actionButtonDelete: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 10, backgroundColor: '#FDEDEC' },
  actionButtonTextDelete: { color: COLORS.danger, fontSize: 11, fontWeight: '800' },
  loadingContainer: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  loadingText: { color: COLORS.muted, fontSize: 12 },
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: COLORS.ink },
  emptySubtitle: { color: COLORS.muted, fontSize: 12, textAlign: 'center', paddingHorizontal: 20 },
});