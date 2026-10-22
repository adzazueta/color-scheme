import { contrastRatio, lightnessDifference } from "@/color/contrast.js";
import { oklabToSrgb } from "@/color/gamut.js";
import { parseHex } from "@/color/hex.js";
import { srgbToOklab, type Oklab } from "@/color/oklab.js";
import type { Srgb } from "@/color/types.js";
import type { ColorSchemeVariant } from "@/types.js";
import {
  ACHROMATIC_ACCENT_LIGHTNESS_DARK,
  ACHROMATIC_ACCENT_LIGHTNESS_LIGHT,
  SECONDARY_CHROMA_RATIO,
  type SchemeSeeds,
} from "@/scheme/derive.js";
import { builtContainerLightness, type NeutralRole } from "@/scheme/neutral.js";
import { requirementOf, type RoleRequirement, type SeedAdjustmentInput } from "@/scheme/report.js";
import { CONTRAST_MARGIN, findOrThrow, LIGHTNESS_STEP, noColor } from "@/scheme/search.js";

/**
 * Starting Oklab lightness of tonal accents in light mode, 0 to 1: tone 40 of a neutral
 * CIELAB D65 gray, (40 + 16) / 116. The fixed start makes the structure consistent across
 * seeds: the 30 test covers ranged from 0.4816 to 0.4909 after gamut mapping and rounding,
 * versus fidelity's 0.1579 to 0.6545. Only outward steps needed for surface or text contrast
 * move this start. A parameter of specification 4.1; changing it changes `algorithmVersion`.
 */
export const TONAL_ACCENT_LIGHTNESS_LIGHT: number = 56 / 116;

/**
 * Starting Oklab lightness of tonal accents in dark mode, 0 to 1: tone 80 of a neutral
 * CIELAB D65 gray, (80 + 16) / 116. On 54 dev covers, primary text's median contrast was
 * 7.6645:1 versus fidelity's 6.0206:1, with no outward moves needed. Gamut mapping can lower
 * the final lightness slightly. A parameter of specification 4.1; changing it changes
 * `algorithmVersion`.
 */
export const TONAL_ACCENT_LIGHTNESS_DARK: number = 96 / 116;

/**
 * Highest requested Oklab chroma of tonal primary and primaryContainer, sqrt(a² + b²).
 * 0.16 limits vivid seeds while leaving muted seeds alone: on 54 dev covers the light primary
 * maximum fell from 0.2041 with uncapped seed chroma to 0.1607 after rounding, while the median
 * stayed 0.1139. Gamut mapping can reduce it further. A parameter of specification 4.1;
 * changing it changes `algorithmVersion`.
 */
export const TONAL_PRIMARY_CHROMA_CAP = 0.16;

/**
 * Highest requested Oklab chroma of tonal secondary and secondaryContainer, sqrt(a² + b²). 0.10
 * gives the secondary a softer ceiling: the dev light maximum fell from 0.2041 uncapped to 0.1010
 * after rounding. A derived secondary first takes 0.35 of primary chroma and keeps its hue; on the
 * 13 evaluation covers with a derived secondary, rotating its hue separated the containers better,
 * but the same hue was kept (decision of October 22, 2026), even where gamut mapping makes light
 * containers similar. A parameter of specification 4.1; changing it changes `algorithmVersion`.
 */
export const TONAL_SECONDARY_CHROMA_CAP = 0.1;

