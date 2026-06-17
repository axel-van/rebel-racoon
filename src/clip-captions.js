// Clip captions — auto-generated subtitle segments + style presets.
//
// Captions are NOT seeded in mocks.js — they're synthesized on demand from a
// clip's title + summary (the "auto-generated subtitles" narrative) by
// buildCaptions(). Once a clip has been edited + saved, its captions ride
// along on the clip object (captions / captionsOn / captionStyle).
//
// A caption SEGMENT is { id, start, end, text, emph } where `emph` is a list
// of [startChar, endChar] ranges into `text` marking emphasized words. The
// editor lets the user select words and toggle that emphasis; the chosen
// preset decides how emphasized words render on the video overlay.
//
// Presets are inspired by Opus Clip's caption library — readable, repurposing-
// oriented styles rather than heavy meme captions. Each preset is a CSS class
// (.vc-cap--<id>); see styles/components/video-clips-modal.css.

export const CAPTION_PRESETS = [
  { id: "clean", name: "Clean" },
  { id: "bold", name: "Bold" },
  { id: "boxed", name: "Boxed" },
  { id: "highlight", name: "Highlight" },
  { id: "outline", name: "Outline" },
  { id: "pop", name: "Pop" },
];

export const DEFAULT_PRESET = "clean";

const PRESET_IDS = new Set(CAPTION_PRESETS.map((p) => p.id));

export function presetClass(id) {
  return "vc-cap--" + (PRESET_IDS.has(id) ? id : DEFAULT_PRESET);
}

// Local escape — the modal builds caption markup via innerHTML, so we escape
// each text slice ourselves and only ever emit the fixed <mark> wrapper. Keeps
// this module independent of utils.js's version suffix.
function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

// Tokenise the clip's headline text into short on-screen caption lines and
// distribute them evenly across the clip's duration. Deterministic: same clip
// in → same captions out (no randomness, safe for resume/replays).
export function buildCaptions(clip) {
  if (!clip) return [];
  const clipStart = clip.start || 0;
  const dur = Math.max(1, (clip.end || 0) - clipStart);
  const raw = [clip.title, clip.summary].filter(Boolean).join(" — ");
  const words = raw.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (!words.length) return [];

  const PER_LINE = 4;
  const lines = [];
  for (let i = 0; i < words.length; i += PER_LINE) lines.push(words.slice(i, i + PER_LINE));

  const segDur = dur / lines.length;
  return lines.map((ws, i) => {
    const text = ws.join(" ");
    const start = +(clipStart + i * segDur).toFixed(2);
    const end = +(clipStart + (i + 1) * segDur).toFixed(2);

    // Seed emphasis on a punchy word every other line — a number or a long
    // word reads as the "key" word — so the feature is visible out of the box.
    const emph = [];
    if (i % 2 === 0) {
      const wi = ws.findIndex((w) => /\d/.test(w) || w.replace(/[^A-Za-z]/g, "").length >= 7);
      if (wi >= 0) {
        let c = 0;
        for (let k = 0; k < wi; k++) c += ws[k].length + 1;
        const w = ws[wi];
        const m = w.match(/[A-Za-z0-9'’-]+/);
        const lead = m ? w.indexOf(m[0]) : 0;
        const word = m ? m[0] : w;
        emph.push([c + lead, c + lead + word.length]);
      }
    }
    return { id: `${clip.id || "clip"}_cap_${i}`, start, end, text, emph };
  });
}

// Build the safe inner HTML for one segment: escaped text with emphasized
// ranges wrapped in <mark class="vc-cap-emph">. Sorted + clamped defensively.
export function captionInnerHTML(seg) {
  const text = (seg && seg.text) || "";
  const emph = ((seg && seg.emph) || [])
    .map((r) => [Math.max(0, Math.min(text.length, r[0])), Math.max(0, Math.min(text.length, r[1]))])
    .filter((r) => r[1] > r[0])
    .sort((a, b) => a[0] - b[0]);
  if (!emph.length) return esc(text);

  let out = "";
  let cur = 0;
  for (const [s, e] of emph) {
    if (s < cur) continue; // skip overlaps already covered
    if (s > cur) out += esc(text.slice(cur, s));
    out += `<mark class="vc-cap-emph">${esc(text.slice(s, e))}</mark>`;
    cur = e;
  }
  if (cur < text.length) out += esc(text.slice(cur));
  return out;
}

// Serialise an edited contenteditable back into { text, emph }. The DOM is the
// source of truth while editing: any descendant carrying .vc-cap-emph becomes
// an emphasis range. &nbsp; (inserted by contenteditable) is normalised back
// to a regular space.
export function readSegmentFromDOM(el) {
  let text = "";
  const emph = [];
  (function walk(node) {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) {
        text += child.nodeValue;
      } else if (child.nodeType === 1) {
        if (child.classList && child.classList.contains("vc-cap-emph")) {
          const s = text.length;
          walk(child);
          if (text.length > s) emph.push([s, text.length]);
        } else if (child.tagName === "BR") {
          text += " ";
        } else {
          walk(child);
        }
      }
    }
  })(el);

  text = text.replace(/ /g, " ");
  emph.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of emph) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return { text, emph: merged };
}

