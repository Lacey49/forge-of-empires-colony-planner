/* Keyboard and screen-reader support for the colony planning grid. */
(() => {
  if (window.__FOE_GRID_ACCESSIBILITY_V1__) return;
  window.__FOE_GRID_ACCESSIBILITY_V1__ = true;
  if (typeof render !== 'function') return;

  const board = document.getElementById('board');
  if (!board) return;

  let focusPos = {r:0,c:0};

  function cellAt(r,c) {
    return board.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
  }

  function isNavigable(cell) {
    return !!cell && !cell.classList.contains('out');
  }

  function describeCell(cell) {
    const r = Number(cell.dataset.r);
    const c = Number(cell.dataset.c);
    let detail = '';
    try {
      if (typeof placedThingTooltip === 'function') detail = placedThingTooltip(r,c) || '';
    } catch {}

    if (!detail) {
      if (cell.classList.contains('future')) detail = 'Expansion tile';
      else if (cell.classList.contains('road')) detail = 'Path';
      else if (cell.classList.contains('empty')) detail = 'Empty tile';
      else if (cell.classList.contains('hub')) detail = 'Town Hall';
      else detail = 'Colony tile';
    }
    return `Row ${r + 1}, column ${c + 1}. ${detail}`;
  }

  function firstNavigableCell() {
    return [...board.querySelectorAll('.cell')].find(isNavigable) || null;
  }

  function decorateBoard(restoreFocus = false) {
    board.setAttribute('role','grid');
    board.setAttribute('aria-rowcount','28');
    board.setAttribute('aria-colcount','28');
    board.setAttribute('aria-label','Colony planning grid. Use arrow keys to move, Enter or Space to place or select, and Delete to remove.');

    const cells = [...board.querySelectorAll('.cell')];
    let active = cellAt(focusPos.r,focusPos.c);
    if (!isNavigable(active)) active = firstNavigableCell();
    if (active) {
      focusPos = {r:Number(active.dataset.r),c:Number(active.dataset.c)};
    }

    for (const cell of cells) {
      const r = Number(cell.dataset.r);
      const c = Number(cell.dataset.c);
      cell.setAttribute('role','gridcell');
      cell.setAttribute('aria-rowindex',String(r + 1));
      cell.setAttribute('aria-colindex',String(c + 1));
      cell.setAttribute('aria-label',describeCell(cell));
      cell.tabIndex = active === cell ? 0 : -1;
      if (cell.classList.contains('out')) cell.setAttribute('aria-disabled','true');
      else cell.removeAttribute('aria-disabled');
    }

    if (restoreFocus && active) active.focus({preventScroll:true});
  }

  function moveFocus(dr,dc) {
    let r = focusPos.r;
    let c = focusPos.c;
    for (let i=0;i<28;i++) {
      r += dr;
      c += dc;
      if (r < 0 || r > 27 || c < 0 || c > 27) return;
      const next = cellAt(r,c);
      if (!isNavigable(next)) continue;
      const current = cellAt(focusPos.r,focusPos.c);
      if (current) current.tabIndex = -1;
      focusPos = {r,c};
      next.tabIndex = 0;
      next.focus({preventScroll:true});
      return;
    }
  }

  board.addEventListener('focusin',e => {
    const cell = e.target?.closest?.('.cell');
    if (!cell || cell.parentElement !== board) return;
    focusPos = {r:Number(cell.dataset.r),c:Number(cell.dataset.c)};
  });

  board.addEventListener('keydown',e => {
    const cell = e.target?.closest?.('.cell');
    if (!cell || cell.parentElement !== board) return;

    if (e.key === 'ArrowLeft') {
      e.preventDefault(); e.stopPropagation(); moveFocus(0,-1); return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault(); e.stopPropagation(); moveFocus(0,1); return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault(); e.stopPropagation(); moveFocus(-1,0); return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault(); e.stopPropagation(); moveFocus(1,0); return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault(); e.stopPropagation();
      cell.click();
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault(); e.stopPropagation();
      cell.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2}));
    }
  });

  const previousRender = render;
  render = function(...args) {
    const active = document.activeElement;
    const restoreFocus = !!active?.classList?.contains('cell') && active.parentElement === board;
    if (restoreFocus) {
      focusPos = {r:Number(active.dataset.r),c:Number(active.dataset.c)};
    }
    const result = previousRender.apply(this,args);
    decorateBoard(restoreFocus);
    return result;
  };

  const optimizerProgress = document.getElementById('optimizerProgress');
  if (optimizerProgress) {
    optimizerProgress.setAttribute('role','status');
    optimizerProgress.setAttribute('aria-live','polite');
    optimizerProgress.setAttribute('aria-atomic','true');
  }

  const style = document.createElement('style');
  style.id = 'grid-keyboard-access-style';
  style.textContent = `
    #board .cell:focus-visible {
      outline: 3px solid var(--theme-accent)!important;
      outline-offset: -3px!important;
      z-index: 12!important;
    }
  `;
  document.head.appendChild(style);

  decorateBoard(false);
})();
