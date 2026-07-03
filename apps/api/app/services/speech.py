from __future__ import annotations

import asyncio
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
        if self.settings.speech_provider == "baidu":
            return bool(self.settings.baidu_asr_api_key and self.settings.baidu_asr_secret_key)
        if self.settings.speech_provider == "dashscope":
            return bool(self.settings.dashscope_api_key)
        return bool(
            (self.settings.baidu_asr_api_key and self.settings.baidu_asr_secret_key)
            or self.settings.dashscope_api_key
        )

    async def transcribe(self, file_bytes: bytes, filename: str) -> str:
        if not self.configured:
            raise RuntimeError(
                "语音识别未配置。请在 .env 中设置 BAIDU_ASR_API_KEY / BAIDU_ASR_SECRET_KEY，"
                "或 DASHSCOPE_API_KEY。"
            )
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

    def _transcribe_sync(self, file_path: str, suffix: str) -> str:
        provider = self.settings.speech_provider.lower()
        errors: list[str] = []

        if provider == "baidu":
            return self._transcribe_baidu(file_path, suffix)

        if provider == "dashscope":
            return self._transcribe_dashscope(file_path, suffix)

        if self.settings.baidu_asr_api_key and self.settings.baidu_asr_secret_key:
            try:
                return self._transcribe_baidu(file_path, suffix)
            except Exception as error:
                errors.append(f"百度 ASR：{error}")

        if self.settings.dashscope_api_key:
            try:
                return self._transcribe_dashscope(file_path, suffix)
            except Exception as error:
                errors.append(f"DashScope：{error}")

        raise RuntimeError(self._friendly_error("；".join(errors) or "语音识别失败"))

    def _transcribe_baidu(self, file_path: str, suffix: str) -> str:
        try:
            from aip import AipSpeech
        except ImportError as error:
            raise RuntimeError(
                f"百度 ASR SDK 加载失败：{error}。请执行：pip install baidu-aip chardet"
            ) from error

        api_key = self.settings.baidu_asr_api_key
        secret_key = self.settings.baidu_asr_secret_key
        if not api_key or not secret_key:
            raise RuntimeError("百度 ASR 未配置 API Key / Secret Key")

        app_id = self.settings.baidu_asr_app_id or "0"
        client = AipSpeech(app_id, api_key, secret_key)

        audio_format = self._baidu_audio_format(suffix)
        with open(file_path, "rb") as audio_file:
            audio_bytes = audio_file.read()

        result = client.asr(
            audio_bytes,
            audio_format,
            16000,
            {"dev_pid": 1537},
        )
        if not isinstance(result, dict):
            raise RuntimeError("百度 ASR 返回格式异常")

        err_no = result.get("err_no", -1)
        if err_no != 0:
            err_msg = result.get("err_msg") or f"识别失败（错误码 {err_no}）"
            raise RuntimeError(self._friendly_baidu_error(err_no, err_msg))

        texts = result.get("result") or []
        text = "".join(str(item) for item in texts).strip()
        if not text:
            raise RuntimeError("未识别到有效语音内容")
        return text

    @staticmethod
    def _baidu_audio_format(suffix: str) -> str:
        normalized = suffix.lower().lstrip(".")
        if normalized in {"m4a", "mp4"}:
            return "m4a"
        if normalized in {"wav", "pcm", "amr", "mp3"}:
            return normalized
        return "m4a"

    @staticmethod
    def _friendly_baidu_error(err_no: int, err_msg: str) -> str:
        if err_no in {3300, 3301, 3302, 3303, 3304, 3305}:
            return f"百度 ASR 参数错误：{err_msg}"
        if err_no in {3307, 3308}:
            return f"百度 ASR 音频格式或采样率不匹配：{err_msg}（请使用 16kHz 单声道 m4a）"
        if err_no in {3309}:
            return "百度 ASR 音频过长，请控制在 60 秒以内"
        return f"百度 ASR：{err_msg}"

    def _transcribe_dashscope(self, file_path: str, suffix: str) -> str:
        if not self.settings.dashscope_api_key:
            raise RuntimeError("DASHSCOPE_API_KEY 未配置")

        unique_name = f"{uuid.uuid4().hex}{suffix}"
        errors: list[str] = []
        oss_url: str | None = None

        try:
            oss_url = self._upload_to_dashscope(file_path, unique_name)
            return self._transcribe_paraformer(file_path, unique_name, oss_url)
        except Exception as error:
            errors.append(str(error))

        try:
            if not oss_url:
                oss_url = self._upload_to_dashscope(file_path, f"{uuid.uuid4().hex}{suffix}")
            return self._transcribe_multimodal(oss_url)
        except Exception as error:
            errors.append(str(error))

        raise RuntimeError(self._friendly_error("；".join(errors) or "语音识别失败"))

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

    @staticmethod
    def _friendly_error(message: str) -> str:
        lower = message.lower()
        if "quota exceeded" in lower or "free allocated quota" in lower:
            return (
                "阿里云 Paraformer 语音免费额度已用完。"
                "可改用百度 ASR（SPEECH_PROVIDER=baidu），或在手机端使用系统语音识别。"
            )
        return message

    def _transcribe_paraformer(self, file_path: str, filename: str, oss_url: str) -> str:
        try:
            import dashscope
            from dashscope.audio.asr import Transcription
        except ImportError as error:
            raise RuntimeError("请安装 dashscope：pip install dashscope") from error

        dashscope.api_key = self.settings.dashscope_api_key

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

        try:
            result = Transcription.wait(task, timeout=120)
            if result.status_code == 200:
                output = self._normalize_output(result.output)
                status = output.get("task_status")
                if status in {None, "SUCCEEDED"}:
                    return output
                if status == "FAILED":
                    raise RuntimeError(output.get("message") or "语音识别任务失败")
        except RuntimeError:
            raise
        except Exception:
            pass

        deadline = time.time() + 120
        last_status = "UNKNOWN"
        last_message = ""

        while time.time() < deadline:
            result = Transcription.fetch(task=task)
            if result.status_code != 200:
                raise RuntimeError(getattr(result, "message", "语音识别查询失败"))

            output = self._normalize_output(result.output)
            last_status = output.get("task_status", last_status)
            last_message = output.get("message") or last_message

            if last_status in {None, "SUCCEEDED"}:
                return output
            if last_status == "FAILED":
                raise RuntimeError(last_message or "语音识别任务失败")

            time.sleep(1.5)

        raise RuntimeError(last_message or f"语音识别超时（状态 {last_status}）")

    def _transcribe_multimodal(self, oss_url: str) -> str:
        try:
            import dashscope
            from dashscope import MultiModalConversation
        except ImportError as error:
            raise RuntimeError("请安装 dashscope：pip install dashscope") from error

        dashscope.api_key = self.settings.dashscope_api_key
        response = MultiModalConversation.call(
            model="qwen-audio-turbo",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"audio": oss_url},
                        {"text": "请准确转写这段中文语音，只输出转写文字，不要解释。"},
                    ],
                }
            ],
        )
        if response.status_code != 200:
            raise RuntimeError(getattr(response, "message", "语音转写失败"))

        text = self._extract_multimodal_text(response.output)
        if not text:
            raise RuntimeError("语音转写未返回有效文字")
        return text

    @staticmethod
    def _normalize_output(output) -> dict:
        if output is None:
            return {}
        if isinstance(output, dict):
            return output
        if hasattr(output, "__dict__"):
            return dict(output)
        return {}

    @staticmethod
    def _extract_multimodal_text(output) -> str:
        if not output:
            return ""
        if isinstance(output, str):
            return output.strip()

        choices = output.get("choices") if isinstance(output, dict) else getattr(output, "choices", None)
        if not choices:
            return ""

        message = choices[0].get("message") if isinstance(choices[0], dict) else getattr(choices[0], "message", None)
        if not message:
            return ""

        content = message.get("content") if isinstance(message, dict) else getattr(message, "content", "")
        if isinstance(content, str):
            return content.strip()
        if isinstance(content, list):
            parts: list[str] = []
            for item in content:
                if isinstance(item, dict) and item.get("text"):
                    parts.append(str(item["text"]))
                elif isinstance(item, str):
                    parts.append(item)
            return "".join(parts).strip()
        return ""


speech_service = SpeechService()
