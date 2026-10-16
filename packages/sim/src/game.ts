// One level of XBlast 2.10.4: the game rules, transcribed function by function
// from map.c, bomb.c, player.c, func.c, shrink.c, scramble.c and game.c.
// Names follow the C code (camelCase) so both can be read side by side.
// Fidelity matters more than style here: every draw of the random generator
// must happen in the same order as in the original, or the games diverge.

import {
  Abort,
  Anime,
  BB,
  BLOCK_HEIGHT,
  BLOCK_WIDTH,
  BMT,
  BO,
  BOMB_DELAY,
  BOMB_ERROR_PROB,
  BOMB_SEARCH_X,
  BOMB_SEARCH_Y,
  BOMB_STEP,
  BOMB_STUN_X,
  BOMB_STUN_Y,
  BOMB_TIME,
  BOMB_VX,
  BOMB_VY,
  BONUSEVIL,
  BT,
  BASE_Y,
  DALEIF_TIME,
  DEAD_TIME,
  Dir,
  EXTRA_ELECTRIFY_COUNT,
  EXTRA_GHOST_TIME,
  EXTRA_INVINCIBLE,
  EXTRA_INVISIBLE,
  EXTRA_THROUGH_TIME,
  GAME_TIME,
  ILL_X,
  ILL_Y,
  ILLDEATHTIME,
  ILLTIME,
  Ill,
  JUNKIE_ILL_TIME,
  JUNKIE_STUN_TIME,
  JUNKIE_TIME_1,
  JUNKIE_TIME_2,
  JUNKIE_TIME_3,
  MAX_BOMB_ANIME,
  MAX_ILL,
  MAX_RANGE,
  MAZE_H,
  MAZE_W,
  NASTY_INC,
  NEW_INVINCIBLE,
  NUM_BMT,
  PIXH,
  PIXW,
  SMELLY_TIME,
  SPM,
  STEP_HORI,
  STEP_VERT,
  STUN_TIME,
  TELEPORT_TIME,
} from "./constants.ts";
import { DistribExtras, LF, RF, mapChars, type Level } from "./level.ts";
import { GameRandom } from "./rng.ts";
import * as shrinkData from "./shrinkdata.ts";

/** C integer division (truncates toward zero). */
const idiv = (a: number, b: number) => Math.trunc(a / b);
const abs = Math.abs;

export interface Player {
  id: number;
  team: number;
  /** turnStepKeyboard of the player config (0 by default) */
  turnStep: number;
  x: number;
  y: number;
  d_soll: Dir;
  d_ist: Dir;
  d_look: Dir;
  invincible: number;
  dying: number;
  stunned: number;
  health: Ill;
  illness: Ill;
  speed: number;
  illtime: number;
  junkie: number;
  lives: number;
  stop: number;
  evilill: number;
  score: number;
  range: number;
  choice_bomb_type: number;
  bombs: number;
  suck_button: number;
  iniextra_flags: number;
  revextra_flags: number;
  special_bombs: number;
  remote_control: number;
  kick: number;
  air_button: number;
  victories: number;
  teleport: number;
  cloaking: number;
  num_extras: number;
  abort: number;
  morphed: number;
  num_morph: number;
  in_active: number;
  jump_button: number;
  revive: number;
  frogger: number;
  laola: number;
  looser: number;
  ghost: number;
  num_snipe: number;
  sniping: number;
  daleif: number;
  daleifing: number;
  farted: number;
  farter: number;
  bfarter: number;
  smelly: number;
  electrify: number;
  throughCount: number;
  through: number;
  phantom: number;
  /* display only (sprite state) */
  anime: number;
  spriteMode: number;
  disp: number;
  /** player graphics shown for this player (swapped by the "swapcolor" extra) */
  look: number;
}

export interface Explosion {
  player: Player | null;
  range: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  dir: Dir;
  malfunction: number;
  count: number;
  countslower: number;
  countslower2: number;
  blink: number;
  type: number;
  typeExtr: number;
  burnOut: number;
  /** bomb sprite: BB.NORMAL, BB.MINI, or null when not shown */
  sprite: number | null;
  spriteMode: number;
  anime: number;
  nextAnime: number;
  isMorphed: number;
  isSniping: number;
  stop: number;
  jump: number;
  next: Explosion | null;
}

export interface PlayerAction {
  dir: Dir;
  bomb: boolean;
  special: boolean;
  pause?: boolean;
  suicide?: boolean;
  abort?: number;
  laola?: boolean;
  looser?: boolean;
}

export interface PlayerSetup {
  /** team number; players with the same team play together. Default: own id (no teams). */
  team?: number;
  turnStep?: number;
}

export interface GameOptions {
  level: Level;
  seed: number;
  players: PlayerSetup[];
  /** lives per player (numLives of the game setup) */
  lives: number;
  /** use the recLives of the level (ifRecLives) */
  recLives?: boolean;
  /** player fields kept from the previous level of the match */
  carry?: Partial<Player>[];
  /** default bomb of the previous level (for the "choicebombtype" extra) */
  choiceDefaultBomb?: number;
}

interface ShrinkStep {
  time: number;
  block: number;
  x: number;
  y: number;
}

/* bomb click behaviours */
type Click = Level["bombClick"];

const turnClockwise: Dir[] = [Dir.Stop, Dir.Right, Dir.Up, Dir.Left, Dir.Down, Dir.Default];
const turnAnticlockwise: Dir[] = [Dir.Stop, Dir.Left, Dir.Down, Dir.Right, Dir.Up, Dir.Default];
const turnOpposite: Dir[] = [Dir.Stop, Dir.Down, Dir.Right, Dir.Up, Dir.Left, Dir.Default];

/* names of the bombs offered by the "choicebombtype" extra (null: not offered) */
const bombNameChoice: (string | null)[] = [
  "Normal",
  "Napalm",
  "blastnow",
  "close",
  "firecracker",
  "firecracker2",
  "Construction",
  "threebombs",
  "Grenade",
  "triangle",
  "Destruction",
  "Fungus",
  "Renovation",
  "Pyro",
  "pyro2",
  "random",
  "short",
  "Diagonal",
  "Scissor",
  "Anti Scissor",
  "Parallel",
  "Distance",
  "Lucky",
  "Parasol",
  "Comb",
  null,
  null,
  "Protection",
  "ringoffire",
  "Auto Mine",
  null,
  null,
  null,
  "Searching",
  null,
  null,
  null,
];

export class Game {
  readonly level: Level;
  readonly rng: GameRandom;
  readonly players: Player[];
  /** frame counter: 0 after setup, then 1 to GAME_TIME */
  gameTime = 0;
  numActive: number;
  /** sounds played during the last frame (for the client) */
  sounds: { name: string; x: number }[] = [];

  /* map.c */
  private readonly maze = new Int8Array((MAZE_W + 1) * (MAZE_H + 1));
  private readonly extra = new Int8Array(MAZE_W * MAZE_H);
  private explMaze = new Uint16Array(MAZE_W * MAZE_H);
  private oldExplMaze = new Uint16Array(MAZE_W * MAZE_H);
  /* bomb.c */
  private readonly bombMaze: (Explosion | null)[] = Array.from({ length: MAZE_W * MAZE_H }, () => null);
  private numExpl = 0;
  exploList: Explosion | null = null;
  private explEnd: Explosion | null = null;
  private initialBombDir: Dir;
  private curBombTime: number;
  private readonly slowMotionBurst: number;
  private nextNasty: number;
  /* shrink.c */
  private readonly shrinkSteps: ShrinkStep[];
  private shrinkIndex = 0;
  /* player.c */
  private readonly maxLives: number;
  private readonly ifRecLives: boolean;
  private choiceDefaultBomb: number;

  constructor(options: GameOptions) {
    const level = options.level;
    this.level = level;
    this.rng = new GameRandom(options.seed);
    this.maxLives = options.lives;
    this.ifRecLives = options.recLives ?? false;
    this.initialBombDir = level.initialBombDir;
    this.curBombTime = level.fuseTime;
    this.slowMotionBurst = level.slowFlame;
    this.nextNasty = level.nextNasty;
    // set by ConfigLevelBombs, after the players: they still get the previous value
    this.choiceDefaultBomb = options.choiceDefaultBomb ?? 0;
    /* InitPlayers / InitPlayerStat */
    this.players = options.players.map((setup, id) => ({
      ...emptyPlayer(),
      id,
      team: setup.team ?? id,
      turnStep: setup.turnStep ?? 0,
      look: id,
      ...options.carry?.[id],
    }));
    this.numActive = this.players.length;
    /* ConfigLevel */
    this.configLevelPlayers();
    this.shrinkSteps = this.configLevelShrink();
    this.choiceDefaultBomb = level.defaultBMT;
    this.configLevelMap();
  }

  /* ------------------------------------------------------------------ */
  /* frame loop (game_local.c, game.c)                                   */
  /* ------------------------------------------------------------------ */

  /** One whole frame: rules, then player inputs, then end of frame. */
  step(actions: readonly PlayerAction[]): void {
    this.turn();
    this.evalActions(actions);
    this.endFrame();
  }

  /** gameTime++ and GameTurn. */
  turn(): void {
    this.sounds = [];
    this.gameTime++;
    const t = this.gameTime;
    this.doAllPlayers(t);
    this.doShrink(t);
    this.doScramble(t);
    this.doNastyWalls(t);
    this.doBombs();
    this.doExplosions();
    this.igniteBombs();
    this.stunPlayers();
    this.infectOtherPlayers();
    this.doEvilIll();
    this.doJunkie();
    this.checkPlayerHit();
  }

  /** ClearRedrawMap (end of GameUpdateWindow): explosions are redrawn each frame. */
  endFrame(): void {
    const swap = this.oldExplMaze;
    this.oldExplMaze = this.explMaze;
    this.explMaze = swap;
    this.explMaze.fill(0);
  }

  /** Same end condition as LocalRunLevel. */
  get over(): boolean {
    return !(this.gameTime < GAME_TIME && this.numActive > 0 && (this.numActive > 1 || this.numExpl !== 0));
  }

  /**
   * LevelResult, without changing the state: dying players count as dead.
   * winnerTeam: the team of the players still alive, null for a draw (nobody
   * or several teams alive, or out of time).
   */
  result(): { winnerTeam: number | null; outOfTime: boolean } {
    let team: number | null | undefined;
    for (const p of this.players) {
      const lives = p.dying ? p.lives - 1 : p.lives;
      if (lives > 0) team = team === undefined || team === p.team ? p.team : null;
    }
    const outOfTime = this.gameTime >= GAME_TIME - 1;
    return { winnerTeam: outOfTime || team === undefined ? null : team, outOfTime };
  }

