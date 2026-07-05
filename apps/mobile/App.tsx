import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { ToastProvider } from "./src/components/ui/Toast";
import { TravelDirectorScreen } from "./src/screens/TravelDirectorScreen";

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ToastProvider>
          <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
            <StatusBar style="dark" />
            <TravelDirectorScreen />
          </SafeAreaView>
        </ToastProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
