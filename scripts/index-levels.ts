// Writes assets/levels/index.json: every level the engine can load, with the
// number of players it allows. Run after changing assets/levels:
//   node scripts/index-levels.ts

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseLevel } from "../packages/sim/src/level.ts";

const dir = new URL("../assets/levels/", import.meta.url);
const levels: { file: string; name: string; players: number; gameMode: number }[] = [];
const rejected: string[] = [];
for (const file of readdirSync(dir)
  .filter((f) => f.endsWith(".xal"))
  .sort()) {
  try {
    const level = parseLevel(readFileSync(new URL(file, dir), "latin1"));
    levels.push({ file, name: level.name, players: level.playersAllowed, gameMode: level.gameMode });
  } catch (error) {
    rejected.push(`${file}: ${(error as Error).message}`);
  }
}
writeFileSync(new URL("index.json", dir), `${JSON.stringify(levels)}\n`);
console.log(`${levels.length} levels indexed, ${rejected.length} rejected`);
for (const line of rejected) console.log(`  ${line}`);
