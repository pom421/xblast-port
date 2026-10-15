import { expect, test } from "vite-plus/test";
import { SIM_VERSION } from "../src/index.ts";

test("exposes the simulation version", () => {
  expect(SIM_VERSION).toBe(0);
});
