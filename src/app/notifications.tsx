import { StyleSheet, View, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { BeeBetterColors as COLORS, BeeBetterShadow } from '@/constants/theme';
import { useUserData } from '@/hooks/use-user-data';

export default function NotificationsScreen() {
  const { completedQuests, levelProgress, activeQuests } = useUserData();

  const dynamicNotifications = [
    ...(levelProgress.level > 1
      ? [
          {
            id: 'level-up',
            text: `You have reached Level ${levelProgress.level}! Keep pushing forward.`,
            time: 'Achievement',
            icon: 'star-outline' as const,
          },
        ]
      : []),
    ...completedQuests.slice(0, 4).map((q) => ({
      id: `quest-${q.id}`,
      text: `You completed "${q.title}" and earned +${q.xp} XP!`,
      time: 'Completed',
      icon: 'trophy-outline' as const,
    })),
    ...(activeQuests.some((q) => q.is_nearby)
      ? [
          {
            id: 'nearby-alert',
            text: 'You have quests tagged near your location ready to explore.',
            time: 'Location',
            icon: 'location-outline' as const,
          },
        ]
      : []),
    {
      id: 'welcome',
      text: 'Welcome to BeeBetter! Turn your daily tasks into rewarding quests.',
      time: 'Tip',
      icon: 'sparkles-outline' as const,
    },
  ];

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <ThemedText style={styles.headerTitle}>Notifications</ThemedText>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => router.back()}
            activeOpacity={0.7}>
            <Ionicons name="close" size={20} color={COLORS.ink} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {dynamicNotifications.map((n) => (
            <View key={n.id} style={styles.notifCard}>
              <View style={styles.iconWrap}>
                <Ionicons name={n.icon} size={18} color={COLORS.honeyDark} />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.notifText}>{n.text}</ThemedText>
                <ThemedText style={styles.notifTime}>{n.time}</ThemedText>
              </View>
            </View>
          ))}
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
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 15,
  },
  headerTitle: { color: COLORS.ink, fontSize: 19, fontWeight: '800' },
  closeButton: {
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
    paddingBottom: 40,
    gap: 10,
  },
  notifCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 14,
    ...BeeBetterShadow,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.honeySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.ink,
    lineHeight: 18,
  },
  notifTime: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 3,
  },
});