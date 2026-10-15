// The one game room of a server (a LAN party): lobby, then a match of rounds.
// Lockstep relay: a frame is sent to every client once the inputs of every
// player for that frame are known. Kept free of Bun APIs to be testable.

import {
  idleAction,
  teamOfSlot,
  type ClientMessage,
  type LobbyPlayer,
  type MatchConfig,
  type NetAction,
  type ServerMessage,
} from "@xblast/sim";

export const MAX_PLAYERS = 6;
/** frames between an input and its use: 3 × 50 ms */
export const INPUT_DELAY = 3;

export interface Connection {
  readonly id: number;
  send(message: ServerMessage): void;
}

export interface LevelChoice {
  file: string;
  players: number;
  gameMode: number;
}

interface OverReport {
  hash: number;
  winnerTeam: number | null;
}

export interface RoomOptions {
  levels: LevelChoice[];
  /** randomness of the server (levels, seeds); not part of the simulation */
  random?: () => number;
  /** delay before the next round, to show the result */
  schedule?: (callback: () => void, ms: number) => void;
}

export class Room {
  private readonly clients = new Map<number, Connection>();
  private players: LobbyPlayer[] = [];
  private host: number | null = null;
  private playing = false;
  private config: MatchConfig = { lives: 2, wins: 3, teams: false };
  private round = 0;
  private inputs = new Map<number, (NetAction | null)[]>();
  private nextFrame = 1;
  private reports = new Map<number, OverReport>();
  private victories: number[] = [];
  private readonly levels: LevelChoice[];
  private readonly random: () => number;
  private readonly schedule: (callback: () => void, ms: number) => void;

  constructor(options: RoomOptions) {
    this.levels = options.levels;
    this.random = options.random ?? Math.random;
    this.schedule = options.schedule ?? ((callback, ms) => setTimeout(callback, ms));
  }

  connect(connection: Connection): void {
    this.clients.set(connection.id, connection);
    connection.send({ type: "welcome", client: connection.id, slots: [] });
    connection.send(this.lobby());
  }

  disconnect(id: number): void {
    this.clients.delete(id);
    if (this.host === id) this.host = this.players.find((p) => p.client !== id)?.client ?? null;
    if (!this.playing) {
      this.players = this.players.filter((p) => p.client !== id).map((p, slot) => ({ ...p, slot }));
    }
    this.reports.delete(id);
    if (this.playing && !this.players.some((p) => this.clients.has(p.client))) this.stop();
    this.flush();
    this.checkOver();
    this.broadcast(this.lobby());
  }

  receive(id: number, message: ClientMessage): void {
    switch (message.type) {
      case "join":
        this.join(id, message.names);
        break;
      case "start":
        this.start(id, message.config);
        break;
      case "input":
        this.input(id, message.round, message.frame, message.actions);
        break;
      case "over":
        if (message.round === this.round && this.playing) {
          this.reports.set(id, { hash: message.hash, winnerTeam: message.winnerTeam });
          this.checkOver();
        }
        break;
    }
  }

  private join(id: number, names: string[]): void {
    const client = this.clients.get(id);
    if (!client) return;
    if (this.playing) return client.send({ type: "error", message: "A match is being played, wait for its end." });
    if (this.players.some((p) => p.client === id)) return client.send({ type: "error", message: "Already joined." });
    const free = MAX_PLAYERS - this.players.length;
    const wanted = names.slice(0, Math.max(0, free)).map((n) => n.trim().slice(0, 16) || "Player");
    if (wanted.length === 0) return client.send({ type: "error", message: "The game is full (6 players)." });
    const slots = wanted.map((name) => {
      const slot = this.players.length;
      this.players.push({ slot, name, client: id });
      return slot;
    });
    this.host ??= id;
    client.send({ type: "welcome", client: id, slots });
    this.broadcast(this.lobby());
  }

  private start(id: number, config: MatchConfig): void {
    if (id !== this.host || this.playing) return;
    if (this.players.length < 2) {
      this.clients.get(id)?.send({ type: "error", message: "At least 2 players are needed." });
      return;
    }
    // teams of 2 need an even number of players, at least 4
    const teams = config.teams && this.players.length >= 4 && this.players.length % 2 === 0;
    this.config = {
      lives: Math.min(9, Math.max(1, Math.trunc(config.lives))),
      wins: Math.min(9, Math.max(1, Math.trunc(config.wins))),
      teams,
    };
    this.playing = true;
    this.round = 0;
    this.victories = this.players.map(() => 0);
    this.broadcast({ type: "match", config: this.config, players: this.players });
    this.broadcast(this.lobby());
    this.startRound();
  }

