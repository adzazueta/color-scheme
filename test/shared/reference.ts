import { describe, expect, it } from "vite-plus/test";
import { cbrt } from "@/color/cbrt.js";
import { linearSrgbToOklab } from "@/color/linear-to-oklab.js";
import { srgbToOklab, srgbToOklabInto } from "@/color/oklab.js";
import { srgbToLinear } from "@/color/srgb.js";
import {
  CBRT_ROWS,
  OKLAB_ROWS,
  SRGB_TO_LINEAR_ROWS,
} from "./fixtures/color-extractor-reference.js";
import { fromHex, toHex } from "./helpers.js";

// The fixture holds the exact bit patterns that color-extractor's own copies of these functions
// produced (see its header). The package's copies must reproduce them bit for bit.
export function registerReferenceTests(): void {
  describe("copied conversions give the color-extractor reference values", () => {
    it("has the expected number of reference rows", () => {
      expect(SRGB_TO_LINEAR_ROWS).toHaveLength(256);
      expect(CBRT_ROWS).toHaveLength(815);
      expect(OKLAB_ROWS).toHaveLength(1285);
    });

    it("srgbToLinear: all 256 values, bit for bit", () => {
      for (const row of SRGB_TO_LINEAR_ROWS) {
        const [channel, expected] = row.split(" ") as [string, string];
        expect(toHex(srgbToLinear(parseInt(channel, 16)))).toBe(expected);
      }
    });

    it("cbrt: every reference input, bit for bit", () => {
      for (const row of CBRT_ROWS) {
        const [input, expected] = row.split(" ") as [string, string];
        expect(toHex(cbrt(fromHex(input)))).toBe(expected);
      }
    });

    it("srgbToOklab and srgbToOklabInto: every reference color, bit for bit", () => {
      const out = new Float64Array(5);
      for (const row of OKLAB_ROWS) {
        const [color, L, a, b] = row.split(" ") as [string, string, string, string];
        const r = parseInt(color.slice(0, 2), 16);
        const g = parseInt(color.slice(2, 4), 16);
        const bl = parseInt(color.slice(4, 6), 16);
        const oklab = srgbToOklab(r, g, bl);
        expect([toHex(oklab.L), toHex(oklab.a), toHex(oklab.b)]).toEqual([L, a, b]);
        srgbToOklabInto(r, g, bl, out, 2);
        expect([toHex(out[2]!), toHex(out[3]!), toHex(out[4]!)]).toEqual([L, a, b]);
      }
    });

    it("linearSrgbToOklab: gives the same bits as the copied srgbToOklab", () => {
      for (const row of OKLAB_ROWS) {
        const [color, L, a, b] = row.split(" ") as [string, string, string, string];
        const oklab = linearSrgbToOklab(
          srgbToLinear(parseInt(color.slice(0, 2), 16)),
          srgbToLinear(parseInt(color.slice(2, 4), 16)),
          srgbToLinear(parseInt(color.slice(4, 6), 16)),
        );
        expect([toHex(oklab.L), toHex(oklab.a), toHex(oklab.b)]).toEqual([L, a, b]);
      }
    });
  });
}
