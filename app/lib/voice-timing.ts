import voiceManifest from "./voice-manifest.json";

export function voiceDelay(text: string, enabled: boolean, minimumMs: number): number {

  const durations: Record<string, number> = voiceManifest.durations_ms;
  return enabled ? Math.max(minimumMs, (durations[text] ?? 0) + 350) : minimumMs;
}
