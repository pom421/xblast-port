// Blocks any install that does not use the exact Bun version pinned in
// package.json > packageManager (npm, pnpm, yarn or another Bun version).
// Zero dependencies: runs from the "preinstall" hook, before node_modules exists.
const { packageManager } = require("../package.json");
const expected = packageManager.replace("@", "/");
const userAgent = process.env.npm_config_user_agent || "";

if (!userAgent.startsWith(`${expected} `) && userAgent !== expected) {
  console.error(
    `\nThis project must be installed with ${packageManager} (package.json > packageManager).\n` +
      "Install Vite+ (https://viteplus.dev), then run: vp install\n" +
      `(detected: ${userAgent || "unknown"})\n`,
  );
  process.exit(1);
}
