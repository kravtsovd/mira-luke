
interface SearchResultsHandler { postMessage: (body: string) => void }

interface NativeWindow extends Window {
  webkit?: { messageHandlers?: { kidsSearchResults?: SearchResultsHandler } };
}

export function notifyNativeSearchResults(ids: string[]): void {
  if (typeof window === "undefined") return;
  const handler = (window as NativeWindow).webkit?.messageHandlers?.kidsSearchResults;
  if (!handler) return;
  try {
    handler.postMessage(JSON.stringify(ids));
  } catch {
    // A missing or rejecting bridge must never break the search UI.
  }
}
