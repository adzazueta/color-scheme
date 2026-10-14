import Color from "colorjs.io";
import { describe, expect, it } from "vite-plus/test";
import { ColorSchemeError } from "@/errors.js";
import * as root from "@/index.js";
import { ALGORITHM_VERSION, createColorScheme } from "@/scheme/create.js";
import { deriveSeeds } from "@/scheme/derive.js";
import { findOrThrow } from "@/scheme/search.js";
import { normalizeSeeds } from "@/seeds.js";
import type { ColorScheme, Role, Seeds } from "@/types.js";

// The expected roles, pairs, and minimums are written out here from the specification (sections
// 3.1, 5.2, and 5.3), not read from the package, and every measure uses Color.js.

/** The 34 roles, in the order of `Role`. */
const ROLES: readonly Role[] = [
  "surface",
  "surfaceContainerLow",
  "surfaceContainer",
  "surfaceContainerHigh",
  "onSurface",
  "onSurfaceVariant",
  "outline",
  "outlineVariant",
  "inverseSurface",
  "onInverseSurface",
  "primary",
  "onPrimary",
  "primaryContainer",
  "onPrimaryContainer",
  "secondary",
  "onSecondary",
  "secondaryContainer",
  "onSecondaryContainer",
  "error",
  "onError",
  "errorContainer",
  "onErrorContainer",
  "warning",
  "onWarning",
  "warningContainer",
  "onWarningContainer",
  "success",
  "onSuccess",
  "successContainer",
  "onSuccessContainer",
  "info",
  "onInfo",
  "infoContainer",
  "onInfoContainer",
];

/** Minimum Oklab lightness difference of a text pair (5.3), a parameter of algorithm version 1. */
const MIN_LIGHTNESS_DIFFERENCE = 0.3;

/** Color.js and the package compute WCAG luminance with slightly different weights. */
const CONTRAST_TOLERANCE = 0.002;

/** The Oklab lightness of Color.js and that of the package differ by about 1e-8. */
const LIGHTNESS_TOLERANCE = 1e-7;

interface ExpectedPair {
  readonly foreground: Role;
  readonly background: Role;
  readonly minContrast: number;
  readonly minLightnessDifference: number | null;
}

/** The 31 guaranteed pairs of 5.2, sorted by foreground and then by background, in `Role` order. */
const PAIRS: readonly ExpectedPair[] = (() => {
  const pairs: ExpectedPair[] = [];
  const add = (foreground: string, background: string, minContrast: number): void => {
    pairs.push({
      foreground: foreground as Role,
      background: background as Role,
      minContrast,
      minLightnessDifference: foreground.startsWith("on") ? MIN_LIGHTNESS_DIFFERENCE : null,
    });
  };
  for (const surface of [
    "surface",
    "surfaceContainerLow",
    "surfaceContainer",
    "surfaceContainerHigh",
  ]) {
    add("onSurface", surface, 7);
    add("onSurfaceVariant", surface, 4.5);
    add("outline", surface, 3);
  }
  add("onInverseSurface", "inverseSurface", 4.5);
  for (const name of ["primary", "secondary", "error", "warning", "success", "info"]) {
    const on = `on${name.charAt(0).toUpperCase()}${name.slice(1)}`;
    add(name, "surface", 3);
    add(on, name, 4.5);
    add(`${on}Container`, `${name}Container`, 4.5);
  }
  const order = (role: Role): number => ROLES.indexOf(role);
  return pairs.sort(
    (x, y) =>
      order(x.foreground) - order(y.foreground) || order(x.background) - order(y.background),
  );
})();

