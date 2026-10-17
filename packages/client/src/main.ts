// XBlast in the browser: local matches (1 to 4 players on one keyboard, plus
// computer players) and online matches (up to 6 players, lockstep through the
// server). The simulation runs at the original rate (20 frames per second).

import {
  FRAME_RATE,
  GAME_TIME,
  chooseLevel,
  Game,
  hashGame,
  levelInfo,
  parseLevel,
  teamOfSlot,
  type Level,
  type LevelInfo,
  type LobbyPlayer,
  type MatchConfig,
  type NetAction,
  type PlayerAction,
  type ServerMessage,
} from "@xblast/sim";
import {
  defaultPlayers,
  loadBlocks,
  loadCommon,
  loadLevelIndex,
  loadLevelText,
  loadPlayer,
  type LevelEntry,
  type PlayerLook,
  type Sprite,
} from "./assets.ts";
import { KeyboardInput } from "./input.ts";
import { playerCards, type PlayerCards } from "./player-cards.ts";
import { keyLabel, loadKeyboardLayout, loadSettings, type PlayerSettings } from "./settings.ts";
import { HEIGHT, WIDTH, render, type Scene } from "./render.ts";
import { Board, drawLevelEnd, drawLevelIntro, loadScreens, type BoardPlayer, type ScreenAssets } from "./screens.ts";
import { SoundPlayer } from "./sound.ts";
import "./style.css";

const FRAME_MS = 1000 / FRAME_RATE;
/* online, the server sets the pace: fixed times instead of waiting for Space */
const INTRO_FRAMES = 3 * FRAME_RATE;
const END_FRAMES = FRAME_RATE;

/**
 * Screens of a round, like the original: level intro, play, level end (the
 * winners cheer), score board; the winner of the match at the end. Locally,
 * Space or Return goes to the next screen.
 */
type Phase =
  | { kind: "menu" }
  | { kind: "lobby" }
  | { kind: "intro"; frames: number }
  | { kind: "play" }
  | { kind: "end"; frames: number; message: string; winners: number[]; last: boolean }
  | { kind: "scores"; board: Board }
  | { kind: "winner"; board: Board; frames: number }
  | { kind: "waiting" }
  | { kind: "paused"; resume: Phase };

/** Players of the match, by slot. */
interface Roster {
  names: string[];
  /** shape and colors */
  looks: PlayerLook[];
  /** computer players */
  bots: boolean[];
  config: MatchConfig;
}

interface LocalMatch {
  mode: "local";
  level: string;
  round: number;
  seed: number;
}

interface OnlineMatch {
  mode: "online";
  socket: WebSocket;
  /** players of this computer */
  locals: PlayerSettings[];
  /** a join request is waiting for its answer */
  joinPending: boolean;
  /** title of the lobby screen: the winner of the last match */
  title: string;
  client: number;
  lobby: LobbyPlayer[];
  host: number;
  playing: boolean;
  round: number;
  delay: number;
  /** inputs of every player, by frame, received from the server */
  frames: Map<number, NetAction[]>;
}

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
const banner = $<HTMLDivElement>("#banner");

let levels: LevelEntry[] = [];
let common: Awaited<ReturnType<typeof loadCommon>>;
let screens: ScreenAssets;
/** sprites of the 6 default players: the audience of the score board */
let defaultSprites: Promise<Sprite[][]> | null = null;
let input: KeyboardInput;
let sound: SoundPlayer | null = null;
/** settings of the players of this computer */
const settings = loadSettings();
let cards: PlayerCards;

let match: LocalMatch | OnlineMatch | null = null;
let roster: Roster = { names: [], looks: [], bots: [], config: { lives: 2, wins: 3, teams: false } };
let scene: Scene | null = null;
let game: Game | null = null;
let phase: Phase = { kind: "menu" };
let victories: number[] = [];
/** level of the round, and its intro texts */
let level: Level | null = null;
let info: LevelInfo = { player: [], level: [], extra: [] };
/** team that won the last round (null: nobody) */
let lastTeam: number | null = null;

