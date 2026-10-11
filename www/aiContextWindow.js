/* ============================================================
   aiContextWindow.js
   Pure Vanilla ES6+ реализация MorphPanel & ColorOrb.
   Контекстное микро-окно анализа выделенного фрагмента через openai/gpt-5-nano.
   Платформы: Web, Electron, Capacitor (Android WebView).
   Строго без Emoji, без Tailwind, без внешних библиотек.
============================================================ */

'use strict';

class AiContextWindowController {
  constructor() {
    this.selectedText = '';
    this.selectionRect = null;
    this.isOpen = false;
    this.isExpanded = false;
    this.isStreaming = false;
    this.abortController = null;
    this.webSearchEnabled = false;

    this.dragState = {
      isDragging: false,
      hasDragged: false,
      startX: 0,
      startY: 0,
      initialLeft: 0,
      initialTop: 0,
      currentX: 0,
      currentY: 0,
      rafId: null
    };

    this.dom = {
      root: null,
      panel: null,
      header: null,
      dockBar: null,
      orbContainer: null,
      expandBtn: null,
      formWrap: null,
      snippetQuote: null,
      textarea: null,
      submitBtn: null,
      responseWrap: null,
      responseBody: null,
      statusIndicator: null,
      wsToggleBtn: null
    };

    this.init();
  }

  init() {
    this.createDom();
    this.bindEvents();
  }

  createDom() {
    let root = document.getElementById('aiContextWindowRoot');
    if (!root) {
      root = document.createElement('div');
      root.id = 'aiContextWindowRoot';
      document.body.appendChild(root);
    }
    this.dom.root = root;

    root.innerHTML = `
      <div class="ai-context-panel no-sel" id="aiContextPanel" hidden>
        <!-- Режим 1: Компактный DockBar («Ask AI») -->
        <div class="ai-context-dock" id="aiContextDock">
          <div class="color-orb-wrap" id="aiContextOrbSmall">
            <div class="color-orb color-orb-sm"></div>
          </div>
          <button type="button" class="ai-context-ask-btn" id="aiContextAskBtn">
            <span>Ask AI</span>
          </button>
        </div>

        <!-- Режим 2: Развёрнутая форма ввода и стриминга ответа -->
        <div class="ai-context-form-wrap" id="aiContextFormWrap" hidden>
          <div class="ai-context-header" id="aiContextHeader" title="Зажмите и перемещайте окно">
            <div class="ai-context-header-left" data-drag-handle="true">
              <div class="ai-context-drag-handle" aria-hidden="true">
                <span class="ac-grip-dot"></span>
                <span class="ac-grip-dot"></span>
                <span class="ac-grip-dot"></span>
              </div>
              <div class="color-orb color-orb-xs"></div>
              <span class="ai-context-title">GPT-5 Nano · Анализ фрагмента</span>
            </div>
            <div class="ai-context-header-right">
              <button type="button" class="ai-context-icon-btn" id="aiContextWsToggle" title="Веб-поиск для фрагмента" aria-label="Переключить веб-поиск">
                <svg class="ic"><use href="#i-globe"/></svg>
              </button>
              <button type="button" class="ai-context-icon-btn" id="aiContextCloseBtn" title="Закрыть (Esc)" aria-label="Закрыть">
                <svg class="ic"><use href="#i-x"/></svg>
              </button>
            </div>
          </div>

          <!-- Цитата выбранного фрагмента -->
          <div class="ai-context-quote" id="aiContextQuote" title="Изолированный контекст вопроса"></div>

          <!-- Поле вопроса пользователя -->
          <form class="ai-context-input-form" id="aiContextInputForm">
            <textarea
              class="ai-context-textarea"
              id="aiContextTextarea"
              rows="2"
              placeholder="Что объяснить или найти по этому фрагменту?..."
              spellcheck="false"
            ></textarea>

            <div class="ai-context-footer">
              <div class="ai-context-hint">
                <span class="kbd">⌘</span><span class="kbd">Enter</span>
              </div>
              <button type="submit" class="btn btn-acc btn-sm" id="aiContextSubmitBtn">
                <svg class="ic"><use href="#i-send"/></svg>
                <span>Спросить</span>
              </button>
            </div>
          </form>

          <!-- Блок ответа модели -->
          <div class="ai-context-response-wrap" id="aiContextResponseWrap" hidden>
            <div class="ai-context-response-header">
              <span class="ai-context-model-badge">
                <svg class="ic"><use href="#i-spark"/></svg>
                <span id="aiContextStatusText">Ответ модели</span>
              </span>
              <button type="button" class="ai-context-copy-btn" id="aiContextCopyBtn" title="Копировать ответ" aria-label="Копировать">
                <svg class="ic"><use href="#i-copy"/></svg>
              </button>
            </div>
            <div class="ai-context-response-body" id="aiContextResponseBody"></div>
          </div>
        </div>
      </div>
    `;

    this.dom.panel = root.querySelector('#aiContextPanel');
    this.dom.header = root.querySelector('#aiContextHeader');
    this.dom.dockBar = root.querySelector('#aiContextDock');
    this.dom.orbContainer = root.querySelector('#aiContextOrbSmall');
    this.dom.expandBtn = root.querySelector('#aiContextAskBtn');
    this.dom.formWrap = root.querySelector('#aiContextFormWrap');
    this.dom.snippetQuote = root.querySelector('#aiContextQuote');
    this.dom.textarea = root.querySelector('#aiContextTextarea');
    this.dom.submitBtn = root.querySelector('#aiContextSubmitBtn');
    this.dom.responseWrap = root.querySelector('#aiContextResponseWrap');
    this.dom.responseBody = root.querySelector('#aiContextResponseBody');
    this.dom.statusIndicator = root.querySelector('#aiContextStatusText');
    this.dom.wsToggleBtn = root.querySelector('#aiContextWsToggle');
  }

