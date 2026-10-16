// Settings panel of the players of this computer: name, shape, colors and
// keys. Keys are chosen by pressing them; everything is saved in the browser.

import { loadPreview } from "./assets.ts";
import {
  colorNames,
  defaultSettings,
  keyActions,
  keyLabel,
  saveSettings,
  shapes,
  type Keys,
  type PlayerSettings,
} from "./settings.ts";

export interface PlayerCards {
  /** shows the cards of the first `count` players */
  show(count: number): void;
}

export function playerCards(
  container: HTMLElement,
  settings: PlayerSettings[],
  onChange: () => void,
  setCapturing: (capturing: boolean) => void,
): PlayerCards {
  let shown = -1;

  const escape = (text: string) => text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

  function cardHtml(s: PlayerSettings, i: number): string {
    return `<fieldset class="card" data-player="${i}">
      <legend>Player ${i + 1}</legend>
      <canvas class="preview" width="64" height="78" aria-label="Look of player ${i + 1}"></canvas>
      <div class="card-fields">
        <label>Name <input data-field="name" maxlength="16" value="${escape(s.name)}" /></label>
        <label>Shape <select data-field="shape">${shapes.map((shape) => `<option${shape === s.shape ? " selected" : ""}>${shape}</option>`).join("")}</select></label>
        <div class="colors">${colorNames.map((name, k) => `<input type="color" data-color="${k}" value="${s.colors[k]}" title="${name}" aria-label="${name}" />`).join("")}</div>
        <div class="keys">${keyActions.map(([action, label]) => `<button type="button" data-key="${action}" title="Click, then press a key">${label} <kbd>${escape(keyLabel(s.keys[action]))}</kbd></button>`).join("")}</div>
        <label><input type="checkbox" data-field="releaseStops"${s.releaseStops ? " checked" : ""} /> Releasing a direction stops</label>
        <button type="button" data-reset>Default settings</button>
      </div>
    </fieldset>`;
  }

  async function drawPreview(i: number): Promise<void> {
    const canvas = container.querySelector<HTMLCanvasElement>(`[data-player="${i}"] canvas`);
    if (!canvas) return;
    const sprite = await loadPreview(settings[i]!);
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(sprite, 0, 0);
  }

  function render(): void {
    container.innerHTML = settings.slice(0, shown).map(cardHtml).join("");
    for (let i = 0; i < shown; i++) void drawPreview(i);
  }

  function changed(i: number, redraw: boolean): void {
    saveSettings(settings);
    onChange();
    if (redraw) void drawPreview(i);
  }

  container.addEventListener("input", (e) => {
    const target = e.target as HTMLInputElement | HTMLSelectElement;
    const card = target.closest<HTMLElement>("[data-player]");
    if (!card) return;
    const i = Number(card.dataset.player);
    const s = settings[i]!;
    if (target.dataset.field === "name") s.name = target.value.slice(0, 16) || defaultSettings[i]!.name;
    else if (target.dataset.field === "shape") s.shape = target.value;
    else if (target.dataset.field === "releaseStops") s.releaseStops = (target as HTMLInputElement).checked;
    else if (target.dataset.color) s.colors[Number(target.dataset.color)] = target.value;
    changed(i, target.dataset.field === "shape" || target.dataset.color !== undefined);
  });
  // the form must not react to the fields of the cards
  container.addEventListener("change", (e) => e.stopPropagation());

  container.addEventListener("click", (e) => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
    const card = button?.closest<HTMLElement>("[data-player]");
    if (!button || !card) return;
    const i = Number(card.dataset.player);
    if (button.dataset.reset !== undefined) {
      settings[i] = structuredClone(defaultSettings[i]!);
      saveSettings(settings);
      onChange();
      render();
      return;
    }
    const action = button.dataset.key as keyof Keys | undefined;
    if (!action) return;
    button.querySelector("kbd")!.textContent = "press a key…";
    setCapturing(true);
    const capture = (k: KeyboardEvent) => {
      k.preventDefault();
      k.stopImmediatePropagation();
      window.removeEventListener("keydown", capture, true);
      setCapturing(false);
      if (k.code !== "Escape") settings[i]!.keys[action] = k.code;
      button.querySelector("kbd")!.textContent = keyLabel(settings[i]!.keys[action]);
      changed(i, false);
    };
    window.addEventListener("keydown", capture, true);
  });

  return {
    show(count: number): void {
      if (count === shown) return;
      shown = count;
      render();
    },
  };
}
