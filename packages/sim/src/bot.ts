// Computer players of XBlast 2.10.4 (bot.c, by Didier Plantet and Grégoire
// Robert), transcribed function by function; French names kept as in the C.
//
// Differences with the C code, all needed for a deterministic lockstep game:
// - the C bot draws from libc rand(): here each bot has its own seeded
//   generator, so every client computes the same decisions;
// - its "static" memories (last direction, unblocking counter) were shared by
//   all bots: here each bot has its own;
// - fuse_times[curBombTime] read outside of its array (curBombTime is a fuse
//   time, not an index): the fuse time itself is used;
// - cells outside the maze are never read or written (undefined behaviour in C).

import {
  BLOCK_HEIGHT,
  BLOCK_WIDTH,
  BMT,
  BOMB_STUN_X,
  BOMB_STUN_Y,
  BOMB_VX,
  BOMB_VY,
  BT,
  Dir,
  GAME_TIME,
  Ill,
  LONG_FUSE,
  MAZE_H,
  MAZE_W,
} from "./constants.ts";
import type { Game, Player, PlayerAction } from "./game.ts";

const NB_DIR = 5;
const STOP = 0;
const UP = 1;
const LEFT = 2;
const DOWN = 3;
const RIGHT = 4;

const PROB_POSER = 10;
const BONUS_EXPLOSE = 40;
const BONUS_TUE = 60;
const BONUS_SIMPLE = 100;
const BONUS_EXTRA = 200;
const MALUS_MORT = -1000;
const SLOW_SPEED = 16;
const NORMAL_SPEED = 8;
const FAST_SPEED = 4;
/** "far away" safety of a cell no bomb threatens */
const SURE = 50 * LONG_FUSE;

const turnAnticlockwise: Dir[] = [Dir.Stop, Dir.Left, Dir.Down, Dir.Right, Dir.Up, Dir.Default];
const turnOpposite: Dir[] = [Dir.Stop, Dir.Down, Dir.Right, Dir.Up, Dir.Left, Dir.Default];

const idiv = (a: number, b: number) => Math.trunc(a / b);
const inMaze = (x: number, y: number) => x >= 0 && y >= 0 && x < MAZE_W && y < MAZE_H;
const at = (x: number, y: number) => x * MAZE_H + y;

/** Copy of a bomb, moved by the bot to foresee explosions. */
interface TmpBomb {
  x: number;
  y: number;
  dx: number;
  dy: number;
  dir: Dir;
  count: number;
  /** -1: free slot */
  range: number;
  type: number;
}

interface Coord {
  x: number;
  y: number;
  temps: number;
  malus: number;
}

function conversionDirection(dir: number): [number, number] {
  switch (dir) {
    case UP:
      return [0, -1];
    case DOWN:
      return [0, 1];
    case LEFT:
      return [-1, 0];
    case RIGHT:
      return [1, 0];
    default:
      return [0, 0];
  }
}

/** One computer player. Its decisions only depend on the game and its seed. */
export class Bot {
  /* per bot memories ("static" variables of the C code) */
  private oldDir = 0;
  private olddx = 0;
  private olddy = 0;
  private compteur = 0;
  private random: number;

  /* working data of one decision */
  private game!: Game;
  private readonly bombesTmp: TmpBomb[] = Array.from({ length: 100 }, () => emptyBomb());
  private readonly labyPerf = new Int32Array(MAZE_W * MAZE_H);
  private readonly labyVisit = new Uint8Array(MAZE_W * MAZE_H);
  private labyShrink: Int32Array | null = null;
  private readonly vote = new Int32Array(NB_DIR);
  private readonly perfMax = new Int32Array(NB_DIR);
  private votePoser = false;
  private voteActionSpeciale = false;
  private file: Coord[] = [];
  private numBot = 0;
  private nbEnnemisVivants = 0;
  private tempsJeu = 0;
  private dureeDeplacement = NORMAL_SPEED;
  private bonusExtra = BONUS_EXTRA;

  constructor(seed: number) {
    this.random = seed >>> 0 || 1;
  }

  /** libc rand() / (RAND_MAX + 1.0): uniform in [0, 1), from the bot's own generator. */
  private rand(): number {
    // xorshift32
    let x = this.random;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.random = x >>> 0;
    return this.random / 4294967296;
  }

