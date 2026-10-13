import { expect, test } from "vite-plus/test";

// No `/// <reference lib="dom" />`: it would load the DOM types for the whole program, so the type
// check would stop catching DOM use in src/, which must stay free of it.
test("runs in a real browser", () => {
  expect("window" in globalThis).toBe(true);
  expect("document" in globalThis).toBe(true);
});
