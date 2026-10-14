/**
 * Seed colors for a scheme. Each seed is an opaque sRGB hex color, as
 * `#RRGGBB` or `#RGB`, in any letter case. Omitting `secondary` or `neutral`,
 * or passing `undefined`, derives that seed from `primary`.
 */
export interface Seeds {
  /** Main UI color. Required. */
  primary: string;
  /** A different accent. Default: the hue of `primary` with less chroma. */
  secondary?: string | undefined;
  /** Tints backgrounds and surfaces. Default: the hue of `primary` with very low chroma. */
  neutral?: string | undefined;
}

/**
 * Name of a color role. There are 34 roles, listed here in a fixed order and
 * grouped by family: surfaces, text and borders, inverse, primary, secondary,
 * error, warning, success, and info. Each `onX` role is the color of text and
 * icons on `X`; `onSurface` and `onSurfaceVariant` go on `surface` and its three
 * containers. Objects keyed by role list their keys in this order.
 */
export type Role =
  | "surface"
  | "surfaceContainerLow"
  | "surfaceContainer"
  | "surfaceContainerHigh"
  | "onSurface"
  | "onSurfaceVariant"
  | "outline"
  | "outlineVariant"
  | "inverseSurface"
  | "onInverseSurface"
  | "primary"
  | "onPrimary"
  | "primaryContainer"
  | "onPrimaryContainer"
  | "secondary"
  | "onSecondary"
  | "secondaryContainer"
  | "onSecondaryContainer"
  | "error"
  | "onError"
  | "errorContainer"
  | "onErrorContainer"
  | "warning"
  | "onWarning"
  | "warningContainer"
  | "onWarningContainer"
  | "success"
  | "onSuccess"
  | "successContainer"
  | "onSuccessContainer"
  | "info"
  | "onInfo"
  | "infoContainer"
  | "onInfoContainer";

/** Color of every role in one mode, each as a lowercase `#rrggbb` hex color in sRGB. */
export type Roles = Readonly<Record<Role, string>>;

/**
 * Measured contrast of one guaranteed pair: a foreground role over a
 * background role. Every pair in a returned scheme meets its minimums.
 */
export interface PairReport {
  /** Role drawn on top: text, an icon, a border, or a control. */
  readonly foreground: Role;
  /** Role underneath. */
  readonly background: Role;
  /** Minimum WCAG 2.2 contrast ratio: 7, 4.5, or 3, for 7:1, 4.5:1, and 3:1. */
  readonly minContrast: number;
  /**
   * WCAG 2.2 contrast ratio, from 1 to 21, computed on the final 8-bit colors
   * and not rounded.
   */
  readonly contrast: number;
  /**
   * Minimum Oklab lightness difference, from 0 to 1. Only text pairs, whose
   * foreground is an `on…` role, have one; it is `null` for the other pairs
   * (`outline`, and the accent and status colors on `surface`).
   */
  readonly minLightnessDifference: number | null;
  /** Oklab lightness difference between the two colors, as an absolute value from 0 to 1. */
  readonly lightnessDifference: number;
}

/**
 * How a given seed appears in one mode. A seed appears exactly as given when
 * it meets its role's contrast; otherwise `primary` and `secondary` have
 * their lightness adjusted by the minimum needed, keeping their hue. The
 * `neutral` seed appears exactly only in light mode, when it is light and
 * within the chroma cap of the surfaces; a light seed above the cap keeps its
 * lightness, with its chroma capped. Otherwise `surface` takes the mode's
 * surface lightness, with the seed's hue and capped chroma.
 */
