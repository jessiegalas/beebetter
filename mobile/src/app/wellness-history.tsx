import { useEffect, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { router, useIsFocused } from 'expo-router';
import { Button, Disclosure, IconButton, ScreenFrame, ScreenHeader, StatusMessage } from '@/components/mobile-ui';
import { ThemedText } from '@/components/themed-text';
import { MOBILE_WELLNESS_AND_SUPPORT_ENABLED } from '@/constants/features';
import { Spacing, useBeePalette } from '@/constants/theme';
import { useUserData } from '@/hooks/use-user-data';
import { listMyCheckIns, listMyReflections, type SelfManagementReflection, type WellbeingCheckIn } from '@/lib/wellbeing-data';

const RATINGS = [
  ['overall_wellbeing', 'Well-being'],
  ['stress_level', 'Stress'],
  ['energy_level', 'Energy'],
] as const;

type History = { checkIns: WellbeingCheckIn[]; reflections: SelfManagementReflection[] };

export default function WellnessHistoryScreen() {
  const { user } = useUserData();
  return user ? <CheckInHistory key={user.id} studentId={user.id} /> : null;
}

function CheckInHistory({ studentId }: { studentId: string }) {
  const c = useBeePalette();
  const focused = useIsFocused();
  const { quests } = useUserData();
  const [history, setHistory] = useState<History | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!focused) return;
    let active = true;
    void Promise.all([
      listMyCheckIns(studentId),
      MOBILE_WELLNESS_AND_SUPPORT_ENABLED ? listMyReflections(studentId) : [],
    ]).then(([checkIns, reflections]) => {
      if (active) {
        setHistory({ checkIns, reflections });
        setError(false);
      }
    }).catch(() => {
      if (active) setError(true);
    }).finally(() => {
      if (active) setRefreshing(false);
    });
    return () => { active = false; };
  }, [studentId, focused, attempt]);

  return <ScreenFrame refreshControl={<RefreshControl refreshing={refreshing} tintColor={c.primary} colors={[c.primary]}
    onRefresh={() => {
      setRefreshing(true);
      setAttempt(value => value + 1);
    }} />}>
    <ScreenHeader title={MOBILE_WELLNESS_AND_SUPPORT_ENABLED ? 'My wellness history' : 'Check-in history'}
      leading={<IconButton icon="arrow-back" label="Go back"
        onPress={() => router.canGoBack() ? router.back() : router.replace('/wellness-check-in')} />} />
    {error && <StatusMessage error message="Could not load your history.">
      <Button label="Try again" intent="secondary" onPress={() => {
        setError(false);
        setAttempt(value => value + 1);
      }} />
    </StatusMessage>}
    {!error && !history && <StatusMessage loading message="Loading your history…" />}
    {history && (history.checkIns.length > 0 ? <>
      <View style={styles.section}>
        <ThemedText type="subtitle" accessibilityRole="header">Your averages</ThemedText>
        <ThemedText style={{ color: c.muted }}>Based on {history.checkIns.length} saved {history.checkIns.length === 1 ? 'check-in' : 'check-ins'}.</ThemedText>
        {RATINGS.map(([field, label]) => {
          const mean = history.checkIns.reduce((sum, entry) => sum + entry[field], 0) / history.checkIns.length;
          return <ThemedText key={field}>{label} · {mean.toFixed(1)}/5</ThemedText>;
        })}
      </View>
      <View style={styles.section}>
        <ThemedText type="subtitle" accessibilityRole="header">Saved check-ins</ThemedText>
        {history.checkIns.map(entry => <Disclosure key={entry.id} title={formatDate(entry.check_in_date)}>
          {RATINGS.map(([field, label]) => <ThemedText key={field}>{label} · {entry[field]}/5</ThemedText>)}
          {entry.motivation_level !== null && <ThemedText>Motivation · {entry.motivation_level}/5</ThemedText>}
          {entry.note && <View style={styles.section}>
            <ThemedText type="label">Private note</ThemedText>
            <ThemedText>{entry.note}</ThemedText>
          </View>}
        </Disclosure>)}
      </View>
    </> : <StatusMessage message="No check-ins yet. Your saved entries will appear here.">
      <Button label="Open daily check-in" intent="secondary" onPress={() => router.navigate('/wellness-check-in')} />
    </StatusMessage>)}
    {MOBILE_WELLNESS_AND_SUPPORT_ENABLED && history && <View style={styles.section}>
      <ThemedText type="subtitle" accessibilityRole="header">Reflections</ThemedText>
      {history.reflections.length === 0 && <ThemedText>No reflections yet.</ThemedText>}
      {history.reflections.map(entry => <Disclosure key={entry.id} title={formatPeriod(entry.period_start, entry.period_end)}>
        <ThemedText>{quests.find(quest => quest.id === entry.quest_id)?.title ?? 'General reflection'}</ThemedText>
        <ThemedText>Planning · {entry.planning_score}/5</ThemedText>
        <ThemedText>Follow-through · {entry.follow_through_score}/5</ThemedText>
        <ThemedText>Confidence · {entry.confidence_score}/5</ThemedText>
        {entry.accomplishment && <ThemedText>Accomplishment · {entry.accomplishment}</ThemedText>}
        {entry.challenge && <ThemedText>Challenge · {entry.challenge}</ThemedText>}
        {entry.next_step && <ThemedText>Next step · {entry.next_step}</ThemedText>}
      </Disclosure>)}
    </View>}
  </ScreenFrame>;
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatPeriod(start: string, end: string) {
  return start === end ? formatDate(end) : `${formatDate(start)} – ${formatDate(end)}`;
}

const styles = StyleSheet.create({
  section: { gap: Spacing.sm },
});
