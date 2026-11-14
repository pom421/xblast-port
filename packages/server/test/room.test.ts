import { expect, test } from "vite-plus/test";
import { INTRO_SECONDS, type ServerMessage } from "@xblast/sim";
import { INPUT_DELAY, Room, STALL_GRACE, STALL_TIMEOUT } from "../src/room.ts";

const levels = [{ file: "Test.xal", players: 6, gameMode: 1023 }];

function setup(clients: number) {
  const scheduled: (() => void)[] = [];
  const room = new Room({ levels, random: () => 0.5, schedule: (callback) => scheduled.push(callback) });
  const inbox = Array.from({ length: clients }, () => [] as ServerMessage[]);
  /** clients closed by the room */
  const closed: number[] = [];
  inbox.forEach((messages, i) =>
    room.connect({ id: i + 1, send: (m) => messages.push(m), close: () => closed.push(i + 1) }),
  );
  return { room, inbox, scheduled, closed };
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
  // two clients with different games: no result to trust, nobody wins
  room.receive(2, { type: "over", round: 1, frame: 100, hash: 43, winnerTeam: 1 });
  expect(of(inbox[0]!, "result")[0]).toEqual({ type: "result", round: 1, victories: [0, 0], desync: true });
  // the round is over: a late report changes nothing
  room.receive(1, { type: "over", round: 1, frame: 100, hash: 42, winnerTeam: 1 });
  expect(of(inbox[0]!, "result")).toHaveLength(1);
  for (const round of [2, 3]) {
    scheduled.shift()!();
    expect(of(inbox[0]!, "round").at(-1)!.round).toBe(round);
    room.receive(1, { type: "over", round, frame: 80, hash: 7, winnerTeam: 1 });
    room.receive(2, { type: "over", round, frame: 80, hash: 7, winnerTeam: 1 });
  }
  expect(of(inbox[0]!, "matchOver")[0]!.victories).toEqual([0, 2]);
  expect(of(inbox[0]!, "lobby").at(-1)!.playing).toBe(false);
});

test("a client alone cannot choose the winner", () => {
  const { room, inbox } = setup(4);
  for (const id of [1, 2, 3]) room.receive(id, { type: "join", players: [{ name: `Player ${id}` }] });
  room.receive(1, { type: "start", config: { lives: 1, wins: 1, teams: false } });
  // client 4 does not play: its report is ignored, and nobody waits for it
  room.receive(4, { type: "over", round: 1, frame: 1, hash: 9, winnerTeam: 2 });
  // client 3 lies, and reports twice
  room.receive(3, { type: "over", round: 1, frame: 100, hash: 42, winnerTeam: 2 });
  room.receive(3, { type: "over", round: 1, frame: 100, hash: 42, winnerTeam: 2 });
  room.receive(1, { type: "over", round: 1, frame: 100, hash: 42, winnerTeam: 0 });
  expect(of(inbox[0]!, "result")).toHaveLength(0);
  room.receive(2, { type: "over", round: 1, frame: 100, hash: 42, winnerTeam: 0 });
  expect(of(inbox[0]!, "result")[0]).toEqual({ type: "result", round: 1, victories: [1, 0, 0], desync: true });
});

test("inputs are taken from players only, for the next frames only", () => {
  const { room, inbox } = setup(3);
  room.receive(1, { type: "join", players: [{ name: "Olaf" }, { name: "Alex" }] });
  room.receive(2, { type: "join", players: [{ name: "Harald" }] });
  room.receive(1, { type: "start", config: { lives: 2, wins: 3, teams: false } });
  const sent = () => of(inbox[0]!, "frame").map((f) => f.frame);
  // a frame too far ahead, a client that does not play, the wrong number of players
  room.receive(2, { type: "input", round: 1, frame: 4 + INPUT_DELAY, actions: [[1, 0, 0]] });
  room.receive(3, { type: "input", round: 1, frame: 4, actions: [[1, 0, 0]] });
  room.receive(1, { type: "input", round: 1, frame: 4, actions: [[1, 0, 0]] });
  room.receive(2, { type: "input", round: 1, frame: 4, actions: [[3, 0, 0]] });
  expect(sent()).toEqual([1, 2, 3]);
  room.receive(1, {
    type: "input",
    round: 1,
    frame: 4,
    actions: [
      [1, 0, 0],
      [2, 0, 0],
    ],
  });
  // the first inputs of a frame are kept
  room.receive(2, { type: "input", round: 1, frame: 4, actions: [[4, 1, 1]] });
  expect(of(inbox[0]!, "frame").at(-1)).toEqual({
    type: "frame",
    round: 1,
    frame: 4,
    actions: [
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
    ],
  });
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

test("a round that waits for a client counts down, then goes on without it", () => {
  const { room, inbox, closed } = setup(3);
  for (const id of [1, 2, 3]) room.receive(id, { type: "join", players: [{ name: `Player ${id}` }] });
  const seconds = (n: number) => {
    for (let i = 0; i < n; i++) room.second();
  };
  // nothing is waited for in the lobby
  seconds(60);
  room.receive(1, { type: "start", config: { lives: 1, wins: 2, teams: false } });
  // the level intro, then the grace: nobody is told
  seconds(INTRO_SECONDS + STALL_GRACE - 1);
  expect(of(inbox[0]!, "stall")).toHaveLength(0);
  room.receive(1, { type: "input", round: 1, frame: 4, actions: [[1, 0, 0]] });
  seconds(1);
  expect(of(inbox[2]!, "stall")).toEqual([{ type: "stall", clients: [2, 3], seconds: STALL_TIMEOUT }]);
  // client 2 answers: the countdown goes on for client 3 only
  room.receive(2, { type: "input", round: 1, frame: 4, actions: [[2, 0, 0]] });
  seconds(STALL_TIMEOUT - 1);
  expect(of(inbox[0]!, "stall").at(-1)).toEqual({ type: "stall", clients: [3], seconds: 1 });
  expect(closed).toEqual([]);
  seconds(1);
  expect(closed).toEqual([3]);
  // the frame is sent without client 3, whose player stands still
  expect(of(inbox[0]!, "frame").at(-1)).toEqual({
    type: "frame",
    round: 1,
    frame: 4,
    actions: [
      [1, 0, 0],
      [2, 0, 0],
      [5, 0, 0],
    ],
  });
  expect(of(inbox[2]!, "frame").at(-1)!.frame).toBe(3);

  // end of the round: a client that never reports it is waited for, then removed
  room.receive(1, { type: "over", round: 1, frame: 100, hash: 42, winnerTeam: 0 });
  seconds(STALL_GRACE);
  expect(of(inbox[0]!, "stall").at(-1)).toEqual({ type: "stall", clients: [2], seconds: STALL_TIMEOUT });
  seconds(STALL_TIMEOUT);
  expect(closed).toEqual([3, 2]);
  expect(of(inbox[0]!, "result")[0]).toEqual({ type: "result", round: 1, victories: [1, 0, 0], desync: false });
  // between two rounds, nothing is waited for
  const stalls = of(inbox[0]!, "stall").length;
  seconds(60);
  expect(of(inbox[0]!, "stall")).toHaveLength(stalls);
  expect(closed).toEqual([3, 2]);
});