  /** GameEvalAction */
  evalActions(actions: readonly PlayerAction[]): void {
    let checkAbort = false;
    this.players.forEach((ps, player) => {
      const pa = actions[player];
      if (!pa || ps.lives <= 0) return;
      if (pa.suicide && !ps.dying) {
        ps.dying = DEAD_TIME;
        ps.lives = 1;
      }
      if (pa.bomb) this.dropBomb(ps, BMT.default);
      if (pa.special) this.specialKey(ps);
      if (pa.laola) ps.laola = 6;
      if (pa.looser) ps.looser = 10;
      if (pa.abort === Abort.Cancel) ps.abort = Abort.None;
      else if (pa.abort === Abort.True) {
        ps.abort = Abort.True;
        checkAbort = true;
      }
      let dir = pa.dir;
      if (dir !== Dir.Default) {
        if (ps.illness === Ill.Reverse) dir = turnOpposite[dir]!;
        if (ps.illness === Ill.Reverse2) {
          dir = ([Dir.Stop, Dir.Right, Dir.Up, Dir.Left, Dir.Down, Dir.Default] as Dir[])[dir]!;
        }
        ps.d_soll = dir;
        const turnX = ps.turnStep * 8;
        const turnY = ps.turnStep * BASE_Y;
        switch (ps.d_ist) {
          case Dir.Up:
            if (
              ((ps.d_soll === Dir.Right || ps.d_soll === Dir.Left) && ps.y % BLOCK_HEIGHT >= BLOCK_HEIGHT - turnY) ||
              ps.d_soll === Dir.Down
            )
              ps.d_ist = Dir.Down;
            break;
          case Dir.Down:
            if (
              ((ps.d_soll === Dir.Right || ps.d_soll === Dir.Left) && ps.y % BLOCK_HEIGHT <= turnY) ||
              ps.d_soll === Dir.Up
            )
              ps.d_ist = Dir.Up;
            break;
          case Dir.Right:
            if (
              ((ps.d_soll === Dir.Up || ps.d_soll === Dir.Down) && ps.x % BLOCK_WIDTH <= turnX) ||
              ps.d_soll === Dir.Left
            )
              ps.d_ist = Dir.Left;
            break;
          case Dir.Left:
            if (
              ((ps.d_soll === Dir.Up || ps.d_soll === Dir.Down) && ps.x % BLOCK_WIDTH >= BLOCK_WIDTH - turnX) ||
              ps.d_soll === Dir.Right
            )
              ps.d_ist = Dir.Right;
            break;
          default:
            break;
        }
      }
    });
    if (checkAbort && this.players.every((ps) => ps.lives <= 0 || ps.abort !== Abort.None)) {
      for (const ps of this.players) {
        if (ps.lives > 0) {
          ps.lives = 1;
          ps.dying = DEAD_TIME;
        }
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* map.c                                                              */
  /* ------------------------------------------------------------------ */

  /**
   * maze[x][y] with the memory layout of the C array maze[MAZE_W + 1][MAZE_H + 1].
   * Outside of it the C code reads neighbouring memory, zero in practice: BT.Free.
   */
  mazeAt(x: number, y: number): number {
    const i = x * (MAZE_H + 1) + y;
    return i >= 0 && i < this.maze.length ? this.maze[i]! : BT.Free;
  }

  private setMaze(x: number, y: number, block: number): void {
    const i = x * (MAZE_H + 1) + y;
    if (i >= 0 && i < this.maze.length) this.maze[i] = block;
  }

  extraAt(x: number, y: number): number {
    const i = x * MAZE_H + y;
    return i >= 0 && i < this.extra.length ? this.extra[i]! : BT.Free;
  }

  private setExtra(x: number, y: number, value: number): void {
    const i = x * MAZE_H + y;
    if (i >= 0 && i < this.extra.length) this.extra[i] = value;
  }

  /** explosion graphics of a cell (0: none) */
  explAt(x: number, y: number): number {
    const i = x * MAZE_H + y;
    return i >= 0 && i < this.explMaze.length ? this.explMaze[i]! : 0;
  }

  private configLevelMap(): void {
    for (let y = 0; y < MAZE_H; y++) {
      const row = this.level.rows[y]!;
      for (let x = 0; x < MAZE_W; x++) {
        const block = mapChars[row[x]!];
        if (block !== undefined) this.setMazeBlock(x, y, block);
        this.explMaze[x * MAZE_H + y] = 0;
        this.oldExplMaze[x * MAZE_H + y] = 0;
      }
    }
  }

  checkMaze(x: number, y: number): boolean {
    const m = this.mazeAt(x, y);
    return m === BT.Block || m === BT.BlockRise || m === BT.Extra || m === BT.ExtraOpen || m === BT.Void || m < 0;
  }

  private checkMazeFree(x: number, y: number): boolean {
    const m = this.mazeAt(x, y);
    return m === BT.Free || m === BT.Burned;
  }

  private checkMazeFree2(x: number, y: number): boolean {
    const m = this.mazeAt(x, y);
    return m === BT.Free || m === BT.Void || m === BT.Burned;
  }

  private checkMazeWall(x: number, y: number): boolean {
    const m = this.mazeAt(x, y);
    return m === BT.Block || m === BT.BlockRise;
  }

  private checkMazePhantomWall(x: number, y: number): boolean {
    const m = this.mazeAt(x, y);
    return m === BT.Block || m === BT.BlockRise || m === BT.Void;
  }

  private checkMazeGhost(ghost: number, x: number, y: number): boolean {
    if (!ghost) return this.checkMaze(x, y);
    const m = this.mazeAt(x, y);
    // (sic) compares x with MAZE_H and y with MAZE_W
    return m === BT.Void || m < 0 || x <= 0 || y <= 0 || x > MAZE_H || y > MAZE_W - 4;
  }

  private checkMazeSolid(x: number, y: number): boolean {
    const m = this.mazeAt(x, y);
    return m === BT.Block || m === BT.BlockRise || m === BT.Extra || m === BT.ExtraOpen;
  }

  private checkMazeOpen(x: number, y: number): boolean {
    const m = this.mazeAt(x, y);
    return m === BT.Free || m === BT.Burned || m === BT.Void;
  }

  private checkMazeExtra(x: number, y: number): boolean {
    return this.mazeAt(x, y) === BT.Extra;
  }

  private checkExplosion(x: number, y: number): boolean {
    return this.explAt(x, y) !== 0;
  }

  private setExplBlock(x: number, y: number, value: number): void {
    if (x >= 0 && y >= 0 && x < MAZE_W && y < MAZE_H) {
      this.explMaze[x * MAZE_H + y]! |= value;
    }
  }

  private setMazeBlock(x: number, y: number, block: number): void {
    switch (block) {
      case BT.Extra: {
        const rnd = this.rng.number(64);
        const p = this.level.extraProb;
        let extra: number;
        if (rnd < p.bomb) extra = BT.Bomb;
        else if (rnd < p.range) extra = BT.Range;
        else if (rnd < p.ill) extra = BT.Sick;
        else if (rnd < p.invinc) extra = BT.Special;
        else if (rnd < p.evil) extra = BT.Evil;
        else extra = BT.Free;
        this.setExtra(x, y, extra);
        this.setMaze(x, y, block);
        break;
      }
      case BT.Evil:
        this.setMaze(x, y, BT.Free);
        this.setExtra(x, y, BT.Free);
        this.newExplosion(null, x, y, 3, false, false, this.level.evilBMT, 0, Dir.Default);
        break;
      case BT.ExtraOpen:
        this.setMaze(x, y, block);
        break;
      default:
        this.setMaze(x, y, block);
        this.setExtra(x, y, BT.Free);
        break;
    }
  }

  private getExtra(invincible: number, x: number, y: number): number {
    const m = this.mazeAt(x, y);
    let extraBlock = m <= BT.ExtraOpen ? 0 : m;
    if (invincible > 0 && extraBlock === BT.Sick) extraBlock = 0;
    if (extraBlock !== 0 && m !== BT.Void) this.setMazeBlock(x, y, BT.Free);
    const d = this.level.distribExtras;
    if (extraBlock === BT.Special && (d === DistribExtras.get || d === DistribExtras.double)) {
      this.distributeExtras(0, 0, -1, 0);
    }
    return extraBlock;
  }

  private distribSpecial(): boolean {
    return this.level.distribExtras === DistribExtras.special;
  }

  private putExtras(freeBlocks: number, distPos: { x: number; y: number }[], tile: number, numExtras: number): number {
    for (let i = 0; freeBlocks > 0 && i < numExtras; i++) {
      const where = this.rng.number(freeBlocks);
      this.setMazeBlock(distPos[where]!.x, distPos[where]!.y, tile);
      freeBlocks--;
      if (where !== freeBlocks) {
        const swap = distPos[where]!;
        distPos[where] = distPos[freeBlocks]!;
        distPos[freeBlocks] = swap;
      }
    }
    return freeBlocks;
  }

  private distributeExtras(bombs: number, range: number, extras: number, specials: number): void {
    if (bombs + range + extras + specials === 0) return;
    const distExtra: number[] = Array.from({ length: MAZE_H }, () => 0);
    let freeBlocks = 0;
    for (let x = 0; x < MAZE_W; x++) {
      for (let y = 0; y < MAZE_H; y++) {
        const m = this.mazeAt(x, y);
        if (m === BT.Burned || m === BT.Free) {
          distExtra[y]! |= 1 << x;
          freeBlocks++;
        }
      }
    }
    freeBlocks = this.checkDistribExpl(distExtra, freeBlocks);
    if (freeBlocks <= 0) return;
    const distPos: { x: number; y: number }[] = [];
    for (let x = 0; x < MAZE_W; x++) {
      for (let y = 0; y < MAZE_H; y++) {
        if (distExtra[y]! & (1 << x)) distPos.push({ x, y });
      }
    }
    let numExtras = 0;
    switch (this.level.distribExtras) {
      case DistribExtras.none:
        numExtras = 0;
        break;
      case DistribExtras.single:
        numExtras = extras > 0 ? 1 : 0;
        break;
      case DistribExtras.all:
        numExtras = extras > 0 ? extras : 0;
        break;
      case DistribExtras.special:
        numExtras = idiv(specials + 2, 3);
        break;
      case DistribExtras.get:
        numExtras = extras < 0 ? 1 : 0;
        break;
      case DistribExtras.double:
        numExtras = extras < 0 ? 2 : 0;
        break;
    }
    freeBlocks = this.putExtras(freeBlocks, distPos, BT.Special, numExtras);
    if (freeBlocks <= 0) return;
    freeBlocks = this.putExtras(freeBlocks, distPos, BT.Range, range);
    if (freeBlocks <= 0) return;
    this.putExtras(freeBlocks, distPos, BT.Bomb, bombs);
  }

  private blastExtraBlock(x: number, y: number): void {
    switch (this.mazeAt(x, y)) {
      case BT.ExtraOpen:
        this.setMazeBlock(x, y, this.extraAt(x, y));
        break;
      case BT.Special: {
        const d = this.level.distribExtras;
        if (d === DistribExtras.get || d === DistribExtras.double) this.distributeExtras(0, 0, -1, 0);
        this.setMazeBlock(x, y, BT.Free);
        break;
      }
      case BT.Sick:
      case BT.Bomb:
      case BT.Range:
        this.setMazeBlock(x, y, BT.Free);
        break;
      default:
        break;
    }
  }

  /* ------------------------------------------------------------------ */
  /* bomb.c                                                             */
  /* ------------------------------------------------------------------ */

  private bombAt(x: number, y: number): Explosion | null {
    const i = x * MAZE_H + y;
    return i >= 0 && i < this.bombMaze.length ? this.bombMaze[i]! : null;
  }

  private setBombAt(x: number, y: number, e: Explosion | null): void {
    const i = x * MAZE_H + y;
    if (i >= 0 && i < this.bombMaze.length) this.bombMaze[i] = e;
  }

  private oneExplAt(x: number, y: number, ra: number, ri: number, ptr: Explosion): void {
    const dirs = [
      [BO.RIGHT, 1, 0, 0x1a, 0x18, 0x12],
      [BO.LEFT, -1, 0, 0x1a, 0x12, 0x18],
      [BO.UP, 0, -1, 0x15, 0x14, 0x11],
      [BO.DOWN, 0, 1, 0x15, 0x11, 0x14],
    ] as const;
    for (const [flag, sx, sy, mid, end, start] of dirs) {
      if (ptr.burnOut & flag) continue;
      let i = 0;
      for (; i <= ra && this.checkMazeOpen(x + sx * i, y + sy * i); i++) {
        if (i >= ri) {
          const cx = x + sx * i;
          const cy = y + sy * i;
          if (i !== ri && i !== ra) this.setExplBlock(cx, cy, mid);
          else if (i !== ri) this.setExplBlock(cx, cy, end);
          else if (i === ra) this.setExplBlock(cx, cy, 0x10);
          else this.setExplBlock(cx, cy, start);
        }
      }
      if (i < ri) ptr.burnOut |= flag;
      if (i <= ra && this.checkMazeExtra(x + sx * i, y + sy * i)) {
        this.setMazeBlock(x + sx * i, y + sy * i, BT.ExtraOpen);
      }
    }
  }

  private delExplosion(ptr: Explosion): void {
    if (ptr.player !== null) {
      ptr.player.bombs++;
      if (ptr.isMorphed) {
        ptr.player.morphed = 0;
        ptr.player.x = ptr.x * BLOCK_WIDTH;
        ptr.player.y = (ptr.y - 1) * BLOCK_HEIGHT;
        ptr.player.num_extras--;
      }
      if (ptr.isSniping) {
        ptr.player.sniping = 0;
        ptr.player.num_extras--;
      }
    }
    const { x, y, range: r } = ptr;
    this.setBombAt(x, y, null);
    this.numExpl--;
    for (const [sx, sy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      for (let i = 0; i <= r; i++) {
        if (!this.checkMazeFree2(x + sx * i, y + sy * i)) {
          this.blastExtraBlock(x + sx * i, y + sy * i);
          break;
        }
      }
    }
    ptr.sprite = null;
    if (ptr === this.exploList) {
      this.exploList = ptr.next;
      if (this.exploList === null) this.explEnd = null;
    } else {
      for (let hilf = this.exploList; hilf !== null && hilf.next !== null; hilf = hilf.next) {
        if (hilf.next === ptr) {
          if (this.explEnd === ptr) this.explEnd = hilf;
          hilf.next = ptr.next;
          break;
        }
      }
    }
  }

  deleteAllExplosions(): void {
    while (this.exploList !== null) this.delExplosion(this.exploList);
  }

  private bombClick(click: Click, bomb: Explosion): void {
    switch (click) {
      case "none":
        bomb.dir = Dir.Stop;
        bomb.dx = 0;
        bomb.dy = 0;
        break;
      case "initial":
        switch (this.initialBombDir) {
          case Dir.Stop:
            bomb.dx = 0;
            bomb.dy = 0;
            break;
          case Dir.Right:
            if (this.checkMazeFree(bomb.x + 1, bomb.y)) bomb.dx = BOMB_VX;
            bomb.dy = 0;
            break;
          case Dir.Left:
            if (this.checkMazeFree(bomb.x - 1, bomb.y)) bomb.dx = -BOMB_VX;
            bomb.dy = 0;
            break;
          case Dir.Down:
            bomb.dx = 0;
            if (this.checkMazeFree(bomb.x, bomb.y + 1)) bomb.dy = BOMB_VY;
            break;
          case Dir.Up:
            bomb.dx = 0;
            if (this.checkMazeFree(bomb.x, bomb.y - 1)) bomb.dy = -BOMB_VY;
            break;
        }
        bomb.dir = this.initialBombDir;
        break;
      case "thru":
        break;
      case "snooker": {
        const dir = bomb.dir;
        bomb.dir = Dir.Stop;
        bomb.dx = 0;
        bomb.dy = 0;
        switch (dir) {
          case Dir.Up:
            this.moveBomb(bomb.x, bomb.y - 1, dir);
            break;
          case Dir.Left:
            this.moveBomb(bomb.x - 1, bomb.y, dir);
            break;
          case Dir.Down:
            this.moveBomb(bomb.x, bomb.y + 1, dir);
            break;
          case Dir.Right:
            this.moveBomb(bomb.x + 1, bomb.y, dir);
            break;
        }
        break;
      }
      case "contact":
        bomb.dir = Dir.Stop;
        bomb.dx = 0;
        bomb.dy = 0;
        bomb.count = 0;
        break;
      case "clockwise":
        bomb.dx = 0;
        bomb.dy = 0;
        bomb.dir = turnClockwise[bomb.dir]!;
        break;
      case "anticlockwise":
        bomb.dx = 0;
        bomb.dy = 0;
        bomb.dir = turnAnticlockwise[bomb.dir]!;
        break;
      case "randomdir":
        bomb.dx = 0;
        bomb.dy = 0;
        bomb.dir = (this.rng.number(4) + 1) as Dir;
        break;
      case "split":
        bomb.dir = turnOpposite[bomb.dir]!;
        this.spreXDir(bomb.x + 1, bomb.y + 1, bomb.range, this.level.defaultBMT, 0, turnClockwise[bomb.dir]!);
        this.spreXDir(bomb.x - 1, bomb.y - 1, bomb.range, this.level.defaultBMT, 0, turnAnticlockwise[bomb.dir]!);
        break;
      case "rebound":
        bomb.dir = turnOpposite[bomb.dir]!;
        break;
    }
  }

  private hauntBomb(ptr: Explosion): void {
    if (ptr.dir === Dir.Stop && !this.checkPlayerNear(ptr.x, ptr.y)) {
      switch (this.rng.number(4)) {
        case 0:
          ptr.dir = Dir.Up;
          ptr.dx = 0;
          break;
        case 1:
          ptr.dir = Dir.Down;
          ptr.dx = 0;
          break;
        case 2:
          ptr.dir = Dir.Left;
          ptr.dy = 0;
          break;
        case 3:
          ptr.dir = Dir.Right;
          ptr.dy = 0;
          break;
      }
      this.sound("haunt", PIXW / 2);
    }
  }

  private moveBombUp(ptr: Explosion): void {
    const tt = (ptr.y - 1 + MAZE_H) % MAZE_H;
    if (ptr.dy === 0 && !this.checkMazeFree(ptr.x, tt)) this.bombClick(this.level.wallClick, ptr);
    else if (ptr.dy <= 0 && this.checkBomb(ptr.x, tt)) this.bombClick(this.level.bombClick, ptr);
    else {
      ptr.dy -= BOMB_VY;
      if (ptr.dy <= -BLOCK_HEIGHT / 2) {
        this.sound("slide", ptr.x * BLOCK_WIDTH);
        this.setBombAt(ptr.x, ptr.y, null);
        ptr.dy += BLOCK_HEIGHT;
        ptr.y = tt;
        this.setBombAt(ptr.x, ptr.y, ptr);
      }
    }
  }

  private moveBombDown(ptr: Explosion): void {
    const tt = (ptr.y + 1 + MAZE_H) % MAZE_H;
    if (ptr.dy === 0 && !this.checkMazeFree(ptr.x, tt)) this.bombClick(this.level.wallClick, ptr);
    else if (ptr.dy >= 0 && this.checkBomb(ptr.x, tt)) this.bombClick(this.level.bombClick, ptr);
    else {
      ptr.dy += BOMB_VY;
      if (ptr.dy >= BLOCK_HEIGHT / 2) {
        this.sound("slide", ptr.x * BLOCK_WIDTH);
        this.setBombAt(ptr.x, ptr.y, null);
        ptr.dy -= BLOCK_HEIGHT;
        ptr.y = tt;
        this.setBombAt(ptr.x, ptr.y, ptr);
      }
    }
  }

  private moveBombRight(ptr: Explosion): void {
    const tt = (ptr.x + 1 + MAZE_W) % MAZE_W;
    if (ptr.dx === 0 && !this.checkMazeFree(tt, ptr.y)) this.bombClick(this.level.wallClick, ptr);
    else if (ptr.dx >= 0 && this.checkBomb(tt, ptr.y)) this.bombClick(this.level.bombClick, ptr);
    else {
      ptr.dx += BOMB_VX;
      if (ptr.dx >= BLOCK_WIDTH / 2) {
        this.sound("slide", ptr.x * BLOCK_WIDTH);
        this.setBombAt(ptr.x, ptr.y, null);
        ptr.dx -= BLOCK_WIDTH;
        ptr.x = tt;
        this.setBombAt(ptr.x, ptr.y, ptr);
      }
    }
  }

  private moveBombLeft(ptr: Explosion): void {
    const tt = (ptr.x - 1 + MAZE_W) % MAZE_W;
    if (ptr.dx === 0 && !this.checkMazeFree(tt, ptr.y)) this.bombClick(this.level.wallClick, ptr);
    else if (ptr.dx <= 0 && this.checkBomb(tt, ptr.y)) this.bombClick(this.level.bombClick, ptr);
    else {
      ptr.dx -= BOMB_VX;
      if (ptr.dx <= -BLOCK_WIDTH / 2) {
        this.sound("slide", ptr.x * BLOCK_WIDTH);
        this.setBombAt(ptr.x, ptr.y, null);
        ptr.dx += BLOCK_WIDTH;
        ptr.x = tt;
        this.setBombAt(ptr.x, ptr.y, ptr);
      }
    }
  }

  private moveBombDir(ptr: Explosion, dir: Dir): void {
    switch (dir) {
      case Dir.Up:
        this.moveBombUp(ptr);
        break;
      case Dir.Down:
        this.moveBombDown(ptr);
        break;
      case Dir.Right:
        this.moveBombRight(ptr);
        break;
      case Dir.Left:
        this.moveBombLeft(ptr);
        break;
      default:
        break;
    }
  }

  private doBombs(): void {
    const ps = this.players;
    let bombToHaunt = -1;
    if (this.level.haunt !== 0) {
      bombToHaunt = this.rng.number(this.level.haunt);
      if (bombToHaunt > 6) bombToHaunt = -1;
    }
    for (let ptr = this.exploList; ptr !== null; ptr = ptr.next) {
      if (ptr.count === 0) {
        if (ptr.sprite !== null) {
          ptr.anime = MAX_BOMB_ANIME - 1;
          ptr.spriteMode = SPM.MAPPED;
        }
      } else if (ptr.count < 0) {
        if (this.level.haunt !== 0) {
          if (bombToHaunt === 0) this.hauntBomb(ptr);
          bombToHaunt--;
        }
        if (ptr.stop && ptr.dx === 0 && ptr.dy === 0) {
          ptr.dir = Dir.Stop;
          ptr.stop = 0;
        }
        if (ptr.jump === 1) ptr.dir = Dir.Stop;
        /* search bombs */
        if (ptr.type === BMT.search && ptr.dir !== Dir.Stop) {
          if (ptr.dir === Dir.Up || ptr.dir === Dir.Down) {
            if (ptr.dy === 0) {
              const bwX = ptr.x * BLOCK_WIDTH;
              const bwY = (ptr.y - 1) * BLOCK_HEIGHT;
              for (const p of ps) {
                if (p.lives && (ptr.player !== null ? p.team !== ptr.player.team : true)) {
                  const difX = bwX - p.x;
                  if (abs(difX) <= BOMB_SEARCH_X && abs(bwY - p.y) < BLOCK_HEIGHT) {
                    if (difX > 0 && this.checkMazeFree(ptr.x - 1, ptr.y)) {
                      ptr.dir = Dir.Left;
                      break;
                    }
                    if (difX < 0 && this.checkMazeFree(ptr.x + 1, ptr.y)) {
                      ptr.dir = Dir.Right;
                      break;
                    }
                  }
                }
              }
            }
          } else if (ptr.dir === Dir.Left || ptr.dir === Dir.Right) {
            if (ptr.dx === 0) {
              const bwX = ptr.x * BLOCK_WIDTH;
              const bwY = (ptr.y - 1) * BLOCK_HEIGHT;
              for (const p of ps) {
                if (p.lives && (ptr.player !== null ? p.team !== ptr.player.team : true)) {
                  const difY = bwY - p.y;
                  if (abs(difY) <= BOMB_SEARCH_Y && abs(bwX - p.x) < BLOCK_WIDTH) {
                    if (difY > 0 && this.checkMazeFree(ptr.x, ptr.y - 1)) {
                      ptr.dir = Dir.Up;
                      break;
                    }
                    if (difY < 0 && this.checkMazeFree(ptr.x, ptr.y + 1)) {
                      ptr.dir = Dir.Down;
                      break;
                    }
                  }
                }
              }
            }
          }
        }
        if (ptr.isSniping === 0) {
          switch (ptr.dir) {
            case Dir.Up:
              this.moveBombUp(ptr);
              if (ptr.jump > 0) {
                ptr.type = BMT.short;
                if (ptr.dy <= -BLOCK_HEIGHT / 2) {
                  this.setBombAt(ptr.x, ptr.y, null);
                  ptr.dy += BLOCK_HEIGHT;
                  ptr.y -= 1;
                  this.setBombAt(ptr.x, ptr.y, ptr);
                }
                ptr.dy -= BOMB_VY;
                if (ptr.y <= 1) ptr.dy = 0;
                ptr.jump--;
              }
              break;
            case Dir.Down:
              this.moveBombDown(ptr);
              if (ptr.jump > 0) {
                ptr.type = BMT.short;
                if (ptr.dy >= BLOCK_HEIGHT / 2) {
                  this.setBombAt(ptr.x, ptr.y, null);
                  ptr.dy -= BLOCK_HEIGHT;
                  ptr.y += 1;
                  this.setBombAt(ptr.x, ptr.y, ptr);
                }
                ptr.dy += BOMB_VY;
                if (ptr.y >= MAZE_H - 2) ptr.dy = 0;
                ptr.jump--;
              }
              break;
            case Dir.Right:
              this.moveBombRight(ptr);
              if (ptr.jump > 0) {
                if (ptr.dx >= BLOCK_WIDTH / 2) {
                  this.setBombAt(ptr.x, ptr.y, null);
                  ptr.dx -= BLOCK_WIDTH;
                  ptr.x += 1;
                  this.setBombAt(ptr.x, ptr.y, ptr);
                }
                ptr.dx += BOMB_VX;
                if (ptr.x >= MAZE_W - 2) ptr.dx = 0;
                ptr.jump--;
              }
              break;
            case Dir.Left:
              this.moveBombLeft(ptr);
              if (ptr.jump > 0) {
                if (ptr.dx <= -BLOCK_WIDTH / 2) {
                  this.setBombAt(ptr.x, ptr.y, null);
                  ptr.dx += BLOCK_WIDTH;
                  ptr.x -= 1;
                  this.setBombAt(ptr.x, ptr.y, ptr);
                }
                ptr.dx -= BOMB_VX;
                if (ptr.x <= 1) ptr.dx = 0;
                ptr.jump--;
              }
              break;
            default:
              break;
          }
        } else if (ptr.player !== null) {
          this.moveBombDir(ptr, ptr.player.d_soll);
        } else {
          this.moveBombDir(ptr, ptr.dir);
        }
        if (ptr.isMorphed && ptr.player !== null) {
          ptr.player.x = ptr.dx + ptr.x * BLOCK_WIDTH;
          ptr.player.y = ptr.dy + (ptr.y - 1) * BLOCK_HEIGHT;
        }
        if (this.checkExplosion(ptr.x, ptr.y)) ptr.count = 0;
        if (ptr.sprite !== null) {
          if (ptr.blink + ptr.count === 0) {
            ptr.spriteMode = SPM.MAPPED | SPM.MASKED;
            ptr.blink >>= 1;
          } else {
            ptr.spriteMode = SPM.MAPPED;
          }
          if (ptr.count === ptr.nextAnime) {
            ptr.anime++;
            ptr.nextAnime += idiv(this.curBombTime, MAX_BOMB_ANIME - 1);
          }
        }
        /* malfunction, random or illness */
        if (ptr.count === -3 && (ptr.malfunction || this.rng.number(BOMB_ERROR_PROB) === 0)) {
          ptr.malfunction = 0;
          ptr.count = -BOMB_TIME * (2 + this.rng.number(BOMB_DELAY));
          ptr.blink = BOMB_TIME >> 1;
        }
      }
    }
  }

  private stopPlayersBombs(ps: Player): number {
    let n = 0;
    for (let ptr = this.exploList; ptr !== null; ptr = ptr.next) {
      if (ptr.count < 0 && ptr.player === ps) {
        ptr.stop = 1;
        n++;
      }
    }
    return n;
  }

  private ignitePlayersBombs(ps: Player): number {
    let n = 0;
    for (let ptr = this.exploList; ptr !== null; ptr = ptr.next) {
      if (ptr.count < 0 && ptr.player === ps) {
        ptr.count = 0;
        n++;
      }
    }
    return n;
  }

  private igniteAllBombs(): number {
    let n = 0;
    for (let ptr = this.exploList; ptr !== null; ptr = ptr.next) {
      if (ptr.count < 0) {
        ptr.count = 0;
        n++;
      }
    }
    return n;
  }

  private igniteBombs(): void {
    for (let ptr = this.exploList; ptr !== null; ptr = ptr.next) {
      if (ptr.count < 0 && this.checkExplosion(ptr.x, ptr.y)) ptr.count = 0;
    }
  }

  private doExplosions(): void {
    let ptr = this.exploList;
    while (ptr !== null) {
      const nextPtr: Explosion | null = ptr.next;
      if (ptr.count >= 0) {
        if (ptr.count === 0 && ptr.isMorphed && ptr.player !== null) ptr.player.morphed = 3;
        if (ptr.burnOut === BO.TOTAL || ptr.count >= 2 * ptr.range + 2) {
          this.delExplosion(ptr);
          ptr = nextPtr;
          continue;
        }
        const hilf = ptr.count;
        if (hilf === 0) {
          if (this.checkMazeFree(ptr.x, ptr.y)) this.setMazeBlock(ptr.x, ptr.y, BT.Burned);
          const mini = ptr.range === 1 || ptr.type === BMT.firecracker || ptr.type === BMT.firecracker2;
          this.sound(mini ? "minibomb" : "expl", ptr.x * BLOCK_WIDTH);
        }
        this.oneExplAt(ptr.x, ptr.y, Math.min(ptr.range, hilf), Math.max(0, hilf - ptr.range), ptr);
      }
      if (this.specialBomb(ptr)) {
        if (this.slowMotionBurst) {
          const tick = ptr.countslower2 % this.slowMotionBurst === 0 ? 1 : 0;
          if (ptr.count > 0) ptr.count += tick;
          else ptr.count++;
          ptr.countslower += tick;
          ptr.countslower2++;
        } else {
          ptr.count++;
        }
        if (ptr.count === 2 && ptr.sprite !== null) ptr.sprite = null;
        ptr = ptr.next;
      } else {
        ptr = nextPtr;
      }
    }
  }

  private spreadExplosion(lx: number, ly: number, range: number, type: number, typeExtr: number): void {
    if (lx < MAZE_W && lx > -1 && ly < MAZE_H && ly > -1 && !this.checkMazeSolid(lx, ly)) {
      this.newExplosion(null, lx, ly, range, false, false, type, typeExtr, Dir.Stop);
    }
  }

  private spreXDir(lx: number, ly: number, range: number, type: number, typeExtr: number, dir: Dir): void {
    if (lx < MAZE_W && lx > -1 && ly < MAZE_H && ly > -1 && !this.checkMazeSolid(lx, ly)) {
      this.newExplosion(null, lx, ly, range, false, false, type, typeExtr, dir);
    }
  }

  private moveBlockFromTo(sx: number, sy: number, dx: number, dy: number): void {
    if (
      sx > 0 &&
      sx < MAZE_W - 1 &&
      sy > 0 &&
      sy < MAZE_H - 1 &&
      dx > 0 &&
      dx < MAZE_W - 1 &&
      dy > 0 &&
      dy < MAZE_H - 1 &&
      this.checkMazeWall(sx, sy) &&
      this.checkMazeFree(dx, dy)
    ) {
      this.killPlayerAt(dx, dy);
      this.deleteBombAt(dx, dy);
      this.setMazeBlock(sx, sy, BT.Free);
      this.setMazeBlock(dx, dy, BT.Block);
    }
  }

  /** doSpecialBombFunction[ptr->type]: false if the bomb deleted itself. */
  private specialBomb(ptr: Explosion): boolean {
    const t = -this.curBombTime;
    const def = this.level.defaultBMT;
    switch (ptr.type) {
      case BMT.napalm:
        if (ptr.count === 0) {
          ptr.type = BMT.normal;
          for (let i = -2; i <= 2; i++) {
            this.spreadExplosion(ptr.x + i, ptr.y, idiv(ptr.range, abs(i) + 1), BMT.blastnow, 0);
            this.spreadExplosion(ptr.x, ptr.y + i, idiv(ptr.range, abs(i) + 1), BMT.blastnow, 0);
          }
        }
        return true;
      case BMT.firecracker:
      case BMT.firecracker2:
        if (ptr.count >= 1) {
          if (ptr.type === BMT.firecracker && this.rng.number(10) === 0) ptr.typeExtr = -5;
          const nasty = ptr.typeExtr;
          for (let i = -1; i <= 1; i++) {
            if (nasty < 2 || this.rng.number(1 + nasty) === 0) {
              this.spreadExplosion(ptr.x + i, ptr.y, 1, BMT.firecracker2, nasty + 1);
            }
            if (nasty < 2 || this.rng.number(1 + nasty) === 0) {
              this.spreadExplosion(ptr.x, ptr.y + i, 1, BMT.firecracker2, nasty + 1);
            }
          }
          ptr.type = BMT.normal;
        }
        return true;
      case BMT.construction:
        if (ptr.count === 1) {
          const { x, y } = ptr;
          this.delExplosion(ptr);
          if (!this.checkPlayerNear(x, y)) {
            this.setMazeBlock(x, y, BT.Extra);
            this.setExtra(x, y, BT.Free);
          }
          return false;
        }
        return true;
      case BMT.threebombs:
        if (ptr.count === t) {
          this.spreadExplosion(ptr.x - 2, ptr.y, ptr.range, def, 0);
          this.spreadExplosion(ptr.x + 2, ptr.y, ptr.range, def, 0);
        }
        return true;
      case BMT.grenade:
        if (ptr.range > 0 && ptr.count === -1) {
          if (ptr.range === 1) {
            this.spreadExplosion(ptr.x - 1, ptr.y - 1, 0, BMT.blastnow, 0);
            this.spreadExplosion(ptr.x + 1, ptr.y - 1, 0, BMT.blastnow, 0);
            this.spreadExplosion(ptr.x - 1, ptr.y + 1, 0, BMT.blastnow, 0);
            this.spreadExplosion(ptr.x + 1, ptr.y + 1, 0, BMT.blastnow, 0);
          } else {
            for (let i = -(ptr.range - 1); i <= ptr.range - 1; i++) {
              for (let j = -(ptr.range - 1); j <= ptr.range - 1; j++) {
                this.spreadExplosion(ptr.x + i, ptr.y + j, 1, BMT.blastnow, 0);
              }
            }
          }
        }
        return true;
      case BMT.trianglebombs:
        if (ptr.count === t + 2) {
          const i = this.rng.number(2) * 4 - 2;
          const j = this.rng.number(2) * 4 - 2;
          this.spreadExplosion(ptr.x + i, ptr.y, ptr.range, BMT.normal, 0);
          this.spreadExplosion(ptr.x, ptr.y + j, ptr.range, BMT.normal, 0);
          ptr.type = BMT.normal;
        }
        return true;
      case BMT.destruction:
        if (ptr.count === 1) {
          const { x, y } = ptr;
          this.delExplosion(ptr);
          for (let i = -1; i <= 1; i++) {
            if (x + i < MAZE_W - 1 && this.checkMaze(x + i, y) && x + i > 0) this.setMazeBlock(x + i, y, BT.Free);
            if (y + i < MAZE_H - 1 && this.checkMaze(x, y + i) && y + i > 0) this.setMazeBlock(x, y + i, BT.Free);
          }
          return false;
        }
        return true;
      case BMT.fungus:
        if (ptr.count === idiv(t * 3, 5)) {
          const { x, y } = ptr;
          for (let i = -1; i <= 1; i++) {
            this.spreadExplosion(x + i, y, 1, BMT.fungus, 0);
            this.spreadExplosion(x, y + i, 1, BMT.fungus, 0);
          }
        }
        return true;
      case BMT.renovation:
        if (ptr.count === 1) {
          const { x, y } = ptr;
          this.moveBlockFromTo(x - 1, y, x - 2, y);
          this.moveBlockFromTo(x + 1, y, x + 2, y);
          this.moveBlockFromTo(x, y - 1, x, y - 2);
          this.moveBlockFromTo(x, y + 1, x, y + 2);
        }
        return true;
      case BMT.pyro:
      case BMT.pyro2:
        if (ptr.count === 1) {
          for (let k = 0; k < 5; k++) {
            const x = ptr.x + this.rng.number(3) - 1;
            const y = ptr.y + this.rng.number(3) - 1;
            if (!this.bombAt(x, y) && this.checkMazeFree(x, y)) {
              this.spreadExplosion(x, y, 1, BMT.pyro2, 0);
              break;
            }
          }
        }
        return true;
      case BMT.diagthreebombs:
        if (ptr.count === t) {
          ptr.type = BMT.normal;
          for (let i = 0; i <= 2; i++) this.spreadExplosion(ptr.x + i, ptr.y + i, ptr.range, BMT.normal, 0);
        }
        return true;
      case BMT.scissor:
        if (ptr.count === t) {
          this.spreadExplosion(ptr.x + 1, ptr.y + 1, ptr.range, BMT.normal, 0);
          this.spreadExplosion(ptr.x + 1, ptr.y - 1, ptr.range, BMT.normal, 0);
          this.spreadExplosion(ptr.x + 2, ptr.y + 2, ptr.range, BMT.normal, 0);
          this.spreadExplosion(ptr.x + 2, ptr.y - 2, ptr.range, BMT.normal, 0);
        }
        return true;
      case BMT.scissor2:
        if (ptr.count === t) {
          this.spreadExplosion(ptr.x - 1, ptr.y + 1, ptr.range, BMT.normal, 0);
          this.spreadExplosion(ptr.x - 1, ptr.y - 1, ptr.range, BMT.normal, 0);
          this.spreadExplosion(ptr.x - 2, ptr.y + 2, ptr.range, BMT.normal, 0);
          this.spreadExplosion(ptr.x - 2, ptr.y - 2, ptr.range, BMT.normal, 0);
          ptr.type = BMT.normal;
        }
        return true;
      case BMT.parallel:
        if (ptr.count === t) {
          for (let i = -2; i <= 2; i++) {
            this.spreadExplosion(ptr.x + 2 * i, ptr.y - i, idiv(ptr.range, abs(i) + 1), BMT.normal, 0);
          }
        }
        ptr.type = BMT.normal;
        return true;
      case BMT.distance:
        if (ptr.count === t) this.spreadExplosion(14 - ptr.x, 12 - ptr.y, ptr.range, BMT.normal, 0);
        ptr.type = BMT.normal;
        return true;
      case BMT.lucky:
        if (ptr.count === t) {
          const i = ptr.x + this.rng.number(6) + 1;
          const j = ptr.y + this.rng.number(5) + 1;
          this.spreadExplosion(i, j, ptr.range, def, 0);
        }
        ptr.type = BMT.normal;
        return true;
      case BMT.parasol:
        if (ptr.count === t) {
          this.spreadExplosion(ptr.x - 2, ptr.y - 1, ptr.range, BMT.normal, 0);
          this.spreadExplosion(ptr.x - 1, ptr.y - 2, ptr.range, BMT.normal, 0);
          this.spreadExplosion(ptr.x, ptr.y - 3, ptr.range, BMT.normal, 0);
          this.spreadExplosion(ptr.x + 1, ptr.y - 2, ptr.range, BMT.normal, 0);
          this.spreadExplosion(ptr.x + 2, ptr.y - 1, ptr.range, BMT.normal, 0);
        }
        ptr.type = BMT.normal;
        return true;
      case BMT.comb:
        if (ptr.count === t) {
          this.spreadExplosion(ptr.x - 2, ptr.y, ptr.range, BMT.normal, 0);
          this.spreadExplosion(ptr.x - 2, ptr.y - 2, ptr.range, BMT.normal, 0);
          this.spreadExplosion(ptr.x - 1, ptr.y, ptr.range, BMT.normal, 0);
          this.spreadExplosion(ptr.x, ptr.y - 2, ptr.range, BMT.normal, 0);
          this.spreadExplosion(ptr.x + 1, ptr.y, ptr.range, BMT.normal, 0);
          this.spreadExplosion(ptr.x + 2, ptr.y, ptr.range, BMT.normal, 0);
          this.spreadExplosion(ptr.x + 2, ptr.y - 2, ptr.range, BMT.normal, 0);
        }
        ptr.type = BMT.normal;
        return true;
      case BMT.farpyro:
        if (ptr.count === t) {
          this.spreadExplosion(ptr.x - 2, ptr.y - 2, ptr.range, BMT.pyro, 0);
          this.spreadExplosion(ptr.x + 2, ptr.y - 2, ptr.range, BMT.pyro, 0);
        }
        ptr.type = BMT.pyro;
        return true;
      case BMT.nuclear:
        if (ptr.count === t) {
          this.spreadExplosion(ptr.x + 1, ptr.y + 1, ptr.range + 15, BMT.grenade, 0);
          this.spreadExplosion(ptr.x - 1, ptr.y + 1, ptr.range + 15, BMT.grenade, 0);
          this.spreadExplosion(ptr.x + 1, ptr.y - 1, ptr.range + 15, BMT.grenade, 0);
          this.spreadExplosion(ptr.x - 1, ptr.y - 1, ptr.range + 15, BMT.grenade, 0);
        }
        ptr.type = BMT.grenade;
        return true;
      case BMT.protectbombs: {
        const { x, y } = ptr;
        this.delExplosion(ptr);
        if (x > 0 && this.checkMazeFree(x - 1, y)) {
          this.setMazeBlock(x - 1, y, BT.Extra);
          this.setExtra(x - 1, y, BT.Free);
        }
        if (x < MAZE_W - 1 && this.checkMazeFree(x + 1, y)) {
          this.setMazeBlock(x + 1, y, BT.Extra);
          this.setExtra(x + 1, y, BT.Free);
        }
        if (y > 0 && this.checkMazeFree(x, y - 1)) {
          this.setMazeBlock(x, y - 1, BT.Extra);
          this.setExtra(x, y - 1, BT.Free);
        }
        if (y < MAZE_H - 1 && this.checkMazeFree(x, y + 1)) {
          this.setMazeBlock(x, y + 1, BT.Extra);
          this.setExtra(x, y + 1, BT.Free);
        }
        ptr.type = BMT.normal;
        return false;
      }
      case BMT.ringofire: {
        const { x, y, count: c, range: r } = ptr;
        const at = (n: number) => idiv(t * n, 24);
        const ring: [number, number, number, number, boolean][] = [
          [24, 12, 1, -2, true],
          [23, 11, 0, -2, false],
          [22, 10, -1, -2, true],
          [21, 9, -2, -1, true],
          [20, 8, -2, 0, false],
          [19, 7, -2, 1, true],
          [18, 6, -1, 2, true],
          [17, 5, 0, 2, false],
          [16, 4, 1, 2, true],
          [15, 3, 2, 1, true],
          [14, 2, 2, 0, false],
          [13, 1, 2, -1, true],
        ];
        for (const [a, b, ox, oy, full] of ring) {
          if (c === at(a) || c === at(b)) this.spreadExplosion(x + ox, y + oy, full ? r : 0, BMT.blastnow, 0);
        }
        if (c === at(1)) {
          this.delExplosion(ptr);
          return false;
        }
        return true;
      }
      case BMT.mine: {
        const { x, y, count: c, range: r } = ptr;
        let goboom = 0;
        if (c >= idiv(t * 1, 3)) {
          // C loops over MAX_PLAYER entries of player_stat (zeroed beyond numPlayer)
          for (const p of this.players) {
            const gridx = idiv(p.x + (BLOCK_WIDTH >> 1), BLOCK_WIDTH);
            const gridy = idiv(p.y + (BLOCK_HEIGHT >> 1), BLOCK_HEIGHT) + 1;
            if (p.lives && abs(x - gridx) <= 1 && abs(y - gridy) <= 1) goboom++;
          }
        }
        if (c === -2 && goboom <= 0) ptr.count = -3;
        if (goboom > 0) {
          this.delExplosion(ptr);
          this.spreadExplosion(x, y, r, BMT.blastnow, 0);
          if (r > 2) {
            this.spreadExplosion(x - 1, y - 1, 0, BMT.blastnow, 0);
            this.spreadExplosion(x - 1, y + 1, 0, BMT.blastnow, 0);
            this.spreadExplosion(x + 1, y + 1, 0, BMT.blastnow, 0);
            this.spreadExplosion(x + 1, y - 1, 0, BMT.blastnow, 0);
          }
          return false;
        }
        return true;
      }
      case BMT.row:
      case BMT.column: {
        const p = ptr.player;
        if (p === null) return true;
        const vertical = p.d_ist === Dir.Up || p.d_ist === Dir.Down;
        const horizontal = p.d_ist === Dir.Left || p.d_ist === Dir.Right;
        if (ptr.count === t && (vertical || horizontal)) {
          const alongY = (ptr.type === BMT.row) === vertical;
          for (const d of [-3, -5, -7, -9, -11, -13, 3, 5, 7, 9, 11, 13]) {
            if (alongY) this.spreadExplosion(ptr.x, ptr.y + d, ptr.range, BMT.normal, 0);
            else this.spreadExplosion(ptr.x + d, ptr.y, ptr.range, BMT.normal, 0);
          }
        }
        ptr.type = BMT.normal;
        return true;
      }
      case BMT.psycho:
        if (ptr.count === t) {
          this.spreadExplosion(ptr.x - 3, ptr.y, ptr.range, BMT.normal, 0);
          this.spreadExplosion(ptr.x - 5, ptr.y, ptr.range, BMT.normal, 0);
          this.spreadExplosion(ptr.x + 3, ptr.y, ptr.range, BMT.normal, 0);
          this.spreadExplosion(ptr.x + 5, ptr.y, ptr.range, BMT.normal, 0);
        }
        ptr.type = BMT.normal;
        return true;
      case BMT.changedirectionathalf:
        // GAME_TIME is even: always true
        if (this.initialBombDir === Dir.Stop) this.initialBombDir = Dir.Down;
        if (this.initialBombDir === Dir.Up) this.initialBombDir = Dir.Down;
        else if (this.initialBombDir === Dir.Left) this.initialBombDir = Dir.Right;
        else if (this.initialBombDir === Dir.Down) this.initialBombDir = Dir.Up;
        else this.initialBombDir = Dir.Left;
        return true;
      default:
        return true;
    }
  }

  private newExplosion(
    player: Player | null,
    x: number,
    y: number,
    range: number,
    remoteControlled: boolean,
    malfunction: boolean,
    type: number,
    typeExtr: number,
    initialdir: Dir,
  ): boolean {
    if (this.bombAt(x, y) !== null) return false;
    const e: Explosion = {
      player,
      range: 0,
      x,
      y,
      dx: 0,
      dy: 0,
      dir: Dir.Stop,
      malfunction: malfunction ? 1 : 0,
      count: 0,
      countslower: 0,
      countslower2: 0,
      blink: 0,
      type: 0,
      typeExtr: 0,
      burnOut: 0,
      sprite: null,
      spriteMode: SPM.MAPPED,
      anime: 0,
      nextAnime: 0,
      isMorphed: player !== null ? player.morphed : 0,
      isSniping: 0,
      stop: 0,
      jump: 0,
      next: null,
    };
    this.setBombAt(x, y, e);
    this.numExpl++;
    if (this.exploList === null) this.exploList = e;
    else this.explEnd!.next = e;
    this.explEnd = e;
    if (player !== null) {
      e.isSniping = player.sniping;
      if (player.sniping) e.count = -GAME_TIME;
    }
    e.dir = initialdir === Dir.Default ? this.initialBombDir : initialdir;
    if (type === BMT.default) type = this.level.defaultBMT;
    else if (type === BMT.special) type = this.level.specialBMT;
    else if (type === BMT.evil) type = this.level.evilBMT;
    e.type = type;
    if (e.type === BMT.random) {
      e.type = [BMT.napalm, BMT.firecracker, BMT.grenade, BMT.fungus, BMT.pyro][this.rng.number(5)]!;
    }
    e.typeExtr = typeExtr;
    /* "nasty bombs" */
    if (type !== BMT.close) {
      switch (e.dir) {
        case Dir.Down:
          if (this.checkMazeFree(e.x, e.y + 1)) e.dy = BOMB_VY;
          break;
        case Dir.Up:
          if (this.checkMazeFree(e.x, e.y - 1)) e.dy = -BOMB_VY;
          break;
        case Dir.Left:
          if (this.checkMazeFree(e.x - 1, e.y)) e.dx = -BOMB_VX;
          break;
        case Dir.Right:
          if (this.checkMazeFree(e.x + 1, e.y)) e.dx = BOMB_VX;
          break;
        default:
          break;
      }
    }
    switch (type) {
      case BMT.firecracker:
      case BMT.fungus:
      case BMT.pyro:
        e.range = 1;
        break;
      case BMT.construction:
        e.range = 0;
        break;
      case BMT.grenade:
        e.range = idiv(range, 2);
        break;
      default:
        e.range = range;
    }
    const cbt = this.curBombTime;
    e.countslower = -cbt;
    const instant = type === BMT.blastnow || type === BMT.firecracker2 || type === BMT.pyro2;
    if (instant) {
      e.count = 0;
      e.countslower = 0;
    } else if (remoteControlled) {
      e.count = -GAME_TIME;
      e.anime = MAX_BOMB_ANIME - 2;
      e.nextAnime = 1;
    } else if (type === BMT.short) {
      e.count = -idiv(cbt, 4);
      e.anime = idiv(3 * MAX_BOMB_ANIME, 4);
      e.nextAnime = 1 + idiv(cbt, MAX_BOMB_ANIME - 1) - idiv(cbt, 4);
    } else if (e.isSniping !== 0) {
      e.count = -GAME_TIME;
    } else {
      e.count = -cbt;
      e.anime = 0;
      e.nextAnime = 1 + idiv(cbt, MAX_BOMB_ANIME - 1) - cbt;
    }
    e.blink = BOMB_TIME >> 1;
    if (instant) e.sprite = null;
    else if (range === 1 || type === BMT.firecracker || type === BMT.fungus || type === BMT.pyro) e.sprite = BB.MINI;
    else e.sprite = BB.NORMAL;
    return true;
  }

  private newPlayerBomb(ps: Player, type: number): boolean {
    return this.newExplosion(
      ps,
      idiv(ps.x + BLOCK_WIDTH / 2, BLOCK_WIDTH),
      idiv(ps.y + BLOCK_HEIGHT + BLOCK_HEIGHT / 2, BLOCK_HEIGHT),
      ps.illness === Ill.Mini ? 1 : ps.range,
      ps.remote_control > 0,
      ps.illness === Ill.Malfunction,
      type,
      0,
      Dir.Default,
    );
  }

  private stunPlayers(): void {
    const ps = this.players;
    for (let ptr = this.exploList; ptr !== null; ptr = ptr.next) {
      if (ptr.dir === Dir.Stop) continue;
      let clickFlags = 0;
      ps.forEach((p, player) => {
        // C: "-(daleifing == 0)", true when daleifing is 0
        if (
          p.invincible === 0 &&
          p.morphed === 0 &&
          p.daleifing === 0 &&
          abs(ptr!.x * BLOCK_WIDTH + ptr!.dx - p.x) < BOMB_STUN_X &&
          abs(ptr!.y * BLOCK_HEIGHT + ptr!.dy - p.y - BLOCK_HEIGHT) < BOMB_STUN_Y
        ) {
          clickFlags |= 1 << player;
        }
      });
      if (clickFlags) {
        ps.forEach((p, player) => {
          if (clickFlags & (1 << player) && p.stunned === 0) {
            p.stunned = STUN_TIME;
            this.sound("stun", p.x);
          }
        });
        this.bombClick(this.level.playerClick, ptr);
      }
    }
  }

  private checkBomb(x: number, y: number): boolean {
    const b = this.bombAt(x, y);
    return b !== null && b.count < 0;
  }

  get numberOfExplosions(): number {
    return this.numExpl;
  }

  private deleteBombAt(x: number, y: number): void {
    const b = this.bombAt(x, y);
    if (b !== null) this.delExplosion(b);
  }

  private moveBomb(x: number, y: number, dir: Dir): void {
    const ptr = this.bombAt(x, y);
    if (ptr !== null && ptr.dir === Dir.Stop) {
      ptr.dir = dir;
      if (dir === Dir.Up || dir === Dir.Down) ptr.dx = 0;
      else if (dir === Dir.Left || dir === Dir.Right) ptr.dy = 0;
    }
  }

  private checkDistribExpl(distExtra: number[], freeBlocks: number): number {
    for (let ptr = this.exploList; ptr !== null; ptr = ptr.next) {
      if (ptr.count < 0) continue;
      const ra = Math.min(ptr.range, ptr.count + 1);
      const clear = (x: number, y: number) => {
        if (distExtra[y]! & (1 << x)) freeBlocks--;
        distExtra[y]! &= ~(1 << x);
      };
      for (let x = ptr.x; x <= ptr.x + ra && x < MAZE_W; x++) clear(x, ptr.y);
      for (let x = ptr.x; x >= ptr.x - ra && x >= 0; x--) clear(x, ptr.y);
      for (let y = ptr.y; y <= ptr.y + ra && y < MAZE_H; y++) clear(ptr.x, y);
      for (let y = ptr.y; y >= ptr.y - ra && y >= 0; y--) clear(ptr.x, y);
    }
    return freeBlocks;
  }

  /** DoAir (push), DoSuck (pull), DoJump: bombs within 2 blocks of the player */
  private blowBombs(ps: Player, mode: "air" | "suck" | "jump"): void {
    for (let ptr = this.exploList; ptr !== null; ptr = ptr.next) {
      if (ptr.dir !== Dir.Stop) continue;
      const ex = ptr.x * BLOCK_WIDTH - ps.x;
      const ey = (ptr.y - 1) * BLOCK_HEIGHT - ps.y;
      if (!(abs(ex) < 2 * BLOCK_WIDTH && abs(ey) < 2 * BLOCK_HEIGHT && (ex !== 0 || ey !== 0))) continue;
      if (mode === "jump") ptr.jump = 7 * ps.jump_button;
      const sign = mode === "suck" ? -1 : 1;
      if (abs(ex) * BLOCK_HEIGHT >= abs(ey) * BLOCK_WIDTH) {
        if (ex * sign < 0) {
          ptr.dir = Dir.Left;
          if (mode === "air" && this.checkMaze(ptr.x - 1, ptr.y)) {
            if (ey < 0) ptr.dir = Dir.Up;
            else if (ey > 0) ptr.dir = Dir.Down;
          }
        } else {
          ptr.dir = Dir.Right;
          if (mode === "air" && this.checkMaze(ptr.x + 1, ptr.y)) {
            if (ey < 0) ptr.dir = Dir.Up;
            else if (ey > 0) ptr.dir = Dir.Down;
          }
        }
      } else if (ey * sign < 0) {
        ptr.dir = Dir.Up;
      } else {
        ptr.dir = Dir.Down;
      }
    }
  }

  private doNastyWalls(gameTime: number): void {
    if (gameTime < this.nextNasty) return;
    if (gameTime >= this.nextNasty + NASTY_INC) this.nextNasty += NASTY_INC * 2;
    if (this.rng.number(this.level.gentleNasty) >= gameTime) return;
    let x: number;
    let y: number;
    let dir: Dir;
    if (this.level.nastyCeil) {
      x = this.rng.number(MAZE_W - 2) + 1;
      y = this.rng.number(MAZE_H - 2) + 1;
      dir = Dir.Down;
      y = 1;
    } else {
      dir = (Dir.Up + this.rng.number(4)) as Dir;
      switch (dir) {
        case Dir.Up:
          x = this.rng.number(MAZE_W - 2) + 1;
          y = MAZE_H - 2;
          break;
        case Dir.Left:
          x = MAZE_W - 2;
          y = this.rng.number(MAZE_H - 2) + 1;
          break;
        case Dir.Down:
          x = this.rng.number(MAZE_W - 2) + 1;
          y = 1;
          break;
        case Dir.Right:
          x = 1;
          y = this.rng.number(MAZE_H - 2) + 1;
          break;
        default:
          return;
      }
    }
    this.newExplosion(null, x, y, this.level.rangeNasty, false, false, BMT.close, 0, dir);
  }

  /* ------------------------------------------------------------------ */
  /* shrink.c, scramble.c                                               */
  /* ------------------------------------------------------------------ */

  private configLevelShrink(): ShrinkStep[] {
    const G = GAME_TIME;
    const d = shrinkData;
    const generic = (
      data: readonly (readonly number[])[],
      xoff: readonly number[],
      start: number,
      end: number,
      inc: number,
      startTime: number,
      levelIncTime: number,
      offsetIncTime: number,
      flags: boolean,
      style: readonly (readonly number[])[],
    ): ShrinkStep[] => {
      const steps: ShrinkStep[] = [];
      const bigxoff = flags ? xoff[start]! : 0;
      for (const [stOffset, stLevel, block] of style) {
        for (const [x, y, offset, level] of data) {
          const reallevel = level! - stLevel!;
          if (
            !(
              (inc > 0 && reallevel >= start && reallevel <= end) ||
              (inc < 0 && reallevel <= start && reallevel >= end)
            )
          ) {
            continue;
          }
          let dellevel = reallevel - start;
          if (dellevel < 0 && inc < 0) dellevel = -dellevel;
          if (dellevel >= 0 && inc >= 0 && !(dellevel % inc)) {
            const levelstep = idiv(dellevel, inc);
            const xo = flags ? xoff[reallevel]! : 0;
            steps.push({
              time: startTime + levelstep * levelIncTime + (offset! + xo - bigxoff) * offsetIncTime + stOffset!,
              x: x!,
              y: y!,
              block: block!,
            });
          }
        }
      }
      steps.push({ time: GAME_TIME * 2, x: 0, y: 0, block: 0 });
      // qsort on time; glibc sorts with a merge sort (stable) for small arrays
      return steps.sort((a, b) => a.time - b.time);
    };
    const spiral = (s: number, e: number, t: number, speed: number, style: readonly (readonly number[])[]) =>
      generic(d.spiral_shri_data, d.spiral_xoff, s, e, 1, t, 0, speed, true, style);
    const compound = (s: number, e: number, t: number, speed: number, style: readonly (readonly number[])[]) =>
      generic(d.spiral_shri_data, d.spiral_xoff, s, e, 1, t, speed, 0, false, style);
    const fancyCompound = (s: number, e: number, t: number, speed: number, style: readonly (readonly number[])[]) =>
      generic(d.quad_shri_data, d.spiral_xoff, s, e, 1, t, speed, 2, false, style);
    switch (this.level.shrinkType) {
      case "void":
        return [{ time: 2 * GAME_TIME, x: 0, y: 0, block: 0 }];
      case "spiral":
        return spiral(1, 2, idiv(G, 2), 4, d.style_rise_2);
      case "speedSpiral":
        return spiral(1, 2, idiv(G, 2), 2, d.style_rise_2);
      case "spiralPlus":
        return spiral(0, 2, idiv(G, 2), 4, d.style_rise_2_plus);
      case "spiral3":
        return spiral(1, 3, idiv(G, 2), 4, d.style_rise_2);
      case "spiral23":
        return spiral(2, 3, idiv(G, 2), 2, d.style_rise_2_plus);
      case "spiralLego":
        return spiral(3, 3, idiv(3 * G, 4), 4, d.style_rise_2_plus);
      case "earlySpiral":
        return spiral(1, 2, idiv(3 * G, 8), 4, d.style_rise_2);
      case "compound":
        return compound(1, 5, idiv(G, 6), idiv(G, 6), d.style_compound);
      case "compoundF":
        return fancyCompound(1, 5, idiv(G, 6), idiv(G, 6), d.style_compound);
      case "compound2F":
        return fancyCompound(1, 2, idiv(G, 2), idiv(G, 6), d.style_compound);
      case "lazyCompoundF":
        return fancyCompound(1, 3, idiv(G, 3), idiv(G, 3), d.style_compound_solid);
      case "compoundSolid":
        return compound(1, 5, idiv(G, 6), idiv(G, 6), d.style_compound_solid);
      case "savageCompound":
        return compound(2, 5, idiv(G, 6), idiv(G, 3), d.style_savage_compound);
      case "compoundExtra":
        return compound(2, 5, idiv(G, 6), idiv(G, 6), d.style_compound_extra);
      case "down":
        return generic(
          d.vertical_shri_data,
          d.vertical_xoff,
          1,
          11,
          1,
          idiv(G, 11),
          idiv(G, 11),
          0,
          false,
          d.style_compound,
        );
      case "downF":
        return generic(
          d.vertical_shri_data,
          d.vertical_xoff,
          1,
          11,
          1,
          idiv(G, 11),
          idiv(G, 11),
          1,
          false,
          d.style_compound,
        );
      case "quad":
        return generic(d.quad_shri_data, d.quad_xoff, 1, 3, 1, idiv(G, 2), 0, 16, true, d.style_rise_2);
      case "constrictWave":
        return generic(d.quad_shri_data, d.quad_xoff, 1, 3, 1, idiv(G, 2), 5, 5, false, d.style_rise_2_plus);
      case "outwardSpiral":
        return generic(d.spiral_shri_data, d.spiral_xoff, 2, 5, 1, idiv(3 * G, 8), -100, -3, false, d.style_rise_2);
      case "horizontal":
        return generic(d.horiz_shri_data, d.horiz_xoff, 1, 5, 1, idiv(G, 8), 0, 20, true, d.style_rise_2);
      case "circle":
        return generic(d.circle_data, d.circle_xoff, 0, 4, 1, idiv(G, 8), 0, 20, true, d.style_rise_2);
      case "move":
        return generic(d.move_data, d.move_xoff, 0, 119, 1, 1, 0, 34, true, d.style_move);
      case "istySpiral":
        return spiral(1, 3, idiv(G, 12), 5, d.style_rise_2);
      case "istyCompound2F":
        return fancyCompound(2, 5, idiv(G, 2), idiv(G, 4), d.style_compound);
      case "diag":
        return generic(d.diag_shri_data, d.diag_xoff, 1, 23, 1, idiv(G, 23), idiv(G, 23), 0, true, d.style_rise_2);
      case "outwardExtra":
        return compound(1, 3, idiv(G, 2), -idiv(G, 6), d.style_outward_compound_extra);
      case "spiral5":
        return spiral(1, 5, idiv(G, 4), 5, d.style_rise_2);
    }
  }

  /** time of the next shrink block, for the "warning" display */
  get nextShrinkTime(): number {
    return this.shrinkSteps[this.shrinkIndex]!.time;
  }

  private doShrink(gTime: number): void {
    if (gTime === this.shrinkSteps[this.shrinkIndex]!.time - 55) this.sound("warn", PIXW / 2);
    let played = false;
    while (gTime === this.shrinkSteps[this.shrinkIndex]!.time) {
      const s = this.shrinkSteps[this.shrinkIndex]!;
      this.setMazeBlock(s.x, s.y, s.block);
      if (!played) {
        this.sound("spiral", s.x * BLOCK_WIDTH);
        played = true;
      }
      if (s.block === BT.Void || s.block === BT.Block || s.block === BT.Extra) {
        this.killPlayerAtGhost(s.block, s.x, s.y);
        this.deleteBombAt(s.x, s.y);
      }
      this.shrinkIndex++;
    }
  }

  private doScramble(gameTime: number): void {
    const { scrambleDraw: draw, scrambleDel: del } = this.level;
    if (gameTime === draw.time - 4) this.doSingleScramble(draw.row, BT.BlockRise);
    else if (gameTime === draw.time) this.doSingleScramble(draw.row, BT.Block);
    if (gameTime === del.time) this.doSingleScramble(del.row, BT.Free);
  }

  private doSingleScramble(rows: number[], block: number): void {
    for (let y = 0; y < MAZE_H; y++) {
      if (rows[y] === 0) continue;
      for (let x = 0; x < MAZE_W; x++) {
        if (rows[y]! & (1 << x)) {
          this.setMazeBlock(x, y, block);
          if (block !== BT.Free) this.killPlayerAt(x, y);
          if (block === BT.BlockRise) this.sound("spiral", x * BLOCK_WIDTH);
        }
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* player.c                                                           */
  /* ------------------------------------------------------------------ */

  private configLevelPlayers(): void {
    const level = this.level;
    const k = Math.min(level.positions.length, level.playersAllowed);
    const pl: number[] = [];
    this.players.forEach((p, i) => {
      if (!p.in_active) pl.push(i);
    });
    const numActive = pl.length;
    for (let i = numActive - 1; i > 0; i--) {
      let j = this.rng.number(i + 1);
      j = j >= 0 ? j : 0;
      j = j >= i + 1 ? i : j;
      [pl[j], pl[i]] = [pl[i]!, pl[j]!];
    }
    const pos0Shuffle = level.positions.map((_, i) => i);
    for (let i = k - 1; i > 0; i--) {
      let j = this.rng.number(i + 1);
      j = j >= 0 ? j : 0;
      j = j >= i + 1 ? i : j;
      [pos0Shuffle[j], pos0Shuffle[i]] = [pos0Shuffle[i]!, pos0Shuffle[j]!];
    }
    const pos: { x: number; y: number }[] = [];
    for (let i = 0; i < numActive; i++) {
      if (i < k) pos[pl[i]!] = level.positions[pos0Shuffle[i]!]!;
      else {
        let j = this.rng.number(k);
        j = j >= 0 ? j : 0;
        j = j >= k ? k - 1 : j;
        pos[pl[i]!] = level.positions[j]!;
      }
    }
    this.players.forEach((ps, i) => {
      if (ps.in_active) {
        ps.x = 0;
        ps.y = i * BLOCK_HEIGHT;
        ps.spriteMode = SPM.UNMAPPED;
      } else {
        ps.x = pos[i]!.x * BLOCK_WIDTH;
        ps.y = (pos[i]!.y - 1) * BLOCK_HEIGHT;
      }
    });
    for (const ps of this.players) {
      ps.iniextra_flags = level.initFlags;
      ps.revextra_flags = level.revFlags;
      const f = (ps.iniextra_flags & (0xffffff >> 2)) >>> 0;
      ps.kick = LF.Kick & ps.iniextra_flags ? 1 : 0;
      ps.invincible = NEW_INVINCIBLE;
      ps.illness = level.initHealth;
      ps.health = level.initHealth;
      ps.illtime = 0;
      ps.junkie = 0;
      ps.ghost = 0;
      ps.dying = 0;
      ps.stunned = 0;
      if (this.ifRecLives && level.recLives) ps.lives = ps.in_active ? 0 : level.recLives;
      else ps.lives = ps.in_active ? 0 : this.maxLives;
      ps.range = level.minRange;
      ps.bombs = level.minBombs;
      ps.special_bombs = level.specialBombs;
      ps.jump_button = f === LF.Jump ? 1 : 0;
      ps.remote_control = f === LF.RC ? 1 : 0;
      ps.teleport = f === LF.Teleport ? 1 : 0;
      ps.air_button = f === LF.Airpump ? 1 : 0;
      ps.cloaking = f === LF.Cloak ? -GAME_TIME : 0;
      ps.stop = f === LF.Stop ? 1 : 0;
      ps.phantom = f === LF.Phantom ? GAME_TIME : 0;
      ps.electrify = f === LF.Electrify ? EXTRA_ELECTRIFY_COUNT : 0;
      ps.revive = f === LF.Revive ? 1 : 0;
      ps.suck_button = f === LF.Suck ? 1 : 0;
      ps.num_extras = f === LF.Snipe ? 1000 : f === LF.Morph ? 1000 : 0;
      ps.speed = 0;
      ps.daleif = f === LF.Daleif ? 1 : 0;
      ps.farted = f === LF.Fart ? 1 : 0;
      ps.bfarter = f === LF.Bfart ? 1 : 0;
      ps.num_snipe = f === LF.Snipe ? 1000 : 0;
      ps.num_morph = f === LF.Morph ? 1000 : 0;
      ps.daleifing = 0;
      ps.abort = Abort.None;
      ps.d_ist = Dir.Stop;
      ps.d_soll = Dir.Stop;
      ps.d_look = Dir.Down;
      ps.morphed = 0;
      ps.through = f === LF.Through ? 1 : 0;
      ps.throughCount = ps.through ? 255 : 0;
      ps.evilill = 0;
      ps.sniping = 0;
      ps.frogger = f === LF.Frogger ? 1 : 0;
      ps.choice_bomb_type = f === LF.Choice ? this.firstChoiceBomb(this.choiceDefaultBomb) : NUM_BMT;
    }
  }

  private firstChoiceBomb(from: number): number {
    let h = from;
    while (bombNameChoice[h] === null || bombNameChoice[h] === undefined) h = (h + 1) % NUM_BMT;
    return h;
  }

  private dropBomb(ps: Player, type: number): void {
    if (
      ps.bombs !== 0 &&
      ps.sniping !== 1 &&
      ps.illness !== Ill.Empty &&
      ps.morphed < 2 &&
      (type === BMT.default || ps.special_bombs > 0 || ps.choice_bomb_type !== NUM_BMT) &&
      ps.lives > 0
    ) {
      if (ps.choice_bomb_type !== NUM_BMT) type = ps.choice_bomb_type;
      if (this.newPlayerBomb(ps, type)) {
        this.sound("drop", ps.x);
        ps.bombs--;
        if (ps.morphed) {
          ps.morphed = 2;
          ps.num_morph--;
        }
        if (ps.sniping) ps.num_snipe--;
        if (type !== BMT.default && ps.choice_bomb_type === NUM_BMT) ps.special_bombs--;
      } else if (ps.morphed) {
        ps.morphed = 0;
      }
    }
  }

  /** sprite animation of a walking or standing player (Walk* of player.c) */
  private walkAnime(ps: Player, dir: Dir, phase: number | null): void {
    const base = { [Dir.Down]: 0, [Dir.Up]: 5, [Dir.Right]: 10, [Dir.Left]: 15 } as Record<number, number>;
    let shown = dir;
    if (ps.illness === Ill.Reverse) shown = turnOpposite[dir]!;
    else if (ps.illness === Ill.Reverse2) {
      shown = ([Dir.Stop, Dir.Left, Dir.Down, Dir.Right, Dir.Up] as Dir[])[dir]!;
    }
    const b = base[shown];
    if (b === undefined) return;
    ps.anime = phase === null ? b : b + 1 + phase;
  }

  private walkStop(ps: Player): void {
    this.walkAnime(ps, ps.d_look, null);
  }

  private walkUp(ps: Player, flag: boolean, mazex: number, mazey: number): void {
    if (
      !(flag && this.checkMazeGhost(ps.ghost, mazex, mazey - 1)) ||
      (!(ps.phantom ? this.checkMazePhantomWall(mazex, mazey - 1) : this.checkMaze(mazex, mazey - 1)) && mazey > 1)
    ) {
      ps.y -= STEP_VERT;
      if (ps.y < 0) ps.y = PIXH - BLOCK_HEIGHT * 2;
      mazey = idiv(ps.y, BLOCK_HEIGHT) + 1;
      this.walkAnime(ps, Dir.Up, idiv(ps.y, STEP_VERT) % 4);
    } else {
      ps.d_ist = Dir.Stop;
      this.walkAnime(ps, Dir.Up, null);
    }
    if (this.checkBomb(mazex, mazey) && ps.y % BLOCK_HEIGHT === STEP_VERT * BOMB_STEP && !ps.through) {
      if (ps.kick) {
        this.sound("kick", ps.x);
        if ((ps.daleif & this.rng.number(2)) === 0) this.moveBomb(mazex, mazey, Dir.Up);
        else {
          ps.daleifing = DALEIF_TIME;
          this.moveBomb(mazex, mazey, Dir.Down);
        }
        ps.d_soll = Dir.Stop;
      }
      ps.y += STEP_VERT;
      ps.y = (ps.y + PIXH) % PIXH;
    }
  }

  private walkLeft(ps: Player, flag: boolean, mazex: number, mazey: number): void {
    if (
      !(flag && this.checkMazeGhost(ps.ghost, mazex - 1, mazey)) ||
      (!(ps.phantom ? this.checkMazePhantomWall(mazex - 1, mazey) : this.checkMaze(mazex - 1, mazey)) && mazex > 1)
    ) {
      ps.x -= STEP_HORI;
      if (ps.x < 0) ps.x = PIXW;
      mazex = idiv(ps.x, BLOCK_WIDTH);
      this.walkAnime(ps, Dir.Left, idiv(ps.x, STEP_HORI) % 4);
    } else {
      ps.d_ist = Dir.Stop;
      this.walkAnime(ps, Dir.Left, null);
    }
    if (this.checkBomb(mazex, mazey) && ps.x % BLOCK_WIDTH === STEP_HORI * BOMB_STEP && !ps.through) {
      if (ps.kick) {
        this.sound("kick", ps.x);
        if ((ps.daleif & this.rng.number(2)) === 0) this.moveBomb(mazex, mazey, Dir.Left);
        else {
          ps.daleifing = DALEIF_TIME;
          this.moveBomb(mazex, mazey, Dir.Right);
        }
        ps.d_soll = Dir.Stop;
      }
      ps.x += STEP_HORI;
    }
  }

  private walkDown(ps: Player, flag: boolean, mazex: number, mazey: number): void {
    if (
      !(flag && this.checkMazeGhost(ps.ghost, mazex, mazey + 1)) ||
      (!(ps.phantom ? this.checkMazePhantomWall(mazex, mazey + 1) : this.checkMaze(mazex, mazey + 1)) &&
        mazey < MAZE_H - 2)
    ) {
      ps.y += STEP_VERT;
      if (ps.y >= PIXH - BLOCK_HEIGHT * 2) ps.y = 0;
      mazey = idiv(ps.y, BLOCK_HEIGHT) + 1;
      this.walkAnime(ps, Dir.Down, idiv(ps.y, STEP_VERT) % 4);
    } else {
      ps.d_ist = Dir.Stop;
      this.walkAnime(ps, Dir.Down, null);
    }
    if (
      this.checkBomb(mazex, mazey + 1) &&
      ps.y % BLOCK_HEIGHT === BLOCK_HEIGHT - STEP_VERT * BOMB_STEP &&
      !ps.through
    ) {
      if (ps.kick) {
        this.sound("kick", ps.x);
        if ((ps.daleif & this.rng.number(2)) === 0) this.moveBomb(mazex, mazey + 1, Dir.Down);
        else {
          ps.daleifing = DALEIF_TIME;
          this.moveBomb(mazex, mazey + 1, Dir.Up);
        }
        ps.d_soll = Dir.Stop;
      }
      ps.y -= STEP_VERT;
    }
  }

  private walkRight(ps: Player, flag: boolean, mazex: number, mazey: number): void {
    if (
      !(flag && this.checkMazeGhost(ps.ghost, mazex + 1, mazey)) ||
      (!(ps.phantom ? this.checkMazePhantomWall(mazex + 1, mazey) : this.checkMaze(mazex + 1, mazey)) &&
        mazex < MAZE_W - 2)
    ) {
      ps.x += STEP_HORI;
      if (ps.x >= PIXW - BLOCK_WIDTH) ps.x = 0;
      mazex = idiv(ps.x, BLOCK_WIDTH);
      this.walkAnime(ps, Dir.Right, idiv(ps.x, STEP_HORI) % 4);
    } else {
      ps.d_ist = Dir.Stop;
      this.walkAnime(ps, Dir.Right, null);
    }
    if (this.checkBomb(mazex + 1, mazey) && ps.x % BLOCK_WIDTH === BLOCK_WIDTH - STEP_HORI * BOMB_STEP && !ps.through) {
      if (ps.kick) {
        this.sound("kick", ps.x);
        if ((ps.daleif & this.rng.number(2)) === 0) this.moveBomb(mazex + 1, mazey, Dir.Right);
        else {
          ps.daleifing = DALEIF_TIME;
          this.moveBomb(mazex + 1, mazey, Dir.Left);
        }
        ps.d_soll = Dir.Stop;
      }
      ps.x -= STEP_HORI;
    }
  }

  private teleportPlayer(ps: Player, mazeX: number, mazeY: number): boolean {
    const fs: number[] = [];
    for (let i = 0; i < MAZE_W; i++) {
      for (let j = 0; j < MAZE_H; j++) {
        if (!this.checkMaze(i, j)) fs.push(i + j * MAZE_W);
      }
    }
    if (fs.length > 0) {
      const i = fs[this.rng.number(fs.length)]!;
      const newMazeX = i % MAZE_W;
      const newMazeY = idiv(i, MAZE_W);
      const free = ps.phantom ? !this.checkMazePhantomWall(newMazeX, newMazeY) : !this.checkMaze(newMazeX, newMazeY);
      if (free && (mazeX !== newMazeX || mazeY !== newMazeY)) {
        this.sound("tele", ps.x);
        ps.x = newMazeX * BLOCK_WIDTH;
        ps.y = (newMazeY - 1) * BLOCK_HEIGHT;
        ps.d_soll = Dir.Stop;
        ps.d_look = Dir.Down;
        return true;
      }
    }
    return false;
  }

  private doWalk(ps: Player, gameTime: number): void {
    if (ps.illness !== Ill.Slow || gameTime % 2 === 0) {
      // the bound is evaluated at each step, like the C loop: catching "run" walks twice at once
      for (let i = 0; i <= (ps.illness === Ill.Run ? 1 : 0) * (ps.speed === 0 ? 1 : ps.speed); i++) {
        let flag = false;
        const mazeX = idiv(ps.x, BLOCK_WIDTH);
        const mazeY = idiv(ps.y, BLOCK_HEIGHT) + 1;
        if (ps.x % BLOCK_WIDTH === 0 && ps.y % BLOCK_HEIGHT === 0) {
          flag = true;
          if (ps.teleport === TELEPORT_TIME && this.teleportPlayer(ps, mazeX, mazeY)) ps.teleport--;
          ps.d_ist = ps.d_soll;
          if (ps.d_ist !== Dir.Stop) ps.d_look = ps.d_ist;
        }
        if (ps.illness === Ill.Teleport && this.rng.number(32) === 0) {
          this.teleportPlayer(ps, mazeX, mazeY);
          ps.d_ist = Dir.Stop;
          ps.d_soll = Dir.Stop;
        }
        if (ps.sniping !== 1) {
          switch (ps.d_ist) {
            case Dir.Stop:
              this.walkStop(ps);
              break;
            case Dir.Left:
              this.walkLeft(ps, flag, mazeX, mazeY);
              break;
            case Dir.Right:
              this.walkRight(ps, flag, mazeX, mazeY);
              break;
            case Dir.Down:
              this.walkDown(ps, flag, mazeX, mazeY);
              break;
            case Dir.Up:
              this.walkUp(ps, flag, mazeX, mazeY);
              break;
            default:
              break;
          }
        }
        if (ps.x % BLOCK_WIDTH === 0 && ps.y % BLOCK_HEIGHT === 0) {
          switch (this.getExtra(ps.invincible, idiv(ps.x, BLOCK_WIDTH), idiv(ps.y, BLOCK_HEIGHT) + 1)) {
            case BT.Bomb:
              this.sound("newbomb", ps.x);
              ps.bombs++;
              break;
            case BT.Range:
              this.sound("morefire", ps.x);
              if (ps.range < MAX_RANGE) ps.range++;
              break;
            case BT.Sick:
              ps.illtime = ILLTIME;
              ps.illness = (this.rng.number(MAX_ILL) + 1) as Ill;
              this.sound(ps.illness === Ill.Invisible ? "invis" : "bad", ps.x);
              if (ps.illness === Ill.Reverse) {
                if (ps.d_ist >= Dir.Up && ps.d_ist <= Dir.Right) ps.d_ist = turnOpposite[ps.d_ist]!;
              }
              if (ps.illness === Ill.Reverse2) {
                const r2: Dir[] = [Dir.Stop, Dir.Right, Dir.Up, Dir.Left, Dir.Down, Dir.Default];
                ps.d_ist = r2[ps.d_ist]!;
              }
              break;
            case BT.Special:
              ps.num_extras++;
              this.specialExtra(ps);
              break;
          }
        }
      }
    }
    if (ps.phantom > 0) ps.phantom--;
    if (ps.through) ps.through--;
    if (ps.ghost) {
      ps.ghost--;
      if (ps.ghost === 0 && ps.lives > 0) {
        if (this.checkMaze(idiv(ps.x, BLOCK_WIDTH), idiv(ps.y, BLOCK_HEIGHT) + 1)) {
          ps.lives = 1;
          ps.dying = DEAD_TIME;
        }
      }
    }
    if (ps.laola) {
      ps.anime = [Anime.Winner3, Anime.Winner2, Anime.Winner, Anime.Winner, Anime.Winner2, Anime.Winner3][
        ps.laola - 1
      ]!;
      ps.laola--;
    } else if (ps.looser) {
      const L = [Anime.Looser, Anime.Looser1, Anime.Looser2] as const;
      ps.anime = [L[0], L[0], L[1], L[1], L[0], L[0], L[0], L[2], L[2], L[0]][ps.looser - 1]!;
      ps.looser--;
    }
    if (ps.invincible > 0) ps.invincible--;
    else if (ps.teleport > 1) ps.teleport--;
    /* sprite display mode */
    let spm: number;
    if (ps.in_active) spm = SPM.UNMAPPED;
    else if (ps.illness !== Ill.Invisible) {
      spm = SPM.MAPPED;
      if (ps.cloaking < 0) {
        ps.cloaking++;
        spm = ps.cloaking & 0x01 ? ps.disp : SPM.UNMAPPED;
      }
      if (ps.ghost < 64 && ps.ghost && ps.ghost & 0x01) spm |= SPM.MASKED;
      if (ps.invincible > 0) {
        if (ps.invincible & 0x01) spm |= SPM.MASKED;
      } else if (ps.teleport > 1 && (ps.teleport >> 1) & 0x01) {
        spm |= SPM.MASKED;
      }
    } else {
      spm = SPM.UNMAPPED;
    }
    ps.spriteMode = spm;
    if (ps.illness !== ps.health) {
      if (ps.illtime-- === 0) ps.illness = ps.health;
    }
    if (ps.x % BLOCK_WIDTH === 0 && ps.y % BLOCK_HEIGHT === 0 && ps.illness === Ill.Bomb) {
      if (this.rng.number(4) !== 0) {
        this.dropBomb(ps, ps.choice_bomb_type !== NUM_BMT ? ps.choice_bomb_type : BMT.default);
      }
    }
  }

  private doMorph(ps: Player): void {
    ps.anime = Anime.Morphed;
    ps.spriteMode = ps.morphed === 2 ? SPM.MAPPED : SPM.UNMAPPED;
    if (ps.d_soll !== Dir.Stop) {
      this.moveBomb(idiv(ps.x, BLOCK_WIDTH), idiv(ps.y, BLOCK_HEIGHT) + 1, ps.d_soll);
      ps.d_soll = Dir.Stop;
    }
  }

  private maxJunkieTime(): number {
    return 384 + this.rng.number(31);
  }

  private doJunkie(): void {
    for (const ps of this.players) {
      if (!(ps.lives && ps.junkie)) continue;
      switch (--ps.junkie) {
        case JUNKIE_TIME_1:
        case JUNKIE_TIME_2:
          ps.illtime = JUNKIE_ILL_TIME;
          ps.illness = (this.rng.number(MAX_ILL) + 1) as Ill;
          break;
        case JUNKIE_TIME_3:
          ps.stunned += JUNKIE_STUN_TIME;
          ps.illtime = JUNKIE_ILL_TIME;
          ps.illness = Ill.Run;
          break;
        case 0:
          ps.dying = DEAD_TIME;
          ps.junkie = this.maxJunkieTime();
          break;
      }
    }
  }

  private electrifyOtherPlayers(nplayer: number): boolean {
    let count = 0;
    const me = this.players[nplayer]!;
    this.players.forEach((p, player) => {
      if (
        nplayer !== player &&
        p.lives &&
        abs(p.x - me.x) < idiv(BLOCK_WIDTH * 3, 4) &&
        abs(p.y - me.y) < idiv(BLOCK_HEIGHT * 3, 4)
      ) {
        p.dying = DEAD_TIME;
        p.electrify = 0;
        count++;
      }
    });
    return count > 0;
  }

  private infectOtherPlayers(): void {
    const ps = this.players;
    for (let a = 0; a < ps.length; a++) {
      const ps1 = ps[a]!;
      for (let b = a + 1; b < ps.length; b++) {
        const ps2 = ps[b]!;
        if (!(abs(ps1.x - ps2.x) < ILL_X && abs(ps1.y - ps2.y) < ILL_Y)) continue;
        if (ps1.lives && ps2.lives) {
          if (ps1.evilill && !ps2.invincible) {
            this.evilGrailInfects(ps1, ps2);
          } else if (ps2.evilill && !ps1.invincible) {
            this.evilGrailInfects(ps2, ps1);
          }
          if (ps1.illness !== ps2.illness) {
            if (!ps2.invincible && ps1.illtime > ps2.illtime) {
              ps2.illness = ps1.illness;
              ps2.illtime = ILLTIME;
            } else if (!ps1.invincible && ps2.illtime > ps1.illtime) {
              ps1.illness = ps2.illness;
              ps1.illtime = ILLTIME;
            }
          }
          if ((ps2.junkie && !ps1.invincible) || ps1.junkie) ps1.junkie = this.maxJunkieTime();
          if ((ps1.junkie && !ps2.invincible) || ps2.junkie) ps2.junkie = this.maxJunkieTime();
        } else {
          if (ps2.lives && ps1.revive) {
            if (!ps.some((p) => p.team === ps1.team && p.lives !== 0)) this.numActive++;
            ps1.lives = 1;
            ps1.revive--;
          }
          if (ps1.lives && ps2.revive) {
            if (!ps.some((p) => p.team === ps2.team && p.lives !== 0)) this.numActive++;
            ps2.lives = 1;
            ps2.revive--;
          }
        }
      }
    }
  }

  private evilGrailInfects(from: Player, to: Player): void {
    from.illtime = from.evilill = 0;
    from.illness = from.health = Ill.Run;
    from.kick = 1;
    from.invincible += BONUSEVIL;
    from.phantom += BONUSEVIL;
    if (from.cloaking > 0) from.cloaking = -(from.cloaking + BONUSEVIL);
    else from.cloaking -= BONUSEVIL;
    from.revive += 1;
    to.evilill = ILLDEATHTIME;
  }

  /** HaveAGloat: only draws random numbers (the message is not shown) */
  private haveAGloat(player: number): void {
    for (let g = 0; g < 6; g++) {
      const gloatpl = this.rng.number(this.players.length);
      if (gloatpl !== player && this.players[gloatpl]!.lives > 0) break;
    }
  }

  private killPlayerAtGhost(block: number, x: number, y: number): void {
    for (const ps of this.players) {
      if ((!ps.ghost || block === BT.Void) && ps.lives > 0 && this.isAt(ps, x, y)) {
        ps.lives = 1;
        ps.dying = DEAD_TIME;
      }
    }
  }

  private killPlayerAt(x: number, y: number): void {
    for (const ps of this.players) {
      if (!ps.ghost && ps.lives > 0 && this.isAt(ps, x, y)) {
        ps.lives = 1;
        ps.dying = DEAD_TIME;
      }
    }
  }

  private isAt(ps: Player, x: number, y: number): boolean {
    return (
      ps.x < (x + 1) * BLOCK_WIDTH &&
      ps.x > (x - 1) * BLOCK_WIDTH &&
      ps.y < y * BLOCK_HEIGHT &&
      ps.y > (y - 2) * BLOCK_HEIGHT
    );
  }

  private killOtherPlayers(team: number): number {
    let count = 0;
    for (const p of this.players) {
      if (p.team !== team && p.lives > 0) {
        p.dying = DEAD_TIME;
        count++;
      }
    }
    return count;
  }

  private stunOtherPlayers(team: number, time: number): number {
    let count = 0;
    for (const p of this.players) {
      // C: "!invincible > 0", true when invincible is 0
      if (p.team !== team && !p.invincible) {
        this.sound("stun", p.x);
        p.stunned = time;
        count++;
      }
    }
    return count;
  }

  private fartOnOtherPlayers(ps: Player): boolean {
    let count = 0;
    if (ps.stunned || ps.smelly) return false;
    ps.smelly = SMELLY_TIME;
    for (const ps1 of this.players) {
      if (
        ps1.lives === 0 ||
        ps1.invincible ||
        (ps.x === ps1.x && ps.y === ps1.y) ||
        abs(ps1.x - ps.x) >= BLOCK_WIDTH * 2 ||
        abs(ps1.y - ps.y) >= BLOCK_HEIGHT * 2
      ) {
        continue;
      }
      ps1.farted = 20;
      const ex = (ps1.x - ps.x) * BLOCK_HEIGHT;
      const ey = (ps1.y - ps.y) * BLOCK_WIDTH;
      switch (ps1.d_ist) {
        case Dir.Stop:
          if (abs(ex) >= abs(ey)) ps1.d_soll = ex < 0 ? Dir.Left : Dir.Right;
          else ps1.d_soll = ey < 0 ? Dir.Up : Dir.Down;
          break;
        case Dir.Right:
        case Dir.Left:
          ps1.d_soll = ex < 0 ? Dir.Left : Dir.Right;
          break;
        case Dir.Up:
        case Dir.Down:
          ps1.d_soll = ey < 0 ? Dir.Up : Dir.Down;
          break;
        default:
          break;
      }
      ps1.illness = Ill.Run;
      ps1.illtime = 20;
      ps1.stunned = 20;
      count++;
    }
    return count > 0;
  }

  private swapColorOtherPlayers(team: number): void {
    const ps = this.players;
    if (ps.length === 2) {
      [ps[0]!.look, ps[1]!.look] = [ps[1]!.look, ps[0]!.look];
      return;
    }
    const d = ps.filter((p) => p.team !== team && p.lives);
    if (d.length > 2) {
      const rr = d[0]!.look;
      for (let i = 0; i < d.length - 1; i++) d[i]!.look = d[i + 1]!.look;
      d[d.length - 1]!.look = rr;
    } else if (d.length === 2) {
      [d[0]!.look, d[1]!.look] = [d[1]!.look, d[0]!.look];
    }
  }

  private stealBombsOtherPlayers(team: number): number {
    let count = 0;
    for (const p of this.players) {
      if (p.team !== team && p.bombs > 0) {
        p.bombs--;
        count++;
      }
    }
    return count;
  }

  private stealRangeOtherPlayers(team: number): number {
    let count = 0;
    for (const p of this.players) {
      if (p.team !== team && p.range > 1) {
        p.range--;
        count++;
      }
    }
    return count;
  }

  private swapPositionOtherPlayers(team: number): void {
    const ps = this.players;
    let x = 0;
    let y = 0;
    let first = -1;
    let count = 0;
    ps.forEach((p, player) => {
      if (p.team === team) return;
      count++;
      if (!p.lives) return;
      if (first > -1) {
        ps[first]!.x = idiv(p.x, BLOCK_WIDTH) * BLOCK_WIDTH;
        ps[first]!.y = idiv(p.y, BLOCK_HEIGHT) * BLOCK_HEIGHT;
        first = player;
      } else {
        first = player;
        x = idiv(p.x, BLOCK_WIDTH) * BLOCK_WIDTH;
        y = idiv(p.y, BLOCK_HEIGHT) * BLOCK_HEIGHT;
      }
    });
    if (count > 1 && first > -1) {
      ps[first]!.x = x;
      ps[first]!.y = y;
    }
    if (ps.length === 2) {
      x = idiv(ps[0]!.x, BLOCK_WIDTH) * BLOCK_WIDTH;
      y = idiv(ps[0]!.y, BLOCK_HEIGHT) * BLOCK_HEIGHT;
      ps[0]!.x = idiv(ps[1]!.x, BLOCK_WIDTH) * BLOCK_WIDTH;
      ps[0]!.y = idiv(ps[1]!.y, BLOCK_HEIGHT) * BLOCK_HEIGHT;
      ps[1]!.x = x;
      ps[1]!.y = y;
    }
  }

  private doFrog(ps: Player): void {
    let frogs = ps.frogger;
    let ex: number;
    let ey: number;
    // C: "!ps->d_ist == GoStop", true when the player is already moving
    if (ps.d_ist !== Dir.Stop) {
      ex = ps.x % BLOCK_WIDTH;
      ey = ps.y % BLOCK_HEIGHT;
      switch (ps.d_ist) {
        case Dir.Down:
        case Dir.Up:
          ps.y -= ey + ((ps.d_ist === Dir.Up ? 1 : 0) - 1) * BLOCK_HEIGHT;
          break;
        case Dir.Right:
        case Dir.Left:
          ps.x -= ex + ((ps.d_ist === Dir.Left ? 1 : 0) - 1) * BLOCK_WIDTH;
          break;
        default:
          break;
      }
      frogs--;
    }
    ex = 0;
    ey = 0;
    switch (ps.d_look) {
      case Dir.Down:
        ey = 1;
        break;
      case Dir.Up:
        ey = -1;
        break;
      case Dir.Right:
        ex = 1;
        break;
      case Dir.Left:
        ex = -1;
        break;
      default:
        break;
    }
    ps.x += ex * BLOCK_WIDTH * frogs;
    ps.y += ey * BLOCK_HEIGHT * frogs;
    ps.x = Math.max(0, Math.min(14 * BLOCK_WIDTH, ps.x));
    ps.y = Math.max(-BLOCK_HEIGHT, Math.min(11 * BLOCK_HEIGHT, ps.y));
    if (this.checkMaze(idiv(ps.x, BLOCK_WIDTH), idiv(ps.y, BLOCK_HEIGHT) + 1)) {
      ps.lives = 1;
      ps.dying = DEAD_TIME;
    }
    ps.d_soll = Dir.Stop;
  }

  private revivePlayer(ps: Player): void {
    const level = this.level;
    ps.lives--;
    if (ps.lives === 0) {
      ps.spriteMode = SPM.UNMAPPED;
      this.sound("dead", ps.x);
      if (!this.players.some((p) => p.team === ps.team && p.lives !== 0)) this.numActive--;
      this.distributeExtras(ps.bombs - level.minBombs, ps.range - level.minRange, ps.num_extras, ps.special_bombs);
    } else {
      this.sound("ouch", ps.x);
      this.distributeExtras(0, 0, ps.num_extras, ps.special_bombs);
    }
    this.haveAGloat(ps.id);
    const f = (ps.revextra_flags & (0xffffff >> 2)) >>> 0;
    ps.invincible = NEW_INVINCIBLE;
    ps.dying = 0;
    ps.stunned = 0;
    ps.illness = level.reviveHealth;
    ps.health = level.reviveHealth;
    ps.illtime = 0;
    ps.teleport = 0;
    ps.cloaking = 0;
    ps.morphed = 0;
    ps.num_morph = 0;
    ps.evilill = 0;
    ps.phantom = 0;
    ps.through = 0;
    ps.throughCount = 0;
    ps.farted = f === RF.Fart ? 1 : 0;
    ps.smelly = 0;
    ps.bfarter = f === RF.Bfart ? 1 : 0;
    if (!ps.revive) ps.cloaking = 0;
    if (ps.remote_control > 0) this.ignitePlayersBombs(ps);
    ps.daleifing = 0;
    ps.daleif = f === RF.Daleif ? 1 : 0;
    ps.remote_control = 0;
    ps.kick = 0;
    ps.air_button = 0;
    ps.frogger = f === RF.Frogger ? 1 : 0;
    ps.jump_button = f === RF.Jump ? 1 : 0;
    ps.evilill = 0;
    ps.stop = f === RF.Stop ? 1 : 0;
    ps.suck_button = f === RF.Suck ? 1 : 0;
    ps.phantom = f === RF.Phantom ? GAME_TIME : 0;
    ps.electrify = f === RF.Electrify ? EXTRA_ELECTRIFY_COUNT : 0;
    if (this.distribSpecial()) ps.special_bombs = 0;
    ps.num_extras = 0;
    if (f === RF.RC) ps.remote_control = 1;
    if (f === RF.Teleport) ps.teleport = 1;
    if (RF.Kick & ps.revextra_flags) ps.kick = 1;
    if (f === RF.Morph) ps.num_morph = 1000;
    if (f === RF.Through) {
      ps.through = 1;
      ps.throughCount = 255;
    }
    if (f === RF.Snipe) ps.num_snipe = 1000;
    ps.speed = 0;
    if (f === RF.Revive) ps.revive = 1;
    ps.choice_bomb_type = NUM_BMT;
    if (f === RF.Choice) ps.choice_bomb_type = this.firstChoiceBomb(this.choiceDefaultBomb);
    if (f === RF.Airpump) ps.air_button = 1;
    if (f === RF.Cloak) ps.cloaking = -GAME_TIME;
    if (ps.sniping === 1 && this.ignitePlayersBombs(ps)) {
      ps.sniping = 1;
      ps.d_soll = Dir.Stop;
    }
  }

  private doStunned(ps: Player): void {
    const shown = ((ps.d_look + ps.stunned - 1) % 4) + Dir.Stop + 1;
    const anime: Record<number, number> = {
      [Dir.Down]: Anime.StopDown,
      [Dir.Up]: Anime.StopUp,
      [Dir.Left]: Anime.StopLeft,
      [Dir.Right]: Anime.StopRight,
    };
    if (anime[shown] !== undefined) ps.anime = anime[shown];
    ps.stunned--;
  }

  private doEvilIll(): void {
    for (const ps of this.players) {
      if (ps.lives && ps.evilill) {
        if (ps.evilill === 1) ps.dying = DEAD_TIME;
        ps.evilill--;
      }
    }
  }

  private doDie(ps: Player): void {
    if (ps.dying === DEAD_TIME) ps.spriteMode = SPM.MAPPED;
    ps.dying--;
    const damaged = { [Dir.Left]: Anime.DamagedLeft, [Dir.Up]: Anime.DamagedUp, [Dir.Right]: Anime.DamagedRight };
    const dead = { [Dir.Left]: Anime.DeadLeft, [Dir.Up]: Anime.DeadUp, [Dir.Right]: Anime.DeadRight };
    if (ps.lives > 1) ps.anime = (damaged as Record<number, number>)[ps.d_look] ?? Anime.DamagedDown;
    else ps.anime = (dead as Record<number, number>)[ps.d_look] ?? Anime.DeadDown;
  }

  private checkPlayerNear(x: number, y: number): boolean {
    return this.players.some(
      (p) => abs(x * BLOCK_WIDTH - p.x) < BLOCK_WIDTH && abs(y * BLOCK_HEIGHT - BLOCK_HEIGHT - p.y) < BLOCK_HEIGHT,
    );
  }

  private doAllPlayers(gameTime: number): void {
    const ps = this.players;
    if (gameTime === GAME_TIME - DEAD_TIME + 1) {
      for (const p of ps) {
        if (p.lives > 0) {
          p.lives = 1;
          p.dying = DEAD_TIME;
        }
      }
    }
    const plist = ps.map((_, i) => i);
    for (let i = ps.length - 1; i > 0; i--) {
      const p = this.rng.number(i + 1);
      [plist[p], plist[i]] = [plist[i]!, plist[p]!];
    }
    for (const player of plist) {
      const p = ps[player]!;
      if (p.lives !== 0) {
        switch (p.dying) {
          case 0:
            if (p.morphed) this.doMorph(p);
            else if (p.stunned) {
              if (p.farted) {
                this.doWalk(p, gameTime);
                this.doStunned(p);
                p.farted--;
              } else {
                this.doStunned(p);
              }
            } else {
              this.doWalk(p, gameTime);
            }
            if (p.smelly) p.smelly--;
            if (p.daleifing) p.daleifing--;
            break;
          case 1:
            this.revivePlayer(p);
            break;
          default:
            this.doDie(p);
            break;
        }
      } else if (p.revive) {
        if (p.cloaking < 0) {
          p.cloaking++;
          p.spriteMode = p.cloaking & 0x01 ? p.disp : SPM.UNMAPPED;
        } else {
          p.spriteMode = SPM.MAPPED;
        }
        p.anime = Anime.Zombie;
      }
    }
  }

  private checkPlayerHit(): void {
    for (const p of this.players) {
      const gridx = idiv(p.x + (BLOCK_WIDTH >> 1), BLOCK_WIDTH);
      const gridy = idiv(p.y + (BLOCK_HEIGHT >> 1), BLOCK_HEIGHT) + 1;
      if (
        p.lives !== 0 &&
        p.invincible === 0 &&
        p.morphed === 0 &&
        p.dying === 0 &&
        this.checkExplosion(gridx, gridy)
      ) {
        p.dying = DEAD_TIME;
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* func.c                                                             */
  /* ------------------------------------------------------------------ */

  private specialExtra(ps: Player, extra = this.level.specialExtra): void {
    switch (extra) {
      case "invincible":
        this.sound("invinc", ps.x);
        ps.illtime = 0;
        ps.illness = ps.health;
        ps.invincible += EXTRA_INVINCIBLE;
        break;
      case "kick":
        this.sound("newkick", ps.x);
        ps.kick = 1;
        break;
      case "rc":
        this.sound("newrc", ps.x);
        ps.remote_control = 1;
        break;
      case "choicebombtype":
        if (ps.choice_bomb_type === NUM_BMT) ps.choice_bomb_type = this.firstChoiceBomb(this.choiceDefaultBomb);
        break;
      case "through":
        ps.throughCount += 1;
        break;
      case "teleport":
        this.sound("newtele", ps.x);
        if (ps.teleport === 0) ps.teleport = 1;
        break;
      case "frogger":
        ps.frogger++;
        break;
      case "daleif":
        ps.daleif = 0;
        break;
      case "igniteAll":
        this.sound("butt", ps.x);
        this.igniteAllBombs();
        break;
      case "specialBomb":
        this.sound("spbomb", ps.x);
        ps.special_bombs += 3;
        break;
      case "junkie":
        this.sound("inj", ps.x);
        ps.junkie = this.maxJunkieTime();
        break;
      case "air":
        this.sound("newpump", ps.x);
        ps.air_button = 1;
        break;
      case "sucker":
        this.sound("newpump", ps.x);
        ps.suck_button = 1;
        break;
      case "ghost":
        this.sound("newpump", ps.x);
        ps.ghost = EXTRA_GHOST_TIME;
        break;
      case "poison":
        if (!ps.invincible) ps.dying = DEAD_TIME;
        break;
      case "longStunned":
        this.sound("stun", ps.x);
        ps.stunned = STUN_TIME * 4;
        break;
      case "speed":
        this.sound("fast", ps.x);
        ps.illness = Ill.Run;
        ps.health = Ill.Run;
        ps.illtime = 0;
        break;
      case "speed2":
        this.sound("fast", ps.x);
        ps.illness = Ill.Run;
        ps.health = Ill.Run;
        ps.illtime = 0;
        ps.speed++;
        break;
      case "slow":
        this.sound("slow", ps.x);
        ps.illness = Ill.Slow;
        ps.health = Ill.Slow;
        ps.illtime = 0;
        break;
      case "mayhem":
        this.sound("slay", ps.x);
        ps.kick = 1;
        ps.illness = Ill.Run;
        ps.health = Ill.Run;
        ps.illtime = 0;
        break;
      case "holyGrail":
        this.sound("holy", ps.x);
        ps.lives += this.killOtherPlayers(ps.team);
        if (ps.lives > 9) ps.lives = 9;
        ps.invincible = NEW_INVINCIBLE;
        ps.dying = DEAD_TIME;
        break;
      case "steal":
        ps.bombs += this.stealBombsOtherPlayers(ps.team);
        ps.range += this.stealRangeOtherPlayers(ps.team);
        break;
      case "life":
        this.sound("life", ps.x);
        if (ps.lives < 9) ps.lives++;
        break;
      case "multiple":
        switch (this.rng.number(11)) {
          case 0:
          case 1:
            this.specialExtra(ps, "speed");
            break;
          case 2:
          case 3:
            this.specialExtra(ps, "poison");
            break;
          case 4:
          case 5:
            this.specialExtra(ps, "invincible");
            break;
          case 6:
          case 7:
            this.specialExtra(ps, "longStunned");
            break;
          case 8:
          case 9:
            this.specialExtra(ps, "air");
            break;
          case 10:
            this.specialExtra(ps, "life");
            break;
        }
        break;
      case "electrify":
        ps.electrify = EXTRA_ELECTRIFY_COUNT;
        break;
      case "farter":
        ps.farter = 1;
        break;
      case "bfarter":
        ps.bfarter = 1;
        break;
      case "swapcolor":
        this.swapColorOtherPlayers(ps.team);
        break;
      case "swapposition":
        this.swapPositionOtherPlayers(ps.team);
        break;
      case "cloak": {
        let w = 1;
        if (ps.cloaking < 0) {
          ps.cloaking *= -1;
          w = -1;
        }
        ps.cloaking += 2 * EXTRA_INVINCIBLE;
        ps.cloaking *= w;
        this.sound("newcloak", ps.x);
        break;
      }
      case "stunOthers":
        this.stunOtherPlayers(ps.team, STUN_TIME * 4);
        break;
      case "morph":
        ps.num_morph++;
        break;
      case "stop":
        ps.stop = 1;
        break;
      case "evilgrail":
        ps.evilill = ILLDEATHTIME;
        break;
      case "phantom":
        if (!ps.phantom) ps.phantom = 3 * EXTRA_INVISIBLE;
        else ps.phantom += EXTRA_INVISIBLE;
        break;
      case "revive":
        ps.revive++;
        break;
      case "snipe":
        ps.num_snipe++;
        break;
      case "jump":
        this.sound("newpump", ps.x);
        ps.jump_button += 1;
        break;
      case "void":
        break;
    }
  }

  private specialKey(ps: Player): void {
    switch (this.level.specialKey) {
      case "rc":
        if (ps.remote_control > 0 && this.ignitePlayersBombs(ps)) this.sound("shoot", ps.x);
        break;
      case "choicebombtype":
        if (ps.choice_bomb_type !== NUM_BMT)
          ps.choice_bomb_type = this.firstChoiceBomb((ps.choice_bomb_type + 1) % NUM_BMT);
        break;
      case "through":
        if (ps.throughCount > 0 && ps.lives > 0) {
          if (ps.through) ps.through = 0;
          else {
            ps.through = EXTRA_THROUGH_TIME;
            ps.throughCount--;
          }
        }
        break;
      case "teleport":
        if (ps.teleport === 1) ps.teleport = TELEPORT_TIME;
        break;
      case "frogger":
        if (ps.lives > 0 && ps.frogger && !ps.dying) this.doFrog(ps);
        break;
      case "specialBomb":
        this.dropBomb(ps, BMT.special);
        break;
      case "air":
        if (ps.air_button > 0 && ps.lives > 0) {
          this.sound("pump", ps.x);
          this.blowBombs(ps, "air");
        }
        break;
      case "sucker":
        if (ps.suck_button > 0 && ps.lives > 0) {
          this.sound("pump", ps.x);
          this.blowBombs(ps, "suck");
        }
        break;
      case "electrify":
        if (ps.lives > 0 && ps.electrify) {
          if (this.electrifyOtherPlayers(ps.id)) ps.electrify = 0;
          else ps.electrify--;
        }
        break;
      case "farter":
        if (ps.lives > 0 && ps.farter) this.fartOnOtherPlayers(ps);
        break;
      case "bfarter":
        if (ps.lives > 0 && ps.bfarter) {
          this.fartOnOtherPlayers(ps);
          this.blowBombs(ps, "air");
        }
        break;
      case "cloak":
        ps.cloaking *= -1;
        if (ps.cloaking > 0) this.sound("decloak", ps.x);
        else if (ps.cloaking < 0) this.sound("encloak", ps.x);
        break;
      case "morph":
        if (ps.num_morph > 0 && ps.bombs > 0 && !ps.morphed) {
          ps.morphed = 1;
          this.dropBomb(ps, BMT.default);
        }
        break;
      case "stop":
        if (ps.stop > 0) this.stopPlayersBombs(ps);
        break;
      case "snipe":
        if (ps.num_snipe > 0 && ps.bombs > 0 && ps.sniping === 0) {
          ps.sniping = 2;
          this.dropBomb(ps, BMT.default);
          ps.sniping = 1;
        } else if (ps.sniping === 1 && this.ignitePlayersBombs(ps)) {
          ps.sniping = 1;
          ps.d_soll = Dir.Stop;
        }
        break;
      case "jump":
        if (ps.jump_button > 0 && ps.lives > 0) {
          this.sound("pump", ps.x);
          this.blowBombs(ps, "jump");
        }
        break;
      case "void":
        break;
    }
  }

  private sound(name: string, x: number): void {
    this.sounds.push({ name, x });
  }
}

function emptyPlayer(): Player {
  return {
    id: 0,
    team: 0,
    turnStep: 0,
    x: 0,
    y: 0,
    d_soll: Dir.Stop,
    d_ist: Dir.Stop,
    d_look: Dir.Down,
    invincible: 0,
    dying: 0,
    stunned: 0,
    health: Ill.Healthy,
    illness: Ill.Healthy,
    speed: 0,
    illtime: 0,
    junkie: 0,
    lives: 0,
    stop: 0,
    evilill: 0,
    score: 0,
    range: 0,
    choice_bomb_type: NUM_BMT,
    bombs: 0,
    suck_button: 0,
    iniextra_flags: 0,
    revextra_flags: 0,
    special_bombs: 0,
    remote_control: 0,
    kick: 0,
    air_button: 0,
    victories: 0,
    teleport: 0,
    cloaking: 0,
    num_extras: 0,
    abort: Abort.None,
    morphed: 0,
    num_morph: 0,
    in_active: 0,
    jump_button: 0,
    revive: 0,
    frogger: 0,
    laola: 0,
    looser: 0,
    ghost: 0,
    num_snipe: 0,
    sniping: 0,
    daleif: 0,
    daleifing: 0,
    farted: 0,
    farter: 0,
    bfarter: 0,
    smelly: 0,
    electrify: 0,
    throughCount: 0,
    through: 0,
    phantom: 0,
    anime: Anime.StopDown,
    spriteMode: SPM.MAPPED,
    disp: SPM.MAPPED,
    look: 0,
  };
}
