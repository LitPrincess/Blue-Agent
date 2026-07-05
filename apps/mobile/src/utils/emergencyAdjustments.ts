import { Ionicons } from "@expo/vector-icons";

export type EmergencyKind =
  | "flight_delay"
  | "weather_change"
  | "schedule_change"
  | "oversleep"
  | "traffic_disruption"
  | "venue_issue"
  | "hotel_issue"
  | "personal_delay"
  | "other";

export type EmergencyCategory = {
  id: EmergencyKind;
  label: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  placeholder: string;
};

export const EMERGENCY_CATEGORIES: EmergencyCategory[] = [
  {
    id: "flight_delay",
    label: "航班/高铁延误",
    hint: "交通晚点，顺延后续节点",
    icon: "airplane-outline",
    color: "#1B6FFF",
    placeholder: "例如：高铁晚点 40 分钟，需改午餐时间",
  },
  {
    id: "weather_change",
    label: "天气变化",
    hint: "雨雪/高温，改户外安排",
    icon: "rainy-outline",
    color: "#00C9B1",
    placeholder: "例如：下午大雨，西栅改室内",
  },
  {
    id: "schedule_change",
    label: "会议/通知改期",
    hint: "官方通知或会议时间变更",
    icon: "calendar-outline",
    color: "#8B5CF6",
    placeholder: "例如：会议改到 15:00，上午可压缩",
  },
  {
    id: "oversleep",
    label: "睡过头",
    hint: "起床晚，上午整体后移",
    icon: "alarm-outline",
    color: "#F59E0B",
    placeholder: "例如：晚起 1 小时，上午景点可删减",
  },
  {
    id: "traffic_disruption",
    label: "路况/封路",
    hint: "拥堵封路，增加缓冲",
    icon: "car-outline",
    color: "#FF6633",
    placeholder: "例如：进城路段封路，预计多 30 分钟",
  },
  {
    id: "venue_issue",
    label: "景点/餐厅不可用",
    hint: "闭馆满座，替换备选",
    icon: "restaurant-outline",
    color: "#22C55E",
    placeholder: "例如：餐厅没位，换同区域备选",
  },
  {
    id: "hotel_issue",
    label: "酒店变更",
    hint: "满房换店或入住推迟",
    icon: "bed-outline",
    color: "#6366F1",
    placeholder: "例如：原酒店满房，改住景区附近",
  },
  {
    id: "personal_delay",
    label: "个人临时延误",
    hint: "排队安检等导致超时",
    icon: "time-outline",
    color: "#EC4899",
    placeholder: "例如：安检排队 25 分钟，后面都要后移",
  },
  {
    id: "other",
    label: "其他突发",
    hint: "自定义描述，AI 局部调整",
    icon: "ellipsis-horizontal-circle-outline",
    color: "#6B7A99",
    placeholder: "描述突发情况，AI 将局部修改受影响节点",
  },
];

export function emergencyCategoryById(kind: EmergencyKind) {
  return EMERGENCY_CATEGORIES.find((item) => item.id === kind) ?? EMERGENCY_CATEGORIES[EMERGENCY_CATEGORIES.length - 1];
}
