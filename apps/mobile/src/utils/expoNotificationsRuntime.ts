import { isRunningInExpoGo } from "expo";
import { Platform } from "react-native";

type NotificationsModule = typeof import("expo-notifications");

let cachedModule: NotificationsModule | null | undefined;

/** Expo Go on Android cannot load expo-notifications (remote push removed in SDK 53). */
export function isLocalNotificationsAvailable() {
  if (Platform.OS === "web") return false;
  if (Platform.OS === "android" && isRunningInExpoGo()) return false;
  return true;
}

export function expoGoNotificationsHint() {
  return "Expo Go（Android）不支持系统通知，请用 development build 或打包 APK 后再试。";
}

export function loadNotificationsModule(): NotificationsModule | null {
  if (!isLocalNotificationsAvailable()) return null;
  if (cachedModule !== undefined) return cachedModule;
  try {
    cachedModule = require("expo-notifications") as NotificationsModule;
  } catch {
    cachedModule = null;
  }
  return cachedModule;
}

export async function ensureNotificationHandler() {
  const Notifications = loadNotificationsModule();
  if (!Notifications) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}
