/* ============================================================
   aiInput.js — Pure Vanilla ES6+ Prompt Input Controller
   Пружинная кинематика, вложения, запись голоса, эквалайзер и FLIP-галерея
============================================================ */
'use strict';

class PromptInputController {
    constructor() {
        this.container = null;
        this.textarea = null;
        this.card = null;
        this.attachmentDrawer = null;
        this.attachmentTrack = null;
        this.placeholderBtn = null;
        this.bottomBar = null;
        this.modelSelectBtn = null;
        this.modelDropdown = null;
        this.modelDropdownList = null;
        this.modelHoverPill = null;
        this.modelSearchInput = null;
        this.modelRefreshBtn = null;
        this.modelTab = 'curated'; // 'curated' | 'openrouter' | 'all'
        this.modelSearchQuery = '';

        this.effortBtn = null;
        this.effortDropdown = null;
        this.effortDropdownList = null;
        this.effortHoverPill = null;
        this.isEffortSelectOpen = false;

        this.micBtn = null;
        this.actionBtn = null;
        this.visualizer = null;
        this.topFade = null;
        this.bottomFade = null;
        this.fileInput = null;

        this.expanded = false;
        this.isSmoothResize = false;
        this.isRecording = false;
        this.isTranscribing = false;
        this.isModelSelectOpen = false;
        this.justExpanded = false;
        this.mobileExpandTimer = null;

        this.attachments = [];
        this.audioData = new Array(5).fill(0);

        // Web Audio & Media Recording for Whisper
        this.audioContext = null;
        this.mediaStream = null;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.analyser = null;
        this.rafId = null;

        this.minTextareaHeight = 42;
        this.maxTextareaHeight = 160;
        this.bottomBarSpace = 44;

        this.thumbRefs = new Map();
        this.activeModalEl = null;
        this.layoutFrame = null;
        this.modelSearchTimer = null;
        this.morphTimers = new WeakMap();
        this.isStartingRecording = false;

        this.init();
    }

