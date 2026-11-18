import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { Button, ChoiceChip, Field, Surface } from '@/components/mobile-ui';
import { ThemedText } from '@/components/themed-text';
import { InlineMessage, PrivacyNote, RatingScale, WellnessHeader, type RatingOption } from '@/components/wellness-ui';
import { useBeeStyles, type BeePalette, Borders, SectionColumn, Spacing, Typography } from '@/constants/theme';
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
  const styles = useBeeStyles(makeStyles);
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
        accomplishment: accomplishment.trim() || null, challenge: challenge.trim() || null, next_step: nextStep.trim() || null });
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
              <View style={styles.copy}><ThemedText style={styles.body}>Reflection is optional and can be completed with or without a quest.</ThemedText></View>
            </View>
            <Surface>
              <View>
                <ThemedText style={styles.label}>Reflection period</ThemedText>
                <ThemedText style={styles.hint}>Choose the time you are thinking about.</ThemedText>
              </View>
              <View style={styles.choices} accessibilityRole="radiogroup">
                {(['today', 'week'] as const).map(value => <ChoiceChip key={value} role="radio"
                  label={value === 'today' ? 'Today' : 'Last 7 days'} selected={period === value} onPress={() => setPeriod(value)} />)}
              </View>
              <View style={styles.divider} />
              <RatingScale title="Planning" hint="How well did you decide what needed your attention?" value={planning} options={SCALE} onChange={setPlanning} />
              <View style={styles.divider} />
              <RatingScale title="Follow-through" hint="How well did your actions match what you planned?" value={followThrough} options={SCALE} onChange={setFollowThrough} />
              <View style={styles.divider} />
              <RatingScale title="Confidence" hint="How confident do you feel about your next step?" value={confidence} options={SCALE} onChange={setConfidence} />
              <View style={styles.divider} />
              <View><ThemedText style={styles.label}>Related quest (optional)</ThemedText><ThemedText style={styles.hint}>Leave this unselected for a general reflection.</ThemedText></View>
              <View style={styles.choices} accessibilityRole="radiogroup">
                <ChoiceChip role="radio" label="No quest" selected={questId === null} onPress={() => setQuestId(null)} />
                {quests.map(quest => <ChoiceChip key={quest.id} role="radio" label={quest.title}
                  selected={questId === quest.id} onPress={() => setQuestId(quest.id)} />)}
              </View>
              <ReflectionField label="Something I accomplished (optional)" placeholder="What moved forward?" value={accomplishment} onChange={setAccomplishment} />
              <ReflectionField label="A challenge I noticed (optional)" placeholder="What made things harder?" value={challenge} onChange={setChallenge} />
              <ReflectionField label="My next step (optional)" placeholder="What small action will I try next?" value={nextStep} onChange={setNextStep} />
              {feedback && <InlineMessage {...feedback} />}
              <Button label={'Save private reflection'} loading={saving} onPress={() => void submit()} />
            </Surface>
            <Button label="Review my reflections" icon="time-outline" intent="secondary" onPress={() => router.push('/wellness-history')} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function ReflectionField({ label, placeholder, value, onChange }: { label: string; placeholder: string; value: string; onChange: (value: string) => void }) {
  const styles = useBeeStyles(makeStyles);
  return <View style={styles.field}>
    <Field label={label} value={value} onChangeText={onChange} maxLength={1000} multiline placeholder={placeholder} textAlignVertical="top" numberOfLines={3} />
    <ThemedText type="small" style={styles.counter}>{value.length}/1000</ThemedText>
  </View>;
}

const makeStyles = (COLORS: BeePalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' }, safeArea: { flex: 1 },
  content: SectionColumn,
  hero: { gap: Spacing.sm },
  copy: { flex: 1, minWidth: 0 }, body: { ...Typography.body, color: COLORS.muted, marginTop: Spacing.half },
  label: { ...Typography.label, color: COLORS.ink }, hint: { ...Typography.metadata, color: COLORS.muted },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  divider: { height: Borders.default, backgroundColor: COLORS.surfaceMuted },
  field: { gap: Spacing.sm },
  counter: { color: COLORS.muted, textAlign: 'right' },
});