  /**
   * gestionBot: inputs of player `numeroBot` for this frame. `pa` comes
   * cleared (direction GoDefault, no bomb, no special), like the game does.
   */
  decide(game: Game, numeroBot: number, pa: PlayerAction): void {
    this.game = game;
    this.numBot = numeroBot;
    const ps = game.players[numeroBot]!;
    const mazex = idiv(ps.x, BLOCK_WIDTH);
    const mazey = idiv(ps.y, BLOCK_HEIGHT) + 1;

    if (ps.illness === Ill.Run) this.dureeDeplacement = FAST_SPEED;
    else if (ps.illness === Ill.Slow) this.dureeDeplacement = SLOW_SPEED;
    else this.dureeDeplacement = NORMAL_SPEED;

    this.tempsJeu = game.gameTime;
    if (this.tempsJeu === 1 || this.labyShrink === null) this.initLabyShrink();

    const inverse = ps.illness === Ill.Reverse;

    /* between two cells */
    if (ps.x % BLOCK_WIDTH !== 0 || ps.y % BLOCK_HEIGHT !== 0 || (ps.d_ist === Dir.Stop && this.tempsJeu % 3)) {
      switch (ps.d_ist) {
        case Dir.Up:
          if (game.checkBomb(mazex, mazey) && !(ps.kick && game.checkMazeFree2(mazex, mazey - 1))) {
            pa.dir = this.decoince(Dir.Down);
          }
          break;
        case Dir.Down:
          if (game.checkBomb(mazex, mazey + 1) && !(ps.kick && game.checkMazeFree2(mazex, mazey + 2))) {
            pa.dir = this.decoince(Dir.Up);
          }
          break;
        case Dir.Left:
          if (game.checkBomb(mazex, mazey) && !(ps.kick && game.checkMazeFree2(mazex - 1, mazey))) {
            pa.dir = this.decoince(Dir.Right);
          }
          break;
        case Dir.Right:
          if (game.checkBomb(mazex + 1, mazey) && !(ps.kick && game.checkMazeFree2(mazex + 2, mazey))) {
            pa.dir = this.decoince(Dir.Left);
          }
          break;
        default:
          break;
      }
      if (ps.dying) pa.bomb = this.reposeEnMourant(ps);
      if (inverse) pa.dir = this.inversion(pa.dir);
      return;
    }

    if (pa.dir === Dir.Stop && !(this.tempsJeu & 1)) return;

    this.vote.fill(0);
    this.testMurs(ps);
    this.actions(ps);

    let max = MALUS_MORT;
    let choice = -1;
    for (let j = 0; j < NB_DIR; j++) {
      if (this.vote[j]! > max) {
        max = this.vote[j]!;
        choice = j;
      }
    }
    switch (choice) {
      case STOP:
        pa.dir = ps.d_ist === Dir.Stop ? Dir.Default : Dir.Stop;
        break;
      case UP:
        pa.dir = Dir.Up;
        break;
      case LEFT:
        pa.dir = Dir.Left;
        break;
      case DOWN:
        pa.dir = Dir.Down;
        break;
      case RIGHT:
        pa.dir = Dir.Right;
        break;
    }
    if (this.votePoser) pa.bomb = true;
    if (this.voteActionSpeciale) pa.special = true;
    if (inverse) pa.dir = this.inversion(pa.dir);
  }

  /* ------------------------------------------------------------------ */

  private perf(x: number, y: number): number {
    return inMaze(x, y) ? this.labyPerf[at(x, y)]! : SURE;
  }

  private setPerf(x: number, y: number, value: number): void {
    if (inMaze(x, y)) this.labyPerf[at(x, y)] = value;
  }

  private shrinkAt(x: number, y: number): number {
    return inMaze(x, y) ? this.labyShrink![at(x, y)]! : 2 * GAME_TIME;
  }

  /** number of walls around me (test_murs) */
  private testMurs(ps: Player): number {
    const game = this.game;
    const x = idiv(ps.x, BLOCK_WIDTH);
    const y = idiv(ps.y, BLOCK_HEIGHT) + 1;
    let nbMurs = 0;
    if (game.checkMaze(x, y - 1)) {
      this.vote[UP] = MALUS_MORT;
      nbMurs++;
    }
    if (game.checkMaze(x - 1, y)) {
      this.vote[LEFT] = MALUS_MORT;
      nbMurs++;
    }
    if (game.checkMaze(x, y + 1)) {
      this.vote[DOWN] = MALUS_MORT;
      nbMurs++;
    }
    if (game.checkMaze(x + 1, y)) {
      this.vote[RIGHT] = MALUS_MORT;
      nbMurs++;
    }
    return nbMurs;
  }

