from __future__ import annotations

import json
import re
from copy import deepcopy
from typing import Any

from app.agent.node_meta import apply_node_metadata
from app.models.schemas import (
    AddNodeRequest,
    DeleteNodeRequest,
    Itinerary,
    ItineraryItem,
    RefinementRequest,
    ReorderNodesRequest,
    RescheduleNodeRequest,
    SmartUpdateNodeRequest,
    SmartUpdateNodeResponse,
    SmartUpdatePlan,
    UpdateNodeRequest,
    WeatherOptimizeRequest,
    WeatherOptimizeResponse,
    ItineraryWeatherResponse,
)
from app.services.llm import llm_service
from app.services.store import store
from app.tools.travel_tools import travel_tools


def _time_to_minutes(value: str) -> int:
    match = re.match(r"^(\d{1,2}):(\d{2})$", value.strip())
    if not match:
        return 0
    return int(match.group(1)) * 60 + int(match.group(2))


def _minutes_to_time(minutes: int) -> str:
    minutes = max(0, min(minutes, 23 * 60 + 59))
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


class ItineraryRefiner:
    def adjust_with_instruction(
        self,
        itinerary_id: str,
        instruction: str,
        user_id: str = "demo-user",
        *,
        persist: bool = True,
    ) -> SmartUpdateNodeResponse:
        current = store.get_itinerary(itinerary_id)
        if current is None:
            raise ValueError("Itinerary not found")

        cleaned = instruction.strip()
        if not cleaned:
            raise ValueError("instruction 不能为空")

        plan = self._rebalance_items_with_llm(current, current.items, cleaned)
        if plan is not None:
            anchor_id = plan.affected_item_ids[0] if plan.affected_item_ids else (current.items[0].id if current.items else "")
            updated = self._apply_smart_plan(current, plan, anchor_id)
            updated.explanation = f"{current.explanation}\n\n突发调整：{plan.change_summary}"
            if persist:
                store.save_itinerary(updated)
                store.add_message(user_id, "user", cleaned)
                store.add_message(user_id, "assistant", plan.change_summary or "已生成局部调整方案。")
            return SmartUpdateNodeResponse(
                itinerary=updated,
                change_summary=plan.change_summary,
                affected_item_ids=plan.affected_item_ids,
                warnings=list(dict.fromkeys([*updated.warnings, *plan.warnings])),
            )

        updated = deepcopy(current)
        updated.version = current.version + 1
        updated.explanation = f"{current.explanation}\n\n突发调整：{cleaned}"
        updated.warnings = list(dict.fromkeys([*updated.warnings, "已记录调整需求，建议人工确认节点时间"]))
        if persist:
            store.save_itinerary(updated)
            store.add_message(user_id, "user", cleaned)
            store.add_message(user_id, "assistant", "已记录调整需求。")
        return SmartUpdateNodeResponse(
            itinerary=updated,
            change_summary="已记录调整需求，部分节点建议人工确认。",
            affected_item_ids=[],
            warnings=updated.warnings,
        )

    def refine(self, request: RefinementRequest) -> Itinerary:
        response = self.adjust_with_instruction(
            request.itinerary_id,
            f"用户希望微调行程：{request.instruction.strip()}。请根据说明调整节点时间、顺序或描述；硬锚点（交通/会议/酒店）尽量保留。",
            request.user_id,
            persist=True,
        )
        return response.itinerary

    def reschedule_node(self, request: RescheduleNodeRequest) -> Itinerary:
        current = store.get_itinerary(request.itinerary_id)
        if current is None:
            raise ValueError("Itinerary not found")

        updated = deepcopy(current)
        target = next((item for item in updated.items if item.id == request.item_id), None)
        if target is None:
            raise ValueError("Node not found")

        target.start_time = request.start_time
        if request.day is not None:
            target.day = request.day
        target.risk_flags = list(dict.fromkeys([*target.risk_flags, "用户调整时间"]))
        updated.version = current.version + 1
        updated.explanation = f"{current.explanation}\n\n节点《{target.title}》已调整到 {target.start_time}。"
        updated.items = [apply_node_metadata(item) for item in updated.items]
        store.save_itinerary(updated)
        return updated

    def update_node(self, request: UpdateNodeRequest) -> Itinerary:
        current = store.get_itinerary(request.itinerary_id)
        if current is None:
            raise ValueError("Itinerary not found")

        updated = deepcopy(current)
        target = next((item for item in updated.items if item.id == request.item_id), None)
        if target is None:
            raise ValueError("Node not found")

        changes: list[str] = []
        if request.title is not None:
            target.title = request.title.strip() or target.title
            changes.append("标题")
        if request.start_time is not None:
            target.start_time = request.start_time
            changes.append("时间")
        if request.end_time is not None:
            target.end_time = request.end_time
        if request.location is not None:
            target.location = request.location.strip() or target.location
            changes.append("地点")
        if request.geo_lat is not None:
            target.geo_lat = request.geo_lat
            changes.append("坐标")
        if request.geo_lng is not None:
            target.geo_lng = request.geo_lng
        if request.day is not None:
            target.day = request.day

        if not changes:
            raise ValueError("没有可更新的字段")

        target.risk_flags = list(dict.fromkeys([*target.risk_flags, "用户编辑节点"]))
        updated.version = current.version + 1
        updated.explanation = f"{current.explanation}\n\n节点《{target.title}》已更新：{'、'.join(changes)}。"
        updated.items = [apply_node_metadata(item) for item in updated.items]
        store.save_itinerary(updated)
        return updated

    def smart_update_node(self, request: SmartUpdateNodeRequest) -> SmartUpdateNodeResponse:
        current = store.get_itinerary(request.itinerary_id)
        if current is None:
            raise ValueError("Itinerary not found")

        target = next((item for item in current.items if item.id == request.item_id), None)
        if target is None:
            raise ValueError("Node not found")

        change_lines = self._describe_changes(target, request)
        if not change_lines and not request.instruction:
            raise ValueError("没有可更新的字段")

        plan = self._smart_update_with_llm(current, target, request, change_lines)
        if plan is None:
            updated = self._smart_update_fallback(current, request, change_lines)
            return SmartUpdateNodeResponse(
                itinerary=updated,
                change_summary=f"已更新《{target.title}》，并自动顺延同日后续节点时间。",
                affected_item_ids=self._affected_after(current.items, updated.items, request.item_id),
                warnings=updated.warnings,
            )

        updated = self._apply_smart_plan(current, plan, request.item_id)
        store.save_itinerary(updated)
        return SmartUpdateNodeResponse(
            itinerary=updated,
            change_summary=plan.change_summary,
            affected_item_ids=plan.affected_item_ids,
            warnings=list(dict.fromkeys([*updated.warnings, *plan.warnings])),
        )

    def delete_node(self, request: DeleteNodeRequest) -> SmartUpdateNodeResponse:
        current = store.get_itinerary(request.itinerary_id)
        if current is None:
            raise ValueError("Itinerary not found")

        target = next((item for item in current.items if item.id == request.item_id), None)
        if target is None:
            raise ValueError("Node not found")

        remaining = [item for item in current.items if item.id != request.item_id]
        if not remaining:
            raise ValueError("行程至少保留一个节点")

        instruction = (
            request.instruction.strip()
            if request.instruction
            else f"用户删除了节点《{target.title}》，请调整剩余行程的时间与安排，填补空档，不要新增节点。"
        )
        plan = self._rebalance_items_with_llm(current, remaining, instruction)
        before_items = current.items

        if plan is None:
            updated = deepcopy(current)
            updated.items = [apply_node_metadata(item) for item in remaining]
            updated.version = current.version + 1
            updated.explanation = f"{current.explanation}\n\n已删除节点《{target.title}》。"
            summary = f"已删除《{target.title}》，剩余 {len(remaining)} 个节点。"
            store.save_itinerary(updated)
            return SmartUpdateNodeResponse(
                itinerary=updated,
                change_summary=summary,
                affected_item_ids=[],
                warnings=updated.warnings,
            )

        updated = self._apply_smart_plan(current, plan, request.item_id, item_order=[item.id for item in remaining])
        updated.explanation = f"{current.explanation}\n\n删除联动：已删除《{target.title}》。{plan.change_summary}"
        store.save_itinerary(updated)
        return SmartUpdateNodeResponse(
            itinerary=updated,
            change_summary=f"已删除《{target.title}》。{plan.change_summary}",
            affected_item_ids=plan.affected_item_ids,
            warnings=list(dict.fromkeys([*updated.warnings, *plan.warnings])),
        )

    def add_node(self, request: AddNodeRequest) -> SmartUpdateNodeResponse:
        current = store.get_itinerary(request.itinerary_id)
        if current is None:
            raise ValueError("Itinerary not found")

        start_minutes = _time_to_minutes(request.start_time)
        end_time = request.end_time or _minutes_to_time(start_minutes + 60)
        location = request.location.strip() or current.intent.destination or current.intent.accommodation_area or "待定"
        title = request.title.strip() or "新活动"

        new_item = apply_node_metadata(
            ItineraryItem(
                day=request.day,
                start_time=request.start_time,
                end_time=end_time,
                title=title,
                location=location,
                category=request.category,
                description=f"用户新增：{title}",
                risk_flags=["用户新增节点"],
            )
        )

        items = list(current.items)
        if request.insert_after_item_id:
            index = next((i for i, node in enumerate(items) if node.id == request.insert_after_item_id), None)
            if index is None:
                raise ValueError("insert_after_item_id not found")
            items.insert(index + 1, new_item)
        else:
            items.append(new_item)

        instruction = (
            request.instruction.strip()
            if request.instruction
            else f"用户新增了节点《{title}》（{request.start_time}-{end_time}）。请调整相邻节点时间，保留交通/会议/酒店等硬锚点，不要删除节点。"
        )
        plan = self._rebalance_items_with_llm(current, items, instruction)

        if plan is None:
            updated = deepcopy(current)
            updated.items = sorted(
                [apply_node_metadata(item) for item in items],
                key=lambda item: (item.day, _time_to_minutes(item.start_time)),
            )
            updated.version = current.version + 1
            updated.explanation = f"{current.explanation}\n\n已新增节点《{title}》。"
            store.save_itinerary(updated)
            return SmartUpdateNodeResponse(
                itinerary=updated,
                change_summary=f"已新增《{title}》。",
                affected_item_ids=[new_item.id],
                warnings=updated.warnings,
            )

        updated = self._apply_smart_plan(current, plan, new_item.id, item_order=[item.id for item in items])
        updated.explanation = f"{current.explanation}\n\n新增联动：已添加《{title}》。{plan.change_summary}"
        store.save_itinerary(updated)
        return SmartUpdateNodeResponse(
            itinerary=updated,
            change_summary=f"已新增《{title}》。{plan.change_summary}",
            affected_item_ids=plan.affected_item_ids,
            warnings=list(dict.fromkeys([*updated.warnings, *plan.warnings])),
        )

    def reorder_nodes(self, request: ReorderNodesRequest) -> SmartUpdateNodeResponse:
        current = store.get_itinerary(request.itinerary_id)
        if current is None:
            raise ValueError("Itinerary not found")

        if not request.item_ids:
            raise ValueError("item_ids 不能为空")

        known_ids = {item.id for item in current.items}
        if set(request.item_ids) != known_ids:
            raise ValueError("item_ids 必须与当前全部节点 id 一致")

        item_map = {item.id: item for item in current.items}
        reordered = [item_map[item_id] for item_id in request.item_ids]

        instruction = (
            request.instruction.strip()
            if request.instruction
            else "用户调整了节点顺序，请根据新顺序合理重排各节点时间，保留交通缓冲，不要增删节点。"
        )
        plan = self._rebalance_items_with_llm(current, reordered, instruction)
        before_items = current.items

        if plan is None:
            updated = deepcopy(current)
            updated.items = [apply_node_metadata(item) for item in reordered]
            updated.version = current.version + 1
            updated.explanation = f"{current.explanation}\n\n用户已调整节点顺序。"
            store.save_itinerary(updated)
            return SmartUpdateNodeResponse(
                itinerary=updated,
                change_summary="节点顺序已更新。",
                affected_item_ids=self._affected_after(before_items, updated.items, request.item_ids[0]),
                warnings=updated.warnings,
            )

        updated = self._apply_smart_plan(current, plan, request.item_ids[0], item_order=request.item_ids)
        updated.explanation = f"{current.explanation}\n\n顺序联动：{plan.change_summary}"
        store.save_itinerary(updated)
        return SmartUpdateNodeResponse(
            itinerary=updated,
            change_summary=plan.change_summary,
            affected_item_ids=plan.affected_item_ids,
            warnings=list(dict.fromkeys([*updated.warnings, *plan.warnings])),
        )

    def weather_optimize(
        self,
        request: WeatherOptimizeRequest,
        weather: ItineraryWeatherResponse,
        weather_context: list[dict[str, Any]],
    ) -> WeatherOptimizeResponse:
        current = store.get_itinerary(request.itinerary_id)
        if current is None:
            raise ValueError("Itinerary not found")
        if not weather.available or not weather_context:
            return WeatherOptimizeResponse(
                itinerary=current,
                change_summary=weather.summary,
                affected_item_ids=[],
                warnings=weather.warnings,
                weather=weather,
            )

        instruction = f"""
基于真实和风天气结果，对行程做天气友好的轻量优化。只关注户外景点和步行/交通节点。

真实天气上下文：
{json.dumps(weather_context, ensure_ascii=False, indent=2)}

优化目标：
1. 优先把有降水、高温、风力等关注标签的户外节点调整到更舒适时段
2. 对交通/步行节点预留更充分缓冲
3. meeting/hotel 等硬锚点尽量保持稳定
4. 不新增节点、不删除节点，只调整既有节点顺序、时间和描述
5. 所有表达保持正向，例如“建议室内备选”“建议提前到上午”，不要输出“不推荐/不建议/过远/不可控”
6. 如果无需调整，也要返回完整 items，并在 change_summary 说明“当前行程与天气匹配度较好”
"""
        plan = self._rebalance_items_with_llm(
            current,
            current.items,
            instruction,
            weather_context={"source": "qweather", "items": weather_context},
        )
        if plan is None:
            return WeatherOptimizeResponse(
                itinerary=current,
                change_summary="已同步真实天气，当前行程保持原方案展示。",
                affected_item_ids=[],
                warnings=weather.warnings,
                weather=weather,
            )

        updated = self._apply_weather_plan(current, plan)
        updated.explanation = f"{current.explanation}\n\n天气优化：{plan.change_summary}"
        store.save_itinerary(updated)
        return WeatherOptimizeResponse(
            itinerary=updated,
            change_summary=plan.change_summary,
            affected_item_ids=plan.affected_item_ids,
            warnings=list(dict.fromkeys([*updated.warnings, *plan.warnings, *weather.warnings])),
            weather=weather,
        )

    def _describe_changes(self, target: ItineraryItem, request: SmartUpdateNodeRequest) -> list[str]:
        lines: list[str] = []
        if request.title is not None and request.title.strip() and request.title.strip() != target.title:
            lines.append(f"标题：{target.title} → {request.title.strip()}")
        if request.start_time is not None and request.start_time != target.start_time:
            lines.append(f"开始时间：{target.start_time} → {request.start_time}")
        if request.end_time is not None and request.end_time != target.end_time:
            lines.append(f"结束时间：{target.end_time} → {request.end_time}")
        if request.location is not None and request.location.strip() and request.location.strip() != target.location:
            lines.append(f"地点：{target.location} → {request.location.strip()}")
        if request.day is not None and request.day != target.day:
            lines.append(f"天数：第{target.day}天 → 第{request.day}天")
        if request.geo_lat is not None and request.geo_lng is not None:
            lines.append(f"地图坐标：({target.geo_lat}, {target.geo_lng}) → ({request.geo_lat}, {request.geo_lng})")
        return lines

    def _smart_update_with_llm(
        self,
        current: Itinerary,
        target: ItineraryItem,
        request: SmartUpdateNodeRequest,
        change_lines: list[str],
    ) -> SmartUpdatePlan | None:
        if not llm_service.configured:
            return None

        intent = current.intent
        date_range = None
        if intent.start_date and intent.end_date:
            date_range = f"{intent.start_date}~{intent.end_date}"
        weather = travel_tools.get_weather(intent.destination or "", date_range)

        items_payload = [
            {
                "id": item.id,
                "day": item.day,
                "start_time": item.start_time,
                "end_time": item.end_time,
                "title": item.title,
                "location": item.location,
                "category": item.category,
                "node_type": item.node_type,
                "description": item.description,
                "geo_lat": item.geo_lat,
                "geo_lng": item.geo_lng,
            }
            for item in current.items
        ]

        user_changes = "\n".join(f"- {line}" for line in change_lines) or "- 无结构化字段变更"
        extra_instruction = request.instruction.strip() if request.instruction else "无"

        prompt = f"""
你是旅行导演 Agent 的行程联动编排器。用户修改了行程中的一个节点，请联动调整相关节点，使整个行程仍然合理可执行。

## 行程背景
- 目的地：{intent.destination}
- 日期：{intent.start_date or "待定"} 至 {intent.end_date or "待定"}
- 天气参考：{json.dumps(weather, ensure_ascii=False)}

## 当前全部节点（必须保留每个 id，不要删除节点）
{json.dumps(items_payload, ensure_ascii=False, indent=2)}

## 用户正在编辑的节点
- id: {target.id}
- 当前标题：{target.title}

## 用户提交的变更
{user_changes}

## 补充说明
{extra_instruction}

## 联动规则
1. 返回完整 items 列表，id 必须与输入一致，数量相同，不要增删节点
2. 若开始时间延后，检查同日后续节点是否冲突，必要时顺延并保留 15~30 分钟交通缓冲
3. transport/meeting/hotel 等硬锚点不要轻易改动，优先调整 free/food/sight 等软节点
4. 若地点变更，更新 description 使其与 location 一致
5. change_summary 用中文简述本次联动调整（2~4 句）
6. affected_item_ids 列出所有时间或地点发生变化的节点 id（含被编辑节点）
7. warnings 列出冲突、闭馆、天气等风险，没有则空数组
8. 只返回 JSON，符合 SmartUpdatePlan schema
"""
        fallback = SmartUpdatePlan(
            items=[],
            change_summary="",
            affected_item_ids=[],
            warnings=[],
        )
        plan = llm_service.structured(prompt, SmartUpdatePlan, fallback)
        if not plan.items or len(plan.items) != len(current.items):
            return None
        known_ids = {item.id for item in current.items}
        if any(item.id not in known_ids for item in plan.items):
            return None
        return plan

    def _rebalance_items_with_llm(
        self,
        current: Itinerary,
        items: list[ItineraryItem],
        instruction: str,
        weather_context: dict[str, Any] | None = None,
    ) -> SmartUpdatePlan | None:
        if not llm_service.configured:
            return None

        intent = current.intent
        date_range = None
        if intent.start_date and intent.end_date:
            date_range = f"{intent.start_date}~{intent.end_date}"
        weather = weather_context or travel_tools.get_weather(intent.destination or "", date_range)

        items_payload = [
            {
                "id": item.id,
                "day": item.day,
                "start_time": item.start_time,
                "end_time": item.end_time,
                "title": item.title,
                "location": item.location,
                "category": item.category,
                "node_type": item.node_type,
                "description": item.description,
                "geo_lat": item.geo_lat,
                "geo_lng": item.geo_lng,
            }
            for item in items
        ]

        prompt = f"""
你是旅行导演 Agent 的行程联动编排器。请根据用户操作调整行程节点。

## 行程背景
- 目的地：{intent.destination}
- 日期：{intent.start_date or "待定"} 至 {intent.end_date or "待定"}
- 天气参考：{json.dumps(weather, ensure_ascii=False)}

## 当前节点列表（必须保留每个 id，不要增删节点）
{json.dumps(items_payload, ensure_ascii=False, indent=2)}

## 用户操作说明
{instruction}

## 联动规则
1. 返回完整 items 列表，id 必须与输入一致，数量相同
2. 调整时间避免冲突，保留 15~30 分钟交通缓冲
3. transport/meeting/hotel 等硬锚点优先保留
4. change_summary 用中文简述调整（2~4 句）
5. affected_item_ids 列出所有发生变化的节点 id
6. warnings 列出风险，没有则空数组
7. 输出保持正向表达，不要使用“不推荐/不建议/过远/不可控”等负向措辞
8. 只返回 JSON，符合 SmartUpdatePlan schema
"""
        fallback = SmartUpdatePlan(items=[], change_summary="", affected_item_ids=[], warnings=[])
        plan = llm_service.structured(prompt, SmartUpdatePlan, fallback)
        if not plan.items or len(plan.items) != len(items):
            return None
        known_ids = {item.id for item in items}
        if any(item.id not in known_ids for item in plan.items):
            return None
        return plan

    def _apply_smart_plan(
        self,
        current: Itinerary,
        plan: SmartUpdatePlan,
        edited_item_id: str,
        item_order: list[str] | None = None,
    ) -> Itinerary:
        updated = deepcopy(current)
        item_map = {item.id: item for item in updated.items}
        plan_map = {item.id: item for item in plan.items}

        for item_id, planned in plan_map.items():
            existing = item_map.get(item_id)
            if existing is None:
                continue
            merged = existing.model_copy(
                update={
                    "day": planned.day,
                    "start_time": planned.start_time,
                    "end_time": planned.end_time,
                    "title": planned.title,
                    "location": planned.location,
                    "category": planned.category,
                    "description": planned.description,
                    "geo_lat": planned.geo_lat if planned.geo_lat is not None else existing.geo_lat,
                    "geo_lng": planned.geo_lng if planned.geo_lng is not None else existing.geo_lng,
                    "risk_flags": list(
                        dict.fromkeys([*existing.risk_flags, "智能联动调整" if item_id != edited_item_id else "用户编辑节点"])
                    ),
                }
            )
            item_map[item_id] = apply_node_metadata(merged)

        order = item_order or [item.id for item in current.items]
        updated.items = [item_map[item_id] for item_id in order if item_id in item_map]
        updated.version = current.version + 1
        updated.explanation = f"{current.explanation}\n\n智能联动：{plan.change_summary}"
        updated.warnings = list(dict.fromkeys([*updated.warnings, *plan.warnings]))
        return updated

    def _apply_weather_plan(self, current: Itinerary, plan: SmartUpdatePlan) -> Itinerary:
        updated = deepcopy(current)
        item_map = {item.id: item for item in updated.items}
        for planned in plan.items:
            existing = item_map.get(planned.id)
            if existing is None:
                continue
            merged = existing.model_copy(
                update={
                    "day": planned.day,
                    "start_time": planned.start_time,
                    "end_time": planned.end_time,
                    "title": planned.title,
                    "location": planned.location,
                    "category": planned.category,
                    "description": planned.description,
                    "geo_lat": planned.geo_lat if planned.geo_lat is not None else existing.geo_lat,
                    "geo_lng": planned.geo_lng if planned.geo_lng is not None else existing.geo_lng,
                    "risk_flags": list(dict.fromkeys([*existing.risk_flags, "真实天气优化"])),
                }
            )
            item_map[planned.id] = apply_node_metadata(merged)

        updated.items = sorted(
            [item_map[item.id] for item in plan.items if item.id in item_map],
            key=lambda item: (item.day, _time_to_minutes(item.start_time)),
        )
        updated.version = current.version + 1
        updated.warnings = list(dict.fromkeys([*updated.warnings, *plan.warnings]))
        return updated

    def _smart_update_fallback(
        self,
        current: Itinerary,
        request: SmartUpdateNodeRequest,
        change_lines: list[str],
    ) -> Itinerary:
        updated = deepcopy(current)
        target = next(item for item in updated.items if item.id == request.item_id)

        if request.title is not None:
            target.title = request.title.strip() or target.title
        if request.start_time is not None:
            target.start_time = request.start_time
        if request.end_time is not None:
            target.end_time = request.end_time
        if request.location is not None:
            target.location = request.location.strip() or target.location
        if request.geo_lat is not None:
            target.geo_lat = request.geo_lat
        if request.geo_lng is not None:
            target.geo_lng = request.geo_lng
        if request.day is not None:
            target.day = request.day

        target.risk_flags = list(dict.fromkeys([*target.risk_flags, "用户编辑节点"]))
        updated.items = self._cascade_same_day_times(updated.items, request.item_id)
        updated.items = [apply_node_metadata(item) for item in updated.items]
        updated.version = current.version + 1
        summary = "；".join(change_lines) if change_lines else "已应用用户修改"
        updated.explanation = f"{current.explanation}\n\n节点编辑（规则联动）：{summary}"
        store.save_itinerary(updated)
        return updated

    def _cascade_same_day_times(self, items: list[ItineraryItem], changed_id: str) -> list[ItineraryItem]:
        ordered = sorted(items, key=lambda item: (item.day, _time_to_minutes(item.start_time)))
        changed = next(item for item in ordered if item.id == changed_id)
        changed_idx = next(i for i, item in enumerate(ordered) if item.id == changed_id)
        buffer_minutes = 20

        for index in range(changed_idx + 1, len(ordered)):
            current_item = ordered[index]
            if current_item.day != changed.day:
                break
            if current_item.category in {"transport", "meeting", "hotel"}:
                continue

            previous = ordered[index - 1]
            min_start = _time_to_minutes(previous.end_time) + buffer_minutes
            current_start = _time_to_minutes(current_item.start_time)
            if current_start < min_start:
                duration = max(_time_to_minutes(current_item.end_time) - current_start, 30)
                current_item.start_time = _minutes_to_time(min_start)
                current_item.end_time = _minutes_to_time(min_start + duration)
                current_item.risk_flags = list(
                    dict.fromkeys([*current_item.risk_flags, "因前序节点调整而顺延"])
                )

        return ordered

    @staticmethod
    def _affected_after(before: list[ItineraryItem], after: list[ItineraryItem], edited_id: str) -> list[str]:
        before_map = {item.id: item for item in before}
        affected: list[str] = []
        for item in after:
            previous = before_map.get(item.id)
            if previous is None:
                continue
            if (
                item.id == edited_id
                or item.start_time != previous.start_time
                or item.end_time != previous.end_time
                or item.location != previous.location
                or item.title != previous.title
            ):
                affected.append(item.id)
        return affected


itinerary_refiner = ItineraryRefiner()
