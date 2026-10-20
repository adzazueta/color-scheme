import { parseHex } from "@/color/hex.js";
import { ColorSchemeError } from "@/errors.js";
import { inputError, isRecord, readOwn } from "@/input.js";
import type { ColorScheme, DesignTokens, Role } from "@/types.js";

/**
 * The 34 roles, in the order of `Role`. Typed as a record so that adding or removing a `Role`
 * fails to compile here; the keys of a plain object keep their insertion order.
 */
const ROLE_KEYS: Readonly<Record<Role, true>> = {
  surface: true,
  surfaceContainerLow: true,
  surfaceContainer: true,
  surfaceContainerHigh: true,
  onSurface: true,
  onSurfaceVariant: true,
  outline: true,
  outlineVariant: true,
  inverseSurface: true,
  onInverseSurface: true,
  primary: true,
  onPrimary: true,
  primaryContainer: true,
  onPrimaryContainer: true,
  secondary: true,
  onSecondary: true,
  secondaryContainer: true,
  onSecondaryContainer: true,
  error: true,
  onError: true,
  errorContainer: true,
  onErrorContainer: true,
  warning: true,
  onWarning: true,
  warningContainer: true,
  onWarningContainer: true,
  success: true,
  onSuccess: true,
  successContainer: true,
  onSuccessContainer: true,
  info: true,
  onInfo: true,
  infoContainer: true,
  onInfoContainer: true,
};

const ROLES: readonly Role[] = Object.keys(ROLE_KEYS) as Role[];

const LOWERCASE_HEX = /^#[0-9a-f]{6}$/;

type Mode = "light" | "dark";

function invalid(message: string): ColorSchemeError {
  return new ColorSchemeError("INVALID_INPUT", message);
}

/** The values of the 34 roles of one mode, read once. A role that is not an own key is `undefined`. */
type ModeValues = Readonly<Record<Role, unknown>>;

/** What `toDesignTokens` read from its input: `null` marks a missing or invalid object. */
interface Snapshot {
  readonly scheme: boolean;
  readonly light: ModeValues | null;
  readonly dark: ModeValues | null;
}

function readMode(value: unknown): ModeValues | null {
  if (!isRecord(value)) return null;
  const values = {} as Record<Role, unknown>;
  for (const role of ROLES) values[role] = readOwn(value, role);
  return values;
}

/** Builds the document of one mode, validating each role. Returns fresh plain objects. */
function buildDocument(mode: Mode, values: ModeValues | null): DesignTokens {
  if (values === null) {
    throw invalid(`The scheme must have "${mode}" roles, as an object.`);
  }
  const document = {} as Record<Role, DesignTokens[Role]>;
  for (const role of ROLES) {
    const hex = values[role];
    if (typeof hex !== "string" || !LOWERCASE_HEX.test(hex)) {
      throw invalid(`The ${mode} role "${role}" must be a lowercase #rrggbb hex color.`);
    }
    const { r, g, b } = parseHex(hex);
    document[role] = {
      $type: "color",
      $value: { colorSpace: "srgb", components: [r / 255, g / 255, b / 255], hex },
    };
  }
  return document;
}

/**
 * Exports a color scheme as two W3C Design Tokens (DTCG) documents, synchronously: one for light
 * mode and one for dark mode. They follow the stable Design Tokens Format Module 2025.10 and its
 * Color module.
 *
 * Each document is flat, with one color token per role, named after the role (`surface`,
 * `onPrimary`, and so on), in the order of `Role`. Each token has `$type` `"color"` and a `$value`
 * with `colorSpace` `"srgb"`, `components` (the red, green, and blue channels, each the 8-bit
 * channel divided by 255, not rounded), and `hex` (the role's lowercase `#rrggbb` color, as the
 * fallback). `alpha` is omitted, so every color is opaque. Both documents have the same token
 * names, so each can be the token source of the `light` or `dark` context of a modifier in a DTCG
 * resolver (Resolver Module 2025.10, where a context maps to an array of token sources): a native
 * application switches modes by switching documents. Write each one as JSON, such as
 * `JSON.stringify(light, null, 2)`, to `light.tokens.json` and `dark.tokens.json`, and reference
 * them from the resolver:
 *
 * ```json
 * "modifiers": {
 *   "mode": {
 *     "contexts": {
 *       "light": [{ "$ref": "light.tokens.json" }],
 *       "dark": [{ "$ref": "dark.tokens.json" }]
 *     },
 *     "default": "light"
 *   }
 * }
 * ```
 *
 * The documents are new plain objects that share nothing with each other or with `scheme`, so
 * changing one leaves the others as they were. CSS custom properties are not produced here.
 *
 * @param scheme - A scheme from `createColorScheme`. Only the own enumerable keys `light` and
 *   `dark` are read, and in each, only the 34 roles, which must be lowercase `#rrggbb` hex colors:
 *   inherited properties and any other key, in the scheme or in a mode, are ignored.
 * @returns The `light` and `dark` documents.
 * @throws {ColorSchemeError} `INVALID_INPUT` when `scheme` is not a valid scheme: not an object (an
 *   array is not), a missing or non-object `light` or `dark`, or a role that is missing or not a lowercase `#rrggbb`
 *   hex color. The checks run in a fixed order, so the same input always gives the same error.
 *   Also when the scheme cannot be read, such as an object whose getter or proxy throws, including
 *   a caller's `ColorSchemeError`: the message is then "The scheme could not be read." and the
 *   original error is the `cause`.
 */
export function toDesignTokens(scheme: ColorScheme): { light: DesignTokens; dark: DesignTokens } {
  // Reading is the only step that runs the caller's code (getters and proxies), so any error here,
  // even a `ColorSchemeError` of the caller's own, is "could not be read". Validation and the build
  // run outside the `try`.
  let snapshot: Snapshot;
  try {
    snapshot = isRecord(scheme)
      ? {
          scheme: true,
          light: readMode(readOwn(scheme, "light")),
          dark: readMode(readOwn(scheme, "dark")),
        }
      : { scheme: false, light: null, dark: null };
  } catch (error) {
    throw inputError(error, "The scheme could not be read.");
  }
  if (!snapshot.scheme) throw invalid("The scheme must be an object.");
  return {
    light: buildDocument("light", snapshot.light),
    dark: buildDocument("dark", snapshot.dark),
  };
}
