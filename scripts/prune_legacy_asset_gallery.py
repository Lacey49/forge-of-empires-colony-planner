#!/usr/bin/env python3
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"
ASSET_DIR = ROOT / "assets" / "building-assets"


def remove_balanced(text: str, marker: str, opener: str, closer: str, trailing="") -> str:
    start = text.find(marker)
    if start < 0:
        return text
    pos = text.find(opener, start + len(marker))
    if pos < 0:
        raise RuntimeError(f"Could not find opener for {marker}")
    depth = 0
    in_string = None
    escaped = False
    for i in range(pos, len(text)):
        ch = text[i]
        if in_string:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == in_string:
                in_string = None
            continue
        if ch in ('"', "'", '`'):
            in_string = ch
            continue
        if ch == opener:
            depth += 1
        elif ch == closer:
            depth -= 1
            if depth == 0:
                end = i + 1
                if trailing and text.startswith(trailing, end):
                    end += len(trailing)
                return text[:start] + text[end:]
    raise RuntimeError(f"Unbalanced block for {marker}")


def remove_function(text: str, name: str) -> str:
    marker = f"function {name}("
    start = text.find(marker)
    if start < 0:
        return text
    brace = text.find("{", start)
    if brace < 0:
        raise RuntimeError(f"Could not find function body for {name}")
    depth = 0
    in_string = None
    escaped = False
    for i in range(brace, len(text)):
        ch = text[i]
        if in_string:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == in_string:
                in_string = None
            continue
        if ch in ('"', "'", '`'):
            in_string = ch
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                end = i + 1
                while end < len(text) and text[end] in "\r\n":
                    end += 1
                return text[:start] + text[end:]
    raise RuntimeError(f"Unbalanced function {name}")


def remove_html_section(text: str, section_id: str) -> str:
    pattern = re.compile(rf'<section\b[^>]*\bid="{re.escape(section_id)}"[^>]*>', re.I)
    match = pattern.search(text)
    if not match:
        return text
    end = text.find("</section>", match.end())
    if end < 0:
        raise RuntimeError(f"Could not find closing section for {section_id}")
    end += len("</section>")
    while end < len(text) and text[end] in " \t\r\n":
        end += 1
    return text[:match.start()] + text[end:]


def patch_index(text: str) -> str:
    # ERA_ASSETS was an old development-only gallery/source library. The real
    # planner uses ERA_DATA. Removing it lets us delete duplicate and anonymous
    # reference images instead of keeping files called asset05/goods3/etc.
    start = text.find("const ERA_ASSETS={")
    if start >= 0:
        end_marker = "\n\nconst COLONISTS_ICON="
        end = text.find(end_marker, start)
        if end < 0:
            raise RuntimeError("Could not find end of ERA_ASSETS")
        text = text[:start] + "const COLONISTS_ICON=" + text[end + len(end_marker):]

    # Remove the old public-facing developer sprite/source section.
    text = remove_html_section(text, "spriteSourceSection")

    # Remove its data table and renderer.
    start = text.find("const SAAB_GALLERY_ASSETS=[")
    if start >= 0:
        end = text.find("];", start)
        if end < 0:
            raise RuntimeError("Could not find end of SAAB_GALLERY_ASSETS")
        end += 2
        while end < len(text) and text[end] in "\r\n":
            end += 1
        text = text[:start] + text[end:]

    text = remove_function(text, "renderSaabAssetGallery")
    text = re.sub(r'^\s*renderSaabAssetGallery\(\);\s*$', '', text, flags=re.M)
    return text


def prune_unreferenced_assets(index_text: str):
    referenced = set(re.findall(r'\./assets/building-assets/([A-Za-z0-9._-]+)', index_text))
    deleted = []
    for path in sorted(ASSET_DIR.iterdir()):
        if not path.is_file() or path.name == "README.md":
            continue
        if path.name not in referenced:
            subprocess.run(["git", "rm", str(path.relative_to(ROOT))], cwd=ROOT, check=True)
            deleted.append(path.name)
    return referenced, deleted


def main():
    text = INDEX.read_text(encoding="utf-8")
    patched = patch_index(text)
    INDEX.write_text(patched, encoding="utf-8")
    referenced, deleted = prune_unreferenced_assets(patched)

    vague = sorted(name for name in referenced if re.search(r'(?:^|-)asset\d+|goods\d+|residential\d+|lifesupport\d+', name))
    if vague:
        raise RuntimeError("Vague asset names still referenced: " + ", ".join(vague))

    print(f"Kept {len(referenced)} referenced human-readable image files.")
    print(f"Removed {len(deleted)} unused legacy/gallery image files.")


if __name__ == "__main__":
    main()
