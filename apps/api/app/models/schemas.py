from datetime import datetime
from enum import Enum
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, Field


class TravelIntent(BaseModel):
    origin: str | None = None
    destination: str
    start_date: str | None = None
    end_date: str | None = None
    duration_days: int | None = None
    travelers: int = 1
    budget: str | None = None
    accommodation_area: str | None = None
    preferences: list[str] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)
    must_visit: list[str] = Field(default_factory=list)
    raw_text: str


class TransportLeg(BaseModel):
    origin: str
    destination: str
    mode: Literal["walk", "bike", "taxi", "metro", "train", "flight", "unknown"] = "unknown"
    minutes: int
    distance_km: float | None = None
    note: str | None = None


class ItineraryItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    day: int
    start_time: str
    end_time: str
    title: str
    location: str
    category: Literal["transport", "meeting", "food", "sight", "hotel", "free", "alert"]
    node_type: Literal["hard_anchor", "semi_anchor", "soft_task"] = "soft_task"
    editable: bool = True
    geo_lat: float | None = None
    geo_lng: float | None = None
    description: str
    route_from_previous: TransportLeg | None = None
    risk_flags: list[str] = Field(default_factory=list)


class Itinerary(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    user_id: str
    version: int = 1
    title: str
    intent: TravelIntent
    items: list[ItineraryItem]
    summary: str
    explanation: str
    warnings: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class GeneratedItineraryItem(BaseModel):
    day: int
    start_time: str
    end_time: str
    title: str
    location: str
    category: Literal["transport", "meeting", "food", "sight", "hotel", "free", "alert"]
    description: str
    geo_lat: float | None = None
    geo_lng: float | None = None


class GeneratedItineraryPlan(BaseModel):
    title: str
    summary: str
    explanation: str
    warnings: list[str] = Field(default_factory=list)
    items: list[GeneratedItineraryItem] = Field(default_factory=list)


class ChatRequest(BaseModel):
    user_id: str = "demo-user"
    message: str
    itinerary_id: str | None = None


class ChatResponse(BaseModel):
    reply: str
    intent: TravelIntent | None = None
    itinerary: Itinerary | None = None
    tool_results: dict[str, Any] = Field(default_factory=dict)


class IntentParseRequest(BaseModel):
    message: str


class IntentParseResponse(BaseModel):
    intent: TravelIntent
    structured: dict[str, str]


class VoiceTranscribeResponse(BaseModel):
    text: str


class VoiceTranscribeJsonRequest(BaseModel):
    audio_base64: str
    filename: str = "recording.m4a"


class FiveElements(BaseModel):
    actions: list[str] = Field(default_factory=list)
    locations: list[str] = Field(default_factory=list)
    time: list[str] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)
    preferences: list[str] = Field(default_factory=list)


class ContextInsight(BaseModel):
    key: str
    title: str
    detail: str
    status: Literal["ok", "warn", "error"] = "ok"


class IntentAnalyzeResponse(BaseModel):
    intent: TravelIntent
    structured: dict[str, str]
    five_elements: FiveElements
    context: list[ContextInsight]
    summary: str
    progress: list[dict[str, str]]


class RefinementRequest(BaseModel):
    user_id: str = "demo-user"
    itinerary_id: str
    instruction: str


class RescheduleNodeRequest(BaseModel):
    user_id: str = "demo-user"
    itinerary_id: str
    item_id: str
    start_time: str
    day: int | None = None


class UpdateNodeRequest(BaseModel):
    user_id: str = "demo-user"
    itinerary_id: str
    item_id: str
    title: str | None = None
    start_time: str | None = None
    end_time: str | None = None
    location: str | None = None
    geo_lat: float | None = None
    geo_lng: float | None = None
    day: int | None = None


class UploadKind(str, Enum):
    pdf = "pdf"
    image = "image"
    audio = "audio"
    text = "text"


class UploadResponse(BaseModel):
    document_id: str
    kind: UploadKind
    extracted_text: str
    chunks: int


class MultimodalInputBundle(BaseModel):
    text: str | None = None
    document_ids: list[str] = Field(default_factory=list)
    image_urls: list[str] = Field(default_factory=list)
    audio_urls: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class StructuredTravelInput(BaseModel):
    origin: str = ""
    destination: str = ""
    start_date: str | None = None
    end_date: str | None = None
    vehicles: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    preferences: list[str] = Field(default_factory=list)


class TravelRequestBundle(BaseModel):
    user_id: str = "demo-user"
    text: str
    document_ids: list[str] = Field(default_factory=list)
    links: list[str] = Field(default_factory=list)
    structured: StructuredTravelInput = Field(default_factory=StructuredTravelInput)


class TravelQuote(BaseModel):
    flight: str
    hotel: str
    local_transport: str
    total_price: int
    duration_text: str
    comfort_score: int
    risk_level: Literal["low", "medium", "high"]


class PlanOption(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    title: str
    strategy: Literal["fastest", "balanced", "comfortable"]
    quote: TravelQuote
    highlights: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    recommendation: str
    itinerary: Itinerary


class PlanComparison(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    user_id: str
    request: TravelRequestBundle
    options: list[PlanOption]
    recommended_option_id: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class PrepareOrderRequest(BaseModel):
    user_id: str = "demo-user"
    comparison_id: str
    option_id: str


class OrderStep(BaseModel):
    name: str
    status: Literal["pending", "running", "done", "failed"] = "pending"
    detail: str


class TravelOrder(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    user_id: str
    comparison_id: str
    option: PlanOption
    status: Literal["prepared", "authorized", "executing", "completed", "failed"] = "prepared"
    payment_authorized: bool = False
    steps: list[OrderStep] = Field(default_factory=list)
    confirmations: dict[str, str] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class PaymentAuthorizationRequest(BaseModel):
    user_id: str = "demo-user"
    order_id: str
    method: Literal["alipay", "wechat_pay", "card", "mock"] = "mock"


class ExecuteOrderRequest(BaseModel):
    user_id: str = "demo-user"
    order_id: str


class SystemSyncRequest(BaseModel):
    user_id: str = "demo-user"
    itinerary_id: str
    order_id: str | None = None


class SyncItem(BaseModel):
    target: Literal["calendar", "alarm", "widget", "memo", "map"]
    status: Literal["ready", "synced", "failed"] = "synced"
    title: str
    detail: str
    deeplink: str | None = None


class SystemSyncResult(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    user_id: str
    itinerary_id: str
    items: list[SyncItem]
    topology_nodes: list[dict[str, Any]]
    created_at: datetime = Field(default_factory=datetime.utcnow)


class TravelIncident(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    itinerary_id: str
    kind: Literal["flight_delay", "weather", "traffic", "meeting_conflict", "hotel_risk"]
    severity: Literal["low", "medium", "high"]
    title: str
    detail: str
    affected_item_ids: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class GuardianStatus(BaseModel):
    itinerary_id: str
    status: Literal["watching", "incident_detected", "stable"]
    incidents: list[TravelIncident]
    next_check: str


class ReplanRequest(BaseModel):
    user_id: str = "demo-user"
    itinerary_id: str
    incident_id: str | None = None


class ReplanProposal(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    itinerary_id: str
    incident: TravelIncident
    summary: str
    changes: list[str]
    updated_itinerary: Itinerary


class AcceptReplanRequest(BaseModel):
    user_id: str = "demo-user"
    proposal_id: str


class TripReview(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    itinerary_id: str
    summary: str
    budget_total: int
    completed_items: int
    preference_memory: list[str]
    next_trip_suggestions: list[str]
    created_at: datetime = Field(default_factory=datetime.utcnow)
