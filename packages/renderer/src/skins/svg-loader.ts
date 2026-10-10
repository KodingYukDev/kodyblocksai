/**
 * Pemuat SVG costume: perbaikan string (setara fixup-svg-string scratch-svg-renderer), sanitasi
 * keamanan (kontrak §13: tanpa <script>, handler on*, href eksternal, @import), normalisasi
 * viewBox/width/height, gambar pixelated, dan injeksi font. Ditulis sendiri (tanpa DOMPurify).
 */

const SVG_NS = "http://www.w3.org/2000/svg";

/** Elemen yang tidak pernah boleh ada di costume. */
const FORBIDDEN_TAGS = new Set([
  "script", "foreignobject", "iframe", "object", "embed", "audio", "video", "canvas", "a", "animate",
  "set", "animatemotion", "animatetransform", "handler", "listener", "html", "body", "meta", "link",
]);

/** Perbaikan string mentah sebelum di-parse (perilaku sama dengan fixup-svg-string scratch-svg-renderer). */
export function fixupSvgString(input: string): string {
  let svg = input;
  const svgAttrs = svg.match(/<svg [^>]*>/);
  if (svgAttrs && svgAttrs[0].indexOf("xmlns=") === -1) {
    svg = svg.replace("<svg ", `<svg xmlns="${SVG_NS}" `);
  }
  if (svgAttrs && svgAttrs[0].indexOf("&ns_") !== -1 && svg.indexOf("<!DOCTYPE") === -1) {
    svg = svg.replace(svgAttrs[0], svgAttrs[0].replace(/&ns_[^;]+;/g, "http://ns.adobe.com/Extensibility/1.0/"));
  }
  if (svg.includes("data:img/png")) {
    svg = svg.replace(/(<image[^>]+?xlink:href=["'])data:img\/png/g, (_m, p1: string) => `${p1}data:image/png`);
  }
  svg = svg.replace(/(<[^>]+?xmlns:(?!xml=)[^ ]+=)"http:\/\/www.w3.org\/XML\/1998\/namespace"/g, (_m, p1: string) => `${p1}"http://dummy.namespace"`);
  svg = svg.replace(/<(\/?)\s*svg:/g, "<$1");
  svg = svg.replace(/<metadata>[\s\S]*<\/metadata>/, "<metadata></metadata>");
  svg = svg.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
  return svg;
}

/** href aman: fragmen lokal (#id) atau data URI gambar raster/SVG. */
export function isSafeHref(raw: string): boolean {
  const href = raw.replace(/\s/g, "").toLowerCase();
  if (href.startsWith("#")) return true;
  return /^data:image\/(png|jpe?g|gif|webp|bmp|svg\+xml)[;,]/.test(href);
}

/** Hapus @import dan url() eksternal dari CSS. */
export function sanitizeCss(css: string): string {
  return css
    .replace(/@import[^;]*;?/gi, "")
    .replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (whole, _q: string, target: string) => (isSafeHref(target) ? whole : "none"))
    .replace(/expression\s*\(/gi, "(")
    .replace(/javascript:/gi, "");
}

/** Sanitasi DOM SVG di tempat. */
export function sanitizeSvgElement(root: Element): void {
  const walk = (el: Element): void => {
    for (const child of Array.from(el.children)) {
      if (FORBIDDEN_TAGS.has(child.localName.toLowerCase())) {
        child.remove();
        continue;
      }
      walk(child);
    }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on")) {
        el.removeAttribute(attr.name);
      } else if (name === "href" || name.endsWith(":href")) {
        if (!isSafeHref(attr.value)) el.removeAttributeNode(attr);
      } else if (name === "style") {
        el.setAttribute(attr.name, sanitizeCss(attr.value));
      } else if (/javascript:/i.test(attr.value)) {
        el.removeAttributeNode(attr);
      }
    }
    if (el.localName === "style") el.textContent = sanitizeCss(el.textContent ?? "");
  };
  walk(root);
}

export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function parseViewBox(value: string | null | undefined): ViewBox | null {
  if (!value) return null;
  const parts = value.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  return { x: parts[0] as number, y: parts[1] as number, width: parts[2] as number, height: parts[3] as number };
}

/** Panjang atribut width/height (abaikan satuan px; persen dianggap tidak ada). */
function parseLength(value: string | null): number | null {
  if (!value || value.trim().endsWith("%")) return null;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

/** Ukuran via getBBox (butuh DOM nyata). Mengembalikan null bila tidak tersedia. */
function measureBBox(svg: Element): ViewBox | null {
  if (typeof document === "undefined" || !document.body) return null;
  const host = document.createElementNS(SVG_NS, "svg");
  host.setAttribute("style", "position:absolute;visibility:hidden;width:0;height:0");
  const clone = svg.cloneNode(true) as SVGGraphicsElement;
  host.appendChild(clone);
  document.body.appendChild(host);
  try {
    if (typeof clone.getBBox !== "function") return null;
    const b = clone.getBBox();
    let largest = 0;
    for (const el of [clone, ...Array.from(clone.querySelectorAll("*"))]) {
      if (el.getAttribute("stroke")) largest = Math.max(largest, 1);
      const sw = el.getAttribute("stroke-width");
      if (sw) largest = Math.max(largest, Number(sw) || 0);
    }
    const half = b.width === 0 || b.height === 0 ? 0 : largest / 2;
    return { x: b.x - half, y: b.y - half, width: b.width + half * 2, height: b.height + half * 2 };
  } catch {
    return null;
  } finally {
    host.remove();
  }
}

/** Nama font costume Scratch -> fallback generik (dipakai bila CSS font belum didaftarkan). */
const FONT_FALLBACKS: Record<string, string> = {
  "Sans Serif": "Helvetica, Arial, sans-serif",
  Serif: "Georgia, 'Times New Roman', serif",
  Handwriting: "'Comic Sans MS', cursive",
  Marker: "'Comic Sans MS', fantasy",
  Curly: "Georgia, cursive",
  Pixel: "'Courier New', monospace",
  Scratch: "Helvetica, Arial, sans-serif",
};

const fontFaces = new Map<string, string>();

/** Daftarkan CSS @font-face per nama font costume (mis. dari paket font milik app). */
export function registerSvgFonts(faces: Record<string, string>): void {
  for (const [name, css] of Object.entries(faces)) fontFaces.set(name, sanitizeCss(css));
}

export interface LoadedSvg {
  /** Teks SVG siap dirender sebagai <img>. */
  text: string;
  viewBox: ViewBox;
}

/**
 * Parse + sanitasi + normalisasi. Melempar Error bila bukan SVG. Tanpa DOMParser (Node), hanya
 * ukuran yang dihitung dari atribut (teks dikembalikan setelah perbaikan string).
 */
export function loadSvgString(svgText: string): LoadedSvg {
  const fixed = fixupSvgString(svgText);
  if (typeof DOMParser === "undefined" || typeof XMLSerializer === "undefined") {
    return { text: fixed, viewBox: measureFromText(fixed) };
  }
  const doc = new DOMParser().parseFromString(fixed, "text/xml");
  const svg = doc.documentElement;
  if (!svg || svg.localName !== "svg" || doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("Document does not appear to be SVG.");
  }
  sanitizeSvgElement(svg);

  for (const img of Array.from(svg.getElementsByTagName("image"))) {
    const pixelated = "image-rendering: optimizespeed; image-rendering: pixelated;";
    const style = img.getAttribute("style");
    img.setAttribute("style", style ? `${pixelated} ${style}` : pixelated);
  }

  let viewBox = parseViewBox(svg.getAttribute("viewBox"));
  if (!viewBox) {
    viewBox = measureBBox(svg) ?? {
      x: 0,
      y: 0,
      width: parseLength(svg.getAttribute("width")) ?? 0,
      height: parseLength(svg.getAttribute("height")) ?? 0,
    };
    svg.setAttribute("width", String(viewBox.width));
    svg.setAttribute("height", String(viewBox.height));
    svg.setAttribute("viewBox", `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
  } else if (!svg.getAttribute("width") || !svg.getAttribute("height")) {
    svg.setAttribute("width", String(viewBox.width));
    svg.setAttribute("height", String(viewBox.height));
  }

  const fontsNeeded = new Set<string>();
  for (const el of Array.from(svg.querySelectorAll("[font-family]"))) {
    const family = el.getAttribute("font-family") as string;
    fontsNeeded.add(family);
    const fallback = FONT_FALLBACKS[family];
    if (fallback && !fontFaces.has(family)) el.setAttribute("font-family", `${family}, ${fallback}`);
  }
  let text = new XMLSerializer().serializeToString(svg);
  const css = [...fontsNeeded].map((f) => fontFaces.get(f) ?? "").join("");
  if (css) text = text.replace(/<svg[^>]*>/, (m) => `${m}<defs><style>${css}</style></defs>`);
  return { text, viewBox };
}

/** Ukuran tanpa DOM: viewBox, lalu width/height. */
export function measureFromText(svgText: string): ViewBox {
  const tag = svgText.match(/<svg\b[^>]*>/i)?.[0] ?? "";
  const attr = (name: string): string | null => {
    const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(["'])(.*?)\\1`, "i"));
    return m ? (m[2] as string) : null;
  };
  const vb = parseViewBox(attr("viewBox"));
  if (vb) return vb;
  return { x: 0, y: 0, width: parseLength(attr("width")) ?? 0, height: parseLength(attr("height")) ?? 0 };
}
