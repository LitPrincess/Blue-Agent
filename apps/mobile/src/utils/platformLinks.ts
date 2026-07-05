import { Platform } from "react-native";

import type { ItineraryItem } from "../types";

export type ExternalPlatform = "xiaohongshu" | "meituan" | "dianping" | "ctrip" | "amap";
export type PlatformLinkCategory = "food" | "hotel" | "sight" | "general";

const APP_NAME = "BlueMap";

export function buildSearchText(keyword: string, city?: string) {
  const kw = keyword.trim();
  const cityText = city?.trim();
  if (!kw) return cityText || "旅行攻略";
  if (cityText && !kw.includes(cityText)) return `${cityText} ${kw}`;
  return kw;
}

export type PlatformLinkOptions = {
  category?: PlatformLinkCategory;
  checkin?: string | null;
  checkout?: string | null;
  lat?: number | null;
  lng?: number | null;
};

export function buildPlatformLinkSet(
  platform: ExternalPlatform,
  keyword: string,
  city?: string,
  options?: PlatformLinkOptions,
): { natives: string[]; web: string } {
  const searchText = buildSearchText(keyword, city);
  const q = encodeURIComponent(searchText);
  const nameEnc = encodeURIComponent(keyword.trim());
  const cityEnc = encodeURIComponent(city?.trim() || "");
  const cityPlain = city?.trim() || "";
  const category = options?.category ?? "general";
  const isAndroid = Platform.OS === "android";

  switch (platform) {
    case "amap": {
      const natives: string[] = [];
      if (options?.lat != null && options?.lng != null) {
        if (isAndroid) {
          natives.push(
            `androidamap://viewMap?sourceApplication=${APP_NAME}&poiname=${nameEnc}&lat=${options.lat}&lon=${options.lng}&dev=0`,
          );
        }
        natives.push(
          `amapuri://viewMap?sourceApplication=${APP_NAME}&poiname=${nameEnc}&lat=${options.lat}&lon=${options.lng}&dev=0`,
        );
      }
      if (isAndroid) {
        natives.push(`androidamap://poi?sourceApplication=${APP_NAME}&keywords=${q}&dev=0`);
      }
      natives.push(`amapuri://poi?sourceApplication=${APP_NAME}&keywords=${q}&dev=0`);
      return { natives, web: `https://uri.amap.com/search?keyword=${q}` };
    }
    case "meituan": {
      const natives: string[] = [];
      if (category === "hotel") {
        natives.push(`imeituan://www.meituan.com/hotel/search?q=${q}`);
      }
      natives.push(
        `imeituan://www.meituan.com/search?q=${q}`,
        `imeituan://www.meituan.com/search?keyword=${q}`,
      );
      return { natives, web: `https://i.meituan.com/s/${q}` };
    }
    case "dianping": {
      const natives = [
        `dianping://searchshoplist?keyword=${q}${cityEnc ? `&city=${cityEnc}` : ""}`,
        `dianping://search?keyword=${q}`,
      ];
      return { natives, web: `https://m.dianping.com/search/keyword/${q}` };
    }
    case "ctrip": {
      const hotelParams = new URLSearchParams({ keyword: keyword.trim() });
      if (cityPlain) hotelParams.set("city", cityPlain);
      if (options?.checkin) hotelParams.set("checkin", options.checkin);
      if (options?.checkout) hotelParams.set("checkout", options.checkout);
      const hotelH5 = `https://m.ctrip.com/webapp/hotel/hotellist?${hotelParams.toString()}`;
      const tourH5 = `https://m.ctrip.com/webapp/vacations/tour/list?keyword=${q}`;
      const web = category === "hotel" ? hotelH5 : tourH5;
      const natives: string[] = [`ctrip://wireless/h5?url=${encodeURIComponent(web)}&type=2`];
      if (category === "hotel" && cityPlain) {
        natives.push(
          `ctrip://hotel/search?city=${encodeURIComponent(cityPlain)}&keyword=${nameEnc}`,
        );
      }
      natives.push(`ctrip://wireless/search?keyword=${q}`);
      return { natives, web };
    }
    case "xiaohongshu": {
      const natives = [
        `xhsdiscover://search/result?keyword=${q}`,
        `xiaohongshu://search?keyword=${q}`,
      ];
      return { natives, web: `https://www.xiaohongshu.com/search_result?keyword=${q}` };
    }
    default:
      return { natives: [], web: "" };
  }
}

export function itemCategoryToLinkCategory(category: ItineraryItem["category"]): PlatformLinkCategory {
  if (category === "hotel") return "hotel";
  if (category === "sight") return "sight";
  if (category === "food") return "food";
  return "general";
}

export function platformSearchKeywordFromCandidate(name: string, city?: string, category?: string) {
  const base = name.trim();
  if (category === "hotel" || category === "sight") return city ? `${city} ${base}` : base;
  return buildSearchText(base, city);
}
