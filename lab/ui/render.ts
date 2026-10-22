import type { ColorScheme, ModeReport, Role, Roles } from "@/index.js";
import { colorChip, element } from "./dom.js";

const GROUPS: readonly { readonly name: string; readonly roles: readonly Role[] }[] = [
  {
    name: "Surfaces",
    roles: ["surface", "surfaceContainerLow", "surfaceContainer", "surfaceContainerHigh"],
  },
  {
    name: "Text and borders",
    roles: ["onSurface", "onSurfaceVariant", "outline", "outlineVariant"],
  },
  { name: "Inverse", roles: ["inverseSurface", "onInverseSurface"] },
  { name: "Primary", roles: ["primary", "onPrimary", "primaryContainer", "onPrimaryContainer"] },
  {
    name: "Secondary",
    roles: ["secondary", "onSecondary", "secondaryContainer", "onSecondaryContainer"],
  },
  { name: "Error", roles: ["error", "onError", "errorContainer", "onErrorContainer"] },
  { name: "Warning", roles: ["warning", "onWarning", "warningContainer", "onWarningContainer"] },
  { name: "Success", roles: ["success", "onSuccess", "successContainer", "onSuccessContainer"] },
  { name: "Info", roles: ["info", "onInfo", "infoContainer", "onInfoContainer"] },
];

function sample(roles: Roles): HTMLElement {
  const preview = element("div", "sample");
  // CSS variables belong to this lab preview, not to the package's token export.
  for (const [role, hex] of Object.entries(roles)) preview.style.setProperty(`--${role}`, hex);
  preview.append(
    element("p", "sample-kicker", "YOUR WORKSPACE"),
    element("h4", "", "A little room for ideas"),
    element(
      "p",
      "sample-body",
      "A surface for everyday work, with clear text and purposeful color.",
    ),
    element("p", "sample-variant", "Variant text adds a quieter layer of information."),
  );
  const surfaces = element("div", "sample-surfaces");
  for (const [className, label] of [
    ["low", "Low container"],
    ["base", "Container"],
    ["high", "High container"],
  ]) {
    surfaces.append(element("div", `sample-surface ${className}`, label));
  }
  preview.append(surfaces);
  const buttons = element("div", "sample-buttons");
  buttons.append(
    element("button", "sample-primary", "Primary action"),
    element("button", "sample-secondary", "Secondary action"),
  );
  for (const button of buttons.querySelectorAll("button")) button.type = "button";
  preview.append(buttons);
  const card = element("div", "sample-card");
  card.append(
    element("h5", "", "An idea worth keeping"),
    element("p", "", "Primary container and its on-color bring a highlight into the page."),
  );
  const secondary = element(
    "p",
    "sample-secondary-container",
    "Secondary container · another place for supporting content.",
  );
  preview.append(
    card,
    secondary,
    element(
      "div",
      "sample-snackbar",
      "Saved to your collection. Inverse surface + onInverseSurface.",
    ),
  );
  const statuses = element("div", "sample-statuses");
  for (const [name, label, message] of [
    ["error", "Error", "Something needs your attention."],
    ["warning", "Warning", "Check the details before continuing."],
    ["success", "Success", "Everything is ready to go."],
    ["info", "Info", "There is something new to explore."],
  ]) {
    const status = element("div", `sample-status ${name}`);
    status.append(element("strong", "status-label", label), element("span", "", message));
    statuses.append(status);
  }
  preview.append(statuses);
  return preview;
}

function swatches(roles: Roles): HTMLElement {
  const list = element("div", "role-groups");
  for (const group of GROUPS) {
    const section = element("section", "role-group");
    section.append(element("h4", "", group.name));
    const items = element("ul", "swatches");
    for (const role of group.roles) {
      const item = element("li", "swatch");
      const paint = element("div", "swatch-paint");
      paint.style.backgroundColor = roles[role];
      const label = element("div", "swatch-label");
      label.append(element("span", "role-name", role), element("code", "", roles[role]));
      item.append(paint, label);
      items.append(item);
    }
    section.append(items);
    list.append(section);
  }
  return list;
}

