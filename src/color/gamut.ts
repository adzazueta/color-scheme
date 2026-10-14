import { linearSrgbToOklab } from "./linear-to-oklab.js";
import { linearToSrgb } from "./linear-to-srgb.js";
import { oklabToLinearSrgb, type LinearSrgb } from "./oklab-to-linear.js";
import type { Srgb } from "./types.js";

/** One just noticeable difference in deltaEOK, the value CSS Color 4 sets for OkLCh. */
const JND = 0.02;
/** Chroma resolution of the binary search, and tolerance of its early exit, from CSS Color 4. */
const EPSILON = 0.0001;

/**
 * Maps an Oklab color into the sRGB gamut with the CSS Color 4 method, which reduces chroma and
 * keeps lightness and hue, and returns the result in linear light as a new object. Every channel of
 * the result is from 0 to 1.
 *
 * Follows "Binary Search Gamut Mapping with Local MINDE" and its pseudocode in CSS Color Module
 * Level 4 (W3C Candidate Recommendation Draft of 9 October 2026), sections 14.2 to 14.2.2
 * (https://www.w3.org/TR/css-color-4/#css-gamut-mapping), with sRGB as the destination, step by
 * step and with the same constants. CSS Color 4 also allows EdgeSeeker and ray tracing; this
 * package uses the binary search, which Color.js implements as `method: "css"`:
 *
 * - Lightness of 1 or more gives white, and lightness of 0 or less gives black.
 * - A color inside the gamut is returned unchanged, as `oklabToLinearSrgb` converts it.
 * - Otherwise, the color clipped to the gamut is the result when its deltaEOK from the color is
 *   below 0.02, one just noticeable difference (JND).
 * - Otherwise, a binary search reduces the chroma, √(a² + b²), between 0 and its value, until the
 *   search interval is 0.0001 wide or less. Each step scales `a` and `b` by the same factor, which
 *   keeps the hue without trigonometry. A step inside the gamut moves the search up, until a step
 *   has moved it up because of a close clip. A step outside the gamut clips its color: within one
 *   JND, the search moves up, and the clipped color is the result when it is also within 0.0001 of
 *   one JND; otherwise, the search moves down. When the search ends, the result is the last
 *   clipped color.
 *
 * Because the result is a clipped color, its lightness and hue can move slightly, within about one
 * JND in deltaEOK.
 *
 * Clipping clamps each linear channel to 0 to 1. The specification clamps the gamma-encoded
 * channels instead, which is the same, because the sRGB transfer function is increasing and keeps
 * 0 and 1. deltaEOK is the Euclidean distance in Oklab, with the clipped color converted by
 * `linearSrgbToOklab`.
 *
 * Uses only basic arithmetic, comparisons, and `Math.sqrt`, all correctly rounded, in a fixed order
 * of operations, so it returns the same doubles in every environment.
 *
 * @param L - Perceived lightness, 0 for black and about 1 for white.
 * @param a - From green (negative) to red (positive).
 * @param b - From blue (negative) to yellow (positive).
 * @returns The mapped color in linear light. A `NaN` `L` gives `NaN` channels; so does, when `L`
 *   is between 0 and 1, a `NaN` `a` or `b`, or an `a` or `b` so large that the chroma overflows to
 *   `Infinity`.
 */
export function mapOklabToSrgbGamut(L: number, a: number, b: number): LinearSrgb {
  if (L >= 1) {
    return { r: 1, g: 1, b: 1 };
  }
  if (L <= 0) {
    return { r: 0, g: 0, b: 0 };
  }

  const origin = oklabToLinearSrgb(L, a, b);
  if (isInGamut(origin)) {
    return origin;
  }

  let clipped = clip(origin);
  let E = deltaEOK(clipped, L, a, b);
  if (E < JND) {
    return clipped;
  }

  const C = Math.sqrt(a * a + b * b);
  if (C === Infinity) {
    // Not in the specification: the search below would never end.
    return { r: Number.NaN, g: Number.NaN, b: Number.NaN };
  }
  let min = 0;
  let max = C;
  let minInGamut = true;
  // The loop only runs when C is above EPSILON, so the division by C is safe.
  while (max - min > EPSILON) {
    const chroma = (min + max) / 2;
    const scale = chroma / C;
    const currentA = a * scale;
    const currentB = b * scale;
    const current = oklabToLinearSrgb(L, currentA, currentB);
    if (minInGamut && isInGamut(current)) {
      min = chroma;
    } else {
      clipped = clip(current);
      E = deltaEOK(clipped, L, currentA, currentB);
      if (E < JND) {
        if (JND - E < EPSILON) {
          return clipped;
        }
        minInGamut = false;
        min = chroma;
      } else {
        max = chroma;
      }
    }
  }
  return clipped;
}

/**
 * Converts an Oklab color to an 8-bit sRGB color, mapping it into the sRGB gamut first: it encodes
 * each channel of {@link mapOklabToSrgbGamut} with `linearToSrgb`, which rounds exactly. A color
 * inside the gamut gives its own 8-bit rounding.
 *
 * Returns the same channels in every environment, like the two functions it combines.
 *
 * @param L - Perceived lightness, 0 for black and about 1 for white.
 * @param a - From green (negative) to red (positive).
 * @param b - From blue (negative) to yellow (positive).
 * @returns Each channel as an integer from 0 to 255, or `NaN` where {@link mapOklabToSrgbGamut}
 *   gives `NaN`.
 */
export function oklabToSrgb(L: number, a: number, b: number): Srgb {
  const color = mapOklabToSrgbGamut(L, a, b);
  return { r: linearToSrgb(color.r), g: linearToSrgb(color.g), b: linearToSrgb(color.b) };
}

/** Whether every linear channel is from 0 to 1, the sRGB gamut. `NaN` is outside. */
function isInGamut(color: LinearSrgb): boolean {
  return (
    color.r >= 0 && color.r <= 1 && color.g >= 0 && color.g <= 1 && color.b >= 0 && color.b <= 1
  );
}

/** Clamps each linear channel to 0 to 1, keeping `NaN`, and returns a new object. */
function clip(color: LinearSrgb): LinearSrgb {
  return { r: clamp(color.r), g: clamp(color.g), b: clamp(color.b) };
}

function clamp(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

/**
 * deltaEOK (CSS Color 4, section 20.3) from a linear sRGB color to the Oklab color `L`, `a`, `b`:
 * the Euclidean distance in Oklab, with squares as multiplications.
 */
function deltaEOK(reference: LinearSrgb, L: number, a: number, b: number): number {
  const lab = linearSrgbToOklab(reference.r, reference.g, reference.b);
  const deltaL = lab.L - L;
  const deltaA = lab.a - a;
  const deltaB = lab.b - b;
  return Math.sqrt(deltaL * deltaL + deltaA * deltaA + deltaB * deltaB);
}
