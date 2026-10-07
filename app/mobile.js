/* Touch and narrow-screen controls for the colony planner. */
(() => {
  if (window.__FOE_MOBILE_CONTROLS_V1__) return;
  window.__FOE_MOBILE_CONTROLS_V1__ = true;

  const TOUCH_HOLD_MS = 520;
  const MOVE_CANCEL_PX = 9;
  const touchPoints = new Map();
  let panPointerId = null;
  let panStartX = 0;
  let panStartY = 0;
  let panOriginX = 0;
  let panOriginY = 0;
  let touchPanMoved = false;
  let pinchActive = false;
  let pinchStartDistance = 0;
  let pinchStartZoom = 1;

  let holdTimer = 0;
  let holdPointerId = null;
  let holdTarget = null;
  let holdStartX = 0;
  let holdStartY = 0;
  let holdX = 0;
  let holdY = 0;
  let holdShown = false;
  let suppressTarget = null;
  let suppressUntil = 0;

  const mobileQuery = window.matchMedia("(max-width: 700px)");
  const mapWrap = document.querySelector(".map-wrap");
  const side = document.querySelector(".side");
  const sideToggle = document.getElementById("mobileSideToggle");

  function isMobileLayout() {
    return mobileQuery.matches;
  }

  function boardIntersectsMap() {
    if (!mapWrap) return true;
    const board = document.getElementById("board");
    if (!board || getComputedStyle(board).display === "none") return true;

    const boardRect = board.getBoundingClientRect();
    const mapRect = mapWrap.getBoundingClientRect();
    const padding = 18;

    return (
      boardRect.right > mapRect.left + padding &&
      boardRect.left < mapRect.right - padding &&
      boardRect.bottom > mapRect.top + padding &&
      boardRect.top < mapRect.bottom - padding
    );
  }

  function ensureMobileBoardVisible() {
    if (!isMobileLayout() || !mapWrap || document.body.classList.contains("home-mode")) return;
    if (boardIntersectsMap()) return;
    if (typeof panX === "undefined" || typeof panY === "undefined") return;

    panX = 0;
    panY = 0;
    if (typeof scheduleViewTransform === "function") scheduleViewTransform();
    if (typeof persistColonyState === "function" && typeof selectedEra !== "undefined") {
      setTimeout(() => persistColonyState(selectedEra), 0);
    }
  }

  function scheduleMobileBoardCheck() {
    if (!isMobileLayout()) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(ensureMobileBoardVisible);
    });
  }

  function setDrawer(open) {
    if (!side || !sideToggle) return;
    const next = !!open;
    side.classList.toggle("mobile-open", next);
    sideToggle.setAttribute("aria-expanded", String(next));
    const chevron = sideToggle.querySelector(".mobile-side-chevron");
    if (chevron) chevron.textContent = next ? "▼" : "▲";
  }

  function clearHoldTimer() {
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = 0;
  }

  function positionTouchTooltip(x, y) {
    const tip = document.getElementById("hoverTooltip");
    if (!tip || tip.hidden) return;
    const w = tip.offsetWidth || 180;
    const h = tip.offsetHeight || 30;
    let left = x - w / 2;
    let top = y - h - 28;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - h - 8));
    tip.style.left = left + "px";
    tip.style.top = top + "px";
  }

  function cellFromTarget(target) {
    const cell = target && target.closest ? target.closest(".cell") : null;
    return cell && cell.parentElement && cell.parentElement.id === "board" ? cell : null;
  }

  function tooltipTextFor(target) {
    if (!target) return "";

    const cell = cellFromTarget(target);
    if (cell && !cell.dataset.expansion) {
      const r = Number(cell.dataset.r);
      const c = Number(cell.dataset.c);
      if (Number.isInteger(r) && Number.isInteger(c) && typeof placedThingTooltip === "function") {
        return placedThingTooltip(r, c) || "";
      }
    }

    const titled = target.closest ? target.closest("[title]") : null;
    if (titled && titled.getAttribute("title")) return titled.getAttribute("title");

    return "";
  }

  function showLongPressTarget(target, x, y) {
    const buildItem = target && target.closest ? target.closest(".build-item") : null;
    if (buildItem) {
      buildItem.dispatchEvent(new MouseEvent("mouseenter", {
        bubbles: false,
        clientX: x,
        clientY: y
      }));
      positionTouchTooltip(x, y);
      return !document.getElementById("hoverTooltip").hidden;
    }

    const presetItem = target && target.closest ? target.closest(".preset-item") : null;
    if (presetItem) {
      presetItem.dispatchEvent(new window.PointerEvent("pointerenter", {
        bubbles: false,
        pointerType: "touch",
        clientX: x,
        clientY: y
      }));
      return true;
    }

    const text = tooltipTextFor(target);
    if (!text || typeof showHoverTooltip !== "function") return false;
    showHoverTooltip(text, { clientX: x, clientY: y });
    positionTouchTooltip(x, y);
    return true;
  }

  function startHold(e) {
    if (e.pointerType !== "touch" || e.button !== 0) return;
    clearHoldTimer();
    holdPointerId = e.pointerId;
    holdTarget = e.target;
    holdStartX = holdX = e.clientX;
    holdStartY = holdY = e.clientY;
    holdShown = false;

    const hasInfo =
      !!(e.target.closest && e.target.closest(".build-item, .preset-item, [title]")) ||
      !!tooltipTextFor(e.target);
    if (!hasInfo) return;

    holdTimer = setTimeout(() => {
      holdTimer = 0;
      if (!showLongPressTarget(holdTarget, holdX, holdY)) return;
      holdShown = true;
      suppressTarget = holdTarget;
      suppressUntil = performance.now() + 850;
      if (typeof suppressClickUntil !== "undefined") suppressClickUntil = performance.now() + 850;
    }, TOUCH_HOLD_MS);
  }

  function moveHold(e) {
    if (e.pointerId !== holdPointerId) return;
    holdX = e.clientX;
    holdY = e.clientY;
    if (Math.hypot(holdX - holdStartX, holdY - holdStartY) <= MOVE_CANCEL_PX) return;
    clearHoldTimer();
    if (holdShown && typeof hideHoverTooltip === "function") hideHoverTooltip();
    holdShown = false;
  }

  function endHold(e) {
    if (e.pointerId !== holdPointerId) return;
    clearHoldTimer();
    holdPointerId = null;
    if (holdShown && typeof hideHoverTooltip === "function") {
      setTimeout(hideHoverTooltip, 1200);
    }
    holdShown = false;
  }

  document.addEventListener("pointerdown", startHold, true);
  document.addEventListener("pointermove", moveHold, true);
  document.addEventListener("pointerup", endHold, true);
  document.addEventListener("pointercancel", endHold, true);

  // Touch has no hover. Stop the desktop board hover from firing on a tap.
  document.addEventListener("pointerover", (e) => {
    if (e.pointerType === "touch" && e.target.closest && e.target.closest("#board")) e.stopPropagation();
  }, true);
  document.addEventListener("pointerout", (e) => {
    if (e.pointerType === "touch" && e.target.closest && e.target.closest("#board")) e.stopPropagation();
  }, true);

  document.addEventListener("click", (e) => {
    if (performance.now() >= suppressUntil || !suppressTarget) return;
    const sameTarget = e.target === suppressTarget ||
      (suppressTarget.contains && suppressTarget.contains(e.target)) ||
      (e.target.contains && e.target.contains(suppressTarget));
    if (!sameTarget) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    suppressUntil = 0;
    suppressTarget = null;
  }, true);

  if (sideToggle) {
    sideToggle.addEventListener("click", () => {
      setDrawer(!side.classList.contains("mobile-open"));
    });
  }

  document.addEventListener("click", (e) => {
    if (!isMobileLayout()) return;
    if (e.target.closest && e.target.closest(".build-item")) setDrawer(false);
    if (e.target.closest && e.target.closest(".era-btn")) {
      setDrawer(false);
      scheduleMobileBoardCheck();
    }
  });

  mobileQuery.addEventListener && mobileQuery.addEventListener("change", (e) => {
    if (!e.matches) {
      setDrawer(false);
      return;
    }
    scheduleMobileBoardCheck();
  });

  window.addEventListener("resize", scheduleMobileBoardCheck);

  function distance(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  if (mapWrap) {
    mapWrap.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "touch" || e.button !== 0) return;
      if (typeof isEditableColonyEra === "function" && !isEditableColonyEra(selectedEra)) return;

      e.stopImmediatePropagation();
      touchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { mapWrap.setPointerCapture(e.pointerId); } catch {}

      if (touchPoints.size === 1) {
        panPointerId = e.pointerId;
        panStartX = e.clientX;
        panStartY = e.clientY;
        panOriginX = panX;
        panOriginY = panY;
        touchPanMoved = false;
        pinchActive = false;
      } else if (touchPoints.size === 2) {
        const points = Array.from(touchPoints.values());
        pinchActive = true;
        pinchStartDistance = distance(points[0], points[1]);
        pinchStartZoom = viewZoom;
        panPointerId = null;
        touchPanMoved = false;
        clearHoldTimer();
        if (typeof hideHoverTooltip === "function") hideHoverTooltip();
        if (typeof hidePlacementPreview === "function") hidePlacementPreview();
        if (typeof hideFloatingPlacementPreview === "function") hideFloatingPlacementPreview();
        suppressClickUntil = performance.now() + 300;
      }
    }, true);

    mapWrap.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "touch" || !touchPoints.has(e.pointerId)) return;
      e.stopImmediatePropagation();
      touchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pinchActive && touchPoints.size >= 2) {
        const points = Array.from(touchPoints.values());
        const currentDistance = distance(points[0], points[1]);
        if (pinchStartDistance > 0) {
          viewZoom = Math.max(0.55, Math.min(2.5, pinchStartZoom * currentDistance / pinchStartDistance));
          suppressClickUntil = performance.now() + 250;
          scheduleViewTransform();
        }
        return;
      }

      if (panPointerId !== e.pointerId) return;
      const dx = e.clientX - panStartX;
      const dy = e.clientY - panStartY;
      if (!touchPanMoved && Math.hypot(dx, dy) > 6) {
        touchPanMoved = true;
        clearHoldTimer();
        mapWrap.classList.add("is-panning");
        if (typeof hideHoverTooltip === "function") hideHoverTooltip();
        if (typeof hidePlacementPreview === "function") hidePlacementPreview();
        if (typeof hideFloatingPlacementPreview === "function") hideFloatingPlacementPreview();
      }
      if (!touchPanMoved) return;

      const factor = Number(appSettings.panSensitivity || 100) / 100;
      panX = panOriginX + dx * factor;
      panY = panOriginY + dy * factor;
      suppressClickUntil = performance.now() + 160;
      scheduleViewTransform();
    }, true);

    const finishMapTouch = (e) => {
      if (e.pointerType !== "touch" || !touchPoints.has(e.pointerId)) return;
      e.stopImmediatePropagation();
      touchPoints.delete(e.pointerId);
      try {
        if (mapWrap.hasPointerCapture(e.pointerId)) mapWrap.releasePointerCapture(e.pointerId);
      } catch {}

      if (pinchActive) {
        suppressClickUntil = performance.now() + 250;
        if (touchPoints.size < 2) {
          pinchActive = false;
          pinchStartDistance = 0;
          if (touchPoints.size === 1) {
            const entry = Array.from(touchPoints.entries())[0];
            panPointerId = entry[0];
            panStartX = entry[1].x;
            panStartY = entry[1].y;
            panOriginX = panX;
            panOriginY = panY;
            touchPanMoved = false;
          } else {
            panPointerId = null;
          }
          if (typeof persistColonyState === "function") persistColonyState(selectedEra);
        }
        return;
      }

      if (panPointerId === e.pointerId) {
        if (touchPanMoved) suppressClickUntil = performance.now() + 180;
        panPointerId = null;
        touchPanMoved = false;
        mapWrap.classList.remove("is-panning");
        if (typeof persistColonyState === "function") persistColonyState(selectedEra);
      }
    };

    mapWrap.addEventListener("pointerup", finishMapTouch, true);
    mapWrap.addEventListener("pointercancel", finishMapTouch, true);
  }
})();
