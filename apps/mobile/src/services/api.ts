import { File } from "expo-file-system";

import {
  ChatResponse,
  GuardianStatus,
  IntentAnalysis,
  Itinerary,
  PlanComparison,
  PlanOption,
  ReplanProposal,
  SystemSyncResult,
  TravelOrder,
  TravelRequestBundle,
  TripReview,
} from "../types";
import { apiFetch, getApiBaseUrl, LLM_TIMEOUT_MS, SPEECH_TIMEOUT_MS } from "../utils/httpClient";
import { defaultStructured, parseTravelFromText, StructuredFields } from "../utils/parseTravelInput";
import {
  preferencesToApiList,
  preferencesToTags,
  TravelPreferences,
} from "../utils/travelPreferences";

const API_BASE_URL = getApiBaseUrl();
const USER_ID = "demo-user";

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const detail = await response.text();
    if (detail) {
      try {
        const payload = JSON.parse(detail) as { detail?: string | { msg?: string }[] };
        if (typeof payload.detail === "string") {
          throw new Error(payload.detail);
        }
        if (Array.isArray(payload.detail)) {
          const message = payload.detail.map((item) => item.msg).filter(Boolean).join("；");
          if (message) throw new Error(message);
        }
      } catch (error) {
        if (error instanceof Error && !error.message.startsWith("Unexpected")) {
          throw error;
        }
      }
      throw new Error(detail.length > 120 ? `${detail.slice(0, 120)}…` : detail);
    }
    throw new Error(`Request failed with ${response.status}`);
  }
  const text = await response.text();
  if (!text.trim()) {
    throw new Error("服务器返回空响应");
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`服务器响应格式异常：${text.slice(0, 80)}`);
  }
}

export async function sendTravelMessage(message: string): Promise<ChatResponse> {
  const response = await apiFetch(
    `${API_BASE_URL}/chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: USER_ID, message }),
    },
    LLM_TIMEOUT_MS,
  );
  return parseResponse<ChatResponse>(response);
}

export async function refineItinerary(itineraryId: string, instruction: string) {
  const response = await apiFetch(
    `${API_BASE_URL}/itineraries/refine`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: USER_ID, itinerary_id: itineraryId, instruction }),
    },
    LLM_TIMEOUT_MS,
  );
  return parseResponse<{ reply: string; itinerary: ChatResponse["itinerary"] }>(response);
}

export async function fetchItinerary(itineraryId: string) {
  const response = await apiFetch(`${API_BASE_URL}/itineraries/${encodeURIComponent(itineraryId)}`);
  return parseResponse<{ itinerary: Itinerary }>(response);
}

export async function syncItinerary(itinerary: Itinerary) {
  const response = await apiFetch(`${API_BASE_URL}/itineraries/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: USER_ID, itinerary }),
  });
  return parseResponse<{ itinerary: Itinerary }>(response);
}

export async function uploadTravelDocument(uri: string, name: string, mimeType: string, kind: string) {
  const form = new FormData();
  form.append("user_id", USER_ID);
  form.append("kind", kind);
  form.append("file", {
    uri,
    name,
    type: mimeType,
  } as unknown as Blob);

  const response = await apiFetch(`${API_BASE_URL}/uploads`, {
    method: "POST",
    body: form,
  });
  return parseResponse<{ document_id: string; extracted_text: string; chunks: number }>(response);
}

export async function createCalendarEvent(title: string, startTime: string, endTime: string, location: string) {
  const params = new URLSearchParams({
    title,
    start_time: startTime,
    end_time: endTime,
    location,
  });
  const response = await apiFetch(`${API_BASE_URL}/integrations/calendar?${params.toString()}`, {
    method: "POST",
  });
  return parseResponse<{ status: string; deeplink: string }>(response);
}

export async function openMapRoute(origin: string, destination: string) {
  const params = new URLSearchParams({ origin, destination });
  const response = await apiFetch(`${API_BASE_URL}/integrations/map?${params.toString()}`, {
    method: "POST",
  });
  return parseResponse<{ provider: string; deeplink: string }>(response);
}

