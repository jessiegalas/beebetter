import { Alert, RefreshControl, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { AchievementEmblem, CategoryBadge } from '@/components/quest-visuals';
import { PixelGlyph } from '@/components/pixel/pixel-glyph';
import { XpProgress } from '@/components/xp-visuals';
import { ThemedText } from '@/components/themed-text';
import { Button, Disclosure, ScreenFrame } from '@/components/mobile-ui';
import { Controls, Layout, Radii, Spacing, useBeePalette } from '@/constants/theme';
import { StudentInformationFields } from '@/components/student-information-fields';
import { validateStudentIdentity, studentIdentityPayload, type StudentIdentity } from '@/lib/student-validation';
import { useUserData } from '@/hooks/use-user-data';
import { evaluateAchievements } from '@/lib/progression';
export default function ProfileScreen() {
    const COLORS = useBeePalette();
    const { width, fontScale } = useWindowDimensions();
    const expandedLayout = width < Layout.wideBreakpoint && fontScale >= Layout.largeTextScale;
    const { user, profile, completionHistory, progressSummary, levelProgress, isRefreshing, refresh, updateProfile, signOut, isSigningOut, workspaceErrors, retryWorkspace, } = useUserData();
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<StudentIdentity | null>(null);
    const [saving, setSaving] = useState(false);
    const fieldErrors = draft ? validateStudentIdentity(draft, profile ?? undefined) : {};
    const displayName = profile?.display_name ||
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
        const result = await updateProfile(studentIdentityPayload(draft, profile ?? undefined));
        setSaving(false);
        if (!result.success) {
            Alert.alert('Could not save profile', result.error || 'Please try again.');
            return;
        }
        setEditing(false);
        setDraft(null);
    };
    const badges = evaluateAchievements({
        questsCompleted: questsDone,
        level: levelProgress.level,
        currentStreak: streakDays,
    });
    const unlockedBadgesCount = badges.filter((b) => b.unlocked).length;
    const stats = [
        { label: 'Lifetime completions', value: String(questsDone), icon: 'leaf' },
        { label: 'Current Streak', value: `${streakDays} days`, icon: 'streak' },
        { label: 'Badges Earned', value: `${unlockedBadgesCount} / ${badges.length}`, icon: 'rising' },
        { label: 'Total XP', value: String(totalXp), icon: 'xp' },
    ] as const;
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
    <View style={styles.section}>
    <View style={[styles.row, expandedLayout && styles.identityExpanded]}>
    <View style={[styles.avatar, { backgroundColor: COLORS.honeySoft, width: Controls.minHeight * fontScale, height: Controls.minHeight * fontScale }]}>
    <ThemedText type="subtitle">
    {initials || 'B'}
    </ThemedText>
    </View>
    <View style={expandedLayout ? styles.identityCopy : styles.flex}>
    <ThemedText type="subtitle">
    {displayName}
    </ThemedText>
    </View>
    </View>
    <XpProgress progress={levelProgress} scope="Account" />
      <View style={styles.stats}>
        {stats.map(stat => <View key={stat.label} style={[styles.stat, expandedLayout && styles.statExpanded]}>
        <PixelGlyph name={stat.icon} />
        <ThemedText type="item">
        {stat.value}
        </ThemedText>
        <ThemedText type="small" style={{ color: COLORS.muted }}>
        {stat.label}
        </ThemedText>
        </View>)}
    </View>
    {(['profile', 'streak', 'progress'] as const).map(scope => workspaceErrors[scope] && <View key={scope}>
        <ThemedText style={{ color: COLORS.danger }}>
        {workspaceErrors[scope]}
        </ThemedText>
        <Button intent="quiet" label={'Retry ' + scope} onPress={() => void retryWorkspace(scope)}/>
        </View>)}
    </View>
    <Disclosure title="Student information" summary="Your student ID and optional name" defaultOpen={false}>
      {editing && draft ? <>
        <StudentInformationFields value={draft} onChange={setDraft} errors={fieldErrors} disabled={saving}/>
        <Button label="Save student information" loading={saving} disabled={Object.keys(fieldErrors).length > 0} onPress={() => void saveProfile()}/>
        <Button label="Cancel editing" intent="quiet" disabled={saving} onPress={() => { setEditing(false); setDraft(null); }}/>
        </> : <>
        <InfoRow label="Student ID" value={profile?.student_number || 'Not provided'}/>
        <InfoRow label="Name or nickname" value={profile?.name || 'Not set'}/>
        <Button label="Edit student information" intent="secondary" icon="create-outline" onPress={startEditing}/>
        </>}
    </Disclosure>
    <Disclosure title="Achievements" summary="Quest milestones and badges">
    <View style={{ gap: Spacing.gutter }}>
        {badges.map(badge => <View key={badge.id} style={styles.row}>
        <View style={[styles.avatar, { backgroundColor: badge.unlocked ? COLORS.honeySoft : COLORS.surfaceMuted }]}>
        <AchievementEmblem id={badge.id} earned={badge.unlocked} />
        </View>
        <View style={styles.flex}>
        <ThemedText type="item">
        {badge.title}
        </ThemedText>
        <ThemedText type="small" style={{ color: COLORS.muted }}>
        {badge.description} · {badge.unlocked ? 'Unlocked' : 'Not yet reached'}
        </ThemedText>
        </View>
        </View>)}
    </View>
    </Disclosure>
    <Disclosure title="History" summary="Your latest recorded completions">
        {completionHistory.length ? completionHistory.slice(0, 10).map(record => <View key={record.id} style={{ gap: Spacing.xs }}>
        <View style={styles.row}><PixelGlyph name="leaf" /><ThemedText type="item" style={styles.flex}>{record.title}</ThemedText></View>
        <CategoryBadge label={record.category} />
        <ThemedText type="small" style={{ color: COLORS.muted }}>
        {new Date(record.completed_at).toLocaleDateString()}
        </ThemedText>
        </View>) : <ThemedText style={{ color: COLORS.muted }}>No completion history yet. Complete a quest to record your first win.</ThemedText>}
    </Disclosure>
    <View style={{ gap: Spacing.md }}>
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
    return <View style={{ gap: Spacing.xs }}>
    <ThemedText type="small" style={{ color: c.muted }}>
    {label}
    </ThemedText>
    <ThemedText>
    {value}
    </ThemedText>
    </View>;
}
const styles = StyleSheet.create({ section: { gap: Spacing.lg }, identityExpanded: { flexDirection: 'column', alignItems: 'flex-start' }, identityCopy: { width: '100%', gap: Spacing.xs }, statExpanded: { flexBasis: '100%' }, row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md }, flex: { flex: 1, minWidth: 0 }, avatar: { borderRadius: Radii.lg, alignItems: 'center', justifyContent: 'center' }, stats: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.gutter, paddingTop: Spacing.sm }, stat: { flexGrow: 1, flexBasis: '40%', gap: Spacing.xs } });
