// Local match: 1 to 4 players on this keyboard, plus computer players. The
// rounds follow each other on Space or Return; the pause menu is local only.

import { MAX_PLAYER, chooseLevel } from "@xblast/sim";
import { defaultPlayers } from "./assets.ts";
import {
  app,
  assets,
  backToMenu,
  beginRound,
  endRound,
  input,
  loadStage,
  playFrame,
  roundMessage,
  settings,
  teamOf,
  type LocalMatch,
  type Round,
} from "./match.ts";
import { render } from "./render.ts";
import { ctx, setupForm, showBanner, showOverlay } from "./ui.ts";

export async function startLocal(): Promise<void> {
  const data = new FormData(setupForm);
  const humans = Number(data.get("players"));
  const bots = Math.min(MAX_PLAYER - humans, Number(data.get("bots")));
  const players = humans + bots;
  // keyboard players first, then computer players with the default looks
  const looks = Array.from({ length: players }, (_, slot) => (slot < humans ? settings[slot]! : defaultPlayers[slot]!));
  input.setBindings(settings.slice(0, humans));
  app.roster = {
    names: looks.map((look, slot) => (slot < humans ? look.name : `${look.name} (CPU)`)),
    looks: looks.map(({ name, shape, colors }) => ({ name, shape, colors })),
    bots: Array.from({ length: players }, (_, slot) => slot >= humans),
    config: {
      lives: Number(data.get("lives")),
      wins: Number(data.get("wins")),
      teams: data.get("teams") === "on" && players >= 4 && players % 2 === 0,
    },
  };
  const local: LocalMatch = {
    mode: "local",
    level: (data.get("level") as string | null) ?? "random",
    round: 0,
    seed: crypto.getRandomValues(new Uint32Array(1))[0]!,
  };
  app.match = local;
  app.victories = app.roster.names.map(() => 0);
  app.phase = { kind: "waiting" };
  setupForm.hidden = true;
  showOverlay("<p>Loading…</p>");
  await loadStage();
  await nextLocalRound(local);
}

export async function nextLocalRound(local: LocalMatch): Promise<void> {
  const { names, config } = app.roster;
  const file =
    local.level === "random" ? chooseLevel(assets.levels, names.length, config.teams, Math.random).file : local.level;
  local.round++;
  await beginRound(file, (local.seed + local.round) >>> 0);
}

/** Every keyboard player is out (and computer players still play). */
export function humansOut(): boolean {
  const { round, roster } = app;
  return (
    !!round && roster.bots.some((b) => !b) && round.game.players.every((p, slot) => roster.bots[slot] || p.lives <= 0)
  );
}

export function tickLocal(round: Round): void {
  // computer players get their inputs from the game itself
  playFrame(round, input.take().slice(0, app.roster.bots.filter((b) => !b).length));
  if (!round.game.over) {
    showBanner(humansOut() ? "You are out: <strong>Enter</strong> to fast-forward to the end of the round" : null);
    return;
  }
  finishLocalRound(round);
}

/** Plays the rest of the round at once, without display: same result as watching it. */
export function fastForward(): void {
  const { round } = app;
  // local only: online, playing ahead of the others would break the lockstep
  if (!round || app.match?.mode !== "local" || app.phase.kind !== "play") return;
  const { game, scene, status } = round;
  while (!game.over) {
    game.turn();
    game.evalActions([]);
    game.endFrame();
  }
  render(ctx, game, scene);
  status.update(game);
  status.draw(ctx);
  finishLocalRound(round);
}

function finishLocalRound(round: Round, abandoned = false): void {
  app.sound?.stopMusic();
  showOverlay(null);
  if (abandoned) {
    endRound(round, "Round abandoned", null);
    return;
  }
  const { winnerTeam } = round.game.result();
  if (winnerTeam !== null) app.roster.names.forEach((_, slot) => teamOf(slot) === winnerTeam && app.victories[slot]!++);
  endRound(round, roundMessage(round.game), winnerTeam);
}

export function pause(): void {
  if (app.phase.kind !== "play" && app.phase.kind !== "intro") return;
  app.phase = { kind: "paused", resume: app.phase };
  showBanner(null);
  showOverlay(
    `<h2>Pause</h2><div class="menu">` +
      `<button type="button" data-pause="resume">Resume (P or Escape)</button>` +
      (humansOut()
        ? `<button type="button" data-pause="forward">Fast-forward to the end of the round (Enter)</button>`
        : "") +
      `<button type="button" data-pause="abandon">Abandon the round (A)</button>` +
      `<button type="button" data-pause="quit">Quit to the menu (Q)</button></div>`,
  );
}

/** A choice of the pause menu: resume, forward, abandon or quit. */
export function pauseAction(action: string): void {
  const { phase, round } = app;
  if (phase.kind !== "paused" || !round) return;
  switch (action) {
    case "resume":
      app.phase = phase.resume;
      showOverlay(null);
      input.take();
      break;
    case "forward":
      if (!humansOut()) return;
      app.phase = { kind: "play" };
      showOverlay(null);
      fastForward();
      break;
    case "abandon":
      finishLocalRound(round, true);
      break;
    case "quit":
      backToMenu();
      break;
  }
}
