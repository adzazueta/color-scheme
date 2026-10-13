import { cbrt } from "./cbrt.js";
import type { Oklab } from "./oklab.js";

/**
 * Converts a linear-light sRGB color to Oklab and returns it as a new object. It extends
 * `srgbToOklab` in `oklab.ts` from the 256 values of the 8-bit table to any linear-light value,
 * with the same constants in the same order of operations: for every 8-bit color,
 * `linearSrgbToOklab(srgbToLinear(r), srgbToLinear(g), srgbToLinear(b))` returns exactly the same
 * doubles as `srgbToOklab(r, g, b)`.
 *
 * Uses Björn Ottosson's matrices (https://bottosson.github.io/posts/oklab/) and the cube root
 * from `cbrt.ts`, in a fixed order of operations, so it returns the same doubles in every
 * environment. It undoes `oklabToLinearSrgb` in `oklab-to-linear.ts`, up to the precision of the
 * published matrices.
 *
 * @param r - Red in linear light, from 0 to 1 inside the sRGB gamut; likewise `g` for green and
 *   `b` for blue. Values outside 0 to 1 are converted as they are, without clamping.
 */
export function linearSrgbToOklab(r: number, g: number, b: number): Oklab {
  // Linear sRGB to the cone responses l, m, s, followed by the cube root.
  const l = cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  // Cube-rooted cone responses to L, a, b.
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}
