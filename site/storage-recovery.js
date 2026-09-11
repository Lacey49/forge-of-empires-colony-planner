/* Local save hardening: backups, import/export, and visible storage failures. */
(() => {
  if (window.__FOE_STORAGE_RECOVERY_V1__) return;
  window.__FOE_STORAGE_RECOVERY_V1__ = true;
  if (typeof STORAGE_KEY !== 'string' || typeof saveWorkspace !== 'function') return;

  const PREVIOUS_KEY = `${STORAGE_KEY}-previous-good`;
  const PRE_OPTIMIZER_KEY = `${STORAGE_KEY}-pre-optimizer`;
  const BACKUP_FORMAT = 'foe-colony-planner-backup';

  function isWorkspace(value) {
    return !!value && typeof value === 'object' && !!value.eras && typeof value.eras === 'object';
  }

  function parseWorkspace(raw) {
    if (!raw) throw new Error('No backup data was found.');
    const parsed = JSON.parse(raw);
    const candidate = parsed?.format === BACKUP_FORMAT
      ? parsed.workspace
      : (parsed?.workspace && isWorkspace(parsed.workspace) ? parsed.workspace : parsed);
    if (!isWorkspace(candidate)) throw new Error('This file is not a Colony Planner backup.');
    return candidate;
  }

  function showStorageFailure(message) {
    let banner = document.getElementById('storageFailureBanner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'storageFailureBanner';
      banner.setAttribute('role','alert');
      banner.style.cssText = 'position:fixed;left:12px;right:12px;top:12px;z-index:100000;padding:10px 12px;border:1px solid #c36b55;border-radius:5px;background:#4a1712;color:#ffe8df;font:700 13px Arial,sans-serif;text-align:center;box-shadow:0 3px 12px #0008;';
      document.body.appendChild(banner);
    }
    banner.textContent = message;
  }

  function clearStorageFailure() {
    document.getElementById('storageFailureBanner')?.remove();
  }

  saveWorkspace = function() {
    try {
      const oldRaw = localStorage.getItem(STORAGE_KEY);
      if (oldRaw) {
        try {
          if (isWorkspace(JSON.parse(oldRaw))) localStorage.setItem(PREVIOUS_KEY,oldRaw);
        } catch {}
      }
      localStorage.setItem(STORAGE_KEY,JSON.stringify(workspace));
      clearStorageFailure();
      return true;
    } catch (err) {
      console.error('Planner save failed',err);
      showStorageFailure('Planner could not save. Your latest changes may be lost.');
      return false;
    }
  };

  window.foeSavePreOptimizerCheckpoint = function() {
    try {
      if (typeof persistColonyState === 'function' && typeof selectedEra === 'string') persistColonyState(selectedEra);
      const payload = {
        format:BACKUP_FORMAT,
        version:1,
        kind:'pre-optimizer',
        savedAt:new Date().toISOString(),
        workspace:JSON.parse(JSON.stringify(workspace))
      };
      localStorage.setItem(PRE_OPTIMIZER_KEY,JSON.stringify(payload));
      return true;
    } catch (err) {
      console.error('Optimizer checkpoint failed',err);
      showStorageFailure('Planner could not save a recovery point.');
      return false;
    }
  };

  function downloadBackup() {
    try {
      if (typeof persistColonyState === 'function' && typeof selectedEra === 'string') persistColonyState(selectedEra);
      const payload = {
        format:BACKUP_FORMAT,
        version:1,
        exportedAt:new Date().toISOString(),
        workspace:JSON.parse(JSON.stringify(workspace))
      };
      const blob = new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0,10);
      a.href = url;
      a.download = `foe-colony-planner-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url),1000);
    } catch (err) {
      console.error('Backup download failed',err);
      showStorageFailure('Could not create a backup file.');
    }
  }

  async function restoreRaw(raw,title) {
    let next;
    try {
      next = parseWorkspace(raw);
    } catch (err) {
      if (typeof notifyToast === 'function') notifyToast('Backup not loaded',err.message || 'That backup file is invalid.','error',4200);
      return;
    }

    const ok = typeof showConfirmDialog === 'function'
      ? await showConfirmDialog({title,message:'This replaces your saved planner data.',confirmText:'Restore',cancelText:'Cancel'})
      : window.confirm('Replace your saved planner data?');
    if (!ok) return;

    try {
      localStorage.setItem(STORAGE_KEY,JSON.stringify(next));
      location.reload();
    } catch (err) {
      console.error('Backup restore failed',err);
      showStorageFailure('Could not restore the backup.');
    }
  }

  function installSettingsUi() {
    const panel = document.querySelector('#settingsScreen .settings-page-panel');
    if (!panel || document.getElementById('backupRecoveryGroup')) return;

    const group = document.createElement('div');
    group.id = 'backupRecoveryGroup';
    group.className = 'settings-group';
    group.innerHTML = `
      <div style="font-weight:800;margin-bottom:5px">Backup & recovery</div>
      <div style="display:flex;gap:7px;flex-wrap:wrap">
        <button id="downloadPlannerBackup" class="btn" type="button">Download backup</button>
        <button id="importPlannerBackup" class="btn" type="button">Import backup</button>
        <button id="restorePreviousPlannerSave" class="btn" type="button">Restore previous save</button>
        <button id="restorePreOptimizerSave" class="btn" type="button">Restore before optimize</button>
      </div>
      <input id="plannerBackupFile" type="file" accept="application/json,.json" hidden>
    `;
    panel.appendChild(group);

    const fileInput = document.getElementById('plannerBackupFile');
    document.getElementById('downloadPlannerBackup')?.addEventListener('click',downloadBackup);
    document.getElementById('importPlannerBackup')?.addEventListener('click',() => fileInput?.click());
    fileInput?.addEventListener('change',async() => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file) return;
      try {
        await restoreRaw(await file.text(),'Import backup?');
      } catch {
        if (typeof notifyToast === 'function') notifyToast('Backup not loaded','Could not read that file.','error',4200);
      }
    });

    const previousBtn = document.getElementById('restorePreviousPlannerSave');
    const optimizerBtn = document.getElementById('restorePreOptimizerSave');
    if (previousBtn) {
      previousBtn.disabled = !localStorage.getItem(PREVIOUS_KEY);
      previousBtn.addEventListener('click',() => restoreRaw(localStorage.getItem(PREVIOUS_KEY),'Restore previous save?'));
    }
    if (optimizerBtn) {
      optimizerBtn.disabled = !localStorage.getItem(PRE_OPTIMIZER_KEY);
      optimizerBtn.addEventListener('click',() => restoreRaw(localStorage.getItem(PRE_OPTIMIZER_KEY),'Restore before optimizer?'));
    }
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) parseWorkspace(raw);
  } catch (err) {
    console.error('Saved planner data is damaged',err);
    showStorageFailure('Saved planner data is damaged. Open Settings to recover it.');
  }

  installSettingsUi();
})();
