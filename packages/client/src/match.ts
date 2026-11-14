// The match on screen, local or online: the state of the page, and the
// screens of a round like the original (level intro, play, level end, score
// board; the winner of the match at the end).

import {
  FRAME_RATE,
  Game,
  INTRO_SECONDS,
  levelInfo,
  parseLevel,
  teamOfSlot,
  type Level,
  type LevelInfo,
  type LobbyPlayer,
  type MatchConfig,
  type NetAction,
  type PlayerAction,
} from "@xblast/sim";
import {
  defaultPlayers,
  loadBlocks,
  loadCommon,
  loadLevelIndex,
  loadLevelText,
  loadPlayer,
  type CommonSprites,
  type LevelEntry,
  type PlayerLook,
  type PlayerSprites,
  type Sprite,
} from "./assets.ts";
import { KeyboardInput } from "./input.ts";
import { WIDTH, render, type Scene } from "./render.ts";
import { Board, drawLevelIntro, loadScreens, type BoardPlayer, type ScreenAssets } from "./screens.ts";
import { loadKeyboardLayout, loadSettings, type PlayerSettings } from "./settings.ts";
import type { SoundPlayer } from "./sound.ts";
import { loadFaces, loadStatus, StatusBar, type StatusAssets } from "./status.ts";
import { $, ctx, setupForm, showBanner, showOverlay } from "./ui.ts";

export const TITLE = document.title;
export const PRESS = "Press Space or Return";
/* online, the server sets the pace: fixed times instead of waiting for Space */
const INTRO_FRAMES = INTRO_SECONDS * FRAME_RATE;
export const END_FRAMES = FRAME_RATE;

/**
 * Screens of a round, like the original: level intro, play, level end (the
 * winners cheer), score board; the winner of the match at the end. Locally,
 * Space or Return goes to the next screen.
 */
export type Phase =
  | { kind: "menu" }
  | { kind: "lobby" }
  | { kind: "intro"; frames: number }
  | { kind: "play" }
  | { kind: "end"; frames: number; message: string; winners: number[]; last: boolean }
  | { kind: "scores"; board: Board }
  | { kind: "winner"; board: Board }
  | { kind: "waiting" }
  | { kind: "paused"; resume: Phase };

/** Players of the match, by slot. */
export interface Roster {
  names: string[];
  /** shape and colors */
  looks: PlayerLook[];
  /** computer players */
  bots: boolean[];
  config: MatchConfig;
}

export interface LocalMatch {
  mode: "local";
  level: string;
  round: number;
  seed: number;
}

export interface OnlineMatch {
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
  /** this client got the players of the match being played: it shows its rounds */
  watching: boolean;
  round: number;
  delay: number;
  /** inputs of every player, by frame, received from the server */
  frames: Map<number, NetAction[]>;
  /** the round waits for a client: the countdown is shown */
  stalled: boolean;
}

/** What a match shows, loaded when it starts: the sprites of its players, their status bar. */
interface Stage {
  players: PlayerSprites[];
  status: StatusBar;
}

/** A round on screen, from its level intro to the next round. */
export interface Round {
  game: Game;
  level: Level;
  /** texts of the level intro */
  info: LevelInfo;
  scene: Scene;
  /** status bar under the board */
  status: StatusBar;
}

/** Loaded once, before the menu shows. */
export let assets: { levels: LevelEntry[]; common: CommonSprites; screens: ScreenAssets; status: StatusAssets };

export async function loadAssets(): Promise<void> {
  const [levels, common, screens, status] = await Promise.all([
    loadLevelIndex(),
    loadCommon(),
    loadScreens(),
    loadStatus(),
    loadKeyboardLayout(),
  ]);
  assets = { levels, common, screens, status };
}

/** settings of the players of this computer */
export const settings = loadSettings();
export const input = new KeyboardInput(settings);

interface App {
  phase: Phase;
  match: LocalMatch | OnlineMatch | null;
  roster: Roster;
  victories: number[];
  stage: Stage | null;
  round: Round | null;
  /** team that won the last round (null: nobody) */
  lastTeam: number | null;
  /** created on the first Start: browsers allow audio after a user gesture */
  sound: SoundPlayer | null;
}

/** State of the page. One object: a module cannot assign the variables of another. */
export const app: App = {
  phase: { kind: "menu" },
  match: null,
  roster: { names: [], looks: [], bots: [], config: { lives: 2, wins: 3, teams: false } },
  victories: [],
  stage: null,
  round: null,
  lastTeam: null,
  sound: null,
};

/** sprites of the 6 default players: the audience of the score board */
let defaultSprites: Promise<Sprite[][]> | null = null;

export const teamOf = (slot: number) => teamOfSlot(slot, app.roster.config);

export function teamName(team: number): string {
  return app.roster.names.filter((_, slot) => teamOf(slot) === team).join(" & ");
}

/* ------------------------------------------------------------------ */
/* rounds                                                             */
/* ------------------------------------------------------------------ */

/** Loads what the match of the roster shows. */
export async function loadStage(): Promise<void> {
  const { match, roster } = app;
  const [players, faces] = await Promise.all([
    Promise.all(roster.looks.map(loadPlayer)),
    Promise.all(roster.looks.map(loadFaces)),
  ]);
  // left for the menu meanwhile
  if (app.match !== match) return;
  app.stage = { players, status: new StatusBar(assets.status, assets.screens, faces) };
}

