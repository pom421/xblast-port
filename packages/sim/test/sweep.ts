// Replays every golden game of a directory (default: original/sweep, made by
// archeology/sweep.sh) and summarises the differences with the original.
// Usage: node packages/sim/test/sweep.ts [dir]

import { readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { replay } from "./golden-lib.ts";

const dir = pathToFileURL(`${process.argv[2] ?? "original/sweep"}/`);
const files = readdirSync(dir).filter((f) => /\.jsonl(\.gz)?$/.test(f));
const failures = new Map<string, string[]>();
let ok = 0;
for (const file of files) {
  let result: string | null;
  try {
    result = replay(new URL(file, dir));
  } catch (error) {
    result = `exception: ${(error as Error).message}`;
  }
  if (result === null) {
    ok++;
    continue;
  }
  // group by the differing field, without frame and values
  const key = result
    .replace(/^frame \d+: /, "")
    .replace(/\[\d+\]/g, "[]")
    .replace(/: expected .*/, "");
  failures.set(key, [...(failures.get(key) ?? []), `${file}: ${result}`]);
}
console.log(`${ok}/${files.length} identical`);
for (const [key, list] of [...failures].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n${list.length} × ${key}`);
  for (const line of list.slice(0, 3)) console.log(`  ${line.slice(0, 200)}`);
}
