// Runs inside the empty smoke-test project (smoke.mjs copies it there as check.mjs) and imports the
// installed package by name. It checks the shape of the results, not their colors: the tests and
// the snapshots in the repository check the colors.
import assert from "node:assert/strict";

const root = await import("@adzazueta/color-scheme");

// The runtime exports of the root. Types are erased, so only these four exist at run time.
const EXPORTS = [
  "ColorSchemeError",
  "createColorScheme",
  "seedsFromColorExtractor",
  "toDesignTokens",
];
assert.deepEqual(Object.keys(root).sort(), EXPORTS, "the exports of the root");
for (const name of EXPORTS) {
  assert.equal(typeof root[name], "function", `${name} is a function`);
}

// The 34 roles in the order of `Role`, which every object keyed by role follows.
const ROLES = [
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
const MODES = ["light", "dark"];
const HEX = /^#[0-9a-f]{6}$/;

// `primary` alone, and all three seeds in uppercase and `#RGB`, which are normalized.
const CASES = [
  {
    seeds: { primary: "#6750a4" },
    expected: {
      primary: "#6750a4",
      seeds: { primary: "#6750a4" },
      sources: ["given", "derived", "derived"],
    },
  },
  {
    seeds: { primary: "#D32F2F", secondary: "#386A20", neutral: "#FFE" },
    expected: {
      primary: "#d32f2f",
      seeds: { primary: "#d32f2f", secondary: "#386a20", neutral: "#ffffee" },
      sources: ["given", "given", "given"],
    },
  },
];

for (const variant of ["tonal", "fidelity"])
  for (const { seeds, expected } of CASES) {
    const label = `${variant} ${JSON.stringify(seeds)}`;
    const scheme = root.createColorScheme(seeds, { variant });
    assert.deepEqual(Object.keys(scheme.meta), ["algorithmVersion", "variant"]);
    assert.equal(scheme.meta.algorithmVersion, "3");
    assert.equal(scheme.meta.variant, variant);
    for (const [name, hex] of Object.entries(expected.seeds)) {
      assert.equal(scheme.seeds[name].hex, hex, label + ": normalized " + name + " seed");
    }

    assert.equal(scheme.schemaVersion, 1, `${label}: schemaVersion`);
    assert.equal(
      typeof scheme.meta.algorithmVersion,
      "string",
      `${label}: algorithmVersion is a string`,
    );
    assert.ok(scheme.meta.algorithmVersion.length > 0, `${label}: algorithmVersion is not empty`);

    assert.deepEqual(Object.keys(scheme.seeds), ["primary", "secondary", "neutral"]);
    assert.equal(scheme.seeds.primary.hex, expected.primary, `${label}: the primary seed`);
    assert.deepEqual(
      Object.values(scheme.seeds).map((seed) => seed.source),
      expected.sources,
      `${label}: the seed sources`,
    );

    for (const mode of MODES) {
      const roles = scheme[mode];
      assert.deepEqual(Object.keys(roles), ROLES, `${label}: the ${mode} roles`);
      for (const role of ROLES) {
        assert.match(roles[role], HEX, `${label}: ${mode}.${role}`);
      }

      const report = scheme.report[mode];
      assert.ok(report.pairs.length > 0, `${label}: the ${mode} report has pairs`);
      for (const pair of report.pairs) {
        const name = `${label}: ${mode} ${pair.foreground} on ${pair.background}`;
        assert.ok(ROLES.includes(pair.foreground) && ROLES.includes(pair.background), name);
        assert.ok(pair.contrast >= pair.minContrast, `${name} meets its minimum contrast`);
      }
      assert.equal(
        report.adjustments.length,
        expected.sources.filter((source) => source === "given").length,
        `${label}: one ${mode} adjustment per given seed`,
      );
    }

    const tokens = root.toDesignTokens(scheme);
    assert.deepEqual(Object.keys(tokens), MODES, `${label}: the token documents`);
    for (const mode of MODES) {
      const document = tokens[mode];
      assert.deepEqual(Object.keys(document), ROLES, `${label}: the ${mode} tokens`);
      for (const role of ROLES) {
        const name = `${label}: ${mode} token ${role}`;
        const { $type, $value } = document[role];
        assert.equal($type, "color", name);
        assert.equal($value.colorSpace, "srgb", name);
        assert.equal($value.hex, scheme[mode][role], name);
        assert.equal($value.components.length, 3, name);
        $value.components.forEach((component, index) => {
          assert.ok(component >= 0 && component <= 1, `${name}: component ${index} within 0 and 1`);
          const channel = Number.parseInt($value.hex.slice(1 + 2 * index, 3 + 2 * index), 16);
          assert.equal(
            component,
            channel / 255,
            `${name}: component ${index} is its channel / 255`,
          );
        });
      }
    }
  }

const adapterSeeds = root.seedsFromColorExtractor({
  schemaVersion: 1,
  colors: [
    { hex: "#D32F2F", coverage: 0.6 },
    { hex: "#386A20", coverage: 0.3 },
    { hex: "#FFFFEE", coverage: 0.1 },
  ],
});
const adapterSeedKeys = Object.keys(adapterSeeds);
assert.ok(adapterSeedKeys.length > 0, "the adapter returns at least one seed");
assert.ok(
  adapterSeedKeys.every((name) => ["primary", "secondary", "neutral"].includes(name)),
  "the adapter returns only primary, secondary, and neutral keys",
);
for (const [name, hex] of Object.entries(adapterSeeds)) {
  assert.match(hex, HEX, "the adapter returns a lowercase #rrggbb " + name + " seed");
}
const adapterScheme = root.createColorScheme(adapterSeeds);
assert.equal(adapterScheme.meta.variant, "tonal", "tonal is the default");
const adapterTokens = root.toDesignTokens(adapterScheme);
assert.deepEqual(Object.keys(adapterTokens), MODES, "adapter seeds produce both token documents");
for (const mode of MODES) {
  assert.deepEqual(Object.keys(adapterTokens[mode]), ROLES, "adapter " + mode + " tokens");
}

const adapterErrorCases = [
  { result: { schemaVersion: 2, colors: [] }, code: "UNSUPPORTED_SCHEMA" },
  { result: { schemaVersion: 1, colors: [] }, code: "NO_COLORS" },
];
for (const { result, code } of adapterErrorCases) {
  assert.throws(
    () => root.seedsFromColorExtractor(result),
    (error) => {
      assert.ok(error instanceof root.ColorSchemeError, code + " is a ColorSchemeError");
      assert.equal(error.code, code);
      return true;
    },
  );
}

assert.throws(
  () => root.createColorScheme({ primary: "not a color" }),
  (error) => {
    assert.ok(error instanceof root.ColorSchemeError, "a ColorSchemeError");
    assert.ok(error instanceof Error, "an Error");
    assert.equal(error.name, "ColorSchemeError");
    assert.equal(error.code, "INVALID_INPUT");
    return true;
  },
);

for (const options of [null, [], { extra: true }, { variant: "unknown" }]) {
  assert.throws(
    () => root.createColorScheme({ primary: "#6750a4" }, options),
    (error) => {
      assert.ok(error instanceof root.ColorSchemeError);
      assert.equal(error.code, "INVALID_INPUT");
      return true;
    },
  );
}

console.log(
  CASES.length * 2 +
    " schemes with " +
    ROLES.length +
    " roles in each mode, adapter seeds and tokens, and INVALID_INPUT, UNSUPPORTED_SCHEMA, and NO_COLORS are correct.",
);
