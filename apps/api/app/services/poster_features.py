from __future__ import annotations

from copy import deepcopy

from app.agent.graph import call_tools, generate_plan, travel_agent_graph, validate_plan
from app.models.schemas import (
    AcceptReplanRequest,
    ExecuteOrderRequest,
    GuardianStatus,
    Itinerary,
    ItineraryItem,
    OrderStep,
    PaymentAuthorizationRequest,
    PlanComparison,
    PlanOption,
    PrepareFromItineraryRequest,
    PrepareOrderRequest,
    TravelQuote,
    ReplanProposal,
    ReplanRequest,
    SyncItem,
    SystemSyncRequest,
    SystemSyncResult,
    TravelIncident,
    TravelOrder,
    TravelIntent,
    TravelRequestBundle,
    TripReview,
)
from app.agent.refiner import itinerary_refiner
from app.services.price_engine import price_engine
from app.services.store import store
from app.utils.emergency import build_adjust_instruction, incident_profile


def _save(kind: str, record_id: str, user_id: str, payload) -> None:
    store.save_record(kind, record_id, user_id, payload.model_dump_json())


class PlanComparisonService:
    def compare(self, request: TravelRequestBundle) -> PlanComparison:
        if request.document_ids:
            base_message = self._compose_prompt(request)
            response = travel_agent_graph.invoke(request.user_id, base_message)
            base = response.itinerary
        else:
            base = self._build_itinerary_fast(request)
        if base is None:
            raise ValueError("failed to generate itinerary")

        base = self._apply_structured_intent(base, request)
        store.save_itinerary(base)

        base_quote = price_engine.quote_itinerary(base)
        options = [
            self._option(base, "最快抵达方案", "fastest", base_quote, 1.08, 86, "low"),
            self._option(base, "均衡舒适方案", "balanced", base_quote, 1.0, 92, "low"),
            self._option(base, "低预算弹性方案", "comfortable", base_quote, 0.88, 78, "medium"),
        ]
        comparison = PlanComparison(
            user_id=request.user_id,
            request=request,
            options=options,
            recommended_option_id=options[1].id,
        )
        _save("comparison", comparison.id, request.user_id, comparison)
        return comparison

    def get(self, comparison_id: str) -> PlanComparison | None:
        payload = store.get_record("comparison", comparison_id)
        return PlanComparison.model_validate(payload) if payload else None

    def _build_itinerary_fast(self, request: TravelRequestBundle):
        structured = request.structured
        intent = TravelIntent(
            origin=structured.origin or None,
            destination=structured.destination or "目的地",
            start_date=structured.start_date,
            end_date=structured.end_date,
            preferences=[*structured.preferences, *structured.tags, *structured.vehicles],
            raw_text=request.text,
        )
        state = {
            "user_id": request.user_id,
            "message": request.text,
            "intent": intent,
            "retrieved_context": [],
            "tool_results": {},
        }
        state = call_tools(state)
        state = generate_plan(state)
        state = validate_plan(state)
        return state.get("itinerary")

    def _compose_prompt(self, request: TravelRequestBundle) -> str:
        structured = request.structured
        extras = "，".join([*structured.vehicles, *structured.tags, *structured.preferences])
        links = f"。参考链接：{'，'.join(request.links)}" if request.links else ""
        return (
            f"{request.text}。从{structured.origin}出发，目的地{structured.destination}，"
            f"日期{structured.start_date or '待定'}到{structured.end_date or '待定'}，"
            f"偏好/标签：{extras or '效率优先'}{links}"
        )

    def _apply_structured_intent(self, itinerary: Itinerary, request: TravelRequestBundle) -> Itinerary:
        structured = request.structured
        intent = itinerary.intent.model_copy(
            update={
                "origin": structured.origin or itinerary.intent.origin,
                "destination": structured.destination or itinerary.intent.destination,
                "start_date": structured.start_date or itinerary.intent.start_date,
                "end_date": structured.end_date or itinerary.intent.end_date,
                "preferences": structured.preferences or itinerary.intent.preferences,
                "raw_text": request.text or itinerary.intent.raw_text,
            }
        )
        if intent.start_date and intent.end_date and not intent.duration_days:
            try:
                from datetime import datetime

                start = datetime.fromisoformat(intent.start_date)
                end = datetime.fromisoformat(intent.end_date)
                intent.duration_days = max(1, (end - start).days + 1)
            except ValueError:
                pass
        itinerary.intent = intent
        return itinerary

    def _option(
        self,
        base: Itinerary,
        title: str,
        strategy: str,
        base_quote,
        price_multiplier: float,
        comfort: int,
        risk: str,
    ) -> PlanOption:
        itinerary = deepcopy(base)
        itinerary.id = base.id
        itinerary.title = title
        adjusted = base_quote.model_copy(
            update={
                "transport": int(base_quote.transport * price_multiplier),
                "food": int(base_quote.food * price_multiplier),
                "hotel": int(base_quote.hotel * price_multiplier),
                "other": int(base_quote.other * price_multiplier),
            }
        )
        adjusted = adjusted.model_copy(
            update={"total": adjusted.transport + adjusted.food + adjusted.hotel + adjusted.other}
        )
        quote = price_engine.to_travel_quote(itinerary, adjusted, strategy)
        quote = quote.model_copy(update={"comfort_score": comfort, "risk_level": risk})
        source_note = "、".join(adjusted.data_sources) if adjusted.data_sources else "估算"
        risks = ["高峰时段交通拥堵"] if risk == "medium" else ["需提前完成景点预约"]
        return PlanOption(
            title=title,
            strategy=strategy,  # type: ignore[arg-type]
            quote=quote,
            highlights=["高德真实路线/POI", "多平台口碑对比", "可同步日历与地图"],
            risks=risks,
            recommendation=(
                f"{title}：交通 ¥{adjusted.transport}、餐饮 ¥{adjusted.food}、住宿 ¥{adjusted.hotel}，"
                f"总价 ¥{adjusted.total}（来源：{source_note}）。"
            ),
            itinerary=itinerary,
        )


