import { ColorSchemeError } from "@/errors.js";
import { parseHex } from "@/color/hex.js";
import { srgbToOklab } from "@/color/oklab.js";
import { inputError, isArray, isRecord, kindOf, readInput, readOwn } from "@/input.js";
import { ACHROMATIC_CHROMA } from "@/scheme/derive.js";
import { NEUTRAL_CHROMA_CAP } from "@/scheme/neutral.js";
import type { ColorExtractorResult, Seeds } from "@/types.js";

/**
 * Oklab chroma, √(a² + b²) of the 8-bit color, from which a color of the result has enough chroma
 * to be the `primary` or the `secondary`; below it, the color counts as a white, black, or gray.
 * Unit: Oklab chroma. It equals `ACHROMATIC_CHROMA` on purpose, and both are measured with the
 * same conversion on the same 8-bit color, so the two rules never disagree: a `primary` picked
 * for its chroma is never achromatic for `createColorScheme`, and when no color reaches this
 * value, the first color, which becomes the `primary`, is achromatic there, which gives the
 * neutral theme. On the 84 evaluation covers of `color-extractor`, perceptual order gives the same
 * `primary` with any value from 0.02 to 0.032 (81 of 84 up to 0.05). A higher value would skip more near-blacks, whose
 * chroma is mostly noise (up to about 0.03 for `#020002`), but would break the rule above for a
 * result whose first color falls between the two values. Changing this value changes
 * `algorithmVersion`, because the seeds and therefore the colors change.
 */
export const SEED_MIN_CHROMA: number = ACHROMATIC_CHROMA;

/**
 * Smallest hue difference between the `secondary` and the `primary`. Unit: degrees, the angle
 * between their Oklab (a, b) directions, which is their OKLCH hue difference. 45° is past the range
 * of analogous colors: closer pairs, such as a red and a skin tone or two blues, read as one hue
 * family, and the derived `secondary`, which keeps the primary's hue, serves them as well. On the
 * evaluation covers in perceptual order, the next chromatic color is within 30° of the primary in
 * 23 of 82 covers, and only 3 fall between 30° and 45°. The comparison uses
 * {@link SECONDARY_MAX_HUE_COSINE}, with no trigonometry. Changing this value changes
 * `algorithmVersion`, because the seeds and therefore the colors change.
 */
export const SECONDARY_MIN_HUE_DISTANCE = 45;

/**
 * Cosine of {@link SECONDARY_MIN_HUE_DISTANCE}, precomputed: √2 / 2, as the closest double. A
 * color's hue is at least that far from the primary's when the cosine of the angle between their
 * (a, b) directions, their dot product divided by the product of their chromas, is at most this
 * value.
 */
export const SECONDARY_MAX_HUE_COSINE = 0.7071067811865476;

/** A color of the result after validation. */
interface ResultColor {
  /** Lowercase `#rrggbb` hex color. */
  readonly hex: string;
  /** Share of the image, from 0 to 1. */
  readonly coverage: number;
}

