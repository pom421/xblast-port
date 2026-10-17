# Archeology: the original XBlast

Everything needed to study the original game, the reference for the port.
Downloads and generated files go to `original/` (not versioned).

## History (CVS → git)

```bash
archeology/cvs-to-git.sh   # → original/history (git), takes ~10 min
```

- 1019 commits, May 2004 → March 2009 (fzago, alfie, iskywalker, lodott…);
  the CVS starts with release 2.9.x, older history is lost.
- Commit `ad9111a` (2006-06-17) is exactly the 2.10.4 tarball (except `$Id$` lines).
  The `r2_10_4` tag is slightly off; 167 commits come after 2.10.4.

## Running the original

X11 build of 2.10.4 from the Debian source package (upstream tarball + gcc
fixes), data from the Debian `xblast-tnt-*` packages, displayed with noVNC:

```bash
docker build -t xblast-original archeology/original
docker run --rm -p 127.0.0.1:6080:6080 \
  -v "$PWD/original/home:/root/.xblast_tnt" xblast-original
# then open http://localhost:6080/vnc.html?autoconnect=1&resize=scale
```

The volume keeps config and recorded demos between runs. No sound.

## Notes for the port (2.10.4)

- **Grid** 15×13 (`MAZE_W`, `MAZE_H`), 6 players max (16 with `SMPF`).
- **Time**: one game lasts `GAME_TIME` = 60 × 48 + 8 = 2888 frames.
- **Turn order** (`GameTurn`, `game.c`): bots, players, shrink, scramble,
  nasty walls, bombs, explosions, chain ignitions, stun, virus/junkie
  infection, evil grail, junkie countdown, player hits, status bar.
- **RNG** (`random.c`): `GameRandomNumber(n)` is Marsaglia–Zaman RANMAR
  (floating point, but only `+ - <` on doubles: bit-exact in JavaScript),
  seeded by `SeedRandom(seed)` then 100 warm-up draws. Beware: building with
  `DEBUG_RANDOM` switches to a different LCG generator.
- **Demos** (`demo.c`, `game_demo.c`): a recorded game is the seed, the level
  and the actions of every player at each frame.

## Golden games

The image also contains `xblast-golden`, the original with a headless mode
(`archeology/original/golden/golden.c`): it plays games with "monkey" players
(pseudo-random inputs from their own generator, so the game random generator
only serves the rules) and writes the whole state at each frame, as JSON Lines.
The TypeScript engine must give exactly the same states
(`packages/sim/test/golden.test.ts`).

```bash
# one game per level (1188), in original/sweep/, then replay them all in TypeScript
archeology/sweep.sh [bombPerMille] [specialPerMille]
node packages/sim/test/sweep.ts
```

Protocol of a game: `SeedRandom (seed)`, `ConfigLevel`, then for each frame
`GameTurn`, dump, inputs (`GameEvalAction`), `GameUpdateWindow`. The intro
screens of the real game also draw random numbers: they are not part of it.

Result (2.10.4, 6 players): 1188/1188 levels identical, and 1187/1188 when
players also use the special key. The last one, `FullPowerRingOFire`, has an
explosion going out of the maze: the C code then reads memory outside of the
`maze` array (undefined behaviour), which the port does not emulate.

The same binary also dumps the texts of the level intro screen (player, level
and extra info) of every level, the reference of `packages/sim/test/info.test.ts`:

```bash
levels=$(ls assets/levels | sed -n 's/\.xal$//p' | paste -sd, -)
docker run --rm -e LEVELS="$levels" -v "$PWD/original/info:/out" \
  -v "$PWD/archeology/original/golden/config/game.cfg:/root/.xblast_tnt/config/game.cfg:ro" \
  --entrypoint sh xblast-original -c 'Xvfb :0 -nolisten tcp >/dev/null 2>&1 & sleep 1;
    DISPLAY=:0 XBLAST_GOLDEN=/out XBLAST_GOLDEN_INFO=1 XBLAST_GOLDEN_LEVELS="$LEVELS" xblast-golden'
gzip -9c original/info/level-info.jsonl > packages/sim/test/level-info.jsonl.gz
```

Other scripts:

- `gen-shrinkdata.py`: converts `shrinkdat.h` into `packages/sim/src/shrinkdata.ts`.
- Some levels crash the original when many levels run in one process: the
  sweep runs each level in its own process.
