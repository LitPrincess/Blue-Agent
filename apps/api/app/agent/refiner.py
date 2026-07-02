from __future__ import annotations

from copy import deepcopy

from app.models.schemas import Itinerary, ItineraryItem, RefinementRequest, RescheduleNodeRequest, UpdateNodeRequest
from app.agent.node_meta import apply_node_metadata
from app.services.store import store


class ItineraryRefiner:
    def refine(self, request: RefinementRequest) -> Itinerary:
        current = store.get_itinerary(request.itinerary_id)
        if current is None:
            raise ValueError("Itinerary not found")

        updated = deepcopy(current)
        instruction = request.instruction
        updated.id = current.id
        updated.version = current.version + 1
        updated.explanation = f"{current.explanation}\n\n本次微调：{instruction}"

        if "故宫" in instruction and ("周日" in instruction or "第二天" in instruction):
            for item in updated.items:
                if "故宫" in item.title:
                    item.day = min((current.intent.duration_days or 3), 2)
                    item.start_time = "09:30"
                    item.end_time = "12:00"
                    item.risk_flags.append("已根据用户指令调整时间")

        if "不要太累" in instruction or "轻松" in instruction:
            updated.items.append(
                ItineraryItem(
                    day=1,
                    start_time="16:30",
                    end_time="17:30",
                    title="休息缓冲",
                    location=current.intent.accommodation_area or current.intent.destination,
                    category="free",
                    description="根据用户反馈增加体力恢复时间。",
                )
            )

        if "午餐" in instruction and "冲突" in instruction:
            updated.warnings.append("午餐与会议存在冲突，建议提前或延后 30 分钟。")

        store.save_itinerary(updated)
        store.add_message(request.user_id, "user", instruction)
        store.add_message(request.user_id, "assistant", "已生成新的行程版本。")
        return updated

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


itinerary_refiner = ItineraryRefiner()
