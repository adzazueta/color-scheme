import { describe, expect, it } from "vite-plus/test";
import { createColorScheme } from "@/scheme/create.js";
import type { ColorScheme, ColorSchemeVariant, ModeReport, Role, Seeds } from "@/types.js";
import { Digest, toHex } from "./helpers.js";

// The full result of `createColorScheme` for a set of reference seeds, stored as an exact-bit text
// file under test/shared/__snapshots__ that both the node and the browser project compare against
// (specification, sections 6.1 and 10.1). Node on x64 and ARM and Chromium, Firefox, and WebKit
// must all produce exactly these bytes. Every number is stored as the 16 hex digits of its IEEE 754
// bit pattern, so a difference in the last bit shows up. Never update the file to make a test pass;
// regenerate it with `vp test -u` only for an intentional algorithm change, which also changes
// `algorithmVersion`.
//
// The path is relative to the test file, and the thin test files of both projects sit at the same
// depth, so they resolve to the same file. In CI (`CI=true`) Vitest never writes a snapshot file: a
// changed or a missing file fails the test.
const SNAPSHOT = "../shared/__snapshots__/schemes.txt";

/** A reference seed set and the path of the construction it covers. */
interface ReferenceCase {
  readonly name: string;
  readonly why: string;
  readonly seeds: Seeds;
}

export const REFERENCE_CASES: readonly ReferenceCase[] = [
  {
    name: "primary-only",
    why: "the reference case: a mid-tone purple that is the accent exactly in light mode",
    seeds: { primary: "#6750a4" },
  },
  {
    name: "vivid-red",
    why: "a vivid seed that meets 3:1 on the surface, so it is the role X in both modes",
    seeds: { primary: "#cc3333" },
  },
  {
    name: "pure-yellow",
    why: "a very light seed: the light-mode container, with primary darkened from its hue and exact in dark mode",
    seeds: { primary: "#ffff00" },
  },
  {
    name: "material-yellow",
    why: "a light yellow that is the light-mode container and is darkened for the role",
    seeds: { primary: "#ffeb3b" },
  },
  {
    name: "pale-yellow",
    why: "a seed so close to the surfaces that its container moves to stand apart",
    seeds: { primary: "#fffde7" },
  },
  {
    name: "dark-blue",
    why: "a very dark blue whose dark-mode container moves away from the dark surfaces",
    seeds: { primary: "#000033" },
  },
  {
    name: "black",
    why: "an achromatic primary that is already near black: exact in light mode, near white in dark mode",
    seeds: { primary: "#000000" },
  },
  {
    name: "gray",
    why: "an achromatic mid gray, which becomes the near-black or near-white accent",
    seeds: { primary: "#808080" },
  },
  {
    name: "white",
    why: "an achromatic white: near-white accents in dark mode",
    seeds: { primary: "#ffffff" },
  },
  {
    name: "given-secondary",
    why: "a primary with a given, nearly achromatic secondary",
    seeds: { primary: "#6750a4", secondary: "#f0f0f0" },
  },
  {
    name: "neutral-cream",
    why: "a light neutral within the chroma cap: it is the light-mode surface exactly",
    seeds: { primary: "#6750a4", neutral: "#fff8e1" },
  },
  {
    name: "neutral-gray",
    why: "a light achromatic neutral: exact in light mode, a gray dark surface",
    seeds: { primary: "#6750a4", neutral: "#dedede" },
  },
  {
    name: "neutral-above-cap",
    why: "a light neutral above the chroma cap: it keeps its lightness with its chroma capped",
    seeds: { primary: "#6750a4", neutral: "#ffeb99" },
  },
  {
    name: "short-hex",
    why: "a #RGB seed, returned expanded, in upper case",
    seeds: { primary: "#F80" },
  },
  {
    name: "all-seeds",
    why: "all three seeds given",
    seeds: { primary: "#1b6ef3", secondary: "#e8590c", neutral: "#f4f1ea" },
  },
];

const ROLE_ORDER: readonly Role[] = Object.keys(
  createColorScheme({ primary: "#6750a4" }).light,
) as Role[];

function reportLines(label: string, report: ModeReport, digest: Digest): string[] {
  const lines: string[] = [];
  for (const pair of report.pairs) {
    const minLightness =
      pair.minLightnessDifference === null ? "none" : toHex(pair.minLightnessDifference);
    digest.addDouble(pair.minContrast);
    digest.addDouble(pair.contrast);
    digest.addDouble(pair.minLightnessDifference ?? Number.NaN);
    digest.addDouble(pair.lightnessDifference);
    lines.push(
      `${label} pair ${pair.foreground} ${pair.background} min ${toHex(pair.minContrast)} ` +
        `contrast ${toHex(pair.contrast)} minLightness ${minLightness} ` +
        `lightness ${toHex(pair.lightnessDifference)}`,
    );
  }
  for (const adjustment of report.adjustments) {
    digest.addDouble(adjustment.lightnessShift);
    lines.push(
      `${label} adjustment ${adjustment.seed} ${adjustment.role} exact ${adjustment.exact} ` +
        `shift ${toHex(adjustment.lightnessShift)}`,
    );
  }
  return lines;
}

/** One reference case as text, and its numbers added to the digest. */
function describeCase(reference: ReferenceCase, scheme: ColorScheme, digest: Digest): string {
  const lines = [`## ${reference.name}`, `input ${JSON.stringify(reference.seeds)}`];
  lines.push(
    `schemaVersion ${scheme.schemaVersion}`,
    `algorithmVersion ${scheme.meta.algorithmVersion}`,
    `variant ${scheme.meta.variant}`,
  );
  for (const name of ["primary", "secondary", "neutral"] as const) {
    lines.push(`seed ${name} ${scheme.seeds[name].hex} ${scheme.seeds[name].source}`);
  }
  for (const mode of ["light", "dark"] as const) {
    for (const role of ROLE_ORDER) {
      lines.push(`${mode} ${role} ${scheme[mode][role]}`);
    }
  }
  for (const mode of ["light", "dark"] as const) {
    lines.push(...reportLines(mode, scheme.report[mode], digest));
  }
  return lines.join("\n");
}

/** One variant's complete exact-bit references, also used by the version 2 regression. */
export function renderSchemeSnapshots(variant: ColorSchemeVariant): string {
  const digest = new Digest();
  const blocks = REFERENCE_CASES.map((reference) =>
    describeCase(reference, createColorScheme(reference.seeds, { variant }), digest),
  );
  return `digest ${digest.hex()}\ncases ${REFERENCE_CASES.length}\n\n${blocks.join("\n\n")}\n`;
}

export function registerSnapshotTests(): void {
  describe.each(["tonal", "fidelity"] as const)("reference schemes: %s", (variant) => {
    it("the full result for each reference seed set is identical in every environment", async () => {
      await expect(renderSchemeSnapshots(variant)).toMatchFileSnapshot(
        variant === "fidelity" ? SNAPSHOT : "../shared/__snapshots__/schemes-tonal.txt",
      );
    });
  });
}
