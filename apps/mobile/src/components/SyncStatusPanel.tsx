import { Pressable, StyleSheet, Text, View } from "react-native";

import { SyncItem, SystemSyncResult } from "../types";

type Props = {
  syncResult: SystemSyncResult | null;
  calendarCount?: number;
  memoFound?: boolean;
  onRetry?: (target: SyncItem["target"]) => void;
};

const LABELS: Record<SyncItem["target"], string> = {
  calendar: "日历",
  alarm: "提醒",
  clock: "闹钟",
  widget: "通知卡",
  memo: "备忘",
  map: "地图",
};

export function SyncStatusPanel({ syncResult, calendarCount, memoFound, onRetry }: Props) {
  if (!syncResult) {
    return <Text style={styles.empty}>尚未同步系统，完成跨端执行后将显示各端状态。</Text>;
  }

  return (
    <View style={styles.wrap}>
      {syncResult.items.map((item) => {
        const synced = item.status === "synced";
        const extra =
          item.target === "calendar" && calendarCount != null
            ? ` · ${calendarCount} 条`
            : item.target === "memo" && memoFound != null
              ? memoFound
                ? " · 已读取"
                : " · 待读取"
              : "";
        return (
          <View key={item.target} style={[styles.chip, synced ? styles.chipOk : styles.chipPending]}>
            <Text style={[styles.chipText, synced ? styles.chipTextOk : styles.chipTextPending]}>
              {LABELS[item.target]} {synced ? "已同步" : "待同步"}
              {extra}
            </Text>
            {!synced && onRetry ? (
              <Pressable onPress={() => onRetry(item.target)}>
                <Text style={styles.retry}>重试</Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  empty: { color: "#8BA0BD", fontSize: 11, lineHeight: 16, fontWeight: "700" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#F3F7FF",
  },
  chipOk: { backgroundColor: "#ECFDF3" },
  chipPending: { backgroundColor: "#FFF7ED" },
  chipText: { fontSize: 11, fontWeight: "900" },
  chipTextOk: { color: "#15803D" },
  chipTextPending: { color: "#C2410C" },
  retry: { color: "#1B6FFF", fontSize: 10, fontWeight: "900" },
});
