import { describe, expect, it } from "vite-plus/test";
import { contrastRatio, lightnessDifference, relativeLuminance } from "@/color/contrast.js";
import { mapOklabToSrgbGamut, oklabToSrgb } from "@/color/gamut.js";
import { linearSrgbToOklab } from "@/color/linear-to-oklab.js";
import { linearToSrgb } from "@/color/linear-to-srgb.js";
import { oklabToLinearSrgb } from "@/color/oklab-to-linear.js";
import { srgbToOklab } from "@/color/oklab.js";
import { srgbToLinear } from "@/color/srgb.js";
import type { Srgb } from "@/color/types.js";
import { findThreshold } from "./linear-to-srgb.js";
import {
  Digest,
  formatHex,
  gamutGrid,
  mulberry32,
  oklabGrid,
  REFERENCE_COLORS,
  SHORT_HEX_COLORS,
  toHex,
} from "./helpers.js";

// These snapshots hold exact bit patterns (hex), not rounded decimals. They live in files under
// test/shared/__snapshots__ that both the node and the browser project compare against, so Node on
// x64 and ARM and Chromium, Firefox, and WebKit must all produce exactly these bytes. Never update
// them to make a test pass; regenerate them only for an intentional algorithm change, which also
// changes `algorithmVersion`.
//
// The path is relative to the test file, and the thin test files of both projects sit at the same
// depth, so they resolve to the same files.
const SNAPSHOTS = "../shared/__snapshots__";

function linearGrid(): Array<[number, number, number]> {
  const points: Array<[number, number, number]> = [];
  for (let i = -2; i <= 12; i++) {
    for (let j = -2; j <= 12; j++) {
      for (let k = -2; k <= 12; k++) {
        points.push([i / 10, j / 10, k / 10]);
      }
    }
  }
  return points;
}

function colorPairs(): Array<[Srgb, Srgb]> {
  const next = mulberry32(77);
  const pick = (): Srgb => SHORT_HEX_COLORS[Math.floor(next() * SHORT_HEX_COLORS.length)]!;
  const pairs: Array<[Srgb, Srgb]> = [];
  for (let i = 0; i < 4000; i++) {
    pairs.push([pick(), pick()]);
  }
  return pairs;
}

function triple(a: number, b: number, c: number): string {
  return `${toHex(a)} ${toHex(b)} ${toHex(c)}`;
}

