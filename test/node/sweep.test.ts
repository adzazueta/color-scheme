import { describe, expect, it } from "vite-plus/test";
import { createColorScheme } from "@/index.js";
import type { ColorScheme, Seeds } from "@/types.js";
import {
  fidelityFailures,
  guaranteeFailures,
  newTally,
  seedFailures,
  statusFailures,
} from "../shared/scheme-checks.js";

// Specification 8.1: every #RGB color as `primary`, alone, in both modes. Node only, like the
// exhaustive color tests: specification 10.1 runs the sweep in the Node `test` job, and the
// browsers add nothing to it, since the determinism snapshots already show that every engine
// produces the same colors. Each test checks all 8,192 modes and has an explicit timeout, well
// above its time under coverage on CI.
const TIMEOUT = 120_000;

/** The 4,096 #RGB seeds, as `#rgb`, so the expansion to `#rrggbb` is part of the sweep. */
const SEEDS: readonly Seeds[] = Array.from({ length: 4096 }, (_, i) => ({
  primary: `#${(i >> 8).toString(16)}${((i >> 4) & 15).toString(16)}${(i & 15).toString(16)}`,
}));

let sweep: ReadonlyArray<{ readonly seeds: Seeds; readonly scheme: ColorScheme }> | undefined;

/** The scheme of every seed, built once for all the tests of this file. */
function schemes(): ReadonlyArray<{ readonly seeds: Seeds; readonly scheme: ColorScheme }> {
  sweep ??= SEEDS.map((seeds) => ({ seeds, scheme: createColorScheme(seeds) }));
  return sweep;
}

/** Expects no failures, showing how many there are and the first few. */
function expectNone(failures: readonly string[]): void {
  expect({ count: failures.length, first: failures.slice(0, 10) }).toEqual({ count: 0, first: [] });
}

describe("the 4,096 #RGB primaries, each alone, in both modes", () => {
  it(
    "meet every guaranteed pair and the lightness rule, measured with Color.js without tolerance",
    () => {
      expectNone(schemes().flatMap(({ scheme }) => guaranteeFailures(scheme)));
    },
    TIMEOUT,
  );

  it(
    "follow the fidelity rules, build each accent family, and exercise each rule a lone primary can reach",
    () => {
      const tally = newTally();
      expectNone(schemes().flatMap(({ scheme }) => fidelityFailures(scheme, tally)));
      // A derived neutral is always light and within the chroma cap, so no surface is capped.
      for (const rule of [
        "accent",
        "container",
        "moved",
        "achromaticExact",
        "achromaticGray",
        "neutralExact",
        "neutralSurface",
      ] as const) {
        expect(tally[rule], rule).toBeGreaterThan(0);
      }
      // Rules decided inside a band where Color.js cannot tell the package's side are accepted
      // either way; they stay rare, so the checks keep their strength.
      expect(tally.ambiguous).toBeLessThanOrEqual(20);
    },
    TIMEOUT,
  );

  it(
    "mark the primary as given, and derive the secondary and the neutral from it",
    () => {
      expectNone(schemes().flatMap(({ seeds, scheme }) => seedFailures(seeds, scheme)));
    },
    TIMEOUT,
  );

  it(
    "keep the fixed hue of every status color, and build its container",
    () => {
      expectNone(schemes().flatMap(({ scheme }) => statusFailures(scheme)));
    },
    TIMEOUT,
  );
});
