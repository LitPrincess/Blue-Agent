import { ItineraryItem } from "../types";
import { sortItineraryItems } from "./amapNavigation";

function itemStartDateTime(startDate: string, item: ItineraryItem) {
  const [year, month, date] = startDate.split("-").map((value) => Number.parseInt(value, 10));
  const [hour, minute] = item.start_time.split(":").map((value) => Number.parseInt(value, 10));
  if ([year, month, date, hour, minute].some((value) => Number.isNaN(value))) return null;
  const result = new Date(year, month - 1, date + Math.max(0, item.day - 1), hour, minute, 0, 0);
  return Number.isNaN(result.getTime()) ? null : result;
}

export function resolveNextWidgetItem(items: ItineraryItem[], startDate?: string | null) {
  const sorted = sortItineraryItems(items).filter((item) => item.category !== "alert");
  if (!sorted.length) return null;
  if (!startDate) return sorted[0];
  const now = new Date();
  return (
    sorted.find((item) => {
      const startsAt = itemStartDateTime(startDate, item);
      return startsAt ? startsAt >= now : false;
    }) ?? sorted[0]
  );
}
