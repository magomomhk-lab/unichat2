(() => {
  'use strict';
  if (window.__WARP_NAV__) return;
  window.__WARP_NAV__ = true;

  /* ── КОНФИГУРАЦИЯ ────────────────────────────────────────────────────
     url  — адрес страницы: index.html, pages/about.html, https://...
     icon — путь к вашему файлу: img/home.svg, img/about.png и т.д.
     Если файла иконки нет — автоматически подставится буквенная
     заглушка (первая буква названия), дизайн не сломается.            */
  const WARP_SITES = [
    { name: 'Главная', url: 'index.html', icon: 'favicon.ico' },
    { name: 'AI', url: 'ai.html', icon: 'claude-color.svg' },
    { name: 'IDE Agent', url: 'note.html', icon: 'perplexity-color.svg' },
    { name: 'RP – AI', url: 'roleplay.html', icon: 'uni.png' },
    { name: 'Music', url: 'music.html', icon: 'music.png' },
    { name: 'IMG test', url: 'imgenerate2.html', icon: 'FLUX.png' }
  ];

  const ARROW_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M9.5 7H17v7.5"/></svg>';
  const GLYPH_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.6" opacity=".28"/><path d="M12 3.4a8.6 8.6 0 0 1 8.6 8.6"/><path d="M12 20.6A8.6 8.6 0 0 1 3.4 12"/><circle cx="12" cy="12" r="3.4"/></svg>';

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const WARP_CSS = `
    :host{
      position:fixed; top:0; left:0; width:100%; height:100%; z-index:2147483646;
      pointer-events:none;
      font-family:'Manrope',-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;
      -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility;
    }
    *{ box-sizing:border-box; margin:0; padding:0; }
    button,a{ font:inherit; color:inherit; }

    /* ── ТРИГГЕР: ВЕРТИКАЛЬНАЯ БОКОВАЯ ПОЛОСКА ── */
    .w-trigger{
      pointer-events:auto; position:fixed;
      top:50%; transform:translateY(-50%) scale(1);
      width:5px; height:68px;
      border:none; outline:none; cursor:pointer; touch-action:none;
      user-select:none; -webkit-user-select:none;
      background:linear-gradient(180deg, hsla(212, 100%, 70%, 0.3) 0%, hsla(212, 100%, 88%, 0.9) 50%, hsla(212, 100%, 70%, 0.3) 100%);
      box-shadow:0 0 14px hsla(212, 100%, 75%, 0.45);
      transition:
        width .24s cubic-bezier(.16,1,.3,1),
        height .24s cubic-bezier(.16,1,.3,1),
        background .2s ease,
        box-shadow .2s ease,
        opacity .28s cubic-bezier(.16,1,.3,1),
        transform .28s cubic-bezier(.16,1,.3,1);
      will-change:top, width, height, transform, opacity;
    }

    :host([data-side="right"]) .w-trigger{
      right:0; left:auto;
      transform-origin:right center;
      border-radius:6px 0 0 6px;
      box-shadow:-2px 0 14px hsla(212, 100%, 75%, 0.45);
    }
    :host([data-side="left"]) .w-trigger{
      left:0; right:auto;
      transform-origin:left center;
      border-radius:0 6px 6px 0;
      box-shadow:2px 0 14px hsla(212, 100%, 75%, 0.45);
    }

    /* Увеличенная зона взаимодействия пальцем / курсором */
    .w-trigger::before{
      content:''; position:absolute;
      top:-16px; bottom:-16px; width:34px;
    }
    :host([data-side="right"]) .w-trigger::before{ right:0; }
    :host([data-side="left"]) .w-trigger::before{ left:0; }

    @media (hover:hover) and (pointer:fine){
      .w-trigger:hover{
        width:8px; height:82px;
        background:linear-gradient(180deg, hsla(212, 100%, 80%, 0.6) 0%, hsla(0, 0%, 100%, 0.95) 50%, hsla(212, 100%, 80%, 0.6) 100%);
        box-shadow:0 0 20px hsla(212, 100%, 80%, 0.65);
      }
    }

    /* Режим зажатия для перетаскивания (Holding / Dragging) */
    :host(.holding) .w-trigger{
      width:10px; height:92px;
      cursor:ns-resize;
      background:#ffffff;
      box-shadow:0 0 24px hsla(212, 100%, 85%, 0.95), 0 0 6px hsla(212, 100%, 65%, 1);
    }

    .w-trigger:focus-visible{
      outline:2px solid hsla(212, 100%, 80%, 0.9);
      outline-offset:3px;
    }

    :host(.open) .w-trigger{
      opacity:0; pointer-events:none;
      transform:translateY(-50%) scale(0.85);
    }

    .w-glyph{ display:none; }

    /* ── ПАНЕЛЬ: БОКОВОЙ ВЫДВИЖНОЙ САПФИРОВЫЙ ДОК ── */
    .w-panel{
      pointer-events:none; position:fixed;
      top:50%; width:214px; max-height:calc(100vh - 36px);
      border-radius:18px; overflow:hidden;
      background:linear-gradient(168deg, hsla(222, 26%, 10%, 0.85) 0%, hsla(222, 40%, 6%, 0.96) 100%);
      -webkit-backdrop-filter:blur(32px) saturate(190%);
      backdrop-filter:blur(32px) saturate(190%);
      border:1px solid hsla(0, 0%, 100%, 0.11);
      box-shadow:
        inset 0 1px 1.5px 0 hsla(0, 0%, 100%, 0.22),
        inset 0 -1px 2px 0 hsla(222, 50%, 6%, 0.4),
        0 24px 50px -10px hsla(0, 0%, 0%, 0.85),
        0 8px 24px -4px hsla(212, 100%, 50%, 0.12);
      opacity:0; visibility:hidden;
      will-change:transform, opacity;
      transition:
        opacity .28s cubic-bezier(.16,1,.3,1),
        transform .32s cubic-bezier(.16,1,.3,1),
        visibility 0s linear .32s;
      user-select:none; -webkit-user-select:none;
      touch-action:pan-y;
    }

    :host([data-side="right"]) .w-panel{
      right:14px; left:auto;
      transform-origin:right center;
      transform:translateX(32px) scale(0.94);
    }
    :host([data-side="right"]) .w-panel.open{
      opacity:1; visibility:visible; pointer-events:auto;
      transform:translateX(0) scale(1);
      transition:
        opacity .32s cubic-bezier(.16,1,.3,1),
        transform .32s cubic-bezier(.16,1,.3,1),
        visibility 0s linear 0s;
    }

    :host([data-side="left"]) .w-panel{
      left:14px; right:auto;
      transform-origin:left center;
      transform:translateX(-32px) scale(0.94);
    }
    :host([data-side="left"]) .w-panel.open{
      opacity:1; visibility:visible; pointer-events:auto;
      transform:translateX(0) scale(1);
      transition:
        opacity .32s cubic-bezier(.16,1,.3,1),
        transform .32s cubic-bezier(.16,1,.3,1),
        visibility 0s linear 0s;
    }

    /* Блокировка кликов во время анимации открытия */
    .w-panel.w-opening .w-tile,
    .w-panel:not(.open) .w-tile{
      pointer-events:none !important;
    }

    .w-drag-handle{ display:none; }

    .w-head{
      display:flex; align-items:center; justify-content:space-between;
      padding:10px 12px 8px 14px;
      border-bottom:1px solid hsla(0, 0%, 100%, 0.06);
    }
    .w-title{
      display:flex; align-items:center; gap:6px; font-size:9.5px; font-weight:800;
      letter-spacing:.14em; text-transform:uppercase; color:hsla(0, 0%, 75%, 0.65);
    }
    .w-title svg{
      width:12px; height:12px; color:hsla(212, 100%, 82%, 1);
      filter:drop-shadow(0 0 6px hsla(212, 100%, 80%, 0.4));
    }
    .w-title b{ color:#ffffff; font-weight:800; }
    
    .w-close{
      width:22px; height:22px; display:grid; place-items:center; border-radius:7px;
      border:1px solid transparent; background:hsla(0, 0%, 100%, 0.04);
      cursor:pointer; color:hsla(0, 0%, 70%, 0.75);
      transition:all .2s cubic-bezier(.16,1,.3,1);
    }
    .w-close:hover{
      background:hsla(0, 0%, 100%, 0.1); color:#ffffff; border-color:hsla(0, 0%, 100%, 0.15);
      transform:scale(1.05);
    }
    .w-close:active{ transform:scale(0.92); }
    .w-close:focus-visible{ outline:2px solid hsla(212, 100%, 84%, 0.9); outline-offset:1px; }
    .w-close svg{ width:11px; height:11px; }

    /* Вертикальный список сайтов */
    .w-grid{
      display:flex; flex-direction:column; gap:4px;
      padding:8px 8px 10px;
      max-height:calc(100vh - 120px);
      overflow-y:auto; overscroll-behavior-y:contain;
      scrollbar-width:none;
    }
    .w-grid::-webkit-scrollbar{ display:none; }

    .w-tile{
      position:relative; display:flex; align-items:center; gap:10px;
      padding:7px 10px; border-radius:10px; text-decoration:none;
      background:hsla(0, 0%, 100%, 0.02);
      border:1px solid hsla(0, 0%, 100%, 0.05);
      transition:
        background .18s cubic-bezier(.16,1,.3,1),
        border-color .18s cubic-bezier(.16,1,.3,1),
        transform .18s cubic-bezier(.16,1,.3,1);
    }
    .w-tile:hover{
      background:hsla(212, 100%, 65%, 0.12);
      border-color:hsla(212, 100%, 75%, 0.32);
      transform:translateX(-2px);
    }
    :host([data-side="left"]) .w-tile:hover{
      transform:translateX(2px);
    }
    .w-tile:active{ transform:scale(0.97); }
    .w-tile:focus-visible{ outline:2px solid hsla(212, 100%, 84%, 0.85); outline-offset:1px; }
    
    .w-tile.active{
      background:hsla(212, 100%, 65%, 0.16);
      border-color:hsla(212, 100%, 75%, 0.5);
      box-shadow:inset 0 1px 1px hsla(0, 0%, 100%, 0.15);
    }

    .w-icon{
      width:28px; height:28px; display:grid; place-items:center; border-radius:8px;
      overflow:hidden; background:hsla(0, 0%, 100%, 0.04);
      border:1px solid hsla(0, 0%, 100%, 0.09);
      flex-shrink:0;
    }
    .w-icon img{ width:18px; height:18px; object-fit:contain; filter:drop-shadow(0 2px 4px hsla(0,0%,0%,0.4)); }
    .w-letter{ font-size:12px; font-weight:800; color:hsla(212, 100%, 86%, 1); }
    
    .w-name{
      font-size:11.5px; line-height:1.2; font-weight:600; letter-spacing:.01em;
      color:hsla(0, 0%, 92%, 0.95); white-space:nowrap; text-overflow:ellipsis;
      overflow:hidden; flex-grow:1; text-align:left;
    }
    
    .w-badge{
      width:14px; height:14px; display:grid; place-items:center;
      color:hsla(0, 0%, 60%, 0.4); flex-shrink:0;
    }
    .w-tile:hover .w-badge{ color:hsla(212, 100%, 85%, 1); }
    .w-badge svg{ width:12px; height:12px; }
    .w-dot{
      width:5px; height:5px; border-radius:50%;
      background:hsla(212, 100%, 80%, 1);
      box-shadow:0 0 8px hsla(212, 100%, 75%, 0.9);
    }

    .w-hint{ display:none; }
    .w-fx{ display:none; }

    @keyframes w-launch{
      0%{ transform:scale(1); filter:brightness(1); }
      100%{ transform:scale(.92); filter:brightness(1.4); opacity:.6; }
    }
    .w-tile.warping{ animation:w-launch .26s cubic-bezier(.16,1,.3,1) forwards; }

    @media (prefers-reduced-motion: reduce){
      *, *::before, *::after{ transition-duration:.01ms !important; animation:none !important; }
    }
  `;

  /* ── IndexedDB: позиция кнопки, кроссплатформенно и без падений ── */
  class DatabaseController {
    constructor() { this._db = null; this._mem = new Map(); this._ready = null; this.DB = 'warp-nav-db'; this.STORE = 'kv'; }
    init() {
      if (this._ready) return this._ready;
      this._ready = new Promise(resolve => {
        try {
          if (typeof indexedDB === 'undefined') throw new Error('IndexedDB unavailable');
          const req = indexedDB.open(this.DB, 1);
          req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(this.STORE)) db.createObjectStore(this.STORE, { keyPath: 'key' });
          };
          req.onsuccess = () => { this._db = req.result; resolve(); };
          req.onerror = () => resolve();   // тихий fallback в память
          req.onblocked = () => resolve();
        } catch (e) { resolve(); }
      });
      return this._ready;
    }
    async get(key) {
      await this.init();
      if (!this._db) return this._mem.get(key);
      return new Promise(resolve => {
        try {
          const rq = this._db.transaction(this.STORE, 'readonly').objectStore(this.STORE).get(key);
          rq.onsuccess = () => resolve(rq.result ? rq.result.value : undefined);
          rq.onerror = () => resolve(this._mem.get(key));
        } catch (e) { resolve(this._mem.get(key)); }
      });
    }
    async set(key, value) {
      await this.init();
      this._mem.set(key, value);
      if (!this._db) return;
      return new Promise(resolve => {
        try {
          const tx = this._db.transaction(this.STORE, 'readwrite');
          tx.objectStore(this.STORE).put({ key, value });
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
          tx.onabort = () => resolve();
        } catch (e) { resolve(); }
      });
    }
  }

  class UIState {
    constructor() {
      this.open = false;
      this.reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
  }

  /* ── Главный контроллер ── */
  class WarpApp {
    constructor(sites) {
      this.sites = sites.slice(0, 6);
      this.db = new DatabaseController();
      this.state = new UIState();
      this.side = 'right'; // 'right' | 'left'
      this.pos = { y: window.innerHeight / 2 };
      this.HEIGHT = 68;
      this.MARGIN = 20;
      this._pt = null;
      this._lockUntil = 0;
      this._openingTimer = null;
      this._isKeyboardOpen = false;
    }

    async init() {
      this._build();
      this._bind();
      await this.db.init();
      const saved = await this.db.get('side_pos');
      if (saved) {
        if (saved.side === 'left' || saved.side === 'right') this._setSide(saved.side);
        if (typeof saved.yRatio === 'number') this._moveToY(saved.yRatio * window.innerHeight);
      } else {
        this._setSide('right');
        this._moveToY(window.innerHeight * 0.5);
      }
    }

    _build() {
      const host = document.createElement('div');
      host.id = 'warp-nav';
      document.body.appendChild(host);
      this.host = host;
      this.host.setAttribute('data-side', this.side);
      const root = host.attachShadow({ mode: 'open' });
      this.shadow = root;
      root.innerHTML = `
        <style>${WARP_CSS}</style>
        <button class="w-trigger" type="button" aria-haspopup="dialog" aria-expanded="false"
                aria-controls="warp-panel" aria-label="Warp: навигация. Нажмите для открытия, удерживайте для перетаскивания.">
          ${GLYPH_SVG.replace('<svg ', '<svg class="w-glyph" ')}
        </button>
        <aside class="w-panel" id="warp-panel" role="dialog" aria-label="Warp: выбор сайта" aria-hidden="true">
          <header class="w-head">
            <span class="w-title">${GLYPH_SVG}<b>WARP</b><span>Dock</span></span>
            <button class="w-close" type="button" aria-label="Закрыть панель">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>
            </button>
          </header>
          <nav class="w-grid" aria-label="Список сайтов"></nav>
        </aside>`;
      this.trigger = root.querySelector('.w-trigger');
      this.panel = root.querySelector('.w-panel');
      this.grid = root.querySelector('.w-grid');
      this._renderTiles();
    }

    _setSide(side) {
      this.side = side;
      this.host.setAttribute('data-side', side);
    }

    _moveToY(y) {
      const half = this.HEIGHT / 2;
      const minY = half + this.MARGIN;
      const maxY = window.innerHeight - half - this.MARGIN;
      this.pos.y = Math.max(minY, Math.min(y, maxY));
      this.trigger.style.top = `${this.pos.y}px`;
      if (this.state.open) this._placePanel();
    }

    _placePanel() {
      const p = this.panel;
      const ph = p.offsetHeight || 280;
      const targetY = this.pos.y - ph / 2;
      const minY = 16;
      const maxY = window.innerHeight - ph - 16;
      p.style.top = `${Math.max(minY, Math.min(targetY, maxY))}px`;
    }

    _persist() {
      clearTimeout(this._pt);
      this._pt = setTimeout(() => {
        this.db.set('side_pos', {
          side: this.side,
          yRatio: this.pos.y / window.innerHeight
        });
      }, 120);
    }

    _renderTiles() {
      let isTouchScrolling = false;
      let scrollStartY = 0;

      this.grid.addEventListener('touchstart', e => {
        if (e.touches.length === 1) {
          scrollStartY = e.touches[0].clientY;
          isTouchScrolling = false;
        }
      }, { passive: true });

      this.grid.addEventListener('touchmove', e => {
        if (e.touches.length === 1) {
          if (Math.abs(e.touches[0].clientY - scrollStartY) > 6) {
            isTouchScrolling = true;
          }
        }
      }, { passive: true });

      this.sites.forEach(site => {
        const active = this._isActive(site.url);
        const a = document.createElement('a');
        a.className = 'w-tile' + (active ? ' active' : '');
        a.href = site.url;
        if (active) a.setAttribute('aria-current', 'page');
        a.innerHTML = `
          <span class="w-badge" aria-hidden="true">${active ? '<span class="w-dot"></span>' : ARROW_SVG}</span>
          <span class="w-icon">
            <img src="${esc(site.icon)}" alt="" draggable="false">
            <span class="w-letter" hidden>${esc((site.name || '?').trim().charAt(0).toUpperCase())}</span>
          </span>
          <span class="w-name">${esc(site.name)}</span>`;
        const img = a.querySelector('img'), letter = a.querySelector('.w-letter');
        img.addEventListener('error', () => { img.remove(); letter.hidden = false; }, { once: true });

        a.addEventListener('click', e => {
          // Защита от случайного нажатия при открытии и при скролле списка
          if (performance.now() < this._lockUntil || isTouchScrolling) {
            e.preventDefault();
            e.stopImmediatePropagation();
            return;
          }
          if (active) {
            e.preventDefault();
            return;
          }
          if (!this.state.reducedMotion) a.classList.add('warping');
        });

        this.grid.appendChild(a);
      });
    }

    _isActive(url) {
      const seg = u => {
        try {
          const p = new URL(u, location.href).pathname;
          const s = p.split('/').filter(Boolean).pop();
          return (s || 'index.html').toLowerCase();
        } catch (e) { return String(u).toLowerCase(); }
      };
      return seg(url) === seg(location.href);
    }

    _bind() {
      const tg = this.trigger;
      const panel = this.panel;

      let holdTimer = null;
      let isHolding = false;
      let isSwiped = false;
      let startX = 0;
      let startY = 0;
      let pointerId = null;

      /* Обработка нажатия / зажатия / свайпа */
      tg.addEventListener('pointerdown', e => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        this._isKeyboardOpen = false;
        pointerId = e.pointerId;
        startX = e.clientX;
        startY = e.clientY;
        isHolding = false;
        isSwiped = false;

        // Таймер удержания (220ms для перехода в режим перетаскивания)
        holdTimer = setTimeout(() => {
          isHolding = true;
          this.host.classList.add('holding');
          try { tg.setPointerCapture(pointerId); } catch (_) {}
          // Виброотклик для мобильных (Capacitor/Android)
          if (navigator.vibrate) try { navigator.vibrate(25); } catch (_) {}
        }, 220);
      });

      tg.addEventListener('pointermove', e => {
        if (pointerId === null || e.pointerId !== pointerId) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        if (!isHolding) {
          // Если палец двигается до истечения таймера удержания — проверяем свайп
          if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
            clearTimeout(holdTimer);

            // Свайп внутрь экрана для открытия
            const inwardSwipe = (this.side === 'right' && dx < -18) || (this.side === 'left' && dx > 18);
            if (inwardSwipe && Math.abs(dx) > Math.abs(dy)) {
              isSwiped = true;
              this.open();
            }
          }
        } else {
          // Режим перетаскивания: следуем за Y-координатой
          e.preventDefault();
          this._moveToY(e.clientY);

          // Перемещение между левой и правой стороной экрана
          if (e.clientX < window.innerWidth * 0.25 && this.side !== 'left') {
            this._setSide('left');
          } else if (e.clientX > window.innerWidth * 0.75 && this.side !== 'right') {
            this._setSide('right');
          }
        }
      });

      const onPointerEnd = e => {
        if (pointerId === null || e.pointerId !== pointerId) return;
        clearTimeout(holdTimer);
        const wasHolding = isHolding;
        const wasSwiped = isSwiped;

        if (isHolding) {
          try { tg.releasePointerCapture(pointerId); } catch (_) {}
          this.host.classList.remove('holding');
          this._persist();
        }

        pointerId = null;
        isHolding = false;
        isSwiped = false;

        // Если это был короткий клик/тап (не удержание и не свайп)
        if (!wasHolding && !wasSwiped) {
          if (e.cancelable && e.pointerType !== 'mouse') {
            e.preventDefault(); // Предотвращает сквозной click на мобильных WebView
          }
          this.toggle();
        }
      };

      tg.addEventListener('pointerup', onPointerEnd);
      tg.addEventListener('pointercancel', onPointerEnd);

      /* Клавиатурное открытие (Enter / Space) */
      tg.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this._isKeyboardOpen = true;
          this.toggle();
        }
      });

      /* Свайп к краю экрана по самой панели для закрытия */
      let panelStartX = 0;
      panel.addEventListener('touchstart', e => {
        if (e.touches.length !== 1) return;
        panelStartX = e.touches[0].clientX;
      }, { passive: true });

      panel.addEventListener('touchmove', e => {
        if (e.touches.length !== 1) return;
        const dx = e.touches[0].clientX - panelStartX;
        const outwardSwipe = (this.side === 'right' && dx > 26) || (this.side === 'left' && dx < -26);
        if (outwardSwipe) {
          this.close();
        }
      }, { passive: true });

      /* Закрытие по крестику и Escape */
      this.shadow.querySelector('.w-close').addEventListener('click', () => {
        this.close();
        this.trigger.focus({ preventScroll: true });
      });

      document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && this.state.open) {
          this.close();
          this.trigger.focus({ preventScroll: true });
        }
      });

      /* Закрытие при клике мимо панели */
      document.addEventListener('pointerdown', e => {
        if (!this.state.open) return;
        if (performance.now() < this._lockUntil) return;
        if (e.composedPath && e.composedPath().includes(this.host)) return;
        this.close();
      }, true);

      window.addEventListener('resize', () => {
        this._moveToY(this.pos.y);
      });
    }

    open() {
      if (this.state.open) return;
      // Временная блокировка кликов для защиты от случайного нажатия (ghost tap / tap bleed-through)
      this._lockUntil = performance.now() + 380;
      this._placePanel();
      this.state.open = true;
      this.host.classList.add('open');
      this.panel.classList.add('open', 'w-opening');
      this.panel.setAttribute('aria-hidden', 'false');
      this.trigger.setAttribute('aria-expanded', 'true');

      clearTimeout(this._openingTimer);
      this._openingTimer = setTimeout(() => {
        this.panel.classList.remove('w-opening');
      }, 340);

      // Фокусируем первую ссылку только при клавиатурной навигации, чтобы не вызывать подсветку и ложные срабатывания на тачскринах
      if (this._isKeyboardOpen) {
        requestAnimationFrame(() => {
          const first = this.grid.querySelector('.w-tile');
          if (first) first.focus({ preventScroll: true });
        });
      }
    }

    close() {
      if (!this.state.open) return;
      this.state.open = false;
      this.host.classList.remove('open');
      this.panel.classList.remove('open', 'w-opening');
      this.panel.setAttribute('aria-hidden', 'true');
      this.trigger.setAttribute('aria-expanded', 'false');
    }

    toggle() { this.state.open ? this.close() : this.open(); }
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', () => new WarpApp(WARP_SITES).init());
  else
    new WarpApp(WARP_SITES).init();
})();