/* ------------------------------------------------------------------ */
/* display                                                            */
/* ------------------------------------------------------------------ */

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
}

function showOverlay(html: string | null): void {
  overlay.hidden = html === null;
  if (html !== null) overlay.innerHTML = html;
}

/** Hint under the board (the original shows it in the status bar). */
function showBanner(html: string | null): void {
  banner.hidden = html === null;
  if (html !== null) banner.innerHTML = html;
}

/** Messages that wait for a key alternate with "Press Space or Return" (every 2 seconds). */
function pressMessage(message: string, frames: number): string {
  return Math.floor(frames / (2 * FRAME_RATE)) % 2 ? "Press Space or Return" : message;
}

const teamOf = (slot: number) => teamOfSlot(slot, roster.config);

function teamName(team: number): string {
  return roster.names.filter((_, slot) => teamOf(slot) === team).join(" & ");
}

function updateHud(): void {
  if (!game) {
    hud.innerHTML = "";
    return;
  }
  hud.innerHTML = game.players
    .map((p, slot) => {
      const look = roster.looks[slot] ?? defaultPlayers[slot]!;
      const lives = Math.max(0, p.dying ? p.lives - 1 : p.lives);
      const team = roster.config.teams ? ` <span class="team">team ${teamOf(slot) + 1}</span>` : "";
      const color = look.colors[2] === "#000000" ? look.colors[3] : look.colors[2];
      return (
        `<div class="player${lives ? "" : " out"}" style="--color: ${color}">` +
        `<span class="name">${escapeHtml(roster.names[slot] ?? look.name)}</span>${team}` +
        `<span class="lives" title="lives">${"♥".repeat(lives)}</span>` +
        `<span class="wins" title="victories">${"★".repeat(victories[slot] ?? 0)}</span></div>`
      );
    })
    .join("");
}

/* ------------------------------------------------------------------ */
/* rounds                                                             */
/* ------------------------------------------------------------------ */

async function loadScene(): Promise<void> {
  scene = {
    blocks: [],
    common,
    players: await Promise.all(roster.looks.map(loadPlayer)),
  };
}

async function beginRound(levelFile: string, seed: number): Promise<void> {
  level = parseLevel(await loadLevelText(levelFile));
  info = levelInfo(level);
  scene = { ...scene!, blocks: await loadBlocks(level) };
  game = new Game({
    level,
    seed,
    lives: roster.config.lives,
    players: roster.names.map((_, slot) => ({ team: teamOf(slot), bot: roster.bots[slot] })),
  });
  phase = { kind: "intro", frames: INTRO_FRAMES };
  showOverlay(null);
  drawIntro();
  timeBar.style.width = "100%";
  updateHud();
}

/** LevelIntro: "Press Space or Return" locally, a countdown online (DoWait). */
function drawIntro(): void {
  if (phase.kind !== "intro") return;
  const message = match?.mode === "online" ? `${Math.ceil(phase.frames / FRAME_RATE)}` : "Press Space or Return";
  drawLevelIntro(ctx, screens, game!, scene!, level!, info, message);
}

function startPlay(): void {
  phase = { kind: "play" };
  showBanner(null);
  render(ctx, game!, scene!);
  input.take();
  startMusic();
}

/** LevelResult: the message of the end of a round. */
function roundMessage(): string {
  const { winnerTeam, outOfTime } = game!.result();
  if (outOfTime) return "Out of Time";
  if (winnerTeam === null) return "Draw Game";
  // the message of one of the winners, at random
  const won = game!.players.flatMap((p, slot) => (p.team === winnerTeam && p.lives > 0 ? [slot] : []));
  const slot = won[Math.floor(Math.random() * won.length)] ?? 0;
  return `${roster.names[slot]} wins`;
}

