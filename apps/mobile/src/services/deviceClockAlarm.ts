import * as Calendar from "expo-calendar/legacy";
import { Linking, Platform } from "react-native";

import { Itinerary, ItineraryItem } from "../types";
import {
  ensureNotificationHandler,
  expoGoNotificationsHint,
  isLocalNotificationsAvailable,
  loadNotificationsModule,
} from "../utils/expoNotificationsRuntime";

const CLOCK_CALENDAR_TITLE = "蓝V闹钟";
const CLOCK_TAG_PREFIX = "Blue-Agent-Clock";
const CLOCK_OFFSET_MINUTES = 30;

export type ClockAlarmSyncOutcome = {
  status: "synced" | "unsupported" | "permission-denied" | "skipped" | "failed";
  syncedCount: number;
  detail: string;
  eventIds: string[];
};

export type ClockAlarmReadOutcome = {
  status: "read" | "unsupported" | "permission-denied" | "empty" | "failed";
  detail: string;
  alarmCount: number;
};

function parseDateTime(startDate: string, day: number, time: string) {
  const [year, month, date] = startDate.split("-").map((value) => Number.parseInt(value, 10));
  const [hour, minute] = time.split(":").map((value) => Number.parseInt(value, 10));
  if ([year, month, date, hour, minute].some((value) => Number.isNaN(value))) return null;
  const result = new Date(year, month - 1, date + Math.max(0, day - 1), hour, minute, 0, 0);
  return Number.isNaN(result.getTime()) ? null : result;
}

function eventDates(item: ItineraryItem, startDate: string) {
  const start = parseDateTime(startDate, item.day, item.start_time);
  if (!start) return null;
  const end = new Date(start);
  end.setMinutes(end.getMinutes() + 5);
  return { start, end };
}

function clockTag(itineraryId: string) {
  return `${CLOCK_TAG_PREFIX}:${itineraryId}`;
}

function alarmTriggerId(itineraryId: string, itemId: string) {
  return `${CLOCK_TAG_PREFIX}:notify:${itineraryId}:${itemId}`;
}

async function ensureClockCalendar() {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const existing = calendars.find((item) => item.title === CLOCK_CALENDAR_TITLE && item.allowsModifications);
  if (existing) return existing.id;

  if (Platform.OS === "ios") {
    const writable = calendars.find((item) => item.isPrimary && item.allowsModifications);
    const defaultCalendar = writable ?? (await Calendar.getDefaultCalendarAsync());
    return Calendar.createCalendarAsync({
      title: CLOCK_CALENDAR_TITLE,
      color: "#F59E0B",
      entityType: Calendar.EntityTypes.EVENT,
      sourceId: defaultCalendar.sourceId,
      source: defaultCalendar.source,
      name: CLOCK_CALENDAR_TITLE,
      ownerAccount: defaultCalendar.ownerAccount,
    });
  }

  return Calendar.createCalendarAsync({
    title: CLOCK_CALENDAR_TITLE,
    color: "#F59E0B",
    entityType: Calendar.EntityTypes.EVENT,
    name: CLOCK_CALENDAR_TITLE,
    ownerAccount: CLOCK_CALENDAR_TITLE,
    source: {
      name: CLOCK_CALENDAR_TITLE,
      type: Calendar.SourceType.LOCAL,
      isLocalAccount: true,
    },
    accessLevel: Calendar.CalendarAccessLevel.OWNER,
  });
}

async function deleteExistingClockEvents(calendarId: string, itinerary: Itinerary, startDate: string) {
  const datedItems = itinerary.items
    .map((item) => eventDates(item, startDate))
    .filter((value): value is { start: Date; end: Date } => Boolean(value));
  if (!datedItems.length) return;

  const start = new Date(Math.min(...datedItems.map((item) => item.start.getTime())));
  const end = new Date(Math.max(...datedItems.map((item) => item.end.getTime())));
  start.setDate(start.getDate() - 1);
  end.setDate(end.getDate() + 1);

  const events = await Calendar.getEventsAsync([calendarId], start, end);
  const tag = clockTag(itinerary.id);
  await Promise.all(
    events
      .filter((event) => event.notes?.includes(tag))
      .map((event) => Calendar.deleteEventAsync(event.id).catch(() => undefined)),
  );
}

