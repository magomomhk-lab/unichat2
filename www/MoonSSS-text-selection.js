// MoonSSS-text-selection.js – логика работы текстового выделение, округления, стабилизация и так далее

(() => {
  'use strict';

  let container = null;
  let scroller = null;
  let svg = null;
  let pathGlobal = null;
  let pathUser = null;
  let pathAi = null;

  const cfg = { radius: 7, padX: 2.5, padY: 1.5, joinGap: 16 };
  let raf = 0;

  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(render);
  };

  const forceRender = () => {
    schedule();
  };

  function bindElements() {
    container = document.querySelector('.chat-inner');
    scroller = document.getElementById('chatScroll');
    svg = document.getElementById('sel-layer');
    if (svg) {
      pathGlobal = svg.querySelector('.sel-path-global');
      pathUser = svg.querySelector('.sel-path-user');
      pathAi = svg.querySelector('.sel-path-ai');

      if (!pathGlobal) {
        pathGlobal = svg.querySelector('path:not(.sel-path-user):not(.sel-path-ai)');
        if (!pathGlobal) {
          pathGlobal = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          svg.appendChild(pathGlobal);
        }
        pathGlobal.setAttribute('class', 'sel-path-global');
      }
      if (!pathUser) {
        pathUser = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        pathUser.setAttribute('class', 'sel-path-user');
        svg.appendChild(pathUser);
      }
      if (!pathAi) {
        pathAi = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        pathAi.setAttribute('class', 'sel-path-ai');
        svg.appendChild(pathAi);
      }
    }
    return !!(container && svg && pathGlobal && pathUser && pathAi);
  }

  /* ---------- 1. Сбор прямоугольников по текстовым узлам чата с классификацией ---------- */
  function collectRects(range, outByType) {
    if (!container || !range.intersectsNode(container)) return;
    let root = range.commonAncestorContainer;
    if (!container.contains(root)) root = container;
    if (root.nodeType === 3) root = root.parentNode;

    const sub = document.createRange();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: n => {
        if (!n.nodeValue || !n.nodeValue.trim() || !range.intersectsNode(n) || !container.contains(n)) {
          return NodeFilter.FILTER_REJECT;
        }
        const parent = n.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        // Исключаем служебные блоки интерфейса, номера строк, кнопки и контейнер редактирования из контура выделения
        if (parent.closest('.code-tools, .code-lines, .msg-actions, button, .icon-btn, .cbtn, .scrolldown, #sel-layer, .sp-field, .set-card, input, textarea, .msg-edit')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    let node;
    while ((node = walker.nextNode())) {
      const start = node === range.startContainer ? range.startOffset : 0;
      const end = node === range.endContainer ? range.endOffset : node.length;
      if (start >= end) continue;
      try {
        sub.setStart(node, start);
        sub.setEnd(node, end);
        const rs = sub.getClientRects();
        if (!rs.length) continue;

        const parentEl = node.parentElement;
        let type = 'global';
        if (parentEl) {
          if (parentEl.closest('.msg.user')) type = 'user';
          else if (parentEl.closest('.msg.ai')) type = 'ai';
        }

        for (let i = 0; i < rs.length; i++) {
          const r = rs[i];
          if (r.width > 0.5 && r.height > 0.5) {
            outByType[type].push(r);
          }
        }
      } catch (_) { }
    }
  }

  /* ---------- 2. Группировка в строки ---------- */
  function buildLines(rects, ox, oy) {
    rects.sort((a, b) => a.top - b.top || a.left - b.left);
    const lines = [];
    for (const r of rects) {
      const top = r.top - oy, bottom = r.bottom - oy;
      const left = r.left - ox, right = r.right - ox;
      const cy = (top + bottom) / 2;
      let line = null;
      for (let i = lines.length - 1; i >= 0 && i >= lines.length - 3; i--) {
        const l = lines[i];
        if (cy > l.top && cy < l.bottom) { line = l; break; }
      }
      if (line) {
        line.left = Math.min(line.left, left);
        line.right = Math.max(line.right, right);
        line.top = Math.min(line.top, top);
        line.bottom = Math.max(line.bottom, bottom);
      } else {
        lines.push({ left, right, top, bottom });
      }
    }
    lines.sort((a, b) => a.top - b.top);
    for (const l of lines) {
      l.left -= cfg.padX; l.right += cfg.padX;
      l.top -= cfg.padY; l.bottom += cfg.padY;
    }
    return lines;
  }

  /* ---------- 3. Сшивание строк в цепочки ---------- */
  function buildChains(lines) {
    const chains = [];
    let chain = null;
    const r = cfg.radius;
    for (const line of lines) {
      const prev = chain && chain[chain.length - 1];
      if (prev) {
        const gap = line.top - prev.bottom;
        const overlap = Math.min(prev.right, line.right) - Math.max(prev.left, line.left);
        if (gap < cfg.joinGap && overlap > Math.max(4, r * 1.5)) {
          const mid = (prev.bottom + line.top) / 2;
          prev.bottom = mid; line.top = mid;
          if (Math.abs(line.left - prev.left) < 2) line.left = prev.left;
          if (Math.abs(line.right - prev.right) < 2) line.right = prev.right;
          chain.push(line);
          continue;
        }
      }
      chain = [line];
      chains.push(chain);
    }
    return chains;
  }

  /* ---------- 4. Построение многоугольника цепочки ---------- */
  function chainPolygon(chain) {
    const pts = [];
    for (const l of chain) { pts.push([l.right, l.top], [l.right, l.bottom]); }
    for (let i = chain.length - 1; i >= 0; i--) {
      const l = chain[i];
      pts.push([l.left, l.bottom], [l.left, l.top]);
    }
    let clean = [];
    for (const p of pts) {
      const q = clean[clean.length - 1];
      if (!q || Math.abs(q[0] - p[0]) > 0.3 || Math.abs(q[1] - p[1]) > 0.3) clean.push(p);
    }
    if (clean.length > 1) {
      const f = clean[0], l = clean[clean.length - 1];
      if (Math.abs(f[0] - l[0]) <= 0.3 && Math.abs(f[1] - l[1]) <= 0.3) clean.pop();
    }
    let changed = true;
    while (changed && clean.length > 3) {
      changed = false;
      for (let i = 0; i < clean.length; i++) {
        const a = clean[(i - 1 + clean.length) % clean.length];
        const b = clean[i];
        const c = clean[(i + 1) % clean.length];
        const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
        if (Math.abs(cross) < 0.01) { clean.splice(i, 1); changed = true; break; }
      }
    }
    return clean;
  }

  /* ---------- 5. Скругление углов Безье ---------- */
  const K = 0.5523;
  const f = n => Math.round(n * 10) / 10;

  function roundedPath(p, r) {
    const n = p.length;
    if (n < 3) return '';
    let d = '';
    for (let i = 0; i < n; i++) {
      const cur = p[i], prev = p[(i - 1 + n) % n], next = p[(i + 1) % n];
      const v1x = prev[0] - cur[0], v1y = prev[1] - cur[1];
      const v2x = next[0] - cur[0], v2y = next[1] - cur[1];
      const l1 = Math.hypot(v1x, v1y) || 1, l2 = Math.hypot(v2x, v2y) || 1;
      const rad = Math.min(r, l1 / 2, l2 / 2);
      const ax = cur[0] + v1x / l1 * rad, ay = cur[1] + v1y / l1 * rad;
      const bx = cur[0] + v2x / l2 * rad, by = cur[1] + v2y / l2 * rad;
      const c1x = ax + (cur[0] - ax) * K, c1y = ay + (cur[1] - ay) * K;
      const c2x = bx + (cur[0] - bx) * K, c2y = by + (cur[1] - by) * K;
      d += (i === 0 ? 'M' : 'L') + f(ax) + ' ' + f(ay) +
        'C' + f(c1x) + ' ' + f(c1y) + ' ' + f(c2x) + ' ' + f(c2y) + ' ' + f(bx) + ' ' + f(by);
    }
    return d + 'Z';
  }

  /* ---------- 6. Рендер в SVG-слой ---------- */
  function render() {
    raf = 0;
    if (!svg || !pathGlobal || !pathUser || !pathAi || !container) {
      if (!bindElements()) return;
    }

    const sel = document.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      if (svg) svg.classList.remove('on');
      return;
    }

    // Игнорируем выделение внутри любых полей ввода, текстовых зон и редактора сообщений
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
      if (svg) {
        svg.classList.remove('on');
        if (pathGlobal) pathGlobal.setAttribute('d', '');
        if (pathUser) pathUser.setAttribute('d', '');
        if (pathAi) pathAi.setAttribute('d', '');
      }
      return;
    }

    const rectsByType = { user: [], ai: [], global: [] };
    for (let i = 0; i < sel.rangeCount; i++) collectRects(sel.getRangeAt(i), rectsByType);

    const total = rectsByType.user.length + rectsByType.ai.length + rectsByType.global.length;
    if (!total) {
      if (svg) svg.classList.remove('on');
      return;
    }

    const base = container.getBoundingClientRect();
    const renderType = (type, pathNode) => {
      const list = rectsByType[type];
      if (!list.length) {
        pathNode.setAttribute('d', '');
        return;
      }
      const lines = buildLines(list, base.left, base.top);
      const chains = buildChains(lines);
      let d = '';
      for (const ch of chains) d += roundedPath(chainPolygon(ch), cfg.radius);
      pathNode.setAttribute('d', d);
    };

    renderType('global', pathGlobal);
    renderType('user', pathUser);
    renderType('ai', pathAi);

    if (!svg.classList.contains('on')) svg.classList.add('on');
  }

  function init() {
    bindElements();
    document.addEventListener('selectionchange', schedule);
    document.addEventListener('touchend', schedule, { passive: true });
    document.addEventListener('pointerup', schedule, { passive: true });

    if (scroller) {
      scroller.addEventListener('scroll', schedule, { passive: true });
    }
    window.addEventListener('resize', forceRender, { passive: true });
    window.addEventListener('orientationchange', forceRender, { passive: true });

    if (container && typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(forceRender).observe(container);
    }
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(forceRender);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.moonSelectionController = {
    forceRender,
    setRadius: (r) => { cfg.radius = Math.max(2, Math.min(24, r)); forceRender(); },
    setPadding: (px, py) => { cfg.padX = px; cfg.padY = py; forceRender(); },
    clear: () => {
      if (pathGlobal) pathGlobal.setAttribute('d', '');
      if (pathUser) pathUser.setAttribute('d', '');
      if (pathAi) pathAi.setAttribute('d', '');
      if (svg) svg.classList.remove('on');
    }
  };
})();