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

## Play (local, one keyboard)

```bash
vp install
vp run dev   # then open the URL printed by Vite
```

2 to 4 players on one keyboard, 1 to 3 lives, teams of 2 with 4 players, a
match of several random levels (or a chosen one). Controls (physical keys, so
the same places on AZERTY and QWERTY keyboards):

| Player | Move              | Bomb  | Special     |
| ------ | ----------------- | ----- | ----------- |
| Olaf   | Z Q S D (W A S D) | Space | left Shift  |
| Alex   | arrows            | Enter | right Shift |
| Harald | I J K L           | U     | O           |
| Rodi   | numpad 8 4 5 6    | 0     | .           |

Releasing a direction stops the player (the original `useStopKey=false`
option). Escape goes back to the menu. Graphics are the original files
(`assets/image`, Debian `xblast-tnt-images`/`-models`), decoded and recolored in
the browser like the original did. No sound yet, no network play yet.

## Layout

| Package           | Runs in    | Role                                                  |
| ----------------- | ---------- | ----------------------------------------------------- |
| `packages/sim`    | everywhere | Pure deterministic simulation (integers, seeded RNG)  |
| `packages/client` | browser    | Canvas2D rendering of the original graphics, keyboard |
| `packages/server` | Bun        | Relays player inputs (lockstep)                       |

`sim` has no DOM or Bun types, and lint forbids `Math.random`, `Date.now`
and timers in it: all players must compute exactly the same game.

## Fidelity: golden tests

`packages/sim` is a function-by-function transcription of the C code of XBlast
2.10.4 (`map.c`, `bomb.c`, `player.c`, `func.c`, `shrink.c`, `scramble.c`,
`game.c`), including its random generator. The original, run headless in
Docker, records games frame by frame (`archeology/README.md`), and the tests
replay them: the state must be identical at every frame.

- `packages/sim/test/golden/`: 20 recorded games, run by `vp run -r test`.
- `archeology/sweep.sh` then `node packages/sim/test/sweep.ts`: one game on each
  of the 1188 levels; all identical except one edge case of the C code
  (undefined behaviour, see `archeology/README.md`).

`assets/levels/` holds the 1188 level files of XBlast (Debian `xblast-tnt-levels`).

## License

GPL-2.0-or-later, like the original XBlast code and assets this port is
derived from. See [LICENSE](LICENSE).