export function registerDeterminismTests(): void {
  describe("determinism across platforms", () => {
    it("srgbToOklab: digest over the 4,096 #RGB colors and reference colors", async () => {
      const digest = new Digest();
      for (const { r, g, b } of SHORT_HEX_COLORS) {
        const lab = srgbToOklab(r, g, b);
        digest.addDouble(lab.L);
        digest.addDouble(lab.a);
        digest.addDouble(lab.b);
      }
      const lines = REFERENCE_COLORS.map((color) => {
        const lab = srgbToOklab(color.r, color.g, color.b);
        return `${formatHex(color)} ${triple(lab.L, lab.a, lab.b)}`;
      });
      await expect(`digest ${digest.hex()}\n${lines.join("\n")}\n`).toMatchFileSnapshot(
        `${SNAPSHOTS}/srgb-to-oklab.txt`,
      );
    });

    it("linearSrgbToOklab: digest over a linear grid in and out of the gamut", async () => {
      const grid = linearGrid();
      const digest = new Digest();
      const lines: string[] = [];
      grid.forEach(([r, g, b], index) => {
        const lab = linearSrgbToOklab(r, g, b);
        digest.addDouble(lab.L);
        digest.addDouble(lab.a);
        digest.addDouble(lab.b);
        if (index % 97 === 0) {
          lines.push(`${triple(r, g, b)} -> ${triple(lab.L, lab.a, lab.b)}`);
        }
      });
      await expect(`digest ${digest.hex()}\n${lines.join("\n")}\n`).toMatchFileSnapshot(
        `${SNAPSHOTS}/linear-to-oklab.txt`,
      );
    });

    it("oklabToLinearSrgb: digest over an Oklab grid in and out of the gamut", async () => {
      const grid = oklabGrid();
      const digest = new Digest();
      const lines: string[] = [];
      grid.forEach(([L, a, b], index) => {
        const rgb = oklabToLinearSrgb(L, a, b);
        digest.addDouble(rgb.r);
        digest.addDouble(rgb.g);
        digest.addDouble(rgb.b);
        if (index % 53 === 0) {
          lines.push(`${triple(L, a, b)} -> ${triple(rgb.r, rgb.g, rgb.b)}`);
        }
      });
      await expect(`digest ${digest.hex()}\n${lines.join("\n")}\n`).toMatchFileSnapshot(
        `${SNAPSHOTS}/oklab-to-linear.txt`,
      );
    });

    it("srgbToLinear and linearToSrgb: the 255 thresholds and a digest of the encoding", async () => {
      const lines: string[] = [];
      for (let channel = 0; channel < 255; channel++) {
        lines.push(`${channel.toString().padStart(3, " ")} ${toHex(findThreshold(channel))}`);
      }
      const next = mulberry32(31337);
      const digest = new Digest();
      for (let i = 0; i < 50_000; i++) {
        digest.addDouble(linearToSrgb(next() * 1.2 - 0.1));
      }
      for (let i = 0; i < 256; i++) {
        digest.addDouble(srgbToLinear(i));
      }
      await expect(`digest ${digest.hex()}\n${lines.join("\n")}\n`).toMatchFileSnapshot(
        `${SNAPSHOTS}/linear-to-srgb.txt`,
      );
    });

    it("relativeLuminance, contrastRatio, and lightnessDifference: digest and samples", async () => {
      const digest = new Digest();
      const lines: string[] = [];
      colorPairs().forEach(([a, b], index) => {
        const ratio = contrastRatio(a, b);
        const difference = lightnessDifference(a, b);
        const luminance = relativeLuminance(a);
        digest.addDouble(ratio);
        digest.addDouble(difference);
        digest.addDouble(luminance);
        if (index % 131 === 0) {
          lines.push(`${formatHex(a)} ${formatHex(b)} ${triple(luminance, ratio, difference)}`);
        }
      });
      await expect(`digest ${digest.hex()}\n${lines.join("\n")}\n`).toMatchFileSnapshot(
        `${SNAPSHOTS}/contrast.txt`,
      );
    });

    it("mapOklabToSrgbGamut and oklabToSrgb: digests over the gamut grid and samples", async () => {
      const grid = gamutGrid();
      const mapped = new Digest();
      const encoded = new Digest();
      const lines: string[] = [];
      grid.forEach(([L, a, b], index) => {
        const linear = mapOklabToSrgbGamut(L, a, b);
        const color = oklabToSrgb(L, a, b);
        mapped.addDouble(linear.r);
        mapped.addDouble(linear.g);
        mapped.addDouble(linear.b);
        encoded.addDouble(color.r);
        encoded.addDouble(color.g);
        encoded.addDouble(color.b);
        if (index % 701 === 0) {
          lines.push(
            `${triple(L, a, b)} -> ${triple(linear.r, linear.g, linear.b)} ${formatHex(color)}`,
          );
        }
      });
      const extremes: Array<[number, number, number]> = [
        [0.5, 10, -10],
        [0.5, 1e6, 1e6],
        [0.9999, 3, 3],
        [0.0001, -3, 3],
        [1, 0.3, 0.3],
        [0, 0.3, 0.3],
      ];
      for (const [L, a, b] of extremes) {
        const linear = mapOklabToSrgbGamut(L, a, b);
        lines.push(`${triple(L, a, b)} -> ${triple(linear.r, linear.g, linear.b)}`);
      }
      await expect(
        `grid ${grid.length}\nmapped ${mapped.hex()}\nencoded ${encoded.hex()}\n${lines.join("\n")}\n`,
      ).toMatchFileSnapshot(`${SNAPSHOTS}/gamut.txt`);
    });
  });
}
