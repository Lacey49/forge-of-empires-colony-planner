from pathlib import Path
import re

FILES = [Path('index.html'), Path('forge-of-empires-colony-planner-v0.97.html')]

OLD_BUILDINGS = 'const SAJM_AQUA_CABIN_PRESET_BUILDINGS=[[4,8],[5,13],[5,17],[6,8],[7,13],[7,17],[8,8],[9,13],[9,17],[10,8],[11,13],[11,17],[12,8],[12,21],[13,13],[13,17],[14,8],[14,21],[15,13],[15,17],[16,8],[16,21],[17,13],[17,17],[18,8],[18,21],[20,8],[20,12],[20,21],[22,8],[22,12],[22,21],[24,8],[24,13],[24,17],[24,21],[26,8],[26,13],[26,17],[26,21]];'
NEW_BUILDINGS = 'const SAJM_AQUA_CABIN_PRESET_BUILDINGS=[[4,8],[4,17],[5,13],[6,8],[6,17],[7,13],[8,8],[8,17],[9,13],[10,8],[10,17],[11,12],[12,8],[12,20],[13,12],[13,17],[14,8],[14,21],[15,12],[15,17],[16,8],[16,21],[17,14],[17,17],[18,8],[18,21],[20,8],[20,12],[20,20],[22,8],[22,12],[22,21],[24,8],[24,12],[24,17],[24,21],[26,8],[26,12],[26,17],[26,21]];'

OLD_PATHS = 'const SAJM_AQUA_CABIN_PRESET_PATHS=[[4,11],[4,16],[5,11],[5,16],[6,11],[6,16],[7,11],[7,16],[8,11],[8,16],[9,11],[9,16],[10,11],[10,16],[11,11],[11,16],[12,11],[12,16],[12,20],[13,11],[13,16],[13,20],[14,11],[14,16],[14,20],[15,11],[15,16],[15,20],[16,11],[16,16],[16,20],[17,11],[17,16],[17,20],[18,11],[18,16],[18,20],[19,11],[19,12],[19,13],[19,14],[19,20],[20,11],[20,20],[21,11],[21,20],[22,11],[22,20],[23,11],[23,20],[24,11],[24,16],[24,20],[25,11],[25,16],[25,20],[26,11],[26,16],[26,20],[27,11],[27,16],[27,20]];'
NEW_PATHS = 'const SAJM_AQUA_CABIN_PRESET_PATHS=[[4,11],[4,12],[4,13],[4,14],[4,15],[4,16],[5,11],[5,16],[6,11],[6,16],[7,11],[7,16],[8,11],[8,16],[9,11],[9,16],[10,11],[10,16],[11,11],[12,11],[13,11],[14,11],[14,20],[15,11],[15,20],[16,11],[16,20],[17,11],[17,20],[18,11],[18,20],[19,11],[19,12],[19,13],[19,14],[19,20],[20,11],[21,11],[22,11],[23,11],[23,20],[24,11],[24,16],[24,20],[25,11],[25,20],[26,11],[26,20]];\nconst SAJM_AQUA_CABIN_PRESET_PODS=[[11,15],[17,12],[25,15]];'

OLD_LOOP = '''    for(const [r,c] of SAJM_AQUA_CABIN_PRESET_BUILDINGS){
      addBuilding("aquaCabin",r,c);
    }
    return state;'''
NEW_LOOP = '''    for(const [r,c] of SAJM_AQUA_CABIN_PRESET_BUILDINGS){
      addBuilding("aquaCabin",r,c);
    }
    for(const [r,c] of SAJM_AQUA_CABIN_PRESET_PODS){
      addBuilding("aquaPod",r,c);
    }
    return state;'''

for path in FILES:
    text = path.read_text(encoding='utf-8')
    for old, new, label in (
        (OLD_BUILDINGS, NEW_BUILDINGS, 'cabin coordinates'),
        (OLD_PATHS, NEW_PATHS, 'road coordinates'),
        (OLD_LOOP, NEW_LOOP, 'preset builder'),
    ):
        if text.count(old) != 1:
            raise SystemExit(f'Expected exactly one {label} block in {path}, found {text.count(old)}')
        text = text.replace(old, new, 1)
    path.write_text(text, encoding='utf-8')

