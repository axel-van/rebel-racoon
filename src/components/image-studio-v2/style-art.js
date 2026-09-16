// Image Studio — the six drawn previews of the Style row.
//
// The sibling of type-art.js, same contract: one inline SVG per STYLE_PRESETS entry,
// geometry and class names only, every colour a DS token in image-studio-v2.css
// (`.ta-*` fills, `.ta-stop-*` gradient stops). A Style is an AESTHETIC, so the six
// share one skeleton — a hero object, two lines of text — and differ only in how it is
// rendered. That is what makes them read as one question with six answers rather than
// six unrelated pictures: the subject is held still so the treatment is the variable.
//
//   Tech Minimal    near-white, hairlines, a faint grid, air
//   Corporate       navy masthead over white, a title with its rule, a photo tile
//   3D Render       a glossy purple sphere with a contact shadow, on a lit floor
//   Bold Editorial  a hard diagonal, brand orange against navy, heavy type blocks
//   Photoreal       a photographic dusk: gradient sky, hazed ranges, grain
//   Hand-drawn      ink on paper, every stroke jittered by a displacement filter
//
// These replaced the CSS swatches (`git log -S "isv2-art--tech-minimal"`): flat bands
// of colour said the palette and nothing else, and next to the Type previews they
// looked like the placeholders they were. Their colours were sample hex values; these
// are all tokens, so the `validate_css` exemption that block carried is gone with it.
//
// Ids inside <defs> are namespaced per drawing (`isa-<style>-*`): two SVGs sharing a
// gradient id would silently swap fills.
import { escapeHtml } from "../../utils.js?v=1220";

const TECH_MINIMAL = `<svg class="isv2-option-art" viewBox="0 0 120 90" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="isa-tm-paper" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="ta-stop-white"/><stop offset="1" class="ta-stop-paper"/></linearGradient>
    <radialGradient id="isa-tm-tint" cx="1" cy="0" r="1"><stop offset="0" class="ta-stop-skyblue-lo" stop-opacity=".7"/><stop offset="1" class="ta-stop-skyblue-lo" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="120" height="90" fill="url(#isa-tm-paper)"/>
  <rect width="120" height="90" fill="url(#isa-tm-tint)"/>
  <!-- A faint grid: the engineer's paper under the design. -->
  <g class="ta-grid"><rect x="30" y="0" width=".8" height="90"/><rect x="60" y="0" width=".8" height="90"/><rect x="90" y="0" width=".8" height="90"/><rect x="0" y="30" width="120" height=".8"/><rect x="0" y="60" width="120" height=".8"/></g>
  <!-- The hero: one outlined rounded square, one solid dot. -->
  <rect x="68" y="24" width="34" height="34" rx="6" fill="none" class="ta-line-soft" stroke-width="1.1"/>
  <rect x="74" y="34" width="22" height=".9" class="ta-pale"/>
  <rect x="74" y="40" width="12" height=".9" class="ta-pale"/>
  <circle cx="95.5" cy="51.5" r="2.2" class="ta-ink-2"/>
  <!-- Type as hairlines. -->
  <rect x="16" y="34" width="38" height="1.6" rx=".8" class="ta-ink-2"/>
  <rect x="16" y="42" width="26" height="1.2" rx=".6" class="ta-soft"/>
  <rect x="16" y="66" width="88" height=".8" class="ta-pale"/>
  <rect x="16" y="72" width="14" height="1.2" rx=".6" class="ta-soft"/>
  <rect x="98" y="72" width="6" height="1.2" rx=".6" class="ta-soft"/>
</svg>`;

