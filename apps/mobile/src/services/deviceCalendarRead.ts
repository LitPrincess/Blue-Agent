import * as Calendar from "expo-calendar/legacy";
import { Platform } from "react-native";

const EVENT_TAG_PREFIX = "Blue-Agent-Itinerary";

export type CalendarReadOutcome = {
  status: "read" | "unsupported" | "permission-denied" | "empty" | "failed";
  detail: string;
  eventCount: number;
};

function syncTag(itineraryId: string) {
  return `${EVENT_TAG_PREFIX}:${itineraryId}`;
}

export async function readSyncedCalendarEvents(itineraryId: string): Promise<CalendarReadOutcome> {
  if (Platform.OS === "web") {
    return {
      status: "unsupported",
      detail: "网页端不支持读取系统日历。",
      eventCount: 0,
    };
  }

  const permission = await Calendar.getCalendarPermissionsAsync();
  if (permission.status !== "granted") {
    return {
      status: "permission-denied",
      detail: "未获得系统日历读取权限。",
      eventCount: 0,
    };
  }

  try {
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const calendarIds = calendars.map((item) => item.id);
    if (!calendarIds.length) {
      return {
        status: "empty",
        detail: "系统中暂无可读取的日历。",
        eventCount: 0,
      };
    }

    const events = await Calendar.getEventsAsync(calendarIds, new Date(2000, 0, 1), new Date(2100, 0, 1));
    const tag = syncTag(itineraryId);
    const matched = events.filter((event) => event.notes?.includes(tag));
    return {
      status: "read",
      detail: matched.length
        ? `已从系统日历读取 ${matched.length} 个行程事件。`
        : "系统日历中尚未找到本行程事件，可先执行「写入系统日历」。",
      eventCount: matched.length,
    };
  } catch (error) {
    return {
      status: "failed",
      detail: error instanceof Error ? error.message : "日历读取失败",
      eventCount: 0,
    };
  }
}
