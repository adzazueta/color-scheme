import Color from "colorjs.io";
import { describe, expect, it } from "vite-plus/test";
import { ColorSchemeError } from "@/errors.js";
import * as root from "@/index.js";
import { createColorScheme } from "@/scheme/create.js";
import { toDesignTokens } from "@/tokens.js";
import type { ColorScheme, Role, Seeds } from "@/types.js";
import { thrownBy } from "./helpers.js";

// The expected roles are written out from the specification (section 3.1), not read from the
// package, and the components are measured with Color.js.

/** The 34 roles, in the order of `Role`. */
const ROLES: readonly Role[] = [
  "surface",
  "surfaceContainerLow",
  "surfaceContainer",
  "surfaceContainerHigh",
  "onSurface",
  "onSurfaceVariant",
  "outline",
  "outlineVariant",
  "inverseSurface",
  "onInverseSurface",
  "primary",
  "onPrimary",
  "primaryContainer",
  "onPrimaryContainer",
  "secondary",
  "onSecondary",
  "secondaryContainer",
  "onSecondaryContainer",
  "error",
  "onError",
  "errorContainer",
  "onErrorContainer",
  "warning",
  "onWarning",
  "warningContainer",
  "onWarningContainer",
  "success",
  "onSuccess",
  "successContainer",
  "onSuccessContainer",
  "info",
  "onInfo",
  "infoContainer",
  "onInfoContainer",
];

const SEEDS: readonly Seeds[] = [
  { primary: "#6750a4" },
  { primary: "#ffff00" },
  { primary: "#000000" },
  { primary: "#ffffff" },
  { primary: "#6750a4", secondary: "#f0f0f0", neutral: "#fff8e1" },
  { primary: "#00f", secondary: "#0ff", neutral: "#123" },
];

const MODES = ["light", "dark"] as const;

/** Asserts that the call throws `INVALID_INPUT` with this message, and returns the error. */
function expectInvalid(call: () => unknown, message: string): ColorSchemeError {
  const error = thrownBy(call);
  expect(error).toBeInstanceOf(ColorSchemeError);
  expect((error as ColorSchemeError).code).toBe("INVALID_INPUT");
  expect((error as ColorSchemeError).message).toBe(message);
  return error as ColorSchemeError;
}

/** A scheme with a role set to `value`; with `undefined`, the key is still there. */
function withRole(scheme: ColorScheme, mode: "light" | "dark", role: Role, value: unknown) {
  return { ...scheme, [mode]: { ...scheme[mode], [role]: value } } as unknown as ColorScheme;
}

/** A scheme with a role's key removed. */
function withoutRole(scheme: ColorScheme, mode: "light" | "dark", role: Role): ColorScheme {
  const roles: Partial<Record<Role, string>> = { ...scheme[mode] };
  delete roles[role];
  return { ...scheme, [mode]: roles } as unknown as ColorScheme;
}

/** The sRGB coordinates Color.js reads from a hex color. */
function colorJsCoords(hex: string): [number, number, number] {
  const [r, g, b] = new Color(hex).to("srgb").coords;
  return [r ?? Number.NaN, g ?? Number.NaN, b ?? Number.NaN];
}

