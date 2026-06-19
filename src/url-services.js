// Known link sources for the "paste a URL" surfaces. Maps a pasted URL's host
// to a service — its display name + logo, and (when the source is
// connector-backed) the connectors-store id plus how Archie names that doc.
//
// Shared by:
//   - add-source-modal.js  — live logo affix in the URL field, the "Also works
//                            with" hint, and the "connect this service first"
//                            prompt when a connector-backed link isn't connected.
//   - fill-document-modal.js — live logo affix in its URL field.
//
// Order matters: more specific hosts (docs.google) come before any catch-all.
// Hosts without a `connectorId` (e.g. YouTube — a public source) are always
// importable, so they never trigger the connect-first prompt.

export const URL_SERVICES = [
  {
    match: /docs\.google\.com/i,
    name: "Google Docs",
    logo: "assets/logos/gdocs.svg",
    connectorId: "gdocs",
    noun: "Google Doc",
  },
  {
    match: /drive\.google\.com/i,
    name: "Google Drive",
    logo: "assets/logos/gdrive.svg",
    connectorId: "gdrive",
    noun: "Drive file",
  },
  {
    match: /(notion\.so|notion\.site)/i,
    name: "Notion",
    logo: "assets/logos/notion.svg",
    connectorId: "notion",
    noun: "Notion page",
  },
  { match: /(youtube\.com|youtu\.be)/i, name: "YouTube", logo: "assets/logos/social/youtube.svg" },
  { match: /figma\.com/i, name: "Figma", logo: "assets/logos/figma.svg", connectorId: "figma", noun: "Figma file" },
  { match: /slite\.com/i, name: "Slite", logo: "assets/logos/slite.svg", connectorId: "slite", noun: "Slite document" },
  {
    match: /github\.com/i,
    name: "GitHub",
    logo: "assets/logos/github.svg",
    connectorId: "github",
    noun: "GitHub page",
  },
];

// Return the first matching service for a (possibly partial) URL string, or null.
export function detectUrlService(value) {
  if (!value) return null;
  const v = value.trim();
  return URL_SERVICES.find((s) => s.match.test(v)) || null;
}
