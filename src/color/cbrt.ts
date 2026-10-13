// Copied from color-extractor: src/core/color/cbrt.ts at commit
// db1cbd8c1ebdb9748ce729f59793c97d95472c57 (ADZE-22). Make any change in both packages:
// reference-value tests check that both copies give identical results.

// Scratch space for reading and writing the bits of a double. Every access states the byte order,
// so the result does not depend on the platform's endianness.
const bits = new DataView(new ArrayBuffer(8));
const LITTLE_ENDIAN = true;

/** Smallest positive normal double, 2^-1022. */
const MIN_NORMAL = 2.2250738585072014e-308;
/** 2^54, which moves a subnormal input into the normal range without rounding. */
const TWO_POW_54 = 18014398509481984;
/** 2^27 + 1, Veltkamp's constant for keeping the upper 26 significant bits of a double. */
const SPLITTER = 134217729;
/** Nearest doubles to the cube roots of 2 and 4. They only scale the starting guess. */
const CBRT_2 = 1.2599210498948732;
const CBRT_4 = 1.5874010519681994;

/**
 * Cube root, built only from IEEE-754 basic operations (+, −, ×, ÷), comparisons, and exact
 * bit access, so it returns the same double in every engine and on every platform, unlike the
 * built-in cube root, whose accuracy is implementation-defined.
 *
 * The error is below one unit in the last place (about 0.67 at most): exact cubes of
 * doubles, such as 8 or 0.125, return their exact roots. It is odd: `cbrt(-x) === -cbrt(x)`.
 * `cbrt(±0)` is ±0, `cbrt(±Infinity)` is ±Infinity, and `cbrt(NaN)` is `NaN`.
 */
export function cbrt(x: number): number {
  if (x === 0 || !Number.isFinite(x)) {
    return x;
  }
  let value = x < 0 ? -x : x;

  // Scale subnormal inputs by 2^54; the exponent below accounts for it.
  let exponentBias = 1023;
  if (value < MIN_NORMAL) {
    value *= TWO_POW_54;
    exponentBias += 54;
  }

  // Split value = m · 2^e with m in [1, 2), and e = 3q + k with k in {0, 1, 2}. Then
  // z = m · 2^k is exact, lies in [1, 8), and cbrt(value) = cbrt(z) · 2^q.
  bits.setFloat64(0, value, LITTLE_ENDIAN);
  const high = bits.getUint32(4, LITTLE_ENDIAN);
  const e = (high >>> 20) - exponentBias;
  const q = Math.floor(e / 3);
  const k = e - 3 * q;
  bits.setUint32(4, (high & 0x000fffff) | 0x3ff00000, LITTLE_ENDIAN);
  const m = bits.getFloat64(0, LITTLE_ENDIAN);

  // Starting guess: a quadratic fitted offline to cbrt(m) on [1, 2], relative error below 7e-4.
  const guess = 0.6215 + m * (0.4394 - 0.0603 * m);
  let z: number;
  let root: number;
  if (k === 0) {
    z = m;
    root = guess;
  } else if (k === 1) {
    z = m * 2;
    root = guess * CBRT_2;
  } else {
    z = m * 4;
    root = guess * CBRT_4;
  }

  // Two Halley steps, each of which about triples the correct bits: 10, then 32, then over 53.
  // Before the second, the root is rounded to 26 significant bits so that root · root is exact
  // and the step adds only one significant rounding error.
  root = halleyStep(root, z);
  root = halleyStep(keepUpper26Bits(root), z);

  // Multiply by 2^q, built from its bits; the product is exact.
  bits.setUint32(4, (q + 1023) << 20, LITTLE_ENDIAN);
  bits.setUint32(0, 0, LITTLE_ENDIAN);
  root *= bits.getFloat64(0, LITTLE_ENDIAN);

  return x < 0 ? -root : root;
}

/**
 * One step of Halley's method for t³ = z, written with r = z / t². For t near cbrt(z), r − t
 * is exact (Sterbenz), so when t · t is exact the only significant rounding is in z / (t · t).
 */
function halleyStep(t: number, z: number): number {
  const r = z / (t * t);
  return t + (t * (r - t)) / (t + t + r);
}

/** Rounds a double to its upper 26 significant bits (Veltkamp splitting). */
function keepUpper26Bits(value: number): number {
  const scaled = value * SPLITTER;
  return scaled - (scaled - value);
}
