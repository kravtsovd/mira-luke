// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { enterImmersiveMode, usesTouchViewport } from "../app/lib/immersive";

const request = vi.fn<() => Promise<void>>();
const lock = vi.fn<() => Promise<void>>();

beforeEach(() => {
  vi.stubGlobal("navigator", { maxTouchPoints: 5 });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
  vi.stubGlobal("screen", { orientation: { lock } });
  request.mockReset().mockResolvedValue(undefined);
  lock.mockReset().mockResolvedValue(undefined);
  document.documentElement.requestFullscreen = request;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (document.documentElement as Partial<HTMLElement>).requestFullscreen;
});

it("recognizes an iPad with a fine primary pointer from its touch capability", () => {
  expect(usesTouchViewport()).toBe(true);
  enterImmersiveMode();
  expect(request).toHaveBeenCalledOnce();
});

it("does not request fullscreen on a desktop without touch", () => {
  vi.stubGlobal("navigator", { maxTouchPoints: 0 });
  enterImmersiveMode();
  expect(request).not.toHaveBeenCalled();
  expect(lock).not.toHaveBeenCalled();
});

it("accepts a secondary coarse pointer even if maxTouchPoints is absent", () => {
  vi.stubGlobal("navigator", { maxTouchPoints: 0 });
  vi.stubGlobal("matchMedia", vi.fn(query => ({ matches: query === "(any-pointer: coarse)" })));
  expect(usesTouchViewport()).toBe(true);
});

it("requests fullscreen inside the gesture and waits for entry before locking orientation", async () => {
  let finish!: () => void;
  request.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
  enterImmersiveMode();
  expect(request).toHaveBeenCalledOnce();
  expect(lock).not.toHaveBeenCalled();
  finish();
  await Promise.resolve();
  expect(lock).toHaveBeenCalledExactlyOnceWith("landscape");
});

it.each(["reject", "throw"])("preserves the viewport fallback if native fullscreen fails (%s)", async mode => {
  request.mockImplementation(() => {
    if (mode === "throw") throw new Error("Unsupported");
    return Promise.reject(new Error("Denied"));
  });
  expect(() => enterImmersiveMode()).not.toThrow();
  await Promise.resolve();
  expect(lock).not.toHaveBeenCalled();
});

it("tolerates unavailable fullscreen and orientation APIs", () => {
  delete (document.documentElement as Partial<HTMLElement>).requestFullscreen;
  vi.stubGlobal("screen", {});
  expect(() => enterImmersiveMode()).not.toThrow();
});
