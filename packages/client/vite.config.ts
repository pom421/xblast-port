import { defineConfig } from "vite-plus";

export default defineConfig({
  // original XBlast data (levels, images), served as is
  publicDir: "../../assets",
  // dev: the game server runs on its own (vp run @xblast/server#dev)
  server: { proxy: { "/ws": { target: "ws://localhost:3001", ws: true } } },
});
