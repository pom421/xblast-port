// Keyboard input, like the original game events: a direction is sent when a key
// is pressed, "stop" when it is released (useStopKey=false), bomb and special
// on key press. Bindings use physical keys (event.code): same places on AZERTY
// and QWERTY keyboards.

import { Dir, type PlayerAction } from "@xblast/sim";

export interface KeyBinding {
  label: string;
  up: string;
  left: string;
  down: string;
  right: string;
  bomb: string;
  special: string;
}

export const keyBindings: KeyBinding[] = [
  {
    label: "Z Q S D, bomb Space, special Shift",
    up: "KeyW",
    left: "KeyA",
    down: "KeyS",
    right: "KeyD",
    bomb: "Space",
    special: "ShiftLeft",
  },
  {
    label: "arrows, bomb Enter, special right Shift",
    up: "ArrowUp",
    left: "ArrowLeft",
    down: "ArrowDown",
    right: "ArrowRight",
    bomb: "Enter",
    special: "ShiftRight",
  },
  {
    label: "I J K L, bomb U, special O",
    up: "KeyI",
    left: "KeyJ",
    down: "KeyK",
    right: "KeyL",
    bomb: "KeyU",
    special: "KeyO",
  },
  {
    label: "numpad 8 4 5 6, bomb 0, special .",
    up: "Numpad8",
    left: "Numpad4",
    down: "Numpad5",
    right: "Numpad6",
    bomb: "Numpad0",
    special: "NumpadDecimal",
  },
];

export class KeyboardInput {
  private readonly bindings: KeyBinding[];
  private readonly pending: PlayerAction[];
  private readonly held: Set<string>[];

  constructor(bindings: KeyBinding[]) {
    this.bindings = bindings;
    this.pending = bindings.map(() => ({ dir: Dir.Default, bomb: false, special: false }));
    this.held = bindings.map(() => new Set());
    window.addEventListener("keydown", (e) => this.key(e, true));
    window.addEventListener("keyup", (e) => this.key(e, false));
    window.addEventListener("blur", () => this.releaseAll());
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
    this.bindings.forEach((b, i) => {
      const dirs: [string, Dir][] = [
        [b.up, Dir.Up],
        [b.left, Dir.Left],
        [b.down, Dir.Down],
        [b.right, Dir.Right],
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
          // back to a key still held, else stop
          const other = dirs.find(([c]) => held.has(c));
          action.dir = other ? other[1] : Dir.Stop;
        }
      }
      if (e.code === b.bomb) {
        e.preventDefault();
        if (down && !e.repeat) action.bomb = true;
      }
      if (e.code === b.special) {
        e.preventDefault();
        if (down && !e.repeat) action.special = true;
      }
    });
  }

  private releaseAll(): void {
    this.held.forEach((held, i) => {
      if (held.size) this.pending[i]!.dir = Dir.Stop;
      held.clear();
    });
  }
}
