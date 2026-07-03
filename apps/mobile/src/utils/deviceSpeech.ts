type SpeechModule = typeof import("expo-speech-recognition");

let cachedModule: SpeechModule | null | undefined;

function hasNativeSpeechModule() {
  try {
    const { requireOptionalNativeModule } = require("expo") as typeof import("expo");
    return requireOptionalNativeModule("ExpoSpeechRecognition") != null;
  } catch {
    return false;
  }
}

function loadSpeechModule(): SpeechModule | null {
  if (cachedModule !== undefined) return cachedModule;
  if (!hasNativeSpeechModule()) {
    cachedModule = null;
    return cachedModule;
  }
  try {
    cachedModule = require("expo-speech-recognition") as SpeechModule;
  } catch {
    cachedModule = null;
  }
  return cachedModule;
}

export async function isDeviceSpeechAvailable() {
  const mod = loadSpeechModule();
  if (!mod) return false;
  try {
    return mod.ExpoSpeechRecognitionModule.isRecognitionAvailable();
  } catch {
    return false;
  }
}

export async function requestDeviceSpeechPermissions() {
  const mod = loadSpeechModule();
  if (!mod) return false;
  const result = await mod.ExpoSpeechRecognitionModule.requestPermissionsAsync();
  return result.granted;
}

export function startDeviceSpeech(
  onPartial: (text: string) => void,
  onError: (message: string) => void,
) {
  const mod = loadSpeechModule();
  if (!mod) {
    onError("当前环境不支持系统语音识别");
    return null;
  }

  const { ExpoSpeechRecognitionModule } = mod;

  const resultListener = ExpoSpeechRecognitionModule.addListener("result", (event) => {
    const text = event.results.map((item) => item.transcript).join("").trim();
    if (text) onPartial(text);
  });

  const errorListener = ExpoSpeechRecognitionModule.addListener("error", (event) => {
    onError(event.message || "系统语音识别失败");
  });

  ExpoSpeechRecognitionModule.start({
    lang: "zh-CN",
    interimResults: true,
    continuous: false,
    requiresOnDeviceRecognition: false,
  });

  return () => {
    resultListener.remove();
    errorListener.remove();
    ExpoSpeechRecognitionModule.stop();
  };
}

export function normalizeSpeechError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("quota exceeded") || lower.includes("free allocated quota")) {
    return "阿里云语音免费额度已用完。请确认已配置百度 ASR，或改用文字输入。";
  }
  if (lower.includes("not-allowed") || lower.includes("permission")) {
    return "未获得麦克风或语音识别权限，请在系统设置中开启。";
  }
  return message;
}
