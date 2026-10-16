import { expect, test } from "vite-plus/test";
import { GameRandom, hexFloat } from "../src/rng.ts";

test("RANMAR gives the reference values of its authors", () => {
  // From the comments of random.c: seeds 1802/9373, skip 20000 numbers.
  const rng = GameRandom.ranmar(1802, 9373);
  for (let i = 0; i < 20000; i++) rng.uniform();
  const next = Array.from({ length: 6 }, () => rng.uniform() * 4096 * 4096);
  expect(next).toEqual([6533892, 14220222, 7275067, 6172232, 8354498, 10633180]);
});

test("hexFloat matches printf %a", () => {
  expect(hexFloat(0.1678)).toBe("0x1.57a786c22680ap-3");
  expect(hexFloat(1)).toBe("0x1p+0");
  expect(hexFloat(0.5)).toBe("0x1p-1");
});
