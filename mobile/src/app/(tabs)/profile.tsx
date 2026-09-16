import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { BeeBetterColors as COLORS, BeeBetterShadow } from '@/constants/theme';
import { useUserData, StudentProfileUpdates } from '@/hooks/use-user-data';

export default function ProfileScreen() {
  const {
    user,
    profile,
    completedQuests,
    levelProgress,
    isRefreshing,
    refresh,
    updateProfile,
    signOut,
  } = useUserData();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<StudentProfileUpdates | null>(null);
  const [saving, setSaving] = useState(false);

  const displayName =
    profile?.display_name ||
    user?.email?.split('@')[0] ||
    (user ? 'Bee Explorer' : 'Guest Explorer');

  const streakDays = profile?.current_streak ?? 0;
  const totalXp = profile?.total_xp ?? 0;
  const questsDone = completedQuests.length;

  const startEditing = () => {
    if (!profile) return;
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
    if (!draft) return;
    if (Object.values(draft).some((value) => !value.trim())) {
      Alert.alert('Complete your profile', 'Student number, name, course, year level, section, campus, and goal are required.');
      return;
    }
    setSaving(true);
    const result = await updateProfile(draft);
    setSaving(false);
    if (!result.success) {
      Alert.alert('Could not save profile', result.error || 'Please try again.');
      return;
    }
    setEditing(false);
    setDraft(null);
  };

  // Dynamic achievement badges based on player milestones
  const badges = [
    {
      id: 'first_quest',
      title: 'First Flight',
      desc: 'Complete 1 quest',
      unlocked: questsDone >= 1,
      icon: 'sparkles' as const,
    },
    {
      id: 'five_quests',
      title: 'Busy Worker',
      desc: 'Complete 5 quests',
      unlocked: questsDone >= 5,
      icon: 'trophy' as const,
    },
    {
      id: 'level_2',
      title: 'Hive Rising',
      desc: 'Reach Level 2',
      unlocked: levelProgress.level >= 2,
      icon: 'star' as const,
    },
    {
      id: 'streak_3',
      title: 'On A Roll',
      desc: 'Reach a 3-day streak',
      unlocked: streakDays >= 3,
      icon: 'flame' as const,
    },
    {
      id: 'level_5',
      title: 'Master Pollinator',
      desc: 'Reach Level 5',
      unlocked: levelProgress.level >= 5,
      icon: 'ribbon' as const,
    },
  ];

  const unlockedBadgesCount = badges.filter((b) => b.unlocked).length;

  const stats = [
    { id: 1, label: 'Quests Done', value: String(questsDone), icon: 'checkmark-circle-outline' as const },
    { id: 2, label: 'Current Streak', value: `${streakDays} days`, icon: 'flame-outline' as const },
    { id: 3, label: 'Badges Earned', value: `${unlockedBadgesCount} / ${badges.length}`, icon: 'ribbon-outline' as const },
    { id: 4, label: 'Total XP', value: String(totalXp), icon: 'sparkles-outline' as const },
  ];

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out of BeeBetter?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/auth');
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={22} color={COLORS.ink} />
          </View>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.headerTitle}>My Profile</ThemedText>
            {user?.email && (
              <ThemedText style={styles.headerEmail} numberOfLines={1}>
                {user.email}
              </ThemedText>
            )}
          </View>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={handleSignOut}
            accessibilityLabel="Sign Out">
            <Ionicons name="log-out-outline" size={19} color={COLORS.danger} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={refresh}
              colors={[COLORS.honeyDark]}
              tintColor={COLORS.honeyDark}
            />
          }>
          {/* Profile Card */}
          <View style={styles.profileCard}>

                      <View style={styles.sectionCard}>
                        <View style={styles.sectionHeaderRow}>
                          <ThemedText style={styles.sectionTitle}>Student Information</ThemedText>
                          <TouchableOpacity onPress={editing ? saveProfile : startEditing} disabled={saving}>
                            <ThemedText style={styles.editText}>{saving ? 'Saving...' : editing ? 'Save' : 'Edit'}</ThemedText>
                          </TouchableOpacity>
                        </View>
                        {editing && draft ? (
                          <View style={styles.formGrid}>
                            {([
                              ['student_number', 'Student Number'],
                              ['name', 'Name'],
                              ['course', 'Course'],
                              ['year_level', 'Year Level'],
                              ['section', 'Section'],
                              ['campus', 'Campus'],
                              ['goal', 'Goal'],
                            ] as const).map(([field, label]) => (
                              <View key={field}>
                                <ThemedText style={styles.fieldLabel}>{label}</ThemedText>
                                <TextInput
                                  style={styles.profileInput}
                                  value={draft[field]}
                                  onChangeText={(value) => setDraft((current: StudentProfileUpdates | null) => current ? { ...current, [field]: value } : current)}
                                  placeholder={label}
                                  placeholderTextColor={COLORS.muted}
                                />
                              </View>
                            ))}
                          </View>
                        ) : (
                          <View style={styles.infoList}>
                            <InfoRow label="Student Number" value={profile?.student_number || 'Not provided'} />
                            <InfoRow label="Course" value={profile?.course || 'Not provided'} />
                            <InfoRow label="Year / Section" value={`${profile?.year_level || 'Not provided'} · ${profile?.section || 'Not provided'}`} />
                            <InfoRow label="Campus" value={profile?.campus || 'Not provided'} />
                            <InfoRow label="Goal" value={profile?.goal || 'No goal set'} />
                          </View>
                        )}
                      </View>
            <View style={styles.profileTop}>
              <Ionicons name="star" size={22} color={COLORS.honeyDark} />
              <ThemedText style={styles.profileName}>{displayName}</ThemedText>
            </View>
            <ThemedText style={styles.profileLevel}>
              Level {levelProgress.level} · {levelProgress.currentLevelXp} / {levelProgress.xpForNextLevel} XP to Level {levelProgress.level + 1}
            </ThemedText>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${levelProgress.progressPercent}%` }]} />
            </View>
          </View>

          {/* Stats Grid */}
          <View style={styles.grid}>
            {stats.map((stat) => (
              <View key={stat.id} style={styles.gridCard}>
                <Ionicons name={stat.icon} size={20} color={COLORS.honeyDark} />
                <ThemedText style={styles.gridValue}>{stat.value}</ThemedText>
                <ThemedText style={styles.gridLabel}>{stat.label}</ThemedText>
              </View>
            ))}
          </View>

          {/* Recent Activity */}
          <ThemedText style={styles.sectionTitle}>Recent Activity</ThemedText>
          <View style={styles.activityCard}>
            {completedQuests.length > 0 ? (
              completedQuests.slice(0, 5).map((quest) => (
                <View key={quest.id} style={styles.activityRow}>
                  <View style={styles.dot} />
                  <ThemedText style={styles.activityText} numberOfLines={1}>
                    Completed {quest.title}
                  </ThemedText>
                  <View style={styles.activityTag}>
                    <ThemedText style={styles.activityTagText}>+{quest.xp} XP</ThemedText>
                  </View>
                </View>
              ))
            ) : (
              <ThemedText style={styles.emptyActivityText}>
                No recent activity yet. Mark your quests complete to see your timeline here!
              </ThemedText>
            )}
          </View>

          {/* Badges */}
          <View style={styles.badgeSectionHeader}>
            <ThemedText style={styles.sectionTitle}>Milestone Badges</ThemedText>
            <ThemedText style={styles.badgeSub}>{unlockedBadgesCount} of {badges.length} unlocked</ThemedText>
          </View>
          <View style={styles.badgeRow}>
            {badges.map((b) => (
              <View
                key={b.id}
                style={[
                  styles.badgeSquare,
                  b.unlocked ? styles.badgeUnlocked : styles.badgeLocked,
                ]}>
                <Ionicons
                  name={b.icon}
                  size={20}
                  color={b.unlocked ? COLORS.honeyDark : COLORS.muted}
                />
                <ThemedText
                  style={[
                    styles.badgeText,
                    b.unlocked ? styles.badgeTextUnlocked : styles.badgeTextLocked,
                  ]}
                  numberOfLines={1}>
                  {b.title}
                </ThemedText>
              </View>
            ))}
          </View>

          {/* Places / Geofencing */}
          <View style={styles.sectionCard}>
            <TouchableOpacity
              style={styles.settingsRow}
              onPress={() => router.push('/manage-locations' as any)}
              activeOpacity={0.8}>
              <View style={styles.settingsIcon}>
                <Ionicons name="location-outline" size={20} color={COLORS.honeyDark} />
              </View>
              <View style={styles.settingsInfo}>
                <ThemedText style={styles.settingsLabel}>My Places</ThemedText>
                <ThemedText style={styles.settingsDesc}>Manage gym, school, home for smart quests</ThemedText>
              </View>
              <Ionicons name="chevron-forward" size={20} color={COLORS.muted} />
            </TouchableOpacity>
          </View>

          {/* Account Actions */}
          <View style={styles.actionSection}>
            <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut} activeOpacity={0.8}>
              <Ionicons name="log-out-outline" size={17} color={COLORS.danger} />
              <ThemedText style={styles.signOutButtonText}>Sign Out</ThemedText>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <View style={styles.infoRow}><ThemedText style={styles.fieldLabel}>{label}</ThemedText><ThemedText style={styles.infoValue}>{value}</ThemedText></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    gap: 12,
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: COLORS.ink },
  headerEmail: { fontSize: 11, color: COLORS.muted, marginTop: 1 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.honey,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...BeeBetterShadow,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 112,
    gap: 12,
  },
  profileCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 18,
    gap: 8,
    ...BeeBetterShadow,
  },
  profileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  profileName: { fontSize: 17, fontWeight: '800', color: COLORS.ink },
  profileLevel: { fontSize: 12, color: COLORS.muted },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  editText: { color: COLORS.honeyDark, fontSize: 12, fontWeight: '800' },
  formGrid: { gap: 10 },
  fieldLabel: { color: COLORS.muted, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', marginBottom: 4 },
  profileInput: { backgroundColor: COLORS.surfaceMuted, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 10, color: COLORS.ink, fontSize: 13 },
  infoList: { gap: 12 },
  infoRow: { gap: 3 },
  infoValue: { color: COLORS.ink, fontSize: 13 },
  progressTrack: {
    height: 8,
    backgroundColor: COLORS.surfaceMuted,
    borderRadius: 10,
    overflow: 'hidden',
    marginTop: 4,
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.honey,
    borderRadius: 10,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  gridCard: {
    width: '48.5%',
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 14,
    gap: 6,
    ...BeeBetterShadow,
  },
  gridValue: { fontSize: 19, fontWeight: '800', color: COLORS.ink },
  gridLabel: { fontSize: 11, color: COLORS.muted, fontWeight: '600' },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.ink,
    marginTop: 6,
  },
  activityCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 14,
    gap: 12,
    ...BeeBetterShadow,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.honeyDark,
  },
  activityText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.ink,
  },
  activityTag: {
    backgroundColor: COLORS.honeySoft,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  activityTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.ink,
  },
  emptyActivityText: {
    color: COLORS.muted,
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 8,
  },
  badgeSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  badgeSub: { fontSize: 11, color: COLORS.muted, fontWeight: '600' },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  badgeSquare: {
    width: '30.5%',
    borderRadius: 14,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 6,
    gap: 6,
    ...BeeBetterShadow,
  },
  badgeUnlocked: {
    borderWidth: 1.5,
    borderColor: COLORS.honey,
  },
  badgeLocked: {
    opacity: 0.45,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    textAlign: 'center',
  },
  badgeTextUnlocked: {
    color: COLORS.ink,
  },
  badgeTextLocked: {
    color: COLORS.muted,
  },
  actionSection: {
    marginTop: 8,
  },
  sectionCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 14,
    ...BeeBetterShadow,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingsIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: COLORS.honeySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsInfo: {
    flex: 1,
    gap: 2,
  },
  settingsLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.ink,
  },
  settingsDesc: {
    fontSize: 11,
    color: COLORS.muted,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FDEDEC',
    borderRadius: 14,
    paddingVertical: 12,
  },
  signOutButtonText: {
    color: COLORS.danger,
    fontSize: 13,
    fontWeight: '800',
  },
  signInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.ink,
    borderRadius: 14,
    paddingVertical: 12,
  },
  signInButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
});

