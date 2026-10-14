import { ColorSchemeError } from "@/errors.js";
import { contrastRatio, lightnessDifference } from "@/color/contrast.js";
import { oklabToSrgb } from "@/color/gamut.js";
import type { Srgb } from "@/color/types.js";
import type { SchemeSeed, SchemeSeeds } from "@/scheme/derive.js";
import type { Role } from "@/types.js";

/**
 * Margin added to every WCAG 2.2 contrast minimum that the construction aims for: the search is
 * asked for 4.5 + 0.005 instead of 4.5, for example. A parameter of the specification, section 4.1.
 *
 * WCAG 2.2 weights the linear channels with 0.2126, 0.7152, and 0.0722, while tools that take
 * luminance from the XYZ matrix, such as Color.js, use about 0.21264, 0.71517, and 0.07219; their
 * ratios differ by up to about 0.0012. With the margin, those tools also see every minimum met. The
 * guarantee and the final verification stay the WCAG 2.2 minimums, without the margin.
 */
export const CONTRAST_MARGIN = 0.005;

/**
 * Margin added to the minimum Oklab lightness difference of text pairs that the construction aims
 * for: the search is asked for the minimum plus 0.001. A parameter of the specification, section
 * 4.1.
 *
 * The Oklab lightness of this package and that of tools such as Color.js differ by up to about
 * 1e-8, because of the published matrices, so a color right at the minimum could read just below
 * it there. The guarantee and the final verification stay the minimum, without the margin.
 */
export const LIGHTNESS_MARGIN = 0.001;

/**
 * Distance in Oklab lightness between consecutive candidates of {@link findLightness}, 2^-9. A
 * parameter of the specification, section 4.1.
 *
 * It sets how finely "the minimum needed" is measured: apart from rare narrow exceptions near the
 * gamut boundary, a found lightness goes beyond the closest one that meets the constraints by less
 * than one step, about half an 8-bit step of a mid gray. It is a power of two, so
 * `k * LIGHTNESS_STEP` is exact, and a search tries at most 514 candidates.
 */
export const LIGHTNESS_STEP: number = 1 / 512;

/** What {@link findLightness} looks for. */
export interface LightnessSearch {
  /**
   * Oklab lightness to start from, usually from 0 to 1: a seed's own `L`, or a target lightness.
   * When its color meets every constraint, it is the result. A start of 1 or more counts as 1
   * (white), and the search then only goes darker; a start of 0 or less counts as 0 (black), and it
   * only goes lighter.
   */
  readonly start: number;
  /**
   * Oklab `a` of every candidate, from green (negative) to red (positive). With `b`, it sets the
   * hue and chroma, which the search keeps; gamut mapping can lower the chroma of a candidate.
   */
  readonly a: number;
  /** Oklab `b` of every candidate, from blue (negative) to yellow (positive). */
  readonly b: number;
  /**
   * Colors the result goes on. The result meets the minimums against each one. With none, the
   * start's color is the result.
   */
  readonly backgrounds: readonly Srgb[];
  /**
   * Minimum WCAG 2.2 contrast ratio against every background, from 1 to 21: the WCAG minimum plus
   * {@link CONTRAST_MARGIN}, such as 4.505.
   */
  readonly minContrast: number;
  /**
   * Minimum Oklab lightness difference from every background, from 0 to 1, for text pairs: the
   * minimum of the lightness rule plus {@link LIGHTNESS_MARGIN}. Omitted or `undefined`: no minimum.
   */
  readonly minLightnessDifference?: number | undefined;
  /**
   * Which candidate comes first when a lighter and a darker one are equally far from `start`. The
   * two candidates of every step are equally far unless one of them is white or black, so this is
   * the side tried first at each step.
   */
  readonly prefer: "lighter" | "darker";
}

/** A color found by {@link findLightness}. */
export interface LightnessMatch {
  /** The 8-bit color, `oklabToSrgb(L, a, b)`. It meets every constraint of the search. */
  readonly color: Srgb;
  /**
   * The candidate lightness that gave `color`: `start`, clamped to 0…1, when the start's color
   * meets every constraint. It is not the Oklab lightness of `color`, which gamut mapping and 8-bit
   * rounding can move slightly.
   */
  readonly L: number;
}

