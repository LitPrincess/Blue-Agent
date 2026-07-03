from __future__ import annotations

from app.agent.intent import intent_extractor
from app.models.schemas import ContextInsight, FiveElements, IntentAnalyzeResponse, TravelIntent
from app.tools.travel_tools import travel_tools


class IntentAnalysisService:
    def analyze(self, message: str, user_id: str = "demo-user") -> IntentAnalyzeResponse:
        intent = intent_extractor.extract(message.strip())
        date_range = " - ".join(filter(None, [intent.start_date, intent.end_date])) or None
        weather = travel_tools.get_weather(intent.destination, date_range)
        conflicts = travel_tools.check_calendar_conflicts(user_id, date_range)

        actions: list[str] = []
        if any(keyword in message for keyword in ["出差", "商务", "会议"]):
            actions.append("出差")
        if intent.accommodation_area or "住" in message:
            actions.append("住宿")
        if any(keyword in message for keyword in ["吃", "餐", "美食", "烤鸭"]):
            actions.append("餐饮")
        if intent.must_visit or any(keyword in message for keyword in ["故宫", "景点", "游玩", "参观"]):
            actions.append("游览")
        if not actions:
            actions = ["出行规划"]

        locations = list(
            dict.fromkeys(
                filter(
                    None,
                    [intent.origin, intent.destination, intent.accommodation_area, *intent.must_visit],
                )
            )
        )
        times = list(
            filter(
                None,
                [
                    intent.start_date,
                    intent.end_date,
                    f"{intent.duration_days}天" if intent.duration_days else None,
                ],
            )
        )

        five_elements = FiveElements(
            actions=actions,
            locations=locations,
            time=times,
            constraints=intent.constraints or ["暂无硬约束"],
            preferences=intent.preferences or ["效率优先"],
        )

        calendar_detail = (
            f"已关联出行日期 {intent.start_date or '待定'}"
            f"{' 至 ' + intent.end_date if intent.end_date else ''}；"
            + ("无日程冲突" if not conflicts else "；".join(
                f"{item.get('title', '会议')} {item.get('time', '')}" for item in conflicts[:2]
            ))
        )
        weather_detail = (
            f"{weather.get('summary', '多云')} {weather.get('temperature', '18~26℃')} "
            f"降雨概率 {weather.get('rain_probability', '10%')}"
        )
        traffic_detail = f"{intent.destination}西单商圈高峰拥堵，{intent.must_visit[0] if intent.must_visit else '热门景点'}周末人流较大"

        context = [
            ContextInsight(key="calendar", title="日历", detail=calendar_detail, status="ok"),
            ContextInsight(key="weather", title="天气", detail=weather_detail, status="ok"),
            ContextInsight(key="traffic", title="路况", detail=traffic_detail, status="warn"),
        ]

        structured = {
            "origin": intent.origin or "",
            "destination": intent.destination,
            "startDate": intent.start_date or "",
            "endDate": intent.end_date or "",
            "preferences": " / ".join(intent.preferences),
        }

        summary = (
            f"信息已完整理解，我将为你生成高效、舒适、内容丰富的"
            f"{intent.destination}行程方案。"
        )

        return IntentAnalyzeResponse(
            intent=intent,
            structured=structured,
            five_elements=five_elements,
            context=context,
            summary=summary,
            progress=[
                {"step": "语义理解", "status": "done"},
                {"step": "实体抽取", "status": "done"},
                {"step": "上下文关联", "status": "done"},
                {"step": "方案生成", "status": "pending"},
            ],
        )


intent_analysis_service = IntentAnalysisService()
