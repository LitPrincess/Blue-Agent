import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef } from "react";

const STORAGE_KEY = "travel-director/trip-state-v1";

export type PersistedTripState = {
  stage?: string;
  message?: string;
  structured?: unknown;
  documentIds?: string[];
  uploads?: unknown[];
  comparison?: unknown;
  selectedOption?: unknown;
  order?: unknown;
  itinerary?: unknown;
  syncResult?: unknown;
  guardian?: unknown;
  proposal?: unknown;
  review?: unknown;
  analysis?: unknown;
  mainTab?: number;
  savedAt?: string;
};

export async function loadPersistedTripState(): Promise<PersistedTripState | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedTripState;
  } catch {
    return null;
  }
}

export async function clearPersistedTripState() {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

export function useTripPersistence(state: PersistedTripState, enabled = true) {
  const hydratedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    hydratedRef.current = true;
  }, []);

  useEffect(() => {
    if (!enabled || !hydratedRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...state, savedAt: new Date().toISOString() }),
      );
    }, 500);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, state]);
}
