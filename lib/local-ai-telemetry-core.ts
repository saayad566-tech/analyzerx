export type LocalAIInferenceSample = {
  modelId: string;
  startedAt: string;
  durationMs: number;
  tokenCount: number;
  backend: string;
  batteryLevel?: number | null;
  isCharging?: boolean | null;
  memoryBytes?: number | null;
  thermalStatus?: string | null;
  success: boolean;
  errorCode?: string;
};

export function summarizeLocalAIInference(samples: LocalAIInferenceSample[]) {
  if (!samples.length) return { sampleCount: 0, successRate: 0, averageDurationMs: 0, averageTokensPerSecond: 0, latestBatteryLevel: null as number | null, latestMemoryBytes: null as number | null, latestThermalStatus: null as string | null };
  const successful = samples.filter((sample) => sample.success);
  const latestMemoryBytes = [...samples].reverse().find((sample) => sample.memoryBytes !== null && sample.memoryBytes !== undefined)?.memoryBytes ?? null;
  const latestThermalStatus = [...samples].reverse().find((sample) => sample.thermalStatus !== null && sample.thermalStatus !== undefined)?.thermalStatus ?? null;
  const totalTokens = successful.reduce((sum, sample) => sum + sample.tokenCount, 0);
  const totalSeconds = successful.reduce((sum, sample) => sum + sample.durationMs / 1000, 0);
  return { sampleCount: samples.length, successRate: successful.length / samples.length, averageDurationMs: Math.round(samples.reduce((sum, sample) => sum + sample.durationMs, 0) / samples.length), averageTokensPerSecond: totalSeconds > 0 ? Number((totalTokens / totalSeconds).toFixed(2)) : 0, latestBatteryLevel: samples.at(-1)?.batteryLevel ?? null, latestMemoryBytes, latestThermalStatus };
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export type LocalAITelemetryRange = "all" | "today" | "7d" | "30d" | "qtd";

export function filterLocalAIInferenceSamples(samples: LocalAIInferenceSample[], range: LocalAITelemetryRange, now = new Date()): LocalAIInferenceSample[] {
  if (range === "all") return samples;
  const end = now.getTime();
  const start = new Date(now);
  if (range === "today") start.setHours(0, 0, 0, 0);
  else if (range === "7d") start.setDate(start.getDate() - 7);
  else if (range === "30d") start.setDate(start.getDate() - 30);
  else { start.setMonth(0, 1); }
  return samples.filter((sample) => { const timestamp = Date.parse(sample.startedAt); return Number.isFinite(timestamp) && timestamp >= start.getTime() && timestamp <= end; });
}

export function localAIInferenceSamplesToCsv(samples: LocalAIInferenceSample[]): string {
  const columns = ["model_id", "started_at", "duration_ms", "token_count", "backend", "battery_level", "is_charging", "memory_bytes", "thermal_status", "success", "error_code"];
  const rows = samples.map((sample) => [sample.modelId, sample.startedAt, sample.durationMs, sample.tokenCount, sample.backend, sample.batteryLevel ?? "", sample.isCharging ?? "", sample.memoryBytes ?? "", sample.thermalStatus ?? "", sample.success, sample.errorCode ?? ""].map(csvCell).join(","));
  return [columns.join(","), ...rows].join("\n") + "\n";
}