const CORPORATE = `<svg class="isv2-option-art isv2-option-art--dark" viewBox="0 0 120 90" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="isa-co-tile" x1="0" y1="0" x2="1" y2="1"><stop offset="0" class="ta-stop-pale"/><stop offset="1" class="ta-stop-soft"/></linearGradient>
  </defs>
  <rect width="120" height="90" class="ta-white"/>
  <!-- Masthead: navy, with a lighter diagonal so it is a surface and not a bar. -->
  <rect width="120" height="34" class="ta-ink"/>
  <polygon points="78,0 120,0 120,34 60,34" class="ta-ink-2" opacity=".55"/>
  <circle cx="14" cy="14" r="3.5" class="ta-accent"/>
  <rect x="20.5" y="12.4" width="16" height="3.2" rx="1.6" class="ta-white"/>
  <rect x="12" y="24" width="40" height="2.6" rx="1.3" class="ta-white" opacity=".45"/>
  <!-- Body: title, its rule, the deck, a photo tile. -->
  <rect x="12" y="46" width="46" height="6" rx="1.5" class="ta-ink-2"/>
  <rect x="12" y="56.5" width="14" height="2" rx="1" class="ta-accent"/>
  <rect x="12" y="64" width="40" height="3.4" rx="1.7" class="ta-soft"/>
  <rect x="12" y="71" width="30" height="3.4" rx="1.7" class="ta-pale"/>
  <rect x="72" y="44" width="36" height="32" rx="2" fill="url(#isa-co-tile)"/>
  <polygon points="72,76 90,58 108,76" class="ta-mid" opacity=".45"/>
  <circle cx="98" cy="54" r="3.5" class="ta-white" opacity=".85"/>
</svg>`;

const THREE_D = `<svg class="isv2-option-art" viewBox="0 0 120 90" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="isa-3d-room" x1="0" y1="0" x2="1" y2="1"><stop offset="0" class="ta-stop-purple-10"/><stop offset="1" class="ta-stop-purple-40"/></linearGradient>
    <linearGradient id="isa-3d-floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="ta-stop-purple-40" stop-opacity="0"/><stop offset="1" class="ta-stop-purple-60" stop-opacity=".8"/></linearGradient>
    <radialGradient id="isa-3d-ball" cx=".36" cy=".3" r=".78"><stop offset="0" class="ta-stop-white"/><stop offset=".18" class="ta-stop-purple-40"/><stop offset=".62" class="ta-stop-purple-100"/><stop offset="1" class="ta-stop-purple-150"/></radialGradient>
    <linearGradient id="isa-3d-pill" x1="0" y1="0" x2="1" y2="0"><stop offset="0" class="ta-stop-purple-60"/><stop offset=".45" class="ta-stop-purple-100"/><stop offset="1" class="ta-stop-purple-150"/></linearGradient>
    <filter id="isa-3d-blur"><feGaussianBlur stdDeviation="2.4"/></filter>
    <filter id="isa-3d-soft"><feGaussianBlur stdDeviation=".7"/></filter>
  </defs>
  <rect width="120" height="90" fill="url(#isa-3d-room)"/>
  <rect y="56" width="120" height="34" fill="url(#isa-3d-floor)"/>
  <!-- Contact shadows first, objects on top: what sells a render is the floor. -->
  <ellipse cx="72" cy="68" rx="25" ry="5" class="ta-purple-150" opacity=".4" filter="url(#isa-3d-blur)"/>
  <ellipse cx="26" cy="77" rx="9" ry="2.4" class="ta-purple-150" opacity=".35" filter="url(#isa-3d-blur)"/>
  <rect x="19" y="50" width="14" height="27" rx="7" fill="url(#isa-3d-pill)"/>
  <rect x="22" y="53" width="1.8" height="19" rx=".9" class="ta-white" opacity=".45" filter="url(#isa-3d-soft)"/>
  <circle cx="72" cy="42" r="24" fill="url(#isa-3d-ball)"/>
  <ellipse cx="62" cy="31" rx="5.5" ry="3.4" class="ta-white" opacity=".75" transform="rotate(-30 62 31)" filter="url(#isa-3d-soft)"/>
  <path d="M56 58 A 24 24 0 0 0 94 49" fill="none" class="ta-rim-purple" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>
</svg>`;

