import { ItineraryItem } from "../types";

function encodeAmapParam(value: string) {
  return encodeURIComponent(value.trim());
}

function cleanRoutePlaceName(value: string) {
  return value
    .replace(/[（(].*?[）)]/g, "")
    .replace(/^\s*(乘坐|搭乘|换乘|步行至|步行到|到达|前往)\s*/, "")
    .trim();
}

function routeEndpointFromText(value: string, fallback: string) {
  const parts = value
    .split(/\s*(?:→|->|—|--|到|至)\s*/)
    .map(cleanRoutePlaceName)
    .filter(Boolean)
    .filter((part) => !/(地铁|公交|号线|线路|步行|打车|出租|高铁|动车|航班|机场大巴)/.test(part));
  return parts[parts.length - 1] || cleanRoutePlaceName(fallback);
}

export function navigationNameForItem(item: ItineraryItem) {
  if (item.category === "transport") {
    return routeEndpointFromText(item.location || item.title, item.title || item.location);
  }
  return cleanRoutePlaceName(item.location || item.title);
}

function inferAmapRouteType(item: ItineraryItem) {
  const text = `${item.title} ${item.description}`.toLowerCase();
  if (text.includes("步行") || text.includes("walk")) return 2;
  if (text.includes("地铁") || text.includes("公交") || text.includes("metro") || text.includes("bus")) return 1;
  return 0;
}

export function buildAmapNavigateUrl(item: ItineraryItem, previous?: ItineraryItem | null) {
  const appName = "BlueMap";
  const destinationName = navigationNameForItem(item);
  if (!previous) {
    const name = encodeAmapParam(destinationName);
    if (item.geo_lat != null && item.geo_lng != null) {
      return `amapuri://viewMap?sourceApplication=${appName}&poiname=${name}&lat=${item.geo_lat}&lon=${item.geo_lng}&dev=0`;
    }
    return `amapuri://poi?sourceApplication=${appName}&keywords=${name}&dev=0`;
  }

  const params = new URLSearchParams({
    sourceApplication: appName,
    sname: navigationNameForItem(previous),
    dname: destinationName,
    dev: "0",
    t: String(inferAmapRouteType(item)),
  });
  if (previous.category !== "transport" && previous.geo_lat != null && previous.geo_lng != null) {
    params.set("slat", String(previous.geo_lat));
    params.set("slon", String(previous.geo_lng));
  }
  if (item.category !== "transport" && item.geo_lat != null && item.geo_lng != null) {
    params.set("dlat", String(item.geo_lat));
    params.set("dlon", String(item.geo_lng));
  }
  return `amapuri://route/plan/?${params.toString()}`;
}

export function buildAmapWebNavigateUrl(item: ItineraryItem, previous?: ItineraryItem | null) {
  const destinationName = navigationNameForItem(item);
  if (previous) {
    const originName = navigationNameForItem(previous);
    if (previous.geo_lat != null && previous.geo_lng != null && item.geo_lat != null && item.geo_lng != null) {
      return `https://uri.amap.com/navigation?from=${previous.geo_lng},${previous.geo_lat},${encodeAmapParam(originName)}&to=${item.geo_lng},${item.geo_lat},${encodeAmapParam(destinationName)}&mode=car&policy=1&src=BlueMap`;
    }
    return `https://uri.amap.com/navigation?from=,&to=,&sname=${encodeAmapParam(originName)}&dname=${encodeAmapParam(destinationName)}&mode=car&policy=1&src=BlueMap`;
  }
  if (item.geo_lat != null && item.geo_lng != null) {
    return `https://uri.amap.com/marker?position=${item.geo_lng},${item.geo_lat}&name=${encodeAmapParam(destinationName)}`;
  }
  return `https://uri.amap.com/search?keyword=${encodeAmapParam(destinationName)}`;
}

export function timeToMinutes(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function sortItineraryItems(items: ItineraryItem[]) {
  return [...items].sort((left, right) => {
    if (left.day !== right.day) return left.day - right.day;
    return timeToMinutes(left.start_time) - timeToMinutes(right.start_time);
  });
}
