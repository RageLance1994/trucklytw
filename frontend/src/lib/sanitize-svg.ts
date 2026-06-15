/**
 * Sanitizza una stringa SVG da fonte esterna (SeepTrucker) prima di iniettarla nel DOM.
 * Rimuove tag pericolosi (script/foreignObject/iframe/...), attributi handler on*,
 * e URL javascript:. Evita XSS sul rendering dei grafici autista.
 */
const DANGEROUS_TAGS = new Set([
  "script",
  "foreignobject",
  "iframe",
  "object",
  "embed",
  "link",
  "style",
  "animate",
  "set",
]);

function stripNode(el: Element) {
  for (const child of Array.from(el.children)) {
    if (DANGEROUS_TAGS.has(child.tagName.toLowerCase())) {
      child.remove();
      continue;
    }
    for (const attr of Array.from(child.attributes)) {
      const name = attr.name.toLowerCase();
      const val = attr.value.replace(/\s+/g, "").toLowerCase();
      if (name.startsWith("on")) {
        child.removeAttribute(attr.name);
      } else if (
        (name === "href" || name === "xlink:href" || name === "src") &&
        (val.startsWith("javascript:") || val.startsWith("data:text/html"))
      ) {
        child.removeAttribute(attr.name);
      }
    }
    stripNode(child);
  }
}

export function sanitizeSvg(input: string | null | undefined): string {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) return "";

  // Fallback non-DOM (SSR): rimozione grezza
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return raw
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  }

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(raw, "image/svg+xml");
  } catch {
    return "";
  }
  if (doc.querySelector("parsererror")) return "";
  const svg = doc.querySelector("svg");
  if (!svg) return "";

  for (const attr of Array.from(svg.attributes)) {
    if (attr.name.toLowerCase().startsWith("on")) svg.removeAttribute(attr.name);
  }
  stripNode(svg);
  return svg.outerHTML;
}
