import { ReactNode } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Itinerary, ItineraryWeatherResponse } from "../types";
import { BluemapTheme as theme } from "../theme/bluemapTheme";

type Props = {
  itinerary: Itinerary;
  city: string;
  weather?: ItineraryWeatherResponse | null;
  weatherLoading?: boolean;
  onRefreshWeather?: () => void;
  onBack?: () => void;
  showConfirmCta?: boolean;
  confirmLabel?: string;
  confirmLoading?: boolean;
  onConfirm?: () => void;
  onGoRefine?: () => void;
  children: ReactNode;
};

function topologyStats(itinerary: Itinerary) {
  return itinerary.items.reduce(
    (stats, item) => {
      stats.risks += item.risk_flags.length;
      return stats;
    },
    { nodes: itinerary.items.length, risks: 0 },
  );
}

export function TopologyShell({
  itinerary,
  city,
  weather,
  weatherLoading,
  onRefreshWeather,
  onBack,
  showConfirmCta,
  confirmLabel,
  confirmLoading,
  onConfirm,
  onGoRefine,
  children,
}: Props) {
  const stats = topologyStats(itinerary);
  const days = new Set(itinerary.items.map((item) => item.day)).size;
  const allWarnings = [...itinerary.warnings, ...(weather?.warnings ?? [])].filter(Boolean);
  const riskMessage =
    allWarnings[0] ??
    (stats.risks ? `检测到 ${stats.risks} 处行程风险，建议查看节点详情` : null);

  function showWarningDetail() {
    if (!allWarnings.length && !stats.risks) return;
    const body = allWarnings.length
      ? allWarnings.map((item, index) => `${index + 1}. ${item}`).join("\n\n")
      : `检测到 ${stats.risks} 处行程风险，建议展开下方节点查看详情。`;
    Alert.alert("行程预警", body);
  }

  function showWeatherDetail() {
    if (weatherLoading) return;
    if (!weather?.available) {
      onRefreshWeather?.();
      return;
    }
    const lines = [
      weather.summary,
      ...weather.item_weather
        .filter((item) => item.risk_level !== "low")
        .slice(0, 5)
        .map((item) => `${item.label}${item.advice ? ` · ${item.advice}` : ""}`),
    ].filter(Boolean);
    Alert.alert("天气同步", lines.join("\n\n") || "暂无天气详情");
  }

  const weatherLabel = weatherLoading ? "天气同步中" : weather?.available ? "天气已同步" : "天气待同步";
  const weatherSub = weatherLoading ? "请稍候…" : weather?.summary?.slice(0, 16) ?? (onRefreshWeather ? "点击同步" : "—");

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          {onBack ? (
            <Pressable style={styles.backBtn} onPress={onBack}>
              <Ionicons name="chevron-back" size={18} color={theme.colors.textSecondary} />
            </Pressable>
          ) : null}
          <View style={styles.headerText}>
            <Text style={styles.title}>视觉转译期</Text>
            <Text style={styles.subtitle}>
              {city || itinerary.intent.destination} · {days}天 · {stats.nodes}个节点
            </Text>
          </View>
        </View>

        <View style={styles.chipRow}>
          <Pressable style={styles.chipPressable} onPress={showWeatherDetail}>
            <SummaryChip icon="🌤" label={weatherLabel} sub={weatherSub} />
          </Pressable>
          <SummaryChip icon="🗺" label={`${stats.nodes} 节点`} sub={`${days}天`} />
          <SummaryChip icon="🚦" label={stats.risks || allWarnings.length ? "有风险" : "行程顺畅"} sub={stats.risks ? `${stats.risks} 处` : allWarnings.length ? `${allWarnings.length} 条预警` : "低风险"} />
        </View>
      </View>

      {riskMessage ? (
        <Pressable style={styles.riskBar} onPress={showWarningDetail}>
          <Ionicons name="warning-outline" size={14} color={theme.colors.accentOrange} />
          <Text style={styles.riskText} numberOfLines={2}>
            {riskMessage}
          </Text>
          <Ionicons name="chevron-forward" size={14} color="#B45309" />
        </Pressable>
      ) : null}

      {children}

      <View style={styles.legend}>
        {(
          [
            { label: "硬锚点", color: theme.colors.primary },
            { label: "半硬锚点", color: theme.colors.accentCyan },
            { label: "软任务", color: theme.colors.accentPurple },
            { label: "推荐", color: theme.colors.accentOrange },
          ] as const
        ).map((item) => (
          <View key={item.label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: item.color }]} />
            <Text style={styles.legendLabel}>{item.label}</Text>
          </View>
        ))}
      </View>

      {onGoRefine ? (
        <Pressable style={styles.refineBtn} onPress={onGoRefine}>
          <Text style={styles.refineBtnText}>调整计划</Text>
          <Ionicons name="chevron-forward" size={16} color="#FFF" />
        </Pressable>
      ) : null}

      {showConfirmCta && onConfirm ? (
        <Pressable style={[styles.confirmBtn, confirmLoading ? styles.confirmBtnDisabled : null]} onPress={onConfirm} disabled={confirmLoading}>
          <Text style={styles.confirmBtnText}>{confirmLoading ? "正在准备跨端执行..." : confirmLabel ?? "确认此方案并进入跨端执行  ›"}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function SummaryChip({ icon, label, sub }: { icon: string; label: string; sub: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipIcon}>{icon}</Text>
      <Text style={styles.chipLabel}>{label}</Text>
      <Text style={styles.chipSub}>{sub}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.spacing.md },
  header: { gap: theme.spacing.sm },
  headerRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF",
  },
  headerText: { flex: 1, minWidth: 0 },
  title: { color: theme.colors.textPrimary, fontSize: 18, fontWeight: theme.typography.weightBlack },
  subtitle: { color: theme.colors.textSecondary, fontSize: 12, marginTop: 2 },
  chipRow: { flexDirection: "row", gap: theme.spacing.sm },
  chipPressable: { flex: 1 },
  chip: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
  },
  chipIcon: { fontSize: 16 },
  chipLabel: { color: theme.colors.textPrimary, fontSize: 10, fontWeight: theme.typography.weightMedium, marginTop: 2 },
  chipSub: { color: theme.colors.textSecondary, fontSize: 9, marginTop: 1 },
  riskBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: theme.colors.bgWarningSoft,
  },
  riskText: { flex: 1, color: "#92400E", fontSize: 12, lineHeight: 16 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 12, paddingVertical: 4 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { color: theme.colors.textSecondary, fontSize: 10 },
  refineBtn: {
    minHeight: 48,
    borderRadius: theme.radius.xl,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: theme.colors.primary,
  },
  refineBtnText: { color: "#FFF", fontSize: 14, fontWeight: theme.typography.weightBlack },
  confirmBtn: {
    minHeight: 48,
    borderRadius: theme.radius.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
    ...theme.shadow.soft,
  },
  confirmBtnDisabled: { opacity: 0.55 },
  confirmBtnText: { color: "#FFF", fontSize: 14, fontWeight: theme.typography.weightBlack },
});
