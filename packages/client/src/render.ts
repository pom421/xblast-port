// Canvas2D rendering of a game, like GameUpdateWindow: maze blocks, explosion
// tiles, sprites sorted by depth (y + ysort), then explosion overlays.

import { BASE_Y, BLOCK_HEIGHT, BLOCK_WIDTH, BT, MAZE_H, MAZE_W, PIXH, PIXW, SPM, type Game } from "@xblast/sim";
import { spriteRects, type CommonSprites, type PlayerSprites, type Sprite } from "./assets.ts";

export const WIDTH = PIXW;
export const HEIGHT = PIXH;

export interface Scene {
  blocks: Sprite[];
  common: CommonSprites;
  players: PlayerSprites[];
}

interface DrawItem {
  depth: number;
  draw: () => void;
}

export function render(ctx: CanvasRenderingContext2D, game: Game, scene: Scene): void {
  const { blocks, common, players } = scene;
  /* maze */
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  for (let x = 0; x < MAZE_W; x++) {
    for (let y = 0; y < MAZE_H; y++) {
      const px = x * BLOCK_WIDTH;
      const py = y * BLOCK_HEIGHT;
      const expl = game.explAt(x, y);
      if (expl & 0x10) {
        // explosion tile: floor block, explosion over it
        ctx.drawImage(blocks[0]!, px, py);
        ctx.drawImage(common.explosions[expl & 0xf]!, px, py);
        continue;
      }
      const block = game.mazeAt(x, y);
      if (block >= 0 && block !== BT.Background) ctx.drawImage(blocks[block]!, px, py);
    }
  }
  /* sprites, sorted like the original sprite list */
  const items: DrawItem[] = [];
  for (let e = game.exploList; e !== null; e = e.next) {
    if (e.sprite === null || !(e.spriteMode & SPM.MAPPED)) continue;
    const bomb = e;
    const x = bomb.x * BLOCK_WIDTH + bomb.dx;
    const y = bomb.y * BLOCK_HEIGHT + bomb.dy;
    items.push({
      depth: y + BASE_Y / 2,
      draw: () => {
        const set = bomb.spriteMode & SPM.MASKED ? common.bombMasks : common.bombs;
        const image = set[bomb.sprite!]![Math.min(bomb.anime, 16)];
        if (image) ctx.drawImage(image, x, y);
      },
    });
  }
  game.players.forEach((p) => {
    if (!(p.spriteMode & SPM.MAPPED)) return;
    const look = players[p.look];
    if (!look) return;
    const y = p.morphed ? p.y + BASE_Y : p.y;
    items.push({
      depth: y + BLOCK_HEIGHT,
      draw: () => {
        const [rx, ry, rw, rh] = spriteRects[p.anime] ?? spriteRects[0]!;
        const image = (p.spriteMode & SPM.MASKED ? look.masks : look.frames)[p.anime];
        if (image) ctx.drawImage(image, 0, 0, rw, rh, p.x + rx, y + ry, rw, rh);
      },
    });
  });
  items.sort((a, b) => a.depth - b.depth);
  for (const item of items) item.draw();
  /* explosions over the sprites (UpdateExpl) */
  for (let x = 0; x < MAZE_W; x++) {
    for (let y = 0; y < MAZE_H; y++) {
      const expl = game.explAt(x, y);
      if (expl & 0x10) ctx.drawImage(common.explosions[expl & 0xf]!, x * BLOCK_WIDTH, y * BLOCK_HEIGHT);
    }
  }
}
