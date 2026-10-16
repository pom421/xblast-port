// Headless clients for the game server: each bot runs the simulation like the
// browser client, with random inputs, and the server compares the state hashes
// at the end of each round. Usage (server running):
//   bun packages/server/test/bots.ts [bots=3] [url=ws://localhost:3001/ws]

import { readFileSync } from "node:fs";
import {
  Dir,
  Game,
  hashGame,
  parseLevel,
  teamOfSlot,
  type LobbyPlayer,
  type MatchConfig,
  type NetAction,
  type ServerMessage,
} from "@xblast/sim";

const count = Number(process.argv[2] ?? 3);
const url = process.argv[3] ?? "ws://localhost:3001/ws";
const levelsDir = new URL("../../../assets/levels/", import.meta.url);

function bot(index: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    let client = -1;
    let lobby: LobbyPlayer[] = [];
    let config: MatchConfig = { lives: 1, wins: 2, teams: false };
    let game: Game | null = null;
    let round = 0;
    let delay = 3;
    const frames = new Map<number, NetAction[]>();
    let rounds = 0;
    let desyncs = 0;
    const send = (m: object) => socket.send(JSON.stringify(m));
    const rand = () => Math.random();

    function step(): void {
      // play every frame received, like the browser at full speed
      while (game && !game.over && frames.has(game.gameTime + 1)) {
        const frame = game.gameTime + 1;
        const actions = frames.get(frame)!;
        frames.delete(frame);
        const mine: NetAction[] = lobby
          .filter((p) => p.client === client)
          .map(() => [rand() < 0.1 ? ((1 + Math.floor(rand() * 4)) as Dir) : Dir.Default, rand() < 0.03 ? 1 : 0, 0]);
        send({ type: "input", round, frame: frame + delay, actions: mine });
        game.turn();
        game.evalActions(actions.map(([dir, bomb, special]) => ({ dir, bomb: !!bomb, special: !!special })));
        game.endFrame();
        if (game.over) {
          send({ type: "over", round, frame, hash: hashGame(game), winnerTeam: game.result().winnerTeam });
        }
      }
    }

    socket.addEventListener("open", () => send({ type: "join", names: [`Bot ${index + 1}`] }));
    socket.addEventListener("error", () => reject(new Error(`bot ${index}: connection failed`)));
    socket.addEventListener("close", () => reject(new Error(`bot ${index}: connection closed after ${rounds} rounds`)));
    socket.addEventListener("message", (e) => {
      const m = JSON.parse(String(e.data)) as ServerMessage;
      switch (m.type) {
        case "welcome":
          client = m.client;
          break;
        case "lobby":
          lobby = m.players;
          // the host starts once every bot joined
          if (m.host === client && !m.playing && m.players.length === count && rounds === 0) {
            send({ type: "start", config: { lives: 1, wins: 2, teams: count >= 4 && count % 2 === 0 } });
          }
          break;
        case "match":
          config = m.config;
          lobby = m.players;
          break;
        case "round":
          round = m.round;
          delay = m.delay;
          frames.clear();
          game = new Game({
            level: parseLevel(readFileSync(new URL(m.level, levelsDir), "latin1")),
            seed: m.seed,
            lives: config.lives,
            players: lobby.map((p) => ({ team: teamOfSlot(p.slot, config) })),
          });
          break;
        case "frame":
          if (m.round === round) frames.set(m.frame, m.actions);
          step();
          break;
        case "result":
          rounds++;
          if (m.desync) desyncs++;
          break;
        case "matchOver":
          socket.close();
          resolve(`bot ${index + 1}: ${rounds} rounds, ${desyncs} desync(s), victories ${m.victories.join(" ")}`);
          break;
        case "error":
          reject(new Error(m.message));
          break;
      }
    });
  });
}

const started = Date.now();
const results = await Promise.all(Array.from({ length: count }, (_, i) => bot(i)));
console.log(`match played in ${Math.round((Date.now() - started) / 1000)} s`);
for (const line of results) console.log(line);
process.exit(results.some((r) => !r.includes(" 0 desync")) ? 1 : 0);