  private bombeTrouveeTmp(x: number, y: number): TmpBomb | null {
    return this.bombesTmp.find((b) => b.range !== -1 && b.x === x && b.y === y) ?? null;
  }

  /** marks the cells a bomb will burn, with the time left (developpe_bombe_tmp) */
  private developpeBombeTmp(range: number, mazex: number, mazey: number, type: number, count: number): void {
    const game = this.game;
    if (!inMaze(mazex, mazey)) return;
    const here = this.perf(mazex, mazey);
    for (let i = 1; i <= range && game.checkMazeOpen(mazex + i - 1, mazey); i++) {
      if (mazex + i < MAZE_W && here + i < this.perf(mazex + i, mazey))
        this.setPerf(mazex + i, mazey, here + i * count);
    }
    for (let i = 1; i <= range && game.checkMazeOpen(mazex - i + 1, mazey); i++) {
      if (mazex - i >= 0 && here + i < this.perf(mazex - i, mazey)) this.setPerf(mazex - i, mazey, here + i * count);
    }
    for (let i = 1; i <= range && game.checkMazeOpen(mazex, mazey + i - 1); i++) {
      if (mazey + i < MAZE_H && here + i < this.perf(mazex, mazey + i))
        this.setPerf(mazex, mazey + i, here + i * count);
    }
    for (let i = 1; i <= range && game.checkMazeOpen(mazex, mazey - i + 1); i++) {
      if (mazey - i >= 0 && here + i < this.perf(mazex, mazey - i)) this.setPerf(mazex, mazey - i, here + i * count);
    }
    if (type === BMT.napalm) {
      for (let i = -2; i <= 2; i++) {
        if (mazex + i < MAZE_W && mazex + i >= 0) {
          this.developpeBombeTmp(idiv(range, Math.abs(i) + 1), mazex + i, mazey, BMT.normal, count);
        }
        if (mazey + i < MAZE_H && mazey + i >= 0) {
          this.developpeBombeTmp(idiv(range, Math.abs(i) + 1), mazex, mazey + i, BMT.normal, count);
        }
      }
    }
    if (type === BMT.grenade) {
      if (range === 1) {
        this.developpeBombeTmp(0, mazex - 1, mazey - 1, BMT.blastnow, count);
        this.developpeBombeTmp(0, mazex + 1, mazey - 1, BMT.blastnow, count);
        this.developpeBombeTmp(0, mazex - 1, mazey + 1, BMT.blastnow, count);
        this.developpeBombeTmp(0, mazex + 1, mazey + 1, BMT.blastnow, count);
      } else {
        for (let i = -(range - 1); i <= range - 1; i++) {
          for (let j = -(range - 1); j <= range - 1; j++) {
            this.developpeBombeTmp(1, mazex + i, mazey + j, BMT.blastnow, count);
          }
        }
      }
    }
  }

  /** are extras good or bad on this level? (def_score_extra) */
  private defScoreExtra(ps: Player): void {
    const extra = this.game.level.specialExtra;
    this.bonusExtra = BONUS_EXTRA;
    if (extra === "slow") {
      if (!ps.iniextra_flags) this.bonusExtra = -BONUS_SIMPLE / 2;
      else this.bonusExtra = ps.revextra_flags ? 0 : -BONUS_SIMPLE / 2;
    }
    if (extra === "stunOthers") this.bonusExtra = -2 * BONUS_SIMPLE;
    if (extra === "junkie" && ps.junkie === 0) this.bonusExtra = -5 * BONUS_SIMPLE;
    if (extra === "poison") this.bonusExtra = -10 * BONUS_SIMPLE;
  }

  /** an extra on this cell? (score_bonus; reads the extras hidden in blocks too) */
  private scoreBonus(x: number, y: number): number {
    const bonus = this.game.extraAt(x, y);
    if (bonus === BT.Bomb || bonus === BT.Range) return BONUS_SIMPLE + 200;
    if (bonus === BT.Special || bonus === BT.Extra) {
      return this.game.level.specialExtra !== "poison" ? this.bonusExtra : -BONUS_SIMPLE;
    }
    if (bonus === BT.Evil) return -BONUS_SIMPLE;
    return 0;
  }

