// Checks what clients send. In lockstep the server simulates nothing: all it
// knows comes from the clients, so every message is checked here (types and
// bounds, unknown fields refused) before the room uses it. The room then
// checks what depends on its state: who sends, and for which round and frame.

import { MAX_LIVES, MAX_NAME, MAX_PLAYER, MAX_WINS, PLAYER_SHAPES, type ClientMessage } from "@xblast/sim";
import { z } from "zod";

/** Largest message of a client, in bytes: a join of 6 players is under 1 kB. */
export const MAX_MESSAGE_BYTES = 2048;

const color = z.string().regex(/^#[0-9a-f]{6}$/i);
const bit = z.literal([0, 1]);
/** round or frame number */
const counter = z.int().min(1).max(0x7fffffff);

const look = z.strictObject({
  shape: z.enum(PLAYER_SHAPES),
  colors: z.tuple([color, color, color, color, color, color]),
});

const action = z.tuple([z.literal([0, 1, 2, 3, 4, 5]), bit, bit]);

const clientMessage: z.ZodType<ClientMessage> = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("join"),
    players: z
      .array(z.strictObject({ name: z.string().max(MAX_NAME), look: look.optional() }))
      .min(1)
      .max(MAX_PLAYER),
  }),
  z.strictObject({
    type: z.literal("start"),
    config: z.strictObject({
      lives: z.int().min(1).max(MAX_LIVES),
      wins: z.int().min(1).max(MAX_WINS),
      teams: z.boolean(),
      bots: z.int().min(0).max(MAX_PLAYER).optional(),
    }),
  }),
  z.strictObject({
    type: z.literal("input"),
    round: counter,
    frame: counter,
    actions: z.array(action).min(1).max(MAX_PLAYER),
  }),
  z.strictObject({
    type: z.literal("over"),
    round: counter,
    frame: counter,
    hash: z.int().min(0).max(0xffffffff),
    winnerTeam: z
      .int()
      .min(0)
      .max(MAX_PLAYER - 1)
      .nullable(),
  }),
]);

/** The message of a client, or null when it is not exactly one of the protocol. */
export function parseClientMessage(raw: string): ClientMessage | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = clientMessage.safeParse(json);
  return parsed.success ? parsed.data : null;
}
