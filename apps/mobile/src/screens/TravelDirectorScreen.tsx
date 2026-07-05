import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Linking, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";

import { DynamicRefinePanel } from "../components/DynamicRefinePanel";
import { ExecutionPanel } from "../components/ExecutionPanel";
import {
  buildExpenseLinesFromQuote,
  ExpenseLine,
  ExpenseStatsModal,
  summarizeExpenseLines,
} from "../components/ExpenseStatsModal";
import { IntentAnalysisPanel } from "../components/IntentAnalysisPanel";
import { IntentInputPanel, UploadedFile } from "../components/IntentInputPanel";
import { MapTopologyBoard } from "../components/MapTopologyBoard";
import { draftFromItem, NodeEditDraft, NodeEditModal } from "../components/NodeEditModal";
import { OptionPickerModal } from "../components/OptionPickerModal";
import { PermissionPrimerModal } from "../components/PermissionPrimerModal";
import { TopologyShell } from "../components/TopologyShell";
import { BlueMapShell } from "../components/ui/BlueMapShell";
import { MainTab } from "../components/ui/BottomNavBar";
import { useToast } from "../components/ui/Toast";
import {
  acceptReplan,
  addNode,
  analyzeIntent,
  authorizePayment,
  buildTravelRequest,
  comparePlans,
  confirmPOI,
  deleteNode,
  executeOrder,
  getGuardianStatus,
  getItineraryWeather,
  getPriceQuote,
  getTripReview,
  prepareOrder,
  prepareOrderFromItinerary,
  refineItinerary,
  reorderNodes,
  requestEmergencyAdjust,
  requestReplan,
  searchRecommendations,
  smartUpdateNode,
  simulateIncident,
  syncSystem,
  uploadTravelDocument,
} from "../services/api";
import { readSyncedCalendarEvents } from "../services/deviceCalendarRead";
import { syncItineraryToDeviceCalendar } from "../services/deviceCalendar";
import {
  openAndroidClockAlarm,
  readSyncedClockAlarms,
  resolveNextClockItem,
  syncItineraryToDeviceClockAlarms,
} from "../services/deviceClockAlarm";
import { readSyncedMemo, syncItineraryToDeviceMemo } from "../services/deviceMemo";
import { syncItineraryReminders } from "../services/deviceNotifications";
import { enableTripWidgetNotification } from "../services/deviceTripWidget";
import {
  createDeviceSyncScaffold,
  patchDeviceSyncResult,
  persistDeviceSync,
} from "../services/deviceSyncState";
import { mergeDeviceSyncIntoResult, runFullDeviceSync } from "../services/deviceSyncOrchestrator";
import { exportItineraryPdf } from "../services/exportTripPdf";
import { formatItemDateLabel } from "../utils/dateUtils";
import { buildAmapNavigateUrl, buildAmapWebNavigateUrl, sortItineraryItems } from "../utils/amapNavigation";
import { openExternalUrl } from "../utils/openExternalApp";
import { buildItineraryMemoText } from "../utils/platformDeeplinks";
import { openNotificationSettings, openSystemCalendarApp, openSystemRemindersApp } from "../utils/deviceSystemLinks";
import { riskTextForItem } from "../utils/riskUtils";
import { resolveNextWidgetItem } from "../utils/widgetUtils";
import {
  GuardianStatus,
  IntentAnalysis,
  Itinerary,
  ItineraryItem,
  ItineraryPriceQuote,
  ItineraryWeatherResponse,
  ItemWeatherInfo,
  PlanComparison,
  PlanOption,
  POICandidate,
  ReplanProposal,
  SyncItem,
  SystemSyncResult,
  TravelOrder,
  TripReview,
} from "../types";
import { buildEffectiveMessage, defaultStructured, parseTravelFromText, StructuredFields } from "../utils/parseTravelInput";
import { defaultTravelPreferences, TravelPreferences } from "../utils/travelPreferences";
import { EmergencyKind } from "../utils/emergencyAdjustments";
import { BluemapTheme as theme } from "../theme/bluemapTheme";

const samplePrompt = "";

type Stage = "input" | "analyze" | "compare" | "compareDetail" | "order" | "guardian" | "review" | "widget";

function stageToTab(stage: Stage): MainTab {
  if (stage === "input" || stage === "analyze") return 0;
  if (stage === "compare" || stage === "compareDetail" || stage === "widget" || stage === "review") return 1;
  if (stage === "guardian") return 2;
  return 3;
}

