#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"
README = ROOT / "README.md"
OLD_STANDALONE = ROOT / "forge-of-empires-colony-planner-v0.96.1.html"
NEW_STANDALONE = ROOT / "forge-of-empires-colony-planner-v0.97.html"

META_KEYWORDS = "Forge of Empires, FoE, Forge of Empires Colony Planner, FoE Colony Planner, Forge of Empires Colony Optimizer, FoE Colony Optimizer, Forge of Empires planner, FoE planner, Forge of Empires optimizer, FoE optimizer, Forge of Empires tool, FoE tool, colony planner, colony optimizer, colony tool, colony layout, colony layout planner, colony layout optimizer, Space Age colony planner, Space Age planner, Space Age optimizer, Space Age tool, layout planner, layout optimizer, building planner, expansion planner, path planner, city builder planner, Forge of Empires Space Age, FoE Space Age, Space Age Mars, SAM, FoE SAM, Forge of Empires SAM, Space Age Mars colony, Space Age Mars planner, Space Age Asteroid Belt, SAAB, FoE SAAB, Forge of Empires SAAB, Space Age Asteroid Belt colony, Space Age Asteroid Belt planner, Space Age Venus, SAV, FoE SAV, Forge of Empires SAV, Space Age Venus colony, Space Age Venus planner, Space Age Jupiter Moon, SAJM, FoE SAJM, Forge of Empires SAJM, Space Age Jupiter Moon colony, Space Age Jupiter Moon planner, Space Age Titan, SAT, FoE SAT, Forge of Empires SAT, Space Age Titan colony, Space Age Titan planner, Space Age Space Hub, SASH, FoE SASH, Forge of Empires SASH, Space Age Space Hub colony, Space Age Space Hub planner"

JSON_KEYWORDS = [
    "Forge of Empires",
    "FoE",
    "Forge of Empires Colony Planner",
    "FoE Colony Planner",
    "Forge of Empires Colony Optimizer",
    "FoE Colony Optimizer",
    "Forge of Empires planner",
    "FoE planner",
    "Forge of Empires optimizer",
    "FoE optimizer",
    "Forge of Empires tool",
    "FoE tool",
    "colony planner",
    "colony optimizer",
    "colony tool",
    "colony layout",
    "colony layout planner",
    "colony layout optimizer",
    "Space Age colony planner",
    "Space Age planner",
    "Space Age optimizer",
    "Space Age tool",
    "layout planner",
    "layout optimizer",
    "building planner",
    "expansion planner",
    "path planner",
    "city builder planner",
    "Forge of Empires Space Age",
    "FoE Space Age",
    "Space Age Mars",
    "SAM",
    "FoE SAM",
    "Forge of Empires SAM",
    "Space Age Mars colony",
    "Space Age Mars planner",
    "Space Age Asteroid Belt",
    "SAAB",
    "FoE SAAB",
    "Forge of Empires SAAB",
    "Space Age Asteroid Belt colony",
    "Space Age Asteroid Belt planner",
    "Space Age Venus",
    "SAV",
    "FoE SAV",
    "Forge of Empires SAV",
    "Space Age Venus colony",
    "Space Age Venus planner",
    "Space Age Jupiter Moon",
    "SAJM",
    "FoE SAJM",
    "Forge of Empires SAJM",
    "Space Age Jupiter Moon colony",
    "Space Age Jupiter Moon planner",
    "Space Age Titan",
    "SAT",
    "FoE SAT",
    "Forge of Empires SAT",
    "Space Age Titan colony",
    "Space Age Titan planner",
    "Space Age Space Hub",
    "SASH",
    "FoE SASH",
    "Forge of Empires SASH",
    "Space Age Space Hub colony",
    "Space Age Space Hub planner",
]


