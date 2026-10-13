import { expect, test } from "vite-plus/test";
import * as root from "@/index.js";

test("the @/ alias resolves to src/", () => {
  expect(typeof root).toBe("object");
});
