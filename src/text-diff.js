// Word-level diff, for showing what a rewrite did to a piece of prose.
//
// The pillar's aggregated context is generated: a weekly run or a user edit
// replaces text nobody else holds a copy of, so the only way to trust the result
// is to see what moved. This is what "Show what changed" renders.
//
// WORD level, not character: a character diff on prose marks the inside of words
// and reads as corruption. Not sentence level either — a run that changes three
// words in a paragraph would mark the whole paragraph and say nothing.
//
// The algorithm is a plain LCS over whitespace-separated tokens. Quadratic in the
// token count, which is fine for a paragraph and would not be for a document;
// both sides here are capped by what a pillar's context can hold (a few hundred
// words). If that stops being true, this is the seam to swap for a real diff.
//
// Public API:
//   diffWords(before, after) → [{ type: "same" | "del" | "ins", text }]
//   renderDiff(before, after) → HTML string with <del> / <ins>

import { escapeHtml } from "./utils.js?v=21";

/** Split on whitespace, keeping the whitespace so the join is lossless. */
function tokenize(text) {
  return String(text || "")
    .split(/(\s+)/)
    .filter((t) => t.length > 0);
}

/**
 * Longest common subsequence table over two token lists.
 *
 * Returns the ops in reading order. Adjacent ops of the same type are merged by
 * the caller so the markup is one <del> per run rather than one per word.
 */
export function diffWords(before, after) {
  const a = tokenize(before);
  const b = tokenize(after);

  // Cheap outs — identical, or one side empty. Worth having: the common case on
  // this surface is "nothing changed yet", and it should not build a table.
  if (a.join("") === b.join("")) return a.length ? [{ type: "same", text: a.join("") }] : [];
  if (!a.length) return [{ type: "ins", text: b.join("") }];
  if (!b.length) return [{ type: "del", text: a.join("") }];

  const n = a.length;
  const m = b.length;
  // (n+1) × (m+1) of lengths. Uint16 is enough: both sides are prose, and a
  // context long enough to overflow it would have broken the reading measure
  // long before.
  const table = [];
  for (let i = 0; i <= n; i++) table.push(new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const ops = [];
  const push = (type, text) => {
    const last = ops[ops.length - 1];
    if (last && last.type === type) last.text += text;
    else ops.push({ type, text });
  };

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push("same", a[i]);
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      push("del", a[i]);
      i++;
    } else {
      push("ins", b[j]);
      j++;
    }
  }
  while (i < n) push("del", a[i++]);
  while (j < m) push("ins", b[j++]);
  return ops;
}

/**
 * The same diff as HTML. <del> and <ins> are the semantic elements for this —
 * a screen reader announces them as removed and inserted content, which a pair
 * of styled spans would not.
 *
 * Whitespace-only ops are emitted unwrapped: marking the space between two
 * changed words paints a coloured gap that belongs to neither.
 */
export function renderDiff(before, after) {
  return diffWords(before, after)
    .map((op) => {
      const text = escapeHtml(op.text);
      if (op.type === "same" || !op.text.trim()) return text;
      return op.type === "del" ? `<del>${text}</del>` : `<ins>${text}</ins>`;
    })
    .join("");
}

/** Does this pair have anything to show? Used to disable the toggle. */
export function hasDiff(before, after) {
  return String(before || "").trim() !== String(after || "").trim() && !!String(before || "").trim();
}
