import { SIM_VERSION } from "@xblast/sim";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
const ctx = canvas?.getContext("2d");
if (!canvas || !ctx) throw new Error("Canvas 2D unavailable");

ctx.fillStyle = "#222";
ctx.fillRect(0, 0, canvas.width, canvas.height);
ctx.fillStyle = "#eee";
ctx.font = "16px monospace";
ctx.fillText(`XBlast - sim v${SIM_VERSION}`, 16, 32);