/**
 * Lowest Oklab distance, √(ΔL² + Δa² + Δb²) on the 8-bit colors, between a seed that is its
 * family's container and each of `surface`, `surfaceContainerLow`, `surfaceContainer`, and
 * `surfaceContainerHigh`. Unit: Oklab distance (deltaEOK). A parameter of the specification,
 * section 4.1.
 *
 * A seed that cannot be its accent is its container exactly only when it stands apart from the
 * surfaces: at least this far from each of them, and not on the wrong side of `surface` (lighter in
 * light mode, darker in dark mode). Otherwise its lightness moves toward the accent side by the
 * minimum needed (see {@link buildAccentRoles}). 0.04 is two just noticeable differences, twice the
 * step between the light-mode surfaces, and the distance that built containers keep from
 * `surfaceContainerHigh` in light mode before rounding (`CONTAINER_LIGHTNESS_OFFSET_LIGHT`; in dark
 * mode they keep 0.11). The distance includes chroma, so a vivid seed at the surface's lightness,
 * such as `#ffff00` on a near-white surface, stays the container exactly, while a near-white cream,
 * a near-black navy in dark mode, or a gray among the surfaces moves.
 */
export const SEED_CONTAINER_MIN_DISTANCE = 0.04;

/**
 * Oklab lightness from a seed container to the start of the search for its accent role: when the
 * seed is `XContainer`, the search for `X` starts this far from the container's lightness, toward
 * the accent side (darker in light mode, lighter in dark mode). Unit: Oklab lightness. A parameter
 * of the specification, section 4.1.
 *
 * Without it, a seed that barely misses 3:1 would give an `X` only slightly darker or lighter than
 * its container, and the two would look alike (their Oklab lightness differed by as little as
 * 0.001). 0.1 is about Material 3's minimum distance of 10 tones between `primary` and
 * `primaryContainer` (about 0.09 in Oklab lightness). `X` carries no seed in this case, so the
 * distance does not change how the seed is reported.
 */
export const ACCENT_CONTAINER_GAP = 0.1;

/**
 * Construction target for text on `primary` and `secondary`, including an achromatic primary.
 * Unit: WCAG 2.2 contrast ratio, from 1 to 21. A parameter of the specification, section 4.1.
 * The search adds `CONTRAST_MARGIN`; the reported guaranteed minimum stays 4.5:1.
 *
 * On the 54 dev evaluation covers, version 1's 4.5:1 target gave median accent text contrasts of
 * about 4.53–4.55; 6:1 raises them to about 6.02–6.30, with no verification failures. It improves
 * text contrast while keeping more seeds exactly as accents than 7:1 (in dev, 15 light-mode
 * primary seeds remain accents at 6:1, versus 8 at 7:1). A seed unable to carry this text
 * becomes its container; a built accent moves farther from the surface until it can. Near black
 * in light mode or near white in dark mode always allows it, together with 3:1 on the surface
 * and the lightness rule, so failure is an internal invariant violation. Changing this value
 * changes `algorithmVersion`.
 */
export const ON_ACCENT_TARGET_CONTRAST = 6;

/**
 * Oklab lightness that the search for the light-mode `onPrimary` and `onSecondary` starts from.
 * Unit: Oklab lightness, 0 to 1. A parameter of the specification, section 4.1.
 *
 * 1 is white, Material 3's tone 100. The light-mode accent is dark enough for 3:1 on the
 * surface and allows 6:1 text. White text also meets the lightness rule on most accents; where
 * it does not, the search goes darker, to the lightest dark text that meets them.
 */
export const ON_ACCENT_LIGHTNESS_LIGHT = 1;

/**
 * Oklab lightness that the search for the dark-mode `onPrimary` and `onSecondary` starts from.
 * Unit: Oklab lightness, 0 to 1. A parameter of the specification, section 4.1.
 *
 * About Material 3's tone 20: dark text on the light accent of dark mode. On a mid accent where
 * dark text misses the target, the search reaches the closest light text that meets it.
 */
export const ON_ACCENT_LIGHTNESS_DARK = 0.31;

/**
 * Oklab lightness that the search for the light-mode `onPrimaryContainer` and
 * `onSecondaryContainer` starts from. Unit: Oklab lightness, 0 to 1. A parameter of the
 * specification, section 4.1.
 *
 * About Material 3's tone 10, like the light-mode `onSurface`: dark text on a light container.
 */
