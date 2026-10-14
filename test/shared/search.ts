import { describe, expect, it } from "vite-plus/test";
import type { Srgb } from "@/color/types.js";
import { findLightness, type LightnessSearch } from "@/scheme/search.js";
import { formatHex, mulberry32 } from "./helpers.js";
import { searchOracle } from "./scheme-checks.js";

const BLACK: Srgb = { r: 0, g: 0, b: 0 };
const WHITE: Srgb = { r: 255, g: 255, b: 255 };
const GRAY: Srgb = { r: 0x77, g: 0x77, b: 0x77 };

/** Checks one search against the oracle, and returns whether the oracle was unsure. */
function checkAgainstOracle(search: LightnessSearch): boolean {
  const result = findLightness(search);
  const allowed = searchOracle({ ...search, backgrounds: search.backgrounds.map(formatHex) });
  const name = JSON.stringify(search);
  if (result === null) {
    expect(allowed.orNull, name).toBe(true);
  } else {
    expect(allowed.matches, name).toContainEqual({ L: result.L, hex: formatHex(result.color) });
  }
  return allowed.unsure;
}

/**
 * Random searches from a fixed seed: starts inside and outside 0…1, hues in and out of the gamut,
 * zero to three random backgrounds, the minimums the package uses and random ones, with and
 * without a lightness difference minimum, and both sides preferred.
 */
function randomSearches(count: number): LightnessSearch[] {
  const next = mulberry32(512);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!;
  const between = (low: number, high: number): number => low + (high - low) * next();
  const color = (): Srgb => ({
    r: Math.floor(next() * 256),
    g: Math.floor(next() * 256),
    b: Math.floor(next() * 256),
  });
  return Array.from({ length: count }, () => {
    const start = next() < 0.2 ? pick([0, 1, -0.3, 1.4, 0.25, 0.5, 0.75]) : between(-0.1, 1.1);
    const gray = next() < 0.3;
    const a = gray ? 0 : between(-0.25, 0.25);
    const b = gray ? 0 : between(-0.25, 0.25);
    const backgrounds = Array.from({ length: pick([0, 1, 1, 2, 3]) }, color);
    const minContrast = next() < 0.6 ? pick([1, 3.005, 4.505, 7.005]) : between(1, 12);
    const lightnessChoice = next();
    const minLightnessDifference =
      lightnessChoice < 0.4 ? undefined : lightnessChoice < 0.7 ? 0.301 : between(0, 0.7);
    const prefer = next() < 0.5 ? "lighter" : "darker";
    return { start, a, b, backgrounds, minContrast, minLightnessDifference, prefer };
  });
}

export function registerSearchTests(): void {
  describe("findLightness against a brute-force oracle", () => {
    it("returns the first candidate that meets every minimum, on 150 random searches", () => {
      let unsure = 0;
      for (const search of randomSearches(150)) {
        if (checkAgainstOracle(search)) unsure++;
      }
      // Color.js agrees with the package on almost every verdict; a few searches near a threshold
      // or a rounding tie are allowed either way.
      expect(unsure).toBeLessThanOrEqual(5);
      // About half a second in Node and 1.3 s under coverage; it also runs in three browsers.
    }, 60_000);

    it("keeps searching past a candidate that meets the contrast but not the lightness rule", () => {
      const search: LightnessSearch = {
        start: 0.3,
        a: 0,
        b: 0,
        backgrounds: [BLACK],
        minContrast: 1,
        minLightnessDifference: 0.5,
        prefer: "darker",
      };
      checkAgainstOracle(search);
      expect(findLightness(search)?.L).toBeGreaterThan(0.49);
    });

    it("returns null when not even white or black meets the minimums", () => {
      for (const prefer of ["lighter", "darker"] as const) {
        const search: LightnessSearch = {
          start: 0.5,
          a: 0.1,
          b: -0.1,
          backgrounds: [GRAY],
          minContrast: 7.005,
          prefer,
        };
        expect(findLightness(search)).toBeNull();
        checkAgainstOracle(search);
      }
    });
  });

  describe("findLightness edge cases", () => {
    it("returns the start, clamped to 0…1, when there are no backgrounds", () => {
      const search = {
        a: 0.2,
        b: 0.1,
        backgrounds: [],
        minContrast: 21,
        prefer: "darker",
      } as const;
      expect(findLightness({ ...search, start: 1.5 })).toEqual({ color: WHITE, L: 1 });
      expect(findLightness({ ...search, start: -0.5 })).toEqual({ color: BLACK, L: 0 });
      expect(findLightness({ ...search, start: 0.6 })?.L).toBe(0.6);
    });

    it("searches only darker from a start of 1 or more, and only lighter from 0 or less", () => {
      // White misses 3:1 on the light gray, and black misses it on the dark one.
      const light = { a: 0.05, b: 0, backgrounds: [{ r: 0xcc, g: 0xcc, b: 0xcc }] } as const;
      const dark = { a: 0.05, b: 0, backgrounds: [{ r: 0x33, g: 0x33, b: 0x33 }] } as const;
      for (const prefer of ["lighter", "darker"] as const) {
        for (const start of [1, 1.2]) {
          const search = { ...light, start, minContrast: 3.005, prefer };
          checkAgainstOracle(search);
          expect(findLightness(search)!.L).toBeLessThan(1);
        }
        for (const start of [0, -0.2]) {
          const search = { ...dark, start, minContrast: 3.005, prefer };
          checkAgainstOracle(search);
          expect(findLightness(search)!.L).toBeGreaterThan(0);
        }
      }
    });

    it("returns null for a NaN start, even with no backgrounds", () => {
      const search = { a: 0, b: 0, minContrast: 1, prefer: "lighter" } as const;
      expect(findLightness({ ...search, start: Number.NaN, backgrounds: [] })).toBeNull();
      expect(findLightness({ ...search, start: Number.NaN, backgrounds: [GRAY] })).toBeNull();
    });

    it("leaves only white and black when a or b is NaN, tried in order of distance", () => {
      const search = { start: 0.5, backgrounds: [GRAY], minContrast: 4.505 } as const;
      // On #777777, white misses 4.5:1 and black meets it.
      expect(findLightness({ ...search, a: Number.NaN, b: 0, prefer: "lighter" })).toEqual({
        color: BLACK,
        L: 0,
      });
      // On #333333, white meets it; both ends are 0.5 away, so the preferred side comes first.
      const dark = { ...search, backgrounds: [{ r: 0x33, g: 0x33, b: 0x33 }], minContrast: 1 };
      expect(findLightness({ ...dark, a: 0, b: Number.NaN, prefer: "lighter" })).toEqual({
        color: WHITE,
        L: 1,
      });
      expect(findLightness({ ...dark, a: 0, b: Number.NaN, prefer: "darker" })).toEqual({
        color: BLACK,
        L: 0,
      });
    });
  });
}
