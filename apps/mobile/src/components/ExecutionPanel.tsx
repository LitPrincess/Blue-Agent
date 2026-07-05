import { useEffect, useMemo, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Itinerary, ItineraryItem, ItineraryPriceQuote, ItemWeatherInfo, SyncItem, SystemSyncResult, TravelOrder } from "../types";
import { formatItemSchedule } from "../utils/dateUtils";
import { buildAmapNavigateUrl, sortItineraryItems } from "../utils/amapNavigation";
import { buildAllPlatformUrls } from "../utils/platformDeeplinks";
import { categoryEmojiForItem } from "../utils/topologyVisual";
import { openExternalUrl, webFallbackForNativeUrl } from "../utils/openExternalApp";
import { resolveSearchCity } from "../utils/travelCity";
import { openPlatformSearch, ExternalPlatform } from "../utils/platformSearch";
import { itemCategoryToLinkCategory } from "../utils/platformLinks";
import { openMapRoute } from "../services/api";
import { useToast } from "./ui/Toast";
import { BluemapTheme as theme } from "../theme/bluemapTheme";

type Props = {
  order: TravelOrder | null;
  itinerary: Itinerary | null;
  syncResult: SystemSyncResult | null;
  startDate?: string | null;
  loading: boolean;
  calendarEventCount?: number;
  priceQuote?: ItineraryPriceQuote | null;
  expenseTotal?: number | null;
  expenseBreakdown?: { transport: number; food: number; hotel: number; other: number } | null;
  weatherSummary?: string | null;
  itemWeather?: Record<string, ItemWeatherInfo>;
  onExecute: () => void;
  onBack?: () => void;
  onGoTopology?: () => void;
  onGoRefine?: () => void;
  onSyncCalendar?: () => void;
  onSyncAlarm?: () => void;
  onSyncClock?: () => void;
  onSyncWidget?: () => void;
  onSyncMemo?: () => void;
  onReadSystemData?: () => void;
  onSyncMap?: () => void;
  onOpenSyncItem?: (target: SyncItem["target"]) => void;
  onGoReview?: () => void;
  onShareTrip?: () => void;
  onExportPdf?: () => void;
  onExpenseStats?: () => void;
  onEmergencyContact?: () => void;
  onRefreshWeather?: () => void;
};

type PlatformAction = {
  key: string;
  label: string;
  color: string;
  url: string;
};

type ExecutionCard = {
  id: string;
  icon: string;
  title: string;
  sub: string;
  params: string[];
  platforms: PlatformAction[];
  fallback?: () => void;
};

const APP_META: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  ctrip: { label: "携程", icon: "🏨", color: "#FF7D00", bg: "rgba(255,125,0,0.15)" },
  meituan: { label: "美团", icon: "🦜", color: "#FFB800", bg: "rgba(255,184,0,0.15)" },
  dianping: { label: "大众点评", icon: "🍽", color: "#FF6633", bg: "rgba(255,102,51,0.15)" },
  amap: { label: "高德地图", icon: "📍", color: "#1B6FFF", bg: "rgba(27,111,255,0.15)" },
  calendar: { label: "系统日历", icon: "📅", color: "#8B5CF6", bg: "rgba(139,92,246,0.15)" },
};

function formatProgressNodeLabel(item: ItineraryItem, role: "current" | "next") {
  const location = item.location?.trim() || item.title;
  if (item.category === "transport") {
    return `${role === "current" ? "出发" : "抵达"} · ${location}`;
  }
  if (item.category === "hotel") {
    return `入住 · ${location}`;
  }
  if (item.category === "food") {
    return `用餐 · ${location}`;
  }
  if (item.category === "sight") {
    return `游览 · ${location}`;
  }
  return item.title;
}