def patch_html(text: str) -> str:
    # This set of changes is the v0.97 build, not a v0.96.x patch.
    text = text.replace("v0.96.1", "v0.97")

    # Restore the broad search/discovery keyword set that was intentionally
    # included by the project owner. Keep the stronger description added in
    # the audit pass.
    if '<meta name="keywords"' not in text:
        marker = re.search(r'(<meta name="description" content="[^"]*">)', text)
        if not marker:
            raise SystemExit("Could not find meta description")
        tag = f'  <meta name="keywords" content="{META_KEYWORDS}">'
        text = text[:marker.end()] + "\n" + tag + text[marker.end():]
    else:
        text = re.sub(
            r'<meta name="keywords" content="[^"]*">',
            f'<meta name="keywords" content="{META_KEYWORDS}">',
            text,
            count=1,
        )

    # Restore optimizer aliases as discovery aliases. The public-facing name
    # remains Forge of Empires Colony Planner.
    text = re.sub(
        r'"alternateName": \[\n\s*"FoE Colony Planner",\n(?:\s*"Forge of Empires Colony Optimizer",\n\s*"FoE Colony Optimizer",\n)?\s*"FoE Space Age Planner",\n\s*"Forge of Empires Space Age Planner"\n\s*\]',
        '"alternateName": [\n    "FoE Colony Planner",\n    "Forge of Empires Colony Optimizer",\n    "FoE Colony Optimizer",\n    "FoE Space Age Planner",\n    "Forge of Empires Space Age Planner"\n  ]',
        text,
        count=1,
    )

    # Restore the full structured-data keyword list.
    keyword_lines = ",\n".join(f'    "{item}"' for item in JSON_KEYWORDS)
    text = re.sub(
        r'  "keywords": \[\n.*?\n  \],\n  "about": \[',
        f'  "keywords": [\n{keyword_lines}\n  ],\n  "about": [',
        text,
        count=1,
        flags=re.S,
    )

    # User-facing terminology is Delete. Internal mode identifiers can remain
    # "erase" to avoid an unnecessary data/logic migration.
    text = text.replace(">Erase</button>", ">Delete</button>")
    text = text.replace("Erase a building or path", "Delete a building or path")
    text = text.replace("Erase is right click or Delete.", "Delete is right click or the Delete key.")
    text = text.replace("<span>Erase</span>", "<span>Delete</span>")
    text = text.replace('?"erase":"map panning"', '?"delete":"map panning"')

    return text


def patch_readme(text: str) -> str:
    text = text.replace("Website-v0.96.1-success", "Website-v0.97-success")
    text = text.replace("`v0.96.1`", "`v0.97`")
    return text


def main():
    index = patch_html(INDEX.read_text(encoding="utf-8"))
    INDEX.write_text(index, encoding="utf-8")

    if not OLD_STANDALONE.exists():
        raise SystemExit("Expected v0.96.1 standalone file is missing")
    standalone = patch_html(OLD_STANDALONE.read_text(encoding="utf-8"))
    NEW_STANDALONE.write_text(standalone, encoding="utf-8")
    OLD_STANDALONE.unlink()

    README.write_text(patch_readme(README.read_text(encoding="utf-8")), encoding="utf-8")

    # Guardrails for the exact corrections requested.
    assert "v0.96.1" not in INDEX.read_text(encoding="utf-8")
    assert "v0.96.1" not in NEW_STANDALONE.read_text(encoding="utf-8")
    assert "Website-v0.97-success" in README.read_text(encoding="utf-8")
    assert f'<meta name="keywords" content="{META_KEYWORDS}">' in INDEX.read_text(encoding="utf-8")
    assert "Forge of Empires Colony Optimizer" in INDEX.read_text(encoding="utf-8")
    assert ">Delete</button>" in INDEX.read_text(encoding="utf-8")
    assert ">Erase</button>" not in INDEX.read_text(encoding="utf-8")

    print("Applied v0.97 naming, Delete terminology, and restored search keywords.")


if __name__ == "__main__":
    main()