export async function beginRound(levelFile: string, seed: number): Promise<void> {
  const { match, stage, roster } = app;
  if (!match || !stage) return;
  const level = parseLevel(await loadLevelText(levelFile));
  const blocks = await loadBlocks(level);
  // left for the menu meanwhile
  if (app.match !== match) return;
  const game = new Game({
    level,
    seed,
    lives: roster.config.lives,
    players: roster.names.map((_, slot) => ({ team: teamOf(slot), bot: roster.bots[slot] })),
  });
  const scene = { blocks, common: assets.common, players: stage.players };
  const round: Round = { game, level, info: levelInfo(level), scene, status: stage.status };
  app.round = round;
  app.phase = { kind: "intro", frames: INTRO_FRAMES };
  showOverlay(null);
  round.status.reset(PRESS, app.victories, null);
  if (match.mode === "online") round.status.setMessage(countdown(INTRO_FRAMES), true);
  drawIntro(round);
}

/** DoWait: the countdown of the level intro online. */
export const countdown = (frames: number) => `${Math.ceil(frames / FRAME_RATE)}`;

export function drawIntro({ game, scene, level, info, status }: Round): void {
  drawLevelIntro(ctx, assets.screens, game, scene, level, info);
  status.draw(ctx);
}

/** LevelBegin: the status bar shows the lives and the name of the level. */
export function startPlay({ game, scene, level, status }: Round): void {
  app.phase = { kind: "play" };
  showBanner(null);
  status.reset(level.name, app.victories, game);
  render(ctx, game, scene);
  status.draw(ctx);
  input.take();
  startMusic();
}

/** LevelResult: the message of the end of a round. */
export function roundMessage(game: Game): string {
  const { winnerTeam, outOfTime } = game.result();
  if (outOfTime) return "Out of Time";
  if (winnerTeam === null) return "Draw Game";
  // the message of one of the winners, at random
  const won = game.players.flatMap((p, slot) => (p.team === winnerTeam && p.lives > 0 ? [slot] : []));
  const slot = won[Math.floor(Math.random() * won.length)] ?? 0;
  return `${app.roster.names[slot]} wins`;
}

/** Slot of a player of the team that won the match, or -1. */
export function champion(): number {
  return app.victories.findIndex((v) => v >= app.roster.config.wins);
}

/** LevelEnd: the message, and the players of the winning team cheer. */
export function endRound(round: Round, message: string, winnerTeam: number | null): void {
  app.lastTeam = winnerTeam;
  if (winnerTeam !== null) app.sound?.play("won", WIDTH / 2);
  const winners = app.roster.names.flatMap((_, slot) => (teamOf(slot) === winnerTeam ? [slot] : []));
  app.phase = { kind: "end", frames: 0, message, winners, last: champion() >= 0 };
  round.status.setMessage(message, true);
  showBanner(null);
}

function boardPlayers(): BoardPlayer[] {
  // names without the "(CPU)" of the computer players: the boxes are small
  return app.roster.names.map((name, slot) => ({
    name: app.roster.looks[slot]?.name ?? name,
    team: teamOf(slot),
    victories: app.victories[slot] ?? 0,
    inactive: false,
  }));
}

/** After the level end: the score board, or the winner of the match. */
export async function nextScreen(round: Round, last: boolean): Promise<void> {
  app.phase = { kind: "waiting" };
  defaultSprites ??= Promise.all(defaultPlayers.map(async (look) => (await loadPlayer(look)).frames));
  const sprites = { players: round.scene.players.map((p) => p.frames), defaults: await defaultSprites };
  // left for the menu, or the next round began, meanwhile
  if (app.round !== round) return;
  const { screens, common } = assets;
  const bomb = common.bombs[0]![0]!;
  if (last) {
    const board = Board.winner(screens, sprites, bomb, boardPlayers(), teamOf(champion()));
    app.phase = { kind: "winner", board };
    round.status.reset("CONGRATULATIONS!", app.victories, null);
    app.sound?.play("finale", WIDTH / 2);
  } else {
    const maxNumWins = Math.max(0, ...app.victories);
    const wins = app.roster.config.wins;
    const board = Board.scores(screens, sprites, bomb, boardPlayers(), app.lastTeam, maxNumWins, wins);
    app.phase = { kind: "scores", board };
    round.status.reset("Scoreboard", app.victories, null);
    app.sound?.play("applause", WIDTH / 2);
  }
}

/** One frame of the game, with the inputs of every player. */
export function playFrame({ game, scene, status }: Round, actions: PlayerAction[]): void {
  game.turn();
  game.evalActions(actions);
  for (const s of game.sounds) app.sound?.play(s.name, s.x);
  render(ctx, game, scene);
  game.endFrame();
  status.update(game);
  status.draw(ctx);
}

/* ------------------------------------------------------------------ */
/* music and menu                                                     */
/* ------------------------------------------------------------------ */

/** Music of the round: the chosen song, or one at random (setting kept in the browser). */
export function startMusic(): void {
  const choice = $<HTMLSelectElement>("#music").value;
  if (!app.sound || choice === "off") return;
  const song = choice === "random" ? 1 + Math.floor(Math.random() * 6) : Number(choice);
  void app.sound.playMusic(song);
}

export function toggleMusic(): void {
  const { sound } = app;
  if (!sound) return;
  sound.musicOn = !sound.musicOn;
  if (!sound.musicOn) sound.stopMusic();
  else if (app.phase.kind === "play") startMusic();
}

export function backToMenu(): void {
  showBanner(null);
  app.sound?.stopMusic();
  const { match } = app;
  // first: the socket must find its match gone when it closes
  app.match = null;
  if (match?.mode === "online") match.socket.close();
  document.title = TITLE;
  app.round = null;
  app.stage = null;
  app.phase = { kind: "menu" };
  showOverlay(null);
  setupForm.hidden = false;
}
