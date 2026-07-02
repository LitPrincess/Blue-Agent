from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile

from app.models.schemas import UploadKind, UploadResponse
from app.services.store import store


def chunk_text(text: str, chunk_size: int = 700, overlap: int = 100) -> list[str]:
    cleaned = " ".join(text.split())
    if not cleaned:
        return []
    chunks: list[str] = []
    start = 0
    while start < len(cleaned):
        chunks.append(cleaned[start : start + chunk_size])
        start += max(chunk_size - overlap, 1)
    return chunks


class RAGService:
    async def ingest_upload(self, user_id: str, file: UploadFile, kind: UploadKind) -> UploadResponse:
        document_id = str(uuid4())
        suffix = Path(file.filename or "upload").suffix
        target = Path("apps/api/app/uploads") / f"{document_id}{suffix}"
        content = await file.read()
        target.write_bytes(content)

        text = self.extract_text(target, kind)
        chunks = chunk_text(text)
        store.save_document(document_id, user_id, kind.value, file.filename or target.name, text, chunks)
        return UploadResponse(
            document_id=document_id,
            kind=kind,
            extracted_text=text[:1200],
            chunks=len(chunks),
        )

    def extract_text(self, path: Path, kind: UploadKind) -> str:
        if kind == UploadKind.text:
            return path.read_text(encoding="utf-8", errors="ignore")
        if kind == UploadKind.pdf:
            return self._extract_pdf(path)
        if kind == UploadKind.image:
            return self._extract_image(path)
        if kind == UploadKind.audio:
            return "音频已接收。请配置 ASR 服务或 Whisper 后启用真实转写。"
        return ""

    def retrieve(self, user_id: str, query: str) -> list[dict[str, str]]:
        return store.search_documents(user_id, query)

    def _extract_pdf(self, path: Path) -> str:
        try:
            from pypdf import PdfReader

            reader = PdfReader(str(path))
            return "\n".join(page.extract_text() or "" for page in reader.pages)
        except Exception:
            return "PDF 已上传，但文本抽取失败。可以安装 pdfplumber 或检查 PDF 是否为扫描件。"

    def _extract_image(self, path: Path) -> str:
        try:
            import pytesseract
            from PIL import Image

            return pytesseract.image_to_string(Image.open(path), lang="chi_sim+eng")
        except Exception:
            return "图片已上传。当前环境未配置 OCR，可后续接入 Tesseract、PaddleOCR 或多模态模型。"


rag_service = RAGService()
