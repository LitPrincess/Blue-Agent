from __future__ import annotations

from typing import Any, TypedDict

from app.agent.intent import intent_extractor
from app.agent.planner import trip_planner
from app.models.schemas import ChatResponse, Itinerary, TravelIntent
from app.services.rag import rag_service
from app.services.store import store
from app.tools.travel_tools import travel_tools


class AgentState(TypedDict, total=False):
    user_id: str
    message: str
    intent: TravelIntent
    retrieved_context: list[dict[str, str]]
    tool_results: dict[str, Any]
    itinerary: Itinerary
    reply: str


def parse_intent(state: AgentState) -> AgentState:
    state["intent"] = intent_extractor.extract(state["message"])
    return state


def retrieve_context(state: AgentState) -> AgentState:
    state["retrieved_context"] = rag_service.retrieve(state["user_id"], state["message"])
    return state


def call_tools(state: AgentState) -> AgentState:
    intent = state["intent"]
    date_range = " - ".join(filter(None, [intent.start_date, intent.end_date])) or None
    places = []
    for keyword in [*intent.preferences, *intent.must_visit]:
        places.extend(travel_tools.search_places(intent.destination, keyword))
    if not places:
        places = travel_tools.search_places(intent.destination, "")

    state["tool_results"] = {
        "weather": travel_tools.get_weather(intent.destination, date_range),
        "places": places,
        "conflicts": travel_tools.check_calendar_conflicts(state["user_id"], date_range),
    }
    return state


def generate_plan(state: AgentState) -> AgentState:
    state["itinerary"] = trip_planner.build_itinerary(
        state["user_id"],
        state["intent"],
        state.get("tool_results", {}),
        state.get("retrieved_context", []),
    )
    return state


def validate_plan(state: AgentState) -> AgentState:
    itinerary = state["itinerary"]
    busy_slots = {(item.day, item.start_time) for item in itinerary.items}
    if len(busy_slots) < len(itinerary.items):
        itinerary.warnings.append("检测到同一天存在开始时间重复的安排，请进一步微调。")
    if len(itinerary.items) > 10:
        itinerary.warnings.append("行程较满，建议保留更多弹性时间。")
    return state


def persist_plan(state: AgentState) -> AgentState:
    itinerary = store.save_itinerary(state["itinerary"])
    state["itinerary"] = itinerary
    store.add_message(state["user_id"], "user", state["message"])
    store.add_message(state["user_id"], "assistant", itinerary.summary)
    return state


def respond(state: AgentState) -> AgentState:
    itinerary = state["itinerary"]
    state["reply"] = (
        f"我已为你生成《{itinerary.title}》。"
        f"共 {len(itinerary.items)} 个安排节点，发现 {len(itinerary.warnings)} 条提醒。"
        "你可以继续说“把故宫改到周日上午”这类指令来动态微调。"
    )
    return state


class TravelAgentGraph:
    def __init__(self) -> None:
        self.graph = self._build_graph()

    def _build_graph(self) -> Any:
        try:
            from langgraph.graph import END, StateGraph

            workflow = StateGraph(AgentState)
            workflow.add_node("parse_intent", parse_intent)
            workflow.add_node("retrieve_context", retrieve_context)
            workflow.add_node("call_tools", call_tools)
            workflow.add_node("generate_plan", generate_plan)
            workflow.add_node("validate_plan", validate_plan)
            workflow.add_node("persist_plan", persist_plan)
            workflow.add_node("respond", respond)
            workflow.set_entry_point("parse_intent")
            workflow.add_edge("parse_intent", "retrieve_context")
            workflow.add_edge("retrieve_context", "call_tools")
            workflow.add_edge("call_tools", "generate_plan")
            workflow.add_edge("generate_plan", "validate_plan")
            workflow.add_edge("validate_plan", "persist_plan")
            workflow.add_edge("persist_plan", "respond")
            workflow.add_edge("respond", END)
            return workflow.compile()
        except Exception:
            return None

    def invoke(self, user_id: str, message: str) -> ChatResponse:
        initial: AgentState = {"user_id": user_id, "message": message}
        if self.graph:
            final = self.graph.invoke(initial)
        else:
            final = respond(
                persist_plan(
                    validate_plan(
                        generate_plan(call_tools(retrieve_context(parse_intent(initial))))
                    )
                )
            )
        return ChatResponse(
            reply=final["reply"],
            intent=final["intent"],
            itinerary=final["itinerary"],
            tool_results=final.get("tool_results", {}),
        )


travel_agent_graph = TravelAgentGraph()
