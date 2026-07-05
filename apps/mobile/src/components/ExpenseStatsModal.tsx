import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { ItineraryPriceQuote } from "../types";

export type ExpenseLine = {
  id: string;
  label: string;
  amount: number;
  category: "transport" | "food" | "hotel" | "other";
  removable: boolean;
};

type Props = {
  visible: boolean;
  quote: ItineraryPriceQuote | null;
  lines: ExpenseLine[];
  onChange: (lines: ExpenseLine[]) => void;
  onClose: () => void;
};

function inferCategory(text: string): ExpenseLine["category"] {
  if (/交通|出租|地铁|高铁|机票|flight|transport|火车|航班/.test(text)) return "transport";
  if (/餐|食|food|餐厅|用餐/.test(text)) return "food";
  if (/酒店|住宿|hotel|入住/.test(text)) return "hotel";
  return "other";
}

export function buildExpenseLinesFromQuote(quote: ItineraryPriceQuote): ExpenseLine[] {
  if (quote.breakdown.length) {
    return quote.breakdown.map((item, index) => ({
      id: `base-${index}`,
      label: item.label,
      amount: item.amount,
      category: inferCategory(`${item.label} ${item.source} ${item.detail}`),
      removable: true,
    }));
  }
  return [
    { id: "base-transport", label: "交通", amount: quote.transport, category: "transport" as const, removable: true },
    { id: "base-food", label: "餐饮", amount: quote.food, category: "food" as const, removable: true },
    { id: "base-hotel", label: "住宿", amount: quote.hotel, category: "hotel" as const, removable: true },
    { id: "base-other", label: "其他", amount: quote.other, category: "other" as const, removable: true },
  ].filter((line) => line.amount > 0);
}

export function summarizeExpenseLines(lines: ExpenseLine[]) {
  const totals = { transport: 0, food: 0, hotel: 0, other: 0, total: 0 };
  for (const line of lines) {
    totals[line.category] += line.amount;
    totals.total += line.amount;
  }
  return totals;
}

const CATEGORY_OPTIONS: Array<{ id: ExpenseLine["category"]; label: string }> = [
  { id: "transport", label: "交通" },
  { id: "food", label: "餐饮" },
  { id: "hotel", label: "住宿" },
  { id: "other", label: "其他" },
];

