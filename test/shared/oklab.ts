import Color from "colorjs.io";
import { describe, expect, it } from "vite-plus/test";
import { linearSrgbToOklab } from "@/color/linear-to-oklab.js";
import { linearToSrgb } from "@/color/linear-to-srgb.js";
import { oklabToLinearSrgb } from "@/color/oklab-to-linear.js";
import { srgbToOklab } from "@/color/oklab.js";
import { srgbToLinear } from "@/color/srgb.js";
import {
  colorJs,
  colorJsOklab,
  colorJsOklabToLinear,
  maxAbsDifference,
  oklabGrid,
  REFERENCE_COLORS,
  SHORT_HEX_COLORS,
} from "./helpers.js";

/**
 * Color.js recomputes the Oklab matrices from the CSS Color 4 definition, and the package uses
 * Ottosson's published 10-digit matrices, so the two differ by about 1e-8 (see the specification).
 */
const OKLAB_TOLERANCE = 1e-7;

/**
 * Linear values outside 0 to 1 and cone responses near 0 amplify that difference (the cube root has
 * an infinite slope at 0), so the checks that go outside the gamut allow a few times more.
 */
const OUTSIDE_GAMUT_TOLERANCE = 5e-7;

export function registerOklabTests(): void {
  describe("srgbToLinear against Color.js", () => {
    it("matches the Color.js sRGB decoding for the 256 channel values", () => {
      for (let i = 0; i < 256; i++) {
        const [expected] = colorJs({ r: i, g: 0, b: 0 }).to("srgb-linear").coords;
        expect(Math.abs(srgbToLinear(i) - expected!)).toBeLessThan(1e-15);
      }
    });
  });

  describe("srgbToOklab against Color.js", () => {
    it("matches for all 4,096 #RGB colors within the tolerance", () => {
      let worst = 0;
      for (const color of SHORT_HEX_COLORS) {
        const actual = srgbToOklab(color.r, color.g, color.b);
        const expected = colorJsOklab(color);
        worst = Math.max(worst, maxAbsDifference([actual.L, actual.a, actual.b], expected));
      }
      expect(worst).toBeLessThan(OKLAB_TOLERANCE);
    });

    it("matches for black, white, the primaries, and other reference colors", () => {
      for (const color of REFERENCE_COLORS) {
        const actual = srgbToOklab(color.r, color.g, color.b);
        const expected = colorJsOklab(color);
        expect(maxAbsDifference([actual.L, actual.a, actual.b], expected)).toBeLessThan(
          OKLAB_TOLERANCE,
        );
      }
    });

    it("gives lightness 0 for black and 1 for white, and no chroma for grays", () => {
      const black = srgbToOklab(0, 0, 0);
      expect(black).toEqual({ L: 0, a: 0, b: 0 });
      const white = srgbToOklab(255, 255, 255);
      // Ottosson's published matrices map white to 1 only up to about 1e-8.
      expect(Math.abs(white.L - 1)).toBeLessThan(OKLAB_TOLERANCE);
      expect(Math.abs(white.a)).toBeLessThan(OKLAB_TOLERANCE);
      expect(Math.abs(white.b)).toBeLessThan(OKLAB_TOLERANCE);
      for (let i = 0; i < 256; i += 5) {
        const gray = srgbToOklab(i, i, i);
        expect(Math.abs(gray.a)).toBeLessThan(OKLAB_TOLERANCE);
        expect(Math.abs(gray.b)).toBeLessThan(OKLAB_TOLERANCE);
      }
    });
  });

  describe("linearSrgbToOklab", () => {
    it("is bit-identical to srgbToOklab on every #RGB color", () => {
      for (const { r, g, b } of SHORT_HEX_COLORS) {
        const expected = srgbToOklab(r, g, b);
        const actual = linearSrgbToOklab(srgbToLinear(r), srgbToLinear(g), srgbToLinear(b));
        expect(Object.is(actual.L, expected.L)).toBe(true);
        expect(Object.is(actual.a, expected.a)).toBe(true);
        expect(Object.is(actual.b, expected.b)).toBe(true);
      }
    });

    it("is bit-identical to srgbToOklab on a deterministic sample of 8-bit colors", () => {
      for (let r = 0; r < 256; r += 5) {
        for (let g = 0; g < 256; g += 7) {
          for (let b = 0; b < 256; b += 11) {
            const expected = srgbToOklab(r, g, b);
            const actual = linearSrgbToOklab(srgbToLinear(r), srgbToLinear(g), srgbToLinear(b));
            expect(Object.is(actual.L, expected.L)).toBe(true);
            expect(Object.is(actual.a, expected.a)).toBe(true);
            expect(Object.is(actual.b, expected.b)).toBe(true);
          }
        }
      }
    });

    it("matches Color.js for linear values in and out of the gamut", () => {
      let worst = 0;
      for (let i = -2; i <= 12; i++) {
        for (let j = -2; j <= 12; j++) {
          for (let k = -2; k <= 12; k++) {
            const r = i / 10;
            const g = j / 10;
            const b = k / 10;
            const actual = linearSrgbToOklab(r, g, b);
            const [L, a, bb] = colorJsLinearToOklab(r, g, b);
            worst = Math.max(worst, maxAbsDifference([actual.L, actual.a, actual.b], [L, a, bb]));
          }
        }
      }
      expect(worst).toBeLessThan(OUTSIDE_GAMUT_TOLERANCE);
    });
  });

  describe("oklabToLinearSrgb against Color.js", () => {
    it("matches on a grid that includes colors outside the gamut", () => {
      const grid = oklabGrid();
      expect(grid).toHaveLength(21 * 81);
      let worst = 0;
      for (const [L, a, b] of grid) {
        const actual = oklabToLinearSrgb(L, a, b);
        worst = Math.max(
          worst,
          maxAbsDifference([actual.r, actual.g, actual.b], colorJsOklabToLinear(L, a, b)),
        );
      }
      expect(worst).toBeLessThan(OKLAB_TOLERANCE);
    });

    it("gives black for black, and white for white up to the published precision", () => {
      expect(oklabToLinearSrgb(0, 0, 0)).toEqual({ r: 0, g: 0, b: 0 });
      const white = oklabToLinearSrgb(1, 0, 0);
      for (const channel of [white.r, white.g, white.b]) {
        expect(Math.abs(channel - 1)).toBeLessThan(OKLAB_TOLERANCE);
      }
    });

    it("does not clamp colors outside the gamut", () => {
      const color = oklabToLinearSrgb(0.5, 0.4, 0.4);
      expect(Math.min(color.r, color.g, color.b)).toBeLessThan(0);
    });
  });

  describe("round trip", () => {
    it("8-bit -> Oklab -> linear -> 8-bit is exact for all 4,096 #RGB colors", () => {
      for (const { r, g, b } of SHORT_HEX_COLORS) {
        const lab = srgbToOklab(r, g, b);
        const linear = oklabToLinearSrgb(lab.L, lab.a, lab.b);
        expect([linearToSrgb(linear.r), linearToSrgb(linear.g), linearToSrgb(linear.b)]).toEqual([
          r,
          g,
          b,
        ]);
      }
    });

    it("is exact on a deterministic sample of 8-bit colors that is not limited to #RGB", () => {
      for (let r = 1; r < 256; r += 13) {
        for (let g = 2; g < 256; g += 11) {
          for (let b = 3; b < 256; b += 7) {
            const lab = srgbToOklab(r, g, b);
            const linear = oklabToLinearSrgb(lab.L, lab.a, lab.b);
            expect([
              linearToSrgb(linear.r),
              linearToSrgb(linear.g),
              linearToSrgb(linear.b),
            ]).toEqual([r, g, b]);
          }
        }
      }
    });

    it("oklabToLinearSrgb undoes linearSrgbToOklab on linear values within the tolerance", () => {
      for (let i = -2; i <= 12; i++) {
        for (let j = -2; j <= 12; j += 2) {
          for (let k = -2; k <= 12; k += 3) {
            const r = i / 10;
            const g = j / 10;
            const b = k / 10;
            const lab = linearSrgbToOklab(r, g, b);
            const back = oklabToLinearSrgb(lab.L, lab.a, lab.b);
            expect(maxAbsDifference([back.r, back.g, back.b], [r, g, b])).toBeLessThan(
              OUTSIDE_GAMUT_TOLERANCE,
            );
          }
        }
      }
    });
  });
}

/** Color.js Oklab coordinates of a linear-light sRGB color, without clamping. */
function colorJsLinearToOklab(r: number, g: number, b: number): [number, number, number] {
  const coords = new Color("srgb-linear", [r, g, b]).to("oklab").coords;
  return [coords[0] ?? Number.NaN, coords[1] ?? Number.NaN, coords[2] ?? Number.NaN];
}
