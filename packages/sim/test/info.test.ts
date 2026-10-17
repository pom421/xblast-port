// Texts of the level intro screen, for every level, against the original
// (XBLAST_GOLDEN_INFO mode of archeology/original/golden).

import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { expect, test } from "vite-plus/test";
import { levelInfo, type LevelInfo } from "../src/info.ts";
import { parseLevel } from "../src/level.ts";
import { levelsDir } from "./golden-lib.ts";

const expected = gunzipSync(readFileSync(new URL("level-info.jsonl.gz", import.meta.url)))
  .toString("latin1")
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line) as { file: string } & LevelInfo);

test("level info of every level is the original one", () => {
  const differences: string[] = [];
  for (const { file, ...original } of expected) {
    const actual = levelInfo(parseLevel(readFileSync(new URL(`${file}.xal`, levelsDir)).toString("latin1")));
    if (JSON.stringify(actual) !== JSON.stringify(original)) {
      differences.push(`${file}: ${JSON.stringify(actual)} != ${JSON.stringify(original)}`);
    }
  }
  expect(differences.slice(0, 10)).toEqual([]);
  expect(expected.length).toBe(1188);
});
