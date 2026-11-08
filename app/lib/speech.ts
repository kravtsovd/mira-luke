import voiceManifest from "./voice-manifest.json";
export const SPEECH_AUDIO_PATHS: Record<string, string> = voiceManifest.phrases;
export function preloadVoices(_texts: readonly string[]): void {}
export function stopSpeaking(): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}
// Session 01a1b8ab-0ef7-7830-beb4-c23c394d03cf: device voices avoid redistributing restricted vendor recordings.
export function speakRussian(text: string, enabled: boolean): void {
  stopSpeaking();
  if (!enabled || typeof window === "undefined" || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = /[А-Яа-яЁё]/.test(text) ? "ru-RU" : "en-US";
  utterance.rate = 0.85;
  window.speechSynthesis.speak(utterance);
}
