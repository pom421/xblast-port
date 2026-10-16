import { readFileSync } from "node:fs";
import { expect, test } from "vite-plus/test";
import { Dir } from "../src/constants.ts";
import { Game, type PlayerAction } from "../src/game.ts";
import { parseLevel } from "../src/level.ts";
import { hashGame } from "../src/net.ts";

const levelsDir = new URL("../../../assets/levels/", import.meta.url);
const level = (name: string) => parseLevel(readFileSync(new URL(`${name}.xal`, levelsDir), "latin1"));
const idle: PlayerAction = { dir: Dir.Default, bomb: false, special: false };

/** Plays a whole round; bots[i] tells whether player i is a computer player. */
function play(name: string, seed: number, bots: boolean[], monkey?: (frame: number, i: number) => PlayerAction) {
  const game = new Game({ level: level(name), seed, lives: 1, players: bots.map((bot) => ({ bot })) });
  const deaths: number[] = bots.map(() => -1);
  while (!game.over) {
    game.turn();
    game.evalActions(bots.map((_, i) => monkey?.(game.gameTime, i) ?? idle));
    game.endFrame();
    game.players.forEach((p, i) => {
      if (p.lives === 0 && deaths[i] === -1) deaths[i] = game.gameTime;
    });
  }
  return { game, deaths: deaths.map((d) => (d === -1 ? game.gameTime : d)) };
}

test("bots are deterministic: same seed, same game", () => {
  const a = play("Cheese", 7, [true, true, true, true]).game;
  const b = play("Cheese", 7, [true, true, true, true]).game;
  expect(hashGame(a)).toBe(hashGame(b));
  expect(a.gameTime).toBe(b.gameTime);
});

test("bots outlive players pressing random keys", () => {
  let rnd = 12345;
  const random = () => {
    rnd = (Math.imul(rnd, 1103515245) + 12345) >>> 0;
    return (rnd >>> 16) / 65536;
  };
  const monkey = (): PlayerAction => ({
    dir: random() < 0.1 ? ((1 + Math.floor(random() * 4)) as Dir) : Dir.Default,
    bomb: random() < 0.03,
    special: false,
  });
  let bots = 0;
  let monkeys = 0;
  for (const [name, seed] of [
    ["Cheese", 1],
    ["X", 2],
    ["legoland", 3],
    ["ParadiseCity", 4],
  ] as const) {
    const { deaths } = play(name, seed, [true, false, true, false], monkey);
    bots += deaths[0]! + deaths[2]!;
    monkeys += deaths[1]! + deaths[3]!;
  }
  expect(bots).toBeGreaterThan(monkeys);
});
