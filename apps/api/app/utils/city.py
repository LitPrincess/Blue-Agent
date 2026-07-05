from __future__ import annotations

import re


def resolve_search_city(destination: str | None, hint: str | None = None) -> str:
    candidates: list[str] = []

    def push(value: str | None) -> None:
        if not value:
            return
        text = value.strip()
        if not text:
            return
        for part in re.split(r"[/、,，;；|>→\-–—]+", text):
            part = part.strip()
            if part:
                candidates.append(part)

    push(hint)
    push(destination)

    if not candidates:
        return "目的地"

    def score(name: str) -> int:
        value = 0
        if re.search(r"(镇|乡|村|景区|古城|湖|岛)", name):
            value += 3
        if re.search(r"(区|县|市)", name):
            value += 1
        if 2 <= len(name) <= 8:
            value += 1
        if re.search(r"(省|自治区)", name):
            value -= 2
        return value

    ranked = sorted(candidates, key=lambda item: (score(item), len(item)), reverse=True)
    return ranked[0]