class ExecutionCenter:
    def prepare(self, request: PrepareOrderRequest) -> TravelOrder:
        comparison = plan_comparison_service.get(request.comparison_id)
        if comparison is None:
            raise ValueError("comparison not found")
        option = next((item for item in comparison.options if item.id == request.option_id), None)
        if option is None:
            raise ValueError("option not found")

        order = TravelOrder(
            user_id=request.user_id,
            comparison_id=request.comparison_id,
            option=option,
            steps=[
                OrderStep(name="信息解析", detail="提取乘机人、日期、城市与偏好"),
                OrderStep(name="平台匹配", detail="匹配航班、酒店、地图与日历平台"),
                OrderStep(name="参数填表", detail="模拟填充 OTA、酒店和交通表单"),
                OrderStep(name="等待授权", detail="等待用户一次性支付授权"),
                OrderStep(name="结果回调", detail="回写订单号、酒店确认号和行程数据"),
            ],
        )
        _save("order", order.id, request.user_id, order)
        return order

    def prepare_from_itinerary(self, request: PrepareFromItineraryRequest) -> TravelOrder:
        itinerary = store.get_itinerary(request.itinerary_id)
        if itinerary is None:
            raise ValueError("itinerary not found")

        if request.option is not None:
            option = request.option.model_copy(update={"itinerary": itinerary})
        else:
            option = PlanOption(
                title=itinerary.title,
                strategy="balanced",
                quote=TravelQuote(
                    flight="待定",
                    hotel="待定",
                    local_transport="待定",
                    total_price=0,
                    duration_text="--",
                    comfort_score=80,
                    risk_level="low",
                ),
                recommendation=itinerary.summary,
                itinerary=itinerary,
            )

        order = TravelOrder(
            user_id=request.user_id,
            comparison_id=option.id,
            option=option,
            steps=[
                OrderStep(name="信息解析", detail="提取乘机人、日期、城市与偏好"),
                OrderStep(name="平台匹配", detail="匹配航班、酒店、地图与日历平台"),
                OrderStep(name="参数填表", detail="模拟填充 OTA、酒店和交通表单"),
                OrderStep(name="等待授权", detail="等待用户一次性支付授权"),
                OrderStep(name="结果回调", detail="回写订单号、酒店确认号和行程数据"),
            ],
        )
        _save("order", order.id, request.user_id, order)
        return order

    def authorize_payment(self, request: PaymentAuthorizationRequest) -> TravelOrder:
        order = self.get_order(request.order_id)
        if order is None:
            raise ValueError("order not found")
        order.payment_authorized = True
        order.status = "authorized"
        order.steps[3].status = "done"
        order.steps[3].detail = f"已通过 {request.method} 完成模拟授权。"
        _save("order", order.id, request.user_id, order)
        return order

    def execute(self, request: ExecuteOrderRequest) -> TravelOrder:
        order = self.get_order(request.order_id)
        if order is None:
            raise ValueError("order not found")
        if not order.payment_authorized:
            raise ValueError("payment not authorized")

        order.status = "completed"
        for step in order.steps:
            step.status = "done"
        order.confirmations = {
            "flight": "FLT-CA1832-2026",
            "hotel": "HTL-XIDAN-8821",
            "transport": "MAP-ROUTE-READY",
            "payment": "PAY-MOCK-SUCCESS",
        }
        saved = store.save_itinerary(order.option.itinerary)
        order.option.itinerary = saved
        _save("order", order.id, request.user_id, order)
        return order

    def get_order(self, order_id: str) -> TravelOrder | None:
        payload = store.get_record("order", order_id)
        return TravelOrder.model_validate(payload) if payload else None


