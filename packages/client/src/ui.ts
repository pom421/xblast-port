// The page around the game: the board (a canvas), the setup form, and the two
// places for messages (overlay on the board, banner under it).

import { HEIGHT, WIDTH } from "./render.ts";
import { SCOREH } from "./status.ts";

export const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

export const canvas = $<HTMLCanvasElement>("#game");
canvas.width = WIDTH;
canvas.height = HEIGHT + SCOREH;
export const ctx = canvas.getContext("2d")!;
ctx.imageSmoothingEnabled = false;

export const setupForm = $<HTMLFormElement>("#setup");
export const overlay = $<HTMLDivElement>("#overlay");
export const banner = $<HTMLDivElement>("#banner");

/** Text of a player or of the server, safe inside HTML (also in "…" attributes). */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function showOverlay(html: string | null): void {
  overlay.hidden = html === null;
  if (html !== null) overlay.innerHTML = html;
}

/** Hint under the board (the original shows it in the status bar). */
export function showBanner(html: string | null): void {
  banner.hidden = html === null;
  if (html !== null) banner.innerHTML = html;
}
