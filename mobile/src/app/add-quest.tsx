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
import { router, useLocalSearchParams } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { VisualTile } from '@/components/bee-visuals';
import { BeeBetterColors as COLORS, BeeBetterShadow } from '@/constants/theme';
import { useUserData, Category } from '@/hooks/use-user-data';
import { getSmartSuggestions, SuggestedQuest } from '@/lib/quest-suggestions';
import { useLocationContext } from '@/context/location-context';

import type { QuestDraft } from '@/context/user-data-context';
import { formatLocalDateTime, parseLocalDateTime, parsePreferredTime } from '@/lib/quest-time';

const categories: Category[] = ['Academics', 'Habits', 'Social', 'Health'];

export default function AddQuestScreen() {
  const { user, addQuest, updateQuest, quests } = useUserData();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editingQuest = quests.find(quest => quest.id === id);
  const isEditing = Boolean(id);
  const { currentLocationName, activeLocations } = useLocationContext();
  const [mode, setMode] = useState<'templates' | 'custom'>(id ? 'custom' : 'templates');
  const [customTitle, setCustomTitle] = useState(editingQuest?.title ?? '');
  const [customDesc, setCustomDesc] = useState(editingQuest?.description ?? '');
  const [category, setCategory] = useState<Category>(editingQuest?.category ?? 'Habits');
  const [isNearby, setIsNearby] = useState(Boolean(editingQuest?.location_id));
  const [locationId, setLocationId] = useState<string | null>(editingQuest?.location_id ?? null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savingTemplateId, setSavingTemplateId] = useState<string | number | null>(null);
  const [requiresProof, setRequiresProof] = useState(editingQuest?.requires_proof ?? false);
  const [scheduledAt, setScheduledAt] = useState(formatLocalDateTime(editingQuest?.scheduled_at));
  const [preferredTime, setPreferredTime] = useState(editingQuest?.preferred_time?.slice(0, 5) ?? '');
  const [deadlineAt, setDeadlineAt] = useState(formatLocalDateTime(editingQuest?.deadline_at));
  const [importance, setImportance] = useState<NonNullable<QuestDraft['importance']>>(editingQuest?.importance ?? 'normal');
  const [prerequisiteId, setPrerequisiteId] = useState<string | null>(editingQuest?.prerequisite_quest_id ?? null);
  const [showContext, setShowContext] = useState(isEditing);
  const prerequisiteOptions = quests.filter(quest => {
    if (quest.id === id) return false;
    const visited = new Set<string>();
    let current: typeof quest | undefined = quest;
    while (current) {
      if (current.id === id || visited.has(current.id)) return false;
      visited.add(current.id);
      current = quests.find(candidate => candidate.id === current?.prerequisite_quest_id);
    }
    return true;
  });

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
    const selectedLocationId = quest.is_nearby ? draftLocationId ?? locationId : null;

    if (quest.is_nearby && !selectedLocationId) {
      setFeedback('Choose a saved place for this nearby quest.');
      return;
    }

    setFeedback(null);
    setIsSaving(true);
    setSavingTemplateId(templateId ?? null);

    try {
      const draft: QuestDraft = {
        title: quest.title.trim(),
        description: quest.description?.trim() || undefined,
        category: quest.category,
        xp: quest.xp,
        is_nearby: quest.is_nearby ?? false,
        location_id: selectedLocationId,
        requires_proof: (quest as QuestDraft).requires_proof ?? false,
        ...('importance' in quest ? {
          scheduled_at: quest.scheduled_at, preferred_time: quest.preferred_time,
          deadline_at: quest.deadline_at, importance: quest.importance,
          prerequisite_quest_id: quest.prerequisite_quest_id,
        } : {}),
      };
      const result = isEditing && id ? await updateQuest(id, draft) : await addQuest(draft);

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

  const createCustomQuest = () => {
    try {
      if (isEditing && (!editingQuest || editingQuest.status === 'completed')) {
        setFeedback('This quest is no longer available to edit.');
        return;
      }
      const scheduled = parseLocalDateTime(scheduledAt);
      const preferred = parsePreferredTime(preferredTime);
      const deadline = parseLocalDateTime(deadlineAt);
      if (scheduled && preferred) throw new Error('Choose a scheduled date or a preferred time, or leave both blank.');
      if (scheduled && deadline && Date.parse(scheduled) > Date.parse(deadline)) {
        throw new Error('The deadline must be on or after the scheduled time.');
      }
      void saveQuest({
        title: customTitle, description: customDesc, category, xp: editingQuest?.xp ?? 25,
        is_nearby: isNearby, location_id: isNearby ? locationId : null, requires_proof: requiresProof,
        scheduled_at: scheduled, preferred_time: preferred, deadline_at: deadline,
        importance, prerequisite_quest_id: prerequisiteId,
      });
    } catch (error) { setFeedback(error instanceof Error ? error.message : 'Check your quest details.'); }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <ThemedText style={styles.headerTitle}>{isEditing ? 'Edit quest' : 'New quest'}</ThemedText>
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
        {!isEditing && <View style={styles.toggleRow}>
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
        </View>}

        <View style={styles.sheetIntro}>
          <View style={styles.sheetIntroIcon}><Ionicons name="sparkles" size={22} color={COLORS.honeyDeep} /></View>
          <View style={styles.sheetIntroCopy}><ThemedText style={styles.sheetIntroTitle}>A little win is waiting.</ThemedText><ThemedText style={styles.sheetIntroText}>Pick something that feels useful, doable, and yours.</ThemedText></View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRail}>
          <VisualTile icon="book-outline" label="Learn" color={COLORS.lavender} onPress={() => setCategory('Academics')} />
          <VisualTile icon="leaf-outline" label="Habits" color={COLORS.honeySoft} onPress={() => setCategory('Habits')} />
          <VisualTile icon="people-outline" label="Connect" color={COLORS.peach} onPress={() => setCategory('Social')} />
          <VisualTile icon="heart-outline" label="Health" color={COLORS.mint} onPress={() => setCategory('Health')} />
        </ScrollView>

        {feedback && <ThemedText style={styles.feedback}>{feedback}</ThemedText>}

        {mode === 'templates' ? (
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <ThemedText style={styles.sectionLabel}>QUICK-START IDEAS</ThemedText>
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
                <ThemedText style={styles.locationToggleTitle}>Use a saved place</ThemedText>
                <ThemedText style={styles.locationToggleSubtitle}>
                  Optional. Recommend this quest when you are nearby.
                </ThemedText>
              </View>
              <Switch
                value={isNearby}
                onValueChange={(value) => { setIsNearby(value); if (!value) setLocationId(null); }}
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

            <TouchableOpacity style={styles.placeOption} accessibilityRole="button" accessibilityState={{ expanded: showContext }} onPress={() => setShowContext(!showContext)}>
              <ThemedText style={styles.placeOptionText}>Timing & priority (optional)</ThemedText>
              <Ionicons name={showContext ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.ink} />
            </TouchableOpacity>
            {showContext && (
              <View style={styles.placePicker}>
                <ThemedText style={styles.placeHint}>Leave timing blank for an anytime quest. Times use this device's local timezone. Preferences guide recommendations; you can still choose any quest.</ThemedText>
                <ThemedText style={styles.label}>Scheduled date & time</ThemedText>
                <TextInput style={styles.input} accessibilityLabel="Scheduled date and time, optional" placeholder="YYYY-MM-DD HH:mm" placeholderTextColor={COLORS.muted} value={scheduledAt} onChangeText={setScheduledAt} autoCapitalize="none" />
                <ThemedText style={styles.label}>Or preferred time of day</ThemedText>
                <TextInput style={styles.input} accessibilityLabel="Preferred time of day, optional" placeholder="HH:mm (24-hour)" placeholderTextColor={COLORS.muted} value={preferredTime} onChangeText={setPreferredTime} autoCapitalize="none" />
                <ThemedText style={styles.placeHint}>A preferred time does not automatically repeat a completed quest.</ThemedText>
                <ThemedText style={styles.label}>Deadline</ThemedText>
                <TextInput style={styles.input} accessibilityLabel="Deadline, optional" placeholder="YYYY-MM-DD HH:mm" placeholderTextColor={COLORS.muted} value={deadlineAt} onChangeText={setDeadlineAt} autoCapitalize="none" />
                <ThemedText style={styles.label}>Importance</ThemedText>
                <View style={styles.categoryRow}>
                  {(['low', 'normal', 'high'] as const).map(value => (
                    <TouchableOpacity key={value} style={[styles.categoryPill, importance === value && styles.categoryPillActive]} accessibilityRole="button" accessibilityState={{ selected: importance === value }} onPress={() => setImportance(value)}>
                      <ThemedText style={styles.categoryPillText}>{value === 'low' ? 'Low' : value === 'high' ? 'High' : 'Normal'}</ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>
                <ThemedText style={styles.label}>Do after (optional)</ThemedText>
                <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                  <TouchableOpacity style={[styles.placeOption, !prerequisiteId && styles.placeOptionActive]} onPress={() => setPrerequisiteId(null)}>
                    <ThemedText style={styles.placeOptionText}>No prerequisite</ThemedText>
                  </TouchableOpacity>
                  {prerequisiteOptions.map(quest => (
                    <TouchableOpacity key={quest.id} style={[styles.placeOption, prerequisiteId === quest.id && styles.placeOptionActive]} onPress={() => setPrerequisiteId(quest.id)}>
                      <ThemedText style={styles.placeOptionText}>{quest.title}</ThemedText>
                      {prerequisiteId === quest.id && <Ionicons name="checkmark" size={18} color={COLORS.ink} />}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            <View style={styles.xpHint}>
              <Ionicons name="sparkles" size={16} color={COLORS.honeyDark} />
              <ThemedText style={styles.xpHintText}>{isEditing ? `This quest is worth ${editingQuest?.xp ?? 25} XP.` : 'Custom quests are worth 25 XP.'}</ThemedText>
            </View>

            <TouchableOpacity
              style={[styles.createButton, isSaving && styles.createButtonDisabled]}
              onPress={createCustomQuest}
              disabled={isSaving}
              activeOpacity={0.8}>
              {isSaving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <ThemedText style={styles.createButtonText}>{isEditing ? 'Save changes' : 'Create quest'}</ThemedText>
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
  sheetIntro: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 20, marginBottom: 4, padding: 14, borderRadius: 22, backgroundColor: COLORS.surfaceWarm, borderWidth: 1, borderColor: '#F4DFAE' },
  sheetIntroIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.honey },
  sheetIntroCopy: { flex: 1 },
  sheetIntroTitle: { color: COLORS.ink, fontSize: 15, fontWeight: '900' },
  sheetIntroText: { color: COLORS.muted, fontSize: 11, lineHeight: 15, marginTop: 2 },
  categoryRail: { gap: 10, paddingHorizontal: 20, paddingVertical: 5 },
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
