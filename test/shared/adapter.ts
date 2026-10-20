import { describe, expect, it } from "vite-plus/test";
import {
  SECONDARY_MAX_HUE_COSINE,
  SECONDARY_MIN_HUE_DISTANCE,
  SEED_MIN_CHROMA,
  seedsFromColorExtractor,
} from "@/adapter.js";
import { ColorSchemeError, type ColorSchemeErrorCode } from "@/errors.js";
import * as root from "@/index.js";
import { createColorScheme } from "@/scheme/create.js";
import * as derive from "@/scheme/derive.js";
import type { ColorExtractorResult, Role, Seeds } from "@/types.js";
import { thrownBy } from "./helpers.js";
import {
  ACHROMATIC_ACCENT,
  ACHROMATIC_CHROMA,
  guaranteeFailures,
  measure,
  MODES,
  OKLAB_TOLERANCE,
} from "./scheme-checks.js";

// The results are written by hand in the shape of `@adzazueta/color-extractor` 0.4, with every
// field it returns; none comes from a real cover. The parameters are written out from the proposal
// for the specification, section 4.1, and every chroma and hue below is measured with Color.js,
// never with the package's formulas.

/** The adapter's chroma minimum (`SEED_MIN_CHROMA`), in Oklab chroma. */
const MIN_CHROMA = 0.02;

/** The adapter's hue distance (`SECONDARY_MIN_HUE_DISTANCE`), in degrees. */
const MIN_HUE_DISTANCE = 45;

/**
 * Band around the hue distance, in degrees, in which a replay cannot tell on which side the
 * package's own angle falls: {@link OKLAB_TOLERANCE} on a and b turns into about 0.0005° for each
 * color at the chromas used here (above 0.1), so 0.001° covers both.
 */
const HUE_TOLERANCE = 0.001;

/** A color of a hand-written result: its hex as `color-extractor` writes it, and its coverage. */
type Entry = readonly [hex: string, coverage: number];

/**
 * A result in the full shape of `color-extractor` 0.4 (`ExtractionResult`): the given colors in
 * the given order, each with `rank`, `hex`, `hex8`, `rgba`, `coverage`, `score`, and `position`,
 * and `meta`. Only `schemaVersion` and each color's `hex` and `coverage` are read by the adapter.
 */
function extractorResult(
  entries: readonly Entry[],
  mode: "perceptual" | "population" = "perceptual",
): ColorExtractorResult {
  return {
    schemaVersion: 1,
    colors: entries.map(([hex, coverage], index) => ({
      rank: index + 1,
      hex,
      hex8: `${hex}ff`,
      rgba: [
        Number.parseInt(hex.slice(1, 3), 16),
        Number.parseInt(hex.slice(3, 5), 16),
        Number.parseInt(hex.slice(5, 7), 16),
        255,
      ],
      coverage,
      score: 1 - index / 10,
      position: { x: 10 * index, y: 20 },
    })),
    meta: { width: 300, height: 450, mode, count: 5, algorithmVersion: "3" },
  } as ColorExtractorResult;
}

/** Smallest angle between two hues, in degrees. */
function hueDistance(x: string, y: string): number {
  const difference = Math.abs(measure(x).hue - measure(y).hue) % 360;
  return difference > 180 ? 360 - difference : difference;
}

/** Whether every channel of a lowercase `#rrggbb` color is the same: a gray. */
function isGray(hex: string): boolean {
  return hex.slice(1, 3) === hex.slice(3, 5) && hex.slice(3, 5) === hex.slice(5, 7);
}

/** A hand-written cover: a red, a skin tone, a blue, a paper white, and an ink black. */
const RED = "#c8102e";
const SKIN = "#f2c4a8";
const BLUE = "#1f4e9c";
const PAPER = "#fbf8f3";
const INK = "#141414";

/** The cover in perceptual order: the colors that stand out first. */
const PERCEPTUAL: readonly Entry[] = [
  [RED, 0.12],
  [SKIN, 0.18],
  [BLUE, 0.2],
  [PAPER, 0.38],
  [INK, 0.12],
];

/** The same colors in population order: by coverage, largest first. */
const POPULATION: readonly Entry[] = [
  [PAPER, 0.38],
  [BLUE, 0.2],
  [SKIN, 0.18],
  [RED, 0.12],
  [INK, 0.12],
];

