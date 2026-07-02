import { Pressable, View, Text, StyleSheet } from "react-native";

import { ItineraryItem } from "../types";
import { nodeVisual, resolveNodeType } from "../utils/nodeUtils";

const categoryLabel: Record<ItineraryItem["category"], string> = {
  transport: "交通",
  meeting: "会议",
  food: "餐饮",
  sight: "景点",
  hotel: "住宿",
  free: "弹性",
  alert: "提醒",
};

export function ItineraryCard({ item, onEdit }: { item: ItineraryItem; onEdit?: (item: ItineraryItem) => void }) {
  const kind = resolveNodeType(item);
  const visual = nodeVisual[kind] ?? nodeVisual.soft_task;

  return (
    <Pressable style={[styles.card, { borderColor: visual.border }]} onPress={() => onEdit?.(item)}>
      <View style={[styles.taskTime, { backgroundColor: visual.border }]}>
        <Text style={styles.day}>D{item.day}</Text>
        <Text style={styles.time}>{item.start_time}</Text>
      </View>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.badge}>{categoryLabel[item.category]}</Text>
        </View>
        <Text style={styles.nodeType}>
          {visual.icon} {visual.label} · 可编辑
        </Text>
        <Text style={styles.location}>{item.location}</Text>
        <Text style={styles.description}>{item.description}</Text>
        {item.risk_flags.length > 0 ? (
          <Text style={styles.risk}>{item.risk_flags.join(" · ")}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    gap: 10,
    padding: 10,
    borderRadius: 13,
    marginBottom: 8,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    shadowColor: "#4683C9",
    shadowOpacity: 0.1,
    shadowRadius: 16,
  },
  taskTime: {
    width: 48,
    minHeight: 46,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  day: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 10,
  },
  time: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "900",
    marginTop: 2,
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  title: {
    flex: 1,
    color: "#2A4266",
    fontSize: 12,
    fontWeight: "900",
  },
  badge: {
    color: "#287CFF",
    backgroundColor: "#EEF6FF",
    overflow: "hidden",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 9,
    fontWeight: "900",
  },
  nodeType: {
    marginTop: 4,
    color: "#527099",
    fontSize: 10,
    fontWeight: "900",
  },
  location: {
    color: "#287CFF",
    marginTop: 4,
    fontSize: 10,
    fontWeight: "900",
  },
  description: {
    color: "#7085A2",
    marginTop: 4,
    lineHeight: 16,
    fontSize: 11,
    fontWeight: "800",
  },
  risk: {
    color: "#F97316",
    marginTop: 6,
    fontSize: 10,
    fontWeight: "900",
  },
});
