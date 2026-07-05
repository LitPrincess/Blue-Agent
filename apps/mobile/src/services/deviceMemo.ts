import * as Calendar from "expo-calendar/legacy";
import { Platform } from "react-native";

import { Itinerary } from "../types";
import { buildItineraryMemoText } from "../utils/platformDeeplinks";

const MEMO_CALENDAR_TITLE = "蓝V备忘录";
const MEMO_TAG_PREFIX = "Blue-Agent-Memo";

export type MemoSyncOutcome = {
  status: "synced" | "unsupported" | "permission-denied" | "skipped" | "failed";
  detail: string;
  memoId?: string;
};

export type MemoReadOutcome = {
  status: "read" | "unsupported" | "permission-denied" | "empty" | "failed";
  detail: string;
  found: boolean;
};

function memoTag(itineraryId: string) {
  return `${MEMO_TAG_PREFIX}:${itineraryId}`;
}

function memoBody(itinerary: Itinerary, startDate?: string | null) {
  return `${memoTag(itinerary.id)}\n${buildItineraryMemoText(itinerary, startDate)}`;
}

async function ensureMemoCalendar() {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const existing = calendars.find((item) => item.title === MEMO_CALENDAR_TITLE && item.allowsModifications);
  if (existing) return existing.id;

  if (Platform.OS === "ios") {
    const writable = calendars.find((item) => item.isPrimary && item.allowsModifications);
    const defaultCalendar = writable ?? (await Calendar.getDefaultCalendarAsync());
    return Calendar.createCalendarAsync({
      title: MEMO_CALENDAR_TITLE,
      color: "#8B5CF6",
      entityType: Calendar.EntityTypes.EVENT,
      sourceId: defaultCalendar.sourceId,
      source: defaultCalendar.source,
      name: MEMO_CALENDAR_TITLE,
      ownerAccount: defaultCalendar.ownerAccount,
    });
  }

  return Calendar.createCalendarAsync({
    title: MEMO_CALENDAR_TITLE,
    color: "#8B5CF6",
    entityType: Calendar.EntityTypes.EVENT,
    name: MEMO_CALENDAR_TITLE,
    ownerAccount: MEMO_CALENDAR_TITLE,
    source: {
      name: MEMO_CALENDAR_TITLE,
      type: Calendar.SourceType.LOCAL,
      isLocalAccount: true,
    },
    accessLevel: Calendar.CalendarAccessLevel.OWNER,
  });
}

async function deleteExistingMemo(itineraryId: string, calendarId: string) {
  const start = new Date(2000, 0, 1);
  const end = new Date(2100, 0, 1);
  const events = await Calendar.getEventsAsync([calendarId], start, end);
  const tag = memoTag(itineraryId);
  await Promise.all(
    events
      .filter((event) => event.notes?.includes(tag) || event.title.includes("蓝V出行·行程备忘"))
      .map((event) => Calendar.deleteEventAsync(event.id).catch(() => undefined)),
  );
}

async function syncMemoViaIosReminder(itinerary: Itinerary, startDate?: string | null): Promise<MemoSyncOutcome> {
  const permission = await Calendar.requestRemindersPermissionsAsync();
  if (permission.status !== "granted") {
    return {
      status: "permission-denied",
      detail: "未获得系统备忘录（提醒事项）权限，未写入摘要。",
    };
  }

  const reminders = await Calendar.getCalendarsAsync(Calendar.EntityTypes.REMINDER);
  const target = reminders.find((item) => item.allowsModifications) ?? reminders[0];
  if (!target) {
    return {
      status: "failed",
      detail: "未找到可写入的提醒事项列表。",
    };
  }

  const existing = await Calendar.getRemindersAsync([target.id], Calendar.ReminderStatus.INCOMPLETE, new Date(2000, 0, 1), new Date(2100, 0, 1));
  const tag = memoTag(itinerary.id);
  await Promise.all(
    existing
      .filter((item) => item.notes?.includes(tag) && item.id)
      .map((item) => Calendar.deleteReminderAsync(item.id!).catch(() => undefined)),
  );

  const memoId = await Calendar.createReminderAsync(target.id, {
    title: `蓝V出行 · ${itinerary.title}`,
    notes: memoBody(itinerary, startDate),
  });

  return {
    status: "synced",
    detail: "已写入 iPhone 提醒事项（系统备忘录）。",
    memoId,
  };
}