/** Slot of a player of the team that won the match, or -1. */
function champion(): number {
  return victories.findIndex((v) => v >= roster.config.wins);
}

/** LevelEnd: the message, and the players of the winning team cheer. */
function endRound(message: string, winnerTeam: number | null): void {
  lastTeam = winnerTeam;
  if (winnerTeam !== null) sound?.play("won", WIDTH / 2);
  const winners = roster.names.flatMap((_, slot) => (teamOf(slot) === winnerTeam ? [slot] : []));
  phase = { kind: "end", frames: 0, message, winners, last: champion() >= 0 };
  showBanner(null);
  updateHud();
}

function boardPlayers(): BoardPlayer[] {
  // names without the "(CPU)" of the computer players: the boxes are small
  return roster.names.map((name, slot) => ({
    name: roster.looks[slot]?.name ?? name,
    team: teamOf(slot),
    victories: victories[slot] ?? 0,
    inactive: false,
  }));
}

async function boardScene(): Promise<{ players: Sprite[][]; defaults: Sprite[][] }> {
  defaultSprites ??= Promise.all(defaultPlayers.map(async (look) => (await loadPlayer(look)).frames));
  return { players: scene!.players.map((p) => p.frames), defaults: await defaultSprites };
}

/** After the level end: the score board, or the winner of the match. */
async function nextScreen(last: boolean): Promise<void> {
  phase = { kind: "waiting" };
  const sprites = await boardScene();
  const bomb = common.bombs[0]![0]!;
  if (last) {
    const board = Board.winner(screens, sprites, bomb, boardPlayers(), teamOf(champion()));
    phase = { kind: "winner", board, frames: 0 };
    sound?.play("finale", WIDTH / 2);
  } else {
    const maxNumWins = Math.max(0, ...victories);
    const board = Board.scores(screens, sprites, bomb, boardPlayers(), lastTeam, maxNumWins, roster.config.wins);
    phase = { kind: "scores", board };
    sound?.play("applause", WIDTH / 2);
  }
}

/** Space, Return or a click on the board, on the screens between the rounds. */
function advance(): void {
  if (!match) return;
  if (match.mode === "local") {
    switch (phase.kind) {
      case "intro":
        startPlay();
        return;
      case "end":
        void nextScreen(phase.last);
        return;
      case "scores":
        // loading the next level takes several frames: start it only once
        phase = { kind: "waiting" };
        void nextLocalRound(match);
        return;
      case "winner":
        backToMenu();
        return;
      default:
        return;
    }
  }
  if (phase.kind === "winner") {
    phase = { kind: "lobby" };
    showLobby(match, undefined, match.title);
  }
}

/** One frame of the game, with the inputs of every player. */
function playFrame(actions: PlayerAction[]): void {
  game!.turn();
  game!.evalActions(actions);
  for (const s of game!.sounds) sound?.play(s.name, s.x);
  render(ctx, game!, scene!);
  game!.endFrame();
  timeBar.style.width = `${100 * (1 - game!.gameTime / GAME_TIME)}%`;
  if (game!.gameTime % 5 === 0) updateHud();
}

const toAction = ([dir, bomb, special]: NetAction): PlayerAction => ({ dir, bomb: !!bomb, special: !!special });
const toNet = (a: PlayerAction): NetAction => [a.dir, a.bomb ? 1 : 0, a.special ? 1 : 0];

function tick(): void {
  if (!game || !scene || !match) return;
  switch (phase.kind) {
    case "intro":
      if (match.mode === "online") {
        if (--phase.frames <= 0) startPlay();
        else if (phase.frames % FRAME_RATE === 0) drawIntro();
      }
      break;
    case "play":
      if (match.mode === "local") tickLocal();
      else tickOnline(match);
      break;
    case "end": {
      const message = match.mode === "local" ? pressMessage(phase.message, phase.frames) : phase.message;
      drawLevelEnd(ctx, screens, game, scene, phase.winners, phase.frames++, message);
      if (match.mode === "online" && phase.frames === END_FRAMES) void nextScreen(phase.last);
      break;
    }
    case "scores":
      phase.board.tick();
      phase.board.draw(ctx, null);
      break;
    case "winner":
      phase.board.tick();
      phase.board.draw(ctx, pressMessage("CONGRATULATIONS!", phase.frames++));
      break;
    default:
      break;
  }
}

