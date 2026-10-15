// Replays a golden game (recorded by the original) on the TypeScript engine
// and reports the first difference. Shared by golden.test.ts and sweep.ts.

import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { Game, type Explosion, type Player } from "../src/game.ts";
import { parseLevel } from "../src/level.ts";
import { hexFloat } from "../src/rng.ts";
import { MAZE_H, MAZE_W } from "../src/constants.ts";

export const goldenDir = new URL("golden/", import.meta.url);
export const levelsDir = new URL("../../../assets/levels/", import.meta.url);

interface Meta {
  level: string;
  seed: number;
  players: number;
  playerFields: string[];
  bombFields: string[];
}
interface Frame {
  t: number;
  rng: [number, number, string];
  actions: [number, number, number][];
  players: number[][];
  bombs: number[][];
  maze: string;
  extra: string;
  expl: number[];
}

export function readFixture(url: URL): { meta: Meta; frames: Frame[] } {
  const raw = readFileSync(url);
  const lines = (url.pathname.endsWith(".gz") ? gunzipSync(raw) : raw).toString("utf8").trim().split("\n");
  return { meta: JSON.parse(lines[0]!) as Meta, frames: lines.slice(1).map((l) => JSON.parse(l) as Frame) };
}

function bombOwner(game: Game, e: Explosion): number {
  return e.player ? game.players.indexOf(e.player) : -1;
}

/** State of the TypeScript engine in the format of the golden dumps. */
function snapshot(game: Game, meta: Meta): Omit<Frame, "actions" | "t"> {
  const players = game.players.map((p) =>
    meta.playerFields.map((f) => {
      const v = p[f as keyof Player] as number;
      return f.endsWith("_flags") ? v >>> 0 : v;
    }),
  );
  const bombs: number[][] = [];
  for (let e = game.exploList; e !== null; e = e.next) {
    bombs.push(
      meta.bombFields.map((f) => (f === "owner" ? bombOwner(game, e!) : (e![f as keyof Explosion] as number))),
    );
  }
  let maze = "";
  let extra = "";
  const expl: number[] = [];
  for (let x = 0; x < MAZE_W; x++) {
    for (let y = 0; y < MAZE_H; y++) {
      maze += String.fromCharCode(65 + game.mazeAt(x, y));
      extra += String.fromCharCode(65 + game.extraAt(x, y));
      expl.push(game.explAt(x, y));
    }
  }
  const [i97, j97, c] = game.rng.state();
  return { rng: [i97, j97, hexFloat(c)], players, bombs, maze, extra, expl };
}

/** First difference between two snapshots, as a readable path. */
function firstDiff(expected: unknown, actual: unknown, path = ""): string | null {
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) return `${path}.length: ${expected.length} != ${actual.length}`;
    for (let i = 0; i < expected.length; i++) {
      const d = firstDiff(expected[i], actual[i], `${path}[${i}]`);
      if (d) return d;
    }
    return null;
  }
  if (typeof expected === "object" && expected && typeof actual === "object" && actual) {
    for (const k of Object.keys(expected)) {
      const d = firstDiff(
        (expected as Record<string, unknown>)[k],
        (actual as Record<string, unknown>)[k],
        `${path}.${k}`,
      );
      if (d) return d;
    }
    return null;
  }
  return expected === actual ? null : `${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
}

function named(meta: Meta, diff: string): string {
  return diff
    .replace(/\.players\[(\d+)\]\[(\d+)\]/, (_, p, f) => `.players[${p}].${meta.playerFields[Number(f)]}`)
    .replace(/\.bombs\[(\d+)\]\[(\d+)\]/, (_, b, f) => `.bombs[${b}].${meta.bombFields[Number(f)]}`)
    .replace(/\.(maze|extra)\[?(\d+)?/, (m) => m);
}

/** Replays a fixture: null if identical, else "frame t: path: expected, got". */
export function replay(url: URL): string | null {
  const { meta, frames } = readFixture(url);
  const level = parseLevel(readFileSync(new URL(`${meta.level}.xal`, levelsDir), "latin1"));
  const first = frames[0]!;
  const field = (p: number, f: string) => first.players[p]![meta.playerFields.indexOf(f)]!;
  const game = new Game({
    level,
    seed: meta.seed,
    lives: field(0, "lives"),
    players: Array.from({ length: meta.players }, () => ({})),
    // not reset between levels by the original: taken from the dump
    carry: Array.from({ length: meta.players }, (_, p) => ({ farter: field(p, "farter"), smelly: field(p, "smelly") })),
  });
  for (const frame of frames) {
    if (frame.t > 0) game.turn();
    const { actions, t, ...expected } = frame;
    const diff = firstDiff(expected, snapshot(game, meta));
    if (diff) return `frame ${t}: ${named(meta, diff)}`;
    game.evalActions(actions.map(([dir, bomb, special]) => ({ dir: dir as never, bomb: !!bomb, special: !!special })));
    game.endFrame();
  }
  return game.over ? null : "game not over at the end of the fixture";
}