// Index of the segment covering time `t` (the playhead). Clamps to the first /
// last segment when the playhead sits before / after the caption track.
export function activeSegmentIndex(caps, t) {
  if (!caps || !caps.length) return -1;
  for (let i = 0; i < caps.length; i++) {
    if (t >= caps[i].start && t < caps[i].end) return i;
  }
  return t < caps[0].start ? 0 : caps.length - 1;
}

/* ════════════════════════════════════════════════════════════════════
 *  RICH CAPTION MODEL — ported from platform-studio's video-editor
 *  (src/web/captions/{model,renderer,chunker}.ts), adapted to vanilla JS
 *  for the full-screen caption editor. Sizing is a fixed DESIGN SPACE of
 *  1080×1920; the renderer scales to the preview. Karaoke animation and
 *  the ffmpeg render path are intentionally dropped (prototype) — emphasis
 *  is per-word marks + an optional static "phrase" highlight on the word
 *  under the playhead.
 * ════════════════════════════════════════════════════════════════════ */

export const DESIGN_WIDTH = 1080;
export const DESIGN_HEIGHT = 1920;

// Demo footage served from the project's /video folder — used as the real
// video behind every clip/caption preview. Assigned deterministically per clip
// so a given clip always shows the same source.
export const CLIP_VIDEOS = ["video/leeroy.mp4", "video/medium.mp4", "video/cats.mp4"];

export function videoForClip(clip) {
  const key = String((clip && clip.id) || "clip");
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return CLIP_VIDEOS[h % CLIP_VIDEOS.length];
}

// Manual per-word emphasis: h1/h2 = background-box highlight slots, "font"
// recolors the word text. Stored on each transcript word as `mark`.

// Preset catalog — the Opus Clip caption styles. Each `apply` is a partial
// CaptionState; every preset sets the full differentiating field set (incl.
// plate / plateColor / italic) so switching presets never leaves stale state.
const BASE_PRESET = {
  strokeColor: "#000000",
  strokeWidthPx: 0,
  shadow: true,
  highlight: "none",
  plate: false,
  plateColor: "",
  italic: false,
  uppercase: false,
};

