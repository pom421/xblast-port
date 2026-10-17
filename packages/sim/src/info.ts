// Texts of the level intro screen (info.c): player, level and extra info, as
// ConfigLevel adds them (player.c, shrink.c, func.c, bomb.c, map.c), 7 lines
// at most per box.

import { BMT, BT, Dir, LONG_FUSE, SHORT_FUSE } from "./constants.ts";
import { LF, RF, type BlockGraphic, type Level } from "./level.ts";

const MAX_INFO = 7;

/**
 * Wording fixes over the texts of the original (typos, "(rephrase)"
 * placeholders), applied to every line. The tables below stay verbatim
 * transcriptions: the golden test applies these same fixes to the texts
 * dumped from the original, so anything else still has to match exactly.
 */
export const wordingFixes: [original: string, fixed: string][] = [
  ["Rang extras", "Range extras"],
  ["continous", "continuous"],
  ["three quarter of time", "three quarters of time"],
  ["3 level wave shrink at", "3 level wave shrinking at"],
  ["Early Horizontal shrink ", "Early horizontal shrinking"],
  ["Cirlcle shrink (rephrase)", "Early circle shrinking"],
  ["Moving shrink (rephrase)", "Moving shrinking"],
  ["Isty spiral 3 (rephrase)", "Early 3 level spiral shrinking"],
  ["Isty compound 2F (rephrase)", "4 level compound shrinking at half time"],
  ["Diagonal shrink (rephrase)", "Diagonal shrinking"],
  ["Outward compound extra (rephrase)", "Outward compound shrinking with blastables"],
  ["Spiral5 (rephrase)", "5 level spiral shrinking at quarter time"],
  ["randomly of walls", "randomly off walls"],
  ["split with contact off Bombs", "split on contact with others"],
  ["split with contact off Walls", "split on contact with walls"],
  ["split with contact off players", "split on contact with players"],
  ["Revive control as an extra", "Revive as an extra"],
];

export function fixWording(text: string): string {
  for (const [original, fixed] of wordingFixes) text = text.replace(original, fixed);
  return text;
}

export interface LevelInfo {
  player: string[];
  level: string[];
  extra: string[];
}

/** by health (Ill) */
const permHealthInfo: (string | null)[] = [
  null,
  "Permanent random bombing",
  "Permanent slowdown",
  "Permanent running",
  "Permanent mini bombs",
  "No bomb while healthy",
  "Permanent invisibility",
  "Permanent malfunctions",
  "Permanent reverse controls",
  "Permanent reverse(2) controls",
  "Permanent random teleporting",
];
const initHealthInfo: (string | null)[] = [
  null,
  "Initial random bombing",
  "Initial slowdown",
  "Initial running",
  "Initial mini bombs",
  "No bomb while healthy",
  "Initial invisibility",
  "Initial malfunctions",
  "Initial reverse controls",
  "Initial reverse(2) controls",
  "Initial random teleporting",
];
const reviveHealthInfo: (string | null)[] = [
  null,
  "Revived with random bombing",
  "Revived with slowdown",
  "Revived with running",
  "Revived with mini bombs",
  "Revived with bombs while healthy",
  "Revived with invisibility",
  "Revived with malfunctions",
  "Revived with reverse controls",
  "Revived with reverse(2) controls",
  "Revived with random teleporting",
];

/** extras given at start or on revival: [init flag, revive flag, default, initial, revived] */
const flagInfo: [number, number, string, string, string][] = [
  [LF.Daleif, RF.Daleif, "Daleif as default", "Initial Daleif", "Revived with Daleif"],
  [LF.RC, RF.RC, "Remote control as default", "Initial remote control", "Revived with remote control"],
  [LF.Jump, RF.Jump, "Jump as default", "Initial Jump", "Revived with Jump"],
  [LF.Airpump, RF.Airpump, "Airpump as default", "Initial airpump", "Revived with airpump"],
  [LF.Cloak, RF.Cloak, "Cloak as default", "Initial cloak", "Revived with cloak"],
  [LF.Kick, RF.Kick, "Initial kick", "Initial kick", "Revived with kick"],
  [LF.Morph, RF.Morph, "Morphing as default", "Initial morphing", "Revived with morphing"],
  [LF.Through, RF.Through, "Throughing as default", "Initial throughing", "Revived with throughing"],
  [LF.Suck, RF.Suck, "Sucker as default", "Initial sucker", "Revived with sucker"],
];

