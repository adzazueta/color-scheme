import { ColorSchemeError } from "@/errors.js";

/** Marks an error from the caller's code, independently of its type or code. */
class InputReadError extends Error {
  constructor(cause: unknown) {
    super("Input read failed.", { cause });
  }
}

/** Runs only an input read that can invoke a getter or proxy trap. */
export function readInput<T>(read: () => T): T {
  try {
    return read();
  } catch (cause) {
    throw new InputReadError(cause);
  }
}

/** Converts a marked read failure; the package's own validation errors stay unchanged. */
export function inputError(error: unknown, message: string): unknown {
  return error instanceof InputReadError
    ? new ColorSchemeError("INVALID_INPUT", message, { cause: error.cause })
    : error;
}

/** Array.isArray can throw when the value is a revoked proxy. */
export function isArray(value: unknown): value is unknown[] {
  return readInput(() => Array.isArray(value));
}

/** Whether a value can hold named fields: not null, an array, or a primitive. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !isArray(value);
}

/** Names the kind of a value for error messages, without echoing the value. */
export function kindOf(value: unknown): string {
  if (value === null) return "null";
  if (isArray(value)) return "an array";
  return `type ${typeof value}`;
}

/** Reads an own enumerable key; inherited and non-enumerable keys count as missing. */
export function readOwn(object: object, key: string): unknown {
  return readInput(() =>
    Object.prototype.propertyIsEnumerable.call(object, key)
      ? (object as Record<string, unknown>)[key]
      : undefined,
  );
}
