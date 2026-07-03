export type PreferenceOption = {
  id: string;
  label: string;
  icon?: string;
};

export type TravelPreferences = {
  companions: string;
  styles: string[];
  pace: string;
  accommodation: string;
  schedules: string[];
  notes: string;
};

export const COMPANION_OPTIONS: PreferenceOption[] = [
  { id: "solo", label: "独自出行", icon: "🧳" },
  { id: "family", label: "家庭出行", icon: "👨‍👩‍👧" },
  { id: "couple", label: "情侣出行", icon: "💑" },
  { id: "friends", label: "朋友出行", icon: "👥" },
  { id: "elderly", label: "老人同行", icon: "👴" },
];

export const STYLE_OPTIONS: PreferenceOption[] = [
  { id: "culture", label: "文化体验", icon: "🏛️" },
  { id: "classic", label: "经典必去", icon: "⭐" },
  { id: "nature", label: "自然风光", icon: "🏔️" },
  { id: "cityscape", label: "城市景观", icon: "🌆" },
  { id: "heritage", label: "历史古迹", icon: "🏯" },
];

export const PACE_OPTIONS: PreferenceOption[] = [
  { id: "compact", label: "紧凑", icon: "⚡" },
  { id: "moderate", label: "适中", icon: "🚶" },
  { id: "relaxed", label: "宽松", icon: "🌴" },
];

export const ACCOMMODATION_OPTIONS: PreferenceOption[] = [
  { id: "comfort", label: "舒适型", icon: "🛏️" },
  { id: "upscale", label: "高档型", icon: "🏨" },
  { id: "luxury", label: "豪华型", icon: "✨" },
];

export const SCHEDULE_OPTIONS: PreferenceOption[] = [
  { id: "early", label: "偏早出", icon: "🌅" },
  { id: "late", label: "偏晚归", icon: "🌙" },
];

export const NOTES_MAX_LENGTH = 1000;

export function defaultTravelPreferences(): TravelPreferences {
  return {
    companions: "solo",
    styles: [],
    pace: "moderate",
    accommodation: "comfort",
    schedules: [],
    notes: "",
  };
}

function labelOf(options: PreferenceOption[], id: string) {
  return options.find((item) => item.id === id)?.label ?? id;
}

export function serializeTravelPreferences(prefs: TravelPreferences): string {
  const parts: string[] = [
    `同行：${labelOf(COMPANION_OPTIONS, prefs.companions)}`,
    `节奏：${labelOf(PACE_OPTIONS, prefs.pace)}`,
    `住宿：${labelOf(ACCOMMODATION_OPTIONS, prefs.accommodation)}`,
  ];
  if (prefs.styles.length) {
    parts.push(`风格：${prefs.styles.map((id) => labelOf(STYLE_OPTIONS, id)).join("、")}`);
  }
  if (prefs.schedules.length) {
    parts.push(`时间：${prefs.schedules.map((id) => labelOf(SCHEDULE_OPTIONS, id)).join("、")}`);
  }
  if (prefs.notes.trim()) {
    parts.push(prefs.notes.trim());
  }
  return parts.join("；");
}

export function preferencesToTags(prefs: TravelPreferences): string[] {
  const tags: string[] = [];
  const companion = labelOf(COMPANION_OPTIONS, prefs.companions);
  if (companion === "独自出行") tags.push("旅游");
  if (companion === "家庭出行") tags.push("家庭游");
  if (companion === "情侣出行") tags.push("情侣游");
  if (companion === "朋友出行") tags.push("朋友游");
  if (labelOf(PACE_OPTIONS, prefs.pace) === "宽松") tags.push("少走路");
  return tags;
}

export function preferencesToApiList(prefs: TravelPreferences): string[] {
  const list = [
    labelOf(COMPANION_OPTIONS, prefs.companions),
    labelOf(PACE_OPTIONS, prefs.pace),
    labelOf(ACCOMMODATION_OPTIONS, prefs.accommodation),
    ...prefs.styles.map((id) => labelOf(STYLE_OPTIONS, id)),
    ...prefs.schedules.map((id) => labelOf(SCHEDULE_OPTIONS, id)),
  ];
  if (prefs.notes.trim()) list.push(prefs.notes.trim());
  return list.filter(Boolean);
}

export function countPreferenceSelections(prefs: TravelPreferences): number {
  let count = 3;
  count += prefs.styles.length;
  count += prefs.schedules.length;
  if (prefs.notes.trim()) count += 1;
  return count;
}

export function preferenceSummary(prefs: TravelPreferences): string {
  const chips = [
    labelOf(COMPANION_OPTIONS, prefs.companions),
    labelOf(PACE_OPTIONS, prefs.pace),
    ...prefs.styles.slice(0, 2).map((id) => labelOf(STYLE_OPTIONS, id)),
  ].filter(Boolean);
  return chips.join(" · ");
}
