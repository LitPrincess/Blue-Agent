import { ItineraryItem } from "../types";

export type NodeKind = "hard_anchor" | "semi_anchor" | "soft_task";

export function resolveNodeType(item: ItineraryItem): NodeKind {
  if (item.node_type === "hard_anchor" || item.node_type === "semi_anchor" || item.node_type === "soft_task") {
    return item.node_type;
  }
  if (item.category === "transport" || item.category === "meeting" || item.category === "hotel") {
    return "hard_anchor";
  }
  if (item.category === "food" || item.category === "sight") {
    return "semi_anchor";
  }
  return "soft_task";
}

export function isEditableNode(item: ItineraryItem) {
  if (item.editable === false) return false;
  return resolveNodeType(item) !== "hard_anchor";
}

export const TIME_SLOTS = ["08:30", "11:30", "14:00", "16:30", "19:00"];

export function slotFromY(y: number, boardHeight: number) {
  const index = Math.max(0, Math.min(TIME_SLOTS.length - 1, Math.floor((y / boardHeight) * TIME_SLOTS.length)));
  return TIME_SLOTS[index];
}

export const nodeVisual = {
  hard_anchor: {
    label: "硬锚点",
    icon: "🔒",
    fill: "#FFFFFF",
    border: "#287CFF",
    glow: "rgba(40,124,255,0.18)",
  },
  semi_anchor: {
    label: "半硬锚点",
    icon: "◆",
    fill: "rgba(255,255,255,0.92)",
    border: "#17BFD1",
    glow: "rgba(23,191,209,0.16)",
  },
  soft_task: {
    label: "软任务",
    icon: "◎",
    fill: "rgba(255,255,255,0.72)",
    border: "#89B8FF",
    glow: "rgba(137,184,255,0.22)",
  },
} as const;
