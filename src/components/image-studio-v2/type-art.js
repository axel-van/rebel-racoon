// Image Studio — the three drawn previews of the Type row.
//
// One picture per IMAGE_TYPES entry, as a small inline SVG. They are not icons:
// they are 4:3 preview frames whose job is to show what the generated image will
// LOOK like — the same job the subtitle mocks (`clip-subtitles.js`) and session.js's
// faux video still already do. The DS ships nothing of the sort, so nothing here
// re-invents a DS glyph (`search_icons` has no "illustration" at all: `ap-icon-pen`
// is the edit verb everywhere in this app, `ap-icon-mask` is a theatre mask, and
// brush / palette / draw / pencil don't exist).
//
// ── Why SVG, when the six Style swatches next door are still CSS ─────────────
// They answer different questions, so they carry different pictures. A Style is a
// palette: flat bands of colour say it, and CSS says flat bands in three spans. A
// Type is a whole image: it needs curves, gradients, a blur and a grain, and the
// five-layer ceiling of `.isv2-art` (three spans plus ::before/::after) made every
// Type read as a geometry exercise — a circle and two bars for "Visual hook", a
// circle, a square and a triangle for "Illustration", which named the shapes rather
// than the deliverable. The scaling argument that picked CSS the first time doesn't
// survive contact: a `viewBox` is resolution-free by construction, and these drawings
// carry no hairline that would need `vector-effect`.
//
// ── What separates the three ─────────────────────────────────────────────────
// TREATMENT, not subject — that's what keeps them apart at 40px:
//   Visual hook  photographic. Depth of field, a backlit subject cropped by the
//                frame, and the hook itself: a headline written over the image.
//   Infographic  a data poster. Title, a callout figure, bars with the winner picked
//                out and the trend read over them.
//   Illustration flat vector. Hard edges, ink crest lines, no gradient anywhere.
//
// And a rule that came out of seeing them side by side: ONE warm disc in the row,
// and it belongs to Illustration. A sphere in the hook and a donut in the chart made
// three cards read as three sunsets — the shapes differed, the silhouette didn't. So
// the hook's light became a halo behind its subject and the donut became a callout
// block: circle, rectangle, and the one disc that is actually a sun.
//
// ── Colour ──────────────────────────────────────────────────────────────────
// Greys carry the composition; ONE warm accent carries the image — the brand's own
// orange (`--ref-color-orange-*`, the Archie mark's colour) on grey-150 navy, so the
// three previews are Agorapulse pictures. Not electric blue, which is this house's
// interactive colour — a blue shape inside an UNSELECTED card would fight the blue ring
// that means "picked". (A first pass used amber to keep the AI-action orange out of the
// frames; overruled — these are pictures, not controls.) Every value is a real DS
// token, and they live in CSS — the markup below carries geometry and class names
// only, so `validate_css` sees the tokens and a palette change lands without touching
// this file: the amber → orange swap touched zero paths here.
//
// Ids inside <defs> are namespaced per drawing (`ita-h-*`): two SVGs sharing a
// gradient id would silently swap fills.
import { escapeHtml } from "../../utils.js?v=1159";

