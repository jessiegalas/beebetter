import { useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Switch, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { QuestTimeInput } from '@/components/quest-time-input';
import { BeeBetterColors as C, MaxContentWidth } from '@/constants/theme';
import { useUserData, type Quest } from '@/hooks/use-user-data';
import { useQuestCategories } from '@/hooks/use-quest-categories';
import { useLocationContext } from '@/context/location-context';
import { getQuestIdeas } from '@/lib/quest-suggestions';
import { formatLocalDateTime, parseLocalDateTime, parsePreferredTime, validateQuestDates } from '@/lib/quest-time';

export default function AddQuestScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { quests, isLoading, error, refresh } = useUserData();
  const quest = quests.find(item => item.id === id);
  if (id && (isLoading || !quest || quest.status === 'completed')) return <SafeAreaView style={s.screen}><View style={s.content}>
    <Button label="Back" onPress={() => router.back()} />
    {isLoading ? <ActivityIndicator color={C.honeyDark} /> : <ThemedText>{error ? 'Could not load quest.' : 'This quest is no longer available to edit.'}</ThemedText>}
    {!!error && <Button label="Try again" onPress={() => void refresh()} />}
  </View></SafeAreaView>;
  // Mount only after saved data is available; background refreshes must not overwrite edits.
  return <QuestForm key={id ?? 'new'} quest={quest} />;
}
function QuestForm({ quest }: { quest?: Quest }) {
  const { user, quests, addQuest, updateQuest } = useUserData();
  const { activeLocations, isLoadingLocations } = useLocationContext();
  const { categories, loading, error, refresh, createCategory } = useQuestCategories();
  const [title, setTitle] = useState(quest?.title ?? '');
  const [description, setDescription] = useState(quest?.description ?? '');
  const [category, setCategory] = useState(quest?.category ?? '');
  const [xp, setXp] = useState(quest?.xp ?? 25);
  const [mode, setMode] = useState<'custom' | 'templates'>('custom');
  const [scheduleMode, setScheduleMode] = useState<'anytime' | 'scheduled' | 'preferred'>(quest?.scheduled_at ? 'scheduled' : quest?.preferred_time ? 'preferred' : 'anytime');
  const [scheduled, setScheduled] = useState(formatLocalDateTime(quest?.scheduled_at));
  const [preferred, setPreferred] = useState(quest?.preferred_time?.slice(0, 5) ?? '');
  const [deadline, setDeadline] = useState(formatLocalDateTime(quest?.deadline_at));
  const [hasDeadline, setHasDeadline] = useState(!!quest?.deadline_at);
  const [importance, setImportance] = useState(quest?.importance ?? 'normal');
  const [location, setLocation] = useState<string | null>(quest?.location_id ?? null);
  const [proof, setProof] = useState(quest?.requires_proof ?? false);
  const [prerequisite, setPrerequisite] = useState<string | null>(quest?.prerequisite_quest_id ?? null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const prerequisiteOptions = quests.filter(item => {
    const seen = new Set<string>(); let current: Quest | undefined = item;
    while (current) { if (current.id === quest?.id || seen.has(current.id)) return false; seen.add(current.id); current = quests.find(q => q.id === current?.prerequisite_quest_id); }
    return true;
  });
  const save = async () => {
    if (savingRef.current) return;
    setFeedback(null);
    try {
      if (!user) throw new Error('Sign in to save your quest.');
      if (!title.trim()) throw new Error('Give your quest a name.');
      if (!category || !categories.some(c => c.name === category)) throw new Error('Choose an available category.');
      const scheduled_at = scheduleMode === 'scheduled' ? parseLocalDateTime(scheduled) : null;
      const preferred_time = scheduleMode === 'preferred' ? parsePreferredTime(preferred) : null;
      const deadline_at = hasDeadline ? parseLocalDateTime(deadline) : null;
      if (scheduleMode === 'scheduled' && !scheduled_at) throw new Error('Choose a scheduled date and time.');
      if (scheduleMode === 'preferred' && !preferred_time) throw new Error('Choose a preferred time.');
      if (hasDeadline && !deadline_at) throw new Error('Choose a deadline or turn it off.');
      validateQuestDates(scheduled_at, deadline_at);
      savingRef.current = true; setSaving(true);
      const draft = { title: title.trim(), description: description.trim(), category, xp, scheduled_at, preferred_time, deadline_at, importance, location_id: location, is_nearby: !!location, requires_proof: proof, prerequisite_quest_id: prerequisite };
      const result = quest ? await updateQuest(quest.id, draft) : await addQuest(draft);
      if (!result.success) throw new Error(result.error || 'Could not save quest. Please try again.');
      router.back();
    } catch (failure) { setFeedback(failure instanceof Error ? failure.message : 'Could not save quest. Please try again.'); }
    finally { savingRef.current = false; setSaving(false); }
  };
  const addCategory = async () => {
    if (creatingCategory) return;
    setCreatingCategory(true); setCategoryError(null);
    try { const created = await createCategory(newCategory); setCategory(created.name); setNewCategory(''); setCategoryOpen(false); }
    catch (failure) { setCategoryError(failure instanceof Error ? failure.message : 'Could not create category.'); }
    finally { setCreatingCategory(false); }
  };
  return <SafeAreaView style={s.screen}>
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={s.header}><View style={s.flex}><ThemedText style={s.heading}>{quest ? 'Edit quest' : 'New quest'}</ThemedText><ThemedText style={s.hint}>Make a small promise to yourself.</ThemedText></View><TouchableOpacity style={s.iconButton} accessibilityRole="button" accessibilityLabel="Close quest form" onPress={() => router.back()}><Ionicons name="close" size={22} color={C.ink} /></TouchableOpacity></View>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {!quest && <View style={s.row}><Choice label="Quick start" selected={mode === 'templates'} onPress={() => setMode('templates')} /><Choice label="Custom" selected={mode === 'custom'} onPress={() => setMode('custom')} /></View>}
        <View style={s.intro}><ThemedText style={s.label}>A little win is waiting.</ThemedText><ThemedText style={s.hint}>Pick something useful, doable, and yours.</ThemedText></View>
        {mode === 'templates' ? <>
          <ThemedText style={s.hint}>Choose an idea, then make it your own.</ThemedText>
          {getQuestIdeas().map(idea => <TouchableOpacity key={idea.id} style={s.option} accessibilityRole="button" onPress={() => { setTitle(idea.title); setDescription(idea.description ?? ''); setCategory(categories.find(c => c.name === idea.category)?.name ?? ''); setXp(idea.xp); setMode('custom'); }}><Ionicons name={idea.icon} size={20} color={C.honeyDark} /><ThemedText style={[s.label, s.flex]}>{idea.title}</ThemedText><ThemedText style={s.hint}>+{idea.xp} XP</ThemedText></TouchableOpacity>)}
        </> : <>
          <ThemedText style={s.sectionTitle}>Quest details</ThemedText>
          <ThemedText style={s.label}>Quest name</ThemedText>
          <TextInput accessibilityLabel="Quest name" style={s.input} placeholder="e.g. Review my notes" placeholderTextColor={C.muted} value={title} onChangeText={setTitle} maxLength={100} />
          <ThemedText style={s.label}>Description (optional)</ThemedText>
          <TextInput accessibilityLabel="Description, optional" style={[s.input, s.textArea]} placeholder="What would you like to accomplish?" placeholderTextColor={C.muted} value={description} onChangeText={setDescription} multiline textAlignVertical="top" />
          <ThemedText style={s.label}>Category</ThemedText>
          <TouchableOpacity style={s.option} accessibilityRole="button" accessibilityLabel="Choose category" onPress={() => setCategoryOpen(true)}><ThemedText style={[s.label, s.flex]}>{category || 'Choose a category'}</ThemedText><Ionicons name="chevron-down" size={18} color={C.muted} /></TouchableOpacity>
          <Button label="Create new category" onPress={() => setCategoryOpen(true)} />
          {!!error && <View><ThemedText style={s.error}>{error}</ThemedText><Button label="Reload categories" onPress={() => void refresh()} /></View>}
          <View style={s.divider} />
          <ThemedText style={s.sectionTitle}>Optional settings</ThemedText>
          <ThemedText style={s.hint}>Customize how and when your quest fits into your day.</ThemedText>
          <View style={s.sections}>
            <Section title="Timing & schedule" icon="time-outline" summary={scheduleMode === 'anytime' ? 'Anytime' : scheduleMode === 'scheduled' ? scheduled || 'Choose a date and time' : preferred ? 'Preferred at ' + preferred : 'Choose a preferred time'}>
              <View style={s.row}>{(['anytime', 'scheduled', 'preferred'] as const).map(value => <Choice key={value} label={value === 'anytime' ? 'Anytime' : value === 'scheduled' ? 'Scheduled' : 'Preferred time'} selected={scheduleMode === value} onPress={() => setScheduleMode(value)} />)}</View>
              {scheduleMode === 'scheduled' && <QuestTimeInput label="Scheduled date & time" value={scheduled} onChange={setScheduled} />}
              {scheduleMode === 'preferred' && <><QuestTimeInput label="Preferred time of day" timeOnly value={preferred} onChange={setPreferred} /><ThemedText style={s.hint}>A preferred time does not repeat a completed quest.</ThemedText></>}
            </Section>
            <Section title="Location & geofencing" icon="location-outline" summary={location ? activeLocations.find(p => p.id === location)?.name ?? 'Saved area unavailable' : 'No location attached'}>
              <Choice label="No location requirement" selected={!location} onPress={() => setLocation(null)} />
              {activeLocations.map(place => <Choice key={place.id} label={place.name} selected={location === place.id} onPress={() => setLocation(place.id)} />)}
              {isLoadingLocations && <ActivityIndicator color={C.honeyDark} />}
              {!isLoadingLocations && !activeLocations.length && <ThemedText style={s.hint}>No active saved areas yet. Add one in location management.</ThemedText>}
              {!!location && !activeLocations.some(p => p.id === location) && <ThemedText style={s.hint}>The attached area is inactive or unavailable. Keep it, choose another, or remove the preference.</ThemedText>}
              <Button label="Manage saved areas" onPress={() => router.push('/manage-locations')} />
            </Section>
            <Section title="Deadline & importance" icon="flag-outline" summary={(hasDeadline ? deadline || 'Deadline needed' : 'No deadline') + ' / ' + importance + ' importance'}>
              <View style={s.between}><ThemedText style={s.label}>Set a deadline</ThemedText><Switch accessibilityLabel="Set a deadline" value={hasDeadline} onValueChange={setHasDeadline} trackColor={{ true: C.honey }} /></View>
              {hasDeadline && <QuestTimeInput label="Deadline" value={deadline} onChange={setDeadline} />}
              <ThemedText style={s.label}>Importance</ThemedText>
              <View style={s.row}>{(['low', 'normal', 'high'] as const).map(value => <Choice key={value} label={value[0].toUpperCase() + value.slice(1)} selected={importance === value} onPress={() => setImportance(value)} />)}</View>
            </Section>
            <Section title="Proof of completion" icon="camera-outline" summary={proof ? 'Proof required when completing' : 'No proof required'}>
              <View style={s.between}><ThemedText style={[s.label, s.flex]}>Require proof</ThemedText><Switch accessibilityLabel="Require proof of completion" value={proof} onValueChange={setProof} trackColor={{ true: C.honey }} /></View>
              <ThemedText style={s.hint}>Attach an image, video, or file when completing this quest.</ThemedText>
            </Section>
            <Section title="Do after" icon="git-branch-outline" summary={prerequisite ? quests.find(q => q.id === prerequisite)?.title ?? 'Saved prerequisite unavailable' : 'No prerequisite'}>
              <Choice label="No prerequisite" selected={!prerequisite} onPress={() => setPrerequisite(null)} />
              {prerequisiteOptions.map(q => <Choice key={q.id} label={q.title} selected={prerequisite === q.id} onPress={() => setPrerequisite(q.id)} />)}
            </Section>
          </View>
        </>}
      </ScrollView>
      {mode === 'custom' && <View style={s.footer}>
        {!!feedback && <ThemedText style={s.error} accessibilityLiveRegion="polite">{feedback}</ThemedText>}
        <ThemedText style={s.hint}>{xp} XP on completion</ThemedText>
        <Button primary label={saving ? 'Saving...' : quest ? 'Save changes' : 'Create Quest'} disabled={saving || creatingCategory || loading || !title.trim() || !category} onPress={() => void save()} />
      </View>}
      <Modal visible={categoryOpen} animationType="slide" transparent onRequestClose={() => setCategoryOpen(false)}>
        <View style={s.backdrop}><SafeAreaView style={s.modal} edges={['bottom']} accessibilityViewIsModal>
          <View style={s.between}><ThemedText style={s.sectionTitle}>Choose a category</ThemedText><Button label="Close" onPress={() => setCategoryOpen(false)} /></View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.modalContent}>
            {loading ? <ActivityIndicator color={C.honeyDark} /> : error ? <><ThemedText style={s.error}>{error}</ThemedText><Button label="Try again" onPress={() => void refresh()} /></> : categories.length ? categories.map(item => <Choice key={item.id} label={item.name} selected={category === item.name} onPress={() => { setCategory(item.name); setCategoryOpen(false); }} />) : <ThemedText style={s.hint}>No categories yet. Create your first one below.</ThemedText>}
            <ThemedText style={s.label}>Create a category</ThemedText>
            <TextInput accessibilityLabel="New category name" style={s.input} value={newCategory} onChangeText={setNewCategory} maxLength={40} placeholder="e.g. Creativity" placeholderTextColor={C.muted} />
            {!!categoryError && <ThemedText style={s.error} accessibilityLiveRegion="polite">{categoryError}</ThemedText>}
            <Button primary label={creatingCategory ? 'Creating...' : 'Create & select'} disabled={creatingCategory || loading || !!error || !newCategory.trim()} onPress={() => void addCategory()} />
          </ScrollView>
        </SafeAreaView></View>
      </Modal>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
function Section({ title, summary, icon, children }: { title: string; summary: string; icon: keyof typeof Ionicons.glyphMap; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <View style={s.section}><TouchableOpacity style={s.sectionHeader} accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)}><Ionicons name={icon} size={19} color={C.honeyDark} /><View style={s.flex}><ThemedText style={s.label}>{title}</ThemedText><ThemedText style={s.hint} numberOfLines={2}>{summary}</ThemedText></View><Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={17} color={C.muted} /></TouchableOpacity>{open && <View style={s.sectionBody}>{children}</View>}</View>;
}
function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <TouchableOpacity style={[s.choice, selected && s.selected]} accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress}><ThemedText style={s.label}>{label}</ThemedText>{selected && <Ionicons name="checkmark" size={16} color={C.honeyDeep} />}</TouchableOpacity>;
}
function Button({ label, onPress, primary = false, disabled = false }: { label: string; onPress: () => void; primary?: boolean; disabled?: boolean }) {
  return <TouchableOpacity style={[s.button, primary && s.primary, disabled && s.disabled]} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}><ThemedText style={s.label}>{label}</ThemedText></TouchableOpacity>;
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background },
  header: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 12 },
  heading: { fontSize: 25, lineHeight: 32, fontWeight: '800', color: C.ink },
  flex: { flex: 1, minWidth: 0 },
  hint: { fontSize: 12, lineHeight: 18, color: C.muted },
  label: { fontSize: 13, lineHeight: 20, fontWeight: '600', color: C.ink },
  sectionTitle: { fontSize: 17, lineHeight: 24, fontWeight: '700', color: C.ink },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: C.honeySoft },
  content: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', padding: 20, paddingTop: 4, gap: 10 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  intro: { backgroundColor: C.honeySoft, padding: 12, borderRadius: 12, gap: 3, marginBottom: 4 },
  input: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: C.surfaceMuted, backgroundColor: C.card, fontSize: 14, color: C.ink },
  textArea: { minHeight: 76 },
  option: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.surfaceMuted, backgroundColor: C.card },
  divider: { height: 1, backgroundColor: C.surfaceMuted, marginVertical: 8 },
  sections: { borderWidth: 1, borderColor: C.surfaceMuted, borderRadius: 14, overflow: 'hidden' },
  section: { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.surfaceMuted, backgroundColor: C.card },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, minHeight: 64 },
  sectionBody: { padding: 14, paddingTop: 0, gap: 12 },
  choice: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: 10, borderRadius: 10, backgroundColor: C.background, flexShrink: 1 },
  selected: { backgroundColor: C.honeySoft },
  button: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  primary: { backgroundColor: C.honey, minHeight: 48 },
  disabled: { opacity: 0.45 },
  footer: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 10, gap: 6, borderTopWidth: 1, borderColor: C.surfaceMuted, backgroundColor: C.background },
  error: { fontSize: 12, lineHeight: 18, color: C.danger },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(45,36,29,0.35)' },
  modal: { maxHeight: '85%', width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', backgroundColor: C.background, padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  modalContent: { gap: 10, paddingBottom: 20 },
});
