#!/usr/bin/env python3
"""Build the current planner into one self-contained HTML file."""
from __future__ import annotations

import base64
import mimetypes
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"
LOADER = ROOT / "assets/js/optimizer.js"
OUTPUT = ROOT / "forge-of-empires-colony-planner-v0.99.html"
VERSION = "0.99"


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def data_uri(path: Path) -> str:
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def inline_runtime_scripts(html: str) -> str:
    loader = read_text(LOADER)
    entries = re.findall(r"['\"](\./[^'\"]+\.js(?:\?[^'\"]*)?)['\"]", loader)
    scripts: list[str] = []
    seen: set[str] = set()
    for entry in entries:
        rel = entry[2:].split("?", 1)[0]
        if rel in seen:
            continue
        seen.add(rel)
        path = ROOT / rel
        if not path.is_file():
            raise FileNotFoundError(f"Loader references missing file: {rel}")
        code = read_text(path).replace("</script>", "<\\/script>")
        scripts.append(f"<script>\n{code}\n</script>")

    replacement = "\n".join(scripts)
    pattern = re.compile(
        r'<script\s+src=["\']\./assets/js/optimizer\.js(?:\?[^"\']*)?["\']\s*></script>',
        re.IGNORECASE,
    )
    html, count = pattern.subn(lambda _: replacement, html, count=1)
    if count != 1:
        raise RuntimeError("Could not find the optimizer loader script in index.html")
    return html


def inline_local_assets(html: str) -> str:
    # A manifest loaded from a data URL cannot resolve its own relative icon paths.
    html = re.sub(
        r'\s*<link\s+rel=["\']manifest["\'][^>]*>',
        "",
        html,
        flags=re.IGNORECASE,
    )

    asset_files = [p for p in (ROOT / "assets").rglob("*") if p.is_file()]
    root_files = [ROOT / "favicon.ico"] if (ROOT / "favicon.ico").is_file() else []

    for path in sorted(asset_files + root_files, key=lambda p: len(p.as_posix()), reverse=True):
        rel = path.relative_to(ROOT).as_posix()
        # JS source files are already inlined as scripts, not data URLs.
        if rel == "assets/js/optimizer.js":
            continue
        uri = data_uri(path)
        for prefix in ("./", ""):
            token = prefix + rel
            pattern = re.compile(re.escape(token) + r'(?:\?[^"\'\)\s<>]*)?')
            html = pattern.sub(lambda _: uri, html)
    return html


def main() -> None:
    html = read_text(INDEX)
    html = inline_runtime_scripts(html)
    html = inline_local_assets(html)

    # Release-only visible version text. Keep old CSS comment names harmless.
    html = html.replace(
        'title="Forge of Empires Colony Planner v0.98">v0.98</div>',
        f'title="Forge of Empires Colony Planner v{VERSION}">v{VERSION}</div>',
    )

    if "./assets/js/optimizer.js" in html:
        raise RuntimeError("Standalone still references the optimizer loader")
    if re.search(r'["\']\.?/?assets/', html):
        leftovers = sorted(set(re.findall(r'["\'](\.?/?assets/[^"\']+)', html)))[:10]
        raise RuntimeError(f"Standalone still has local asset references: {leftovers}")

    OUTPUT.write_text(html, encoding="utf-8")
    print(f"Built {OUTPUT.name} ({OUTPUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
