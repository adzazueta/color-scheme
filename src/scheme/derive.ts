import { formatHex, parseHex } from "@/color/hex.js";
import { oklabToSrgb } from "@/color/gamut.js";
import { srgbToOklab } from "@/color/oklab.js";
import type { NormalizedSeeds } from "@/seeds.js";

/**
 * Oklab chroma, √(a² + b²) of the 8-bit seed, below which a `primary` counts as achromatic. Unit:
 * Oklab chroma. 0.02 is one just noticeable difference (the same JND as gamut mapping): a gray
 * with a faint tint, such as a scan of a black-and-white cover, has no hue worth keeping. Pure
 * grays have chroma below 4e-8, so the limit only decides near-grays.
 */
export const ACHROMATIC_CHROMA = 0.02;

/**
 * Fraction of the `primary` chroma that a derived `secondary` keeps. Unit: ratio from 0 to 1.
 * 0.6 is clearly more muted than the primary, so the two stay distinguishable, and still carries
 * its hue visibly. The derived color scales Oklab's a and b, so its hue is the primary's.
 */
export const SECONDARY_CHROMA_RATIO = 0.6;

/**
 * Oklab lightness of a derived `secondary` in a chromatic scheme, as a multiple of the `primary`
 * lightness. Unit: ratio. 1 is the primary's own lightness: the construction adjusts lightness
 * for contrast anyway, so the derived seed does not impose a different one, and it appears in its
 * role or container with the same fidelity as the primary.
 */
export const SECONDARY_LIGHTNESS_RATIO = 1;

/**
 * Oklab chroma of a derived `neutral`, capped at the `primary` chroma so it never gains chroma.
 * Unit: Oklab chroma. 0.02 is a faint tint of the primary's hue, enough to feel related to the
 * cover and low enough for surfaces and text. The cap never applies while this value equals
 * {@link ACHROMATIC_CHROMA}, since a chromatic primary already has at least that chroma; it keeps
 * the rule true if either value changes. At this chroma, rounding to 8 bits can move the hue by
 * up to about 30°.
 */
export const NEUTRAL_CHROMA = 0.02;

/**
 * Oklab lightness of a derived `neutral`. Unit: Oklab lightness, 0 to 1. The neutral roles keep
 * the hue and chroma of the neutral seed, and its lightness matters only when it can be the
 * light-mode `surface` exactly; 0.98 is a tinted near-white, a typical light surface, so a derived
 * neutral is a plausible surface.
 */
export const NEUTRAL_LIGHTNESS = 0.98;

/**
 * Oklab lightness of the near-black accent that light mode uses when the `primary` is achromatic.
 * Unit: Oklab lightness, 0 to 1. Dark enough to read as black next to a white surface and to leave
 * room above it for containers and for `onPrimary`; the accent construction applies it with no
 * chroma.
 */
export const ACHROMATIC_ACCENT_LIGHTNESS_LIGHT = 0.22;

/**
 * Oklab lightness of the near-white accent that dark mode uses when the `primary` is achromatic.
 * Unit: Oklab lightness, 0 to 1. Mirrors {@link ACHROMATIC_ACCENT_LIGHTNESS_LIGHT}; applied with
 * no chroma.
 */
export const ACHROMATIC_ACCENT_LIGHTNESS_DARK = 0.95;

/** A seed used by the scheme: a lowercase `#rrggbb` hex color and where it comes from. */
export interface SchemeSeed {
  /** Lowercase `#rrggbb` hex color. */
  readonly hex: string;
  /** `"given"` for a seed from the input, `"derived"` for one derived from `primary`. */
  readonly source: "given" | "derived";
}

/** The three seeds used, and whether the `primary` is achromatic. */
export interface SchemeSeeds {
  /** Always `given`, unchanged. */
  readonly primary: SchemeSeed;
  /** The given `secondary`, or one derived from `primary`. */
  readonly secondary: SchemeSeed;
  /** The given `neutral`, or one derived from `primary`. */
  readonly neutral: SchemeSeed;
  /**
   * Whether the `primary` is achromatic (Oklab chroma below {@link ACHROMATIC_CHROMA}). The accent
   * construction then uses neutral accents: near black in light mode and near white in dark mode,
   * with {@link ACHROMATIC_ACCENT_LIGHTNESS_LIGHT} and {@link ACHROMATIC_ACCENT_LIGHTNESS_DARK}.
   */
  readonly achromatic: boolean;
}

/**
 * Returns the three seeds used. Given seeds come back unchanged and marked `given`. A missing
 * `secondary` is derived from `primary` with its hue and {@link SECONDARY_CHROMA_RATIO} of its
 * chroma, at lightness {@link SECONDARY_LIGHTNESS_RATIO} times the primary's. A missing `neutral`
 * has the primary's hue, chroma {@link NEUTRAL_CHROMA} (never more than the primary's), and
 * lightness {@link NEUTRAL_LIGHTNESS}.
 *
 * Derived colors are built in Oklab by scaling the primary's a and b, which keeps the hue without
 * trigonometry, then gamut mapped and rounded to 8 bits. The hue of a derived color can differ
 * slightly from the primary's because of that rounding, mostly at low chroma: up to about 15° when
 * the primary's chroma is below 0.05.
 *
 * An achromatic `primary` has no meaningful hue, so its derived seeds stay achromatic: the
 * secondary is the gray of the primary's lightness and the neutral is the gray of
 * {@link NEUTRAL_LIGHTNESS}, never a color foreign to the cover.
 *
 * Deterministic: only basic arithmetic and `Math.sqrt`.
 *
 * @param seeds - Seeds from `normalizeSeeds`.
 */
export function deriveSeeds(seeds: NormalizedSeeds): SchemeSeeds {
  const rgb = parseHex(seeds.primary);
  const { L, a, b } = srgbToOklab(rgb.r, rgb.g, rgb.b);
  const chroma = Math.sqrt(a * a + b * b);
  const achromatic = chroma < ACHROMATIC_CHROMA;

  const secondary: SchemeSeed =
    seeds.secondary !== undefined
      ? { hex: seeds.secondary, source: "given" }
      : {
          hex: derive(L * SECONDARY_LIGHTNESS_RATIO, a, b, achromatic ? 0 : SECONDARY_CHROMA_RATIO),
          source: "derived",
        };

  const neutral: SchemeSeed =
    seeds.neutral !== undefined
      ? { hex: seeds.neutral, source: "given" }
      : {
          hex: derive(
            NEUTRAL_LIGHTNESS,
            a,
            b,
            achromatic ? 0 : chroma > NEUTRAL_CHROMA ? NEUTRAL_CHROMA / chroma : 1,
          ),
          source: "derived",
        };

  return { primary: { hex: seeds.primary, source: "given" }, secondary, neutral, achromatic };
}

/** Builds a hex color at lightness `L` with the primary's a and b scaled by `scale`. */
function derive(L: number, a: number, b: number, scale: number): string {
  return formatHex(oklabToSrgb(L, a * scale, b * scale));
}
