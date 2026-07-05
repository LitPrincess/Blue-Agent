import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  AudioModule,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import { WebViewMessageEvent } from "react-native-webview";

import { parseIntent, transcribeVoice } from "../services/api";
import { SpeechWebHost, SpeechWebApi } from "../components/SpeechWebHost";
import {
  isDeviceSpeechAvailable,
  normalizeSpeechError,
  requestDeviceSpeechPermissions,
  startDeviceSpeech,
} from "../utils/deviceSpeech";
import {
  hasTravelInput,
  mergeStructured,
  mergeStructuredFromApi,
  parseTravelFromText,
  resolvePickerDate,
  StructuredFields,
  toIsoDate,
  todayDate,
} from "../utils/parseTravelInput";
import { TravelPreferencesInline } from "./TravelPreferencesModal";
import { BluemapTheme as theme } from "../theme/bluemapTheme";
import {
  serializeTravelPreferences,
  TravelPreferences,
} from "../utils/travelPreferences";
import { VOICE_RECORDING_OPTIONS } from "../utils/voiceRecording";

export type InputMode = "voice" | "text" | "file";

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

function formatDateParts(iso: string) {
  if (!iso) return { main: "选择日期", week: "" };
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return { main: iso, week: "" };
  const week = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()];
  return { main: `${date.getMonth() + 1}月${date.getDate()}日`, week };
}

export type UploadedFile = {
  id: string;
  name: string;
};

type Props = {
  message: string;
  onMessageChange: (value: string) => void;
  structured: StructuredFields;
  setStructured: Dispatch<SetStateAction<StructuredFields>>;
  travelPreferences: TravelPreferences;
  onTravelPreferencesChange: (value: TravelPreferences) => void;
  uploads: UploadedFile[];
  onUploadPress: () => void;
  onAnalyze: () => void;
  loading: boolean;
  intentActions?: string[];
};

