---
"@adzazueta/color-scheme": minor
---

First stable release. `@adzazueta/color-scheme` turns seed colors into an accessible, role-based color scheme in light and dark modes.

- `createColorScheme(seeds, options?)` returns the 34 roles of each mode, the seeds used, and an accessibility report. Every guaranteed pair meets its WCAG 2.2 contrast minimum and an Oklab lightness rule in every scheme, and text on `primary` and `secondary` is built to 6:1.
- Two variants: `tonal`, the default, builds each accent at a fixed lightness per mode from the seed's hue and capped chroma, for a harmonious scheme; `fidelity` keeps each seed exactly as its accent or its container whenever accessibility allows. `meta` reports `algorithmVersion` (`"3"`) and `variant`.
- `seedsFromColorExtractor` picks the seeds from a `@adzazueta/color-extractor` result.
- `toDesignTokens` exports a scheme as two DTCG 2025.10 documents, one per mode, ready to be the contexts of a DTCG resolver.
- `ColorSchemeError` is the single error type, with a `code` for each failure.