  /** is it worth dropping a bomb here? (score_explose) */
  private scoreExplose(x: number, y: number, porteeBombe: number): number {
    let explose = 0;
    for (let dir = 1; dir < NB_DIR; dir++) {
      const [dx, dy] = conversionDirection(dir);
      let i = 1;
      while (this.game.checkMazeFree(x + i * dx, y + i * dy) && i <= porteeBombe) i++;
      if (this.game.extraAt(x + i * dx, y + i * dy) === BT.Extra) explose += BONUS_EXPLOSE;
      else explose -= idiv(this.scoreBonus(x + i * dx, y + i * dy), 4);
    }
    return explose + 75;
  }

  /** would a bomb here threaten another player? (score_tue) */
  private scoreTue(x: number, y: number, porteeBombe: number): number {
    const game = this.game;
    let tue = 0;
    let xmin = -1;
    let xmax = -1;
    let ymin = -1;
    let ymax = -1;
    for (let j = 1; j <= porteeBombe; j++) {
      if (xmin === -1 && (!game.checkMazeFree(x - j, y) || j === porteeBombe)) xmin = x - j;
      if (xmax === -1 && (!game.checkMazeFree(x + j, y) || j === porteeBombe)) xmax = x + j;
      if (ymin === -1 && (!game.checkMazeFree(x, y - j) || j === porteeBombe)) ymin = y - j;
      if (ymax === -1 && (!game.checkMazeFree(x, y + j) || j === porteeBombe)) ymax = y + j;
    }
    this.nbEnnemisVivants = 0;
    const me = game.players[this.numBot]!;
    game.players.forEach((ps, j) => {
      if (j === this.numBot || ps.lives === 0) return;
      const jx = idiv(ps.x, BLOCK_WIDTH);
      const jy = idiv(ps.y, BLOCK_HEIGHT) + 1;
      let points = BONUS_TUE;
      if (ps.team === me.team) points = -points;
      else this.nbEnnemisVivants++;
      if (x === jx && ymin <= jy && jy <= ymax) tue += points;
      if (y === jy && x !== jx && xmin <= jx && jx <= xmax) tue += points;
      if (x === jx && y === jy) {
        const bad = [Ill.Bomb, Ill.Slow, Ill.Mini, Ill.Empty, Ill.Malfunction, Ill.Teleport] as number[];
        if (bad.includes(ps.illness) || ps.junkie) tue -= BONUS_SIMPLE;
      } else {
        tue += points;
      }
    });
    return tue;
  }

  /** will this cell disappear soon? (score_shrink) */
  private scoreShrink(x: number, y: number, temps: number): number {
    temps += this.tempsJeu;
    const left = this.shrinkAt(x, y) - temps;
    if (left <= 16) return MALUS_MORT;
    if (left <= 50) return -BONUS_EXTRA;
    if (left <= 100) return -BONUS_SIMPLE;
    return 0;
  }

  /** danger and interest of a cell, then go on with the breadth-first search (teste_case) */
  private testeCase(c: Coord, dirInit: number, ps: Player): void {
    const game = this.game;
    let perf = this.perf(c.x, c.y) - c.temps;
    const porteeBombe = ps.illness === Ill.Mini ? 1 : ps.range;
    const invincible = ps.invincible - c.temps;
    let tourne = ps.stunned - c.temps;
    if (invincible > 0) perf += invincible;
    if (tourne < 0) tourne = 0;
    if (perf <= 4) return;
    if (this.scoreShrink(c.x, c.y, c.temps) === MALUS_MORT) return;
    let score = this.scoreBonus(c.x, c.y);
    if (score <= -500) return;
    const malus = Math.min(c.malus, score);
    score += this.scoreExplose(c.x, c.y, porteeBombe);
    score += this.scoreTue(c.x, c.y, porteeBombe);
    score += this.scoreShrink(c.x, c.y, c.temps);
    perf += score;
    if (perf > 10 * LONG_FUSE) perf += malus;
    this.perfMax[dirInit] = Math.max(this.perfMax[dirInit]!, perf);
    for (let dir = 1; dir < NB_DIR; dir++) {
      const [dx, dy] = conversionDirection(dir);
      const nx = c.x + dx;
      const ny = c.y + dy;
      if (!inMaze(nx, ny) || this.labyVisit[at(nx, ny)] || game.checkMaze(nx, ny)) continue;
      if (ps.kick || !game.checkBomb(nx, ny)) {
        this.file.push({ x: nx, y: ny, temps: c.temps + this.dureeDeplacement + tourne, malus });
        this.labyVisit[at(nx, ny)] = 1;
      }
    }
  }

