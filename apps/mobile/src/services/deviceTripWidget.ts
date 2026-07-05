import { Platform } from "react-native";

import { Itinerary, ItineraryItem } from "../types";
import { formatItemSchedule } from "../utils/dateUtils";
import {
  ensureNotificationHandler,
  expoGoNotificationsHint,
  isLocalNotificationsAvailable,
  loadNotificationsModule,
} from "../utils/expoNotificationsRuntime";

const WIDGET_TAG_PREFIX = "Blue-Agent-Widget";

export type TripWidgetOutcome = {
  status: "synced" | "unsupported" | "permission-denied" | "skipped" | "failed";
  detail: string;
};

function widgetId(itineraryId: string) {
  return `${WIDGET_TAG_PREFIX}:${itineraryId}`;
}

async function ensureWidgetChannel() {
  const Notifications = loadNotificationsModule();
  if (!Notifications) return false;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("trip-widget", {
      name: "行程通知卡",
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: "#1B6FFF",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }

  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: false, allowSound: false },
  });
  return requested.granted;
}

function resolveNextItem(items: ItineraryItem[], startDate?: string | null) {
  const now = Date.now();
  const sorted = [...items]
    .filter((item) => item.category !== "alert")
    .sort((a, b) => a.day - b.day || a.start_time.localeCompare(b.start_time));

  for (const item of sorted) {
    if (!startDate) return item;
    const [year, month, date] = startDate.split("-").map((value) => Number.parseInt(value, 10));
    const [hour, minute] = item.start_time.split(":").map((value) => Number.parseInt(value, 10));
    if ([year, month, date, hour, minute].some((value) => Number.isNaN(value))) continue;
    const eventAt = new Date(year, month - 1, date + Math.max(0, item.day - 1), hour, minute, 0, 0);
    if (eventAt.getTime() >= now) return item;
  }

  return sorted[sorted.length - 1] ?? null;
}

export async function enableTripWidgetNotification(
  itinerary: Itinerary,
  startDate?: string | null,
  riskHint?: string,
): Promise<TripWidgetOutcome> {
  if (!isLocalNotificationsAvailable()) {
    return {
      status: "unsupported",
      detail: expoGoNotificationsHint(),
    };
  }

  const nextItem = resolveNextItem(itinerary.items, startDate ?? itinerary.intent.start_date);
  if (!nextItem) {
    return {
      status: "skipped",
      detail: "暂无可展示的下一站节点。",
    };
  }

  const granted = await ensureWidgetChannel();
  if (!granted) {
    return {
      status: "permission-denied",
      detail: "未获得通知权限，无法启用行程通知卡。",
    };
  }

  const Notifications = loadNotificationsModule();
  if (!Notifications) {
    return {
      status: "unsupported",
      detail: expoGoNotificationsHint(),
    };
  }

  try {
    await ensureNotificationHandler();
    const identifier = widgetId(itinerary.id);
    await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => undefined);
    await Notifications.dismissNotificationAsync(identifier).catch(() => undefined);

    const scheduleText = formatItemSchedule(
      startDate ?? itinerary.intent.start_date,
      nextItem.day,
      nextItem.start_time,
      nextItem.end_time,
    );
    const bodyParts = [scheduleText, nextItem.location, riskHint].filter(Boolean);
    const content = {
      title: `蓝V出行 · ${nextItem.title}`,
      body: bodyParts.join(" · "),
      subtitle: Platform.OS === "ios" ? "下一站行程卡" : undefined,
      data: { type: "trip-widget", itineraryId: itinerary.id, itemId: nextItem.id },
      ...(Platform.OS === "android"
        ? {
            channelId: "trip-widget",
            sticky: true,
            priority: Notifications.AndroidNotificationPriority.HIGH,
            color: "#1B6FFF",
          }
        : {}),
    };

    await Notifications.scheduleNotificationAsync({
      identifier,
      content,
      trigger: null,
    });

    return {
      status: "synced",
      detail:
        Platform.OS === "android"
          ? "已在通知栏推送行程卡（非桌面小组件）。请下拉通知栏查看；开发版/APK 才支持，Expo Go 不可用。"
          : "已在通知中心推送行程卡（非桌面小组件），可在锁屏/通知中心查看下一站信息。",
    };
  } catch (error) {
    return {
      status: "failed",
      detail: error instanceof Error ? error.message : "行程通知卡启用失败",
    };
  }
}

export async function disableTripWidgetNotification(itineraryId: string) {
  if (!isLocalNotificationsAvailable()) return;
  const Notifications = loadNotificationsModule();
  if (!Notifications) return;
  const identifier = widgetId(itineraryId);
  await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => undefined);
  await Notifications.dismissNotificationAsync(identifier).catch(() => undefined);
}
