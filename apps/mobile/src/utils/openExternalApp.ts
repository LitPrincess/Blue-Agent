import { Linking, Platform } from "react-native";

export function webFallbackForNativeUrl(nativeUrl: string, explicitFallback?: string) {
  if (explicitFallback) return explicitFallback;

  if (nativeUrl.startsWith("xhsdiscover://") || nativeUrl.includes("xiaohongshu")) {
    return "https://www.xiaohongshu.com/explore";
  }

  if (nativeUrl.startsWith("imeituan://")) {
    const keyword = nativeUrl.match(/[?&]q=([^&]+)/)?.[1];
    return keyword ? `https://i.meituan.com/s/${keyword}` : undefined;
  }

  if (nativeUrl.startsWith("dianping://")) {
    const keyword = nativeUrl.match(/keyword=([^&]+)/)?.[1];
    return keyword ? `https://m.dianping.com/search/keyword/${keyword}` : undefined;
  }

  if (nativeUrl.startsWith("androidamap://")) {
    const keywordMatch = nativeUrl.match(/keywords=([^&]+)/);
    if (keywordMatch) {
      return `https://uri.amap.com/search?keyword=${keywordMatch[1]}`;
    }
    const nameMatch = nativeUrl.match(/poiname=([^&]+)/);
    const latMatch = nativeUrl.match(/lat=([^&]+)/);
    const lonMatch = nativeUrl.match(/lon=([^&]+)/);
    if (nameMatch && latMatch && lonMatch) {
      return `https://uri.amap.com/marker?position=${lonMatch[1]},${latMatch[1]}&name=${nameMatch[1]}`;
    }
  }

  if (nativeUrl.startsWith("ctrip://")) {
    const urlMatch = nativeUrl.match(/[?&]url=([^&]+)/);
    if (urlMatch) {
      return decodeURIComponent(urlMatch[1]);
    }
  }

  if (nativeUrl.startsWith("amapuri://")) {
    const keywordMatch = nativeUrl.match(/keywords=([^&]+)/);
    if (keywordMatch) {
      return `https://uri.amap.com/search?keyword=${keywordMatch[1]}`;
    }
    const nameMatch = nativeUrl.match(/poiname=([^&]+)/);
    const latMatch = nativeUrl.match(/lat=([^&]+)/);
    const lonMatch = nativeUrl.match(/lon=([^&]+)/);
    if (nameMatch && latMatch && lonMatch) {
      return `https://uri.amap.com/marker?position=${lonMatch[1]},${latMatch[1]}&name=${nameMatch[1]}`;
    }
  }

  return undefined;
}

export async function openExternalUrl(nativeUrl: string, webFallback?: string) {
  try {
    await Linking.openURL(nativeUrl);
    return;
  } catch {
    // Expo Go / Android 11+ 上 canOpenURL 常误报，直接尝试打开后再降级 web
  }

  const fallback = webFallbackForNativeUrl(nativeUrl, webFallback);
  if (fallback) {
    await Linking.openURL(fallback);
    return;
  }

  if (Platform.OS === "android" && (nativeUrl.startsWith("amapuri://") || nativeUrl.startsWith("androidamap://"))) {
    const keywordMatch = nativeUrl.match(/keywords=([^&]+)/);
    const keyword = keywordMatch ? decodeURIComponent(keywordMatch[1]) : "目的地";
    await Linking.openURL(`https://uri.amap.com/search?keyword=${encodeURIComponent(keyword)}`);
    return;
  }

  throw new Error("无法打开第三方应用");
}
