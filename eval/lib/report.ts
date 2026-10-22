import Color from "colorjs.io";
import type { ColorScheme, ColorExtractorResult, SeedAdjustment } from "@/index.js";
import { ACHROMATIC_CHROMA } from "@/scheme/derive.js";

export const MODES: readonly ["light", "dark"] = ["light", "dark"];
export const SEEDS: readonly ["primary", "secondary", "neutral"] = [
  "primary",
  "secondary",
  "neutral",
];
export const ACCENT_SEEDS: readonly ["primary", "secondary"] = ["primary", "secondary"];
export const SOURCES: readonly ["given", "derived"] = ["given", "derived"];
export type AccentSeed = (typeof ACCENT_SEEDS)[number];
export type Source = (typeof SOURCES)[number];
export type Placement = "exactX" | "exactContainer" | "moved";
export type AccentPlacement = Readonly<Record<AccentSeed, Readonly<Record<Mode, Placement>>>>;

export type Mode = (typeof MODES)[number];
export type Seed = SeedAdjustment["seed"];
export type SetName = "dev" | "test";

export interface VerificationFailure {
  readonly mode: Mode;
  readonly check: string;
}

export interface CoverResult {
  readonly id: string;
  readonly colors: ColorExtractorResult["colors"];
  readonly scheme: ColorScheme;
  readonly neutralTheme: boolean;
  readonly placement: AccentPlacement;
  readonly verificationFailures: readonly VerificationFailure[];
}

export interface Fidelity {
  readonly given: number;
  readonly exact: number;
  readonly averageAbsoluteLightnessShift: number | null;
}

export interface PlacementCounts {
  readonly total: number;
  readonly exactX: number;
  readonly exactContainer: number;
  readonly moved: number;
}

export interface Summary {
  readonly covers: number;
  readonly placement: Readonly<
    Record<AccentSeed, Readonly<Record<Mode, Readonly<Record<Source, PlacementCounts>>>>>
  >;
  readonly fidelity: Readonly<Record<Seed, Readonly<Record<Mode, Fidelity>>>>;
  readonly sources: Readonly<Record<Seed, { readonly given: number; readonly derived: number }>>;
  readonly neutralThemes: number;
  readonly verificationFailures: number;
}

export interface ReportHeader {
  readonly algorithmVersion: string;
  readonly packageVersion: string;
  readonly commit: string;
  readonly generatedAt: string;
  readonly extractor: {
    readonly packageVersion: string;
    readonly algorithmVersion: string;
    readonly mode: "perceptual";
    readonly count: 5;
    readonly limits: "defaults";
  };
  readonly decoder: { readonly sharp: string; readonly libvips: string };
  readonly annotationsSha256: string;
}

export interface Report {
  readonly schemaVersion: 2;
  readonly set: SetName;
  readonly header: ReportHeader;
  readonly summary: Summary;
  readonly covers: readonly CoverResult[];
}