export const ON_ACCENT_CONTAINER_LIGHTNESS_LIGHT = 0.22;

/**
 * Oklab lightness that the search for the dark-mode `onPrimaryContainer` and
 * `onSecondaryContainer` starts from. Unit: Oklab lightness, 0 to 1. A parameter of the
 * specification, section 4.1.
 *
 * About Material 3's tone 90, like the dark-mode `onSurface`: light text on a dark container.
 */
export const ON_ACCENT_CONTAINER_LIGHTNESS_DARK = 0.91;

/**
 * Highest Oklab chroma, √(a² + b²), of the text roles of an accent family: `onPrimary`,
 * `onPrimaryContainer`, `onSecondary`, and `onSecondaryContainer`. Unit: Oklab chroma. A parameter
 * of the specification, section 4.1.
 *
 * Text keeps the hue of its family's seed, with the seed's Oklab a and b scaled down to this
 * chroma when the seed has more; a seed with less keeps its own. Material 3 draws text with the
 * full chroma of the palette (its baseline `onPrimaryContainer`, `#21005d`, has 0.14). 0.08, four
 * just noticeable differences, keeps text clearly of the family, a deep navy or wine rather than
 * black and a pale tint rather than white, and calmer than the accent or container it sits on. At
 * the start lightnesses of text, gamut mapping already allows less for many hues. It does not
 * affect accessibility: white and black, the ends of every search, have no chroma.
 */
export const ON_ACCENT_CHROMA_CAP = 0.08;

/** The two endpoint candidates of every text search, independent of hue. */
const BLACK: Srgb = { r: 0, g: 0, b: 0 };
const WHITE: Srgb = { r: 255, g: 255, b: 255 };

/** The eight accent roles, in the order of `Role`. */
export type AccentRole =
  | "primary"
  | "onPrimary"
  | "primaryContainer"
  | "onPrimaryContainer"
  | "secondary"
  | "onSecondary"
  | "secondaryContainer"
  | "onSecondaryContainer";

/**
 * The surfaces that the accent roles are built on: the mode's neutral colors, as
 * `buildNeutralRoles` returns them in `NeutralRoles.colors`, of which only `surface` and its three
 * containers are read.
 */
export type AccentSurfaces = Readonly<
  Pick<
    Record<NeutralRole, Srgb>,
    "surface" | "surfaceContainerLow" | "surfaceContainer" | "surfaceContainerHigh"
  >
>;

/** The accent roles of one mode, built by {@link buildAccentRoles}. */
export interface AccentRoles {
  /** The color of each accent role, with its keys in the order of `Role`. */
  readonly colors: Readonly<Record<AccentRole, Srgb>>;
  /**
   * How each given accent seed appears in this mode, for `buildModeReport`, which computes
   * `exact` and `lightnessShift`: the seed's color and the role that carries it, `X` or
   * `XContainer`, with that role's color. `primary` comes first; `secondary` follows only when it
   * is given. A derived seed is not listed.
   */
  readonly adjustments: readonly SeedAdjustmentInput[];
}

/** The parameters of one mode. */
interface ModeParameters {
  readonly onAccent: number;
  readonly onContainer: number;
  /** Lightness of the neutral accent of an achromatic `primary`, from `derive.ts`. */
  readonly achromaticAccent: number;
  /**
   * Oklab lightness of the 8-bit gray at `achromaticAccent`, which rounding moves slightly: the
   * bound that an achromatic primary has to reach to be `primary` exactly.
   */
  readonly achromaticBound: number;
  /** Side of the accents from the surface, tried first on ties. */
  readonly accentSide: "lighter" | "darker";
  /** Side of `onX` on `X`, tried first on ties. */
  readonly onAccentSide: "lighter" | "darker";
  /** Side of `onXContainer` on `XContainer`, tried first on ties. */
  readonly onContainerSide: "lighter" | "darker";
}

