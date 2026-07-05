import { Linking } from "react-native";

import {
  buildPlatformLinkSet,
  buildSearchText,
  ExternalPlatform,
  PlatformLinkOptions,
  platformSearchKeywordFromCandidate,
} from "./platformLinks";
import { openExternalUrl } from "./openExternalApp";

export type { ExternalPlatform } from "./platformLinks";
export { buildSearchText, platformSearchKeywordFromCandidate };

export async function openPlatformSearch(
  platform: ExternalPlatform,
  keyword: string,
  city?: string,
  options?: PlatformLinkOptions,
): Promise<void> {
  const { natives, web } = buildPlatformLinkSet(platform, keyword, city, options);

  for (const native of natives) {
    try {
      const canOpen = await Linking.canOpenURL(native);
      if (!canOpen) continue;
    } catch {
      // Android 11+ 可能误报，仍尝试打开
    }
    try {
      await Linking.openURL(native);
      return;
    } catch {
      // 尝试下一个 scheme
    }
  }

  try {
    await openExternalUrl(natives[0] ?? web, web);
    return;
  } catch {
    // fall through
  }

  if (web) {
    await Linking.openURL(web);
    return;
  }

  throw new Error(`无法打开${platform}，请确认 App 已安装`);
}
