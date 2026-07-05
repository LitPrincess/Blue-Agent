import { View, Text, StyleSheet } from "react-native";

import { GlassCard } from "./ui/GlassCard";
import { BluemapTheme as theme } from "../theme/bluemapTheme";

export function AgentStatus({ loading, subtitle }: { loading: boolean; subtitle: string }) {
  return (
    <GlassCard style={styles.outer} padded>
      <View style={styles.container}>
        <View style={styles.bot}>
          <Text style={styles.botText}>✧</Text>
        </View>
        <View style={styles.textBlock}>
          <Text style={styles.title} numberOfLines={1}>
            {loading ? "蓝图正在理解..." : "蓝图 Agent 待命"}
          </Text>
          <Text style={styles.subtitle} numberOfLines={2}>
            {loading ? "解析时间、地点、偏好与附件上下文" : subtitle}
          </Text>
        </View>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  outer: {
    marginTop: theme.spacing.md,
    marginHorizontal: theme.spacing.sm,
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
  },
  bot: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primaryDeep,
    alignItems: "center",
    justifyContent: "center",
  },
  botText: {
    color: theme.colors.textOnPrimary,
    fontWeight: theme.typography.weightBlack,
  },
  textBlock: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: theme.colors.textPrimary,
    fontWeight: theme.typography.weightBlack,
    fontSize: 13,
  },
  subtitle: {
    color: theme.colors.textMuted,
    marginTop: 3,
    fontSize: 11,
    fontWeight: theme.typography.weightBold,
  },
});