export interface SeedAdjustment {
  /** Name of the seed. */
  readonly seed: "primary" | "secondary" | "neutral";
  /**
   * Role that carries the seed: `primary` or `primaryContainer` for the
   * primary seed, `secondary` or `secondaryContainer` for the secondary seed,
   * and `surface` for the neutral seed.
   */
  readonly role: Role;
  /**
   * Whether the seed appears exactly: the role's color equals the seed's
   * `hex` in `ColorScheme.seeds`.
   */
  readonly exact: boolean;
  /**
   * Oklab lightness of the role's color minus that of the seed, from -1 to 1:
   * negative when the seed was darkened, positive when it was lightened, and 0
   * when it appears exactly. For `primary` and `secondary` it is the minimum
   * adjustment needed. For `neutral` it is not: it is the distance from the
   * seed to the mode's surface lightness, or close to 0 when a light seed
   * above the chroma cap keeps its lightness. Gamut mapping, and the chroma
   * cap of the surfaces, can also lower chroma, which this value does not
   * measure, so it can be 0, or close to it, while `exact` is `false`.
   */
  readonly lightnessShift: number;
}

/** Accessibility report for one mode. */
export interface ModeReport {
  /**
   * Every guaranteed pair, sorted by foreground and then by background, both
   * in the order of `Role`. The list is the same in every scheme and in both
   * modes:
   *
   * - `onSurface`, `onSurfaceVariant`, and `outline` on `surface` and the
   *   three surface containers.
   * - Every other `onX` role on its `X`: accents, containers, status colors,
   *   and `inverseSurface`.
   * - `primary`, `secondary`, `error`, `warning`, `success`, and `info` on
   *   `surface`.
   *
   * `outlineVariant` is decorative and has no guaranteed pair.
   */
  readonly pairs: readonly PairReport[];
  /**
   * One entry for each given seed, in the order `primary`, `secondary`, and
   * `neutral`. Derived seeds are not listed.
   */
  readonly adjustments: readonly SeedAdjustment[];
}

/**
 * Result of creating a scheme: the color of every role in light and dark
 * modes, the seeds used, and the accessibility report.
 */
export interface ColorScheme {
  /** Version of the result format. */
  readonly schemaVersion: 1;
  /** Roles in light mode. */
  readonly light: Roles;
  /** Roles in dark mode. */
  readonly dark: Roles;
  /**
   * Seeds used, each as a lowercase `#rrggbb` hex color (a `#RGB` seed is
   * expanded). `source` is `"given"` for a seed from the input and
   * `"derived"` for a seed derived from `primary`.
   */
  readonly seeds: Readonly<
    Record<
      "primary" | "secondary" | "neutral",
      { readonly hex: string; readonly source: "given" | "derived" }
    >
  >;
  /** Accessibility report for each mode. */
  readonly report: { readonly light: ModeReport; readonly dark: ModeReport };
  /** Information about the run. */
  readonly meta: {
    /**
     * Version of the algorithm that produced the colors. It changes whenever
     * any output color can change.
     */
    readonly algorithmVersion: string;
  };
}

/**
 * The parts of a `@adzazueta/color-extractor` result that the adapter reads.
 * A result from `color-extractor` can be passed as is; this package does not
 * depend on it, not even for types. A result the adapter cannot read produces
 * `INVALID_INPUT`.
 */
export interface ColorExtractorResult {
  /**
   * Version of the result format. Only version 1 is supported; any other
   * version produces `UNSUPPORTED_SCHEMA`.
   */
  readonly schemaVersion: number;
  /** Extracted colors, in the order of the result. An empty list produces `NO_COLORS`. */
  readonly colors: readonly {
    /** Color as `#RRGGBB`. */
    readonly hex: string;
    /** Share of the image covered by this color, from 0 to 1. */
    readonly coverage: number;
  }[];
}

/**
 * A W3C Design Tokens (DTCG 2025.10) document for one mode, with one color
 * token per role, named after the role. The light and dark documents have the
 * same token names, so they can be the `light` and `dark` contexts of a DTCG
 * resolver.
 */
export type DesignTokens = {
  readonly [R in Role]: {
    /** Token type. */
    readonly $type: "color";
    /** Color in sRGB. `alpha` is omitted, so the color is opaque. */
    readonly $value: {
      /** Color space. */
      readonly colorSpace: "srgb";
      /**
       * Red, green, and blue channels, each from 0 to 1: the 8-bit channel
       * divided by 255, not rounded.
       */
      readonly components: readonly [number, number, number];
      /** Fallback, as the role's lowercase `#rrggbb` color. */
      readonly hex: string;
    };
  };
};