export function registerTokensTests(): void {
  describe("toDesignTokens", () => {
    it("is exported from the package root", () => {
      expect(root.toDesignTokens).toBe(toDesignTokens);
    });

    it("returns the documents light and dark, in that order", () => {
      const tokens = toDesignTokens(createColorScheme({ primary: "#6750a4" }));
      expect(Object.keys(tokens)).toEqual(["light", "dark"]);
    });

    it("has 34 flat tokens in the order of Role, with the same names in both documents", () => {
      for (const seeds of SEEDS) {
        const tokens = toDesignTokens(createColorScheme(seeds));
        expect(Object.keys(tokens.light)).toEqual(ROLES);
        expect(Object.keys(tokens.dark)).toEqual(ROLES);
      }
    });

    it("gives every token a valid DTCG name", () => {
      const tokens = toDesignTokens(createColorScheme({ primary: "#6750a4" }));
      for (const name of [...Object.keys(tokens.light), ...Object.keys(tokens.dark)]) {
        expect(name.startsWith("$")).toBe(false);
        expect(/[{}.]/.test(name)).toBe(false);
      }
    });

    it("gives every token the shape $type and $value, with no extra properties", () => {
      const tokens = toDesignTokens(createColorScheme({ primary: "#6750a4" }));
      for (const mode of MODES) {
        for (const role of ROLES) {
          const token = tokens[mode][role];
          expect(Object.keys(token)).toEqual(["$type", "$value"]);
          expect(token.$type).toBe("color");
          expect(Object.keys(token.$value)).toEqual(["colorSpace", "components", "hex"]);
          expect(token.$value.colorSpace).toBe("srgb");
          expect(Array.isArray(token.$value.components)).toBe(true);
          expect(token.$value.components).toHaveLength(3);
          expect("alpha" in token.$value).toBe(false);
        }
      }
    });

    it("has hex equal to the scheme's role, in lowercase 6-digit notation", () => {
      for (const seeds of SEEDS) {
        const scheme = createColorScheme(seeds);
        const tokens = toDesignTokens(scheme);
        for (const mode of MODES) {
          for (const role of ROLES) {
            const hex = tokens[mode][role].$value.hex;
            expect(hex).toBe(scheme[mode][role]);
            expect(hex).toMatch(/^#[0-9a-f]{6}$/);
          }
        }
      }
    });

    it("has components equal to the channel divided by 255, from 0 to 1, as Color.js reads them", () => {
      for (const seeds of SEEDS) {
        const tokens = toDesignTokens(createColorScheme(seeds));
        for (const mode of MODES) {
          for (const role of ROLES) {
            const { components, hex } = tokens[mode][role].$value;
            const expected = colorJsCoords(hex);
            for (let i = 0; i < 3; i++) {
              const value = components[i]!;
              expect(value).toBeGreaterThanOrEqual(0);
              expect(value).toBeLessThanOrEqual(1);
              // Not rounded: the exact 8-bit channel over 255.
              expect(value).toBe(Number.parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255);
              expect(Math.abs(value - expected[i]!)).toBeLessThan(1e-12);
            }
          }
        }
      }
    });

    it("keeps the extremes exactly: black as [0, 0, 0] and white as [1, 1, 1]", () => {
      const scheme = createColorScheme({ primary: "#6750a4" });
      const edge = (hex: string): ColorScheme =>
        ({
          ...scheme,
          light: { ...scheme.light, surface: hex, onSurface: "#ff00ff" },
        }) as ColorScheme;
      expect(toDesignTokens(edge("#000000")).light.surface.$value.components).toEqual([0, 0, 0]);
      expect(toDesignTokens(edge("#ffffff")).light.surface.$value.components).toEqual([1, 1, 1]);
      expect(toDesignTokens(edge("#ff00ff")).light.onSurface.$value.components).toEqual([1, 0, 1]);
    });

    it("is deterministic", () => {
      const scheme = createColorScheme({ primary: "#6750a4" });
      expect(toDesignTokens(scheme)).toEqual(toDesignTokens(scheme));
    });

    it("survives a JSON round trip unchanged", () => {
      for (const seeds of SEEDS) {
        const tokens = toDesignTokens(createColorScheme(seeds));
        const parsed = JSON.parse(JSON.stringify(tokens)) as typeof tokens;
        expect(parsed).toEqual(tokens);
        expect(Object.keys(parsed.light)).toEqual(ROLES);
        expect(Object.keys(parsed.dark)).toEqual(ROLES);
      }
    });

    it("does not change the scheme", () => {
      const scheme = createColorScheme({ primary: "#6750a4" });
      const copy = structuredClone(scheme);
      toDesignTokens(scheme);
      expect(scheme).toEqual(copy);
    });

    it("returns independent documents: changing one leaves the other and the scheme as they were", () => {
      const scheme = createColorScheme({ primary: "#6750a4" });
      const copy = structuredClone(scheme);
      const tokens = toDesignTokens(scheme);
      const before = structuredClone(tokens);

      const light = tokens.light as unknown as Record<string, Record<string, unknown>>;
      const dark = tokens.dark;
      const token = light["surface"]!;
      const value = token["$value"] as { components: number[]; hex: string };
      value.components[0] = 0.5;
      value.hex = "#123456";
      token["$type"] = "other";
      delete light["primary"];

      expect(tokens.dark).toEqual(before.dark);
      expect(dark.surface.$value.hex).toBe(scheme.dark.surface);
      expect(scheme).toEqual(copy);

      // No object is shared: not between the documents, not between two calls, not between tokens.
      const again = toDesignTokens(scheme);
      const seen = new Set<object>();
      for (const document of [again.light, again.dark, toDesignTokens(scheme).light]) {
        for (const role of ROLES) {
          for (const object of [
            document[role],
            document[role].$value,
            document[role].$value.components,
          ]) {
            expect(seen.has(object)).toBe(false);
            seen.add(object);
          }
        }
        expect(seen.has(document)).toBe(false);
        seen.add(document);
      }
    });

    it("ignores the properties of the scheme other than light and dark", () => {
      const scheme = createColorScheme({ primary: "#6750a4" });
      expect(toDesignTokens({ light: scheme.light, dark: scheme.dark } as ColorScheme)).toEqual(
        toDesignTokens(scheme),
      );
    });

    it("works on a frozen scheme", () => {
      const scheme = createColorScheme({ primary: "#6750a4" });
      Object.freeze(scheme.light);
      Object.freeze(scheme.dark);
      Object.freeze(scheme);
      expect(Object.keys(toDesignTokens(scheme).light)).toEqual(ROLES);
    });
  });

  describe("toDesignTokens: invalid input", () => {
    const scheme = createColorScheme({ primary: "#6750a4" });

    it("throws INVALID_INPUT for a scheme that is not an object", () => {
      for (const input of [undefined, null, "scheme", 42, true]) {
        expectInvalid(() => toDesignTokens(input as never), "The scheme must be an object.");
      }
    });

    it("throws INVALID_INPUT for a missing or non-object mode", () => {
      for (const mode of MODES) {
        for (const value of [undefined, null, "roles", 1, () => ({}), []]) {
          expectInvalid(
            () => toDesignTokens({ ...scheme, [mode]: value } as unknown as ColorScheme),
            `The scheme must have "${mode}" roles, as an object.`,
          );
        }
      }
      expectInvalid(
        () => toDesignTokens({} as ColorScheme),
        'The scheme must have "light" roles, as an object.',
      );
      expectInvalid(
        () => toDesignTokens({ light: scheme.light } as ColorScheme),
        'The scheme must have "dark" roles, as an object.',
      );
    });

    it("throws INVALID_INPUT for a missing role, naming the mode and the role", () => {
      for (const mode of MODES) {
        for (const role of ROLES) {
          const message = `The ${mode} role "${role}" must be a lowercase #rrggbb hex color.`;
          // The key removed, and the key present with the value `undefined`.
          expectInvalid(() => toDesignTokens(withoutRole(scheme, mode, role)), message);
          expectInvalid(() => toDesignTokens(withRole(scheme, mode, role, undefined)), message);
        }
      }
    });

    it("throws INVALID_INPUT for an array instead of a scheme", () => {
      expectInvalid(() => toDesignTokens([] as never), "The scheme must be an object.");
      expectInvalid(() => toDesignTokens([scheme] as never), "The scheme must be an object.");
    });

    it("does not read inherited properties", () => {
      // A prototype that supplies a whole scheme.
      expectInvalid(
        () => toDesignTokens(Object.create(scheme) as ColorScheme),
        'The scheme must have "light" roles, as an object.',
      );
      expectInvalid(
        () => toDesignTokens({ light: scheme.light, __proto__: { dark: scheme.dark } } as never),
        'The scheme must have "dark" roles, as an object.',
      );
      // A mode that inherits its roles.
      expectInvalid(
        () => toDesignTokens({ ...scheme, light: Object.create(scheme.light) } as ColorScheme),
        'The light role "surface" must be a lowercase #rrggbb hex color.',
      );
      // A role found on Object.prototype.
      const target = Object.prototype as unknown as Record<string, unknown>;
      try {
        target["surface"] = "#123456";
        expectInvalid(
          () => toDesignTokens(withoutRole(scheme, "light", "surface")),
          'The light role "surface" must be a lowercase #rrggbb hex color.',
        );
        target["light"] = scheme.light;
        target["dark"] = scheme.dark;
        expectInvalid(
          () => toDesignTokens({} as ColorScheme),
          'The scheme must have "light" roles, as an object.',
        );
      } finally {
        delete target["surface"];
        delete target["light"];
        delete target["dark"];
      }
    });

    it("does not read non-enumerable own properties", () => {
      const roles: Partial<Record<Role, string>> = { ...scheme.light };
      delete roles.surface;
      Object.defineProperty(roles, "surface", { value: "#123456", enumerable: false });
      expectInvalid(
        () => toDesignTokens({ ...scheme, light: roles } as ColorScheme),
        'The light role "surface" must be a lowercase #rrggbb hex color.',
      );
    });

    it("ignores other keys inside the modes", () => {
      const extra = {
        ...scheme,
        light: { ...scheme.light, extra: "nope", $value: 1 },
        dark: { ...scheme.dark, "a.b": 2 },
      } as unknown as ColorScheme;
      const tokens = toDesignTokens(extra);
      expect(tokens).toEqual(toDesignTokens(scheme));
      expect(Object.keys(tokens.light)).toEqual(ROLES);
    });

    it("throws INVALID_INPUT for a role that is not a lowercase #rrggbb hex color", () => {
      const values = [
        "#FFFFFF",
        "#fFffff",
        "#fff",
        "#ffffffff",
        "ffffff",
        "#ggffff",
        "#ffffff ",
        " #ffffff",
        "#ffffff\n",
        "",
        "red",
        null,
        42,
        {},
        ["#ffffff"],
      ];
      for (const mode of MODES) {
        for (const value of values) {
          expectInvalid(
            () => toDesignTokens(withRole(scheme, mode, "onPrimary", value)),
            `The ${mode} role "onPrimary" must be a lowercase #rrggbb hex color.`,
          );
        }
      }
    });

    it("checks light before dark, and the roles in the order of Role", () => {
      const broken = {
        ...scheme,
        light: { ...scheme.light, info: "x", surface: "y" },
        dark: { ...scheme.dark, surface: "z" },
      } as unknown as ColorScheme;
      expectInvalid(
        () => toDesignTokens(broken),
        'The light role "surface" must be a lowercase #rrggbb hex color.',
      );
    });

    it("reports a scheme that cannot be read as INVALID_INPUT with the original error as cause", () => {
      const failure = new Error("boom");
      const throwing = (target: object): ColorScheme =>
        new Proxy(target, {
          getOwnPropertyDescriptor() {
            throw failure;
          },
        }) as ColorScheme;
      const getter = {
        get light(): never {
          throw failure;
        },
        dark: scheme.dark,
      } as unknown as ColorScheme;
      const badRole = {
        light: new Proxy(
          { ...scheme.light },
          {
            getOwnPropertyDescriptor() {
              throw failure;
            },
          },
        ),
        dark: scheme.dark,
      } as unknown as ColorScheme;
      for (const input of [throwing({}), getter, badRole]) {
        const error = expectInvalid(() => toDesignTokens(input), "The scheme could not be read.");
        expect(error.cause).toBe(failure);
      }
    });

    it("reports a revoked proxy as INVALID_INPUT with a cause", () => {
      const revokedScheme = Proxy.revocable({}, {});
      revokedScheme.revoke();
      const mode = Proxy.revocable({}, {});
      mode.revoke();
      for (const input of [revokedScheme.proxy, { light: mode.proxy, dark: scheme.dark }]) {
        const error = expectInvalid(
          () => toDesignTokens(input as ColorScheme),
          "The scheme could not be read.",
        );
        expect(error.cause).toBeInstanceOf(TypeError);
      }
    });

    it("reports a ColorSchemeError thrown by the input's own getter as could not be read", () => {
      const failure = new ColorSchemeError("INVALID_INPUT", "The caller's own error.");
      const input = {
        get light(): never {
          throw failure;
        },
        dark: scheme.dark,
      } as unknown as ColorScheme;
      const error = expectInvalid(() => toDesignTokens(input), "The scheme could not be read.");
      expect(error.cause).toBe(failure);
    });

    it("gives the validation errors no cause", () => {
      const error = expectInvalid(
        () => toDesignTokens(withRole(scheme, "dark", "info", "nope")),
        'The dark role "info" must be a lowercase #rrggbb hex color.',
      );
      expect("cause" in error).toBe(false);
    });
  });
}
