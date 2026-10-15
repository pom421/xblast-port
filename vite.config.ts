import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: { singleQuote: false, printWidth: 120 },
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
    overrides: [
      {
        // Determinism: the simulation must give the same result on every machine.
        files: ["packages/sim/**"],
        rules: {
          "no-restricted-properties": [
            "error",
            { object: "Math", property: "random", message: "Use the seeded RNG of the simulation." },
            { object: "Date", property: "now", message: "Time comes from the tick counter." },
            { object: "performance", property: "now", message: "Time comes from the tick counter." },
          ],
          "no-restricted-globals": ["error", "setTimeout", "setInterval", "requestAnimationFrame"],
        },
      },
    ],
  },
  run: { cache: true },
});
