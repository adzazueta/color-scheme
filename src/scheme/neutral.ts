import { contrastRatio, lightnessDifference } from "@/color/contrast.js";
import { oklabToSrgb } from "@/color/gamut.js";
import { parseHex } from "@/color/hex.js";
import { srgbToOklab } from "@/color/oklab.js";
import type { Srgb } from "@/color/types.js";
import type { SchemeSeeds } from "@/scheme/derive.js";
import { requirementOf, type RoleRequirement, type SeedAdjustmentInput } from "@/scheme/report.js";
import { findOrThrow, type LightnessMatch } from "@/scheme/search.js";

/**
 * Highest Oklab chroma, √(a² + b²), of the neutral roles. Unit: Oklab chroma. A parameter of the
 * specification, section 4.1.
 *
 * A neutral seed with more chroma has its Oklab a and b scaled down to this chroma, which keeps
 * its hue; one with this chroma or less keeps its own. 0.04 is two just noticeable differences
 * (the JND of gamut mapping). Pale creams such as `#fff8e7` (0.024) and `#f5f0e6` (0.014), ivory
 * (0.020), linen (0.017), parchment (`#f1e9d2`, 0.032), `cornsilk` (0.037), and `papayawhip`
 * (0.038) are within it, so they can be the light-mode `surface` exactly; a saturated cream such
 * as `#fffdd0` (0.058) is capped. Surfaces and text still read as tinted grays rather than as
 * colors. The cap applies to the Oklab color before gamut mapping and 8-bit rounding, which can
 * leave a final color slightly above it: at most 0.0421 over every `#RGB` neutral seed, given or
 * derived, in both modes.
 */
export const NEUTRAL_CHROMA_CAP = 0.04;

/**
 * Oklab lightness of the light-mode `surface` when the neutral seed is not light enough to keep its
 * own (see {@link buildNeutralRoles}). Unit: Oklab lightness, 0 to 1. A parameter of the
 * specification, section 4.1.
 *
 * 0.98 is a tinted near-white, about Material 3's tone 98. It equals `NEUTRAL_LIGHTNESS` in
 * `derive.ts`: a derived neutral is light and within {@link NEUTRAL_CHROMA_CAP}, so it is the
 * light-mode `surface` exactly, and it then has about the same lightness (derived neutrals measure
 * 0.9735 to 0.9813) as the surface of a neutral seed that is not light.
 */
export const SURFACE_LIGHTNESS_LIGHT = 0.98;

/**
 * Lowest Oklab lightness of a neutral seed that can be the light-mode `surface`, exactly or at its
 * own lightness with its chroma capped. Unit: Oklab lightness, 0 to 1. A parameter of the
 * specification, section 4.1.
 *
 * A neutral seed is light when its lightness is at least this and black text meets the
 * `onSurface` minimums on the four surfaces built from it (see {@link buildNeutralRoles}). 0.9 is
 * about the darkest light surface of Material 3, `surfaceDim` (tone 87, about 0.89): white,
 * cream, and light gray backgrounds such as `#e0e0e0` (0.91) stay the surface, while a darker
 * seed, such as `#d3d3d3` (0.87) or a mid-light gray whose text would have to be nearly black,
 * gives only its hue and capped chroma to a surface at {@link SURFACE_LIGHTNESS_LIGHT}. From 0.9,
 * the containers stay at 0.84 or more, where black text has far more than 7:1, so the contrast
 * check does not decide for any `#RGB` seed; it stays as a guard.
 */
export const LIGHT_SURFACE_MIN_LIGHTNESS = 0.9;

/**
 * Oklab lightness of the dark-mode `surface`. Unit: Oklab lightness, 0 to 1. A parameter of the
 * specification, section 4.1.
 *
 * 0.2 is a tinted near-black, between Material 3's tone 6 (its dark surface, about 0.19) and tone
 * 7, dark enough for a dark theme and light enough to leave visible steps below the containers. The dark-mode surface always has this
 * lightness: a neutral seed light enough to be a light-mode surface cannot be a dark one.
 */
