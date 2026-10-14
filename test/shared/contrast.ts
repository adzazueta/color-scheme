import { describe, expect, it } from "vite-plus/test";
import { contrastRatio, lightnessDifference, relativeLuminance } from "@/color/contrast.js";
import type { Srgb } from "@/color/types.js";
import {
  colorJs,
  colorJsOklab,
  mulberry32,
  REFERENCE_COLORS,
  SHORT_HEX_COLORS,
} from "./helpers.js";

/**
 * Color.js computes WCAG 2.1 luminance with its XYZ matrix row (about 0.21264, 0.71517, 0.07219)
 * instead of WCAG's 0.2126, 0.7152, and 0.0722, so its ratios differ from the package's, which
 * follows WCAG 2.2 exactly, by up to about 0.0012. The tolerance is absolute, on the ratio.
 */
const CONTRAST_TOLERANCE = 0.002;

/** Lightness is the Oklab L: the two conversions differ by about 1e-8, so a difference by 2e-8. */
const LIGHTNESS_TOLERANCE = 1e-7;

const BLACK: Srgb = { r: 0, g: 0, b: 0 };
const WHITE: Srgb = { r: 255, g: 255, b: 255 };

/** Deterministic pairs of #RGB colors: 3,000 seeded pairs, plus each reference color with the rest. */
function colorPairs(): Array<[Srgb, Srgb]> {
  const next = mulberry32(2222);
  const pick = (): Srgb => SHORT_HEX_COLORS[Math.floor(next() * SHORT_HEX_COLORS.length)]!;
  const pairs: Array<[Srgb, Srgb]> = [];
  for (let i = 0; i < 3000; i++) {
    pairs.push([pick(), pick()]);
  }
  for (const a of REFERENCE_COLORS) {
    for (const b of REFERENCE_COLORS) {
      pairs.push([a, b]);
    }
  }
  return pairs;
}

/** WCAG 2.2, written out from its definition (0.04045 break, exact coefficients). */
function wcagContrast(a: Srgb, b: Srgb): number {
  const decode = (channel: number): number => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const luminance = (color: Srgb): number =>
    0.2126 * decode(color.r) + 0.7152 * decode(color.g) + 0.0722 * decode(color.b);
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function registerContrastTests(): void {
  describe("contrastRatio against Color.js", () => {
    it("matches WCAG 2.1 contrast within the tolerance on 3,000+ pairs", () => {
      let worst = 0;
      for (const [a, b] of colorPairs()) {
        const expected = colorJs(a).contrast(colorJs(b), "WCAG21");
        worst = Math.max(worst, Math.abs(contrastRatio(a, b) - expected));
      }
      expect(worst).toBeLessThan(CONTRAST_TOLERANCE);
    });

    it("matches every #RGB color against black and white", () => {
      for (const color of SHORT_HEX_COLORS) {
        for (const other of [BLACK, WHITE]) {
          const expected = colorJs(color).contrast(colorJs(other), "WCAG21");
          expect(Math.abs(contrastRatio(color, other) - expected)).toBeLessThan(CONTRAST_TOLERANCE);
        }
      }
    });
  });

  describe("contrastRatio against the WCAG 2.2 definition", () => {
    it("matches the definition written out with Math.pow within 1e-12", () => {
      for (const [a, b] of colorPairs()) {
        expect(Math.abs(contrastRatio(a, b) - wcagContrast(a, b))).toBeLessThan(1e-12);
      }
    });

    it("gives the published ratio of #767676 on white, 4.54:1", () => {
      expect(contrastRatio({ r: 0x76, g: 0x76, b: 0x76 }, WHITE)).toBeCloseTo(4.54, 2);
      expect(contrastRatio({ r: 0x77, g: 0x77, b: 0x77 }, WHITE)).toBeLessThan(4.5);
    });
  });

  describe("contrastRatio properties", () => {
    it("is exactly 21 for black and white, in both orders", () => {
      expect(contrastRatio(BLACK, WHITE)).toBe(21);
      expect(contrastRatio(WHITE, BLACK)).toBe(21);
    });

    it("is exactly 1 for a color with itself", () => {
      for (const color of [
        ...REFERENCE_COLORS,
        ...SHORT_HEX_COLORS.filter((_, i) => i % 37 === 0),
      ]) {
        expect(contrastRatio(color, color)).toBe(1);
      }
    });

    it("does not depend on the order and stays from 1 to 21", () => {
      for (const [a, b] of colorPairs()) {
        const ratio = contrastRatio(a, b);
        expect(ratio).toBe(contrastRatio(b, a));
        expect(ratio).toBeGreaterThanOrEqual(1);
        expect(ratio).toBeLessThanOrEqual(21);
      }
    });

    it("gives NaN for a channel that is not an integer from 0 to 255", () => {
      expect(contrastRatio({ r: -1, g: 0, b: 0 }, WHITE)).toBeNaN();
      expect(contrastRatio({ r: 0, g: 256, b: 0 }, WHITE)).toBeNaN();
      expect(contrastRatio({ r: 0.5, g: 0, b: 0 }, WHITE)).toBeNaN();
      expect(contrastRatio(BLACK, { r: 0, g: 0, b: Number.NaN })).toBeNaN();
    });
  });

  describe("relativeLuminance", () => {
    it("is 0 for black and 1 for white up to rounding", () => {
      expect(relativeLuminance(BLACK)).toBe(0);
      expect(Math.abs(relativeLuminance(WHITE) - 1)).toBeLessThan(1e-15);
    });

    it("uses the WCAG coefficients on the primaries", () => {
      expect(relativeLuminance({ r: 255, g: 0, b: 0 })).toBe(0.2126);
      expect(relativeLuminance({ r: 0, g: 255, b: 0 })).toBe(0.7152);
      expect(relativeLuminance({ r: 0, g: 0, b: 255 })).toBe(0.0722);
    });
  });

  describe("lightnessDifference against Color.js", () => {
    it("matches the difference of the Color.js Oklab lightness on 3,000+ pairs", () => {
      let worst = 0;
      for (const [a, b] of colorPairs()) {
        const expected = Math.abs(colorJsOklab(a)[0] - colorJsOklab(b)[0]);
        worst = Math.max(worst, Math.abs(lightnessDifference(a, b) - expected));
      }
      expect(worst).toBeLessThan(LIGHTNESS_TOLERANCE);
    });

    it("is 0 for a color with itself, 1 for black and white, and symmetric", () => {
      for (const color of REFERENCE_COLORS) {
        expect(lightnessDifference(color, color)).toBe(0);
      }
      expect(Math.abs(lightnessDifference(BLACK, WHITE) - 1)).toBeLessThan(LIGHTNESS_TOLERANCE);
      for (const [a, b] of colorPairs().slice(0, 500)) {
        expect(lightnessDifference(a, b)).toBe(lightnessDifference(b, a));
      }
    });

    it("gives NaN for a channel that is not an integer from 0 to 255", () => {
      expect(lightnessDifference({ r: 300, g: 0, b: 0 }, WHITE)).toBeNaN();
    });
  });
}
