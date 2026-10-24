import type { Recognition } from "./recognition.ts";
import { INCANTATIONS } from "./commands.ts";

type NativeConstructor = {
  new (): Recognition;
  available?: (options: { langs: string[]; processLocally: boolean }) => Promise<string>;
};

export function speechEnvironment() {
  const browser = typeof window === "undefined" ? {} : window as unknown as {
    SpeechRecognition?: NativeConstructor;
    webkitSpeechRecognition?: NativeConstructor;
    SpeechRecognitionPhrase?: new (phrase: string, boost: number) => unknown;
  };
  const Native = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
  return {
    factory: Native ? () => new Native() : null,
    localAvailable: Native?.available ? async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        // Never wait for a model download or hung availability check before playing.
        return await Promise.race([
          Native.available!({ langs: ["en-US"], processLocally: true }).then((status) => status === "available"),
          new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), 250); }),
        ]);
      } catch { return false; }
      finally { if (timer !== undefined) clearTimeout(timer); }
    } : async () => false,
    hints: () => browser.SpeechRecognitionPhrase
      ? Object.keys(INCANTATIONS).map((word) => new browser.SpeechRecognitionPhrase!(word, 8)) : [],
  };
}

let permissionRequest: Promise<void> | null = null;

/** Coalesce Strict Mode mounts. Permission-only tracks are always released. */
export function prepareMicrophone(): Promise<void> {
  if (permissionRequest) return permissionRequest;
  if (!navigator.mediaDevices?.getUserMedia) return Promise.reject(new Error("Microphone access requires localhost or HTTPS."));
  permissionRequest = navigator.mediaDevices.getUserMedia({ audio: {
    echoCancellation: true, noiseSuppression: true, autoGainControl: true,
  }, video: false }).then((stream) => { stream.getTracks().forEach((track) => track.stop()); })
    .finally(() => { permissionRequest = null; });
  return permissionRequest;
}
