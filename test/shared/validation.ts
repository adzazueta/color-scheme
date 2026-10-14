import { describe, expect, it } from "vite-plus/test";
import { ColorSchemeError, type ColorSchemeErrorCode } from "@/errors.js";
import * as root from "@/index.js";
import { normalizeSeeds } from "@/seeds.js";

/** Asserts that the call throws an `INVALID_INPUT` error with exactly this message. */
function expectInvalid(input: unknown, message: string): void {
  let thrown: unknown;
  try {
    normalizeSeeds(input);
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(ColorSchemeError);
  const error = thrown as ColorSchemeError;
  expect(error.code).toBe("INVALID_INPUT");
  expect(error.message).toBe(message);
}

export function registerErrorTests(): void {
  describe("ColorSchemeError", () => {
    it("is exported from the package root", () => {
      expect(root.ColorSchemeError).toBe(ColorSchemeError);
    });

    it("is an Error and a ColorSchemeError", () => {
      const error = new ColorSchemeError("INVALID_INPUT", "bad input");
      expect(error).toBeInstanceOf(ColorSchemeError);
      expect(error).toBeInstanceOf(Error);
    });

    it("has the expected name, code, and message", () => {
      const error = new ColorSchemeError("NO_COLORS", "no colors");
      expect(error.name).toBe("ColorSchemeError");
      expect(error.code).toBe("NO_COLORS");
      expect(error.message).toBe("no colors");
      expect(String(error)).toBe("ColorSchemeError: no colors");
      expect(typeof error.stack).toBe("string");
    });

    it("keeps every code unchanged", () => {
      const codes: ColorSchemeErrorCode[] = [
        "INVALID_INPUT",
        "UNSUPPORTED_SCHEMA",
        "NO_COLORS",
        "PROCESSING_FAILED",
      ];
      for (const code of codes) {
        expect(new ColorSchemeError(code, "m").code).toBe(code);
      }
    });

    it("has no cause unless one is given", () => {
      for (const error of [
        new ColorSchemeError("PROCESSING_FAILED", "m"),
        new ColorSchemeError("PROCESSING_FAILED", "m", {}),
      ]) {
        expect("cause" in error).toBe(false);
        expect(error.cause).toBeUndefined();
      }
    });

    it("preserves the identity of the cause", () => {
      const cause = new TypeError("underlying");
      const error = new ColorSchemeError("PROCESSING_FAILED", "m", { cause });
      expect(error.cause).toBe(cause);
    });

    it("keeps a cause that is explicitly undefined or falsy", () => {
      for (const cause of [undefined, null, 0, "", false]) {
        const error = new ColorSchemeError("PROCESSING_FAILED", "m", { cause });
        expect("cause" in error).toBe(true);
        expect(error.cause).toBe(cause);
      }
    });

    it("can be told apart by its code", () => {
      const error = new ColorSchemeError("UNSUPPORTED_SCHEMA", "m");
      expect(error.code === "UNSUPPORTED_SCHEMA").toBe(true);
      expect(Object.keys(error)).toContain("code");
    });
  });
}

export function registerSeedTests(): void {
  describe("normalizeSeeds: valid input", () => {
    it("expands #RGB and lowercases the digits", () => {
      expect(normalizeSeeds({ primary: "#ABC" })).toEqual({
        primary: "#aabbcc",
        secondary: undefined,
        neutral: undefined,
      });
      expect(normalizeSeeds({ primary: "#aBc" }).primary).toBe("#aabbcc");
      expect(normalizeSeeds({ primary: "#012" }).primary).toBe("#001122");
    });

    it("lowercases #RRGGBB in any letter case", () => {
      expect(normalizeSeeds({ primary: "#AbCdEf" }).primary).toBe("#abcdef");
      expect(normalizeSeeds({ primary: "#ABCDEF" }).primary).toBe("#abcdef");
      expect(normalizeSeeds({ primary: "#123456" }).primary).toBe("#123456");
    });

    it("normalizes all three seeds", () => {
      expect(normalizeSeeds({ primary: "#F00", secondary: "#00FF00", neutral: "#888" })).toEqual({
        primary: "#ff0000",
        secondary: "#00ff00",
        neutral: "#888888",
      });
    });

    it("gives undefined for omitted seeds and seeds set to undefined", () => {
      const omitted = normalizeSeeds({ primary: "#fff" });
      expect(omitted.secondary).toBeUndefined();
      expect(omitted.neutral).toBeUndefined();
      const explicit = normalizeSeeds({
        primary: "#fff",
        secondary: undefined,
        neutral: undefined,
      });
      expect(explicit).toEqual({ primary: "#ffffff", secondary: undefined, neutral: undefined });
      expect(normalizeSeeds({ primary: "#fff", neutral: "#000" }).secondary).toBeUndefined();
      expect(normalizeSeeds({ primary: "#fff", secondary: "#000" }).neutral).toBeUndefined();
    });

    it("always returns the three keys, in the same order", () => {
      expect(Object.keys(normalizeSeeds({ primary: "#fff" }))).toEqual([
        "primary",
        "secondary",
        "neutral",
      ]);
    });

    it("does not change the input and returns a new object", () => {
      const input = { primary: "#ABC", secondary: "#DEF" };
      const result = normalizeSeeds(input);
      expect(input).toEqual({ primary: "#ABC", secondary: "#DEF" });
      expect(result).not.toBe(input);
    });

    it("accepts an object without a prototype", () => {
      const input = Object.assign(Object.create(null) as object, { primary: "#123" });
      expect(normalizeSeeds(input).primary).toBe("#112233");
    });

    it("ignores inherited, non-enumerable, and symbol properties", () => {
      const input = Object.create({ unknownInherited: 1 }) as Record<string | symbol, unknown>;
      input["primary"] = "#fff";
      input[Symbol("extra")] = "anything";
      Object.defineProperty(input, "hidden", { value: 1, enumerable: false });
      Object.defineProperty(input, "secondary", { value: "not a color", enumerable: false });
      expect(normalizeSeeds(input)).toEqual({
        primary: "#ffffff",
        secondary: undefined,
        neutral: undefined,
      });
    });

    it("does not read an inherited primary", () => {
      const input = Object.create({ primary: "#fff" }) as object;
      expectInvalid(input, 'Seed "primary" is required.');
    });
  });

  describe("normalizeSeeds: input that is not an object", () => {
    const cases: Array<[string, unknown, string]> = [
      ["null", null, "null"],
      ["undefined", undefined, "type undefined"],
      ["an array", [], "an array"],
      ["an array with a seed", [{ primary: "#fff" }], "an array"],
      ["a string", "#fff", "type string"],
      ["a number", 5, "type number"],
      ["a boolean", true, "type boolean"],
      ["a bigint", 1n, "type bigint"],
      ["a symbol", Symbol("seeds"), "type symbol"],
      ["a function", () => ({ primary: "#fff" }), "type function"],
    ];
    it.each(cases)("rejects %s", (_name, input, received) => {
      expectInvalid(input, `Seeds must be an object, received ${received}.`);
    });
  });

  describe("normalizeSeeds: unknown seed names", () => {
    it("rejects an unknown name", () => {
      expectInvalid({ primary: "#fff", tertiary: "#000" }, 'Unknown seed "tertiary".');
    });

    it("rejects an unknown name whatever its value", () => {
      for (const value of [undefined, null, "#fff", 0]) {
        expectInvalid({ primary: "#fff", other: value }, 'Unknown seed "other".');
      }
    });

    it("is case sensitive", () => {
      expectInvalid({ Primary: "#fff" }, 'Unknown seed "Primary".');
    });

    it("reports the first unknown name in code unit order", () => {
      expectInvalid({ primary: "#fff", b: 1, a: 1, c: 1 }, 'Unknown seed "a".');
      expectInvalid({ primary: "#fff", a: 1, Z: 1 }, 'Unknown seed "Z".');
      // The surrogate pair of the emoji (D83D) sorts before U+FF21 in code unit order.
      expectInvalid({ primary: "#fff", "\uFF21": 1, "\u{1F600}": 1 }, 'Unknown seed "\u{1F600}".');
    });

    it("rejects an own __proto__ key", () => {
      const input: unknown = JSON.parse('{"primary":"#fff","__proto__":{"x":1}}');
      expectInvalid(input, 'Unknown seed "__proto__".');
    });

    it("cuts a long name to 40 characters", () => {
      const forty = "n".repeat(40);
      expectInvalid({ primary: "#fff", [forty]: 1 }, `Unknown seed "${forty}".`);
      expectInvalid({ primary: "#fff", [`${forty}x`]: 1 }, `Unknown seed "${forty}...".`);
      expectInvalid({ primary: "#fff", ["n".repeat(500)]: 1 }, `Unknown seed "${forty}...".`);
    });
  });

  describe("normalizeSeeds: primary is required", () => {
    it("rejects an empty object", () => {
      expectInvalid({}, 'Seed "primary" is required.');
    });

    it("rejects other seeds without a primary", () => {
      expectInvalid({ secondary: "#fff" }, 'Seed "primary" is required.');
      expectInvalid({ secondary: "#fff", neutral: "#000" }, 'Seed "primary" is required.');
    });

    it("rejects a primary set to undefined", () => {
      expectInvalid({ primary: undefined }, 'Seed "primary" is required.');
    });
  });

  describe("normalizeSeeds: seed values", () => {
    it.each(["primary", "secondary", "neutral"])("rejects a non-string %s", (name) => {
      const base = { primary: "#fff" };
      const cases: Array<[unknown, string]> = [
        [null, "null"],
        [5, "type number"],
        [true, "type boolean"],
        [{}, "type object"],
        [["#fff"], "an array"],
        [() => "#fff", "type function"],
        [1n, "type bigint"],
        [Symbol("c"), "type symbol"],
      ];
      for (const [value, received] of cases) {
        expectInvalid(
          { ...base, [name]: value },
          `Seed "${name}" must be a hex color string, received ${received}.`,
        );
      }
    });

    it.each(["primary", "secondary", "neutral"])("rejects alpha in %s", (name) => {
      for (const value of ["#ffff", "#FFFF", "#ff00ff00", "#FF00FF80", "#1234", "#12345678"]) {
        expectInvalid(
          { primary: "#fff", [name]: value },
          `Seed "${name}" has an alpha channel; seeds must be opaque #RRGGBB or #RGB colors.`,
        );
      }
    });

    it.each(["primary", "secondary", "neutral"])("rejects a malformed %s", (name) => {
      const values = [
        "",
        "#",
        "#f",
        "#ff",
        "#fffff",
        "#fffffff",
        "#fffffffff",
        "fff",
        "ffffff",
        "#ggg",
        "#gggggg",
        "#ff ",
        " #fff",
        "#fff ",
        "#fff\n",
        "\n#fff",
        "#f f",
        "##fff",
        "0xfff",
        "red",
        "rgb(0, 0, 0)",
        "#ffg",
        "#ＡＢＣ",
      ];
      for (const value of values) {
        expectInvalid(
          { primary: "#fff", [name]: value },
          `Seed "${name}" is not a #RRGGBB or #RGB hex color.`,
        );
      }
    });

    it("never echoes the value in the message", () => {
      for (const value of ["#sekret", "sekret-value", 123456789, "#abcd1234"]) {
        let message = "";
        try {
          normalizeSeeds({ primary: value });
        } catch (error) {
          message = (error as ColorSchemeError).message;
        }
        expect(message).not.toBe("");
        expect(message).not.toContain(String(value));
      }
    });

    it("throws errors without a cause", () => {
      let thrown: unknown;
      try {
        normalizeSeeds(null);
      } catch (error) {
        thrown = error;
      }
      expect("cause" in (thrown as Error)).toBe(false);
    });
  });

  describe("normalizeSeeds: order of the checks", () => {
    it("checks the input type before anything else", () => {
      expectInvalid(null, "Seeds must be an object, received null.");
    });

    it("checks unknown names before the missing primary", () => {
      expectInvalid({ zzz: 1 }, 'Unknown seed "zzz".');
    });

    it("checks unknown names before the values", () => {
      expectInvalid({ primary: "bad", extra: 1 }, 'Unknown seed "extra".');
      expectInvalid({ primary: 5, secondary: "bad", extra: 1 }, 'Unknown seed "extra".');
    });

    it("checks the missing primary before the other values", () => {
      expectInvalid({ secondary: "bad", neutral: 5 }, 'Seed "primary" is required.');
    });

    it("checks the values in the order primary, secondary, neutral", () => {
      expectInvalid(
        { neutral: "bad", secondary: "bad", primary: "bad" },
        'Seed "primary" is not a #RRGGBB or #RGB hex color.',
      );
      expectInvalid(
        { neutral: "bad", secondary: "bad", primary: "#fff" },
        'Seed "secondary" is not a #RRGGBB or #RGB hex color.',
      );
      expectInvalid(
        { neutral: "bad", primary: "#fff" },
        'Seed "neutral" is not a #RRGGBB or #RGB hex color.',
      );
    });

    it("checks the type, then alpha, then the format, within one seed", () => {
      expectInvalid(
        { primary: 1, secondary: "#ffff" },
        'Seed "primary" must be a hex color string, received type number.',
      );
      expectInvalid(
        { primary: "#ffff", secondary: "bad" },
        'Seed "primary" has an alpha channel; seeds must be opaque #RRGGBB or #RGB colors.',
      );
      expectInvalid(
        { primary: "bad", secondary: 1 },
        'Seed "primary" is not a #RRGGBB or #RGB hex color.',
      );
    });

    it("reports the same error for the same input, whatever the key order", () => {
      const a = { primary: "#fff", x: 1, y: 1 };
      const b = { y: 1, x: 1, primary: "#fff" };
      expectInvalid(a, 'Unknown seed "x".');
      expectInvalid(b, 'Unknown seed "x".');
    });

    it("treats null as invalid, not as omitted", () => {
      expectInvalid(
        { primary: "#fff", secondary: null },
        'Seed "secondary" must be a hex color string, received null.',
      );
      expectInvalid({ primary: null }, 'Seed "primary" must be a hex color string, received null.');
    });
  });
}