cabins=[[4,8],[4,17],[5,13],[6,8],[6,17],[7,13],[8,8],[8,17],[9,13],[10,8],[10,17],[11,12],[12,8],[12,20],[13,12],[13,17],[14,8],[14,21],[15,12],[15,17],[16,8],[16,21],[17,14],[17,17],[18,8],[18,21],[20,8],[20,12],[20,20],[22,8],[22,12],[22,21],[24,8],[24,12],[24,17],[24,21],[26,8],[26,12],[26,17],[26,21]]
pods=[[11,15],[17,12],[25,15]]
roads={(4,11),(4,12),(4,13),(4,14),(4,15),(4,16),(5,11),(5,16),(6,11),(6,16),(7,11),(7,16),(8,11),(8,16),(9,11),(9,16),(10,11),(10,16),(11,11),(12,11),(13,11),(14,11),(14,20),(15,11),(15,20),(16,11),(16,20),(17,11),(17,20),(18,11),(18,20),(19,11),(19,12),(19,13),(19,14),(19,20),(20,11),(21,11),(22,11),(23,11),(23,20),(24,11),(24,16),(24,20),(25,11),(25,20),(26,11),(26,20)}
hub=(19,15)
base_chunks={(1,2),(1,3),(1,4),(2,2),(2,3),(2,4),(3,2),(3,3),(3,4),(3,5),(4,2),(4,3),(4,4),(4,5),(5,2),(5,3),(5,4),(5,5),(6,2),(6,3),(6,4),(6,5)}
land={(br*4+dr,bc*4+dc) for br,bc in base_chunks for dr in range(4) for dc in range(4)}

def rect(r,c,w,h):
    return {(r+dr,c+dc) for dr in range(h) for dc in range(w)}

def neighbors(cell):
    r,c=cell
    return {(r-1,c),(r+1,c),(r,c-1),(r,c+1)}

occupied=set()
cabin_cells=[]
pod_cells=[]
for r,c in cabins:
    cells=rect(r,c,3,2)
    assert cells <= land and not (cells & occupied)
    occupied |= cells
    cabin_cells.append(cells)
for r,c in pods:
    cells=rect(r,c,2,2)
    assert cells <= land and not (cells & occupied)
    occupied |= cells
    pod_cells.append(cells)

hub_cells=rect(*hub,5,5)
assert hub_cells <= land and not (hub_cells & occupied)
occupied |= hub_cells
assert roads <= land and not (roads & occupied)
occupied |= roads

roots={cell for cell in roads if neighbors(cell) & hub_cells}
seen=set(roots)
queue=list(roots)
for cell in queue:
    for nxt in neighbors(cell):
        if nxt in roads and nxt not in seen:
            seen.add(nxt)
            queue.append(nxt)

assert len(cabins)==40
assert len(pods)==3
assert len(roads)==48
assert len(seen)==48
assert all(any(neighbors(cell) & seen for cell in cells) for cells in cabin_cells)
assert all(any(neighbors(cell) & seen for cell in cells) for cells in pod_cells)
assert len(land)-len(occupied)==27

for path in FILES:
    text=path.read_text(encoding='utf-8')
    assert 'const SAJM_AQUA_CABIN_PRESET_PODS=[[11,15],[17,12],[25,15]];' in text
    assert 'name:"Aqua Cabins (40)"' in text

text=Path('index.html').read_text(encoding='utf-8')
scripts=re.findall(r'<script(?:\s[^>]*)?>(.*?)</script>',text,flags=re.S|re.I)
app=[s for s in scripts if '"use strict"' in s]
assert app
Path('/tmp/foe.js').write_text(app[-1],encoding='utf-8')
print('Validated 40 cabins, 3 pods, 48 connected roads, 27 unused tiles.')
