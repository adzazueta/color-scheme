# @adzazueta/color-scheme

Creates role-based color schemes in light and dark modes from seed colors. Every role is a lowercase sRGB hex color.

## Installation

```sh
npm install @adzazueta/color-scheme
```

Requires Node.js 22.12 or later. The package is ESM only.

## Quick start

```js
import { createColorScheme } from "@adzazueta/color-scheme";

const scheme = createColorScheme({
  primary: "#6750a4",
  secondary: "#006b5e",
  neutral: "#f4f0e6",
});

console.log({
  lightPrimary: scheme.light.primary,
  darkPrimary: scheme.dark.primary,
  meta: scheme.meta,
});
```

This prints `#634ca0` for `lightPrimary`, `#cab7ff` for `darkPrimary`, and `{ algorithmVersion: "3", variant: "tonal" }` for `meta`.

The result has `schemaVersion: 1`, `light` and `dark` objects with all 34 roles, `seeds` with each seed's hex value and whether it was given or derived, an accessibility `report` for each mode, and `meta` with `algorithmVersion` and `variant`.

## API

### Entry point

Import from `@adzazueta/color-scheme`. The root is the only entry point. The package uses no DOM, file system, or network APIs. Its functions are synchronous.

### `createColorScheme(seeds, options?)`

`seeds` requires `primary` and accepts optional `secondary` and `neutral`. Each seed must be an opaque sRGB hex color in `#RRGGBB` or `#RGB` form, in any letter case. A missing seed or a seed set to `undefined` is derived from `primary`.

`options` may contain `variant: "tonal"` or `variant: "fidelity"`. The default is `"tonal"`. Unknown seed names, options, and variants produce `INVALID_INPUT`.

### Variants

- **`tonal`** is the default. Seeds provide hue and chroma; accent roles use fixed lightnesses for each mode. Use it for a harmonious scheme from any seeds, such as colors extracted from a cover. A seed does not need to appear exactly.
- **`fidelity`** keeps a seed exactly in its accent role or container when accessibility allows. It may adjust lightness when needed. Use it when an exact seed matters, such as a brand color.

For the same seeds, the light-mode primary shows the difference:

```js
import { createColorScheme } from "@adzazueta/color-scheme";

const seeds = { primary: "#005f73", secondary: "#ca6702", neutral: "#f4f0e6" };
const tonal = createColorScheme(seeds);
const fidelity = createColorScheme(seeds, { variant: "fidelity" });

console.log({
  tonalPrimary: tonal.light.primary,
  fidelityPrimary: fidelity.light.primary,
  fidelityKeepsSeed: fidelity.report.light.adjustments[0].exact,
});
```

This prints `#15697d` for `tonalPrimary`, `#005f73` for `fidelityPrimary`, and `true` for `fidelityKeepsSeed`.

### Result

Every role in `light` and `dark` is a lowercase `#rrggbb` sRGB color. The `seeds` object always contains `primary`, `secondary`, and `neutral`; each entry has `hex` and `source` (`"given"` or `"derived"`).

`report.light` and `report.dark` each contain `pairs` and `adjustments`. A pair reports its foreground and background roles, WCAG contrast, minimum contrast, and Oklab lightness difference. An adjustment reports the given seed, the role that carries it, whether it is exact, and its signed Oklab lightness shift. Derived seeds are not listed as adjustments.

`meta.algorithmVersion` identifies the color algorithm. `meta.variant` records the selected variant.

### Roles

The scheme has 34 semantic roles in nine groups:

| Group            | Purpose and roles                                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Surfaces         | Page and container backgrounds: `surface`, `surfaceContainerLow`, `surfaceContainer`, `surfaceContainerHigh`.                           |
| Text and borders | Content and boundaries on surfaces: `onSurface`, `onSurfaceVariant`, `outline`, `outlineVariant`.                                       |
| Inverse          | An inverse surface and its content color: `inverseSurface`, `onInverseSurface`.                                                         |
| Primary          | Main accent, its content color, and its container pair: `primary`, `onPrimary`, `primaryContainer`, `onPrimaryContainer`.               |
| Secondary        | Supporting accent, its content color, and its container pair: `secondary`, `onSecondary`, `secondaryContainer`, `onSecondaryContainer`. |
| Error            | Error states: `error`, `onError`, `errorContainer`, `onErrorContainer`.                                                                 |
| Warning          | Warning states: `warning`, `onWarning`, `warningContainer`, `onWarningContainer`.                                                       |
| Success          | Success states: `success`, `onSuccess`, `successContainer`, `onSuccessContainer`.                                                       |
| Info             | Informational states: `info`, `onInfo`, `infoContainer`, `onInfoContainer`.                                                             |

Each `onX` role is for text and icons on `X`. The surfaces use the neutral seed. Status hues are fixed and do not come from the seeds.

### Accessibility guarantees

Contrast follows WCAG 2.2 and is computed on the final 8-bit colors. These minimums hold in both modes:

| Foreground                                                    | Background                                                        | Minimum contrast |
| ------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------- |
| `onSurface`                                                   | `surface` and all three surface containers                        | 7:1 (AAA)        |
| `onSurfaceVariant`                                            | `surface` and all three surface containers                        | 4.5:1            |
| Each other `onX`                                              | Its `X`: accents, containers, status colors, and `inverseSurface` | 4.5:1            |
| `outline`                                                     | `surface` and all three surface containers                        | 3:1              |
| `primary`, `secondary`, `error`, `warning`, `success`, `info` | `surface`                                                         | 3:1              |
| `outlineVariant`                                              | None; decorative                                                  | No minimum       |

