import { oklabToSrgb } from "@/color/gamut.js";
import type { Srgb } from "@/color/types.js";
import type { SchemeSeeds } from "@/scheme/derive.js";
import { builtContainerLightness } from "@/scheme/neutral.js";
import { requirementOf, type RoleRequirement } from "@/scheme/report.js";
import { findOrThrow } from "@/scheme/search.js";

/** A status color's fixed hue: a direction in the Oklab a-b plane, as a unit vector. */
export interface StatusHue {
  /** Cosine of the hue angle: the a component of the unit vector. */
  readonly a: number;
  /** Sine of the hue angle: the b component of the unit vector. */
  readonly b: number;
}

/**
 * Hue of `error`: 28° in OKLCH, a red a little toward pink, like Material 3's error reds
 * (`#b3261e` is 28.7° and `#ba1a1a` 27.7°); a pure red, sRGB `#ff0000`, is 29.2°. Unit: degrees
 * (the vector is unitless). A parameter of the specification, section 4.1.
 *
 * 28° is a recognizable red, and it sits 47° from {@link WARNING_HUE}, so an error is never
 * mistaken for a warning. The vector is (cos 28°, sin 28°), computed offline so that no
 * trigonometry runs at runtime.
 */
export const ERROR_HUE: StatusHue = {
  a: 0.882947592858927,
  b: 0.4694715627858908,
};

/**
 * Hue of `warning`: 75° in OKLCH, an amber (between orange and yellow). Unit: degrees. A parameter
 * of the specification, section 4.1.
 *
 * Amber is the conventional warning color. 75° keeps 47° from {@link ERROR_HUE} (a hue closer to
 * orange would be confused with the red) and 70° from {@link SUCCESS_HUE}, and it stays
 * orange-yellow rather than olive at low lightness. The vector is (cos 75°, sin 75°).
 */
export const WARNING_HUE: StatusHue = {
  a: 0.25881904510252074,
  b: 0.9659258262890683,
};

/**
 * Hue of `success`: 145° in OKLCH, a green with a slight blue tint (sRGB `#00ff00` is 142.5°).
 * Unit: degrees. A parameter of the specification, section 4.1.
 *
 * A pure green reads as success and is far from the amber and blue. The vector is (cos 145°,
 * sin 145°).
 */
export const SUCCESS_HUE: StatusHue = {
  a: -0.8191520442889919,
  b: 0.5735764363510459,
};

/**
 * Hue of `info`: 250° in OKLCH, a blue (sRGB `#0000ff` is 264°, and Material 3 blues are near
 * 255°). Unit: degrees. A parameter of the specification, section 4.1.
 *
 * 250° is a clear blue that stays blue, not violet, when the lightness changes, and is far from
 * {@link SUCCESS_HUE}. The vector is (cos 250°, sin 250°).
 */
export const INFO_HUE: StatusHue = {
  a: -0.34202014332566855,
  b: -0.9396926207859084,
};

/** The four status colors. */
export type StatusName = "error" | "warning" | "success" | "info";

/** The sixteen status roles, in the order of `Role`. */
export type StatusRole =
  | "error"
  | "onError"
  | "errorContainer"
  | "onErrorContainer"
  | "warning"
  | "onWarning"
  | "warningContainer"
  | "onWarningContainer"
  | "success"
  | "onSuccess"
  | "successContainer"
  | "onSuccessContainer"
  | "info"
  | "onInfo"
  | "infoContainer"
  | "onInfoContainer";

/** The parameters of one status color in one mode. */
export interface StatusModeParameters {
  /** Oklab chroma of `X`, before gamut mapping, which may lower it. */
  readonly chroma: number;
  /** Oklab lightness that the search for `X` starts from. */
  readonly lightness: number;
  /** Oklab lightness that the search for `onX` starts from. */
  readonly onLightness: number;
}

/** The parameters of the container roles of every status color in one mode. */
export interface StatusContainerParameters {
  /** Oklab chroma of `XContainer`, before gamut mapping. */
  readonly chroma: number;
  /** Oklab lightness that the search for `onXContainer` starts from. */
  readonly onLightness: number;
}

/**
 * Oklab chroma of `onX` and `onXContainer`, before gamut mapping, in both modes. Unit: Oklab
 * chroma. A parameter of the specification, section 4.1.
 *
 * Text takes the status hue with a little chroma, so dark text on a light container reads as a
 * dark red, amber, green, or blue, as in Material 3 (`onErrorContainer` is a dark red). 0.03 keeps
 * the tint subtle. White (`onX` in light mode, from lightness 1) has no chroma whatever this
 * value is.
 */
export const STATUS_ON_CHROMA = 0.03;

