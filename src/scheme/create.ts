import { ColorSchemeError } from "@/errors.js";
import { formatHex } from "@/color/hex.js";
import { buildAccentRoles } from "@/scheme/accent.js";
import { deriveSeeds, type SchemeSeed, type SchemeSeeds } from "@/scheme/derive.js";
import { buildNeutralRoles } from "@/scheme/neutral.js";
import {
  buildModeReport,
  verifyReports,
  type ModeColors,
  type SeedAdjustmentInput,
} from "@/scheme/report.js";
import { buildStatusRoles } from "@/scheme/status.js";
import { formatSeeds, normalizeSeeds, type NormalizedSeeds } from "@/seeds.js";
import type { ColorScheme, ModeReport, Role, Roles, Seeds } from "@/types.js";

/**
 * Version of the algorithm, reported in `meta.algorithmVersion` (specification, sections 4.1 and
 * 6.2): `"<N>"` for a frozen algorithm, and `"<N>-<tag>"` for a temporary one, as in
 * `color-extractor`. It changes whenever any output color can change, so the same seeds with the
 * same version give exactly the same scheme.
 *
 * Version 1 is the first frozen algorithm, with the parameter values approved in the
 * specification, section 4.1.
 */
export const ALGORITHM_VERSION: string = "1";

/** The roles and the report of one mode. */
interface ModeResult {
  readonly roles: Roles;
  readonly report: ModeReport;
}

/**
 * Creates an accessible color scheme from seed colors, synchronously: the color of every role in
 * light and dark modes, the seeds used, and an accessibility report for each mode.
 *
 * Every role is a lowercase `#rrggbb` hex color in sRGB, and objects keyed by role list their keys
 * in the order of `Role`. A missing `secondary` takes the hue of `primary` with less chroma, and a
 * missing `neutral` the hue of `primary` with very low chroma; `seeds` returns all three, each
 * marked `"given"` or `"derived"`, with a `#RGB` seed expanded to `#rrggbb`.
 *
 * **Accessibility.** In both modes, every guaranteed pair meets its WCAG 2.2 contrast minimum,
 * computed exactly on the final 8-bit colors: `onSurface` 7:1 and `onSurfaceVariant` 4.5:1 on
 * `surface` and its three containers, every other `onX` 4.5:1 on its `X`, `outline` 3:1 on the
 * surfaces, and the accent and status colors 3:1 on `surface`. Text pairs, whose foreground is an
 * `on…` role, also meet a minimum difference in Oklab lightness. The scheme is verified before it
 * is returned, so the guarantee holds for any seeds: when a seed misses a minimum, only its
 * fidelity yields. `report` lists every pair with its measured contrast and lightness difference.
 *
 * **Fidelity to the seeds.** In each mode, a `primary` or `secondary` seed that meets 3:1 on
 * `surface`, with a small margin, is that role exactly. One that does not is its container (`primaryContainer` or
 * `secondaryContainer`) exactly, unless it is too close to the surfaces: then only its lightness
 * moves, by the minimum needed to stand apart from them, keeping its hue. The role itself is then
 * built from the seed's hue, darker in light mode and lighter in dark mode, to meet 3:1: a very
 * light seed, such as a yellow, stays as the light-mode container while `primary` darkens. An
 * achromatic `primary`, such as black or a gray, gives neutral accents instead: `primary` is near
 * black in light mode and near white in dark mode, and the seed appears exactly only when it is
 * already that dark or that light. A light `neutral` seed, such as a cream, is the light-mode
 * `surface` exactly when its chroma is within the cap of the surfaces; above the cap, `surface`
 * keeps the seed's lightness, with its chroma capped. Otherwise, and always in dark mode, the
 * surfaces take the mode's own lightness, with the seed's hue and capped chroma. The status colors
 * (`error`, `warning`, `success`, and `info`) have fixed hues; only their lightness and chroma
 * adapt to each mode's surfaces. `report` lists how each given seed appears in each mode, and by
 * how much its lightness moved.
 *
 * **Determinism.** The same seeds give exactly the same scheme in every supported environment, any
 * supported Node version or any browser, for the same `meta.algorithmVersion`, which changes
 * whenever any output color can change.
 *
 * @param seeds - `primary`, and optionally `secondary` and `neutral`, each an opaque `#RRGGBB` or
 *   `#RGB` hex color in any letter case.
 * @returns The scheme, as plain objects: `schemaVersion` 1, the roles of each mode (`light` and
 *   `dark`), the seeds used, the report of each mode, and `meta.algorithmVersion`.
 * @throws {ColorSchemeError} `INVALID_INPUT` when the seeds are invalid: not an object, an unknown
 *   seed name, a missing `primary`, or a value that is not an opaque `#RRGGBB` or `#RGB` hex color.
 *   The checks run in a fixed order, so the same input always gives the same error. Also when the
 *   seeds cannot be read, such as an object whose getter or proxy throws: the message is then
 *   "The seeds could not be read." and the original error is the `cause`.
 * @throws {ColorSchemeError} `PROCESSING_FAILED`, instead of returning an inaccessible scheme, when
 *   no color meets a role's minimums or the scheme fails its accessibility verification, and for
 *   any other unexpected internal failure, which carries the original error as `cause`; the first
 *   two have no `cause`. Each is a bug in the package; the message names the seeds, so the failure
 *   can be reproduced.
 */