const shrinkName: Partial<Record<Level["shrinkType"], string>> = {
  spiral: "Spiral shrinking at half time",
  speedSpiral: "Fast spiral shrinking at half time",
  spiralPlus: "Spiral shrinking at half time",
  spiral3: "3 level spiral shrinking at half time",
  spiral23: "Fast spiral shrinking at half time",
  spiralLego: "1 level spiral shrinking at three quarter of time",
  earlySpiral: "Spiral shrinking just before half time",
  compound: "Continuous compound shrinking",
  compoundF: "Continuous compound shrinking",
  compound2F: "2 level compound shrinking",
  lazyCompoundF: "Lazy compound shrinking",
  compoundSolid: "Continuous compound shrinking",
  savageCompound: "Double continous compound shrinking",
  compoundExtra: "Compound shrinking with blastables",
  down: "Continuous downward shrinking",
  downF: "Continuous downward shrinking",
  quad: "Quad shrinking at half time",
  constrictWave: "3 level wave shrink at half time",
  outwardSpiral: "Anticlockwise outward spiralling shrink",
  horizontal: "Early Horizontal shrink ",
  circle: "Cirlcle shrink (rephrase)",
  move: "Moving shrink (rephrase)",
  istySpiral: "Isty spiral 3 (rephrase)",
  istyCompound2F: "Isty compound 2F (rephrase)",
  diag: "Diagonal shrink (rephrase)",
  outwardExtra: "Outward compound extra (rephrase)",
  spiral5: "Spiral5 (rephrase)",
};

const extraInfo: Partial<Record<Level["specialExtra"], string>> = {
  air: "Airpump as an extra",
  bfarter: "Bfarter as an extra",
  choicebombtype: "Choice as an extra",
  cloak: "Cloak as an extra",
  daleif: "Daleif as an extra",
  electrify: "Electrify as an extra",
  farter: "Farter as an extra",
  frogger: "Frogger as an extra",
  ghost: "Ghost as an extra",
  holyGrail: "The Holy Grail as an extra",
  igniteAll: "Button as an extra",
  invincible: "Invincibility as an extra",
  jump: "Jump as an extra",
  junkie: "Junkie virus as an extra",
  kick: "Kick as an extra",
  life: "Free life as an extra",
  longStunned: "Spinner as an extra",
  mayhem: "Mayhem (Kick & Run) as an extra",
  morph: "Morphing as an extra",
  multiple: "Random special extra",
  phantom: "Phantom as an extra",
  poison: "Poison as an extra",
  rc: "Remote control as an extra",
  revive: "Revive control as an extra",
  snipe: "Snipe as an extra",
  stop: "Stop as an extra",
  sucker: "Sucker as an extra",
  swapcolor: "Swapcolor as an extra",
  swapposition: "Swapposition as an extra",
  slow: "Slowdown as an extra",
  speed: "Speed as an extra",
  speed2: "SpeedII as an extra",
  stunOthers: "Stunner as an extra",
  teleport: "Teleporter as an extra",
  through: "Through as an extra",
};

/** bombName (bomb.c), by bomb type */
const bombName: (string | null)[] = [
  null,
  "Napalm bomb",
  "Instant bomb",
  null,
  "Firecracker",
  null,
  "Construction bomb",
  "Three bomb",
  "Grenade",
  "Triangle bomb",
  "Destruction bomb",
  "Fungus bomb",
  "Renovation bomb",
  "Pyro bomb",
  null,
  "Random bomb",
  "Fast bomb",
  "Diagonal bomb",
  "Scissor bomb >",
  "Scissor bomb <",
  "Parallel bomb",
  "Distance bomb",
  "Lucky bomb",
  "Parasol bomb",
  "Combo bomb",
  "Farpyro bomb",
  "Nuclear bomb",
  "Protection bomb",
  "Ring of Fire",
  "Mine",
  "Row",
  "Column",
  "Psycho",
];

const bombDirInfo: Partial<Record<Dir, string>> = {
  [Dir.Up]: "Bombs are going up",
  [Dir.Left]: "Bombs are going left",
  [Dir.Down]: "Bombs are falling down",
  [Dir.Right]: "Bombs are going right",
};

const bombClickInfo: Partial<Record<Level["bombClick"], string>> = {
  rebound: "Bombs rebound from others",
  contact: "Bombs explode on contact with others",
  clockwise: "Bombs turn clockwise on hitting others",
  anticlockwise: "Bombs turn anticlockwise on hitting others",
  randomdir: "Bombs bounce off randomly from others",
  snooker: "Bombs are snooker bombs",
  split: "Bombs split with contact off Bombs",
};
const wallClickInfo: Partial<Record<Level["wallClick"], string>> = {
  rebound: "Bombs rebound off walls",
  contact: "Bombs explode on contact with walls",
  clockwise: "Bombs turn clockwise on hitting walls",
  anticlockwise: "Bombs turn anticlockwise on hitting walls",
  randomdir: "Bombs bounce off randomly of walls",
  split: "Bombs split with contact off Walls",
};
const playerClickInfo: Partial<Record<Level["playerClick"], string>> = {
  thru: "Bombs stun players running through",
  contact: "Bombs explode on contact with players",
  rebound: "Bombs rebound off players",
  split: "Bombs split with contact off players",
};

