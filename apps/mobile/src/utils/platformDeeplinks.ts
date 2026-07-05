import { Itinerary, ItineraryItem } from "../types";
import { buildPlatformLinkSet, itemCategoryToLinkCategory } from "./platformLinks";
import { resolveSearchCity } from "./travelCity";

export type PlatformKey = "ctrip" | "meituan" | "dianping" | "amap";

function searchKeyword(city: string, item: ItineraryItem) {
  const cityText = resolveSearchCity(city).trim();
  const title = item.title.trim();
  const location = item.location.trim();
  if (location && !title.includes(location)) {
    return `${cityText} ${title} ${location}`.trim();
  }
  return `${cityText} ${title}`.trim();
}

export function buildPlatformSearchUrl(
  platform: PlatformKey,
  item: ItineraryItem,
  city: string,
  options?: { checkin?: string | null; checkout?: string | null },
) {
  const { natives } = buildPlatformLinkSet(platform, item.title.trim(), resolveSearchCity(city), {
    category: itemCategoryToLinkCategory(item.category),
    checkin: options?.checkin,
    checkout: options?.checkout,
    lat: item.geo_lat,
    lng: item.geo_lng,
  });
  return natives[0] ?? "";
}

export const BOOKING_PLATFORMS: PlatformKey[] = ["ctrip", "meituan", "dianping", "amap"];

export function buildAllPlatformUrls(
  item: ItineraryItem,
  city: string,
  options?: { checkin?: string | null; checkout?: string | null },
) {
  return BOOKING_PLATFORMS.map((platform) => ({
    platform,
    label:
      platform === "ctrip"
        ? "携程"
        : platform === "meituan"
          ? "美团"
          : platform === "dianping"
            ? "大众点评"
            : "高德",
    url: buildPlatformSearchUrl(platform, item, city, options),
  }));
}

export function resolveBookingUrl(
  item: ItineraryItem,
  city: string,
  options?: { checkin?: string | null; checkout?: string | null },
) {
  if (item.booking_deeplink) return item.booking_deeplink;

  if (item.category === "hotel") {
    return buildPlatformSearchUrl("ctrip", item, city, options);
  }
  if (item.category === "food") {
    return buildPlatformSearchUrl("meituan", item, city, options);
  }
  if (item.category === "sight") {
    return buildPlatformSearchUrl("dianping", item, city, options);
  }
  return buildPlatformSearchUrl("amap", item, city, options);
}

export function platformLabelForItem(item: ItineraryItem) {
  if (item.category === "hotel") return "携程";
  if (item.category === "food") return "美团";
  if (item.category === "sight") return "大众点评";
  return "高德地图";
}

export function actionLabelForItem(item: ItineraryItem) {
  if (item.category === "hotel") return "去携程搜索";
  if (item.category === "food") return "去美团搜索";
  if (item.category === "sight") return "去大众点评搜索";
  return "去高德搜索";
}

export function buildPlatformWebFallback(
  platform: Exclude<PlatformKey, "amap">,
  item: ItineraryItem,
  city: string,
) {
  const { web } = buildPlatformLinkSet(platform, searchKeyword(city, item), resolveSearchCity(city), {
    category: itemCategoryToLinkCategory(item.category),
    lat: item.geo_lat,
    lng: item.geo_lng,
  });
  return web;
}

export function buildItineraryMemoText(itinerary: Itinerary, startDate?: string | null) {
  const lines = [
    itinerary.title,
    itinerary.summary,
    `${itinerary.intent.origin || "出发地待定"} → ${itinerary.intent.destination || "目的地待定"}`,
    startDate ? `出发日期：${startDate}` : "",
    "",
    "行程安排：",
    ...itinerary.items
      .filter((item) => item.category !== "alert")
      .map((item) => `D${item.day} ${item.start_time}-${item.end_time} ${item.title} · ${item.location}`),
  ];
  return lines.filter(Boolean).join("\n");
}
