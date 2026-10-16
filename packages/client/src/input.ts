// Keyboard input, like the original game events (game.c): a direction is sent
// when its key is pressed, "stop" with the stop key, bomb and special on key
// press. Releasing a direction stops the player only when the player chose it
// (the original "useStopKey=false"). Keys are physical keys (event.code).

import { Dir, type PlayerAction } from "@xblast/sim";
import type { Keys } from "./settings.ts";

export interface KeyBinding {
  keys: Keys;
  releaseStops: boolean;
}

export class KeyboardInput {
  private bindings: KeyBinding[] = [];
  private pending: PlayerAction[] = [];
  private held: Set<string>[] = [];
  /** keys are ignored while a settings field waits for a key */
  capturing = false;

  constructor(bindings: KeyBinding[]) {
    this.setBindings(bindings);
    window.addEventListener("keydown", (e) => this.key(e, true));
    window.addEventListener("keyup", (e) => this.key(e, false));
    window.addEventListener("blur", () => this.releaseAll());
  }

  setBindings(bindings: KeyBinding[]): void {
    this.bindings = bindings;
    this.pending = bindings.map(() => ({ dir: Dir.Default, bomb: false, special: false }));
    this.held = bindings.map(() => new Set());
  }

  /** Actions since the previous frame, then reset. */
  take(): PlayerAction[] {
    const actions = this.pending.map((a) => ({ ...a }));
    for (const a of this.pending) {
      a.dir = Dir.Default;
      a.bomb = false;
      a.special = false;
    }
    return actions;
  }

  private key(e: KeyboardEvent, down: boolean): void {
    if (this.capturing || e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    this.bindings.forEach(({ keys, releaseStops }, i) => {
      const dirs: [string, Dir][] = [
        [keys.up, Dir.Up],
        [keys.left, Dir.Left],
        [keys.down, Dir.Down],
        [keys.right, Dir.Right],
      ];
      const action = this.pending[i]!;
      const held = this.held[i]!;
      for (const [code, dir] of dirs) {
        if (e.code !== code) continue;
        e.preventDefault();
        if (down && !e.repeat) {
          held.add(code);
          action.dir = dir;
        } else if (!down) {
          held.delete(code);
          if (releaseStops) {
            // back to a direction still held, else stop
            const other = dirs.find(([c]) => held.has(c));
            action.dir = other ? other[1] : Dir.Stop;
          }
        }
      }
      if (e.code === keys.stop) {
        e.preventDefault();
        if (down && !e.repeat) action.dir = Dir.Stop;
      }
      if (e.code === keys.bomb) {
        e.preventDefault();
        if (down && !e.repeat) action.bomb = true;
      }
      if (e.code === keys.special) {
        e.preventDefault();
        if (down && !e.repeat) action.special = true;
      }
    });
  }

  private releaseAll(): void {
    this.held.forEach((held, i) => {
      if (held.size && this.bindings[i]?.releaseStops) this.pending[i]!.dir = Dir.Stop;
      held.clear();
    });
  }
}
