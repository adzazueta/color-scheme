// Packed-package smoke test (specification 10.1). Adapted from color-extractor: scripts/smoke.mjs
// at commit 0df7864efcb37cac59a70205a8468c406e26b61a (ADZE-64, ADZE-70), without the sharp phases.
//
// Usage: node scripts/smoke.mjs <path to the .tgz>
// Locally:
//   vp pack && vp pm pack --pack-destination <dir>
//   node scripts/smoke.mjs <dir>/*.tgz
//
// It checks the tarball allowlist, installs it with npm in an empty project outside the repository,
// verifies the installed package and its declarations, and runs smoke-check.mjs there. That script
// imports the root, adapts a color-extractor result into seeds, builds schemes, exports their
// tokens, and checks errors. Only the installed package is tested, never the repository source. Set
// SMOKE_EXPECTED_NODE (for example 22.12.0) to require an exact Node.js version. Only node: built-ins
// are used, because Node.js 22.12.0 cannot run TypeScript.

import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { entriesOutsideAllowlist, readTarballEntries, TARBALL_ALLOWLIST } from "./tarball.mjs";

const PACKAGE_NAME = "@adzazueta/color-scheme";

let step = 0;
const announce = (message) => console.log(`\n[smoke ${++step}] ${message}`);

/** Paths in node_modules/@adzazueta/color-scheme/dist of every declaration file. */
function declarationFiles(directory) {
  return readdirSync(directory, { recursive: true, encoding: "utf8" })
    .filter((name) => /\.d\.[cm]?ts$/.test(name))
    .map((name) => join(directory, name));
}

/** Removes comments while preserving strings and triple-slash reference directives. */
function stripDeclarationComments(source) {
  return source.replace(
    /("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|\/\*[\s\S]*?\*\/|(?<!\/)\/\/(?!\/\s*<).*$/gm,
    (match, stringLiteral) => stringLiteral ?? "",
  );
}

let project;
try {
  const argument = process.argv[2];
  if (argument === undefined) {
    throw new Error("Usage: node scripts/smoke.mjs <path to the .tgz>");
  }
  const tarball = resolve(argument);
  if (!existsSync(tarball)) {
    throw new Error(`The tarball does not exist: ${tarball}`);
  }

  announce("Check the Node.js version");
  const expectedNode = process.env.SMOKE_EXPECTED_NODE;
  if (expectedNode !== undefined) {
    if (process.version !== `v${expectedNode}`) {
      throw new Error(`Expected Node.js v${expectedNode}, but running ${process.version}.`);
    }
    console.log(`Node.js ${process.version} is the expected version.`);
  } else {
    console.log(`Node.js ${process.version} (SMOKE_EXPECTED_NODE is not set).`);
  }

  announce("Check the files in the tarball");
  const entries = readTarballEntries(tarball);
  const files = entries.filter((entry) => entry.type === "file").map((entry) => entry.path);
  if (!files.includes("package/package.json")) {
    throw new Error("The tarball has no package/package.json.");
  }
  if (!files.some((file) => file.startsWith("package/dist/"))) {
    throw new Error("The tarball has no files in package/dist/.");
  }
  const outside = entriesOutsideAllowlist(entries);
  if (outside.length > 0) {
    throw new Error(
      `The tarball contains files outside the allowlist (${TARBALL_ALLOWLIST.join(", ")}): ${outside.join(", ")}.`,
    );
  }
  console.log(`${files.length} files, all in the allowlist.`);

  announce("Create the empty project outside the repository");
  // npm refuses to run inside the repository (devEngines), so the project lives in a temp folder.
  const repository = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const temporaryDirectory = resolve(process.env.RUNNER_TEMP || tmpdir());
  const fromRepository = relative(repository, temporaryDirectory);
  if (
    fromRepository === "" ||
    (fromRepository !== ".." &&
      !fromRepository.startsWith(".." + sep) &&
      !isAbsolute(fromRepository))
  ) {
    throw new Error("The temporary project directory must be outside the repository.");
  }
  project = mkdtempSync(join(temporaryDirectory, "color-scheme-smoke-"));
  writeFileSync(
    join(project, "package.json"),
    JSON.stringify({ name: "smoke", private: true, type: "module" }),
  );
  copyFileSync(
    fileURLToPath(new URL("./smoke-check.mjs", import.meta.url)),
    join(project, "check.mjs"),
  );
  console.log(project);

  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const run = (command, args) =>
    execFileSync(command, args, { cwd: project, stdio: "inherit", shell: false });
  console.log(`npm ${execFileSync(npm, ["--version"], { cwd: project, encoding: "utf8" }).trim()}`);

  announce(`Install ${tarball} with npm`);
  run(npm, ["install", "--ignore-scripts", "--no-audit", "--no-fund", tarball]);

  announce("Check that the installed package has no runtime dependencies");
  const packageDirectory = join(project, "node_modules", ...PACKAGE_NAME.split("/"));
  const manifest = JSON.parse(readFileSync(join(packageDirectory, "package.json"), "utf8"));
  const scripts = manifest.scripts;
  for (const name of ["preinstall", "install", "postinstall"]) {
    if (scripts !== null && typeof scripts === "object" && Object.hasOwn(scripts, name)) {
      throw new Error(
        "The installed package.json declares a " +
          name +
          " script, which --ignore-scripts would hide.",
      );
    }
  }
  for (const field of [
    "dependencies",
    "optionalDependencies",
    "peerDependencies",
    "bundleDependencies",
    "bundledDependencies",
  ]) {
    const value = manifest[field];
    if (value !== undefined && Object.keys(value).length > 0) {
      throw new Error(`The installed package.json declares ${field}: ${JSON.stringify(value)}.`);
    }
  }
  // What npm actually installed: the project root and the package, nothing else.
  const lockfile = JSON.parse(readFileSync(join(project, "package-lock.json"), "utf8"));
  const installed = Object.keys(lockfile.packages ?? {}).sort();
  const expected = ["", `node_modules/${PACKAGE_NAME}`];
  if (JSON.stringify(installed) !== JSON.stringify(expected)) {
    throw new Error(`npm installed more than the package: ${installed.join(", ")}.`);
  }
  console.log(`${PACKAGE_NAME}@${manifest.version} installed alone, with no dependencies.`);

  announce("Check that the declarations reference no other @adzazueta package");
  const declarations = declarationFiles(join(packageDirectory, "dist"));
  if (declarations.length === 0) {
    throw new Error("The installed package has no .d.ts files in dist/.");
  }
  for (const file of declarations) {
    // Keep string literals so a string containing "/*" cannot hide a later import. TSDoc prose is
    // removed, while /// <reference types="..."> directives stay visible for this check.
    const source = stripDeclarationComments(readFileSync(file, "utf8"));
    if (/["']@adzazueta\//.test(source)) {
      throw new Error(`${file} references an @adzazueta module; the types must not depend on it.`);
    }
  }
  console.log(`${declarations.length} declaration files reference no @adzazueta module.`);

  announce("Import the root, build schemes, export their tokens, and check an error");
  run(process.execPath, ["check.mjs"]);

  console.log(
    "\nSmoke test passed: installed exports, color-extractor adapter, schemes, tokens, and errors are correct.",
  );
} catch (error) {
  console.error(
    `\nSmoke test FAILED at step ${step}: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
} finally {
  if (project !== undefined) {
    rmSync(project, { recursive: true, force: true });
  }
}
