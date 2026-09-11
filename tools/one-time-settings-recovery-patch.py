from pathlib import Path

index_path = Path('index.html')
index = index_path.read_text(encoding='utf-8')

markup_anchor = '''        <button id="resetSettingsBtn" class="settings-reset-btn" type="button">Reset to default</button>
      </div>
    </div>
  </section>'''
markup_replacement = '''        <button id="resetSettingsBtn" class="settings-reset-btn" type="button">Reset to default</button>
      </div>

      <div id="backupRecoveryGroup" class="settings-group settings-recovery-group">
        <div class="settings-section-heading">
          <b>Backup & recovery</b>
          <small>Save a copy of your planner or recover an earlier layout.</small>
        </div>
        <div class="settings-recovery-list">
          <div class="settings-recovery-row">
            <div class="settings-control-copy">
              <b>Download backup</b>
              <small>Save all planner layouts and presets as a JSON file.</small>
            </div>
            <button id="downloadPlannerBackup" class="settings-recovery-btn" type="button">Download</button>
          </div>
          <div class="settings-recovery-row">
            <div class="settings-control-copy">
              <b>Import backup</b>
              <small>Replace your planner data with a backup file.</small>
            </div>
            <button id="importPlannerBackup" class="settings-recovery-btn" type="button">Import</button>
          </div>
          <div class="settings-recovery-row">
            <div class="settings-control-copy">
              <b>Previous save</b>
              <small>Restore the last saved planner state from this browser.</small>
            </div>
            <button id="restorePreviousPlannerSave" class="settings-recovery-btn" type="button" disabled>Restore</button>
          </div>
          <div class="settings-recovery-row">
            <div class="settings-control-copy">
              <b>Before optimizer</b>
              <small>Restore the layout saved immediately before the last optimizer apply.</small>
            </div>
            <button id="restorePreOptimizerSave" class="settings-recovery-btn" type="button" disabled>Restore</button>
          </div>
        </div>
        <input id="plannerBackupFile" type="file" accept="application/json,.json" hidden>
      </div>
    </div>
  </section>'''

if 'id="backupRecoveryGroup"' not in index:
    if markup_anchor not in index:
        raise SystemExit('Could not find settings markup anchor')
    index = index.replace(markup_anchor, markup_replacement, 1)

css_anchor = '''body.settings-mode .compact-topbar,
body.settings-mode #compactStatus,
body.settings-mode .main{'''
css = '''.settings-recovery-group .settings-section-heading{
  margin-bottom:2px;
}
.settings-recovery-list{
  margin-top:7px;
}
.settings-recovery-row{
  min-width:0;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:16px;
  padding:9px 0;
}
.settings-recovery-row + .settings-recovery-row{
  border-top:1px solid var(--theme-soft-border);
}
.settings-recovery-row .settings-control-copy{
  flex:1 1 auto;
  min-width:0;
}
.settings-recovery-btn{
  flex:0 0 auto;
  min-width:82px;
  min-height:31px;
  padding:5px 10px;
  border:1px solid var(--theme-border);
  border-radius:4px;
  background:var(--theme-panel);
  color:var(--theme-title-text);
  font-size:10px;
  font-weight:800;
}
.settings-recovery-btn:hover:not(:disabled){
  border-color:var(--theme-accent);
  background:color-mix(in srgb,var(--theme-panel) 72%,var(--theme-accent-soft) 28%);
}
.settings-recovery-btn:disabled{
  opacity:.42;
  cursor:default;
}
@media(max-width:420px){
  .settings-recovery-row{
    align-items:flex-start;
    flex-direction:column;
    gap:7px;
  }
  .settings-recovery-btn{
    align-self:flex-end;
  }
}

'''

if '.settings-recovery-list{' not in index:
    if css_anchor not in index:
        raise SystemExit('Could not find settings CSS anchor')
    index = index.replace(css_anchor, css + css_anchor, 1)

index_path.write_text(index, encoding='utf-8')

storage_path = Path('site/storage-recovery.js')
storage = storage_path.read_text(encoding='utf-8')
storage = storage.replace('__FOE_STORAGE_RECOVERY_V2__', '__FOE_STORAGE_RECOVERY_V3__')

start = storage.find('  function settingsActionRow')
end = storage.find('  try {', start)
if start < 0 or end < 0:
    raise SystemExit('Could not find dynamic settings UI block')

wiring = '''  function wireSettingsUi() {
    const fileInput = document.getElementById('plannerBackupFile');
    const downloadBtn = document.getElementById('downloadPlannerBackup');
    const importBtn = document.getElementById('importPlannerBackup');
    const previousBtn = document.getElementById('restorePreviousPlannerSave');
    const optimizerBtn = document.getElementById('restorePreOptimizerSave');
    if (!fileInput || !downloadBtn || !importBtn || !previousBtn || !optimizerBtn) return;
    const group = document.getElementById('backupRecoveryGroup');
    if (group?.dataset.wired === '1') return;
    if (group) group.dataset.wired = '1';

    downloadBtn.addEventListener('click',downloadBackup);
    importBtn.addEventListener('click',() => fileInput.click());
    fileInput.addEventListener('change',async() => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file) return;
      try {
        await restoreRaw(await file.text(),'Import backup?');
      } catch {
        if (typeof notifyToast === 'function') notifyToast('Backup not loaded','Could not read that file.','error',4200);
      }
    });

    previousBtn.disabled = !localStorage.getItem(PREVIOUS_KEY);
    previousBtn.addEventListener('click',() => restoreRaw(localStorage.getItem(PREVIOUS_KEY),'Restore previous save?'));

    optimizerBtn.disabled = !localStorage.getItem(PRE_OPTIMIZER_KEY);
    optimizerBtn.addEventListener('click',() => restoreRaw(localStorage.getItem(PRE_OPTIMIZER_KEY),'Restore before optimizer?'));
  }

'''
storage = storage[:start] + wiring + storage[end:]
storage = storage.replace('  installSettingsUi();\n})();', '  wireSettingsUi();\n})();')
storage_path.write_text(storage, encoding='utf-8')

loader_path = Path('assets/js/optimizer.js')
loader = loader_path.read_text(encoding='utf-8')
loader = loader.replace("'./site/storage-recovery.js?v=3'", "'./site/storage-recovery.js?v=4'")
loader_path.write_text(loader, encoding='utf-8')
