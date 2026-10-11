/* ============================================================
   textSelectionMenu.js — Mobile & Desktop Text Selection Toolbar
   Linear/Vercel style, DeepL Translation, Responsive Collapse & Ask AI
============================================================ */
'use strict';

class TextSelectionMenuController {
    constructor() {
        this.toolbar = null;
        this.mainBar = null;
        this.overflowMenu = null;
        this.translateModal = null;
        this.selectedText = '';
        this.activeRange = null;
        this.targetElement = null;
        this.isEditable = false;
        this.isOpen = false;
        this.isOverflowOpen = false;
        this.debounceTimer = null;
        this.rafId = null;

        this.init();
    }

    init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            this.setup();
        }
    }

    setup() {
        this.createDOM();
        this.bindEvents();
    }

    createDOM() {
        if (document.getElementById('textSelectionMenu')) return;

        const toolbar = document.createElement('div');
        toolbar.id = 'textSelectionMenu';
        toolbar.className = 'text-selection-toolbar';
        toolbar.setAttribute('role', 'toolbar');
        toolbar.setAttribute('aria-label', 'Действия с выделенным фрагментом');
        toolbar.hidden = true;

        toolbar.innerHTML = `
            <div class="tsm-main-bar" id="tsmMainBar"></div>
            <div class="tsm-overflow-menu" id="tsmOverflowMenu" hidden></div>
        `;
        document.body.appendChild(toolbar);

        this.toolbar = toolbar;
        this.mainBar = toolbar.querySelector('#tsmMainBar');
        this.overflowMenu = toolbar.querySelector('#tsmOverflowMenu');

        this.createTranslateModal();
    }

    createTranslateModal() {
        if (document.getElementById('tsmTranslateOverlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'tsmTranslateOverlay';
        overlay.className = 'overlay';
        overlay.hidden = true;

        overlay.innerHTML = `
            <div class="modal tsm-translate-modal" role="dialog" aria-modal="true" aria-label="Переводчик DeepL">
                <div class="modal-head">
                    <div class="modal-head-title-row">
                        <svg class="ic" style="color:var(--accent)"><use href="#i-translate"/></svg>
                        <h2>Перевод фрагмента</h2>
                    </div>
                    <button type="button" class="icon-btn" id="tsmTranslateClose" aria-label="Закрыть"><svg class="ic"><use href="#i-x"/></svg></button>
                </div>
                <div class="modal-body">
                    <div class="field">
                        <div class="tsm-trans-lang-bar">
                            <span class="tsm-trans-lang-label">Язык перевода:</span>
                            <div class="set-segmented" id="tsmTargetLangSeg">
                                <button type="button" class="set-seg-btn sel" data-lang="RU">RU</button>
                                <button type="button" class="set-seg-btn" data-lang="EN">EN</button>
                                <button type="button" class="set-seg-btn" data-lang="DE">DE</button>
                                <button type="button" class="set-seg-btn" data-lang="FR">FR</button>
                                <button type="button" class="set-seg-btn" data-lang="ES">ES</button>
                                <button type="button" class="set-seg-btn" data-lang="JA">JA</button>
                                <button type="button" class="set-seg-btn" data-lang="ZH">ZH</button>
                            </div>
                        </div>
                    </div>

                    <div class="field">
                        <label>Исходный текст</label>
                        <div class="tsm-trans-source" id="tsmTransSourceText"></div>
                    </div>

                    <div class="field">
                        <label>Результат перевода</label>
                        <div class="tsm-trans-result-box" id="tsmTransResultBox">
                            <div class="tsm-trans-loading" id="tsmTransLoading" hidden>
                                <span class="spin"></span>
                                <span>Перевод через DeepL API…</span>
                            </div>
                            <div class="tsm-trans-result-text" id="tsmTransResultText"></div>
                        </div>
                    </div>

                    <details class="tsm-deepl-key-details" id="tsmDeeplKeyDetails">
                        <summary>Настройка DeepL API Free Key</summary>
                        <div class="tsm-deepl-key-wrap">
                            <input type="password" class="ws-input" id="inpDeeplApiKey" placeholder="DeepL-Auth-Key: xxxxxxxx-xxxx-..." autocomplete="off" spellcheck="false">
                            <button type="button" class="btn btn-ghost btn-sm" id="btnSaveDeeplKey"><svg class="ic"><use href="#i-check"/></svg>Сохранить ключ</button>
                        </div>
                        <div class="set-hint-txt" style="margin-top:6px">Если ключ не задан, перевод выполняется автоматически через активную модель ИИ.</div>
                    </details>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-ghost" id="tsmTransCopyBtn"><svg class="ic"><use href="#i-copy"/></svg>Копировать перевод</button>
                    <button type="button" class="btn btn-acc" id="tsmTransPasteBtn"><svg class="ic"><use href="#i-pencil"/></svg>Вставить в поле ввода</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        this.translateModal = overlay;
    }

    bindEvents() {
        this.disableAiContextAutoPopup();

        // Предотвращение сброса фокуса и снятия выделения при кликах по кнопкам тулбара
        if (this.toolbar) {
            this.toolbar.addEventListener('pointerdown', (e) => {
                e.stopPropagation();
                if (!['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
                    e.preventDefault();
                }
            });
            this.toolbar.addEventListener('mousedown', (e) => {
                if (!['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
                    e.preventDefault();
                }
            });
        }

        // Подавление нативного меню Android/iOS ТОЛЬКО когда фрагмент уже выделен,
        // чтобы не блокировать сам жест долгого удержания (long-press selection gesture)
        document.addEventListener('contextmenu', (e) => {
            const sel = window.getSelection();
            const hasDomSel = sel && !sel.isCollapsed && sel.toString().trim().length > 0;
            const activeEl = document.activeElement;
            const hasInputSel = activeEl && typeof activeEl.selectionStart === 'number' && activeEl.selectionStart !== activeEl.selectionEnd;

            const target = e.target;
            if (target && target.closest('.genimg.done img, .fav-card, .chat-item, .code-tools, #textSelectionMenu, .tsm-overflow-menu')) {
                return;
            }

            // Блокируем нативное всплывающее меню только если текст уже выделен
            if (hasDomSel || hasInputSel) {
                e.preventDefault();
            }
        }, true);

        // Отслеживание изменений выделения в DOM и синхронизация со скруглённым SVG-слоем
        document.addEventListener('selectionchange', () => {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => {
                this.handleSelectionChange();
                if (window.moonSelectionController && typeof window.moonSelectionController.forceRender === 'function') {
                    window.moonSelectionController.forceRender();
                }
            }, 60);
        });

        document.addEventListener('select', () => {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => {
                this.handleSelectionChange();
                if (window.moonSelectionController && typeof window.moonSelectionController.forceRender === 'function') {
                    window.moonSelectionController.forceRender();
                }
            }, 40);
        }, true);

        // Корректировка геометрии при завершении жеста касания и кликов вне тулбара
        document.addEventListener('touchend', (e) => {
            if (this.toolbar && this.toolbar.contains(e.target)) return;
            if (this.translateModal && this.translateModal.contains(e.target)) return;
            setTimeout(() => {
                this.handleSelectionChange();
                if (window.moonSelectionController && typeof window.moonSelectionController.forceRender === 'function') {
                    window.moonSelectionController.forceRender();
                }
            }, 50);
        }, { passive: true });

        document.addEventListener('mouseup', (e) => {
            if (this.toolbar && this.toolbar.contains(e.target)) return;
            if (this.translateModal && this.translateModal.contains(e.target)) return;
            setTimeout(() => this.handleSelectionChange(), 50);
        });

        document.addEventListener('keyup', (e) => {
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'KeyA'].some(k => e.key.includes(k) || e.code.includes(k))) {
                setTimeout(() => this.handleSelectionChange(), 60);
            }
        });

        // Закрытие при клике мимо тулбара
        document.addEventListener('pointerdown', (e) => {
            if (!this.isOpen) return;
            if (this.toolbar && this.toolbar.contains(e.target)) return;
            if (this.translateModal && this.translateModal.contains(e.target)) return;
            this.close();
        });

        // События модального окна перевода DeepL
        const closeTrans = () => {
            if (this.translateModal) {
                this.translateModal.hidden = true;
                this.translateModal.classList.remove('show');
            }
        };

        const modalCloseBtn = document.getElementById('tsmTranslateClose');
        if (modalCloseBtn) modalCloseBtn.onclick = closeTrans;

        if (this.translateModal) {
            this.translateModal.onclick = (e) => {
                if (e.target === this.translateModal) closeTrans();
            };
        }

        const btnSaveKey = document.getElementById('btnSaveDeeplKey');
        if (btnSaveKey) {
            btnSaveKey.onclick = () => {
                const inp = document.getElementById('inpDeeplApiKey');
                const val = (inp ? inp.value : '').trim();
                if (window.state && window.state.settings) {
                    window.state.settings.deeplKey = val;
                    if (typeof window.save === 'function') window.save(true);
                    if (typeof window.toast === 'function') {
                        window.toast(val ? 'Ключ DeepL API сохранён в хранилище' : 'Ключ DeepL очищен', 'ok', 1800);
                    }
                }
            };
        }

        const langButtons = document.querySelectorAll('#tsmTargetLangSeg .set-seg-btn');
        langButtons.forEach(btn => {
            btn.onclick = () => {
                langButtons.forEach(b => b.classList.remove('sel'));
                btn.classList.add('sel');
                this.executeTranslation(this.selectedText, btn.dataset.lang);
            };
        });

        const btnCopy = document.getElementById('tsmTransCopyBtn');
        if (btnCopy) {
            btnCopy.onclick = () => {
                const text = document.getElementById('tsmTransResultText')?.textContent || '';
                if (text) {
                    navigator.clipboard.writeText(text).then(() => {
                        if (typeof window.toast === 'function') window.toast('Перевод скопирован в буфер', 'ok', 1600);
                    });
                }
            };
        }

        const btnPaste = document.getElementById('tsmTransPasteBtn');
        if (btnPaste) {
            btnPaste.onclick = () => {
                const text = document.getElementById('tsmTransResultText')?.textContent || '';
                const promptInp = document.getElementById('promptInput');
                if (text && promptInp) {
                    promptInp.value = promptInp.value.trim() ? promptInp.value.trimEnd() + '\n' + text : text;
                    if (window.promptInputCtrl && typeof window.promptInputCtrl.adjustHeight === 'function') {
                        window.promptInputCtrl.adjustHeight();
                    }
                    if (typeof window.setSendBtn === 'function') window.setSendBtn();
                    closeTrans();
                    promptInp.focus();
                    if (typeof window.toast === 'function') window.toast('Перевод вставлен в поле ввода', 'ok', 1600);
                }
            };
        }

        // Авто-перепозиционирование при прокрутке
        window.addEventListener('scroll', () => {
            if (this.isOpen) this.updatePosition();
        }, { passive: true });
        const scroller = document.getElementById('chatScroll');
        if (scroller) {
            scroller.addEventListener('scroll', () => {
                if (this.isOpen) this.updatePosition();
            }, { passive: true });
        }
    }

    disableAiContextAutoPopup() {
        const disable = () => {
            const aiCtx = window.aiContextWindow;
            if (!aiCtx || aiCtx.__autoPopupDisabled) return;
            aiCtx.__autoPopupDisabled = true;

            if (typeof aiCtx.handleSelectionChange === 'function') {
                aiCtx.handleSelectionChange = () => {};
            }
            if (typeof aiCtx.onSelection === 'function') {
                aiCtx.onSelection = () => {};
            }

            const origShowPill = aiCtx.showPill ? aiCtx.showPill.bind(aiCtx) : null;
            if (origShowPill) {
                aiCtx.showPill = (x, y, text, force = false) => {
                    if (force || aiCtx.__allowShowPill) {
                        aiCtx.__allowShowPill = false;
                        return origShowPill(x, y, text);
                    }
                    return null;
                };
            }
        };

        disable();
        document.addEventListener('DOMContentLoaded', disable);
        window.addEventListener('load', disable);
    }

    handleSelectionChange() {
        const activeEl = document.activeElement;

        // Если пользователь взаимодействует с элементами самого тулбара, игнорируем пересчёт
        if (this.isOpen && this.toolbar && this.toolbar.contains(activeEl)) {
            return;
        }

        const isFormInput = activeEl && (
            activeEl.tagName === 'TEXTAREA' ||
            (activeEl.tagName === 'INPUT' && !['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'color', 'file'].includes(activeEl.type))
        );

        let text = '';
        let targetEl = null;
        let isInputOrTextarea = false;
        let inputStart = -1;
        let inputEnd = -1;

        // 1. Проверка выделения внутри input / textarea (включая настройки и композер)
        if (isFormInput && typeof activeEl.selectionStart === 'number' && typeof activeEl.selectionEnd === 'number' && activeEl.selectionStart !== activeEl.selectionEnd) {
            inputStart = Math.min(activeEl.selectionStart, activeEl.selectionEnd);
            inputEnd = Math.max(activeEl.selectionStart, activeEl.selectionEnd);
            text = activeEl.value.substring(inputStart, inputEnd).trim();
            if (text.length > 0) {
                targetEl = activeEl;
                isInputOrTextarea = true;
                this.activeRange = null;
                this.inputSelection = { start: inputStart, end: inputEnd };
            }
        }

        // 2. Страховка от кратковременного blur при тапах на мобильных устройствах
        if (!targetEl && this.isOpen && this.isInputOrTextarea && this.targetElement && this.inputSelection) {
            if (document.activeElement === document.body || (this.toolbar && this.toolbar.contains(document.activeElement))) {
                targetEl = this.targetElement;
                text = this.selectedText;
                isInputOrTextarea = true;
                inputStart = this.inputSelection.start;
                inputEnd = this.inputSelection.end;
            }
        }

        // 3. Стандартное выделение в общем DOM-дереве
        if (!targetEl) {
            const sel = window.getSelection();
            if (!sel || sel.isCollapsed || !sel.rangeCount) {
                this.close();
                return;
            }

            text = sel.toString().trim();
            if (text.length < 1) {
                this.close();
                return;
            }

            const anchorNode = sel.anchorNode;
            targetEl = anchorNode?.nodeType === Node.TEXT_NODE ? anchorNode.parentElement : anchorNode;
            if (!targetEl) {
                this.close();
                return;
            }

            this.activeRange = sel.getRangeAt(0).cloneRange();
            this.inputSelection = null;
        }

        if (this.toolbar?.contains(targetEl) || this.translateModal?.contains(targetEl)) {
            return;
        }

        if (targetEl.closest('#textSelectionMenu, #tsmTranslateOverlay, #toasts, .app-splash-screen, .color-orb')) {
            this.close();
            return;
        }

        // Если выделение не изменилось, обновляем координаты без закрытия выпадающего списка возможностей
        const isSameText = this.selectedText === text;
        const isSameTarget = this.targetElement === targetEl;
        const isSameInputRange = isInputOrTextarea && this.inputSelection &&
            this.inputSelection.start === inputStart && this.inputSelection.end === inputEnd;

        if (this.isOpen && isSameText && (isSameTarget || isSameInputRange)) {
            this.updatePosition();
            return;
        }

        this.selectedText = text;
        this.targetElement = targetEl;
        this.isInputOrTextarea = isInputOrTextarea;

        this.isEditable = isInputOrTextarea ||
            targetEl.tagName === 'TEXTAREA' ||
            targetEl.tagName === 'INPUT' ||
            targetEl.isContentEditable ||
            Boolean(targetEl.closest('[contenteditable="true"], .msg-edit-textarea, #promptInput, .ws-input, .field-area'));

        // Закрываем конкурирующий пилл Ask AI при обычном выделении
        if (window.aiContextWindow && !window.aiContextWindow.isExpanded && typeof window.aiContextWindow.close === 'function') {
            window.aiContextWindow.close();
        }

        this.open(true);
    }

    open(resetOverflow = true) {
        if (!this.toolbar) return;

        this.isOpen = true;
        if (resetOverflow) {
            this.isOverflowOpen = false;
            this.overflowMenu.hidden = true;
        }
        this.toolbar.hidden = false;

        this.renderButtons();
        this.updatePosition();
    }

    close() {
        if (!this.isOpen) return;
        this.isOpen = false;
        this.isOverflowOpen = false;
        if (this.toolbar) {
            this.toolbar.hidden = true;
            this.toolbar.classList.remove('is-active');
        }
    }

    renderButtons() {
        const screenW = window.visualViewport ? window.visualViewport.width : window.innerWidth;

        // Полный перечень действий. «Cut» строго скрыт, если текст неизменяемый.
        const allActions = [
            {
                id: 'copy',
                label: 'Копировать',
                sub: 'Скопировать в буфер',
                icon: '<svg class="ic"><use href="#i-copy"/></svg>',
                visible: true,
                priority: 10
            },
            {
                id: 'cut',
                label: 'Вырезать',
                sub: 'Удалить и скопировать',
                icon: '<svg class="ic"><use href="#i-cut"/></svg>',
                visible: Boolean(this.isEditable),
                priority: 9
            },
            {
                id: 'ask-ai',
                label: 'Ask AI',
                sub: 'Анализ фрагмента через ИИ',
                icon: '<span class="color-orb color-orb-xs" aria-hidden="true"></span>',
                visible: true,
                priority: 8
            },
            {
                id: 'translate',
                label: 'Перевести',
                sub: 'DeepL переводчик',
                icon: '<svg class="ic"><use href="#i-translate"/></svg>',
                visible: true,
                priority: 7
            },
            {
                id: 'select-all',
                label: 'Выбрать всё',
                sub: 'Выделить весь блок текста',
                icon: '<svg class="ic"><use href="#i-select-all"/></svg>',
                visible: true,
                priority: 6
            }
        ];

        const visibleActions = allActions.filter(a => a.visible);

        // Расчет доступной вместимости основной строки
        let maxPrimaryCount = 5;
        if (screenW < 420) {
            maxPrimaryCount = 2;
        } else if (screenW < 560) {
            maxPrimaryCount = 3;
        }

        const primaryList = [];
        const overflowList = [];

        if (visibleActions.length <= maxPrimaryCount) {
            // Если все доступные кнопки умещаются, кнопка «>» не создается вовсе
            primaryList.push(...visibleActions);
        } else {
            // Если редактируемый режим на смартфоне, в основной строке оставляем Копировать и Вырезать,
            // а Ask AI и остальные действия уходят первыми в выпадающий список возможностей
            if (this.isEditable && screenW < 420) {
                const copyAct = visibleActions.find(a => a.id === 'copy');
                const cutAct = visibleActions.find(a => a.id === 'cut');
                if (copyAct) primaryList.push(copyAct);
                if (cutAct) primaryList.push(cutAct);

                visibleActions.forEach(act => {
                    if (act.id !== 'copy' && act.id !== 'cut') {
                        overflowList.push(act);
                    }
                });
            } else {
                primaryList.push(...visibleActions.slice(0, maxPrimaryCount));
                overflowList.push(...visibleActions.slice(maxPrimaryCount));
            }
        }

        let mainHtml = primaryList.map(item => `
            <button type="button" class="tsm-btn ${item.id === 'ask-ai' ? 'tsm-btn-ai' : ''}" data-act="${item.id}" title="${item.label}">
                ${item.icon}
                <span class="tsm-label">${item.label}</span>
            </button>
        `).join('');

        // Кнопка со стрелочкой рендерится ТОЛЬКО тогда, когда действительно есть скрытые функции
        if (overflowList.length > 0) {
            mainHtml += `
                <button type="button" class="tsm-btn tsm-btn-more ${this.isOverflowOpen ? 'is-open' : ''}" data-act="toggle-more" title="Все возможности" aria-label="Раскрыть список возможностей">
                    <svg class="ic tsm-chevron"><use href="#i-chevron-right"/></svg>
                </button>
            `;
        } else {
            this.isOverflowOpen = false;
            this.overflowMenu.hidden = true;
        }

        this.mainBar.innerHTML = mainHtml;

        if (overflowList.length > 0) {
            this.overflowMenu.innerHTML = overflowList.map(item => `
                <button type="button" class="tsm-overflow-item ${item.id === 'ask-ai' ? 'is-ai' : ''}" data-act="${item.id}">
                    <span class="tsm-item-ico">${item.icon}</span>
                    <span class="tsm-item-text">
                        <span class="tsm-item-title">${item.label}</span>
                        <span class="tsm-item-sub">${item.sub}</span>
                    </span>
                </button>
            `).join('');
        } else {
            this.overflowMenu.innerHTML = '';
        }

        this.bindButtonClicks();
    }

    bindButtonClicks() {
        this.toolbar.querySelectorAll('button[data-act]').forEach(btn => {
            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const act = btn.dataset.act;

                if (act === 'toggle-more') {
                    this.toggleOverflow();
                    return;
                }

                this.executeAction(act);
            };
        });
    }

    toggleOverflow() {
        this.isOverflowOpen = !this.isOverflowOpen;
        this.overflowMenu.hidden = !this.isOverflowOpen;

        const moreBtn = this.toolbar.querySelector('.tsm-btn-more');
        if (moreBtn) moreBtn.classList.toggle('is-open', this.isOverflowOpen);

        this.updatePosition();
    }

    updatePosition() {
        if (!this.isOpen || !this.toolbar) return;

        let centerX = 0;
        let topY = 0;
        let bottomY = 0;

        if (this.activeRange) {
            const rect = this.activeRange.getBoundingClientRect();
            if (rect.width > 0 || rect.height > 0) {
                centerX = rect.left + rect.width / 2;
                topY = rect.top;
                bottomY = rect.bottom;
            }
        }

        if (!centerX && this.targetElement) {
            const elRect = this.targetElement.getBoundingClientRect();
            centerX = elRect.left + elRect.width / 2;
            topY = elRect.top;
            bottomY = elRect.bottom;
        }

        if (!centerX) return;

        this.applyCoordinates(centerX, topY, bottomY);
    }

    applyCoordinates(centerX, topY, bottomY = topY + 20) {
        const toolbarW = this.toolbar.offsetWidth || 280;
        const toolbarH = this.toolbar.offsetHeight || 42;

        const screenW = window.visualViewport ? window.visualViewport.width : window.innerWidth;
        const screenH = window.visualViewport ? window.visualViewport.height : window.innerHeight;

        let left = centerX - toolbarW / 2;
        left = Math.max(10, Math.min(left, screenW - toolbarW - 10));

        let top = topY - toolbarH - 10;
        let isBelow = false;

        // Если сверху недостаточно места, разворачиваем меню под выделением
        if (top < 56) {
            top = bottomY + 10;
            isBelow = true;
        }

        top = Math.max(8, Math.min(top, screenH - toolbarH - 12));

        this.toolbar.style.left = `${Math.round(left)}px`;
        this.toolbar.style.top = `${Math.round(top)}px`;
        this.toolbar.classList.toggle('is-placed-below', isBelow);
    }

    executeAction(act) {
        const text = this.selectedText;

        if (act === 'ask-ai') {
            this.close();
            if (window.aiContextWindow) {
                window.aiContextWindow.__allowShowPill = true;
                const rect = this.activeRange
                    ? this.activeRange.getBoundingClientRect()
                    : (this.targetElement ? this.targetElement.getBoundingClientRect() : { left: window.innerWidth / 2, top: window.innerHeight / 2, width: 0 });
                window.aiContextWindow.showPill(rect.left + rect.width / 2, rect.top, text, true);
                if (typeof window.aiContextWindow.expand === 'function') {
                    window.aiContextWindow.expand();
                } else {
                    const dock = document.querySelector('.ai-context-dock, .ai-context-ask-btn');
                    if (dock) dock.click();
                }
            }
            return;
        }

        if (act === 'copy') {
            navigator.clipboard.writeText(text).then(() => {
                if (typeof window.toast === 'function') window.toast('Текст скопирован в буфер', 'ok', 1600);
            }).catch(() => {
                document.execCommand('copy');
                if (typeof window.toast === 'function') window.toast('Текст скопирован', 'ok', 1600);
            });
            this.close();
            return;
        }

        if (act === 'cut') {
            if (this.isEditable) {
                navigator.clipboard.writeText(text).then(() => {
                    if (typeof window.toast === 'function') window.toast('Текст вырезан', 'ok', 1600);
                }).catch(() => {
                    document.execCommand('copy');
                    if (typeof window.toast === 'function') window.toast('Текст вырезан', 'ok', 1600);
                });

                if (this.isInputOrTextarea && this.targetElement) {
                    const el = this.targetElement;
                    const start = el.selectionStart;
                    const end = el.selectionEnd;
                    el.setRangeText('', start, end, 'end');
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                } else if (document.activeElement && (document.activeElement.tagName === 'TEXTAREA' || document.activeElement.tagName === 'INPUT')) {
                    const el = document.activeElement;
                    const start = el.selectionStart;
                    const end = el.selectionEnd;
                    el.setRangeText('', start, end, 'end');
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                } else {
                    document.execCommand('delete');
                }
            }
            this.close();
            return;
        }

        if (act === 'select-all' || act === 'selectAll') {
            if (this.isInputOrTextarea && this.targetElement) {
                this.targetElement.focus();
                this.targetElement.select();
                setTimeout(() => this.handleSelectionChange(), 50);
            } else {
                const container = this.targetElement.closest('.bubble, .md-body, .think-body, .msg-edit-textarea, .set-card, .msg-main, .msg, body') || this.targetElement || document.body;
                const range = document.createRange();
                range.selectNodeContents(container);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
                setTimeout(() => this.handleSelectionChange(), 50);
            }
            return;
        }

        if (act === 'translate') {
            this.close();
            this.openTranslationModal(text);
        }
    }

    openTranslationModal(text) {
        if (!this.translateModal) return;

        const sourceEl = document.getElementById('tsmTransSourceText');
        const resultEl = document.getElementById('tsmTransResultText');
        const inpKey = document.getElementById('inpDeeplApiKey');

        if (sourceEl) sourceEl.textContent = text;
        if (resultEl) resultEl.textContent = '';

        const s = (window.state && window.state.settings) || {};
        if (inpKey) inpKey.value = s.deeplKey || '';

        // Авто-определение направления перевода: RU -> EN, иначе EN -> RU
        const isCyrillic = /[а-яёА-ЯЁ]/i.test(text);
        const targetLang = isCyrillic ? 'EN' : 'RU';

        const langButtons = document.querySelectorAll('#tsmTargetLangSeg .set-seg-btn');
        langButtons.forEach(b => b.classList.toggle('sel', b.dataset.lang === targetLang));

        this.translateModal.hidden = false;
        this.translateModal.classList.add('show');

        this.executeTranslation(text, targetLang);
    }

    async executeTranslation(text, targetLang = 'RU') {
        const loadingEl = document.getElementById('tsmTransLoading');
        const resultEl = document.getElementById('tsmTransResultText');

        if (loadingEl) loadingEl.hidden = false;
        if (resultEl) resultEl.textContent = '';

        const s = (window.state && window.state.settings) || {};
        const deeplKey = (s.deeplKey || '').trim();

        // 1. Официальный DeepL Free API при наличии ключа (поддержка JSON и URL-encoded)
        if (deeplKey) {
            try {
                let resp = await fetch('https://api-free.deepl.com/v2/translate', {
                    method: 'POST',
                    headers: {
                        'Authorization': `DeepL-Auth-Key ${deeplKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        text: [text],
                        target_lang: targetLang
                    })
                });

                if (!resp.ok && resp.status === 415) {
                    const params = new URLSearchParams();
                    params.append('text', text);
                    params.append('target_lang', targetLang);
                    resp = await fetch('https://api-free.deepl.com/v2/translate', {
                        method: 'POST',
                        headers: {
                            'Authorization': `DeepL-Auth-Key ${deeplKey}`,
                            'Content-Type': 'application/x-www-form-urlencoded'
                        },
                        body: params
                    });
                }

                if (resp.ok) {
                    const data = await resp.json();
                    const translation = data?.translations?.[0]?.text || '';
                    if (translation) {
                        if (loadingEl) loadingEl.hidden = true;
                        if (resultEl) resultEl.textContent = translation;
                        return;
                    }
                }
            } catch (err) {
                console.warn('[DeepL] API request fallback:', err);
            }
        }

        // 2. Отказоустойчивый перевод через активное ИИ-ядро MoonSSS
        try {
            const orKey = (s.orKey || '').trim();
            const proxyKey = (s.proxyKey || '').trim();
            const key = orKey || proxyKey;

            if (!key) {
                if (loadingEl) loadingEl.hidden = true;
                if (resultEl) resultEl.textContent = 'Укажите API-ключ DeepL, OpenRouter или ProxyAPI в настройках для выполнения перевода.';
                return;
            }

            const url = orKey
                ? 'https://openrouter.ai/api/v1/chat/completions'
                : 'https://api.proxyapi.ru/openrouter/v1/chat/completions';

            const activeModel = s.modelId || 'google/gemini-2.5-flash';
            const resp = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + key,
                    'HTTP-Referer': 'https://unichat2.sahbanovtimur228.workers.dev/ai',
                    'X-Title': 'MoonSSS DeepL Translation'
                },
                body: JSON.stringify({
                    model: activeModel,
                    messages: [
                        {
                            role: 'system',
                            content: `You are an accurate professional translator. Translate the given text into ${targetLang}. Output ONLY the direct translated text. Do NOT include quotes, explanations, or any emojis.`
                        },
                        {
                            role: 'user',
                            content: text
                        }
                    ],
                    temperature: 0.1,
                    max_tokens: 1500
                })
            });

            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const resJson = await resp.json();
            const translation = resJson?.choices?.[0]?.message?.content || '';

            if (loadingEl) loadingEl.hidden = true;
            if (resultEl) resultEl.textContent = translation.trim() || 'Не удалось получить перевод.';
        } catch (e) {
            if (loadingEl) loadingEl.hidden = true;
            if (resultEl) resultEl.textContent = 'Ошибка выполнения перевода: ' + (e.message || e);
        }
    }
}

window.textSelectionMenu = new TextSelectionMenuController();