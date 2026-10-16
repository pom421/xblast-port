// Game random generator of XBlast 2.10.4 (random.c): Marsaglia-Zaman RANMAR.
// It works on doubles, but only with + - < and a final truncation: IEEE 754
// gives the same bits in every JavaScript engine and in the original C.

export class GameRandom {
  private readonly u = new Float64Array(97);
  private c = 0;
  private cd = 0;
  private cm = 0;
  i97 = 0;
  j97 = 0;

  constructor(seed: number) {
    this.seed(seed);
  }

  /** SeedRandom: initialise, then 100 warm-up draws. */
  seed(seed: number): void {
    seed >>>= 0;
    this.initialise(seed % 31328, Math.floor(seed / 313) % 30081);
    for (let i = 0; i < 100; i++) this.number(100);
  }

  /** Generator initialised with RANMAR's own seeds (no warm-up), for the reference test. */
  static ranmar(ij: number, kl: number): GameRandom {
    const rng = new GameRandom(0);
    rng.initialise(ij, kl);
    return rng;
  }

  /** RandomUniform: double in [0, 1). */
  uniform(): number {
    let uni = this.u[this.i97 - 1]! - this.u[this.j97 - 1]!;
    if (uni <= 0) uni++;
    this.u[this.i97 - 1] = uni;
    if (--this.i97 === 0) this.i97 = 97;
    if (--this.j97 === 0) this.j97 = 97;
    this.c -= this.cd;
    if (this.c < 0) this.c += this.cm;
    uni -= this.c;
    if (uni < 0) uni++;
    return uni;
  }

  /** GameRandomNumber (and OtherRandomNumber): integer in [0, maxVal). */
  number(maxVal: number): number {
    return Math.trunc(this.uniform() * maxVal);
  }

  /** Current state, as dumped by the golden runs: [i97, j97, c]. */
  state(): [number, number, number] {
    return [this.i97, this.j97, this.c];
  }

  private initialise(ij: number, kl: number): void {
    if (ij < 0 || ij > 31328) ij = 1802;
    if (kl < 0 || kl > 30081) kl = 9373;
    let i = (Math.trunc(ij / 177) % 177) + 2;
    let j = (ij % 177) + 2;
    let k = (Math.trunc(kl / 169) % 178) + 1;
    let l = kl % 169;
    for (let ii = 0; ii < 97; ii++) {
      let s = 0;
      let t = 0.5;
      for (let jj = 0; jj < 24; jj++) {
        const m = (((i * j) % 179) * k) % 179;
        i = j;
        j = k;
        k = m;
        l = (53 * l + 1) % 169;
        if ((l * m) % 64 >= 32) s += t;
        t *= 0.5;
      }
      this.u[ii] = s;
    }
    this.c = 362436.0 / 16777216.0;
    this.cd = 7654321.0 / 16777216.0;
    this.cm = 16777213.0 / 16777216.0;
    this.i97 = 97;
    this.j97 = 33;
  }
}

/** C printf "%a" of a double, to compare with the golden dumps. */
export function hexFloat(value: number): string {
  if (value === 0) return "0x0p+0";
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  const hi = view.getUint32(0);
  const lo = view.getUint32(4);
  const sign = hi >>> 31 ? "-" : "";
  const exp = ((hi >>> 20) & 0x7ff) - 1023;
  let mantissa = ((hi & 0xfffff).toString(16).padStart(5, "0") + lo.toString(16).padStart(8, "0")).replace(/0+$/, "");
  mantissa = mantissa ? `.${mantissa}` : "";
  return `${sign}0x1${mantissa}p${exp >= 0 ? "+" : ""}${exp}`;
}
