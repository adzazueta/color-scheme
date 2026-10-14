import type { Srgb } from "./types.js";

const DIGITS = "0123456789abcdef";

/** Value of one lowercase hex digit character code: 0 to 9 for "0" to "9", 10 to 15 for "a" to "f". */
function digitValue(code: number): number {
  return code <= 57 ? code - 48 : code - 87;
}

/**
 * Parses a lowercase `#rrggbb` hex color into an 8-bit sRGB color.
 *
 * Minimal on purpose: it does not validate. The input must already be a lowercase `#rrggbb` string,
 * as `normalizeSeeds` returns or {@link formatHex} produces; any other string gives meaningless
 * channels. It reads character codes, with no regular expression.
 *
 * @param hex - A lowercase `#rrggbb` hex color.
 */
export function parseHex(hex: string): Srgb {
  const channel = (index: number): number =>
    digitValue(hex.charCodeAt(index)) * 16 + digitValue(hex.charCodeAt(index + 1));
  return { r: channel(1), g: channel(3), b: channel(5) };
}

/**
 * Formats an 8-bit sRGB color as a lowercase `#rrggbb` hex color.
 *
 * @param color - Each channel an integer from 0 to 255. Other values give a meaningless string.
 */
export function formatHex(color: Srgb): string {
  const pair = (value: number): string => DIGITS.charAt(value >> 4) + DIGITS.charAt(value & 15);
  return `#${pair(color.r)}${pair(color.g)}${pair(color.b)}`;
}
