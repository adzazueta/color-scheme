import Color from "colorjs.io";
import { describe, expect, it } from "vite-plus/test";
import * as accent from "@/scheme/accent.js";
import { createColorScheme } from "@/scheme/create.js";
import * as derive from "@/scheme/derive.js";
import * as neutral from "@/scheme/neutral.js";
import * as report from "@/scheme/report.js";
import * as search from "@/scheme/search.js";
import * as status from "@/scheme/status.js";
import type { Seeds } from "@/types.js";
import { formatHex, gamutGrid, SHORT_HEX_COLORS } from "./helpers.js";
import {
  ACCENT_CONTAINER_GAP,
  ACHROMATIC_ACCENT,
  ACHROMATIC_CHROMA,
  colorJsMapped,
  CONTAINER_LIGHTNESS_DARK,
  CONTAINER_LIGHTNESS_OFFSET_LIGHT,
  CONTRAST_MARGIN,
  contrast,
  deltaEOK,
  fidelityFailures,
  guaranteeFailures,
  LIGHT_SURFACE_MIN_LIGHTNESS,
  LIGHTNESS_MARGIN,
  LIGHTNESS_STEP,
  measure,
  MIN_LIGHTNESS_DIFFERENCE,
  NEUTRAL_CHROMA,
  NEUTRAL_CHROMA_CAP,
  NEUTRAL_LIGHTNESS,
  newTally,
  ON_ACCENT_CHROMA_CAP,
  ON_ACCENT_TARGET_CONTRAST,
  ON_ACCENT_CONTAINER_LIGHTNESS,
  ON_ACCENT_LIGHTNESS,
  SECONDARY_CHROMA_RATIO,
  SEED_CONTAINER_MIN_DISTANCE,
  seedFailures,
  standsApart,
  STATUS_CONTAINER_CHROMA,
  STATUS_HUES,
  statusFailures,
  SURFACE_LIGHTNESS,
} from "./scheme-checks.js";

/**
 * Hand-picked seeds for the guarantee and fidelity (specification 8.1): black, white, and grays;
 * the pure sRGB primaries and secondaries; yellows and creams that miss 3:1 on a light surface;
 * very dark blues; and the edge cases found in earlier reviews.
 */
const HAND_PICKED: readonly Seeds[] = [
  // Black, white, and grays: achromatic primaries, on both sides of the near-black and near-white
  // grays (#1b1b1b and #eeeeee), and two near-grays with a faint tint.
  { primary: "#000000" },
  { primary: "#ffffff" },
  { primary: "#111111" },
  { primary: "#1b1b1b" },
  { primary: "#1c1c1c" },
  { primary: "#333333" },
  { primary: "#777777" },
  { primary: "#808080" },
  { primary: "#aaaaaa" },
  { primary: "#dddddd" },
  { primary: "#ededed" },
  { primary: "#eeeeee" },
  { primary: "#f0f0f0" },
  { primary: "#f8f8ff" },
  { primary: "#fafaf5" },
  // The pure sRGB primaries and secondaries.
  { primary: "#ff0000" },
  { primary: "#00ff00" },
  { primary: "#0000ff" },
  { primary: "#00ffff" },
  { primary: "#ff00ff" },
  { primary: "#ffff00" },
  // Yellows and creams.
  { primary: "#ffeb3b" },
  { primary: "#fffde7" },
  { primary: "#fff8e1" },
  // Very dark blues, too close to the dark surfaces to be the dark-mode container as given.
  { primary: "#000011" },
  { primary: "#000033" },
  { primary: "#1a237e" },
  // The specification's example, and #RGB and uppercase input.
  { primary: "#6750a4" },
  { primary: "#F00", secondary: "#0A0", neutral: "#FFF" },
  { primary: "#00f", secondary: "#0ff", neutral: "#123" },
  // Given secondaries: a light gray too close to the light surfaces, a yellow, black, and white.
  { primary: "#6750a4", secondary: "#f0f0f0" },
  { primary: "#6750a4", secondary: "#ffff00" },
  { primary: "#000000", secondary: "#ffffff" },
  { primary: "#ffffff", secondary: "#000000" },
  // Given neutrals: grays just above and just below Oklab lightness 0.9, creams within the chroma
  // cap, light ones above it, white, black, and a saturated dark one.
  { primary: "#6750a4", neutral: "#dedede" },
  { primary: "#6750a4", neutral: "#dddddd" },
  { primary: "#6750a4", neutral: "#fff8e1" },
  { primary: "#6750a4", neutral: "#fffde7" },
  { primary: "#6750a4", neutral: "#ffeb99" },
  { primary: "#6750a4", neutral: "#fffdd0" },
  { primary: "#6750a4", neutral: "#ffff00" },
  { primary: "#6750a4", neutral: "#ffffff" },
  { primary: "#6750a4", neutral: "#000000" },
  { primary: "#6750a4", neutral: "#0000ff" },
  // Everything light, everything dark, and everything the same gray.
  { primary: "#ffeb3b", secondary: "#fffde7", neutral: "#fff8e1" },
  { primary: "#000033", secondary: "#000011", neutral: "#000000" },
  { primary: "#808080", secondary: "#808080", neutral: "#808080" },
];

