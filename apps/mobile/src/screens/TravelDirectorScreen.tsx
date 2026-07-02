import { useEffect, useRef, useState } from "react";
import { Alert, Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";

import { AgentStatus } from "../components/AgentStatus";
import { IntentAnalysisPanel } from "../components/IntentAnalysisPanel";
import { IntentInputPanel, UploadedFile } from "../components/IntentInputPanel";
import { ItineraryCard } from "../components/ItineraryCard";
import { MapTopologyBoard } from "../components/MapTopologyBoard";
import { draftFromItem, NodeEditDraft, NodeEditModal } from "../components/NodeEditModal";
import {
  acceptReplan,
  analyzeIntent,
  authorizePayment,
  buildTravelRequest,
  comparePlans,
  executeOrder,
  getGuardianStatus,
  getTripReview,
  prepareOrder,
  requestReplan,
  updateNode,
  simulateIncident,
  syncSystem,
  uploadTravelDocument,
} from "../services/api";
import {
  GuardianStatus,
  IntentAnalysis,
  Itinerary,
  ItineraryItem,
  PlanComparison,
  PlanOption,
  ReplanProposal,
  SystemSyncResult,
  TravelOrder,
  TripReview,
} from "../types";
import { buildEffectiveMessage, defaultStructured, parseTravelFromText, StructuredFields } from "../utils/parseTravelInput";

const samplePrompt = "";
const screenWidth = Dimensions.get("window").width;

type Stage = "input" | "analyze" | "compare" | "order" | "guardian" | "review";

const stageMeta: Array<{ id: Stage; title: string; subtitle: string }> = [
  { id: "input", title: "D1 需求输入", subtitle: "多模态理解" },
  { id: "analyze", title: "D1 解析确认", subtitle: "五要素理解" },
  { id: "compare", title: "D2 方案比对", subtitle: "路线与预算" },
  { id: "order", title: "D3 确认订票", subtitle: "授权执行" },
  { id: "guardian", title: "D4 动态守护", subtitle: "异常重规划" },
  { id: "review", title: "D5 回顾沉淀", subtitle: "记忆同步" },
];

export function TravelDirectorScreen() {
  const [stage, setStage] = useState<Stage>("input");
  const [message, setMessage] = useState(samplePrompt);
  const [structured, setStructured] = useState<StructuredFields>(defaultStructured());
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [uploads, setUploads] = useState<UploadedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [pageScrollEnabled, setPageScrollEnabled] = useState(true);
  const [nodeEditDraft, setNodeEditDraft] = useState<NodeEditDraft | null>(null);
  const [nodeSaving, setNodeSaving] = useState(false);
  const pageScrollRef = useRef<ScrollView>(null);
  const mapTouchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [documentIds, setDocumentIds] = useState<string[]>([]);
  const [comparison, setComparison] = useState<PlanComparison | null>(null);
  const [selectedOption, setSelectedOption] = useState<PlanOption | null>(null);
  const [order, setOrder] = useState<TravelOrder | null>(null);
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [syncResult, setSyncResult] = useState<SystemSyncResult | null>(null);
  const [guardian, setGuardian] = useState<GuardianStatus | null>(null);
  const [proposal, setProposal] = useState<ReplanProposal | null>(null);
  const [review, setReview] = useState<TripReview | null>(null);
  const [analysis, setAnalysis] = useState<IntentAnalysis | null>(null);

  useEffect(() => {
    const hints = parseTravelFromText(message);
    if (hints.tags.length) {
      setSelectedTags((current) => Array.from(new Set([...current, ...hints.tags])));
    }
  }, [message]);

  const subtitle = loading
    ? "Agent 正在执行当前阶段"
    : order?.status === "completed"
      ? "订票、酒店、地图和日历已进入同步阶段"
      : comparison
        ? `${comparison.options.length} 个候选方案已生成`
        : "多模态输入 · 方案比对 · 跨端执行 · 动态守护";

  function toggleTag(tag: string) {
    setSelectedTags((current) => (current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]));
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
    const effectiveMessage = buildEffectiveMessage(message, structured, selectedTags);
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
    const effectiveMessage = buildEffectiveMessage(message, structured, selectedTags);
    if (!effectiveMessage) {
      Alert.alert("请先输入需求", "可通过文字、语音，或填写出发地/目的地后解析。");
      return;
    }
    if (!message.trim()) setMessage(effectiveMessage);
    setLoading(true);
    try {
      const response = await comparePlans(buildTravelRequest(effectiveMessage, structured, documentIds, selectedTags));
      setComparison(response.comparison);
      const recommended =
        response.comparison.options.find((item) => item.id === response.comparison.recommended_option_id) ??
        response.comparison.options[0];
      setSelectedOption(recommended);
      setItinerary(recommended.itinerary);
      setStage("compare");
    } catch (error) {
      Alert.alert("方案生成失败", error instanceof Error ? error.message : "请确认后端已启动");
    } finally {
      setLoading(false);
    }
  }

  async function handlePrepare(option: PlanOption) {
    if (!comparison) return;
    setLoading(true);
    try {
      setSelectedOption(option);
      const response = await prepareOrder(comparison.id, option.id);
      setOrder(response.order);
      setItinerary(response.order.option.itinerary);
      setStage("order");
    } catch (error) {
      Alert.alert("订单准备失败", error instanceof Error ? error.message : "请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  async function handleExecute() {
    if (!order) return;
    setLoading(true);
    try {
      const authorized = await authorizePayment(order.id);
      const executed = await executeOrder(authorized.order.id);
      setOrder(executed.order);
      setItinerary(executed.order.option.itinerary);
      const synced = await syncSystem(executed.order.option.itinerary.id, executed.order.id);
      setSyncResult(synced.sync);
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
      const nextProposal = await requestReplan(itinerary.id, incident.incident.id);
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

  async function handleUpdateNode(itemId: string, payload: Parameters<typeof updateNode>[2]) {
    if (!itinerary) return;
    const response = await updateNode(itinerary.id, itemId, payload);
    if (response.itinerary) {
      setItinerary(response.itinerary);
      if (selectedOption) {
        setSelectedOption({ ...selectedOption, itinerary: response.itinerary });
      }
      if (comparison) {
        setComparison({
          ...comparison,
          options: comparison.options.map((option) =>
            option.itinerary.id === response.itinerary?.id
              ? { ...option, itinerary: response.itinerary! }
              : option,
          ),
        });
      }
    }
  }

  function handleEditNode(item: ItineraryItem) {
    setNodeEditDraft(draftFromItem(item));
  }

  async function handleSaveNodeEdit() {
    if (!nodeEditDraft) return;
    setNodeSaving(true);
    try {
      await handleUpdateNode(nodeEditDraft.id, {
        title: nodeEditDraft.title.trim(),
        start_time: nodeEditDraft.start_time.trim(),
        location: nodeEditDraft.location.trim(),
      });
      setNodeEditDraft(null);
      Alert.alert("节点已更新", "修改已同步到行程与地图。");
    } catch (error) {
      Alert.alert("保存失败", error instanceof Error ? error.message : "请稍后重试");
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

  return (
    <ScrollView
      ref={pageScrollRef}
      style={styles.page}
      contentContainerStyle={styles.pageContent}
      scrollEnabled={pageScrollEnabled}
      nestedScrollEnabled
    >
      <View style={styles.phoneFrame}>
        <View style={styles.homeCard}>
          <View style={styles.bgOrbLeft} />
          <View style={styles.bgOrbRight} />

          <View style={styles.pageHead}>
            <View style={styles.backBtn}>
              <Text style={styles.backText}>‹</Text>
            </View>
            <View style={styles.titleBlock}>
              <View style={styles.titleRow}>
                <Text style={styles.heading}>Blue-Map 编排者</Text>
                <Text style={styles.titleBadge}>AIGC Agent</Text>
              </View>
              <Text style={styles.subheading} numberOfLines={2}>
                需求输入 · 方案比对 · 跨端执行 · 动态守护
              </Text>
            </View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stageTabs}>
            {stageMeta.map((item, index) => (
              <Pressable key={item.id} style={[styles.stageTab, stage === item.id ? styles.stageTabActive : null]} onPress={() => setStage(item.id)}>
                <Text style={[styles.stageIndex, stage === item.id ? styles.stageIndexActive : null]}>{index + 1}</Text>
                <Text style={[styles.stageTitle, stage === item.id ? styles.stageTitleActive : null]}>{item.title}</Text>
                <Text style={styles.stageSub}>{item.subtitle}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <AgentStatus loading={loading} subtitle={subtitle} />

          {stage === "input" ? (
            <View style={styles.section}>
              <IntentInputPanel
                message={message}
                onMessageChange={setMessage}
                structured={structured}
                setStructured={setStructured}
                selectedTags={selectedTags}
                onToggleTag={toggleTag}
                uploads={uploads}
                onUploadPress={handleUpload}
                onAnalyze={handleAnalyze}
                loading={loading}
              />
            </View>
          ) : null}

          {stage === "analyze" && analysis ? (
            <View style={styles.section}>
              <IntentAnalysisPanel
                analysis={analysis}
                loading={loading}
                onConfirm={handleCompare}
                onBack={() => setStage("input")}
              />
            </View>
          ) : null}

          {stage === "compare" ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>方案比对</Text>
              {comparison?.options.map((option) => (
                <Pressable key={option.id} style={[styles.optionCard, selectedOption?.id === option.id ? styles.optionCardActive : null]} onPress={() => handlePrepare(option)}>
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

          {stage === "order" ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>确认订单与后台执行</Text>
              {order ? (
                <>
                  <View style={styles.summaryCard}>
                    <Text style={styles.panelTitle}>{order.option.title}</Text>
                    <Text style={styles.summary}>{order.option.quote.flight}</Text>
                    <Text style={styles.summary}>{order.option.quote.hotel}</Text>
                    <Text style={styles.price}>总价 ¥{order.option.quote.total_price}</Text>
                  </View>
                  {order.steps.map((step) => (
                    <View key={step.name} style={styles.stepCard}>
                      <Text style={styles.stepStatus}>{step.status === "done" ? "✓" : "○"}</Text>
                      <View style={styles.flex}>
                        <Text style={styles.stepTitle}>{step.name}</Text>
                        <Text style={styles.summary}>{step.detail}</Text>
                      </View>
                    </View>
                  ))}
                  <Pressable style={styles.cta} onPress={handleExecute} disabled={loading}>
                    <Text style={styles.ctaText}>{loading ? "Agent 正在并行执行..." : "授权支付并同步执行  ›"}</Text>
                  </Pressable>
                </>
              ) : null}
            </View>
          ) : null}

          {stage === "guardian" ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>动态守护与系统同步</Text>
              {syncResult ? (
                <View style={styles.entityGrid}>
                  {syncResult.items.map((item) => (
                    <View key={item.target} style={styles.entityPill}>
                      <Text style={styles.entityLabel}>{item.title}</Text>
                      <Text style={styles.entityValue}>{item.detail}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
              <Pressable style={styles.secondaryCta} onPress={handleGuardian} disabled={loading}>
                <Text style={styles.secondaryCtaText}>模拟航班延误并生成重规划</Text>
              </Pressable>
              {guardian?.incidents.map((incident) => (
                <Text key={incident.id} style={styles.warning}>{incident.title}：{incident.detail}</Text>
              ))}
              {proposal ? (
                <View style={styles.summaryCard}>
                  <Text style={styles.panelTitle}>{proposal.summary}</Text>
                  {proposal.changes.map((change) => (
                    <Text key={change} style={styles.summary}>• {change}</Text>
                  ))}
                  <Pressable style={styles.cta} onPress={handleAcceptReplan}>
                    <Text style={styles.ctaText}>确认更新行程</Text>
                  </Pressable>
                </View>
              ) : null}
              <Pressable style={styles.cta} onPress={handleReview} disabled={loading}>
                <Text style={styles.ctaText}>生成行程回顾  ›</Text>
              </Pressable>
            </View>
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
                  {review.preference_memory.map((item) => <Text key={item} style={styles.summary}>• {item}</Text>)}
                  <Text style={styles.panelTitle}>下次建议</Text>
                  {review.next_trip_suggestions.map((item) => <Text key={item} style={styles.summary}>• {item}</Text>)}
                </View>
              ) : null}
            </View>
          ) : null}

          {itinerary ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>时空拓扑看板</Text>
              <MapTopologyBoard
                itinerary={itinerary}
                city={structured.destination}
                onUpdateNode={handleUpdateNode}
                onEditItem={handleEditNode}
                onMapInteractionChange={handleMapInteraction}
              />
              {itinerary.items.map((item, index) => (
                <ItineraryCard key={item.id} item={item} index={index} onEdit={handleEditNode} />
              ))}
              <NodeEditModal
                visible={nodeEditDraft != null}
                draft={nodeEditDraft}
                saving={nodeSaving}
                onChange={setNodeEditDraft}
                onClose={() => setNodeEditDraft(null)}
                onSave={handleSaveNodeEdit}
              />
            </View>
          ) : null}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#D9F2FF" },
  pageContent: { alignItems: "center", paddingBottom: 32 },
  phoneFrame: { width: Math.min(screenWidth, 390), padding: 7, backgroundColor: "#8E67FF" },
  homeCard: { minHeight: "100%", padding: 18, paddingTop: 34, borderRadius: 34, overflow: "hidden", backgroundColor: "#E8F7FF" },
  bgOrbLeft: { position: "absolute", left: 24, top: -36, width: 180, height: 180, borderRadius: 90, backgroundColor: "rgba(173,216,255,0.75)" },
  bgOrbRight: { position: "absolute", right: -60, top: 40, width: 160, height: 160, borderRadius: 80, backgroundColor: "rgba(255,255,255,0.64)" },
  pageHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  backBtn: { width: 31, height: 31, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.86)" },
  backText: { marginTop: -4, color: "#4C84FF", fontSize: 28 },
  titleBlock: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  heading: { color: "#233B63", fontSize: 16, fontWeight: "900" },
  titleBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, overflow: "hidden", color: "#4383FF", backgroundColor: "rgba(211,230,255,0.9)", fontSize: 10, fontWeight: "800" },
  subheading: { marginTop: 7, color: "#7F93B1", fontSize: 11, fontWeight: "700" },
  stageTabs: { gap: 8, paddingVertical: 14 },
  stageTab: { width: 112, padding: 10, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.62)" },
  stageTabActive: { backgroundColor: "#FFFFFF" },
  stageIndex: { width: 22, height: 22, borderRadius: 11, overflow: "hidden", textAlign: "center", textAlignVertical: "center", color: "#93A3BA", backgroundColor: "#EEF6FF", fontWeight: "900" },
  stageIndexActive: { color: "#FFFFFF", backgroundColor: "#287CFF" },
  stageTitle: { marginTop: 7, color: "#527099", fontSize: 11, fontWeight: "900" },
  stageTitleActive: { color: "#287CFF" },
  stageSub: { marginTop: 3, color: "#8BA0BD", fontSize: 9, fontWeight: "800" },
  section: { marginTop: 12, padding: 12, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.9)" },
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
});
