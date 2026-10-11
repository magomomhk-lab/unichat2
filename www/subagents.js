'use strict';
/* ============================================================
   subagents.js: управление работниками (субагентами) openrouter:subagent.
   Данные: state.settings.subagents (сохраняются в IndexedDB вместе с настройками и бэкапом).
   SubagentStore: правила и данные. SubagentUI: интерфейс (список, редактор, шаблоны).
   Работает только при прямом ключе OpenRouter, как и сам инструмент.
============================================================ */

const SA_MAX_ENABLED = 5;
const SA_MAX_TOOL_CALLS = 10;
const SA_DEFAULT_MODEL = '~anthropic/claude-haiku-latest';

const SA_TEMPLATES = [
  { key: 'research', name: 'Исследователь', description: 'Ищет и проверяет факты в интернете', model: '~anthropic/claude-haiku-latest', instructions: 'Отвечай кратко и по существу. Указывай ссылки на источники.', web: true, maxToolCalls: 5 },
  { key: 'code', name: 'Аналитик кода', description: 'Разбирает код, находит ошибки и предлагает исправления', model: 'qwen/qwen3.8-flash', instructions: 'Работай пошагово. Исправленный код показывай целиком.', web: false, maxToolCalls: 3 },
  { key: 'editor', name: 'Редактор текста', description: 'Вычитывает и переписывает тексты в нужном стиле', model: 'google/gemini-3.8-flash', instructions: 'Сохраняй смысл. Меняй только стиль и ошибки.', web: false, maxToolCalls: 1 }
];

const saId = () => 'sa_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
/* Имя инструмента для OpenRouter: только ASCII (a-zA-Z0-9, пробел, _, -), уникальность через суффикс id */
const saToolName = (n, id) => {
  const ascii = String(n ?? '')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  const suffix = String(id || '').replace(/[^a-zA-Z0-9]/g, '').slice(-6) || 'x';
  return ((ascii || 'worker') + '_' + suffix).slice(0, 64);
};
const saInt = (v, min, max, fb) => { const n = parseInt(v, 10); return isNaN(n) ? fb : Math.max(min, Math.min(max, n)); };
const saText = (v, max) => String(v ?? '').replace(/[\r\t]+/g, ' ').trim().slice(0, max);
const saEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const saNotify = (msg, type = 'info') => { if (typeof window.toast === 'function') window.toast(msg, type, 2200); };

