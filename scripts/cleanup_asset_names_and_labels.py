#!/usr/bin/env python3
from pathlib import Path
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"
STANDALONE = ROOT / "forge-of-empires-colony-planner-v0.97.html"
OLD_DIR = ROOT / "assets" / "generated"
NEW_DIR = ROOT / "assets" / "building-assets"

ERAS = ("SAM", "SAAB", "SAV", "SAJM", "SAT", "SASH")


def slug(value: str) -> str:
    value = re.sub(r"([a-z0-9])([A-Z])", r"\1-\2", value)
    value = value.replace("&", " and ")
    value = re.sub(r"[^A-Za-z0-9]+", "-", value).strip("-").lower()
    return value or "asset"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise RuntimeError(f"Could not find expected {label}")
    return text.replace(old, new, 1)


def patch_dimension_labels(text: str) -> str:
    old = '''// Building definitions use the game's canonical width × height order. The
// established planner layouts used the opposite board orientation, so retain
// that visual footprint separately while exposing correct w/h values.
for(const era of Object.keys(ERA_DATA)){
  for(const def of eraBuildingList(era)){
    const match=String(def.sizeText||"").match(/^(\\d+)×(\\d+)$/);
    if(!match)continue;

    def.w=Number(match[1]);
    def.h=Number(match[2]);
    def.boardW=def.h;
    def.boardH=def.w;
  }
}'''
    new = '''// Preserve the already-verified board footprints, but display dimensions in
// the same order a player sees them on the grid: top/horizontal edge ×
// side/vertical edge. This keeps labels consistent with the visible footprint.
for(const era of Object.keys(ERA_DATA)){
  for(const def of eraBuildingList(era)){
    const match=String(def.sizeText||"").match(/^(\\d+)×(\\d+)$/);
    if(!match)continue;

    def.w=Number(match[1]);
    def.h=Number(match[2]);
    def.boardW=def.h;
    def.boardH=def.w;
    def.sizeText=`${def.boardW}×${def.boardH}`;
  }
}'''
    text = replace_once(text, old, new, "dimension compatibility block")

    old = '''const SAT_HEATED_RESIDENCE=eraBuildingByKey("SAT","heatedResidence");
if(SAT_HEATED_RESIDENCE){
  // Confirmed correction: Heated Residence occupies 3 columns × 4 rows.
  SAT_HEATED_RESIDENCE.boardW=SAT_HEATED_RESIDENCE.w;
  SAT_HEATED_RESIDENCE.boardH=SAT_HEATED_RESIDENCE.h;
}'''
    new = '''const SAT_HEATED_RESIDENCE=eraBuildingByKey("SAT","heatedResidence");
if(SAT_HEATED_RESIDENCE){
  // Confirmed correction: Heated Residence occupies 3 columns × 4 rows.
  SAT_HEATED_RESIDENCE.boardW=SAT_HEATED_RESIDENCE.w;
  SAT_HEATED_RESIDENCE.boardH=SAT_HEATED_RESIDENCE.h;
  SAT_HEATED_RESIDENCE.sizeText=`${SAT_HEATED_RESIDENCE.boardW}×${SAT_HEATED_RESIDENCE.boardH}`;
}'''
    text = replace_once(text, old, new, "Heated Residence label sync")

    old = '''const SAV_INFLATABLE_HOME=eraBuildingByKey("SAV","inflatableHome");
if(SAV_INFLATABLE_HOME){
  // Corrected SAV layout: 3 tiles tall × 2 tiles wide, non-rotatable.
  SAV_INFLATABLE_HOME.boardW=2;
  SAV_INFLATABLE_HOME.boardH=3;
  SAV_INFLATABLE_HOME.sizeText="3×2";
}'''
    new = '''const SAV_INFLATABLE_HOME=eraBuildingByKey("SAV","inflatableHome");
if(SAV_INFLATABLE_HOME){
  // Verified SAV layout: 2 tiles wide × 3 tiles tall, non-rotatable.
  SAV_INFLATABLE_HOME.boardW=2;
  SAV_INFLATABLE_HOME.boardH=3;
  SAV_INFLATABLE_HOME.sizeText="2×3";
}'''
    text = replace_once(text, old, new, "Inflatable Home label")

    # Old legacy SAAB panel already uses the verified 3x2 board footprint, but
    # keep these explicit labels pinned so they cannot drift from the board.
    text = text.replace('<b>Deep-Seated Housing</b>2×3, needs road', '<b>Deep-Seated Housing</b>3×2, needs road')
    text = text.replace('id="deepBtn">Deep 2×3</button>', 'id="deepBtn">Deep 3×2</button>')

    text = text.replace(
        "SAAB Town Hall, Movable Abode, and credits sprites are embedded directly in this HTML.",
        "Planner artwork is loaded from the human-readable assets/building-assets folder.",
    )
    text = text.replace("Embedded SAAB sprite gallery", "SAAB sprite gallery")
    text = text.replace("own embedded sprite libraries", "own sprite libraries")
    return text


def extract_era_data(text: str):
    marker = "const ERA_DATA="
    start = text.index(marker) + len(marker)
    end = text.index(";\n\n// Building definitions", start)
    return json.loads(text[start:end])


def register(mapping, priorities, path, semantic, priority):
    if not path or "assets/generated/" not in path:
        return
    old_name = Path(path).name
    if priority > priorities.get(old_name, -1):
        mapping[old_name] = slug(semantic)
        priorities[old_name] = priority


