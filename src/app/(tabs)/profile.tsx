import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { BeeBetterColors as COLORS, BeeBetterShadow } from '@/constants/theme';
import { useUserData } from '@/hooks/use-user-data';

export default function ProfileScreen() {
  const {
    user,
    profile,
    completedQuests,
    levelProgress,
    isRefreshing,
    refresh,
    signOut,
  } = useUserData();

  const displayName =
    profile?.display_name ||
    user?.email?.split('@')[0] ||
    (user ? 'Bee Explorer' : 'Guest Explorer');

  const streakDays = profile?.current_streak ?? 0;
  const totalXp = profile?.total_xp ?? 0;
  const questsDone = completedQuests.length;

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
          router.replace('/(tabs)');
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
          {user ? (
            <TouchableOpacity
              style={styles.headerButton}
              onPress={handleSignOut}
              accessibilityLabel="Sign Out">
              <Ionicons name="log-out-outline" size={19} color={COLORS.danger} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => router.push('/auth')}
              accessibilityLabel="Sign In">
              <Ionicons name="log-in-outline" size={19} color={COLORS.ink} />
            </TouchableOpacity>
          )}
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

          {/* Account Actions */}
          <View style={styles.actionSection}>
            {user ? (
              <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut} activeOpacity={0.8}>
                <Ionicons name="log-out-outline" size={17} color={COLORS.danger} />
                <ThemedText style={styles.signOutButtonText}>Sign Out</ThemedText>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.signInButton}
                onPress={() => router.push('/auth')}
                activeOpacity={0.8}>
                <Ionicons name="log-in-outline" size={17} color="#FFFFFF" />
                <ThemedText style={styles.signInButtonText}>Sign In / Register</ThemedText>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
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
