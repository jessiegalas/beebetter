import { useState, useMemo } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { BeeBetterColors as COLORS, BeeBetterShadow } from '@/constants/theme';
import { useUserData, Category } from '@/hooks/use-user-data';
import { getSmartSuggestions, SuggestedQuest } from '@/lib/quest-suggestions';
import { useLocationContext } from '@/context/location-context';

type QuestDraft = {
  title: string;
  description?: string;
  category: Category;
  xp: number;
  is_nearby?: boolean;
  location_id?: string | null;
  requires_proof?: boolean;
};

const categories: Category[] = ['Academics', 'Habits', 'Social', 'Health'];

export default function AddQuestScreen() {
  const { user, addQuest, quests } = useUserData();
  const { currentLocationName, activeLocations } = useLocationContext();
  const [mode, setMode] = useState<'templates' | 'custom'>('templates');
  const [customTitle, setCustomTitle] = useState('');
  const [customDesc, setCustomDesc] = useState('');
  const [category, setCategory] = useState<Category>('Habits');
  const [isNearby, setIsNearby] = useState(false);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savingTemplateId, setSavingTemplateId] = useState<string | number | null>(null);
  const [requiresProof, setRequiresProof] = useState(false);

  const smartSuggestions = useMemo(() => {
    return getSmartSuggestions(quests, currentLocationName);
  }, [quests, currentLocationName]);

  const saveQuest = async (quest: QuestDraft | SuggestedQuest, templateId?: string | number) => {
    if (!quest.title.trim()) {
      setFeedback('Give your quest a title first.');
      return;
    }

    if (!user) {
      setFeedback('Sign in first so this quest can be saved to your account.');
      router.push('/auth');
      return;
    }

    const draftLocationId = 'location_id' in quest ? quest.location_id : null;
    const selectedLocationId = draftLocationId ?? (quest.is_nearby ? locationId : null);

    if (quest.is_nearby && !selectedLocationId) {
      setFeedback('Choose a saved place for this nearby quest.');
      return;
    }

    setFeedback(null);
    setIsSaving(true);
    setSavingTemplateId(templateId ?? null);

    try {
      const result = await addQuest({
        title: quest.title.trim(),
        description: quest.description?.trim() || undefined,
        category: quest.category,
        xp: quest.xp,
        is_nearby: quest.is_nearby ?? false,
        location_id: selectedLocationId,
        requires_proof: (quest as QuestDraft).requires_proof ?? false,
      });

      if (!result.success) {
        setFeedback(result.error || 'Failed to save quest. Please try again.');
        return;
      }

      router.back();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Quest could not be saved. Please try again.');
    } finally {
      setIsSaving(false);
      setSavingTemplateId(null);
    }
  };

  const createCustomQuest = () =>
    saveQuest({
      title: customTitle,
      description: customDesc,
      category,
      xp: 25,
      is_nearby: isNearby,
      location_id: locationId,
      requires_proof: requiresProof,
    });

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <ThemedText style={styles.headerTitle}>New quest</ThemedText>
            <ThemedText style={styles.headerSubtitle}>Make a small promise to yourself.</ThemedText>
          </View>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => router.back()}
            activeOpacity={0.7}>
            <Ionicons name="close" size={20} color={COLORS.ink} />
          </TouchableOpacity>
        </View>

        {/* Mode Toggle */}
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleButton, mode === 'templates' && styles.toggleButtonActive]}
            onPress={() => {
              setMode('templates');
              setFeedback(null);
            }}>
            <ThemedText style={[styles.toggleText, mode === 'templates' && styles.toggleTextActive]}>
              Quick start
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleButton, mode === 'custom' && styles.toggleButtonActive]}
            onPress={() => {
              setMode('custom');
              setFeedback(null);
            }}>
            <ThemedText style={[styles.toggleText, mode === 'custom' && styles.toggleTextActive]}>
              Custom
            </ThemedText>
          </TouchableOpacity>
        </View>

        {feedback && <ThemedText style={styles.feedback}>{feedback}</ThemedText>}

        {mode === 'templates' ? (
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <ThemedText style={styles.sectionLabel}>RECOMMENDED FOR YOU</ThemedText>
            {smartSuggestions.map((template) => (
              <TouchableOpacity
                key={template.id}
                style={styles.templateCard}
                onPress={() => saveQuest(template, template.id)}
                disabled={isSaving}
                activeOpacity={0.78}>
                <View style={styles.iconWrap}>
                  {savingTemplateId === template.id ? (
                    <ActivityIndicator color={COLORS.honeyDark} />
                  ) : (
                    <Ionicons name={template.icon} size={20} color={COLORS.honeyDark} />
                  )}
                </View>
                <View style={styles.templateInfo}>
                  <View style={styles.templateTitleRow}>
                    <ThemedText style={styles.templateTitle}>{template.title}</ThemedText>
                    {template.is_nearby && (
                      <Ionicons name="location" size={12} color={COLORS.honeyDark} />
                    )}
                  </View>
                  <View style={styles.reasonRow}>
                    <Ionicons name={template.reason.icon} size={10} color={COLORS.muted} />
                    <ThemedText style={styles.templateReason}>{template.reason.text}</ThemedText>
                  </View>
                </View>
                <View style={styles.xpTag}>
                  <ThemedText style={styles.xpTagText}>+{template.xp} XP</ThemedText>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled">
            <ThemedText style={styles.label}>Quest title</ThemedText>
            <TextInput
              style={styles.input}
              placeholder="For example, clean my desk"
              placeholderTextColor={COLORS.muted}
              value={customTitle}
              onChangeText={setCustomTitle}
              maxLength={100}
            />

            <ThemedText style={styles.label}>Description (optional)</ThemedText>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="What does completing this quest involve?"
              placeholderTextColor={COLORS.muted}
              multiline
              value={customDesc}
              onChangeText={setCustomDesc}
              textAlignVertical="top"
            />

            <ThemedText style={styles.label}>Category</ThemedText>
            <View style={styles.categoryRow}>
              {categories.map((item) => (
                <TouchableOpacity
                  key={item}
                  style={[styles.categoryPill, category === item && styles.categoryPillActive]}
                  onPress={() => setCategory(item)}>
                  <ThemedText
                    style={[
                      styles.categoryPillText,
                      category === item && styles.categoryPillTextActive,
                    ]}>
                    {item}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </View>

            {/* Nearby Quest Toggle */}
            <View style={styles.locationToggleCard}>
              <View style={styles.locationToggleCopy}>
                <ThemedText style={styles.locationToggleTitle}>Tag as nearby quest</ThemedText>
                <ThemedText style={styles.locationToggleSubtitle}>
                  Flags this quest as tied to a physical place or location
                </ThemedText>
              </View>
              <Switch
                value={isNearby}
                onValueChange={setIsNearby}
                trackColor={{ false: COLORS.surfaceMuted, true: COLORS.honey }}
                thumbColor="#FFFFFF"
              />
            </View>

            {isNearby && (
              <View style={styles.placePicker}>
                <ThemedText style={styles.label}>Quest place</ThemedText>
                {activeLocations.length === 0 ? (
                  <ThemedText style={styles.placeHint}>Add an active place in My Places first.</ThemedText>
                ) : activeLocations.map((place) => (
                  <TouchableOpacity
                    key={place.id}
                    style={[styles.placeOption, locationId === place.id && styles.placeOptionActive]}
                    onPress={() => setLocationId(place.id)}>
                    <Ionicons name="location-outline" size={16} color={COLORS.honeyDark} />
                    <ThemedText style={styles.placeOptionText}>{place.name}</ThemedText>
                    {locationId === place.id && <Ionicons name="checkmark-circle" size={17} color={COLORS.honeyDark} />}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.locationToggleCard}>
              <View style={styles.locationToggleCopy}>
                <ThemedText style={styles.locationToggleTitle}>Require proof to complete</ThemedText>
                <ThemedText style={styles.locationToggleSubtitle}>
                  Ask for a photo, video, or file before XP is awarded
                </ThemedText>
              </View>
              <Switch
                value={requiresProof}
                onValueChange={setRequiresProof}
                trackColor={{ false: COLORS.surfaceMuted, true: COLORS.honey }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={styles.xpHint}>
              <Ionicons name="sparkles" size={16} color={COLORS.honeyDark} />
              <ThemedText style={styles.xpHintText}>Custom quests are worth 25 XP.</ThemedText>
            </View>

            <TouchableOpacity
              style={[styles.createButton, isSaving && styles.createButtonDisabled]}
              onPress={createCustomQuest}
              disabled={isSaving}
              activeOpacity={0.8}>
              {isSaving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <ThemedText style={styles.createButtonText}>Create quest</ThemedText>
              )}
            </TouchableOpacity>
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  safeArea: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 15 },
  headerTitle: { color: COLORS.ink, fontSize: 19, fontWeight: '800' },
  headerSubtitle: { color: COLORS.muted, fontSize: 11, marginTop: 3 },
  closeButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center', ...BeeBetterShadow },
  toggleRow: { flexDirection: 'row', marginHorizontal: 20, backgroundColor: COLORS.surfaceMuted, borderRadius: 13, padding: 4, marginBottom: 10 },
  toggleButton: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10 },
  toggleButtonActive: { backgroundColor: COLORS.card, ...BeeBetterShadow },
  toggleText: { color: COLORS.muted, fontSize: 12, fontWeight: '800' },
  toggleTextActive: { color: COLORS.ink },
  feedback: { color: COLORS.danger, fontSize: 12, lineHeight: 17, marginHorizontal: 20, marginBottom: 4 },
  content: { paddingHorizontal: 20, paddingBottom: 44, gap: 11 },
  sectionLabel: { color: COLORS.muted, fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginTop: 4, marginBottom: 2 },
  templateCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.card, borderRadius: 16, padding: 12, ...BeeBetterShadow },
  iconWrap: { width: 42, height: 42, borderRadius: 13, backgroundColor: COLORS.honeySoft, alignItems: 'center', justifyContent: 'center' },
  templateInfo: { flex: 1 },
  templateTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  templateTitle: { color: COLORS.ink, fontSize: 14, fontWeight: '800' },
  reasonRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  templateReason: { color: COLORS.muted, fontSize: 11 },
  xpTag: { backgroundColor: COLORS.honey, borderRadius: 14, paddingHorizontal: 9, paddingVertical: 6 },
  xpTagText: { color: COLORS.ink, fontSize: 10, fontWeight: '800' },
  label: { color: COLORS.ink, fontSize: 12, fontWeight: '800', marginTop: 5 },
  input: { backgroundColor: COLORS.card, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 13, fontSize: 14, color: COLORS.ink, ...BeeBetterShadow },
  textArea: { height: 96 },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryPill: { borderRadius: 18, paddingHorizontal: 13, paddingVertical: 8, backgroundColor: COLORS.card, ...BeeBetterShadow },
  categoryPillActive: { backgroundColor: COLORS.honey },
  categoryPillText: { color: COLORS.muted, fontSize: 11, fontWeight: '800' },
  categoryPillTextActive: { color: COLORS.ink },
  locationToggleCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.card, borderRadius: 14, padding: 12, marginTop: 4, ...BeeBetterShadow },
  locationToggleCopy: { flex: 1 },
  locationToggleTitle: { fontSize: 13, fontWeight: '800', color: COLORS.ink },
  locationToggleSubtitle: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  placePicker: { gap: 8 },
  placeHint: { color: COLORS.muted, fontSize: 12 },
  placeOption: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, backgroundColor: COLORS.card },
  placeOptionActive: { backgroundColor: COLORS.honeySoft, borderWidth: 1, borderColor: COLORS.honey },
  placeOptionText: { flex: 1, color: COLORS.ink, fontSize: 13, fontWeight: '700' },
  xpHint: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: COLORS.honeySoft, borderRadius: 13, padding: 12, marginTop: 3 },
  xpHintText: { color: COLORS.ink, fontSize: 12, fontWeight: '700' },
  createButton: { minHeight: 48, borderRadius: 13, backgroundColor: COLORS.ink, alignItems: 'center', justifyContent: 'center', marginTop: 5 },
  createButtonDisabled: { opacity: 0.65 },
  createButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
});