export const SURFACE_LIGHTNESS_DARK = 0.2;

/**
 * Oklab lightness from one surface to the next in light mode, from `surface` to
 * `surfaceContainerLow`, `surfaceContainer`, and `surfaceContainerHigh`. Unit: Oklab lightness;
 * negative is darker. A parameter of the specification, section 4.1.
 *
 * The containers step toward the text side, as in Material 3, so each one has a little less
 * contrast with the text than the one before. -0.02 is about Material 3's two tones between
 * containers (about 0.017 in Oklab), rounded up so the steps stay visible on tinted surfaces: from
 * 0.98, the containers are at 0.96, 0.94, and 0.92.
 */
export const SURFACE_CONTAINER_STEP_LIGHT = -0.02;

/**
 * Oklab lightness from one surface to the next in dark mode, from `surface` to
 * `surfaceContainerLow`, `surfaceContainer`, and `surfaceContainerHigh`. Unit: Oklab lightness;
 * positive is lighter. A parameter of the specification, section 4.1.
 *
 * The containers step toward the text side, which is lighter in dark mode, as in Material 3.
 * Material 3 uses larger steps in dark mode, because small differences between dark colors are
 * hard to see: tones 6, 10, 12, and 17, about 0.19, 0.22, 0.24, and 0.28 in Oklab. 0.03 gives
 * 0.2, 0.23, 0.26, and 0.29, whose luminances (at most about 0.026) are far below the 0.0998 that
 * 7:1 white text needs.
 */
export const SURFACE_CONTAINER_STEP_DARK = 0.03;

/**
 * Oklab lightness of a built light-mode container, relative to the surface: the Oklab lightness of
 * the 8-bit light-mode `surface` plus this offset. Unit: Oklab lightness; negative is darker. A
 * parameter of the specification, section 4.1.
 *
 * A built container is an accent or status container that the package makes rather than takes
 * from a seed: `primaryContainer` or `secondaryContainer` when the seed is the accent role itself,
 * the `primaryContainer` of an achromatic `primary`, and the four status containers. Accent and
 * status containers share it, so every built container sits at the same lightness.
 *
 * -0.1 is five times {@link SURFACE_CONTAINER_STEP_LIGHT}: two steps (0.04, two just noticeable
 * differences) beyond `surfaceContainerHigh`, so a container with little or no chroma stands apart
 * from the four surfaces about as far as a seed container must (`SEED_CONTAINER_MIN_DISTANCE` in
 * `accent.ts`); rounding to 8 bits can bring it to 0.037. It is relative because a light neutral
 * seed can be the surface at any lightness from {@link LIGHT_SURFACE_MIN_LIGHTNESS} to 1: a fixed
 * lightness would fall among the surfaces of a darker one, and on a surface of 0.9 a container at
 * 0.9 would be the surface itself. On the surface of {@link SURFACE_LIGHTNESS_LIGHT} it gives about
 * 0.88, a little darker than Material 3's container tone 90 (0.91 for a gray).
 */
export const CONTAINER_LIGHTNESS_OFFSET_LIGHT = -0.1;

/**
 * Oklab lightness of a built dark-mode container (see {@link CONTAINER_LIGHTNESS_OFFSET_LIGHT}),
 * shared by the accent and status containers. Unit: Oklab lightness, 0 to 1. A parameter of the
 * specification, section 4.1.
 *
 * About Material 3's container tone 30 (0.40 for a gray): a deep shade, lighter than every
 * dark-mode surface, as in Material 3. The dark-mode surface always has
 * {@link SURFACE_LIGHTNESS_DARK}, so a fixed value keeps the same distance from the surfaces: 0.11
 * above `surfaceContainerHigh` (0.29).
 */
export const CONTAINER_LIGHTNESS_DARK = 0.4;

