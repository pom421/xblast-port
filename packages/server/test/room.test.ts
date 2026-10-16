import { expect, test } from "vite-plus/test";
import type { ServerMessage } from "@xblast/sim";
import { INPUT_DELAY, Room } from "../src/room.ts";

const levels = [{ file: "Test.xal", players: 6, gameMode: 1023 }];

function setup(clients: number) {
  const scheduled: (() => void)[] = [];
  const room = new Room({ levels, random: () => 0.5, schedule: (callback) => scheduled.push(callback) });
  const inbox = Array.from({ length: clients }, () => [] as ServerMessage[]);
  inbox.forEach((messages, i) => room.connect({ id: i + 1, send: (m) => messages.push(m) }));
  return { room, inbox, scheduled };
}

const of = <T extends ServerMessage["type"]>(messages: ServerMessage[], type: T) =>
  messages.filter((m): m is Extract<ServerMessage, { type: T }> => m.type === type);

test("players join, the first one hosts and starts a round", () => {
  const { room, inbox } = setup(2);
  room.receive(1, { type: "join", players: [{ name: "Olaf" }, { name: "Alex" }] });
  room.receive(2, { type: "join", players: [{ name: "Harald" }] });
  expect(of(inbox[1]!, "welcome").at(-1)).toEqual({ type: "welcome", client: 2, slots: [2] });
  const lobby = of(inbox[1]!, "lobby").at(-1)!;
  expect(lobby.players.map((p) => p.name)).toEqual(["Olaf", "Alex", "Harald"]);
  expect(lobby.host).toBe(1);

  room.receive(2, { type: "start", config: { lives: 2, wins: 3, teams: false } });
  expect(of(inbox[0]!, "round")).toHaveLength(0);
  room.receive(1, { type: "start", config: { lives: 2, wins: 3, teams: false } });
  expect(of(inbox[1]!, "round")[0]).toMatchObject({ round: 1, level: "Test.xal", delay: INPUT_DELAY });
  // the first frames are sent at once, with nothing pressed
  expect(of(inbox[1]!, "frame").map((f) => f.frame)).toEqual([1, 2, 3]);
});

test("a frame is sent once every player sent its inputs", () => {
  const { room, inbox } = setup(2);
  room.receive(1, { type: "join", players: [{ name: "Olaf" }] });
  room.receive(2, { type: "join", players: [{ name: "Alex" }] });
  room.receive(1, { type: "start", config: { lives: 2, wins: 3, teams: false } });
  room.receive(1, { type: "input", round: 1, frame: 4, actions: [[1, 1, 0]] });
  expect(of(inbox[0]!, "frame").map((f) => f.frame)).toEqual([1, 2, 3]);
  room.receive(2, { type: "input", round: 1, frame: 4, actions: [[4, 0, 1]] });
  expect(of(inbox[0]!, "frame").at(-1)).toEqual({
    type: "frame",
    round: 1,
    frame: 4,
    actions: [
      [1, 1, 0],
      [4, 0, 1],
    ],
  });
  // a player who leaves no longer blocks the game
  room.disconnect(2);
  room.receive(1, { type: "input", round: 1, frame: 5, actions: [[2, 0, 0]] });
  expect(of(inbox[0]!, "frame").at(-1)!.actions).toEqual([
    [2, 0, 0],
    [5, 0, 0],
  ]);
});

test("round results count victories, detect desyncs, end the match", () => {
  const { room, inbox, scheduled } = setup(2);
  room.receive(1, { type: "join", players: [{ name: "Olaf" }] });
  room.receive(2, { type: "join", players: [{ name: "Alex" }] });
  room.receive(1, { type: "start", config: { lives: 1, wins: 2, teams: false } });
  room.receive(1, { type: "over", round: 1, frame: 100, hash: 42, winnerTeam: 1 });
  expect(of(inbox[0]!, "result")).toHaveLength(0);
  room.receive(2, { type: "over", round: 1, frame: 100, hash: 43, winnerTeam: 1 });
  expect(of(inbox[0]!, "result")[0]).toEqual({ type: "result", round: 1, victories: [0, 1], desync: true });
  scheduled.shift()!();
  expect(of(inbox[0]!, "round").at(-1)!.round).toBe(2);
  room.receive(1, { type: "over", round: 2, frame: 80, hash: 7, winnerTeam: 1 });
  room.receive(2, { type: "over", round: 2, frame: 80, hash: 7, winnerTeam: 1 });
  expect(of(inbox[0]!, "matchOver")[0]!.victories).toEqual([0, 2]);
  expect(of(inbox[0]!, "lobby").at(-1)!.playing).toBe(false);
});

test("the host can add computer players, removed at the end of the match", () => {
  const { room, inbox } = setup(1);
  room.receive(1, { type: "join", players: [{ name: "Olaf" }] });
  room.receive(1, { type: "start", config: { lives: 1, wins: 1, teams: true, bots: 3 } });
  const match = of(inbox[0]!, "match")[0]!;
  expect(match.players.map((p) => [p.name, p.bot ?? false])).toEqual([
    ["Olaf", false],
    ["Computer 1", true],
    ["Computer 2", true],
    ["Computer 3", true],
  ]);
  expect(match.config).toEqual({ lives: 1, wins: 1, teams: true, bots: 3 });
  // computer players never block the lockstep: their inputs are computed by every client
  room.receive(1, { type: "input", round: 1, frame: 4, actions: [[1, 0, 0]] });
  expect(of(inbox[0]!, "frame").at(-1)!.frame).toBe(4);
  room.receive(1, { type: "over", round: 1, frame: 50, hash: 1, winnerTeam: 0 });
  expect(
    of(inbox[0]!, "lobby")
      .at(-1)!
      .players.map((p) => p.name),
  ).toEqual(["Olaf"]);
});
