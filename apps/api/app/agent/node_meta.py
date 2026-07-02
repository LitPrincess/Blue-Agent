from __future__ import annotations

from typing import Literal

from app.models.schemas import ItineraryItem


def node_type_for_category(category: str) -> tuple[Literal["hard_anchor", "semi_anchor", "soft_task"], bool]:
    if category in {"transport", "meeting", "hotel"}:
        return "hard_anchor", True
    if category in {"food", "sight"}:
        return "semi_anchor", True
    return "soft_task", True


def apply_node_metadata(item: ItineraryItem) -> ItineraryItem:
    node_type, editable = node_type_for_category(item.category)
    return item.model_copy(update={"node_type": node_type, "editable": editable})
