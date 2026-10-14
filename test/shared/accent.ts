import { describe, expect, it } from "vite-plus/test";
import { buildAccentRoles } from "@/scheme/accent.js";
import { deriveSeeds, type SchemeSeeds } from "@/scheme/derive.js";
import { buildNeutralRoles } from "@/scheme/neutral.js";
import { normalizeSeeds } from "@/seeds.js";
import { MODES } from "./scheme-checks.js";

export function registerAccentTests(): void {
  describe("buildAccentRoles: adjustments", () => {
    it("lists only the given accent seeds, primary first", () => {
      const derived = deriveSeeds(normalizeSeeds({ primary: "#6750a4" }));
      const given = deriveSeeds(normalizeSeeds({ primary: "#6750a4", secondary: "#386a20" }));
      // `deriveSeeds` always marks the primary as given; one marked derived is not listed either.
      const unmarked: SchemeSeeds = {
        ...given,
        primary: { hex: given.primary.hex, source: "derived" },
      };
      for (const mode of MODES) {
        const seedsOf = (seeds: SchemeSeeds): string[] =>
          buildAccentRoles(seeds, mode, buildNeutralRoles(seeds, mode).colors).adjustments.map(
            (adjustment) => adjustment.seed,
          );
        expect(seedsOf(derived)).toEqual(["primary"]);
        expect(seedsOf(given)).toEqual(["primary", "secondary"]);
        expect(seedsOf(unmarked)).toEqual(["secondary"]);
      }
    });
  });
}
