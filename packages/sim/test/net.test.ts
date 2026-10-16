import { expect, test } from "vite-plus/test";
import { chooseLevel } from "../src/net.ts";

const levels = [
  { file: "Duel.xal", players: 2, gameMode: 0b0000000110 },
  { file: "Six.xal", players: 6, gameMode: 0b0000111110 },
  { file: "SixTeams.xal", players: 6, gameMode: 0b0010111110 },
];
const first = () => 0;

test("chooseLevel keeps levels for the number of players and teams", () => {
  expect(chooseLevel(levels, 4, true, first).file).toBe("SixTeams.xal");
  expect(chooseLevel(levels, 2, false, () => 0.99).file).toBe("SixTeams.xal");
  expect(chooseLevel(levels, 6, false, first).file).toBe("Six.xal");
});

test("chooseLevel falls back instead of failing when nothing matches", () => {
  // no team level: any level for 6 players
  expect(chooseLevel(levels.slice(0, 2), 6, true, first).file).toBe("Six.xal");
  // no level for 8 players: any level
  expect(chooseLevel(levels, 8, false, first).file).toBe("Duel.xal");
  expect(() => chooseLevel([], 2, false, first)).toThrow("no level available");
});
