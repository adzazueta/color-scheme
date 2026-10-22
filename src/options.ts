import { ColorSchemeError } from "@/errors.js";
import { isRecord, kindOf, readInput, readOwn } from "@/input.js";
import type { ColorSchemeVariant } from "@/types.js";

/**
 * Validates the options in a fixed order: plain object, own enumerable string keys, then variant.
 * Object.prototype and null prototypes are plain; inherited, non-enumerable and symbol fields
 * are ignored, as for seeds. Messages never echo caller-supplied keys or values. A throwing
 * getter or proxy is marked by readInput and wrapped by createColorScheme as INVALID_INPUT.
 */
export function normalizeOptions(input: unknown): ColorSchemeVariant {
  if (input === undefined) return "tonal";
  if (!isRecord(input)) {
    throw new ColorSchemeError(
      "INVALID_INPUT",
      `Options must be a plain object, received ${kindOf(input)}.`,
    );
  }
  const prototype: unknown = readInput(() => Object.getPrototypeOf(input));
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ColorSchemeError("INVALID_INPUT", "Options must be a plain object.");
  }
  const keys = readInput(() => Object.keys(input));
  if (keys.some((key) => key !== "variant")) {
    throw new ColorSchemeError("INVALID_INPUT", "Unknown option.");
  }
  const variant = readOwn(input, "variant");
  if (variant === undefined) return "tonal";
  if (variant !== "tonal" && variant !== "fidelity") {
    throw new ColorSchemeError("INVALID_INPUT", 'Option "variant" must be "tonal" or "fidelity".');
  }
  return variant;
}