const LIGHT: ModeParameters = {
  onAccent: ON_ACCENT_LIGHTNESS_LIGHT,
  onContainer: ON_ACCENT_CONTAINER_LIGHTNESS_LIGHT,
  achromaticAccent: ACHROMATIC_ACCENT_LIGHTNESS_LIGHT,
  achromaticBound: grayLightness(ACHROMATIC_ACCENT_LIGHTNESS_LIGHT),
  accentSide: "darker",
  onAccentSide: "lighter",
  onContainerSide: "darker",
};

const DARK: ModeParameters = {
  onAccent: ON_ACCENT_LIGHTNESS_DARK,
  onContainer: ON_ACCENT_CONTAINER_LIGHTNESS_DARK,
  achromaticAccent: ACHROMATIC_ACCENT_LIGHTNESS_DARK,
  achromaticBound: grayLightness(ACHROMATIC_ACCENT_LIGHTNESS_DARK),
  accentSide: "lighter",
  onAccentSide: "darker",
  onContainerSide: "lighter",
};

/** The four roles of one accent family and the minimums of the three that have pairs. */
interface Family {
  /** The accent role, which is also the name of its seed. */
  readonly accent: "primary" | "secondary";
  readonly onAccent: "onPrimary" | "onSecondary";
  readonly container: "primaryContainer" | "secondaryContainer";
  readonly onContainer: "onPrimaryContainer" | "onSecondaryContainer";
  readonly accentRequirement: RoleRequirement;
  readonly onAccentRequirement: RoleRequirement;
  readonly onContainerRequirement: RoleRequirement;
}

const PRIMARY: Family = {
  accent: "primary",
  onAccent: "onPrimary",
  container: "primaryContainer",
  onContainer: "onPrimaryContainer",
  accentRequirement: requirementOf("primary"),
  onAccentRequirement: requirementOf("onPrimary"),
  onContainerRequirement: requirementOf("onPrimaryContainer"),
};

const SECONDARY: Family = {
  accent: "secondary",
  onAccent: "onSecondary",
  container: "secondaryContainer",
  onContainer: "onSecondaryContainer",
  accentRequirement: requirementOf("secondary"),
  onAccentRequirement: requirementOf("onSecondary"),
  onContainerRequirement: requirementOf("onSecondaryContainer"),
};

/** The four colors of one family, and how its seed appears. */
interface FamilyColors {
  readonly accent: Srgb;
  readonly onAccent: Srgb;
  readonly container: Srgb;
  readonly onContainer: Srgb;
  readonly adjustment: SeedAdjustmentInput;
}