export function createColorScheme(seeds: Seeds): ColorScheme {
  // Validation errors propagate unchanged. Any other error while reading the input, such as from
  // a getter or a proxy, is `INVALID_INPUT`; only failures after validation are `PROCESSING_FAILED`.
  let normalized: NormalizedSeeds;
  try {
    normalized = normalizeSeeds(seeds);
  } catch (error) {
    if (error instanceof ColorSchemeError) throw error;
    throw new ColorSchemeError("INVALID_INPUT", "The seeds could not be read.", { cause: error });
  }
  try {
    return create(normalized);
  } catch (error) {
    // `findOrThrow` and `verifyReports` already throw `PROCESSING_FAILED` naming the seeds.
    if (error instanceof ColorSchemeError) throw error;
    throw new ColorSchemeError(
      "PROCESSING_FAILED",
      `Color scheme creation failed unexpectedly. ${formatSeeds(normalized)}`,
      { cause: error },
    );
  }
}

function create(normalized: NormalizedSeeds): ColorScheme {
  const seeds = deriveSeeds(normalized);
  const light = buildMode(seeds, "light");
  const dark = buildMode(seeds, "dark");
  verifyReports(light.report, dark.report, normalized);
  return {
    schemaVersion: 1,
    light: light.roles,
    dark: dark.roles,
    seeds: {
      primary: seedUsed(seeds.primary),
      secondary: seedUsed(seeds.secondary),
      neutral: seedUsed(seeds.neutral),
    },
    report: { light: light.report, dark: dark.report },
    meta: { algorithmVersion: ALGORITHM_VERSION },
  };
}

/**
 * Builds the 34 roles of one mode and their report. The neutral roles come first, because the
 * accent and status roles are built on the surfaces.
 */
function buildMode(seeds: SchemeSeeds, mode: "light" | "dark"): ModeResult {
  const neutral = buildNeutralRoles(seeds, mode);
  const accent = buildAccentRoles(seeds, mode, neutral.colors);
  const status = buildStatusRoles(seeds, mode, neutral.colors.surface);

  // Each module returns its roles in the order of `Role`, and the three families follow one
  // another in that order, so the keys of `colors`, and of the roles built from it, are too.
  const colors: ModeColors = { ...neutral.colors, ...accent.colors, ...status };
  const roles = {} as Record<Role, string>;
  for (const role of Object.keys(colors) as Role[]) {
    roles[role] = formatHex(colors[role]);
  }

  // One entry for each given seed, in the order primary, secondary, neutral: the accent
  // adjustments already list the given primary and secondary, in that order.
  const adjustments: SeedAdjustmentInput[] = [...accent.adjustments];
  if (seeds.neutral.source === "given") adjustments.push(neutral.adjustment);

  return { roles, report: buildModeReport(colors, adjustments) };
}

/** A seed as the result reports it: a new plain object with its hex and source. */
function seedUsed(seed: SchemeSeed): ColorScheme["seeds"]["primary"] {
  return { hex: seed.hex, source: seed.source };
}