export function registerGuaranteeTests(): void {
  describe("scheme checks: measures and parameters", () => {
    it("measure and map with Color.js's functional API exactly as its Color class does", () => {
      const colors = SHORT_HEX_COLORS.filter((_, i) => i % 97 === 0).map(formatHex);
      for (const x of colors) {
        const color = new Color(x);
        const [L, a, b] = color.to("oklab").coords;
        const [, chroma, hue] = color.to("oklch").coords;
        const measured = measure(x);
        expect([measured.luminance, measured.L, measured.a, measured.b]).toEqual([
          color.luminance,
          L,
          a,
          b,
        ]);
        expect([measured.chroma, measured.hue]).toEqual([chroma, hue ?? Number.NaN]);
        for (const y of colors) {
          expect(contrast(x, y)).toBe(color.contrast(new Color(y), "WCAG21"));
          expect(deltaEOK(x, y)).toBe(color.deltaEOK(new Color(y)));
        }
      }
      const channel = (value: number | null): string =>
        Math.min(255, Math.max(0, Math.round((value ?? Number.NaN) * 255)))
          .toString(16)
          .padStart(2, "0");
      for (const [L, a, b] of gamutGrid().filter((_, i) => i % 50 === 0)) {
        const [r, g, bb] = new Color("oklab", [L, a, b])
          .toGamut({ space: "srgb", method: "css" })
          .to("srgb").coords;
        expect(colorJsMapped(L, a, b)).toBe(`#${channel(r)}${channel(g)}${channel(bb)}`);
      }
    });

    it("use the parameters of algorithm version 2, as the package does", () => {
      expect(search.CONTRAST_MARGIN).toBe(CONTRAST_MARGIN);
      expect(search.LIGHTNESS_MARGIN).toBe(LIGHTNESS_MARGIN);
      expect(search.LIGHTNESS_STEP).toBe(LIGHTNESS_STEP);
      expect(report.MIN_LIGHTNESS_DIFFERENCE).toBe(MIN_LIGHTNESS_DIFFERENCE);
      expect(accent.SEED_CONTAINER_MIN_DISTANCE).toBe(SEED_CONTAINER_MIN_DISTANCE);
      expect(accent.ACCENT_CONTAINER_GAP).toBe(ACCENT_CONTAINER_GAP);
      expect(accent.ON_ACCENT_LIGHTNESS_LIGHT).toBe(ON_ACCENT_LIGHTNESS.light);
      expect(accent.ON_ACCENT_LIGHTNESS_DARK).toBe(ON_ACCENT_LIGHTNESS.dark);
      expect(accent.ON_ACCENT_CONTAINER_LIGHTNESS_LIGHT).toBe(ON_ACCENT_CONTAINER_LIGHTNESS.light);
      expect(accent.ON_ACCENT_CONTAINER_LIGHTNESS_DARK).toBe(ON_ACCENT_CONTAINER_LIGHTNESS.dark);
      expect(accent.ON_ACCENT_TARGET_CONTRAST).toBe(ON_ACCENT_TARGET_CONTRAST);
      expect(accent.ON_ACCENT_CHROMA_CAP).toBe(ON_ACCENT_CHROMA_CAP);
      expect(neutral.CONTAINER_LIGHTNESS_OFFSET_LIGHT).toBe(CONTAINER_LIGHTNESS_OFFSET_LIGHT);
      expect(neutral.CONTAINER_LIGHTNESS_DARK).toBe(CONTAINER_LIGHTNESS_DARK);
      expect(status.STATUS_CONTAINER_LIGHT.chroma).toBe(STATUS_CONTAINER_CHROMA.light);
      expect(status.STATUS_CONTAINER_DARK.chroma).toBe(STATUS_CONTAINER_CHROMA.dark);
      expect(derive.ACHROMATIC_CHROMA).toBe(ACHROMATIC_CHROMA);
      expect(derive.SECONDARY_CHROMA_RATIO).toBe(SECONDARY_CHROMA_RATIO);
      expect(derive.NEUTRAL_CHROMA).toBe(NEUTRAL_CHROMA);
      expect(derive.NEUTRAL_LIGHTNESS).toBe(NEUTRAL_LIGHTNESS);
      expect(colorJsMapped(derive.ACHROMATIC_ACCENT_LIGHTNESS_LIGHT, 0, 0)).toBe(
        ACHROMATIC_ACCENT.light,
      );
      expect(colorJsMapped(derive.ACHROMATIC_ACCENT_LIGHTNESS_DARK, 0, 0)).toBe(
        ACHROMATIC_ACCENT.dark,
      );
      expect(neutral.NEUTRAL_CHROMA_CAP).toBe(NEUTRAL_CHROMA_CAP);
      expect(neutral.LIGHT_SURFACE_MIN_LIGHTNESS).toBe(LIGHT_SURFACE_MIN_LIGHTNESS);
      expect(neutral.SURFACE_LIGHTNESS_LIGHT).toBe(SURFACE_LIGHTNESS.light);
      expect(neutral.SURFACE_LIGHTNESS_DARK).toBe(SURFACE_LIGHTNESS.dark);
      const hues = {
        error: status.ERROR_HUE,
        warning: status.WARNING_HUE,
        success: status.SUCCESS_HUE,
        info: status.INFO_HUE,
      };
      for (const [name, hue] of Object.entries(STATUS_HUES)) {
        const vector = hues[name as keyof typeof hues];
        expect(vector.a).toBeCloseTo(Math.cos((hue * Math.PI) / 180), 12);
        expect(vector.b).toBeCloseTo(Math.sin((hue * Math.PI) / 180), 12);
      }
    });
  });

  describe("guarantee: hand-picked seeds (spec 5.2 and 5.3, measured with Color.js)", () => {
    const cases = HAND_PICKED.map(
      (seeds) =>
        [
          Object.entries(seeds)
            .map(([name, hex]) => `${name} ${hex}`)
            .join(", "),
          seeds,
        ] as const,
    );
    it.each(cases)("meets every pair in both modes, without tolerance: %s", (_, seeds) => {
      expect(guaranteeFailures(createColorScheme(seeds))).toEqual([]);
    });
  });

  describe("fidelity: hand-picked seeds", () => {
    it("follows the fidelity rules and builds each accent family, and exercises each rule", () => {
      const tally = newTally();
      // Every search replayed in full, `onPrimary` and `onSecondary` too.
      const failures = HAND_PICKED.flatMap((seeds) =>
        fidelityFailures(createColorScheme(seeds), tally, { fullTextSearch: true }),
      );
      expect(failures).toEqual([]);
      expect(tally.ambiguous).toBe(0);
      for (const rule of [
        "accent",
        "container",
        "moved",
        "achromaticExact",
        "achromaticGray",
        "neutralExact",
        "neutralCapped",
        "neutralSurface",
      ] as const) {
        expect(tally[rule], rule).toBeGreaterThan(0);
      }
    });

    it("moves a seed container by the minimum: one lightness step less does not stand apart", () => {
      const cases = [
        { seeds: { primary: "#6750a4", secondary: "#f0f0f0" }, mode: "light", role: "secondary" },
        { seeds: { primary: "#000033" }, mode: "dark", role: "primary" },
        { seeds: { primary: "#000011" }, mode: "dark", role: "primary" },
        { seeds: { primary: "#fffde7" }, mode: "light", role: "primary" },
      ] as const;
      for (const { seeds, mode, role } of cases) {
        const scheme = createColorScheme(seeds);
        const roles = scheme[mode];
        const seed = scheme.seeds[role].hex;
        const container = roles[`${role}Container` as const];
        const { L, a, b } = measure(seed);
        const direction = mode === "light" ? -1 : 1;
        const candidate = (step: number): string =>
          step === 0 ? seed : colorJsMapped(L + direction * step * LIGHTNESS_STEP, a, b);
        expect(standsApart(seed, mode, roles)).toBe("no");
        // The container is a candidate that keeps the seed's a and b, a whole number of steps
        // away, and the one a step closer to the seed does not stand apart (Color.js deltaEOK).
        let steps = 1;
        while (candidate(steps) !== container && steps < 1 / LIGHTNESS_STEP) steps++;
        expect(candidate(steps)).toBe(container);
        expect(standsApart(container, mode, roles)).toBe("yes");
        expect(standsApart(candidate(steps - 1), mode, roles)).toBe("no");
      }
    });

    it("marks each seed as given or derived, and derives the missing ones from primary", () => {
      for (const seeds of HAND_PICKED) {
        expect(seedFailures(seeds, createColorScheme(seeds))).toEqual([]);
      }
    });

    it("keeps the fixed hue of every status color, and builds its container, in both modes", () => {
      for (const seeds of HAND_PICKED) {
        expect(statusFailures(createColorScheme(seeds))).toEqual([]);
      }
    });
  });
}
