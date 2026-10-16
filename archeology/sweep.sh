#!/bin/sh
# One golden game per level of assets/levels, each in its own process (some
# levels crash the original). Output: original/sweep/*.jsonl, crashes listed in
# original/sweep/crashes.txt. Usage: archeology/sweep.sh [bombPerMille] [specialPerMille]
set -e
cd "$(dirname "$0")/.."
mkdir -p original/sweep
ls assets/levels | sed 's/\.xal$//' > original/sweep/levels.txt
docker run --rm -e BOMB="${1:-8}" -e SPECIAL="${2:-10}" \
  -v "$PWD/original/sweep:/out" \
  -v "$PWD/archeology/original/golden/config/game.cfg:/root/.xblast_tnt/config/game.cfg:ro" \
  --entrypoint sh xblast-original -c '
    Xvfb :0 -screen 0 1024x768x24 -nolisten tcp >/dev/null 2>&1 & sleep 1
    : > /out/crashes.txt
    seed=1000
    while read -r level; do
      seed=$((seed + 1))
      [ -s "/out/$level-seed$seed.jsonl" ] && continue
      DISPLAY=:0 XBLAST_GOLDEN=/out XBLAST_GOLDEN_RUNS=1 XBLAST_GOLDEN_SEED=$seed \
        XBLAST_GOLDEN_BOMB=$BOMB XBLAST_GOLDEN_SPECIAL=$SPECIAL XBLAST_GOLDEN_LEVELS="$level" \
        /usr/games/xblast-golden >/dev/null 2>&1 || echo "$level $seed" >> /out/crashes.txt
    done < /out/levels.txt'
echo "$(ls original/sweep/*.jsonl | wc -l) games, $(wc -l < original/sweep/crashes.txt) crashes"