/* ------------------------------------------------------------------ */
/* local match                                                        */
/* ------------------------------------------------------------------ */

async function startLocal(): Promise<void> {
  const data = new FormData(setupForm);
  const humans = Number(data.get("players"));
  const bots = Math.min(6 - humans, Number(data.get("bots")));
  const players = humans + bots;
  // keyboard players first, then computer players with the default looks
  const looks = Array.from({ length: players }, (_, slot) => (slot < humans ? settings[slot]! : defaultPlayers[slot]!));
  input.setBindings(settings.slice(0, humans));
  roster = {
    names: looks.map((look, slot) => (slot < humans ? look.name : `${look.name} (CPU)`)),
    looks: looks.map(({ name, shape, colors }) => ({ name, shape, colors })),
    bots: Array.from({ length: players }, (_, slot) => slot >= humans),
    config: {
      lives: Number(data.get("lives")),
      wins: Number(data.get("wins")),
      teams: data.get("teams") === "on" && players >= 4 && players % 2 === 0,
    },
  };
  match = {
    mode: "local",
    level: (data.get("level") as string | null) ?? "random",
    round: 0,
    seed: crypto.getRandomValues(new Uint32Array(1))[0]!,
  };
  victories = roster.names.map(() => 0);
  phase = { kind: "waiting" };
  setupForm.hidden = true;
  showOverlay("<p>Loading…</p>");
  await loadScene();
  await nextLocalRound(match);
}

async function nextLocalRound(local: LocalMatch): Promise<void> {
  const n = roster.names.length;
  const file = local.level === "random" ? chooseLevel(levels, n, roster.config.teams, Math.random).file : local.level;
  local.round++;
  await beginRound(file, (local.seed + local.round) >>> 0);
}

/** Every keyboard player is out (and computer players still play). */
function humansOut(): boolean {
  return !!game && roster.bots.some((b) => !b) && game.players.every((p, slot) => roster.bots[slot] || p.lives <= 0);
}

function tickLocal(): void {
  // computer players get their inputs from the game itself
  playFrame(input.take().slice(0, roster.bots.filter((b) => !b).length));
  if (!game!.over) {
    showBanner(humansOut() ? "You are out: <strong>Enter</strong> to fast-forward to the end of the round" : null);
    return;
  }
  finishLocalRound();
}

/** Plays the rest of the round at once, without display: same result as watching it. */
function fastForward(): void {
  if (!game || phase.kind !== "play") return;
  while (!game.over) {
    game.turn();
    game.evalActions([]);
    game.endFrame();
  }
  render(ctx, game, scene!);
  timeBar.style.width = `${100 * (1 - game.gameTime / GAME_TIME)}%`;
  finishLocalRound();
}

function finishLocalRound(abandoned = false): void {
  sound?.stopMusic();
  showOverlay(null);
  if (abandoned) {
    endRound("Round abandoned", null);
    return;
  }
  const { winnerTeam } = game!.result();
  if (winnerTeam !== null) roster.names.forEach((_, slot) => teamOf(slot) === winnerTeam && victories[slot]!++);
  endRound(roundMessage(), winnerTeam);
}

/* ------------------------------------------------------------------ */
/* online match                                                       */
/* ------------------------------------------------------------------ */

