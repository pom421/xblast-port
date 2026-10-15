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
  and the actions of every player at each frame. Replaying a demo is
  deterministic: this is the basis of the golden tests (next step: dump the
  game state at each frame during replay).