    init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.bindElements());
        } else {
            this.bindElements();
        }
    }

    bindElements() {
        this.container = document.getElementById('promptInputContainer');
        this.card = document.getElementById('promptInputCard');
        this.textarea = document.getElementById('promptInput');
        this.attachmentDrawer = document.getElementById('promptAttachmentDrawer');
        this.attachmentTrack = document.getElementById('promptAttachmentTrack');
        this.placeholderBtn = document.getElementById('promptPlaceholderBtn');
        this.bottomBar = document.getElementById('promptBottomBar');
        this.modelSelectBtn = document.getElementById('promptModelSelectBtn');
        this.modelDropdown = document.getElementById('promptModelDropdown');
        this.modelDropdownList = document.getElementById('promptModelDropdownList');
        this.modelHoverPill = document.getElementById('promptModelHoverPill');
        this.modelSearchInput = document.getElementById('promptModelSearchInput');
        this.modelRefreshBtn = document.getElementById('promptModelRefreshBtn');

        this.effortBtn = document.getElementById('promptEffortBtn');
        this.effortDropdown = document.getElementById('promptEffortDropdown');
        this.effortDropdownList = document.getElementById('promptEffortDropdownList');
        this.effortHoverPill = document.getElementById('promptEffortHoverPill');

        this.micBtn = document.getElementById('btnMic');
        this.actionBtn = document.getElementById('btnSend');
        this.visualizer = document.getElementById('promptAudioVisualizer');
        this.topFade = document.getElementById('promptFadeTop');
        this.bottomFade = document.getElementById('promptFadeBottom');
        this.fileInput = document.getElementById('imgInput');

        if (!this.container || !this.textarea) return;

        this.setupEventListeners();
        if (this.bottomBar) this.bottomBar.inert = !this.expanded;
        this.syncModelAndEffort();
        this.syncWithPendingAtt();
        this.updateActionState();
        this.updateFades();

        if (this.isMobileDevice() && this.textarea && !this.expanded) {
            this.textarea.readOnly = true;
            this.textarea.setAttribute('inputmode', 'none');
        }
    }

    setupEventListeners() {
        // Drag and Drop файлов напрямую на контейнер ввода
        if (this.container) {
            ['dragenter', 'dragover'].forEach(evt => {
                this.container.addEventListener(evt, e => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (this.card) this.card.classList.add('is-dragover');
                });
            });

            ['dragleave', 'dragend'].forEach(evt => {
                this.container.addEventListener(evt, e => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!this.container.contains(e.relatedTarget) && this.card) {
                        this.card.classList.remove('is-dragover');
                    }
                });
            });

            this.container.addEventListener('drop', async e => {
                e.preventDefault();
                e.stopPropagation();
                if (this.card) this.card.classList.remove('is-dragover');
                const files = e.dataTransfer?.files;
                if (files && files.length > 0 && typeof window.addFiles === 'function') {
                    await window.addFiles(files);
                }
            });
        }

        // Клик по плейсхолдеру или свернутой карточке раскрывает поле ввода
        const handleExpandTrigger = (e) => {
            if (this.expanded) return;
            if (e.target.closest('.prompt-mic-btn, .prompt-action-btn, #btnMic, #btnSend')) return;
            e.preventDefault();
            e.stopPropagation();

            if (this.isMobileDevice()) {
                this.justExpanded = true;
                clearTimeout(this.mobileExpandTimer);
                this.expand(false);
                this.mobileExpandTimer = setTimeout(() => {
                    this.justExpanded = false;
                    if (this.expanded && this.textarea) {
                        this.textarea.readOnly = false;
                        this.textarea.removeAttribute('inputmode');
                    }
                }, 350);
            } else {
                this.expand(true);
            }
        };

        if (this.placeholderBtn) {
            this.placeholderBtn.addEventListener('click', handleExpandTrigger);
        }

        if (this.card) {
            this.card.addEventListener('click', (e) => {
                if (!this.expanded) {
                    handleExpandTrigger(e);
                    return;
                }
                // Повторное нажатие по уже открытому полю ввода на смартфонах вызывает клавиатуру
                if (this.isMobileDevice() && !this.justExpanded) {
                    if (e.target.closest('.prompt-pill-btn, .prompt-mic-btn, .prompt-action-btn, #btnMic, #btnSend, .prompt-attachment-thumb, .prompt-attachment-file, .prompt-attachment-more, .prompt-model-dropdown, #plusMenu')) {
                        return;
                    }
                    if (this.textarea) {
                        this.textarea.readOnly = false;
                        this.textarea.removeAttribute('inputmode');
                        if (document.activeElement !== this.textarea) {
                            this.textarea.focus();
                        }
                    }
                }
            });
        }

        // Тап по тексту в открытом состоянии активирует ввод
        this.textarea.addEventListener('pointerup', () => {
            if (this.isMobileDevice() && this.expanded && !this.justExpanded) {
                if (this.textarea.readOnly) {
                    this.textarea.readOnly = false;
                    this.textarea.removeAttribute('inputmode');
                    this.textarea.focus();
                }
            }
        });

        // Авто-рост и фейды при вводе
        this.textarea.addEventListener('input', () => {
            this.isSmoothResize = true;
            this.adjustHeight();
            this.updateActionState();
        });
        this.textarea.addEventListener('focus', () => {
            if (this.isMobileDevice() && (this.justExpanded || !this.expanded)) {
                this.textarea.blur();
                return;
            }
            if (!this.expanded) {
                this.expand(false);
            }
        });

        const updateViewport = () => {
            this.adjustHeight();
            if (!this.isMobileDevice()) {
                if (this.textarea) {
                    this.textarea.readOnly = false;
                    this.textarea.removeAttribute('inputmode');
                }
            } else if (!this.expanded) {
                if (this.textarea) {
                    this.textarea.readOnly = true;
                    this.textarea.setAttribute('inputmode', 'none');
                }
            }
        };
        window.addEventListener('resize', updateViewport, { passive: true });
        window.visualViewport?.addEventListener('resize', updateViewport, { passive: true });
        window.visualViewport?.addEventListener('scroll', updateViewport, { passive: true });
        [this.modelDropdownList, this.effortDropdownList].forEach((list, index) => {
            list?.addEventListener('mouseleave', () => {
                const pill = index === 0 ? this.modelHoverPill : this.effortHoverPill;
                if (pill) pill.style.opacity = '0';
            });
        });
        [this.modelDropdown, this.effortDropdown].forEach(menu => {
            menu?.addEventListener('keydown', e => {
                if (e.isComposing) return;
                if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    const trigger = menu === this.modelDropdown ? this.modelSelectBtn : this.effortBtn;
                    this.closeModelDropdown();
                    this.closeEffortDropdown();
                    trigger?.focus({ preventScroll: true });
                    return;
                }
                if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
                if (e.target.matches('input') && e.key !== 'ArrowDown') return;
                const items = [...menu.querySelectorAll('.prompt-drop-item, .p-effort-item:not([disabled])')];
                if (!items.length) return;
                e.preventDefault();
                e.stopPropagation();
                const index = items.indexOf(document.activeElement);
                const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1
                    : (index + (e.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
                items[next].focus({ preventScroll: true });
                items[next].scrollIntoView({ block: 'nearest' });
            });
        });

        this.textarea.addEventListener('scroll', () => {
            this.updateFades();
        }, { passive: true });

        // Закрытие при клике снаружи с регистрацией элементов в LiquidGlassController
        document.addEventListener('pointerdown', (e) => {
            if (!this.container) return;
            const clickedInside = this.container.contains(e.target)
                || this.modelDropdown?.contains(e.target) || this.effortDropdown?.contains(e.target)
                || e.target.closest('#plusMenu, #searchPanel, #slashMenu');
            const hasAttachments = this.attachments.length > 0 || (window.pendingAtt && window.pendingAtt.length > 0);
            const hasValue = (this.textarea.value || '').trim() !== '';

            if (!clickedInside && !hasValue && !hasAttachments && !this.hasValue() && !this.isRecording && !this.isTranscribing) {
                this.collapse();
            }

            if (this.isModelSelectOpen && this.modelDropdown && !this.modelDropdown.contains(e.target) && !this.modelSelectBtn.contains(e.target)) {
                this.closeModelDropdown();
            }

            if (this.isEffortSelectOpen && this.effortDropdown && !this.effortDropdown.contains(e.target) && !this.effortBtn.contains(e.target)) {
                this.closeEffortDropdown();
            }
        });

        // Модель: открытие селектора
        if (this.modelSelectBtn) {
            this.modelSelectBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.closeEffortDropdown();
                this.toggleModelDropdown();
            });
        }

        // Поиск модели
        if (this.modelSearchInput) {
            this.modelSearchInput.addEventListener('input', (e) => {
                this.modelSearchQuery = e.target.value.trim().toLowerCase();
                clearTimeout(this.modelSearchTimer);
                this.modelSearchTimer = setTimeout(() => {
                    if (this.isModelSelectOpen) this.renderModelList();
                }, 120);
            });
            this.modelSearchInput.addEventListener('click', (e) => e.stopPropagation());
        }

        // Обновление каталога OpenRouter
        if (this.modelRefreshBtn) {
            this.modelRefreshBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (typeof window.refreshOpenRouterModels === 'function') {
                    this.modelRefreshBtn.classList.add('spinning');
                    await window.refreshOpenRouterModels(false);
                    this.modelRefreshBtn.classList.remove('spinning');
                    this.renderModelList();
                }
            });
        }

        // Вкладки категорий моделей (Встроенные, OpenRouter, Все)
        if (this.modelDropdown) {
            const tabButtons = this.modelDropdown.querySelectorAll('.p-drop-tab-btn');
            tabButtons.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    tabButtons.forEach(b => b.classList.remove('is-active'));
                    btn.classList.add('is-active');
                    this.modelTab = btn.dataset.tab;
                    this.renderModelList();
                });
            });
        }

        // Размышления: открытие селектора
        if (this.effortBtn) {
            this.effortBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.closeModelDropdown();
                this.toggleEffortDropdown();
            });
        }

        // Голосовой ввод: микрофон (Whisper)
        if (this.micBtn) {
            this.micBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (this.isTranscribing) return;
                if (this.isRecording) {
                    this.stopRecording();
                } else {
                    this.startRecording();
                }
            });
        }

        // Синхронизация состояния отправки (нажатие обрабатывается централизованно в ai.js)
        // Send/stop is handled once, centrally in ai.js.

        // Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this.fileCtxMenu) {
                    this.closeFileContextMenu();
                    return;
                }
                if (this.isModelSelectOpen) {
                    this.closeModelDropdown();
                    return;
                }
                if (this.isEffortSelectOpen) {
                    this.closeEffortDropdown();
                    return;
                }
                if (this.isRecording) {
                    this.stopRecording();
                    return;
                }
                if (!this.hasValue() && this.attachments.length === 0 && this.expanded) {
                    this.collapse();
                }
            }
        });

        // Закрытие контекстного меню файла при клике или скролле
        document.addEventListener('pointerdown', (e) => {
            if (this.fileCtxMenu && !this.fileCtxMenu.contains(e.target)) {
                this.closeFileContextMenu();
            }
        });
        window.addEventListener('scroll', () => this.closeFileContextMenu(), { passive: true });
    }

    hasValue() {
        if (typeof window.hasComposerContent === 'function') return window.hasComposerContent();
        const textHas = (this.textarea?.value || '').trim() !== '';
        const attHas = this.attachments.length > 0 || (window.pendingAtt && window.pendingAtt.length > 0);
        const refHas = !!(window.artEditRef || (window.editImages && window.editImages.length > 0));
        return textHas || attHas || refHas;
    }

    isMobileDevice() {
        if (typeof window.checkIsMobile === 'function') {
            return window.checkIsMobile();
        }
        return Boolean(
            (window.matchMedia && matchMedia('(pointer:coarse)').matches) ||
            window.innerWidth <= 768 ||
            (window.Capacitor && (typeof Capacitor.isNativePlatform === 'function' ? Capacitor.isNativePlatform() : Capacitor.isNative))
        );
    }

    expand(focus = null) {
        this.isSmoothResize = false;
        this.expanded = true;
        this.container.classList.add('is-expanded');
        this.card.classList.add('is-expanded');
        if (this.bottomBar) this.bottomBar.inert = false;
        if (this.placeholderBtn) this.placeholderBtn.inert = true;
        this.adjustHeight();

        if (this.isMobileDevice()) {
            if (focus) {
                if (this.textarea) {
                    this.textarea.readOnly = false;
                    this.textarea.removeAttribute('inputmode');
                    if (document.activeElement !== this.textarea) {
                        this.textarea.focus({ preventScroll: true });
                    }
                }
            } else {
                // При первичном раскрытии на мобильных устройствах поле разворачивается без вызова клавиатуры
                if (this.textarea) {
                    this.textarea.readOnly = true;
                    this.textarea.setAttribute('inputmode', 'none');
                }
            }
        } else {
            if (this.textarea) {
                this.textarea.readOnly = false;
                this.textarea.removeAttribute('inputmode');
            }
            const shouldFocus = focus !== null ? Boolean(focus) : true;
            if (shouldFocus && document.activeElement !== this.textarea) {
                this.textarea.focus({ preventScroll: true });
            }
        }
    }

    collapse() {
        this.isSmoothResize = false;
        this.expanded = false;
        this.justExpanded = false;
        clearTimeout(this.mobileExpandTimer);
        this.closeFileContextMenu();
        this.container.classList.remove('is-expanded');
        this.card.classList.remove('is-expanded');
        if (this.bottomBar) this.bottomBar.inert = true;
        if (this.placeholderBtn) this.placeholderBtn.inert = false;
        if (document.activeElement === this.textarea) this.textarea.blur();
        this.closeModelDropdown();
        this.closeEffortDropdown();
        this.card.style.height = '48px';
        if (this.textarea) {
            this.textarea.style.height = `${this.minTextareaHeight}px`;
            this.textarea.style.overflowY = 'hidden';
            if (this.isMobileDevice()) {
                this.textarea.readOnly = true;
                this.textarea.setAttribute('inputmode', 'none');
            } else {
                this.textarea.readOnly = false;
                this.textarea.removeAttribute('inputmode');
            }
        }
    }

    adjustHeight() {
        if (this.layoutFrame) return;
        this.layoutFrame = requestAnimationFrame(() => {
            this.layoutFrame = null;
            this.measureHeight();
            this.updateFades();
            this.positionDropdowns();
        });
    }

    measureHeight() {
        if (!this.textarea || !this.card) return;
        if (!this.expanded) {
            this.card.style.height = '48px';
            if (this.textarea) this.textarea.style.height = `${this.minTextareaHeight}px`;
            return;
        }

        // Сохраняем позицию прокрутки и сбрасываем textarea на базовую высоту строки перед замером scrollHeight
        const prevScrollTop = this.textarea.scrollTop;
        this.textarea.style.height = `${this.minTextareaHeight}px`;
        const scrollH = this.textarea.scrollHeight;
        const viewportH = window.visualViewport?.height || window.innerHeight;
        const maxHeight = Math.max(this.minTextareaHeight, Math.min(this.maxTextareaHeight, viewportH * 0.28));

        // Рост происходит исключительно при реальном переносе на новую строку и уменьшается при удалении текста
        const newTextareaH = Math.max(this.minTextareaHeight, Math.min(scrollH, maxHeight));
        this.textarea.style.height = `${newTextareaH}px`;
        this.textarea.style.overflowY = scrollH > maxHeight ? 'auto' : 'hidden';
        this.textarea.scrollTop = prevScrollTop;

        const totalH = newTextareaH + this.bottomBarSpace;
        this.card.style.height = `${totalH}px`;
    }

    positionDropdowns() {
        // Dropdowns are anchored to #promptInputContainer as monolithic extensions of the input card.
    }

    updateFades() {
        if (!this.textarea || !this.topFade || !this.bottomFade) return;
        const { scrollTop, scrollHeight, clientHeight } = this.textarea;
        this.topFade.style.opacity = Math.min(scrollTop / 20, 1).toString();
        const bottomScroll = scrollHeight - clientHeight - scrollTop;
        this.bottomFade.style.opacity = Math.min(Math.max(bottomScroll - 16, 0) / 10, 1).toString();
    }

    updateActionState() {
        const isStreaming = !!window.streaming;
        const hasVal = this.hasValue();

        const showActionBtn = !this.isRecording && !this.isTranscribing && (hasVal || isStreaming);
        const showMicBtn = this.isRecording || this.isTranscribing || (!hasVal && !isStreaming);

        if (this.actionBtn) {
            const arrow = this.actionBtn.querySelector('.prompt-act-arrow');
            const stop = this.actionBtn.querySelector('.prompt-act-stop');

            if (arrow) arrow.classList.toggle('show', !isStreaming);
            if (stop) stop.classList.toggle('show', isStreaming);

            this.actionBtn.classList.toggle('is-stop', isStreaming);
            this.actionBtn.classList.toggle('stop', isStreaming);
            this.actionBtn.classList.toggle('idle', !hasVal && !isStreaming);
            this.actionBtn.classList.toggle('is-hidden', !showActionBtn);

            const title = isStreaming ? 'Остановить генерацию' : 'Отправить';
            this.actionBtn.title = title;
            this.actionBtn.setAttribute('aria-label', title);
        }

        if (this.micBtn) {
            this.micBtn.classList.toggle('is-recording', this.isRecording);
            this.micBtn.classList.toggle('is-transcribing', this.isTranscribing);
            this.micBtn.classList.toggle('is-hidden', !showMicBtn);

            const micTitle = this.isTranscribing
                ? 'Whisper распознает речь…'
                : (this.isRecording ? 'Остановить запись и перевести через Whisper' : 'Голосовой ввод (Whisper)');
            this.micBtn.title = micTitle;
            this.micBtn.setAttribute('aria-label', micTitle);
        }
    }

    // ── Модели и Эффорт ──
    syncModelAndEffort() {
        const s = (window.state && window.state.settings) || {};
        const curChat = typeof window.activeChat === 'function' ? window.activeChat() : null;
        const isImageMode = (curChat && curChat.mode === 'image') || window.currentAppRoomMode === 'image' || document.querySelector('.app')?.classList.contains('mode-image-studio');

        if (isImageMode) {
            const list = window.IMG_MODELS || (window.toolCalling && window.toolCalling.IMG_MODELS) || [];
            const activeImgModelId = s.imgGen?.model || (list[0] && list[0].id) || 'black-forest-labs/flux.2-pro';
            const imgModel = list.find(m => m.id === activeImgModelId) || list[0] || { name: 'FLUX.2 Pro' };

            const modelTextEl = document.getElementById('promptModelNameText');
            if (modelTextEl) this.setMorphingText(modelTextEl, imgModel.name);

            const iconBox = document.getElementById('promptModelIconBox');
            if (iconBox) {
                const iconUrl = imgModel.icon || (typeof window.getAiModelIcon === 'function' ? window.getAiModelIcon(imgModel.id, imgModel) : null);
                iconBox.innerHTML = iconUrl
                    ? `<img src="${window.esc(iconUrl)}" class="p-model-img" alt="">`
                    : `<svg class="ic"><use href="#i-image"/></svg>`;
            }

            if (this.placeholderBtn) this.placeholderBtn.textContent = 'Опишите изображение для генерации…';
            if (this.textarea && !this.textarea.value) this.textarea.placeholder = 'Опишите изображение для генерации…';
            return;
        }

        if (this.placeholderBtn) this.placeholderBtn.textContent = 'Ask anything…';
        if (this.textarea && !this.textarea.value) this.textarea.placeholder = 'Ask anything…';

        const modelId = s.modelId || 'anthropic/claude-sonnet-5.5';
        const modelObj = typeof window.getModel === 'function' ? window.getModel(modelId) : null;
        const modelName = modelObj ? modelObj.name : modelId.split('/').pop();

        const baseId = (modelId || '').replace(/:[a-zA-Z0-9_.-]+$/i, '');
        const modelCfg = (s.modelProviders && (s.modelProviders[modelId] || s.modelProviders[baseId])) || {};
        const suffixMatch = (modelId || '').match(/:(nitro|exacto|free|online|extended)$/i);
        const effectiveFlavor = modelCfg.flavor || (suffixMatch ? suffixMatch[1].toLowerCase() : 'standard');
        const flavorLabel = (effectiveFlavor && effectiveFlavor !== 'standard' && effectiveFlavor !== 'default') ? ` :${effectiveFlavor}` : '';

        const modelTextEl = document.getElementById('promptModelNameText');
        if (modelTextEl) this.setMorphingText(modelTextEl, modelName + flavorLabel);

        const iconBox = document.getElementById('promptModelIconBox');
        if (iconBox) {
            const iconUrl = (typeof window.getAiModelIcon === 'function' ? window.getAiModelIcon(modelId, modelObj) : null) || modelObj?.icon;
            iconBox.innerHTML = iconUrl
                ? `<img src="${window.esc(iconUrl)}" class="p-drop-icon" alt="" onerror="this.outerHTML='<svg class=\\'ic\\'><use href=\\'#i-chip\\'/></svg>'">`
                : `<svg class="ic"><use href="#i-chip"/></svg>`;
        }

        const chosenEffort = modelCfg.reasoningEffort || s.reasoningEffort || 'medium';
        const mode = s.reasoning || 'off';
        const isFable = (modelId || '').includes('fable-5');
        const isOpus = (modelId || '').includes('opus-5');

        let displayLabel = '';
        if (isFable) {
            displayLabel = `by Claude (effort: ${chosenEffort})`;
        } else if (mode === 'off' && (!isOpus || (chosenEffort !== 'xhigh' && chosenEffort !== 'max'))) {
            displayLabel = 'Выкл';
        } else {
            const modeLabels = {
                off: 'Выкл',
                low: 'Low',
                medium: 'Medium',
                mid: 'Medium',
                high: 'High',
                xhigh: 'Extra',
                max: 'Max',
                always: 'Авто',
                minimal: 'Minimal'
            };
            const modeName = modeLabels[mode] || mode;
            displayLabel = `${modeName} (effort: ${chosenEffort})`;
        }

        const effortTextEl = document.getElementById('promptEffortNameText');
        if (effortTextEl) this.setMorphingText(effortTextEl, displayLabel);

        const bar1 = this.container?.querySelector('.p-bar-1');
        const bar2 = this.container?.querySelector('.p-bar-2');
        const bar3 = this.container?.querySelector('.p-bar-3');

        const isMedOrHigh = ['medium', 'mid', 'high', 'xhigh', 'max', 'always'].includes(chosenEffort);
        const isHigh = ['high', 'xhigh', 'max'].includes(chosenEffort);

        if (bar1) bar1.setAttribute('opacity', mode === 'off' && (!isOpus || (chosenEffort !== 'xhigh' && chosenEffort !== 'max')) ? '0.3' : '1');
        if (bar2) bar2.setAttribute('opacity', isMedOrHigh ? '1' : '0.3');
        if (bar3) bar3.setAttribute('opacity', isHigh ? '1' : '0.3');
    }

    setMorphingText(element, text) {
        if (!element) return;
        if (element.textContent === text) return;

        clearTimeout(this.morphTimers.get(element));
        element.classList.add('is-morphing');
        this.morphTimers.set(element, setTimeout(() => {
            element.textContent = text;
            element.classList.remove('is-morphing');
        }, 150));
    }

    toggleModelDropdown() {
        if (this.isModelSelectOpen) this.closeModelDropdown();
        else this.openModelDropdown();
    }

    openModelDropdown() {
        if (!this.modelDropdown || !this.modelDropdownList) return;
        this.closeEffortDropdown();
        if (typeof window.closeAllMenus === 'function') window.closeAllMenus(this.modelDropdown);

        this.expand(false);
        this.container?.classList.add('has-menu-open', 'has-model-open');
        this.card?.classList.add('shell-open');

        this.modelDropdown.hidden = false;
        this.modelDropdown.classList.add('is-open');
        this.isModelSelectOpen = true;
        this.modelSelectBtn?.setAttribute('aria-expanded', 'true');

        if (this.modelSearchInput) {
            this.modelSearchInput.value = this.modelSearchQuery;
            if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
                this.modelSearchInput.focus({ preventScroll: true });
            }
        }

        this.renderModelList();
    }

    renderModelList() {
        if (!this.modelDropdownList) return;
        const curChat = typeof window.activeChat === 'function' ? window.activeChat() : null;
        const isImageMode = (curChat && curChat.mode === 'image') || window.currentAppRoomMode === 'image' || document.querySelector('.app')?.classList.contains('mode-image-studio');
        const s = (window.state && window.state.settings) || {};

        if (isImageMode) {
            const list = window.IMG_MODELS || (window.toolCalling && window.toolCalling.IMG_MODELS) || [];
            const activeImgModelId = s.imgGen?.model || (list[0] && list[0].id);

            this.modelDropdownList.innerHTML = `<div id="promptModelHoverPill" class="prompt-hover-pill" aria-hidden="true"></div>` + list.map((m, idx) => {
                const isSel = m.id === activeImgModelId;
                const iconUrl = m.icon || (typeof window.getAiModelIcon === 'function' ? window.getAiModelIcon(m.id, m) : null);
                const iconHtml = iconUrl
                    ? `<img src="${window.esc(iconUrl)}" class="p-drop-icon" alt="">`
                    : `<svg class="ic"><use href="#i-image"/></svg>`;

                return `
                    <div class="p-drop-row" data-imid="${window.esc(m.id)}">
                        <button type="button" class="prompt-drop-item ${isSel ? 'is-selected' : ''}" data-imid="${window.esc(m.id)}" data-idx="${idx}">
                            <div class="p-drop-left">
                                ${iconHtml}
                                <div class="p-drop-details">
                                    <div class="p-drop-name-row">
                                        <span class="p-drop-name">${window.esc(m.name)}</span>
                                    </div>
                                    <div class="p-drop-badges">
                                        <span class="p-drop-badge is-prov">${window.esc(m.vendor || 'Art AI')}</span>
                                        <span class="p-drop-badge">${window.esc(m.desc || '')}</span>
                                    </div>
                                </div>
                            </div>
                            ${isSel ? '<svg class="ic p-drop-check"><use href="#i-check"/></svg>' : ''}
                        </button>
                    </div>
                `;
            }).join('');

            this.modelHoverPill = this.modelDropdownList.querySelector('#promptModelHoverPill');
            this.modelDropdownList.querySelectorAll('.prompt-drop-item').forEach(btn => {
                btn.addEventListener('mouseenter', () => {
                    if (this.modelHoverPill) {
                        this.modelHoverPill.style.opacity = '1';
                        this.modelHoverPill.style.transform = `translateY(${btn.parentElement.offsetTop}px)`;
                        this.modelHoverPill.style.height = `${btn.parentElement.offsetHeight}px`;
                    }
                });
                btn.addEventListener('click', () => {
                    const imid = btn.dataset.imid;
                    if (!s.imgGen) s.imgGen = {};
                    s.imgGen.model = imid;
                    if (typeof window.save === 'function') window.save();
                    this.syncModelAndEffort();
                    this.closeModelDropdown();
                    if (typeof window.toast === 'function') {
                        const selModel = list.find(x => x.id === imid);
                        window.toast('Модель генерации: ' + (selModel ? selModel.name : imid), 'ok', 1400);
                    }
                });
            });
            return;
        }

        const allModels = typeof window.getAllModels === 'function' ? window.getAllModels() : (window.MODELS || []);
        const activeId = s.modelId || '';
        const query = this.modelSearchQuery;

        // Фильтрация по выбранной вкладке (Встроенные / OpenRouter / Все)
        let filtered = allModels.filter(m => {
            if (this.modelTab === 'curated' && m.isOpenRouterDynamic) return false;
            if (this.modelTab === 'openrouter' && !m.isOpenRouterDynamic) return false;
            if (query) {
                const nameMatch = (m.name || '').toLowerCase().includes(query);
                const idMatch = (m.id || '').toLowerCase().includes(query);
                const providerMatch = (m.provider || '').toLowerCase().includes(query);
                return nameMatch || idMatch || providerMatch;
            }
            return true;
        });

        if (this.modelTab === 'openrouter') {
            filtered.sort((a, b) => (b.created || 0) - (a.created || 0) || a.name.localeCompare(b.name));
        }

        if (!filtered.length) {
            this.modelDropdownList.innerHTML = `<div class="p-drop-empty no-sel" style="padding:16px 8px;text-align:center;font-size:11.5px;color:var(--text-faint)">Модели не найдены</div>`;
            return;
        }

        this.modelDropdownList.innerHTML = `<div id="promptModelHoverPill" class="prompt-hover-pill" aria-hidden="true"></div>` + filtered.map((m, idx) => {
            const baseId = m.id.replace(/:[a-zA-Z0-9_.-]+$/i, '');
            const isSel = m.id === activeId || baseId === activeId;
            const iconUrl = (typeof window.getAiModelIcon === 'function' ? window.getAiModelIcon(m.id, m) : null) || m.icon;
            const iconHtml = iconUrl
                ? `<img src="${window.esc(iconUrl)}" class="p-drop-icon" alt="">`
                : `<svg class="ic"><use href="#i-chip"/></svg>`;

            const isFree = m.id.endsWith(':free') || m.pricing?.isFree || (m.tagline && m.tagline.toLowerCase().includes('free'));
            const thinkingCfgs = typeof window.getModelThinkingConfig === 'function' ? window.getModelThinkingConfig(m) : [];
            const hasReasoning = m.reasoning || thinkingCfgs.some(c => c.value !== 'off' && c.value !== 'not-supported');
            const hasVision = !!m.vision;

            const ctxLabel = m.context || (m.contextLength ? `${Math.round(m.contextLength / 1000)}K` : null);
            const modelCfg = (s.modelProviders && (s.modelProviders[m.id] || s.modelProviders[baseId])) || {};
            const provSlug = modelCfg.selectedProvider && modelCfg.selectedProvider !== 'auto' ? modelCfg.selectedProvider : '';
            const provText = provSlug ? provSlug.toUpperCase() : (m.provider || 'AI');

            const flavorsList = typeof window.getModelAvailableFlavors === 'function'
                ? window.getModelAvailableFlavors(m)
                : [{ id: 'standard', label: 'Стандарт', desc: 'Базовый маршрут' }];
            const validFlavorIds = new Set(flavorsList.map(f => f.id));
            const suffixMatch = (activeId || '').match(/:(nitro|exacto|free|online|extended)$/i);
            const effectiveFlavor = (modelCfg.flavor && validFlavorIds.has(modelCfg.flavor))
                ? modelCfg.flavor
                : (isSel && suffixMatch && validFlavorIds.has(suffixMatch[1].toLowerCase()) ? suffixMatch[1].toLowerCase() : 'standard');

            let priceText = '';
            if (isFree) {
                priceText = 'Free ($0)';
            } else if (m.pricing?.promptFormatted && m.pricing?.completionFormatted) {
                priceText = `In: ${m.pricing.promptFormatted} · Out: ${m.pricing.completionFormatted}`;
            }

            const flavorsHtml = (isSel && flavorsList.length > 1) ? `
                <div class="p-drop-flavors no-sel" role="radiogroup" aria-label="Выбор варианта (Flavor) для ${window.esc(m.name)}">
                    <span class="p-drop-flavor-label">Режим:</span>
                    ${flavorsList.map(f => `
                        <button type="button" class="p-flavor-chip ${f.id === effectiveFlavor ? 'is-selected' : ''}" data-flavor-mid="${window.esc(m.id)}" data-flavor="${f.id}" title="${window.esc(f.desc || '')}">
                            ${window.esc(f.label)}
                        </button>
                    `).join('')}
                </div>
            ` : '';

            return `
                <div class="p-drop-row ${isSel ? 'is-active-row' : ''}" data-mid="${window.esc(m.id)}">
                    <div class="p-drop-main-bar">
                        <button type="button" class="prompt-drop-item ${isSel ? 'is-selected' : ''}" data-mid="${window.esc(m.id)}" data-idx="${idx}" title="Клик — выбрать модель · ПКМ / зажатие — настроить провайдера">
                            <div class="p-drop-left">
                                ${iconHtml}
                                <div class="p-drop-details">
                                    <div class="p-drop-name-row">
                                        <span class="p-drop-name">${window.esc(m.name)}</span>
                                        ${effectiveFlavor && effectiveFlavor !== 'standard' ? `<span class="prov-flavor-pill">:${window.esc(effectiveFlavor)}</span>` : ''}
                                    </div>
                                    <div class="p-drop-badges">
                                        <span class="p-drop-badge is-prov">${window.esc(provText)}</span>
                                        ${effectiveFlavor && effectiveFlavor !== 'standard' ? `<span class="p-drop-badge is-flavor">${window.esc(effectiveFlavor.toUpperCase())}</span>` : ''}
                                        ${ctxLabel ? `<span class="p-drop-badge is-ctx">${window.esc(ctxLabel)} Ctx</span>` : ''}
                                        ${priceText ? `<span class="p-drop-badge ${isFree ? 'is-free' : 'is-price'}">${window.esc(priceText)}</span>` : ''}
                                        ${hasReasoning ? `<span class="p-drop-badge is-reasoning">Reasoning</span>` : ''}
                                        ${hasVision ? `<span class="p-drop-badge">Vision</span>` : ''}
                                    </div>
                                </div>
                            </div>
                            ${isSel ? '<svg class="ic p-drop-check"><use href="#i-check"/></svg>' : ''}
                        </button>
                        <button type="button" class="p-drop-cfg-btn" data-cfg-mid="${window.esc(m.id)}" title="Настроить узел инференса, провайдер и параметры модели">
                            <svg class="ic"><use href="#i-gear"/></svg>
                        </button>
                    </div>
                    ${flavorsHtml}
                </div>
            `;
        }).join('');

        this.modelHoverPill = this.modelDropdownList.querySelector('#promptModelHoverPill');
        const rows = this.modelDropdownList.querySelectorAll('.p-drop-row');
        rows.forEach((row) => {
            const item = row.querySelector('.prompt-drop-item');
            const cfgBtn = row.querySelector('.p-drop-cfg-btn');
            const mid = row.dataset.mid;

            let lpTimer = null;
            let longPressed = false;
            let startX = 0;
            let startY = 0;

            item.addEventListener('mouseenter', () => {
                if (this.modelHoverPill) {
                    this.modelHoverPill.style.opacity = '1';
                    this.modelHoverPill.style.transform = `translateY(${row.offsetTop}px)`;
                    this.modelHoverPill.style.height = `${row.offsetHeight}px`;
                }
            });

            const triggerProviderFlyout = () => {
                this.closeModelDropdown();
                if (typeof window.openModelProviderFlyout === 'function') {
                    window.openModelProviderFlyout(mid);
                } else {
                    console.warn('[PromptInput] openModelProviderFlyout is not available');
                }
            };

            // Кнопка прямой настройки провайдера
            if (cfgBtn) {
                cfgBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    triggerProviderFlyout();
                });
            }

            // 1. Контекстное меню по ПКМ (Десктоп)
            item.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                triggerProviderFlyout();
            });

            // 2. Долгое зажатие на 450 мс (Мобильные устройства / Touch)
            item.addEventListener('pointerdown', (e) => {
                if (e.pointerType === 'mouse' && e.button !== 0) return;
                longPressed = false;
                startX = e.clientX;
                startY = e.clientY;
                clearTimeout(lpTimer);
                lpTimer = setTimeout(() => {
                    longPressed = true;
                    if (navigator.vibrate) {
                        try { navigator.vibrate(20); } catch (_) { }
                    }
                    triggerProviderFlyout();
                }, 450);
            });

            item.addEventListener('pointermove', (e) => {
                if (lpTimer && Math.hypot(e.clientX - startX, e.clientY - startY) > 10) {
                    clearTimeout(lpTimer);
                    lpTimer = null;
                }
            });

            const cancelLp = () => {
                if (lpTimer) {
                    clearTimeout(lpTimer);
                    lpTimer = null;
                }
            };
            item.addEventListener('pointerup', cancelLp);
            item.addEventListener('pointercancel', cancelLp);

            // 3. Обычный клик (Выбор модели)
            item.addEventListener('click', (e) => {
                if (longPressed) {
                    longPressed = false;
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
                const cleanBaseMid = mid.replace(/:[a-zA-Z0-9_.-]+$/i, '');
                const flavors = typeof window.getModelAvailableFlavors === 'function' ? window.getModelAvailableFlavors(mid) : [];
                const modelCfg = (s.modelProviders && (s.modelProviders[mid] || s.modelProviders[cleanBaseMid])) || {};
                const activeFlavor = modelCfg.flavor || (mid.endsWith(':free') ? 'free' : 'standard');

                let targetMid = cleanBaseMid;
                if (activeFlavor === 'free' && flavors.some(f => f.id === 'free')) {
                    targetMid = `${cleanBaseMid}:free`;
                } else if (activeFlavor && activeFlavor !== 'standard' && flavors.some(f => f.id === activeFlavor)) {
                    targetMid = `${cleanBaseMid}:${activeFlavor}`;
                }

                if (window.state && window.state.settings) {
                    window.state.settings.modelId = targetMid;

                    const selectedModel = typeof window.getModel === 'function' ? window.getModel(targetMid) : null;
                    const configs = typeof window.getModelThinkingConfig === 'function'
                        ? window.getModelThinkingConfig(selectedModel)
                        : [];
                    const validValues = configs.map(c => c.value);
                    if (validValues.length && !validValues.includes(window.state.settings.reasoning)) {
                        window.state.settings.reasoning = validValues.find(v => v !== 'not-supported') || validValues[0] || 'off';
                    }

                    if (typeof window.save === 'function') window.save();
                    if (typeof window.updateTopChips === 'function') window.updateTopChips();
                }
                this.syncModelAndEffort();
                this.closeModelDropdown();
            });

            // Привязка прямого выбора Flavor (Режима) внутри строки модели
            row.querySelectorAll('.p-flavor-chip').forEach(chip => {
                chip.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const targetMidBase = chip.dataset.flavorMid.replace(/:[a-zA-Z0-9_.-]+$/i, '');
                    const selectedFlavor = chip.dataset.flavor || 'standard';

                    if (!window.state) window.state = {};
                    if (!window.state.settings) window.state.settings = {};
                    if (!window.state.settings.modelProviders) window.state.settings.modelProviders = {};

                    if (!window.state.settings.modelProviders[targetMidBase]) window.state.settings.modelProviders[targetMidBase] = {};
                    window.state.settings.modelProviders[targetMidBase].flavor = selectedFlavor;
                    if (chip.dataset.flavorMid) {
                        if (!window.state.settings.modelProviders[chip.dataset.flavorMid]) window.state.settings.modelProviders[chip.dataset.flavorMid] = {};
                        window.state.settings.modelProviders[chip.dataset.flavorMid].flavor = selectedFlavor;
                    }

                    const targetModelId = (selectedFlavor === 'free')
                        ? `${targetMidBase}:free`
                        : ((selectedFlavor && selectedFlavor !== 'standard') ? `${targetMidBase}:${selectedFlavor}` : targetMidBase);

                    window.state.settings.modelId = targetModelId;

                    if (typeof window.save === 'function') window.save();
                    if (typeof window.updateTopChips === 'function') window.updateTopChips();
                    this.syncModelAndEffort();
                    this.renderModelList();
                    if (typeof window.toast === 'function') {
                        window.toast(`Режим модели: ${selectedFlavor === 'standard' ? 'Стандарт' : selectedFlavor.toUpperCase()}`, 'ok', 1400);
                    }
                });
            });
        });

        this.positionDropdowns();
    }

    closeModelDropdown() {
        if (!this.modelDropdown || !this.isModelSelectOpen) return;
        this.modelDropdown.classList.remove('is-open');
        this.modelDropdown.hidden = true;
        this.isModelSelectOpen = false;
        clearTimeout(this.modelSearchTimer);
        this.modelSelectBtn?.setAttribute('aria-expanded', 'false');
        if (this.modelHoverPill) this.modelHoverPill.style.opacity = '0';

        this.container?.classList.remove('has-model-open');
        if (!this.isEffortSelectOpen && !this.container?.classList.contains('has-plus-open')) {
            this.container?.classList.remove('has-menu-open');
            this.card?.classList.remove('shell-open');
        }
    }

    // ── Меню размышлений (Effort Dropdown) ──
    toggleEffortDropdown() {
        const curChat = typeof window.activeChat === 'function' ? window.activeChat() : null;
        const isImageMode = (curChat && curChat.mode === 'image') || window.currentAppRoomMode === 'image' || document.querySelector('.app')?.classList.contains('mode-image-studio');
        if (isImageMode) return;
        if (this.isEffortSelectOpen) this.closeEffortDropdown();
        else this.openEffortDropdown();
    }

    openEffortDropdown() {
        if (!this.effortDropdown || !this.effortDropdownList) return;
        this.closeModelDropdown();
        if (typeof window.closeAllMenus === 'function') window.closeAllMenus(this.effortDropdown);

        this.expand(false);
        this.container?.classList.add('has-menu-open', 'has-effort-open');
        this.card?.classList.add('shell-open');

        this.effortDropdown.hidden = false;
        this.effortDropdown.classList.add('is-open');
        this.isEffortSelectOpen = true;
        this.effortBtn?.setAttribute('aria-expanded', 'true');
        this.renderEffortList();
    }

    renderEffortList() {
        if (!this.effortDropdownList) return;
        const s = (window.state && window.state.settings) || {};
        const modelId = s.modelId || '';
        const model = typeof window.getModel === 'function' ? window.getModel(modelId) : null;

        const configs = typeof window.getModelThinkingConfig === 'function'
            ? window.getModelThinkingConfig(model)
            : (window.modelThinkingConfigs?.[modelId] || [
                { value: "off", label: "Отключено", desc: "Рассуждения отключены" },
                { value: "low", label: "Низкий", desc: "Быстрые рассуждения" },
                { value: "medium", label: "Средний", desc: "Сбалансированный анализ" },
                { value: "high", label: "Высокий", desc: "Глубокая логика" }
            ]);

        const activeVal = s.reasoning || 'off';

        const getStageLevel = (val) => {
            const v = String(val || '').toLowerCase();
            if (v === 'off' || v === 'none' || v === '0') return 0;
            if (v === 'low' || v === 'minimal') return 1;
            if (v === 'medium' || v === 'mid') return 2;
            if (v === 'high') return 3;
            if (v === 'max' || v === 'xhigh' || v === 'always') return 4;
            return 1;
        };

        const getStageBadge = (val) => {
            const v = String(val || '').toLowerCase();
            if (v === 'off' || v === 'none' || v === '0') return '0 TOKENS';
            if (v === 'minimal') return '512-1K';
            if (v === 'low') return '1K-2K';
            if (v === 'medium' || v === 'mid') return '4K-8K';
            if (v === 'high') return '16K-32K';
            if (v === 'xhigh') return '32K-64K';
            if (v === 'max') return '64K-128K';
            if (v === 'always') return 'АВТО';
            if (v === 'not-supported') return 'НЕДОСТУПНО';
            return v.toUpperCase();
        };

        const modelCfg = (s.modelProviders && (s.modelProviders[modelId] || s.modelProviders[modelId.replace(/:[a-zA-Z0-9_.-]+$/i, '')])) || {};
        const currentEffort = modelCfg.reasoningEffort || s.reasoningEffort || 'medium';
        const isOpus5 = (modelId || '').includes('opus-5');
        const isFable5 = (modelId || '').includes('fable-5');
        const isOpusEnforced = isOpus5 && (currentEffort === 'xhigh' || currentEffort === 'max');

        const effortLevels = [
            { id: 'low', label: 'Low', desc: 'Поверхностная глубина' },
            { id: 'medium', label: 'Medium', desc: 'Сбалансированная глубина' },
            { id: 'high', label: 'High', desc: 'Глубокая проработка' },
            { id: 'xhigh', label: 'Extra', desc: 'Усиленное проектирование' },
            { id: 'max', label: 'Max', desc: 'Предельное усилие' }
        ];

        const effortSectionHtml = `
            <div class="p-effort-section no-sel" style="padding:10px 12px;border-bottom:1px solid var(--line);">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;font-size:11.5px;color:var(--text-dim);">
                    <span>Глубина усилий (Effort): <b style="color:var(--text);">${currentEffort.toUpperCase()}</b></span>
                    ${isOpusEnforced ? '<span style="font-size:10px;color:var(--accent);font-weight:700;">Thinking зафиксирован</span>' : ''}
                </div>
                <div style="display:flex;gap:5px;width:100%;" role="radiogroup" aria-label="Настройка глубины Effort">
                    ${effortLevels.map(ef => `
                        <button type="button" class="p-effort-chip ${ef.id === currentEffort ? 'is-selected' : ''}" data-effort="${ef.id}" title="${window.esc(ef.desc)}" style="flex:1;padding:6px 0;font-size:11px;font-weight:600;border-radius:6px;border:1px solid ${ef.id === currentEffort ? 'var(--accent)' : 'var(--line)'};background:${ef.id === currentEffort ? 'var(--accent)' : 'var(--panel)'};color:${ef.id === currentEffort ? '#fff' : 'var(--text)'};cursor:pointer;">
                            ${ef.label}
                        </button>
                    `).join('')}
                </div>
            </div>
            <div class="p-drop-divider no-sel" style="padding:6px 12px 2px;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-faint);">
                <span>Режим рассуждений модели</span>
            </div>
        `;

        const modesHtml = configs.map((cfg) => {
            const isOff = cfg.value === 'off';
            const isBlockedOnOpus = isOpus5 && isOff && isOpusEnforced;
            const isUnsup = cfg.value === 'not-supported' || isBlockedOnOpus;
            const isSel = isBlockedOnOpus ? false : (cfg.value === activeVal);
            const level = getStageLevel(cfg.value);
            const badge = isBlockedOnOpus ? 'ЗАБЛОКИРОВАНО' : getStageBadge(cfg.value);
            const desc = isBlockedOnOpus
                ? 'На Opus 5 при effort xHigh/Max отключение размышлений запрещено'
                : (cfg.desc || '');

            return `
                <button type="button" class="p-effort-item ${isSel ? 'is-selected' : ''} ${isUnsup ? 'is-disabled' : ''}" data-val="${window.esc(cfg.value)}" ${isUnsup ? 'disabled' : ''} role="option" aria-selected="${isSel}" title="${isBlockedOnOpus ? 'Отключение невозможно при xHigh/Max' : ''}">
                    <div class="p-effort-left">
                        <div class="p-effort-bars" aria-hidden="true">
                            <span class="${level >= 1 ? 'lit' : ''}"></span>
                            <span class="${level >= 2 ? 'lit' : ''}"></span>
                            <span class="${level >= 3 ? 'lit' : ''}"></span>
                            <span class="${level >= 4 ? 'lit' : ''}"></span>
                        </div>
                        <div class="p-effort-texts">
                            <span class="p-effort-title">${window.esc(cfg.label)}</span>
                            <span class="p-effort-desc">${window.esc(desc)}</span>
                        </div>
                    </div>
                    <span class="p-effort-badge">${window.esc(badge)}</span>
                </button>
            `;
        }).join('');

        this.effortDropdownList.innerHTML = `<div id="promptEffortHoverPill" class="prompt-hover-pill" aria-hidden="true" style="pointer-events:none;"></div>` + effortSectionHtml + modesHtml;

        // Привязка кнопок выбора Effort
        this.effortDropdownList.querySelectorAll('.p-effort-chip').forEach(chip => {
            chip.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const nextEffort = chip.dataset.effort;
                if (!nextEffort) return;

                if (window.state && window.state.settings) {
                    window.state.settings.reasoningEffort = nextEffort;
                    if (!window.state.settings.modelProviders) window.state.settings.modelProviders = {};
                    const baseId = (modelId || '').replace(/:[a-zA-Z0-9_.-]+$/i, '');
                    if (modelId) {
                        if (!window.state.settings.modelProviders[modelId]) window.state.settings.modelProviders[modelId] = {};
                        window.state.settings.modelProviders[modelId].reasoningEffort = nextEffort;
                    }
                    if (baseId) {
                        if (!window.state.settings.modelProviders[baseId]) window.state.settings.modelProviders[baseId] = {};
                        window.state.settings.modelProviders[baseId].reasoningEffort = nextEffort;
                    }

                    // При выборе глубины усилий активируем размышления, если они были выключены
                    if (window.state.settings.reasoning === 'off') {
                        const matchingCfg = configs.find(c => c.value === nextEffort);
                        window.state.settings.reasoning = matchingCfg ? matchingCfg.value : (configs.find(c => c.value !== 'off' && c.value !== 'not-supported')?.value || 'medium');
                    }

                    // Проверка Opus 5: на xhigh/max размышления нельзя отключать
                    if (isOpus5 && (nextEffort === 'xhigh' || nextEffort === 'max')) {
                        if (window.state.settings.reasoning === 'off') {
                            window.state.settings.reasoning = 'medium';
                        }
                    }
                    if (typeof window.save === 'function') window.save();
                    if (typeof window.updateTopChips === 'function') window.updateTopChips();
                }
                this.syncModelAndEffort();
                this.renderEffortList();
                if (typeof window.toast === 'function') {
                    window.toast('Глубина усилий (Effort): ' + nextEffort.toUpperCase(), 'ok', 1400);
                }
            });
        });

        this.effortHoverPill = this.effortDropdownList.querySelector('#promptEffortHoverPill');
        const items = this.effortDropdownList.querySelectorAll('.p-effort-item:not([disabled])');
        items.forEach((item) => {
            item.addEventListener('mouseenter', () => {
                if (this.effortHoverPill) {
                    this.effortHoverPill.style.opacity = '1';
                    this.effortHoverPill.style.transform = `translateY(${item.offsetTop}px)`;
                    this.effortHoverPill.style.height = `${item.offsetHeight}px`;
                }
            });
            item.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const val = item.dataset.val;
                if (!val || val === 'not-supported') return;
                if (window.state && window.state.settings) {
                    window.state.settings.reasoning = val;

                    // Синхронизируем уровень глубины effort при выборе соответствующего режима
                    if (['low', 'medium', 'mid', 'high', 'xhigh', 'max'].includes(val)) {
                        const mappedEffort = val === 'mid' ? 'medium' : val;
                        window.state.settings.reasoningEffort = mappedEffort;
                        if (!window.state.settings.modelProviders) window.state.settings.modelProviders = {};
                        const baseId = (modelId || '').replace(/:[a-zA-Z0-9_.-]+$/i, '');
                        if (modelId) {
                            if (!window.state.settings.modelProviders[modelId]) window.state.settings.modelProviders[modelId] = {};
                            window.state.settings.modelProviders[modelId].reasoningEffort = mappedEffort;
                        }
                        if (baseId) {
                            if (!window.state.settings.modelProviders[baseId]) window.state.settings.modelProviders[baseId] = {};
                            window.state.settings.modelProviders[baseId].reasoningEffort = mappedEffort;
                        }
                    }

                    if (typeof window.save === 'function') window.save();
                    if (typeof window.updateTopChips === 'function') window.updateTopChips();
                }
                this.syncModelAndEffort();
                this.closeEffortDropdown();
                if (typeof window.toast === 'function') {
                    const cfg = configs.find(c => c.value === val);
                    window.toast('Режим рассуждений: ' + (cfg ? cfg.label : val), 'ok', 1400);
                }
            });
        });

    }

    closeEffortDropdown() {
        if (!this.effortDropdown || !this.isEffortSelectOpen) return;
        this.effortDropdown.classList.remove('is-open');
        this.effortDropdown.hidden = true;
        this.isEffortSelectOpen = false;
        this.effortBtn?.setAttribute('aria-expanded', 'false');
        if (this.effortHoverPill) this.effortHoverPill.style.opacity = '0';

        this.container?.classList.remove('has-effort-open');
        if (!this.isModelSelectOpen && !this.container?.classList.contains('has-plus-open')) {
            this.container?.classList.remove('has-menu-open');
            this.card?.classList.remove('shell-open');
        }
    }

    // ── Вложения и Drawer ──
    addAttachmentFile(file) {
        if (!file) return;
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => this.pushAttachment(file, url, img.naturalWidth, img.naturalHeight);
        img.onerror = () => this.pushAttachment(file, url, 800, 600);
        img.src = url;
    }

    renderAttachments() {
        this.syncWithPendingAtt();
    }

    pushAttachment(file, url, width, height) {
        const id = 'att_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const att = { id, file, url, name: file.name, width, height };
        this.attachments.push(att);

        if (!window.pendingAtt) window.pendingAtt = [];
        window.pendingAtt.push({
            kind: 'image',
            dataUrl: url,
            mime: file.type || 'image/jpeg',
            name: file.name
        });

        this.syncWithPendingAtt();
        this.expand();
        this.updateActionState();
    }

    removeAttachment(id) {
        const idx = this.attachments.findIndex(a => a.id === id);
        if (idx !== -1) {
            const [removed] = this.attachments.splice(idx, 1);
            if (removed?.url) URL.revokeObjectURL(removed.url);
        }
        if (window.pendingAtt && window.pendingAtt[idx]) {
            window.pendingAtt.splice(idx, 1);
        }
        this.syncWithPendingAtt();
        this.updateActionState();
    }

    clearAttachments() {
        this.closeFileContextMenu();
        this.attachments.forEach(a => {
            if (a?.url) {
                try { URL.revokeObjectURL(a.url); } catch (_) { }
            }
        });
        this.attachments = [];
        this.thumbRefs.clear();
        this.syncWithPendingAtt();
        this.updateActionState();
    }

    // Единый метод синхронизации вложений с массивом window.pendingAtt
    syncWithPendingAtt() {
        if (!this.attachmentDrawer || !this.attachmentTrack) return;
        const list = window.pendingAtt || [];
        const has = list.length > 0;

        this.attachmentDrawer.classList.toggle('has-attachments', has);
        this.attachmentDrawer.style.height = has ? '56px' : '0px';
        this.attachmentDrawer.setAttribute('aria-hidden', has ? 'false' : 'true');

        if (!has) {
            this.attachmentTrack.style.display = 'none';
            this.attachmentTrack.innerHTML = '';
            this.updateActionState();
            return;
        }

        this.attachmentTrack.style.display = 'inline-flex';
        this.expand(false);

        const total = list.length;
        const maxDisplay = 4;
        let html = '';

        if (total <= maxDisplay) {
            // Если до 4 элементов включительно — отрисовываем все
            html = list.map((a, i) => this.renderSingleAttachmentCard(a, i)).join('');
        } else {
            // Если больше 4 — отображаем первые 3, а 4-й элемент как стек-карточку "+" со стеклом и блюром
            for (let i = 0; i < 3; i++) {
                html += this.renderSingleAttachmentCard(list[i], i);
            }
            const extraCount = total - 3;
            html += `
                <button type="button" class="prompt-attachment-more" id="btnPromptAttMore" title="Показать все вложения (${total})">
                    <svg class="ic att-more-plus"><use href="#i-plus"/></svg>
                    <span class="att-more-badge">+${extraCount}</span>
                </button>
            `;
        }

        this.attachmentTrack.innerHTML = html;

        // Привязка кликов по миниатюрам изображений (полноэкранный просмотр)
        this.attachmentTrack.querySelectorAll('.prompt-attachment-thumb').forEach(btn => {
            btn.addEventListener('click', e => {
                if (e.target.closest('.prompt-thumb-remove')) return;
                e.stopPropagation();
                this.closeFileContextMenu();
                const idx = parseInt(btn.dataset.attIdx, 10);
                const att = list[idx];
                if (att && att.dataUrl && typeof window.openImageViewer === 'function') {
                    window.openImageViewer(att.dataUrl, att.name);
                }
            });
        });

        // Привязка клика по карточке файла (поворот и вызов меню: Развернуть / Удалить)
        this.attachmentTrack.querySelectorAll('.prompt-attachment-file').forEach(card => {
            card.addEventListener('click', e => {
                e.stopPropagation();
                const idx = parseInt(card.dataset.attIdx, 10);
                if (this.activeTiltedEl === card) {
                    this.closeFileContextMenu();
                } else {
                    this.showFileContextMenu(card, idx);
                }
            });
        });

        // Привязка удаления крестиком только для картинок
        this.attachmentTrack.querySelectorAll('.prompt-thumb-remove').forEach(rm => {
            rm.addEventListener('click', e => {
                e.stopPropagation();
                this.closeFileContextMenu();
                const idx = parseInt(rm.dataset.delIdx, 10);
                if (window.pendingAtt && window.pendingAtt[idx]) {
                    window.pendingAtt.splice(idx, 1);
                    this.syncWithPendingAtt();
                    if (typeof window.save === 'function') window.save();
                }
            });
        });

        // Клик по карточке "+" открывает модальное окно со всеми вложенными элементами
        const moreBtn = this.attachmentTrack.querySelector('#btnPromptAttMore');
        if (moreBtn) {
            moreBtn.addEventListener('click', e => {
                e.stopPropagation();
                this.openAttachmentsListModal();
            });
        }

        this.updateActionState();
    }

    showFileContextMenu(element, idx) {
        this.closeFileContextMenu();
        this.activeTiltedEl = element;
        element.classList.add('is-tilted');

        const menu = document.createElement('div');
        menu.id = 'promptFileCtx';
        menu.className = 'prompt-file-ctx';
        menu.innerHTML = `
            <button type="button" data-act="expand">
                <svg class="ic"><use href="#i-pencil"/></svg>
                <span>Развернуть</span>
            </button>
            <button type="button" data-act="delete" class="danger">
                <svg class="ic"><use href="#i-trash"/></svg>
                <span>Удалить</span>
            </button>
        `;
        document.body.appendChild(menu);
        this.fileCtxMenu = menu;

        // Расчет позиции над карточкой с защитой от выхода за пределы экрана
        const rect = element.getBoundingClientRect();
        const menuW = 144;
        const menuH = 80;
        const screenW = window.innerWidth;

        let left = rect.left + (rect.width / 2) - (menuW / 2);
        let top = rect.top - menuH - 8;

        if (top < 10) {
            top = rect.bottom + 8;
        }
        left = Math.max(8, Math.min(left, screenW - menuW - 8));

        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;

        menu.addEventListener('click', (e) => {
            e.stopPropagation();
            const btn = e.target.closest('button[data-act]');
            if (!btn) return;
            const act = btn.dataset.act;
            this.closeFileContextMenu();

            if (act === 'expand') {
                if (typeof window.expandTextAtt === 'function') {
                    window.expandTextAtt(idx);
                } else if (typeof window.doExpandTextAtt === 'function') {
                    window.doExpandTextAtt(idx);
                }
            } else if (act === 'delete') {
                if (window.pendingAtt && window.pendingAtt[idx]) {
                    window.pendingAtt.splice(idx, 1);
                    this.syncWithPendingAtt();
                    if (typeof window.save === 'function') window.save();
                }
            }
        });
    }

    closeFileContextMenu() {
        if (this.activeTiltedEl) {
            this.activeTiltedEl.classList.remove('is-tilted');
            this.activeTiltedEl = null;
        }
        if (this.fileCtxMenu) {
            this.fileCtxMenu.remove();
            this.fileCtxMenu = null;
        }
    }

    renderSingleAttachmentCard(a, idx) {
        const safeEsc = (s) => (typeof window.esc === 'function' ? window.esc(s) : String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
        if (a.kind === 'image') {
            return `
                <div class="prompt-attachment-thumb" data-att-idx="${idx}" title="${safeEsc(a.name || 'Изображение')}">
                    <img src="${safeEsc(a.dataUrl || a.url)}" alt="${safeEsc(a.name || '')}" draggable="false">
                    <span class="prompt-thumb-overlay">
                        <span class="prompt-thumb-remove" data-del-idx="${idx}" title="Удалить"><svg class="ic"><use href="#i-x"/></svg></span>
                    </span>
                </div>
            `;
        }

        if (a.kind === 'artifact') {
            return `
                <div class="prompt-attachment-file" data-att-idx="${idx}" title="Клик — развернуть или удалить артефакт: ${safeEsc(a.name)}">
                    <svg class="ic att-file-ic" style="color:var(--accent)"><use href="#i-cube"/></svg>
                    <div class="att-file-info">
                        <span class="att-file-name">${safeEsc(a.name)}</span>
                        <span class="att-file-meta">v${a.version || 1}</span>
                    </div>
                </div>
            `;
        }

        // Текстовый фрагмент или файл (без крестика)
        const sizeKb = a.text ? (a.text.length >= 1024 ? Math.round(a.text.length / 1024) + 'K' : a.text.length + ' симв.') : 'Файл';
        return `
            <div class="prompt-attachment-file" data-att-idx="${idx}" title="Клик — развернуть или удалить файл: ${safeEsc(a.name || 'Файл')}">
                <svg class="ic att-file-ic"><use href="#i-file"/></svg>
                <div class="att-file-info">
                    <span class="att-file-name">${safeEsc(a.name || 'Файл')}</span>
                    <span class="att-file-meta">${safeEsc(sizeKb)}</span>
                </div>
            </div>
        `;
    }

    openAttachmentsListModal() {
        const overlay = document.getElementById('attachmentsListOverlay');
        const grid = document.getElementById('attListModalGrid');
        const count = document.getElementById('attListModalCount');
        const btnClose = document.getElementById('attListModalClose');
        const btnDone = document.getElementById('attListModalDone');
        const btnClear = document.getElementById('attListModalClearAll');
        if (!overlay || !grid) return;

        const renderModalList = () => {
            const list = window.pendingAtt || [];
            if (count) count.textContent = list.length;
            if (!list.length) {
                overlay.classList.remove('show');
                this.syncWithPendingAtt();
                return;
            }

            grid.innerHTML = list.map((a, i) => {
                let thumbHtml = '';
                let metaText = 'Вложение';

                if (a.kind === 'image') {
                    thumbHtml = `<img src="${window.esc(a.dataUrl || a.url)}" class="att-modal-thumb" alt="">`;
                    metaText = 'Изображение';
                } else if (a.kind === 'artifact') {
                    thumbHtml = `<span class="att-modal-icon-box"><svg class="ic"><use href="#i-cube"/></svg></span>`;
                    metaText = `Артефакт · v${a.version || 1}`;
                } else {
                    thumbHtml = `<span class="att-modal-icon-box"><svg class="ic"><use href="#i-file"/></svg></span>`;
                    metaText = a.text ? `${a.text.length} символов` : 'Файл';
                }

                return `
                    <div class="att-modal-item">
                        <div class="att-modal-item-left">
                            ${thumbHtml}
                            <div class="att-modal-info">
                                <span class="att-modal-name" title="${window.esc(a.name || '')}">${window.esc(a.name || 'Вложение')}</span>
                                <span class="att-modal-meta">${metaText}</span>
                            </div>
                        </div>
                        <button type="button" class="att-modal-del-btn" data-modal-del="${i}" title="Удалить из запроса">
                            <svg class="ic"><use href="#i-trash"/></svg>
                        </button>
                    </div>
                `;
            }).join('');

            grid.querySelectorAll('.att-modal-del-btn').forEach(b => {
                b.onclick = () => {
                    const idx = parseInt(b.dataset.modalDel, 10);
                    if (window.pendingAtt && window.pendingAtt[idx]) {
                        window.pendingAtt.splice(idx, 1);
                        renderModalList();
                        this.syncWithPendingAtt();
                        if (typeof window.save === 'function') window.save();
                    }
                };
            });
        };

        renderModalList();
        overlay.classList.add('show');

        const closeModal = () => {
            overlay.classList.remove('show');
            this.syncWithPendingAtt();
        };

        if (btnClose) btnClose.onclick = closeModal;
        if (btnDone) btnDone.onclick = closeModal;
        overlay.onclick = e => { if (e.target === overlay) closeModal(); };

        if (btnClear) {
            btnClear.onclick = () => {
                if (window.pendingAtt) window.pendingAtt.splice(0);
                this.clearAttachments();
                closeModal();
                if (typeof window.save === 'function') window.save();
            };
        }
    }

    // ── Полноэкранная FLIP-галерея ──
    openGalleryModal(attachment, originRect) {
        if (this.activeModalEl) this.activeModalEl.remove();

        const modal = document.createElement('div');
        modal.className = 'prompt-gallery-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');

        const maxW = Math.min(window.innerWidth * 0.86, 560);
        const maxH = Math.min(window.innerHeight * 0.78, 720);
        const naturalW = attachment.width || 800;
        const naturalH = attachment.height || 600;
        const scale = Math.min(maxW / naturalW, maxH / naturalH, 1.6);

        const targetW = naturalW * scale;
        const targetH = naturalH * scale;
        const targetLeft = (window.innerWidth - targetW) / 2;
        const targetTop = (window.innerHeight - targetH) / 2;

        modal.innerHTML = `
            <div class="prompt-gallery-backdrop"></div>
            <div class="prompt-gallery-card" style="top:${originRect.top}px;left:${originRect.left}px;width:${originRect.width}px;height:${originRect.height}px;border-radius:12px;">
                <img src="${attachment.url}" alt="${window.esc(attachment.name)}" draggable="false">
            </div>
            <button type="button" class="prompt-gallery-close" aria-label="Закрыть"><svg class="ic"><use href="#i-x"/></svg></button>
        `;

        document.body.appendChild(modal);
        this.activeModalEl = modal;

        const card = modal.querySelector('.prompt-gallery-card');
        const backdrop = modal.querySelector('.prompt-gallery-backdrop');
        const closeBtn = modal.querySelector('.prompt-gallery-close');

        requestAnimationFrame(() => {
            backdrop.style.opacity = '1';
            closeBtn.style.opacity = '1';
            closeBtn.style.transform = 'scale(1)';

            card.style.top = `${targetTop}px`;
            card.style.left = `${targetLeft}px`;
            card.style.width = `${targetW}px`;
            card.style.height = `${targetH}px`;
            card.style.borderRadius = '20px';
            card.style.boxShadow = '0 24px 60px -12px rgba(0, 0, 0, 0.45)';
        });

        const closeModal = () => {
            const curThumb = this.thumbRefs.get(attachment.id);
            const exitRect = curThumb ? curThumb.getBoundingClientRect() : originRect;

            backdrop.style.opacity = '0';
            closeBtn.style.opacity = '0';
            closeBtn.style.transform = 'scale(0.7)';

            card.style.top = `${exitRect.top}px`;
            card.style.left = `${exitRect.left}px`;
            card.style.width = `${exitRect.width}px`;
            card.style.height = `${exitRect.height}px`;
            card.style.borderRadius = '12px';
            card.style.boxShadow = 'none';

            setTimeout(() => {
                if (modal.parentNode) modal.remove();
                this.activeModalEl = null;
            }, 320);
        };

        modal.addEventListener('click', closeModal);
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeModal();
        });
        card.addEventListener('click', (e) => e.stopPropagation());
    }

    // ── Голосовой ввод и Эквалайзер (Whisper STT) ──
    async startRecording() {
        if (this.isRecording || this.isTranscribing || this.isStartingRecording) return;

        const s = (window.state && window.state.settings) || {};
        const hasKey = !!((s.orKey || '').trim() || (s.proxyKey || '').trim());
        if (!hasKey) {
            if (typeof window.toast === 'function') {
                window.toast('Укажите API-ключ OpenRouter или ProxyAPI для Whisper в настройках', 'warn', 3500);
            }
            if (typeof window.openSettings === 'function') {
                window.openSettings('keys');
            }
            return;
        }

        if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
            if (typeof window.toast === 'function') {
                window.toast('Аудиоввод не поддерживается на данном устройстве', 'err');
            }
            return;
        }

        let stream = null;
        this.isStartingRecording = true;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            this.mediaStream = stream;
        } catch (err) {
            console.warn('[PromptInput] Mic access denied:', err);
            if (typeof window.toast === 'function') {
                window.toast('Доступ к микрофону отклонен или недоступен', 'err');
            }
            return;
        } finally {
            this.isStartingRecording = false;
        }

        this.isRecording = true;
        this.audioChunks = [];
        this.expand();
        this.updateActionState();

        if (this.bottomBar) this.bottomBar.classList.add('is-recording-hidden');
        if (this.visualizer) this.visualizer.classList.add('is-recording-active');

        // Подключение Web Audio API для анимации эквалайзера
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
            this.audioContext = new AudioCtx();
            if (this.audioContext.state === 'suspended') {
                try { await this.audioContext.resume(); } catch (_) { }
            }
            const source = this.audioContext.createMediaStreamSource(stream);
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 64;
            this.analyser.smoothingTimeConstant = 0.6;
            source.connect(this.analyser);

            const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            const bars = this.visualizer?.querySelectorAll('.prompt-audio-bar') || [];

            const updateVisualizer = () => {
                if (!this.isRecording || !this.analyser) return;
                this.analyser.getByteFrequencyData(dataArray);

                const step = Math.floor(dataArray.length / 5);
                for (let i = 0; i < 5; i++) {
                    let sum = 0;
                    for (let j = 0; j < step; j++) {
                        sum += dataArray[i * step + j];
                    }
                    const norm = sum / step / 255;
                    if (bars[i]) {
                        bars[i].style.height = `${Math.max(4, norm * 26)}px`;
                    }
                }
                this.rafId = requestAnimationFrame(updateVisualizer);
            };
            updateVisualizer();
        }

        // Инициализация MediaRecorder для записи в формате webm/mp4
        let mimeType = 'audio/webm';
        if (typeof MediaRecorder !== 'undefined') {
            if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                mimeType = 'audio/webm;codecs=opus';
            } else if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('audio/webm')) {
                mimeType = 'audio/webm';
            } else if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('audio/mp4')) {
                mimeType = 'audio/mp4';
            }
        }

        try {
            this.mediaRecorder = new MediaRecorder(stream, { mimeType });
        } catch (_) {
            try {
                this.mediaRecorder = new MediaRecorder(stream);
                mimeType = this.mediaRecorder.mimeType || 'audio/webm';
            } catch (err) {
                console.error('[PromptInput] MediaRecorder error:', err);
                this.stopRecording();
                if (typeof window.toast === 'function') {
                    window.toast('Запись аудио не поддерживается в данной среде', 'err');
                }
                return;
            }
        }

        this.mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
                this.audioChunks.push(e.data);
            }
        };

        this.mediaRecorder.onstop = async () => {
            const chunks = this.audioChunks.slice();
            this.audioChunks = [];
            if (!chunks.length) return;

            const audioBlob = new Blob(chunks, { type: mimeType });
            if (audioBlob.size < 1000) {
                if (typeof window.toast === 'function') {
                    window.toast('Запись слишком короткая', 'info', 1600);
                }
                return;
            }

            await this.transcribeWithWhisper(audioBlob);
        };

        this.mediaRecorder.start(250);
        if (typeof window.toast === 'function') {
            window.toast('Слушаю вас… Нажмите еще раз для отправки в Whisper', 'info', 2200);
        }
    }

    stopRecording() {
        if (!this.isRecording) return;
        this.isRecording = false;

        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }

        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            try { this.mediaRecorder.stop(); } catch (_) { }
        }

        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(t => t.stop());
            this.mediaStream = null;
        }

        if (this.audioContext && this.audioContext.state !== 'closed') {
            try { this.audioContext.close(); } catch (_) { }
            this.audioContext = null;
        }

        if (this.bottomBar) this.bottomBar.classList.remove('is-recording-hidden');
        if (this.visualizer) this.visualizer.classList.remove('is-recording-active');

        const bars = this.visualizer?.querySelectorAll('.prompt-audio-bar') || [];
        bars.forEach(bar => { bar.style.height = '4px'; });

        this.updateActionState();
    }

    async transcribeWithWhisper(audioBlob) {
        this.isTranscribing = true;
        this.updateActionState();

        if (typeof window.toast === 'function') {
            window.toast('Распознавание речи через Whisper…', 'info', 2400);
        }

        try {
            let transcribedText = '';
            if (typeof window.transcribeWithWhisper === 'function') {
                transcribedText = await window.transcribeWithWhisper(audioBlob);
            } else {
                const s = (window.state && window.state.settings) || {};
                const orKey = (s.orKey || '').trim();
                const proxyKey = (s.proxyKey || '').trim();
                const key = orKey || proxyKey;
                const url = orKey
                    ? 'https://openrouter.ai/api/v1/audio/transcriptions'
                    : 'https://api.proxyapi.ru/openrouter/v1/audio/transcriptions';

                const format = (audioBlob.type || '').includes('mp4') ? 'mp4'
                    : (audioBlob.type || '').includes('webm') ? 'webm' : 'wav';

                const base64 = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => {
                        const res = String(reader.result || '');
                        const idx = res.indexOf(',');
                        resolve(idx >= 0 ? res.slice(idx + 1) : res);
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(audioBlob);
                });

                const attribHeaders = typeof window.getOpenRouterAttributionHeaders === 'function'
                    ? window.getOpenRouterAttributionHeaders('Whisper STT')
                    : { 'HTTP-Referer': 'https://unichat2.sahbanovtimur228.workers.dev/ai', 'X-Title': 'MoonSSS' };

                const resp = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Authorization': 'Bearer ' + key,
                        'Content-Type': 'application/json',
                        ...attribHeaders
                    },
                    body: JSON.stringify({
                        model: 'openai/whisper-large-v3-turbo',
                        input_audio: { data: base64, format }
                    })
                });

                if (!resp.ok) {
                    let errMsg = 'HTTP ' + resp.status;
                    try {
                        const json = await resp.json();
                        errMsg = json.error?.message || json.message || errMsg;
                    } catch (_) { }
                    throw new Error(errMsg);
                }

                const data = await resp.json();
                transcribedText = (data.text || '').trim();
            }

            if (transcribedText) {
                const currentVal = (this.textarea.value || '').trim();
                this.textarea.value = currentVal ? currentVal + ' ' + transcribedText : transcribedText;
                this.adjustHeight();
                this.updateFades();
                this.updateActionState();
                if (typeof window.setSendBtn === 'function') {
                    window.setSendBtn();
                }
                setTimeout(() => {
                    this.textarea.focus();
                    const len = this.textarea.value.length;
                    this.textarea.setSelectionRange(len, len);
                }, 50);
                if (typeof window.toast === 'function') {
                    window.toast('Речь успешно распознана', 'ok', 1800);
                }
            } else {
                if (typeof window.toast === 'function') {
                    window.toast('Слова в записи не распознаны', 'info', 2000);
                }
            }
        } catch (err) {
            console.error('[PromptInput] Whisper transcription error:', err);
            if (typeof window.toast === 'function') {
                window.toast('Ошибка Whisper: ' + (err.message || err), 'err', 4000);
            }
        } finally {
            this.isTranscribing = false;
            this.updateActionState();
        }
    }
}

// Экспортируем глобальный экземпляр
window.promptInputCtrl = new PromptInputController();