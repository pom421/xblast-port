// Texts of the level intro screen, for every level, against the original
// (XBLAST_GOLDEN_INFO mode of archeology/original/golden), wording fixes apart.

import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { expect, test } from "vite-plus/test";
import { fixWording, levelInfo, type LevelInfo } from "../src/info.ts";
import { parseLevel } from "../src/level.ts";
import { levelsDir } from "./golden-lib.ts";

const expected = gunzipSync(readFileSync(new URL("level-info.jsonl.gz", import.meta.url)))
  .toString("latin1")
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line) as { file: string } & LevelInfo);

test("level info of every level is the original one", () => {
  const differences: string[] = [];
  for (const { file, ...dumped } of expected) {
    // the texts of the original, with the same wording fixes as the port
    const original = {
      player: dumped.player.map(fixWording),
      level: dumped.level.map(fixWording),
      extra: dumped.extra.map(fixWording),
    };
    const actual = levelInfo(parseLevel(readFileSync(new URL(`${file}.xal`, levelsDir)).toString("latin1")));
    if (JSON.stringify(actual) !== JSON.stringify(original)) {
      differences.push(`${file}: ${JSON.stringify(actual)} != ${JSON.stringify(original)}`);
    }
  }
  expect(differences.slice(0, 10)).toEqual([]);
  expect(expected.length).toBe(1188);
});

test("wording fixes only touch the texts they fix", () => {
  expect(fixWording("Rang extras are rare")).toBe("Range extras are rare");
  expect(fixWording("Double continous compound shrinking")).toBe("Double continuous compound shrinking");
  expect(fixWording("Spiral shrinking at half time")).toBe("Spiral shrinking at half time");
});