export async function analyzeIntent(message: string) {
  const response = await apiFetch(`${API_BASE_URL}/intent/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  return parseResponse<IntentAnalysis>(response);
}

export async function parseIntent(message: string) {
  const response = await apiFetch(`${API_BASE_URL}/intent/parse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  return parseResponse<{
    intent: ChatResponse["intent"];
    structured: StructuredFields;
  }>(response);
}

export async function transcribeVoice(uri: string) {
  const normalizedUri = uri.startsWith("file://") ? uri : `file://${uri}`;
  const file = new File(normalizedUri);
  const name = file.name || "recording.m4a";
  const mimeType = name.endsWith(".wav")
    ? "audio/wav"
    : name.endsWith(".caf")
      ? "audio/x-caf"
      : "audio/m4a";

  const audioBase64 = await file.base64();

  const response = await apiFetch(
    `${API_BASE_URL}/voice/transcribe-base64`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audio_base64: audioBase64,
        filename: name.endsWith(".") ? "recording.m4a" : name,
        mime_type: mimeType,
      }),
    },
    SPEECH_TIMEOUT_MS,
  );
  return parseResponse<{ text: string }>(response);
}

export type UpdateNodePayload = {
  title?: string;
  start_time?: string;
  end_time?: string;
  location?: string;
  geo_lat?: number;
  geo_lng?: number;
  day?: number;
};

export type SmartUpdateNodeResponse = {
  itinerary: NonNullable<ChatResponse["itinerary"]>;
  change_summary: string;
  affected_item_ids: string[];
  warnings: string[];
};

export async function updateNode(itineraryId: string, itemId: string, payload: UpdateNodePayload) {
  const response = await apiFetch(`${API_BASE_URL}/itineraries/update-node`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: USER_ID,
      itinerary_id: itineraryId,
      item_id: itemId,
      ...payload,
    }),
  });
  return parseResponse<{ itinerary: ChatResponse["itinerary"] }>(response);
}

export async function smartUpdateNode(
  itineraryId: string,
  itemId: string,
  payload: UpdateNodePayload,
  instruction?: string,
) {
  const response = await apiFetch(
    `${API_BASE_URL}/itineraries/smart-update-node`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: USER_ID,
        itinerary_id: itineraryId,
        item_id: itemId,
        instruction: instruction?.trim() || undefined,
        ...payload,
      }),
    },
    LLM_TIMEOUT_MS,
  );
  return parseResponse<SmartUpdateNodeResponse>(response);
}

export async function deleteNode(itineraryId: string, itemId: string, instruction?: string) {
  const response = await apiFetch(
    `${API_BASE_URL}/itineraries/delete-node`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: USER_ID,
        itinerary_id: itineraryId,
        item_id: itemId,
        instruction: instruction?.trim() || undefined,
      }),
    },
    LLM_TIMEOUT_MS,
  );
  return parseResponse<SmartUpdateNodeResponse>(response);
}

export async function addNode(
  itineraryId: string,
  payload: {
    day: number;
    start_time: string;
    end_time?: string;
    title?: string;
    location?: string;
    category?: "food" | "sight" | "hotel" | "free";
    insert_after_item_id?: string;
    instruction?: string;
  },
) {
  const response = await apiFetch(
    `${API_BASE_URL}/itineraries/add-node`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: USER_ID,
        itinerary_id: itineraryId,
        ...payload,
      }),
    },
    LLM_TIMEOUT_MS,
  );
  return parseResponse<SmartUpdateNodeResponse>(response);
}

export async function reorderNodes(itineraryId: string, itemIds: string[], instruction?: string) {
  const response = await apiFetch(
    `${API_BASE_URL}/itineraries/reorder-nodes`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: USER_ID,
        itinerary_id: itineraryId,
        item_ids: itemIds,
        instruction: instruction?.trim() || undefined,
      }),
    },
    LLM_TIMEOUT_MS,
  );
  return parseResponse<SmartUpdateNodeResponse>(response);
}