Text pairs also have an Oklab lightness difference of at least 0.3. Text on `primary` and `secondary` is built to a 6:1 construction target; the guaranteed minimum remains 4.5:1.

The guarantees are absolute: every listed pair and the lightness rule hold in every scheme, in both modes. A failing pair is a package bug. Each mode's report lists every guaranteed pair with its measured contrast and lightness difference, plus any seed adjustments and their size.

### `seedsFromColorExtractor(result)`

This adapter accepts a `@adzazueta/color-extractor` result with `schemaVersion: 1`. It reads the colors in result order and uses only each color's `hex` and `coverage`. The package does not depend on `color-extractor`; it only reads its result.

The adapter picks the first color with Oklab chroma of at least 0.02 as `primary`. It picks the next color with enough chroma and a hue at least 45° away as `secondary`. It uses the highest-coverage color as `neutral` only when that color's chroma is at most 0.04. Missing seeds are derived from `primary`. If no color has enough chroma, the first color is used as an achromatic `primary`. The adapter follows the extractor's order, so `perceptual` mode is recommended.

Install `@adzazueta/color-extractor` separately. For Node.js file inputs, its README also recommends installing `sharp` for image decoding:

```sh
npm install @adzazueta/color-extractor sharp
```

This example extracts from `./cover.png`, adapts the result, and creates a scheme:

```js
import { extractColors } from "@adzazueta/color-extractor";
import { createColorScheme, seedsFromColorExtractor } from "@adzazueta/color-scheme";

const result = await extractColors("./cover.png", { mode: "perceptual" });
const seeds = seedsFromColorExtractor(result);
const scheme = createColorScheme(seeds);

console.log({ colors: result.colors.map(({ hex }) => hex), seeds, meta: scheme.meta });
```

An empty result, such as a fully transparent image, throws `ColorSchemeError` with code `NO_COLORS`.

### `toDesignTokens(scheme)`

This returns two flat DTCG documents, `light` and `dark`, following the stable 2025.10 format and Color module. Each has the same 34 role names. Every token has `$type: "color"` and a `$value` with `colorSpace: "srgb"`, `components` (each 8-bit channel divided by 255, without rounding), and `hex` (the lowercase role color as a fallback). The `alpha` field is omitted because every role is opaque.

For example, this is the `primary` token generated for the quick-start seeds:

```json
{
  "$type": "color",
  "$value": {
    "colorSpace": "srgb",
    "components": [0.38823529411764707, 0.2980392156862745, 0.6274509803921569],
    "hex": "#634ca0"
  }
}
```

Save the returned documents as `light.tokens.json` and `dark.tokens.json`. A DTCG Resolver Module 2025.10 document can select them as the `light` and `dark` contexts:

```json
{
  "$schema": "https://www.designtokens.org/schemas/2025.10/resolver.json",
  "version": "2025.10",
  "modifiers": {
    "mode": {
      "contexts": {
        "light": [{ "$ref": "light.tokens.json" }],
        "dark": [{ "$ref": "dark.tokens.json" }]
      },
      "default": "light"
    }
  },
  "resolutionOrder": [{ "$ref": "#/modifiers/mode" }]
}
```

The resolver format requires the `version` and `resolutionOrder` fields. See the [DTCG Resolver Module 2025.10](https://www.designtokens.org/TR/2025.10/resolver/).

### Exported types

The root exports `Seeds`, `Role`, `Roles`, `ColorScheme`, `ColorSchemeVariant`, `CreateColorSchemeOptions`, `ModeReport`, `PairReport`, `SeedAdjustment`, `ColorExtractorResult`, `DesignTokens`, and `ColorSchemeErrorCode`. `ColorSchemeError` is the exported error class.

### Errors

All functions throw `ColorSchemeError`, which extends `Error`. Check its `code`; `cause` contains an underlying error when one exists.

| Code                 | When                                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------- |
| `INVALID_INPUT`      | Seeds, options, a color-extractor result, or a scheme passed to `toDesignTokens` is invalid or cannot be read. |
| `UNSUPPORTED_SCHEMA` | The adapter receives a numeric `schemaVersion` other than `1`.                                                 |
| `NO_COLORS`          | The color-extractor result has no colors. This is a normal case, such as a transparent image.                  |
| `PROCESSING_FAILED`  | An unexpected failure occurs, including failure of the scheme's accessibility verification.                    |

For example, an invalid variant has the exact message `Option "variant" must be "tonal" or "fidelity".` A `schemaVersion` of `2` has the exact message `The color-extractor result has schemaVersion 2; only version 1 is supported.` An empty extractor result has the exact message `The color-extractor result has no colors.`

Unreadable inputs have these exact messages: `The seeds could not be read.`, `The options could not be read.`, `The color-extractor result could not be read.`, and `The scheme could not be read.` Seed and option values are not repeated in error messages.

### Determinism and versions

The same seeds, variant, and `algorithmVersion` produce the same scheme in every supported environment. `algorithmVersion` changes whenever an output color can change. Store the seeds, `meta.variant`, and `meta.algorithmVersion` to reproduce a scheme.

## Limitations

- Seeds accept only opaque sRGB hex colors in `#RRGGBB` or `#RGB` form.
- The package does not extract colors from images; use an extractor and pass its result to `seedsFromColorExtractor`.
- It does not apply a theme, inject CSS, switch modes, or provide transitions. `@adzazueta/ui` handles theme application.
- It does not define typography, spacing, or other non-color tokens, or provide decorative palettes. It publishes semantic color roles only.
- APCA is not computed or reported.
- There is no high-contrast scheme (`prefers-contrast: more`) yet, and seed formats other than hex are not supported.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

MIT. See [LICENSE](LICENSE).
