from __future__ import annotations

import asyncio
import base64
import mimetypes
import tempfile
import time
import uuid
from pathlib import Path

import httpx

from app.core.config import get_settings


class SpeechService:
    MIN_AUDIO_BYTES = 1024

    def __init__(self) -> None:
        self.settings = get_settings()

    @property
    def configured(self) -> bool:
        return bool(self.settings.dashscope_api_key)

    async def transcribe(self, file_bytes: bytes, filename: str) -> str:
        if not self.configured:
            raise RuntimeError("DASHSCOPE_API_KEY 未配置，无法使用语音识别")
        if len(file_bytes) < self.MIN_AUDIO_BYTES:
            raise RuntimeError("录音太短，请按住麦克风多说几秒")

        suffix = Path(filename).suffix or ".m4a"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temp_file:
            temp_file.write(file_bytes)
            temp_path = temp_file.name

        try:
            return await asyncio.to_thread(self._transcribe_sync, temp_path, suffix)
        finally:
            Path(temp_path).unlink(missing_ok=True)

    def _upload_to_dashscope(self, file_path: str, filename: str) -> str:
        api_key = self.settings.dashscope_api_key
        assert api_key

        with httpx.Client(timeout=60.0) as client:
            policy_resp = client.get(
                "https://dashscope.aliyuncs.com/api/v1/uploads",
                headers={"Authorization": f"Bearer {api_key}"},
                params={"action": "getPolicy", "model": "paraformer-v2"},
            )
            policy_resp.raise_for_status()
            policy = policy_resp.json()["data"]

            key = f"{policy['upload_dir']}/{filename}"
            mime_type = mimetypes.guess_type(filename)[0] or "audio/m4a"
            with open(file_path, "rb") as audio_file:
                upload_resp = client.post(
                    policy["upload_host"],
                    data={
                        "OSSAccessKeyId": policy["oss_access_key_id"],
                        "Signature": policy["signature"],
                        "policy": policy["policy"],
                        "x-oss-object-acl": policy["x_oss_object_acl"],
                        "x-oss-forbid-overwrite": policy["x_oss_forbid_overwrite"],
                        "key": key,
                        "success_action_status": "200",
                    },
                    files={"file": (filename, audio_file, mime_type)},
                )
            upload_resp.raise_for_status()
            return f"oss://{key}"

    def _transcribe_sync(self, file_path: str, suffix: str) -> str:
        unique_name = f"{uuid.uuid4().hex}{suffix}"
        errors: list[str] = []

        try:
            return self._transcribe_paraformer(file_path, unique_name)
        except Exception as error:
            errors.append(str(error))

        try:
            return self._transcribe_qwen_audio(file_path, suffix)
        except Exception as error:
            errors.append(str(error))

        raise RuntimeError("；".join(errors) or "语音识别失败")

    def _transcribe_paraformer(self, file_path: str, filename: str) -> str:
        try:
            import dashscope
            from dashscope.audio.asr import Transcription
        except ImportError as error:
            raise RuntimeError("请安装 dashscope：pip install dashscope") from error

        dashscope.api_key = self.settings.dashscope_api_key
        oss_url = self._upload_to_dashscope(file_path, filename)

        task = Transcription.async_call(
            model="paraformer-v2",
            file_urls=[oss_url],
            language_hints=["zh", "en"],
        )
        if task.status_code != 200:
            raise RuntimeError(getattr(task, "message", "语音识别任务提交失败"))

        output = self._wait_transcription(task)
        transcripts: list[str] = []
        for item in output.get("results", []):
            transcription_url = item.get("transcription_url")
            if not transcription_url:
                continue
            response = httpx.get(transcription_url, timeout=30.0)
            response.raise_for_status()
            payload = response.json()
            for row in payload.get("transcripts", []):
                text = row.get("text", "").strip()
                if text:
                    transcripts.append(text)

        text = "".join(transcripts).strip()
        if not text:
            raise RuntimeError("未识别到有效语音内容")
        return text

    def _wait_transcription(self, task) -> dict:
        from dashscope.audio.asr import Transcription

        task_id = None
        if task.output:
            task_id = getattr(task.output, "task_id", None)
            if task_id is None and isinstance(task.output, dict):
                task_id = task.output.get("task_id")

        deadline = time.time() + 120
        last_status = "UNKNOWN"
        last_message = ""

        while time.time() < deadline:
            result = Transcription.fetch(task=task_id) if task_id else Transcription.wait(task, timeout=5)
            if result.status_code != 200:
                raise RuntimeError(getattr(result, "message", "语音识别查询失败"))

            output = result.output or {}
            if not isinstance(output, dict):
                output = dict(output) if output else {}

            last_status = output.get("task_status", last_status)
            last_message = output.get("message") or last_message

            if last_status in {None, "SUCCEEDED"}:
                return output
            if last_status == "FAILED":
                raise RuntimeError(last_message or "语音识别任务失败")

            time.sleep(1.5)

        raise RuntimeError(last_message or f"语音识别超时（状态 {last_status}）")

    def _transcribe_qwen_audio(self, file_path: str, suffix: str) -> str:
        from openai import OpenAI

        audio_format = suffix.lstrip(".") or "m4a"
        with open(file_path, "rb") as audio_file:
            encoded = base64.b64encode(audio_file.read()).decode("ascii")

        client = OpenAI(
            api_key=self.settings.dashscope_api_key,
            base_url=self.settings.dashscope_base_url,
        )
        response = client.chat.completions.create(
            model="qwen-audio-turbo",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "请准确转写这段中文语音，只输出转写文字，不要解释。"},
                        {"type": "input_audio", "input_audio": {"data": encoded, "format": audio_format}},
                    ],
                }
            ],
        )
        text = (response.choices[0].message.content or "").strip()
        if not text:
            raise RuntimeError("qwen-audio 未识别到有效语音内容")
        return text


speech_service = SpeechService()
