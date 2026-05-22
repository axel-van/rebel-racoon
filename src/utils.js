// Minimal DOM / template helpers. Intentionally tiny — all state is mock,
// all screens are render-on-navigate, so we don't need anything clever.

export function escapeHtml(value) {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function html(strings, ...values) {
  // Tiny tagged-template helper: interpolates values, escaping by default.
  // To skip escaping (for nested HTML fragments), wrap the value in raw(...).
  let out = "";
  for (let i = 0; i < strings.length; i += 1) {
    out += strings[i];
    if (i < values.length) {
      const v = values[i];
      if (v == null || v === false) continue;
      if (Array.isArray(v)) {
        out += v.join("");
      } else if (typeof v === "object" && v && v.__raw) {
        out += v.value;
      } else {
        out += escapeHtml(v);
      }
    }
  }
  return out;
}

export function raw(value) {
  return { __raw: true, value: value == null ? "" : String(value) };
}