/**
 * Builds the eight accent roles of one mode, `primary` and `secondary` with their `on`,
 * `Container`, and `onContainer` roles, from the seeds, given or derived (specification, sections
 * 3.1 and 4). Each family X is built from its seed S the same way, on the mode's surfaces.
 *
 * **Tonal.** From tone 40 in light mode and tone 80 in dark mode, keep the seed hue and chroma
 * capped at {@link TONAL_PRIMARY_CHROMA_CAP} or {@link TONAL_SECONDARY_CHROMA_CAP}. A derived
 * secondary takes 0.35 of the primary chroma before the cap and uses the primary direction before
 * rounding. Candidates move only outward by LIGHTNESS_STEP until they meet surface and
 * possible-text requirements on their final 8-bit colors. Containers use builtContainerLightness,
 * and given seeds are always reported on X. The text and achromatic-primary rules below are shared.
 *
 * **Fidelity.** The seed appears in `X` or in `XContainer`, exactly unless it is too close to the
 * surfaces to be a container:
 *
 * - When S meets the minimum of `X` on `surface` (3:1 plus the contrast margin, from
 *   `requirementOf`) and allows `onX` at 6:1 plus the margin and the lightness rule, `X` is S.
 *   `XContainer` is built: S's Oklab a and b at the built container lightness of `neutral.ts`,
 *   the 8-bit `surface`'s Oklab lightness plus
 *   `CONTAINER_LIGHTNESS_OFFSET_LIGHT` in light mode and `CONTAINER_LIGHTNESS_DARK` in dark mode.
 * - Otherwise, S is `XContainer`, which has no minimum on `surface`, when it stands apart from the
 *   four surfaces: not on the wrong side of `surface` (lighter in light mode, darker in dark mode),
 *   and at least {@link SEED_CONTAINER_MIN_DISTANCE} in Oklab distance from each of them. A very
 *   light seed, such as a yellow on a white surface, stays as the light-mode container, and a
 *   dark one, such as `#6750a4`, stays as the dark-mode container; one lighter than the light
 *   surface or darker than the dark surface, or one with little chroma too close to the surfaces,
 *   moves. When S does not stand apart, `XContainer` keeps S's a and b, and its lightness moves
 *   toward the accent side (darker in light mode, lighter in dark mode) by the minimum needed:
 *   candidates `LIGHTNESS_STEP` apart, each judged on its final 8-bit color, until one stands
 *   apart. `X` keeps S's a and b. Its search starts with `findOrThrow` from
 *   {@link ACCENT_CONTAINER_GAP} beyond the container's lightness, toward the accent side. From
 *   that first 3:1 match, candidates move farther from the surface by `LIGHTNESS_STEP` until
 *   one both meets 3:1 and allows 6:1 text with the lightness rule, each plus its margin. Every
 *   candidate is judged on its final 8-bit color.
 *
 * A seed is `X` in both modes only when it meets the surface and text conditions in both.
 *
 * **Achromatic `primary`.** When `seeds.achromatic` is `true`, the primary family is neutral:
 * near black in light mode and near white in dark mode (specification, section 4), at
 * `ACHROMATIC_ACCENT_LIGHTNESS_LIGHT` or `ACHROMATIC_ACCENT_LIGHTNESS_DARK` with no chroma: the
 * grays `#1b1b1b` and `#eeeeee`. A seed that is already at least as dark as that gray in light
 * mode, or at least as light in dark mode, such as `#000000` in light mode and `#ffffff` in dark
 * mode, is `primary` exactly; any other becomes that gray, which moves its lightness by the
 * minimum needed and drops its faint chroma. `primaryContainer` is the gray at the built container
 * lightness, and the text roles are grays. A `secondary`, derived (a gray) or given, is built like
 * any other.
 *
 * **Text.** `onX` and `onXContainer` keep S's hue, with its chroma capped at
 * {@link ON_ACCENT_CHROMA_CAP} (no chroma for the achromatic primary). They are found with
 * `findOrThrow` on `X` at {@link ON_ACCENT_TARGET_CONTRAST} and on `XContainer` at 4.5:1,
 * with the lightness rule and each construction margin, from {@link ON_ACCENT_LIGHTNESS_LIGHT} or
 * {@link ON_ACCENT_LIGHTNESS_DARK} and from {@link ON_ACCENT_CONTAINER_LIGHTNESS_LIGHT} or
 * {@link ON_ACCENT_CONTAINER_LIGHTNESS_DARK}: the start when it meets the minimums, and otherwise
 * the closest lightness that does, on either side. Placement ensures black or white meets
 * the text conditions. The pair report still guarantees 4.5:1 for both text roles.
 *
 * Every built color is converted with `oklabToSrgb`, which applies the gamut mapping and rounds to
 * 8 bits, so the hue of a built color can drift slightly from the seed's. Uses only basic
 * arithmetic, `Math.sqrt`, and the deterministic color functions, in a fixed order, so it returns
 * the same colors in every environment.
 *
 * @param seeds - The seeds used, from `deriveSeeds`. `primary`, `secondary`, and `achromatic`
 *   shape the roles; all three seeds are named in an error.
 * @param mode - The mode to build.
 * @param surfaces - The mode's neutral colors, from `buildNeutralRoles` (its `colors`, as they
 *   are): `surface` and its three containers.
 * @param variant - Accent construction, tonal by default; fidelity preserves algorithm 2.
 * @returns The eight colors, and how each given accent seed appears, for the report.
 * @throws {ColorSchemeError} `PROCESSING_FAILED`, naming the role, the mode, and the seeds, when no
 *   lightness meets a role's minimums. Near-black or near-white accents always permit 6:1 text
 *   and meet 3:1 on the mode's surface; their opposite text extreme also meets the lightness
 *   rule. Failure is therefore an internal invariant violation, a bug.
 */
