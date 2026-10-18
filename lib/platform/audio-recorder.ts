/**
 * Voice recording, backed by `react-native-audio-recorder-player`.
 *
 * Replaces `expo-audio`. The surface is deliberately small and promise-based so the screen does not
 * depend on a hook shape from a particular library.
 */
import { PermissionsAndroid, Platform } from "react-native";
import AudioRecorderPlayer from "react-native-audio-recorder-player";

const player = new AudioRecorderPlayer();

export type RecordingPermission = { granted: boolean; reason?: string };

/** Request microphone access. Never throws. */
export async function requestRecordingPermission(): Promise<RecordingPermission> {
  if (Platform.OS !== "android") {
    // iOS declares the usage description in Info.plist; the recorder prompts on first use.
    return { granted: true };
  }
  try {
    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
      title: "Microphone access",
      message: "Allow microphone access to ask AnalyzerX by voice.",
      buttonPositive: "Allow",
      buttonNegative: "Not now",
    });
    return result === PermissionsAndroid.RESULTS.GRANTED
      ? { granted: true }
      : { granted: false, reason: "Microphone permission was not granted." };
  } catch (error) {
    return { granted: false, reason: error instanceof Error ? error.message : "Permission request failed." };
  }
}

let active = false;

export function isRecording(): boolean {
  return active;
}

/** Begin recording. Returns the file path the recorder is writing to. */
export async function startRecording(): Promise<string> {
  const path = await player.startRecorder();
  active = true;
  return path;
}

/** Stop and return the recorded file path, or null when nothing was recorded. */
export async function stopRecording(): Promise<string | null> {
  if (!active) return null;
  active = false;
  try {
    const path = await player.stopRecorder();
    return path ?? null;
  } catch {
    return null;
  }
}