export const PRESETS = [
  {
    id: "karaoke",
    label: "Karaoké",
    apply: {
      ...BASE_PRESET,
      fontFamily: "Montserrat, Roboto, sans-serif",
      fontWeight: 900,
      textColor: "#FFFFFF",
      uppercase: true,
      strokeWidthPx: 8,
      highlight: "phrase",
      highlightColor: "#27e36a",
    },
  },
  {
    id: "deep-diver",
    label: "Deep Diver",
    apply: {
      ...BASE_PRESET,
      fontFamily: "Roboto, sans-serif",
      fontWeight: 700,
      textColor: "#14161a",
      shadow: false,
      plate: true,
      plateColor: "#f3f4f6",
      highlightColor: "#9aa0aa",
    },
  },
  {
    id: "pod-p",
    label: "Pod P",
    apply: {
      ...BASE_PRESET,
      fontFamily: "Montserrat, Roboto, sans-serif",
      fontWeight: 800,
      textColor: "#ff3db5",
      uppercase: true,
      highlightColor: "#ff3db5",
    },
  },
  {
    id: "popline",
    label: "Popline",
    apply: {
      ...BASE_PRESET,
      fontFamily: "Montserrat, Roboto, sans-serif",
      fontWeight: 900,
      textColor: "#FFFFFF",
      uppercase: true,
      strokeWidthPx: 8,
      highlight: "phrase",
      highlightColor: "#7c4dff",
    },
  },
  {
    id: "seamless-bounce",
    label: "Seamless Bounce",
    apply: {
      ...BASE_PRESET,
      fontFamily: "Montserrat, Roboto, sans-serif",
      fontWeight: 800,
      textColor: "#FFFFFF",
      shadow: false,
      plate: true,
      plateColor: "#2ecc71",
      highlightColor: "#FFFFFF",
    },
  },
  {
    id: "beasty",
    label: "Beasty",
    apply: {
      ...BASE_PRESET,
      fontFamily: "Montserrat, Roboto, sans-serif",
      fontWeight: 900,
      textColor: "#FFFFFF",
      uppercase: true,
      strokeWidthPx: 9,
      highlight: "phrase",
      highlightColor: "#ffd400",
    },
  },
  {
    id: "youshaei",
    label: "Youshaei",
    apply: {
      ...BASE_PRESET,
      fontFamily: "Roboto, sans-serif",
      fontWeight: 800,
      textColor: "#aeb6c2",
      uppercase: true,
      highlight: "phrase",
      highlightColor: "#2ad6c8",
    },
  },
  {
    id: "mozi",
    label: "Mozi",
    apply: {
      ...BASE_PRESET,
      fontFamily: "Montserrat, Roboto, sans-serif",
      fontWeight: 900,
      textColor: "#FFFFFF",
      uppercase: true,
      strokeWidthPx: 8,
      highlight: "phrase",
      highlightColor: "#27e36a",
    },
  },
  {
    id: "glitch-infinite",
    label: "Glitch Infinite",
    apply: {
      ...BASE_PRESET,
      fontFamily: "Montserrat, Roboto, sans-serif",
      fontWeight: 800,
      textColor: "#ff7a1a",
      highlightColor: "#ff7a1a",
    },
  },
  {
    id: "baby-earthquake",
    label: "Baby Earthquake",
    apply: {
      ...BASE_PRESET,
      fontFamily: "Georgia, serif",
      fontWeight: 700,
      textColor: "#FFFFFF",
      highlight: "phrase",
      highlightColor: "#ff7a1a",
    },
  },
];

export function defaultCaptionState() {
  return {
    presetId: "karaoke",
    fontFamily: "Montserrat, Roboto, sans-serif",
    fontSizePx: 64,
    fontWeight: 900,
    textColor: "#FFFFFF",
    uppercase: true,
    strokeColor: "#000000",
    strokeWidthPx: 8,
    shadow: true,
    shadowColor: "#000000",
    shadowX: 2,
    shadowY: 2,
    shadowBlur: 4,
    highlightColor: "#27e36a",
    highlight1Color: "#b8e986",
    highlight2Color: "#f5d23a",
    manualFontColor: "#27e36a",
    highlight: "phrase",
    position: "auto",
    xFraction: 0.5,
    yFraction: 0.78,
    widthFraction: 0.84,
    maxLines: 2,
    wordsPerCue: 4,
    deadZones: "tiktok",
    plate: false,
    plateColor: "",
    italic: false,
  };
}

export function presetById(id) {
  return PRESETS.find((p) => p.id === id) || null;
}

