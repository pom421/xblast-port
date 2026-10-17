// The screens of the original between the rounds (intro.c, introdat.c): level
// intro with its info boxes, winner animation at the end of a round, score
// board with its audience, and the winner of the match with a la ola.

import {
  BASE_X,
  BASE_Y,
  BLOCK_HEIGHT,
  BLOCK_WIDTH,
  MAZE_H,
  MAZE_W,
  PIXW,
  type Game,
  type Level,
  type LevelInfo,
} from "@xblast/sim";
import { loadBlocks, loadMisc, type Sprite } from "./assets.ts";
import { parseColor, readPpm, recolorBlock, toCanvas } from "./images.ts";
import { drawPlayer, render, type Scene } from "./render.ts";

/* sprite animations (BMSpriteAnimation) */
const StopDown = 0;
const StopUp = 5;
const DamagedDown = 20;
const Looser = 24;
const Looser1 = 25;
const Looser2 = 26;
const Winner = 27;
const Winner2 = 28;
const Winner3 = 29;
const BigWinner = 30;

const winnerAnime = [StopDown, Winner3, Winner2, Winner, Winner, Winner2, Winner3, StopDown];
const looserAnime = [Looser, Looser, Looser1, Looser1, Looser, Looser, Looser, Looser2, Looser2, Looser];
const otherWinnerAnime = [...winnerAnime, ...Array<number>(32).fill(StopDown)];
const otherLooserAnime = [...looserAnime, ...Array<number>(30).fill(StopDown)];
const laOlaAnime = [
  StopDown,
  Winner3,
  Winner2,
  Winner,
  Winner,
  Winner,
  Winner,
  Winner2,
  Winner3,
  ...Array<number>(23).fill(StopDown),
];

/* ------------------------------------------------------------------ */
/* text boxes (x11c_text.c)                                           */
/* ------------------------------------------------------------------ */

export const FF = {
  Large: 0x00,
  Medium: 0x01,
  Small: 0x02,
  Black: 0x00,
  White: 0x04,
  Boxed: 0x08,
  Transparent: 0x10,
  Outlined: 0x20,
} as const;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface TextBox {
  text: string | null;
  flags: number;
  rect: Rect;
}

/** default fonts of the X11 version: helvetica bold 24, 18 and 14 pixels */
const fonts = ["bold 24px Helvetica, Arial, sans-serif", "bold 18px Helvetica, Arial, sans-serif"];
fonts[FF.Small] = "bold 14px Helvetica, Arial, sans-serif";

export interface ScreenAssets {
  /** tiles of the light (gold) and dark (blue) text colors */
  light: Sprite;
  dark: Sprite;
  /** blocks of the score board (graphicsScoreBoard) */
  scoreBlocks: Sprite[];
}

/* default color config (x11_config.c) */
const BLACK = "#000000";
const MIDNIGHT_BLUE = "#181870";
const GOLD = "#f8d000";
const YELLOW = "#f8f800";
const LIGHT_STEEL_BLUE = "#b0c0d8";
const FIRE_BRICK_1 = "#f83030";
const SPRING_GREEN = "#00f878";
const ROYAL_BLUE = "#4068e0";

const scoreGraphics: [string, string, string, string][] = [
  ["score_right_up", BLACK, LIGHT_STEEL_BLUE, BLACK],
  ["score_right_down", BLACK, FIRE_BRICK_1, BLACK],
  ["score_mid_up", BLACK, SPRING_GREEN, LIGHT_STEEL_BLUE],
  ["score_mid_down", BLACK, FIRE_BRICK_1, LIGHT_STEEL_BLUE],
  ["score_left_up", BLACK, SPRING_GREEN, LIGHT_STEEL_BLUE],
  ["score_left_down", BLACK, FIRE_BRICK_1, LIGHT_STEEL_BLUE],
  ["score_floor", BLACK, SPRING_GREEN, BLACK],
  ["score_step", BLACK, FIRE_BRICK_1, LIGHT_STEEL_BLUE],
  ["score_drop", BLACK, FIRE_BRICK_1, SPRING_GREEN],
  ["score_floor", BLACK, BLACK, BLACK],
  ["score_floor", ROYAL_BLUE, ROYAL_BLUE, ROYAL_BLUE],
];

