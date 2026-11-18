import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Disclosure, Field, StatusMessage } from '@/components/mobile-ui';
import { PixelButton } from '@/components/pixel/pixel-button';
import { PixelChoice } from '@/components/pixel/pixel-choice';
import { ThemedText } from '@/components/themed-text';
import { PixelSpacing, Spacing, useBeePalette } from '@/constants/theme';
import { checkInDateKey } from '@/hooks/use-daily-check-in';
import { getMyCheckIn, saveMyCheckIn } from '@/lib/wellbeing-data';

const SCORES = [1, 2, 3, 4, 5];

export function DailyCheckIn({ studentId, day, initialWellbeing, onClose, onHistory }: {
  studentId: string;
  day: Date;
  initialWellbeing?: number;
  onClose: () => void;
  onHistory: () => void;
}) {
  const c = useBeePalette();
  const date = checkInDateKey(day);
  const [wellbeing, setWellbeing] = useState<number | null>(null);
  const [stress, setStress] = useState<number | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [motivation, setMotivation] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [existing, setExisting] = useState(false);
  const pendingSave = useRef(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  const ready = loadState === 'ready';
  const formDisabled = !ready || saving;

  useEffect(() => {
    let active = true;
    void getMyCheckIn(studentId, date).then(record => {
      if (!active) return;
      setWellbeing(initialWellbeing ?? record?.overall_wellbeing ?? null);
      if (record) {
        setExisting(true);
        setStress(record.stress_level);
        setEnergy(record.energy_level);
        setMotivation(record.motivation_level);
        setNote(record.note ?? '');
      }
      setLoadState('ready');
    }).catch(() => {
      if (active) setLoadState('error');
    });
    return () => { active = false; };
  }, [studentId, date, initialWellbeing, loadAttempt]);

  async function submit() {
    if (loadState !== 'ready' || pendingSave.current) return;
    if (wellbeing === null || stress === null || energy === null) {
      setFeedback({ message: 'Choose a score for well-being, stress, and energy.', error: true });
      return;
    }
    pendingSave.current = true;
    setSaving(true);
    setFeedback(null);
    try {
      await saveMyCheckIn(studentId, {
        check_in_date: date,
        overall_wellbeing: wellbeing,
        stress_level: stress,
        energy_level: energy,
        motivation_level: motivation,
        note,
      });
      setExisting(true);
      setFeedback({ message: existing ? 'Check-in updated.' : 'Check-in saved.' });
    } catch {
      setFeedback({ message: 'Could not save your check-in. Try again.', error: true });
    } finally {
      pendingSave.current = false;
      setSaving(false);
    }
  }

  return <>
      <View style={styles.intro}>
        <ThemedText type="small" style={{ color: c.muted, flexShrink: 1 }}>
          {day.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        </ThemedText>
        <Button label={existing ? 'Done' : 'Skip today'} intent="quiet" disabled={saving} onPress={onClose} />
      </View>

      <ThemedText style={{ color: c.muted }}>
        OSAS sees group ratings. Your entry and note stay private.
      </ThemedText>

      <View>
        {loadState === 'loading' && <StatusMessage loading message="Loading your check-in…" />}
        {loadState === 'error' && <StatusMessage error message="Could not load your check-in.">
          <Button label="Try again" intent="secondary" onPress={() => {
            setLoadState('loading');
            setLoadAttempt(attempt => attempt + 1);
          }} />
        </StatusMessage>}
        {/* The pixel frames measure their host before painting. Lay them out while the record loads. */}
        <View style={[styles.form, !ready && styles.preparing]} pointerEvents={ready ? 'auto' : 'none'}
          accessibilityElementsHidden={!ready} importantForAccessibility={ready ? 'auto' : 'no-hide-descendants'}>
          <Rating label="Overall well-being" hint="1 very low · 5 very good" value={wellbeing} onChange={setWellbeing} disabled={formDisabled} />
          <Rating label="Stress" hint="1 very low · 5 very high" value={stress} onChange={setStress} disabled={formDisabled} />
          <Rating label="Energy" hint="1 very low · 5 very high" value={energy} onChange={setEnergy} disabled={formDisabled} />
          {ready && <Disclosure title="Optional details" summary="Motivation and a private note">
            <View style={styles.field}>
              <Rating label="Motivation" optional hint="1 very low · 5 very high" value={motivation} onChange={setMotivation} disabled={saving} />
              {motivation !== null && <Button label="Clear motivation" intent="quiet" style={styles.secondaryAction} disabled={saving} onPress={() => setMotivation(null)} />}
            </View>
            <View style={styles.field}>
              <Field label="Private note" value={note} onChangeText={setNote} maxLength={1000}
                multiline editable={!saving} textAlignVertical="top" style={styles.note} />
              <ThemedText type="small" style={{ color: c.muted, alignSelf: 'flex-end' }}>{note.length}/1000</ThemedText>
            </View>
          </Disclosure>}
          <View style={styles.field}>
            {feedback && <StatusMessage {...feedback} />}
            <PixelButton layout="wrap" label={existing ? 'Update check-in' : 'Save check-in'} disabled={!ready} loading={saving} onPress={() => void submit()} />
          </View>
        </View>
      </View>
      <Button label="View check-in history" intent="quiet" icon="time-outline"
        disabled={saving} onPress={onHistory} />
  </>;
}

function Rating({ label, hint, optional, value, onChange, disabled }: {
  label: string;
  hint: string;
  optional?: boolean;
  value: number | null;
  onChange: (score: number) => void;
  disabled: boolean;
}) {
  const c = useBeePalette();
  return <View style={styles.field}>
    <View style={styles.ratingHeading}>
      <ThemedText type="item" accessibilityRole="header">{label}{optional ? ' (optional)' : ''}</ThemedText>
      <ThemedText type="small" style={{ color: c.muted }}>{hint}</ThemedText>
    </View>
    <View style={styles.options}>
      {SCORES.map(score => <PixelChoice key={score} label={String(score)} accessibilityLabel={`${label}, ${score} out of 5`}
        selected={value === score} disabled={disabled} onPress={() => onChange(score)} />)}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  intro: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  form: { gap: Spacing.lg },
  preparing: { position: 'absolute', top: 0, left: 0, right: 0, opacity: 0 },
  field: { gap: Spacing.sm },
  ratingHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: Spacing.md, rowGap: Spacing.xs },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: PixelSpacing.px2 },
  secondaryAction: { alignSelf: 'flex-start' },
  note: { minHeight: Spacing.page * 2 },
});
