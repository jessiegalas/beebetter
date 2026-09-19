import { Alert, StyleSheet, View, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { BeeBetterColors as COLORS, BeeBetterShadow, Radii } from '@/constants/theme';
import { useUserData } from '@/hooks/use-user-data';
import { useLocationContext } from '@/context/location-context';

export default function NotificationsScreen() {
  const { completedQuests, levelProgress, activeQuests, completeQuest } = useUserData();
  const { currentLocationId } = useLocationContext();

  const handleQuickComplete = async (quest: (typeof activeQuests)[number]) => {
    if (quest.requires_proof) {
      Alert.alert('Proof required', 'Open the quest board to attach proof before completing this quest.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open quests', onPress: () => router.replace('/quests') },
      ]);
      return;
    }

    if (quest.location_id && quest.location_id !== currentLocationId) {
      Alert.alert('Visit the place first', 'This nearby quest can be completed when you are inside its saved location.', [
        { text: 'Later', style: 'cancel' },
        { text: 'Open quests', onPress: () => router.replace('/quests') },
      ]);
      return;
    }

    const result = await completeQuest(quest.id);
    if (result.success) {
      Alert.alert('Quest complete!', `+${quest.xp} XP earned. Nice work.`);
    } else {
      Alert.alert('Could not complete quest', result.error || 'Please try again.');
    }
  };

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
          {activeQuests.length > 0 && (
            <View style={styles.actionSection}>
              <View style={styles.sectionHeading}>
                <ThemedText style={styles.sectionTitle}>Ready when you are</ThemedText>
                <ThemedText style={styles.sectionHint}>One-tap progress</ThemedText>
              </View>
              {activeQuests.slice(0, 3).map((quest) => (
                <View key={`action-${quest.id}`} style={styles.actionCard}>
                  <View style={styles.actionIcon}>
                    <Ionicons name={quest.requires_proof ? 'attach-outline' : 'checkmark'} size={19} color={COLORS.honeyDark} />
                  </View>
                  <View style={styles.actionCopy}>
                    <ThemedText style={styles.actionTitle} numberOfLines={1}>{quest.title}</ThemedText>
                    <ThemedText style={styles.actionSubtitle}>
                      {quest.requires_proof ? 'Attach proof on the quest board' : `Complete for +${quest.xp} XP`}
                    </ThemedText>
                  </View>
                  <TouchableOpacity style={styles.quickButton} onPress={() => void handleQuickComplete(quest)} activeOpacity={0.8}>
                    <ThemedText style={styles.quickButtonText}>{quest.requires_proof ? 'Open' : 'Done'}</ThemedText>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
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
    borderRadius: Radii.md,
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
  actionSection: { gap: 8, marginBottom: 5 },
  sectionHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 2 },
  sectionTitle: { color: COLORS.ink, fontSize: 15, fontWeight: '800' },
  sectionHint: { color: COLORS.muted, fontSize: 10, fontWeight: '700' },
  actionCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.honeyDeep, borderRadius: Radii.lg, padding: 14, ...BeeBetterShadow },
  actionIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: COLORS.honeySoft, alignItems: 'center', justifyContent: 'center' },
  actionCopy: { flex: 1 },
  actionTitle: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  actionSubtitle: { color: '#D4D4D4', fontSize: 10, marginTop: 2 },
  quickButton: { backgroundColor: COLORS.honey, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 8 },
  quickButtonText: { color: COLORS.ink, fontSize: 11, fontWeight: '800' },
  notifCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.card,
    borderRadius: Radii.md,
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