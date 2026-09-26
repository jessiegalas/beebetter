import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { InlineMessage, PrivacyNote, RatingScale, WellnessHeader, type RatingOption } from '@/components/wellness-ui';
import { BeeBetterColors as COLORS, BeeBetterShadow, MaxContentWidth, Radii } from '@/constants/theme';
import { useUserData } from '@/hooks/use-user-data';
import { createMyReflection } from '@/lib/wellbeing-data';

const SCALE: RatingOption[] = [
  { value: 1, label: 'Needs work' }, { value: 2, label: 'A little' }, { value: 3, label: 'Steady' }, { value: 4, label: 'Strong' }, { value: 5, label: 'Very strong' },
];

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function SelfManagementReflectionScreen() {
  const { user, quests } = useUserData();
  const [period, setPeriod] = useState<'today' | 'week'>('week');
  const [planning, setPlanning] = useState<number | null>(null);
  const [followThrough, setFollowThrough] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [accomplishment, setAccomplishment] = useState('');
  const [challenge, setChallenge] = useState('');
  const [nextStep, setNextStep] = useState('');
  const [questId, setQuestId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; tone: 'error' | 'success' } | null>(null);

  const submit = async () => {
    if (!user || planning === null || followThrough === null || confidence === null) {
      setFeedback({ message: 'Choose a planning, follow-through, and confidence score.', tone: 'error' });
      return;
    }
    const end = new Date();
    const start = new Date(end);
    if (period === 'week') start.setDate(start.getDate() - 6);
    setSaving(true);
    setFeedback(null);
    try {
      await createMyReflection(user.id, {
        period_start: localDateKey(start), period_end: localDateKey(end), planning_score: planning,
        follow_through_score: followThrough, confidence_score: confidence, quest_id: questId,
        accomplishment: accomplishment.trim() || null, challenge: challenge.trim() || null, next_step: nextStep.trim() || null,
      });
      setFeedback({ message: 'Your private reflection was saved.', tone: 'success' });
      setPlanning(null); setFollowThrough(null); setConfidence(null);
      setAccomplishment(''); setChallenge(''); setNextStep(''); setQuestId(null);
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : 'Could not save your reflection.', tone: 'error' });
    } finally { setSaving(false); }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <WellnessHeader title="Self-management reflection" subtitle="Notice what helped and choose your next step" />
        <KeyboardAvoidingView style={styles.safeArea} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <PrivacyNote>Your individual scores and written reflection are private to you. They are not automatically shared with OSAS.</PrivacyNote>
            <View style={styles.hero}>
              <Ionicons name="compass-outline" size={27} color={COLORS.honeyDeep} />
              <View style={styles.copy}><ThemedText style={styles.title}>Pause, notice, adjust.</ThemedText><ThemedText style={styles.body}>Reflection is optional and can be completed with or without a quest.</ThemedText></View>
            </View>
            <View style={styles.formCard}>
              <View>
                <ThemedText style={styles.label}>Reflection period</ThemedText>
                <ThemedText style={styles.hint}>Choose the time you are thinking about.</ThemedText>
              </View>
              <View style={styles.segmentRow}>
                {(['today', 'week'] as const).map(value => <TouchableOpacity key={value} style={[styles.segment, period === value && styles.segmentSelected]} onPress={() => setPeriod(value)} accessibilityRole="radio" accessibilityState={{ selected: period === value }}><ThemedText style={[styles.segmentText, period === value && styles.segmentTextSelected]}>{value === 'today' ? 'Today' : 'Last 7 days'}</ThemedText></TouchableOpacity>)}
              </View>
              <View style={styles.divider} />
              <RatingScale title="Planning" hint="How well did you decide what needed your attention?" value={planning} options={SCALE} onChange={setPlanning} />
              <View style={styles.divider} />
              <RatingScale title="Follow-through" hint="How well did your actions match what you planned?" value={followThrough} options={SCALE} onChange={setFollowThrough} />
              <View style={styles.divider} />
              <RatingScale title="Confidence" hint="How confident do you feel about your next step?" value={confidence} options={SCALE} onChange={setConfidence} />
              <View style={styles.divider} />
              <View><ThemedText style={styles.label}>Related quest (optional)</ThemedText><ThemedText style={styles.hint}>Leave this unselected for a general reflection.</ThemedText></View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.questOptions}>
                <TouchableOpacity style={[styles.questChip, questId === null && styles.questChipSelected]} onPress={() => setQuestId(null)}><ThemedText style={styles.questChipText}>No quest</ThemedText></TouchableOpacity>
                {quests.map(quest => <TouchableOpacity key={quest.id} style={[styles.questChip, questId === quest.id && styles.questChipSelected]} onPress={() => setQuestId(quest.id)}><ThemedText style={styles.questChipText} numberOfLines={1}>{quest.title}</ThemedText></TouchableOpacity>)}
              </ScrollView>
              <ReflectionField label="Something I accomplished (optional)" placeholder="What moved forward?" value={accomplishment} onChange={setAccomplishment} />
              <ReflectionField label="A challenge I noticed (optional)" placeholder="What made things harder?" value={challenge} onChange={setChallenge} />
              <ReflectionField label="My next step (optional)" placeholder="What small action will I try next?" value={nextStep} onChange={setNextStep} />
              {feedback && <InlineMessage {...feedback} />}
              <TouchableOpacity style={[styles.primaryButton, saving && styles.disabled]} onPress={() => void submit()} disabled={saving} accessibilityRole="button">
                {saving ? <ActivityIndicator color={COLORS.ink} /> : <Ionicons name="lock-closed-outline" size={18} color={COLORS.ink} />}
                <ThemedText style={styles.primaryText}>{saving ? 'Saving…' : 'Save private reflection'}</ThemedText>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.historyLink} onPress={() => router.push('/wellness-history' as any)} accessibilityRole="button"><Ionicons name="time-outline" size={20} color={COLORS.honeyDeep} /><ThemedText style={styles.historyText}>Review my reflections</ThemedText><Ionicons name="chevron-forward" size={18} color={COLORS.muted} /></TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function ReflectionField({ label, placeholder, value, onChange }: { label: string; placeholder: string; value: string; onChange: (value: string) => void }) {
  return <View style={styles.field}><ThemedText style={styles.label}>{label}</ThemedText><TextInput style={styles.textArea} value={value} onChangeText={onChange} maxLength={1000} multiline placeholder={placeholder} placeholderTextColor={COLORS.muted} textAlignVertical="top" accessibilityLabel={label} /><ThemedText style={styles.counter}>{value.length}/1000</ThemedText></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background }, safeArea: { flex: 1 },
  content: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: 48, gap: 14 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 17, borderRadius: Radii.lg, backgroundColor: COLORS.surfaceWarm },
  copy: { flex: 1, minWidth: 0 }, title: { color: COLORS.ink, fontSize: 19, lineHeight: 25, fontWeight: '900' }, body: { color: COLORS.muted, fontSize: 12, lineHeight: 18, marginTop: 2 },
  formCard: { padding: 18, borderRadius: Radii.lg, backgroundColor: COLORS.card, gap: 16, ...BeeBetterShadow },
  label: { color: COLORS.ink, fontSize: 14, lineHeight: 20, fontWeight: '800' }, hint: { color: COLORS.muted, fontSize: 11, lineHeight: 16 },
  segmentRow: { flexDirection: 'row', gap: 8 }, segment: { flex: 1, minHeight: 43, alignItems: 'center', justifyContent: 'center', borderRadius: Radii.md, borderWidth: 1, borderColor: COLORS.surfaceMuted },
  segmentSelected: { backgroundColor: COLORS.honeySoft, borderColor: COLORS.honeyDark }, segmentText: { color: COLORS.muted, fontSize: 12, fontWeight: '700' }, segmentTextSelected: { color: COLORS.ink },
  divider: { height: 1, backgroundColor: COLORS.surfaceMuted }, questOptions: { gap: 8, paddingRight: 8 },
  questChip: { maxWidth: 220, minHeight: 40, justifyContent: 'center', paddingHorizontal: 13, borderRadius: Radii.pill, borderWidth: 1, borderColor: COLORS.surfaceMuted, backgroundColor: COLORS.background },
  questChipSelected: { backgroundColor: COLORS.honeySoft, borderColor: COLORS.honeyDark }, questChipText: { color: COLORS.ink, fontSize: 11, fontWeight: '700' },
  field: { gap: 6 }, textArea: { minHeight: 92, borderWidth: 1, borderColor: COLORS.surfaceMuted, borderRadius: Radii.md, backgroundColor: COLORS.background, color: COLORS.ink, padding: 13, fontSize: 14 },
  counter: { color: COLORS.muted, fontSize: 10, textAlign: 'right' },
  primaryButton: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: Radii.md, backgroundColor: COLORS.honey },
  primaryText: { color: COLORS.ink, fontSize: 13, fontWeight: '900' }, disabled: { opacity: 0.55 },
  historyLink: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, borderRadius: Radii.lg, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.surfaceMuted },
  historyText: { flex: 1, color: COLORS.ink, fontSize: 13, fontWeight: '800' },
});
