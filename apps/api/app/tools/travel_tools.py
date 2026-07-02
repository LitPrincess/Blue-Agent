from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class TravelTools:
    """Replace these methods with real providers as API keys become available."""

    def get_weather(self, city: str, date_range: str | None = None) -> dict[str, Any]:
        return {
            "city": city,
            "date_range": date_range,
            "condition": "多云",
            "temperature": "18-26°C",
            "rain_probability": "10%",
            "travel_advice": "适合步行游览，建议准备薄外套。",
        }

    def search_places(self, city: str, keyword: str) -> list[dict[str, Any]]:
        known = {
            "北京": [
                {"name": "故宫博物院", "area": "东城区", "category": "sight", "duration_hours": 2.5},
                {"name": "王府井烤鸭", "area": "王府井", "category": "food", "duration_hours": 1.5},
                {"name": "西单附近酒店", "area": "西单", "category": "hotel", "duration_hours": 0.5},
                {"name": "国家会议中心", "area": "奥林匹克公园", "category": "meeting", "duration_hours": 2.0},
                {"name": "胡同文化体验", "area": "什刹海", "category": "sight", "duration_hours": 1.5},
            ],
            "上海": [
                {"name": "外滩", "area": "黄浦区", "category": "sight", "duration_hours": 1.5},
                {"name": "豫园", "area": "黄浦区", "category": "sight", "duration_hours": 2.0},
            ],
        }
        places = known.get(city, [])
        if not keyword:
            return places
        return [place for place in places if keyword in place["name"] or keyword in place["area"] or keyword in place["category"]]

    def estimate_route(self, origin: str, destination: str, mode: str = "taxi") -> dict[str, Any]:
        if origin == destination:
            minutes = 0
        elif "机场" in origin or "机场" in destination:
            minutes = 135
        elif "高铁" in origin or "火车" in origin or "站" in origin:
            minutes = 260
        else:
            minutes = 20 if mode in {"walk", "metro"} else 15
        return {
            "origin": origin,
            "destination": destination,
            "mode": mode,
            "minutes": minutes,
            "distance_km": round(max(minutes / 10, 0.5), 1),
            "note": "当前为规则估算，可替换为地图路线 API。",
        }

    def check_calendar_conflicts(self, user_id: str, date_range: str | None = None) -> list[dict[str, str]]:
        return [
            {
                "title": "互联网大会",
                "time": "10:45-12:00",
                "severity": "info",
                "message": "午餐安排需要预留交通缓冲。",
            }
        ]

    def create_calendar_event(self, title: str, start_time: str, end_time: str, location: str) -> dict[str, str]:
        return {
            "status": "ready",
            "title": title,
            "start_time": start_time,
            "end_time": end_time,
            "location": location,
            "deeplink": f"calendar://new?title={title}",
        }

    def open_map_link(self, origin: str, destination: str) -> dict[str, str]:
        return {
            "provider": "amap",
            "deeplink": f"amapuri://route/plan/?sourceApplication=travel-agent&sname={origin}&dname={destination}",
        }


travel_tools = TravelTools()
