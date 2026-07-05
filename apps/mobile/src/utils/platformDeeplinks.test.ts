import assert from "node:assert/strict";
import test from "node:test";

import {
  actionLabelForItem,
  buildPlatformSearchUrl,
  resolveBookingUrl,
} from "./platformDeeplinks";
import type { ItineraryItem } from "../types";

const sampleItem: ItineraryItem = {
  id: "1",
  day: 1,
  start_time: "12:00",
  end_time: "13:00",
  title: "外婆家",
  location: "西湖店",
  category: "food",
  description: "午餐",
  risk_flags: [],
};

test("buildPlatformSearchUrl encodes city and title for meituan", () => {
  const url = buildPlatformSearchUrl("meituan", sampleItem, "杭州");
  assert.match(url, /^imeituan:\/\/www\.meituan\.com\/search\?q=/);
  assert.match(decodeURIComponent(url), /杭州/);
  assert.match(decodeURIComponent(url), /外婆家/);
});

test("resolveBookingUrl falls back to platform search", () => {
  const url = resolveBookingUrl({ ...sampleItem, booking_deeplink: null }, "杭州");
  assert.match(url, /meituan/);
});

test("actionLabelForItem returns search label", () => {
  assert.equal(actionLabelForItem({ ...sampleItem, category: "hotel" }), "去携程搜索");
});