def build_semantic_mapping(text: str):
    refs = sorted(set(re.findall(r"\./assets/generated/([A-Za-z0-9._-]+)", text)))
    mapping = {}
    priorities = {}

    data = extract_era_data(text)
    for era, era_data in data.items():
        hall = era_data.get("townHall") or {}
        register(mapping, priorities, hall.get("sprite"), f"{era} Town Hall", 100)
        path = era_data.get("path") or {}
        register(mapping, priorities, path.get("sprite"), f"{era} {path.get('name', 'Path')}", 100)
        for category in ("residential", "goods", "lifeSupport"):
            for item in era_data.get(category, []):
                register(mapping, priorities, item.get("sprite"), f"{era} {item.get('name', item.get('key', 'Building'))}", 100)

    # Named top-level icons and other constants.
    for const_name, path in re.findall(r'const\s+([A-Z][A-Z0-9_]*)\s*=\s*"(\./assets/generated/[^"]+)"', text):
        label = const_name.lower().replace("_icon", "").replace("_", " ")
        register(mapping, priorities, path, f"shared {label}", 90)

    # HTML alt text is a strong human-readable fallback.
    for tag in re.findall(r"<img\b[^>]*>", text, flags=re.I):
        src = re.search(r'src="(\./assets/generated/[^"]+)"', tag)
        alt = re.search(r'alt="([^"]+)"', tag)
        if src and alt and alt.group(1).strip():
            register(mapping, priorities, src.group(1), alt.group(1), 80)

    # ERA_ASSETS contains some old reference/gallery art not used by ERA_DATA.
    block_match = re.search(r"const ERA_ASSETS=\{(.*?)\n\};\n\nconst COLONISTS_ICON", text, re.S)
    if block_match:
        block = block_match.group(1)
        era_matches = list(re.finditer(r"(?m)^\s{2}(SAM|SAAB|SAV|SAJM|SAT|SASH):\{", block))
        for idx, match in enumerate(era_matches):
            era = match.group(1)
            end = era_matches[idx + 1].start() if idx + 1 < len(era_matches) else len(block)
            section = block[match.end():end]
            for key, path in re.findall(r'([A-Za-z][A-Za-z0-9_]*)\s*:\s*"(\./assets/generated/[^"]+)"', section):
                register(mapping, priorities, path, f"{era} {key}", 50)

    missing = [name for name in refs if name not in mapping]
    if missing:
        raise RuntimeError("Could not identify these assets semantically: " + ", ".join(missing))

    used_targets = {}
    final = {}
    for old_name in refs:
        stem = mapping[old_name]
        ext = Path(old_name).suffix.lower()
        target = f"{stem}{ext}"
        if target in used_targets and used_targets[target] != old_name:
            n = 2
            while f"{stem}-alternate-{n}{ext}" in used_targets:
                n += 1
            target = f"{stem}-alternate-{n}{ext}"
        used_targets[target] = old_name
        final[old_name] = target
    return final


def rename_assets(index_text: str):
    if not OLD_DIR.exists():
        return index_text, {}

    mapping = build_semantic_mapping(index_text)
    NEW_DIR.mkdir(parents=True, exist_ok=True)

    actual = sorted(p.name for p in OLD_DIR.iterdir() if p.is_file())
    unmapped_files = [name for name in actual if name not in mapping]
    if unmapped_files:
        raise RuntimeError("Files exist in assets/generated but are not referenced/identified: " + ", ".join(unmapped_files))

    for old_name, new_name in mapping.items():
        src = OLD_DIR / old_name
        dst = NEW_DIR / new_name
        if not src.exists():
            continue
        if dst.exists():
            raise RuntimeError(f"Refusing to overwrite {dst}")
        subprocess.run(["git", "mv", str(src.relative_to(ROOT)), str(dst.relative_to(ROOT))], cwd=ROOT, check=True)
        index_text = index_text.replace(
            f"./assets/generated/{old_name}",
            f"./assets/building-assets/{new_name}",
        )

    return index_text, mapping


def verify_references(text: str):
    refs = sorted(set(re.findall(r"\./assets/building-assets/([A-Za-z0-9._-]+)", text)))
    missing = [name for name in refs if not (NEW_DIR / name).is_file()]
    if missing:
        raise RuntimeError("Missing renamed assets: " + ", ".join(missing))
    hashed = [name for name in refs if re.fullmatch(r"[0-9a-f]{16,}\.(?:png|webp|jpg|jpeg|gif)", name, re.I)]
    if hashed:
        raise RuntimeError("Hashed filenames remain: " + ", ".join(hashed))


def main():
    index_text = INDEX.read_text(encoding="utf-8")
    index_text = patch_dimension_labels(index_text)
    index_text, mapping = rename_assets(index_text)
    verify_references(index_text)
    INDEX.write_text(index_text, encoding="utf-8")

    if STANDALONE.exists():
        standalone = STANDALONE.read_text(encoding="utf-8")
        standalone = patch_dimension_labels(standalone)
        STANDALONE.write_text(standalone, encoding="utf-8")

    if NEW_DIR.exists():
        readme = NEW_DIR / "README.md"
        readme.write_text(
            "# Colony planner artwork\n\n"
            "These files are named by era and the building, road, resource, or UI asset they represent. "
            "The names are intentionally human-readable so repository contributors can tell what an image is without opening it.\n",
            encoding="utf-8",
        )

    print(f"Renamed {len(mapping)} asset files.")
    print("Dimension labels now follow the visible top-edge width × side-edge height without changing verified footprints.")


if __name__ == "__main__":
    main()
