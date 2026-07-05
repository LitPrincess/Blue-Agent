import { Itinerary, ItemWeatherInfo, SyncItem, SystemSyncResult } from "../types";
import { syncItineraryToDeviceClockAlarms } from "./deviceClockAlarm";
import { syncItineraryToDeviceCalendar } from "./deviceCalendar";
import { syncItineraryReminders } from "./deviceNotifications";
import { syncItineraryToDeviceMemo } from "./deviceMemo";
import { enableTripWidgetNotification } from "./deviceTripWidget";

type WidgetResolver = (items: Itinerary["items"], startDate?: string | null) => Itinerary["items"][number] | null;
type RiskResolver = (item: Itinerary["items"][number], weather?: ItemWeatherInfo) => string;

export async function runFullDeviceSync(
  itinerary: Itinerary,
  startDate: string | null | undefined,
  resolveNextItem: WidgetResolver,
  riskTextForItem: RiskResolver,
  itemWeatherMap: Record<string, ItemWeatherInfo>,
) {
  const calendarSync = await syncItineraryToDeviceCalendar(itinerary);
  const memoSync = await syncItineraryToDeviceMemo(itinerary, startDate);
  const alarmSync = await syncItineraryReminders(itinerary);
  const clockSync = await syncItineraryToDeviceClockAlarms(itinerary);
  const nextItem = resolveNextItem(itinerary.items, startDate);
  const widgetSync = await enableTripWidgetNotification(
    itinerary,
    startDate,
    nextItem ? riskTextForItem(nextItem, itemWeatherMap[nextItem.id]) : undefined,
  );
  return { calendarSync, memoSync, alarmSync, clockSync, widgetSync };
}

export function mergeDeviceSyncIntoResult(
  synced: SystemSyncResult,
  outcomes: Awaited<ReturnType<typeof runFullDeviceSync>>,
): SystemSyncResult {
  return {
    ...synced,
    items: synced.items.map((item) => {
      if (item.target === "calendar") {
        return patchSyncItem(item, outcomes.calendarSync.status === "synced", "系统日历", outcomes.calendarSync.detail);
      }
      if (item.target === "memo") {
        return patchSyncItem(item, outcomes.memoSync.status === "synced", "备忘录", outcomes.memoSync.detail);
      }
      if (item.target === "alarm") {
        return patchSyncItem(item, outcomes.alarmSync.status === "synced", "出发提醒", outcomes.alarmSync.detail);
      }
      if (item.target === "clock") {
        return patchSyncItem(item, outcomes.clockSync.status === "synced", "系统闹钟", outcomes.clockSync.detail);
      }
      if (item.target === "widget") {
        return patchSyncItem(item, outcomes.widgetSync.status === "synced", "通知栏行程卡", outcomes.widgetSync.detail);
      }
      return { ...item, status: "synced" as const };
    }),
  };
}

function patchSyncItem(item: SyncItem, ok: boolean, title: string, detail: string): SyncItem {
  return {
    ...item,
    status: ok ? "synced" : item.status,
    title,
    detail,
  };
}

export async function refreshDeviceSyncAfterItineraryChange(
  itinerary: Itinerary,
  startDate: string | null | undefined,
  resolveNextItem: WidgetResolver,
  riskTextForItem: RiskResolver,
  itemWeatherMap: Record<string, ItemWeatherInfo>,
) {
  await syncItineraryReminders(itinerary);
  await syncItineraryToDeviceClockAlarms(itinerary);
  const nextItem = resolveNextItem(itinerary.items, startDate);
  await enableTripWidgetNotification(
    itinerary,
    startDate,
    nextItem ? riskTextForItem(nextItem, itemWeatherMap[nextItem.id]) : undefined,
  );
}