function buildExecutionCards(
  itinerary: Itinerary,
  startDate: string | null | undefined,
  order: TravelOrder | null,
  syncResult: SystemSyncResult | null,
): ExecutionCard[] {
  const cards: ExecutionCard[] = [];
  const ordered = sortItineraryItems(itinerary.items);
  const mapDeeplink = syncResult?.items.find((item) => item.target === "map")?.deeplink;
  const city = resolveSearchCity(itinerary.intent.destination);
  const startDateIso = itinerary.intent.start_date ?? startDate ?? null;

  for (const item of ordered) {
    if (item.category === "alert") continue;
    const platforms = buildAllPlatformUrls(item, city, { checkin: startDateIso, checkout: null }).map((entry) => ({
      key: entry.platform,
      label: entry.label,
      color: APP_META[entry.platform]?.color ?? "#1B6FFF",
      url: entry.url,
    }));

    cards.push({
      id: `item-${item.id}`,
      icon: categoryEmojiForItem(item),
      title: item.title,
      sub: `${item.location} · ${formatItemSchedule(startDate, item.day, item.start_time, item.end_time)}`,
      params: [order?.confirmations.hotel && item.category === "hotel" ? `确认号 ${order.confirmations.hotel}` : `搜索: ${city} ${item.title}`],
      platforms,
    });
  }

  for (let index = 1; index < ordered.length; index += 1) {
    const from = ordered[index - 1];
    const to = ordered[index];
    const hasCoords = from.geo_lat && from.geo_lng && to.geo_lat && to.geo_lng;
    cards.push({
      id: `nav-${from.id}-${to.id}`,
      icon: "📍",
      title: `${from.title} → ${to.title}`,
      sub: to.location,
      params: [`${from.start_time} → ${to.start_time}`],
      platforms: [
        {
          key: "amap",
          label: "高德导航",
          color: APP_META.amap.color,
          url: hasCoords ? buildAmapNavigateUrl(to, from) : mapDeeplink || "",
        },
      ],
      fallback: async () => {
        const response = await openMapRoute(from.location || from.title, to.location || to.title);
        await Linking.openURL(response.deeplink);
      },
    });
  }

  return cards.slice(0, 8);
}