/**
 * Oklab lightness that the search for the dark-mode `onX` starts from. Unit: Oklab lightness, 0 to
 * 1. A parameter of the specification, section 4.1.
 *
 * About Material 3's tone 20: dark text on the light `X` of dark mode. It equals
 * `ON_ACCENT_LIGHTNESS_DARK` in `accent.ts`, so status and accent text match.
 */
export const STATUS_ON_LIGHTNESS_DARK = 0.31;

/**
 * Oklab lightness that the search for the light-mode `onXContainer` starts from. Unit: Oklab
 * lightness, 0 to 1. A parameter of the specification, section 4.1.
 *
 * Material 3's tone 10: dark text on a pale container. It equals
 * `ON_ACCENT_CONTAINER_LIGHTNESS_LIGHT` in `accent.ts` and `ON_SURFACE_LIGHTNESS_LIGHT`, so status
 * text, accent text, and body text match. The search moves it only if the pair misses its
 * minimums.
 */
export const STATUS_ON_CONTAINER_LIGHTNESS_LIGHT = 0.22;

/**
 * Oklab lightness that the search for the dark-mode `onXContainer` starts from. Unit: Oklab
 * lightness, 0 to 1. A parameter of the specification, section 4.1.
 *
 * About Material 3's tone 90: light text on a deep container. It equals
 * `ON_ACCENT_CONTAINER_LIGHTNESS_DARK` in `accent.ts`.
 */
export const STATUS_ON_CONTAINER_LIGHTNESS_DARK = 0.91;

/**
 * Light-mode parameters of `X` and `onX`, per status color. A parameter of the specification,
 * section 4.1.
 *
 * - `lightness`: 0.5 for `error`, `success`, and `info` is about Material 3's tone 40: dark enough
 *   for white text (`onX`, starting from lightness 1 and so exactly white, which measures 5.6 to
 *   6.6:1: success 5.63, info 5.96, error 6.62) and for 3:1 on every light surface (a lightness of
 *   about 0.67 is the limit on white; the surfaces are from 0.9). `warning` starts at 0.58: an
 *   amber darker than that turns brown, and lighter ones come too close to the 3:1 limit on a
 *   light surface (about 0.60 on a surface of lightness 0.9, so a start of 0.62 would move with
 *   the surface).
 * - `chroma`: 0.19 red, 0.13 amber, 0.15 green, and 0.16 blue. The status colors are among the
 *   most saturated colors of a scheme, as signals should be; a vivid seed can be more saturated as
 *   the accent. Red and green are inside the gamut at their lightness. The in-gamut maximum is
 *   0.142 for blue at 0.5 and 0.122 for amber at 0.58, so 0.16 and 0.13 are gamut mapped, which
 *   lowers their chroma and moves the hue: `info` drifts 2.9°, the most of any status color.
 * - `onLightness`: white (1) for `error`, `success`, and `info`. `onWarning` starts at 0.2, near
 *   black, but that start never meets the minimums on the ochre: the search always darkens it, to
 *   lightness 0.151 (`#130900`).
 */
export const STATUS_LIGHT: Readonly<Record<StatusName, StatusModeParameters>> = {
  error: { chroma: 0.19, lightness: 0.5, onLightness: 1 },
  warning: { chroma: 0.13, lightness: 0.58, onLightness: 0.2 },
  success: { chroma: 0.15, lightness: 0.5, onLightness: 1 },
  info: { chroma: 0.16, lightness: 0.5, onLightness: 1 },
};

/**
 * Dark-mode parameters of `X` and `onX`, per status color. A parameter of the specification,
 * section 4.1.
 *
 * - `lightness`: 0.78 is about Material 3's tone 75: light enough for 3:1 on the dark surface
 *   (lightness 0.2; the limit is about 0.5) and for dark text, and not so light that it glares.
 *   `warning` is 0.82, because amber needs more lightness to stay amber.
 * - `chroma`: 0.14 red, 0.14 amber, 0.14 green, and 0.12 blue. Lighter colors carry less chroma,
 *   as in Material 3. Blue is only in gamut up to about 0.12 at that lightness, and red up to
 *   0.129, below its 0.14, so red is gamut mapped; its hue drift is 0.27°.
 * - `onLightness`: {@link STATUS_ON_LIGHTNESS_DARK}.
 */
export const STATUS_DARK: Readonly<Record<StatusName, StatusModeParameters>> = {
  error: { chroma: 0.14, lightness: 0.78, onLightness: STATUS_ON_LIGHTNESS_DARK },
  warning: { chroma: 0.14, lightness: 0.82, onLightness: STATUS_ON_LIGHTNESS_DARK },
  success: { chroma: 0.14, lightness: 0.78, onLightness: STATUS_ON_LIGHTNESS_DARK },
  info: { chroma: 0.12, lightness: 0.78, onLightness: STATUS_ON_LIGHTNESS_DARK },
};

