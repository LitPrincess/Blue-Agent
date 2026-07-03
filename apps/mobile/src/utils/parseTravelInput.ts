import type { TravelPreferences } from "./travelPreferences";
import { serializeTravelPreferences } from "./travelPreferences";

export type StructuredFields = {
  origin: string;
  destination: string;
  startDate: string;
  endDate: string;
  preferences: string;
};

export type ParsedTravelHints = {
  origin?: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
  preferences?: string;
  tags: string[];
  vehicles: string[];
};

const CITIES = ["北京", "上海", "广州", "深圳", "成都", "杭州", "西安", "南京", "重庆", "苏州", "云南", "故宫"];

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

export function toIsoDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDaysIso(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

export function resolveRelativeStartDate(text: string, reference = new Date()) {
  const ref = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());

  if (/大后天/.test(text)) {
    ref.setDate(ref.getDate() + 3);
    return toIsoDate(ref);
  }
  if (/后天/.test(text)) {
    ref.setDate(ref.getDate() + 2);
    return toIsoDate(ref);
  }
  if (/明天/.test(text)) {
    ref.setDate(ref.getDate() + 1);
    return toIsoDate(ref);
  }
  if (/今天|今日/.test(text)) {
    return toIsoDate(ref);
  }
  if (/下周五/.test(text)) return nextFridayIso();

  const nextWeekMatch = text.match(/下周([一二三四五六日天])/);
  if (nextWeekMatch) {
    return toIsoDate(resolveWeekday(ref, nextWeekMatch[1], true));
  }

  const thisWeekMatch = text.match(/(?:这|本)周([一二三四五六日天])/);
  if (thisWeekMatch) {
    return toIsoDate(resolveWeekday(ref, thisWeekMatch[1], false));
  }

  const isoMatch = text.match(/(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${pad(Number(isoMatch[2]))}-${pad(Number(isoMatch[3]))}`;
  }

  const mdMatch = text.match(/(\d{1,2})月(\d{1,2})日/);
  if (mdMatch) {
    const month = Number(mdMatch[1]);
    const day = Number(mdMatch[2]);
    let year = ref.getFullYear();
    const candidate = new Date(year, month - 1, day);
    if (candidate < ref) year += 1;
    return toIsoDate(new Date(year, month - 1, day));
  }

  if (/下周五/.test(text)) return nextFridayIso();
  return undefined;
}

export function nextFridayIso() {
  const date = new Date();
  const offset = (5 - date.getDay() + 7) % 7 || 7;
  date.setDate(date.getDate() + offset);
  return toIsoDate(date);
}

function resolveWeekday(reference: Date, token: string, nextWeek: boolean) {
  const map: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };
  const weekday = map[token] ?? 5;

  if (nextWeek) {
    const daysToNextMonday = ((1 - reference.getDay() + 7) % 7) || 7;
    const date = new Date(reference);
    date.setDate(date.getDate() + daysToNextMonday);
    const offsetFromMonday = weekday === 0 ? 6 : weekday - 1;
    date.setDate(date.getDate() + offsetFromMonday);
    return date;
  }

  const date = new Date(reference);
  let delta = (weekday - date.getDay() + 7) % 7;
  if (delta === 0) delta = 7;
  date.setDate(date.getDate() + delta);
  return date;
}

export function formatDisplayDate(iso: string) {
  if (!iso) return "选择日期";
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  const week = ["日", "一", "二", "三", "四", "五", "六"][date.getDay()];
  return `${date.getMonth() + 1}月${date.getDate()}日 周${week}`;
}

export function parseTravelFromText(text: string): ParsedTravelHints {
  const tags: string[] = [];
  const vehicles: string[] = [];

  if (/出差|商务/.test(text)) tags.push("出差");
  if (/旅游|游玩/.test(text)) tags.push("旅游");
  if (/周末/.test(text)) tags.push("周末游");
  if (/飞机|航班|坐飞机/.test(text)) vehicles.push("飞机");
  if (/高铁|火车/.test(text)) vehicles.push("高铁");
  if (/打车|出租/.test(text)) vehicles.push("打车");
  if (/少走路|轻松|不要太累/.test(text)) tags.push("少走路");

  const prefs: string[] = [];
  if (/烤鸭|美食|吃/.test(text)) prefs.push("美食");
  if (/故宫|景点|博物馆|游玩/.test(text)) prefs.push("景点");
  if (/文化|胡同/.test(text)) prefs.push("文化体验");

  let origin: string | undefined;
  let destination: string | undefined;

  const fromMatch = text.match(/从(.{1,6}?)(?:出发|去|到)/);
  if (fromMatch) origin = fromMatch[1].replace(/市/g, "");

  for (const city of CITIES) {
    if (text.includes(`去${city}`) || text.includes(`到${city}`) || text.includes(`${city}出差`)) {
      destination = city;
      break;
    }
  }
  if (!destination) {
    destination = CITIES.find((city) => text.includes(city) && city !== origin);
  }

  let startDate = resolveRelativeStartDate(text);
  const durationMatch = text.match(/(\d+)\s*[天日]/);
  const endDate = startDate && durationMatch ? addDaysIso(startDate, Number(durationMatch[1]) - 1) : undefined;

  return {
    origin,
    destination,
    startDate,
    endDate,
    preferences: prefs.length ? prefs.join(" / ") : undefined,
    tags,
    vehicles,
  };
}

export function defaultStructured(): StructuredFields {
  const startDate = nextFridayIso();
  return {
    origin: "",
    destination: "",
    startDate,
    endDate: addDaysIso(startDate, 2),
    preferences: "",
  };
}

export function resolvePickerDate(iso: string, fallbackIso?: string) {
  const candidate = iso || fallbackIso || nextFridayIso();
  const date = new Date(`${candidate}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return new Date(`${nextFridayIso()}T12:00:00`);
  }
  return date;
}

export function todayDate() {
  return new Date();
}

export function mergeStructured(
  current: StructuredFields,
  hints: ParsedTravelHints,
  touched: Record<keyof StructuredFields, boolean>,
): StructuredFields {
  return {
    origin: touched.origin ? current.origin : hints.origin ?? current.origin,
    destination: touched.destination ? current.destination : hints.destination ?? current.destination,
    startDate: touched.startDate ? current.startDate : hints.startDate ?? current.startDate,
    endDate: touched.endDate ? current.endDate : hints.endDate ?? current.endDate,
    preferences: touched.preferences ? current.preferences : hints.preferences ?? current.preferences,
  };
}

export function mergeStructuredFromApi(current: StructuredFields, api: Partial<StructuredFields>, touched: Record<keyof StructuredFields, boolean>) {
  return {
    origin: touched.origin ? current.origin : api.origin || current.origin,
    destination: touched.destination ? current.destination : api.destination || current.destination,
    startDate: touched.startDate ? current.startDate : api.startDate || current.startDate,
    endDate: touched.endDate ? current.endDate : api.endDate || current.endDate,
    preferences: touched.preferences ? current.preferences : api.preferences || current.preferences,
  };
}

export function hasTravelInput(message: string, structured: StructuredFields) {
  return message.trim().length > 0 || Boolean(structured.origin.trim() && structured.destination.trim());
}

export function buildEffectiveMessage(
  message: string,
  structured: StructuredFields,
  tags: string[] = [],
  travelPreferences?: TravelPreferences,
) {
  if (message.trim()) return message.trim();
  if (!structured.origin.trim() || !structured.destination.trim()) return "";
  const tagText = tags.length ? `，标签：${tags.join("、")}` : "";
  const prefText = structured.preferences.trim()
    ? `，偏好：${structured.preferences}`
    : travelPreferences
      ? `，偏好：${serializeTravelPreferences(travelPreferences)}`
      : "";
  return `从${structured.origin}去${structured.destination}，${formatDisplayDate(structured.startDate)}到${formatDisplayDate(structured.endDate)}出行${tagText}${prefText}`;
}
