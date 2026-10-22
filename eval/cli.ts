import { execFileSync } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { extractColors } from "@adzazueta/color-extractor/node";
import sharp from "sharp";
import { createColorScheme, seedsFromColorExtractor } from "@/index.js";
import pkg from "../package.json" with { type: "json" };
import { benchmarkRows, renderBenchmarks } from "./lib/benchmark.js";
import { discover, parseIds, resolveEvalDir, sha256 } from "./lib/discover.js";
import {
  buildCover,
  buildReport,
  type CoverResult,
  type Report,
  type SetName,
} from "./lib/report.js";
import { renderHtml, renderJson, renderMarkdown } from "./lib/render.js";

/** Always evaluate both sets, then run the existing benchmarks. All inputs outside root are read-only. */
export async function main(argv: readonly string[]): Promise<number> {
  if (argv.length > 0) {
    if (argv.length === 1 && argv[0] === "--help") {
      console.info(
        "Usage: vp run eval\nEvaluates dev and test, writes public JSON/Markdown and ignored HTML, and records benchmarks.\nCOLOR_EXTRACTOR_EVAL_DIR overrides the private covers.\nCOLOR_EXTRACTOR_ANNOTATIONS_DIR overrides the public color-extractor annotation folder.",
      );
      return 0;
    }
    throw new Error("Unknown arguments. Usage: vp run eval");
  }
  const started = performance.now();
  const root = fileURLToPath(new URL("..", import.meta.url));
  const evalDir = resolveEvalDir(root, process.env["COLOR_EXTRACTOR_EVAL_DIR"]);
  const annotationsDir =
    process.env["COLOR_EXTRACTOR_ANNOTATIONS_DIR"] ||
    resolve(evalDir, "..", "color-extractor", "eval", "annotations");
  const out = resolve(root, "eval", "out");
  const generatedAt = new Date().toISOString();
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const reports: { report: Report; html: string }[] = [];
  const seen = new Set<string>();
  let algorithmVersion: string | undefined;
  let extractorVersion: string | undefined;
  for (const set of ["dev", "test"] as const satisfies readonly SetName[]) {
    const annotations = await readFile(resolve(annotationsDir, `${set}.json`), "utf8");
    const files = await discover(evalDir, set, parseIds(annotations, set));
    const covers: CoverResult[] = [];
    const images = new Map<string, string>();
    for (const file of files) {
      if (seen.has(file.sha256)) throw new Error("The same cover exists in both sets.");
      seen.add(file.sha256);
      const bytes = await readFile(file.path);
      if (sha256(bytes) !== file.sha256) throw new Error(`Cover changed during scan: ${file.id}.`);
      // Reference eval/config.ts REPORT_COUNT=5 and lib/analyze.ts default decode limits.
      const result = await extractColors(bytes, { mode: "perceptual", count: 5 });
      const scheme = createColorScheme(seedsFromColorExtractor(result));
      algorithmVersion ??= scheme.meta.algorithmVersion;
      extractorVersion ??= result.meta.algorithmVersion;
      if (
        algorithmVersion !== scheme.meta.algorithmVersion ||
        extractorVersion !== result.meta.algorithmVersion
      ) {
        throw new Error("Algorithm versions changed within the run.");
      }
      covers.push(buildCover(file.id, result, scheme));
      images.set(file.id, pathToFileURL(file.path).href);
    }
    if (algorithmVersion === undefined || extractorVersion === undefined)
      throw new Error("No covers evaluated.");
    const report = buildReport(
      set,
      {
        algorithmVersion,
        packageVersion: pkg.version,
        commit,
        generatedAt,
        extractor: {
          packageVersion: pkg.devDependencies["@adzazueta/color-extractor"],
          algorithmVersion: extractorVersion,
          mode: "perceptual",
          count: 5,
          limits: "defaults",
        },
        decoder: { sharp: sharp.versions.sharp, libvips: sharp.versions.vips },
        annotationsSha256: sha256(annotations),
      },
      covers,
    );
    reports.push({ report, html: renderHtml(report, images) });
    console.info(
      `${set}: ${report.summary.covers} covers, ${report.summary.neutralThemes} neutral themes, ${report.summary.verificationFailures} verification failures`,
    );
  }
  if (
    algorithmVersion === undefined ||
    !/^[0-9A-Za-z][0-9A-Za-z._-]{0,63}$/.test(algorithmVersion)
  ) {
    throw new Error("Invalid algorithm version for the report folder.");
  }
  await mkdir(out, { recursive: true });
  const benchJson = resolve(out, "bench.json");
  execFileSync(
    "vp",
    [
      "test",
      "bench",
      "--project",
      "node (bench)",
      "--reporter",
      "verbose",
      "--reporter",
      "json",
      `--outputFile.json=${benchJson}`,
    ],
    { cwd: root, stdio: "inherit" },
  );
  const rows = benchmarkRows(await readFile(benchJson, "utf8"));
  const destination = resolve(root, "eval", "reports", algorithmVersion);
  await mkdir(destination, { recursive: true });
  for (const { report, html } of reports) {
    await writeFile(resolve(destination, `${report.set}.json`), renderJson(report));
    await writeFile(resolve(destination, `${report.set}.md`), renderMarkdown(report));
    await writeFile(resolve(out, `${report.set}.html`), html);
  }
  await writeFile(
    resolve(destination, "bench.md"),
    renderBenchmarks(rows, algorithmVersion, pkg.version, commit, generatedAt),
  );
  console.info(
    `Evaluation completed in ${((performance.now() - started) / 1000).toFixed(2)} s. Visual reports: ${out}`,
  );
  return reports.some(({ report }) => report.summary.verificationFailures > 0) ? 1 : 0;
}
