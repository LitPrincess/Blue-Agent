from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

from app.models.schemas import Itinerary


class TravelStore:
    def __init__(self, db_path: str = "travel_agent.db") -> None:
        self.db_path = db_path
        self._init()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init(self) -> None:
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS conversations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS itineraries (
                    id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    version INTEGER NOT NULL,
                    payload TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (id, version)
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS documents (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    kind TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    text TEXT NOT NULL,
                    chunks TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS records (
                    id TEXT PRIMARY KEY,
                    kind TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
                """
            )

    def add_message(self, user_id: str, role: str, content: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO conversations (user_id, role, content) VALUES (?, ?, ?)",
                (user_id, role, content),
            )

    def recent_messages(self, user_id: str, limit: int = 12) -> list[dict[str, str]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT role, content
                FROM conversations
                WHERE user_id = ?
                ORDER BY id DESC
                LIMIT ?
                """,
                (user_id, limit),
            ).fetchall()
        return [{"role": row["role"], "content": row["content"]} for row in reversed(rows)]

    def save_itinerary(self, itinerary: Itinerary) -> Itinerary:
        with self._connect() as conn:
            latest = conn.execute(
                "SELECT MAX(version) AS version FROM itineraries WHERE id = ?",
                (itinerary.id,),
            ).fetchone()
            version = (latest["version"] or 0) + 1
            itinerary.version = version
            conn.execute(
                """
                INSERT OR REPLACE INTO itineraries (id, user_id, version, payload)
                VALUES (?, ?, ?, ?)
                """,
                (itinerary.id, itinerary.user_id, itinerary.version, itinerary.model_dump_json()),
            )
        return itinerary

    def get_itinerary(self, itinerary_id: str) -> Itinerary | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT payload
                FROM itineraries
                WHERE id = ?
                ORDER BY version DESC
                LIMIT 1
                """,
                (itinerary_id,),
            ).fetchone()
        return Itinerary.model_validate_json(row["payload"]) if row else None

    def save_document(
        self,
        document_id: str,
        user_id: str,
        kind: str,
        filename: str,
        text: str,
        chunks: list[str],
    ) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO documents (id, user_id, kind, filename, text, chunks)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (document_id, user_id, kind, filename, text, json.dumps(chunks, ensure_ascii=False)),
            )

    def search_documents(self, user_id: str, query: str, limit: int = 5) -> list[dict[str, Any]]:
        terms = [term for term in query.lower().split() if len(term) > 1]
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, filename, text, chunks FROM documents WHERE user_id = ?",
                (user_id,),
            ).fetchall()

        scored: list[dict[str, Any]] = []
        for row in rows:
            chunks = json.loads(row["chunks"])
            for chunk in chunks:
                haystack = chunk.lower()
                score = sum(1 for term in terms if term in haystack)
                if score or not terms:
                    scored.append(
                        {
                            "document_id": row["id"],
                            "filename": row["filename"],
                            "text": chunk,
                            "score": score,
                        }
                    )
        return sorted(scored, key=lambda item: item["score"], reverse=True)[:limit]

    def save_record(self, kind: str, record_id: str, user_id: str, payload: str) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO records (id, kind, user_id, payload)
                VALUES (?, ?, ?, ?)
                """,
                (record_id, kind, user_id, payload),
            )

    def get_record(self, kind: str, record_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT payload FROM records WHERE kind = ? AND id = ?",
                (kind, record_id),
            ).fetchone()
        return json.loads(row["payload"]) if row else None

    def latest_records(self, kind: str, user_id: str, limit: int = 10) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT payload FROM records
                WHERE kind = ? AND user_id = ?
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (kind, user_id, limit),
            ).fetchall()
        return [json.loads(row["payload"]) for row in rows]


store = TravelStore()