/** Seeds for the spot checks: the examples of the specification and a few hard cases. */
const SPOT_SEEDS: readonly Seeds[] = [
  { primary: "#6750a4" },
  // A very light seed, which fails 3:1 on a light surface.
  { primary: "#ffff00" },
  // Achromatic primaries: black, white, and a mid gray.
  { primary: "#000000" },
  { primary: "#ffffff" },
  { primary: "#808080" },
  // A very dark blue, too close to the dark surfaces to be the dark-mode container as given.
  { primary: "#000033" },
  // A light gray secondary, too close to the light surfaces to be the light-mode container.
  { primary: "#6750a4", secondary: "#f0f0f0" },
  // A cream neutral, light enough to be the light-mode surface.
  { primary: "#6750a4", neutral: "#fff8e1" },
  // Gray neutrals just above and just below Oklab lightness 0.9.
  { primary: "#6750a4", neutral: "#dedede" },
  { primary: "#6750a4", neutral: "#dddddd" },
  // A light neutral above the chroma cap of the surfaces.
  { primary: "#6750a4", neutral: "#ffeb99" },
  // Saturated seeds, with a dark neutral, as #RGB.
  { primary: "#00f", secondary: "#0ff", neutral: "#123" },
  { primary: "#F00", secondary: "#0A0", neutral: "#FFF" },
];

const MODES = ["light", "dark"] as const;
const SEED_NAMES = ["primary", "secondary", "neutral"] as const;

/** WCAG 2.1 contrast of two hex colors, from Color.js. */
function contrast(a: string, b: string): number {
  return new Color(a).contrast(new Color(b), "WCAG21");
}

/** Oklab lightness of a hex color, from Color.js. */
function lightness(hex: string): number {
  return new Color(hex).to("oklab").coords[0] ?? Number.NaN;
}

/** Oklab chroma of a hex color, from Color.js. */
function chroma(hex: string): number {
  const [, a, b] = new Color(hex).to("oklab").coords;
  return Math.sqrt((a ?? Number.NaN) ** 2 + (b ?? Number.NaN) ** 2);
}

/** The error thrown by a call, or `undefined` when it returns. */
function thrownBy(call: () => unknown): unknown {
  try {
    call();
  } catch (error) {
    return error;
  }
  return undefined;
}

