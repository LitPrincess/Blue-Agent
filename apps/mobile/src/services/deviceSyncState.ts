import AsyncStorage from "@react-native-async-storage/async-storage";

import { Itinerary, SyncItem, SystemSyncResult } from "../types";

const STORAGE_PREFIX = "bluemap-device-sync:";

export function createDeviceSyncScaffold(itinerary: Itinerary): SystemSyncResult {
  return {
    id: `local-${itinerary.id}`,
    user_id: itinerary.user_id,
    itinerary_id: itinerary.id,
    items: [
      {
        target: "calendar",
        status: "ready",
        title: "系统日历",
        detail: "点击写入行程节点到系统日历",
      },
      {
        target: "alarm",
        status: "ready",
        title: "出发提醒",
        detail: "点击创建出发前 30 分钟通知提醒",
      },
      {
        target: "clock",
        status: "ready",
        title: "系统闹钟",
        detail: "点击写入响铃闹钟（蓝V闹钟日历 + 高优先级提醒）",
      },
      {
        target: "widget",
        status: "ready",
        title: "通知栏行程卡",
        detail: "点击推送下一站行程到系统通知栏（非桌面小组件，需开发版/APK）",
      },
      {
        target: "memo",
        status: "ready",
        title: "备忘录",
        detail: "点击写入行程摘要（iOS 提醒事项 / Android 备忘日历）",
      },
      {
        target: "map",
        status: "ready",
        title: "地图",
        detail: "点击打开高德路线规划",
      },
    ],
    topology_nodes: [],
  };
}

export function patchDeviceSyncResult(
  current: SystemSyncResult | null,
  itinerary: Itinerary,
  target: SyncItem["target"],
  detail: string,
  status: SyncItem["status"],
): SystemSyncResult {
  const base = current?.itinerary_id === itinerary.id ? current : createDeviceSyncScaffold(itinerary);
  const hasTarget = base.items.some((item) => item.target === target);
  if (!hasTarget) {
    const scaffoldItem = createDeviceSyncScaffold(itinerary).items.find((item) => item.target === target);
    if (scaffoldItem) {
      return {
        ...base,
        items: [...base.items, { ...scaffoldItem, status, detail }],
      };
    }
  }
  return {
    ...base,
    items: base.items.map((item) => (item.target === target ? { ...item, status, detail } : item)),
  };
}

export async function loadPersistedDeviceSync(itineraryId: string): Promise<SystemSyncResult | null> {
  try {
    const raw = await AsyncStorage.getItem(`${STORAGE_PREFIX}${itineraryId}`);
    if (!raw) return null;
    return JSON.parse(raw) as SystemSyncResult;
  } catch {
    return null;
  }
}

export async function persistDeviceSync(result: SystemSyncResult) {
  await AsyncStorage.setItem(`${STORAGE_PREFIX}${result.itinerary_id}`, JSON.stringify(result));
}

export async function ensureDeviceSyncScaffold(
  itinerary: Itinerary,
  current: SystemSyncResult | null,
): Promise<SystemSyncResult> {
  if (current?.itinerary_id === itinerary.id) return current;
  const persisted = await loadPersistedDeviceSync(itinerary.id);
  if (persisted?.itinerary_id === itinerary.id) return persisted;
  return createDeviceSyncScaffold(itinerary);
}
