from __future__ import annotations

from app.models.schemas import MultimodalInputBundle
from app.services.rag import rag_service


class MultimodalService:
    def normalize(self, user_id: str, bundle: MultimodalInputBundle) -> str:
        parts: list[str] = []
        if bundle.text:
            parts.append(bundle.text)

        for document_id in bundle.document_ids:
            matches = rag_service.retrieve(user_id, document_id)
            if matches:
                parts.append("\n".join(match["text"] for match in matches[:2]))

        if bundle.image_urls:
            parts.append(f"用户提供了 {len(bundle.image_urls)} 张图片，等待视觉模型解析。")
        if bundle.audio_urls:
            parts.append(f"用户提供了 {len(bundle.audio_urls)} 段音频，等待 ASR 转写。")

        return "\n\n".join(parts).strip()


multimodal_service = MultimodalService()
