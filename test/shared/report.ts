import { describe, expect, it } from "vite-plus/test";
import { ColorSchemeError } from "@/errors.js";
import { createColorScheme } from "@/scheme/create.js";
import { GUARANTEED_PAIRS, requirementOf, verifyReports } from "@/scheme/report.js";
import type { NormalizedSeeds } from "@/seeds.js";
import type { ModeReport, PairReport, Role } from "@/types.js";
import { thrownBy } from "./helpers.js";
import {
  CONTRAST_MARGIN,
  LIGHTNESS_MARGIN,
  MIN_LIGHTNESS_DIFFERENCE,
  PAIRS,
} from "./scheme-checks.js";

/** The roles that are the foreground of no guaranteed pair. */
const WITHOUT_PAIR: readonly Role[] = [
  "surface",
  "surfaceContainerLow",
  "surfaceContainer",
  "surfaceContainerHigh",
  "outlineVariant",
  "inverseSurface",
  "primaryContainer",
  "secondaryContainer",
  "errorContainer",
  "warningContainer",
  "successContainer",
  "infoContainer",
];

/** A report with some pairs changed: each change finds its pair by foreground and background. */
function changed(
  report: ModeReport,
  changes: ReadonlyArray<readonly [Role, Role, Partial<PairReport> | "remove"]>,
): ModeReport {
  let pairs: PairReport[] = report.pairs.map((pair) => ({ ...pair }));
  for (const [foreground, background, change] of changes) {
    const index = pairs.findIndex(
      (pair) => pair.foreground === foreground && pair.background === background,
    );
    expect(index).toBeGreaterThanOrEqual(0);
    if (change === "remove") pairs = pairs.filter((_, i) => i !== index);
    else pairs[index] = { ...pairs[index]!, ...change };
  }
  return { pairs, adjustments: report.adjustments };
}

export function registerReportTests(): void {
  describe("GUARANTEED_PAIRS", () => {
    it("lists the 31 pairs of specification 5.2, written out one by one, in their order", () => {
      expect(GUARANTEED_PAIRS).toHaveLength(31);
      expect(GUARANTEED_PAIRS).toEqual(PAIRS);
    });
  });

  describe("requirementOf", () => {
    it("gives the WCAG minimum plus the margin, and the lightness rule plus its margin for text", () => {
      for (const pair of PAIRS) {
        const requirement = requirementOf(pair.foreground);
        expect(requirement.minContrast).toBe(pair.minContrast + CONTRAST_MARGIN);
        expect(requirement.minLightnessDifference).toBe(
          pair.isText ? MIN_LIGHTNESS_DIFFERENCE + LIGHTNESS_MARGIN : undefined,
        );
      }
    });

    it("throws PROCESSING_FAILED for a role that is the foreground of no pair", () => {
      for (const role of WITHOUT_PAIR) {
        const error = thrownBy(() => requirementOf(role));
        expect(error).toBeInstanceOf(ColorSchemeError);
        expect((error as ColorSchemeError).code).toBe("PROCESSING_FAILED");
        expect((error as ColorSchemeError).message).toBe(`${role} has no guaranteed pair.`);
      }
    });
  });

  describe.each(["tonal", "fidelity"] as const)("verifyReports: %s", (variant) => {
    const seeds: NormalizedSeeds = { primary: "#6750a4", secondary: "#386a20", neutral: undefined };
    const { light, dark } = createColorScheme(
      {
        primary: seeds.primary,
        secondary: "#386a20",
      },
      { variant },
    ).report;

    it("accepts the reports of a scheme", () => {
      expect(() => verifyReports(light, dark, seeds)).not.toThrow();
    });

    it("names every failure, light mode first, in the order of the pairs, and the seeds", () => {
      const error = thrownBy(() =>
        verifyReports(
          changed(light, [
            ["error", "surface", { contrast: 2.9 }],
            ["onPrimary", "primary", { lightnessDifference: 0.25 }],
            ["onSurface", "surface", { contrast: 6.5 }],
          ]),
          changed(dark, [
            ["onSuccess", "success", { contrast: Number.NaN, lightnessDifference: Number.NaN }],
            ["onInverseSurface", "inverseSurface", { background: "surface" }],
            ["onInfoContainer", "infoContainer", "remove"],
          ]),
          seeds,
        ),
      );
      expect(error).toBeInstanceOf(ColorSchemeError);
      expect((error as ColorSchemeError).code).toBe("PROCESSING_FAILED");
      expect("cause" in (error as ColorSchemeError)).toBe(false);
      expect((error as ColorSchemeError).message).toBe(
        "The scheme failed its accessibility verification (" +
          "light onSurface on surface: contrast 6.5 < 7; " +
          "light onPrimary on primary: lightness difference 0.25 < 0.3; " +
          "light error on surface: contrast 2.9 < 3; " +
          "dark onInverseSurface on inverseSurface: missing from the report; " +
          "dark onSuccess on success: contrast NaN < 4.5; " +
          "dark onSuccess on success: lightness difference NaN < 0.3; " +
          "dark onInfoContainer on infoContainer: missing from the report). " +
          "Seeds: primary #6750a4, secondary #386a20, neutral not given.",
      );
    });

    it("checks the minimums of GUARANTEED_PAIRS, not the ones written in the report", () => {
      const lowered = changed(light, [
        ["onSurface", "surface", { minContrast: 1, contrast: 6.99 }],
        ["onSecondary", "secondary", { minLightnessDifference: 0, lightnessDifference: 0.29 }],
      ]);
      expect((thrownBy(() => verifyReports(lowered, dark, seeds)) as Error).message).toBe(
        "The scheme failed its accessibility verification (" +
          "light onSurface on surface: contrast 6.99 < 7; " +
          "light onSecondary on secondary: lightness difference 0.29 < 0.3). " +
          "Seeds: primary #6750a4, secondary #386a20, neutral not given.",
      );
    });

    it("accepts the exact minimums, and needs no lightness difference for other pairs", () => {
      const atMinimums = changed(dark, [
        ["onSurface", "surface", { contrast: 7, lightnessDifference: 0.3 }],
        ["outline", "surface", { contrast: 3, lightnessDifference: 0 }],
        ["primary", "surface", { contrast: 3, lightnessDifference: 0 }],
      ]);
      expect(() => verifyReports(light, atMinimums, seeds)).not.toThrow();
    });
  });
}