  bindEvents() {
    this.setupDragging();

    // 1. Клик по кнопке «Ask AI» разворачивает панель
    this.dom.expandBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.expand();
    });

    // 2. Закрытие
    const closeBtn = this.dom.root.querySelector('#aiContextCloseBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.close();
      });
    }

    // 3. Переключение веб-поиска
    this.dom.wsToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.webSearchEnabled = !this.webSearchEnabled;
      this.dom.wsToggleBtn.classList.toggle('active', this.webSearchEnabled);
      if (typeof window.toast === 'function') {
        window.toast(this.webSearchEnabled ? 'Веб-поиск для фрагмента включен' : 'Веб-поиск выключен', 'info', 1600);
      }
    });

    // 4. Отправка формы (⌘+Enter / Ctrl+Enter)
    const form = this.dom.root.querySelector('#aiContextInputForm');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.sendQuery();
    });

    this.dom.textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        this.sendQuery();
      }
    });

    // 5. Копирование ответа
    const copyBtn = this.dom.root.querySelector('#aiContextCopyBtn');
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const text = this.dom.responseBody.innerText || '';
      if (!text.trim()) return;
      navigator.clipboard.writeText(text).then(() => {
        if (typeof window.toast === 'function') window.toast('Ответ скопирован', 'ok', 1600);
      });
    });

    // 6. Клик вне панели закрывает её (игнорируется при активном перемещении)
    document.addEventListener('pointerdown', (e) => {
      if (!this.isOpen || this.dragState.isDragging) return;
      if (this.dom.panel && !this.dom.panel.contains(e.target)) {
        this.close();
      }
    }, true);

    // 7. Скролл родительских контейнеров скрывает неразвёрнутый пилл
    const scroller = document.getElementById('chatScroll');
    if (scroller) {
      scroller.addEventListener('scroll', () => {
        if (this.isOpen && !this.isExpanded && !this.dragState.isDragging) {
          this.close();
        }
      }, { passive: true });
    }

    // 8. Корректировка границ при ресайзе экрана или смене ориентации
    window.addEventListener('resize', () => {
      if (!this.isOpen || !this.dom.panel || !this.isExpanded) return;
      const rect = this.dom.panel.getBoundingClientRect();
      const pad = 10;
      const maxLeft = Math.max(pad, window.innerWidth - rect.width - pad);
      const maxTop = Math.max(pad, window.innerHeight - rect.height - pad);
      if (rect.left > maxLeft || rect.top > maxTop) {
        this.dom.panel.style.left = `${Math.max(pad, Math.min(maxLeft, rect.left))}px`;
        this.dom.panel.style.top = `${Math.max(pad, Math.min(maxTop, rect.top))}px`;
      }
    }, { passive: true });
  }

  setupDragging() {
    const header = this.dom.header;
    if (!header || !this.dom.panel) return;

    header.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button, input, textarea, a, select, [role="button"]')) {
        return;
      }
      if (e.pointerType === 'mouse' && e.button !== 0) return;

      e.preventDefault();
      const rect = this.dom.panel.getBoundingClientRect();
      this.dragState.isDragging = true;
      this.dragState.hasDragged = false;
      this.dragState.startX = e.clientX;
      this.dragState.startY = e.clientY;
      this.dragState.initialLeft = rect.left;
      this.dragState.initialTop = rect.top;
      this.dragState.currentX = rect.left;
      this.dragState.currentY = rect.top;

      this.dom.panel.classList.add('is-dragging');
      header.classList.add('is-dragging');

      try {
        header.setPointerCapture(e.pointerId);
      } catch (_) {}
    });

    header.addEventListener('pointermove', (e) => {
      if (!this.dragState.isDragging) return;

      const dx = e.clientX - this.dragState.startX;
      const dy = e.clientY - this.dragState.startY;

      if (Math.hypot(dx, dy) > 2) {
        this.dragState.hasDragged = true;
      }

      const panelW = this.dom.panel.offsetWidth || 380;
      const panelH = this.dom.panel.offsetHeight || 200;
      const pad = 10;
      const maxLeft = Math.max(pad, window.innerWidth - panelW - pad);
      const maxTop = Math.max(pad, window.innerHeight - panelH - pad);

      let targetX = this.dragState.initialLeft + dx;
      let targetY = this.dragState.initialTop + dy;

      targetX = Math.max(pad, Math.min(maxLeft, targetX));
      targetY = Math.max(pad, Math.min(maxTop, targetY));

      this.dragState.currentX = targetX;
      this.dragState.currentY = targetY;

      if (!this.dragState.rafId) {
        this.dragState.rafId = requestAnimationFrame(() => {
          this.dragState.rafId = null;
          if (this.dragState.isDragging && this.dom.panel) {
            this.dom.panel.style.left = `${Math.round(this.dragState.currentX)}px`;
            this.dom.panel.style.top = `${Math.round(this.dragState.currentY)}px`;
            this.dom.panel.style.right = 'auto';
            this.dom.panel.style.bottom = 'auto';
          }
        });
      }
    });

    const endDrag = (e) => {
      if (!this.dragState.isDragging) return;
      this.dragState.isDragging = false;
      this.dom.panel.classList.remove('is-dragging');
      header.classList.remove('is-dragging');

      if (this.dragState.rafId) {
        cancelAnimationFrame(this.dragState.rafId);
        this.dragState.rafId = null;
      }

      try {
        header.releasePointerCapture(e.pointerId);
      } catch (_) {}
    };

    header.addEventListener('pointerup', endDrag);
    header.addEventListener('pointercancel', endDrag);
  }

  showPill(x, y, text) {
    if (!text || !text.trim()) return;
    this.selectedText = text.trim();
    this.isOpen = true;
    this.isExpanded = false;
    this.dom.panel.hidden = false;
    this.dom.panel.classList.remove('expanded');
    this.dom.dockBar.hidden = false;
    this.dom.formWrap.hidden = true;
    this.dom.responseWrap.hidden = true;
    this.dom.responseBody.innerHTML = '';

    // Позиционирование с проверкой границ вьюпорта
    const panelW = 120;
    const panelH = 44;
    const pad = 12;

    let posX = Math.max(pad, Math.min(x - panelW / 2, window.innerWidth - panelW - pad));
    let posY = y - panelH - 10;
    if (posY < pad) {
      posY = y + 24;
    }

    this.dom.panel.style.left = `${posX}px`;
    this.dom.panel.style.top = `${posY}px`;
  }

  expand() {
    if (!this.isOpen) return;
    this.isExpanded = true;
    this.dom.panel.classList.add('expanded');
    this.dom.dockBar.hidden = true;
    this.dom.formWrap.hidden = false;

    // Обновляем цитату (срез до 280 символов)
    const preview = this.selectedText.length > 260
      ? this.selectedText.slice(0, 260) + '…'
      : this.selectedText;
    this.dom.snippetQuote.textContent = `«${preview}»`;

    // Корректировка позиции при раскрытии
    const rect = this.dom.panel.getBoundingClientRect();
    const expandedW = Math.min(380, window.innerWidth - 24);
    let posX = rect.left;
    let posY = rect.top;

    if (posX + expandedW > window.innerWidth - 12) {
      posX = window.innerWidth - expandedW - 12;
    }
    if (posX < 12) posX = 12;

    if (posY + 320 > window.innerHeight - 12) {
      posY = Math.max(12, window.innerHeight - 340);
    }

    this.dom.panel.style.left = `${posX}px`;
    this.dom.panel.style.top = `${posY}px`;

    setTimeout(() => {
      this.dom.textarea.focus();
    }, 60);
  }