const BOLD_EDITORIAL = `<svg class="isv2-option-art isv2-option-art--dark" viewBox="0 0 120 90" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
  <rect width="120" height="90" class="ta-ink"/>
  <polygon points="0,0 60,0 44,90 0,90" class="ta-accent"/>
  <!-- The kicker sits on the orange, the headline breaks across the cut. -->
  <rect x="10" y="12" width="18" height="3" rx="1" class="ta-ink"/>
  <rect x="38" y="26" width="66" height="12" class="ta-white"/>
  <rect x="50" y="44" width="54" height="12" class="ta-white"/>
  <rect x="62" y="62" width="30" height="4" rx="1" class="ta-soft"/>
  <rect x="62" y="70" width="42" height="1" class="ta-white" opacity=".5"/>
</svg>`;

const PHOTOREAL = `<svg class="isv2-option-art" viewBox="0 0 120 90" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="isa-ph-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="ta-stop-skyblue-hi"/><stop offset=".55" class="ta-stop-skyblue-lo"/><stop offset="1" class="ta-stop-horizon"/></linearGradient>
    <radialGradient id="isa-ph-sun" cx=".5" cy=".5" r=".5"><stop offset="0" class="ta-stop-sun" stop-opacity=".95"/><stop offset=".5" class="ta-stop-sun" stop-opacity=".35"/><stop offset="1" class="ta-stop-sun" stop-opacity="0"/></radialGradient>
    <linearGradient id="isa-ph-ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="ta-stop-dusk"/><stop offset="1" class="ta-stop-night"/></linearGradient>
    <linearGradient id="isa-ph-mid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="ta-stop-ink-2"/><stop offset="1" class="ta-stop-night"/></linearGradient>
    <radialGradient id="isa-ph-vignette" cx=".5" cy=".5" r=".75"><stop offset=".6" class="ta-stop-night" stop-opacity="0"/><stop offset="1" class="ta-stop-night" stop-opacity=".45"/></radialGradient>
    <filter id="isa-ph-blur"><feGaussianBlur stdDeviation="1.2"/></filter>
    <filter id="isa-ph-grain"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2"/><feColorMatrix type="saturate" values="0"/></filter>
  </defs>
  <rect width="120" height="90" fill="url(#isa-ph-sky)"/>
  <circle cx="40" cy="38" r="22" fill="url(#isa-ph-sun)"/>
  <circle cx="40" cy="38" r="7.5" class="ta-sun" filter="url(#isa-ph-blur)"/>
  <!-- Atmospheric perspective: the far range is the palest, each nearer one darker. -->
  <path d="M0 60 C 6 56, 10 50, 16 49 C 22 48, 24 55, 30 54 C 38 52, 40 43, 47 44 C 52 45, 54 51, 60 52 C 66 53, 68 47, 74 47 C 80 47, 82 54, 90 53 C 96 52, 98 47, 104 48 C 110 49, 114 56, 120 57 L120 90 L0 90 Z" class="ta-mid" opacity=".5"/>
  <rect y="50" width="120" height="16" class="ta-sky-haze" opacity=".3" filter="url(#isa-ph-blur)"/>
  <path d="M0 70 C 8 66, 12 58, 20 57 C 26 56, 28 62, 34 62 C 42 62, 46 51, 54 52 C 60 53, 62 60, 68 60 C 76 60, 80 53, 88 54 C 94 55, 96 61, 104 60 C 110 59, 114 63, 120 63 L120 90 L0 90 Z" fill="url(#isa-ph-mid)" opacity=".92"/>
  <path d="M34 62 C 42 62, 46 51, 54 52 C 58 52.5, 60 56, 63 58" fill="none" class="ta-sunlit" stroke-width="1" stroke-linecap="round" opacity=".55"/>
  <path d="M0 80 C 20 72, 44 76, 62 70 C 82 64, 100 74, 120 70 L120 90 L0 90 Z" fill="url(#isa-ph-ground)"/>
  <rect width="120" height="90" fill="url(#isa-ph-vignette)"/>
  <rect width="120" height="90" filter="url(#isa-ph-grain)" opacity=".14" style="mix-blend-mode:overlay"/>
</svg>`;