  /** when each cell disappears: shrink and scramble (init_laby_shrink) */
  private initLabyShrink(): void {
    const game = this.game;
    const shrink = new Int32Array(MAZE_W * MAZE_H).fill(2 * GAME_TIME);
    for (const s of game.shrinkSteps) {
      if (s.time >= 2 * GAME_TIME || s.time < this.tempsJeu) continue;
      if (inMaze(s.x, s.y) && shrink[at(s.x, s.y)]! > s.time) shrink[at(s.x, s.y)] = s.time;
    }
    const scramble = game.level.scrambleDraw;
    const temps = scramble.time - 4;
    for (let y = 0; y < MAZE_H; y++) {
      for (let x = 0; x < MAZE_W; x++) {
        if (scramble.row[y]! & (1 << x) && shrink[at(x, y)]! > temps) shrink[at(x, y)] = temps;
      }
    }
    this.labyShrink = shrink;
  }

  /** foresees explosions: time before each cell burns (calc_laby_perf) */
  private calcLabyPerf(): void {
    const game = this.game;
    const level = game.level;
    for (const p of this.bombesTmp) {
      if (p.range === -1 || p.count < 0) continue;
      if (this.perf(p.x, p.y) > -p.count) {
        this.setPerf(p.x, p.y, -p.count);
        this.developpeBombeTmp(p.range, p.x, p.y, p.type, -p.count);
      } else {
        this.developpeBombeTmp(p.range, p.x, p.y, BMT.normal, -p.count);
      }
      p.range = -1;
    }
    for (let temps = 0; temps < LONG_FUSE; temps++) {
      for (let i = 0; i < 100; i++) {
        const p = this.bombesTmp[i]!;
        if (p.range === -1) continue;
        if (temps === -p.count || this.perf(p.x, p.y) <= temps) {
          if (this.perf(p.x, p.y) > -p.count) {
            this.setPerf(p.x, p.y, -p.count);
            this.developpeBombeTmp(p.range, p.x, p.y, p.type, -p.count);
          } else {
            this.developpeBombeTmp(p.range, p.x, p.y, BMT.normal, -p.count);
          }
          p.range = -1;
          continue;
        }
        if (p.dir === Dir.Stop) continue;
        let [dx, dy] = conversionDirection(p.dir);
        const explode = () => {
          p.dir = Dir.Stop;
          p.dx = 0;
          p.dy = 0;
          if (this.perf(p.x, p.y) > -p.count) this.setPerf(p.x, p.y, -p.count);
          this.developpeBombeTmp(p.range, p.x, p.y, p.type, -p.count);
          p.range = -1;
        };
        // "clockwise" is tested as a second "contact" in the C code: it does nothing
        const click = (kind: string, other?: TmpBomb) => {
          switch (kind) {
            case "none":
              p.dir = Dir.Stop;
              p.dx = 0;
              p.dy = 0;
              break;
            case "initial":
              p.dir = game.initialBombDir;
              [p.dx, p.dy] = conversionDirection(p.dir);
              break;
            case "snooker":
              if (other) {
                other.dir = p.dir;
                other.dx *= Math.abs(dx);
                other.dy *= Math.abs(dy);
                p.dir = Dir.Stop;
                p.dx = 0;
                p.dy = 0;
              }
              break;
            case "contact":
              explode();
              break;
            case "anticlockwise":
              p.dir = turnAnticlockwise[p.dir]!;
              p.dx = 0;
              p.dy = 0;
              break;
            case "randomdir":
              p.dir = (Math.trunc(this.rand() * 4) + 1) as Dir;
              p.dx = 0;
              p.dy = 0;
              break;
            case "rebound":
              p.dir = turnOpposite[p.dir]!;
              break;
            default:
              break;
          }
        };
        const hit = this.bombeTrouveeTmp(p.x + dx, p.y + dy);
        if (p.dx * dx >= 0 && p.dy * dy >= 0 && hit) {
          click(level.bombClick, hit);
        } else if (p.dx === 0 && p.dy === 0 && !game.checkMazeFree(p.x + dx, p.y + dy)) {
          // C: "(int)(rand / (RAND_MAX + 1.0)) * MAX_DIR" is always 0, GoStop
          if (level.wallClick === "randomdir") {
            p.dir = Dir.Stop;
            p.dx = 0;
            p.dy = 0;
          } else if (level.wallClick !== "snooker") {
            click(level.wallClick);
          }
        } else {
          const touched = game.players.some(
            (pl) =>
              pl.invincible === 0 &&
              Math.abs(p.x * BLOCK_WIDTH + p.dx - pl.x) < BOMB_STUN_X &&
              Math.abs(p.y * BLOCK_HEIGHT + p.dy - pl.y - BLOCK_HEIGHT) < BOMB_STUN_Y,
          );
          if (touched && level.playerClick !== "snooker") click(level.playerClick);
        }
        [dx, dy] = conversionDirection(p.dir);
        p.dy += dy * BOMB_VY;
        p.dx += dx * BOMB_VX;
        if (p.dx * dx >= BLOCK_WIDTH / 2) {
          p.dx -= dx * BLOCK_WIDTH;
          p.x += dx;
        }
        if (p.dy * dy >= BLOCK_HEIGHT / 2) {
          p.dy -= dy * BLOCK_HEIGHT;
          p.y += dy;
        }
        p.x = Math.min(MAZE_W - 1, Math.max(0, p.x));
        p.y = Math.min(MAZE_H - 1, Math.max(0, p.y));
        this.setPerf(p.x, p.y, Math.min(this.perf(p.x, p.y), SURE - 500 + temps * 4));
      }
      for (const p of this.bombesTmp) {
        if (p.range === -1 || p.count <= 0 || p.type !== BMT.fungus) continue;
        if (p.count !== idiv(game.curBombTime * 3, 5)) continue;
        for (let j = -1; j <= 1; j++) {
          for (const [x, y] of [
            [p.x + j, p.y],
            [p.x, p.y + j],
          ] as const) {
            if (!inMaze(x, y) || game.checkMazeSolid(x, y)) continue;
            const free = this.bombesTmp.find((b) => b.range === -1);
            if (free)
              Object.assign(free, { x, y, range: p.range, type: BMT.fungus, dir: Dir.Stop, count: game.curBombTime });
          }
        }
      }
    }
  }

