import { useMemo, useRef, useState } from "react";
import { Alert, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";

import { Itinerary, ItineraryItem } from "../types";
import { isEditableNode, nodeVisual, resolveNodeType, slotFromY, TIME_SLOTS } from "../utils/nodeUtils";

type NodeLayout = {
  id: string;
  x: number;
  y: number;
};

type Props = {
  itinerary: Itinerary;
  onReschedule: (itemId: string, startTime: string) => Promise<void>;
};

const BOARD_HEIGHT = 360;
const BOARD_WIDTH = 320;

function defaultLayout(items: ItineraryItem[]): NodeLayout[] {
  const positions = [
    { x: 36, y: 36 },
    { x: 180, y: 86 },
    { x: 54, y: 164 },
    { x: 170, y: 235 },
    { x: 90, y: 292 },
  ];
  return items.slice(0, 5).map((item, index) => ({
    id: item.id,
    x: positions[index]?.x ?? 40,
    y: positions[index]?.y ?? 40 + index * 60,
  }));
}

export function TopologyBoard({ itinerary, onReschedule }: Props) {
  const items = itinerary.items.slice(0, 5);
  const [layouts, setLayouts] = useState<NodeLayout[]>(() => defaultLayout(items));
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragStart = useRef<Record<string, { x: number; y: number }>>({});

  const layoutMap = useMemo(() => Object.fromEntries(layouts.map((item) => [item.id, item])), [layouts]);

  function createPanResponder(item: ItineraryItem) {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => isEditableNode(item),
      onMoveShouldSetPanResponder: () => isEditableNode(item),
      onPanResponderGrant: () => {
        const current = layoutMap[item.id];
        dragStart.current[item.id] = { x: current?.x ?? 40, y: current?.y ?? 40 };
        setDraggingId(item.id);
      },
      onPanResponderMove: (_, gesture) => {
        const origin = dragStart.current[item.id];
        if (!origin) return;
        setLayouts((current) =>
          current.map((layout) =>
            layout.id === item.id
              ? {
                  ...layout,
                  x: Math.max(8, Math.min(BOARD_WIDTH - 110, origin.x + gesture.dx)),
                  y: Math.max(8, Math.min(BOARD_HEIGHT - 72, origin.y + gesture.dy)),
                }
              : layout,
          ),
        );
      },
      onPanResponderRelease: async (_, gesture) => {
        setDraggingId(null);
        const origin = dragStart.current[item.id];
        if (!origin) return;
        const nextY = Math.max(8, Math.min(BOARD_HEIGHT - 72, origin.y + gesture.dy));
        const nextTime = slotFromY(nextY, BOARD_HEIGHT);
        if (nextTime === item.start_time) return;
        try {
          await onReschedule(item.id, nextTime);
          Alert.alert("节点已重排", `《${item.title}》调整到 ${nextTime}`);
        } catch (error) {
          Alert.alert("重排失败", error instanceof Error ? error.message : "请稍后重试");
          setLayouts(defaultLayout(items));
        }
      },
    });
  }

  const responders = useMemo(
    () => Object.fromEntries(items.map((item) => [item.id, createPanResponder(item)])),
    [items, layoutMap],
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.legendRow}>
        {(Object.keys(nodeVisual) as Array<keyof typeof nodeVisual>).map((kind) => (
          <View key={kind} style={styles.legendItem}>
            <View style={[styles.legendDot, { borderColor: nodeVisual[kind].border, backgroundColor: nodeVisual[kind].fill }]} />
            <Text style={styles.legendText}>{nodeVisual[kind].label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.board}>
        {items.slice(0, items.length - 1).map((item, index) => {
          const from = layoutMap[item.id];
          const to = layoutMap[items[index + 1].id];
          if (!from || !to) return null;
          const left = Math.min(from.x, to.x) + 40;
          const top = Math.min(from.y, to.y) + 24;
          const width = Math.max(24, Math.abs(to.x - from.x));
          const height = Math.max(24, Math.abs(to.y - from.y));
          return (
            <View
              key={`${item.id}-link`}
              style={[
                styles.link,
                {
                  left,
                  top,
                  width,
                  height,
                  borderColor: draggingId ? "#89B8FF" : "#D7E8FF",
                },
              ]}
            />
          );
        })}

        {items.map((item) => {
          const layout = layoutMap[item.id] ?? { x: 40, y: 40 };
          const kind = resolveNodeType(item);
          const visual = nodeVisual[kind] ?? nodeVisual.soft_task;
          const editable = isEditableNode(item);
          const panHandlers = responders[item.id]?.panHandlers ?? {};

          return (
            <View
              key={item.id}
              {...panHandlers}
              style={[
                styles.node,
                {
                  left: layout.x,
                  top: layout.y,
                  backgroundColor: visual.fill,
                  borderColor: visual.border,
                  shadowColor: visual.border,
                  opacity: kind === "soft_task" ? 0.95 : 1,
                  transform: [{ scale: draggingId === item.id ? 1.04 : 1 }],
                },
              ]}
            >
              <View style={styles.nodeHead}>
                <Text style={styles.nodeIcon}>{visual.icon}</Text>
                <Text style={styles.nodeTime}>{item.start_time}</Text>
              </View>
              <Text style={styles.nodeTitle} numberOfLines={2}>
                {item.title}
              </Text>
              <Text style={styles.nodeLocation} numberOfLines={1}>
                {item.location}
              </Text>
              {editable ? <Text style={styles.dragHint}>按住拖动</Text> : <Text style={styles.lockHint}>已锁定</Text>}
            </View>
          );
        })}
      </View>

      <View style={styles.slotRow}>
        {TIME_SLOTS.map((slot) => (
          <Pressable key={slot} style={styles.slotChip}>
            <Text style={styles.slotText}>{slot}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.tip}>软任务/半硬锚点可拖动改时间；硬锚点（航班、会议、酒店）保持锁定。</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  legendRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  legendText: { color: "#7085A2", fontSize: 10, fontWeight: "900" },
  board: {
    position: "relative",
    height: BOARD_HEIGHT,
    borderRadius: 23,
    overflow: "hidden",
    backgroundColor: "rgba(250,253,255,0.95)",
  },
  link: {
    position: "absolute",
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderRadius: 12,
    backgroundColor: "rgba(215,232,255,0.18)",
  },
  node: {
    position: "absolute",
    width: 108,
    minHeight: 72,
    padding: 10,
    borderRadius: 14,
    borderWidth: 2,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  nodeHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  nodeIcon: { fontSize: 12 },
  nodeTime: { color: "#7F93B1", fontSize: 9, fontWeight: "900" },
  nodeTitle: { marginTop: 4, color: "#30496F", fontSize: 12, fontWeight: "900" },
  nodeLocation: { marginTop: 3, color: "#8BA0BD", fontSize: 9, fontWeight: "800" },
  dragHint: { marginTop: 6, color: "#287CFF", fontSize: 8, fontWeight: "900" },
  lockHint: { marginTop: 6, color: "#B2BFD0", fontSize: 8, fontWeight: "900" },
  slotRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  slotChip: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#EEF6FF",
  },
  slotText: { color: "#527099", fontSize: 9, fontWeight: "900" },
  tip: { color: "#8BA0BD", fontSize: 10, lineHeight: 15 },
});
