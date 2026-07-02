from __future__ import annotations

import json
from typing import Any, TypeVar

from pydantic import BaseModel

from app.core.config import get_settings

T = TypeVar("T", bound=BaseModel)


class LLMService:
    def __init__(self) -> None:
        self.settings = get_settings()

    @property
    def configured(self) -> bool:
        return bool(self.settings.llm_api_key)

    def _client(self):
        from openai import OpenAI

        kwargs: dict[str, Any] = {
            "api_key": self.settings.llm_api_key,
        }
        if self.settings.llm_base_url:
            kwargs["base_url"] = self.settings.llm_base_url
        return OpenAI(**kwargs)

    def structured(self, prompt: str, schema: type[T], fallback: T) -> T:
        if not self.configured:
            return fallback

        try:
            client = self._client()
            schema_json = json.dumps(schema.model_json_schema(), ensure_ascii=False)
            response = client.chat.completions.create(
                model=self.settings.llm_model,
                temperature=0.2,
                response_format={"type": "json_object"},
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "你是结构化信息抽取助手。只返回 JSON，不要 markdown。"
                            f"JSON 必须符合以下 schema：{schema_json}"
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
            )
            content = response.choices[0].message.content or "{}"
            payload = json.loads(content)
            return schema.model_validate(payload)
        except Exception:
            try:
                from langchain_openai import ChatOpenAI

                llm = ChatOpenAI(
                    model=self.settings.llm_model,
                    api_key=self.settings.llm_api_key,
                    base_url=self.settings.llm_base_url,
                    temperature=0.2,
                )
                parser = llm.with_structured_output(schema)
                result = parser.invoke(prompt)
                return result if isinstance(result, schema) else schema.model_validate(result)
            except Exception:
                return fallback

    def chat(self, messages: list[dict[str, str]], fallback: str) -> str:
        if not self.configured:
            return fallback

        try:
            client = self._client()
            response = client.chat.completions.create(
                model=self.settings.llm_model,
                temperature=0.4,
                messages=messages,
            )
            return response.choices[0].message.content or fallback
        except Exception:
            return fallback

    def summarize_json(self, data: dict[str, Any]) -> str:
        return json.dumps(data, ensure_ascii=False, indent=2)


llm_service = LLMService()
