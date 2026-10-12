import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Button as ActionButton } from '@/components/mobile-ui';
import { QuestAccordion, QuestCard, QuestChoice, QuestFieldLabel, QuestIcon, QuestNote, QuestSelect, QuestText, QuestWizardFooter, QuestWizardHeader } from '@/components/quest-wizard';
import { ThemedText } from '@/components/themed-text';
import { QuestTimeInput } from '@/components/quest-time-input';
import { Fonts, useAppColorScheme, useBeePalette, useBeeStyles, type BeePalette, MaxContentWidth } from '@/constants/theme';
import { useUserData, type Quest } from '@/hooks/use-user-data';
import { useQuestCategories } from '@/hooks/use-quest-categories';
import { useLocationContext } from '@/context/location-context';
import { getQuestIdeas } from '@/lib/quest-suggestions';
import { formatLocalDateTime, parseLocalDateTime, parsePreferredTime, validateQuestDates } from '@/lib/quest-time';

export default function AddQuestScreen() {
  const C = useBeePalette();
  const s = useBeeStyles(makeStyles);
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
  const C = useBeePalette();
  const s = useBeeStyles(makeStyles);
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
  const scrollRef = useRef<ScrollView>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [expanded, setExpanded] = useState({ timing: true, location: false, deadline: false, proof: false, after: false });
  const [recurrence, setRecurrence] = useState('Once');
  const [customDays, setCustomDays] = useState<string[]>([]);
  const { width } = useWindowDimensions();
  const dark = useAppColorScheme() === 'dark';
  const toggle = (key: keyof typeof expanded) => setExpanded(previous => ({ ...previous, [key]: !previous[key] }));
  const changeStep = (next: 1 | 2) => {
    Keyboard.dismiss();
    setFeedback(null);
    setStep(next);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };
  useFocusEffect(useCallback(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step !== 2) return false;
      Keyboard.dismiss();
      setStep(1);
      setFeedback(null);
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      return true;
    });
    return () => listener.remove();
  }, [step]));
  const validateDetails = () => {
    if (!title.trim()) throw new Error('Give your quest a name.');
    if (title.length > 50) throw new Error('Keep your quest name within 50 characters.');
    if (description.length > 200) throw new Error('Keep your description within 200 characters.');
    if (!category || !categories.some(c => c.name === category)) throw new Error('Choose an available category.');
  };
  const continueToSettings = () => {
    try { validateDetails(); changeStep(2); }
    catch (failure) { setFeedback(failure instanceof Error ? failure.message : 'Check your quest details.'); }
  };
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
      validateDetails();
      const scheduled_at = scheduleMode === 'scheduled' ? parseLocalDateTime(scheduled) : null;
      const preferred_time = scheduleMode === 'preferred' ? parsePreferredTime(preferred) : null;
      const deadline_at = hasDeadline ? parseLocalDateTime(deadline) : null;
      if (scheduleMode === 'scheduled' && !scheduled_at) throw new Error('Choose a scheduled date and time.');
      if (scheduleMode === 'preferred' && !preferred_time) throw new Error('Choose a preferred time.');
      if (hasDeadline && !deadline_at) throw new Error('Choose a deadline or turn it off.');
      validateQuestDates(scheduled_at, deadline_at);
      savingRef.current = true; setSaving(true);
      const draft = { title: title.trim(), description: description.trim(), category, xp, scheduled_at, preferred_time, deadline_at, importance, location_id: location, requires_proof: proof, prerequisite_quest_id: prerequisite };
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
  return <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-[#faf3df] dark:bg-[#241e17]">
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View className="w-full max-w-[480px] flex-1 self-center">
        <ScrollView ref={scrollRef} className="flex-1" keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerClassName="pb-8 pt-2">
          <QuestWizardHeader step={step} editing={!!quest} onBack={() => step === 2 ? changeStep(1) : router.back()} onClose={() => router.back()} />
          <View className="px-4">
            {step === 1 ? <QuestCard className="p-5">
              {!quest && <View className="mb-4 flex-row rounded-[20px] border border-[#e5cda0] bg-[#fffaf0] p-1 dark:border-[#76603d] dark:bg-[#403523]">
                {(['templates', 'custom'] as const).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: mode === value }} onPress={() => setMode(value)} className={`min-h-12 flex-1 flex-row items-center justify-center gap-2 rounded-[16px] px-2 py-2 active:opacity-60 ${mode === value ? 'border border-[#9f6010] bg-[#ffdf88] dark:bg-[#71541f]' : ''}`}>
                  <Ionicons name={value === 'custom' ? 'settings-outline' : 'flash-outline'} size={20} color={dark ? '#f8edda' : '#754315'} /><QuestText className="text-[16px] font-semibold">{value === 'custom' ? 'Custom' : 'Quick Start'}</QuestText>
                </Pressable>)}
              </View>}
              <QuestText className="mb-6 text-[14px] leading-5 text-[#6d5d4d] dark:text-[#c6b9a7]">{mode === 'templates' ? 'Choose an idea, then make it your own.' : 'Get creative! Set your own details and make it your own.'}</QuestText>
              {mode === 'templates' ? <View className="gap-3">
                {getQuestIdeas().map(idea => <Pressable key={idea.id} accessibilityRole="button" accessibilityLabel={`${idea.title}, ${idea.xp} XP`} className="min-h-14 flex-row items-center gap-3 rounded-2xl border border-[#e9dcc4] p-3 active:opacity-60 dark:border-[#64513b]" onPress={() => { setTitle(idea.title); setDescription(idea.description ?? ''); setCategory(categories.find(c => c.name === idea.category)?.name ?? ''); setXp(idea.xp); setMode('custom'); }}>
                  <QuestIcon icon={idea.icon} small /><QuestText className="flex-1 font-semibold">{idea.title}</QuestText><QuestText className="text-[12px]">+{idea.xp} XP</QuestText>
                </Pressable>)}
              </View> : <View className="gap-5 border-t border-[#f1e7d4] pt-2 dark:border-[#64513b]">
                <View>
                  <QuestFieldLabel label="Quest name" icon="create-outline" />
                  <TextInput accessibilityLabel="Quest name" className="min-h-[50px] rounded-[12px] border border-[#cebea1] bg-[#fffefa] px-3 py-3 text-[15px] leading-[22px] text-[#432914] dark:border-[#76634b] dark:bg-[#342c22] dark:text-[#f8edda]" style={{ fontFamily: Fonts.rounded }} placeholder="e.g. Review my notes" placeholderTextColor={dark ? '#b6a995' : '#8e8071'} value={title} onChangeText={setTitle} maxLength={Math.max(50, title.length)} returnKeyType="next" />
                  <QuestText className={`mt-1 text-right text-[11px] leading-[14px] ${title.length > 50 ? 'text-[#ae3428]' : 'text-[#796b5c] dark:text-[#c6b9a7]'}`}>{title.length}/50</QuestText>
                </View>
                <View>
                  <QuestFieldLabel label="Description (optional)" icon="list-outline" />
                  <View className="rounded-[12px] border border-[#cebea1] bg-[#fffefa] dark:border-[#76634b] dark:bg-[#342c22]">
                    <TextInput accessibilityLabel="Description, optional" className="min-h-[96px] px-3 pb-2 pt-3 text-[15px] leading-[22px] text-[#432914] dark:text-[#f8edda]" style={{ fontFamily: Fonts.rounded }} placeholder="What would you like to accomplish?" placeholderTextColor={dark ? '#b6a995' : '#8e8071'} value={description} onChangeText={setDescription} maxLength={Math.max(200, description.length)} multiline textAlignVertical="top" />
                    <QuestText className={`px-2 pb-2 text-right text-[11px] leading-[14px] ${description.length > 200 ? 'text-[#ae3428]' : 'text-[#796b5c] dark:text-[#c6b9a7]'}`}>{description.length}/200</QuestText>
                  </View>
                </View>
                <View>
                  <QuestFieldLabel label="Category" icon="pricetag-outline" />
                  <Pressable accessibilityRole="button" accessibilityLabel={`Choose category: ${category || 'None selected'}`} onPress={() => setCategoryOpen(true)} className="min-h-[58px] flex-row items-center gap-3 rounded-[20px] border border-[#e5cea5] px-3 py-2 active:opacity-60 dark:border-[#76603d]">
                    <QuestIcon icon="accessibility-outline" tone="purple" small /><QuestText className="flex-1">{category || 'Choose a category'}</QuestText><Ionicons name="chevron-down" size={20} color={dark ? '#f8edda' : '#54351e'} />
                  </Pressable>
                  {loading && <ActivityIndicator className="mt-2" color={C.honeyDark} />}
                  {!!error && <View className="mt-2"><QuestText className="text-[13px] text-[#ae3428] dark:text-[#ffb4a9]">{error}</QuestText><Button label="Reload categories" onPress={() => void refresh()} /></View>}
                </View>
              </View>}
            </QuestCard> : <View className="gap-3">
              <QuestAccordion title="Timing & schedule" subtitle="When can this quest be done?" icon="time-outline" tone="amber" open={expanded.timing} onToggle={() => toggle('timing')}>
                <View className="gap-3 rounded-2xl border border-[#f0e5cf] p-3 dark:border-[#64513b]">
                  <QuestSelect label="Timing" selectedValue={scheduleMode} value={scheduleMode === 'anytime' ? 'Anytime' : scheduleMode === 'scheduled' ? 'Scheduled' : 'Preferred time'} options={[{ label: 'Anytime', value: 'anytime' }, { label: 'Scheduled', value: 'scheduled' }, { label: 'Preferred time', value: 'preferred' }]} onChange={value => setScheduleMode(value as typeof scheduleMode)} />
                  {scheduleMode === 'scheduled' && <QuestTimeInput label="Scheduled date & time" value={scheduled} onChange={setScheduled} />}
                  {scheduleMode === 'preferred' && <QuestTimeInput label="Preferred time of day" timeOnly value={preferred} onChange={setPreferred} />}
                  <View className={`gap-1.5 ${width < 360 ? 'flex-row flex-wrap' : 'flex-row'}`}>
                    {['Once', 'Daily', 'Weekly', 'Custom'].map(value => <QuestChoice key={value} label={value} compact={width >= 360} selected={recurrence === value} onPress={() => setRecurrence(value)} />)}
                  </View>
                  {recurrence === 'Custom' && <View className="gap-2"><QuestText className="text-[12px]">Choose days (preview)</QuestText><View className="flex-row flex-wrap gap-2">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <QuestChoice key={day} label={day} selected={customDays.includes(day)} onPress={() => setCustomDays(days => days.includes(day) ? days.filter(item => item !== day) : [...days, day])} />)}</View></View>}
                  <QuestNote>{recurrence === 'Once' ? (scheduleMode === 'anytime' ? 'Your quest will be available anytime, once.' : 'Your quest will use the timing selected above.') : `${recurrence === 'Daily' ? 'Daily' : recurrence === 'Weekly' ? 'Weekly' : 'Custom'} repeat preview. Repeat settings are preview only. ${quest ? 'Save changes keeps' : 'Create Quest saves'} one quest.`}</QuestNote>
                </View>
              </QuestAccordion>
              <QuestAccordion title="Location & geofencing" subtitle="Where can this quest be done?" icon="location-outline" tone="green" open={expanded.location} onToggle={() => toggle('location')}>
                <QuestSelect label="Location" selectedValue={location ?? ''} value={location ? activeLocations.find(p => p.id === location)?.name ?? 'Saved area unavailable' : 'No location attached'} options={[{ label: 'No location attached', value: '' }, ...activeLocations.map(place => ({ label: place.name, value: place.id }))]} onChange={value => setLocation(value || null)}>
                  {isLoadingLocations && <ActivityIndicator color={C.honeyDark} />}
                  {!isLoadingLocations && !activeLocations.length && <QuestText>No active saved areas yet.</QuestText>}
                </QuestSelect>
                <QuestNote icon="location-outline">You can restrict this quest to a specific location, or keep it open anywhere.</QuestNote>
                {!!location && !activeLocations.some(p => p.id === location) && <QuestText className="text-[12px]">The attached area is inactive or unavailable. Keep it, choose another, or remove the preference.</QuestText>}
                <Button label="Manage saved areas" onPress={() => router.push('/manage-locations')} />
              </QuestAccordion>
              <QuestAccordion title="Deadline & importance" subtitle="Set a due date and priority level." icon="flag-outline" tone="red" open={expanded.deadline} onToggle={() => toggle('deadline')}>
                <QuestSelect label="Deadline" selectedValue={hasDeadline ? 'set' : 'none'} icon="calendar-outline" value={hasDeadline ? deadline || 'Choose a deadline' : 'No deadline'} options={[{ label: 'No deadline', value: 'none' }, { label: 'Set a deadline', value: 'set' }]} onChange={value => setHasDeadline(value === 'set')} />
                {hasDeadline && <QuestTimeInput label="Deadline" value={deadline} onChange={setDeadline} />}
                <QuestSelect label="Importance" selectedValue={importance} icon="bar-chart-outline" value={`${importance[0].toUpperCase() + importance.slice(1)} importance`} options={(['low', 'normal', 'high'] as const).map(value => ({ label: `${value[0].toUpperCase() + value.slice(1)} importance`, value }))} onChange={value => setImportance(value as typeof importance)} />
              </QuestAccordion>
              <QuestAccordion title="Proof of completion" subtitle="How will you confirm it’s done?" icon="camera-outline" tone="purple" open={expanded.proof} onToggle={() => toggle('proof')}>
                <View className="flex-row items-center justify-between gap-3"><QuestText className="flex-1 font-semibold">Require proof</QuestText><Switch accessibilityLabel="Require proof of completion" value={proof} onValueChange={setProof} trackColor={{ true: C.honey }} /></View>
                <QuestNote>Attach an image, video, or file when completing this quest.</QuestNote>
              </QuestAccordion>
              <QuestAccordion title="Do after" subtitle="What happens next?" icon="git-branch-outline" tone="blue" open={expanded.after} onToggle={() => toggle('after')}>
                <QuestSelect label="Prerequisite quest" selectedValue={prerequisite ?? ''} value={prerequisite ? quests.find(q => q.id === prerequisite)?.title ?? 'Saved prerequisite unavailable' : 'No prerequisite'} options={[{ label: 'No prerequisite', value: '' }, ...prerequisiteOptions.map(q => ({ label: q.title, value: q.id }))]} onChange={value => setPrerequisite(value || null)} />
              </QuestAccordion>
            </View>}
          </View>
        </ScrollView>
        <QuestWizardFooter xp={xp} label={saving ? 'Saving…' : step === 1 ? 'Continue' : quest ? 'Save changes' : 'Create Quest'} busy={saving} disabled={saving || creatingCategory || loading || (step === 1 && mode === 'templates')} feedback={feedback} onPress={() => step === 1 ? continueToSettings() : void save()} />
      </View>
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
function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) { return <QuestChoice label={label} selected={selected} onPress={onPress} />; }
function Button({ label, onPress, primary = false, disabled = false }: { label: string; onPress: () => void; primary?: boolean; disabled?: boolean }) {
  return <ActionButton label={label} onPress={onPress} intent={primary ? 'primary' : 'quiet'} disabled={disabled} />;
}
const makeStyles = (C: BeePalette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background },
  content: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', padding: 20, gap: 20 },
  sectionTitle: { fontSize: 20, lineHeight: 28, fontWeight: '700', color: C.ink },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: C.ink },
  hint: { fontSize: 14, lineHeight: 20, color: C.muted },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  input: { fontFamily: Fonts.rounded, minHeight: 48, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, fontSize: 16, color: C.ink, lineHeight: 24 },
  error: { fontSize: 14, lineHeight: 20, color: C.danger },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(45,36,29,0.35)' },
  modal: { maxHeight: '85%', width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', backgroundColor: C.background, padding: 20, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  modalContent: { gap: 10, paddingBottom: 20 },
});
