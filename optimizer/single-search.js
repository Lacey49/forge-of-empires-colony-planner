/* v0.99 optimizer UI: one full search with an adaptive time budget. */
(() => {
  if (window.__FOE_SINGLE_OPTIMIZER_SEARCH_V1__) return;
  window.__FOE_SINGLE_OPTIMIZER_SEARCH_V1__ = true;
  if (typeof optimizeColonyV2 !== 'function') return;

  const previousOptimizeColonyV2 = optimizeColonyV2;
  const previousOpenOptimizerDialog = typeof openOptimizerDialog === 'function' ? openOptimizerDialog : null;

  function selectedPrimaryKey(era) {
    const select = document.getElementById('optimizerPrimary');
    if (select?.value) return select.value;
    return ERA_DATA?.[era]?.residential?.[0]?.key || null;
  }

  function needsPaths(era, primaryKey) {
    const eraNeedsPaths = OPT_RULES?.[era]?.paths !== false;
    const def = primaryKey ? eraBoardBuildingByKey(era, primaryKey) : null;
    return eraNeedsPaths && def?.requiresPath !== false;
  }

  function estimatedSeconds(era = selectedEra, primaryKey = selectedPrimaryKey(era)) {
    const expansions = typeof enabledExpansions?.size === 'number' ? enabledExpansions.size : 0;
    const withPaths = needsPaths(era, primaryKey);
    const raw = withPaths ? 35 + expansions * 5 : 15 + expansions * 2;
    const capped = Math.min(withPaths ? 150 : 50, Math.max(withPaths ? 35 : 15, raw));
    return Math.round(capped / 5) * 5;
  }

  function formatSeconds(seconds) {
    if (seconds < 60) return `About ${seconds} seconds`;
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    if (!rest) return `About ${minutes} minute${minutes === 1 ? '' : 's'}`;
    return `About ${minutes} min ${rest} sec`;
  }

  function installSingleSearchUi() {
    const select = document.getElementById('optimizerSearch');
    if (!select) return;

    select.innerHTML = '<option value="deep" selected>Deep</option>';
    select.value = 'deep';
    select.hidden = true;

    const row = select.closest('.optimizer-field');
    if (!row) return;
    const label = row.querySelector('span');
    if (label) label.textContent = 'Estimated time';

    let value = document.getElementById('optimizerTimeEstimate');
    if (!value) {
      value = document.createElement('strong');
      value.id = 'optimizerTimeEstimate';
      value.style.cssText = 'font-weight:700;align-self:center;';
      row.appendChild(value);
    }
    value.textContent = formatSeconds(estimatedSeconds());
  }

  function refreshEstimate() {
    const value = document.getElementById('optimizerTimeEstimate');
    if (value) value.textContent = formatSeconds(estimatedSeconds());
    const select = document.getElementById('optimizerSearch');
    if (select) select.value = 'deep';
  }

  // The estimate is also the real cutoff. The existing optimizer already yields
  // often enough for this timer to stop the search cleanly and return its best result.
  optimizeColonyV2 = async function(era, goal, primaryKey) {
    const budgetMs = estimatedSeconds(era, primaryKey) * 1000;
    let automaticTimeout = false;
    const timer = setTimeout(() => {
      if (!optimizerCancelRequested) {
        automaticTimeout = true;
        optimizerCancelRequested = true;
      }
    }, budgetMs);

    try {
      const result = await previousOptimizeColonyV2(era, goal, primaryKey, 'deep');
      if (automaticTimeout) {
        optimizerCancelRequested = false;
        if (result?.cancelled) return {...result, cancelled:false};
      }
      return result;
    } finally {
      clearTimeout(timer);
      if (automaticTimeout) optimizerCancelRequested = false;
    }
  };

  if (previousOpenOptimizerDialog) {
    openOptimizerDialog = function() {
      previousOpenOptimizerDialog();
      installSingleSearchUi();
      refreshEstimate();
    };
  }

  document.getElementById('optimizerPrimary')?.addEventListener('change', refreshEstimate);
  installSingleSearchUi();
})();