export async function loadScreens(): Promise<ScreenAssets> {
  const cch = async (name: string, fg: string, bg: string, add: string) =>
    toCanvas(recolorBlock(readPpm(await loadMisc(name)), parseColor(fg), parseColor(bg), parseColor(add)));
  const [light, dark, scoreBlocks] = await Promise.all([
    cch("text_fg", BLACK, GOLD, YELLOW),
    cch("text_bg", BLACK, BLACK, MIDNIGHT_BLUE),
    loadBlocks({ blocks: scoreGraphics.map(([name, ...colors]) => ({ name, colors })) }),
  ]);
  return { light, dark, scoreBlocks };
}

/** A tiled color, like the tiled X11 graphics contexts (tile origin: 0, oy). */
function tiled(ctx: CanvasRenderingContext2D, tile: Sprite, oy: number): CanvasPattern {
  const pattern = ctx.createPattern(tile, "repeat")!;
  pattern.setTransform(new DOMMatrix([1, 0, 0, 1, 0, oy]));
  return pattern;
}

/** GUI_DrawTextbox; without `fit`, GUI_DrawSimpleTextbox (the text is clipped, not shortened) */
export function drawTextbox(
  ctx: CanvasRenderingContext2D,
  assets: ScreenAssets,
  text: string | null,
  flags: number,
  { x, y, w, h }: Rect,
  fit = true,
): void {
  const oy = y + Math.trunc((h - BLOCK_HEIGHT) / 2);
  const [fgTile, bgTile] = flags & FF.White ? [assets.light, assets.dark] : [assets.dark, assets.light];
  const fg = tiled(ctx, fgTile, oy);
  const bg = tiled(ctx, bgTile, oy);
  ctx.save();
  if (flags & FF.Boxed) {
    ctx.fillStyle = bg;
    if (flags & FF.Transparent) {
      for (let dy = 0; dy < h; dy += 2) ctx.fillRect(x, y + dy, w, 1);
    } else {
      ctx.fillRect(x, y, w, h);
    }
    ctx.strokeStyle = fg;
    ctx.lineWidth = BASE_X / 4;
    ctx.strokeRect(x, y, w, h);
  }
  if (text) {
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.font = fonts[flags & 3]!;
    // DrawAlignedText: drop the last characters until the text fits
    let shown = text;
    while (fit && shown && ctx.measureText(shown).width > w - 2 * BASE_X) shown = shown.slice(0, -1);
    const metrics = ctx.measureText(shown);
    const height = metrics.fontBoundingBoxAscent - metrics.fontBoundingBoxDescent;
    const tx = x + Math.trunc((w - metrics.width) / 2);
    const ty = y + Math.trunc((height + h) / 2);
    if (flags & FF.Outlined) {
      const step = (flags & 3) === FF.Small ? 1 : BASE_X / 4;
      ctx.fillStyle = bg;
      for (let dx = -step; dx <= step; dx += step) {
        for (let dy = -step; dy <= step; dy += step) if (dx || dy) ctx.fillText(shown, tx + dx, ty + dy);
      }
    }
    ctx.fillStyle = fg;
    ctx.fillText(shown, tx, ty);
  }
  ctx.restore();
}

function drawTextboxes(ctx: CanvasRenderingContext2D, assets: ScreenAssets, boxes: TextBox[]): void {
  for (const box of boxes) drawTextbox(ctx, assets, box.text, box.flags, box.rect);
}

/* ------------------------------------------------------------------ */
/* level intro (LevelIntro)                                           */
/* ------------------------------------------------------------------ */

const BW = BLOCK_WIDTH;
const BH = BLOCK_HEIGHT;
const div = (a: number, b: number) => Math.trunc(a / b);

