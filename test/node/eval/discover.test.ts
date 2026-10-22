import { mkdtemp, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "vite-plus/test";
import { discover, parseIds, resolveEvalDir, sha256 } from "../../../eval/lib/discover.js";

const hash = sha256("synthetic fixture, not an image");
const annotations = JSON.stringify({
  schemaVersion: 1,
  set: "dev",
  images: [{ id: "dev-017", sha256: hash }],
});

test("annotation mapping validates set, ids, hashes, and uniqueness", () => {
  expect(parseIds(annotations, "dev").get(hash)).toBe("dev-017");
  expect(() => parseIds(annotations, "test")).toThrow("Invalid");
  expect(() => parseIds(annotations.replace("dev-017", "cover.jpg"), "dev")).toThrow("Invalid");
  expect(() => parseIds(annotations.replace(hash, "bad"), "dev")).toThrow("Invalid");
  const value = JSON.parse(annotations) as { images: unknown[] };
  value.images.push(value.images[0]);
  expect(() => parseIds(JSON.stringify(value), "dev")).toThrow("Duplicate");
});

test("cover ids follow bytes across renames and missing or unknown covers fail", async () => {
  const root = await mkdtemp(join(tmpdir(), "color-scheme-eval-"));
  try {
    await mkdir(join(root, "dev"));
    const original = join(root, "dev", "synthetic.png");
    await writeFile(original, "synthetic fixture, not an image");
    const ids = parseIds(annotations, "dev");
    expect((await discover(root, "dev", ids))[0]?.id).toBe("dev-017");
    const renamed = join(root, "dev", "renamed.png");
    await rename(original, renamed);
    expect((await discover(root, "dev", ids))[0]?.id).toBe("dev-017");
    await expect(discover(root, "dev", new Map())).rejects.toThrow("Cannot discover");
    await rm(renamed);
    await expect(discover(root, "dev", ids)).rejects.toThrow("no cover");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cover override resolves relative paths", () => {
  expect(resolveEvalDir("/unused", "./local-covers")).toBe(resolve("local-covers"));
});
