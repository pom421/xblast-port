// XBlast LAN server: serves the built client and the original data, and runs
// the game room over WebSocket (/ws). Usage: bun packages/server/src/index.ts
// (build the client first: vp run @xblast/client#build). PORT: default 3001.

import { join, normalize } from "node:path";
import type { LevelChoice } from "@xblast/sim";
import { MAX_MESSAGE_BYTES, parseClientMessage } from "./protocol.ts";
import { Room } from "./room.ts";

/** Sockets open at once: the 6 players of the room, and people waiting for the next match. */
const MAX_CLIENTS = 32;
/** Messages of a client per second: a game sends 20. MAX_RATE: for test/bots.ts, which plays faster. */
const MAX_RATE = Number(process.env.MAX_RATE) || 60;

const clientDir = join(import.meta.dir, "../../client/dist");
const assetsDir = join(import.meta.dir, "../../../assets");

const levels = (await Bun.file(join(assetsDir, "levels/index.json")).json()) as LevelChoice[];
const room = new Room({ levels });
let nextId = 1;
let sockets = 0;

interface SocketData {
  id: number;
  /** messages received during `second` */
  second: number;
  messages: number;
}

/** A file of the built client, or of the original data (levels, images, sounds). */
async function staticFile(pathname: string): Promise<Response | null> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if (decoded.includes("\0")) return new Response("Bad request", { status: 400 });
  const path = normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, "");
  for (const dir of [clientDir, assetsDir]) {
    const file = Bun.file(join(dir, path === "/" ? "index.html" : path));
    if (await file.exists()) return new Response(file);
  }
  return null;
}

/** Counts a message; false once the client sends more than a game ever does. */
function withinRate(data: SocketData): boolean {
  const second = Math.floor(Date.now() / 1000);
  if (second !== data.second) {
    data.second = second;
    data.messages = 0;
  }
  return ++data.messages <= MAX_RATE;
}

const server = Bun.serve<SocketData>({
  port: Number(process.env.PORT) || 3001,
  // never the debug pages of Bun (stack traces, paths), however the server is started
  development: false,
  async fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      if (sockets >= MAX_CLIENTS) return new Response("Server full", { status: 503 });
      if (!server.upgrade(req, { data: { id: nextId++, second: 0, messages: 0 } })) {
        return new Response("WebSocket expected", { status: 400 });
      }
      sockets++;
      return;
    }
    return (await staticFile(url.pathname)) ?? new Response("Not found", { status: 404 });
  },
  error(error) {
    console.error(error);
    return new Response("Internal server error", { status: 500 });
  },
  websocket: {
    // Heartbeat: a socket silent for 20 s gets a ping (the browser answers on its own),
    // so proxies that cut idle connections (often after 60 s) keep the lobby open.
    idleTimeout: 20,
    // a longer message closes the socket
    maxPayloadLength: MAX_MESSAGE_BYTES,
    open(ws) {
      room.connect({
        id: ws.data.id,
        send: (message) => ws.send(JSON.stringify(message)),
        close: (reason) => ws.close(4000, reason),
      });
    },
    message(ws, raw) {
      // a client of this game never sends anything else: no reason to keep the socket
      if (!withinRate(ws.data)) return ws.close(1008, "Too many messages");
      const message = typeof raw === "string" ? parseClientMessage(raw) : null;
      if (!message) return ws.close(1008, "Invalid message");
      room.receive(ws.data.id, message);
    },
    close(ws) {
      sockets--;
      room.disconnect(ws.data.id);
    },
  },
});

setInterval(() => room.second(), 1000);

console.log(`XBlast server: ${server.url.href} (${levels.length} levels)`);