function titleBoxes(level: Level): TextBox[] {
  return [
    {
      text: "",
      flags: FF.White | FF.Boxed,
      rect: { x: div(13 * BW, 4), y: BH / 2 - 2, w: div(17 * BW, 2), h: BH + 4 },
    },
    {
      text: level.name,
      flags: FF.White | FF.Large,
      rect: { x: div(13 * BW, 4), y: BH / 2 - 2, w: div(17 * BW, 2), h: div(2 * BH, 3) },
    },
    {
      text: `created by ${level.author}`,
      flags: FF.White | FF.Small,
      rect: { x: div(13 * BW, 4), y: div(7 * BH, 6) - 2, w: div(17 * BW, 2), h: BH / 3 },
    },
    {
      text: level.hint,
      flags: FF.White | FF.Boxed | FF.Large,
      rect: { x: div(5 * BW, 2), y: div(67 * BH, 6), w: 10 * BW, h: div(2 * BH, 3) },
    },
    {
      text: "visit http://xblast.sf.net/",
      flags: FF.White | FF.Boxed | FF.Small,
      rect: { x: div(8 * BW, 2), y: div(73 * BH, 6), w: 7 * BW, h: div(2 * BH, 3) },
    },
  ];
}

/** playerInfoBox, levelInfoBox, extraInfoBox: frame, header, then up to 7 lines */
function infoBoxes(header: string, x: number, frameX: number, w: number, frameW: number, lines: string[]): TextBox[] {
  return [
    {
      text: "",
      flags: FF.White | FF.Boxed | FF.Transparent,
      rect: { x: frameX, y: div(5 * BH, 2), w: frameW, h: div(95 * BH, 12) },
    },
    { text: header, flags: FF.Black | FF.Boxed | FF.Medium, rect: { x, y: div(8 * BH, 3), w, h: div(2 * BH, 3) } },
    ...lines.map((text, i) => ({
      text,
      flags: FF.White | FF.Boxed | FF.Small,
      rect: { x, y: div((15 + 4 * i) * BH, 4), w, h: BH / 2 },
    })),
  ];
}

export function drawLevelIntro(
  ctx: CanvasRenderingContext2D,
  assets: ScreenAssets,
  game: Game,
  scene: Scene,
  level: Level,
  info: LevelInfo,
): void {
  render(ctx, game, scene, () => StopDown);
  drawTextboxes(ctx, assets, [
    ...titleBoxes(level),
    ...infoBoxes("Player Info", BW / 2, div(3 * BW, 8), 4 * BW, div(17 * BW, 4), info.player),
    ...infoBoxes("Level Info", div(21 * BW, 4), div(41 * BW, 8), div(9 * BW, 2), div(19 * BW, 4), info.level),
    ...infoBoxes("Extra Info", div(42 * BW, 4), div(83 * BW, 8), 4 * BW, div(17 * BW, 4), info.extra),
  ]);
}

/* ------------------------------------------------------------------ */
/* level end (LevelEnd): the winners cheer                            */
/* ------------------------------------------------------------------ */

export function drawLevelEnd(
  ctx: CanvasRenderingContext2D,
  game: Game,
  scene: Scene,
  winners: number[],
  frame: number,
): void {
  const anime = winnerAnime[frame % winnerAnime.length]!;
  render(ctx, game, scene, (slot) => (winners.includes(slot) ? anime : undefined));
}

/* ------------------------------------------------------------------ */
/* score board and winner screen                                      */
/* ------------------------------------------------------------------ */

export interface BoardPlayer {
  name: string;
  team: number;
  victories: number;
  /** left the match */
  inactive: boolean;
}

interface Actor {
  /** a player of the match, or (audience only) a default player when >= the number of players */
  look: number;
  x: number;
  y: number;
  anime: number[];
  phase: number;
}

export interface BoardScene {
  /** sprites of the players of the match */
  players: Sprite[][];
  /** sprites of the 6 default players, for the rest of the audience */
  defaults: Sprite[][];
}

/** OtherRandomNumber: the screens do not use the game generator */
const other = (n: number) => Math.floor(Math.random() * n);

/**
 * Score board (InitScoreBoard, ShowScoreBoard) or winner screen (InitWinner,
 * ShowWinner): a map of score blocks, sprites and names; `tick` animates the
 * audience, 20 times a second like DoWait.
 */
export class Board {
  private readonly map: number[][] = Array.from({ length: MAZE_W }, () => Array<number>(MAZE_H).fill(6));
  private readonly actors: Actor[] = [];
  private readonly audience: Actor[] = [];
  private readonly trophies: { x: number; y: number }[] = [];
  private readonly names: TextBox[] = [];

