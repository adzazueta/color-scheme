---
"@adzazueta/color-scheme": minor
---

Add the `variant` option to `createColorScheme` and report the chosen variant in `meta.variant`.

The default is now `tonal`: accents use fixed lightnesses per role, with the seed's hue and capped Oklab chroma. Choose `variant: "fidelity"` to keep the previous construction and seed placement behavior.

Both variants report algorithm version `3`.
