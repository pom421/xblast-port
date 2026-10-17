// Pure simulation of XBlast 2.10.4: no DOM, no Node/Bun API, no Math.random,
// no Date.now. Every client and the server must compute exactly the same state
// from the same inputs (lockstep), so only the seeded game generator is used.

export * from "./constants.ts";
export { Game, type Explosion, type GameOptions, type Player, type PlayerAction, type PlayerSetup } from "./game.ts";
export { levelInfo, type LevelInfo } from "./info.ts";
export { LevelError, parseLevel, type BlockGraphic, type Level } from "./level.ts";
export * from "./net.ts";
export { GameRandom } from "./rng.ts";

/** Bumped whenever a change makes the simulation diverge from earlier versions. */
export const SIM_VERSION = 1;
