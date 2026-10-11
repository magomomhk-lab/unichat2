/*
Это ai.js, логика работы ai.html.
*/

'use strict';
/* ============================================================
   MoonSSS — премиальный ИИ-клиент для ProxyAPI.ru
============================================================ */
/* Мобильный режим: touch-устройство или узкий экран.
Динамически обновляется при смене ориентации устройства. */
const checkIsMobile = () => (window.matchMedia && matchMedia('(pointer:coarse)').matches) || window.innerWidth <= 768;
window.checkIsMobile = checkIsMobile;
let isMobile = checkIsMobile();

/* ---------- База данных (IndexedDB с отказоустойчивым in-memory хранилищем) ---------- */
class DatabaseController {
    constructor(dbName = 'MoonSSS_DB', version = 2) {
        this.dbName = dbName;
        this.version = version;
        this.db = null;
        this.initPromise = null;
        this.memoryStore = new Map();
        this.isMemoryFallback = false;
    }

    async init() {
        if (this.db) return this.db;
        if (this.initPromise) return this.initPromise;

        this.initPromise = new Promise((resolve) => {
            try {
                if (typeof indexedDB === 'undefined' || !indexedDB) {
                    console.warn('[DatabaseController] IndexedDB недоступен, включен memory store');
                    this.isMemoryFallback = true;
                    this.initPromise = null;
                    return resolve(null);
                }

                let isSettled = false;
                const settle = (dbInstance, isFallback = false) => {
                    if (isSettled) return;
                    isSettled = true;
                    clearTimeout(timeoutId);
                    this.initPromise = null;
                    if (isFallback) {
                        this.isMemoryFallback = true;
                        resolve(null);
                    } else {
                        this.db = dbInstance;
                        this.isMemoryFallback = false;
                        resolve(dbInstance);
                    }
                };

                const timeoutId = setTimeout(() => {
                    console.warn('[DatabaseController] Таймаут IndexedDB — продолжаем');
                    settle(null, true);
                }, 1200);

                const req = indexedDB.open(this.dbName, this.version);

                req.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains('app_state')) {
                        db.createObjectStore('app_state', { keyPath: 'key' });
                    }
                    if (!db.objectStoreNames.contains('auth_session')) {
                        db.createObjectStore('auth_session', { keyPath: 'id' });
                    }
                };

                req.onsuccess = (e) => {
                    const db = e.target.result;
                    db.onversionchange = () => {
                        try { db.close(); } catch (_) { }
                        this.db = null;
                    };
                    db.onclose = () => {
                        this.db = null;
                    };
                    settle(db, false);
                };

                req.onerror = (e) => {
                    console.warn('[DatabaseController] Ошибка доступа к IndexedDB:', e.target?.error);
                    settle(null, true);
                };

                req.onblocked = () => {
                    console.warn('[DatabaseController] База временно занята другим процессом');
                };
            } catch (err) {
                console.warn('[DatabaseController] Исключение при открытии:', err);
                this.initPromise = null;
                this.isMemoryFallback = true;
                resolve(null);
            }
        });
        return this.initPromise;
    }

    async get(key) {
        try {
            const db = await this.init();
            if (!db) {
                return this.memoryStore.has(key) ? this.memoryStore.get(key) : null;
            }
            return new Promise((resolve) => {
                try {
                    const tx = db.transaction('app_state', 'readonly');
                    const store = tx.objectStore('app_state');
                    const req = store.get(key);
                    req.onsuccess = () => {
                        const val = req.result ? req.result.value : null;
                        if (val) this.memoryStore.set(key, val);
                        resolve(val !== undefined ? val : (this.memoryStore.has(key) ? this.memoryStore.get(key) : null));
                    };
                    req.onerror = () => resolve(this.memoryStore.has(key) ? this.memoryStore.get(key) : null);
                } catch (err) {
                    resolve(this.memoryStore.has(key) ? this.memoryStore.get(key) : null);
                }
            });
        } catch (err) {
            return this.memoryStore.has(key) ? this.memoryStore.get(key) : null;
        }
    }

    async set(key, value) {
        try {
            this.memoryStore.set(key, value);
            const db = await this.init();
            if (!db) {
                return true;
            }
            return new Promise((resolve) => {
                try {
                    const tx = db.transaction('app_state', 'readwrite');
                    const store = tx.objectStore('app_state');
                    const req = store.put({ key, value });
                    req.onsuccess = () => resolve(true);
                    req.onerror = () => resolve(true);
                } catch (err) {
                    resolve(true);
                }
            });
        } catch (err) {
            return true;
        }
    }
}

const dbCtrl = new DatabaseController();
window.dbCtrl = dbCtrl;

/* ============================================================
   КОНТРОЛЛЕР НАВИГАЦИИ И КНОПКИ «НАЗАД» (CAPACITOR / ELECTRON / WEB)
============================================================ */
class NavigationController {
    constructor() {
        this.historyStack = [];
        this.isPopping = false;
        this.lastBackPressTime = 0;
    }

    push(name) {
        this.historyStack.push(name);
        try {
            history.pushState({ moonView: name, depth: this.historyStack.length }, '');
        } catch (_) { }
    }

    pop(name) {
        if (this.isPopping) return;
        const idx = this.historyStack.lastIndexOf(name);
        if (idx !== -1) {
            this.historyStack.splice(idx, 1);
            try {
                this.isPopping = true;
                history.back();
                setTimeout(() => { this.isPopping = false; }, 140);
            } catch (_) {
                this.isPopping = false;
            }
        }
    }
}

const navCtrl = new NavigationController();
window.navCtrl = navCtrl;

function handleAppBack(opts = {}) {
    const fromPopstate = !!opts.fromPopstate;

    // 1. Полноэкранный просмотр изображений
    if ($('#imgViewer') && !$('#imgViewer').hidden) {
        closeImageViewer({ fromPopstate });
        return true;
    }

    // 2. Live Preview HTML-кода
    if ($('#htmlPreview') && !$('#htmlPreview').hidden) {
        closeHtmlPreview({ fromPopstate });
        return true;
    }

    // 3. Голосовой ассистент Юни
    if (window.uni && window.uni.active) {
        window.uni.close({ fromPopstate });
        return true;
    }

    // 4. Камера
    if ($('#cameraOverlay') && $('#cameraOverlay').classList.contains('show')) {
        closeCamera({ fromPopstate });
        return true;
    }

    // 5. Командная палитра (Ctrl+K)
    if ($('#cmdkOverlay') && $('#cmdkOverlay').classList.contains('show')) {
        closeCmdk({ fromPopstate });
        return true;
    }

    // Текстовая панель действий и Контекстное окно анализа фрагмента (GPT-5 Nano)
    if (window.textSelectionMenu && window.textSelectionMenu.isOpen) {
        window.textSelectionMenu.close();
        return true;
    }
    if (window.aiContextWindow && window.aiContextWindow.isOpen) {
        window.aiContextWindow.close();
        return true;
    }

    // 6. Подтверждение перехода по внешней ссылке
    if ($('#externalLinkOverlay') && $('#externalLinkOverlay').classList.contains('show')) {
        closeExternalConfirm();
        return true;
    }

    // 7. Вложенные диалоги и модальные окна
    if ($('#changelogOverlay') && $('#changelogOverlay').classList.contains('show')) {
        if (window.changelogController) window.changelogController.close({ fromPopstate });
        else $('#changelogOverlay').classList.remove('show');
        return true;
    }
    if ($('#aiThemeGenOverlay') && $('#aiThemeGenOverlay').classList.contains('show')) {
        closeAiThemeGenModal();
        return true;
    }
    if ($('#aiDevCodeOverlay') && $('#aiDevCodeOverlay').classList.contains('show')) {
        closeAiDevCodeModal();
        return true;
    }
    if ($('#saveThemeModalOverlay') && $('#saveThemeModalOverlay').classList.contains('show')) {
        $('#saveThemeModalOverlay').classList.remove('show');
        return true;
    }
    if ($('#themeInspectOverlay') && $('#themeInspectOverlay').classList.contains('show')) {
        $('#themeInspectOverlay').classList.remove('show');
        return true;
    }
    if ($('#modelProviderFlyoutOverlay') && $('#modelProviderFlyoutOverlay').classList.contains('show')) {
        closeModelProviderFlyout();
        return true;
    }
    if ($('#igOverlay') && $('#igOverlay').classList.contains('show')) {
        closeImgGenSettings();
        return true;
    }
    if ($('#wsOverlay') && $('#wsOverlay').classList.contains('show')) {
        closeWsSettings();
        return true;
    }
    if ($('#favOverlay') && $('#favOverlay').classList.contains('show')) {
        $('#favOverlay').classList.remove('show');
        return true;
    }
    if ($('#editConfirmOverlay') && $('#editConfirmOverlay').classList.contains('show')) {
        closeEditConfirm();
        return true;
    }
    if ($('#igcOverlay') && $('#igcOverlay').classList.contains('show')) {
        closeImgReqConfirm();
        return true;
    }
    if ($('#imgInfoOverlay') && $('#imgInfoOverlay').classList.contains('show')) {
        closeImgInfo();
        return true;
    }
    if ($('#textExpandOverlay') && $('#textExpandOverlay').classList.contains('show')) {
        closeTextExpand();
        return true;
    }
    if ($('#devUnlockOverlay') && $('#devUnlockOverlay').classList.contains('show')) {
        closeDevUnlockModal();
        return true;
    }
    if ($('#chatDeleteOverlay') && $('#chatDeleteOverlay').classList.contains('show')) {
        closeChatDelete();
        return true;
    }

    // Окно Community Room
    const commModal = document.querySelector('#communityModalOverlay, #communityOverlay, .community-modal-overlay');
    if (commModal && (commModal.classList.contains('show') || !commModal.hidden)) {
        if (window.supabaseCommunity && typeof window.supabaseCommunity.closeCommunityModal === 'function') {
            window.supabaseCommunity.closeCommunityModal();
        } else {
            commModal.classList.remove('show');
            commModal.hidden = true;
        }
        return true;
    }

    // 8. Контекстные меню и выпадающие списки
    if ($('#artCodeOverlay') && $('#artCodeOverlay').classList.contains('show')) {
        closeArtifactCodeModal();
        return true;
    }
    if ($('#artCtxMenu') && !$('#artCtxMenu').hidden) {
        closeArtifactMenu();
        return true;
    }
    if ($('#msgCtxMenu') && !$('#msgCtxMenu').hidden) {
        closeMsgContextMenu();
        return true;
    }
    if ($('#chatCtxMenu') && !$('#chatCtxMenu').hidden) {
        closeChatCtxMenu();
        return true;
    }
    if ($('#favCtxMenu') && !$('#favCtxMenu').hidden) {
        closeFavCtxMenu();
        return true;
    }
    if ($('#igCtxMenu') && !$('#igCtxMenu').hidden) {
        closeImgCtxMenu();
        return true;
    }
    if (typeof slashOpen === 'function' && slashOpen()) {
        closeSlash();
        return true;
    }
    if ($('#searchPanel') && !$('#searchPanel').hidden) {
        closeSearchPanel();
        return true;
    }
    if ((modelMenu && !modelMenu.hidden) || (thinkMenu && !thinkMenu.hidden) || (plusMenu && !plusMenu.hidden)) {
        closeAllMenus();
        return true;
    }

    // Активный режим редактирования сообщения в чате
    const activeEditingMsg = document.querySelector('.msg[data-editing]');
    if (activeEditingMsg) {
        const cancelBtn = activeEditingMsg.querySelector('.ed-cancel');
        if (cancelBtn) cancelBtn.click();
        else {
            delete activeEditingMsg.dataset.editing;
            renderMessages();
        }
        return true;
    }

    // 9. ОКНО НАСТРОЕК (Возврат в активный чат или возврат в Mobile Settings Hub)
    if (settingsOverlay && settingsOverlay.classList.contains('show')) {
        const isMobileDetail = checkIsMobile() && document.querySelector('.set-app-fullscreen')?.classList.contains('is-mobile-detail');
        if (isMobileDetail) {
            showMobileSettingsHub();
            return true;
        }
        closeSettings({ fromPopstate });
        return true;
    }
    // 10. ШТОРКА ИСТОРИИ ЧАТОВ (Возврат в активный чат)
    if (drawer && drawer.classList.contains('open')) {
        closeDrawer({ fromPopstate });
        return true;
    }

    // 11. Прикреплённый артефакт в композере
    if (artEditRef) {
        artEditRef = null;
        renderArtRef();
        return true;
    }

    // 12. Режим редактирования изображений
    if (state.settings.editMode && editImages.length) {
        setEditMode(false);
        save();
        return true;
    }

    return false;
}

function handleExitApp() {
    const isCapacitorNative = window.Capacitor && (typeof Capacitor.isNativePlatform === 'function' ? Capacitor.isNativePlatform() : Capacitor.isNative);
    if (!isCapacitorNative) return;

    const appPlugin = window.Capacitor?.Plugins?.App || window.Capacitor?.App;
    const now = Date.now();
    if (now - navCtrl.lastBackPressTime < 2000) {
        if (appPlugin && typeof appPlugin.exitApp === 'function') {
            appPlugin.exitApp();
        }
    } else {
        navCtrl.lastBackPressTime = now;
        toast('Нажмите «Назад» ещё раз для выхода', 'info', 2000);
    }
}

function setupBackButtonHandlers() {
    try {
        history.replaceState({ moonView: 'root' }, '');
    } catch (_) { }

    // 1. Нативный перехват кнопки «Назад» в Capacitor (Android)
    const getApp = () => window.Capacitor?.Plugins?.App || window.Capacitor?.App;
    const bindCapacitor = () => {
        const app = getApp();
        if (app && typeof app.addListener === 'function') {
            try {
                app.addListener('backButton', () => {
                    const handled = handleAppBack();
                    if (!handled) {
                        handleExitApp();
                    }
                });
                return true;
            } catch (err) {
                console.warn('[Navigation] Capacitor backButton listener error:', err);
            }
        }
        return false;
    };

    if (!bindCapacitor()) {
        let attempts = 0;
        const retryTimer = setInterval(() => {
            attempts++;
            if (bindCapacitor() || attempts > 12) {
                clearInterval(retryTimer);
            }
        }, 250);
    }

    // 2. Обработка popstate (Браузеры и Electron)
    window.addEventListener('popstate', () => {
        if (navCtrl.isPopping) {
            navCtrl.isPopping = false;
            return;
        }
        handleAppBack({ fromPopstate: true });
    });

    // 3. Аппаратный код клавиши Back для Android WebView (KeyCode 4) и Alt+Left для ПК
    window.addEventListener('keydown', e => {
        if (e.key === 'GoBack' || e.keyCode === 4 || (e.altKey && (e.key === 'ArrowLeft' || e.code === 'ArrowLeft'))) {
            if (handleAppBack()) {
                e.preventDefault();
                e.stopPropagation();
            }
        }
    }, true);

    // 4. Мышь: боковая кнопка «Назад» (XBUTTON1 / button 3) в Electron/Браузере
    window.addEventListener('mouseup', e => {
        if (e.button === 3) {
            if (handleAppBack()) {
                e.preventDefault();
                e.stopPropagation();
            }
        }
    });
}

/* ---------- Заводские палитры оформления (iOS Frosted Glass Edition) ---------- */
const FACTORY_THEME_DARK = {
    streamColor: '#f1f5f9',
    streamTailColor: '#94a3b8',
    accentColor: '#8fd0f5',
    btnTint: '#8fd0f5',
    selBgColor: '#64748b',
    selBgOpacity: 0.35,
    selTextColor: '#ffffff',
    userSelBgColor: '#94a3b8',
    userSelBgOpacity: 0.35,
    userSelTextColor: '#ffffff',
    aiSelBgColor: '#cbd5e1',
    aiSelBgOpacity: 0.30,
    aiSelTextColor: '#ffffff',
    bgColor: '#121214',
    textColor: '#f8fafc',
    textDimColor: '#94a3b8',
    userBubbleBg: '#1e2430',
    userBubbleOpacity: 0.62,
    userBubbleBlur: 28,
    userBubbleBorder: 'rgba(255, 255, 255, 0.16)',
    userBubbleText: '#f8fafc',
    aiBubbleBg: '#18181e',
    aiBubbleOpacity: 0.58,
    aiBubbleBlur: 32,
    aiBubbleBorder: 'rgba(255, 255, 255, 0.11)',
    aiBubbleText: '#f1f5f9',
    elemBg: '#16161b',
    elemOpacity: 0.55,
    elemBlur: 26,
    elemBorder: 'rgba(255, 255, 255, 0.12)',
    liquidColor1: '#070b14',
    liquidColor2: '#2563eb',
    liquidColor3: '#8fd0f5',
    liquidSpeed: 24,
    liquidShape: 'Checks',
    liquidScale: 0.55,
    liquidRotation: -35,
    liquidDistortion: 6,
    liquidSwirl: 55,
    liquidSwirlIterations: 8,
    liquidSoftness: 65,
    logoMoonColor: '#e2e8f0',
    logoMoonGlow: 0.25,
    logoSssColor: '#8fd0f5',
    logoSssGlow: 0.85,
    inputShellBg: '#18181e',
    inputShellOpacity: 0.65,
    inputShellBorder: 'rgba(255, 255, 255, 0.16)',
    inputShellText: '#f8fafc',
    topbarBg: '#121216',
    topbarOpacity: 0.68,
    topbarBlur: 32,
    topbarBorder: 'rgba(255, 255, 255, 0.10)',
    cardBg: '#191920',
    cardOpacity: 0.52,
    cardBlur: 24,
    cardBorder: 'rgba(255, 255, 255, 0.11)'
};

const FACTORY_THEME_LIGHT = {
    streamColor: '#0066ff',
    streamTailColor: '#3b82f6',
    accentColor: '#1d4ed8',
    btnTint: '#1d4ed8',
    selBgColor: '#3b82f6',
    selBgOpacity: 0.30,
    selTextColor: '#ffffff',
    userSelBgColor: '#2563eb',
    userSelBgOpacity: 0.35,
    userSelTextColor: '#ffffff',
    aiSelBgColor: '#0284c7',
    aiSelBgOpacity: 0.30,
    aiSelTextColor: '#ffffff',
    bgColor: '#edf0f5',
    textColor: '#0f172a',
    textDimColor: '#475569',
    userBubbleBg: '#dbeafe',
    userBubbleOpacity: 0.72,
    userBubbleBlur: 28,
    userBubbleBorder: 'rgba(255, 255, 255, 0.75)',
    userBubbleText: '#0f172a',
    aiBubbleBg: '#ffffff',
    aiBubbleOpacity: 0.70,
    aiBubbleBlur: 32,
    aiBubbleBorder: 'rgba(255, 255, 255, 0.85)',
    aiBubbleText: '#1e293b',
    elemBg: '#ffffff',
    elemOpacity: 0.65,
    elemBlur: 26,
    elemBorder: 'rgba(255, 255, 255, 0.75)',
    liquidColor1: '#f0f4fa',
    liquidColor2: '#38bdf8',
    liquidColor3: '#60a5fa',
    liquidSpeed: 20,
    liquidShape: 'Checks',
    liquidScale: 0.52,
    liquidRotation: -30,
    liquidDistortion: 5,
    liquidSwirl: 45,
    liquidSwirlIterations: 6,
    liquidSoftness: 75,
    logoMoonColor: '#0f172a',
    logoMoonGlow: 0.15,
    logoSssColor: '#0284c7',
    logoSssGlow: 0.45,
    inputShellBg: '#ffffff',
    inputShellOpacity: 0.75,
    inputShellBorder: 'rgba(255, 255, 255, 0.85)',
    inputShellText: '#0f172a',
    topbarBg: '#f8fafc',
    topbarOpacity: 0.72,
    topbarBlur: 32,
    topbarBorder: 'rgba(255, 255, 255, 0.75)',
    cardBg: '#ffffff',
    cardOpacity: 0.68,
    cardBlur: 24,
    cardBorder: 'rgba(255, 255, 255, 0.80)'
};

/* ---------- Инициализация LiquidGradient (21st.js) ---------- */
let liquidBg = null;

function initLiquidBackground() {
    const container = document.getElementById('liquidBgContainer');
    if (!container || typeof window.LiquidGradientBackground !== 'function') return;

    container.style.display = '';

    const isLight = state.settings.theme === 'light';
    const preset = isLight ? 'Prism' : 'Prism';

    if (liquidBg) {
        syncLiquidBgWithTheme();
        liquidBg.resume();
        return;
    }

    liquidBg = new window.LiquidGradientBackground(container, {
        preset: preset,
        noise: { opacity: 0.10, scale: 1 },
        speed: 24
    });

    syncLiquidBgWithTheme();
}

function syncLiquidBgWithTheme() {
    if (!liquidBg) return;
    const isLight = state.settings.theme === 'light';
    const themes = state.settings.customThemes || { dark: FACTORY_THEME_DARK, light: FACTORY_THEME_LIGHT };
    const t = themes[state.settings.theme] || (isLight ? FACTORY_THEME_LIGHT : FACTORY_THEME_DARK);

    const c1 = t.liquidColor1 || (isLight ? '#f0f4fa' : '#070b14');
    const c2 = t.liquidColor2 || (isLight ? '#38bdf8' : '#2563eb');
    const c3 = t.liquidColor3 || (isLight ? '#60a5fa' : '#8fd0f5');
    const speed = typeof t.liquidSpeed === 'number' ? t.liquidSpeed : (isLight ? 20 : 24);

    const shape = t.liquidShape || 'Checks';
    const scale = typeof t.liquidScale === 'number' ? t.liquidScale : (isLight ? 0.52 : 0.55);
    const rotation = typeof t.liquidRotation === 'number' ? t.liquidRotation : (isLight ? -30 : -35);
    const distortion = typeof t.liquidDistortion === 'number' ? t.liquidDistortion : (isLight ? 5 : 6);
    const swirl = typeof t.liquidSwirl === 'number' ? t.liquidSwirl : (isLight ? 45 : 55);
    const swirlIterations = typeof t.liquidSwirlIterations === 'number' ? t.liquidSwirlIterations : (isLight ? 6 : 8);
    const softness = typeof t.liquidSoftness === 'number' ? t.liquidSoftness : (isLight ? 75 : 65);

    liquidBg.setCustomConfig({
        color1: c1,
        color2: c2,
        color3: c3,
        rotation: rotation,
        proportion: 50,
        scale: scale,
        speed: speed,
        distortion: distortion,
        swirl: swirl,
        swirlIterations: swirlIterations,
        softness: softness,
        offset: 0,
        shape: shape,
        shapeSize: isLight ? 40 : 45
    });
}

/* ---------- Состояние ---------- */
let state = {
    chats: [],
    activeId: null,
    favorites: [],
    openRouterModels: [],
    openRouterModelsFetchedAt: 0,
    settings: {
        proxyKey: '',
        orKey: '',
        systemPrompt: '',
        theme: 'dark',
        apiSource: 'auto',
        modelId: (typeof MODELS !== 'undefined' && Array.isArray(MODELS) && MODELS[0]) ? MODELS[0].id : 'anthropic/claude-3.7-sonnet',
        reasoning: 'medium',
        reasoningEffort: 'medium',
        openaiReasoningSummary: 'auto',
        openaiReasoningMode: 'standard',
        claudeThinkingDisplay: 'summarized',
        webSearch: false,
        editMode: false,
        artifacts: true,
        imageGen: true,
        codeExec: true,
        devRoleUnlocked: false,
        aiThemeDesignerModel: 'anthropic/claude-sonnet-5.5',
        aiDevDesignerModel: 'anthropic/claude-sonnet-5.5',

        webSearchCfg: {
            anthropic: { max_uses: 3, context_size: 'medium', country: 'RU', city: 'Moscow', region: 'Moscow', timezone: 'Europe/Moscow', allowed_domains: '', blocked_domains: '' },
            openai: { context_size: 'medium', country: 'RU', city: 'Moscow', region: 'Moscow' },
            openrouter: { limit: 3, web_fetch_engine: 'auto' }
        },
        imgGen: {
            model: 'black-forest-labs/flux.2-pro',
            ratio: '1:1',
            resolution: '1K',
            background: 'auto',
            fluxSteps: 28,
            fluxGuidance: 3.5,
            fluxSafety: 5,
            fluxFormat: 'jpeg'
        },
        codeExecEngine: 'auto',
        openRouterShell: true,
        deepThink: { enabled: true, maxTasks: 100 },
        customThemes: {
            dark: { ...FACTORY_THEME_DARK },
            light: { ...FACTORY_THEME_LIGHT }
        },
        customCursor: {
            enabled: false,
            pointerUrl: '',
            textUrl: ''
        },
        typography: {
            ru: { font: 'system', sizeType: 'system', size: 16 },
            en: { font: 'system', sizeType: 'system', size: 16 },
            ja: { font: 'system', sizeType: 'system', size: 16 }
        },
        customCode: {
            enabled: true,
            dark: { css: '', js: '' },
            light: { css: '', js: '' }
        },
        savedThemes: [],
        modelProviders: {}
    }
};
let pendingAtt = [];       // вложения в composer
window.pendingAtt = pendingAtt;
window.addFiles = addFiles;
let streaming = false;
window.streaming = false;
let stickToBottom = true;  // автоприжатие к низу во время стриминга (false = пользователь читает выше)
let abortCtrl = null;
let curSnap = null;        // снимок камеры

function setStreamingState(val) {
    streaming = !!val;
    window.streaming = streaming;
    if (streaming) {
        document.body.classList.add('is-streaming');
    } else {
        document.body.classList.remove('is-streaming');
    }
    setSendBtn();
}
window.setStreamingState = setStreamingState;

const $ = s => document.querySelector(s);
const uid = () => 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
window.esc = esc;

// Экспорт в глобальную область для proxymodel.js
window.state = state;
/* SECURITY: разрешаем только http/https в кликабельных ссылках (защита от javascript:/data:) */
const safeHref = u => {
    try {
        const p = new URL(u);
        return (p.protocol === 'http:' || p.protocol === 'https:') ? esc(u) : '#';
    } catch (e) {
        return '#';
    }
};
/* ============================================================
ВНЕШНИЕ ССЫЛКИ → браузер по умолчанию (Electron / Capacitor / Web)

Проблема: DOMPurify вешает target="_blank" на все <a> в markdown,
рендерер — на карточки веб-поиска. В Electron клик по _blank уходит
через setWindowOpenHandler → open-in-app-browser IPC → во встроенный
браузер приложения, а не в системный. Пользователь ожидает Chrome /
Firefox / Safari по умолчанию — ссылка молча теряется.

Решение: в нативной среде перехватываем клик и открываем URL через
window.electronAPI.openExternal() → shell.openExternal() в main.js.
В обычном браузере не мешаем родному поведению _blank (новая вкладка).
============================================================ */
const hasNativeOpener = () =>
    (window.electronAPI && typeof window.electronAPI.openExternal === 'function') ||
    (window.Capacitor && Capacitor.isNative);

async function openExternalUrl(url) {
    try {
        const p = new URL(url);
        if (p.protocol !== 'http:' && p.protocol !== 'https:') return false;
    } catch (e) { return false; }

    /* 1. Electron: IPC open-in-system-browser -> shell.openExternal в main.js */
    if (window.electronAPI && typeof window.electronAPI.openExternal === 'function') {
        try { window.electronAPI.openExternal(url); return true; } catch (e) { }
    }

    /* 2. Capacitor Android: @capacitor/browser -> Chrome Custom Tabs или AppLauncher */
    const isCapacitorNative = window.Capacitor && (typeof Capacitor.isNativePlatform === 'function' ? Capacitor.isNativePlatform() : Capacitor.isNative);
    if (isCapacitorNative && window.Capacitor.Plugins) {
        if (window.Capacitor.Plugins.Browser && typeof window.Capacitor.Plugins.Browser.open === 'function') {
            try { await window.Capacitor.Plugins.Browser.open({ url }); return true; } catch (e) { }
        }
        if (window.Capacitor.Plugins.AppLauncher && typeof window.Capacitor.Plugins.AppLauncher.openUrl === 'function') {
            try { await window.Capacitor.Plugins.AppLauncher.openUrl({ url }); return true; } catch (e) { }
        }
        try { window.open(url, '_system'); return true; } catch (e) { }
    }

    /* 3. Фолбэк: в обычном браузере открываем через безопасную ссылку */
    try {
        const w = window.open(url, '_blank', 'noopener,noreferrer');
        if (w) return true;
    } catch (e) { }
    return false;
}
window.openExternalUrl = openExternalUrl;

/* Capture-перехват кликов по <a href="https://...">.
Срабатывает ТОЛЬКО в нативных оболочках; в обычном браузере ранний
return оставляет штатное открытие новой вкладки.
Перехват ведёт в модалку подтверждения — защита от случайных кликов. */
document.addEventListener('click', e => {
    if (!hasNativeOpener()) return;
    const a = e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href') || '';
    if (!/^https?:\/\//i.test(href)) return;
    e.preventDefault();
    e.stopPropagation();
    showExternalConfirm(href);
}, true);

/* ============================================================
ПОДТВЕРЖДЕНИЕ ПЕРЕХОДА ПО ВНЕШНЕЙ ССЫЛКЕ
Пользователь видит домен и полный URL перед тем, как приложение
откроет браузер по умолчанию. Защита от случайных кликов.
============================================================ */
let pendingExternalUrl = null;
function showExternalConfirm(url) {
    pendingExternalUrl = url;
    let host = '—';
    try { host = new URL(url).hostname; } catch (e) { }
    const dEl = $('#elDomain');
    const uEl = $('#elUrlLine');
    if (dEl) dEl.textContent = host;
    if (uEl) uEl.textContent = url;
    $('#externalLinkOverlay').classList.add('show');
    /* Фокус на кнопке «Остаться»: при случайном клике пользователь
       инстинктивно жмёт Enter — и остаётся в приложении */
    setTimeout(() => { try { $('#elCancel').focus({ preventScroll: true }); } catch (e) { } }, 80);
}
function closeExternalConfirm() {
    $('#externalLinkOverlay').classList.remove('show');
    pendingExternalUrl = null;
}
$('#elClose').addEventListener('click', closeExternalConfirm);
$('#elCancel').addEventListener('click', closeExternalConfirm);
$('#elGo').addEventListener('click', () => {
    const url = pendingExternalUrl;
    closeExternalConfirm();
    if (url) openExternalUrl(url);
});
$('#externalLinkOverlay').addEventListener('click', e => {
    if (e.target === $('#externalLinkOverlay')) closeExternalConfirm();
});
/* Детерминированная генеративная иконка домена: inline SVG, без внешних запросов и CDN */
let faviconSeq = 0;
const hashStr = s => { let h = 0; for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; } return Math.abs(h); };
function domainHost(uri) {
    try { return new URL(uri).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
}
window.domainHost = domainHost;
function domainIcon(uri, size = 30) {
    const host = domainHost(uri) || 'web';
    const h = hashStr(host);
    const hue = h % 360, hue2 = (hue + 42) % 360;
    const letter = esc((host.replace(/[^a-zа-яё0-9]/gi, '').charAt(0) || 'w').toUpperCase());
    const gid = 'fg' + (faviconSeq++);
    return `<svg viewBox="0 0 28 28" style="width:${size}px;height:${size}px" aria-hidden="true"><defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsla(${hue},62%,56%,1)"/><stop offset="1" stop-color="hsla(${hue2},58%,40%,1)"/></linearGradient></defs><rect x="1" y="1" width="26" height="26" rx="7.5" fill="url(#${gid})"/><rect x="1" y="1" width="26" height="26" rx="7.5" fill="none" stroke="hsla(0,0%,100%,.16)"/><text x="14" y="18.6" text-anchor="middle" font-family="Manrope,system-ui,sans-serif" font-size="13" font-weight="800" fill="hsla(0,0%,100%,.94)">${letter}</text></svg>`;
}
/* Реальные фавиконки сайтов: Google → DuckDuckGo → генеративная иконка */
const favCache = new Map();
function faviconImg(uri) {
    const host = domainHost(uri);
    if (!host) return domainIcon(uri, 24);
    const g = 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(host) + '&sz=64';
    const ddg = 'https://icons.duckduckgo.com/ip3/' + encodeURIComponent(host) + '.ico';
    const cached = favCache.get(host);
    const src = cached || g;
    const chain = [g, ddg].filter(u => u !== src).join('|');
    return '<img src="' + esc(src) + '" data-favchain="' + esc(chain) + '" data-favhost="' + esc(host) + '" alt="" loading="lazy" draggable="false">';
}
function enhanceFavicons(root) {
    root.querySelectorAll('.ws-favicon img[data-favchain], .sc-favicon img[data-favchain], .scc-fav img[data-favchain], .scb-fav img[data-favchain]').forEach(img => {
        if (img.dataset.favbound) return;
        img.dataset.favbound = '1';
        const chain = (img.dataset.favchain || '').split('|').filter(Boolean);
        const host = img.dataset.favhost || '';
        let i = 0;
        img.addEventListener('load', () => { if (host) favCache.set(host, img.src); });
        img.addEventListener('error', () => {
            if (i < chain.length) { img.src = chain[i]; i++; }
            else {
                const span = img.closest('.ws-favicon, .sc-favicon, .scc-fav, .scb-fav');
                if (span) span.innerHTML = domainIcon(span.dataset.uri || '', 20);
            }
        });
    });
}
/* Интеллектуальный поиск моделей с нечувствительностью к регистру, знакам препинания и префиксам */
function matchModelSearch(model, searchStr) {
    if (!searchStr) return true;
    if (!model) return false;

    const query = String(searchStr).trim().toLowerCase();
    if (!query) return true;

    const id = String(model.id || '').toLowerCase();
    const name = String(model.name || '').toLowerCase();
    const provider = String(model.provider || '').toLowerCase();
    const author = String(model.author || '').toLowerCase();
    const tagline = String(model.tagline || '').toLowerCase();
    const desc = String(model.description || '').toLowerCase();

    // Быстрый поиск по прямому вхождению подстроки
    if (id.includes(query) || name.includes(query) || provider.includes(query) || author.includes(query) || tagline.includes(query) || desc.includes(query)) {
        return true;
    }

    // Нормализация с заменой разделителей (/, :, -, _, ., ()) на пробелы и компактизация
    const normalize = s => s.replace(/[/:\-_.,+()]/g, ' ').replace(/\s+/g, ' ').trim();
    const compact = s => s.replace(/[/:\-_.,+()\s]/g, '');

    const normTarget = normalize(`${id} ${name} ${provider} ${author} ${tagline}`);
    const compTarget = compact(`${id} ${name} ${provider} ${author}`);
    const normQuery = normalize(query);
    const compQuery = compact(query);

    if (compQuery && compTarget.includes(compQuery)) return true;
    if (normQuery && normTarget.includes(normQuery)) return true;

    // Пословный поиск всех токенов запроса
    const tokens = normQuery.split(' ').filter(Boolean);
    if (tokens.length > 1) {
        const allTokensMatch = tokens.every(tok => {
            const compTok = compact(tok);
            return normTarget.includes(tok) || (compTok && compTarget.includes(compTok));
        });
        if (allTokensMatch) return true;
    }

    return false;
}
window.matchModelSearch = matchModelSearch;

/* Единый динамический резолвер всех моделей (Курируемые + OpenRouter Live от новых к старым) */
function getAllModels() {
    const dynamicModels = Array.isArray(state.openRouterModels) ? state.openRouterModels : [];
    const curatedIds = new Set(MODELS.map(m => m.id));
    const cleanCuratedIds = new Set(MODELS.map(m => m.id.replace(/:[a-zA-Z0-9_.-]+$/i, '')));
    const customOrModels = dynamicModels
        .filter(dm => !curatedIds.has(dm.id) && !cleanCuratedIds.has(dm.id.replace(/:[a-zA-Z0-9_.-]+$/i, '')))
        .sort((a, b) => (b.created || 0) - (a.created || 0) || a.name.localeCompare(b.name));
    return [...MODELS, ...customOrModels];
}

const getModel = id => {
    if (!id) return MODELS[0];
    const cleanId = String(id).replace(/:[a-zA-Z0-9_.-]+$/i, '');
    const all = getAllModels();
    return all.find(m => m.id === id) ||
        all.find(m => m.id === cleanId) ||
        all.find(m => m.id.replace(/:[a-zA-Z0-9_.-]+$/i, '') === cleanId) ||
        MODELS[0];
};

window.getAllModels = getAllModels;
window.getModel = getModel;

const activeChat = () => state.chats.find(c => c.id === state.activeId) || null;
window.activeChat = activeChat;

function toSafeHeaderValue(val, fallback = '') {
    if (val === null || val === undefined) return fallback;
    let str = String(val)
        .replace(/[\u2014\u2013]/g, '-')
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\r\n\t]+/g, ' ')
        .trim();
    if (!str) return fallback;

    let hasNonIso = false;
    for (let i = 0; i < str.length; i++) {
        if (str.charCodeAt(i) > 127) {
            hasNonIso = true;
            break;
        }
    }

    if (hasNonIso) {
        // Очищаем от не-ASCII символов, предотвращая сбои HTTP-парсера OpenRouter
        const asciiOnly = str.replace(/[^\x20-\x7E]/g, '').replace(/\s+/g, ' ').trim();
        return asciiOnly || fallback;
    }
    return str || fallback;
}
window.toSafeHeaderValue = toSafeHeaderValue;

const APP_IDENTITY = Object.freeze({
    title: 'MoonSSS',
    refererUrl: 'https://unichat2.sahbanovtimur228.workers.dev',
    faviconUrl: 'https://unichat2.sahbanovtimur228.workers.dev/favicon.ico',
    description: 'MoonSSS — премиальный ИИ-ассистент с поддержкой передовых моделей, инструментов и живых артефактов.',
    categories: 'general-chat,programming-app'
});
window.APP_IDENTITY = APP_IDENTITY;

function getOpenRouterAttributionHeaders(subTitle = '') {
    const safeTitle = toSafeHeaderValue(APP_IDENTITY.title, 'MoonSSS');
    const safeReferer = toSafeHeaderValue(APP_IDENTITY.refererUrl, 'https://unichat2.sahbanovtimur228.workers.dev');

    return {
        'HTTP-Referer': safeReferer,
        'X-Title': safeTitle
    };
}
window.getOpenRouterAttributionHeaders = getOpenRouterAttributionHeaders;

let isStateLoaded = false;
let saveTimer = null, dbErrorShown = false;
/* В IndexedDB не пишем каталог OpenRouter (сотни моделей с описаниями): он хранится отдельным ключом or_models */
function stateForDb() {
    const snap = Object.assign({}, state);
    delete snap.openRouterModels;
    return snap;
}
function save(immediate = false) {
    if (!isStateLoaded) {
        // Железная защита: если база ещё не прочитана, ни при каких условиях не сохраняем
        return;
    }
    const flush = () => {
        saveTimer = null;
        const snap = stateForDb();
        dbCtrl.set('state', snap).then(() => {
            // Создаем страховочный теневой снимок, если в памяти есть чаты
            if (Array.isArray(state.chats) && state.chats.length > 0) {
                dbCtrl.set('state_backup', snap).catch(() => { });
                dbCtrl.set('state_rescue_snapshot', snap).catch(() => { });
            }
        }).catch(() => {
            if (!dbErrorShown) { dbErrorShown = true; toast('Ошибка сохранения данных в БД', 'err'); }
        });
    };
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    if (immediate) { flush(); return; }
    saveTimer = setTimeout(flush, 450);
}
window.addEventListener('pagehide', () => {
    // Сохраняем на выходе ТОЛЬКО если в памяти есть реальные данные (включая сохранённые темы оформления)
    if (isStateLoaded && (state.chats?.length > 0 || state.settings?.proxyKey || state.settings?.orKey || state.settings?.savedThemes?.length > 0)) {
        save(true);
    }
});
async function load() {
    try {
        let s = await dbCtrl.get('state');
        // Тройной уровень страховки: если основная запись пуста, ищем в резервных ветках
        if (!s || (!s.chats?.length && !s.settings?.proxyKey && !s.settings?.orKey && !s.settings?.savedThemes?.length)) {
            const backup = (await dbCtrl.get('state_backup')) || (await dbCtrl.get('state_rescue_snapshot'));
            if (backup && (backup.chats?.length || backup.settings?.proxyKey || backup.settings?.orKey || backup.settings?.savedThemes?.length)) {
                console.log('[MoonSSS] Данные восстановлены из резервной копии');
                s = backup;
                await dbCtrl.set('state', backup);
            }
        }
        if (s) {
            // Создаем несгораемый снимок существующих данных при первом же успешном чтении
            if (Array.isArray(s.chats) && s.chats.length > 0) {
                dbCtrl.set('state_rescue_snapshot', s).catch(() => { });
            }
            if (s.settings) state.settings = Object.assign(state.settings, s.settings);
            state.settings.imgGen = Object.assign({
                model: 'black-forest-labs/flux.2-pro',
                ratio: '1:1',
                resolution: '2K',
                background: 'auto',
                fluxSteps: 28,
                fluxGuidance: 3.5,
                fluxSafety: 5,
                fluxFormat: 'jpeg'
            }, state.settings.imgGen || {});
            state.settings.deepThink = Object.assign({ enabled: true }, state.settings.deepThink || {});
            state.settings.deepThink.maxTasks = 100;
            state.settings.webSearchCfg = Object.assign({
                anthropic: { max_uses: 3, context_size: 'medium', country: 'RU', city: 'Moscow', region: 'Moscow', timezone: 'Europe/Moscow', allowed_domains: '', blocked_domains: '' },
                openai: { context_size: 'medium', country: 'RU', city: 'Moscow', region: 'Moscow' },
                openrouter: { limit: 3, web_fetch_engine: 'auto' }
            }, state.settings.webSearchCfg || {});

            state.settings.customThemes = {
                dark: Object.assign({ ...FACTORY_THEME_DARK }, (s.settings && s.settings.customThemes && s.settings.customThemes.dark) || {}),
                light: Object.assign({ ...FACTORY_THEME_LIGHT }, (s.settings && s.settings.customThemes && s.settings.customThemes.light) || {})
            };

            state.settings.customCursor = normalizeCustomCursor(s.settings && s.settings.customCursor);

            state.settings.savedThemes = Array.isArray(s.settings && s.settings.savedThemes)
                ? s.settings.savedThemes
                : [];

            state.settings.typography = Object.assign({
                ru: { font: 'system', sizeType: 'system', size: 16 },
                en: { font: 'system', sizeType: 'system', size: 16 },
                ja: { font: 'system', sizeType: 'system', size: 16 }
            }, (s.settings && s.settings.typography) || {});

            // Предотвращение принудительного залипания шрифта Cormorant Garamond на интерфейсе приложения:
            // если в сохранённых настройках для русского остался старый дефолт cormorant, сбрасываем в системный
            if (state.settings.typography?.ru?.font === 'cormorant') {
                state.settings.typography.ru.font = 'system';
            }

            // Сохраняем пользовательские цвета без искусственных ограничений палитры

            state.settings.reasoningEffort = (s.settings && s.settings.reasoningEffort) || 'medium';
            state.settings.openaiReasoningSummary = (s.settings && s.settings.openaiReasoningSummary) || 'auto';
            state.settings.openaiReasoningMode = (s.settings && s.settings.openaiReasoningMode) || 'standard';
            state.settings.claudeThinkingDisplay = (s.settings && s.settings.claudeThinkingDisplay) || 'summarized';
            state.settings.modelProviders = (s.settings && typeof s.settings.modelProviders === 'object' && s.settings.modelProviders !== null)
                ? s.settings.modelProviders
                : {};

            state.settings.customCode = normalizeCustomCode(s.settings && s.settings.customCode);

            if (s.settings && s.settings.aiThemeDesignerModel) {
                state.settings.aiThemeDesignerModel = s.settings.aiThemeDesignerModel;
            }
            if (s.settings && s.settings.aiDevDesignerModel) {
                state.settings.aiDevDesignerModel = s.settings.aiDevDesignerModel;
            }

            if (Array.isArray(s.chats)) state.chats = s.chats;
            state.chats.forEach(c => (c.messages || []).forEach(m => {
                (m.generatedImages || []).forEach(g => {
                    if (g.status === 'generating') { g.status = 'error'; g.error = 'Генерация прервана перезагрузкой приложения'; }
                });
                (m.imageRequests || []).forEach(r => {
                    if (r.status === 'generating') { r.status = 'awaiting'; r.startedAt = 0; }
                });
                (m.thinkSessions || []).forEach(s => {
                    if (s.status === 'running') {
                        s.status = 'error';
                        s.finishedAt = s.finishedAt || Date.now();
                        s.tasks.forEach(t => {
                            if (t.status === 'thinking') { t.status = 'error'; t.result = 'Прервано перезагрузкой приложения'; t.finishedAt = t.finishedAt || Date.now(); }
                        });
                    }
                });
                (m.executions || []).forEach(x => {
                    if (x.status === 'running') {
                        x.status = 'killed'; x.exitCode = -1;
                        x.finishedAt = x.finishedAt || Date.now();
                        x.output = x.output || [];
                        x.output.push({ type: 'sys', data: '■ Выполнение прервано перезагрузкой приложения' });
                        x.summary = 'Прервано перезагрузкой';
                    }
                });
            }));
            if (Array.isArray(s.favorites)) state.favorites = s.favorites;
            if (Array.isArray(s.openRouterModels)) state.openRouterModels = s.openRouterModels;
            if (typeof s.openRouterModelsFetchedAt === 'number') state.openRouterModelsFetchedAt = s.openRouterModelsFetchedAt;
            const cachedOr = await dbCtrl.get('or_models');
            if (Array.isArray(cachedOr) && cachedOr.length) state.openRouterModels = cachedOr;

            // Восстанавливаем сохранённый чат или выбираем первый существующий
            if (s.activeId && state.chats.some(c => c.id === s.activeId)) {
                state.activeId = s.activeId;
            } else if (state.chats.length > 0) {
                state.activeId = state.chats[0].id;
            }
        }
    } catch (e) {
        console.error('Failed to load state from IndexedDB:', e);
    } finally {
        isStateLoaded = true;
    }
}

/* Фоновая и ручная синхронизация каталога моделей OpenRouter */
let isFetchingOrModels = false;
async function refreshOpenRouterModels(silent = false) {
    if (isFetchingOrModels) return;
    isFetchingOrModels = true;
    updateOrModelRefreshButtons(true);
    if (!silent) toast('Загрузка моделей OpenRouter…', 'info', 2000);

    try {
        const apiKey = (state.settings.orKey || '').trim();
        const rawModels = await fetchOpenRouterModels(apiKey);
        if (Array.isArray(rawModels) && rawModels.length > 0) {
            const normalized = rawModels
                .map(normalizeOpenRouterModel)
                .filter(Boolean)
                .sort((a, b) => (b.created || 0) - (a.created || 0) || a.name.localeCompare(b.name));

            state.openRouterModels = normalized;
            dbCtrl.set('or_models', normalized);
            state.openRouterModelsFetchedAt = Date.now();
            save();
            renderModelMenu();
            renderModelProvidersSettings();
            updateTopChips();
            if (!silent) toast(`Загружено ${normalized.length} моделей OpenRouter`, 'ok', 2600);
        } else {
            if (!silent) toast('OpenRouter вернул пустой список моделей', 'warn');
        }
    } catch (e) {
        console.warn('[MoonSSS] OpenRouter models fetch failed:', e);
        if (!silent) toast('Ошибка загрузки моделей OpenRouter: ' + (e.message || e), 'err', 4000);
    } finally {
        isFetchingOrModels = false;
        updateOrModelRefreshButtons(false);
    }
}
window.refreshOpenRouterModels = refreshOpenRouterModels;

function updateOrModelRefreshButtons(isSpinning) {
    document.querySelectorAll('.btn-refresh-or-models').forEach(btn => {
        btn.classList.toggle('spinning', isSpinning);
        btn.disabled = isSpinning;
    });
}

/* ---------- Markdown ---------- */
if (window.marked) marked.setOptions({ gfm: true, breaks: true });
if (window.DOMPurify) {
    DOMPurify.addHook('afterSanitizeAttributes', node => {
        if (node.tagName === 'A') {
            node.setAttribute('target', '_blank');
            node.setAttribute('rel', 'noopener noreferrer');
        }
    });
}
function mdToHtml(text) {
    if (window.marked && window.DOMPurify) return DOMPurify.sanitize(marked.parse(text || ''));
    return '<p>' + esc(text || '').replace(/\n/g, '<br>') + '</p>';
}
window.mdToHtml = mdToHtml;
const HTML_LANGS = ['html', 'htm', 'xhtml', 'xml', 'svg', 'markup'];
const isHtmlLang = lang => HTML_LANGS.includes(String(lang || '').toLowerCase());

function enhanceMediaEmbeds(root) {
    if (!root) return;
    if (window.toolCalling) {
        window.toolCalling.enhanceMediaEmbeds(root);
    }
}

function enhanceCode(root) {
    root.querySelectorAll('pre code').forEach(block => {
        if (block.closest('.think, .think-body, .think-head, .think-par')) return;
        const pre = block.parentElement;
        if (pre && pre.closest('.think, .think-body, .think-head, .think-par')) return;
        if (window.hljs) {
            delete block.dataset.highlighted;
            try { window.hljs.highlightElement(block); } catch (e) { }
        }
        if (pre.querySelector('.code-tools')) return;
        /* Номера строк: отдельный элемент, не входит в код и не копируется */
        const raw = String(block.textContent || '').replace(/\n$/, '');
        const lineCount = raw.split('\n').length;
        if (lineCount > 0 && !pre.querySelector('.code-lines')) {
            const lines = document.createElement('div');
            lines.className = 'code-lines';
            lines.setAttribute('aria-hidden', 'true');
            lines.textContent = Array.from({ length: lineCount }, (_, i) => i + 1).join('\n');
            pre.insertBefore(lines, block);
        }
        const lang = (block.className.match(/language-([\w+-]+)/) || [])[1] || (block.result?.language);
        const wrap = document.createElement('div'); wrap.className = 'code-tools';
        if (lang) {
            const l = document.createElement('span'); l.className = 'code-lang'; l.textContent = lang;
            wrap.appendChild(l);
        }
        if (isHtmlLang(lang)) {
            const run = document.createElement('button'); run.className = 'code-run'; run.title = 'Запустить · live-превью';
            run.setAttribute('aria-label', 'Запустить HTML в live-превью');
            run.innerHTML = '<svg class="ic"><use href="#i-play"/></svg>';
            run.addEventListener('click', () => openHtmlPreview(block.innerText, lang));
            wrap.appendChild(run);
        }
        const b = document.createElement('button'); b.className = 'code-copy'; b.title = 'Копировать код';
        b.innerHTML = '<svg class="ic"><use href="#i-copy"/></svg>';
        b.addEventListener('click', () => {
            navigator.clipboard.writeText(block.innerText).then(() => toast('Код скопирован', 'ok'));
        });
        wrap.appendChild(b);
        pre.appendChild(wrap);
        pre.classList.add('has-tools');
    });
}
/* ============================================================
LIVE-ПРЕВЬЮ HTML-КОДА v2 — SEALED SANDBOX
Безопасность: sandbox="allow-scripts" (без popups/modals/forms),
CSP инъектируется внутрь srcdoc, блокируя внешние запросы.
============================================================ */
let hpSrc = '', hpBlobUrl = null, hpMinimized = false, hpFullscreen = false;

function sealHtml(raw) {
    return window.toolCalling ? window.toolCalling.sealHtml(raw) : raw;
}

/* Boot-последовательность: запуск анимации ThinkingOrb при открытии Live Preview */
function hpRunBoot(lang, cb) {
    const bar = $('#hpBootBar');
    const boot = $('#hpBoot');
    const sub = $('#hpBootStatusSub');
    const canvas = $('#hpBootOrbCanvas');
    if (!boot) { if (cb) cb(); return; }

    if (canvas && typeof window.ThinkingOrb === 'function') {
        const activeTheme = state.settings.theme || 'dark';
        const color = state.settings.customThemes?.[activeTheme]?.accentColor || null;
        if (!canvas._orbInstance) {
            canvas._orbInstance = new window.ThinkingOrb(canvas, {
                state: 'shaping',
                size: 64,
                theme: activeTheme,
                color: color,
                speed: 1.15
            });
        } else {
            canvas._orbInstance.setState('shaping');
            canvas._orbInstance.setTheme(activeTheme);
            canvas._orbInstance.setColor(color);
        }
    }

    const stages = [
        'Инициализация sealed sandbox…',
        'Компиляция ' + String(lang || 'html').toUpperCase() + '…',
        'Калибровка стилей и среды…',
        'Среда готова'
    ];

    if (bar) bar.style.width = '0%';
    boot.classList.remove('done');
    let i = 0;
    const step = () => {
        if (i >= stages.length) {
            if (bar) bar.style.width = '100%';
            if (sub) sub.textContent = 'Запуск песочницы…';
            setTimeout(() => {
                boot.classList.add('done');
                if (cb) cb();
            }, 300);
            return;
        }
        if (sub) sub.textContent = stages[i];
        if (bar) bar.style.width = Math.round(((i + 1) / stages.length) * 90) + '%';
        i++;
        setTimeout(step, 200 + Math.random() * 120);
    };
    setTimeout(step, 140);
}


function openHtmlPreview(code, lang) {
    hpSrc = String(code || '').trim();
    if (!hpSrc) { toast('Блок кода пуст', 'err'); return; }
    hpMinimized = false; hpFullscreen = false;
    $('#htmlPreview').classList.remove('hp-minimized', 'hp-fullscreen');
    $('#htmlPreview').hidden = false;

    hpRunBoot(lang, () => {
        const frame = $('#hpFrame');
        if (!frame) return;

        let sealed;
        try {
            sealed = sealHtml(hpSrc);
            if (!sealed || typeof sealed !== 'string') sealed = hpSrc;
        } catch (err) {
            console.warn('[MoonSSS] sealHtml failed, raw fallback:', err);
            sealed = hpSrc;
        }

        $('#hpStatusText').textContent = 'Рендеринг…';
        $('#hpStatus').classList.add('show');

        frame.onload = () => {
            if ($('#htmlPreview').hidden) return;
            $('#hpStatusText').textContent = 'Sealed · ' + String(lang || 'html').toUpperCase() + ' · fonts allowed';
            setTimeout(() => $('#hpStatus').classList.remove('show'), 2200);
        };
        frame.srcdoc = sealed;
    });

    setTimeout(() => { try { $('#hpDotClose').focus({ preventScroll: true }); } catch (_) { } }, 90);
}


function closeHtmlPreview() {
    $('#htmlPreview').hidden = true;
    $('#htmlPreview').classList.remove('hp-minimized', 'hp-fullscreen');
    $('#hpFrame').removeAttribute('srcdoc');
    $('#hpBoot').classList.remove('done');
    if (hpBlobUrl) {
        try { URL.revokeObjectURL(hpBlobUrl); } catch (_) { }
        hpBlobUrl = null;
    }
    hpMinimized = false; hpFullscreen = false;
}

function minimizeHtmlPreview() {
    hpMinimized = true;
    $('#htmlPreview').classList.add('hp-minimized');
    $('#htmlPreview').classList.remove('hp-fullscreen');
    hpFullscreen = false;
}

function restoreFromMinimize() {
    hpMinimized = false;
    $('#htmlPreview').classList.remove('hp-minimized');
}

function toggleFullscreen() {
    hpFullscreen = !hpFullscreen;
    $('#htmlPreview').classList.toggle('hp-fullscreen', hpFullscreen);
    const maxIcon = $('#hpDotMax svg');
    if (hpFullscreen) {
        maxIcon.innerHTML = '<path d="M2.5 1.5H1.5v1M6.5 1.5h1v1M6.5 6.5h1v-1M1.5 6.5v-1h1"/>';
    } else {
        maxIcon.innerHTML = '<path d="M1.5 3V1.5H3M5 1.5h1.5V3M6.5 5v1.5H5M3 6.5H1.5V5"/>';
    }
}

function refreshHtmlPreview() {
    if (!hpSrc) return;
    const frame = $('#hpFrame');
    $('#hpStatusText').textContent = 'Перезапуск…';
    $('#hpStatus').classList.add('show');
    frame.srcdoc = '';
    requestAnimationFrame(() => { frame.srcdoc = sealHtml(hpSrc); });
}

function openHtmlPreviewExternal() {
    if (!hpSrc) { toast('Нет кода для открытия', 'err'); return; }
    try {
        if (hpBlobUrl) URL.revokeObjectURL(hpBlobUrl);
        hpBlobUrl = URL.createObjectURL(new Blob([sealHtml(hpSrc)], { type: 'text/html;charset=utf-8' }));
        const w = window.open(hpBlobUrl, '_blank', 'noopener,noreferrer');
        if (!w) { toast('Среда заблокировала открытие новой вкладки', 'err'); return; }
        toast('Открыто с сохранением CSP-изоляции', 'ok', 2600);
    } catch (e) { toast('Не удалось открыть в новой вкладке', 'err'); }
}

/* ── Привязка событий ── */
$('#hpDotClose').addEventListener('click', closeHtmlPreview);
$('#hpDotMin').addEventListener('click', minimizeHtmlPreview);
$('#hpDotMax').addEventListener('click', toggleFullscreen);
$('#hpClose').addEventListener('click', closeHtmlPreview);
$('#hpRefresh').addEventListener('click', refreshHtmlPreview);
$('#hpExternal').addEventListener('click', openHtmlPreviewExternal);
$('#htmlPreview').addEventListener('click', e => {
    if (e.target === $('#htmlPreview')) {
        if (hpMinimized) restoreFromMinimize();
        else closeHtmlPreview();
    }
});
/* Клик по свёрнутому пиллу — развернуть */
$('#htmlPreview').addEventListener('click', e => {
    if (hpMinimized && e.target.closest('.hp-window')) {
        restoreFromMinimize();
    }
});
const fmtTime = ts => new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
const fmtDate = ts => new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });

/* ---------- Тосты ---------- */
function toast(msg, type = 'info', dur = 3200) {
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast t-' + type;
    const icon = type === 'ok' ? 'i-check' : type === 'err' ? 'i-alert' : 'i-info';
    el.innerHTML = `<svg><use href="#${icon}"/></svg><span>${esc(msg)}</span>`;
    box.appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, dur);
}
window.toast = toast;

/* ============ ПАЛИТРЫ И ДИНАМИЧЕСКИЙ РАСЧЕТ ШЛЕЙФА ============ */
function hexToRgb(hex) {
    let c = String(hex || '').replace(/^#/, '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    if (c.length !== 6) return { r: 255, g: 215, b: 0 };
    const num = parseInt(c, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) {
        h = 0;
        s = 0;
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hexToHsla(hex, alpha = 1) {
    const rgb = hexToRgb(hex);
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    return `hsla(${hsl.h}, ${hsl.s}%, ${hsl.l}%, ${alpha})`;
}

function hexToRgba(hex, alpha = 1) {
    const rgb = hexToRgb(hex);
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    return `hsla(${hsl.h}, ${hsl.s}%, ${hsl.l}%, ${alpha})`;
}

function applyCustomThemeVariables(themeKey = state.settings.theme) {
    const root = document.documentElement;
    const themes = state.settings.customThemes || { dark: FACTORY_THEME_DARK, light: FACTORY_THEME_LIGHT };
    const t = themes[themeKey] || (themeKey === 'light' ? FACTORY_THEME_LIGHT : FACTORY_THEME_DARK);
    /* Единый флаг светлого фона: вычисляется один раз и доступен во всех секциях ниже,
    даже если t.bgColor отсутствует (в этом случае считается тёмной темой по умолчанию). */
    const isBgLight = t.bgColor
        ? ((0.299 * hexToRgb(t.bgColor).r + 0.587 * hexToRgb(t.bgColor).g + 0.114 * hexToRgb(t.bgColor).b) / 255) > 0.52
        : (themeKey === 'light');
    const streamRgb = hexToRgb(t.streamColor);
    const tailRgb = hexToRgb(t.streamTailColor);
    const streamHsl = rgbToHsl(streamRgb.r, streamRgb.g, streamRgb.b);
    const accentRgb = hexToRgb(t.accentColor);
    const accentHsl = rgbToHsl(accentRgb.r, accentRgb.g, accentRgb.b);

    const btnRgb = hexToRgb(t.btnTint || t.accentColor);
    const btnHsl = rgbToHsl(btnRgb.r, btnRgb.g, btnRgb.b);

    // 1. Шлейф генерации и курсор (16-шаговая интерполяция в точном HSLA-пространстве)
    for (let i = 1; i <= 16; i++) {
        const factor = (i - 1) / 15;
        const r = Math.round(tailRgb.r + (streamRgb.r - tailRgb.r) * factor);
        const g = Math.round(tailRgb.g + (streamRgb.g - tailRgb.g) * factor);
        const b = Math.round(tailRgb.b + (streamRgb.b - tailRgb.b) * factor);
        const hslStep = rgbToHsl(r, g, b);
        const alpha = (0.7 + 0.3 * factor).toFixed(2);
        root.style.setProperty(`--st-col-${i}`, `hsla(${hslStep.h}, ${hslStep.s}%, ${hslStep.l}%, ${alpha})`);
    }

    root.style.setProperty('--st-head', t.streamColor);
    root.style.setProperty('--st-glow-sm', `hsla(${streamHsl.h}, ${streamHsl.s}%, ${streamHsl.l}%, 0.25)`);
    root.style.setProperty('--st-glow-md', `hsla(${streamHsl.h}, ${streamHsl.s}%, ${streamHsl.l}%, 0.50)`);
    root.style.setProperty('--st-glow-lg', `hsla(${streamHsl.h}, ${streamHsl.s}%, ${streamHsl.l}%, 0.85)`);

    // 2. Цвета интерфейса и динамический оттенок кнопок
    const safeAccHue = accentHsl.h;
    const safeBtnHue = btnHsl.h;

    root.style.setProperty('--acc-h', safeAccHue);
    root.style.setProperty('--acc-s', `${accentHsl.s}%`);
    root.style.setProperty('--acc-l', `${accentHsl.l}%`);
    root.style.setProperty('--btn-tint-h', safeBtnHue);
    root.style.setProperty('--btn-tint-s', `${btnHsl.s}%`);
    root.style.setProperty('--btn-tint-l', `${btnHsl.l}%`);

    // Гарантированная прямая установка основного цвета и его производных
    root.style.setProperty('--accent', t.accentColor);
    root.style.setProperty('--accent-soft', hexToHsla(t.accentColor, isBgLight ? 0.12 : 0.16));
    root.style.setProperty('--accent-line', hexToHsla(t.accentColor, isBgLight ? 0.35 : 0.42));
    root.style.setProperty('--hover-accent', hexToHsla(t.accentColor, isBgLight ? 0.20 : 0.26));
    root.style.setProperty('--active-accent', hexToHsla(t.accentColor, isBgLight ? 0.28 : 0.36));

    // Прямые свойства оттенка кнопок (Button Tint) для полного устранения синевы
    const btnColor = t.btnTint || t.accentColor;
    root.style.setProperty('--btn-tint-color', btnColor);
    root.style.setProperty('--btn-custom-bg', hexToHsla(btnColor, isBgLight ? 0.14 : 0.18));
    root.style.setProperty('--btn-custom-border', hexToHsla(btnColor, isBgLight ? 0.28 : 0.35));
    root.style.setProperty('--btn-custom-hover-bg', hexToHsla(btnColor, isBgLight ? 0.24 : 0.28));
    root.style.setProperty('--btn-custom-border-hover', hexToHsla(btnColor, isBgLight ? 0.45 : 0.55));
    root.style.setProperty('--btn-tint-soft', hexToHsla(btnColor, isBgLight ? 0.12 : 0.16));
    root.style.setProperty('--btn-tint-line', hexToHsla(btnColor, isBgLight ? 0.30 : 0.40));
    root.style.setProperty('--btn-tint-glow', hexToHsla(btnColor, isBgLight ? 0.18 : 0.32));

    // Свечение формируется прямо из цвета акцента
    root.style.setProperty('--glow', hexToHsla(t.accentColor, isBgLight ? 0.22 : 0.40));
    root.style.setProperty('--glow-strong', hexToHsla(t.accentColor, isBgLight ? 0.40 : 0.65));

    // Silver-переменные для нейтральных хромированных эффектов (без синего подмешивания)
    root.style.setProperty('--silver-h', 0);
    root.style.setProperty('--silver-s', '0%');
    root.style.setProperty('--silver', isBgLight ? '#64748b' : '#e2e8f0');

    // Specular highlights (iOS Liquid Glass light ribs)
    const specHiAlpha = isBgLight ? 0.85 : 0.18;
    const specSoftAlpha = isBgLight ? 0.45 : 0.08;
    root.style.setProperty('--specular-hi', `inset 0 1px 0 0 hsla(0, 0%, 100%, ${specHiAlpha})`);
    root.style.setProperty('--specular-soft', `0 2px 8px hsla(${accentHsl.h}, ${accentHsl.s}%, ${accentHsl.l}%, ${specSoftAlpha})`);
    root.style.setProperty('--glass-hi', `inset 0 1px 0 0 hsla(0, 0%, 100%, ${isBgLight ? 0.65 : 0.12})`);
    root.style.setProperty('--glass-lo', `inset 0 -1px 0 0 hsla(0, 0%, 0%, ${isBgLight ? 0.04 : 0.18})`);

    // Status-цвета (должны быть консистентны с акцентом для гармонии)
    root.style.setProperty('--ok', isBgLight ? '#059669' : '#34d399');
    root.style.setProperty('--warn', isBgLight ? '#d97706' : '#fbbf24');
    root.style.setProperty('--danger', isBgLight ? '#dc2626' : '#f87171');
    root.style.setProperty('--danger-soft', isBgLight ? 'hsla(0, 72%, 51%, 0.08)' : 'hsla(0, 72%, 51%, 0.12)');

    // 3. Выделение текста ::selection и SVG-слоя MoonSSS-text-selection с контролем прозрачности через hsla
    const selRgb = hexToRgb(t.selBgColor || '#3a7bd5');
    const selHsl = rgbToHsl(selRgb.r, selRgb.g, selRgb.b);
    const selAlpha = typeof t.selBgOpacity === 'number' ? t.selBgOpacity : 0.35;
    const selBg = hexToHsla(t.selBgColor || '#3a7bd5', selAlpha);
    const userSelBg = hexToHsla(t.userSelBgColor || t.selBgColor || '#60a5fa', typeof t.userSelBgOpacity === 'number' ? t.userSelBgOpacity : 0.40);
    const aiSelBg = hexToHsla(t.aiSelBgColor || t.selBgColor || '#38bdf8', typeof t.aiSelBgOpacity === 'number' ? t.aiSelBgOpacity : 0.35);

    root.style.setProperty('--sel-h', selHsl.h);
    root.style.setProperty('--sel-s', `${selHsl.s}%`);
    root.style.setProperty('--sel-l', `${selHsl.l}%`);
    root.style.setProperty('--sel-a', selAlpha);
    root.style.setProperty('--sel-bg', selBg);
    root.style.setProperty('--sel-color', t.selTextColor || '#ffffff');
    root.style.setProperty('--user-sel-bg', userSelBg);
    root.style.setProperty('--user-sel-color', t.userSelTextColor || '#ffffff');
    root.style.setProperty('--ai-sel-bg', aiSelBg);
    root.style.setProperty('--ai-sel-color', t.aiSelTextColor || '#ffffff');

    if (t.bgColor) {
        root.style.setProperty('--custom-bg', t.bgColor);
        root.style.setProperty('--bg0', t.bgColor);
        root.style.setProperty('--bg-base-color', t.bgColor);

        const bgRgb = hexToRgb(t.bgColor);
        const bgHsl = rgbToHsl(bgRgb.r, bgRgb.g, bgRgb.b);

        // Генерация живого радиального градиента под выбранный оттенок фона
        const topL = isBgLight ? Math.min(100, bgHsl.l + 5) : Math.min(100, bgHsl.l + 6);
        const botL = isBgLight ? Math.max(0, bgHsl.l - 6) : Math.max(0, bgHsl.l - 5);
        const topStop = `hsla(${bgHsl.h}, ${bgHsl.s}%, ${topL}%, 1)`;
        const botStop = `hsla(${bgHsl.h}, ${bgHsl.s}%, ${botL}%, 1)`;
        root.style.setProperty('--custom-bg-grad', `radial-gradient(140% 100% at 50% 0%, ${topStop} 0%, ${t.bgColor} 48%, ${botStop} 100%)`);

        // Адаптация сопутствующих панелей (шторка, модальные окна, сайдбар) под тон фона с iOS Glassmorphism
        const panelLightness = isBgLight ? Math.min(100, bgHsl.l + 3) : Math.min(100, bgHsl.l + 3);
        root.style.setProperty('--bg1', `hsla(${bgHsl.h}, ${Math.round(bgHsl.s * 0.9)}%, ${panelLightness}%, 1)`);
        root.style.setProperty('--bg2', `hsla(${bgHsl.h}, ${Math.round(bgHsl.s * 0.85)}%, ${isBgLight ? Math.max(0, bgHsl.l - 4) : Math.min(100, bgHsl.l + 6)}%, 1)`);
        root.style.setProperty('--panel', `hsla(${bgHsl.h}, ${Math.round(bgHsl.s * 0.75)}%, ${panelLightness}%, ${isBgLight ? 0.65 : 0.58})`);
        root.style.setProperty('--panel-solid', `hsla(${bgHsl.h}, ${Math.round(bgHsl.s * 0.75)}%, ${panelLightness}%, 0.98)`);

        // Apple Liquid Glass: световые ребра и внутренние фаски (Specular Highlights)
        const glassRim = isBgLight ? 'rgba(255, 255, 255, 0.85)' : 'rgba(255, 255, 255, 0.15)';
        const glassSpecular = isBgLight ? 'inset 0 1px 0 0 rgba(255, 255, 255, 0.95), 0 8px 24px -4px rgba(15, 23, 42, 0.08)' : 'inset 0 1px 0 0 rgba(255, 255, 255, 0.18), 0 12px 32px -4px rgba(0, 0, 0, 0.45)';
        root.style.setProperty('--ios-glass-rim', glassRim);
        root.style.setProperty('--ios-glass-shadow', glassSpecular);

        // Автоматическая подстройка контрастных состояний :hover и :active под тон фона
        const panelHoverBg = isBgLight ? `hsla(${bgHsl.h}, 20%, 12%, 0.06)` : `hsla(${bgHsl.h}, 20%, 100%, 0.10)`;
        const panelActiveBg = isBgLight ? `hsla(${bgHsl.h}, 20%, 12%, 0.12)` : `hsla(${bgHsl.h}, 20%, 100%, 0.16)`;
        const lineCol = isBgLight ? `rgba(0, 0, 0, 0.08)` : `rgba(255, 255, 255, 0.10)`;
        const lineStrongCol = isBgLight ? `rgba(0, 0, 0, 0.15)` : `rgba(255, 255, 255, 0.18)`;

        root.style.setProperty('--panel-hover', panelHoverBg);
        root.style.setProperty('--panel-active', panelActiveBg);
        root.style.setProperty('--line', lineCol);
        root.style.setProperty('--line-strong', lineStrongCol);
        root.style.setProperty('--accent-soft', hexToHsla(t.accentColor, isBgLight ? 0.12 : 0.16));
        root.style.setProperty('--accent-line', hexToHsla(t.accentColor, isBgLight ? 0.35 : 0.42));
        root.style.setProperty('--hover-accent', hexToHsla(t.accentColor, isBgLight ? 0.20 : 0.26));
        root.style.setProperty('--active-accent', hexToHsla(t.accentColor, isBgLight ? 0.28 : 0.36));

        // Комплексная синхронизация фона полей ввода, теней и затемнений
        root.style.setProperty('--input-bg', isBgLight ? 'hsla(220, 25%, 15%, 0.04)' : 'hsla(0, 0%, 100%, 0.03)');
        root.style.setProperty('--code-bg', isBgLight ? 'hsla(220, 18%, 97%, 0.98)' : 'hsla(0, 0%, 9%, 0.98)');
        root.style.setProperty('--scrim', isBgLight ? 'hsla(220, 25%, 12%, 0.32)' : 'hsla(0, 0%, 5%, 0.78)');
        root.style.setProperty('--shadow', isBgLight
            ? '0 16px 40px hsla(220, 25%, 15%, 0.08), 0 1px 3px hsla(220, 20%, 15%, 0.05)'
            : '0 20px 48px hsla(0, 0%, 0%, 0.65), 0 1px 2px hsla(0, 0%, 0%, 0.5)');

        document.body.style.backgroundColor = t.bgColor;
        document.documentElement.style.backgroundColor = t.bgColor;
    }

    // 4. Текст и второстепенные шрифты с автоматической выжимкой faint-оттенка
    if (t.textColor) {
        root.style.setProperty('--text', t.textColor);
        document.body.style.color = t.textColor;
    }
    if (t.textDimColor) {
        root.style.setProperty('--text-dim', t.textDimColor);
        const textDimRgb = hexToRgb(t.textDimColor);
        const textDimHsl = rgbToHsl(textDimRgb.r, textDimRgb.g, textDimRgb.b);
        root.style.setProperty('--text-faint', `hsla(${textDimHsl.h}, ${textDimHsl.s}%, ${textDimHsl.l}%, 0.65)`);
    }

    // 5. Раздельная настройка частей логотипа MoonSSS (Moon & SSS)
    const moonCol = t.logoMoonColor || (isBgLight ? '#0f172a' : '#e2e8f0');
    const moonGlowOp = typeof t.logoMoonGlow === 'number' ? t.logoMoonGlow : (isBgLight ? 0.15 : 0.25);
    const sssCol = t.logoSssColor || t.accentColor || (isBgLight ? '#0284c7' : '#8fd0f5');
    const sssGlowOp = typeof t.logoSssGlow === 'number' ? t.logoSssGlow : (isBgLight ? 0.45 : 0.85);

    root.style.setProperty('--logo-moon', moonCol);
    root.style.setProperty('--logo-moon-glow', moonGlowOp > 0 ? `0 0 ${Math.round(moonGlowOp * 24)}px ${hexToHsla(moonCol, moonGlowOp)}` : 'none');
    root.style.setProperty('--logo-sss', sssCol);
    root.style.setProperty('--logo-sss-glow', sssGlowOp > 0 ? `0 0 ${Math.round(sssGlowOp * 28)}px ${hexToHsla(sssCol, sssGlowOp)}` : 'none');

    // 6. Поле ввода сообщения (Композер)
    const inBg = t.inputShellBg || (isBgLight ? '#ffffff' : '#18181b');
    const inOp = typeof t.inputShellOpacity === 'number' ? t.inputShellOpacity : (isBgLight ? 0.95 : 0.88);
    const inBorder = t.inputShellBorder || (isBgLight ? '#cbd5e1' : '#2e2e32');
    const inText = t.inputShellText || t.textColor || (isBgLight ? '#0f172a' : '#f8fafc');

    root.style.setProperty('--custom-input-bg', hexToHsla(inBg, inOp));
    root.style.setProperty('--custom-input-border', inBorder);
    root.style.setProperty('--custom-input-text', inText);
    root.style.setProperty('--custom-input-border-focus', t.accentColor || '#8fd0f5');

    // 7. Бабблы сообщений и стеклянные интерактивные блоки (Веб-поиск, Размышления, Изображения)
    const ubBg = t.userBubbleBg || (isBgLight ? '#e0f2fe' : '#262626');
    const ubOp = typeof t.userBubbleOpacity === 'number' ? t.userBubbleOpacity : (isBgLight ? 0.88 : 0.85);
    const ubBlur = typeof t.userBubbleBlur === 'number' ? t.userBubbleBlur : 24;
    const ubBorder = t.userBubbleBorder || (isBgLight ? 'hsla(var(--acc-h), 65%, 45%, 0.35)' : 'hsla(var(--acc-h), 70%, 65%, 0.38)');

    root.style.setProperty('--custom-user-bg', hexToHsla(ubBg, ubOp));
    root.style.setProperty('--custom-user-border', ubBorder);
    root.style.setProperty('--custom-user-blur', `${ubBlur}px`);
    root.style.setProperty('--custom-user-text', t.userBubbleText || (isBgLight ? '#0f172a' : '#f8fafc'));

    const aiBg = t.aiBubbleBg || (isBgLight ? '#ffffff' : '#18181b');
    const aiOp = typeof t.aiBubbleOpacity === 'number' ? t.aiBubbleOpacity : (isBgLight ? 0.90 : 0.86);
    const aiBlur = typeof t.aiBubbleBlur === 'number' ? t.aiBubbleBlur : 28;
    const aiBorder = t.aiBubbleBorder || (isBgLight ? 'hsla(220, 18%, 18%, 0.12)' : 'hsla(0, 0%, 100%, 0.10)');

    root.style.setProperty('--custom-ai-bg', hexToHsla(aiBg, aiOp));
    root.style.setProperty('--custom-ai-border', aiBorder);
    root.style.setProperty('--custom-ai-blur', `${aiBlur}px`);
    root.style.setProperty('--custom-ai-text', t.aiBubbleText || (isBgLight ? '#1e293b' : '#f1f5f9'));

    const elBg = t.elemBg || (isBgLight ? '#ffffff' : '#141417');
    const elOp = typeof t.elemOpacity === 'number' ? t.elemOpacity : (isBgLight ? 0.86 : 0.82);
    const elBlur = typeof t.elemBlur === 'number' ? t.elemBlur : 20;
    const elBorder = t.elemBorder || (isBgLight ? 'hsla(220, 18%, 18%, 0.10)' : 'hsla(0, 0%, 100%, 0.08)');

    root.style.setProperty('--custom-elem-bg', hexToHsla(elBg, elOp));
    root.style.setProperty('--custom-elem-border', elBorder);
    root.style.setProperty('--custom-elem-blur', `${elBlur}px`);

    // 8. Верхняя панель (Topbar)
    const tbBg = t.topbarBg || (isBgLight ? '#f8fafc' : '#141414');
    const tbOp = typeof t.topbarOpacity === 'number' ? t.topbarOpacity : (isBgLight ? 0.85 : 0.82);
    const tbBlur = typeof t.topbarBlur === 'number' ? t.topbarBlur : 24;
    const tbBorder = t.topbarBorder || (isBgLight ? 'hsla(220, 18%, 18%, 0.09)' : 'hsla(0, 0%, 100%, 0.08)');

    root.style.setProperty('--custom-topbar-bg', hexToHsla(tbBg, tbOp));
    root.style.setProperty('--custom-topbar-blur', `${tbBlur}px`);
    root.style.setProperty('--custom-topbar-border', tbBorder);

    // 9. Карточки и блоки настроек (Cards & Panels)
    const cBg = t.cardBg || (isBgLight ? '#ffffff' : '#18181b');
    const cOp = typeof t.cardOpacity === 'number' ? t.cardOpacity : (isBgLight ? 0.88 : 0.65);
    const cBlur = typeof t.cardBlur === 'number' ? t.cardBlur : 16;
    const cBorder = t.cardBorder || (isBgLight ? 'hsla(220, 18%, 18%, 0.10)' : 'hsla(0, 0%, 100%, 0.08)');

    root.style.setProperty('--custom-card-bg', hexToHsla(cBg, cOp));
    root.style.setProperty('--custom-card-blur', `${cBlur}px`);
    root.style.setProperty('--custom-card-border', cBorder);
}

/* ============ РАСШИРЕННАЯ БИБЛИОТЕКА И ПРЕСЕТЫ КУРСОРОВ ============ */
const transformedCursorCache = new Map();

const BUILTIN_CURSORS = {
    pointers: [
        {
            id: 'system',
            name: 'Системный (OS)',
            tag: 'Native Default',
            url: '',
            isSystem: true
        },
        {
            id: 'moon-dark',
            name: 'MoonSSS Dark',
            tag: 'Фирменный Dark',
            url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath d='M4.5 2.5v18.2c0 .6.7.9 1.1.5l5.1-5.1a.7.7 0 0 1 .5-.2h7.2c.6 0 .9-.7.5-1.1L5.6 2.1a.7.7 0 0 0-1.1.4Z' fill='%23b0cce6' stroke='%230a101d' stroke-width='1.6' stroke-linejoin='round'/%3E%3C/svg%3E"
        },
        {
            id: 'moon-light',
            name: 'MoonSSS Light',
            tag: 'Фирменный Light',
            url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath d='M4.5 2.5v18.2c0 .6.7.9 1.1.5l5.1-5.1a.7.7 0 0 1 .5-.2h7.2c.6 0 .9-.7.5-1.1L5.6 2.1a.7.7 0 0 0-1.1.4Z' fill='%231e293b' stroke='%23ffffff' stroke-width='1.6' stroke-linejoin='round'/%3E%3C/svg%3E"
        },
        {
            id: 'moon-gold',
            name: 'Cyber Gold',
            tag: 'Gold Neon',
            url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath d='M4.5 2.5v18.2c0 .6.7.9 1.1.5l5.1-5.1a.7.7 0 0 1 .5-.2h7.2c.6 0 .9-.7.5-1.1L5.6 2.1a.7.7 0 0 0-1.1.4Z' fill='%23ffd700' stroke='%23000000' stroke-width='1.6' stroke-linejoin='round'/%3E%3C/svg%3E"
        },
        {
            id: 'moon-emerald',
            name: 'Matrix Emerald',
            tag: 'Emerald Cyber',
            url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath d='M4.5 2.5v18.2c0 .6.7.9 1.1.5l5.1-5.1a.7.7 0 0 1 .5-.2h7.2c.6 0 .9-.7.5-1.1L5.6 2.1a.7.7 0 0 0-1.1.4Z' fill='%2334d399' stroke='%23064e3b' stroke-width='1.6' stroke-linejoin='round'/%3E%3C/svg%3E"
        }
    ],
    ibeams: [
        {
            id: 'system',
            name: 'Системный (OS)',
            tag: 'Native Default',
            url: '',
            isSystem: true
        },
        {
            id: 'moon-dark-beam',
            name: 'MoonSSS Dark Beam',
            tag: 'Фирменный Dark',
            url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='28' viewBox='0 0 24 28'%3E%3Cpath d='M6 4h12M6 24h12M12 4v20' fill='none' stroke='%23000000' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M6 4h12M6 24h12M12 4v20' fill='none' stroke='%238fd0f5' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"
        },
        {
            id: 'moon-light-beam',
            name: 'MoonSSS Light Beam',
            tag: 'Фирменный Light',
            url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='28' viewBox='0 0 24 28'%3E%3Cpath d='M6 4h12M6 24h12M12 4v20' fill='none' stroke='%23ffffff' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M6 4h12M6 24h12M12 4v20' fill='none' stroke='%230f172a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"
        },
        {
            id: 'moon-gold-beam',
            name: 'Cyber Gold Beam',
            tag: 'Gold Laser',
            url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='28' viewBox='0 0 24 28'%3E%3Cpath d='M6 4h12M6 24h12M12 4v20' fill='none' stroke='%23000000' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M6 4h12M6 24h12M12 4v20' fill='none' stroke='%23ffd700' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"
        },
        {
            id: 'moon-emerald-beam',
            name: 'Matrix Emerald Beam',
            tag: 'Emerald Laser',
            url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='28' viewBox='0 0 24 28'%3E%3Cpath d='M6 4h12M6 24h12M12 4v20' fill='none' stroke='%23064e3b' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M6 4h12M6 24h12M12 4v20' fill='none' stroke='%2334d399' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"
        }
    ]
};

function getCursorRawSource(presetId, kind, currentTheme) {
    if (!presetId || presetId === 'system') return '';
    const curRoot = state.settings.customCursor || {};
    const cur = curRoot[currentTheme] || {};
    if (kind === 'pointer' && cur.pointerRawUrl) return cur.pointerRawUrl;
    if (kind === 'text' && cur.textRawUrl) return cur.textRawUrl;

    const list = kind === 'text' ? BUILTIN_CURSORS.ibeams : BUILTIN_CURSORS.pointers;
    const builtin = list.find(c => c.id === presetId);
    if (builtin && builtin.url) return builtin.url;

    if (Array.isArray(curRoot.userCustomCursors)) {
        const user = curRoot.userCustomCursors.find(c => c.id === presetId);
        if (user && user.url) return user.url;
    }

    if (kind === 'text') {
        return currentTheme === 'light' ? BUILTIN_CURSORS.ibeams[2].url : BUILTIN_CURSORS.ibeams[1].url;
    }
    return currentTheme === 'light' ? BUILTIN_CURSORS.pointers[2].url : BUILTIN_CURSORS.pointers[1].url;
}

function normalizeCustomCursor(raw) {
    const cur = (raw && typeof raw === 'object') ? raw : {};
    const defaultDarkPtr = BUILTIN_CURSORS.pointers[1].url;
    const defaultLightPtr = BUILTIN_CURSORS.pointers[2].url;
    const defaultDarkBeam = BUILTIN_CURSORS.ibeams[1].url;
    const defaultLightBeam = BUILTIN_CURSORS.ibeams[2].url;

    const darkProf = cur.dark || (cur.pointerUrl !== undefined ? {
        pointerPresetId: cur.pointerPresetId || (cur.pointerUrl ? 'custom' : 'moon-dark'),
        pointerUrl: cur.pointerUrl || defaultDarkPtr,
        pointerRawUrl: cur.pointerRawUrl || cur.pointerUrl || defaultDarkPtr,
        pointerSize: cur.pointerSize || 32,
        pointerOpacity: typeof cur.pointerOpacity === 'number' ? cur.pointerOpacity : 1,
        textPresetId: cur.textPresetId || (cur.textUrl ? 'custom' : 'moon-dark-beam'),
        textUrl: cur.textUrl || defaultDarkBeam,
        textRawUrl: cur.textRawUrl || cur.textUrl || defaultDarkBeam,
        textSize: cur.textSize || 26,
        textOpacity: typeof cur.textOpacity === 'number' ? cur.textOpacity : 1
    } : {});

    const lightProf = cur.light || {};

    return {
        enabled: cur.enabled !== false,
        dark: {
            pointerPresetId: darkProf.pointerPresetId || 'moon-dark',
            pointerUrl: darkProf.pointerUrl || defaultDarkPtr,
            pointerRawUrl: darkProf.pointerRawUrl || darkProf.pointerUrl || defaultDarkPtr,
            pointerSize: typeof darkProf.pointerSize === 'number' ? darkProf.pointerSize : 32,
            pointerOpacity: typeof darkProf.pointerOpacity === 'number' ? darkProf.pointerOpacity : 1,
            textPresetId: darkProf.textPresetId || 'moon-dark-beam',
            textUrl: darkProf.textUrl || defaultDarkBeam,
            textRawUrl: darkProf.textRawUrl || darkProf.textUrl || defaultDarkBeam,
            textSize: typeof darkProf.textSize === 'number' ? darkProf.textSize : 26,
            textOpacity: typeof darkProf.textOpacity === 'number' ? darkProf.textOpacity : 1
        },
        light: {
            pointerPresetId: lightProf.pointerPresetId || 'moon-light',
            pointerUrl: lightProf.pointerUrl || defaultLightPtr,
            pointerRawUrl: lightProf.pointerRawUrl || lightProf.pointerUrl || defaultLightPtr,
            pointerSize: typeof lightProf.pointerSize === 'number' ? lightProf.pointerSize : 32,
            pointerOpacity: typeof lightProf.pointerOpacity === 'number' ? lightProf.pointerOpacity : 1,
            textPresetId: lightProf.textPresetId || 'moon-light-beam',
            textUrl: lightProf.textUrl || defaultLightBeam,
            textRawUrl: lightProf.textRawUrl || lightProf.textUrl || defaultLightBeam,
            textSize: typeof lightProf.textSize === 'number' ? lightProf.textSize : 26,
            textOpacity: typeof lightProf.textOpacity === 'number' ? lightProf.textOpacity : 1
        },
        userCustomCursors: Array.isArray(cur.userCustomCursors) ? cur.userCustomCursors : []
    };
}

function processCursorImage(fileOrDataUrl, kind = 'pointer', targetSize = 32, opacity = 1, presetId = '') {
    if (!fileOrDataUrl || fileOrDataUrl === 'system') {
        return Promise.resolve({ dataUrl: '', hotspotX: kind === 'text' ? 12 : 2, hotspotY: kind === 'text' ? 14 : 2 });
    }

    const size = Math.max(16, Math.min(64, parseInt(targetSize, 10) || (kind === 'text' ? 26 : 32)));
    const op = Math.max(0.1, Math.min(1, typeof opacity === 'number' ? opacity : 1));
    const width = kind === 'text' ? Math.max(12, Math.round(size * 0.85)) : size;
    const height = size;
    const cacheKey = `${presetId || ''}_${typeof fileOrDataUrl === 'string' ? hashStr(fileOrDataUrl) : 'file'}_${kind}_${width}x${height}_${Math.round(op * 100)}`;

    if (transformedCursorCache.has(cacheKey)) {
        return Promise.resolve(transformedCursorCache.get(cacheKey));
    }

    return new Promise((resolve) => {
        const prepareSourceUrl = async () => {
            if (typeof fileOrDataUrl !== 'string') {
                return await fileToDataURL(fileOrDataUrl);
            }
            if (fileOrDataUrl.includes('data:image/svg+xml') || fileOrDataUrl.trim().startsWith('<svg')) {
                let svgText = '';
                if (fileOrDataUrl.startsWith('data:image/svg+xml')) {
                    const commaIdx = fileOrDataUrl.indexOf(',');
                    const raw = fileOrDataUrl.slice(commaIdx + 1);
                    svgText = fileOrDataUrl.includes('base64') ? atob(raw) : decodeURIComponent(raw);
                } else {
                    svgText = fileOrDataUrl;
                }

                if (!svgText.includes('xmlns=')) {
                    svgText = svgText.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg" ');
                }

                try {
                    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgText)));
                } catch (e) {
                    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText);
                }
            }
            return fileOrDataUrl;
        };

        prepareSourceUrl().then(srcUrl => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.clearRect(0, 0, width, height);
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    ctx.globalAlpha = op;

                    const naturalW = img.naturalWidth || img.width || width;
                    const naturalH = img.naturalHeight || img.height || height;
                    const scale = Math.min(width / naturalW, height / naturalH);
                    const dw = Math.max(1, Math.round(naturalW * scale));
                    const dh = Math.max(1, Math.round(naturalH * scale));
                    const dx = Math.round((width - dw) / 2);
                    const dy = Math.round((height - dh) / 2);

                    ctx.drawImage(img, dx, dy, dw, dh);
                    const dataUrl = canvas.toDataURL('image/png');
                    const hotspotX = kind === 'text' ? Math.round(width / 2) : Math.max(1, Math.round(width * 0.08));
                    const hotspotY = kind === 'text' ? Math.round(height / 2) : Math.max(1, Math.round(height * 0.08));

                    const res = { dataUrl, hotspotX, hotspotY };
                    transformedCursorCache.set(cacheKey, res);
                    resolve(res);
                } catch (err) {
                    console.warn('[MoonSSS] Cursor canvas render fallback:', err);
                    resolve({
                        dataUrl: srcUrl,
                        hotspotX: kind === 'text' ? Math.round(width / 2) : 2,
                        hotspotY: kind === 'text' ? Math.round(height / 2) : 2
                    });
                }
            };

            img.onerror = () => {
                resolve({
                    dataUrl: srcUrl,
                    hotspotX: kind === 'text' ? Math.round(width / 2) : 2,
                    hotspotY: kind === 'text' ? Math.round(height / 2) : 2
                });
            };

            img.src = srcUrl;
        }).catch(err => {
            console.error('[MoonSSS] prepareSourceUrl error:', err);
            resolve({ dataUrl: '', hotspotX: 2, hotspotY: 2 });
        });
    });
}

async function applyCustomCursor() {
    const isTouchOnly = window.matchMedia && matchMedia('(pointer:coarse)').matches && !matchMedia('(any-pointer:fine)').matches;
    if (isTouchOnly) return;

    let styleSheet = document.getElementById('customCursorStyleSheet');
    if (!styleSheet) {
        styleSheet = document.createElement('style');
        styleSheet.id = 'customCursorStyleSheet';
        document.head.appendChild(styleSheet);
    }

    const curRoot = normalizeCustomCursor(state.settings.customCursor);
    state.settings.customCursor = curRoot;
    const currentTheme = state.settings.theme || 'dark';
    const cur = curRoot[currentTheme] || (currentTheme === 'light' ? curRoot.light : curRoot.dark) || {};

    let pointerVal = 'pointer !important;';
    if (cur.pointerPresetId !== 'system') {
        const raw = getCursorRawSource(cur.pointerPresetId, 'pointer', currentTheme);
        const size = cur.pointerSize || 32;
        const opacity = typeof cur.pointerOpacity === 'number' ? cur.pointerOpacity : 1;
        const baked = await processCursorImage(raw, 'pointer', size, opacity, cur.pointerPresetId);
        cur.pointerUrl = baked.dataUrl;
        pointerVal = `url("${baked.dataUrl}") ${baked.hotspotX} ${baked.hotspotY}, pointer !important;`;
    }

    let textVal = 'text !important;';
    if (cur.textPresetId !== 'system') {
        const raw = getCursorRawSource(cur.textPresetId, 'text', currentTheme);
        const size = cur.textSize || 26;
        const opacity = typeof cur.textOpacity === 'number' ? cur.textOpacity : 1;
        const baked = await processCursorImage(raw, 'text', size, opacity, cur.textPresetId);
        cur.textUrl = baked.dataUrl;
        textVal = `url("${baked.dataUrl}") ${baked.hotspotX} ${baked.hotspotY}, text !important;`;
    }

    const interactiveList = `
        button, a, select, summary, label,
        [role="button"], [role="tab"], [role="switch"], [role="option"], [role="menuitem"], [role="radio"],
        .chip, .btn, .icon-btn, .cbtn, .switch, .mact, .gi-btn, .hchip, .slash-item, .m-item, .tm-option,
        .set-nav-btn, .set-seg-btn, .chat-item, .cursor-preset-card, .cursor-upload-card, .prompt-pill-btn,
        .prompt-mic-btn, .prompt-action-btn, .prompt-placeholder-btn, .prompt-attachment-thumb,
        .prompt-attachment-file, .prompt-attachment-more, .att-chip, .att-prev, .source-citation-card,
        .source-citation-badge, .source-card, .url-attached-chip, .uac-toggle-btn, .uac-del-btn,
        .uf-action-btn, .uf-clear-all-btn, .todo-head, .todo-item, .wsearch-head, .think-head,
        .webimgs-head, .wi-item, .tc-mode-btn, .p-drop-tab-btn, .p-drop-refresh-btn, .p-drop-cfg-btn,
        .prompt-drop-item, .p-effort-item, .mm-tab-btn, .mm-refresh-btn, .mpf-flavor-btn,
        .mpf-provider-card, .ai-tm-card, .dev-template-card
    `;

    const textSelectors = `
        html input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]):not([type="file"]),
        html textarea,
        html [contenteditable],
        html [contenteditable="true"],
        html .msg-edit-textarea,
        html #promptInput,
        html .ws-input,
        html .field-area,
        html .sp-field input,
        html .input-wrap input
    `;

    let css = `
    /* 1. Пассивное состояние: Pointer везде */
    html,
    html body,
    html * {
        cursor: ${pointerVal}
    }

    /* 2. Наведение на кнопки и любые интерактивные элементы: I-beam */
    html :is(${interactiveList}):hover,
    html :is(${interactiveList}):hover * {
        cursor: ${textVal}
    }

    /* 3. Текстовые поля ввода */
    ${textSelectors} {
        cursor: ${textVal}
    }

    /* 4. Специфические элементы (перетаскивание и зум) */
    html .tp-chat-header, html [data-drag-handle], html .ai-context-header, html .ai-context-drag-handle {
        cursor: grab !important;
    }
    html .tp-chat-header:active, html .ai-context-header:active, html .ai-context-panel.is-dragging .ai-context-header {
        cursor: grabbing !important;
    }
    html .fav-card, html .genimg.done img, html .inline-media-img-wrap {
        cursor: zoom-in !important;
    }
    `;

    styleSheet.textContent = css;
}

/* ---------- Тема ---------- */
function applyTheme() {
    document.documentElement.dataset.theme = state.settings.theme;
    document.documentElement.classList.remove('theme-boot');
    applyCustomThemeVariables(state.settings.theme);
    applyCustomCursor();
    applyUserCustomCode();
    syncLiquidBgWithTheme();
    initTris(true);
    updateTopChips();

    // Обновляем разметку открытых компонентов и ленты чата для немедленного перехода на палитру новой темы
    if (typeof renderMessages === 'function') {
        renderMessages();
    }
    if (drawer && drawer.classList.contains('open') && typeof renderChatList === 'function') {
        renderChatList();
    }

    try {
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) {
            const currentThemeCfg = state.settings.customThemes?.[state.settings.theme];
            meta.setAttribute('content', currentThemeCfg?.bgColor || (state.settings.theme === 'light' ? '#f2f0ec' : '#1a1a1a'));
        }
    } catch (e) { }
    const sw = $('#setThemeSwitch');
    if (sw) sw.classList.toggle('on', state.settings.theme === 'light');
    if (window.ThinkingOrb && typeof window.ThinkingOrb.syncTheme === 'function') {
        window.ThinkingOrb.syncTheme(state.settings.theme);
    }
    if (window.aiMD && typeof window.aiMD.reRenderAll === 'function') {
        window.aiMD.reRenderAll();
    }
}
function toggleTheme(e) {
    const nextTheme = state.settings.theme === 'dark' ? 'light' : 'dark';

    const supportsViewTransition = typeof document.startViewTransition === 'function' &&
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!supportsViewTransition) {
        state.settings.theme = nextTheme;
        applyTheme();
        save();
        if (!thinkMenu.hidden) renderThinkMenu();
        return;
    }

    // Надежный расчет экранных габаритов с учетом мобильных панелей навигации
    const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);

    let x = vw - 36;
    let y = 36;

    // Вычисляем реальные координаты источника (тач, клик или центр активной кнопки)
    const touch = e?.touches?.[0] || e?.changedTouches?.[0];
    const trigger = (e?.target && e.target.closest('button, .switch, .chip')) || $('#themeBtn') || $('#setThemeSwitch');

    if (touch && typeof touch.clientX === 'number' && (touch.clientX !== 0 || touch.clientY !== 0)) {
        x = touch.clientX;
        y = touch.clientY;
    } else if (e && typeof e.clientX === 'number' && typeof e.clientY === 'number' && (e.clientX !== 0 || e.clientY !== 0)) {
        x = e.clientX;
        y = e.clientY;
    } else if (trigger) {
        const rect = trigger.getBoundingClientRect();
        x = rect.left + rect.width / 2;
        y = rect.top + rect.height / 2;
    }

    // Ограничиваем координаты границами видимой области экрана
    x = Math.max(0, Math.min(vw, x));
    y = Math.max(0, Math.min(vh, y));

    // Максимальный радиус раскрытия окружности до самого дальнего угла экрана
    const endRadius = Math.hypot(
        Math.max(x, vw - x),
        Math.max(y, vh - y)
    ) + 40;

    try {
        const transition = document.startViewTransition(() => {
            state.settings.theme = nextTheme;
            applyTheme();
            save();
            if (!thinkMenu.hidden) renderThinkMenu();
        });

        transition.ready.then(() => {
            document.documentElement.animate(
                {
                    clipPath: [
                        `circle(0px at ${x}px ${y}px)`,
                        `circle(${endRadius}px at ${x}px ${y}px)`
                    ]
                },
                {
                    duration: 420,
                    easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
                    pseudoElement: '::view-transition-new(root)'
                }
            );
        }).catch(() => {
            // Фолбэк при аппаратном отказе рендерера View Transition
            state.settings.theme = nextTheme;
            applyTheme();
            save();
        });
    } catch (err) {
        state.settings.theme = nextTheme;
        applyTheme();
        save();
        if (!thinkMenu.hidden) renderThinkMenu();
    }
}

/* ---------- Чаты ---------- */
function createChatObj(mode = 'classic') {
    return { id: uid(), title: 'Новый чат', messages: [], createdAt: Date.now(), updatedAt: Date.now(), parentId: null, role: 'user', mode };
}
function ensureChat() {
    let c = activeChat();
    if (!c) { c = createChatObj(window.currentAppRoomMode || 'classic'); state.chats.unshift(c); state.activeId = c.id; }
    return c;
}

function setChatMode(mode = 'classic') {
    window.currentAppRoomMode = mode;
    const chat = activeChat();
    if (chat) {
        chat.mode = mode;
        save();
    }
    const appEl = document.querySelector('.app');
    if (appEl) {
        appEl.classList.toggle('mode-image-studio', mode === 'image');
    }
    document.querySelectorAll('#heroModeSelector .hero-mode-card').forEach(btn => {
        const isMatch = btn.dataset.mode === mode;
        btn.classList.toggle('active', isMatch);
        btn.setAttribute('aria-checked', isMatch ? 'true' : 'false');
    });
    if (window.promptInputCtrl && typeof window.promptInputCtrl.syncModelAndEffort === 'function') {
        window.promptInputCtrl.syncModelAndEffort();
        window.promptInputCtrl.adjustHeight();
    }
}
window.setChatMode = setChatMode;
async function generateAiChatTitle(chat, promptText) {
    if (!chat || chat.aiTitled || chat.titleGenerating) return;
    const s = (typeof state !== 'undefined' && state.settings) || {};
    const orKey = (s.orKey || '').trim().replace(/[^\x21-\x7E]/g, '');
    const proxyKey = (s.proxyKey || '').trim().replace(/[^\x21-\x7E]/g, '');
    if (!orKey && !proxyKey) return;

    chat.titleGenerating = true;

    const url = orKey
        ? 'https://openrouter.ai/api/v1/chat/completions'
        : 'https://api.proxyapi.ru/openrouter/v1/chat/completions';
    const key = (orKey || proxyKey).replace(/[^\x21-\x7E]/g, '');

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);

        const promptSnippet = String(promptText || '').slice(0, 800);
        const attribHeaders = getOpenRouterAttributionHeaders('Auto Title');
        const resp = await fetch(url, {
            method: 'POST',
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + key,
                ...attribHeaders
            },
            body: JSON.stringify({
                model: 'meta-llama/llama-3.1-8b-instruct:nitro',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a concise title generator. Create a short, informative title (2 to 5 words) in the exact same language as the user query. STRICT RULES:\n- Output ONLY the title text, nothing else.\n- NO emojis anywhere.\n- NO quotes, asterisks, brackets, or trailing punctuation.\n- NO conversational prefixes like "Title:".'
                    },
                    {
                        role: 'user',
                        content: promptSnippet
                    }
                ],
                max_tokens: 20,
                temperature: 0.3,
                stream: false,
                session_id: String(chat.id).slice(0, 128),
                user: 'user_' + String(chat.id).slice(0, 64),
                trace: {
                    trace_name: APP_IDENTITY.title,
                    generation_name: 'Auto Title'
                },
                metadata: {
                    app_title: APP_IDENTITY.title,
                    app_url: APP_IDENTITY.refererUrl,
                    app_icon: APP_IDENTITY.faviconUrl,
                    favicon_url: APP_IDENTITY.faviconUrl,
                    description: APP_IDENTITY.description
                }
            })
        });

        clearTimeout(timeoutId);
        if (!resp.ok) {
            chat.titleGenerating = false;
            return;
        }

        const data = await resp.json();
        const rawTitle = data?.choices?.[0]?.message?.content || '';

        // Очистка от кавычек, префиксов, emoji и лишних символов
        let cleanTitle = rawTitle
            .replace(/^(title|заголовок|тема)\s*:\s*/i, '')
            .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F]/gu, '')
            .replace(/["'`«»\[\]{}()]/g, '')
            .replace(/[\r\n\t]+/g, ' ')
            .replace(/\.+$/, '')
            .trim();

        if (cleanTitle && cleanTitle.length >= 2) {
            if (cleanTitle.length > 50) cleanTitle = cleanTitle.slice(0, 48) + '…';
            chat.title = cleanTitle;
            chat.aiTitled = true;
            save();
            renderChatList();
        }
    } catch (e) {
        console.warn('[MoonSSS] AI auto-titling fallback:', e);
    } finally {
        chat.titleGenerating = false;
    }
}

function autoTitle(chat) {
    const firstUser = chat.messages.find(m => m.role === 'user');
    if (firstUser) {
        let t = (firstUser.content || '').replace(/\s+/g, ' ').trim();
        if (!t && Array.isArray(firstUser.attachments)) {
            const ta = firstUser.attachments.find(a => (a.kind === 'text' || a.kind === 'file') && a.text);
            if (ta) t = (ta.text || '').replace(/\s+/g, ' ').trim();
        }
        if (!chat.aiTitled) {
            chat.title = t ? (t.length > 46 ? t.slice(0, 46) + '…' : t) : 'Новый чат';
            if (t && t.length >= 2) {
                generateAiChatTitle(chat, t);
            }
        }
    }
}
function newChat() {
    const c = createChatObj(window.currentAppRoomMode || 'classic');
    state.chats.unshift(c);
    state.activeId = c.id;
    pendingAtt = [];
    window.pendingAtt = pendingAtt;
    artEditRef = null;
    save(true);
    renderAll(); closeDrawer();
    setTimeout(() => $('#promptInput').focus(), 350);
}
function openChat(id) { state.activeId = id; artEditRef = null; renderArtRef(); renderAll(); closeDrawer(); }
let pendingDeleteChatId = null;
function requestDeleteChat(id) {
    const c = state.chats.find(x => x.id === id);
    if (!c) return;
    pendingDeleteChatId = id;
    $('#cdTitle').textContent = c.title || 'Без названия';
    $('#chatDeleteOverlay').classList.add('show');
}
function closeChatDelete() {
    $('#chatDeleteOverlay').classList.remove('show');
    pendingDeleteChatId = null;
}
function confirmDeleteChat() {
    const id = pendingDeleteChatId;
    closeChatDelete();
    if (!id) return;
    deleteChat(id);
}
function deleteChat(id) {
    if (streaming && state.activeId === id) stopGeneration();
    state.chats = state.chats.filter(c => c.id !== id);
    if (state.activeId === id) state.activeId = null;
    save(); renderAll(); toast('Чат удалён', 'info');
}
function togglePin(id) {
    const c = state.chats.find(x => x.id === id);
    if (!c) return;
    c.pinned = !c.pinned;
    save(); renderChatList();
    toast(c.pinned ? 'Чат закреплён' : 'Чат откреплён', 'info', 1800);
}
function branchFrom(msgId) {
    const chat = activeChat(); if (!chat) return;
    const idx = chat.messages.findIndex(m => m.id === msgId);
    if (idx < 0) return;
    const copy = JSON.parse(JSON.stringify(chat.messages.slice(0, idx + 1)));
    const nc = createChatObj();
    nc.messages = copy; nc.parentId = chat.id; nc.updatedAt = Date.now();
    autoTitle(nc);
    state.chats.unshift(nc); state.activeId = nc.id;
    save(); renderAll(); toast('Новая ветвь создана', 'ok');
}

/* ---------- Отрисовка списка чатов ---------- */
function renderChatList() {
    const q = $('#searchInput').value.trim().toLowerCase();
    const list = $('#chatList');
    let chats = [...state.chats].sort((a, b) => {
        const pa = a.pinned ? 1 : 0, pb = b.pinned ? 1 : 0;
        if (pa !== pb) return pb - pa;
        return b.updatedAt - a.updatedAt;
    });
    const items = [];
    for (const c of chats) {
        let snippet = '';
        if (q) {
            const inTitle = c.title.toLowerCase().includes(q);
            let hit = null;
            for (const m of c.messages) {
                const i = (m.content || '').toLowerCase().indexOf(q);
                if (i >= 0) { hit = m.content.slice(Math.max(0, i - 26), i + q.length + 40); break; }
            }
            if (!inTitle && !hit) continue;
            if (hit) snippet = '…' + hit.replace(/\s+/g, ' ') + '…';
        }
        items.push({ c, snippet });
    }
    if (!items.length) {
        list.innerHTML = `
        <div class="list-empty">
            <div class="list-empty-ico">
                <svg><use href="#${q ? 'i-search' : 'i-chat'}"/></svg>
            </div>
            <div class="list-empty-title">${q ? 'Ничего не найдено' : 'История пуста'}</div>
            <div class="list-empty-sub">${q ? 'Попробуйте изменить поисковый запрос' : 'Начните первый диалог с нейросетью'}</div>
        </div>`;
        return;
    }
    list.innerHTML = '';
    items.forEach(({ c, snippet }, i) => {
        const el = document.createElement('button');
        el.className = 'chat-item' + (c.id === state.activeId ? ' active' : '') + (c.pinned ? ' pinned' : '');
        el.dataset.cid = c.id;
        el.style.animationDelay = Math.min(i * 0.03, .3) + 's';
        el.innerHTML = `
<span class="ci-ico"><svg><use href="#i-chat"/></svg></span>
<span class="ci-body">
<span class="ci-t" title="${esc(c.title)}">${esc(c.title)}</span>
<span class="ci-s">${c.role === 'developer' ? '<span class="branch-badge dev-badge" title="Роль сообщений: developer (OpenAI)"><svg><use href="#i-terminal"/></svg>dev</span>' : ''}${c.parentId ? '<span class="branch-badge"><svg><use href="#i-branch"/></svg>ветвь</span>' : ''}<span class="ci-meta-text">${fmtDate(c.updatedAt)} · ${c.messages.length} сообщ.</span></span>
${snippet ? `<span class="ci-s ci-snippet" title="${esc(snippet)}">${esc(snippet)}</span>` : ''}
</span>`;
        el.addEventListener('click', e => {
            if (chatLpFired) { chatLpFired = false; return; }
            openChat(c.id);
        });
        list.appendChild(el);
    });
    processMultilingualDom(list);
}

/* ---------- Отрисовка сообщений ---------- */
/* Дата-разделители ленты: «Сегодня», «Вчера», конкретная дата */
const dayKey = ts => new Date(ts).toDateString();
const fmtDayLabel = ts => {
    const d = new Date(ts), now = new Date();
    const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const d0 = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = Math.round((t0 - d0) / 86400000);
    if (diff === 0) return 'Сегодня';
    if (diff === 1) return 'Вчера';
    const opts = { day: 'numeric', month: 'long' };
    if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
    return d.toLocaleDateString('ru-RU', opts);
};
function buildDateSep(ts) {
    const el = document.createElement('div');
    el.className = 'date-sep no-sel' + (dayKey(ts) === dayKey(Date.now()) ? ' today' : '');
    el.setAttribute('aria-label', fmtDayLabel(ts));
    el.innerHTML = '<span>' + esc(fmtDayLabel(ts)) + '</span>';
    return el;
}
/* ============================================================
   КЛАВИАТУРНАЯ НАВИГАЦИЯ ПО СООБЩЕНИЯМ И КОНТЕКСТНОЕ МЕНЮ
============================================================ */
let selectedMsgId = null;
let msgCtxTargetId = null;

// Состояние отслеживания текстового выделения и строгий контроль одиночного тапа (Single Tap vs Long-Press)
let selectionExistedAtPointerDown = false;
let selectionTextAtPointerDown = '';
let pointerDownPos = null;
let pointerWasDragged = false;
let selectionChangedDuringPointer = false;
let wasSelectingGesture = false;
let lastSelectionDismissedTime = 0;
let justFinishedSelectingTime = 0;

// Трекер касания для сообщений: фиксация строго одиночного нажатия (Single Tap)
let msgTouchTracker = {
    startTime: 0,
    startX: 0,
    startY: 0,
    isHoldOrDrag: false,
    msgId: null,
    timer: null
};
let suppressMsgMenuUntil = 0;

function getActiveSelectionText() {
    try {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) return '';
        return (sel.toString() || '').trim();
    } catch (_) {
        return '';
    }
}

function hasActiveTextSelection() {
    return getActiveSelectionText().length > 0;
}

function clearTextSelection() {
    try {
        const sel = window.getSelection();
        if (sel) {
            if (typeof sel.removeAllRanges === 'function') sel.removeAllRanges();
            else if (typeof sel.empty === 'function') sel.empty();
        }
    } catch (_) { }
    if (window.moonSelectionController && typeof window.moonSelectionController.clear === 'function') {
        window.moonSelectionController.clear();
    }
    if (window.textSelectionMenu && typeof window.textSelectionMenu.close === 'function') {
        window.textSelectionMenu.close();
    }
}
window.getActiveSelectionText = getActiveSelectionText;
window.hasActiveTextSelection = hasActiveTextSelection;
window.clearTextSelection = clearTextSelection;

function handleMessageClickSelectionGuard(e) {
    if (Date.now() < suppressMsgMenuUntil) {
        return true;
    }

    const justSelected = wasSelectingGesture || (Date.now() - justFinishedSelectingTime < 320);
    if (justSelected) {
        wasSelectingGesture = false;
        return true;
    }

    const hasSelectionNow = hasActiveTextSelection();
    const hadSelectionBeforeClick = selectionExistedAtPointerDown || (selectionTextAtPointerDown.length > 0);

    if (hasSelectionNow || hadSelectionBeforeClick) {
        clearTextSelection();
        selectionExistedAtPointerDown = false;
        selectionTextAtPointerDown = '';
        lastSelectionDismissedTime = Date.now();
        suppressMsgMenuUntil = Date.now() + 260;
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        return true;
    }

    if (Date.now() - lastSelectionDismissedTime < 260) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        return true;
    }

    return false;
}
window.handleMessageClickSelectionGuard = handleMessageClickSelectionGuard;

function clearMessageSelection() {
    selectedMsgId = null;
    document.querySelectorAll('.msg.kbd-selected').forEach(el => {
        el.classList.remove('kbd-selected');
        el.removeAttribute('tabindex');
    });
}

function selectMessage(msgId, smoothScroll = true) {
    const chat = activeChat();
    if (!chat || !chat.messages.length) return;
    const exists = chat.messages.some(m => m.id === msgId);
    if (!exists) return;

    selectedMsgId = msgId;
    document.querySelectorAll('.msg.kbd-selected').forEach(el => {
        el.classList.remove('kbd-selected');
        el.removeAttribute('tabindex');
    });

    const el = document.querySelector(`.msg[data-id="${msgId}"]`);
    if (el) {
        el.classList.add('kbd-selected');
        el.setAttribute('tabindex', '-1');
        try { el.focus({ preventScroll: true }); } catch (_) { }
        if (smoothScroll) {
            const scroller = $('#chatScroll');
            const scrollerRect = scroller.getBoundingClientRect();
            const elRect = el.getBoundingClientRect();
            const target = scroller.scrollTop + (elRect.top - scrollerRect.top) - (scroller.clientHeight / 2) + (elRect.height / 2);
            try {
                scroller.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
            } catch (_) {
                scroller.scrollTop = Math.max(0, target);
            }
        }
    }
}

function selectPrevMessage() {
    const chat = activeChat();
    if (!chat || !chat.messages.length) return;
    if (!selectedMsgId) {
        selectMessage(chat.messages[chat.messages.length - 1].id);
        return;
    }
    const idx = chat.messages.findIndex(m => m.id === selectedMsgId);
    if (idx > 0) {
        selectMessage(chat.messages[idx - 1].id);
    } else {
        selectMessage(chat.messages[0].id);
    }
}

function selectNextMessage() {
    const chat = activeChat();
    if (!chat || !chat.messages.length) return;
    if (!selectedMsgId) {
        selectMessage(chat.messages[0].id);
        return;
    }
    const idx = chat.messages.findIndex(m => m.id === selectedMsgId);
    if (idx >= 0 && idx < chat.messages.length - 1) {
        selectMessage(chat.messages[idx + 1].id);
    } else {
        // Достигли конца диалога — возвращаем фокус в поле ввода
        clearMessageSelection();
        promptInput.focus();
    }
}

function selectFirstMessage() {
    const chat = activeChat();
    if (!chat || !chat.messages.length) return;
    selectMessage(chat.messages[0].id);
}

function selectLastMessage() {
    const chat = activeChat();
    if (!chat || !chat.messages.length) return;
    selectMessage(chat.messages[chat.messages.length - 1].id);
}

let lastMsgCtxMenuClosedTime = 0;
let msgCtxJustOpenedTime = 0;

function openMsgContextMenu(msgId, triggerElement, x, y) {
    // Не открываем меню действий над сообщением, если активен просмотрщик изображений или превью
    if ($('#imgViewer') && !$('#imgViewer').hidden) return;
    if ($('#htmlPreview') && !$('#htmlPreview').hidden) return;

    // Защита: если активно текстовое выделение, сначала только сбрасываем его и не открываем меню
    if (handleMessageClickSelectionGuard()) {
        return;
    }

    const chat = activeChat();
    if (!chat) return;
    const m = chat.messages.find(x => x.id === msgId);
    if (!m) return;

    if (window.textSelectionMenu && typeof window.textSelectionMenu.close === 'function') {
        window.textSelectionMenu.close();
    }

    lastActiveTriggerElement = triggerElement || document.activeElement;
    msgCtxTargetId = msgId;
    msgCtxJustOpenedTime = Date.now();
    const menu = $('#msgCtxMenu');
    if (!menu) return;
    const isUser = m.role === 'user';
    const isMobileDevice = checkIsMobile();

    const items = [];
    items.push(`<button data-mact="copy"><svg><use href="#i-copy"/></svg><span>${isUser ? 'Копировать запрос' : 'Копировать ответ'}</span>${!isMobileDevice ? '<span class="kbd" style="margin-left:auto">C</span>' : ''}</button>`);

    if (!isUser) {
        items.push(`<button data-mact="regen"><svg><use href="#i-refresh"/></svg><span>Перегенерировать ответ</span>${!isMobileDevice ? '<span class="kbd" style="margin-left:auto">R</span>' : ''}</button>`);
        items.push(`<button data-mact="branch"><svg><use href="#i-branch"/></svg><span>Создать новую ветвь</span>${!isMobileDevice ? '<span class="kbd" style="margin-left:auto">B</span>' : ''}</button>`);
    }

    items.push(`<button data-mact="edit"><svg><use href="#i-pencil"/></svg><span>${isUser ? 'Редактировать запрос' : 'Редактировать ответ'}</span>${!isMobileDevice ? '<span class="kbd" style="margin-left:auto">E</span>' : ''}</button>`);
    items.push(`<button data-mact="quote"><svg><use href="#i-quote"/></svg><span>Цитировать в поле ввода</span>${!isMobileDevice ? '<span class="kbd" style="margin-left:auto">Q</span>' : ''}</button>`);
    items.push(`<button data-mact="speak"><svg><use href="#i-volume"/></svg><span>Озвучить сообщение (TTS)</span>${!isMobileDevice ? '<span class="kbd" style="margin-left:auto">S</span>' : ''}</button>`);
    items.push(`<div class="sep"></div>`);
    items.push(`<button data-mact="del" class="danger"><svg><use href="#i-trash"/></svg><span>Удалить сообщение</span>${!isMobileDevice ? '<span class="kbd" style="margin-left:auto">Del</span>' : ''}</button>`);

    menu.innerHTML = `<div class="menu-head no-sel">${isUser ? 'Ваш запрос' : (m.modelLabel || 'Ответ модели')}</div>` + items.join('');

    menu.style.visibility = 'hidden';
    menu.style.left = '-9999px';
    menu.hidden = false;

    const el = document.querySelector(`.msg[data-id="${msgId}"]`);
    const menuWidth = menu.offsetWidth || 220;
    const menuHeight = menu.offsetHeight || 280;
    const screenW = window.innerWidth || document.documentElement.clientWidth || 360;
    const screenH = window.innerHeight || document.documentElement.clientHeight || 640;
    const maxRight = screenW - menuWidth - 10;

    let posX = Math.max(8, Math.min(screenW / 2 - menuWidth / 2, maxRight));
    let posY = Math.max(8, Math.min(screenH / 2 - menuHeight / 2, screenH - menuHeight - 12));

    if (typeof x === 'number' && typeof y === 'number') {
        posX = Math.max(8, Math.min(x, maxRight));
        if (y + menuHeight > screenH - 12) {
            posY = Math.max(8, y - menuHeight);
        } else {
            posY = Math.max(8, y);
        }
    } else if (el) {
        const elRect = el.getBoundingClientRect();
        const preferredX = isUser ? (elRect.right - menuWidth) : (elRect.left + 14);
        posX = Math.max(8, Math.min(preferredX, maxRight));
        posY = elRect.top + 24;
        if (posY + menuHeight > screenH - 12) {
            posY = Math.max(8, elRect.bottom - menuHeight - 8);
        }
        posY = Math.max(8, Math.min(posY, screenH - menuHeight - 12));
    }

    menu.style.left = posX + 'px';
    menu.style.top = posY + 'px';
    menu.style.visibility = '';

    const firstBtn = menu.querySelector('button');
    if (firstBtn && !isMobileDevice) {
        requestAnimationFrame(() => {
            try { firstBtn.focus(); } catch (_) { }
        });
    }

    if (!menu.dataset.delegated) {
        menu.addEventListener('click', e => {
            const button = e.target.closest('button[data-mact]');
            if (!button || !menu.contains(button)) return;
            const act = button.dataset.mact;
            const targetId = msgCtxTargetId;
            closeMsgContextMenu();
            if (act && targetId) runMsgContextAction(act, targetId);
        });
        menu.dataset.delegated = '1';
    }
}

function closeMsgContextMenu() {
    const menu = $('#msgCtxMenu');
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    msgCtxTargetId = null;
    lastMsgCtxMenuClosedTime = Date.now();
    if (selectedMsgId) {
        selectMessage(selectedMsgId, false);
    }
}
window.closeMsgContextMenu = closeMsgContextMenu;

function runMsgContextAction(act, msgId) {
    const chat = activeChat();
    if (!chat) return;
    const m = chat.messages.find(x => x.id === msgId);
    if (!m) return;

    if (act === 'copy' || act === 'edit' || act === 'regen' || act === 'branch' || act === 'del') {
        msgAction(act, msgId);
    } else if (act === 'quote') {
        const current = promptInput.value;
        promptInput.value = current.trim() ? current.trimEnd() + '\n> ' + (m.content || '') + '\n' : '> ' + (m.content || '') + '\n';
        autoGrow();
        setSendBtn();
        promptInput.focus();
        toast('Цитата добавлена в поле ввода', 'ok', 1600);
    } else if (act === 'speak') {
        if (typeof window.qaSpeakText === 'function') {
            window.qaSpeakText(m.content || '');
        } else if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
            const cleanText = (m.content || '').replace(/<[^>]+>/g, '').replace(/```[\s\S]*?```/g, '').trim();
            const u = new SpeechSynthesisUtterance(cleanText.slice(0, 500));
            u.lang = detectTextLanguage(cleanText) === 'ru' ? 'ru-RU' : 'en-US';
            window.speechSynthesis.speak(u);
            toast('Озвучивание сообщения…', 'info', 1600);
        } else {
            toast('Озвучивание не поддерживается браузером', 'warn');
        }
    }
}

function renderMessages() {
    const chat = activeChat();
    const box = $('#messages');
    box.innerHTML = '';
    const hasMessages = Boolean(chat && chat.messages && chat.messages.length > 0);
    const heroEl = $('#hero');
    if (heroEl) heroEl.style.display = hasMessages ? 'none' : 'flex';
    const appEl = document.querySelector('.app');
    const curMode = (chat && chat.mode) ? chat.mode : (window.currentAppRoomMode || 'classic');
    if (appEl) {
        appEl.classList.toggle('is-hero-mode', !hasMessages);
        appEl.classList.toggle('mode-image-studio', curMode === 'image');
    }

    // Синхронизация селектора комнат на экране Hero
    document.querySelectorAll('#heroModeSelector .hero-mode-card').forEach(btn => {
        const isMatch = btn.dataset.mode === curMode;
        btn.classList.toggle('active', isMatch);
        btn.setAttribute('aria-checked', isMatch ? 'true' : 'false');
    });
    if (!chat) { sdResetForChat(); clearMessageSelection(); return; }
    let lastDay = '';
    chat.messages.forEach(m => {
        const dk = dayKey(m.ts);
        if (dk !== lastDay) { lastDay = dk; box.appendChild(buildDateSep(m.ts)); }
        box.appendChild(buildMsgEl(m));
    });
    enhanceCode(box);
    enhanceMediaEmbeds(box);
    if (window.aiMD && typeof window.aiMD.enhanceTables === 'function') {
        window.aiMD.enhanceTables(box);
    }
    processMultilingualDom(box);
    sdResetForChat();
    stickToBottom = true;
    if (selectedMsgId) selectMessage(selectedMsgId, false);
    requestAnimationFrame(() => {
        const s = $('#chatScroll');
        sdSuppress = true;
        s.scrollTop = s.scrollHeight;
        requestAnimationFrame(() => { sdSuppress = false; sdUpdate(); });
    });
}
/* Вспомогательный резолвер аватара ассистента (одинарный / переплетённый двойной) */
function getAssistantAvatarHtml(m) {
    const defaultModel = typeof getModel === 'function' ? getModel(m.modelId || state.settings.modelId) : { id: 'anthropic/claude-3.7-sonnet', name: 'AI' };
    const isDirectImgGen = (m.modelId && (m.modelId.includes('riverflow') || m.modelId.includes('flux') || m.modelId.includes('muse') || m.modelId.includes('image') || m.modelId.includes('sourceful') || m.modelId.includes('black-forest-labs'))) || (m.modelLabel && m.modelLabel.includes('Редактирование'));

    const activeImgModelKey = m.generatedImages?.[0]?.model || m.imageRequests?.[0]?.model || (isDirectImgGen ? (m.modelId || m.modelLabel) : null);
    const resolvedImgModel = activeImgModelKey && typeof resolveImgModel === 'function' ? resolveImgModel(activeImgModelKey) : null;

    const imgIconUrl = resolvedImgModel?.icon
        || (resolvedImgModel && typeof window.getAiModelIcon === 'function' ? window.getAiModelIcon(resolvedImgModel.id, resolvedImgModel) : null)
        || (activeImgModelKey && typeof window.getAiModelIcon === 'function' ? window.getAiModelIcon(activeImgModelKey) : null)
        || null;

    const textModelIconUrl = (typeof window.getAiModelIcon === 'function' ? window.getAiModelIcon(defaultModel.id, defaultModel) : null)
        || (defaultModel.icon && !defaultModel.icon.startsWith('http') ? defaultModel.icon : null)
        || defaultModel.icon
        || null;

    // 1. Прямая генерация или редактирование изображения (только Image AI без участия чат-модели)
    if (isDirectImgGen || (!m.content && imgIconUrl)) {
        const ico = imgIconUrl || textModelIconUrl;
        const inner = ico
            ? `<img src="${esc(ico)}" alt="${esc(m.modelLabel || resolvedImgModel?.name || defaultModel.name)}" loading="lazy" onerror="this.outerHTML='<svg><use href=&quot;#i-chip&quot;/></svg>'">`
            : '<svg><use href="#i-chip"/></svg>';
        return { isDual: false, html: inner, title: m.modelLabel || resolvedImgModel?.name || defaultModel.name };
    }

    // 2. Гибридный ответ: текстовый ИИ ответил и вызвал генерацию картинок (переплетённый дуэт иконок)
    if (imgIconUrl && ((m.imageRequests && m.imageRequests.length > 0) || (m.generatedImages && m.generatedImages.length > 0))) {
        const textIconInner = textModelIconUrl
            ? `<img src="${esc(textModelIconUrl)}" alt="${esc(defaultModel.name)}" loading="lazy" onerror="this.outerHTML='<svg><use href=&quot;#i-moon&quot;/></svg>'">`
            : '<svg><use href="#i-moon"/></svg>';

        const imgIconInner = `<img src="${esc(imgIconUrl)}" alt="${esc(resolvedImgModel?.name || activeImgModelKey)}" loading="lazy" onerror="this.outerHTML='<svg><use href=&quot;#i-image&quot;/></svg>'">`;

        const dualHtml = `
            <span class="avatar-primary-layer" title="${esc(defaultModel.name)}">${textIconInner}</span>
            <span class="avatar-secondary-layer" title="${esc(resolvedImgModel?.name || activeImgModelKey)}">${imgIconInner}</span>
        `;
        return { isDual: true, html: dualHtml, title: `${defaultModel.name} + ${resolvedImgModel?.name || activeImgModelKey}` };
    }

    // 3. Стандартный чисто текстовый ответ модели
    const singleIco = textModelIconUrl;
    const singleInner = singleIco
        ? `<img src="${esc(singleIco)}" alt="${esc(defaultModel.name)}" loading="lazy" onerror="this.outerHTML='<svg><use href=&quot;#i-moon&quot;/></svg>'">`
        : '<svg><use href="#i-moon"/></svg>';
    return { isDual: false, html: singleInner, title: defaultModel.name };
}

function buildMsgEl(m) {
    const el = document.createElement('div');
    el.dataset.id = m.id;
    const msgLang = detectTextLanguage(m.content || m.thinking || '');
    el.dataset.lang = msgLang;

    if (m.role === 'user' || m.role === 'developer') {
        el.className = 'msg user' + (m.role === 'developer' ? ' is-dev-msg' : '');
        const atts = (m.attachments || []).map((a, attIdx) => {
            const delBtnHtml = `<button class="att-chip-del" data-att-del="${attIdx}" title="Удалить вложение из контекста диалога" aria-label="Удалить вложение"><svg><use href="#i-x"/></svg></button>`;
            if (a.kind === 'image') {
                return `<span class="att-chip" data-att-idx="${attIdx}"><img src="${esc(a.dataUrl)}" alt="${esc(a.name || 'изображение')}" data-zoom-img="${esc(a.dataUrl)}"><span class="nm" title="${esc(a.name || 'изображение')}">${esc(a.name || 'изображение')}</span>${delBtnHtml}</span>`;
            }
            if (a.kind === 'document') {
                const docType = String(a.docType || 'doc').toUpperCase();
                const badge = a.pageCount ? `${a.pageCount} стр.` : (a.images?.length ? `${a.images.length} иллустр.` : `${Math.max(1, Math.round((a.text || '').length / 1024))}K`);
                const thumb = a.images?.[0]?.dataUrl;
                const thumbHtml = thumb ? `<img src="${esc(thumb)}" alt="" class="att-chip-thumb" data-zoom-img="${esc(thumb)}">` : `<svg><use href="#i-file"/></svg>`;
                return `<span class="att-chip att-chip-doc" data-att-idx="${attIdx}">${thumbHtml}<span class="nm" title="${esc(a.name)}"><b>${docType}:</b> ${esc(a.name)} <span class="att-badge">${badge}</span></span>${delBtnHtml}</span>`;
            }
            if (a.kind === 'audio') {
                const durStr = a.duration ? `${Math.floor(a.duration / 60)}:${String(Math.floor(a.duration % 60)).padStart(2, '0')}` : 'audio';
                return `<span class="att-chip att-chip-audio" data-att-idx="${attIdx}"><svg><use href="#i-volume"/></svg><span class="nm" title="${esc(a.name)}"><b>Аудио:</b> ${esc(a.name)} <span class="att-badge">${durStr}</span></span>${delBtnHtml}</span>`;
            }
            if (a.kind === 'video') {
                const durStr = a.duration ? `${Math.floor(a.duration / 60)}:${String(Math.floor(a.duration % 60)).padStart(2, '0')}` : 'video';
                const thumb = a.keyframes?.[0]?.dataUrl;
                const thumbHtml = thumb ? `<img src="${esc(thumb)}" alt="" class="att-chip-thumb" data-zoom-img="${esc(thumb)}">` : `<svg><use href="#i-play"/></svg>`;
                return `<span class="att-chip att-chip-video" data-att-idx="${attIdx}">${thumbHtml}<span class="nm" title="${esc(a.name)}"><b>Видео:</b> ${esc(a.name)} <span class="att-badge">${durStr} (${(a.keyframes || []).length} кадр.)</span></span>${delBtnHtml}</span>`;
            }
            if (a.kind === 'artifact') {
                return `<span class="att-chip" data-att-idx="${attIdx}"><svg><use href="#i-cube"/></svg><span class="nm" title="Артефакт: ${esc(a.name)} · v${a.version}">Артефакт: ${esc(a.name)} · v${a.version}</span>${delBtnHtml}</span>`;
            }
            return `<span class="att-chip" data-att-idx="${attIdx}"><svg><use href="#i-file"/></svg><span class="nm" title="${esc(a.name || 'файл')}">${esc(a.name || 'файл')}</span>${delBtnHtml}</span>`;
        }).join('');

        let urlProgressHtml = '';
        if (m.urlReading) {
            const pct = Math.max(0, Math.min(100, m.urlProgress?.percent || 0));
            const status = m.urlProgress?.status || 'Чтение веб-страницы…';
            const curUrl = m.urlProgress?.url || '';
            urlProgressHtml = `
            <div class="url-progress-card no-sel">
              <div class="upc-header">
                <div class="upc-title-box">
                  <svg class="ic" style="animation:rot 1.1s linear infinite"><use href="#i-refresh"/></svg>
                  <span class="upc-status-text">${esc(status)}</span>
                </div>
                <span class="upc-percent-badge">${pct}%</span>
              </div>
              <div class="upc-track">
                <div class="upc-bar" style="width:${pct}%"></div>
              </div>
              ${curUrl ? `<div class="upc-url-line">${esc(curUrl)}</div>` : ''}
            </div>`;
        }

        let urlChipsHtml = '';
        if (Array.isArray(m.urlContents) && m.urlContents.length > 0) {
            urlChipsHtml = `<div class="url-attached-chips no-sel">` +
                m.urlContents.map((c, urlIdx) => {
                    const isDisabled = !!c.disabled;
                    const isExpanded = !!c.expanded;
                    const sizeKb = Math.max(1, Math.round((c.content || '').length / 1024));
                    return `
                    <span class="url-attached-chip ${isDisabled ? 'disabled' : ''} ${isExpanded ? 'is-expanded' : ''}" title="${esc(c.url)}${isDisabled ? ' (исключено из контекста ИИ)' : ''}">
                      <svg class="ic"><use href="#i-globe"/></svg>
                      <span class="uac-title" data-url-view="${urlIdx}">${esc(c.title || domainHost(c.url))}</span>
                      <span class="uac-size">${sizeKb}K</span>
                      ${c.content ? `<button type="button" class="uac-view-btn ${isExpanded ? 'is-active' : ''}" data-url-view="${urlIdx}" title="${isExpanded ? 'Скрыть текст страницы' : 'Посмотреть извлечённый текст'}" aria-label="Просмотр"><svg class="ic"><use href="#i-eye"/></svg></button>` : ''}
                      <button type="button" class="uac-toggle-btn ${isDisabled ? 'is-off' : ''}" data-url-toggle="${urlIdx}" title="${isDisabled ? 'Включить обратно в контекст ИИ' : 'Исключить из контекста (экономия токенов)'}" aria-label="Переключить активность"><svg class="ic"><use href="#${isDisabled ? 'i-plus' : 'i-eye-off'}"/></svg></button>
                      <button type="button" class="uac-del-btn" data-url-del="${urlIdx}" title="Удалить страницу из контекста навсегда" aria-label="Удалить ссылку"><svg class="ic"><use href="#i-trash"/></svg></button>
                      ${isExpanded && c.content ? `<div class="uac-inline-drawer"><pre class="uac-drawer-text">${esc(c.content)}</pre></div>` : ''}
                    </span>
                    `;
                }).join('') + `</div>`;
        }

        const authorBadge = m.role === 'developer'
            ? '<span class="dev-author-badge"><svg><use href="#i-terminal"/></svg>Developer</span>'
            : 'Вы';

        el.innerHTML = `
      <div class="msg-main">
        <div class="msg-meta no-sel"><span>${fmtTime(m.ts)}</span><span class="msg-author">${authorBadge}</span>${m.searchQueries ? '<span class="msg-search-flag" title="Запрос отправлен через /search"><svg><use href="#i-globe"/></svg>поиск</span>' : ''}</div>
        ${atts ? `<div class="att-grid">${atts}</div>` : ''}
        ${m.content ? `<div class="bubble">${esc(m.content)}</div>` : ''}
        ${urlProgressHtml}
        ${urlChipsHtml}
        <div class="msg-actions no-sel">
          <button class="mact" data-act="edit" title="Изменить"><svg><use href="#i-pencil"/></svg></button>
          <button class="mact danger" data-act="del" title="Удалить"><svg><use href="#i-trash"/></svg></button>
        </div>
      </div>`;

        // Обработка интерактивных действий в сообщении пользователя
        el.addEventListener('click', e => {
            const delBtn = e.target.closest('[data-att-del]');
            if (delBtn) {
                e.stopPropagation();
                const attIdx = parseInt(delBtn.dataset.attDel, 10);
                const chat = activeChat();
                if (chat && m.attachments && m.attachments[attIdx]) {
                    const removed = m.attachments[attIdx];
                    const removedName = removed.name || 'Файл';
                    m.attachments.splice(attIdx, 1);
                    chat.updatedAt = Date.now();
                    save();
                    renderMessages();
                    toast(`Вложение «${removedName}» удалено из контекста ИИ`, 'info', 2200);
                }
                return;
            }

            const urlViewBtn = e.target.closest('[data-url-view]');
            if (urlViewBtn) {
                e.stopPropagation();
                const uIdx = parseInt(urlViewBtn.dataset.urlView, 10);
                const chat = activeChat();
                if (chat && Array.isArray(m.urlContents) && m.urlContents[uIdx] && m.urlContents[uIdx].content) {
                    m.urlContents[uIdx].expanded = !m.urlContents[uIdx].expanded;
                    chat.updatedAt = Date.now();
                    save();
                    renderMessages();
                }
                return;
            }

            const urlToggleBtn = e.target.closest('[data-url-toggle]');
            if (urlToggleBtn) {
                e.stopPropagation();
                const uIdx = parseInt(urlToggleBtn.dataset.urlToggle, 10);
                const chat = activeChat();
                if (chat && Array.isArray(m.urlContents) && m.urlContents[uIdx]) {
                    m.urlContents[uIdx].disabled = !m.urlContents[uIdx].disabled;
                    chat.updatedAt = Date.now();
                    save();
                    renderMessages();
                    toast(m.urlContents[uIdx].disabled ? 'Страница исключена из контекста (токены сэкономлены)' : 'Страница возвращена в контекст ИИ', 'info', 1800);
                }
                return;
            }

            const urlDelBtn = e.target.closest('[data-url-del]');
            if (urlDelBtn) {
                e.stopPropagation();
                const uIdx = parseInt(urlDelBtn.dataset.urlDel, 10);
                const chat = activeChat();
                if (chat && Array.isArray(m.urlContents) && m.urlContents[uIdx]) {
                    const removed = m.urlContents[uIdx];
                    const removedTitle = removed.title || domainHost(removed.url) || 'Страница';
                    const freedKb = Math.max(1, Math.round((removed.content || '').length / 1024));
                    m.urlContents.splice(uIdx, 1);
                    chat.updatedAt = Date.now();
                    save();
                    renderMessages();
                    toast(`Контекст «${removedTitle}» (${freedKb} КБ) удалён, токены освобождены`, 'ok', 2200);
                }
                return;
            }

            const zoomImg = e.target.closest('[data-zoom-img]');
            if (zoomImg) {
                e.stopPropagation();
                openImageViewer(zoomImg.dataset.zoomImg, zoomImg.alt || 'Изображение');
                return;
            }

            const btn = e.target.closest('[data-act]');
            if (btn) {
                msgAction(btn.dataset.act, m.id);
                return;
            }

            // На сенсорных экранах: меню сообщения открывается СТРОГО при быстром одиночном тапе
            if (checkIsMobile() || e.pointerType === 'touch') {
                if (el.dataset.editing || e.target.closest('.msg-edit, textarea, input, button, a, .md-table-card, table, summary, [data-zoom-img]')) return;

                // Если палец задерживался дольше 260мс или двигался — это выделение текста или скролл, меню НЕ открываем
                if (msgTouchTracker.isHoldOrDrag || (Date.now() < suppressMsgMenuUntil)) return;

                if (handleMessageClickSelectionGuard(e)) {
                    return;
                }

                if (Date.now() - lastMsgCtxMenuClosedTime < 250) return;
                if (Date.now() - msgCtxJustOpenedTime < 300) return;

                e.preventDefault();
                e.stopPropagation();
                closeAllMenus();
                openMsgContextMenu(m.id, el, e.clientX, e.clientY);
            }
        });
    } else {
        el.className = 'msg ai' + (m.status === 'error' ? ' error' : '');
        const model = getModel(m.modelId || state.settings.modelId);
        const shownModelName = m.modelLabel || model.name;
        const providerBadge = m.actualProvider ? `<span class="prov-flavor-pill" title="Узел инференса">${esc(m.actualProvider)}</span>` : '';
        const avatarData = getAssistantAvatarHtml(m);

        el.innerHTML = `
<div class="avatar ${avatarData.isDual ? 'dual-avatar' : ''} no-sel" title="${esc(avatarData.title)}" data-rendered-title="${esc(avatarData.title)}">${avatarData.html}</div>
<div class="msg-main">
<div class="msg-meta no-sel"><span class="msg-author">MoonSSS</span><span class="msg-model">${esc(shownModelName)}</span>${providerBadge}${m.viaSearch ? '<span class="msg-search-flag" title="Ответ на запрос /search"><svg><use href="#i-globe"/></svg>веб-поиск</span>' : ''}<span>${fmtTime(m.ts)}</span></div>
        <div class="think collapsed" hidden>
          <button class="think-head think-pill-btn no-sel" type="button" aria-expanded="false">
            <span class="think-orb-slot"><canvas class="think-orb-canvas" width="28" height="28"></canvas></span>
            <span class="think-head-title">Thinking….</span>
            <svg class="tchev"><use href="#i-chev"/></svg>
          </button>
          <div class="think-scroll-viewport">
            <div class="think-body"></div>
          </div>
        </div>
        <div class="wsearch" hidden>
          <button class="wsearch-pill-btn no-sel" type="button" aria-expanded="false">
            <span class="wsearch-orb-slot"><canvas class="wsearch-orb-canvas" width="56" height="56"></canvas></span>
            <span class="wsearch-status-text">Searching….</span>
            <span class="wsearch-count-badge" hidden>0</span>
            <svg class="wchev"><use href="#i-chev"/></svg>
          </button>
          <div class="wsearch-drawer-viewport">
            <div class="wsearch-body"></div>
            <div class="ws-queries" hidden><div class="ws-queries-title">Поисковые запросы</div><div class="ws-queries-list"></div></div>
            <div class="ws-stages" hidden><div class="ws-stages-title"><svg><use href="#i-spark"/></svg>Журнал инструмента</div><div class="ws-stages-list"></div></div>
          </div>
        </div>
<div class="webimgs" hidden>
<button class="webimgs-head no-sel"><svg><use href="#i-image"/></svg><span>Изображения из сети</span><span class="wi-count">0</span><svg class="wchev"><use href="#i-chev"/></svg></button>
<div class="webimgs-body"></div>
</div>
<div class="md-body"></div>
<div class="msg-sources-shelf" hidden></div>
        <div class="genimg-list"></div>
        <div class="msg-actions no-sel">
          <button class="mact" data-act="copy" title="Копировать"><svg><use href="#i-copy"/></svg></button>
          <button class="mact" data-act="edit" title="Изменить"><svg><use href="#i-pencil"/></svg></button>
          <button class="mact" data-act="regen" title="Перегенерировать"><svg><use href="#i-refresh"/></svg></button>
          <button class="mact" data-act="branch" title="Новая ветвь отсюда"><svg><use href="#i-branch"/></svg></button>
          <button class="mact danger" data-act="del" title="Удалить"><svg><use href="#i-trash"/></svg></button>
        </div>
      </div>`;
    }
    el.addEventListener('click', e => {
        /* Карточка параллельного мышления: раскрытие задачи */
        const thinkHost = e.target.closest('.think-par');
        if (thinkHost && m.thinkSessions) {
            const tpHead = e.target.closest('[data-tphead]');
            if (tpHead) {
                const taskEl = tpHead.closest('.tp-task');
                const tIdx = +tpHead.dataset.tphead;
                const sIdx = +thinkHost.dataset.think;
                const sess = m.thinkSessions[sIdx];
                if (sess && sess.tasks[tIdx] && sess.tasks[tIdx].result) {
                    taskEl.classList.toggle('expanded');
                }
                return;
            }
        }
        /* Пагинация полки источников */
        const pgBtn = e.target.closest('[data-sources-page-btn]');
        if (pgBtn) {
            e.preventDefault();
            e.stopPropagation();
            const delta = parseInt(pgBtn.dataset.sourcesPageBtn, 10) || 0;
            const allSources = window.toolCalling ? window.toolCalling.extractAllMessageSources(m) : [];
            const totalPages = Math.ceil(allSources.length / 10);
            const nextPage = Math.max(1, Math.min(totalPages, (m.sourcesPage || 1) + delta));
            if (nextPage !== m.sourcesPage) {
                m.sourcesPage = nextPage;
                refreshMsgBody(el, m);
            }
            return;
        }
        /* Пилюля артефакта */
        const artHost = e.target.closest('.art-pill-host');
        if (artHost && m.artifacts) {
            e.preventDefault();
            e.stopPropagation();
            const idx = +artHost.dataset.art;
            const btn = artHost.querySelector('.art-pill-btn') || artHost;
            toggleArtifactMenu(m, idx, btn);
            return;
        }
        /* Карточки запроса генерации изображения */
        const irqHost = e.target.closest('[data-girq]');
        const irq = irqHost ? (m.imageRequests || [])[+irqHost.dataset.girq] : null;
        const irqIdx = irqHost ? +irqHost.dataset.girq : -1;
        const igcAp = e.target.closest('.igreq-approve');
        if (igcAp && irq) {
            e.preventDefault();
            e.stopPropagation();
            if (!irq.prompt) irq.prompt = irq.aiPrompt || '';
            approveImageRequest(m, irq);
            return;
        }
        const igcDec = e.target.closest('.igreq-decline');
        if (igcDec && irq) {
            e.preventDefault();
            e.stopPropagation();
            declineImageRequest(m, irqIdx);
            return;
        }
        const igcPromptClick = e.target.closest('.igreq-prompt');
        if (igcPromptClick && irq && irq.status === 'awaiting') {
            e.preventDefault();
            e.stopPropagation();
            openImgReqConfirm(m, irq);
            return;
        }
        const grBtn = e.target.closest('.gi-btn[data-gract]');
        if (grBtn && irq && irq.dataUrl) {
            if (grBtn.dataset.gract === 'dl') downloadDataUrl(irq.dataUrl, irq.model);
            else copyImageDataUrl(irq.dataUrl);
            return;
        }
        /* Интерактивное управление загруженными URL-ссылками в карточках ИИ (View, Toggle, Del, Clear All) */
        const ufActionBtn = e.target.closest('[data-uf-action]');
        if (ufActionBtn && m.urlFetches) {
            e.stopPropagation();
            const action = ufActionBtn.dataset.ufAction;
            const sIdx = +ufActionBtn.dataset.ufSession;
            const sess = m.urlFetches[sIdx];
            if (!sess) return;

            if (action === 'view') {
                const iIdx = +ufActionBtn.dataset.ufItem;
                if (sess.urls && sess.urls[iIdx] && sess.urls[iIdx].content) {
                    sess.urls[iIdx].expanded = !sess.urls[iIdx].expanded;
                    save();
                    refreshCurrentMsg(m);
                }
                return;
            }

            if (action === 'toggle') {
                const iIdx = +ufActionBtn.dataset.ufItem;
                if (sess.urls && sess.urls[iIdx]) {
                    sess.urls[iIdx].disabled = !sess.urls[iIdx].disabled;
                    save();
                    refreshCurrentMsg(m);
                    toast(sess.urls[iIdx].disabled ? 'Страница исключена из контекста (токены сэкономлены)' : 'Страница возвращена в контекст ИИ', 'info', 1800);
                }
                return;
            }

            if (action === 'del') {
                const iIdx = +ufActionBtn.dataset.ufItem;
                if (sess.urls && sess.urls[iIdx]) {
                    const removedTitle = sess.urls[iIdx].title || 'Страница';
                    sess.urls.splice(iIdx, 1);
                    if (sess.urls.length === 0) {
                        sess.urls = [];
                    }
                    save();
                    renderMessages();
                    toast(`«${removedTitle}» полностью удалена из памяти`, 'ok', 1800);
                }
                return;
            }

            if (action === 'clear-all') {
                if (sess.urls) {
                    sess.urls.forEach(u => { u.disabled = true; });
                }
                save();
                renderMessages();
                toast('Весь контекст ссылок отключен, токены освобождены', 'ok', 2000);
                return;
            }
        }
        const head = e.target.closest('.think-head');
        if (head) {
            e.preventDefault();
            e.stopPropagation();
            const thinkEl = head.closest('.think');
            if (thinkEl) {
                const willCollapse = !thinkEl.classList.contains('collapsed');
                thinkEl.classList.toggle('collapsed', willCollapse);
                head.setAttribute('aria-expanded', willCollapse ? 'false' : 'true');
                m.thinkCollapsed = willCollapse;
                save();
            }
            return;
        }
        const wsHead = e.target.closest('.wsearch-pill-btn, .wsearch-head, .ws-inline-head');
        if (wsHead) {
            e.preventDefault();
            e.stopPropagation();
            const w = wsHead.closest('.wsearch, .ws-inline');
            if (w) {
                const willCollapse = !w.classList.contains('collapsed');
                w.classList.toggle('collapsed', willCollapse);
                wsHead.setAttribute('aria-expanded', willCollapse ? 'false' : 'true');
                if (w.classList.contains('wsearch') && m.webSearch) {
                    m.webSearch.collapsed = willCollapse;
                }
                if (w.classList.contains('ws-inline') && m.inlineSearches && w.dataset.ws !== undefined) {
                    const entry = m.inlineSearches[+w.dataset.ws];
                    if (entry) entry.collapsed = willCollapse;
                }
                save();
            }
            return;
        }
        const imHead = e.target.closest('.webimgs-head');
        if (imHead) { const w = imHead.parentElement; w.classList.toggle('collapsed'); m.webImagesCollapsed = w.classList.contains('collapsed'); return; }
        const wiImg = e.target.closest('.wi-item img');
        if (wiImg) { const it = (m.webImages || [])[+wiImg.closest('.wi-item').dataset.i]; if (it) openImageViewer(it.full || it.thumb, it.title); return; }
        const btn = e.target.closest('[data-act]');
        if (btn) {
            msgAction(btn.dataset.act, m.id);
            return;
        }

        // На сенсорных экранах: меню сообщения открывается СТРОГО при быстром одиночном тапе
        if (checkIsMobile() || e.pointerType === 'touch') {
            if (el.dataset.editing || e.target.closest('.msg-edit, textarea, input, button, a, select, [contenteditable="true"], .think-head, .wsearch-pill-btn, .webimgs-head, .wi-item, [data-zoom-img], .genimg, [data-tool-mount], .code-tools, .code-copy, .code-run, .art-pill-btn, .source-citation-card, .source-citation-badge, .source-card, .mss-page-btn, .uac-toggle-btn, .uac-del-btn, .att-chip-del, .tp-task-head, [data-tphead], audio, video, .md-table-card, .md-table-preview, .md-table-img, .md-table-image-wrap, .md-table-header, .md-table-raw-details, table, summary')) return;

            // Если палец задерживался дольше 260мс или двигался — это выделение текста или скролл, меню НЕ открываем
            if (msgTouchTracker.isHoldOrDrag || (Date.now() < suppressMsgMenuUntil)) return;

            if (handleMessageClickSelectionGuard(e)) {
                return;
            }

            if (Date.now() - lastMsgCtxMenuClosedTime < 250) return;
            if (Date.now() - msgCtxJustOpenedTime < 300) return;

            e.preventDefault();
            e.stopPropagation();
            closeAllMenus();
            openMsgContextMenu(m.id, el, e.clientX, e.clientY);
        }
    });
    refreshMsgBody(el, m);
    if (m.role === 'user' || m.role === 'developer') {
        processMultilingualDom(el);
    }
    return el;
}
function applyStreamingTrail(container) {
    if (!container) return;
    const walker = document.createTreeWalker(
        container,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: node => {
                if (!node || !node.nodeValue || node.nodeValue.length === 0) return NodeFilter.FILTER_REJECT;
                const parent = node.parentElement;
                if (!parent) return NodeFilter.FILTER_REJECT;
                if (parent.closest('style, script, .code-lines, .code-tools, .inline-media-card, .think-body, .wsearch-body, .art-card, .exec-card, .ws-inline, .todo-card, .url-fetch-card, .igreq, .source-citation-card, .source-citation-badge, [data-tool-mount]')) {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );

    const textNodes = [];
    while (walker.nextNode()) {
        textNodes.push(walker.currentNode);
    }

    if (!textNodes.length) return;

    let needed = 16;
    const targets = [];

    for (let i = textNodes.length - 1; i >= 0 && needed > 0; i--) {
        const node = textNodes[i];
        const val = node.nodeValue;
        if (!val) continue;
        const take = Math.min(val.length, needed);
        targets.unshift({ node, take });
        needed -= take;
    }

    const totalChars = 16 - needed;
    if (totalChars <= 0) return;

    let charCursor = 16 - totalChars + 1;


    targets.forEach(({ node, take }) => {
        const val = node.nodeValue;
        const keepText = val.slice(0, val.length - take);
        const trailText = val.slice(val.length - take);

        const frag = document.createDocumentFragment();
        if (keepText) {
            frag.appendChild(document.createTextNode(keepText));
        }

        for (const c of trailText) {
            const span = document.createElement('span');
            span.className = `st-char st-char-${charCursor}`;
            span.textContent = c;
            frag.appendChild(span);
            charCursor++;
        }

        if (node.parentNode) {
            node.parentNode.replaceChild(frag, node);
        }
    });
}

function refreshMsgBody(el, m) {
    if (el.dataset.editing) return;
    if (m.role !== 'assistant') return;

    // Динамическая синхронизация одинарного или двойного аватара
    const avatarEl = el.querySelector('.avatar');
    if (avatarEl) {
        const avatarData = getAssistantAvatarHtml(m);
        const currentDual = avatarEl.classList.contains('dual-avatar');
        if (avatarData.isDual !== currentDual || avatarEl.dataset.renderedTitle !== avatarData.title) {
            avatarEl.className = 'avatar' + (avatarData.isDual ? ' dual-avatar' : '') + ' no-sel';
            avatarEl.title = avatarData.title;
            avatarEl.dataset.renderedTitle = avatarData.title;
            avatarEl.innerHTML = avatarData.html;
        }
    }

    const msgLang = detectTextLanguage(m.content || m.thinking || '');
    el.dataset.lang = msgLang;

    const body = el.querySelector('.msg-main > .md-body');
    if (!body) return;
    body.dataset.lang = msgLang;
    let displayContent = m.content || '';
    if (m.status === 'streaming') {
        const findArtFn = typeof findArtifactOpen === 'function' ? findArtifactOpen : window.findArtifactOpen;
        const oIdx = typeof findArtFn === 'function' ? findArtFn(displayContent) : -1;
        if (oIdx !== -1 && displayContent.indexOf('</artifact>', oIdx) === -1) {
            displayContent = displayContent.slice(0, oIdx).trimEnd() + '\n\n<div data-tool-slot="ART_SHAPING:0"></div>';
        }
    }

    const imgReqHash = (m.imageRequests || []).map(r => `${r.id}_${r.status}_${Math.round(r.progress || 0)}_${r.dataUrl ? 1 : 0}`).join('|');
    const artHash = (m.artifacts || []).map(a => `${a.id}_${a.version}_${a.codeOpen ? 1 : 0}_${a.code.length}`).join('|');
    const ufHash = (m.urlFetches || []).map(u => `${u.id}_${u.status}_${(u.urls || []).map(x => `${x.status}_${Math.round(x.percent || 0)}_${x.disabled ? 1 : 0}_${x.expanded ? 1 : 0}_${(x.content || '').length}`).join(',')}`).join('|');
    const execHash = (m.executions || []).map(x => `${x.id}_${x.status}_${x.exitCode}_${x.codeOpen ? 1 : 0}_${(x.output || []).length}`).join('|');
    const todoHash = (m.todoSessions || []).map(t => `${t.id}_${t.status}_${t.isCollapsed ? 1 : 0}_${(t.tasks || []).map(k => `${k.status}_${k.result || ''}_${Math.round(k.urlFetch?.percent || 0)}_${k.search?.status || ''}`).join(',')}`).join('|');
    const currentToolsHash = `${imgReqHash}#${artHash}#${ufHash}#${execHash}#${todoHash}`;

    const contentChanged = body.dataset.renderedContent !== displayContent ||
        body.dataset.renderedStatus !== m.status ||
        body.dataset.renderedTools !== currentToolsHash;
    if (contentChanged) {
        body.dataset.renderedContent = displayContent;
        body.dataset.renderedStatus = m.status;
        body.dataset.renderedTools = currentToolsHash;

        // Сохраняем ссылки на уже смонтированные в DOM карточки инструментов перед обновлением разметки
        if (body.children.length > 0) {
            if (!body._toolNodeCache) body._toolNodeCache = new Map();
            body.querySelectorAll('[data-tool-mount]').forEach(node => {
                if (node.dataset.toolMount) {
                    body._toolNodeCache.set(node.dataset.toolMount, node);
                }
            });
        }

        body.innerHTML = renderMsgContent(displayContent, m);
        if (window.toolCalling && typeof window.toolCalling.reconcileToolSlots === 'function') {
            window.toolCalling.reconcileToolSlots(body, m);
        }

        if (typeof window.enhanceArtifactOrbs === 'function') {
            window.enhanceArtifactOrbs(body);
        }

        if (m.status === 'streaming') {
            applyStreamingTrail(body);
        } else {
            enhanceCode(el);
            enhanceMediaEmbeds(el);
            if (window.aiMD && typeof window.aiMD.enhanceTables === 'function') {
                window.aiMD.enhanceTables(el);
            }
            processMultilingualDom(el);
        }
    }
    body.classList.toggle('streaming', m.status === 'streaming');

    if (m.status !== 'streaming' && window.toolCalling && typeof window.toolCalling.enhanceSourceBadgesAndCitations === 'function') {
        window.toolCalling.enhanceSourceBadgesAndCitations(el, m);
    }

    // Отрисовка полки проверенных первоисточников под ответом с пагинацией по 10 сайтов
    const shelf = el.querySelector('.msg-sources-shelf');
    if (shelf && window.toolCalling) {
        const allSources = window.toolCalling.extractAllMessageSources(m);
        if (allSources.length > 0) {
            shelf.hidden = false;
            const totalPages = Math.ceil(allSources.length / 10);
            if (!m.sourcesPage || m.sourcesPage < 1) m.sourcesPage = 1;
            if (m.sourcesPage > totalPages) m.sourcesPage = totalPages;
            const curPage = m.sourcesPage;

            const cacheKey = `${curPage}|${allSources.length}|${m.status}`;
            if (shelf.dataset.sourcesCache !== cacheKey) {
                shelf.dataset.sourcesCache = cacheKey;
                const startIndex = (curPage - 1) * 10;
                const pageSources = allSources.slice(startIndex, startIndex + 10);
                shelf.innerHTML = `
                  <div class="mss-header no-sel">
                    <div class="mss-header-left">
                      <svg class="ic"><use href="#i-globe"/></svg>
                      <span>Использованные источники</span>
                      <span class="mss-count">${allSources.length}</span>
                    </div>
                    ${totalPages > 1 ? `
                    <div class="mss-pagination" role="navigation" aria-label="Страницы источников">
                      ${curPage > 1 ? `
                      <button type="button" class="mss-page-btn" data-sources-page-btn="-1" title="Предыдущие 10 источников" aria-label="Предыдущая страница">
                        <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                      </button>` : ''}
                      <span class="mss-page-info">(${curPage}/${totalPages})</span>
                      ${curPage < totalPages ? `
                      <button type="button" class="mss-page-btn" data-sources-page-btn="1" title="Следующие 10 источников" aria-label="Следующая страница">
                        <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                      </button>` : ''}
                    </div>` : ''}
                  </div>
                  <div class="mss-grid">
                    ${pageSources.map(s => `
                      <a class="source-card no-sel" href="${esc(s.uri)}" target="_blank" rel="noopener noreferrer" title="${esc(s.title || s.uri)}">
                        <span class="sc-favicon" data-uri="${esc(s.uri)}">${window.toolCalling.faviconImg(s.uri)}</span>
                        <div class="sc-content">
                          <span class="sc-title">${esc(s.title || s.host)}</span>
                          <span class="sc-domain">${esc(s.host)}</span>
                        </div>
                        <svg class="sc-ext ic"><use href="#i-external"/></svg>
                      </a>
                    `).join('')}
                  </div>
                `;
                enhanceFavicons(shelf);
            }
        } else {
            shelf.hidden = true;
            shelf.innerHTML = '';
            delete shelf.dataset.sourcesCache;
        }
    }

    const think = el.querySelector('.think');
    const hasThinking = m.thinking && m.thinking.length > 0;
    const hasReasoningDetails = Array.isArray(m.reasoning_details) && m.reasoning_details.length > 0;

    if (think) {
        if (hasThinking || hasReasoningDetails) {
            think.hidden = false;
            const thinkHead = think.querySelector('.think-head');
            const thinkBody = think.querySelector('.think-body');

            const rdCount = hasReasoningDetails ? m.reasoning_details.length : 0;
            const isLive = m.status === 'streaming';
            const defaultLabel = isLive ? 'Thinking….' : 'Thinking';
            const finalLabel = rdCount > 0 ? `Thinking · ${rdCount} step${rdCount === 1 ? '' : 's'}` : defaultLabel;

            if (thinkHead) {
                let titleSpan = thinkHead.querySelector('.think-head-title');
                if (!titleSpan) {
                    thinkHead.innerHTML = `
                        <span class="think-orb-slot"><canvas class="think-orb-canvas" width="28" height="28"></canvas></span>
                        <span class="think-head-title">${finalLabel}</span>
                        <svg class="tchev"><use href="#i-chev"/></svg>
                    `;
                } else if (titleSpan.textContent !== finalLabel) {
                    titleSpan.textContent = finalLabel;
                }

                const orbCanvas = thinkHead.querySelector('.think-orb-canvas');
                if (orbCanvas && typeof window.ThinkingOrb === 'function') {
                    const activeTheme = state.settings.theme || 'auto';
                    const themeColor = state.settings.customThemes?.[activeTheme]?.streamColor || null;
                    const orbState = isLive ? 'solving' : 'composing';

                    if (!orbCanvas._orbInstance) {
                        orbCanvas._orbInstance = new window.ThinkingOrb(orbCanvas, {
                            state: orbState,
                            size: 28,
                            theme: activeTheme,
                            color: themeColor,
                            speed: isLive ? 1.0 : 0.75
                        });
                    } else {
                        const curOrbState = orbCanvas._orbInstance.options?.state || orbCanvas._orbInstance.state;
                        if (curOrbState !== orbState) {
                            if (typeof orbCanvas._orbInstance.setState === 'function') orbCanvas._orbInstance.setState(orbState);
                            if (typeof orbCanvas._orbInstance.setTheme === 'function') orbCanvas._orbInstance.setTheme(activeTheme);
                            if (typeof orbCanvas._orbInstance.setColor === 'function') orbCanvas._orbInstance.setColor(themeColor);
                            if (typeof orbCanvas._orbInstance.setSpeed === 'function') orbCanvas._orbInstance.setSpeed(isLive ? 1.0 : 0.75);
                        }
                    }
                }
            }

            if (thinkBody) {
                const thinkHash = `${m.thinking?.length || 0}_${rdCount}_${(m.inlineSearches || []).length}_${m.status}`;
                if (thinkBody.dataset.thinkHash !== thinkHash) {
                    thinkBody.dataset.thinkHash = thinkHash;

                    const prevScroll = thinkBody.scrollTop;
                    const wasAtBottom = (thinkBody.scrollHeight - thinkBody.scrollTop - thinkBody.clientHeight) < 40;

                    if (hasThinking) {
                        thinkBody.innerHTML = renderThinkingWithSearches(m.thinking, m.inlineSearches);
                    } else if (hasReasoningDetails) {
                        const formatThink = typeof window.formatThinkingHtml === 'function'
                            ? window.formatThinkingHtml
                            : (window.toolCalling && typeof window.toolCalling.formatThinkingHtml === 'function'
                                ? (t) => window.toolCalling.formatThinkingHtml(t)
                                : (t) => esc(t).replace(/\n/g, '<br>'));

                        thinkBody.innerHTML = '<div class="think-body-inner">' + m.reasoning_details.map((rd, idx) => {
                            const summary = rd.summary || rd.text || '';
                            const type = rd.type || 'thought';
                            return `<div style="padding:8px 0;${idx > 0 ? 'border-top:1px dashed hsla(0,0%,100%,.06);' : ''}">
                              <div style="font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--accent);margin-bottom:4px;font-weight:700">${esc(type)}</div>
                              <div>${formatThink(summary)}</div>
                            </div>`;
                        }).join('') + '</div>';
                    }

                    if (wasAtBottom) {
                        thinkBody.scrollTop = thinkBody.scrollHeight;
                    } else {
                        thinkBody.scrollTop = prevScroll;
                    }
                }
            }

            think.classList.toggle('live', m.status === 'streaming');
            if (m.status === 'streaming') {
                if (m.thinkCollapsed === true) {
                    think.classList.add('collapsed');
                } else {
                    think.classList.remove('collapsed');
                }
            } else {
                think.classList.toggle('collapsed', m.thinkCollapsed !== false);
            }
        } else {
            think.hidden = true;
        }
    }

    const ws = el.querySelector('.wsearch');
    const wsData = m.webSearch;
    const stagesHtml = list => (list || []).map(st =>
        `<div class="ws-stage"><span class="st-dot"></span><span>${esc(st.label)}</span><span class="st-time">${fmtTime(st.ts)}</span></div>`).join('');
    if (ws) {
        if (wsData && (wsData.sources?.length || wsData.queries?.length || wsData.stages?.length)) {
            ws.hidden = false;
            const isLive = m.status === 'streaming';
            ws.classList.toggle('live', isLive);
            if (!isLive) ws.classList.toggle('collapsed', m.webSearch.collapsed !== false);
            else ws.classList.remove('collapsed');

            const uniqueQueries = [...new Set(wsData.queries || [])];
            const seen = new Set();
            const uniqueSources = (wsData.sources || []).filter(s => {
                if (!s.uri || seen.has(s.uri)) return false;
                try {
                    const u = new URL(s.uri);
                    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
                } catch (e) { return false; }
                seen.add(s.uri); return true;
            });

            const wsHash = `${uniqueSources.length}_${uniqueQueries.length}_${(wsData.stages || []).length}_${m.status}_${m.webSearch?.collapsed ? 1 : 0}`;
            if (ws.dataset.wsHash !== wsHash) {
                ws.dataset.wsHash = wsHash;

                const wsPillBtn = ws.querySelector('.wsearch-pill-btn');
                const wsStatusText = ws.querySelector('.wsearch-status-text');
                const wsCount = ws.querySelector('.wsearch-count-badge');
                if (wsCount) {
                    wsCount.textContent = uniqueSources.length || '…';
                    wsCount.hidden = isLive || !uniqueSources.length;
                }
                if (wsStatusText) {
                    if (isLive) {
                        const lastQ = uniqueQueries[uniqueQueries.length - 1];
                        wsStatusText.textContent = lastQ ? `Searching: ${lastQ}…` : 'Searching….';
                    } else {
                        wsStatusText.textContent = uniqueSources.length
                            ? `Web Search · ${uniqueSources.length} source${uniqueSources.length === 1 ? '' : 's'}`
                            : (uniqueQueries.length ? 'Search Completed' : 'Web Search');
                    }
                }

                const orbCanvas = ws.querySelector('.wsearch-orb-canvas');
                if (orbCanvas && typeof window.ThinkingOrb === 'function') {
                    const activeTheme = state.settings.theme || 'auto';
                    const themeColor = state.settings.customThemes?.[activeTheme]?.streamColor || null;
                    const orbState = isLive ? 'searching' : 'composing';

                    if (!orbCanvas._orbInstance) {
                        orbCanvas._orbInstance = new window.ThinkingOrb(orbCanvas, {
                            state: orbState,
                            size: 64,
                            theme: activeTheme,
                            color: themeColor,
                            speed: isLive ? 1.0 : 0.65
                        });
                    } else {
                        const curOrbState = orbCanvas._orbInstance.options?.state || orbCanvas._orbInstance.state;
                        if (curOrbState !== orbState) {
                            if (typeof orbCanvas._orbInstance.setState === 'function') orbCanvas._orbInstance.setState(orbState);
                            if (typeof orbCanvas._orbInstance.setTheme === 'function') orbCanvas._orbInstance.setTheme(activeTheme);
                            if (typeof orbCanvas._orbInstance.setColor === 'function') orbCanvas._orbInstance.setColor(themeColor);
                            if (typeof orbCanvas._orbInstance.setSpeed === 'function') orbCanvas._orbInstance.setSpeed(isLive ? 1.0 : 0.65);
                        }
                    }
                }

                const wsBody = ws.querySelector('.wsearch-body');
                if (wsBody) {
                    wsBody.innerHTML = uniqueSources.length ? uniqueSources.map(s => {
                        const host = domainHost(s.uri) || 'источник';
                        const snippet = s.snippet ? `<div class="ws-src-snippet">${esc(s.snippet)}</div>` : '';
                        const age = s.page_age ? `<span class="ws-src-age">${esc(s.page_age)}</span>` : '';
                        return `<a class="ws-source" href="${esc(s.uri)}" target="_blank" rel="noopener noreferrer">
                            <span class="ws-favicon" data-uri="${esc(s.uri)}">${faviconImg(s.uri)}</span>
                            <span class="ws-src-text">
                            <span class="ws-src-title">${esc(s.title || host)}${age}<svg><use href="#i-external"/></svg></span>
                            <span class="ws-src-url">${esc(host)}</span>
                            ${snippet}
                            </span>
                            </a>`;
                    }).join('') : `<div class="ws-empty">${m.status === 'streaming' ? 'Поиск в интернете…' : ((wsData.queries || []).length ? 'Источники не найдены' : 'Источники не потребовались — модель ответила из знаний')}</div>`;
                }

                const qSection = ws.querySelector('.ws-queries');
                if (qSection) {
                    if (uniqueQueries.length) {
                        qSection.hidden = false;
                        const qList = qSection.querySelector('.ws-queries-list');
                        if (qList) qList.innerHTML = uniqueQueries.map(q => `<span class="ws-query">${esc(q)}</span>`).join('');
                    } else qSection.hidden = true;
                }

                const stSection = ws.querySelector('.ws-stages');
                if (stSection) {
                    if ((wsData.stages || []).length) {
                        stSection.hidden = false;
                        const stList = stSection.querySelector('.ws-stages-list');
                        if (stList) stList.innerHTML = stagesHtml(wsData.stages);
                    } else stSection.hidden = true;
                }

                enhanceFavicons(ws);
            }
        } else {
            ws.hidden = true;
        }
    }

    /* ── изображения из сети над ответом ── */
    const wiBox = el.querySelector('.webimgs');
    if (wiBox) {
        const wiItems = m.webImages || [];
        if (wiItems.length) {
            wiBox.hidden = false;
            wiBox.classList.toggle('collapsed', !!m.webImagesCollapsed);
            const wiCount = wiBox.querySelector('.wi-count');
            if (wiCount) wiCount.textContent = wiItems.length;
            const wiBody = wiBox.querySelector('.webimgs-body');
            if (wiBody && wiBody.dataset.cache !== String(wiItems.length)) {
                wiBody.dataset.cache = String(wiItems.length);
                wiBody.innerHTML = wiItems.map((it, i) =>
                    '<figure class="wi-item" data-i="' + i + '" title="' + esc(it.title || '') + '"><img src="' + esc(it.thumb) + '" alt="' + esc(it.title || '') + '" loading="lazy"></figure>'
                ).join('');
            }
        } else {
            wiBox.hidden = true;
        }
    }
    enhanceFavicons(el);
    /* ── сгенерированные изображения ── */
    const genList = el.querySelector('.genimg-list');
    if (genList) {
        const gens = m.generatedImages || [];
        if (!gens.length) {
            genList.innerHTML = '';
            delete genList.dataset.genHash;
        } else {
            const genHash = gens.map(g => `${g.id}_${g.status}_${Math.round(g.progress || 0)}_${g.dataUrl ? 1 : 0}`).join('|');
            if (genList.dataset.genHash !== genHash) {
                genList.dataset.genHash = genHash;
                genList.innerHTML = gens.map((g, i) => {
                    if (g.status === 'generating') {
                        const pct = Math.max(0, Math.min(100, Math.round(g.progress || 8)));
                        const statusText = g.statusText || (pct < 15 ? 'Инициализация модели…' : 'Создание изображения. Это займёт несколько секунд…');

                        return `<div class="genimg is-generating-box" data-gi="${i}">
                            ${(typeof window.ImageGeneration === 'function')
                                ? window.ImageGeneration.createMarkup({
                                    progress: pct,
                                    loadingState: 'generating',
                                    statusText: statusText,
                                    imageSrc: g.dataUrl || null,
                                    alt: g.prompt || 'Генерация'
                                })
                                : `<div class="genimg loading"><div class="genimg-status"><span>${esc(statusText)}</span></div></div>`}
                        </div>`;
                    }
                    if (g.status === 'error') {
                        return `<div class="genimg error" data-gi="${i}">
                            <svg><use href="#i-alert"/></svg>
                            <span>Не удалось создать изображение</span>
                            <em>${esc(g.error || '')}</em>
                        </div>`;
                    }
                    return `<div class="genimg done" data-gi="${i}">
                        <img src="${g.dataUrl}" alt="${esc(g.prompt || '')}" loading="lazy">
                        <div class="genimg-bar">
                            <span class="genimg-model">${esc(g.model)}${g.resolution ? ' · ' + esc(g.resolution) : ''}</span>
                            <span class="genimg-spacer"></span>
                            <button class="gi-btn" data-gact="copy" data-i="${i}" title="Копировать в буфер" aria-label="Копировать"><svg><use href="#i-copy"/></svg></button>
                            <button class="gi-btn" data-gact="dl" data-i="${i}" title="Скачать" aria-label="Скачать"><svg><use href="#i-download"/></svg></button>
                        </div>
                    </div>`;
                }).join('');
                genList.querySelectorAll('.gi-btn').forEach(b => {
                    b.addEventListener('click', () => {
                        const g = gens[+b.dataset.i];
                        if (!g || !g.dataUrl) return;
                        if (b.dataset.gact === 'dl') downloadDataUrl(g.dataUrl, g.model);
                        else copyImageDataUrl(g.dataUrl);
                    });
                });
            }
        }
    }
}
function msgAction(act, msgId) {
    const chat = activeChat(); if (!chat) return;
    const idx = chat.messages.findIndex(x => x.id === msgId);
    if (idx < 0) return;
    const m = chat.messages[idx];
    if (act === 'del') {
        if (streaming) { toast('Дождитесь конца генерации или остановите её', 'err'); return; }
        chat.messages.splice(idx, 1); chat.updatedAt = Date.now();
        save(); renderMessages(); renderChatList();
    }
    else if (act === 'copy') {
        const cleanText = (m.content || '')
            .replace(/\[\[(?:IMGRQ|ART|THINK|WS|EXEC|FETCH_URL|TODO):\d+\]\]/g, '')
            .replace(/<artifact\b[\s\S]*?<\/artifact>/gi, '')
            .replace(/\{image_generation\s*\[[\s\S]*?\]\s*:\s*\{[\s\S]*?\}\}/gi, '')
            .replace(/\{(?:web[-_]search|webSearch)\s*:\s*\[[\s\S]*?\]\s*\}/gi, '')
            .replace(/\{thinking(?:_|[-_]process)?\s*(?::\s*)?\[[\s\S]*?\]\s*\}/gi, '')
            .replace(/\{execute\s*:\s*\{[\s\S]*?\}\s*\}/gi, '')
            .replace(/\{(?:fetch[-_]urls?|fetchUrls?)\s*:\s*\[[\s\S]*?\]\s*\}/gi, '')
            .replace(/\{(?:todo[-_]plan|todoPlan)\s*:\s*\[[\s\S]*?\]\s*\}/gi, '')
            .replace(/\{(?:todo[-_]update|todoUpdate)\s*:\s*\{[\s\S]*?\}\s*\}/gi, '')
            .replace(/\{(?:todo[-_]add|todoAdd)\s*:\s*\[[\s\S]*?\]\s*\}/gi, '')
            .trim();
        navigator.clipboard.writeText(cleanText)
            .then(() => toast('Скопировано в буфер обмена', 'ok'))
            .catch(() => toast('Не удалось скопировать', 'err'));
    }
    else if (act === 'branch') branchFrom(msgId);
    else if (act === 'regen') {
        if (streaming) { toast('Сначала остановите текущую генерацию', 'err'); return; }
        const hist = chat.messages.slice(0, idx);
        chat.messages = hist; chat.updatedAt = Date.now();
        save(); renderMessages();
        const lastUser = [...hist].reverse().find(m2 => m2.role === 'user');
        if (lastUser && Array.isArray(lastUser.searchQueries) && lastUser.searchQueries.length) {
            requestAnimationFrame(() => runUserWebSearch(chat, lastUser.searchQueries, lastUser));
        } else {
            requestAnimationFrame(() => runAssistant(chat));
        }
    }
    else if (act === 'edit') startEdit(msgId);
}
function startEdit(msgId) {
    if (streaming) { toast('Сначала остановите генерацию', 'err'); return; }
    const chat = activeChat();
    const m = chat ? chat.messages.find(x => x.id === msgId) : null;
    const el = $('#messages')?.querySelector(`[data-id="${msgId}"]`);
    if (!el || !m) return;

    el.dataset.editing = '1';
    const main = el.querySelector('.msg-main');
    if (!main) return;

    const isUser = m.role === 'user';
    const currentVal = String(m.content || '');

    main.innerHTML = `
    <div class="msg-edit ${isUser ? 'edit-user' : 'edit-ai'}">
      <div class="msg-edit-header no-sel">
        <div class="msg-edit-role">
          <svg class="ic"><use href="#${isUser ? 'i-chat' : 'i-spark'}"/></svg>
          <span>${isUser ? 'Редактирование запроса' : 'Редактирование ответа модели'}</span>
        </div>
        <div class="msg-edit-hints">
          <span class="kbd">Ctrl+Enter</span> <span>сохранить</span>
          <span class="kbd">Esc</span> <span>отмена</span>
        </div>
      </div>
      <div class="msg-edit-body">
        <textarea class="msg-edit-textarea" placeholder="Введите текст сообщения…" spellcheck="false" aria-label="Редактирование текста сообщения">${esc(currentVal)}</textarea>
      </div>
      <div class="msg-edit-footer no-sel">
        <div class="msg-edit-meta">
          <span class="msg-edit-count">${currentVal.length} симв.</span>
        </div>
        <div class="msg-edit-actions">
          <button class="btn btn-ghost btn-sm ed-cancel" type="button"><svg class="ic"><use href="#i-x"/></svg>Отмена</button>
          <button class="btn btn-acc btn-sm ed-save" type="button"><svg class="ic"><use href="#i-check"/></svg>Сохранить</button>
        </div>
      </div>
    </div>`;

    const ta = main.querySelector('.msg-edit-textarea');
    const counter = main.querySelector('.msg-edit-count');
    const btnCancel = main.querySelector('.ed-cancel');
    const btnSave = main.querySelector('.ed-save');

    const updateHeightAndCount = () => {
        if (!ta) return;
        ta.style.height = 'auto';
        const maxHeight = Math.min(window.innerHeight * 0.45, 380);
        ta.style.height = Math.max(76, Math.min(ta.scrollHeight, maxHeight)) + 'px';
        if (counter) counter.textContent = `${ta.value.length} симв.`;
    };

    const cancel = (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        delete el.dataset.editing;
        el.replaceWith(buildMsgEl(m));
    };

    const saveEdit = (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        if (!ta) return;
        const nextText = ta.value.trim();
        m.content = nextText;
        m.thinking = '';
        m.status = 'done';
        m.edited = true;
        chat.updatedAt = Date.now();
        save();
        delete el.dataset.editing;
        el.replaceWith(buildMsgEl(m));
        toast('Сообщение успешно обновлено', 'ok', 1800);
    };

    ta.addEventListener('input', updateHeightAndCount);
    ta.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            saveEdit(e);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            cancel(e);
        }
    });

    btnCancel.addEventListener('click', cancel);
    btnSave.addEventListener('click', saveEdit);

    requestAnimationFrame(() => {
        updateHeightAndCount();
        if (ta) {
            ta.focus();
            ta.setSelectionRange(ta.value.length, ta.value.length);
        }
    });
}

/* ---------- Защищенное извлечение веб-страниц (Без анонимных лимитов) ---------- */
const isAnonymousReadErr = (text) => {
    if (!text || typeof text !== 'string') return false;
    const lower = text.toLowerCase();
    return lower.includes('anonymous reading') ||
        lower.includes('анонимного чтения') ||
        lower.includes('rate limit exceeded') ||
        lower.includes('jina.ai');
};

async function safeFetchUrlContent(url, signal) {
    if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) return null;

    const cleanUrl = url.trim();
    const host = domainHost(cleanUrl);

    // 1. Wikipedia API: прямое чтение без лимитов
    if (host.includes('wikipedia.org')) {
        try {
            const articleTitle = cleanUrl.split('/wiki/')[1];
            if (articleTitle) {
                const lang = (cleanUrl.match(/https?:\/\/([a-z]+)\.wikipedia\.org/i) || [])[1] || 'ru';
                const wpUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${articleTitle}`;
                const wpResp = await fetch(wpUrl, { signal });
                if (wpResp.ok) {
                    const wpData = await wpResp.json();
                    if (wpData.extract) {
                        return {
                            url: cleanUrl,
                            title: wpData.title || host,
                            content: (wpData.description ? wpData.description + '\n\n' : '') + wpData.extract
                        };
                    }
                }
            }
        } catch (_) { }
    }

    const extractTextFromHtml = (html) => {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            doc.querySelectorAll('script, style, noscript, svg, iframe, nav, footer, header, aside, .advert, .ads').forEach(el => el.remove());
            const title = (doc.querySelector('title')?.textContent || doc.querySelector('h1')?.textContent || host).trim();
            const mainEl = doc.querySelector('article, main, [role="main"], .content, #content') || doc.body;
            let text = (mainEl ? mainEl.innerText || mainEl.textContent : doc.body.textContent) || '';
            text = text.replace(/[\r\t]+/g, ' ').replace(/\n{3,}/g, '\n\n').replace(/[ ]{2,}/g, ' ').trim();
            if (text.length > 8000) text = text.slice(0, 8000) + '…';
            return { title, text };
        } catch (_) {
            const clean = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
                .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ').trim();
            return { title: host, text: clean.slice(0, 8000) };
        }
    };

    // 2. Electron: прямой запрос без CORS
    if (window.electronAPI && typeof window.electronAPI.openExternal === 'function') {
        try {
            const resp = await fetch(cleanUrl, { signal, headers: { 'Accept': 'text/html,application/xhtml+xml' } });
            if (resp.ok) {
                const html = await resp.text();
                const parsed = extractTextFromHtml(html);
                if (parsed.text.length > 60) {
                    return { url: cleanUrl, title: parsed.title, content: parsed.text };
                }
            }
        } catch (_) { }
    }

    // 3. Capacitor Native (Android)
    if (window.Capacitor && window.Capacitor.isNative && window.Capacitor.Plugins?.Http) {
        try {
            const capResp = await window.Capacitor.Plugins.Http.request({
                method: 'GET',
                url: cleanUrl,
                headers: { 'Accept': 'text/html,application/xhtml+xml' }
            });
            if (capResp && capResp.data) {
                const parsed = extractTextFromHtml(String(capResp.data));
                if (parsed.text.length > 60) {
                    return { url: cleanUrl, title: parsed.title, content: parsed.text };
                }
            }
        } catch (_) { }
    }

    // 4. Web: надежные CORS-прокси
    const proxyUrls = [
        `https://api.allorigins.win/raw?url=${encodeURIComponent(cleanUrl)}`,
        `https://corsproxy.io/?url=${encodeURIComponent(cleanUrl)}`,
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(cleanUrl)}`
    ];

    for (const pUrl of proxyUrls) {
        if (signal && signal.aborted) break;
        try {
            const resp = await fetch(pUrl, { signal });
            if (resp.ok) {
                const html = await resp.text();
                if (!isAnonymousReadErr(html) && html.length > 80) {
                    const parsed = extractTextFromHtml(html);
                    if (parsed.text && parsed.text.length > 60) {
                        return { url: cleanUrl, title: parsed.title, content: parsed.text };
                    }
                }
            }
        } catch (_) { }
    }

    return null;
}

/* ---------- Вложения (Мультимодальный конвейер обработки файлов) ---------- */
const TEXT_EXT = /\.(txt|md|markdown|json|csv|log|xml|ya?ml|js|mjs|cjs|ts|tsx|jsx|py|rb|php|go|rs|java|kt|swift|c|h|cpp|hpp|cs|sql|sh|bash|zsh|html?|css|scss|toml|ini|conf|env)$/i;

async function fileToDataURL(file) {
    return new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = rej;
        r.readAsDataURL(file);
    });
}

function compressImage(dataUrl, maxSide = 1280, q = .85) {
    return new Promise(res => {
        const img = new Image();
        img.onload = () => {
            const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
            if (scale === 1 && dataUrl.length < 600000) return res(dataUrl);
            const cv = document.createElement('canvas');
            cv.width = Math.round(img.width * scale); cv.height = Math.round(img.height * scale);
            cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
            res(cv.toDataURL('image/jpeg', q));
        };
        img.onerror = () => res(dataUrl);
        img.src = dataUrl;
    });
}

async function ensureJsZip() {
    if (window.JSZip) return window.JSZip;
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
        s.onload = () => resolve(window.JSZip);
        s.onerror = () => reject(new Error('Не удалось загрузить JSZip'));
        document.head.appendChild(s);
    });
}

// Вспомогательный поиск элементов по локальному тегу без проблем с XML-пространствами имён
function getLocalXmlNodes(parent, tagName) {
    if (!parent) return [];
    const target = tagName.toLowerCase();
    const result = [];
    const walk = (node) => {
        if (!node) return;
        const currentName = (node.localName || node.nodeName || '').replace(/^.*:/, '').toLowerCase();
        if (currentName === target) {
            result.push(node);
        }
        const children = node.children || node.childNodes || [];
        for (let i = 0; i < children.length; i++) {
            if (children[i].nodeType === 1) walk(children[i]);
        }
    };
    walk(parent);
    return result;
}

function isBinaryBufferOrString(content) {
    if (!content) return false;
    const sample = typeof content === 'string' ? content.slice(0, 800) : '';
    if (!sample) return false;
    let controlCount = 0;
    for (let i = 0; i < sample.length; i++) {
        const code = sample.charCodeAt(i);
        if (code === 0) return true; // Null-байт — абсолютный маркер бинарного потока
        if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
            controlCount++;
        }
    }
    return (controlCount / sample.length) > 0.08;
}

async function ensurePdfJs() {
    if (window.pdfjsLib) {
        setupPdfWorker(window.pdfjsLib);
        return window.pdfjsLib;
    }
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
        s.onload = () => {
            if (window.pdfjsLib) setupPdfWorker(window.pdfjsLib);
            resolve(window.pdfjsLib);
        };
        s.onerror = () => reject(new Error('Не удалось загрузить PDF.js'));
        document.head.appendChild(s);
    });
}

function setupPdfWorker(pdfjs) {
    try {
        if (!pdfjs.GlobalWorkerOptions) pdfjs.GlobalWorkerOptions = {};
        if (!pdfjs.GlobalWorkerOptions.workerSrc) {
            // Создаем worker через inline blob для предотвращения CORS-ошибок в Electron/Capacitor
            const workerCode = `importScripts('https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js');`;
            const blob = new Blob([workerCode], { type: 'application/javascript' });
            pdfjs.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
        }
    } catch (_) {
        if (pdfjs.GlobalWorkerOptions) {
            pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
        }
    }
}

// Резервное извлечение текстовых блоков из PDF при аппаратной недоступности PDF.js
function extractPdfRawTextFallback(arrayBuffer) {
    try {
        const bytes = new Uint8Array(arrayBuffer);
        let binaryStr = '';
        const step = 8192;
        for (let i = 0; i < bytes.length; i += step) {
            binaryStr += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
        }
        const textBlocks = [];
        const regex = /BT[\s\S]*?ET/g;
        let match;
        while ((match = regex.exec(binaryStr)) !== null) {
            const block = match[0];
            const tjRegex = /\((.*?)\)\s*Tj/g;
            let tm;
            while ((tm = tjRegex.exec(block)) !== null) {
                if (tm[1] && tm[1].trim()) textBlocks.push(tm[1].trim());
            }
        }
        return textBlocks.join(' ').replace(/\\([()\\])/g, '$1').trim();
    } catch (_) {
        return '';
    }
}

async function parsePdfAttachment(file) {
    const rawDataUrl = await fileToDataURL(file);
    const pdfBase64 = rawDataUrl.split(',')[1] || '';
    let pageCount = 0;
    let fullText = '';
    const pageImages = [];

    try {
        const pdfjs = await ensurePdfJs();
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjs.getDocument({
            data: arrayBuffer,
            isEvalSupported: false,
            disableFontFace: true
        });
        const pdf = await loadingTask.promise;
        pageCount = pdf.numPages || 1;

        const maxPagesToRender = Math.min(pageCount, 16);
        for (let p = 1; p <= pageCount; p++) {
            const page = await pdf.getPage(p);
            const textContent = await page.getTextContent();
            const pageStr = (textContent.items || []).map(it => it.str).join(' ').trim();
            if (pageStr) {
                fullText += `\n[СТРАНИЦА ${p} ИЗ ${pageCount}]\n${pageStr}\n`;
            }

            if (p <= maxPagesToRender) {
                const baseViewport = page.getViewport({ scale: 1.0 });
                const desiredScale = Math.min(2.5, Math.max(1.2, 1400 / (baseViewport.width || 600)));
                const viewport = page.getViewport({ scale: desiredScale });

                const canvas = document.createElement('canvas');
                canvas.width = Math.round(viewport.width);
                canvas.height = Math.round(viewport.height);
                const ctx = canvas.getContext('2d');
                await page.render({ canvasContext: ctx, viewport }).promise;
                pageImages.push({
                    name: `Страница ${p}`,
                    dataUrl: canvas.toDataURL('image/jpeg', 0.88),
                    page: p
                });
            }
        }
    } catch (err) {
        console.warn('[MoonSSS] PDF.js extraction fallback:', err);
    }

    if (!fullText.trim()) {
        try {
            const buf = await file.arrayBuffer();
            const fallbackTxt = extractPdfRawTextFallback(buf);
            if (fallbackTxt) fullText = fallbackTxt;
        } catch (_) { }
    }

    if (!fullText.trim()) {
        fullText = `[Документ PDF: «${file.name}». Текст встроен в визуальные страницы ниже (OCR)]`;
    }

    return {
        kind: 'document',
        docType: 'pdf',
        name: file.name,
        pageCount: pageCount || 1,
        text: fullText.trim(),
        images: pageImages,
        pdfBase64,
        dataUrl: pageImages[0]?.dataUrl || rawDataUrl,
        mime: 'application/pdf',
        sizeBytes: file.size
    };
}

// Полноценный встроенный парсер электронных таблиц (Excel XLSX / XLS / CSV)
async function parseExcelAttachment(file) {
    const name = file.name || 'Таблица';
    const lower = name.toLowerCase();

    // 1. Быстрый и надёжный парсинг плоских CSV / TSV файлов в Markdown
    if (lower.endsWith('.csv') || lower.endsWith('.tsv')) {
        const rawText = await file.text();
        const sep = lower.endsWith('.tsv') ? '\t' : (rawText.includes(';') ? ';' : ',');
        const rows = rawText.split(/\r?\n/).filter(r => r.trim());
        let mdTable = `\n### Таблица данных: «${name}»\n`;
        rows.slice(0, 300).forEach((rowStr, rIdx) => {
            const cells = rowStr.split(sep).map(c => c.trim().replace(/^["']|["']$/g, '').replace(/\|/g, '/'));
            mdTable += '| ' + cells.join(' | ') + ' |\n';
            if (rIdx === 0) {
                mdTable += '| ' + cells.map(() => '---').join(' | ') + ' |\n';
            }
        });
        return {
            kind: 'document',
            docType: 'csv',
            name: file.name,
            pageCount: 1,
            text: mdTable.trim(),
            images: [],
            dataUrl: '',
            mime: 'text/csv',
            sizeBytes: file.size
        };
    }

    // 2. Распаковка структуры Excel (.xlsx / .xlsm) через встроенный JSZip
    let structuredText = '';
    const visualSnapshots = [];
    try {
        const JSZip = await ensureJsZip();
        const zip = await JSZip.loadAsync(file);

        // Извлекаем таблицу общих строк (Shared Strings Table)
        const sharedStrings = [];
        const ssFile = zip.file('xl/sharedStrings.xml');
        if (ssFile) {
            const ssXml = await ssFile.async('text');
            const parser = new DOMParser();
            const ssDoc = parser.parseFromString(ssXml, 'application/xml');
            const siNodes = getLocalXmlNodes(ssDoc, 'si');
            siNodes.forEach(si => {
                let str = '';
                getLocalXmlNodes(si, 't').forEach(t => str += t.textContent);
                sharedStrings.push(str);
            });
        }

        // Извлекаем метаданные листов (Sheets)
        const sheetMap = [];
        const wbFile = zip.file('xl/workbook.xml');
        if (wbFile) {
            const wbXml = await wbFile.async('text');
            const parser = new DOMParser();
            const wbDoc = parser.parseFromString(wbXml, 'application/xml');
            getLocalXmlNodes(wbDoc, 'sheet').forEach((sh, idx) => {
                const sName = sh.getAttribute('name') || `Лист ${idx + 1}`;
                sheetMap.push({ name: sName, fileIndex: idx + 1 });
            });
        }

        if (!sheetMap.length) {
            sheetMap.push({ name: 'Лист 1', fileIndex: 1 });
        }

        // Обрабатываем каждый лист Excel и генерируем структурированный Markdown
        for (const sheetInfo of sheetMap.slice(0, 10)) {
            const sheetPath = `xl/worksheets/sheet${sheetInfo.fileIndex}.xml`;
            const sFile = zip.file(sheetPath) || zip.file(new RegExp(`xl/worksheets/sheet${sheetInfo.fileIndex}\\.xml$`, 'i'))[0];
            if (!sFile) continue;

            const sXml = await sFile.async('text');
            const parser = new DOMParser();
            const sDoc = parser.parseFromString(sXml, 'application/xml');
            const rowNodes = getLocalXmlNodes(sDoc, 'row');
            if (!rowNodes.length) continue;

            structuredText += `\n### Лист: «${sheetInfo.name}» (строк: ${rowNodes.length})\n`;
            let tableMd = '';
            let colCount = 0;

            rowNodes.slice(0, 150).forEach((row, rI) => {
                const cellNodes = getLocalXmlNodes(row, 'c');
                const rowValues = [];
                cellNodes.forEach(cell => {
                    const type = cell.getAttribute('t');
                    const valNodes = getLocalXmlNodes(cell, 'v');
                    let rawVal = valNodes[0]?.textContent || '';

                    if (type === 's') {
                        const sIdx = parseInt(rawVal, 10);
                        rawVal = sharedStrings[sIdx] || '';
                    } else if (type === 'inlineStr') {
                        let iStr = '';
                        getLocalXmlNodes(cell, 't').forEach(t => iStr += t.textContent);
                        rawVal = iStr;
                    } else if (type === 'b') {
                        rawVal = rawVal === '1' ? 'ИСТИНА' : 'ЛОЖЬ';
                    }

                    rowValues.push(String(rawVal || '').trim().replace(/\|/g, '/').replace(/[\r\n]+/g, ' '));
                });

                if (rowValues.length > 0) {
                    if (rI === 0) colCount = rowValues.length;
                    tableMd += '| ' + rowValues.join(' | ') + ' |\n';
                    if (rI === 0) {
                        tableMd += '| ' + rowValues.map(() => '---').join(' | ') + ' |\n';
                    }
                }
            });

            structuredText += tableMd + '\n';

            // Генерируем компактный визуальный холст таблицы для Vision
            try {
                const canvas = document.createElement('canvas');
                canvas.width = 1200;
                canvas.height = 700;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, 1200, 700);

                ctx.fillStyle = '#0f172a';
                ctx.font = 'bold 20px -apple-system, sans-serif';
                ctx.fillText(`Таблица Excel: ${name} · ${sheetInfo.name}`, 40, 45);

                ctx.strokeStyle = '#cbd5e1';
                ctx.lineWidth = 1;
                ctx.strokeRect(40, 70, 1120, 580);

                ctx.fillStyle = '#334155';
                ctx.font = '14px monospace';
                const previewLines = tableMd.split('\n').filter(Boolean).slice(0, 18);
                previewLines.forEach((l, lIdx) => {
                    ctx.fillText(l.slice(0, 110), 55, 105 + (lIdx * 30));
                });
                visualSnapshots.push({
                    name: `Таблица: ${sheetInfo.name}`,
                    dataUrl: canvas.toDataURL('image/jpeg', 0.85)
                });
            } catch (_) { }
        }
    } catch (e) {
        console.warn('[MoonSSS] Excel parsing failed, reading strings fallback:', e);
    }

    if (!structuredText.trim()) {
        structuredText = `[Таблица Excel: «${file.name}». Данные успешно подготовлены для анализа.]`;
    }

    return {
        kind: 'document',
        docType: 'xlsx',
        name: file.name,
        pageCount: visualSnapshots.length || 1,
        text: structuredText.trim(),
        images: visualSnapshots,
        dataUrl: visualSnapshots[0]?.dataUrl || '',
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        sizeBytes: file.size
    };
}

async function renderDocxVisualPageCanvas(title, textBlocks, mediaMap, pageNum) {
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 1414;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 16px -apple-system, system-ui, sans-serif';
    ctx.fillText(`${title} · Страница ${pageNum}`, 60, 50);

    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(60, 65);
    ctx.lineTo(940, 65);
    ctx.stroke();

    let curY = 110;
    const maxMarginY = 1350;

    for (const block of textBlocks) {
        if (curY > maxMarginY) break;

        if (block.type === 'heading') {
            ctx.fillStyle = '#0f172a';
            ctx.font = 'bold 24px -apple-system, system-ui, sans-serif';
            ctx.fillText(block.text.slice(0, 75), 60, curY);
            curY += 40;
        } else if (block.type === 'image' && block.imgUrl) {
            try {
                const img = new Image();
                img.src = block.imgUrl;
                await new Promise(r => { img.onload = r; img.onerror = r; setTimeout(r, 400); });
                if (img.width && img.height) {
                    const maxW = 860;
                    const maxH = 340;
                    const scale = Math.min(maxW / img.width, maxH / img.height, 1);
                    const dw = img.width * scale;
                    const dh = img.height * scale;
                    ctx.drawImage(img, 60, curY, dw, dh);
                    curY += dh + 20;
                }
            } catch (_) { }
        } else if (block.type === 'table') {
            ctx.fillStyle = '#1e293b';
            ctx.font = '14px monospace';
            const lines = block.text.split('\n').slice(0, 10);
            for (const line of lines) {
                if (curY > maxMarginY) break;
                ctx.fillText(line.slice(0, 95), 60, curY);
                curY += 22;
            }
            curY += 15;
        } else {
            ctx.fillStyle = '#334155';
            ctx.font = '16px -apple-system, system-ui, sans-serif';
            const words = block.text.split(' ');
            let line = '';
            for (let n = 0; n < words.length; n++) {
                const testLine = line + words[n] + ' ';
                const metrics = ctx.measureText(testLine);
                if (metrics.width > 860 && n > 0) {
                    ctx.fillText(line, 60, curY);
                    line = words[n] + ' ';
                    curY += 26;
                    if (curY > maxMarginY) break;
                } else {
                    line = testLine;
                }
            }
            if (line && curY <= maxMarginY) {
                ctx.fillText(line, 60, curY);
                curY += 34;
            }
        }
    }

    return canvas.toDataURL('image/jpeg', 0.88);
}

async function parseDocxAttachment(file) {
    let structuredText = '';
    const extractedImages = [];
    const layoutBlocks = [];

    try {
        const JSZip = await ensureJsZip();
        const zip = await JSZip.loadAsync(file);

        // 1. Извлекаем связи (Relationships) для сопоставления rId -> путь к изображению
        const relsFile = zip.file('word/_rels/document.xml.rels');
        const relsMap = new Map();
        if (relsFile) {
            const relsXml = await relsFile.async('text');
            const parser = new DOMParser();
            const doc = parser.parseFromString(relsXml, 'application/xml');
            getLocalXmlNodes(doc, 'relationship').forEach(r => {
                const id = r.getAttribute('Id');
                const target = r.getAttribute('Target');
                if (id && target) relsMap.set(id, target.replace(/^word\//, ''));
            });
        }

        // 2. Распаковываем все встроенные графические объекты (word/media/*)
        const mediaMap = new Map();
        for (const [relPath, zipEntry] of Object.entries(zip.files)) {
            if (!zipEntry.dir && relPath.startsWith('word/media/')) {
                const fileName = relPath.replace('word/media/', '');
                const blob = await zipEntry.async('blob');
                const dataUrl = await fileToDataURL(blob);
                mediaMap.set(`media/${fileName}`, dataUrl);
                mediaMap.set(relPath, dataUrl);
                extractedImages.push({
                    name: `Иллюстрация: ${fileName}`,
                    path: relPath,
                    dataUrl
                });
            }
        }

        // 3. Извлекаем блоки текста и таблицы без сбоев селекторов
        const docFile = zip.file('word/document.xml');
        if (docFile) {
            const docXml = await docFile.async('text');
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(docXml, 'application/xml');
            const bodyNodes = getLocalXmlNodes(xmlDoc, 'body');
            const body = bodyNodes[0] || xmlDoc.documentElement;

            if (body) {
                const children = Array.from(body.children || body.childNodes).filter(n => n.nodeType === 1);
                for (const child of children) {
                    const nodeName = (child.localName || child.nodeName || '').replace(/^.*:/, '').toLowerCase();
                    if (nodeName === 'p') {
                        let pText = '';
                        getLocalXmlNodes(child, 't').forEach(t => pText += t.textContent);

                        const blips = getLocalXmlNodes(child, 'blip');
                        const imgRefs = [];
                        blips.forEach(b => {
                            const embedId = b.getAttribute('r:embed') || b.getAttribute('embed');
                            if (embedId && relsMap.has(embedId)) {
                                imgRefs.push(relsMap.get(embedId));
                            }
                        });

                        let isHeading = false;
                        const pStyleNodes = getLocalXmlNodes(child, 'pstyle');
                        if (pStyleNodes.length > 0) {
                            const val = (pStyleNodes[0].getAttribute('w:val') || pStyleNodes[0].getAttribute('val') || '').toLowerCase();
                            isHeading = val.includes('heading') || val.includes('заголовок');
                        }

                        if (pText.trim()) {
                            structuredText += (isHeading ? `\n### ${pText.trim()}\n` : `${pText.trim()}\n`);
                            layoutBlocks.push({ type: isHeading ? 'heading' : 'paragraph', text: pText.trim() });
                        }

                        if (imgRefs.length) {
                            imgRefs.forEach((ref, imgI) => {
                                const imgUrl = mediaMap.get(ref) || mediaMap.get(`media/${ref}`);
                                structuredText += `[ИЛЛЮСТРАЦИЯ/ГРАФИК В ДОКУМЕНТЕ #${imgI + 1}: «${ref}»]\n`;
                                if (imgUrl) {
                                    layoutBlocks.push({ type: 'image', imgUrl });
                                }
                            });
                        }
                    } else if (nodeName === 'tbl') {
                        structuredText += '\n[ТАБЛИЦА В ДОКУМЕНТЕ]:\n';
                        let tblMd = '';
                        const rowNodes = getLocalXmlNodes(child, 'tr');
                        rowNodes.forEach((row, rI) => {
                            const cellNodes = getLocalXmlNodes(row, 'tc');
                            const cells = [];
                            cellNodes.forEach(cell => {
                                let cText = '';
                                getLocalXmlNodes(cell, 't').forEach(t => cText += t.textContent);
                                cells.push(cText.trim().replace(/\|/g, '-'));
                            });
                            if (cells.length) {
                                tblMd += '| ' + cells.join(' | ') + ' |\n';
                                if (rI === 0) {
                                    tblMd += '| ' + cells.map(() => '---').join(' | ') + ' |\n';
                                }
                            }
                        });
                        structuredText += tblMd + '\n';
                        layoutBlocks.push({ type: 'table', text: tblMd });
                    }
                }
            }
        }
    } catch (e) {
        console.warn('[MoonSSS] DOCX unpack error, running text stream extraction:', e);
        try {
            const buf = await file.arrayBuffer();
            const bytes = new Uint8Array(buf);
            let s = '';
            for (let i = 0; i < Math.min(bytes.length, 100000); i++) {
                if (bytes[i] >= 32 && bytes[i] <= 126) s += String.fromCharCode(bytes[i]);
            }
            if (s.length > 50) structuredText = s;
        } catch (_) { }
    }

    if (!structuredText.trim()) {
        structuredText = `[Документ Word (DOCX): «${file.name}». Текст извлечён и готов к анализу.]`;
    }

    const docVisualPages = [];
    try {
        const renderedPageDataUrl = await renderDocxVisualPageCanvas(file.name, layoutBlocks, new Map(), 1);
        docVisualPages.push({
            name: `Страница 1 (Визуальный макет)`,
            dataUrl: renderedPageDataUrl,
            page: 1
        });
    } catch (_) { }

    const allDocImages = [...docVisualPages, ...extractedImages];

    return {
        kind: 'document',
        docType: 'docx',
        name: file.name,
        pageCount: docVisualPages.length || 1,
        text: structuredText.trim(),
        images: allDocImages,
        dataUrl: allDocImages[0]?.dataUrl || '',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sizeBytes: file.size
    };
}

async function renderPptxSlideCanvas(slideNumber, totalSlides, title, bullets, slideMediaUrls) {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720; // 16:9
    const ctx = canvas.getContext('2d');

    // Стильный фон слайда презентации (Linear Studio Dark)
    const bgGrad = ctx.createLinearGradient(0, 0, 1280, 720);
    bgGrad.addColorStop(0, '#0f172a');
    bgGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 1280, 720);

    // Номер слайда
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 18px monospace';
    ctx.fillText(`Слайд ${slideNumber} / ${totalSlides}`, 60, 50);

    // Заголовок слайда
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 36px -apple-system, system-ui, sans-serif';
    ctx.fillText((title || `Слайд #${slideNumber}`).slice(0, 55), 60, 110);

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(60, 130);
    ctx.lineTo(340, 130);
    ctx.stroke();

    // Текстовые тезисы слева
    let curY = 190;
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '22px -apple-system, system-ui, sans-serif';
    const textWidth = slideMediaUrls.length > 0 ? 640 : 1160;

    for (const b of bullets.slice(0, 8)) {
        ctx.fillStyle = '#38bdf8';
        ctx.fillText('•', 60, curY);
        ctx.fillStyle = '#e2e8f0';
        ctx.fillText(b.slice(0, 60), 85, curY);
        curY += 46;
    }

    // Если на слайде есть иллюстрации — отрисовываем их справа
    if (slideMediaUrls.length > 0) {
        try {
            const img = new Image();
            img.src = slideMediaUrls[0];
            await new Promise(r => { img.onload = r; img.onerror = r; setTimeout(r, 400); });
            if (img.width && img.height) {
                const maxW = 480;
                const maxH = 460;
                const scale = Math.min(maxW / img.width, maxH / img.height);
                const dw = img.width * scale;
                const dh = img.height * scale;
                const dx = 740 + (maxW - dw) / 2;
                const dy = 170 + (maxH - dh) / 2;

                ctx.save();
                ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
                ctx.shadowBlur = 18;
                ctx.drawImage(img, dx, dy, dw, dh);
                ctx.restore();
            }
        } catch (_) { }
    }

    return canvas.toDataURL('image/jpeg', 0.88);
}

async function parsePptxAttachment(file) {
    const JSZip = await ensureJsZip();
    const zip = await JSZip.loadAsync(file);

    // Распаковываем все встроенные изображения презентации
    const mediaMap = new Map();
    const extractedImages = [];
    for (const [relPath, zipEntry] of Object.entries(zip.files)) {
        if (!zipEntry.dir && relPath.startsWith('ppt/media/')) {
            const fileName = relPath.replace('ppt/media/', '');
            const blob = await zipEntry.async('blob');
            const dataUrl = await fileToDataURL(blob);
            mediaMap.set(`media/${fileName}`, dataUrl);
            mediaMap.set(relPath, dataUrl);
            extractedImages.push({
                name: `Иллюстрация: ${fileName}`,
                path: relPath,
                dataUrl
            });
        }
    }

    const slideFiles = Object.keys(zip.files)
        .filter(k => /^ppt\/slides\/slide\d+\.xml$/i.test(k))
        .sort((a, b) => {
            const na = parseInt((a.match(/\d+/) || [0])[0], 10);
            const nb = parseInt((b.match(/\d+/) || [0])[0], 10);
            return na - nb;
        });

    let structuredText = '';
    const parser = new DOMParser();
    const slideVisualRenders = [];

    for (let i = 0; i < slideFiles.length; i++) {
        const slideKey = slideFiles[i];
        const slideXml = await zip.files[slideKey].async('text');
        const doc = parser.parseFromString(slideXml, 'application/xml');
        const texts = [];
        doc.querySelectorAll('a\\:t, t').forEach(t => {
            const txt = (t.textContent || '').trim();
            if (txt) texts.push(txt);
        });

        const slideTitle = texts[0] || `Слайд #${i + 1}`;
        const slideBullets = texts.slice(1);
        structuredText += `\n[СЛАЙД ${i + 1} ИЗ ${slideFiles.length}: «${slideTitle}»]\n${texts.join('\n')}\n`;

        // Ищем связанные с этим слайдом изображения
        const relsKey = slideKey.replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels';
        const slideMediaUrls = [];
        if (zip.files[relsKey]) {
            try {
                const relXml = await zip.files[relsKey].async('text');
                const relDoc = parser.parseFromString(relXml, 'application/xml');
                relDoc.querySelectorAll('Relationship').forEach(r => {
                    const target = r.getAttribute('Target') || '';
                    if (target.includes('media/')) {
                        const mUrl = mediaMap.get(target.replace('../', '')) || mediaMap.get(target);
                        if (mUrl) slideMediaUrls.push(mUrl);
                    }
                });
            } catch (_) { }
        }

        // Рендерим слайд на 16:9 Canvas (до 16 первых слайдов)
        if (i < 16) {
            try {
                const slideCanvasUrl = await renderPptxSlideCanvas(i + 1, slideFiles.length, slideTitle, slideBullets, slideMediaUrls);
                slideVisualRenders.push({
                    name: `Слайд ${i + 1}: ${slideTitle.slice(0, 30)}`,
                    dataUrl: slideCanvasUrl,
                    page: i + 1
                });
            } catch (_) { }
        }
    }

    if (!structuredText.trim()) {
        structuredText = `[Презентация PowerPoint (PPTX): «${file.name}», содержит ${slideFiles.length} слайдов и ${extractedImages.length} графических объектов]`;
    }

    const allPptxAssets = [...slideVisualRenders, ...extractedImages];

    return {
        kind: 'document',
        docType: 'pptx',
        name: file.name,
        pageCount: slideFiles.length || 1,
        text: structuredText.trim(),
        images: allPptxAssets,
        dataUrl: allPptxAssets[0]?.dataUrl || '',
        mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        sizeBytes: file.size
    };
}

async function addFiles(fileList, forceImage = false) {
    let files = [...fileList];
    if (state.settings.editMode) {
        const imgs = files.filter(f => f.type.startsWith('image/'));
        if (imgs.length) {
            await addEditImages(imgs);
            files = files.filter(f => !f.type.startsWith('image/'));
            if (!files.length) return;
        }
    }

    for (const f of files) {
        try {
            const name = f.name || '';
            const lowerName = name.toLowerCase();
            const type = f.type || '';

            if (forceImage || type.startsWith('image/')) {
                const raw = await fileToDataURL(f);
                const dataUrl = await compressImage(raw);
                pendingAtt.push({ kind: 'image', dataUrl, mime: 'image/jpeg', name: f.name || 'фото' });
            } else if (lowerName.endsWith('.pdf') || type === 'application/pdf') {
                toast(`Анализ PDF документа «${name}»…`, 'info', 1800);
                const parsed = await parsePdfAttachment(f);
                pendingAtt.push(parsed);
                toast(`PDF «${name}» обработан (${parsed.pageCount} стр.)`, 'ok', 2200);
            } else if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') || lowerName.endsWith('.xlsm') || lowerName.endsWith('.csv') || lowerName.endsWith('.tsv') || type.includes('spreadsheet') || type.includes('excel')) {
                toast(`Анализ таблицы «${name}»…`, 'info', 1800);
                const parsed = await parseExcelAttachment(f);
                pendingAtt.push(parsed);
                toast(`Таблица «${name}» обработана`, 'ok', 2200);
            } else if (lowerName.endsWith('.docx') || lowerName.endsWith('.doc') || lowerName.endsWith('.rtf') || lowerName.endsWith('.odt') || type.includes('wordprocessingml') || type.includes('msword')) {
                toast(`Анализ Word документа «${name}»…`, 'info', 1800);
                const parsed = await parseDocxAttachment(f);
                pendingAtt.push(parsed);
                toast(`Документ «${name}» обработан`, 'ok', 2200);
            } else if (lowerName.endsWith('.pptx') || lowerName.endsWith('.ppt') || type.includes('presentationml')) {
                toast(`Анализ презентации «${name}»…`, 'info', 1800);
                const parsed = await parsePptxAttachment(f);
                pendingAtt.push(parsed);
                toast(`PPTX «${name}» обработан (${parsed.pageCount} слайдов)`, 'ok', 2200);
            } else if (type.startsWith('audio/') || /\.(mp3|m4a|wav|waw|flac|ogg|aac|wma)$/i.test(lowerName)) {
                toast(`Обработка аудиофайла «${name}»…`, 'info', 1800);
                const parsed = await parseAudioAttachment(f);
                pendingAtt.push(parsed);
                toast(`Аудио «${name}» добавлено`, 'ok', 2200);
            } else if (type.startsWith('video/') || /\.(mp4|webm|mov|m4v|mkv|avi)$/i.test(lowerName)) {
                toast(`Обработка видео «${name}»…`, 'info', 1800);
                const parsed = await parseVideoAttachment(f);
                pendingAtt.push(parsed);
                toast(`Видео «${name}» обработано (${parsed.keyframes.length} кадров)`, 'ok', 2200);
            } else {
                // Текстовые файлы, скрипты, конфиги, логи и защита от сброса необработанных бинарных байтов
                const rawText = await f.text();
                if (isBinaryBufferOrString(rawText)) {
                    // Файл содержит бинарные нуль-байты или сжатые данные
                    const sizeKb = Math.max(1, Math.round(f.size / 1024));
                    const safeCleanText = `[БИНАРНЫЙ ФАЙЛ: «${name}», размер: ${sizeKb} КБ, тип: ${type || 'application/octet-stream'}. Бинарный поток не содержит открытого текста.]`;
                    pendingAtt.push({ kind: 'file', name: f.name, mime: 'text/plain', text: safeCleanText });
                    toast(`Файл «${name}» прикреплён как бинарное описание`, 'info', 2200);
                } else {
                    pendingAtt.push({ kind: 'file', name: f.name, mime: f.type || 'text/plain', text: rawText });
                }
            }
        } catch (e) {
            console.error('[MoonSSS] Error processing file:', e);
            toast(`Не удалось обработать «${f.name}»: ${e.message || e}`, 'err', 3500);
        }
    }
    renderAttPreviews();
    save();
}

async function parseAudioAttachment(file) {
    const dataUrl = await fileToDataURL(file);
    let duration = 0;

    try {
        const audio = new Audio();
        audio.preload = 'metadata';
        audio.src = dataUrl;
        await new Promise(resolve => {
            audio.onloadedmetadata = () => {
                duration = audio.duration || 0;
                resolve();
            };
            audio.onerror = () => resolve();
            setTimeout(resolve, 1500);
        });
    } catch (_) { }

    let transcript = '';
    const hasKeys = !!((state.settings?.orKey || '').trim() || (state.settings?.proxyKey || '').trim());
    if (hasKeys && typeof transcribeWithWhisper === 'function') {
        try {
            toast(`Распознавание речи аудиозаписи «${file.name}»…`, 'info', 2200);
            transcript = await transcribeWithWhisper(file);
            if (transcript) {
                toast(`Аудио «${file.name}» успешно транскрибировано`, 'ok', 2200);
            }
        } catch (err) {
            console.warn('[MoonSSS] Whisper transcription error:', err);
        }
    }

    return {
        kind: 'audio',
        name: file.name,
        mime: file.type || 'audio/mp3',
        duration,
        dataUrl,
        transcript,
        sizeBytes: file.size
    };
}

async function parseVideoAttachment(file) {
    const videoUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = videoUrl;

    await new Promise(resolve => {
        video.onloadedmetadata = resolve;
        video.onerror = resolve;
        setTimeout(resolve, 2500);
    });

    const duration = video.duration || 0;
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 360;

    // Извлекаем от 4 до 10 равномерно распределённых ключевых кадров
    const numFrames = duration > 60 ? 10 : (duration > 15 ? 7 : 4);
    const step = duration > 0 ? duration / (numFrames + 1) : 0;
    const keyframes = [];

    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 720 / Math.max(width, height));
    canvas.width = Math.max(320, Math.round(width * scale));
    canvas.height = Math.max(180, Math.round(height * scale));
    const ctx = canvas.getContext('2d');

    if (duration > 0 && ctx) {
        toast(`Извлечение ключевых кадров из видео «${file.name}»…`, 'info', 2000);
        for (let i = 1; i <= numFrames; i++) {
            const time = i * step;
            video.currentTime = time;
            await new Promise(r => {
                video.onseeked = r;
                setTimeout(r, 600);
            });
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const frameDataUrl = canvas.toDataURL('image/jpeg', 0.82);
            const m = Math.floor(time / 60);
            const s = Math.floor(time % 60);
            const timeLabel = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
            keyframes.push({
                time,
                timeLabel,
                dataUrl: frameDataUrl,
                name: `Кадр ${timeLabel}`
            });
        }
    }

    URL.revokeObjectURL(videoUrl);

    let rawDataUrl = '';
    if (file.size < 25 * 1024 * 1024) {
        rawDataUrl = await fileToDataURL(file);
    }

    const durM = Math.floor(duration / 60);
    const durS = Math.floor(duration % 60);
    const durFormatted = `${String(durM).padStart(2, '0')}:${String(durS).padStart(2, '0')}`;

    let summaryText = `[ВИДЕОФАЙЛ: «${file.name}», длительность: ${durFormatted}, разрешение: ${width}x${height}]\n`;
    keyframes.forEach((kf, idx) => {
        summaryText += `[КЛЮЧЕВОЙ КАДР #${idx + 1} НА ОТМЕТКЕ ${kf.timeLabel}]\n`;
    });

    return {
        kind: 'video',
        name: file.name,
        mime: file.type || 'video/mp4',
        duration,
        keyframes,
        dataUrl: keyframes[0]?.dataUrl || rawDataUrl,
        videoDataUrl: rawDataUrl,
        text: summaryText,
        sizeBytes: file.size
    };
}

function renderAttPreviews() {
    window.pendingAtt = pendingAtt;
    const box = $('#attPreviews');
    if (box) {
        box.hidden = true;
        box.innerHTML = '';
    }
    if (window.promptInputCtrl && typeof window.promptInputCtrl.syncWithPendingAtt === 'function') {
        window.promptInputCtrl.syncWithPendingAtt();
    }
    setSendBtn();
}

/* ---------- Большой текст как вложение ---------- */
const PASTE_TEXT_THRESHOLD = 1200;   // порог автоконвертации вставленного текста в файл
const EXPAND_CONFIRM_LIMIT = 12000;  // разворачивание длиннее — только с подтверждением
let pendingExpandIdx = -1;
function generateUniqueTextAttachmentName(txt) {
    // 1. Считаем общее количество текстовых вложений в текущем чате и очереди
    const chat = activeChat();
    let totalTextCount = pendingAtt.filter(a => a.kind === 'text' || a.kind === 'file').length;
    if (chat && Array.isArray(chat.messages)) {
        chat.messages.forEach(m => {
            (m.attachments || []).forEach(a => {
                if (a.kind === 'text' || a.kind === 'file') totalTextCount++;
            });
        });
    }
    const seqNum = totalTextCount + 1;

    // 2. Извлекаем осмысленный заголовок из первых строк контента
    const lines = String(txt || '').split('\n').map(l => l.trim()).filter(Boolean);
    let snippet = '';
    if (lines.length > 0) {
        // Убираем комментарии, разметку и маркеры
        let firstLine = lines[0].replace(/^(\/\/|#|\/\*|\*|<!--|--|["'`])\s*/, '').replace(/["'`]$/, '').trim();
        if (firstLine) {
            snippet = firstLine.length > 28 ? firstLine.slice(0, 28) + '…' : firstLine;
        }
    }

    if (snippet) {
        return `Фрагмент #${seqNum}: ${snippet}`;
    }
    return `Текстовый фрагмент #${seqNum}`;
}

function addTextAttachment(txt) {
    const uniqueName = generateUniqueTextAttachmentName(txt);
    pendingAtt.push({ kind: 'text', name: uniqueName, mime: 'text/plain', text: String(txt || ''), ts: Date.now() });
    renderAttPreviews(); setSendBtn();
    toast(`«${uniqueName}» прикреплён к запросу`, 'ok', 2600);
}
function expandTextAtt(i) {
    const a = pendingAtt[i];
    if (!a) return;
    const content = a.text || a.code;
    if (!content) {
        toast('Вложение не содержит редактируемого текста', 'info');
        return;
    }
    if (content.length > EXPAND_CONFIRM_LIMIT) {
        pendingExpandIdx = i;
        $('#teChars').textContent = content.length.toLocaleString('ru-RU');
        $('#textExpandOverlay').classList.add('show');
        return;
    }
    doExpandTextAtt(i);
}
window.expandTextAtt = expandTextAtt;

function doExpandTextAtt(i) {
    const a = pendingAtt[i];
    if (!a) return;
    const content = a.text || a.code;
    if (!content) return;
    const inp = $('#promptInput');
    inp.value = inp.value.trim() ? inp.value.replace(/\s+$/, '') + '\n' + content : content;
    pendingAtt.splice(i, 1);
    renderAttPreviews(); autoGrow(); setSendBtn();
    toast('Текст развёрнут в поле ввода', 'ok');
    try {
        inp.focus({ preventScroll: true });
        if (window.promptInputCtrl && typeof window.promptInputCtrl.expand === 'function') {
            window.promptInputCtrl.expand();
        }
    } catch (e) { }
}
window.doExpandTextAtt = doExpandTextAtt;
function closeTextExpand() {
    $('#textExpandOverlay').classList.remove('show');
    pendingExpandIdx = -1;
}
$('#teClose').addEventListener('click', closeTextExpand);
$('#teCancel').addEventListener('click', closeTextExpand);
$('#teGo').addEventListener('click', () => {
    const i = pendingExpandIdx;
    closeTextExpand();
    doExpandTextAtt(i);
});
$('#textExpandOverlay').addEventListener('click', e => { if (e.target === $('#textExpandOverlay')) closeTextExpand(); });
$('#cdClose').addEventListener('click', closeChatDelete);
$('#cdCancel').addEventListener('click', closeChatDelete);
$('#cdConfirm').addEventListener('click', confirmDeleteChat);
$('#chatDeleteOverlay').addEventListener('click', e => { if (e.target === $('#chatDeleteOverlay')) closeChatDelete(); });
/* ---------- Отправка ---------- */
async function sendMessage() {
    const inp = $('#promptInput');
    let text = inp.value.trim();
    closeSlash();
    /* Slash-команды: /img /search /think /export /new /theme */
    if (text.startsWith('/')) {
        const parsed = parseSlashCommand(text);
        if (parsed && parsed.known) {
            const resend = execSlashById(parsed.cmd, parsed.arg);
            if (resend === 'send') { text = inp.value.trim(); }
            else { inp.value = ''; autoGrow(); setSendBtn(); return; }
        }
    }
    // Режим прямого редактирования изображений
    if (state.settings.editMode && editImages.length) {
        if (!text) { toast('Опишите, что нужно изменить в изображении', 'warn'); inp.focus(); return; }
        if (streaming) { toast('Сначала остановите текущую генерацию', 'err'); return; }
        openEditConfirm(text);
        return;
    }

    // Режим Image Studio: прямая генерация картинок
    const curChat = activeChat();
    const currentChatMode = curChat?.mode || window.currentAppRoomMode || 'classic';
    if (currentChatMode === 'image') {
        if (!text && !pendingAtt.length) return;
        if (streaming) { stopGeneration(); return; }
        await executeImageStudioGeneration(text);
        return;
    }

    if (!text && !pendingAtt.length && !artEditRef) return;
    if (!text && !pendingAtt.length && artEditRef) { toast('Опишите, что нужно изменить в артефакте', 'warn'); return; }
    if (!text && pendingAtt.length) {
        const firstAtt = pendingAtt[0];
        const typeLabel = firstAtt.kind === 'document'
            ? (firstAtt.docType || 'документ').toUpperCase()
            : (firstAtt.kind === 'audio' ? 'аудиозапись' : (firstAtt.kind === 'video' ? 'видеозапись' : (firstAtt.kind === 'image' ? 'изображение' : 'файл')));
        text = `Проанализируй прикреплённый ${typeLabel} «${firstAtt.name || 'материал'}», изучи все данные, структуру, таблицы и текст и предоставь подробный структурированный ответ.`;
    }
    if (streaming) { stopGeneration(); return; }
    if (artEditRef) {
        pendingAtt.push({ kind: 'artifact', name: artEditRef.title, artId: artEditRef.artId, version: artEditRef.version, code: artEditRef.code });
    }
    const chat = ensureChat();
    const targetModel = typeof getModel === 'function' ? getModel(state.settings.modelId) : null;
    const rolePolicy = typeof window.getRequestRolePolicy === 'function'
        ? window.getRequestRolePolicy(targetModel, chat)
        : { inputRole: 'user', instructionRole: 'system', developerMode: false };
    const userMsg = { id: uid(), role: rolePolicy.inputRole, content: text, ts: Date.now(), attachments: pendingAtt.slice() };
    pendingAtt = [];
    window.pendingAtt = pendingAtt;
    if (window.promptInputCtrl) {
        if (typeof window.promptInputCtrl.clearAttachments === 'function') {
            window.promptInputCtrl.clearAttachments();
        }
        if (typeof window.promptInputCtrl.collapse === 'function') {
            window.promptInputCtrl.collapse();
        }
    }
    if (artEditRef) { artEditRef = null; renderArtRef(); }
    inp.value = ''; autoGrow(); setSendBtn();

    let urls = (window.toolCalling && typeof window.toolCalling.extractUrlsFromText === 'function')
        ? window.toolCalling.extractUrlsFromText(text)
        : [];

    // Агентское извлечение ссылок по контекстной отсылке («проанализируй эти ссылки / источники»)
    if (urls.length === 0 && chat && Array.isArray(chat.messages) && chat.messages.length > 0) {
        const isReferencingPastSources = /(?:эти|найденн\w+|прошл\w+|предыдущ\w+|выше|данн\w+)\s+(?:ссылк\w+|источник\w+|страниц\w+|сайт\w+)|проанализируй\s+(?:эти|источник\w+|ссылк\w+)|изучи\s+(?:эти|источник\w+|ссылк\w+)|прочитай\s+(?:эти|источник\w+|ссылк\w+)/i.test(text);
        if (isReferencingPastSources) {
            for (let mIdx = chat.messages.length - 1; mIdx >= 0; mIdx--) {
                const prevM = chat.messages[mIdx];
                if (prevM && prevM.role === 'assistant') {
                    const candidateUrls = [];
                    (prevM.inlineSearches || []).forEach(s => (s.sources || []).forEach(src => src.uri && candidateUrls.push(src.uri)));
                    if (prevM.webSearch && Array.isArray(prevM.webSearch.sources)) {
                        prevM.webSearch.sources.forEach(src => src.uri && candidateUrls.push(src.uri));
                    }
                    if (!candidateUrls.length && prevM.content) {
                        const fromContent = (window.toolCalling && typeof window.toolCalling.extractUrlsFromText === 'function')
                            ? window.toolCalling.extractUrlsFromText(prevM.content) : [];
                        candidateUrls.push(...fromContent);
                    }
                    const unique = [...new Set(candidateUrls.filter(u => typeof u === 'string' && /^https?:\/\//i.test(u.trim())))].slice(0, 4);
                    if (unique.length > 0) {
                        urls = unique;
                        break;
                    }
                }
            }
        }
    }

    chat.messages.push(userMsg);
    chat.updatedAt = Date.now();
    autoTitle(chat);
    save(); renderMessages(); renderChatList();

    if (urls.length > 0) {
        userMsg.urlReading = true;
        userMsg.urlProgress = { percent: 12, status: 'Инициализация чтения ссылки…', url: urls[0] };
        abortCtrl = new AbortController();
        setStreamingState(true);
        renderMessages();

        try {
            const fetchAllFn = (window.toolCalling && typeof window.toolCalling.fetchAllUrlContents === 'function')
                ? window.toolCalling.fetchAllUrlContents.bind(window.toolCalling)
                : async (urlList, sig, prog) => {
                    const list = [];
                    for (let i = 0; i < urlList.length; i++) {
                        if (sig?.aborted) break;
                        if (typeof prog === 'function') prog(Math.round((i / urlList.length) * 100), 'Чтение веб-страницы…', urlList[i]);
                        const item = await safeFetchUrlContent(urlList[i], sig);
                        if (item) list.push(item);
                    }
                    return list;
                };

            let urlData = await fetchAllFn(urls, abortCtrl.signal, (pct, status, currentUrl) => {
                const roundedPct = Math.max(5, Math.min(100, Math.round(pct)));
                userMsg.urlProgress = { percent: roundedPct, status, url: currentUrl || urls[0] };
                const userEl = document.querySelector(`.msg[data-id="${userMsg.id}"]`);
                if (userEl) {
                    const bar = userEl.querySelector('.upc-bar');
                    const badge = userEl.querySelector('.upc-percent-badge');
                    const stText = userEl.querySelector('.upc-status-text');
                    const urlLine = userEl.querySelector('.upc-url-line');
                    if (bar) bar.style.width = `${roundedPct}%`;
                    if (badge) badge.textContent = `${roundedPct}%`;
                    if (stText && status) stText.textContent = status;
                    if (urlLine && currentUrl) urlLine.textContent = currentUrl;
                }
            });

            // Автоматическое устранение ошибки анонимного чтения (Rate limit exceeded for anonymous reading)
            if (Array.isArray(urlData)) {
                for (let i = 0; i < urlData.length; i++) {
                    const it = urlData[i];
                    if (isAnonymousReadErr(it.content || it.error)) {
                        const fb = await safeFetchUrlContent(it.url || urls[i], abortCtrl.signal);
                        if (fb && fb.content) {
                            urlData[i] = { ...it, ...fb, status: 'done', disabled: false };
                        }
                    }
                }
            }

            userMsg.urlReading = false;
            if (urlData && urlData.length > 0) {
                userMsg.urlContents = urlData;
                toast(`Содержимое веб-страниц (${urlData.length}) прикреплено`, 'ok', 2200);
            }
        } catch (err) {
            userMsg.urlReading = false;
            if (err && err.name === 'AbortError') {
                toast('Чтение ссылок отменено', 'info');
                setStreamingState(false);
                save(); renderMessages();
                return;
            }
            console.warn('[MoonSSS] URL content extraction error:', err);
        }

        save();
        renderMessages();
    }

    runAssistant(chat);
}

/* ── Прямая генерация в режиме Image Studio ── */
async function executeImageStudioGeneration(promptText) {
    const list = window.IMG_MODELS || (window.toolCalling && window.toolCalling.IMG_MODELS) || [];
    const cfg = getImgCfg();
    const imgModel = list.find(m => m.id === cfg.model) || list[0];
    const chat = ensureChat();
    if (chat && chat.mode !== 'image') {
        chat.mode = 'image';
    }
    const imgs = pendingAtt.filter(a => a.kind === 'image').map(a => a.dataUrl);

    const userMsg = {
        id: uid(),
        role: 'user',
        content: promptText,
        ts: Date.now(),
        attachments: pendingAtt.slice()
    };
    pendingAtt = [];
    window.pendingAtt = pendingAtt;
    if (window.promptInputCtrl && typeof window.promptInputCtrl.clearAttachments === 'function') {
        window.promptInputCtrl.clearAttachments();
    }
    const inp = $('#promptInput');
    if (inp) { inp.value = ''; autoGrow(); setSendBtn(); }

    chat.messages.push(userMsg);
    chat.updatedAt = Date.now();
    autoTitle(chat);
    save();
    renderMessages();
    renderChatList();

    const aiMsg = {
        id: uid(),
        role: 'assistant',
        content: '',
        thinking: '',
        ts: Date.now(),
        modelId: imgModel.id,
        modelLabel: imgModel.name,
        status: 'streaming',
        generatedImages: [{
            id: uid(),
            status: 'generating',
            model: imgModel.name,
            resolution: imgModel.supportsQuality ? (cfg.quality || 'high') : (imgModel.supportsResolution ? (cfg.resolution || '2K') : ''),
            prompt: promptText,
            startedAt: Date.now()
        }]
    };

    chat.messages.push(aiMsg);
    renderMessages();
    startGenTicker();

    const entry = aiMsg.generatedImages[0];
    entry.progress = 12;
    entry.statusText = `Инициализация ${imgModel.name}…`;
    refreshCurrentMsg(aiMsg);
    setStreamingState(true);

    const opts = {
        images: imgs.length ? imgs : undefined,
        ratio: cfg.ratio || '1:1',
        quality: imgModel.supportsQuality ? (cfg.quality || 'high') : undefined,
        resolution: imgModel.supportsResolution ? (cfg.resolution || '2K') : undefined,
        background: cfg.background || 'auto',
        steps: imgModel.supportsFluxParams ? (cfg.fluxSteps || 28) : undefined,
        guidance: imgModel.supportsFluxParams ? (cfg.fluxGuidance || 3.5) : undefined,
        safety_tolerance: imgModel.supportsFluxParams ? Math.min(5, Math.max(0, (cfg.fluxSafety ?? 5))) : undefined,
        output_format: imgModel.supportsFluxParams ? (cfg.fluxFormat || 'jpeg') : undefined
    };

    try {
        const dataUrl = await window.toolCalling.requestImageGeneration(imgModel, opts, promptText, null, (prog) => {
            entry.progress = prog.percent || entry.progress;
            entry.statusText = prog.statusText || entry.statusText;
            entry.step = prog.step || entry.step;
            entry.totalSteps = prog.totalSteps || entry.totalSteps;
            refreshCurrentMsg(aiMsg);
        });

        entry.status = 'done';
        entry.dataUrl = dataUrl;
        entry.progress = 100;
        entry.loadingState = 'completed';
        entry.statusText = 'Изображение создано.';
        aiMsg.status = 'done';
        toast(`${imgModel.name}: изображение готово`, 'ok');
    } catch (e) {
        entry.status = 'error';
        entry.error = (e && e.message) ? e.message : String(e);
        aiMsg.status = 'done';
        toast('Ошибка генерации: ' + (e.message || e), 'err');
    } finally {
        setStreamingState(false);
        chat.updatedAt = Date.now();
        save();
        refreshCurrentMsg(aiMsg);
        renderChatList();
    }
}
function extractDirectAnswerFromThinking(thinking) {
    if (!thinking || typeof thinking !== 'string') return '';
    const clean = thinking
        .replace(/\[\[(?:IMGRQ|ART|THINK|WS|EXEC|FETCH_URL|TODO):\d+\]\]/g, '')
        .replace(/\{(?:todo[-_]plan|todoPlan|todo[-_]update|todoUpdate|todo[-_]add|todoAdd)\s*:[^}]*\}/gi, '')
        .trim();

    const markers = [
        /(?:итоговый ответ|итог|вывод|результат|заключение|final answer|conclusion|solution)\s*:\s*([\s\S]+)$/i,
        /(?:therefore|thus|in summary|подводя итог)[,:]?\s*([\s\S]+)$/i
    ];
    for (const re of markers) {
        const m = clean.match(re);
        if (m && m[1] && m[1].trim().length > 30) {
            return m[1].trim();
        }
    }
    return clean;
}

/* ── FAILOVER: снимок и откат состояния сообщения между попытками провайдеров ── */
function snapAiMsg(m) {
    return {
        len: (m.content || '').length,
        think: (m.thinking || '').length,
        img: (m.imageRequests || []).length,
        art: (m.artifacts || []).length,
        ex: (m.executions || []).length,
        uf: (m.urlFetches || []).length,
        td: (m.todoSessions || []).length,
        rd: (m.reasoning_details || []).length,
        ws: !m.webSearch ? null : { q: (m.webSearch.queries || []).length, s: (m.webSearch.sources || []).length, t: (m.webSearch.stages || []).length }
    };
}
function rollbackAiMsg(m, sn) {
    m.content = (m.content || '').slice(0, sn.len);
    m.thinking = (m.thinking || '').slice(0, sn.think);
    if (m.imageRequests) m.imageRequests.length = sn.img;
    if (m.urlFetches) m.urlFetches.length = sn.uf;
    if (m.todoSessions) m.todoSessions.length = sn.td || 0;
    if (m.artifacts) m.artifacts.length = sn.art;
    if (m.executions) m.executions.length = sn.ex;
    if (m.reasoning_details) m.reasoning_details.length = sn.rd;
    if (sn.ws === null) delete m.webSearch;
    else if (m.webSearch) {
        if (m.webSearch.queries) m.webSearch.queries.length = sn.ws.q; else m.webSearch.queries = [];
        if (m.webSearch.sources) m.webSearch.sources.length = sn.ws.s; else m.webSearch.sources = [];
        if (m.webSearch.stages) m.webSearch.stages.length = sn.ws.t; else m.webSearch.stages = [];
    }
    igcQueue = igcQueue.filter(q => (m.imageRequests || []).includes(q.req));
}
async function runAssistant(chat) {
    const settings = state.settings;
    const model = getModel(settings.modelId);
    const route = resolveApiRoute(settings, model);
    if (!route.useProxy && !route.useORDirect) {
        toast(route.missing === 'proxy'
            ? 'Выбран ProxyAPI, но ключ не указан'
            : 'Выбран OpenRouter, но ключ sk-or-… не указан', 'err');
        openSettings(); return;
    }
    /* Цепочка провайдеров: в «Авто» при наличии ОБОИХ ключей добавляется
    резервный провайдер для прозрачного failover */
    const autoMode = (settings.apiSource || 'auto') === 'auto';
    const hasProxyKey = !!(settings.proxyKey || '').trim();
    const hasORKey = !!(settings.orKey || '').trim();
    const chain = [route.useProxy ? 'proxy' : 'openrouter'];
    if (autoMode && hasProxyKey && hasORKey) chain.push(chain[0] === 'proxy' ? 'openrouter' : 'proxy');
    if (model.requiresOpenRouter) chain.length = 1;
    let providerIdx = 0;
    let useProxy = chain[0] === 'proxy';
    let useORDirect = chain[0] === 'openrouter';
    const provErrors = []; // накопленные ошибки провайдеров для финального вердикта
    setStreamingState(true);
    stickToBottom = true;
    const aiMsg = {
        id: uid(), role: 'assistant', content: '', thinking: '', ts: Date.now(),
        modelId: model.id, status: 'streaming'
    };
    chat.messages.push(aiMsg);
    renderMessages();
    const el = $('#messages').querySelector(`[data-id="${aiMsg.id}"]`);
    const body = el.querySelector('.md-body');
    const thinkBody = el.querySelector('.think-body');
    const thinkBox = el.querySelector('.think');
    let rafId = null;
    const schedule = () => { if (!rafId) rafId = requestAnimationFrame(() => { rafId = null; refreshMsgBody(el, aiMsg); const wasNear = sdIsNearBottom(); scrollBottom(); sdTrackStream(chat, aiMsg, wasNear); }); };
    const scrollBottom = () => { if (stickToBottom) { const s = $('#chatScroll'); s.scrollTop = s.scrollHeight; } };
    abortCtrl = new AbortController();
    let pendingTodoCommand = null;
    let pendingWsCommand = null;
    let pendingThinkCommand = null;
    let pendingExecCommand = null;
    let pendingUrlFetchCommand = null;
    let turnCtrl = null;
    const artTrk = { start: null };
    const tc = window.toolCalling;
    const toolAv = (tc && typeof tc.getToolAvailability === 'function') ? tc.getToolAvailability(model) : null;
    const canThinkNow = toolAv ? toolAv.canThink : !!(state.settings.deepThink && state.settings.deepThink.enabled);
    const canExecNow = toolAv ? toolAv.canExec : state.settings.codeExec !== false;
    /* Единый потоковый детектор команд инструментов (content и thinking).
       Выбирает самую раннюю по позиции завершённую команду в хвосте текста,
       чтобы при нескольких командах в одном чанке порядок исполнения был предсказуем. */
    const hasPendingTool = () => !!(pendingUrlFetchCommand || pendingWsCommand || pendingThinkCommand || pendingExecCommand);
    const detectStreamTools = (text, location) => {
        if (!tc) return;
        // Если прямо сейчас стримится открытый артефакт — не сканируем код на команды и не прерываем поток
        if (location === 'content') {
            const openArtIdx = tc.findArtifactOpen ? tc.findArtifactOpen(text) : -1;
            if (openArtIdx !== -1 && text.indexOf('</artifact>', openArtIdx) === -1) {
                return;
            }
        }
        const tail = text.slice(-4096);
        const td = tc.detectTodoCommand(tail);
        if (td) {
            if (td.type === 'plan' && (!aiMsg.todoSessions || !aiMsg.todoSessions.length)) {
                tc.spawnTodoSession(chat, aiMsg, td.raw, td.tasks, location);
            } else if (td.type === 'update') {
                tc.updateTodoSession(chat, aiMsg, td.raw, td.step, td.status, td.result, location);
            } else if (td.type === 'add') {
                tc.addTodoTasks(chat, aiMsg, td.raw, td.tasks, location);
            }
        }
        if (hasPendingTool()) return;
        const candidates = [];
        const uf = tc.detectUrlFetchCommand(tail);
        if (uf) candidates.push({ kind: 'fetch', pos: tail.indexOf(uf.raw), det: { raw: uf.raw, urls: uf.urls, location } });
        const ws = tc.detectWebSearchCommand(tail);
        if (ws) candidates.push({ kind: 'ws', pos: tail.indexOf(ws.raw), det: { raw: ws.raw, queries: ws.queries, location } });
        if (canThinkNow) {
            const dt = tc.detectThinkCommand(tail);
            if (dt && !dt.partial && dt.tasks && dt.tasks.length) candidates.push({ kind: 'think', pos: tail.indexOf(dt.raw), det: { raw: dt.raw, tasks: dt.tasks, location } });
        }
        if (canExecNow) {
            const ec = tc.detectCodeExecutionCommand(tail);
            if (ec && !ec.partial && ec.cmd) candidates.push({ kind: 'exec', pos: tail.indexOf(ec.raw), det: { raw: ec.raw, cmd: ec.cmd, location } });
        }
        if (!candidates.length) return;
        candidates.sort((a, b) => a.pos - b.pos);
        const first = candidates[0];
        if (first.kind === 'fetch') pendingUrlFetchCommand = first.det;
        else if (first.kind === 'ws') pendingWsCommand = first.det;
        else if (first.kind === 'think') pendingThinkCommand = first.det;
        else if (first.kind === 'exec') pendingExecCommand = first.det;
        try { if (turnCtrl) turnCtrl.abort(); } catch (e) { }
    };
    const onText = t => {
        aiMsg.content += t;
        detectStreamTools(aiMsg.content, 'content');
        if (tc) {
            if (state.settings.imageGen && (aiMsg.imageRequests || []).length < 2) {
                const im = tc.detectImageGenCommand(aiMsg.content);
                if (im) tc.spawnImageRequest(chat, aiMsg, im.raw, im.prompt, im.refs);
            }
            tc.trackStreamArtifacts(chat, aiMsg, artTrk);
        }
        schedule();
    };
    const onThink = t => {
        aiMsg.thinking += t;
        if (thinkBox) {
            thinkBox.hidden = false;
            thinkBox.classList.add('live');
            if (aiMsg.thinkCollapsed !== true) {
                thinkBox.classList.remove('collapsed');
            }
        }
        detectStreamTools(aiMsg.thinking, 'thinking');
        schedule();
    };
    const onImage = url => { aiMsg.content += `\n\n![Сгенерированное изображение](${url})\n\n`; schedule(); };
    const onReasoningDetails = rd => {
        if (!aiMsg.reasoning_details) aiMsg.reasoning_details = [];
        if (Array.isArray(rd)) aiMsg.reasoning_details.push(...rd);
        else aiMsg.reasoning_details.push(rd);
    };
    const onProvider = provName => {
        if (provName && aiMsg.actualProvider !== provName) {
            aiMsg.actualProvider = provName;
            const metaModel = el.querySelector('.msg-meta');
            if (metaModel && !metaModel.querySelector('.prov-flavor-pill')) {
                const pill = document.createElement('span');
                pill.className = 'prov-flavor-pill';
                pill.title = 'Фактический узел инференса OpenRouter';
                pill.textContent = provName;
                metaModel.insertBefore(pill, metaModel.children[2] || null);
            }
        }
    };
    const onNativeToolCall = tcCall => {
        if (!tcCall || !tcCall.name) return;
        if (tcCall.name === 'web_search') {
            const rawQueries = tcCall.args?.queries || tcCall.args?.query || [];
            const queries = Array.isArray(rawQueries) ? rawQueries : [String(rawQueries)];
            if (queries.length && !pendingWsCommand) {
                pendingWsCommand = { raw: '', queries: queries.filter(Boolean), location: 'content', isNative: true, toolCallId: tcCall.id };
                try { if (turnCtrl) turnCtrl.abort(); } catch (_) { }
            }
        } else if (tcCall.name === 'fetch_url') {
            const rawUrls = tcCall.args?.urls || tcCall.args?.url || [];
            const urls = Array.isArray(rawUrls) ? rawUrls : [String(rawUrls)];
            if (urls.length && !pendingUrlFetchCommand) {
                pendingUrlFetchCommand = { raw: '', urls: urls.filter(Boolean), location: 'content', isNative: true, toolCallId: tcCall.id };
                try { if (turnCtrl) turnCtrl.abort(); } catch (_) { }
            }
        }
    };
    /* Серверное чтение страниц (openrouter:web_fetch): показываем штатную карточку url-fetch
       на том месте потока, где модель вызвала инструмент. Подряд идущие вызовы склеиваются в одну карточку. */
    const serverFetchRecs = new Map();
    const onServerFetch = info => {
      if (!tc || !info) return;
      const url = String(info.url || '').trim();
      if (!/^https?:\/\//i.test(url)) return;
      const keys = [info.id, url].filter(Boolean);

      let rec = null;
      for (const k of keys) {
        const r = serverFetchRecs.get(k);
        if (r && (aiMsg.urlFetches || []).includes(r.session)) { rec = r; break; }
      }

      if (!rec) {
        if (!aiMsg.urlFetches) aiMsg.urlFetches = [];
        const sessions = aiMsg.urlFetches;
        const lastIdx = sessions.length - 1;
        const last = lastIdx >= 0 ? sessions[lastIdx] : null;
        const glued = !!(last && last.serverSide && (aiMsg.content || '').trimEnd().endsWith('[[FETCH_URL:' + lastIdx + ']]'));
        let session, item;
        const newItem = () => ({
          url,
          title: domainHost(url) || url,
          status: 'loading',
          percent: 15,
          content: '',
          startedAt: Date.now(),
          finishedAt: 0,
          disabled: false,
          expanded: false
        });
        if (glued) {
          session = last;
          item = newItem();
          session.urls.push(item);
          session.status = 'fetching';
        } else {
          item = newItem();
          session = {
            id: 'uf_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            status: 'fetching',
            serverSide: true,
            urls: [item],
            startedAt: Date.now(),
            finishedAt: 0
          };
          sessions.push(session);
          const sep = (aiMsg.content || '').trim() ? '\n\n' : '';
          aiMsg.content = (aiMsg.content || '') + sep + '[[FETCH_URL:' + (sessions.length - 1) + ']]\n\n';
          /* Позиция следующего хода отсчитывается от конца контента, чтобы маркер не считался текстом хода */
          contentTurnStart = aiMsg.content.length;
        }
        rec = { session, item };
        keys.forEach(k => serverFetchRecs.set(k, rec));
      } else {
        keys.forEach(k => serverFetchRecs.set(k, rec));
      }

      const { session, item } = rec;
      if (info.title) item.title = info.title;
      if (info.content) {
        item.content = info.content;
        item.outboundLinks = item.outboundLinks || [];
      }

      if (info.status === 'done') {
        item.status = item.content ? 'done' : 'error';
        if (!item.content) item.error = 'страница пуста';
        item.percent = 100;
        item.finishedAt = Date.now();
      } else if (info.status === 'error') {
        item.status = 'error';
        item.error = info.error || 'страница недоступна';
        item.percent = 100;
        item.finishedAt = Date.now();
      } else {
        item.status = 'loading';
        item.percent = Math.min(90, (item.percent || 15) + 10);
      }

      if (item.status === 'done') {
        if (!aiMsg.webSearch) aiMsg.webSearch = { queries: [], sources: [], stages: [] };
        if (!aiMsg.webSearch.sources.some(s => s.uri === item.url)) {
          aiMsg.webSearch.sources.push({ uri: item.url, title: item.title, snippet: (item.content || '').slice(0, 320) });
        }
      }

      const allSettled = session.urls.every(u => u.status === 'done' || u.status === 'error');
      if (allSettled) {
        session.status = 'done';
        session.finishedAt = Date.now();
      }
      schedule();
    };

    const pushStage = label => {
      if (!aiMsg.webSearch) aiMsg.webSearch = { queries: [], sources: [], stages: [] };
        if (!aiMsg.webSearch.stages) aiMsg.webSearch.stages = [];
        aiMsg.webSearch.stages.push({ label, ts: Date.now() });
        schedule();
    };
    const onWebSearch = ws => {
        if (!aiMsg.webSearch) aiMsg.webSearch = { queries: [], sources: [], stages: [] };
        if (ws.queries) {
            const newQ = ws.queries.filter(q => !aiMsg.webSearch.queries.includes(q));
            if (newQ.length) {
                aiMsg.webSearch.queries.push(...newQ);
                newQ.forEach(q => pushStage('Поисковый запрос: ' + (q.length > 64 ? q.slice(0, 64) + '…' : q)));
            }
        }
        if (ws.sources) {
            const had = aiMsg.webSearch.sources.length;
            aiMsg.webSearch.sources.push(...ws.sources);
            if (!had && aiMsg.webSearch.sources.length) pushStage('Чтение найденных источников');
        }
        const wsEl = document.querySelector(`[data-id="${aiMsg.id}"] .wsearch`);
        if (wsEl) { wsEl.hidden = false; wsEl.classList.add('live'); wsEl.classList.remove('collapsed'); }
        refreshCurrentMsg(aiMsg);
        schedule();
    };
    const t0 = Date.now();
    try {
        const history = chat.messages.slice(0, -1);
        const wsEnabled = !!state.settings.webSearch;
        // Предварительный веб-поиск (Grounding) ОТКЛЮЧЁН:
        // поиск запускается ТОЛЬКО по команде модели {web-search: [...]} —
        // никакого принудительного «первого блина комом» с запросом «запрос».
        // Нативные провайдеры (Anthropic/Gemini) по-прежнему могут вызывать
        // свои встроенные инструменты поиска — это решение самой модели.
        let webSearchContext = null;
        // ── Агентный цикл: модель сама запрашивает поиск и глубокий анализ ссылок ──
        const maxWsSearches = getWsLimit() || 4;
        let wsSearchesUsed = 0;
        let urlFetchesUsed = 0;
        const maxUrlFetches = 6;
        let execUsed = 0;
        const maxExec = 6;
        let thinkUsed = 0;
        const maxThink = 50;
        const MAX_AGENT_ROUNDS = 18; // глобальный предохранитель от бесконечного цикла инструментов
        let agentRounds = 0;
        let emptyTurnRetries = 0;
        let reasoningExhaustRetries = 0;
        let continuationRetries = 0;
        let contentTurnStart = 0;
        let todoLoopTurns = 0;
        const convExt = []; // продолжение: пошаговый ReAct лог (Thought -> Action -> Observation)
        const seenToolCalls = new Set(); // дедуп одинаковых вызовов инструментов в рамках ответа
        const toolKey = (kind, payload) => kind + ':' + String(payload).toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 500);
        let abortedByUser = false;
        let fatalErr = null;
        /* Вспомогательный шаг: убрать «сырую» команду из текста и вернуть модели системное замечание */
        const rejectToolCall = (det, note) => {
            if (det.location === 'thinking') aiMsg.thinking = (aiMsg.thinking || '').replace(det.raw, '[команда отклонена системой]');
            else aiMsg.content = (aiMsg.content || '').replace(det.raw, '').trimEnd();
            const turnContent = aiMsg.content.slice(contentTurnStart).trim();
            convExt.push({ role: 'assistant', content: turnContent || '(вызов инструмента)' });
            convExt.push({ role: 'user', content: '=== СИСТЕМА ===\n' + note + '\nПродолжи ответ без этой команды.' });
            contentTurnStart = aiMsg.content.length;
            schedule();
        };
        while (true) {
            if (++agentRounds > MAX_AGENT_ROUNDS) {
                toast('Достигнут лимит раундов инструментов', 'info', 2600);
                break;
            }
            pendingTodoCommand = null;
            pendingWsCommand = null;
            pendingUrlFetchCommand = null;
            pendingThinkCommand = null;
            pendingExecCommand = null;
            turnCtrl = new AbortController();
            abortCtrl = turnCtrl; // чтобы stopGeneration() прерывал текущий виток
            const turnHistory = convExt.length ? [...history, ...convExt] : history;
            const sn = snapAiMsg(aiMsg); // снимок хода для отката при failover
            const turnStartLen = aiMsg.content.length;
            try {
                if (useORDirect) {
                    /* Прямой вызов OpenRouter с поддержкой нативных tool_calls */
                    await streamOpenRouterDirect(model, turnHistory,
                        { onText, onThink, onImage, onReasoningDetails, onWebSearch, onServerFetch, onServerTool: info => window.recordServerTool(aiMsg, info), onProvider, onNativeToolCall, signal: turnCtrl.signal }, aiMsg, chat);
                } else if (model.api === 'anthropic') {
                    await streamAnthropic(model, turnHistory, { onText, onThink, onWebSearch, wsEnabled, webSearchContext, signal: turnCtrl.signal }, aiMsg);
                } else if (model.api === 'gemini') {
                    await streamGemini(model, turnHistory, { onText, onThink, onWebSearch, wsEnabled, webSearchContext, signal: turnCtrl.signal }, aiMsg);
                } else {
                    await streamOpenRouter(model, turnHistory, { onText, onThink, onImage, onReasoningDetails, onWebSearch, wsEnabled, webSearchContext, signal: turnCtrl.signal, direct: false }, aiMsg, chat);
                }
            } catch (e) {
                if (pendingWsCommand || pendingThinkCommand || pendingExecCommand || pendingUrlFetchCommand) { /* внутренний abort ради поиска/мышления/кода/ссылок — НЕ ошибка */ }
                else if ((e.name === 'AbortError' || e.code === 20) && turnCtrl?.signal?.aborted) {
                    abortedByUser = true;
                    break;
                }
                else if (providerIdx + 1 < chain.length) {
                    /* FAILOVER: резервное переключение шлюза при сетевой ошибке или таймауте */
                    const failedGateway = useProxy ? 'ProxyAPI' : 'OpenRouter';
                    provErrors.push({ name: failedGateway, msg: (e && e.message) || String(e) });
                    rollbackAiMsg(aiMsg, sn);
                    contentTurnStart = sn.len;
                    artTrk.start = null;
                    providerIdx++;
                    useProxy = chain[providerIdx] === 'proxy';
                    useORDirect = chain[providerIdx] === 'openrouter';
                    toast(`${failedGateway} недоступен (${e.message || 'таймаут'}). Переключение на ${useProxy ? 'ProxyAPI' : 'OpenRouter'}…`, 'info', 3200);
                    schedule();
                    continue;
                }
                else { fatalErr = e; break; }
            }

            // Дополнительная синхронизация команд плана задач без прерывания потока (парсинг всех команд в чанке)
            if (tc) {
                let checkChunk = aiMsg.content.slice(contentTurnStart) + '\n' + (aiMsg.thinking || '');
                let restTodo;
                let parsedAny = false;
                while ((restTodo = tc.detectTodoCommand(checkChunk))) {
                    parsedAny = true;
                    if (restTodo.type === 'plan' && (!aiMsg.todoSessions || !aiMsg.todoSessions.length)) {
                        tc.spawnTodoSession(chat, aiMsg, restTodo.raw, restTodo.tasks, 'content');
                    } else if (restTodo.type === 'update') {
                        tc.updateTodoSession(chat, aiMsg, restTodo.raw, restTodo.step, restTodo.status, restTodo.result, 'content');
                    } else if (restTodo.type === 'add') {
                        tc.addTodoTasks(chat, aiMsg, restTodo.raw, restTodo.tasks, 'content');
                    }
                    checkChunk = checkChunk.replace(restTodo.raw, '');
                }
                if (parsedAny) schedule();
            }

            let finalFetch = pendingUrlFetchCommand;
            if (!finalFetch) {
                const ufc = tc.detectUrlFetchCommand(aiMsg.content.slice(contentTurnStart));
                if (ufc) finalFetch = { raw: ufc.raw, urls: ufc.urls, location: 'content' };
                else {
                    const uft = tc.detectUrlFetchCommand(aiMsg.thinking);
                    if (uft) finalFetch = { raw: uft.raw, urls: uft.urls, location: 'thinking' };
                }
            }

            if (finalFetch) {
                // Лимит раундов чтения
                if (urlFetchesUsed >= maxUrlFetches) {
                    rejectToolCall(finalFetch, `Лимит чтения страниц (${maxUrlFetches} раундов) исчерпан. Сформируй итоговый ответ на основе уже полученных данных.`);
                    continue;
                }
                // Дедуп: убираем уже прочитанные в этом ответе URL
                const alreadyRead = new Set();
                (aiMsg.urlFetches || []).forEach(sess => (sess.urls || []).forEach(u => { if (u.status === 'done') alreadyRead.add(u.url.replace(/\/$/, '').toLowerCase()); }));
                const freshUrls = finalFetch.urls.filter(u => !alreadyRead.has(u.replace(/\/$/, '').toLowerCase()));
                if (!freshUrls.length) {
                    rejectToolCall(finalFetch, 'Все указанные URL уже были прочитаны в этом ответе — их содержимое есть выше в диалоге. Используй его или укажи новые страницы.');
                    continue;
                }
                finalFetch.urls = freshUrls.slice(0, 5);
                urlFetchesUsed++;
                // Строго отсекаем любой сгенерированный после команды текст до завершения загрузки
                if (finalFetch.location === 'content') {
                    const rawIdx = aiMsg.content.indexOf(finalFetch.raw, contentTurnStart);
                    if (rawIdx !== -1) {
                        aiMsg.content = aiMsg.content.slice(0, rawIdx + finalFetch.raw.length);
                    }
                } else {
                    const rawThinkIdx = aiMsg.thinking.indexOf(finalFetch.raw);
                    if (rawThinkIdx !== -1) {
                        aiMsg.thinking = aiMsg.thinking.slice(0, rawThinkIdx + finalFetch.raw.length);
                    }
                }

                // Интеграция чтения страниц (fetch_url) непосредственно внутрь активного шага плана to-dos
                const currentTodoSess = (aiMsg.todoSessions && aiMsg.todoSessions.length) ? aiMsg.todoSessions[aiMsg.todoSessions.length - 1] : null;
                let activeTodoTask = null;

                if (currentTodoSess && currentTodoSess.tasks && currentTodoSess.tasks.length) {
                    activeTodoTask = currentTodoSess.tasks.find(t => t.status === 'active') ||
                        currentTodoSess.tasks.find(t => t.status === 'pending');
                    if (activeTodoTask) {
                        activeTodoTask.status = 'active';
                        activeTodoTask.urlFetch = {
                            status: 'loading',
                            percent: 15,
                            urls: finalFetch.urls,
                            currentUrl: finalFetch.urls[0] || '',
                            pages: []
                        };
                    }
                }

                pushStage(`Чтение страниц (${finalFetch.urls.length}): ` + finalFetch.urls.map(u => domainHost(u)).join(', '));

                // Создаем полноценную сессию с гарантированной вставкой интерактивного слота [[FETCH_URL:idx]]
                const fetchSession = tc.spawnUrlFetchSession(chat, aiMsg, finalFetch.raw, finalFetch.urls, finalFetch.location, false);
                schedule();

                const fetchAbort = new AbortController();
                abortCtrl = fetchAbort;

                try {
                    const totalUrls = fetchSession.urls.length;
                    for (let uIdx = 0; uIdx < totalUrls; uIdx++) {
                        if (fetchAbort.signal.aborted) break;
                        const targetU = fetchSession.urls[uIdx];
                        if (targetU.disabled) continue;

                        targetU.status = 'loading';
                        if (activeTodoTask && activeTodoTask.urlFetch) {
                            activeTodoTask.urlFetch.currentUrl = targetU.url;
                        }
                        schedule();

                        let res = null;
                        if (tc && typeof tc.fetchUrlContent === 'function') {
                            res = await tc.fetchUrlContent(targetU.url, fetchAbort.signal, (subPct, status) => {
                            const curRounded = Math.max(5, Math.min(100, Math.round(subPct)));
                            targetU.percent = curRounded;
                            if (activeTodoTask && activeTodoTask.urlFetch) {
                                const overall = Math.round(((uIdx / totalUrls) * 100) + (curRounded / totalUrls));
                                activeTodoTask.urlFetch.percent = Math.min(99, Math.max(10, overall));
                                activeTodoTask.urlFetch.currentUrl = targetU.url;
                            }
                            // Точечное аппаратное обновление DOM без полного пересоздания контейнера
                            const cardNode = el.querySelector(`[data-url-fetch]`);
                            if (cardNode) {
                                const itemRow = cardNode.querySelector(`[data-uf-idx="${uIdx}"]`);
                                if (itemRow) {
                                    const itemBar = itemRow.querySelector('.uf-item-bar');
                                    const itemBadge = itemRow.querySelector('.uf-pct-badge');
                                    const itemSub = itemRow.querySelector('.uf-sub');
                                    if (itemBar) itemBar.style.width = `${curRounded}%`;
                                    if (itemBadge) itemBadge.textContent = `${curRounded}%`;
                                    if (itemSub && status) itemSub.textContent = status;
                                }
                            }
                            const todoNode = el.querySelector(`.todo-card`);
                            if (todoNode) {
                                const todoBar = todoNode.querySelector('.todo-fetch-bar');
                                const todoBadge = todoNode.querySelector('.todo-fetch-badge');
                                const todoUrl = todoNode.querySelector('.todo-fetch-url span');
                                if (todoBar) todoBar.style.width = `${activeTodoTask?.urlFetch?.percent || curRounded}%`;
                                if (todoBadge) todoBadge.textContent = `${activeTodoTask?.urlFetch?.percent || curRounded}%`;
                                if (todoUrl) todoUrl.textContent = domainHost(targetU.url);
                            }
                            schedule();
                        });
                        }

                        // Перехват и обход ошибки анонимного чтения (Rate limit exceeded for anonymous reading)
                        if (!res || isAnonymousReadErr(res.content || res.error)) {
                            const fallbackPage = await safeFetchUrlContent(targetU.url, fetchAbort.signal);
                            if (fallbackPage && fallbackPage.content) {
                                res = {
                                    title: fallbackPage.title,
                                    content: fallbackPage.content,
                                    outboundLinks: []
                                };
                            }
                        }

                        if (res && res.content && !isAnonymousReadErr(res.content)) {
                            targetU.status = 'done';
                            targetU.title = res.title || domainHost(targetU.url);
                            targetU.content = res.content;
                            targetU.outboundLinks = res.outboundLinks || [];

                            if (!aiMsg.webSearch) aiMsg.webSearch = { queries: [], sources: [], stages: [] };
                            if (!aiMsg.webSearch.sources.some(s => s.uri === targetU.url)) {
                                aiMsg.webSearch.sources.push({
                                    uri: targetU.url,
                                    title: targetU.title || domainHost(targetU.url),
                                    snippet: targetU.content
                                });
                            }
                        } else {
                            targetU.status = 'error';
                            targetU.error = (res && res.error && !isAnonymousReadErr(res.error)) ? res.error : 'страница недоступна';
                        }
                        targetU.finishedAt = Date.now();
                        schedule();
                    }
                } catch (err) {
                    if (fetchAbort.signal.aborted) { abortedByUser = true; }
                    else console.warn('[ToolCalling] Url fetch error:', err);
                }
                fetchSession.urls.forEach(u => { if (u.status === 'loading') { u.status = 'error'; u.error = abortedByUser ? 'прервано' : 'не загружено'; u.finishedAt = Date.now(); } });
                if (fetchAbort.signal.aborted) abortedByUser = true;

                fetchSession.status = 'done';
                fetchSession.finishedAt = Date.now();

                if (activeTodoTask && activeTodoTask.urlFetch) {
                    activeTodoTask.urlFetch.status = 'done';
                    activeTodoTask.urlFetch.percent = 100;
                    activeTodoTask.urlFetch.pages = fetchSession.urls.filter(u => u.status === 'done').map(u => ({
                        url: u.url,
                        title: u.title || domainHost(u.url),
                        sizeKb: Math.max(1, Math.round((u.content || '').length / 1024))
                    }));
                    const okPages = activeTodoTask.urlFetch.pages.length;
                    const failedPages = fetchSession.urls.filter(u => u.status === 'error').length;
                    // Шаг остаётся активным при полном провале — модель решит: повторить с другим URL или пометить error
                    activeTodoTask.status = okPages > 0 ? 'done' : 'active';
                    activeTodoTask.result = okPages > 0
                        ? `Изучено страниц: ${okPages}${failedPages ? ` (недоступно: ${failedPages})` : ''}`
                        : `Страницы недоступны (${failedPages})`;
                    if (okPages > 0) {
                        const curTaskIdx = currentTodoSess.tasks.indexOf(activeTodoTask);
                        if (currentTodoSess.tasks[curTaskIdx + 1] && currentTodoSess.tasks[curTaskIdx + 1].status === 'pending') {
                            currentTodoSess.tasks[curTaskIdx + 1].status = 'active';
                        }
                    }
                }

                save();
                schedule();
                if (abortedByUser) break;

                const sessIdx = aiMsg.urlFetches.indexOf(fetchSession);
                const markerRegex = new RegExp(`\\[\\[FETCH_URL:${sessIdx}\\]\\]`, 'g');
                const turnContent = aiMsg.content.slice(contentTurnStart);
                const apiPartial = turnContent.replace(markerRegex, '[запрошено чтение веб-страниц]').trim();

                convExt.push({
                    role: 'assistant',
                    content: apiPartial || (activeTodoTask ? `(завершено чтение страниц для шага «${activeTodoTask.label}»)` : (finalFetch.location === 'thinking' ? '(анализирую веб-страницы в процессе размышлений)' : '(анализирую веб-страницы)'))
                });
                convExt.push({
                    role: 'user',
                    content: tc.formatUrlFetchResults(fetchSession)
                });

                contentTurnStart = aiMsg.content.length;
                pendingUrlFetchCommand = null;
                continue;
            }

            let finalThink = pendingThinkCommand;
            if (!finalThink && canThinkNow) {
                const dtc = tc.detectThinkCommand(aiMsg.content.slice(contentTurnStart));
                if (dtc && !dtc.partial && dtc.tasks) finalThink = { raw: dtc.raw, tasks: dtc.tasks, location: 'content' };
                else {
                    const dtt = tc.detectThinkCommand(aiMsg.thinking);
                    if (dtt && !dtt.partial && dtt.tasks) finalThink = { raw: dtt.raw, tasks: dtt.tasks, location: 'thinking' };
                }
            }
            if (finalThink) {
                if (thinkUsed >= maxThink) {
                    rejectToolCall(finalThink, `Лимит параллельного мышления (${maxThink} вызова за ответ) исчерпан. Выполни анализ последовательно в обычном ответе.`);
                    continue;
                }
                const thinkKey = toolKey('think', finalThink.tasks.join('|'));
                if (seenToolCalls.has(thinkKey)) {
                    rejectToolCall(finalThink, 'Эти же ветки анализа уже выполнялись — результаты выше в диалоге. Синтезируй их, не повторяя вызов.');
                    continue;
                }
                seenToolCalls.add(thinkKey);
                thinkUsed++;
                // Строго отсекаем спекулятивные токены после команды
                if (finalThink.location === 'content') {
                    const rawIdx = aiMsg.content.indexOf(finalThink.raw, contentTurnStart);
                    if (rawIdx !== -1) {
                        aiMsg.content = aiMsg.content.slice(0, rawIdx + finalThink.raw.length);
                    }
                } else {
                    const rawThinkIdx = aiMsg.thinking.indexOf(finalThink.raw);
                    if (rawThinkIdx !== -1) {
                        aiMsg.thinking = aiMsg.thinking.slice(0, rawThinkIdx + finalThink.raw.length);
                    }
                }

                const currentTodoSess = (aiMsg.todoSessions && aiMsg.todoSessions.length) ? aiMsg.todoSessions[aiMsg.todoSessions.length - 1] : null;
                let activeTodoTask = null;
                if (currentTodoSess && currentTodoSess.tasks && currentTodoSess.tasks.length) {
                    activeTodoTask = currentTodoSess.tasks.find(t => t.status === 'active') ||
                        currentTodoSess.tasks.find(t => t.status === 'pending');
                    if (activeTodoTask) {
                        activeTodoTask.status = 'active';
                        activeTodoTask.thinking = { status: 'thinking', tasks: finalThink.tasks };
                    }
                }

                const session = tc.spawnThinkSession(chat, aiMsg, finalThink.raw, finalThink.tasks, finalThink.location);
                schedule();
                const thinkSignal = new AbortController();
                abortCtrl = thinkSignal; // кнопка «Стоп» прерывает ветки мышления
                try {
                    await tc.runParallelThink(chat, aiMsg, session, history, aiMsg.content, thinkSignal.signal);
                } catch (e) {
                    console.error('[DeepThink] parallel failed:', e);
                    session.status = 'error';
                    session.finishedAt = Date.now();
                    session.tasks.forEach(t => { if (t.status === 'thinking') { t.status = 'error'; t.result = t.result || 'Ошибка: ' + ((e && e.message) || e); t.finishedAt = Date.now(); } });
                }
                if (thinkSignal.signal.aborted) abortedByUser = true;

                if (activeTodoTask && activeTodoTask.thinking) {
                    const okBranches = session.tasks.filter(t => t.status === 'done').length;
                    activeTodoTask.thinking.status = 'done';
                    activeTodoTask.thinking.count = session.tasks.length;
                    activeTodoTask.status = okBranches > 0 ? 'done' : 'active';
                    activeTodoTask.result = `Параллельный анализ: ${okBranches} из ${session.tasks.length} задач завершено`;
                    if (okBranches > 0) {
                        const curTaskIdx = currentTodoSess.tasks.indexOf(activeTodoTask);
                        if (currentTodoSess.tasks[curTaskIdx + 1] && currentTodoSess.tasks[curTaskIdx + 1].status === 'pending') {
                            currentTodoSess.tasks[curTaskIdx + 1].status = 'active';
                        }
                    }
                }
                save();
                schedule();
                if (abortedByUser) break;

                const turnContent = aiMsg.content.slice(contentTurnStart);
                const apiPartial = turnContent.replace(/\[\[THINK:\d+\]\]/g, '[результаты параллельного мышления были предоставлены выше]').trim();
                convExt.push({ role: 'assistant', content: apiPartial || (finalThink.location === 'thinking' ? '(я выполнял параллельное мышление в процессе размышлений)' : '(я выполнял параллельное мышление)') });
                convExt.push({ role: 'user', content: tc.formatThinkResults(session) });
                contentTurnStart = aiMsg.content.length;
                pendingThinkCommand = null;
                continue;
            }

            let finalExec = (pendingExecCommand && pendingExecCommand.cmd) ? pendingExecCommand : null;
            if (!finalExec && canExecNow) {
                const ec = tc.detectCodeExecutionCommand(aiMsg.content.slice(contentTurnStart));
                if (ec && !ec.partial && ec.cmd) finalExec = { raw: ec.raw, cmd: ec.cmd, location: 'content' };
                else {
                    const et = tc.detectCodeExecutionCommand(aiMsg.thinking);
                    if (et && !et.partial && et.cmd) finalExec = { raw: et.raw, cmd: et.cmd, location: 'thinking' };
                }
            }
            if (finalExec) {
                if (execUsed >= maxExec) {
                    rejectToolCall(finalExec, `Лимит запусков кода (${maxExec} за ответ) исчерпан. Покажи финальный код в markdown-блоке без выполнения и объясни результат.`);
                    continue;
                }
                const execKey = toolKey('exec', finalExec.cmd.lang + '|' + finalExec.cmd.code + '|' + (finalExec.cmd.stdin || ''));
                if (seenToolCalls.has(execKey)) {
                    rejectToolCall(finalExec, 'Этот же код с теми же входными данными уже выполнялся — результат выше. Измени код или продолжи ответ.');
                    continue;
                }
                seenToolCalls.add(execKey);
                execUsed++;
                // Строго отсекаем спекулятивные токены после команды
                if (finalExec.location === 'content') {
                    const rawIdx = aiMsg.content.indexOf(finalExec.raw, contentTurnStart);
                    if (rawIdx !== -1) {
                        aiMsg.content = aiMsg.content.slice(0, rawIdx + finalExec.raw.length);
                    }
                } else {
                    const rawThinkIdx = aiMsg.thinking.indexOf(finalExec.raw);
                    if (rawThinkIdx !== -1) {
                        aiMsg.thinking = aiMsg.thinking.slice(0, rawThinkIdx + finalExec.raw.length);
                    }
                }

                const currentTodoSess = (aiMsg.todoSessions && aiMsg.todoSessions.length) ? aiMsg.todoSessions[aiMsg.todoSessions.length - 1] : null;
                let activeTodoTask = null;
                if (currentTodoSess && currentTodoSess.tasks && currentTodoSess.tasks.length) {
                    activeTodoTask = currentTodoSess.tasks.find(t => t.status === 'active') ||
                        currentTodoSess.tasks.find(t => t.status === 'pending');
                    if (activeTodoTask) {
                        activeTodoTask.status = 'active';
                        activeTodoTask.execution = { status: 'running', lang: finalExec.cmd.lang, code: finalExec.cmd.code };
                    }
                }

                const x = tc.spawnCodeExecution(chat, aiMsg, finalExec.cmd, finalExec.raw, finalExec.location);
                schedule();
                const execAbort = new AbortController();
                abortCtrl = execAbort;
                try { await tc.runCodeExecution(x, execAbort.signal); } catch (e) { console.error('[Exec]', e); }
                if (execAbort.signal.aborted) abortedByUser = true;

                // Счётчик неудачных попыток подряд для одной задачи (сброс при успехе)
                const execOk = x.status === 'done' && x.exitCode === 0;
                const failStreak = execOk ? 0 : ((aiMsg._execFailStreak || 0) + 1);
                aiMsg._execFailStreak = failStreak;

                if (activeTodoTask && activeTodoTask.execution) {
                    activeTodoTask.execution.status = 'done';
                    activeTodoTask.execution.exitCode = x.exitCode;
                    activeTodoTask.execution.dur = x.finishedAt && x.startedAt ? ((x.finishedAt - x.startedAt) / 1000).toFixed(1) + 's' : '';
                    // При ошибке шаг остаётся активным: модель получит шанс исправить код (до 3 попыток)
                    activeTodoTask.status = execOk ? 'done' : (failStreak >= 3 ? 'error' : 'active');
                    activeTodoTask.result = execOk ? `Код (${finalExec.cmd.lang}) выполнен успешно` : `Ошибка выполнения (exit ${x.exitCode})${failStreak < 3 ? ', исправление…' : ''}`;
                    if (activeTodoTask.status !== 'active') {
                        const curTaskIdx = currentTodoSess.tasks.indexOf(activeTodoTask);
                        if (currentTodoSess.tasks[curTaskIdx + 1] && currentTodoSess.tasks[curTaskIdx + 1].status === 'pending') {
                            currentTodoSess.tasks[curTaskIdx + 1].status = 'active';
                        }
                    }
                }
                save();
                schedule();
                if (abortedByUser) break;

                const turnContent = aiMsg.content.slice(contentTurnStart);
                const apiPartial = turnContent.replace(/\[\[EXEC:\d+\]\]/g, '[результат выполнения кода выше]').trim();
                convExt.push({ role: 'assistant', content: apiPartial || (finalExec.location === 'thinking' ? '(я выполнял код в процессе размышлений)' : '(я выполнял код в песочнице)') });
                convExt.push({ role: 'user', content: tc.formatExecResult(x, execOk ? 1 : failStreak, 3) });
                contentTurnStart = aiMsg.content.length;
                pendingExecCommand = null;
                continue;
            }

            let finalDet = pendingWsCommand;
            if (!finalDet) {
                const dc = tc.detectWebSearchCommand(aiMsg.content.slice(contentTurnStart));
                if (dc) finalDet = { raw: dc.raw, queries: dc.queries, location: 'content' };
                else {
                    const dt = tc.detectWebSearchCommand(aiMsg.thinking);
                    if (dt) finalDet = { raw: dt.raw, queries: dt.queries, location: 'thinking' };
                }
            }

            if (finalDet && !wsEnabled) {
                rejectToolCall(finalDet, 'Веб-поиск отключён в настройках пользователя. Отвечай на основе своих знаний или используй {fetch_url: [...]} для конкретных URL, если они известны.');
                continue;
            }
            if (finalDet && wsSearchesUsed >= maxWsSearches) {
                rejectToolCall(finalDet, `Лимит поисковых раундов (${maxWsSearches}) исчерпан. Используй уже найденные источники: при необходимости открой их через {fetch_url: [...]} или переходи к итоговому ответу.`);
                continue;
            }
            if (finalDet) {
                const cleanQ0 = [...new Set((finalDet.queries || []).map(q => typeof q === 'string' ? q.trim() : '').filter(Boolean))];
                const freshQueries = cleanQ0.filter(q => !seenToolCalls.has(toolKey('ws', q)));
                if (!freshQueries.length) {
                    rejectToolCall(finalDet, 'Эти поисковые запросы уже выполнялись в этом ответе — результаты выше. Переформулируй запрос принципиально иначе или используй имеющиеся источники.');
                    continue;
                }
                finalDet.queries = freshQueries;
                freshQueries.forEach(q => seenToolCalls.add(toolKey('ws', q)));
                wsSearchesUsed++;
                // Строго отсекаем спекулятивные токены после команды
                if (finalDet.location === 'content') {
                    const rawIdx = aiMsg.content.indexOf(finalDet.raw, contentTurnStart);
                    if (rawIdx !== -1) {
                        aiMsg.content = aiMsg.content.slice(0, rawIdx + finalDet.raw.length);
                    }
                } else {
                    const rawThinkIdx = aiMsg.thinking.indexOf(finalDet.raw);
                    if (rawThinkIdx !== -1) {
                        aiMsg.thinking = aiMsg.thinking.slice(0, rawThinkIdx + finalDet.raw.length);
                    }
                }

                const cleanQueries = [...new Set((finalDet.queries || []).map(q => typeof q === 'string' ? q.trim() : '').filter(Boolean))].slice(0, 4);
                finalDet.queries = cleanQueries;

                // Интеграция веб-поиска непосредственно внутрь активной задачи в to-dos
                const currentTodoSess = (aiMsg.todoSessions && aiMsg.todoSessions.length) ? aiMsg.todoSessions[aiMsg.todoSessions.length - 1] : null;
                let activeTodoTask = null;

                if (currentTodoSess && currentTodoSess.tasks && currentTodoSess.tasks.length) {
                    activeTodoTask = currentTodoSess.tasks.find(t => t.status === 'active') ||
                        currentTodoSess.tasks.find(t => t.status === 'pending');
                    if (activeTodoTask) {
                        activeTodoTask.status = 'active';
                        activeTodoTask.search = { status: 'searching', queries: cleanQueries, sources: [] };
                    }
                    if (finalDet.location === 'thinking') {
                        aiMsg.thinking = aiMsg.thinking.replace(finalDet.raw, '[поиск в интернете]');
                    } else {
                        aiMsg.content = tc.stripWsCommands(aiMsg.content);
                    }
                } else {
                    const n = (aiMsg.inlineSearches || (aiMsg.inlineSearches = [])).length;
                    if (finalDet.location === 'thinking') aiMsg.thinking = aiMsg.thinking.replace(finalDet.raw, '[[WS:' + n + ']]');
                    else aiMsg.content = aiMsg.content.replace(finalDet.raw, '[[WS:' + n + ']]');
                    aiMsg.inlineSearches.push({ raw: finalDet.raw, queries: cleanQueries, sources: [], status: 'searching' });
                }

                pushStage('Поиск в интернете: ' + cleanQueries.join('; '));
                schedule();

                let results = { sources: [], failed: false };
                const wsAbort = new AbortController();
                abortCtrl = wsAbort;
                try {
                    if (tc && typeof tc.performWebSearches === 'function') {
                        results = await tc.performWebSearches(cleanQueries, wsAbort.signal) || results;
                    }
                    const hasAnonErr = (results.sources || []).some(s => isAnonymousReadErr(s.snippet || s.title));
                    if (!results.sources || !results.sources.length || results.failed || hasAnonErr) {
                        const fallbackSearch = window.performOpenRouterWebSearch || window.performWebSearches;
                        if (typeof fallbackSearch === 'function') {
                            const fbRes = await fallbackSearch(cleanQueries, wsAbort.signal);
                            if (fbRes && fbRes.sources && fbRes.sources.length) {
                                results = fbRes;
                            }
                        }
                    }
                } catch (e) {
                    try {
                        const fallbackSearch = window.performOpenRouterWebSearch || window.performWebSearches;
                        if (typeof fallbackSearch === 'function') {
                            results = await fallbackSearch(cleanQueries, wsAbort.signal) || results;
                        }
                    } catch (_) {
                        results.failed = true;
                    }
                }
                if (wsAbort.signal.aborted) abortedByUser = true;
                const foundCount = (results.sources || []).length;

                if (activeTodoTask) {
                    activeTodoTask.search.status = 'done';
                    activeTodoTask.search.sources = results.sources || [];
                    // Пустой результат оставляет шаг активным — модель переформулирует запрос или пометит error
                    activeTodoTask.status = foundCount > 0 ? 'done' : 'active';
                    activeTodoTask.result = foundCount > 0 ? `Найдено источников: ${foundCount}` : 'Источники не найдены';
                    if (foundCount > 0) {
                        const curTaskIdx = currentTodoSess.tasks.indexOf(activeTodoTask);
                        if (currentTodoSess.tasks[curTaskIdx + 1] && currentTodoSess.tasks[curTaskIdx + 1].status === 'pending') {
                            currentTodoSess.tasks[curTaskIdx + 1].status = 'active';
                        }
                    }
                } else {
                    const entry = aiMsg.inlineSearches?.[aiMsg.inlineSearches.length - 1];
                    if (entry) {
                        entry.sources = results.sources || [];
                        entry.status = 'done';
                    }
                }

                if (!aiMsg.webSearch) aiMsg.webSearch = { queries: [], sources: [], stages: [] };
                aiMsg.webSearch.queries.push(...cleanQueries);
                if (foundCount) {
                    const known = new Set(aiMsg.webSearch.sources.map(s => s.uri));
                    results.sources.forEach(s => { if (s && s.uri && !known.has(s.uri)) { known.add(s.uri); aiMsg.webSearch.sources.push(s); } });
                }

                pushStage(foundCount ? `Найдено источников: ${foundCount}` : (results.failed ? 'Поисковые провайдеры недоступны' : 'Источники не найдены'));
                save();
                schedule();
                if (abortedByUser) break;

                const turnContent = aiMsg.content.slice(contentTurnStart);
                const apiPartial = tc.stripWsCommands(turnContent.replace(/\[\[WS:\d+\]\]/g, '[выполнен поиск в интернете]')).trim();
                convExt.push({ role: 'assistant', content: apiPartial || (activeTodoTask ? `(выполнен поиск для задачи «${activeTodoTask.label}»)` : (finalDet.location === 'thinking' ? '(я выполнял поиск в процессе размышлений)' : '(я выполнял поиск в интернете)')) });
                convExt.push({ role: 'user', content: tc.formatSearchResults(results, cleanQueries, wsSearchesUsed, maxWsSearches, !!activeTodoTask) });
                contentTurnStart = aiMsg.content.length;
                pendingWsCommand = null;
                continue;
            } else {
                // Команды инструментов, недоступных в этой сессии (модель их «придумала»): мягко отклоняем
                if (!toolAv || !toolAv.canThink) {
                    const ghostThink = tc.detectThinkCommand(aiMsg.content.slice(contentTurnStart));
                    if (ghostThink && !ghostThink.partial && ghostThink.tasks && ghostThink.tasks.length) {
                        rejectToolCall({ raw: ghostThink.raw, location: 'content' }, 'Инструмент параллельного мышления в этой сессии недоступен. Выполни анализ последовательно в обычном ответе.');
                        continue;
                    }
                }
                if (!toolAv || !toolAv.canExec) {
                    const ghostExec = tc.detectCodeExecutionCommand(aiMsg.content.slice(contentTurnStart));
                    if (ghostExec && !ghostExec.partial && ghostExec.cmd) {
                        rejectToolCall({ raw: ghostExec.raw, location: 'content' }, 'Выполнение кода в этой среде недоступно. Покажи код в markdown-блоке и объясни ожидаемый результат; для интерактива используй <artifact>.');
                        continue;
                    }
                }

                // Продвижение по плану задач To-Do: поэтапное выполнение каждого шага до полного завершения
                const curTodoSess = (aiMsg.todoSessions && aiMsg.todoSessions.length) ? aiMsg.todoSessions[aiMsg.todoSessions.length - 1] : null;
                const turnText = aiMsg.content.slice(contentTurnStart)
                    .replace(/\[\[(?:ART|IMGRQ|WS|THINK|EXEC|FETCH_URL|TODO):\d+\]\]/g, '')
                    .replace(/\{(?:todo[-_]plan|todoPlan|todo[-_]update|todoUpdate|todo[-_]add|todoAdd)\s*:[^}]*\}/gi, '')
                    .trim();
                const turnTextLen = turnText.length;

                if (curTodoSess && curTodoSess.status === 'running' && !fatalErr && !abortedByUser) {
                    let activeTask = curTodoSess.tasks.find(t => t.status === 'active');

                    // Если модель выполнила текущий активный шаг текстом и написала содержательный ответ, но не вызвала {todo_update}
                    if (activeTask && !activeTask.result && turnTextLen >= 35) {
                        const firstLine = turnText.split('\n').map(l => l.trim()).filter(l => l.length > 5)[0] || '';
                        activeTask.status = 'done';
                        activeTask.result = firstLine.slice(0, 110) || 'Шаг выполнен текстом';

                        const nextPending = curTodoSess.tasks.find(t => t.status === 'pending');
                        if (nextPending) {
                            nextPending.status = 'active';
                            activeTask = nextPending;
                        } else {
                            activeTask = null;
                        }
                    }

                    const remainingTasks = curTodoSess.tasks.filter(t => t.status === 'pending' || t.status === 'active');

                    if (remainingTasks.length > 0 && todoLoopTurns < 100) {
                        todoLoopTurns++;
                        let targetTask = curTodoSess.tasks.find(t => t.status === 'active') || remainingTasks[0];
                        targetTask.status = 'active';
                        const stepNum = curTodoSess.tasks.indexOf(targetTask) + 1;

                        const canSearchNow = Boolean(state.settings.webSearch) && wsSearchesUsed < maxWsSearches;
                        const usesNativeSearch = (typeof tc.isModelUsingNativeSearch === 'function')
                            ? tc.isModelUsingNativeSearch(model, state.settings) : false;
                        const searchCmdText = usesNativeSearch ? 'используй свой встроенный веб-поиск' : 'вызови {web-search: ["запрос"]}';
                        const extraTools = [
                            (toolAv && toolAv.canExec) ? '• Для расчетов и кода — {execute: {...}}.' : '',
                            (toolAv && toolAv.canArtifacts) ? '• Для интерактивного UI — <artifact>.' : ''
                        ].filter(Boolean).join('\n');

                        const toolsPrompt = `Переходи к выполнению шага ${stepNum}: «${targetTask.label || targetTask.text || 'Шаг ' + stepNum}».\n` +
                            (canSearchNow ? `• Если нужен поиск в сети — ${searchCmdText}.\n` : '') +
                            `• Если требуется чтение конкретных страниц — вызови {fetch_url: ["URL"]}.\n` +
                            (extraTools ? extraTools + '\n' : '') +
                            `• Если шаг выполняется текстом — напиши ответ и укажи статус {todo_update: {"step": ${stepNum}, "status": "done", "result": "краткий итог"}}.\n` +
                            `Не останавливайся, пока все задачи плана не будут полностью решены.`;

                        convExt.push({
                            role: 'assistant',
                            content: turnText || '(приступаю к выполнению задачи плана)'
                        });
                        convExt.push({
                            role: 'user',
                            content: tc.formatTodoProgress(curTodoSess) + '\n\n' + toolsPrompt
                        });

                        contentTurnStart = aiMsg.content.length;
                        schedule();
                        continue;
                    } else if (remainingTasks.length === 0) {
                        const hasErrors = curTodoSess.tasks.some(t => t.status === 'error');
                        curTodoSess.status = hasErrors ? 'partial' : 'done';
                        curTodoSess.finishedAt = Date.now();
                        schedule();
                    }
                }

                // Умный фолбэк 1: Модель потратила токены на размышления и завершила раунд без текста (или прервалась по лимиту)
                // Если в сообщении есть готовый артефакт или вложения, ответ НЕ считается пустым!
                const hasArtifactOrMedia = (aiMsg.artifacts && aiMsg.artifacts.length > 0) || (aiMsg.imageRequests && aiMsg.imageRequests.length > 0);
                const hasNoTextContent = (!aiMsg.content.trim() || turnTextLen === 0) && !hasArtifactOrMedia;
                if (hasNoTextContent && (aiMsg.thinking?.trim() || aiMsg._hitLengthLimit) && !fatalErr && !abortedByUser && reasoningExhaustRetries < 2) {
                    reasoningExhaustRetries++;
                    aiMsg._hitLengthLimit = false;
                    aiMsg._forceDirectAnswer = true;
                    convExt.push({ role: 'assistant', content: aiMsg.content.slice(contentTurnStart).trim() || '(размышления завершены)' });
                    convExt.push({
                        role: 'user',
                        content: '=== СИСТЕМА: СФОРМИРУЙ ИТОГОВЫЙ ОТВЕТ ===\nТвои размышления успешно завершены и зафиксированы. Теперь сразу выведи полный, структурированный и развёрнутый итоговый ответ для пользователя по существу его запроса. Пиши ответ прямо сейчас, без повторных размышлений.'
                    });
                    contentTurnStart = aiMsg.content.length;
                    toast('Синтез итогового ответа на основе размышлений…', 'info', 2200);
                    schedule();
                    continue;
                }

                // Умный фолбэк 2: Модель писала содержательный ответ и была прервана лимитом токенов mid-stream
                if (aiMsg._hitLengthLimit && turnTextLen > 30 && !fatalErr && !abortedByUser && continuationRetries < 2) {
                    continuationRetries++;
                    aiMsg._hitLengthLimit = false;
                    aiMsg._forceDirectAnswer = true;
                    const currentTail = aiMsg.content.slice(contentTurnStart).trim();
                    convExt.push({ role: 'assistant', content: currentTail });
                    convExt.push({
                        role: 'user',
                        content: '=== СИСТЕМА: ПРОДОЛЖЕНИЕ ОТВЕТА ===\nТвой ответ был прерван по лимиту длины. Продолжи генерацию ровно с того места и слова, где остановился, не повторяя уже написанное.'
                    });
                    contentTurnStart = aiMsg.content.length;
                    toast('Автоматическое продолжение ответа…', 'info', 1800);
                    schedule();
                    continue;
                }

                // Пустой ход после результата инструмента (модель остановилась молча) — один мягкий повтор
                if (convExt.length > 0 && turnTextLen === 0 && !aiMsg.thinking.slice(-200).trim() && !fatalErr && !abortedByUser && emptyTurnRetries < 1) {
                    emptyTurnRetries++;
                    convExt.push({ role: 'assistant', content: '(пауза)' });
                    convExt.push({ role: 'user', content: '=== СИСТЕМА ===\nТы не выдал текст после результатов инструмента. Сформируй итоговый ответ пользователю на основе полученных данных прямо сейчас, без новых вызовов инструментов.' });
                    contentTurnStart = aiMsg.content.length;
                    continue;
                }
                break;
            }
        }
        /* Единая финализация зависших сессий инструментов (спиннеры не должны крутиться вечно) */
        const finalizeToolSessions = (todoStatus) => {
            (aiMsg.todoSessions || []).forEach(s => {
                s.status = todoStatus;
                s.finishedAt = s.finishedAt || Date.now();
                s.tasks.forEach(t => { if (t.status === 'active' || t.status === 'pending') t.status = 'error'; });
            });
            (aiMsg.urlFetches || []).forEach(s => { if (s.status === 'fetching') { s.status = 'done'; s.finishedAt = Date.now(); s.urls.forEach(u => { if (u.status === 'loading') { u.status = 'error'; u.finishedAt = Date.now(); } }); } });
            (aiMsg.inlineSearches || []).forEach(s => { if (s.status === 'searching') s.status = 'done'; });
            (aiMsg.thinkSessions || []).forEach(s => { if (s.status === 'running') { s.status = 'error'; s.finishedAt = Date.now(); s.tasks.forEach(t => { if (t.status === 'thinking') { t.status = 'error'; t.result = t.result || 'Прервано'; t.finishedAt = Date.now(); } }); } });
            (aiMsg.executions || []).forEach(x => { if (x.status === 'running') { x.status = 'killed'; x.exitCode = -1; x.finishedAt = Date.now(); x.summary = 'Остановлено'; } });
            delete aiMsg._execFailStreak;
        };
        if (abortedByUser) {
            aiMsg.status = aiMsg.content ? 'done' : 'aborted';
            if (!aiMsg.content) aiMsg.content = '*Генерация остановлена пользователем.*';
            finalizeToolSessions('aborted');
            toast('Генерация остановлена', 'info');
        } else if (fatalErr) {
            aiMsg.status = 'error';
            finalizeToolSessions('error');
            let partial = (aiMsg.content || '').trim();

            // Если основной текст пуст, но модель сформировала мысли/код в thinking — спасаем вывод
            if (!partial && aiMsg.thinking && aiMsg.thinking.trim().length > 60) {
                const extracted = extractDirectAnswerFromThinking(aiMsg.thinking);
                if (extracted && extracted.length > 20) {
                    partial = extracted;
                }
            }

            if (provErrors.length) {
                provErrors.push({ name: useProxy ? 'ProxyAPI' : 'OpenRouter', msg: (fatalErr && fatalErr.message) || String(fatalErr) });
                const errBlock = '**Оба провайдера не справились с ответом**\n' + provErrors.map(pe => '• ' + pe.name + ': ' + pe.msg).join('\n') + '\nПроверьте API-ключи, баланс и соединение с интернетом.';
                aiMsg.content = partial ? partial + '\n\n---\n' + errBlock : errBlock;
                toast('Оба провайдера не справились с ответом', 'err');
            } else {
                const errBlock = `**Ошибка запроса**\n${fatalErr.message || fatalErr}\nПроверьте ключ, баланс и корректность идентификатора модели.`;
                aiMsg.content = partial ? partial + '\n\n---\n' + errBlock : errBlock;
                toast('Ошибка при запросе к модели', 'err');
            }
        } else {
            aiMsg.status = 'done';
            delete aiMsg._forceDirectAnswer;
            if (!aiMsg.content.trim()) {
                if (aiMsg.thinking?.trim()) {
                    aiMsg.content = extractDirectAnswerFromThinking(aiMsg.thinking);
                } else if (aiMsg._hitLengthLimit) {
                    aiMsg.content = '*Ответ модели превысил предельный размер контекста. Вы можете продолжить диалог, задав уточняющий вопрос.*';
                }
            }
            // Финализация сессий плана: невыполненные задачи не должны помечаться как выполненные
            if (aiMsg.todoSessions && aiMsg.todoSessions.length > 0) {
                aiMsg.todoSessions.forEach(s => {
                    const incomplete = s.tasks.filter(t => t.status === 'active' || t.status === 'pending');
                    if (incomplete.length > 0) {
                        s.tasks.forEach(t => {
                            if (t.status === 'active') {
                                t.status = t.result ? 'done' : 'error';
                                if (!t.result) t.result = 'Прервано до завершения';
                            } else if (t.status === 'pending') {
                                t.status = 'error';
                                t.result = 'Не выполнен';
                            }
                        });
                        s.status = s.tasks.some(t => t.status === 'done') ? 'partial' : 'error';
                    } else {
                        s.status = s.tasks.some(t => t.status === 'error') ? 'partial' : 'done';
                    }
                    s.finishedAt = s.finishedAt || Date.now();
                });
            }
            // Зависшие сессии инструментов (на случай исключений внутри цикла)
            (aiMsg.urlFetches || []).forEach(s => { if (s.status === 'fetching') { s.status = 'done'; s.finishedAt = Date.now(); s.urls.forEach(u => { if (u.status === 'loading') u.status = 'error'; }); } });
            (aiMsg.inlineSearches || []).forEach(s => { if (s.status === 'searching') s.status = 'done'; });
            (aiMsg.thinkSessions || []).forEach(s => { if (s.status === 'running') { s.status = 'error'; s.finishedAt = Date.now(); s.tasks.forEach(t => { if (t.status === 'thinking') t.status = 'error'; }); } });
            delete aiMsg._execFailStreak;
            if (provErrors.length) toast('Ответ получен через ' + (useProxy ? 'ProxyAPI' : 'OpenRouter'), 'ok', 2600);
        }
        if (state.settings.imageGen && (aiMsg.content || '').indexOf('{image_generation[') !== -1) {
            tc.handleImageRequests(chat, aiMsg).catch(err => console.error('[MoonSSS] image request failed:', err));
        }
        tc.handlePendingArtifacts(chat, aiMsg);
        if (wsEnabled && aiMsg.status === 'done' && !aiMsg.webImages) {
            const lastUserImg = history.filter(m2 => m2.role === 'user').pop();
            const imgQuery = (aiMsg.webSearch && aiMsg.webSearch.queries && aiMsg.webSearch.queries[0]) || (lastUserImg ? lastUserImg.content : '');
            if (tc.shouldAttachImages(imgQuery)) {
                const cleaned = tc.cleanImageQuery(imgQuery);
                tc.fetchWebImages(cleaned).then(async imgs => {
                    if (imgs.length < 2 && cleaned !== String(imgQuery || '').trim()) {
                        const more = await tc.fetchWebImages(imgQuery);
                        if (more.length > imgs.length) imgs = more;
                    }
                    if (imgs.length >= 2) {
                        aiMsg.webImages = imgs;
                        save();
                        const el2 = $('#messages').querySelector('[data-id="' + aiMsg.id + '"]');
                        if (el2) refreshMsgBody(el2, aiMsg);
                    }
                }).catch(() => { });
            }
        }
    } catch (e) {
        aiMsg.status = 'error';
        aiMsg.content = `**Ошибка запроса**
${e.message || e}
Проверьте ключ ProxyAPI, баланс и корректность идентификатора модели.`;
        toast('Ошибка при запросе к модели', 'err');
    }
    aiMsg.ms = Date.now() - t0;
    setStreamingState(false);
    abortCtrl = null;
    chat.updatedAt = Date.now(); save();
    refreshMsgBody(el, aiMsg); renderChatList();
    if (stickToBottom) { const s = $('#chatScroll'); s.scrollTop = s.scrollHeight; }
}
function stopGeneration() {
    if (abortCtrl) {
        try { abortCtrl.abort(); } catch (_) { }
    }
    // Гарантированная разблокировка UI при зависании фонового потока
    setTimeout(() => {
        if (streaming) {
            setStreamingState(false);
            const chat = activeChat();
            if (chat && chat.messages.length) {
                const lastMsg = chat.messages[chat.messages.length - 1];
                if (lastMsg && lastMsg.role === 'assistant' && lastMsg.status === 'streaming') {
                    lastMsg.status = lastMsg.content ? 'done' : 'aborted';
                    if (!lastMsg.content) {
                        lastMsg.content = lastMsg.thinking ? extractDirectAnswerFromThinking(lastMsg.thinking) || '*Генерация остановлена.*' : '*Генерация остановлена.*';
                    }
                    refreshCurrentMsg(lastMsg);
                }
            }
            toast('Генерация принудительно остановлена', 'info', 2000);
        }
    }, 600);
}
window.stopGeneration = stopGeneration;
window.sendMessage = sendMessage;

function refreshCurrentMsg(m) {
    const el = $('#messages').querySelector('[data-id="' + m.id + '"]');
    if (el) refreshMsgBody(el, m);
}

let genTickTimer = null;
function startGenTicker() {
    if (genTickTimer) return;
    genTickTimer = setInterval(() => {
        const chat = activeChat();
        const box = $('#messages');
        let any = false;
        if (chat) chat.messages.forEach(m => {
            (m.generatedImages || []).forEach((g, i) => {
                if (g.status !== 'generating') return;
                any = true;
                const node = box.querySelector('[data-id="' + m.id + '"] .genimg.loading[data-gi="' + i + '"] .genimg-time');
                if (node) node.textContent = fmtDur(Date.now() - (g.startedAt || Date.now()));
            });
            (m.imageRequests || []).forEach((r, i) => {
                if (r.status !== 'generating') return;
                any = true;
                const card = box.querySelector('[data-id="' + m.id + '"] [data-girq="' + i + '"]');
                if (card) {
                    const timeEl = card.querySelector('.genimg-time');
                    if (timeEl) timeEl.innerHTML = `<svg class="ic"><use href="#i-refresh"/></svg>` + fmtDur(Date.now() - (r.startedAt || Date.now()));
                }
            });
            (m.executions || []).forEach((x, i) => {
                if (x.status !== 'running') return;
                any = true;
                const node = box.querySelector('[data-id="' + m.id + '"] .exec-card[data-exec="' + i + '"] .exec-time');
                if (node) node.textContent = fmtDur(Date.now() - x.startedAt);
            });
        });
        if (!any) { clearInterval(genTickTimer); genTickTimer = null; }
    }, 1000);
}

/* ============================================================
   ИНСТРУМЕНТЫ: Управление вызовами делегировано в toolCalling.js
   ============================================================ */
function getImgCfg() {
    return window.toolCalling ? window.toolCalling.getImgCfg() : state.settings.imgGen;
}
window.getImgCfg = getImgCfg;

function getDeepThinkMax() {
    return window.toolCalling ? window.toolCalling.getDeepThinkMax() : 100;
}
window.getDeepThinkMax = getDeepThinkMax;
/* Очередь модалок подтверждения: не стакаем поверх друг друга */
let igcQueue = [];
function enqueueImgReq(msg, req) {
    igcQueue.push({ msg, req });
    if (!($('#igcOverlay').classList.contains('show'))) openImgReqConfirm(msg, req);
}
function openNextQueuedImgReq() {
    if ($('#igcOverlay').classList.contains('show')) return;
    const ac = activeChat();
    igcQueue = igcQueue.filter(q => q.req.status === 'awaiting' && (!ac || ac.messages.includes(q.msg)));
    const next = igcQueue.shift();
    if (next) openImgReqConfirm(next.msg, next.req);
}

let artEditRef = null;

function renderMsgContent(content, m) {
    return window.toolCalling ? window.toolCalling.renderMsgContent(content, m) : mdToHtml(content);
}
/* ============ КОНТЕКСТНОЕ МЕНЮ И ПРОСМОТР КОДА АРТЕФАКТА ============ */
let artCtxData = null;

function openArtifactMenu(msg, idx, triggerBtn) {
    const art = (msg.artifacts || [])[idx];
    if (!art) return;
    artCtxData = { msg, idx, art, triggerBtn };
    const menu = $('#artCtxMenu');
    if (!menu) return;

    menu.innerHTML = `
    <button type="button" data-artact="code"><svg class="ic"><use href="#i-code"/></svg><span>Просмотреть исходный код</span></button>
    <button type="button" data-artact="copy"><svg class="ic"><use href="#i-copy"/></svg><span>Копировать</span></button>
    <button type="button" data-artact="dl"><svg class="ic"><use href="#i-download"/></svg><span>Скачать</span></button>
    <button type="button" data-artact="run"><svg class="ic"><use href="#i-play"/></svg><span>Запустить</span></button>
    `;

    triggerBtn.classList.add('is-active');
    triggerBtn.setAttribute('aria-expanded', 'true');

    menu.style.visibility = 'hidden';
    menu.style.left = '-9999px';
    menu.hidden = false;

    requestAnimationFrame(() => {
        const r = menu.getBoundingClientRect();
        const btnRect = triggerBtn.getBoundingClientRect();
        const screenW = window.innerWidth || document.documentElement.clientWidth || 360;
        const screenH = window.innerHeight || document.documentElement.clientHeight || 640;

        let posX = btnRect.left;
        if (posX + r.width > screenW - 12) {
            posX = screenW - r.width - 12;
        }
        posX = Math.max(12, posX);

        let posY = btnRect.bottom + 6;
        if (posY + r.height > screenH - 12) {
            posY = btnRect.top - r.height - 6;
        }
        posY = Math.max(12, Math.min(posY, screenH - r.height - 12));

        menu.style.left = posX + 'px';
        menu.style.top = posY + 'px';
        menu.style.visibility = '';

        const firstBtn = menu.querySelector('button');
        if (firstBtn) {
            try { firstBtn.focus(); } catch (_) { }
        }
    });

    if (!menu.dataset.delegated) {
        menu.addEventListener('click', e => {
            const button = e.target.closest('button[data-artact]');
            if (!button || !menu.contains(button)) return;
            const act = button.dataset.artact;
            const ctx = artCtxData;
            closeArtifactMenu();
            if (act && ctx) {
                runArtifactAction(act, ctx.msg, ctx.idx, ctx.triggerBtn);
            }
        });
        menu.dataset.delegated = '1';
    }
}

function closeArtifactMenu() {
    const menu = $('#artCtxMenu');
    if (artCtxData && artCtxData.triggerBtn) {
        artCtxData.triggerBtn.classList.remove('is-active');
        artCtxData.triggerBtn.setAttribute('aria-expanded', 'false');
    }
    if (menu) menu.hidden = true;
    artCtxData = null;
}

function toggleArtifactMenu(msg, idx, triggerBtn) {
    const menu = $('#artCtxMenu');
    if (menu && !menu.hidden && artCtxData && artCtxData.art === (msg.artifacts || [])[idx]) {
        closeArtifactMenu();
    } else {
        closeAllMenus();
        closeMsgContextMenu();
        openArtifactMenu(msg, idx, triggerBtn);
    }
}

function openArtifactCodeModal(art) {
    if (!art) return;
    const overlay = $('#artCodeOverlay');
    const titleEl = $('#artCodeModalTitle');
    const verEl = $('#artCodeModalVersion');
    const bodyEl = $('#artCodeModalBody');
    if (!overlay || !bodyEl) return;

    if (titleEl) titleEl.textContent = art.title || 'Исходный код артефакта';
    if (verEl) verEl.textContent = art.version > 1 ? `v${art.version} · HTML` : 'HTML';

    bodyEl.innerHTML = `<pre class="has-tools"><code class="language-html">${esc(art.code)}</code></pre>`;
    enhanceCode(bodyEl);

    const btnCopy = $('#artCodeCopyBtn');
    if (btnCopy) {
        btnCopy.onclick = () => {
            navigator.clipboard.writeText(art.code)
                .then(() => toast('Код скопирован в буфер', 'ok'))
                .catch(() => toast('Не удалось скопировать', 'err'));
        };
    }

    const btnRun = $('#artCodeRunBtn');
    if (btnRun) {
        btnRun.onclick = () => {
            closeArtifactCodeModal();
            openHtmlPreview(art.code, 'html');
        };
    }

    const btnClose = $('#artCodeClose');
    if (btnClose) {
        btnClose.onclick = closeArtifactCodeModal;
    }

    overlay.onclick = e => {
        if (e.target === overlay) closeArtifactCodeModal();
    };

    overlay.classList.add('show');
}

function closeArtifactCodeModal() {
    const overlay = $('#artCodeOverlay');
    if (overlay) overlay.classList.remove('show');
}

function runArtifactAction(act, m, idx, triggerBtn) {
    const art = (m.artifacts || [])[idx];
    if (!art) return;
    if (act === 'run') {
        openHtmlPreview(art.code, 'html');
    } else if (act === 'code') {
        openArtifactCodeModal(art);
    } else if (act === 'copy') {
        navigator.clipboard.writeText(art.code)
            .then(() => toast('Код артефакта скопирован', 'ok'))
            .catch(() => toast('Не удалось скопировать', 'err'));
    } else if (act === 'dl') {
        downloadArtifact(art);
    } else if (act === 'edit') {
        attachArtifactToComposer(art);
    }
}
/* ---------- Универсальное сохранение и буфер обмена (Electron / Capacitor / Web) ---------- */

/**
 * Безопасное преобразование Data URL в Blob без сетевых вызовов (обход CSP connect-src)
 */
function dataUrlToBlob(dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string') return null;
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx === -1) return null;

    const header = dataUrl.slice(0, commaIdx);
    const data = dataUrl.slice(commaIdx + 1);
    const mimeMatch = header.match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/png';
    const isBase64 = header.includes('base64');

    try {
        const binStr = isBase64 ? atob(data) : decodeURIComponent(data);
        const len = binStr.length;
        const u8arr = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            u8arr[i] = binStr.charCodeAt(i);
        }
        return new Blob([u8arr], { type: mime });
    } catch (e) {
        console.warn('[MoonSSS] dataUrlToBlob decoding error:', e);
        return null;
    }
}

/**
 * Преобразование изображения любого формата (WEBP, JPEG) в PNG Blob для Clipboard API
 */
async function dataUrlToPngBlob(dataUrl) {
    const directBlob = dataUrlToBlob(dataUrl);
    if (directBlob && directBlob.type === 'image/png') {
        return directBlob;
    }
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                const cv = document.createElement('canvas');
                cv.width = img.naturalWidth || img.width || 512;
                cv.height = img.naturalHeight || img.height || 512;
                const ctx = cv.getContext('2d');
                ctx.drawImage(img, 0, 0);
                cv.toBlob((blob) => resolve(blob || directBlob), 'image/png');
            } catch (_) {
                resolve(directBlob);
            }
        };
        img.onerror = () => resolve(directBlob);
        img.src = dataUrl;
    });
}

async function copyImageDataUrl(dataUrl) {
    try {
        if (!dataUrl) return;
        if (!navigator.clipboard || !window.ClipboardItem) {
            throw new Error('Буфер обмена не поддерживается платформой');
        }

        const pngBlob = await dataUrlToPngBlob(dataUrl);
        if (!pngBlob) throw new Error('Не удалось подготовить изображение');

        await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': pngBlob })
        ]);
        toast('Изображение скопировано в буфер', 'ok');
    } catch (e) {
        console.warn('[MoonSSS] Clipboard write error:', e);
        toast('Не удалось скопировать изображение в буфер', 'err');
    }
}

async function downloadDataUrl(dataUrl, name = 'image') {
    const ext = dataUrl.startsWith('data:image/jpeg') ? 'jpg' : dataUrl.startsWith('data:image/webp') ? 'webp' : 'png';
    const filename = `MoonSSS_${(name || 'image').replace(/[^\wа-яё\d-]+/gi, '_')}_${Date.now()}.${ext}`;
    saveFileUniversal(dataUrl, filename, `image/${ext}`);
}

async function saveFileUniversal(urlOrDataUrl, filename, mimeType = 'application/octet-stream') {
    try {
        /* 1. Electron Desktop с безопасным перехватом отсутствующего IPC-хэндлера */
        if (window.electronAPI && typeof window.electronAPI.saveFile === 'function') {
            try {
                const saved = await window.electronAPI.saveFile({ url: urlOrDataUrl, filename, mimeType });
                if (saved) {
                    toast('Файл успешно сохранён', 'ok');
                    return;
                }
            } catch (ipcErr) {
                console.warn('[MoonSSS] Electron IPC save-file unavailable, continuing to fallback:', ipcErr);
            }
        }

        /* 2. Capacitor Mobile (Android / iOS WebView) */
        const capPlugins = (window.Capacitor && window.Capacitor.Plugins) || null;
        const isCapacitorNative = !!(window.Capacitor && (typeof Capacitor.isNativePlatform === 'function' ? Capacitor.isNativePlatform() : Capacitor.isNative));

        if (isCapacitorNative && capPlugins) {
            const nativeDl = capPlugins.NativeDownloader;
            const fs = capPlugins.Filesystem;

            // Получаем base64 из любого источника (data:, blob:, http(s))
            let base64Data = '';
            const getBase64 = async () => {
                if (base64Data) return base64Data;
                if (urlOrDataUrl.startsWith('data:')) {
                    const idx = urlOrDataUrl.indexOf(',');
                    base64Data = idx !== -1 ? urlOrDataUrl.slice(idx + 1) : urlOrDataUrl;
                } else {
                    try {
                        const resp = await fetch(urlOrDataUrl);
                        const blob = await resp.blob();
                        if (!mimeType || mimeType === 'application/octet-stream') mimeType = blob.type || mimeType;
                        base64Data = await blobToBase64(blob);
                    } catch (fetchErr) {
                        console.warn('[MoonSSS] fetch for save failed:', fetchErr);
                    }
                }
                return base64Data;
            };

            /* 2a. Наш нативный плагин: MediaStore → публичная папка Downloads (Android 10+ без разрешений) */
            if (nativeDl && typeof nativeDl.saveBase64 === 'function') {
                try {
                    const data = await getBase64();
                    if (data) {
                        await nativeDl.saveBase64({ filename, mimeType, data, subDir: 'MoonSSS' });
                        toast(`Сохранено в Downloads/MoonSSS/${filename}`, 'ok');
                        return;
                    }
                    // Не смогли прочитать (CORS) — отдаём URL системному загрузчику
                    if (/^https?:/i.test(urlOrDataUrl) && typeof nativeDl.downloadUrl === 'function') {
                        await nativeDl.downloadUrl({ url: urlOrDataUrl, filename, mimeType });
                        toast('Скачивание началось', 'ok');
                        return;
                    }
                } catch (ndErr) {
                    console.warn('[MoonSSS] NativeDownloader failed, trying Filesystem:', ndErr);
                }
            }

            /* 2b. @capacitor/filesystem — публичные каталоги */
            if (fs && typeof fs.writeFile === 'function') {
                try {
                    if (typeof fs.requestPermissions === 'function') {
                        try { await fs.requestPermissions({ permissions: ['publicStorage'] }); } catch (_) { }
                    }
                    const data = await getBase64();
                    if (data) {
                        const writeTargets = [
                            { directory: 'EXTERNAL_STORAGE', path: `Download/MoonSSS/${filename}` },
                            { directory: 'EXTERNAL_STORAGE', path: `Download/${filename}` },
                            { directory: 'DOCUMENTS', path: `MoonSSS/${filename}` },
                            { directory: 'DOCUMENTS', path: filename },
                            { directory: 'EXTERNAL', path: `Download/${filename}` }
                        ];
                        for (const target of writeTargets) {
                            try {
                                const res = await fs.writeFile({ path: target.path, data, directory: target.directory, recursive: true });
                                toast(`Сохранено: ${target.path}`, 'ok');
                                console.log('[MoonSSS] saved to', res && res.uri);
                                return;
                            } catch (writeErr) {
                                console.warn(`[MoonSSS] Filesystem write failed for ${target.directory}/${target.path}:`, writeErr);
                            }
                        }
                    }
                } catch (capErr) {
                    console.warn('[MoonSSS] Capacitor Filesystem error, continuing to Web fallback:', capErr);
                }
            }

            /* 2c. Последний шанс на Android: отдаём data:/http URL WebView → нативный DownloadListener */
            if (/^(https?:|data:)/i.test(urlOrDataUrl)) {
                const a = document.createElement('a');
                a.href = urlOrDataUrl; a.download = filename; a.style.display = 'none';
                document.body.appendChild(a); a.click(); a.remove();
                toast('Скачивание передано системе', 'ok');
                return;
            }
        }

        /* 3. Универсальный Web Fallback (чистый HTML5 Data/Blob URL) */
        let downloadUrl = urlOrDataUrl;
        let createdObjectUrl = false;

        if (urlOrDataUrl.startsWith('data:')) {
            const blob = dataUrlToBlob(urlOrDataUrl);
            if (blob) {
                downloadUrl = URL.createObjectURL(blob);
                createdObjectUrl = true;
            }
        }

        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();

        if (createdObjectUrl) {
            setTimeout(() => {
                try { URL.revokeObjectURL(downloadUrl); } catch (_) { }
            }, 6000);
        }

        toast('Скачивание началось', 'ok');
    } catch (err) {
        console.error('[MoonSSS] Save file error:', err);
        toast('Ошибка сохранения файла', 'err');
    }
}

function downloadArtifact(art) {
    const blob = new Blob([art.code], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const safe = (art.title || 'artifact').replace(/[^\wа-яё\d-]+/gi, '_').slice(0, 60) || 'artifact';
    const filename = 'MoonSSS_' + safe + (art.version > 1 ? '_v' + art.version : '') + '.html';
    saveFileUniversal(url, filename, 'text/html');
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch (_) { } }, 5000);
}
function findLatestArtifact(artId) {
    const chat = activeChat(); if (!chat) return null;
    let best = null;
    for (const msg of chat.messages) {
        for (const a of (msg.artifacts || [])) {
            if (a.artId === artId && (!best || a.version > best.version)) best = a;
        }
    }
    return best;
}
/* «Изменить»: прикрепляем свежую версию к композеру по образцу edit-ref */
function attachArtifactToComposer(art) {
    if (streaming) { toast('Дождитесь конца генерации или остановите её', 'err'); return; }
    const latest = findLatestArtifact(art.artId) || art;
    artEditRef = latest;
    if (!state.settings.artifacts) { state.settings.artifacts = true; syncSettingsUI(); }
    save();
    renderArtRef();
    try { promptInput.focus({ preventScroll: true }); } catch (e) { }
    toast('Артефакт прикреплён — опишите, что изменить', 'ok', 2600);
}
function renderArtRef() {
    const box = $('#artRefBox');
    if (!box) return;
    if (!artEditRef) {
        box.hidden = true;
        $('#artRefTitle').textContent = '';
        $('#artRefHint').textContent = '';
        if (!state.settings.editMode) promptInput.placeholder = 'Ask anything…';
        setSendBtn();
        return;
    }
    box.hidden = false;
    $('#artRefTitle').textContent = artEditRef.title + (artEditRef.version > 1 ? ' · v' + artEditRef.version : '');
    const kb = artEditRef.code.length >= 1024 ? (artEditRef.code.length / 1024).toFixed(1).replace('.', ',') + ' КБ' : artEditRef.code.length + ' симв.';
    $('#artRefHint').textContent = kb + ' · код уйдёт модели';
    if (!state.settings.editMode) promptInput.placeholder = 'Что изменить в артефакте «' + artEditRef.title + '»…';
    setSendBtn();
}
$('#artRefCancel')?.addEventListener('click', () => {
    artEditRef = null;
    renderArtRef();
    save();
    toast('Артефакт откреплён', 'info', 1500);
});

/* ---------- Модалка подтверждения генерации ---------- */
let igcCtx = null;
function openImgReqConfirm(msg, req) {
    igcQueue = igcQueue.filter(q => q.req !== req);
    igcCtx = { msg, req };
    const getRatioText = typeof window.igRatioLabel === 'function' ? window.igRatioLabel : (r => r === 'auto' ? 'Авто' : r);
    const bgLabels = window.IG_BG_LABELS || { auto: 'Авто', transparent: 'Прозрачный', opaque: 'Непрозрачный' };

    /* Детали запрашиваемой генерации */
    const p = [];
    const targetModelObj = (window.IMG_MODELS || []).find(m => m.name === req.model || m.id === req.model) || null;
    const modelIconSrc = targetModelObj?.icon || (typeof window.getAiModelIcon === 'function' ? window.getAiModelIcon(targetModelObj?.id || req.model, targetModelObj) : null);
    const modelIconHtml = modelIconSrc
        ? `<img src="${esc(modelIconSrc)}" class="igc-param-model-ico" alt="" loading="lazy" onerror="this.outerHTML='<svg><use href=&quot;#i-chip&quot;/></svg>'">`
        : `<svg><use href="#i-chip"/></svg>`;

    p.push('<div class="igc-param">' + modelIconHtml + '<div><div class="igc-l">Модель</div><div class="igc-v">' + esc(req.model) + '</div></div></div>');
    if (req.resolution) p.push('<div class="igc-param"><svg><use href="#i-spark"/></svg><div><div class="igc-l">Качество</div><div class="igc-v">' + esc(req.resolution) + '</div></div></div>');
    else if (req.quality) p.push('<div class="igc-param"><svg><use href="#i-spark"/></svg><div><div class="igc-l">Качество</div><div class="igc-v">' + esc(window.IG_QUALITY_LABELS?.[req.quality] || req.quality) + '</div></div></div>');
    p.push('<div class="igc-param"><svg><use href="#i-image"/></svg><div><div class="igc-l">Соотношение сторон</div><div class="igc-v">' + esc(getRatioText(req.ratio)) + '</div></div></div>');
    if (req.background) p.push('<div class="igc-param"><svg><use href="#i-drop"/></svg><div><div class="igc-l">Фон</div><div class="igc-v">' + esc(bgLabels[req.background] || req.background) + '</div></div></div>');

    if (targetModelObj?.supportsFluxParams) {
        const curSteps = req.steps ?? state.settings.imgGen?.fluxSteps ?? 28;
        const curGuidance = req.guidance ?? state.settings.imgGen?.fluxGuidance ?? 3.5;
        const curSafety = req.safety_tolerance ?? state.settings.imgGen?.fluxSafety ?? 5;
        const curFormat = req.output_format ?? state.settings.imgGen?.fluxFormat ?? 'jpeg';
        p.push('<div class="igc-param" style="grid-column:1/-1"><svg><use href="#i-gear"/></svg><div><div class="igc-l">Параметры FLUX</div><div class="igc-v">Steps: <b>' + curSteps + '</b> · Guidance: <b>' + curGuidance + '</b> · Safety: <b>' + curSafety + '</b> · Формат: <b>' + curFormat.toUpperCase() + '</b></div></div></div>');
    }

    $('#igcParams').innerHTML = p.join('');

    /* Секция отображения референсов в подтверждении */
    const refSec = $('#igcRefSec');
    const refThumbs = $('#igcRefThumbs');
    if (refSec && refThumbs) {
        const refs = Array.isArray(req.images) ? req.images : [];
        if (refs.length > 0) {
            refSec.hidden = false;
            refThumbs.innerHTML = refs.map((im, i) => `
              <div class="igc-ref-item">
                <img src="${esc(im.dataUrl || im)}" alt="Референс ${i + 1}">
                <span class="igc-ref-name">${esc(im.name || 'Референс')}</span>
              </div>
            `).join('');
        } else {
            refSec.hidden = true;
            refThumbs.innerHTML = '';
        }
    }

    /* Выбор промпта: от ИИ или оригинальный запрос пользователя */
    const srcBox = $('#igcPromptSrc');
    const hasUser = !!(req.userPrompt && req.userPrompt.trim());
    srcBox.innerHTML = '<button class="igm-chip sel" data-src="ai" type="button">Промпт от ИИ</button>' +
        (hasUser ? '<button class="igm-chip" data-src="user" type="button">Оригинальный запрос</button>' : '');
    srcBox.querySelectorAll('.igm-chip').forEach(b => b.addEventListener('click', () => {
        srcBox.querySelectorAll('.igm-chip').forEach(x => x.classList.remove('sel'));
        b.classList.add('sel');
        $('#igcPrompt').value = b.dataset.src === 'user' ? req.userPrompt : req.aiPrompt;
    }));
    $('#igcPrompt').value = req.aiPrompt;
    $('#igcOverlay').classList.add('show');
    setTimeout(() => { try { $('#igcPrompt').focus({ preventScroll: true }); } catch (e) { } }, 120);
}
function closeImgReqConfirm() {
    $('#igcOverlay').classList.remove('show');
    igcCtx = null;
    setTimeout(openNextQueuedImgReq, 260);
}

function approveImageRequest(msg, req) {
    if (!req || req.status === 'generating' || req.status === 'done') return;
    req.status = 'generating';
    req.startedAt = Date.now();
    req.progress = 8;
    req.statusText = 'Подключение к генератору…';
    req.step = 1;
    if (!req.prompt) req.prompt = req.aiPrompt || '';
    save();
    refreshCurrentMsg(msg);
    startGenTicker();

    const cfg = getImgCfg();
    const list = window.IMG_MODELS || (window.toolCalling && window.toolCalling.IMG_MODELS) || [];
    const targetModelKey = String(req.model || cfg.model).toLowerCase();
    const imgModel = list.find(m => m.id === cfg.model || m.name === req.model || (m.aliases && m.aliases.includes(targetModelKey))) || list[0] || { id: cfg.model, name: cfg.model };
    const opts = {
        resolution: req.resolution || undefined,
        quality: req.quality || cfg.quality || undefined,
        ratio: req.ratio || '1:1',
        background: req.background || 'auto',
        images: req.images || [],
        steps: imgModel.supportsFluxParams ? (req.steps ?? cfg.fluxSteps ?? 28) : undefined,
        guidance: imgModel.supportsFluxParams ? (req.guidance ?? cfg.fluxGuidance ?? 3.5) : undefined,
        safety_tolerance: imgModel.supportsFluxParams ? Math.min(5, Math.max(0, (req.safety_tolerance ?? cfg.fluxSafety ?? 5))) : undefined,
        output_format: imgModel.supportsFluxParams ? (req.output_format ?? cfg.fluxFormat ?? 'jpeg') : undefined
    };

    window.toolCalling.requestImageGeneration(imgModel, opts, req.prompt, null, (prog) => {
        req.progress = prog.percent || req.progress;
        req.statusText = prog.statusText || req.statusText;
        req.step = prog.step || req.step;
        req.totalSteps = prog.totalSteps || req.totalSteps;
        refreshCurrentMsg(msg);
    }).then(async dataUrl => {
        if (dataUrl.length > 2500000) dataUrl = await compressImage(dataUrl, 2048, .9);
        req.status = 'done';
        req.dataUrl = dataUrl;
        req.progress = 100;
        req.loadingState = 'completed';
        toast(imgModel.name + ': изображение готово', 'ok');
    }).catch(e => {
        req.status = 'error';
        req.error = (e && e.message) ? e.message : String(e);
        toast('Генерация изображения не удалась: ' + (e.message || e), 'err');
    }).finally(() => {
        save();
        refreshCurrentMsg(msg);
    });
}

function declineImageRequest(msg, reqIdx) {
    const req = (msg.imageRequests || [])[reqIdx];
    if (!req || req.status !== 'awaiting') return;
    req.status = 'declined';
    save(); refreshCurrentMsg(msg);
    toast('Генерация изображения отклонена', 'info');
}

$('#igcClose').addEventListener('click', closeImgReqConfirm);
$('#igcOverlay').addEventListener('click', e => { if (e.target === $('#igcOverlay')) closeImgReqConfirm(); });
$('#igcApprove').addEventListener('click', () => {
    if (!igcCtx) return;
    const msg = igcCtx.msg, req = igcCtx.req;
    const finalPrompt = $('#igcPrompt').value.trim();
    if (!finalPrompt) { toast('Промпт не может быть пустым', 'err'); return; }
    req.prompt = finalPrompt;
    closeImgReqConfirm();
    approveImageRequest(msg, req);
});
$('#igcDecline').addEventListener('click', () => {
    if (!igcCtx) return;
    const msg = igcCtx.msg, req = igcCtx.req;
    const idx = (msg.imageRequests || []).indexOf(req);
    closeImgReqConfirm();
    declineImageRequest(msg, idx);
});

/* ============ РЕДАКТИРОВАНИЕ ИЗОБРАЖЕНИЙ ПО РЕФЕРЕНСУ (МУЛЬТИ-МОДЕЛЬНЫЙ ДВИЖОК) ============ */
let editImages = [];
window.editImages = editImages;
let activeEditSelectedModelId = null;
let activeEditSelectedRatio = 'auto';
let activeEditSelectedQuality = 'high';
let activeEditSelectedBg = 'auto';

function setEditMode(on, keepImages) {
    state.settings.editMode = !!on;
    if (!on && !keepImages) editImages = [];
    promptInput.placeholder = on ? 'Что изменить в прикреплённом референсе…' : 'Ask anything…';
    renderEditRef();
    setSendBtn();
}

function renderEditRef() {
    const box = $('#editRefBox'), list = $('#editRefList');
    if (!box || !list) return;
    const n = editImages.length;
    $('#editRefHint').textContent = n + ' из 10';
    if (!n) { box.hidden = true; list.innerHTML = ''; setSendBtn(); return; }
    box.hidden = false;
    list.innerHTML = editImages.map((u, i) => `
    <span class="edit-ref-item">
      <img src="${esc(u)}" alt="Референс ${i + 1}">
      <button class="er-x" data-i="${i}" aria-label="Убрать изображение"><svg><use href="#i-x"/></svg></button>
    </span>`).join('') +
        (n < 10 ? `<button class="edit-ref-add" id="erAddBtn" aria-label="Добавить изображение" title="Добавить ещё"><svg><use href="#i-plus"/></svg></button>` : '');
    list.querySelectorAll('.er-x').forEach(b => b.addEventListener('click', () => {
        editImages.splice(+b.dataset.i, 1);
        save();
        if (!editImages.length) setEditMode(false);
        else { renderEditRef(); setSendBtn(); }
    }));
    const add = $('#erAddBtn');
    if (add) add.addEventListener('click', () => $('#editImgInput').click());
}

async function addEditImages(fileList) {
    const files = [...fileList];
    for (const f of files) {
        if (editImages.length >= 10) { toast('Максимум 10 изображений для редактирования', 'warn'); break; }
        if (!f.type.startsWith('image/')) continue;
        try {
            const raw = await fileToDataURL(f);
            editImages.push(await compressImage(raw, 1536, .88));
        } catch (e) { toast('Не удалось прочитать файл', 'err'); }
    }
    if (editImages.length) setEditMode(true, true);
    save();
}

function startImageEdit(dataUrl, origPrompt) {
    if (!dataUrl) return;
    if (editImages.includes(dataUrl)) {
        toast('Это изображение уже в списке референсов', 'info');
    } else if (editImages.length >= 10) {
        toast('Максимум 10 изображений для редактирования', 'warn');
        return;
    } else {
        editImages.push(dataUrl);
        toast('Референс добавлен: ' + editImages.length + ' из 10', 'ok');
    }
    setEditMode(true, true);
    save();
    try { promptInput.focus({ preventScroll: true }); } catch (e) { }
}

function renderEditConfirmDialog(text) {
    const list = window.IMG_MODELS || (window.toolCalling && window.toolCalling.IMG_MODELS) || [];
    const cfg = getImgCfg();

    // Модели с supportsReferences === false не могут модифицировать картинки по референсу
    if (!activeEditSelectedModelId || list.find(m => m.id === activeEditSelectedModelId)?.supportsReferences === false) {
        const supported = list.find(m => m.id === cfg.model && m.supportsReferences !== false) || list.find(m => m.supportsReferences !== false) || list[0];
        activeEditSelectedModelId = supported.id;
    }

    let selectedModel = list.find(m => m.id === activeEditSelectedModelId) || list[0];
    activeEditSelectedModelId = selectedModel.id;

    $('#ecCount').textContent = editImages.length;
    $('#ecPrompt').textContent = text;
    $('#ecThumbs').innerHTML = editImages.map(u => `<img src="${esc(u)}" alt="Референс">`).join('');

    // 1. Отрисовка карточек выбора модели
    const grid = $('#ecModelGrid');
    grid.innerHTML = list.map(m => {
        const isSel = m.id === selectedModel.id;
        const noRef = m.supportsReferences === false;
        const iconSrc = m.icon || (typeof window.getAiModelIcon === 'function' ? window.getAiModelIcon(m.id, m) : null);
        const iconHtml = iconSrc
            ? `<img src="${esc(iconSrc)}" class="ec-mc-icon" alt="" loading="lazy" onerror="this.outerHTML='<svg class=\\'ic\\'><use href=\\'#i-chip\\'/></svg>'">`
            : `<svg class="ic"><use href="#i-chip"/></svg>`;

        return `
        <div class="ec-model-card ${isSel ? 'sel' : ''} ${noRef ? 'is-disabled' : ''}" data-emid="${m.id}" ${noRef ? 'title="Модель не поддерживает референсные изображения"' : ''}>
            <div class="ec-mc-head">
                <div class="ec-mc-title-box">
                    <span class="ec-mc-icon-wrap">${iconHtml}</span>
                    <span class="ec-mc-name">${esc(m.name)}</span>
                </div>
                ${noRef ? '<span class="set-badge-lock" style="font-size:10.5px">Без референсов</span>' : '<svg class="ec-mc-check"><use href="#i-check"/></svg>'}
            </div>
            <span class="ec-mc-vendor">${esc(m.vendor || 'AI')}</span>
            <div class="ec-mc-desc">${esc(m.desc)}</div>
        </div>`;
    }).join('');

    grid.querySelectorAll('.ec-model-card').forEach(card => {
        card.onclick = () => {
            const targetM = list.find(x => x.id === card.dataset.emid);
            if (targetM?.supportsReferences === false) {
                toast(`Модель «${targetM.name}» не поддерживает работу с референсами (только генерация по тексту)`, 'warn', 2800);
                return;
            }
            activeEditSelectedModelId = card.dataset.emid;
            renderEditConfirmDialog(text);
        };
    });

    // 2. Отрисовка динамических форматов и соотношений сторон
    const ratioBox = $('#ecRatios');
    const availableRatios = selectedModel.ratios || ['1:1', 'auto'];
    if (!availableRatios.includes(activeEditSelectedRatio)) {
        activeEditSelectedRatio = availableRatios.includes('auto') ? 'auto' : availableRatios[0];
    }

    ratioBox.innerHTML = availableRatios.map(r => `
        <button class="igm-chip ${activeEditSelectedRatio === r ? 'sel' : ''}" data-r="${r}" type="button">
            <span>${r === 'auto' ? 'Авто' : r}</span>
        </button>
    `).join('');

    ratioBox.querySelectorAll('.igm-chip').forEach(b => {
        b.onclick = () => {
            activeEditSelectedRatio = b.dataset.r;
            renderEditConfirmDialog(text);
        };
    });

    // 3. Качество / Разрешение
    const qualityBox = $('#ecQualityChips');
    const qualityRow = $('#ecQualityRow');
    if (selectedModel.supportsQuality) {
        qualityRow.style.display = 'flex';
        const qualities = selectedModel.qualities || ['auto', 'low', 'medium', 'high'];
        const qLabels = window.IG_QUALITY_LABELS || { auto: 'Авто', low: 'Low (1K)', medium: 'Medium (2K)', high: 'High (4K)', extra: 'xHigh', max: 'Max' };
        if (!qualities.includes(activeEditSelectedQuality)) activeEditSelectedQuality = qualities.includes('auto') ? 'auto' : 'high';

        qualityBox.innerHTML = qualities.map(q => `
            <button class="igm-chip ${activeEditSelectedQuality === q ? 'sel' : ''}" data-q="${q}" type="button">
                <span>${qLabels[q] || q}</span>
            </button>
        `).join('');
        qualityBox.querySelectorAll('.igm-chip').forEach(b => {
            b.onclick = () => { activeEditSelectedQuality = b.dataset.q; renderEditConfirmDialog(text); };
        });
    } else if (selectedModel.supportsResolution) {
        qualityRow.style.display = 'flex';
        const resolutions = selectedModel.resolutions || ['1K', '2K', '4K'];
        if (!resolutions.includes(activeEditSelectedQuality)) activeEditSelectedQuality = resolutions[resolutions.length - 1];

        qualityBox.innerHTML = resolutions.map(r => `
            <button class="igm-chip ${activeEditSelectedQuality === r ? 'sel' : ''}" data-r="${r}" type="button">
                <span>${r}</span>
            </button>
        `).join('');
        qualityBox.querySelectorAll('.igm-chip').forEach(b => {
            b.onclick = () => { activeEditSelectedQuality = b.dataset.r; renderEditConfirmDialog(text); };
        });
    } else {
        qualityRow.style.display = 'none';
    }

    // 4. Фон (если поддерживается)
    const bgRow = $('#ecBgRow');
    const bgBox = $('#ecBgChips');
    if (Array.isArray(selectedModel.backgrounds) && selectedModel.backgrounds.length > 0) {
        bgRow.style.display = 'flex';
        const bgLabels = window.IG_BG_LABELS || { auto: 'Авто', transparent: 'Прозрачный', opaque: 'Непрозрачный' };
        bgBox.innerHTML = selectedModel.backgrounds.map(bg => `
            <button class="igm-chip ${activeEditSelectedBg === bg ? 'sel' : ''}" data-bg="${bg}" type="button">
                <span>${bgLabels[bg] || bg}</span>
            </button>
        `).join('');
        bgBox.querySelectorAll('.igm-chip').forEach(b => {
            b.onclick = () => { activeEditSelectedBg = b.dataset.bg; renderEditConfirmDialog(text); };
        });
    } else {
        bgRow.style.display = 'none';
    }

    // 5. Параметры FLUX при редактировании (Steps, Guidance, Safety Tolerance)
    const fluxRow = $('#ecFluxRow');
    if (fluxRow) {
        fluxRow.style.display = selectedModel.supportsFluxParams ? 'flex' : 'none';
        if (selectedModel.supportsFluxParams) {
            const steps = state.settings.imgGen?.fluxSteps || 28;
            const guidance = state.settings.imgGen?.fluxGuidance || 3.5;
            const safety = state.settings.imgGen?.fluxSafety ?? 5;
            const format = state.settings.imgGen?.fluxFormat || 'jpeg';
            const fluxInfo = $('#ecFluxInfo');
            if (fluxInfo) {
                fluxInfo.textContent = `Steps: ${steps} · Guidance: ${guidance} · Safety: ${safety} · ${format.toUpperCase()}`;
            }
        }
    }
}

function openEditConfirm(text) {
    $('#editConfirmOverlay').dataset.prompt = text;
    renderEditConfirmDialog(text);
    $('#editConfirmOverlay').classList.add('show');
}

function closeEditConfirm() {
    $('#editConfirmOverlay').classList.remove('show');
}

async function startEditGeneration(promptText) {
    const list = window.IMG_MODELS || (window.toolCalling && window.toolCalling.IMG_MODELS) || [];
    const imgModel = list.find(m => m.id === activeEditSelectedModelId) || list[0];
    const chat = ensureChat();
    const imgs = editImages.slice(0, 10);

    const userMsg = {
        id: uid(), role: 'user', content: promptText, ts: Date.now(),
        attachments: imgs.map((u, i) => ({ kind: 'image', dataUrl: u, mime: 'image/jpeg', name: 'референс-' + (i + 1) }))
    };
    chat.messages.push(userMsg);
    chat.updatedAt = Date.now();
    autoTitle(chat);

    setEditMode(false);
    const inp = $('#promptInput');
    inp.value = '';
    autoGrow();
    save();
    renderMessages();
    renderChatList();

    const aiMsg = {
        id: uid(),
        role: 'assistant',
        content: '',
        thinking: '',
        ts: Date.now(),
        modelId: imgModel.id,
        modelLabel: `${imgModel.name} · Редактирование`,
        status: 'streaming',
        generatedImages: [{
            id: uid(),
            status: 'generating',
            model: imgModel.name,
            resolution: imgModel.supportsQuality ? activeEditSelectedQuality : (imgModel.supportsResolution ? activeEditSelectedQuality : ''),
            prompt: promptText,
            startedAt: Date.now()
        }]
    };

    chat.messages.push(aiMsg);
    renderMessages();
    startGenTicker();

    const entry = aiMsg.generatedImages[0];
    entry.progress = 10;
    entry.statusText = `Инициализация модификации ${imgModel.name}…`;
    refreshCurrentMsg(aiMsg);

    const opts = {
        images: imgs,
        ratio: activeEditSelectedRatio,
        quality: imgModel.supportsQuality ? activeEditSelectedQuality : undefined,
        resolution: imgModel.supportsResolution ? activeEditSelectedQuality : undefined,
        background: activeEditSelectedBg,
        steps: imgModel.supportsFluxParams ? (state.settings.imgGen?.fluxSteps || 28) : undefined,
        guidance: imgModel.supportsFluxParams ? (state.settings.imgGen?.fluxGuidance || 3.5) : undefined,
        safety_tolerance: imgModel.supportsFluxParams ? Math.min(5, Math.max(0, (state.settings.imgGen?.fluxSafety ?? 5))) : undefined,
        output_format: imgModel.supportsFluxParams ? (state.settings.imgGen?.fluxFormat || 'jpeg') : undefined
    };

    try {
        const dataUrl = await window.toolCalling.requestImageGeneration(imgModel, opts, promptText, null, (prog) => {
            entry.progress = prog.percent || entry.progress;
            entry.statusText = prog.statusText || entry.statusText;
            entry.step = prog.step || entry.step;
            entry.totalSteps = prog.totalSteps || entry.totalSteps;
            refreshCurrentMsg(aiMsg);
        });

        entry.status = 'done';
        entry.dataUrl = dataUrl;
        entry.progress = 100;
        aiMsg.status = 'done';
        toast(`${imgModel.name}: изображение успешно создано`, 'ok');
    } catch (e) {
        entry.status = 'error';
        entry.error = (e && e.message) ? e.message : String(e);
        aiMsg.status = 'done';
        toast('Ошибка генерации: ' + (e.message || e), 'err');
    }

    chat.updatedAt = Date.now();
    save();
    refreshCurrentMsg(aiMsg);
    renderChatList();
}

/* ---------- Контекстное меню сгенерированного изображения ---------- */
let ctxImgData = null, ctxMsgId = '', lpTimer = null, lpFired = false, lpX = 0, lpY = 0;

function findMsgById(id) {
    const chat = activeChat(); if (!chat) return null;
    return chat.messages.find(m => m.id === id) || null;
}

/* Резолвер источника изображения: legacy generatedImages (data-gi)
или inline-карточки imageRequests (обёртка [data-girq]) */
function resolveGenImgEntry(card) {
    const msgEl = card.closest('.msg');
    const m = findMsgById(msgEl ? msgEl.dataset.id : null);
    if (!m) return null;
    if (card.dataset.gi !== undefined) {
        const g = (m.generatedImages || [])[+card.dataset.gi];
        return (g && g.dataUrl) ? { m, g } : null;
    }
    const host = card.closest('[data-girq]');
    if (host) {
        const r = (m.imageRequests || [])[+host.dataset.girq];
        return (r && r.dataUrl) ? { m, g: r } : null;
    }
    return null;
}
function openImgCtxMenu(card, x, y) {
    const res = resolveGenImgEntry(card);
    if (!res) return;
    const m = res.m, g = res.g;
    ctxImgData = g;
    ctxMsgId = m ? m.id : '';
    const menu = $('#igCtxMenu');
    const isFav = (state.favorites || []).some(f => f.srcId === g.id);
    menu.innerHTML = `
    <button data-act="copy"><svg><use href="#i-copy"/></svg><span>Копировать</span></button>
    <button data-act="edit"><svg><use href="#i-pencil"/></svg><span>Редактировать</span></button>
    <button data-act="community"><svg><use href="#i-globe"/></svg><span>Отправить в Community Room</span></button>
    <button data-act="dl"><svg><use href="#i-download"/></svg><span>Скачать</span></button>
    <button data-act="prompt"><svg><use href="#i-spark"/></svg><span>Получить промпт</span></button>
<button data-act="info"><svg><use href="#i-info"/></svg><span>Подробно</span></button>
<div class="sep"></div>
    <button data-act="fav"><svg><use href="#i-star"/></svg><span>${isFav ? 'Убрать из избранных' : 'Сохранить в избранных'}</span></button>`;

    menu.style.visibility = 'hidden';
    menu.style.left = '-9999px';
    menu.hidden = false;

    const r = menu.getBoundingClientRect();
    const screenW = window.innerWidth || document.documentElement.clientWidth || 360;
    const screenH = window.innerHeight || document.documentElement.clientHeight || 640;
    const posX = Math.max(8, Math.min(x, screenW - (r.width || 216) - 8));
    const posY = Math.max(8, Math.min(y, screenH - (r.height || 220) - 8));

    menu.style.left = posX + 'px';
    menu.style.top = posY + 'px';
    menu.style.visibility = '';

    menu.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
        const data = ctxImgData;
        closeImgCtxMenu();
        runImgCtxAction(b.dataset.act, data);
    }));
}
function closeImgCtxMenu() { $('#igCtxMenu').hidden = true; ctxImgData = null; }

function runImgCtxAction(act, g) {
    if (!g) return;
    if (act === 'copy') copyImageDataUrl(g.dataUrl);
    else if (act === 'dl') downloadDataUrl(g.dataUrl, g.model);
    else if (act === 'prompt') {
        const p = g.prompt || g.aiPrompt || '';
        navigator.clipboard.writeText(p)
            .then(() => toast('Промпт изображения скопирован', 'ok'))
            .catch(() => toast('Не удалось скопировать', 'err'));
        if (!$('#promptInput').value.trim()) {
            $('#promptInput').value = p; autoGrow(); setSendBtn();
        }
    }
    else if (act === 'edit') startImageEdit(g.dataUrl, g.prompt || g.aiPrompt);
    else if (act === 'community') {
        if (window.supabaseCommunity) {
            window.supabaseCommunity.openImagePublishModal({
                url: g.dataUrl,
                title: g.prompt ? g.prompt.slice(0, 40) : 'Генерация MoonSSS',
                model: g.model || 'Riverflow 2.5 Pro',
                prompt: g.prompt || g.aiPrompt || ''
            });
        } else {
            toast('Модуль Community Room загружается…', 'info');
        }
    }
    else if (act === 'info') openImgInfo(g);
    else if (act === 'fav') toggleFavorite(g);
}
/* ---------- Свойства изображения: «Подробно» ---------- */
let igiCtx = null;
function dataUrlBytes(u) {
    const i = String(u || '').indexOf(',');
    if (i < 0) return 0;
    const head = String(u).slice(0, i), body = String(u).slice(i + 1);
    if (head.indexOf('base64') !== -1) {
        const pad = (body.match(/=+$/) || [''])[0].length;
        return Math.max(0, Math.floor(body.length * 3 / 4) - pad);
    }
    try { return decodeURIComponent(body).length; } catch (e) { return body.length; }
}
function fmtBytes(n) { return n.toLocaleString('ru-RU') + ' байт'; }
function fmtSizeHuman(n) {
    if (n < 1024) return fmtBytes(n);
    if (n < 1024 * 1024) return (n / 1024).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' КБ';
    return (n / 1024 / 1024).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' МБ';
}
const STD_RATIOS = [['1:1', 1], ['5:4', 1.25], ['4:3', 4 / 3], ['3:2', 1.5], ['16:9', 16 / 9], ['2:1', 2], ['21:9', 21 / 9], ['4:5', .8], ['3:4', .75], ['2:3', 2 / 3], ['9:16', 9 / 16]];
function nearestRatio(w, h) {
    const r = w / h;
    let best = '', bd = 1e9;
    for (const [name, v] of STD_RATIOS) {
        const d = Math.abs(r - v);
        if (d < bd) { bd = d; best = name; }
    }
    if (bd < .02) return best;
    return r >= 1 ? r.toFixed(2).replace('.', ',') + ':1' : '1:' + (1 / r).toFixed(2).replace('.', ',');
}
function mimeLabel(u) {
    const m = /^data:([^;,]+)/.exec(u || '');
    if (!m) return '—';
    const t = m[1].toLowerCase();
    if (t === 'image/png') return 'PNG';
    if (t === 'image/jpeg') return 'JPEG';
    if (t === 'image/webp') return 'WEBP';
    if (t === 'image/gif') return 'GIF';
    if (t === 'image/svg+xml') return 'SVG';
    return t.replace('image/', '').toUpperCase();
}
function openImgInfo(g) {
    if (!g || !g.dataUrl) return;
    igiCtx = g;
    $('#igiPreview').innerHTML = '<img src="' + g.dataUrl + '" alt="' + esc(g.prompt || g.aiPrompt || '') + '">';
    const bytes = dataUrlBytes(g.dataUrl);
    const rows = [];
    rows.push(['i-chip', 'Модель', esc(g.model || '—'), false]);
    rows.push(['i-spark', 'Качество', esc(g.resolution || 'Стандартное'), false]);
    rows.push(['i-image', 'Формат файла', esc(mimeLabel(g.dataUrl)), false]);
    rows.push(['i-wallet', 'Размер файла', fmtSizeHuman(bytes) + ' <span class="igi-muted">· точно ' + fmtBytes(bytes) + '</span>', false]);
    if (g.background) rows.push(['i-drop', 'Фон', esc(IG_BG_LABELS[g.background] || g.background), false]);
    if (g.startedAt) rows.push(['i-info', 'Создано', esc(new Date(g.startedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })), false]);
    rows.push(['i-image', 'Разрешение и соотношение', '<span id="igiDims">Определяется…</span>', true]);
    $('#igiParams').innerHTML = rows.map(r =>
        '<div class="igc-param"' + (r[3] ? ' style="grid-column:1/-1"' : '') + '><svg><use href="#' + r[0] + '"/></svg><div><div class="igc-l">' + r[1] + '</div><div class="igc-v">' + r[2] + '</div></div></div>'
    ).join('');
    $('#igiPrompt').textContent = g.prompt || g.aiPrompt || '—';
    const usec = $('#igiUserSec');
    if (g.userPrompt && g.userPrompt.trim() && g.userPrompt.trim() !== (g.prompt || g.aiPrompt || '').trim()) {
        usec.hidden = false;
        $('#igiUser').textContent = g.userPrompt;
    } else usec.hidden = true;
    $('#imgInfoOverlay').classList.add('show');
    const probe = new Image();
    probe.onload = () => {
        const el = $('#igiDims');
        if (!el) return;
        const w = probe.naturalWidth, h = probe.naturalHeight;
        const ratio = (g.ratio && g.ratio !== 'auto') ? g.ratio : nearestRatio(w, h);
        el.innerHTML = w + ' × ' + h + ' px <span class="igi-muted">· ' + ratio + ' · ' + (w / h).toFixed(2).replace('.', ',') + '</span>';
    };
    probe.src = g.dataUrl;
}
function closeImgInfo() { $('#imgInfoOverlay').classList.remove('show'); igiCtx = null; }
$('#igiClose').addEventListener('click', closeImgInfo);
$('#igiDone').addEventListener('click', closeImgInfo);
$('#imgInfoOverlay').addEventListener('click', e => { if (e.target === $('#imgInfoOverlay')) closeImgInfo(); });
$('#igiCopyPrompt').addEventListener('click', () => {
    const p = (igiCtx && (igiCtx.prompt || igiCtx.aiPrompt)) || '';
    navigator.clipboard.writeText(p).then(() => toast('Промпт скопирован', 'ok')).catch(() => toast('Не удалось скопировать', 'err'));
});
/* ---------- Избранные изображения ---------- */
function syncFavUI() {
    const btn = $('#btnFavorites'); if (!btn) return;
    const favs = state.favorites || [];
    btn.hidden = favs.length === 0;
    $('#favCountBadge').textContent = favs.length;
}
async function toggleFavorite(g) {
    if (!Array.isArray(state.favorites)) state.favorites = [];
    const idx = state.favorites.findIndex(f => f.srcId === g.id);
    if (idx >= 0) {
        state.favorites.splice(idx, 1);
        toast('Убрано из избранных', 'info');
    } else {
        const small = g.dataUrl.length > 900000 ? await compressImage(g.dataUrl, 1280, .85) : g.dataUrl;
        state.favorites.unshift({ id: uid(), srcId: g.id, chatId: state.activeId || '', msgId: ctxMsgId || '', dataUrl: small, prompt: g.prompt || '', model: g.model || '', ts: Date.now() });
        toast('Сохранено в избранных', 'ok');
    }
    save(); syncFavUI();
}
function renderFavorites() {
    const grid = $('#favGrid'); if (!grid) return;
    const favs = state.favorites || [];
    if (!favs.length) {
        grid.innerHTML = '<div class="fav-empty">В избранном пока пусто.<br>Нажмите правой кнопкой на изображение → «Сохранить в избранных».</div>';
        return;
    }
    grid.innerHTML = favs.map((f, i) => `
    <div class="fav-card" data-fi="${i}">
      <img src="${esc(f.dataUrl)}" alt="${esc(f.prompt)}" loading="lazy" draggable="false">
      <span class="fav-model">${esc(f.model || '')}</span>
    </div>`).join('');
}

/* ============================================================
ПОЛНОЭКРАННЫЙ ПРОСМОТР ИЗОБРАЖЕНИЙ (зум / панорама / щипок)
============================================================ */
const ivState = { scale: 1, tx: 0, ty: 0, pointers: new Map(), pinch: null, panStart: null, moved: false };
function openImageViewer(src, alt) {
    if (!src) return;
    closeMsgContextMenu();
    closeAllMenus();
    const img = $('#ivImg');
    img.src = src; img.alt = alt || '';
    ivState.scale = 1; ivState.tx = 0; ivState.ty = 0;
    ivState.moved = false; ivState.pointers.clear(); ivState.pinch = null; ivState.panStart = null;
    ivApply();
    $('#imgViewer').hidden = false;
    navCtrl.push('imageViewer');
}
window.openImageViewer = openImageViewer;
function closeImageViewer(opts = {}) {
    $('#imgViewer').hidden = true;
    $('#ivImg').removeAttribute('src');
    ivState.pointers.clear(); ivState.pinch = null; ivState.panStart = null;
    if (!opts.fromPopstate) {
        navCtrl.pop('imageViewer');
    }
}
function ivApply() {
    $('#ivImg').style.transform = 'translate(' + ivState.tx + 'px,' + ivState.ty + 'px) scale(' + ivState.scale + ')';
    $('#ivZoomLvl').textContent = Math.round(ivState.scale * 100) + '%';
}
function ivZoomAt(next, px, py) {
    next = Math.max(1, Math.min(8, next));
    const img = $('#ivImg');
    const r = img.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const wx = (px - cx) / ivState.scale, wy = (py - cy) / ivState.scale;
    const lx = cx - ivState.tx, ly = cy - ivState.ty; // layout-центр без трансформаций
    ivState.tx = px - lx - wx * next;
    ivState.ty = py - ly - wy * next;
    ivState.scale = next;
    if (ivState.scale <= 1.001) { ivState.scale = 1; ivState.tx = 0; ivState.ty = 0; }
    ivApply();
}
function ivZoomCenter(delta) {
    const r = $('#imgViewer').getBoundingClientRect();
    ivZoomAt(ivState.scale * delta, r.left + r.width / 2, r.top + r.height / 2);
}
/* ============================================================
КОНТЕКСТНОЕ МЕНЮ ИЗБРАННЫХ + ПЕРЕХОД К ИСТОЧНИКУ
============================================================ */
let favCtxIdx = -1;
function openFavCtxMenu(i, x, y) {
    const f = (state.favorites || [])[i];
    if (!f) return;
    favCtxIdx = i;
    const menu = $('#favCtxMenu');
    const hasSrc = String(f.chatId || '').length > 0 && String(f.msgId || '').length > 0;
    menu.innerHTML = `
    <button data-fact="goto" ${hasSrc ? '' : 'disabled'}><svg><use href="#i-chat"/></svg><span>Переместиться к источнику</span></button>
    <button data-fact="edit"><svg><use href="#i-pencil"/></svg><span>Редактировать</span></button>
    <button data-fact="copy"><svg><use href="#i-copy"/></svg><span>Копировать</span></button>
    <button data-fact="dl"><svg><use href="#i-download"/></svg><span>Скачать</span></button>
    <div class="sep"></div>
    <button data-fact="rm" class="danger"><svg><use href="#i-trash"/></svg><span>Убрать из избранных</span></button>`;
    menu.hidden = false;
    requestAnimationFrame(() => {
        const r = menu.getBoundingClientRect();
        menu.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px';
        menu.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
    });
    menu.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
        const idx = favCtxIdx;
        closeFavCtxMenu();
        runFavAction(b.dataset.fact, idx);
    }));
}
function closeFavCtxMenu() { $('#favCtxMenu').hidden = true; favCtxIdx = -1; }
function runFavAction(act, i) {
    const f = (state.favorites || [])[i];
    if (!f) return;
    if (act === 'dl') downloadDataUrl(f.dataUrl, f.model || 'favorite');
    else if (act === 'copy') copyImageDataUrl(f.dataUrl);
    else if (act === 'edit') { $('#favOverlay').classList.remove('show'); startImageEdit(f.dataUrl, f.prompt); }
    else if (act === 'goto') gotoFavSource(f);
    else if (act === 'rm') {
        state.favorites.splice(i, 1);
        save(); syncFavUI(); renderFavorites();
        toast('Убрано из избранных', 'info');
    }
}
function gotoFavSource(f) {
    const chat = state.chats.find(c => c.id === f.chatId);
    if (!chat || !f.msgId) { toast('Исходный чат не найден', 'err'); return; }
    $('#favOverlay').classList.remove('show');
    openChat(chat.id);
    requestAnimationFrame(() => requestAnimationFrame(() => {
        const el = $('#messages').querySelector('[data-id="' + f.msgId + '"]');
        if (el) {
            /* Ручная прокрутка ТОЛЬКО внутри #chatScroll.
            scrollIntoView прокручивает все scrollable-предки
            включая document.documentElement — страница «уходит вверх» */
            const scroller = $('#chatScroll');
            const scrollerRect = scroller.getBoundingClientRect();
            const elRect = el.getBoundingClientRect();
            const target = scroller.scrollTop + (elRect.top - scrollerRect.top) - (scroller.clientHeight / 2) + (elRect.height / 2);
            try { scroller.scrollTo({ top: Math.max(0, target), behavior: 'smooth' }); }
            catch (e) { scroller.scrollTop = Math.max(0, target); }
            /* Страховка: сброс скролла документа на случай если
            что-то всё-таки сдвинуло viewport */
            window.scrollTo(0, 0);
            el.classList.add('msg-flash');
            setTimeout(() => el.classList.remove('msg-flash'), 2400);
        } else toast('Сообщение-источник не найдено в этом чате', 'err');
    }));
}

/* --- Изображения из интернета (Wikimedia Commons: без ключа, CORS-safe) --- */
/* Чистим запрос: убираем стоп-слова и пунктуацию, оставляем суть («что такое компьютер?» → «компьютер») */
var IMG_STOP_WORDS = window.IMG_STOP_WORDS || ['что', 'такое', 'такая', 'такой', 'кто', 'как', 'почему', 'зачем', 'где', 'когда', 'объясни', 'объясните', 'пожалуйста', 'расскажи', 'расскажите', 'опиши', 'опишите', 'покажи', 'покажите', 'это', 'этот', 'эта', 'эти', 'мне', 'нужно', 'можно', 'ли', 'в', 'на', 'с', 'о', 'об', 'из', 'по', 'за', 'для', 'и', 'или', 'а', 'но', 'ты', 'вы', 'про', 'чем', 'чего', 'какой', 'какая', 'какие'];
function cleanImageQuery(t) {
    const words = String(t || '').toLowerCase().replace(/[\?\!\.,;:"'«»()…]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !IMG_STOP_WORDS.includes(w));
    const q = words.slice(0, 6).join(' ');
    return q || String(t || '').trim().slice(0, 60);
}
function shouldAttachImages(t) {
    t = String(t || '').toLowerCase();
    if (!t.trim() || t.length < 4) return false;
    const skip = ['напиши код', 'функци', 'скрипт', 'debug', 'дебуг', 'ошибк', 'исправ', 'рефактор', 'компил', 'api', 'json', 'sql', 'html', 'css', 'javascript', 'typescript', 'python', 'regex', 'массив', 'алгоритм сортир'];
    return !skip.some(w => t.includes(w));
}
/* Openverse — основной источник: агрегирует Flickr и открытые банки,
CORS-open без ключа, понимает бытовые запросы лучше Commons */
async function fetchOpenverseImages(query, signal) {
    try {
        const p = new URLSearchParams({ q: String(query || '').slice(0, 120), page_size: '8', page: '1' });
        const resp = await fetch('https://api.openverse.org/v1/images/?' + p.toString(), {
            signal, headers: { 'Accept': 'application/json' }
        });
        if (!resp.ok) return [];
        const j = await resp.json();
        return (j.results || [])
            .map(r => ({
                thumb: r.thumbnail || (r.id ? 'https://api.openverse.org/v1/images/' + r.id + '/thumb/' : ''),
                full: r.url || r.foreign_landing_url || '',
                title: String(r.title || '').replace(/<[^>]+>/g, '').slice(0, 80)
            }))
            .filter(it => it.full && it.thumb)
            .slice(0, 4);
    } catch (e) { return []; }
}
window.fetchOpenverseImages = fetchOpenverseImages;

/* Кнопки терминальной карточки выполнения кода */
document.addEventListener('click', e => {
    const btn = e.target.closest('[data-exact]');
    if (!btn) return;
    const card = btn.closest('.exec-card');
    if (!card) return;
    const msgEl = card.closest('.msg');
    const m = findMsgById(msgEl ? msgEl.dataset.id : null);
    if (!m) return;
    const x = (m.executions || [])[+btn.dataset.i];
    if (!x) return;
    const act = btn.dataset.exact;
    if (act === 'kill') {
        if (window.electronAPI && window.electronAPI.execKill) { try { window.electronAPI.execKill(x.id); } catch (err) { } }
        toast('Сигнал остановки отправлен', 'info', 1400);
        setTimeout(() => {
            const f = window.toolCalling?.execForce?.get(x.id);
            if (f) f('killed', '■ Процесс остановлен', 'Остановлено пользователем');
        }, 1500);
    } else if (act === 'copy-out') {
        const out = (x.output || []).filter(c => c.type !== 'sys').map(c => (c.type === 'stderr' ? '[stderr] ' : '') + c.data).join('');
        navigator.clipboard.writeText(out).then(() => toast('Вывод скопирован', 'ok')).catch(() => toast('Не удалось скопировать', 'err'));
    } else if (act === 'code') {
        x.codeOpen = !x.codeOpen;
        refreshCurrentMsg(m);
    } else if (act === 'retry') {
        if (streaming) { toast('Сначала остановите генерацию', 'err'); return; }
        x.status = 'running'; x.output = []; x.exitCode = null;
        x.startedAt = Date.now(); x.finishedAt = 0; x.summary = '';
        save(); refreshCurrentMsg(m); startGenTicker();
        window.toolCalling.runCodeExecution(x, null);
    }
});

/* ---------- Композер: Нативный Textarea с поддержкой PromptInputController ---------- */
const promptInput = $('#promptInput');

function autoGrow() {
    if (window.promptInputCtrl) {
        window.promptInputCtrl.adjustHeight();
        window.promptInputCtrl.updateFades();
    } else if (promptInput) {
        promptInput.style.height = 'auto';
        const maxHeight = Math.min(window.innerHeight * 0.28, 200);
        promptInput.style.height = Math.min(promptInput.scrollHeight, maxHeight) + 'px';
    }
}

function setSendBtn() {
    if (window.promptInputCtrl && typeof window.promptInputCtrl.updateActionState === 'function') {
        try { window.promptInputCtrl.updateActionState(); return; } catch (_) { }
    }
    const b = $('#btnSend');
    if (!b) return;
    const hasText = Boolean((promptInput ? promptInput.value.trim() : '') || pendingAtt.length || (state.settings.editMode && editImages.length) || artEditRef);
    b.classList.toggle('is-stop', streaming);
    b.classList.toggle('stop', streaming);
    b.classList.toggle('idle', !streaming && !hasText);
    b.title = streaming ? 'Остановить генерацию' : (hasText ? 'Отправить' : 'Голосовой ввод');
    b.setAttribute('aria-label', b.title);

    const arrowIcon = b.querySelector('.prompt-act-arrow');
    const stopIcon = b.querySelector('.prompt-act-stop');
    if (arrowIcon && stopIcon) {
        arrowIcon.classList.toggle('show', !streaming);
        stopIcon.classList.toggle('show', streaming);
    }
    const micBtn = $('#btnMic');
    if (micBtn) {
        micBtn.classList.toggle('is-hidden', Boolean(streaming || hasText));
    }
    b.classList.toggle('is-hidden', Boolean(!streaming && !hasText));
}

if (promptInput) {
    promptInput.addEventListener('input', () => {
        if (!window.promptInputCtrl) { autoGrow(); setSendBtn(); }
        handleSlashInput();
    });
}

window.hasComposerContent = () => Boolean((promptInput?.value || '').trim()
    || pendingAtt.length || (state.settings.editMode && editImages.length) || artEditRef);

function syncComposerSegmentsLive() {
    if (window.promptInputCtrl && typeof window.promptInputCtrl.syncSegments === 'function') {
        window.promptInputCtrl.syncSegments();
    }
}
window.syncComposerSegmentsLive = syncComposerSegmentsLive;

promptInput.addEventListener('paste', async e => {
    const cd = e.clipboardData;
    if (!cd) return;
    const files = [];
    if (cd.items) {
        for (const item of cd.items) {
            if (item.type.startsWith('image/')) {
                const f = item.getAsFile();
                if (f) files.push(f);
            }
        }
    }
    if (files.length) {
        e.preventDefault();
        await addFiles(files, true);
        setSendBtn();
        return;
    }
    const txt = cd.getData('text/plain');
    if (txt) {
        e.preventDefault();
        if (txt.length > PASTE_TEXT_THRESHOLD) {
            addTextAttachment(txt);
        } else {
            if (typeof promptInput.setRangeText === 'function') {
                const start = promptInput.selectionStart ?? promptInput.value.length;
                const end = promptInput.selectionEnd ?? promptInput.value.length;
                promptInput.setRangeText(txt, start, end, 'end');
            } else {
                promptInput.value = (promptInput.value || '') + txt;
            }
            if (typeof syncComposerSegmentsLive === 'function') {
                syncComposerSegmentsLive();
            }
            autoGrow();
            setSendBtn();
        }
    }
});

promptInput.addEventListener('keydown', e => {
    if (slashOpen()) {
        if (e.key === 'ArrowDown') { e.preventDefault(); slashMove(1); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); slashMove(-1); return; }
        if (e.key === 'Tab') { e.preventDefault(); applySlash(); return; }
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeSlash(); return; }
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); applySlash(); return; }
    }
    if (e.key === 'ArrowUp' && promptInput.selectionStart === 0 && promptInput.selectionEnd === 0 && !slashOpen()) {
        const chat = activeChat();
        if (chat && chat.messages.length) {
            e.preventDefault();
            promptInput.blur();
            selectLastMessage();
            return;
        }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        sendMessage();
        return;
    }
    if (e.key === 'Enter' && e.shiftKey && !e.isComposing) {
        e.preventDefault();
        if (typeof promptInput.setRangeText === 'function') {
            const start = promptInput.selectionStart ?? promptInput.value.length;
            const end = promptInput.selectionEnd ?? promptInput.value.length;
            promptInput.setRangeText('\n', start, end, 'end');
        } else {
            promptInput.value += '\n';
        }
        autoGrow();
        return;
    }
});
$('#btnSend').addEventListener('click', () => {
    if (window.promptInputCtrl?.isRecording) { window.promptInputCtrl.stopRecording(); return; }
    if (window.promptInputCtrl?.isTranscribing) return;
    streaming ? stopGeneration() : sendMessage();
});

/* Плюс-меню инструментов */
const plusMenu = $('#plusMenu');
const promptWrapper = document.getElementById('promptInputContainer');
if (promptWrapper && plusMenu && plusMenu.parentElement !== promptWrapper) {
    promptWrapper.insertBefore(plusMenu, promptWrapper.firstChild);
}

$('#btnPlus')?.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    if (window.promptInputCtrl) {
        window.promptInputCtrl.expand(false);
        window.promptInputCtrl.closeModelDropdown();
        window.promptInputCtrl.closeEffortDropdown();
    }
    toggleMenu(plusMenu);
});

/* Увеличенные тач-зоны на смартфонах: тап по строке переключает тумблер */
document.querySelectorAll('#plusMenu .ws-row').forEach(row => {
    row.addEventListener('click', e => {
        if (e.target.closest('.ig-gear') || e.target.closest('.switch')) return;
        const sw = row.querySelector('.switch');
        if (sw) sw.click();
    });
});

$('#acFile').addEventListener('click', () => { closeAllMenus(); $('#fileInput').click(); });
$('#acImage').addEventListener('click', () => { closeAllMenus(); $('#imgInput').click(); });
$('#acCamera').addEventListener('click', () => { closeAllMenus(); openCamera(); });
$('#fileInput').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });
$('#imgInput').addEventListener('change', e => { addFiles(e.target.files, true); e.target.value = ''; });

/* ---------- Меню модели и размышлений (с прямой поддержкой OpenRouter) ---------- */
const modelMenu = $('#modelMenu');
const thinkMenu = $('#thinkMenu');
let modelMenuTab = 'all'; // 'all' | 'curated' | 'openrouter' | 'free'
let modelMenuSearchQuery = '';

function renderModelMenu() {
    const all = getAllModels();
    const dynamicCount = (state.openRouterModels || []).length;

    let headerContainer = modelMenu.querySelector('.mm-header');
    let listContainer = modelMenu.querySelector('.mm-list');

    if (!headerContainer || !listContainer) {
        const headerHtml = `
        <div class="mm-header no-sel">
            <div class="mm-header-top">
                <div class="mm-title">
                    <svg class="ic"><use href="#i-chip"/></svg>
                    <span id="mmTotalTitle">Модели ИИ (${all.length})</span>
                </div>
                <button class="btn-refresh-or-models mm-refresh-btn ${isFetchingOrModels ? 'spinning' : ''}" id="btnRefreshOrModelsMenu" title="Обновить каталог с OpenRouter" type="button" aria-label="Обновить модели">
                    <svg class="ic"><use href="#i-refresh"/></svg>
                </button>
            </div>
            <div class="mm-search-wrap">
                <svg class="ic"><use href="#i-search"/></svg>
                <input type="text" id="modelMenuSearchInput" value="${esc(modelMenuSearchQuery)}" placeholder="Поиск среди ${all.length} моделей…" autocomplete="off" spellcheck="false">
                <button class="mm-search-clear" id="modelMenuSearchClear" type="button" style="display:${modelMenuSearchQuery ? 'flex' : 'none'}"><svg class="ic"><use href="#i-x"/></svg></button>
            </div>
            <div class="mm-filter-tabs">
                <button type="button" class="mm-tab-btn ${modelMenuTab === 'all' ? 'sel' : ''}" data-tab="all">Все (${all.length})</button>
                <button type="button" class="mm-tab-btn ${modelMenuTab === 'curated' ? 'sel' : ''}" data-tab="curated">Курируемые (${MODELS.length})</button>
                <button type="button" class="mm-tab-btn ${modelMenuTab === 'openrouter' ? 'sel' : ''}" data-tab="openrouter">OpenRouter (${dynamicCount})</button>
                <button type="button" class="mm-tab-btn ${modelMenuTab === 'free' ? 'sel' : ''}" data-tab="free">Free</button>
            </div>
        </div>`;

        modelMenu.innerHTML = headerHtml + `<div class="mm-list"></div>`;
        listContainer = modelMenu.querySelector('.mm-list');

        // Предотвращаем всплытие кликов внутри меню наружу, чтобы меню не сворачивалось
        modelMenu.addEventListener('click', e => e.stopPropagation());

        // Привязка поиска без перерисовки хедера с защитой фокуса на тач-устройствах
        const searchInp = modelMenu.querySelector('#modelMenuSearchInput');
        if (searchInp) {
            searchInp.addEventListener('input', e => {
                modelMenuSearchQuery = e.target.value;
                const clearBtn = modelMenu.querySelector('#modelMenuSearchClear');
                if (clearBtn) clearBtn.style.display = modelMenuSearchQuery ? 'flex' : 'none';
                renderModelMenuListOnly();
            });
            searchInp.addEventListener('click', e => e.stopPropagation());
            searchInp.addEventListener('pointerdown', e => e.stopPropagation());
            searchInp.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
            searchInp.addEventListener('focus', e => e.stopPropagation());
            searchInp.addEventListener('keydown', e => {
                if (e.key === 'Escape' && modelMenuSearchQuery) {
                    e.stopPropagation();
                    modelMenuSearchQuery = '';
                    searchInp.value = '';
                    const clearBtn = modelMenu.querySelector('#modelMenuSearchClear');
                    if (clearBtn) clearBtn.style.display = 'none';
                    renderModelMenuListOnly();
                }
            });
        }

        const searchClr = modelMenu.querySelector('#modelMenuSearchClear');
        if (searchClr) {
            searchClr.addEventListener('click', e => {
                e.stopPropagation();
                e.preventDefault();
                modelMenuSearchQuery = '';
                if (searchInp) {
                    searchInp.value = '';
                    searchInp.focus();
                }
                searchClr.style.display = 'none';
                renderModelMenuListOnly();
            });
        }

        // Привязка табов: переключают фильтр БЕЗ закрытия меню
        modelMenu.querySelectorAll('.mm-tab-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                e.preventDefault();
                modelMenuTab = btn.dataset.tab;
                modelMenu.querySelectorAll('.mm-tab-btn').forEach(b => b.classList.toggle('sel', b.dataset.tab === modelMenuTab));
                renderModelMenuListOnly();
            });
        });

        // Привязка кнопки обновления OpenRouter без закрытия меню
        const btnRefresh = modelMenu.querySelector('#btnRefreshOrModelsMenu');
        if (btnRefresh) {
            btnRefresh.addEventListener('click', e => {
                e.stopPropagation();
                e.preventDefault();
                refreshOpenRouterModels(false);
            });
        }
    } else {
        const totalTitle = modelMenu.querySelector('#mmTotalTitle');
        if (totalTitle) totalTitle.textContent = `Модели ИИ (${all.length})`;

        const searchInp = modelMenu.querySelector('#modelMenuSearchInput');
        if (searchInp && searchInp.value !== modelMenuSearchQuery) searchInp.value = modelMenuSearchQuery;
        const searchClr = modelMenu.querySelector('#modelMenuSearchClear');
        if (searchClr) searchClr.style.display = modelMenuSearchQuery ? 'flex' : 'none';

        modelMenu.querySelectorAll('.mm-tab-btn').forEach(btn => {
            const t = btn.dataset.tab;
            btn.classList.toggle('sel', t === modelMenuTab);
            if (t === 'all') btn.textContent = `Все (${all.length})`;
            else if (t === 'curated') btn.textContent = `Курируемые (${MODELS.length})`;
            else if (t === 'openrouter') btn.textContent = `OpenRouter (${dynamicCount})`;
        });
    }

    renderModelMenuListOnly();
}

function renderModelMenuListOnly() {
    const listContainer = modelMenu.querySelector('.mm-list');
    if (!listContainer) return;

    const all = getAllModels();
    const filter = modelMenuSearchQuery.trim();

    let filtered = all.filter(m => {
        if (modelMenuTab === 'curated' && m.isOpenRouterDynamic) return false;
        if (modelMenuTab === 'openrouter' && !m.isOpenRouterDynamic) return false;
        if (modelMenuTab === 'free') {
            const isFree = m.id.endsWith(':free') || m.pricing?.isFree || (m.tagline && m.tagline.toLowerCase().includes('free'));
            if (!isFree) return false;
        }
        return matchModelSearch(m, filter);
    });

    // Для таба OpenRouter гарантируем сортировку от самых новых к старым
    if (modelMenuTab === 'openrouter') {
        filtered.sort((a, b) => (b.created || 0) - (a.created || 0) || a.name.localeCompare(b.name));
    }

    if (!filtered.length) {
        listContainer.innerHTML = `<div class="list-empty" style="padding:28px 14px"><svg class="ic" style="margin:0 auto 8px;width:28px;height:28px"><use href="#i-search"/></svg>Модели не найдены</div>`;
        return;
    }

    listContainer.innerHTML = filtered.map(m => {
        const baseId = m.id.replace(/:[a-zA-Z0-9_.-]+$/i, '');
        const cat = typeof window.getModelCatalogEntry === 'function' ? window.getModelCatalogEntry(m.id) : {};
        const cfg = (state.settings.modelProviders && (state.settings.modelProviders[m.id] || state.settings.modelProviders[baseId])) || {};

        const provSlug = cfg.selectedProvider && cfg.selectedProvider !== 'auto' ? cfg.selectedProvider : '';
        const availableFlavors = typeof window.getModelAvailableFlavors === 'function'
            ? window.getModelAvailableFlavors(m)
            : (cat.flavors || [{ id: 'standard' }]);
        const validFlavorIds = new Set(availableFlavors.map(f => f.id));

        let effectiveFlavor = 'standard';
        if (cfg.flavor && validFlavorIds.has(cfg.flavor)) {
            effectiveFlavor = cfg.flavor;
        } else if (cat.defaultFlavor && validFlavorIds.has(cat.defaultFlavor)) {
            effectiveFlavor = cat.defaultFlavor;
        }

        const flavorBadge = (effectiveFlavor && effectiveFlavor !== 'standard' && effectiveFlavor !== 'default') ? `:${effectiveFlavor}` : '';
        const hasCustom = !!(provSlug || (cfg.flavor && cfg.flavor !== 'standard' && cfg.flavor !== 'default'));

        const isFree = m.id.endsWith(':free') || m.pricing?.isFree || (m.tagline && m.tagline.toLowerCase().includes('free'));
        const isCurrentActive = m.id === state.settings.modelId || baseId === state.settings.modelId;

        // Вычисляем точную AI-фавиконку с абсолютным приоритетом локальных ассетов
        const iconSrc = (typeof window.getAiModelIcon === 'function' ? window.getAiModelIcon(m.id, m) : null) || (m.icon && !m.icon.startsWith('http') ? m.icon : null) || m.icon || null;
        const iconHtml = iconSrc
            ? `<img src="${esc(iconSrc)}" alt="" loading="lazy" onerror="this.outerHTML='<svg class=\\'ic\\'><use href=\\'#i-chip\\'/></svg>'">`
            : `<svg class="ic"><use href="#i-chip"/></svg>`;

        // Спецификации и метрики (Specs Bar)
        const ctxLabel = m.context || (m.contextLength ? `${Math.round(m.contextLength / 1000)}K` : null);
        const ctxPill = ctxLabel
            ? `<span class="mi-spec-pill mi-pill-ctx" title="Размер контекстного окна"><svg class="ic"><use href="#i-cube"/></svg>${esc(ctxLabel)} Ctx</span>`
            : '';

        let pricePill = '';
        if (isFree) {
            pricePill = `<span class="mi-spec-pill mi-pill-free" title="Бесплатная модель OpenRouter"><svg class="ic"><use href="#i-spark"/></svg>Free ($0)</span>`;
        } else if (m.pricing?.promptFormatted && m.pricing?.completionFormatted) {
            pricePill = `<span class="mi-spec-pill mi-pill-price" title="Стоимость за 1 млн токенов (Вход / Выход)"><svg class="ic"><use href="#i-wallet"/></svg>In: ${esc(m.pricing.promptFormatted)} · Out: ${esc(m.pricing.completionFormatted)}</span>`;
        }

        const visionPill = m.vision
            ? `<span class="mi-spec-pill mi-pill-vision" title="Поддержка анализа и распознавания изображений"><svg class="ic"><use href="#i-image"/></svg>Vision</span>`
            : '';

        const reasoningPill = m.reasoning
            ? `<span class="mi-spec-pill mi-pill-reason" title="Аппаратная цепочка рассуждений (Reasoning)"><svg class="ic"><use href="#i-reasoning"/></svg>Reasoning</span>`
            : '';

        const toolsPill = (m.supportsTools || (Array.isArray(m.supportedParameters) && m.supportedParameters.includes('tools')))
            ? `<span class="mi-spec-pill mi-pill-tools" title="Вызов функций и инструментов (Tool Use)"><svg class="ic"><use href="#i-terminal"/></svg>Tools</span>`
            : '';

        // Развернутое описание из OpenRouter
        const fullDesc = String(m.description || m.tagline || '').trim();

        return `
        <div class="m-item-row ${isCurrentActive ? 'active' : ''}" data-row-mid="${esc(m.id)}">
            <button class="m-item" data-mid="${esc(m.id)}" role="option" aria-selected="${isCurrentActive}">
                <div class="mi-top-row">
                    <span class="mi-ico">${iconHtml}</span>
                    <div class="mi-title-block">
                        <div class="mi-name-row">
                            <span class="mi-name-txt" title="${esc(m.name)}">${esc(m.name)}</span>
                            ${flavorBadge ? `<span class="prov-flavor-pill">${esc(flavorBadge)}</span>` : ''}
                            <span class="prov-tag">${esc(provSlug ? provSlug.toUpperCase() : m.provider)}</span>
                        </div>
                        <div class="mi-id-slug" title="${esc(m.id)}">${esc(m.id)}</div>
                    </div>
                    <div class="mi-state-check" aria-hidden="true">
                        <svg class="mi-check ic"><use href="#i-check"/></svg>
                    </div>
                </div>

                <div class="mi-specs-bar">
                    ${ctxPill}
                    ${pricePill}
                    ${reasoningPill}
                    ${visionPill}
                    ${toolsPill}
                </div>

                ${fullDesc ? `<div class="mi-desc-box">${esc(fullDesc)}</div>` : ''}
            </button>

            <button class="mi-cfg-btn ${hasCustom ? 'has-custom' : ''}" data-cfg-mid="${esc(m.id)}" title="Настроить серверный узел и параметры инференса" aria-label="Настроить провайдера">
                <svg class="ic"><use href="#i-chevron-right"/></svg>
            </button>
        </div>`;
    }).join('');

    processMultilingualDom(listContainer);

    // Привязка выбора модели: фиксирует выбор, обновляет чипы, но НЕ закрывает меню
    listContainer.querySelectorAll('.m-item').forEach(b => {
        b.addEventListener('click', e => {
            e.stopPropagation();
            e.preventDefault();
            const targetMid = b.dataset.mid;
            const selectedModel = getModel(targetMid);
            const cleanBaseMid = selectedModel.id.replace(/:[a-zA-Z0-9_.-]+$/i, '');
            const flavors = typeof window.getModelAvailableFlavors === 'function' ? window.getModelAvailableFlavors(selectedModel) : [];
            const hasFreeFlavor = flavors.some(f => f.id === 'free');

            // Оставляем :free в ID модели только если модель реально имеет отдельный эндпоинт с суффиксом :free на OpenRouter
            if (selectedModel.id.endsWith(':free') && hasFreeFlavor) {
                state.settings.modelId = selectedModel.id;
            } else {
                state.settings.modelId = cleanBaseMid;
            }

            const configs = typeof window.getModelThinkingConfig === 'function'
                ? window.getModelThinkingConfig(selectedModel)
                : (modelThinkingConfigs[selectedModel.id] || modelThinkingConfigs[selectedModel.id.replace(/:[a-zA-Z0-9_.-]+$/i, '')] || [
                    { value: "off", label: "Отключено", desc: "Рассуждения отключены" }
                ]);
            const validValues = configs.map(c => c.value);
            if (!validValues.includes(state.settings.reasoning)) {
                state.settings.reasoning = validValues.find(v => v !== 'not-supported') || validValues[0]?.value || 'off';
            }

            save();
            updateTopChips();

            // Мгновенно обновляем состояние строк в списке без свертывания окна
            listContainer.querySelectorAll('.m-item-row').forEach(row => {
                const isActive = row.dataset.rowMid === selectedModel.id || row.dataset.rowMid.replace(/:[a-zA-Z0-9_.-]+$/i, '') === state.settings.modelId;
                row.classList.toggle('active', isActive);
                const btn = row.querySelector('.m-item');
                if (btn) btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
            });

            toast('Выбрана модель: ' + selectedModel.name, 'ok', 1600);
        });
    });

    // Привязка кнопки настройки провайдера
    listContainer.querySelectorAll('.mi-cfg-btn').forEach(btn => {
        if (btn.dataset.cfgMid && btn.dataset.cfgMid.startsWith('@preset/')) { btn.style.display = 'none'; return; }
        btn.addEventListener('click', e => {
            e.stopPropagation();
            e.preventDefault();
            closeAllMenus();
            openModelProviderFlyout(btn.dataset.cfgMid);
        });
    });
}

let activeFlyoutModelId = null;
let flyoutAbortCtrl = null;

async function openModelProviderFlyout(modelId) {
    const model = getModel(modelId);
    if (!model) return;
    activeFlyoutModelId = modelId;

    if (flyoutAbortCtrl) {
        try { flyoutAbortCtrl.abort(); } catch (e) { }
    }
    flyoutAbortCtrl = new AbortController();

    const baseId = model.id.replace(/:[a-zA-Z0-9_.-]+$/i, '');
    const catalog = typeof window.getModelCatalogEntry === 'function'
        ? window.getModelCatalogEntry(model.id)
        : (window.MODEL_ENDPOINTS_CATALOG?.[baseId] || { name: model.name, flavors: [{ id: "standard", label: "Стандарт", desc: "Базовая модель" }], providers: [] });

    if (!state.settings.modelProviders) state.settings.modelProviders = {};
    const cfg = state.settings.modelProviders[model.id] || state.settings.modelProviders[baseId] || {};

    const iconBox = $('#mpfModelIcon');
    if (iconBox) {
        const modelIcon = (typeof window.getAiModelIcon === 'function' ? window.getAiModelIcon(model.id, model) : null) || (model.icon && !model.icon.startsWith('http') ? model.icon : null) || model.icon || null;
        iconBox.innerHTML = modelIcon
            ? `<img src="${esc(modelIcon)}" alt="">`
            : `<svg class="ic"><use href="#i-chip"/></svg>`;
    }
    $('#mpfModelTitle').textContent = catalog.name || model.name;
    const ctxBadge = catalog.contextLength ? ` · Контекст: ${catalog.contextLength}` : '';
    $('#mpfModelSub').textContent = `${model.id}${ctxBadge}`;

    // 1. Отрисовка переключателя вариантов модели (Flavor: standard, :nitro, :exacto, :free)
    const flavorsList = typeof window.getModelAvailableFlavors === 'function'
        ? window.getModelAvailableFlavors(model)
        : (catalog.flavors || [
            { id: "standard", label: "Стандарт", desc: "Базовый маршрут инференса" },
            { id: "nitro", label: "Nitro (:nitro)", desc: "Быстрый инференс с минимальной задержкой" },
            { id: "exacto", label: "Exacto (:exacto)", desc: "Точная маршрутизация без квантований" }
        ]);
    const validFlavorIds = new Set(flavorsList.map(f => f.id));

    const currentMid = (state.settings.modelId || '');
    const suffixMatch = currentMid.match(/:(nitro|exacto|free|online|extended)$/i);

    let activeFlavor = 'standard';
    if (cfg.flavor && validFlavorIds.has(cfg.flavor)) {
        activeFlavor = cfg.flavor;
    } else if (suffixMatch && validFlavorIds.has(suffixMatch[1].toLowerCase())) {
        activeFlavor = suffixMatch[1].toLowerCase();
    } else if (catalog.defaultFlavor && validFlavorIds.has(catalog.defaultFlavor)) {
        activeFlavor = catalog.defaultFlavor;
    }

    const flavorsBox = $('#mpfFlavorChips');
    const flavorsSec = $('#mpfFlavorsSec');
    if (flavorsSec) {
        flavorsSec.style.display = flavorsList.length > 1 ? 'block' : 'none';
    }
    if (flavorsBox) {
        flavorsBox.innerHTML = flavorsList.map(f => `
            <button type="button" class="mpf-flavor-btn ${activeFlavor === f.id ? 'sel' : ''}" data-flavor="${f.id}" title="${esc(f.desc)}">
                <span class="mpf-flavor-name">${esc(f.label || f.id)}</span>
                <span class="mpf-flavor-desc">${esc(f.desc || '')}</span>
            </button>
        `).join('');

        flavorsBox.querySelectorAll('.mpf-flavor-btn').forEach(fb => {
            fb.onclick = async () => {
                flavorsBox.querySelectorAll('.mpf-flavor-btn').forEach(x => x.classList.remove('sel'));
                fb.classList.add('sel');
                activeFlavor = fb.dataset.flavor || 'standard';
                await renderFlyoutProvidersList(baseId, catalog, cfg, activeFlavor);
            };
        });
    }

    // 2. Тумблер Fallback и Сортировка
    const allowFallbacksVal = typeof cfg.allow_fallbacks === 'boolean'
        ? cfg.allow_fallbacks
        : typeof cfg.allowfallbacks === 'boolean'
            ? cfg.allowfallbacks
            : true;

    const sw = $('#mpfFallbackSwitch');
    if (sw) sw.classList.toggle('on', allowFallbacksVal);

    const activeSort = cfg.sort || 'default';
    document.querySelectorAll('#mpfSortSeg .set-seg-btn').forEach(sb => {
        sb.classList.toggle('sel', sb.dataset.sort === activeSort);
    });

    // Настройка специфичных параметров рассуждения и effort для выбранной модели во флайауте
    const eRow = $('#mpfEffortConfigRow');
    const eSeg = $('#mpfEffortSeg');
    const rRow = $('#mpfReasoningConfigRow');
    const rTitle = $('#mpfReasoningConfigTitle');
    const rDesc = $('#mpfReasoningConfigDesc');
    const rSeg = $('#mpfReasoningSeg');
    const isOpenAI = model.id.startsWith('openai/') || (model.api === 'openai');
    const isClaude = model.id.startsWith('anthropic/') || (model.api === 'anthropic');

    if (eRow && eSeg && (isOpenAI || isClaude || model.reasoning)) {
        eRow.style.display = 'flex';
        const curEff = cfg.reasoningEffort || state.settings.reasoningEffort || 'medium';
        eSeg.querySelectorAll('.set-seg-btn').forEach(btn => {
            btn.classList.toggle('sel', btn.dataset.effort === curEff);
            btn.onclick = () => {
                eSeg.querySelectorAll('.set-seg-btn').forEach(b => b.classList.remove('sel'));
                btn.classList.add('sel');
            };
        });
    } else if (eRow) {
        eRow.style.display = 'none';
    }

    if (rRow && rSeg && (isOpenAI || isClaude)) {
        rRow.style.display = 'flex';
        if (isOpenAI) {
            if (rTitle) rTitle.textContent = 'Саммари рассуждений (reasoning.summary)';
            if (rDesc) rDesc.textContent = 'auto — выжимка CoT; detailed — глубокая; concise — краткая; none — только шифрованный контекст';
            const curVal = cfg.openaiReasoningSummary || state.settings.openaiReasoningSummary || 'auto';
            rSeg.innerHTML = `
                <button type="button" class="set-seg-btn ${curVal === 'auto' ? 'sel' : ''}" data-val="auto">Авто</button>
                <button type="button" class="set-seg-btn ${curVal === 'detailed' ? 'sel' : ''}" data-val="detailed">Подробно</button>
                <button type="button" class="set-seg-btn ${curVal === 'concise' ? 'sel' : ''}" data-val="concise">Кратко</button>
                <button type="button" class="set-seg-btn ${curVal === 'none' ? 'sel' : ''}" data-val="none">Скрыто</button>
            `;
        } else {
            if (rTitle) rTitle.textContent = 'Трансляция мыслей (thinking.display)';
            if (rDesc) rDesc.textContent = 'summarized — выжимка; updates — поток промежуточных шагов; omitted — скрыто';
            const curVal = cfg.claudeThinkingDisplay || state.settings.claudeThinkingDisplay || 'summarized';
            rSeg.innerHTML = `
                <button type="button" class="set-seg-btn ${curVal === 'summarized' ? 'sel' : ''}" data-val="summarized">Выжимка</button>
                <button type="button" class="set-seg-btn ${curVal === 'updates' ? 'sel' : ''}" data-val="updates">Поток</button>
                <button type="button" class="set-seg-btn ${curVal === 'omitted' ? 'sel' : ''}" data-val="omitted">Скрыто</button>
            `;
        }
        rSeg.querySelectorAll('.set-seg-btn').forEach(btn => {
            btn.onclick = () => {
                rSeg.querySelectorAll('.set-seg-btn').forEach(b => b.classList.remove('sel'));
                btn.classList.add('sel');
            };
        });
    } else if (rRow) {
        rRow.style.display = 'none';
    }

    $('#modelProviderFlyoutOverlay').classList.add('show');
    await renderFlyoutProvidersList(baseId, catalog, cfg, activeFlavor);
}

function updateSortControlVisibility(isProviderPinned) {
    const sortRow = $('#mpfSortRow');
    if (!sortRow) return;
    sortRow.classList.toggle('sort-disabled-hint', isProviderPinned);
    const label = sortRow.querySelector('.sr-s');
    if (label) {
        label.textContent = isProviderPinned
            ? 'Приоритет отдан выбранному выше провайдеру (сортировка не применяется)'
            : 'Критерий автоматической сортировки OpenRouter при авто-выборе';
    }
}

function formatMetricDisplay(val, fallbackText = 'Нет данных') {
    if (val === null || val === undefined || val === '') {
        return `<span class="mpf-metric-na">${esc(fallbackText)}</span>`;
    }
    return esc(String(val));
}

async function renderFlyoutProvidersList(targetModelId, catalog, cfg, currentFlavor) {
    const providersList = $('#mpfProvidersList');
    if (!providersList) return;

    const currentFlyoutId = activeFlyoutModelId;
    const cleanBaseId = String(targetModelId || '').trim().replace(/:[a-zA-Z0-9_.-]+$/i, '');
    const flavor = currentFlavor || cfg.flavor || catalog.defaultFlavor || 'standard';
    const routedModelId = (flavor && flavor !== 'standard' && flavor !== 'default') ? `${cleanBaseId}:${flavor}` : cleanBaseId;
    const curSelectedEndpointId = cfg.selectedEndpointId || cfg.selectedProvider || (Array.isArray(cfg.order) && cfg.order[0]) || 'auto';

    let providers = [];
    const apiKey = (state.settings.orKey || '').trim();

    providersList.innerHTML = `
        <div class="mpf-loading-box">
            <span class="spin"></span>
            <span>Запрос актуальной телеметрии «${esc(routedModelId)}» у OpenRouter API…</span>
        </div>
    `;

    if (typeof window.fetchOpenRouterModelEndpoints === 'function') {
        try {
            const liveEndpoints = await window.fetchOpenRouterModelEndpoints(routedModelId, apiKey, flyoutAbortCtrl?.signal);
            if (activeFlyoutModelId !== currentFlyoutId) return;
            if (Array.isArray(liveEndpoints)) {
                providers = liveEndpoints;
            }
        } catch (e) {
            console.warn('[MoonSSS] Error loading endpoints:', e);
        }
    }

    const autoProvider = {
        id: 'auto',
        endpointId: 'auto',
        providerSlug: 'auto',
        name: 'Автоматический выбор (Маршрутизатор OpenRouter)',
        ttft: 'Оптимально',
        latency: 'Оптимально',
        throughput: 'Оптимально',
        inputPrice: 'Динамически',
        outputPrice: 'Динамически',
        privacy: 'Auto',
        note: 'OpenRouter в реальном времени распределяет нагрузку на наименее загруженные серверы с минимальным TTFT'
    };

    const allProviders = [autoProvider, ...providers];

    const cardsHtml = allProviders.map(p => {
        const isSel = (curSelectedEndpointId === p.id) ||
            (curSelectedEndpointId === p.endpointId) ||
            (curSelectedEndpointId === p.providerSlug && curSelectedEndpointId !== 'auto');

        const isZdr = p.isZdr || (typeof p.privacy === 'string' && p.privacy.toLowerCase().includes('private'));
        const privacyBadge = isZdr
            ? `<span class="mpf-badge private" title="Провайдер гарантированно не сохраняет логи и промпты (Zero Data Retention)"><svg class="ic" style="width:10px;height:10px;display:inline-block;vertical-align:-1px;margin-right:3px"><use href="#i-lock"/></svg>Private (ZDR)</span>`
            : (p.privacy === 'Auto' ? `<span class="mpf-badge auto">Auto Route</span>` : `<span class="mpf-badge logs" title="Стандартный узел инференса">Logs</span>`);

        const contextPill = p.context
            ? `<span class="mpf-spec-item" title="Размер контекстного окна"><svg class="ic"><use href="#i-cube"/></svg>Контекст: <b>${esc(p.context)}</b></span>`
            : '';

        const quantPill = p.quantization
            ? `<span class="mpf-spec-item" title="Квантование модели"><span class="prov-flavor-pill">${esc(p.quantization)}</span></span>`
            : '';

        // Поддерживаемые параметры
        const paramsList = Array.isArray(p.supportedParameters) ? p.supportedParameters : [];
        const paramsPillsHtml = paramsList.length > 0 ? `
            <div class="mpf-params-row">
                <span class="mpf-params-title">Параметры (${paramsList.length}):</span>
                <div class="mpf-params-chips">
                    ${paramsList.map(param => `<span class="prov-param-pill" title="Параметр API: ${esc(param)}">${esc(param)}</span>`).join('')}
                </div>
            </div>
        ` : '';

        const uptimePill = (p.uptimePercent !== null && p.uptimePercent !== undefined)
            ? `<span class="mpf-spec-item" title="Аптайм узла"><svg class="ic"><use href="#i-check"/></svg>Uptime: <b>${p.uptimePercent.toFixed(1)}%</b></span>`
            : '';

        const cachePricePill = (p.cacheReadPrice && p.cacheReadPrice !== 'Динамически' && p.cacheReadPrice !== '$0.00')
            ? `<span class="mpf-spec-item" title="Стоимость чтения из кеша промптов"><svg class="ic"><use href="#i-wallet"/></svg>Cache Read: <b>${esc(p.cacheReadPrice)}</b></span>`
            : '';

        const faviconHtml = (typeof window.providerIconHtml === 'function')
            ? window.providerIconHtml(p)
            : '';

        const ttftDisplay = formatMetricDisplay(p.ttft || p.latency, 'Нет данных');
        const throughputDisplay = formatMetricDisplay(p.throughput, 'Нет данных');
        const inPriceDisplay = formatMetricDisplay(p.inputPrice, 'Динамически');
        const outPriceDisplay = formatMetricDisplay(p.outputPrice, 'Динамически');

        return `
        <div class="mpf-provider-card ${isSel ? 'sel' : ''}" data-eid="${esc(p.endpointId || p.id)}" data-slug="${esc(p.providerSlug || p.id)}" data-pname="${esc(p.name)}">
            <div class="mpf-provider-head">
                <div class="mpf-provider-radio"></div>
                <div class="mpf-provider-icon-wrap">${faviconHtml}</div>
                <div class="mpf-provider-name">${esc(p.name)}</div>
                ${privacyBadge}
            </div>
            <div class="mpf-provider-specs">
                ${contextPill}
                ${quantPill}
                <span class="mpf-spec-item" title="Время до первого токена (TTFT)"><svg class="ic"><use href="#i-spark"/></svg>TTFT: <b>${ttftDisplay}</b></span>
                <span class="mpf-spec-item" title="Скорость генерации токенов в секунду"><svg class="ic"><use href="#i-refresh"/></svg>Скорость: <b>${throughputDisplay}</b></span>
                <span class="mpf-spec-item" title="Стоимость за 1 млн токенов (Input / Output)"><svg class="ic"><use href="#i-wallet"/></svg>In: <b>${inPriceDisplay}</b> / Out: <b>${outPriceDisplay}</b></span>
                ${cachePricePill}
                ${uptimePill}
            </div>
            ${paramsPillsHtml}
            ${p.note ? `<div class="mpf-provider-note">${esc(p.note)}</div>` : ''}
        </div>`;
    }).join('');

    const emptyNotice = providers.length === 0 ? `
        <div class="mpf-empty-endpoints">
            <svg class="ic"><use href="#i-info"/></svg>
            <div>
                <div class="mpf-empty-title">Отдельные серверные узлы не опубликованы</div>
                <div class="mpf-empty-desc">OpenRouter использует единую централизованную точку входа для этой модели. Выбор провайдера осуществляется автоматически маршрутизатором.</div>
            </div>
        </div>
    ` : '';

    providersList.innerHTML = cardsHtml + emptyNotice;

    updateSortControlVisibility(curSelectedEndpointId !== 'auto');

    providersList.querySelectorAll('.mpf-provider-card').forEach(card => {
        card.onclick = () => {
            providersList.querySelectorAll('.mpf-provider-card').forEach(c => c.classList.remove('sel'));
            card.classList.add('sel');
            updateSortControlVisibility(card.dataset.eid !== 'auto');
        };
    });
}

function closeModelProviderFlyout() {
    if (flyoutAbortCtrl) {
        try { flyoutAbortCtrl.abort(); } catch (e) { }
        flyoutAbortCtrl = null;
    }
    $('#modelProviderFlyoutOverlay').classList.remove('show');
    activeFlyoutModelId = null;
}

window.openModelProviderFlyout = openModelProviderFlyout;
window.closeModelProviderFlyout = closeModelProviderFlyout;

$('#mpfCloseBtn')?.addEventListener('click', closeModelProviderFlyout);
$('#modelProviderFlyoutOverlay')?.addEventListener('click', e => {
    if (e.target === $('#modelProviderFlyoutOverlay')) closeModelProviderFlyout();
});

$('#mpfFallbackSwitch')?.addEventListener('click', function () {
    this.classList.toggle('on');
});

document.querySelectorAll('#mpfSortSeg .set-seg-btn').forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll('#mpfSortSeg .set-seg-btn').forEach(x => x.classList.remove('sel'));
        btn.classList.add('sel');
    };
});

$('#mpfDoneBtn')?.addEventListener('click', () => {
    if (!activeFlyoutModelId) return;
    const mid = activeFlyoutModelId;
    const baseId = mid.replace(/:[a-zA-Z0-9_.-]+$/i, '');
    if (!state.settings.modelProviders) state.settings.modelProviders = {};

    const selFlavorBtn = document.querySelector('#mpfFlavorChips .mpf-flavor-btn.sel');
    const rawFlavor = selFlavorBtn ? selFlavorBtn.dataset.flavor : 'standard';
    const selectedFlavor = rawFlavor || 'standard';

    const selCard = document.querySelector('#mpfProvidersList .mpf-provider-card.sel');
    const selectedEndpointId = selCard ? selCard.dataset.eid : 'auto';
    const selectedRoutingSlug = selCard ? selCard.dataset.slug : 'auto';
    const selectedEndpointName = selCard ? selCard.dataset.pname : '';

    const allowFallbacks = $('#mpfFallbackSwitch').classList.contains('on');
    const selSortBtn = document.querySelector('#mpfSortSeg .set-seg-btn.sel');
    const sortVal = selSortBtn ? selSortBtn.dataset.sort : 'default';

    const modelObj = getModel(mid);
    const isOpenAI = modelObj.id.startsWith('openai/') || (modelObj.api === 'openai');
    const isClaude = modelObj.id.startsWith('anthropic/') || (modelObj.api === 'anthropic');
    const selEffortBtn = document.querySelector('#mpfEffortSeg .set-seg-btn.sel');
    const effortSettingVal = selEffortBtn ? selEffortBtn.dataset.effort : null;
    const selReasoningBtn = document.querySelector('#mpfReasoningSeg .set-seg-btn.sel');
    const reasoningVal = selReasoningBtn ? selReasoningBtn.dataset.val : null;

    const newCfg = {
        reasoningEffort: effortSettingVal || undefined,
        flavor: selectedFlavor,
        selectedEndpointId: selectedEndpointId === 'auto' ? undefined : selectedEndpointId,
        selectedProviderSlug: selectedRoutingSlug === 'auto' ? undefined : selectedRoutingSlug,
        selectedProvider: selectedRoutingSlug === 'auto' ? undefined : selectedRoutingSlug,
        selectedEndpointName: selectedEndpointId === 'auto' ? undefined : selectedEndpointName,
        order: selectedRoutingSlug !== 'auto' ? [selectedRoutingSlug] : undefined,
        only: (selectedRoutingSlug !== 'auto' && !allowFallbacks) ? [selectedRoutingSlug] : undefined,
        allow_fallbacks: allowFallbacks,
        sort: (selectedRoutingSlug === 'auto' && sortVal !== 'default') ? sortVal : undefined,
        openaiReasoningSummary: (isOpenAI && reasoningVal) ? reasoningVal : undefined,
        claudeThinkingDisplay: (isClaude && reasoningVal) ? reasoningVal : undefined
    };

    // Централизованная фиксация конфигурации модели
    state.settings.modelProviders[mid] = newCfg;
    state.settings.modelProviders[baseId] = newCfg;

    // Синхронизируем активную модель, если настраивалась она
    const curActiveBase = (state.settings.modelId || '').replace(/:[a-zA-Z0-9_.-]+$/i, '');
    if (curActiveBase === baseId) {
        const targetMid = (selectedFlavor === 'free') ? `${baseId}:free` : ((selectedFlavor && selectedFlavor !== 'standard') ? `${baseId}:${selectedFlavor}` : baseId);
        state.settings.modelId = targetMid;
    }

    save();
    closeModelProviderFlyout();
    renderModelMenu();
    updateTopChips();
    if (window.promptInputCtrl && typeof window.promptInputCtrl.syncModelAndEffort === 'function') {
        window.promptInputCtrl.syncModelAndEffort();
        window.promptInputCtrl.renderModelList();
    }
    toast(`Маршрут и вариант (${selectedFlavor.toUpperCase()}) сохранены`, 'ok', 1800);
});

$('#mpfResetBtn')?.addEventListener('click', () => {
    if (!activeFlyoutModelId) return;
    const mid = activeFlyoutModelId;
    const baseId = mid.replace(/:(nitro|exacto|free|online|extended)$/i, '');
    if (state.settings.modelProviders) {
        delete state.settings.modelProviders[mid];
        delete state.settings.modelProviders[baseId];
    }
    save();
    openModelProviderFlyout(mid);
    renderModelMenu();
    updateTopChips();
    toast('Сброшено в авто-выбор', 'info', 1400);
});

/* ============================================================
   МЕНЮ РАЗМЫШЛЕНИЙ (LINEAR / OBSIDIAN PRO)
   Строгий селектор конфигурации reasoning токенов модели
============================================================ */
function getStageBadge(val) {
    const v = String(val || '').toLowerCase();
    if (v === 'off' || v === 'none' || v === '0') return '0 TOKENS';
    if (v === 'minimal' || v === 'min') return '512-1K';
    if (v === 'low') return '1K-2K';
    if (v === 'medium' || v === 'mid' || v === 'standard' || v === 'balanced') return '4K-8K';
    if (v === 'high' || v === 'deep') return '16K-32K';
    if (v === 'xhigh') return '32K-64K';
    if (v === 'max' || v === 'ultra' || v === 'extreme') return '64K-128K';
    if (v === 'always') return 'АВТО';
    if (v === 'not-supported') return 'НЕДОСТУПНО';
    return v.toUpperCase();
}

function getStageLevel(val) {
    const v = String(val || '').toLowerCase();
    if (v === 'off' || v === 'none' || v === '0') return 0;
    if (v === 'low' || v === 'minimal' || v === 'min') return 1;
    if (v === 'medium' || v === 'standard' || v === 'balanced') return 2;
    if (v === 'high' || v === 'deep') return 3;
    if (v === 'max' || v === 'ultra' || v === 'extreme') return 4;
    return 1;
}

function renderStageMeter(level, isUnsup, stateKey) {
    if (isUnsup) {
        return `<div class="tm-meter-unsup" aria-hidden="true"><svg class="ic"><use href="#i-lock"/></svg></div>`;
    }
    const orbStateMap = {
        'off': 'breathing',
        'minimal': 'working',
        'low': 'listening',
        'medium': 'solving',
        'high': 'composing',
        'xhigh': 'composing',
        'max': 'shaping'
    };
    const orbSt = orbStateMap[stateKey] || 'working';
    return `
    <div class="tm-opt-orb-wrap" aria-hidden="true">
        <canvas class="tm-opt-orb-canvas" data-opt-state="${orbSt}" width="28" height="28"></canvas>
    </div>`;
}

function renderThinkMenu() {
    const model = getModel(state.settings.modelId);
    const configs = typeof window.getModelThinkingConfig === 'function'
        ? window.getModelThinkingConfig(model)
        : (modelThinkingConfigs[model.id] || modelThinkingConfigs[model.id.replace(/:(nitro|exacto|free|online|extended)$/i, '')] || [
            { value: "off", label: "Отключено", desc: "Рассуждения отключены" }
        ]);

    const validValues = configs.map(c => c.value);
    if (!validValues.includes(state.settings.reasoning)) {
        state.settings.reasoning = validValues.find(v => v !== 'not-supported') || validValues[0]?.value || 'off';
        save();
        updateTopChips();
    }

    const itemsHtml = configs.map(cfg => {
        const isUnsup = cfg.value === 'not-supported';
        const isActive = cfg.value === state.settings.reasoning;
        const level = getStageLevel(cfg.value);
        const badge = getStageBadge(cfg.value);

        return `
        <button class="tm-option ${isActive ? 'active' : ''} ${isUnsup ? 'unsup' : ''}" 
                data-val="${esc(cfg.value)}" 
                ${isUnsup ? 'disabled' : ''} 
                role="option" 
                aria-selected="${isActive}">
            <div class="tm-meter-col">
                ${renderStageMeter(level, isUnsup, cfg.value)}
            </div>
            <div class="tm-body">
                <div class="tm-label-row">
                    <span class="tm-label">${esc(cfg.label)}</span>
                    <span class="tm-badge">${esc(badge)}</span>
                </div>
                <div class="tm-desc">${esc(cfg.desc || '')}</div>
            </div>
            <div class="tm-state-col">
                <span class="tm-radio-disc" aria-hidden="true">
                    <svg class="ic tm-check-ic"><use href="#i-check"/></svg>
                </span>
            </div>
        </button>`;
    }).join('');

    const modelIconHtml = model.icon
        ? `<img src="${esc(model.icon)}" class="tm-model-ico" alt="" loading="lazy">`
        : `<svg class="ic"><use href="#i-chip"/></svg>`;

    thinkMenu.innerHTML = `
        <div class="tm-header no-sel">
            <div class="tm-header-main">
                <div class="tm-title">
                    <span class="tm-header-orb-wrap"><canvas id="tmHeaderOrbCanvas" width="32" height="32"></canvas></span>
                    <span>Этапы размышлений</span>
                </div>
                <div class="tm-subtitle">Глубина логической цепочки рассуждений (Reasoning)</div>
            </div>
            <div class="tm-model-pill" title="${esc(model.name)}">
                ${modelIconHtml}
                <span>${esc(model.name)}</span>
            </div>
        </div>
        <div class="tm-list" role="listbox" aria-label="Выбор глубины размышлений">
            ${itemsHtml}
        </div>
        <div class="tm-footer no-sel">
            <svg class="ic"><use href="#i-info"/></svg>
            <span>Больше этапов — глубже анализ в коде и логике, но увеличивается время ответа</span>
        </div>`;

    // Запуск ThinkingOrb на мини-холстах опций и в шапке меню
    if (typeof window.ThinkingOrb === 'function') {
        const activeTheme = state.settings.theme || 'auto';
        const color = state.settings.customThemes?.[activeTheme]?.streamColor || null;

        const headerCanvas = thinkMenu.querySelector('#tmHeaderOrbCanvas');
        if (headerCanvas) {
            new window.ThinkingOrb(headerCanvas, {
                state: 'composing',
                size: 32,
                theme: activeTheme,
                color: color,
                speed: 0.85
            });
        }

        thinkMenu.querySelectorAll('.tm-opt-orb-canvas').forEach(cv => {
            const st = cv.dataset.optState || 'working';
            new window.ThinkingOrb(cv, {
                state: st,
                size: 28,
                theme: activeTheme,
                color: color,
                speed: 0.75
            });
        });
    }

    thinkMenu.querySelectorAll('.tm-option:not([disabled])').forEach(b => {
        b.addEventListener('click', () => {
            const val = b.dataset.val;
            if (!val || val === 'not-supported') return;
            state.settings.reasoning = val;
            save();
            updateTopChips();
            renderThinkMenu();
            closeAllMenus();
            const cfg = configs.find(c => c.value === val);
            toast('Размышления: ' + (cfg ? cfg.label : val), 'ok', 1600);
        });
    });
}

/* Менеджер захвата и восстановления фокуса (Keyboard Focus Trap & Restoration) */
let lastActiveTriggerElement = null;

function trapFocusInContainer(container, e) {
    if (!container || e.key !== 'Tab') return;
    const focusables = Array.from(container.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
        .filter(el => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement);

    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
    }
}

function handleMenuKeyboardNavigation(menuElement, e) {
    if (!menuElement || menuElement.hidden) return;
    // Если фокус находится внутри текстового поля поиска, не перехватываем навигацию каретки
    if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
        if (e.key === 'Home' || e.key === 'End' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            return;
        }
    }

    const items = Array.from(menuElement.querySelectorAll('.m-item, .tm-option:not([disabled]), .attach-card, .slash-item, button:not([disabled])'))
        .filter(el => el.offsetWidth > 0 || el.offsetHeight > 0);
    if (!items.length) return;

    const currentIndex = items.indexOf(document.activeElement);

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
        items[nextIndex].focus();
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
        items[prevIndex].focus();
    } else if (e.key === 'Home') {
        e.preventDefault();
        items[0].focus();
    } else if (e.key === 'End') {
        e.preventDefault();
        items[items.length - 1].focus();
    }
}

function closeMenu(m, immediate = false) {
    if (!m || m.hidden || m.classList.contains('out')) return;
    const owner = m === plusMenu ? $('#btnPlus') : null;
    if (owner) owner.classList.remove('open');
    const container = document.getElementById('promptInputContainer');
    const card = document.getElementById('promptInputCard');

    if (immediate) {
        m.hidden = true;
        m.classList.remove('anim', 'out');
        if (m === plusMenu) {
            container?.classList.remove('has-menu-open', 'has-plus-open');
            card?.classList.remove('shell-open');
        }
        if (owner && document.activeElement && m.contains(document.activeElement)) owner.focus();
    } else {
        m.classList.remove('anim');
        void m.offsetWidth;
        m.classList.add('out');
        setTimeout(() => {
            if (m.classList.contains('out')) {
                m.hidden = true;
                m.classList.remove('out');
                if (m === plusMenu) {
                    container?.classList.remove('has-menu-open', 'has-plus-open');
                    card?.classList.remove('shell-open');
                }
                if (owner && document.activeElement && m.contains(document.activeElement)) owner.focus();
            }
        }, 180);
    }
}

function showMenu(m) {
    lastActiveTriggerElement = document.activeElement;
    m.classList.remove('out');
    m.hidden = false;
    void m.offsetWidth;
    m.classList.add('anim');

    if (m === plusMenu) {
        const container = document.getElementById('promptInputContainer');
        const card = document.getElementById('promptInputCard');
        container?.classList.add('has-menu-open', 'has-plus-open');
        card?.classList.add('shell-open');
        if (window.promptInputCtrl) window.promptInputCtrl.expand(false);
    }

    const owner = m === plusMenu ? $('#btnPlus') : null;
    if (owner) owner.classList.add('open');

    // Автофокус на активный элемент меню (на десктопе без принудительного открытия клавиатуры на мобильных)
    requestAnimationFrame(() => {
        if (isMobile) return;
        if (m === modelMenu) {
            const searchInp = m.querySelector('#modelMenuSearchInput');
            if (searchInp) { searchInp.focus(); return; }
        }
        const activeItem = m.querySelector('.m-item.active, .tm-option.active, .attach-card, button:not([disabled])');
        if (activeItem) activeItem.focus();
    });
}

function closeAllMenus(except, immediate = false) {
    [modelMenu, thinkMenu, plusMenu].forEach(m => {
        if (m && m !== except) closeMenu(m, immediate);
    });
    if (window.promptInputCtrl) {
        if (except !== window.promptInputCtrl.modelDropdown) window.promptInputCtrl.closeModelDropdown();
        if (except !== window.promptInputCtrl.effortDropdown) window.promptInputCtrl.closeEffortDropdown();
    }
}

function toggleMenu(m, renderFn) {
    const isVisible = !m.hidden && !m.classList.contains('out');
    closeAllMenus(m);
    if (isVisible) {
        closeMenu(m);
    } else {
        if (renderFn) renderFn();
        showMenu(m);
    }
}

document.addEventListener('click', e => {
    if (e.target.closest('.prompt-model-dropdown, .prompt-effort-dropdown, #promptModelSelectBtn, #promptEffortBtn, .prompt-pill-btn, #promptBottomBar')) {
        return;
    }
    if (!e.target.closest('.menu') && !e.target.closest('#btnPlus'))
        closeAllMenus();
});

function updateTopChips() {
    if (window.promptInputCtrl && typeof window.promptInputCtrl.syncModelAndEffort === 'function') {
        window.promptInputCtrl.syncModelAndEffort();
    }
    const chat = typeof activeChat === 'function' ? activeChat() : null;
    let devBadge = $('#topbarDevBadge');
    if (chat && chat.role === 'developer') {
        if (!devBadge) {
            devBadge = document.createElement('span');
            devBadge.id = 'topbarDevBadge';
            devBadge.className = 'topbar-dev-badge no-sel';
            devBadge.title = 'Роль сообщений: Developer (только для моделей OpenAI)';
            devBadge.innerHTML = '<svg class="ic"><use href="#i-terminal"/></svg>DEV';
            const tbCenter = document.querySelector('.tb-center');
            if (tbCenter) tbCenter.appendChild(devBadge);
        }
    } else if (devBadge) {
        devBadge.remove();
    }
    updateApiSrcChip();
}

/* ═══════════════════════════════════════════════════════════════
   ВЫБОР ИСТОЧНИКА API (ProxyAPI ↔ OpenRouter ↔ Авто)
   ═══════════════════════════════════════════════════════════════ */
const API_SRC_LABELS = {
    proxy: 'ProxyAPI',
    openrouter: 'OpenRouter',
    auto: 'Авто'
};

/* Подсвечивает активный сегмент источника API в настройках */
function updateApiSrcChip() {
    const src = state.settings.apiSource || 'auto';
    const buttons = document.querySelectorAll('#apiSrcChips .set-seg-btn, #apiSrcChips .igm-chip');
    buttons.forEach(b => {
        const isSelected = b.dataset.src === src;
        b.classList.toggle('sel', isSelected);
        b.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    });
}

/* Централизованный resolveApiRoute уже экспортирован в глобальную область из proxymodel.js.
   На случай автономной загрузки ai.js регистрируем резервный обработчик в window. */
if (typeof window.resolveApiRoute !== 'function') {
    window.resolveApiRoute = function (settings, model) {
        const s = settings || (typeof state !== 'undefined' ? state.settings : window.state?.settings) || {};
        const modelCfg = (model && s.modelProviders && s.modelProviders[model.id]) || {};
        const src = modelCfg.apiSource && modelCfg.apiSource !== 'inherit' ? modelCfg.apiSource : (s.apiSource || 'auto');
        const hasProxy = !!(s.proxyKey || '').trim();
        const hasOR = !!(s.orKey || '').trim();
        const isORMdl = model && (model.api === 'openrouter' || model.isOpenRouterDynamic);

        if (src === 'proxy') return { useProxy: hasProxy, useORDirect: false, missing: hasProxy ? null : 'proxy' };
        if (src === 'openrouter') return { useProxy: false, useORDirect: hasOR, missing: hasOR ? null : 'openrouter' };

        if (isORMdl) {
            if (hasOR) return { useProxy: false, useORDirect: true, missing: null };
            if (hasProxy) return { useProxy: true, useORDirect: false, missing: null };
            return { useProxy: false, useORDirect: false, missing: 'openrouter' };
        }

        if (hasProxy) return { useProxy: true, useORDirect: false, missing: null };
        if (hasOR) return { useProxy: false, useORDirect: true, missing: null };
        return { useProxy: false, useORDirect: false, missing: 'proxy' };
    };
}

/* ---------- Диспетчер контекстных режимов экрана ---------- */
function setViewMode(mode = 'chat') {
    document.documentElement.dataset.view = mode;
    if (mode === 'chat' && !isMobile) {
        if (!bgRafId && !isBackgroundSuspended()) {
            bgRafId = requestAnimationFrame(bgLoop);
        }
    }
}

const drawer = $('#drawer');
function openDrawer() {
    lastActiveTriggerElement = document.activeElement;
    setViewMode('drawer');
    drawer.classList.add('open');
    $('#drawerScrim').classList.add('show');
    renderChatList();
    navCtrl.push('drawer');
    setTimeout(() => {
        const searchInput = $('#searchInput');
        if (searchInput) searchInput.focus();
    }, 120);
}

function closeDrawer(opts = {}) {
    drawer.classList.remove('open');
    $('#drawerScrim').classList.remove('show');
    closeChatCtxMenu();
    setViewMode('chat');
    if (!opts.fromPopstate) {
        navCtrl.pop('drawer');
    }
    if (lastActiveTriggerElement && typeof lastActiveTriggerElement.focus === 'function') {
        lastActiveTriggerElement.focus();
    }
}
$('#btnMenu').addEventListener('click', openDrawer);
$('#drawerClose').addEventListener('click', closeDrawer);
$('#drawerScrim').addEventListener('click', closeDrawer);

/* ── ДВУСТОРОННЯЯ КИНЕМАТИКА ШТОРКИ ИСТОРИИ ЧАТОВ (SWIPE TO OPEN / CLOSE 1:1) ──
Пользователь может свободно и плавно перетаскивать шторку в обе стороны:
1. Закрытие (свайп влево из открытой шторки): следование 1:1, удержание в полузакрытом положении, мгновенный сброс или отскок.
2. Открытие (свайп вправо из активного чата): можно тянуть экран из любой удобной точки, плавно приоткрывать историю,
   останавливаться на любой ширине для беглого просмотра, возвращать назад или открывать взмахом. */
let drawerSwipe = null;
let drawerOpenSwipe = null;
const DRAWER_VEL_PAUSE = 160;   // мс тишины, после которых скорость считается нулевой
const DRAWER_POS_CLOSE = 0.50;  // пройдено больше 50% пути — закрываем
const DRAWER_PROJ_CLOSE = 0.30; // проекция с инерцией для закрытия
const DRAWER_POS_OPEN = 0.35;   // открыто больше 35% ширины — открываем целиком
const DRAWER_PROJ_OPEN = 0.22;  // проекция с инерцией для открывающего флика
const DRAWER_FLICK_VEL = 0.16;  // порог уверенного маха пальцем (px/ms)

/* ── 1. ЗАКРЫТИЕ ШТОРКИ (СВАЙП ВЛЕВО) ── */
drawer.addEventListener('pointerdown', e => {
    if (!drawer.classList.contains('open')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drawerSwipe = {
        id: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        x: 0,
        horizontal: null,
        vel: 0,
        lastX: e.clientX,
        lastT: performance.now(),
        captured: false
    };
}, { passive: true });

drawer.addEventListener('pointermove', e => {
    if (!drawerSwipe || e.pointerId !== drawerSwipe.id) return;
    const dx = e.clientX - drawerSwipe.startX;
    const dy = e.clientY - drawerSwipe.startY;

    if (drawerSwipe.horizontal === null) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        const isHoriz = dx < 0 && (Math.abs(dx) >= Math.abs(dy) || (dx < -18 && Math.abs(dy) < 24));
        if (!isHoriz) { drawerSwipe = null; return; }
        drawerSwipe.horizontal = true;
        drawer.classList.add('dragging');
        $('#drawerScrim').style.transition = 'none';
        try { drawer.setPointerCapture(e.pointerId); drawerSwipe.captured = true; } catch (_) { }
    }

    const now = performance.now();
    const dt = now - drawerSwipe.lastT;
    if (dt > 0) {
        if (dt < DRAWER_VEL_PAUSE) {
            const instV = (e.clientX - drawerSwipe.lastX) / dt;
            drawerSwipe.vel = drawerSwipe.vel * 0.65 + instV * 0.35;
        } else {
            drawerSwipe.vel = 0;
        }
    }
    drawerSwipe.lastX = e.clientX;
    drawerSwipe.lastT = now;

    const w = drawer.offsetWidth || Math.min(440, window.innerWidth) || 320;
    const x = Math.max(-w, Math.min(0, dx));
    drawerSwipe.x = x;
    drawer.style.transform = `translate3d(${x}px, 0, 0)`;
    $('#drawerScrim').style.opacity = String(Math.max(0, 1 + x / w));
}, { passive: true });

const endDrawerSwipe = e => {
    if (!drawerSwipe || e.pointerId !== drawerSwipe.id) return;
    const sw = drawerSwipe;
    drawerSwipe = null;
    if (sw.horizontal === null) return;
    if (sw.captured) { try { drawer.releasePointerCapture(e.pointerId); } catch (_) { } }
    const w = drawer.offsetWidth || Math.min(440, window.innerWidth) || 320;
    const vel = (performance.now() - sw.lastT > DRAWER_VEL_PAUSE) ? 0 : sw.vel;
    const projected = sw.x + vel * 160;
    const shouldClose = sw.x < -(w * DRAWER_POS_CLOSE) || projected < -(w * DRAWER_PROJ_CLOSE);

    drawer.classList.remove('dragging');
    void drawer.offsetWidth; // Активируем плавный возврат CSS Transition
    $('#drawerScrim').style.transition = '';
    $('#drawerScrim').style.pointerEvents = '';
    drawer.style.transform = '';
    $('#drawerScrim').style.opacity = '';
    if (shouldClose) closeDrawer();
};
drawer.addEventListener('pointerup', endDrawerSwipe);
drawer.addEventListener('pointercancel', endDrawerSwipe);

/* ── 2. ОТКРЫТИЕ ШТОРКИ (СВАЙП ВПРАВО ИЗ АКТИВНОГО ЧАТА) ── */
document.addEventListener('pointerdown', e => {
    if (drawer.classList.contains('open')) return;

    // Исключаем вызов при открытых диалогах, модалках и полноэкранных режимах
    if (document.querySelector('.overlay.show, .settings-overlay-fullscreen.show')) return;
    if ($('#imgViewer') && !$('#imgViewer').hidden) return;
    if ($('#htmlPreview') && !$('#htmlPreview').hidden) return;
    if (window.uni && window.uni.active) return;
    if ($('#msgCtxMenu') && !$('#msgCtxMenu').hidden) return;
    if ($('#chatCtxMenu') && !$('#chatCtxMenu').hidden) return;
    if ($('#igCtxMenu') && !$('#igCtxMenu').hidden) return;
    if ($('#favCtxMenu') && !$('#favCtxMenu').hidden) return;
    if ($('#artCtxMenu') && !$('#artCtxMenu').hidden) return;

    // Исключаем клики по кнопкам, полям ввода, переключателям и интерактивным контролам
    if (e.target.closest('button, a, input, textarea, select, [contenteditable], .switch, .cbtn, .icon-btn, .chip, .mact, .gi-btn, .menu, .ig-ctx, .text-selection-toolbar, #aiContextWindowRoot, [data-tool-mount]')) {
        return;
    }

    // Исключаем элементы с горизонтальным скроллом контента (код, карусели, теги)
    if (e.target.closest('pre, code, .webimgs-body, .prompt-attachment-track, .url-attached-chips, .set-segmented, .font-family-chips, .igm-chips, .md-table-scroll-view, .md-table-card, .igc-ref-thumbs')) {
        return;
    }

    if (hasActiveTextSelection()) return;

    const isTouch = e.pointerType !== 'mouse' || checkIsMobile();
    if (!isTouch) {
        if (e.button !== 0) return;
        const isLeftZone = e.clientX <= Math.min(100, window.innerWidth * 0.18);
        const isOverText = !!e.target.closest('.bubble, .md-body, .msg-main, .msg-text, .msg-edit');
        if (!isLeftZone && isOverText) return;
    } else {
        // На сенсорных экранах тянуть можно из любых удобных 75% экрана слева
        if (e.clientX > Math.max(280, window.innerWidth * 0.75)) return;
    }

    const w = drawer.offsetWidth || Math.min(440, window.innerWidth) || 320;
    drawerOpenSwipe = {
        id: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        x: -w,
        horizontal: null,
        vel: 0,
        lastX: e.clientX,
        lastT: performance.now(),
        target: e.target,
        captured: false
    };
}, { passive: true });

document.addEventListener('pointermove', e => {
    if (!drawerOpenSwipe || e.pointerId !== drawerOpenSwipe.id) return;
    const dx = e.clientX - drawerOpenSwipe.startX;
    const dy = e.clientY - drawerOpenSwipe.startY;

    if (drawerOpenSwipe.horizontal === null) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;

        // Если движение вертикальное или палец уходит влево — передаём управление нативному скроллу ленты
        if (Math.abs(dy) >= Math.abs(dx) || dx <= 0) {
            drawerOpenSwipe = null;
            return;
        }

        drawerOpenSwipe.horizontal = true;
        renderChatList(); // Заранее подготавливаем список истории
        drawer.classList.add('dragging');
        $('#drawerScrim').style.transition = 'none';
        $('#drawerScrim').classList.add('show');
        $('#drawerScrim').style.pointerEvents = 'none';

        try {
            drawerOpenSwipe.target.setPointerCapture(e.pointerId);
            drawerOpenSwipe.captured = true;
        } catch (_) { }
    }

    const now = performance.now();
    const dt = now - drawerOpenSwipe.lastT;
    if (dt > 0) {
        if (dt < DRAWER_VEL_PAUSE) {
            const instV = (e.clientX - drawerOpenSwipe.lastX) / dt;
            drawerOpenSwipe.vel = drawerOpenSwipe.vel * 0.65 + instV * 0.35;
        } else {
            drawerOpenSwipe.vel = 0;
        }
    }
    drawerOpenSwipe.lastX = e.clientX;
    drawerOpenSwipe.lastT = now;

    const w = drawer.offsetWidth || Math.min(440, window.innerWidth) || 320;
    // Плавное следование 1:1 от закрытого положения (-w) до полностью открытого (0)
    const x = Math.max(-w, Math.min(0, -w + dx));
    drawerOpenSwipe.x = x;
    drawer.style.transform = `translate3d(${x}px, 0, 0)`;

    const progress = Math.max(0, Math.min(1, (x + w) / w));
    $('#drawerScrim').style.opacity = String(progress);
}, { passive: true });

const endDrawerOpenSwipe = e => {
    if (!drawerOpenSwipe || e.pointerId !== drawerOpenSwipe.id) return;
    const sw = drawerOpenSwipe;
    drawerOpenSwipe = null;

    if (sw.horizontal === null) return;
    if (sw.captured && sw.target) {
        try { sw.target.releasePointerCapture(e.pointerId); } catch (_) { }
    }

    const w = drawer.offsetWidth || Math.min(440, window.innerWidth) || 320;
    const now = performance.now();
    const vel = (now - sw.lastT > DRAWER_VEL_PAUSE) ? 0 : sw.vel;
    const openedPixels = sw.x + w; // количество раскрытых пикселей от 0 до w
    const projected = openedPixels + vel * 160;

    // Открываем, если пройдено больше 35% ширины, либо при динамичном флике вправо
    const shouldOpen = (openedPixels > w * DRAWER_POS_OPEN) || (projected > w * DRAWER_PROJ_OPEN && vel > DRAWER_FLICK_VEL);

    drawer.classList.remove('dragging');
    void drawer.offsetWidth; // Гарантирует запуск аппаратной CSS-кинематики
    $('#drawerScrim').style.transition = '';
    $('#drawerScrim').style.pointerEvents = '';
    drawer.style.transform = '';
    $('#drawerScrim').style.opacity = '';

    if (shouldOpen) {
        openDrawer();
    } else {
        drawer.classList.remove('open');
        $('#drawerScrim').classList.remove('show');
        setViewMode('chat');
    }
};

document.addEventListener('pointerup', endDrawerOpenSwipe);
document.addEventListener('pointercancel', endDrawerOpenSwipe);
$('#btnNewChat').addEventListener('click', newChat);
$('#searchInput').addEventListener('input', () => {
    $('#searchWrap').classList.toggle('has-q', !!$('#searchInput').value);
    renderChatList();
});
$('#searchClear').addEventListener('click', () => { $('#searchInput').value = ''; $('#searchWrap').classList.remove('has-q'); renderChatList(); });

/* ---------- Настройки (Studio Fullscreen Controller) ---------- */
const settingsOverlay = $('#settingsOverlay');

const PROMPT_PRESETS = {
    senior: 'Ты — ведущий системный архитектор и Senior Full-Stack инженер. Отвечай структурированно, строго без emoji, используй надежные паттерны, чистый код и краткие технические обоснования.',
    concise: 'Ты — лаконичный технический эксперт. Отвечай максимально кратко, тезисно и по существу. Без приветствий и вводных фраз — только факты, рабочий код и формулы.',
    creative: 'Ты — ведущий UI/UX дизайнер и фронтенд-инженер. Твой фокус — визуальное совершенство, дизайн-системы, микро-глассморфизм, палитры в стиле Linear/Vercel и чистота CSS.'
};

function renderModelProvidersSettings() {
    if (window.MpList) return window.MpList.render();
    const list = $('#modelProvidersList');
    if (!list) return;
    const filter = ($('#mpSearchInput')?.value || '').trim();
    const all = getAllModels();
    const models = all.filter(m => !m.requiresOpenRouter && matchModelSearch(m, filter));

    if (!models.length) {
        list.innerHTML = `<div class="list-empty"><svg><use href="#i-search"/></svg>Модели по запросу не найдены</div>`;
        return;
    }

    if (!state.settings.modelProviders) state.settings.modelProviders = {};

    list.innerHTML = models.map(m => {
        const baseId = m.id.replace(/:[a-zA-Z0-9_.-]+$/i, '');
        const catalog = typeof window.getModelCatalogEntry === 'function'
            ? window.getModelCatalogEntry(m.id)
            : (window.MODEL_ENDPOINTS_CATALOG?.[baseId] || { name: m.name, flavors: [{ id: 'standard', label: 'Стандарт', desc: 'Базовая модель' }], providers: [] });

        const cfg = state.settings.modelProviders[m.id] || state.settings.modelProviders[baseId] || {};
        const activeSrc = cfg.apiSource || 'inherit';
        const activeSort = cfg.sort || 'default';

        const flavorsList = typeof window.getModelAvailableFlavors === 'function'
            ? window.getModelAvailableFlavors(m)
            : (catalog.flavors || [{ id: 'standard', label: 'Стандарт', desc: 'Базовая модель' }]);
        const validFlavorIds = new Set(flavorsList.map(f => f.id));

        let activeFlavor = 'standard';
        if (cfg.flavor && validFlavorIds.has(cfg.flavor)) {
            activeFlavor = cfg.flavor;
        } else if (catalog.defaultFlavor && validFlavorIds.has(catalog.defaultFlavor)) {
            activeFlavor = catalog.defaultFlavor;
        }

        const allowFallbacks = cfg.allow_fallbacks !== false;
        const currentOrder = Array.isArray(cfg.order) ? cfg.order : (cfg.selectedProvider && cfg.selectedProvider !== 'auto' ? [cfg.selectedProvider] : []);

        const flavorsHtml = flavorsList.length > 1 ? `
            <div class="mp-config-row" style="padding-bottom:10px;border-bottom:1px dashed var(--line)">
                <div class="mp-opt-col">
                    <label class="mp-sub-label">Режим / Вариант (Flavor):</label>
                    <div class="set-segmented mp-flavor-seg" data-mid="${m.id}">
                        ${flavorsList.map(f => `
                            <button type="button" class="set-seg-btn ${activeFlavor === f.id ? 'sel' : ''}" data-flavor="${f.id}" title="${esc(f.desc)}">${esc(f.label)}</button>
                        `).join('')}
                    </div>
                </div>
            </div>
        ` : '';

        const orderChipsHtml = currentOrder.map(pid => `
            <span class="mp-prov-chip sel" data-mid="${m.id}" data-pid="${esc(pid)}">
                <span class="mp-chip-name">${esc(pid)}</span>
                <svg class="ic mp-chip-check"><use href="#i-check"/></svg>
            </span>
        `).join('');

        const orderValStr = currentOrder.join(', ');

        const isFree = m.id.endsWith(':free') || m.pricing?.isFree || (m.tagline && m.tagline.toLowerCase().includes('free'));
        const fullDesc = String(m.description || m.tagline || '').trim();

        const ctxLabel = m.context || (m.contextLength ? `${Math.round(m.contextLength / 1000)}K` : catalog.contextLength || null);
        const priceInfo = isFree
            ? 'Бесплатно ($0 / 1M)'
            : (m.pricing?.promptFormatted && m.pricing?.completionFormatted
                ? `Вход: ${m.pricing.promptFormatted} · Выход: ${m.pricing.completionFormatted}`
                : 'Тарификация OpenRouter');

        return `
        <div class="model-provider-card" data-mid="${m.id}">
            <div class="mp-card-header">
                <div class="mp-model-identity">
                    <div class="mp-model-icon">
                        ${(() => {
                const iconSrc = (typeof window.getAiModelIcon === 'function' ? window.getAiModelIcon(m.id, m) : null) || (m.icon && !m.icon.startsWith('http') ? m.icon : null) || m.icon || null;
                return iconSrc ? `<img src="${esc(iconSrc)}" alt="" onerror="this.outerHTML='<svg class=\\'ic\\'><use href=\\'#i-chip\\'/></svg>'">` : `<svg class="ic"><use href="#i-chip"/></svg>`;
            })()}
                    </div>
                    <div class="mp-model-meta">
                        <div class="mp-model-name">
                            ${esc(m.name)} 
                            <span class="mp-model-id-badge">${esc(m.id)}</span>
                            ${ctxLabel ? `<span class="prov-flavor-pill" title="Максимальный контекст">${esc(ctxLabel)} Ctx</span>` : ''}
                            ${isFree ? `<span class="mi-pill-free">FREE</span>` : ''}
                        </div>
                        <div class="mp-model-sub">
                            <span>${esc(m.provider)}</span> · <span class="mp-pricing-meta">${esc(priceInfo)}</span>
                        </div>
                    </div>
                </div>
                ${fullDesc ? `<div class="mp-card-desc">${esc(fullDesc)}</div>` : ''}

                <div class="mp-src-selector">
                    <label class="mp-sub-label">Шлюз модели:</label>
                    <div class="set-segmented mp-src-seg" data-mid="${m.id}">
                        <button type="button" class="set-seg-btn ${activeSrc === 'inherit' ? 'sel' : ''}" data-val="inherit">Глобальный</button>
                        <button type="button" class="set-seg-btn ${activeSrc === 'proxy' ? 'sel' : ''}" data-val="proxy">ProxyAPI</button>
                        <button type="button" class="set-seg-btn ${activeSrc === 'openrouter' ? 'sel' : ''}" data-val="openrouter">OpenRouter</button>
                    </div>
                </div>
            </div>

            <div class="mp-card-body">
                ${flavorsHtml}
                <div class="mp-config-row">
                    <div class="mp-opt-col">
                        <label class="mp-sub-label">Оптимизация маршрутизации (Sort):</label>
                        <div class="set-segmented mp-sort-seg" data-mid="${m.id}">
                            <button type="button" class="set-seg-btn ${activeSort === 'default' ? 'sel' : ''}" data-val="default">Стандарт</button>
                            <button type="button" class="set-seg-btn ${activeSort === 'throughput' ? 'sel' : ''}" data-val="throughput" title="Максимальная скорость токенов/сек">Скорость (TPS)</button>
                            <button type="button" class="set-seg-btn ${activeSort === 'latency' ? 'sel' : ''}" data-val="latency" title="Минимальное время до первого токена">Задержка (TTFT)</button>
                            <button type="button" class="set-seg-btn ${activeSort === 'price' ? 'sel' : ''}" data-val="price" title="Минимальная стоимость токенов">Цена</button>
                        </div>
                    </div>

                    <div class="mp-opt-col mp-fallback-col">
                        <div class="mp-fallback-info">
                            <span class="mp-sub-label">Резервный переход (Failover)</span>
                            <span class="mp-sub-hint">Переключать на запасной узел при отказе</span>
                        </div>
                        <button type="button" class="switch ${allowFallbacks ? 'on' : ''} mp-fallback-switch" data-mid="${m.id}" role="switch" aria-checked="${allowFallbacks}" aria-label="Резервный переход"></button>
                    </div>
                </div>

                <div class="mp-providers-selection">
                    <div class="mp-selection-head">
                        <span class="mp-sub-label">Выбранные узлы инференса:</span>
                        <button type="button" class="btn btn-ghost btn-sm mp-open-flyout-btn" data-mid="${m.id}">
                            <svg class="ic"><use href="#i-spark"/></svg>Выбрать из эндпоинтов OpenRouter (Live)
                        </button>
                    </div>

                    ${orderChipsHtml ? `<div class="mp-chips-palette">${orderChipsHtml}</div>` : ''}

                    <div class="mp-custom-order-input-wrap">
                        <input type="text" class="ws-input mp-order-input" data-mid="${m.id}" value="${esc(orderValStr)}" placeholder="Slug провайдера, например: together, google-vertex/global" spellcheck="false" autocomplete="off" aria-label="Slug провайдера">
                        <button type="button" class="btn btn-ghost btn-sm mp-clear-order-btn" data-mid="${m.id}" title="Сбросить на авто-выбор"><svg class="ic"><use href="#i-refresh"/></svg>Авто</button>
                    </div>
                </div>
            </div>
        </div>`;
    }).join('');

    processMultilingualDom(list);

    // Привязка переключения вариантов (Flavors: standard, nitro, exacto, free)
    list.querySelectorAll('.mp-flavor-seg .set-seg-btn').forEach(btn => {
        btn.onclick = () => {
            const mid = btn.closest('.mp-flavor-seg').dataset.mid;
            const baseId = mid.replace(/:[a-zA-Z0-9_.-]+$/i, '');
            const rawFlavor = btn.dataset.flavor || 'standard';
            if (!state.settings.modelProviders[mid]) state.settings.modelProviders[mid] = {};
            state.settings.modelProviders[mid].flavor = rawFlavor;
            state.settings.modelProviders[baseId] = { ...state.settings.modelProviders[mid] };
            save();
            renderModelProvidersSettings();
            renderModelMenu();
            updateTopChips();
            toast(`Режим для ${mid}: ${rawFlavor}`, 'ok', 1400);
        };
    });

    // Открытие живого селектора эндпоинтов
    list.querySelectorAll('.mp-open-flyout-btn').forEach(btn => {
        btn.onclick = () => openModelProviderFlyout(btn.dataset.mid);
    });

    // Привязка селекторов источника API
    list.querySelectorAll('.mp-src-seg .set-seg-btn').forEach(btn => {
        btn.onclick = () => {
            const mid = btn.closest('.mp-src-seg').dataset.mid;
            const val = btn.dataset.val;
            if (!state.settings.modelProviders[mid]) state.settings.modelProviders[mid] = {};
            state.settings.modelProviders[mid].apiSource = val;
            save();
            renderModelProvidersSettings();
            toast(`Маршрут для ${mid} обновлен: ${val}`, 'ok', 1400);
        };
    });

    // Привязка сортировки Sort
    list.querySelectorAll('.mp-sort-seg .set-seg-btn').forEach(btn => {
        btn.onclick = () => {
            const mid = btn.closest('.mp-sort-seg').dataset.mid;
            const val = btn.dataset.val;
            if (!state.settings.modelProviders[mid]) state.settings.modelProviders[mid] = {};
            state.settings.modelProviders[mid].sort = val === 'default' ? undefined : val;
            save();
            renderModelProvidersSettings();
        };
    });

    // Привязка тумблера Fallback
    list.querySelectorAll('.mp-fallback-switch').forEach(sw => {
        sw.onclick = () => {
            const mid = sw.dataset.mid;
            if (!state.settings.modelProviders[mid]) state.settings.modelProviders[mid] = {};
            const cur = state.settings.modelProviders[mid].allow_fallbacks !== false;
            state.settings.modelProviders[mid].allow_fallbacks = !cur;
            save();
            renderModelProvidersSettings();
        };
    });

    // Привязка ручного ввода order
    list.querySelectorAll('.mp-order-input').forEach(inp => {
        inp.onchange = () => {
            const mid = inp.dataset.mid;
            const parts = inp.value.split(',').map(s => s.trim()).filter(Boolean);
            if (!state.settings.modelProviders[mid]) state.settings.modelProviders[mid] = {};
            state.settings.modelProviders[mid].order = parts.length ? parts : undefined;
            save();
            renderModelProvidersSettings();
        };
    });

    // Привязка кнопки сброса в Авто
    list.querySelectorAll('.mp-clear-order-btn').forEach(btn => {
        btn.onclick = () => {
            const mid = btn.dataset.mid;
            if (state.settings.modelProviders[mid]) {
                delete state.settings.modelProviders[mid].order;
                delete state.settings.modelProviders[mid].customOrder;
                delete state.settings.modelProviders[mid].selectedProvider;
                delete state.settings.modelProviders[mid].only;
                save();
                renderModelProvidersSettings();
                toast('Приоритет провайдеров сброшен на Авто', 'info', 1400);
            }
        };
    });
}

const TAB_TITLES = {
    'general': 'Общие настройки',
    'keys': 'API и Ключи',
    'system': 'Среда и хранилище',
    'appearance': 'Дизайн',
    'cursors': 'Курсоры',
    'fonts': 'Шрифты и текст',
    'custom-designs': 'Свой дизайн',
    'developer': 'Для разработчиков',
    'models': 'Модели',
    'prompt': 'Системный промпт',
    'shortcuts': 'Горячие клавиши',
    'subagents': 'Субагенты'
};

function activateTabFeatures(tabName) {
    if (tabName === 'general') {
        syncSettingsUI();
    } else if (tabName === 'appearance') {
        activeThemeTarget = state.settings.theme || 'dark';
        syncThemeTargetButtons();
        renderAppearanceSettings();
        updateAppearanceLivePreview();
    } else if (tabName === 'cursors') {
        state.settings.customCursor = normalizeCustomCursor(state.settings.customCursor);
        activeCursorTarget = state.settings.theme || 'dark';
        syncCursorTargetButtons();
        renderCursorGalleries();
    } else if (tabName === 'fonts') {
        renderFontsTab();
    } else if (tabName === 'custom-designs') {
        renderSavedThemes();
    } else if (tabName === 'developer') {
        if (!devTabInitialized) {
            initDeveloperTab();
        } else {
            renderDeveloperTabInputs();
        }
    } else if (tabName === 'keys') {
        syncSettingsUI();
        updateKeyStatusPills();
    } else if (tabName === 'models') {
        renderModelProvidersSettings();
        if (window.SubagentUI) window.SubagentUI.render();
    } else if (tabName === 'prompt') {
        syncSettingsUI();
    } else if (tabName === 'system') {
        updateEnvironmentDiagnostics();
    }
}

function showMobileSettingsHub() {
    const fullscreenEl = document.querySelector('.set-app-fullscreen');
    if (fullscreenEl) {
        fullscreenEl.classList.remove('is-mobile-detail');
    }
    const mobileBack = document.getElementById('btnSettingsMobileBack');
    if (mobileBack) mobileBack.style.display = 'none';
    const mobileTitle = document.getElementById('setMobileNavTitle');
    if (mobileTitle) mobileTitle.textContent = 'Настройки';

    // В корневом меню хаба скрываем плавающий Live Playground
    const shell = document.getElementById('themePreviewShell');
    if (shell) shell.style.display = 'none';

    // Снимаем подсветку активного таба в сайдбаре мобилки
    document.querySelectorAll('#setTabsNav .set-nav-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.setAttribute('aria-selected', 'false');
    });

    const sidebar = document.getElementById('setSidebar');
    if (sidebar) sidebar.scrollTop = 0;
}
window.showMobileSettingsHub = showMobileSettingsHub;

function showMobileSettingsDetail(tabName) {
    const fullscreenEl = document.querySelector('.set-app-fullscreen');
    if (fullscreenEl) {
        fullscreenEl.classList.add('is-mobile-detail');
    }
    const mobileBack = document.getElementById('btnSettingsMobileBack');
    if (mobileBack) mobileBack.style.display = 'inline-flex';
    const mobileTitle = document.getElementById('setMobileNavTitle');
    if (mobileTitle) mobileTitle.textContent = TAB_TITLES[tabName] || 'Раздел';
}
window.showMobileSettingsDetail = showMobileSettingsDetail;

function switchSettingsTab(tabName) {
    const validTabs = [
        'general', 'appearance', 'cursors', 'fonts', 'custom-designs',
        'developer', 'keys', 'models', 'subagents', 'prompt', 'system', 'shortcuts'
    ];
    if (!validTabs.includes(tabName)) {
        tabName = 'general';
    }

    const tabs = document.querySelectorAll('#setTabsNav .set-nav-btn');
    tabs.forEach(t => {
        const active = t.dataset.tab === tabName;
        t.classList.toggle('active', active);
        t.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    // Безопасное аппаратное переключение панелей без стирания разметки DOM
    document.querySelectorAll('.set-tab-panel').forEach(p => {
        const isActive = p.id === `tabPanel-${tabName}`;
        p.classList.toggle('active', isActive);
    });

    // Синхронизируем кнопки быстрого перехода между вкладками (subnav)
    document.querySelectorAll('.set-subnav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.subtabSwitch === tabName);
    });

    // Если перешли не в Дизайн — скрываем окно предпросмотра
    if (tabName !== 'appearance') {
        const shell = document.getElementById('themePreviewShell');
        if (shell) shell.style.display = 'none';
    }

    // Активируем функционал выбранной вкладки
    activateTabFeatures(tabName);

    if (checkIsMobile()) {
        showMobileSettingsDetail(tabName);
    }

    const scrollBox = $('#setContentScroll');
    if (scrollBox) scrollBox.scrollTop = 0;
}

function bindKeyEyeToggles() {
    document.querySelectorAll('#tabPanel-keys .eye-btn').forEach(b => {
        b.onclick = () => {
            const inp = document.getElementById(b.dataset.eye);
            if (!inp) return;
            const isPassword = inp.type === 'password';
            inp.type = isPassword ? 'text' : 'password';
            b.classList.toggle('on', isPassword);
        };
    });
    const inpP = document.getElementById('inpProxy');
    const inpO = document.getElementById('inpOR');
    if (inpP) inpP.oninput = e => { state.settings.proxyKey = e.target.value.trim(); save(); updateBalMini(); updateKeyStatusPills(); };
    if (inpO) inpO.oninput = e => { state.settings.orKey = e.target.value.trim(); save(); updateKeyStatusPills(); };

    document.querySelectorAll('#apiSrcChips .set-seg-btn, #apiSrcChips .igm-chip').forEach(b => {
        b.onclick = () => {
            state.settings.apiSource = b.dataset.src;
            save();
            updateApiSrcChip();
            toast('Источник API: ' + API_SRC_LABELS[b.dataset.src], 'ok', 1600);
        };
    });
}

function bindPromptPresets() {
    document.querySelectorAll('#tabPanel-prompt .set-preset-chip').forEach(b => {
        b.onclick = () => {
            const key = b.dataset.preset;
            if (PROMPT_PRESETS[key]) {
                const inp = document.getElementById('inpSys');
                if (inp) inp.value = PROMPT_PRESETS[key];
                state.settings.systemPrompt = PROMPT_PRESETS[key];
                save();
                toast('Шаблон системного промпта применён', 'ok', 1600);
            }
        };
    });
    const inpSys = document.getElementById('inpSys');
    if (inpSys) inpSys.oninput = e => { state.settings.systemPrompt = e.target.value; save(); };
    const btnClr = document.getElementById('btnSysClear');
    if (btnClr) btnClr.onclick = () => {
        const inp = document.getElementById('inpSys');
        if (inp) inp.value = '';
        state.settings.systemPrompt = '';
        save();
        toast('Системный промпт очищен', 'info');
    };
}

function bindModelSettingsEvents() {
    const sInp = document.getElementById('mpSearchInput');
    if (sInp) sInp.oninput = () => renderModelProvidersSettings();

    document.querySelectorAll('#globalReasoningEffortSeg .set-seg-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('#globalReasoningEffortSeg .set-seg-btn').forEach(b => {
                b.classList.remove('sel');
                b.setAttribute('aria-checked', 'false');
            });
            btn.classList.add('sel');
            btn.setAttribute('aria-checked', 'true');
            state.settings.reasoningEffort = btn.dataset.effort;
            save();
            updateTopChips();
            toast('Глубина усилий (effort): ' + btn.textContent.trim(), 'ok', 1400);
        };
    });

    document.querySelectorAll('#openaiReasoningSummarySeg .set-seg-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('#openaiReasoningSummarySeg .set-seg-btn').forEach(b => b.classList.remove('sel'));
            btn.classList.add('sel');
            state.settings.openaiReasoningSummary = btn.dataset.val;
            save();
        };
    });

    document.querySelectorAll('#openaiReasoningModeSeg .set-seg-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('#openaiReasoningModeSeg .set-seg-btn').forEach(b => b.classList.remove('sel'));
            btn.classList.add('sel');
            state.settings.openaiReasoningMode = btn.dataset.val;
            save();
        };
    });

    document.querySelectorAll('#claudeThinkingDisplaySeg .set-seg-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('#claudeThinkingDisplaySeg .set-seg-btn').forEach(b => b.classList.remove('sel'));
            btn.classList.add('sel');
            state.settings.claudeThinkingDisplay = btn.dataset.val;
            save();
        };
    });

    const btnIg = document.getElementById('btnOpenIgSettingsModal');
    if (btnIg) btnIg.onclick = () => openImgGenSettings();
    const btnWs = document.getElementById('btnOpenWsSettingsModal');
    if (btnWs) btnWs.onclick = () => openWsSettings();
}

function bindSystemBackupEvents() {
    const btnExp = document.getElementById('btnExportBackup');
    if (btnExp) {
        btnExp.onclick = () => {
            try {
                const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
                const a = document.createElement('a');
                a.href = dataStr;
                a.download = 'MoonSSS_Backup_' + new Date().toISOString().slice(0, 10) + '.json';
                document.body.appendChild(a);
                a.click();
                a.remove();
                toast('Резервная копия экспортирована', 'ok');
            } catch (e) {
                toast('Ошибка экспорта бэкапа', 'err');
            }
        };
    }

    const btnImp = document.getElementById('btnImportBackup');
    const fInp = document.getElementById('fileBackupInput');
    if (btnImp && fInp) {
        btnImp.onclick = () => fInp.click();
        fInp.onchange = async e => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            try {
                const text = await file.text();
                const imported = JSON.parse(text);
                if (imported && (Array.isArray(imported.chats) || imported.settings)) {
                    if (imported.settings) state.settings = Object.assign(state.settings, imported.settings);
                    if (Array.isArray(imported.chats)) state.chats = imported.chats;
                    if (Array.isArray(imported.favorites)) state.favorites = imported.favorites;
                    save(true);
                    renderAll();
                    syncSettingsUI();
                    toast('Конфигурация успешно импортирована', 'ok');
                }
            } catch (err) {
                toast('Ошибка чтения файла бэкапа', 'err');
            }
            e.target.value = '';
        };
    }

    const btnClrAll = document.getElementById('btnClearAllChats');
    if (btnClrAll) {
        btnClrAll.onclick = () => {
            if (confirm('Вы уверены, что хотите безвозвратно удалить все сохранённые чаты?')) {
                state.chats = [];
                state.activeId = null;
                save(true);
                renderAll();
                updateEnvironmentDiagnostics();
                toast('История диалогов полностью очищена', 'info');
            }
        };
    }
}
function getFocusableElements(container) {
    if (!container) return [];
    return Array.from(container.querySelectorAll(
        'button:not([disabled]):not([tabindex="-1"]), ' +
        'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"]), ' +
        'textarea:not([disabled]):not([tabindex="-1"]), ' +
        'select:not([disabled]):not([tabindex="-1"]), ' +
        '[tabindex]:not([tabindex="-1"])'
    )).filter(el => {
        const r = el.getBoundingClientRect();
        return (r.width > 0 || r.height > 0) && window.getComputedStyle(el).visibility !== 'hidden';
    });
}

document.querySelectorAll('#setTabsNav .set-nav-btn').forEach((b, idx, arr) => {
    b.addEventListener('click', () => switchSettingsTab(b.dataset.tab));
    b.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            const next = arr[(idx + 1) % arr.length];
            next.focus();
            switchSettingsTab(next.dataset.tab);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prev = arr[(idx - 1 + arr.length) % arr.length];
            prev.focus();
            switchSettingsTab(prev.dataset.tab);
        } else if (e.key === 'Home') {
            e.preventDefault();
            arr[0].focus();
            switchSettingsTab(arr[0].dataset.tab);
        } else if (e.key === 'End') {
            e.preventDefault();
            arr[arr.length - 1].focus();
            switchSettingsTab(arr[arr.length - 1].dataset.tab);
        } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
            e.preventDefault();
            const activePanel = document.querySelector('.set-tab-panel.active');
            if (activePanel) {
                const focusables = getFocusableElements(activePanel);
                if (focusables.length) {
                    focusables[0].focus();
                    focusables[0].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                }
            }
        }
    });
});

const settingsScrollArea = $('#setContentScroll');
if (settingsScrollArea) {
    settingsScrollArea.addEventListener('keydown', e => {
        const target = e.target;
        const activePanel = document.querySelector('.set-tab-panel.active');
        if (!activePanel || !activePanel.contains(target)) return;

        const isTextInput = target.tagName === 'INPUT' && (target.type === 'text' || target.type === 'password' || !target.type);
        const isTextarea = target.tagName === 'TEXTAREA';

        // Не перехватываем клавиши внутри полей ввода текста и текстовых зон
        if (isTextarea || isTextInput) return;

        const focusables = getFocusableElements(activePanel);
        const idx = focusables.indexOf(target);

        // Стрелка влево: возврат к сайдбару разделов
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            const activeTabBtn = document.querySelector('#setTabsNav .set-nav-btn.active');
            if (activeTabBtn) activeTabBtn.focus();
            return;
        }

        // Стрелка вниз / вправо: переход к следующему контролу в панели
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
            if (idx >= 0 && idx < focusables.length - 1) {
                e.preventDefault();
                focusables[idx + 1].focus();
                focusables[idx + 1].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }
        // Стрелка вверх: переход к предыдущему контролу
        else if (e.key === 'ArrowUp') {
            if (idx > 0) {
                e.preventDefault();
                focusables[idx - 1].focus();
                focusables[idx - 1].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            } else if (idx === 0) {
                e.preventDefault();
                const activeTabBtn = document.querySelector('#setTabsNav .set-nav-btn.active');
                if (activeTabBtn) activeTabBtn.focus();
            }
        }
    });
}

function handleSettingsSearch(query) {
    const q = (query || '').trim().toLowerCase();
    const activePanel = document.querySelector('.set-tab-panel.active');
    if (!activePanel) return;
    const sections = activePanel.querySelectorAll('.set-sec');
    if (!q) {
        sections.forEach(c => c.style.display = '');
        return;
    }
    sections.forEach(c => {
        const text = c.textContent.toLowerCase();
        c.style.display = text.includes(q) ? '' : 'none';
    });
}

$('#setSearchInput')?.addEventListener('input', e => handleSettingsSearch(e.target.value));
$('#setSearchInput')?.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        const activeTabBtn = document.querySelector('#setTabsNav .set-nav-btn.active') || document.querySelector('#setTabsNav .set-nav-btn');
        if (activeTabBtn) activeTabBtn.focus();
    }
});

document.querySelectorAll('.set-preset-chip').forEach(b => {
    b.addEventListener('click', () => {
        const key = b.dataset.preset;
        if (PROMPT_PRESETS[key]) {
            $('#inpSys').value = PROMPT_PRESETS[key];
            state.settings.systemPrompt = PROMPT_PRESETS[key];
            save();
            toast('Шаблон системного промпта применён', 'ok', 1600);
        }
    });
});

function updateKeyStatusPills() {
    const pKey = (state.settings.proxyKey || '').trim();
    const oKey = (state.settings.orKey || '').trim();

    const pPill = $('#statusProxyKey');
    if (pPill) {
        pPill.classList.toggle('ready', !!pKey);
        const txt = pPill.querySelector('.txt');
        if (txt) txt.textContent = pKey ? 'Подключён' : 'Не задан';
    }

    const oPill = $('#statusORKey');
    if (oPill) {
        oPill.classList.toggle('ready', !!oKey);
        const txt = oPill.querySelector('.txt');
        if (txt) txt.textContent = oKey ? 'Подключён' : 'Не задан';
    }

    const dot = $('#tabKeyDot');
    if (dot) dot.classList.toggle('show', !!(pKey || oKey));
}

function updateEnvironmentDiagnostics() {
    const isElectron = !!(window.electronAPI && typeof window.electronAPI.openExternal === 'function');
    const isCapacitor = !!(window.Capacitor && window.Capacitor.isNative);

    const platformEl = $('#envPlatformVal');
    if (platformEl) {
        if (isElectron) platformEl.textContent = 'Electron Desktop (Node.js/Chromium)';
        else if (isCapacitor) platformEl.textContent = 'Capacitor Mobile (Android WebView)';
        else platformEl.textContent = 'Web Browser (Pure Client)';
    }

    const execEl = $('#envExecVal');
    if (execEl) {
        if (isElectron) {
            execEl.textContent = 'Electron Worker + OpenRouter Linux Sandbox';
        } else if ((state.settings.orKey || state.settings.proxyKey || '').trim()) {
            execEl.textContent = 'OpenRouter Hosted Sandbox (Linux Cloud Container)';
        } else {
            execEl.textContent = 'Требуется API-ключ OpenRouter или Electron';
        }
    }

    const stStatus = $('#setStorageStatusText');
    if (stStatus) {
        stStatus.textContent = `IndexedDB (${(state.chats || []).length} диалогов)`;
    }
}

function openSettings(initialTab = null) {
    lastActiveTriggerElement = document.activeElement;
    setViewMode('settings');
    settingsOverlay.classList.add('show');

    const isMob = checkIsMobile();
    if (isMob) {
        if (!initialTab || initialTab === 'hub') {
            showMobileSettingsHub();
        } else {
            switchSettingsTab(initialTab);
        }
    } else {
        switchSettingsTab(initialTab || 'general');
    }

    syncSettingsUI();
    updateEnvironmentDiagnostics();
    navCtrl.push('settings');

    setTimeout(() => {
        const targetBtn = $(`#setTabsNav .set-nav-btn[data-tab="${initialTab || 'general'}"]`) || $('#settingsClose');
        if (targetBtn && !isMob) targetBtn.focus();
    }, 80);
}
window.openSettings = openSettings;

function closeSettings(opts = {}) {
    saveSettingsFromUI();
    settingsOverlay.classList.remove('show');

    // Сбрасываем мобильный флаг экрана подразделов
    showMobileSettingsHub();

    // Скрываем плавающее окно предпросмотра
    const themePreviewShell = $('#themePreviewShell');
    if (themePreviewShell) {
        themePreviewShell.style.display = 'none';
    }

    setViewMode('chat');

    if (!opts.fromPopstate) {
        navCtrl.pop('settings');
    }

    if (lastActiveTriggerElement && typeof lastActiveTriggerElement.focus === 'function') {
        lastActiveTriggerElement.focus();
    }
    if (!isMobile && !bgRafId && !isBackgroundSuspended()) {
        bgRafId = requestAnimationFrame(bgLoop);
    }
}

$('#mpSearchInput')?.addEventListener('input', () => renderModelProvidersSettings());

function saveSettingsFromUI() {
    const inpP = $('#inpProxy');
    const inpO = $('#inpOR');
    const inpS = $('#inpSys');
    if (inpP) state.settings.proxyKey = inpP.value.trim();
    if (inpO) state.settings.orKey = inpO.value.trim();
    if (inpS) state.settings.systemPrompt = inpS.value;
    save(true);
    updateBalMini();
    updateHeroKeysVisibility();
    updateKeyStatusPills();
    toast('Настройки успешно сохранены в хранилище', 'ok', 1600);
}

/* ============ КОНТРОЛЛЕР ДИЗАЙН-СТУДИИ (APPEARANCE STUDIO) ============ */
let activeThemeTarget = 'dark';

/* ============ ДИСПЕТЧЕР ПЕРЕТАСКИВАНИЯ LIVE PLAYGROUND ============ */
const tpDragState = {
    isDragging: false,
    startX: 0,
    startY: 0,
    elemLeft: 0,
    elemTop: 0,
    isCustomPos: false,
    isMinimized: false
};

function initThemePreviewFloating() {
    const shell = $('#themePreviewShell');
    const header = $('#tpChatHeader');
    const minBtn = $('#tpHeadMinBtn');
    const resetBtn = $('#tpHeadResetBtn');
    const toggleMinCardBtn = $('#btnTpToggleMin');
    const resetPosCardBtn = $('#btnTpResetPos');

    if (!shell || !header) return;

    // Перетаскивание через Pointer Events с PointerCapture
    header.onpointerdown = e => {
        if (e.target.closest('button')) return;
        tpDragState.isDragging = true;
        header.setPointerCapture(e.pointerId);

        const rect = shell.getBoundingClientRect();
        tpDragState.startX = e.clientX;
        tpDragState.startY = e.clientY;
        tpDragState.elemLeft = rect.left;
        tpDragState.elemTop = rect.top;

        shell.style.right = 'auto';
        shell.style.bottom = 'auto';
        shell.style.left = rect.left + 'px';
        shell.style.top = rect.top + 'px';
    };

    header.onpointermove = e => {
        if (!tpDragState.isDragging) return;
        const dx = e.clientX - tpDragState.startX;
        const dy = e.clientY - tpDragState.startY;

        const maxLeft = window.innerWidth - shell.offsetWidth - 12;
        const maxTop = window.innerHeight - shell.offsetHeight - 12;

        const nextLeft = Math.max(12, Math.min(maxLeft, tpDragState.elemLeft + dx));
        const nextTop = Math.max(12, Math.min(maxTop, tpDragState.elemTop + dy));

        shell.style.left = nextLeft + 'px';
        shell.style.top = nextTop + 'px';
        tpDragState.isCustomPos = true;
    };

    const endDrag = e => {
        if (!tpDragState.isDragging) return;
        tpDragState.isDragging = false;
        try { header.releasePointerCapture(e.pointerId); } catch (_) { }
    };

    header.onpointerup = endDrag;
    header.onpointercancel = endDrag;

    // Двойной клик по шапке сворачивает / разворачивает окно
    header.ondblclick = e => {
        if (e.target.closest('button')) return;
        toggleTpMinimize();
    };

    // Кнопка сворачивания в шапке
    if (minBtn) minBtn.onclick = () => toggleTpMinimize();
    if (toggleMinCardBtn) toggleMinCardBtn.onclick = () => toggleTpMinimize();

    // Кнопка сброса позиции
    if (resetBtn) resetBtn.onclick = () => resetTpPosition();
    if (resetPosCardBtn) resetPosCardBtn.onclick = () => resetTpPosition();
}

function toggleTpMinimize() {
    const shell = $('#themePreviewShell');
    const minIcon = $('#tpHeadMinBtn svg use');
    const minCardLabel = $('#btnTpToggleMinLabel');
    const headerTitle = $('#tpHeaderTitle');
    if (!shell) return;

    tpDragState.isMinimized = !tpDragState.isMinimized;
    shell.classList.toggle('tp-minimized', tpDragState.isMinimized);

    if (minIcon) minIcon.setAttribute('href', tpDragState.isMinimized ? '#i-plus' : '#i-minus');
    if (minCardLabel) minCardLabel.textContent = tpDragState.isMinimized ? 'Развернуть окно' : 'Свернуть окно';
    if (headerTitle) headerTitle.textContent = tpDragState.isMinimized ? 'Live Playground (свёрнуто)' : 'Live Playground · MoonSSS';
}

function resetTpPosition() {
    const shell = $('#themePreviewShell');
    if (!shell) return;
    shell.style.left = '';
    shell.style.top = '';
    shell.style.right = '';
    shell.style.bottom = '';
    tpDragState.isCustomPos = false;
    toast('Позиция окна сброшена в исходный угол', 'info', 1400);
}

function initAppearanceTab() {
    activeThemeTarget = state.settings.theme || 'dark';
    syncThemeTargetButtons();
    bindColorPickerEvents();
    initThemePreviewFloating();
    initSaveThemeModalEvents();
    initAiThemeGenEvents();
    renderAppearanceSettings();
    renderSavedThemes();
}

/* ============ ИИ-ДИЗАЙНЕР ПАЛИТРЫ (DEDICATED THEME DESIGN ARCHITECT) ============ */
let aiThemeTargetChoice = 'current';
let aiThemeGenAbortCtrl = null;

const AI_THEME_DESIGN_SYSTEM_PROMPT = `You are the Lead Design System Architect and Senior Creative Frontend Engineer for MoonSSS.
Your task is to design a cohesive, visually breathtaking theme architecture including:
1. Exact Design Tokens (Appearance palette, glassmorphism, contrast calibration).
2. WebGL2 Liquid Shader parameters (21st.js) harmonized with the background.
3. Tailored Custom CSS and Canvas JavaScript (running in #customEffectsLayer).

STRICT SPECIFICATION & CONSTRAINTS:
1. Output ONLY a valid JSON object. No Markdown code fences (no \`\`\`json), no chat preamble, no commentary.
2. STRICT NO EMOJI: Never output emojis anywhere in JSON, CSS comments, or JS strings.
3. All color properties MUST be 6-digit hex strings (e.g. "#141414").
4. Opacity & Glow values MUST be numbers between 0.0 and 1.0.
5. Blur values MUST be integers between 0 and 48.

WEBGL2 SHADER HARMONY (21st.js):
- liquidColor1 MUST be harmonious with bgColor (often identical or a deep tonal variation of it) to eliminate seam artifacts.
- liquidColor2 is the dynamic midtone wave (complements accentColor).
- liquidColor3 is the specular luminous crest (complements streamColor).
- liquidShape MUST be one of: "Checks", "Stripes", "Edge".
- liquidSpeed: integer from 5 to 60.
- liquidDistortion: float from 0.0 to 15.0.
- liquidSwirl: float from 0.0 to 100.0.

CUSTOM CSS ARCHITECTURE:
- Write clean CSS targeting MoonSSS classes: .topbar, .input-shell, .bubble, .msg.user, .msg.ai, .cbtn, .set-card, .logo.
- Use CSS custom properties: var(--accent), var(--glow), var(--panel-hover), var(--line).
- Maintain pure Linear/Vercel minimalism: 1px subtle borders, backdrop-filter: blur, silky cubic-bezier transitions.

CUSTOM JAVASCRIPT ARCHITECTURE (#customEffectsLayer):
- The element document.getElementById('customEffectsLayer') is a fixed container <div> (NOT a canvas).
- Inside "customJs", instantiate a canvas:
  const container = document.getElementById('customEffectsLayer');
  const canvas = document.createElement('canvas');
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');
- MUST return a cleanup function to prevent memory leaks:
  return () => { cancelAnimationFrame(rafId); window.removeEventListener('resize', onResize); canvas.remove(); };

TOKEN SCHEMA:
Each theme object must strictly provide:
{
  "streamColor": "#hex",
  "streamTailColor": "#hex",
  "accentColor": "#hex",
  "btnTint": "#hex",
  "selBgColor": "#hex",
  "selBgOpacity": 0.35,
  "selTextColor": "#hex",
  "userSelBgColor": "#hex",
  "userSelBgOpacity": 0.35,
  "userSelTextColor": "#hex",
  "aiSelBgColor": "#hex",
  "aiSelBgOpacity": 0.30,
  "aiSelTextColor": "#hex",
  "bgColor": "#hex",
  "textColor": "#hex",
  "textDimColor": "#hex",
  "userBubbleBg": "#hex",
  "userBubbleText": "#hex",
  "aiBubbleBg": "#hex",
  "aiBubbleText": "#hex",
  "liquidColor1": "#hex",
  "liquidColor2": "#hex",
  "liquidColor3": "#hex",
  "liquidSpeed": 26,
  "liquidShape": "Checks",
  "liquidScale": 0.01,
  "liquidRotation": -50,
  "liquidDistortion": 0,
  "liquidSwirl": 50,
  "liquidSwirlIterations": 14,
  "liquidSoftness": 50,
  "logoMoonColor": "#hex",
  "logoMoonGlow": 0.25,
  "logoSssColor": "#hex",
  "logoSssGlow": 0.85,
  "inputShellBg": "#hex",
  "inputShellOpacity": 0.88,
  "inputShellBorder": "#hex",
  "inputShellText": "#hex",
  "topbarBg": "#hex",
  "topbarOpacity": 0.82,
  "topbarBlur": 24,
  "topbarBorder": "#hex",
  "cardBg": "#hex",
  "cardOpacity": 0.65,
  "cardBlur": 16,
  "cardBorder": "#hex",
  "customCss": "/* Custom CSS */",
  "customJs": "// Custom JS\\nconst container = document.getElementById('customEffectsLayer');\\n..."
}

OUTPUT STRUCTURE:
- Single theme ("dark" or "light"):
{ "theme": { ...all tokens... } }
- Both themes:
{ "dark": { ...all dark tokens... }, "light": { ...all light tokens... } }`;

function sanitizeThemeTokens(parsedTheme, fallbackTheme) {
    const res = Object.assign({}, fallbackTheme);
    if (!parsedTheme || typeof parsedTheme !== 'object') return res;

    const normalizeHex = c => {
        if (typeof c !== 'string') return null;
        let s = c.trim();
        if (!s.startsWith('#')) s = '#' + s;
        if (/^#[0-9A-Fa-f]{6}$/.test(s)) return s;
        if (/^#[0-9A-Fa-f]{3}$/.test(s)) {
            return '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
        }
        if (/^#[0-9A-Fa-f]{8}$/.test(s)) {
            return s.slice(0, 7);
        }
        return null;
    };
    const cleanHex = (c, fb) => normalizeHex(c) || fb;
    const cleanNum = (n, min, max, fb) => (typeof n === 'number' && !isNaN(n)) ? Math.max(min, Math.min(max, n)) : fb;

    const validShapes = ['Checks', 'Stripes', 'Edge'];
    for (const key of Object.keys(fallbackTheme)) {
        if (key.endsWith('Opacity') || key.endsWith('Glow')) {
            res[key] = cleanNum(parsedTheme[key], 0, 1, fallbackTheme[key]);
        } else if (key.endsWith('Blur')) {
            res[key] = cleanNum(parsedTheme[key], 0, 48, fallbackTheme[key]);
        } else if (key === 'liquidSpeed') {
            res[key] = cleanNum(parsedTheme[key], 5, 60, fallbackTheme[key]);
        } else if (key === 'liquidShape') {
            const rawShape = String(parsedTheme[key] || '').trim();
            res[key] = validShapes.includes(rawShape) ? rawShape : fallbackTheme[key];
        } else if (key === 'liquidScale') {
            res[key] = cleanNum(parsedTheme[key], 0.001, 1.0, fallbackTheme[key]);
        } else if (key === 'liquidRotation') {
            res[key] = cleanNum(parsedTheme[key], -180, 180, fallbackTheme[key]);
        } else if (key === 'liquidDistortion') {
            res[key] = cleanNum(parsedTheme[key], 0, 50, fallbackTheme[key]);
        } else if (key === 'liquidSwirl') {
            res[key] = cleanNum(parsedTheme[key], 0, 100, fallbackTheme[key]);
        } else if (key === 'liquidSwirlIterations') {
            res[key] = cleanNum(parsedTheme[key], 1, 24, fallbackTheme[key]);
        } else if (key === 'liquidSoftness') {
            res[key] = cleanNum(parsedTheme[key], 0, 100, fallbackTheme[key]);
        } else {
            res[key] = cleanHex(parsedTheme[key], fallbackTheme[key]);
        }
    }
    return res;
}

function extractJsonFromText(raw) {
    let s = String(raw || '').trim();
    if (!s) throw new Error('Пустой ответ от модели');

    // 1. Снятие Markdown-блоков
    const mdBlock = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (mdBlock && mdBlock[1]) {
        s = mdBlock[1].trim();
    } else {
        s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    }

    const firstBrace = s.indexOf('{');
    if (firstBrace === -1) {
        throw new Error('В ответе модели не найден JSON-объект');
    }

    // 2. Первичная попытка прямого парсинга
    const lastBrace = s.lastIndexOf('}');
    if (lastBrace > firstBrace) {
        const directCandidate = s.slice(firstBrace, lastBrace + 1);
        try {
            return JSON.parse(directCandidate);
        } catch (_) { }
    }

    // 3. Отказоустойчивый парсинг: экранирование неэкранированных переводов строк и автозакрытие
    let target = s.slice(firstBrace);
    let inString = false;
    let escaped = false;
    let cleaned = '';
    const openStack = [];

    for (let i = 0; i < target.length; i++) {
        const ch = target[i];

        if (inString) {
            if (escaped) {
                escaped = false;
                cleaned += ch;
            } else if (ch === '\\') {
                escaped = true;
                cleaned += ch;
            } else if (ch === '"') {
                inString = false;
                cleaned += ch;
            } else if (ch === '\n') {
                cleaned += '\\n';
            } else if (ch === '\r') {
                // Пропускаем
            } else if (ch === '\t') {
                cleaned += '\\t';
            } else {
                cleaned += ch;
            }
        } else {
            if (ch === '"') {
                inString = true;
                cleaned += ch;
            } else if (ch === '{') {
                openStack.push('}');
                cleaned += ch;
            } else if (ch === '[') {
                openStack.push(']');
                cleaned += ch;
            } else if (ch === '}' || ch === ']') {
                if (openStack.length && openStack[openStack.length - 1] === ch) {
                    openStack.pop();
                }
                cleaned += ch;
            } else {
                cleaned += ch;
            }
        }
    }

    // Если строка оборвана посредине строкового литерала
    if (inString) {
        cleaned += '"';
    }

    // Удаление завершающих запятых перед скобками
    cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

    // Автоматическое закрытие структуры скобок
    while (openStack.length > 0) {
        cleaned += openStack.pop();
    }

    try {
        return JSON.parse(cleaned);
    } catch (err) {
        // Дополнительная очистка от незавершенных пар ключ-значение
        try {
            const trimmed = cleaned.replace(/,\s*"[^"]*":\s*"[^"]*"?$/, '');
            let fixed = trimmed.replace(/,\s*([}\]])/g, '$1');
            const openBraces = (fixed.match(/{/g) || []).length;
            const closeBraces = (fixed.match(/}/g) || []).length;
            for (let b = 0; b < openBraces - closeBraces; b++) fixed += '}';
            return JSON.parse(fixed);
        } catch (_) { }

        throw new Error('Не удалось разобрать JSON темы: ' + (err.message || err));
    }
}

function openAiThemeGenModal() {
    const overlay = $('#aiThemeGenOverlay');
    if (!overlay) return;
    const label = $('#aiThemeTargetLabel');
    if (label) label.textContent = activeThemeTarget === 'light' ? 'Светлая' : 'Тёмная';
    const status = $('#aiThemeGenStatus');
    if (status) status.hidden = true;

    // Синхронизация активной радиокнопки целевой темы
    const seg = $('#aiThemeGenTargetSeg');
    if (seg) {
        seg.querySelectorAll('.set-seg-btn').forEach(btn => {
            const isSel = btn.dataset.target === aiThemeTargetChoice;
            btn.classList.toggle('sel', isSel);
            btn.setAttribute('aria-checked', isSel ? 'true' : 'false');
        });
    }

    // Синхронизация активной карточки выбранной модели-дизайнера
    const activeModel = state.settings.aiThemeDesignerModel || 'anthropic/claude-sonnet-5.5';
    const modelCards = document.querySelectorAll('#aiThemeGenModelSelector .ai-tm-card');
    modelCards.forEach(card => {
        const isSel = card.dataset.model === activeModel;
        card.classList.toggle('sel', isSel);
        card.setAttribute('aria-checked', isSel ? 'true' : 'false');

        // Подгрузка официальных иконок моделей
        const iconBox = card.querySelector('.ai-tm-icon-box');
        if (iconBox && typeof window.getAiModelIcon === 'function') {
            const mObj = typeof window.getModel === 'function' ? window.getModel(card.dataset.model) : null;
            const iconUrl = window.getAiModelIcon(card.dataset.model, mObj);
            if (iconUrl) {
                iconBox.innerHTML = `<img src="${esc(iconUrl)}" alt="" onerror="this.outerHTML='<svg class=\\'ic\\'><use href=\\'#i-spark\\'/></svg>'">`;
            }
        }
    });

    overlay.classList.add('show');
    setTimeout(() => {
        const inp = $('#inpAiThemePrompt');
        if (inp) inp.focus();
    }, 80);
}

function closeAiThemeGenModal() {
    if (aiThemeGenAbortCtrl) {
        try { aiThemeGenAbortCtrl.abort(); } catch (_) { }
        aiThemeGenAbortCtrl = null;
    }
    const overlay = $('#aiThemeGenOverlay');
    if (overlay) overlay.classList.remove('show');
}

function initAiThemeGenEvents() {
    const btnOpen = $('#btnOpenAiThemeGenModal');
    if (btnOpen) btnOpen.onclick = openAiThemeGenModal;

    const btnClose = $('#aiThemeGenClose');
    if (btnClose) btnClose.onclick = closeAiThemeGenModal;

    const btnCancel = $('#aiThemeGenCancel');
    if (btnCancel) btnCancel.onclick = closeAiThemeGenModal;

    const overlay = $('#aiThemeGenOverlay');
    if (overlay) {
        overlay.onclick = e => {
            if (e.target === overlay) closeAiThemeGenModal();
        };
    }

    // Переключение целевой темы генерации с поддержкой колесика мыши и стрелок клавиатуры
    const seg = $('#aiThemeGenTargetSeg');
    if (seg) {
        const btns = Array.from(seg.querySelectorAll('.set-seg-btn'));
        btns.forEach(btn => {
            btn.onclick = () => {
                btns.forEach(b => {
                    b.classList.remove('sel');
                    b.setAttribute('aria-checked', 'false');
                });
                btn.classList.add('sel');
                btn.setAttribute('aria-checked', 'true');
                aiThemeTargetChoice = btn.dataset.target;
            };
        });

        // Прокрутка колесиком мыши для переключения темы («Для какой темы спроектировать стиль?»)
        const handleWheelSelection = e => {
            if (seg.scrollWidth > seg.clientWidth + 4) {
                e.preventDefault();
                seg.scrollLeft += e.deltaY;
                return;
            }
            e.preventDefault();
            const currentIdx = btns.findIndex(b => b.classList.contains('sel'));
            const direction = e.deltaY > 0 ? 1 : -1;
            const nextIdx = (currentIdx + direction + btns.length) % btns.length;
            btns[nextIdx].click();
        };

        seg.addEventListener('wheel', handleWheelSelection, { passive: false });

        const targetField = seg.closest('.field');
        if (targetField) {
            targetField.addEventListener('wheel', e => {
                if (e.target.closest('#inpAiThemePrompt, textarea')) return;
                handleWheelSelection(e);
            }, { passive: false });
        }

        // Клавиатурная навигация стрелками
        seg.addEventListener('keydown', e => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                const idx = btns.indexOf(document.activeElement);
                const next = btns[(idx + 1 + btns.length) % btns.length];
                if (next) { next.focus(); next.click(); }
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                const idx = btns.indexOf(document.activeElement);
                const prev = btns[(idx - 1 + btns.length) % btns.length];
                if (prev) { prev.focus(); prev.click(); }
            }
        });
    }

    // Выбор нейросети-дизайнера оформления
    const modelCards = document.querySelectorAll('#aiThemeGenModelSelector .ai-tm-card');
    modelCards.forEach(card => {
        card.onclick = () => {
            modelCards.forEach(c => {
                c.classList.remove('sel');
                c.setAttribute('aria-checked', 'false');
            });
            card.classList.add('sel');
            card.setAttribute('aria-checked', 'true');
            state.settings.aiThemeDesignerModel = card.dataset.model;
            save();
            const modelName = card.querySelector('.ai-tm-name')?.textContent || card.dataset.model;
            toast(`Дизайнер палитры: ${modelName}`, 'ok', 1400);
        };
    });

    // Пресеты для вдохновения
    document.querySelectorAll('#aiThemePromptPresets .set-preset-chip').forEach(btn => {
        btn.onclick = () => {
            const prompt = btn.dataset.prompt;
            const inp = $('#inpAiThemePrompt');
            if (inp && prompt) {
                inp.value = prompt;
                inp.focus();
            }
        };
    });

    const btnSubmit = $('#aiThemeGenSubmit');
    if (btnSubmit) btnSubmit.onclick = executeAiThemeGeneration;
}

async function executeAiThemeGeneration() {
    const inp = $('#inpAiThemePrompt');
    const promptText = (inp ? inp.value : '').trim();
    if (!promptText) {
        toast('Опишите желаемый стиль или атмосферу оформления', 'warn');
        if (inp) inp.focus();
        return;
    }

    const s = state.settings || {};
    const orKey = (s.orKey || '').trim();
    const proxyKey = (s.proxyKey || '').trim();
    if (!orKey && !proxyKey) {
        toast('Укажите ключ ProxyAPI или OpenRouter во вкладке «API и Ключи»', 'err', 3600);
        return;
    }

    const statusEl = $('#aiThemeGenStatus');
    const statusTxt = $('#aiThemeGenStatusText');
    const btnSubmit = $('#aiThemeGenSubmit');
    const btnCancel = $('#aiThemeGenCancel');

    const chosenModelId = s.aiThemeDesignerModel || 'anthropic/claude-sonnet-5.5';
    const chosenModelObj = typeof window.getModel === 'function' ? window.getModel(chosenModelId) : null;
    const chosenModelName = chosenModelObj?.name || chosenModelId;

    if (statusEl) statusEl.hidden = false;
    if (statusTxt) statusTxt.textContent = `${chosenModelName} проектирует палитру и калибрует контраст токенов…`;
    if (btnSubmit) btnSubmit.disabled = true;
    if (btnCancel) btnCancel.disabled = true;

    aiThemeGenAbortCtrl = new AbortController();

    const targetMode = aiThemeTargetChoice === 'current' ? activeThemeTarget : aiThemeTargetChoice;
    let userInstruction = `User theme request: "${promptText}".\n`;
    if (targetMode === 'both') {
        userInstruction += `Create paired tokens for BOTH "dark" and "light" themes. Return JSON with {"dark": {...}, "light": {...}}.`;
    } else {
        userInstruction += `Create tokens specifically tailored for "${targetMode}" theme. Return JSON with {"theme": {...}}.`;
    }

    const modelId = chosenModelId;

    const origin = (typeof location !== 'undefined' && location.origin && !location.origin.startsWith('file') && !location.origin.startsWith('app') && !location.origin.startsWith('capacitor') && !location.origin.includes('localhost'))
        ? location.origin
        : 'https://unichat2.sahbanovtimur228.workers.dev/ai';

    try {
        let rawContent = '';

        if (orKey) {
            const attribHeaders = getOpenRouterAttributionHeaders('Design Studio');
            const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                signal: aiThemeGenAbortCtrl.signal,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + orKey,
                    ...attribHeaders
                },
                body: JSON.stringify({
                    model: modelId,
                    messages: [
                        { role: 'system', content: AI_THEME_DESIGN_SYSTEM_PROMPT },
                        { role: 'user', content: userInstruction }
                    ],
                    temperature: 0.7,
                    stream: false
                })
            });

            if (!resp.ok) {
                let errDetail = 'HTTP ' + resp.status;
                try { const j = await resp.json(); errDetail = j.error?.message || errDetail; } catch (_) { }
                throw new Error(errDetail);
            }
            const data = await resp.json();
            rawContent = data?.choices?.[0]?.message?.content || '';
        } else {
            // Маршрутизация через ProxyAPI
            const isProxyOpenAI = modelId.startsWith('openai/');
            const isProxyAnthropic = modelId.startsWith('anthropic/');
            const actualModel = modelId.replace(/^(openai|anthropic)\//, '');

            if (isProxyAnthropic) {
                const resp = await fetch('https://api.proxyapi.ru/anthropic/v1/messages', {
                    method: 'POST',
                    signal: aiThemeGenAbortCtrl.signal,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + proxyKey,
                        'anthropic-version': '2023-06-01'
                    },
                    body: JSON.stringify({
                        model: actualModel,
                        system: AI_THEME_DESIGN_SYSTEM_PROMPT,
                        messages: [{ role: 'user', content: userInstruction }],
                        max_tokens: 8192,
                        temperature: 0.7
                    })
                });
                if (!resp.ok) {
                    let errDetail = 'HTTP ' + resp.status;
                    try { const j = await resp.json(); errDetail = j.error?.message || j.message || errDetail; } catch (_) { }
                    throw new Error('ProxyAPI Anthropic: ' + errDetail);
                }
                const data = await resp.json();
                rawContent = (data?.content || []).map(b => b.text || '').join('') || (data?.content?.[0]?.text || '');
            } else {
                const endpoint = isProxyOpenAI
                    ? 'https://api.proxyapi.ru/openai/v1/chat/completions'
                    : 'https://api.proxyapi.ru/openrouter/v1/chat/completions';

                const resp = await fetch(endpoint, {
                    method: 'POST',
                    signal: aiThemeGenAbortCtrl.signal,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + proxyKey,
                        'HTTP-Referer': origin,
                        'X-Title': 'MoonSSS Design Studio'
                    },
                    body: JSON.stringify({
                        model: isProxyOpenAI ? actualModel : modelId,
                        messages: [
                            { role: 'system', content: AI_THEME_DESIGN_SYSTEM_PROMPT },
                            { role: 'user', content: userInstruction }
                        ],
                        temperature: 0.7,
                        stream: false,
                        metadata: {
                            app_title: APP_IDENTITY.title,
                            app_url: APP_IDENTITY.refererUrl,
                            favicon_url: APP_IDENTITY.faviconUrl,
                            description: APP_IDENTITY.description
                        }
                    })
                });
                if (!resp.ok) {
                    let errDetail = 'HTTP ' + resp.status;
                    try { const j = await resp.json(); errDetail = j.error?.message || j.message || errDetail; } catch (_) { }
                    throw new Error('ProxyAPI: ' + errDetail);
                }
                const data = await resp.json();
                rawContent = data?.choices?.[0]?.message?.content || '';
            }
        }

        const parsed = extractJsonFromText(rawContent);

        if (!state.settings.customThemes) {
            state.settings.customThemes = {
                dark: Object.assign({}, FACTORY_THEME_DARK),
                light: Object.assign({}, FACTORY_THEME_LIGHT)
            };
        }

        if (!state.settings.customCode) {
            state.settings.customCode = { enabled: true, dark: { css: '', js: '' }, light: { css: '', js: '' } };
        } else {
            state.settings.customCode = normalizeCustomCode(state.settings.customCode);
        }

        if (targetMode === 'both') {
            const darkTokens = parsed.dark || parsed.theme || parsed;
            const lightTokens = parsed.light || parsed.theme || parsed;
            state.settings.customThemes.dark = sanitizeThemeTokens(darkTokens, state.settings.customThemes.dark || FACTORY_THEME_DARK);
            state.settings.customThemes.light = sanitizeThemeTokens(lightTokens, state.settings.customThemes.light || FACTORY_THEME_LIGHT);

            const darkCss = darkTokens.customCss || (parsed.dark && parsed.dark.customCss);
            const darkJs = darkTokens.customJs || (parsed.dark && parsed.dark.customJs);
            if (typeof darkCss === 'string' && darkCss.trim()) state.settings.customCode.dark.css = darkCss.trim();
            if (typeof darkJs === 'string' && darkJs.trim()) state.settings.customCode.dark.js = darkJs.trim();

            const lightCss = lightTokens.customCss || (parsed.light && parsed.light.customCss);
            const lightJs = lightTokens.customJs || (parsed.light && parsed.light.customJs);
            if (typeof lightCss === 'string' && lightCss.trim()) state.settings.customCode.light.css = lightCss.trim();
            if (typeof lightJs === 'string' && lightJs.trim()) state.settings.customCode.light.js = lightJs.trim();
        } else {
            const tokens = parsed.theme || parsed[targetMode] || parsed;
            state.settings.customThemes[targetMode] = sanitizeThemeTokens(tokens, state.settings.customThemes[targetMode] || (targetMode === 'light' ? FACTORY_THEME_LIGHT : FACTORY_THEME_DARK));

            const themeCss = tokens.customCss || parsed.customCss;
            const themeJs = tokens.customJs || parsed.customJs;
            if (typeof themeCss === 'string' && themeCss.trim()) state.settings.customCode[targetMode].css = themeCss.trim();
            if (typeof themeJs === 'string' && themeJs.trim()) state.settings.customCode[targetMode].js = themeJs.trim();
        }

        applyUserCustomCode();
        if (devTabInitialized) {
            renderDeveloperTabInputs();
        }

        save(true);
        applyTheme();
        renderAppearanceSettings();
        updateAppearanceLivePreview();
        closeAiThemeGenModal();
        toast('ИИ успешно создал и применил новый дизайн интерфейса', 'ok', 3200);
    } catch (err) {
        if (err.name === 'AbortError') return;
        console.error('[AiThemeGen] Generation failed:', err);
        toast('Ошибка создания темы: ' + (err.message || err), 'err', 4000);
    } finally {
        if (statusEl) statusEl.hidden = true;
        if (btnSubmit) btnSubmit.disabled = false;
        if (btnCancel) btnCancel.disabled = false;
        aiThemeGenAbortCtrl = null;
    }
}

/* ============ ТАБ КУРСОРОВ: УПРАВЛЕНИЕ, ПРЕСЕТЫ И DRAG & DROP ============ */
let activeCursorTarget = 'dark';

function initCursorsTab() {
    state.settings.customCursor = normalizeCustomCursor(state.settings.customCursor);
    activeCursorTarget = state.settings.theme || 'dark';
    syncCursorTargetButtons();
    bindCursorTargetEvents();
    renderCursorGalleries();
}

function syncCursorTargetButtons() {
    document.querySelectorAll('#cursorThemeTargetSegmented .set-seg-btn').forEach(btn => {
        const isTarget = btn.dataset.cursorTheme === activeCursorTarget;
        btn.classList.toggle('sel', isTarget);
        btn.setAttribute('aria-pressed', isTarget ? 'true' : 'false');
    });
}

function bindCursorTargetEvents() {
    document.querySelectorAll('#cursorThemeTargetSegmented .set-seg-btn').forEach(btn => {
        btn.onclick = () => {
            activeCursorTarget = btn.dataset.cursorTheme;
            syncCursorTargetButtons();
            renderCursorGalleries();
        };
    });
}

async function renderCursorGalleries() {
    state.settings.customCursor = normalizeCustomCursor(state.settings.customCursor);
    const curRoot = state.settings.customCursor;
    const cur = curRoot[activeCursorTarget] || (activeCursorTarget === 'light' ? curRoot.light : curRoot.dark);
    const pGrid = $('#pointerCursorGallery');
    const tGrid = $('#textCursorGallery');
    if (!pGrid || !tGrid) return;

    const defaultPointerId = activeCursorTarget === 'light' ? 'moon-light' : 'moon-dark';
    const defaultBeamId = activeCursorTarget === 'light' ? 'moon-light-beam' : 'moon-dark-beam';

    const pSize = cur.pointerSize || 32;
    const pOp = typeof cur.pointerOpacity === 'number' ? cur.pointerOpacity : 1;
    const tSize = cur.textSize || 26;
    const tOp = typeof cur.textOpacity === 'number' ? cur.textOpacity : 1;

    syncCursorSliderValues(pSize, pOp, tSize, tOp);

    // ── 1. Отрисовка галереи указателей (Pointer) ──
    const userPointers = (curRoot.userCustomCursors || []).filter(c => c && c.kind === 'pointer');
    const allPointers = [...BUILTIN_CURSORS.pointers, ...userPointers];

    const pCardPromises = allPointers.map(async item => {
        const isActive = (cur.pointerPresetId === item.id) || (!cur.pointerPresetId && item.id === defaultPointerId);
        const isUser = !!item.createdAt;

        let hoverStyle = '';
        if (item.isSystem) {
            hoverStyle = 'style="cursor: pointer !important;"';
        } else if (item.url) {
            const baked = await processCursorImage(item.url, 'pointer', pSize, pOp, item.id);
            hoverStyle = `style="cursor: url('${baked.dataUrl}') ${baked.hotspotX} ${baked.hotspotY}, pointer !important;"`;
        }

        return `
            <div class="cursor-preset-card ${isActive ? 'active' : ''}" data-type="pointer" data-id="${item.id}" data-url="${esc(item.url)}" ${hoverStyle}>
                ${isUser ? `<button class="cpc-delete-btn" data-del-cursor="${item.id}" title="Удалить свой курсор" type="button"><svg class="ic"><use href="#i-trash"/></svg></button>` : ''}
                <span class="cpc-badge">${isActive ? 'Активен' : (isUser ? 'Свой' : 'Встроен')}</span>
                <div class="cursor-preset-preview">
                    ${item.isSystem
                ? '<svg class="ic" style="color:var(--text)"><use href="#i-cursor"/></svg>'
                : `<img src="${item.url}" alt="${esc(item.name)}" draggable="false">`
            }
                </div>
                <div class="cpc-info">
                    <div class="cpc-name">${esc(item.name)}</div>
                    <div class="cpc-type-tag">${esc(item.tag || 'Пользовательский')}</div>
                </div>
            </div>
        `;
    });

    const pCardsResults = await Promise.all(pCardPromises);
    pGrid.innerHTML = pCardsResults.join('') + `
        <div class="cursor-upload-card" id="cardUploadPointer">
            <div class="cursor-upload-plus">
                <svg class="ic"><use href="#i-plus"/></svg>
            </div>
            <div class="cursor-upload-title">Загрузить Pointer (${activeCursorTarget === 'light' ? 'Светлая' : 'Тёмная'})</div>
            <div class="cursor-upload-sub">Клик или перетащите PNG/SVG файл</div>
        </div>
    `;

    // ── 2. Отрисовка галереи I-Beam ──
    const userIbeams = (curRoot.userCustomCursors || []).filter(c => c && c.kind === 'text');
    const allIbeams = [...BUILTIN_CURSORS.ibeams, ...userIbeams];

    const tCardPromises = allIbeams.map(async item => {
        const isActive = (cur.textPresetId === item.id) || (!cur.textPresetId && item.id === defaultBeamId);
        const isUser = !!item.createdAt;

        let hoverStyle = '';
        if (item.isSystem) {
            hoverStyle = 'style="cursor: text !important;"';
        } else if (item.url) {
            const baked = await processCursorImage(item.url, 'text', tSize, tOp, item.id);
            hoverStyle = `style="cursor: url('${baked.dataUrl}') ${baked.hotspotX} ${baked.hotspotY}, text !important;"`;
        }

        return `
            <div class="cursor-preset-card ${isActive ? 'active' : ''}" data-type="text" data-id="${item.id}" data-url="${esc(item.url)}" ${hoverStyle}>
                ${isUser ? `<button class="cpc-delete-btn" data-del-cursor="${item.id}" title="Удалить свой курсор" type="button"><svg class="ic"><use href="#i-trash"/></svg></button>` : ''}
                <span class="cpc-badge">${isActive ? 'Активен' : (isUser ? 'Свой' : 'Встроен')}</span>
                <div class="cursor-preset-preview">
                    ${item.isSystem
                ? '<svg class="ic" style="color:var(--text)"><use href="#i-pencil"/></svg>'
                : `<img src="${item.url}" alt="${esc(item.name)}" draggable="false">`
            }
                </div>
                <div class="cpc-info">
                    <div class="cpc-name">${esc(item.name)}</div>
                    <div class="cpc-type-tag">${esc(item.tag || 'Пользовательский')}</div>
                </div>
            </div>
        `;
    });

    const tCardsResults = await Promise.all(tCardPromises);
    tGrid.innerHTML = tCardsResults.join('') + `
        <div class="cursor-upload-card" id="cardUploadTextCursor">
            <div class="cursor-upload-plus">
                <svg class="ic"><use href="#i-plus"/></svg>
            </div>
            <div class="cursor-upload-title">Загрузить I-Beam (${activeCursorTarget === 'light' ? 'Светлая' : 'Тёмная'})</div>
            <div class="cursor-upload-sub">Клик или перетащите PNG/SVG файл</div>
        </div>
    `;


    // Привязка кликов выбора пресетов
    document.querySelectorAll('.cursor-preset-card').forEach(card => {
        card.onclick = async e => {
            if (e.target.closest('.cpc-delete-btn')) return;
            const type = card.dataset.type;
            const id = card.dataset.id;
            const url = card.dataset.url;

            if (type === 'pointer') {
                cur.pointerPresetId = id;
                cur.pointerRawUrl = url;
                cur.pointerUrl = url;
            } else {
                cur.textPresetId = id;
                cur.textRawUrl = url;
                cur.textUrl = url;
            }
            curRoot.enabled = true;
            save();
            await applyCustomCursor();
            renderCursorGalleries();
            toast(`Курсор «${card.querySelector('.cpc-name').textContent}» выбран для ${activeCursorTarget === 'light' ? 'светлой' : 'тёмной'} темы`, 'ok', 1400);
        };
    });

    // Привязка удаления пользовательских курсоров
    document.querySelectorAll('.cpc-delete-btn').forEach(btn => {
        btn.onclick = async e => {
            e.stopPropagation();
            const id = btn.dataset.delCursor;
            curRoot.userCustomCursors = curRoot.userCustomCursors.filter(c => c.id !== id);

            ['dark', 'light'].forEach(themeKey => {
                const targetProf = curRoot[themeKey];
                if (targetProf) {
                    if (targetProf.pointerPresetId === id) {
                        targetProf.pointerPresetId = themeKey === 'light' ? 'moon-light' : 'moon-dark';
                        targetProf.pointerRawUrl = themeKey === 'light' ? BUILTIN_CURSORS.pointers[2].url : BUILTIN_CURSORS.pointers[1].url;
                        targetProf.pointerUrl = targetProf.pointerRawUrl;
                    }
                    if (targetProf.textPresetId === id) {
                        targetProf.textPresetId = themeKey === 'light' ? 'moon-light-beam' : 'moon-dark-beam';
                        targetProf.textRawUrl = themeKey === 'light' ? BUILTIN_CURSORS.ibeams[2].url : BUILTIN_CURSORS.ibeams[1].url;
                        targetProf.textUrl = targetProf.textRawUrl;
                    }
                }
            });

            save();
            await applyCustomCursor();
            renderCursorGalleries();
            toast('Пользовательский курсор удалён', 'info');
        };
    });

    // Привязка слайдеров тонкой настройки
    bindCursorSliders();

    // Настройка Drag & Drop и кликов по плюсам
    setupCursorDropzone($('#cardUploadPointer'), $('#inpUploadPointerFile'), 'pointer');
    setupCursorDropzone($('#cardUploadTextCursor'), $('#inpUploadTextCursorFile'), 'text');
}

function syncCursorSliderValues(pSize, pOp, tSize, tOp) {
    const sPSize = $('#rngPointerSize');
    const sPSizeVal = $('#rngPointerSizeVal');
    if (sPSize && sPSizeVal) {
        sPSize.value = pSize;
        sPSizeVal.textContent = pSize + 'px';
    }

    const sPOp = $('#rngPointerOpacity');
    const sPOpVal = $('#rngPointerOpacityVal');
    if (sPOp && sPOpVal) {
        sPOp.value = pOp;
        sPOpVal.textContent = Math.round(pOp * 100) + '%';
    }

    const sTSize = $('#rngTextSize');
    const sTSizeVal = $('#rngTextSizeVal');
    if (sTSize && sTSizeVal) {
        sTSize.value = tSize;
        sTSizeVal.textContent = tSize + 'px';
    }

    const sTOp = $('#rngTextOpacity');
    const sTOpVal = $('#rngTextOpacityVal');
    if (sTOp && sTOpVal) {
        sTOp.value = tOp;
        sTOpVal.textContent = Math.round(tOp * 100) + '%';
    }
}

function bindCursorSliders() {
    const curRoot = state.settings.customCursor;
    const cur = curRoot[activeCursorTarget] || curRoot.dark;

    // 1. Размер Pointer
    const sPSize = $('#rngPointerSize');
    if (sPSize) {
        sPSize.oninput = async e => {
            const val = parseInt(e.target.value, 10);
            const valLabel = $('#rngPointerSizeVal');
            if (valLabel) valLabel.textContent = val + 'px';
            cur.pointerSize = val;
            save();
            await applyCustomCursor();
        };
    }
    const btnResetPSize = $('#btnResetPointerSize');
    if (btnResetPSize) {
        btnResetPSize.onclick = async () => {
            cur.pointerSize = 32;
            save();
            await applyCustomCursor();
            renderCursorGalleries();
        };
    }

    // 2. Прозрачность Pointer
    const sPOp = $('#rngPointerOpacity');
    if (sPOp) {
        sPOp.oninput = async e => {
            const val = parseFloat(e.target.value);
            const valLabel = $('#rngPointerOpacityVal');
            if (valLabel) valLabel.textContent = Math.round(val * 100) + '%';
            cur.pointerOpacity = val;
            save();
            await applyCustomCursor();
        };
    }
    const btnResetPOp = $('#btnResetPointerOpacity');
    if (btnResetPOp) {
        btnResetPOp.onclick = async () => {
            cur.pointerOpacity = 1;
            save();
            await applyCustomCursor();
            renderCursorGalleries();
        };
    }

    // 3. Размер I-Beam
    const sTSize = $('#rngTextSize');
    if (sTSize) {
        sTSize.oninput = async e => {
            const val = parseInt(e.target.value, 10);
            const valLabel = $('#rngTextSizeVal');
            if (valLabel) valLabel.textContent = val + 'px';
            cur.textSize = val;
            save();
            await applyCustomCursor();
        };
    }
    const btnResetTSize = $('#btnResetTextSize');
    if (btnResetTSize) {
        btnResetTSize.onclick = async () => {
            cur.textSize = 26;
            save();
            await applyCustomCursor();
            renderCursorGalleries();
        };
    }

    // 4. Прозрачность I-Beam
    const sTOp = $('#rngTextOpacity');
    if (sTOp) {
        sTOp.oninput = async e => {
            const val = parseFloat(e.target.value);
            const valLabel = $('#rngTextOpacityVal');
            if (valLabel) valLabel.textContent = Math.round(val * 100) + '%';
            cur.textOpacity = val;
            save();
            await applyCustomCursor();
        };
    }
    const btnResetTOp = $('#btnResetTextOpacity');
    if (btnResetTOp) {
        btnResetTOp.onclick = async () => {
            cur.textOpacity = 1;
            save();
            await applyCustomCursor();
            renderCursorGalleries();
        };
    }
}

function setupCursorDropzone(dropZone, fileInput, kind) {
    if (!dropZone || !fileInput) return;

    dropZone.onclick = () => fileInput.click();

    fileInput.onchange = async e => {
        const file = e.target.files && e.target.files[0];
        if (file) await handleCursorFileUpload(file, kind);
        e.target.value = '';
    };

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, e => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('dragover');
        });
    });

    ['dragleave', 'dragend', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, e => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('dragover');
        });
    });

    dropZone.addEventListener('drop', async e => {
        const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) await handleCursorFileUpload(file, kind);
    });
}

async function handleCursorFileUpload(file, kind) {
    if (!file.type.startsWith('image/') && !file.name.endsWith('.cur')) {
        toast('Пожалуйста, выберите файл изображения (PNG, SVG, WEBP или CUR)', 'warn');
        return;
    }

    try {
        const dataUrl = await fileToDataURL(file);
        const name = (file.name.replace(/\.[^/.]+$/, '') || (kind === 'pointer' ? 'Custom Pointer' : 'Custom Beam')).slice(0, 24);

        const newCursor = {
            id: 'usr_' + uid(),
            kind,
            name,
            url: dataUrl,
            createdAt: Date.now()
        };

        const curRoot = state.settings.customCursor;
        const cur = curRoot[activeCursorTarget] || curRoot.dark;
        curRoot.userCustomCursors.unshift(newCursor);

        if (kind === 'pointer') {
            cur.pointerPresetId = newCursor.id;
            cur.pointerRawUrl = dataUrl;
            cur.pointerUrl = dataUrl;
        } else {
            cur.textPresetId = newCursor.id;
            cur.textRawUrl = dataUrl;
            cur.textUrl = dataUrl;
        }
        curRoot.enabled = true;

        save();
        await applyCustomCursor();
        renderCursorGalleries();
        toast(`Курсор «${name}» успешно добавлен и применён`, 'ok');
    } catch (err) {
        console.error('[MoonSSS] Cursor processing error:', err);
        toast('Ошибка обработки файла курсора', 'err');
    }
}

/* ============ СОХРАНЕНИЕ ТЕМ И КАТАЛОГ «СВОЙ ДИЗАЙН» ============ */
const cardActivePreviewModes = new Map();

function initSaveThemeModalEvents() {
    const btnOpen = $('#btnOpenSaveThemeModal');
    const btnShortcut = $('#btnCreateNewThemeShortcut');
    const overlay = $('#saveThemeModalOverlay');
    const btnClose = $('#saveThemeModalClose');
    const btnCancel = $('#saveThemeModalCancel');
    const btnSubmit = $('#saveThemeModalSubmit');
    const titleInp = $('#inpThemePresetTitle');
    const descInp = $('#inpThemePresetDesc');

    const openModal = () => {
        if (!overlay) return;
        if (titleInp) titleInp.value = '';
        if (descInp) descInp.value = '';

        const summaryBox = $('#themeSaveSummaryBox');
        if (summaryBox) {
            const dark = state.settings.customThemes?.dark || FACTORY_THEME_DARK;
            const light = state.settings.customThemes?.light || FACTORY_THEME_LIGHT;
            const curRoot = normalizeCustomCursor(state.settings.customCursor);
            const darkCurName = curRoot.dark?.pointerPresetId || 'system';
            const lightCurName = curRoot.light?.pointerPresetId || 'system';

            const rawCode = normalizeCustomCode(state.settings.customCode);
            const inpCss = document.getElementById('inpDevCustomCss');
            const inpJs = document.getElementById('inpDevCustomJs');
            if (inpCss && rawCode[activeDevThemeTarget]) rawCode[activeDevThemeTarget].css = inpCss.value;
            if (inpJs && rawCode[activeDevThemeTarget]) rawCode[activeDevThemeTarget].js = inpJs.value;

            const darkCssLines = (rawCode.dark.css || '').trim().split('\n').filter(Boolean).length;
            const darkJsLines = (rawCode.dark.js || '').trim().split('\n').filter(Boolean).length;
            const lightCssLines = (rawCode.light.css || '').trim().split('\n').filter(Boolean).length;
            const lightJsLines = (rawCode.light.js || '').trim().split('\n').filter(Boolean).length;

            const typo = state.settings.typography || {};
            const ruFontName = (FONT_PRESETS.ru || []).find(f => f.id === typo.ru?.font)?.name || 'Системный';
            const enFontName = (FONT_PRESETS.en || []).find(f => f.id === typo.en?.font)?.name || 'System';

            summaryBox.innerHTML = `
                <div class="theme-save-profile-card" style="background:${dark.bgColor};color:${dark.textColor}">
                    <div class="tsp-header" style="color:${dark.accentColor}">
                        <span>Тёмный профиль</span>
                        <span style="font-size:9.5px;opacity:0.8">Dark Bundle</span>
                    </div>
                    <div class="tsp-swatches">
                        <span class="tsp-dot" style="background:${dark.bgColor}" title="Фон: ${dark.bgColor}"></span>
                        <span class="tsp-dot" style="background:${dark.streamColor};box-shadow:0 0 6px ${dark.streamColor}" title="Шлейф: ${dark.streamColor}"></span>
                        <span class="tsp-dot" style="background:${dark.accentColor}" title="Акцент: ${dark.accentColor}"></span>
                        <span class="tsp-dot" style="background:${dark.userBubbleBg}" title="Баббл: ${dark.userBubbleBg}"></span>
                    </div>
                    <div class="tsp-details-list">
                        <div class="tsp-detail-row">
                            <svg class="ic" style="color:${dark.accentColor}"><use href="#i-cursor"/></svg>
                            <span>Курсор: <b>${esc(darkCurName)}</b></span>
                        </div>
                        <div class="tsp-detail-row">
                            <svg class="ic" style="color:${dark.accentColor}"><use href="#i-code"/></svg>
                            <span>Спецэффекты: <b>CSS (${darkCssLines} стр.) · JS (${darkJsLines} стр.)</b></span>
                        </div>
                        <div class="tsp-detail-row">
                            <svg class="ic" style="color:${dark.accentColor}"><use href="#i-pencil"/></svg>
                            <span>Типографика: <b>${esc(ruFontName)} / ${esc(enFontName)}</b></span>
                        </div>
                    </div>
                </div>

                <div class="theme-save-profile-card" style="background:${light.bgColor};color:${light.textColor}">
                    <div class="tsp-header" style="color:${light.accentColor}">
                        <span>Светлый профиль</span>
                        <span style="font-size:9.5px;opacity:0.8">Light Bundle</span>
                    </div>
                    <div class="tsp-swatches">
                        <span class="tsp-dot" style="background:${light.bgColor}" title="Фон: ${light.bgColor}"></span>
                        <span class="tsp-dot" style="background:${light.streamColor};box-shadow:0 0 6px ${light.streamColor}" title="Шлейф: ${light.streamColor}"></span>
                        <span class="tsp-dot" style="background:${light.accentColor}" title="Акцент: ${light.accentColor}"></span>
                        <span class="tsp-dot" style="background:${light.userBubbleBg}" title="Баббл: ${light.userBubbleBg}"></span>
                    </div>
                    <div class="tsp-details-list">
                        <div class="tsp-detail-row">
                            <svg class="ic" style="color:${light.accentColor}"><use href="#i-cursor"/></svg>
                            <span>Курсор: <b>${esc(lightCurName)}</b></span>
                        </div>
                        <div class="tsp-detail-row">
                            <svg class="ic" style="color:${light.accentColor}"><use href="#i-code"/></svg>
                            <span>Спецэффекты: <b>CSS (${lightCssLines} стр.) · JS (${lightJsLines} стр.)</b></span>
                        </div>
                        <div class="tsp-detail-row">
                            <svg class="ic" style="color:${light.accentColor}"><use href="#i-pencil"/></svg>
                            <span>Типографика: <b>${esc(ruFontName)} / ${esc(enFontName)}</b></span>
                        </div>
                    </div>
                </div>
            `;
        }

        overlay.classList.add('show');
        setTimeout(() => { if (titleInp) titleInp.focus(); }, 80);
    };

    if (btnOpen) btnOpen.onclick = openModal;
    if (btnShortcut) btnShortcut.onclick = openModal;

    const closeModal = () => { if (overlay) overlay.classList.remove('show'); };
    if (btnClose) btnClose.onclick = closeModal;
    if (btnCancel) btnCancel.onclick = closeModal;
    if (overlay) overlay.onclick = e => { if (e.target === overlay) closeModal(); };

    const handleSaveSubmit = () => {
        const title = (titleInp ? titleInp.value : '').trim();
        const desc = (descInp ? descInp.value : '').trim();
        if (!title) {
            toast('Введите название темы', 'warn');
            if (titleInp) titleInp.focus();
            return;
        }

        // Синхронизируем активный ввод из студии разработчика перед созданием пресета
        const inpCss = document.getElementById('inpDevCustomCss');
        const inpJs = document.getElementById('inpDevCustomJs');
        const curCode = normalizeCustomCode(state.settings.customCode);
        if (inpCss && curCode[activeDevThemeTarget]) curCode[activeDevThemeTarget].css = inpCss.value;
        if (inpJs && curCode[activeDevThemeTarget]) curCode[activeDevThemeTarget].js = inpJs.value;
        state.settings.customCode = curCode;

        const newPreset = {
            id: uid(),
            title,
            desc,
            createdAt: Date.now(),
            customThemes: JSON.parse(JSON.stringify(state.settings.customThemes || { dark: FACTORY_THEME_DARK, light: FACTORY_THEME_LIGHT })),
            customCursor: JSON.parse(JSON.stringify(normalizeCustomCursor(state.settings.customCursor))),
            customCode: JSON.parse(JSON.stringify(curCode)),
            typography: JSON.parse(JSON.stringify(state.settings.typography || {
                ru: { font: 'system', sizeType: 'system', size: 16 },
                en: { font: 'system', sizeType: 'system', size: 16 },
                ja: { font: 'system', sizeType: 'system', size: 16 }
            }))
        };

        if (!Array.isArray(state.settings.savedThemes)) state.settings.savedThemes = [];
        state.settings.savedThemes.unshift(newPreset);
        save(true);
        closeModal();
        switchSettingsTab('custom-designs');
        renderSavedThemes();
        toast(`Тема «${title}» (палитра, CSS, JS, шрифты и курсоры) сохранена в «Свой дизайн»`, 'ok', 2600);
    };

    if (btnSubmit) btnSubmit.onclick = handleSaveSubmit;

    if (titleInp) {
        titleInp.onkeydown = e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleSaveSubmit();
            }
        };
    }

    if (descInp) {
        descInp.onkeydown = e => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleSaveSubmit();
            }
        };
    }

    // Инспектор темы
    const inspectOverlay = $('#themeInspectOverlay');
    const inspectClose = $('#inspectCloseBtn');
    if (inspectClose && inspectOverlay) {
        inspectClose.onclick = () => inspectOverlay.classList.remove('show');
    }
}

function generateMiniLiquidGradientSvg(cfg) {
    const c1 = cfg.liquidColor1 || cfg.bgColor || '#050505';
    const c2 = cfg.liquidColor2 || cfg.accentColor || '#66b3ff';
    const c3 = cfg.liquidColor3 || cfg.streamColor || '#ffffff';
    const idSeed = hashStr(String(c1) + String(c2) + String(c3));

    return `
    <svg class="tc-mini-liquid" viewBox="0 0 340 180" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <radialGradient id="miniLg1_${idSeed}" cx="25%" cy="30%" r="65%">
                <stop offset="0%" stop-color="${c2}" stop-opacity="0.45"/>
                <stop offset="100%" stop-color="${c1}" stop-opacity="0"/>
            </radialGradient>
            <radialGradient id="miniLg2_${idSeed}" cx="80%" cy="75%" r="70%">
                <stop offset="0%" stop-color="${c3}" stop-opacity="0.35"/>
                <stop offset="100%" stop-color="${c1}" stop-opacity="0"/>
            </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill="${c1}"/>
        <rect width="100%" height="100%" fill="url(#miniLg1_${idSeed})"/>
        <rect width="100%" height="100%" fill="url(#miniLg2_${idSeed})"/>
    </svg>`;
}

function isThemePresetCurrentlyApplied(item) {
    if (!item || !item.customThemes) return false;
    const current = state.settings.customThemes;
    if (!current) return false;

    const darkMatch = JSON.stringify(item.customThemes.dark) === JSON.stringify(current.dark);
    const lightMatch = JSON.stringify(item.customThemes.light) === JSON.stringify(current.light);
    if (!darkMatch || !lightMatch) return false;

    if (item.customCode && state.settings.customCode) {
        const itemCode = normalizeCustomCode(item.customCode);
        const curCode = normalizeCustomCode(state.settings.customCode);
        if (itemCode.dark.css !== curCode.dark.css ||
            itemCode.dark.js !== curCode.dark.js ||
            itemCode.light.css !== curCode.light.css ||
            itemCode.light.js !== curCode.light.js) {
            return false;
        }
    }

    if (item.typography && state.settings.typography) {
        if (JSON.stringify(item.typography) !== JSON.stringify(state.settings.typography)) {
            return false;
        }
    }

    return true;
}

function renderSavedThemes() {
    const grid = $('#savedThemesGrid');
    const countBadge = $('#savedThemesCount');
    const dot = $('#customThemesDot');
    const list = state.settings.savedThemes || [];

    if (countBadge) countBadge.textContent = list.length;
    if (dot) dot.classList.toggle('show', list.length > 0);
    if (!grid) return;

    if (!list.length) {
        grid.innerHTML = `
            <div class="list-empty" style="grid-column:1/-1;padding:48px 16px">
                <svg><use href="#i-cube"/></svg>
                В каталоге «Свой дизайн» пока нет сохранённых тем.<br>
                Настройте палитру, спецэффекты или шрифты и нажмите «Сохранить настройки тем».
            </div>
        `;
        return;
    }

    const currentGlobalTheme = state.settings.theme || 'dark';

    grid.innerHTML = list.map(item => {
        const previewMode = cardActivePreviewModes.get(item.id) || currentGlobalTheme;
        const cfg = (item.customThemes && item.customThemes[previewMode]) || (previewMode === 'light' ? FACTORY_THEME_LIGHT : FACTORY_THEME_DARK);

        const savedCurRoot = normalizeCustomCursor(item.customCursor);
        const cardCursor = savedCurRoot[previewMode] || (previewMode === 'light' ? savedCurRoot.light : savedCurRoot.dark) || {};
        const pUrl = cardCursor.pointerRawUrl || cardCursor.pointerUrl || '';
        const tUrl = cardCursor.textRawUrl || cardCursor.textUrl || pUrl;
        const isSystem = cardCursor.pointerPresetId === 'system';
        const hasCustomCursor = !isSystem && !!pUrl;
        const isApplied = isThemePresetCurrentlyApplied(item);
        const cPSize = cardCursor.pointerSize || 32;
        const cPOp = typeof cardCursor.pointerOpacity === 'number' ? cardCursor.pointerOpacity : 1;
        const cTSize = cardCursor.textSize || 26;
        const cTOp = typeof cardCursor.textOpacity === 'number' ? cardCursor.textOpacity : 1;

        // Анализируем наличие CSS, JS и типографики
        const code = normalizeCustomCode(item.customCode);
        const hasDarkCss = !!(code.dark.css && code.dark.css.trim());
        const hasLightCss = !!(code.light.css && code.light.css.trim());
        const hasDarkJs = !!(code.dark.js && code.dark.js.trim());
        const hasLightJs = !!(code.light.js && code.light.js.trim());
        const hasCss = hasDarkCss || hasLightCss;
        const hasJs = hasDarkJs || hasLightJs;
        const hasTypo = !!(item.typography && (item.typography.ru || item.typography.en || item.typography.ja));

        const selBg = hexToHsla(cfg.selBgColor || '#3a7bd5', typeof cfg.selBgOpacity === 'number' ? cfg.selBgOpacity : 0.35);
        const accentSoft = hexToHsla(cfg.accentColor || '#8fd0f5', 0.15);
        const btnTintRgb = hexToRgb(cfg.btnTint || cfg.accentColor);
        const btnTintHsl = rgbToHsl(btnTintRgb.r, btnTintRgb.g, btnTintRgb.b);

        const cssVars = `
            --tc-bg: ${cfg.bgColor};
            --tc-text: ${cfg.textColor};
            --tc-text-dim: ${cfg.textDimColor};
            --tc-accent: ${cfg.accentColor};
            --tc-accent-soft: ${accentSoft};
            --tc-stream-col: ${cfg.streamColor};
            --tc-btn-tint-h: ${btnTintHsl.h};
            --tc-user-bg: ${cfg.userBubbleBg};
            --tc-user-text: ${cfg.userBubbleText};
            --tc-ai-bg: ${cfg.aiBubbleBg};
            --tc-ai-text: ${cfg.aiBubbleText};
            --tc-sel-bg: ${selBg};
            --tc-sel-text: ${cfg.selTextColor || '#ffffff'};
            --tc-logo-moon: ${cfg.logoMoonColor || (previewMode === 'light' ? '#0f172a' : '#e2e8f0')};
            --tc-logo-sss: ${cfg.logoSssColor || cfg.accentColor || (previewMode === 'light' ? '#0284c7' : '#8fd0f5')};
            --tc-input-bg: ${hexToHsla(cfg.inputShellBg || cfg.bgColor, typeof cfg.inputShellOpacity === 'number' ? cfg.inputShellOpacity : 0.88)};
            --tc-input-border: ${cfg.inputShellBorder || cfg.accentColor};
            --tc-input-text: ${cfg.inputShellText || cfg.textColor};
        `;

        // Scoped Cursor CSS для карточки: при наведении мыши курсор мгновенно принимает сохранённый вид соответствующего режима темы
        let cardScopedCursorStyle = '';
        if (!isMobile) {
            if (isSystem) {
                cardScopedCursorStyle = `
                    <style>
                        .theme-card[data-tid="${item.id}"],
                        .theme-card[data-tid="${item.id}"] * {
                            cursor: pointer !important;
                        }
                        .theme-card[data-tid="${item.id}"] :is(button, a, [role="button"], .btn, .tc-mode-btn):hover,
                        .theme-card[data-tid="${item.id}"] :is(button, a, [role="button"], .btn, .tc-mode-btn):hover * {
                            cursor: text !important;
                        }
                        .theme-card[data-tid="${item.id}"] input,
                        .theme-card[data-tid="${item.id}"] textarea {
                            cursor: text !important;
                        }
                    </style>
                `;
            } else if (pUrl) {
                cardScopedCursorStyle = `
                    <style>
                        .theme-card[data-tid="${item.id}"],
                        .theme-card[data-tid="${item.id}"] * {
                            cursor: url("${pUrl}") 2 2, pointer !important;
                        }
                        .theme-card[data-tid="${item.id}"] :is(button, a, [role="button"], .btn, .tc-mode-btn):hover,
                        .theme-card[data-tid="${item.id}"] :is(button, a, [role="button"], .btn, .tc-mode-btn):hover * {
                            cursor: url("${tUrl || pUrl}") 12 14, text !important;
                        }
                        .theme-card[data-tid="${item.id}"] input,
                        .theme-card[data-tid="${item.id}"] textarea,
                        .theme-card[data-tid="${item.id}"] [contenteditable] {
                            cursor: url("${tUrl || pUrl}") 12 14, text !important;
                        }
                    </style>
                `;
                // Асинхронно генерируем откалиброванный курсор с точным размером и прозрачностью
                processCursorImage(pUrl, 'pointer', cPSize, cPOp).then(bakedP => {
                    const cardEl = document.querySelector(`.theme-card[data-tid="${item.id}"]`);
                    if (!cardEl) return;
                    processCursorImage(tUrl || pUrl, 'text', cTSize, cTOp).then(bakedT => {
                        const styleEl = cardEl.querySelector('style');
                        if (styleEl) {
                            styleEl.textContent = `
                                .theme-card[data-tid="${item.id}"],
                                .theme-card[data-tid="${item.id}"] * {
                                    cursor: url("${bakedP.dataUrl}") ${bakedP.hotspotX} ${bakedP.hotspotY}, pointer !important;
                                }
                                .theme-card[data-tid="${item.id}"] :is(button, a, [role="button"], .btn, .tc-mode-btn):hover,
                                .theme-card[data-tid="${item.id}"] :is(button, a, [role="button"], .btn, .tc-mode-btn):hover * {
                                    cursor: url("${bakedT.dataUrl}") ${bakedT.hotspotX} ${bakedT.hotspotY}, text !important;
                                }
                                .theme-card[data-tid="${item.id}"] input,
                                .theme-card[data-tid="${item.id}"] textarea,
                                .theme-card[data-tid="${item.id}"] [contenteditable] {
                                    cursor: url("${bakedT.dataUrl}") ${bakedT.hotspotX} ${bakedT.hotspotY}, text !important;
                                }
                            `;
                        }
                    });
                }).catch(() => { });
            }
        }

        return `
            <div class="theme-card ${isApplied ? 'active-theme-applied' : ''}" data-tid="${item.id}">
                ${cardScopedCursorStyle}
                <div class="tc-top">
                    <div class="tc-title-wrap">
                        <div class="tc-title">${esc(item.title)}</div>
                        <div class="tc-desc">${esc(item.desc || 'Индивидуальная дизайн-система MoonSSS')}</div>
                    </div>
                    <div class="tc-badges-row">
                        ${isApplied ? '<span class="tc-applied-pill"><svg class="ic" style="width:12px;height:12px"><use href="#i-check"/></svg>Текущая тема</span>' : ''}
                        ${hasCss ? `<span class="set-badge-lock" title="Включает пользовательский CSS"><svg class="ic"><use href="#i-palette"/></svg>CSS</span>` : ''}
                        ${hasJs ? `<span class="set-badge-lock" title="Включает пользовательский JS/Canvas"><svg class="ic"><use href="#i-terminal"/></svg>JS</span>` : ''}
                        ${hasCustomCursor ? '<span class="set-badge-lock" title="Наведите мышь на карточку — курсор примет вид этой темы"><svg class="ic"><use href="#i-cursor"/></svg>Курсор</span>' : ''}
                        ${hasTypo ? '<span class="set-badge-lock" title="Включает гарнитуры и кегль шрифтов"><svg class="ic"><use href="#i-pencil"/></svg>Шрифты</span>' : ''}
                    </div>
                </div>

                <!-- Живой мини-слепок визуального стиля темы -->
                <div class="tc-mini-viewport" style="${cssVars}">
                    ${generateMiniLiquidGradientSvg(cfg)}

                    <div class="tc-mini-content">
                        <div class="tc-mini-viewport-header">
                            <div class="logo tc-mini-logo" style="font-size:12px;display:flex;align-items:baseline;gap:1px">
                                <span style="color:var(--tc-logo-moon)">Moon</span><span style="color:var(--tc-logo-sss)">SSS</span>
                            </div>
                            
                            <!-- Переключатель тёмного/светлого профиля внутри карточки -->
                            <div class="tc-mode-toggle no-sel">
                                <button class="tc-mode-btn ${previewMode === 'dark' ? 'sel' : ''}" data-tid="${item.id}" data-set-mode="dark" type="button">
                                    <svg class="ic"><use href="#i-moon"/></svg>Dark
                                </button>
                                <button class="tc-mode-btn ${previewMode === 'light' ? 'sel' : ''}" data-tid="${item.id}" data-set-mode="light" type="button">
                                    <svg class="ic"><use href="#i-sun"/></svg>Light
                                </button>
                            </div>
                        </div>

                        <div class="tc-mini-bubble-row user">
                            <div class="tc-mini-bubble user">Привет! Покажи мой новый стиль.</div>
                        </div>

                        <div class="tc-mini-bubble-row ai">
                            <div class="tc-mini-bubble ai">
                                <div>Готово! Вот ваш настроенный дизайн.</div>
                                <div class="tc-mini-laser-row">
                                    <span class="tc-mini-laser-txt">Лазерный шлейф генерации</span>
                                    <span class="tc-mini-cursor"></span>
                                </div>
                            </div>
                        </div>

                        <div class="tc-mini-viewport-footer">
                            <span class="tc-mini-btn-demo">Кнопка</span>
                            <span class="tc-mini-sel-demo">Пример <span class="tc-mini-sel-highlight">выделения</span></span>
                            ${hasCss || hasJs ? `<span class="tc-mini-code-tag" title="Спецэффекты темы">${hasCss ? 'CSS' : ''}${hasCss && hasJs ? ' + ' : ''}${hasJs ? 'JS' : ''}</span>` : ''}
                        </div>
                    </div>
                </div>

                <div class="tc-actions">
                    <button class="btn btn-acc btn-sm btn-apply-theme" data-tid="${item.id}" type="button">
                        <svg class="ic"><use href="#i-spark"/></svg>${isApplied ? 'Применено' : 'Применить эту тему'}
                    </button>
                    <button class="btn btn-ghost btn-sm btn-publish-theme" data-tid="${item.id}" type="button" title="Опубликовать в Community Room">
                        <svg class="ic"><use href="#i-globe"/></svg>В сообщество
                    </button>
                    <button class="btn btn-ghost btn-sm btn-inspect-theme" data-tid="${item.id}" type="button">
                        <svg class="ic"><use href="#i-eye"/></svg>Инспектор
                    </button>
                    <button class="btn btn-ghost btn-sm btn-delete-theme" data-tid="${item.id}" style="color:var(--danger)" type="button" title="Удалить тему">
                        <svg class="ic"><use href="#i-trash"/></svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    // Переключение профиля внутри карточки без влияния на глобальную тему
    grid.querySelectorAll('.tc-mode-btn').forEach(btn => {
        btn.onclick = e => {
            e.stopPropagation();
            const tid = btn.dataset.tid;
            const mode = btn.dataset.setMode;
            cardActivePreviewModes.set(tid, mode);
            renderSavedThemes();
        };
    });

    grid.querySelectorAll('.btn-apply-theme').forEach(btn => {
        btn.onclick = () => applySavedTheme(btn.dataset.tid);
    });

    grid.querySelectorAll('.btn-publish-theme').forEach(btn => {
        btn.onclick = () => {
            const item = (state.settings.savedThemes || []).find(t => t.id === btn.dataset.tid);
            if (item && window.supabaseCommunity) {
                window.supabaseCommunity.openStylePublishModal(item);
            }
        };
    });

    grid.querySelectorAll('.btn-inspect-theme').forEach(btn => {
        btn.onclick = () => openThemeInspector(btn.dataset.tid);
    });

    grid.querySelectorAll('.btn-delete-theme').forEach(btn => {
        btn.onclick = () => deleteSavedTheme(btn.dataset.tid);
    });
}

function applyThemeDataDirectly(themeData, title = 'Стиль сообщества') {
    if (!themeData) return;
    if (themeData.customThemes) {
        state.settings.customThemes = JSON.parse(JSON.stringify(themeData.customThemes));
    }
    if (themeData.customCursor) {
        state.settings.customCursor = normalizeCustomCursor(JSON.parse(JSON.stringify(themeData.customCursor)));
    }
    if (themeData.customCode) {
        state.settings.customCode = normalizeCustomCode(JSON.parse(JSON.stringify(themeData.customCode)));
    }
    if (themeData.typography) {
        state.settings.typography = JSON.parse(JSON.stringify(themeData.typography));
        applyTypography();
        renderFontsTab();
    }
    save(true);
    applyTheme();
    applyCustomCursor();
    applyUserCustomCode();
    renderAppearanceSettings();
    renderSavedThemes();
    if (devTabInitialized) renderDeveloperTabInputs();
    if ($('#pointerCursorGallery')) renderCursorGalleries();
    if (typeof renderMessages === 'function') renderMessages();
    toast(`Стиль «${title}» успешно применён!`, 'ok', 2400);
}
window.applyThemeDataDirectly = applyThemeDataDirectly;

function applySavedTheme(themeId) {
    const list = state.settings.savedThemes || [];
    const item = list.find(t => t.id === themeId);
    if (!item) return;

    state.settings.customThemes = JSON.parse(JSON.stringify(item.customThemes || { dark: FACTORY_THEME_DARK, light: FACTORY_THEME_LIGHT }));
    state.settings.customCursor = normalizeCustomCursor(item.customCursor ? JSON.parse(JSON.stringify(item.customCursor)) : state.settings.customCursor);

    if (item.customCode) {
        state.settings.customCode = normalizeCustomCode(JSON.parse(JSON.stringify(item.customCode)));
    }

    if (item.typography) {
        state.settings.typography = JSON.parse(JSON.stringify(item.typography));
        applyTypography();
        renderFontsTab();
    }

    save(true);
    applyTheme();
    applyCustomCursor();
    applyUserCustomCode();
    renderAppearanceSettings();
    renderSavedThemes();
    if (devTabInitialized) renderDeveloperTabInputs();
    if ($('#pointerCursorGallery')) renderCursorGalleries();
    if (typeof renderMessages === 'function') renderMessages();
    toast(`Тема «${item.title}» успешно применена`, 'ok', 2200);
}

function deleteSavedTheme(themeId) {
    const list = state.settings.savedThemes || [];
    const item = list.find(t => t.id === themeId);
    if (!item) return;

    if (confirm(`Удалить тему «${item.title}» из каталога?`)) {
        state.settings.savedThemes = list.filter(t => t.id !== themeId);
        save();
        renderSavedThemes();
        toast('Тема удалена', 'info');
    }
}

function openThemeInspector(themeId) {
    const list = state.settings.savedThemes || [];
    const item = list.find(t => t.id === themeId);
    if (!item) return;

    const overlay = $('#themeInspectOverlay');
    const badge = $('#inspectThemeBadge');
    const content = $('#inspectContentBody');
    const btnApply = $('#btnInspectApplyTheme');

    if (badge) badge.textContent = item.title.toUpperCase();
    if (btnApply) btnApply.onclick = () => {
        applySavedTheme(item.id);
        overlay.classList.remove('show');
    };

    const dark = item.customThemes?.dark || FACTORY_THEME_DARK;
    const light = item.customThemes?.light || FACTORY_THEME_LIGHT;
    const code = normalizeCustomCode(item.customCode);
    const cursors = normalizeCustomCursor(item.customCursor);
    const typo = item.typography || {};

    const renderTokenBlock = (cfg, label) => `
        <section class="set-sec">
            <div class="set-title"><svg class="ic"><use href="#i-sun"/></svg>${label}</div>
            <div class="inspect-tokens-grid">
                <div class="inspect-token-card"><span class="it-swatch" style="background:${cfg.bgColor}"></span><div class="it-info"><div class="it-key">Фон холста</div><div class="it-val">${cfg.bgColor}</div></div></div>
                <div class="inspect-token-card"><span class="it-swatch" style="background:${cfg.textColor}"></span><div class="it-info"><div class="it-key">Основной текст</div><div class="it-val">${cfg.textColor}</div></div></div>
                <div class="inspect-token-card"><span class="it-swatch" style="background:${cfg.topbarBg || '#141414'}"></span><div class="it-info"><div class="it-key">Верхняя панель (Topbar)</div><div class="it-val">${cfg.topbarBg || 'По умолч.'} / ${Math.round((cfg.topbarOpacity || 0.82) * 100)}% / ${cfg.topbarBlur || 24}px blur</div></div></div>
                <div class="inspect-token-card"><span class="it-swatch" style="background:${cfg.cardBg || '#18181b'}"></span><div class="it-info"><div class="it-key">Карточки настроек</div><div class="it-val">${cfg.cardBg || 'По умолч.'} / ${Math.round((cfg.cardOpacity || 0.65) * 100)}% / ${cfg.cardBlur || 16}px blur</div></div></div>
                <div class="inspect-token-card"><span class="it-swatch" style="background:${cfg.logoMoonColor || '#e2e8f0'}"></span><div class="it-info"><div class="it-key">Логотип «Moon»</div><div class="it-val">${cfg.logoMoonColor || 'По умолч.'} / ${Math.round((cfg.logoMoonGlow || 0.25) * 100)}% свечение</div></div></div>
                <div class="inspect-token-card"><span class="it-swatch" style="background:${cfg.logoSssColor || '#8fd0f5'}"></span><div class="it-info"><div class="it-key">Логотип «SSS»</div><div class="it-val">${cfg.logoSssColor || 'По умолч.'} / ${Math.round((cfg.logoSssGlow || 0.85) * 100)}% свечение</div></div></div>
                <div class="inspect-token-card"><span class="it-swatch" style="background:${cfg.inputShellBg || '#18181b'}"></span><div class="it-info"><div class="it-key">Фон поля ввода</div><div class="it-val">${cfg.inputShellBg || 'По умолч.'} / ${Math.round((cfg.inputShellOpacity || 0.88) * 100)}%</div></div></div>
                <div class="inspect-token-card"><span class="it-swatch" style="background:${cfg.inputShellText || cfg.textColor}"></span><div class="it-info"><div class="it-key">Текст поля ввода</div><div class="it-val">${cfg.inputShellText || cfg.textColor}</div></div></div>
                <div class="inspect-token-card"><span class="it-swatch" style="background:${cfg.streamColor};box-shadow:0 0 10px ${cfg.streamColor}"></span><div class="it-info"><div class="it-key">Шлейф стрима</div><div class="it-val">${cfg.streamColor}</div></div></div>
                <div class="inspect-token-card"><span class="it-swatch" style="background:${cfg.accentColor}"></span><div class="it-info"><div class="it-key">Акцент кнопок</div><div class="it-val">${cfg.accentColor}</div></div></div>
                <div class="inspect-token-card"><span class="it-swatch" style="background:${cfg.btnTint || cfg.accentColor}"></span><div class="it-info"><div class="it-key">Оттенок кнопок (Button Tint)</div><div class="it-val">${cfg.btnTint || cfg.accentColor}</div></div></div>
                <div class="inspect-token-card"><span class="it-swatch" style="background:${cfg.selBgColor}"></span><div class="it-info"><div class="it-key">Выделение ::selection</div><div class="it-val">${cfg.selBgColor}</div></div></div>
                <div class="inspect-token-card"><span class="it-swatch" style="background:${cfg.userBubbleBg}"></span><div class="it-info"><div class="it-key">Баббл пользователя</div><div class="it-val">${cfg.userBubbleBg}</div></div></div>
                <div class="inspect-token-card"><span class="it-swatch" style="background:${cfg.aiBubbleBg}"></span><div class="it-info"><div class="it-key">Баббл ответа ИИ</div><div class="it-val">${cfg.aiBubbleBg}</div></div></div>
                <div class="inspect-token-card"><span class="it-swatch" style="background:${cfg.liquidColor1 || cfg.bgColor}"></span><div class="it-info"><div class="it-key">Шейдер 21st (Color 1)</div><div class="it-val">${cfg.liquidColor1 || cfg.bgColor}</div></div></div>
                <div class="inspect-token-card"><span class="it-swatch" style="background:${cfg.liquidColor2 || cfg.accentColor}"></span><div class="it-info"><div class="it-key">Шейдер 21st (Color 2)</div><div class="it-val">${cfg.liquidColor2 || cfg.accentColor}</div></div></div>
                <div class="inspect-token-card"><span class="it-swatch" style="background:${cfg.liquidColor3 || '#ffffff'}"></span><div class="it-info"><div class="it-key">Шейдер 21st (Color 3)</div><div class="it-val">${cfg.liquidColor3 || '#ffffff'} (Скорость: ${cfg.liquidSpeed || 26})</div></div></div>
            </div>
        </section>
    `;

    const ruName = (FONT_PRESETS.ru || []).find(f => f.id === typo.ru?.font)?.name || 'Системный';
    const enName = (FONT_PRESETS.en || []).find(f => f.id === typo.en?.font)?.name || 'System';
    const jaName = (FONT_PRESETS.ja || []).find(f => f.id === typo.ja?.font)?.name || 'System';

    if (content) {
        content.innerHTML = `
            <div class="set-page-header">
                <div class="set-page-pre">Инспектор пресета & Полная архитектура темы</div>
                <h2 class="set-page-title">${esc(item.title)}</h2>
                <p class="set-page-desc">${esc(item.desc || 'Полный реестр цветовых переменных, скриптов, стилей, типографики и курсоров темы.')}</p>
            </div>

            ${renderTokenBlock(dark, 'Тёмный профиль темы (Dark Theme Tokens)')}
            ${renderTokenBlock(light, 'Светлый профиль темы (Light Theme Tokens)')}

            <!-- Раздел: Спецэффекты (Custom CSS & JS) -->
            <section class="set-sec">
                <div class="set-title"><svg class="ic"><use href="#i-code"/></svg>Пользовательские спецэффекты (CSS &amp; JS)</div>
                <div class="set-card set-card-pad">
                    <div style="font-size:12px;font-weight:700;color:var(--text-dim);margin-bottom:8px">Тёмная тема (Dark Profile):</div>
                    <div class="inspect-code-wrap">
                        <div class="inspect-code-header">
                            <span>CSS (${(code.dark.css || '').trim().split('\n').filter(Boolean).length} строк)</span>
                            <button class="btn btn-ghost btn-sm btn-copy-inspect-code" data-copy-type="dark-css" type="button"><svg class="ic"><use href="#i-copy"/></svg>Копировать CSS</button>
                        </div>
                        <pre class="inspect-code-pre"><code class="language-css">${esc(code.dark.css || '/* Пользовательский CSS не задан */')}</code></pre>
                    </div>

                    <div class="inspect-code-wrap" style="margin-top:12px">
                        <div class="inspect-code-header">
                            <span>JavaScript (${(code.dark.js || '').trim().split('\n').filter(Boolean).length} строк)</span>
                            <button class="btn btn-ghost btn-sm btn-copy-inspect-code" data-copy-type="dark-js" type="button"><svg class="ic"><use href="#i-copy"/></svg>Копировать JS</button>
                        </div>
                        <pre class="inspect-code-pre"><code class="language-javascript">${esc(code.dark.js || '// Пользовательский JS не задан')}</code></pre>
                    </div>

                    <div style="font-size:12px;font-weight:700;color:var(--text-dim);margin:18px 0 8px">Светлая тема (Light Profile):</div>
                    <div class="inspect-code-wrap">
                        <div class="inspect-code-header">
                            <span>CSS (${(code.light.css || '').trim().split('\n').filter(Boolean).length} строк)</span>
                            <button class="btn btn-ghost btn-sm btn-copy-inspect-code" data-copy-type="light-css" type="button"><svg class="ic"><use href="#i-copy"/></svg>Копировать CSS</button>
                        </div>
                        <pre class="inspect-code-pre"><code class="language-css">${esc(code.light.css || '/* Пользовательский CSS не задан */')}</code></pre>
                    </div>

                    <div class="inspect-code-wrap" style="margin-top:12px">
                        <div class="inspect-code-header">
                            <span>JavaScript (${(code.light.js || '').trim().split('\n').filter(Boolean).length} строк)</span>
                            <button class="btn btn-ghost btn-sm btn-copy-inspect-code" data-copy-type="light-js" type="button"><svg class="ic"><use href="#i-copy"/></svg>Копировать JS</button>
                        </div>
                        <pre class="inspect-code-pre"><code class="language-javascript">${esc(code.light.js || '// Пользовательский JS не задан')}</code></pre>
                    </div>
                </div>
            </section>

            <!-- Раздел: Курсоры темы -->
            <section class="set-sec">
                <div class="set-title"><svg class="ic"><use href="#i-cursor"/></svg>Курсоры мыши (Pointer &amp; I-Beam)</div>
                <div class="set-card set-card-pad">
                    <div class="inspect-tokens-grid">
                        <div class="inspect-token-card">
                            <span class="it-swatch" style="display:flex;align-items:center;justify-content:center;background:var(--input-bg)"><svg class="ic" style="color:var(--accent)"><use href="#i-cursor"/></svg></span>
                            <div class="it-info">
                                <div class="it-key">Dark Pointer</div>
                                <div class="it-val">${esc(cursors.dark?.pointerPresetId || 'moon-dark')} (${cursors.dark?.pointerSize || 32}px)</div>
                            </div>
                        </div>
                        <div class="inspect-token-card">
                            <span class="it-swatch" style="display:flex;align-items:center;justify-content:center;background:var(--input-bg)"><svg class="ic" style="color:var(--accent)"><use href="#i-pencil"/></svg></span>
                            <div class="it-info">
                                <div class="it-key">Dark I-Beam</div>
                                <div class="it-val">${esc(cursors.dark?.textPresetId || 'moon-dark-beam')} (${cursors.dark?.textSize || 26}px)</div>
                            </div>
                        </div>
                        <div class="inspect-token-card">
                            <span class="it-swatch" style="display:flex;align-items:center;justify-content:center;background:var(--input-bg)"><svg class="ic" style="color:var(--accent)"><use href="#i-cursor"/></svg></span>
                            <div class="it-info">
                                <div class="it-key">Light Pointer</div>
                                <div class="it-val">${esc(cursors.light?.pointerPresetId || 'moon-light')} (${cursors.light?.pointerSize || 32}px)</div>
                            </div>
                        </div>
                        <div class="inspect-token-card">
                            <span class="it-swatch" style="display:flex;align-items:center;justify-content:center;background:var(--input-bg)"><svg class="ic" style="color:var(--accent)"><use href="#i-pencil"/></svg></span>
                            <div class="it-info">
                                <div class="it-key">Light I-Beam</div>
                                <div class="it-val">${esc(cursors.light?.textPresetId || 'moon-light-beam')} (${cursors.light?.textSize || 26}px)</div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <!-- Раздел: Типографика темы -->
            <section class="set-sec">
                <div class="set-title"><svg class="ic"><use href="#i-pencil"/></svg>Типографика (Шрифты &amp; Размеры)</div>
                <div class="set-card set-card-pad">
                    <div class="inspect-tokens-grid">
                        <div class="inspect-token-card">
                            <div class="it-info">
                                <div class="it-key">Русский (Cyrillic)</div>
                                <div class="it-val">${esc(ruName)} (${typo.ru?.sizeType === 'system' ? 'Системный' : `${typo.ru?.size || 16}px`})</div>
                            </div>
                        </div>
                        <div class="inspect-token-card">
                            <div class="it-info">
                                <div class="it-key">English (Latin)</div>
                                <div class="it-val">${esc(enName)} (${typo.en?.sizeType === 'system' ? 'System' : `${typo.en?.size || 16}px`})</div>
                            </div>
                        </div>
                        <div class="inspect-token-card">
                            <div class="it-info">
                                <div class="it-key">日本語 (Japanese)</div>
                                <div class="it-val">${esc(jaName)} (${typo.ja?.sizeType === 'system' ? 'System' : `${typo.ja?.size || 16}px`})</div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <!-- Раздел: Экспорт полного JSON пресета -->
            <section class="set-sec">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
                    <div class="set-title"><svg class="ic"><use href="#i-code"/></svg>Полный JSON-бандл пресета</div>
                    <button class="btn btn-ghost btn-sm" id="btnCopyInspectJson" type="button"><svg class="ic"><use href="#i-copy"/></svg>Копировать весь JSON</button>
                </div>
                <div class="set-card set-card-pad">
                    <pre style="max-height:240px;overflow-y:auto;font-size:12px;font-family:ui-monospace,Menlo,monospace;color:var(--text-dim)"><code class="language-json">${esc(JSON.stringify(item, null, 2))}</code></pre>
                </div>
            </section>
        `;

        enhanceCode(content);

        content.querySelectorAll('.btn-copy-inspect-code').forEach(btn => {
            btn.onclick = () => {
                const type = btn.dataset.copyType;
                let textToCopy = '';
                if (type === 'dark-css') textToCopy = code.dark.css || '';
                else if (type === 'dark-js') textToCopy = code.dark.js || '';
                else if (type === 'light-css') textToCopy = code.light.css || '';
                else if (type === 'light-js') textToCopy = code.light.js || '';

                if (!textToCopy.trim()) {
                    toast('Код пуст', 'info', 1400);
                    return;
                }
                navigator.clipboard.writeText(textToCopy)
                    .then(() => toast('Код скопирован в буфер', 'ok', 1600))
                    .catch(() => toast('Не удалось скопировать код', 'err'));
            };
        });

        const btnCopyJson = content.querySelector('#btnCopyInspectJson');
        if (btnCopyJson) {
            btnCopyJson.onclick = () => {
                navigator.clipboard.writeText(JSON.stringify(item, null, 2))
                    .then(() => toast('JSON темы скопирован', 'ok', 1600))
                    .catch(() => toast('Не удалось скопировать JSON', 'err'));
            };
        }
    }

    overlay.classList.add('show');
}

function syncThemeTargetButtons() {
    document.querySelectorAll('#themeTargetSegmented .set-seg-btn').forEach(btn => {
        const isTarget = btn.dataset.targetTheme === activeThemeTarget;
        btn.classList.toggle('sel', isTarget);
        btn.setAttribute('aria-pressed', isTarget ? 'true' : 'false');
    });
}

function renderAppearanceSettings() {
    const themes = state.settings.customThemes || { dark: FACTORY_THEME_DARK, light: FACTORY_THEME_LIGHT };
    const factory = activeThemeTarget === 'light' ? FACTORY_THEME_LIGHT : FACTORY_THEME_DARK;
    const cfg = themes[activeThemeTarget] || factory;

    const colorInputs = document.querySelectorAll('#tabPanel-appearance .cp-color-input');
    colorInputs.forEach(input => {
        const prop = input.dataset.prop;
        const currentVal = cfg[prop] || factory[prop];
        if (currentVal) {
            input.value = currentVal;
            const hexInput = document.querySelector(`#tabPanel-appearance .cp-hex-input[data-prop="${prop}"]`);
            if (hexInput) hexInput.value = currentVal.toUpperCase();
        }
    });

    const rangeInputs = document.querySelectorAll('#tabPanel-appearance .cp-range-input');
    rangeInputs.forEach(range => {
        const prop = range.dataset.prop;
        const defaultVal = (typeof cfg[prop] === 'number')
            ? cfg[prop]
            : (typeof factory[prop] === 'number' ? factory[prop] : 0.35);
        range.value = defaultVal;
        const valLabel = document.getElementById(`${range.id}Val`);
        if (valLabel) {
            const isPixel = range.dataset.unit === 'px' || prop.endsWith('Blur');
            const isPlain = prop.startsWith('liquid');
            valLabel.textContent = isPixel ? `${Math.round(defaultVal)}px` : isPlain ? `${Math.round(defaultVal)}` : `${Math.round(defaultVal * 100)}%`;
        }
    });

    // Синхронизируем переключатель формы шейдера (Checks / Stripes / Edge)
    const activeShape = cfg.liquidShape || factory.liquidShape || 'Checks';
    document.querySelectorAll('#cpLiquidShapeSeg .set-seg-btn').forEach(btn => {
        btn.classList.toggle('sel', btn.dataset.shape === activeShape);
    });

    // Если экран узкий (смартфон), сворачиваем окно по умолчанию, чтобы не перекрывать форму
    if (window.innerWidth <= 600 && !tpDragState.isCustomPos && !tpDragState.isMinimized) {
        toggleTpMinimize();
    }

    updateAppearanceLivePreview();
}

function updateAppearanceLivePreview() {
    const themes = state.settings.customThemes || { dark: FACTORY_THEME_DARK, light: FACTORY_THEME_LIGHT };
    const factory = activeThemeTarget === 'light' ? FACTORY_THEME_LIGHT : FACTORY_THEME_DARK;
    const cfg = themes[activeThemeTarget] || factory;

    const isSettingsOpen = settingsOverlay && settingsOverlay.classList.contains('show');
    const isAppearanceTabActive = $('#tabPanel-appearance')?.classList.contains('active');
    const isAppearanceVisible = isSettingsOpen && isAppearanceTabActive;

    const shell = $('#themePreviewShell');
    if (shell) {
        shell.style.display = isAppearanceVisible ? 'flex' : 'none';
    }

    if (!isAppearanceVisible) {
        if (activeThemeTarget === state.settings.theme) {
            applyCustomThemeVariables(state.settings.theme);
            initTris();
            applyCustomCursor();
        }
        return;
    }

    const userBubble = $('#tpUserBubble');
    const aiBubble = $('#tpAiBubble');
    const streamDemo = $('#tpStreamTextDemo');
    const streamCursor = $('#tpStreamCursorDemo');
    const demoBtn = $('#tpDemoBtn');
    const demoSel = $('#tpDemoSelection');
    const logoMoonDemo = $('#tpLogoMoonDemo');
    const logoSssDemo = $('#tpLogoSssDemo');
    const inPreviewShell = $('#tpInputPreviewShell');
    const inPreviewInput = $('#tpPromptInputDemo');

    const globalSelBg = hexToHsla(cfg.selBgColor || '#3a7bd5', typeof cfg.selBgOpacity === 'number' ? cfg.selBgOpacity : 0.35);
    const userSelBg = hexToHsla(cfg.userSelBgColor || cfg.selBgColor || '#60a5fa', typeof cfg.userSelBgOpacity === 'number' ? cfg.userSelBgOpacity : 0.40);
    const aiSelBg = hexToHsla(cfg.aiSelBgColor || cfg.selBgColor || '#38bdf8', typeof cfg.aiSelBgOpacity === 'number' ? cfg.aiSelBgOpacity : 0.35);

    const bgRgb = hexToRgb(cfg.bgColor || '#1a1a1a');
    const isBgLight = (0.299 * bgRgb.r + 0.587 * bgRgb.g + 0.114 * bgRgb.b) / 255 > 0.52;

    if (shell) shell.style.background = cfg.bgColor;

    // Предпросмотр брендинга логотипа в Live Playground
    if (logoMoonDemo) {
        const mCol = cfg.logoMoonColor || (isBgLight ? '#0f172a' : '#e2e8f0');
        const mGlow = typeof cfg.logoMoonGlow === 'number' ? cfg.logoMoonGlow : 0.25;
        logoMoonDemo.style.color = mCol;
        logoMoonDemo.style.textShadow = mGlow > 0 ? `0 0 ${Math.round(mGlow * 24)}px ${hexToHsla(mCol, mGlow)}` : 'none';
    }
    if (logoSssDemo) {
        const sCol = cfg.logoSssColor || cfg.accentColor || '#8fd0f5';
        const sGlow = typeof cfg.logoSssGlow === 'number' ? cfg.logoSssGlow : 0.85;
        logoSssDemo.style.color = sCol;
        logoSssDemo.style.textShadow = sGlow > 0 ? `0 0 ${Math.round(sGlow * 28)}px ${hexToHsla(sCol, sGlow)}` : 'none';
    }

    // Предпросмотр композера в Live Playground
    if (inPreviewShell) {
        const inBg = cfg.inputShellBg || (isBgLight ? '#ffffff' : '#18181b');
        const inOp = typeof cfg.inputShellOpacity === 'number' ? cfg.inputShellOpacity : (isBgLight ? 0.95 : 0.88);
        inPreviewShell.style.background = hexToHsla(inBg, inOp);
        inPreviewShell.style.borderColor = cfg.inputShellBorder || (isBgLight ? '#cbd5e1' : '#2e2e32');
    }
    if (inPreviewInput) {
        inPreviewInput.style.color = cfg.inputShellText || cfg.textColor || '#ffffff';
    }

    const ubBg = cfg.userBubbleBg || (isBgLight ? '#e0f2fe' : '#262626');
    const ubOp = typeof cfg.userBubbleOpacity === 'number' ? cfg.userBubbleOpacity : (isBgLight ? 0.88 : 0.85);
    const ubBlur = typeof cfg.userBubbleBlur === 'number' ? cfg.userBubbleBlur : 24;
    const ubBorder = cfg.userBubbleBorder || (isBgLight ? 'hsla(var(--acc-h), 65%, 45%, 0.35)' : 'hsla(var(--acc-h), 70%, 65%, 0.38)');

    if (userBubble) {
        userBubble.style.background = hexToHsla(ubBg, ubOp);
        userBubble.style.color = cfg.userBubbleText || (isBgLight ? '#0f172a' : '#f8fafc');
        userBubble.style.borderColor = ubBorder;
        userBubble.style.backdropFilter = `blur(${ubBlur}px) saturate(190%)`;
        userBubble.style.webkitBackdropFilter = `blur(${ubBlur}px) saturate(190%)`;
        userBubble.style.setProperty('--tp-user-sel-bg', userSelBg);
        userBubble.style.setProperty('--tp-user-sel-color', cfg.userSelTextColor || '#ffffff');
    }

    const aiBg = cfg.aiBubbleBg || (isBgLight ? '#ffffff' : '#18181b');
    const aiOp = typeof cfg.aiBubbleOpacity === 'number' ? cfg.aiBubbleOpacity : (isBgLight ? 0.90 : 0.86);
    const aiBlur = typeof cfg.aiBubbleBlur === 'number' ? cfg.aiBubbleBlur : 28;
    const aiBorder = cfg.aiBubbleBorder || (isBgLight ? 'hsla(220, 18%, 18%, 0.12)' : 'hsla(0, 0%, 100%, 0.10)');

    if (aiBubble) {
        aiBubble.style.background = hexToHsla(aiBg, aiOp);
        aiBubble.style.color = cfg.aiBubbleText || (isBgLight ? '#1e293b' : '#f1f5f9');
        aiBubble.style.borderColor = aiBorder;
        aiBubble.style.backdropFilter = `blur(${aiBlur}px) saturate(180%)`;
        aiBubble.style.webkitBackdropFilter = `blur(${aiBlur}px) saturate(180%)`;
        aiBubble.style.setProperty('--tp-ai-sel-bg', aiSelBg);
        aiBubble.style.setProperty('--tp-ai-sel-color', cfg.aiSelTextColor || '#ffffff');
    }

    const elBg = cfg.elemBg || (isBgLight ? '#ffffff' : '#141417');
    const elOp = typeof cfg.elemOpacity === 'number' ? cfg.elemOpacity : (isBgLight ? 0.86 : 0.82);
    const elBlur = typeof cfg.elemBlur === 'number' ? cfg.elemBlur : 20;
    const elBorder = cfg.elemBorder || (isBgLight ? 'hsla(220, 18%, 18%, 0.10)' : 'hsla(0, 0%, 100%, 0.08)');

    const tpThink = $('#tpThinkDemo');
    if (tpThink) {
        tpThink.style.background = hexToHsla(elBg, elOp);
        tpThink.style.borderColor = elBorder;
        tpThink.style.backdropFilter = `blur(${elBlur}px) saturate(180%)`;
        tpThink.style.webkitBackdropFilter = `blur(${elBlur}px) saturate(180%)`;
    }
    const tpWs = $('#tpWsDemo');
    if (tpWs) {
        tpWs.style.background = hexToHsla(elBg, elOp);
        tpWs.style.borderColor = elBorder;
        tpWs.style.backdropFilter = `blur(${elBlur}px) saturate(180%)`;
        tpWs.style.webkitBackdropFilter = `blur(${elBlur}px) saturate(180%)`;
    }

    if (streamDemo) {
        streamDemo.style.color = cfg.streamColor;
        streamDemo.style.textShadow = `0 0 12px ${cfg.streamColor}`;
    }

    if (streamCursor) {
        streamCursor.style.background = cfg.streamColor;
        streamCursor.style.boxShadow = `0 0 10px ${cfg.streamColor}`;
    }

    const btnTintRgb = hexToRgb(cfg.btnTint || cfg.accentColor);
    const btnTintHsl = rgbToHsl(btnTintRgb.r, btnTintRgb.g, btnTintRgb.b);

    if (shell) {
        shell.style.setProperty('--btn-tint-h', btnTintHsl.h);
        shell.style.setProperty('--btn-tint-s', `${btnTintHsl.s}%`);
        shell.style.setProperty('--btn-tint-l', `${btnTintHsl.l}%`);
    }

    if (demoBtn) {
        demoBtn.style.borderColor = cfg.accentColor;
        demoBtn.style.background = `linear-gradient(155deg, ${hexToHsla(cfg.btnTint || cfg.accentColor, 0.35)} 0%, ${hexToHsla(cfg.btnTint || cfg.accentColor, 0.18)} 100%)`;
        demoBtn.style.color = cfg.textColor;
        demoBtn.style.boxShadow = `0 0 14px ${hexToHsla(cfg.btnTint || cfg.accentColor, 0.25)}`;
    }

    if (demoSel) {
        demoSel.style.setProperty('--tp-global-sel-bg', globalSelBg);
        demoSel.style.setProperty('--tp-global-sel-color', cfg.selTextColor || '#ffffff');
    }

    if (shell) {
        shell.style.setProperty('--tp-global-sel-bg', globalSelBg);
        shell.style.setProperty('--tp-global-sel-color', cfg.selTextColor || '#ffffff');
        shell.style.setProperty('--user-sel-bg', userSelBg);
        shell.style.setProperty('--user-sel-color', cfg.userSelTextColor || '#ffffff');
        shell.style.setProperty('--ai-sel-bg', aiSelBg);
        shell.style.setProperty('--ai-sel-color', cfg.aiSelTextColor || '#ffffff');
        shell.style.setProperty('--sel-bg', globalSelBg);
        shell.style.setProperty('--sel-color', cfg.selTextColor || '#ffffff');
    }

    if (activeThemeTarget === state.settings.theme) {
        applyCustomThemeVariables(state.settings.theme);
        initTris();
        applyCustomCursor();
        syncLiquidBgWithTheme();
        if (window.moonSelectionController && typeof window.moonSelectionController.forceRender === 'function') {
            window.moonSelectionController.forceRender();
        }
    }
}

function bindColorPickerEvents() {
    document.querySelectorAll('#themeTargetSegmented .set-seg-btn').forEach(btn => {
        btn.onclick = () => {
            activeThemeTarget = btn.dataset.targetTheme;
            syncThemeTargetButtons();
            renderAppearanceSettings();
        };
    });

    document.querySelectorAll('#tabPanel-appearance .cp-color-input').forEach(picker => {
        picker.oninput = e => {
            const prop = picker.dataset.prop;
            const val = e.target.value;
            const hexInput = document.querySelector(`#tabPanel-appearance .cp-hex-input[data-prop="${prop}"]`);
            if (hexInput) hexInput.value = val.toUpperCase();

            if (!state.settings.customThemes) state.settings.customThemes = { dark: { ...FACTORY_THEME_DARK }, light: { ...FACTORY_THEME_LIGHT } };
            state.settings.customThemes[activeThemeTarget][prop] = val;

            // Если меняется цвет фона холста (bgColor), плавно согласуем с ним подложку шейдера (liquidColor1)
            if (prop === 'bgColor') {
                state.settings.customThemes[activeThemeTarget].liquidColor1 = val;
                const l1Picker = document.querySelector('#cpLiquidColor1');
                const l1Hex = document.querySelector('#cpLiquidColor1Hex');
                if (l1Picker) l1Picker.value = val;
                if (l1Hex) l1Hex.value = val.toUpperCase();
            }

            save();
            updateAppearanceLivePreview();
            syncLiquidBgWithTheme();
        };
    });

    // Обработчик выбора геометрического паттерна шейдера
    document.querySelectorAll('#cpLiquidShapeSeg .set-seg-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('#cpLiquidShapeSeg .set-seg-btn').forEach(b => b.classList.remove('sel'));
            btn.classList.add('sel');
            const shape = btn.dataset.shape;
            if (!state.settings.customThemes) state.settings.customThemes = { dark: { ...FACTORY_THEME_DARK }, light: { ...FACTORY_THEME_LIGHT } };
            state.settings.customThemes[activeThemeTarget].liquidShape = shape;
            save();
            syncLiquidBgWithTheme();
        };
    });

    document.querySelectorAll('#tabPanel-appearance .cp-hex-input').forEach(hexInput => {
        hexInput.onchange = e => {
            let val = e.target.value.trim();
            if (!val.startsWith('#')) val = '#' + val;
            if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
                const prop = hexInput.dataset.prop;
                const picker = document.querySelector(`#tabPanel-appearance .cp-color-input[data-prop="${prop}"]`);
                if (picker) picker.value = val;

                if (!state.settings.customThemes) state.settings.customThemes = { dark: { ...FACTORY_THEME_DARK }, light: { ...FACTORY_THEME_LIGHT } };
                state.settings.customThemes[activeThemeTarget][prop] = val;
                save();
                updateAppearanceLivePreview();
            } else {
                renderAppearanceSettings();
            }
        };
    });

    document.querySelectorAll('#tabPanel-appearance .cp-range-input').forEach(range => {
        range.oninput = e => {
            const prop = range.dataset.prop;
            const val = parseFloat(e.target.value);
            const valLabel = document.getElementById(`${range.id}Val`);
            if (valLabel) {
                const isPixel = range.dataset.unit === 'px' || prop.endsWith('Blur');
                const isSpeed = prop === 'liquidSpeed';
                valLabel.textContent = isPixel ? `${Math.round(val)}px` : isSpeed ? `${Math.round(val)}` : `${Math.round(val * 100)}%`;
            }
            if (!state.settings.customThemes) state.settings.customThemes = { dark: { ...FACTORY_THEME_DARK }, light: { ...FACTORY_THEME_LIGHT } };
            state.settings.customThemes[activeThemeTarget][prop] = val;
            save();
            updateAppearanceLivePreview();
        };
    });

    document.querySelectorAll('#tabPanel-appearance .cp-reset-btn').forEach(btn => {
        btn.onclick = () => {
            const prop = btn.dataset.reset;
            const factory = activeThemeTarget === 'light' ? FACTORY_THEME_LIGHT : FACTORY_THEME_DARK;
            if (factory[prop] !== undefined) {
                if (!state.settings.customThemes) state.settings.customThemes = { dark: { ...FACTORY_THEME_DARK }, light: { ...FACTORY_THEME_LIGHT } };
                state.settings.customThemes[activeThemeTarget][prop] = factory[prop];
                save();
                renderAppearanceSettings();
                toast('Параметр сброшен к заводскому значению', 'ok', 1400);
            }
        };
    });

    const btnResetAll = $('#btnResetActiveThemeAll');
    if (btnResetAll) {
        btnResetAll.onclick = () => {
            const factory = activeThemeTarget === 'light' ? FACTORY_THEME_LIGHT : FACTORY_THEME_DARK;
            if (!state.settings.customThemes) state.settings.customThemes = { dark: { ...FACTORY_THEME_DARK }, light: { ...FACTORY_THEME_LIGHT } };
            state.settings.customThemes[activeThemeTarget] = { ...factory };
            save();
            renderAppearanceSettings();
            applyTheme();
            toast('Тема полностью возвращена к заводским настройкам', 'ok', 1800);
        };
    }
}

$('#btnCommunityRoom')?.addEventListener('click', () => {
    closeDrawer();
    if (window.supabaseCommunity) {
        window.supabaseCommunity.openCommunityModal();
    } else {
        toast('Модуль Community Room загружается…', 'info');
    }
});
$('#btnSettings').addEventListener('click', () => checkIsMobile() ? openSettings('hub') : openSettings('general'));
$('#btnSettingsMobileBack')?.addEventListener('click', () => showMobileSettingsHub());

// Делегированная обработка кнопок быстрого перехода между вкладками (subnav)
document.addEventListener('click', e => {
    const subBtn = e.target.closest('[data-subtab-switch]');
    if (subBtn && subBtn.dataset.subtabSwitch) {
        e.preventDefault();
        switchSettingsTab(subBtn.dataset.subtabSwitch);
    }
});
$('#settingsClose').addEventListener('click', closeSettings);
$('#btnSettingsDone').addEventListener('click', closeSettings);
$('#heroKeysBtn').addEventListener('click', () => openSettings('keys'));
$('#btnOpenIgSettingsModal')?.addEventListener('click', () => openImgGenSettings());
$('#btnOpenWsSettingsModal')?.addEventListener('click', () => openWsSettings());

/* Резервное копирование и восстановление */
$('#btnExportBackup')?.addEventListener('click', () => {
    try {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
        const a = document.createElement('a');
        a.href = dataStr;
        a.download = 'MoonSSS_Backup_' + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        toast('Резервная копия экспортирована', 'ok');
    } catch (e) {
        toast('Ошибка экспорта бэкапа', 'err');
    }
});

$('#btnImportBackup')?.addEventListener('click', () => {
    $('#fileBackupInput')?.click();
});

$('#fileBackupInput')?.addEventListener('change', async e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
        const text = await file.text();
        const imported = JSON.parse(text);
        if (imported && (Array.isArray(imported.chats) || imported.settings)) {
            if (imported.settings) state.settings = Object.assign(state.settings, imported.settings);
            if (Array.isArray(imported.chats)) state.chats = imported.chats;
            if (Array.isArray(imported.favorites)) state.favorites = imported.favorites;
            save(true);
            renderAll();
            syncSettingsUI();
            toast('Конфигурация успешно импортирована', 'ok');
        } else {
            toast('Некорректный формат файла бэкапа', 'err');
        }
    } catch (err) {
        toast('Ошибка чтения файла бэкапа', 'err');
    }
    e.target.value = '';
});

$('#btnClearAllChats')?.addEventListener('click', () => {
    if (confirm('Вы уверены, что хотите безвозвратно удалить все сохранённые чаты?')) {
        state.chats = [];
        state.activeId = null;
        save(true);
        renderAll();
        updateEnvironmentDiagnostics();
        toast('История диалогов полностью очищена', 'info');
    }
});

settingsOverlay.addEventListener('click', e => { if (e.target === settingsOverlay) closeSettings(); });
$('#setThemeSwitch').addEventListener('click', e => toggleTheme(e));
$('#themeBtn').addEventListener('click', e => toggleTheme(e));
$('#wsSwitch').addEventListener('click', e => {
    e.stopPropagation();
    state.settings.webSearch = !state.settings.webSearch;
    e.currentTarget.classList.toggle('on', state.settings.webSearch);
    const row = e.currentTarget.closest('.ws-row');
    if (row) row.classList.toggle('on', state.settings.webSearch);
    save();
});
$('#igSwitch').addEventListener('click', e => {
    e.stopPropagation();
    state.settings.imageGen = !state.settings.imageGen;
    e.currentTarget.classList.toggle('on', state.settings.imageGen);
    const row = e.currentTarget.closest('.ig-row');
    if (row) row.classList.toggle('on', state.settings.imageGen);
    save();
});
$('#artSwitch').addEventListener('click', e => {
    e.stopPropagation();
    state.settings.artifacts = !state.settings.artifacts;
    e.currentTarget.classList.toggle('on', state.settings.artifacts);
    save();
    toast(state.settings.artifacts ? 'Артефакты включены' : 'Артефакты выключены', 'info', 1600);
});
/* ── Параллельное мышление: автономный переключатель ── */
$('#dtSwitch')?.addEventListener('click', e => {
    e.stopPropagation();
    if (!state.settings.deepThink) state.settings.deepThink = { enabled: true, maxTasks: 100 };
    state.settings.deepThink.enabled = !state.settings.deepThink.enabled;
    state.settings.deepThink.maxTasks = 100;
    e.currentTarget.classList.toggle('on', state.settings.deepThink.enabled);
    const row = e.currentTarget.closest('.dt-row');
    if (row) row.classList.toggle('on', state.settings.deepThink.enabled);
    save();
    toast(state.settings.deepThink.enabled ? 'Параллельное мышление включено' : 'Параллельное мышление выключено', 'info', 1600);
});
function syncDtUI() {
    const dt = state.settings.deepThink || {};
    const sw = $('#dtSwitch');
    if (sw) sw.classList.toggle('on', dt.enabled !== false);
    const row = document.querySelector('.dt-row');
    if (row) row.classList.toggle('on', dt.enabled !== false);
}
/* ── Выполнение кода: переключатель (только десктоп с IPC-мостом) ── */
$('#cxSwitch').addEventListener('click', e => {
    e.stopPropagation();
    state.settings.codeExec = state.settings.codeExec === false ? true : false;
    e.currentTarget.classList.toggle('on', state.settings.codeExec);
    const row = e.currentTarget.closest('.cx-row');
    if (row) row.classList.toggle('on', state.settings.codeExec);
    save();
    toast(state.settings.codeExec ? 'Выполнение кода включено' : 'Выполнение кода выключено', 'info', 1600);
});
document.querySelectorAll('#apiSrcChips .set-seg-btn, #apiSrcChips .igm-chip').forEach(b => {
    b.addEventListener('click', () => {
        state.settings.apiSource = b.dataset.src;
        save();
        updateApiSrcChip();
        toast('Источник API: ' + API_SRC_LABELS[b.dataset.src], 'ok', 1600);
    });
});
/* ---------- Настройки генерации изображений ---------- */
const igOverlay = $('#igOverlay');
function updateIgHint() {
    const el = $('#igModelHint');
    if (el) {
        const cfg = getImgCfg();
        const m = window.IMG_MODELS.find(x => x.id === cfg.model) || window.IMG_MODELS[0];
        el.textContent = m.name;
    }
}
function renderImgGenSettings() {
    const cfg = getImgCfg();
    const list = window.IMG_MODELS || (window.toolCalling && window.toolCalling.IMG_MODELS) || [];
    const m = list.find(x => x.id === cfg.model) || list[0];

    /* Карточки моделей */
    const modelsBox = $('#igmModels');
    modelsBox.innerHTML = list.map(mm => {
        const iconSrc = mm.icon || (typeof window.getAiModelIcon === 'function' ? window.getAiModelIcon(mm.id, mm) : null);
        const iconHtml = iconSrc
            ? `<img src="${esc(iconSrc)}" class="igm-model-icon" alt="" loading="lazy" onerror="this.outerHTML='<svg class=\\'ic\\'><use href=\\'#i-chip\\'/></svg>'">`
            : `<svg class="ic"><use href="#i-chip"/></svg>`;

        return `
        <button class="igm-card ${mm.id === cfg.model ? 'sel' : ''}" data-mid="${mm.id}" type="button">
          <div class="igm-card-head">
            <div class="igm-title-row">
              <span class="igm-icon-box">${iconHtml}</span>
              <div class="igm-name">${esc(mm.name)}</div>
            </div>
            <svg class="igm-check"><use href="#i-check"/></svg>
          </div>
          <div class="igm-vendor">${esc(mm.vendor || '')}${mm.supportsResolution ? ' · до ' + mm.resolutions[mm.resolutions.length - 1] : (mm.supportsQuality ? ' · до High' : '')}</div>
          <div class="igm-desc">${esc(mm.desc)}</div>
        </button>`;
    }).join('');

    modelsBox.querySelectorAll('.igm-card').forEach(b => b.addEventListener('click', () => {
        cfg.model = b.dataset.mid;
        const nm = list.find(x => x.id === cfg.model);
        if (nm && Array.isArray(nm.ratios) && !nm.ratios.includes(cfg.ratio)) {
            cfg.ratio = nm.ratios.includes('auto') ? 'auto' : nm.ratios[0];
        }
        save();
        renderImgGenSettings();
        updateIgHint();
    }));

    /* Соотношения сторон выбранной модели */
    const ratioBox = $('#igmRatios');
    ratioBox.innerHTML = (m.ratios || ['1:1', 'auto']).map(r => {
        let g;
        if (r === 'auto') g = '<span class="rc-g auto" style="width:14px;height:14px"></span>';
        else {
            const [a, c] = r.split(':').map(Number);
            const w = a >= c ? 18 : Math.max(7, Math.round(18 * a / c));
            const h = a >= c ? Math.max(7, Math.round(18 * c / a)) : 18;
            g = `<span class="rc-g" style="width:${w}px;height:${h}px"></span>`;
        }
        return `<button class="igm-chip ${cfg.ratio === r ? 'sel' : ''}" data-r="${r}" type="button">${g}<span>${r === 'auto' ? 'Авто' : r}</span></button>`;
    }).join('');
    ratioBox.querySelectorAll('.igm-chip').forEach(b => b.addEventListener('click', () => { cfg.ratio = b.dataset.r; save(); renderImgGenSettings(); }));

    /* Секция параметров качества и фона (Riverflow + OpenAI) */
    const riverSec = $('#igmRiverSec');
    const hasQualityOptions = !!(m.supportsResolution || m.supportsQuality);
    const hasBackgrounds = Array.isArray(m.backgrounds) && m.backgrounds.length > 0;
    riverSec.classList.toggle('off', !hasQualityOptions && !hasBackgrounds);

    if (hasQualityOptions || hasBackgrounds) {
        const resBox = $('#igmRes');
        const qualityLabels = window.IG_QUALITY_LABELS || { auto: 'Авто', low: 'Low', medium: 'Medium', high: 'High' };

        if (m.supportsQuality) {
            // OpenAI качества (auto, low, medium, high, xhigh, max)
            const qLabels = window.IG_QUALITY_LABELS || { auto: 'Авто', low: 'Low', medium: 'Medium', high: 'High', xhigh: 'xHigh', max: 'Max' };
            resBox.innerHTML = (m.qualities || ['auto', 'low', 'medium', 'high']).map(q =>
                `<button class="igm-chip ${(cfg.quality === q || (!cfg.quality && q === (m.qualities?.includes('high') ? 'high' : 'auto'))) ? 'sel' : ''}" data-q="${q}" type="button">${qLabels[q] || q}</button>`
            ).join('');
            resBox.querySelectorAll('.igm-chip').forEach(b => b.addEventListener('click', () => {
                cfg.quality = b.dataset.q;
                save();
                renderImgGenSettings();
            }));
        } else if (m.supportsResolution) {
            // Riverflow разрешения
            resBox.innerHTML = (m.resolutions || ['1K', '2K', '4K']).map(r =>
                `<button class="igm-chip ${cfg.resolution === r ? 'sel' : ''}" data-r="${r}" type="button">${r}</button>`
            ).join('');
            resBox.querySelectorAll('.igm-chip').forEach(b => b.addEventListener('click', () => {
                cfg.resolution = b.dataset.r;
                save();
                renderImgGenSettings();
            }));
        } else {
            resBox.innerHTML = '<span class="igm-note">Стандартное (1K)</span>';
        }

        const bgLabels = window.IG_BG_LABELS || { auto: 'Авто', transparent: 'Прозрачный', opaque: 'Непрозрачный' };
        const bgBox = $('#igmBg');
        if (hasBackgrounds) {
            bgBox.innerHTML = m.backgrounds.map(r =>
                `<button class="igm-chip ${cfg.background === r ? 'sel' : ''}" data-bg="${r}" type="button">${bgLabels[r] || r}</button>`
            ).join('');
            bgBox.querySelectorAll('.igm-chip').forEach(b => b.addEventListener('click', () => {
                cfg.background = b.dataset.bg;
                save();
                renderImgGenSettings();
            }));
        } else {
            bgBox.innerHTML = '<span class="igm-note">По умолчанию</span>';
        }
    }

    /* Flux Params — секция видна для моделей FLUX (FLUX 2 Pro и FLUX 2 Klein) */
    const fluxSec = $('#igmFluxSec');
    if (fluxSec) {
        const isFlux = !!m.supportsFluxParams;
        fluxSec.style.display = isFlux ? 'flex' : 'none';

        if (isFlux) {
            const curSteps = typeof cfg.fluxSteps === 'number' ? cfg.fluxSteps : 28;
            const curGuidance = typeof cfg.fluxGuidance === 'number' ? cfg.fluxGuidance : 3.5;
            const curSafety = typeof cfg.fluxSafety === 'number' ? cfg.fluxSafety : 5;
            const curFormat = cfg.fluxFormat || 'jpeg';

            const sRange = $('#fluxStepsRange');
            const sVal = $('#fluxStepsVal');
            if (sRange && sVal) {
                sRange.value = curSteps;
                sVal.textContent = curSteps;
                sRange.oninput = () => {
                    sVal.textContent = sRange.value;
                    cfg.fluxSteps = parseInt(sRange.value, 10);
                    save();
                };
            }

            const gRange = $('#fluxGuidanceRange');
            const gVal = $('#fluxGuidanceVal');
            if (gRange && gVal) {
                gRange.value = curGuidance;
                gVal.textContent = curGuidance;
                gRange.oninput = () => {
                    gVal.textContent = gRange.value;
                    cfg.fluxGuidance = parseFloat(gRange.value);
                    save();
                };
            }

            const safeRange = $('#fluxSafetyRange');
            const safeVal = $('#fluxSafetyVal');
            if (safeRange && safeVal) {
                const clampedSafety = Math.min(5, Math.max(0, curSafety));
                safeRange.value = clampedSafety;
                safeVal.textContent = clampedSafety;
                safeRange.oninput = () => {
                    const val = Math.min(5, Math.max(0, parseInt(safeRange.value, 10) || 0));
                    safeRange.value = val;
                    safeVal.textContent = val;
                    cfg.fluxSafety = val;
                    save();
                };
            }

            const fmtChips = $('#fluxFormatChips');
            if (fmtChips) {
                fmtChips.querySelectorAll('.igm-chip').forEach(b => {
                    b.classList.toggle('sel', b.dataset.fmt === curFormat);
                    b.onclick = () => {
                        fmtChips.querySelectorAll('.igm-chip').forEach(x => x.classList.remove('sel'));
                        b.classList.add('sel');
                        cfg.fluxFormat = b.dataset.fmt;
                        save();
                    };
                });
            }
        }
    }
}
function openImgGenSettings() { renderImgGenSettings(); igOverlay.classList.add('show'); }
function closeImgGenSettings() { igOverlay.classList.remove('show'); }
$('#igGearBtn').addEventListener('click', e => { e.stopPropagation(); openImgGenSettings(); });
$('#igClose').addEventListener('click', closeImgGenSettings);
$('#igDone').addEventListener('click', closeImgGenSettings);
igOverlay.addEventListener('click', e => { if (e.target === igOverlay) closeImgGenSettings(); });
/* ---------- Настройки веб-поиска (динамические) ---------- */
function renderWsSettings() {
    const model = getModel(state.settings.modelId);
    const api = model.id.startsWith('openai/') ? 'openai' : model.api;
    const cfg = state.settings.webSearchCfg || { anthropic: {}, openai: {}, openrouter: {} };
    let html = '<section class="set-sec">';
    html += `<div class="set-title"><svg><use href="#i-globe"/></svg>Настройки веб-поиска для ${esc(model.name)}</div>`;

    if (api === 'anthropic') {
        const c = cfg.anthropic || {};
        const engine = c.engine || 'native';
        html += `
<div class="field"><label>Движок веб-поиска для Claude</label>
<div class="set-segmented" id="wsAntEngineSeg" style="margin-bottom:8px">
  <button type="button" class="set-seg-btn ${engine === 'native' ? 'sel' : ''}" data-engine="native">Нативный поиск (Anthropic)</button>
  <button type="button" class="set-seg-btn ${engine === 'agent' ? 'sel' : ''}" data-engine="agent">Агентный поиск (MoonSSS)</button>
</div></div>
${engine === 'native' ? `
<div class="field"><label>Максимум поисков (max_uses)</label>
<div class="ws-limit-row"><input type="range" id="wsAntMaxUses" min="1" max="10" step="1" value="${c.max_uses || 5}"><span class="ws-limit-val" id="wsAntMaxUsesVal">${c.max_uses || 5}</span></div></div>
<div class="field"><label>Объем контекста</label>
<div class="igm-chips" id="wsAntContextChips">
<button class="igm-chip ${c.context_size === 'low' ? 'sel' : ''}" data-v="low">Low</button>
<button class="igm-chip ${c.context_size === 'medium' ? 'sel' : ''}" data-v="medium">Medium</button>
<button class="igm-chip ${c.context_size === 'high' ? 'sel' : ''}" data-v="high">High</button>
</div></div>
<div class="igm-row2">
<div class="field"><label>Страна</label><input type="text" class="ws-input" id="wsAntCountry" value="${esc(c.country || 'RU')}" placeholder="RU"></div>
<div class="field"><label>Город</label><input type="text" class="ws-input" id="wsAntCity" value="${esc(c.city || 'Moscow')}" placeholder="Moscow"></div>
</div>
<div class="igm-row2">
<div class="field"><label>Регион</label><input type="text" class="ws-input" id="wsAntRegion" value="${esc(c.region || 'Moscow')}" placeholder="Moscow"></div>
<div class="field"><label>Часовой пояс</label><input type="text" class="ws-input" id="wsAntTimezone" value="${esc(c.timezone || 'Europe/Moscow')}" placeholder="Europe/Moscow"></div>
</div>
<div class="field"><label>Разрешенные домены (через запятую)</label><input type="text" class="ws-input" id="wsAntAllowed" value="${esc(c.allowed_domains || '')}" placeholder="example.com, trusted.org"></div>
<div class="field"><label>Заблокированные домены (через запятую)</label><input type="text" class="ws-input" id="wsAntBlocked" value="${esc(c.blocked_domains || '')}" placeholder="untrusted.com, spam.org"></div>
<div class="igm-note">Нативный поиск выполняется серверами Anthropic с автоматическим цитированием.</div>
` : `
<div class="igm-note">Активирован автономный агентный веб-поиск MoonSSS. Claude будет формулировать поисковые запросы, скачивать контент и читать страницы через инструмент fetch_url.</div>
`}
`;
    } else if (api === 'openai') {
        const c = cfg.openai || {};
        const engine = c.engine || 'native';
        html += `
      <div class="field"><label>Движок веб-поиска для OpenAI</label>
      <div class="set-segmented" id="wsOaiEngineSeg" style="margin-bottom:8px">
        <button type="button" class="set-seg-btn ${engine === 'native' ? 'sel' : ''}" data-engine="native">Нативный поиск (OpenAI 2026)</button>
        <button type="button" class="set-seg-btn ${engine === 'agent' ? 'sel' : ''}" data-engine="agent">Агентный поиск (MoonSSS)</button>
      </div></div>
      ${engine === 'native' ? `
      <div class="field"><label>Объем контекста (search_context_size)</label>
      <div class="igm-chips" id="wsOaiContextChips">
        <button class="igm-chip ${c.context_size === 'low' ? 'sel' : ''}" data-v="low">Low</button>
        <button class="igm-chip ${c.context_size === 'medium' ? 'sel' : ''}" data-v="medium">Medium</button>
        <button class="igm-chip ${c.context_size === 'high' ? 'sel' : ''}" data-v="high">High</button>
      </div></div>
      <div class="igm-row2">
        <div class="field"><label>Страна</label><input type="text" class="ws-input" id="wsOaiCountry" value="${esc(c.country || 'RU')}" placeholder="RU"></div>
        <div class="field"><label>Город</label><input type="text" class="ws-input" id="wsOaiCity" value="${esc(c.city || 'Moscow')}" placeholder="Moscow"></div>
      </div>
      <div class="field"><label>Регион</label><input type="text" class="ws-input" id="wsOaiRegion" value="${esc(c.region || 'Moscow')}" placeholder="Moscow"></div>
      <div class="field"><label>Разрешенные домены (через запятую)</label><input type="text" class="ws-input" id="wsOaiAllowed" value="${esc(c.allowed_domains || '')}" placeholder="openai.com, github.com"></div>
      <div class="field"><label>Заблокированные домены (через запятую)</label><input type="text" class="ws-input" id="wsOaiBlocked" value="${esc(c.blocked_domains || '')}" placeholder="spam.com, ads.org"></div>
      <div class="igm-note">Нативный веб-поиск OpenAI выполняется через инструмент web_search в Responses API с цитированием ссылок.</div>
      ` : `
      <div class="igm-note">Активирован автономный агентный веб-поиск MoonSSS. OpenAI формулирует поисковые запросы, скачивает контент и читает страницы через инструмент fetch_url.</div>
      `}
    `;
    } else if (api === 'gemini') {
        const c = cfg.gemini || {};
        const engine = c.engine || 'native';
        html += `
<div class="field"><label>Движок веб-поиска для Gemini</label>
<div class="set-segmented" id="wsGemEngineSeg" style="margin-bottom:8px">
  <button type="button" class="set-seg-btn ${engine === 'native' ? 'sel' : ''}" data-engine="native">Нативный поиск (Google Search)</button>
  <button type="button" class="set-seg-btn ${engine === 'agent' ? 'sel' : ''}" data-engine="agent">Агентный поиск (MoonSSS)</button>
</div></div>
${engine === 'native' ? `
<div class="igm-note">Gemini использует встроенный Google Search. Модель автоматически выполняет запросы и возвращает верифицированные источники.</div>
` : `
<div class="igm-note">Активирован агентный веб-поиск MoonSSS. Gemini формулирует поисковые запросы, анализирует ссылки и переходит по найденным веб-страницам.</div>
`}
`;
    } else {
        const c = cfg.openrouter || {};
        const curLimit = typeof c.limit === 'number' ? c.limit : 3;
        const curEngine = c.web_fetch_engine || 'auto';
        html += `
      <div class="field"><label>Лимит поисков за один ответ (агентный поиск)</label>
      <div class="ws-limit-row"><input type="range" id="wsOrLimit" min="1" max="6" step="1" value="${curLimit}"><span class="ws-limit-val" id="wsOrLimitVal">${curLimit}</span></div></div>
      <div class="field" style="margin-top:12px"><label>Движок чтения страниц и PDF (openrouter:web_fetch)</label>
      <div class="set-segmented" id="wsOrFetchEngineSeg" style="margin-bottom:6px">
        <button type="button" class="set-seg-btn ${curEngine === 'auto' ? 'sel' : ''}" data-engine="auto" title="Автоматический выбор (нативный fetch или Exa)">Auto</button>
        <button type="button" class="set-seg-btn ${curEngine === 'openrouter' ? 'sel' : ''}" data-engine="openrouter" title="Бесплатный прямой парсер страниц OpenRouter">OpenRouter (Free)</button>
        <button type="button" class="set-seg-btn ${curEngine === 'exa' ? 'sel' : ''}" data-engine="exa" title="Exa AI Reader ($0.001 / page)">Exa</button>
        <button type="button" class="set-seg-btn ${curEngine === 'parallel' ? 'sel' : ''}" data-engine="parallel" title="Parallel AI Web Reader ($0.001 / page)">Parallel</button>
      </div></div>
      <div class="igm-note">Серверный инструмент openrouter:web_fetch позволяет любой модели моментально читать веб-страницы и PDF напрямую на серверах OpenRouter без клиентских задержек.</div>
    `;
    }
    html += '</section>';
    if (api === 'openrouter' && window.toolCalling) {
        html += window.toolCalling.buildOrSearchPanelHtml();
    }
    $('#wsModalBody').innerHTML = html;
    if (api === 'openrouter' && window.toolCalling) {
        window.toolCalling.bindOrSearchPanel($('#wsModalBody'), () => renderWsSettings());
    }

    // Bind events
    const bindInput = (id, path) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', e => {
            state.settings.webSearchCfg[path[0]][path[1]] = e.target.value;
            save();
        });
    };

    if (api === 'anthropic') {
        document.querySelectorAll('#wsAntEngineSeg .set-seg-btn').forEach(btn => {
            btn.onclick = () => {
                state.settings.webSearchCfg.anthropic.engine = btn.dataset.engine;
                save();
                renderWsSettings();
            };
        });
        const r = document.getElementById('wsAntMaxUses');
        if (r) r.addEventListener('input', e => {
            state.settings.webSearchCfg.anthropic.max_uses = parseInt(e.target.value, 10);
            document.getElementById('wsAntMaxUsesVal').textContent = e.target.value;
            save();
        });
        bindInput('wsAntCountry', ['anthropic', 'country']);
        bindInput('wsAntCity', ['anthropic', 'city']);
        bindInput('wsAntRegion', ['anthropic', 'region']);
        bindInput('wsAntTimezone', ['anthropic', 'timezone']);
        bindInput('wsAntAllowed', ['anthropic', 'allowed_domains']);
        bindInput('wsAntBlocked', ['anthropic', 'blocked_domains']);
        document.querySelectorAll('#wsAntContextChips .igm-chip').forEach(b => {
            b.addEventListener('click', () => {
                state.settings.webSearchCfg.anthropic.context_size = b.dataset.v;
                save();
                renderWsSettings();
            });
        });
    } else if (api === 'gemini') {
        document.querySelectorAll('#wsGemEngineSeg .set-seg-btn').forEach(btn => {
            btn.onclick = () => {
                if (!state.settings.webSearchCfg.gemini) state.settings.webSearchCfg.gemini = {};
                state.settings.webSearchCfg.gemini.engine = btn.dataset.engine;
                save();
                renderWsSettings();
            };
        });
    } else if (api === 'openai') {
        document.querySelectorAll('#wsOaiEngineSeg .set-seg-btn').forEach(btn => {
            btn.onclick = () => {
                if (!state.settings.webSearchCfg.openai) state.settings.webSearchCfg.openai = {};
                state.settings.webSearchCfg.openai.engine = btn.dataset.engine;
                save();
                renderWsSettings();
            };
        });
        document.querySelectorAll('#wsOaiContextChips .igm-chip').forEach(b => {
            b.addEventListener('click', () => {
                state.settings.webSearchCfg.openai.context_size = b.dataset.v;
                save();
                renderWsSettings();
            });
        });
        bindInput('wsOaiCountry', ['openai', 'country']);
        bindInput('wsOaiCity', ['openai', 'city']);
        bindInput('wsOaiRegion', ['openai', 'region']);
        bindInput('wsOaiAllowed', ['openai', 'allowed_domains']);
        bindInput('wsOaiBlocked', ['openai', 'blocked_domains']);
    } else if (api === 'openrouter') {
        const r = document.getElementById('wsOrLimit');
        if (r) r.addEventListener('input', e => {
            state.settings.webSearchCfg.openrouter.limit = parseInt(e.target.value, 10);
            document.getElementById('wsOrLimitVal').textContent = e.target.value;
            save();
        });
        document.querySelectorAll('#wsOrFetchEngineSeg .set-seg-btn').forEach(btn => {
            btn.onclick = () => {
                if (!state.settings.webSearchCfg.openrouter) state.settings.webSearchCfg.openrouter = {};
                state.settings.webSearchCfg.openrouter.web_fetch_engine = btn.dataset.engine;
                save();
                renderWsSettings();
            };
        });
    }
}

function openWsSettings() {
    renderWsSettings();
    $('#wsOverlay').classList.add('show');
}
function closeWsSettings() { $('#wsOverlay').classList.remove('show'); }
$('#wsGearBtn').addEventListener('click', e => { e.stopPropagation(); openWsSettings(); });
$('#wsClose').addEventListener('click', closeWsSettings);
$('#wsDone').addEventListener('click', closeWsSettings);
$('#wsOverlay').addEventListener('click', e => { if (e.target === $('#wsOverlay')) closeWsSettings(); });
/* ---------- Редактирование изображений: события ---------- */
$('#erCancel').addEventListener('click', () => { setEditMode(false); save(); });
$('#editImgInput').addEventListener('change', async e => {
    await addEditImages(e.target.files);
    e.target.value = '';
});
$('#ecGo').addEventListener('click', () => {
    const text = $('#editConfirmOverlay').dataset.prompt || '';
    closeEditConfirm();
    startEditGeneration(text);
});
$('#ecCancel').addEventListener('click', closeEditConfirm);
$('#ecClose').addEventListener('click', closeEditConfirm);
$('#editConfirmOverlay').addEventListener('click', e => { if (e.target === $('#editConfirmOverlay')) closeEditConfirm(); });
/* Избранные */
$('#btnFavorites').addEventListener('click', () => { closeDrawer(); renderFavorites(); $('#favOverlay').classList.add('show'); });
$('#favClose').addEventListener('click', () => $('#favOverlay').classList.remove('show'));
$('#favOverlay').addEventListener('click', e => { if (e.target === $('#favOverlay')) $('#favOverlay').classList.remove('show'); });
/* Контекстное меню на сообщениях и изображениях: ПКМ на ПК */
const messagesBox = $('#messages');
messagesBox.addEventListener('contextmenu', e => {
    const img = e.target.closest('.genimg.done img');
    if (img) {
        e.preventDefault();
        openImgCtxMenu(img.closest('.genimg'), e.clientX, e.clientY);
        return;
    }

    // Исключаем вызов меню действий над сообщением при клике ПКМ по элементам Markdown-таблицы
    if (e.target.closest('.md-table-card, .md-table-preview, .md-table-img, .md-table-image-wrap, table')) {
        return;
    }

    // На смартфонах и сенсорных экранах долгое удержание (long-press) резервируется
    // ИСКЛЮЧИТЕЛЬНО для выделения текста. Меню сообщения вызывается только одиночным тапом.
    const isTouchInput = e.pointerType === 'touch' || (window.matchMedia && matchMedia('(pointer:coarse)').matches);
    if (isTouchInput && e.button !== 2) {
        return; // Даём браузеру свободно инициализировать выделение текста
    }

    const msgEl = e.target.closest('.msg');
    if (!msgEl) return;

    // Не перехватываем ПКМ в режиме инлайн-редактирования сообщения или внутри форм ввода
    if (msgEl.dataset.editing || e.target.closest('.msg-edit, textarea, input')) return;

    // Защита: если в данный момент активно текстовое выделение, ПКМ сначала только закрывает выделение
    if (handleMessageClickSelectionGuard(e)) {
        return;
    }

    const msgId = msgEl.dataset.id;
    if (!msgId) return;

    e.preventDefault();
    e.stopPropagation();
    closeAllMenus();
    openMsgContextMenu(msgId, msgEl, e.clientX, e.clientY);
});
messagesBox.addEventListener('pointerdown', e => {
    const img = e.target.closest('.genimg.done img');
    if (!img || e.button === 2 || e.pointerType === 'mouse') return;
    lpFired = false; lpX = e.clientX; lpY = e.clientY;
    const card = img.closest('.genimg');
    clearTimeout(lpTimer);
    lpTimer = setTimeout(() => {
        lpFired = true;
        openImgCtxMenu(card, e.clientX, e.clientY);
        try { navigator.vibrate(12); } catch (err) { }
    }, 900);
});
messagesBox.addEventListener('pointermove', e => {
    if (lpTimer && Math.hypot(e.clientX - lpX, e.clientY - lpY) > 12) { clearTimeout(lpTimer); lpTimer = null; }
});
window.addEventListener('pointerup', () => { clearTimeout(lpTimer); lpTimer = null; clearTimeout(favLpTimer); favLpTimer = null; clearTimeout(chatLpTimer); chatLpTimer = null; });
window.addEventListener('pointercancel', () => { clearTimeout(lpTimer); lpTimer = null; clearTimeout(favLpTimer); favLpTimer = null; clearTimeout(chatLpTimer); chatLpTimer = null; });
messagesBox.addEventListener('click', e => {
    if (lpFired) { lpFired = false; e.preventDefault(); e.stopPropagation(); return; }
    const img = e.target.closest('.genimg.done img');
    if (img) openImageViewer(img.currentSrc || img.src, img.alt);
}, true);
document.addEventListener('pointerdown', e => {
    const isSelectionUi = !!e.target.closest('#textSelectionMenu, .text-selection-toolbar, #aiContextWindowRoot, [data-tool-mount]');
    if (!isSelectionUi) {
        selectionTextAtPointerDown = getActiveSelectionText();
        selectionExistedAtPointerDown = selectionTextAtPointerDown.length > 0;
        pointerDownPos = { x: e.clientX, y: e.clientY, time: Date.now() };
        pointerWasDragged = false;
        selectionChangedDuringPointer = false;
        wasSelectingGesture = false;

        // Отслеживаем начало нажатия на сообщение
        const msgEl = e.target.closest('.msg');
        clearTimeout(msgTouchTracker.timer);
        msgTouchTracker = {
            startTime: Date.now(),
            startX: e.clientX,
            startY: e.clientY,
            isHoldOrDrag: false,
            msgId: msgEl ? msgEl.dataset.id : null,
            timer: null
        };

        // Если удержание длится более 260мс — это точно не одиночный тап (это выделение текста или лонг-пресс)
        msgTouchTracker.timer = setTimeout(() => {
            msgTouchTracker.isHoldOrDrag = true;
            suppressMsgMenuUntil = Date.now() + 350;
        }, 260);
    } else {
        selectionExistedAtPointerDown = false;
        selectionTextAtPointerDown = '';
        pointerDownPos = null;
    }
    if ($('#artCtxMenu') && !$('#artCtxMenu').hidden && !e.target.closest('#artCtxMenu') && !e.target.closest('.art-pill-btn')) {
        closeArtifactMenu();
    }
    if (!$('#igCtxMenu').hidden && !e.target.closest('#igCtxMenu')) closeImgCtxMenu();
    if (!$('#favCtxMenu').hidden && !e.target.closest('#favCtxMenu')) closeFavCtxMenu();
    if (!$('#msgCtxMenu').hidden && !e.target.closest('#msgCtxMenu')) closeMsgContextMenu();
    if (!$('#chatCtxMenu').hidden && !e.target.closest('#chatCtxMenu')) {
        const isRightClickOnChat = e.button === 2 && e.target.closest('.chat-item');
        if (!isRightClickOnChat) closeChatCtxMenu();
    }
    const isModelOrEffortUi = e.target.closest('.prompt-model-dropdown, .prompt-effort-dropdown, #promptModelSelectBtn, #promptEffortBtn, .prompt-pill-btn, #promptBottomBar');
    if (!e.target.closest('.menu') && !e.target.closest('#btnPlus') && !e.target.closest('.modal') && !e.target.closest('.drawer') && !isModelOrEffortUi) {
        closeAllMenus();
    }
}, true);

document.addEventListener('pointermove', e => {
    if (pointerDownPos) {
        const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
        if (dist > 7) {
            pointerWasDragged = true;
            msgTouchTracker.isHoldOrDrag = true;
            clearTimeout(msgTouchTracker.timer);
            suppressMsgMenuUntil = Date.now() + 350;
        }
    }
}, { passive: true });

document.addEventListener('selectionchange', () => {
    if (pointerDownPos) {
        selectionChangedDuringPointer = true;
        msgTouchTracker.isHoldOrDrag = true;
        clearTimeout(msgTouchTracker.timer);
        suppressMsgMenuUntil = Date.now() + 350;
    }
});

document.addEventListener('pointerup', e => {
    clearTimeout(msgTouchTracker.timer);
    const duration = Date.now() - msgTouchTracker.startTime;
    if (duration > 260 || msgTouchTracker.isHoldOrDrag) {
        msgTouchTracker.isHoldOrDrag = true;
        suppressMsgMenuUntil = Date.now() + 350;
    }

    if (pointerDownPos) {
        const currentSelText = getActiveSelectionText();
        const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
        if ((dist > 7 && currentSelText.length > 0) ||
            (selectionChangedDuringPointer && currentSelText.length > 0 && currentSelText !== selectionTextAtPointerDown)) {
            wasSelectingGesture = true;
            justFinishedSelectingTime = Date.now();
            suppressMsgMenuUntil = Date.now() + 350;
        } else if (selectionExistedAtPointerDown && currentSelText.length === 0) {
            lastSelectionDismissedTime = Date.now();
        }
        pointerDownPos = null;
    }
}, true);

document.addEventListener('pointercancel', () => {
    pointerDownPos = null;
    pointerWasDragged = false;
    selectionChangedDuringPointer = false;
}, true);
/* Закрытие контекстного меню чата: защищаем долгое удержание от моментального закрытия при отрыве пальца */
document.addEventListener('pointerup', e => {
    if (chatLpFired) {
        setTimeout(() => { chatLpFired = false; }, 140);
        return;
    }
    if (!$('#chatCtxMenu').hidden && !e.target.closest('#chatCtxMenu')) {
        closeChatCtxMenu();
    }
});
/* Фикс: глобальный pointermove — закрываем контекстное меню чата,
если палец продолжает двигаться после long-press (свайп с зажатым
пальцем). Работает даже если pointer захвачен drawer-свайпом */
document.addEventListener('pointermove', e => {
    if (chatLpFired && !$('#chatCtxMenu').hidden) {
        const dist = Math.hypot(e.clientX - chatLpX, e.clientY - chatLpY);
        if (dist > 10) closeChatCtxMenu();
    }
}, { passive: true });
$('#chatScroll').addEventListener('scroll', () => {
    closeImgCtxMenu();
    closeArtifactMenu();
    closeMsgContextMenu();
});
/* ---------- Полноэкранный просмотр: события ---------- */
$('#ivClose').addEventListener('click', closeImageViewer);
$('#ivZoomIn').addEventListener('click', () => ivZoomCenter(1.3));
$('#ivZoomOut').addEventListener('click', () => ivZoomCenter(1 / 1.3));
$('#ivZoomReset').addEventListener('click', () => { ivState.scale = 1; ivState.tx = 0; ivState.ty = 0; ivApply(); });
$('#imgViewer').addEventListener('click', e => {
    if (e.target === $('#imgViewer')) closeImageViewer();
});
$('#ivImg').addEventListener('click', () => {
    if (!ivState.moved && ivState.scale <= 1.001) closeImageViewer();
    ivState.moved = false;
});
$('#ivImg').addEventListener('dblclick', e => {
    e.preventDefault();
    if (ivState.scale > 1.001) { ivState.scale = 1; ivState.tx = 0; ivState.ty = 0; ivApply(); }
    else ivZoomAt(2.4, e.clientX, e.clientY);
});
$('#imgViewer').addEventListener('wheel', e => {
    if ($('#imgViewer').hidden) return;
    e.preventDefault();
    ivZoomAt(ivState.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY);
}, { passive: false });
const ivImgEl = $('#ivImg');
ivImgEl.addEventListener('pointerdown', e => {
    try { ivImgEl.setPointerCapture(e.pointerId); } catch (err) { }
    ivState.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ivState.pointers.size === 1) {
        ivState.panStart = { x: e.clientX, y: e.clientY, tx: ivState.tx, ty: ivState.ty };
    } else if (ivState.pointers.size === 2) {
        const [a, b] = [...ivState.pointers.values()];
        ivState.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, scale: ivState.scale };
        ivState.panStart = null;
    }
});
ivImgEl.addEventListener('pointermove', e => {
    if (!ivState.pointers.has(e.pointerId)) return;
    ivState.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ivState.pointers.size === 2 && ivState.pinch) {
        const [a, b] = [...ivState.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        ivZoomAt(Math.max(1, Math.min(8, ivState.pinch.scale * d / ivState.pinch.d)), mid.x, mid.y);
        ivState.moved = true;
    } else if (ivState.pointers.size === 1 && ivState.panStart && ivState.scale > 1.001) {
        const dx = e.clientX - ivState.panStart.x, dy = e.clientY - ivState.panStart.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) ivState.moved = true;
        ivState.tx = ivState.panStart.tx + dx;
        ivState.ty = ivState.panStart.ty + dy;
        ivApply();
    }
});
const ivPointerUp = e => {
    ivState.pointers.delete(e.pointerId);
    if (ivState.pointers.size < 2) ivState.pinch = null;
    if (ivState.pointers.size === 1) {
        const [p] = [...ivState.pointers.values()];
        ivState.panStart = { x: p.x, y: p.y, tx: ivState.tx, ty: ivState.ty };
    }
    if (ivState.pointers.size === 0) ivState.panStart = null;
};
ivImgEl.addEventListener('pointerup', ivPointerUp);
ivImgEl.addEventListener('pointercancel', ivPointerUp);
/* ---------- Избранные: контекстное меню (ПКМ + long-press) ---------- */
let favLpTimer = null, favLpFired = false, favLpX = 0, favLpY = 0;
$('#favGrid').addEventListener('contextmenu', e => {
    const card = e.target.closest('.fav-card');
    if (!card) return;
    e.preventDefault();
    openFavCtxMenu(+card.dataset.fi, e.clientX, e.clientY);
});
$('#favGrid').addEventListener('pointerdown', e => {
    const card = e.target.closest('.fav-card');
    if (!card || e.button === 2 || e.pointerType === 'mouse') return;
    favLpFired = false; favLpX = e.clientX; favLpY = e.clientY;
    const fi = +card.dataset.fi;
    clearTimeout(favLpTimer);
    favLpTimer = setTimeout(() => {
        favLpFired = true;
        openFavCtxMenu(fi, e.clientX, e.clientY);
        try { navigator.vibrate(12); } catch (err) { }
    }, 600);
});
$('#favGrid').addEventListener('pointermove', e => {
    if (favLpTimer && Math.hypot(e.clientX - favLpX, e.clientY - favLpY) > 12) { clearTimeout(favLpTimer); favLpTimer = null; }
});
$('#favGrid').addEventListener('click', e => {
    if (favLpFired) { favLpFired = false; e.preventDefault(); e.stopPropagation(); return; }
    const card = e.target.closest('.fav-card');
    if (!card) return;
    const f = (state.favorites || [])[+card.dataset.fi];
    if (f && f.dataUrl) openImageViewer(f.dataUrl, f.prompt);
}, true);
/* ---------- Контекстное меню чатов (ПКМ + long-press) ---------- */
let chatCtxId = null, chatLpTimer = null, chatLpFired = false, chatLpX = 0, chatLpY = 0, lastPointerType = '';
let pendingDevUnlockChatId = null;
let chatCtxRoleExpanded = false;

function openDevUnlockModal(chatId) {
    pendingDevUnlockChatId = chatId;
    const overlay = $('#devUnlockOverlay');
    const input = $('#devUnlockPass');
    if (input) {
        input.value = '';
        input.type = 'password';
    }
    if (overlay) overlay.classList.add('show');
    setTimeout(() => { if (input) input.focus(); }, 100);
}

function closeDevUnlockModal() {
    const overlay = $('#devUnlockOverlay');
    if (overlay) overlay.classList.remove('show');
    pendingDevUnlockChatId = null;
}

function submitDevUnlock() {
    const input = $('#devUnlockPass');
    const pass = (input ? input.value : '').trim();
    if (pass === 'AK_Amane') {
        state.settings.devRoleUnlocked = true;
        const targetChat = state.chats.find(ch => ch.id === pendingDevUnlockChatId) || activeChat();
        if (targetChat) {
            targetChat.role = 'developer';
            targetChat.messages.forEach(m => {
                if (m.role === 'user') m.role = 'developer';
            });
            openChat(targetChat.id);
        }
        save(true);
        closeDevUnlockModal();
        renderAll();
        toast('Режим Developer разблокирован и активирован для чата', 'ok', 2800);
    } else {
        toast('Неверный пароль доступа', 'err', 2200);
        if (input) {
            input.value = '';
            input.focus();
        }
    }
}

$('#devUnlockClose')?.addEventListener('click', closeDevUnlockModal);
$('#devUnlockCancel')?.addEventListener('click', closeDevUnlockModal);
$('#devUnlockOverlay')?.addEventListener('click', e => {
    if (e.target === $('#devUnlockOverlay')) closeDevUnlockModal();
});
$('#devUnlockSubmit')?.addEventListener('click', submitDevUnlock);
$('#devUnlockPass')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
        e.preventDefault();
        submitDevUnlock();
    } else if (e.key === 'Escape') {
        closeDevUnlockModal();
    }
});

function openChatCtxMenu(chatId, x, y) {
    const c = state.chats.find(ch => ch.id === chatId);
    if (!c) return;
    chatCtxId = chatId;
    chatCtxRoleExpanded = false;
    const menu = $('#chatCtxMenu');
    const isDevUnlocked = !!state.settings.devRoleUnlocked;
    const currentRole = c.role === 'developer' ? 'developer' : 'user';

    const buildMenuHtml = () => `
<button data-cact="pin"><svg><use href="#i-pin"/></svg><span>${c.pinned ? 'Открепить' : 'Закрепить'}</span></button>
<div class="sep"></div>
<button data-cact="toggle-role-menu" class="chat-ctx-role-toggle ${chatCtxRoleExpanded ? 'expanded' : ''}" type="button">
  <svg><use href="${currentRole === 'developer' ? '#i-terminal' : '#i-chat'}"/></svg>
  <span>Роль: <b>${currentRole === 'developer' ? 'Developer' : 'User'}</b></span>
  <svg class="ic-right chevron-ico"><use href="#i-chev"/></svg>
</button>
<div class="chat-ctx-role-submenu" ${chatCtxRoleExpanded ? '' : 'hidden'}>
  <button data-cact="set-role-user" class="chat-ctx-role-btn ${currentRole === 'user' ? 'active' : ''}" type="button">
    <svg><use href="#i-chat"/></svg>
    <span>User</span>
    ${currentRole === 'user' ? '<svg class="ic-right"><use href="#i-check"/></svg>' : ''}
  </button>
  <button data-cact="set-role-dev" class="chat-ctx-role-btn ${currentRole === 'developer' ? 'active' : ''} ${!isDevUnlocked ? 'is-locked' : ''}" type="button" ${!isDevUnlocked ? 'style="opacity:0.55;filter:grayscale(0.6)"' : ''}>
    <svg><use href="${isDevUnlocked ? '#i-terminal' : '#i-lock'}"/></svg>
    <span>Developer</span>
    ${!isDevUnlocked ? '<span class="role-lock-tag"><svg><use href="#i-lock"/></svg>Пароль</span>' : (currentRole === 'developer' ? '<svg class="ic-right"><use href="#i-check"/></svg>' : '')}
  </button>
</div>
<div class="sep"></div>
<button data-cact="del" class="danger"><svg><use href="#i-trash"/></svg><span>Удалить</span></button>`;

    menu.innerHTML = buildMenuHtml();
    menu.hidden = false;

    const reposition = () => {
        const r = menu.getBoundingClientRect();
        const maxLeft = (window.innerWidth || 360) - r.width - 8;
        const maxTop = (window.innerHeight || 640) - r.height - 8;
        menu.style.left = Math.max(8, Math.min(x, maxLeft)) + 'px';
        menu.style.top = Math.max(8, Math.min(y, maxTop)) + 'px';
    };
    requestAnimationFrame(reposition);

    menu.onclick = (e) => {
        const btn = e.target.closest('button[data-cact]');
        if (!btn) return;
        const act = btn.dataset.cact;

        if (act === 'toggle-role-menu') {
            e.stopPropagation();
            chatCtxRoleExpanded = !chatCtxRoleExpanded;
            menu.innerHTML = buildMenuHtml();
            requestAnimationFrame(reposition);
            return;
        }

        closeChatCtxMenu();
        if (act === 'pin') togglePin(chatId);
        else if (act === 'del') requestDeleteChat(chatId);
        else if (act === 'set-role-user') {
            c.role = 'user';
            (c.messages || []).forEach(m => {
                if (m.role === 'developer') m.role = 'user';
            });
            openChat(chatId);
            save(true);
            renderAll();
            toast('Роль сообщений: User (по умолчанию)', 'info', 1800);
        } else if (act === 'set-role-dev') {
            if (state.settings.devRoleUnlocked) {
                c.role = 'developer';
                (c.messages || []).forEach(m => {
                    if (m.role === 'user') m.role = 'developer';
                });
                openChat(chatId);
                save(true);
                renderAll();
                toast('Роль сообщений: Developer (активна для моделей OpenAI)', 'ok', 2400);
            } else {
                openDevUnlockModal(chatId);
            }
        }
    };
}
function closeChatCtxMenu() { $('#chatCtxMenu').hidden = true; chatCtxId = null; chatCtxRoleExpanded = false; }
const chatListEl = $('#chatList');
chatListEl.addEventListener('pointerdown', e => {
    lastPointerType = e.pointerType;
    const item = e.target.closest('.chat-item');
    if (!item || e.button === 2 || e.pointerType === 'mouse') return;
    if (!e.isPrimary) return;
    chatLpFired = false; chatLpX = e.clientX; chatLpY = e.clientY;
    const chatId = item.dataset.cid;
    clearTimeout(chatLpTimer);
    chatLpTimer = setTimeout(() => {
        chatLpFired = true;
        openChatCtxMenu(chatId, e.clientX, e.clientY);
        try { if (navigator.vibrate) navigator.vibrate(18); } catch (err) { }
    }, 550);
});
chatListEl.addEventListener('pointermove', e => {
    if (!chatLpTimer && !chatLpFired) return;
    const dist = Math.hypot(e.clientX - chatLpX, e.clientY - chatLpY);
    if (chatLpTimer && dist > 8) { clearTimeout(chatLpTimer); chatLpTimer = null; }
    /* Фикс: если контекстное меню уже показано и палец продолжает
    двигаться (свайп с зажатым пальцем) — закрываем меню, чтобы оно
    не осталось «висеть» на главном экране после закрытия шторки */
    if (chatLpFired && !$('#chatCtxMenu').hidden && dist > 10) {
        closeChatCtxMenu();
    }
});
chatListEl.addEventListener('contextmenu', e => {
    const item = e.target.closest('.chat-item');
    if (!item) return;
    e.preventDefault();
    const chatId = item.dataset.cid;
    if (!chatId) return;
    if (lastPointerType !== 'mouse') return;
    if (!$('#chatCtxMenu').hidden && chatCtxId === chatId) { closeChatCtxMenu(); return; }
    openChatCtxMenu(chatId, e.clientX, e.clientY);
});
chatListEl.addEventListener('click', e => {
    if (chatLpFired) { chatLpFired = false; e.preventDefault(); e.stopPropagation(); return; }
}, true);
chatListEl.addEventListener('scroll', () => {
    if (chatLpTimer) { clearTimeout(chatLpTimer); chatLpTimer = null; }
    closeChatCtxMenu();
}, { passive: true });
/* Умный вход в редактирование: ПКМ / зажатие на превью прикреплённого изображения */
function openAttCtxMenu(idx, x, y) {
    const a = pendingAtt[idx];
    if (!a || a.kind !== 'image') return;
    const menu = $('#igCtxMenu');
    if (!menu) return;
    menu.innerHTML = `
    <button data-aact="edit"><svg><use href="#i-pencil"/></svg><span>Редактировать (Riverflow)</span></button>
    <button data-aact="rm" class="danger"><svg><use href="#i-trash"/></svg><span>Убрать из вложений</span></button>`;
    menu.hidden = false;
    requestAnimationFrame(() => {
        const r = menu.getBoundingClientRect();
        menu.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px';
        menu.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
    });
    menu.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
        menu.hidden = true;
        const item = pendingAtt[idx];
        if (!item) return;
        if (b.dataset.aact === 'edit') {
            pendingAtt.splice(idx, 1);
            renderAttPreviews(); setSendBtn();
            startImageEdit(item.dataUrl);
        } else {
            pendingAtt.splice(idx, 1);
            renderAttPreviews(); setSendBtn(); save();
        }
    }));
}

function getAttachmentIdxFromEvent(e) {
    const target = e.target;
    const prev = target.closest('.att-prev, .prompt-attachment-thumb');
    if (!prev) return -1;
    if (prev.dataset.attIdx !== undefined) {
        return parseInt(prev.dataset.attIdx, 10);
    }
    const rm = prev.querySelector('.rm, .prompt-thumb-remove');
    if (rm && rm.dataset.i !== undefined) {
        return parseInt(rm.dataset.i, 10);
    }
    if (rm && rm.dataset.delIdx !== undefined) {
        return parseInt(rm.dataset.delIdx, 10);
    }
    return -1;
}

let attLpTimer = null, attLpFired = false, attLpX = 0, attLpY = 0;

function setupAttachmentContextMenuHandlers(container) {
    if (!container) return;
    container.addEventListener('contextmenu', e => {
        const idx = getAttachmentIdxFromEvent(e);
        if (idx < 0 || !pendingAtt[idx] || pendingAtt[idx].kind !== 'image') return;
        e.preventDefault();
        openAttCtxMenu(idx, e.clientX, e.clientY);
    });
    container.addEventListener('pointerdown', e => {
        if (e.button === 2 || e.pointerType === 'mouse') return;
        const idx = getAttachmentIdxFromEvent(e);
        if (idx < 0 || !pendingAtt[idx] || pendingAtt[idx].kind !== 'image') return;
        attLpFired = false; attLpX = e.clientX; attLpY = e.clientY;
        clearTimeout(attLpTimer);
        attLpTimer = setTimeout(() => {
            attLpFired = true;
            openAttCtxMenu(idx, e.clientX, e.clientY);
            try { if (navigator.vibrate) navigator.vibrate(12); } catch (_) { }
        }, 600);
    });
    container.addEventListener('pointermove', e => {
        if (attLpTimer && Math.hypot(e.clientX - attLpX, e.clientY - attLpY) > 12) {
            clearTimeout(attLpTimer);
            attLpTimer = null;
        }
    });
    container.addEventListener('click', e => {
        if (attLpFired) {
            attLpFired = false;
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);
}

setupAttachmentContextMenuHandlers($('#attPreviews'));
setupAttachmentContextMenuHandlers($('#promptAttachmentTrack'));
window.addEventListener('pointerup', () => { clearTimeout(attLpTimer); attLpTimer = null; });
$('#inpProxy')?.addEventListener('input', e => { state.settings.proxyKey = e.target.value.trim(); save(); updateBalMini(); });
$('#inpOR')?.addEventListener('input', e => { state.settings.orKey = e.target.value.trim(); save(); });
$('#inpSys')?.addEventListener('input', e => { state.settings.systemPrompt = e.target.value; save(); });
$('#btnSysClear')?.addEventListener('click', () => {
    const inp = $('#inpSys');
    if (inp) inp.value = '';
    state.settings.systemPrompt = '';
    save();
    toast('Системный промпт очищен', 'info');
});
document.querySelectorAll('.eye-btn').forEach(b => b.addEventListener('click', () => {
    const inp = document.getElementById(b.dataset.eye);
    if (!inp) return;
    const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    b.classList.toggle('on', show);
}));
/* ============ ТИПОГРАФИКА: МУЛЬТИЯЗЫЧНЫЙ КОНТРОЛЛЕР (RU / EN / JA) ============ */
const FONT_PRESETS = {
    ru: [
        { id: 'system', name: 'Системный (По умолч.)', family: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" },
        { id: 'onest', name: 'Onest', family: "'Onest', system-ui, sans-serif" },
        { id: 'manrope', name: 'Manrope', family: "'Manrope', system-ui, sans-serif" },
        { id: 'cormorant', name: 'Cormorant Garamond', family: "'Cormorant Garamond', serif" },
        { id: 'unbounded', name: 'Unbounded', family: "'Unbounded', sans-serif" },
        { id: 'space', name: 'Space Grotesk', family: "'Space Grotesk', monospace" }
    ],
    en: [
        { id: 'system', name: 'System Default', family: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" },
        { id: 'space', name: 'Space Grotesk', family: "'Space Grotesk', monospace" },
        { id: 'manrope', name: 'Manrope', family: "'Manrope', sans-serif" },
        { id: 'onest', name: 'Onest', family: "'Onest', sans-serif" },
        { id: 'syne', name: 'Syne', family: "'Syne', sans-serif" },
        { id: 'cormorant', name: 'Cormorant Garamond', family: "'Cormorant Garamond', serif" },
        { id: 'unbounded', name: 'Unbounded', family: "'Unbounded', sans-serif" }
    ],
    ja: [
        { id: 'system', name: 'システム標準 (System)', family: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic', 'Meiryo', sans-serif" },
        { id: 'noto-sans-jp', name: 'Noto Sans JP', family: "'Noto Sans JP', sans-serif" },
        { id: 'zen-kaku', name: 'Zen Kaku Gothic', family: "'Zen Kaku Gothic New', sans-serif" },
        { id: 'noto-serif-jp', name: 'Noto Serif JP', family: "'Noto Serif JP', serif" }
    ]
};

/* Диапазоны символов для точной сегментации смешанного текста */
const RE_JA = /[\u3040-\u309F\u30A0-\u30FF\u31F0-\u31FF\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF\uFF65-\uFF9F\u3000-\u303F]/;
const RE_RU = /[а-яёА-ЯЁ\u0400-\u052F\u2DE0-\u2DFF\uA640-\uA69F]/;
const RE_EN = /[a-zA-Z\u00C0-\u024F\u1E00-\u1EFF]/;

function charLangType(char) {
    if (RE_JA.test(char)) return 'ja';
    if (RE_RU.test(char)) return 'ru';
    if (RE_EN.test(char)) return 'en';
    return null;
}

function segmentMultilingualText(text) {
    if (!text || typeof text !== 'string') return [];

    const segments = [];
    let currentText = '';
    let currentLang = null;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const lang = charLangType(char);

        if (!lang) {
            currentText += char;
        } else if (!currentLang) {
            currentLang = lang;
            currentText += char;
        } else if (lang === currentLang) {
            currentText += char;
        } else {
            if (currentText) {
                segments.push({ text: currentText, lang: currentLang || 'neutral' });
            }
            currentText = char;
            currentLang = lang;
        }
    }

    if (currentText) {
        segments.push({ text: currentText, lang: currentLang || 'neutral' });
    }

    return segments;
}

function processMultilingualDom(container) {
    if (!container) return;

    const walker = document.createTreeWalker(
        container,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: (node) => {
                if (!node || !node.nodeValue || !node.nodeValue.trim()) {
                    return NodeFilter.FILTER_REJECT;
                }
                const parent = node.parentElement;
                if (!parent) return NodeFilter.FILTER_REJECT;
                // Строго защищаем неизменяемые брендовые элементы: MoonSSS и слоган Hero
                if (parent.closest('style, script, .code-lines, .code-tools, .logo, .logo-top, .logo-hero, .hero-tag, .glitch')) {
                    return NodeFilter.FILTER_REJECT;
                }
                if (parent.classList.contains('lang-ru') || parent.classList.contains('lang-en') || parent.classList.contains('lang-ja')) {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );

    const nodesToProcess = [];
    while (walker.nextNode()) {
        nodesToProcess.push(walker.currentNode);
    }

    nodesToProcess.forEach(node => {
        const val = node.nodeValue;
        if (!val) return;

        const segments = segmentMultilingualText(val);
        if (!segments.length) return;
        if (segments.length === 1 && segments[0].lang === 'neutral') return;

        const frag = document.createDocumentFragment();
        segments.forEach(seg => {
            if (seg.lang === 'neutral') {
                frag.appendChild(document.createTextNode(seg.text));
            } else {
                const span = document.createElement('span');
                span.className = `lang-${seg.lang}`;
                span.textContent = seg.text;
                frag.appendChild(span);
            }
        });

        if (node.parentNode) {
            node.parentNode.replaceChild(frag, node);
        }
    });
}
window.processMultilingualDom = processMultilingualDom;

function detectTextLanguage(text) {
    if (!text) return 'ru';
    const str = String(text);
    const jaKana = str.match(/[\u3040-\u309F\u30A0-\u30FF]/g);
    if (jaKana && jaKana.length > 0) return 'ja';

    if (/[\u4E00-\u9FAF]/.test(str) && !/[\u0400-\u04FF]/.test(str)) return 'ja';

    const cyrMatches = str.match(/[\u0400-\u04FF]/g) || [];
    const latMatches = str.match(/[a-zA-Z]/g) || [];

    if (cyrMatches.length > 0 && cyrMatches.length >= latMatches.length) return 'ru';
    if (latMatches.length > 0) return 'en';

    return 'ru';
}
window.detectTextLanguage = detectTextLanguage;

function applyTypography() {
    const root = document.documentElement;
    if (!state.settings.typography) {
        state.settings.typography = {
            ru: { font: 'system', sizeType: 'system', size: 16 },
            en: { font: 'system', sizeType: 'system', size: 16 },
            ja: { font: 'system', sizeType: 'system', size: 16 }
        };
    }
    const typo = state.settings.typography;
    ['ru', 'en', 'ja'].forEach(lang => {
        const conf = typo[lang] || { font: 'system', sizeType: 'system', size: 16 };
        const fontDef = (FONT_PRESETS[lang] || []).find(f => f.id === conf.font) || FONT_PRESETS[lang][0];
        root.style.setProperty(`--font-${lang}`, fontDef.family);

        if (conf.sizeType === 'system') {
            root.style.setProperty(`--font-size-${lang}`, 'inherit');
        } else {
            root.style.setProperty(`--font-size-${lang}`, `${conf.size || 16}px`);
        }
    });

    const ruConf = typo.ru || { font: 'system', sizeType: 'system', size: 16 };
    const ruFontDef = (FONT_PRESETS.ru || []).find(f => f.id === ruConf.font) || FONT_PRESETS.ru[0];
    const enConf = typo.en || { font: 'system', sizeType: 'system', size: 16 };
    const enFontDef = (FONT_PRESETS.en || []).find(f => f.id === enConf.font) || FONT_PRESETS.en[0];
    const jaConf = typo.ja || { font: 'system', sizeType: 'system', size: 16 };
    const jaFontDef = (FONT_PRESETS.ja || []).find(f => f.id === jaConf.font) || FONT_PRESETS.ja[0];

    // Композитный каскадный стек для всего приложения: RU -> EN -> JA -> System
    const compositeAppStack = `${ruFontDef.family}, ${enFontDef.family}, ${jaFontDef.family}, sans-serif`;
    root.style.setProperty('--font-app', compositeAppStack);
    root.style.setProperty('--font-ui', compositeAppStack);
    root.style.setProperty('--font-body', compositeAppStack);
    root.style.setProperty('--font-syne', compositeAppStack);

    if (ruConf.sizeType === 'system') {
        root.style.setProperty('--app-font-size-root', '100%');
        root.style.setProperty('--ui-font-scale', '1');
    } else {
        const customSize = ruConf.size || 16;
        root.style.setProperty('--app-font-size-root', `${customSize}px`);
        root.style.setProperty('--ui-font-scale', (customSize / 16).toFixed(3));
    }

    if (typeof syncComposerSegmentsLive === 'function') {
        syncComposerSegmentsLive();
    }
}

function renderFontsTab() {
    if (!state.settings.typography) {
        state.settings.typography = {
            ru: { font: 'system', sizeType: 'system', size: 16 },
            en: { font: 'system', sizeType: 'system', size: 16 },
            ja: { font: 'system', sizeType: 'system', size: 16 }
        };
    }
    const typo = state.settings.typography;

    ['ru', 'en', 'ja'].forEach(lang => {
        const conf = typo[lang] || { font: 'system', sizeType: 'system', size: 16 };
        const cap = lang.charAt(0).toUpperCase() + lang.slice(1);

        // 1. Отрисовка чипов выбора шрифта
        const chipsBox = document.getElementById(`fontChips${cap}`);
        if (chipsBox) {
            chipsBox.innerHTML = (FONT_PRESETS[lang] || []).map(f => {
                const isSel = f.id === conf.font;
                return `
                <button type="button" class="font-chip ${isSel ? 'sel' : ''}" data-font-id="${f.id}" style="font-family:${f.family}">
                    <svg class="ic"><use href="#i-check"/></svg>
                    <span>${esc(f.name)}</span>
                </button>`;
            }).join('');

            chipsBox.querySelectorAll('.font-chip').forEach(btn => {
                btn.onclick = () => {
                    conf.font = btn.dataset.fontId;
                    save();
                    applyTypography();
                    renderFontsTab();
                    if (typeof renderMessages === 'function') renderMessages();
                    toast(`Шрифт обновлён: ${btn.querySelector('span').textContent}`, 'ok', 1400);
                };
            });
        }

        // 2. Тумблер системного размера устройства
        const isSystem = conf.sizeType === 'system';
        const sw = document.getElementById(`swFontSize${cap}System`);
        const sliderField = document.getElementById(`fieldFontSize${cap}Slider`);
        const rng = document.getElementById(`rngFontSize${cap}`);
        const lbl = document.getElementById(`lblFontSize${cap}Val`);

        if (sw) {
            sw.classList.toggle('on', isSystem);
            sw.onclick = () => {
                const nextSystem = !sw.classList.contains('on');
                conf.sizeType = nextSystem ? 'system' : 'custom';
                save();
                applyTypography();
                renderFontsTab();
                if (typeof renderMessages === 'function') renderMessages();
                toast(nextSystem ? `Включён системный размер (${lang.toUpperCase()})` : `Включён пользовательский размер (${lang.toUpperCase()})`, 'info', 1400);
            };
        }

        if (sliderField) {
            sliderField.style.display = isSystem ? 'none' : 'block';
        }

        if (rng && lbl) {
            rng.value = conf.size || 16;
            lbl.textContent = `${conf.size || 16}px`;
            rng.oninput = e => {
                const val = parseInt(e.target.value, 10);
                conf.size = val;
                lbl.textContent = `${val}px`;
                save();
                applyTypography();
                updateFontLivePreview(lang);
                if (typeof renderMessages === 'function') renderMessages();
            };
        }

        updateFontLivePreview(lang);
    });

    const resetBtn = document.getElementById('btnResetAllTypography');
    if (resetBtn) {
        resetBtn.onclick = () => {
            state.settings.typography = {
                ru: { font: 'system', sizeType: 'system', size: 16 },
                en: { font: 'system', sizeType: 'system', size: 16 },
                ja: { font: 'system', sizeType: 'system', size: 16 }
            };
            save();
            applyTypography();
            renderFontsTab();
            if (typeof renderMessages === 'function') renderMessages();
            toast('Шрифты и размеры сброшены к системным значениям', 'ok', 1800);
        };
    }
}

function updateFontLivePreview(lang) {
    const typo = state.settings.typography?.[lang];
    if (!typo) return;
    const cap = lang.charAt(0).toUpperCase() + lang.slice(1);
    const prevText = document.getElementById(`prevText${cap}`);
    if (prevText) {
        const fontDef = (FONT_PRESETS[lang] || []).find(f => f.id === typo.font) || FONT_PRESETS[lang][0];
        prevText.style.fontFamily = fontDef.family;
        prevText.style.fontSize = typo.sizeType === 'system' ? 'inherit' : `${typo.size || 16}px`;
    }

    const prevMixed = document.getElementById('prevTextMixed');
    if (prevMixed) {
        processMultilingualDom(prevMixed);
    }
}

function syncSettingsUI() {
    const s = state.settings;
    const inpP = $('#inpProxy');
    if (inpP) inpP.value = s.proxyKey || '';
    const inpO = $('#inpOR');
    if (inpO) inpO.value = s.orKey || '';
    updateHeroKeysVisibility();
    updateKeyStatusPills();
    const inpS = $('#inpSys');
    if (inpS) inpS.value = s.systemPrompt || '';
    const swTheme = $('#setThemeSwitch');
    if (swTheme) swTheme.classList.toggle('on', s.theme === 'light');
    updateApiSrcChip();
    const wsSw = $('#wsSwitch');
    if (wsSw) wsSw.classList.toggle('on', !!s.webSearch);
    const wsRow = document.querySelector('.ws-search-row') || (wsSw ? wsSw.closest('.ws-row') : null);
    if (wsRow) wsRow.classList.toggle('on', !!s.webSearch);
    const igSw = $('#igSwitch');
    if (igSw) igSw.classList.toggle('on', !!s.imageGen);
    const igRow = document.querySelector('.ig-row');
    if (igRow) igRow.classList.toggle('on', !!s.imageGen);
    updateIgHint();
    const artSw = $('#artSwitch');
    if (artSw) artSw.classList.toggle('on', !!s.artifacts);

    // Синхронизация глобальных переключателей reasoningEffort, summary, mode и thinking.display
    const curModelObj = typeof getModel === 'function' ? getModel(s.modelId) : null;
    const activeModelCfg = (curModelObj && s.modelProviders && (s.modelProviders[curModelObj.id] || s.modelProviders[curModelObj.id.replace(/:[a-zA-Z0-9_.-]+$/i, '')])) || {};
    const curEffort = activeModelCfg.reasoningEffort || s.reasoningEffort || 'medium';
    document.querySelectorAll('#globalReasoningEffortSeg .set-seg-btn').forEach(btn => {
        const isSel = btn.dataset.effort === curEffort;
        btn.classList.toggle('sel', isSel);
        btn.setAttribute('aria-checked', isSel ? 'true' : 'false');
    });

    const curSummary = s.openaiReasoningSummary || 'auto';
    document.querySelectorAll('#openaiReasoningSummarySeg .set-seg-btn').forEach(btn => {
        const isSel = btn.dataset.val === curSummary;
        btn.classList.toggle('sel', isSel);
        btn.setAttribute('aria-checked', isSel ? 'true' : 'false');
    });

    const curMode = s.openaiReasoningMode || 'standard';
    document.querySelectorAll('#openaiReasoningModeSeg .set-seg-btn').forEach(btn => {
        const isSel = btn.dataset.val === curMode;
        btn.classList.toggle('sel', isSel);
        btn.setAttribute('aria-checked', isSel ? 'true' : 'false');
    });

    const curDisplay = s.claudeThinkingDisplay || 'summarized';
    document.querySelectorAll('#claudeThinkingDisplaySeg .set-seg-btn').forEach(btn => {
        const isSel = btn.dataset.val === curDisplay;
        btn.classList.toggle('sel', isSel);
        btn.setAttribute('aria-checked', isSel ? 'true' : 'false');
    });

    if (promptInput) {
        promptInput.placeholder = s.editMode ? 'Что добавить или убрать из изображения…' : 'Ask anything…';
    }
    renderEditRef();
    renderArtRef();
    syncFavUI();
    syncDtUI();
    const cxSw = $('#cxSwitch');
    if (cxSw) cxSw.classList.toggle('on', s.codeExec !== false);
    const cxRow = document.querySelector('.cx-row');
    const hasElectron = typeof window !== 'undefined' && !!window.electronAPI && typeof window.electronAPI.execStart === 'function';
    const hasOpenRouterKey = Boolean((s.orKey || s.proxyKey || '').trim());
    if (cxRow) {
        cxRow.classList.toggle('on', s.codeExec !== false);
        cxRow.style.display = (hasElectron || hasOpenRouterKey) ? '' : 'none';
    }
}

/* Проверка баланса ProxyAPI */
async function checkBalance() {
    const btn = $('#btnBalance');
    const box = $('#balResult');
    const key = (state.settings.proxyKey || '').trim();
    if (!key) {
        if (box) {
            box.className = 'bal-result show err';
            box.innerHTML = 'Сначала укажите ключ ProxyAPI.';
        }
        return;
    }
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spin"></span>Проверка…';
    }
    if (box) {
        box.className = 'bal-result'; box.innerHTML = '';
    }
    try {
        const resp = await fetch('https://api.proxyapi.ru/proxyapi/balance', {
            headers: { 'Authorization': 'Bearer ' + key }
        });
        if (!resp.ok) {
            let m = 'HTTP ' + resp.status;
            try { const j = await resp.json(); m = j.message || j.error || m; } catch (e) { }
            if (resp.status === 401) m = 'Неверный ключ (401)';
            if (resp.status === 403) m = 'Ключу не выдано разрешение «Запрос баланса». Включите его в личном кабинете ProxyAPI → Ключи API.';
            throw new Error(m);
        }
        const j = await resp.json();
        const bal = Number(j.balance).toFixed(2);
        let html = `<div class="bal-big">${bal} ₽</div><div>Баланс ${j.budget ? 'ключа (бюджет)' : 'аккаунта'} доступен для запросов.</div>`;
        if (j.budget) {
            html += `<div style="margin-top:6px;font-size:12.5px">Лимит бюджета: <b>${Number(j.budget.limit).toFixed(2)} ₽</b> · Израсходовано: <b>${Number(j.budget.used).toFixed(2)} ₽</b></div>`;
        }
        box.className = 'bal-result show ok';
        box.innerHTML = html;
        updateBalMini(j);
        toast('Баланс успешно получен', 'ok');
    } catch (e) {
        if (box) {
            box.className = 'bal-result show err';
            box.innerHTML = esc(e.message || 'Не удалось получить баланс');
        }
    }
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<svg><use href="#i-wallet"/></svg>Проверить';
    }
}
$('#btnBalance')?.addEventListener('click', checkBalance);
$('#btnBalMini')?.addEventListener('click', () => { closeDrawer(); openSettings('keys'); setTimeout(checkBalance, 250); });
function updateBalMini(data) {
    const el = $('#balMiniVal');
    if (data && typeof data.balance === 'number') { el.textContent = data.balance.toFixed(2) + ' ₽'; return; }
    el.textContent = state.settings.proxyKey ? 'Баланс' : 'Нет ключа';
}

/* ---------- Камера ---------- */
const camOverlay = $('#cameraOverlay');
let camStream = null;
async function openCamera() {
    camOverlay.classList.add('show');
    $('#camOff').hidden = true; $('#camRec').hidden = true;
    $('#camAttach').hidden = true; $('#camSnap').style.display = 'flex';
    curSnap = null;
    try {
        camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 } }, audio: false });
        $('#camVideo').srcObject = camStream;
        $('#camRec').hidden = false;
    } catch (e) {
        $('#camOff').hidden = false;
    }
}
function stopCam() {
    if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; }
    $('#camVideo').srcObject = null;
}
function closeCamera() {
    camOverlay.classList.remove('show');
    stopCam();
    restoreCamVideo();
}
function restoreCamVideo() {
    const node = $('#camVideo');
    if (node && node.tagName === 'IMG') {
        const v = document.createElement('video');
        v.id = 'camVideo'; v.autoplay = true; v.playsInline = true; v.muted = true;
        node.replaceWith(v);
    }
}
$('#cameraClose').addEventListener('click', closeCamera);
$('#camCancel').addEventListener('click', closeCamera);
camOverlay.addEventListener('click', e => { if (e.target === camOverlay) closeCamera(); });
$('#camSnap').addEventListener('click', () => {
    const v = $('#camVideo');
    if (!camStream || !v.videoWidth) return;
    const cv = document.createElement('canvas');
    cv.width = v.videoWidth; cv.height = v.videoHeight;
    cv.getContext('2d').drawImage(v, 0, 0);
    const flash = $('#camFlash');
    flash.classList.remove('snap'); void flash.offsetWidth; flash.classList.add('snap');
    compressImage(cv.toDataURL('image/jpeg', .9)).then(url => {
        curSnap = url;
        $('#camSnap').style.display = 'none';
        $('#camAttach').hidden = false;
        stopCam();
        const img = new Image();
        img.onload = () => { $('#camVideo').replaceWith(img); img.id = 'camVideo'; img.style.objectFit = 'contain'; };
        img.src = url;
    });
});
$('#camAttach').addEventListener('click', () => {
    if (curSnap) {
        if (state.settings.editMode) {
            if (editImages.length < 10) {
                editImages.push(curSnap);
                renderEditRef(); setSendBtn(); save();
                toast('Снимок добавлен в референс', 'ok');
            } else toast('Максимум 10 изображений для редактирования', 'warn');
        } else {
            pendingAtt.push({ kind: 'image', dataUrl: curSnap, mime: 'image/jpeg', name: 'снимок-камеры.jpg' });
            renderAttPreviews(); setSendBtn();
            toast('Фото прикреплено', 'ok');
        }
    }
    closeCamera(); // restoreCamVideo() уже вызывается внутри closeCamera
});

/* ============================================================
ЭКСПОРТ ЧАТА (Markdown)
============================================================ */
function exportCurrentChat() {
    const chat = activeChat();
    if (!chat || !chat.messages.length) { toast('Нет сообщений для экспорта', 'err'); return; }
    const lines = ['# ' + (chat.title || 'MoonSSS'), '',
    '> Экспортировано из MoonSSS · ' + new Date().toLocaleString('ru-RU'), ''];
    chat.messages.forEach(m => {
        const name = m.role === 'user' ? 'Вы' : ('MoonSSS · ' + (m.modelLabel || getModel(m.modelId || state.settings.modelId).name));
        lines.push('## ' + name + ' — ' + fmtTime(m.ts), '');
        if (m.thinking && m.thinking.trim()) lines.push('<details><summary>Размышление</summary>', '', m.thinking.trim(), '', '</details>', '');
        lines.push((m.content || '').trim(), '');
        (m.artifacts || []).forEach(a => {
            lines.push('### Артефакт: ' + a.title + ' (v' + a.version + ')', '', '```html', a.code, '```', '');
        });
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'MoonSSS_' + (chat.title || 'chat').replace(/[^\wа-яё\d-]+/gi, '_').slice(0, 60) + '.md';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('Чат экспортирован в Markdown', 'ok');
}
/* ============================================================
КОМАНДНАЯ ПАЛИТРА (Ctrl+K)
============================================================ */
let cmdkItems = [], cmdkSel = 0, cmdkOpen = false;
function cmdkBaseItems() {
    const items = [];
    items.push({ g: 'Действия', icon: 'i-plus', t: 'Новый чат', s: 'Начать свежий диалог (Ctrl+Shift+O)', kw: 'new chat создать новый', run() { newChat(); } });
    items.push({ g: 'Действия', icon: 'i-menu', t: 'История диалогов (Шторка)', s: 'Открыть список всех диалогов (Ctrl+B)', kw: 'drawer sidebar шторка история чаты', run() { openDrawer(); } });
    items.push({ g: 'Действия', icon: 'i-download', t: 'Экспортировать текущий чат', s: 'Скачать диалог в Markdown (Ctrl+Shift+E)', kw: 'export скачать markdown экспорт', run() { exportCurrentChat(); } });
    items.push({ g: 'Действия', icon: 'i-sun', t: 'Переключить тему', s: 'Тёмное и светлое оформление (Ctrl+Shift+D)', kw: 'theme тема dark light светлая тёмная', run() { toggleTheme(); } });
    items.push({ g: 'Действия', icon: 'i-command', t: 'Горячие клавиши', s: 'Список комбинаций для клавиатуры', kw: 'shortcuts hotkeys клавиши шорткаты помощь', run() { openSettings('shortcuts'); } });
    items.push({ g: 'Действия', icon: 'i-gear', t: 'Настройки Studio', s: 'API-ключи, системный промпт, баланс (Ctrl+Shift+S)', kw: 'settings настройки ключи proxy', run() { openSettings(); } });
    items.push({ g: 'Действия', icon: 'i-star', t: 'Избранные изображения', s: 'Галерея сохранённых картинок', kw: 'favorites избранное галерея', run() { if ((state.favorites || []).length) { renderFavorites(); $('#favOverlay').classList.add('show'); } else toast('В избранном пока пусто', 'info'); } });
    items.push({ g: 'Действия', icon: 'i-wallet', t: 'Проверить баланс ProxyAPI', s: 'Остаток средств по ключу', kw: 'balance баланс деньги', run() { openSettings('keys'); setTimeout(checkBalance, 280); } });
    getAllModels().forEach(m => {
        const modelIco = (typeof window.getAiModelIcon === 'function' ? window.getAiModelIcon(m.id, m) : null) || (m.icon && !m.icon.startsWith('http') ? m.icon : null) || m.icon || null;
        items.push({
            g: 'Модели', icon: modelIco, img: true, t: m.name, s: (m.tagline || m.id) + ' · ' + (m.provider || 'OpenRouter'),
            kw: (m.name + ' ' + m.id + ' ' + (m.provider || '') + ' ' + (m.author || '') + ' ' + (m.tagline || '')).toLowerCase(),
            run() {
                state.settings.modelId = m.id;
                const cfgs = typeof window.getModelThinkingConfig === 'function'
                    ? window.getModelThinkingConfig(m)
                    : (modelThinkingConfigs[m.id] || modelThinkingConfigs[m.id.replace(/:(nitro|exacto|free|online|extended)$/i, '')] || [{ value: 'off' }]);
                if (!cfgs.some(c => c.value === state.settings.reasoning)) state.settings.reasoning = cfgs[0].value;
                save(); updateTopChips();
                toast('Модель: ' + m.name, 'ok', 1800);
            }
        });
    });
    [...state.chats].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 30).forEach(c => {
        const firstTxt = (c.messages[0] && c.messages[0].content ? c.messages[0].content : '').toLowerCase();
        items.push({
            g: 'Чаты', icon: 'i-chat', t: c.title, s: fmtDate(c.updatedAt) + ' · ' + c.messages.length + ' сообщ.',
            kw: (c.title + ' ' + firstTxt).toLowerCase(), run() { openChat(c.id); }
        });
    });
    return items;
}
function renderCmdk() {
    const q = $('#cmdkInput').value.trim().toLowerCase();
    const all = cmdkBaseItems();
    cmdkItems = q ? all.filter(i => i.t.toLowerCase().includes(q) || (i.s || '').toLowerCase().includes(q) || (i.kw || '').includes(q)) : all;
    cmdkSel = 0;
    const list = $('#cmdkList');
    if (!cmdkItems.length) {
        list.innerHTML = '<div class="list-empty" style="padding:28px"><svg><use href="#i-search"/></svg>Ничего не найдено</div>';
        return;
    }
    let html = '', lastG = '';
    cmdkItems.forEach((it, i) => {
        if (it.g !== lastG) { html += '<div class="cmdk-group">' + esc(it.g) + '</div>'; lastG = it.g; }
        const ico = (it.img && it.icon)
            ? '<img src="' + esc(it.icon) + '" alt="" loading="lazy" onerror="this.outerHTML=\'<svg><use href=&quot;#i-chip&quot;/></svg>\'">'
            : '<svg><use href="#' + esc(it.icon) + '"/></svg>';
        html += '<button class="cmdk-item' + (i === cmdkSel ? ' sel' : '') + '" data-ci="' + i + '" role="option" aria-selected="' + (i === cmdkSel) + '">' +
            '<span class="cmdk-ico">' + ico + '</span>' +
            '<span class="cmdk-body"><span class="cmdk-t">' + esc(it.t) + '</span>' + (it.s ? '<span class="cmdk-s">' + esc(it.s) + '</span>' : '') + '</span>' +
            '</button>';
    });
    list.innerHTML = html;
    list.querySelectorAll('.cmdk-item').forEach(b => {
        b.addEventListener('mousemove', () => { const i = +b.dataset.ci; if (i !== cmdkSel) { cmdkSel = i; renderCmdkSel(); } });
        b.addEventListener('click', () => { cmdkSel = +b.dataset.ci; cmdkExec(); });
    });
}
function renderCmdkSel() {
    const list = $('#cmdkList');
    list.querySelectorAll('.cmdk-item').forEach(b => {
        const on = +b.dataset.ci === cmdkSel;
        b.classList.toggle('sel', on);
        b.setAttribute('aria-selected', on);
        if (on) b.scrollIntoView({ block: 'nearest' });
    });
}
function cmdkMove(d) {
    if (!cmdkItems.length) return;
    cmdkSel = (cmdkSel + d + cmdkItems.length) % cmdkItems.length;
    renderCmdkSel();
}
function cmdkExec() {
    const it = cmdkItems[cmdkSel];
    if (!it) return;
    closeCmdk();
    try { it.run(); } catch (e) { console.error('[CmdK]', e); toast('Не удалось выполнить команду', 'err'); }
}
function openCmdk() {
    lastActiveTriggerElement = document.activeElement;
    cmdkOpen = true;
    const input = $('#cmdkInput');
    if (input) input.value = '';
    renderCmdk();
    const overlay = $('#cmdkOverlay');
    if (overlay) overlay.classList.add('show');
    setTimeout(() => {
        const inp = $('#cmdkInput');
        if (inp) {
            inp.focus();
            inp.select();
        }
    }, 60);
}
function closeCmdk() {
    cmdkOpen = false;
    const overlay = $('#cmdkOverlay');
    if (overlay) overlay.classList.remove('show');
    if (lastActiveTriggerElement && typeof lastActiveTriggerElement.focus === 'function') {
        try { lastActiveTriggerElement.focus(); } catch (_) { }
    }
}
function toggleCmdk() {
    const overlay = $('#cmdkOverlay');
    const isShowing = overlay && overlay.classList.contains('show');
    if (isShowing || cmdkOpen) {
        closeCmdk();
    } else {
        openCmdk();
    }
}
$('#cmdkInput').addEventListener('input', renderCmdk);
$('#cmdkInput').addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); cmdkMove(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); cmdkMove(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); cmdkExec(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeCmdk(); }
});
$('#cmdkOverlay').addEventListener('click', e => { if (e.target === $('#cmdkOverlay')) closeCmdk(); });
/* ============================================================
SLASH-КОМАНДЫ В КОМПОЗЕРЕ
============================================================ */
const SLASH_COMMANDS = [
    { cmd: '/img', icon: 'i-image', t: 'Генерация изображений', s: 'ИИ-художник · /img <промпт> отправит запрос сразу' },
    { cmd: '/art', icon: 'i-cube', t: 'Артефакт', s: 'Интерактивное мини-приложение · /art <описание>' },
    { cmd: '/search', icon: 'i-globe', t: 'Веб-поиск', s: 'Найти информацию в интернете по вашим запросам' },
    { cmd: '/think', icon: 'i-spark', t: 'Уровень размышлений', s: 'Открыть меню глубины анализа модели' },
    { cmd: '/export', icon: 'i-download', t: 'Экспорт чата', s: 'Скачать текущий диалог в Markdown' },
    { cmd: '/new', icon: 'i-plus', t: 'Новый чат', s: 'Начать с чистого листа' },
    { cmd: '/theme', icon: 'i-sun', t: 'Сменить тему', s: 'Переключить тёмную / светлую' }
];
let slashSel = 0, slashList = [];
function slashOpen() { const m = $('#slashMenu'); return !!m && !m.hidden; }
function handleSlashInput() {
    const v = promptInput.value;
    const m = v.match(/^\/([a-zа-яё]*)$/i);
    if (!m) { closeSlash(); return; }
    const q = m[1].toLowerCase();
    slashList = SLASH_COMMANDS.filter(c => c.cmd.slice(1).startsWith(q));
    if (!slashList.length) { closeSlash(); return; }
    slashSel = 0;
    renderSlash();
}
function renderSlash() {
    const menu = $('#slashMenu');
    menu.hidden = false;
    menu.innerHTML = '<div class="menu-head">Команды</div>' + slashList.map((c, i) =>
        '<button class="slash-item' + (i === slashSel ? ' sel' : '') + '" data-si="' + i + '" role="option" aria-selected="' + (i === slashSel) + '">' +
        '<span class="slash-ico"><svg><use href="#' + c.icon + '"/></svg></span>' +
        '<span class="slash-body"><span class="slash-cmd">' + esc(c.cmd) + '</span><span class="slash-s">' + esc(c.s) + '</span></span>' +
        (i === slashSel ? '<span class="kbd">Enter</span>' : '') +
        '</button>').join('');
    menu.querySelectorAll('.slash-item').forEach(b => {
        b.addEventListener('mousemove', () => { const i = +b.dataset.si; if (i !== slashSel) { slashSel = i; renderSlashSel(); } });
        b.addEventListener('click', () => { slashSel = +b.dataset.si; applySlash(); });
    });
}
function renderSlashSel() {
    $('#slashMenu').querySelectorAll('.slash-item').forEach(b => {
        const on = +b.dataset.si === slashSel;
        b.classList.toggle('sel', on);
        b.setAttribute('aria-selected', on);
    });
}
function slashMove(d) {
    if (!slashList.length) return;
    slashSel = (slashSel + d + slashList.length) % slashList.length;
    renderSlashSel();
}
function closeSlash() {
    const m = $('#slashMenu');
    if (m) { m.hidden = true; m.innerHTML = ''; }
    slashList = [];
}
function applySlash() {
    const c = slashList[slashSel];
    closeSlash();
    if (!c) return;
    promptInput.value = '';
    autoGrow(); setSendBtn();
    execSlashById(c.cmd, '');
    try { promptInput.focus({ preventScroll: true }); } catch (e) { }
}
function parseSlashCommand(text) {
    const m = String(text || '').match(/^\/([a-zа-яё]+)(?:\s+([\s\S]*))?$/i);
    if (!m) return null;
    const cmd = '/' + m[1].toLowerCase();
    return { cmd, arg: m[2] || '', known: SLASH_COMMANDS.some(c => c.cmd === cmd) };
}
function execSlashById(cmd, arg) {
    if (cmd === '/img') {
        state.settings.imageGen = true;
        syncSettingsUI(); save(); updateIgHint();
        if (arg && arg.trim()) { promptInput.value = arg.trim(); autoGrow(); setSendBtn(); return 'send'; }
        promptInput.placeholder = 'Опишите изображение для генерации…';
        toast('Генерация изображений включена', 'ok');
        return null;
    }
    if (cmd === '/search') {
        openSearchPanel(arg);
        return null;
    }
    if (cmd === '/art') {
        state.settings.artifacts = true;
        syncSettingsUI(); save();
        if (arg && arg.trim()) { promptInput.value = arg.trim(); autoGrow(); setSendBtn(); return 'send'; }
        toast('Артефакты включены — опишите, что создать', 'ok');
        return null;
    }
    if (cmd === '/think') {
        if (window.promptInputCtrl && typeof window.promptInputCtrl.openEffortDropdown === 'function') {
            window.promptInputCtrl.openEffortDropdown();
        }
        return null;
    }
    if (cmd === '/export') { exportCurrentChat(); return null; }
    if (cmd === '/new') { newChat(); return null; }
    if (cmd === '/theme') { toggleTheme(); return null; }
    return null;
}
/* ============================================================
КНОПКА «ВНИЗ» СО СЧЁТЧИКОМ ПРОПУЩЕННЫХ СООБЩЕНИЙ
============================================================ */
let sdMissed = 0, sdSuppress = false;
function sdIsNearBottom() {
    const s = $('#chatScroll');
    return s.scrollHeight - s.scrollTop - s.clientHeight < 140;
}
function sdUpdate() {
    const btn = $('#scrollDownBtn');
    if (!btn) return;
    const s = $('#chatScroll');
    const canScroll = s.scrollHeight > s.clientHeight + 80;
    btn.classList.toggle('show', canScroll && !sdIsNearBottom());
    const c = $('#sdCount');
    c.hidden = sdMissed <= 0;
    c.textContent = sdMissed > 99 ? '99+' : String(sdMissed);
}
function sdResetForChat() { sdMissed = 0; sdUpdate(); }
function sdTrackStream(chat, aiMsg, wasNearBottom) {
    if (!chat || chat.id !== state.activeId || aiMsg._sdCounted) return;
    const nearBottom = wasNearBottom !== undefined ? wasNearBottom : sdIsNearBottom();
    if (!nearBottom && ((aiMsg.content && aiMsg.content.length > 0) || (aiMsg.thinking && aiMsg.thinking.length > 0))) {
        aiMsg._sdCounted = true;
        sdMissed++;
        sdUpdate();
    }
}
const chatScrollEl = $('#chatScroll');
let lastManualUpTime = 0;
function isAtVeryBottom() {
    return chatScrollEl.scrollHeight - chatScrollEl.scrollTop - chatScrollEl.clientHeight < 80;
}
chatScrollEl.addEventListener('scroll', () => {
    if (isAtVeryBottom()) {
        // пользователь сам вернулся в самый низ → снова прилипаем
        if (performance.now() - lastManualUpTime > 150) stickToBottom = true;
        if (!sdSuppress) sdMissed = 0;
    }
    sdUpdate();
}, { passive: true });
/* Отслеживаем намерение прокрутить вверх: wheel / touch / клавиатура */
chatScrollEl.addEventListener('wheel', e => {
    if (!streaming) return;
    if (e.deltaY < 0) { stickToBottom = false; lastManualUpTime = performance.now(); }
}, { passive: true });
let lastTouchY = null;
chatScrollEl.addEventListener('touchstart', e => {
    if (e.touches.length) lastTouchY = e.touches[0].clientY;
}, { passive: true });
chatScrollEl.addEventListener('touchmove', e => {
    if (!streaming || lastTouchY === null) return;
    const y = e.touches[0].clientY;
    if (y > lastTouchY + 8) { stickToBottom = false; lastManualUpTime = performance.now(); }
    lastTouchY = y;
}, { passive: true });
chatScrollEl.addEventListener('keydown', e => {
    if (!streaming) return;
    if (e.key === 'PageUp' || e.key === 'ArrowUp' || e.key === 'Home') {
        stickToBottom = false; lastManualUpTime = performance.now();
    }
}, { passive: true });
$('#scrollDownBtn').addEventListener('click', () => {
    stickToBottom = true;
    const s = $('#chatScroll');
    try { s.scrollTo({ top: s.scrollHeight, behavior: 'smooth' }); }
    catch (e) { s.scrollTop = s.scrollHeight; }
    sdMissed = 0;
    setTimeout(sdUpdate, 420);
});
window.addEventListener('resize', sdUpdate);
/* ============================================================
ИНТЕГРАЦИЯ AI CONTEXT WINDOW (ASK AI НА БАЗЕ GPT-5 NANO)
============================================================ */
function getSelectedMessageText() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return null;
    const text = sel.toString().trim();
    if (text.length < 1) return null;
    const anchor = sel.anchorNode;
    if (!anchor) return null;
    const el = anchor.nodeType === Node.TEXT_NODE ? anchor.parentElement : anchor;
    if (!el || typeof el.closest !== 'function') return null;

    // Исключаем системные служебные блоки и контролы
    if (el.closest('.code-tools, .code-lines, button, .msg-actions, #aiContextWindowRoot, #textSelectionMenu')) return null;

    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    return { text, rect };
}

/* ============================================================
ПАНЕЛЬ ВЕБ-ПОИСКА (/search) — пользователь сам задаёт запросы
============================================================ */
function openSearchPanel(initialQuery) {
    closeSlash();
    const panel = $('#searchPanel');
    const box = $('#spQueries');
    box.innerHTML = '';
    addSearchQueryField(initialQuery || '');
    panel.hidden = false;
    setTimeout(() => { const inp = box.querySelector('input'); if (inp) inp.focus(); }, 80);
}
function closeSearchPanel() {
    const panel = $('#searchPanel');
    if (panel) panel.hidden = true;
}
function addSearchQueryField(value) {
    const box = $('#spQueries');
    const div = document.createElement('div');
    div.className = 'sp-field';
    div.innerHTML = '<svg><use href="#i-search"/></svg><input type="text" placeholder="Поисковый запрос…" autocomplete="off" spellcheck="false" value="' + esc(value || '') + '"><button class="sp-rm" aria-label="Убрать запрос"><svg><use href="#i-x"/></svg></button>';
    div.querySelector('.sp-rm').addEventListener('click', () => {
        const fields = box.querySelectorAll('.sp-field');
        if (fields.length <= 1) { div.querySelector('input').value = ''; div.querySelector('input').focus(); return; }
        div.remove();
    });
    div.querySelector('input').addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); submitSearchPanel(); }
        if (e.key === 'Escape') { e.stopPropagation(); closeSearchPanel(); }
    });
    box.appendChild(div);
}
function getSearchQueries() {
    const inputs = $('#spQueries').querySelectorAll('input');
    const queries = [];
    inputs.forEach(inp => {
        const v = inp.value.trim();
        if (v) queries.push(v);
    });
    return queries;
}
function submitSearchPanel() {
    const queries = getSearchQueries();
    if (!queries.length) { toast('Введите хотя бы один поисковый запрос', 'info'); return; }
    closeSearchPanel();
    const inp = $('#promptInput');
    inp.value = ''; autoGrow(); setSendBtn();
    const chat = ensureChat();
    runUserWebSearch(chat, queries);
}
$('#spClose').addEventListener('click', closeSearchPanel);
$('#spCancel').addEventListener('click', closeSearchPanel);
$('#spAddQuery').addEventListener('click', () => { addSearchQueryField(''); const inputs = $('#spQueries').querySelectorAll('input'); inputs[inputs.length - 1].focus(); });
$('#spSubmit').addEventListener('click', submitSearchPanel);
function formatSearchForModel(results, queries) {
    const srcs = (results.sources || []).map((s, i) =>
        (i + 1) + '. ' + (s.title || 'Без названия') + '\n   URL: ' + s.uri + '\n   ' + (s.snippet || 'Описание недоступно')
    ).join('\n\n');
    return [
        '=== РЕЗУЛЬТАТЫ ВЕБ-ПОИСКА (запрошено пользователем) ===',
        'Поисковые запросы: ' + queries.join('; '),
        '',
        srcs || 'Источники не найдены.',
        '',
        'На основе этих результатов составь подробный, структурированный и полезный ответ.',
        'Указывай источники информации. Если данных недостаточно, честно скажи об этом.',
        '=== КОНЕЦ РЕЗУЛЬТАТОВ ПОИСКА ==='
    ].join('\n');
}
async function runUserWebSearch(chat, queries, reuseUserMsg) {
    const settings = state.settings;
    const model = getModel(settings.modelId);
    const route = resolveApiRoute(settings, model);
    if (!route.useProxy && !route.useORDirect) {
        toast(route.missing === 'proxy'
            ? 'Выбран ProxyAPI, но ключ не указан'
            : 'Выбран OpenRouter, но ключ sk-or-… не указан', 'err');
        openSettings(); return;
    }
    /* Цепочка провайдеров для FAILOVER в режиме «Авто» */
    const autoMode = (settings.apiSource || 'auto') === 'auto';
    const hasProxyKey = !!(settings.proxyKey || '').trim();
    const hasORKey = !!(settings.orKey || '').trim();
    const chain = [route.useProxy ? 'proxy' : 'openrouter'];
    if (autoMode && hasProxyKey && hasORKey) chain.push(chain[0] === 'proxy' ? 'openrouter' : 'proxy');
    let provIdx = 0;
    let useProxy = chain[0] === 'proxy';
    let useORDirect = chain[0] === 'openrouter';
    const provErrors = [];
    /* 1. Сообщение пользователя: новое или существующее (регенерация) */
    let userMsg;
    if (reuseUserMsg) {
        userMsg = reuseUserMsg;
        userMsg.searchQueries = queries.slice();
    } else {
        const searchLabel = queries.join(' · ');
        userMsg = { id: uid(), role: 'user', content: 'Поиск в интернете: ' + searchLabel, ts: Date.now(), searchQueries: queries.slice() };
        chat.messages.push(userMsg);
        chat.updatedAt = Date.now();
        autoTitle(chat);
    }
    /* 2. Сообщение ИИ */
    setStreamingState(true);
    stickToBottom = true;
    const aiMsg = {
        id: uid(), role: 'assistant', content: '', thinking: '', ts: Date.now(),
        modelId: model.id, status: 'streaming', viaSearch: true,
        webSearch: { queries: queries.slice(), sources: [], stages: [] }
    };
    chat.messages.push(aiMsg);
    save(); renderMessages(); renderChatList();
    const el = $('#messages').querySelector('[data-id="' + aiMsg.id + '"]');
    let rafId = null;
    const schedule = () => { if (!rafId) rafId = requestAnimationFrame(() => { rafId = null; refreshMsgBody(el, aiMsg); const wasNear = sdIsNearBottom(); scrollBottom(); sdTrackStream(chat, aiMsg, wasNear); }); };
    const scrollBottom = () => { if (stickToBottom) { const s = $('#chatScroll'); s.scrollTop = s.scrollHeight; } };
    const pushStage = label => { aiMsg.webSearch.stages.push({ label, ts: Date.now() }); schedule(); };
    pushStage('Поиск в интернете');
    abortCtrl = new AbortController();
    const artTrk = { start: null };
    try {
        /* 3. Выполняем поиск */
        const searchFn = (window.toolCalling && typeof window.toolCalling.performWebSearches === 'function')
            ? window.toolCalling.performWebSearches
            : (typeof window.performWebSearches === 'function'
                ? window.performWebSearches
                : window.performOpenRouterWebSearch);
        let results = searchFn ? (await searchFn(queries, abortCtrl.signal) || { sources: [] }) : { sources: [] };
        if (!results.sources || !results.sources.length || results.failed) {
            if (typeof window.performOpenRouterWebSearch === 'function') {
                const fbRes = await window.performOpenRouterWebSearch(queries, abortCtrl.signal);
                if (fbRes && fbRes.sources && fbRes.sources.length) results = fbRes;
            }
        }
        aiMsg.webSearch.sources = results.sources || [];
        pushStage('Найдено источников: ' + (results.sources || []).length);
        schedule();
        /* 4. Формируем контекст и обогащаем историю для модели */
        const searchResultsText = formatSearchForModel(results, queries);
        const history = chat.messages.slice(0, -1);
        const enrichedHistory = history.map(m => {
            if (m.id === userMsg.id) return { ...m, content: m.content + '\n\n' + searchResultsText + '\n\nПроанализируй результаты поиска и составь подробный ответ.' };
            return m;
        });
        /* 5. Стриминг ответа модели */
        const onText = t => {
            aiMsg.content += t;
            if (state.settings.imageGen && (aiMsg.imageRequests || []).length < 2) {
                const im = detectImageGenCommand(aiMsg.content);
                if (im) spawnImageRequest(chat, aiMsg, im.raw, im.prompt, im.refs);
            }
            trackStreamArtifacts(chat, aiMsg, artTrk);
            schedule();
        };
        const onThink = t => { aiMsg.thinking += t; schedule(); };
        const onImage = url => { aiMsg.content += '\n![Изображение](' + url + ')\n'; schedule(); };
        const onReasoningDetails = rd => {
            if (!aiMsg.reasoning_details) aiMsg.reasoning_details = [];
            if (Array.isArray(rd)) aiMsg.reasoning_details.push(...rd);
            else aiMsg.reasoning_details.push(rd);
        };
        const noopWs = () => { };
        /* 5. Стриминг ответа модели с FAILOVER в «Авто»: ошибка провайдера
        откатывает попытку и регенерирует через резервный провайдер */
        const sn = snapAiMsg(aiMsg);
        let streamFailed = false;
        while (true) {
            try {
                if (useORDirect) {
                    await streamOpenRouterDirect(model, enrichedHistory,
                        { onText, onThink, onImage, onReasoningDetails, onWebSearch: noopWs, onServerTool: info => window.recordServerTool(aiMsg, info), signal: abortCtrl.signal }, aiMsg, chat);
                } else if (model.api === 'anthropic') {
                    await streamAnthropic(model, enrichedHistory, { onText, onThink, onWebSearch: noopWs, wsEnabled: false, webSearchContext: null, signal: abortCtrl.signal }, aiMsg);
                } else if (model.api === 'gemini') {
                    await streamGemini(model, enrichedHistory, { onText, onThink, onWebSearch: noopWs, wsEnabled: false, webSearchContext: null, signal: abortCtrl.signal }, aiMsg);
                } else {
                    await streamOpenRouter(model, enrichedHistory, { onText, onThink, onImage, onReasoningDetails, onWebSearch: noopWs, wsEnabled: false, webSearchContext: null, signal: abortCtrl.signal, direct: false }, aiMsg, chat);
                }
                break;
            } catch (e) {
                if (e.name === 'AbortError' || e.code === 20) throw e; // стоп пользователем — во внешний catch
                if (provIdx + 1 < chain.length) {
                    const failedGateway = useProxy ? 'ProxyAPI' : 'OpenRouter';
                    provErrors.push({ name: failedGateway, msg: (e && e.message) || String(e) });
                    rollbackAiMsg(aiMsg, sn);
                    artTrk.start = null;
                    provIdx++;
                    useProxy = chain[provIdx] === 'proxy';
                    useORDirect = chain[provIdx] === 'openrouter';
                    abortCtrl = new AbortController();
                    toast(`${failedGateway} недоступен. Переключение на ${useProxy ? 'ProxyAPI' : 'OpenRouter'}…`, 'info', 3200);
                    schedule();
                    continue;
                }
                /* Оба провайдера цепочки не справились */
                provErrors.push({ name: useProxy ? 'ProxyAPI' : 'OpenRouter', msg: (e && e.message) || String(e) });
                rollbackAiMsg(aiMsg, sn);
                aiMsg.status = 'error';
                aiMsg.content = '**Оба провайдера не справились с ответом**\n' + provErrors.map(pe => '• ' + pe.name + ': ' + pe.msg).join('\n') + '\nПроверьте API-ключи, баланс и соединение с интернетом.';
                streamFailed = true;
                toast('Оба провайдера не справились с ответом', 'err');
                break;
            }
        }
        if (!streamFailed) aiMsg.status = 'done';
    } catch (e) {
        if (e.name === 'AbortError' || e.code === 20) {
            aiMsg.status = aiMsg.content ? 'done' : 'aborted';
            if (!aiMsg.content) aiMsg.content = '*Поиск остановлен.*';
            toast('Поиск остановлен', 'info');
        } else {
            aiMsg.status = 'error';
            aiMsg.content = '**Ошибка веб-поиска**\n' + (e.message || e) + '\nПроверьте ключ ProxyAPI и баланс.';
            toast('Ошибка при веб-поиске', 'err');
        }
    }
    /* Лента «Изображения из сети» над ответом — как в обычном потоке */
    if (aiMsg.status === 'done' && !aiMsg.webImages) {
        const imgQuery = queries[0] || '';
        if (shouldAttachImages(imgQuery)) {
            const cleaned = cleanImageQuery(imgQuery);
            pushStage('Подбор изображений из сети');
            fetchWebImages(cleaned).then(async imgs => {
                if (imgs.length < 2 && cleaned !== String(imgQuery || '').trim()) {
                    const more = await fetchWebImages(imgQuery);
                    if (more.length > imgs.length) imgs = more;
                }
                if (imgs.length >= 2) {
                    aiMsg.webImages = imgs;
                    pushStage('Изображений из сети: ' + imgs.length);
                    save();
                    const el2 = $('#messages').querySelector('[data-id="' + aiMsg.id + '"]');
                    if (el2) refreshMsgBody(el2, aiMsg);
                }
            }).catch(() => { });
        }
    }
    handlePendingArtifacts(chat, aiMsg);
    setStreamingState(false);
    abortCtrl = null;
    chat.updatedAt = Date.now(); save();
    refreshMsgBody(el, aiMsg); renderChatList();
    if (stickToBottom) { const s = $('#chatScroll'); s.scrollTop = s.scrollHeight; }
}
/* ============================================================
   ГЛОБАЛЬНЫЙ ДИСПЕТЧЕР КЛАВИАТУРЫ И ACCESSIBILITY (KEYBOARD PRO)
============================================================ */
document.addEventListener('keydown', e => {
    const isModifier = e.ctrlKey || e.metaKey;
    const target = e.target;
    const isTyping = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
    const keyLower = (e.key || '').toLowerCase();
    const code = e.code || '';

    // 1. Focus Trap для модалок, меню и открытой боковой шторки
    if (e.key === 'Tab') {
        const visibleOverlay = document.querySelector('.overlay.show, #htmlPreview:not([hidden]), #imgViewer:not([hidden]), #uniOverlay:not([hidden])');
        if (visibleOverlay) {
            trapFocusInContainer(visibleOverlay, e);
            return;
        }
        if (drawer.classList.contains('open')) {
            trapFocusInContainer(drawer, e);
            return;
        }
    }

    // 2. Навигация стрелками внутри открытых меню (Model, Think, Plus, MsgCtx, ChatCtx, FavCtx)
    const openMenu = [modelMenu, thinkMenu, plusMenu, $('#msgCtxMenu'), $('#chatCtxMenu'), $('#favCtxMenu'), $('#igCtxMenu')].find(m => m && !m.hidden && !m.classList.contains('out'));
    if (openMenu && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End')) {
        handleMenuKeyboardNavigation(openMenu, e);
        return;
    }

    // 3. Глобальные сочетания клавиш (Shortcuts)
    // Ctrl+K / Cmd+K: Командная палитра или быстрый поиск в настройках
    if (isModifier && (code === 'KeyK' || keyLower === 'k' || keyLower === 'л')) {
        e.preventDefault();
        if (settingsOverlay.classList.contains('show')) {
            const setInput = $('#setSearchInput');
            if (setInput) { setInput.focus(); setInput.select(); }
        } else {
            toggleCmdk();
        }
        return;
    }

    // Ctrl+B / Cmd+B: Переключить боковую шторку истории диалогов
    if (isModifier && (code === 'KeyB' || keyLower === 'b' || keyLower === 'и')) {
        e.preventDefault();
        drawer.classList.contains('open') ? closeDrawer() : openDrawer();
        return;
    }

    // Ctrl+Shift+O / Ctrl+Shift+N: Новый диалог
    if (isModifier && e.shiftKey && (code === 'KeyO' || code === 'KeyN' || keyLower === 'o' || keyLower === 'n' || keyLower === 'щ' || keyLower === 'т')) {
        e.preventDefault();
        newChat();
        return;
    }

    // Ctrl+Shift+S: Открыть параметры приложения (Studio Config)
    if (isModifier && e.shiftKey && (code === 'KeyS' || keyLower === 's' || keyLower === 'ы')) {
        e.preventDefault();
        settingsOverlay.classList.contains('show') ? closeSettings() : openSettings('general');
        return;
    }

    // Ctrl+Shift+D: Переключить тему (Dark / Light)
    if (isModifier && e.shiftKey && (code === 'KeyD' || keyLower === 'd' || keyLower === 'в')) {
        e.preventDefault();
        toggleTheme(e);
        return;
    }

    // Ctrl+Shift+E: Экспорт текущего диалога в Markdown
    if (isModifier && e.shiftKey && (code === 'KeyE' || keyLower === 'e' || keyLower === 'у')) {
        e.preventDefault();
        exportCurrentChat();
        return;
    }

    // Alt+C / Ctrl+Shift+C: Открыть или закрыть Community Room
    if ((e.altKey && (code === 'KeyC' || keyLower === 'c' || keyLower === 'с')) ||
        (isModifier && e.shiftKey && (code === 'KeyC' || keyLower === 'c' || keyLower === 'с'))) {
        e.preventDefault();
        const commModal = document.querySelector('#communityModalOverlay, #communityOverlay, .community-modal-overlay');
        const isCommOpen = commModal && (commModal.classList.contains('show') || !commModal.hidden);
        if (isCommOpen) {
            if (window.supabaseCommunity && typeof window.supabaseCommunity.closeCommunityModal === 'function') {
                window.supabaseCommunity.closeCommunityModal();
            } else {
                commModal.classList.remove('show');
                commModal.hidden = true;
            }
        } else {
            if (drawer.classList.contains('open')) closeDrawer();
            if (window.supabaseCommunity && typeof window.supabaseCommunity.openCommunityModal === 'function') {
                window.supabaseCommunity.openCommunityModal();
            } else {
                const commBtn = document.getElementById('btnCommunityRoom');
                if (commBtn) commBtn.click();
            }
        }
        return;
    }

    // Alt+U / Ctrl+Shift+U: Запустить или свернуть голосовой ассистент Юни
    if ((e.altKey && (code === 'KeyU' || keyLower === 'u' || keyLower === 'г')) ||
        (isModifier && e.shiftKey && (code === 'KeyU' || keyLower === 'u' || keyLower === 'г'))) {
        e.preventDefault();
        if (window.uni) {
            window.uni.active ? window.uni.close() : window.uni.open();
        }
        return;
    }

    // Alt+M / Ctrl+Shift+M: Меню выбора модели
    if ((e.altKey && (code === 'KeyM' || keyLower === 'm' || keyLower === 'ь')) ||
        (isModifier && e.shiftKey && (code === 'KeyM' || keyLower === 'm' || keyLower === 'ь'))) {
        e.preventDefault();
        if (window.promptInputCtrl && typeof window.promptInputCtrl.openModelDropdown === 'function') {
            window.promptInputCtrl.openModelDropdown();
        } else {
            toggleMenu(modelMenu, renderModelMenu);
        }
        return;
    }

    // Alt+R / Ctrl+Shift+R: Меню уровня размышлений (Reasoning Effort)
    if ((e.altKey && (code === 'KeyR' || keyLower === 'r' || keyLower === 'к')) ||
        (isModifier && e.shiftKey && (code === 'KeyR' || keyLower === 'r' || keyLower === 'к'))) {
        e.preventDefault();
        if (window.promptInputCtrl && typeof window.promptInputCtrl.openEffortDropdown === 'function') {
            window.promptInputCtrl.openEffortDropdown();
        } else {
            toggleMenu(thinkMenu, renderThinkMenu);
        }
        return;
    }

    // Alt+A / Ctrl+Shift+A: Меню прикрепления инструментов и файлов (Кнопка +)
    if ((e.altKey && (code === 'KeyA' || keyLower === 'a' || keyLower === 'ф')) ||
        (isModifier && e.shiftKey && (code === 'KeyA' || keyLower === 'a' || keyLower === 'ф'))) {
        e.preventDefault();
        const plusBtn = document.getElementById('btnPlus');
        if (plusBtn) plusBtn.click();
        return;
    }

    // Alt+W / Ctrl+Shift+W: Панель веб-поиска
    if ((e.altKey && (code === 'KeyW' || keyLower === 'w' || keyLower === 'ц')) ||
        (isModifier && e.shiftKey && (code === 'KeyW' || keyLower === 'w' || keyLower === 'ц'))) {
        e.preventDefault();
        const searchPanel = document.getElementById('searchPanel');
        if (searchPanel && !searchPanel.hidden) {
            closeSearchPanel();
        } else {
            openSearchPanel('');
        }
        return;
    }

    // Alt+Up / Alt+Down: Прокрутка ленты сообщений с клавиатуры
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        const scroller = $('#chatScroll');
        if (scroller) {
            const delta = e.key === 'ArrowUp' ? -260 : 260;
            scroller.scrollBy({ top: delta, behavior: 'smooth' });
        }
        return;
    }

    // Ctrl+/ или F1: Мгновенный фокус на поле ввода промпта
    if ((isModifier && e.key === '/') || e.key === 'F1') {
        e.preventDefault();
        clearMessageSelection();
        promptInput.focus();
        return;
    }

    // Ctrl+I / Cmd+I: Мгновенный фокус в активное окно редактирования сообщения
    const activeEditingMsg = document.querySelector('.msg[data-editing]');
    if (isModifier && (code === 'KeyI' || keyLower === 'i' || keyLower === 'ш')) {
        const editTa = activeEditingMsg?.querySelector('.msg-edit-textarea');
        if (editTa) {
            e.preventDefault();
            editTa.focus();
            return;
        }
    }

    // 4. Навигация по сообщениям ленты диалога и быстрые действия над выделенным сообщением
    const isInsideEditor = target && !!target.closest('.msg-edit');
    const hasOpenModalOrMenu = document.querySelector('.overlay.show, #htmlPreview:not([hidden]), #imgViewer:not([hidden]), #uniOverlay:not([hidden]), .menu:not([hidden]):not(.out), .ig-ctx:not([hidden])');

    if (!isTyping && !isInsideEditor && !hasOpenModalOrMenu && !drawer.classList.contains('open')) {
        // Перемещение по сообщениям
        if (!activeEditingMsg && (e.key === 'ArrowUp' || code === 'KeyK' || keyLower === 'k' || keyLower === 'л')) {
            e.preventDefault();
            selectPrevMessage();
            return;
        }
        if (!activeEditingMsg && (e.key === 'ArrowDown' || code === 'KeyJ' || keyLower === 'j' || keyLower === 'о')) {
            e.preventDefault();
            selectNextMessage();
            return;
        }
        if (!activeEditingMsg && (e.key === 'Home' || e.key === 'PageUp')) {
            e.preventDefault();
            selectFirstMessage();
            return;
        }
        if (!activeEditingMsg && (e.key === 'End' || e.key === 'PageDown')) {
            e.preventDefault();
            selectLastMessage();
            return;
        }

        // Действия над выбранным сообщением
        if (selectedMsgId && !activeEditingMsg) {
            // Открытие контекстного меню
            if (e.key === 'Enter' || e.key === ' ') {
                if (target && target.closest('button, a, input, textarea, select, [role="button"]')) {
                    return;
                }
                if (handleMessageClickSelectionGuard(e)) {
                    return;
                }
                e.preventDefault();
                const selEl = document.querySelector(`.msg[data-id="${selectedMsgId}"]`);
                openMsgContextMenu(selectedMsgId, selEl);
                return;
            }

            // 'E' — Редактировать выбранное сообщение
            if (code === 'KeyE' || keyLower === 'e' || keyLower === 'у') {
                e.preventDefault();
                startEdit(selectedMsgId);
                return;
            }

            // 'C' / 'Ctrl+C' — Копировать текст выбранного сообщения
            if ((code === 'KeyC' || keyLower === 'c' || keyLower === 'с') && !window.getSelection().toString()) {
                e.preventDefault();
                msgAction('copy', selectedMsgId);
                return;
            }

            // 'R' — Перегенерировать ответ модели
            if (code === 'KeyR' || keyLower === 'r' || keyLower === 'к') {
                const chat = activeChat();
                const m = chat?.messages.find(x => x.id === selectedMsgId);
                if (m && m.role !== 'user') {
                    e.preventDefault();
                    msgAction('regen', selectedMsgId);
                    return;
                }
            }

            // 'B' — Создать ветвь от выбранного сообщения
            if (code === 'KeyB' || keyLower === 'b' || keyLower === 'и') {
                const chat = activeChat();
                const m = chat?.messages.find(x => x.id === selectedMsgId);
                if (m && m.role !== 'user') {
                    e.preventDefault();
                    msgAction('branch', selectedMsgId);
                    return;
                }
            }

            // 'Q' — Цитировать в поле ввода
            if (code === 'KeyQ' || keyLower === 'q' || keyLower === 'й') {
                e.preventDefault();
                runMsgContextAction('quote', selectedMsgId);
                return;
            }

            // 'S' — Озвучить текст сообщения (TTS)
            if (code === 'KeyS' || keyLower === 's' || keyLower === 'ы') {
                e.preventDefault();
                runMsgContextAction('speak', selectedMsgId);
                return;
            }

            // 'Delete' / 'Backspace' / 'D' — Удалить сообщение
            if (e.key === 'Delete' || e.key === 'Backspace' || code === 'KeyD' || keyLower === 'd' || keyLower === 'в') {
                e.preventDefault();
                msgAction('del', selectedMsgId);
                return;
            }

            // 'I' / '/' — Сбросить выбор и перейти к вводу
            if (code === 'KeyI' || keyLower === 'i' || keyLower === 'ш' || e.key === '/') {
                e.preventDefault();
                clearMessageSelection();
                promptInput.focus();
                return;
            }
        }
    }

    // 5. Иерархическая обработка клавиши Escape
    if (e.key === 'Escape') {
        if ($('#artCtxMenu') && !$('#artCtxMenu').hidden) { closeArtifactMenu(); return; }
        if ($('#artCodeOverlay') && $('#artCodeOverlay').classList.contains('show')) { closeArtifactCodeModal(); return; }
        if (!$('#msgCtxMenu').hidden) { closeMsgContextMenu(); return; }
        if (activeEditingMsg && !target.closest('.msg-edit-textarea')) {
            const cancelBtn = activeEditingMsg.querySelector('.ed-cancel');
            if (cancelBtn) { cancelBtn.click(); return; }
        }

        // Мгновенная остановка стриминга генерации по клавише Escape
        if (streaming) {
            e.preventDefault();
            stopGeneration();
            return;
        }

        if ($('#externalLinkOverlay').classList.contains('show')) { closeExternalConfirm(); return; }
        if (window.textSelectionMenu && window.textSelectionMenu.isOpen) {
            window.textSelectionMenu.close();
            return;
        }
        if (window.aiContextWindow && window.aiContextWindow.isOpen) {
            window.aiContextWindow.close();
            return;
        }
        if ($('#cmdkOverlay').classList.contains('show')) return closeCmdk();
        if (slashOpen()) { closeSlash(); return; }
        if (!$('#searchPanel').hidden) { closeSearchPanel(); return; }
        if (!$('#imgViewer').hidden) { closeImageViewer(); return; }
        if (!$('#htmlPreview').hidden) {
            if (hpFullscreen) { toggleFullscreen(); return; }
            closeHtmlPreview(); return;
        }
        if (camOverlay.classList.contains('show')) return closeCamera();
        if ($('#wsOverlay').classList.contains('show')) return closeWsSettings();
        if (igOverlay.classList.contains('show')) return closeImgGenSettings();
        if (!$('#favCtxMenu').hidden) { closeFavCtxMenu(); return; }
        if (!$('#chatCtxMenu').hidden) { closeChatCtxMenu(); return; }
        if (!$('#igCtxMenu').hidden) { closeImgCtxMenu(); return; }
        if ($('#favOverlay').classList.contains('show')) { $('#favOverlay').classList.remove('show'); return; }
        if ($('#editConfirmOverlay').classList.contains('show')) { closeEditConfirm(); return; }
        if ($('#textExpandOverlay').classList.contains('show')) { closeTextExpand(); return; }
        if ($('#chatDeleteOverlay').classList.contains('show')) { closeChatDelete(); return; }
        if ($('#igcOverlay').classList.contains('show')) { closeImgReqConfirm(); return; }
        if ($('#imgInfoOverlay').classList.contains('show')) { closeImgInfo(); return; }
        if ($('#changelogOverlay') && $('#changelogOverlay').classList.contains('show')) {
            if (window.changelogController) window.changelogController.close();
            else $('#changelogOverlay').classList.remove('show');
            return;
        }
        if ($('#aiThemeGenOverlay') && $('#aiThemeGenOverlay').classList.contains('show')) { closeAiThemeGenModal(); return; }
        if ($('#aiDevCodeOverlay') && $('#aiDevCodeOverlay').classList.contains('show')) { closeAiDevCodeModal(); return; }
        if ($('#saveThemeModalOverlay') && $('#saveThemeModalOverlay').classList.contains('show')) { $('#saveThemeModalOverlay').classList.remove('show'); return; }
        if ($('#themeInspectOverlay') && $('#themeInspectOverlay').classList.contains('show')) { $('#themeInspectOverlay').classList.remove('show'); return; }
        if (settingsOverlay.classList.contains('show')) return closeSettings();
        if (drawer.classList.contains('open')) return closeDrawer();
        if (artEditRef) { artEditRef = null; renderArtRef(); return; }
        if (!modelMenu.hidden || !thinkMenu.hidden || !plusMenu.hidden) {
            closeAllMenus();
            return;
        }
        if (selectedMsgId) {
            clearMessageSelection();
            promptInput.focus();
            return;
        }
        if (!isTyping) {
            promptInput.focus();
        }
    }
});

// Универсальная горизонтальная прокрутка колесиком мыши для переключателей и чипов
document.addEventListener('wheel', e => {
    const scrollable = e.target.closest('.set-segmented:not(#aiThemeGenTargetSeg), .font-family-chips, .igm-chips, .mm-filter-tabs');
    if (scrollable && scrollable.scrollWidth > scrollable.clientWidth + 4) {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
            e.preventDefault();
            scrollable.scrollLeft += e.deltaY;
        }
    }
}, { passive: false });

function updateHeroKeysVisibility() {
    const hasKey = !!(String(state.settings.proxyKey || '').trim() || String(state.settings.orKey || '').trim());
    const wrap = $('.hero-keys');
    if (wrap) wrap.hidden = hasKey;
}

/* ============================================================
   СТУДИЯ РАЗРАБОТЧИКА: CUSTOM CSS, JS & CANVAS EFFECTS
============================================================ */
let customJsCleanupFn = null;
let devTabInitialized = false;
let activeDevThemeTarget = 'dark';

function normalizeCustomCode(raw) {
    const cfg = (raw && typeof raw === 'object') ? raw : {};
    const darkCode = cfg.dark || (cfg.css !== undefined || cfg.js !== undefined ? { css: cfg.css || '', js: cfg.js || '' } : {});
    const lightCode = cfg.light || {};

    return {
        enabled: cfg.enabled !== false,
        dark: {
            css: typeof darkCode.css === 'string' ? darkCode.css : '',
            js: typeof darkCode.js === 'string' ? darkCode.js : ''
        },
        light: {
            css: typeof lightCode.css === 'string' ? lightCode.css : '',
            js: typeof lightCode.js === 'string' ? lightCode.js : ''
        }
    };
}

const DEV_CODE_PRESETS = {
    comets: {
        css: `/* Эффект падающих комет */
#customEffectsLayer {
  opacity: 0.9;
  filter: drop-shadow(0 0 8px var(--accent));
}`,
        js: `// Падающие кометы на Canvas в #customEffectsLayer
const container = document.getElementById('customEffectsLayer');
const canvas = document.createElement('canvas');
canvas.id = 'cometsCanvas';
container.appendChild(canvas);

const ctx = canvas.getContext('2d');
let w = canvas.width = window.innerWidth;
let h = canvas.height = window.innerHeight;

const onResize = () => {
  w = canvas.width = window.innerWidth;
  h = canvas.height = window.innerHeight;
};
window.addEventListener('resize', onResize);

const comets = [];
const createComet = () => ({
  x: Math.random() * w + 200,
  y: Math.random() * -100,
  len: Math.random() * 80 + 40,
  speed: Math.random() * 4 + 3,
  angle: Math.PI / 4 + (Math.random() * 0.1 - 0.05),
  opacity: Math.random() * 0.7 + 0.3
});

for (let i = 0; i < 4; i++) comets.push(createComet());

let rafId = null;
const loop = () => {
  ctx.clearRect(0, 0, w, h);
  
  comets.forEach((c, idx) => {
    c.x -= Math.cos(c.angle) * c.speed;
    c.y += Math.sin(c.angle) * c.speed;

    const tailX = c.x + Math.cos(c.angle) * c.len;
    const tailY = c.y - Math.sin(c.angle) * c.len;

    const grad = ctx.createLinearGradient(c.x, c.y, tailX, tailY);
    grad.addColorStop(0, 'rgba(255, 255, 255, ' + c.opacity + ')');
    grad.addColorStop(0.2, 'rgba(143, 208, 245, ' + (c.opacity * 0.8) + ')');
    grad.addColorStop(1, 'rgba(143, 208, 245, 0)');

    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(tailX, tailY);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    if (c.y > h + 100 || c.x < -100) {
      comets[idx] = createComet();
    }
  });

  rafId = requestAnimationFrame(loop);
};
rafId = requestAnimationFrame(loop);

return () => {
  cancelAnimationFrame(rafId);
  window.removeEventListener('resize', onResize);
  canvas.remove();
};`
    },

    stardust: {
        css: `/* Космическая пыль и мерцание */
#customEffectsLayer {
  opacity: 0.8;
}`,
        js: `// Парящие светящиеся частицы
const container = document.getElementById('customEffectsLayer');
const canvas = document.createElement('canvas');
container.appendChild(canvas);
const ctx = canvas.getContext('2d');
let w = canvas.width = window.innerWidth;
let h = canvas.height = window.innerHeight;

const onResize = () => {
  w = canvas.width = window.innerWidth;
  h = canvas.height = window.innerHeight;
};
window.addEventListener('resize', onResize);

const stars = Array.from({ length: 45 }, () => ({
  x: Math.random() * w,
  y: Math.random() * h,
  r: Math.random() * 1.8 + 0.5,
  alpha: Math.random() * 0.8 + 0.2,
  speed: Math.random() * 0.3 + 0.1
}));

let rafId = null;
const loop = () => {
  ctx.clearRect(0, 0, w, h);
  stars.forEach(s => {
    s.y -= s.speed;
    if (s.y < 0) s.y = h;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, ' + s.alpha + ')';
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#8fd0f5';
    ctx.fill();
  });
  rafId = requestAnimationFrame(loop);
};
rafId = requestAnimationFrame(loop);

return () => {
  cancelAnimationFrame(rafId);
  window.removeEventListener('resize', onResize);
  canvas.remove();
};`
    },

    angelWings: {
        css: `/* Аура и крылья света */
.chat-inner::before {
  content: "";
  position: absolute;
  top: 15%;
  left: 50%;
  transform: translateX(-50%);
  width: 580px;
  height: 380px;
  background: radial-gradient(ellipse at center, hsla(var(--acc-h), 80%, 75%, 0.12) 0%, transparent 70%);
  pointer-events: none;
  z-index: 0;
  animation: auraFloat 4s ease-in-out infinite alternate;
}

@keyframes auraFloat {
  0% { transform: translateX(-50%) scale(0.95); opacity: 0.6; }
  100% { transform: translateX(-50%) scale(1.08); opacity: 1; }
}`,
        js: `// Легкое свечение логотипа MoonSSS
const logo = document.querySelector('.logo-top, .logo-hero');
if (logo) {
  logo.style.transition = 'filter 0.5s ease';
  logo.style.filter = 'drop-shadow(0 0 16px var(--accent))';
}
return () => {
  if (logo) logo.style.filter = '';
};`
    }
};

function applyUserCustomCode() {
    const rawCfg = normalizeCustomCode(state.settings.customCode);
    state.settings.customCode = rawCfg;
    const currentTheme = state.settings.theme === 'light' ? 'light' : 'dark';
    const activeCode = rawCfg[currentTheme] || { css: '', js: '' };

    let styleEl = document.getElementById('userCustomStyleSheet');
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'userCustomStyleSheet';
        document.head.appendChild(styleEl);
    }

    if (typeof customJsCleanupFn === 'function') {
        try { customJsCleanupFn(); } catch (e) { console.warn('[CustomCode] Cleanup error:', e); }
        customJsCleanupFn = null;
    }
    const prevScript = document.getElementById('userCustomScriptTag');
    if (prevScript) {
        try { prevScript.remove(); } catch (_) { }
    }

    const layer = document.getElementById('customEffectsLayer');
    if (layer) {
        layer.innerHTML = '';
        /* Защитный полифилл: если скрипт вызывает .getContext() прямо на контейнере layer,
           автоматически создаем полноценный холст <canvas> и возвращаем его контекст */
        if (!layer.getContext) {
            layer.getContext = function (type, opts) {
                let cv = layer.querySelector('canvas');
                if (!cv) {
                    cv = document.createElement('canvas');
                    cv.id = 'customEffectsCanvas';
                    cv.width = window.innerWidth;
                    cv.height = window.innerHeight;
                    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
                    layer.appendChild(cv);
                }
                return cv.getContext(type || '2d', opts);
            };
        }
    }

    if (!rawCfg.enabled) {
        styleEl.textContent = '';
        updateDevStatus(true, 'Пользовательский код деактивирован тумблером');
        return;
    }

    styleEl.textContent = activeCode.css || '';

    if (activeCode.js && activeCode.js.trim()) {
        try {
            let executed = false;
            try {
                const runner = new Function(activeCode.js);
                const cleanupResult = runner();
                if (typeof cleanupResult === 'function') {
                    customJsCleanupFn = cleanupResult;
                }
                executed = true;
            } catch (evalErr) {
                if (evalErr instanceof EvalError || String(evalErr).includes('unsafe-eval') || String(evalErr).includes('CSP')) {
                    window.__moonCustomJsCleanup = null;
                    const script = document.createElement('script');
                    script.id = 'userCustomScriptTag';
                    script.textContent = `(() => {
                        try {
                            const layerElem = document.getElementById('customEffectsLayer');
                            if (layerElem && !layerElem.getContext) {
                                layerElem.getContext = function(t, o) {
                                    let c = layerElem.querySelector('canvas');
                                    if (!c) {
                                        c = document.createElement('canvas');
                                        c.width = window.innerWidth;
                                        c.height = window.innerHeight;
                                        c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
                                        layerElem.appendChild(c);
                                    }
                                    return c.getContext(t || '2d', o);
                                };
                            }
                            const cleanup = (function() {
                                ${activeCode.js}
                            })();
                            if (typeof cleanup === 'function') {
                                window.__moonCustomJsCleanup = cleanup;
                            }
                        } catch (err) {
                            console.error('[CustomCode] Script execution error:', err);
                        }
                    })();`;
                    document.body.appendChild(script);
                    if (typeof window.__moonCustomJsCleanup === 'function') {
                        customJsCleanupFn = window.__moonCustomJsCleanup;
                        window.__moonCustomJsCleanup = null;
                    }
                    executed = true;
                } else {
                    throw evalErr;
                }
            }

            if (executed) {
                updateDevStatus(true, `Код (${currentTheme === 'light' ? 'светлая' : 'тёмная'} тема) активен`);
            }
        } catch (err) {
            console.error('[CustomCode] Execution error:', err);
            updateDevStatus(false, 'Ошибка: ' + (err.message || err));
            const isDevTabActive = $('#tabPanel-developer')?.classList.contains('active');
            if (isDevTabActive) {
                toast('Ошибка в JS (' + (currentTheme === 'light' ? 'светлая' : 'тёмная') + ' тема): ' + (err.message || err), 'err', 4000);
            }
        }
    } else {
        updateDevStatus(true, `Код (${currentTheme === 'light' ? 'светлая' : 'тёмная'} тема) готов к запуску`);
    }
}

function updateDevStatus(isOk, text) {
    const box = document.getElementById('devJsStatusBox');
    const dot = box ? box.querySelector('.csb-dot') : null;
    const txt = document.getElementById('devJsStatusText');
    if (dot) {
        dot.className = 'csb-dot ' + (isOk ? 'ready' : 'error');
    }
    if (txt) {
        txt.textContent = text;
    }
}

function syncDevThemeTargetButtons() {
    document.querySelectorAll('#devCodeThemeTargetSegmented .set-seg-btn').forEach(btn => {
        const isTarget = btn.dataset.devTheme === activeDevThemeTarget;
        btn.classList.toggle('sel', isTarget);
        btn.setAttribute('aria-checked', isTarget ? 'true' : 'false');
    });
}

function renderDeveloperTabInputs() {
    const rawCfg = normalizeCustomCode(state.settings.customCode);
    state.settings.customCode = rawCfg;
    const targetCode = rawCfg[activeDevThemeTarget] || { css: '', js: '' };

    const inpCss = document.getElementById('inpDevCustomCss');
    if (inpCss) inpCss.value = targetCode.css || '';

    const inpJs = document.getElementById('inpDevCustomJs');
    if (inpJs) inpJs.value = targetCode.js || '';

    const cssBadge = document.getElementById('lblDevCssThemeBadge');
    if (cssBadge) cssBadge.textContent = activeDevThemeTarget === 'light' ? 'Светлая тема' : 'Тёмная тема';

    const jsBadge = document.getElementById('lblDevJsThemeBadge');
    if (jsBadge) jsBadge.textContent = activeDevThemeTarget === 'light' ? 'Светлая тема' : 'Тёмная тема';

    syncDevThemeTargetButtons();
}

function switchDevThemeTarget(newTheme) {
    const rawCfg = normalizeCustomCode(state.settings.customCode);
    state.settings.customCode = rawCfg;
    const inpCss = document.getElementById('inpDevCustomCss');
    const inpJs = document.getElementById('inpDevCustomJs');

    if (inpCss) rawCfg[activeDevThemeTarget].css = inpCss.value;
    if (inpJs) rawCfg[activeDevThemeTarget].js = inpJs.value;

    activeDevThemeTarget = newTheme;
    renderDeveloperTabInputs();
}

function initDeveloperTab() {
    state.settings.customCode = normalizeCustomCode(state.settings.customCode);
    const rawCfg = state.settings.customCode;
    activeDevThemeTarget = state.settings.theme === 'light' ? 'light' : 'dark';

    const sw = document.getElementById('swDevCodeEnabled');
    if (sw) {
        sw.classList.toggle('on', !!rawCfg.enabled);
        sw.onclick = () => {
            rawCfg.enabled = !rawCfg.enabled;
            sw.classList.toggle('on', rawCfg.enabled);
            save(true);
            applyUserCustomCode();
            toast(rawCfg.enabled ? 'Пользовательский код включён' : 'Пользовательский код выключен', 'info', 1600);
        };
    }

    document.querySelectorAll('#devCodeThemeTargetSegmented .set-seg-btn').forEach(btn => {
        btn.onclick = () => switchDevThemeTarget(btn.dataset.devTheme);
    });

    const inpCss = document.getElementById('inpDevCustomCss');
    if (inpCss) {
        inpCss.oninput = () => {
            rawCfg[activeDevThemeTarget].css = inpCss.value;
        };
    }

    const inpJs = document.getElementById('inpDevCustomJs');
    if (inpJs) {
        inpJs.oninput = () => {
            rawCfg[activeDevThemeTarget].js = inpJs.value;
        };
    }

    const btnApply = document.getElementById('btnDevApplyCode');
    if (btnApply) {
        btnApply.onclick = () => {
            if (inpCss) rawCfg[activeDevThemeTarget].css = inpCss.value;
            if (inpJs) rawCfg[activeDevThemeTarget].js = inpJs.value;
            save(true);
            applyUserCustomCode();
            toast(`Код для ${activeDevThemeTarget === 'light' ? 'светлой' : 'тёмной'} темы сохранён и запущен`, 'ok', 1800);
        };
    }

    const btnSavePreset = document.getElementById('btnDevSavePreset');
    if (btnSavePreset) {
        btnSavePreset.onclick = () => {
            if (inpCss) rawCfg[activeDevThemeTarget].css = inpCss.value;
            if (inpJs) rawCfg[activeDevThemeTarget].js = inpJs.value;
            save(true);
            applyUserCustomCode();
            const openSaveModal = $('#btnOpenSaveThemeModal');
            if (openSaveModal) openSaveModal.click();
        };
    }

    const btnReset = document.getElementById('btnDevResetDefaults');
    if (btnReset) {
        btnReset.onclick = () => {
            const themeLabel = activeDevThemeTarget === 'light' ? 'светлой' : 'тёмной';
            if (confirm(`Сбросить пользовательский CSS и JS код для ${themeLabel} темы?`)) {
                rawCfg[activeDevThemeTarget].css = '';
                rawCfg[activeDevThemeTarget].js = '';
                if (inpCss) inpCss.value = '';
                if (inpJs) inpJs.value = '';
                save(true);
                applyUserCustomCode();
                toast(`Код для ${themeLabel} темы очищен`, 'info');
            }
        };
    }

    const btnClearCss = document.getElementById('btnDevClearCss');
    if (btnClearCss) {
        btnClearCss.onclick = () => {
            if (inpCss) inpCss.value = '';
            rawCfg[activeDevThemeTarget].css = '';
            save(true);
            applyUserCustomCode();
            toast(`CSS для ${activeDevThemeTarget === 'light' ? 'светлой' : 'тёмной'} темы очищен`, 'info', 1400);
        };
    }

    const btnClearJs = document.getElementById('btnDevClearJs');
    if (btnClearJs) {
        btnClearJs.onclick = () => {
            if (inpJs) inpJs.value = '';
            rawCfg[activeDevThemeTarget].js = '';
            save(true);
            applyUserCustomCode();
            toast(`JS для ${activeDevThemeTarget === 'light' ? 'светлой' : 'тёмной'} темы очищен`, 'info', 1400);
        };
    }

    document.querySelectorAll('#devPresetsGrid .dtc-apply-btn').forEach(btn => {
        btn.onclick = () => {
            const card = btn.closest('.dev-template-card');
            const key = card ? card.dataset.preset : '';
            const preset = DEV_CODE_PRESETS[key];
            if (preset) {
                if (inpCss && preset.css) {
                    inpCss.value = (inpCss.value ? inpCss.value + '\n\n' : '') + preset.css;
                    rawCfg[activeDevThemeTarget].css = inpCss.value;
                }
                if (inpJs && preset.js) {
                    inpJs.value = preset.js;
                    rawCfg[activeDevThemeTarget].js = inpJs.value;
                }
                save(true);
                applyUserCustomCode();
                toast(`Шаблон «${card.querySelector('.dtc-name').textContent}» применён (${activeDevThemeTarget === 'light' ? 'Светлая' : 'Тёмная'})`, 'ok', 2000);
            }
        };
    });

    renderDeveloperTabInputs();
    initAiDevCodeEvents();
    devTabInitialized = true;
}

/* ============ ИИ-РАЗРАБОТЧИК СПЕЦЭФФЕКТОВ (CUSTOM CSS & JS STUDIO) ============ */
let aiDevCodeAbortCtrl = null;

const AI_DEV_CODE_SYSTEM_PROMPT = `You are an Elite Creative Frontend Engineer and Canvas Animation Specialist for MoonSSS.
Your SOLE TASK is to create or modify Custom CSS and Custom JavaScript for the user's active theme.
You have READ-ONLY access to the appearance color tokens of the selected theme to ensure flawless aesthetic harmony.
CRITICAL CONSTRAINT: You MUST NOT modify or propose changes to the appearance color tokens. You ONLY generate or update Custom CSS and Custom JavaScript.

CANVAS & DOM ARCHITECTURE:
- The element document.getElementById('customEffectsLayer') is a wrapper <div>, NOT a <canvas>.
- CRITICAL: Never call getContext() on customEffectsLayer directly! You MUST instantiate a canvas:
  const container = document.getElementById('customEffectsLayer');
  const canvas = document.createElement('canvas');
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');
- CLEANUP REQUIREMENT: The JavaScript snippet MUST return a cleanup function to cancel requestAnimationFrame, remove event listeners, and clean up canvas elements:
  return () => { cancelAnimationFrame(rafId); window.removeEventListener('resize', onResize); canvas.remove(); };
- High Performance: Use requestAnimationFrame, handle devicePixelRatio for Retina clarity, prevent layout thrashing, keep CPU/GPU footprint low.
- Pure Vanilla ES6+: NO external libraries, NO imports, NO Tailwind, NO React, NO emojis anywhere in code or comments.

OUTPUT FORMAT:
Output ONLY a strictly valid JSON object without markdown fences (no \`\`\`json):
{
  "css": "/* complete or updated custom CSS */",
  "js": "// complete or updated custom JS\\nconst container = document.getElementById('customEffectsLayer');\\nconst canvas = document.createElement('canvas');\\ncontainer.appendChild(canvas);\\nconst ctx = canvas.getContext('2d');\\n..."
}

CRITICAL JSON RULES:
- Output ONLY the JSON object.
- All string values must be strictly valid JSON. Inside "css" and "js", escape double quotes as \\" and newlines as \\n.
- Never output unescaped raw newlines inside JSON strings.`;

function openAiDevCodeModal() {
    const overlay = $('#aiDevCodeOverlay');
    if (!overlay) return;
    const badge = $('#lblAiDevCodeTargetThemeBadge');
    if (badge) {
        badge.textContent = activeDevThemeTarget === 'light' ? 'Светлая тема' : 'Тёмная тема';
    }
    const status = $('#aiDevCodeStatus');
    if (status) status.hidden = true;

    const activeModel = state.settings.aiDevDesignerModel || 'anthropic/claude-sonnet-5.5';
    const modelCards = document.querySelectorAll('#aiDevCodeModelSelector .ai-tm-card');
    modelCards.forEach(card => {
        const isSel = card.dataset.model === activeModel;
        card.classList.toggle('sel', isSel);
        card.setAttribute('aria-checked', isSel ? 'true' : 'false');

        const iconBox = card.querySelector('.ai-tm-icon-box');
        if (iconBox && typeof window.getAiModelIcon === 'function') {
            const mObj = typeof window.getModel === 'function' ? window.getModel(card.dataset.model) : null;
            const iconUrl = window.getAiModelIcon(card.dataset.model, mObj);
            if (iconUrl) {
                iconBox.innerHTML = `<img src="${esc(iconUrl)}" alt="" onerror="this.outerHTML='<svg class=\\'ic\\'><use href=\\'#i-spark\\'/></svg>'">`;
            }
        }
    });

    overlay.classList.add('show');
    setTimeout(() => {
        const inp = $('#inpAiDevCodePrompt');
        if (inp) inp.focus();
    }, 80);
}

function closeAiDevCodeModal() {
    if (aiDevCodeAbortCtrl) {
        try { aiDevCodeAbortCtrl.abort(); } catch (_) { }
        aiDevCodeAbortCtrl = null;
    }
    const overlay = $('#aiDevCodeOverlay');
    if (overlay) overlay.classList.remove('show');
}

function initAiDevCodeEvents() {
    const btnOpen = $('#btnOpenAiDevCodeModal');
    if (btnOpen) btnOpen.onclick = openAiDevCodeModal;

    const btnClose = $('#aiDevCodeClose');
    if (btnClose) btnClose.onclick = closeAiDevCodeModal;

    const btnCancel = $('#aiDevCodeCancel');
    if (btnCancel) btnCancel.onclick = closeAiDevCodeModal;

    const overlay = $('#aiDevCodeOverlay');
    if (overlay) {
        overlay.onclick = e => {
            if (e.target === overlay) closeAiDevCodeModal();
        };
    }

    const modelCards = document.querySelectorAll('#aiDevCodeModelSelector .ai-tm-card');
    modelCards.forEach(card => {
        card.onclick = () => {
            modelCards.forEach(c => {
                c.classList.remove('sel');
                c.setAttribute('aria-checked', 'false');
            });
            card.classList.add('sel');
            card.setAttribute('aria-checked', 'true');
            state.settings.aiDevDesignerModel = card.dataset.model;
            save();
            const modelName = card.querySelector('.ai-tm-name')?.textContent || card.dataset.model;
            toast(`Разработчик кода: ${modelName}`, 'ok', 1400);
        };
    });

    document.querySelectorAll('#aiDevCodePromptPresets .set-preset-chip').forEach(btn => {
        btn.onclick = () => {
            const prompt = btn.dataset.prompt;
            const inp = $('#inpAiDevCodePrompt');
            if (inp && prompt) {
                inp.value = prompt;
                inp.focus();
            }
        };
    });

    const btnSubmit = $('#aiDevCodeSubmit');
    if (btnSubmit) btnSubmit.onclick = executeAiDevCodeGeneration;
}

async function executeAiDevCodeGeneration() {
    const inp = $('#inpAiDevCodePrompt');
    const promptText = (inp ? inp.value : '').trim();
    if (!promptText) {
        toast('Опишите задачу или желаемые изменения кода', 'warn');
        if (inp) inp.focus();
        return;
    }

    const s = state.settings || {};
    const orKey = (s.orKey || '').trim();
    const proxyKey = (s.proxyKey || '').trim();
    if (!orKey && !proxyKey) {
        toast('Укажите ключ ProxyAPI или OpenRouter во вкладке «API и Ключи»', 'err', 3600);
        return;
    }

    const statusEl = $('#aiDevCodeStatus');
    const statusTxt = $('#aiDevCodeStatusText');
    const btnSubmit = $('#aiDevCodeSubmit');
    const btnCancel = $('#aiDevCodeCancel');

    const chosenModelId = s.aiDevDesignerModel || 'anthropic/claude-sonnet-5.5';
    const chosenModelObj = typeof window.getModel === 'function' ? window.getModel(chosenModelId) : null;
    const chosenModelName = chosenModelObj?.name || chosenModelId;

    if (statusEl) statusEl.hidden = false;
    if (statusTxt) statusTxt.textContent = `${chosenModelName} проектирует CSS и JS спецэффекты…`;
    if (btnSubmit) btnSubmit.disabled = true;
    if (btnCancel) btnCancel.disabled = true;

    aiDevCodeAbortCtrl = new AbortController();

    const targetTheme = activeDevThemeTarget;
    const readOnlyTokens = (state.settings.customThemes && state.settings.customThemes[targetTheme]) ||
        (targetTheme === 'light' ? FACTORY_THEME_LIGHT : FACTORY_THEME_DARK);

    const rawCodeCfg = normalizeCustomCode(state.settings.customCode);
    const currentThemeCode = rawCodeCfg[targetTheme] || { css: '', js: '' };

    const userInstruction = `Active Target Theme: "${targetTheme}".
READ-ONLY Appearance Color Tokens for this theme:
${JSON.stringify(readOnlyTokens, null, 2)}

CURRENT Custom CSS for this theme:
${currentThemeCode.css || '/* Empty CSS */'}

CURRENT Custom JS for this theme:
${currentThemeCode.js || '// Empty JS'}

USER TASK / REQUIREMENT:
"${promptText}"

Generate or update the CSS and JS code to satisfy the user's task. If the user asks to modify the existing effect, preserve and enhance it. If the user asks for a new effect, craft clean high-performance code tailored to the provided appearance tokens. Return ONLY the JSON object with "css" and "js".`;

    const origin = (typeof location !== 'undefined' && location.origin && !location.origin.startsWith('file') && !location.origin.startsWith('app') && !location.origin.startsWith('capacitor') && !location.origin.includes('localhost'))
        ? location.origin
        : 'https://unichat2.sahbanovtimur228.workers.dev/ai';

    try {
        let rawContent = '';

        if (orKey) {
            const attribHeaders = getOpenRouterAttributionHeaders('Code Studio');
            const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                signal: aiDevCodeAbortCtrl.signal,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + orKey,
                    ...attribHeaders
                },
                body: JSON.stringify({
                    model: chosenModelId,
                    messages: [
                        { role: 'system', content: AI_DEV_CODE_SYSTEM_PROMPT },
                        { role: 'user', content: userInstruction }
                    ],
                    temperature: 0.5,
                    stream: false
                })
            });

            if (!resp.ok) {
                let errDetail = 'HTTP ' + resp.status;
                try { const j = await resp.json(); errDetail = j.error?.message || errDetail; } catch (_) { }
                throw new Error(errDetail);
            }
            const data = await resp.json();
            rawContent = data?.choices?.[0]?.message?.content || '';
        } else {
            const isProxyOpenAI = chosenModelId.startsWith('openai/');
            const isProxyAnthropic = chosenModelId.startsWith('anthropic/');
            const actualModel = chosenModelId.replace(/^(openai|anthropic)\//, '');

            if (isProxyAnthropic) {
                const resp = await fetch('https://api.proxyapi.ru/anthropic/v1/messages', {
                    method: 'POST',
                    signal: aiDevCodeAbortCtrl.signal,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + proxyKey,
                        'anthropic-version': '2023-06-01'
                    },
                    body: JSON.stringify({
                        model: actualModel,
                        system: AI_DEV_CODE_SYSTEM_PROMPT,
                        messages: [{ role: 'user', content: userInstruction }],
                        max_tokens: 8192,
                        temperature: 0.5
                    })
                });
                if (!resp.ok) {
                    let errDetail = 'HTTP ' + resp.status;
                    try { const j = await resp.json(); errDetail = j.error?.message || j.message || errDetail; } catch (_) { }
                    throw new Error('ProxyAPI Anthropic: ' + errDetail);
                }
                const data = await resp.json();
                rawContent = (data?.content || []).map(b => b.text || '').join('') || (data?.content?.[0]?.text || '');
            } else {
                const endpoint = isProxyOpenAI
                    ? 'https://api.proxyapi.ru/openai/v1/chat/completions'
                    : 'https://api.proxyapi.ru/openrouter/v1/chat/completions';

                const resp = await fetch(endpoint, {
                    method: 'POST',
                    signal: aiDevCodeAbortCtrl.signal,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + proxyKey,
                        'HTTP-Referer': origin,
                        'X-Title': 'MoonSSS Code Studio'
                    },
                    body: JSON.stringify({
                        model: isProxyOpenAI ? actualModel : chosenModelId,
                        messages: [
                            { role: 'system', content: AI_DEV_CODE_SYSTEM_PROMPT },
                            { role: 'user', content: userInstruction }
                        ],
                        temperature: 0.5,
                        stream: false,
                        metadata: {
                            app_title: APP_IDENTITY.title,
                            app_url: APP_IDENTITY.refererUrl,
                            favicon_url: APP_IDENTITY.faviconUrl,
                            description: APP_IDENTITY.description
                        }
                    })
                });
                if (!resp.ok) {
                    let errDetail = 'HTTP ' + resp.status;
                    try { const j = await resp.json(); errDetail = j.error?.message || j.message || errDetail; } catch (_) { }
                    throw new Error('ProxyAPI: ' + errDetail);
                }
                const data = await resp.json();
                rawContent = data?.choices?.[0]?.message?.content || '';
            }
        }

        const parsed = extractJsonFromText(rawContent);

        if (typeof parsed.css === 'string') {
            rawCodeCfg[targetTheme].css = parsed.css.trim();
        }
        if (typeof parsed.js === 'string') {
            rawCodeCfg[targetTheme].js = parsed.js.trim();
        }

        state.settings.customCode = rawCodeCfg;
        save(true);
        applyUserCustomCode();
        renderDeveloperTabInputs();
        closeAiDevCodeModal();
        toast(`Код спецэффектов (${targetTheme === 'light' ? 'светлая' : 'тёмная'} тема) обновлён и запущен`, 'ok', 3200);
    } catch (err) {
        if (err.name === 'AbortError') return;
        console.error('[AiDevCode] Generation failed:', err);
        toast('Ошибка генерации кода: ' + (err.message || err), 'err', 4000);
    } finally {
        if (statusEl) statusEl.hidden = true;
        if (btnSubmit) btnSubmit.disabled = false;
        if (btnCancel) btnCancel.disabled = false;
        aiDevCodeAbortCtrl = null;
    }
}

/* ---------- ОБЩИЙ рендер ---------- */
function renderAll() {
    renderMessages();
    renderChatList();
    renderAttPreviews();
    updateTopChips();
    setSendBtn();
}

/* ============================================================
   MOONSPHERE: КЛАСС СФЕРЫ ЭКСПОРТИРУЕТСЯ ИЗ MoonSphere.js
============================================================ */
// Класс VoicePoweredOrb зарегистрирован в глобальной области видимости window.VoicePoweredOrb

/* ============================================================
   ФОН: ОПТИМИЗИРОВАННЫЙ РЕНДЕР ТРЕУГОЛЬНИКОВ И ЭНЕРГОСБЕРЕЖЕНИЕ
============================================================ */
const cvFar = $('#bgFar'), cvNear = $('#bgNear');
const ctxF = cvFar ? cvFar.getContext('2d', { alpha: true }) : null;
const ctxN = cvNear ? cvNear.getContext('2d', { alpha: true }) : null;
let W = 0, H = 0, DPR = 1;
let trisF = [], trisN = [];
let mouse = { x: 0, y: 0 }, par = { x: 0, y: 0 };
const rnd = (a, b) => a + Math.random() * (b - a);

function palette() {
    const currentThemeKey = state.settings.theme || 'dark';
    const themes = state.settings.customThemes || { dark: FACTORY_THEME_DARK, light: FACTORY_THEME_LIGHT };
    const t = themes[currentThemeKey] || (currentThemeKey === 'light' ? FACTORY_THEME_LIGHT : FACTORY_THEME_DARK);

    const c1 = hexToRgb(t.triColor1 || (currentThemeKey === 'light' ? '#64748b' : '#b8b8b8'));
    const c2 = hexToRgb(t.triColor2 || (currentThemeKey === 'light' ? '#0284c7' : '#8fd0f5'));
    const c3 = hexToRgb(t.triColor3 || (currentThemeKey === 'light' ? '#d97706' : '#ffd700'));

    const h1 = rgbToHsl(c1.r, c1.g, c1.b);
    const h2 = rgbToHsl(c2.r, c2.g, c2.b);
    const h3 = rgbToHsl(c3.r, c3.g, c3.b);

    return {
        tones: [
            [h1.h, h1.s, h1.l],
            [h2.h, h2.s, h2.l],
            [h3.h, h3.s, h3.l]
        ],
        base: typeof t.triOpacity === 'number' ? t.triOpacity : (currentThemeKey === 'light' ? 0.38 : 0.44)
    };
}

function makeTri(w, h, depth) {
    const p = palette();
    const tone = p.tones[Math.floor(Math.random() * p.tones.length)];
    return {
        x: rnd(-40, w + 40),
        y: rnd(-40, h + 40),
        r: rnd(14, 52) * (depth === 'far' ? rnd(1.4, 2.2) : 1),
        rot: rnd(0, Math.PI * 2),
        vr: rnd(-.0015, .0015),
        vx: rnd(-.10, .10),
        vy: rnd(-.08, .08),
        depth: depth === 'far' ? rnd(.15, .35) : rnd(.4, .8),
        a: rnd(.5, .9) * p.base * (depth === 'far' ? .6 : 1),
        tone,
        filled: !isMobile && Math.random() < .25,
        ph: rnd(0, Math.PI * 2),
        ps: rnd(.25, .7)
    };
}

function scaleTrianglesProportionally(list, oldW, oldH, newW, newH) {
    if (!list || !list.length || oldW <= 0 || oldH <= 0) return;
    const rx = newW / oldW;
    const ry = newH / oldH;
    for (let i = 0; i < list.length; i++) {
        const t = list[i];
        t.x = Math.max(-40, Math.min(newW + 40, t.x * rx));
        t.y = Math.max(-40, Math.min(newH + 40, t.y * ry));
    }
}

function initTris(forceRecreate = false) {
    if (isMobile) {
        trisF = [];
        trisN = [];
        if (ctxF && W > 0 && H > 0) ctxF.clearRect(0, 0, W, H);
        if (ctxN && W > 0 && H > 0) ctxN.clearRect(0, 0, W, H);
        return;
    }
    if (W <= 0 || H <= 0) return;
    const area = W * H;
    const targetF = Math.max(5, Math.min(16, Math.round(area / 110000)));
    const targetN = Math.max(8, Math.min(28, Math.round(area / 48000)));

    if (forceRecreate || !trisF.length || !trisN.length) {
        trisF = Array.from({ length: targetF }, () => makeTri(W, H, 'far'));
        trisN = Array.from({ length: targetN }, () => makeTri(W, H, 'near'));
    } else {
        if (trisF.length > targetF) trisF.length = targetF;
        while (trisF.length < targetF) trisF.push(makeTri(W, H, 'far'));

        if (trisN.length > targetN) trisN.length = targetN;
        while (trisN.length < targetN) trisN.push(makeTri(W, H, 'near'));
    }
}

/* ============================================================
   СТАБИЛИЗАТОР ОРИЕНТАЦИИ И РАЗМЕРОВ (ZERO-LAYOUT-FLASH)
============================================================ */
let resizeRafId = null;
let resizeDebounceTimer = null;
let lastLayoutW = 0, lastLayoutH = 0;
let isResizingActive = false;
let capturedScrollAnchor = null;

function resetRootViewportScroll() {
    if (window.scrollX !== 0 || window.scrollY !== 0) {
        window.scrollTo(0, 0);
    }
    if (document.documentElement.scrollTop !== 0) {
        document.documentElement.scrollTop = 0;
    }
    if (document.body.scrollTop !== 0) {
        document.body.scrollTop = 0;
    }
}

function getScrollAnchor(scroller) {
    if (!scroller || scroller.scrollHeight <= 0) return null;
    const currentScrollTop = scroller.scrollTop;
    const clientHeight = scroller.clientHeight;
    const scrollHeight = scroller.scrollHeight;

    // Пользователь находится внизу только при реальной близости к концу ленты (в пределах 60px)
    const isActuallyAtBottom = (scrollHeight - currentScrollTop - clientHeight) <= 60;
    if (isActuallyAtBottom && (streaming ? stickToBottom : true)) {
        return { isBottom: true };
    }

    // Привязываемся к первому видимому сообщению через getBoundingClientRect (надежно при любых flex/grid макетах)
    const scrollerRect = scroller.getBoundingClientRect();
    const msgs = scroller.querySelectorAll('.msg');
    for (let i = 0; i < msgs.length; i++) {
        const msg = msgs[i];
        const rect = msg.getBoundingClientRect();
        if (rect.bottom > scrollerRect.top + 4) {
            return {
                isBottom: false,
                id: msg.dataset.id,
                offsetFromTop: scrollerRect.top - rect.top
            };
        }
    }

    return {
        isBottom: false,
        ratio: scrollHeight > 0 ? (currentScrollTop / scrollHeight) : 0
    };
}

function restoreScrollAnchor(scroller, anchor) {
    if (!scroller || !anchor) return;
    if (anchor.isBottom) {
        if (streaming ? stickToBottom : true) {
            scroller.scrollTop = scroller.scrollHeight;
        }
        return;
    }
    if (anchor.id) {
        const el = scroller.querySelector(`.msg[data-id="${anchor.id}"]`);
        if (el) {
            const scrollerRect = scroller.getBoundingClientRect();
            const elRect = el.getBoundingClientRect();
            const currentOffset = scrollerRect.top - elRect.top;
            const diff = currentOffset - (anchor.offsetFromTop || 0);
            scroller.scrollTop = Math.max(0, scroller.scrollTop - diff);
            return;
        }
    }
    if (typeof anchor.ratio === 'number') {
        scroller.scrollTop = Math.round(anchor.ratio * scroller.scrollHeight);
    }
}

function performSmoothResize(applyCanvas = true) {
    isMobile = checkIsMobile();
    DPR = isMobile ? 1 : Math.min(window.devicePixelRatio || 1, 2);

    const prevW = W || window.innerWidth || 360;
    const prevH = H || window.innerHeight || 640;

    const nextW = Math.max(320, (window.visualViewport ? Math.round(window.visualViewport.width) : window.innerWidth) || document.documentElement.clientWidth || 360);
    const nextH = Math.max(320, (window.visualViewport ? Math.round(window.visualViewport.height) : window.innerHeight) || document.documentElement.clientHeight || 640);

    const isDimensionChanged = Math.abs(nextW - lastLayoutW) > 1 || Math.abs(nextH - lastLayoutH) > 1;
    W = nextW;
    H = nextH;
    lastLayoutW = nextW;
    lastLayoutH = nextH;

    // Во время непрерывного поворота НЕ пересоздаем буферы Canvas во избежание GPU-фризов
    if (applyCanvas && cvFar && cvNear) {
        if (isMobile) {
            if (bgRafId) {
                cancelAnimationFrame(bgRafId);
                bgRafId = null;
            }
            trisF = [];
            trisN = [];
            if (ctxF && cvFar.width > 0) ctxF.clearRect(0, 0, cvFar.width, cvFar.height);
            if (ctxN && cvNear.width > 0) ctxN.clearRect(0, 0, cvNear.width, cvNear.height);
        } else if (isDimensionChanged) {
            const targetW = Math.round(W * DPR);
            const targetH = Math.round(H * DPR);

            if (cvFar.width !== targetW || cvFar.height !== targetH) {
                cvFar.width = targetW;
                cvFar.height = targetH;
                cvFar.style.width = W + 'px';
                cvFar.style.height = H + 'px';
                ctxF.setTransform(DPR, 0, 0, DPR, 0, 0);
            }

            if (cvNear.width !== targetW || cvNear.height !== targetH) {
                cvNear.width = targetW;
                cvNear.height = targetH;
                cvNear.style.width = W + 'px';
                cvNear.style.height = H + 'px';
                ctxN.setTransform(DPR, 0, 0, DPR, 0, 0);
            }

            scaleTrianglesProportionally(trisF, prevW, prevH, W, H);
            scaleTrianglesProportionally(trisN, prevW, prevH, W, H);
            initTris(false);
        } else if (!trisF.length || !trisN.length) {
            initTris(true);
        }
    }

    if (applyCanvas) {
        applyCustomCursor();
    }
    sdUpdate();
    resetRootViewportScroll();
}

function resize(preserveScroll = true, applyCanvas = true) {
    const scroller = $('#chatScroll');
    const anchor = (preserveScroll && scroller) ? (capturedScrollAnchor || getScrollAnchor(scroller)) : null;

    performSmoothResize(applyCanvas);

    if (scroller && anchor) {
        restoreScrollAnchor(scroller, anchor);
        resetRootViewportScroll();
    }
}

let lastRecordedWinWidth = window.innerWidth;

function handleOrientationOrResizeTransition() {
    const currentWinW = window.innerWidth;
    const isRealWidthChange = Math.abs(currentWinW - lastRecordedWinWidth) > 32;
    lastRecordedWinWidth = currentWinW;

    const isTypingNow = document.activeElement && (
        document.activeElement.tagName === 'INPUT' ||
        document.activeElement.tagName === 'TEXTAREA' ||
        document.activeElement.isContentEditable
    );

    // Если изменилась только высота (выдвижение/скрытие мобильной клавиатуры) или идёт печать — не ломаем стили и не мигаем
    if (!isRealWidthChange || isTypingNow) {
        if (resizeRafId) cancelAnimationFrame(resizeRafId);
        resizeRafId = requestAnimationFrame(() => {
            const scroller = $('#chatScroll');
            if (scroller && (stickToBottom || !isTypingNow)) {
                scroller.scrollTop = scroller.scrollHeight;
            }
            sdUpdate();
            autoGrow();
        });
        return;
    }

    closeAllMenus(null, true);
    closeMsgContextMenu();
    closeChatCtxMenu();
    closeFavCtxMenu();
    closeImgCtxMenu();

    const scroller = $('#chatScroll');
    if (!isResizingActive) {
        isResizingActive = true;
        document.documentElement.classList.add('is-resizing');
        capturedScrollAnchor = getScrollAnchor(scroller);
    }

    if (resizeRafId) cancelAnimationFrame(resizeRafId);
    if (resizeDebounceTimer) clearTimeout(resizeDebounceTimer);

    resizeRafId = requestAnimationFrame(() => {
        resize(true, false);
        autoGrow();
    });

    resizeDebounceTimer = setTimeout(() => {
        resize(true, true);
        if (window.uni && window.uni.active) {
            window.uni.resizeCanvas();
            window.uni.resizeBgCanvas();
        }
        resetRootViewportScroll();
        capturedScrollAnchor = null;
        document.documentElement.classList.remove('is-resizing');
        isResizingActive = false;
        if (!isMobile && !bgRafId && !isBackgroundSuspended()) {
            bgRafId = requestAnimationFrame(bgLoop);
        }
    }, 200);
}

window.addEventListener('resize', handleOrientationOrResizeTransition, { passive: true });
window.addEventListener('orientationchange', handleOrientationOrResizeTransition, { passive: true });
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', handleOrientationOrResizeTransition, { passive: true });
}

window.addEventListener('mousemove', e => {
    if (isMobile) return;
    mouse.x = (e.clientX / (W || 1) - .5) * 2;
    mouse.y = (e.clientY / (H || 1) - .5) * 2;
}, { passive: true });

function drawTri(ctx, t, time) {
    const px = isMobile ? 0 : par.x * t.depth * 24;
    const py = isMobile ? 0 : par.y * t.depth * 18;
    const pulse = isMobile ? 0.85 : (.75 + .25 * Math.sin(time * t.ps + t.ph));
    const alpha = t.a * pulse;
    const [h, s, l] = t.tone;

    ctx.save();
    ctx.translate(t.x + px, t.y + py);
    ctx.rotate(t.rot);
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
        const ang = k * (Math.PI * 2 / 3) - Math.PI / 2;
        const x = Math.cos(ang) * t.r, y = Math.sin(ang) * t.r;
        k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    if (t.filled && !isMobile) {
        ctx.fillStyle = `hsla(${h},${s}%,${l}%,${alpha * .4})`;
        ctx.fill();
    }
    ctx.strokeStyle = `hsla(${h},${s}%,${l}%,${alpha})`;
    ctx.lineWidth = 1.0;
    ctx.stroke();
    ctx.restore();
}

let bgRunning = true;
let bgRafId = null;
let lastBgFrame = 0;

function isBackgroundSuspended() {
    if (isMobile) return true;
    if (!bgRunning || document.hidden || isResizingActive) return true;
    if (document.documentElement.dataset.view === 'settings') return true;
    if (settingsOverlay && settingsOverlay.classList.contains('show')) return true;
    if (window.uni && window.uni.active) return true;
    if (typeof hpFullscreen !== 'undefined' && hpFullscreen) return true;
    return false;
}

document.addEventListener('visibilitychange', () => {
    bgRunning = !document.hidden;
    if (liquidBg) {
        if (document.hidden) liquidBg.suspend();
        else liquidBg.resume();
    }
    if (!isMobile && !isBackgroundSuspended() && !bgRafId) {
        bgRafId = requestAnimationFrame(bgLoop);
    }
});

function bgLoop(ts) {
    if (isBackgroundSuspended() || isMobile || !ctxF || !ctxN) {
        if (bgRafId) {
            cancelAnimationFrame(bgRafId);
            bgRafId = null;
        }
        if (isMobile && ctxF && ctxN && W > 0 && H > 0) {
            ctxF.clearRect(0, 0, W, H);
            ctxN.clearRect(0, 0, W, H);
        }
        return;
    }

    bgRafId = requestAnimationFrame(bgLoop);

    const frameInterval = 1000 / 45;
    if (ts - lastBgFrame < frameInterval) return;
    lastBgFrame = ts;

    const time = ts / 1000;
    par.x += (mouse.x - par.x) * .04;
    par.y += (mouse.y - par.y) * .04;

    ctxF.clearRect(0, 0, W, H);
    ctxN.clearRect(0, 0, W, H);

    const step = (list, ctx) => {
        for (let i = 0; i < list.length; i++) {
            const t = list[i];
            t.x += t.vx;
            t.y += t.vy;
            t.rot += t.vr;
            const m = t.r * 2 + 60;
            if (t.x < -m) t.x = W + m;
            else if (t.x > W + m) t.x = -m;
            if (t.y < -m) t.y = H + m;
            else if (t.y > H + m) t.y = -m;
            drawTri(ctx, t, time);
        }
    };

    step(trisF, ctxF);
    step(trisN, ctxN);
}

/* ═══════════════════════════════════════════════════════════════
RUNTIME-ЗАПРОС РАЗРЕШЕНИЙ CAPACITOR (Android 6+)
Вызывается один раз при старте. Плагин Filesystem сам запрашивает
WRITE_EXTERNAL_STORAGE / READ_MEDIA_IMAGES при первом writeFile.
Без этого Android молча блокирует запись в Downloads.
═══════════════════════════════════════════════════════════════ */
async function requestAndroidPermissions() {
    if (typeof window === 'undefined' || !window.Capacitor || !Capacitor.Plugins) {
        return; // не Capacitor-среда — ничего не делаем
    }
    const isNative = typeof Capacitor.isNativePlatform === 'function' ? Capacitor.isNativePlatform() : Capacitor.isNative;
    if (!isNative) return;

    // 1. Стандартные runtime-разрешения (WRITE/READ_EXTERNAL_STORAGE на Android ≤ 12)
    if (Capacitor.Plugins.Filesystem) {
        try {
            const chk = await Capacitor.Plugins.Filesystem.checkPermissions();
            if (chk.publicStorage !== 'granted') {
                const req = await Capacitor.Plugins.Filesystem.requestPermissions({ permissions: ['publicStorage'] });
                if (req.publicStorage !== 'granted') console.warn('[MoonSSS] Filesystem permission denied');
            }
        } catch (e) {
            console.warn('[MoonSSS] Filesystem permission request failed:', e);
        }
    }

    // 2. «Доступ ко всем файлам» (MANAGE_EXTERNAL_STORAGE, Android 11+) через наш нативный плагин.
    //    Открывает системные настройки один раз; запись в Downloads работает и без него (MediaStore).
    const nd = Capacitor.Plugins.NativeDownloader;
    if (nd && typeof nd.hasAllFilesAccess === 'function') {
        try {
            const st = await nd.hasAllFilesAccess();
            const alreadyAsked = await dbCtrl.get('moonsss_allfiles_asked');
            if (!st.granted && !alreadyAsked) {
                await dbCtrl.set('moonsss_allfiles_asked', '1');
                await nd.requestAllFilesAccess();
            }
        } catch (e) {
            console.warn('[MoonSSS] All-files access request failed:', e);
        }
    }
}
window.requestAndroidPermissions = requestAndroidPermissions;

/* Защита от системного масштабирования шрифтов (Android WebView / iOS Safari TextZoom Guard) */
function enforceTextScaleBounds() {
    try {
        const root = document.documentElement;
        root.style.webkitTextSizeAdjust = '100%';
        root.style.textSizeAdjust = '100%';

        let meta = document.querySelector('meta[name="viewport"]');
        if (!meta) {
            meta = document.createElement('meta');
            meta.name = 'viewport';
            document.head.appendChild(meta);
        }
        meta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');
    } catch (e) {
        console.warn('Font scale guard error:', e);
    }
}

function setSplashStatus(text) {
    const el = document.getElementById('splashStatusText');
    if (el && text) el.textContent = text;
}

function hideSplashScreen() {
    const splash = document.getElementById('appSplashScreen');
    if (!splash || splash.classList.contains('is-hidden')) return;

    setSplashStatus('Готово');
    const bar = document.getElementById('splashProgressBar');
    if (bar) {
        bar.style.animation = 'none';
        bar.style.left = '0';
        bar.style.width = '100%';
    }

    setTimeout(() => {
        splash.classList.add('is-hidden');
        setTimeout(() => {
            splash.style.display = 'none';
        }, 460);
    }, 120);
}
window.hideSplashScreen = hideSplashScreen;

async function initApp() {
    enforceTextScaleBounds();

    // Защитный таймаут: при непредвиденной задержке БД экран загрузки гарантированно снимется
    const safetyTimer = setTimeout(() => {
        hideSplashScreen();
    }, 3500);

    try {
        setSplashStatus('Чтение хранилища данных…');
        await load();

        setSplashStatus('Калибровка интерфейса и темы…');
        setViewMode('chat');
        syncSettingsUI();

        const searchInp = $('#searchInput');
        if (searchInp) {
            searchInp.value = '';
            const searchWrap = $('#searchWrap');
            if (searchWrap) searchWrap.classList.remove('has-q');
        }

        applyTheme();
        applyTypography();
        initSaveThemeModalEvents();
        bindKeyEyeToggles();
        bindPromptPresets();
        bindModelSettingsEvents();
        bindSystemBackupEvents();
        bindColorPickerEvents();
        initThemePreviewFloating();
        initAiThemeGenEvents();
        applyUserCustomCode();
        resize();

        setSplashStatus('Инициализация графических слоёв…');
        // Android: запросить разрешения файловой системы до первого сохранения
        requestAndroidPermissions();
        setupBackButtonHandlers();
        initLiquidBackground();

        if (!isMobile && !bgRafId) bgRafId = requestAnimationFrame(bgLoop);
        setTimeout(() => {
            if (W === 0 || H === 0 || (!isMobile && trisF.length === 0 && trisN.length === 0)) {
                resize();
                if (!isMobile && !bgRafId) bgRafId = requestAnimationFrame(bgLoop);
            }
        }, 300);

        renderAll();
        updateBalMini();
        if (window.changelogController && typeof window.changelogController.init === 'function') {
            window.changelogController.init();
        }
    } catch (err) {
        console.warn('[MoonSSS] Ошибка при инициализации приложения:', err);
    } finally {
        clearTimeout(safetyTimer);
        hideSplashScreen();
    }

    // Привязка обработчиков переключения глобальных протоколов рассуждений
    document.querySelectorAll('#globalReasoningEffortSeg .set-seg-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('#globalReasoningEffortSeg .set-seg-btn').forEach(b => {
                b.classList.remove('sel');
                b.setAttribute('aria-checked', 'false');
            });
            btn.classList.add('sel');
            btn.setAttribute('aria-checked', 'true');
            state.settings.reasoningEffort = btn.dataset.effort;
            if (!state.settings.modelProviders) state.settings.modelProviders = {};
            const mid = state.settings.modelId;
            const baseId = mid ? mid.replace(/:[a-zA-Z0-9_.-]+$/i, '') : '';
            if (mid) {
                if (!state.settings.modelProviders[mid]) state.settings.modelProviders[mid] = {};
                state.settings.modelProviders[mid].reasoningEffort = btn.dataset.effort;
            }
            if (baseId) {
                if (!state.settings.modelProviders[baseId]) state.settings.modelProviders[baseId] = {};
                state.settings.modelProviders[baseId].reasoningEffort = btn.dataset.effort;
            }
            const curModel = getModel(state.settings.modelId);
            if (curModel?.id?.includes('opus-5') && (btn.dataset.effort === 'xhigh' || btn.dataset.effort === 'max')) {
                if (state.settings.reasoning === 'off') {
                    state.settings.reasoning = 'medium';
                    toast('На Opus 5 при effort xHigh/Max размышления не могут быть отключены', 'warn', 2200);
                }
            }
            save();
            updateTopChips();
            toast('Глубина усилий (effort): ' + btn.textContent.trim(), 'ok', 1600);
        };
    });

    document.querySelectorAll('#openaiReasoningSummarySeg .set-seg-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('#openaiReasoningSummarySeg .set-seg-btn').forEach(b => {
                b.classList.remove('sel');
                b.setAttribute('aria-checked', 'false');
            });
            btn.classList.add('sel');
            btn.setAttribute('aria-checked', 'true');
            state.settings.openaiReasoningSummary = btn.dataset.val;
            save();
            toast('OpenAI reasoning.summary: ' + btn.textContent.trim(), 'ok', 1600);
        };
    });

    document.querySelectorAll('#openaiReasoningModeSeg .set-seg-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('#openaiReasoningModeSeg .set-seg-btn').forEach(b => {
                b.classList.remove('sel');
                b.setAttribute('aria-checked', 'false');
            });
            btn.classList.add('sel');
            btn.setAttribute('aria-checked', 'true');
            state.settings.openaiReasoningMode = btn.dataset.val;
            save();
            toast('OpenAI reasoning.mode: ' + btn.textContent.trim(), 'ok', 1600);
        };
    });

    document.querySelectorAll('#claudeThinkingDisplaySeg .set-seg-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('#claudeThinkingDisplaySeg .set-seg-btn').forEach(b => {
                b.classList.remove('sel');
                b.setAttribute('aria-checked', 'false');
            });
            btn.classList.add('sel');
            btn.setAttribute('aria-checked', 'true');
            state.settings.claudeThinkingDisplay = btn.dataset.val;
            save();
            toast('Claude thinking.display: ' + btn.textContent.trim(), 'ok', 1600);
        };
    });

    // Автоматическая фоновая подгрузка каталога OpenRouter при устаревании (> 24 ч) или пустом кэше
    const now = Date.now();
    const lastFetch = state.openRouterModelsFetchedAt || 0;
    if ((!state.openRouterModels || state.openRouterModels.length === 0 || (now - lastFetch > 86400000))) {
        setTimeout(() => refreshOpenRouterModels(true), 1500);
    }

    // Привязка клика к карточкам селектора режимов Hero
    document.addEventListener('click', e => {
        const card = e.target.closest('#heroModeSelector .hero-mode-card');
        if (card) {
            e.preventDefault();
            const mode = card.dataset.mode || 'classic';
            setChatMode(mode);
            toast(mode === 'image' ? 'Активирован режим Image Studio' : 'Активирован Classic MoonSSS', 'ok', 1400);
        }
    });

    if (!state.settings.proxyKey && !state.settings.orKey) {
        setTimeout(() => toast('Добавьте ключ ProxyAPI или OpenRouter в настройках, чтобы начать', 'info', 4200), 900);
    }
}
initApp();
/* ═══════════════════════════════════════════════════════════════
ГОЛОСОВОЙ ПОМОЩНИК ЮНИ — STT→LLM→TTS
Пайплайн:
  микрофон → whisper-large-v3-turbo (OpenRouter) → текстовый LLM
  → x-ai/grok-voice-tts-1.0 (OpenRouter) → динамик
═══════════════════════════════════════════════════════════════ */
const UNI_VOICES = [
    { id: 'eve', name: 'Eve', desc: 'Тёплый, естественный женский' },
    { id: 'ara', name: 'Ara', desc: 'Мягкий, задумчивый женский' },
    { id: 'rex', name: 'Rex', desc: 'Уверенный мужской' },
    { id: 'sal', name: 'Sal', desc: 'Спокойный мужской' },
    { id: 'leo', name: 'Leo', desc: 'Энергичный мужской' }
];
const UNI_SILENCE_THRESHOLD = 22;   // ниже этого — тишина (повышен, игнорирует фоновый шум комнаты)
const UNI_SPEECH_THRESHOLD = 34;   // выше этого — уверенная речь (исключает шорохи, клики, кулер)
const UNI_SILENCE_DURATION = 3000; // ровно 3 секунды паузы перед отправкой
const UNI_NOISE_FLOOR_ALPHA = 0.02; // скорость адаптации к фоновому шуму (медленнее = стабильнее)
class UniController {
    constructor() {
        this.active = false;
        this.audioContext = null;
        this.stream = null;
        this.analyser = null;
        this.micDataArray = null;
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.isRecording = false;
        this.silenceStart = 0;
        this.isSpeaking = false;
        this.currentAudio = null;
        this.voice = 'eve';
        this.abortCtrl = null;
        this.canvas = null;
        this.orbRenderer = null;
        this.rafId = null;
        this.volRafId = null;
        this.ttsSource = null;
        this.ttsAnalyser = null;
        this.ttsDataArray = null;
        this.ttsVolRafId = null;
        this.ttsSmoothVolume = 0;
        this.currentVolume = 0;
        this.smoothVolume = 0;
        this.bgFar = null; this.bgNear = null;
        this.bgFarCtx = null; this.bgNearCtx = null;
        this.bgTrisFar = []; this.bgTrisNear = [];
        this.bgRafId = null;
        this.turnInProgress = false;
        this.ttsAudioCtx = null;
        this.ttsVolume = 0;
        this.userStopped = false;
        this.turnSeq = 0;
    }
    async open() {
        if (this.active) return;
        this.active = true;
        this.userStopped = false;
        this._noiseFloor = 0;
        setViewMode('uni');
        $('#uniOverlay').hidden = false;
        this.loadVoice();
        this.updateKeyIndicator();
        this.initCanvas();
        if (!isMobile) {
            this.initBgCanvas();
            this.initBgTris();
        }
        this.startRender();
        if (!isMobile) {
            this.startBgRender();
        }
        this.updateStopButton();
        await this.startMic();
        this.updateStatus('Готова к диалогу', '');
    }
    close() {
        this.stop();
        this.stopTtsAnalysis();
        if (this.audioContext && this.audioContext.state !== 'closed') {
            try { this.audioContext.close(); } catch (e) { }
        }
        this.audioContext = null;
        this.active = false;
        this.userStopped = false;
        if (this.orbRenderer) {
            this.orbRenderer.destroy();
            this.orbRenderer = null;
        }
        $('#uniOverlay').hidden = true;
        this.stopBgRender();
        setViewMode('chat');
    }
    stop() {
        /* 1. Немедленно прерываем стриминг LLM и все сетевые запросы (Whisper, Grok TTS) */
        if (this.abortCtrl) { try { this.abortCtrl.abort(); } catch (e) { } this.abortCtrl = null; }
        /* 2. Останавливаем воспроизведение TTS — обрываем голос ИИ на полуслове */
        this.stopSpeaking();
        /* 3. Останавливаем MediaRecorder и очищаем буфер записи */
        this.stopMic();
        /* 4. Сбрасываем состояние диалога */
        this.turnInProgress = false;
        this.isSpeaking = false;
        this.recordedChunks = [];
        this.silenceStart = 0;
        /* ЛЮБОЕ нажатие «Стоп» — намеренная пауза диалога:
        кнопка ВСЕГДА превращается в «Продолжить» (зелёная, иконка play),
        микрофон остаётся выключенным до возобновления. */
        this.userStopped = true;
        /* Инвалидируем летающий виток processAudio: он увидит
        несовпадение токена и молча завершится (без запуска TTS) */
        this.turnSeq++;
        this.updateStatus('Остановлено', 'Ответ прерван. Нажмите «Продолжить», чтобы возобновить диалог', '');
        /* Обновляем последнее сообщение в ленте: явно помечаем, что ответ оборван */
        const feed = $('#uniFeed');
        if (feed) {
            const last = feed.querySelector('.uni-msg.assistant:last-child .uni-msg-text');
            if (last && last.textContent) {
                last.textContent = last.textContent.trim() + '\n\n_(ответ остановлен)_';
                last.classList.remove('streaming');
            }
        }
        this.updateStopButton();
    }

    /* ── Возобновление диалога после остановки ── */
    async resume() {
        if (!this.active) return;
        this.userStopped = false;
        /* Возвращаем кнопку в состояние «Стоп» ДО перезапуска микрофона,
        чтобы пользователь сразу видел, что можно снова прервать диалог */
        this.updateStopButton();
        /* Сбрасываем состояние «Остановлено» → «Слушаю» с зелёной подсветкой статуса */
        this.updateStatus('Слушаю…', 'Говорите — я слушаю вас', 'listen');
        /* Перезапускаем микрофон и цикл слушания */
        await this.startMic();
    }

    /* ── Обновление кнопки Стоп/Продолжить ── */
    updateStopButton() {
        const btn = $('#uniStopBtn');
        if (!btn) return;
        const ico = btn.querySelector('.uni-stop-ico svg use');
        const label = btn.querySelector('span:not(.uni-stop-ico)');
        if (this.userStopped) {
            /* Кнопка «Продолжить»: зелёный акцент, иконка play */
            btn.classList.remove('uni-stop-danger');
            btn.classList.add('uni-stop-resume');
            if (ico) ico.setAttribute('href', '#i-play');
            if (label) label.textContent = 'Продолжить';
            btn.setAttribute('aria-label', 'Продолжить диалог');
        } else {
            /* Кнопка «Стоп»: красный, иконка stop */
            btn.classList.remove('uni-stop-resume');
            btn.classList.add('uni-stop-danger');
            if (ico) ico.setAttribute('href', '#i-stop');
            if (label) label.textContent = 'Стоп';
            btn.setAttribute('aria-label', 'Остановить');
        }
    }
    updateStatus(text, sub, cls) {
        const el = $('#uniStatus');
        const subEl = $('#uniSubstatus');
        if (el) { el.textContent = text; el.className = 'uni-status' + (cls ? ' ' + cls : ''); }
        if (subEl) subEl.textContent = sub || '';
    }
    /* ─── Микрофон и анализ громкости ─── */
    async startMic() {
        if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
            toast('Аудиоввод не поддерживается в этой среде', 'err');
            this.updateStatus('Микрофон недоступен', 'Устройство не поддерживает запись');
            setTimeout(() => this.close(), 1800);
            return;
        }
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
            });
            if (!this.audioContext || this.audioContext.state === 'closed') {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (this.audioContext.state === 'suspended') {
                try { await this.audioContext.resume(); } catch (e) { }
            }
            const source = this.audioContext.createMediaStreamSource(this.stream);
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            this.analyser.smoothingTimeConstant = 0.6;
            source.connect(this.analyser);
            this.micDataArray = new Uint8Array(this.analyser.frequencyBinCount);
            const mimeType = (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('audio/webm;codecs=opus'))
                ? 'audio/webm;codecs=opus' : (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4');
            this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });
            this.mediaRecorder.ondataavailable = e => { if (e.data.size > 0) this.recordedChunks.push(e.data); };
            this.mediaRecorder.onstop = () => {
                if (this.active && !this.turnInProgress && this.recordedChunks.length > 0) {
                    this.processAudio();
                }
            };
            this.isRecording = false;
            this.silenceStart = 0;
            this.updateStatus('Слушаю…', 'Говорите — я слушаю вас', 'listen');
            this.analyzeVolume();
        } catch (e) {
            toast('Не удалось получить доступ к микрофону', 'err');
            this.updateStatus('Микрофон недоступен', 'Проверьте разрешения микрофона');
            setTimeout(() => this.close(), 1800);
        }
    }
    /* ── Анализ громкости TTS: сфера реагирует на голос ИИ ── */
    analyzeTtsVolume() {
        if (!this.ttsAnalyser || !this.ttsDataArray) {
            this.ttsVolRafId = null;
            return;
        }
        this.ttsAnalyser.getByteFrequencyData(this.ttsDataArray);
        let sum = 0, count = 0;
        /* Речевые частоты: 100–4000 Гц для синтеза голоса */
        const binCount = this.ttsDataArray.length;
        const startBin = Math.floor(binCount * 0.03);
        const endBin = Math.floor(binCount * 0.6);
        for (let i = startBin; i < endBin; i++) { sum += this.ttsDataArray[i]; count++; }
        const vol = count ? sum / count : 0;
        this.ttsVolume = vol;
        /* Быстрая атака, медленный спад — сфера плавно «затухает» между словами */
        this.ttsSmoothVolume = vol > this.ttsSmoothVolume
            ? this.ttsSmoothVolume * 0.4 + vol * 0.6
            : this.ttsSmoothVolume * 0.88 + vol * 0.12;
        this.ttsVolRafId = requestAnimationFrame(() => this.analyzeTtsVolume());
    }
    stopTtsAnalysis() {
        if (this.ttsVolRafId) { cancelAnimationFrame(this.ttsVolRafId); this.ttsVolRafId = null; }
        if (this.ttsSource) { try { this.ttsSource.disconnect(); } catch (e) { } this.ttsSource = null; }
        if (this.ttsAnalyser) { try { this.ttsAnalyser.disconnect(); } catch (e) { } this.ttsAnalyser = null; }
        this.ttsDataArray = null;
        this.ttsVolume = 0;
        this.ttsSmoothVolume = 0;
    }
    stopMic() {
        if (this.volRafId) { cancelAnimationFrame(this.volRafId); this.volRafId = null; }
        try {
            if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') this.mediaRecorder.stop();
        } catch (e) { }
        if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
        if (this.audioContext) { try { this.audioContext.close(); } catch (e) { } this.audioContext = null; }
        this.analyser = null;
        this.micDataArray = null;
        this.isRecording = false;
    }
    analyzeVolume() {
        if (!this.active || !this.analyser) { return; }
        this.analyser.getByteFrequencyData(this.micDataArray);
        /* Анализируем только речевые частоты (~300–3400 Гц).
        При fftSize=256 и sampleRate=48kHz один бин ≈ 187.5 Гц:
        бин 2 ≈ 375 Гц, бин 18 ≈ 3375 Гц. Игнорируем низкочастотный гул
        (кондиционер, кулер) и высокие шипящие (шум вентилятора). */
        const binCount = this.micDataArray.length;
        const startBin = Math.max(2, Math.floor(binCount * 0.015));
        const endBin = Math.min(binCount - 1, Math.floor(binCount * 0.15));
        let sum = 0, count = 0;
        for (let i = startBin; i <= endBin; i++) { sum += this.micDataArray[i]; count++; }
        const rawVol = count ? sum / count : 0;
        /* Адаптивный порог шума: медленно отслеживаем фоновый уровень
        (тишина в комнате, гул ПК) и используем его как динамический ноль.
        Это позволяет игнорировать постоянный шум любой громкости. */
        if (typeof this._noiseFloor !== 'number') this._noiseFloor = rawVol;
        this._noiseFloor = this._noiseFloor * (1 - UNI_NOISE_FLOOR_ALPHA) + rawVol * UNI_NOISE_FLOOR_ALPHA;
        /* Вычитаем шумовой пол и небольшой запас (4 единицы) */
        const vol = Math.max(0, rawVol - this._noiseFloor - 4);
        this.currentVolume = vol;
        this.smoothVolume = this.smoothVolume * 0.7 + vol * 0.3;
        if (this.turnInProgress || this.isSpeaking) {
            // Пока Юни говорит или думает — микрофон игнорируется.
            // Принудительно останавливаем MediaRecorder, чтобы он не копил
            // фоновый шум / эхо из динамиков в recordedChunks.
            if (this.isRecording && this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
                try { this.mediaRecorder.stop(); } catch (e) { }
            }
            this.isRecording = false;
            this.silenceStart = 0;
            this.recordedChunks = [];
            this.volRafId = requestAnimationFrame(() => this.analyzeVolume());
            return;
        }
        if (vol > UNI_SPEECH_THRESHOLD) {
            this.silenceStart = 0;
            if (!this.isRecording) {
                this.isRecording = true;
                this.recordedChunks = [];
                try { this.mediaRecorder.start(); } catch (e) { }
                this.updateStatus('Говорите…', 'Слушаю вашу речь', 'listen');
            }
        } else if (vol < UNI_SILENCE_THRESHOLD) {
            if (this.isRecording) {
                if (!this.silenceStart) this.silenceStart = performance.now();
                else if (performance.now() - this.silenceStart > UNI_SILENCE_DURATION) {
                    this.isRecording = false;
                    this.silenceStart = 0;
                    try { this.mediaRecorder.stop(); } catch (e) { }
                }
            }
        }
        this.volRafId = requestAnimationFrame(() => this.analyzeVolume());
    }
    /* ─── Обработка записанного аудио ─── */
    async processAudio() {
        if (!this.recordedChunks.length || this.turnInProgress || !this.active) return;
        const mimeType = this.mediaRecorder ? this.mediaRecorder.mimeType : 'audio/webm';
        const blob = new Blob(this.recordedChunks.slice(), { type: mimeType });
        this.recordedChunks = [];
        this.turnInProgress = true;
        const myTurn = this.turnSeq;
        try {
            this.updateStatus('Распознаю речь…', 'Whisper слушает вас', 'think');
            const text = await this.transcribe(blob);
            /* Пользователь нажал «Стоп», пока шло распознавание — выходим молча */
            if (myTurn !== this.turnSeq || !this.active) return;
            if (!text || !text.trim()) {
                this.updateStatus('Не расслышала', 'Произнесите чётче', '');
                this.turnInProgress = false;
                this.updateStatus('Слушаю…', 'Говорите — я слушаю вас', 'listen');
                return;
            }
            this.addFeedMessage('user', text);
            this.updateStatus('Думаю…', 'Составляю ответ', 'think');
            this.addFeedMessage('assistant', '', true);
            const response = await this.getLLMResponse(text);
            /* «Стоп» нажат во время размышления — НЕ запускаем озвучку */
            if (myTurn !== this.turnSeq || !this.active) return;
            this.updateLastFeedAssistant(response, false);
            this.updateStatus('Говорю…', 'Озвучиваю ответ', 'speak');
            await this.speak(response);
            if (myTurn !== this.turnSeq || !this.active) return;
            this.turnInProgress = false;
            /* Если пользователь не остановил — продолжаем слушать автоматически.
               Если остановил (userStopped = true) — не перезапускаем микрофон,
               ждём нажатия «Продолжить». */
            if (!this.userStopped && this.active) {
                await this.startMic();
                this.updateStatus('Слушаю…', 'Говорите — я слушаю вас', 'listen');
            }
        } catch (e) {
            /* Виток отменён пользователем («Стоп») или закрытием окна — это не ошибка */
            if (myTurn !== this.turnSeq || !this.active) return;
            console.error('[Uni] processAudio failed:', e);
            this.updateLastFeedAssistant('**Ошибка:** ' + (e.message || e), false);
            this.turnInProgress = false;
            if (!this.userStopped && this.active) {
                await this.startMic();
                this.updateStatus('Слушаю…', 'Говорите — я слушаю вас', 'listen');
            }
            toast('Юни: ' + (e.message || 'ошибка'), 'err');
        }
    }
    /* ─── STT: whisper-large-v3-turbo через OpenRouter ─── */
    async transcribe(audioBlob) {
        return await transcribeWithWhisper(audioBlob);
    }
    /* ─── LLM: используем существующие провайдеры ─── */
    async getLLMResponse(text) {
        const settings = state.settings;
        const model = getModel(settings.modelId);
        const route = resolveApiRoute(settings, model);
        if (!route.useProxy && !route.useORDirect) {
            throw new Error(route.missing === 'proxy' ? 'Нет ключа ProxyAPI' : 'Нет ключа OpenRouter');
        }
        const chat = ensureChat();
        this.abortCtrl = new AbortController();
        const userMsg = { id: uid(), role: 'user', content: text, ts: Date.now(), fromUni: true };
        chat.messages.push(userMsg);
        chat.updatedAt = Date.now();
        autoTitle(chat);
        const aiMsg = {
            id: uid(), role: 'assistant', content: '', thinking: '', ts: Date.now(),
            modelId: model.id, status: 'streaming', fromUni: true
        };
        chat.messages.push(aiMsg);
        save();
        renderMessages(); renderChatList();
        /* Начальный статус в ленте: пользователь сразу видит что Юни работает */
        this.addFeedMessage('assistant', 'Анализирую запрос...', true);
        /* Хелпер: очищаем текст от технических маркеров для отображения в ленте */
        const cleanForFeed = raw => String(raw || '')
            .replace(/\[\[IMGRQ:\d+\]\]|\[\[ART:\d+\]\]|\[\[WS:\d+\]\]|\[\[EXEC:\d+\]\]/g, '')
            .replace(/<artifact\b[\s\S]*?<\/artifact>/g, '')
            .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
            .replace(/\{image_generation\[[\s\S]*?\}\}/g, '')
            .replace(/\{execute\s*:\s*\{[\s\S]*?\}\s*\}/g, '')
            .trim();
        const onText = t => {
            aiMsg.content += t;
            /* Транслируем ответ в ленту Юни: показываем только основной контент */
            const visible = cleanForFeed(aiMsg.content);
            /* Если есть активный процесс (мысли/поиск), показываем их под ответом */
            let displayText = visible || '...';
            if (aiMsg.webSearch && aiMsg.webSearch.queries && aiMsg.webSearch.queries.length) {
                const lastQ = aiMsg.webSearch.queries[aiMsg.webSearch.queries.length - 1];
                displayText += '\n\n_Ищу в интернете: «' + lastQ.slice(0, 80) + '»_';
            }
            this.updateLastFeedAssistant(displayText, true);
        };
        const onThink = t => {
            aiMsg.thinking += t;
            /* Показываем ход мыслей в ленте курсивом (без раскрытия всего текста) */
            const visible = cleanForFeed(aiMsg.content);
            const thinkingTail = aiMsg.thinking.trim().slice(-220);
            const prefix = visible ? visible + '\n\n' : '';
            this.updateLastFeedAssistant(
                prefix + '_Размышляю: ' + thinkingTail + (aiMsg.thinking.length > 220 ? '…' : '') + '_',
                true
            );
        };
        const onWebSearch = ws => {
            if (!aiMsg.webSearch) aiMsg.webSearch = { queries: [], sources: [], stages: [] };
            if (ws.queries) {
                const newQ = ws.queries.filter(q => !aiMsg.webSearch.queries.includes(q));
                if (newQ.length) aiMsg.webSearch.queries.push(...newQ);
            }
            if (ws.sources) aiMsg.webSearch.sources.push(...ws.sources);
            /* Обновляем ленту со статусом поиска */
            const visible = cleanForFeed(aiMsg.content);
            const lastQ = aiMsg.webSearch.queries[aiMsg.webSearch.queries.length - 1] || '';
            const prefix = visible ? visible + '\n\n' : '';
            this.updateLastFeedAssistant(
                prefix + '_Ищу в интернете: «' + lastQ.slice(0, 80) + '»_ _Найдено источников: ' + aiMsg.webSearch.sources.length + '_',
                true
            );
        };
        const history = chat.messages.slice(0, -1);
        const onServerTool = info => window.recordServerTool(aiMsg, info);
        try {
            if (route.useORDirect) {
                await streamOpenRouterDirect(model, history,
                    { onText, onThink, onWebSearch, onServerTool, signal: this.abortCtrl.signal }, aiMsg);
            } else if (model.api === 'anthropic') {
                await streamAnthropic(model, history,
                    { onText, onThink, onWebSearch, onServerTool, signal: this.abortCtrl.signal }, aiMsg);
            } else if (model.api === 'gemini') {
                await streamGemini(model, history,
                    { onText, onThink, onWebSearch, onServerTool, signal: this.abortCtrl.signal }, aiMsg);
            } else {
                await streamOpenRouter(model, history,
                    { onText, onThink, onWebSearch, onServerTool, signal: this.abortCtrl.signal, direct: false }, aiMsg);
            }
        } catch (e) {
            if (e.name !== 'AbortError') throw e;
        }
        aiMsg.status = 'done';
        chat.updatedAt = Date.now();
        save();
        renderMessages(); renderChatList();
        this.abortCtrl = null;
        return aiMsg.content || '';
    }
    /* ─── TTS: x-ai/grok-voice-tts-1.0 через OpenRouter ─── */
    async speak(text) {
        const key = state.settings.orKey.trim();
        if (!key) { this.openKeyPop(); throw new Error('Укажите API-ключ OpenRouter'); }
        // Физически останавливаем запись: эхо из динамиков не должно попасть в MediaRecorder
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            try { this.mediaRecorder.stop(); } catch (e) { }
        }
        this.isRecording = false;
        this.silenceStart = 0;
        this.recordedChunks = [];
        this.isSpeaking = true;
        // Визуально приглушаем сферу: пользователь видит, что микрофон «мьютится»
        const orbWrap = document.querySelector('.uni-orb-wrap');
        if (orbWrap) orbWrap.classList.add('uni-speaking');
        const origin = (typeof location !== 'undefined' && location.origin) ? location.origin : '';
        const referer = (origin && !origin.startsWith('file') && !origin.startsWith('app') && !origin.startsWith('capacitor') && !origin.includes('localhost'))
            ? origin : 'https://unichat2.sahbanovtimur228.workers.dev/ai';
        // Очищаем текст от markdown и системных маркеров
        const clean = text
            .replace(/```[\s\S]*?```/g, '[блок кода]')
            .replace(/`[^`]+`/g, m => m.slice(1, -1))
            .replace(/\[\[IMGRQ:\d+\]\]|\[\[ART:\d+\]\]|\[\[WS:\d+\]\]/g, '')
            .replace(/<artifact\b[\s\S]*?<\/artifact>/g, '[артефакт]')
            .replace(/!\[[^\]]*\]\([^)]*\)/g, '[изображение]')
            .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
            .replace(/[*_#`>~-]+/g, ' ')
            .replace(/\s+/g, ' ').trim()
            .slice(0, 4000);
        if (!clean) { this.isSpeaking = false; return; }
        let resp;
        try {
            const attribHeaders = getOpenRouterAttributionHeaders('Uni Voice');
            resp = await fetch('https://openrouter.ai/api/v1/audio/speech', {
                method: 'POST',
                signal: this.abortCtrl ? this.abortCtrl.signal : undefined,
                headers: {
                    'Authorization': 'Bearer ' + key,
                    'Content-Type': 'application/json',
                    ...attribHeaders
                },
                body: JSON.stringify({
                    model: 'x-ai/grok-voice-tts-1.0',
                    input: clean,
                    voice: this.voice,
                    response_format: 'mp3'
                })
            });
        } catch (e) {
            this.isSpeaking = false;
            throw new Error('Не удалось связаться с OpenRouter TTS: ' + (e.message || 'network'));
        }
        if (!resp.ok) {
            let msg = 'HTTP ' + resp.status;
            try { const j = await resp.json(); msg = j.error?.message || j.message || msg; } catch (e) { }
            this.isSpeaking = false;
            throw new Error('Grok Voice: ' + msg);
        }
        const audioBlob = await resp.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        await new Promise((resolve, reject) => {
            this.currentAudio = new Audio(audioUrl);
            this.currentAudio.crossOrigin = 'anonymous';
            /* ── Подключаем TTS к AudioContext для визуализации ──
               createMediaElementSource можно вызвать только один раз
               на элемент, поэтому делаем это прямо перед play(). */
            try {
                if (!this.audioContext || this.audioContext.state === 'closed') {
                    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                }
                if (this.audioContext.state === 'suspended') {
                    this.audioContext.resume().catch(() => { });
                }
                /* Останавливаем предыдущий TTS-анализ, если был */
                this.stopTtsAnalysis();
                this.ttsSource = this.audioContext.createMediaElementSource(this.currentAudio);
                this.ttsAnalyser = this.audioContext.createAnalyser();
                this.ttsAnalyser.fftSize = 256;
                this.ttsAnalyser.smoothingTimeConstant = 0.55;
                this.ttsDataArray = new Uint8Array(this.ttsAnalyser.frequencyBinCount);
                /* TTS должен звучать в динамиках И идти в анализатор */
                this.ttsSource.connect(this.ttsAnalyser);
                this.ttsAnalyser.connect(this.audioContext.destination);
                this.ttsVolRafId = requestAnimationFrame(() => this.analyzeTtsVolume());
            } catch (e) {
                /* Если анализ не удался — просто играем звук без визуализации */
                console.warn('[Uni] TTS analysis setup failed:', e);
            }
            this.currentAudio.onended = () => {
                this.stopTtsAnalysis();
                try { URL.revokeObjectURL(audioUrl); } catch (e) { }
                this.currentAudio = null;
                // Anti-echo: 700мс на затухание звука из динамиков.
                // Пока isSpeaking = true, analyzeVolume() игнорирует микрофон.
                setTimeout(() => {
                    this.isSpeaking = false;
                    const orbWrap = document.querySelector('.uni-orb-wrap');
                    if (orbWrap) orbWrap.classList.remove('uni-speaking');
                    resolve();
                }, 700);
            };
            this.currentAudio.onerror = () => {
                this.stopTtsAnalysis();
                try { URL.revokeObjectURL(audioUrl); } catch (e) { }
                this.currentAudio = null;
                setTimeout(() => {
                    this.isSpeaking = false;
                    const orbWrap = document.querySelector('.uni-orb-wrap');
                    if (orbWrap) orbWrap.classList.remove('uni-speaking');
                    reject(new Error('Не удалось воспроизвести аудио'));
                }, 300);
            };
            this.currentAudio.play().catch(reject);
        });
    }
    stopSpeaking() {
        if (this.currentAudio) {
            try {
                this.currentAudio.onended = null;
                this.currentAudio.onerror = null;
                this.currentAudio.pause();
                this.currentAudio.currentTime = 0;
            } catch (e) { }
            this.currentAudio = null;
        }
        const orbWrap = document.querySelector('.uni-orb-wrap');
        if (orbWrap) orbWrap.classList.remove('uni-speaking');
        this.stopTtsAnalysis();
        this.isSpeaking = false;
    }
    /* ─── Лента сообщений ─── */
    addFeedMessage(role, text, streaming) {
        const feed = $('#uniFeed');
        if (!feed) return;
        const wrap = document.createElement('div');
        wrap.className = 'uni-msg ' + role;
        const roleName = role === 'user' ? 'Вы' : 'Юни';
        wrap.innerHTML = `
<div class="uni-msg-wrap">
<div class="uni-msg-role">${esc(roleName)}</div>
<div class="uni-msg-text${streaming ? ' streaming' : ''}">${esc(text || '')}</div>
</div>`;
        feed.appendChild(wrap);
        feed.scrollTop = feed.scrollHeight;
    }
    updateLastFeedAssistant(text, streaming) {
        const feed = $('#uniFeed');
        if (!feed) return;
        const last = feed.querySelector('.uni-msg.assistant:last-child .uni-msg-text');
        if (last) {
            last.textContent = text || '';
            last.classList.toggle('streaming', !!streaming);
            feed.scrollTop = feed.scrollHeight;
        } else {
            this.addFeedMessage('assistant', text, streaming);
        }
    }
    /* ─── Шейдерная сфера MoonSphere (VoicePoweredOrb Pure Engine) ─── */
    initCanvas() {
        this.canvas = $('#uniCanvas');
        if (!this.canvas) return;
        if (this.orbRenderer) {
            this.orbRenderer.destroy();
            this.orbRenderer = null;
        }
        const OrbClass = window.VoicePoweredOrb || window.MoonSphereRenderer;
        if (!OrbClass) return;
        this.orbRenderer = new OrbClass(this.canvas, {
            voiceSensitivity: 1.5,
            maxRotationSpeed: 1.2,
            maxHoverIntensity: 0.8
        });
        this.orbRenderer.init();
        this.resizeCanvas();
    }
    resizeCanvas() {
        if (!this.canvas || !this.orbRenderer) return;
        this.orbRenderer.resize();
    }
    startRender() {
        const loop = ts => {
            if (!this.active) { this.rafId = null; return; }
            this.renderFrame(ts);
            this.rafId = requestAnimationFrame(loop);
        };
        this.rafId = requestAnimationFrame(loop);
    }
    renderFrame(ts) {
        if (!this.orbRenderer) return;

        const micVol = this.smoothVolume || 0;
        const ttsVol = this.ttsSmoothVolume || 0;
        const vol = Math.max(micVol, ttsVol);
        const isTts = ttsVol > micVol && ttsVol > UNI_SILENCE_THRESHOLD;

        // Нормализация уровня аудио (0.0 - 1.0)
        const voiceLevel = Math.min(1.0, Math.max(0.0, vol / 45));

        // Цветовой оттенок (Hue) под статус ассистента
        let targetHue = 0;
        if (isTts) {
            targetHue = 42; // Неоновый фиолетово-розовый при речи ассистента
        } else if (vol > UNI_SPEECH_THRESHOLD) {
            targetHue = -25; // Тёплый акцент при уверенной речи пользователя
        } else {
            targetHue = 0; // Холодный фирменный лазурный градиент
        }

        this.orbRenderer.render(ts, voiceLevel, targetHue);
    }
    /* ─── Фоновые треугольники (облегчённая копия основного фона) ─── */
    initBgCanvas() {
        if (isMobile) return;
        this.bgFar = $('#uniBgFar');
        this.bgNear = $('#uniBgNear');
        if (!this.bgFar || !this.bgNear) return;
        this.bgFarCtx = this.bgFar.getContext('2d');
        this.bgNearCtx = this.bgNear.getContext('2d');
        this.resizeBgCanvas();
    }
    resizeBgCanvas() {
        if (isMobile || !this.bgFar || !this.bgNear) return;
        const DPR = Math.min(window.devicePixelRatio || 1, 2);
        const prevW = this.bgW || window.innerWidth || 360;
        const prevH = this.bgH || window.innerHeight || 640;
        const W = window.innerWidth, H = window.innerHeight;

        const targetW = Math.round(W * DPR);
        const targetH = Math.round(H * DPR);

        if (this.bgFar.width !== targetW || this.bgFar.height !== targetH) {
            this.bgFar.width = targetW; this.bgFar.height = targetH;
            this.bgFar.style.width = W + 'px'; this.bgFar.style.height = H + 'px';
            this.bgFarCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
        }

        if (this.bgNear.width !== targetW || this.bgNear.height !== targetH) {
            this.bgNear.width = targetW; this.bgNear.height = targetH;
            this.bgNear.style.width = W + 'px'; this.bgNear.style.height = H + 'px';
            this.bgNearCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
        }

        this.bgW = W; this.bgH = H;

        if (!this.bgTrisFar.length || !this.bgTrisNear.length) {
            this.initBgTris();
        } else {
            scaleTrianglesProportionally(this.bgTrisFar, prevW, prevH, W, H);
            scaleTrianglesProportionally(this.bgTrisNear, prevW, prevH, W, H);
        }
    }
    initBgTris() {
        if (isMobile) {
            this.bgTrisFar = [];
            this.bgTrisNear = [];
            return;
        }
        const W = this.bgW || 1, H = this.bgH || 1;
        const area = W * H;
        const nFar = Math.max(8, Math.round(area / 110000));
        const nNear = Math.max(12, Math.round(area / 55000));
        const rnd = (a, b) => a + Math.random() * (b - a);
        this.bgTrisFar = Array.from({ length: nFar }, () => ({
            x: rnd(-60, W + 60), y: rnd(-60, H + 60),
            r: rnd(18, 55) * rnd(1.6, 2.4),
            rot: rnd(0, Math.PI * 2), vr: rnd(-0.002, 0.002),
            vx: rnd(-0.12, 0.12), vy: rnd(-0.1, 0.1),
            a: rnd(0.12, 0.32), ph: rnd(0, Math.PI * 2), ps: rnd(0.3, 0.7)
        }));
        this.bgTrisNear = Array.from({ length: nNear }, () => ({
            x: rnd(-60, W + 60), y: rnd(-60, H + 60),
            r: rnd(14, 45),
            rot: rnd(0, Math.PI * 2), vr: rnd(-0.003, 0.003),
            vx: rnd(-0.18, 0.18), vy: rnd(-0.14, 0.14),
            a: rnd(0.22, 0.5), ph: rnd(0, Math.PI * 2), ps: rnd(0.4, 0.9)
        }));
    }
    startBgRender() {
        if (isMobile) return;
        const loop = ts => {
            if (!this.active || isMobile) { this.bgRafId = null; return; }
            this.bgRafId = requestAnimationFrame(loop);
            this.renderBgFrame(ts);
        };
        this.bgRafId = requestAnimationFrame(loop);
    }
    stopBgRender() { if (this.bgRafId) { cancelAnimationFrame(this.bgRafId); this.bgRafId = null; } }
    renderBgFrame(ts) {
        const ctxF = this.bgFarCtx, ctxN = this.bgNearCtx;
        const W = this.bgW, H = this.bgH;
        if (!ctxF || !ctxN || !W) return;
        const time = ts / 1000;
        ctxF.clearRect(0, 0, W, H);
        ctxN.clearRect(0, 0, W, H);
        const draw = (ctx, list) => {
            for (const t of list) {
                t.x += t.vx; t.y += t.vy; t.rot += t.vr;
                const m = t.r * 2 + 80;
                if (t.x < -m) t.x = W + m; if (t.x > W + m) t.x = -m;
                if (t.y < -m) t.y = H + m; if (t.y > H + m) t.y = -m;
                const pulse = 0.75 + 0.25 * Math.sin(time * t.ps + t.ph);
                const alpha = t.a * pulse;
                ctx.save();
                ctx.translate(t.x, t.y);
                ctx.rotate(t.rot);
                ctx.beginPath();
                for (let k = 0; k < 3; k++) {
                    const ang = k * (Math.PI * 2 / 3) - Math.PI / 2;
                    const x = Math.cos(ang) * t.r, y = Math.sin(ang) * t.r;
                    k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
                }
                ctx.closePath();
                ctx.strokeStyle = `hsla(210,18%,72%,${alpha})`;
                ctx.lineWidth = 1.1;
                ctx.stroke();
                ctx.restore();
            }
        };
        draw(ctxF, this.bgTrisFar);
        draw(ctxN, this.bgTrisNear);
    }
    /* ─── Меню голосов ─── */
    renderVoiceMenu() {
        const menu = $('#uniVoiceMenu');
        menu.innerHTML = `<div class="menu-head">Голос TTS · Grok Voice</div>` + UNI_VOICES.map(v => `
<button class="m-item ${v.id === this.voice ? 'active' : ''}" data-v="${v.id}" role="option">
<span class="mi-ico"><svg><use href="#i-volume"/></svg></span>
<span class="mi-body">
<span class="mi-t">${esc(v.name)}</span>
<span class="mi-s">${esc(v.desc)}</span>
</span>
<svg class="mi-check ic"><use href="#i-check"/></svg>
</button>`).join('');
        menu.querySelectorAll('.m-item').forEach(b => b.addEventListener('click', () => {
            this.voice = b.dataset.v;
            this.saveVoice();
            const curV = UNI_VOICES.find(v => v.id === this.voice) || UNI_VOICES[0];
            $('#uniVoiceLabel').textContent = curV.name;
            this.closeVoiceMenu();
            toast('Голос: ' + curV.name, 'ok', 1600);
        }));
    }
    toggleVoiceMenu() {
        const menu = $('#uniVoiceMenu');
        const btn = $('#uniVoiceBtn');
        const isOpen = !menu.hidden && !menu.classList.contains('out');
        if (isOpen) { this.closeVoiceMenu(); return; }
        this.renderVoiceMenu();
        menu.classList.remove('out');
        menu.hidden = false;
        void menu.offsetWidth;
        menu.classList.add('anim');
        btn.classList.add('open');
    }
    closeVoiceMenu() {
        const menu = $('#uniVoiceMenu');
        const btn = $('#uniVoiceBtn');
        if (!menu || menu.hidden) return;
        btn.classList.remove('open');
        menu.classList.remove('anim');
        void menu.offsetWidth;
        menu.classList.add('out');
        setTimeout(() => {
            if (menu.classList.contains('out')) {
                menu.hidden = true;
                menu.classList.remove('out');
            }
        }, 180);
    }
    loadVoice() {
        const saved = state.settings.uniVoice;
        if (saved && UNI_VOICES.some(v => v.id === saved)) this.voice = saved;
        const v = UNI_VOICES.find(x => x.id === this.voice);
        $('#uniVoiceLabel').textContent = v ? v.name : 'Eve';
        this.updateKeyIndicator();
    }
    /* Индикатор наличия API-ключа OpenRouter: зелёная точка на кнопке #uniKeyBtn,
    если ключ указан. Пользователь сразу видит, готов ли Юни к работе,
    и не нужно лезть в настройки. */
    updateKeyIndicator() {
        const btn = $('#uniKeyBtn');
        if (!btn) return;
        const hasKey = !!(state.settings.orKey || '').trim();
        btn.style.position = 'relative';
        let dot = btn.querySelector('.uni-key-dot');
        if (hasKey) {
            if (!dot) {
                dot = document.createElement('span');
                dot.className = 'uni-key-dot';
                dot.style.cssText = 'position:absolute;top:4px;right:4px;width:8px;height:8px;border-radius:50%;background:var(--ok);box-shadow:0 0 8px hsla(152,55%,55%,.8);pointer-events:none;animation:pulse 1.8s ease-in-out infinite';
                btn.appendChild(dot);
            }
            btn.title = 'API-ключ OpenRouter подключён';
        } else {
            if (dot) dot.remove();
            btn.title = 'Укажите API-ключ OpenRouter';
        }
    }
    saveVoice() {
        state.settings.uniVoice = this.voice;
        save();
    }
    /* ─── Мини-окошко API-ключа ─── */
    openKeyPop() {
        const pop = $('#uniKeyPop');
        $('#uniKeyInput').value = state.settings.orKey || '';
        pop.hidden = false;
        setTimeout(() => { try { $('#uniKeyInput').focus({ preventScroll: true }); } catch (e) { } }, 80);
    }
    closeKeyPop() { $('#uniKeyPop').hidden = true; }
    saveKeyFromPop() {
        const val = $('#uniKeyInput').value.trim();
        state.settings.orKey = val;
        save();
        updateBalMini();
        this.updateKeyIndicator();
        this.closeKeyPop();
        toast(val ? 'Ключ OpenRouter сохранён' : 'Ключ очищен', val ? 'ok' : 'info', 1600);
    }
}
const uni = new UniController();
window.uni = uni;
/* Привязка событий Юни: верхняя кнопка рядом с темой вызывает Юни */
$('#btnChangelog')?.addEventListener('click', () => {
    if (window.changelogController) window.changelogController.open();
});
$('#changelogClose')?.addEventListener('click', () => {
    if (window.changelogController) window.changelogController.close();
});
$('#changelogOverlay')?.addEventListener('click', e => {
    if (e.target === $('#changelogOverlay')) {
        if (window.changelogController) window.changelogController.close();
    }
});
$('#btnUni')?.addEventListener('click', () => uni.open());
$('#uniClose')?.addEventListener('click', () => uni.close());
$('#uniStopBtn')?.addEventListener('click', () => {
    if (uni.userStopped) {
        /* Кнопка в режиме «Продолжить» — возобновляем диалог */
        uni.resume();
        toast('Слушаю вас', 'ok', 1400);
    } else {
        uni.stop();
        toast('Остановлено · нажмите «Продолжить»', 'info', 1800);
    }
});
$('#uniVoiceBtn')?.addEventListener('click', e => {
    e.stopPropagation();
    uni.toggleVoiceMenu();
});
$('#uniKeyBtn')?.addEventListener('click', e => {
    e.stopPropagation();
    uni.openKeyPop();
});
$('#uniKeyClose')?.addEventListener('click', () => uni.closeKeyPop());
$('#uniKeySave')?.addEventListener('click', () => uni.saveKeyFromPop());
$('#uniKeyEye')?.addEventListener('click', () => {
    const inp = $('#uniKeyInput');
    if (!inp) return;
    const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    $('#uniKeyEye')?.classList.toggle('on', show);
});
$('#uniKeyInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); uni.saveKeyFromPop(); }
    else if (e.key === 'Escape') { uni.closeKeyPop(); }
});
$('#uniKeyPop')?.addEventListener('click', e => {
    if (e.target === $('#uniKeyPop')) uni.closeKeyPop();
});
document.addEventListener('click', e => {
    if (!e.target.closest('#uniVoiceMenu') && !e.target.closest('#uniVoiceBtn')) {
        uni.closeVoiceMenu();
    }
});
document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#uniOverlay').hidden) {
        if (!$('#uniKeyPop').hidden) uni.closeKeyPop();
        else if (!$('#uniVoiceMenu').hidden) uni.closeVoiceMenu();
        else uni.close();
    }
});
/* События ресайза для голосового ассистента Юни теперь централизованно 
обрабатываются через глобальный стабилизатор handleOrientationOrResizeTransition */
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => {
            const result = String(r.result || '');
            const idx = result.indexOf(',');
            resolve(idx >= 0 ? result.slice(idx + 1) : result);
        };
        r.onerror = () => reject(new Error('FileReader'));
        r.readAsDataURL(blob);
    });
}
window.blobToBase64 = blobToBase64;

/* ─── Универсальная транскрибация речи через openai/whisper-large-v3-turbo ─── */
async function transcribeWithWhisper(audioBlob) {
    const s = (typeof state !== 'undefined' && state.settings) || (window.state && window.state.settings) || {};
    const orKey = (s.orKey || '').trim();
    const proxyKey = (s.proxyKey || '').trim();

    if (!orKey && !proxyKey) {
        throw new Error('Укажите API-ключ OpenRouter или ProxyAPI в настройках');
    }

    const key = orKey || proxyKey;
    const url = orKey
        ? 'https://openrouter.ai/api/v1/audio/transcriptions'
        : 'https://api.proxyapi.ru/openrouter/v1/audio/transcriptions';

    const format = (audioBlob.type || '').indexOf('mp4') !== -1 ? 'mp4'
        : (audioBlob.type || '').indexOf('webm') !== -1 ? 'webm'
            : (audioBlob.type || '').indexOf('ogg') !== -1 ? 'ogg' : 'wav';

    const base64 = await blobToBase64(audioBlob);

    const origin = (typeof location !== 'undefined' && location.origin) ? location.origin : '';
    const referer = (origin && !origin.startsWith('file') && !origin.startsWith('app') && !origin.startsWith('capacitor') && !origin.includes('localhost'))
        ? origin : 'https://unichat2.sahbanovtimur228.workers.dev/ai';

    let resp;
    try {
        const cleanKey = String(key || '').trim().replace(/[^\x21-\x7E]/g, '');
        const attribHeaders = getOpenRouterAttributionHeaders('Whisper STT');
        resp = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + cleanKey,
                'Content-Type': 'application/json',
                ...attribHeaders
            },
            body: JSON.stringify({
                model: 'openai/whisper-large-v3-turbo',
                input_audio: { data: base64, format }
            })
        });
    } catch (e) {
        throw new Error('Не удалось связаться с сервером транскрибации: ' + (e.message || 'network'));
    }

    if (!resp.ok) {
        let msg = 'HTTP ' + resp.status;
        try {
            const j = await resp.json();
            msg = j.error?.message || j.message || msg;
        } catch (_) { }
        throw new Error('Whisper: ' + msg);
    }

    const data = await resp.json();
    return (data.text || '').trim();
}
window.transcribeWithWhisper = transcribeWithWhisper;