import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { ItineraryItem, ItemWeatherInfo } from "../types";
import { sortItineraryItems } from "../utils/amapNavigation";
import { formatItemDateLabel } from "../utils/dateUtils";
import { resolveNodeType } from "../utils/nodeUtils";
import {
  categoryVisualForItem,
  dayPalette,
  segmentHasRisk,
} from "../utils/topologyVisual";

type Props = {
  items: ItineraryItem[];
  startDate?: string | null;
  busy?: boolean;
  poiSearching?: boolean;
  itemWeather?: Record<string, ItemWeatherInfo>;
  onPressItem: (item: ItineraryItem) => void;
  onNavigateSegment?: (from: ItineraryItem, to: ItineraryItem) => void;
  onDeleteItem?: (item: ItineraryItem) => void;
  onAddAfterItem?: (item: ItineraryItem) => void;
  onRecommendPOI?: (item: ItineraryItem) => void;
};

function GridLines() {
  return (
    <View pointerEvents="none" style={styles.gridLayer}>
      {Array.from({ length: 14 }).map((_, index) => (
        <View key={`h-${index}`} style={[styles.gridLineH, { top: index * 26 }]} />
      ))}
      {Array.from({ length: 8 }).map((_, index) => (
        <View key={`v-${index}`} style={[styles.gridLineV, { left: index * 36 }]} />
      ))}
    </View>
  );
}

function NavConnector({
  from,
  to,
  risky,
  dayColor,
  onNavigate,
}: {
  from: ItineraryItem;
  to: ItineraryItem;
  risky: boolean;
  dayColor: string;
  onNavigate?: () => void;
}) {
  return (
    <View style={styles.connectorRow}>
      <View style={styles.connectorRail}>
        <View style={[styles.connectorLine, { backgroundColor: risky ? "#FCA5A5" : dayColor }]} />
        <Pressable
          style={[styles.navBadge, risky ? styles.navBadgeRisk : { borderColor: dayColor, backgroundColor: "#EEF4FF" }]}
          onPress={onNavigate}
          disabled={!onNavigate}
        >
          <Ionicons name="navigate" size={11} color={risky ? "#EF4444" : "#1B6FFF"} />
          <Text style={[styles.navText, risky ? styles.navTextRisk : { color: "#1B6FFF" }]}>导航</Text>
        </Pressable>
        <View style={[styles.connectorLine, { backgroundColor: risky ? "#FCA5A5" : dayColor }]} />
      </View>
      <View style={styles.connectorSpacer} />
    </View>
  );
}