export function ExecutionPanel({
  order,
  itinerary,
  syncResult,
  startDate,
  loading,
  calendarEventCount = 0,
  priceQuote,
  expenseTotal,
  expenseBreakdown,
  weatherSummary,
  itemWeather,
  onExecute,
  onBack,
  onGoTopology,
  onGoRefine,
  onSyncCalendar,
  onSyncAlarm,
  onSyncClock,
  onSyncWidget,
  onSyncMemo,
  onReadSystemData,
  onSyncMap,
  onOpenSyncItem,
  onGoReview,
  onShareTrip,
  onExportPdf,
  onExpenseStats,
  onEmergencyContact,
  onRefreshWeather,
}: Props) {
  const { showToast } = useToast();
  const [currentNode, setCurrentNode] = useState(0);

  const orderedItems = useMemo(
    () => (itinerary ? sortItineraryItems(itinerary.items) : []),
    [itinerary],
  );

  const cards = useMemo(
    () => (itinerary ? buildExecutionCards(itinerary, startDate, order, syncResult) : []),
    [itinerary, startDate, order, syncResult],
  );

  const syncedMap = useMemo(() => {
    const map: Partial<Record<SyncItem["target"], boolean>> = {};
    syncResult?.items.forEach((item) => {
      map[item.target] = item.status === "synced";
    });
    return map;
  }, [syncResult]);

  const currentItem = orderedItems[currentNode];
  const nextItem = orderedItems[Math.min(currentNode + 1, Math.max(orderedItems.length - 1, 0))];

  useEffect(() => {
    if (!order) return;
    const doneCount = order.steps.filter((step) => step.status === "done").length;
    setCurrentNode(Math.min(Math.max(doneCount - 1, 0), Math.max(orderedItems.length - 1, 0)));
  }, [order, orderedItems.length]);

  const systemSyncTiles = [
    {
      key: "calendar" as const,
      icon: "calendar" as const,
      color: "#8B5CF6",
      label: "系统日历",
      sub: syncedMap.calendar ? `已写入 ${calendarEventCount || orderedItems.length} 个日程` : "导入行程到系统日历",
      onPress: () => (onSyncCalendar ? onSyncCalendar() : onOpenSyncItem?.("calendar")),
    },
    {
      key: "alarm" as const,
      icon: "notifications" as const,
      color: "#F59E0B",
      label: "出发提醒",
      sub: syncedMap.alarm ? "通知提醒已写入" : "导入出发前 30 分钟通知",
      onPress: () => (onSyncAlarm ? onSyncAlarm() : onOpenSyncItem?.("alarm")),
    },
    {
      key: "clock" as const,
      icon: "alarm-outline" as const,
      color: "#EF4444",
      label: "系统闹钟",
      sub: syncedMap.clock ? "响铃闹钟已写入" : "导入响铃闹钟（提前 30/5 分钟）",
      onPress: () => (onSyncClock ? onSyncClock() : onOpenSyncItem?.("clock")),
    },
    {
      key: "memo" as const,
      icon: "document-text" as const,
      color: "#A855F7",
      label: "备忘录",
      sub: syncedMap.memo ? "行程摘要已写入" : "导入行程摘要到备忘",
      onPress: () => (onSyncMemo ? onSyncMemo() : onOpenSyncItem?.("memo")),
    },
    {
      key: "widget" as const,
      icon: "phone-portrait" as const,
      color: "#22C55E",
      label: "通知栏行程卡",
      sub: syncedMap.widget ? "下一站已推送到通知栏" : "推送下一站到系统通知栏",
      onPress: () => (onSyncWidget ? onSyncWidget() : onOpenSyncItem?.("widget")),
    },
    {
      key: "weather" as const,
      icon: "cloud" as const,
      color: "#1B6FFF",
      label: "天气推送",
      sub: weatherSummary?.slice(0, 14) || "小时级天气",
      onPress: () => onRefreshWeather?.(),
    },
  ];

  const deviceTiles = [
    { key: "phone", icon: "phone-portrait-outline" as const, label: "手机", active: Boolean(syncResult) },
    { key: "tablet", icon: "tablet-portrait-outline" as const, label: "平板", active: false },
    { key: "watch", icon: "watch-outline" as const, label: "手表", active: Boolean(syncedMap.clock) },
    { key: "desktop", icon: "desktop-outline" as const, label: "通知栏", active: Boolean(syncedMap.widget) },
  ];

  const utilityActions = [
    { key: "share", icon: "share-social-outline" as const, color: "#3D85FF", label: "分享行程", onPress: onShareTrip },
    { key: "pdf", icon: "download-outline" as const, color: "#8B5CF6", label: "导出 PDF", onPress: onExportPdf },
    { key: "cost", icon: "cafe-outline" as const, color: "#F59E0B", label: "费用统计", onPress: onExpenseStats },
    { key: "emergency", icon: "call-outline" as const, color: "#FF4757", label: "紧急联系", onPress: onEmergencyContact },
  ];

  function openSettingsMenu() {
    Alert.alert("执行设置", "选择要打开的功能", [
      { text: "取消", style: "cancel" },
      { text: "地图规划", onPress: () => (onOpenSyncItem ? onOpenSyncItem("map") : onSyncMap?.()) },
      { text: "备忘录", onPress: () => onOpenSyncItem?.("memo") },
      ...(onGoReview ? [{ text: "生成回顾", onPress: onGoReview }] : []),
    ]);
  }

  async function openPlatform(card: ExecutionCard, platform: PlatformAction) {
    const bookingPlatforms: ExternalPlatform[] = ["ctrip", "meituan", "dianping", "amap"];
    if (itinerary && card.id.startsWith("item-") && bookingPlatforms.includes(platform.key as ExternalPlatform)) {
      const item = orderedItems.find((entry) => entry.id === card.id.replace(/^item-/, ""));
      if (item) {
        await openPlatformSearch(platform.key as ExternalPlatform, item.title, resolveSearchCity(itinerary.intent.destination), {
          category: itemCategoryToLinkCategory(item.category),
          lat: item.geo_lat,
          lng: item.geo_lng,
        });
        return;
      }
    }

    if (!platform.url) {
      if (card.fallback) await card.fallback();
      return;
    }
    try {
      await openExternalUrl(platform.url, webFallbackForNativeUrl(platform.url));
      return;
    } catch {
      // fall through
    }
    if (card.fallback) {
      await card.fallback();
      return;
    }
    showToast(`请先安装 ${platform.label}，或使用浏览器打开搜索页`, "error");
  }

  async function openCard(card: ExecutionCard, platform: PlatformAction) {
    try {
      await openPlatform(card, platform);
    } catch (error) {
      Alert.alert("跳转失败", error instanceof Error ? error.message : "请确认目标 App 已安装。");
    }
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} nestedScrollEnabled>
      <View style={styles.header}>
        {onBack ? (
          <Pressable style={styles.headerBtn} onPress={onBack}>
            <Ionicons name="chevron-back" size={18} color="#FFF" />
          </Pressable>
        ) : (
          <View style={styles.headerBtnPlaceholder} />
        )}
        <View style={styles.headerText}>
          <Text style={styles.title}>跨端执行期</Text>
          <View style={styles.statusRow}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>{order?.status === "completed" ? "执行完成" : "AI 执行中"}</Text>
          </View>
        </View>
        <Pressable style={styles.headerBtn} onPress={openSettingsMenu}>
          <Ionicons name="settings-outline" size={18} color="#FFF" />
        </Pressable>
      </View>

      <View style={styles.progressCard}>
        <View style={styles.progressHead}>
          <Text style={styles.progressTitle}>行程进度</Text>
          <Text style={styles.progressCount}>
            {orderedItems.length ? currentNode + 1 : 0} / {orderedItems.length || 0}
          </Text>
        </View>
        <View style={styles.progressBarRow}>
          {(orderedItems.length ? orderedItems : [{ id: "placeholder" }]).map((item, index) => (
            <Pressable
              key={`${item.id}-${index}`}
              style={[styles.progressSegment, index <= currentNode ? styles.progressSegmentActive : null]}
              onPress={() => orderedItems.length && setCurrentNode(index)}
            />
          ))}
        </View>
        {currentItem ? (
          <View style={styles.progressNodes}>
            <View style={styles.flex}>
              <Text style={styles.nodeName} numberOfLines={1}>
                {formatProgressNodeLabel(currentItem, "current")}
              </Text>
              <Text style={styles.nodeHint}>当前节点</Text>
            </View>
            <Ionicons name="arrow-forward" size={16} color="rgba(255,255,255,0.28)" />
            <View style={[styles.flex, styles.alignEnd]}>
              <Text style={styles.nodeName} numberOfLines={1}>
                {nextItem ? formatProgressNodeLabel(nextItem, "next") : "—"}
              </Text>
              <Text style={styles.nodeHint}>下一节点</Text>
            </View>
          </View>
        ) : null}
      </View>

      {cards.length ? (
        <>
          <View style={styles.sectionHead}>
            <Ionicons name="flash-outline" size={16} color={theme.colors.accentCyan} />
            <Text style={styles.sectionTitle}>智能跳转</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>参数已预填</Text>
            </View>
          </View>
          {cards.map((card) => (
            <View key={card.id} style={styles.execCard}>
              <View style={[styles.execIcon, { backgroundColor: "rgba(255,255,255,0.08)" }]}>
                <Text style={styles.execIconText}>{card.icon}</Text>
              </View>
              <View style={styles.flex}>
                <View style={styles.execTitleRow}>
                  <Text style={styles.execTitle} numberOfLines={1}>
                    {card.title}
                  </Text>
                </View>
                <Text style={styles.execSub} numberOfLines={2}>
                  {card.sub}
                </Text>
                <View style={styles.platformRow}>
                  {card.platforms.map((platform) => (
                    <Pressable
                      key={`${card.id}-${platform.key}`}
                      style={[styles.platformBtn, { borderColor: platform.color }]}
                      onPress={() => void openCard(card, platform)}
                    >
                      <Text style={[styles.platformBtnText, { color: platform.color }]}>{platform.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
          ))}
        </>
      ) : null}

      <View style={styles.sectionHead}>
        <Ionicons name="sync-outline" size={16} color={theme.colors.accentCyan} />
        <Text style={styles.sectionTitle}>系统同步</Text>
      </View>
      <View style={styles.syncGrid}>
        {systemSyncTiles.map((tile) => {
          const synced = tile.key !== "weather" && syncedMap[tile.key];
          return (
            <Pressable
              key={tile.key}
              style={[styles.syncTile, synced ? { borderColor: tile.color, backgroundColor: `${tile.color}18` } : null]}
              onPress={tile.onPress}
            >
              <View style={[styles.syncIcon, { backgroundColor: `${tile.color}22` }]}>
                <Ionicons name={tile.icon} size={18} color={tile.color} />
              </View>
              <Text style={styles.syncLabel}>{tile.label}</Text>
              <Text style={[styles.syncSub, synced ? { color: tile.color } : null]} numberOfLines={2}>
                {synced ? `✓ ${tile.sub}` : tile.sub}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.sectionHead}>
        <Ionicons name="layers-outline" size={16} color={theme.colors.accentGreen} />
        <Text style={styles.sectionTitle}>多端同步</Text>
      </View>
      <View style={styles.deviceRow}>
        {deviceTiles.map((device) => (
          <View key={device.key} style={styles.deviceItem}>
            <View style={[styles.deviceIconWrap, device.active ? styles.deviceIconActive : null]}>
              <Ionicons
                name={device.icon}
                size={22}
                color={device.active ? theme.colors.accentCyan : "rgba(255,255,255,0.35)"}
              />
            </View>
            <Text style={[styles.deviceLabel, device.active ? styles.deviceLabelActive : null]}>{device.label}</Text>
            {device.active ? <View style={styles.deviceDot} /> : null}
          </View>
        ))}
      </View>

      <View style={styles.utilityRow}>
        {utilityActions.map((action) => (
          <Pressable
            key={action.key}
            style={styles.utilityBtn}
            onPress={action.onPress}
            disabled={!action.onPress || (action.key === "pdf" && loading)}
          >
            <View style={[styles.utilityIcon, { backgroundColor: `${action.color}22` }]}>
              <Ionicons name={action.icon} size={20} color={action.color} />
            </View>
            <Text style={styles.utilityLabel}>{action.label}</Text>
          </Pressable>
        ))}
      </View>

      {priceQuote ? (
        <View style={styles.priceStrip}>
          <Text style={styles.priceStripLabel}>预估总费用</Text>
          <Text style={styles.priceStripValue}>¥{expenseTotal ?? priceQuote.total}</Text>
          <View style={styles.priceBreakdownRow}>
            <View style={styles.priceBreakdownItem}>
              <Text style={styles.priceBreakdownLabel}>交通</Text>
              <Text style={styles.priceBreakdownValue}>¥{expenseBreakdown?.transport ?? priceQuote.transport}</Text>
            </View>
            <View style={styles.priceBreakdownItem}>
              <Text style={styles.priceBreakdownLabel}>餐饮</Text>
              <Text style={styles.priceBreakdownValue}>¥{expenseBreakdown?.food ?? priceQuote.food}</Text>
            </View>
            <View style={styles.priceBreakdownItem}>
              <Text style={styles.priceBreakdownLabel}>住宿</Text>
              <Text style={styles.priceBreakdownValue}>¥{expenseBreakdown?.hotel ?? priceQuote.hotel}</Text>
            </View>
            {(expenseBreakdown?.other ?? priceQuote.other) ? (
              <View style={styles.priceBreakdownItem}>
                <Text style={styles.priceBreakdownLabel}>其他</Text>
                <Text style={styles.priceBreakdownValue}>¥{expenseBreakdown?.other ?? priceQuote.other}</Text>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}

      <Pressable style={[styles.executeBtn, loading ? styles.executeBtnDisabled : null]} onPress={onExecute} disabled={loading || !order}>
        <Text style={styles.executeBtnText}>{loading ? "Agent 正在并行执行..." : "开始跨端执行并同步  ›"}</Text>
      </Pressable>

      <View style={styles.adjustNavRow}>
        <Pressable style={styles.adjustNavBtn} onPress={onGoTopology} disabled={!onGoTopology}>
          <Ionicons name="map-outline" size={18} color={theme.colors.accentCyan} />
          <Text style={styles.adjustNavText}>回到时空拓扑</Text>
        </Pressable>
        <Pressable style={styles.adjustNavBtn} onPress={onGoRefine} disabled={!onGoRefine}>
          <Ionicons name="sync-outline" size={18} color={theme.colors.accentCyan} />
          <Text style={styles.adjustNavText}>动态微调</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { gap: theme.spacing.md, paddingBottom: 24 },
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  headerBtnPlaceholder: { width: 36 },
  headerText: { flex: 1 },
  title: { color: "#FFF", fontSize: 20, fontWeight: theme.typography.weightBlack },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.colors.accentCyan },
  statusText: { color: "rgba(255,255,255,0.62)", fontSize: 12, fontWeight: theme.typography.weightMedium },
  progressCard: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  progressHead: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  progressTitle: { color: "#FFF", fontSize: 13, fontWeight: theme.typography.weightBlack },
  progressCount: { color: "rgba(255,255,255,0.45)", fontSize: 12, fontWeight: theme.typography.weightMedium },
  progressBarRow: { flexDirection: "row", gap: 4, marginBottom: 14 },
  progressSegment: { flex: 1, height: 7, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.12)" },
  progressSegmentActive: { backgroundColor: theme.colors.accentCyan },
  progressNodes: { flexDirection: "row", alignItems: "center", gap: 10 },
  nodeName: { color: "#FFF", fontSize: 13, fontWeight: theme.typography.weightBlack },
  nodeHint: { color: "rgba(255,255,255,0.42)", fontSize: 10, marginTop: 3, fontWeight: theme.typography.weightMedium },
  alignEnd: { alignItems: "flex-end" },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  sectionTitle: { color: "#FFF", fontSize: 14, fontWeight: theme.typography.weightBlack },
  badge: {
    marginLeft: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: theme.radius.pill,
    backgroundColor: "rgba(0,201,177,0.18)",
  },
  badgeText: { color: theme.colors.accentCyan, fontSize: 10, fontWeight: theme.typography.weightMedium },
  execCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  execIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  execIconText: { fontSize: 18 },
  execTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  execTitle: { flex: 1, color: "#FFF", fontSize: 12, fontWeight: theme.typography.weightBlack },
  execApp: { fontSize: 9, fontWeight: theme.typography.weightBlack },
  execSub: { color: "rgba(255,255,255,0.48)", fontSize: 10, marginTop: 3, lineHeight: 14 },
  platformRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  platformBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  platformBtnText: { fontSize: 9, fontWeight: theme.typography.weightBlack },
  execActions: { alignItems: "flex-end", gap: 6 },
  copyAction: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  copyActionText: { color: "rgba(255,255,255,0.72)", fontSize: 9, fontWeight: theme.typography.weightBlack },
  execAction: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
  },
  execActionText: { color: "#FFF", fontSize: 10, fontWeight: theme.typography.weightBlack },
  syncGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  syncTile: {
    width: "47.5%",
    minHeight: 92,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    gap: 6,
  },
  syncIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  syncLabel: { color: "#FFF", fontSize: 12, fontWeight: theme.typography.weightBlack },
  syncSub: { color: "rgba(255,255,255,0.42)", fontSize: 10, lineHeight: 14 },
  deviceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  deviceItem: { alignItems: "center", gap: 6, width: "23%" },
  deviceIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  deviceIconActive: {
    borderWidth: 2,
    borderColor: theme.colors.accentCyan,
    backgroundColor: "rgba(0,201,177,0.08)",
  },
  deviceLabel: { color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: theme.typography.weightMedium },
  deviceLabelActive: { color: "rgba(255,255,255,0.82)" },
  deviceDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.accentCyan,
    marginTop: -2,
  },
  utilityRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  utilityBtn: {
    flex: 1,
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  utilityIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  utilityLabel: { color: "rgba(255,255,255,0.72)", fontSize: 10, fontWeight: theme.typography.weightMedium, textAlign: "center" },
  priceStrip: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: "rgba(0,201,177,0.08)",
    borderWidth: 1,
    borderColor: "rgba(0,201,177,0.22)",
    gap: 8,
  },
  priceStripLabel: { color: "rgba(255,255,255,0.55)", fontSize: 10, fontWeight: theme.typography.weightMedium },
  priceStripValue: { color: theme.colors.accentCyan, fontSize: 24, fontWeight: theme.typography.weightBlack, lineHeight: 28 },
  priceBreakdownRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  priceBreakdownItem: {
    width: "47%",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  priceBreakdownLabel: { color: "rgba(255,255,255,0.45)", fontSize: 9, fontWeight: theme.typography.weightMedium },
  priceBreakdownValue: { color: "rgba(255,255,255,0.82)", fontSize: 12, fontWeight: theme.typography.weightBlack, marginTop: 2 },
  executeBtn: {
    minHeight: 50,
    borderRadius: theme.radius.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
  },
  executeBtnDisabled: { opacity: 0.55 },
  executeBtnText: { color: "#FFF", fontSize: 14, fontWeight: theme.typography.weightBlack },
  adjustNavRow: { flexDirection: "row", gap: 10 },
  adjustNavBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  adjustNavText: { color: "rgba(255,255,255,0.78)", fontSize: 12, fontWeight: theme.typography.weightMedium },
  flex: { flex: 1, minWidth: 0 },
});
