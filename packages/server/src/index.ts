// XBlast LAN server: serves the built client and the original data, and runs
// the game room over WebSocket (/ws). Usage: bun packages/server/src/index.ts
// (build the client first: vp run @xblast/client#build). PORT: default 3001.

import { join, normalize } from "node:path";
import type { ClientMessage, LevelChoice } from "@xblast/sim";
import { Room } from "./room.ts";

const clientDir = join(import.meta.dir, "../../client/dist");
const assetsDir = join(import.meta.dir, "../../../assets");

const levels = (await Bun.file(join(assetsDir, "levels/index.json")).json()) as LevelChoice[];
const room = new Room({ levels });
let nextId = 1;

interface SocketData {
  id: number;
}

/** A file of the built client, or of the original data (levels, images, sounds). */
async function staticFile(pathname: string): Promise<Response | null> {
  const path = normalize(decodeURIComponent(pathname)).replace(/^(\.\.(\/|\\|$))+/, "");
  for (const dir of [clientDir, assetsDir]) {
    const file = Bun.file(join(dir, path === "/" ? "index.html" : path));
    if (await file.exists()) return new Response(file);
  }
  return null;
}

const server = Bun.serve<SocketData>({
  port: Number(process.env.PORT) || 3001,
  async fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      if (server.upgrade(req, { data: { id: nextId++ } })) return;
      return new Response("WebSocket expected", { status: 400 });
    }
    return (await staticFile(url.pathname)) ?? new Response("Not found", { status: 404 });
  },
  websocket: {
    open(ws) {
      room.connect({ id: ws.data.id, send: (message) => ws.send(JSON.stringify(message)) });
    },
    message(ws, raw) {
      try {
        room.receive(ws.data.id, JSON.parse(String(raw)) as ClientMessage);
      } catch {
        ws.send(JSON.stringify({ type: "error", message: "Invalid message" }));
      }
    },
    close(ws) {
      room.disconnect(ws.data.id);
    },
  },
});

console.log(`XBlast server: ${server.url.href} (${levels.length} levels)`);
