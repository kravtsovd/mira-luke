import { describe, expect, it } from "vitest";
import { VIDEOS } from "../app/data/catalog";
import { filterCatalog } from "../app/lib/catalog-search";

describe("catalog search", () => {
  it("searches titles, channels, topic copy and Russian aliases", () => {
    expect(filterCatalog(VIDEOS, "машинки").every((video) => video.topicId === "vehicles")).toBe(true);
    expect(filterCatalog(VIDEOS, "экскаватор").map((video) => video.id)).toEqual([
      "a-dv3HUjU74",
      "E2mQhr5V2xE",
      "AwQjZA-zKU0",
      "kK8ADbD7J_4",
      "rxqCPv3I0AI",
      "c_a_J80ivQA",
      "eiIzLd9ClPA",
      "kf0YK8L-sh8",
      "2rm0iOD-eAA",
    ]);
    expect(filterCatalog(VIDEOS, "Thomas Friends").map((video) => video.id)).toEqual(["H-6AX5GbAYo"]);
  });

  it("returns the original list for an empty query and no results for unknown text", () => {
    expect(filterCatalog(VIDEOS, "   ")).toEqual(VIDEOS);
    expect(filterCatalog(VIDEOS, "нет-такого-мультика")).toEqual([]);
  });

  it.each([
    ["черепашки", ["IZcTkcMhn-w", "QycdWH1E_KM"]],
    ["tmnt", ["IZcTkcMhn-w", "QycdWH1E_KM"]],
    ["teenage mutant ninja turtles", ["IZcTkcMhn-w", "QycdWH1E_KM"]],
    ["пони", ["msGMkMhYw_U", "1NRO36d_Wro", "Cl0dGQqr1J4"]],
    ["my little pony", ["msGMkMhYw_U", "1NRO36d_Wro", "Cl0dGQqr1J4"]],
  ])("finds family interests by Russian and English alias: %s", (query, expectedIds) => {
    expect(filterCatalog(VIDEOS, query).map((video) => video.id)).toEqual(expectedIds);
  });
});
