// toHex, toBits, Digest, and mulberry32 are copied from color-extractor: test/node/core/helpers.ts
// at commit e22b658dd455e6ecfcc8e230b8bc10964636bfe5 (ADZE-23).

import Color from "colorjs.io";
import type { Srgb } from "@/color/types.js";

const view = new DataView(new ArrayBuffer(8));

/** Exact bit pattern of a double as 16 lowercase hex digits (big-endian, platform independent). */
export function toHex(value: number): string {
  view.setFloat64(0, value, false);
  return view.getBigUint64(0, false).toString(16).padStart(16, "0");
}

/** The double with the given 16-digit hex bit pattern. Inverse of {@link toHex}. */
export function fromHex(hex: string): number {
  view.setBigUint64(0, BigInt(`0x${hex}`), false);
  return view.getFloat64(0, false);
}

/** Bit pattern of a double as a BigInt. */
export function toBits(value: number): bigint {
  view.setFloat64(0, value, false);
  return view.getBigUint64(0, false);
}

/** The double with the given bit pattern. Inverse of {@link toBits}. */
export function fromBits(bits: bigint): number {
  view.setBigUint64(0, bits, false);
  return view.getFloat64(0, false);
}

/**
 * Streaming 64-bit digest made of two independent 32-bit FNV-1a style lanes. Words are fed from
 * the bit patterns of doubles, so any single-bit difference changes the digest.
 */
const LOW_FIRST = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

export class Digest {
  #a = 0x811c9dc5;
  #b = 0x01000193 ^ 0xdeadbeef;
  #words = new Uint32Array(2);
  #doubles = new Float64Array(this.#words.buffer);

  addWord(word: number): void {
    this.#a = Math.imul(this.#a ^ word, 0x01000193);
    this.#b = Math.imul(this.#b ^ ((word << 13) | (word >>> 19)), 0x85ebca6b);
    this.#b ^= this.#b >>> 15;
  }

  addDouble(value: number): void {
    this.#doubles[0] = value;
    // The word order depends on the platform's endianness; normalize to little-endian order.
    this.addWord(this.#words[LOW_FIRST ? 0 : 1]!);
    this.addWord(this.#words[LOW_FIRST ? 1 : 0]!);
  }

  hex(): string {
    return (
      (this.#a >>> 0).toString(16).padStart(8, "0") + (this.#b >>> 0).toString(16).padStart(8, "0")
    );
  }
}

/** Small deterministic generator (mulberry32) for fixed pseudo-random samples. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The 4,096 colors that can be written as `#RGB`, in order, each digit `d` as `d * 17`. */
export const SHORT_HEX_COLORS: readonly Srgb[] = (() => {
  const colors: Srgb[] = [];
  for (let r = 0; r < 16; r++) {
    for (let g = 0; g < 16; g++) {
      for (let b = 0; b < 16; b++) {
        colors.push({ r: r * 17, g: g * 17, b: b * 17 });
      }
    }
  }
  return colors;
})();

/** Black, white, the primaries, the secondaries, and a few grays and in-between colors. */
export const REFERENCE_COLORS: readonly Srgb[] = [
  { r: 0, g: 0, b: 0 },
  { r: 255, g: 255, b: 255 },
  { r: 255, g: 0, b: 0 },
  { r: 0, g: 255, b: 0 },
  { r: 0, g: 0, b: 255 },
  { r: 0, g: 255, b: 255 },
  { r: 255, g: 0, b: 255 },
  { r: 255, g: 255, b: 0 },
  { r: 128, g: 128, b: 128 },
  { r: 1, g: 2, b: 3 },
  { r: 254, g: 127, b: 1 },
  { r: 0x12, g: 0x34, b: 0x56 },
  { r: 118, g: 118, b: 118 },
];

/** Formats an 8-bit color as `#rrggbb`. */
export function formatHex(color: Srgb): string {
  const channel = (value: number): string => value.toString(16).padStart(2, "0");
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`;
}

/** Color.js color for an 8-bit sRGB color. */
export function colorJs(color: Srgb): Color {
  return new Color("srgb", [color.r / 255, color.g / 255, color.b / 255]);
}

/** Color.js Oklab coordinates `[L, a, b]` of an 8-bit sRGB color. */
export function colorJsOklab(color: Srgb): [number, number, number] {
  const [L, a, b] = colorJs(color).to("oklab").coords;
  return [L ?? Number.NaN, a ?? Number.NaN, b ?? Number.NaN];
}

/** Color.js linear-light sRGB coordinates `[r, g, b]` of an Oklab color, without clamping. */
export function colorJsOklabToLinear(L: number, a: number, b: number): [number, number, number] {
  const [r, g, bb] = new Color("oklab", [L, a, b]).to("srgb-linear").coords;
  return [r ?? Number.NaN, g ?? Number.NaN, bb ?? Number.NaN];
}

/** Largest absolute difference between two equally long lists. */
export function maxAbsDifference(actual: readonly number[], expected: readonly number[]): number {
  let max = 0;
  for (let i = 0; i < actual.length; i++) {
    const difference = Math.abs(actual[i]! - expected[i]!);
    if (Number.isNaN(difference)) {
      return Number.NaN;
    }
    max = Math.max(max, difference);
  }
  return max;
}

/** Oklab grid for the conversion tests: lightness from 0 to 1, and a and b from -0.4 to 0.4, in and out of gamut. */
export function oklabGrid(): Array<[number, number, number]> {
  const points: Array<[number, number, number]> = [];
  for (let l = 0; l <= 20; l++) {
    for (let i = -4; i <= 4; i++) {
      for (let j = -4; j <= 4; j++) {
        points.push([l / 20, i / 10, j / 10]);
      }
    }
  }
  return points;
}

/**
 * Oklab grid for the gamut tests: lightness from 0 to 1 in steps of 0.025, and a and b from -0.4 to
 * 0.4 in steps of 0.025 (chroma up to 0.4, in every direction), built with integer steps and basic
 * arithmetic so every platform gets the same doubles. 32,677 points, most outside the gamut.
 */
export function gamutGrid(): Array<[number, number, number]> {
  const points: Array<[number, number, number]> = [];
  for (let l = 0; l <= 40; l++) {
    for (let i = -16; i <= 16; i++) {
      for (let j = -16; j <= 16; j++) {
        const a = i / 40;
        const b = j / 40;
        if (a * a + b * b <= 0.16 + 1e-12) {
          points.push([l / 40, a, b]);
        }
      }
    }
  }
  return points;
}
