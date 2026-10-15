// Sound effects of the original (sdl_sound.c): raw unsigned 8 bit samples at
// 22050 Hz, mono or interleaved stereo. Mono sounds are panned with the x
// position of their source; a new play of a sound stops the previous one.

import { PIXW } from "@xblast/sim";

const SAMPLE_RATE = 22050;

/** sound names used by the engine → [file, mono] */
const sounds: Record<string, [string, boolean]> = {
  bad: ["xb_bad", false],
  drop: ["xb_drop", true],
  newbomb: ["xbnbmb", true],
  newkick: ["xbnkick", true],
  newpump: ["xbnpmp", true],
  newrc: ["xbnrc", true],
  morefire: ["xbfire", true],
  dead: ["xb_dead", false],
  expl: ["xb_expl", true],
  kick: ["xb_kick", true],
  pump: ["xb_pump", true],
  ouch: ["xb_ouch", false],
  butt: ["xb_butt", true],
  shoot: ["xb_shoot", false],
  invis: ["xb_nvis", false],
  invinc: ["xb_nvnc", false],
  newtele: ["xbntel", true],
  tele: ["xbtele1", true],
  inj: ["xbinj", false],
  minibomb: ["xbmbmb", true],
  won: ["xb_won", false],
  haunt: ["xb_haunt", false],
  spiral: ["xb_spir", true],
  spbomb: ["xb_spbmb", true],
  slide: ["xbslide", true],
  warn: ["xb_warn", false],
  stun: ["xb_stun", false],
  holy: ["xbholy", false],
  encloak: ["xbcloak", true],
  decloak: ["xbdcloak", true],
  fast: ["xbfast", true],
  slow: ["xbslow", true],
  slay: ["xbslay", true],
  life: ["xblife", true],
  newcloak: ["xbcloakx", true],
};

export class SoundPlayer {
  private readonly context = new AudioContext();
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly playing = new Map<string, AudioBufferSourceNode>();
  private readonly volume: GainNode;

  constructor() {
    this.volume = this.context.createGain();
    this.volume.gain.value = 0.5;
    this.volume.connect(this.context.destination);
  }

  /** Loads every sound; call from a user gesture so that audio may start. */
  async load(): Promise<void> {
    await this.context.resume();
    await Promise.all(
      Object.entries(sounds).map(async ([name, [file, mono]]) => {
        const response = await fetch(`${import.meta.env.BASE_URL}sounds/${file}.raw`);
        const raw = new Uint8Array(await response.arrayBuffer());
        const channels = mono ? 1 : 2;
        const length = Math.floor(raw.length / channels);
        const buffer = this.context.createBuffer(channels, length, SAMPLE_RATE);
        for (let c = 0; c < channels; c++) {
          const data = buffer.getChannelData(c);
          for (let i = 0; i < length; i++) data[i] = (raw[i * channels + c]! - 128) / 128;
        }
        this.buffers.set(name, buffer);
      }),
    );
  }

  play(name: string, x: number): void {
    const buffer = this.buffers.get(name);
    if (!buffer) return;
    this.playing.get(name)?.stop();
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    let node: AudioNode = source;
    if (buffer.numberOfChannels === 1) {
      const pan = this.context.createStereoPanner();
      pan.pan.value = Math.max(-1, Math.min(1, (2 * x) / PIXW - 1));
      source.connect(pan);
      node = pan;
    }
    node.connect(this.volume);
    source.onended = () => {
      if (this.playing.get(name) === source) this.playing.delete(name);
    };
    this.playing.set(name, source);
    source.start();
  }
}
