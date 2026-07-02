from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from app.agent.node_meta import apply_node_metadata
from app.models.schemas import (
    GeneratedItineraryItem,
    GeneratedItineraryPlan,
    Itinerary,
    ItineraryItem,
    TransportLeg,
    TravelIntent,
)
from app.services.llm import llm_service
from app.tools.travel_tools import travel_tools


class TripPlanner:
    def build_itinerary(
        self,
        user_id: str,
        intent: TravelIntent,
        tool_results: dict[str, Any],
        retrieved_context: list[dict[str, str]],
    ) -> Itinerary:
        days = self._resolve_duration(intent)
        intent = intent.model_copy(update={"duration_days": days})
        plan = self._generate_with_llm(intent, tool_results, retrieved_context)
        if plan is None or not plan.items:
            plan = self._fallback_plan(intent, tool_results)

        items = [
            apply_node_metadata(
                ItineraryItem(
                    day=item.day,
                    start_time=item.start_time,
                    end_time=item.end_time,
                    title=item.title,
                    location=item.location,
                    category=item.category,
                    description=item.description,
                    geo_lat=item.geo_lat,
                    geo_lng=item.geo_lng,
                    route_from_previous=self._route_for_first_transport(item, intent) if item.category == "transport" and item.day == 1 else None,
                )
            )
            for item in plan.items
        ]

        weather = tool_results.get("weather", {})
        warnings = list(dict.fromkeys([*plan.warnings, *[w["message"] for w in tool_results.get("conflicts", []) if w.get("message")]]))
        if weather.get("rain_probability"):
            warnings.append(f"降水概率 {weather['rain_probability']}，建议保留室内备选。")

        context_note = ""
        if retrieved_context:
            context_note = f"已参考 {len(retrieved_context)} 条上传资料或个人知识库片段。"

        return Itinerary(
            user_id=user_id,
            title=plan.title,
            intent=intent,
            items=items,
            summary=plan.summary,
            explanation=f"{plan.explanation}{context_note}",
            warnings=warnings,
            created_at=datetime.utcnow(),
        )

    def _resolve_duration(self, intent: TravelIntent) -> int:
        if intent.duration_days:
            return max(1, intent.duration_days)
        if intent.start_date and intent.end_date:
            try:
                start = datetime.fromisoformat(intent.start_date)
                end = datetime.fromisoformat(intent.end_date)
                return max(1, (end - start).days + 1)
            except ValueError:
                pass
        return 3

    def _generate_with_llm(
        self,
        intent: TravelIntent,
        tool_results: dict[str, Any],
        retrieved_context: list[dict[str, str]],
    ) -> GeneratedItineraryPlan | None:
        if not llm_service.configured:
            return None

        weather = tool_results.get("weather", {})
        places = tool_results.get("places") or []
        context_snippets = "\n".join(
            f"- {item.get('content', item.get('text', ''))[:240]}"
            for item in retrieved_context[:6]
            if item.get("content") or item.get("text")
        )

        prompt = f"""
你是资深旅行导演 Agent，请根据用户需求生成真实可执行的行程方案。

## 用户需求
- 出发地：{intent.origin or "未指定"}
- 目的地：{intent.destination}
- 出行日期：{intent.start_date or "待定"} 至 {intent.end_date or "待定"}
- 天数：{intent.duration_days} 天
- 人数：{intent.travelers}
- 偏好：{", ".join(intent.preferences) or "综合体验"}
- 必去地点：{", ".join(intent.must_visit) or "无"}
- 约束：{", ".join(intent.constraints) or "无"}
- 住宿区域：{intent.accommodation_area or "市中心"}
- 原始描述：{intent.raw_text}

## 外部上下文
- 天气：{json.dumps(weather, ensure_ascii=False)}
- 候选 POI：{json.dumps(places[:8], ensure_ascii=False)}
- 上传资料摘要：
{context_snippets or "无"}

## 输出要求
1. 生成完整 {intent.duration_days} 天行程，每天 3~5 个节点，时间顺序合理
2. 包含交通抵达、餐饮、核心景点/会议、酒店、弹性缓冲等真实安排
3. location 写具体可导航地点（如「北京首都国际机场T3」「故宫博物院」）
4. geo_lat / geo_lng 使用 GCJ-02 坐标，尽量准确（小数点后 4 位）
5. category 只能是 transport/meeting/food/sight/hotel/free/alert
6. warnings 列出预约、闭馆、交通等真实风险
7. 只返回 JSON，符合 GeneratedItineraryPlan schema，不要 markdown
"""
        fallback = self._fallback_plan(intent, tool_results)
        return llm_service.structured(prompt, GeneratedItineraryPlan, fallback)

    def _fallback_plan(self, intent: TravelIntent, tool_results: dict[str, Any]) -> GeneratedItineraryPlan:
        days = intent.duration_days or 3
        city = intent.destination
        accommodation = intent.accommodation_area or "市中心"
        places = tool_results.get("places") or travel_tools.search_places(city, "")

        items: list[GeneratedItineraryItem] = [
            GeneratedItineraryItem(
                day=1,
                start_time="08:30",
                end_time="10:45",
                title=f"抵达{city}",
                location=f"{city}机场/车站",
                category="transport",
                description="预留抵达、取行李和进城时间。",
            ),
            GeneratedItineraryItem(
                day=1,
                start_time="11:30",
                end_time="13:00",
                title="午餐与入住缓冲",
                location=accommodation,
                category="food",
                description="先解决午餐并把行李放到酒店。",
            ),
        ]

        if any("故宫" in value for value in [*intent.preferences, *intent.must_visit]):
            items.append(
                GeneratedItineraryItem(
                    day=1,
                    start_time="15:00",
                    end_time="17:30",
                    title="故宫博物院",
                    location="故宫博物院",
                    category="sight",
                    description="核心景点体验。",
                    geo_lat=39.9181,
                    geo_lng=116.3970,
                )
            )

        for day in range(2, days + 1):
            focus_place = places[(day - 2) % len(places)] if places else {"name": f"{city}城市探索", "area": city}
            items.extend(
                [
                    GeneratedItineraryItem(
                        day=day,
                        start_time="09:30",
                        end_time="11:30",
                        title=focus_place["name"],
                        location=focus_place["area"],
                        category=focus_place.get("category", "sight"),
                        description="根据偏好推荐的核心节点。",
                    ),
                    GeneratedItineraryItem(
                        day=day,
                        start_time="14:00",
                        end_time="16:30",
                        title="弹性探索时间",
                        location=city,
                        category="free",
                        description="预留给临时调整或新增兴趣点。",
                    ),
                ]
            )

        return GeneratedItineraryPlan(
            title=f"{city}{days}日个人旅行导演方案",
            summary=f"围绕{city}出行、{accommodation}住宿和{', '.join(intent.preferences[:3]) or '综合体验'}生成。",
            explanation="方案优先满足硬约束，再平衡交通、景点、餐饮和弹性缓冲。（LLM 未配置时的规则兜底）",
            items=items,
        )

    def _route_for_first_transport(self, item: GeneratedItineraryItem, intent: TravelIntent) -> TransportLeg | None:
        return TransportLeg(
            origin=intent.origin or "出发地",
            destination=intent.destination,
            mode="flight" if "机场" in item.location else "train",
            minutes=135,
            note="可接入航班/高铁数据后自动校准。",
        )


trip_planner = TripPlanner()
