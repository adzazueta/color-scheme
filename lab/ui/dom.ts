/// <reference lib="dom" />

export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function required<K extends keyof HTMLElementTagNameMap>(
  id: string,
  tag: K,
): HTMLElementTagNameMap[K] {
  const node = document.getElementById(id);
  if (node?.localName !== tag) throw new Error(`Missing ${tag}#${id}.`);
  return node as HTMLElementTagNameMap[K];
}

export function colorChip(hex: string): HTMLElement {
  const chip = element("span", "color-chip");
  chip.style.backgroundColor = hex;
  chip.setAttribute("aria-hidden", "true");
  return chip;
}
