type Child = Node | string | null | undefined | false;

/** Minimal hyperscript helper: h('div', 'class a b', child, child…) */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

export function kbd(text: string): HTMLElement {
  return h('kbd', '', text);
}