// Strip punctuation for the ON-SCREEN caption text (keeps intra-word
// apostrophes/hyphens). Transcript editing keeps full punctuation.
export function stripCaptionPunctuation(text) {
  return String(text)
    .replace(/[.,!?;:"“”«»…()[\]{}*/\\—–]/g, " ")
    .replace(/(^|[^A-Za-z0-9])['’\-]+(?=[^A-Za-z0-9]|$)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

// Platform UI dead zones, as fractions of the output frame.
export const DEAD_ZONES = {
  tiktok: { top: 0.08, bottom: 0.18, right: 0.12 },
  reels: { top: 0.06, bottom: 0.2, right: 0.1 },
  shorts: { top: 0.05, bottom: 0.12, right: 0.08 },
};

export function resolveYFraction(state) {
  switch (state.position) {
    case "top":
      return 0.16;
    case "middle":
      return 0.5;
    case "bottom":
      return 0.82;
    case "custom":
      return state.yFraction;
    case "auto": {
      const zone = state.deadZones !== "none" ? DEAD_ZONES[state.deadZones] : null;
      return zone ? 1 - zone.bottom - 0.06 : 0.82;
    }
    default:
      return 0.82;
  }
}

export function resolveXFraction(state) {
  return state.position === "custom" ? state.xFraction : 0.5;
}

// ── Transcript generation (synthetic, deterministic) ─────────────────
// Builds a flowing word-level transcript from the clip's text with synthetic
// per-word timings (clip-relative, 0..duration). Seeds a couple of filler
// phrases + sentence pauses so the Speech-cleanup pass has something to find,
// and a couple of manual highlight marks so emphasis is visible out of the box.

const FILLER_INSERTS = [
  { after: 3, words: ["you", "know"] },
  { after: 11, words: ["kind", "of"] },
];

export function buildTranscript(clip) {
  if (!clip) return [];
  const dur = Math.max(6, (clip.end || 0) - (clip.start || 0));
  const sentences = [clip.title, clip.summary, clip.why].filter(Boolean);
  if (!sentences.length) return [];

  // Flatten into tokens, attaching a sentence-ending period to each sentence's
  // last word (so the chunker + pause detection see a boundary) rather than
  // emitting a standalone "." token that would clutter the transcript.
  const base = [];
  sentences.forEach((sent, si) => {
    const ws = sent.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
    ws.forEach((w, wi) => {
      let tok = w;
      if (wi === ws.length - 1 && si < sentences.length - 1 && !/[.!?]$/.test(tok)) tok += ".";
      base.push(tok);
    });
  });
  if (!base.length) return [];

  // Weave in filler phrases at fixed positions.
  const toks = [];
  base.forEach((t, i) => {
    toks.push(t);
    const ins = FILLER_INSERTS.find((f) => f.after === i);
    if (ins) ins.words.forEach((w) => toks.push(w));
  });

  const PAUSE = 0.55;
  const pauseCount = toks.filter((t, i) => i > 0 && /[.!?]$/.test(toks[i - 1] || "")).length;
  const charTotal = toks.reduce((s, t) => s + Math.max(2, t.replace(/[^A-Za-z0-9]/g, "").length), 0);
  const speakDur = Math.max(2, dur - pauseCount * PAUSE);
  const perChar = speakDur / charTotal;

  const words = [];
  let cursor = 0;
  toks.forEach((t, i) => {
    if (i > 0 && /[.!?]$/.test(toks[i - 1] || "")) cursor += PAUSE;
    const len = Math.max(2, t.replace(/[^A-Za-z0-9]/g, "").length);
    const start = +cursor.toFixed(2);
    cursor += Math.max(0.18, len * perChar);
    words.push({
      id: `${clip.id || "clip"}_w${i}`,
      text: t,
      start,
      end: +cursor.toFixed(2),
      mark: null,
      removed: false,
    });
  });

  // Seed a couple of emphasis marks on punchy words (number / long word).
  let marked = 0;
  for (const w of words) {
    if (marked >= 2) break;
    const clean = w.text.replace(/[^A-Za-z0-9]/g, "");
    if (/\d/.test(clean) || clean.length >= 8) {
      w.mark = marked === 0 ? "h1" : "font";
      marked++;
    }
  }
  return words;
}

// ── Cue chunking (ported from chunker.ts; canvas measureText line-fit) ──

const _measureCanvas = typeof document !== "undefined" ? document.createElement("canvas") : null;

function makeMeasurer(state) {
  const ctx = _measureCanvas && _measureCanvas.getContext("2d");
  if (ctx) ctx.font = `${state.fontWeight} ${state.fontSizePx}px ${state.fontFamily}`;
  const cache = new Map();
  return (text) => {
    const t = state.uppercase ? text.toUpperCase() : text;
    if (cache.has(t)) return cache.get(t);
    const w = ctx ? ctx.measureText(t).width : t.length * state.fontSizePx * 0.5;
    cache.set(t, w);
    return w;
  };
}

const READABILITY_TAIL_S = 0.1;
const SOFT_BREAK_RATIO = 0.7;

function terminalChar(s) {
  for (let i = s.length - 1; i >= 0; i--) {
    if (!"\"')]}”’»".includes(s[i])) return s[i];
  }
  return " ";
}

// Chunk the live (non-removed) transcript words into caption-sized cues that
// fit widthFraction × maxLines, recording per-line word-index breaks.
export function deriveCues(words, state) {
  const live = (words || []).filter((w) => !w.removed);
  if (!live.length) return [];

  const measure = makeMeasurer(state);
  const maxWidth = state.widthFraction * DESIGN_WIDTH;
  const maxLines = state.maxLines;
  const wordsPerCue = state.wordsPerCue > 0 ? state.wordsPerCue : Infinity;
  const spaceW = measure(" ");

  const out = [];
  let cueWords = [];
  let lineStarts = [0];
  let lineWidth = 0;

  const close = () => {
    if (!cueWords.length) return;
    const start = cueWords[0].start;
    const end = Math.max(start, cueWords[cueWords.length - 1].end + READABILITY_TAIL_S);
    out.push({ start, end, words: cueWords, lineStarts });
    cueWords = [];
    lineStarts = [0];
    lineWidth = 0;
  };

  for (const word of live) {
    const w = measure(word.text);
    const lineStartIsHere = lineStarts[lineStarts.length - 1] === cueWords.length;
    const fits = cueWords.length === 0 || lineStartIsHere ? true : lineWidth + spaceW + w <= maxWidth;
    if (!fits) {
      if (lineStarts.length >= maxLines) close();
      else lineStarts.push(cueWords.length);
      lineWidth = 0;
    }
    cueWords.push(word);
    lineWidth += (lineWidth > 0 ? spaceW : 0) + w;

    const last = terminalChar(word.text);
    const sentenceEnd = last === "." || last === "?" || last === "!";
    const clauseEnd = last === "," || last === ":" || last === ";" || last === "—";
    const fullness = (lineStarts.length - 1 + lineWidth / maxWidth) / maxLines;
    if (sentenceEnd || (clauseEnd && fullness >= SOFT_BREAK_RATIO) || cueWords.length >= wordsPerCue) {
      close();
    }
  }
  close();

  // Clamp adjacent tails so a cue's readability tail never overlaps the next.
  for (let i = 0; i < out.length - 1; i++) {
    if (out[i].end > out[i + 1].start && out[i + 1].start >= out[i].start) out[i].end = out[i + 1].start;
  }
  return out;
}

// ── Speech cleanup detection (ported from cleanup/detect.ts) ──────────

const FILLER_VOCAB = ["you know", "kind of", "sort of", "i mean", "um", "uh", "uhm", "erm", "hmm"];

function normWord(t) {
  return String(t)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// Returns filler instances: { startIdx, count, label, start, end }.
export function detectFillers(words) {
  const norm = words.map((w) => normWord(w.text));
  const phrases = FILLER_VOCAB.map((p) => p.split(" ").map(normWord));
  const out = [];
  let i = 0;
  while (i < words.length) {
    let matched = null;
    // longest phrase wins
    for (const ph of phrases.sort((a, b) => b.length - a.length)) {
      if (ph.every((tok, k) => norm[i + k] === tok)) {
        matched = ph;
        break;
      }
    }
    if (matched) {
      out.push({
        startIdx: i,
        count: matched.length,
        label: words
          .slice(i, i + matched.length)
          .map((w) => w.text)
          .join(" "),
        start: words[i].start,
        end: words[i + matched.length - 1].end,
      });
      i += matched.length;
    } else {
      i++;
    }
  }
  return out;
}

// Returns pause instances between consecutive words: { idx, start, end, dur }.
// `idx` is the index of the word AFTER the gap.
export function detectPauses(words, threshold = 0.4) {
  const out = [];
  for (let i = 1; i < words.length; i++) {
    const gap = words[i].start - words[i - 1].end;
    if (gap >= threshold) {
      out.push({ idx: i, start: words[i - 1].end, end: words[i].start, dur: +gap.toFixed(2) });
    }
  }
  return out;
}
