import { srgbToOklab } from "./oklab.js";
import { srgbToLinear } from "./srgb.js";
import type { Srgb } from "./types.js";

/**
 * Relative luminance of an 8-bit sRGB color, from 0 for black to 1 for white, as defined by
 * WCAG 2.2: `0.2126 * R + 0.7152 * G + 0.0722 * B`, with R, G, and B the linear-light channels.
 *
 * The linear channels come from the table in `srgb.ts`, which uses the 0.04045 break of WCAG 2.2.
 * For 8-bit channels it gives the same result as the 0.03928 break of older versions: no 8-bit
 * value lies between the two (10/255 ≈ 0.0392 and 11/255 ≈ 0.0431). The sum is evaluated from
 * left to right, so the result is the same in every environment.
 *
 * @param color - The color. A channel that is not an integer from 0 to 255 gives `NaN`.
 */
export function relativeLuminance(color: Srgb): number {
  return (
    0.2126 * srgbToLinear(color.r) + 0.7152 * srgbToLinear(color.g) + 0.0722 * srgbToLinear(color.b)
  );
}

/**
 * WCAG 2.2 contrast ratio of two 8-bit sRGB colors, from 1 to 21: `(L1 + 0.05) / (L2 + 0.05)`,
 * with L1 the relative luminance of the lighter color and L2 that of the darker one. It does not
 * depend on the order of the arguments and is not rounded.
 *
 * @param a - One color. A channel that is not an integer from 0 to 255 gives `NaN`.
 * @param b - The other color.
 */
export function contrastRatio(a: Srgb, b: Srgb): number {
  const luminanceA = relativeLuminance(a);
  const luminanceB = relativeLuminance(b);
  return luminanceA >= luminanceB
    ? (luminanceA + 0.05) / (luminanceB + 0.05)
    : (luminanceB + 0.05) / (luminanceA + 0.05);
}

/**
 * Absolute difference between the Oklab lightness `L` of two 8-bit sRGB colors. It does not
 * depend on the order of the arguments.
 *
 * @param a - One color. A channel that is not an integer from 0 to 255 gives `NaN`.
 * @param b - The other color.
 */
export function lightnessDifference(a: Srgb, b: Srgb): number {
  const lightnessA = srgbToOklab(a.r, a.g, a.b).L;
  const lightnessB = srgbToOklab(b.r, b.g, b.b).L;
  return lightnessA >= lightnessB ? lightnessA - lightnessB : lightnessB - lightnessA;
}
