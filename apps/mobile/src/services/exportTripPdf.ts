import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

import { Itinerary, TripReview } from "../types";
import { formatItemSchedule } from "../utils/dateUtils";
import { sortItineraryItems } from "../utils/amapNavigation";

export type PdfExportOutcome = {
  status: "shared" | "unsupported" | "failed";
  detail: string;
  uri?: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildItineraryHtml(itinerary: Itinerary, review?: TripReview | null) {
  const startDate = itinerary.intent.start_date ?? "";
  const rows = sortItineraryItems(itinerary.items)
    .map((item) => {
      const schedule = formatItemSchedule(startDate, item.day, item.start_time, item.end_time);
      return `
        <tr>
          <td>${escapeHtml(schedule)}</td>
          <td><strong>${escapeHtml(item.title)}</strong><br/>${escapeHtml(item.location)}</td>
          <td>${escapeHtml(item.description || "-")}</td>
        </tr>
      `;
    })
    .join("");

  const reviewBlock = review
    ? `
      <h2>行程回顾</h2>
      <p>${escapeHtml(review.summary)}</p>
      <p><strong>预算合计：</strong>¥${review.budget_total}</p>
      <h3>偏好记忆</h3>
      <ul>${review.preference_memory.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      <h3>下次建议</h3>
      <ul>${review.next_trip_suggestions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    `
    : "";

  return `
    <!DOCTYPE html>
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0F1B35; padding: 24px; }
          h1 { color: #1B6FFF; margin-bottom: 8px; }
          .meta { color: #5B7394; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th, td { border: 1px solid #D8E4F7; padding: 10px; vertical-align: top; font-size: 12px; }
          th { background: #EEF4FF; text-align: left; }
          h2, h3 { color: #1B6FFF; margin-top: 24px; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(itinerary.title)}</h1>
        <div class="meta">
          ${escapeHtml(itinerary.intent.origin || "出发地待定")} → ${escapeHtml(itinerary.intent.destination || "目的地待定")}
          ${startDate ? `<br/>${escapeHtml(startDate)} 起` : ""}
        </div>
        <p>${escapeHtml(itinerary.summary)}</p>
        <h2>行程安排</h2>
        <table>
          <thead>
            <tr><th>时间</th><th>节点</th><th>说明</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        ${reviewBlock}
      </body>
    </html>
  `;
}

async function resolveShareablePdfUri(rawUri: string, base64?: string) {
  const cacheDir = FileSystem.cacheDirectory;
  if (base64 && cacheDir) {
    const destUri = `${cacheDir}trip-export-${Date.now()}.pdf`;
    await FileSystem.writeAsStringAsync(destUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const info = await FileSystem.getInfoAsync(destUri);
    if (info.exists) return destUri;
  }

  if (cacheDir) {
    try {
      const destUri = `${cacheDir}trip-export-${Date.now()}.pdf`;
      await FileSystem.copyAsync({ from: rawUri, to: destUri });
      return destUri;
    } catch {
      // Print 缓存目录在 Expo Go 中可能不可读，直接尝试原始 URI
    }
  }

  return rawUri;
}

export async function exportItineraryPdf(
  itinerary: Itinerary,
  review?: TripReview | null,
): Promise<PdfExportOutcome> {
  if (Platform.OS === "web") {
    return {
      status: "unsupported",
      detail: "网页端暂不支持导出 PDF，请在真机 App 中导出。",
    };
  }

  try {
    const html = buildItineraryHtml(itinerary, review);
    const { uri: rawUri, base64 } = await Print.printToFileAsync({ html, base64: true });
    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      return {
        status: "failed",
        detail: "当前设备不支持分享 PDF 文件。",
        uri: rawUri,
      };
    }

    const shareUri = await resolveShareablePdfUri(rawUri, base64);
    await Sharing.shareAsync(shareUri, {
      mimeType: "application/pdf",
      dialogTitle: `${itinerary.title} · 行程 PDF`,
      UTI: "com.adobe.pdf",
    });

    return {
      status: "shared",
      detail: "行程 PDF 已生成，可通过系统分享面板保存或发送。",
      uri: shareUri,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "PDF 导出失败";
    const dismissed =
      /cancel|dismiss|abort|user did not share|E_SHARE_CANCELLED/i.test(message) ||
      message.includes("User did not share");
    if (dismissed) {
      return {
        status: "shared",
        detail: "已取消分享。",
      };
    }
    return {
      status: "failed",
      detail: message,
    };
  }
}