export async function rescheduleNode(itineraryId: string, itemId: string, startTime: string) {
  const response = await apiFetch(`${API_BASE_URL}/itineraries/reschedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: USER_ID,
      itinerary_id: itineraryId,
      item_id: itemId,
      start_time: startTime,
    }),
  });
  return parseResponse<{ itinerary: ChatResponse["itinerary"] }>(response);
}

export function buildTravelRequest(
  message: string,
  structured: StructuredFields,
  documentIds: string[] = [],
  tags: string[] = [],
  links: string[] = [],
  travelPreferences?: TravelPreferences,
): TravelRequestBundle {
  const hints = parseTravelFromText(message);
  const manualPreferences = structured.preferences
    .split(/[/、,;；]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const preferenceList = travelPreferences
    ? preferencesToApiList(travelPreferences)
    : manualPreferences.length
      ? manualPreferences
      : ["效率优先"];
  const tagList = travelPreferences
    ? [...new Set([...preferencesToTags(travelPreferences), ...tags])]
    : tags.length
      ? tags
      : hints.tags.length
        ? hints.tags
        : ["出差"];

  return {
    user_id: USER_ID,
    text: message,
    document_ids: documentIds,
    links,
    structured: {
      origin: structured.origin,
      destination: structured.destination,
      start_date: structured.startDate,
      end_date: structured.endDate,
      vehicles: hints.vehicles.length ? hints.vehicles : ["高铁"],
      tags: tagList,
      preferences: preferenceList,
    },
  };
}

export function buildDemoRequest(message: string, documentIds: string[] = [], links: string[] = []): TravelRequestBundle {
  return buildTravelRequest(message, defaultStructured(), documentIds, [], links);
}

export async function comparePlans(request: TravelRequestBundle) {
  const response = await apiFetch(
    `${API_BASE_URL}/plans/compare`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
    LLM_TIMEOUT_MS,
  );
  return parseResponse<{ comparison: PlanComparison }>(response);
}

export async function prepareOrder(comparisonId: string, optionId: string) {
  const response = await apiFetch(`${API_BASE_URL}/orders/prepare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: USER_ID, comparison_id: comparisonId, option_id: optionId }),
  });
  return parseResponse<{ order: TravelOrder }>(response);
}

export async function prepareOrderFromItinerary(itineraryId: string, option?: PlanOption) {
  const response = await apiFetch(`${API_BASE_URL}/orders/prepare-from-itinerary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: USER_ID,
      itinerary_id: itineraryId,
      option: option ?? undefined,
    }),
  });
  return parseResponse<{ order: TravelOrder }>(response);
}

export async function authorizePayment(orderId: string) {
  const response = await apiFetch(`${API_BASE_URL}/orders/authorize-payment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: USER_ID, order_id: orderId, method: "mock" }),
  });
  return parseResponse<{ order: TravelOrder }>(response);
}

export async function sendMultimodalChat(input: {
  text?: string | null;
  document_ids?: string[];
  image_urls?: string[];
  audio_urls?: string[];
  metadata?: Record<string, unknown>;
}) {
  const params = new URLSearchParams({ user_id: USER_ID });
  const response = await apiFetch(
    `${API_BASE_URL}/multimodal/chat?${params.toString()}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: input.text ?? null,
        document_ids: input.document_ids ?? [],
        image_urls: input.image_urls ?? [],
        audio_urls: input.audio_urls ?? [],
        metadata: input.metadata ?? {},
      }),
    },
    LLM_TIMEOUT_MS,
  );
  return parseResponse<ChatResponse>(response);
}

export async function executeOrder(orderId: string) {
  const response = await apiFetch(`${API_BASE_URL}/orders/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: USER_ID, order_id: orderId }),
  });
  return parseResponse<{ order: TravelOrder }>(response);
}

export async function syncSystem(itineraryId: string, orderId?: string) {
  const response = await apiFetch(`${API_BASE_URL}/sync/system`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: USER_ID, itinerary_id: itineraryId, order_id: orderId }),
  });
  return parseResponse<{ sync: SystemSyncResult }>(response);
}

export async function getGuardianStatus(itineraryId: string) {
  const response = await apiFetch(`${API_BASE_URL}/guardian/status/${itineraryId}`);
  return parseResponse<{ guardian: GuardianStatus }>(response);
}

