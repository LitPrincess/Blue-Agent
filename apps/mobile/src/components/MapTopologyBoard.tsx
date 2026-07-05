import { useMemo, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { WebView, WebViewMessageEvent } from "react-native-webview";

import { SpatiotemporalTimeline } from "./SpatiotemporalTimeline";
import { ItemWeatherInfo, Itinerary, ItineraryItem } from "../types";
import { UpdateNodePayload } from "../services/api";
import { resolveCityCenter } from "../utils/geoCoords";
import { buildAmapHtml, buildLeafletHtml, buildMapMarkers } from "../utils/mapHtml";

type Props = {
  itinerary: Itinerary;
  city: string;
  startDate?: string | null;
  itemWeather?: Record<string, ItemWeatherInfo>;
  busy?: boolean;
  poiSearching?: boolean;
  onUpdateNode: (itemId: string, payload: UpdateNodePayload) => Promise<void>;
  onEditItem: (item: ItineraryItem) => void;
  onNavigateSegment?: (from: ItineraryItem, to: ItineraryItem) => void;
  onDeleteItem?: (item: ItineraryItem) => void;
  onAddAfterItem?: (item: ItineraryItem) => void;
  onRecommendPOI?: (item: ItineraryItem) => void;
  onMapInteractionChange?: (active: boolean) => void;
};

const MAP_HEIGHT_EXPANDED = 320;
const MAP_HEIGHT_COLLAPSED = 0;

export function MapTopologyBoard({
  itinerary,
  city,
  startDate,
  itemWeather,
  busy,
  poiSearching,
  onUpdateNode,
  onEditItem,
  onNavigateSegment,
  onDeleteItem,
  onAddAfterItem,
  onRecommendPOI,
  onMapInteractionChange,
}: Props) {
  const [mapExpanded, setMapExpanded] = useState(true);
  const webRef = useRef<WebView>(null);
  const amapKey = process.env.EXPO_PUBLIC_AMAP_WEB_KEY?.trim() ?? "";
  const items = itinerary.items;
  const mapCity = city || itinerary.intent.destination || "北京";

  const html = useMemo(() => {
    const markers = buildMapMarkers(items, mapCity, startDate ?? itinerary.intent.start_date, itemWeather);
    const centerPoint = resolveCityCenter(mapCity);
    const center = { lng: centerPoint.lng, lat: centerPoint.lat };
    if (amapKey) {
      return buildAmapHtml(amapKey, markers, center);
    }
    return buildLeafletHtml(markers, center);
  }, [amapKey, items, mapCity, startDate, itinerary.intent.start_date, itemWeather]);

  function injectMapCommand(script: string) {
    webRef.current?.injectJavaScript(`${script}; true;`);
  }

  async function handleMessage(event: WebViewMessageEvent) {
    try {
      const payload = JSON.parse(event.nativeEvent.data) as {
        type: string;
        id: string;
        lng?: number;
        lat?: number;
      };

      const item = items.find((entry) => entry.id === payload.id);
      if (!item) return;

      if (payload.type === "markerClick") {
        onEditItem(item);
        return;
      }

      if (payload.type === "markerDrag" && payload.lng != null && payload.lat != null) {
        try {
          await onUpdateNode(payload.id, {
            geo_lng: payload.lng,
            geo_lat: payload.lat,
          });
        } catch (error) {
          Alert.alert("位置更新失败", error instanceof Error ? error.message : "请稍后重试");
        }
      }
    } catch {
      // ignore malformed messages from WebView
    }
  }

  return (
    <View style={styles.wrap}>
      <Pressable style={styles.mapToggle} onPress={() => setMapExpanded((current) => !current)}>
        <View style={styles.mapToggleLeft}>
          <Ionicons name="map-outline" size={16} color="#1B6FFF" />
          <Text style={styles.mapToggleTitle}>行程地图</Text>
          <Text style={styles.mapToggleMeta}>
            {items.length} 个节点 · {amapKey ? "高德" : "OSM"}
          </Text>
        </View>
        <Ionicons name={mapExpanded ? "chevron-up" : "chevron-down"} size={18} color="#6B7A99" />
      </Pressable>

      {mapExpanded ? (
        <>
          <View style={styles.mapHintBox}>
            <Ionicons name="information-circle-outline" size={14} color="#1B6FFF" />
            <Text style={styles.mapHintText}>
              软节点（餐饮/景点）范围较小，相对车站/机场等迎接点需要双指放大查看；可用右侧 +/- 或「全览」调整视野。
            </Text>
          </View>
          <View
          style={[styles.mapShell, { height: MAP_HEIGHT_EXPANDED }]}
          onTouchStart={() => onMapInteractionChange?.(true)}
          onTouchEnd={() => onMapInteractionChange?.(false)}
          onTouchCancel={() => onMapInteractionChange?.(false)}
        >
          <WebView
            ref={webRef}
            key={`map-${itinerary.id}`}
            originWhitelist={["*"]}
            source={{ html }}
            style={styles.map}
            scrollEnabled={false}
            nestedScrollEnabled
            overScrollMode="never"
            bounces={false}
            javaScriptEnabled
            domStorageEnabled
            androidLayerType="hardware"
            allowsInlineMediaPlayback
            onMessage={handleMessage}
            setSupportMultipleWindows={false}
          />

          <View style={styles.zoomBar}>
            <Pressable style={styles.zoomBtn} onPress={() => injectMapCommand("window.mapApi.zoomIn()")}>
              <Text style={styles.zoomText}>＋</Text>
            </Pressable>
            <Pressable style={styles.zoomBtn} onPress={() => injectMapCommand("window.mapApi.zoomOut()")}>
              <Text style={styles.zoomText}>－</Text>
            </Pressable>
            <Pressable style={styles.zoomBtn} onPress={() => injectMapCommand("window.mapApi.fitView()")}>
              <Text style={styles.fitText}>全览</Text>
            </Pressable>
          </View>
        </View>
        </>
      ) : (
        <View style={[styles.mapShell, styles.mapShellCollapsed, { height: MAP_HEIGHT_COLLAPSED }]} />
      )}

      <Text style={styles.sectionLabel}>行程节点</Text>
      <SpatiotemporalTimeline
        items={items}
        startDate={startDate ?? itinerary.intent.start_date}
        busy={busy}
        poiSearching={poiSearching}
        itemWeather={itemWeather}
        onPressItem={onEditItem}
        onNavigateSegment={onNavigateSegment}
        onDeleteItem={onDeleteItem}
        onAddAfterItem={onAddAfterItem}
        onRecommendPOI={onRecommendPOI}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  mapToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#D7E8FF",
  },
  mapToggleLeft: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1, minWidth: 0 },
  mapToggleTitle: { color: "#0F1B35", fontSize: 13, fontWeight: "900" },
  mapToggleMeta: { color: "#8BA0BD", fontSize: 10, fontWeight: "700" },
  mapHintBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#EEF4FF",
    borderWidth: 1,
    borderColor: "#D7E8FF",
  },
  mapHintText: { flex: 1, color: "#527099", fontSize: 10, lineHeight: 15, fontWeight: "700" },
  sectionLabel: { color: "#6B7A99", fontSize: 12, fontWeight: "700", marginTop: 4 },
  mapShell: {
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#E8F4FF",
    borderWidth: 1,
    borderColor: "#D7E8FF",
  },
  mapShellCollapsed: { borderWidth: 0, backgroundColor: "transparent" },
  map: { flex: 1, backgroundColor: "transparent" },
  zoomBar: {
    position: "absolute",
    right: 10,
    top: 10,
    gap: 6,
  },
  zoomBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.94)",
    borderWidth: 1,
    borderColor: "#D7E8FF",
  },
  zoomText: { color: "#287CFF", fontSize: 18, fontWeight: "900", marginTop: -2 },
  fitText: { color: "#287CFF", fontSize: 10, fontWeight: "900" },
});
