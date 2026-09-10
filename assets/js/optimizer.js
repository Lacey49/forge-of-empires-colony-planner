/* Compatibility loader. Optimizer code now lives in /optimizer. */
(() => {
  const button = document.getElementById('optimizeBtn');
  if (button) button.disabled = true;

  const scripts = [
    './optimizer/optimizer.js?v=10',
    './optimizer/performance.js?v=1',
    './optimizer/experimental.js?v=10',
    './optimizer/neighborhood.js?v=1',
    './optimizer/road-network.js?v=2',
    './optimizer/filler-promotion.js?v=1',
    './presets/current-presets.js?v=2',
    './presets/saab-presets.js?v=1',
    './presets/sav-presets.js?v=1',
    './presets/sav-max-presets.js?v=1',
    './presets/sat-presets.js?v=1',
    './presets/sash-presets.js?v=1',
    './site/state-consistency.js?v=2',
    './site/viewport.js?v=1',
    './site/keyboard.js?v=2',
    './optimizer/single-search.js?v=1'
  ];

  const load = src => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Failed to load ' + src));
    document.body.appendChild(script);
  });

  (async () => {
    try {
      for (const src of scripts) await load(src);
      if (typeof optimizerSyncSearchLabels === 'function') optimizerSyncSearchLabels();
      const version = document.querySelector('.version-label');
      if (version) {
        version.textContent = 'v0.99';
        version.title = 'Forge of Empires Colony Planner v0.99';
      }
      if (button) button.disabled = false;
    } catch (err) {
      console.error('Optimizer failed to load', err);
    }
  })();
})();
