// Constants and enumerations of XBlast 2.10.4 (xblast.h, geom.h, map.h,
// bomb.h, player.h), normal (not "mini") geometry.

export const MAX_PLAYER = 6;
export const MAZE_W = 15;
export const MAZE_H = 13;
export const MAX_BLOCK = 11;
export const MAX_BOMB_ANIME = 17;

export const BASE_X = 8;
export const BASE_Y = 6;
export const BLOCK_WIDTH = 8 * BASE_X;
export const BLOCK_HEIGHT = 8 * BASE_Y;
export const PIXW = MAZE_W * BLOCK_WIDTH;
export const PIXH = MAZE_H * BLOCK_HEIGHT;

/** frames per second of a standard game (frameRate=20) */
export const FRAME_RATE = 20;
export const TIME_STEP = 48;
export const DEAD_TIME = 8;
export const GAME_TIME = 60 * TIME_STEP + DEAD_TIME;

/* bombs */
export const BOMB_TIME = 64;
export const SHORT_FUSE = 32;
export const LONG_FUSE = 128;
export const BOMB_VX = 2 * BASE_X;
export const BOMB_VY = 2 * BASE_Y;
export const BOMB_STUN_X = 4 * BASE_X;
export const BOMB_STUN_Y = 4 * BASE_Y;
export const BOMB_ERROR_PROB = 32;
export const BOMB_DELAY = 5;
export const NASTY_INC = Math.trunc(GAME_TIME / 12);
/** search bombs: 2.5 blocks (double in the C code) */
export const BOMB_SEARCH_X = 2.5 * BLOCK_WIDTH;
export const BOMB_SEARCH_Y = 2.5 * BLOCK_HEIGHT;

/* players */
export const BOMB_STEP = 2;
export const STEP_HORI = BASE_X;
export const STEP_VERT = BASE_Y;
export const MAX_RANGE = 10;
export const ILLTIME = 256;
export const ILL_X = 4 * BASE_X;
export const ILL_Y = 5 * BASE_Y;
export const JUNKIE_ILL_TIME = ILLTIME;
export const JUNKIE_STUN_TIME = 12;
export const JUNKIE_TIME_1 = 360;
export const JUNKIE_TIME_2 = 210;
export const JUNKIE_TIME_3 = 60;
export const TELEPORT_TIME = 20;
export const EXTRA_GHOST_TIME = 256;
export const EXTRA_THROUGH_TIME = 64;
export const NEW_INVINCIBLE = 64;
export const EXTRA_INVINCIBLE = 160;
export const EXTRA_INVISIBLE = 256;
export const STUN_TIME = 16;
export const SMELLY_TIME = 30;
export const DALEIF_TIME = 5;
export const BONUSEVIL = 2 * EXTRA_INVISIBLE;
export const ILLDEATHTIME = Math.trunc(GAME_TIME / 8);
export const EXTRA_ELECTRIFY_COUNT = 4;
export const SHRINK_WARN_OFFSET = 55;

/** map tiles (BMMapTile) */
export const BT = {
  Evil: -2,
  Background: -1,
  Free: 0,
  Burned: 1,
  Block: 2,
  BlockRise: 3,
  Extra: 4,
  ExtraOpen: 5,
  Bomb: 6,
  Range: 7,
  Sick: 8,
  Special: 9,
  Void: 10,
} as const;
export type BT = (typeof BT)[keyof typeof BT];

/** directions (BMDirection) */
export const Dir = { Stop: 0, Up: 1, Left: 2, Down: 3, Right: 4, Default: 5 } as const;
export type Dir = (typeof Dir)[keyof typeof Dir];

/** player health (BMHealth) */
export const Ill = {
  Healthy: 0,
  Bomb: 1,
  Slow: 2,
  Run: 3,
  Mini: 4,
  Empty: 5,
  Invisible: 6,
  Malfunction: 7,
  Reverse: 8,
  Reverse2: 9,
  Teleport: 10,
} as const;
export type Ill = (typeof Ill)[keyof typeof Ill];
export const MAX_ILL = 11;

/** bomb types (BMBombType) */
export const BMT = {
  evil: -3,
  special: -2,
  default: -1,
  normal: 0,
  napalm: 1,
  blastnow: 2,
  close: 3,
  firecracker: 4,
  firecracker2: 5,
  construction: 6,
  threebombs: 7,
  grenade: 8,
  trianglebombs: 9,
  destruction: 10,
  fungus: 11,
  renovation: 12,
  pyro: 13,
  pyro2: 14,
  random: 15,
  short: 16,
  diagthreebombs: 17,
  scissor: 18,
  scissor2: 19,
  parallel: 20,
  distance: 21,
  lucky: 22,
  parasol: 23,
  comb: 24,
  farpyro: 25,
  nuclear: 26,
  protectbombs: 27,
  ringofire: 28,
  mine: 29,
  row: 30,
  column: 31,
  psycho: 32,
  search: 33,
  changedirectionathalf: 34,
  snipe: 35,
} as const;
export type BMT = (typeof BMT)[keyof typeof BMT];
export const NUM_BMT = 36;

/** burn out flags (BMBurnOut) */
export const BO = { RIGHT: 1, LEFT: 2, UP: 4, DOWN: 8, TOTAL: 15 } as const;

/** abort request (PlayerAbort) */
export const Abort = { None: 0, True: 1, Cancel: 2 } as const;

/** sprite display modes */
export const SPM = { UNMAPPED: 0, MAPPED: 2, MASKED: 4 } as const;

/** player sprite animations (BMSpriteAnimation) */
export const Anime = {
  StopDown: 0,
  WalkDown0: 1,
  StopUp: 5,
  WalkUp0: 6,
  StopRight: 10,
  WalkRight0: 11,
  StopLeft: 15,
  WalkLeft0: 16,
  DamagedDown: 20,
  DamagedLeft: 21,
  DamagedUp: 22,
  DamagedRight: 23,
  Looser: 24,
  Looser1: 25,
  Looser2: 26,
  Winner: 27,
  Winner2: 28,
  Winner3: 29,
  BigWinner: 30,
  DeadDown: 31,
  DeadLeft: 32,
  DeadUp: 33,
  DeadRight: 34,
  Morphed: 35,
  Zombie: 36,
} as const;

/** bomb sprites */
export const BB = { NORMAL: 0, MINI: 1 } as const;