/** Closest 8-bit colors outside OKLAB_TOLERANCE of the chroma minimum on each side, found with Color.js. */
const JUST_ABOVE_MIN_CHROMA = "#91897d";
const JUST_BELOW_MIN_CHROMA = "#746569";

/**
 * A primary and the closest 8-bit colors to the hue distance from it on each side, found with
 * Color.js: one pair toward magenta and one toward blue.
 */
const HUE_PRIMARY = "#6750a4";
const JUST_PAST_HUE_DISTANCE = ["#a52789", "#0790ef"] as const;
const JUST_SHORT_OF_HUE_DISTANCE = ["#c251a5", "#347ec0"] as const;

/** The accent roles, which an achromatic primary makes gray. */
const ACCENT_ROLES: readonly Role[] = [
  "primary",
  "onPrimary",
  "primaryContainer",
  "onPrimaryContainer",
  "secondary",
  "onSecondary",
  "secondaryContainer",
  "onSecondaryContainer",
];

/** The error thrown by the adapter, checked to be a `ColorSchemeError` with this code. */
function failure(input: unknown, code: ColorSchemeErrorCode): ColorSchemeError {
  const error = thrownBy(() => seedsFromColorExtractor(input as ColorExtractorResult));
  expect(error).toBeInstanceOf(ColorSchemeError);
  expect((error as ColorSchemeError).code).toBe(code);
  return error as ColorSchemeError;
}

/** Asserts an `INVALID_INPUT` error with exactly this message and no cause. */
function expectInvalid(input: unknown, message: string): void {
  const error = failure(input, "INVALID_INPUT");
  expect(error.message).toBe(message);
  expect("cause" in error).toBe(false);
}

/** Asserts the error for a result that cannot be read, with the original error as `cause`. */
function expectUnreadable(input: unknown): ColorSchemeError {
  const error = failure(input, "INVALID_INPUT");
  expect(error.message).toBe("The color-extractor result could not be read.");
  expect("cause" in error).toBe(true);
  return error;
}

/** A valid color, in the shape that the adapter reads. */
const VALID = { hex: RED, coverage: 0.5 };