export function buildAccentRoles(
  seeds: SchemeSeeds,
  mode: "light" | "dark",
  surfaces: AccentSurfaces,
  variant: ColorSchemeVariant = "tonal",
): AccentRoles {
  const surface = surfaces.surface;
  const surfaceLab = oklabOf(surface);
  const context: Context = {
    seeds,
    variant,
    mode,
    parameters: mode === "light" ? LIGHT : DARK,
    surface,
    surfaceLabs: [
      surfaceLab,
      oklabOf(surfaces.surfaceContainerLow),
      oklabOf(surfaces.surfaceContainer),
      oklabOf(surfaces.surfaceContainerHigh),
    ],
    builtLightness: builtContainerLightness(surface, mode),
  };
  const primary = buildFamily(PRIMARY, seeds.achromatic, context);
  const secondary = buildFamily(SECONDARY, false, context);

  const adjustments: SeedAdjustmentInput[] = [];
  if (seeds.primary.source === "given") adjustments.push(primary.adjustment);
  if (seeds.secondary.source === "given") adjustments.push(secondary.adjustment);

  return {
    colors: {
      primary: primary.accent,
      onPrimary: primary.onAccent,
      primaryContainer: primary.container,
      onPrimaryContainer: primary.onContainer,
      secondary: secondary.accent,
      onSecondary: secondary.onAccent,
      secondaryContainer: secondary.container,
      onSecondaryContainer: secondary.onContainer,
    },
    adjustments,
  };
}

/** `surface` and its three containers, in Oklab, in that order. */
type Surfaces = readonly [Oklab, Oklab, Oklab, Oklab];

/** What every family of one call shares. */
interface Context {
  readonly variant: ColorSchemeVariant;
  readonly seeds: SchemeSeeds;
  readonly mode: "light" | "dark";
  readonly parameters: ModeParameters;
  readonly surface: Srgb;
  /** `surface` and its three containers, in Oklab. */
  readonly surfaceLabs: Surfaces;
  /** Oklab lightness of the built containers. */
  readonly builtLightness: number;
}