  private readonly assets: ScreenAssets;
  private readonly scene: BoardScene;
  private readonly bombImage: Sprite;

  private constructor(assets: ScreenAssets, scene: BoardScene, bombImage: Sprite) {
    this.assets = assets;
    this.scene = scene;
    this.bombImage = bombImage;
  }

  /** ShowScoreBoard: `lastTeam` won the round (null: nobody), `maxNumWins` is the best score. */
  static scores(
    assets: ScreenAssets,
    scene: BoardScene,
    bombImage: Sprite,
    players: BoardPlayer[],
    lastTeam: number | null,
    maxNumWins: number,
    numWins: number,
  ): Board {
    const board = new Board(assets, scene, bombImage);
    const n = players.length;
    const [yStart, yStep, yAudience] = ({ 2: [5, 4, 3], 3: [4, 3, 3], 4: [4, 2, 3], 5: [3, 2, 3] } as const)[
      n as 2
    ] ?? [1, 2, 1];
    for (let x = 0; x < MAZE_W; x++) for (let y = 0; y < MAZE_H; y++) board.map[x]![y] = y < yAudience ? 7 : 6;
    players.forEach((p, i) => {
      const y0 = yStart + yStep * i;
      // podest: higher part, step, lower part as long as the victories needed
      for (let x = 0; x < 3; x++) board.set(x, y0, 0, 1);
      board.set(3, y0, 2, 3);
      for (let x = 4; x < MAZE_W && x < 6 + numWins; x++) board.set(x, y0, 4, 5);
      const y = (y0 - 1) * BH + 4 * BASE_Y;
      const anime = p.inactive ? StopUp : p.team === lastTeam ? Winner : p.victories === maxNumWins ? StopDown : Looser;
      board.actors.push({ look: i, x: BW * 4, y, anime: [anime], phase: 0 });
      for (let j = 0; j < p.victories; j++) board.trophies.push({ x: (6 + j) * BW, y: y + BH });
      board.names.push({
        text: p.name,
        flags: FF.White | FF.Medium | FF.Boxed,
        rect: { x: BW / 4, y: (y0 + 1) * BH + div(3 * BASE_Y, 2), w: 2 * BW + 4 * BASE_X, h: 5 * BASE_Y },
      });
    });
    // audience, cheering for the players who won
    let winning = 0;
    players.forEach((p, i) => {
      if (p.team === lastTeam) winning |= 1 << i;
    });
    for (let y = 0; y < BH * yAudience; y += BH) {
      for (let x = y === BH ? -BW / 2 : 0; x < PIXW; x += BW) board.addFan(x, y, n, winning, false);
    }
    return board;
  }

