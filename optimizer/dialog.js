// Building choices and the confirmation shown before replacing goods or life support.
(() => {
  if (window.__FOE_RELEASE_HARDENING_V3__) return;
  window.__FOE_RELEASE_HARDENING_V3__ = true;

  const CORE_RESIDENTIAL = {
    SAM: ["dropPod", "simpleShelter"],
    SAAB: ["movable", "deep"],
    SAV: ["floatingShelter", "inflatableHome"],
    SAJM: ["aquaPod", "aquaCabin"],
    SAT: ["igloo", "screenedDomicile"],
    SASH: ["simpleCrewQuarters", "officersQuarters"],
  };

  function optimizerTargetDefs(era) {
    const allowed = new Set(CORE_RESIDENTIAL[era] || []);
    return (ERA_DATA?.[era]?.residential || []).filter((def) =>
      allowed.has(def.key),
    );
  }

  if (typeof optimizerPopulatePrimary === "function") {
    optimizerPopulatePrimary = function () {
      const select = document.getElementById("optimizerPrimary");
      if (!select) return;

      const defs = optimizerTargetDefs(selectedEra);
      const counts = new Map();
      for (const building of buildings || []) {
        counts.set(building.type, (counts.get(building.type) || 0) + 1);
      }

      select.innerHTML = "";
      let preferred = defs[0]?.key || null;
      let bestCount = -1;
      for (const def of defs) {
        const count = counts.get(def.key) || 0;
        if (count > bestCount) {
          bestCount = count;
          preferred = def.key;
        }
        const option = document.createElement("option");
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
      counts.set(building.type, (counts.get(building.type) || 0) + 1);
    }
    return counts;
  }

  function formatBuildingLines(items) {
    return items
      .map(({ type, count }) => {
        const def = eraBoardBuildingByKey(selectedEra, type);
        const name = def?.name || type;
        return `${count}× ${name}`;
      })
      .join("\n");
  }

  function optimizerApplyDiff(nextState) {
    const before = buildingCounts(currentColonyState());
    const after = buildingCounts(nextState);
    const removed = [];
    const added = [];

    for (const [type, count] of before) {
      const delta = count - (after.get(type) || 0);
      if (delta > 0) removed.push({ type, count: delta });
    }
    for (const [type, count] of after) {
      const delta = count - (before.get(type) || 0);
      if (delta > 0) added.push({ type, count: delta });
    }

    const nonResidentialRemoved = removed.filter(({ type }) => {
      const def = eraBoardBuildingByKey(selectedEra, type);
      return def?.category && def.category !== "residential";
    });

    return { removed, added, nonResidentialRemoved };
  }

  if (
    typeof runOptimizerDialog === "function" &&
    typeof showConfirmDialog === "function"
  ) {
    const previousRunOptimizerDialog = runOptimizerDialog;
    runOptimizerDialog = async function () {
      if (optimizerPendingResult?.state) {
        const diff = optimizerApplyDiff(optimizerPendingResult.state);
        if (diff.nonResidentialRemoved.length) {
          const parts = [`Remove\n${formatBuildingLines(diff.removed)}`];
          if (diff.added.length)
            parts.push(`Add\n${formatBuildingLines(diff.added)}`);
          const ok = await showConfirmDialog({
            title: "Apply optimizer result?",
            message: parts.join("\n\n"),
            confirmText: "Apply result",
            cancelText: "Keep current layout",
          });
          if (!ok) return;
        }
        try {
          window.foeSavePreOptimizerCheckpoint?.();
        } catch (err) {
          console.warn("Could not save optimizer checkpoint", err);
        }
      }
      return previousRunOptimizerDialog();
    };
  }

  const appDialog = document.getElementById("appDialog");
  if (appDialog) appDialog.setAttribute("aria-labelledby", "appDialogTitle");
  const appDialogInput = document.getElementById("appDialogInput");
  if (appDialogInput && !appDialogInput.getAttribute("aria-label"))
    appDialogInput.setAttribute("aria-label", "Name");

  const optimizerDialog = document.getElementById("optimizerDialog");
  const optimizerTitle = optimizerDialog?.querySelector(".dialog-title");
  if (optimizerDialog && optimizerTitle) {
    if (!optimizerTitle.id) optimizerTitle.id = "optimizerDialogTitle";
    optimizerDialog.setAttribute("aria-labelledby", optimizerTitle.id);
  }
})();
