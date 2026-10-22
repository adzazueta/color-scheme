import { describe, expect, test } from "vite-plus/test";
import { createColorScheme } from "@/index.js";
import {
  buildCover,
  buildReport,
  summarize,
  verifyScheme,
  type CoverResult,
  type ReportHeader,
} from "../../../eval/lib/report.js";
import { renderHtml, renderJson, renderMarkdown, table } from "../../../eval/lib/render.js";

const header: ReportHeader = {
  algorithmVersion: "1",
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
      buildReport("dev", { ...header, algorithmVersion: "2" }, [cover("dev-001")]),
    ).toThrow("Mixed");
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