export function registerCreateTests(): void {
  describe("createColorScheme: result", () => {
    it("is exported from the package root", () => {
      expect(root.createColorScheme).toBe(createColorScheme);
    });

    it("is, with ColorSchemeError, the only runtime export of the package root", () => {
      // ALGORITHM_VERSION stays internal: the version is read from `meta.algorithmVersion`.
      expect(Object.keys(root)).toEqual(["ColorSchemeError", "createColorScheme"]);
    });

    it("has schemaVersion 1 and its fields in the order of ColorScheme", () => {
      const scheme = createColorScheme({ primary: "#6750a4" });
      expect(scheme.schemaVersion).toBe(1);
      expect(Object.keys(scheme)).toEqual([
        "schemaVersion",
        "light",
        "dark",
        "seeds",
        "report",
        "meta",
      ]);
      expect(Object.keys(scheme.report)).toEqual(["light", "dark"]);
      expect(Object.keys(scheme.report.light)).toEqual(["pairs", "adjustments"]);
      expect(Object.keys(scheme.meta)).toEqual(["algorithmVersion"]);
    });

    it("returns synchronously, as plain objects", () => {
      const scheme = createColorScheme({ primary: "#6750a4", secondary: "#fff", neutral: "#eee" });
      expect(scheme).not.toBeInstanceOf(Promise);
      const objects: object[] = [
        scheme,
        scheme.light,
        scheme.dark,
        scheme.seeds,
        scheme.seeds.primary,
        scheme.report,
        scheme.report.light,
        scheme.report.light.pairs[0]!,
        scheme.report.light.adjustments[0]!,
        scheme.meta,
      ];
      for (const object of objects) {
        expect(Object.getPrototypeOf(object)).toBe(Object.prototype);
      }
      expect(Array.isArray(scheme.report.dark.pairs)).toBe(true);
      expect(Array.isArray(scheme.report.dark.adjustments)).toBe(true);
    });

    it("lists the 34 roles of each mode in the order of Role", () => {
      for (const seeds of SPOT_SEEDS) {
        const scheme = createColorScheme(seeds);
        expect(Object.keys(scheme.light)).toEqual(ROLES);
        expect(Object.keys(scheme.dark)).toEqual(ROLES);
      }
    });

    it("gives every role as a lowercase #rrggbb hex color", () => {
      for (const seeds of SPOT_SEEDS) {
        const scheme = createColorScheme(seeds);
        for (const mode of MODES) {
          for (const role of ROLES) {
            expect(scheme[mode][role]).toMatch(/^#[0-9a-f]{6}$/);
          }
        }
      }
    });

    it("marks each seed as given or derived", () => {
      const derived = createColorScheme({ primary: "#6750a4", secondary: undefined }).seeds;
      expect(Object.keys(derived)).toEqual(SEED_NAMES);
      expect(Object.keys(derived.primary)).toEqual(["hex", "source"]);
      expect(derived.primary).toEqual({ hex: "#6750a4", source: "given" });
      expect(derived.secondary.source).toBe("derived");
      expect(derived.neutral.source).toBe("derived");
      expect(derived.secondary.hex).toMatch(/^#[0-9a-f]{6}$/);
      expect(derived.neutral.hex).toMatch(/^#[0-9a-f]{6}$/);

      expect(createColorScheme({ primary: "#6750a4", neutral: "#fff8e1" }).seeds).toEqual({
        primary: { hex: "#6750a4", source: "given" },
        secondary: derived.secondary,
        neutral: { hex: "#fff8e1", source: "given" },
      });
      expect(
        createColorScheme({ primary: "#6750a4", secondary: "#386a20", neutral: "#fff8e1" }).seeds,
      ).toEqual({
        primary: { hex: "#6750a4", source: "given" },
        secondary: { hex: "#386a20", source: "given" },
        neutral: { hex: "#fff8e1", source: "given" },
      });
    });

    it("returns a #RGB or uppercase seed as lowercase #rrggbb", () => {
      expect(
        createColorScheme({ primary: "#F00", secondary: "#0A0", neutral: "#123" }).seeds,
      ).toEqual({
        primary: { hex: "#ff0000", source: "given" },
        secondary: { hex: "#00aa00", source: "given" },
        neutral: { hex: "#112233", source: "given" },
      });
      expect(createColorScheme({ primary: "#ABCDEF" }).seeds.primary.hex).toBe("#abcdef");
    });

    it("gives the same scheme as the expanded lowercase seeds", () => {
      expect(createColorScheme({ primary: "#F00", secondary: "#0A0", neutral: "#123" })).toEqual(
        createColorScheme({ primary: "#ff0000", secondary: "#00aa00", neutral: "#112233" }),
      );
    });

    it("reports the algorithm version in meta", () => {
      expect(ALGORITHM_VERSION).toMatch(/^[1-9][0-9]*(?:-[a-z0-9]+)?$/);
      for (const seeds of SPOT_SEEDS) {
        expect(createColorScheme(seeds).meta.algorithmVersion).toBe(ALGORITHM_VERSION);
      }
    });

    it("gives equal, separate results for the same seeds, and does not change the input", () => {
      const seeds = { primary: "#ABC", secondary: "#DEF" };
      const first = createColorScheme(seeds);
      const second = createColorScheme(seeds);
      expect(second).toEqual(first);
      expect(second).not.toBe(first);
      expect(second.light).not.toBe(first.light);
      expect(second.report.light.pairs).not.toBe(first.report.light.pairs);
      expect(seeds).toEqual({ primary: "#ABC", secondary: "#DEF" });
    });
  });

  describe("createColorScheme: report", () => {
    it("lists every guaranteed pair, with its minimums, in the order of ModeReport", () => {
      expect(PAIRS).toHaveLength(31);
      for (const seeds of SPOT_SEEDS) {
        const scheme = createColorScheme(seeds);
        for (const mode of MODES) {
          const pairs = scheme.report[mode].pairs.map((pair) => ({
            foreground: pair.foreground,
            background: pair.background,
            minContrast: pair.minContrast,
            minLightnessDifference: pair.minLightnessDifference,
          }));
          expect(pairs).toEqual(PAIRS);
          expect(Object.keys(scheme.report[mode].pairs[0]!)).toEqual([
            "foreground",
            "background",
            "minContrast",
            "contrast",
            "minLightnessDifference",
            "lightnessDifference",
          ]);
        }
      }
    });

    it("measures the returned colors", () => {
      for (const seeds of SPOT_SEEDS) {
        const scheme = createColorScheme(seeds);
        for (const mode of MODES) {
          for (const pair of scheme.report[mode].pairs) {
            const foreground = scheme[mode][pair.foreground];
            const background = scheme[mode][pair.background];
            expect(Math.abs(pair.contrast - contrast(foreground, background))).toBeLessThan(
              CONTRAST_TOLERANCE,
            );
            expect(
              Math.abs(
                pair.lightnessDifference - Math.abs(lightness(foreground) - lightness(background)),
              ),
            ).toBeLessThan(LIGHTNESS_TOLERANCE);
          }
        }
      }
    });

    it("lists one adjustment for each given seed, in the order primary, secondary, neutral", () => {
      const cases: Array<[Seeds, string[]]> = [
        [{ primary: "#6750a4" }, ["primary"]],
        [{ primary: "#6750a4", secondary: "#386a20" }, ["primary", "secondary"]],
        [{ primary: "#6750a4", neutral: "#fff8e1" }, ["primary", "neutral"]],
        [{ neutral: "#fff8e1", secondary: "#386a20", primary: "#6750a4" }, [...SEED_NAMES]],
      ];
      for (const [seeds, names] of cases) {
        const scheme = createColorScheme(seeds);
        for (const mode of MODES) {
          const adjustments = scheme.report[mode].adjustments;
          expect(adjustments.map((adjustment) => adjustment.seed)).toEqual(names);
          for (const adjustment of adjustments) {
            expect(Object.keys(adjustment)).toEqual(["seed", "role", "exact", "lightnessShift"]);
          }
        }
      }
    });

    it("describes where each given seed appears and how far its lightness moved", () => {
      const roles: Record<string, readonly Role[]> = {
        primary: ["primary", "primaryContainer"],
        secondary: ["secondary", "secondaryContainer"],
        neutral: ["surface"],
      };
      for (const seeds of SPOT_SEEDS) {
        const scheme = createColorScheme(seeds);
        for (const mode of MODES) {
          for (const adjustment of scheme.report[mode].adjustments) {
            const seed = scheme.seeds[adjustment.seed].hex;
            const color = scheme[mode][adjustment.role];
            expect(roles[adjustment.seed]).toContain(adjustment.role);
            expect(adjustment.exact).toBe(color === seed);
            if (adjustment.exact) expect(adjustment.lightnessShift).toBe(0);
            expect(
              Math.abs(adjustment.lightnessShift - (lightness(color) - lightness(seed))),
            ).toBeLessThan(LIGHTNESS_TOLERANCE);
          }
        }
      }
    });

    it("keeps the seeds of the specification's examples exactly", () => {
      const exactly = (scheme: ColorScheme, mode: "light" | "dark", role: Role): void => {
        const adjustment = scheme.report[mode].adjustments.find((entry) => entry.role === role);
        expect(adjustment?.exact).toBe(true);
      };
      // A dark seed is the light-mode `primary`; a yellow that fails 3:1 on the light surface
      // stays as the light-mode container; a cream neutral is the light-mode surface.
      const purple = createColorScheme({ primary: "#6750a4", neutral: "#fff8e1" });
      expect(purple.light.primary).toBe("#6750a4");
      exactly(purple, "light", "primary");
      expect(purple.light.surface).toBe("#fff8e1");
      exactly(purple, "light", "surface");
      const yellow = createColorScheme({ primary: "#ffff00" });
      expect(yellow.light.primaryContainer).toBe("#ffff00");
      exactly(yellow, "light", "primaryContainer");
      expect(contrast(yellow.light.primary, yellow.light.surface)).toBeGreaterThanOrEqual(3);
      // An achromatic primary that is already near black or near white is the accent exactly.
      exactly(createColorScheme({ primary: "#000000" }), "light", "primary");
      exactly(createColorScheme({ primary: "#ffffff" }), "dark", "primary");
      // A gray just above Oklab lightness 0.9 is the light-mode surface exactly.
      const gray = createColorScheme({ primary: "#6750a4", neutral: "#dedede" });
      expect(gray.light.surface).toBe("#dedede");
      exactly(gray, "light", "surface");
    });

    it("moves a seed only where the contract says, and reports it", () => {
      const moved = (
        scheme: ColorScheme,
        mode: "light" | "dark",
        seed: "primary" | "secondary" | "neutral",
        role: Role,
      ): number => {
        const adjustment = scheme.report[mode].adjustments.find((entry) => entry.seed === seed);
        expect(adjustment?.role).toBe(role);
        expect(adjustment?.exact).toBe(false);
        return adjustment?.lightnessShift ?? Number.NaN;
      };
      // Seeds too close to the surfaces to be the container as given move toward the accent side:
      // darker in light mode, lighter in dark mode.
      const lightGray = createColorScheme({ primary: "#6750a4", secondary: "#f0f0f0" });
      expect(lightGray.light.secondaryContainer).toBe("#d7d7d7");
      expect(moved(lightGray, "light", "secondary", "secondaryContainer")).toBeLessThan(0);
      const darkBlue = createColorScheme({ primary: "#000033" });
      expect(darkBlue.light.primary).toBe("#000033");
      expect(darkBlue.dark.primaryContainer).toBe("#010f43");
      expect(moved(darkBlue, "dark", "primary", "primaryContainer")).toBeGreaterThan(0);
      // An achromatic primary that is not near black or near white becomes that gray.
      const midGray = createColorScheme({ primary: "#808080" });
      expect(midGray.light.primary).toBe("#1b1b1b");
      expect(midGray.dark.primary).toBe("#eeeeee");
      expect(moved(midGray, "light", "primary", "primary")).toBeLessThan(0);
      expect(moved(midGray, "dark", "primary", "primary")).toBeGreaterThan(0);
      // A gray neutral just below Oklab lightness 0.9 only gives its hue and chroma.
      const darkerGray = createColorScheme({ primary: "#6750a4", neutral: "#dddddd" });
      expect(moved(darkerGray, "light", "neutral", "surface")).toBeGreaterThan(0.05);
      // A light neutral above the chroma cap keeps its lightness, with less chroma.
      const yellow = createColorScheme({ primary: "#6750a4", neutral: "#ffeb99" });
      expect(Math.abs(moved(yellow, "light", "neutral", "surface"))).toBeLessThan(0.005);
      expect(chroma(yellow.light.surface)).toBeLessThan(chroma("#ffeb99") / 2);
    });
  });

  describe("createColorScheme: guarantee, spot check", () => {
    it.each(SPOT_SEEDS)("meets every pair in both modes, measured with Color.js: %o", (seeds) => {
      const scheme = createColorScheme(seeds);
      const failures: string[] = [];
      for (const mode of MODES) {
        for (const pair of PAIRS) {
          const foreground = scheme[mode][pair.foreground];
          const background = scheme[mode][pair.background];
          const measured = contrast(foreground, background);
          const name = `${mode} ${pair.foreground} ${foreground} on ${pair.background} ${background}`;
          if (!(measured >= pair.minContrast)) {
            failures.push(`${name}: contrast ${measured} < ${pair.minContrast}`);
          }
          if (pair.minLightnessDifference !== null) {
            const difference = Math.abs(lightness(foreground) - lightness(background));
            if (!(difference >= pair.minLightnessDifference)) {
              failures.push(`${name}: lightness difference ${difference}`);
            }
          }
        }
      }
      expect(failures).toEqual([]);
    });
  });

  describe("createColorScheme: errors", () => {
    it("passes INVALID_INPUT from validation through unchanged", () => {
      const inputs: unknown[] = [
        null,
        "#fff",
        {},
        { primary: undefined },
        { primary: "#fff", tertiary: "#000" },
        { primary: "#ffff" },
        { primary: "#fff", secondary: "red" },
        { primary: "#fff", neutral: null },
      ];
      for (const input of inputs) {
        const expected = thrownBy(() => normalizeSeeds(input)) as ColorSchemeError;
        const error = thrownBy(() => createColorScheme(input as Seeds));
        expect(error).toBeInstanceOf(ColorSchemeError);
        expect((error as ColorSchemeError).code).toBe("INVALID_INPUT");
        expect((error as ColorSchemeError).message).toBe(expected.message);
        expect("cause" in (error as ColorSchemeError)).toBe(false);
      }
    });

    it("gives INVALID_INPUT, with the original as cause, for a getter that throws", () => {
      const cause = new TypeError("getter failure");
      const seeds = {
        get primary(): string {
          throw cause;
        },
      };
      const error = thrownBy(() => createColorScheme(seeds));
      expect(error).toBeInstanceOf(ColorSchemeError);
      expect((error as ColorSchemeError).code).toBe("INVALID_INPUT");
      expect((error as ColorSchemeError).message).toBe("The seeds could not be read.");
      expect((error as ColorSchemeError).cause).toBe(cause);
    });

    it("gives INVALID_INPUT, with the original as cause, for a proxy that throws", () => {
      const cause = new RangeError("ownKeys failure");
      const throwing = new Proxy<Seeds>(
        { primary: "#fff" },
        {
          ownKeys(): never {
            throw cause;
          },
        },
      );
      const ownKeys = thrownBy(() => createColorScheme(throwing));
      expect(ownKeys).toBeInstanceOf(ColorSchemeError);
      expect((ownKeys as ColorSchemeError).code).toBe("INVALID_INPUT");
      expect((ownKeys as ColorSchemeError).message).toBe("The seeds could not be read.");
      expect((ownKeys as ColorSchemeError).cause).toBe(cause);

      const { proxy, revoke } = Proxy.revocable<Seeds>({ primary: "#fff" }, {});
      revoke();
      const revoked = thrownBy(() => createColorScheme(proxy));
      expect(revoked).toBeInstanceOf(ColorSchemeError);
      expect((revoked as ColorSchemeError).code).toBe("INVALID_INPUT");
      expect((revoked as ColorSchemeError).message).toBe("The seeds could not be read.");
      expect((revoked as ColorSchemeError).cause).toBeInstanceOf(TypeError);
    });

    it("names the seeds the same way when no color meets a role's minimums", () => {
      const seeds = deriveSeeds(normalizeSeeds({ primary: "#ABC", neutral: "#FFF" }));
      const error = thrownBy(() =>
        findOrThrow("primary", "dark", seeds, {
          start: 0.5,
          a: 0,
          b: 0,
          backgrounds: [{ r: 0, g: 0, b: 0 }],
          minContrast: 22,
          prefer: "lighter",
        }),
      );
      expect(error).toBeInstanceOf(ColorSchemeError);
      expect((error as ColorSchemeError).code).toBe("PROCESSING_FAILED");
      expect((error as ColorSchemeError).message).toBe(
        "No primary color meets its minimums in dark mode. Seeds: primary #aabbcc, secondary not given, neutral #ffffff.",
      );
      expect("cause" in (error as ColorSchemeError)).toBe(false);
    });
  });
}