class SystemSyncService:
    def sync(self, request: SystemSyncRequest) -> SystemSyncResult:
        itinerary = store.get_itinerary(request.itinerary_id)
        if itinerary is None and request.order_id:
            order = execution_center.get_order(request.order_id)
            itinerary = order.option.itinerary if order else None
        if itinerary is None:
            raise ValueError("itinerary not found")

        first = itinerary.items[0] if itinerary.items else None
        items = [
            SyncItem(
                target="calendar",
                title="日历",
                detail=f"待写入 {len(itinerary.items)} 个行程事件",
                status="ready",
            ),
            SyncItem(
                target="alarm",
                title="提醒",
                detail="待创建出发通知提醒（提前 30 分钟）",
                status="ready",
            ),
            SyncItem(
                target="clock",
                title="系统闹钟",
                detail="待写入响铃闹钟（提前 30 分钟 + 提前 5 分钟）",
                status="ready",
            ),
            SyncItem(
                target="widget",
                title="桌面组件",
                detail="待启用通知栏行程卡",
                status="ready",
            ),
            SyncItem(
                target="memo",
                title="备忘录",
                detail="待写入行程摘要",
                status="ready",
            ),
            SyncItem(
                target="map",
                title="地图",
                detail=f"待打开 {itinerary.intent.destination} 路线规划",
                status="ready",
                deeplink=f"amapuri://route/plan/?dname={first.location if first else itinerary.intent.destination}",
            ),
        ]
        topology_nodes = [
            {
                "id": item.id,
                "day": item.day,
                "time": item.start_time,
                "title": item.title,
                "location": item.location,
                "category": item.category,
            }
            for item in itinerary.items
        ]
        result = SystemSyncResult(
            user_id=request.user_id,
            itinerary_id=itinerary.id,
            items=items,
            topology_nodes=topology_nodes,
        )
        _save("sync", result.id, request.user_id, result)
        return result

    def topology(self, itinerary_id: str) -> dict:
        itinerary = store.get_itinerary(itinerary_id)
        if itinerary is None:
            raise ValueError("itinerary not found")
        return {
            "itinerary_id": itinerary.id,
            "nodes": [
                {"id": item.id, "day": item.day, "time": item.start_time, "title": item.title, "location": item.location}
                for item in itinerary.items
            ],
            "edges": [
                {"from": itinerary.items[index].id, "to": itinerary.items[index + 1].id}
                for index in range(max(len(itinerary.items) - 1, 0))
            ],
        }


