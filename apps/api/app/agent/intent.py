from __future__ import annotations

import re
from datetime import date

from app.models.schemas import TravelIntent
from app.services.llm import llm_service
from app.utils.date_resolve import enrich_intent_dates, resolve_relative_dates


CITY_NAMES = ["北京", "上海", "广州", "深圳", "成都", "杭州", "西安", "南京", "重庆", "苏州"]


def fallback_intent(message: str) -> TravelIntent:
    destination = next((city for city in CITY_NAMES if city in message), "北京")
    origin = "上海" if "上海" in message and destination != "上海" else None
    duration_match = re.search(r"(\d+)\s*[天日]", message)
    travelers_match = re.search(r"(\d+)\s*(个人|人|位)", message)

    preferences = []
    for keyword in ["烤鸭", "美食", "故宫", "博物馆", "胡同", "文化", "亲子", "购物", "轻松", "低预算"]:
        if keyword in message:
            preferences.append(keyword)

    must_visit = []
    for keyword in ["故宫", "长城", "天安门", "西湖", "外滩", "兵马俑"]:
        if keyword in message:
            must_visit.append(keyword)

    constraints = []
    for keyword in ["住", "附近", "出差", "会议", "老人", "孩子", "不要太累"]:
        if keyword in message:
            constraints.append(keyword)

    accommodation_area = None
    area_match = re.search(r"住(.{1,8}?)(附近|旁边|周边)", message)
    if area_match:
        accommodation_area = area_match.group(1)

    start_date, end_date = resolve_relative_dates(message)

    return TravelIntent(
        origin=origin,
        destination=destination,
        start_date=start_date,
        end_date=end_date,
        duration_days=int(duration_match.group(1)) if duration_match else 3,
        travelers=int(travelers_match.group(1)) if travelers_match else 1,
        accommodation_area=accommodation_area,
        preferences=preferences or ["效率优先", "体验丰富"],
        constraints=constraints,
        must_visit=must_visit,
        raw_text=message,
    )


class IntentExtractor:
    def extract(self, message: str) -> TravelIntent:
        fallback = fallback_intent(message)
        today = date.today().isoformat()
        prompt = f"""
你是个人旅行导演 Agent 的意图解析器。请把用户旅行需求解析成 TravelIntent。
要求：
- 保留用户原始文本 raw_text
- 若用户说「今天」「明天」「后天」「大后天」「下周五」「下周三」等，必须换算为 YYYY-MM-DD（今天参考：{today}）
- start_date / end_date 使用 ISO 日期格式 YYYY-MM-DD
- 不确定的字段填 null，不要编造地点
- preferences 写用户偏好，constraints 写硬约束，must_visit 写明确要去的地点

用户输入：
{message}
"""
        result = llm_service.structured(prompt, TravelIntent, fallback)
        start_date, end_date = enrich_intent_dates(message, result.start_date, result.end_date)
        return result.model_copy(update={"start_date": start_date, "end_date": end_date, "raw_text": message})


intent_extractor = IntentExtractor()