const VISUAL_HOOK = `<svg class="isv2-option-art isv2-option-art--dark" viewBox="0 0 120 90" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="ita-h-sky" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" class="ta-stop-night"/><stop offset="1" class="ta-stop-dusk"/></linearGradient>
    <radialGradient id="ita-h-glow" cx=".5" cy=".5" r=".5"><stop offset="0" class="ta-stop-glow" stop-opacity=".95"/><stop offset=".45" class="ta-stop-glow" stop-opacity=".45"/><stop offset="1" class="ta-stop-glow" stop-opacity="0"/></radialGradient>
    <radialGradient id="ita-h-core" cx=".5" cy=".5" r=".5"><stop offset="0" class="ta-stop-white" stop-opacity=".55"/><stop offset=".4" class="ta-stop-glow" stop-opacity=".5"/><stop offset="1" class="ta-stop-glow" stop-opacity="0"/></radialGradient>
    <radialGradient id="ita-h-vignette" cx=".55" cy=".45" r=".75"><stop offset=".55" class="ta-stop-night" stop-opacity="0"/><stop offset="1" class="ta-stop-night" stop-opacity=".7"/></radialGradient>
    <filter id="ita-h-blur"><feGaussianBlur stdDeviation="4"/></filter>
    <filter id="ita-h-grain"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2"/><feColorMatrix type="saturate" values="0"/></filter>
  </defs>
  <rect width="120" height="90" fill="url(#ita-h-sky)"/>
  <!-- The light is BEHIND the subject: a wide halo and a hot core that hugs the head,
       never a disc in the sky. A warm disc here is what made all three cards read as
       the same sunset. -->
  <ellipse cx="92" cy="42" rx="40" ry="36" fill="url(#ita-h-glow)" opacity=".75"/>
  <ellipse cx="98" cy="38" rx="18" ry="20" fill="url(#ita-h-core)" opacity=".9"/>
  <!-- Depth of field: two soft discs and one sharp flare. -->
  <g filter="url(#ita-h-blur)">
    <circle cx="20" cy="16" r="11" class="ta-white" opacity=".12"/>
    <circle cx="44" cy="54" r="9" class="ta-accent-lo" opacity=".2"/>
  </g>
  <circle cx="106" cy="18" r="1.4" class="ta-white" opacity=".85"/>
  <!-- The rim light is the SAME silhouette drawn twice: warm underneath, ink on top
       shifted 2 units left. What shows is a sliver whose width follows the contour —
       thick on the cheek, thinning at the crown — which is what backlight does. -->
  <g class="ta-rim-fill">
    <path d="M60 90 C 62 68, 74 59, 87 59 C 100 59, 111 68, 113 90 Z"/>
    <rect x="81" y="50" width="12" height="12" rx="3"/>
    <ellipse cx="87" cy="41" rx="13" ry="15"/>
  </g>
  <g class="ta-ink" transform="translate(-2.2 .6)">
    <path d="M60 90 C 62 68, 74 59, 87 59 C 100 59, 111 68, 113 90 Z"/>
    <rect x="81" y="50" width="12" height="12" rx="3"/>
    <ellipse cx="87" cy="41" rx="13" ry="15"/>
  </g>
  <!-- The hook itself: a headline written over the image, and an accent rule under it. -->
  <rect x="10" y="52" width="52" height="11" rx="3" class="ta-white" opacity=".96"/>
  <rect x="10" y="67" width="34" height="7" rx="2.5" class="ta-white" opacity=".62"/>
  <rect x="10" y="79" width="18" height="4" rx="2" class="ta-accent"/>
  <rect width="120" height="90" fill="url(#ita-h-vignette)"/>
  <rect width="120" height="90" filter="url(#ita-h-grain)" opacity=".16" style="mix-blend-mode:overlay"/>
</svg>`;

const INFOGRAPHIC = `<svg class="isv2-option-art" viewBox="0 0 120 90" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="ita-i-paper" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="ta-stop-white"/><stop offset="1" class="ta-stop-paper"/></linearGradient>
    <linearGradient id="ita-i-bar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="ta-stop-accent-lo"/><stop offset="1" class="ta-stop-accent"/></linearGradient>
  </defs>
  <rect width="120" height="90" fill="url(#ita-i-paper)"/>
  <!-- Masthead: a kicker, the title, its deck. -->
  <rect x="12" y="8" width="10" height="2.5" rx="1.25" class="ta-accent"/>
  <rect x="12" y="13" width="44" height="6" rx="3" class="ta-ink-2"/>
  <rect x="12" y="24" width="30" height="4" rx="2" class="ta-soft"/>
  <!-- The headline figure as a callout block, with the arrow that gives it a direction.
       It was a donut, and a donut made a third warm circle in a row that already had
       two. -->
  <rect x="84" y="9" width="24" height="12" rx="2.5" class="ta-accent"/>
  <path d="M90 17.5 L98 12.5 M94.5 12.5 H98 V16" fill="none" class="ta-stroke-white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="84" y="25" width="16" height="4" rx="2" class="ta-soft"/>
  <!-- The chart: faint rules, bars with the winner picked out, and the trend read over
       them. Everything here is a rectangle, on purpose. -->
  <g class="ta-grid"><rect x="10" y="50" width="100" height="1"/><rect x="10" y="60" width="100" height="1"/><rect x="10" y="70" width="100" height="1"/></g>
  <rect x="12" y="66" width="12" height="12" rx="1.5" class="ta-pale"/>
  <rect x="30" y="58" width="12" height="20" rx="1.5" class="ta-pale"/>
  <rect x="48" y="50" width="12" height="28" rx="1.5" class="ta-soft"/>
  <rect x="66" y="54" width="12" height="24" rx="1.5" class="ta-pale"/>
  <rect x="84" y="42" width="12" height="36" rx="1.5" fill="url(#ita-i-bar)"/>
  <rect x="10" y="78" width="100" height="1" class="ta-soft"/>
  <polyline points="18,60 36,52 54,44 72,48 90,36" fill="none" class="ta-plot" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
  <g class="ta-ink-2"><rect x="16" y="58" width="4" height="4" rx="1"/><rect x="34" y="50" width="4" height="4" rx="1"/><rect x="52" y="42" width="4" height="4" rx="1"/><rect x="70" y="46" width="4" height="4" rx="1"/></g>
  <rect x="87.5" y="33.5" width="5" height="5" rx="1.2" class="ta-accent-hi"/>
  <!-- Legend. -->
  <rect x="12" y="83" width="3" height="3" rx=".8" class="ta-accent"/><rect x="18" y="83" width="14" height="3" rx="1.5" class="ta-pale"/>
  <rect x="38" y="83" width="3" height="3" rx=".8" class="ta-soft"/><rect x="44" y="83" width="10" height="3" rx="1.5" class="ta-pale"/>
</svg>`;