const HAND_DRAWN = `<svg class="isv2-option-art" viewBox="0 0 120 90" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
  <defs>
    <!-- Every stroke goes through this: fractal noise pushes the path around by up to
         ~1.6 units, which is what a hand does that a pen tool doesn't. -->
    <filter id="isa-hd-wobble" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="2" seed="7" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="1.6" xChannelSelector="R" yChannelSelector="G"/></filter>
    <filter id="isa-hd-grain"><feTurbulence type="fractalNoise" baseFrequency=".7" numOctaves="2" seed="2"/><feColorMatrix type="saturate" values="0"/></filter>
  </defs>
  <rect width="120" height="90" class="ta-paper-warm"/>
  <rect width="120" height="90" filter="url(#isa-hd-grain)" opacity=".08" style="mix-blend-mode:multiply"/>
  <g fill="none" class="ta-line" stroke-linecap="round" stroke-linejoin="round" filter="url(#isa-hd-wobble)">
    <!-- Sun, drawn twice round the way a sketch is, rays in pencil. -->
    <path d="M92 16 c6 0 10 4 10 9 s-4 9 -10 9 s-10 -4 -10 -9 s5 -9 10 -9 c5 0 9 3 9.5 8" stroke-width="1.7"/>
    <g class="ta-pencil" stroke-width="1.1"><path d="M92 2.5 v5"/><path d="M104 9 l-3.5 3.5"/><path d="M107 25 h-4"/><path d="M80 9 l3.5 3.5"/><path d="M77 25 h4"/></g>
    <!-- Hills. -->
    <path d="M0 64 C 18 50, 36 54, 54 62 S 90 74, 120 60" stroke-width="2"/>
    <path d="M0 78 C 24 70, 50 80, 74 72 S 104 66, 120 74" stroke-width="1.7"/>
    <!-- A scribbled tree. -->
    <path d="M30 62 v-12" stroke-width="1.8"/>
    <path d="M24 52 c-5 -2 -6 -8 -2 -10 c-2 -5 4 -9 8 -6 c2 -5 10 -4 10 1 c5 0 7 6 3 9 c3 4 -2 8 -6 6 c-3 4 -9 3 -10 -1 c-3 2 -6 1 -3 1" stroke-width="1.7"/>
    <path d="M27 46 c2 -3 5 -3 7 -1" class="ta-pencil" stroke-width="1"/>
    <!-- Hatching on the near hill. -->
    <g class="ta-pencil" stroke-width=".9"><path d="M8 76 l-4 6"/><path d="M14 75 l-4 6"/><path d="M20 76 l-4 6"/><path d="M26 77 l-4 6"/></g>
    <!-- Two lines of handwriting. -->
    <path d="M58 30 q5 -3 10 0 t10 0 t10 0 t8 0" stroke-width="1.5"/>
    <path d="M58 38 q5 -2.5 10 0 t10 0 t6 0" class="ta-pencil" stroke-width="1.3"/>
  </g>
</svg>`;

// Keyed off STYLE_PRESETS. A key with no drawing degrades to the empty grey frame
// rather than to nothing — same contract as typeArt().
const STYLE_ART = {
  "tech-minimal": TECH_MINIMAL,
  corporate: CORPORATE,
  "3d-render": THREE_D,
  "bold-editorial": BOLD_EDITORIAL,
  photoreal: PHOTOREAL,
  "hand-drawn": HAND_DRAWN,
};

export function styleArt(key) {
  return (
    STYLE_ART[key] || `<span class="isv2-art isv2-art--look isv2-art--${escapeHtml(key)}" aria-hidden="true"></span>`
  );
}