export function ExpenseStatsModal({ visible, quote, lines, onChange, onClose }: Props) {
  const [newLabel, setNewLabel] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newCategory, setNewCategory] = useState<ExpenseLine["category"]>("other");

  const totals = useMemo(() => summarizeExpenseLines(lines), [lines]);

  function handleAdd() {
    const amount = Number(newAmount);
    if (!newLabel.trim() || !Number.isFinite(amount) || amount <= 0) return;
    onChange([
      ...lines,
      {
        id: `custom-${Date.now()}`,
        label: newLabel.trim(),
        amount: Math.round(amount),
        category: newCategory,
        removable: true,
      },
    ]);
    setNewLabel("");
    setNewAmount("");
    setNewCategory("other");
  }

  function handleDelete(id: string) {
    onChange(lines.filter((line) => line.id !== id));
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>费用统计</Text>
            <Text style={styles.total}>¥{totals.total}</Text>
            <View style={styles.breakdownGrid}>
              <View style={styles.breakdownItem}>
                <Text style={styles.breakdownLabel}>交通</Text>
                <Text style={styles.breakdownValue}>¥{totals.transport}</Text>
              </View>
              <View style={styles.breakdownItem}>
                <Text style={styles.breakdownLabel}>餐饮</Text>
                <Text style={styles.breakdownValue}>¥{totals.food}</Text>
              </View>
              <View style={styles.breakdownItem}>
                <Text style={styles.breakdownLabel}>住宿</Text>
                <Text style={styles.breakdownValue}>¥{totals.hotel}</Text>
              </View>
              <View style={styles.breakdownItem}>
                <Text style={styles.breakdownLabel}>其他</Text>
                <Text style={styles.breakdownValue}>¥{totals.other}</Text>
              </View>
            </View>
            {quote?.duration_text ? <Text style={styles.duration}>市内交通 {quote.duration_text}</Text> : null}
          </View>

          <ScrollView style={styles.listScroll} contentContainerStyle={styles.listContent} nestedScrollEnabled>
            {lines.map((line) => (
              <View key={line.id} style={styles.row}>
                <View style={styles.rowBody}>
                  <Text style={styles.rowLabel} numberOfLines={2}>
                    {line.label}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {CATEGORY_OPTIONS.find((entry) => entry.id === line.category)?.label ?? "其他"}
                  </Text>
                </View>
                <Text style={styles.rowAmount}>¥{line.amount}</Text>
                {line.removable ? (
                  <Pressable style={styles.deleteBtn} onPress={() => handleDelete(line.id)}>
                    <Text style={styles.deleteText}>删</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
          </ScrollView>

          <View style={styles.addSection}>
            <Text style={styles.addTitle}>添加费用</Text>
            <View style={styles.addInputRow}>
              <TextInput
                style={[styles.input, styles.inputFlex]}
                value={newLabel}
                onChangeText={setNewLabel}
                placeholder="项目名称，如景区门票"
                placeholderTextColor="#A0B0CC"
              />
              <TextInput
                style={[styles.input, styles.inputAmount]}
                value={newAmount}
                onChangeText={setNewAmount}
                placeholder="金额"
                placeholderTextColor="#A0B0CC"
                keyboardType="numeric"
              />
            </View>
            <View style={styles.categoryRow}>
              {CATEGORY_OPTIONS.map((entry) => {
                const active = newCategory === entry.id;
                return (
                  <Pressable
                    key={entry.id}
                    style={[styles.categoryChip, active ? styles.categoryChipActive : null]}
                    onPress={() => setNewCategory(entry.id)}
                  >
                    <Text style={[styles.categoryChipText, active ? styles.categoryChipTextActive : null]}>
                      {entry.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable style={styles.addBtn} onPress={handleAdd}>
              <Text style={styles.addBtnText}>添加</Text>
            </Pressable>
          </View>

          <Pressable style={styles.okBtn} onPress={onClose}>
            <Text style={styles.okBtnText}>完成</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,27,53,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    maxHeight: "88%",
    borderRadius: 20,
    padding: 16,
    backgroundColor: "#FFFFFF",
    gap: 10,
  },
  header: { gap: 6 },
  title: { color: "#0F1B35", fontSize: 16, fontWeight: "900" },
  total: { color: "#1B6FFF", fontSize: 28, fontWeight: "900", lineHeight: 32 },
  breakdownGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  breakdownItem: {
    width: "47%",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#F7FBFF",
    borderWidth: 1,
    borderColor: "#E3EEFF",
  },
  breakdownLabel: { color: "#8BA0BD", fontSize: 10, fontWeight: "700" },
  breakdownValue: { color: "#0F1B35", fontSize: 14, fontWeight: "900", marginTop: 2 },
  duration: { color: "#8BA0BD", fontSize: 11, fontWeight: "700" },
  listScroll: { flexGrow: 0, maxHeight: 240 },
  listContent: { gap: 8, paddingBottom: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "#F7FBFF",
    borderWidth: 1,
    borderColor: "#E3EEFF",
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowLabel: { color: "#0F1B35", fontSize: 13, fontWeight: "800", lineHeight: 18 },
  rowMeta: { color: "#A0B0CC", fontSize: 10, fontWeight: "700", marginTop: 2 },
  rowAmount: { color: "#0F1B35", fontSize: 13, fontWeight: "900", minWidth: 48, textAlign: "right" },
  deleteBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "#FFF1F2",
  },
  deleteText: { color: "#EF4444", fontSize: 11, fontWeight: "900" },
  addSection: {
    gap: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#E3EEFF",
    backgroundColor: "#FFFFFF",
  },
  addTitle: { color: "#6B7A99", fontSize: 12, fontWeight: "800" },
  addInputRow: { flexDirection: "row", gap: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#D7E8FF",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#0F1B35",
    fontSize: 13,
    backgroundColor: "#FFFFFF",
  },
  inputFlex: { flex: 1, minWidth: 0 },
  inputAmount: { width: 88 },
  categoryRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  categoryChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#F7FBFF",
    borderWidth: 1,
    borderColor: "#D7E8FF",
  },
  categoryChipActive: { backgroundColor: "#EEF4FF", borderColor: "#1B6FFF" },
  categoryChipText: { color: "#6B7A99", fontSize: 11, fontWeight: "800" },
  categoryChipTextActive: { color: "#1B6FFF" },
  addBtn: {
    minHeight: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF4FF",
  },
  addBtnText: { color: "#1B6FFF", fontSize: 13, fontWeight: "900" },
  okBtn: {
    minHeight: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1B6FFF",
  },
  okBtnText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
});
