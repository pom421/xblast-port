// The one game room of a server (a LAN party): lobby, then a match of rounds.
// Lockstep relay: a frame is sent to every client once the inputs of every
// player for that frame are known. Kept free of Bun APIs to be testable.

import {
  chooseLevel,
  idleAction,
  INTRO_SECONDS,
  MAX_PLAYER,
  teamOfSlot,
  type ClientMessage,
  type JoinPlayer,
  type LevelChoice,
  type LobbyPlayer,
  type MatchConfig,
  type NetAction,
  type ServerMessage,
} from "@xblast/sim";

/** frames between an input and its use: 3 × 50 ms */
export const INPUT_DELAY = 3;

/** seconds a round may wait for a client before anyone is told */
export const STALL_GRACE = 5;
/** seconds of the countdown that follows, before the client is removed from the match */
export const STALL_TIMEOUT = 15;

export interface Connection {
  readonly id: number;
  send(message: ServerMessage): void;
  /** Closes the connection; the client shows the reason. */
  close(reason: string): void;
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
  /** a round is being played: inputs and end reports are expected */
  private running = false;
  private config: MatchConfig = { lives: 2, wins: 3, teams: false };
  private round = 0;
  private inputs = new Map<number, (NetAction | null)[]>();
  private nextFrame = 1;
  /** seconds since the last frame sent */
  private waited = 0;
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
    if (!this.clients.delete(id)) return;
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

  /** A message checked by parseClientMessage: types and bounds are right, the sender may still lie. */
  receive(id: number, message: ClientMessage): void {
    switch (message.type) {
      case "join":
        this.join(id, message.players);
        break;
      case "start":
        this.start(id, message.config);
        break;
      case "input":
        this.input(id, message.round, message.frame, message.actions);
        break;
      case "over":
        this.report(id, message.round, { hash: message.hash, winnerTeam: message.winnerTeam });
        break;
    }
  }

  private join(id: number, joining: JoinPlayer[]): void {
    const client = this.clients.get(id);
    if (!client) return;
    if (this.playing) return client.send({ type: "error", message: "A match is being played, wait for its end." });
    if (this.players.some((p) => p.client === id)) return client.send({ type: "error", message: "Already joined." });
    const wanted = joining.slice(0, MAX_PLAYER - this.players.length);
    if (wanted.length === 0) {
      return client.send({ type: "error", message: `The game is full (${MAX_PLAYER} players).` });
    }
    const slots = wanted.map(({ name, look }) => {
      const slot = this.players.length;
      this.players.push({ slot, name: name.trim() || "Player", client: id, look });
      return slot;
    });
    this.host ??= id;
    client.send({ type: "welcome", client: id, slots });
    this.broadcast(this.lobby());
  }

  private start(id: number, config: MatchConfig): void {
    if (id !== this.host || this.playing) return;
    const bots = Math.min(MAX_PLAYER - this.players.length, config.bots ?? 0);
    if (this.players.length + bots < 2) {
      this.clients.get(id)?.send({ type: "error", message: "At least 2 players are needed (computer players count)." });
      return;
    }
    for (let i = 0; i < bots; i++) {
      this.players.push({ slot: this.players.length, name: `Computer ${i + 1}`, client: -1, bot: true });
    }
    const total = this.players.length;
    // teams of 2 need an even number of players, at least 4
    const teams = config.teams && total >= 4 && total % 2 === 0;
    this.config = { lives: config.lives, wins: config.wins, teams, bots };
    this.playing = true;
    this.round = 0;
    this.victories = this.players.map(() => 0);
    this.broadcast({ type: "match", config: this.config, players: this.players });
    this.broadcast(this.lobby());
    this.startRound();
  }

  private startRound(): void {
    this.round++;
    this.running = true;
    this.reports.clear();
    this.inputs = new Map();
    this.nextFrame = 1;
    const level = chooseLevel(this.levels, this.players.length, this.config.teams, this.random);
    const seed = Math.floor(this.random() * 2 ** 32);
    this.broadcast({ type: "round", round: this.round, level: level.file, seed, delay: INPUT_DELAY });
    // the first frames have no input yet: nothing pressed
    for (let frame = 1; frame <= INPUT_DELAY; frame++)
      this.inputs.set(
        frame,
        this.players.map(() => idleAction()),
      );
    this.flush();
    // no input comes during the level intro: it is not waiting
    this.waited = -INTRO_SECONDS;
  }