/**
 * Parameters of the status containers in light mode. A parameter of the specification, section
 * 4.1.
 *
 * The lightness of `XContainer` is not a status parameter: it is the shared built-container
 * lightness (`builtContainerLightness`: the Oklab lightness of the 8-bit light-mode `surface` plus
 * `CONTAINER_LIGHTNESS_OFFSET_LIGHT`, about 0.88 on the default surface and 0.8 to 0.9 over the
 * whole range of light surfaces), the same as the accent containers. `chroma` 0.04 is a visible
 * tint that every hue keeps in gamut over that range, so the rounding to 8 bits and the gamut
 * mapping keep the hue within 2.2° (blue, the most limited, drifts more at higher chroma).
 * `onLightness` is {@link STATUS_ON_CONTAINER_LIGHTNESS_LIGHT}.
 */
export const STATUS_CONTAINER_LIGHT: StatusContainerParameters = {
  chroma: 0.04,
  onLightness: STATUS_ON_CONTAINER_LIGHTNESS_LIGHT,
};

/**
 * Parameters of the status containers in dark mode. A parameter of the specification, section
 * 4.1.
 *
 * The lightness of `XContainer` is the shared `CONTAINER_LIGHTNESS_DARK` (0.4), a deep shade that
 * is distinct from the dark surfaces (0.2 to 0.29). `chroma` 0.07 is the tint: 0.09 is out of
 * gamut at 0.4 (the in-gamut maximum is 0.084) and moves the hue by 2.1°. `onLightness` is
 * {@link STATUS_ON_CONTAINER_LIGHTNESS_DARK}.
 */
export const STATUS_CONTAINER_DARK: StatusContainerParameters = {
  chroma: 0.07,
  onLightness: STATUS_ON_CONTAINER_LIGHTNESS_DARK,
};

/** The four roles of one status family, its hue, and the minimums of its three pairs. */
interface Family {
  readonly hue: StatusHue;
  readonly status: StatusName;
  readonly onStatus: "onError" | "onWarning" | "onSuccess" | "onInfo";
  readonly container: "errorContainer" | "warningContainer" | "successContainer" | "infoContainer";
  readonly onContainer:
    | "onErrorContainer"
    | "onWarningContainer"
    | "onSuccessContainer"
    | "onInfoContainer";
  readonly statusRequirement: RoleRequirement;
  readonly onStatusRequirement: RoleRequirement;
  readonly onContainerRequirement: RoleRequirement;
}

const ERROR: Family = {
  hue: ERROR_HUE,
  status: "error",
  onStatus: "onError",
  container: "errorContainer",
  onContainer: "onErrorContainer",
  statusRequirement: requirementOf("error"),
  onStatusRequirement: requirementOf("onError"),
  onContainerRequirement: requirementOf("onErrorContainer"),
};

const WARNING: Family = {
  hue: WARNING_HUE,
  status: "warning",
  onStatus: "onWarning",
  container: "warningContainer",
  onContainer: "onWarningContainer",
  statusRequirement: requirementOf("warning"),
  onStatusRequirement: requirementOf("onWarning"),
  onContainerRequirement: requirementOf("onWarningContainer"),
};

const SUCCESS: Family = {
  hue: SUCCESS_HUE,
  status: "success",
  onStatus: "onSuccess",
  container: "successContainer",
  onContainer: "onSuccessContainer",
  statusRequirement: requirementOf("success"),
  onStatusRequirement: requirementOf("onSuccess"),
  onContainerRequirement: requirementOf("onSuccessContainer"),
};

const INFO: Family = {
  hue: INFO_HUE,
  status: "info",
  onStatus: "onInfo",
  container: "infoContainer",
  onContainer: "onInfoContainer",
  statusRequirement: requirementOf("info"),
  onStatusRequirement: requirementOf("onInfo"),
  onContainerRequirement: requirementOf("onInfoContainer"),
};

/** The four colors of one family. */
interface FamilyColors {
  readonly status: Srgb;
  readonly onStatus: Srgb;
  readonly container: Srgb;
  readonly onContainer: Srgb;
}

