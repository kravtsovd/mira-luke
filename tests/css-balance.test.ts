import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("stylesheets", () => {
  for (const file of readdirSync(new URL("../app/", import.meta.url)).filter(name => name.endsWith(".css"))) {
    it(`${file} closes every block it opens`, () => {
      const css = readFileSync(new URL(`../app/${file}`, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/"[^"]*"|'[^']*'/g, "\"\"");
      let depth = 0;
      for (const char of css) {
        if (char === "{") depth += 1;
        if (char === "}") depth -= 1;
        expect(depth).toBeGreaterThanOrEqual(0);
      }
      expect(depth).toBe(0);
    });
  }
});