  /** copies the bombs of the game (init_laby_perf, init_laby_perf_biscotte) */
  private initLabyPerf(mineExplodeNow = false): void {
    this.labyPerf.fill(SURE);
    for (const b of this.bombesTmp) b.range = -1;
    let i = 1;
    for (let p = this.game.exploList; p !== null && i < 100; p = p.next, i++) {
      const b = this.bombesTmp[i]!;
      Object.assign(b, {
        x: p.x,
        y: p.y,
        dx: p.dx,
        dy: p.dy,
        dir: p.dir,
        count: p.count,
        range: p.range,
        type: p.type,
      });
      if (mineExplodeNow && p.player === this.game.players[this.numBot]) b.count = 0;
    }
    this.calcLabyPerf();
  }

  /** breadth-first search from my cell, in each direction (parcours_par_niveau) */
  private parcoursParNiveau(ps: Player): void {
    const game = this.game;
    const x = idiv(ps.x, BLOCK_WIDTH);
    const y = idiv(ps.y, BLOCK_HEIGHT) + 1;
    const porteeBombe = ps.illness === Ill.Mini ? 1 : ps.range;
    this.perfMax[STOP] = this.scoreShrink(x, y, ps.stunned);
    if (this.perfMax[STOP]! > MALUS_MORT) this.perfMax[STOP]! += this.perf(x, y) + ps.invincible;
    if (this.perfMax[STOP] === SURE) {
      this.perfMax[STOP]! += this.scoreExplose(x, y, porteeBombe);
      this.perfMax[STOP]! += this.scoreTue(x, y, porteeBombe);
    }
    this.perfMax[STOP]! += 60;
    for (let dir = 1; dir < NB_DIR; dir++) {
      const [dx, dy] = conversionDirection(dir);
      this.labyVisit.fill(0);
      if (inMaze(x, y)) this.labyVisit[at(x, y)] = 1;
      if (
        inMaze(x + dx, y + dy) &&
        !game.checkMaze(x + dx, y + dy) &&
        this.scoreShrink(x + dx, y + dy, ps.stunned) > MALUS_MORT &&
        this.dirigeVersBonus(x, y, dir) !== -1 &&
        !game.checkBomb(x + dx, y + dy)
      ) {
        const malus = Math.min(0, this.scoreBonus(x + dx, y + dy));
        this.file = [{ x: x + dx, y: y + dy, temps: this.dureeDeplacement + ps.stunned, malus }];
        for (let c = this.file.shift(); c; c = this.file.shift()) this.testeCase(c, dir, ps);
      }
    }
  }

