from __future__ import annotations

from urllib.parse import quote

from app.models.schemas import POICandidate


def build_deeplinks(
    name: str,
    city: str,
    category: str,
    *,
    checkin: str | None = None,
    checkout: str | None = None,
    lat: float | None = None,
    lng: float | None = None,
) -> dict[str, str]:
    encoded_name = quote(name)
    encoded_city = quote(city)
    encoded_keyword = quote(f"{city} {name}")

    links: dict[str, str] = {
        "amap": f"https://uri.amap.com/marker?position={lng},{lat}&name={encoded_name}" if lat and lng else "",
        "ctrip": (
            f"https://m.ctrip.com/webapp/hotel/hotellist?city={encoded_city}&keyword={encoded_name}"
            if category == "hotel"
            else f"https://m.ctrip.com/webapp/vacations/tour/list?keyword={encoded_keyword}"
        ),
        "meituan": f"imeituan://www.meituan.com/search?q={encoded_name}",
        "dianping": f"dianping://searchshoplist?keyword={encoded_name}&city={encoded_city}",
        "xiaohongshu": f"https://www.xiaohongshu.com/search_result?keyword={encoded_keyword}",
    }
    if category == "hotel" and checkin and checkout:
        links["ctrip"] = (
            f"https://m.ctrip.com/webapp/hotel/hotellist?city={encoded_city}"
            f"&checkin={checkin}&checkout={checkout}&keyword={encoded_name}"
        )
    return {key: value for key, value in links.items() if value}


def attach_platform_scores(candidate: POICandidate, keyword: str) -> POICandidate:
    base = candidate.rating or 4.2
    scores = {
        "amap": round(min(5.0, base), 1),
        "dianping": round(min(5.0, base + 0.1), 1),
        "meituan": round(min(5.0, base - 0.05), 1),
        "xiaohongshu": round(min(5.0, base + 0.15), 1) if keyword in candidate.name or keyword in candidate.tags else round(base, 1),
        "ctrip": round(min(5.0, base), 1) if candidate.category == "hotel" else round(min(5.0, base - 0.1), 1),
    }
    return candidate.model_copy(update={"platform_scores": scores})
