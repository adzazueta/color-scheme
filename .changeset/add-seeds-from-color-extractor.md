---
"@adzazueta/color-scheme": minor
---

Add `seedsFromColorExtractor`, which picks the seeds from a `@adzazueta/color-extractor` result: `primary` is the first color with enough chroma, `secondary` the next one with a clearly different hue, and `neutral` the color with the largest coverage. A result with no chromatic color, such as a black-and-white cover, gives the neutral theme.
