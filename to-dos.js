//to-dos.js файл. Для чего он? Он создан для того, чтобы показать список задач (to-dos) с визуальными индикаторами прогресса. В этом файле реализован компонент React, который отображает список задач с анимацией выполнения и возможностью сворачивания/разворачивания списка.
// То есть модель перед агентской задачей строит список того что нужно выполнить, называет это и выполняет ПООЧЕРЕДНО.
// Визуально это выглядит как список задач с индикаторами выполнения, где каждая задача может быть в состоянии "не начата", "в процессе" или "выполнена".
// Тут же должна быть анимация поиска в интернете, создания артефактов и параллельное мышление. То есть мы заменяем анимации прежних инструментов на те, что реализованы тут.
// необходимо, чтобы агент мог видеть прогресс выполнения задач и понимать, что уже сделано, а что еще предстоит сделать.
// Нужно, чтобы контекст предыдущих задач был виден в следующих задачах, чтобы агент мог принимать решения на основе уже выполненной работы.
// Также нужно, чтобы агент мог добавлять новые задачи в список по мере необходимости, чтобы адаптироваться к изменяющимся условиям и требованиям.

'use strict';

/* ============================================================
   to-dos.js:
   Автономный контроллер планирования и визуализации задач ReAct:
   - Парсинг и управление структурой задач ({todo_plan}, {todo_update}, {todo_add})
   - Обогащение многоходовой истории диалога полными результатами шагов
   - Визуализация шагов с интеграцией суб-инструментов:
     * Web Search (поиск)
     * URL Fetch (чтение веб-страниц)
     * Code Execution (песочница Python/Node/Bash)
     * Artifact Creation (артефакты HTML/JS)
     * Deep Thinking (параллельное мышление)
============================================================ */

