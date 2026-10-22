import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, test } from "vite-plus/test";

interface Result {
  exempt: boolean;
  problems: string[];
  checked: string[];
}
interface CheckReportModule {
  checkReport: (input: { version: string; algorithmVersion: string; root: string }) => Result;
}

// A computed specifier avoids requiring declarations for the plain .mjs script.
const script = new URL("../../../scripts/check-report.mjs", import.meta.url);
const { checkReport } = (await import(script.href)) as CheckReportModule;
const roots: string[] = [];

function makeRoot(files: Record<string, string> | null, algorithmVersion = "3"): string {
  const root = mkdtempSync(join(tmpdir(), "color-scheme-check-report-"));
  roots.push(root);
  for (const [name, body] of Object.entries(files ?? {})) {
    const file = join(root, "eval", "reports", algorithmVersion, name);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, body);
  }
  return root;
}

function markdown(algorithmVersion: string, variant?: string): string {
  return `| Algorithm version | ${algorithmVersion} |\n${variant ? `| Variant | ${variant} |\n` : ""}`;
}

function allFiles(algorithmVersion = "3"): Record<string, string> {
  const files: Record<string, string> = { "bench.md": markdown(algorithmVersion) };
  const variants = ["1", "2"].includes(algorithmVersion) ? [undefined] : ["tonal", "fidelity"];
  for (const variant of variants) {
    for (const set of ["dev", "test"]) {
      const prefix = variant ? `${variant}/` : "";
      files[`${prefix}${set}.json`] = JSON.stringify({ header: { algorithmVersion, variant } });
      files[`${prefix}${set}.md`] = markdown(algorithmVersion, variant);
    }
  }
  return files;
}

function check(files: Record<string, string> | null, algorithmVersion = "3"): Result {
  return checkReport({
    version: "0.1.0",
    algorithmVersion,
    root: makeRoot(files, algorithmVersion),
  });
}

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

describe("checkReport", () => {
  test("a prerelease is exempt without reports", () => {
    expect(
      checkReport({ version: "0.1.0-next.0", algorithmVersion: "3", root: makeRoot(null) }),
    ).toEqual({ exempt: true, problems: [], checked: [] });
  });

  test("a stable version without its report folder fails", () => {
    expect(check(null).problems).toEqual(["The folder eval/reports/3/ does not exist."]);
  });

  test("both variants and the shared benchmark pass", () => {
    expect(check(allFiles())).toMatchObject({ exempt: false, problems: [] });
    expect(check(allFiles()).checked).toHaveLength(9);
  });

  test.each(["1", "2"])("historical algorithm %s uses the flat layout", (algorithmVersion) => {
    const result = check(allFiles(algorithmVersion), algorithmVersion);
    expect(result.problems).toEqual([]);
    expect(result.checked).toHaveLength(5);
  });

  test.each(Object.keys(allFiles()))("a missing %s is named", (name) => {
    const files = allFiles();
    delete files[name];
    expect(check(files).problems).toEqual([`The file eval/reports/3/${name} is missing.`]);
  });

  test("a directory cannot stand in for a report file", () => {
    const files = allFiles();
    delete files["bench.md"];
    const root = makeRoot(files);
    mkdirSync(join(root, "eval/reports/3/bench.md"));
    expect(checkReport({ version: "0.1.0", algorithmVersion: "3", root }).problems).toEqual([
      "The file eval/reports/3/bench.md is missing.",
    ]);
  });

  test.each(Object.keys(allFiles()))("a wrong recorded algorithmVersion in %s fails", (name) => {
    const files = allFiles();
    files[name] = files[name]!.replace(
      name.endsWith(".json") ? '"3"' : "| 3 |",
      name.endsWith(".json") ? '"2"' : "| 2 |",
    );
    expect(check(files).problems).toEqual([
      `eval/reports/3/${name} names algorithmVersion "2", but the package is at "3".`,
    ]);
  });

  test.each(Object.keys(allFiles()).filter((name) => name !== "bench.md"))(
    "a wrong variant in %s fails",
    (name) => {
      const files = allFiles();
      const variant = name.startsWith("tonal/") ? "tonal" : "fidelity";
      files[name] = files[name]!.replaceAll(variant, "wrong");
      expect(check(files).problems).toEqual([
        `eval/reports/3/${name} names variant "wrong", but its folder is "${variant}".`,
      ]);
    },
  );

  test("invalid JSON and absent metadata name every affected file", () => {
    const files = allFiles();
    files["tonal/dev.json"] = "{invalid";
    files["fidelity/test.json"] = "{}";
    const problems = check(files).problems;
    expect(problems).toHaveLength(3);
    expect(problems[0]).toBe("eval/reports/3/tonal/dev.json is not valid JSON.");
    expect(problems[1]).toContain("fidelity/test.json names algorithmVersion undefined");
    expect(problems[2]).toContain("fidelity/test.json names variant undefined");
  });
});

describe("check-report CLI", () => {
  function run(root: string) {
    return spawnSync(process.execPath, [fileURLToPath(script), root], { encoding: "utf8" });
  }

  test("package.json prereleases skip the build as well as the report", () => {
    const root = makeRoot(null);
    writeFileSync(join(root, "package.json"), JSON.stringify({ version: "0.1.0-next.0" }));
    const result = run(root);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("is a prerelease");
  });

  test("a stable version requires a build with an actionable error", () => {
    const root = makeRoot(allFiles());
    writeFileSync(join(root, "package.json"), JSON.stringify({ version: "0.1.0" }));
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Build the package first with "vp pack"');
  });
});
