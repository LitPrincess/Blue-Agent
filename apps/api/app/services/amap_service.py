from __future__ import annotations

import logging
from typing import Any

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)

AMAP_TYPES = {
    "food": "050000",
    "hotel": "100000",
    "sight": "110000",
}


class AmapService:
    BASE = "https://restapi.amap.com/v3"

    def __init__(self) -> None:
        self.settings = get_settings()

    @property
    def configured(self) -> bool:
        return bool(self.settings.amap_api_key)

    def search_poi(self, city: str, keywords: str, category: str = "food", limit: int = 8) -> list[dict[str, Any]]:
        if not self.configured:
            return self._fallback_poi(city, keywords, category)

        poi_type = AMAP_TYPES.get(category, "050000")
        try:
            with httpx.Client(timeout=15.0) as client:
                response = client.get(
                    f"{self.BASE}/place/text",
                    params={
                        "key": self.settings.amap_api_key,
                        "keywords": keywords,
                        "city": city,
                        "citylimit": "true",
                        "types": poi_type,
                        "offset": limit,
                        "page": 1,
                        "extensions": "all",
                    },
                )
                response.raise_for_status()
                payload = response.json()
                if payload.get("status") != "1":
                    logger.warning("Amap POI search failed: %s", payload.get("info"))
                    return self._fallback_poi(city, keywords, category)
                return payload.get("pois") or []
        except Exception as error:
            logger.warning("Amap POI search error: %s", error)
            return self._fallback_poi(city, keywords, category)

    def route_estimate(
        self,
        origin_lng: float,
        origin_lat: float,
        dest_lng: float,
        dest_lat: float,
        strategy: int = 0,
    ) -> dict[str, Any]:
        if not self.configured:
            return self._fallback_route(origin_lng, origin_lat, dest_lng, dest_lat)

        try:
            with httpx.Client(timeout=15.0) as client:
                response = client.get(
                    f"{self.BASE}/direction/driving",
                    params={
                        "key": self.settings.amap_api_key,
                        "origin": f"{origin_lng},{origin_lat}",
                        "destination": f"{dest_lng},{dest_lat}",
                        "strategy": strategy,
                        "extensions": "all",
                    },
                )
                response.raise_for_status()
                payload = response.json()
                if payload.get("status") != "1":
                    return self._fallback_route(origin_lng, origin_lat, dest_lng, dest_lat)
                route = (payload.get("route") or {}).get("paths") or []
                if not route:
                    return self._fallback_route(origin_lng, origin_lat, dest_lng, dest_lat)
                best = route[0]
                distance_m = int(best.get("distance") or 0)
                duration_s = int(best.get("duration") or 0)
                tolls = float(best.get("tolls") or 0)
                taxi_cost = float(best.get("taxi_cost") or 0)
                return {
                    "distance_km": round(distance_m / 1000, 1),
                    "duration_minutes": max(1, duration_s // 60),
                    "tolls_yuan": int(tolls),
                    "taxi_cost_yuan": int(taxi_cost) if taxi_cost else self._estimate_taxi(distance_m),
                    "source": "amap",
                }
        except Exception as error:
            logger.warning("Amap route error: %s", error)
            return self._fallback_route(origin_lng, origin_lat, dest_lng, dest_lat)

    @staticmethod
    def _estimate_taxi(distance_m: int) -> int:
        km = distance_m / 1000
        return max(15, int(13 + km * 2.5))

    @staticmethod
    def _fallback_route(origin_lng: float, origin_lat: float, dest_lng: float, dest_lat: float) -> dict[str, Any]:
        dx = abs(origin_lng - dest_lng)
        dy = abs(origin_lat - dest_lat)
        distance_km = round((dx * 85 + dy * 111), 1)
        duration_minutes = max(10, int(distance_km * 3))
        return {
            "distance_km": distance_km,
            "duration_minutes": duration_minutes,
            "tolls_yuan": 0,
            "taxi_cost_yuan": max(15, int(13 + distance_km * 2.5)),
            "source": "estimate",
        }

    @staticmethod
    def _fallback_poi(city: str, keywords: str, category: str) -> list[dict[str, Any]]:
        if category == "hotel":
            return [
                {
                    "id": "mock-hotel-1",
                    "name": f"{city}市中心精选酒店",
                    "address": f"{city}核心区",
                    "location": "116.397,39.918",
                    "biz_ext": {"rating": "4.6", "cost": "480"},
                    "type": "酒店",
                },
                {
                    "id": "mock-hotel-2",
                    "name": f"{city}景观商务酒店",
                    "address": f"{city}景区附近",
                    "location": "116.420,39.930",
                    "biz_ext": {"rating": "4.4", "cost": "360"},
                    "type": "酒店",
                },
            ]
        return [
            {
                "id": "mock-food-1",
                "name": f"{city}{keywords}人气店",
                "address": f"{city}美食街",
                "location": "116.397,39.918",
                "biz_ext": {"rating": "4.7", "cost": "120"},
                "type": "餐饮",
            },
            {
                "id": "mock-food-2",
                "name": f"{city}老字号{keywords}",
                "address": f"{city}老城区",
                "location": "116.410,39.925",
                "biz_ext": {"rating": "4.5", "cost": "95"},
                "type": "餐饮",
            },
        ]


amap_service = AmapService()
