import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { BluemapTheme as theme } from "../theme/bluemapTheme";

type Props = {
  visible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

const ITEMS = [
  { title: "日历", detail: "写入/读取行程节点，便于系统日程查看" },
  { title: "备忘录", detail: "保存行程摘要（iPhone 写入提醒事项，Android 写入备忘日历）" },
  { title: "通知", detail: "创建出发提醒与通知栏行程卡" },
];

export function PermissionPrimerModal({ visible, onConfirm, onCancel }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>同步到系统前说明</Text>
          <Text style={styles.subtitle}>首次同步时系统会弹出授权窗口，请选择「允许」。</Text>
          <View style={styles.list}>
            {ITEMS.map((item) => (
              <View key={item.title} style={styles.row}>
                <Text style={styles.rowTitle}>{item.title}</Text>
                <Text style={styles.rowDetail}>{item.detail}</Text>
              </View>
            ))}
          </View>
          <Pressable style={styles.primaryBtn} onPress={onConfirm}>
            <Text style={styles.primaryText}>我知道了，开始同步</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={onCancel}>
            <Text style={styles.secondaryText}>稍后再说</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15,27,53,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    padding: 20,
    gap: 12,
  },
  title: { color: theme.colors.textPrimary, fontSize: 18, fontWeight: "900", textAlign: "center" },
  subtitle: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: "center" },
  list: { gap: 10, marginTop: 4 },
  row: {
    borderRadius: 12,
    backgroundColor: theme.colors.bgInput,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  rowTitle: { color: theme.colors.textPrimary, fontSize: 13, fontWeight: "900" },
  rowDetail: { color: theme.colors.textMuted, fontSize: 11, lineHeight: 16 },
  primaryBtn: {
    marginTop: 6,
    borderRadius: 999,
    backgroundColor: theme.colors.primary,
    paddingVertical: 13,
    alignItems: "center",
  },
  primaryText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  secondaryBtn: { alignItems: "center", paddingVertical: 8 },
  secondaryText: { color: theme.colors.textMuted, fontSize: 13, fontWeight: "800" },
});