/**
 * Oklab lightness that the search for the light-mode `onSurface` starts from. Unit: Oklab
 * lightness, 0 to 1. A parameter of the specification, section 4.1.
 *
 * About Material 3's tone 10. The search returns it when it meets 7:1 and the lightness rule on
 * the four surfaces, which it does for every `#RGB` neutral seed, and otherwise the closest
 * darker lightness that meets them.
 */
export const ON_SURFACE_LIGHTNESS_LIGHT = 0.22;

/**
 * Oklab lightness that the search for the dark-mode `onSurface` starts from. Unit: Oklab
 * lightness, 0 to 1. A parameter of the specification, section 4.1.
 *
 * About Material 3's tone 90: light text that is not pure white, which glares on a dark surface.
 */
export const ON_SURFACE_LIGHTNESS_DARK = 0.91;

/**
 * Oklab lightness that the search for the light-mode `onSurfaceVariant` starts from. Unit: Oklab
 * lightness, 0 to 1. A parameter of the specification, section 4.1.
 *
 * About Material 3's tone 30: clearly lighter than `onSurface`, for secondary text, and still
 * above 4.5:1 on the four parameter surfaces.
 */
export const ON_SURFACE_VARIANT_LIGHTNESS_LIGHT = 0.4;

/**
 * Oklab lightness that the search for the dark-mode `onSurfaceVariant` starts from. Unit: Oklab
 * lightness, 0 to 1. A parameter of the specification, section 4.1.
 *
 * About Material 3's tone 80.
 */
export const ON_SURFACE_VARIANT_LIGHTNESS_DARK = 0.83;

/**
 * Oklab lightness that the search for the light-mode `outline` starts from. Unit: Oklab
 * lightness, 0 to 1. A parameter of the specification, section 4.1.
 *
 * About Material 3's tone 50: a border lighter than the text roles. It reaches 3:1 on the four
 * parameter surfaces; on the surfaces of a light seed near {@link LIGHT_SURFACE_MIN_LIGHTNESS},
 * the search darkens it as needed.
 */
export const OUTLINE_LIGHTNESS_LIGHT = 0.57;

/**
 * Oklab lightness that the search for the dark-mode `outline` starts from. Unit: Oklab lightness,
 * 0 to 1. A parameter of the specification, section 4.1.
 *
 * About Material 3's tone 60.
 */
export const OUTLINE_LIGHTNESS_DARK = 0.66;

/**
 * Where `outlineVariant` sits, in Oklab lightness, from `surfaceContainerHigh` (0) to `outline`
 * (1), in both modes. Unit: fraction from 0 to 1. A parameter of the specification, section 4.1.
 *
 * `outlineVariant` is decorative and has no contrast minimum, so it is not searched: it is placed
 * between the surfaces and `outline`, which keeps it in that order on every surface, including
 * one kept from a light seed. 0.3 is where Material 3 places it (tones 92, 80, and 50 in light
 * mode and 17, 30, and 60 in dark mode give 0.28 and 0.30 in Oklab): a divider that is visible
 * on every surface and much softer than `outline`.
 */
export const OUTLINE_VARIANT_POSITION = 0.3;

/**
 * Oklab lightness of the light-mode `inverseSurface`. Unit: Oklab lightness, 0 to 1. A parameter
 * of the specification, section 4.1.
 *
 * About Material 3's tone 20: a dark surface for elements that stand out from a light interface,
 * such as snackbars.
 */
export const INVERSE_SURFACE_LIGHTNESS_LIGHT = 0.31;

/**
 * Oklab lightness of the dark-mode `inverseSurface`. Unit: Oklab lightness, 0 to 1. A parameter
 * of the specification, section 4.1.
 *
 * About Material 3's tone 90: a light surface that stands out from a dark interface.
 */
export const INVERSE_SURFACE_LIGHTNESS_DARK = 0.91;

