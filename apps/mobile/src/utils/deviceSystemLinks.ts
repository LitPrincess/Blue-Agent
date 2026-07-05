import { Linking, Platform } from "react-native";

export async function openSystemCalendarApp(at?: Date) {
  if (Platform.OS === "web") return false;
  const time = at?.getTime() ?? Date.now();
  try {
    if (Platform.OS === "ios") {
      await Linking.openURL("calshow:");
      return true;
    }
    await Linking.openURL(`content://com.android.calendar/time/${time}`);
    return true;
  } catch {
    return false;
  }
}

export async function openSystemRemindersApp() {
  if (Platform.OS !== "ios") return false;
  try {
    await Linking.openURL("x-apple-reminderkit://");
    return true;
  } catch {
    return false;
  }
}

export async function openNotificationSettings() {
  if (Platform.OS === "web") return false;
  try {
    await Linking.openSettings();
    return true;
  } catch {
    return false;
  }
}
