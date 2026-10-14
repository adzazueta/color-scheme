import Color from "colorjs.io";
import { describe, expect, it } from "vite-plus/test";
import { linearToSrgb } from "@/color/linear-to-srgb.js";
import { srgbToLinear } from "@/color/srgb.js";
import { fromBits, mulberry32, toBits } from "./helpers.js";

/** A positive double as the exact rational `mantissa * 2^exponent`. */
function decompose(value: number): { mantissa: bigint; exponent: number } {
  const bits = toBits(value);
  const exponentField = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & 0xfffffffffffffn;
  if (exponentField === 0) {
    return { mantissa: fraction, exponent: -1074 };
  }
  return { mantissa: fraction | (1n << 52n), exponent: exponentField - 1075 };
}

/** Whether `value^power >= numerator^power / denominator^power`, in exact integer arithmetic. */
function powerAtLeast(
  value: number,
  valuePower: bigint,
  numerator: bigint,
  denominator: bigint,
  rationalPower: bigint,
): boolean {
  // value^valuePower = m^valuePower * 2^(e * valuePower), compared with p^rationalPower / q^rationalPower.
  const { mantissa, exponent } = decompose(value);
  let left = mantissa ** valuePower * denominator ** rationalPower;
  let right = numerator ** rationalPower;
  const shift = BigInt(Math.abs(exponent)) * valuePower;
  if (exponent >= 0) {
    left <<= shift;
  } else {
    right <<= shift;
  }
  return left >= right;
}

/**
 * Whether `value` is at or above the exact linear-light value of the encoded midpoint
 * c = (2i + 1) / 510 of the sRGB transfer function (0.04045 break), in exact arithmetic.
 */
function atOrAboveExactThreshold(value: number, i: number): boolean {
  const k = BigInt(2 * i + 1);
  if (2 * i + 1 > 0.04045 * 510) {
    // Power branch: ((c + 0.055) / 1.055)^2.4. With x = (1000c + 55) / 1055 = (200i + 2905) / 53805,
    // value >= x^2.4 holds exactly when value^5 >= x^12.
    return powerAtLeast(value, 5n, 100n * k + 2805n, 51n * 1055n, 12n);
  }
  // Linear branch: c / 12.92 = 5 * (2i + 1) / 32946.
  const { mantissa, exponent } = decompose(value);
  let left = mantissa * 32946n;
  let right = 5n * k;
  if (exponent >= 0) {
    left <<= BigInt(exponent);
  } else {
    right <<= BigInt(-exponent);
  }
  return left >= right;
}

/** The smallest positive double that `linearToSrgb` encodes above `channel`, found by bisection. */
export function findThreshold(channel: number): number {
  let low = 0n; // encodes to `channel` or below
  let high = toBits(1); // encodes to 255
  while (high - low > 1n) {
    const middle = (low + high) / 2n;
    if (linearToSrgb(fromBits(middle)) > channel) {
      high = middle;
    } else {
      low = middle;
    }
  }
  return fromBits(high);
}

export function registerLinearToSrgbTests(): void {
  describe("linearToSrgb", () => {
    it("undoes srgbToLinear for every 8-bit value", () => {
      for (let i = 0; i < 256; i++) {
        expect(linearToSrgb(srgbToLinear(i))).toBe(i);
      }
    });

    it("handles zero, negative, and too large values", () => {
      expect(linearToSrgb(0)).toBe(0);
      expect(Object.is(linearToSrgb(-0), 0)).toBe(true);
      expect(linearToSrgb(-1e-17)).toBe(0);
      expect(linearToSrgb(-1)).toBe(0);
      expect(linearToSrgb(-Infinity)).toBe(0);
      expect(linearToSrgb(5e-324)).toBe(0);
      expect(linearToSrgb(1)).toBe(255);
      expect(linearToSrgb(1 + Number.EPSILON)).toBe(255);
      expect(linearToSrgb(1.5)).toBe(255);
      expect(linearToSrgb(Infinity)).toBe(255);
      expect(linearToSrgb(Number.MAX_VALUE)).toBe(255);
    });

    it("gives NaN for NaN", () => {
      expect(linearToSrgb(Number.NaN)).toBeNaN();
    });

    it("always returns an integer from 0 to 255 and never decreases", () => {
      const next = mulberry32(96);
      const values: number[] = [];
      for (let i = 0; i < 5000; i++) {
        values.push(next() * 1.2 - 0.1);
      }
      values.sort((a, b) => a - b);
      let previous = 0;
      for (const value of values) {
        const channel = linearToSrgb(value);
        expect(Number.isInteger(channel)).toBe(true);
        expect(channel).toBeGreaterThanOrEqual(previous);
        expect(channel).toBeLessThanOrEqual(255);
        previous = channel;
      }
    });

    it("rounds like Color.js encoding followed by Math.round, away from the midpoints", () => {
      const next = mulberry32(2026);
      let checked = 0;
      for (let n = 0; n < 4000; n++) {
        const value = next();
        const [encoded] = new Color("srgb-linear", [value, 0, 0]).to("srgb").coords;
        const scaled = encoded! * 255;
        // Color.js uses Math.pow, which can differ by a few ULP; skip values that close to a midpoint.
        if (Math.abs(scaled - Math.floor(scaled) - 0.5) < 1e-9) {
          continue;
        }
        checked++;
        expect(linearToSrgb(value)).toBe(Math.round(scaled));
      }
      expect(checked).toBeGreaterThan(3900);
    });
  });

  describe("linearToSrgb thresholds", () => {
    // The 255 thresholds are not exported, so each one is found from the behavior of the function,
    // by bisection over the bit patterns of the doubles. They are then checked against the exact
    // value, with integer arithmetic, so no floating-point formula of the package is involved.
    const thresholds: number[] = [];
    for (let channel = 0; channel < 255; channel++) {
      thresholds.push(findThreshold(channel));
    }

    it("finds 255 strictly increasing thresholds", () => {
      expect(thresholds).toHaveLength(255);
      for (let i = 1; i < 255; i++) {
        expect(thresholds[i]!).toBeGreaterThan(thresholds[i - 1]!);
      }
    });

    it("each threshold is the smallest double not below the exact value of (i + 0.5) / 255", () => {
      for (let i = 0; i < 255; i++) {
        const threshold = thresholds[i]!;
        // At or above the exact value, and the previous double is below it.
        expect(atOrAboveExactThreshold(threshold, i)).toBe(true);
        expect(atOrAboveExactThreshold(fromBits(toBits(threshold) - 1n), i)).toBe(false);
      }
    });

    it("each threshold is within 1e-12 of the Color.js decoding of (i + 0.5) / 255", () => {
      for (let i = 0; i < 255; i++) {
        const [decoded] = new Color("srgb", [(i + 0.5) / 255, 0, 0]).to("srgb-linear").coords;
        expect(Math.abs(thresholds[i]! - decoded!)).toBeLessThan(1e-12);
      }
    });

    it("the encoding changes exactly at each threshold", () => {
      for (let i = 0; i < 255; i++) {
        const threshold = thresholds[i]!;
        expect(linearToSrgb(threshold)).toBe(i + 1);
        expect(linearToSrgb(fromBits(toBits(threshold) - 1n))).toBe(i);
      }
    });
  });
}
