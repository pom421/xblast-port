// The status bar of the original below the board (status.c, x11c_tile.c): a
// face and a number per player, the text field with its message queue, and
// the time LEDs, colored at the times the level shrinks or scrambles.

import { BASE_X, BASE_Y, GAME_TIME, MAZE_W, PIXH, PIXW, TIME_STEP, type Game } from "@xblast/sim";
import { loadScore, type PlayerLook, type Sprite } from "./assets.ts";
import { parseColor, readEpm, readPpm, recolorBlock, recolorSprite, toCanvas, type Color5 } from "./images.ts";
import { drawTextbox, FF, type ScreenAssets } from "./screens.ts";

/* geom.h */
const STAT_WIDTH = 6 * BASE_X;
const STAT_HEIGHT = 8 * BASE_Y;
const LED_WIDTH = 2 * BASE_X;
const LED_HEIGHT = (8 * BASE_Y) / 3;
/** height of the status bar, under the board (the second row is the chat of the original) */
export const SCOREH = 2 * STAT_HEIGHT + LED_HEIGHT;
const STAT_W = PIXW / STAT_WIDTH;
const NUM_LEDS = 4 * MAZE_W;

/* score tiles (SBVoid, SBTextLeft, SBTextMid, SBTextRight) */
const tileFiles = ["tile_void", "text_left", "text_middle", "text_right"];
const SBVoid = 0;
const SBTextLeft = 1;
const SBTextMid = 2;
const SBTextRight = 3;

/** faces of a player, in the order of imgFileScorePlayer */
const faceFiles = ["player_dead", "player_sick", "player", "player_abort", "player_sick_abort"];
const Face = { Dead: 0, Sick: 1, Player: 2, Abort: 3, SickAbort: 4 } as const;

/* LEDs: off, on, then the shrink, scramble draw and scramble delete times (XBCC) */
const LedOff = 0;
const LedShrink = 2;
const LedDraw = 3;
const LedDelete = 4;

const facePos = [0, 2, 4, 14, 16, 18];
const textLeft = 6;
const textRight = 13;

const MAX_MSG = 8;
/** frames a queued message stays, by the number of queued messages */
const msgDelay = [-1, 50, 40, 20, 12, 7, 7, 7, 7];

/* default color config (x11_config.c) and fixed colors (color.h) */
const BLACK = "#000000";
const STATUS_FG = "#e8d880"; // light goldenrod
const STATUS_BG = "#884010"; // saddle brown
const STATUS_LED = "#00f878"; // spring green
const ledColors = [STATUS_LED, STATUS_LED, "#f80000", "#f8a000", "#0000f8"];

export interface StatusAssets {
  tiles: Sprite[];
  leds: Sprite[];
}

/** InitTiles: score tiles and LEDs */
export async function loadStatus(): Promise<StatusAssets> {
  const cch = async (name: string, add: string) =>
    toCanvas(
      recolorBlock(readPpm(await loadScore(`${name}.ppm`)), parseColor(BLACK), parseColor(STATUS_FG), parseColor(add)),
    );
  const [tiles, leds] = await Promise.all([
    Promise.all(tileFiles.map((name) => cch(name, STATUS_BG))),
    Promise.all(ledColors.map((color, i) => cch(i === LedOff ? "led_off" : "led_on", color))),
  ]);
  return { tiles, leds };
}

/** GUI_LoadPlayerScoreTiles: the 5 faces of a player, in its colors. */
export async function loadFaces(look: PlayerLook): Promise<Sprite[]> {
  const [helmet, face, , handsFeet, armsLegs] = look.colors;
  const colors: Color5[] = [...[helmet, face, handsFeet, armsLegs, STATUS_FG, STATUS_BG].map(parseColor), [31, 31, 31]];
  return Promise.all(
    faceFiles.map(async (name) => toCanvas(recolorSprite(readEpm(await loadScore(`${name}.epm`)), colors))),
  );
}

const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
const div = (a: number, b: number) => Math.trunc(a / b);

/* text boxes, relative to the board */
const statusBox = box(
  div(77 * STAT_WIDTH, 12),
  div(79 * STAT_HEIGHT, 6),
  div(87 * STAT_WIDTH, 12),
  div(2 * STAT_HEIGHT, 3),
);
/** number of a player: lives during a round, victories otherwise */
const numberBox = (pos: number) =>
  box(
    div((12 * pos + 1) * STAT_WIDTH, 12),
    div(79 * STAT_HEIGHT, 6),
    div(8 * STAT_WIDTH, 12) - 1,
    div(4 * STAT_HEIGHT, 6),
  );
/** victories of a player, in a corner of its number */
const victoryBox = (pos: number) =>
  box(
    div((12 * pos + 1) * STAT_WIDTH, 12) - 2,
    div(79 * STAT_HEIGHT, 6) - 2,
    div(4 * STAT_WIDTH, 16) - 1,
    div(2 * STAT_HEIGHT, 6),
  );

const digit = (value: number) => String.fromCharCode(48 + value);

