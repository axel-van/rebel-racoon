// Subtitle-style catalog for the clip-draft quick picker (ratio → subtitles →
// accounts). Shared so the in-app picker (screens/session.js) and the handoff
// gallery render the exact same set. Values line up with the rich caption
// presets in clip-captions.js (karaoke, deep-diver, …) so a draft's stored
// subtitleStyle resolves to a real preset when the clip is later opened in the
// Video Clips editor. Each item carries a `preview` — trusted HTML that
// CSS-renders a "Make it Pop" mock in that style
// (styles/components/subtitle-style.css).

// Trusted preview HTML for one subtitle style (or the "none" ban glyph).
export function subPreview(value) {
  if (value === "none") {
    return `<span class="sub-preview sub-preview--none"><i class="ap-icon-ban" aria-hidden="true"></i></span>`;
  }
  return `<span class="sub-preview sub-preview--${value}"><span class="sub-preview__line">Make it <em>Pop</em></span></span>`;
}

export const CLIP_SUBTITLE_ITEMS = [
  { value: "none", label: "No subtitles", caption: "Clips without subtitles" },
  { value: "karaoke", label: "Karaoké", caption: "Each word pops as it's spoken" },
  { value: "deep-diver", label: "Deep Diver", caption: "Active word on a clean pill" },
  { value: "youshaei", label: "Youshaei", caption: "Bold centered, mint active word" },
  { value: "popline", label: "PopLine", caption: "Active word with a color underline" },
  { value: "mozi", label: "Mozi", caption: "Bold caps, keywords in color" },
  { value: "thinkmedia", label: "ThinkMedia", caption: "Italic caps, popping keywords" },
  { value: "beasty", label: "Beasty", caption: "Glowing bubble text, color keywords" },
  { value: "simple", label: "Simple", caption: "Clean bold caps, no effects" },
].map((it) => ({ ...it, preview: subPreview(it.value) }));

// Fast id → label lookup for echoing the picked style back into the chat.
export const CLIP_SUBTITLE_LABEL = Object.fromEntries(CLIP_SUBTITLE_ITEMS.map((it) => [it.value, it.label]));
