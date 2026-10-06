import { Alert, RefreshControl, StyleSheet, View } from 'react-native';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { XpProgress } from '@/components/xp-visuals';
import { ThemedText } from '@/components/themed-text';
import { Button, Disclosure, ScreenFrame, Surface } from '@/components/mobile-ui';
import { useBeePalette } from '@/constants/theme';
import { StudentInformationFields } from '@/components/student-information-fields';
import { useEnrollmentOptions } from '@/hooks/use-enrollment-options';
import { validateStudent, studentPayload } from '@/lib/student-validation';
import { useUserData, StudentProfileUpdates } from '@/hooks/use-user-data';
export default function ProfileScreen() {
    const COLORS = useBeePalette();
    const { user, profile, completionHistory, progressSummary, levelProgress, isRefreshing, refresh, updateProfile, signOut, isSigningOut, workspaceErrors, retryWorkspace, } = useUserData();
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<StudentProfileUpdates | null>(null);
    const [saving, setSaving] = useState(false);
    const enrollment = useEnrollmentOptions();
    const fieldErrors = draft ? validateStudent(draft, enrollment.options, profile ?? undefined) : {};
    const displayName = profile?.display_name ||
        user?.email?.split('@')[0] ||
        (user ? 'Bee Explorer' : 'Guest Explorer');
    const initials = displayName
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join('');
    const streakDays = profile?.current_streak ?? 0;
    const totalXp = profile?.total_xp ?? 0;
    const questsDone = progressSummary.totalCompleted;
    const startEditing = () => {
        if (!profile)
            return;
        setDraft({
            student_number: profile.student_number,
            name: profile.name,
            course: profile.course,
            year_level: profile.year_level,
            section: profile.section,
            campus: profile.campus,
            goal: profile.goal,
        });
        setEditing(true);
    };
    const saveProfile = async () => {
        if (!draft)
            return;
        if (Object.keys(fieldErrors).length > 0) {
            Alert.alert('Complete your profile', Object.values(fieldErrors)[0] || 'Check your student information.');
            return;
        }
        setSaving(true);
        const result = await updateProfile(studentPayload(draft, profile ?? undefined));
        setSaving(false);
        if (!result.success) {
            Alert.alert('Could not save profile', result.error || 'Please try again.');
            return;
        }
        setEditing(false);
        setDraft(null);
    };
    const badges = [
        { id: 'first_quest', title: 'First Flight', desc: 'Complete 1 quest', unlocked: questsDone >= 1, icon: 'sparkles' as const },
        { id: 'five_quests', title: 'Busy Worker', desc: 'Complete 5 quests', unlocked: questsDone >= 5, icon: 'trophy' as const },
        { id: 'level_2', title: 'Hive Rising', desc: 'Reach Level 2', unlocked: levelProgress.level >= 2, icon: 'star' as const },
        { id: 'streak_3', title: 'On A Roll', desc: 'Reach a 3-day streak', unlocked: streakDays >= 3, icon: 'flame' as const },
        { id: 'level_5', title: 'Master Pollinator', desc: 'Reach Level 5', unlocked: levelProgress.level >= 5, icon: 'ribbon' as const },
    ];
    const unlockedBadgesCount = badges.filter((b) => b.unlocked).length;
    const stats = [
        { id: 1, label: 'Quests Done', value: String(questsDone), icon: 'checkmark-circle-outline' as const },
        { id: 2, label: 'Current Streak', value: `${streakDays} days`, icon: 'flame-outline' as const },
        { id: 3, label: 'Badges Earned', value: `${unlockedBadgesCount} / ${badges.length}`, icon: 'ribbon-outline' as const },
        { id: 4, label: 'Total XP', value: String(totalXp), icon: 'sparkles-outline' as const },
    ];
    const handleSignOut = () => {
        if (isSigningOut)
            return;
        Alert.alert('Sign Out', 'Are you sure you want to sign out of BeeBetter?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Sign Out',
                style: 'destructive',
                onPress: () => { void signOut(); },
            },
        ]);
    };
    return <ScreenFrame tab refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={COLORS.honeyDark}/>}>
    <ThemedText type="title">Profile</ThemedText>
    <Surface>
    <View style={styles.row}>
    <View style={[styles.avatar, { backgroundColor: COLORS.honeySoft }]}>
    <ThemedText type="subtitle">
    {initials || 'B'}
    </ThemedText>
    </View>
    <View style={styles.flex}>
    <ThemedText type="subtitle">
    {displayName}
    </ThemedText>
    <ThemedText type="small" style={{ color: COLORS.muted }}>
    {profile?.email || user?.email}
    </ThemedText>
    </View>
    </View>
    <XpProgress progress={levelProgress}/>
      <View style={styles.stats}>
        {stats.map(stat => <View key={stat.id} style={styles.stat}>
        <ThemedText type="item">
        {stat.value}
        </ThemedText>
        <ThemedText type="small" style={{ color: COLORS.muted }}>
        {stat.label === 'Quests Done' ? 'Lifetime completions' : stat.label}
        </ThemedText>
        </View>)}
    </View>
    </Surface>
    {(['profile', 'streak', 'progress'] as const).map(scope => workspaceErrors[scope] && <View key={scope}>
        <ThemedText style={{ color: COLORS.danger }}>
        {workspaceErrors[scope]}
        </ThemedText>
        <Button intent="quiet" label={'Retry ' + scope} onPress={() => void retryWorkspace(scope)}/>
        </View>)}
    <Surface>
    <Disclosure title="Student information" summary={profile?.course || 'Your enrollment and current goal'} defaultOpen={false}>
      {editing && draft ? <>
        <StudentInformationFields value={draft} onChange={setDraft} options={enrollment.options} errors={fieldErrors} loading={enrollment.loading} loadError={enrollment.error} onRetry={enrollment.retry} disabled={saving} original={profile ?? undefined}/>
        <Button label="Save student information" loading={saving} disabled={Object.keys(fieldErrors).length > 0} onPress={() => void saveProfile()}/>
        <Button label="Cancel editing" intent="quiet" disabled={saving} onPress={() => { setEditing(false); setDraft(null); }}/>
        </> : <>
        <InfoRow label="Student number" value={profile?.student_number || 'Not provided'}/>
        <InfoRow label="Course" value={profile?.course || 'Not provided'}/>
        <InfoRow label="Year / section" value={(profile?.year_level || 'Not provided') + ' · ' + (profile?.section || 'Not provided')}/>
        <InfoRow label="Campus" value={profile?.campus || 'Not provided'}/>
        <InfoRow label="Current goal" value={profile?.goal || 'No goal set'}/>
        <Button label="Edit student information" intent="secondary" icon="create-outline" onPress={startEditing}/>
        </>}
    </Disclosure>
    </Surface>
    <Surface>
    <Disclosure title="Achievements" summary="Quest milestones and badges">
    <View style={{ gap: 20 }}>
        {badges.map(badge => <View key={badge.id} style={styles.row}>
        <View style={[styles.avatar, { backgroundColor: badge.unlocked ? COLORS.honeySoft : COLORS.surfaceMuted }]}>
        <Ionicons name={badge.icon} size={20} color={badge.unlocked ? COLORS.honeyDark : COLORS.muted}/>
        </View>
        <View style={styles.flex}>
        <ThemedText type="item">
        {badge.title}
        </ThemedText>
        <ThemedText type="small" style={{ color: COLORS.muted }}>
        {badge.desc} · {badge.unlocked ? 'Unlocked' : 'Not yet reached'}
        </ThemedText>
        </View>
        </View>)}
    </View>
    </Disclosure>
    </Surface>
    <Surface>
    <Disclosure title="History" summary="Your latest recorded completions">
        {completionHistory.length ? completionHistory.slice(0, 10).map(record => <View key={record.id} style={{ gap: 4 }}>
        <ThemedText type="item">
        {record.title}
        </ThemedText>
        <ThemedText type="small" style={{ color: COLORS.muted }}>
        {new Date(record.completed_at).toLocaleDateString()} · {record.category}
        </ThemedText>
        </View>) : <ThemedText style={{ color: COLORS.muted }}>No completion history yet. Complete a quest to record your first win.</ThemedText>}
    </Disclosure>
    </Surface>
    <View style={{ gap: 12 }}>
    <ThemedText type="subtitle">Account</ThemedText>
    <Button intent="secondary" icon="location-outline" label="Saved places" onPress={() => router.push('/manage-locations')}/>
    <Button intent="quiet" icon="sync-outline" label="Refresh my data" loading={isRefreshing} onPress={() => void refresh()}/>
    <Button intent="destructive" icon="log-out-outline" label="Sign out" loading={isSigningOut} onPress={handleSignOut}/>
    </View>
  </ScreenFrame>;
}
function InfoRow({ label, value }: {
    label: string;
    value: string;
}) {
    const c = useBeePalette();
    return <View style={{ gap: 4 }}>
    <ThemedText type="small" style={{ color: c.muted }}>
    {label}
    </ThemedText>
    <ThemedText>
    {value}
    </ThemedText>
    </View>;
}
const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: 12 }, flex: { flex: 1, minWidth: 0 }, avatar: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 20, paddingTop: 8 }, stat: { flexGrow: 1, flexBasis: '40%', gap: 4 } });
