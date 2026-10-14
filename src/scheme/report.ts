import { ColorSchemeError } from "@/errors.js";
import { contrastRatio, lightnessDifference } from "@/color/contrast.js";
import { srgbToOklabInto } from "@/color/oklab.js";
import type { Srgb } from "@/color/types.js";
import type { NormalizedSeeds } from "@/seeds.js";
import type { ModeReport, PairReport, Role, SeedAdjustment } from "@/types.js";

/**
 * Minimum Oklab lightness difference of a text pair (specification 5.3), a parameter of
 * algorithm version 1 (section 4.1). A text pair is a pair whose foreground is an `on…` role.
 *
 * The guarantee is absolute (5.4), so the value must be one that black or white can always meet
 * together with the contrast minimum. Over all 16,777,216 8-bit backgrounds, the largest value
 * for which black or white always has a contrast of at least 4.5 + 0.005 (the minimum plus the
 * contrast margin) and this lightness difference is 0.3992855…, on the background `#b902fe`. The
 * value is set at 0.30, about 0.10 below that limit, so the lightness search keeps room to choose.
 * For `onSurface` (7:1) the surfaces are chosen by the package, near white or near black, where
 * black or white differs in lightness by much more.
 *
 * It matters most on dark and saturated backgrounds, where WCAG 2 is weakest: its luminance is
 * linear light plus a flat 0.05, which rates a dark blue as dark although it looks much lighter.
 * On `#0000ff`, a gray at exactly 4.5:1 differs in lightness by only about 0.34, and 0.30 keeps
 * every text pair clearly lighter or darker than its background by perceived lightness too.
 */
export const MIN_LIGHTNESS_DIFFERENCE = 0.3;

/** A guaranteed pair of specification 5.2, with the requirement that applies to it. */
export interface GuaranteedPair {
  /** Role drawn on top. */
  readonly foreground: Role;
  /** Role underneath. */
  readonly background: Role;
  /** Minimum WCAG 2.2 contrast ratio, without the contrast margin: 7, 4.5, or 3. */
  readonly minContrast: number;
  /**
   * Whether it is a text pair, which also needs {@link MIN_LIGHTNESS_DIFFERENCE}: its foreground
   * is an `on…` role.
   */
  readonly isText: boolean;
}

function pair(foreground: Role, background: Role, minContrast: number): GuaranteedPair {
  return { foreground, background, minContrast, isText: foreground.startsWith("on") };
}

/**
 * The 31 guaranteed pairs of specification 5.2, sorted by foreground and then by background, both
 * in the order of `Role`, which is the order of `ModeReport.pairs`. It is the same in every
 * scheme and in both modes, and the role construction modules read the minimums from it.
 * `outlineVariant` is decorative and has no pair.
 */
export const GUARANTEED_PAIRS: readonly GuaranteedPair[] = [
  pair("onSurface", "surface", 7),
  pair("onSurface", "surfaceContainerLow", 7),
  pair("onSurface", "surfaceContainer", 7),
  pair("onSurface", "surfaceContainerHigh", 7),
  pair("onSurfaceVariant", "surface", 4.5),
  pair("onSurfaceVariant", "surfaceContainerLow", 4.5),
  pair("onSurfaceVariant", "surfaceContainer", 4.5),
  pair("onSurfaceVariant", "surfaceContainerHigh", 4.5),
  pair("outline", "surface", 3),
  pair("outline", "surfaceContainerLow", 3),
  pair("outline", "surfaceContainer", 3),
  pair("outline", "surfaceContainerHigh", 3),
  pair("onInverseSurface", "inverseSurface", 4.5),
  pair("primary", "surface", 3),
  pair("onPrimary", "primary", 4.5),
  pair("onPrimaryContainer", "primaryContainer", 4.5),
  pair("secondary", "surface", 3),
  pair("onSecondary", "secondary", 4.5),
  pair("onSecondaryContainer", "secondaryContainer", 4.5),
  pair("error", "surface", 3),
  pair("onError", "error", 4.5),
  pair("onErrorContainer", "errorContainer", 4.5),
  pair("warning", "surface", 3),
  pair("onWarning", "warning", 4.5),
  pair("onWarningContainer", "warningContainer", 4.5),
  pair("success", "surface", 3),
  pair("onSuccess", "success", 4.5),
  pair("onSuccessContainer", "successContainer", 4.5),
  pair("info", "surface", 3),
  pair("onInfo", "info", 4.5),
  pair("onInfoContainer", "infoContainer", 4.5),
];

/** The color of every role in one mode, as 8-bit sRGB. */
export type ModeColors = Readonly<Record<Role, Srgb>>;

/** What the report needs to describe how one given seed appears in one mode. */
export interface SeedAdjustmentInput {
  /** Name of the seed. */
  readonly seed: "primary" | "secondary" | "neutral";
  /** The seed's color. */
  readonly seedColor: Srgb;
  /** Role that carries the seed in this mode. */
  readonly role: Role;
  /** Color of that role in this mode. */
  readonly roleColor: Srgb;
}