  /** true when it is possible and worth dropping a bomb (souhaite_poser_bombe) */
  private souhaitePoserBombe(ps: Player): boolean {
    const mazex = idiv(ps.x, BLOCK_WIDTH);
    const mazey = idiv(ps.y, BLOCK_HEIGHT) + 1;
    const porteeBombe = ps.illness === Ill.Mini ? 1 : ps.range;
    if (this.game.checkBomb(mazex, mazey)) return false;
    if (ps.illness === Ill.Empty || ps.illness === Ill.Teleport || ps.illness === Ill.Malfunction) return false;
    if (ps.bombs === 0) return false;
    const score = this.scoreExplose(mazex, mazey, porteeBombe) + this.scoreTue(mazex, mazey, porteeBombe);
    if (score < 0) return false;
    if (score === 0 && Math.trunc(this.rand() * PROB_POSER) !== 0) return false;
    return this.nbEnnemisVivants > 0;
  }

  /** 1 when I head for an extra, -1 for poison (dirige_vers_bonus) */
  private dirigeVersBonus(x: number, y: number, dir: number): number {
    const [dx, dy] = conversionDirection(dir);
    const m = this.game.mazeAt(x + dx, y + dy);
    if (m === BT.Special && this.game.level.specialExtra === "poison") return -1;
    return m === BT.Bomb || m === BT.Range || m === BT.Special ? 1 : 0;
  }

  /** best direction (choix_direction) */
  private choixDirection(): { choixDir: number; maxPerf: number } {
    const perfMax = this.perfMax;
    let choixDir = STOP;
    let maxPerf = 0;
    for (let dir = 0; dir < NB_DIR; dir++) {
      if (perfMax[dir]! > 10 * LONG_FUSE) perfMax[dir]! += Math.trunc(this.rand() * 10);
      if (dir === this.oldDir && dir === 0) perfMax[dir]! -= 100;
      if (perfMax[dir]! > maxPerf) {
        maxPerf = perfMax[dir]!;
        choixDir = dir;
      } else if (perfMax[dir] === maxPerf) {
        // C: "(int)(rand / (RAND_MAX + 1.0)) * 5 == dir": the cast comes first, so it is 0
        this.rand();
        if (dir === 0) choixDir = dir;
      }
    }
    for (let dir = 0; dir < NB_DIR; dir++) {
      for (let dir1 = 0; dir1 < NB_DIR; dir1++) {
        if (perfMax[dir] === perfMax[dir1] && dir !== dir1 && dir < dir1) {
          if (dir === this.oldDir) perfMax[dir]! += 75;
          else perfMax[dir]!++;
        }
      }
    }
    for (let dir = 0; dir < NB_DIR; dir++) {
      if (perfMax[dir]! > maxPerf) {
        maxPerf = perfMax[dir]!;
        choixDir = dir;
      }
    }
    perfMax.fill(0);
    this.oldDir = choixDir;
    return { choixDir, maxPerf };
  }

  /** true when I decide to fire my remote controlled bombs now (test_biscotte) */
  private testBiscotte(ps: Player): boolean {
    const x = idiv(ps.x, BLOCK_WIDTH);
    const y = idiv(ps.y, BLOCK_HEIGHT) + 1;
    const securiteInit = this.perf(x, y);
    let mesBombes = 0;
    for (let bombe = this.game.exploList; bombe !== null; bombe = bombe.next) {
      if (bombe.player === ps) {
        mesBombes++;
        this.initLabyPerf(true);
      }
    }
    return mesBombes > 0 && (this.perf(x, y) === securiteInit || ps.invincible > 5);
  }

