const DEFAULT_TIMEOUT_MS = 30000;
export const LLM_TIMEOUT_MS = 120000;
export const SPEECH_TIMEOUT_MS = 90000;

export function getApiBaseUrl() {
  return process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
}

export function isLikelyOfflineError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("network request failed") ||
    message.includes("failed to fetch") ||
    message.includes("fetch request has been canceled") ||
    message.includes("network error") ||
    message.includes("timeout") ||
    message.includes("abort") ||
    message.includes("canceled") ||
    message.includes("cancelled")
  );
}

export function formatApiError(error: unknown, fallback = "请求失败，请稍后重试。") {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes("canceled") || message.includes("cancelled") || message.includes("abort")) {
      return "AI 方案生成耗时较长，请求已中断。请确认网络稳定并保持 App 在前台后重试。";
    }
  }
  if (isLikelyOfflineError(error)) {
    return "无法连接后端。请确认 API 已启动，且 EXPO_PUBLIC_API_BASE_URL 为手机可访问的局域网 IP。";
  }
  return error instanceof Error ? error.message : fallback;
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      if (error.name === "AbortError" || message.includes("canceled") || message.includes("cancelled")) {
        throw new Error(`请求超时（${Math.round(timeoutMs / 1000)}s），AI 生成可能仍在进行，请稍后重试。`);
      }
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
