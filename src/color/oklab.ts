// Copied from color-extractor: src/core/color/oklab.ts at commit
// db1cbd8c1ebdb9748ce729f59793c97d95472c57 (ADZE-22). Make any change in both packages:
// reference-value tests check that both copies give identical results.

import { cbrt } from "./cbrt.js";
import { srgbToLinear } from "./srgb.js";

/**
 * A color in Oklab. `L` is the perceived lightness, 0 for black and about 1 for white; `a` goes
 * from green (negative) to red (positive), and `b` from blue (negative) to yellow (positive).
 */
export interface Oklab {
  readonly L: number;
  readonly a: number;
  readonly b: number;
}

/**
 * Converts an 8-bit sRGB color to Oklab and writes `L`, `a`, and `b` to `out[offset]`,
 * `out[offset + 1]`, and `out[offset + 2]`. It allocates nothing, for per-pixel loops.
 *
 * Uses Björn Ottosson's matrices (https://bottosson.github.io/posts/oklab/), the sRGB table
 * from `srgb.ts`, and the cube root from `cbrt.ts`, in a fixed order of operations.
 *
 * @param red - An integer from 0 to 255; likewise `green` and `blue`. Other values give `NaN`.
 * @param out - Receives the result. Writes outside its length are lost.
 * @param offset - Index of the first of the three values to write.
 */
export function srgbToOklabInto(
  red: number,
  green: number,
  blue: number,
  out: Float64Array,
  offset: number,
): void {
  const r = srgbToLinear(red);
  const g = srgbToLinear(green);
  const b = srgbToLinear(blue);

  // Linear sRGB to the cone responses l, m, s, followed by the cube root.
  const l = cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  // Cube-rooted cone responses to L, a, b.
  out[offset] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  out[offset + 1] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  out[offset + 2] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
}

/**
 * Converts an 8-bit sRGB color to Oklab and returns it as a new object. Gives the same values
 * as {@link srgbToOklabInto}, which avoids the allocation in per-pixel loops.
 *
 * @param red - An integer from 0 to 255; likewise `green` and `blue`. Other values give `NaN`.
 */
export function srgbToOklab(red: number, green: number, blue: number): Oklab {
  const out = new Float64Array(3);
  srgbToOklabInto(red, green, blue, out, 0);
  return { L: out[0]!, a: out[1]!, b: out[2]! };
}