export async function requestEmergencyAdjust(
  itineraryId: string,
  kind: string,
  detail?: string,
) {
  const response = await apiFetch(`${API_BASE_URL}/guardian/replan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: USER_ID,
      itinerary_id: itineraryId,
      kind,
      detail: detail?.trim() || undefined,
    }),
  });
  return parseResponse<{ proposal: ReplanProposal }>(response);
}

export async function simulateIncident(itineraryId: string, kind = "flight_delay", detail?: string) {
  const params = new URLSearchParams({ itinerary_id: itineraryId, kind });
  if (detail?.trim()) params.set("detail", detail.trim());
  const response = await apiFetch(`${API_BASE_URL}/guardian/incidents/simulate?${params.toString()}`, {
    method: "POST",
  });
  return parseResponse<{ incident: GuardianStatus["incidents"][number] }>(response);
}

export async function requestReplan(
  itineraryId: string,
  options?: { incidentId?: string; kind?: string; detail?: string },
) {
  const response = await apiFetch(`${API_BASE_URL}/guardian/replan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: USER_ID,
      itinerary_id: itineraryId,
      incident_id: options?.incidentId,
      kind: options?.kind,
      detail: options?.detail?.trim() || undefined,
    }),
  });
  return parseResponse<{ proposal: ReplanProposal }>(response);
}

export async function acceptReplan(proposalId: string) {
  const response = await apiFetch(`${API_BASE_URL}/guardian/accept-replan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: USER_ID, proposal_id: proposalId }),
  });
  return parseResponse<{ itinerary: ChatResponse["itinerary"] }>(response);
}

export async function getTripReview(itineraryId: string) {
  const response = await apiFetch(`${API_BASE_URL}/trips/${itineraryId}/review`);
  return parseResponse<{ review: TripReview }>(response);
}

export type RecommendPOIParams = {
  city: string;
  keyword: string;
  category: "food" | "hotel" | "sight";
  day?: number;
  start_time?: string;
  end_time?: string;
  near_lat?: number;
  near_lng?: number;
  itinerary_id?: string;
};

export async function searchRecommendations(params: RecommendPOIParams) {
  const response = await apiFetch(`${API_BASE_URL}/recommendations/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: USER_ID, ...params }),
  });
  return parseResponse<import("../types").RecommendPOIResponse>(response);
}

export async function confirmPOI(
  itineraryId: string,
  candidate: import("../types").POICandidate,
  options: {
    day: number;
    start_time: string;
    end_time: string;
    replace_item_id?: string;
    insert_after_item_id?: string;
  },
) {
  const response = await apiFetch(`${API_BASE_URL}/nodes/confirm-poi`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: USER_ID,
      itinerary_id: itineraryId,
      candidate,
      ...options,
    }),
  });
  return parseResponse<{
    itinerary: NonNullable<ChatResponse["itinerary"]>;
    price_quote: import("../types").ItineraryPriceQuote;
  }>(response);
}

export async function getPriceQuote(itineraryId: string) {
  const response = await apiFetch(`${API_BASE_URL}/itineraries/${itineraryId}/price-quote`);
  return parseResponse<import("../types").ItineraryPriceQuote>(response);
}

export async function searchAccommodationAreas(params: {
  city: string;
  itinerary_id?: string;
  preference?: string;
  budget?: string;
}) {
  const response = await apiFetch(`${API_BASE_URL}/recommendations/accommodation-areas`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: USER_ID, ...params }),
  });
  return parseResponse<import("../types").RecommendAccommodationAreaResponse>(response);
}

export async function getItineraryWeather(itineraryId: string) {
  const response = await apiFetch(`${API_BASE_URL}/weather/itinerary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: USER_ID, itinerary_id: itineraryId }),
  });
  return parseResponse<import("../types").ItineraryWeatherResponse>(response);
}

export async function optimizeItineraryByWeather(itineraryId: string) {
  const response = await apiFetch(`${API_BASE_URL}/weather/optimize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: USER_ID, itinerary_id: itineraryId }),
  });
  return parseResponse<{
    itinerary: NonNullable<ChatResponse["itinerary"]>;
    change_summary: string;
    affected_item_ids: string[];
    warnings: string[];
    weather: import("../types").ItineraryWeatherResponse;
  }>(response);
}
