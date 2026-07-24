// Image Studio — canvas + text-metric helpers. Pure and UI-agnostic.
//
// The live <span> text preview (em units) and the canvas bake (×fontPx) share
// these metrics so an overlay renders identically on screen and once flattened.
// The render views import the metric helpers; the commit path imports
// compositeOverlays / cropImage to flatten the working image to a PNG data URL.

// Text outline — an EXTERNAL stroke that never eats into the glyph. The stroke is
// always painted UNDER the fill (canvas: stroke then fill; screen: paint-order:
// stroke), so only its outer half shows. We therefore lay the stroke at 2× the
// target thickness (emStroke) so the visible outer band equals emVisible.
// outlineWidth 0–100 → em thickness (default 50 ≈ the old fixed 0.06em look).
export function outlineMetrics(width) {
  const t = Math.max(0, Math.min(100, width ?? 50)) / 100;
  const emVisible = 0.02 + t * 0.13; // 0.02em … 0.15em of visible outline
  return { emVisible, emStroke: emVisible * 2 };
}

// shadowIntensity 0–100 → { blurEm, offYEm, alpha }. Calibrated so the default
// (55) reproduces the previous baked shadow exactly: { blur .18em, offY .04em, α .55 }.
export function shadowMetrics(i) {
  const t = Math.max(0, Math.min(100, i ?? 0)) / 55;
  return { blurEm: 0.06 + t * 0.12, offYEm: 0.02 + t * 0.02, alpha: 0.2 + t * 0.35 };
}

// The primary family, quoted if multi-word (for document.fonts.load / canvas).
export function fontPrimary(family) {
  if (!family) return "Averta";
  return /\s/.test(family) ? `"${family}"` : family;
}

// Full family stack for CSS font-family / the canvas font shorthand — always keep
// the Averta + sans-serif fallback. null family → the app default (Averta).
export function cssFamily(family) {
  return family ? `${fontPrimary(family)}, Averta, sans-serif` : "Averta, sans-serif";
}

export function loadImg(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// Flatten the base image + all overlay elements (logos drawn, text painted with
// optional outline/shadow) into a PNG data URL at the image's intrinsic size.
export function compositeOverlays(baseUrl, overlays, w, h) {
  const logoUrls = [...new Set(overlays.filter((o) => o.kind === "logo").map((o) => o.url))];
  // Preload every (weight, family) a text overlay uses so the bake doesn't fall
  // back to a system font before toDataURL. document.fonts.load never rejects.
  const fontSpecs = [
    ...new Set(
      overlays.filter((o) => o.kind === "text").map((o) => `${o.bold ? 700 : 400} 32px ${fontPrimary(o.fontFamily)}`),
    ),
  ];
  const fontsReady = document?.fonts
    ? Promise.all(fontSpecs.map((s) => document.fonts.load(s).catch(() => {})))
    : Promise.resolve();
  return Promise.all([fontsReady, loadImg(baseUrl), ...logoUrls.map(loadImg)]).then(([, base, ...logos]) => {
    const logoMap = new Map(logoUrls.map((u, i) => [u, logos[i]]));
    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    const ctx = out.getContext("2d");
    ctx.drawImage(base, 0, 0, w, h);
    for (const o of overlays) {
      ctx.save();
      ctx.translate(o.xF * w, o.yF * h);
      ctx.rotate(o.rot || 0);
      if (o.kind === "logo") {
        const img = logoMap.get(o.url);
        const dw = o.wF * w;
        const ratio = img && img.naturalWidth ? img.naturalHeight / img.naturalWidth : 1;
        const dh = dw * ratio;
        if (img) ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
      } else {
        const fontPx = o.sizeF * h;
        const text = o.text || "";
        ctx.font = `${o.bold ? 700 : 400} ${fontPx}px ${cssFamily(o.fontFamily)}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        // Three passes, matching the live CSS: 1) drop shadow cast off the fill
        // glyph, 2) the coloured stroke, 3) the fill on top.
        if (o.shadow) {
          const sm = shadowMetrics(o.shadowIntensity);
          ctx.save();
          ctx.shadowColor = `rgba(0,0,0,${sm.alpha})`;
          ctx.shadowBlur = sm.blurEm * fontPx;
          ctx.shadowOffsetY = sm.offYEm * fontPx;
          ctx.fillStyle = o.color || "#FFFFFF";
          ctx.fillText(text, 0, 0);
          ctx.restore();
        }
        if (o.outline) {
          ctx.lineWidth = outlineMetrics(o.outlineWidth).emStroke * fontPx;
          ctx.lineJoin = "round";
          ctx.strokeStyle = o.outlineColor || "#0A1B33";
          ctx.strokeText(text, 0, 0);
        }
        ctx.fillStyle = o.color || "#FFFFFF";
        ctx.fillText(text, 0, 0);
      }
      ctx.restore();
    }
    return out.toDataURL("image/png");
  });
}

// Crop the working image to the selection rectangle — a genuine pixel crop via
// canvas (mirrors compositeOverlays), returning a PNG data URL + its dims.
export function cropImage(baseUrl, r) {
  return loadImg(baseUrl).then((img) => {
    const iw = img.naturalWidth || 1;
    const ih = img.naturalHeight || 1;
    const sx = Math.round(r.xF * iw);
    const sy = Math.round(r.yF * ih);
    const sw = Math.max(1, Math.round(r.wF * iw));
    const sh = Math.max(1, Math.round(r.hF * ih));
    const out = document.createElement("canvas");
    out.width = sw;
    out.height = sh;
    out.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    return { url: out.toDataURL("image/png"), w: sw, h: sh };
  });
}
