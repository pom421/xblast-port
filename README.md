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

1 to 4 players on one keyboard, against computer players if you like (the AI
of the original, `bot.c`), 1 to 3 lives, teams of 2 with 4 or 6 players, a match
of several random levels (or a chosen one).

Each player of the keyboard chooses a name, one of the 20 shapes of the
original, its 6 colors and its keys (click a key, then press the new one); the
settings stay in the browser. Default keys (physical keys, same places on AZERTY
and QWERTY keyboards):

| Player | Move           | Bomb     | Stop       | Special  |
| ------ | -------------- | -------- | ---------- | -------- |
| 1      | arrows         | Space    | left Shift | Tab      |
| 2      | Z Q S D        | F        | E          | R        |
| 3      | I J K L        | H        | U          | O        |
| 4      | numpad 8 4 2 6 | numpad 0 | numpad 5   | numpad . |

Like the original, a player keeps walking until the stop key; "Releasing a
direction stops" changes that per player. Escape or P pauses the game (resume,
abandon the round, quit to the menu). When every keyboard player is out, Enter
plays the rest of the round at once: the computer players still decide who wins. Graphics
are the original files (`assets/image`, Debian `xblast-tnt-images`/`-models`),
decoded and recolored in the browser like the original did, with its sound
effects (`assets/sounds`). No music yet.

## Play on a LAN (up to 6 players)

One computer hosts the game: it serves the client and relays the inputs.

```bash
vp run @xblast/client#build
bun packages/server/src/index.ts   # PORT=3001 by default
```

Every player opens `http://<host address>:3001`, chooses **Online**, 1 or 2
players on their computer, and connects. The first one to join hosts the match
(lives, victories to win, computer players, teams of 2) and starts it.
Computer players cost no network traffic: every client computes their inputs.

How it works: the simulation is deterministic, so clients only exchange their
inputs (lockstep). Each input is used 3 frames (150 ms) after it is sent; the
server sends a frame to everyone once it has the inputs of every player, and
compares a hash of the game state at the end of each round to detect a
desynchronisation. In development, run `vp run @xblast/server#dev` next to
`vp run dev` (Vite forwards `/ws` to the server).

`bun packages/server/test/bots.ts [bots]` plays a whole match with headless bots
against a running server.

## Layout

| Package           | Runs in    | Role                                                    |
| ----------------- | ---------- | ------------------------------------------------------- |
| `packages/sim`    | everywhere | Pure deterministic simulation (integers, seeded RNG)    |
| `packages/client` | browser    | Canvas2D rendering of the original graphics, keyboard   |
| `packages/server` | Bun        | LAN server: serves the client, relays inputs (lockstep) |

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
