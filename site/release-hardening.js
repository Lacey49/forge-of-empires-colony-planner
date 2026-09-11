/* Pre-v1.0 hardening: simpler optimizer choices, safer apply flow, mobile dialog sizing. */
(() => {
  if (window.__FOE_RELEASE_HARDENING_V2__) return;
  window.__FOE_RELEASE_HARDENING_V2__ = true;

  const CORE_RESIDENTIAL = {
    SAM: ['dropPod','simpleShelter'],
    SAAB: ['movable','deep'],
    SAV: ['floatingShelter','inflatableHome'],
    SAJM: ['aquaPod','aquaCabin'],
    SAT: ['igloo','screenedDomicile'],
    SASH: ['simpleCrewQuarters','officersQuarters']
  };

  function optimizerTargetDefs(era) {
    const allowed = new Set(CORE_RESIDENTIAL[era] || []);
    return (ERA_DATA?.[era]?.residential || []).filter(def => allowed.has(def.key));
  }

  if (typeof optimizerPopulatePrimary === 'function') {
    optimizerPopulatePrimary = function() {
      const select = document.getElementById('optimizerPrimary');
      if (!select) return;

      const defs = optimizerTargetDefs(selectedEra);
      const counts = new Map();
      for (const building of buildings || []) {
        counts.set(building.type,(counts.get(building.type) || 0) + 1);
      }

      select.innerHTML = '';
      let preferred = defs[0]?.key || null;
      let bestCount = -1;
      for (const def of defs) {
        const count = counts.get(def.key) || 0;
        if (count > bestCount) {
          bestCount = count;
          preferred = def.key;
        }
        const option = document.createElement('option');
        option.value = def.key;
        option.textContent = `${def.name} (${def.sizeText})`;
        select.appendChild(option);
      }
      if (preferred) select.value = preferred;
    };
  }

  function buildingCounts(state) {
    const counts = new Map();
    for (const building of state?.buildings || []) {
      counts.set(building.type,(counts.get(building.type) || 0) + 1);
    }
    return counts;
  }

  function formatBuildingLines(items) {
    return items.map(({type,count}) => {
      const def = eraBoardBuildingByKey(selectedEra,type);
      const name = def?.name || type;
      return `${count}× ${name}`;
    }).join('\n');
  }

  function optimizerApplyDiff(nextState) {
    const before = buildingCounts(currentColonyState());
    const after = buildingCounts(nextState);
    const removed = [];
    const added = [];

    for (const [type,count] of before) {
      const delta = count - (after.get(type) || 0);
      if (delta > 0) removed.push({type,count:delta});
    }
    for (const [type,count] of after) {
      const delta = count - (before.get(type) || 0);
      if (delta > 0) added.push({type,count:delta});
    }

    const nonResidentialRemoved = removed.filter(({type}) => {
      const def = eraBoardBuildingByKey(selectedEra,type);
      return def?.category && def.category !== 'residential';
    });

    return {removed,added,nonResidentialRemoved};
  }

  if (typeof runOptimizerDialog === 'function' && typeof showConfirmDialog === 'function') {
    const previousRunOptimizerDialog = runOptimizerDialog;
    runOptimizerDialog = async function() {
      if (optimizerPendingResult?.state) {
        const diff = optimizerApplyDiff(optimizerPendingResult.state);
        if (diff.nonResidentialRemoved.length) {
          const parts = [`Remove\n${formatBuildingLines(diff.removed)}`];
          if (diff.added.length) parts.push(`Add\n${formatBuildingLines(diff.added)}`);
          const ok = await showConfirmDialog({
            title:'Apply optimizer result?',
            message:parts.join('\n\n'),
            confirmText:'Apply result',
            cancelText:'Keep current layout'
          });
          if (!ok) return;
        }
        try { window.foeSavePreOptimizerCheckpoint?.(); }
        catch (err) { console.warn('Could not save optimizer checkpoint',err); }
      }
      return previousRunOptimizerDialog();
    };
  }

  const appDialog = document.getElementById('appDialog');
  if (appDialog) appDialog.setAttribute('aria-labelledby','appDialogTitle');
  const appDialogInput = document.getElementById('appDialogInput');
  if (appDialogInput && !appDialogInput.getAttribute('aria-label')) appDialogInput.setAttribute('aria-label','Name');

  const optimizerDialog = document.getElementById('optimizerDialog');
  const optimizerTitle = optimizerDialog?.querySelector('.dialog-title');
  if (optimizerDialog && optimizerTitle) {
    if (!optimizerTitle.id) optimizerTitle.id = 'optimizerDialogTitle';
    optimizerDialog.setAttribute('aria-labelledby',optimizerTitle.id);
  }

  const homeTitle = document.querySelector('.home-title');
  if (homeTitle && homeTitle.tagName !== 'H1') {
    const heading = document.createElement('h1');
    heading.className = homeTitle.className;
    heading.innerHTML = homeTitle.innerHTML;
    for (const attr of homeTitle.attributes) {
      if (attr.name !== 'class') heading.setAttribute(attr.name,attr.value);
    }
    homeTitle.replaceWith(heading);
  }

  const style = document.createElement('style');
  style.id = 'release-hardening-dialog-fixes';
  style.textContent = `
    .app-dialog {
      width: min(390px, calc(100vw - 24px));
      max-width: none;
      padding: 0;
    }
    #optimizerDialog {
      width: min(470px, calc(100vw - 24px));
      max-width: none;
      padding: 0;
    }
    .app-dialog .dialog-card,
    #optimizerDialog .dialog-card,
    #optimizerDialog .optimizer-card {
      box-sizing: border-box;
      width: 100%;
      max-width: 100%;
    }
    #appDialogMessage { white-space: pre-line; }
    @media (max-width: 480px) {
      .app-dialog button,
      #optimizerDialog button,
      .app-dialog input,
      .app-dialog select,
      #optimizerDialog select {
        min-height: 44px;
      }
    }
  `;
  document.head.appendChild(style);
})();