/**
 * Oklab lightness that the search for the light-mode `onInverseSurface` starts from. Unit: Oklab
 * lightness, 0 to 1. A parameter of the specification, section 4.1.
 *
 * About Material 3's tone 95: light text on the dark `inverseSurface`.
 */
export const ON_INVERSE_SURFACE_LIGHTNESS_LIGHT = 0.96;

/**
 * Oklab lightness that the search for the dark-mode `onInverseSurface` starts from. Unit: Oklab
 * lightness, 0 to 1. A parameter of the specification, section 4.1.
 *
 * About Material 3's tone 20: dark text on the light `inverseSurface`.
 */
export const ON_INVERSE_SURFACE_LIGHTNESS_DARK = 0.31;

/** The ten roles built from the `neutral` seed, in the order of `Role`. */
export type NeutralRole =
  | "surface"
  | "surfaceContainerLow"
  | "surfaceContainer"
  | "surfaceContainerHigh"
  | "onSurface"
  | "onSurfaceVariant"
  | "outline"
  | "outlineVariant"
  | "inverseSurface"
  | "onInverseSurface";

/** The neutral roles of one mode, built by {@link buildNeutralRoles}. */
export interface NeutralRoles {
  /** The color of each neutral role, with its keys in the order of `Role`. */
  readonly colors: Readonly<Record<NeutralRole, Srgb>>;
  /**
   * How the neutral seed appears in this mode: the seed's color and the `surface` that carries
   * it, for `buildModeReport`, which computes `exact` and `lightnessShift`. The report lists it
   * only when the neutral seed is given.
   */
  readonly adjustment: SeedAdjustmentInput;
}

/** The parameters of one mode. */
interface ModeParameters {
  readonly surface: number;
  readonly containerStep: number;
  readonly onSurface: number;
  readonly onSurfaceVariant: number;
  readonly outline: number;
  readonly inverseSurface: number;
  readonly onInverseSurface: number;
  /** Side of the text and borders on the surfaces, tried first on ties. */
  readonly text: "lighter" | "darker";
  /** Side of `onInverseSurface` on `inverseSurface`. */
  readonly inverseText: "lighter" | "darker";
}

const LIGHT: ModeParameters = {
  surface: SURFACE_LIGHTNESS_LIGHT,
  containerStep: SURFACE_CONTAINER_STEP_LIGHT,
  onSurface: ON_SURFACE_LIGHTNESS_LIGHT,
  onSurfaceVariant: ON_SURFACE_VARIANT_LIGHTNESS_LIGHT,
  outline: OUTLINE_LIGHTNESS_LIGHT,
  inverseSurface: INVERSE_SURFACE_LIGHTNESS_LIGHT,
  onInverseSurface: ON_INVERSE_SURFACE_LIGHTNESS_LIGHT,
  text: "darker",
  inverseText: "lighter",
};

const DARK: ModeParameters = {
  surface: SURFACE_LIGHTNESS_DARK,
  containerStep: SURFACE_CONTAINER_STEP_DARK,
  onSurface: ON_SURFACE_LIGHTNESS_DARK,
  onSurfaceVariant: ON_SURFACE_VARIANT_LIGHTNESS_DARK,
  outline: OUTLINE_LIGHTNESS_DARK,
  inverseSurface: INVERSE_SURFACE_LIGHTNESS_DARK,
  onInverseSurface: ON_INVERSE_SURFACE_LIGHTNESS_DARK,
  text: "lighter",
  inverseText: "darker",
};

const ON_SURFACE: RoleRequirement = requirementOf("onSurface");
const ON_SURFACE_VARIANT: RoleRequirement = requirementOf("onSurfaceVariant");
const OUTLINE: RoleRequirement = requirementOf("outline");
const ON_INVERSE_SURFACE: RoleRequirement = requirementOf("onInverseSurface");

const BLACK: Srgb = { r: 0, g: 0, b: 0 };

