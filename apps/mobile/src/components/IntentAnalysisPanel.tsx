import { Pressable, StyleSheet, Text, View } from "react-native";

import { IntentAnalysis } from "../types";

type Props = {
  analysis: IntentAnalysis;
  loading: boolean;
  onConfirm: () => void;
  onBack: () => void;
};

const elementMeta = [
  { key: "actions" as const, label: "行动", icon: "🎯" },
  { key: "locations" as const, label: "地点", icon: "📍" },
  { key: "time" as const, label: "时间", icon: "📅" },
  { key: "constraints" as const, label: "约束", icon: "🔒" },
  { key: "preferences" as const, label: "偏好", icon: "⭐" },
];

export function IntentAnalysisPanel({ analysis, loading, onConfirm, onBack }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>解析确认 · 意图爆发期</Text>
      <Text style={styles.summary}>{analysis.summary}</Text>

      <View style={styles.progressRow}>
        {analysis.progress.map((item) => (
          <View key={item.step} style={styles.progressPill}>
            <Text style={[styles.progressText, item.status === "done" && styles.progressDone]}>
              {item.status === "done" ? "✓ " : "○ "}
              {item.step}
            </Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionLabel}>五要素识别</Text>
      <View style={styles.grid}>
        {elementMeta.map((item) => (
          <View key={item.key} style={styles.card}>
            <Text style={styles.cardIcon}>{item.icon}</Text>
            <Text style={styles.cardLabel}>{item.label}</Text>
            <Text style={styles.cardValue} numberOfLines={3}>
              {analysis.five_elements[item.key].join(" / ") || "待补充"}
            </Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionLabel}>系统上下文</Text>
      {analysis.context.map((item) => (
        <View key={item.key} style={styles.contextRow}>
          <Text style={styles.contextTitle}>{item.title}</Text>
          <Text style={[styles.contextDetail, item.status === "warn" && styles.contextWarn]}>{item.detail}</Text>
        </View>
      ))}

      <View style={styles.actions}>
        <Pressable style={styles.secondaryBtn} onPress={onBack}>
          <Text style={styles.secondaryText}>返回修改</Text>
        </Pressable>
        <Pressable style={styles.primaryBtn} onPress={onConfirm} disabled={loading}>
          <Text style={styles.primaryText}>{loading ? "正在生成方案..." : "进入方案比对  ›"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  title: { color: "#233B63", fontSize: 15, fontWeight: "900" },
  summary: { color: "#3A4E70", fontSize: 13, lineHeight: 20, fontWeight: "700" },
  progressRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  progressPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#F7FBFF",
  },
  progressText: { color: "#8BA0BD", fontSize: 10, fontWeight: "900" },
  progressDone: { color: "#287CFF" },
  sectionLabel: { color: "#8BA0BD", fontSize: 11, fontWeight: "900" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  card: {
    width: "48%",
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
  },
  cardIcon: { fontSize: 14 },
  cardLabel: { marginTop: 6, color: "#287CFF", fontSize: 10, fontWeight: "900" },
  cardValue: { marginTop: 6, color: "#7085A2", fontSize: 11, lineHeight: 16 },
  contextRow: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    gap: 4,
  },
  contextTitle: { color: "#233B63", fontSize: 12, fontWeight: "900" },
  contextDetail: { color: "#7085A2", fontSize: 11, lineHeight: 16 },
  contextWarn: { color: "#F97316" },
  actions: { flexDirection: "row", gap: 10, marginTop: 4 },
  secondaryBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E7F3FF",
  },
  secondaryText: { color: "#287CFF", fontWeight: "900", fontSize: 13 },
  primaryBtn: {
    flex: 1.4,
    minHeight: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1B63FF",
  },
  primaryText: { color: "#FFFFFF", fontWeight: "900", fontSize: 13 },
});