/** ExtraProbString (map.c) */
function extraProbString(val: number): string | null {
  if (val <= 0) return null;
  if (val <= 4) return "scarce";
  if (val <= 8) return "rare";
  if (val <= 16) return "uncommon";
  if (val <= 32) return "common";
  return "plentiful";
}

/** StringToColor (color.c): 5 bits per channel, or -1 (COLOR_INVALID) */
function color(hex: string | undefined): number {
  const match = hex?.match(/^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})/);
  if (!match) return -1;
  const [r, g, b] = match.slice(1).map((c) => Number.parseInt(c, 16) >> 3) as [number, number, number];
  return (r << 10) | (g << 5) | b;
}

/** CompareTile (map.c) */
function sameTile(a: BlockGraphic, b: BlockGraphic): boolean {
  return a.name === b.name && [0, 1, 2].every((i) => color(a.colors?.[i]) === color(b.colors?.[i]));
}

export function levelInfo(level: Level): LevelInfo {
  const info: LevelInfo = { player: [], level: [], extra: [] };
  const add = (box: keyof LevelInfo, text: string | null | undefined) => {
    if (text && info[box].length < MAX_INFO) info[box].push(fixWording(text));
  };

  /* ConfigLevelPlayers */
  const { minBombs, minRange, initHealth, reviveHealth } = level;
  // C: flags & (0xffffff >> 2), which drops the kick bits
  const initFlags = level.initFlags & 0x3fffff;
  const revFlags = level.revFlags & 0x3fffff;
  add("player", minBombs === 0 ? "No bomb" : minBombs === 1 ? "1 bomb" : `${minBombs} bombs`);
  add("player", minRange === 0 ? "No initial range" : minRange === 1 ? "Only mini bombs" : `Initial range ${minRange}`);
  if (initHealth === reviveHealth) {
    add("player", permHealthInfo[initHealth]);
  } else {
    add("player", initHealthInfo[initHealth]);
    add("player", reviveHealthInfo[reviveHealth]);
  }
  for (const [lf, rf, asDefault, initial, revived] of flagInfo) {
    // C quirk: equality tests, except for kick (a separate bit, masked out above)
    const init = lf === LF.Kick ? (initFlags & lf) !== 0 : initFlags === lf;
    if (init) add("player", revFlags === rf ? asDefault : initial);
    else if (revFlags === rf) add("player", revived);
  }

  /* ConfigLevelShrink */
  add("level", shrinkName[level.shrinkType]);

  /* ConfigLevelFunc */
  add("extra", extraInfo[level.specialExtra]);

  /* ConfigLevelBombs */
  const name = (bmt: BMT) => (bmt >= 0 ? bombName[bmt] : null);
  if (name(level.defaultBMT)) add("level", `${name(level.defaultBMT)} as default`);
  if (level.specialBombs !== 0 && name(level.specialBMT))
    add("level", `${level.specialBombs} ${name(level.specialBMT)}s`);
  if (level.specialExtra === "specialBomb" && name(level.specialBMT))
    add("level", `${name(level.specialBMT)} as an extra`);
  if (name(level.evilBMT)) add("level", `Hidden ${name(level.evilBMT)}s`);
  if (level.fuseTime === LONG_FUSE) add("level", "All bombs are long fused");
  else if (level.fuseTime === SHORT_FUSE) add("level", "All bombs are short fused");
  add("level", bombDirInfo[level.initialBombDir]);
  // hauntTable: slow 35, fast 10
  if (level.haunt === 35) add("level", "All bombs are haunted");
  else if (level.haunt === 10) add("level", "All bombs are haunted (and dangerous)");
  add("level", bombClickInfo[level.bombClick]);
  add("level", wallClickInfo[level.wallClick]);
  add("level", playerClickInfo[level.playerClick]);
  if (level.gentleNasty !== 0) add("level", "The Walls launch bombs");

  /* ConfigLevelGraphics */
  const tile = level.blocks;
  if (sameTile(tile[BT.Free]!, tile[BT.Block]!)) add("level", "Walls are invisible");
  if ([BT.Range, BT.Sick, BT.Special].every((bt) => sameTile(tile[BT.Bomb]!, tile[bt]!))) {
    add("level", "Extras all look the same");
  }
  if (sameTile(tile[BT.Extra]!, tile[BT.Block]!)) add("level", "Some walls are blastable");

  /* ConfigLevelMap */
  const p = level.extraProb;
  const probInfo: [string, number][] = [
    ["Bomb extras are", p.bomb],
    ["Rang extras are", p.range - p.bomb],
    ["Infections are", p.ill - p.range],
    ["Special extras are", p.invinc - p.ill],
    ["Hidden bombs are", p.evil - p.invinc],
  ];
  for (const [text, val] of probInfo) {
    const s = extraProbString(val);
    if (s) add("extra", `${text} ${s}`);
  }
  return info;
}