export function IntentInputPanel({
  message,
  onMessageChange,
  structured,
  setStructured,
  travelPreferences,
  onTravelPreferencesChange,
  uploads,
  onUploadPress,
  onAnalyze,
  loading,
}: Props) {
  const [mode, setMode] = useState<InputMode>("voice");
  const audioRecorder = useAudioRecorder(VOICE_RECORDING_OPTIONS);
  const [listening, setListening] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [dateTarget, setDateTarget] = useState<"startDate" | "endDate" | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const today = todayDate();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [touched, setTouched] = useState<Record<keyof StructuredFields, boolean>>({
    origin: false,
    destination: false,
    startDate: false,
    endDate: false,
    preferences: false,
  });
  const [voiceEngine, setVoiceEngine] = useState<"device" | "web" | "cloud" | null>(null);
  const [parsedActions, setParsedActions] = useState<string[]>([]);
  const parseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceModeRef = useRef<"device" | "web" | "cloud" | null>(null);
  const deviceStopRef = useRef<(() => void) | null>(null);
  const speechWebRef = useRef<SpeechWebApi | null>(null);
  const latestVoiceTextRef = useRef("");

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
        const hints = parseTravelFromText(message.trim());
        if (hints.tags.length) setParsedActions(hints.tags);
      } catch {
        // 后端未启动时保留本地解析
      }
    }, 900);
    return () => {
      if (parseTimer.current) clearTimeout(parseTimer.current);
    };
  }, [message, setStructured, touched]);

  useEffect(() => {
    if (!dateTarget) return;
    const selectedDate = resolvePickerDate(
      structured[dateTarget],
      dateTarget === "endDate" ? structured.startDate : undefined,
    );
    setCalendarMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
  }, [dateTarget, structured.startDate, structured.endDate]);

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
      setMode("voice");
      latestVoiceTextRef.current = "";

      if (await isDeviceSpeechAvailable()) {
        const granted = await requestDeviceSpeechPermissions();
        if (!granted) {
          Alert.alert("需要权限", "请在系统设置中允许麦克风和语音识别权限。");
          return;
        }
        voiceModeRef.current = "device";
        setVoiceEngine("device");
        deviceStopRef.current = startDeviceSpeech(
          (text) => {
            latestVoiceTextRef.current = text;
            onMessageChange(text);
          },
          (errorMessage) => {
            Alert.alert("语音识别失败", normalizeSpeechError(errorMessage));
          },
        );
        if (!deviceStopRef.current) {
          voiceModeRef.current = null;
        } else {
          setListening(true);
          return;
        }
      }

      if (Platform.OS === "web" && speechWebRef.current) {
        voiceModeRef.current = "web";
        setVoiceEngine("web");
        speechWebRef.current.start();
        setListening(true);
        return;
      }

      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("需要麦克风权限", "请在系统设置中允许麦克风访问后再试。");
        return;
      }
      voiceModeRef.current = "cloud";
      setVoiceEngine("cloud");
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setListening(true);
    } catch (error) {
      Alert.alert("无法开始录音", error instanceof Error ? error.message : "请稍后重试");
    }
  }

  async function stopRecording() {
    if (!listening) return;
    setVoiceBusy(true);
    setListening(false);

    try {
      if (voiceModeRef.current === "device" && deviceStopRef.current) {
        deviceStopRef.current();
        deviceStopRef.current = null;
        voiceModeRef.current = null;
        setVoiceEngine(null);
        const text = latestVoiceTextRef.current.trim();
        if (!text) throw new Error("未识别到有效语音，请靠近麦克风重试");
        onMessageChange(text);
        Alert.alert("语音转写完成", "已使用系统语音识别，可继续编辑。");
        return;
      }

      if (voiceModeRef.current === "web" && speechWebRef.current) {
        speechWebRef.current.stop();
        voiceModeRef.current = null;
        setVoiceEngine(null);
        await new Promise((resolve) => setTimeout(resolve, 600));
        const text = latestVoiceTextRef.current.trim();
        if (!text) throw new Error("未识别到有效语音，请检查网络或改用文字输入");
        onMessageChange(text);
        Alert.alert("语音转写完成", "已使用浏览器语音识别，可继续编辑。");
        return;
      }

      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      voiceModeRef.current = null;
      setVoiceEngine(null);
      if (!uri) throw new Error("录音文件为空");
      const result = await transcribeVoice(uri);
      onMessageChange(result.text);
      Alert.alert("语音转写完成", "已填入识别结果，可继续编辑。");
    } catch (error) {
      Alert.alert("语音识别失败", normalizeSpeechError(error instanceof Error ? error.message : "请稍后重试"));
    } finally {
      setVoiceBusy(false);
    }
  }

  function handleSpeechWebMessage(event: WebViewMessageEvent) {
    try {
      const payload = JSON.parse(event.nativeEvent.data) as {
        type: string;
        text?: string;
        final?: boolean;
        message?: string;
      };
      if (payload.type === "result" && payload.text) {
        latestVoiceTextRef.current = payload.text;
        onMessageChange(payload.text);
      }
      if (payload.type === "error") {
        Alert.alert("语音识别失败", normalizeSpeechError(payload.message || "Web 语音识别失败"));
      }
    } catch {
      // ignore malformed messages
    }
  }

  async function handleVoicePress() {
    if (listening) {
      await stopRecording();
      return;
    }
    await startRecording();
  }

  function onDateValueChange(date: Date) {
    if (!dateTarget) return;
    const nextDate = toIsoDate(date);
    updateField(dateTarget, nextDate);
    if (dateTarget === "startDate" && structured.endDate && structured.endDate < nextDate) {
      updateField("endDate", nextDate);
    }
    setDateTarget(null);
  }

  function updateTravelPreferences(value: TravelPreferences) {
    onTravelPreferencesChange(value);
    updateField("preferences", serializeTravelPreferences(value));
  }

  const pickerMinimumDate = todayDate();
  const pickerMaximumDate = new Date(pickerMinimumDate.getFullYear() + 2, pickerMinimumDate.getMonth(), pickerMinimumDate.getDate());
  const activePickerDate = dateTarget
    ? resolvePickerDate(
        structured[dateTarget],
        dateTarget === "endDate" ? structured.startDate : undefined,
      )
    : todayDate();

  function moveCalendarMonth(offset: number) {
    setCalendarMonth((current) => {
      const next = new Date(current.getFullYear(), current.getMonth() + offset, 1);
      const minMonth = new Date(pickerMinimumDate.getFullYear(), pickerMinimumDate.getMonth(), 1);
      const maxMonth = new Date(pickerMaximumDate.getFullYear(), pickerMaximumDate.getMonth(), 1);
      if (next < minMonth) return minMonth;
      if (next > maxMonth) return maxMonth;
      return next;
    });
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.pageHeader}>
        <Pressable style={styles.backBtn} accessibilityRole="button">
          <Ionicons name="chevron-back" size={16} color="#4A6FA5" />
        </Pressable>
        <View style={styles.headerMain}>
          <Text style={styles.pageTitle}>表达出行需求</Text>
          <Text style={styles.pageSubtitle}>语音 · 文字 · 文件 · 结构化选择</Text>
        </View>
        <View style={styles.aiBadge}>
          <Ionicons name="sparkles" size={12} color={theme.colors.primary} />
          <Text style={styles.aiBadgeText}>AI 多模态</Text>
        </View>
      </View>

      <SpeechWebHost
        onReady={(api) => {
          speechWebRef.current = api;
        }}
        onMessage={handleSpeechWebMessage}
      />

      <View style={styles.modeTabs}>
        {(
          [
            { id: "voice" as const, label: "语音输入", icon: "mic-outline" as const },
            { id: "text" as const, label: "文字描述", icon: "chatbubble-ellipses-outline" as const },
            { id: "file" as const, label: "文件上传", icon: "cloud-upload-outline" as const },
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
            <Ionicons
              name={item.icon}
              size={14}
              color={mode === item.id ? theme.colors.primary : "#7A8FB0"}
            />
            <Text style={[styles.modeLabel, mode === item.id && styles.modeLabelActive]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>

      {mode === "voice" ? (
        <View style={styles.inputCard}>
          <View style={styles.voiceCenter}>
            <View style={styles.micRingWrap}>
              {!listening && !voiceBusy ? <View style={styles.micRingOuter} /> : null}
              {listening ? (
                <>
                  <View style={styles.micRingPulseOuter} />
                  <View style={styles.micRingPulseInner} />
                </>
              ) : null}
              <Pressable
                style={[styles.micOrb, listening && styles.micOrbActive]}
                onPress={handleVoicePress}
                disabled={voiceBusy}
              >
                {voiceBusy ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Ionicons name={listening ? "stop" : "mic"} size={28} color="#FFFFFF" />
                )}
              </Pressable>
            </View>
            <Text style={styles.voiceTitle}>
              {voiceBusy ? "正在识别..." : listening ? "正在聆听…" : "一句话说出您的出行需求"}
            </Text>
            {!listening && !voiceBusy ? (
              <Text style={styles.voiceSubtitle}>例：下周五上海出差3天，住商务酒店</Text>
            ) : null}
            {listening ? (
              <View style={styles.waveRowCenter}>
                {[4, 7, 5, 9, 6, 8, 5, 7, 4].map((height, index) => (
                  <View key={index} style={[styles.waveBar, { height: height * 2.5 }]} />
                ))}
              </View>
            ) : null}
            {message ? (
              <Text style={styles.voiceTranscript} numberOfLines={3}>
                {message}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {mode === "text" ? (
        <View style={styles.inputCard}>
          <TextInput
            value={message}
            onChangeText={onMessageChange}
            multiline
            placeholder="描述您的出行需求……"
            placeholderTextColor="#98A9BF"
            style={styles.textArea}
            textAlignVertical="top"
          />
          <View style={styles.textCountRow}>
            <Text style={styles.textCount}>{message.length} 字</Text>
          </View>
        </View>
      ) : null}

      {mode === "file" ? (
        uploads.length > 0 ? (
          <View style={styles.inputCard}>
            <View style={styles.uploadList}>
              {uploads.map((file) => (
                <View key={file.id} style={styles.uploadChip}>
                  <Text style={styles.uploadChipText} numberOfLines={1}>
                    {file.name}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : (
          <View style={styles.fileDrop}>
            <View style={styles.fileIconWrap}>
              <Ionicons name="cloud-upload-outline" size={20} color={theme.colors.primary} />
            </View>
            <Text style={styles.fileTitle}>上传出行相关文件</Text>
            <Text style={styles.fileSubtitle}>PDF · 截图 · 机票 · 酒店确认单</Text>
            <Pressable style={styles.fileBtn} onPress={onUploadPress}>
              <Text style={styles.fileBtnText}>选择文件</Text>
            </Pressable>
          </View>
        )
      ) : null}

      <View style={styles.structuredBlock}>
        <View style={styles.routeHero}>
          <View style={styles.routeSide}>
            <Text style={styles.routeSideLabel}>出发地</Text>
            <TextInput
              style={styles.routeCity}
              value={structured.origin}
              onChangeText={(value) => updateField("origin", value)}
              placeholder="上海"
              placeholderTextColor="#A8B8CE"
            />
          </View>
          <Pressable style={styles.swapBtn} onPress={swapCities}>
            <Ionicons name="arrow-forward" size={16} color={theme.colors.primary} />
          </Pressable>
          <View style={[styles.routeSide, styles.routeSideRight]}>
            <Text style={styles.routeSideLabel}>目的地</Text>
            <TextInput
              style={[styles.routeCity, styles.routeCityRight]}
              value={structured.destination}
              onChangeText={(value) => updateField("destination", value)}
              placeholder="北京"
              placeholderTextColor="#A8B8CE"
            />
          </View>
        </View>

        <View style={styles.dateCard}>
          <Pressable style={styles.dateHalf} onPress={() => setDateTarget("startDate")}>
            <Text style={styles.dateLabel}>出发日期</Text>
            <View style={styles.dateValueRow}>
              <Text style={styles.dateValueMain}>{formatDateParts(structured.startDate).main}</Text>
              {formatDateParts(structured.startDate).week ? (
                <Text style={styles.dateValueWeek}> {formatDateParts(structured.startDate).week}</Text>
              ) : null}
            </View>
          </Pressable>
          <View style={styles.dateDivider} />
          <Pressable style={[styles.dateHalf, styles.dateHalfRight]} onPress={() => setDateTarget("endDate")}>
            <Text style={[styles.dateLabel, styles.dateLabelRight]}>结束日期</Text>
            <View style={[styles.dateValueRow, styles.dateValueRowRight]}>
              <Text style={styles.dateValueMain}>{formatDateParts(structured.endDate).main}</Text>
              {formatDateParts(structured.endDate).week ? (
                <Text style={styles.dateValueWeek}> {formatDateParts(structured.endDate).week}</Text>
              ) : null}
            </View>
          </Pressable>
        </View>

        {dateTarget ? (
          <View style={styles.calendarWrap}>
            <InlineCalendar
              month={calendarMonth}
              selectedDate={activePickerDate}
              minimumDate={pickerMinimumDate}
              maximumDate={pickerMaximumDate}
              onPrevMonth={() => moveCalendarMonth(-1)}
              onNextMonth={() => moveCalendarMonth(1)}
              onSelectDate={onDateValueChange}
            />
          </View>
        ) : null}

        <TravelPreferencesInline value={travelPreferences} onChange={updateTravelPreferences} />
      </View>

      <Pressable
        style={[styles.cta, (!hasTravelInput(message, structured) || loading) && styles.ctaDisabled]}
        onPress={onAnalyze}
        disabled={loading || !hasTravelInput(message, structured)}
      >
        <Ionicons name="sparkles" size={16} color="#FFFFFF" />
        <Text style={styles.ctaText}>{loading ? "AI 正在规划中…" : "蓝图为您规划行程"}</Text>
        {!loading ? <Ionicons name="chevron-forward" size={16} color="#FFFFFF" /> : null}
      </Pressable>
      <Text style={styles.ctaHint}>AI 将综合所有输入，生成最优出行方案</Text>
    </View>
  );
}

function InlineCalendar({
  month,
  selectedDate,
  minimumDate,
  maximumDate,
  onPrevMonth,
  onNextMonth,
  onSelectDate,
}: {
  month: Date;
  selectedDate: Date;
  minimumDate: Date;
  maximumDate: Date;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onSelectDate: (date: Date) => void;
}) {
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const leadingBlankCount = (monthStart.getDay() + 6) % 7;
  const cells = [
    ...Array.from({ length: leadingBlankCount }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1)),
  ];
  const selectedIso = toIsoDate(selectedDate);
  const minMonth = new Date(minimumDate.getFullYear(), minimumDate.getMonth(), 1);
  const maxMonth = new Date(maximumDate.getFullYear(), maximumDate.getMonth(), 1);
  const canPrev = monthStart > minMonth;
  const canNext = monthStart < maxMonth;

  return (
    <View style={styles.calendar}>
      <View style={styles.calendarNav}>
        <Pressable style={[styles.calendarNavBtn, !canPrev && styles.calendarNavBtnDisabled]} onPress={onPrevMonth} disabled={!canPrev}>
          <Text style={styles.calendarNavText}>‹</Text>
        </Pressable>
        <Text style={styles.calendarMonthText}>
          {month.getFullYear()}年{month.getMonth() + 1}月
        </Text>
        <Pressable style={[styles.calendarNavBtn, !canNext && styles.calendarNavBtnDisabled]} onPress={onNextMonth} disabled={!canNext}>
          <Text style={styles.calendarNavText}>›</Text>
        </Pressable>
      </View>
      <View style={styles.calendarWeekRow}>
        {WEEKDAY_LABELS.map((label) => (
          <Text key={label} style={styles.calendarWeekText}>
            {label}
          </Text>
        ))}
      </View>
      <View style={styles.calendarGrid}>
        {cells.map((date, index) => {
          if (!date) return <View key={`blank-${index}`} style={styles.calendarDayCell} />;
          const iso = toIsoDate(date);
          const disabled = date < minimumDate || date > maximumDate;
          const selected = iso === selectedIso;
          return (
            <Pressable
              key={iso}
              style={[styles.calendarDayCell, selected && styles.calendarDaySelected, disabled && styles.calendarDayDisabled]}
              onPress={() => onSelectDate(date)}
              disabled={disabled}
            >
              <Text style={[styles.calendarDayText, selected && styles.calendarDayTextSelected, disabled && styles.calendarDayTextDisabled]}>
                {date.getDate()}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export { defaultStructured } from "../utils/parseTravelInput";

const styles = StyleSheet.create({
  wrap: { gap: 16 },
  pageHeader: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 4 },
  backBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.65)",
  },
  headerMain: { flex: 1, minWidth: 0 },
  pageTitle: { color: theme.colors.textPrimary, fontSize: 16, fontWeight: theme.typography.weightBlack },
  pageSubtitle: { color: "#7A8FB0", fontSize: 10, marginTop: 2 },
  aiBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: "rgba(27,111,255,0.1)",
  },
  aiBadgeText: { color: theme.colors.primary, fontSize: 10, fontWeight: theme.typography.weightBlack },
  modeTabs: {
    flexDirection: "row",
    gap: 6,
    padding: 4,
    borderRadius: theme.radius.xxl,
    backgroundColor: "rgba(255,255,255,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.8)",
  },
  modeTab: {
    flex: 1,
    minHeight: 36,
    borderRadius: theme.radius.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  modeTabActive: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#1B6FFF",
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  modeLabel: { color: "#7A8FB0", fontSize: 12, fontWeight: theme.typography.weightMedium },
  modeLabelActive: { color: theme.colors.primary },
  inputCard: {
    padding: 24,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.75)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.9)",
    shadowColor: "#1B6FFF",
    shadowOpacity: 0.1,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  structuredBlock: { gap: 10, marginTop: 4 },
  voiceCenter: { alignItems: "center", gap: 16, paddingVertical: 4 },
  micRingWrap: { alignItems: "center", justifyContent: "center", width: 112, height: 112 },
  micRingOuter: {
    position: "absolute",
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "rgba(27,111,255,0.08)",
  },
  micRingPulseOuter: {
    position: "absolute",
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: "rgba(27,111,255,0.08)",
  },
  micRingPulseInner: {
    position: "absolute",
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "rgba(27,111,255,0.12)",
  },
  voiceTitle: { color: theme.colors.textPrimary, fontSize: 14, fontWeight: theme.typography.weightBlack, textAlign: "center" },
  voiceSubtitle: { color: "#7A8FB0", fontSize: 12, textAlign: "center" },
  voiceTranscript: { color: theme.colors.textBody, fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: 4 },
  waveRowCenter: { flexDirection: "row", alignItems: "flex-end", gap: 2, height: 24, marginTop: 4 },
  fileDrop: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 28,
    paddingHorizontal: 16,
    borderRadius: 24,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "rgba(27,111,255,0.22)",
    backgroundColor: "rgba(255,255,255,0.65)",
  },
  fileIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.bgSwap,
  },
  fileTitle: { color: theme.colors.textPrimary, fontSize: 14, fontWeight: theme.typography.weightBlack },
  fileSubtitle: { color: "#7A8FB0", fontSize: 12 },
  fileBtn: {
    marginTop: 4,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.primaryBright,
    shadowColor: "#1B6FFF",
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  fileBtnText: { color: "#FFFFFF", fontSize: 12, fontWeight: theme.typography.weightBlack },
  textCountRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.05)",
    marginTop: 8,
  },
  textCount: { color: "#B8CFF7", fontSize: 10 },
  micOrb: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primaryBright,
    shadowColor: "#1B6FFF",
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  micOrbActive: {
    backgroundColor: theme.colors.accentRed,
    shadowColor: "#FF4757",
  },
  waveBar: {
    width: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.primary,
  },
  textArea: {
    minHeight: 90,
    color: theme.colors.textPrimary,
    backgroundColor: "transparent",
    fontSize: 14,
    lineHeight: 22,
    padding: 0,
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
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: theme.radius.xl,
    backgroundColor: "rgba(255,255,255,0.8)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.95)",
    shadowColor: "#1B6FFF",
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  routeSide: { flex: 1, minWidth: 0 },
  routeSideRight: { alignItems: "flex-end" },
  routeSideLabel: {
    color: theme.colors.textLabel,
    fontSize: 9,
    fontWeight: theme.typography.weightBlack,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  routeCity: { marginTop: 4, color: theme.colors.textPrimary, fontSize: 20, fontWeight: "900", padding: 0 },
  routeCityRight: { textAlign: "right" },
  swapBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.bgSwap,
    marginHorizontal: 8,
    shadowColor: "#1B6FFF",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  dateCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: theme.radius.xl,
    backgroundColor: "rgba(255,255,255,0.8)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.95)",
    shadowColor: "#1B6FFF",
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  dateHalf: { flex: 1, minWidth: 0 },
  dateHalfRight: { alignItems: "flex-end" },
  dateDivider: { width: 1, height: 32, backgroundColor: "rgba(0,0,0,0.07)", marginHorizontal: 12 },
  dateLabel: { color: theme.colors.textLabel, fontSize: 9, fontWeight: theme.typography.weightBlack, letterSpacing: 0.6, textTransform: "uppercase" },
  dateLabelRight: { textAlign: "right" },
  dateValueRow: { flexDirection: "row", alignItems: "baseline", marginTop: 4 },
  dateValueRowRight: { justifyContent: "flex-end" },
  dateValueMain: { color: theme.colors.primaryDeep, fontSize: 16, fontWeight: theme.typography.weightBlack },
  dateValueWeek: { color: "#7A8FB0", fontSize: 12, fontWeight: theme.typography.weightMedium },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.84)" },
  tagActive: { backgroundColor: "#E7F3FF", borderWidth: 1, borderColor: "#9BC8FF" },
  tagText: { color: "#8194AE", fontSize: 11, fontWeight: "900" },
  tagTextActive: { color: "#2777FF" },
  cta: {
    minHeight: 52,
    marginTop: 8,
    borderRadius: theme.radius.xl,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: theme.colors.primaryBright,
    shadowColor: "#1B6FFF",
    shadowOpacity: 0.42,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  ctaDisabled: { opacity: 0.45, shadowOpacity: 0 },
  ctaText: { color: theme.colors.textOnPrimary, fontSize: 14, fontWeight: theme.typography.weightBlack },
  ctaHint: { color: "#8A9BBF", fontSize: 10, textAlign: "center", marginTop: 8 },
  calendarWrap: {
    marginTop: 8,
    borderRadius: theme.radius.xl,
    backgroundColor: "rgba(255,255,255,0.8)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.95)",
    padding: 12,
  },
  calendar: { gap: 10 },
  calendarNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  calendarNavBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.bgSwap,
  },
  calendarNavBtnDisabled: { opacity: 0.35 },
  calendarNavText: { color: theme.colors.primary, fontSize: 24, fontWeight: "900", lineHeight: 26 },
  calendarMonthText: { color: theme.colors.textPrimary, fontSize: 16, fontWeight: theme.typography.weightBlack },
  calendarWeekRow: { flexDirection: "row" },
  calendarWeekText: {
    width: `${100 / 7}%`,
    textAlign: "center",
    color: "#7A8FB0",
    fontSize: 11,
    fontWeight: theme.typography.weightBlack,
  },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap", rowGap: 6 },
  calendarDayCell: {
    width: `${100 / 7}%`,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  calendarDaySelected: { backgroundColor: theme.colors.primaryBright },
  calendarDayDisabled: { opacity: 0.25 },
  calendarDayText: { color: theme.colors.textPrimary, fontSize: 14, fontWeight: theme.typography.weightBlack },
  calendarDayTextSelected: { color: "#FFFFFF" },
  calendarDayTextDisabled: { color: "#A8B8CE" },
});
