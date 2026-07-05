from __future__ import annotations

INCIDENT_PROFILES: dict[str, dict[str, str]] = {
    "flight_delay": {
        "label": "航班/高铁延误",
        "title": "交通节点延误",
        "detail": "关键航班或高铁晚点，后续节点需顺延并保留缓冲。",
        "severity": "medium",
        "instruction": "交通节点出现延误。请局部顺延受影响节点，插入 20~40 分钟缓冲，优先调整餐饮/景点等软节点，保留酒店与会议等硬锚点。",
        "changes": ["顺延受影响节点", "插入交通缓冲", "同步更新提醒时间"],
    },
    "weather_change": {
        "label": "天气变化",
        "title": "天气条件变化",
        "detail": "降水、高温或大风影响户外安排，需要改时段或室内备选。",
        "severity": "medium",
        "instruction": "目的地天气突变。请把户外节点改到更舒适时段，或替换为室内备选，局部调整，不要删除硬锚点。",
        "changes": ["户外改时段", "增加室内备选", "保留交通与住宿锚点"],
    },
    "schedule_change": {
        "label": "会议/通知改期",
        "title": "日程通知变更",
        "detail": "会议、活动或官方通知导致原时间安排失效。",
        "severity": "high",
        "instruction": "会议或官方通知改期。请围绕新的时间窗口局部重排，优先保证会议/交通锚点，压缩或后移弹性活动。",
        "changes": ["重排会议前后节点", "压缩弹性活动", "更新冲突提醒"],
    },
    "oversleep": {
        "label": "睡过头/起床延误",
        "title": "出发时间推迟",
        "detail": "起床或出门晚于计划，上午节点需整体后移。",
        "severity": "low",
        "instruction": "用户起床或出门晚于计划。请从当前时段起局部后移未发生节点，可压缩非关键活动，保留必须抵达的硬锚点。",
        "changes": ["上午节点整体后移", "压缩非关键活动", "保留必须抵达节点"],
    },
    "traffic_disruption": {
        "label": "路况/封路",
        "title": "路况突发中断",
        "detail": "拥堵、封路或临时交通管制导致通行时间变长。",
        "severity": "medium",
        "instruction": "路况拥堵或封路。请增加市内交通缓冲，局部后移后续节点，优先调整景点/餐饮顺序。",
        "changes": ["增加市内交通缓冲", "后移后续节点", "更新到达预估"],
    },
    "venue_issue": {
        "label": "景点/餐厅不可用",
        "title": "目的地临时不可用",
        "detail": "景点闭馆、餐厅满座或临时停业，需要替换或改期。",
        "severity": "medium",
        "instruction": "目标景点或餐厅临时不可用。请替换为同区域备选或改到相邻时段，局部修改，不要影响交通/住宿锚点。",
        "changes": ["替换不可用节点", "调整相邻时段", "更新地点描述"],
    },
    "hotel_issue": {
        "label": "酒店变更/满房",
        "title": "住宿安排变化",
        "detail": "酒店满房、换房或入住时间变化，需联动调整前后行程。",
        "severity": "high",
        "instruction": "住宿安排发生变化。请联动调整入住前后节点时间与地点描述，保留交通锚点，局部更新行程。",
        "changes": ["调整入住前后节点", "更新住宿地点", "保留交通连接"],
    },
    "personal_delay": {
        "label": "个人临时延误",
        "title": "个人行程延误",
        "detail": "排队、取票、安检等个人原因导致单个节点超时。",
        "severity": "low",
        "instruction": "个人原因导致当前节点超时。请从该节点起局部顺延同日后续安排，保留必要硬锚点。",
        "changes": ["顺延后续节点", "保留硬锚点", "增加短缓冲"],
    },
    "other": {
        "label": "其他突发",
        "title": "其他突发情况",
        "detail": "未归类突发情况，需要 AI 根据描述局部调整。",
        "severity": "medium",
        "instruction": "出现未预见的突发情况。请根据用户描述局部调整行程，尽量保持硬锚点不变，仅改动受影响范围。",
        "changes": ["局部重排受影响节点", "保留硬锚点", "更新风险提醒"],
    },
}


def incident_profile(kind: str) -> dict[str, str]:
    return INCIDENT_PROFILES.get(kind, INCIDENT_PROFILES["other"])


def build_adjust_instruction(kind: str, detail: str | None = None) -> str:
    profile = incident_profile(kind)
    instruction = profile["instruction"]
    if detail and detail.strip():
        return f"{instruction}\n\n用户补充：{detail.strip()}"
    return instruction
