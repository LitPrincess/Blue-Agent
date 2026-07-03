export const SPEECH_WEB_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body>
<script>
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'unsupported' }));
  } else {
    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = function(event) {
      let text = '';
      let isFinal = false;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        text += event.results[i][0].transcript;
        if (event.results[i].isFinal) isFinal = true;
      }
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'result', text: text.trim(), final: isFinal }));
    };
    recognition.onerror = function(event) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: event.error || 'web-speech-error' }));
    };
    recognition.onend = function() {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'end' }));
    };
    window.startSpeech = function() {
      try { recognition.start(); } catch (e) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: String(e) }));
      }
    };
    window.stopSpeech = function() {
      try { recognition.stop(); } catch (e) {}
    };
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
  }
</script>
</body>
</html>`;
