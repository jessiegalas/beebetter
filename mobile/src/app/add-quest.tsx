import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Button as ActionButton, ChoiceChip, Field, Sheet } from '@/components/mobile-ui';
import { CategoryGlyph } from '@/components/quest-visuals';
import { XpBadge } from '@/components/xp-visuals';
import { QuestAccordion, QuestCard, QuestChoice, QuestFieldLabel, QuestIcon, QuestNote, QuestSelect, QuestText, QuestWizardFooter, QuestWizardHeader } from '@/components/quest-wizard';
import { ThemedText } from '@/components/themed-text';
import { QuestTimeInput } from '@/components/quest-time-input';
import { useBeePalette, useBeeStyles, type BeePalette, ContentColumn, Layout, Spacing, Typography } from '@/constants/theme';
import { useUserData, type Quest } from '@/hooks/use-user-data';
import { useQuestCategories } from '@/hooks/use-quest-categories';
import { useLocationContext } from '@/context/location-context';
import { getQuestIdeas } from '@/lib/quest-suggestions';
import { formatLocalDateTime, parseLocalDateTime, parsePreferredTime, validateQuestDates } from '@/lib/quest-time';

export default function AddQuestScreen() {
  const C = useBeePalette();
  const s = useBeeStyles(makeStyles);
  const { id, after, afterTitle, category } = useLocalSearchParams<{
    id?: string; after?: string; afterTitle?: string; category?: string;
  }>();
  const { quests, isLoading, error, refresh } = useUserData();
  const quest = quests.find(item => item.id === id);
  if (id && (isLoading || !quest || quest.status === 'completed')) return <SafeAreaView style={s.screen}><View style={s.content}>
    <Button label="Back" onPress={() => router.back()} />
    {isLoading ? <ActivityIndicator color={C.honeyDark} /> : <ThemedText>{error ? 'Could not load quest.' : 'This quest is no longer available to edit.'}</ThemedText>}
    {!!error && <Button label="Try again" onPress={() => void refresh()} />}
  </View></SafeAreaView>;
  // Mount only after saved data is available; background refreshes must not overwrite edits.
  return <QuestForm key={id ?? after ?? 'new'} quest={quest} after={id ? undefined : after}
    afterTitle={afterTitle} initialCategory={category} />;
}
function QuestForm({ quest, after, afterTitle, initialCategory }: {
  quest?: Quest; after?: string; afterTitle?: string; initialCategory?: string;
}) {
  const C = useBeePalette();
  const s = useBeeStyles(makeStyles);
  const { user, quests, addQuest, updateQuest } = useUserData();
  const { activeLocations, isLoadingLocations } = useLocationContext();
  const { categories, loading, error, refresh, createCategory } = useQuestCategories();
  const [title, setTitle] = useState(quest?.title ?? '');
  const [description, setDescription] = useState(quest?.description ?? '');
  const [category, setCategory] = useState(quest?.category ?? initialCategory ?? '');
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
  const [prerequisite, setPrerequisite] = useState<string | null>(quest?.prerequisite_quest_id ?? after ?? null);
  const [savedQuestId, setSavedQuestId] = useState<string | null>(null);
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
    if (savingRef.current || savedQuestId) return;
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
      if (!quest) {
        const result = await addQuest(draft);
        if (!result.success) throw new Error(result.error || 'Could not save quest. Please try again.');
        if (result.questId) { setSavedQuestId(result.questId); return; }
      } else {
        const result = await updateQuest(quest.id, draft);
        if (!result.success) throw new Error(result.error || 'Could not save quest. Please try again.');
      }
      router.back();
    } catch (failure) { setFeedback(failure instanceof Error ? failure.message : 'Could not save quest. Please try again.'); }
    finally { savingRef.current = false; setSaving(false); }
  };
  const prerequisiteTitle = quests.find(q => q.id === prerequisite)?.title
    ?? (prerequisite === after ? afterTitle : undefined);
  const prerequisiteChoices = after && !prerequisiteOptions.some(item => item.id === after)
    ? [{ label: afterTitle ?? 'Previous quest', value: after }] : [];
  const addCategory = async () => {
    if (creatingCategory) return;
    setCreatingCategory(true); setCategoryError(null);
    try { const created = await createCategory(newCategory); setCategory(created.name); setNewCategory(''); setCategoryOpen(false); }
    catch (failure) { setCategoryError(failure instanceof Error ? failure.message : 'Could not create category.'); }
    finally { setCreatingCategory(false); }
  };
  return <SafeAreaView edges={['top', 'bottom']} style={s.screen}>
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View className="w-full flex-1 self-center" style={{ maxWidth: Layout.compactContentWidth }}>
        <ScrollView ref={scrollRef} className="flex-1" keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerClassName="pb-section pt-sm">
          <QuestWizardHeader step={step} editing={!!quest} onBack={() => step === 2 ? changeStep(1) : router.back()} onClose={() => router.back()} />
          <View className="px-lg">
            {step === 1 ? <QuestCard className="p-gutter">
              {!quest && <View className="mb-lg flex-row flex-wrap gap-sm">
                {(['templates', 'custom'] as const).map(value => <ChoiceChip appearance="pixel" key={value}
                  label={value === 'custom' ? 'Custom' : 'Quick Start'} selected={mode === value} onPress={() => setMode(value)} />)}
              </View>}
              <QuestText className="mb-xl text-metadata text-muted-foreground">{mode === 'templates' ? 'Choose an idea, then make it your own.' : 'Get creative! Set your own details and make it your own.'}</QuestText>
              {mode === 'templates' ? <View className="gap-md">
                {getQuestIdeas().map(idea => <Pressable key={idea.id} accessibilityRole="button" accessibilityLabel={`${idea.title}, ${idea.xp} XP`} className="min-h-control flex-row items-center gap-md rounded-lg border border-border p-md active:opacity-60" onPress={() => { setTitle(idea.title); setDescription(idea.description ?? ''); setCategory(categories.find(c => c.name === idea.category)?.name ?? ''); setXp(idea.xp); setMode('custom'); }}>
                  <QuestIcon icon={idea.icon} small /><QuestText className="flex-1 text-item">{idea.title}</QuestText><XpBadge xp={idea.xp} />
                </Pressable>)}
              </View> : <View className="gap-gutter border-t border-border pt-sm">
                <Field label="Quest name" placeholder="e.g. Review my notes" value={title}
                  onChangeText={setTitle} maxLength={Math.max(50, title.length)} returnKeyType="next"
                  hint={title.length + '/50'} error={title.length > 50 ? 'Keep your quest name within 50 characters.' : undefined} />
                <Field label="Description (optional)" placeholder="What would you like to accomplish?"
                  value={description} onChangeText={setDescription} maxLength={Math.max(200, description.length)}
                  multiline
                  hint={description.length + '/200'} error={description.length > 200 ? 'Keep your description within 200 characters.' : undefined} />
                <View>
                  <QuestFieldLabel label="Category" icon="pricetag-outline" />
                  <ActionButton label={category || 'Choose a category'} icon="chevron-down" intent="secondary" onPress={() => setCategoryOpen(true)} />
                  {loading && <ActivityIndicator className="mt-sm" color={C.honeyDark} />}
                  {!!error && <View className="mt-sm"><QuestText className="text-metadata text-destructive">{error}</QuestText><Button label="Reload categories" onPress={() => void refresh()} /></View>}
                </View>
              </View>}
            </QuestCard> : <View className="gap-md">
              <QuestAccordion title="Timing & schedule" subtitle="When can this quest be done?" icon="time-outline" open={expanded.timing} onToggle={() => toggle('timing')}>
                <View className="gap-md rounded-lg border border-border p-md">
                  <QuestSelect label="Timing" selectedValue={scheduleMode} value={scheduleMode === 'anytime' ? 'Anytime' : scheduleMode === 'scheduled' ? 'Scheduled' : 'Preferred time'} options={[{ label: 'Anytime', value: 'anytime' }, { label: 'Scheduled', value: 'scheduled' }, { label: 'Preferred time', value: 'preferred' }]} onChange={value => setScheduleMode(value as typeof scheduleMode)} />
                  {scheduleMode === 'scheduled' && <QuestTimeInput label="Scheduled date & time" value={scheduled} onChange={setScheduled} />}
                  {scheduleMode === 'preferred' && <QuestTimeInput label="Preferred time of day" timeOnly value={preferred} onChange={setPreferred} />}
                  <View className="flex-row flex-wrap gap-sm">
                    {['Once', 'Daily', 'Weekly', 'Custom'].map(value => <QuestChoice key={value} label={value} selected={recurrence === value} onPress={() => setRecurrence(value)} />)}
                  </View>
                  {recurrence === 'Custom' && <View className="gap-sm"><QuestText className="text-metadata">Choose days (preview)</QuestText><View className="flex-row flex-wrap gap-sm">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <QuestChoice key={day} label={day} selected={customDays.includes(day)} onPress={() => setCustomDays(days => days.includes(day) ? days.filter(item => item !== day) : [...days, day])} />)}</View></View>}
                  <QuestNote>{recurrence === 'Once' ? (scheduleMode === 'anytime' ? 'Your quest will be available anytime, once.' : 'Your quest will use the timing selected above.') : `${recurrence === 'Daily' ? 'Daily' : recurrence === 'Weekly' ? 'Weekly' : 'Custom'} repeat preview. Repeat settings are preview only. ${quest ? 'Save changes keeps' : 'Create Quest saves'} one quest.`}</QuestNote>
                </View>
              </QuestAccordion>
              <QuestAccordion title="Location & geofencing" subtitle="Where can this quest be done?" icon="location-outline" open={expanded.location} onToggle={() => toggle('location')}>
                <QuestSelect label="Location" selectedValue={location ?? ''} value={location ? activeLocations.find(p => p.id === location)?.name ?? 'Saved area unavailable' : 'No location attached'} options={[{ label: 'No location attached', value: '' }, ...activeLocations.map(place => ({ label: place.name, value: place.id }))]} onChange={value => setLocation(value || null)}>
                  {isLoadingLocations && <ActivityIndicator color={C.honeyDark} />}
                  {!isLoadingLocations && !activeLocations.length && <QuestText>No active saved areas yet.</QuestText>}
                </QuestSelect>
                <QuestNote icon="location-outline">You can restrict this quest to a specific location, or keep it open anywhere.</QuestNote>
                {!!location && !activeLocations.some(p => p.id === location) && <QuestText className="text-metadata">The attached area is inactive or unavailable. Keep it, choose another, or remove the preference.</QuestText>}
                <Button label="Manage saved areas" onPress={() => router.push('/manage-locations')} />
              </QuestAccordion>
              <QuestAccordion title="Deadline & importance" subtitle="Set a due date and priority level." icon="flag-outline" open={expanded.deadline} onToggle={() => toggle('deadline')}>
                <QuestSelect label="Deadline" selectedValue={hasDeadline ? 'set' : 'none'} icon="calendar-outline" value={hasDeadline ? deadline || 'Choose a deadline' : 'No deadline'} options={[{ label: 'No deadline', value: 'none' }, { label: 'Set a deadline', value: 'set' }]} onChange={value => setHasDeadline(value === 'set')} />
                {hasDeadline && <QuestTimeInput label="Deadline" value={deadline} onChange={setDeadline} />}
                <QuestSelect label="Importance" selectedValue={importance} icon="bar-chart-outline" value={`${importance[0].toUpperCase() + importance.slice(1)} importance`} options={(['low', 'normal', 'high'] as const).map(value => ({ label: `${value[0].toUpperCase() + value.slice(1)} importance`, value }))} onChange={value => setImportance(value as typeof importance)} />
              </QuestAccordion>
              <QuestAccordion title="Proof of completion" subtitle="How will you confirm it’s done?" icon="camera-outline" open={expanded.proof} onToggle={() => toggle('proof')}>
                <View className="flex-row items-center justify-between gap-md"><QuestText className="flex-1 text-item">Require proof</QuestText><Switch accessibilityLabel="Require proof of completion" value={proof} onValueChange={setProof} trackColor={{ true: C.honey }} /></View>
                <QuestNote>Attach an image, video, or file when completing this quest.</QuestNote>
              </QuestAccordion>
              <QuestAccordion title="Do after" subtitle="What happens next?" icon="git-branch-outline" open={expanded.after} onToggle={() => toggle('after')}>
                <QuestSelect label="Prerequisite quest" selectedValue={prerequisite ?? ''} value={prerequisite ? prerequisiteTitle ?? 'Saved prerequisite unavailable' : 'No prerequisite'} options={[{ label: 'No prerequisite', value: '' }, ...prerequisiteChoices, ...prerequisiteOptions.map(q => ({ label: q.title, value: q.id }))]} onChange={value => setPrerequisite(value || null)} />
              </QuestAccordion>
            </View>}
          </View>
        </ScrollView>
        <QuestWizardFooter xp={xp} label={step === 1 ? 'Continue' : quest ? 'Save changes' : 'Create Quest'} busy={saving} disabled={saving || !!savedQuestId || creatingCategory || loading || (step === 1 && mode === 'templates')} feedback={feedback} onPress={() => step === 1 ? continueToSettings() : void save()} />
      </View>
      {savedQuestId && <Sheet visible title="Quest saved" onClose={() => router.back()}>
        <ActionButton label="Add a follow-up" onPress={() => router.replace({
          pathname: '/add-quest', params: { after: savedQuestId, afterTitle: title.trim(), category },
        })} />
        <ActionButton label="Done" intent="quiet" onPress={() => router.back()} />
      </Sheet>}
      <Sheet title="Choose a category" visible={categoryOpen} onClose={() => setCategoryOpen(false)}>
        {loading ? <ActivityIndicator color={C.primary} /> : error ? <>
          <ThemedText style={s.error}>{error}</ThemedText>
          <ActionButton label="Try again" onPress={() => void refresh()} />
        </> : categories.length ? categories.map(item => <ChoiceChip appearance="pixel" key={item.id} label={item.name} leading={<CategoryGlyph label={item.name} />}
          selected={category === item.name} onPress={() => { setCategory(item.name); setCategoryOpen(false); }} />)
          : <ThemedText>No categories yet. Create your first one below.</ThemedText>}
        <Field label="New category name" editable={!creatingCategory} value={newCategory} onChangeText={setNewCategory}
          maxLength={40} placeholder="e.g. Creativity" error={categoryError ?? undefined} />
        <ActionButton label="Create & select" loading={creatingCategory} disabled={loading || !!error || !newCategory.trim()}
          onPress={() => void addCategory()} />
      </Sheet>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
function Button({ label, onPress, primary = false, disabled = false }: { label: string; onPress: () => void; primary?: boolean; disabled?: boolean }) {
  return <ActionButton label={label} onPress={onPress} intent={primary ? 'primary' : 'quiet'} disabled={disabled} />;
}
const makeStyles = (C: BeePalette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background },
  content: { ...ContentColumn, paddingVertical: Spacing.gutter, gap: Spacing.gutter },
  error: { ...Typography.metadata, color: C.danger },
});
