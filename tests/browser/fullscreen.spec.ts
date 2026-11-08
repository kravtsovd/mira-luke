import { expect, test } from "@playwright/test";

const screens = [
  { name: "phone small", width: 375, height: 667 },
  { name: "phone tall", width: 390, height: 844 },
  { name: "iPad classic", width: 768, height: 1024 },
  { name: "iPad 10-11 inch", width: 820, height: 1180 },
  { name: "iPad Pro 11", width: 834, height: 1194 },
  { name: "iPad Pro 12.9", width: 1024, height: 1366 },
  { name: "iPad Pro 13", width: 1032, height: 1376 },
  { name: "iPad Pro with trackpad", width: 1024, height: 1366, trackpad: true },
];

for (const screen of screens) {
  test.describe(screen.name, () => {
    test.use({ viewport: { width: screen.width, height: screen.height }, isMobile: !screen.trackpad, hasTouch: !screen.trackpad });

    test("fills the viewport through rotation, pause and resume when native fullscreen is denied", async ({ page }, testInfo) => {

      await page.addInitScript(() => {
        Object.defineProperty(navigator, "maxTouchPoints", { get: () => 5 });
        Object.defineProperty(Element.prototype, "requestFullscreen", {
          configurable: true,
          value: () => Promise.reject(new Error("Fullscreen unavailable")),
        });
      });
      await page.goto("/");
      await page.getByTestId("pause-catalog").locator(".kids-video-card").first().click();
      const stage = page.getByTestId("player-shell");
      const iframe = page.locator('iframe[src*="youtube.com/embed/"]');
      await expect(stage).toHaveAttribute("data-video-stage", "true");
      // Geometry has to work even when the browser explicitly requires another gesture.
      // The separate cold-start playback test never accepts that fallback as one-click success.
      const blocked = page.getByText("Браузер просит нажать на видео для запуска", { exact: true });
      await expect.poll(async () =>
        await page.getByTestId("player-tap-pause").getAttribute("data-playing") === "true" || await blocked.isVisible()
      ).toBe(true);
      if (await blocked.isVisible()) {
        testInfo.annotations.push({ type: "autoplay-policy", description: "Browser explicitly blocked cold autoplay; verified the visible gesture fallback before rotation." });
        await page.getByTestId("player-tap-pause").click();
      }
      await expect(page.getByTestId("player-tap-pause")).toHaveAttribute("data-playing", "true");
      for (const viewport of [
        { width: screen.width, height: screen.height },
        { width: screen.height, height: screen.width },
        { width: screen.width, height: screen.height },
      ]) {
        if (page.viewportSize()?.width !== viewport.width) await page.setViewportSize(viewport);
        await expect.poll(async () => {
          const rect = await stage.boundingBox();
          return rect && Math.max(Math.abs(rect.x), Math.abs(rect.y), Math.abs(rect.width - viewport.width), Math.abs(rect.height - viewport.height));
        }, { timeout: 3000 }).toBeLessThan(2);
        await expect(page.locator(".site-header")).toBeHidden();
        await expect(page.getByTestId("browse-catalog")).toBeHidden();
        await expect(page.getByTestId("build-stamp")).toBeHidden();
        await expect(page.getByTestId("player-tap-pause")).toHaveAttribute("data-playing", "true");
        const rect = (await iframe.boundingBox())!;
        expect(rect.width / rect.height).toBeCloseTo(16 / 9, 2);
        if (viewport.width > viewport.height) {
          expect(rect.width).toBeGreaterThanOrEqual(viewport.width - 1);
          expect(rect.height).toBeGreaterThanOrEqual(viewport.height - 1);
        } else {
          expect(rect.width).toBeCloseTo(viewport.width, 0);
          expect(rect.height).toBeLessThan(viewport.height);
        }
        if (screen.name === "iPad Pro 13") {
          await page.screenshot({ path: testInfo.outputPath(`ipad-pro-${viewport.width > viewport.height ? "landscape" : "portrait"}.png`) });
        }
      }
      const frameHandle = await iframe.elementHandle();
      const video = page.frameLocator('iframe[src*="youtube.com/embed/"]').locator("video");
      const time = await video.evaluate((v: HTMLVideoElement) => v.currentTime);
      await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(time + 1);
      await page.getByTestId("player-tap-pause").click();
      await expect(page.getByTestId("pause-resume")).toBeVisible();
      await page.getByTestId("pause-resume").click();
      await expect(page.getByTestId("player-tap-pause")).toHaveAttribute("data-playing", "true");
      expect(await frameHandle!.evaluate(element => element.isConnected)).toBe(true);
      const rect = (await stage.boundingBox())!;
      expect(rect.width).toBeCloseTo(screen.width, 0);
      expect(rect.height).toBeCloseTo(screen.height, 0);
    });
  });
}
