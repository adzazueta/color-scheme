import type { Seeds } from "@/index.js";

/** One benchmark case: a short label and the seeds given to `createColorScheme`. */
export interface BenchSeed {
  readonly label: string;
  readonly seeds: Seeds;
}

/**
 * The seeds of the benchmarks (specification, section 6.4), stored in the repository so every run
 * times the same work. They are separate from the reference seeds of the determinism snapshots.
 *
 * The time of a scheme depends mostly on the `primary` and `secondary` seeds: how far the lightness
 * searches must walk before a color meets its minimums. The `neutral` seed changes it very little.
 *
 * - Typical chromatic primaries: a purple that meets 3:1 on the surface and is used exactly (one of
 *   the fastest), a red, a blue, and a green, and a yellow too light for 3:1, which becomes the
 *   light-mode container while `primary` darkens.
 * - Achromatic primaries, which give neutral accents: black, white, and a mid gray.
 * - All three seeds given, with a light cream `neutral` used exactly as the light-mode surface.
 * - The slowest seeds found, once with `primary` alone and once with all three. They came from
 *   timing the built package, best of several runs, on the 4,096 `#RGB` primaries and on 20,000
 *   pseudo-random seed sets, then from a coordinate search: a grid over `primary` refined around
 *   the slowest color, then the same for `secondary` with that `primary`, then for `neutral`.
 *   Mid-lightness teals and cyans, close to 3:1 on the surface, are the slowest: eight to ten times
 *   the purple, about 0.3 to 0.4 ms on an Apple M4.
 */
export const BENCH_SEEDS: readonly BenchSeed[] = [
  { label: "purple", seeds: { primary: "#6750a4" } },
  { label: "red", seeds: { primary: "#d32f2f" } },
  { label: "blue", seeds: { primary: "#2563eb" } },
  { label: "green", seeds: { primary: "#2e7d32" } },
  { label: "yellow (light seed)", seeds: { primary: "#ffff00" } },
  { label: "black", seeds: { primary: "#000000" } },
  { label: "white", seeds: { primary: "#ffffff" } },
  { label: "gray", seeds: { primary: "#808080" } },
  {
    label: "three seeds",
    seeds: { primary: "#6750a4", secondary: "#386a20", neutral: "#fff8e1" },
  },
  { label: "slowest found, primary only", seeds: { primary: "#0e8680" } },
  {
    label: "slowest found, three seeds",
    seeds: { primary: "#0e8680", secondary: "#308098", neutral: "#f80800" },
  },
];
