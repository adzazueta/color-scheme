/**
 * A color in linear-light sRGB. Each channel goes from 0 to 1 inside the sRGB gamut; a color
 * outside the gamut has at least one channel below 0 or above 1.
 */
export interface LinearSrgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/**
 * Converts an Oklab color to linear-light sRGB and returns it as a new object. It undoes
 * `srgbToOklab` in `oklab.ts`, up to the precision of the published matrices.
 *
 * Uses Björn Ottosson's inverse matrices (https://bottosson.github.io/posts/oklab/), with the cube
 * as a multiplication, in a fixed order of operations, so it returns the same doubles in every
 * environment. Nothing is clamped: gamut mapping detects and handles channels outside 0 to 1.
 *
 * @param L - Perceived lightness, 0 for black and about 1 for white.
 * @param a - From green (negative) to red (positive).
 * @param b - From blue (negative) to yellow (positive).
 */
export function oklabToLinearSrgb(L: number, a: number, b: number): LinearSrgb {
  // L, a, b to the cube-rooted cone responses, followed by the cube.
  const lRoot = L + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = L - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = L - 0.0894841775 * a - 1.291485548 * b;
  const l = lRoot * lRoot * lRoot;
  const m = mRoot * mRoot * mRoot;
  const s = sRoot * sRoot * sRoot;

  // Cone responses l, m, s to linear sRGB.
  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}
