// Online match: up to 6 players, lockstep through the server. This client
// sends the inputs of its players and plays the frames the server sends back;
// the server sets the pace of the screens between the rounds.

import {
  MAX_PLAYER,
  hashGame,
  type ClientMessage,
  type NetAction,
  type PlayerAction,
  type ServerMessage,
} from "@xblast/sim";
import { defaultPlayers } from "./assets.ts";
import {
  TITLE,
  app,
  backToMenu,
  beginRound,
  champion,
  endRound,
  input,
  loadStage,
  playFrame,
  roundMessage,
  settings,
  teamName,
  teamOf,
  type OnlineMatch,
  type Round,
} from "./match.ts";
import { keyLabel, type PlayerSettings } from "./settings.ts";
import { escapeHtml, overlay, setupForm, showBanner, showOverlay } from "./ui.ts";

const toAction = ([dir, bomb, special]: NetAction): PlayerAction => ({ dir, bomb: !!bomb, special: !!special });
const toNet = (a: PlayerAction): NetAction => [a.dir, a.bomb ? 1 : 0, a.special ? 1 : 0];

export function connectOnline(): void {
  const data = new FormData(setupForm);
  const server = data.get("server");
  const locals = settings.slice(0, Number(data.get("local")));
  input.setBindings(locals);
  setupForm.hidden = true;
  showOverlay("<p>Connecting…</p>");
  const socket = new WebSocket((typeof server === "string" && server.trim()) || defaultServer());
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
    watching: false,
    round: 0,
    delay: 3,
    frames: new Map(),
    stalled: false,
  };
  app.match = online;
  app.phase = { kind: "lobby" };
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
  socket.addEventListener("close", (e) => {
    if (app.match === online) {
      backToMenu();
      // the server says why it closes (e.g. the game is full of connections)
      showOverlay(`<h2>Disconnected</h2><p>${escapeHtml(e.reason)}</p><p>Escape: menu.</p>`);
    }
  });
}

function sendJoin(online: OnlineMatch): void {
  send(online, {
    type: "join",
    players: online.locals.map(({ name, shape, colors }) => ({ name, look: { shape, colors } })),
  });
}

export function defaultServer(): string {
  return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
}

function send(online: OnlineMatch, message: ClientMessage): void {
  if (online.socket.readyState === WebSocket.OPEN) online.socket.send(JSON.stringify(message));
}

/** Slots played on this computer, in slot order. */
function mySlots(online: OnlineMatch): number[] {
  return online.lobby.filter((p) => p.client === online.client).map((p) => p.slot);
}

async function onServer(online: OnlineMatch, message: ServerMessage): Promise<void> {
  if (app.match !== online) return;
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
      if (app.phase.kind === "lobby") showLobby(online);
      break;
    case "error":
      online.joinPending = false;
      if (app.phase.kind === "lobby") showLobby(online, message.message);
      break;
    case "match":
      online.watching = true;
      app.phase = { kind: "waiting" };
      app.roster = {
        names: message.players.map((p) => p.name),
        looks: message.players.map((p) => ({ name: p.name, ...(p.look ?? defaultPlayers[p.slot]!) })),
        bots: message.players.map((p) => !!p.bot),
        config: message.config,
      };
      online.lobby = message.players;
      app.victories = app.roster.names.map(() => 0);
      showOverlay("<p>Loading…</p>");
      await loadStage();
      break;
    case "round":
      // arrived during a match: its rounds are not shown, the lobby says to wait
      if (!online.watching) break;
      online.round = message.round;
      online.delay = message.delay;
      online.frames = new Map();
      await beginRound(message.level, message.seed);
      break;
    case "frame":
      if (online.watching && message.round === online.round) online.frames.set(message.frame, message.actions);
      if (online.stalled) showStall(online, null);
      break;
    case "stall":
      if (online.watching) showStall(online, message);
      break;
    case "result": {
      const { round } = app;
      if (!online.watching || !round) break;
      if (online.stalled) showStall(online, null);
      app.victories = message.victories;
      endRound(round, roundMessage(round.game), round.game.result().winnerTeam);
      if (message.desync) showBanner('<span class="error">Desynchronised game!</span>');
      break;
    }
    case "matchOver": {
      if (online.watching) app.victories = message.victories;
      const slot = online.watching ? champion() : -1;
      online.watching = false;
      online.title = slot < 0 ? "Match over" : `${teamName(teamOf(slot))} won the match!`;
      // the level end screen of the last round shows first
      if (app.phase.kind !== "end") {
        app.phase = { kind: "lobby" };
        showLobby(online);
      }
      break;
    }
  }
}

