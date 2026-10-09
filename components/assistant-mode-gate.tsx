import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect } from "react";

import { ensureMarketChatRuntimeMode } from "@/lib/local-preferences";

const INTRO_KEY = "analyzerx.assistant.mode-intro.v1";

/**
 * First-run policy: never block the application behind a modal.
 * Auto selects Local only when the verified native runtime is ready and otherwise
 * resolves to Connected; users can change the mode later from Local AI settings.
 */
export function AssistantModeGate() {
  useEffect(() => {
    void Promise.all([
      ensureMarketChatRuntimeMode(),
      AsyncStorage.setItem(INTRO_KEY, "seen"),
    ]);
  }, []);

  return null;
}