  /** ShowWinner, after InitWinner: the team `lastTeam` won the match. */
  static winner(
    assets: ScreenAssets,
    scene: BoardScene,
    bombImage: Sprite,
    players: BoardPlayer[],
    lastTeam: number,
  ): Board {
    const board = new Board(assets, scene, bombImage);
    const n = players.length;
    /* InitWinner */
    for (let x = 0; x < MAZE_W; x++) {
      board.map[x]![0] = 1;
      for (let y = 1; y <= 3; y++) board.map[x]![y] = 7;
      board.map[x]![4] = 8;
    }
    /* team sizes */
    const teamSize = new Map<number, number>();
    for (const p of players) teamSize.set(p.team, (teamSize.get(p.team) ?? 0) + 1);
    let xStep = n - (teamSize.get(lastTeam) ?? 0) >= 5 ? 2 : 3;
    const teamStart = new Map<number, number>();
    let s = 0;
    for (const team of [...teamSize.keys()].sort((a, b) => a - b)) {
      if (team === lastTeam) continue;
      teamStart.set(team, s);
      s += 2 * teamSize.get(team)! - 1 + xStep;
    }
    s -= 3;
    const winners = teamSize.get(lastTeam) ?? 0;
    let xStart: number;
    [xStart, xStep] = ({ 1: [7, 2], 2: [6, 2], 3: [5, 2], 4: [4, 2], 5: [3, 2] } as const)[winners as 1] ?? [3, 1];
    /* big podest of the winners */
    for (let x = xStart - 1; x <= xStart + xStep * (winners - 1) + 1; x++) {
      if (x < 0 || x >= MAZE_W) continue;
      board.map[x]![6] = 0;
      board.map[x]![7] = 0;
      board.map[x]![8] = 1;
    }
    s = div(s, 2);
    const placed = new Map<number, number>();
    const names: string[] = [];
    let k = 0;
    players.forEach((p, i) => {
      if (p.team === lastTeam) {
        board.actors.push({
          look: i,
          x: (xStart + xStep * k++) * BW,
          y: 4 * BH + 6 * BASE_Y,
          anime: [BigWinner],
          phase: 0,
        });
        names.push(p.name);
        return;
      }
      const set = placed.get(p.team) ?? 0;
      const x = 7 + teamStart.get(p.team)! - s + set * 2;
      placed.set(p.team, set + 1);
      // C: no bound check, the podests of many teams may leave the screen
      if (x >= 0 && x < MAZE_W) board.set(x, 10, 4, 5);
      if (set + 1 < teamSize.get(p.team)! && x + 1 >= 0 && x + 1 < MAZE_W) board.set(x + 1, 10, 4, 5);
      const anime = p.inactive ? StopUp : p.victories === 0 ? DamagedDown : Looser;
      board.actors.push({ look: i, x: x * BW, y: 9 * BH + 4 * BASE_Y, anime: [anime], phase: 0 });
    });
    board.names.push({
      text: names.join(" & "),
      flags: FF.White | FF.Medium | FF.Boxed,
      rect: { x: div((30 - winners * 3) * BW, 4), y: div(49 * BH, 6), w: div(winners * 3 * BW, 2), h: div(2 * BH, 3) },
    });
    /* audience: la ola */
    for (let y = BH; y <= BH * 3; y += BH) {
      for (let x = y === 2 * BH ? -BW / 2 : 0; x < PIXW; x += BW) board.addFan(x, y, n, 0, true);
    }
    return board;
  }

  /** Blocks of a podest: `top` at (x, y), `bottom` below it. */
  private set(x: number, y: number, top: number, bottom: number): void {
    this.map[x]![y] = top;
    if (y + 1 < MAZE_H) this.map[x]![y + 1] = bottom;
  }

  /** ShowAudience / ShowLaOla */
  private addFan(x: number, y: number, numPlayers: number, winning: number, laOla: boolean): void {
    const fan = {
      x: x + other(BASE_X) - BASE_X / 2,
      y: y - other(BASE_Y) - div(4 * BH, 3),
      look: other(Math.max(6, numPlayers)),
    };
    let anime: number[];
    let phase: number;
    if (laOla) {
      anime = laOlaAnime;
      phase = (2 * laOlaAnime.length - 2 * div(fan.x, BW) + other(5)) % laOlaAnime.length;
    } else {
      if (fan.look < numPlayers) anime = (1 << fan.look) & winning ? winnerAnime : looserAnime;
      // C quirk: compares the mask of the winners with MAX_PLAYER (meant: a draw)
      else anime = winning === 6 ? otherLooserAnime : otherWinnerAnime;
      phase = other(anime.length);
    }
    this.audience.push({ ...fan, anime, phase });
  }

  /** AnimateAudience */
  tick(): void {
    for (const fan of this.audience) fan.phase = (fan.phase + 1) % fan.anime.length;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const { scoreBlocks } = this.assets;
    for (let x = 0; x < MAZE_W; x++) {
      for (let y = 0; y < MAZE_H; y++) ctx.drawImage(scoreBlocks[this.map[x]![y]!]!, x * BW, y * BH);
    }
    // sprites by depth, like the sprite list
    const { players, defaults } = this.scene;
    const sprites = [
      ...this.audience.map((a) => ({ a, frames: (a.look < players.length ? players : defaults)[a.look]! })),
      ...this.actors.map((a) => ({ a, frames: players[a.look]! })),
    ].sort((p, q) => p.a.y - q.a.y);
    for (const { a, frames } of sprites) drawPlayer(ctx, frames, a.anime[a.phase]!, a.x, a.y);
    for (const t of this.trophies) ctx.drawImage(this.bombImage, t.x, t.y);
    drawTextboxes(ctx, this.assets, this.names);
  }
}
