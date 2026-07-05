import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { ItineraryItem } from "../types";
import { TIME_SLOTS } from "../utils/nodeUtils";

export type NodeEditDraft = {
  id: string;
  title: string;
  start_time: string;
  end_time?: string;
  location: string;
  category?: ItineraryItem["category"];
  day?: number;
};

type Props = {
  visible: boolean;
  mode?: "edit" | "add";
  draft: NodeEditDraft | null;
  dateLabel?: string;
  itemCategory?: ItineraryItem["category"];
  saving?: boolean;
  onChange: (draft: NodeEditDraft) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete?: () => void;
  onNavigate?: () => void;
  onPickFood?: () => void;
  onPickHotel?: () => void;
  onPickSight?: () => void;
  onAddAfter?: () => void;
};

const ADD_CATEGORIES: Array<{ id: ItineraryItem["category"]; label: string }> = [
  { id: "food", label: "餐饮" },
  { id: "sight", label: "景点" },
  { id: "free", label: "弹性活动" },
  { id: "hotel", label: "住宿" },
];

export function NodeEditModal({
  visible,
  mode = "edit",
  draft,
  dateLabel,
  itemCategory,
  saving,
  onChange,
  onClose,
  onSave,
  onDelete,
  onNavigate,
  onPickFood,
  onPickHotel,
  onPickSight,
  onAddAfter,
}: Props) {
  if (!draft) return null;

  const isAdd = mode === "add";
  const showPick = !isAdd && Boolean(onPickFood || onPickHotel || onPickSight);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{isAdd ? "添加节点" : "编辑节点"}</Text>
            {!isAdd && onNavigate ? (
              <Pressable style={styles.navigateBtn} onPress={onNavigate} disabled={saving}>
                <Text style={styles.navigateText}>导航</Text>
              </Pressable>
            ) : null}
          </View>
          {dateLabel ? <Text style={styles.dateBadge}>{dateLabel}</Text> : null}

          {isAdd ? (
            <>
              <Text style={styles.label}>节点类型</Text>
              <View style={styles.categoryRow}>
                {ADD_CATEGORIES.map((entry) => {
                  const active = (draft.category ?? "free") === entry.id;
                  return (
                    <Pressable
                      key={entry.id}
                      style={[styles.categoryChip, active ? styles.categoryChipActive : null]}
                      onPress={() => onChange({ ...draft, category: entry.id })}
                    >
                      <Text style={[styles.categoryChipText, active ? styles.categoryChipTextActive : null]}>
                        {entry.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          <Text style={styles.label}>标题</Text>
          <TextInput
            style={styles.input}
            value={draft.title}
            onChangeText={(value) => onChange({ ...draft, title: value })}
            placeholder={isAdd ? "例如：西栅手作体验" : undefined}
          />
          <Text style={styles.label}>开始时间</Text>
          <TextInput
            style={styles.input}
            value={draft.start_time}
            onChangeText={(value) => onChange({ ...draft, start_time: value })}
            placeholder="例如 09:30"
          />
          <View style={styles.slotRow}>
            {TIME_SLOTS.map((slot) => (
              <Pressable
                key={slot}
                style={[styles.slotChip, draft.start_time === slot ? styles.slotChipActive : null]}
                onPress={() => onChange({ ...draft, start_time: slot })}
              >
                <Text style={[styles.slotText, draft.start_time === slot ? styles.slotTextActive : null]}>{slot}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.label}>地点</Text>
          <TextInput
            style={styles.input}
            value={draft.location}
            onChangeText={(value) => onChange({ ...draft, location: value })}
          />

          {showPick ? (
            <View style={styles.pickSection}>
              <Text style={styles.pickLabel}>替换为具体商户（会更新整个行程）</Text>
              <View style={styles.pickRow}>
                {onPickFood ? (
                  <Pressable style={[styles.pickBtn, styles.pickBtnFood]} onPress={onPickFood} disabled={saving}>
                    <Text style={styles.pickBtnTextFood}>美食选择</Text>
                  </Pressable>
                ) : null}
                {onPickHotel ? (
                  <Pressable style={[styles.pickBtn, styles.pickBtnHotel]} onPress={onPickHotel} disabled={saving}>
                    <Text style={styles.pickBtnTextHotel}>酒店选择</Text>
                  </Pressable>
                ) : null}
                {onPickSight ? (
                  <Pressable style={[styles.pickBtn, styles.pickBtnSight]} onPress={onPickSight} disabled={saving}>
                    <Text style={styles.pickBtnTextSight}>景点选择</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : null}

          <Text style={styles.hint}>
            {isAdd
              ? "添加后 Agent 将联动调整相邻节点时间。"
              : "保存后 Agent 将联动调整相关节点的时间与安排。"}
          </Text>

          {!isAdd && onAddAfter ? (
            <Pressable style={styles.addAfterBtn} onPress={onAddAfter} disabled={saving}>
              <Text style={styles.addAfterText}>在此节点后添加</Text>
            </Pressable>
          ) : null}

          <View style={styles.actions}>
            {!isAdd && onDelete ? (
              <Pressable style={styles.delete} onPress={onDelete} disabled={saving}>
                <Text style={styles.deleteText}>删除</Text>
              </Pressable>
            ) : null}
            <View style={styles.actionRight}>
              <Pressable style={styles.cancel} onPress={onClose} disabled={saving}>
                <Text style={styles.cancelText}>取消</Text>
              </Pressable>
              <Pressable style={[styles.save, saving ? styles.saveDisabled : null]} disabled={saving} onPress={onSave}>
                <Text style={styles.saveText}>{saving ? "保存中…" : isAdd ? "添加" : "保存"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function draftFromItem(item: ItineraryItem): NodeEditDraft {
  return {
    id: item.id,
    title: item.title,
    start_time: item.start_time,
    end_time: item.end_time,
    location: item.location,
    category: item.category,
    day: item.day,
  };
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(35,59,99,0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 20,
    padding: 16,
    backgroundColor: "#FFFFFF",
  },
  title: { color: "#233B63", fontSize: 16, fontWeight: "900" },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12 },
  navigateBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#EAF4FF",
  },
  navigateText: { color: "#287CFF", fontSize: 11, fontWeight: "900" },
  dateBadge: {
    alignSelf: "flex-start",
    marginBottom: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#EEF6FF",
    color: "#287CFF",
    fontSize: 10,
    fontWeight: "900",
  },
  label: { color: "#7085A2", fontSize: 10, fontWeight: "900", marginTop: 8, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#D7E8FF",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#30496F",
    fontSize: 13,
    fontWeight: "700",
    backgroundColor: "#FAFDFF",
  },
  categoryRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  categoryChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#EEF6FF",
  },
  categoryChipActive: { backgroundColor: "#287CFF" },
  categoryChipText: { color: "#527099", fontSize: 10, fontWeight: "900" },
  categoryChipTextActive: { color: "#FFFFFF" },
  slotRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  slotChip: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#EEF6FF",
  },
  slotChipActive: { backgroundColor: "#287CFF" },
  slotText: { color: "#527099", fontSize: 9, fontWeight: "900" },
  slotTextActive: { color: "#FFFFFF" },
  pickSection: { marginTop: 10, gap: 6 },
  pickLabel: { color: "#6B7A99", fontSize: 10, fontWeight: "800" },
  pickRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pickBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
  },
  pickBtnFood: { backgroundColor: "#E8FFF3" },
  pickBtnHotel: { backgroundColor: "#F3E8FF" },
  pickBtnSight: { backgroundColor: "#FFF4E8" },
  pickBtnTextFood: { color: "#1A9D5C", fontSize: 10, fontWeight: "900" },
  pickBtnTextHotel: { color: "#8B5CF6", fontSize: 10, fontWeight: "900" },
  pickBtnTextSight: { color: "#F59E0B", fontSize: 10, fontWeight: "900" },
  hint: { marginTop: 10, color: "#8BA0BD", fontSize: 10, lineHeight: 15 },
  addAfterBtn: {
    marginTop: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#F0F7FF",
  },
  addAfterText: { color: "#1B6FFF", fontSize: 10, fontWeight: "900" },
  actions: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 16 },
  actionRight: { flexDirection: "row", gap: 10, marginLeft: "auto" },
  delete: {
    minWidth: 56,
    minHeight: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF1F0",
  },
  deleteText: { color: "#E55353", fontSize: 13, fontWeight: "900" },
  cancel: {
    minWidth: 72,
    minHeight: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF6FF",
  },
  cancelText: { color: "#527099", fontSize: 13, fontWeight: "900" },
  save: {
    minWidth: 88,
    minHeight: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1B63FF",
  },
  saveDisabled: { opacity: 0.6 },
  saveText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
});