const SubagentStore = {
  settings() { return (window.state && window.state.settings) || {}; },

  /* Ленивая миграция со старого единственного работника (идемпотентна) */
  ensure() {
    const s = this.settings();
    if (!Array.isArray(s.subagents)) {
      s.subagents = [];
      const legacy = s.webSearchCfg && s.webSearchCfg.openrouter && s.webSearchCfg.openrouter.subagent;
      if (legacy) {
        s.subagents.push({
          id: saId(), name: 'Работник', description: 'Перенесён из прежних настроек',
          model: saText(legacy.model, 120) || SA_DEFAULT_MODEL,
          instructions: saText(legacy.instructions, 2000),
          web: legacy.web === true,
          maxToolCalls: saInt(legacy.max_tool_calls, 1, SA_MAX_TOOL_CALLS, 5),
          enabled: legacy.enabled === true,
          createdAt: Date.now()
        });
      }
      if (s.webSearchCfg && s.webSearchCfg.openrouter) delete s.webSearchCfg.openrouter.subagent;
    }
    if (typeof s.subagentsEnabled !== 'boolean') s.subagentsEnabled = true;
    return s.subagents;
  },

  list() { return this.ensure(); },
  get(id) { return this.list().find(x => x.id === id) || null; },
  isMasterOn() { this.ensure(); return this.settings().subagentsEnabled !== false; },
  active() { return this.isMasterOn() ? this.list().filter(x => x.enabled).slice(0, SA_MAX_ENABLED) : []; },
  hasEnabled() { return this.active().length > 0; },
  enabledCount(excludeId) { return this.list().filter(x => x.enabled && x.id !== excludeId).length; },

  validate(data, selfId) {
    const name = saText(data.name, 32);
    const model = saText(data.model, 120).replace(/\s+/g, '');
    if (!name) return { error: 'Укажите имя работника' };
    if (this.list().some(x => x.id !== selfId && x.name.toLowerCase() === name.toLowerCase())) return { error: 'Работник с таким именем уже есть' };
    if (!model) return { error: 'Укажите модель' };
    return {
      value: {
        name,
        model,
        description: saText(data.description, 140),
        instructions: saText(data.instructions, 2000),
        web: !!data.web,
        maxToolCalls: saInt(data.maxToolCalls, 1, SA_MAX_TOOL_CALLS, 5),
        enabled: !!data.enabled
      }
    };
  },

  save(data, id) {
    const v = this.validate(data, id);
    if (v.error) return v;
    const val = v.value;
    if (val.enabled && this.enabledCount(id) >= SA_MAX_ENABLED) {
      return { error: `Можно подключить не больше ${SA_MAX_ENABLED} работников одновременно` };
    }
    let item;
    if (id) {
      item = this.get(id);
      if (!item) return { error: 'Работник не найден' };
      Object.assign(item, val);
    } else {
      item = { id: saId(), ...val, createdAt: Date.now() };
      this.list().push(item);
    }
    this.persist();
    return { item };
  },

  remove(id) {
    this.settings().subagents = this.list().filter(x => x.id !== id);
    this.persist();
  },

  duplicate(id) {
    const src = this.get(id);
    if (!src) return null;
    let name = src.name + ' (копия)';
    let n = 2;
    while (this.list().some(x => x.name === name)) name = `${src.name} (копия ${n++})`;
    const item = { ...src, id: saId(), name: name.slice(0, 32), enabled: false, createdAt: Date.now() };
    this.list().push(item);
    this.persist();
    return item;
  },

  setEnabled(id, on) {
    const it = this.get(id);
    if (!it) return { error: 'Работник не найден' };
    if (on && this.enabledCount(id) >= SA_MAX_ENABLED) return { error: `Уже подключено ${SA_MAX_ENABLED} работников. Отключите кого-нибудь` };
    it.enabled = !!on;
    this.persist();
    return { item: it };
  },

  setMaster(on) { this.settings().subagentsEnabled = !!on; this.persist(); },

  /* Инструменты для запроса: по одному блоку openrouter:subagent на работника */
  buildTools() {
    return this.active().map(it => {
      const head = `Работник «${it.name}»${it.description ? ': ' + it.description : ''}.`;
      const parameters = {
        name: saToolName(it.name, it.id),
        model: it.model,
        instructions: [head, it.instructions].filter(Boolean).join('\n')
      };
      if (it.web) {
        parameters.tools = [{ type: 'openrouter:web_search' }];
        parameters.max_tool_calls = it.maxToolCalls;
      }
      return { type: 'openrouter:subagent', parameters };
    });
  },

  /* Текст для системного промпта: какие работники доступны и зачем */
  describe() {
    const a = this.active();
    return a.length ? a.map(x => `«${x.name}» (${x.description || 'без описания'})`).join('; ') : 'нет';
  },

  persist() {
    if (typeof window.save === 'function') window.save(true);
    if (window.SubagentUI) window.SubagentUI.refresh();
  }
};