export function tickOnline(round: Round, online: OnlineMatch): void {
  const { game } = round;
  const frame = game.gameTime + 1;
  const actions = online.frames.get(frame);
  if (!actions) return; // lockstep: wait for the inputs of every player
  online.frames.delete(frame);
  const local = input.take().slice(0, mySlots(online).length).map(toNet);
  // without a player (the game was full), this client only watches: the server expects nothing from it
  const plays = local.length > 0;
  if (plays) send(online, { type: "input", round: online.round, frame: frame + online.delay, actions: local });
  playFrame(round, actions.map(toAction));
  if (game.over) {
    const { winnerTeam } = game.result();
    if (plays) send(online, { type: "over", round: online.round, frame, hash: hashGame(game), winnerTeam });
    app.sound?.stopMusic();
    app.phase = { kind: "waiting" };
  }
}

/**
 * The round waits for some clients (null: no longer). Everyone sees who and
 * for how long; the client waited for is told so, in the title of its tab too:
 * a hidden tab is the usual reason, and shows nothing else.
 */
function showStall(online: OnlineMatch, stall: { clients: number[]; seconds: number } | null): void {
  online.stalled = stall !== null;
  const me = stall !== null && stall.clients.includes(online.client);
  document.title = me ? `(${stall.seconds}) The game waits for you – ${TITLE}` : TITLE;
  if (!stall) return showBanner(null);
  const names = online.lobby.filter((p) => stall.clients.includes(p.client)).map((p) => escapeHtml(p.name));
  showBanner(
    me
      ? `<span class="error">The game is waiting for you: out of the match in ${stall.seconds} s</span>`
      : `Waiting for ${names.join(", ")}: out of the match in ${stall.seconds} s`,
  );
}

function keysText(s: PlayerSettings): string {
  const k = s.keys;
  return `${[k.up, k.left, k.down, k.right].map(keyLabel).join(" ")}, bomb ${keyLabel(k.bomb)}, stop ${keyLabel(k.stop)}, special ${keyLabel(k.special)}`;
}

/** The lobby: players, the form of the host to start a match, an error of the server. */
export function showLobby(online: OnlineMatch, error?: string): void {
  const isHost = online.host === online.client;
  const players = online.lobby
    .map((p) => `<li>${escapeHtml(p.name)}${p.client === online.client ? " (you)" : ""}</li>`)
    .join("");
  const bots = Array.from(
    { length: Math.max(0, MAX_PLAYER + 1 - online.lobby.length) },
    (_, i) => `<option>${i}</option>`,
  );
  const hostForm = isHost
    ? `<form id="host-form">
        <label>Lives <select name="lives"><option>1</option><option selected>2</option><option>3</option></select></label>
        <label>Victories to win <select name="wins"><option>1</option><option>2</option><option selected>3</option><option>5</option></select></label>
        <label>Computer players <select name="bots">${bots.join("")}</select></label>
        <label><input type="checkbox" name="teams" /> Teams of 2</label>
        <button type="submit">Start the match</button>
      </form>`
    : `<p>Waiting for the host to start…</p>`;
  showOverlay(
    `<h2>${escapeHtml(online.title)}</h2><ol class="lobby">${players}</ol>` +
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