export function SpatiotemporalTimeline({
  items,
  startDate,
  busy,
  poiSearching,
  itemWeather,
  onPressItem,
  onNavigateSegment,
  onDeleteItem,
  onAddAfterItem,
  onRecommendPOI,
}: Props) {
  const sorted = sortItineraryItems(items);

  return (
    <View style={styles.wrap}>
      <GridLines />
      {poiSearching ? (
        <View style={styles.searchBanner}>
          <ActivityIndicator size="small" color="#1B6FFF" />
          <Text style={styles.searchBannerText}>
            正在跨平台广泛搜索，通常需 10–30 秒，请稍候…
          </Text>
        </View>
      ) : null}
      {sorted.map((item, index) => {
        const previous = index > 0 ? sorted[index - 1] : null;
        const showDayBadge = !previous || previous.day !== item.day;
        const dayColor = dayPalette[(item.day - 1) % dayPalette.length];
        const visual = categoryVisualForItem(item);
        const isHard = resolveNodeType(item) === "hard_anchor";
        const dateLabel = formatItemDateLabel(startDate, item.day);
        const seqLabel = `第${index + 1}站`;

        const poiLabel =
          item.category === "hotel"
            ? "酒店"
            : item.category === "sight"
              ? "景点"
              : item.category === "food" || item.category === "free"
                ? "美食"
                : null;
        const showPoiPick = poiLabel && onRecommendPOI && item.category !== "transport" && item.category !== "meeting";
        const weather = itemWeather?.[item.id];

        return (
          <View key={`${item.id}-${index}`}>
            {previous ? (
              <NavConnector
                from={previous}
                to={item}
                risky={segmentHasRisk(previous, item)}
                dayColor={dayColor}
                onNavigate={onNavigateSegment ? () => onNavigateSegment(previous, item) : undefined}
              />
            ) : null}

            <View style={styles.nodeRow}>
              <View style={styles.dayColumn}>
                {showDayBadge ? (
                  <View style={[styles.dayBadge, { backgroundColor: dayColor }]}>
                    <Text style={styles.dayBadgeDay}>D{item.day}</Text>
                    <Text style={styles.dayBadgeDate}>{dateLabel}</Text>
                  </View>
                ) : (
                  <View style={[styles.railDot, { backgroundColor: dayColor }]} />
                )}
              </View>

              <View style={styles.cardColumn}>
                <Pressable onPress={() => onPressItem(item)}>
                  <View style={styles.metaRow}>
                    <Text style={[styles.seqBadge, { color: dayColor }]}>{seqLabel}</Text>
                    <Text style={styles.metaDate}>{dateLabel}</Text>
                    <Text style={styles.metaTime}>{item.start_time}</Text>
                  </View>

                  <View style={[styles.card, { borderColor: visual.border }]}>
                    <View style={[styles.iconBox, { backgroundColor: visual.fill, borderColor: visual.border }]}>
                      <Ionicons name={visual.icon} size={18} color={visual.iconColor} />
                    </View>
                    <View style={styles.cardBody}>
                      <View style={styles.titleRow}>
                        <Text style={styles.cardTitle} numberOfLines={1}>
                          {item.title}
                        </Text>
                        {isHard ? <Ionicons name="lock-closed" size={12} color="#1B6FFF" /> : null}
                      </View>
                      <Text style={styles.cardSub} numberOfLines={1}>
                        {item.start_time}–{item.end_time} · {item.location || "地点待定"}
                      </Text>
                      {weather ? (
                        <View
                          style={[
                            styles.weatherRow,
                            weather.risk_level === "high"
                              ? styles.weatherRowHigh
                              : weather.risk_level === "medium"
                                ? styles.weatherRowMedium
                                : null,
                          ]}
                        >
                          <Ionicons
                            name={
                              weather.risk_level !== "low"
                                ? "rainy-outline"
                                : weather.text.includes("晴")
                                  ? "sunny-outline"
                                  : "partly-sunny-outline"
                            }
                            size={11}
                            color={
                              weather.risk_level === "high"
                                ? "#EA580C"
                                : weather.risk_level === "medium"
                                  ? "#D97706"
                                  : "#1A9D5C"
                            }
                          />
                          <Text
                            style={[
                              styles.weatherText,
                              weather.risk_level === "high"
                                ? styles.weatherTextHigh
                                : weather.risk_level === "medium"
                                  ? styles.weatherTextMedium
                                  : null,
                            ]}
                            numberOfLines={weather.risk_level !== "low" ? 2 : 1}
                          >
                            {weather.label || weather.text}
                            {weather.risk_level !== "low" && weather.advice ? ` · ${weather.advice}` : ""}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </Pressable>

                <View style={styles.actionRow}>
                {showPoiPick ? (
                  <Pressable
                    style={[styles.actionChip, styles.actionChipPick, poiSearching ? styles.actionChipBusy : null]}
                    disabled={busy}
                    onPress={() => onRecommendPOI(item)}
                  >
                    {poiSearching ? (
                      <ActivityIndicator size={10} color="#1B6FFF" />
                    ) : null}
                    <Text style={styles.actionChipPickText}>{poiSearching ? "搜索中…" : poiLabel}</Text>
                  </Pressable>
                ) : null}
                {onAddAfterItem ? (
                  <Pressable
                    style={[styles.actionChip, styles.actionChipAdd]}
                    disabled={busy}
                    onPress={() => onAddAfterItem(item)}
                  >
                    <Ionicons name="add" size={12} color="#1B6FFF" />
                    <Text style={styles.actionChipAddText}>添加</Text>
                  </Pressable>
                ) : null}
                {onDeleteItem ? (
                  <Pressable
                    style={[styles.actionChip, styles.actionChipDelete]}
                    disabled={busy}
                    onPress={() => onDeleteItem(item)}
                  >
                    <Ionicons name="trash-outline" size={12} color="#E55353" />
                    <Text style={styles.actionChipDeleteText}>删除</Text>
                  </Pressable>
                ) : null}
              </View>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "relative",
    borderRadius: 20,
    backgroundColor: "#F7FBFF",
    borderWidth: 1,
    borderColor: "#D7E8FF",
    paddingHorizontal: 10,
    paddingVertical: 12,
    overflow: "hidden",
  },
  searchBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#EEF4FF",
    borderWidth: 1,
    borderColor: "#C9DBFF",
    zIndex: 1,
  },
  searchBannerText: { flex: 1, color: "#30496F", fontSize: 11, fontWeight: "700", lineHeight: 16 },
  gridLayer: {
    ...StyleSheet.absoluteFill,
  },
  gridLineH: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(27,111,255,0.06)",
  },
  gridLineV: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: "rgba(27,111,255,0.05)",
  },
  connectorRow: {
    flexDirection: "row",
    minHeight: 34,
  },
  connectorRail: {
    width: 52,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  connectorLine: {
    width: 2,
    flex: 1,
    borderRadius: 999,
    opacity: 0.55,
  },
  connectorSpacer: {
    flex: 1,
  },
  transportBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  transportBadgeRisk: {
    borderColor: "#EF4444",
    backgroundColor: "#FFF1F2",
  },
  navBadge: {
    minWidth: 44,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1.5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    backgroundColor: "#FFFFFF",
  },
  navBadgeRisk: {
    borderColor: "#EF4444",
    backgroundColor: "#FFF1F2",
  },
  navText: {
    fontSize: 10,
    fontWeight: "900",
  },
  navTextRisk: {
    color: "#EF4444",
  },
  nodeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  dayColumn: {
    width: 52,
    alignItems: "center",
    paddingTop: 18,
  },
  dayBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1B6FFF",
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  dayBadgeDay: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 14,
  },
  dayBadgeDate: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 8,
    fontWeight: "800",
    marginTop: 1,
  },
  railDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 8,
  },
  cardColumn: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 2,
    flexWrap: "wrap",
  },
  seqBadge: {
    fontSize: 11,
    fontWeight: "900",
  },
  metaDate: {
    color: "#6B7A99",
    fontSize: 10,
    fontWeight: "800",
  },
  metaTime: {
    color: "#A0B0CC",
    fontSize: 10,
    fontWeight: "800",
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 14,
    borderWidth: 1.5,
    backgroundColor: "#FFFFFF",
    shadowColor: "#1B6FFF",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  cardTitle: {
    flex: 1,
    minWidth: 0,
    color: "#0F1B35",
    fontSize: 13,
    fontWeight: "900",
  },
  cardSub: {
    color: "#6B7A99",
    fontSize: 10,
    fontWeight: "800",
  },
  weatherRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "#F0FFF7",
  },
  weatherRowMedium: { backgroundColor: "#FFF7ED" },
  weatherRowHigh: { backgroundColor: "#FFF1F2" },
  weatherText: { flex: 1, color: "#1A9D5C", fontSize: 9, fontWeight: "800", lineHeight: 13 },
  weatherTextMedium: { color: "#D97706" },
  weatherTextHigh: { color: "#EA580C" },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingLeft: 2,
    marginTop: 2,
  },
  actionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
  },
  actionChipPick: { backgroundColor: "#E8FFF3" },
  actionChipBusy: { opacity: 0.75 },
  actionChipPickText: { color: "#1A9D5C", fontSize: 10, fontWeight: "900" },
  actionChipAdd: { backgroundColor: "#EEF4FF" },
  actionChipAddText: { color: "#1B6FFF", fontSize: 10, fontWeight: "900" },
  actionChipDelete: { backgroundColor: "#FFF1F0" },
  actionChipDeleteText: { color: "#E55353", fontSize: 10, fontWeight: "900" },
});
