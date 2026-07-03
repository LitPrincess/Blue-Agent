from __future__ import annotations

import re
from datetime import date, timedelta


WEEKDAY_CN = {"一": 0, "二": 1, "三": 2, "四": 3, "五": 4, "六": 5, "日": 6, "天": 6}


def _next_weekday(reference: date, weekday: int, include_today: bool = False) -> date:
    delta = (weekday - reference.weekday()) % 7
    if delta == 0 and not include_today:
        delta = 7
    return reference + timedelta(days=delta)


def resolve_relative_dates(message: str, reference: date | None = None) -> tuple[str | None, str | None]:
    ref = reference or date.today()
    start: date | None = None

    if re.search(r"大后天", message):
        start = ref + timedelta(days=3)
    elif re.search(r"后天", message):
        start = ref + timedelta(days=2)
    elif re.search(r"明天", message):
        start = ref + timedelta(days=1)
    elif re.search(r"今天|今日", message):
        start = ref

    week_match = re.search(r"下周([一二三四五六日天])", message)
    if week_match:
        weekday = WEEKDAY_CN[week_match.group(1)]
        days_to_next_monday = (7 - ref.weekday()) % 7 or 7
        start = ref + timedelta(days=days_to_next_monday + weekday)

    this_week_match = re.search(r"(?:这|本)周([一二三四五六日天])", message)
    if this_week_match and start is None:
        weekday = WEEKDAY_CN[this_week_match.group(1)]
        start = _next_weekday(ref, weekday, include_today=True)

    if re.search(r"下周五", message):
        start = _next_weekday(ref, 4)

    iso_match = re.search(r"(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})", message)
    if iso_match:
        start = date(int(iso_match.group(1)), int(iso_match.group(2)), int(iso_match.group(3)))

    md_match = re.search(r"(\d{1,2})月(\d{1,2})日", message)
    if md_match and start is None:
        month, day = int(md_match.group(1)), int(md_match.group(2))
        year = ref.year
        candidate = date(year, month, day)
        if candidate < ref:
            candidate = date(year + 1, month, day)
        start = candidate

    duration_match = re.search(r"(\d+)\s*[天日]", message)
    end: date | None = None
    if start and duration_match:
        end = start + timedelta(days=int(duration_match.group(1)) - 1)

    return (
        start.isoformat() if start else None,
        end.isoformat() if end else None,
    )


def enrich_intent_dates(message: str, start_date: str | None, end_date: str | None) -> tuple[str | None, str | None]:
    resolved_start, resolved_end = resolve_relative_dates(message)
    final_start = start_date or resolved_start
    final_end = end_date or resolved_end
    if final_start and not final_end:
        _, inferred_end = resolve_relative_dates(message)
        final_end = inferred_end
    return final_start, final_end
