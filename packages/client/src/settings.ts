// Settings of the players of this computer: name, look (shape and colors of
// the original player config) and keys. Kept in the browser (localStorage).

import { MAX_NAME, PLAYER_SHAPES } from "@xblast/sim";
import { defaultPlayers, type PlayerLook } from "./assets.ts";

/** The 6 colors of a player, in the order of the sprite layers. */
export const colorNames = ["Helmet", "Face", "Body", "Hands & feet", "Arms & legs", "Backpack"] as const;

export interface Keys {
  up: string;
  left: string;
  down: string;
  right: string;
  bomb: string;
  stop: string;
  special: string;
}

export const keyActions: [keyof Keys, string][] = [
  ["up", "Up"],
  ["left", "Left"],
  ["down", "Down"],
  ["right", "Right"],
  ["bomb", "Bomb"],
  ["stop", "Stop"],
  ["special", "Special"],
];

export interface PlayerSettings extends PlayerLook {
  keys: Keys;
  /** releasing a direction stops the player (the original "useStopKey=false") */
  releaseStops: boolean;
}

/** Keys are physical keys (KeyboardEvent.code): same places on AZERTY and QWERTY. */
const defaultKeys: Keys[] = [
  {
    up: "ArrowUp",
    left: "ArrowLeft",
    down: "ArrowDown",
    right: "ArrowRight",
    bomb: "Space",
    stop: "ShiftLeft",
    special: "Tab",
  },
  { up: "KeyW", left: "KeyA", down: "KeyS", right: "KeyD", bomb: "KeyF", stop: "KeyE", special: "KeyR" },
  { up: "KeyI", left: "KeyJ", down: "KeyK", right: "KeyL", bomb: "KeyH", stop: "KeyU", special: "KeyO" },
  {
    up: "Numpad8",
    left: "Numpad4",
    down: "Numpad2",
    right: "Numpad6",
    bomb: "Numpad0",
    stop: "Numpad5",
    special: "NumpadDecimal",
  },
];

/** The 4 keyboard players: the first default players of XBlast, with their keys. */
export const defaultSettings: PlayerSettings[] = defaultKeys.map((keys, i) => ({
  ...structuredClone(defaultPlayers[i]!),
  keys,
  releaseStops: false,
}));

const STORAGE_KEY = "xblast.players";

/** Settings of the 4 keyboard players, from the browser (defaults if missing or invalid). */
export function loadSettings(): PlayerSettings[] {
  let saved: unknown;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
  } catch {
    saved = null;
  }
  return defaultSettings.map((def, i) => {
    const s = Array.isArray(saved) ? (saved[i] as Partial<PlayerSettings> | undefined) : undefined;
    if (!s || typeof s !== "object") return structuredClone(def);
    return {
      name: typeof s.name === "string" && s.name.trim() ? s.name.slice(0, MAX_NAME) : def.name,
      shape: (PLAYER_SHAPES as readonly string[]).includes(s.shape ?? "") ? s.shape! : def.shape,
      colors: def.colors.map((c, k) => (isColor(s.colors?.[k]) ? s.colors![k]! : c)) as PlayerLook["colors"],
      keys: Object.fromEntries(
        keyActions.map(([action]) => [
          action,
          typeof s.keys?.[action] === "string" ? s.keys[action] : def.keys[action],
        ]),
      ) as unknown as Keys,
      releaseStops: typeof s.releaseStops === "boolean" ? s.releaseStops : def.releaseStops,
    };
  });
}

export function saveSettings(settings: PlayerSettings[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // private browsing or storage disabled: the settings last for this page only
  }
}

export function isColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

/** Letters of the keyboard layout (Chrome and Edge only), e.g. KeyW → "z" on AZERTY. */
let layout: Map<string, string> | null = null;

export async function loadKeyboardLayout(): Promise<void> {
  const keyboard = (navigator as Navigator & { keyboard?: { getLayoutMap(): Promise<Map<string, string>> } }).keyboard;
  try {
    layout = (await keyboard?.getLayoutMap()) ?? null;
  } catch {
    layout = null;
  }
}

/** Readable name of a physical key. */
export function keyLabel(code: string): string {
  const letter = layout?.get(code);
  if (letter && (code.startsWith("Key") || code.startsWith("Digit"))) return letter.toUpperCase();
  const names: Record<string, string> = {
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    Space: "Space",
    ShiftLeft: "left Shift",
    ShiftRight: "right Shift",
    ControlLeft: "left Ctrl",
    ControlRight: "right Ctrl",
    AltLeft: "left Alt",
    AltRight: "right Alt",
    Enter: "Enter",
    Tab: "Tab",
    Backspace: "Backspace",
    NumpadDecimal: "numpad .",
  };
  if (names[code]) return names[code];
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return `numpad ${code.slice(6)}`;
  return code;
}