  private startRound(): void {
    this.round++;
    this.reports.clear();
    this.inputs = new Map();
    this.nextFrame = 1;
    const n = this.players.length;
    const candidates = this.levels.filter((l) => l.players >= n && (!this.config.teams || l.gameMode & (1 << 7)));
    const level = candidates[Math.floor(this.random() * candidates.length)]!;
    const seed = Math.floor(this.random() * 2 ** 32);
    this.broadcast({ type: "round", round: this.round, level: level.file, seed, delay: INPUT_DELAY });
    // the first frames have no input yet: nothing pressed
    for (let frame = 1; frame <= INPUT_DELAY; frame++)
      this.inputs.set(
        frame,
        this.players.map(() => idleAction()),
      );
    this.flush();
  }

  private input(id: number, round: number, frame: number, actions: NetAction[]): void {
    if (!this.playing || round !== this.round || frame < this.nextFrame) return;
    const own = this.players.filter((p) => p.client === id);
    let row = this.inputs.get(frame);
    if (!row) {
      row = this.players.map(() => null);
      this.inputs.set(frame, row);
    }
    own.forEach((p, i) => {
      row[p.slot] = sanitize(actions[i]);
    });
    this.flush();
  }

  /** Sends every frame whose inputs are complete (missing players: nothing pressed). */
  private flush(): void {
    if (!this.playing) return;
    for (;;) {
      const row = this.inputs.get(this.nextFrame);
      if (!row) return;
      const complete = this.players.every((p) => row[p.slot] !== null || !this.clients.has(p.client));
      if (!complete) return;
      const actions = row.map((a) => a ?? idleAction());
      this.broadcast({ type: "frame", round: this.round, frame: this.nextFrame, actions });
      this.inputs.delete(this.nextFrame);
      this.nextFrame++;
    }
  }

  /** Once every connected client has finished the round: result, then next round or end. */
  private checkOver(): void {
    if (!this.playing || this.reports.size === 0) return;
    const connected = new Set(this.players.map((p) => p.client).filter((c) => this.clients.has(c)));
    if (![...connected].every((c) => this.reports.has(c))) return;
    const reports = [...this.reports.values()];
    const desync = reports.some((r) => r.hash !== reports[0]!.hash);
    const winnerTeam = reports[0]!.winnerTeam;
    if (winnerTeam !== null) {
      this.players.forEach((p) => {
        if (teamOfSlot(p.slot, this.config) === winnerTeam) this.victories[p.slot]!++;
      });
    }
    const round = this.round;
    this.reports.clear();
    this.broadcast({ type: "result", round, victories: this.victories, desync });
    if (this.victories.some((v) => v >= this.config.wins)) {
      this.broadcast({ type: "matchOver", victories: this.victories });
      this.stop();
    } else {
      this.schedule(() => {
        if (this.playing && this.round === round) this.startRound();
      }, 3000);
    }
  }

  private stop(): void {
    this.playing = false;
    // players who left during the match leave the lobby now
    this.players = this.players.filter((p) => this.clients.has(p.client)).map((p, slot) => ({ ...p, slot }));
    if (this.host !== null && !this.clients.has(this.host)) this.host = this.players[0]?.client ?? null;
    this.broadcast(this.lobby());
  }

  private lobby(): ServerMessage {
    return { type: "lobby", players: this.players, host: this.host ?? -1, playing: this.playing };
  }

  private broadcast(message: ServerMessage): void {
    for (const client of this.clients.values()) client.send(message);
  }
}

function sanitize(action: NetAction | undefined): NetAction {
  if (!Array.isArray(action)) return idleAction();
  const dir = Number(action[0]);
  return [
    (Number.isInteger(dir) && dir >= 0 && dir <= 5 ? dir : 5) as NetAction[0],
    action[1] ? 1 : 0,
    action[2] ? 1 : 0,
  ];
}
