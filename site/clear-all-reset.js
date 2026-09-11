/* Clear All should return the Town Hall to the era's default starting position. */
(() => {
  if (window.__FOE_CLEAR_ALL_RESET_V1__) return;
  window.__FOE_CLEAR_ALL_RESET_V1__ = true;

  if (
    typeof clearPlacedObjects !== 'function' ||
    typeof activeColonyConfig !== 'function' ||
    typeof baseGrid !== 'function' ||
    typeof snapshot !== 'function' ||
    typeof applyHub !== 'function'
  ) return;

  clearPlacedObjects = function() {
    snapshot();
    grid = baseGrid();
    buildings = [];
    hubTop = [...activeColonyConfig().defaultHub];
    applyHub();
    movingItem = null;
    clearRoadChain();
    render();
    status('', true);
  };
})();
