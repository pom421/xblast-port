// Level files (.xal) of XBlast 2.10.4: INI parsing (ini_file.c) and the
// ParseLevel* functions (level.c, player.c, shrink.c, scramble.c, func.c,
// bomb.c, map.c, info.c), turned into plain data.

import {
  BMT,
  BT,
  Dir,
  GAME_TIME,
  Ill,
  MAX_BLOCK,
  MAX_PLAYER,
  MAZE_H,
  MAZE_W,
  BOMB_TIME,
  LONG_FUSE,
  SHORT_FUSE,
  NASTY_INC,
} from "./constants.ts";

export type IniSection = Map<string, string>;
export type IniFile = Map<string, IniSection>;

/** DB_Load: "[section]" lines, then "key=value" lines (key kept verbatim, value trimmed). */
export function parseIni(text: string): IniFile {
  const db: IniFile = new Map();
  let section: IniSection | undefined;
  for (const line of text.split("\n")) {
    const left = line.trimStart();
    if (left.startsWith("[")) {
      const end = left.indexOf("]");
      if (end > 0) {
        section = new Map();
        db.set(left.slice(1, end), section);
        continue;
      }
    }
    const eq = line.indexOf("=");
    if (section && eq >= 0) {
      let value = line.slice(eq + 1).trimStart();
      const eol = value.search(/[\r\n]/);
      if (eol >= 0) value = value.slice(0, eol);
      section.set(line.slice(0, eq), value.trimEnd());
    }
  }
  return db;
}

/** sscanf "%d" */
function scanInt(value: string | undefined): number | undefined {
  const match = value?.match(/^\s*([+-]?\d+)/);
  return match ? Number.parseInt(match[1]!, 10) : undefined;
}

