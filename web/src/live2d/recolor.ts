// In-browser, per-ELEMENT texture recoloring for the Live2D avatars (the
// "wardrobe"). Live2D bakes colors into the model PNGs with no color parameter,
// so to let users recolor individual elements (hair, top, collar, sleeves,
// skirt, tights…) live, we: load the ORIGINAL texture into a canvas, classify
// each pixel into an element by its color (HSL predicate), hue-shift the pixels
// of the elements the user changed to their chosen color (preserving shading),
// and hand the recolored canvas back as the texture source. Once per load.

export type ElementId =
  | 'hair'
  | 'top'        // main body garment
  | 'collar'     // Aria's collar
  | 'sleeves'    // Noah's cardigan/sleeves (teal-green)
  | 'skirt'      // Noah's white dress/skirt
  | 'tights';    // Noah's dark legwear

export interface ElementColors {
  /** Map of elementId → hex color. Only listed elements are recolored. */
  [element: string]: string | undefined;
}

export type RecolorProfile = 'izumi' | 'haru' | 'chitose';

// ── color helpers ──────────────────────────────────────────────────────────
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2; const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h *= 60;
  }
  return [h, s, l];
}
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h /= 360;
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [Math.round(hue(h + 1 / 3) * 255), Math.round(hue(h) * 255), Math.round(hue(h - 1 / 3) * 255)];
}

// ── element classification (per source palette) ──────────────────────────────
// Each returns the ElementId a pixel belongs to, or null (leave untouched: skin,
// white background, lace, ribbon, eyes…). Tuned to the sampled palettes.
function classifyIzumi(h: number, s: number, l: number): ElementId | null {
  if (l > 0.9) return null;            // near-white edges
  // Collar = navy (clearly blue, dark).
  if (h >= 215 && h <= 270 && s > 0.15 && l < 0.55) return 'collar';
  // Top = red/orange fabric.
  if ((h <= 30 || h >= 330) && s > 0.12 && l > 0.1 && l < 0.9) return 'top';
  return null;
}
function classifyHaru(h: number, s: number, l: number): ElementId | null {
  // Sleeves/cardigan = teal-green (H190-215).
  if (h >= 175 && h <= 220 && s > 0.12 && l > 0.12 && l < 0.7) return 'sleeves';
  // Tights / dark legwear = very dark, low saturation, cool.
  if (l < 0.3 && s < 0.35) return 'tights';
  // Skirt / dress = light, low-saturation fabric (but not pure-white bg).
  if (l >= 0.6 && l <= 0.92 && s < 0.2) return 'skirt';
  return null;
}
// Chitose (the male prospect): navy blazer → 'top'; red tie → 'collar' (accent).
// Skin (warm, low-sat), the white shirt (high L), and hair stay untouched so we
// only re-theme the suit to teal. Sampled hues: blazer ≈ 210-250, tie ≈ 350-20.
function classifyChitose(h: number, s: number, l: number): ElementId | null {
  if (l > 0.86) return null;                                  // white shirt / sheen
  if (h >= 195 && h <= 255 && s > 0.12 && l > 0.05 && l < 0.78) return 'top';   // blazer (blue)
  // Red tie → accent. Keep the hue window TIGHT around true red (≈350–15) and
  // require high saturation so warm SKIN tones (hue ~20–40, lower sat) are never
  // recolored — a teal-tinted face would look broken.
  if ((h <= 14 || h >= 345) && s > 0.42 && l > 0.12 && l < 0.62) return 'collar';
  return null;
}

/** Classify a hair pixel (hair lives on its own texture, so this is separate
 *  and broad: anything that isn't a protected cool hue or a near-white sheen). */
function isHairPixel(_profile: RecolorProfile, h: number, _s: number, l: number): boolean {
  if (l > 0.82) return false;
  return !(h > 90 && h < 250); // protect true green/cyan/blue; everything else = hair
}

/** Apply the chosen hair color to a pixel (very dark, tinted, keep strand spread). */
function applyHair(hsl: [number, number, number], pl: number): [number, number, number] {
  const nl = Math.max(0.015, Math.min(0.18, 0.015 + pl * 0.24));
  return hslToRgb(hsl[0], Math.min(1, 0.5 + hsl[1] * 0.5), nl);
}
/** Apply a fabric color: anchor the midtone to the target L, keep fold spread. */
function applyFabric(hsl: [number, number, number], pl: number): [number, number, number] {
  const SRC_MID = 0.5;
  let nl = hsl[2] + (pl - SRC_MID) * 0.42;
  nl = Math.max(0.04, Math.min(0.92, nl));
  return hslToRgb(hsl[0], hsl[1], nl);
}

/**
 * Recolor the given elements on one texture. `elements` lists which ElementIds
 * this texture can contain (so we only run the relevant classifier). `colors`
 * maps elementId → hex; only present entries are changed. Returns a canvas.
 */
export function recolorTexture(
  img: HTMLImageElement | HTMLCanvasElement,
  profile: RecolorProfile,
  elements: ElementId[],
  colors: ElementColors,
): HTMLCanvasElement {
  const w = (img as HTMLImageElement).naturalWidth || img.width;
  const h = (img as HTMLImageElement).naturalHeight || img.height;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);

  // Which elements on this texture actually have a chosen color?
  const active = elements.filter((e) => colors[e]);
  if (active.length === 0) return canvas;
  const targetHsl: Partial<Record<ElementId, [number, number, number]>> = {};
  for (const e of active) targetHsl[e] = rgbToHsl(...hexToRgb(colors[e]!));

  const wantsHair = active.includes('hair');
  const fabricEls = active.filter((e) => e !== 'hair');

  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 8) continue;
    const [ph, ps, pl] = rgbToHsl(d[i], d[i + 1], d[i + 2]);

    if (wantsHair && isHairPixel(profile, ph, ps, pl)) {
      const [r, g, b] = applyHair(targetHsl.hair!, pl);
      d[i] = r; d[i + 1] = g; d[i + 2] = b;
      continue;
    }
    if (fabricEls.length) {
      const el = profile === 'izumi' ? classifyIzumi(ph, ps, pl)
        : profile === 'chitose' ? classifyChitose(ph, ps, pl)
        : classifyHaru(ph, ps, pl);
      if (el && targetHsl[el]) {
        const [r, g, b] = applyFabric(targetHsl[el]!, pl);
        d[i] = r; d[i + 1] = g; d[i + 2] = b;
      }
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** Load an image URL → HTMLImageElement. */
export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}
