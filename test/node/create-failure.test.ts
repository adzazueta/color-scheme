import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ColorSchemeError } from "@/errors.js";
import { createColorScheme } from "@/index.js";
import type { Seeds } from "@/types.js";

// Fault injection: the status module is replaced for this file only (vi.mock is scoped to the test
// file's module registry), so no other test is affected. The replacement calls the real
// `buildStatusRoles` unless a fault is set: it then throws the given value, or returns `error` with
// the color of `surface`, which simulates a construction bug that only the verification catches.
// Node only, like color-extractor's fault injection: the wrapping does not depend on the
// environment, and the browser project cannot be run locally to confirm the mock there.
const fault = vi.hoisted(() => ({
  /** Thrown by `buildStatusRoles` when not `undefined`. */
  thrown: undefined as unknown,
  /** Whether `buildStatusRoles` gives `error` the color of `surface`. */
  inaccessible: false,
  /** Calls to `buildStatusRoles`. */
  calls: 0,
}));

vi.mock(import("@/scheme/status.js"), async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    buildStatusRoles: (...args: Parameters<typeof original.buildStatusRoles>) => {
      fault.calls++;
      if (fault.thrown !== undefined) throw fault.thrown;
      const roles = original.buildStatusRoles(...args);
      return fault.inaccessible ? { ...roles, error: args[2] } : roles;
    },
  };
});

afterEach(() => {
  fault.thrown = undefined;
  fault.inaccessible = false;
  fault.calls = 0;
});

/** The error thrown by `createColorScheme`. */
function failure(seeds: Seeds, variant: "tonal" | "fidelity"): ColorSchemeError {
  let thrown: unknown;
  try {
    createColorScheme(seeds, { variant });
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(ColorSchemeError);
  return thrown as ColorSchemeError;
}

describe.each(["tonal", "fidelity"] as const)(
  "createColorScheme %s: failures after validation",
  (variant) => {
    const failureFor = (seeds: Seeds) => failure(seeds, variant);
    it("builds the scheme through the replaced module when no fault is set", () => {
      expect(createColorScheme({ primary: "#6750a4" }).schemaVersion).toBe(1);
      expect(fault.calls).toBe(2);
    });

    it("wraps an unexpected error as PROCESSING_FAILED, with the original as cause", () => {
      const injected = new TypeError("injected status failure");
      fault.thrown = injected;
      const error = failureFor({ primary: "#6750a4" });
      expect(error.code).toBe("PROCESSING_FAILED");
      expect(error.cause).toBe(injected);
      expect(error.message).toBe(
        "Color scheme creation failed unexpectedly. Seeds: primary #6750a4, secondary not given, neutral not given.",
      );
    });

    it("names the given seeds as lowercase #rrggbb and the derived ones as not given", () => {
      fault.thrown = new RangeError("injected");
      expect(failureFor({ primary: "#ABC", neutral: "#FFF" }).message).toBe(
        "Color scheme creation failed unexpectedly. Seeds: primary #aabbcc, secondary not given, neutral #ffffff.",
      );
      expect(failureFor({ primary: "#123456", secondary: "#0A0" }).message).toBe(
        "Color scheme creation failed unexpectedly. Seeds: primary #123456, secondary #00aa00, neutral not given.",
      );
    });

    it("wraps a thrown value that is not an Error", () => {
      fault.thrown = "a string";
      const error = failureFor({ primary: "#6750a4" });
      expect(error.code).toBe("PROCESSING_FAILED");
      expect(error.cause).toBe("a string");
    });

    it("passes a ColorSchemeError thrown after validation through unchanged", () => {
      const injected = new ColorSchemeError(
        "PROCESSING_FAILED",
        "No error color meets its minimums.",
      );
      fault.thrown = injected;
      expect(failureFor({ primary: "#6750a4" })).toBe(injected);
    });

    it("throws PROCESSING_FAILED instead of returning a scheme that fails its verification", () => {
      fault.inaccessible = true;
      const error = failureFor({ primary: "#6750a4", secondary: "#386a20" });
      expect(error.code).toBe("PROCESSING_FAILED");
      expect("cause" in error).toBe(false);
      expect(error.message).toContain("light error on surface: contrast 1 < 3");
      expect(error.message).toContain("dark error on surface: contrast 1 < 3");
      expect(error.message).toContain(
        "Seeds: primary #6750a4, secondary #386a20, neutral not given.",
      );
    });

    it("validates the seeds before building any role", () => {
      fault.thrown = new TypeError("never reached");
      const error = failureFor({ primary: "#6750a4", secondary: "#fffa" });
      expect(error.code).toBe("INVALID_INPUT");
      expect(fault.calls).toBe(0);
    });
  },
);