export function registerAdapterTests(): void {
  describe("seedsFromColorExtractor: parameters", () => {
    it("is exported from the package root", () => {
      expect(root.seedsFromColorExtractor).toBe(seedsFromColorExtractor);
    });

    it("uses the proposed chroma minimum, equal to the achromatic limit of createColorScheme", () => {
      expect(SEED_MIN_CHROMA).toBe(MIN_CHROMA);
      expect(derive.ACHROMATIC_CHROMA).toBe(ACHROMATIC_CHROMA);
      expect(SEED_MIN_CHROMA).toBe(derive.ACHROMATIC_CHROMA);
    });

    it("uses the proposed hue distance, with its cosine precomputed", () => {
      expect(SECONDARY_MIN_HUE_DISTANCE).toBe(MIN_HUE_DISTANCE);
      expect(SECONDARY_MAX_HUE_COSINE).toBe(Math.SQRT1_2);
      expect(
        Math.abs(SECONDARY_MAX_HUE_COSINE - Math.cos((MIN_HUE_DISTANCE * Math.PI) / 180)),
      ).toBeLessThanOrEqual(Number.EPSILON);
    });
  });

  describe("seedsFromColorExtractor: selection (spec 2.2)", () => {
    it("has the premises of the hand-written cover, measured with Color.js", () => {
      for (const hex of [RED, SKIN, BLUE]) {
        expect(measure(hex).chroma).toBeGreaterThan(MIN_CHROMA + 0.04);
      }
      for (const hex of [PAPER, INK]) {
        expect(measure(hex).chroma).toBeLessThan(MIN_CHROMA - 0.01);
      }
      // The skin tone is of the red's hue family; the blue is far from both.
      expect(hueDistance(RED, SKIN)).toBeLessThan(MIN_HUE_DISTANCE - 10);
      expect(hueDistance(RED, BLUE)).toBeGreaterThan(MIN_HUE_DISTANCE + 10);
      expect(hueDistance(BLUE, SKIN)).toBeGreaterThan(MIN_HUE_DISTANCE + 10);
    });

    it("picks the seeds in perceptual order, skipping a secondary of the primary's hue family", () => {
      expect(seedsFromColorExtractor(extractorResult(PERCEPTUAL))).toEqual({
        primary: RED,
        secondary: BLUE,
        neutral: PAPER,
      });
    });

    it("picks the seeds in population order, skipping the whites and blacks first", () => {
      expect(seedsFromColorExtractor(extractorResult(POPULATION, "population"))).toEqual({
        primary: BLUE,
        secondary: SKIN,
        neutral: PAPER,
      });
    });

    it("skips whites, blacks, and grays, including tinted ones, before the primary", () => {
      const result = extractorResult([
        ["#ffffff", 0.3],
        ["#000000", 0.2],
        ["#808080", 0.1],
        [PAPER, 0.1],
        [JUST_BELOW_MIN_CHROMA, 0.1],
        [BLUE, 0.2],
      ]);
      expect(seedsFromColorExtractor(result)).toEqual({ primary: BLUE, neutral: "#ffffff" });
    });

    it("takes a color at the chroma minimum and skips one just below it, measured with Color.js", () => {
      expect(measure(JUST_ABOVE_MIN_CHROMA).chroma).toBeGreaterThan(MIN_CHROMA + OKLAB_TOLERANCE);
      expect(measure(JUST_ABOVE_MIN_CHROMA).chroma).toBeLessThan(MIN_CHROMA + 1e-5);
      expect(measure(JUST_BELOW_MIN_CHROMA).chroma).toBeLessThan(MIN_CHROMA - OKLAB_TOLERANCE);
      expect(measure(JUST_BELOW_MIN_CHROMA).chroma).toBeGreaterThan(MIN_CHROMA - 1e-5);

      // As the primary.
      expect(
        seedsFromColorExtractor(
          extractorResult([
            [JUST_BELOW_MIN_CHROMA, 0.6],
            [JUST_ABOVE_MIN_CHROMA, 0.4],
          ]),
        ),
      ).toEqual({ primary: JUST_ABOVE_MIN_CHROMA, neutral: JUST_BELOW_MIN_CHROMA });

      // As the secondary: both are far enough in hue from the primary, but only one has chroma.
      expect(hueDistance(HUE_PRIMARY, JUST_BELOW_MIN_CHROMA)).toBeGreaterThan(MIN_HUE_DISTANCE);
      expect(hueDistance(HUE_PRIMARY, JUST_ABOVE_MIN_CHROMA)).toBeGreaterThan(MIN_HUE_DISTANCE);
      expect(
        seedsFromColorExtractor(
          extractorResult([
            [HUE_PRIMARY, 0.5],
            [JUST_BELOW_MIN_CHROMA, 0.3],
            [JUST_ABOVE_MIN_CHROMA, 0.2],
          ]),
        ),
      ).toEqual({ primary: HUE_PRIMARY, secondary: JUST_ABOVE_MIN_CHROMA, neutral: HUE_PRIMARY });
    });

    it("takes a secondary at the hue distance and skips one just short of it, measured with Color.js", () => {
      for (let index = 0; index < 2; index++) {
        const past = JUST_PAST_HUE_DISTANCE[index]!;
        const short = JUST_SHORT_OF_HUE_DISTANCE[index]!;
        for (const hex of [HUE_PRIMARY, past, short]) {
          expect(measure(hex).chroma).toBeGreaterThan(0.1);
        }
        expect(hueDistance(HUE_PRIMARY, past)).toBeGreaterThan(MIN_HUE_DISTANCE + HUE_TOLERANCE);
        expect(hueDistance(HUE_PRIMARY, past)).toBeLessThan(MIN_HUE_DISTANCE + 0.01);
        expect(hueDistance(HUE_PRIMARY, short)).toBeLessThan(MIN_HUE_DISTANCE - HUE_TOLERANCE);
        expect(hueDistance(HUE_PRIMARY, short)).toBeGreaterThan(MIN_HUE_DISTANCE - 0.01);

        expect(
          seedsFromColorExtractor(
            extractorResult([
              [HUE_PRIMARY, 0.2],
              [short, 0.3],
              [past, 0.1],
              ["#ffffff", 0.4],
            ]),
          ),
        ).toEqual({ primary: HUE_PRIMARY, secondary: past, neutral: "#ffffff" });
        expect(
          seedsFromColorExtractor(
            extractorResult([
              [HUE_PRIMARY, 0.5],
              [short, 0.5],
            ]),
          ),
        ).toEqual({ primary: HUE_PRIMARY, neutral: HUE_PRIMARY });
      }
    });

    it("takes the first color that qualifies as the secondary, not the farthest in hue", () => {
      // The blue is about 122° from the red; a cyan or green later in the result is not preferred.
      expect(
        seedsFromColorExtractor(
          extractorResult([
            [RED, 0.3],
            [BLUE, 0.2],
            ["#00a3a3", 0.2],
            ["#2e9e3e", 0.3],
          ]),
        ),
      ).toEqual({ primary: RED, secondary: BLUE, neutral: RED });
    });

    it("leaves the secondary out when no other color has enough chroma and a different hue", () => {
      const seeds = seedsFromColorExtractor(
        extractorResult([
          [RED, 0.3],
          [SKIN, 0.2],
          ["#e8742a", 0.1],
          [PAPER, 0.4],
        ]),
      );
      expect(seeds).toEqual({ primary: RED, neutral: PAPER });
      expect(Object.keys(seeds)).toEqual(["primary", "neutral"]);
    });

    it("takes the largest coverage as the neutral, and the first one in the result on a tie", () => {
      expect(
        seedsFromColorExtractor(
          extractorResult([
            [RED, 0.3],
            [BLUE, 0.3],
            [PAPER, 0.3],
            [INK, 0.1],
          ]),
        ).neutral,
      ).toBe(RED);
      expect(
        seedsFromColorExtractor(
          extractorResult([
            [RED, 0.2],
            [PAPER, 0.4],
            [INK, 0.4],
          ]),
        ).neutral,
      ).toBe(PAPER);
      expect(
        seedsFromColorExtractor(
          extractorResult([
            [RED, 0],
            [INK, 0],
          ]),
        ),
      ).toEqual({ primary: RED, neutral: RED });
    });

    it("gives the neutral theme for a black-and-white cover", () => {
      const seeds = seedsFromColorExtractor(
        extractorResult([
          ["#121212", 0.3],
          ["#fafafa", 0.5],
          ["#7a7a7a", 0.1],
          ["#b5b5b5", 0.06],
          [JUST_BELOW_MIN_CHROMA, 0.04],
        ]),
      );
      expect(seeds).toEqual({ primary: "#121212", neutral: "#fafafa" });
      const scheme = createColorScheme(seeds);
      expect(scheme.seeds.secondary.source).toBe("derived");
      for (const mode of MODES) {
        for (const role of ACCENT_ROLES) {
          expect(isGray(scheme[mode][role])).toBe(true);
        }
      }
      // Near black in light mode, already darker than the accent; near white in dark mode.
      expect(scheme.light.primary).toBe("#121212");
      expect(scheme.dark.primary).toBe(ACHROMATIC_ACCENT.dark);
    });

    it("gives neutral accents just below the chroma minimum, and a hue just above it", () => {
      // Without a chromatic color, the first color is the primary, and createColorScheme treats it
      // as achromatic; a color just above the minimum is chromatic for both.
      const below = createColorScheme(
        seedsFromColorExtractor(extractorResult([[JUST_BELOW_MIN_CHROMA, 1]])),
      );
      expect(below.seeds.primary.hex).toBe(JUST_BELOW_MIN_CHROMA);
      expect(below.light.primary).toBe(ACHROMATIC_ACCENT.light);
      expect(below.dark.primary).toBe(ACHROMATIC_ACCENT.dark);

      const above = createColorScheme(
        seedsFromColorExtractor(extractorResult([[JUST_ABOVE_MIN_CHROMA, 1]])),
      );
      expect(above.seeds.primary.hex).toBe(JUST_ABOVE_MIN_CHROMA);
      for (const mode of MODES) {
        expect(above[mode].primary).not.toBe(ACHROMATIC_ACCENT[mode]);
        expect(isGray(above[mode].primary)).toBe(false);
      }
    });

    it("returns lowercase #rrggbb seeds, in the order primary, secondary, neutral", () => {
      const seeds = seedsFromColorExtractor(
        extractorResult([
          ["#FBF8F3", 0.5],
          ["#C8102E", 0.3],
          ["#1f4E9C", 0.2],
        ]),
      );
      expect(seeds).toEqual({ primary: RED, secondary: BLUE, neutral: PAPER });
      expect(Object.keys(seeds)).toEqual(["primary", "secondary", "neutral"]);
    });

    it("gives valid input for createColorScheme, and the scheme is built", () => {
      const results: ColorExtractorResult[] = [
        extractorResult(PERCEPTUAL),
        extractorResult(POPULATION, "population"),
        extractorResult([
          ["#121212", 0.3],
          ["#fafafa", 0.7],
        ]),
        extractorResult([[JUST_ABOVE_MIN_CHROMA, 1]]),
      ];
      for (const result of results) {
        const seeds: Seeds = seedsFromColorExtractor(result);
        const scheme = createColorScheme(seeds);
        expect(guaranteeFailures(scheme)).toEqual([]);
        for (const name of ["primary", "secondary", "neutral"] as const) {
          const seed = seeds[name];
          if (seed === undefined) {
            expect(scheme.seeds[name].source).toBe("derived");
          } else {
            expect(seed).toMatch(/^#[0-9a-f]{6}$/);
            expect(scheme.seeds[name]).toEqual({ hex: seed, source: "given" });
          }
        }
      }
    });

    it("reads only schemaVersion, hex, and coverage, and runs own getters", () => {
      const minimal = {
        schemaVersion: 1,
        colors: PERCEPTUAL.map(([hex, coverage]) => ({ hex, coverage })),
      };
      expect(seedsFromColorExtractor(minimal)).toEqual(
        seedsFromColorExtractor(extractorResult(PERCEPTUAL)),
      );
      // Own getters run like any other own property.
      const withGetters = {
        get schemaVersion(): number {
          return 1;
        },
        get colors(): ColorExtractorResult["colors"] {
          return [
            {
              get hex(): string {
                return BLUE;
              },
              coverage: 1,
            },
          ];
        },
      };
      expect(seedsFromColorExtractor(withGetters)).toEqual({ primary: BLUE, neutral: BLUE });
    });

    it("gives equal, new seeds for the same result, and does not change it", () => {
      const result = extractorResult(PERCEPTUAL);
      const copy = structuredClone(result);
      Object.freeze(result);
      for (const color of result.colors) Object.freeze(color);
      const first = seedsFromColorExtractor(result);
      const second = seedsFromColorExtractor(result);
      expect(second).toEqual(first);
      expect(second).not.toBe(first);
      expect(result).toEqual(copy);
    });
  });

  describe("seedsFromColorExtractor: errors (spec 7.5)", () => {
    it("gives INVALID_INPUT for a result that is not an object", () => {
      const cases: Array<[unknown, string]> = [
        [null, "null"],
        [undefined, "type undefined"],
        ["#ff0000", "type string"],
        [1, "type number"],
        [[{ hex: RED, coverage: 1 }], "an array"],
        [() => extractorResult(PERCEPTUAL), "type function"],
      ];
      for (const [input, kind] of cases) {
        expectInvalid(input, `The color-extractor result must be an object, received ${kind}.`);
      }
    });

    it("gives INVALID_INPUT for a schemaVersion that is missing or not a number", () => {
      const cases: Array<[unknown, string]> = [
        [{ colors: [VALID] }, "type undefined"],
        [{ schemaVersion: undefined, colors: [VALID] }, "type undefined"],
        [{ schemaVersion: null, colors: [VALID] }, "null"],
        [{ schemaVersion: "1", colors: [VALID] }, "type string"],
        [{ schemaVersion: 1n, colors: [VALID] }, "type bigint"],
        [{ schemaVersion: [1], colors: [VALID] }, "an array"],
      ];
      for (const [input, kind] of cases) {
        expectInvalid(
          input,
          `The schemaVersion of the color-extractor result must be a number, received ${kind}.`,
        );
      }
    });

    it("gives UNSUPPORTED_SCHEMA for any other version, whatever the shape of the result", () => {
      for (const version of [2, 0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        const error = failure({ schemaVersion: version, colors: [VALID] }, "UNSUPPORTED_SCHEMA");
        expect(error.message).toBe(
          `The color-extractor result has schemaVersion ${version}; only version 1 is supported.`,
        );
        expect("cause" in error).toBe(false);
      }
      // A version-2 result with a new shape, or with no colors, is still UNSUPPORTED_SCHEMA.
      failure({ schemaVersion: 2, palette: [{ hex: RED }] }, "UNSUPPORTED_SCHEMA");
      failure({ schemaVersion: 2, colors: [] }, "UNSUPPORTED_SCHEMA");
      failure({ schemaVersion: 2, colors: [{ hex: "red" }] }, "UNSUPPORTED_SCHEMA");
    });

    it("gives INVALID_INPUT for colors that are missing or not an array", () => {
      const cases: Array<[unknown, string]> = [
        [{ schemaVersion: 1 }, "type undefined"],
        [{ schemaVersion: 1, colors: null }, "null"],
        [{ schemaVersion: 1, colors: { 0: VALID, length: 1 } }, "type object"],
        [{ schemaVersion: 1, colors: RED }, "type string"],
      ];
      for (const [input, kind] of cases) {
        expectInvalid(
          input,
          `The colors of the color-extractor result must be an array, received ${kind}.`,
        );
      }
    });

    it("gives NO_COLORS for a result with no colors", () => {
      const error = failure({ ...extractorResult([]), colors: [] }, "NO_COLORS");
      expect(error.message).toBe("The color-extractor result has no colors.");
      expect("cause" in error).toBe(false);
    });

    it("gives INVALID_INPUT for a color that is not an object, naming its index", () => {
      const cases: Array<[unknown, string]> = [
        [null, "null"],
        [undefined, "type undefined"],
        [RED, "type string"],
        [[RED, 1], "an array"],
      ];
      for (const [color, kind] of cases) {
        expectInvalid(
          { schemaVersion: 1, colors: [VALID, color] },
          `colors[1] must be an object, received ${kind}.`,
        );
      }
      // A hole in a sparse array reads as undefined.
      const sparse: unknown[] = [VALID];
      sparse[2] = VALID;
      expect(1 in sparse).toBe(false);
      expectInvalid(
        { schemaVersion: 1, colors: sparse },
        "colors[1] must be an object, received type undefined.",
      );
    });

    it("gives INVALID_INPUT for a hex that is not exactly #RRGGBB", () => {
      const wrongType: Array<[unknown, string]> = [
        [undefined, "type undefined"],
        [null, "null"],
        [0xc8102e, "type number"],
        [[RED], "an array"],
      ];
      for (const [hex, kind] of wrongType) {
        expectInvalid(
          { schemaVersion: 1, colors: [{ hex, coverage: 0.5 }] },
          `colors[0].hex must be a hex color string, received ${kind}.`,
        );
      }
      expectInvalid(
        { schemaVersion: 1, colors: [{ coverage: 0.5 }] },
        "colors[0].hex must be a hex color string, received type undefined.",
      );
      for (const hex of [
        "#c81",
        "#c8102eff",
        "#c810",
        "c8102e",
        "#c8102g",
        " #c8102e",
        "#c8102e ",
        "red",
        "",
      ]) {
        expectInvalid(
          { schemaVersion: 1, colors: [VALID, { hex, coverage: 0.5 }] },
          "colors[1].hex is not a #RRGGBB hex color.",
        );
      }
    });

    it("gives INVALID_INPUT for a coverage that is missing or not a number from 0 to 1", () => {
      const wrongType: Array<[unknown, string]> = [
        [undefined, "type undefined"],
        [null, "null"],
        ["0.5", "type string"],
      ];
      for (const [coverage, kind] of wrongType) {
        expectInvalid(
          { schemaVersion: 1, colors: [{ hex: RED, coverage }] },
          `colors[0].coverage must be a number, received ${kind}.`,
        );
      }
      expectInvalid(
        { schemaVersion: 1, colors: [{ hex: RED }] },
        "colors[0].coverage must be a number, received type undefined.",
      );
      for (const coverage of [-0.1, 1.0000001, Number.NaN, Number.POSITIVE_INFINITY, -1]) {
        expectInvalid(
          { schemaVersion: 1, colors: [VALID, VALID, { hex: RED, coverage }] },
          "colors[2].coverage is not a number from 0 to 1.",
        );
      }
      // The limits themselves are valid.
      expect(
        seedsFromColorExtractor({
          schemaVersion: 1,
          colors: [
            { hex: RED, coverage: 0 },
            { hex: BLUE, coverage: 1 },
          ],
        }),
      ).toEqual({ primary: RED, secondary: BLUE, neutral: BLUE });
    });

    it("runs the checks in a fixed order", () => {
      // The object, then schemaVersion, then colors, then each color in order: hex, then coverage.
      expectInvalid(
        { schemaVersion: "2", colors: null },
        "The schemaVersion of the color-extractor result must be a number, received type string.",
      );
      failure({ schemaVersion: 3, colors: null }, "UNSUPPORTED_SCHEMA");
      failure({ schemaVersion: 1, colors: [] }, "NO_COLORS");
      expectInvalid(
        { schemaVersion: 1, colors: [{ hex: "red", coverage: -1 }] },
        "colors[0].hex is not a #RRGGBB hex color.",
      );
      expectInvalid(
        {
          schemaVersion: 1,
          colors: [
            { hex: RED, coverage: 2 },
            { hex: "red", coverage: 0.5 },
          ],
        },
        "colors[0].coverage is not a number from 0 to 1.",
      );
      // Every color is checked before any seed is picked, so a bad last color is never ignored.
      expectInvalid(
        { schemaVersion: 1, colors: [VALID, { hex: BLUE, coverage: 0.2 }, { hex: PAPER }] },
        "colors[2].coverage must be a number, received type undefined.",
      );
    });

    it.each([NaN, -1, 1.5, 2 ** 53])(
      "rejects an invalid colors.length of %s without a cause",
      (length) => {
        const colors = new Proxy([], {
          get(target, key, receiver): unknown {
            return key === "length" ? length : Reflect.get(target, key, receiver);
          },
        });
        expectInvalid(
          { schemaVersion: 1, colors },
          "The colors of the color-extractor result must have a nonnegative safe-integer length.",
        );
      },
    );

    it("wraps every error thrown while reading colors.length, including a caller's ColorSchemeError", () => {
      for (const cause of [
        new ColorSchemeError("NO_COLORS", "length failure"),
        undefined,
        "failure",
      ]) {
        const colors = new Proxy([], {
          get(): never {
            throw cause;
          },
        });
        expect(expectUnreadable({ schemaVersion: 1, colors }).cause).toBe(cause);
      }
    });

    it("gives INVALID_INPUT, with the original as cause, for a getter that throws", () => {
      const cause = new TypeError("getter failure");
      const throwing = (): never => {
        throw cause;
      };
      // Own enumerable getters, the only kind of getter that is read.
      const getter = { get: throwing, enumerable: true };
      const inputs: unknown[] = [
        Object.defineProperty({ colors: [VALID] }, "schemaVersion", getter),
        Object.defineProperty({ schemaVersion: 1 }, "colors", getter),
        { schemaVersion: 1, colors: Object.defineProperty([VALID, VALID], "1", getter) },
        {
          schemaVersion: 1,
          colors: [VALID, Object.defineProperty({ coverage: 0.5 }, "hex", getter)],
        },
        {
          schemaVersion: 1,
          colors: [Object.defineProperty({ hex: RED }, "coverage", getter)],
        },
      ];
      for (const input of inputs) {
        expect(expectUnreadable(input).cause).toBe(cause);
      }
    });

    it("gives INVALID_INPUT, with the original as cause, for a proxy that throws or is revoked", () => {
      const cause = new RangeError("get failure");
      // Proxies of objects that have the keys, so the own-key check passes and `get` runs.
      const throwingGet = (target: object): object =>
        new Proxy(target, {
          get(): never {
            throw cause;
          },
        });
      expect(expectUnreadable(throwingGet(extractorResult(PERCEPTUAL))).cause).toBe(cause);
      expect(
        expectUnreadable({ schemaVersion: 1, colors: [throwingGet({ ...VALID })] }).cause,
      ).toBe(cause);
      // The own-key check itself asks the proxy for a property descriptor.
      const throwingDescriptor = new Proxy(extractorResult(PERCEPTUAL), {
        getOwnPropertyDescriptor(): never {
          throw cause;
        },
      });
      expect(expectUnreadable(throwingDescriptor).cause).toBe(cause);
      const colors = new Proxy([VALID], {
        get(target, key, receiver): unknown {
          if (key === "0") throw cause;
          return Reflect.get(target, key, receiver) as unknown;
        },
      });
      expect(expectUnreadable({ schemaVersion: 1, colors }).cause).toBe(cause);

      const revocable = (target: object): object => {
        const { proxy, revoke } = Proxy.revocable(target, {});
        revoke();
        return proxy;
      };
      for (const input of [
        revocable(extractorResult(PERCEPTUAL)),
        { schemaVersion: 1, colors: revocable([VALID]) },
        { schemaVersion: 1, colors: [VALID, revocable({ ...VALID })] },
      ]) {
        expect(expectUnreadable(input).cause).toBeInstanceOf(TypeError);
      }
    });

    it("does not read inherited properties", () => {
      const result = extractorResult(PERCEPTUAL);
      // A prototype that supplies the whole result, or one of its keys.
      expectInvalid(
        Object.create(result),
        "The schemaVersion of the color-extractor result must be a number, received type undefined.",
      );
      expectInvalid(
        { colors: result.colors, __proto__: { schemaVersion: 1 } },
        "The schemaVersion of the color-extractor result must be a number, received type undefined.",
      );
      expectInvalid(
        { schemaVersion: 1, __proto__: { colors: result.colors } },
        "The colors of the color-extractor result must be an array, received type undefined.",
      );
      // A color that inherits its hex or its coverage.
      expectInvalid(
        { schemaVersion: 1, colors: [VALID, Object.create(VALID)] },
        "colors[1].hex must be a hex color string, received type undefined.",
      );
      expectInvalid(
        { schemaVersion: 1, colors: [{ hex: RED, __proto__: { coverage: 0.5 } }] },
        "colors[0].coverage must be a number, received type undefined.",
      );
      // Keys found on Object.prototype and Array.prototype.
      const object = Object.prototype as unknown as Record<string, unknown>;
      const array = Array.prototype as unknown as Record<string, unknown>;
      try {
        object["schemaVersion"] = 1;
        object["colors"] = [VALID];
        object["hex"] = RED;
        object["coverage"] = 0.5;
        array["1"] = VALID;
        expectInvalid(
          {},
          "The schemaVersion of the color-extractor result must be a number, received type undefined.",
        );
        expectInvalid(
          { schemaVersion: 1 },
          "The colors of the color-extractor result must be an array, received type undefined.",
        );
        expectInvalid(
          { schemaVersion: 1, colors: [{ coverage: 0.5 }] },
          "colors[0].hex must be a hex color string, received type undefined.",
        );
        expectInvalid(
          { schemaVersion: 1, colors: [{ hex: RED }] },
          "colors[0].coverage must be a number, received type undefined.",
        );
        // A hole in a sparse array is not filled from Array.prototype.
        const sparse: unknown[] = [VALID];
        sparse[2] = VALID;
        expectInvalid(
          { schemaVersion: 1, colors: sparse },
          "colors[1] must be an object, received type undefined.",
        );
      } finally {
        delete object["schemaVersion"];
        delete object["colors"];
        delete object["hex"];
        delete object["coverage"];
        delete array["1"];
      }
      expect("hex" in {}).toBe(false);
      expect(1 in [VALID]).toBe(false);
    });

    it("does not read non-enumerable own properties", () => {
      const hidden = (object: object, key: string, value: unknown): object =>
        Object.defineProperty(object, key, { value, enumerable: false });
      expectInvalid(
        hidden({ colors: [VALID] }, "schemaVersion", 1),
        "The schemaVersion of the color-extractor result must be a number, received type undefined.",
      );
      expectInvalid(
        hidden({ schemaVersion: 1 }, "colors", [VALID]),
        "The colors of the color-extractor result must be an array, received type undefined.",
      );
      expectInvalid(
        { schemaVersion: 1, colors: [hidden({ coverage: 0.5 }, "hex", RED)] },
        "colors[0].hex must be a hex color string, received type undefined.",
      );
      expectInvalid(
        { schemaVersion: 1, colors: [hidden({ hex: RED }, "coverage", 0.5)] },
        "colors[0].coverage must be a number, received type undefined.",
      );
      expectInvalid(
        { schemaVersion: 1, colors: hidden([VALID, VALID], "1", VALID) },
        "colors[1] must be an object, received type undefined.",
      );
    });

    it("wraps a caller's ColorSchemeError from a getter as INVALID_INPUT with its cause", () => {
      const thrown = new ColorSchemeError("NO_COLORS", "from a getter");
      const input: unknown = Object.defineProperty({ schemaVersion: 1 }, "colors", {
        get(): never {
          throw thrown;
        },
        enumerable: true,
      });
      expect(expectUnreadable(input).cause).toBe(thrown);
    });

    it("accepts a proxy that only reads through, like a plain result", () => {
      const result = extractorResult(PERCEPTUAL);
      expect(seedsFromColorExtractor(new Proxy(result, {}))).toEqual(
        seedsFromColorExtractor(result),
      );
    });
  });
}
