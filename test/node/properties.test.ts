import fc from "fast-check";
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

// Specification 8.1: property-based tests with random combinations of `primary`, `secondary`, and
// `neutral`. Node only: specification 10.1 runs them in the Node `test` job, and the determinism
// snapshots already show that every engine produces the same colors. When a property fails,
// fast-check shrinks the seeds to the simplest failing combination (each channel toward 0, and
// the optional seeds toward omitted) and reports it with the seed and path to replay it.

/**
 * fast-check's seed, fixed so every run, in every environment, generates the same combinations.
 * To explore other combinations locally, change it; a failure reports the seed that replays it.
 */
const SEED = 104;

/**
 * Combinations per property. 2,000 combinations with up to three seeds, many of them light,
 * near-gray, or dark, reach every fidelity rule hundreds of times (about 950 moved containers and
 * 180 capped light neutrals). The first property builds the schemes; with them, the guarantee and
 * the fidelity properties take about a second each in Node and three under coverage, and the
 * others well under a second.
 */
const NUM_RUNS = 2000;

/** Explicit timeout of each property, well above its time under coverage on CI. */
const TIMEOUT = 120_000;

const channel = fc.integer({ min: 0, max: 255 });
const offset = fc.integer({ min: -8, max: 8 });

/** An 8-bit color as lowercase `#rrggbb`, each channel clamped to 0 to 255. */
function hex([r, g, b]: readonly [number, number, number]): string {
  const pair = (value: number): string =>
    Math.min(255, Math.max(0, value)).toString(16).padStart(2, "0");
  return `#${pair(r)}${pair(g)}${pair(b)}`;
}

/** A gray of channel `v` with each of the other two channels moved by an offset. */
function nearGrayOf(base: fc.Arbitrary<number>): fc.Arbitrary<string> {
  return fc.tuple(base, offset, offset).map(([v, dg, db]) => hex([v, v + dg, v + db]));
}

/** Any 8-bit color. */
const anyColor = fc.tuple(channel, channel, channel).map(hex);

/** Grays and near-grays, achromatic or barely chromatic: the achromatic primary rule. */
const nearGray = nearGrayOf(channel);

/** Light colors: creams, pastels, and near-whites, which miss 3:1 on a light surface. */
const lightColor = fc
  .tuple(
    fc.integer({ min: 200, max: 255 }),
    fc.integer({ min: 200, max: 255 }),
    fc.integer({ min: 200, max: 255 }),
  )
  .map(hex);

/** Very dark colors, close to the dark surfaces, such as near-black navies. */
const darkColor = fc
  .tuple(
    fc.integer({ min: 0, max: 60 }),
    fc.integer({ min: 0, max: 60 }),
    fc.integer({ min: 0, max: 60 }),
  )
  .map(hex);

/**
 * Light neutrals near Oklab lightness 0.9, where a neutral seed starts to be the light-mode
 * surface: the gray `#dddddd` is just below it and `#dedede` just above.
 */
const nearSurfaceThreshold = nearGrayOf(fc.integer({ min: 214, max: 230 }));

/** The hand-picked edge cases, mixed into the random ones. */
const edgeColor = fc.constantFrom(
  "#000000",
  "#ffffff",
  "#ff0000",
  "#00ff00",
  "#0000ff",
  "#00ffff",
  "#ff00ff",
  "#ffff00",
  "#000011",
  "#000033",
  "#1b1b1b",
  "#eeeeee",
  "#f0f0f0",
  "#dddddd",
  "#dedede",
  "#ffeb99",
  "#fff8e1",
  "#fffde7",
);

/** A `primary` or `secondary` seed. */
const accentColor = fc.oneof(
  { arbitrary: anyColor, weight: 4 },
  { arbitrary: nearGray, weight: 2 },
  { arbitrary: lightColor, weight: 2 },
  { arbitrary: darkColor, weight: 1 },
  { arbitrary: edgeColor, weight: 1 },
);

/** A `neutral` seed, mostly light. */
const neutralColor = fc.oneof(
  { arbitrary: anyColor, weight: 2 },
  { arbitrary: nearGray, weight: 1 },
  { arbitrary: lightColor, weight: 3 },
  { arbitrary: nearSurfaceThreshold, weight: 3 },
  { arbitrary: edgeColor, weight: 1 },
);

/** A random `primary`, with an optional `secondary` and an optional `neutral`. */
const seedsArbitrary: fc.Arbitrary<Seeds> = fc.record(
  { primary: accentColor, secondary: accentColor, neutral: neutralColor },
  { requiredKeys: ["primary"] },
);

/**
 * Schemes by seeds. Every property uses the same fast-check seed, so they generate the same
 * combinations, and each scheme is built once.
 */
const schemes = new Map<string, ColorScheme>();

function schemeOf(seeds: Seeds): ColorScheme {
  const key = `${seeds.primary} ${seeds.secondary ?? "-"} ${seeds.neutral ?? "-"}`;
  let scheme = schemes.get(key);
  if (scheme === undefined) {
    scheme = createColorScheme(seeds);
    schemes.set(key, scheme);
  }
  return scheme;
}

describe("random combinations of seeds (fast-check, fixed seed)", () => {
  it(
    "meet every guaranteed pair and the lightness rule, measured with Color.js without tolerance",
    () => {
      fc.assert(
        fc.property(seedsArbitrary, (seeds) => {
          expect(guaranteeFailures(schemeOf(seeds))).toEqual([]);
        }),
        { seed: SEED, numRuns: NUM_RUNS },
      );
    },
    TIMEOUT,
  );

  it(
    "follow the fidelity rules, build each accent family, and exercise each rule",
    () => {
      const tally = newTally();
      fc.assert(
        fc.property(seedsArbitrary, (seeds) => {
          expect(fidelityFailures(schemeOf(seeds), tally)).toEqual([]);
        }),
        { seed: SEED, numRuns: NUM_RUNS },
      );
      for (const rule of [
        "accent",
        "container",
        "moved",
        "achromaticExact",
        "achromaticGray",
        "neutralExact",
        "neutralCapped",
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
    "mark each seed as given or derived, and derive the missing ones from primary",
    () => {
      fc.assert(
        fc.property(seedsArbitrary, (seeds) => {
          expect(seedFailures(seeds, schemeOf(seeds))).toEqual([]);
        }),
        { seed: SEED, numRuns: NUM_RUNS },
      );
    },
    TIMEOUT,
  );

  it(
    "keep the fixed hue of every status color, and build its container",
    () => {
      fc.assert(
        fc.property(seedsArbitrary, (seeds) => {
          expect(statusFailures(schemeOf(seeds))).toEqual([]);
        }),
        { seed: SEED, numRuns: NUM_RUNS },
      );
    },
    TIMEOUT,
  );
});
