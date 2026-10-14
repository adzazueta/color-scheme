import { expect, test } from "vite-plus/test";

// No `/// <reference lib="dom" />` here. Color.js's types already load the DOM types into the
// program that includes the tests, so CI also type checks src/ alone (`tsconfig.src.json`), where
// DOM use must stay an error.
test("runs in a real browser", () => {
  expect("window" in globalThis).toBe(true);
  expect("document" in globalThis).toBe(true);
});
