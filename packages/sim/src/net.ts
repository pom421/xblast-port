// Network protocol shared by the client and the server (JSON over WebSocket).
// Lockstep: clients only exchange their inputs; every client runs the same
// deterministic simulation. The server relays inputs, frame by frame, once it
// has the inputs of every player for that frame.

import { MAZE_H, MAZE_W, type Dir } from "./constants.ts";
import type { Game } from "./game.ts";

/** Inputs of one player for one frame: direction (Dir.Default: unchanged), bomb, special. */
export type NetAction = [dir: Dir, bomb: 0 | 1, special: 0 | 1];

export interface MatchConfig {
  lives: number;
  wins: number;
  /** teams of 2: players 0 & 1, 2 & 3, 4 & 5 */
  teams: boolean;
  /** computer players added after the humans */
  bots?: number;
}

export interface LobbyPlayer {
  slot: number;
  name: string;
  /** connection that controls this player (-1 for a computer player) */
  client: number;
  /** computer player: every client computes its inputs */
  bot?: boolean;
}

/* client → server */
export type ClientMessage =
  | { type: "join"; names: string[] }
  | { type: "start"; config: MatchConfig }
  | { type: "input"; round: number; frame: number; actions: NetAction[] }
  | { type: "over"; round: number; frame: number; hash: number; winnerTeam: number | null };

/* server → client */
export type ServerMessage =
  | { type: "welcome"; client: number; slots: number[] }
  | { type: "lobby"; players: LobbyPlayer[]; host: number; playing: boolean }
  | { type: "error"; message: string }
  | { type: "match"; config: MatchConfig; players: LobbyPlayer[] }
  | { type: "round"; round: number; level: string; seed: number; delay: number }
  | { type: "frame"; round: number; frame: number; actions: NetAction[] }
  | { type: "result"; round: number; victories: number[]; desync: boolean }
  | { type: "matchOver"; victories: number[] };

/** Team of a player slot: teams of 2 are slots 0 & 1, 2 & 3, 4 & 5. */
export function teamOfSlot(slot: number, config: MatchConfig): number {
  return config.teams ? Math.floor(slot / 2) : slot;
}

/** A level of assets/levels/index.json. */
export interface LevelChoice {
  file: string;
  players: number;
  gameMode: number;
}

/**
 * Random level for a match: one allowing this many players (and teams, gameMode
 * "T"). Falls back to levels for this many players, then to any level, rather
 * than failing when the filter leaves nothing.
 */
export function chooseLevel(
  levels: readonly LevelChoice[],
  players: number,
  teams: boolean,
  random: () => number,
): LevelChoice {
  const forPlayers = levels.filter((l) => l.players >= players);
  const forTeams = teams ? forPlayers.filter((l) => l.gameMode & (1 << 7)) : forPlayers;
  const candidates = [forTeams, forPlayers, levels].find((list) => list.length > 0);
  if (!candidates) throw new Error("no level available");
  return candidates[Math.floor(random() * candidates.length)]!;
}

/** Default inputs: nothing pressed. */
export const idleAction = (): NetAction => [5, 0, 0];

/**
 * FNV-1a hash of the whole game state (players, bombs, maze, generator):
 * clients compare it at the end of each round to detect a desynchronisation.
 */
export function hashGame(game: Game): number {
  let h = 0x811c9dc5;
  const mix = (v: number) => {
    h ^= v & 0xffff;
    h = Math.imul(h, 0x01000193);
    h ^= (v >>> 16) & 0xffff;
    h = Math.imul(h, 0x01000193);
  };
  mix(game.gameTime);
  for (const p of game.players) {
    for (const v of [p.x, p.y, p.lives, p.dying, p.bombs, p.range, p.illness, p.invincible, p.stunned]) mix(v);
  }
  for (let e = game.exploList; e !== null; e = e.next) {
    for (const v of [e.x, e.y, e.dx, e.dy, e.count, e.range, e.type]) mix(v);
  }
  for (let x = 0; x < MAZE_W; x++) {
    for (let y = 0; y < MAZE_H; y++) mix(game.mazeAt(x, y));
  }
  const [i97, j97] = game.rng.state();
  mix(i97);
  mix(j97);
  return h >>> 0;
}
