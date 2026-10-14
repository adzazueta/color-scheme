import { describe, expect, it } from "vite-plus/test";
import { linearSrgbToOklab } from "@/color/linear-to-oklab.js";
import { linearToSrgb } from "@/color/linear-to-srgb.js";
import { oklabToLinearSrgb } from "@/color/oklab-to-linear.js";
import { srgbToOklabInto } from "@/color/oklab.js";
import { srgbToLinear } from "@/color/srgb.js";

// The shared tests check the 4,096 #RGB colors in both projects. Node can afford all 16,777,216
// 8-bit colors; the browser project would run this three times, so it only runs here.
describe("all 16,777,216 8-bit colors", () => {
  const linear = new Float64Array(256);
  for (let i = 0; i < 256; i++) {
    linear[i] = srgbToLinear(i);
  }

  it("linearSrgbToOklab is bit-identical to srgbToOklab", () => {
    const out = new Float64Array(3);
    let mismatches = 0;
    for (let r = 0; r < 256; r++) {
      for (let g = 0; g < 256; g++) {
        for (let b = 0; b < 256; b++) {
          srgbToOklabInto(r, g, b, out, 0);
          const lab = linearSrgbToOklab(linear[r]!, linear[g]!, linear[b]!);
          if (!Object.is(lab.L, out[0]) || !Object.is(lab.a, out[1]) || !Object.is(lab.b, out[2])) {
            mismatches++;
          }
        }
      }
    }
    expect(mismatches).toBe(0);
  }, 120_000);

  it("8-bit -> Oklab -> linear -> 8-bit is exact", () => {
    const out = new Float64Array(3);
    let mismatches = 0;
    for (let r = 0; r < 256; r++) {
      for (let g = 0; g < 256; g++) {
        for (let b = 0; b < 256; b++) {
          srgbToOklabInto(r, g, b, out, 0);
          const rgb = oklabToLinearSrgb(out[0]!, out[1]!, out[2]!);
          if (linearToSrgb(rgb.r) !== r || linearToSrgb(rgb.g) !== g || linearToSrgb(rgb.b) !== b) {
            mismatches++;
          }
        }
      }
    }
    expect(mismatches).toBe(0);
  }, 120_000);
});
