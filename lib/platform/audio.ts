/**
 * lib/platform/audio.ts — voice recording, bare React Native.
 *
 * Replaces `expo-audio` while keeping the call-site surface identical, so the
 * consuming screen changes only its import line. This follows the existing
 * `lib/platform/*` adapter pattern (clipboard, share, file-system, …): screens
 * never import a native library directly.
 *
 * Backed by `react-native-audio-recorder-player`.
 *
 * NOTE — recording only. The app has no audio *playback* call site (verified by
 * grep across app/, components/, hooks/, lib/, packages/). `react-native-track-player`
 * is deliberately NOT added here: an unused dependency is bloat. Add it together
 * with the playback feature that needs it.
 */
import { useRef, useSyncExternalStore } from "react";
import { PermissionsAndroid, Platform } from "react-native";
import AudioRecorderPlayer from "react-native-audio-recorder-player";

export type RecordingPreset = {
  extension: string;
  mimeType: string;
  android: { outputFormat: string; audioEncoder: string; sampleRate: number; bitRate: number };
  ios: { extension: string; audioQuality: number; sampleRate: number; bitRate: number };
};

/**
 * Presets mirror expo-audio's `RecordingPresets` shape so call sites do not
 * change. HIGH_QUALITY targets voice: 44.1 kHz mono AAC — small enough to attach
 * inline, clear enough to transcribe.
 */
export const RecordingPresets = {
  HIGH_QUALITY: {
    extension: ".m4a",
    mimeType: "audio/mp4",
    android: { outputFormat: "mpeg4", audioEncoder: "aac", sampleRate: 44100, bitRate: 128000 },
    ios: { extension: ".m4a", audioQuality: 96, sampleRate: 44100, bitRate: 128000 },
  } satisfies RecordingPreset,
  LOW_QUALITY: {
    extension: ".m4a",
    mimeType: "audio/mp4",
    android: { outputFormat: "mpeg4", audioEncoder: "aac", sampleRate: 22050, bitRate: 64000 },
    ios: { extension: ".m4a", audioQuality: 64, sampleRate: 22050, bitRate: 64000 },
  } satisfies RecordingPreset,
} as const;

export type AudioRecorderSnapshot = { isRecording: boolean; durationMillis: number };

export class AudioRecorder {
  private readonly player = new AudioRecorderPlayer();
  private readonly listeners = new Set<() => void>();
  private snapshot: AudioRecorderSnapshot = { isRecording: false, durationMillis: 0 };
  private recordedUri: string | null = null;
  private readonly preset: RecordingPreset;

  constructor(preset: RecordingPreset = RecordingPresets.HIGH_QUALITY) {
    this.preset = preset;
  }

  /** Stable across renders — safe as a `useSyncExternalStore` argument. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Returns a cached object; a fresh object each call would loop the store. */
  getSnapshot = (): AudioRecorderSnapshot => this.snapshot;

  get uri(): string | null {
    return this.recordedUri;
  }

  get isRecording(): boolean {
    return this.snapshot.isRecording;
  }

  /** The preset's container/mime, for callers that attach the file. */
  get mimeType(): string {
    return this.preset.mimeType;
  }

  private emit(next: Partial<AudioRecorderSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...next };
    for (const listener of this.listeners) listener();
  }

  /**
   * Kept for call-site parity with expo-audio. The underlying recorder needs no
   * explicit prepare step; microphone permission is the real precondition and is
   * requested by `requestRecordingPermissionsAsync()`.
   */
  async prepareToRecordAsync(): Promise<void> {
    return undefined;
  }

  async record(): Promise<void> {
    try {
      const uri = await this.player.startRecorder(undefined, undefined, true);
      this.recordedUri = typeof uri === "string" && uri.length > 0 ? uri : null;
      this.emit({ isRecording: true, durationMillis: 0 });
      this.player.addRecordBackListener((event) => {
        this.emit({ durationMillis: event.currentPosition });
      });
    } catch (error) {
      this.emit({ isRecording: false });
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      await this.player.stopRecorder();
    } finally {
      this.player.removeRecordBackListener();
      this.emit({ isRecording: false });
    }
  }
}

/** Mirrors expo-audio's hook name so the consuming screen is a one-line change. */
export function useAudioRecorder(
  preset: RecordingPreset = RecordingPresets.HIGH_QUALITY,
): AudioRecorder {
  // One instance per component lifetime: the recorder is imperative and
  // side-effecting, so it must not be recreated on every render.
  const ref = useRef<AudioRecorder | null>(null);
  if (ref.current === null) {
    ref.current = new AudioRecorder(preset);
  }
  return ref.current;
}

/** Subscribe to a recorder's state. Mirrors expo-audio's hook of the same name. */
export function useAudioRecorderState(recorder: AudioRecorder): AudioRecorderSnapshot {
  return useSyncExternalStore(recorder.subscribe, recorder.getSnapshot, recorder.getSnapshot);
}

/** Request microphone access. Mirrors expo-audio's `{ granted }` result. */
export async function requestRecordingPermissionsAsync(): Promise<{ granted: boolean }> {
  if (Platform.OS === "android") {
    try {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: "Microphone access",
          message: "AnalyzerX needs the microphone to accept voice questions.",
          buttonPositive: "Allow",
          buttonNegative: "Not now",
        },
      );
      return { granted: result === PermissionsAndroid.RESULTS.GRANTED };
    } catch {
      return { granted: false };
    }
  }

  try {
    const player = new AudioRecorderPlayer();
    const status = await player.requestRecordPermission();
    return { granted: status === "granted" };
  } catch {
    return { granted: false };
  }
}

/** Audio session mode. Kept for call-site parity; recording is enabled on start. */
export async function setAudioModeAsync(_mode: {
  playsInSilentMode?: boolean;
  allowsRecording?: boolean;
}): Promise<void> {
  return undefined;
}