/**
 * Builds the sixteen status roles of one mode (specification, sections 3.1 and 4). The hue of each
 * status color is fixed ({@link ERROR_HUE}, {@link WARNING_HUE}, {@link SUCCESS_HUE},
 * {@link INFO_HUE}) and does not depend on the seeds, not even to harmonize toward `primary`: only
 * lightness and chroma are chosen, and the surface is the only input that changes the result. The
 * hue is kept by using the unit vector as the direction of Oklab's a and b, scaled to the chroma;
 * the gamut mapping inside `oklabToSrgb` can lower chroma and shift the hue slightly.
 *
 * - `X` is found with `findOrThrow` from {@link STATUS_LIGHT} or {@link STATUS_DARK}'s lightness,
 *   on `surface`, aiming for the minimums of `requirementOf(X)` (3:1 plus margin). It prefers the
 *   darker side in light mode and the lighter side in dark mode.
 * - `XContainer` is at the built-container lightness (`builtContainerLightness`) with the chroma
 *   of {@link STATUS_CONTAINER_LIGHT} or {@link STATUS_CONTAINER_DARK}, with no search: it has no
 *   pair with `surface`.
 * - `onX` and `onXContainer` are found on their backgrounds, from their start lightness with
 *   {@link STATUS_ON_CHROMA}, aiming for `requirementOf` (4.5:1 plus margin and the lightness
 *   rule plus margin). They prefer the side away from their background: `onX` compares its start
 *   with the `X` found.
 *
 * @param seeds - The seeds used, only to name them in an error.
 * @param mode - The mode to build.
 * @param surface - The mode's `surface`, from `buildNeutralRoles`.
 * @returns The sixteen colors, with their keys in the order of `Role`.
 * @throws {ColorSchemeError} `PROCESSING_FAILED`, naming the role, the mode, and the seeds, when no
 *   lightness meets a role's minimums. The parameters are chosen so that this never happens: it
 *   would be a bug.
 */
export function buildStatusRoles(
  seeds: SchemeSeeds,
  mode: "light" | "dark",
  surface: Srgb,
): Readonly<Record<StatusRole, Srgb>> {
  const containerLightness = builtContainerLightness(surface, mode);
  const error = buildFamily(ERROR, seeds, mode, surface, containerLightness);
  const warning = buildFamily(WARNING, seeds, mode, surface, containerLightness);
  const success = buildFamily(SUCCESS, seeds, mode, surface, containerLightness);
  const info = buildFamily(INFO, seeds, mode, surface, containerLightness);
  return {
    error: error.status,
    onError: error.onStatus,
    errorContainer: error.container,
    onErrorContainer: error.onContainer,
    warning: warning.status,
    onWarning: warning.onStatus,
    warningContainer: warning.container,
    onWarningContainer: warning.onContainer,
    success: success.status,
    onSuccess: success.onStatus,
    successContainer: success.container,
    onSuccessContainer: success.onContainer,
    info: info.status,
    onInfo: info.onStatus,
    infoContainer: info.container,
    onInfoContainer: info.onContainer,
  };
}

/** The four colors of one status family in one mode. */
function buildFamily(
  family: Family,
  seeds: SchemeSeeds,
  mode: "light" | "dark",
  surface: Srgb,
  containerLightness: number,
): FamilyColors {
  const light = mode === "light";
  const own = (light ? STATUS_LIGHT : STATUS_DARK)[family.status];
  const container = light ? STATUS_CONTAINER_LIGHT : STATUS_CONTAINER_DARK;
  const { hue } = family;

  const status = findOrThrow(family.status, mode, seeds, {
    start: own.lightness,
    a: hue.a * own.chroma,
    b: hue.b * own.chroma,
    backgrounds: [surface],
    minContrast: family.statusRequirement.minContrast,
    minLightnessDifference: family.statusRequirement.minLightnessDifference,
    prefer: light ? "darker" : "lighter",
  });

  const containerColor = oklabToSrgb(
    containerLightness,
    hue.a * container.chroma,
    hue.b * container.chroma,
  );

  const onA = hue.a * STATUS_ON_CHROMA;
  const onB = hue.b * STATUS_ON_CHROMA;
  const onStatus = findOrThrow(family.onStatus, mode, seeds, {
    start: own.onLightness,
    a: onA,
    b: onB,
    backgrounds: [status.color],
    minContrast: family.onStatusRequirement.minContrast,
    minLightnessDifference: family.onStatusRequirement.minLightnessDifference,
    prefer: own.onLightness < status.L ? "darker" : "lighter",
  });
  const onContainer = findOrThrow(family.onContainer, mode, seeds, {
    start: container.onLightness,
    a: onA,
    b: onB,
    backgrounds: [containerColor],
    minContrast: family.onContainerRequirement.minContrast,
    minLightnessDifference: family.onContainerRequirement.minLightnessDifference,
    prefer: container.onLightness < containerLightness ? "darker" : "lighter",
  });

  return {
    status: status.color,
    onStatus: onStatus.color,
    container: containerColor,
    onContainer: onContainer.color,
  };
}
