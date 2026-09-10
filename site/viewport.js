/* Keep the board viewport flush with the real planner edges.
   Older density CSS used fixed map heights/padding, which created invisible
   clipping lines on some desktop resolutions. */
(() => {
  if (window.__FOE_VIEWPORT_FIX_V1__) return;
  window.__FOE_VIEWPORT_FIX_V1__ = true;

  const style = document.createElement('style');
  style.id = 'foe-viewport-fix';
  style.textContent = `
    .map-pane,
    body[data-density="compact"] .map-pane,
    body[data-density="normal"] .map-pane,
    body[data-density="spacious"] .map-pane {
      padding: 0 !important;
      min-width: 0 !important;
      min-height: 0 !important;
      overflow: hidden !important;
    }

    .map-wrap,
    body[data-density="compact"] .map-wrap,
    body[data-density="normal"] .map-wrap,
    body[data-density="spacious"] .map-wrap {
      width: 100% !important;
      height: 100% !important;
      min-width: 0 !important;
      min-height: 0 !important;
      padding: 0 !important;
      overflow: hidden !important;
      align-self: stretch !important;
    }

    @media (min-width: 1051px) {
      .main,
      body[data-density="compact"] .main,
      body[data-density="normal"] .main,
      body[data-density="spacious"] .main {
        min-height: 0 !important;
        height: auto !important;
        overflow: hidden !important;
      }
    }
  `;
  document.head.appendChild(style);
})();
