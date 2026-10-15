// Local game: 2 to 4 players on one keyboard, a match of several levels.
// The simulation runs at the original rate (20 frames per second).

import { FRAME_RATE, GAME_TIME, Game, parseLevel, type Level, type PlayerAction } from "@xblast/sim";
import {
  defaultPlayers,
  loadBlocks,
  loadCommon,
  loadLevelIndex,
  loadLevelText,
  loadPlayer,
  type LevelEntry,
} from "./assets.ts";
import { KeyboardInput, keyBindings } from "./input.ts";
import { HEIGHT, WIDTH, render, type Scene } from "./render.ts";
import "./style.css";

const FRAME_MS = 1000 / FRAME_RATE;
const INTRO_FRAMES = 2 * FRAME_RATE;
const RESULT_FRAMES = 3 * FRAME_RATE;

interface MatchSettings {
  players: number;
  lives: number;
  wins: number;
  teams: boolean;
  level: string;
}

type Phase =
  | { kind: "intro"; frames: number }
  | { kind: "play" }
  | { kind: "result"; frames: number; message: string }
  | { kind: "over"; message: string };

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

const canvas = $<HTMLCanvasElement>("#game");
canvas.width = WIDTH;
canvas.height = HEIGHT;
const ctx = canvas.getContext("2d")!;
ctx.imageSmoothingEnabled = false;

const setupForm = $<HTMLFormElement>("#setup");
const overlay = $<HTMLDivElement>("#overlay");
const hud = $<HTMLDivElement>("#hud");
const timeBar = $<HTMLDivElement>("#time");

let levels: LevelEntry[] = [];
let common: Awaited<ReturnType<typeof loadCommon>>;
let input: KeyboardInput;

let settings: MatchSettings;
let scene: Scene | null = null;
let game: Game | null = null;
let phase: Phase = { kind: "over", message: "" };
let victories: number[] = [];
let round = 0;
let matchSeed = 0;

function teamOf(player: number): number {
  return settings.teams ? player % 2 : player;
}

function teamName(team: number): string {
  if (!settings.teams) return defaultPlayers[team]!.name;
  return Array.from({ length: settings.players }, (_, i) => i)
    .filter((i) => teamOf(i) === team)
    .map((i) => defaultPlayers[i]!.name)
    .join(" & ");
}

function showOverlay(html: string | null): void {
  overlay.hidden = html === null;
  if (html !== null) overlay.innerHTML = html;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
}

async function startRound(): Promise<void> {
  const candidates = levels.filter((l) => l.players >= settings.players && (!settings.teams || l.gameMode & (1 << 7)));
  const entry =
    settings.level === "random"
      ? candidates[Math.floor(Math.random() * candidates.length)]!
      : levels.find((l) => l.file === settings.level)!;
  const level: Level = parseLevel(await loadLevelText(entry.file));
  const blocks = await loadBlocks(level);
  scene = { blocks, common, players: scene?.players ?? [] };
  game = new Game({
    level,
    seed: (matchSeed + round) >>> 0,
    lives: settings.lives,
    players: Array.from({ length: settings.players }, (_, i) => ({ team: teamOf(i) })),
  });
  round++;
  phase = { kind: "intro", frames: INTRO_FRAMES };
  showOverlay(
    `<h2>${escapeHtml(level.name)}</h2><p class="author">${escapeHtml(level.author)}</p>` +
      `<p class="hint">${escapeHtml(level.hint)}</p>`,
  );
  render(ctx, game, scene);
  updateHud();
}

function endRound(): void {
  const { winnerTeam, outOfTime } = game!.result();
  let message: string;
  if (winnerTeam === null) {
    message = outOfTime ? "Out of time" : "Draw game";
  } else {
    for (let i = 0; i < settings.players; i++) {
      if (teamOf(i) === winnerTeam) victories[i]!++;
    }
    message = `${teamName(winnerTeam)} ${settings.teams ? "win" : "wins"}`;
  }
  const champion = victories.findIndex((v) => v >= settings.wins);
  if (champion >= 0) {
    phase = { kind: "over", message: `${teamName(teamOf(champion))} won the match!` };
    showOverlay(`<h2>${escapeHtml(phase.message)}</h2><p>Press Enter to play again, Escape for the menu.</p>`);
  } else {
    phase = { kind: "result", frames: RESULT_FRAMES, message };
    showOverlay(`<h2>${escapeHtml(message)}</h2>`);
  }
  updateHud();
}

