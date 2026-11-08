import { expect, Page, test } from "@playwright/test";

// API fixtures isolate the UI contract; service and SQL tests cover persistence separately.
const id = "abcdefghijk";
const video = { id, profiles: ["mira"], libraryTicket: "test-search-ticket", title: "Library test trains", channel: "Test channel", language: "en", topicId: "vehicles", tags: ["локомотив"], durationLabel: "2:30", durationSeconds: 150, sourceUrl: `https://www.youtube.com/watch?v=${id}`, thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, publishedAt: "2026-09-01T10:00:00.000Z" };

async function search(page: Page) {
  await page.route("**/api/youtube-search?*", route => route.fulfill({ json: { items: [video] } }));
  await page.goto("/");
  const catalog = page.getByTestId("pause-catalog");
  await catalog.getByTestId("toggle-search").click();
  await catalog.getByTestId("catalog-search").fill("Library test");
  await expect(catalog.getByTestId(`library-action-${id}`)).toBeVisible();
  return { catalog, action: catalog.getByTestId(`library-action-${id}`) };
}

test("library: one click adds without playing, shows category, survives reload and searches tags", async ({ page }) => {
  let saved = false;
  let calls = 0;
  await page.route("**/api/catalog", route => route.fulfill({ json: { items: saved ? [video] : [], source: "database" } }));
  await page.route("**/api/library", async route => {
    calls++;
    expect(route.request().postDataJSON()).toEqual({ profile: "mira", videoId: id, libraryTicket: "test-search-ticket", tags: [] });
    saved = true;
    await route.fulfill({ status: 201, json: { status: "added", video } });
  });
  const { catalog, action } = await search(page);
  await action.getByRole("button", { name: "В список Mira", exact: true }).click();
  await expect(action.getByRole("status")).toHaveText("Добавлено · Mira · Машинки");
  await expect(action.getByRole("button", { name: "У Mira", exact: true })).toBeDisabled();
  expect(calls).toBe(1);
  expect(new URL(page.url()).searchParams.get("video")).toBeNull();
  await catalog.getByTestId("catalog-search").fill("локомотив");
  await expect(catalog.getByTestId(`kids-video-${id}`)).toBeVisible();
  await page.reload();
  await catalog.getByTestId("open-topic-filter").click();
  await catalog.getByTestId("kids-topic-vehicles").click();
  await expect(catalog.getByTestId(`kids-video-${id}`)).toBeVisible();
  await catalog.getByTestId("open-topic-filter").click();
  await catalog.getByTestId("kids-topic-songs").click();
  await expect(catalog.getByTestId(`kids-video-${id}`)).toHaveCount(0);
});

