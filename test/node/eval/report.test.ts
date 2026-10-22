import { describe, expect, test } from "vite-plus/test";
import { createColorScheme } from "@/index.js";
import {
  buildCover,
  buildReport,
  summarize,
  placementOf,
  verifyScheme,
  type CoverResult,
  type ReportHeader,
} from "../../../eval/lib/report.js";
import { renderHtml, renderJson, renderMarkdown, table } from "../../../eval/lib/render.js";

const header: ReportHeader = {
  algorithmVersion: "3",
  variant: "tonal",
  packageVersion: "0.1.0-next.0",
  commit: "abc123",
  generatedAt: "2026-10-21T00:00:00.000Z",
  extractor: {
    packageVersion: "0.4.0",
    algorithmVersion: "3",
    mode: "perceptual",
    count: 5,
    limits: "defaults",
  },
  decoder: { sharp: "0.35.5", libvips: "8.18.7" },
  annotationsSha256: "a".repeat(64),
};

function cover(id: string, primary = "#6750a4"): CoverResult {
  return buildCover(
    id,
    { schemaVersion: 1, colors: [{ hex: primary.toUpperCase(), coverage: 0.75 }] },
    createColorScheme({ primary }),
  );
}

describe("evaluation reports", () => {
  test("builds sorted public data without retaining private extractor properties", () => {
    const extraction = {
      schemaVersion: 1,
      colors: [{ hex: "#FF0000", coverage: 0.6, path: "private-cover.jpg" }],
      path: "secret.png",
    };
    const row = buildCover("dev-017", extraction, createColorScheme({ primary: "#ff0000" }));
    const report = buildReport("dev", header, [row, cover("dev-002")]);
    expect(report.schemaVersion).toBe(2);
    expect(report.covers.map((c) => c.id)).toEqual(["dev-002", "dev-017"]);
    expect(row.colors).toEqual([{ hex: "#ff0000", coverage: 0.6 }]);
    expect(renderJson(report)).not.toMatch(/private|secret|path/);
    expect(JSON.parse(renderJson(report))).toEqual(report);
    expect(row.verificationFailures).toEqual([]);
  });

  test("given-only fidelity has explicit denominators and uses absolute signed shifts", () => {
    const first = cover("dev-001");
    const withAdjustment = (id: string, shift: number, exact: boolean): CoverResult => ({
      ...first,
      id,
      scheme: {
        ...first.scheme,
        report: {
          light: {
            pairs: [],
            adjustments: [{ seed: "primary", role: "primary", exact, lightnessShift: shift }],
          },
          dark: {
            pairs: [],
            adjustments: [{ seed: "primary", role: "primary", exact: true, lightnessShift: 0 }],
          },
        },
      },
    });
    const summary = summarize([
      withAdjustment("dev-001", -0.2, false),
      withAdjustment("dev-002", 0.1, false),
      withAdjustment("dev-003", 0, true),
    ]);
    expect(summary.fidelity.primary.light.given).toBe(3);
    expect(summary.fidelity.primary.light.exact).toBe(1);
    expect(summary.fidelity.primary.light.averageAbsoluteLightnessShift).toBeCloseTo(0.1, 12);
    expect(summary.fidelity.primary.dark).toEqual({
      given: 3,
      exact: 3,
      averageAbsoluteLightnessShift: 0,
    });
    expect(summary.fidelity.secondary.light).toEqual({
      given: 0,
      exact: 0,
      averageAbsoluteLightnessShift: null,
    });
    expect(summary.sources.secondary).toEqual({ given: 0, derived: 3 });
    expect(summary.sources.neutral).toEqual({ given: 0, derived: 3 });
    expect(summarize([]).fidelity.primary.light.averageAbsoluteLightnessShift).toBeNull();
  });

  test("placement counts all three cases independently by accent, mode, and source", () => {
    const schemes = ["given", "derived"].flatMap((source) =>
      ["exactX", "exactContainer", "moved"].map((placement) => {
        const base = createColorScheme({ primary: "#6750a4", secondary: "#386a20" });
        const roles = {
          ...base.light,
          primary: "#111111",
          primaryContainer: "#222222",
          secondary: "#333333",
          secondaryContainer: "#444444",
        };
        if (placement === "exactX") {
          roles.primary = base.seeds.primary.hex;
          roles.secondary = base.seeds.secondary.hex;
        }
        if (placement === "exactContainer") {
          roles.primaryContainer = base.seeds.primary.hex;
          roles.secondaryContainer = base.seeds.secondary.hex;
        }
        return {
          ...base,
          seeds: {
            ...base.seeds,
            primary: { ...base.seeds.primary, source: source as "given" | "derived" },
            secondary: { ...base.seeds.secondary, source: source as "given" | "derived" },
          },
          light: roles,
          dark: roles,
        };
      }),
    );
    const covers = schemes.map((scheme, index) =>
      buildCover(
        `dev-00${index + 1}`,
        { schemaVersion: 1, colors: [{ hex: "#6750a4", coverage: 1 }] },
        scheme,
      ),
    );
    const summary = summarize(covers);
    for (const seed of ["primary", "secondary"] as const) {
      for (const mode of ["light", "dark"] as const) {
        for (const source of ["given", "derived"] as const) {
          expect(summary.placement[seed][mode][source]).toEqual({
            total: 3,
            exactX: 1,
            exactContainer: 1,
            moved: 1,
          });
          expect(summarize([]).placement[seed][mode][source]).toEqual({
            total: 0,
            exactX: 0,
            exactContainer: 0,
            moved: 0,
          });
        }
      }
    }
    const base = schemes[0]!;
    expect(
      placementOf(
        { ...base, light: { ...base.light, primaryContainer: base.seeds.primary.hex } },
        "primary",
        "light",
      ),
    ).toBe("exactX");
    // Modes are classified independently, without using adjustment.exact or the source.
    const split = {
      ...base,
      dark: { ...base.dark, primary: "#111111", primaryContainer: base.seeds.primary.hex },
    };
    expect(placementOf(split, "primary", "light")).toBe("exactX");
    expect(placementOf(split, "primary", "dark")).toBe("exactContainer");
    const splitSummary = summarize([
      buildCover("dev-001", { schemaVersion: 1, colors: [{ hex: "#6750a4", coverage: 1 }] }, split),
    ]);
    expect(splitSummary.placement.primary.light.given).toEqual({
      total: 1,
      exactX: 1,
      exactContainer: 0,
      moved: 0,
    });
    expect(splitSummary.placement.primary.dark.given).toEqual({
      total: 1,
      exactX: 0,
      exactContainer: 1,
      moved: 0,
    });
    const report = buildReport("dev", header, covers);
    expect(JSON.parse(renderJson(report)).summary.placement).toEqual(summary.placement);
    const markdown = renderMarkdown(report);
    expect(markdown).toContain("Exact X");
    expect(markdown).toContain("Exact container");
    expect(markdown).toContain("Moved");
    const html = renderHtml(
      report,
      new Map(covers.map((cover) => [cover.id, "file:///cover.jpg"])),
    );
    expect(html).toContain('class="placement-summary"');
    for (const label of ["exact X", "exact container", "moved"])
      expect(html).toContain(`<strong>${label}</strong>`);
    expect(html.match(/class="placement"/g)).toHaveLength(12);
  });

  test("counts neutral themes and verification failures", () => {
    const gray = cover("dev-001", "#808080");
    const summary = summarize([
      gray,
      { ...cover("dev-002"), verificationFailures: [{ mode: "dark", check: "example" }] },
    ]);
    expect(gray.neutralTheme).toBe(true);
    expect(summary.neutralThemes).toBe(1);
    expect(summary.verificationFailures).toBe(1);
  });

  test("independent verification detects broken final roles", () => {
    const scheme = createColorScheme({ primary: "#6750a4" });
    expect(verifyScheme(scheme)).toEqual([]);
    const failures = verifyScheme({
      ...scheme,
      light: { ...scheme.light, onSurface: scheme.light.surface },
    });
    expect(failures).toContainEqual({ mode: "light", check: "onSurface/surface: contrast" });
    expect(failures).toContainEqual({ mode: "light", check: "onSurface/surface: lightness" });
  });

  test("rejects mixed sets, duplicate ids, invalid ids, and mixed versions", () => {
    expect(() => cover("private.jpg")).toThrow("Invalid cover id");
    expect(() => buildReport("test", header, [cover("dev-001")])).toThrow("another set");
    expect(() => buildReport("dev", header, [cover("dev-001"), cover("dev-001")])).toThrow(
      "Duplicate",
    );
    expect(() =>
      buildReport("dev", { ...header, algorithmVersion: "1" }, [cover("dev-001")]),
    ).toThrow("Mixed");
  });

  test("rejects mixed variants even at the same algorithm version", () => {
    const fidelity = buildCover(
      "dev-001",
      { schemaVersion: 1, colors: [{ hex: "#6750a4", coverage: 1 }] },
      createColorScheme({ primary: "#6750a4" }, { variant: "fidelity" }),
    );
    expect(() => buildReport("dev", header, [fidelity])).toThrow("Mixed scheme variants");
    expect(buildReport("dev", { ...header, variant: "fidelity" }, [fidelity]).header.variant).toBe(
      "fidelity",
    );
  });

  test("Markdown contains fidelity, all roles, seeds, coverage, and adjustments deterministically", () => {
    const report = buildReport("dev", header, [cover("dev-017")]);
    const text = renderMarkdown(report);
    expect(text).toBe(renderMarkdown(report));
    expect(text).toContain("Derived seeds are excluded");
    expect(text).toContain("n/a");
    expect(text).toContain("### dev-017");
    expect(text).toContain("0.750000");
    expect(text).toContain("#6750a4");
    expect(text).toContain("onInfoContainer");
    expect(text).toContain("lightnessShift");
    expect(text.endsWith("\n")).toBe(true);
    expect(table(["Mean |shift|"], [["0.1"]])).toContain("Mean \\|shift\\|");
  });

  test("HTML has both mode samples, every swatch and escaped local references", () => {
    const report = buildReport("dev", header, [cover("dev-017")]);
    const images = new Map([["dev-017", 'file:///private/a&b".jpg']]);
    const html = renderHtml(report, images);
    expect(html).toBe(renderHtml(report, images));
    expect(html).toContain('src="file:///private/a&amp;b&quot;.jpg"');
    expect(html.match(/class="sample"/g)).toHaveLength(2);
    expect(html.match(/onInfoContainer/g)).toHaveLength(2);
    expect(html.match(/class="swatch"/g)).toHaveLength(72);
    expect(html).not.toMatch(/https?:|<script|<link/);
    expect(() => renderHtml(report, new Map())).toThrow("Missing local image");
  });
});
