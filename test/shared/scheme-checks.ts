import {
  getLuminance,
  OKLab,
  OKLCH,
  sRGB,
  to,
  toGamut,
  type PlainColorObject,
} from "colorjs.io/fn";
import type { ColorScheme, Role, Seeds } from "@/types.js";

// Checks of a whole scheme against the specification (sections 4, 5.2, and 5.3) and the approved
// contract (the TSDoc of `SeedAdjustment`, `createColorScheme`, and the role construction
// modules), shared by the hand-picked seeds, the sweep of the 4,096 #RGB primaries, and the
// property-based tests. Every measure and conversion comes from Color.js, never from the package's
// formulas, and the expected values and parameters are written out here; a test in `guarantee.ts`
// checks that the parameters still match the package's. Color.js is used through its functional
// API (`colorjs.io/fn`), which runs the same conversions and gamut mapping as its `Color` class
// several times faster; `guarantee.ts` checks that both give the same numbers, bit for bit. Each check returns a list of failures that
// names the mode, the role, and the seeds, so a failure can be reproduced; an empty list is a pass.

/** The two modes, in the order of `ColorScheme`. */
export const MODES: readonly ["light", "dark"] = ["light", "dark"];

/** A mode of a scheme. */
export type Mode = "light" | "dark";

/** Minimum Oklab lightness difference of a text pair (5.3), a parameter of algorithm version 1. */
export const MIN_LIGHTNESS_DIFFERENCE = 0.3;

/**
 * The contrast margin of specification 4.1: the construction aims for each WCAG minimum plus it.
 * It is not part of the guarantee, which the tests check without it. Fidelity includes it
 * (specification 4): a seed meets its role's contrast when it meets 3:1 plus the margin.
 */
export const CONTRAST_MARGIN = 0.005;

/** The margin the construction adds to the lightness rule of text roles (specification 4.1). */
export const LIGHTNESS_MARGIN = 0.001;

/**
 * Largest difference between a Color.js WCAG 2.1 ratio and the package's exact WCAG 2.2 ratio of
 * the same 8-bit colors: Color.js takes luminance from its XYZ matrix, and the two differ by up to
 * about 0.0012. It only widens the band in which a replay cannot tell on which side of a threshold
 * the package's own measure falls; it is never applied to the guarantee.
 */
export const COLORJS_CONTRAST_TOLERANCE = 0.002;

/**
 * Band around an Oklab threshold (lightness, chroma, or deltaEOK) in which a replay cannot tell on
 * which side the package's own Oklab falls: the two conversions differ by about 1e-8.
 */
export const OKLAB_TOLERANCE = 1e-6;

/** The difference between a reported Oklab lightness and Color.js's, about 1e-8. */
export const REPORT_LIGHTNESS_TOLERANCE = 1e-7;

/** Distance in Oklab lightness between the candidates of a search (`LIGHTNESS_STEP`). */
export const LIGHTNESS_STEP: number = 1 / 512;

/** Lowest deltaEOK between a seed container and each of the four surfaces (`SEED_CONTAINER_MIN_DISTANCE`). */
export const SEED_CONTAINER_MIN_DISTANCE = 0.04;

/** Oklab lightness from a seed container to the start of the search for `X` (`ACCENT_CONTAINER_GAP`). */
export const ACCENT_CONTAINER_GAP = 0.1;

/** Built light-mode container: the Oklab lightness of `surface` plus this (`CONTAINER_LIGHTNESS_OFFSET_LIGHT`). */
export const CONTAINER_LIGHTNESS_OFFSET_LIGHT = -0.1;

/** Oklab lightness of a built dark-mode container (`CONTAINER_LIGHTNESS_DARK`). */
export const CONTAINER_LIGHTNESS_DARK = 0.4;

/** Where the search for `onPrimary` and `onSecondary` starts (`ON_ACCENT_LIGHTNESS_LIGHT` and `_DARK`). */
export const ON_ACCENT_LIGHTNESS: Readonly<Record<Mode, number>> = { light: 1, dark: 0.31 };

/** Where the search for the accent `on…Container` roles starts (`ON_ACCENT_CONTAINER_LIGHTNESS_*`). */
export const ON_ACCENT_CONTAINER_LIGHTNESS: Readonly<Record<Mode, number>> = {
  light: 0.22,
  dark: 0.91,
};

/** Highest Oklab chroma of the accent text roles (`ON_ACCENT_CHROMA_CAP`). */
export const ON_ACCENT_CHROMA_CAP = 0.08;

/** Oklab chroma of the status containers (`STATUS_CONTAINER_LIGHT` and `_DARK`). */
export const STATUS_CONTAINER_CHROMA: Readonly<Record<Mode, number>> = { light: 0.04, dark: 0.07 };

/** Oklab chroma below which a `primary` is achromatic (`ACHROMATIC_CHROMA`). */
export const ACHROMATIC_CHROMA = 0.02;

/** The near-black and near-white grays of an achromatic `primary` (`createColorScheme` TSDoc). */
export const ACHROMATIC_ACCENT: Readonly<Record<Mode, string>> = {
  light: "#1b1b1b",
  dark: "#eeeeee",
};

/** Fraction of the primary's chroma that a derived `secondary` keeps (`SECONDARY_CHROMA_RATIO`). */
export const SECONDARY_CHROMA_RATIO = 0.6;

/** Oklab chroma of a derived `neutral`, at most the primary's (`NEUTRAL_CHROMA`). */
export const NEUTRAL_CHROMA = 0.02;

/** Oklab lightness of a derived `neutral` (`NEUTRAL_LIGHTNESS`). */
export const NEUTRAL_LIGHTNESS = 0.98;

/** Highest Oklab chroma of the neutral roles (`NEUTRAL_CHROMA_CAP`). */
export const NEUTRAL_CHROMA_CAP = 0.04;

/** Lowest Oklab lightness of a neutral seed that is the light-mode surface (`LIGHT_SURFACE_MIN_LIGHTNESS`). */
export const LIGHT_SURFACE_MIN_LIGHTNESS = 0.9;

/** Oklab lightness of `surface` when it does not keep the seed's (`SURFACE_LIGHTNESS_LIGHT` and `_DARK`). */
export const SURFACE_LIGHTNESS: Readonly<Record<Mode, number>> = { light: 0.98, dark: 0.2 };

/** The fixed hue of each status color, in degrees (specification 4.1, `status.ts`). */
export const STATUS_HUES: Readonly<Record<"error" | "warning" | "success" | "info", number>> = {
  error: 28,
  warning: 75,
  success: 145,
  info: 250,
};

/**
 * Largest hue difference between a derived `secondary` and the `primary`, in degrees: "up to about
 * 15° when the primary's chroma is below 0.05" (`deriveSeeds` TSDoc). The replay of the derivation
 * is the precise check; this one states the contract.
 */
const DERIVED_SECONDARY_HUE_TOLERANCE = 15;