const SubagentUI = {
  mounted: false,
  editingId: null,
  draft: null,
  editorEl: null,

  mount() {
    if (this.mounted) return true;
    this.ensureTab();
    this.buildEditor();
    document.addEventListener('click', e => this.onClick(e));
    /* Capture: Escape закрывает только редактор, не всю настройки */
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this.isEditorOpen()) {
        e.stopPropagation();
        e.preventDefault();
        this.closeEditor();
      }
    }, true);
    this.mounted = true;
    return true;
  },

  ensureTab() {
    const body = document.querySelector('#setContentScroll .set-content-body');
    const nav = document.getElementById('setTabsNav');
    if (!body || !nav) return;
    if (!document.getElementById('tabPanel-subagents')) {
      const panel = document.createElement('div');
      panel.className = 'set-tab-panel';
      panel.id = 'tabPanel-subagents';
      panel.setAttribute('role', 'tabpanel');
      panel.innerHTML = `
        <div class="set-page-header">
          <div class="set-page-pre">Делегирование задач & Работники</div>
          <h2 class="set-page-title">Субагенты</h2>
          <p class="set-page-desc">Работники — меньшие и быстрые модели. Основная модель сама передаёт им узкие задачи. Одновременно подключено не больше 5. Нужен прямой ключ OpenRouter.</p>
        </div>
        <div id="subagentsSection" class="sa-page"></div>`;
      body.appendChild(panel);
    }
    if (!nav.querySelector('[data-tab="subagents"]')) {
      const btn = document.createElement('button');
      btn.className = 'set-nav-btn';
      btn.type = 'button';
      btn.dataset.tab = 'subagents';
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', 'false');
      btn.innerHTML = `
        <span class="set-nav-ico"><svg class="ic"><use href="#i-cube"/></svg></span>
        <span class="set-nav-txt">
          <span class="set-nav-title">Субагенты</span>
          <span class="set-nav-sub">Работники и делегирование</span>
        </span>
        <svg class="ic set-nav-chev"><use href="#i-chevron-right"/></svg>`;
      const after = nav.querySelector('.set-nav-btn[data-tab="models"]');
      if (after) after.after(btn); else nav.appendChild(btn);
    }
    if (!nav.dataset.saBound) {
      nav.dataset.saBound = '1';
      nav.addEventListener('click', e => {
        if (!e.target.closest('[data-tab="subagents"]')) return;
        if (typeof window.switchSettingsTab === 'function') window.switchSettingsTab('subagents');
        this.render();
      });
    }
  },

  isEditorOpen() { return !!this.editorEl && this.editorEl.classList.contains('show'); },
  refresh() { if (this.mounted) this.render(); },

  render() {
    if (!this.mount()) return;
    const sec = document.getElementById('subagentsSection');
    const master = SubagentStore.isMasterOn();
    const list = SubagentStore.list();
    const activeN = SubagentStore.active().length;
    sec.innerHTML = `
      <div class="set-title"><svg class="ic"><use href="#i-spark"/></svg>Субагенты (openrouter:subagent)</div>
      <div class="set-card set-card-pad sa-head">
        <div class="sa-head-text">
          <div class="sr-t">Субагенты включены</div>
          <div class="sr-s">Модель сама решает, когда передать часть задачи работнику. Подключено: <b>${activeN}</b> из ${SA_MAX_ENABLED}${master ? '' : ' (выключены общим переключателем)'}.</div>
        </div>
        <button type="button" class="switch ${master ? 'on' : ''}" data-sa-action="master" role="switch" aria-checked="${master}" aria-label="Субагенты включены"></button>
      </div>
      ${list.length ? `<div class="sa-grid">${list.map(it => this.cardHtml(it, master)).join('')}</div>` : this.emptyHtml()}
      <div class="sa-foot">
        <button type="button" class="btn btn-acc btn-sm" data-sa-action="new"><svg class="ic"><use href="#i-plus"/></svg>Новый работник</button>
      </div>`;
  },

  cardHtml(it, master) {
    const off = !master || !it.enabled;
    const ico = it.web ? 'i-globe' : 'i-chip';
    return `
      <article class="sa-card${off ? ' is-off' : ''}" data-sa-id="${saEsc(it.id)}">
        <header class="sa-card-head">
          <span class="sa-card-ico"><svg class="ic"><use href="#${ico}"/></svg></span>
          <div class="sa-card-title">
            <div class="sa-name">${saEsc(it.name)}</div>
            <div class="sa-model" title="${saEsc(it.model)}">${saEsc(it.model)}</div>
          </div>
          <button type="button" class="switch ${it.enabled ? 'on' : ''}" data-sa-action="toggle" data-sa-id="${saEsc(it.id)}" role="switch" aria-checked="${!!it.enabled}" aria-label="Подключить ${saEsc(it.name)}"${master ? '' : ' disabled'}></button>
        </header>
        <p class="sa-desc">${saEsc(it.description || 'Без описания')}</p>
        <div class="sa-tags">
          ${it.web ? '<span class="sa-tag">веб-поиск</span>' : ''}
          <span class="sa-tag">до ${it.maxToolCalls} вызовов</span>
          ${it.instructions ? '<span class="sa-tag">свои инструкции</span>' : ''}
        </div>
        <footer class="sa-card-actions">
          <button type="button" class="icon-btn" data-sa-action="edit" data-sa-id="${saEsc(it.id)}" title="Изменить" aria-label="Изменить"><svg class="ic"><use href="#i-pencil"/></svg></button>
          <button type="button" class="icon-btn" data-sa-action="duplicate" data-sa-id="${saEsc(it.id)}" title="Копировать" aria-label="Копировать"><svg class="ic"><use href="#i-copy"/></svg></button>
          <button type="button" class="icon-btn danger" data-sa-action="delete" data-sa-id="${saEsc(it.id)}" title="Удалить" aria-label="Удалить"><svg class="ic"><use href="#i-trash"/></svg></button>
        </footer>
      </article>`;
  },

  emptyHtml() {
    return `
      <div class="sa-empty">
        <svg class="ic" style="width:28px;height:28px;color:var(--accent)"><use href="#i-cube"/></svg>
        <div>Работников пока нет. Создайте своего или начните с шаблона.</div>
        <div class="sa-tpl-row">
          ${SA_TEMPLATES.map(t => `<button type="button" class="igm-chip" data-sa-action="template" data-sa-key="${t.key}">${saEsc(t.name)}</button>`).join('')}
        </div>
      </div>`;
  },

  /* Точка входа из настроек веб-поиска (ai.js → toolCalling.buildOrSearchPanelHtml) */
  entryHtml() {
    const n = SubagentStore.active().length;
    return `
      <div class="sa-entry">
        <div class="igm-note">Субагенты: подключено ${n} из ${SA_MAX_ENABLED}. Модель сама передаёт часть задачи работнику (нужен прямой ключ OpenRouter).</div>
        <button type="button" class="btn btn-ghost btn-sm" data-sa-action="manager"><svg class="ic"><use href="#i-gear"/></svg>Управлять субагентами</button>
      </div>`;
  },

  buildEditor() {
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.id = 'saEditOverlay';
    ov.innerHTML = `
      <div class="modal sa-modal" role="dialog" aria-modal="true" aria-label="Редактор работника">
        <div class="modal-head">
          <div class="modal-head-title-row"><svg class="ic" style="color:var(--accent)"><use href="#i-spark"/></svg><h2 id="saEditTitle">Работник</h2></div>
          <button class="icon-btn" type="button" data-sa-action="close" aria-label="Закрыть"><svg class="ic"><use href="#i-x"/></svg></button>
        </div>
        <div class="modal-body">
          <div class="sa-tpl-row" id="saTplRow"></div>
          <div class="field">
            <label for="saName">Имя <span class="req">*</span></label>
            <input id="saName" class="ws-input" maxlength="32" placeholder="Например: Исследователь" autocomplete="off" spellcheck="false">
          </div>
          <div class="field">
            <label for="saDesc">Описание <span class="opt">модель читает его и решает, когда звать работника</span></label>
            <input id="saDesc" class="ws-input" maxlength="140" placeholder="Что этот работник умеет делать" autocomplete="off">
          </div>
          <div class="field">
            <label for="saModel">Модель <span class="req">*</span></label>
            <input id="saModel" class="ws-input" list="saModelList" placeholder="~anthropic/claude-haiku-latest" autocomplete="off" spellcheck="false">
            <datalist id="saModelList"></datalist>
          </div>
          <div class="field">
            <label for="saInstr">Инструкции работника <span class="opt"><span id="saInstrCount">0</span>/2000</span></label>
            <textarea id="saInstr" class="field-area" maxlength="2000" placeholder="Как работник должен отвечать"></textarea>
          </div>
          <div class="sa-row2">
            <div class="field">
              <label>Веб-поиск</label>
              <div class="set-segmented">
                <button type="button" class="set-seg-btn" data-sa-action="web" data-sa-web="0">Нет</button>
                <button type="button" class="set-seg-btn" data-sa-action="web" data-sa-web="1">Да</button>
              </div>
            </div>
            <div class="field">
              <label for="saMax">Лимит вызовов: <b id="saMaxVal">5</b></label>
              <input id="saMax" type="range" min="1" max="${SA_MAX_TOOL_CALLS}" step="1" value="5">
            </div>
          </div>
          <div class="sa-err" id="saErr" hidden></div>
          <div class="sa-foot">
            <button type="button" class="btn btn-ghost" data-sa-action="close">Отмена</button>
            <button type="button" class="btn btn-acc" data-sa-action="submit"><svg class="ic"><use href="#i-check"/></svg>Сохранить</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(ov);
    this.editorEl = ov;

    const max = ov.querySelector('#saMax');
    max.addEventListener('input', () => { ov.querySelector('#saMaxVal').textContent = max.value; });
    const instr = ov.querySelector('#saInstr');
    instr.addEventListener('input', () => { ov.querySelector('#saInstrCount').textContent = instr.value.length; });
    ov.addEventListener('click', e => { if (e.target === ov) this.closeEditor(); });
    ov.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); this.submitEditor(); }
    });
  },

  openEditor(id = null, tplKey = null) {
    if (!this.mount()) return;
    const it = id ? SubagentStore.get(id) : null;
    const tpl = !it && tplKey ? SA_TEMPLATES.find(t => t.key === tplKey) : null;
    const base = it || tpl || { name: '', description: '', model: SA_DEFAULT_MODEL, instructions: '', web: false, maxToolCalls: 5 };
    this.editingId = it ? it.id : null;
    this.draft = { ...base, web: !!base.web };
    this.fillEditor(this.draft);
    this.renderTplRow(!it);
    this.fillModelList();
    this.setError('');
    this.editorEl.querySelector('#saEditTitle').textContent = it ? 'Изменить работника' : 'Новый работник';
    this.editorEl.classList.add('show');
    setTimeout(() => this.editorEl.querySelector('#saName').focus({ preventScroll: true }), 60);
  },

  fillEditor(d) {
    const q = s => this.editorEl.querySelector(s);
    q('#saName').value = d.name || '';
    q('#saDesc').value = d.description || '';
    q('#saModel').value = d.model || '';
    q('#saInstr').value = d.instructions || '';
    q('#saInstrCount').textContent = (d.instructions || '').length;
    q('#saMax').value = d.maxToolCalls || 5;
    q('#saMaxVal').textContent = d.maxToolCalls || 5;
    this.paintWeb();
  },

  paintWeb() {
    const on = !!(this.draft && this.draft.web);
    this.editorEl.querySelectorAll('[data-sa-web]').forEach(b => {
      const sel = (b.dataset.saWeb === '1') === on;
      b.classList.toggle('sel', sel);
      b.setAttribute('aria-pressed', sel ? 'true' : 'false');
    });
  },

  renderTplRow(show) {
    const row = this.editorEl.querySelector('#saTplRow');
    row.hidden = !show;
    row.innerHTML = show
      ? SA_TEMPLATES.map(t => `<button type="button" class="igm-chip" data-sa-action="tpl" data-sa-key="${t.key}">${saEsc(t.name)}</button>`).join('')
      : '';
  },

  applyTemplate(key) {
    const t = SA_TEMPLATES.find(x => x.key === key);
    if (!t) return;
    this.draft = { ...t, web: !!t.web };
    this.fillEditor(this.draft);
  },

  fillModelList() {
    const dl = this.editorEl.querySelector('#saModelList');
    const models = (typeof window.getAllModels === 'function' ? window.getAllModels() : [])
      .filter(m => m && m.id && !m.id.startsWith('@preset/'))
      .slice(0, 80);
    dl.innerHTML = models.map(m => `<option value="${saEsc(m.id)}">${saEsc(m.name || '')}</option>`).join('');
  },

  setError(msg) {
    const el = this.editorEl.querySelector('#saErr');
    el.hidden = !msg;
    el.textContent = msg || '';
  },

  collect() {
    const q = s => this.editorEl.querySelector(s);
    const existing = this.editingId ? SubagentStore.get(this.editingId) : null;
    const freeSlot = SubagentStore.list().filter(x => x.enabled).length < SA_MAX_ENABLED;
    return {
      name: q('#saName').value,
      description: q('#saDesc').value,
      model: q('#saModel').value,
      instructions: q('#saInstr').value,
      web: !!(this.draft && this.draft.web),
      maxToolCalls: q('#saMax').value,
      enabled: existing ? existing.enabled : freeSlot
    };
  },

  submitEditor() {
    const wasEdit = !!this.editingId;
    const res = SubagentStore.save(this.collect(), this.editingId);
    if (res.error) { this.setError(res.error); return; }
    this.closeEditor();
    if (wasEdit) saNotify('Работник обновлён', 'ok');
    else if (res.item.enabled) saNotify(`Работник «${res.item.name}» создан и подключён`, 'ok');
    else saNotify(`Работник «${res.item.name}» создан. Он выключен: лимит подключённых достигнут`, 'warn');
  },

  closeEditor() {
    if (this.editorEl) this.editorEl.classList.remove('show');
    this.editingId = null;
    this.draft = null;
  },

  confirmDelete(id) {
    const it = SubagentStore.get(id);
    if (!it) return;
    if (!confirm(`Удалить работника «${it.name}»? Прошлые ответы сохранятся.`)) return;
    SubagentStore.remove(id);
    saNotify('Работник удалён', 'info');
  },

  openManager() {
    document.getElementById('wsOverlay')?.classList.remove('show');
    if (typeof window.openSettings === 'function') window.openSettings('subagents');
    this.render();
  },

  onClick(e) {
    const el = e.target.closest('[data-sa-action]');
    if (!el) return;
    const act = el.dataset.saAction;
    const id = el.dataset.saId || null;
    switch (act) {
      case 'master': {
        SubagentStore.setMaster(!SubagentStore.isMasterOn());
        saNotify(SubagentStore.isMasterOn() ? 'Субагенты включены' : 'Субагенты выключены', 'info', 1600);
        break;
      }
      case 'new': this.openEditor(null); break;
      case 'template': this.openEditor(null, el.dataset.saKey); break;
      case 'tpl': this.applyTemplate(el.dataset.saKey); break;
      case 'edit': this.openEditor(id); break;
      case 'duplicate': {
        const c = SubagentStore.duplicate(id);
        if (c) saNotify(`Создана копия «${c.name}» (выключена)`, 'ok');
        break;
      }
      case 'delete': this.confirmDelete(id); break;
      case 'toggle': {
        const it = SubagentStore.get(id);
        if (!it) break;
        const r = SubagentStore.setEnabled(id, !it.enabled);
        if (r.error) saNotify(r.error, 'warn');
        break;
      }
      case 'web': {
        if (this.draft) this.draft.web = el.dataset.saWeb === '1';
        this.paintWeb();
        break;
      }
      case 'submit': this.submitEditor(); break;
      case 'close': this.closeEditor(); break;
      case 'manager': this.openManager(); break;
    }
  }
};

window.SubagentStore = SubagentStore;
window.SubagentUI = SubagentUI;

/* Монтируем секцию сразу после загрузки DOM: вкладка «Модели» уже есть в статичной разметке */
const saBoot = () => {
  try { SubagentUI.mount(); } catch (e) { console.warn('[Subagents] mount failed:', e); }
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', saBoot);
else saBoot();