function table(headers: readonly string[], caption: string): HTMLTableElement {
  const result = element("table");
  result.append(element("caption", "", caption));
  const head = element("thead");
  const row = element("tr");
  for (const label of headers) {
    const cell = element("th", "", label);
    cell.scope = "col";
    row.append(cell);
  }
  head.append(row);
  result.append(head, element("tbody"));
  return result;
}

function reportView(report: ModeReport): HTMLElement {
  const details = element("details", "report");
  const passes = report.pairs.filter(
    (pair) =>
      pair.contrast >= pair.minContrast &&
      (pair.minLightnessDifference === null ||
        pair.lightnessDifference >= pair.minLightnessDifference),
  ).length;
  details.append(
    element("summary", "", `Accessibility report · ${passes}/${report.pairs.length} pairs pass`),
  );
  const content = element("div", "report-content");
  content.append(
    element(
      "p",
      "muted",
      "Contrast is WCAG 2.2. ΔL is the absolute Oklab lightness difference (0–1). Values below are rounded for display; pass marks use the full precision values. A dash means no lightness minimum.",
    ),
  );
  const pairs = table(
    ["Foreground / background", "Contrast", "Minimum", "ΔL", "Min ΔL", "Result"],
    "Guaranteed pairs",
  );
  for (const pair of report.pairs) {
    const pass =
      pair.contrast >= pair.minContrast &&
      (pair.minLightnessDifference === null ||
        pair.lightnessDifference >= pair.minLightnessDifference);
    const row = element("tr");
    const name = element("th", "pair-name", `${pair.foreground} / ${pair.background}`);
    name.scope = "row";
    row.append(name);
    for (const value of [
      `${pair.contrast.toFixed(3)}:1`,
      `${pair.minContrast}:1`,
      pair.lightnessDifference.toFixed(4),
      pair.minLightnessDifference?.toFixed(4) ?? "—",
    ])
      row.append(element("td", "", value));
    row.append(element("td", pass ? "pass" : "fail", pass ? "✓ Pass" : "✕ Fail"));
    pairs.tBodies[0]!.append(row);
  }
  const scroll = element("div", "table-scroll");
  scroll.tabIndex = 0;
  scroll.setAttribute("aria-label", "Guaranteed pairs, scroll horizontally for all measurements");
  scroll.append(pairs);
  content.append(scroll);
  const adjustments = table(["Seed", "Role", "exact", "lightnessShift"], "Given seed adjustments");
  for (const adjustment of report.adjustments) {
    const row = element("tr");
    for (const value of [
      adjustment.seed,
      adjustment.role,
      String(adjustment.exact),
      adjustment.lightnessShift.toFixed(6),
    ])
      row.append(element("td", "", value));
    adjustments.tBodies[0]!.append(row);
  }
  const adjustmentScroll = element("div", "table-scroll");
  adjustmentScroll.tabIndex = 0;
  adjustmentScroll.setAttribute("aria-label", "Given seed adjustments");
  adjustmentScroll.append(adjustments);
  content.append(
    adjustmentScroll,
    element(
      "p",
      "muted",
      "Only given seeds have adjustments. lightnessShift is signed; exact also accounts for chroma changes.",
    ),
  );
  details.append(content);
  return details;
}

export function renderMode(scheme: ColorScheme, mode: "light" | "dark"): HTMLElement {
  const section = element("section", "mode panel");
  section.setAttribute("aria-label", `${mode === "light" ? "Light" : "Dark"} scheme`);
  const heading = element("div", "mode-heading");
  heading.append(
    element("h3", "", mode === "light" ? "Light mode" : "Dark mode"),
    element("span", "muted", "34 roles"),
  );
  section.append(
    heading,
    sample(scheme[mode]),
    reportView(scheme.report[mode]),
    element("h3", "roles-heading", "Role palette"),
    swatches(scheme[mode]),
  );
  return section;
}

export function renderSeeds(scheme: ColorScheme): HTMLLIElement[] {
  return Object.entries(scheme.seeds).map(([name, seed]) => {
    const item = element("li", "used-seed");
    item.append(
      colorChip(seed.hex),
      element("span", "", name),
      element("code", "", seed.hex),
      element("span", "muted", seed.source),
    );
    return item;
  });
}
