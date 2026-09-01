#!/usr/bin/env python3
import json
import cleanup_asset_names_and_labels as cleanup


def extract_era_data(text: str):
    marker = "const ERA_DATA="
    start = text.index(marker) + len(marker)
    depth = 0
    in_string = False
    escaped = False

    for i in range(start, len(text)):
        ch = text[i]
        if in_string:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_string = False
            continue

        if ch == '"':
            in_string = True
        elif ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                return json.loads(text[start:i + 1])

    raise RuntimeError("Could not find end of ERA_DATA")


original_build_semantic_mapping = cleanup.build_semantic_mapping


def build_semantic_mapping(text: str):
    # These two PNGs are the precise max-footprint preview images used for the
    # SAT and SASH expansion overlays. Add semantic aliases so the generic
    # migration logic can give them readable filenames too.
    semantic_aliases = '''
const SAT_PENDING_EXPANSION_PREVIEW="./assets/generated/1fa18b5adf3f9ef57cb4.png";
const SASH_PENDING_EXPANSION_PREVIEW="./assets/generated/1e4c1a96582dbf9543cb.png";
'''
    return original_build_semantic_mapping(text + semantic_aliases)


cleanup.extract_era_data = extract_era_data
cleanup.build_semantic_mapping = build_semantic_mapping
cleanup.main()