const ILLUSTRATION = `<svg class="isv2-option-art" viewBox="0 0 120 90" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
  <rect width="120" height="90" class="ta-sky"/>
  <!-- The one warm disc in the row, with a flat halo ring — no gradient anywhere here. -->
  <circle cx="86" cy="28" r="17" fill="none" class="ta-halo" stroke-width="2"/>
  <circle cx="86" cy="28" r="13" class="ta-accent-md"/>
  <g class="ta-white"><circle cx="26" cy="24" r="7"/><circle cx="35" cy="21" r="9"/><circle cx="45" cy="25" r="6"/><rect x="26" y="24" width="19" height="7" rx="3.5"/></g>
  <g class="ta-white"><circle cx="9" cy="42" r="3.5"/><circle cx="14" cy="41" r="4.5"/><rect x="9" y="42" width="10" height="4" rx="2"/></g>
  <g fill="none" class="ta-line" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M60 26 l3 -2.5 3 2.5"/><path d="M69 21 l2.4 -2 2.4 2"/></g>
  <!-- Each ground is drawn twice: the fill, then its crest as an OPEN stroked path.
       Stroking the filled shape would run the ink down the frame's own edges. -->
  <path d="M0 58 C 16 44, 32 46, 48 56 C 62 65, 76 54, 90 56 C 102 58, 110 52, 120 55 L120 90 L0 90 Z" class="ta-field"/>
  <path d="M0 58 C 16 44, 32 46, 48 56 C 62 65, 76 54, 90 56 C 102 58, 110 52, 120 55" fill="none" class="ta-line" stroke-width="2" stroke-linecap="round"/>
  <!-- Three trees, odd on purpose, each canopy with its lit side. -->
  <g class="ta-ink">
    <rect x="27.5" y="46" width="3" height="22" rx="1.5"/>
    <path d="M29 34 C 39 40, 40 56, 29 58 C 18 56, 19 40, 29 34 Z"/>
    <rect x="62.6" y="52" width="2.4" height="16" rx="1.2"/>
    <path d="M64 44 C 71 48, 71 58, 64 60 C 57 58, 57 48, 64 44 Z"/>
    <rect x="103.2" y="52" width="1.6" height="9" rx=".8"/>
    <path d="M104 47 C 108 49.5, 108 55.5, 104 57 C 100 55.5, 100 49.5, 104 47 Z"/>
  </g>
  <g class="ta-mid"><path d="M29 36 C 24 40, 23 50, 27 55 C 22 52, 21 42, 29 36 Z"/><path d="M64 45.5 C 60.5 48.5, 60 55, 63 58.5 C 59 56.5, 58.5 49.5, 64 45.5 Z"/></g>
  <!-- The near hill is two flat tones: a lit band along the crest over the shadow. -->
  <path d="M0 74 C 18 60, 34 65, 48 73 C 62 81, 78 69, 96 73 C 106 75, 113 71, 120 73 L120 90 L0 90 Z" class="ta-mid"/>
  <path d="M0 80 C 18 66, 34 71, 48 79 C 62 87, 78 75, 96 79 C 106 81, 113 77, 120 79 L120 90 L0 90 Z" class="ta-ink-2"/>
  <path d="M0 74 C 18 60, 34 65, 48 73 C 62 81, 78 69, 96 73 C 106 75, 113 71, 120 73" fill="none" class="ta-line" stroke-width="2" stroke-linecap="round"/>
</svg>`;

// Keyed off IMAGE_TYPES. A key with no drawing degrades to the empty frame rather
// than to nothing — same contract the `.isv2-art--{key}` family blocks keep for the
// Style swatches, except a missing key is a lookup miss here instead of a silently
// unmatched class.
const TYPE_ART = {
  "visual-hook": VISUAL_HOOK,
  infographic: INFOGRAPHIC,
  illustration: ILLUSTRATION,
};

export function typeArt(key) {
  return (
    TYPE_ART[key] || `<span class="isv2-art isv2-art--type isv2-art--${escapeHtml(key)}" aria-hidden="true"></span>`
  );
}
