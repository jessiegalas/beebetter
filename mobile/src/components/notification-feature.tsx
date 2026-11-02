import * as React from 'react';
import { Platform } from 'react-native';
import { MOBILE_NOTIFICATIONS_ENABLED } from '@/constants/features';
import type { StudentNotificationLifecycle } from '@/context/user-data-context';
import { QuestNotificationResponse } from '@/components/quest-notification-response';
// Static import preserves handler/task definitions for cold and headless startup.
import { startQuestNotificationLifetime, cancelQuestNotifications } from '@/lib/quest-notifications';

export const notificationLifecycle: StudentNotificationLifecycle = {
  start: startQuestNotificationLifetime,
  cleanup: cancelQuestNotifications,
};

/** Root-only composition entry; native listeners stay inside the feature. */
export function NotificationFeature() {
  return MOBILE_NOTIFICATIONS_ENABLED && Platform.OS === 'android' ? <QuestNotificationResponse /> : null;
}
