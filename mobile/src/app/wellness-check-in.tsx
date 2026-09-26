import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { InlineMessage, PrivacyNote, RatingScale, WellnessHeader, type RatingOption } from '@/components/wellness-ui';
import { BeeBetterColors as COLORS, BeeBetterShadow, MaxContentWidth, Radii } from '@/constants/theme';
import { useUserData } from '@/hooks/use-user-data';
import { listMyCheckIns, saveMyCheckIn } from '@/lib/wellbeing-data';

const WELLBEING: RatingOption[] = [
  { value: 1, label: 'Very low' }, { value: 2, label: 'Low' }, { value: 3, label: 'Okay' }, { value: 4, label: 'Good' }, { value: 5, label: 'Very good' },
];
const INTENSITY: RatingOption[] = [
  { value: 1, label: 'Very low' }, { value: 2, label: 'Low' }, { value: 3, label: 'Moderate' }, { value: 4, label: 'High' }, { value: 5, label: 'Very high' },
];
const MOTIVATION: RatingOption[] = [
  { value: 1, label: 'Very low' }, { value: 2, label: 'Low' }, { value: 3, label: 'Steady' }, { value: 4, label: 'High' }, { value: 5, label: 'Very high' },
];

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function WellnessCheckInScreen() {
  const { user } = useUserData();
  const [wellbeing, setWellbeing] = useState<number | null>(null);
  const [stress, setStress] = useState<number | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [motivation, setMotivation] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existing, setExisting] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; tone: 'error' | 'success' } | null>(null);

  useEffect(() => {
    let active = true;
    if (!user) return;
    void listMyCheckIns(user.id).then(records => {
      if (!active) return;
      const today = records.find(record => record.check_in_date === localDateKey());
      if (today) {
        setExisting(true);
        setWellbeing(today.overall_wellbeing);
        setStress(today.stress_level);
        setEnergy(today.energy_level);
        setMotivation(today.motivation_level);
        setNote(today.note ?? '');
      }
    }).catch(error => {
      if (active) setFeedback({ message: error instanceof Error ? error.message : 'Could not load today’s check-in.', tone: 'error' });
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user]);

  const submit = async () => {
    if (!user || wellbeing === null || stress === null || energy === null) {
      setFeedback({ message: 'Choose a score for well-being, stress, and energy.', tone: 'error' });
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      await saveMyCheckIn(user.id, {
        check_in_date: localDateKey(), overall_wellbeing: wellbeing, stress_level: stress,
        energy_level: energy, motivation_level: motivation, note: note.trim() || null,
      });
      setExisting(true);
      setFeedback({ message: existing ? 'Today’s private check-in was updated.' : 'Your private check-in was saved.', tone: 'success' });
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : 'Could not save your check-in.', tone: 'error' });
    } finally { setSaving(false); }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <WellnessHeader title="Daily check-in" subtitle="A private moment to notice how today feels" />
        <KeyboardAvoidingView style={styles.safeArea} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <PrivacyNote>Your individual answers and note are private to you. OSAS reports use grouped scores only and do not include your note.</PrivacyNote>
            <View style={styles.introCard}>
              <View style={styles.introIcon}><Ionicons name="sunny-outline" size={24} color={COLORS.honeyDeep} /></View>
              <View style={styles.copy}>
                <ThemedText style={styles.title}>How are you today?</ThemedText>
                <ThemedText style={styles.body}>This is optional and never limits your quests or XP. If you choose a motivation score, it may gently personalize the order and explanation of recommendations. Scores describe your own experience; they are not a diagnosis.</ThemedText>
              </View>
            </View>
            {loading ? <View style={styles.loading}><ActivityIndicator color={COLORS.honeyDark} /><ThemedText style={styles.body}>Loading today’s check-in…</ThemedText></View> : (
              <View style={styles.formCard}>
                {existing && <View style={styles.existing}><Ionicons name="create-outline" size={17} color={COLORS.honeyDeep} /><ThemedText style={styles.existingText}>You already checked in today. Saving again will update today’s entry.</ThemedText></View>}
                <RatingScale title="Overall well-being" hint="1 means very low; 5 means very good." value={wellbeing} options={WELLBEING} onChange={setWellbeing} />
                <View style={styles.divider} />
                <RatingScale title="Stress" hint="1 means very low stress; 5 means very high stress." value={stress} options={INTENSITY} onChange={setStress} />
                <View style={styles.divider} />
                <RatingScale title="Energy" hint="1 means very low energy; 5 means very high energy." value={energy} options={INTENSITY} onChange={setEnergy} />
                <View style={styles.divider} />
                <RatingScale title="Motivation (optional)" hint="How ready do you feel to begin something today? Leave this unanswered if you prefer." value={motivation} options={MOTIVATION} onChange={setMotivation} allowClear />
                <View style={styles.divider} />
                <View>
                  <ThemedText style={styles.label}>Private note (optional)</ThemedText>
                  <ThemedText style={styles.hint}>Add context you may want to remember later.</ThemedText>
                </View>
                <TextInput
                  style={styles.textArea} value={note} onChangeText={setNote} maxLength={1000} multiline
                  placeholder="What is shaping your day?" placeholderTextColor={COLORS.muted} textAlignVertical="top"
                  accessibilityLabel="Optional private check-in note" />
                <ThemedText style={styles.counter}>{note.length}/1000</ThemedText>
                {feedback && <InlineMessage {...feedback} />}
                <TouchableOpacity style={[styles.primaryButton, saving && styles.disabled]} onPress={() => void submit()} disabled={saving} accessibilityRole="button">
                  {saving ? <ActivityIndicator color={COLORS.ink} /> : <Ionicons name="lock-closed-outline" size={18} color={COLORS.ink} />}
                  <ThemedText style={styles.primaryText}>{saving ? 'Saving…' : existing ? 'Update today’s check-in' : 'Save private check-in'}</ThemedText>
                </TouchableOpacity>
              </View>
            )}
            <TouchableOpacity style={styles.historyLink} onPress={() => router.push('/wellness-history' as any)} accessibilityRole="button">
              <Ionicons name="stats-chart-outline" size={20} color={COLORS.honeyDeep} />
              <View style={styles.copy}><ThemedText style={styles.linkTitle}>View my history and trends</ThemedText><ThemedText style={styles.body}>Review only the entries saved to your account.</ThemedText></View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background }, safeArea: { flex: 1 },
  content: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: 48, gap: 14 },
  introCard: { flexDirection: 'row', gap: 13, padding: 17, borderRadius: Radii.lg, backgroundColor: COLORS.surfaceWarm },
  introIcon: { width: 45, height: 45, borderRadius: Radii.md, backgroundColor: COLORS.honeySoft, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0 }, title: { color: COLORS.ink, fontSize: 19, lineHeight: 25, fontWeight: '900' },
  body: { color: COLORS.muted, fontSize: 12, lineHeight: 18, marginTop: 2 },
  loading: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 10 },
  formCard: { padding: 18, borderRadius: Radii.lg, backgroundColor: COLORS.card, gap: 16, ...BeeBetterShadow },
  existing: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 11, borderRadius: Radii.md, backgroundColor: COLORS.honeySoft },
  existingText: { flex: 1, color: COLORS.ink, fontSize: 11, lineHeight: 17 }, divider: { height: 1, backgroundColor: COLORS.surfaceMuted },
  label: { color: COLORS.ink, fontSize: 14, lineHeight: 20, fontWeight: '800' }, hint: { color: COLORS.muted, fontSize: 11, lineHeight: 16 },
  textArea: { minHeight: 108, borderWidth: 1, borderColor: COLORS.surfaceMuted, borderRadius: Radii.md, backgroundColor: COLORS.background, color: COLORS.ink, padding: 13, fontSize: 14 },
  counter: { color: COLORS.muted, fontSize: 10, textAlign: 'right', marginTop: -12 },
  primaryButton: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: Radii.md, backgroundColor: COLORS.honey },
  primaryText: { color: COLORS.ink, fontSize: 13, fontWeight: '900' }, disabled: { opacity: 0.55 },
  historyLink: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: Radii.lg, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.surfaceMuted },
  linkTitle: { color: COLORS.ink, fontSize: 14, lineHeight: 20, fontWeight: '800' },
});
