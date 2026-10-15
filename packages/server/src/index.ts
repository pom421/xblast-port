import { SIM_VERSION } from "@xblast/sim";

// PORT: another port if 3001 is taken.
const server = Bun.serve({
  port: Number(process.env.PORT) || 3001,
  fetch(req, server) {
    if (server.upgrade(req)) return;
    return new Response(`XBlast server - sim v${SIM_VERSION}`);
  },
  websocket: {
    // Placeholder until the lockstep relay: echo every message back.
    message(ws, message) {
      ws.send(message);
    },
  },
});

console.log(`XBlast server listening on ${server.url.href}`);