async function syncMemoViaCalendar(itinerary: Itinerary, startDate?: string | null): Promise<MemoSyncOutcome> {
  const permission = await Calendar.requestCalendarPermissionsAsync();
  if (permission.status !== "granted") {
    return {
      status: "permission-denied",
      detail: "未获得系统日历权限，未写入行程摘要。",
    };
  }

  const calendarId = await ensureMemoCalendar();
  await deleteExistingMemo(itinerary.id, calendarId);

  const startDateIso = startDate ?? itinerary.intent.start_date;
  const start = startDateIso ? new Date(`${startDateIso}T09:00:00`) : new Date();
  const end = new Date(start);
  end.setHours(end.getHours() + 1);

  const memoId = await Calendar.createEventAsync(calendarId, {
    title: `蓝V出行·行程备忘 · ${itinerary.title}`,
    notes: memoBody(itinerary, startDate),
    startDate: start,
    endDate: end,
    allDay: true,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  return {
    status: "synced",
    detail:
      Platform.OS === "android"
        ? "已写入「蓝V备忘录」日历；同时可通过分享保存到 Keep/系统笔记 App。"
        : "已写入系统备忘录日历。",
    memoId,
  };
}

export async function syncItineraryToDeviceMemo(
  itinerary: Itinerary,
  startDate?: string | null,
): Promise<MemoSyncOutcome> {
  if (Platform.OS === "web") {
    return {
      status: "unsupported",
      detail: "网页端不支持写入系统备忘录，请在真机 App 中同步。",
    };
  }

  try {
    if (Platform.OS === "ios") {
      const reminderResult = await syncMemoViaIosReminder(itinerary, startDate);
      if (reminderResult.status === "synced") return reminderResult;
    }
    return syncMemoViaCalendar(itinerary, startDate);
  } catch (error) {
    return {
      status: "failed",
      detail: error instanceof Error ? error.message : "备忘录写入失败",
    };
  }
}

export async function readSyncedMemo(itineraryId: string): Promise<MemoReadOutcome> {
  if (Platform.OS === "web") {
    return { status: "unsupported", detail: "网页端不支持读取系统备忘录。", found: false };
  }

  try {
    if (Platform.OS === "ios") {
      const permission = await Calendar.getRemindersPermissionsAsync();
      if (permission.status !== "granted") {
        return { status: "permission-denied", detail: "未获得提醒事项读取权限。", found: false };
      }
      const reminders = await Calendar.getCalendarsAsync(Calendar.EntityTypes.REMINDER);
      const lists = reminders.map((item) => item.id);
      if (!lists.length) {
        return { status: "empty", detail: "系统中暂无可读取的提醒事项。", found: false };
      }
      const tag = memoTag(itineraryId);
      const items = await Calendar.getRemindersAsync(lists, null, new Date(2000, 0, 1), new Date(2100, 0, 1));
      const matched = items.filter((item) => item.notes?.includes(tag));
      return {
        status: "read",
        detail: matched.length ? `已读取 ${matched.length} 条系统备忘录摘要。` : "系统中尚未找到本行程备忘录。",
        found: matched.length > 0,
      };
    }

    const permission = await Calendar.getCalendarPermissionsAsync();
    if (permission.status !== "granted") {
      return { status: "permission-denied", detail: "未获得日历读取权限。", found: false };
    }
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const memoCalendar = calendars.find((item) => item.title === MEMO_CALENDAR_TITLE);
    if (!memoCalendar) {
      return { status: "empty", detail: "尚未创建「蓝V备忘录」日历。", found: false };
    }
    const events = await Calendar.getEventsAsync([memoCalendar.id], new Date(2000, 0, 1), new Date(2100, 0, 1));
    const tag = memoTag(itineraryId);
    const matched = events.filter((event) => event.notes?.includes(tag));
    return {
      status: "read",
      detail: matched.length ? `已读取 ${matched.length} 条行程备忘。` : "系统中尚未找到本行程备忘。",
      found: matched.length > 0,
    };
  } catch (error) {
    return {
      status: "failed",
      detail: error instanceof Error ? error.message : "备忘录读取失败",
      found: false,
    };
  }
}
