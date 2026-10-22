import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { ColorSchemeError } from "@/errors.js";
import { seedsFromColorExtractor } from "@/index.js";
import type { ColorExtractorResult } from "@/types.js";

// Fault injection: the Oklab conversion is replaced for this file only (vi.mock is scoped to the
// test file's module registry), so no other test is affected. The replacement calls the real
// `srgbToOklab` unless a fault is set, and then throws it, which simulates a bug in the selection.
// Node only, like the fault injection of `createColorScheme`: the wrapping does not depend on the
// environment, and the browser project cannot be run locally to confirm the mock there.
const fault = vi.hoisted(() => ({
  /** Thrown by `srgbToOklab` when not `undefined`. */
  thrown: undefined as unknown,
  /** Calls to `srgbToOklab`. */
  calls: 0,
  /** Synthetic chroma for the exact inclusive-boundary test, not a conversion oracle. */
  chroma: undefined as number | undefined,
}));

vi.mock(import("@/color/oklab.js"), async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    srgbToOklab: (...args: Parameters<typeof original.srgbToOklab>) => {
      fault.calls++;
      if (fault.thrown !== undefined) throw fault.thrown;
      if (fault.chroma !== undefined) return { L: 0.5, a: fault.chroma, b: 0 };
      return original.srgbToOklab(...args);
    },
  };
});

// Reset before each test, not after: loading the package already converts a few colors.
beforeEach(() => {
  fault.thrown = undefined;
  fault.calls = 0;
  fault.chroma = undefined;
});

const RESULT: ColorExtractorResult = {
  schemaVersion: 1,
  colors: [
    { hex: "#c8102e", coverage: 0.4 },
    { hex: "#1f4e9c", coverage: 0.6 },
  ],
};

/** The error thrown by `seedsFromColorExtractor`. */
function failure(result: unknown): ColorSchemeError {
  let thrown: unknown;
  try {
    seedsFromColorExtractor(result as ColorExtractorResult);
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(ColorSchemeError);
  return thrown as ColorSchemeError;
}

describe("seedsFromColorExtractor: failures after validation (spec 7.5)", () => {
  it("selects through the replaced module when no fault is set", () => {
    expect(seedsFromColorExtractor(RESULT)).toEqual({
      primary: "#c8102e",
      secondary: "#1f4e9c",
    });
    expect(fault.calls).toBe(3);
  });

  it("includes the neutral at exactly the cap and omits it immediately above", () => {
    // Real 8-bit boundary colors are measured with Color.js in shared/adapter.ts. This synthetic
    // conversion result isolates <= from < at exactly 0.04, which a real hex need not attain.
    const result = { schemaVersion: 1, colors: [{ hex: "#6750a4", coverage: 1 }] };
    fault.chroma = 0.04;
    expect(seedsFromColorExtractor(result)).toEqual({ primary: "#6750a4", neutral: "#6750a4" });
    fault.chroma = 0.04 + Number.EPSILON;
    expect(seedsFromColorExtractor(result)).toEqual({ primary: "#6750a4" });
  });

  it("wraps an unexpected error as PROCESSING_FAILED, with the original as cause", () => {
    const injected = new TypeError("injected conversion failure");
    fault.thrown = injected;
    const error = failure(RESULT);
    expect(error.code).toBe("PROCESSING_FAILED");
    expect(error.message).toBe("Seed selection failed unexpectedly.");
    expect(error.cause).toBe(injected);
  });

  it("wraps a thrown value that is not an Error", () => {
    fault.thrown = "a string";
    const error = failure(RESULT);
    expect(error.code).toBe("PROCESSING_FAILED");
    expect(error.cause).toBe("a string");
  });

  it("validates every color before converting any", () => {
    fault.thrown = new TypeError("never reached");
    const error = failure({ schemaVersion: 1, colors: [...RESULT.colors, { hex: "#fff" }] });
    expect(error.code).toBe("INVALID_INPUT");
    expect(fault.calls).toBe(0);
  });
});
