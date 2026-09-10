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
})();
