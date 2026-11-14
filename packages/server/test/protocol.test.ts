import { expect, test } from "vite-plus/test";
import type { ClientMessage } from "@xblast/sim";
import { parseClientMessage } from "../src/protocol.ts";

const colors = ["#000000", "#d0b088", "#000000", "#f8a000", "#000000", "#F8A000"];
const valid: ClientMessage[] = [
  { type: "join", players: [{ name: "Olaf" }, { name: "", look: { shape: "tall", colors: colors as never } }] },
  { type: "start", config: { lives: 2, wins: 3, teams: false } },
  { type: "start", config: { lives: 9, wins: 1, teams: true, bots: 5 } },
  { type: "input", round: 1, frame: 4, actions: [[5, 0, 0]] },
  { type: "over", round: 2, frame: 300, hash: 0xffffffff, winnerTeam: null },
  { type: "over", round: 2, frame: 300, hash: 0, winnerTeam: 5 },
];

test("the messages of the protocol are accepted as they are", () => {
  for (const message of valid) expect(parseClientMessage(JSON.stringify(message))).toEqual(message);
});

const invalid: [why: string, message: unknown][] = [
  ["not an object", null],
  ["not an object", 42],
  ["unknown type", { type: "kick", client: 1 }],
  ["no type", { players: [{ name: "Olaf" }] }],
  ["unknown field", { type: "start", config: { lives: 2, wins: 3, teams: false }, admin: true }],
  ["no player", { type: "join", players: [] }],
  ["too many players", { type: "join", players: Array.from({ length: 7 }, () => ({ name: "Olaf" })) }],
  ["player missing", { type: "join", players: [{ name: "Olaf" }, null] }],
  ["name too long", { type: "join", players: [{ name: "x".repeat(17) }] }],
  ["name not a string", { type: "join", players: [{ name: 42 }] }],
  ["unknown shape", { type: "join", players: [{ name: "Olaf", look: { shape: "../../x", colors } }] }],
  ["5 colors", { type: "join", players: [{ name: "Olaf", look: { shape: "tall", colors: colors.slice(1) } }] }],
  [
    "not a color",
    { type: "join", players: [{ name: "Olaf", look: { shape: "tall", colors: ["red", ...colors.slice(1)] } }] },
  ],
  ["no config", { type: "start" }],
  ["empty config", { type: "start", config: {} }],
  ["no life", { type: "start", config: { lives: 0, wins: 3, teams: false } }],
  ["too many wins", { type: "start", config: { lives: 2, wins: 10, teams: false } }],
  ["lives not an integer", { type: "start", config: { lives: 1.5, wins: 3, teams: false } }],
  ["lives as text", { type: "start", config: { lives: "2", wins: 3, teams: false } }],
  ["teams not a boolean", { type: "start", config: { lives: 2, wins: 3, teams: 1 } }],
  ["negative bots", { type: "start", config: { lives: 2, wins: 3, teams: false, bots: -1 } }],
  ["frame 0", { type: "input", round: 1, frame: 0, actions: [[5, 0, 0]] }],
  ["frame not an integer", { type: "input", round: 1, frame: 4.5, actions: [[5, 0, 0]] }],
  ["huge frame", { type: "input", round: 1, frame: 1e15, actions: [[5, 0, 0]] }],
  ["no action", { type: "input", round: 1, frame: 4, actions: [] }],
  ["unknown direction", { type: "input", round: 1, frame: 4, actions: [[6, 0, 0]] }],
  ["bomb not 0 or 1", { type: "input", round: 1, frame: 4, actions: [[5, 2, 0]] }],
  ["bomb as a boolean", { type: "input", round: 1, frame: 4, actions: [[5, true, 0]] }],
  ["action too long", { type: "input", round: 1, frame: 4, actions: [[5, 0, 0, 0]] }],
  ["hash too large", { type: "over", round: 1, frame: 9, hash: 2 ** 32, winnerTeam: 0 }],
  ["hash as text", { type: "over", round: 1, frame: 9, hash: "42", winnerTeam: 0 }],
  ["unknown team", { type: "over", round: 1, frame: 9, hash: 42, winnerTeam: 6 }],
  ["no winner field", { type: "over", round: 1, frame: 9, hash: 42 }],
];

test.each(invalid)("refused: %s", (_why, message) => {
  expect(parseClientMessage(JSON.stringify(message))).toBeNull();
});

test("refused: not JSON", () => {
  expect(parseClientMessage("{type:")).toBeNull();
  expect(parseClientMessage("")).toBeNull();
});
