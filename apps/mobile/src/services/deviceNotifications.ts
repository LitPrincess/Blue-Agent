import { Platform } from "react-native";

import { Itinerary, ItineraryItem } from "../types";
import {
  ensureNotificationHandler,
  expoGoNotificationsHint,
  isLocalNotificationsAvailable,
  loadNotificationsModule,
} from "../utils/expoNotificationsRuntime";

const REMINDER_TAG_PREFIX = "Blue-Agent-Reminder";
const REMINDER_OFFSET_MINUTES = 30;

export type NotificationSyncOutcome = {
  status: "synced" | "unsupported" | "permission-denied" | "skipped" | "failed";
  syncedCount: number;
  detail: string;
  notificationIds: string[];
};

function parseDateTime(startDate: string, day: number, time: string) {
  const [year, month, date] = startDate.split("-").map((value) => Number.parseInt(value, 10));
  const [hour, minute] = time.split(":").map((value) => Number.parseInt(value, 10));
  if ([year, month, date, hour, minute].some((value) => Number.isNaN(value))) return null;
  const result = new Date(year, month - 1, date + Math.max(0, day - 1), hour, minute, 0, 0);
  return Number.isNaN(result.getTime()) ? null : result;
}

function reminderId(itineraryId: string, itemId: string) {
  return `${REMINDER_TAG_PREFIX}:${itineraryId}:${itemId}`;
}

async function ensureNotificationReady() {
  const Notifications = loadNotificationsModule();
  if (!Notifications) return false;

  await ensureNotificationHandler();

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("trip-reminders", {
      name: "行程提醒",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#1B6FFF",
      sound: "default",
    });
    await Notifications.setNotificationChannelAsync("trip-widget", {
      name: "行程通知卡",
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: "#1B6FFF",
    });
  }

  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: false, allowSound: true },
  });
  return requested.granted;
}

async function cancelItineraryReminderIds(itineraryId: string) {
  const Notifications = loadNotificationsModule();
  if (!Notifications) return;

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const prefix = `${REMINDER_TAG_PREFIX}:${itineraryId}:`;
  await Promise.all(
    scheduled
      .filter((entry) => entry.identifier.startsWith(prefix))
      .map((entry) => Notifications.cancelScheduledNotificationAsync(entry.identifier).catch(() => undefined)),
  );
}

function reminderBody(item: ItineraryItem) {
  const parts = [item.location, item.description].filter(Boolean);
  return parts.join(" · ") || "请查看蓝V出行行程详情";
}

export async function syncItineraryReminders(itinerary: Itinerary): Promise<NotificationSyncOutcome> {
  if (!isLocalNotificationsAvailable()) {
    return {
      status: "unsupported",
      syncedCount: 0,
      detail: expoGoNotificationsHint(),
      notificationIds: [],
    };
  }

  const startDate = itinerary.intent.start_date;
  if (!startDate) {
    return {
      status: "skipped",
      syncedCount: 0,
      detail: "行程缺少开始日期，暂不能创建出发提醒。",
      notificationIds: [],
    };
  }

  const granted = await ensureNotificationReady();
  if (!granted) {
    return {
      status: "permission-denied",
      syncedCount: 0,
      detail: "未获得通知权限，未创建出发提醒。",
      notificationIds: [],
    };
  }

  const Notifications = loadNotificationsModule();
  if (!Notifications) {
    return {
      status: "unsupported",
      syncedCount: 0,
      detail: expoGoNotificationsHint(),
      notificationIds: [],
    };
  }

  try {
    await cancelItineraryReminderIds(itinerary.id);
    const now = Date.now();
    const notificationIds: string[] = [];
    const syncableItems = itinerary.items.filter((item) => item.category !== "alert");

    for (const item of syncableItems) {
      const eventStart = parseDateTime(startDate, item.day, item.start_time);
      if (!eventStart) continue;
      const triggerAt = new Date(eventStart.getTime() - REMINDER_OFFSET_MINUTES * 60 * 1000);
      if (triggerAt.getTime() <= now) continue;

      const identifier = reminderId(itinerary.id, item.id);
      await Notifications.scheduleNotificationAsync({
        identifier,
        content: {
          title: `出发提醒 · ${item.title}`,
          body: `${item.start_time} 出发，${reminderBody(item)}`,
          data: { type: "trip-reminder", itineraryId: itinerary.id, itemId: item.id },
          sound: "default",
          ...(Platform.OS === "android" ? { channelId: "trip-reminders" } : {}),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: triggerAt,
        },
      });
      notificationIds.push(identifier);
    }

    if (notificationIds.length === 0) {
      return {
        status: "skipped",
        syncedCount: 0,
        detail: "当前没有未来节点，未创建新的出发提醒。",
        notificationIds,
      };
    }

    return {
      status: "synced",
      syncedCount: notificationIds.length,
      detail: `已写入 ${notificationIds.length} 条出发提醒（提前 ${REMINDER_OFFSET_MINUTES} 分钟）`,
      notificationIds,
    };
  } catch (error) {
    return {
      status: "failed",
      syncedCount: 0,
      detail: error instanceof Error ? error.message : "系统提醒写入失败",
      notificationIds: [],
    };
  }
}

export async function cancelItineraryReminders(itineraryId: string) {
  if (!isLocalNotificationsAvailable()) return;
  await cancelItineraryReminderIds(itineraryId);
}
