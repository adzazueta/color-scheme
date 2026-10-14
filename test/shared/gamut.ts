import Color from "colorjs.io";
import { describe, expect, it } from "vite-plus/test";
import { mapOklabToSrgbGamut, oklabToSrgb } from "@/color/gamut.js";
import { oklabToLinearSrgb } from "@/color/oklab-to-linear.js";
import { SHORT_HEX_COLORS, colorJsOklab, gamutGrid } from "./helpers.js";

/** The Color.js reference: CSS Color 4 gamut mapping into sRGB, then 8-bit rounding. */
function colorJsGamutMapped(L: number, a: number, b: number): [number, number, number] {
  const mapped = new Color("oklab", [L, a, b]).toGamut({ space: "srgb", method: "css" });
  const [r, g, bb] = mapped.to("srgb").coords;
  const channel = (value: number | null): number =>
    Math.min(255, Math.max(0, Math.round((value ?? Number.NaN) * 255)));
  return [channel(r), channel(g), channel(bb)];
}

export function registerGamutTests(): void {
  describe("oklabToSrgb against Color.js toGamut (css)", () => {
    it("differs by at most one 8-bit step per channel, and rarely", () => {
      const grid = gamutGrid();
      let differing = 0;
      let maxStep = 0;
      for (const [L, a, b] of grid) {
        const actual = oklabToSrgb(L, a, b);
        const expected = colorJsGamutMapped(L, a, b);
        const steps = [
          Math.abs(actual.r - expected[0]),
          Math.abs(actual.g - expected[1]),
          Math.abs(actual.b - expected[2]),
        ];
        const worst = Math.max(...steps);
        maxStep = Math.max(maxStep, worst);
        if (worst > 0) {
          differing++;
        }
      }
      // Near rounding thresholds and near the JND branch, the two implementations can land on
      // neighboring 8-bit values. On this grid of 32,677 points, 0 differed in all four engines
      // (Node, Chromium, Firefox, and WebKit); the cap leaves room for a few without hiding a
      // wrong branch, which gives dozens.
      expect(maxStep).toBeLessThanOrEqual(1);
      expect(differing).toBeLessThanOrEqual(10);
    });

    it("mapOklabToSrgbGamut matches the Color.js linear result, except for a few points", () => {
      let differing = 0;
      for (const [L, a, b] of gamutGrid()) {
        const actual = mapOklabToSrgbGamut(L, a, b);
        const [r, g, bb] = new Color("oklab", [L, a, b])
          .toGamut({ space: "srgb", method: "css" })
          .to("srgb-linear").coords;
        const worst = Math.max(
          Math.abs(actual.r - (r ?? Number.NaN)),
          Math.abs(actual.g - (g ?? Number.NaN)),
          Math.abs(actual.b - (bb ?? Number.NaN)),
        );
        // NaN fails this comparison, so it counts as a difference.
        if (!(worst <= 1e-6)) {
          differing++;
        }
      }
      // Measured: 3 points in every engine, where the JND branch decides differently.
      expect(differing).toBeLessThanOrEqual(10);
    });

    it("returns colors inside the gamut unchanged", () => {
      for (const color of SHORT_HEX_COLORS) {
        const [L, a, b] = colorJsOklab(color);
        expect(oklabToSrgb(L, a, b)).toEqual(color);
      }
    });

    it("returns in-gamut colors from a different sample unchanged, too", () => {
      for (let r = 3; r < 256; r += 16) {
        for (let g = 5; g < 256; g += 14) {
          for (let b = 7; b < 256; b += 12) {
            const [L, a, bb] = colorJsOklab({ r, g, b });
            expect(oklabToSrgb(L, a, bb)).toEqual({ r, g, b });
          }
        }
      }
    });

    it("gives linear channels that are exactly oklabToLinearSrgb inside the gamut", () => {
      for (const color of SHORT_HEX_COLORS.filter((_, i) => i % 3 === 0)) {
        const [L, a, b] = colorJsOklab(color);
        const origin = oklabToLinearSrgb(L, a, b);
        const inside =
          origin.r >= 0 &&
          origin.r <= 1 &&
          origin.g >= 0 &&
          origin.g <= 1 &&
          origin.b >= 0 &&
          origin.b <= 1;
        if (inside) {
          expect(mapOklabToSrgbGamut(L, a, b)).toEqual(origin);
        }
      }
    });
  });

  describe("oklabToSrgb and mapOklabToSrgbGamut properties", () => {
    it("gives white for lightness 1 or more, whatever a and b", () => {
      for (const L of [1, 1.0000001, 2, Infinity]) {
        for (const [a, b] of [
          [0, 0],
          [0.3, -0.3],
          [-5, 5],
          [1e3, 1e3],
        ] as const) {
          expect(oklabToSrgb(L, a, b)).toEqual({ r: 255, g: 255, b: 255 });
          expect(mapOklabToSrgbGamut(L, a, b)).toEqual({ r: 1, g: 1, b: 1 });
        }
      }
    });

    it("gives black for lightness 0 or less, whatever a and b", () => {
      for (const L of [0, -0, -0.0000001, -1, -Infinity]) {
        for (const [a, b] of [
          [0, 0],
          [0.3, -0.3],
          [-5, 5],
          [1e3, 1e3],
        ] as const) {
          expect(oklabToSrgb(L, a, b)).toEqual({ r: 0, g: 0, b: 0 });
          expect(mapOklabToSrgbGamut(L, a, b)).toEqual({ r: 0, g: 0, b: 0 });
        }
      }
    });

    it("always gives integer channels from 0 to 255 on the grid and for extreme chroma", () => {
      const extremes: Array<[number, number, number]> = [
        [0.5, 10, -10],
        [0.5, 1e6, 1e6],
        [0.5, -1e6, 1e-6],
        [0.9999, 3, 3],
        [0.0001, -3, 3],
        [0.5, 1e-9, -1e-9],
        [0.5, 0, 0],
      ];
      for (const [L, a, b] of [...gamutGrid(), ...extremes]) {
        const color = oklabToSrgb(L, a, b);
        for (const channel of [color.r, color.g, color.b]) {
          expect(Number.isInteger(channel)).toBe(true);
          expect(channel).toBeGreaterThanOrEqual(0);
          expect(channel).toBeLessThanOrEqual(255);
        }
      }
    });

    it("always maps into the linear range 0 to 1", () => {
      for (const [L, a, b] of gamutGrid()) {
        const color = mapOklabToSrgbGamut(L, a, b);
        for (const channel of [color.r, color.g, color.b]) {
          expect(channel).toBeGreaterThanOrEqual(0);
          expect(channel).toBeLessThanOrEqual(1);
        }
      }
    });

    it("keeps grays gray", () => {
      for (let l = 1; l < 40; l++) {
        const color = oklabToSrgb(l / 40, 0, 0);
        expect(color.r).toBe(color.g);
        expect(color.g).toBe(color.b);
      }
    });

    it("gives NaN for NaN inputs, as documented", () => {
      expect(mapOklabToSrgbGamut(Number.NaN, 0, 0)).toEqual({
        r: Number.NaN,
        g: Number.NaN,
        b: Number.NaN,
      });
      expect(oklabToSrgb(0.5, Number.NaN, 0).r).toBeNaN();
      // A chroma that overflows to Infinity.
      expect(mapOklabToSrgbGamut(0.5, 1e200, 1e200)).toEqual({
        r: Number.NaN,
        g: Number.NaN,
        b: Number.NaN,
      });
      expect(oklabToSrgb(0.5, -1e200, 0).b).toBeNaN();
      expect(oklabToSrgb(0.5, 0, Number.NaN).g).toBeNaN();
    });

    it("keeps the lightness of a mapped color within 0.1 of the original", () => {
      // Mapping reduces chroma and keeps lightness, up to the clipping of the last step.
      for (const [L, a, b] of gamutGrid().filter((_, i) => i % 7 === 0)) {
        if (L <= 0.1 || L >= 0.95) {
          continue;
        }
        const [mappedL] = colorJsOklab(oklabToSrgb(L, a, b));
        expect(Math.abs(mappedL - L)).toBeLessThan(0.1);
      }
    });
  });
}