async function cancelClockNotifications(itineraryId: string) {
  if (!isLocalNotificationsAvailable()) return;
  const Notifications = loadNotificationsModule();
  if (!Notifications) return;

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const prefix = `${CLOCK_TAG_PREFIX}:notify:${itineraryId}:`;
  await Promise.all(
    scheduled
      .filter((entry) => entry.identifier.startsWith(prefix))
      .map((entry) => Notifications.cancelScheduledNotificationAsync(entry.identifier).catch(() => undefined)),
  );
}

async function ensureClockNotificationChannel() {
  const Notifications = loadNotificationsModule();
  if (!Notifications) return false;

  await ensureNotificationHandler();

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("trip-clock-alarms", {
      name: "系统闹钟",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 250, 500],
      lightColor: "#F59E0B",
      sound: "default",
      bypassDnd: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }

  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: false, allowSound: true },
  });
  return requested.granted;
}

async function scheduleClockNotifications(itinerary: Itinerary, startDate: string) {
  if (!isLocalNotificationsAvailable()) return 0;

  const granted = await ensureClockNotificationChannel();
  if (!granted) return 0;

  const Notifications = loadNotificationsModule();
  if (!Notifications) return 0;

  await cancelClockNotifications(itinerary.id);
  const now = Date.now();
  let count = 0;
  const syncableItems = itinerary.items.filter((item) => item.category !== "alert");

  for (const item of syncableItems) {
    const eventStart = parseDateTime(startDate, item.day, item.start_time);
    if (!eventStart) continue;
    const triggerAt = new Date(eventStart.getTime() - CLOCK_OFFSET_MINUTES * 60 * 1000);
    if (triggerAt.getTime() <= now) continue;

    await Notifications.scheduleNotificationAsync({
      identifier: alarmTriggerId(itinerary.id, item.id),
      content: {
        title: `⏰ 出发闹钟 · ${item.title}`,
        body: `${item.start_time} 该出发了 · ${item.location}`,
        data: { type: "trip-clock-alarm", itineraryId: itinerary.id, itemId: item.id },
        sound: "default",
        ...(Platform.OS === "android" ? { channelId: "trip-clock-alarms" } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerAt,
      },
    });
    count += 1;
  }

  return count;
}

export function buildAndroidSetAlarmIntent(hour: number, minute: number, message: string, skipUi = false) {
  const encoded = encodeURIComponent(message);
  const skip = skipUi ? "B.android.intent.extra.alarm.SKIP_UI=true;" : "";
  return `intent:#Intent;action=android.intent.action.SET_ALARM;S.android.intent.extra.alarm.MESSAGE=${encoded};i.android.intent.extra.alarm.HOUR=${hour};i.android.intent.extra.alarm.MINUTES=${minute};${skip}end`;
}

export async function openAndroidClockAlarm(hour: number, minute: number, message: string) {
  if (Platform.OS !== "android") return false;
  try {
    await Linking.openURL(buildAndroidSetAlarmIntent(hour, minute, message, false));
    return true;
  } catch {
    return false;
  }
}

export function resolveNextClockItem(items: ItineraryItem[], startDate?: string | null) {
  const now = Date.now();
  const sorted = [...items]
    .filter((item) => item.category !== "alert")
    .sort((a, b) => a.day - b.day || a.start_time.localeCompare(b.start_time));

  for (const item of sorted) {
    if (!startDate) return item;
    const eventStart = parseDateTime(startDate, item.day, item.start_time);
    if (!eventStart) continue;
    const triggerAt = eventStart.getTime() - CLOCK_OFFSET_MINUTES * 60 * 1000;
    if (triggerAt >= now) return item;
  }

  return sorted[sorted.length - 1] ?? null;
}

export async function syncItineraryToDeviceClockAlarms(itinerary: Itinerary): Promise<ClockAlarmSyncOutcome> {
  if (Platform.OS === "web") {
    return {
      status: "unsupported",
      syncedCount: 0,
      detail: "网页端不支持写入系统闹钟，请在真机 App 中同步。",
      eventIds: [],
    };
  }

  const startDate = itinerary.intent.start_date;
  if (!startDate) {
    return {
      status: "skipped",
      syncedCount: 0,
      detail: "行程缺少开始日期，暂不能创建系统闹钟。",
      eventIds: [],
    };
  }

  const permission = await Calendar.requestCalendarPermissionsAsync();
  if (permission.status !== "granted") {
    return {
      status: "permission-denied",
      syncedCount: 0,
      detail: "未获得系统日历权限，无法写入闹钟事件。",
      eventIds: [],
    };
  }

  try {
    const calendarId = await ensureClockCalendar();
    await deleteExistingClockEvents(calendarId, itinerary, startDate);

    const eventIds: string[] = [];
    const now = Date.now();
    const syncableItems = itinerary.items.filter((item) => item.category !== "alert");

    for (const item of syncableItems) {
      const dates = eventDates(item, startDate);
      if (!dates) continue;
      if (dates.start.getTime() - CLOCK_OFFSET_MINUTES * 60 * 1000 <= now) continue;

      const eventId = await Calendar.createEventAsync(calendarId, {
        title: `⏰ 出发 · ${item.title}`,
        location: item.location,
        notes: `${clockTag(itinerary.id)}\n${item.description || item.location}`,
        startDate: dates.start,
        endDate: dates.end,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        alarms: [
          { relativeOffset: -CLOCK_OFFSET_MINUTES, method: Calendar.AlarmMethod.ALERT },
          { relativeOffset: -5, method: Calendar.AlarmMethod.ALERT },
        ],
      });
      eventIds.push(eventId);
    }

    const notificationCount = await scheduleClockNotifications(itinerary, startDate);
    const totalCount = eventIds.length + notificationCount;

    if (totalCount === 0) {
      return {
        status: "skipped",
        syncedCount: 0,
        detail: "当前没有未来节点，未创建新的系统闹钟。",
        eventIds,
      };
    }

    const parts = [`已写入 ${eventIds.length} 个「蓝V闹钟」日历事件`];
    if (notificationCount > 0) {
      parts.push(`${notificationCount} 条高优先级响铃提醒（提前 ${CLOCK_OFFSET_MINUTES} 分钟）`);
    }
    if (Platform.OS === "android") {
      parts.push("可在系统时钟 App 中手动确认下一站闹钟");
    } else {
      parts.push("iPhone 将在日历提醒时间响铃");
    }

    return {
      status: "synced",
      syncedCount: totalCount,
      detail: parts.join("；"),
      eventIds,
    };
  } catch (error) {
    return {
      status: "failed",
      syncedCount: 0,
      detail: error instanceof Error ? error.message : "系统闹钟写入失败",
      eventIds: [],
    };
  }
}

export async function readSyncedClockAlarms(itineraryId: string): Promise<ClockAlarmReadOutcome> {
  if (Platform.OS === "web") {
    return { status: "unsupported", detail: "网页端不支持读取系统闹钟。", alarmCount: 0 };
  }

  const permission = await Calendar.getCalendarPermissionsAsync();
  if (permission.status !== "granted") {
    return { status: "permission-denied", detail: "未获得系统日历读取权限。", alarmCount: 0 };
  }

  try {
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const clockCalendar = calendars.find((item) => item.title === CLOCK_CALENDAR_TITLE);
    if (!clockCalendar) {
      return { status: "empty", detail: "尚未创建「蓝V闹钟」日历。", alarmCount: 0 };
    }

    const events = await Calendar.getEventsAsync([clockCalendar.id], new Date(2000, 0, 1), new Date(2100, 0, 1));
    const tag = clockTag(itineraryId);
    const matched = events.filter((event) => event.notes?.includes(tag));
    return {
      status: "read",
      detail: matched.length
        ? `已从「蓝V闹钟」读取 ${matched.length} 个闹钟事件。`
        : "系统中尚未找到本行程闹钟，可先执行「导入系统闹钟」。",
      alarmCount: matched.length,
    };
  } catch (error) {
    return {
      status: "failed",
      detail: error instanceof Error ? error.message : "闹钟读取失败",
      alarmCount: 0,
    };
  }
}