/**
 * Finds the Oklab lightness closest to a start whose final 8-bit color meets a contrast minimum
 * against every background, and optionally a lightness difference minimum, keeping `a` and `b`
 * (specification, section 4). Every candidate is converted with `oklabToSrgb`, which applies the
 * gamut mapping, and is judged on that final 8-bit color with `contrastRatio` and
 * `lightnessDifference`, the functions the report uses, so the result never fails a constraint.
 *
 * Candidates, in order:
 *
 * 1. `start` itself. An 8-bit seed converted to Oklab gives back its own color through
 *    `oklabToSrgb`, so a seed that meets the constraints is returned exactly.
 * 2. Then, for k = 1, 2, …, the lighter candidate `start + k · LIGHTNESS_STEP` and the darker
 *    candidate `start - k · LIGHTNESS_STEP`. A lighter candidate of 1 or more is replaced by 1
 *    (white), and a darker one of 0 or less by 0 (black); each side ends after its end, so white
 *    and black are always tried. Of the two candidates of a step, the one closer to `start` comes
 *    first (only an end can be closer), and `prefer` decides between equally close ones.
 *
 * The result is the first candidate that meets every constraint: the candidate closest to
 * `start`. Every candidate before it is tried, because contrast and lightness are not monotonic in
 * the candidate lightness near the gamut boundary and after 8-bit rounding, so a bisection could
 * skip a closer candidate that meets them. A search tries at most `1 / LIGHTNESS_STEP` + 2
 * candidates.
 *
 * A result always exists when white or black meets every constraint, since both are always tried.
 * Against one background of luminance Y, white reaches 1.05 / (Y + 0.05) and black
 * (Y + 0.05) / 0.05, whose product is 21, so one of them reaches √21 ≈ 4.58: 3:1 and 4.5:1 plus
 * {@link CONTRAST_MARGIN} are always met, together with a lightness difference minimum of up to
 * 0.496 and 0.399 respectively (checked on every 8-bit background). 7:1 plus the margin is met only
 * when Y ≤ 0.0998 (white) or Y ≥ 0.3003 (black), with a lightness difference minimum of up to
 * 0.497. With several backgrounds, one extreme has to meet the constraints on all of them, so the
 * caller keeps them on the same side of those thresholds.
 *
 * Uses only basic arithmetic and comparisons, in a fixed order, and the deterministic color
 * functions, so it returns the same result in every environment.
 *
 * @param search - The start, hue, backgrounds, and minimums.
 * @returns The first candidate that meets every constraint, or `null` when none does, not even
 *   white or black. A `NaN` `start` gives `null`, even with no backgrounds; a `NaN` `a` or `b`
 *   leaves only white and black.
 */
export function findLightness(search: LightnessSearch): LightnessMatch | null {
  const { a, b } = search;
  if (Number.isNaN(search.start)) {
    return null;
  }
  // White at 1 or more and black at 0 or less: start from that end, so the steps stay in 0 to 1.
  const start = search.start >= 1 ? 1 : search.start <= 0 ? 0 : search.start;
  const startColor = oklabToSrgb(start, a, b);
  if (meetsConstraints(startColor, search)) {
    return { color: startColor, L: start };
  }

  const lighterFirstOnTies = search.prefer === "lighter";
  // A side is done once its end has been tried. When `start` is already at or beyond an end, its
  // color is that end's color, so that side has no candidates.
  let lighterDone = !(start < 1);
  let darkerDone = !(start > 0);
  for (let step = 1; !lighterDone || !darkerDone; step++) {
    const offset = step * LIGHTNESS_STEP;

    let lighter = start + offset;
    let lighterDistance = offset;
    const lighterIsEnd = !(lighter < 1);
    if (lighterIsEnd) {
      lighter = 1;
      lighterDistance = 1 - start;
    }
    let darker = start - offset;
    let darkerDistance = offset;
    const darkerIsEnd = !(darker > 0);
    if (darkerIsEnd) {
      darker = 0;
      darkerDistance = start;
    }

    const lighterFirst =
      darkerDone ||
      (!lighterDone &&
        (lighterDistance < darkerDistance ||
          (lighterDistance === darkerDistance && lighterFirstOnTies)));
    for (let turn = 0; turn < 2; turn++) {
      const tryLighter = (turn === 0) === lighterFirst;
      if (tryLighter ? lighterDone : darkerDone) {
        continue;
      }
      const L = tryLighter ? lighter : darker;
      const color = oklabToSrgb(L, a, b);
      if (meetsConstraints(color, search)) {
        return { color, L };
      }
      if (tryLighter) {
        lighterDone = lighterIsEnd;
      } else {
        darkerDone = darkerIsEnd;
      }
    }
  }
  return null;
}

/**
 * Runs {@link findLightness} for one role of one mode, and throws instead of returning `null`.
 * The role construction modules design their searches so that a result always exists, so a
 * missing one is a bug, reported rather than turned into an inaccessible color.
 *
 * @param role - The role being searched for, named in the error.
 * @param mode - The mode being built, named in the error.
 * @param seeds - The seeds used, from `deriveSeeds`, named in the error so the failure can be
 *   reproduced.
 * @param search - The start, hue, backgrounds, and minimums.
 * @returns The match of {@link findLightness}.
 * @throws {ColorSchemeError} `PROCESSING_FAILED`, with a message that names the role, the mode,
 *   and the seeds as lowercase hex, a derived seed as "not given", like the input.
 */
export function findOrThrow(
  role: Role,
  mode: "light" | "dark",
  seeds: SchemeSeeds,
  search: LightnessSearch,
): LightnessMatch {
  const match = findLightness(search);
  if (match !== null) return match;
  throw new ColorSchemeError(
    "PROCESSING_FAILED",
    `No ${role} color meets its minimums in ${mode} mode. Seeds: primary ${seeds.primary.hex}, secondary ${given(seeds.secondary)}, neutral ${given(seeds.neutral)}.`,
  );
}

/** A seed as the input gave it: its hex when given, "not given" when derived. */
function given(seed: SchemeSeed): string {
  return seed.source === "given" ? seed.hex : "not given";
}

/**
 * Whether an 8-bit color meets the search's contrast minimum against every background and, when
 * there is one, its lightness difference minimum. A `NaN` measure fails.
 */
function meetsConstraints(color: Srgb, search: LightnessSearch): boolean {
  const { backgrounds, minContrast, minLightnessDifference } = search;
  for (const background of backgrounds) {
    if (!(contrastRatio(color, background) >= minContrast)) {
      return false;
    }
  }
  if (minLightnessDifference !== undefined) {
    for (const background of backgrounds) {
      if (!(lightnessDifference(color, background) >= minLightnessDifference)) {
        return false;
      }
    }
  }
  return true;
}