function connectOnline(): void {
  const data = new FormData(setupForm);
  const text = (name: string) => {
    const value = data.get(name);
    return typeof value === "string" ? value.trim() : "";
  };
  const locals = settings.slice(0, Number(data.get("local")));
  input.setBindings(locals);
  const url = text("server") || defaultServer();
  setupForm.hidden = true;
  showOverlay("<p>Connecting…</p>");
  const socket = new WebSocket(url);
  const online: OnlineMatch = {
    mode: "online",
    socket,
    locals,
    joinPending: true,
    title: "Lobby",
    client: -1,
    lobby: [],
    host: -1,
    playing: false,
    round: 0,
    delay: 3,
    frames: new Map(),
  };
  match = online;
  phase = { kind: "lobby" };
  socket.addEventListener("open", () => sendJoin(online));
  // one message at a time: a round must not start before the match is loaded
  let queue = Promise.resolve();
  socket.addEventListener("message", (e) => {
    const message = JSON.parse(String(e.data)) as ServerMessage;
    // a failed message (e.g. a level that does not load) must not block the next ones
    queue = queue
      .then(() => onServer(online, message))
      .catch((error: unknown) => {
        console.error(error);
        showOverlay(`<h2>Error</h2><p>${escapeHtml(String(error))}</p><p>Escape: menu.</p>`);
      });
  });
  socket.addEventListener("close", () => {
    if (match === online) {
      backToMenu();
      showOverlay("<h2>Disconnected</h2><p>Escape: menu.</p>");
    }
  });
}

function sendJoin(online: OnlineMatch): void {
  send(online, {
    type: "join",
    players: online.locals.map(({ name, shape, colors }) => ({ name, shape, colors })),
  });
}

function defaultServer(): string {
  return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
}

function send(online: OnlineMatch, message: object): void {
  if (online.socket.readyState === WebSocket.OPEN) online.socket.send(JSON.stringify(message));
}

/** Slots played on this computer, in slot order. */
function mySlots(online: OnlineMatch): number[] {
  return online.lobby.filter((p) => p.client === online.client).map((p) => p.slot);
}

async function onServer(online: OnlineMatch, message: ServerMessage): Promise<void> {
  if (match !== online) return;
  switch (message.type) {
    case "welcome":
      online.client = message.client;
      break;
    case "lobby":
      online.lobby = message.players;
      online.host = message.host;
      online.playing = message.playing;
      if (mySlots(online).length > 0) online.joinPending = false;
      // arrived during a match: join once it is over
      if (!message.playing && !online.joinPending && mySlots(online).length === 0) {
        online.joinPending = true;
        sendJoin(online);
      }
      if (phase.kind === "lobby") showLobby(online, undefined, online.title);
      break;
    case "error":
      online.joinPending = false;
      if (phase.kind === "lobby") showLobby(online, message.message, online.title);
      break;
    case "match":
      phase = { kind: "waiting" };
      roster = {
        names: message.players.map((p) => p.name),
        looks: message.players.map((p) => ({ name: p.name, ...(p.look ?? defaultPlayers[p.slot]!) })),
        bots: message.players.map((p) => !!p.bot),
        config: message.config,
      };
      online.lobby = message.players;
      victories = roster.names.map(() => 0);
      showOverlay("<p>Loading…</p>");
      await loadScene();
      break;
    case "round":
      online.round = message.round;
      online.delay = message.delay;
      online.frames = new Map();
      await beginRound(message.level, message.seed);
      break;
    case "frame":
      if (message.round === online.round) online.frames.set(message.frame, message.actions);
      break;
    case "result":
      victories = message.victories;
      endRound(roundMessage(), game!.result().winnerTeam);
      if (message.desync) showBanner('<span class="error">Desynchronised game!</span>');
      break;
    case "matchOver": {
      victories = message.victories;
      const slot = champion();
      online.title = slot < 0 ? "Match over" : `${teamName(teamOf(slot))} won the match!`;
      // the level end screen of the last round shows first
      if (phase.kind !== "end") {
        phase = { kind: "lobby" };
        showLobby(online, undefined, online.title);
      }
      break;
    }
  }
}

