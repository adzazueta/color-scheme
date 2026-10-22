/// <reference lib="dom" />
import { ColorExtractorError, extractColors } from "@adzazueta/color-extractor/browser";
import {
  ColorSchemeError,
  createColorScheme,
  seedsFromColorExtractor,
  toDesignTokens,
  type ColorScheme,
  type Seeds,
} from "@/index.js";
import { colorChip, element, required } from "./ui/dom.js";
import { renderMode, renderSeeds } from "./ui/render.js";

const form = required("seeds-form", "form");
const output = required("output", "section");
const errorMessage = required("error", "p");
const status = required("extraction-status", "p");
const extracted = required("extracted-colors", "ul");
const cover = required("cover", "input");
const dropZone = required("drop-zone", "div");
const seedNames = ["primary", "secondary", "neutral"] as const;
const fields = seedNames.map((name) => ({
  name,
  text: required(name, "input"),
  picker: required(`${name}-picker`, "input"),
}));
let scheme: ColorScheme | null = null;
let extraction: AbortController | null = null;

function showError(error: unknown): void {
  errorMessage.textContent =
    error instanceof ColorSchemeError || error instanceof ColorExtractorError
      ? `${error.code}: ${error.message}`
      : error instanceof Error
        ? error.message
        : "An unexpected error occurred.";
  errorMessage.hidden = false;
  scheme = null;
  output.hidden = true;
}

function syncPicker(text: HTMLInputElement, picker: HTMLInputElement): void {
  const value = text.value.trim();
  if (/^#[\da-f]{6}$/i.test(value)) picker.value = value;
  else if (/^#[\da-f]{3}$/i.test(value))
    picker.value = `#${value.slice(1).replace(/./g, (char) => char + char)}`;
}

function generate(): void {
  try {
    const primary = required("primary", "input").value.trim();
    const secondary = required("secondary", "input").value.trim();
    const neutral = required("neutral", "input").value.trim();
    const seeds: Seeds = {
      primary,
      ...(secondary ? { secondary } : {}),
      ...(neutral ? { neutral } : {}),
    };
    const next = createColorScheme(seeds);
    required("modes", "div").replaceChildren(renderMode(next, "light"), renderMode(next, "dark"));
    required("used-seeds", "ul").replaceChildren(...renderSeeds(next));
    required("algorithm", "p").textContent =
      `Algorithm ${next.meta.algorithmVersion} · Seeds used below include any derived colors.`;
    for (const field of fields) {
      syncPicker(field.text, field.picker);
      if (field.text.value.trim() === "") field.picker.value = next.seeds[field.name].hex;
    }
    scheme = next;
    errorMessage.hidden = true;
    output.hidden = false;
  } catch (error) {
    showError(error);
  }
}

function manualChange(): void {
  extraction?.abort();
  extraction = null;
  status.textContent = "Manual seeds. Optional seeds left empty are derived from primary.";
  extracted.replaceChildren();
  generate();
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  manualChange();
});
for (const field of fields) {
  field.text.addEventListener("change", manualChange);
  field.picker.addEventListener("input", () => {
    field.text.value = field.picker.value;
    manualChange();
  });
}

async function loadCover(file: File): Promise<void> {
  extraction?.abort();
  const controller = new AbortController();
  extraction = controller;
  status.textContent = `Extracting ${file.name} in perceptual mode…`;
  errorMessage.hidden = true;
  extracted.replaceChildren();
  output.hidden = true;
  scheme = null;
  try {
    const result = await extractColors(file, { mode: "perceptual", signal: controller.signal });
    if (controller.signal.aborted) return;
    const seeds = seedsFromColorExtractor(result);
    for (const field of fields) field.text.value = seeds[field.name] ?? "";
    for (const color of result.colors) {
      const item = element("li", "extracted-color");
      item.append(
        colorChip(color.hex),
        element("code", "", color.hex),
        element("span", "muted", `${(color.coverage * 100).toFixed(2)}% coverage`),
      );
      extracted.append(item);
    }
    status.textContent = `${file.name} · ${result.colors.length} colors in perceptual order · Seeds selected by seedsFromColorExtractor.`;
    generate();
  } catch (error) {
    if (controller.signal.aborted) return;
    status.textContent = `Could not use ${file.name}. Choose another cover or enter seeds.`;
    showError(error);
  } finally {
    if (extraction === controller) extraction = null;
  }
}

cover.addEventListener("change", () => {
  const file = cover.files?.[0];
  if (file) void loadCover(file);
  cover.value = "";
});
for (const name of ["dragenter", "dragover"] as const)
  dropZone.addEventListener(name, (event) => {
    event.preventDefault();
    dropZone.classList.add("dragging");
  });
dropZone.addEventListener("dragleave", (event) => {
  if (!(event.relatedTarget instanceof Node) || !dropZone.contains(event.relatedTarget))
    dropZone.classList.remove("dragging");
});
dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("dragging");
  const file = event.dataTransfer?.files[0];
  if (file) void loadCover(file);
});

function download(mode: "light" | "dark"): void {
  if (scheme === null) return;
  try {
    const tokens = toDesignTokens(scheme);
    const url = URL.createObjectURL(
      new Blob([`${JSON.stringify(tokens[mode], null, 2)}\n`], { type: "application/json" }),
    );
    const link = element("a");
    link.href = url;
    link.download = `${mode}.tokens.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    showError(error);
  }
}
for (const mode of ["light", "dark"] as const)
  required(`download-${mode}`, "button").addEventListener("click", () => download(mode));
generate();
