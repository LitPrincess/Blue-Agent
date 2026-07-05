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

    if lat and lng:
        amap_link = (
            f"androidamap://viewMap?sourceApplication=BlueMap&poiname={encoded_name}"
            f"&lat={lat}&lon={lng}&dev=0"
        )
    else:
        amap_link = f"androidamap://poi?sourceApplication=BlueMap&keywords={encoded_keyword}&dev=0"

    hotel_h5 = f"https://m.ctrip.com/webapp/hotel/hotellist?city={encoded_city}&keyword={encoded_name}"
    if category == "hotel" and checkin and checkout:
        hotel_h5 = (
            f"https://m.ctrip.com/webapp/hotel/hotellist?city={encoded_city}"
            f"&checkin={checkin}&checkout={checkout}&keyword={encoded_name}"
        )
    tour_h5 = f"https://m.ctrip.com/webapp/vacations/tour/list?keyword={encoded_keyword}"
    ctrip_h5 = hotel_h5 if category == "hotel" else tour_h5

    meituan_link = (
        f"imeituan://www.meituan.com/hotel/search?q={encoded_keyword}"
        if category == "hotel"
        else f"imeituan://www.meituan.com/search?q={encoded_keyword}"
    )

    links: dict[str, str] = {
        "amap": amap_link,
        "ctrip": f"ctrip://wireless/h5?url={quote(ctrip_h5)}&type=2",
        "meituan": meituan_link,
        "dianping": f"dianping://searchshoplist?keyword={encoded_keyword}&city={encoded_city}",
        "xiaohongshu": f"xhsdiscover://search/result?keyword={encoded_keyword}",
    }
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