test("library: missing classifier key allows manual category and tags", async ({ page }) => {
  await page.route("**/api/catalog", route => route.fulfill({ json: { items: [], source: "database" } }));
  await page.route("**/api/library", async route => {
    const body = route.request().postDataJSON();
    if (!body.topicId) return route.fulfill({ status: 503, json: { code: "llm_not_configured", error: "Отсутствует ключ LLM. Выберите категорию сами.", manualAllowed: true } });
    expect(body).toEqual({ profile: "mira", videoId: id, libraryTicket: "test-search-ticket", topicId: "vehicles", tags: ["локомотив"] });
    await route.fulfill({ status: 201, json: { status: "added", video } });
  });
  const { action } = await search(page);
  await action.getByRole("button", { name: "В список Mira", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Куда добавим?" });
  await expect(sheet).toBeVisible();
  await expect(sheet).not.toContainText("ключ LLM");
  await sheet.getByText("Теги для поиска", { exact: true }).click();
  await sheet.getByLabel("Теги через запятую").fill("локомотив");
  await sheet.getByRole("button", { name: "Машинки", exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(action.getByRole("status")).toContainText("Добавлено");
});

test("library: no password, duplicate response and pending double-click protection", async ({ page }) => {
  await page.route("**/api/catalog", route => route.fulfill({ json: { items: [], source: "database" } }));
  let calls = 0;
  await page.route("**/api/library", async route => {
    expect(route.request().postDataJSON()).not.toHaveProperty("password");
    calls++;
    await new Promise(resolve => setTimeout(resolve, 500));
    await route.fulfill({ json: { status: "duplicate", video } });
  });
  const { action } = await search(page);
  await action.getByRole("button", { name: "В список Mira", exact: true }).click();
  await expect(action.getByRole("button", { name: "Добавляем", exact: true })).toBeDisabled();
  await expect(action.getByRole("status")).toContainText("Уже в списке");
  expect(calls).toBe(1);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await action.getByRole("button", { name: "Показать в меню" }).click();
  await expect(page.getByTestId("pause-catalog").getByTestId(`kids-video-${id}`)).toBeVisible();
});

test("library: optional section picker escapes the card and cancels without saving", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/library", route => { calls++; return route.fulfill({ status: 500, json: {} }); });
  const { action } = await search(page);
  await action.getByRole("button", { name: `Выбрать раздел для ${video.title}` }).click();
  const sheet = page.getByRole("dialog", { name: "Куда добавим?" });
  await expect(sheet).toBeVisible();
  const box = await sheet.boundingBox();
  expect(box!.width).toBeGreaterThan(300);
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.keyboard.press("Escape");
  await expect(sheet).not.toBeVisible();
  expect(calls).toBe(0);
});

test("library: network failure remains retryable and never shows false success", async ({ page }) => {
  await page.route("**/api/catalog", route => route.fulfill({ json: { items: [], source: "database" } }));
  await page.route("**/api/library", route => route.abort());
  const { action } = await search(page);
  await action.getByRole("button", { name: "В список Mira", exact: true }).click();
  await expect(action.getByRole("alert")).toContainText("Связь прервалась");
  await expect(action.getByRole("button", { name: "В список Mira", exact: true })).toBeEnabled();
  await expect(action.getByRole("status")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("iPad classic: library saves belong to the selected child and can be shared without duplicates", async ({ page }) => {
  let memberships: string[] = [];
  await page.route("**/api/catalog", route => route.fulfill({ json: {
    source: "database", items: memberships.length ? [{ ...video, profiles: memberships }] : [],
  } }));
  await page.route("**/api/library", async route => {
    const { profile } = route.request().postDataJSON();
    expect(["luke", "mira"]).toContain(profile);
    memberships = [...new Set([...memberships, profile])];
    await route.fulfill({ status: 201, json: { status: "added", video: { ...video, profiles: memberships } } });
  });
  const { catalog } = await search(page);
  await catalog.getByTestId("profile-luke").click();
  await catalog.getByTestId("toggle-search").click();
  await catalog.getByTestId("catalog-search").fill("Library test");
  const action = catalog.getByTestId(`library-action-${id}`);
  await action.getByRole("button", { name: "В список Luke", exact: true }).click();
  await expect(action.getByRole("button", { name: "У Luke", exact: true })).toBeDisabled();
  await page.reload();
  await expect(catalog.getByTestId(`kids-video-${id}`)).toBeVisible();
  await catalog.getByTestId("profile-mira").click();
  await expect(catalog.getByTestId(`kids-video-${id}`)).toHaveCount(0);
  await page.reload();
  await expect(catalog.getByTestId(`kids-video-${id}`)).toHaveCount(0);
  await catalog.getByTestId("toggle-search").click();
  await catalog.getByTestId("catalog-search").fill("Library test");
  await action.getByRole("button", { name: "В список Mira", exact: true }).click();
  await expect(action.getByRole("button", { name: "У Mira", exact: true })).toBeDisabled();
  await page.reload();
  await expect(catalog.getByTestId(`kids-video-${id}`)).toBeVisible();
  await catalog.getByTestId("profile-luke").click();
  await expect(catalog.getByTestId(`kids-video-${id}`)).toBeVisible();
  expect(memberships).toEqual(["luke", "mira"]);
});

test("library: changing profiles during a pending save keeps its original destination", async ({ page }) => {
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  await page.route("**/api/catalog", route => route.fulfill({ json: { items: [], source: "database" } }));
  await page.route("**/api/library", async route => {
    expect(route.request().postDataJSON().profile).toBe("mira");
    await pending;
    await route.fulfill({ status: 201, json: { status: "added", video: { ...video, profiles: ["mira"] } } });
  });
  const { catalog, action } = await search(page);
  await action.getByRole("button", { name: "В список Mira", exact: true }).click();
  await expect(action.getByRole("button", { name: "Добавляем", exact: true })).toBeDisabled();
  await catalog.getByTestId("profile-luke").click();
  const response = page.waitForResponse("**/api/library");
  finish();
  await response;
  await expect(catalog.getByTestId(`kids-video-${id}`)).toHaveCount(0);
  await catalog.getByTestId("profile-mira").click();
  await expect(catalog.getByTestId(`kids-video-${id}`)).toBeVisible();
});