function tickOnline(online: OnlineMatch): void {
  const frame = game!.gameTime + 1;
  const actions = online.frames.get(frame);
  if (!actions) return; // lockstep: wait for the inputs of every player
  online.frames.delete(frame);
  const local = input.take().slice(0, mySlots(online).length).map(toNet);
  send(online, { type: "input", round: online.round, frame: frame + online.delay, actions: local });
  playFrame(actions.map(toAction));
  if (game!.over) {
    const { winnerTeam } = game!.result();
    send(online, { type: "over", round: online.round, frame, hash: hashGame(game!), winnerTeam });
    sound?.stopMusic();
    phase = { kind: "waiting" };
  }
}

function showLobby(online: OnlineMatch, error?: string, title = "Lobby"): void {
  const isHost = online.host === online.client;
  const players = online.lobby
    .map((p) => `<li>${escapeHtml(p.name)}${p.client === online.client ? " (you)" : ""}</li>`)
    .join("");
  const hostForm = isHost
    ? `<form id="host-form">
        <label>Lives <select name="lives"><option>1</option><option selected>2</option><option>3</option></select></label>
        <label>Victories to win <select name="wins"><option>1</option><option>2</option><option selected>3</option><option>5</option></select></label>
        <label>Computer players <select name="bots">${Array.from({ length: Math.max(0, 7 - online.lobby.length) }, (_, i) => `<option>${i}</option>`).join("")}</select></label>
        <label><input type="checkbox" name="teams" /> Teams of 2</label>
        <button type="submit">Start the match</button>
      </form>`
    : `<p>Waiting for the host to start…</p>`;
  showOverlay(
    `<h2>${escapeHtml(title)}</h2><ol class="lobby">${players}</ol>` +
      (online.playing ? "<p>A match is being played.</p>" : hostForm) +
      (error ? `<p class="error">${escapeHtml(error)}</p>` : "") +
      `<p class="small">Your keys: ${online.locals.map((s) => `${escapeHtml(s.name)}: ${keysText(s)}`).join(" — ")}. Escape: leave.</p>`,
  );
  overlay.querySelector<HTMLFormElement>("#host-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(e.target as HTMLFormElement);
    send(online, {
      type: "start",
      config: {
        lives: Number(data.get("lives")),
        wins: Number(data.get("wins")),
        teams: data.get("teams") === "on",
        bots: Number(data.get("bots")),
      },
    });
  });
}

/* ------------------------------------------------------------------ */
/* menu and loop                                                      */
/* ------------------------------------------------------------------ */

function pause(): void {
  if (phase.kind !== "play" && phase.kind !== "intro") return;
  phase = { kind: "paused", resume: phase };
  showBanner(null);
  showOverlay(
    `<h2>Pause</h2><div class="menu">` +
      `<button type="button" data-pause="resume">Resume (P or Escape)</button>` +
      (humansOut()
        ? `<button type="button" data-pause="forward">Fast-forward to the end of the round (Enter)</button>`
        : "") +
      `<button type="button" data-pause="abandon">Abandon the round (A)</button>` +
      `<button type="button" data-pause="quit">Quit to the menu (Q)</button></div>`,
  );
}

function pauseAction(action: string): void {
  if (phase.kind !== "paused") return;
  const resume = phase.resume;
  switch (action) {
    case "resume":
      phase = resume;
      showOverlay(null);
      input.take();
      break;
    case "forward":
      if (!humansOut()) return;
      phase = { kind: "play" };
      showOverlay(null);
      fastForward();
      break;
    case "abandon":
      finishLocalRound(true);
      break;
    case "quit":
      backToMenu();
      break;
  }
}

/** Music of the round: the chosen song, or one at random (setting kept in the browser). */
function startMusic(): void {
  const choice = $<HTMLSelectElement>("#music").value;
  if (!sound || choice === "off") return;
  const song = choice === "random" ? 1 + Math.floor(Math.random() * 6) : Number(choice);
  void sound.playMusic(song);
}