close() {
    if (this.abortController) {
      try { this.abortController.abort(); } catch (_) {}
      this.abortController = null;
    }
    if (this.dragState && this.dragState.rafId) {
      cancelAnimationFrame(this.dragState.rafId);
      this.dragState.rafId = null;
    }
    this.dragState.isDragging = false;
    this.isStreaming = false;
    this.isOpen = false;
    this.isExpanded = false;
    this.dom.panel.hidden = true;
    this.dom.panel.classList.remove('expanded', 'is-dragging');
    if (this.dom.header) {
      this.dom.header.classList.remove('is-dragging');
    }
  }

  async sendQuery() {
    const question = this.dom.textarea.value.trim();
    if (!question) return;

    const s = (typeof window.state !== 'undefined' && window.state.settings) || {};
    const orKey = (s.orKey || '').trim();
    const proxyKey = (s.proxyKey || '').trim();

    if (!orKey && !proxyKey) {
      if (typeof window.toast === 'function') {
        window.toast('Укажите ключ API в настройках', 'err');
      }
      return;
    }

    this.isStreaming = true;
    this.abortController = new AbortController();

    this.dom.responseWrap.hidden = false;
    this.dom.responseBody.innerHTML = '<span class="ai-context-cursor"></span>';
    this.dom.statusIndicator.textContent = 'Анализирую контекст…';
    this.dom.submitBtn.disabled = true;

    // Формируем строгий изолированный контекст для модели openai/gpt-5-nano
    const systemPrompt = `You are a high-speed analytical assistant running specifically on openai/gpt-5-nano.
CRITICAL CONTEXT RESTRICTION:
- You ONLY have knowledge of the provided excerpt from the user's message.
- Answer the user's inquiry strictly and accurately focusing on the excerpt.
- Keep the explanation crisp, direct, and structured.
- STRICT NO EMOJI: Do not output any emoji anywhere in your response.
- Answer in the same language as the user's query.`;

    const userContent = `EXCERPT TO ANALYZE:
"""
${this.selectedText}
"""

USER QUESTION ABOUT THIS EXCERPT:
${question}`;

    const origin = (typeof location !== 'undefined' && location.origin && !location.origin.startsWith('file'))
      ? location.origin
      : 'https://unichat2.sahbanovtimur228.workers.dev/ai';

    try {
      let endpoint = '';
      let authHeader = '';
      let requestBody = {};

      if (orKey) {
        endpoint = 'https://openrouter.ai/api/v1/chat/completions';
        authHeader = 'Bearer ' + orKey;
        requestBody = {
          model: 'openai/gpt-5-nano',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent }
          ],
          stream: true,
          temperature: 0.3
        };
      } else {
        // ProxyAPI fallback
        endpoint = 'https://api.proxyapi.ru/openai/v1/chat/completions';
        authHeader = 'Bearer ' + proxyKey;
        requestBody = {
          model: 'gpt-4o-mini', // или nano маппинг провайдера
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent }
          ],
          stream: true,
          temperature: 0.3
        };
      }

      const resp = await fetch(endpoint, {
        method: 'POST',
        signal: this.abortController.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader,
          'HTTP-Referer': origin,
          'X-Title': 'MoonSSS Context AI'
        },
        body: JSON.stringify(requestBody)
      });

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }

      this.dom.statusIndicator.textContent = 'Ответ';
      let fullText = '';
      const reader = resp.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const cleanLine = line.trim();
          if (!cleanLine.startsWith('data:')) continue;
          const payload = cleanLine.slice(5).trim();
          if (payload === '[DONE]') break;
          try {
            const chunk = JSON.parse(payload);
            const delta = chunk.choices?.[0]?.delta?.content || '';
            if (delta) {
              fullText += delta;
              this.renderResponse(fullText, true);
            }
          } catch (_) {}
        }
      }

      this.renderResponse(fullText, false);
    } catch (err) {
      if (err.name === 'AbortError') return;
      this.dom.responseBody.innerHTML = `<span style="color:var(--danger)">Ошибка: ${esc(err.message || err)}</span>`;
    } finally {
      this.isStreaming = false;
      this.abortController = null;
      this.dom.submitBtn.disabled = false;
    }
  }

  renderResponse(text, isStreaming) {
    let html = '';
    if (typeof window.mdToHtml === 'function') {
      html = window.mdToHtml(text);
    } else {
      html = `<p>${esc(text).replace(/\n/g, '<br>')}</p>`;
    }

    if (isStreaming) {
      html += '<span class="ai-context-cursor"></span>';
    }

    this.dom.responseBody.innerHTML = html;
    this.dom.responseBody.scrollTop = this.dom.responseBody.scrollHeight;
  }
}

// Экспорт синглтона в глобальную область
window.aiContextWindow = new AiContextWindowController();