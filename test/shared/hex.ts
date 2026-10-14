import { describe, expect, it } from "vite-plus/test";
import { formatHex, parseHex } from "@/color/hex.js";
import type { Srgb } from "@/color/types.js";
import { mulberry32, SHORT_HEX_COLORS } from "./helpers.js";

/** Two lowercase hex digits for a channel, from `Number.prototype.toString`. */
function digits(value: number): string {
  return value.toString(16).padStart(2, "0");
}

/** The channels of a lowercase `#rrggbb` color, from `Number.parseInt`. */
function channels(hex: string): Srgb {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

/** The 4,096 #RGB colors and 2,000 random 8-bit colors, in a fixed order. */
function sample(): Srgb[] {
  const next = mulberry32(104);
  const random = Array.from({ length: 2000 }, () => ({
    r: Math.floor(next() * 256),
    g: Math.floor(next() * 256),
    b: Math.floor(next() * 256),
  }));
  return [...SHORT_HEX_COLORS, ...random];
}

export function registerHexTests(): void {
  describe("parseHex", () => {
    it("reads every channel value in every position", () => {
      for (let value = 0; value < 256; value++) {
        expect(parseHex(`#${digits(value)}0000`)).toEqual({ r: value, g: 0, b: 0 });
        expect(parseHex(`#00${digits(value)}00`)).toEqual({ r: 0, g: value, b: 0 });
        expect(parseHex(`#0000${digits(value)}`)).toEqual({ r: 0, g: 0, b: value });
      }
    });

    it("matches Number.parseInt on the #RGB colors and a random sample", () => {
      for (const color of sample()) {
        const hex = `#${digits(color.r)}${digits(color.g)}${digits(color.b)}`;
        expect(parseHex(hex)).toEqual(channels(hex));
      }
    });

    it("returns the channels r, g, and b, in that order", () => {
      expect(Object.keys(parseHex("#6750a4"))).toEqual(["r", "g", "b"]);
      expect(parseHex("#6750a4")).toEqual({ r: 0x67, g: 0x50, b: 0xa4 });
    });
  });

  describe("formatHex", () => {
    it("writes every channel value in every position as two lowercase digits", () => {
      for (let value = 0; value < 256; value++) {
        expect(formatHex({ r: value, g: 0, b: 0 })).toBe(`#${digits(value)}0000`);
        expect(formatHex({ r: 0, g: value, b: 0 })).toBe(`#00${digits(value)}00`);
        expect(formatHex({ r: 0, g: 0, b: value })).toBe(`#0000${digits(value)}`);
      }
    });

    it("pads with zeros and writes lowercase", () => {
      expect(formatHex({ r: 0, g: 0, b: 0 })).toBe("#000000");
      expect(formatHex({ r: 255, g: 255, b: 255 })).toBe("#ffffff");
      expect(formatHex({ r: 1, g: 2, b: 3 })).toBe("#010203");
      expect(formatHex({ r: 0xab, g: 0xcd, b: 0xef })).toBe("#abcdef");
    });

    it("is the inverse of parseHex on the #RGB colors and a random sample", () => {
      for (const color of sample()) {
        const hex = formatHex(color);
        expect(hex).toBe(`#${digits(color.r)}${digits(color.g)}${digits(color.b)}`);
        expect(parseHex(hex)).toEqual(color);
      }
    });
  });
}
