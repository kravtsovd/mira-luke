import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { ANIMALS, COLORS, ITEMS } from "../app/lib/english-find";
import manifest from "../app/lib/voice-manifest.json";

it("ships the meadow, every sticker and device speech entry the game can ask for", () => {
  for (const name of ["meadow", ...ANIMALS, ...ITEMS.flatMap(item => COLORS.map(color => `${item}-${color}`))]) {
    expect(existsSync(join(process.cwd(), "public/images/english-farm", `${name}.svg`)), name).toBe(true);
  }
  for (const [text, path] of Object.entries(manifest.phrases as Record<string, string>)) {
    if (path.startsWith("/audio/en-jessica-v1/")) expect(existsSync(join(process.cwd(), "public", path)), text).toBe(true);
  }
});