export function TravelDirectorScreen() {
  const { showToast } = useToast();
  const [stage, setStage] = useState<Stage>("input");
  const [message, setMessage] = useState(samplePrompt);
  const [structured, setStructured] = useState<StructuredFields>(defaultStructured());
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [travelPreferences, setTravelPreferences] = useState<TravelPreferences>(defaultTravelPreferences);
  const [uploads, setUploads] = useState<UploadedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [pageScrollEnabled, setPageScrollEnabled] = useState(true);
  const [nodeEditDraft, setNodeEditDraft] = useState<NodeEditDraft | null>(null);
  const [nodeEditMode, setNodeEditMode] = useState<"edit" | "add">("edit");
  const [nodeAddAfterId, setNodeAddAfterId] = useState<string | null>(null);
  const [nodeSaving, setNodeSaving] = useState(false);
  const pageScrollRef = useRef<ScrollView>(null);
  const mapTouchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [documentIds, setDocumentIds] = useState<string[]>([]);
  const [comparison, setComparison] = useState<PlanComparison | null>(null);
  const [selectedOption, setSelectedOption] = useState<PlanOption | null>(null);
  const [order, setOrder] = useState<TravelOrder | null>(null);
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [syncResult, setSyncResult] = useState<SystemSyncResult | null>(null);
  const [calendarEventCount, setCalendarEventCount] = useState(0);
  const [deviceSyncBusy, setDeviceSyncBusy] = useState<SyncItem["target"] | null>(null);
  const [expenseStatsVisible, setExpenseStatsVisible] = useState(false);
  const [expenseLines, setExpenseLines] = useState<ExpenseLine[]>([]);
  const [permissionPrimerVisible, setPermissionPrimerVisible] = useState(false);
  const [pendingExecute, setPendingExecute] = useState(false);
  const [guardian, setGuardian] = useState<GuardianStatus | null>(null);
  const [proposal, setProposal] = useState<ReplanProposal | null>(null);
  const [review, setReview] = useState<TripReview | null>(null);
  const [analysis, setAnalysis] = useState<IntentAnalysis | null>(null);
  const [priceQuote, setPriceQuote] = useState<ItineraryPriceQuote | null>(null);
  const [itineraryWeather, setItineraryWeather] = useState<ItineraryWeatherResponse | null>(null);
  const [weatherSyncing, setWeatherSyncing] = useState(false);
  const [poiPickerVisible, setPoiPickerVisible] = useState(false);
  const [poiLoading, setPoiLoading] = useState(false);
  const [poiCandidates, setPoiCandidates] = useState<POICandidate[]>([]);
  const [poiSummary, setPoiSummary] = useState("");
  const [poiRecommendation, setPoiRecommendation] = useState("");
  const [poiPickerTitle, setPoiPickerTitle] = useState("多平台候选");
  const [poiContext, setPoiContext] = useState<{
    category: "food" | "hotel" | "sight";
    keyword: string;
    day: number;
    start_time: string;
    end_time: string;
    replace_item_id?: string;
    insert_after_item_id?: string;
    near_lat?: number;
    near_lng?: number;
  } | null>(null);

  useEffect(() => {
    if (!itinerary?.id) {
      setPriceQuote(null);
      return;
    }
    let cancelled = false;
    getPriceQuote(itinerary.id)
      .then((quote) => {
        if (!cancelled) setPriceQuote(quote);
      })
      .catch(() => {
        if (!cancelled) setPriceQuote(null);
      });
    return () => {
      cancelled = true;
    };
  }, [itinerary?.id, itinerary?.version, itinerary?.items.length]);

  useEffect(() => {
    if (priceQuote) {
      setExpenseLines(buildExpenseLinesFromQuote(priceQuote));
    } else {
      setExpenseLines([]);
    }
  }, [priceQuote]);

  useEffect(() => {
    const target = itinerary ?? selectedOption?.itinerary ?? null;
    if (!target?.id) {
      setItineraryWeather(null);
      return;
    }
    let cancelled = false;
    setWeatherSyncing(true);
    getItineraryWeather(target.id)
      .then((data) => {
        if (!cancelled) setItineraryWeather(data);
      })
      .catch(() => {
        if (!cancelled) setItineraryWeather(null);
      })
      .finally(() => {
        if (!cancelled) setWeatherSyncing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    itinerary?.id,
    itinerary?.version,
    selectedOption?.itinerary?.id,
    selectedOption?.itinerary?.version,
  ]);

  const expenseSummary = useMemo(() => summarizeExpenseLines(expenseLines), [expenseLines]);
  const poiSearching = poiLoading && poiCandidates.length === 0;
  const itemWeatherMap = useMemo(() => {
    const map: Record<string, ItemWeatherInfo> = {};
    for (const entry of itineraryWeather?.item_weather ?? []) {
      map[entry.item_id] = entry;
    }
    return map;
  }, [itineraryWeather]);

  useEffect(() => {
    const hints = parseTravelFromText(message);
    if (hints.tags.length) {
      setSelectedTags((current) => Array.from(new Set([...current, ...hints.tags])));
    }
  }, [message]);

  function extractFoodKeyword(text: string) {
    const patterns = ["菌子火锅", "火锅", "烧烤", "米线", "小吃", "美食", "餐厅"];
    for (const pattern of patterns) {
      if (text.includes(pattern)) return pattern;
    }
    return "特色美食";
  }

  function keywordLabel(keyword: string) {
    return keyword || "当地精选";
  }

  async function openPOIPicker(context: {
    category: "food" | "hotel" | "sight";
    keyword: string;
    day: number;
    start_time: string;
    end_time: string;
    replace_item_id?: string;
    insert_after_item_id?: string;
    near_lat?: number;
    near_lng?: number;
  }) {
    if (!itinerary) return;
    const city = itinerary.intent.destination || structured.destination;
    if (!city) {
      Alert.alert("缺少目的地", "请先填写或解析目的地城市。");
      return;
    }
    setPoiContext(context);
    setPoiPickerTitle(
      context.category === "hotel"
        ? `推荐酒店 · ${keywordLabel(context.keyword)}`
        : context.category === "sight"
          ? `推荐景点 · ${keywordLabel(context.keyword)}`
          : `推荐餐厅 · ${keywordLabel(context.keyword)}`,
    );
    setPoiPickerVisible(true);
    setPoiLoading(true);
    setPoiCandidates([]);
    setPoiSummary("");
    setPoiRecommendation("");
    showToast("正在跨平台广泛搜索，通常需 10–30 秒，请稍候…", "info");
    try {
      const response = await searchRecommendations({
        city,
        keyword: context.keyword,
        category: context.category,
        day: context.day,
        start_time: context.start_time,
        end_time: context.end_time,
        near_lat: context.near_lat,
        near_lng: context.near_lng,
        itinerary_id: itinerary.id,
      });
      setPoiCandidates(response.candidates);
      setPoiSummary(response.summary);
      setPoiRecommendation(response.llm_recommendation);
    } catch (error) {
      setPoiPickerVisible(false);
      Alert.alert("推荐失败", error instanceof Error ? error.message : "请确认后端已启动");
    } finally {
      setPoiLoading(false);
    }
  }

  function handleRecommendFromItem(item: ItineraryItem) {
    setNodeEditDraft(null);
    setNodeAddAfterId(null);
    const category: "food" | "hotel" | "sight" =
      item.category === "hotel" ? "hotel" : item.category === "sight" ? "sight" : "food";
    const city = itinerary?.intent.destination || structured.destination;
    const keyword =
      category === "hotel"
        ? itinerary?.intent.accommodation_area || `${city}酒店`
        : category === "sight"
          ? item.title.trim() || item.location.trim() || `${city}景点`
          : extractFoodKeyword(item.title) !== "特色美食"
            ? extractFoodKeyword(item.title)
            : extractFoodKeyword(message);
    openPOIPicker({
      category,
      keyword,
      day: item.day,
      start_time: item.start_time,
      end_time: item.end_time,
      replace_item_id: item.id,
      near_lat: item.geo_lat ?? undefined,
      near_lng: item.geo_lng ?? undefined,
    });
  }

  async function handleConfirmPOI(candidate: POICandidate) {
    if (!itinerary || !poiContext) return;
    setPoiLoading(true);
    try {
      const response = await confirmPOI(itinerary.id, candidate, {
        day: poiContext.day,
        start_time: poiContext.start_time,
        end_time: poiContext.end_time,
        replace_item_id: poiContext.replace_item_id,
        insert_after_item_id: poiContext.insert_after_item_id,
      });
      if (response.itinerary) await applyItineraryUpdate(response.itinerary);
      setPriceQuote(response.price_quote);
      setPoiPickerVisible(false);
      setPoiContext(null);
      Alert.alert("节点已确定", `已选定「${candidate.name}」，总价更新为 ¥${response.price_quote.total}。`);
    } catch (error) {
      Alert.alert("确认失败", error instanceof Error ? error.message : "请稍后重试");
    } finally {
      setPoiLoading(false);
    }
  }

  function handleQuickRecommend(category: "food" | "hotel") {
    if (!itinerary) return;
    const lastItem = itinerary.items[itinerary.items.length - 1];
    const keyword =
      category === "food"
        ? extractFoodKeyword(message)
        : itinerary.intent.accommodation_area || `${itinerary.intent.destination || structured.destination}酒店`;
    openPOIPicker({
      category,
      keyword,
      day: lastItem?.day ?? 1,
      start_time: category === "food" ? "12:00" : "20:00",
      end_time: category === "food" ? "13:30" : "08:00",
      insert_after_item_id: lastItem?.id,
      near_lat: lastItem?.geo_lat ?? undefined,
      near_lng: lastItem?.geo_lng ?? undefined,
    });
  }

  async function handleUpload() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "text/plain", "image/*", "audio/*"],
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    const mimeType = asset.mimeType ?? "text/plain";
    const kind = mimeType.includes("pdf")
      ? "pdf"
      : mimeType.includes("image")
        ? "image"
        : mimeType.includes("audio")
          ? "audio"
          : "text";

    setLoading(true);
    try {
      const response = await uploadTravelDocument(asset.uri, asset.name, mimeType, kind);
      setDocumentIds((current) => [...current, response.document_id]);
      setUploads((current) => [...current, { id: response.document_id, name: asset.name }]);
      Alert.alert("上传成功", `已上传 ${asset.name}，抽取 ${response.chunks} 个片段`);
    } catch (error) {
      Alert.alert("上传失败", error instanceof Error ? error.message : "请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  async function handleAnalyze() {
    const effectiveMessage = buildEffectiveMessage(message, structured, selectedTags, travelPreferences);
    if (!effectiveMessage) {
      Alert.alert("请先输入需求", "可通过文字、语音，或填写出发地/目的地后解析。");
      return;
    }
    if (!message.trim()) setMessage(effectiveMessage);
    setLoading(true);
    try {
      const response = await analyzeIntent(effectiveMessage);
      setAnalysis(response);
      setStructured((current) => ({
        ...current,
        origin: response.structured.origin || current.origin,
        destination: response.structured.destination || current.destination,
        startDate: response.structured.startDate || current.startDate,
        endDate: response.structured.endDate || current.endDate,
        preferences: response.structured.preferences || current.preferences,
      }));
      setStage("analyze");
    } catch (error) {
      Alert.alert("解析失败", error instanceof Error ? error.message : "请确认后端已启动");
    } finally {
      setLoading(false);
    }
  }

  async function handleCompare() {
    const effectiveMessage = buildEffectiveMessage(message, structured, selectedTags, travelPreferences);
    if (!effectiveMessage) {
      Alert.alert("请先输入需求", "可通过文字、语音，或填写出发地/目的地后解析。");
      return;
    }
    if (!message.trim()) setMessage(effectiveMessage);
    setLoading(true);
    try {
      const response = await comparePlans(
        buildTravelRequest(effectiveMessage, structured, documentIds, selectedTags, [], travelPreferences),
      );
      setComparison(response.comparison);
      const recommended =
        response.comparison.options.find((item) => item.id === response.comparison.recommended_option_id) ??
        response.comparison.options[0];
      setSelectedOption(recommended);
      setItinerary(recommended.itinerary);
      setStage("compareDetail");
    } catch (error) {
      Alert.alert("方案生成失败", error instanceof Error ? error.message : "请确认后端已启动");
    } finally {
      setLoading(false);
    }
  }

  function handleSelectPlanForTopology(option: PlanOption) {
    setSelectedOption(option);
    setItinerary(option.itinerary);
    setStage("compareDetail");
  }

  useEffect(() => {
    if (!itinerary?.id) {
      setSyncResult(null);
      return;
    }
    if (!syncResult || syncResult.itinerary_id !== itinerary.id) {
      setSyncResult(createDeviceSyncScaffold(itinerary));
    }
  }, [itinerary?.id]);

  async function handlePrepare(option: PlanOption) {
    if (!itinerary) return;
    setLoading(true);
    try {
      setSelectedOption({ ...option, itinerary });
      let response;
      if (comparison) {
        try {
          response = await prepareOrder(comparison.id, option.id);
        } catch {
          response = await prepareOrderFromItinerary(itinerary.id, { ...option, itinerary });
        }
      } else {
        response = await prepareOrderFromItinerary(itinerary.id, { ...option, itinerary });
      }
      setOrder(response.order);
      setItinerary(response.order.option.itinerary);
      setSyncResult(createDeviceSyncScaffold(response.order.option.itinerary));
      setStage("order");
    } catch (error) {
      Alert.alert("订单准备失败", error instanceof Error ? error.message : "请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  function applyDeviceSyncPatch(target: SyncItem["target"], detail: string, status: SyncItem["status"]) {
    if (!itinerary) return;
    setSyncResult((current) => {
      const next = patchDeviceSyncResult(current, itinerary, target, detail, status);
      void persistDeviceSync(next);
      return next;
    });
  }

  async function handleSyncCalendar() {
    if (!itinerary || deviceSyncBusy) return;
    setDeviceSyncBusy("calendar");
    try {
      const result = await syncItineraryToDeviceCalendar(itinerary);
      setCalendarEventCount(result.syncedCount);
      const status = result.status === "synced" ? "synced" : result.status === "failed" ? "failed" : "ready";
      applyDeviceSyncPatch("calendar", result.detail, status);
      if (result.status === "synced") {
        Alert.alert("日历已写入", `${result.detail}\n\n可在系统日历「蓝V出行」中查看。`, [
          { text: "打开系统日历", onPress: () => void openSystemCalendarApp() },
          { text: "好的" },
        ]);
      } else if (result.status === "permission-denied") {
        Alert.alert("需要日历权限", result.detail, [
          { text: "打开设置", onPress: () => void openNotificationSettings() },
          { text: "取消", style: "cancel" },
        ]);
      } else {
        Alert.alert("日历同步", result.detail);
      }
    } finally {
      setDeviceSyncBusy(null);
    }
  }

  async function handleSyncMemo() {
    if (!itinerary || deviceSyncBusy) return;
    setDeviceSyncBusy("memo");
    const startDate = itinerary.intent.start_date ?? structured.startDate;
    try {
      const result = await syncItineraryToDeviceMemo(itinerary, startDate);
      const status = result.status === "synced" ? "synced" : result.status === "failed" ? "failed" : "ready";
      applyDeviceSyncPatch("memo", result.detail, status);
      if (result.status === "synced" && Platform.OS === "android") {
        Alert.alert("备忘录已写入", result.detail, [
          {
            text: "分享到笔记 App",
            onPress: () => {
              void Share.share({
                message: buildItineraryMemoText(itinerary, startDate),
                title: `${itinerary.title} · 行程备忘`,
              });
            },
          },
          { text: "打开日历查看", onPress: () => void openSystemCalendarApp() },
          { text: "好的" },
        ]);
      } else if (result.status === "synced" && Platform.OS === "ios") {
        Alert.alert("备忘录已写入", result.detail, [
          { text: "打开提醒事项", onPress: () => void openSystemRemindersApp() },
          { text: "好的" },
        ]);
      } else if (result.status === "permission-denied") {
        Alert.alert("需要权限", result.detail, [
          { text: "打开设置", onPress: () => void openNotificationSettings() },
          { text: "取消", style: "cancel" },
        ]);
      } else {
        Alert.alert(result.status === "synced" ? "备忘录已写入" : "备忘录同步", result.detail);
      }
    } finally {
      setDeviceSyncBusy(null);
    }
  }

  async function handleSyncAlarm() {
    if (!itinerary || deviceSyncBusy) return;
    setDeviceSyncBusy("alarm");
    try {
      const result = await syncItineraryReminders(itinerary);
      const status = result.status === "synced" ? "synced" : result.status === "failed" ? "failed" : "ready";
      applyDeviceSyncPatch("alarm", result.detail, status);
      if (result.status === "permission-denied" || result.status === "unsupported") {
        Alert.alert("提醒同步", result.detail, [
          ...(result.status === "permission-denied"
            ? [{ text: "打开设置", onPress: () => void openNotificationSettings() }]
            : []),
          { text: "知道了" },
        ]);
      } else {
        Alert.alert(result.status === "synced" ? "提醒已写入" : "提醒同步", result.detail);
      }
    } finally {
      setDeviceSyncBusy(null);
    }
  }

  async function handleSyncClock() {
    if (!itinerary || deviceSyncBusy) return;
    setDeviceSyncBusy("clock");
    const startDate = itinerary.intent.start_date ?? structured.startDate;
    try {
      const result = await syncItineraryToDeviceClockAlarms(itinerary);
      const status = result.status === "synced" ? "synced" : result.status === "failed" ? "failed" : "ready";
      applyDeviceSyncPatch("clock", result.detail, status);
      if (result.status === "synced") {
        const nextItem = resolveNextClockItem(itinerary.items, startDate);
        const buttons: { text: string; onPress?: () => void }[] = [{ text: "好的" }];
        if (Platform.OS === "android" && nextItem) {
          const [hour, minute] = nextItem.start_time.split(":").map((value) => Number.parseInt(value, 10));
          const alarmMinute = minute - 30;
          const alarmHour = alarmMinute < 0 ? hour - 1 : hour;
          const normalizedMinute = alarmMinute < 0 ? alarmMinute + 60 : alarmMinute;
          const normalizedHour = alarmHour < 0 ? alarmHour + 24 : alarmHour;
          buttons.unshift({
            text: "打开时钟确认",
            onPress: () => {
              void openAndroidClockAlarm(
                normalizedHour,
                normalizedMinute,
                `蓝V出行 · ${nextItem.title}`,
              );
            },
          });
        } else if (Platform.OS === "ios") {
          buttons.unshift({ text: "打开系统日历", onPress: () => void openSystemCalendarApp() });
        }
        Alert.alert("系统闹钟已写入", result.detail, buttons);
      } else if (result.status === "permission-denied") {
        Alert.alert("需要权限", result.detail, [
          { text: "打开设置", onPress: () => void openNotificationSettings() },
          { text: "取消", style: "cancel" },
        ]);
      } else if (result.status === "unsupported") {
        Alert.alert("系统闹钟", result.detail);
      } else {
        Alert.alert("系统闹钟", result.detail);
      }
    } finally {
      setDeviceSyncBusy(null);
    }
  }

  async function handleSyncWidget() {
    if (!itinerary || deviceSyncBusy) return;
    setDeviceSyncBusy("widget");
    const startDate = itinerary.intent.start_date ?? structured.startDate;
    const nextItem = resolveNextWidgetItem(itinerary.items, startDate);
    try {
      const result = await enableTripWidgetNotification(
        itinerary,
        startDate,
        nextItem ? riskTextForItem(nextItem, undefined) : undefined,
      );
      const status = result.status === "synced" ? "synced" : result.status === "failed" ? "failed" : "ready";
      applyDeviceSyncPatch("widget", result.detail, status);
      if (result.status === "permission-denied" || result.status === "unsupported") {
        Alert.alert("通知栏行程卡", result.detail, [
          ...(result.status === "permission-denied"
            ? [{ text: "打开设置", onPress: () => void openNotificationSettings() }]
            : []),
          { text: "知道了" },
        ]);
      } else {
        Alert.alert(result.status === "synced" ? "行程卡已推送" : "通知栏行程卡", result.detail);
      }
    } finally {
      setDeviceSyncBusy(null);
    }
  }

  async function handleReadSystemData() {
    if (!itinerary) return;
    const [calendarRead, memoRead, clockRead] = await Promise.all([
      readSyncedCalendarEvents(itinerary.id),
      readSyncedMemo(itinerary.id),
      readSyncedClockAlarms(itinerary.id),
    ]);
    setCalendarEventCount(calendarRead.eventCount);
    Alert.alert("系统数据验证", `${calendarRead.detail}\n${memoRead.detail}\n${clockRead.detail}`);
  }

  function handleOpenSyncItem(target: SyncItem["target"]) {
    if (target === "calendar") void handleSyncCalendar();
    else if (target === "memo") void handleSyncMemo();
    else if (target === "alarm") void handleSyncAlarm();
    else if (target === "clock") void handleSyncClock();
    else if (target === "widget") void handleSyncWidget();
    else if (target === "map") Alert.alert("地图", "请在智能跳转区打开高德路线。");
  }

  async function handleRefreshWeather() {
    const target = itinerary ?? selectedOption?.itinerary ?? null;
    if (!target?.id) return;
    setWeatherSyncing(true);
    try {
      const data = await getItineraryWeather(target.id);
      setItineraryWeather(data);
      showToast(data.available ? "天气已同步" : data.summary || "暂无天气数据", data.available ? "success" : "info");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "天气同步失败", "error");
    } finally {
      setWeatherSyncing(false);
    }
  }

  async function handleExportPdf() {
    if (!itinerary) return;
    setLoading(true);
    try {
      const result = await exportItineraryPdf(itinerary, review);
      if (result.status === "failed") {
        Alert.alert("导出 PDF 失败", result.detail);
      } else if (result.status === "unsupported") {
        Alert.alert("导出 PDF", result.detail);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleExecute() {
    if (!order || !itinerary) return;
    setLoading(true);
    try {
      const authorized = await authorizePayment(order.id);
      const executed = await executeOrder(authorized.order.id);
      setOrder(executed.order);
      const executedItinerary = executed.order.option.itinerary;
      setItinerary(executedItinerary);
      const synced = await syncSystem(executedItinerary.id, executed.order.id);
      const startDate = executedItinerary.intent.start_date ?? structured.startDate;
      const outcomes = await runFullDeviceSync(
        executedItinerary,
        startDate,
        resolveNextWidgetItem,
        (item) => riskTextForItem(item, undefined),
        {},
      );
      const merged = mergeDeviceSyncIntoResult(synced.sync, outcomes);
      setSyncResult(merged);
      void persistDeviceSync(merged);
      setCalendarEventCount(outcomes.calendarSync.syncedCount);
      setStage("guardian");
    } catch (error) {
      Alert.alert("执行失败", error instanceof Error ? error.message : "请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  async function handleGuardian() {
    if (!itinerary) return;
    setLoading(true);
    try {
      const incident = await simulateIncident(itinerary.id);
      const nextProposal = await requestReplan(itinerary.id, {
        incidentId: incident.incident.id,
      });
      const status = await getGuardianStatus(itinerary.id);
      setGuardian(status.guardian);
      setProposal(nextProposal.proposal);
    } catch (error) {
      Alert.alert("守护检测失败", error instanceof Error ? error.message : "请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  async function handleAcceptReplan() {
    if (!proposal) return;
    setLoading(true);
    try {
      const response = await acceptReplan(proposal.id);
      if (response.itinerary) setItinerary(response.itinerary);
      setProposal(null);
    } catch (error) {
      Alert.alert("重规划失败", error instanceof Error ? error.message : "请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  async function handleReview() {
    if (!itinerary) return;
    setLoading(true);
    try {
      const response = await getTripReview(itinerary.id);
      setReview(response.review);
      setStage("review");
    } catch (error) {
      Alert.alert("回顾生成失败", error instanceof Error ? error.message : "请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  async function applyItineraryUpdate(itinerary: Itinerary) {
    setItinerary(itinerary);
    if (selectedOption) {
      setSelectedOption({ ...selectedOption, itinerary });
    }
    if (comparison) {
      setComparison({
        ...comparison,
        options: comparison.options.map((option) =>
          option.itinerary.id === itinerary.id ? { ...option, itinerary } : option,
        ),
      });
    }
  }

  async function handleSmartUpdateNode(
    itemId: string,
    payload: Parameters<typeof smartUpdateNode>[2],
    instruction?: string,
    options?: { silent?: boolean },
  ) {
    if (!itinerary) return null;
    const response = await smartUpdateNode(itinerary.id, itemId, payload, instruction);
    if (response.itinerary) {
      await applyItineraryUpdate(response.itinerary);
    }
    if (!options?.silent) {
      const affected = response.affected_item_ids?.length ?? 0;
      const warningText = response.warnings?.length
        ? `\n\n⚠ ${response.warnings.join("；")}`
        : "";
      Alert.alert(
        "智能联动完成",
        `${response.change_summary || "行程已更新。"}\n\n共联动 ${affected} 个节点。${warningText}`,
      );
    }
    return response;
  }

  function handleEditNode(item: ItineraryItem) {
    setNodeEditMode("edit");
    setNodeAddAfterId(null);
    setNodeEditDraft(draftFromItem(item));
  }

  function suggestEndTime(startTime: string) {
    const match = startTime.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return "12:00";
    const total = Number(match[1]) * 60 + Number(match[2]) + 90;
    const hours = Math.floor(total / 60) % 24;
    const minutes = total % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  function handleAddAfterItem(item: ItineraryItem) {
    setNodeEditMode("add");
    setNodeAddAfterId(item.id);
    setNodeEditDraft({
      id: "",
      title: "",
      start_time: suggestEndTime(item.end_time || item.start_time),
      end_time: suggestEndTime(suggestEndTime(item.end_time || item.start_time)),
      location: item.location || "",
      category: "free",
      day: item.day,
    });
  }

  function handleDeleteItem(item: ItineraryItem) {
    if (!itinerary) return;
    Alert.alert("确认删除", `确定删除「${item.title}」？Agent 将联动调整剩余行程。`, [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: async () => {
          setNodeSaving(true);
          try {
            const response = await deleteNode(itinerary.id, item.id);
            if (response.itinerary) await applyItineraryUpdate(response.itinerary);
            if (nodeEditDraft?.id === item.id) setNodeEditDraft(null);
            Alert.alert("已删除", response.change_summary || "节点已删除。");
          } catch (error) {
            Alert.alert("删除失败", error instanceof Error ? error.message : "请稍后重试");
          } finally {
            setNodeSaving(false);
          }
        },
      },
    ]);
  }

  async function handleNavigateSegment(from: ItineraryItem, to: ItineraryItem) {
    const nativeUrl = buildAmapNavigateUrl(to, from);
    const webUrl = buildAmapWebNavigateUrl(to, from);
    try {
      await openExternalUrl(nativeUrl, webUrl);
    } catch {
      Alert.alert("跳转失败", "请确认已安装高德地图。");
    }
  }

  function handleNavigateFromEdit() {
    if (!nodeEditDraft || !itinerary) return;
    const sorted = sortItineraryItems(itinerary.items);
    const index = sorted.findIndex((item) => item.id === nodeEditDraft.id);
    const current = index >= 0 ? sorted[index] : null;
    if (!current) return;
    if (index <= 0) {
      void (async () => {
        try {
          await openExternalUrl(buildAmapNavigateUrl(current), buildAmapWebNavigateUrl(current));
        } catch {
          Alert.alert("跳转失败", "请确认已安装高德地图。");
        }
      })();
      return;
    }
    void handleNavigateSegment(sorted[index - 1], current);
  }

  async function handleSaveNodeEdit() {
    if (!nodeEditDraft || !itinerary) return;
    setNodeSaving(true);
    try {
      if (nodeEditMode === "add") {
        const response = await addNode(itinerary.id, {
          day: nodeEditDraft.day ?? 1,
          start_time: nodeEditDraft.start_time.trim(),
          end_time: suggestEndTime(nodeEditDraft.start_time.trim()),
          title: nodeEditDraft.title.trim() || undefined,
          location: nodeEditDraft.location.trim() || undefined,
          category: nodeEditDraft.category ?? "free",
          insert_after_item_id: nodeAddAfterId ?? undefined,
          instruction: "请联动调整相邻节点的时间、交通缓冲与地点描述。",
        });
        if (response.itinerary) await applyItineraryUpdate(response.itinerary);
        setNodeEditDraft(null);
        setNodeAddAfterId(null);
        Alert.alert("节点已添加", response.change_summary || "新节点已加入行程。");
        return;
      }

      const response = await handleSmartUpdateNode(
        nodeEditDraft.id,
        {
          title: nodeEditDraft.title.trim(),
          start_time: nodeEditDraft.start_time.trim(),
          location: nodeEditDraft.location.trim(),
        },
        "请联动检查同日后续节点时间、交通缓冲与地点描述是否需要同步调整。",
        { silent: true },
      );
      setNodeEditDraft(null);
      const affected = response?.affected_item_ids?.length ?? 0;
      Alert.alert(
        "智能联动完成",
        `${response?.change_summary || "修改已同步到行程与地图。"}\n\n共联动 ${affected} 个节点。`,
      );
    } catch (error) {
      Alert.alert(nodeEditMode === "add" ? "添加失败" : "保存失败", error instanceof Error ? error.message : "请稍后重试");
    } finally {
      setNodeSaving(false);
    }
  }

  async function handleDeleteNodeEdit() {
    if (!nodeEditDraft || !itinerary) return;
    const title = nodeEditDraft.title.trim();
    Alert.alert("确认删除", `确定删除「${title}」？Agent 将联动调整剩余行程。`, [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: async () => {
          setNodeSaving(true);
          try {
            const response = await deleteNode(itinerary.id, nodeEditDraft.id);
            if (response.itinerary) await applyItineraryUpdate(response.itinerary);
            setNodeEditDraft(null);
            Alert.alert("已删除", response.change_summary || "节点已删除。");
          } catch (error) {
            Alert.alert("删除失败", error instanceof Error ? error.message : "请稍后重试");
          } finally {
            setNodeSaving(false);
          }
        },
      },
    ]);
  }

  async function handleMoveNode(itemId: string, direction: "up" | "down") {
    if (!itinerary) return;
    const index = itinerary.items.findIndex((item) => item.id === itemId);
    if (index < 0) return;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= itinerary.items.length) return;

    const itemIds = itinerary.items.map((item) => item.id);
    [itemIds[index], itemIds[targetIndex]] = [itemIds[targetIndex], itemIds[index]];

    setNodeSaving(true);
    try {
      const response = await reorderNodes(itinerary.id, itemIds);
      if (response.itinerary) await applyItineraryUpdate(response.itinerary);
      const affected = response.affected_item_ids?.length ?? 0;
      Alert.alert(
        "顺序已更新",
        `${response.change_summary || "节点顺序已调整。"}${affected ? `\n\n共联动 ${affected} 个节点。` : ""}`,
      );
    } catch (error) {
      Alert.alert("调整失败", error instanceof Error ? error.message : "请稍后重试");
    } finally {
      setNodeSaving(false);
    }
  }

  function handleMapInteraction(active: boolean) {
    if (mapTouchTimer.current) {
      clearTimeout(mapTouchTimer.current);
      mapTouchTimer.current = null;
    }
    if (active) {
      setPageScrollEnabled(false);
      return;
    }
    mapTouchTimer.current = setTimeout(() => setPageScrollEnabled(true), 350);
  }

  async function handleEmergencyAdjust(kind: EmergencyKind, detail?: string) {
    if (!itinerary) return;
    setLoading(true);
    try {
      const response = await requestEmergencyAdjust(itinerary.id, kind, detail);
      setProposal(response.proposal);
      const status = await getGuardianStatus(itinerary.id);
      setGuardian(status.guardian);
    } catch (error) {
      Alert.alert("调整失败", error instanceof Error ? error.message : "请稍后重试");
      throw error;
    } finally {
      setLoading(false);
    }
  }

  async function handleRefineChat(instruction: string) {
    if (!itinerary) return "请先生成行程。";
    const response = await refineItinerary(itinerary.id, instruction);
    if (response.itinerary) await applyItineraryUpdate(response.itinerary);
    return response.reply;
  }

  const mainTab = stageToTab(stage);
  const isDarkShell = stage === "order";

  function handleMainTabChange(tab: MainTab) {
    if (tab === 0) {
      setStage(analysis ? "analyze" : "input");
      return;
    }
    if (tab === 1) {
      if (itinerary) {
        setStage(stage === "compare" ? "compare" : "compareDetail");
        return;
      }
      if (comparison) {
        setStage("compare");
        return;
      }
      Alert.alert("请先输入", "完成意图输入并生成候选方案后，再进入时空拓扑。");
      return;
    }
    if (tab === 2) {
      if (itinerary) {
        setStage("guardian");
        return;
      }
      Alert.alert("暂无行程", "请先生成行程后再进入动态微调。");
      return;
    }
    if (order) {
      setStage("order");
      return;
    }
    if (itinerary && selectedOption) {
      void handlePrepare(selectedOption);
      return;
    }
    Alert.alert("请先确认方案", "请在时空拓扑页确认方案并准备跨端执行。");
  }

  function handlePermissionPrimerConfirm() {
    setPermissionPrimerVisible(false);
    if (pendingExecute) {
      setPendingExecute(false);
      void handleExecute();
    }
  }

  const topologyItinerary = itinerary ?? selectedOption?.itinerary ?? null;
  const startDateIso = topologyItinerary?.intent.start_date ?? structured.startDate;

  return (
    <View style={styles.page}>
      <BlueMapShell
        dark={isDarkShell}
        currentTab={mainTab}
        onTabChange={handleMainTabChange}
        scrollEnabled={pageScrollEnabled}
        scrollRef={pageScrollRef}
        contentContainerStyle={isDarkShell ? styles.shellContentDark : undefined}
      >
        {stage === "input" ? (
          <IntentInputPanel
              message={message}
              onMessageChange={setMessage}
              structured={structured}
              setStructured={setStructured}
              travelPreferences={travelPreferences}
              onTravelPreferencesChange={setTravelPreferences}
              uploads={uploads}
              onUploadPress={handleUpload}
              onAnalyze={handleAnalyze}
              loading={loading}
            intentActions={analysis?.five_elements.actions}
          />
        ) : null}

        {stage === "analyze" && analysis ? (
          <IntentAnalysisPanel
            analysis={analysis}
            loading={loading}
            onConfirm={handleCompare}
            onBack={() => setStage("input")}
          />
        ) : null}

        {stage === "compare" ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>候选拓扑方案</Text>
            {comparison?.options.map((option) => (
              <Pressable
                key={option.id}
                style={[styles.optionCard, selectedOption?.id === option.id ? styles.optionCardActive : null]}
                onPress={() => handleSelectPlanForTopology(option)}
              >
                <View style={styles.optionHeader}>
                  <Text style={styles.optionTitle}>{option.title}</Text>
                  <Text style={styles.price}>¥{option.quote.total_price}</Text>
                </View>
                <Text style={styles.summary}>{option.recommendation}</Text>
                <View style={styles.metrics}>
                  <Text style={styles.metric}>耗时 {option.quote.duration_text}</Text>
                  <Text style={styles.metric}>舒适 {option.quote.comfort_score}</Text>
                  <Text style={styles.metric}>风险 {option.quote.risk_level}</Text>
                </View>
                <Text style={styles.warning}>{option.risks.join(" · ")}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {(stage === "compareDetail" || stage === "widget") && topologyItinerary ? (
          <TopologyShell
            itinerary={topologyItinerary}
            city={structured.destination}
            weather={itineraryWeather}
            weatherLoading={weatherSyncing}
            onRefreshWeather={() => void handleRefreshWeather()}
            showConfirmCta={Boolean(selectedOption)}
            confirmLoading={loading}
            confirmLabel="确认此方案并进入跨端执行  ›"
            onConfirm={() => {
              if (selectedOption) void handlePrepare(selectedOption);
            }}
            onGoRefine={() => setStage("guardian")}
          >
            <MapTopologyBoard
              itinerary={topologyItinerary}
              city={structured.destination}
              startDate={startDateIso}
              itemWeather={itemWeatherMap}
              busy={nodeSaving || poiLoading}
              poiSearching={poiSearching}
              onUpdateNode={async (itemId, payload) => {
                const item = topologyItinerary.items.find((entry) => entry.id === itemId);
                const instruction = item
                  ? `用户拖动了「${item.title}」的地图位置，请检查地点描述与后续交通时间是否需要联动调整。`
                  : undefined;
                await handleSmartUpdateNode(itemId, payload, instruction, { silent: true });
              }}
              onEditItem={handleEditNode}
              onNavigateSegment={handleNavigateSegment}
              onDeleteItem={handleDeleteItem}
              onAddAfterItem={handleAddAfterItem}
              onRecommendPOI={handleRecommendFromItem}
              onMapInteractionChange={handleMapInteraction}
            />
          </TopologyShell>
        ) : null}

        {stage === "guardian" && topologyItinerary ? (
          <DynamicRefinePanel
            itinerary={topologyItinerary}
            startDate={startDateIso}
            syncResult={syncResult}
            guardian={guardian}
            proposal={proposal}
            loading={loading}
            onEmergencyAdjust={handleEmergencyAdjust}
            onAcceptReplan={handleAcceptReplan}
            onGoExecution={() => setStage("order")}
            onRefineChat={handleRefineChat}
            onQuickRecommendFood={() => handleQuickRecommend("food")}
            onQuickRecommendHotel={() => handleQuickRecommend("hotel")}
            onUpload={handleUpload}
            poiSearching={poiSearching}
          />
        ) : null}

        {stage === "order" && order && itinerary ? (
          <ExecutionPanel
            order={order}
            itinerary={itinerary}
            syncResult={syncResult}
            startDate={startDateIso}
            loading={loading || Boolean(deviceSyncBusy)}
            calendarEventCount={calendarEventCount}
            priceQuote={priceQuote}
            expenseTotal={expenseLines.length ? expenseSummary.total : null}
            expenseBreakdown={expenseLines.length ? expenseSummary : null}
            weatherSummary={itineraryWeather?.summary ?? null}
            itemWeather={itemWeatherMap}
            onRefreshWeather={() => void handleRefreshWeather()}
            onExecute={handleExecute}
            onSyncCalendar={handleSyncCalendar}
            onSyncAlarm={handleSyncAlarm}
            onSyncClock={handleSyncClock}
            onSyncWidget={handleSyncWidget}
            onSyncMemo={handleSyncMemo}
            onReadSystemData={handleReadSystemData}
            onOpenSyncItem={handleOpenSyncItem}
            onShareTrip={() => {
              void Share.share({
                message: buildItineraryMemoText(itinerary, startDateIso),
                title: itinerary.title,
              });
            }}
            onExportPdf={() => void handleExportPdf()}
            onExpenseStats={() => setExpenseStatsVisible(true)}
            onGoTopology={() => setStage("compareDetail")}
            onGoRefine={() => setStage("guardian")}
          />
        ) : null}

        {stage === "review" ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>回顾与沉淀</Text>
            {review ? (
              <View style={styles.summaryCard}>
                <Text style={styles.panelTitle}>行程回顾</Text>
                <Text style={styles.summary}>{review.summary}</Text>
                <Text style={styles.price}>预算合计 ¥{review.budget_total}</Text>
                <Text style={styles.panelTitle}>偏好记忆</Text>
                {review.preference_memory.map((item) => (
                  <Text key={item} style={styles.summary}>
                    • {item}
                  </Text>
                ))}
                <Text style={styles.panelTitle}>下次建议</Text>
                {review.next_trip_suggestions.map((item) => (
                  <Text key={item} style={styles.summary}>
                    • {item}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </BlueMapShell>

      {topologyItinerary ? (
        <NodeEditModal
          visible={nodeEditDraft != null}
          mode={nodeEditMode}
          draft={nodeEditDraft}
          itemCategory={
            nodeEditMode === "edit" && nodeEditDraft
              ? topologyItinerary.items.find((item) => item.id === nodeEditDraft.id)?.category
              : nodeEditDraft?.category
          }
          dateLabel={
            nodeEditDraft
              ? formatItemDateLabel(
                  startDateIso,
                  nodeEditDraft.day ??
                    topologyItinerary.items.find((item) => item.id === nodeEditDraft.id)?.day ??
                    1,
                )
              : undefined
          }
          saving={nodeSaving}
          onChange={setNodeEditDraft}
          onClose={() => {
            setNodeEditDraft(null);
            setNodeAddAfterId(null);
          }}
          onSave={handleSaveNodeEdit}
          onDelete={nodeEditMode === "edit" ? handleDeleteNodeEdit : undefined}
          onNavigate={nodeEditMode === "edit" ? handleNavigateFromEdit : undefined}
          onPickFood={
            nodeEditMode === "edit" && nodeEditDraft
              ? () => {
                  const item = topologyItinerary.items.find((entry) => entry.id === nodeEditDraft.id);
                  if (item) handleRecommendFromItem(item);
                }
              : undefined
          }
          onPickHotel={
            nodeEditMode === "edit" && nodeEditDraft
              ? () => {
                  const item = topologyItinerary.items.find((entry) => entry.id === nodeEditDraft.id);
                  if (item) handleRecommendFromItem({ ...item, category: "hotel" });
                }
              : undefined
          }
          onPickSight={
            nodeEditMode === "edit" && nodeEditDraft
              ? () => {
                  const item = topologyItinerary.items.find((entry) => entry.id === nodeEditDraft.id);
                  if (item) handleRecommendFromItem({ ...item, category: "sight" });
                }
              : undefined
          }
          onAddAfter={
            nodeEditMode === "edit" && nodeEditDraft
              ? () => {
                  const item = topologyItinerary.items.find((entry) => entry.id === nodeEditDraft.id);
                  if (item) {
                    setNodeEditDraft(null);
                    handleAddAfterItem(item);
                  }
                }
              : undefined
          }
        />
      ) : null}

      <OptionPickerModal
        visible={poiPickerVisible}
        title={poiPickerTitle}
        summary={poiSummary}
        recommendation={poiRecommendation}
        candidates={poiCandidates}
        loading={poiLoading}
        category={poiContext?.category}
        city={itinerary?.intent.destination || structured.destination}
        onClose={() => {
          setPoiPickerVisible(false);
          setPoiContext(null);
        }}
        onConfirm={handleConfirmPOI}
      />

      <PermissionPrimerModal
        visible={permissionPrimerVisible}
        onConfirm={handlePermissionPrimerConfirm}
        onCancel={() => {
          setPermissionPrimerVisible(false);
          setPendingExecute(false);
        }}
      />

      <ExpenseStatsModal
        visible={expenseStatsVisible}
        quote={priceQuote}
        lines={expenseLines}
        onChange={setExpenseLines}
        onClose={() => setExpenseStatsVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: theme.colors.bgSky },
  shellContentDark: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
  },
  section: { marginTop: 4, gap: 10 },
  sectionTitle: { color: "#233B63", fontSize: 14, fontWeight: "900", marginBottom: 10 },
  cta: { minHeight: 48, marginTop: 14, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "#1B63FF" },
  ctaText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  secondaryCta: { minHeight: 42, marginTop: 12, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "#E7F3FF" },
  secondaryCtaText: { color: "#287CFF", fontWeight: "900" },
  optionCard: { marginTop: 10, padding: 12, borderRadius: 16, backgroundColor: "#F7FBFF", borderWidth: 1, borderColor: "transparent" },
  optionCardActive: { borderColor: "#287CFF", backgroundColor: "#FFFFFF" },
  optionHeader: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  optionTitle: { flex: 1, color: "#233B63", fontSize: 14, fontWeight: "900" },
  price: { color: "#1B63FF", fontSize: 16, fontWeight: "900" },
  summaryCard: { marginTop: 10, padding: 12, borderRadius: 14, backgroundColor: "#F7FBFF" },
  panelTitle: { color: "#233B63", fontSize: 14, fontWeight: "900", marginTop: 6 },
  summary: { color: "#7085A2", fontSize: 11, lineHeight: 17, fontWeight: "800", marginTop: 5 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  metric: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, overflow: "hidden", color: "#527099", backgroundColor: "#FFFFFF", fontSize: 10, fontWeight: "900" },
  warning: { color: "#F97316", backgroundColor: "#FFF7ED", borderRadius: 12, padding: 10, marginTop: 8, fontSize: 11, lineHeight: 16 },
  stepCard: { flexDirection: "row", gap: 10, marginTop: 8, padding: 10, borderRadius: 13, backgroundColor: "#FFFFFF" },
  stepStatus: { width: 24, color: "#12C8AD", fontSize: 16, fontWeight: "900" },
  flex: { flex: 1 },
  stepTitle: { color: "#2A4266", fontSize: 12, fontWeight: "900" },
  entityGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  entityPill: { width: "48%", padding: 9, borderRadius: 12, backgroundColor: "#FFFFFF" },
  entityLabel: { color: "#287CFF", fontSize: 10, fontWeight: "900" },
  entityValue: { marginTop: 4, color: "#7085A2", fontSize: 11, lineHeight: 15 },
  topologySummary: { gap: 8, padding: 12, borderRadius: 14, backgroundColor: "#F7FBFF", marginBottom: 10 },
  topologyTitle: { color: "#233B63", fontSize: 13, fontWeight: "900" },
  topologyCopy: { color: "#7085A2", fontSize: 11, lineHeight: 16, fontWeight: "800" },
  topologyChips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  topologyChip: {
    minWidth: 62,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },
  topologyChipWarn: { backgroundColor: "#FFF7ED" },
  topologyChipValue: { color: "#287CFF", fontSize: 15, fontWeight: "900" },
  topologyChipLabel: { marginTop: 2, color: "#7F93B1", fontSize: 9, fontWeight: "900" },
  priceCard: {
    marginBottom: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D8E6FF",
    gap: 6,
  },
  priceCardTitle: { color: "#30496F", fontSize: 12, fontWeight: "900" },
  priceTotal: { color: "#1B63FF", fontSize: 24, fontWeight: "900" },
  priceMetrics: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  priceMetric: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#EEF6FF",
    color: "#527099",
    fontSize: 10,
    fontWeight: "900",
    overflow: "hidden",
  },
  priceSource: { color: "#8BA0BD", fontSize: 10, lineHeight: 15 },
  quickPickRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  quickPickBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E8FFF3",
    borderWidth: 1,
    borderColor: "#B8EBD0",
  },
  quickPickText: { color: "#1A9D5C", fontSize: 12, fontWeight: "900" },
});