/**
 * Builds the ten neutral roles of one mode from the `neutral` seed, given or derived
 * (specification, sections 3.1 and 4). Every role keeps the seed's hue, with its Oklab a and b
 * scaled down to {@link NEUTRAL_CHROMA_CAP} when its chroma is higher.
 *
 * **Surfaces.** `surfaceContainerLow`, `surfaceContainer`, and `surfaceContainerHigh` are one, two,
 * and three steps from the surface's Oklab lightness ({@link SURFACE_CONTAINER_STEP_LIGHT} or
 * {@link SURFACE_CONTAINER_STEP_DARK}), toward the text side.
 *
 * The neutral seed is the exception to the fidelity rule of the specification, by which a seed
 * that misses its contrast has its lightness adjusted by the minimum needed:
 *
 * - In light mode, a light seed is the `surface` exactly, so a cream or white background appears
 *   as given, or, when its chroma is above the cap, the `surface` is at the seed's lightness with
 *   its chroma capped. The seed is light when its Oklab lightness is at least
 *   {@link LIGHT_SURFACE_MIN_LIGHTNESS} and black text meets the `onSurface` minimums (7:1 and the
 *   lightness rule, each plus its margin) on the four surfaces built at that lightness: they are
 *   then on the dark-text side of the 7:1 threshold, so every text and border role can meet its
 *   minimums on all of them. Any other seed gives only its hue and capped chroma, to a `surface`
 *   at {@link SURFACE_LIGHTNESS_LIGHT}.
 * - In dark mode, the `surface` always takes the seed's hue and capped chroma at
 *   {@link SURFACE_LIGHTNESS_DARK}: a seed light enough to be a light-mode surface cannot be a dark
 *   one, and a dark theme keeps the same depth whatever the seed.
 *
 * **Text and borders.** `onSurface`, `onSurfaceVariant`, and `outline` are found with
 * `findOrThrow` on the four surfaces, from their start lightness, aiming for the minimums of
 * `requirementOf`: their WCAG minimum plus the contrast margin, and, for the two text roles, the
 * lightness rule plus its margin. Each is its start lightness when that meets the minimums, and otherwise the
 * closest lightness that does, which is always on the text side. `outlineVariant` has no minimum:
 * it sits {@link OUTLINE_VARIANT_POSITION} of the way from `surfaceContainerHigh` to `outline`.
 *
 * **Inverse.** `inverseSurface` takes the seed's hue and capped chroma at
 * {@link INVERSE_SURFACE_LIGHTNESS_LIGHT} or {@link INVERSE_SURFACE_LIGHTNESS_DARK}, and
 * `onInverseSurface` is found on it like the text roles.
 *
 * Every color is converted with `oklabToSrgb`, which applies the gamut mapping and rounds to 8
 * bits. Uses only basic arithmetic, `Math.sqrt`, and the deterministic color functions, in a fixed
 * order, so it returns the same colors in every environment.
 *
 * @param seeds - The seeds used, from `deriveSeeds`. Only the `neutral` seed shapes the roles; all
 *   three are named in an error.
 * @param mode - The mode to build.
 * @returns The ten colors, and the seed and `surface` colors for the report.
 * @throws {ColorSchemeError} `PROCESSING_FAILED`, naming the role, the mode, and the seeds, when no
 *   lightness meets a role's minimums. The parameters are chosen so that this never happens: it
 *   would be a bug.
 */
