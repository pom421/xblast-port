// XBlast in the browser: local matches (1 to 4 players on one keyboard, plus
// computer players, local.ts) and online matches (up to 6 players, lockstep
// through the server, online.ts). The simulation runs at the original rate
// (20 frames per second). Here: the menu, the keyboard and the frame loop.

import { FRAME_RATE, MAX_PLAYER } from "@xblast/sim";
import { fastForward, humansOut, nextLocalRound, pause, pauseAction, startLocal, tickLocal } from "./local.ts";
import {
  END_FRAMES,
  PRESS,
  app,
  assets,
  backToMenu,
  countdown,
  drawIntro,
  input,
  loadAssets,
  nextScreen,
  settings,
  startPlay,
  toggleMusic,
} from "./match.ts";
import { connectOnline, defaultServer, showLobby, tickOnline } from "./online.ts";
import { playerCards } from "./player-cards.ts";
import { drawLevelEnd } from "./screens.ts";
import { SoundPlayer } from "./sound.ts";
import { $, banner, canvas, ctx, escapeHtml, overlay, setupForm, showOverlay } from "./ui.ts";
import "./style.css";

const FRAME_MS = 1000 / FRAME_RATE;

const cards = playerCards(
  $("#players"),
  settings,
  () => input.setBindings(settings),
  (capturing) => (input.capturing = capturing),
);

/** One frame of the screen of the round: intro, play, level end, score board. */
function tick(): void {
  const { round, match, phase } = app;
  if (!round || !match) return;
  const { game, scene, status } = round;
  switch (phase.kind) {
    case "intro":
      if (match.mode === "online") {
        if (--phase.frames <= 0) startPlay(round);
        else if (phase.frames % FRAME_RATE === 0) {
          status.setMessage(countdown(phase.frames), true);
          drawIntro(round);
        }
      }
      break;
    case "play":
      if (match.mode === "local") tickLocal(round);
      else tickOnline(round, match);
      break;
    case "end":
      // locally, the message alternates with how to go on (LevelEnd)
      if (match.mode === "local" && phase.frames % 16 === 0) {
        status.setMessage(phase.frames % 32 ? PRESS : phase.message, true);
      }
      drawLevelEnd(ctx, game, scene, phase.winners, phase.frames++);
      status.draw(ctx);
      if (match.mode === "online" && phase.frames === END_FRAMES) void nextScreen(round, phase.last);
      break;
    case "scores":
    case "winner":
      phase.board.tick();
      phase.board.draw(ctx);
      status.draw(ctx);
      break;
    default:
      break;
  }
}

/** Space, Return or a click on the board, on the screens between the rounds. */
function advance(): void {
  const { round, match, phase } = app;
  if (!round || !match) return;
  if (match.mode === "online") {
    // the server sets the pace: only the winner screen waits, for the lobby
    if (phase.kind === "winner") {
      app.phase = { kind: "lobby" };
      showLobby(match);
    }
    return;
  }
  switch (phase.kind) {
    case "intro":
      startPlay(round);
      break;
    case "end":
      void nextScreen(round, phase.last);
      break;
    case "scores":
      // loading the next level takes several frames: start it only once
      app.phase = { kind: "waiting" };
      void nextLocalRound(match);
      break;
    case "winner":
      backToMenu();
      break;
    default:
      break;
  }
}

function updateForm(): void {
  const data = new FormData(setupForm);
  const online = data.get("mode") === "online";
  for (const el of setupForm.querySelectorAll<HTMLElement>("[data-mode]"))
    el.hidden = el.dataset.mode !== data.get("mode");
  const players = online ? Number(data.get("local")) : Number(data.get("players"));
  const total = online ? players : players + Math.min(MAX_PLAYER - players, Number(data.get("bots")));
  cards.show(players);
  $<HTMLInputElement>("#teams").disabled = online || total < 4 || total % 2 !== 0;
  $<HTMLButtonElement>("#start").textContent = online ? "Connect" : "Start";
}

/** A key outside the game itself: pause menu, fast-forward, music, next screen, back to the menu. */
function onKey(e: KeyboardEvent): void {
  if (input.capturing) return;
  const { phase } = app;
  const local = app.match?.mode === "local";
  const used = (code: string) => settings.some((p) => Object.values(p.keys).includes(code));
  if (phase.kind === "paused") {
    const keys: Record<string, string> = {
      Escape: "resume",
      KeyP: "resume",
      Enter: "forward",
      KeyA: "abandon",
      KeyQ: "quit",
    };
    const action = keys[e.code];
    if (action) {
      e.preventDefault();
      pauseAction(action);
    }
    return;
  }
  // P pauses too, unless a player uses it
  const pauseKey = e.code === "Escape" || (e.code === "KeyP" && !used("KeyP"));
  if (local && (phase.kind === "play" || phase.kind === "intro") && pauseKey) {
    e.preventDefault();
    pause();
    return;
  }
  if (local && phase.kind === "play" && e.code === "Enter" && humansOut()) {
    e.preventDefault();
    fastForward();
    return;
  }
  if (e.code === "KeyM" && phase.kind !== "menu" && !used("KeyM")) toggleMusic();
  if ((e.code === "Space" || e.code === "Enter") && ["intro", "end", "scores", "winner"].includes(phase.kind)) {
    e.preventDefault();
    advance();
    return;
  }
  if (e.code === "Escape" && phase.kind !== "menu") backToMenu();
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

async function init(): Promise<void> {
  showOverlay("<p>Loading…</p>");
  await loadAssets();
  const select = $<HTMLSelectElement>("#level");
  for (const level of assets.levels) select.add(new Option(`${level.name} (${level.file})`, level.file));
  $<HTMLInputElement>("#server").placeholder = defaultServer();
  const music = $<HTMLSelectElement>("#music");
  try {
    music.value = localStorage.getItem("xblast.music") ?? "random";
  } catch {
    // storage disabled: default choice
  }
  music.addEventListener("change", () => {
    try {
      localStorage.setItem("xblast.music", music.value);
    } catch {
      // storage disabled: the choice lasts for this page only
    }
  });
  setupForm.addEventListener("change", updateForm);
  setupForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!app.sound) {
      // from the click on Start: browsers allow audio after a user gesture
      app.sound = new SoundPlayer();
      void app.sound.load();
    }
    if (new FormData(setupForm).get("mode") === "online") connectOnline();
    else void startLocal();
  });
  overlay.addEventListener("click", (e) => {
    const action = (e.target as HTMLElement).closest<HTMLElement>("[data-pause]")?.dataset.pause;
    if (action) pauseAction(action);
  });
  banner.addEventListener("click", () => (app.phase.kind === "play" ? fastForward() : advance()));
  canvas.addEventListener("click", advance);
  window.addEventListener("keydown", onKey);
  updateForm();
  showOverlay(null);
  setupForm.hidden = false;
  requestAnimationFrame(loop);
}

init().catch((error: unknown) => {
  console.error(error);
  showOverlay(`<h2>Loading failed</h2><p>${escapeHtml(String(error))}</p>`);
});

// dev only: drive the game without requestAnimationFrame (hidden tabs, tests)
if (import.meta.env.DEV) {
  Object.assign(window, {
    xblast: {
      pause: (value = true) => (paused = value),
      tick: (frames = 1) => {
        for (let i = 0; i < frames; i++) tick();
        const game = app.round?.game;
        return {
          phase: app.phase.kind,
          gameTime: game?.gameTime,
          players: game?.players.map((p) => [p.x, p.y, p.lives]),
        };
      },
    },
  });
}
