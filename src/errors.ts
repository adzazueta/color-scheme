/**
 * Codes that identify each failure reported by `ColorSchemeError`.
 *
 * - `INVALID_INPUT`: the seeds are invalid (wrong format, alpha, missing `primary`, or an unknown
 *   name), or a `color-extractor` result cannot be read by the adapter.
 * - `UNSUPPORTED_SCHEMA`: the adapter receives a result with a `schemaVersion` other than 1.
 * - `NO_COLORS`: the `color-extractor` result has no colors. It is a normal case, such as a
 *   transparent cover, so applications can tell it apart from a real error.
 * - `PROCESSING_FAILED`: an unexpected failure, including a scheme that fails its verification.
 */
export type ColorSchemeErrorCode =
  | "INVALID_INPUT"
  | "UNSUPPORTED_SCHEMA"
  | "NO_COLORS"
  | "PROCESSING_FAILED";

/**
 * The single error type thrown by the package. Check `code` to tell the failures apart.
 */
export class ColorSchemeError extends Error {
  override readonly name = "ColorSchemeError";

  /** Identifies the failure. */
  readonly code: ColorSchemeErrorCode;

  /**
   * @param code - The failure code.
   * @param message - A human-readable description of the failure.
   * @param options - The underlying `cause`.
   */
  constructor(code: ColorSchemeErrorCode, message: string, options?: { cause?: unknown }) {
    super(
      message,
      options !== undefined && "cause" in options ? { cause: options.cause } : undefined,
    );
    this.code = code;
  }
}