/** Scratch space for the Oklab conversion. The calls are synchronous, so sharing it is safe. */
const SCRATCH = new Float64Array(3);

function oklabLightness(color: Srgb): number {
  srgbToOklabInto(color.r, color.g, color.b, SCRATCH, 0);
  return SCRATCH[0]!;
}

/**
 * Builds the accessibility report of one mode (specification 5.5): every guaranteed pair with its
 * WCAG 2.2 contrast, not rounded, and its Oklab lightness difference, and one adjustment for
 * each given seed. It only measures: it does not check the minimums (see {@link verifyReports}).
 *
 * @param colors - The 34 role colors of the mode.
 * @param adjustments - One entry for each given seed, in the order `primary`, `secondary`, and
 *   `neutral`. Derived seeds are not listed.
 */
export function buildModeReport(
  colors: ModeColors,
  adjustments: readonly SeedAdjustmentInput[],
): ModeReport {
  const pairs: PairReport[] = [];
  for (const guaranteed of GUARANTEED_PAIRS) {
    const foreground = colors[guaranteed.foreground];
    const background = colors[guaranteed.background];
    pairs.push({
      foreground: guaranteed.foreground,
      background: guaranteed.background,
      minContrast: guaranteed.minContrast,
      contrast: contrastRatio(foreground, background),
      minLightnessDifference: guaranteed.isText ? MIN_LIGHTNESS_DIFFERENCE : null,
      lightnessDifference: lightnessDifference(foreground, background),
    });
  }

  const seeds: SeedAdjustment[] = [];
  for (const input of adjustments) {
    const { seedColor, roleColor } = input;
    seeds.push({
      seed: input.seed,
      role: input.role,
      exact:
        roleColor.r === seedColor.r && roleColor.g === seedColor.g && roleColor.b === seedColor.b,
      lightnessShift: oklabLightness(roleColor) - oklabLightness(seedColor),
    });
  }

  return { pairs, adjustments: seeds };
}

/**
 * Lists the failures of one mode, in the order of {@link GUARANTEED_PAIRS}: a pair missing from
 * the report or out of order, a contrast below the WCAG 2.2 minimum (without the contrast
 * margin), and, for a text pair, a lightness difference below {@link MIN_LIGHTNESS_DIFFERENCE}.
 * A value that is not a number fails.
 */
function modeFailures(mode: string, report: ModeReport, failures: string[]): void {
  for (let i = 0; i < GUARANTEED_PAIRS.length; i++) {
    const expected = GUARANTEED_PAIRS[i]!;
    const name = `${expected.foreground} on ${expected.background}`;
    const measured = report.pairs[i];
    if (
      measured === undefined ||
      measured.foreground !== expected.foreground ||
      measured.background !== expected.background
    ) {
      failures.push(`${mode} ${name}: missing from the report`);
      continue;
    }
    if (!(measured.contrast >= expected.minContrast)) {
      failures.push(`${mode} ${name}: contrast ${measured.contrast} < ${expected.minContrast}`);
    }
    if (expected.isText && !(measured.lightnessDifference >= MIN_LIGHTNESS_DIFFERENCE)) {
      failures.push(
        `${mode} ${name}: lightness difference ${measured.lightnessDifference} < ${MIN_LIGHTNESS_DIFFERENCE}`,
      );
    }
  }
}

/**
 * Verifies both reports before a scheme is returned (specification 7.6): every guaranteed pair
 * meets its WCAG 2.2 minimum, without the contrast margin, which is a construction target and not
 * the guarantee, and every text pair meets {@link MIN_LIGHTNESS_DIFFERENCE}. The check uses the
 * minimums of {@link GUARANTEED_PAIRS}, not the ones written in the reports.
 *
 * @param light - Report of the light mode.
 * @param dark - Report of the dark mode.
 * @param seeds - The normalized seeds of the scheme, named in the error so the failure can be
 *   reproduced.
 * @throws {ColorSchemeError} `PROCESSING_FAILED`, with a message that names the mode, each failing
 *   pair (light mode first, then dark mode, each in the order of `GUARANTEED_PAIRS`), and the
 *   seeds as lowercase hex.
 */
export function verifyReports(light: ModeReport, dark: ModeReport, seeds: NormalizedSeeds): void {
  const failures: string[] = [];
  modeFailures("light", light, failures);
  modeFailures("dark", dark, failures);
  if (failures.length === 0) return;
  throw new ColorSchemeError(
    "PROCESSING_FAILED",
    `The scheme failed its accessibility verification (${failures.join("; ")}). Seeds: primary ${seeds.primary}, secondary ${seeds.secondary ?? "not given"}, neutral ${seeds.neutral ?? "not given"}.`,
  );
}
