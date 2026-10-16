// Decoders for the original XBlast image files (util.c, color.c):
// .ppm (P6 RGB), .pbm (P4 bitmap masks), .epm (layered pixmaps, "PX" raw or
// "PZ" zero-run compressed), and the recoloring of blocks and player sprites.

export interface Raster {
  width: number;
  height: number;
  data: Uint8Array;
}

/** XBlast colors are 5 bits per channel (#RRGGBB >> 3). */
export type Color5 = [number, number, number];

export function parseColor(hex: string): Color5 {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 19) & 31, (n >> 11) & 31, (n >> 3) & 31];
}

/** fscanf "%s%d%d%*d%*c": magic, width, height, max (or depth), one separator. */
function header(bytes: Uint8Array, fields: number): { values: string[]; offset: number } {
  const values: string[] = [];
  let i = 0;
  while (values.length < fields) {
    while (i < bytes.length && /\s/.test(String.fromCharCode(bytes[i]!))) i++;
    let token = "";
    while (i < bytes.length && !/\s/.test(String.fromCharCode(bytes[i]!))) token += String.fromCharCode(bytes[i++]!);
    values.push(token);
  }
  return { values, offset: i + 1 };
}

export function readPpm(bytes: Uint8Array): Raster {
  const { values, offset } = header(bytes, 4);
  const width = Number(values[1]);
  const height = Number(values[2]);
  return { width, height, data: bytes.subarray(offset, offset + 3 * width * height) };
}

/** P4 bitmap, bits packed without row padding (like ReadPbmFile); 1 = set. */
export function readPbm(bytes: Uint8Array): Raster {
  const { values, offset } = header(bytes, 3);
  const width = Number(values[1]);
  const height = Number(values[2]);
  const data = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i++) data[i] = (bytes[offset + (i >> 3)]! >> (7 - (i & 7))) & 1;
  return { width, height, data };
}

/** Layered pixmap: `depth` planes of width × height intensities. */
export function readEpm(bytes: Uint8Array): Raster & { depth: number } {
  const { values, offset } = header(bytes, 5);
  const width = Number(values[1]);
  const height = Number(values[2]);
  const depth = Number(values[4]);
  const n = depth * width * height;
  let data: Uint8Array;
  if (values[0] === "PX") {
    data = bytes.subarray(offset, offset + n);
  } else if (values[0] === "PZ") {
    data = new Uint8Array(n);
    let j = 0;
    for (let i = offset; i < bytes.length && j < n; i++) {
      if (bytes[i]) {
        data[j++] = bytes[i]!;
      } else {
        let zeros = 0;
        do {
          i++;
          zeros += bytes[i]!;
        } while (bytes[i] === 255);
        j += zeros;
      }
    }
  } else {
    throw new Error(`unknown epm magic ${values[0]}`);
  }
  return { width, height, depth, data };
}

/** CchToPpm: red pixels take color bg, green ones add, blue is a highlight, over fg. */
export function recolorBlock(ppm: Raster, fg: Color5, bg: Color5, add: Color5): ImageData {
  const out = new ImageData(ppm.width, ppm.height);
  for (let p = 0, q = 0; p < ppm.data.length; p += 3, q += 4) {
    const b = ppm.data[p + 2]!;
    const r = (ppm.data[p]! - b) & 0xff;
    const g = (ppm.data[p + 1]! - b) & 0xff;
    for (let c = 0; c < 3; c++) {
      const v = 31 * b + fg[c]! * 255 + bg[c]! * r - fg[c]! * r + add[c]! * g;
      out.data[q + c] = Math.min(v >>> 0, 8191) >> 5;
    }
    out.data[q + 3] = 255;
  }
  return out;
}

/** EpmToPpm: sum of the planes, each weighted by its color; mask from the .pbm. */
export function recolorSprite(epm: Raster & { depth: number }, colors: Color5[], mask?: Raster): ImageData {
  const { width, height, depth, data } = epm;
  const n = Math.min(colors.length, depth);
  const size = width * height;
  const out = new ImageData(width, height);
  for (let i = 0; i < size; i++) {
    let r = 0;
    let g = 0;
    let b = 0;
    for (let k = 0; k < n; k++) {
      const v = data[k * size + i]!;
      r += v * colors[k]![0];
      g += v * colors[k]![1];
      b += v * colors[k]![2];
    }
    out.data[4 * i] = Math.min(r, 8191) >> 5;
    out.data[4 * i + 1] = Math.min(g, 8191) >> 5;
    out.data[4 * i + 2] = Math.min(b, 8191) >> 5;
    out.data[4 * i + 3] = !mask || mask.data[i] ? 255 : 0;
  }
  return out;
}

/** Plain RGB pixmap, with an optional mask. */
export function rgbImage(ppm: Raster, mask?: Raster): ImageData {
  const out = new ImageData(ppm.width, ppm.height);
  for (let i = 0; i < ppm.width * ppm.height; i++) {
    out.data[4 * i] = ppm.data[3 * i]!;
    out.data[4 * i + 1] = ppm.data[3 * i + 1]!;
    out.data[4 * i + 2] = ppm.data[3 * i + 2]!;
    out.data[4 * i + 3] = !mask || mask.data[i] ? 255 : 0;
  }
  return out;
}

/** Silhouette of a mask (SPM_MASKED sprites blink as a plain shape). */
export function maskImage(mask: Raster, rgb: [number, number, number]): ImageData {
  const out = new ImageData(mask.width, mask.height);
  for (let i = 0; i < mask.data.length; i++) {
    out.data.set(rgb, 4 * i);
    out.data[4 * i + 3] = mask.data[i] ? 255 : 0;
  }
  return out;
}

export async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

export function toCanvas(image: ImageData): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext("2d")!.putImageData(image, 0, 0);
  return canvas;
}