/** sscanf "%lf" */
function scanFloat(value: string | undefined): number | undefined {
  const match = value?.match(/^\s*([+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?)/);
  return match ? Number.parseFloat(match[1]!) : undefined;
}

/** sscanf "%hd%hd" */
function scanPos(value: string | undefined): { x: number; y: number } | undefined {
  const match = value?.match(/^\s*([+-]?\d+)\s*([+-]?\d+)/);
  return match ? { x: Number.parseInt(match[1]!, 10), y: Number.parseInt(match[2]!, 10) } : undefined;
}

/**
 * DB_ConvertEntryInt / DB_ConvertEntryData: lookup in a table sorted by key,
 * giving up as soon as a greater key is met (like the C code, even for typos).
 */
function convert<T>(value: string | undefined, table: readonly (readonly [string, T])[], fallback: T): T {
  if (value === undefined) return fallback;
  for (const [key, result] of table) {
    if (key === value) return result;
    if (key > value) return fallback;
  }
  return fallback;
}

/** DB_ConvertEntryFlags: OR of the space separated words. */
function convertFlags(value: string | undefined, table: readonly (readonly [string, number])[]): number {
  if (value === undefined) return 0;
  let flags = 0;
  for (const word of value.split(/\s+/).filter(Boolean)) {
    for (const [key, result] of table) {
      if (key === word) {
        flags |= result;
        break;
      }
      if (key > word) return 0;
    }
  }
  return flags;
}

/* init flags for extras (player.c): LF_ level start, RF_ revive */
export const LF = {
  Kick: 1 << 29,
  RC: 1,
  Teleport: 4,
  Airpump: 7,
  Cloak: 10,
  Morph: 13,
  Snipe: 16,
  Frogger: 19,
  Fart: 22,
  Bfart: 25,
  Choice: 28,
  Stop: 31,
  Phantom: 34,
  Electrify: 37,
  Daleif: 40,
  Suck: 43,
  Revive: 46,
  Jump: 48,
  Reverse2: 50,
  Through: 52,
} as const;
export const RF = {
  Kick: 1 << 30,
  RC: 2,
  Teleport: 5,
  Airpump: 8,
  Cloak: 11,
  Morph: 14,
  Snipe: 17,
  Frogger: 20,
  Fart: 23,
  Bfart: 26,
  Choice: 29,
  Stop: 32,
  Phantom: 35,
  Electrify: 38,
  Daleif: 41,
  Suck: 44,
  Revive: 47,
  Jump: 49,
  Reverse2: 51,
  Through: 53,
} as const;

const healthTable = [
  ["bomb", Ill.Bomb],
  ["empty", Ill.Empty],
  ["healthy", Ill.Healthy],
  ["invisible", Ill.Invisible],
  ["malfunction", Ill.Malfunction],
  ["mini", Ill.Mini],
  ["reverse", Ill.Reverse],
  ["reverse2", Ill.Reverse2],
  ["run", Ill.Run],
  ["slow", Ill.Slow],
  ["teleport", Ill.Teleport],
] as const;

const flagNames = [
  "airpump",
  "bfarter",
  "choicebombtype",
  "cloak",
  "daleif",
  "electrify",
  "farter",
  "frogger",
  "jump",
  "kick",
  "morph",
  "none",
  "phantom",
  "rc",
  "revive",
  "snipe",
  "stop",
  "sucker",
  "teleport",
  "through",
] as const;
const flagKeys = {
  airpump: "Airpump",
  bfarter: "Bfart",
  choicebombtype: "Choice",
  cloak: "Cloak",
  daleif: "Daleif",
  electrify: "Electrify",
  farter: "Fart",
  frogger: "Frogger",
  jump: "Jump",
  kick: "Kick",
  morph: "Morph",
  phantom: "Phantom",
  rc: "RC",
  revive: "Revive",
  snipe: "Snipe",
  stop: "Stop",
  sucker: "Suck",
  teleport: "Teleport",
  through: "Through",
} as const;
const initFlagsTable = flagNames.map((n) => [n, n === "none" ? 0 : LF[flagKeys[n]]] as const);
const reviveFlagsTable = flagNames.map((n) => [n, n === "none" ? 0 : RF[flagKeys[n]]] as const);

export const shrinkTable = [
  ["circle", "circle"],
  ["compound", "compound"],
  ["compound2F", "compound2F"],
  ["compoundExtra", "compoundExtra"],
  ["compoundF", "compoundF"],
  ["compoundSolid", "compoundSolid"],
  ["constrictWave", "constrictWave"],
  ["diag", "diag"],
  ["down", "down"],
  ["downF", "downF"],
  ["earlySpiral", "earlySpiral"],
  ["horizontal", "horizontal"],
  ["istyCompound2F", "istyCompound2F"],
  ["istySpiral", "istySpiral"],
  ["lazyCompoundF", "lazyCompoundF"],
  ["move", "move"],
  ["outwardExtra", "outwardExtra"],
  ["outwardSpiral", "outwardSpiral"],
  ["quad", "quad"],
  ["savageCompound", "savageCompound"],
  ["speedSpiral", "speedSpiral"],
  ["spiral", "spiral"],
  ["spiral23", "spiral23"],
  ["spiral3", "spiral3"],
  ["spiral5", "spiral5"],
  ["spiralLego", "spiralLego"],
  ["spiralPlus", "spiralPlus"],
  ["void", "void"],
] as const;
export type ShrinkType = (typeof shrinkTable)[number][1];

export const extraNames = [
  "air",
  "bfarter",
  "choicebombtype",
  "cloak",
  "daleif",
  "electrify",
  "evilgrail",
  "farter",
  "frogger",
  "ghost",
  "holyGrail",
  "igniteAll",
  "invincible",
  "jump",
  "junkie",
  "kick",
  "life",
  "longStunned",
  "mayhem",
  "morph",
  "multiple",
  "phantom",
  "poison",
  "rc",
  "revive",
  "slow",
  "snipe",
  "specialBomb",
  "speed",
  "speed2",
  "steal",
  "stop",
  "stunOthers",
  "sucker",
  "swapcolor",
  "swapposition",
  "teleport",
  "through",
  "void",
] as const;
export type SpecialExtra = (typeof extraNames)[number];

export const keyNames = [
  "air",
  "bfarter",
  "choicebombtype",
  "cloak",
  "electrify",
  "farter",
  "frogger",
  "jump",
  "morph",
  "rc",
  "snipe",
  "specialBomb",
  "stop",
  "sucker",
  "teleport",
  "through",
  "void",
] as const;
export type SpecialKey = (typeof keyNames)[number];

export const clickNames = [
  "anticlockwise",
  "clockwise",
  "contact",
  "initial",
  "none",
  "null",
  "randomdir",
  "rebound",
  "snooker",
  "split",
  "thru",
] as const;
export type BombClick = Exclude<(typeof clickNames)[number], "null">;
const clickTable = clickNames.map((n) => [n, n === "null" ? "none" : n] as const);

const bombDirTable = [
  ["down", Dir.Down],
  ["left", Dir.Left],
  ["right", Dir.Right],
  ["up", Dir.Up],
  ["stop", Dir.Stop],
] as const;

const fuseTimeTable = [
  ["long", LONG_FUSE],
  ["short", SHORT_FUSE],
  ["normal", BOMB_TIME],
] as const;

const bombTypeTable = [
  ["blastnow", BMT.blastnow],
  ["changedirectionathalf", BMT.changedirectionathalf],
  ["close", BMT.close],
  ["column", BMT.column],
  ["comb", BMT.comb],
  ["construction", BMT.construction],
  ["default", BMT.default],
  ["destruction", BMT.destruction],
  ["diagional", BMT.diagthreebombs],
  ["distance", BMT.distance],
  ["farpyro2", BMT.farpyro],
  ["firecracker", BMT.firecracker],
  ["firecracker2", BMT.firecracker2],
  ["fungus", BMT.fungus],
  ["grenade", BMT.grenade],
  ["lucky", BMT.lucky],
  ["mine", BMT.mine],
  ["napalm", BMT.napalm],
  ["normal", BMT.normal],
  ["nuclear", BMT.nuclear],
  ["parallel", BMT.parallel],
  ["parasol", BMT.parasol],
  ["protectbombs", BMT.protectbombs],
  ["psycho", BMT.psycho],
  ["pyro", BMT.pyro],
  ["pyro2", BMT.pyro2],
  ["random", BMT.random],
  ["renovation", BMT.renovation],
  ["ringofire", BMT.ringofire],
  ["row", BMT.row],
  ["scissor", BMT.scissor],
  ["scissor2", BMT.scissor2],
  ["search", BMT.search],
  ["short", BMT.short],
  ["snipe", BMT.snipe],
  ["threebombs", BMT.threebombs],
  ["trianglebombs", BMT.trianglebombs],
] as const;

const hauntTable = [
  ["fast", 10],
  ["slow", 35],
  ["none", 0],
] as const;

export const DistribExtras = { none: 0, single: 1, all: 2, special: 3, get: 4, double: 5 } as const;
export type DistribExtras = (typeof DistribExtras)[keyof typeof DistribExtras];
const distribExtraTable = [
  ["all", DistribExtras.all],
  ["double", DistribExtras.double],
  ["get", DistribExtras.get],
  ["none", DistribExtras.none],
  ["single", DistribExtras.single],
  ["special", DistribExtras.special],
] as const;

/** One block graphic: name and optional fg/bg/add colors ("#RRGGBB"). */
export interface BlockGraphic {
  name: string;
  colors?: [string, string, string];
}

export interface ScrambleData {
  time: number;
  /** bit x of row[y] set: block (x, y) is scrambled */
  row: number[];
}

export interface Level {
  name: string;
  author: string;
  hint: string;
  gameMode: number;
  /* [player] */
  minBombs: number;
  minRange: number;
  recLives: number;
  specialBombs: number;
  reviveHealth: Ill;
  initHealth: Ill;
  initFlags: number;
  revFlags: number;
  positions: { x: number; y: number }[];
  playersAllowed: number;
  /* [shrink], [scrambleDraw], [scrambleDel] */
  shrinkType: ShrinkType;
  scrambleDraw: ScrambleData;
  scrambleDel: ScrambleData;
  /* [func] */
  specialExtra: SpecialExtra;
  specialKey: SpecialKey;
  /* [bombs] */
  bombClick: BombClick;
  wallClick: BombClick;
  playerClick: BombClick;
  initialBombDir: Dir;
  fuseTime: number;
  haunt: number;
  defaultBMT: BMT;
  specialBMT: BMT;
  evilBMT: BMT;
  nastyCeil: number;
  nextNasty: number;
  gentleNasty: number;
  rangeNasty: number;
  /* [graphics] */
  blocks: BlockGraphic[];
  /* [map] */
  distribExtras: DistribExtras;
  extraProb: { bomb: number; range: number; ill: number; invinc: number; evil: number };
  slowFlame: number;
  rows: string[];
}

export class LevelError extends Error {}

function required(section: IniSection | undefined, name: string): IniSection {
  if (!section) throw new LevelError(`section [${name}] is missing`);
  return section;
}

function parseScramble(section: IniSection | undefined): ScrambleData {
  const scramble: ScrambleData = { time: GAME_TIME + 4 + 1, row: Array.from({ length: MAZE_H }, () => 0) };
  if (!section) return scramble;
  const time = scanFloat(section.get("time"));
  if (time === undefined) return scramble;
  // C: int = double * int, truncated
  scramble.time = Math.trunc(time * GAME_TIME);
  const numBlocks = scanInt(section.get("numBlocks"));
  if (numBlocks === undefined) throw new LevelError("scramble numBlocks is missing");
  for (let i = 0; i < numBlocks; i++) {
    const pos = scanPos(section.get(`pos${String(i).padStart(3, "0")}`));
    if (!pos) throw new LevelError(`scramble pos${i} is missing`);
    if (pos.x < 0 || pos.x >= MAZE_W || pos.y < 0 || pos.y >= MAZE_H) throw new LevelError("invalid scramble pos");
    scramble.row[pos.y]! |= 1 << pos.x;
  }
  return scramble;
}

/** ParseLevel: every section of a level file, as the original parses it. */
export function parseLevel(text: string): Level {
  const db = parseIni(text);
  /* [info] */
  const info = required(db.get("info"), "info");
  const gameModeString = "R23456STDL";
  const g = info.get("gameMode");
  if (g === undefined) throw new LevelError("gameMode is missing");
  let gameMode = 0;
  for (let i = 0; i < g.length && i < gameModeString.length; i++) {
    if (g[i] === gameModeString[i]) gameMode |= 1 << i;
  }
  /* [player] */
  const player = required(db.get("player"), "player");
  const minBombs = scanInt(player.get("bombs"));
  const minRange = scanInt(player.get("range"));
  if (minBombs === undefined || minRange === undefined) throw new LevelError("player bombs/range missing");
  const positions: { x: number; y: number }[] = [];
  for (let i = 0; i < MAX_PLAYER; i++) {
    // C quirk: looks up pos(k+1), k = positions found so far
    const pos = scanPos(player.get(`pos${positions.length + 1}`));
    if (pos && pos.x > 0 && pos.y > 0 && pos.x <= MAZE_W && pos.y <= MAZE_H) positions.push(pos);
  }
  if (positions.length === 0) throw new LevelError("no player positions");
  let playersAllowed = 0;
  for (let i = 5; i > 0 && playersAllowed === 0; i--) {
    if (gameMode & (1 << i)) playersAllowed = i + 1;
  }
  if (playersAllowed === 0) throw new LevelError("no players allowed");
  /* [shrink] */
  const shrink = required(db.get("shrink"), "shrink");
  /* [func] */
  const func = required(db.get("func"), "func");
  /* [bombs] */
  const bombs = required(db.get("bombs"), "bombs");
  let nextNasty: number;
  let gentleNasty = scanInt(bombs.get("nastyGentle"));
  let rangeNasty = scanInt(bombs.get("nastyRange"));
  if (gentleNasty !== undefined && rangeNasty !== undefined) {
    let divNextNasty = scanInt(bombs.get("nextNasty"));
    if (divNextNasty === undefined || divNextNasty === 0) divNextNasty = 1;
    nextNasty = Math.trunc(NASTY_INC / divNextNasty);
    gentleNasty *= GAME_TIME;
  } else {
    nextNasty = GAME_TIME + NASTY_INC + 1;
    gentleNasty = 0;
    rangeNasty = 0;
  }
  /* [graphics] */
  const graphics = required(db.get("graphics"), "graphics");
  const blocks: BlockGraphic[] = [];
  for (let i = 0; i < MAX_BLOCK; i++) {
    const s = graphics.get(`block${String(i).padStart(2, "0")}`);
    if (s === undefined) throw new LevelError(`block${i} is missing`);
    const argv = s.split(/\s+/).filter(Boolean);
    if (argv.length === 1) blocks.push({ name: argv[0]! });
    else if (argv.length === 4) blocks.push({ name: argv[0]!, colors: [argv[1]!, argv[2]!, argv[3]!] });
    else throw new LevelError(`block${i} is invalid`);
  }
  /* [map] */
  const map = required(db.get("map"), "map");
  const prob = (name: string) => {
    const p = scanInt(map.get(name));
    return p === undefined ? 0 : Math.trunc((64 * p) / 100);
  };
  const bomb = prob("probBomb");
  const range = bomb + prob("probRange");
  const ill = range + prob("probVirus");
  const invinc = ill + prob("probSpecial");
  const evil = invinc + prob("probHidden");
  const rows: string[] = [];
  for (let y = 0; y < MAZE_H; y++) {
    const s = map.get(`row${String(y).padStart(2, "0")}`);
    if (s === undefined) throw new LevelError(`row${y} is missing`);
    for (let x = 0; x < MAZE_W; x++) {
      if (!"_BRXbrsqveV".includes(s[x] ?? "?")) throw new LevelError(`row${y} is invalid`);
    }
    rows.push(s);
  }

  return {
    name: info.get("name") ?? "",
    author: info.get("author") ?? "",
    hint: info.get("hint") ?? "",
    gameMode,
    minBombs,
    minRange,
    recLives: scanInt(player.get("recLives")) ?? 0,
    specialBombs: scanInt(player.get("specialBombs")) ?? 0,
    reviveHealth: convert(player.get("reviveVirus"), healthTable, Ill.Healthy),
    initHealth: convert(player.get("initVirus"), healthTable, Ill.Healthy),
    initFlags: convertFlags(player.get("initExtra"), initFlagsTable) >>> 0,
    revFlags: convertFlags(player.get("reviveExtra"), reviveFlagsTable) >>> 0,
    positions,
    playersAllowed,
    shrinkType: convert(shrink.get("type"), shrinkTable, "void"),
    scrambleDraw: parseScramble(db.get("scrambleDraw")),
    scrambleDel: parseScramble(db.get("scrambleDel")),
    specialExtra: convert(
      func.get("extra"),
      extraNames.map((n) => [n, n] as const),
      "void",
    ),
    specialKey: convert(
      func.get("key"),
      keyNames.map((n) => [n, n] as const),
      "void",
    ),
    bombClick: convert(bombs.get("bombClick"), clickTable, "none"),
    wallClick: convert(bombs.get("wallClick"), clickTable, "none"),
    playerClick: convert(bombs.get("playerClick"), clickTable, "none"),
    initialBombDir: convert(bombs.get("direction"), bombDirTable, Dir.Stop),
    fuseTime: convert(bombs.get("fuseTime"), fuseTimeTable, BOMB_TIME),
    haunt: convert(bombs.get("haunt"), hauntTable, 0),
    defaultBMT: convert(bombs.get("default"), bombTypeTable, BMT.normal),
    specialBMT: convert(bombs.get("special"), bombTypeTable, BMT.normal),
    evilBMT: convert(bombs.get("hidden"), bombTypeTable, BMT.normal),
    nastyCeil: scanInt(bombs.get("nastyCeil")) ?? 0,
    nextNasty,
    gentleNasty,
    rangeNasty,
    blocks,
    distribExtras: convert(map.get("extraDistribution"), distribExtraTable, DistribExtras.none),
    extraProb: { bomb, range, ill, invinc, evil },
    slowFlame: scanInt(map.get("slowFlame")) ?? 1,
    rows,
  };
}

/** Index of a tile character of the [map] rows. */
export const mapChars: Record<string, BT> = {
  _: BT.Free,
  B: BT.Block,
  R: BT.BlockRise,
  X: BT.Extra,
  b: BT.Bomb,
  r: BT.Range,
  s: BT.Sick,
  q: BT.Special,
  v: BT.Void,
  e: BT.Evil,
  V: BT.Background,
};
