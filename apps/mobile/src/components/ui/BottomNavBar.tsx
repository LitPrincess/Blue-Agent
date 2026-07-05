import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { BluemapTheme as theme } from "../../theme/bluemapTheme";

export type MainTab = 0 | 1 | 2 | 3;

const NAV_ITEMS: Array<{ label: string; icon: keyof typeof Ionicons.glyphMap; iconActive: keyof typeof Ionicons.glyphMap }> = [
  { label: "意图输入", icon: "chatbubble-ellipses-outline", iconActive: "chatbubble-ellipses" },
  { label: "时空拓扑", icon: "map-outline", iconActive: "map" },
  { label: "动态微调", icon: "refresh-outline", iconActive: "refresh" },
  { label: "跨端执行", icon: "flash-outline", iconActive: "flash" },
];

type Props = {
  current: MainTab;
  onChange: (tab: MainTab) => void;
  dark?: boolean;
};

export function BottomNavBar({ current, onChange, dark }: Props) {
  return (
    <View style={styles.bar}>
      {NAV_ITEMS.map((item, index) => {
        const active = current === index;
        const inactiveColor = dark ? "rgba(255,255,255,0.35)" : theme.colors.navInactive;
        const activeColor = dark ? theme.colors.accentCyan : theme.colors.primary;
        return (
          <Pressable key={item.label} style={styles.item} onPress={() => onChange(index as MainTab)}>
            <View style={[styles.iconWrap, active ? styles.iconWrapActive : null]}>
              <Ionicons
                name={active ? item.iconActive : item.icon}
                size={20}
                color={active ? activeColor : inactiveColor}
              />
            </View>
            <Text style={[styles.label, active ? { color: activeColor } : { color: inactiveColor }]}>{item.label}</Text>
            {active ? <View style={[styles.indicator, dark ? styles.indicatorDark : null]} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    paddingTop: 10,
    paddingBottom: 2,
  },
  item: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    paddingVertical: 2,
  },
  iconWrap: {
    transform: [{ scale: 1 }],
  },
  iconWrapActive: {
    transform: [{ scale: 1.1 }],
  },
  label: {
    fontSize: 9,
    fontWeight: theme.typography.weightMedium,
  },
  indicator: {
    width: 16,
    height: 2,
    borderRadius: 1,
    backgroundColor: theme.colors.primary,
    marginTop: 1,
  },
  indicatorDark: {
    backgroundColor: theme.colors.accentCyan,
  },
});
