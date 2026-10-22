---
"@adzazueta/color-scheme": minor
---

Use algorithm 2 for generated schemes. Text on `primary` and `secondary` now reaches at least 6:1 contrast; a seed that cannot carry that text becomes its container. `seedsFromColorExtractor` leaves out a vivid `neutral`, so the scheme derives a faint tint from `primary`, and a derived `secondary` has less chroma.