/** A color with enough chroma, with its Oklab a, b, and chroma. */
interface ChromaticColor {
  readonly hex: string;
  readonly a: number;
  readonly b: number;
  readonly chroma: number;
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function invalidInput(message: string): ColorSchemeError {
  return new ColorSchemeError("INVALID_INPUT", message);
}

/**
 * Picks the seeds from a `@adzazueta/color-extractor` result, synchronously, for
 * `createColorScheme`. A result from `color-extractor` can be passed as is; only `schemaVersion`
 * and each color's `hex` and `coverage` are read.
 *
 * **Selection.** Colors are read in the order of the result, so the selection works with both
 * extraction modes; `perceptual`, which puts the colors that stand out first, is recommended:
 *
 * - `primary`: the first color with enough chroma, so not a white, black, or gray: an Oklab chroma
 *   of at least 0.02, the same limit below which `createColorScheme` treats a `primary` as
 *   achromatic.
 * - `secondary`: the next color with enough chroma whose hue is at least 45° from the primary's
 *   (the angle between their Oklab a-b directions, which is their OKLCH hue difference). It is left
 *   out when there is none, so `createColorScheme` derives it from `primary`, with its hue.
 * - `neutral`: the color with the largest `coverage`; on a tie, the first one in the result,
 *   only when its Oklab chroma is at most {@link NEUTRAL_CHROMA_CAP} (0.04), measured with the
 *   same conversion on the same 8-bit color as the surface cap. Otherwise it is left out, so
 *   `createColorScheme` derives a faint tint from `primary`. No other color is tried.
 *
 * When no color has enough chroma, such as on a black-and-white cover, `primary` is the first color
 * and `secondary` is left out. That `primary` is achromatic for `createColorScheme`, which gives the
 * neutral theme: neutral accents, near black in light mode and near white in dark mode.
 *
 * The seeds are lowercase `#rrggbb` hex colors from the result, with only the keys that have a
 * value, in the order `primary`, `secondary`, `neutral`. They are valid input for
 * `createColorScheme`. Deterministic: only basic arithmetic and `Math.sqrt`, with no trigonometry.
 *
 * **Validation.** The input is not trusted to match `ColorExtractorResult`. Checks run in a fixed
 * order, so the same input always gives the same error:
 *
 * 1. The result must be an object: not `null`, an array, a function, or a primitive.
 * 2. `schemaVersion` must be a number, and then exactly 1. It is checked before `colors`, so a
 *    result of another version gives `UNSUPPORTED_SCHEMA` whatever its shape.
 * 3. `colors` must be an array with a nonnegative safe-integer length, and then not empty.
 * 4. Each color, in the order of the result: an object (not `null` or an array), then `hex` a
 *    string with exactly `#RRGGBB` in any letter case (not `#RGB`, and no alpha), then `coverage`
 *    a number from 0 to 1. Every color is checked before any seed is picked.
 *
 * Only own enumerable properties are read, as `createColorScheme` reads seeds: `schemaVersion`,
 * `colors`, each item of `colors`, and each color's `hex` and `coverage`. An inherited or
 * non-enumerable property counts as missing, so a hole in `colors` is never filled from a
 * prototype; an own getter runs. Every other field of the result is ignored. Error messages never
 * echo a string from the input.
 *
 * @param result - A `color-extractor` result with `schemaVersion` 1.
 * @returns The seeds: `primary`, and `secondary` and `neutral` only when they qualify.
 * @throws {ColorSchemeError} `INVALID_INPUT` when the result is not valid: a check above fails,
 *   other than the version number or an empty list. Also when it cannot be read, such as a getter
 *   or proxy that throws, including a caller's `ColorSchemeError`: the message is then "The
 *   color-extractor result could not be read." and the original error is the `cause`.
 * @throws {ColorSchemeError} `UNSUPPORTED_SCHEMA` when `schemaVersion` is a number other than 1.
 * @throws {ColorSchemeError} `NO_COLORS` when `colors` is empty, as for a fully transparent image.
 *   It is a normal case, so applications can use their fallback theme.
 * @throws {ColorSchemeError} `PROCESSING_FAILED` for an unexpected internal failure, a bug in the
 *   package, with the original error as `cause`.
 */
export function seedsFromColorExtractor(result: ColorExtractorResult): Seeds {
  // Marked input reads become INVALID_INPUT, including the caller's own ColorSchemeError.
  // The package's validation errors retain their codes and messages.
  let colors: readonly ResultColor[];
  try {
    colors = readResult(result);
  } catch (error) {
    throw inputError(error, "The color-extractor result could not be read.");
  }
  try {
    return selectSeeds(colors);
  } catch (error) {
    throw new ColorSchemeError("PROCESSING_FAILED", "Seed selection failed unexpectedly.", {
      cause: error,
    });
  }
}

/** Validates the result and returns its colors, each with a lowercase hex color. */
function readResult(input: unknown): ResultColor[] {
  if (!isRecord(input)) {
    throw invalidInput(`The color-extractor result must be an object, received ${kindOf(input)}.`);
  }

  const schemaVersion = readOwn(input, "schemaVersion");
  if (typeof schemaVersion !== "number") {
    throw invalidInput(
      `The schemaVersion of the color-extractor result must be a number, received ${kindOf(schemaVersion)}.`,
    );
  }
  if (schemaVersion !== 1) {
    throw new ColorSchemeError(
      "UNSUPPORTED_SCHEMA",
      `The color-extractor result has schemaVersion ${schemaVersion}; only version 1 is supported.`,
    );
  }

  const colors = readOwn(input, "colors");
  if (!isArray(colors)) {
    throw invalidInput(
      `The colors of the color-extractor result must be an array, received ${kindOf(colors)}.`,
    );
  }
  const list: readonly unknown[] = colors;
  // `length` is an own key of every array, but not enumerable, so it is read directly.
  const length = readInput(() => list.length);
  if (!Number.isSafeInteger(length) || length < 0) {
    throw invalidInput(
      "The colors of the color-extractor result must have a nonnegative safe-integer length.",
    );
  }
  const read: ResultColor[] = [];
  for (let index = 0; index < length; index++) {
    read.push(readColor(readOwn(list, String(index)), index));
  }
  if (read.length === 0) {
    throw new ColorSchemeError("NO_COLORS", "The color-extractor result has no colors.");
  }
  return read;
}

/** Validates one color of the result. */
function readColor(value: unknown, index: number): ResultColor {
  const name = `colors[${index}]`;
  if (!isRecord(value)) {
    throw invalidInput(`${name} must be an object, received ${kindOf(value)}.`);
  }

  const hex = readOwn(value, "hex");
  if (typeof hex !== "string") {
    throw invalidInput(`${name}.hex must be a hex color string, received ${kindOf(hex)}.`);
  }
  if (!HEX_COLOR.test(hex)) {
    throw invalidInput(`${name}.hex is not a #RRGGBB hex color.`);
  }

  const coverage = readOwn(value, "coverage");
  if (typeof coverage !== "number") {
    throw invalidInput(`${name}.coverage must be a number, received ${kindOf(coverage)}.`);
  }
  if (!(coverage >= 0 && coverage <= 1)) {
    throw invalidInput(`${name}.coverage is not a number from 0 to 1.`);
  }
  return { hex: hex.toLowerCase(), coverage };
}

/** Picks the seeds from validated colors, in the order of the result. */
function selectSeeds(colors: readonly ResultColor[]): Seeds {
  let primary: ChromaticColor | undefined;
  let secondary: string | undefined;
  for (const color of colors) {
    const rgb = parseHex(color.hex);
    const { a, b } = srgbToOklab(rgb.r, rgb.g, rgb.b);
    // The same chroma, from the same conversion, as `deriveSeeds` measures for `primary`.
    const chroma = Math.sqrt(a * a + b * b);
    if (chroma < SEED_MIN_CHROMA) continue;
    if (primary === undefined) {
      primary = { hex: color.hex, a, b, chroma };
    } else if (
      // cos(angle) = dot / (chroma × chroma) ≤ cos(minimum distance), without dividing; both
      // chromas are at least SEED_MIN_CHROMA, so neither is 0.
      a * primary.a + b * primary.b <=
      SECONDARY_MAX_HUE_COSINE * (primary.chroma * chroma)
    ) {
      secondary = color.hex;
      break;
    }
  }

  // Strictly larger, in the order of the result, so a tie goes to the first color.
  let neutral = colors[0]!;
  for (const color of colors) {
    if (color.coverage > neutral.coverage) neutral = color;
  }

  const rgb = parseHex(neutral.hex);
  const { a, b } = srgbToOklab(rgb.r, rgb.g, rgb.b);
  const withinCap = Math.sqrt(a * a + b * b) <= NEUTRAL_CHROMA_CAP;
  // Add keys in public order, omitting those that do not qualify.
  return {
    primary: primary?.hex ?? colors[0]!.hex,
    ...(secondary === undefined ? {} : { secondary }),
    ...(withinCap ? { neutral: neutral.hex } : {}),
  };
}
