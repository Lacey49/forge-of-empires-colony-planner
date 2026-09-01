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


cleanup.extract_era_data = extract_era_data
cleanup.main()