/** Measure the final 8-bit roles independently with Color.js, as the package's tests do. */
export function verifyScheme(scheme: ColorScheme): VerificationFailure[] {
  const failures: VerificationFailure[] = [];
  for (const mode of MODES) {
    for (const [role, hex] of Object.entries(scheme[mode])) {
      if (!/^#[0-9a-f]{6}$/.test(hex)) failures.push({ mode, check: `${role}: invalid hex` });
    }
    for (const pair of scheme.report[mode].pairs) {
      const foreground = new Color(scheme[mode][pair.foreground]);
      const background = new Color(scheme[mode][pair.background]);
      const contrast = Color.contrast(foreground, background, "WCAG21");
      const difference = Math.abs(
        foreground.to("oklab").coords[0]! - background.to("oklab").coords[0]!,
      );
      if (!(contrast >= pair.minContrast)) {
        failures.push({ mode, check: `${pair.foreground}/${pair.background}: contrast` });
      }
      if (pair.minLightnessDifference !== null && !(difference >= pair.minLightnessDifference)) {
        failures.push({ mode, check: `${pair.foreground}/${pair.background}: lightness` });
      }
    }
    for (const adjustment of scheme.report[mode].adjustments) {
      if (
        adjustment.exact !==
        (scheme[mode][adjustment.role] === scheme.seeds[adjustment.seed].hex)
      ) {
        failures.push({ mode, check: `${adjustment.seed}: exact flag` });
      }
    }
  }
  return failures;
}

/** Classify the final hex: accent first, then its container, otherwise moved. */
export function placementOf(scheme: ColorScheme, seed: AccentSeed, mode: Mode): Placement {
  const hex = scheme.seeds[seed].hex;
  if (scheme[mode][seed] === hex) return "exactX";
  if (scheme[mode][`${seed}Container`] === hex) return "exactContainer";
  return "moved";
}

/** Keep paths outside this model: only neutral ids and extracted color data enter public reports. */
export function buildCover(
  id: string,
  result: ColorExtractorResult,
  scheme: ColorScheme,
): CoverResult {
  if (!/^(dev|test)-[0-9]{3,}$/.test(id)) throw new Error("Invalid cover id.");
  const primary = new Color(scheme.seeds.primary.hex).to("oklab").coords;
  return {
    id,
    colors: result.colors.map(({ hex, coverage }) => ({ hex: hex.toLowerCase(), coverage })),
    scheme,
    neutralTheme: Math.hypot(primary[1]!, primary[2]!) < ACHROMATIC_CHROMA,
    placement: {
      primary: {
        light: placementOf(scheme, "primary", "light"),
        dark: placementOf(scheme, "primary", "dark"),
      },
      secondary: {
        light: placementOf(scheme, "secondary", "light"),
        dark: placementOf(scheme, "secondary", "dark"),
      },
    },
    verificationFailures: verifyScheme(scheme),
  };
}

function fidelity(covers: readonly CoverResult[], seed: Seed, mode: Mode): Fidelity {
  const adjustments = covers.flatMap((cover) =>
    cover.scheme.report[mode].adjustments.filter((adjustment) => adjustment.seed === seed),
  );
  return {
    given: adjustments.length,
    exact: adjustments.filter((adjustment) => adjustment.exact).length,
    averageAbsoluteLightnessShift:
      adjustments.length === 0
        ? null
        : adjustments.reduce((sum, adjustment) => sum + Math.abs(adjustment.lightnessShift), 0) /
          adjustments.length,
  };
}

/** Count every accent seed exactly once in its own source and mode. */
function placementCounts(
  covers: readonly CoverResult[],
  seed: AccentSeed,
  mode: Mode,
  source: Source,
): PlacementCounts {
  const counts = { total: 0, exactX: 0, exactContainer: 0, moved: 0 };
  for (const cover of covers) {
    if (cover.scheme.seeds[seed].source !== source) continue;
    counts.total++;
    counts[cover.placement[seed][mode]]++;
  }
  return counts;
}

/** Given seeds alone measure preservation of the cover's own colors; derived seeds are counted. */
export function summarize(covers: readonly CoverResult[]): Summary {
  const modes = (seed: Seed): Readonly<Record<Mode, Fidelity>> => ({
    light: fidelity(covers, seed, "light"),
    dark: fidelity(covers, seed, "dark"),
  });
  const placements = (seed: AccentSeed): Summary["placement"][AccentSeed] => ({
    light: {
      given: placementCounts(covers, seed, "light", "given"),
      derived: placementCounts(covers, seed, "light", "derived"),
    },
    dark: {
      given: placementCounts(covers, seed, "dark", "given"),
      derived: placementCounts(covers, seed, "dark", "derived"),
    },
  });
  const sources = (seed: Seed): { given: number; derived: number } => {
    const given = covers.filter((cover) => cover.scheme.seeds[seed].source === "given").length;
    return { given, derived: covers.length - given };
  };
  return {
    covers: covers.length,
    placement: { primary: placements("primary"), secondary: placements("secondary") },
    fidelity: {
      primary: modes("primary"),
      secondary: modes("secondary"),
      neutral: modes("neutral"),
    },
    sources: {
      primary: sources("primary"),
      secondary: sources("secondary"),
      neutral: sources("neutral"),
    },
    neutralThemes: covers.filter((cover) => cover.neutralTheme).length,
    verificationFailures: covers.reduce((sum, cover) => sum + cover.verificationFailures.length, 0),
  };
}

export function buildReport(
  set: SetName,
  header: ReportHeader,
  covers: readonly CoverResult[],
): Report {
  const sorted = [...covers].sort(
    (a, b) =>
      Number(a.id.slice(4)) - Number(b.id.slice(4)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const ids = new Set<string>();
  for (const cover of sorted) {
    if (!cover.id.startsWith(`${set}-`)) throw new Error("Cover belongs to another set.");
    if (ids.has(cover.id)) throw new Error("Duplicate cover id.");
    ids.add(cover.id);
    if (cover.scheme.meta.algorithmVersion !== header.algorithmVersion) {
      throw new Error("Mixed algorithm versions.");
    }
  }
  return { schemaVersion: 2, set, header, summary: summarize(sorted), covers: sorted };
}
