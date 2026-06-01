#!/usr/bin/env python3
"""Transitive cache-bust for the ?v=N import-specifier scheme.

Given a set of changed module files, bump the ?v= query on every import that
references them, then treat each touched importer as itself changed (its
content moved, so its own importers must re-fetch it) and repeat to a
fixpoint — up to index.html, the root.

Usage: python3 scripts/bump-cache.py src/screens/session.js styles/chat.css
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# Files that can contain import specifiers we rewrite.
SCAN_GLOBS = ["index.html", "src/**/*.js", "styles/**/*.css"]


def all_files():
    seen = []
    for g in SCAN_GLOBS:
        for p in ROOT.glob(g):
            if p.is_file():
                seen.append(p)
    return seen


def bump_refs_to(target_name, files):
    """Bump ?v=N for every reference to `target_name` (basename). Returns the
    set of files whose content changed."""
    changed = set()
    # Match  .../<target_name>?v=<digits>
    pat = re.compile(re.escape(target_name) + r"\?v=(\d+)")
    for f in files:
        text = f.read_text()

        def repl(m):
            return f"{target_name}?v={int(m.group(1)) + 1}"

        new = pat.sub(repl, text)
        if new != text:
            f.write_text(new)
            changed.add(f)
    return changed


def main():
    targets = [ROOT / a for a in sys.argv[1:]]
    if not targets:
        print("usage: bump-cache.py <changed-file> [<changed-file> ...]")
        sys.exit(1)
    files = all_files()
    worklist = [t.name for t in targets]
    done = set()
    touched = set()
    while worklist:
        name = worklist.pop()
        if name in done:
            continue
        done.add(name)
        changed = bump_refs_to(name, files)
        for c in changed:
            touched.add(c)
            # The importer's own content moved → its importers must re-fetch it.
            if c.name != "index.html" and c.name not in done:
                worklist.append(c.name)
    for f in sorted(touched):
        print("bumped", f.relative_to(ROOT))


if __name__ == "__main__":
    main()