export class StatusBar {
  private face: number[] = [];
  private numbers: number[] = [];
  private victories: number[] = [];
  private readonly leds = Array<number>(NUM_LEDS).fill(1);
  private gameNext = TIME_STEP;
  private timeLed = NUM_LEDS;
  private defaultMessage = "";
  private text = "";
  /** queued messages, the shown one first */
  private queue: string[] = [];
  private msgRestore = 0;

  private readonly assets: StatusAssets;
  private readonly screens: ScreenAssets;
  /** faces of the players of the match, by slot */
  private readonly faces: Sprite[][];

  constructor(assets: StatusAssets, screens: ScreenAssets, faces: Sprite[][]) {
    this.assets = assets;
    this.screens = screens;
    this.faces = faces;
  }

  /**
   * ResetStatusBar: with a game, the numbers are the lives and the LEDs show
   * when the level shrinks and scrambles; without one, the victories.
   */
  reset(message: string, victories: number[], game: Game | null): void {
    this.victories = [...victories];
    this.face = victories.map(() => Face.Player);
    this.numbers = game ? game.players.map((p) => p.lives) : [...victories];
    this.defaultMessage = message;
    this.queue = [];
    this.text = message;
    this.leds.fill(1);
    if (game) {
      // getShrinkTimes: each time once, up to the end marker
      for (const time of new Set(game.shrinkSteps.map((s) => s.time))) {
        if (time === 0 || time === 2 * GAME_TIME) break;
        this.setLed(time, LedShrink);
      }
      // getScrambleTimes: delete first, in case both are at the same time
      const del = game.level.scrambleDel.time;
      if (del !== 0) {
        this.setLed(del, LedDelete);
        const draw = game.level.scrambleDraw.time;
        if (draw !== 0) this.setLed(draw, LedDraw);
      }
    }
    this.gameNext = TIME_STEP;
    this.timeLed = NUM_LEDS;
  }

  private setLed(time: number, led: number): void {
    if (time < 0 || time >= GAME_TIME) return;
    const i = NUM_LEDS - div(time, TIME_STEP);
    if (i < NUM_LEDS) this.leds[i] = led;
  }

  /** UpdateStatusBar, once a frame during a round. */
  update(game: Game): void {
    game.players.forEach((p, slot) => {
      if (p.dying || p.lives === 0) this.face[slot] = Face.Dead;
      else if (p.illness !== p.health) this.face[slot] = p.abort ? Face.SickAbort : Face.Sick;
      else this.face[slot] = p.abort ? Face.Abort : Face.Player;
      this.numbers[slot] = p.lives;
    });
    // one LED a frame in the original; a loop for the fast-forward
    while (game.gameTime > this.gameNext && this.timeLed > 0) {
      this.gameNext += TIME_STEP;
      this.leds[--this.timeLed] = LedOff;
    }
    if (this.queue.length) {
      this.msgRestore++;
      if (this.msgRestore >= msgDelay[this.queue.length]!) {
        this.queue.shift();
        this.text = this.queue[0] ?? this.defaultMessage;
        this.msgRestore = 0;
      }
    }
  }

  /** SetMessage: `perm` replaces the shown message, otherwise it is queued for a while. */
  setMessage(message: string, perm: boolean): void {
    if (perm) {
      this.text = message;
      this.queue = [];
      return;
    }
    if (!this.queue.length) {
      this.msgRestore = 0;
      this.text = message;
    }
    this.queue.push(message);
    if (this.queue.length > MAX_MSG) this.queue.shift();
  }

  /** ResetMessage: back to the queued message, or the default one. */
  resetMessage(): void {
    this.text = this.queue[0] ?? this.defaultMessage;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const { tiles, leds } = this.assets;
    const row = Array<Sprite>(STAT_W).fill(tiles[SBVoid]!);
    this.face.forEach((face, slot) => {
      row[facePos[slot]!] = this.faces[slot]![face]!;
      row[facePos[slot]! + 1] = tiles[SBTextRight]!;
    });
    row[textLeft] = tiles[SBTextLeft]!;
    for (let x = textLeft + 1; x < textRight; x++) row[x] = tiles[SBTextMid]!;
    row[textRight] = tiles[SBTextRight]!;
    row.forEach((tile, x) => ctx.drawImage(tile, x * STAT_WIDTH, PIXH));
    for (let x = 0; x < STAT_W; x++) {
      for (let y = 1; y < 3; y++) ctx.drawImage(tiles[SBVoid]!, x * STAT_WIDTH, PIXH + y * STAT_HEIGHT);
    }
    this.leds.forEach((led, x) => ctx.drawImage(leds[led]!, x * LED_WIDTH, PIXH + STAT_HEIGHT));
    drawTextbox(ctx, this.screens, this.text, FF.Medium | FF.White | FF.Boxed, statusBox, false);
    this.numbers.forEach((n, slot) => {
      const pos = facePos[slot]! + 1;
      drawTextbox(ctx, this.screens, digit(n), FF.Large | FF.White | FF.Boxed, numberBox(pos), false);
      drawTextbox(
        ctx,
        this.screens,
        digit(this.victories[slot]!),
        FF.Small | FF.White | FF.Boxed,
        victoryBox(pos),
        false,
      );
    });
  }
}