/**
 * Largest hue difference between a derived `neutral` and the `primary`, in degrees: "rounding to 8
 * bits can move the hue by up to about 30°" at its chroma (`NEUTRAL_CHROMA` TSDoc).
 */
const DERIVED_NEUTRAL_HUE_TOLERANCE = 30;

/**
 * Highest Oklab chroma of a derived `neutral`: {@link NEUTRAL_CHROMA}, "very low chroma", plus
 * 0.005 for the 8-bit rounding of a near-white.
 */
const DERIVED_NEUTRAL_MAX_CHROMA = 0.025;

/**
 * Largest Oklab a-b distance between a moved seed container and the segment from the origin to its
 * seed's a and b. The move keeps the seed's a and b, which keeps its hue; gamut mapping can only
 * lower the chroma along that hue (a yellow moved below its cusp, for example), so only the 8-bit
 * rounding of the container moves it off the segment (by 0.0021 at most on the sweep and the
 * property-based tests).
 */
const MOVED_CONTAINER_AB_TOLERANCE = 0.005;

/** Largest hue drift of a status color `X` from its fixed hue, in degrees (`status.ts`: `info` drifts 2.9°). */
const STATUS_HUE_TOLERANCE = 3;

/** Largest hue drift of a status container from its fixed hue, in degrees (`status.ts`: within 2.2°). */
const STATUS_CONTAINER_HUE_TOLERANCE = 2.2;

/** A guaranteed pair of specification 5.2. */
export interface ExpectedPair {
  readonly foreground: Role;
  readonly background: Role;
  /** Minimum WCAG 2.2 contrast ratio, without the margin. */
  readonly minContrast: number;
  /** Whether it is a text pair, which also needs {@link MIN_LIGHTNESS_DIFFERENCE} (5.3). */
  readonly isText: boolean;
}

/**
 * The 31 guaranteed pairs of specification 5.2, written out one by one, sorted by foreground and
 * then by background, both in the order of `Role`.
 */
export const PAIRS: readonly ExpectedPair[] = (
  [
    ["onSurface", "surface", 7, true],
    ["onSurface", "surfaceContainerLow", 7, true],
    ["onSurface", "surfaceContainer", 7, true],
    ["onSurface", "surfaceContainerHigh", 7, true],
    ["onSurfaceVariant", "surface", 4.5, true],
    ["onSurfaceVariant", "surfaceContainerLow", 4.5, true],
    ["onSurfaceVariant", "surfaceContainer", 4.5, true],
    ["onSurfaceVariant", "surfaceContainerHigh", 4.5, true],
    ["outline", "surface", 3, false],
    ["outline", "surfaceContainerLow", 3, false],
    ["outline", "surfaceContainer", 3, false],
    ["outline", "surfaceContainerHigh", 3, false],
    ["onInverseSurface", "inverseSurface", 4.5, true],
    ["primary", "surface", 3, false],
    ["onPrimary", "primary", 4.5, true],
    ["onPrimaryContainer", "primaryContainer", 4.5, true],
    ["secondary", "surface", 3, false],
    ["onSecondary", "secondary", 4.5, true],
    ["onSecondaryContainer", "secondaryContainer", 4.5, true],
    ["error", "surface", 3, false],
    ["onError", "error", 4.5, true],
    ["onErrorContainer", "errorContainer", 4.5, true],
    ["warning", "surface", 3, false],
    ["onWarning", "warning", 4.5, true],
    ["onWarningContainer", "warningContainer", 4.5, true],
    ["success", "surface", 3, false],
    ["onSuccess", "success", 4.5, true],
    ["onSuccessContainer", "successContainer", 4.5, true],
    ["info", "surface", 3, false],
    ["onInfo", "info", 4.5, true],
    ["onInfoContainer", "infoContainer", 4.5, true],
  ] as const
).map(([foreground, background, minContrast, isText]) => ({
  foreground,
  background,
  minContrast,
  isText,
}));

/** The four surfaces that a seed container has to stand apart from. */
const SURFACES: readonly Role[] = [
  "surface",
  "surfaceContainerLow",
  "surfaceContainer",
  "surfaceContainerHigh",
];

/** What Color.js measures of one 8-bit color. */
export interface Measure {
  /** Relative luminance, the Y of XYZ D65, which Color.js's WCAG 2.1 contrast uses. */
  readonly luminance: number;
  /** Oklab lightness, from 0 to 1. */
  readonly L: number;
  /** Oklab a. */
  readonly a: number;
  /** Oklab b. */
  readonly b: number;
  /** OKLCH chroma. */
  readonly chroma: number;
  /** OKLCH hue in degrees, `NaN` when Color.js gives none (an achromatic color). */
  readonly hue: number;
}

/**
 * Color.js measures of one color. OKLCH is computed on first use: the candidates of a search only
 * need luminance and Oklab.
 */
class ColorJsMeasure implements Measure {
  readonly luminance: number;
  readonly L: number;
  readonly a: number;
  readonly b: number;
  readonly #color: PlainColorObject;
  #polar: readonly [number, number] | undefined;

  constructor(color: PlainColorObject) {
    const [L, a, b] = to(color, OKLab).coords;
    this.luminance = getLuminance(color);
    this.L = L ?? Number.NaN;
    this.a = a ?? Number.NaN;
    this.b = b ?? Number.NaN;
    this.#color = color;
  }

  get chroma(): number {
    return this.#lch()[0];
  }

  get hue(): number {
    return this.#lch()[1];
  }

  #lch(): readonly [number, number] {
    if (this.#polar === undefined) {
      const [, chroma, hue] = to(this.#color, OKLCH).coords;
      this.#polar = [chroma ?? Number.NaN, hue ?? Number.NaN];
    }
    return this.#polar;
  }
}

/** Color.js measures by hex color: a sweep meets the same colors again and again. */
const measures = new Map<string, Measure>();

/**
 * Color.js measures of a lowercase `#rrggbb` color, cached. `contrast` and `deltaEOK` below
 * combine them exactly as Color.js's `contrastWCAG21` and `deltaEOK` do, which `guarantee.ts`
 * checks bit for bit.
 */
export function measure(hex: string): Measure {
  let measured = measures.get(hex);
  if (measured === undefined) {
    // The channels divided by 255, as Color.js parses a hex color.
    const channel = (index: number): number =>
      Number.parseInt(hex.slice(index, index + 2), 16) / 255;
    measured = new ColorJsMeasure({
      space: sRGB,
      coords: [channel(1), channel(3), channel(5)],
      alpha: 1,
    });
    measures.set(hex, measured);
  }
  return measured;
}

/** Color.js WCAG 2.1 contrast of two hex colors (its `contrastWCAG21`, on cached luminances). */
export function contrast(x: string, y: string): number {
  let lighter = Math.max(measure(x).luminance, 0);
  let darker = Math.max(measure(y).luminance, 0);
  if (darker > lighter) [lighter, darker] = [darker, lighter];
  return (lighter + 0.05) / (darker + 0.05);
}