  private input(id: number, round: number, frame: number, actions: NetAction[]): void {
    if (!this.running || round !== this.round) return;
    // a client only plays the frames sent: its inputs are for the INPUT_DELAY next ones
    if (frame < this.nextFrame || frame >= this.nextFrame + INPUT_DELAY) return;
    const own = this.players.filter((p) => p.client === id);
    if (own.length === 0 || actions.length !== own.length) return;
    let row = this.inputs.get(frame);
    if (!row) {
      row = this.players.map(() => null);
      this.inputs.set(frame, row);
    }
    own.forEach((p, i) => {
      row[p.slot] ??= actions[i]!;
    });
    this.flush();
  }

  /** End of the round seen by a client: only one that plays, and once. */
  private report(id: number, round: number, report: OverReport): void {
    if (!this.running || round !== this.round) return;
    if (this.reports.has(id) || !this.players.some((p) => p.client === id)) return;
    this.reports.set(id, report);
    this.checkOver();
  }

  /** Sends every frame whose inputs are complete (missing players: nothing pressed). */
  private flush(): void {
    if (!this.running) return;
    for (;;) {
      const row = this.inputs.get(this.nextFrame);
      if (!row) return;
      const complete = this.players.every((p) => row[p.slot] !== null || !this.clients.has(p.client));
      if (!complete) return;
      const actions = row.map((a) => a ?? idleAction());
      this.broadcast({ type: "frame", round: this.round, frame: this.nextFrame, actions });
      this.inputs.delete(this.nextFrame);
      this.nextFrame++;
      this.waited = 0;
    }
  }

  /**
   * To call every second. In lockstep one silent client (a hidden tab, a lost
   * network) freezes the round of everyone: after a grace, everyone sees a
   * countdown, then the clients waited for are removed and the round goes on.
   */
  second(): void {
    if (!this.running) return;
    const left = STALL_GRACE + STALL_TIMEOUT - ++this.waited;
    if (left > STALL_TIMEOUT) return;
    const late = this.late();
    if (left > 0) return this.broadcast({ type: "stall", clients: late, seconds: left });
    this.waited = 0;
    for (const id of late) {
      this.clients.get(id)?.close("Removed from the match: no answer from this computer.");
      this.disconnect(id);
    }
  }

  /** Clients the round waits for: their end report once a client sent one, else their inputs. */
  private late(): number[] {
    const row = this.inputs.get(this.nextFrame);
    const ending = this.reports.size > 0;
    const late = this.players.filter(
      (p) => this.clients.has(p.client) && (ending ? !this.reports.has(p.client) : (row?.[p.slot] ?? null) === null),
    );
    return [...new Set(late.map((p) => p.client))];
  }

  /** Once every connected client has finished the round: result, then next round or end. */
  private checkOver(): void {
    if (!this.running || this.reports.size === 0) return;
    const connected = new Set(this.players.map((p) => p.client).filter((c) => this.clients.has(c)));
    if (![...connected].every((c) => this.reports.has(c))) return;
    const reports = [...this.reports.values()];
    const same = (a: OverReport, b: OverReport) => a.hash === b.hash && a.winnerTeam === b.winnerTeam;
    const desync = reports.some((r) => !same(r, reports[0]!));
    // the result of most clients: one client alone cannot choose the winner
    const agreed = reports.find((r) => reports.filter((o) => same(r, o)).length * 2 > reports.length);
    const winnerTeam = agreed?.winnerTeam ?? null;
    if (winnerTeam !== null) {
      this.players.forEach((p) => {
        if (teamOfSlot(p.slot, this.config) === winnerTeam) this.victories[p.slot]!++;
      });
    }
    const round = this.round;
    this.running = false;
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
    this.running = false;
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
