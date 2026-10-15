// Loads the original graphics (assets/image) and prepares them for Canvas2D:
// level blocks recolored like the original, explosion tiles, bombs, players.

import { BASE_X, BASE_Y, MAX_BLOCK, type Level } from "@xblast/sim";
import {
  fetchBytes,
  maskImage,
  parseColor,
  readEpm,
  readPbm,
  readPpm,
  recolorBlock,
  recolorSprite,
  rgbImage,
  toCanvas,
  type Color5,
} from "./images.ts";

export type Sprite = HTMLCanvasElement;

/** Player look: shape and the 6 colors of the player config (helmet first). */
export interface PlayerLook {
  name: string;
  shape: string;
  colors: [string, string, string, string, string, string];
}

/** The 6 default players of XBlast (config/player.cfg). */
export const defaultPlayers: PlayerLook[] = [
  { name: "Olaf", shape: "tall", colors: ["#000000", "#d0b088", "#000000", "#f8a000", "#000000", "#f8a000"] },
  { name: "Alex", shape: "girl", colors: ["#f81090", "#f8a078", "#d870d0", "#00f878", "#4068e0", "#f81090"] },
  { name: "Harald", shape: "fat", colors: ["#f8f800", "#f8a078", "#00f878", "#f84000", "#f8f8e0", "#4068e0"] },
  { name: "Rodi", shape: "normal", colors: ["#f80000", "#f8a078", "#f80000", "#208820", "#c85858", "#88b888"] },
  { name: "Norbert", shape: "normal", colors: ["#181870", "#f8a078", "#000080", "#f80000", "#4068e0", "#f8d000"] },
  { name: "Olli", shape: "normal", colors: ["#40e0a8", "#f8a078", "#f8f8f8", "#c0c0c0", "#404040", "#4068e0"] },
];

/** imgRectSprite (image.c): where each player animation is drawn, from the player position. */
export const spriteRects: [number, number, number, number][] = [
  ...Array.from({ length: 5 }, () => [0, 3, 8, 13] as [number, number, number, number]),
  ...Array.from({ length: 10 }, () => [0, 4, 8, 11] as [number, number, number, number]),
  ...Array.from({ length: 5 }, () => [0, 4, 8, 12] as [number, number, number, number]),
  [0, 3, 8, 12],
  [1, 6, 8, 10],
  [0, 8, 8, 8],
  [-1, 6, 8, 10],
  [0, 4, 8, 11],
  [0, 4, 8, 11],
  [0, 4, 8, 11],
  [0, 2, 8, 13],
  [0, 2, 8, 13],
  [0, 3, 8, 12],
  [-4, -3, 16, 25],
  [0, 5, 8, 10],
  [0, 5, 8, 11],
  [0, 5, 8, 9],
  [0, 5, 8, 11],
  [0, 7, 8, 8],
  [0, 5, 8, 10],
].map(([x, y, w, h]) => [x! * BASE_X, y! * BASE_Y, w! * BASE_X, h! * BASE_Y]);

const epmNames = [
  ..."D U R L".split(" ").flatMap((d) => [`${d}_S`, `${d}_0`, `${d}_1`, `${d}_2`, `${d}_3`]),
  "DD",
  "DL",
  "DU",
  "DR",
  "L",
  "L1",
  "L2",
  "W",
  "W2",
  "W3",
  "B",
];
const ppmNames = ["skel_D", "skel_L", "skel_U", "skel_R", "morph", "zombie"];

const cache = new Map<string, Promise<Uint8Array>>();
function file(path: string): Promise<Uint8Array> {
  let bytes = cache.get(path);
  if (!bytes) {
    bytes = fetchBytes(`${import.meta.env.BASE_URL}${path}`);
    cache.set(path, bytes);
  }
  return bytes;
}

export interface PlayerSprites {
  /** by animation (BMSpriteAnimation) */
  frames: Sprite[];
  /** silhouettes, for blinking (SPM_MASKED) */
  masks: Sprite[];
}

export async function loadPlayer(look: PlayerLook): Promise<PlayerSprites> {
  const colors: Color5[] = [...look.colors.map(parseColor), [31, 31, 31]];
  const frames: Sprite[] = [];
  const masks: Sprite[] = [];
  await Promise.all([
    ...epmNames.map(async (name, i) => {
      const base = `image/sprite/${look.shape}_${name}`;
      const [epm, pbm] = await Promise.all([file(`${base}.epm`), file(`${base}.pbm`)]);
      const mask = readPbm(pbm);
      frames[i] = toCanvas(recolorSprite(readEpm(epm), colors, mask));
      masks[i] = toCanvas(maskImage(mask, [255, 255, 255]));
    }),
    ...ppmNames.map(async (name, i) => {
      const [ppm, pbm] = await Promise.all([file(`image/sprite/${name}.ppm`), file(`image/sprite/${name}.pbm`)]);
      const mask = readPbm(pbm);
      frames[epmNames.length + i] = toCanvas(rgbImage(readPpm(ppm), mask));
      masks[epmNames.length + i] = toCanvas(maskImage(mask, [255, 255, 255]));
    }),
  ]);
  return { frames, masks };
}

export interface CommonSprites {
  /** [normal, mini][anime 0..16] */
  bombs: Sprite[][];
  bombMasks: Sprite[][];
  /** explosion overlays expl00..expl0f */
  explosions: Sprite[];
}

export async function loadCommon(): Promise<CommonSprites> {
  const bombs: Sprite[][] = [[], []];
  const bombMasks: Sprite[][] = [[], []];
  const explosions: Sprite[] = [];
  const masked = async (base: string) => {
    const [ppm, pbm] = await Promise.all([file(`${base}.ppm`), file(`${base}.pbm`)]);
    const mask = readPbm(pbm);
    return { image: toCanvas(rgbImage(readPpm(ppm), mask)), mask: toCanvas(maskImage(mask, [255, 255, 255])) };
  };
  await Promise.all([
    ...["bomb", "mini"].flatMap((kind, k) =>
      Array.from({ length: 17 }, async (_, a) => {
        const { image, mask } = await masked(`image/explosion/${kind}_${a === 16 ? "x" : a}`);
        bombs[k]![a] = image;
        bombMasks[k]![a] = mask;
      }),
    ),
    ...Array.from({ length: 16 }, async (_, i) => {
      explosions[i] = (await masked(`image/explosion/expl0${i.toString(16)}`)).image;
    }),
  ]);
  return { bombs, bombMasks, explosions };
}

/** The 11 blocks of a level ([graphics] section), recolored. */
export async function loadBlocks(level: Level): Promise<Sprite[]> {
  return Promise.all(
    level.blocks.slice(0, MAX_BLOCK).map(async (block) => {
      const ppm = readPpm(await file(`image/block/${block.name}.ppm`));
      if (!block.colors) return toCanvas(rgbImage(ppm));
      const [fg, bg, add] = block.colors.map(parseColor) as [Color5, Color5, Color5];
      return toCanvas(recolorBlock(ppm, fg, bg, add));
    }),
  );
}

export async function loadLevelText(fileName: string): Promise<string> {
  return new TextDecoder("latin1").decode(await file(`levels/${fileName}`));
}

export interface LevelEntry {
  file: string;
  name: string;
  players: number;
  gameMode: number;
}

export async function loadLevelIndex(): Promise<LevelEntry[]> {
  return JSON.parse(new TextDecoder().decode(await file("levels/index.json"))) as LevelEntry[];
}