/** Builds one family from its seed, as {@link buildAccentRoles} describes. */
function buildFamily(family: Family, achromatic: boolean, context: Context): FamilyColors {
  const { seeds, mode, parameters, surface } = context;
  const light = mode === "light";
  const seedColor = parseHex(seeds[family.accent].hex);
  const seed = oklabOf(seedColor);
  // The family's hue: the seed's Oklab a and b, or none for an achromatic primary.
  const a = achromatic ? 0 : seed.a;
  const b = achromatic ? 0 : seed.b;

  // Text keeps the family's hue, with its chroma capped; black and white are still candidates.
  const chroma = Math.sqrt(a * a + b * b);
  const scale = chroma <= ON_ACCENT_CHROMA_CAP ? 1 : ON_ACCENT_CHROMA_CAP / chroma;
  const textA = a * scale;
  const textB = b * scale;
  const textRequirement: RoleRequirement = {
    minContrast: ON_ACCENT_TARGET_CONTRAST + CONTRAST_MARGIN,
    minLightnessDifference: family.onAccentRequirement.minLightnessDifference,
  };
  // The extremes maximize both contrast and lightness distance on their side of any sRGB
  // background. A text search always tries them, regardless of its hue or start, so testing
  // them decides existence without replaying hundreds of candidates for an impossible search.
  const allowsText = (color: Srgb): boolean =>
    meets(BLACK, color, textRequirement) || meets(WHITE, color, textRequirement);

  // An achromatic primary also has to be near black or near white already.
  const inAccent =
    meets(seedColor, surface, family.accentRequirement) &&
    allowsText(seedColor) &&
    (!achromatic ||
      (light ? seed.L <= parameters.achromaticBound : seed.L >= parameters.achromaticBound));

  const builtAccent = (start: number): Srgb => {
    const first = findOrThrow(family.accent, mode, seeds, {
      start,
      a,
      b,
      backgrounds: [surface],
      minContrast: family.accentRequirement.minContrast,
      minLightnessDifference: family.accentRequirement.minLightnessDifference,
      prefer: parameters.accentSide,
    });
    if (allowsText(first.color)) return first.color;
    for (let step = 1; ; step++) {
      const L = first.L + (light ? -step : step) * LIGHTNESS_STEP;
      const candidate = oklabToSrgb(L, a, b);
      if (meets(candidate, surface, family.accentRequirement) && allowsText(candidate)) {
        return candidate;
      }
      if (light ? L <= 0 : L >= 1) return noColor(family.accent, mode, seeds);
    }
  };

  let accent: Srgb;
  let container: Srgb;
  if (context.variant === "tonal" && !achromatic) {
    const tonal = buildTonalAccent(family, context, seed, allowsText);
    accent = tonal.accent;
    container = tonal.container;
  } else if (inAccent || achromatic) {
    accent = inAccent ? seedColor : builtAccent(parameters.achromaticAccent);
    container = oklabToSrgb(context.builtLightness, a, b);
  } else {
    container = seedContainer(seedColor, seed, light, context.surfaceLabs);
    const gap = light ? -ACCENT_CONTAINER_GAP : ACCENT_CONTAINER_GAP;
    accent = builtAccent(oklabOf(container).L + gap);
  }

  const onAccent = findOrThrow(family.onAccent, mode, seeds, {
    start: parameters.onAccent,
    a: textA,
    b: textB,
    backgrounds: [accent],
    minContrast: textRequirement.minContrast,
    minLightnessDifference: family.onAccentRequirement.minLightnessDifference,
    prefer: parameters.onAccentSide,
  }).color;
  const onContainer = findOrThrow(family.onContainer, mode, seeds, {
    start: parameters.onContainer,
    a: textA,
    b: textB,
    backgrounds: [container],
    minContrast: family.onContainerRequirement.minContrast,
    minLightnessDifference: family.onContainerRequirement.minLightnessDifference,
    prefer: parameters.onContainerSide,
  }).color;

  // Tonal and achromatic primary always report X; fidelity may carry a seed in its container.
  const inContainer = context.variant === "fidelity" && !inAccent && !achromatic;
  return {
    accent,
    onAccent,
    container,
    onContainer,
    adjustment: {
      seed: family.accent,
      seedColor,
      role: inContainer ? family.container : family.accent,
      roleColor: inContainer ? container : accent,
    },
  };
}

/**
 * Builds a tonal accent from its fixed tone outward, testing each final 8-bit candidate for
 * surface contrast and existence of 6:1 text with the lightness rule. The container shares its
 * hue and requested chroma at builtContainerLightness. Derived secondary uses the primary
 * direction before seed rounding; its reported seed stays the same as fidelity's. A gray
 * derived secondary has no chroma. Text is built separately with the existing seed-based cap.
 */
