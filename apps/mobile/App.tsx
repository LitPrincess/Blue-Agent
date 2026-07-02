import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { TravelDirectorScreen } from "./src/screens/TravelDirectorScreen";

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <StatusBar style="dark" />
        <TravelDirectorScreen />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
