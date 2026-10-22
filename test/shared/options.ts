import { describe, expect, it } from "vite-plus/test";
import {
  ColorSchemeError,
  createColorScheme,
  type CreateColorSchemeOptions,
  type ColorSchemeVariant,
} from "@/index.js";
import { thrownBy } from "./helpers.js";

export function registerOptionsTests(): void {
  const seeds = { primary: "#4185bd" };
  const call = (options: unknown) => createColorScheme(seeds, options as CreateColorSchemeOptions);
  const invalid = (options: unknown, message: string): ColorSchemeError => {
    const error = thrownBy(() => call(options)) as ColorSchemeError;
    expect(error).toBeInstanceOf(ColorSchemeError);
    expect(error.code).toBe("INVALID_INPUT");
    expect(error.message).toBe(message);
    expect("cause" in error).toBe(false);
    return error;
  };
  describe("createColorScheme options", () => {
    it("defaults omitted options, empty options and undefined variant to tonal", () => {
      const expected = createColorScheme(seeds, { variant: "tonal" });
      for (const scheme of [
        createColorScheme(seeds),
        call(undefined),
        call({}),
        call({ variant: undefined }),
        call(Object.create(null)),
      ])
        expect(scheme).toEqual(expected);
    });
    it.each(["tonal", "fidelity"] as const)(
      "reports %s and algorithm 3 without mutating seeds or options",
      (variant: ColorSchemeVariant) => {
        const options: CreateColorSchemeOptions = Object.freeze({ variant });
        const scheme = createColorScheme(Object.freeze(seeds), options);
        expect(Object.keys(scheme.meta)).toEqual(["algorithmVersion", "variant"]);
        expect(scheme.meta).toEqual({ algorithmVersion: "3", variant });
        expect(seeds).toEqual({ primary: "#4185bd" });
        expect(options).toEqual({ variant });
      },
    );
    it("requires a plain object, allowing a null prototype", () => {
      for (const [value, kind] of [
        [null, "null"],
        [[], "an array"],
        [false, "type boolean"],
        [1, "type number"],
        ["secret", "type string"],
        [1n, "type bigint"],
        [Symbol("secret"), "type symbol"],
        [() => 1, "type function"],
      ] as const)
        invalid(value, `Options must be a plain object, received ${kind}.`);
      class Options {
        variant = "tonal";
      }
      for (const value of [
        new Options(),
        new Date(),
        new Map(),
        Object.create({ variant: "fidelity" }),
      ])
        invalid(value, "Options must be a plain object.");
      expect(call(Object.assign(Object.create(null), { variant: "fidelity" })).meta.variant).toBe(
        "fidelity",
      );
    });
    it("rejects unknown enumerable string keys before reading variant or unknown values", () => {
      const error = invalid(
        {
          secretKey: undefined,
          get variant() {
            throw new Error("not read");
          },
        },
        "Unknown option.",
      );
      expect(error.message).not.toContain("secretKey");
      for (const value of [
        null,
        0,
        true,
        "Tonal",
        " fidelity",
        "",
        "secret-value",
        {},
        [],
        Symbol("secret"),
      ])
        invalid({ variant: value }, 'Option "variant" must be "tonal" or "fidelity".');
    });
    it("ignores non-enumerable and symbol keys, as seed validation does", () => {
      const options = Object.defineProperty({ [Symbol("ignored")]: true }, "variant", {
        value: "fidelity",
      });
      Object.defineProperty(options, "unknown", {
        get() {
          throw new Error("not read");
        },
      });
      expect(call(options).meta.variant).toBe("tonal");
    });
    it("validates seeds first and reads a valid variant getter only once", () => {
      let reads = 0;
      const options = {
        get variant() {
          reads++;
          return "fidelity";
        },
      };
      expect(() =>
        createColorScheme({ primary: "bad" }, options as CreateColorSchemeOptions),
      ).toThrow('Seed "primary"');
      expect(reads).toBe(0);
      expect(call(options).meta.variant).toBe("fidelity");
      expect(reads).toBe(1);
    });
    it("wraps getter/proxy failures as INVALID_INPUT with the exact original cause", () => {
      for (const cause of [
        new TypeError("secret"),
        new ColorSchemeError("PROCESSING_FAILED", "secret"),
        "secret",
        undefined,
      ]) {
        for (const options of [
          {
            get variant() {
              throw cause;
            },
          },
          new Proxy(
            {},
            {
              getPrototypeOf() {
                throw cause;
              },
            },
          ),
          new Proxy(
            {},
            {
              ownKeys() {
                throw cause;
              },
            },
          ),
          new Proxy(
            { variant: "tonal" },
            {
              getOwnPropertyDescriptor() {
                throw cause;
              },
            },
          ),
        ]) {
          const error = thrownBy(() => call(options)) as ColorSchemeError;
          expect(error.code).toBe("INVALID_INPUT");
          expect(error.message).toBe("The options could not be read.");
          expect(error.cause).toBe(cause);
          expect("cause" in error).toBe(true);
        }
      }
      const { proxy, revoke } = Proxy.revocable({}, {});
      revoke();
      const error = thrownBy(() => call(proxy)) as ColorSchemeError;
      expect(error.code).toBe("INVALID_INPUT");
      expect(error.message).toBe("The options could not be read.");
      expect(error.cause).toBeInstanceOf(TypeError);
    });
  });
}
