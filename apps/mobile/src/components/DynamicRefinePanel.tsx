import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { GuardianStatus, Itinerary, ReplanProposal, SystemSyncResult } from "../types";
import { EMERGENCY_CATEGORIES, EmergencyKind, emergencyCategoryById } from "../utils/emergencyAdjustments";
import { BluemapTheme as theme } from "../theme/bluemapTheme";

type Props = {
  itinerary: Itinerary;
  startDate?: string | null;
  syncResult: SystemSyncResult | null;
  guardian: GuardianStatus | null;
  proposal: ReplanProposal | null;
  loading: boolean;
  onEmergencyAdjust: (kind: EmergencyKind, detail?: string) => Promise<void>;
  onAcceptReplan: () => void;
  onGoExecution: () => void;
  onRefineChat: (instruction: string) => Promise<string>;
  onQuickRecommendFood: () => void;
  onQuickRecommendHotel: () => void;
  onUpload: () => void;
  poiSearching?: boolean;
};

export function DynamicRefinePanel({
  itinerary,
  startDate,
  syncResult,
  guardian,
  proposal,
  loading,
  onEmergencyAdjust,
  onAcceptReplan,
  onGoExecution,
  onRefineChat,
  onQuickRecommendFood,
  onQuickRecommendHotel,
  onUpload,
  poiSearching = false,
}: Props) {
  const [adjustInput, setAdjustInput] = useState("");
  const [adjustBusy, setAdjustBusy] = useState(false);
  const [selectedKind, setSelectedKind] = useState<EmergencyKind>("flight_delay");
  const [chatMessages, setChatMessages] = useState<Array<{ role: "ai" | "user"; text: string }>>([
    {
      role: "ai",
      text: "行程已生成。选择突发类型或直接描述调整需求，AI 将局部调整受影响节点。",
    },
  ]);

  const selectedCategory = emergencyCategoryById(selectedKind);

  const conflict = guardian?.incidents?.[0] ?? (itinerary.warnings.length ? { title: "行程提醒", detail: itinerary.warnings[0] } : null);

  async function handleSubmitAdjust() {
    const text = adjustInput.trim();
    if (!text || adjustBusy || loading) return;
    setAdjustInput("");
    setChatMessages((current) => [...current, { role: "user", text }]);
    setAdjustBusy(true);
    try {
      await onEmergencyAdjust(selectedKind, text);
      setChatMessages((current) => [
        ...current,
        { role: "ai", text: "已根据你的描述生成局部调整方案，请查看上方提案并确认。" },
      ]);
    } catch {
      try {
        const reply = await onRefineChat(text);
        setChatMessages((current) => [...current, { role: "ai", text: reply }]);
      } catch (error) {
        setChatMessages((current) => [
          ...current,
          { role: "ai", text: error instanceof Error ? error.message : "调整失败，请稍后重试。" },
        ]);
      }
    } finally {
      setAdjustBusy(false);
    }
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} nestedScrollEnabled>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>动态微调期</Text>
          <View style={styles.onlineRow}>
            <View style={styles.onlineDot} />
            <Text style={styles.onlineText}>AI 助理在线</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            style={[styles.addBtn, poiSearching ? styles.addBtnBusy : null]}
            onPress={onQuickRecommendFood}
            disabled={poiSearching || loading}
          >
            {poiSearching ? (
              <ActivityIndicator size="small" color={theme.colors.accentCyan} />
            ) : (
              <Text style={styles.addBtnText}>美食</Text>
            )}
          </Pressable>
          <Pressable
            style={[styles.addBtn, poiSearching ? styles.addBtnBusy : null]}
            onPress={onQuickRecommendHotel}
            disabled={poiSearching || loading}
          >
            {poiSearching ? (
              <ActivityIndicator size="small" color={theme.colors.accentCyan} />
            ) : (
              <Text style={styles.addBtnText}>酒店</Text>
            )}
          </Pressable>
          <Pressable style={styles.uploadBtn} onPress={onUpload} disabled={loading}>
            <Ionicons name="cloud-upload-outline" size={14} color={theme.colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      {syncResult ? (
        <View style={styles.syncRow}>
          {syncResult.items.slice(0, 5).map((item) => (
            <View key={item.target} style={[styles.syncPill, item.status === "synced" ? styles.syncPillDone : null]}>
              <Text style={[styles.syncPillText, item.status === "synced" ? styles.syncPillTextDone : null]} numberOfLines={1}>
                {item.title}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {conflict ? (
        <View style={styles.conflictCard}>
          <Ionicons name="warning" size={16} color={theme.colors.accentRed} />
          <View style={styles.flex}>
            <Text style={styles.conflictTitle}>{conflict.title ?? "异常检测"}</Text>
            <Text style={styles.conflictCopy} numberOfLines={3}>
              {"detail" in conflict ? conflict.detail : itinerary.warnings[0]}
            </Text>
          </View>
          <View style={styles.conflictActions}>
            <Pressable
              style={styles.conflictActionPrimary}
              onPress={() => void onEmergencyAdjust("weather_change")}
              disabled={loading}
            >
              <Text style={styles.conflictActionPrimaryText}>AI 调整</Text>
            </Pressable>
            {proposal ? (
              <Pressable style={styles.conflictActionSecondary} onPress={onAcceptReplan} disabled={loading}>
                <Text style={styles.conflictActionSecondaryText}>确认方案</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      {proposal ? (
        <View style={styles.proposalCard}>
          <Text style={styles.proposalTitle}>{proposal.summary}</Text>
          {proposal.changes.map((change) => (
            <Text key={change} style={styles.proposalChange}>
              • {change}
            </Text>
          ))}
          <Pressable style={styles.acceptBtn} onPress={onAcceptReplan} disabled={loading}>
            <Text style={styles.acceptBtnText}>确认更新行程</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.emergencySection}>
        <View style={styles.emergencyHeader}>
          <Ionicons name="chatbubble-ellipses-outline" size={16} color={theme.colors.primary} />
          <Text style={styles.emergencyTitle}>AI 行程调整</Text>
        </View>
        <Text style={styles.emergencyHint}>
          选择突发类型后描述具体情况，或直接输入调整指令；航班延误、改期、天气变化等均可处理。
        </Text>
        <View style={styles.categoryGrid}>
          {EMERGENCY_CATEGORIES.map((category) => {
            const active = selectedKind === category.id;
            return (
              <Pressable
                key={category.id}
                style={[styles.categoryChip, active ? styles.categoryChipActive : null]}
                onPress={() => setSelectedKind(category.id)}
                disabled={loading}
              >
                <Ionicons name={category.icon} size={14} color={active ? category.color : theme.colors.textSecondary} />
                <Text style={[styles.categoryLabel, active ? { color: category.color } : null]} numberOfLines={1}>
                  {category.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.categoryHint}>{selectedCategory.hint}</Text>
        {chatMessages.map((message, index) => (
          <View key={index} style={[styles.chatBubble, message.role === "user" ? styles.chatBubbleUser : null]}>
            <Text style={[styles.chatText, message.role === "user" ? styles.chatTextUser : null]}>{message.text}</Text>
          </View>
        ))}
        <View style={styles.chatInputRow}>
          <TextInput
            style={styles.chatInput}
            value={adjustInput}
            onChangeText={setAdjustInput}
            placeholder={selectedCategory.placeholder}
            placeholderTextColor={theme.colors.textPlaceholder}
            editable={!adjustBusy && !loading}
            multiline
          />
          <Pressable style={styles.sendBtn} onPress={() => void handleSubmitAdjust()} disabled={adjustBusy || loading}>
            {adjustBusy ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.sendBtnText}>提交</Text>}
          </Pressable>
        </View>
      </View>

      <Pressable style={styles.primaryBtn} onPress={onGoExecution}>
        <Text style={styles.primaryBtnText}>完成微调 · 进入跨端执行  ›</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { gap: theme.spacing.md, paddingBottom: 24 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  headerText: { flex: 1, minWidth: 0 },
  title: { color: theme.colors.textPrimary, fontSize: 18, fontWeight: theme.typography.weightBlack },
  onlineRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.accentGreen },
  onlineText: { color: theme.colors.textSecondary, fontSize: 12 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  addBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: theme.colors.bgAccentSoft,
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnBusy: { opacity: 0.7 },
  addBtnText: { color: theme.colors.primary, fontSize: 11, fontWeight: theme.typography.weightMedium },
  uploadBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
  },
  syncRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  syncPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
  },
  syncPillDone: { backgroundColor: theme.colors.bgSuccessSoft, borderColor: theme.colors.accentCyan },
  syncPillText: { color: theme.colors.textSecondary, fontSize: 10, fontWeight: theme.typography.weightMedium },
  syncPillTextDone: { color: theme.colors.accentCyan },
  conflictCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: theme.colors.bgDangerSoft,
    borderWidth: 1,
    borderColor: "rgba(255,71,87,0.18)",
  },
  conflictTitle: { color: theme.colors.accentRed, fontSize: 12, fontWeight: theme.typography.weightBlack },
  conflictCopy: { color: theme.colors.textSecondary, fontSize: 10, marginTop: 2, lineHeight: 14 },
  conflictActions: { gap: 6 },
  conflictActionPrimary: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: theme.colors.accentRed,
  },
  conflictActionPrimaryText: { color: "#FFF", fontSize: 10, fontWeight: theme.typography.weightMedium },
  conflictActionSecondary: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: theme.colors.bgAccentSoft,
  },
  conflictActionSecondaryText: { color: theme.colors.primary, fontSize: 10, fontWeight: theme.typography.weightMedium },
  sectionLabel: { color: theme.colors.textSecondary, fontSize: 12, fontWeight: theme.typography.weightMedium },
  nodeList: { gap: 8 },
  nodeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  dragHandle: { gap: 2, paddingHorizontal: 2 },
  dragLine: { width: 14, height: 2, borderRadius: 1, backgroundColor: "#CBD5E1" },
  nodeBody: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0 },
  nodeIcon: { width: 32, height: 32, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  nodeTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  nodeTitle: { flex: 1, color: theme.colors.textPrimary, fontSize: 12, fontWeight: theme.typography.weightBlack },
  nodeBadge: { fontSize: 9, paddingHorizontal: 6, paddingVertical: 2, borderRadius: theme.radius.pill, overflow: "hidden" },
  nodeMeta: { color: theme.colors.textSecondary, fontSize: 10, marginTop: 2 },
  nodeActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  moveBtn: { color: theme.colors.primary, fontSize: 14, fontWeight: theme.typography.weightBlack },
  proposalCard: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: theme.colors.bgGlassStrong,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    gap: 6,
  },
  proposalTitle: { color: theme.colors.textPrimary, fontSize: 14, fontWeight: theme.typography.weightBlack },
  proposalChange: { color: theme.colors.textSecondary, fontSize: 12, lineHeight: 18 },
  acceptBtn: {
    marginTop: 8,
    minHeight: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
  },
  acceptBtnText: { color: "#FFF", fontSize: 13, fontWeight: theme.typography.weightBlack },
  emergencySection: {
    gap: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: theme.colors.bgGlassStrong,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
  },
  emergencyHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  emergencyTitle: { color: theme.colors.textPrimary, fontSize: 13, fontWeight: theme.typography.weightBlack },
  emergencyHint: { color: theme.colors.textSecondary, fontSize: 11, lineHeight: 16 },
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    maxWidth: "48%",
    flexGrow: 1,
  },
  categoryChipActive: {
    backgroundColor: theme.colors.bgAccentSoft,
    borderColor: theme.colors.primary,
  },
  categoryLabel: { flex: 1, color: theme.colors.textSecondary, fontSize: 10, fontWeight: theme.typography.weightMedium },
  categoryHint: { color: theme.colors.textSecondary, fontSize: 10 },
  chatBubble: {
    alignSelf: "flex-start",
    maxWidth: "88%",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: theme.colors.bgAccentSoft,
  },
  chatBubbleUser: { alignSelf: "flex-end", backgroundColor: theme.colors.primary },
  chatText: { color: theme.colors.textPrimary, fontSize: 12, lineHeight: 18 },
  chatTextUser: { color: "#FFF" },
  chatInputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    padding: 8,
    borderRadius: 14,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
  },
  chatInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 88,
    color: theme.colors.textPrimary,
    fontSize: 12,
    padding: 0,
    textAlignVertical: "top",
  },
  sendBtn: {
    minWidth: 52,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
  },
  sendBtnText: { color: "#FFF", fontSize: 12, fontWeight: theme.typography.weightMedium },
  footerActions: { flexDirection: "row", gap: 8 },
  secondaryFooterBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.bgAccentSoft,
  },
  secondaryFooterText: { color: theme.colors.primary, fontSize: 12, fontWeight: theme.typography.weightMedium },
  primaryBtn: {
    minHeight: 48,
    borderRadius: theme.radius.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
  },
  primaryBtnText: { color: "#FFF", fontSize: 14, fontWeight: theme.typography.weightBlack },
  flex: { flex: 1, minWidth: 0 },
});