function toggleMusic(): void {
  if (!sound) return;
  sound.musicOn = !sound.musicOn;
  if (!sound.musicOn) sound.stopMusic();
  else if (phase.kind === "play") startMusic();
}

function backToMenu(): void {
  showBanner(null);
  sound?.stopMusic();
  if (match?.mode === "online") {
    const online = match;
    match = null;
    online.socket.close();
  }
  match = null;
  game = null;
  phase = { kind: "menu" };
  showOverlay(null);
  updateHud();
  setupForm.hidden = false;
}

function keysText(s: PlayerSettings): string {
  const k = s.keys;
  return `${[k.up, k.left, k.down, k.right].map(keyLabel).join(" ")}, bomb ${keyLabel(k.bomb)}, stop ${keyLabel(k.stop)}, special ${keyLabel(k.special)}`;
}

function updateForm(): void {
  const data = new FormData(setupForm);
  const online = data.get("mode") === "online";
  for (const el of setupForm.querySelectorAll<HTMLElement>("[data-mode]"))
    el.hidden = el.dataset.mode !== data.get("mode");
  const players = online ? Number(data.get("local")) : Number(data.get("players"));
  const total = online ? players : players + Math.min(6 - players, Number(data.get("bots")));
  cards.show(players);
  $<HTMLInputElement>("#teams").disabled = online || total < 4 || total % 2 !== 0;
  $<HTMLButtonElement>("#start").textContent = online ? "Connect" : "Start";
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
  [levels, common, screens] = await Promise.all([loadLevelIndex(), loadCommon(), loadScreens(), loadKeyboardLayout()]);
  const select = $<HTMLSelectElement>("#level");
  for (const level of levels) select.add(new Option(`${level.name} (${level.file})`, level.file));
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
  input = new KeyboardInput(settings);
  cards = playerCards(
    $("#players"),
    settings,
    () => input.setBindings(settings),
    (capturing) => (input.capturing = capturing),
  );
  setupForm.addEventListener("change", updateForm);
  setupForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!sound) {
      // from the click on Start: browsers allow audio after a user gesture
      sound = new SoundPlayer();
      void sound.load();
    }
    if (new FormData(setupForm).get("mode") === "online") connectOnline();
    else void startLocal();
  });
  overlay.addEventListener("click", (e) => {
    const action = (e.target as HTMLElement).closest<HTMLElement>("[data-pause]")?.dataset.pause;
    if (action) pauseAction(action);
  });
  banner.addEventListener("click", () => (phase.kind === "play" ? fastForward() : advance()));
  canvas.addEventListener("click", advance);
  window.addEventListener("keydown", (e) => {
    if (input.capturing) return;
    const local = match?.mode === "local";
    if (phase.kind === "paused") {
      const keys: Record<string, string> = {
        Escape: "resume",
        KeyP: "resume",
        Enter: "forward",
        KeyA: "abandon",
        KeyQ: "quit",
      };
      if (keys[e.code]) {
        e.preventDefault();
        pauseAction(keys[e.code]!);
      }
      return;
    }
    // P pauses too, unless a player uses it
    const pauseKey =
      e.code === "Escape" || (e.code === "KeyP" && !settings.some((p) => Object.values(p.keys).includes("KeyP")));
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
    if (e.code === "KeyM" && phase.kind !== "menu" && !settings.some((p) => Object.values(p.keys).includes("KeyM"))) {
      toggleMusic();
    }
    if ((e.code === "Space" || e.code === "Enter") && ["intro", "end", "scores", "winner"].includes(phase.kind)) {
      e.preventDefault();
      advance();
      return;
    }
    if (e.code === "Escape" && phase.kind !== "menu") backToMenu();
  });
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
        return { phase: phase.kind, gameTime: game?.gameTime, players: game?.players.map((p) => [p.x, p.y, p.lives]) };
      },
    },
  });
}