export function buildNeutralRoles(seeds: SchemeSeeds, mode: "light" | "dark"): NeutralRoles {
  const parameters = mode === "light" ? LIGHT : DARK;
  const step = parameters.containerStep;

  const seedColor = parseHex(seeds.neutral.hex);
  const seed = srgbToOklab(seedColor.r, seedColor.g, seedColor.b);
  const chroma = Math.sqrt(seed.a * seed.a + seed.b * seed.b);
  const withinCap = chroma <= NEUTRAL_CHROMA_CAP;
  const scale = withinCap ? 1 : NEUTRAL_CHROMA_CAP / chroma;
  const a = seed.a * scale;
  const b = seed.b * scale;

  let surfaceLightness = parameters.surface;
  let surfaces: readonly [Srgb, Srgb, Srgb, Srgb] | undefined;
  if (mode === "light" && seed.L >= LIGHT_SURFACE_MIN_LIGHTNESS) {
    // A light seed keeps its lightness, and is the surface itself when within the chroma cap.
    const surface = withinCap ? seedColor : oklabToSrgb(seed.L, a, b);
    const family = surfaceFamily(surface, seed.L, a, b, step);
    if (blackMeets(family, ON_SURFACE)) {
      surfaceLightness = seed.L;
      surfaces = family;
    }
  }
  if (surfaces === undefined) {
    surfaces = surfaceFamily(oklabToSrgb(surfaceLightness, a, b), surfaceLightness, a, b, step);
  }

  const find = (role: NeutralRole, start: number, requirement: RoleRequirement): LightnessMatch =>
    findOrThrow(role, mode, seeds, {
      start,
      a,
      b,
      backgrounds: surfaces,
      minContrast: requirement.minContrast,
      minLightnessDifference: requirement.minLightnessDifference,
      prefer: parameters.text,
    });
  const onSurface = find("onSurface", parameters.onSurface, ON_SURFACE);
  const onSurfaceVariant = find(
    "onSurfaceVariant",
    parameters.onSurfaceVariant,
    ON_SURFACE_VARIANT,
  );
  const outline = find("outline", parameters.outline, OUTLINE);

  const highestLightness = surfaceLightness + 3 * step;
  const outlineVariant = oklabToSrgb(
    highestLightness + OUTLINE_VARIANT_POSITION * (outline.L - highestLightness),
    a,
    b,
  );

  const inverseSurface = oklabToSrgb(parameters.inverseSurface, a, b);
  const onInverseSurface = findOrThrow("onInverseSurface", mode, seeds, {
    start: parameters.onInverseSurface,
    a,
    b,
    backgrounds: [inverseSurface],
    minContrast: ON_INVERSE_SURFACE.minContrast,
    minLightnessDifference: ON_INVERSE_SURFACE.minLightnessDifference,
    prefer: parameters.inverseText,
  });

  return {
    colors: {
      surface: surfaces[0],
      surfaceContainerLow: surfaces[1],
      surfaceContainer: surfaces[2],
      surfaceContainerHigh: surfaces[3],
      onSurface: onSurface.color,
      onSurfaceVariant: onSurfaceVariant.color,
      outline: outline.color,
      outlineVariant,
      inverseSurface,
      onInverseSurface: onInverseSurface.color,
    },
    adjustment: { seed: "neutral", seedColor, role: "surface", roleColor: surfaces[0] },
  };
}

/**
 * The surface and its three containers: `surface` itself, then the colors one, two, and three
 * steps from its Oklab lightness `L`, with Oklab `a` and `b`.
 */
function surfaceFamily(
  surface: Srgb,
  L: number,
  a: number,
  b: number,
  step: number,
): readonly [Srgb, Srgb, Srgb, Srgb] {
  return [
    surface,
    oklabToSrgb(L + step, a, b),
    oklabToSrgb(L + 2 * step, a, b),
    oklabToSrgb(L + 3 * step, a, b),
  ];
}

/** Whether black meets a requirement on every background. A `NaN` measure fails. */
function blackMeets(backgrounds: readonly Srgb[], requirement: RoleRequirement): boolean {
  const { minContrast, minLightnessDifference } = requirement;
  for (const background of backgrounds) {
    if (!(contrastRatio(BLACK, background) >= minContrast)) return false;
    if (
      minLightnessDifference !== undefined &&
      !(lightnessDifference(BLACK, background) >= minLightnessDifference)
    ) {
      return false;
    }
  }
  return true;
}
