/* Compatibility loader. Optimizer code now lives in /optimizer. */
(() => {
  const button = document.getElementById('optimizeBtn');
  if (button) button.disabled = true;

  const scripts = [
    './optimizer/optimizer.js?v=10',
    './optimizer/performance.js?v=1',
    './optimizer/experimental.js?v=10',
    './optimizer/neighborhood.js?v=1',
    './presets/current-presets.js?v=1',
    './site/keyboard.js?v=1'
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
      if (button) button.disabled = false;
    } catch (err) {
      console.error('Optimizer failed to load', err);
    }
  })();
})();