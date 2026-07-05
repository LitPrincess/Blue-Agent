import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View, ActivityIndicator } from "react-native";

import { POICandidate } from "../types";
import { ExternalPlatform, openPlatformSearch } from "../utils/platformSearch";
import { openExternalUrl, webFallbackForNativeUrl } from "../utils/openExternalApp";

const platformLabel: Record<string, string> = {
  amap: "高德",
  dianping: "大众点评",
  meituan: "美团",
  xiaohongshu: "小红书",
  ctrip: "携程",
};

const SEARCH_PLATFORMS = ["amap", "dianping", "meituan", "ctrip", "xiaohongshu"] as const;

function categorySearchLabel(category?: "food" | "hotel" | "sight") {
  if (category === "hotel") return "酒店";
  if (category === "sight") return "景点";
  if (category === "food") return "美食";
  return "候选";
}

type Props = {
  visible: boolean;
  title: string;
  summary?: string;
  recommendation?: string;
  candidates: POICandidate[];
  loading?: boolean;
  category?: "food" | "hotel" | "sight";
  city?: string;
  onClose: () => void;
  onConfirm: (candidate: POICandidate) => void;
};

export function OptionPickerModal({
  visible,
  title,
  summary,
  recommendation,
  candidates,
  loading,
  category,
  city,
  onClose,
  onConfirm,
}: Props) {
  const searching = Boolean(loading && !candidates.length);
  const confirming = Boolean(loading && candidates.length);
  async function openPlatformLink(platformKey: string, candidate: POICandidate) {
    const supported: ExternalPlatform[] = ["xiaohongshu", "meituan", "dianping", "ctrip", "amap"];
    if (supported.includes(platformKey as ExternalPlatform)) {
      try {
        await openPlatformSearch(platformKey as ExternalPlatform, candidate.name, city, {
          category:
            candidate.category === "hotel"
              ? "hotel"
              : candidate.category === "sight"
                ? "sight"
                : "food",
          lat: candidate.geo_lat,
          lng: candidate.geo_lng,
        });
        return;
      } catch (error) {
        Alert.alert("打开失败", error instanceof Error ? error.message : "请稍后重试");
        return;
      }
    }
    const url = candidate.deeplinks[platformKey];
    if (!url) return;
    void openExternalUrl(url, webFallbackForNativeUrl(url)).catch(() => {
      Alert.alert("打开失败", "无法打开该平台，请手动搜索。");
    });
  }
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          {searching ? (
            <View style={styles.searchHintCard}>
              <Text style={styles.searchHintTitle}>正在跨平台广泛搜索{categorySearchLabel(category)}…</Text>
              <Text style={styles.searchHintBody}>
                正在聚合高德、大众点评、美团、携程、小红书等平台数据并综合排序，通常需要 10–30 秒，请耐心等待，不要关闭页面。
              </Text>
              <View style={styles.platformRow}>
                {SEARCH_PLATFORMS.map((key) => (
                  <View key={key} style={styles.platformChip}>
                    <Text style={styles.platformChipText}>{platformLabel[key]}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
          {!searching && summary ? <Text style={styles.summary}>{summary}</Text> : null}
          {!searching && recommendation ? <Text style={styles.recommendation}>{recommendation}</Text> : null}
          {confirming ? (
            <View style={styles.confirmBanner}>
              <ActivityIndicator size="small" color="#1B63FF" />
              <Text style={styles.confirmBannerText}>正在更新行程节点，请稍候…</Text>
            </View>
          ) : null}
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {searching ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="large" color="#1B63FF" />
                <Text style={styles.loadingText}>多平台搜索进行中</Text>
                <Text style={styles.loadingSubText}>Agent 正在并行检索并比对各平台结果</Text>
              </View>
            ) : null}
            {candidates.map((candidate, index) => (
              <View key={`${candidate.id}-${index}`} style={styles.item}>
                <View style={styles.itemHeader}>
                  <Text style={styles.rank}>第{index + 1}</Text>
                  <View style={styles.itemMain}>
                    <Text style={styles.itemTitle}>{candidate.name}</Text>
                    <Text style={styles.itemMeta}>
                      {candidate.price_label}
                      {candidate.rating ? ` · 评分 ${candidate.rating}` : ""}
                      {candidate.distance_km != null ? ` · ${candidate.distance_km}km` : ""}
                    </Text>
                    <Text style={styles.itemAddress}>{candidate.address}</Text>
                    {candidate.reason ? <Text style={styles.reason}>{candidate.reason}</Text> : null}
                  </View>
                </View>
                {Object.keys(candidate.platform_scores).length ? (
                  <View style={styles.scoreRow}>
                    {Object.entries(candidate.platform_scores).map(([key, score]) => (
                      <Text key={key} style={styles.scoreChip}>
                        {platformLabel[key] ?? key} {score}
                      </Text>
                    ))}
                  </View>
                ) : null}
                <View style={styles.linkRow}>
                  {Object.entries(candidate.deeplinks).map(([key, url]) => (
                    <Pressable
                      key={key}
                      style={styles.linkBtn}
                      onPress={() => void openPlatformLink(key, candidate)}
                    >
                      <Text style={styles.linkText}>{platformLabel[key] ?? key}</Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable
                  style={[styles.confirmBtn, loading ? styles.confirmDisabled : null]}
                  disabled={loading}
                  onPress={() => onConfirm(candidate)}
                >
                  <Text style={styles.confirmText}>{loading ? "更新行程中…" : "选定并更新行程"}</Text>
                </Pressable>
              </View>
            ))}
            {!candidates.length && !loading ? (
              <Text style={styles.empty}>暂无候选，请调整关键词后重试。</Text>
            ) : null}
          </ScrollView>
          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeText}>关闭</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(16, 32, 64, 0.45)",
    justifyContent: "flex-end",
  },
  card: {
    maxHeight: "88%",
    backgroundColor: "#F7FAFF",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 16,
    gap: 8,
  },
  title: { color: "#183B72", fontSize: 18, fontWeight: "900" },
  searchHintCard: {
    backgroundColor: "#EEF4FF",
    borderRadius: 14,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: "#C9DBFF",
  },
  searchHintTitle: { color: "#183B72", fontSize: 13, fontWeight: "900", lineHeight: 18 },
  searchHintBody: { color: "#5B7396", fontSize: 11, lineHeight: 17, fontWeight: "600" },
  platformRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  platformChip: {
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#D8E6FF",
  },
  platformChipText: { color: "#1B63FF", fontSize: 10, fontWeight: "800" },
  confirmBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFF8E8",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#FDE6B3",
  },
  confirmBannerText: { color: "#8A6A1F", fontSize: 11, fontWeight: "800", flex: 1 },
  summary: { color: "#5B7396", fontSize: 12, lineHeight: 18 },
  recommendation: { color: "#1B63FF", fontSize: 12, lineHeight: 18, fontWeight: "700" },
  list: { maxHeight: 480 },
  listContent: { gap: 10, paddingBottom: 8 },
  loadingWrap: { alignItems: "center", justifyContent: "center", paddingVertical: 28, gap: 8 },
  loadingText: { color: "#183B72", fontSize: 14, fontWeight: "900" },
  loadingSubText: { color: "#8BA0BD", fontSize: 11, fontWeight: "700", textAlign: "center", paddingHorizontal: 12 },
  item: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "#D8E6FF",
    gap: 8,
  },
  itemHeader: { flexDirection: "row", gap: 8 },
  rank: { color: "#1B63FF", fontSize: 14, fontWeight: "900", width: 28 },
  itemMain: { flex: 1, gap: 2 },
  itemTitle: { color: "#183B72", fontSize: 15, fontWeight: "900" },
  itemMeta: { color: "#5B7396", fontSize: 11 },
  itemAddress: { color: "#8BA0BD", fontSize: 11 },
  reason: { color: "#30496F", fontSize: 11, lineHeight: 16, marginTop: 4 },
  scoreRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  scoreChip: {
    backgroundColor: "#EEF4FF",
    color: "#1B63FF",
    fontSize: 10,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
  },
  linkRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  linkBtn: {
    borderWidth: 1,
    borderColor: "#C9DBFF",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  linkText: { color: "#1B63FF", fontSize: 10, fontWeight: "700" },
  confirmBtn: {
    backgroundColor: "#1B63FF",
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  confirmDisabled: { opacity: 0.6 },
  confirmText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  empty: { color: "#8BA0BD", textAlign: "center", paddingVertical: 24 },
  closeBtn: {
    alignItems: "center",
    paddingVertical: 10,
  },
  closeText: { color: "#5B7396", fontSize: 13, fontWeight: "700" },
});