function updateHud(): void {
  if (!game) return;
  hud.innerHTML = game.players
    .map((p, i) => {
      const look = defaultPlayers[i]!;
      const lives = Math.max(0, p.dying ? p.lives - 1 : p.lives);
      const team = settings.teams ? ` <span class="team">team ${teamOf(i) + 1}</span>` : "";
      return (
        `<div class="player${lives ? "" : " out"}" style="--color: ${look.colors[2] === "#000000" ? look.colors[3] : look.colors[2]}">` +
        `<span class="name">${look.name}</span>${team}` +
        `<span class="lives" title="lives">${"♥".repeat(lives)}</span>` +
        `<span class="wins" title="victories">${"★".repeat(victories[i]!)}</span></div>`
      );
    })
    .join("");
}

function tick(): void {
  if (!game || !scene) return;
  switch (phase.kind) {
    case "intro":
      if (--phase.frames <= 0) {
        phase = { kind: "play" };
        showOverlay(null);
        input.take();
      }
      break;
    case "play": {
      const actions: PlayerAction[] = input.take().slice(0, settings.players);
      game.turn();
      game.evalActions(actions);
      render(ctx, game, scene);
      game.endFrame();
      timeBar.style.width = `${100 * (1 - game.gameTime / GAME_TIME)}%`;
      if (game.gameTime % 5 === 0) updateHud();
      if (game.over) endRound();
      break;
    }
    case "result":
      if (--phase.frames <= 0) void startRound();
      break;
    case "over":
      break;
  }
}

let last = performance.now();
let accumulator = 0;
let paused = false;
function loop(now: number): void {
  accumulator = Math.min(accumulator + now - last, 10 * FRAME_MS);
  last = now;
  while (accumulator >= FRAME_MS && !paused) {
    tick();
    accumulator -= FRAME_MS;
  }
  requestAnimationFrame(loop);
}

async function startMatch(): Promise<void> {
  const data = new FormData(setupForm);
  settings = {
    players: Number(data.get("players")),
    lives: Number(data.get("lives")),
    wins: Number(data.get("wins")),
    teams: data.get("teams") === "on" && Number(data.get("players")) === 4,
    level: (data.get("level") as string | null) ?? "random",
  };
  setupForm.hidden = true;
  showOverlay("<p>Loading…</p>");
  scene = {
    blocks: [],
    common,
    players: await Promise.all(defaultPlayers.slice(0, settings.players).map(loadPlayer)),
  };
  victories = Array.from({ length: settings.players }, () => 0);
  round = 0;
  matchSeed = crypto.getRandomValues(new Uint32Array(1))[0]!;
  await startRound();
}

function backToMenu(): void {
  game = null;
  phase = { kind: "over", message: "" };
  showOverlay(null);
  hud.innerHTML = "";
  setupForm.hidden = false;
}

function updateControls(): void {
  const players = Number(new FormData(setupForm).get("players"));
  $("#controls").innerHTML = keyBindings
    .slice(0, players)
    .map((b, i) => `<li><strong>${defaultPlayers[i]!.name}</strong>: ${b.label}</li>`)
    .join("");
  $<HTMLInputElement>("#teams").disabled = players !== 4;
}

async function init(): Promise<void> {
  showOverlay("<p>Loading…</p>");
  [levels, common] = await Promise.all([loadLevelIndex(), loadCommon()]);
  const select = $<HTMLSelectElement>("#level");
  for (const level of levels) select.add(new Option(`${level.name} (${level.file})`, level.file));
  input = new KeyboardInput(keyBindings);
  setupForm.addEventListener("change", updateControls);
  setupForm.addEventListener("submit", (e) => {
    e.preventDefault();
    void startMatch();
  });
  window.addEventListener("keydown", (e) => {
    if (e.code === "Escape" && game) backToMenu();
    if (e.code === "Enter" && phase.kind === "over" && game) void startMatch();
  });
  updateControls();
  showOverlay(null);
  setupForm.hidden = false;
  requestAnimationFrame(loop);
}

void init();

// dev only: drive the game without requestAnimationFrame (hidden tabs, tests)
if (import.meta.env.DEV) {
  Object.assign(window, {
    xblast: {
      pause: (value = true) => (paused = value),
      tick: (frames = 1) => {
        for (let i = 0; i < frames; i++) tick();
        return { phase: phase.kind, gameTime: game?.gameTime, players: game?.players.map((p) => [p.x, p.y, p.lives]) };
      },
    },
  });
}
