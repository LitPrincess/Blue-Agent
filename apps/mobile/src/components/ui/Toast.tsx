import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";

import { BluemapTheme as theme } from "../../theme/bluemapTheme";

export type ToastKind = "info" | "success" | "error";

type ToastPayload = {
  id: number;
  message: string;
  kind: ToastKind;
};

type ToastContextValue = {
  showToast: (message: string, kind?: ToastKind) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastPayload | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idRef = useRef(0);

  const hide = useCallback(() => {
    Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
      setToast(null);
    });
  }, [opacity]);

  const showToast = useCallback(
    (message: string, kind: ToastKind = "info") => {
      if (timerRef.current) clearTimeout(timerRef.current);
      idRef.current += 1;
      setToast({ id: idRef.current, message, kind });
      opacity.setValue(0);
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      timerRef.current = setTimeout(hide, kind === "error" ? 4200 : 2800);
    },
    [hide, opacity],
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <Animated.View pointerEvents="box-none" style={[styles.host, { opacity }]}>
          <Pressable
            style={[styles.toast, toast.kind === "success" ? styles.success : null, toast.kind === "error" ? styles.error : null]}
            onPress={hide}
          >
            <Text style={styles.text}>{toast.message}</Text>
          </Pressable>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      showToast: (_message: string, _kind?: ToastKind) => undefined,
    };
  }
  return context;
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: 16,
    right: 16,
    top: 56,
    zIndex: 9999,
    alignItems: "center",
  },
  toast: {
    maxWidth: 360,
    width: "100%",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "rgba(15,27,53,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  success: {
    backgroundColor: "rgba(22,101,52,0.94)",
  },
  error: {
    backgroundColor: "rgba(153,27,27,0.94)",
  },
  text: {
    color: theme.colors.textOnPrimary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
    textAlign: "center",
  },
});
