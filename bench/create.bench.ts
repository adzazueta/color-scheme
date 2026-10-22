import { describe, test } from "vite-plus/test";
import type { ColorScheme, createColorScheme as sourceCreateColorScheme, Seeds } from "@/index.js";
import { BENCH_SEEDS } from "./seeds.js";

// Specification, section 6.4: the initial target is under 5 ms per scheme in Node. The measurement
// that counts is taken on the maintainer's machine (section 10.2). Run with `vp run bench`, which
// builds `dist/` first.
//
// CI runs these benchmarks once, in the `pack` job, and writes their times to the summary from the
// JSON reporter: information only, without a limit, because shared runners are too noisy to compare
// times (section 10.1). Only an error, such as a seed that throws, fails the job. The summary reads
// `meta.schemesPerSample` to give every time per scheme.
//
// The timed code is the built package (`dist/index.js`, the file users get), not `src/`: Vite's
// module runner wraps every export of every source module in a getter, and a scheme calls across
// modules thousands of times, so timing `src/` would mostly time the runner. It was five to seven
// times slower, and Vitest warns that such results are unreliable.

// At least 500 ms of samples per case after 100 ms of warmup: thousands of samples, a few seconds
// in all.
const OPTIONS = { time: 500, warmupTime: 100 } as const;

type CreateColorScheme = typeof sourceCreateColorScheme;
const entry = new URL("../dist/index.js", import.meta.url);
const createColorScheme: CreateColorScheme = await import(/* @vite-ignore */ entry.href).then(
  (module: { createColorScheme: CreateColorScheme }) => module.createColorScheme,
  (error: unknown) => {
    throw new Error(
      "Benchmark: dist/index.js is missing; build it with `vp pack` (or use `vp run bench`).",
      { cause: error },
    );
  },
);

/** The seeds as the summary shows them: `primary #6750a4, neutral #fff8e1`. */
function describeSeeds(seeds: Seeds): string {
  return (["primary", "secondary", "neutral"] as const)
    .filter((name) => seeds[name] !== undefined)
    .map((name) => `${name} ${seeds[name]}`)
    .join(", ");
}

// Keeps every result reachable, so the engine cannot drop a call whose result is unused.
let last: ColorScheme | undefined;

describe.each(["tonal", "fidelity"] as const)("createColorScheme: %s", (variant) => {
  for (const { label, seeds } of BENCH_SEEDS) {
    test(`${variant}: ${label}`, async ({ bench, task }) => {
      Object.assign(task.meta, { schemesPerSample: 1, variant });
      await bench(describeSeeds(seeds), () => {
        last = createColorScheme(seeds, { variant });
      }).run(OPTIONS);
    });
  }

  // Every sample computes the whole set, in order, so the seeds also run after one another as they
  // would when an app builds several themes.
  test(`${variant}: whole set`, async ({ bench, task }) => {
    Object.assign(task.meta, { schemesPerSample: BENCH_SEEDS.length, variant });
    await bench(`all ${BENCH_SEEDS.length} seeds in each sample`, () => {
      for (const { seeds } of BENCH_SEEDS) {
        last = createColorScheme(seeds, { variant });
      }
    }).run(OPTIONS);
    console.info(`Benchmark: ${variant}, algorithm ${last?.meta.algorithmVersion ?? "unknown"}`);
  });
});
