// Golden tests: the TypeScript engine must give exactly the same game state as
// the original C code, frame by frame. Fixtures are recorded by the original
// (archeology/original/golden): seed, level, every input, every state.

import { readdirSync } from "node:fs";
import { describe, expect, test } from "vite-plus/test";
import { goldenDir, replay } from "./golden-lib.ts";

const fixtures = readdirSync(goldenDir).filter((f) => f.endsWith(".jsonl.gz"));

describe("golden games", () => {
  test.each(fixtures)("%s", (name) => {
    expect(replay(new URL(name, goldenDir))).toBeNull();
  });
});
