import { View, Text, StyleSheet } from "react-native";

export function AgentStatus({ loading, subtitle }: { loading: boolean; subtitle: string }) {
  return (
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
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 12,
    marginHorizontal: 8,
    padding: 12,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.9)",
    shadowColor: "#4683C9",
    shadowOpacity: 0.16,
    shadowRadius: 26,
  },
  bot: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: "#1978FF",
    alignItems: "center",
    justifyContent: "center",
  },
  botText: {
    color: "white",
    fontWeight: "900",
  },
  textBlock: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: "#233B63",
    fontWeight: "900",
    fontSize: 13,
  },
  subtitle: {
    color: "#8BA0BD",
    marginTop: 3,
    fontSize: 11,
    fontWeight: "800",
  },
});
