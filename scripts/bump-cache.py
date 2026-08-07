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


def audit():
    """Every module PATH must be referenced at exactly one version.

    Keyed on the resolved path, never the basename: image-studio/ and
    image-studio-v2/ both ship index.js / context.js / edit-view.js /
    interactions.js, and those are different modules at different URLs whose
    versions are allowed to differ. A basename-keyed check calls that a conflict
    and "fixing" it churns four unrelated files.

    A genuine conflict — one path requested at two versions — means the browser
    loads the module twice, which for a store means two independent instances
    and state that silently diverges.
    """
    refs = {}
    for p in all_files():
        for m in re.finditer(r"([\w./-]+\.(?:js|css))\?v=(\d+)", p.read_text()):
            target = (p.parent / m.group(1)).resolve()
            refs.setdefault(target, set()).add(int(m.group(2)))
    bad = {str(k): sorted(v) for k, v in refs.items() if len(v) > 1}
    if bad:
        print("AUDIT FAILED — a module path is referenced at more than one version:")
        for path, versions in bad.items():
            print(f"  {path}: {versions}")
        return 1
    print("audit: OK — every module path is referenced at exactly one version")
    return 0


def main():
    args = sys.argv[1:]
    if args == ["--audit"]:
        sys.exit(audit())
    targets = [ROOT / a for a in args]
    if not targets:
        print("usage: bump-cache.py <changed-file> [<changed-file> ...]")
        print("       bump-cache.py --audit   (check only, no writes)")
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
    # Always audit after writing. A file that is both a direct importer of the
    # target AND a transitive one gets visited twice, which bumped its reference
    # one step further than everyone else's and split the module across two
    # versions — a silent two-instance bug for anything stateful.
    sys.exit(audit())


if __name__ == "__main__":
    main()
