import { useRef } from "react";
import { StyleSheet, View } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";

import { SPEECH_WEB_HTML } from "../utils/speechWebHtml";

export type SpeechWebApi = {
  start: () => void;
  stop: () => void;
};

type Props = {
  onReady: (api: SpeechWebApi | null) => void;
  onMessage: (event: WebViewMessageEvent) => void;
};

export function SpeechWebHost({ onReady, onMessage }: Props) {
  const webRef = useRef<WebView>(null);
  const readyRef = useRef(false);

  function inject(script: string) {
    webRef.current?.injectJavaScript(`${script}; true;`);
  }

  function handleMessage(event: WebViewMessageEvent) {
    onMessage(event);
    try {
      const payload = JSON.parse(event.nativeEvent.data) as { type: string };
      if (payload.type === "ready" && !readyRef.current) {
        readyRef.current = true;
        onReady({
          start: () => inject("window.startSpeech && window.startSpeech()"),
          stop: () => inject("window.stopSpeech && window.stopSpeech()"),
        });
      }
      if (payload.type === "unsupported") {
        onReady(null);
      }
    } catch {
      // ignore
    }
  }

  return (
    <View style={styles.host} pointerEvents="none">
      <WebView
        ref={webRef}
        originWhitelist={["*"]}
        source={{ html: SPEECH_WEB_HTML }}
        onMessage={handleMessage}
        javaScriptEnabled
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
      />
    </View>
  );
}

const styles = StyleSheet.create({
  host: { width: 1, height: 1, opacity: 0, position: "absolute", left: -9999, top: -9999 },
});