class GuardianService:
    def status(self, itinerary_id: str) -> GuardianStatus:
        incidents = self._incidents(itinerary_id)
        return GuardianStatus(
            itinerary_id=itinerary_id,
            status="incident_detected" if incidents else "watching",
            incidents=incidents,
            next_check="15 分钟后",
        )

    def simulate_incident(
        self,
        itinerary_id: str,
        kind: str = "flight_delay",
        detail: str | None = None,
    ) -> TravelIncident:
        profile = incident_profile(kind)
        incident = TravelIncident(
            itinerary_id=itinerary_id,
            kind=kind,
            severity=profile["severity"],  # type: ignore[arg-type]
            title=profile["title"],
            detail=detail.strip() if detail and detail.strip() else profile["detail"],
        )
        _save("incident", incident.id, "demo-user", incident)
        return incident

    def replan(self, request: ReplanRequest) -> ReplanProposal:
        itinerary = store.get_itinerary(request.itinerary_id)
        if itinerary is None:
            raise ValueError("itinerary not found")

        kind = request.kind or "other"
        detail = request.detail
        incident: TravelIncident | None = None
        if request.incident_id:
            payload = store.get_record("incident", request.incident_id)
            incident = TravelIncident.model_validate(payload) if payload else None
        if incident is None:
            incident = self.simulate_incident(request.itinerary_id, kind, detail)
        elif detail and detail.strip():
            incident = incident.model_copy(update={"detail": detail.strip()})

        profile = incident_profile(incident.kind)
        instruction = build_adjust_instruction(incident.kind, incident.detail)
        full_instruction = (
            f"【突发情况：{profile['label']}】\n"
            f"{instruction}\n\n"
            "请仅局部调整受影响节点，不要增删节点，硬锚点（交通/会议/酒店）尽量保持不变。"
        )
        response = itinerary_refiner.adjust_with_instruction(
            request.itinerary_id,
            full_instruction,
            request.user_id,
            persist=False,
        )

        updated = response.itinerary
        updated.warnings = list(dict.fromkeys([*updated.warnings, incident.detail]))
        changes = self._describe_item_changes(itinerary, updated, response.affected_item_ids)
        if not changes:
            changes = profile["changes"].split("|") if isinstance(profile.get("changes"), str) else profile.get("changes", [])
        if isinstance(changes, str):
            changes = [changes]

        proposal = ReplanProposal(
            itinerary_id=itinerary.id,
            incident=incident,
            summary=response.change_summary or f"已针对「{profile['label']}」生成局部调整方案",
            changes=changes[:6],
            updated_itinerary=updated,
        )
        _save("proposal", proposal.id, request.user_id, proposal)
        return proposal

    @staticmethod
    def _describe_item_changes(
        before: Itinerary,
        after: Itinerary,
        affected_ids: list[str],
    ) -> list[str]:
        before_map = {item.id: item for item in before.items}
        changes: list[str] = []
        for item_id in affected_ids:
            previous = before_map.get(item_id)
            current = next((item for item in after.items if item.id == item_id), None)
            if previous is None or current is None:
                continue
            if previous.start_time != current.start_time or previous.end_time != current.end_time:
                changes.append(f"《{current.title}》调整为 {current.start_time}–{current.end_time}")
            elif previous.title != current.title or previous.location != current.location:
                changes.append(f"《{current.title}》更新为 {current.location}")
        return changes

    def accept(self, request: AcceptReplanRequest) -> Itinerary:
        payload = store.get_record("proposal", request.proposal_id)
        if payload is None:
            raise ValueError("proposal not found")
        proposal = ReplanProposal.model_validate(payload)
        return store.save_itinerary(proposal.updated_itinerary)

    def _incidents(self, itinerary_id: str) -> list[TravelIncident]:
        records = store.latest_records("incident", "demo-user", limit=20)
        return [
            TravelIncident.model_validate(item)
            for item in records
            if item.get("itinerary_id") == itinerary_id
        ]


class TripReviewService:
    def review(self, itinerary_id: str) -> TripReview:
        itinerary = store.get_itinerary(itinerary_id)
        if itinerary is None:
            raise ValueError("itinerary not found")
        quote = price_engine.quote_itinerary(itinerary)
        review = TripReview(
            itinerary_id=itinerary.id,
            summary=f"{itinerary.title} 已完成回顾：整体节奏稳定，关键节点已沉淀为个人偏好。",
            budget_total=quote.total,
            completed_items=len(itinerary.items),
            preference_memory=[
                f"偏好住宿区域：{itinerary.intent.accommodation_area or '市中心'}",
                f"偏好体验：{', '.join(itinerary.intent.preferences[:3]) or '舒适高效'}",
                "遇到延误时倾向保留缓冲而非压缩休息时间",
            ],
            next_trip_suggestions=["提前预约热门景点", "保留 20% 弹性时间", "优先选择可免费取消酒店"],
        )
        _save("review", review.id, "demo-user", review)
        return review


plan_comparison_service = PlanComparisonService()
execution_center = ExecutionCenter()
system_sync_service = SystemSyncService()
guardian_service = GuardianService()
trip_review_service = TripReviewService()
