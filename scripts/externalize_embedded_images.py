#!/usr/bin/env python3
from pathlib import Path
import base64
import hashlib
import re

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"
ASSET_DIR = ROOT / "assets" / "generated"

PATTERN = re.compile(r"data:image/(png|webp);base64,([A-Za-z0-9+/=]+)")


def main():
    text = INDEX.read_text(encoding="utf-8")
    ASSET_DIR.mkdir(parents=True, exist_ok=True)

    created = {}

    def replace(match):
        ext = match.group(1).lower()
        raw = base64.b64decode(match.group(2))
        digest = hashlib.sha256(raw).hexdigest()[:20]
        name = f"{digest}.{ext}"
        path = ASSET_DIR / name
        if not path.exists():
            path.write_bytes(raw)
        created[name] = len(raw)
        return f"./assets/generated/{name}"

    updated, replacements = PATTERN.subn(replace, text)
    if not replacements:
        print("No embedded PNG/WebP data images found. Nothing to do.")
        return

    INDEX.write_text(updated, encoding="utf-8")

    remaining = len(PATTERN.findall(updated))
    if remaining:
        raise SystemExit(f"Image migration incomplete: {remaining} data images remain")

    total_bytes = sum(created.values())
    print(f"Replaced {replacements} embedded image references with {len(created)} cached files ({total_bytes} bytes).")
    print(f"index.html is now {INDEX.stat().st_size} bytes.")


if __name__ == "__main__":
    main()
