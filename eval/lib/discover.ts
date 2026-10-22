import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import type { SetName } from "./report.js";

export interface CoverFile {
  readonly id: string;
  readonly sha256: string;
  readonly path: string;
}

export function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Linked worktrees resolve the sibling of the main checkout, matching color-extractor. */
export function resolveEvalDir(root: string, override: string | undefined): string {
  if (override !== undefined && override !== "") return resolve(override);
  let checkout = root;
  try {
    const common = execFileSync(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    ).trim();
    if (basename(common) === ".git") checkout = dirname(common);
  } catch {
    // An unpacked checkout also works, with the sibling of root.
  }
  return resolve(checkout, "..", "color-extractor-eval");
}

/** Read only the public hash/id mapping; annotations and private file names never enter results. */
export function parseIds(text: string, set: SetName): ReadonlyMap<string, string> {
  const value: unknown = JSON.parse(text);
  if (
    typeof value !== "object" ||
    value === null ||
    !("images" in value) ||
    !("schemaVersion" in value) ||
    value.schemaVersion !== 1 ||
    !("set" in value) ||
    value.set !== set ||
    !Array.isArray(value.images)
  ) {
    throw new Error(`Invalid ${set} annotations.`);
  }
  const ids = new Set<string>();
  const hashes = new Map<string, string>();
  for (const item of value.images as unknown[]) {
    if (
      typeof item !== "object" ||
      item === null ||
      !("id" in item) ||
      !("sha256" in item) ||
      typeof item.id !== "string" ||
      typeof item.sha256 !== "string" ||
      !new RegExp(`^${set}-[0-9]{3,}$`).test(item.id) ||
      !/^[0-9a-f]{64}$/.test(item.sha256)
    ) {
      throw new Error(`Invalid ${set} cover mapping.`);
    }
    if (ids.has(item.id) || hashes.has(item.sha256)) throw new Error("Duplicate cover mapping.");
    ids.add(item.id);
    hashes.set(item.sha256, item.id);
  }
  if (ids.size === 0) throw new Error(`No ${set} cover ids found.`);
  return hashes;
}

/** Fixed recursive order, matching the reference extensions; never follow symlinks or write covers. */
export async function discover(
  evalDir: string,
  set: SetName,
  ids: ReadonlyMap<string, string>,
): Promise<CoverFile[]> {
  const found = new Map<string, CoverFile>();
  async function walk(directory: string, depth: number): Promise<void> {
    if (depth > 8) throw new Error("Evaluation folder is too deep.");
    const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const path = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("Evaluation folders must not contain symlinks.");
      if (entry.isDirectory()) await walk(path, depth + 1);
      else if (
        entry.isFile() &&
        [".jpg", ".jpeg", ".png", ".webp", ".avif"].includes(extname(path).toLowerCase())
      ) {
        const bytes = await readFile(path);
        if (bytes.length > 33_554_432)
          throw new Error("Cover exceeds the decoder's default byte limit.");
        const hash = sha256(bytes);
        const id = ids.get(hash);
        if (id === undefined)
          throw new Error(`A ${set} cover has no id in color-extractor's annotations.`);
        if (found.has(hash)) throw new Error(`Duplicate cover: ${id}.`);
        found.set(hash, { id, sha256: hash, path });
      }
    }
  }
  try {
    await walk(resolve(evalDir, set), 0);
  } catch (error) {
    throw new Error(`Cannot discover ${set} covers; check COLOR_EXTRACTOR_EVAL_DIR.`, {
      cause: error,
    });
  }
  if (found.size !== ids.size) throw new Error(`Some ${set} annotations have no cover.`);
  return [...found.values()].sort(
    (a, b) =>
      Number(a.id.slice(4)) - Number(b.id.slice(4)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}