  private actions(ps: Player): void {
    const game = this.game;
    const x = idiv(ps.x, BLOCK_WIDTH);
    const y = idiv(ps.y, BLOCK_HEIGHT) + 1;
    let dx = 0;
    let dy = 0;
    this.defScoreExtra(ps);
    this.initLabyPerf();
    this.parcoursParNiveau(ps);
    let { choixDir, maxPerf } = this.choixDirection();

    this.votePoser = false;
    if (this.souhaitePoserBombe(ps)) {
      const dureeMeche = game.curBombTime;
      this.parcoursParNiveau(ps);
      for (let dir = 0; dir < NB_DIR; dir++) {
        if (this.perfMax[dir]! > 10 * LONG_FUSE || dureeMeche < ps.invincible) {
          this.votePoser = true;
          break;
        }
      }
      if (this.votePoser) {
        ({ choixDir, maxPerf } = this.choixDirection());
        if (this.dirigeVersBonus(x, y, choixDir)) this.votePoser = false;
        if (!(ps.remote_control > 0)) {
          let i = 1;
          [dx, dy] = conversionDirection(choixDir);
          if (!game.checkBomb(x - this.olddx, y - this.olddy)) i = 0;
          const room = (cx: number, cy: number) => game.checkMazeFree2(cx, cy) && !game.checkBomb(cx, cy);
          if (dx - 1 !== 0 && dy !== 0 && room(x + dx - 1, y + dy)) i = 0;
          if (dx !== 0 && dy + 1 !== 0 && room(x + dx, y + dy + 1)) i = 0;
          if (dx !== 0 && dy - 1 !== 0 && room(x + dx, y + dy - 1)) i = 0;
          if (dx + 1 !== 0 && dy !== 0 && room(x + dx + 1, y + dy)) i = 0;
          if (i) this.votePoser = false;
          if (this.olddx === -dx && this.olddy === -dy) this.votePoser = false;
          if (ps.invincible > 5 && ps.remote_control > 0) this.votePoser = true;
        }
      }
    }
    /* about to die: drop a bomb anyway and move */
    if (maxPerf <= 30) {
      this.vote[STOP]! -= 300;
      this.votePoser = true;
    }
    this.voteActionSpeciale = false;
    if (ps.remote_control > 0 && (maxPerf > 10 * LONG_FUSE || ps.invincible > 5) && this.testBiscotte(ps)) {
      this.voteActionSpeciale = true;
      choixDir = STOP;
      this.votePoser = false;
    }
    if (ps.num_morph > 0) this.voteActionSpeciale = true;
    if (ps.teleport > 0 && maxPerf < 50) {
      this.voteActionSpeciale = true;
      choixDir = STOP;
      this.votePoser = false;
    }
    this.vote[choixDir]! += 200;
    this.olddy = dy;
    this.olddx = dx;
  }

  private inversion(dir: Dir): Dir {
    return dir >= Dir.Up && dir <= Dir.Right ? turnOpposite[dir]! : dir;
  }

  /** to stop wiggling between two bombs (decoince) */
  private decoince(dir: Dir): Dir {
    this.compteur++;
    if (this.compteur > 4) {
      this.compteur = 0;
      return dir;
    }
    return Dir.Default;
  }

  /** true when a last bomb can still kill enemies (repose_en_mourant) */
  private reposeEnMourant(ps: Player): boolean {
    const mazex = idiv(Math.trunc(ps.x + 0.5 * BLOCK_WIDTH), BLOCK_WIDTH);
    const mazey = idiv(Math.trunc(ps.y + 0.5 * BLOCK_HEIGHT), BLOCK_HEIGHT) + 1;
    const porteeBombe = ps.illness === Ill.Mini ? 1 : ps.range;
    return this.scoreTue(mazex, mazey, porteeBombe) >= 0 && this.nbEnnemisVivants > 0;
  }
}

function emptyBomb(): TmpBomb {
  return { x: 0, y: 0, dx: 0, dy: 0, dir: Dir.Stop, count: 0, range: -1, type: BMT.normal };
}
