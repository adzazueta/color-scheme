// Evaluation report check (specification 10.1), adapted from color-extractor's ADZE-66.
// Usage: node scripts/check-report.mjs [repository root]
//
// package.json on the version pull request already contains the version being released, unlike
// .changeset/pre.json, which describes Changesets' mode. Prereleases need no build or report.
// Stable versions read algorithmVersion from a generated scheme in dist/index.js: run vp pack first.

import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SET_FILES = ["dev.json", "dev.md", "test.json", "test.md"];
const VARIANTS = ["tonal", "fidelity"];

/**
 * Checks the files and recorded metadata of one algorithmVersion.
 * @param {{ version: string, algorithmVersion: string, root: string }} input
 * @returns {{ exempt: boolean, problems: string[], checked: string[] }}
 */
export function checkReport({ version, algorithmVersion, root }) {
  if (version.includes("-")) return { exempt: true, problems: [], checked: [] };

  const relative = `eval/reports/${algorithmVersion}/`;
  const directory = join(root, relative);
  const problems = [];
  const checked = [];
  if (!existsSync(directory) || !statSync(directory).isDirectory()) {
    return { exempt: false, problems: [`The folder ${relative} does not exist.`], checked };
  }

  // Versions 1 and 2 predate variants and keep their original flat layout.
  const variants = ["1", "2"].includes(algorithmVersion) ? [undefined] : VARIANTS;
  const files = variants.flatMap((variant) =>
    SET_FILES.map((name) => ({ name: variant ? `${variant}/${name}` : name, variant })),
  );
  files.push({ name: "bench.md", variant: undefined });
  for (const { name, variant } of files) {
    const file = join(directory, name);
    const label = `${relative}${name}`;
    if (!existsSync(file) || !statSync(file).isFile()) {
      problems.push(`The file ${label} is missing.`);
      continue;
    }
    checked.push(label);
    const text = readFileSync(file, "utf8");
    let header;
    if (name.endsWith(".json")) {
      try {
        header = JSON.parse(text)?.header;
      } catch {
        problems.push(`${label} is not valid JSON.`);
        continue;
      }
    } else {
      header = {
        algorithmVersion: /^\| Algorithm version\s*\|\s*([^|]*?)\s*\|/m.exec(text)?.[1],
        variant: /^\| Variant\s*\|\s*([^|]*?)\s*\|/m.exec(text)?.[1],
      };
    }
    if (header?.algorithmVersion !== algorithmVersion) {
      problems.push(
        `${label} names algorithmVersion ${JSON.stringify(header?.algorithmVersion)}, ` +
          `but the package is at ${JSON.stringify(algorithmVersion)}.`,
      );
    }
    if (variant !== undefined && header?.variant !== variant) {
      problems.push(
        `${label} names variant ${JSON.stringify(header?.variant)}, ` +
          `but its folder is ${JSON.stringify(variant)}.`,
      );
    }
  }
  return { exempt: false, problems, checked };
}

/** Read the version through the built public API, as color-extractor does. */
async function builtAlgorithmVersion(root) {
  const entry = join(root, "dist", "index.js");
  if (!existsSync(entry)) {
    throw new Error(`${entry} does not exist. Build the package first with "vp pack".`);
  }
  const { createColorScheme } = await import(pathToFileURL(entry).href);
  return createColorScheme({ primary: "#ff0000" }).meta.algorithmVersion;
}

async function main() {
  const root = resolve(process.argv[2] ?? fileURLToPath(new URL("..", import.meta.url)));
  const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  if (version.includes("-")) {
    console.log(`Version ${version} is a prerelease: the evaluation report is not required.`);
    return;
  }
  const algorithmVersion = await builtAlgorithmVersion(root);
  const { problems, checked } = checkReport({ version, algorithmVersion, root });
  if (problems.length > 0) {
    console.error(
      `Version ${version} (algorithmVersion ${algorithmVersion}) cannot be released without its evaluation report:`,
    );
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error(
      "To fix it, run `vp run eval` on the maintainer's machine and commit " +
        `the reports in eval/reports/${algorithmVersion}/.`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    `Version ${version} (algorithmVersion ${algorithmVersion}): the evaluation report is complete.`,
  );
  for (const file of checked) console.log(`  ok ${file}`);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
