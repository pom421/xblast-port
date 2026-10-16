// Sound effects and music of the original (sdl_sound.c): raw unsigned 8 bit
// samples at 22050 Hz, mono or interleaved stereo. Mono sounds are panned with
// the x position of their source; a new play of a sound stops the previous one.
// Songs (assets/music) play in a loop during a round, like the original.

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
        this.buffers.set(name, this.decode(new Uint8Array(await response.arrayBuffer()), mono ? 1 : 2));
      }),
    );
  }

  private readonly music: GainNode = this.musicGain();
  private song: AudioBufferSourceNode | null = null;
  private readonly songs = new Map<number, Promise<AudioBuffer>>();
  musicOn = true;

  private musicGain(): GainNode {
    const gain = this.context.createGain();
    gain.gain.value = 0.35;
    gain.connect(this.context.destination);
    return gain;
  }

  /** Plays song 1 to 6 of the original (xbsng*.raw, stereo) in a loop. */
  async playMusic(n: number): Promise<void> {
    this.stopMusic();
    if (!this.musicOn) return;
    let song = this.songs.get(n);
    if (!song) {
      song = fetch(`${import.meta.env.BASE_URL}music/xbsng${n}.raw`)
        .then((r) => r.arrayBuffer())
        .then((data) => this.decode(new Uint8Array(data), 2));
      this.songs.set(n, song);
    }
    const buffer = await song;
    this.stopMusic();
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(this.music);
    source.start();
    this.song = source;
  }

  stopMusic(): void {
    this.song?.stop();
    this.song = null;
  }

  private decode(raw: Uint8Array, channels: number): AudioBuffer {
    const length = Math.floor(raw.length / channels);
    const buffer = this.context.createBuffer(channels, length, SAMPLE_RATE);
    for (let c = 0; c < channels; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < length; i++) data[i] = (raw[i * channels + c]! - 128) / 128;
    }
    return buffer;
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