function buildTonalAccent(
  family: Family,
  context: Context,
  seed: Oklab,
  allowsText: (color: Srgb) => boolean,
): { readonly accent: Srgb; readonly container: Srgb } {
  const { seeds, mode, surface } = context;
  const derived = family.accent === "secondary" && seeds.secondary.source === "derived";
  const direction = derived ? oklabOf(parseHex(seeds.primary.hex)) : seed;
  const chroma = Math.sqrt(direction.a * direction.a + direction.b * direction.b);
  const seedChroma = derived ? chroma * SECONDARY_CHROMA_RATIO : chroma;
  const cap = family.accent === "primary" ? TONAL_PRIMARY_CHROMA_CAP : TONAL_SECONDARY_CHROMA_CAP;
  const requested = derived && seeds.achromatic ? 0 : Math.min(seedChroma, cap);
  const scale = chroma > 0 ? requested / chroma : 0;
  const a = direction.a * scale;
  const b = direction.b * scale;
  const light = mode === "light";
  const start = light ? TONAL_ACCENT_LIGHTNESS_LIGHT : TONAL_ACCENT_LIGHTNESS_DARK;
  for (let step = 0; ; step++) {
    const L = start + (light ? -step : step) * LIGHTNESS_STEP;
    const accent = oklabToSrgb(L, a, b);
    if (meets(accent, surface, family.accentRequirement) && allowsText(accent)) {
      return { accent, container: oklabToSrgb(context.builtLightness, a, b) };
    }
    if (light ? L <= 0 : L >= 1) return noColor(family.accent, mode, seeds);
  }
}

/**
 * The container that carries a seed: the seed itself when it stands apart from the surfaces, and
 * otherwise the first color, moving toward the accent side from the seed's lightness by
 * `LIGHTNESS_STEP`, that does, keeping the seed's Oklab a and b. Black (light mode) or white (dark
 * mode) ends the search and is returned without the check, which is safe: it stands apart from
 * every set of surfaces that `buildNeutralRoles` makes. The search stops long before it: the
 * largest move over every `#RGB` seed and 50,000 random seed combinations is 0.333 (`#000000` to
 * `#363636` in dark mode), about 170 of the at most 512 steps.
 */
function seedContainer(seedColor: Srgb, seed: Oklab, light: boolean, surfaces: Surfaces): Srgb {
  if (standsApart(seed, light, surfaces)) return seedColor;
  for (let step = 1; ; step++) {
    const L = light ? seed.L - step * LIGHTNESS_STEP : seed.L + step * LIGHTNESS_STEP;
    const end = light ? !(L > 0) : !(L < 1);
    const color = oklabToSrgb(L, seed.a, seed.b);
    if (end || standsApart(oklabOf(color), light, surfaces)) return color;
  }
}

/**
 * Whether a container color stands apart from the surfaces: it is not on the wrong side of
 * `surface`, the first of them (lighter in light mode, darker in dark mode), and its Oklab
 * distance from each of them is at least {@link SEED_CONTAINER_MIN_DISTANCE}. A `NaN` fails.
 */
function standsApart(color: Oklab, light: boolean, surfaces: Surfaces): boolean {
  const surface = surfaces[0];
  if (!(light ? color.L <= surface.L : color.L >= surface.L)) return false;
  for (const other of surfaces) {
    const dL = color.L - other.L;
    const da = color.a - other.a;
    const db = color.b - other.b;
    if (!(Math.sqrt(dL * dL + da * da + db * db) >= SEED_CONTAINER_MIN_DISTANCE)) return false;
  }
  return true;
}

/** Whether a color meets a requirement on a background. A `NaN` measure fails. */
function meets(color: Srgb, background: Srgb, requirement: RoleRequirement): boolean {
  if (!(contrastRatio(color, background) >= requirement.minContrast)) return false;
  const { minLightnessDifference } = requirement;
  return (
    minLightnessDifference === undefined ||
    lightnessDifference(color, background) >= minLightnessDifference
  );
}

/** Oklab of an 8-bit color. */
function oklabOf(color: Srgb): Oklab {
  return srgbToOklab(color.r, color.g, color.b);
}

/** Oklab lightness of the 8-bit gray that `oklabToSrgb` gives for a lightness. */
function grayLightness(lightness: number): number {
  return oklabOf(oklabToSrgb(lightness, 0, 0)).L;
}
