# XBlast port

A modern web port of [XBlast](https://sourceforge.net/projects/xblast/), the
multiplayer bomb game played on French university LANs around 2000: up to
6 players, teams of 2, 2 lives, and a shrinking arena at the end of the round.

Work in progress: see [docs/plan.md](docs/plan.md) (in French).

## Getting started

Install [Vite+](https://viteplus.dev) (`brew install vite-plus`, or
`curl -fsSL https://vite.plus | bash`) and enable managed mode with
`vp env on`. Vite+ then picks the exact Node.js and Bun versions pinned in
`package.json`, so every machine builds the same way.

```bash
vp install   # dependencies (Bun, exact pinned version)
vp check     # format, lint, type-check
vp run -r test
vp run dev   # client dev server
```

## Layout

| Package           | Runs in    | Role                                                 |
| ----------------- | ---------- | ---------------------------------------------------- |
| `packages/sim`    | everywhere | Pure deterministic simulation (integers, seeded RNG) |
| `packages/client` | browser    | Canvas2D rendering, keyboard input                   |
| `packages/server` | Bun        | Relays player inputs (lockstep)                      |

`sim` has no DOM or Bun types, and lint forbids `Math.random`, `Date.now`
and timers in it: all players must compute exactly the same game.

## License

GPL-2.0-or-later, like the original XBlast code and assets this port is
derived from. See [LICENSE](LICENSE).
