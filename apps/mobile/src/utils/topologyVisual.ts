import { Ionicons } from "@expo/vector-icons";

import { ItineraryItem } from "../types";

export type CategoryVisual = {
  icon: keyof typeof Ionicons.glyphMap;
  border: string;
  fill: string;
  iconColor: string;
};

const categoryMap: Record<ItineraryItem["category"], CategoryVisual> = {
  transport: { icon: "airplane", border: "#1B6FFF", fill: "#EEF4FF", iconColor: "#1B6FFF" },
  hotel: { icon: "bed", border: "#1B6FFF", fill: "#EEF4FF", iconColor: "#1B6FFF" },
  meeting: { icon: "calendar", border: "#1B6FFF", fill: "#EEF4FF", iconColor: "#1B6FFF" },
  food: { icon: "restaurant", border: "#8B5CF6", fill: "#F5F0FF", iconColor: "#8B5CF6" },
  sight: { icon: "camera", border: "#22C55E", fill: "#F0FDF9", iconColor: "#22C55E" },
  free: { icon: "ellipse-outline", border: "#89B8FF", fill: "#F7FAFF", iconColor: "#5B95FF" },
  alert: { icon: "warning", border: "#F59E0B", fill: "#FFF8EC", iconColor: "#F59E0B" },
};

export const dayPalette = ["#1B6FFF", "#22C55E", "#8B5CF6", "#F59E0B", "#00C9B1"];

export function categoryVisualForItem(item: ItineraryItem): CategoryVisual {
  return categoryMap[item.category] ?? categoryMap.free;
}

export function categoryEmojiForItem(item: ItineraryItem) {
  const emoji: Record<ItineraryItem["category"], string> = {
    transport: "✈️",
    hotel: "🏨",
    meeting: "📅",
    food: "🍽",
    sight: "📷",
    free: "◎",
    alert: "⚠️",
  };
  return emoji[item.category] ?? "📍";
}

export function transportLabelForSegment(from: ItineraryItem, to: ItineraryItem) {
  const text = `${from.title} ${from.description} ${to.title} ${to.description}`;
  if (/步行|walk/i.test(text)) return "步";
  if (/地铁|metro|轻轨/i.test(text)) return "地";
  if (/公交|bus/i.test(text)) return "公";
  if (/高铁|动车|火车|列车|flight|航班|飞机/i.test(text)) return "铁";
  return "车";
}

export function segmentHasRisk(from: ItineraryItem, to: ItineraryItem) {
  return from.risk_flags.length > 0 || to.risk_flags.length > 0;
}
