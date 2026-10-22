# @adzazueta/color-scheme

## 0.1.0

### Minor Changes

- ce33451: First stable release. `@adzazueta/color-scheme` turns seed colors into an accessible, role-based color scheme in light and dark modes.
  
  - `createColorScheme(seeds, options?)` returns the 34 roles of each mode, the seeds used, and an accessibility report. Every guaranteed pair meets its WCAG 2.2 contrast minimum and an Oklab lightness rule in every scheme, and text on `primary` and `secondary` is built to 6:1.
  - Two variants: `tonal`, the default, builds each accent at a fixed lightness per mode from the seed's hue and capped chroma, for a harmonious scheme; `fidelity` keeps each seed exactly as its accent or its container whenever accessibility allows. `meta` reports `algorithmVersion` (`"3"`) and `variant`.
  - `seedsFromColorExtractor` picks the seeds from a `@adzazueta/color-extractor` result.
  - `toDesignTokens` exports a scheme as two DTCG 2025.10 documents, one per mode, ready to be the contexts of a DTCG resolver.
  - `ColorSchemeError` is the single error type, with a `code` for each failure.

## 0.1.0-next.1

### Minor Changes

- e168c80: Use algorithm 2 for generated schemes. Text on `primary` and `secondary` now reaches at least 6:1 contrast; a seed that cannot carry that text becomes its container. `seedsFromColorExtractor` leaves out a vivid `neutral`, so the scheme derives a faint tint from `primary`, and a derived `secondary` has less chroma.
- 1ddb254: Add the `variant` option to `createColorScheme` and report the chosen variant in `meta.variant`.
  
  The default is now `tonal`: accents use fixed lightnesses per role, with the seed's hue and capped Oklab chroma. Choose `variant: "fidelity"` to keep the previous construction and seed placement behavior.
  
  Both variants report algorithm version `3`.

## 0.1.0-next.0

### Minor Changes

- 978e3de: Add the public API types: `Seeds`, `Role`, `Roles`, `ColorScheme`, `ModeReport`, `PairReport`, `SeedAdjustment`, `ColorExtractorResult`, and `DesignTokens`.
- e192a8b: Add `createColorScheme`, which turns seed colors into an accessible color scheme: the color of every role in light and dark modes, the seeds used, and an accessibility report for each mode.
- 990177d: Add `seedsFromColorExtractor`, which picks the seeds from a `@adzazueta/color-extractor` result: `primary` is the first color with enough chroma, `secondary` the next one with a clearly different hue, and `neutral` the color with the largest coverage. A result with no chromatic color, such as a black-and-white cover, gives the neutral theme.
- b62b0b0: Add `toDesignTokens`, which exports a color scheme as two W3C Design Tokens (DTCG 2025.10) documents, one for light mode and one for dark mode, ready to be the contexts of a DTCG resolver.
- c3bb83c: First release. `@adzazueta/color-scheme` turns seed colors into an accessible role-based color scheme, in light and dark modes.
- 57302ee: Add `ColorSchemeError`, the single error type, with a `code` that identifies each failure.