/** Color.js deltaEOK of two hex colors (its `deltaEOK`, on cached Oklab coordinates). */
export function deltaEOK(x: string, y: string): number {
  const p = measure(x);
  const q = measure(y);
  const dL = p.L - q.L;
  const da = p.a - q.a;
  const db = p.b - q.b;
  return Math.sqrt(dL ** 2 + da ** 2 + db ** 2);
}

/** Absolute Oklab lightness difference of two hex colors, from Color.js. */
export function lightnessDifference(x: string, y: string): number {
  return Math.abs(measure(x).L - measure(y).L);
}

/** Smallest angle between two hues, in degrees; `NaN` when either is `NaN`. */
function hueDistance(x: number, y: number): number {
  const d = Math.abs(x - y) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Distance from a rounding tie, in 8-bit units, within which Color.js cannot tell how the package
 * rounds a channel: the two convert Oklab with slightly different matrices, so a channel at
 * 243.50002 in Color.js can be just below 243.5 in the package (seen with the neutral `#d9d5d1`).
 */
const ROUNDING_TIE = 1e-3;

/** The two lowercase hex digits of each 8-bit channel value. */
const DIGITS: readonly string[] = Array.from({ length: 256 }, (_, value) =>
  value.toString(16).padStart(2, "0"),
);

/**
 * The 8-bit colors that Color.js allows for an Oklab color: CSS Color 4 gamut mapping into sRGB
 * (`toGamut` with the `css` method, which gives white for a lightness of 1 or more and black for 0
 * or less), then rounding, as lowercase `#rrggbb`. The first is the rounded color; a channel within
 * {@link ROUNDING_TIE} of a tie also allows the other rounding, so there can be up to eight.
 */
export function colorJsMappedOptions(L: number, a: number, b: number): string[] {
  const oklab: PlainColorObject = { space: OKLab, coords: [L, a, b], alpha: 1 };
  // `toGamut` returns a color that converts inside the gamut as it is, so only one outside it
  // needs the mapping; `guarantee.ts` checks this against Color.js's `toGamut` on a grid.
  let coords = to(oklab, sRGB).coords;
  if (!coords.every((value) => value !== null && value >= 0 && value <= 1)) {
    coords = to(toGamut(oklab, { space: sRGB, method: "css" }), sRGB).coords;
  }
  const channels = coords.map((value) => {
    const scaled = Math.min(255, Math.max(0, (value ?? Number.NaN) * 255));
    const nearest = Math.round(scaled);
    const other = scaled < nearest ? nearest - 1 : nearest + 1;
    const tie =
      Math.abs(Math.abs(scaled - nearest) - 0.5) <= ROUNDING_TIE && other >= 0 && other <= 255;
    return tie ? [DIGITS[nearest]!, DIGITS[other]!] : [DIGITS[nearest] ?? "NaN"];
  });
  let options = ["#"];
  for (const choices of channels) {
    options = options.flatMap((prefix) => choices.map((digits) => prefix + digits));
  }
  return options;
}

/** The rounded 8-bit color that Color.js gives for an Oklab color (see {@link colorJsMappedOptions}). */
export function colorJsMapped(L: number, a: number, b: number): string {
  return colorJsMappedOptions(L, a, b)[0]!;
}

/** Whether a lowercase `#rrggbb` color is a gray: its three channels are equal. */
function isGray(hex: string): boolean {
  return hex.slice(1, 3) === hex.slice(3, 5) && hex.slice(3, 5) === hex.slice(5, 7);
}

/** A seed as the input gives it, normalized like the result: lowercase `#rrggbb`. */
function normalizeHex(hex: string): string {
  const digits = hex.slice(1).toLowerCase();
  return digits.length === 3
    ? `#${digits[0]}${digits[0]}${digits[1]}${digits[1]}${digits[2]}${digits[2]}`
    : `#${digits}`;
}

/** The seeds of a scheme, for failure messages: `primary #6750a4, secondary #… (derived), …`. */
function seedsLabel(scheme: ColorScheme): string {
  const seed = (name: "primary" | "secondary" | "neutral"): string =>
    `${name} ${scheme.seeds[name].hex}${scheme.seeds[name].source === "derived" ? " (derived)" : ""}`;
  return `${seed("primary")}, ${seed("secondary")}, ${seed("neutral")}`;
}

/** The verdict of a threshold measured with Color.js: met, missed, or too close to tell. */
export type Verdict = "yes" | "no" | "unsure";

/** Whether `value >= threshold`, with a band of ± `tolerance` in which it cannot tell. */
export function atLeast(value: number, threshold: number, tolerance: number): Verdict {
  if (value >= threshold + tolerance) return "yes";
  if (value < threshold - tolerance) return "no";
  return "unsure";
}

/** Combines verdicts that must all hold: any "no" wins, then any "unsure". */
export function allOf(verdicts: readonly Verdict[]): Verdict {
  if (verdicts.includes("no")) return "no";
  return verdicts.includes("unsure") ? "unsure" : "yes";
}

/** A lightness search, as `findLightness` takes it, with the backgrounds as hex colors. */
export interface OracleSearch {
  readonly start: number;
  readonly a: number;
  readonly b: number;
  readonly backgrounds: readonly string[];
  readonly minContrast: number;
  readonly minLightnessDifference?: number | undefined;
  readonly prefer: "lighter" | "darker";
}

/** A search's start as its first candidate: 1 (white) from 1 or more, 0 (black) from 0 or less. */
function clampedStart(start: number): number {
  return start >= 1 ? 1 : start <= 0 ? 0 : start;
}

/**
 * Every candidate lightness of a search, by brute force, in the order that `findLightness`
 * documents: the start, clamped to 0…1, and then every other candidate of both sides, each
 * `k · LIGHTNESS_STEP` from the start and ending with white or black, sorted by distance from the
 * start and, between equally distant ones, with the preferred side first.
 */
export function candidateOrder(search: Pick<OracleSearch, "start" | "prefer">): number[] {
  const start = clampedStart(search.start);
  const lighterPreferred = search.prefer === "lighter";
  const others: Array<{ L: number; distance: number; preferred: boolean }> = [];
  if (start < 1) {
    for (let k = 1; ; k++) {
      const L = start + k * LIGHTNESS_STEP;
      if (!(L < 1)) {
        others.push({ L: 1, distance: 1 - start, preferred: lighterPreferred });
        break;
      }
      others.push({ L, distance: k * LIGHTNESS_STEP, preferred: lighterPreferred });
    }
  }
  if (start > 0) {
    for (let k = 1; ; k++) {
      const L = start - k * LIGHTNESS_STEP;
      if (!(L > 0)) {
        others.push({ L: 0, distance: start, preferred: !lighterPreferred });
        break;
      }
      others.push({ L, distance: k * LIGHTNESS_STEP, preferred: !lighterPreferred });
    }
  }
  others.sort((x, y) => x.distance - y.distance || Number(y.preferred) - Number(x.preferred));
  return [start, ...others.map((candidate) => candidate.L)];
}

/** Whether a color meets a search's minimums on every background, measured with Color.js. */
function searchVerdict(hex: string, search: OracleSearch): Verdict {
  const verdicts = search.backgrounds.map((background) =>
    atLeast(contrast(hex, background), search.minContrast, COLORJS_CONTRAST_TOLERANCE),
  );
  const { minLightnessDifference } = search;
  if (minLightnessDifference !== undefined) {
    for (const background of search.backgrounds) {
      verdicts.push(
        atLeast(lightnessDifference(hex, background), minLightnessDifference, OKLAB_TOLERANCE),
      );
    }
  }
  return allOf(verdicts);
}

/** What the search oracle allows: the matches, and whether `null` is allowed. */
export interface Allowed {
  readonly matches: ReadonlyArray<{ readonly L: number; readonly hex: string }>;
  readonly orNull: boolean;
  /** Whether Color.js could not tell the package's verdict on some candidate. */
  readonly unsure: boolean;
}

/**
 * The brute-force oracle of `findLightness`: it walks every candidate in order, converts each with
 * Color.js (CSS gamut mapping and rounding), and judges it with Color.js; the first candidate that
 * meets every minimum is the result, and `null` when none does. Where Color.js cannot tell what
 * the package sees (a measure within the band of the Color.js tolerances, or a channel at a
 * rounding tie), every possibility that is not a clear failure is allowed, and the walk goes on
 * until a candidate meets the minimums in all of them.
 */
export function searchOracle(search: OracleSearch): Allowed {
  const matches: Array<{ L: number; hex: string }> = [];
  let unsure = false;
  /** Judges one candidate, and whether it ends the walk. */
  const judge = (L: number): boolean => {
    const options = colorJsMappedOptions(L, search.a, search.b);
    const verdicts = options.map((hex) => searchVerdict(hex, search));
    options.forEach((hex, i) => {
      if (verdicts[i] !== "no") matches.push({ L, hex });
    });
    if (verdicts.some((each) => each !== verdicts[0]) || verdicts.includes("unsure")) {
      unsure = true;
    }
    return verdicts.every((each) => each === "yes");
  };
  // The start comes first; the rest of the order is built only when the walk goes on.
  if (judge(clampedStart(search.start))) return { matches, orNull: false, unsure };
  for (const L of candidateOrder(search).slice(1)) {
    if (judge(L)) return { matches, orNull: false, unsure };
  }
  return { matches, orNull: true, unsure };
}

/**
 * Checks the guarantee of one scheme (specification 5.2, 5.3, and 5.4): in both modes, every role
 * is a lowercase `#rrggbb` color, every guaranteed pair meets its WCAG minimum, and every text pair
 * meets {@link MIN_LIGHTNESS_DIFFERENCE}, measured with Color.js and without any tolerance. The
 * construction's margins exist so that Color.js sees every minimum met (specification 8.2).
 */
export function guaranteeFailures(scheme: ColorScheme): string[] {
  const failures: string[] = [];
  for (const mode of MODES) {
    const roles = scheme[mode];
    for (const [role, hex] of Object.entries(roles)) {
      if (!/^#[0-9a-f]{6}$/.test(hex)) failures.push(`${mode} ${role} ${hex}: not #rrggbb`);
    }
    for (const pair of PAIRS) {
      const foreground = roles[pair.foreground];
      const background = roles[pair.background];
      const name = `${mode} ${pair.foreground} ${foreground} on ${pair.background} ${background}`;
      const measured = contrast(foreground, background);
      if (!(measured >= pair.minContrast)) {
        failures.push(`${name}: contrast ${measured} < ${pair.minContrast}`);
      }
      if (pair.isText) {
        const difference = lightnessDifference(foreground, background);
        if (!(difference >= MIN_LIGHTNESS_DIFFERENCE)) {
          failures.push(
            `${name}: lightness difference ${difference} < ${MIN_LIGHTNESS_DIFFERENCE}`,
          );
        }
      }
    }
  }
  return failures.map((failure) => `${failure} (${seedsLabel(scheme)})`);
}

/** How often each fidelity rule decided, to show that a set of seeds exercises all of them. */
export interface FidelityTally {
  /** An accent seed that meets 3:1 plus the margin on `surface`, so it is `X` exactly. */
  accent: number;
  /** An accent seed that misses it and stands apart from the surfaces: `XContainer` exactly. */
  container: number;
  /** An accent seed that misses it and is too close to the surfaces: moved `XContainer`. */
  moved: number;
  /** An achromatic `primary` that is `primary` exactly. */
  achromaticExact: number;
  /** An achromatic `primary` that becomes the near-black or near-white gray. */
  achromaticGray: number;
  /** A light neutral within the chroma cap: the light-mode `surface` exactly. */
  neutralExact: number;
  /** A light neutral above the chroma cap: the light-mode `surface` at its lightness, capped. */
  neutralCapped: number;
  /** A `surface` at the mode's own lightness: any dark-mode one, and a neutral that is not light. */
  neutralSurface: number;
  /** A rule decided inside a band where Color.js cannot tell the package's side; both are accepted. */
  ambiguous: number;
  /** Replayed searches (`X` and text) with a candidate inside such a band; both are accepted. */
  unsureSearches: number;
  /** Largest move of a seed container, in `LIGHTNESS_STEP` candidates. */
  maxMoveSteps: number;
  /** Largest Oklab a-b distance between a moved container and its seed's hue segment. */
  maxMovedAbDistance: number;
}

/** A tally with every count at 0. */
export function newTally(): FidelityTally {
  return {
    accent: 0,
    container: 0,
    moved: 0,
    achromaticExact: 0,
    achromaticGray: 0,
    neutralExact: 0,
    neutralCapped: 0,
    neutralSurface: 0,
    ambiguous: 0,
    unsureSearches: 0,
    maxMoveSteps: 0,
    maxMovedAbDistance: 0,
  };
}

/**
 * Whether a color stands apart from the four surfaces of a mode, as a seed container must (the
 * `SeedAdjustment` TSDoc): not on the wrong side of `surface` (lighter in light mode, darker in dark
 * mode), and at least {@link SEED_CONTAINER_MIN_DISTANCE} in Color.js deltaEOK from each surface.
 */
export function standsApart(hex: string, mode: Mode, roles: ColorScheme["light"]): Verdict {
  const L = measure(hex).L;
  const surfaceL = measure(roles.surface).L;
  const side =
    mode === "light"
      ? atLeast(surfaceL, L, OKLAB_TOLERANCE)
      : atLeast(L, surfaceL, OKLAB_TOLERANCE);
  return allOf([
    side,
    ...SURFACES.map((surface) =>
      atLeast(deltaEOK(hex, roles[surface]), SEED_CONTAINER_MIN_DISTANCE, OKLAB_TOLERANCE),
    ),
  ]);
}

/**
 * The oracle for a seed container that has to move: the containers the contract allows, by
 * replaying its definition with Color.js. Candidates keep the seed's Oklab a and b and step its
 * lightness toward the accent side (darker in light mode, lighter in dark mode) by
 * {@link LIGHTNESS_STEP}, each judged on its 8-bit color from Color.js's CSS gamut mapping; the
 * first that stands apart is the container, and black or white ends the search. So the container
 * is the minimal move: every candidate closer to the seed, including the one a single step closer,
 * fails to stand apart by Color.js deltaEOK. Where Color.js cannot tell what the package sees (a
 * distance within the band of {@link standsApart}, or a channel at a rounding tie), every
 * possibility that is not a clear failure is allowed, and the search goes on until a candidate
 * stands apart in all of them, so the oracle never rejects what the package's own measures could
 * decide.
 */
function movedContainers(
  seed: string,
  mode: Mode,
  roles: ColorScheme["light"],
): { readonly allowed: readonly string[]; readonly steps: number; readonly unsure: boolean } {
  const { L, a, b } = measure(seed);
  const allowed: string[] = [];
  let unsure = false;
  for (let step = 1; ; step++) {
    const candidateL = mode === "light" ? L - step * LIGHTNESS_STEP : L + step * LIGHTNESS_STEP;
    // Black or white ends the search, and is the container without the check.
    const end = mode === "light" ? !(candidateL > 0) : !(candidateL < 1);
    const candidates = colorJsMappedOptions(candidateL, a, b);
    const verdicts = candidates.map((candidate) =>
      end ? "yes" : standsApart(candidate, mode, roles),
    );
    candidates.forEach((candidate, i) => {
      if (verdicts[i] !== "no") allowed.push(candidate);
    });
    if (verdicts.some((verdict) => verdict !== verdicts[0]) || verdicts.includes("unsure")) {
      unsure = true;
    }
    if (verdicts.every((verdict) => verdict === "yes")) return { allowed, steps: step, unsure };
  }
}

/**
 * Oklab a-b distance from a color to the segment from the origin to a seed's a and b: 0 when the
 * color has the seed's hue and at most its chroma. A seed with no chroma gives the color's chroma.
 */
function distanceToHueSegment(color: Measure, seed: Measure): number {
  const squared = seed.a * seed.a + seed.b * seed.b;
  const t =
    squared === 0 ? 0 : Math.min(1, Math.max(0, (color.a * seed.a + color.b * seed.b) / squared));
  return Math.sqrt((color.a - t * seed.a) ** 2 + (color.b - t * seed.b) ** 2);
}

/**
 * Oklab lightness of the built containers of a mode (`builtContainerLightness`): the light-mode
 * `surface`'s plus {@link CONTAINER_LIGHTNESS_OFFSET_LIGHT}, or {@link CONTAINER_LIGHTNESS_DARK}.
 */
function builtContainerLightness(mode: Mode, roles: ColorScheme["light"]): number {
  return mode === "light"
    ? measure(roles.surface).L + CONTAINER_LIGHTNESS_OFFSET_LIGHT
    : CONTAINER_LIGHTNESS_DARK;
}

/**
 * Checks a role found by a lightness search against {@link searchOracle}, and counts a search in
 * which Color.js could not tell some verdict.
 */
function searchFailure(
  role: Role,
  actual: string,
  search: OracleSearch,
  tally: FidelityTally,
  fail: (message: string) => void,
): void {
  const allowed = searchOracle(search);
  if (allowed.unsure) tally.unsureSearches++;
  if (!allowed.matches.some((match) => match.hex === actual)) {
    const expected = allowed.matches.map((match) => match.hex).join(" or ") || "none";
    fail(`${role} is ${actual}, but its search gives ${expected}`);
  }
}

/**
 * A cheaper check of a role found by a lightness search, for searches that can walk hundreds of
 * candidates (`onPrimary` and `onSecondary`). The role must be a candidate of the search: the
 * Color.js color of a candidate lightness with the search's a and b, so it keeps the family's hue
 * and chroma cap. Among the candidates with its color, the first in the search order is the one
 * the package chose, and it may not clearly miss the minimums; the start, when it clearly meets
 * them, is the role; and the candidate tried just before it may not clearly meet them. The
 * candidates between the start and that one are not checked, which {@link searchFailure} does.
 */
function candidateFailure(
  role: Role,
  actual: string,
  search: OracleSearch,
  fail: (message: string) => void,
): void {
  const order = candidateOrder(search);
  const optionsAt = (L: number): string[] => colorJsMappedOptions(L, search.a, search.b);
  const meets = (options: readonly string[]): boolean =>
    options.every((hex) => searchVerdict(hex, search) === "yes");
  const start = optionsAt(order[0]!);
  if (meets(start)) {
    if (!start.includes(actual)) {
      fail(`${role} is ${actual}, but the start of its search, ${start.join(" or ")}, meets it`);
    }
    return;
  }
  // Gamut mapping and 8-bit rounding keep a candidate's Oklab lightness close to its own, so the
  // candidates with the role's color are near the role's lightness; a wider window is tried when
  // none is found in the narrow one.
  const L = measure(actual).L;
  let index = -1;
  for (const window of [0.02, 0.1]) {
    index = order.findIndex(
      (candidate) => Math.abs(candidate - L) <= window && optionsAt(candidate).includes(actual),
    );
    if (index >= 0) break;
  }
  if (index < 0) {
    fail(`${role} is ${actual}, which is not a candidate of its search`);
    return;
  }
  if (searchVerdict(actual, search) === "no") {
    fail(`${role} is ${actual}, which misses the minimums of its search`);
  }
  const previous = optionsAt(order[index - 1] ?? Number.NaN);
  if (index > 0 && meets(previous)) {
    fail(`${role} is ${actual}, but the candidate before it, ${previous.join(" or ")}, meets it`);
  }
}

/** The roles of an accent family. */
const FAMILIES = {
  primary: {
    container: "primaryContainer",
    onAccent: "onPrimary",
    onContainer: "onPrimaryContainer",
  },
  secondary: {
    container: "secondaryContainer",
    onAccent: "onSecondary",
    onContainer: "onSecondaryContainer",
  },
} as const;

/**
 * Checks the roles that an accent family builds from its seed, by replaying their construction
 * with Color.js (`buildAccentRoles` TSDoc). The family's hue is the seed's Oklab a and b, or none
 * for an achromatic `primary`.
 *
 * - When the seed is `XContainer` (exactly or moved), `X` is the first candidate of a search that
 *   starts {@link ACCENT_CONTAINER_GAP} beyond the container's lightness, toward the accent side,
 *   with the family's hue, for 3:1 plus the margin on `surface`.
 * - Otherwise `XContainer` is built: the family's hue at the built container lightness.
 * - `onX` and `onXContainer` keep the family's hue, with its chroma capped at
 *   {@link ON_ACCENT_CHROMA_CAP}, and are searched on `X` and `XContainer` from their documented
 *   starts, for 4.5:1 and the lightness rule, each plus its margin. `onX` is replayed in full only
 *   when `fullTextSearch` is set, and otherwise checked with {@link candidateFailure}.
 */
function accentFamilyFailures(
  scheme: ColorScheme,
  mode: Mode,
  name: "primary" | "secondary",
  seedIsContainer: boolean,
  achromatic: boolean,
  fullTextSearch: boolean,
  tally: FidelityTally,
  fail: (message: string) => void,
): void {
  const roles = scheme[mode];
  const light = mode === "light";
  const family = FAMILIES[name];
  const seed = measure(scheme.seeds[name].hex);
  const a = achromatic ? 0 : seed.a;
  const b = achromatic ? 0 : seed.b;

  if (seedIsContainer) {
    const gap = light ? -ACCENT_CONTAINER_GAP : ACCENT_CONTAINER_GAP;
    searchFailure(
      name,
      roles[name],
      {
        start: measure(roles[family.container]).L + gap,
        a,
        b,
        backgrounds: [roles.surface],
        minContrast: 3 + CONTRAST_MARGIN,
        prefer: light ? "darker" : "lighter",
      },
      tally,
      fail,
    );
  } else {
    const expected = colorJsMappedOptions(builtContainerLightness(mode, roles), a, b);
    if (!expected.includes(roles[family.container])) {
      fail(
        `${family.container} is ${roles[family.container]}, but the built container is ` +
          expected.join(" or "),
      );
    }
  }

  const chroma = Math.sqrt(a * a + b * b);
  const scale = chroma <= ON_ACCENT_CHROMA_CAP ? 1 : ON_ACCENT_CHROMA_CAP / chroma;
  const text = {
    a: a * scale,
    b: b * scale,
    minContrast: 4.5 + CONTRAST_MARGIN,
    minLightnessDifference: MIN_LIGHTNESS_DIFFERENCE + LIGHTNESS_MARGIN,
  };
  const onAccentSearch: OracleSearch = {
    ...text,
    start: ON_ACCENT_LIGHTNESS[mode],
    backgrounds: [roles[name]],
    prefer: light ? "lighter" : "darker",
  };
  if (fullTextSearch) {
    searchFailure(family.onAccent, roles[family.onAccent], onAccentSearch, tally, fail);
  } else {
    candidateFailure(family.onAccent, roles[family.onAccent], onAccentSearch, fail);
  }
  searchFailure(
    family.onContainer,
    roles[family.onContainer],
    {
      ...text,
      start: ON_ACCENT_CONTAINER_LIGHTNESS[mode],
      backgrounds: [roles[family.container]],
      prefer: light ? "darker" : "lighter",
    },
    tally,
    fail,
  );
}

/**
 * Checks the report entry of a seed in one mode: a given seed has one, on `role`, with `exact`
 * true exactly when the role's color is the seed, and `lightnessShift` the Oklab lightness of the
 * role's color minus the seed's (0 when exact); a derived seed has none.
 */
function adjustmentFailures(
  scheme: ColorScheme,
  mode: Mode,
  name: "primary" | "secondary" | "neutral",
  role: Role,
  fail: (message: string) => void,
): void {
  const entry = scheme.report[mode].adjustments.find((adjustment) => adjustment.seed === name);
  if (scheme.seeds[name].source === "derived") {
    if (entry !== undefined) fail("a derived seed has a report entry");
    return;
  }
  if (entry === undefined) {
    fail("a given seed has no report entry");
    return;
  }
  const seed = scheme.seeds[name].hex;
  const color = scheme[mode][role];
  const exact = color === seed;
  const shift = measure(color).L - measure(seed).L;
  if (entry.role !== role) fail(`reported on ${entry.role} instead of ${role}`);
  if (entry.exact !== exact) fail(`reported with exact ${entry.exact}, but ${role} is ${color}`);
  const shiftOk = exact
    ? entry.lightnessShift === 0
    : Math.abs(entry.lightnessShift - shift) <= REPORT_LIGHTNESS_TOLERANCE;
  if (!shiftOk) fail(`reported lightnessShift ${entry.lightnessShift}, measured ${shift}`);
}

/**
 * Checks the fidelity of a `primary` or `secondary` seed, given or derived, in one mode (the
 * `SeedAdjustment` TSDoc): a seed that meets 3:1 plus the margin on `surface` is `X` exactly; one
 * that misses it is `XContainer` exactly when it stands apart from the surfaces, and otherwise a
 * moved container, which keeps its a and b and moves by the minimum (see {@link movedContainers}).
 * Then the rest of the family (see {@link accentFamilyFailures}).
 */
function accentFidelity(
  scheme: ColorScheme,
  mode: Mode,
  name: "primary" | "secondary",
  fullTextSearch: boolean,
  tally: FidelityTally,
  fail: (message: string) => void,
): void {
  const roles = scheme[mode];
  const seed = scheme.seeds[name].hex;
  const container = FAMILIES[name].container;
  const meets = atLeast(
    contrast(seed, roles.surface),
    3 + CONTRAST_MARGIN,
    COLORJS_CONTRAST_TOLERANCE,
  );
  const isAccent = roles[name] === seed;
  if (meets === "yes" || (meets === "unsure" && isAccent)) {
    if (!isAccent) fail(`meets 3:1 on surface ${roles.surface}, but ${name} is ${roles[name]}`);
    if (meets === "unsure") tally.ambiguous++;
    else tally.accent++;
    adjustmentFailures(scheme, mode, name, name, fail);
    accentFamilyFailures(scheme, mode, name, false, false, fullTextSearch, tally, fail);
    return;
  }
  if (meets === "no" && isAccent) fail(`misses 3:1 on surface ${roles.surface}, but is ${name}`);

  const apart = standsApart(seed, mode, roles);
  const actual = roles[container];
  if (apart === "yes" || (apart === "unsure" && actual === seed)) {
    if (actual !== seed) fail(`stands apart from the surfaces, but ${container} is ${actual}`);
    if (apart === "unsure") tally.ambiguous++;
    else tally.container++;
  } else {
    const moved = movedContainers(seed, mode, roles);
    if (!moved.allowed.includes(actual)) {
      fail(
        `${container} is ${actual}, but the first candidate that stands apart is ` +
          `${moved.allowed.join(" or ")}, ${moved.steps} lightness steps from the seed`,
      );
    }
    const s = measure(seed);
    const c = measure(actual);
    const abDistance = distanceToHueSegment(c, s);
    if (!(abDistance <= MOVED_CONTAINER_AB_TOLERANCE)) {
      fail(`moved ${container} ${actual} is ${abDistance} off the seed's hue in Oklab a and b`);
    }
    const towardAccent = mode === "light" ? c.L < s.L : c.L > s.L;
    if (!towardAccent) fail(`moved ${container} ${actual} is not on the accent side of the seed`);
    if (moved.unsure || apart === "unsure") tally.ambiguous++;
    else tally.moved++;
    tally.maxMoveSteps = Math.max(tally.maxMoveSteps, moved.steps);
    tally.maxMovedAbDistance = Math.max(tally.maxMovedAbDistance, abDistance);
  }
  adjustmentFailures(scheme, mode, name, container, fail);
  accentFamilyFailures(scheme, mode, name, true, false, fullTextSearch, tally, fail);
}

/**
 * Checks an achromatic `primary` in one mode (the `SeedAdjustment` and `createColorScheme` TSDoc):
 * the seed is `primary` exactly only when it already meets 3:1 plus the margin and is at least as
 * dark as the near-black gray in light mode, or as light as the near-white gray in dark mode;
 * otherwise `primary` is that gray. The rest of the family has no chroma: a built container and
 * gray text (see {@link accentFamilyFailures}).
 */
function achromaticFidelity(
  scheme: ColorScheme,
  mode: Mode,
  fullTextSearch: boolean,
  tally: FidelityTally,
  fail: (message: string) => void,
): void {
  const roles = scheme[mode];
  const seed = scheme.seeds.primary.hex;
  const gray = ACHROMATIC_ACCENT[mode];
  const seedL = measure(seed).L;
  const grayL = measure(gray).L;
  // A seed that is the gray itself sits on the bound, and both rules give the same color.
  const exactly =
    seed === gray
      ? "yes"
      : allOf([
          atLeast(contrast(seed, roles.surface), 3 + CONTRAST_MARGIN, COLORJS_CONTRAST_TOLERANCE),
          mode === "light"
            ? atLeast(grayL, seedL, OKLAB_TOLERANCE)
            : atLeast(seedL, grayL, OKLAB_TOLERANCE),
        ]);
  const expected = exactly === "yes" ? [seed] : exactly === "no" ? [gray] : [seed, gray];
  if (!expected.includes(roles.primary)) {
    fail(`achromatic, so primary should be ${expected.join(" or ")}, but is ${roles.primary}`);
  }
  for (const role of ["onPrimary", "primaryContainer", "onPrimaryContainer"] as const) {
    if (!isGray(roles[role])) fail(`achromatic, but ${role} ${roles[role]} is not gray`);
  }
  if (exactly === "unsure") tally.ambiguous++;
  else if (roles.primary === seed) tally.achromaticExact++;
  else tally.achromaticGray++;
  adjustmentFailures(scheme, mode, "primary", "primary", fail);
  accentFamilyFailures(scheme, mode, "primary", false, true, fullTextSearch, tally, fail);
}

/**
 * Checks the `neutral` seed, given or derived, in one mode (the `SeedAdjustment` TSDoc; the neutral
 * seed is the exception to "the minimum needed"). In light mode, a seed with Oklab lightness of at
 * least {@link LIGHT_SURFACE_MIN_LIGHTNESS} is `surface` exactly when its chroma is within
 * {@link NEUTRAL_CHROMA_CAP}, and `surface` at its own lightness with its a and b scaled to the cap
 * otherwise. Any other seed, and every seed in dark mode, gives `surface` at the mode's surface
 * lightness with its a and b scaled to the cap. Each expected `surface` is replayed with Color.js
 * (its Oklab and CSS gamut mapping), which keeps the hue, the cap, and the lightness at once.
 */
function neutralFidelity(
  scheme: ColorScheme,
  mode: Mode,
  tally: FidelityTally,
  fail: (message: string) => void,
): void {
  const seed = scheme.seeds.neutral.hex;
  const { L, a, b, chroma } = measure(seed);
  const withinCap = atLeast(NEUTRAL_CHROMA_CAP, chroma, OKLAB_TOLERANCE);
  // The seed's a and b scaled to the cap; within the band, its own a and b are allowed too.
  const capped = NEUTRAL_CHROMA_CAP / chroma;
  const scales = withinCap === "yes" ? [1] : withinCap === "no" ? [capped] : [1, capped];
  const at = (lightness: number): string[] =>
    scales.flatMap((scale) => colorJsMappedOptions(lightness, a * scale, b * scale));

  const light = mode === "light" ? atLeast(L, LIGHT_SURFACE_MIN_LIGHTNESS, OKLAB_TOLERANCE) : "no";
  const keeps =
    light === "no"
      ? []
      : withinCap === "yes"
        ? [seed]
        : withinCap === "no"
          ? at(L)
          : [seed, ...at(L)];
  const own = light === "yes" ? [] : at(SURFACE_LIGHTNESS[mode]);
  const expected = [...keeps, ...own];
  const actual = scheme[mode].surface;
  if (!expected.includes(actual)) {
    fail(`surface is ${actual}, but the neutral rule gives ${expected.join(" or ")}`);
  }
  // Anything but the first expected color was accepted only through a band or a rounding tie.
  if (light === "unsure" || withinCap === "unsure" || actual !== expected[0]) tally.ambiguous++;
  else if (keeps.includes(actual)) {
    if (actual === seed) tally.neutralExact++;
    else tally.neutralCapped++;
  } else tally.neutralSurface++;
  adjustmentFailures(scheme, mode, "neutral", "surface", fail);
}

/**
 * Checks fidelity to the seeds in both modes (specification 4 and the `SeedAdjustment` TSDoc): the
 * `primary` and `secondary` seeds, given or derived (an achromatic primary by its own rule), with
 * the roles their families build from them, the `neutral` seed, and the report entry of each given
 * seed. A primary whose chroma is too close to {@link ACHROMATIC_CHROMA} to tell passes when either
 * rule holds.
 *
 * @param tally - Counts how often each rule decided; optional.
 * @param options - `fullTextSearch`: replay `onPrimary` and `onSecondary` with the full search
 *   oracle instead of {@link candidateFailure}. Their searches can walk hundreds of candidates, so
 *   the hand-picked seeds use it, and the sweep and the property-based tests do not.
 */
export function fidelityFailures(
  scheme: ColorScheme,
  tally: FidelityTally = newTally(),
  options: { readonly fullTextSearch?: boolean } = {},
): string[] {
  const full = options.fullTextSearch === true;
  const failures: string[] = [];
  for (const mode of MODES) {
    const failFor =
      (name: "primary" | "secondary" | "neutral") =>
      (message: string): void => {
        failures.push(`${mode} ${name} ${scheme.seeds[name].hex}: ${message}`);
      };
    const primaryChroma = atLeast(
      measure(scheme.seeds.primary.hex).chroma,
      ACHROMATIC_CHROMA,
      OKLAB_TOLERANCE,
    );
    if (primaryChroma === "no") {
      achromaticFidelity(scheme, mode, full, tally, failFor("primary"));
    } else if (primaryChroma === "yes") {
      accentFidelity(scheme, mode, "primary", full, tally, failFor("primary"));
    } else {
      const asAchromatic: string[] = [];
      const asChromatic: string[] = [];
      achromaticFidelity(scheme, mode, full, newTally(), (message) => asAchromatic.push(message));
      accentFidelity(scheme, mode, "primary", full, newTally(), (message) =>
        asChromatic.push(message),
      );
      if (asAchromatic.length > 0 && asChromatic.length > 0) {
        for (const message of [...asAchromatic, ...asChromatic]) failFor("primary")(message);
      }
      tally.ambiguous++;
    }
    accentFidelity(scheme, mode, "secondary", full, tally, failFor("secondary"));
    neutralFidelity(scheme, mode, tally, failFor("neutral"));
  }
  return failures.map((failure) => `${failure} (${seedsLabel(scheme)})`);
}

/**
 * The seeds that `deriveSeeds` allows for a primary, replayed with Color.js: a `secondary` at the
 * primary's lightness with its a and b times {@link SECONDARY_CHROMA_RATIO}, and a `neutral` at
 * {@link NEUTRAL_LIGHTNESS} with its a and b scaled to {@link NEUTRAL_CHROMA}, never more than the
 * primary's. An achromatic primary gives the grays at those lightnesses.
 */
function derivedOptions(
  primary: Measure,
  achromatic: boolean,
): { readonly secondary: readonly string[]; readonly neutral: readonly string[] } {
  const secondaryScale = achromatic ? 0 : SECONDARY_CHROMA_RATIO;
  const neutralScale = achromatic
    ? 0
    : primary.chroma > NEUTRAL_CHROMA
      ? NEUTRAL_CHROMA / primary.chroma
      : 1;
  return {
    secondary: colorJsMappedOptions(
      primary.L,
      primary.a * secondaryScale,
      primary.b * secondaryScale,
    ),
    neutral: colorJsMappedOptions(
      NEUTRAL_LIGHTNESS,
      primary.a * neutralScale,
      primary.b * neutralScale,
    ),
  };
}

/**
 * Checks the seeds of the result against the input (specification 3.4 and 4): each is `given`
 * exactly when the input has it, a given seed comes back as lowercase `#rrggbb`, and the missing
 * ones are derived from `primary`, as {@link derivedOptions} replays. In the contract's words, a
 * derived `secondary` has the primary's hue and less chroma, and a derived `neutral` its hue and
 * very low chroma; an achromatic `primary` gives gray derived seeds. A primary whose chroma is too
 * close to {@link ACHROMATIC_CHROMA} to tell passes when either rule holds.
 */
export function seedFailures(input: Seeds, scheme: ColorScheme): string[] {
  const failures: string[] = [];
  const fail = (message: string): void => {
    failures.push(`${message} (${seedsLabel(scheme)})`);
  };
  for (const name of ["primary", "secondary", "neutral"] as const) {
    const given = input[name];
    const used = scheme.seeds[name];
    if (used.source !== (given === undefined ? "derived" : "given")) {
      fail(`${name} is marked ${used.source}`);
    }
    if (given !== undefined && used.hex !== normalizeHex(given)) {
      fail(`given ${name} ${given} comes back as ${used.hex}`);
    }
    if (!/^#[0-9a-f]{6}$/.test(used.hex)) fail(`${name} ${used.hex} is not #rrggbb`);
  }

  const primary = measure(scheme.seeds.primary.hex);
  const chromatic = atLeast(primary.chroma, ACHROMATIC_CHROMA, OKLAB_TOLERANCE);
  const rules = (chromatic === "unsure" ? [false, true] : [chromatic === "no"]).map(
    (achromatic) => ({ achromatic, options: derivedOptions(primary, achromatic) }),
  );
  const { secondary, neutral } = scheme.seeds;
  for (const [name, seed] of [
    ["secondary", secondary],
    ["neutral", neutral],
  ] as const) {
    if (seed.source === "given") continue;
    const allowed = rules.flatMap((rule) => rule.options[name]);
    if (!allowed.includes(seed.hex)) {
      fail(`derived ${name} is ${seed.hex}, but the derivation gives ${allowed.join(" or ")}`);
    }
  }

  if (chromatic === "no") {
    for (const [name, seed] of [
      ["secondary", secondary],
      ["neutral", neutral],
    ] as const) {
      if (seed.source === "derived" && !isGray(seed.hex)) {
        fail(`the primary is achromatic, but the derived ${name} ${seed.hex} is not gray`);
      }
    }
  } else if (chromatic === "yes") {
    if (secondary.source === "derived") {
      const derived = measure(secondary.hex);
      const hue = hueDistance(derived.hue, primary.hue);
      if (!(hue <= DERIVED_SECONDARY_HUE_TOLERANCE)) {
        fail(`derived secondary ${secondary.hex} is ${hue}° from the primary's hue`);
      }
      if (!(derived.chroma < primary.chroma)) {
        fail(`derived secondary ${secondary.hex} has chroma ${derived.chroma}, not less`);
      }
    }
    if (neutral.source === "derived") {
      const derived = measure(neutral.hex);
      const hue = hueDistance(derived.hue, primary.hue);
      if (!(hue <= DERIVED_NEUTRAL_HUE_TOLERANCE)) {
        fail(`derived neutral ${neutral.hex} is ${hue}° from the primary's hue`);
      }
      if (!(derived.chroma <= DERIVED_NEUTRAL_MAX_CHROMA)) {
        fail(`derived neutral ${neutral.hex} has chroma ${derived.chroma}`);
      }
    }
  }
  return failures;
}

/**
 * Checks the status colors in both modes (specification 4 and `status.ts`): every status color
 * keeps its fixed hue, measured with Color.js OKLCH, `X` within {@link STATUS_HUE_TOLERANCE} and
 * `XContainer` within {@link STATUS_CONTAINER_HUE_TOLERANCE}, the drift that gamut mapping and
 * 8-bit rounding cause; and every container is built, as replayed with Color.js: the fixed hue at
 * {@link STATUS_CONTAINER_CHROMA}, at the built container lightness of the mode.
 */
export function statusFailures(scheme: ColorScheme): string[] {
  const failures: string[] = [];
  for (const mode of MODES) {
    const roles = scheme[mode];
    const containerL = builtContainerLightness(mode, roles);
    for (const [name, hue] of Object.entries(STATUS_HUES)) {
      const container = `${name}Container` as Role;
      for (const [role, tolerance] of [
        [name as Role, STATUS_HUE_TOLERANCE],
        [container, STATUS_CONTAINER_HUE_TOLERANCE],
      ] as const) {
        const drift = hueDistance(measure(roles[role]).hue, hue);
        if (!(drift <= tolerance)) {
          failures.push(`${mode} ${role} ${roles[role]}: hue ${drift}° from ${hue}°`);
        }
      }
      const chroma = STATUS_CONTAINER_CHROMA[mode];
      const radians = (hue * Math.PI) / 180;
      const expected = colorJsMappedOptions(
        containerL,
        Math.cos(radians) * chroma,
        Math.sin(radians) * chroma,
      );
      if (!expected.includes(roles[container])) {
        failures.push(
          `${mode} ${container} ${roles[container]}: the built container is ${expected.join(" or ")}`,
        );
      }
    }
  }
  return failures.map((failure) => `${failure} (${seedsLabel(scheme)})`);
}
