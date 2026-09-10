/* Site-wide keyboard behavior. Plain Escape may close UI. Modified Escape must not. */
(() => {
  let modifiedEscape = false;
  const hasModifier = e => e.shiftKey || e.ctrlKey || e.altKey || e.metaKey;

  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    modifiedEscape = !!hasModifier(e);
    if (!modifiedEscape) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    setTimeout(() => { modifiedEscape = false; }, 0);
  }, true);

  document.addEventListener('cancel', e => {
    if (!modifiedEscape) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);

  window.addEventListener('keyup', e => {
    if (e.key === 'Escape') modifiedEscape = false;
  }, true);

  // Cache-resilient optimizer bootstrap. Older cached compatibility loaders already
  // load this site module, so use it to pull in the newest final Deep-search stage
  // when that loader predates road-network.js.
  const roadNetworkAlreadyRequested = [...document.scripts].some(script =>
    String(script.src || '').includes('/optimizer/road-network.js')
  );

  if (!roadNetworkAlreadyRequested && typeof optimizeColonyV2 === 'function') {
    const script = document.createElement('script');
    script.src = './optimizer/road-network.js?v=2';
    script.async = false;
    script.onload = () => {
      if (typeof optimizerSyncSearchLabels === 'function') optimizerSyncSearchLabels();
    };
    script.onerror = () => console.error('Optimizer path-compression stage failed to load');
    document.body.appendChild(script);
  }
})();
