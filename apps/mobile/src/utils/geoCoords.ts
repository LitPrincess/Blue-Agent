import { ItineraryItem } from "../types";

export type MapPoint = {
  lng: number;
  lat: number;
  icon: string;
  label: string;
};

type PoiRecord = {
  keywords: string[];
  lng: number;
  lat: number;
  icon: string;
};

const CITY_CENTERS: Record<string, MapPoint> = {
  北京: { lng: 116.4074, lat: 39.9042, icon: "🏙️", label: "北京" },
  上海: { lng: 121.4737, lat: 31.2304, icon: "🏙️", label: "上海" },
  云南: { lng: 102.832, lat: 24.8801, icon: "🏔️", label: "云南" },
  昆明: { lng: 102.832, lat: 24.8801, icon: "🌸", label: "昆明" },
  广州: { lng: 113.2644, lat: 23.1291, icon: "🏙️", label: "广州" },
  深圳: { lng: 114.0579, lat: 22.5431, icon: "🏙️", label: "深圳" },
  成都: { lng: 104.0665, lat: 30.5723, icon: "🐼", label: "成都" },
  杭州: { lng: 120.1551, lat: 30.2741, icon: "🌊", label: "杭州" },
};

const POIS: PoiRecord[] = [
  { keywords: ["故宫", "故宫博物院"], lng: 116.397026, lat: 39.918058, icon: "🏯" },
  { keywords: ["首都机场", "机场", "航班"], lng: 116.584, lat: 40.080, icon: "✈️" },
  { keywords: ["高铁", "火车站", "车站"], lng: 116.378, lat: 39.865, icon: "🚄" },
  { keywords: ["西单"], lng: 116.373, lat: 39.913, icon: "🛍️" },
  { keywords: ["王府井", "烤鸭"], lng: 116.417, lat: 39.909, icon: "🦆" },
  { keywords: ["国家会议中心", "会议"], lng: 116.387, lat: 40.003, icon: "🏢" },
  { keywords: ["什刹海", "胡同"], lng: 116.386, lat: 39.941, icon: "🎋" },
  { keywords: ["外滩"], lng: 121.4903, lat: 31.2367, icon: "🌃" },
  { keywords: ["豫园"], lng: 121.492, lat: 31.227, icon: "🏮" },
  { keywords: ["翠湖", "滇池"], lng: 102.754, lat: 24.973, icon: "🌊" },
  { keywords: ["石林"], lng: 103.325, lat: 24.812, icon: "🗿" },
  { keywords: ["酒店", "入住"], lng: 116.373, lat: 39.913, icon: "🏨" },
  { keywords: ["午餐", "餐饮", "美食"], lng: 116.417, lat: 39.909, icon: "🍜" },
  { keywords: ["探索", "弹性"], lng: 102.832, lat: 24.8801, icon: "🎈" },
  { keywords: ["景点", "游览"], lng: 102.832, lat: 24.9001, icon: "📸" },
];

const CATEGORY_ICON: Record<ItineraryItem["category"], string> = {
  transport: "✈️",
  meeting: "🏢",
  food: "🍜",
  sight: "🏯",
  hotel: "🏨",
  free: "🎈",
  alert: "⚠️",
};

function findCity(text: string) {
  return Object.keys(CITY_CENTERS).find((city) => text.includes(city));
}

function matchPoi(text: string) {
  return POIS.find((poi) => poi.keywords.some((keyword) => text.includes(keyword)));
}

export function resolveMapPoint(item: ItineraryItem, index: number, city: string): MapPoint {
  if (item.geo_lat != null && item.geo_lng != null) {
    return {
      lng: item.geo_lng,
      lat: item.geo_lat,
      icon: matchPoi(`${item.title} ${item.location}`)?.icon ?? CATEGORY_ICON[item.category],
      label: item.title,
    };
  }

  const text = `${item.title} ${item.location}`;
  const poi = matchPoi(text);
  if (poi) {
    return {
      lng: poi.lng + index * 0.004,
      lat: poi.lat + index * 0.003,
      icon: poi.icon,
      label: item.title,
    };
  }

  const cityKey = findCity(text) ?? findCity(city) ?? "北京";
  const center = CITY_CENTERS[cityKey] ?? CITY_CENTERS.北京;
  const angle = (index / 6) * Math.PI * 2;
  const radius = 0.03 + index * 0.008;

  return {
    lng: center.lng + Math.cos(angle) * radius,
    lat: center.lat + Math.sin(angle) * radius,
    icon: CATEGORY_ICON[item.category],
    label: item.title,
  };
}

export function resolveCityCenter(city: string): MapPoint {
  return CITY_CENTERS[findCity(city) ?? ""] ?? CITY_CENTERS.北京;
}
