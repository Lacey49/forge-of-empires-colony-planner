#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"
README = ROOT / "README.md"
VERSIONED = ROOT / "forge-of-empires-colony-planner-v0.96.1.html"


def replace_once(text, old, new, label):
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f"Could not find expected {label}")
    return text.replace(old, new, 1)


def patch_index(text):
    text = re.sub(
        r'<meta name="description" content="[^"]*">',
        '<meta name="description" content="Free Forge of Empires colony planner for SAM, SAAB, SAV, SAJM, SAT and SASH. Plan buildings, paths, expansions and colony layouts online.">',
        text,
        count=1,
    )
    text = re.sub(r'\n\s*<meta name="keywords" content="[^"]*">', '', text, count=1)

    text = text.replace(
'''  "alternateName": [
    "FoE Colony Planner",
    "Forge of Empires Colony Optimizer",
    "FoE Colony Optimizer",
    "FoE Space Age Planner",
    "Forge of Empires Space Age Planner"
  ],''',
'''  "alternateName": [
    "FoE Colony Planner",
    "FoE Space Age Planner",
    "Forge of Empires Space Age Planner"
  ],''',
    )

    text = re.sub(
        r'  "keywords": \[\n.*?\n  \],\n  "about": \[',
'''  "keywords": [
    "Forge of Empires",
    "FoE",
    "Forge of Empires Colony Planner",
    "FoE Colony Planner",
    "Space Age colony planner",
    "colony layout planner",
    "Space Age Mars",
    "Space Age Asteroid Belt",
    "Space Age Venus",
    "Space Age Jupiter Moon",
    "Space Age Titan",
    "Space Age Space Hub"
  ],
  "about": [''',
        text,
        count=1,
        flags=re.S,
    )

    desc = "Free Forge of Empires colony planner for SAM, SAAB, SAV, SAJM, SAT and SASH. Plan buildings, paths, expansions and colony layouts online."
    text = re.sub(r'<meta property="og:description" content="[^"]*">', f'<meta property="og:description" content="{desc}">', text, count=1)
    text = re.sub(r'<meta name="twitter:description" content="[^"]*">', f'<meta name="twitter:description" content="{desc}">', text, count=1)
    text = re.sub(r'  "description": "[^"]*",\n  "applicationCategory"', f'  "description": "{desc}",\n  "applicationCategory"', text, count=1)

    text = text.replace("/* v0.96 controls */", "/* v0.96.1 controls */")
    text = text.replace('Forge of Empires Colony Planner v0.96">v0.96', 'Forge of Empires Colony Planner v0.96.1">v0.96.1')

    text = replace_once(
        text,
        '<button class="era-btn active" type="button" data-era="SAM" title="Space Age Mars">SAM</button>',
        '<button class="era-btn active" type="button" data-era="SAM" title="Space Age Mars" aria-current="page">SAM</button>',
        "SAM era button",
    )

    text = replace_once(
        text,
'''<div class="build-tabs" role="tablist" aria-label="Build category">
            <button type="button" class="build-tab active" data-build-category="residential">Residential</button>
            <button type="button" class="build-tab" data-build-category="goods">Goods</button>
            <button type="button" class="build-tab" data-build-category="paths">Paths</button>
            <button type="button" class="build-tab" data-build-category="lifeSupport">Life Support</button>
          </div>
          <div class="build-items" id="buildMenuItems"></div>''',
'''<div class="build-tabs" role="tablist" aria-label="Build category">
            <button id="buildTabResidential" type="button" class="build-tab active" data-build-category="residential" role="tab" aria-selected="true" aria-controls="buildMenuItems">Residential</button>
            <button id="buildTabGoods" type="button" class="build-tab" data-build-category="goods" role="tab" aria-selected="false" aria-controls="buildMenuItems" tabindex="-1">Goods</button>
            <button id="buildTabPaths" type="button" class="build-tab" data-build-category="paths" role="tab" aria-selected="false" aria-controls="buildMenuItems" tabindex="-1">Paths</button>
            <button id="buildTabLifeSupport" type="button" class="build-tab" data-build-category="lifeSupport" role="tab" aria-selected="false" aria-controls="buildMenuItems" tabindex="-1">Life Support</button>
          </div>
          <div class="build-items" id="buildMenuItems" role="tabpanel" aria-labelledby="buildTabResidential"></div>''',
        "build tabs",
    )

    text = replace_once(
        text,
'''<button class="compact-tool" id="compactMoveBtn" type="button" title="Move a building or path">Move</button>
    <button class="compact-tool" id="clearAllBtn" type="button">Clear All</button>''',
'''<button class="compact-tool" id="compactMoveBtn" type="button" title="Move a building or path" aria-pressed="false">Move</button>
    <button class="compact-tool" id="compactEraseBtn" type="button" title="Erase a building or path (Delete or right click)" aria-keyshortcuts="Delete" aria-pressed="false">Erase</button>
    <button class="compact-tool" id="clearAllBtn" type="button">Clear All</button>''',
        "topbar tools",
    )
    text = text.replace(
        "Move and Undo can be changed. Erase is right click. 1–9 and arrow keys are fixed.",
        "Move and Undo can be changed. Erase is right click or Delete. 1–9, Delete and arrow keys are fixed.",
    )
    text = text.replace(
        '<div class="hotkey-row"><span>Erase</span><span class="hotkey-fixed">Right click</span></div>',
        '<div class="hotkey-row"><span>Erase</span><span class="hotkey-fixed">Right click / Delete</span></div>',
    )

    responsive_css = r'''
/* v0.96.1 release hardening: viewport-safe layout.
   Keep the desktop split view when it fits, but remove fixed-height density
   overrides that clipped shorter laptop screens. */
@media (min-width:1051px) and (max-height:850px){
  body[data-density="compact"] .main,
  body[data-density="normal"] .main,
  body[data-density="spacious"] .main{
    min-height:0!important;
  }
  body[data-density="compact"] .map-pane,
  body[data-density="normal"] .map-pane,
  body[data-density="spacious"] .map-pane{
    padding:8px!important;
  }
  body[data-density="compact"] .map-wrap,
  body[data-density="normal"] .map-wrap,
  body[data-density="spacious"] .map-wrap{
    height:100%!important;
    min-height:0!important;
  }
}

/* Tablet and narrow-window layout: stack the sidebar below the map and let
   the document scroll so no controls can become unreachable. */
@media (max-width:1050px){
  html,
  body{
    height:auto!important;
    min-height:100%!important;
    overflow-x:hidden!important;
    overflow-y:auto!important;
  }
  .app{
    height:auto!important;
    min-height:100vh!important;
  }
  .window{
    height:auto!important;
    min-height:100vh!important;
    overflow:visible!important;
  }
  .main,
  body[data-density="compact"] .main,
  body[data-density="normal"] .main,
  body[data-density="spacious"] .main{
    display:block!important;
    height:auto!important;
    min-height:0!important;
    overflow:visible!important;
  }
  .map-pane,
  body[data-density="compact"] .map-pane,
  body[data-density="normal"] .map-pane,
  body[data-density="spacious"] .map-pane{
    width:100%!important;
    height:clamp(380px,58vh,620px)!important;
    min-height:380px!important;
    padding:8px!important;
    border-right:0!important;
    border-bottom:1px solid var(--theme-soft-border)!important;
  }
  .map-wrap,
  body[data-density="compact"] .map-wrap,
  body[data-density="normal"] .map-wrap,
  body[data-density="spacious"] .map-wrap{
    width:100%!important;
    height:100%!important;
    min-height:0!important;
  }
  .side{
    width:100%!important;
    height:auto!important;
    min-height:0!important;
    overflow:visible!important;
    border-left:0!important;
    border-top:1px solid var(--theme-soft-border)!important;
  }
  .compact-topbar{
    position:sticky;
    top:0;
    z-index:34;
  }
}

@media (max-width:560px){
  .app-header{
    flex-wrap:wrap;
  }
  .app-brand{
    flex:1 1 calc(100% - 42px);
    white-space:normal;
  }
  .app-support-btn{
    order:3;
    margin-left:0!important;
  }
  .era-tabs{
    padding-left:3px!important;
    padding-right:3px!important;
    gap:1px!important;
  }
  .era-tabs .era-btn{
    padding-inline:2px!important;
    font-size:9px!important;
  }
  .compact-topbar{
    flex-wrap:wrap;
  }
  .compact-sep{
    display:none!important;
  }
  .map-pane,
  body[data-density="compact"] .map-pane,
  body[data-density="normal"] .map-pane,
  body[data-density="spacious"] .map-pane{
    height:420px!important;
    min-height:420px!important;
    padding:4px!important;
  }
  .compact-table-head,
  .compact-building-row,
  body[data-density="compact"] .compact-table-head,
  body[data-density="compact"] .compact-building-row,
  body[data-density="normal"] .compact-table-head,
  body[data-density="normal"] .compact-building-row,
  body[data-density="spacious"] .compact-table-head,
  body[data-density="spacious"] .compact-building-row{
    grid-template-columns:minmax(122px,1fr) 32px 64px 82px!important;
  }
  .preset-popover{
    position:fixed!important;
    top:104px!important;
    left:8px!important;
    right:8px!important;
    width:auto!important;
    max-width:none!important;
  }
  .preset-popover-main{
    grid-template-columns:1fr!important;
    max-height:65vh!important;
    overflow:auto!important;
  }
  .preset-list{
    border-right:0!important;
    border-bottom:1px solid var(--theme-soft-border)!important;
  }
}
'''
    if "/* v0.96.1 release hardening: viewport-safe layout." not in text:
        text = text.replace("</style>", responsive_css + "\n</style>", 1)

    text = replace_once(
        text,
'''  const icon=type==="success"?"✓":type==="error"?"×":"!";
  toast.innerHTML=`
    <div class="toast-icon">${icon}</div>
    <div>
      <div class="toast-title">${title}</div>
      ${message?`<div class="toast-message">${message}</div>`:""}
    </div>`;

  host.querySelectorAll(".app-toast").forEach(old=>old.remove());''',
'''  const icon=type==="success"?"✓":type==="error"?"×":"!";

  const iconEl=document.createElement("div");
  iconEl.className="toast-icon";
  iconEl.textContent=icon;

  const copy=document.createElement("div");
  const titleEl=document.createElement("div");
  titleEl.className="toast-title";
  titleEl.textContent=String(title);
  copy.appendChild(titleEl);

  if(message){
    const messageEl=document.createElement("div");
    messageEl.className="toast-message";
    messageEl.textContent=String(message);
    copy.appendChild(messageEl);
  }

  toast.append(iconEl,copy);

  host.querySelectorAll(".app-toast").forEach(old=>old.remove());''',
        "toast renderer",
    )

    text = replace_once(
        text,
'''const FIXED_HOTKEYS=new Set([
  "1","2","3","4","5","6","7","8","9",
  "ArrowLeft","ArrowRight","ArrowUp","ArrowDown"
]);''',
'''const FIXED_HOTKEYS=new Set([
  "1","2","3","4","5","6","7","8","9",
  "Delete",
  "ArrowLeft","ArrowRight","ArrowUp","ArrowDown"
]);''',
        "fixed hotkeys",
    )
    text = text.replace(
        'const use=/^[1-9]$/.test(binding)?"building selection":"map panning";',
        'const use=/^[1-9]$/.test(binding)?"building selection":binding==="Delete"?"erase":"map panning";',
        1,
    )

    text = replace_once(
        text,
'''function applyEraTheme(era){
  applyConfiguredTheme(era);
  document.querySelectorAll('.era-btn').forEach(btn=>{
    btn.classList.toggle('active',btn.dataset.era===era);
  });
}''',
'''function applyEraTheme(era){
  applyConfiguredTheme(era);
  document.querySelectorAll('.era-btn').forEach(btn=>{
    const selected=btn.dataset.era===era;
    btn.classList.toggle('active',selected);
    if(selected)btn.setAttribute("aria-current","page");
    else btn.removeAttribute("aria-current");
  });
}''',
        "era theme state",
    )

    text = replace_once(
        text,
'''  document.querySelectorAll(".build-tab").forEach(btn=>{
    btn.classList.toggle("active",btn.dataset.buildCategory===buildCategory);
  });

  const editable=isEditableColonyEra(selectedEra);''',
'''  document.querySelectorAll(".build-tab").forEach(btn=>{
    const selected=btn.dataset.buildCategory===buildCategory;
    btn.classList.toggle("active",selected);
    btn.setAttribute("aria-selected",String(selected));
    btn.tabIndex=selected?0:-1;
    if(btn===pathTab)btn.setAttribute("aria-hidden",String(pathless));
    else btn.removeAttribute("aria-hidden");
    if(selected&&btn.id)menu.setAttribute("aria-labelledby",btn.id);
  });

  const editable=isEditableColonyEra(selectedEra);''',
        "build tab state",
    )

    text = replace_once(
        text,
'''document.querySelectorAll(".build-tab").forEach(btn=>{
  btn.addEventListener("click",()=>{
    buildCategory=btn.dataset.buildCategory;
    renderBuildMenu();
  });
});''',
'''document.querySelectorAll(".build-tab").forEach(btn=>{
  btn.addEventListener("click",()=>{
    buildCategory=btn.dataset.buildCategory;
    renderBuildMenu();
  });

  btn.addEventListener("keydown",e=>{
    if(!["ArrowLeft","ArrowRight","Home","End"].includes(e.key))return;
    const tabs=[...document.querySelectorAll(".build-tab")].filter(
      tab=>tab.style.display!=="none"&&tab.getAttribute("aria-hidden")!=="true"
    );
    const here=tabs.indexOf(btn);
    if(here<0)return;

    e.preventDefault();
    e.stopPropagation();

    let nextIndex=here;
    if(e.key==="ArrowLeft")nextIndex=(here-1+tabs.length)%tabs.length;
    else if(e.key==="ArrowRight")nextIndex=(here+1)%tabs.length;
    else if(e.key==="Home")nextIndex=0;
    else if(e.key==="End")nextIndex=tabs.length-1;

    const next=tabs[nextIndex];
    buildCategory=next.dataset.buildCategory;
    renderBuildMenu();
    next.focus();
  });
});''',
        "build tab listeners",
    )

    text = replace_once(
        text,
'''  const topMap={
    move:"compactMoveBtn"
  };
  for(const id of Object.values(topMap)){
    $(id)?.classList.remove("active");
  }
  if(mode&&topMap[mode])$(topMap[mode])?.classList.add("active");''',
'''  const topMap={
    move:"compactMoveBtn",
    erase:"compactEraseBtn"
  };
  for(const [modeName,id] of Object.entries(topMap)){
    const el=$(id);
    el?.classList.toggle("active",mode===modeName);
    el?.setAttribute("aria-pressed",String(mode===modeName));
  }''',
        "mode button state",
    )

    text = replace_once(
        text,
        'bindClick("compactMoveBtn",()=>setMode(mode==="move"?null:"move"));',
        'bindClick("compactMoveBtn",()=>setMode(mode==="move"?null:"move"));\nbindClick("compactEraseBtn",()=>setMode(mode==="erase"?null:"erase"));',
        "erase button binding",
    )

    text = replace_once(
        text,
'''  if(pressed===appSettings.hotkeyUndo){
    e.preventDefault();
    if(history.length)restore(history.pop());
    return;
  }

  if(/^[1-9]$/.test(pressed)){''',
'''  if(pressed===appSettings.hotkeyUndo){
    e.preventDefault();
    if(history.length)restore(history.pop());
    return;
  }

  if(pressed==="Delete"){
    e.preventDefault();
    setMode(mode==="erase"?null:"erase");
    return;
  }

  if(/^[1-9]$/.test(pressed)){''',
        "Delete shortcut",
    )

    text = text.replace(
        'const editable=e.target?.isContentEditable||["input","textarea","select"].includes(tag);',
        'const editable=e.target?.isContentEditable||["input","textarea","select","button"].includes(tag);',
        1,
    )

    text = replace_once(
        text,
'''document.querySelectorAll(".era-btn").forEach(btn=>{
  btn.addEventListener("click",()=>{
    document.querySelectorAll(".era-btn").forEach(
      x=>x.classList.toggle("active",x===btn)
    );
    const era=btn.dataset.era;''',
'''document.querySelectorAll(".era-btn").forEach(btn=>{
  btn.addEventListener("click",()=>{
    const era=btn.dataset.era;''',
        "era click listener",
    )

    return text


def patch_readme(text):
    text = text.replace(
        "| Delete buildings and paths | Right click |",
        "| Delete buildings and paths | Right click, or `Delete` then left-click |",
    )
    text = text.replace(
        "**SAT and SASH layouts still need verification.**\n\n",
        "**All six supported Space Age colony layouts are available and have been checked for the current planner build.**\n\n",
    )
    marker = "### [Open Forge of Empires Colony Planner](https://lacey49.github.io/forge-of-empires-colony-planner/)\n"
    if "**Current website build:** `v0.96.1`" not in text:
        text = text.replace(marker, marker + "\n**Current website build:** `v0.96.1`\n", 1)
    return text


def main():
    original = INDEX.read_text(encoding="utf-8")
    patched = patch_index(original)
    INDEX.write_text(patched, encoding="utf-8")
    VERSIONED.write_text(patched, encoding="utf-8")

    readme = README.read_text(encoding="utf-8")
    README.write_text(patch_readme(readme), encoding="utf-8")

    print("Applied v0.96.1 release hardening.")


if __name__ == "__main__":
    main()
