
export function usesTouchViewport(): boolean {
  return typeof window !== "undefined" && (
    navigator.maxTouchPoints > 0 || window.matchMedia("(any-pointer: coarse)").matches
  );
}

export function enterImmersiveMode(): void {
  if (!usesTouchViewport()) return;
  const root = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
  const fullscreenDocument = document as Document & { webkitFullscreenElement?: Element };
  const request = root.requestFullscreen ?? root.webkitRequestFullscreen;
  const lockLandscape = () => {
    const orientation = window.screen?.orientation as (ScreenOrientation & { lock?: (value: string) => Promise<void> }) | undefined;
    try { void orientation?.lock?.("landscape").catch(() => {}); } catch { /* CSS follows the actual viewport if locking is unavailable. */ }
  };
  if (request && !document.fullscreenElement && !fullscreenDocument.webkitFullscreenElement) {
    try {
      // The fullscreen transition must finish before an orientation lock can succeed.
      void Promise.resolve(request.call(root)).then(lockLandscape, () => {});
    } catch { /* Older WebKit can throw synchronously; the viewport stage remains usable. */ }
  } else {
    lockLandscape();
  }
}
