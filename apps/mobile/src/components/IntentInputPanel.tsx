import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  AudioModule,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import DateTimePicker, { DateTimePickerChangeEvent } from "@react-native-community/datetimepicker";

import { parseIntent, transcribeVoice } from "../services/api";
import {
  buildEffectiveMessage,
  formatDisplayDate,
  hasTravelInput,
  mergeStructured,
  mergeStructuredFromApi,
  parseTravelFromText,
  resolvePickerDate,
  StructuredFields,
  toIsoDate,
  todayDate,
} from "../utils/parseTravelInput";
import { VOICE_RECORDING_OPTIONS } from "../utils/voiceRecording";

export type InputMode = "voice" | "text" | "file";

export type UploadedFile = {
  id: string;
  name: string;
};

type Props = {
  message: string;
  onMessageChange: (value: string) => void;
  structured: StructuredFields;
  setStructured: Dispatch<SetStateAction<StructuredFields>>;
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  uploads: UploadedFile[];
  onUploadPress: () => void;
  onAnalyze: () => void;
  loading: boolean;
};

const TAG_OPTIONS = ["出差", "旅游", "周末游", "美食", "景点", "少走路"];

export function IntentInputPanel({
  message,
  onMessageChange,
  structured,
  setStructured,
  selectedTags,
  onToggleTag,
  uploads,
  onUploadPress,
  onAnalyze,
  loading,
}: Props) {
  const [mode, setMode] = useState<InputMode>("text");
  const audioRecorder = useAudioRecorder(VOICE_RECORDING_OPTIONS);
  const [listening, setListening] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [dateTarget, setDateTarget] = useState<"startDate" | "endDate" | null>(null);
  const [touched, setTouched] = useState<Record<keyof StructuredFields, boolean>>({
    origin: false,
    destination: false,
    startDate: false,
    endDate: false,
    preferences: false,
  });
  const parseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const hints = parseTravelFromText(message);
    setStructured((current) => mergeStructured(current, hints, touched));
  }, [message, setStructured, touched]);

  useEffect(() => {
    if (!message.trim()) return;
    if (parseTimer.current) clearTimeout(parseTimer.current);
    parseTimer.current = setTimeout(async () => {
      try {
        const response = await parseIntent(message.trim());
        setStructured((current) => mergeStructuredFromApi(current, response.structured, touched));
      } catch {
        // 后端未启动时保留本地解析
      }
    }, 900);
    return () => {
      if (parseTimer.current) clearTimeout(parseTimer.current);
    };
  }, [message, setStructured, touched]);

  function updateField(key: keyof StructuredFields, value: string) {
    setTouched((current) => ({ ...current, [key]: true }));
    setStructured((current) => ({ ...current, [key]: value }));
  }

  function swapCities() {
    setStructured((current) => ({
      ...current,
      origin: current.destination,
      destination: current.origin,
    }));
    setTouched((current) => ({ ...current, origin: true, destination: true }));
  }

  async function startRecording() {
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("需要麦克风权限", "请在系统设置中允许麦克风访问后再试。");
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setListening(true);
      setMode("voice");
    } catch (error) {
      Alert.alert("无法开始录音", error instanceof Error ? error.message : "请稍后重试");
    }
  }

  async function stopRecording() {
    if (!listening) return;
    setVoiceBusy(true);
    try {
      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      setListening(false);
      if (!uri) throw new Error("录音文件为空");
      const result = await transcribeVoice(uri);
      onMessageChange(result.text);
      Alert.alert("语音转写完成", "已填入识别结果，可继续编辑。");
    } catch (error) {
      Alert.alert("语音识别失败", error instanceof Error ? error.message : "请确认后端已启动且已配置阿里 API");
    } finally {
      setVoiceBusy(false);
    }
  }

  async function handleVoicePress() {
    if (listening) {
      await stopRecording();
      return;
    }
    await startRecording();
  }

  function onDateValueChange(_event: DateTimePickerChangeEvent, date: Date) {
    if (!dateTarget) return;
    updateField(dateTarget, toIsoDate(date));
  }

  function closeDatePicker() {
    setDateTarget(null);
  }

  const pickerMinimumDate = todayDate();
  const pickerMaximumDate = new Date(pickerMinimumDate.getFullYear() + 2, pickerMinimumDate.getMonth(), pickerMinimumDate.getDate());
  const activePickerDate = dateTarget
    ? resolvePickerDate(
        structured[dateTarget],
        dateTarget === "endDate" ? structured.startDate : undefined,
      )
    : todayDate();

  return (
    <View style={styles.wrap}>
      <View style={styles.agentBubble}>
        <Text style={styles.agentBubbleText}>你好，我是你的旅行导演 Agent。告诉我你的想法，剩下的交给我。</Text>
      </View>

      <View style={styles.modeTabs}>
        {(
          [
            { id: "voice" as const, label: "语音输入", icon: "🎙" },
            { id: "text" as const, label: "文字描述", icon: "T" },
            { id: "file" as const, label: "文件上传", icon: "⇧" },
          ] as const
        ).map((item) => (
          <Pressable
            key={item.id}
            style={[styles.modeTab, mode === item.id && styles.modeTabActive]}
            onPress={() => {
              setMode(item.id);
              if (item.id === "file") onUploadPress();
            }}
          >
            <Text style={[styles.modeIcon, mode === item.id && styles.modeIconActive]}>{item.icon}</Text>
            <Text style={[styles.modeLabel, mode === item.id && styles.modeLabelActive]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.inputCard}>
        {mode === "voice" ? (
          <View style={styles.voiceRow}>
            <Pressable
              style={[styles.micOrb, listening && styles.micOrbActive]}
              onPress={handleVoicePress}
              disabled={voiceBusy}
            >
              {voiceBusy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.micIcon}>{listening ? "■" : "🎙"}</Text>}
            </Pressable>
            <View style={styles.voiceBody}>
              <Text style={styles.inputTitle}>
                {voiceBusy ? "正在识别..." : listening ? "正在录音，再次点击结束" : "点击麦克风开始说话"}
              </Text>
              <View style={styles.waveRow}>
                {[8, 14, 20, 14, 8, 16, 22, 16].map((height, index) => (
                  <View key={index} style={[styles.waveBar, { height: listening ? height + 8 : height }]} />
                ))}
              </View>
              <Text style={styles.voiceHint} numberOfLines={3}>
                {message || "说出你的出行计划，例如：下周五去北京出差三天。"}
              </Text>
            </View>
          </View>
        ) : null}

        {mode === "text" || mode === "file" ? (
          <View>
            <Text style={styles.inputTitle}>描述您的出行需求</Text>
            <TextInput
              value={message}
              onChangeText={onMessageChange}
              multiline
              placeholder="例如：下周五去北京出差三天，住西单附近，想吃正宗烤鸭，周六下午想去故宫。"
              placeholderTextColor="#98A9BF"
              style={styles.textArea}
              textAlignVertical="top"
            />
          </View>
        ) : null}

        {mode === "file" && uploads.length > 0 ? (
          <View style={styles.uploadList}>
            {uploads.map((file) => (
              <View key={file.id} style={styles.uploadChip}>
                <Text style={styles.uploadChipText} numberOfLines={1}>
                  {file.name}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <Text style={styles.quickLabel}>快捷标签（可选）</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRow}>
        <FieldCard icon="📍" label="出发地" value={structured.origin} onChange={(value) => updateField("origin", value)} />
        <FieldCard icon="📍" label="目的地" value={structured.destination} onChange={(value) => updateField("destination", value)} />
        <FieldCard
          icon="📅"
          label="出发"
          value={formatDisplayDate(structured.startDate)}
          editable={false}
          onPress={() => setDateTarget("startDate")}
        />
        <FieldCard
          icon="📅"
          label="结束"
          value={formatDisplayDate(structured.endDate)}
          editable={false}
          onPress={() => setDateTarget("endDate")}
        />
        <FieldCard icon="⭐" label="偏好" value={structured.preferences || "点击填写"} onChange={(value) => updateField("preferences", value)} />
      </ScrollView>

      <View style={styles.routeHero}>
        <View style={styles.routeSide}>
          <Text style={styles.routeSideLabel}>出发</Text>
          <TextInput
            style={styles.routeCity}
            value={structured.origin}
            onChangeText={(value) => updateField("origin", value)}
            placeholder="上海"
            placeholderTextColor="#A8B8CE"
          />
        </View>
        <Pressable style={styles.swapBtn} onPress={swapCities}>
          <Text style={styles.swapText}>⇄</Text>
        </Pressable>
        <View style={[styles.routeSide, styles.routeSideRight]}>
          <Text style={styles.routeSideLabel}>到达</Text>
          <TextInput
            style={[styles.routeCity, styles.routeCityRight]}
            value={structured.destination}
            onChangeText={(value) => updateField("destination", value)}
            placeholder="北京"
            placeholderTextColor="#A8B8CE"
          />
        </View>
      </View>

      <View style={styles.dateRow}>
        <Pressable style={styles.dateCard} onPress={() => setDateTarget("startDate")}>
          <Text style={styles.dateLabel}>出发日期</Text>
          <Text style={styles.dateValue}>{formatDisplayDate(structured.startDate)}</Text>
        </Pressable>
        <Pressable style={styles.dateCard} onPress={() => setDateTarget("endDate")}>
          <Text style={styles.dateLabel}>结束日期</Text>
          <Text style={styles.dateValue}>{formatDisplayDate(structured.endDate)}</Text>
        </Pressable>
      </View>

      {dateTarget ? (
        Platform.OS === "android" ? (
          <Modal transparent animationType="fade" visible onRequestClose={closeDatePicker}>
            <View style={styles.dateModalBackdrop}>
              <View style={styles.dateModalCard}>
                <Text style={styles.dateModalTitle}>
                  选择{dateTarget === "startDate" ? "出发" : "结束"}日期
                </Text>
                <DateTimePicker
                  value={activePickerDate}
                  mode="date"
                  display="spinner"
                  minimumDate={pickerMinimumDate}
                  maximumDate={pickerMaximumDate}
                  onValueChange={onDateValueChange}
                  onDismiss={closeDatePicker}
                />
                <View style={styles.dateModalActions}>
                  <Pressable style={styles.dateModalBtn} onPress={closeDatePicker}>
                    <Text style={styles.dateModalBtnText}>完成</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>
        ) : (
          <View style={styles.iosPickerWrap}>
            <View style={styles.iosPickerHead}>
              <Text style={styles.dateModalTitle}>
                选择{dateTarget === "startDate" ? "出发" : "结束"}日期
              </Text>
              <Pressable onPress={closeDatePicker}>
                <Text style={styles.dateModalDone}>完成</Text>
              </Pressable>
            </View>
            <DateTimePicker
              value={activePickerDate}
              mode="date"
              display="spinner"
              minimumDate={pickerMinimumDate}
              maximumDate={pickerMaximumDate}
              onValueChange={onDateValueChange}
            />
          </View>
        )
      ) : null}

      <View style={styles.tagRow}>
        {TAG_OPTIONS.map((tag) => {
          const active = selectedTags.includes(tag);
          return (
            <Pressable key={tag} style={[styles.tag, active && styles.tagActive]} onPress={() => onToggleTag(tag)}>
              <Text style={[styles.tagText, active && styles.tagTextActive]}>{active ? `✓ ${tag}` : tag}</Text>
            </Pressable>
          );
        })}
      </View>

      <EntityPreview structured={structured} message={message} />

      <Pressable
        style={[styles.cta, !hasTravelInput(message, structured) && styles.ctaDisabled]}
        onPress={onAnalyze}
        disabled={loading || !hasTravelInput(message, structured)}
      >
        <Text style={styles.ctaText}>{loading ? "蓝图正在解析行程..." : "✧ 解析我的行程  ›"}</Text>
      </Pressable>
    </View>
  );
}

function FieldCard({
  icon,
  label,
  value,
  onChange,
  editable = true,
  onPress,
}: {
  icon: string;
  label: string;
  value: string;
  onChange?: (value: string) => void;
  editable?: boolean;
  onPress?: () => void;
}) {
  const content = (
    <View style={styles.fieldCard}>
      <Text style={styles.fieldCardIcon}>{icon}</Text>
      <Text style={styles.fieldCardLabel}>{label}</Text>
      {editable ? (
        <TextInput style={styles.fieldCardValue} value={value} onChangeText={onChange} placeholder="填写" placeholderTextColor="#B2BFD0" />
      ) : (
        <Text style={styles.fieldCardValueStatic} numberOfLines={1}>
          {value}
        </Text>
      )}
    </View>
  );
  if (onPress) {
    return <Pressable onPress={onPress}>{content}</Pressable>;
  }
  return content;
}

function EntityPreview({ structured, message }: { structured: StructuredFields; message: string }) {
  if (!message.trim()) return null;
  const items = [
    { label: "行动", value: "出差 / 住宿 / 餐饮 / 游览" },
    { label: "地点", value: `${structured.origin} → ${structured.destination}` },
    { label: "时间", value: `${formatDisplayDate(structured.startDate)} - ${formatDisplayDate(structured.endDate)}` },
    { label: "偏好", value: structured.preferences || "待补充" },
  ];
  return (
    <View style={styles.preview}>
      <Text style={styles.previewTitle}>识别预览</Text>
      <View style={styles.previewGrid}>
        {items.map((item) => (
          <View key={item.label} style={styles.previewPill}>
            <Text style={styles.previewLabel}>{item.label}</Text>
            <Text style={styles.previewValue} numberOfLines={2}>
              {item.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export { defaultStructured } from "../utils/parseTravelInput";

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  agentBubble: { padding: 14, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.95)" },
  agentBubbleText: { color: "#3A4E70", fontSize: 13, lineHeight: 20, fontWeight: "700" },
  modeTabs: { flexDirection: "row", gap: 8 },
  modeTab: {
    flex: 1,
    minHeight: 36,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.65)",
  },
  modeTabActive: { backgroundColor: "#FFFFFF" },
  modeIcon: { color: "#93A3BA", fontSize: 12, fontWeight: "900" },
  modeIconActive: { color: "#287CFF" },
  modeLabel: { color: "#9AAAC2", fontSize: 10, fontWeight: "900" },
  modeLabelActive: { color: "#287CFF" },
  inputCard: { padding: 14, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.95)" },
  voiceRow: { flexDirection: "row", gap: 14, alignItems: "center" },
  micOrb: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1978FF",
  },
  micOrbActive: { backgroundColor: "#E54848" },
  micIcon: { fontSize: 22, color: "#FFFFFF", fontWeight: "900" },
  voiceBody: { flex: 1, minWidth: 0 },
  inputTitle: { color: "#3A4E70", fontSize: 13, fontWeight: "900" },
  waveRow: { flexDirection: "row", alignItems: "flex-end", gap: 3, marginTop: 10, marginBottom: 8 },
  waveBar: { width: 4, borderRadius: 2, backgroundColor: "#89B8FF" },
  voiceHint: { color: "#7085A2", fontSize: 11, lineHeight: 16 },
  textArea: {
    minHeight: 120,
    marginTop: 8,
    padding: 12,
    borderRadius: 14,
    color: "#405979",
    backgroundColor: "#F7FBFF",
    fontSize: 14,
    lineHeight: 22,
  },
  uploadList: { marginTop: 10, gap: 6 },
  uploadChip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, backgroundColor: "#EEF6FF" },
  uploadChipText: { color: "#287CFF", fontSize: 11, fontWeight: "800" },
  quickLabel: { color: "#8BA0BD", fontSize: 11, fontWeight: "900", paddingLeft: 4 },
  quickRow: { gap: 10, paddingVertical: 4 },
  fieldCard: {
    width: 108,
    minHeight: 92,
    padding: 12,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    shadowColor: "#7EA8E8",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  fieldCardIcon: { fontSize: 16 },
  fieldCardLabel: { marginTop: 6, color: "#A8B8CE", fontSize: 10, fontWeight: "900" },
  fieldCardValue: { marginTop: 8, color: "#2F4568", fontSize: 15, fontWeight: "900", padding: 0 },
  fieldCardValueStatic: { marginTop: 8, color: "#2F4568", fontSize: 13, fontWeight: "900" },
  routeHero: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    shadowColor: "#7EA8E8",
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  routeSide: { flex: 1, minWidth: 0 },
  routeSideRight: { alignItems: "flex-end" },
  routeSideLabel: { color: "#A8B8CE", fontSize: 11, fontWeight: "900" },
  routeCity: { marginTop: 8, color: "#1F3558", fontSize: 24, fontWeight: "900", padding: 0 },
  routeCityRight: { textAlign: "right" },
  swapBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EAF3FF",
    marginHorizontal: 8,
  },
  swapText: { color: "#287CFF", fontSize: 18, fontWeight: "900" },
  dateRow: { flexDirection: "row", gap: 10 },
  dateCard: {
    flex: 1,
    padding: 14,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
  },
  dateLabel: { color: "#A8B8CE", fontSize: 10, fontWeight: "900" },
  dateValue: { marginTop: 8, color: "#2F4568", fontSize: 15, fontWeight: "900" },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.84)" },
  tagActive: { backgroundColor: "#E7F3FF", borderWidth: 1, borderColor: "#9BC8FF" },
  tagText: { color: "#8194AE", fontSize: 11, fontWeight: "900" },
  tagTextActive: { color: "#2777FF" },
  preview: { padding: 12, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.9)" },
  previewTitle: { color: "#233B63", fontSize: 13, fontWeight: "900", marginBottom: 8 },
  previewGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  previewPill: { width: "48%", padding: 10, borderRadius: 12, backgroundColor: "#F7FBFF" },
  previewLabel: { color: "#287CFF", fontSize: 10, fontWeight: "900" },
  previewValue: { marginTop: 4, color: "#7085A2", fontSize: 11, lineHeight: 15 },
  dateModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(35,59,99,0.35)",
    justifyContent: "center",
    padding: 20,
  },
  dateModalCard: {
    borderRadius: 20,
    padding: 16,
    backgroundColor: "#FFFFFF",
  },
  dateModalTitle: { color: "#233B63", fontSize: 15, fontWeight: "900", marginBottom: 8 },
  dateModalActions: { flexDirection: "row", justifyContent: "flex-end", marginTop: 8 },
  dateModalBtn: {
    minWidth: 88,
    minHeight: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1B63FF",
  },
  dateModalBtnText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  iosPickerWrap: {
    marginTop: 8,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    padding: 12,
  },
  iosPickerHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  dateModalDone: { color: "#287CFF", fontSize: 13, fontWeight: "900" },
  cta: {
    minHeight: 50,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1B63FF",
  },
  ctaDisabled: { opacity: 0.45 },
  ctaText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
});
