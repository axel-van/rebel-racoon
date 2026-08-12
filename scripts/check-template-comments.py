#!/usr/bin/env python3
"""Fail on a backtick or a dollar-brace inside an HTML comment.

Why this exists: the app renders through html`` tagged templates, and an HTML
comment written INSIDE one is still template source. A backtick there ends the
literal; a ${...} interpolates. Both produce a SyntaxError or a silently wrong
render, and the symptom is an empty #app with one console error pointing at a
line that looks like prose — so it costs more to diagnose than it should.

Run it before bumping cache versions:
    python3 scripts/check-template-comments.py
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COMMENT = re.compile(r"<!--.*?-->", re.S)

bad = []
for path in sorted(ROOT.glob("src/**/*.js")):
    text = path.read_text(encoding="utf-8")
    # Only files that actually use a tagged template can be bitten by this.
    if "html`" not in text and "raw`" not in text:
        continue
    for match in COMMENT.finditer(text):
        block = match.group(0)
        hits = [ch for ch in ("`", "${") if ch in block]
        if not hits:
            continue
        line = text[: match.start()].count("\n") + 1
        rel = path.relative_to(ROOT)
        bad.append(f"{rel}:{line}  contains {' and '.join(hits)}")

if bad:
    print("HTML comments inside tagged templates must not contain ` or ${ :\n")
    for row in bad:
        print("  " + row)
    print(f"\n{len(bad)} problem(s). Rewrite the comment without the character.")
    sys.exit(1)

print("template comments: OK")
