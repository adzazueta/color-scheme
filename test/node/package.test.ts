import { expect, test } from "vite-plus/test";
import pkg from "../../package.json" with { type: "json" };

test.each(["dependencies", "optionalDependencies", "peerDependencies"])(
  "package.json declares no %s",
  (field) => {
    const manifest: Record<string, unknown> = pkg;
    expect(manifest[field] ?? {}).toEqual({});
  },
);