(function () {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Встроенная стилизация суб-чипов инструментов внутри шагов To-Do
  const injectStyles = () => {
    if (typeof document === 'undefined' || document.getElementById('todoToolStyles')) return;
    const style = document.createElement('style');
    style.id = 'todoToolStyles';
    style.textContent = `
      .todo-exec-live, .todo-think-live {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin-top: 6px;
        padding: 4px 10px;
        border-radius: 8px;
        background: hsla(var(--acc-h, 208), 80%, 75%, 0.08);
        border: 1px solid hsla(var(--acc-h, 208), 80%, 75%, 0.22);
        font-size: 11.5px;
        box-sizing: border-box;
      }
      .todo-exec-dot, .todo-think-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--accent, #8fd0f5);
        box-shadow: 0 0 8px var(--glow, hsla(208, 90%, 75%, 0.24));
        animation: pulse 1.1s ease-in-out infinite;
        flex-shrink: 0;
      }
      .todo-exec-shimmer, .todo-think-shimmer {
        font-family: var(--font-syne, system-ui, sans-serif);
        font-weight: 700;
        letter-spacing: 0.04em;
        font-size: 11px;
        background: linear-gradient(90deg, var(--accent, #8fd0f5) 0%, #38bdf8 30%, #c084fc 60%, var(--accent, #8fd0f5) 100%);
        background-size: 200% auto;
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
        animation: searchShimmer 2.2s linear infinite;
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .todo-tool-box {
        margin-top: 6px;
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .todo-tool-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 3px 9px;
        border-radius: 7px;
        font-size: 11px;
        font-weight: 600;
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        background: var(--input-bg, hsla(0, 0%, 100%, 0.04));
        border: 1px solid var(--line, hsla(0, 0%, 100%, 0.1));
        color: var(--text-dim, #a1a1aa);
      }
      .todo-tool-chip svg {
        flex-shrink: 0;
      }
      .todo-tool-chip.ok {
        color: var(--ok, #4ade80);
        border-color: hsla(152, 55%, 55%, 0.3);
        background: hsla(152, 55%, 50%, 0.08);
      }
      .todo-tool-chip.err {
        color: var(--danger, #f87171);
        border-color: hsla(354, 72%, 60%, 0.3);
        background: hsla(354, 72%, 60%, 0.08);
      }
      .todo-tool-chip.art {
        color: var(--accent, #8fd0f5);
        border-color: var(--accent-line, hsla(208, 80%, 78%, 0.3));
        background: var(--accent-soft, hsla(208, 80%, 75%, 0.1));
      }
      .todo-tool-chip.think {
        color: #c084fc;
        border-color: hsla(275, 75%, 65%, 0.3);
        background: hsla(275, 75%, 60%, 0.08);
      }
    `;
    document.head.appendChild(style);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectStyles);
  } else {
    injectStyles();
  }

  const ICONS = {
    check: () => `
      <svg class="todo-icon checkmark" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`,
    arrow: () => `
      <svg class="todo-icon active-arrow strong" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path d="m12.75 15 3-3m0 0-3-3m3 3h-7.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`,
    dashed: () => `
      <svg class="todo-icon dashed" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-dasharray="1.8 3.6" stroke-linecap="round"/>
      </svg>`,
    error: () => `
      <svg class="todo-icon error-mark" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" style="color:var(--danger,#f87171)">
        <path d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`,
    filledCheck: () => `
      <svg class="todo-head-check" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path fill-rule="evenodd" clip-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z" fill="currentColor"/>
      </svg>`,
    listIcon: () => `
      <svg class="todo-list-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`,
    chevron: () => `
      <svg class="todo-chevron" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path d="m19.5 8.25-7.5 7.5-7.5-7.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`
  };

  class RollingCounter {
    constructor(element) {
      this.el = element;
      this.currentText = '';
    }

    update(nextText) {
      const nextStr = String(nextText);
      if (this.currentText === nextStr) return;

      const oldChars = this.currentText.split('');
      const newChars = nextStr.split('');
      this.currentText = nextStr;

      this.el.innerHTML = '';
      newChars.forEach((ch, i) => {
        const oldCh = oldChars[i];
        const digitWrap = document.createElement('span');
        digitWrap.className = 'roll-digit';

        if (oldCh !== undefined && oldCh !== ch) {
          const inner = document.createElement('span');
          inner.className = 'roll-inner';
          inner.innerHTML = `<span>${esc(oldCh)}</span><span>${esc(ch)}</span>`;
          digitWrap.appendChild(inner);
          this.el.appendChild(digitWrap);

          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              inner.classList.add('up');
            });
          });

          setTimeout(() => {
            digitWrap.innerHTML = `<span>${esc(ch)}</span>`;
          }, 360);
        } else {
          digitWrap.innerHTML = `<span>${esc(ch)}</span>`;
          this.el.appendChild(digitWrap);
        }
      });
    }
  }

  class ToDoController {
    constructor() {
      this.domHelper = typeof window.domainHost === 'function' ? window.domainHost : (u => {
        try { return new URL(u).hostname.replace(/^www\./, ''); } catch (_) { return 'веб'; }
      });
    }

    _refresh(aiMsg) {
      if (window.toolCalling && typeof window.toolCalling.refreshMsg === 'function') {
        window.toolCalling.refreshMsg(aiMsg);
      } else if (typeof window.refreshCurrentMsg === 'function') {
        window.refreshCurrentMsg(aiMsg);
      }
    }

    _save() {
      if (window.toolCalling && typeof window.toolCalling.saveAppState === 'function') {
        window.toolCalling.saveAppState();
      } else if (typeof window.save === 'function') {
        window.save();
      }
    }

    _insertMarker(aiMsg, rawCmd, marker, location, fallbackNote) {
      if (location === 'thinking') {
        aiMsg.thinking = (aiMsg.thinking || '').replace(rawCmd, fallbackNote);
        if (marker) {
          aiMsg.content = (aiMsg.content || '') + (aiMsg.content.trim() ? '\n' : '') + marker;
        }
      } else {
        const replaced = (aiMsg.content || '').replace(rawCmd, marker);
        if (replaced === aiMsg.content && (aiMsg.thinking || '').includes(rawCmd)) {
          aiMsg.thinking = aiMsg.thinking.replace(rawCmd, fallbackNote);
          if (marker) {
            aiMsg.content = (aiMsg.content || '') + (aiMsg.content.trim() ? '\n' : '') + marker;
          }
        } else {
          aiMsg.content = replaced;
        }
      }
    }

    detectTodoCommand(text) {
      const str = String(text || '');
      // 1. Создание плана (с поддержкой кавычек вокруг имени команды)
      const planMatch = str.match(/\{["']?(?:todo[-_]plan|todoPlan)["']?\s*:\s*\[([\s\S]*?)\]\s*\}/i);
      if (planMatch) {
        try {
          const arr = JSON.parse('[' + planMatch[1] + ']');
          const tasks = arr.filter(x => typeof x === 'string' && x.trim());
          if (tasks.length) return { type: 'plan', raw: planMatch[0], tasks };
        } catch (_) {
          const qre = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g;
          let qm;
          const tasks = [];
          while ((qm = qre.exec(planMatch[1])) !== null) {
            const t = (qm[1] !== undefined ? qm[1] : qm[2] || '').replace(/\\(["'\\])/g, '$1').trim();
            if (t) tasks.push(t);
          }
          if (!tasks.length && planMatch[1].trim()) {
            const rawItems = planMatch[1].split(/[\n,;]+/).map(s => s.replace(/^["'\[\]\s]+|["'\[\]\s]+$/g, '').trim()).filter(Boolean);
            if (rawItems.length) return { type: 'plan', raw: planMatch[0], tasks: rawItems };
          }
          if (tasks.length) return { type: 'plan', raw: planMatch[0], tasks };
        }
      }
      // 2. Обновление шага (с поддержкой кавычек)
      const updateMatch = str.match(/\{["']?(?:todo[-_]update|todoUpdate)["']?\s*:\s*(\{[\s\S]*?\})\s*\}/i);
      if (updateMatch) {
        try {
          let jsonPayload = updateMatch[1];
          try {
            const obj = JSON.parse(jsonPayload);
            const step = parseInt(obj.step ?? obj.index, 10);
            if (!isNaN(step)) {
              return { type: 'update', raw: updateMatch[0], step: Math.max(1, step), status: obj.status || 'done', result: obj.result || '' };
            }
          } catch (_) {
            const sanitized = jsonPayload
              .replace(/'/g, '"')
              .replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
            const obj = JSON.parse(sanitized);
            const step = parseInt(obj.step ?? obj.index, 10);
            if (!isNaN(step)) {
              return { type: 'update', raw: updateMatch[0], step: Math.max(1, step), status: obj.status || 'done', result: obj.result || '' };
            }
          }
        } catch (_) { }
      }
      // 3. Динамическое добавление задач
      const addMatch = str.match(/\{["']?(?:todo[-_]add|todoAdd)["']?\s*:\s*\[([\s\S]*?)\]\s*\}/i);
      if (addMatch) {
        try {
          const arr = JSON.parse('[' + addMatch[1] + ']');
          const tasks = arr.filter(x => typeof x === 'string' && x.trim());
          if (tasks.length) return { type: 'add', raw: addMatch[0], tasks };
        } catch (_) {
          const qre = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g;
          let qm;
          const tasks = [];
          while ((qm = qre.exec(addMatch[1])) !== null) {
            const t = (qm[1] !== undefined ? qm[1] : qm[2] || '').replace(/\\(["'\\])/g, '$1').trim();
            if (t) tasks.push(t);
          }
          if (!tasks.length && addMatch[1].trim()) {
            const rawItems = addMatch[1].split(/[\n,;]+/).map(s => s.replace(/^["'\[\]\s]+|["'\[\]\s]+$/g, '').trim()).filter(Boolean);
            if (rawItems.length) return { type: 'add', raw: addMatch[0], tasks: rawItems };
          }
          if (tasks.length) return { type: 'add', raw: addMatch[0], tasks };
        }
      }
      return null;
    }

    stripTodoCommands(text) {
      return String(text || '')
        .replace(/\{["']?(?:todo[-_]plan|todoPlan)["']?\s*:\s*\[[\s\S]*?\]\s*\}/gi, '')
        .replace(/\{["']?(?:todo[-_]update|todoUpdate)["']?\s*:\s*\{[\s\S]*?\}\s*\}/gi, '')
        .replace(/\{["']?(?:todo[-_]add|todoAdd)["']?\s*:\s*\[[\s\S]*?\]\s*\}/gi, '');
    }

    spawnTodoSession(chat, aiMsg, rawCmd, tasks, location) {
      if (!aiMsg.todoSessions) aiMsg.todoSessions = [];
      if (aiMsg.todoSessions.length > 0) {
        const existing = aiMsg.todoSessions[aiMsg.todoSessions.length - 1];
        if (existing.status === 'running') {
          tasks.forEach(lbl => {
            if (!existing.tasks.some(t => t.label === lbl)) {
              existing.tasks.push({ label: lbl, status: 'pending', result: '' });
            }
          });
          this._insertMarker(aiMsg, rawCmd, '', location, '[план задач дополнен]');
          this._refresh(aiMsg);
          return existing;
        }
      }
      const uidStr = 'td_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const session = {
        id: uidStr,
        status: 'running',
        title: 'План выполнения задачи',
        tasks: tasks.map((t, idx) => ({
          label: t,
          status: idx === 0 ? 'active' : 'pending',
          result: ''
        })),
        startedAt: Date.now(),
        finishedAt: 0
      };
      aiMsg.todoSessions.push(session);
      const marker = '[[TODO:' + (aiMsg.todoSessions.length - 1) + ']]';
      this._insertMarker(aiMsg, rawCmd, marker, location, '[план задач сформирован]');
      if (chat) chat.updatedAt = Date.now();
      this._save();
      this._refresh(aiMsg);
      return session;
    }

    updateTodoSession(chat, aiMsg, rawCmd, step, status, result, location) {
      if (!aiMsg.todoSessions || !aiMsg.todoSessions.length) return null;
      const session = aiMsg.todoSessions[aiMsg.todoSessions.length - 1];
      const taskIdx = step - 1;
      const normStatus = ['active', 'done', 'error', 'pending'].includes(status) ? status
        : (/progress|running|start/i.test(String(status)) ? 'active' : (/fail|err/i.test(String(status)) ? 'error' : 'done'));
      if (session.tasks[taskIdx]) {
        // Только один активный шаг одновременно
        if (normStatus === 'active') {
          session.tasks.forEach((t, i) => { if (i !== taskIdx && t.status === 'active') t.status = 'pending'; });
        }
        session.tasks[taskIdx].status = normStatus;
        if (result) session.tasks[taskIdx].result = result;
        if ((normStatus === 'done' || normStatus === 'error') && session.tasks[taskIdx + 1] && session.tasks[taskIdx + 1].status === 'pending') {
          session.tasks[taskIdx + 1].status = 'active';
        }
      }
      const allCompleted = session.tasks.every(t => t.status === 'done' || t.status === 'error');
      if (allCompleted) {
        session.status = session.tasks.some(t => t.status === 'error') ? 'partial' : 'done';
        session.finishedAt = Date.now();
      }
      this._insertMarker(aiMsg, rawCmd, '', location, `[шаг ${step}: ${status}]`);
      if (chat) chat.updatedAt = Date.now();
      this._save();
      this._refresh(aiMsg);
      return session;
    }

    addTodoTasks(chat, aiMsg, rawCmd, newTasks, location) {
      if (!aiMsg.todoSessions || !aiMsg.todoSessions.length) return null;
      const session = aiMsg.todoSessions[aiMsg.todoSessions.length - 1];
      newTasks.forEach(lbl => {
        session.tasks.push({ label: lbl, status: 'pending', result: '' });
      });
      this._insertMarker(aiMsg, rawCmd, '', location, `[добавлено задач: ${newTasks.length}]`);
      if (chat) chat.updatedAt = Date.now();
      this._save();
      this._refresh(aiMsg);
      return session;
    }

    formatTodoProgress(session) {
      if (!session || !session.tasks) return '';
      const lines = session.tasks.map((t, i) => {
        const mark = t.status === 'done' ? '[✓]' : (t.status === 'active' ? '[→]' : (t.status === 'error' ? '[✗]' : '[ ]'));
        let details = [];
        if (t.result) details.push(`Итог: ${t.result}`);
        if (t.search?.sources?.length) {
          details.push(`Найдено источников (${t.search.sources.length}): ` + t.search.sources.slice(0, 3).map(s => s.title || s.uri).join(', '));
        }
        if (t.urlFetch?.pages?.length) {
          details.push(`Изучено страниц (${t.urlFetch.pages.length}): ` + t.urlFetch.pages.map(p => p.url).join(', '));
        }
        if (t.execution) {
          details.push(`Выполнен код ${t.execution.lang || 'python'} (exit ${t.execution.exitCode ?? 0})`);
        }
        if (t.artifact) {
          details.push(`Создан артефакт: «${t.artifact.title}»`);
        }
        const extra = details.length ? ` (${details.join(' · ')})` : '';
        return `${mark} ${i + 1}. ${t.label}${extra}`;
      }).join('\n');

      return [
        '=== ТЕКУЩИЙ ПРОГРЕСС ВЫПОЛНЕНИЯ ПЛАНА (TO-DOS) ===',
        lines,
        '=================================================',
        'Контекст выполненных шагов и инструментов зафиксирован. Продолжи решение следующего шага плана.'
      ].join('\n');
    }

    renderTodoCard(session, idx) {
      if (!session || !session.tasks) return '';
      const n = session.tasks.length;
      const completedCount = session.tasks.filter(t => t.status === 'done').length;
      const settledCount = session.tasks.filter(t => t.status === 'done' || t.status === 'error').length;
      const allDone = n > 0 && settledCount >= n;
      const running = session.status === 'running' && !allDone;
      const pct = n > 0 ? Math.round((completedCount / n) * 100) : 0;

      let headIconHtml = '';
      if (allDone) {
        headIconHtml = ICONS.filledCheck();
      } else if (running || completedCount > 0) {
        headIconHtml = `
          <span class="todo-head-pie" style="--todo-pie: ${pct}%" aria-hidden="true">
            <svg class="todo-head-pie-ring" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-dasharray="2.2 4.4" stroke-linecap="round"/>
            </svg>
          </span>
        `;
      } else {
        headIconHtml = ICONS.listIcon();
      }

      const itemsHtml = session.tasks.map((t, i) => {
        const isDone = t.status === 'done';
        const isActive = t.status === 'active';
        const isErr = t.status === 'error';
        const stateClass = isDone ? ' done' : (isActive ? ' active' : (isErr ? ' error' : ' pending'));

        let iconSvg = ICONS.dashed();
        if (isActive) iconSvg = ICONS.arrow();
        if (isDone) iconSvg = ICONS.check();
        if (isErr) iconSvg = ICONS.error();

        // 1. Веб-поиск
        let searchHtml = '';
        if (t.search) {
          if (t.search.status === 'searching') {
            const qText = (t.search.queries && t.search.queries.length) ? t.search.queries[0] : '';
            searchHtml = `
              <div class="todo-search-live">
                <span class="todo-search-shimmer"><span class="todo-search-dot"></span>Searching...</span>
                ${qText ? `<span class="todo-search-q" title="${esc(qText)}">«${esc(qText)}»</span>` : ''}
              </div>
            `;
          } else if (t.search.status === 'done' && t.search.sources && t.search.sources.length) {
            searchHtml = `
              <div class="todo-sources-compact">
                <span class="todo-sources-label">Источники (${t.search.sources.length}):</span>
                <div class="todo-sources-chips">
                  ${t.search.sources.slice(0, 6).map(src => {
                    const host = this.domHelper(src.uri);
                    const faviconMarkup = (window.toolCalling && typeof window.toolCalling.faviconImg === 'function')
                      ? `<span class="ws-favicon" data-uri="${esc(src.uri)}">${window.toolCalling.faviconImg(src.uri)}</span>`
                      : '';
                    return `
                      <a class="todo-src-chip" href="${esc(src.uri)}" target="_blank" rel="noopener noreferrer" title="${esc(src.title || host)}">
                        ${faviconMarkup}
                        <span class="todo-src-domain">${esc(host)}</span>
                        <svg class="todo-src-ext-ic" viewBox="0 0 24 24" width="10" height="10"><use href="#i-external"/></svg>
                      </a>
                    `;
                  }).join('')}
                </div>
              </div>
            `;
          }
        }

        // 2. Чтение ссылок
        let fetchHtml = '';
        if (t.urlFetch) {
          if (t.urlFetch.status === 'loading' || t.urlFetch.status === 'fetching') {
            const curUrl = t.urlFetch.currentUrl || (t.urlFetch.urls && t.urlFetch.urls[0]) || '';
            const curHost = this.domHelper(curUrl);
            const loadPct = Math.max(5, Math.min(100, Math.round(t.urlFetch.percent || 15)));
            fetchHtml = `
              <div class="todo-fetch-live">
                <div class="todo-fetch-head">
                  <span class="todo-fetch-shimmer"><span class="todo-fetch-dot"></span>Reading pages...</span>
                  <span class="todo-fetch-badge">${loadPct}%</span>
                </div>
                <div class="todo-fetch-track">
                  <div class="todo-fetch-bar" style="width:${loadPct}%"></div>
                </div>
                ${curHost ? `<div class="todo-fetch-url" title="${esc(curUrl)}"><svg class="todo-fetch-page-ic" viewBox="0 0 24 24" width="12" height="12"><use href="#i-globe"/></svg><span>${esc(curHost)}</span></div>` : ''}
              </div>
            `;
          } else if (t.urlFetch.status === 'done' && t.urlFetch.pages && t.urlFetch.pages.length) {
            fetchHtml = `
              <div class="todo-pages-compact">
                <span class="todo-pages-label">Прочитано страниц (${t.urlFetch.pages.length}):</span>
                <div class="todo-pages-chips">
                  ${t.urlFetch.pages.slice(0, 6).map(pg => {
                    const host = this.domHelper(pg.url);
                    const faviconMarkup = (window.toolCalling && typeof window.toolCalling.faviconImg === 'function')
                      ? `<span class="ws-favicon" data-uri="${esc(pg.url)}">${window.toolCalling.faviconImg(pg.url)}</span>`
                      : '';
                    return `
                      <a class="todo-page-chip" href="${esc(pg.url)}" target="_blank" rel="noopener noreferrer" title="${esc(pg.title || host)}">
                        ${faviconMarkup}
                        <span class="todo-page-domain">${esc(host)}</span>
                        ${pg.sizeKb ? `<span class="todo-page-size">${pg.sizeKb}K</span>` : ''}
                        <svg class="todo-src-ext-ic" viewBox="0 0 24 24" width="10" height="10"><use href="#i-external"/></svg>
                      </a>
                    `;
                  }).join('')}
                </div>
              </div>
            `;
          }
        }

        // 3. Выполнение кода в песочнице
        let execHtml = '';
        if (t.execution) {
          if (t.execution.status === 'running') {
            execHtml = `
              <div class="todo-exec-live">
                <span class="todo-exec-shimmer"><span class="todo-exec-dot"></span>Выполнение кода (${esc(t.execution.lang || 'python')})…</span>
              </div>
            `;
          } else if (t.execution.status === 'done' || t.execution.status === 'error') {
            const isOk = t.execution.exitCode === 0;
            execHtml = `
              <div class="todo-tool-box">
                <span class="todo-tool-chip ${isOk ? 'ok' : 'err'}">
                  <svg viewBox="0 0 24 24" width="12" height="12"><use href="#i-terminal"/></svg>
                  <span>${esc(t.execution.lang || 'python')} exit ${t.execution.exitCode ?? 0}${t.execution.dur ? ' (' + t.execution.dur + ')' : ''}</span>
                </span>
              </div>
            `;
          }
        }

        // 4. Артефакт
        let artifactHtml = '';
        if (t.artifact && t.artifact.status === 'done') {
          artifactHtml = `
            <div class="todo-tool-box">
              <span class="todo-tool-chip art">
                <svg viewBox="0 0 24 24" width="12" height="12"><use href="#i-cube"/></svg>
                <span>Артефакт: «${esc(t.artifact.title || 'HTML')}»</span>
              </span>
            </div>
          `;
        }

        // 5. Параллельное мышление
        let thinkHtml = '';
        if (t.thinking) {
          if (t.thinking.status === 'thinking') {
            const bCount = (t.thinking.tasks && t.thinking.tasks.length) ? t.thinking.tasks.length : '';
            thinkHtml = `
              <div class="todo-think-live">
                <span class="todo-think-shimmer"><span class="todo-think-dot"></span>Параллельное мышление${bCount ? ` (${bCount} веток)` : ''}…</span>
              </div>
            `;
          } else if (t.thinking.status === 'done') {
            thinkHtml = `
              <div class="todo-tool-box">
                <span class="todo-tool-chip think">
                  <svg viewBox="0 0 24 24" width="12" height="12"><use href="#i-spark"/></svg>
                  <span>Синтез ${t.thinking.count || ''} веток завершён</span>
                </span>
              </div>
            `;
          }
        }

        return `
          <li class="todo-item${stateClass}" data-step="${i}">
            <span class="todo-icon-wrap">${iconSvg}</span>
            <div class="todo-content-wrap" style="flex:1;min-width:0">
              <span class="todo-label">${esc(t.label)}</span>
              ${searchHtml}
              ${fetchHtml}
              ${execHtml}
              ${artifactHtml}
              ${thinkHtml}
              ${t.result && !t.search && !t.urlFetch && !t.execution ? `<div class="todo-task-result">${esc(t.result)}</div>` : ''}
            </div>
          </li>
        `;
      }).join('');

      return `
        <div class="todo-card no-sel${running ? ' running' : ''}" data-todo-session="${idx}">
          <button type="button" class="todo-head" onclick="this.parentElement.classList.toggle('is-collapsed')">
            <span class="todo-head-icon">
              ${headIconHtml}
              ${ICONS.chevron()}
            </span>
            <span class="todo-title">${esc(session.title || 'План задач')}</span>
            <span class="todo-count"><span class="roll-count">${completedCount}/${n}</span></span>
          </button>
          <div class="todo-collapsible">
            <div class="todo-inner">
              <ul class="todo-list">${itemsHtml}</ul>
            </div>
          </div>
        </div>
      `;
    }
  }

  const toDos = new ToDoController();

  // Глобальный экспорт модуля
  window.toDos = toDos;
  window.RollingCounter = RollingCounter;
  window.detectTodoCommand = (text) => toDos.detectTodoCommand(text);
  window.stripTodoCommands = (text) => toDos.stripTodoCommands(text);
  window.spawnTodoSession = (...args) => toDos.spawnTodoSession(...args);
  window.updateTodoSession = (...args) => toDos.updateTodoSession(...args);
  window.addTodoTasks = (...args) => toDos.addTodoTasks(...args);
  window.formatTodoProgress = (s) => toDos.formatTodoProgress(s);
  window.renderTodoCard = (s, i) => toDos.renderTodoCard(s, i);
})();