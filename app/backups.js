// Save backups, restore them, and let the player know if saving fails.
(() => {
  if (window.__FOE_STORAGE_RECOVERY_V5__) return;
  window.__FOE_STORAGE_RECOVERY_V5__ = true;
  if (typeof STORAGE_KEY !== "string" || typeof saveWorkspace !== "function")
    return;

  const PREVIOUS_KEY = `${STORAGE_KEY}-previous-good`;
  const PRE_OPTIMIZER_KEY = `${STORAGE_KEY}-pre-optimizer`;
  let restoringBackup = false;
  const BACKUP_FORMAT = "foe-colony-planner-backup";

  function isWorkspace(value) {
    return (
      !!value &&
      typeof value === "object" &&
      !!value.eras &&
      typeof value.eras === "object" &&
      !Array.isArray(value.eras) &&
      Object.values(value.eras).every(
        (slot) => slot && typeof slot === "object" && !Array.isArray(slot),
      )
    );
  }

  function parseWorkspace(raw) {
    if (!raw) throw new Error("No backup data was found.");
    const parsed = JSON.parse(raw);
    const candidate =
      parsed?.format === BACKUP_FORMAT
        ? parsed.workspace
        : parsed?.workspace && isWorkspace(parsed.workspace)
          ? parsed.workspace
          : parsed;
    if (!isWorkspace(candidate))
      throw new Error("This file is not a Colony Planner backup.");
    for (const [era, slot] of Object.entries(candidate.eras)) {
      if (!ERA_DATA[era])
        throw new Error("This backup contains an unknown era.");
      for (const state of [
        slot.currentView,
        slot.freeBuild,
        ...Object.values(slot.customPresets || {}).map((p) => p?.state),
      ]) {
        if (state != null && !colonyStateMatchesGeometry(state, era)) {
          throw new Error(
            "A layout in this backup has invalid buildings or land. Your current save has not changed.",
          );
        }
      }
    }
    return candidate;
  }

  function showStorageFailure(message) {
    let banner = document.getElementById("storageFailureBanner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "storageFailureBanner";
      banner.setAttribute("role", "alert");
      banner.style.cssText =
        "position:fixed;left:12px;right:12px;top:12px;z-index:100000;padding:10px 12px;border:1px solid #c36b55;border-radius:5px;background:#4a1712;color:#ffe8df;font:700 13px Arial,sans-serif;text-align:center;box-shadow:0 3px 12px #0008;";
      document.body.appendChild(banner);
    }
    banner.textContent = message;
  }

  function clearStorageFailure() {
    document.getElementById("storageFailureBanner")?.remove();
  }

  function storageItemExists(key) {
    try {
      return !!localStorage.getItem(key);
    } catch {
      return false;
    }
  }

  function refreshRestoreButtons() {
    const previousBtn = document.getElementById("restorePreviousPlannerSave");
    const optimizerBtn = document.getElementById("restorePreOptimizerSave");
    if (previousBtn) previousBtn.disabled = !storageItemExists(PREVIOUS_KEY);
    if (optimizerBtn)
      optimizerBtn.disabled = !storageItemExists(PRE_OPTIMIZER_KEY);
  }

  saveWorkspace = function () {
    // Reload fires pagehide. Do not overwrite an imported backup with the old board.
    if (restoringBackup || savedDataUnreadable) return false;
    try {
      const oldRaw = localStorage.getItem(STORAGE_KEY);
      const newRaw = JSON.stringify(workspace);
      if (oldRaw && oldRaw !== newRaw) {
        try {
          if (isWorkspace(JSON.parse(oldRaw)))
            localStorage.setItem(PREVIOUS_KEY, oldRaw);
        } catch {}
      }
      localStorage.setItem(STORAGE_KEY, newRaw);
      refreshRestoreButtons();
      clearStorageFailure();
      return true;
    } catch (err) {
      console.error("Planner save failed", err);
      showStorageFailure(
        "Planner could not save. Your latest changes may be lost.",
      );
      return false;
    }
  };

  window.foeSavePreOptimizerCheckpoint = function () {
    try {
      if (
        typeof persistColonyState === "function" &&
        typeof selectedEra === "string"
      )
        persistColonyState(selectedEra);
      const payload = {
        format: BACKUP_FORMAT,
        version: 1,
        kind: "pre-optimizer",
        savedAt: new Date().toISOString(),
        workspace: JSON.parse(JSON.stringify(workspace)),
      };
      localStorage.setItem(PRE_OPTIMIZER_KEY, JSON.stringify(payload));
      refreshRestoreButtons();
      return true;
    } catch (err) {
      console.error("Optimizer checkpoint failed", err);
      showStorageFailure("Planner could not save a recovery point.");
      return false;
    }
  };

  function downloadBackup() {
    try {
      if (
        typeof persistColonyState === "function" &&
        typeof selectedEra === "string"
      )
        persistColonyState(selectedEra);
      const payload = {
        format: BACKUP_FORMAT,
        version: 1,
        exportedAt: new Date().toISOString(),
        workspace: JSON.parse(JSON.stringify(workspace)),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `foe-colony-planner-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error("Backup download failed", err);
      showStorageFailure("Could not create a backup file.");
    }
  }

  async function restoreRaw(raw, title) {
    let next;
    try {
      next = parseWorkspace(raw);
    } catch (err) {
      if (typeof notifyToast === "function")
        notifyToast(
          "Backup not loaded",
          err.message || "That backup file is invalid.",
          "error",
          4200,
        );
      return;
    }

    const ok =
      typeof showConfirmDialog === "function"
        ? await showConfirmDialog({
            title,
            message: "This replaces your saved planner data.",
            confirmText: "Restore",
            cancelText: "Cancel",
          })
        : window.confirm("Replace your saved planner data?");
    if (!ok) return;

    try {
      const currentRaw = localStorage.getItem(STORAGE_KEY);
      if (currentRaw) {
        try {
          if (isWorkspace(JSON.parse(currentRaw)))
            localStorage.setItem(PREVIOUS_KEY, currentRaw);
        } catch {}
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      restoringBackup = true;
      location.reload();
    } catch (err) {
      console.error("Backup restore failed", err);
      showStorageFailure("Could not restore the backup.");
    }
  }

  function wireSettingsUi() {
    const fileInput = document.getElementById("plannerBackupFile");
    const downloadBtn = document.getElementById("downloadPlannerBackup");
    const importBtn = document.getElementById("importPlannerBackup");
    const previousBtn = document.getElementById("restorePreviousPlannerSave");
    const optimizerBtn = document.getElementById("restorePreOptimizerSave");
    if (
      !fileInput ||
      !downloadBtn ||
      !importBtn ||
      !previousBtn ||
      !optimizerBtn
    )
      return;
    const group = document.getElementById("backupRecoveryGroup");
    if (group?.dataset.wired === "1") return;
    if (group) group.dataset.wired = "1";

    downloadBtn.addEventListener("click", downloadBackup);
    importBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      fileInput.value = "";
      if (!file) return;
      try {
        await restoreRaw(await file.text(), "Import backup?");
      } catch {
        if (typeof notifyToast === "function")
          notifyToast(
            "Backup not loaded",
            "Could not read that file.",
            "error",
            4200,
          );
      }
    });

    previousBtn.addEventListener("click", () => {
      let raw = null;
      try {
        raw = localStorage.getItem(PREVIOUS_KEY);
      } catch {}
      restoreRaw(raw, "Restore previous save?");
    });
    optimizerBtn.addEventListener("click", () => {
      let raw = null;
      try {
        raw = localStorage.getItem(PRE_OPTIMIZER_KEY);
      } catch {}
      restoreRaw(raw, "Restore before optimizer?");
    });
    refreshRestoreButtons();
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (savedDataUnreadable || (raw && !isWorkspace(JSON.parse(raw))))
      throw new Error("Unreadable save");
  } catch (err) {
    console.error("Saved planner data is damaged", err);
    showStorageFailure(
      "Saved planner data is damaged. Open Settings to recover it.",
    );
  }

  wireSettingsUi();
})();
