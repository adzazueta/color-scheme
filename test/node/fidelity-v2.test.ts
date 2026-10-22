import { readFileSync } from "node:fs";
import { expect, test } from "vite-plus/test";
import { renderSchemeSnapshots } from "../shared/snapshots.js";

test("fidelity preserves every algorithm 2 snapshot role, seed and exact report bit", () => {
  // This fixture was copied from the existing snapshot BEFORE algorithm 3 regeneration. Unlike
  // a snapshot assertion it cannot be rewritten by -u: only the intended metadata is removed.
  const previous = readFileSync(
    new URL("../shared/fixtures/algorithm-2-schemes.txt", import.meta.url),
    "utf8",
  );
  const current = renderSchemeSnapshots("fidelity")
    .replace(/^algorithmVersion 3$/gm, "algorithmVersion 2")
    .replace(/^variant fidelity\n/gm, "");
  expect(current).toBe(previous);
});
