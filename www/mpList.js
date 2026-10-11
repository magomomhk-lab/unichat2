'use strict';
/* ============================================================
   mpList.js: ленивый список моделей во вкладке «Модели».
   Карточки создаются порциями и догружаются при прокрутке вниз.
   Один обработчик событий на весь список (делегирование).
   Поиск с задержкой. Перерисовка одной карточки при изменении.
============================================================ */
(function () {
  const PAGE = 24;
  const SEARCH_DELAY = 180;

  const MpList = {
    listEl: null,
    footEl: null,
    scrollRoot: null,
    io: null,
    models: [],
    byId: new Map(),
    cards: new Map(),
    shown: 0,
    query: '',
    bound: false,
    searchTimer: null,

    init() {
      if (this.bound) return;
      this.listEl = document.getElementById('modelProvidersList');
      if (!this.listEl) return;
      this.bound = true;
      this.scrollRoot = document.getElementById('setContentScroll');
      this.listEl.addEventListener('click', e => this.onClick(e));
      this.listEl.addEventListener('change', e => this.onChange(e));
      const inp = document.getElementById('mpSearchInput');
      if (inp) {
        inp.oninput = null; // снимаем старый обработчик, который перерисовывал весь список
        inp.addEventListener('input', () => {
          clearTimeout(this.searchTimer);
          this.searchTimer = setTimeout(() => {
            this.query = inp.value.trim();
            this.render();
          }, SEARCH_DELAY);
        });
      }
    },

    render() {
      this.init();
      if (!this.listEl) return;
      this.disconnect();
      const all = (typeof window.getAllModels === 'function' ? window.getAllModels() : [])
        .filter(m => m && m.id && !m.requiresOpenRouter);
      this.models = this.query
        ? all.filter(m => window.matchModelSearch(m, this.query))
        : all;
      this.byId = new Map(this.models.map(m => [m.id, m]));
      this.cards.clear();
      this.shown = 0;
      this.listEl.innerHTML = '';
      if (!this.models.length) {
        this.listEl.innerHTML = '<div class="list-empty"><svg><use href="#i-search"/></svg>Модели по запросу не найдены</div>';
        return;
      }
      this.footEl = document.createElement('div');
      this.footEl.className = 'mp-foot';
      this.listEl.appendChild(this.footEl);
      this.appendChunk();
      this.observe();
    },

    appendChunk() {
      const next = this.models.slice(this.shown, this.shown + PAGE);
      if (!next.length) return;
      const frag = document.createDocumentFragment();
      for (const m of next) {
        const el = this.makeCard(m);
        this.cards.set(m.id, el);
        frag.appendChild(el);
      }
      this.listEl.insertBefore(frag, this.footEl);
      this.shown += next.length;
      this.updateFoot();
    },

    updateFoot() {
      if (!this.footEl) return;
      const total = this.models.length;
      const done = this.shown >= total;
      this.footEl.textContent = done
        ? `Показаны все модели: ${total}`
        : `Показано ${this.shown} из ${total}. Прокрутите ниже, чтобы загрузить ещё`;
      if (done) this.disconnect();
    },

    observe() {
      if (!this.footEl || this.shown >= this.models.length) return;
      if (!('IntersectionObserver' in window)) {
        while (this.shown < this.models.length) this.appendChunk();
        return;
      }
      const io = new IntersectionObserver(entries => {
        if (io !== this.io) return;
        if (!entries.some(en => en.isIntersecting)) return;
        this.appendChunk();
        // После добавления порции проверяем подвал снова: если он всё ещё виден, догружаем дальше
        if (this.io && this.shown < this.models.length) {
          this.io.unobserve(this.footEl);
          this.io.observe(this.footEl);
        }
      }, { root: this.scrollRoot || null, rootMargin: '480px 0px 480px 0px' });
      this.io = io;
      io.observe(this.footEl);
    },

    disconnect() {
      if (this.io) { this.io.disconnect(); this.io = null; }
    },

    makeCard(m) {
      const t = document.createElement('template');
      t.innerHTML = this.cardHtml(m).trim();
      return t.content.firstElementChild;
    },

    refreshCard(mid) {
      const old = this.cards.get(mid);
      const m = this.byId.get(mid);
      if (!old || !m) return;
      const el = this.makeCard(m);
      old.replaceWith(el);
      this.cards.set(mid, el);
    },

    store() {
      const s = window.state.settings;
      if (!s.modelProviders) s.modelProviders = {};
      return s.modelProviders;
    },

    cfgOf(mid) {
      const mp = this.store();
      const base = String(mid).replace(/:[a-zA-Z0-9_.-]+$/i, '');
      return mp[mid] || mp[base] || {};
    },

    ensureCfg(mid) {
      const mp = this.store();
      if (!mp[mid]) mp[mid] = {};
      return mp[mid];
    },

    commit(mid) {
      if (typeof save === 'function') save();
      else if (typeof window.save === 'function') window.save();
      this.refreshCard(mid);
      if (typeof window.updateTopChips === 'function') window.updateTopChips();
    },

    cardHtml(m) {
      const esc = window.esc;
      const mid = m.id;
      const cfg = this.cfgOf(mid);
      const catalog = typeof window.getModelCatalogEntry === 'function' ? window.getModelCatalogEntry(mid) : {};
      const flavors = typeof window.getModelAvailableFlavors === 'function'
        ? window.getModelAvailableFlavors(m)
        : [{ id: 'standard', label: 'Стандарт', desc: '' }];
      const valid = new Set(flavors.map(f => f.id));
      let flavor = 'standard';
      if (cfg.flavor && valid.has(cfg.flavor)) flavor = cfg.flavor;
      else if (catalog.defaultFlavor && valid.has(catalog.defaultFlavor)) flavor = catalog.defaultFlavor;

      const src = cfg.apiSource || 'inherit';
      const sort = cfg.sort || 'default';
      const fallback = cfg.allow_fallbacks !== false;
      const order = Array.isArray(cfg.order) ? cfg.order
        : (cfg.selectedProvider && cfg.selectedProvider !== 'auto' ? [cfg.selectedProvider] : []);

      const icon = (typeof window.getAiModelIcon === 'function' ? window.getAiModelIcon(mid, m) : null)
        || (m.icon && !String(m.icon).startsWith('http') ? m.icon : null)
        || m.icon || '';
      const isFree = mid.endsWith(':free') || !!(m.pricing && m.pricing.isFree);
      const ctx = m.context || (m.contextLength ? Math.round(m.contextLength / 1000) + 'K' : (catalog.contextLength || ''));
      const price = isFree
        ? 'Бесплатно'
        : (m.pricing?.promptFormatted && m.pricing?.completionFormatted
          ? `Вход ${m.pricing.promptFormatted} · Выход ${m.pricing.completionFormatted}`
          : 'Тарификация OpenRouter');

      const seg = (act, items, cur) => items.map(([v, label, title]) =>
        `<button type="button" class="set-seg-btn${cur === v ? ' sel' : ''}" data-mp-act="${act}" data-val="${esc(v)}"${title ? ` title="${esc(title)}"` : ''}>${esc(label)}</button>`
      ).join('');

      const flavorRow = flavors.length > 1 ? `
        <div class="mp-config-row" style="padding-bottom:10px;border-bottom:1px dashed var(--line)">
          <div class="mp-opt-col">
            <label class="mp-sub-label">Режим / Вариант (Flavor):</label>
            <div class="set-segmented">${seg('flavor', flavors.map(f => [f.id, f.label || f.id, f.desc]), flavor)}</div>
          </div>
        </div>` : '';

      const chips = order.map(p =>
        `<span class="mp-prov-chip sel"><span class="mp-chip-name">${esc(p)}</span></span>`).join('');

      return `
      <div class="model-provider-card" data-mp-card="${esc(mid)}">
        <div class="mp-card-header">
          <div class="mp-model-identity">
            <div class="mp-model-icon">${icon
          ? `<img src="${esc(icon)}" alt="" loading="lazy" decoding="async" onerror="this.style.visibility='hidden'">`
          : '<svg class="ic"><use href="#i-chip"/></svg>'}</div>
            <div class="mp-model-meta">
              <div class="mp-model-name">${esc(m.name)} <span class="mp-model-id-badge">${esc(mid)}</span>${ctx ? ` <span class="prov-flavor-pill">${esc(ctx)} Ctx</span>` : ''}${isFree ? ' <span class="mi-pill-free">FREE</span>' : ''}</div>
              <div class="mp-model-sub"><span>${esc(m.provider || '')}</span> · <span class="mp-pricing-meta">${esc(price)}</span></div>
            </div>
          </div>
          <div class="mp-src-selector">
            <label class="mp-sub-label">Шлюз модели:</label>
            <div class="set-segmented">${seg('src', [['inherit', 'Глобальный'], ['proxy', 'ProxyAPI'], ['openrouter', 'OpenRouter']], src)}</div>
          </div>
        </div>

        <div class="mp-card-body">
          ${flavorRow}
          <div class="mp-config-row">
            <div class="mp-opt-col">
              <label class="mp-sub-label">Оптимизация маршрутизации (Sort):</label>
              <div class="set-segmented">${seg('sort', [
        ['default', 'Стандарт'],
        ['throughput', 'Скорость (TPS)', 'Максимальная скорость токенов/сек'],
        ['latency', 'Задержка (TTFT)', 'Минимальное время до первого токена'],
        ['price', 'Цена', 'Минимальная стоимость токенов']
      ], sort)}</div>
            </div>
            <div class="mp-opt-col mp-fallback-col">
              <div class="mp-fallback-info">
                <span class="mp-sub-label">Резервный переход (Failover)</span>
                <span class="mp-sub-hint">Переключать на запасной узел при отказе</span>
              </div>
              <button type="button" class="switch${fallback ? ' on' : ''}" data-mp-act="fallback" role="switch" aria-checked="${fallback}" aria-label="Резервный переход"></button>
            </div>
          </div>

          <div class="mp-providers-selection">
            <div class="mp-selection-head">
              <span class="mp-sub-label">Выбранные узлы инференса:</span>
              <button type="button" class="btn btn-ghost btn-sm" data-mp-act="open"><svg class="ic"><use href="#i-spark"/></svg>Выбрать из эндпоинтов OpenRouter (Live)</button>
            </div>
            ${chips ? `<div class="mp-chips-palette">${chips}</div>` : ''}
            <div class="mp-custom-order-input-wrap">
              <input type="text" class="ws-input" data-mp-act="order" value="${esc(order.join(', '))}" placeholder="Slug провайдера, например: together" spellcheck="false" autocomplete="off" aria-label="Slug провайдера">
              <button type="button" class="btn btn-ghost btn-sm" data-mp-act="clear"><svg class="ic"><use href="#i-refresh"/></svg>Авто</button>
            </div>
          </div>
        </div>
      </div>`;
    },

    onClick(e) {
      const btn = e.target.closest('[data-mp-act]');
      if (!btn || !this.listEl.contains(btn)) return;
      const card = btn.closest('[data-mp-card]');
      if (!card) return;
      const mid = card.dataset.mpCard;
      const act = btn.dataset.mpAct;

      if (act === 'open') {
        if (typeof window.openModelProviderFlyout === 'function') window.openModelProviderFlyout(mid);
        return;
      }
      if (act === 'clear') {
        const c = this.ensureCfg(mid);
        delete c.order; delete c.customOrder; delete c.selectedProvider; delete c.only;
        this.commit(mid);
        if (window.toast) window.toast('Приоритет провайдеров сброшен на Авто', 'info', 1400);
        return;
      }

      const c = this.ensureCfg(mid);
      switch (act) {
        case 'src': c.apiSource = btn.dataset.val; break;
        case 'flavor': c.flavor = btn.dataset.val; break;
        case 'sort': c.sort = btn.dataset.val === 'default' ? undefined : btn.dataset.val; break;
        case 'fallback': c.allow_fallbacks = !(c.allow_fallbacks !== false); break;
        default: return;
      }
      this.commit(mid);
    },

    onChange(e) {
      const inp = e.target.closest('[data-mp-act="order"]');
      if (!inp || !this.listEl.contains(inp)) return;
      const card = inp.closest('[data-mp-card]');
      if (!card) return;
      const mid = card.dataset.mpCard;
      const parts = inp.value.split(',').map(s => s.trim()).filter(Boolean);
      const c = this.ensureCfg(mid);
      c.order = parts.length ? parts : undefined;
      this.commit(mid);
    }
  };

  window.MpList = MpList;
})();