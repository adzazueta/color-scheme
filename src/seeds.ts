import { ColorSchemeError } from "@/errors.js";

/** Seeds after validation: every given seed is a lowercase `#rrggbb` hex color. */
export interface NormalizedSeeds {
  primary: string;
  /** `undefined` when the seed was omitted or given as `undefined`. */
  secondary: string | undefined;
  /** `undefined` when the seed was omitted or given as `undefined`. */
  neutral: string | undefined;
}

const SEED_NAMES: readonly string[] = ["primary", "secondary", "neutral"];
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const HEX_WITH_ALPHA = /^#(?:[0-9a-fA-F]{4}|[0-9a-fA-F]{8})$/;

function invalidInput(message: string): ColorSchemeError {
  return new ColorSchemeError("INVALID_INPUT", message);
}

/** Names the kind of a value for error messages, without echoing the value. */
function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return `type ${typeof value}`;
}

/** Validates one seed value and returns it as a lowercase `#rrggbb` hex color. */
function normalizeHex(name: string, value: unknown): string {
  if (typeof value !== "string") {
    throw invalidInput(`Seed "${name}" must be a hex color string, received ${describe(value)}.`);
  }
  if (HEX_WITH_ALPHA.test(value)) {
    throw invalidInput(
      `Seed "${name}" has an alpha channel; seeds must be opaque #RRGGBB or #RGB colors.`,
    );
  }
  if (!HEX_COLOR.test(value)) {
    throw invalidInput(`Seed "${name}" is not a #RRGGBB or #RGB hex color.`);
  }
  const digits = value.slice(1).toLowerCase();
  if (digits.length === 3) {
    const [r, g, b] = digits;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return `#${digits}`;
}

/**
 * Validates the seeds and returns them normalized: each given seed as a lowercase `#rrggbb` hex
 * color (a `#RGB` seed is expanded), and an omitted seed as `undefined`. JavaScript callers can
 * pass anything, so the input is not trusted to match the `Seeds` type.
 *
 * Checks run in a fixed order, so the same input always produces the same error:
 *
 * 1. The input must be an object: not `null`, an array, a function, or a primitive.
 * 2. Unknown seed names. When there are several, the first in code unit order is reported.
 * 3. `primary` must be present and not `undefined`.
 * 4. The value of each present seed, in the order `primary`, `secondary`, `neutral`: a string,
 *    then not `#RRGGBBAA` or `#RGBA` (alpha), then exactly `#RRGGBB` or `#RGB`, in any letter
 *    case. Whitespace is not trimmed.
 *
 * A seed whose value is `undefined` counts as omitted, but an unknown name is rejected whatever
 * its value. A value of `null` is invalid. Only own enumerable string keys count: inherited
 * properties, non-enumerable properties, and symbol keys are ignored. Error messages name the
 * seed and never echo the value; an unknown name is quoted, cut to 40 characters.
 *
 * @throws ColorSchemeError with code `INVALID_INPUT`.
 */
export function normalizeSeeds(input: unknown): NormalizedSeeds {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw invalidInput(`Seeds must be an object, received ${describe(input)}.`);
  }
  const seeds = input as Record<string, unknown>;
  const keys = Object.keys(seeds);

  const unknown = keys.filter((key) => !SEED_NAMES.includes(key)).sort();
  const firstUnknown = unknown[0];
  if (firstUnknown !== undefined) {
    throw invalidInput(
      `Unknown seed "${firstUnknown.length > 40 ? `${firstUnknown.slice(0, 40)}...` : firstUnknown}".`,
    );
  }

  const primary = keys.includes("primary") ? seeds["primary"] : undefined;
  if (primary === undefined) {
    throw invalidInput('Seed "primary" is required.');
  }

  const secondary = keys.includes("secondary") ? seeds["secondary"] : undefined;
  const neutral = keys.includes("neutral") ? seeds["neutral"] : undefined;
  return {
    primary: normalizeHex("primary", primary),
    secondary: secondary === undefined ? undefined : normalizeHex("secondary", secondary),
    neutral: neutral === undefined ? undefined : normalizeHex("neutral", neutral),
  };
}
