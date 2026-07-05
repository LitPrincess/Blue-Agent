import { Pressable, StyleSheet, Text, View } from "react-native";

import { ItemWeatherInfo, Itinerary, SystemSyncResult } from "../types";
import { riskTextForItem } from "../utils/riskUtils";
import { resolveNextWidgetItem } from "../utils/widgetUtils";

type Props = {
  itinerary: Itinerary;
  syncResult: SystemSyncResult | null;
  startDate?: string | null;
  itemWeather?: Record<string, ItemWeatherInfo>;
  onSyncCalendar?: () => void;
  onSyncAlarm?: () => void;
  onSyncClock?: () => void;
  onSyncWidget?: () => void;
  onSyncMemo?: () => void;
  onReadSystemData?: () => void;
};

export function DeviceWidgetPanel({
  itinerary,
  syncResult,
  startDate,
  itemWeather,
  onSyncCalendar,
  onSyncAlarm,
  onSyncClock,
  onSyncWidget,
  onSyncMemo,
  onReadSystemData,
}: Props) {
  const nextItem = resolveNextWidgetItem(itinerary.items, startDate);
  const weather = nextItem ? itemWeather?.[nextItem.id] : undefined;
  const riskText = nextItem ? riskTextForItem(nextItem, weather) : "";
  const calendarSync = syncResult?.items.find((item) => item.target === "calendar" && item.status === "synced");
  const alarmSync = syncResult?.items.find((item) => item.target === "alarm" && item.status === "synced");
  const clockSync = syncResult?.items.find((item) => item.target === "clock" && item.status === "synced");
  const widgetSync = syncResult?.items.find((item) => item.target === "widget" && item.status === "synced");
  const memoSync = syncResult?.items.find((item) => item.target === "memo" && item.status === "synced");

  if (!nextItem) {
    return <Text style={styles.empty}>暂无可展示的下一站节点。</Text>;
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.summaryRow}>
        <Tag active={Boolean(calendarSync)} label={calendarSync ? "日历已写入" : "日历待写入"} />
        <Tag active={Boolean(alarmSync)} label={alarmSync ? "提醒已写入" : "提醒待写入"} />
        <Tag active={Boolean(clockSync)} label={clockSync ? "闹钟已写入" : "闹钟待写入"} />
        <Tag active={Boolean(widgetSync)} label={widgetSync ? "行程卡已启用" : "行程卡待启用"} />
        <Tag active={Boolean(memoSync)} label={memoSync ? "备忘已写入" : "备忘待写入"} />
      </View>

      <View style={styles.shell}>
        <View style={styles.topRow}>
          <Text style={styles.appName}>蓝V出行 · 通知栏行程卡</Text>
          <Text style={styles.status}>{widgetSync ? "已启用" : "待启用"}</Text>
        </View>
        <Text style={styles.nextLabel}>下一站</Text>
        <Text style={styles.title} numberOfLines={2}>
          {nextItem.title}
        </Text>
        <Text style={styles.time}>
          D{nextItem.day} · {nextItem.start_time}–{nextItem.end_time}
        </Text>
        <Text style={styles.location} numberOfLines={2}>
          {nextItem.location}
        </Text>
        {weather ? (
          <View style={[styles.notice, weather.risk_level !== "low" ? styles.noticeWarn : null]}>
            <Text style={[styles.noticeText, weather.risk_level !== "low" ? styles.noticeTextWarn : null]} numberOfLines={2}>
              天气               {weather.text}
              {weather.advice ? ` · ${weather.advice}` : ""}
            </Text>
          </View>
        ) : null}
        {riskText ? (
          <View style={[styles.notice, styles.noticeDanger]}>
            <Text style={[styles.noticeText, styles.noticeTextDanger]} numberOfLines={2}>
              {riskText}
            </Text>
          </View>
        ) : null}

        <View style={styles.actionRow}>
          <ActionButton label={calendarSync ? "已写入日历" : "导入系统日历"} onPress={onSyncCalendar} />
          <ActionButton label={alarmSync ? "已写入提醒" : "导入出发提醒"} onPress={onSyncAlarm} />
          <ActionButton label={clockSync ? "已写入闹钟" : "导入系统闹钟"} onPress={onSyncClock} />
          <ActionButton label={widgetSync ? "行程卡已启用" : "启用通知栏行程卡"} primary onPress={onSyncWidget} />
          <ActionButton label={memoSync ? "已写入备忘" : "导入备忘录"} onPress={onSyncMemo} />
          {onReadSystemData ? <ActionButton label="验证系统数据" onPress={onReadSystemData} /> : null}
        </View>
      </View>
    </View>
  );
}

function Tag({ active, label }: { active: boolean; label: string }) {
  return (
    <View style={[styles.tag, !active ? styles.tagMuted : null]}>
      <Text style={[styles.tagText, !active ? styles.tagTextMuted : null]}>{label}</Text>
    </View>
  );
}

function ActionButton({
  label,
  primary,
  onPress,
}: {
  label: string;
  primary?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      style={[styles.actionBtn, primary ? styles.actionBtnPrimary : null, !onPress ? styles.actionBtnDisabled : null]}
      onPress={onPress}
      disabled={!onPress}
    >
      <Text style={[styles.actionText, primary ? styles.actionTextPrimary : null]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  empty: { color: "rgba(255,255,255,0.55)", fontSize: 12 },
  summaryRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(34,197,94,0.16)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.35)",
  },
  tagMuted: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderColor: "rgba(255,255,255,0.1)",
  },
  tagText: { color: "#86EFAC", fontSize: 10, fontWeight: "900" },
  tagTextMuted: { color: "rgba(255,255,255,0.45)" },
  shell: {
    borderRadius: 18,
    padding: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  appName: { color: "#D7E8FF", fontSize: 12, fontWeight: "900" },
  status: {
    color: "#7DD3FC",
    fontSize: 10,
    fontWeight: "900",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(125,211,252,0.12)",
  },
  nextLabel: { marginTop: 16, color: "#7DD3FC", fontSize: 11, fontWeight: "900" },
  title: { marginTop: 4, color: "#FFFFFF", fontSize: 20, lineHeight: 26, fontWeight: "900" },
  time: { marginTop: 8, color: "#C7D7EE", fontSize: 12, fontWeight: "900" },
  location: { marginTop: 5, color: "#8FA7C8", fontSize: 11, lineHeight: 16, fontWeight: "800" },
  notice: {
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "rgba(125,211,252,0.12)",
  },
  noticeWarn: { backgroundColor: "rgba(251,146,60,0.16)" },
  noticeDanger: { backgroundColor: "rgba(248,113,113,0.18)" },
  noticeText: { color: "#BAE6FD", fontSize: 10, lineHeight: 14, fontWeight: "800" },
  noticeTextWarn: { color: "#FDBA74" },
  noticeTextDanger: { color: "#FCA5A5" },
  actionRow: { marginTop: 14, flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  actionBtnPrimary: {
    backgroundColor: "#1B6FFF",
    borderColor: "#1B6FFF",
  },
  actionBtnDisabled: { opacity: 0.45 },
  actionText: { color: "#D7E8FF", fontSize: 11, fontWeight: "900" },
  actionTextPrimary: { color: "#FFFFFF" },
});
