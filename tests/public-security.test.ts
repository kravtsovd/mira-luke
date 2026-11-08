import { afterEach, expect, it, vi } from "vitest";
import { GET as search } from "../app/api/youtube-search/route";
import { GET as recommendations } from "../app/api/youtube-recommendations/route";
import { requestFamily } from "../app/lib/auth";

afterEach(() => vi.unstubAllGlobals());

it("rejects anonymous costly requests before contacting a provider", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  expect((await search(new Request("https://example.test/api/youtube-search?q=cars"))).status).toBe(401);
  expect((await recommendations(new Request("https://example.test/api/youtube-recommendations?videoId=abcdefghijk"))).status).toBe(401);
  expect(fetcher).not.toHaveBeenCalled();
});

it("never maps a guest to the demo family's database", () => {
  expect(requestFamily(new Request("https://example.test"))).toBeNull();
});
