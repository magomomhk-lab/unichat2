/* ============================================================
   toolCalling.js:
   Единый контроллер и исполнительный слой инструментов MoonSSS:
   - Генерация изображений (Riverflow 2.5 Pro, GPT 5 Image, Muse Image, FLUX 2 Klein)
   - Агентный веб-поиск в реальном времени (Web Search & Media Extraction)
   - Интерактивные артефакты (HTML/CSS/JS Sealed Sandboxes)
   - Параллельное мышление (Deep Thinking & Multi-branch Reasoning)
   - Безопасное выполнение кода (Process Sandbox: Python / Node / Bash)
   - Медиа-парсер и авто-плееры (YouTube, VK, RuTube, Dzen, Audio/Video)

   Совместимость: Web (Pure HTML5), Electron (Desktop IPC), Capacitor (Android)
   Стандарты: Pure Vanilla ES6+, No LocalStorage, No Emoji, Inline SVGs, HSLA
============================================================ */
'use strict';

/* ============================================================
   1. КОНФИГУРАЦИЯ И МОДЕЛИ ИНСТРУМЕНТОВ
============================================================ */

var IMG_MODELS = window.IMG_MODELS || [
  {
    id: "openai/gpt-image-2.5-sunburst",
    name: "GPT Image 2.5 Sunburst",
    vendor: "OpenAI",
    icon: "chat-gpt.png",
    aliases: [
      "openai/gpt-image-2.5-sunburst",
      "gpt-image-2.5-sunburst",
      "gpt image 2.5 sunburst",
      "gpt-image-2.5",
      "gpt image 2.5",
      "sunburst",
      "gpt sunburst",
      "openai sunburst"
    ],
    qualities: ["auto", "low", "medium", "high", "xhigh", "max"],
    supportsQuality: true,
    supportsResolution: false,
    ratios: ["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16", "21:9", "auto"],
    backgrounds: ["auto", "opaque"],
    desc: "Флагманская генерация OpenAI следующего поколения: кинематографичный свет, поддержка потокового SSE-синтеза, расширенная шкала детализации до Max и форматы 16:9/9:16/21:9",
  },
  {
    id: "inclusionai/ming-image-0.1-design",
    name: "Ming Image 0.1 Design",
    vendor: "Inclusionai",
    icon: "ling.png",
    aliases: [
      "ming",
      "inclusionai/ming-image-0.1-design",
      "inclusionai/ming-image-0.1 design",
      "inclusionai/ming-image 0.1 design",
      "inclusionai/ming image 0.1 design",
      "inclusionai/ming image design",
      "inclusionai/ming-image",
      "inclusionai/ming image",
      "inclusionai/",
      "inclusionai",
      "ming-image-0.1",
      "ming-image",
      "ming image"
    ],
    resolutions: ["1K"],
    supportsResolution: false,
    supportsQuality: false,
    supportsReferences: false,
    ratios: ["1:1"],
    backgrounds: [],
    outputFormats: ["png", "jpeg", "webp"],
    desc: "Сверхбыстрая бесплатная модель генерации от Inclusionai (разрешение 1K, формат 1:1, поддержка base64 и SSE-стриминга)",
  },
  {
    id: "microsoft/mai-image-2.6-flash",
    name: "MAI Image 2.6 Flash",
    vendor: "Microsoft",
    icon: "MAI.png",
    aliases: [
      "microsoft/mai-image-2.6-flash",
      "mai-image-2.6-flash",
      "mai image 2.6 flash",
      "mai flash",
      "mai-image flash",
      "microsoft mai flash"
    ],
    resolutions: ["1K"],
    supportsResolution: false,
    supportsQuality: false,
    ratios: ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "auto"],
    backgrounds: [],
    desc: "Сверхбыстрая генерация от Microsoft: высокая скорость инференса и точное следование текстовым инструкциям",
  },
  {
    id: "microsoft/mai-image-2.6",
    name: "MAI Image 2.6",
    vendor: "Microsoft",
    icon: "MAI.png",
    aliases: [
      "microsoft/mai-image-2.6",
      "mai-image-2.6",
      "mai image 2.6",
      "mai image",
      "mai",
      "microsoft mai"
    ],
    resolutions: ["1K"],
    supportsResolution: false,
    supportsQuality: false,
    ratios: ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "auto"],
    backgrounds: [],
    desc: "Флагманская модель от Microsoft: высокая детализация, художественные стили и сложная композиция",
  },
  {
    id: "black-forest-labs/flux.2-pro",
    name: "FLUX 2 Pro",
    vendor: "Black Forest Labs",
    icon: "flux.png",
    aliases: [
      "flux 2 pro",
      "flux.2-pro",
      "flux.2 pro",
      "flux pro 2",
      "flux pro",
      "black forest labs pro",
      "black-forest-labs/flux.2-pro",
    ],
    resolutions: ["1K"],
    supportsResolution: false,
    supportsQuality: false,
    ratios: ["1:1", "4:3", "3:4", "3:2", "2:3", "16:9", "9:16", "21:9", "auto"],
    backgrounds: [],
    supportsFluxParams: true,
    desc: "Флагманская фотореалистичная модель Black Forest Labs: генерация текста на изображениях, поддержка параметров steps (10-50), guidance (1.0-10.0) и safety_tolerance (0-5)",
  },
  {
    id: "openai/gpt-image-2",
    name: "GPT Image 2",
    vendor: "OpenAI",
    icon: "chat-gpt.png",
    aliases: [
      "gpt-image-2",
      "gpt image 2",
      "openai/gpt-image-2",
      "openai/gpt-5-image",
      "gpt-5-image",
      "gpt 5 image",
      "openai image"
    ],
    qualities: ["auto", "low", "medium", "high"],
    supportsQuality: true,
    supportsResolution: false,
    ratios: ["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16", "21:9", "auto"],
    backgrounds: ["auto", "opaque"],
    desc: "Флагманская генерация OpenAI (gpt-image-2): высокое качество, нативные форматы 16:9/9:16/21:9, low/medium/high детализация",
  },
  {
    id: "sourceful/riverflow-v2.5-pro",
    name: "Riverflow 2.5 Pro",
    vendor: "Sourceful",
    icon: "riverflow.png",
    aliases: [
      "riverflow 2.5 pro",
      "riverflow pro",
      "riverflow",
      "sourceful",
      "sourceful/riverflow-v2.5-pro",
    ],
    resolutions: ["1K", "2K", "4K"],
    supportsResolution: true,
    supportsQuality: false,
    ratios: ["1:1", "4:3", "3:4", "3:2", "2:3", "16:9", "9:16", "21:9", "auto"],
    backgrounds: ["auto", "transparent", "opaque"],
    desc: "Pro-уровень: до 4K, художественность и детали",
  },
  {
    id: "meta/muse-image",
    name: "Muse Image",
    vendor: "Meta",
    icon: "meta-color.svg",
    aliases: [
      "muse image",
      "muse",
      "muse-image",
      "meta/muse-image",
      "meta muse",
      "meta muse-image",
    ],
    resolutions: ["1K"],
    supportsResolution: false,
    supportsQuality: false,
    ratios: ["1:1", "16:9", "9:16", "4:3", "3:4", "auto"],
    backgrounds: [],
    desc: "Сверхбыстрая генерация от Meta: нативный SSE-стриминг, высокая детализация и следование промпту",
  },
  {
    id: "black-forest-labs/flux.2-klein-4b",
    name: "FLUX 2 Klein",
    vendor: "Black Forest Labs",
    icon: "flux.png",
    aliases: [
      "flux 2 klein",
      "flux 2",
      "flux klein",
      "flux.2 klein 4b",
      "flux.2 klein",
      "flux.2",
      "flux",
      "black forest labs",
      "black-forest-labs/flux.2-klein-4b",
    ],
    resolutions: ["1K"],
    supportsResolution: false,
    supportsQuality: false,
    ratios: ["1:1", "4:3", "3:4", "3:2", "2:3", "16:9", "9:16", "21:9", "auto"],
    backgrounds: [],
    supportsFluxParams: true,
    desc: "Мощная 4B модель. Настраиваемые шаги (steps) и полный анценз (safety_tolerance=5)",
  },
];

var EXEC_LANG_LABELS = window.EXEC_LANG_LABELS || { python: 'Python', node: 'Node.js', bash: 'Bash' };
var IG_BG_LABELS = window.IG_BG_LABELS || { auto: 'Авто', transparent: 'Прозрачный', opaque: 'Непрозрачный' };
var IG_QUALITY_LABELS = window.IG_QUALITY_LABELS || { auto: 'Авто', low: 'Low (1K)', medium: 'Medium (2K)', high: 'High (4K)', xhigh: 'Very High (xHigh)', max: 'Max' };
function igRatioLabel(r) { return r === 'auto' ? 'Авто' : r; }

function resolveImgModel(name) {
  const n = String(name || "").trim().toLowerCase();
  if (!n) return null;
  const list = window.IMG_MODELS || IMG_MODELS || [];
  return (
    list.find((m) => m.id === n || m.name.toLowerCase() === n || (m.aliases && m.aliases.includes(n))) ||
    list.find((m) => m.aliases && m.aliases.some((a) => n.includes(a))) ||
    null
  );
}

/* Движки OpenRouter Web Search (openrouter:web_search): маршрутизация и параметры */
var OR_WEB_ENGINES = [
  { id: 'auto', label: 'Авто', hint: 'OpenRouter сам выбирает native-поиск провайдера или Exa' },
  { id: 'native', label: 'Native', hint: 'Встроенный поиск провайдера (OpenAI, Anthropic, Google, Grok, Perplexity); без поддержки — Exa' },
  { id: 'exa', label: 'Exa', hint: 'Exa: выдержки по смыслу запроса, режимы от мгновенного до глубокого' },
  { id: 'parallel', label: 'Parallel', hint: 'Parallel: режимы turbo, fast, basic, advanced' },
  { id: 'perplexity', label: 'Perplexity', hint: 'Ранжированные результаты Perplexity Search API без LLM-пересказа' },
  { id: 'firecrawl', label: 'Firecrawl', hint: 'BYOK: расходует ваши кредиты Firecrawl, подключённые в OpenRouter' }
];
var OR_ENGINE_MODES = {
  exa: [['instant', 'Instant'], ['fast', 'Fast'], ['auto', 'Auto'], ['deep-lite', 'Deep Lite'], ['deep', 'Deep'], ['deep-reasoning', 'Deep Reasoning']],
  parallel: [['turbo', 'Turbo'], ['fast', 'Fast'], ['basic', 'Basic'], ['advanced', 'Advanced']]
};
var OR_CONTEXT_SIZES = ['low', 'medium', 'high'];
/* Модель-релей для серверного вызова поиска: для native-поиска нужна GPT-5 и новее */
var OR_SEARCH_RELAY_MODEL = 'openai/gpt-5-nano';

var MAX_ARTIFACTS_PER_MSG = 2;
var MAX_IMG_REQ_PER_MSG = 2;
var MAX_URL_FETCH_PER_MSG = 4;

/* Официальные схемы инструментов Function Calling для OpenRouter / ProxyAPI */
var WEB_AGENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Поисковая разведка в интернете. Ищет актуальные факты, документацию и новости по списку ключевых запросов.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          queries: {
            type: "array",
            description: "Список из 1-3 точных поисковых запросов",
            items: { type: "string" }
          }
        },
        required: ["queries"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "fetch_url",
      description: "Прямое скачивание и глубокое чтение полного очищенного текста веб-страниц по списку прямых URL.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          urls: {
            type: "array",
            description: "Список из 1-4 прямых URL веб-страниц (http/https)",
            items: { type: "string" }
          }
        },
        required: ["urls"]
      }
    }
  }
];
window.WEB_AGENT_TOOLS = WEB_AGENT_TOOLS;

var IMG_CMD_RE = /\{image_generation\s*\[\s*([^\[\]:]+?)(?:\s*:\s*([^\[\]]*?))?\s*\]\s*:\s*\{([\s\S]+?)\}\}/gi;
var IMG_CMD_STREAM_PATTERN = /\{image_generation\s*\[\s*([^\[\]:]+?)(?:\s*:\s*([^\[\]]*?))?\s*\]\s*:\s*\{([\s\S]+?)\}\}/i;
var WS_CMD_RE = /\{["']?(?:web[-_]search|webSearch)["']?\s*:\s*(?:\[([\s\S]*?)\]|"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)')\s*\}/i;
var THINK_CMD_RE = /\{["']?thinking(?:_|[-_]process)?["']?\s*(?::\s*)?\[([\s\S]*?)\]\s*\}/i;
var URL_FETCH_CMD_RE = /\{["']?(?:fetch[-_]urls?|fetchUrls?)["']?\s*:\s*(?:\[([\s\S]*?)\]|"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)')\s*\}/i;

/* Вспомогательные функции и нормализация MIME-типов изображений */
function detectMimeFromBase64(b64) {
  if (!b64 || typeof b64 !== 'string') return 'image/jpeg';
  const clean = b64.replace(/^data:[^;]+;base64,/, '').trim().replace(/\s+/g, '');
  if (clean.startsWith('/9j/')) return 'image/jpeg';
  if (clean.startsWith('iVBORw0KGgo')) return 'image/png';
  if (clean.startsWith('UklGR')) return 'image/webp';
  if (clean.startsWith('R0lGOD')) return 'image/gif';
  if (clean.startsWith('PHN2Zw') || clean.startsWith('PD94bW') || clean.startsWith('PD94b')) return 'image/svg+xml';
  if (clean.startsWith('Qk')) return 'image/bmp';
  return 'image/jpeg';
}
window.detectMimeFromBase64 = detectMimeFromBase64;

function fixDataUrlMime(dataUrlOrB64, fallbackMediaType = 'image/jpeg') {
  if (!dataUrlOrB64 || typeof dataUrlOrB64 !== 'string') return dataUrlOrB64;
  if (!dataUrlOrB64.startsWith('data:')) {
    const mime = detectMimeFromBase64(dataUrlOrB64) || fallbackMediaType;
    return `data:${mime};base64,${dataUrlOrB64}`;
  }
  const commaIdx = dataUrlOrB64.indexOf(',');
  if (commaIdx === -1) return dataUrlOrB64;
  const b64 = dataUrlOrB64.slice(commaIdx + 1);
  const detectedMime = detectMimeFromBase64(b64) || fallbackMediaType;
  return `data:${detectedMime};base64,${b64}`;
}
window.fixDataUrlMime = fixDataUrlMime;

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
window.esc = esc;

function fmtDur(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}
window.fmtDur = fmtDur;

function domainHost(uri) {
  try { return new URL(uri).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
}
window.domainHost = domainHost;

/* Объединяет внешний AbortSignal с таймаутом: любой из них прерывает запрос.
   Возвращает { signal, clear } — clear() обязательно вызывать после завершения. */
function withTimeoutSignal(signal, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => { try { ctrl.abort(); } catch (_) { } }, Math.max(1000, ms || 20000));
  const onAbort = () => { clearTimeout(timer); try { ctrl.abort(); } catch (_) { } };
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  return {
    signal: ctrl.signal,
    clear: () => { clearTimeout(timer); if (signal) signal.removeEventListener('abort', onAbort); }
  };
}
window.withTimeoutSignal = withTimeoutSignal;

function isAbortError(e) {
  return !!(e && (e.name === 'AbortError' || e.code === 20));
}
window.isAbortError = isAbortError;

/* ============================================================
   КОМПОНЕНТ АНИМАЦИИ ГЕНЕРАЦИИ ИЗОБРАЖЕНИЙ (ImageGeneration)
============================================================ */
class ImageGeneration {
  constructor(options = {}) {
    this.duration = typeof options.duration === 'number' ? options.duration : 30000;
    this.progress = Math.max(0, Math.min(100, typeof options.progress === 'number' ? options.progress : 0));
    this.loadingState = options.loadingState || 'starting';
    this.autoSimulate = Boolean(options.autoSimulate);

    this.statusTexts = Object.assign({
      starting: 'Инициализация генерации…',
      generating: 'Создание изображения. Это может занять некоторое время…',
      completed: 'Изображение создано.',
      error: 'Ошибка создания изображения.'
    }, options.statusTexts || {});

    this.container = null;
    this.rootEl = null;
    this.textEl = null;
    this.cardEl = null;
    this.curtainEl = null;
    this.laserEl = null;
    this.imageEl = null;

    this.intervalId = null;
    this.timeoutId = null;
    this.onComplete = typeof options.onComplete === 'function' ? options.onComplete : null;
  }

  static createMarkup(data = {}) {
    const progress = Math.max(0, Math.min(100, Math.round(data.progress || 0)));
    const state = data.loadingState || (progress >= 100 ? 'completed' : (progress > 0 ? 'generating' : 'starting'));
    const isDone = state === 'completed';

    const defaultTexts = {
      starting: 'Инициализация генерации…',
      generating: 'Создание изображения. Это может занять некоторое время…',
      completed: 'Изображение создано.',
      error: 'Ошибка создания изображения.'
    };
    const statusText = data.statusText || defaultTexts[state] || defaultTexts.generating;

    const clipPolygon = `polygon(0 ${progress}%, 100% ${progress}%, 100% 100%, 0 100%)`;
    const maskGrad = progress === 0
      ? 'linear-gradient(to bottom, black -5%, black 100%)'
      : `linear-gradient(to bottom, transparent ${Math.max(0, progress - 5)}%, transparent ${progress}%, black ${Math.min(100, progress + 5)}%)`;

    const imgTag = data.imageSrc
      ? `<img class="aimagen-img" src="${data.imageSrc}" alt="${data.alt || 'Сгенерированное изображение'}" loading="lazy" />`
      : `<div class="aimagen-placeholder-canvas">
           <div class="aimagen-placeholder-shimmer"></div>
           <svg class="aimagen-placeholder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
             <rect x="3" y="3" width="18" height="18" rx="3"></rect>
             <circle cx="8.5" cy="8.5" r="1.5"></circle>
             <path d="M21 15l-5-5L5 21"></path>
           </svg>
         </div>`;

    return `
      <div class="aimagen-root" data-state="${state}">
        <span class="aimagen-shimmer-text ${isDone ? 'is-completed' : ''}" aria-live="polite">
          ${statusText}
        </span>
        <div class="aimagen-card">
          ${imgTag}
          <div class="aimagen-curtain" 
               style="clip-path: ${clipPolygon}; -webkit-clip-path: ${clipPolygon}; mask-image: ${maskGrad}; -webkit-mask-image: ${maskGrad}; opacity: ${isDone ? 0 : 1};" 
               aria-hidden="true"></div>
          ${!isDone ? `<div class="aimagen-laser-edge" style="top: ${progress}%; opacity: ${progress > 0 && progress < 100 ? 1 : 0};" aria-hidden="true"></div>` : ''}
        </div>
      </div>
    `;
  }

  mount(targetContainer, imageSourceOrEl) {
    if (!targetContainer) return;
    this.container = targetContainer;

    const root = document.createElement('div');
    root.className = 'aimagen-root';
    root.dataset.state = this.loadingState;

    const textSpan = document.createElement('span');
    textSpan.className = 'aimagen-shimmer-text';
    textSpan.textContent = this.statusTexts[this.loadingState];
    root.appendChild(textSpan);

    const card = document.createElement('div');
    card.className = 'aimagen-card';

    if (typeof imageSourceOrEl === 'string') {
      const img = document.createElement('img');
      img.className = 'aimagen-img';
      img.src = imageSourceOrEl;
      img.alt = 'Сгенерированное изображение';
      img.loading = 'lazy';
      card.appendChild(img);
      this.imageEl = img;
    } else if (imageSourceOrEl instanceof HTMLElement) {
      imageSourceOrEl.classList.add('aimagen-img');
      card.appendChild(imageSourceOrEl);
      this.imageEl = imageSourceOrEl;
    } else {
      const ph = document.createElement('div');
      ph.className = 'aimagen-placeholder-canvas';
      ph.innerHTML = `
        <div class="aimagen-placeholder-shimmer"></div>
        <svg class="aimagen-placeholder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="3" width="18" height="18" rx="3"></rect>
          <circle cx="8.5" cy="8.5" r="1.5"></circle>
          <path d="M21 15l-5-5L5 21"></path>
        </svg>
      `;
      card.appendChild(ph);
    }

    const curtain = document.createElement('div');
    curtain.className = 'aimagen-curtain';
    curtain.setAttribute('aria-hidden', 'true');
    card.appendChild(curtain);

    const laser = document.createElement('div');
    laser.className = 'aimagen-laser-edge';
    laser.setAttribute('aria-hidden', 'true');
    card.appendChild(laser);

    root.appendChild(card);
    targetContainer.innerHTML = '';
    targetContainer.appendChild(root);

    this.rootEl = root;
    this.textEl = textSpan;
    this.cardEl = card;
    this.curtainEl = curtain;
    this.laserEl = laser;

    this.renderState();

    if (this.autoSimulate) {
      this.startAutoSimulation();
    }
  }

  setProgress(percent, customStatusText) {
    this.progress = Math.max(0, Math.min(100, percent));
    if (this.progress > 0 && this.loadingState === 'starting') {
      this.loadingState = 'generating';
    }
    if (this.progress >= 100) {
      this.loadingState = 'completed';
    }
    this.renderState(customStatusText);
  }

  setLoadingState(state, customStatusText) {
    this.loadingState = state;
    if (state === 'completed') {
      this.progress = 100;
    }
    this.renderState(customStatusText);
  }

  setImage(dataUrlOrSrc) {
    if (!this.cardEl) return;
    let img = this.cardEl.querySelector('.aimagen-img');
    if (!img) {
      img = document.createElement('img');
      img.className = 'aimagen-img';
      this.cardEl.insertBefore(img, this.curtainEl);
      const ph = this.cardEl.querySelector('.aimagen-placeholder-canvas');
      if (ph) ph.remove();
    }
    img.src = dataUrlOrSrc;
    this.imageEl = img;
  }

  renderState(customStatusText) {
    if (!this.rootEl) return;

    this.rootEl.dataset.state = this.loadingState;
    const isDone = this.loadingState === 'completed';

    if (this.textEl) {
      this.textEl.textContent = customStatusText || this.statusTexts[this.loadingState];
      this.textEl.classList.toggle('is-completed', isDone);
    }

    if (this.curtainEl) {
      const p = this.progress;
      const clipPolygon = `polygon(0 ${p}%, 100% ${p}%, 100% 100%, 0 100%)`;
      const maskGrad = p === 0
        ? 'linear-gradient(to bottom, black -5%, black 100%)'
        : `linear-gradient(to bottom, transparent ${Math.max(0, p - 5)}%, transparent ${p}%, black ${Math.min(100, p + 5)}%)`;

      this.curtainEl.style.clipPath = clipPolygon;
      this.curtainEl.style.webkitClipPath = clipPolygon;
      this.curtainEl.style.maskImage = maskGrad;
      this.curtainEl.style.webkitMaskImage = maskGrad;
      this.curtainEl.style.opacity = isDone ? '0' : '1';
    }

    if (this.laserEl) {
      this.laserEl.style.top = `${this.progress}%`;
      this.laserEl.style.opacity = (!isDone && this.progress > 0 && this.progress < 100) ? '1' : '0';
    }

    if (isDone && typeof this.onComplete === 'function') {
      this.onComplete();
      this.onComplete = null;
    }
  }

  startAutoSimulation() {
    this.timeoutId = setTimeout(() => {
      this.setLoadingState('generating');
      const startTime = Date.now();

      this.intervalId = setInterval(() => {
        const elapsedTime = Date.now() - startTime;
        const progressPercentage = Math.min(100, (elapsedTime / this.duration) * 100);
        this.setProgress(progressPercentage);

        if (progressPercentage >= 100) {
          clearInterval(this.intervalId);
          this.setLoadingState('completed');
        }
      }, 16);
    }, 2800);
  }

  destroy() {
    if (this.intervalId) clearInterval(this.intervalId);
    if (this.timeoutId) clearTimeout(this.timeoutId);
    this.intervalId = null;
    this.timeoutId = null;
  }
}

if (typeof window !== 'undefined') {
  window.ImageGeneration = ImageGeneration;
}

/* ============================================================
   2. КЛАСС УПРАВЛЕНИЯ ИНСТРУМЕНТАМИ (ToolCallingController)
============================================================ */

var THINK_BUDGET = window.THINK_BUDGET || {
  minimal: 2048,
  low: 4096,
  mid: 8192,
  medium: 16384,
  high: 32768,
  xhigh: 65536,
  max: 131072,
  always: 131072,
};
window.THINK_BUDGET = THINK_BUDGET;

var IMG_STOP_WORDS = window.IMG_STOP_WORDS || [
  'что', 'такое', 'такая', 'такой', 'кто', 'как', 'почему', 'зачем', 'где', 'когда',
  'объясни', 'объясните', 'пожалуйста', 'расскажи', 'расскажите', 'опиши', 'опишите',
  'покажи', 'покажите', 'это', 'этот', 'эта', 'эти', 'мне', 'нужно', 'можно', 'ли',
  'в', 'на', 'с', 'о', 'об', 'из', 'по', 'за', 'для', 'и', 'или', 'а', 'но', 'ты',
  'вы', 'про', 'чем', 'чего', 'какой', 'какая', 'какие'
];
window.IMG_STOP_WORDS = IMG_STOP_WORDS;

class ToolCallingController {
  constructor() {
    this.execUnsubs = new Map();
    this.execRuntimeFiles = new Map();
    this.execForce = new Map();
    this.execRefreshTimer = null;
    this.favCache = new Map();
    this.faviconSeq = 0;
    this.searchWorkerBroken = false;
    this.lastProxyKey = '';
  }

  getAppSettings() {
    return (typeof window.state !== 'undefined' && window.state.settings)
      ? window.state.settings
      : (typeof getAppSettings === 'function' ? getAppSettings() : {});
  }

  getActiveChat() {
    if (typeof window.activeChat === 'function') return window.activeChat();
    if (window.state && Array.isArray(window.state.chats) && window.state.activeId) {
      return window.state.chats.find(c => c.id === window.state.activeId) || null;
    }
    return null;
  }

  saveAppState() {
    if (typeof window.save === 'function') window.save();
  }

  refreshMsg(m) {
    if (typeof window.refreshCurrentMsg === 'function') {
      window.refreshCurrentMsg(m);
    } else {
      const el = document.querySelector(`[data-id="${m.id}"]`);
      if (el && typeof window.refreshMsgBody === 'function') window.refreshMsgBody(el, m);
    }
  }

  startTicker() {
    if (typeof window.startGenTicker === 'function') window.startGenTicker();
  }

  getImgCfg() {
    const s = this.getAppSettings();
    if (!s.imgGen) s.imgGen = { model: IMG_MODELS[0].id, ratio: '1:1', resolution: '2K', background: 'auto' };
    return s.imgGen;
  }

  getDeepThinkMax() {
    return 100;
  }

  /* ── OpenRouter Web Search: конфигурация, сборка инструмента, релей и UI ── */

  getOrSearchCfg() {
    const s = this.getAppSettings();
    const c = (s.webSearchCfg && s.webSearchCfg.openrouter) || {};
    const engine = OR_WEB_ENGINES.some(e => e.id === c.engine) ? c.engine : 'auto';
    const modes = OR_ENGINE_MODES[engine] || [];
    const mode = modes.some(([id]) => id === c.mode) ? c.mode : '';
    const rawMax = parseInt(c.max_results, 10);
    const splitDomains = v => String(Array.isArray(v) ? v.join(',') : (v || ''))
      .split(/[,\s]+/)
      .map(d => d.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase())
      .filter(Boolean)
      .slice(0, 50);
    return {
      engine,
      mode,
      serverMode: c.serverMode === true,
      max_results: isNaN(rawMax) ? 5 : Math.max(1, Math.min(25, rawMax)),
      search_context_size: OR_CONTEXT_SIZES.includes(c.search_context_size) ? c.search_context_size : '',
      allowed_domains: splitDomains(c.allowed_domains),
      excluded_domains: splitDomains(c.excluded_domains)
    };
  }

  buildOpenRouterSubagentTools() {
    /* Работники хранятся списком в SubagentStore (subagents.js) */
    return window.SubagentStore ? window.SubagentStore.buildTools() : [];
  }

  isOrServerSearchActive(settings, model) {
    const s = settings || this.getAppSettings();
    const cfg = s && s.webSearchCfg && s.webSearchCfg.openrouter;
    if (!s || !s.webSearch || !cfg || cfg.serverMode !== true) return false;
    const route = typeof window.resolveApiRoute === 'function'
      ? window.resolveApiRoute(s, model || { api: 'openrouter' })
      : { useORDirect: !!(s.orKey || '').trim() && !s.proxyKey };
    return !!route.useORDirect;
  }

  buildOpenRouterWebSearchTool(cfgIn, opts = {}) {
    const cfg = cfgIn || this.getOrSearchCfg();
    const s = this.getAppSettings();
    const params = {};
    if (cfg.engine !== 'auto') params.engine = cfg.engine;
    if (cfg.mode && (OR_ENGINE_MODES[cfg.engine] || []).some(([id]) => id === cfg.mode)) params.mode = cfg.mode;
    params.max_results = cfg.engine === 'perplexity' ? Math.min(20, cfg.max_results) : cfg.max_results;
    if (cfg.search_context_size) params.search_context_size = cfg.search_context_size;
    /* Exa принимает оба списка доменов, остальные движки — только один */
    const bothLists = cfg.engine === 'exa';
    if (cfg.allowed_domains.length) params.allowed_domains = cfg.allowed_domains;
    if (cfg.excluded_domains.length && (bothLists || !cfg.allowed_domains.length)) params.excluded_domains = cfg.excluded_domains;
    if (cfg.engine === 'native') {
      const a = (s.webSearchCfg && s.webSearchCfg.anthropic) || {};
      params.user_location = {
        type: 'approximate',
        city: a.city || 'Moscow',
        region: a.region || 'Moscow',
        country: a.country || 'RU',
        timezone: a.timezone || 'Europe/Moscow'
      };
    }
    if (opts.serverMode) params.max_uses = this.getWsLimit();
    return { type: 'openrouter:web_search', parameters: params };
  }

  _extractOrCitations(anns) {
    const map = new Map();
    (Array.isArray(anns) ? anns : []).forEach(a => {
      const uc = (a && a.url_citation) || a || {};
      const uri = String(uc.url || '').trim();
      if (!/^https?:\/\//i.test(uri)) return;
      const excerpt = String(uc.content || uc.snippet || '').replace(/\s+/g, ' ').trim();
      if (map.has(uri)) {
        const ex = map.get(uri);
        if (excerpt && ex.snippet.length < 700) ex.snippet = (ex.snippet ? ex.snippet + ' … ' : '') + excerpt;
      } else {
        const title = (uc.title && uc.title !== uri) ? String(uc.title).trim() : (domainHost(uri) || uri);
        map.set(uri, { uri, title, snippet: excerpt });
      }
    });
    return [...map.values()].map(s => ({ ...s, snippet: s.snippet.slice(0, 700) }));
  }

  async _searchViaOrServerTool(query, signal, cfgOverride) {
    const s = this.getAppSettings();
    const key = String(s.orKey || '').trim().replace(/[^\x21-\x7E]/g, '');
    const q = String(query || '').trim();
    if (!key || !q) return null;
    const cfg = cfgOverride || this.getOrSearchCfg();
    const tool = this.buildOpenRouterWebSearchTool(cfg);
    const attrib = typeof window.getOpenRouterAttributionHeaders === 'function'
      ? window.getOpenRouterAttributionHeaders('Web Search')
      : {};
    const t = withTimeoutSignal(signal, 60000);
    try {
      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: t.signal,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key, ...attrib },
        body: JSON.stringify({
          model: OR_SEARCH_RELAY_MODEL,
          messages: [
            { role: 'system', content: 'You are a web search relay. Call the openrouter:web_search tool exactly once with the user query. After the tool result, answer with one short sentence in the language of the query.' },
            { role: 'user', content: q }
          ],
          tools: [tool],
          max_tool_calls: 1,
          reasoning: { effort: 'minimal' },
          max_tokens: 400,
          stream: false
        })
      });
      if (!resp.ok) {
        console.warn('[WebSearch] openrouter:web_search HTTP', resp.status, cfg.engine);
        return null;
      }
      const data = await resp.json();
      const msg = (data && data.choices && data.choices[0] && data.choices[0].message) || {};
      const sources = this._extractOrCitations(msg.annotations);
      if (!sources.length) return null;
      return { result: String(msg.content || '').trim(), sources: sources.slice(0, 10), engine: cfg.engine };
    } catch (e) {
      if (isAbortError(e) && signal && signal.aborted) throw e;
      console.warn('[WebSearch] openrouter:web_search failed:', e);
      return null;
    } finally {
      t.clear();
    }
  }

  getOrSettingsRaw() {
    const s = this.getAppSettings();
    if (!s.webSearchCfg) s.webSearchCfg = {};
    if (!s.webSearchCfg.openrouter) s.webSearchCfg.openrouter = {};
    return s.webSearchCfg.openrouter;
  }

  setOrSearchValue(key, value) {
    const o = this.getOrSettingsRaw();
    const v = String(value ?? '');
    switch (key) {
      case 'serverMode':
        o.serverMode = v === '1';
        break;
      case 'engine':
        o.engine = v;
        if (!(OR_ENGINE_MODES[v] || []).some(([id]) => id === o.mode)) delete o.mode;
        break;
      case 'mode':
        if (v) o.mode = v; else delete o.mode;
        break;
      case 'max_results': {
        const n = parseInt(v, 10);
        if (!isNaN(n)) o.max_results = Math.max(1, Math.min(25, n));
        break;
      }
      case 'search_context_size':
        o.search_context_size = OR_CONTEXT_SIZES.includes(v) ? v : '';
        break;
      case 'allowed_domains':
      case 'excluded_domains':
        o[key] = v;
        break;
      default:
        return;
    }
    this.saveAppState();
  }

  buildOrSearchPanelHtml() {
    const c = this.getOrSearchCfg();
    const s = this.getAppSettings();
    const hasDirectKey = !!String(s.orKey || '').trim();
    const engineMeta = OR_WEB_ENGINES.find(e => e.id === c.engine) || OR_WEB_ENGINES[0];
    const chip = (key, val, label, active, title = '', cls = 'set-seg-btn') =>
      `<button type="button" class="${cls} ${active ? 'sel' : ''}" data-or-key="${key}" data-or-v="${esc(val)}" title="${esc(title)}" aria-pressed="${active ? 'true' : 'false'}">${esc(label)}</button>`;
    const engines = OR_WEB_ENGINES.map(e => chip('engine', e.id, e.label, c.engine === e.id, e.hint)).join('');
    const modes = OR_ENGINE_MODES[c.engine];
    const modeRow = modes ? `
      <div class="field">
        <label>Режим движка ${esc(engineMeta.label)}</label>
        <div class="set-segmented">
          ${chip('mode', '', 'По умолчанию', !c.mode)}
          ${modes.map(([id, label]) => chip('mode', id, label, c.mode === id)).join('')}
        </div>
      </div>` : '';
    const ctx = [['', 'Авто'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]
      .map(([v, l]) => chip('search_context_size', v, l, c.search_context_size === v, '', 'igm-chip')).join('');
    const maxCap = c.engine === 'perplexity' ? 20 : 25;
    return `
      <section class="set-sec">
        <div class="set-title"><svg><use href="#i-globe"/></svg>Поисковая маршрутизация OpenRouter</div>
        <div class="field">
          <label>Кто выполняет поиск</label>
          <div class="set-segmented">
            ${chip('serverMode', '0', 'Агент MoonSSS', !c.serverMode)}
            ${chip('serverMode', '1', 'Серверный OpenRouter', c.serverMode)}
          </div>
        </div>
        <div class="field">
          <label>Поисковый движок</label>
          <div class="set-segmented">${engines}</div>
        </div>
        ${modeRow}
        <div class="field">
          <label>Результатов на запрос: <b data-or-val-label="max_results">${c.max_results}</b></label>
          <div class="ws-limit-row"><input type="range" min="1" max="${maxCap}" step="1" value="${Math.min(c.max_results, maxCap)}" data-or-range="max_results"></div>
        </div>
        <div class="field">
          <label>Объём контекста (search_context_size)</label>
          <div class="igm-chips">${ctx}</div>
        </div>
        <div class="igm-row2">
          <div class="field">
            <label>Только эти домены</label>
            <input type="text" class="ws-input" data-or-input="allowed_domains" value="${esc(c.allowed_domains.join(', '))}" placeholder="arxiv.org, nature.com" spellcheck="false">
          </div>
          <div class="field">
            <label>Исключить домены</label>
            <input type="text" class="ws-input" data-or-input="excluded_domains" value="${esc(c.excluded_domains.join(', '))}" placeholder="reddit.com" spellcheck="false">
          </div>
        </div>
        <div class="igm-note">${esc(engineMeta.hint)}. Exa принимает оба списка доменов, остальные движки используют только разрешённые.</div>
        <div class="igm-note">${hasDirectKey
        ? 'Агент MoonSSS: запросы уходят через релей ' + esc(OR_SEARCH_RELAY_MODEL) + ', при пустом результате включается резервный поиск. Серверный режим: модель сама решает, когда искать.'
        : 'Серверный поиск OpenRouter работает только с прямым ключом sk-or-. Укажите его во вкладке «API и Ключи».'}</div>
${window.SubagentUI ? window.SubagentUI.entryHtml() : ''}
      </section>`;
  }

  bindOrSearchPanel(root, onChange) {
    if (!root) return;
    const done = () => { if (typeof onChange === 'function') onChange(); };
    root.querySelectorAll('[data-or-key]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.setOrSearchValue(btn.dataset.orKey, btn.dataset.orV);
        done();
      });
    });
    root.querySelectorAll('[data-or-range]').forEach(inp => {
      inp.addEventListener('input', () => {
        const lbl = root.querySelector('[data-or-val-label="max_results"]');
        if (lbl) lbl.textContent = inp.value;
        this.setOrSearchValue('max_results', inp.value);
      });
    });
    root.querySelectorAll('[data-or-input]').forEach(inp => {
      inp.addEventListener('change', () => {
        this.setOrSearchValue(inp.dataset.orInput, inp.value);
        done();
      });
    });
  }

  getWsLimit() {
    const s = this.getAppSettings();
    const raw = s.webSearchCfg?.openrouter?.limit ?? s.wsLimit;
    const v = parseInt(raw, 10);
    return isNaN(v) ? 3 : Math.max(1, Math.min(6, v));
  }

  _insertMarker(aiMsg, rawCmd, marker, location, fallbackNote) {
    if (!marker) return;
    if (!rawCmd) {
      if (location === 'thinking') {
        aiMsg.content = (aiMsg.content || '') + (aiMsg.content.trim() ? '\n' : '') + marker;
      } else {
        aiMsg.content = (aiMsg.content || '') + (aiMsg.content.trim() ? '\n' : '') + marker;
      }
      return;
    }
    if (location === 'thinking') {
      aiMsg.thinking = (aiMsg.thinking || '').replace(rawCmd, fallbackNote);
      aiMsg.content = (aiMsg.content || '') + (aiMsg.content.trim() ? '\n' : '') + marker;
    } else {
      if ((aiMsg.content || '').includes(rawCmd)) {
        aiMsg.content = aiMsg.content.replace(rawCmd, marker);
      } else if ((aiMsg.thinking || '').includes(rawCmd)) {
        aiMsg.thinking = aiMsg.thinking.replace(rawCmd, fallbackNote);
        aiMsg.content = (aiMsg.content || '') + (aiMsg.content.trim() ? '\n' : '') + marker;
      } else {
        aiMsg.content = (aiMsg.content || '') + (aiMsg.content.trim() ? '\n' : '') + marker;
      }
    }
  }

  /* ── Системные инструкции инструментов ── */

  buildImageGenInstructions() {
    const cfg = this.getImgCfg();
    const m = IMG_MODELS.find((x) => x.id === cfg.model) || IMG_MODELS[0];
    const quality = m.supportsQuality ? (cfg.quality || "high") : (m.supportsResolution ? (cfg.resolution || "2K") : "1K");

    let fluxNote = "";
    if (m.supportsFluxParams) {
      const steps = cfg.fluxSteps || 28;
      const guidance = cfg.fluxGuidance || 3.5;
      const safety = cfg.fluxSafety ?? 5;
      const format = cfg.fluxFormat || "jpeg";
      fluxNote = `\nСПЕЦИФИКАЦИЯ МОДЕЛИ ${m.name.toUpperCase()}:\n- Провайдер: Black Forest Labs (FLUX 2 Pro Architecture)\n- Параметры: Steps=${steps}, Guidance=${guidance}, Safety_Tolerance=${safety}, Format=${format}\n- Модель безупречно рендерит текст, вывески, типографику, логотипы и надписи прямо на изображении. Если в сюжете нужен текст, указывай его точно в кавычках (например: a sign reading \\"OpenRouter\\").\n- Подробно описывай композицию, освещение (blue hour, cinematic lighting), материалы и детализацию.`;
    }

    return [
      "=== ИНСТРУМЕНТ: ГЕНЕРАЦИЯ ИЗОБРАЖЕНИЙ (image_generation) ===",
      'У тебя есть встроенный генератор изображений. Тебе доступна РОВНО ОДНА модель генерации: "' + m.name + '". Других моделей генерации не существует — не упоминай и не предлагай их.' + fluxNote,
      "Ты МОЖЕШЬ предложить генерацию изображения, но ТОЛЬКО когда пользователь явно и однозначно просит нарисовать / сгенерировать / создать изображение, картинку, арт, обои, логотип, иллюстрацию, фото и т.п. Если прямой просьбы нет — НЕ используй команду по собственной инициативе, даже если картинка могла бы дополнить ответ.",
      "Когда пользователь просит изображение, строй ответ СТРОГО по схеме: 1) короткое вступление ДО команды — что именно ты сейчас сгенерируешь и как понял задачу; 2) команда с новой строки; 3) ОБЯЗАТЕЛЬНОЕ продолжение ПОСЛЕ команды. Команда — НЕ стоп-сигнал и НЕ конец ответа: не завершай сообщение командой и не останавливайся на ней, система сама вырежет её, вставит на её место карточку генерации, и генерация пойдёт параллельно, пока ты дописываешь текст.",
      "Если пользователь попросил помимо генерации ещё что-то (предложить идеи улучшения, объяснить, доработать, продолжить) — эта часть ответа пишется ПОСЛЕ команды.",
      "",
      "СИНТАКСИС КОМАНДЫ И РАБОТА С РЕФЕРЕНСАМИ ИЗ ИСТОРИИ ЧАТА:",
      "{image_generation[" + m.name + ":" + quality + "]:{подробный английский промпт}}",
      "или с указанием конкретных референсов:",
      "{image_generation[" + m.name + ":" + quality + ":refs=img_1,img_3]:{подробный английский промпт}}",
      "",
      "АВТОНОМНЫЙ ВЫБОР РЕФЕРЕНСОВ ИЗ ИСТОРИИ ДИАЛОГА:",
      "1. Все изображения в истории чата (как прикреплённые пользователем вложения, так и созданные тобой ранее иллюстрации) пронумерованы и снабжены метками: [ИЗОБРАЖЕНИЕ В ДИАЛОГЕ #N (id: img_N, название/стиль/промпт: ...)].",
      "2. Когда пользователь просит: «возьми изображение персонажа», «в стиле первой картинки», «дорисуй крылья», «в том же стиле, что выше», «используй этот референс» — ты ОБЯЗАНА САМА выбрать нужные изображения из истории диалога и перечислить их ID через параметр refs=...",
      "3. Примеры указания референсов:",
      "   • Конкретные изображения по стилю или персонажу: refs=img_1 или refs=img_1,img_4",
      "   • Последнее изображение в чате: refs=last",
      "   • Все доступные изображения темы: refs=all",
      "   • Без референсов (создание с нуля): не указывай refs или укажи refs=none",
      "4. Наша платформа АВТОМАТИЧЕСКИ извлечёт реальные визуальные полотна указанных тобой img_N и передаст их напрямую в диффузионный пайплайн модели генерации как input_references. Пользователю не требуется заново прикреплять файлы!",
      "",
      "Правила формата:",
      '- МОДЕЛЬ: всегда и только "' + m.name + '".',
      "- КАЧЕСТВО: всегда " + quality + " (выбрано пользователем в настройках, не изменяй).",
      "- Внутри фигурных скобок промпта — подробное описание НА АНГЛИЙСКОМ языке с учётом переносимых деталей референса (композиция, поза, стиль, черты лица, свет).",
      "- Команду пиши ВСЕГДА с новой строки, отдельной строкой, без markdown-оформления, кавычек и кодовых блоков вокруг неё.",
      "- НИКОГДА не заканчивай сообщение командой: после неё обязательно должен идти содержательный текст.",
      "=== КОНЕЦ ИНСТРУМЕНТА ===",
    ].join("\n");
  }

  buildArtifactInstructions() {
    return [
      "=== АРТЕФАКТЫ ===",
      "Артефакт — это цельный самодостаточный HTML-документ (HTML + <style> + <script> в одном файле), который пользователь запускает в изолированной песочнице, редактирует и сохраняет.",
      "",
      "Создавай артефакт, когда задача имеет визуальную или интерактивную природу: приложение, интерфейс, визуализация, игра, калькулятор, генератор, форма, анимация, дашборд, прототип. Для чисто текстовых ответов, пояснений и сниппетов кода артефакт не нужен.",
      "",
      "Технический стандарт:",
      "• Единый HTML-файл без внешних зависимостей (кроме шрифтов Google Fonts).",
      "• Полный, рабочий код без сокращений, плейсхолдеров и «добавьте сюда…». Никаких TODO.",
      "• Адаптивный дизайн: корректно работает от 320px до десктопа. Тёмная тема по умолчанию.",
      "• Современные API: ES2022+, CSS Grid/Flexbox, Custom Properties, requestAnimationFrame.",
      "• Продуманная UX-архитектура: состояния загрузки, пустые состояния, ошибки, доступность с клавиатуры.",
      "• Надёжное хранение: IndexedDB для пользовательских данных, никогда не используй localStorage/sessionStorage.",
      "",
      "Визуальный стандарт (премиальная эстетика):",
      "• Палитра: тёмно-серая база (#1a1a1a, #222, #2a2a2a) + серебристые акценты (hsla(0,0%,87%,1) для светлого серебра).",
      "• Используй hsla() вместо rgba() для полного контроля прозрачности и оттенков. Пример: hsla(203,76%,72%,1) для акцента.",
      "• Никаких радужных градиентов, ярких неоновых фонов, кислотных цветов. Только приглушённые, холодные тона.",
      "• Эффекты: Glassmorphism (backdrop-filter: blur(16px) + полупрозрачный фон), зернистость (SVG noise overlay), лёгкий глитч на текстах.",
      "• Размытие и глубина: используй box-shadow для теней, blur для глубины резкости, градиенты для объёма.",
      "• Типографика: чёткие sans-serif (Inter, Manrope, Space Grotesk), крупные заголовки, щедрые отступы.",
      "• Анимации: cubic-bezier(0.16, 1, 0.3, 1) для плавности, микро-трансформации на hover, stagger-анимации списков.",
      "• Запрещено: слабые пастельные фоны, мультяшные цвета, Comic Sans и подобные шрифты, перегруженный UI.",
      "",
      "Структура ответа:",
      "1. Краткое описание решения (1–2 предложения).",
      "2. Блок артефакта на отдельной строке:",
      '   <artifact id="snake_case_id" title="Человекочитаемое название">',
      "   <!DOCTYPE html><html>…</html>",
      "   </artifact>",
      "3. Короткое послесловие: как пользоваться, на что обратить внимание, что можно улучшить.",
      "",
      "При редактировании существующего артефакта (во вложении «АРТЕФАКТ ДЛЯ РЕДАКТИРОВАНИЯ»): сохраняй исходный id — это связывает версии. Выводи полную обновлённую версию, а не дифф и не описание изменений.",
      "=== КОНЕЦ ===",
    ].join("\n");
  }

  buildTodoListInstructions(canSearch = false) {
    const av = this.getToolAvailability();
    const searchRule = canSearch
      ? "   • Поиск в интернете: {web-search: [\"запрос\"]}.\n"
      : "";
    const execRule = av.canExec
      ? "   • Выполнение скриптов (Python с BeautifulSoup/bs4, Node.js, Bash): {execute: {\"lang\": \"python\", \"code\": \"...\"}}.\n"
      : "";
    const artRule = av.canArtifacts
      ? "   • Создание интерактивных приложений: <artifact id=\"...\" title=\"...\">...</artifact>.\n"
      : "";
    const thinkRule = av.canThink
      ? "   • Параллельный многопоточный анализ: {thinking_: [\"ветка 1\", \"ветка 2\"]}."
      : "";

    return [
      "=== ИНСТРУМЕНТ: ПЛАНИРОВАНИЕ И ПОШАГОВОЕ ВЫПОЛНЕНИЕ ЗАДАЧ (to-dos) ===",
      "Используй планирование ТОЛЬКО для комплексных составных исследовательских или инженерных задач, требующих нескольких этапов (парсинг сайтов, ресерч, веб-поиск, многомодульное программирование).",
      "ВАЖНО: Для простых вопросов, бесед, переводов и стандартных сниппетов кода план НЕ ТРЕБУЕТСЯ — отвечай сразу обычным текстом.",
      "",
      "Формат создания плана (определяй оптимальное количество шагов автономно под масштаб задачи, до 100 шагов):",
      '{todo_plan: ["Название шага 1", "Название шага 2", "Название шага 3"]}',
      "",
      "Когда ты приступаешь к выполнению шага или завершаешь его, укажи статус:",
      '{todo_update: {"step": 1, "status": "active" | "done" | "error", "result": "Краткий вывод или ключевой итог шага"}}',
      "",
      "Если в процессе решения открылись новые требования, ты можешь динамически дополнить план:",
      '{todo_add: ["Новый подшаг A", "Новый подшаг B"]}',
      "",
      "ПРАВИЛА И СИНХРОНИЗАЦИЯ ИНСТРУМЕНТОВ ВНУТРИ TO-DOS:",
      "1. СТРОГИЙ ЗАПРЕТ: Никогда не помечай задачи статусом 'done' заранее в первом же сообщении! Каждый шаг помечается выполненным ТОЛЬКО ПОСЛЕ того, как ты реально выполнил его действие.",
      "2. Создав план через {todo_plan: [...]}, сразу начинай шаг 1 и вызови соответствующий инструмент:",
      (searchRule +
        "   • Прямое скачивание и чтение веб-страниц/ссылок: {fetch_url: [\"https://...\"]}.\n" +
        execRule + artRule + thinkRule).replace(/\n$/, ''),
      "3. Система вернёт тебе результат выполнения инструмента. После этого ты анализируешь данные, помечаешь шаг через {todo_update: {\"step\": N, \"status\": \"done\", \"result\": \"...\"}} и переходишь к следующему шагу.",
      "4. Выполняй шаги по очереди один за другим в многошаговом цикле, пока вся цель не будет достигнута.",
      "5. Если шаг невыполним — отметь его {todo_update: {\"step\": N, \"status\": \"error\", \"result\": \"причина\"}} и переходи к следующему.",
      "=== КОНЕЦ ИНСТРУКЦИИ ==="
    ].join("\n");
  }

  buildDeepThinkInstructions() {
    return [
      "=== ИНСТРУМЕНТ: ПАРАЛЛЕЛЬНОЕ МЫШЛЕНИЕ (deep thinking) ===",
      "У тебя есть инструмент параллельного мышления — автономная декомпозиция сложной задачи на N независимых веток анализа, выполняемых одновременно.",
      "",
      "АВТОНОМНОСТЬ И АДАПТИВНОСТЬ:",
      "Ты самостоятельно оцениваешь сложность задачи и определяешь, требуется ли параллельное мышление и сколько именно подзадач необходимо (2, 5, 10 или более подзадач, до 100 потоков максимум), либо задача решается стандартным прямым ответом без декомпозиции.",
      "",
      "КОГДА ИСПОЛЬЗОВАТЬ:",
      "• Задача имеет несколько независимых аспектов (сравнение технологий/архитектур, многофакторный аудит, проверка краевых случаев, разбор ситуации со всех сторон).",
      "• Пользователь явно просит подробный всесторонний разбор, сравнение или анализ.",
      "• Подзадачи в массиве независимы и могут исследоваться параллельно.",
      "",
      "КОГДА НЕ ИСПОЛЬЗОВАТЬ:",
      "• Простые линейные вопросы, факты, диалог или когда задача не требует ветвления.",
      "",
      "Формат команды (на отдельной строке):",
      '{thinking_["Конкретная задача 1", "Конкретная задача 2", ...]}',
      "",
      "Технические правила:",
      "- Формулируй оптимальное количество подзадач под масштаб задачи (внутренний лимит системы — до 100 подзадач).",
      "- Каждая задача — конкретная, проверяемая формулировка.",
      "- Команда прерывает текущий поток. Система выполнит ветвление и вернет результаты для синтеза.",
      "=== КОНЕЦ ИНСТРУМЕНТА ===",
    ].join("\n");
  }

  buildCodeExecutionInstructions() {
    return [
      "=== ИНСТРУМЕНТ: ВЫПОЛНЕНИЕ КОДА И SHELL (code execution) ===",
      "Тебе доступна среда запуска кода: облачная изолированная Linux-песочница OpenRouter Sandbox (openrouter:shell) и локальная песочница системы. Ты можешь выполнять Python 3, Node.js и Bash/Shell-команды синхронно во время ответа: проверять код, вычислять, парсить данные, анализировать файлы и работать с утилитами.",
      "",
      "КОГДА ИСПОЛЬЗОВАТЬ:",
      "• Пользователь просит написать и СРАЗУ протестировать код — запусти и покажи реальный вывод",
      "• Нужны точные вычисления (математика, статистика, большие числа, хеши, криптография, даты)",
      "• Нужно извлечь и спарсить данные с веб-страниц через requests + BeautifulSoup (bs4)",
      "• Нужно обработать данные (CSV, JSON, текст) или сгенерировать выборку",
      "• Нужно проверить работоспособность нетривиального кода перед тем, как показать его пользователю",
      "• Пользователь явно просит выполнить системную команду (ls, dir, cat, grep, curl, git, pip, npm)",
      "• Нужно проанализировать файлы проекта, прочитать конфиги, посмотреть структуру директорий",
      "• Нужно построить график и вывести его как base64 PNG (matplotlib + base64)",
      "",
      "КОГДА НЕ ИСПОЛЬЗОВАТЬ:",
      "• Простые объяснения, советы, перевод, креатив — не требуют выполнения",
      "• Ты просто показываешь код как пример — не выполняй без запроса пользователя",
      "• Факты, которые ты точно знаешь из обучения",
      "• Гипотетические вопросы («что будет, если...»)",
      "",
      "Формат команды (JSON, строго на отдельной строке, без markdown-оформления):",
      '{execute: {"lang": "python", "code": "print(2 + 2)", "timeout": 30}}',
      "",
      "Поддерживаемые языки:",
      '• "python" — Python 3 (beautifulsoup4/bs4, requests, numpy, pandas, matplotlib, json, csv, math, random, datetime, hashlib, re, os, sys, io, base64, subprocess и др.)',
      '• "node" — Node.js (fs, path, https, http, crypto, url, querystring, util, child_process, stream и др.)',
      '• "bash" — Linux Shell / Bash среда контейнера (ls, cat, grep, find, curl, python3, node, tar и т.д.)',
      "",
      "Поля команды:",
      '• "lang" (обязательно): "python" | "node" | "bash"',
      '• "code" (обязательно): строка с кодом. Переносы строк — как \\n, кавычки — как \\"',
      '• "timeout" (опционально): секунды до принудительного завершения. По умолчанию 30, максимум 120.',
      '• "stdin" (опционально): текст для стандартного ввода. Переносы строк — как \\n.',
      '• "cwd" (опционально): рабочая директория в песочнице.',
      "",
      "Как это работает:",
      "1. Ты пишешь команду на отдельной строке.",
      "2. Генерация ответа ПРИОСТАНОВИТСЯ, код выполнится в контейнере песочницы.",
      "3. Тебе вернутся: stdout, stderr, код возврата (0 = успех) и затраченное время.",
      "4. Проанализируй результат и продолжи ответ с того места, где остановился.",
      "5. Если код упал с ошибкой — исправь её и выполни ещё раз (НЕ БОЛЕЕ 2 попыток подряд на одну задачу).",
      "",
      "ФАЙЛЫ И АНАЛИЗ ДАННЫХ:",
      "• В рабочей директории автоматически сохраняются прикреплённые пользователем файлы под исходными именами.",
      "• Файловая система песочницы сохраняется между вызовами в рамках текущей сессии.",
      "=== КОНЕЦ ИНСТРУМЕНТА ===",
    ].join("\n");
  }

  buildWebSearchInstructions(model) {
    const limit = this.getWsLimit();
    return [
      "=== АГЕНТСКИЙ ИССЛЕДОВАТЕЛЬСКИЙ ЦИКЛ: ВЕБ-ПОИСК (web-search) И ЧТЕНИЕ СТРАНИЦ (fetch_url) ===",
      "Ты действуешь как автономный исследовательский агент (ReAct Web Agent).",
      "У тебя есть два дополняющих друг друга инструмента для работы с сетью:",
      "1. {web-search: [...]} — поисковая разведка (возвращает список релевантных страниц с краткими сниппетами и полными URL).",
      "2. {fetch_url: [...]} — глубокое чтение страниц (скачивает полный очищенный текст, таблицы и связанные ссылки).",
      "",
      "ТВОЙ АЛГОРИТМ ИССЛЕДОВАНИЯ:",
      "• ШАГ 1 (РАЗВЕДКА): Если нужны свежие данные, события, документация или факты, вызови {web-search: [\"запрос\"]}.",
      "  - Формулируй от 1 до 3 точных запросов (для 80% задач идеален РОВНО 1 конкретный запрос).",
      "• ШАГ 2 (АНАЛИЗ И УГЛУБЛЕНИЕ): Оцени полученные сниппеты источников.",
      "  - Если сниппеты исчерпывающе отвечают на вопрос — сразу давай финальный ответ.",
      "  - Если же требуется подробный разбор, точный программный код, таблицы параметров, детальная статья или официальная документация — НЕ пытайся додумывать факты! На следующем шаге вызови:",
      '    {fetch_url: ["ПОЛНЫЙ_URL_1", "ПОЛНЫЙ_URL_2"]}',
      "• ШАГ 3 (КРАУЛИНГ / ПЕРЕХОД ПО ССЫЛКАМ): В содержимом прочитанной страницы система возвращает обнаруженные связанные ссылки [СВЯЗАННЫЕ ССЫЛКИ НА СТРАНИЦЕ]. Ты можешь перейти по ним через повторный {fetch_url: [...]}.",
      "• ШАГ 4 (СИНТЕЗ): Дай структурированный и доказательный ответ со ссылками на первоисточники.",
      "",
      "КАК ДЕЛАЮТСЯ ЗАПРОСЫ:",
      "Перед тем как отправить запрос в интернет ты говоришь что собираешься сделать. Например: Поищу свежую информацию о последних иннвовациях в свере ИИ... {web-search: [\"запрос\"]} По данным [ТУТ НАЗВАНИЕ САЙТА, ССЫЛКА И ПРОЧЕЕ] последние новости в сфере ИИ... [ИНФОРМАЦИЯ, ПОЛУЧЕННАЯ В ИНТЕРНЕТЕ, В КОТОРОЙ ТЫ УВЕРЕН], описываешь следующее действие и при необходимости запускаешь следующий поиск",
      "",
      "ПРАВИЛО ОСТАНОВКИ:",
      "• Сразу после закрывающей фигурной скобки `}` команды ({web-search:...}) остановись и дождись результатов.",
      "• После получения результатов поиска незамедлительно начни формулировать итоговый ответ текстом.",
      `- Максимум поисковых раундов: ${limit}.`,
      "=== КОНЕЦ ИНСТРУМЕНТА ===",
    ].join("\n");
  }

  buildUrlReadingInstructions(canSearch = false) {
    if (!canSearch) {
      // Режим 1: Веб-поиск выключен. Полное отсутствие упоминаний web-search
      return [
        "=== ИНСТРУМЕНТ: АГЕНТНОЕ ЧТЕНИЕ И АНАЛИЗ ССЫЛОК (fetch_url & openrouter:web_fetch) ===",
        "Ты умеешь загружать, читать и анализировать полное текстовое содержимое, статьи, таблицы и документацию любых веб-страниц и PDF-файлов по их URL.",
        "",
        "КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО писать «у меня нет доступа к интернету», «я не могу открывать ссылки» или «я языковая модель». Тебе подключен серверный инструмент прямого чтения страниц openrouter:web_fetch, а также поддерживается команда {fetch_url: [...]} на отдельной строке — используй их для чтения страниц и документов!",
        "",
        "КОГДА ИСПОЛЬЗОВАТЬ {fetch_url: [...]}:",
        "1. Пользователь просит проанализировать, открыть, прочитать или изучить ссылки/сайты из текста сообщения или истории диалога.",
        "2. Пользователь прикрепил ссылки к сообщению или указывает конкретные веб-адреса.",
        "3. В контексте диалога или прикрепленных материалах присутствуют URL, требующие подробного изучения полного текста.",
        "4. На уже прочитанной веб-странице обнаружены важные связанные ссылки [СВЯЗАННЫЕ ССЫЛКИ НА СТРАНИЦЕ], по которым необходимо перейти для ответа.",
        "5. Если пользователь просит «можешь найти пользователя» НО НЕ ПРИСЛАЛ ССЫЛКИ, ты можешь попробовать найти его профиль САМ на известных платформах (GitHub, LinkedIn, Twitter, Telegram, Discord и так далее) и открыть его страницу для анализа.",
        "",
        "ФОРМАТ КОМАНДЫ (СТРОГО на отдельной строке, без markdown-блоков и кавычек вокруг):",
        '{fetch_url: ["https://example.com/article", "https://example.com/docs"]}',
        "",
        "ПРАВИЛА:",
        "• В массиве передавай от 1 до 4 полных прямых URL (http/https) со всеми параметрами.",
        "• Сразу после закрывающей фигурной скобки `}` ты ОБЯЗАНА ОСТАНОВИТЬ ГЕНЕРАЦИЮ: система скачает чистый текст страниц и вернет его тебе для углубленного анализа.",
        "• После получения содержимого изучи факты и предоставь структурированный, доказательный ответ со ссылками на первоисточники.",
        "=== КОНЕЦ ИНСТРУКЦИИ ==="
      ].join("\n");
    }

    // Режим 2: Веб-поиск включен. Инструкция адаптирована под синергию поиска и чтения
    return [
      "=== ИНСТРУМЕНТ: АГЕНТНОЕ ЧТЕНИЕ И АНАЛИЗ ССЫЛОК (fetch_url & openrouter:web_fetch) ===",
      "Ты умеешь загружать и анализировать полное текстовое содержимое любых веб-страниц и PDF-документов по их URL.",
      "",
      "СИНЕРГИЯ ИНСТРУМЕНТОВ: ЧТЕНИЕ ССЫЛОК (fetch_url / openrouter:web_fetch) vs ПОИСК В ИНТЕРНЕТЕ (web-search):",
      "• {web-search: [...]} — это поисковая разведка в поисковике по ключевым словам для обнаружения релевантных страниц.",
      "• openrouter:web_fetch и {fetch_url: [...]} — это прямое скачивание и чтение полного текста конкретной веб-страницы или PDF по известному URL.",
      "• ЕСЛИ ПОЛЬЗОВАТЕЛЬ ПРОСИТ: «проанализируй эти ссылки», «изучи источники», «открой сайты выше», «что там написано», ДАЖЕ ЕСЛИ ПОЛЬЗОВАТЕЛЬ ГОВОРИТ «без поиска в интернете» — ты НЕ ДОЛЖНА ОТКАЗЫВАТЬСЯ!",
      "• Фраза «без поиска в интернете» означает «не делай новый поисковый запрос в поисковике», но требует открыть и прочитать конкретные уже найденные страницы.",
      "• В этом случае ты ОБЯЗАНА взять URL нужных источников из блока [ИСТОЧНИКИ] истории диалога и вызвать серверный инструмент openrouter:web_fetch либо на отдельной строке:",
      '  {fetch_url: ["ПОЛНЫЙ_URL_1", "ПОЛНЫЙ_URL_2"]}',
      "• КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО писать «у меня нет доступа к интернету», «я не могу открывать ссылки» или «я языковая модель». У тебя ЕСТЬ инструменты чтения веб-страниц — используй их!",
      "",
      "КОГДА ИСПОЛЬЗОВАТЬ {fetch_url: [...]}:",
      "1. Пользователь просит проанализировать ссылки или источники из предыдущих сообщений диалога.",
      "2. Пользователь прикрепил ссылки к сообщению — изучи их.",
      "3. Ты выполнила {web-search: [...]} и в результатах видишь релевантные URL, требующие глубокого изучения полного текста.",
      "4. На уже прочитанной странице обнаружены важные связанные ссылки для перехода.",
      "",
      "ФОРМАТ КОМАНДЫ (СТРОГО на отдельной строке):",
      '{fetch_url: ["https://example.com/article", "https://example.com/docs"]}',
      "",
      "ПРАВИЛА:",
      "• В массиве передавай от 1 до 4 полных прямых URL со всеми параметрами.",
      "• Сразу после закрывающей фигурной скобки `}` ты ОБЯЗАНА ОСТАНОВИТЬ ГЕНЕРАЦИЮ: система скачает текст страниц и вернет его тебе для глубокого анализа.",
      "=== КОНЕЦ ИНСТРУКЦИИ ==="
    ].join("\n");
  }

  isModelUsingNativeSearch(model, settings) {
    if (!model) return false;
    const s = settings || this.getAppSettings();
    if (!s.webSearch) return false;
    /* Серверный режим OpenRouter: поиск выполняет модель через openrouter:web_search */
    if (this.isOrServerSearchActive(s, model)) return true;

    if (model.api === 'anthropic') {
      const engine = s.webSearchCfg?.anthropic?.engine || 'native';
      return engine === 'native';
    }
    if (model.api === 'gemini') {
      const engine = s.webSearchCfg?.gemini?.engine || 'native';
      return engine === 'native';
    }
    if (model.api === 'openai' || (model.id && model.id.startsWith('openai/'))) {
      const engine = s.webSearchCfg?.openai?.engine || 'native';
      return engine === 'native';
    }
    return false;
  }

  buildNativeWebSearchGuidelines(model) {
    return [
      "=== ВСТРОЕННЫЙ ПОИСК В СЕТИ (NATIVE SEARCH) ===",
      "Тебе подключен встроенный поисковый инструмент от провайдера.",
      "Используй свой встроенный инструмент поиска, когда требуются актуальные данные, новости и факты.",
      "ВАЖНО: Для поиска НЕ выводи команду {web-search: [...]}, так как поисковик уже встроен в твою среду.",
      "Если же тебе потребуется глубоко прочитать содержимое конкретной веб-страницы целиком или перейти по связанным ссылкам — используй инструмент {fetch_url: [\"URL\"]}.",
      "=== КОНЕЦ ИНСТРУКЦИИ ==="
    ].join("\n");
  }

  /* Сводка доступных инструментов текущей сессии (единая точка правды для промпта и цикла) */
  getToolAvailability(model) {
    const s = this.getAppSettings();
    const targetModel = model || (typeof window.getModel === 'function' ? window.getModel(s.modelId) : { api: "openrouter" });
    const route = typeof window.resolveApiRoute === 'function'
      ? window.resolveApiRoute(s, targetModel)
      : { useProxy: !!s.proxyKey, useORDirect: !s.proxyKey && !!s.orKey };
    const hasRoute = !!(route.useProxy || route.useORDirect);
    const hasElectron = typeof window !== "undefined" && !!window.electronAPI && typeof window.electronAPI.execStart === "function";
    const hasOpenRouterShell = Boolean(hasRoute && (s.orKey || s.proxyKey));
    const canExec = s.codeExec !== false && (hasElectron || hasOpenRouterShell);
    return {
      model: targetModel,
      route,
      canGenerate: !!(s.imageGen && hasRoute),
      canSearch: !!(s.webSearch && hasRoute),
      usesNativeSearch: this.isModelUsingNativeSearch(targetModel, s),
      canThink: !!(s.deepThink && s.deepThink.enabled && hasRoute),
      canArtifacts: !!s.artifacts,
      canExec,
      hasElectronExec: hasElectron,
      hasOpenRouterShell,
      hasOpenRouterWebFetch: Boolean(hasRoute && (s.orKey || s.proxyKey)),
      canFetch: true,
      canSubagent: Boolean(route.useORDirect && window.SubagentStore && window.SubagentStore.hasEnabled())
    };
  }

  buildToolOrchestrationInstructions(av) {
    const tools = [];
    tools.push('openrouter:web_fetch / {fetch_url: [...]} — прямое чтение страниц и PDF по URL');
    if (av.canSearch) tools.push(av.usesNativeSearch ? 'встроенный веб-поиск провайдера' : '{web-search: [...]} — поиск источников');
    if (av.canExec) tools.push('{execute: {...}} — запуск кода');
    if (av.canThink) tools.push('{thinking_[...]} — параллельный анализ');
    if (av.canArtifacts) tools.push('<artifact> — интерактивные приложения');
    if (av.canGenerate) tools.push('{image_generation[...]} — генерация изображений');
    if (av.canSubagent) tools.push('openrouter:subagent — делегирование части задачи работникам: ' + window.SubagentStore.describe());
    tools.push('{todo_plan/todo_update/todo_add} — план для многошаговых задач');

    return [
      "=== ОРКЕСТРАЦИЯ ИНСТРУМЕНТОВ И ПРИКРЕПЛЁННЫХ ФАЙЛОВ ===",
      "ВНИМАНИЕ: Все файлы, прикреплённые пользователем (Excel .xlsx, Word .docx, PDF, презентации, код, текст, CSV), автоматически парсятся нашей платформой в структурированный текст и читаемые Markdown-таблицы внутри блоков [ТЕКСТОВОЕ СОДЕРЖИМОЕ ВЛОЖЕНИЯ / ИЗВЛЕЧЁННЫЙ ТЕКСТ И ТАБЛИЦЫ].",
      "СТРОГИЙ ЗАПРЕТ: Никогда не говори «файл передан как бинарные данные» или «я не могу прочитать этот формат». Текст, строки, столбцы и числовые значения файлов находятся прямо перед тобой в контексте сообщения.",
      "",
      "Доступно в этой сессии: " + tools.join('; ') + ".",
      "Инструменты, не перечисленные выше, недоступны — не вызывай их и не упоминай.",
      "",
      "ПРИНЦИПЫ:",
      "1. Одна команда за ход. Выведи команду на отдельной строке и остановись (кроме {image_generation} и {todo_*}, после которых текст продолжается). Система выполнит её и вернёт результат — затем продолжай.",
      "2. Естественная цепочка исследования: " + (av.canSearch ? "поиск → чтение 1–2 лучших URL → " : "чтение URL → ") + (av.canExec ? "обработка данных кодом → " : "") + "синтез ответа со ссылками на источники.",
      "3. Не повторяй одинаковые вызовы: тот же запрос поиска, тот же URL, тот же код без изменений. Каждый следующий вызов должен приносить новую информацию.",
      "4. Экономия: минимально достаточное число вызовов. Если данных уже хватает — отвечай.",
      "5. ПАМЯТЬ О ВЫЗОВАХ: в прошлых ответах системой вставляется блок [ЖУРНАЛ ВЫЗОВОВ ИНСТРУМЕНТОВ]. Это реальная запись того, что ты вызывала ранее (субагенты, веб-поиск, чтение страниц, код, параллельное мышление, артефакты). Если в журнале есть вызов, он СОСТОЯЛСЯ, и ты можешь на его результат опираться и ссылаться на него. Если записи о вызове нет, он не выполнялся, и ты не должна утверждать, что получила его результат. Никогда не пиши блок [ЖУРНАЛ...] сама.",
      "",
      "FALLBACK-ПРАВИЛА (если инструмент не сработал):",
      "• Страница не открылась → " + (av.canSearch ? "найди альтернативный источник поиском или попробуй другой URL (документация, зеркало). " : "попробуй другой URL (официальная документация, зеркало). ") + "Не выдумывай содержимое непрочитанной страницы.",
      "• Поиск не дал результатов → переформулируй запрос конкретнее (английский, ключевые термины, год), максимум одна повторная попытка.",
      (av.canExec ? "• Код упал → исправь по STDERR, максимум 3 попытки; затем покажи код без запуска и объясни проблему." : "• Код выполнять нельзя — показывай его в markdown-блоке и объясняй ожидаемый результат."),
      (av.canThink ? "• Ветки параллельного мышления упали → выполни анализ последовательно сам, не перезапускай." : ""),
      "• Если после всех попыток данных нет — честно сообщи пользователю, что именно не удалось, и ответь на основе своих знаний, явно пометив непроверенные утверждения.",
      "• Никогда не пиши «у меня нет доступа к интернету/инструментам», если они перечислены выше.",
      "=== КОНЕЦ ОРКЕСТРАЦИИ ==="
    ].filter(Boolean).join("\n");
  }

  buildTemporalContextInstructions() {
    const now = new Date();
    let tz = "UTC";
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch (_) { }

    let formattedDate = now.toISOString();
    try {
      formattedDate = new Intl.DateTimeFormat("ru-RU", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZoneName: "short",
        timeZone: tz
      }).format(now);
    } catch (_) { }

    const isoUtc = now.toISOString();

    return [
      "=== ТОЧНОЕ РЕАЛЬНОЕ ВРЕМЯ И КАЛЕНДАРНАЯ ДАТА (REAL-TIME TEMPORAL CONTEXT) ===",
      `Текущее локальное время и дата пользователя: ${formattedDate}.`,
      `Временная зона пользователя (IANA): ${tz}.`,
      `Точный ISO 8601 UTC таймстамп: ${isoUtc}.`,
      "",
      "ПРАВИЛА ВРЕМЕННОЙ ПРИВЯЗКИ:",
      "1. Ты ВСЕГДА достоверно знаешь текущую дату, день недели, год и точное время в реальном времени.",
      "2. Любые запросы о «сегодня», «сейчас», «какой день недели», «сколько дней до конца месяца/квартала/года», «актуальные события», расписаниях и дедлайнах рассчитывай СТРОГО от указанной выше отметки времени.",
      "3. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО писать «мои знания ограничены прошлым годом», «я языковая модель и у меня нет часов» или «я не знаю текущего времени». Ты синхронизирован с реальным временем пользователя.",
      "=== КОНЕЦ ВРЕМЕННОЙ ПРИВЯЗКИ ==="
    ].join("\n");
  }

  getSystemPromptText(model) {
    const s = this.getAppSettings();
    let text = (s.systemPrompt || "").trim();
    const av = this.getToolAvailability(model);
    const append = (block) => { if (block) text = (text ? text + "\n\n" : "") + block; };

    append(this.buildTemporalContextInstructions());
    append(this.buildToolOrchestrationInstructions(av));
    append(this.buildTodoListInstructions(av.canSearch && !av.usesNativeSearch));
    append(this.buildUrlReadingInstructions(av.canSearch && !av.usesNativeSearch));
    if (av.canGenerate) append(this.buildImageGenInstructions());

    if (av.canSearch) {
      append(av.usesNativeSearch
        ? this.buildNativeWebSearchGuidelines(av.model)
        : this.buildWebSearchInstructions(av.model));
    }

    if (av.canArtifacts) append(this.buildArtifactInstructions());
    if (av.canThink) append(this.buildDeepThinkInstructions());
    if (av.canExec) append(this.buildCodeExecutionInstructions());

    return text;
  }

  /* ── Детекторы и парсеры команд ── */

  detectTodoCommand(text) {
    if (window.toDos && typeof window.toDos.detectTodoCommand === 'function') {
      return window.toDos.detectTodoCommand(text);
    }
    return null;
  }

  stripTodoCommands(text) {
    if (window.toDos && typeof window.toDos.stripTodoCommands === 'function') {
      return window.toDos.stripTodoCommands(text);
    }
    return String(text || '').replace(/\{(?:todo[-_]plan|todoPlan|todo[-_]update|todoUpdate|todo[-_]add|todoAdd)\s*:[^}]*\}/gi, '');
  }

  spawnTodoSession(chat, aiMsg, rawCmd, tasks, location) {
    if (window.toDos && typeof window.toDos.spawnTodoSession === 'function') {
      return window.toDos.spawnTodoSession(chat, aiMsg, rawCmd, tasks, location);
    }
    return null;
  }

  updateTodoSession(chat, aiMsg, rawCmd, step, status, result, location) {
    if (window.toDos && typeof window.toDos.updateTodoSession === 'function') {
      return window.toDos.updateTodoSession(chat, aiMsg, rawCmd, step, status, result, location);
    }
    return null;
  }

  addTodoTasks(chat, aiMsg, rawCmd, newTasks, location) {
    if (window.toDos && typeof window.toDos.addTodoTasks === 'function') {
      return window.toDos.addTodoTasks(chat, aiMsg, rawCmd, newTasks, location);
    }
    return null;
  }

  formatTodoProgress(session) {
    if (window.toDos && typeof window.toDos.formatTodoProgress === 'function') {
      return window.toDos.formatTodoProgress(session);
    }
    return '';
  }

  renderTodoCard(session, idx) {
    if (window.toDos && typeof window.toDos.renderTodoCard === 'function') {
      return window.toDos.renderTodoCard(session, idx);
    }
    return '';
  }

  detectImageGenCommand(text) {
    const m = String(text || '').match(IMG_CMD_STREAM_PATTERN);
    if (!m) return null;
    const model = (m[1] || '').trim();
    const rawParams = (m[2] || '').trim();
    const prompt = (m[3] || '').trim();

    let quality = '';
    let refs = '';

    if (rawParams) {
      const refsMatch = rawParams.match(/\brefs?[:=]\s*([a-zA-Z0-9_, -]+)/i);
      if (refsMatch) {
        refs = refsMatch[1].trim();
      }
      const cleaned = rawParams.replace(/\brefs?[:=]\s*([a-zA-Z0-9_, -]+)/i, '').replace(/[:|,]/g, ' ').trim();
      quality = cleaned.split(/\s+/)[0] || '';
    }

    return { raw: m[0], model, quality, refs, prompt };
  }

  stripImgCommands(text) {
    return String(text || '').replace(IMG_CMD_RE, '').trim();
  }

  getAllDialogueImages(chat, upToAiMsgId) {
    if (!chat || !Array.isArray(chat.messages)) return [];
    const list = [];
    let seq = 1;

    for (const m of chat.messages) {
      if (upToAiMsgId && m.id === upToAiMsgId) break;

      if (m.role === 'user' || m.role === 'developer') {
        (m.attachments || []).forEach(a => {
          if (a.kind === 'image' && a.dataUrl) {
            list.push({
              id: `img_${seq}`,
              seq,
              dataUrl: a.dataUrl,
              name: a.name || `Изображение пользователя #${seq}`,
              role: 'user',
              msgId: m.id
            });
            seq++;
          } else if (a.kind === 'document' && Array.isArray(a.images)) {
            a.images.forEach(im => {
              if (im.dataUrl) {
                list.push({
                  id: `img_${seq}`,
                  seq,
                  dataUrl: im.dataUrl,
                  name: `${a.name || 'Документ'} (${im.name || 'стр. ' + im.page})`,
                  role: 'user',
                  msgId: m.id
                });
                seq++;
              }
            });
          } else if (a.kind === 'video' && Array.isArray(a.keyframes)) {
            a.keyframes.forEach(kf => {
              if (kf.dataUrl) {
                list.push({
                  id: `img_${seq}`,
                  seq,
                  dataUrl: kf.dataUrl,
                  name: `${a.name || 'Видео'} (${kf.name || 'кадр'})`,
                  role: 'user',
                  msgId: m.id
                });
                seq++;
              }
            });
          }
        });
      } else if (m.role === 'assistant') {
        (m.imageRequests || []).forEach(r => {
          if (r.status === 'done' && r.dataUrl) {
            list.push({
              id: `img_${seq}`,
              seq,
              dataUrl: r.dataUrl,
              name: r.prompt || r.aiPrompt || `Сгенерированное изображение #${seq}`,
              role: 'assistant',
              msgId: m.id
            });
            seq++;
          }
        });
        (m.generatedImages || []).forEach(g => {
          if (g.status === 'done' && g.dataUrl) {
            list.push({
              id: `img_${seq}`,
              seq,
              dataUrl: g.dataUrl,
              name: g.prompt || `Сгенерированное изображение #${seq}`,
              role: 'assistant',
              msgId: m.id
            });
            seq++;
          }
        });
      }
    }
    return list;
  }

  resolveDialogueReferences(chat, aiMsg, refsParam) {
    const allImages = this.getAllDialogueImages(chat, aiMsg ? aiMsg.id : null);
    if (!allImages.length) return [];

    const raw = String(refsParam || '').trim().toLowerCase();

    if (raw === 'none' || raw === 'false' || raw === '0') {
      return [];
    }

    if (raw === 'all') {
      return allImages.slice(-16);
    }

    if (raw === 'last' || raw === 'prev' || raw === 'previous') {
      return [allImages[allImages.length - 1]];
    }

    if (raw) {
      const tokens = raw.split(/[\s,;|]+/).map(t => t.trim().toLowerCase()).filter(Boolean);
      const selected = [];
      const seen = new Set();

      tokens.forEach(tok => {
        const numMatch = tok.match(/(?:img_)?(\d+)/i);
        if (numMatch) {
          const num = parseInt(numMatch[1], 10);
          const found = allImages.find(im => im.seq === num || im.id === `img_${num}`);
          if (found && !seen.has(found.id)) {
            seen.add(found.id);
            selected.push(found);
          }
        } else {
          const found = allImages.find(im => im.id.toLowerCase() === tok);
          if (found && !seen.has(found.id)) {
            seen.add(found.id);
            selected.push(found);
          }
        }
      });

      if (selected.length > 0) {
        return selected.slice(0, 16);
      }
    }

    const lastUserText = this.lastUserPromptBefore(chat, aiMsg).toLowerCase();
    const userImages = this.lastUserImagesBefore(chat, aiMsg);

    if (userImages.length > 0) {
      return userImages;
    }

    const wantsRef = /(?:референс|стил|персонаж|предыдущ|прошл|образ|как на картинке|похож|ту же|тот же|этого же|в стиле|reference|character|same style)/i.test(lastUserText);
    if (wantsRef && allImages.length > 0) {
      return allImages.slice(-2);
    }

    return [];
  }

  detectUrlFetchCommand(text) {
    const m = String(text || "").match(URL_FETCH_CMD_RE);
    if (!m) return null;
    const inner = (m[1] || m[2] || m[3] || '').trim();
    let urls = [];
    try {
      if (m[1] !== undefined) {
        const arr = JSON.parse("[" + inner + "]");
        urls = arr.filter((x) => typeof x === "string" && /^https?:\/\//i.test(x.trim()));
      } else if (inner && /^https?:\/\//i.test(inner)) {
        urls = [inner];
      }
    } catch (e) {
      const qre = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g;
      let qm;
      while ((qm = qre.exec(inner)) !== null) {
        const u = (qm[1] !== undefined ? qm[1] : qm[2] || '').replace(/\\(["'\\])/g, '$1').trim();
        if (/^https?:\/\//i.test(u)) urls.push(u);
      }
    }
    if (!urls.length && inner) {
      const directMatches = inner.match(/https?:\/\/[^\s"',\]\)]+/gi) || [];
      urls = directMatches.map(u => u.trim()).filter(u => /^https?:\/\//i.test(u));
    }
    urls = [...new Set(urls.map(u => u.trim()).filter(Boolean))];
    if (!urls.length) return null;
    return { raw: m[0], urls };
  }

  stripUrlFetchCommands(text) {
    return String(text || "").replace(/\{["']?(?:fetch[-_]urls?|fetchUrls?)["']?\s*:\s*(?:\[[\s\S]*?\]|"[\s\S]*?"|'[\s\S]*?')\s*\}/gi, "");
  }

  spawnUrlFetchSession(chat, aiMsg, rawCmd, urls, location, skipMarker = false) {
    if (!aiMsg.urlFetches) aiMsg.urlFetches = [];
    const uidStr = 'uf_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const session = {
      id: uidStr,
      status: 'fetching',
      urls: urls.map(u => ({
        url: u,
        title: domainHost(u) || u,
        status: 'loading',
        percent: 15,
        content: '',
        startedAt: Date.now(),
        finishedAt: 0,
        disabled: false,
        expanded: false
      })),
      startedAt: Date.now(),
      finishedAt: 0
    };
    aiMsg.urlFetches.push(session);
    const marker = '[[FETCH_URL:' + (aiMsg.urlFetches.length - 1) + ']]';
    this._insertMarker(aiMsg, rawCmd, marker, location, '[загрузка содержимого веб-страниц]');
    if (chat) chat.updatedAt = Date.now();
    this.saveAppState();
    this.refreshMsg(aiMsg);
    return session;
  }

  formatUrlFetchResults(session) {
    const activeUrls = (session.urls || []).filter(u => !u.disabled && u.status === 'done' && u.content);
    const failedUrls = (session.urls || []).filter(u => !u.disabled && u.status === 'error');
    const disabledCount = (session.urls || []).filter(u => u.disabled).length;
    const s = this.getAppSettings();
    const route = typeof window.resolveApiRoute === 'function' ? window.resolveApiRoute(s, { api: "openrouter" }) : { useProxy: !!s.proxyKey, useORDirect: !s.proxyKey };
    const canSearch = !!(s.webSearch && (route.useProxy || route.useORDirect));

    const failedBlock = failedUrls.length
      ? `\n[НЕДОСТУПНЫЕ СТРАНИЦЫ (${failedUrls.length})]:\n` + failedUrls.map(u => `- ${u.url}${u.error ? ' — ' + u.error : ''}`).join('\n')
      : '';

    if (!activeUrls.length) {
      const reason = disabledCount > 0 && !failedUrls.length
        ? 'пользователь отключил ссылки для экономии токенов'
        : 'страницы недоступны: блокировка, CORS, таймаут или неверный URL';
      const advice = canSearch
        ? 'Попробуй альтернативу: вызови {web-search: ["уточнённый запрос"]} чтобы найти другие источники по теме, либо {fetch_url: [...]} с другими URL (официальная документация, зеркала, кэш). Если альтернатив нет — честно сообщи пользователю, что страницы не открылись, и ответь на основе имеющихся знаний, явно пометив непроверенные утверждения.'
        : 'Попробуй {fetch_url: [...]} с альтернативными URL (официальная документация, зеркала). Если альтернатив нет — честно сообщи пользователю, что страницы не открылись, и ответь на основе имеющихся знаний, явно пометив непроверенные утверждения.';
      return `=== РЕЗУЛЬТАТЫ АГЕНТНОГО ЧТЕНИЯ ССЫЛОК ===\nСтраницы не загружены (${reason}).${failedBlock}\n\n${advice}`;
    }
    const blocks = activeUrls.map((u, i) => {
      let outboundText = '';
      if (Array.isArray(u.outboundLinks) && u.outboundLinks.length > 0) {
        const linkList = u.outboundLinks.slice(0, 8).map(l => `- «${l.title || l.url}»: ${l.url}`).join('\n');
        outboundText = `\n\n[СВЯЗАННЫЕ ССЫЛКИ НА СТРАНИЦЕ ДЛЯ ВОЗМОЖНОГО ПЕРЕХОДА]:\n${linkList}`;
      }
      return `═══════════════════════════════════════════════════════════════\n[СОДЕРЖИМОЕ ВЕБ-СТРАНИЦЫ ПО ССЫЛКЕ #${i + 1}: «${u.title || u.url}» (${u.url})]\n${u.content}${outboundText}\n[КОНЕЦ СОДЕРЖИМОГО СТРАНИЦЫ «${u.url}»]\n═══════════════════════════════════════════════════════════════`;
    }).join('\n\n');

    const nextStepHint = canSearch
      ? "Проанализируй полученные данные страниц. Если для ответа требуются связанные разделы выше — ты можешь перейти по ним через {fetch_url: [...]}, либо выполнить уточняющий поиск {web-search: [...]}. Не запрашивай повторно уже прочитанные URL. Если данных достаточно — предоставь итоговый подробный ответ со ссылками на первоисточники."
      : "Проанализируй полученные данные страниц. Если для ответа требуются связанные разделы выше — ты можешь перейти по ним через {fetch_url: [...]}. Не запрашивай повторно уже прочитанные URL. Если данных достаточно — предоставь итоговый подробный ответ со ссылками на первоисточники.";

    return `=== РЕЗУЛЬТАТЫ АГЕНТНОГО ЧТЕНИЯ ССЫЛОК ===\n\n${blocks}${failedBlock ? '\n' + failedBlock : ''}\n\n=== КОНЕЦ РЕЗУЛЬТАТОВ ===\n\n${nextStepHint}`;
  }

  detectWebSearchCommand(text) {
    const m = String(text || "").match(WS_CMD_RE);
    if (!m) return null;
    const inner = (m[1] || m[2] || m[3] || '').trim();
    let queries = [];
    try {
      if (m[1] !== undefined) {
        const arr = JSON.parse("[" + inner + "]");
        queries = arr.filter((x) => typeof x === "string" && x.trim());
      } else if (inner) {
        queries = [inner];
      }
    } catch (e) {
      const qre = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g;
      let qm;
      while ((qm = qre.exec(inner)) !== null) {
        const q = (qm[1] !== undefined ? qm[1] : qm[2] || '').replace(/\\(["'\\])/g, '$1').trim();
        if (q) queries.push(q);
      }
      if (!queries.length && inner) {
        queries = inner.split(/[\n,;]+/).map(s => s.replace(/^["'\[\]\s]+|["'\[\]\s]+$/g, '').trim()).filter(Boolean);
      }
    }
    queries = [...new Set(queries.map(q => q.trim()).filter(Boolean))];
    if (!queries.length) return null;
    if (queries.length > 4) queries = queries.slice(0, 4);
    return { raw: m[0], queries };
  }

  stripWsCommands(text) {
    return String(text || "").replace(/\{["']?(?:web[-_]search|webSearch)["']?\s*:\s*(?:\[[\s\S]*?\]|"[\s\S]*?"|'[\s\S]*?')\s*\}/gi, "");
  }

  detectThinkCommand(text) {
    const str = String(text || '');
    const m = str.match(THINK_CMD_RE);
    if (m) return this.parseThinkArray(m[0], m[1]);
    const openMatch = str.search(/\{thinking(?:_|[-_]process)?\s*(?::\s*)?\[/i);
    if (openMatch !== -1) {
      const tail = str.slice(openMatch);
      if (tail.length < 4000) return { partial: true, raw: tail, tasks: [] };
    }
    return null;
  }

  parseThinkArray(raw, inner) {
    let tasks = [];
    try {
      const arr = JSON.parse('[' + inner + ']');
      tasks = arr.filter(x => typeof x === 'string' && x.trim());
    } catch (e) {
      const re = /(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g;
      let mm;
      while ((mm = re.exec(inner)) !== null) {
        const t = (mm[1] !== undefined ? mm[1] : mm[2] || '').replace(/\\(["'\\])/g, '$1').trim();
        if (t) tasks.push(t);
      }
      if (!tasks.length && inner.trim()) {
        tasks = inner.split(/[\n,;]+/).map(s => s.replace(/^["'\[\]\s]+|["'\[\]\s]+$/g, '').trim()).filter(Boolean);
      }
    }
    if (!tasks.length) return null;
    const max = this.getDeepThinkMax();
    return { raw, tasks: tasks.slice(0, max) };
  }

  detectCodeExecutionCommand(text) {
    const str = String(text || "");
    let from = 0;
    while (true) {
      const oi = str.indexOf("{execute", from);
      if (oi === -1) return null;
      let i = oi + 8;
      while (i < str.length && /[\s:]/.test(str[i])) i++;
      if (str[i] !== "{") {
        from = oi + 8;
        continue;
      }
      let depth = 0, inStr = false, escCh = false, end = -1;
      for (let j = i; j < str.length; j++) {
        const ch = str[j];
        if (inStr) {
          if (escCh) escCh = false;
          else if (ch === "\\") escCh = true;
          else if (ch === '"') inStr = false;
          continue;
        }
        if (ch === '"') {
          inStr = true;
          continue;
        }
        if (ch === "{") depth++;
        else if (ch === "}") {
          depth--;
          if (depth === 0) {
            end = j;
            break;
          }
        }
      }
      if (end === -1) {
        if (str.length - oi < 12000) return { partial: true, raw: str.slice(oi), cmd: null };
        from = oi + 8;
        continue;
      }
      const raw = str.slice(oi, end + 1);
      try {
        const cmd = JSON.parse(str.slice(i, end + 1));
        if (cmd && typeof cmd.code === "string" && ["python", "node", "bash"].includes(cmd.lang)) {
          return { raw, cmd, partial: false };
        }
      } catch (e) { }
      from = oi + 8;
    }
  }

  stripExecCommands(text) {
    let str = String(text || "");
    for (let guard = 0; guard < 8; guard++) {
      const d = this.detectCodeExecutionCommand(str);
      if (!d || d.partial) break;
      str = str.replace(d.raw, "");
    }
    return str.trim();
  }

  /* ── Артефакты: HTML Sandbox & Lifecycle ── */

  findArtifactOpen(text) {
    let from = 0;
    while (true) {
      const oi = text.indexOf('<artifact', from);
      if (oi === -1) return -1;
      // Закрывающий тег </artifact> — пропускаем
      if (text[oi + 9] === '/') { from = oi + 9; continue; }
      // Ищем реальный конец открывающего тега, уважая кавычки
      let inQuote = null;
      let openEnd = -1;
      const limit = Math.min(text.length, oi + 2048);
      for (let i = oi + 9; i < limit; i++) {
        const ch = text[i];
        if (inQuote) { if (ch === inQuote) inQuote = null; }
        else if (ch === '"' || ch === "'") inQuote = ch;
        else if (ch === '>') { openEnd = i; break; }
      }
      if (openEnd !== -1) return oi;
      from = oi + 9;
    }
  }


  parseArtifact(raw) {
    if (!raw || typeof raw !== 'string') return null;
    const cleanRaw = raw.trim();
    const artIdx = cleanRaw.indexOf('<artifact');
    if (artIdx === -1) return null;
    const workingStr = cleanRaw.slice(artIdx);

    // Конец открывающего тега с учётом кавычек
    let inQuote = null;
    let openEnd = -1;
    for (let i = 9; i < workingStr.length; i++) {
      const ch = workingStr[i];
      if (inQuote) { if (ch === inQuote) inQuote = null; }
      else if (ch === '"' || ch === "'") inQuote = ch;
      else if (ch === '>') { openEnd = i; break; }
    }
    if (openEnd === -1) return null;

    const openTag = workingStr.slice(0, openEnd);
    const closeIdx = workingStr.lastIndexOf('</artifact>');
    const code = (closeIdx === -1 || closeIdx < openEnd)
      ? workingStr.slice(openEnd + 1).trim()       // авто-закрытие
      : workingStr.slice(openEnd + 1, closeIdx).trim();
    if (!code) return null;

    const attr = n => {
      const mm = openTag.match(new RegExp(
        '\\b' + n + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i'
      ));
      return mm ? (mm[1] || mm[2] || mm[3] || '').trim() : '';
    };

    let id = attr('id') || attr('identifier') || '';
    if (!id) id = 'art_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    id = id.replace(/[^\w-]/g, '_').slice(0, 64) || ('art_' + Date.now().toString(36));

    return {
      id,
      title: attr('title') || 'Артефакт',
      type: attr('type') || 'text/html',
      code
    };
  }


  sealHtml(raw) {
    const csp = '<meta http-equiv="Content-Security-Policy" content="' +
      "default-src 'none'; " +
      "script-src 'unsafe-inline' blob:; " +
      "style-src 'unsafe-inline' https://fonts.googleapis.com; " +
      "img-src data: blob:; " +
      "font-src data: https://fonts.gstatic.com; " +
      "connect-src 'none'; " +
      "form-action 'none'; " +
      "frame-src 'none'; " +
      "object-src 'none'; " +
      "base-uri 'none';" +
      '">';
    const reset = '<style>*{box-sizing:border-box}body{margin:0;font-family:system-ui,sans-serif}</style>';
    const content = String(raw || '');
    if (/<head[^>]*>/i.test(content)) {
      return content.replace(/<head([^>]*)>/i, '<head$1>' + csp + reset);
    }
    if (/<html[^>]*>/i.test(content)) {
      return content.replace(/<html([^>]*)>/i, '<html$1><head>' + csp + reset + '</head>');
    }
    return '<!DOCTYPE html><html><head>' + csp + reset + '</head><body>' + content + '</body></html>';
  }


  /* ── Карточки инструментов (HTML Renderers) ── */

  renderArtifactCard(art, idx) {
    if (!art) return '';
    const kb = art.code.length >= 1024 ? (art.code.length / 1024).toFixed(1).replace('.', ',') + ' КБ' : art.code.length + ' симв.';
    const lines = art.code.split('\n').length;
    const verBadge = art.version > 1 ? '<span class="art-ver no-sel" title="Версия артефакта">v' + art.version + '</span>' : '';
    return '<div class="art-pill-host" data-art="' + idx + '">' +
      '<button class="art-pill-btn no-sel" type="button" data-artact="menu" aria-haspopup="menu" aria-expanded="false" title="Нажмите для действий с артефактом">' +
      '<span class="art-pill-ico"><svg><use href="#i-cube"/></svg></span>' +
      '<span class="art-pill-title">' + esc(art.title) + '</span>' +
      '<span class="art-pill-meta">HTML · ' + kb + ' · ' + lines + ' строк</span>' +
      verBadge +
      '<svg class="art-pill-chev ic"><use href="#i-chev"/></svg>' +
      '</button>' +
      '</div>';
  }

  renderImgRequestCard(req, idx) {
    if (!req) return '';
    const imgModelObj = resolveImgModel(req.model) || null;
    const modelIconSrc = imgModelObj?.icon || (typeof window.getAiModelIcon === 'function' ? window.getAiModelIcon(imgModelObj?.id || req.model, imgModelObj) : null);
    const modelIconHtml = modelIconSrc
      ? `<img src="${esc(modelIconSrc)}" class="igreq-model-ico" alt="" loading="lazy" onerror="this.outerHTML='<svg><use href=&quot;#i-chip&quot;/></svg>'">`
      : `<svg><use href="#i-chip"/></svg>`;

    if (req.status === 'awaiting') {
      let paramsHtml = '<span class="igreq-param">' + modelIconHtml + '<b>' + esc(req.model) + '</b></span>';
      if (req.resolution) paramsHtml += '<span class="igreq-param"><svg><use href="#i-spark"/></svg>Качество: <b>' + esc(req.resolution) + '</b></span>';
      else if (req.quality) paramsHtml += '<span class="igreq-param"><svg><use href="#i-spark"/></svg>Качество: <b>' + esc(IG_QUALITY_LABELS[req.quality] || req.quality) + '</b></span>';
      paramsHtml += '<span class="igreq-param"><svg><use href="#i-image"/></svg>Формат: <b>' + esc(igRatioLabel(req.ratio)) + '</b></span>';
      if (req.background) paramsHtml += '<span class="igreq-param"><svg><use href="#i-drop"/></svg>Фон: <b>' + esc(IG_BG_LABELS[req.background] || req.background) + '</b></span>';

      let refHtml = '';
      if (Array.isArray(req.images) && req.images.length > 0) {
        refHtml = '<div class="igreq-refs">' +
          req.images.map(img => '<img src="' + esc(img.dataUrl || img) + '" class="igreq-ref-thumb" alt="Референс" title="' + esc(img.name || 'Референсное изображение') + '">').join('') +
          '<span class="igreq-ref-label">Прикреплено референсов: ' + req.images.length + '</span>' +
          '</div>';
      }

      return '<div class="igreq awaiting" data-girq="' + idx + '">' +
        '<div class="igreq-head"><svg><use href="#i-spark"/></svg><span>Запрошена генерация изображения</span></div>' +
        '<div class="igreq-params">' + paramsHtml + '</div>' +
        refHtml +
        '<div class="igreq-prompt">' + esc(req.aiPrompt) + '</div>' +
        '<div class="igreq-actions">' +
        '<button class="btn btn-ghost igreq-decline"><svg><use href="#i-x"/></svg>Отклонить</button>' +
        '<button class="btn btn-acc igreq-approve"><svg><use href="#i-spark"/></svg>Сгенерировать</button>' +
        '</div></div>';
    }
    if (req.status === 'declined') {
      return '<div class="igreq declined" data-girq="' + idx + '"><svg><use href="#i-x"/></svg><span>Генерация изображения отклонена пользователем</span></div>';
    }
    if (req.status === 'generating') {
      const pct = Math.max(0, Math.min(100, Math.round(req.progress || 8)));
      const statusText = req.statusText || (pct < 15 ? 'Инициализация модели…' : 'Создание изображения. Это займёт несколько секунд…');

      const aimagenHtml = (typeof window.ImageGeneration === 'function')
        ? window.ImageGeneration.createMarkup({
          progress: pct,
          loadingState: 'generating',
          statusText: statusText,
          imageSrc: req.dataUrl || null,
          alt: req.prompt || req.aiPrompt || 'Генерация'
        })
        : `<div class="genimg loading"><div class="genimg-status"><span>${esc(statusText)}</span></div></div>`;

      return '<div class="igreq media is-streaming-gen" data-girq="' + idx + '">' + aimagenHtml + '</div>';
    }
    if (req.status === 'error') {
      return '<div class="igreq media" data-girq="' + idx + '"><div class="genimg error">' +
        '<svg><use href="#i-alert"/></svg><span>Не удалось создать изображение</span><em>' + esc(req.error || '') + '</em>' +
        '</div></div>';
    }
    return '<div class="igreq media" data-girq="' + idx + '"><div class="genimg done">' +
      '<img src="' + req.dataUrl + '" alt="' + esc(req.prompt || req.aiPrompt || '') + '" loading="lazy">' +
      '<div class="genimg-bar">' +
      '<span class="genimg-model">' +
      esc(req.model) + (req.resolution ? ' · ' + esc(req.resolution) : '') +
      '</span>' +
      '<span class="genimg-spacer"></span>' +
      '<button class="gi-btn" data-gract="copy" title="Копировать в буфер" aria-label="Копировать"><svg><use href="#i-copy"/></svg></button>' +
      '<button class="gi-btn" data-gract="dl" title="Скачать" aria-label="Скачать"><svg><use href="#i-download"/></svg></button>' +
      '</div></div></div>';
  }

  renderInlineSearchCard(s, idx) {
    if (!s) return '';
    const qHtml = (s.queries || []).map(q => '<span class="ws-query">' + esc(q) + '</span>').join('');
    const isSearching = s.status === 'searching';
    const lastQ = (s.queries && s.queries.length) ? s.queries[s.queries.length - 1] : '';
    const statusText = isSearching
      ? (lastQ ? 'Searching: ' + esc(lastQ) + '…' : 'Searching…')
      : ((s.sources && s.sources.length) ? 'Web Search · ' + s.sources.length + ' source' + (s.sources.length === 1 ? '' : 's') : 'Search Completed');
    const orbState = isSearching ? 'searching' : 'composing';

    if (isSearching) {
      return '<div class="ws-inline searching" data-ws="' + idx + '">' +
        '<button class="wsearch-pill-btn ws-inline-head no-sel" type="button">' +
        '<span class="wsearch-orb-slot"><canvas class="wsearch-orb-canvas" width="48" height="48" data-orb-state="' + orbState + '"></canvas></span>' +
        '<span class="wsearch-status-text">' + statusText + '</span>' +
        '</button>' +
        (qHtml ? '<div class="wsearch-drawer-viewport"><div class="ws-inline-queries">' + qHtml + '</div></div>' : '') +
        '</div>';
    }
    const sources = s.sources || [];
    const srcHtml = sources.length
      ? '<div class="ws-inline-sources">' + sources.map(src =>
        '<a class="ws-source" href="' + esc(src.uri) + '" target="_blank" rel="noopener noreferrer">' +
        '<span class="ws-favicon" data-uri="' + esc(src.uri) + '">' + this.faviconImg(src.uri) + '</span>' +
        '<span class="ws-src-text">' +
        '<span class="ws-src-title">' + esc(src.title || domainHost(src.uri)) + '<svg><use href="#i-external"/></svg></span>' +
        '<span class="ws-src-url">' + esc(domainHost(src.uri)) + '</span>' +
        (src.snippet ? '<span class="ws-src-snippet">' + esc(src.snippet) + '</span>' : '') +
        '</span>' +
        '</a>').join('') + '</div>'
      : '<div class="ws-empty">Источники не найдены</div>';
    const collapsed = s.collapsed !== false;
    return '<div class="ws-inline' + (collapsed ? ' collapsed' : '') + '" data-ws="' + idx + '">' +
      '<button class="wsearch-pill-btn ws-inline-head no-sel" type="button" aria-expanded="' + (collapsed ? 'false' : 'true') + '">' +
      '<span class="wsearch-orb-slot"><canvas class="wsearch-orb-canvas" width="48" height="48" data-orb-state="' + orbState + '"></canvas></span>' +
      '<span class="wsearch-status-text">' + statusText + '</span>' +
      (sources.length ? '<span class="wsearch-count-badge">' + sources.length + '</span>' : '') +
      '<svg class="wchev"><use href="#i-chev"/></svg>' +
      '</button>' +
      '<div class="wsearch-drawer-viewport">' +
      (qHtml ? '<div class="ws-inline-queries">' + qHtml + '</div>' : '') +
      srcHtml +
      '</div></div>';
  }

  renderThinkCard(session, idx) {
    if (!session) return '';
    const total = session.tasks.length;
    const done = session.tasks.filter(t => t.status === 'done').length;
    const errs = session.tasks.filter(t => t.status === 'error').length;
    const isRunning = session.status === 'running';
    const tasksHtml = session.tasks.map((t, i) => {
      const statusIcon = t.status === 'thinking'
        ? '<svg><use href="#i-refresh"/></svg>'
        : t.status === 'done'
          ? '<svg><use href="#i-check"/></svg>'
          : '<svg><use href="#i-alert"/></svg>';
      const timeStr = t.finishedAt && t.startedAt
        ? ((t.finishedAt - t.startedAt) / 1000).toFixed(1) + 'с'
        : (isRunning ? '…' : '');
      const bodyHtml = t.result
        ? '<div class="tp-task-body"><div class="tp-task-body-inner">' + esc(t.result).replace(/\n/g, '<br>') + '</div></div>'
        : '';
      return '<div class="tp-task ' + t.status + (t.result && t.status !== 'thinking' ? ' expandable' : '') + '" data-tpi="' + i + '">' +
        '<div class="tp-task-head" data-tphead="' + i + '">' +
        '<span class="tp-task-status">' + statusIcon + '</span>' +
        '<span class="tp-task-text">' + esc(t.text) + '</span>' +
        '<span class="tp-task-time">' + timeStr + '</span>' +
        '<svg class="tp-task-chev"><use href="#i-chev"/></svg>' +
        '</div>' + bodyHtml + '</div>';
    }).join('');
    let summaryIcon = 'i-check', summaryText = '', summaryCls = '';
    if (isRunning) {
      summaryCls = 'pending';
      summaryIcon = 'i-refresh';
      summaryText = 'Думаем… ' + done + ' из ' + total + ' завершено';
    } else if (session.status === 'error') {
      summaryCls = 'error';
      summaryIcon = 'i-alert';
      summaryText = 'Все задачи завершились с ошибкой';
    } else {
      summaryText = done + ' из ' + total + ' задач завершено' + (errs ? ' · ' + errs + ' с ошибкой' : '') + ' · ' + ((session.finishedAt - session.startedAt) / 1000).toFixed(1) + 'с';
    }
    return '<div class="think-par' + (isRunning ? ' running' : '') + '" data-think="' + idx + '">' +
      '<div class="think-par-head"><svg><use href="#i-spark"/></svg><span>Параллельное мышление</span><span class="tp-count">' + total + '</span></div>' +
      '<div class="think-par-tasks">' + tasksHtml + '</div>' +
      '<div class="think-par-summary ' + summaryCls + '"><svg><use href="#' + summaryIcon + '"/></svg><span>' + esc(summaryText) + '</span></div>' +
      '</div>';
  }

  renderUrlFetchCard(session, idx) {
    if (!session) return '';
    const allItemsSettled = (session.urls || []).length > 0 && (session.urls || []).every(u => u.status === 'done' || u.status === 'error');
    const isFetching = session.status === 'fetching' && !allItemsSettled;
    const total = (session.urls || []).length;
    const activeUrls = (session.urls || []).filter(u => !u.disabled && u.content);
    const completed = (session.urls || []).filter(u => u.status === 'done' && !u.disabled).length;
    const totalChars = activeUrls.reduce((acc, u) => acc + (u.content ? u.content.length : 0), 0);
    const sizeSummary = totalChars > 0 ? ` · ~${Math.max(1, Math.round(totalChars / 4))} токенов` : '';

    const itemsHtml = (session.urls || []).map((u, i) => {
      const isDone = u.status === 'done';
      const isErr = u.status === 'error';
      const isLoading = u.status === 'loading' || (!isDone && !isErr);
      const isDisabled = !!u.disabled;
      const isExpanded = !!u.expanded;
      const host = domainHost(u.url) || 'веб-страница';
      const curPct = Math.max(5, Math.min(100, Math.round(u.percent || 15)));

      let pathDisplay = '';
      try {
        const parsed = new URL(u.url);
        pathDisplay = (parsed.pathname + parsed.search).replace(/\/$/, '');
      } catch (_) { }

      const titleDisplay = (u.title && u.title !== host) ? u.title : (pathDisplay || host);
      const subDisplay = `${host}${pathDisplay && titleDisplay !== pathDisplay ? ' · ' + pathDisplay : ''}`;
      const sizeLabel = u.content ? `${Math.max(1, Math.round(u.content.length / 1024))} КБ` : '';

      const faviconMarkup = `<span class="ws-favicon" data-uri="${esc(u.url)}">${this.faviconImg(u.url)}</span>`;

      let drawerHtml = '';
      if (isExpanded && u.content) {
        const charCount = u.content.length;
        const estTokens = Math.max(1, Math.round(charCount / 4));
        let outboundLinksHtml = '';
        if (Array.isArray(u.outboundLinks) && u.outboundLinks.length > 0) {
          outboundLinksHtml = `
            <div class="uf-drawer-links">
              <span class="uf-drawer-links-title">Связанные разделы:</span>
              <div class="uf-drawer-links-list">
                ${u.outboundLinks.slice(0, 6).map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" class="uf-drawer-link-tag">${esc(l.title || domainHost(l.url))}</a>`).join('')}
              </div>
            </div>`;
        }

        drawerHtml = `
          <div class="uf-drawer">
            <div class="uf-drawer-head">
              <span class="uf-drawer-meta">${charCount.toLocaleString('ru-RU')} символов · ~${estTokens.toLocaleString('ru-RU')} токенов</span>
              <a href="${esc(u.url)}" target="_blank" rel="noopener noreferrer" class="uf-drawer-ext-link">
                <span>Открыть источник</span>
                <svg class="ic"><use href="#i-external"/></svg>
              </a>
            </div>
            <pre class="uf-content-text">${esc(u.content)}</pre>
            ${outboundLinksHtml}
          </div>
        `;
      }

      return `
      <div class="uf-item ${isDisabled ? 'disabled' : (isDone ? 'done' : (isErr ? 'error' : 'loading'))} ${isExpanded ? 'is-expanded' : ''}" data-uf-idx="${i}">
        <div class="uf-item-row">
          <div class="uf-item-main" data-uf-action="view" data-uf-session="${idx}" data-uf-item="${i}" title="${u.content ? 'Нажмите, чтобы просмотреть извлечённый текст' : ''}">
            ${faviconMarkup}
            <div class="uf-text-col">
              <div class="uf-title-row">
                <span class="uf-title" title="${esc(u.url)}">${esc(titleDisplay)}</span>
                ${isLoading ? `<span class="uf-pct-badge">${curPct}%</span>` : ''}
                ${sizeLabel ? `<span class="uf-size-badge">${esc(sizeLabel)}</span>` : ''}
              </div>
              <span class="uf-sub" title="${esc(u.url)}">${isLoading ? 'Загрузка и парсинг текста…' : esc(subDisplay)}${isDisabled ? ' · исключено из контекста ИИ' : ''}</span>
              ${isLoading ? `
              <div class="uf-item-track">
                <div class="uf-item-bar" style="width: ${curPct}%"></div>
              </div>` : ''}
            </div>
          </div>
          <div class="uf-actions">
            ${isLoading ? `
            <div class="uf-spin-slot" title="Идёт загрузка"><svg class="ic" style="animation:rot 1.1s linear infinite"><use href="#i-refresh"/></svg></div>
            ` : `
            ${u.content ? `
            <button type="button" class="uf-action-btn ${isExpanded ? 'is-active' : ''}" data-uf-action="view" data-uf-session="${idx}" data-uf-item="${i}" title="${isExpanded ? 'Скрыть текст страницы' : 'Посмотреть извлечённый текст'}" aria-label="Просмотр содержимого">
              <svg class="ic"><use href="#i-eye"/></svg>
            </button>` : ''}
            <button type="button" class="uf-action-btn ${isDisabled ? 'is-off' : 'is-on'}" data-uf-action="toggle" data-uf-session="${idx}" data-uf-item="${i}" title="${isDisabled ? 'Включить обратно в контекст модели' : 'Исключить из контекста (экономия токенов)'}" aria-label="Переключить активность">
              <svg class="ic"><use href="#${isDisabled ? 'i-plus' : 'i-eye-off'}"/></svg>
            </button>
            <button type="button" class="uf-action-btn danger" data-uf-action="del" data-uf-session="${idx}" data-uf-item="${i}" title="Полностью удалить страницу из памяти" aria-label="Удалить страницу">
              <svg class="ic"><use href="#i-trash"/></svg>
            </button>`}
          </div>
        </div>
        ${drawerHtml}
      </div>`;
    }).join('');

    return `
    <div class="url-fetch-card no-sel ${isFetching ? 'is-fetching' : ''}" data-url-fetch="${idx}">
      <div class="uf-head">
        <div class="uf-head-title">
          <svg class="ic"><use href="#i-globe"/></svg>
          <span>Загруженные веб-страницы (${completed}/${total}${sizeSummary})</span>
        </div>
        <div class="uf-head-right">
          ${!isFetching && total > 0 ? `<button type="button" class="uf-clear-all-btn" data-uf-action="clear-all" data-uf-session="${idx}" title="Очистить весь контекст ссылок этого блока"><svg class="ic"><use href="#i-trash"/></svg>Очистить контекст</button>` : ''}
          <span class="uf-badge">${isFetching ? 'Чтение…' : 'В памяти'}</span>
        </div>
      </div>
      <div class="uf-list">${itemsHtml}</div>
    </div>`;
  }

  renderExecCard(x, idx) {
    if (!x) return '';
    const lang = x.lang || 'bash';
    const st = x.status;
    const stIcon = st === 'running' ? 'i-refresh' : st === 'done' ? 'i-check' : (st === 'error' || st === 'timeout') ? 'i-alert' : 'i-stop';
    const stLabel = st === 'running' ? 'Выполняется'
      : st === 'done' ? 'exit ' + x.exitCode
        : st === 'error' ? 'Ошибка'
          : st === 'timeout' ? 'Таймаут'
            : st === 'killed' ? 'Убито' : '—';
    const engineBadge = x.engine === 'openrouter_shell'
      ? '<span class="exec-engine-badge" title="Выполнено в изолированном облачном контейнере OpenRouter">OpenRouter Sandbox</span>'
      : '<span class="exec-engine-badge local" title="Выполнено в локальной песочнице Electron">Electron Local</span>';
    const out = (x.output || []).map(c =>
      c.type === 'stdout' ? '<span class="exec-out">' + esc(c.data) + '</span>'
        : c.type === 'stderr' ? '<span class="exec-err">' + esc(c.data) + '</span>'
          : '<span class="exec-sys">' + esc(c.data) + '</span>'
    ).join('');
    const stdinHtml = x.stdin ? '<div class="exec-stdin-line">▸ stdin: ' + esc(x.stdin.replace(/\n/g, ' ⏎ ')) + '</div>' : '';
    const summary = st !== 'running' ? (
      '<div class="exec-summary ' + (x.exitCode === 0 ? 'ok' : 'err') + '">' +
      '<svg><use href="#' + (x.exitCode === 0 ? 'i-check' : 'i-alert') + '"/></svg><span>' +
      esc(x.summary || (x.exitCode === 0 ? 'Процесс завершился успешно' : 'Код возврата ' + x.exitCode)) + '</span></div>'
    ) : '';
    return '<div class="exec-card' + (st === 'running' ? ' live' : '') + '" data-exec="' + idx + '">' +
      '<div class="exec-head">' +
      '<span class="exec-dots no-sel" aria-hidden="true"><i></i><i></i><i></i></span>' +
      '<span class="exec-title"><span class="exec-lang">' + esc(EXEC_LANG_LABELS[lang] || lang) + '</span>' + engineBadge + esc((x.code || '').split('\n')[0].slice(0, 50)) + '</span>' +
      '<span class="exec-meta no-sel">' + (st === 'running' ? '<span class="exec-time">' + fmtDur(Date.now() - x.startedAt) + '</span>' : fmtDur((x.finishedAt || x.startedAt) - x.startedAt)) + ' · timeout ' + (x.timeout || 30) + 's</span>' +
      '<span class="exec-status ' + esc(st) + '"><svg><use href="#' + stIcon + '"/></svg>' + esc(stLabel) + '</span>' +
      '</div>' +
      '<div class="exec-code"' + (x.codeOpen ? '' : ' hidden') + '><pre>' + esc(x.code) + '</pre></div>' +
      '<div class="exec-output"><div class="exec-stream">' + stdinHtml + out + '</div></div>' +
      summary +
      '<div class="exec-actions no-sel">' +
      (st === 'running'
        ? '<button class="btn exec-kill" data-exact="kill" data-i="' + idx + '"><svg><use href="#i-stop"/></svg>Остановить</button>'
        : '<button class="btn btn-ghost" data-exact="copy-out" data-i="' + idx + '"><svg><use href="#i-copy"/></svg>Вывод</button>' +
        '<button class="btn btn-ghost" data-exact="retry" data-i="' + idx + '"><svg><use href="#i-refresh"/></svg>Повторить</button>') +
      '<button class="btn btn-ghost' + (x.codeOpen ? ' exec-active' : '') + '" data-exact="code" data-i="' + idx + '"><svg><use href="#i-code"/></svg>Код</button>' +
      '</div></div>';
  }

  /* ── Извлечение и прямое чтение содержимого URL (Fetch URL без тулзов) ── */
  extractUrlsFromText(text) {
    if (!text || typeof text !== 'string') return [];
    const urlRegex = /(https?:\/\/[^\s<>"'()]+[^\s<>"'().,:;!?])/gi;
    const matches = text.match(urlRegex) || [];
    const unique = [...new Set(matches.map(u => u.trim()))];
    const mediaHostPatterns = [
      'youtube.com', 'youtu.be', 'rutube.ru', 'vk.com', 'vkvideo.ru',
      'vimeo.com', 'ok.ru', 'dzen.ru', 'bilibili.com', 'dailymotion.com', 'coub.com'
    ];
    const binaryExtRegex = /\.(mp4|webm|mov|mkv|avi|mp3|wav|ogg|flac|png|jpe?g|webp|gif|zip|tar|gz|7z|rar|exe|dmg|bin|pdf)$/i;

    return unique.filter(u => {
      try {
        const urlObj = new URL(u);
        if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') return false;
        const host = urlObj.hostname.toLowerCase().replace(/^www\./, '');
        if (mediaHostPatterns.some(mh => host === mh || host.endsWith('.' + mh))) return false;
        if (binaryExtRegex.test(urlObj.pathname)) return false;
        return true;
      } catch (e) {
        return false;
      }
    });
  }

  async fetchUrlContent(rawUrl, signal, onProgress) {
    if (!rawUrl || typeof rawUrl !== 'string') return null;
    const targetUrl = rawUrl.trim();
    let hostname = '';
    try { hostname = new URL(targetUrl).hostname.replace(/^www\./, ''); } catch (_) { return null; }

    const report = (pct, status) => {
      if (typeof onProgress === 'function') onProgress(pct, status, targetUrl);
    };

    report(12, `Подключение к ${hostname}…`);

    // Динамическая интерполяция прогресса ожидания сети
    let currentPct = 12;
    const progressTimer = setInterval(() => {
      if (currentPct < 85) {
        currentPct += Math.max(1, (85 - currentPct) * 0.28);
        report(Math.round(currentPct), `Чтение содержимого ${hostname}…`);
      }
    }, 380);

    const cleanup = () => clearInterval(progressTimer);

    // 1. Electron Desktop (Node.js IPC)
    if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.fetchUrl === 'function') {
      try {
        report(45, `Загрузка страницы через Electron…`);
        const res = await window.electronAPI.fetchUrl(targetUrl);
        cleanup();
        if (res && res.text) {
          report(100, `Страница ${hostname} прочитана`);
          return { url: targetUrl, title: res.title || hostname, content: res.text };
        }
      } catch (err) {
        console.warn('[ToolCalling] Electron IPC fetch failed, falling back:', err);
      }
    }

    // 2. Capacitor Mobile (Android / iOS WebView)
    if (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp) {
      try {
        report(45, `Загрузка страницы через Capacitor…`);
        const resp = await window.Capacitor.Plugins.CapacitorHttp.get({
          url: `https://r.jina.ai/${targetUrl}`,
          headers: { 'X-No-Cache': 'true', 'Accept': 'text/plain, text/markdown' }
        });
        cleanup();
        if (resp && resp.data) {
          const text = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
          report(100, `Страница ${hostname} прочитана`);
          return { url: targetUrl, title: hostname, content: text };
        }
      } catch (err) {
        console.warn('[ToolCalling] CapacitorHttp fetch failed, falling back:', err);
      }
    }

    const truncate = (text) => text;

    // Разбор Markdown (Jina Reader): заголовок и связанные ссылки
    const parseMarkdownResult = (text) => {
      const rawCleaned = String(text || '').trim();
      if (rawCleaned.length <= 10) return null;

      let title = hostname;
      const tm = rawCleaned.match(/^Title:\s*(.+)$/m);
      if (tm && tm[1].trim()) title = tm[1].trim().slice(0, 160);

      // Убираем служебные преамбулы Jina Reader
      const body = rawCleaned
        .replace(/^Title:\s*.+\r?\n?/m, '')
        .replace(/^URL Source:\s*.+\r?\n?/m, '')
        .replace(/^Markdown Content:\s*\r?\n?/m, '')
        .trim();

      const outboundLinks = [];
      const seenOutbound = new Set();
      const mdLinkRe = /\[([^\]\n]{2,80})\]\((https?:\/\/[^\s\)]+)\)/g;
      let lm;
      while ((lm = mdLinkRe.exec(body)) !== null && outboundLinks.length < 10) {
        const lUrl = lm[2].trim();
        if (!seenOutbound.has(lUrl) && lUrl !== targetUrl && !lUrl.includes('jina.ai')) {
          seenOutbound.add(lUrl);
          outboundLinks.push({ title: lm[1].trim(), url: lUrl });
        }
      }
      return { url: targetUrl, title, content: truncate(body), outboundLinks };
    };


    // Разбор HTML: чистый текст + связанные ссылки
    const parseHtmlResult = (rawHtml) => {
      if (!rawHtml || typeof rawHtml !== 'string') return null;
      const parser = new DOMParser();
      const doc = parser.parseFromString(rawHtml, 'text/html');
      const outboundLinks = [];
      const seenOutbound = new Set();
      doc.querySelectorAll('a[href]').forEach(a => {
        const href = a.getAttribute('href');
        if (!href || outboundLinks.length >= 10) return;
        try {
          const full = new URL(href, targetUrl).href;
          if (/^https?:\/\//i.test(full) && !seenOutbound.has(full) && full !== targetUrl) {
            const linkText = (a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60);
            if (linkText && linkText.length > 2) {
              seenOutbound.add(full);
              outboundLinks.push({ title: linkText, url: full });
            }
          }
        } catch (_) { }
      });
      doc.querySelectorAll('script, style, noscript, nav, footer, iframe, svg, header, form, aside').forEach(el => el.remove());
      const main = doc.querySelector('main, article, [role="main"]') || doc.body;
      const text = (main ? (main.innerText || main.textContent) : rawHtml).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
      if (text.length <= 20) return null;
      return { url: targetUrl, title: (doc.title || '').trim() || hostname, content: truncate(text), outboundLinks };
    };

    const lastErrors = [];

    // 3. Универсальный Markdown-ридер (Jina Reader API без CORS)
    try {
      report(40, `Преобразование структуры ${hostname} в Markdown…`);
      const t = withTimeoutSignal(signal, 22000);
      let resp;
      try {
        resp = await fetch(`https://r.jina.ai/${targetUrl}`, {
          method: 'GET',
          headers: { 'Accept': 'text/markdown, text/plain', 'X-No-Cache': 'true' },
          signal: t.signal
        });
      } finally { t.clear(); }
      if (resp.ok) {
        report(90, `Извлечение чистого текста страницы…`);
        const parsed = parseMarkdownResult(await resp.text());
        if (parsed) {
          cleanup();
          report(100, `Страница ${hostname} загружена`);
          return parsed;
        }
      } else {
        lastErrors.push(`reader HTTP ${resp.status}`);
      }
    } catch (e) {
      if (isAbortError(e) && signal?.aborted) { cleanup(); throw e; }
      lastErrors.push('reader: ' + ((e && e.message) || 'network'));
      console.warn('[ToolCalling] Reader API error, trying direct fallback:', e);
    }

    // 4. Прямой Fetch с парсингом текста в DOM (для CORS-открытых ресурсов)
    try {
      report(65, `Прямой запрос к ${hostname}…`);
      const t = withTimeoutSignal(signal, 15000);
      let resp;
      try { resp = await fetch(targetUrl, { signal: t.signal }); } finally { t.clear(); }
      if (resp.ok) {
        const parsed = parseHtmlResult(await resp.text());
        if (parsed) {
          cleanup();
          report(100, `Страница ${hostname} загружена`);
          return parsed;
        }
      } else {
        lastErrors.push(`direct HTTP ${resp.status}`);
      }
    } catch (e) {
      if (isAbortError(e) && signal?.aborted) { cleanup(); throw e; }
      lastErrors.push('direct: CORS/network');
    }

    // 5. Публичные CORS-прокси как последний резерв
    const corsProxies = [
      `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
      `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`
    ];
    for (const proxyUrl of corsProxies) {
      if (signal?.aborted) break;
      try {
        report(78, `Резервный канал чтения ${hostname}…`);
        const t = withTimeoutSignal(signal, 15000);
        let resp;
        try { resp = await fetch(proxyUrl, { signal: t.signal }); } finally { t.clear(); }
        if (!resp.ok) { lastErrors.push(`proxy HTTP ${resp.status}`); continue; }
        const raw = await resp.text();
        const parsed = /<\s*(html|body|div|p)\b/i.test(raw) ? parseHtmlResult(raw) : parseMarkdownResult(raw);
        if (parsed) {
          cleanup();
          report(100, `Страница ${hostname} загружена`);
          return parsed;
        }
      } catch (e) {
        if (isAbortError(e) && signal?.aborted) { cleanup(); throw e; }
        lastErrors.push('proxy: network');
      }
    }

    cleanup();
    report(100, `Не удалось прочитать ${hostname}`);
    return { url: targetUrl, title: hostname, content: '', error: lastErrors.join('; ') || 'страница недоступна' };
  }

  async fetchAllUrlContents(urls, signal, onProgress) {
    if (!Array.isArray(urls) || !urls.length) return [];
    const targets = [...new Set(urls.map(u => String(u || '').trim()).filter(Boolean))].slice(0, 5); // До 5 ссылок за один запрос
    const total = targets.length;
    const perUrlPct = new Array(total).fill(0);
    let doneCount = 0;

    const emit = (statusText, u) => {
      if (typeof onProgress !== 'function') return;
      const overall = perUrlPct.reduce((a, b) => a + b, 0) / total;
      onProgress(Math.min(99, overall), `${statusText} (${doneCount}/${total})`, u);
    };

    // Параллельная загрузка (не более 3 одновременно) с изоляцией ошибок каждой ссылки
    const concurrency = 3;
    const results = new Array(total).fill(null);
    let cursor = 0;
    const worker = async () => {
      while (cursor < total) {
        if (signal?.aborted) return;
        const i = cursor++;
        const u = targets[i];
        try {
          const res = await this.fetchUrlContent(u, signal, (subPct, statusText) => {
            perUrlPct[i] = Math.min(99, subPct);
            emit(statusText, u);
          });
          if (res && res.content) results[i] = res;
        } catch (e) {
          if (isAbortError(e) && signal?.aborted) return;
        }
        perUrlPct[i] = 100;
        doneCount++;
        emit('Страница обработана', u);
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker));

    if (typeof onProgress === 'function') {
      onProgress(100, 'Загрузка завершена', targets[targets.length - 1]);
    }
    return results.filter(Boolean);
  }

  /* Фавиконки для результатов поиска */
  domainIcon(uri, size = 30) {
    const host = domainHost(uri) || 'web';
    let h = 0;
    for (let i = 0; i < host.length; i++) { h = ((h << 5) - h + host.charCodeAt(i)) | 0; }
    h = Math.abs(h);
    const hue = h % 360, hue2 = (hue + 42) % 360;
    const letter = esc((host.replace(/[^a-zа-яё0-9]/gi, '').charAt(0) || 'w').toUpperCase());
    const gid = 'fg' + (this.faviconSeq++);
    return `<svg viewBox="0 0 28 28" style="width:${size}px;height:${size}px" aria-hidden="true"><defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsla(${hue},62%,56%,1)"/><stop offset="1" stop-color="hsla(${hue2},58%,40%,1)"/></linearGradient></defs><rect x="1" y="1" width="26" height="26" rx="7.5" fill="url(#${gid})"/><rect x="1" y="1" width="26" height="26" rx="7.5" fill="none" stroke="hsla(0,0%,100%,.16)"/><text x="14" y="18.6" text-anchor="middle" font-family="Manrope,system-ui,sans-serif" font-size="13" font-weight="800" fill="hsla(0,0%,100%,.94)">${letter}</text></svg>`;
  }

  faviconImg(uri) {
    const host = domainHost(uri);
    if (!host) return this.domainIcon(uri, 24);
    const g = 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(host) + '&sz=64';
    const ddg = 'https://icons.duckduckgo.com/ip3/' + encodeURIComponent(host) + '.ico';
    const cached = this.favCache.get(host);
    const src = cached || g;
    const chain = [g, ddg].filter(u => u !== src).join('|');
    return '<img src="' + esc(src) + '" data-favchain="' + esc(chain) + '" data-favhost="' + esc(host) + '" alt="" loading="lazy" draggable="false">';
  }

  /* ═══════════════════════════════════════════════════════════════
       3. ЖИЗНЕННЫЙ ЦИКЛ И ИСПОЛНЕНИЕ: ГЕНЕРАЦИЯ ИЗОБРАЖЕНИЙ
       ═══════════════════════════════════════════════════════════════ */

  lastUserPromptBefore(chat, aiMsg) {
    if (!chat || !Array.isArray(chat.messages)) return '';
    const aiIdx = chat.messages.findIndex(x => x.id === aiMsg.id);
    for (let i = aiIdx - 1; i >= 0; i--) {
      const role = chat.messages[i].role;
      if (role === 'user' || role === 'developer') return (chat.messages[i].content || '').trim();
    }
    return '';
  }

  lastUserImagesBefore(chat, aiMsg) {
    if (!chat || !Array.isArray(chat.messages)) return [];
    const aiIdx = chat.messages.findIndex(x => x.id === aiMsg.id);
    if (aiIdx > 0) {
      const prevMsg = chat.messages[aiIdx - 1];
      if (prevMsg && (prevMsg.role === 'user' || prevMsg.role === 'developer')) {
        const imgs = (prevMsg.attachments || [])
          .filter(a => a.kind === 'image' && a.dataUrl)
          .map(a => ({ dataUrl: a.dataUrl, name: a.name || 'Референс' }));
        if (imgs.length) return imgs;
      }
    }
    return [];
  }

  spawnImageRequest(chat, aiMsg, rawCmd, promptText, refsParam = '') {
    if (!aiMsg.imageRequests) aiMsg.imageRequests = [];
    if (aiMsg.imageRequests.length >= MAX_IMG_REQ_PER_MSG) return;
    const cfg = this.getImgCfg();
    const cfgModel = IMG_MODELS.find(m => m.id === cfg.model) || IMG_MODELS[0];
    const totalSteps = cfgModel.id.includes('flux') ? (cfg.fluxSteps || 28) : 24;
    const refImages = this.resolveDialogueReferences(chat, aiMsg, refsParam);
    const req = {
      id: 'ir_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      status: 'awaiting',
      model: cfgModel.name,
      resolution: cfgModel.supportsResolution ? (cfgModel.resolutions.includes(cfg.resolution) ? cfg.resolution : cfgModel.resolutions[0]) : '',
      quality: cfgModel.supportsQuality ? (cfg.quality || 'high') : '',
      ratio: (cfgModel.ratios && cfgModel.ratios.includes(cfg.ratio)) ? cfg.ratio : ((cfgModel.ratios && cfgModel.ratios[0]) || '1:1'),
      background: (cfgModel.backgrounds && cfgModel.backgrounds.length) ? (cfgModel.backgrounds.includes(cfg.background) ? cfg.background : 'auto') : '',
      steps: cfgModel.supportsFluxParams ? (cfg.fluxSteps || 28) : undefined,
      guidance: cfgModel.supportsFluxParams ? (cfg.fluxGuidance || 3.5) : undefined,
      safety_tolerance: cfgModel.supportsFluxParams ? Math.min(5, Math.max(0, parseInt(cfg.fluxSafety, 10) || 5)) : undefined,
      output_format: cfgModel.supportsFluxParams ? (cfg.fluxFormat || 'jpeg') : undefined,
      aiPrompt: promptText,
      userPrompt: this.lastUserPromptBefore(chat, aiMsg),
      prompt: promptText,
      images: refImages,
      startedAt: 0,
      progress: 0,
      statusText: '',
      step: 0,
      totalSteps
    };
    aiMsg.imageRequests.push(req);
    aiMsg.content = aiMsg.content.replace(rawCmd, '[[IMGRQ:' + (aiMsg.imageRequests.length - 1) + ']]');
    if (chat) chat.updatedAt = Date.now();
    this.saveAppState();
    this.refreshMsg(aiMsg);
    if (typeof window.enqueueImgReq === 'function') window.enqueueImgReq(aiMsg, req);
  }

  async handleImageRequests(chat, aiMsg) {
    const globalImgRe = /\{image_generation\[([^\[\]]+?):([^\[\]]*?)\]:\{([\s\S]+?)\}\}/g;
    const matches = [...(aiMsg.content || '').matchAll(globalImgRe)];
    if (!matches.length) return;
    const s = this.getAppSettings();
    if (!s.proxyKey && !s.orKey) {
      if (typeof window.toast === 'function') window.toast('Для генерации укажите API-ключ в настройках', 'err');
      if (typeof window.openSettings === 'function') window.openSettings();
      return;
    }
    const room = MAX_IMG_REQ_PER_MSG - (aiMsg.imageRequests || []).length;
    if (room <= 0) return;
    matches.slice(0, room).forEach(mm => {
      const rawParams = (mm[2] || '').trim();
      let refs = '';
      const refsMatch = rawParams.match(/\brefs?[:=]\s*([a-zA-Z0-9_, -]+)/i);
      if (refsMatch) refs = refsMatch[1].trim();
      this.spawnImageRequest(chat, aiMsg, mm[0], mm[3].trim(), refs);
    });
  }

  /* Публичная точка входа: failover между шлюзами (ProxyAPI <-> OpenRouter) при сетевых/5xx ошибках */
  async requestImageGeneration(imgModel, opts, prompt, signal, onProgress) {
    const s = this.getAppSettings();
    const route = typeof window.resolveApiRoute === 'function'
      ? window.resolveApiRoute(s, { api: "openrouter" })
      : { useProxy: !!s.proxyKey, useORDirect: !s.proxyKey && !!s.orKey };

    const hasProxy = !!(s.proxyKey || '').trim();
    const hasOR = !!(s.orKey || '').trim();
    const autoMode = (s.apiSource || 'auto') === 'auto';
    const chain = [];
    if (route.useORDirect) chain.push('openrouter'); else if (route.useProxy) chain.push('proxy');
    if (autoMode && hasProxy && hasOR) chain.push(chain[0] === 'proxy' ? 'openrouter' : 'proxy');
    if (!chain.length) chain.push(hasOR ? 'openrouter' : 'proxy');

    let lastErr = null;
    for (let i = 0; i < chain.length; i++) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const gw = chain[i];
      try {
        return await this._requestImageGenerationVia(gw, imgModel, opts, prompt, signal, onProgress);
      } catch (e) {
        if (isAbortError(e) && signal?.aborted) throw e;
        lastErr = e;
        if (signal?.aborted || i + 1 >= chain.length) throw e;
        if (typeof window.toast === 'function') {
          window.toast(`${gw === 'proxy' ? 'ProxyAPI' : 'OpenRouter'} недоступен, пробуем ${chain[i + 1] === 'proxy' ? 'ProxyAPI' : 'OpenRouter'}…`, 'info', 2800);
        }
        if (typeof onProgress === 'function') onProgress({ percent: 6, statusText: 'Переключение шлюза генерации…', step: 1, totalSteps: 20 });
      }
    }
    throw lastErr || new Error('Генерация изображения не удалась');
  }

  async _requestImageGenerationVia(gateway, imgModel, opts, prompt, signal, onProgress) {
    const s = this.getAppSettings();
    const route = { useORDirect: gateway === 'openrouter', useProxy: gateway === 'proxy' };

    const isFlux = imgModel.id.includes("flux");
    const isMuse = imgModel.id.includes("muse");
    const isMai = imgModel.id.includes("mai-image") || imgModel.id.includes("mai");
    const isSunburst = imgModel.id.includes("sunburst");
    const isMing = imgModel.id.includes("ming");
    const totalSteps = isFlux
      ? (s.imgGen?.fluxSteps || 28)
      : (imgModel.id.includes("riverflow")
        ? 25
        : (isMuse
          ? 16
          : (isMai ? (imgModel.id.includes("flash") ? 12 : 20) : (isSunburst ? 20 : (isMing ? 14 : 20)))));
    const reportProgress = (pct, statusText, stepNum) => {
      if (typeof onProgress === 'function') {
        onProgress({
          percent: Math.max(1, Math.min(100, Math.round(pct))),
          statusText: statusText || 'Генерация диффузии…',
          step: stepNum !== undefined ? stepNum : Math.round((pct / 100) * totalSteps),
          totalSteps
        });
      }
    };

    reportProgress(8, `Подключение к кластеру ${imgModel.vendor || 'AI'}…`, 1);

    // Плавная интерполяция прогресса диффузии в реальном времени
    let currentPct = 8;
    const progressTimer = setInterval(() => {
      if (currentPct < 92) {
        const stepIncrement = Math.max(0.6, (92 - currentPct) * 0.085);
        currentPct += stepIncrement;
        const curStep = Math.min(totalSteps, Math.max(1, Math.round((currentPct / 100) * totalSteps)));
        let stage = 'Денойзинг латентного пространства…';
        if (currentPct < 25) stage = 'Инициализация латентного шума…';
        else if (currentPct < 55) stage = `Диффузионная итерация (${curStep}/${totalSteps})…`;
        else if (currentPct < 80) stage = 'Прорисовка мелких деталей и освещения…';
        else stage = 'Декодирование VAE тензора…';

        reportProgress(currentPct, stage, curStep);
      }
    }, isMuse || isMing ? 140 : 240);

    const cleanup = () => clearInterval(progressTimer);

    const o = opts || {};
    const refImages = Array.isArray(o.images) ? o.images : [];
    const hasRefImages = refImages.length > 0;
    const isTextToImage = !hasRefImages;

    // Направление на официальный эндпоинт в зависимости от провайдера
    let url, key;
    if (route.useORDirect) {
      url = "https://openrouter.ai/api/v1/images";
      key = (s.orKey || "").trim();
      if (!key) { cleanup(); throw new Error("Не указан ключ OpenRouter (sk-or-…)"); }
    } else if (route.useProxy) {
      url = "https://api.proxyapi.ru/v1/images/generations";
      key = (s.proxyKey || "").trim();
      if (!key) { cleanup(); throw new Error("Не указан ключ ProxyAPI"); }
    } else {
      cleanup();
      throw new Error(
        route.missing === "proxy"
          ? "Для генерации изображений укажите ключ ProxyAPI или OpenRouter"
          : "Укажите ключ OpenRouter для генерации изображений",
      );
    }

    const cleanKey = String(key || '').trim().replace(/[^\x21-\x7E]/g, '');
    const attribHeaders = typeof window.getOpenRouterAttributionHeaders === 'function'
      ? window.getOpenRouterAttributionHeaders('Image Studio')
      : {
        "HTTP-Referer": "https://unichat2.sahbanovtimur228.workers.dev/ai",
        "X-Title": "MoonSSS"
      };

    const headers = {
      "Content-Type": "application/json",
      Authorization: "Bearer " + cleanKey,
      ...attribHeaders
    };

    const isOpenAI = imgModel.id.includes("openai") || imgModel.id.includes("gpt");
    const isRiverflow = imgModel.id.includes("riverflow");

    // Санитизация соотношения сторон
    let sanitizedRatio = o.ratio || "auto";
    const allowedRatios = ["1:1", "4:3", "3:4", "3:2", "2:3", "16:9", "9:16", "21:9"];
    if (sanitizedRatio !== "auto" && !allowedRatios.includes(sanitizedRatio)) {
      sanitizedRatio = "1:1";
    }

    const RATIO_TO_SIZE = {
      '1:1': '1024x1024',
      '16:9': '1792x1024',
      '9:16': '1024x1792',
      '4:3': '1152x864',
      '3:4': '864x1152',
      '3:2': '1216x832',
      '2:3': '832x1216',
      '21:9': '1792x768'
    };

    // Базовый payload
    const curChat = this.getActiveChat();
    const appMeta = window.APP_IDENTITY || {
      title: 'MoonSSS',
      refererUrl: 'https://unichat2.sahbanovtimur228.workers.dev/ai',
      faviconUrl: 'https://unichat2.sahbanovtimur228.workers.dev/favicon.ico',
      description: 'MoonSSS - Image Studio'
    };

    const body = {
      model: imgModel.id,
      prompt: prompt,
      n: 1,
      session_id: curChat ? String(curChat.id).slice(0, 128) : undefined,
      user: curChat ? 'user_' + String(curChat.id).slice(0, 64) : undefined,
      trace: {
        trace_name: appMeta.title,
        generation_name: 'Image Generation',
        environment: 'production'
      },
      metadata: {
        app_title: appMeta.title,
        app_url: appMeta.refererUrl,
        app_icon: appMeta.faviconUrl,
        favicon_url: appMeta.faviconUrl,
        description: appMeta.description
      }
    };

    if (route.useProxy) {
      body.size = RATIO_TO_SIZE[sanitizedRatio] || '1024x1024';
    }

    // Нативный SSE-стриминг используется только на OpenRouter для поддерживающих моделей
    if (route.useORDirect && (isMuse || isSunburst || isMing) && isTextToImage) {
      body.stream = true;
    }

    // Параметр aspect_ratio передаётся для совместимых моделей
    if (!isMing && sanitizedRatio && sanitizedRatio !== "auto") {
      body.aspect_ratio = sanitizedRatio;
    }

    // Передача референсных изображений
    if (hasRefImages) {
      if (isMing || imgModel.supportsReferences === false) {
        cleanup();
        throw new Error(`Модель ${imgModel.name} генерирует только новые изображения по тексту и не поддерживает референсы (input_references: 0). Выберите FLUX 2 Pro, GPT Image или Riverflow.`);
      }
      body.input_references = refImages.slice(0, 16).map(img => {
        const rawUrl = typeof img === 'string' ? img : (img.dataUrl || img.url);
        const formattedUrl = (rawUrl && rawUrl.startsWith('data:')) ? fixDataUrlMime(rawUrl, 'image/jpeg') : rawUrl;
        if (!formattedUrl) return null;
        return {
          type: "image_url",
          image_url: {
            url: formattedUrl
          }
        };
      }).filter(Boolean);
    }

    if (isMing) {
      body.output_format = o.output_format || "jpeg";
    }

    if (o.background && !isMuse && !isFlux && !isMing) {
      if (isOpenAI) {
        body.background = (o.background === "opaque") ? "opaque" : "auto";
      } else {
        body.background = o.background;
      }
    }

    if (isOpenAI) {
      let openAiQuality = "auto";
      const rawQ = String(o.quality || o.resolution || "").toLowerCase();
      if (Array.isArray(imgModel.qualities) && imgModel.qualities.includes(rawQ)) {
        openAiQuality = rawQ;
      } else if (rawQ === "max") openAiQuality = "max";
      else if (rawQ === "xhigh" || rawQ === "x-high" || rawQ === "very-high") openAiQuality = "xhigh";
      else if (rawQ === "4k" || rawQ === "high") openAiQuality = "high";
      else if (rawQ === "2k" || rawQ === "medium") openAiQuality = "medium";
      else if (rawQ === "1k" || rawQ === "low") openAiQuality = "low";
      else if (rawQ === "auto") openAiQuality = "auto";
      else openAiQuality = (imgModel.qualities && imgModel.qualities.includes("high")) ? "high" : "auto";

      body.quality = openAiQuality;
    } else if (isRiverflow) {
      if (o.resolution && imgModel.supportsResolution) {
        body.resolution = o.resolution;
      }
      body.output_format = "png";
    } else if (isFlux) {
      let fluxFormat = String(o.output_format || o.fluxFormat || s.imgGen?.fluxFormat || "jpeg").toLowerCase();
      if (fluxFormat === "jpg") fluxFormat = "jpeg";
      if (fluxFormat !== "png" && fluxFormat !== "jpeg") fluxFormat = "jpeg";
      body.output_format = fluxFormat;

      const steps = typeof o.steps === 'number' ? o.steps : (typeof s.imgGen?.fluxSteps === 'number' ? s.imgGen.fluxSteps : 28);
      const guidance = typeof o.guidance === 'number' ? o.guidance : (typeof s.imgGen?.fluxGuidance === 'number' ? s.imgGen.fluxGuidance : 3.5);
      const rawSafety = typeof o.safety_tolerance === 'number' ? o.safety_tolerance : (typeof s.imgGen?.fluxSafety === 'number' ? s.imgGen.fluxSafety : 5);
      const safetyTolerance = Math.min(5, Math.max(0, parseInt(rawSafety, 10) || 0));

      // OpenRouter Provider Passthrough: строго под slug 'black-forest-labs'
      body.provider = {
        options: {
          "black-forest-labs": {
            steps: steps,
            guidance: guidance,
            safety_tolerance: safetyTolerance
          }
        }
      };

      if (typeof o.seed === 'number') {
        body.seed = o.seed;
      }
    }

    // Таймаут генерации: 4K/Riverflow и FLUX Pro могут работать долго
    const genTimeoutMs = (String(o.resolution || '').toUpperCase() === '4K' || imgModel.id.includes('pro')) ? 240000 : 150000;
    const tGen = withTimeoutSignal(signal, genTimeoutMs);
    let resp;
    try {
      resp = await fetch(url, {
        method: "POST",
        signal: tGen.signal,
        headers,
        body: JSON.stringify(body),
      });
    } catch (e) {
      cleanup();
      tGen.clear();
      if (signal && signal.aborted) throw e;
      const target = route.useORDirect ? "OpenRouter" : "ProxyAPI";
      if (isAbortError(e)) throw new Error(`Не удалось связаться с ${target} (timeout ${Math.round(genTimeoutMs / 1000)}s)`);
      throw new Error(`Не удалось связаться с ${target} (${(e && e.message) || "network"})`);
    }

    if (!resp.ok) {
      cleanup();
      tGen.clear();
      let errorDetail = `HTTP ${resp.status}`;
      try {
        const errJson = await resp.json();
        if (errJson.error) {
          errorDetail = typeof errJson.error === 'string' ? errJson.error : (errJson.error.message || JSON.stringify(errJson.error));
        } else if (errJson.message) {
          errorDetail = errJson.message;
        }
      } catch (_) {
        try {
          const rawErr = await resp.text();
          if (rawErr) errorDetail += `: ${rawErr.slice(0, 240)}`;
        } catch (_) { }
      }
      throw new Error(errorDetail);
    }

    let imgUrl = null;
    const contentType = resp.headers.get("content-type") || "";
    const isEventStream = contentType.includes("text/event-stream");

    if (isEventStream && resp.body) {
      const reader = resp.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let streamBuffer = "";
      let isDone = false;

      try {
        while (!isDone) {
          const { value, done } = await reader.read();
          if (done) break;
          streamBuffer += decoder.decode(value, { stream: true });
          const lines = streamBuffer.split("\n");
          streamBuffer = lines.pop() || "";

          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line || line.startsWith("event:") || line.startsWith("id:") || line.startsWith("retry:")) continue;
            if (!line.startsWith("data:")) continue;

            const chunkPayload = line.slice(5).trim();
            if (chunkPayload === "[DONE]") {
              isDone = true;
              break;
            }

            try {
              const chunkJson = JSON.parse(chunkPayload);

              if (chunkJson.error) {
                const errMessage = typeof chunkJson.error === "string"
                  ? chunkJson.error
                  : chunkJson.error.message || JSON.stringify(chunkJson.error);
                throw new Error(errMessage);
              }

              // Чтение прогресса диффузии из SSE-чанка
              const streamProgress = typeof chunkJson.progress === "number"
                ? Math.round(chunkJson.progress * 100)
                : (typeof chunkJson.pct === "number" ? Math.round(chunkJson.pct) : null);
              const streamStep = typeof chunkJson.step === "number"
                ? chunkJson.step
                : (typeof chunkJson.current_step === "number" ? chunkJson.current_step : null);
              const streamStatus = chunkJson.statusText || chunkJson.status || chunkJson.stage || null;

              if (streamProgress !== null || streamStep !== null || streamStatus !== null) {
                const targetPct = streamProgress !== null
                  ? streamProgress
                  : (streamStep !== null ? Math.round((streamStep / totalSteps) * 100) : null);
                if (targetPct !== null || streamStatus !== null) {
                  reportProgress(targetPct !== null ? targetPct : currentPct, streamStatus || "Потоковый синтез диффузии…", streamStep);
                }
              }

              // Извлечение изображения из нативного потока /api/v1/images
              const item = chunkJson.data?.[0] || (chunkJson.b64_json ? chunkJson : null);
              if (item) {
                if (item.b64_json) {
                  const mediaType = item.media_type || (body.output_format === 'png' ? 'image/png' : 'image/jpeg');
                  imgUrl = fixDataUrlMime(item.b64_json, mediaType);
                } else if (item.url) {
                  imgUrl = item.url;
                }
              }

              const msgImage = chunkJson.choices?.[0]?.message?.images?.[0]?.image_url?.url ||
                chunkJson.choices?.[0]?.delta?.images?.[0]?.image_url?.url;
              if (msgImage) imgUrl = msgImage;

            } catch (parseErr) {
              if (parseErr.message && !parseErr.message.includes("Unexpected token")) {
                throw parseErr;
              }
            }
          }
        }
      } catch (streamErr) {
        cleanup();
        throw streamErr;
      }
    } else {
      // Обработка стандартного JSON-ответа OpenRouter Image API
      let data = null;
      try {
        data = await resp.json();
      } catch (e) {
        cleanup();
        throw new Error("Не удалось обработать ответ от API генерации (JSON parse failed)");
      }

      if (!data) {
        cleanup();
        throw new Error("Пустой ответ от API генерации");
      }

      if (data.error) {
        cleanup();
        const errMessage = typeof data.error === "string"
          ? data.error
          : data.error.message || JSON.stringify(data.error);
        throw new Error(errMessage);
      }

      // Извлечение b64_json или url из ответа
      const item = (data.data || [])[0] || (data.b64_json ? data : (data.images || [])[0]);
      if (item) {
        if (item.b64_json) {
          const mediaType = item.media_type || (body.output_format === 'png' ? 'image/png' : 'image/jpeg');
          imgUrl = fixDataUrlMime(item.b64_json, mediaType);
        } else if (item.url) {
          imgUrl = item.url;
        }
      } else {
        const msg = data.choices?.[0]?.message;
        if (msg?.images?.[0]?.image_url?.url) {
          imgUrl = msg.images[0].image_url.url;
        } else {
          const alt = (data.data || data.images || [])[0];
          if (alt?.b64_json) {
            const mediaType = alt.media_type || (body.output_format === 'png' ? 'image/png' : 'image/jpeg');
            imgUrl = fixDataUrlMime(alt.b64_json, mediaType);
          } else if (alt?.url) {
            imgUrl = alt.url;
          }
        }
      }

      if (!imgUrl) {
        cleanup();
        const c = data.choices?.[0]?.message?.content;
        if (typeof c === "string" && c.trim()) {
          throw new Error("Модель вернула текст вместо изображения: " + c.trim().slice(0, 140));
        }
        throw new Error("Модель не вернула изображение в поле data");
      }
    }

    tGen.clear();

    if (!imgUrl) {
      cleanup();
      throw new Error("Изображение не было получено в потоке ответа");
    }

    reportProgress(96, 'Финальная сборка и загрузка полотна…', totalSteps);

    if (imgUrl.indexOf("data:") === 0) {
      cleanup();
      reportProgress(100, 'Готово', totalSteps);
      return imgUrl;
    }

    // Скачивание готового изображения по URL: прямой fetch -> CORS-прокси -> сам URL как fallback
    const blobToDataUrl = (blob) => new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => rej(new Error("FileReader"));
      r.readAsDataURL(blob);
    });
    const dlCandidates = [imgUrl, `https://corsproxy.io/?${encodeURIComponent(imgUrl)}`];
    let lastDlErr = null;
    for (const cand of dlCandidates) {
      if (signal?.aborted) { cleanup(); throw new DOMException('Aborted', 'AbortError'); }
      const tDl = withTimeoutSignal(signal, 45000);
      try {
        const rr = await fetch(cand, { signal: tDl.signal });
        if (!rr.ok) throw new Error("Не удалось загрузить изображение (" + rr.status + ")");
        const blob = await rr.blob();
        if (!blob || !blob.size || (blob.type && !blob.type.startsWith('image/'))) throw new Error('Ответ не является изображением');
        const finalDataUrl = await blobToDataUrl(blob);
        cleanup();
        reportProgress(100, 'Готово', totalSteps);
        return finalDataUrl;
      } catch (err) {
        if (isAbortError(err) && signal?.aborted) { cleanup(); throw err; }
        lastDlErr = err;
      } finally { tDl.clear(); }
    }
    // Последний резерв: отдаём удалённый URL как есть (браузер отрисует <img src>)
    cleanup();
    console.warn('[MoonSSS] image download fallback to remote URL:', lastDlErr);
    reportProgress(100, 'Готово', totalSteps);
    return imgUrl;
  }

  /* ═══════════════════════════════════════════════════════════════
     4. ЖИЗНЕННЫЙ ЦИКЛ И ИСПОЛНЕНИЕ: АГЕНТНЫЙ ВЕБ-ПОИСК
     ═══════════════════════════════════════════════════════════════ */

  cleanImageQuery(t) {
    const words = String(t || '').toLowerCase().replace(/[\?\!\.,;:"'«»()…]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !IMG_STOP_WORDS.includes(w));
    const q = words.slice(0, 6).join(' ');
    return q || String(t || '').trim().slice(0, 60);
  }

  shouldAttachImages(t) {
    t = String(t || '').toLowerCase();
    if (!t.trim() || t.length < 4) return false;
    const skip = ['напиши код', 'функци', 'скрипт', 'debug', 'дебуг', 'ошибк', 'исправ', 'рефактор', 'компил', 'api', 'json', 'sql', 'html', 'css', 'javascript', 'typescript', 'python', 'regex', 'массив', 'алгоритм сортир'];
    return !skip.some(w => t.includes(w));
  }

  async translateImageQuery(q, signal) {
    const s = this.getAppSettings();
    const route = typeof window.resolveApiRoute === 'function' ? window.resolveApiRoute(s, { api: "openrouter" }) : { useORDirect: !s.proxyKey };
    const query = String(q || "").slice(0, 120);
    if (!query.trim()) return null;

    if (route.useORDirect && s.orKey && typeof window.translateQueryViaOpenRouter === "function") {
      try {
        const t = await window.translateQueryViaOpenRouter(query, signal);
        if (t) return t;
      } catch (e) {
        if (e && e.name === "AbortError") return null;
      }
    }

    const key = (s.proxyKey || "").trim();
    if (!key) return null;
    const t = withTimeoutSignal(signal, 15000);
    try {
      const resp = await fetch("https://api.proxyapi.ru/openai/v1/chat/completions", {
        method: "POST",
        signal: t.signal,
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          max_completion_tokens: 120,
          messages: [{ role: "user", content: "Translate the search query into 2-6 English keywords for image search. Reply with keywords only, no punctuation, no explanations.\nQuery: " + query }]
        }),
      });
      if (!resp.ok) return null;
      const j = await resp.json();
      const tr = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || "").trim();
      return tr && tr.length < 140 ? tr : null;
    } catch (e) {
      return null;
    } finally { t.clear(); }
  }

  async fetchCommonsImages(query, signal) {
    try {
      const p = new URLSearchParams({
        action: "query",
        format: "json",
        origin: "*",
        generator: "search",
        gsrsearch: String(query || "").slice(0, 120) + " filetype:bitmap",
        gsrnamespace: "6",
        gsrlimit: "8",
        prop: "imageinfo",
        iiprop: "url|mime",
        iiurlwidth: "480",
      });
      const resp = await fetch("https://commons.wikimedia.org/w/api.php?" + p.toString(), { signal });
      if (!resp.ok) return [];
      const j = await resp.json();
      const pages = j && j.query && j.query.pages;
      if (!pages) return [];
      return Object.values(pages)
        .sort((a, b) => (a.index || 0) - (b.index || 0))
        .map(pg => {
          const ii = pg.imageinfo && pg.imageinfo[0];
          if (!ii || (ii.mime && ii.mime.indexOf("image/") !== 0)) return null;
          return { thumb: ii.thumburl || ii.url, full: ii.url, title: String(pg.title || "").replace(/^File:/, "") };
        })
        .filter(Boolean)
        .slice(0, 4);
    } catch (e) {
      return [];
    }
  }

  async fetchWebImages(query, signal) {
    const out = [];
    const seen = new Set();
    const push = arr => (arr || []).forEach(it => {
      const k = it.full || it.thumb;
      if (k && !seen.has(k)) {
        seen.add(k);
        out.push(it);
      }
    });
    const getOv = (q, sig) => (typeof window.fetchOpenverseImages === 'function' ? window.fetchOpenverseImages(q, sig) : Promise.resolve([]));
    const ovOrigP = getOv(query, signal);
    const en = await this.translateImageQuery(query, signal).catch(() => null);
    const hasEn = !!en && en.toLowerCase() !== String(query || "").toLowerCase();
    const [ovOrig, ovEn, cmEn] = await Promise.all([
      ovOrigP,
      hasEn ? getOv(en, signal).catch(() => []) : Promise.resolve([]),
      hasEn ? this.fetchCommonsImages(en, signal).catch(() => []) : Promise.resolve([]),
    ]);
    push(ovEn);
    push(ovOrig);
    push(cmEn);
    if (out.length < 2) push(await this.fetchCommonsImages(query, signal).catch(() => []));
    return out.slice(0, 6);
  }

  /* Поиск через OpenRouter (Sonar + rerank). Возвращает null при недоступности. */
  async _searchViaOpenRouter(queries, signal) {
    const s = this.getAppSettings();
    if (!(s.orKey || '').trim() || typeof window.performOpenRouterWebSearch !== 'function') return null;
    const t = withTimeoutSignal(signal, 45000);
    try {
      const r = await window.performOpenRouterWebSearch(queries, t.signal);
      if (r && Array.isArray(r.sources) && r.sources.length) return r;
      return null;
    } catch (e) {
      if (isAbortError(e) && signal?.aborted) throw e;
      console.warn("[MoonSSS] OpenRouter Web Search error, falling back:", e);
      return null;
    } finally { t.clear(); }
  }

  /* Поиск через ProxyAPI Responses API (OpenAI web_search). Возвращает null при недоступности. */
  async _searchViaProxyApi(query, signal) {
    const s = this.getAppSettings();
    const key = (s.proxyKey || "").trim();
    if (!key) return null;
    const referer = typeof location !== 'undefined' && location.origin && !location.origin.startsWith("file") ? location.origin : "https://unichat2.sahbanovtimur228.workers.dev/ai";
    const t = withTimeoutSignal(signal, 30000);
    try {
      const resp = await fetch("https://api.proxyapi.ru/openai/v1/responses", {
        method: "POST",
        signal: t.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + key,
          "HTTP-Referer": referer,
          "X-Title": "MoonSSS",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          input: query,
          tools: [{
            type: "web_search",
            search_context_size: "low",
            user_location: {
              type: "approximate",
              approximate: { country: "RU", city: "Moscow", region: "Moscow" }
            },
          }],
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        let result = "";
        const sources = [];
        const seenUris = new Set();
        if (data.output && Array.isArray(data.output)) {
          for (const item of data.output) {
            if (item.type === "message" && item.content) {
              for (const part of item.content) {
                if (part.type === "output_text") result += part.text;
                if (part.type === "output_text" && part.annotations) {
                  for (const ann of part.annotations) {
                    if (ann.type === "url_citation") {
                      const uri = ann.url || "";
                      if (uri && !seenUris.has(uri)) {
                        seenUris.add(uri);
                        sources.push({ uri, title: ann.title || uri, snippet: ann.snippet || "" });
                      }
                    }
                  }
                }
              }
            }
          }
        }
        if (sources.length) return { result: result.trim(), sources };
      }
    } catch (e) {
      if (isAbortError(e) && signal?.aborted) throw e;
      console.warn("[MoonSSS] ProxyAPI Web Search error, falling back:", e);
    } finally { t.clear(); }
    return null;
  }

  /* Бесключевой поиск через Jina Search API. Возвращает null при недоступности. */
  async _searchViaJina(query, signal) {
    const t = withTimeoutSignal(signal, 20000);
    try {
      const jinaResp = await fetch(`https://s.jina.ai/${encodeURIComponent(query)}`, {
        method: "GET",
        headers: { "Accept": "application/json", "X-No-Cache": "true" },
        signal: t.signal
      });
      if (!jinaResp.ok) return null;
      const jData = await jinaResp.json();
      const sources = [];
      const seen = new Set();
      (jData.data || []).forEach(item => {
        if (item && item.url && !seen.has(item.url)) {
          seen.add(item.url);
          sources.push({
            uri: item.url,
            title: item.title || domainHost(item.url) || item.url,
            snippet: (item.description || item.content || '').slice(0, 320)
          });
        }
      });
      if (sources.length) return { result: sources.map(s => s.snippet).join("\n"), sources: sources.slice(0, 6) };
      return null;
    } catch (e) {
      if (isAbortError(e) && signal?.aborted) throw e;
      return null;
    } finally { t.clear(); }
  }

  /* Последний резерв: DuckDuckGo HTML через Jina Reader (без ключей и CORS). */
  async _searchViaDuckDuckGo(query, signal) {
    const t = withTimeoutSignal(signal, 20000);
    try {
      const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const resp = await fetch(`https://r.jina.ai/${ddgUrl}`, {
        method: "GET",
        headers: { "Accept": "text/markdown, text/plain", "X-No-Cache": "true" },
        signal: t.signal
      });
      if (!resp.ok) return null;
      const md = await resp.text();
      const sources = [];
      const seen = new Set();
      const linkRe = /\[([^\]\n]{3,160})\]\((https?:\/\/[^\s\)]+)\)/g;
      let lm;
      while ((lm = linkRe.exec(md)) !== null && sources.length < 8) {
        let url = lm[2].trim();
        // DDG оборачивает ссылки в редирект uddg=
        const um = url.match(/[?&]uddg=([^&]+)/);
        if (um) { try { url = decodeURIComponent(um[1]); } catch (_) { } }
        if (!/^https?:\/\//i.test(url)) continue;
        const host = domainHost(url);
        if (!host || /duckduckgo\.com$/i.test(host) || seen.has(url)) continue;
        seen.add(url);
        sources.push({ uri: url, title: lm[1].trim(), snippet: '' });
      }
      if (sources.length) return { result: '', sources };
      return null;
    } catch (e) {
      if (isAbortError(e) && signal?.aborted) throw e;
      return null;
    } finally { t.clear(); }
  }

  /* Каскад поиска по одному запросу: приоритет провайдера зависит от маршрута,
     затем — бесключевые резервы. Никогда не бросает исключение, кроме abort пользователя. */
  async performWebSearch(query, signal) {
    const q = String(query || '').trim();
    if (!q) return null;
    const s = this.getAppSettings();
    const route = typeof window.resolveApiRoute === 'function'
      ? window.resolveApiRoute(s, { api: "openrouter" })
      : { useProxy: !!s.proxyKey, useORDirect: !s.proxyKey && !!s.orKey };

    const orDirect = !!route.useORDirect && !!(s.orKey || '').trim();
    const primary = orDirect
      ? [() => this._searchViaOrServerTool(q, signal), () => this._searchViaOpenRouter([q], signal), () => this._searchViaProxyApi(q, signal)]
      : [() => this._searchViaProxyApi(q, signal), () => this._searchViaOpenRouter([q], signal)];
    const chain = [...primary, () => this._searchViaJina(q, signal), () => this._searchViaDuckDuckGo(q, signal)];

    for (const step of chain) {
      if (signal?.aborted) return null;
      try {
        const r = await step();
        if (r && Array.isArray(r.sources) && r.sources.length) return r;
      } catch (e) {
        if (isAbortError(e) && signal?.aborted) return null;
      }
    }
    return null;
  }

  async performWebSearches(queries, signal) {
    const qs = [...new Set((queries || []).map(q => typeof q === 'string' ? q.trim() : '').filter(Boolean))].slice(0, 4);
    if (!qs.length) return { sources: [], failed: false };

    const seen = new Set();
    const all = [];
    const pushSources = (r) => {
      if (!r || !Array.isArray(r.sources)) return;
      for (const src of r.sources) {
        if (!src || !src.uri || seen.has(src.uri)) continue;
        try {
          const p = new URL(src.uri);
          if (p.protocol !== "http:" && p.protocol !== "https:") continue;
        } catch (e) { continue; }
        seen.add(src.uri);
        all.push(src);
      }
    };

    // Приоритет: OpenRouter Server Tool (движок из настроек) выполняется внутри performWebSearch по каждому запросу

    // Пер-запросный каскад провайдеров
    const results = await Promise.all(qs.map(q => this.performWebSearch(q, signal).catch(() => null)));
    results.forEach(pushSources);
    return { sources: all, failed: all.length === 0 && !(signal && signal.aborted) };
  }

  formatSearchResults(results, queries, used, max, inTodo = false) {
    const dHost = typeof window.domainHost === 'function' ? window.domainHost : domainHost;
    const srcs = (results.sources || [])
      .map((s, i) => {
        const host = dHost(s.uri) || 'веб';
        const title = s.title || host;
        const snippet = s.snippet ? s.snippet.trim() : '(краткое описание отсутствует)';
        return `[ИСТОЧНИК #${i + 1}]\nЗаголовок: «${title}»\nДомен: ${host}\nПолный URL: ${s.uri}\nСниппет: ${snippet}`;
      })
      .join("\n\n");

    const remaining = (typeof max === 'number' && typeof used === 'number') ? Math.max(0, max - used) : null;
    const budget = remaining === null ? '' : (remaining > 0
      ? `\nОсталось поисковых раундов: ${remaining}.`
      : '\nЛимит поисковых раундов исчерпан — больше {web-search} вызывать нельзя, используй {fetch_url: [...]} для чтения найденных страниц или переходи к ответу.');

    const head = inTodo
      ? `=== РЕЗУЛЬТАТЫ ПОИСКА В ИНТЕРНЕТЕ ПО ШАГУ ПЛАНА (запросы: ${queries.join("; ")}) ===`
      : `=== РЕЗУЛЬТАТЫ ПОИСКА В ИНТЕРНЕТЕ (запросы: ${queries.join("; ")}) ===`;

    if (!srcs) {
      const advice = results.failed
        ? 'Поисковые провайдеры сейчас недоступны (сеть/ключи/лимиты).'
        : 'По запросу ничего не найдено.';
      return `${head}\n\n(источники не найдены)\n\n${advice}${remaining !== 0 ? ' Переформулируй запрос конкретнее (на английском, с ключевыми терминами, годом или названием продукта) и попробуй ещё один {web-search: [...]}, либо открой известные тебе URL через {fetch_url: [...]}.' : ''} Если ничего не помогает — честно скажи пользователю, что актуальные данные получить не удалось, и ответь на основе своих знаний с пометкой о возможной неактуальности.${budget}`;
    }

    const tail = inTodo
      ? 'Поиск выполнен, источники зафиксированы в карточке задачи. Если сниппетов достаточно — переходи к следующему шагу плана; если нужны подробности — открой 1–2 лучших URL через {fetch_url: [...]}.'
      : 'Если сниппетов достаточно для точного ответа — сформируй итоговый ответ со ссылками на источники. Если нужны детали (код, таблицы, документация) — открой 1–2 наиболее релевантных URL через {fetch_url: [...]}. Не повторяй тот же запрос.';

    return `${head}\n\n${srcs}\n\n${tail}${budget}`;
  }

  /* ═══════════════════════════════════════════════════════════════
     5. ЖИЗНЕННЫЙ ЦИКЛ И ИСПОЛНЕНИЕ: АРТЕФАКТЫ
     ═══════════════════════════════════════════════════════════════ */

  spawnArtifact(chat, aiMsg, raw) {
    if (!aiMsg.artifacts) aiMsg.artifacts = [];
    if (aiMsg.artifacts.length >= MAX_ARTIFACTS_PER_MSG) return;
    const parsed = this.parseArtifact(raw);
    if (!parsed) return;
    let version = 1;
    if (chat && Array.isArray(chat.messages)) {
      for (const msg of chat.messages) {
        for (const a of (msg.artifacts || [])) {
          if (a.artId === parsed.id && a.version >= version) version = a.version + 1;
        }
      }
    }
    const uidStr = 'art_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    aiMsg.artifacts.push({ id: uidStr, artId: parsed.id, title: parsed.title, type: parsed.type, code: parsed.code, version, ts: Date.now(), codeOpen: false });
    aiMsg.content = aiMsg.content.replace(raw, '[[ART:' + (aiMsg.artifacts.length - 1) + ']]');

    if (aiMsg.todoSessions && aiMsg.todoSessions.length) {
      const sess = aiMsg.todoSessions[aiMsg.todoSessions.length - 1];
      const activeTask = sess.tasks?.find(t => t.status === 'active') || sess.tasks?.find(t => t.status === 'pending');
      if (activeTask) {
        activeTask.artifact = { status: 'done', title: parsed.title, id: parsed.id };
        activeTask.status = 'done';
        activeTask.result = `Создан артефакт: «${parsed.title}»`;
        const cIdx = sess.tasks.indexOf(activeTask);
        if (sess.tasks[cIdx + 1] && sess.tasks[cIdx + 1].status === 'pending') {
          sess.tasks[cIdx + 1].status = 'active';
        }
      }
    }

    if (chat) chat.updatedAt = Date.now();
    this.saveAppState();
    this.refreshMsg(aiMsg);
  }

  trackStreamArtifacts(chat, aiMsg, trk) {
    const s = this.getAppSettings();
    if (!s.artifacts) return;
    if ((aiMsg.artifacts || []).length >= MAX_ARTIFACTS_PER_MSG) return;

    // Ищем открывающий тег по всему сообщению, если он еще не зафиксирован
    if (trk.start == null) {
      const oi = this.findArtifactOpen(aiMsg.content);
      if (oi !== -1) trk.start = oi;
    }

    if (trk.start != null) {
      const ci = aiMsg.content.indexOf('</artifact>', trk.start);
      if (ci !== -1) {
        const raw = aiMsg.content.slice(trk.start, ci + '</artifact>'.length);
        trk.start = null;
        this.spawnArtifact(chat, aiMsg, raw);
      }
    }
  }

  handlePendingArtifacts(chat, aiMsg) {
    const s = this.getAppSettings();
    if (!s.artifacts) return;
    if ((aiMsg.content || '').indexOf('<artifact') === -1) return;

    let room = MAX_ARTIFACTS_PER_MSG - (aiMsg.artifacts || []).length;

    // 1. Спавним все полностью закрытые тегами артефакты
    if (room > 0) {
      const re = /<artifact\b[^>]*>[\s\S]*?<\/artifact>/gi;
      let mch;
      while (room > 0 && (mch = re.exec(aiMsg.content)) !== null) {
        this.spawnArtifact(chat, aiMsg, mch[0]);
        room--;
        re.lastIndex = 0; // Сбрасываем индекс, так как spawnArtifact изменяет aiMsg.content
      }
    }

    // 2. Спасаем незакрытый артефакт: авто-закрываем его вместо удаления кода!
    const oi = this.findArtifactOpen(aiMsg.content);
    if (oi !== -1 && aiMsg.content.indexOf('</artifact>', oi) === -1 && room > 0) {
      const unclosedRaw = aiMsg.content.slice(oi).trim() + '\n</artifact>';
      this.spawnArtifact(chat, aiMsg, unclosedRaw);
    }
  }


  /* ═══════════════════════════════════════════════════════════════
     6. ЖИЗНЕННЫЙ ЦИКЛ И ИСПОЛНЕНИЕ: ПАРАЛЛЕЛЬНОЕ МЫШЛЕНИЕ
     ═══════════════════════════════════════════════════════════════ */

  spawnThinkSession(chat, aiMsg, rawCmd, tasks, location) {
    if (!aiMsg.thinkSessions) aiMsg.thinkSessions = [];
    const uidStr = 'th_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const session = {
      id: uidStr,
      status: 'running',
      tasks: tasks.map(t => ({
        text: t,
        status: 'thinking',
        result: '',
        startedAt: Date.now(),
        finishedAt: 0
      })),
      startedAt: Date.now(),
      finishedAt: 0
    };
    aiMsg.thinkSessions.push(session);
    const marker = '[[THINK:' + (aiMsg.thinkSessions.length - 1) + ']]';
    this._insertMarker(aiMsg, rawCmd, marker, location, '[запущено параллельное мышление]');
    if (chat) chat.updatedAt = Date.now();
    this.saveAppState();
    this.refreshMsg(aiMsg);
    return session;
  }

  buildThinkPrompt(task, history, partialContent, taskIndex, totalTasks) {
    const histText = history.map(m => {
      const role = m.role === 'user' ? 'Пользователь' : 'Ассистент';
      return role + ': ' + (m.content || '');
    }).join('\n');
    return [
      `Ты — модуль глубокого анализа. Ты работаешь в режиме параллельного мышления.`,
      `Это задача ${taskIndex} из ${totalTasks}. Другие задачи обрабатываются параллельно.`,
      '',
      '=== ИСТОРИЯ ДИАЛОГА ===',
      histText,
      '=== КОНЕЦ ИСТОРИИ ===',
      '',
      partialContent ? `=== ТЕКУЩИЙ ЧАСТИЧНЫЙ ОТВЕТ АССИСТЕНТА ===\n${partialContent}\n=== КОНЕЦ ЧАСТИЧНОГО ОТВЕТА ===\n` : '',
      'ТВОЯ ЗАДАЧА: ' + task,
      '',
      'Инструкции:',
      '- Сфокусируйся ТОЛЬКО на своей задаче. Не пытайся ответить на весь запрос пользователя.',
      '- Думай глубоко, структурированно, шаг за шагом.',
      '- В конце выдай краткий, но содержательный вывод по своей задаче.',
      '- Не используй команды {thinking_[...]}, {web-search:[...]} или {image_generation[...]}.',
      '- Отвечай на языке запроса пользователя.'
    ].join('\n');
  }

  async runParallelThink(chat, aiMsg, session, history, partialContent, signal) {
    const s = this.getAppSettings();
    const model = (typeof window.getModel === 'function' ? window.getModel(s.modelId) : (window.MODELS && window.MODELS[0])) || { id: s.modelId };
    const route = typeof window.resolveApiRoute === 'function' ? window.resolveApiRoute(s, model) : { useProxy: !!s.proxyKey, useORDirect: !s.proxyKey };

    if (!route.useProxy && !route.useORDirect) throw new Error('Нет API-ключа для параллельного мышления');
    const total = session.tasks.length;

    // Цепочка шлюзов для ветки: основной, затем резервный (если есть оба ключа)
    const hasProxy = !!(s.proxyKey || '').trim();
    const hasOR = !!(s.orKey || '').trim();
    const gateways = [route.useORDirect ? 'openrouter' : 'proxy'];
    if ((s.apiSource || 'auto') === 'auto' && hasProxy && hasOR) gateways.push(gateways[0] === 'proxy' ? 'openrouter' : 'proxy');

    const streamBranch = async (gateway, thinkHistory, onText, sig) => {
      const noop = () => { };
      if (gateway === 'openrouter' && typeof window.streamOpenRouterDirect === 'function') {
        return window.streamOpenRouterDirect(model, thinkHistory, { onText, onThink: noop, onImage: noop, onReasoningDetails: noop, onWebSearch: noop, signal: sig }, null, chat);
      }
      if (model.api === 'anthropic' && typeof window.streamAnthropic === 'function') {
        return window.streamAnthropic(model, thinkHistory, { onText, onThink: noop, onWebSearch: noop, wsEnabled: false, webSearchContext: null, signal: sig }, null);
      }
      if (model.api === 'gemini' && typeof window.streamGemini === 'function') {
        return window.streamGemini(model, thinkHistory, { onText, onThink: noop, onWebSearch: noop, wsEnabled: false, webSearchContext: null, signal: sig }, null);
      }
      if (typeof window.streamOpenRouter === 'function') {
        return window.streamOpenRouter(model, thinkHistory, { onText, onThink: noop, onImage: noop, onReasoningDetails: noop, onWebSearch: noop, wsEnabled: false, webSearchContext: null, signal: sig, direct: gateway === 'openrouter' }, null, chat);
      }
      throw new Error('Нет доступного потокового клиента');
    };

    const BRANCH_TIMEOUT_MS = 180000;
    const promises = session.tasks.map((task, i) => {
      return new Promise(async (resolve) => {
        const prompt = this.buildThinkPrompt(task.text, history, partialContent, i + 1, total);
        const thinkHistory = [{ role: 'user', content: prompt }];
        let lastErr = null;
        for (let g = 0; g < gateways.length; g++) {
          if (signal && signal.aborted) break;
          let result = '';
          const t = withTimeoutSignal(signal, BRANCH_TIMEOUT_MS);
          try {
            await streamBranch(gateways[g], thinkHistory, tx => { result += tx; }, t.signal);
            if (!result.trim()) throw new Error('Пустой ответ ветки');
            task.status = 'done';
            task.result = result.trim();
            lastErr = null;
            break;
          } catch (e) {
            lastErr = e;
            if (signal && signal.aborted) break;
            // Частичный результат при таймауте лучше, чем ничего
            if (isAbortError(e) && result.trim().length > 80) {
              task.status = 'done';
              task.result = result.trim() + '\n\n[ветка остановлена по таймауту, результат частичный]';
              lastErr = null;
              break;
            }
          } finally { t.clear(); }
        }
        if (lastErr || (task.status !== 'done')) {
          task.status = 'error';
          task.result = (signal && signal.aborted)
            ? 'Прервано пользователем'
            : 'Ошибка: ' + ((lastErr && lastErr.message) || String(lastErr || 'неизвестная ошибка'));
        }
        task.finishedAt = Date.now();
        this.refreshMsg(aiMsg);
        resolve();
      });
    });
    await Promise.allSettled(promises);
    session.finishedAt = Date.now();
    const errors = session.tasks.filter(t => t.status === 'error').length;
    session.status = errors === session.tasks.length ? 'error' : 'done';
    this.saveAppState();
    this.refreshMsg(aiMsg);
    return session;
  }

  formatThinkResults(session) {
    const lines = session.tasks.map((t, i) => {
      const time = t.finishedAt && t.startedAt ? ((t.finishedAt - t.startedAt) / 1000).toFixed(1) : '?';
      return `Задача ${i + 1}: «${t.text}»\nСтатус: ${t.status === 'done' ? 'завершена' : 'ошибка'} (${time}с)\nРезультат: ${t.result || '—'}`;
    }).join('\n\n');
    const doneCount = session.tasks.filter(t => t.status === 'done').length;
    const allFailed = doneCount === 0;
    const tail = allFailed
      ? 'Все ветки завершились ошибкой (сеть/лимиты провайдера). НЕ вызывай {thinking_[...]} повторно — выполни анализ самостоятельно, последовательно, в обычном ответе.'
      : (doneCount < session.tasks.length
        ? 'Часть веток не завершилась — учти это и при необходимости дополни недостающие аспекты самостоятельно. Не запускай повторное параллельное мышление по тем же задачам.'
        : 'Проанализируй все результаты выше, синтезируй выводы и продолжи свой ответ. Повторный вызов {thinking_[...]} допустим только для принципиально новых, ещё не рассмотренных вопросов.');
    return [
      '=== РЕЗУЛЬТАТЫ ПАРАЛЛЕЛЬНОГО МЫШЛЕНИЯ ===',
      lines,
      '=== КОНЕЦ РЕЗУЛЬТАТОВ ===',
      '',
      tail
    ].join('\n');
  }

  /* ═══════════════════════════════════════════════════════════════
     7. ЖИЗНЕННЫЙ ЦИКЛ И ИСПОЛНЕНИЕ: ПЕСОЧНИЦА КОДА (ELECTRON)
     ═══════════════════════════════════════════════════════════════ */

  collectExecFiles(chat, aiMsg) {
    if (!chat || !Array.isArray(chat.messages)) return [];
    const aiIdx = chat.messages.findIndex(mm => mm.id === aiMsg.id);
    for (let i = aiIdx - 1; i >= 0; i--) {
      const mm = chat.messages[i];
      if (mm.role === 'user') {
        return (mm.attachments || [])
          .filter(a => (a.kind === 'file' || a.kind === 'text') && typeof a.text === 'string')
          .map(a => ({ name: String(a.name || 'file.txt').slice(0, 80), text: a.text }));
      }
    }
    return [];
  }

  spawnCodeExecution(chat, aiMsg, cmd, rawCmd, location) {
    if (!aiMsg.executions) aiMsg.executions = [];
    const s = this.getAppSettings();
    const hasElectron = typeof window !== 'undefined' && !!window.electronAPI && typeof window.electronAPI.execStart === 'function';
    const useOpenRouterShell = s.codeExecEngine === 'openrouter_shell' || (!hasElectron && Boolean(s.orKey || s.proxyKey));

    const uidStr = 'ex_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const x = {
      id: uidStr,
      lang: cmd.lang,
      code: cmd.code,
      stdin: typeof cmd.stdin === 'string' ? cmd.stdin.slice(0, 100000) : '',
      cwd: typeof cmd.cwd === 'string' ? cmd.cwd.trim().slice(0, 500) : '',
      timeout: Math.max(1, Math.min(120, parseInt(cmd.timeout, 10) || 30)),
      status: 'running',
      engine: useOpenRouterShell ? 'openrouter_shell' : 'electron',
      output: [],
      exitCode: null,
      startedAt: Date.now(),
      finishedAt: 0,
      summary: '',
      codeOpen: false
    };
    aiMsg.executions.push(x);
    this.execRuntimeFiles.set(x.id, this.collectExecFiles(chat, aiMsg));
    const marker = '[[EXEC:' + (aiMsg.executions.length - 1) + ']]';
    this._insertMarker(aiMsg, rawCmd, marker, location, '[код выполняется в песочнице]');
    aiMsg.content = (aiMsg.content || '').replace(marker + '\n}', marker).replace(marker + ' }', marker);
    if (chat) chat.updatedAt = Date.now();
    this.saveAppState();
    this.refreshMsg(aiMsg);
    this.startTicker();
    return x;
  }

  findMsgByExec(x) {
    const chat = this.getActiveChat();
    if (!chat || !Array.isArray(chat.messages)) return null;
    for (const m of chat.messages) if ((m.executions || []).includes(x)) return m;
    return null;
  }

  scheduleExecRefresh(m) {
    if (this.execRefreshTimer || !m) return;
    this.execRefreshTimer = setTimeout(() => {
      this.execRefreshTimer = null;
      this.refreshMsg(m);
      const msgEl = document.querySelector('[data-id="' + m.id + '"]');
      if (msgEl) msgEl.querySelectorAll('.exec-card.live .exec-output').forEach(o => { o.scrollTop = o.scrollHeight; });
    }, 120);
  }

  async runOpenRouterHostedShell(x, externalSignal) {
    const m = this.findMsgByExec(x);
    const s = this.getAppSettings();
    const key = (s.orKey || s.proxyKey || '').trim().replace(/[^\x21-\x7E]/g, '');
    const curChat = this.getActiveChat();
    x.engine = 'openrouter_shell';

    if (!key) {
      x.status = 'error';
      x.exitCode = -1;
      x.finishedAt = Date.now();
      x.output.push({ type: 'sys', data: 'Для запуска в изолированном облачном контейнере OpenRouter Sandbox укажите API-ключ в настройках.' });
      x.summary = 'Отсутствует API-ключ OpenRouter';
      this.execRuntimeFiles.delete(x.id);
      if (m) this.refreshMsg(m);
      return x;
    }

    x.output.push({ type: 'sys', data: '▸ Инициализация OpenRouter Hosted Linux Sandbox (openrouter:shell)…' });
    this.scheduleExecRefresh(m);

    const runtimeFiles = this.execRuntimeFiles.get(x.id) || [];
    let scriptPreamble = '';
    if (runtimeFiles.length) {
      runtimeFiles.forEach(f => {
        const safeName = f.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
        scriptPreamble += `cat << 'EOF' > ${safeName}\n${f.text}\nEOF\n`;
      });
    }

    let bashCommand = '';
    const stdinPipe = x.stdin ? `cat << 'EOF' | ` : '';
    if (x.lang === 'python') {
      bashCommand = `${scriptPreamble}${stdinPipe}python3 - << 'EOF'\n${x.code}\nEOF`;
    } else if (x.lang === 'node') {
      bashCommand = `${scriptPreamble}${stdinPipe}node - << 'EOF'\n${x.code}\nEOF`;
    } else {
      bashCommand = `${scriptPreamble}${x.code}`;
    }

    const sessionId = curChat ? ('sess_' + String(curChat.id).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32)) : undefined;

    const payload = {
      model: 'openai/gpt-4o-mini',
      tools: [
        {
          type: 'openrouter:shell',
          parameters: {
            engine: 'openrouter'
          }
        }
      ],
      input: `Run this shell command in the hosted Linux sandbox and return the raw output:\n\`\`\`bash\n${bashCommand}\n\`\`\``,
      stream: true,
      max_output_tokens: 16000
    };
    if (sessionId) {
      payload.session_id = sessionId;
    }

    const t = withTimeoutSignal(externalSignal, Math.max(45000, (x.timeout || 30) * 1000 + 15000));
    try {
      const resp = await fetch('https://openrouter.ai/api/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + key,
          'HTTP-Referer': 'https://unichat2.sahbanovtimur228.workers.dev',
          'X-Title': 'MoonSSS'
        },
        body: JSON.stringify(payload),
        signal: t.signal
      });

      if (!resp.ok) {
        let errText = `HTTP ${resp.status}`;
        try {
          const j = await resp.json();
          errText = j.error?.message || j.message || errText;
        } catch (_) { }
        throw new Error(errText);
      }

      let capturedStdout = '';
      let capturedStderr = '';
      let detectedExitCode = null;

      if (resp.body) {
        const reader = resp.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buf = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data:')) continue;
            const dataStr = trimmed.slice(5).trim();
            if (dataStr === '[DONE]') break;

            try {
              const eventObj = JSON.parse(dataStr);
              if (eventObj.type === 'response.output_item.done' && eventObj.item) {
                const item = eventObj.item;
                if (item.type === 'openrouter:shell' || item.type === 'shell_call') {
                  if (item.stdout) {
                    capturedStdout += item.stdout;
                    x.output.push({ type: 'stdout', data: item.stdout });
                  }
                  if (item.stderr) {
                    capturedStderr += item.stderr;
                    x.output.push({ type: 'stderr', data: item.stderr });
                  }
                  const codeVal = typeof item.exit_code === 'number' ? item.exit_code : (item.outcome?.exit_code ?? (item.outcome === 'timeout' ? 124 : 0));
                  detectedExitCode = codeVal;
                  this.scheduleExecRefresh(m);
                }
              } else if (eventObj.type === 'response.output_text.delta' && eventObj.delta) {
                if (!capturedStdout && !capturedStderr && eventObj.delta) {
                  x.output.push({ type: 'stdout', data: eventObj.delta });
                  this.scheduleExecRefresh(m);
                }
              }
            } catch (_) { }
          }
        }
      }

      x.finishedAt = Date.now();
      x.exitCode = detectedExitCode !== null ? detectedExitCode : 0;
      x.status = x.exitCode === 0 ? 'done' : 'error';
      x.summary = x.exitCode === 0
        ? 'Успешно в OpenRouter Sandbox за ' + fmtDur(x.finishedAt - x.startedAt)
        : 'Код возврата ' + x.exitCode + ' (OpenRouter Sandbox)';
    } catch (err) {
      x.finishedAt = Date.now();
      if (isAbortError(err)) {
        x.status = 'timeout';
        x.exitCode = 124;
        x.output.push({ type: 'sys', data: '[Таймаут] Превышено время выполнения в OpenRouter Sandbox.' });
        x.summary = 'Таймаут OpenRouter Sandbox';
      } else {
        x.status = 'error';
        x.exitCode = -1;
        x.output.push({ type: 'sys', data: '✗ Ошибка OpenRouter Sandbox: ' + (err.message || err) });
        x.summary = 'Ошибка контейнера';
      }
    } finally {
      t.clear();
      this.execRuntimeFiles.delete(x.id);
      if (m) this.refreshMsg(m);
    }
    return x;
  }

  async runCodeExecution(x, externalSignal) {
    const m = this.findMsgByExec(x);
    const s = this.getAppSettings();
    const hasElectron = typeof window !== 'undefined' && !!window.electronAPI && typeof window.electronAPI.execStart === 'function';
    const hasOpenRouterKey = Boolean((s.orKey || s.proxyKey || '').trim());
    const preferOpenRouter = s.codeExecEngine === 'openrouter_shell' || (!hasElectron && hasOpenRouterKey);

    if (!hasElectron && !hasOpenRouterKey) {
      x.status = 'error';
      x.exitCode = -1;
      x.finishedAt = Date.now();
      x.output.push({ type: 'sys', data: 'Для выполнения кода подключите API-ключ OpenRouter (облачная Linux-песочница) или используйте десктоп-версию Electron.' });
      x.summary = 'Среда не поддерживает выполнение кода';
      this.execRuntimeFiles.delete(x.id);
      if (m) this.refreshMsg(m);
      return x;
    }

    if (preferOpenRouter) {
      return await this.runOpenRouterHostedShell(x, externalSignal);
    }

    return new Promise(resolve => {
      let done = false;
      let watchdog = null;
      const end = () => {
        if (done) return;
        done = true;
        if (watchdog) { clearTimeout(watchdog); watchdog = null; }
        const un = this.execUnsubs.get(x.id);
        if (un) { try { un(); } catch (e) { } this.execUnsubs.delete(x.id); }
        this.execForce.delete(x.id);
        this.execRuntimeFiles.delete(x.id);
        if (m) this.refreshMsg(m);
        resolve(x);
      };

      this.execForce.set(x.id, (status, line, summary) => {
        if (done) return;
        x.status = status;
        x.exitCode = -1;
        x.finishedAt = Date.now();
        x.output.push({ type: 'sys', data: line });
        x.summary = summary;
        end();
      });

      this.execUnsubs.set(x.id, window.electronAPI.onExecEvent(p => {
        if (p.id !== x.id) return;
        if (p.type === 'stdout' || p.type === 'stderr') {
          x.output.push({ type: p.type, data: p.data });
          this.scheduleExecRefresh(m);
        } else if (p.type === 'timeout') {
          x.status = 'timeout'; x.exitCode = -1; x.finishedAt = Date.now();
          x.output.push({ type: 'sys', data: '[Таймаут] ' + p.data });
          x.summary = 'Превышен таймаут — процесс убит';
          end();
        } else if (p.type === 'error') {
          x.status = 'error'; x.exitCode = -1; x.finishedAt = Date.now();
          x.output.push({ type: 'sys', data: '✗ ' + p.data });
          x.summary = p.data;
          end();
        } else if (p.type === 'exit') {
          x.exitCode = p.code; x.finishedAt = Date.now();
          x.status = p.code === 0 ? 'done' : 'error';
          x.summary = p.code === 0 ? 'Успешно за ' + fmtDur(x.finishedAt - x.startedAt) : 'Код возврата ' + p.code;
          end();
        } else if (p.type === 'killed') {
          x.status = 'killed'; x.exitCode = -1; x.finishedAt = Date.now();
          x.output.push({ type: 'sys', data: '■ Процесс остановлен' });
          x.summary = 'Остановлено пользователем';
          end();
        }
      }));

      if (externalSignal) {
        const onAbort = () => {
          try { window.electronAPI.execKill(x.id); } catch (e) { }
          setTimeout(() => { const f = this.execForce.get(x.id); if (f) f('killed', '■ Процесс остановлен', 'Остановлено пользователем'); }, 1500);
        };
        if (externalSignal.aborted) onAbort();
        else externalSignal.addEventListener('abort', onAbort, { once: true });
      }

      try {
        let codeToRun = x.code;
        if (x.lang === 'python') {
          const autoPipPreamble = `import sys as _sys, subprocess as _subp
class _MoonAutoInstaller:
    _aliases = {'bs4': 'beautifulsoup4', 'BeautifulSoup': 'beautifulsoup4', 'PIL': 'pillow', 'cv2': 'opencv-python', 'yaml': 'pyyaml', 'sklearn': 'scikit-learn', 'lxml': 'lxml'}
    _checked = set()
    @classmethod
    def find_spec(cls, fullname, path=None, target=None):
        root = fullname.split('.')[0]
        if root in cls._checked:
            return None
        cls._checked.add(root)
        for f in _sys.meta_path:
            if f is not cls:
                try:
                    if f.find_spec(fullname, path, target) is not None:
                        return None
                except Exception:
                    pass
        pip_pkg = cls._aliases.get(root, root)
        try:
            _subp.run([_sys.executable, '-m', 'pip', 'install', pip_pkg, '--quiet'], check=True)
            for f in _sys.meta_path:
                if f is not cls:
                    try:
                        spec = f.find_spec(fullname, path, target)
                        if spec is not None:
                            return spec
                    except Exception:
                        pass
        except Exception:
            pass
        return None
if not any(getattr(f, '__name__', '') == '_MoonAutoInstaller' for f in _sys.meta_path):
    _sys.meta_path.insert(0, _MoonAutoInstaller)
`;
          codeToRun = autoPipPreamble + codeToRun;
        }
        window.electronAPI.execStart({ id: x.id, lang: x.lang, code: codeToRun, stdin: x.stdin, cwd: x.cwd || undefined, timeout: Math.max(x.timeout || 30, 45), files: this.execRuntimeFiles.get(x.id) || [] });
        x.output.push({ type: 'sys', data: '▸ Запуск ' + (EXEC_LANG_LABELS[x.lang] || x.lang) + '…' });
        watchdog = setTimeout(() => {
          const f = this.execForce.get(x.id);
          if (f) f('timeout', '[Таймаут] Песочница не ответила за ' + ((Math.max(x.timeout || 30, 45)) + 7) + 'с.', 'Нет ответа от песочницы');
        }, (Math.max(x.timeout || 30, 45)) * 1000 + 7000);
        if (m) this.scheduleExecRefresh(m);
      } catch (e) {
        x.status = 'error'; x.exitCode = -1; x.finishedAt = Date.now();
        x.output.push({ type: 'sys', data: '✗ Не удалось запустить: ' + (e && e.message || e) });
        x.summary = 'Ошибка запуска';
        end();
      }
    });
  }

  formatExecResult(x, attempt = 1, maxAttempts = 3) {
    const stdout = (x.output || []).filter(c => c.type === 'stdout').map(c => c.data).join('');
    const stderr = (x.output || []).filter(c => c.type === 'stderr').map(c => c.data).join('');
    const sys = (x.output || []).filter(c => c.type === 'sys').map(c => c.data).join('\n');
    const dur = x.finishedAt && x.startedAt ? ((x.finishedAt - x.startedAt) / 1000).toFixed(2) + 's' : '?';

    const sandboxUnavailable = /Песочница доступна только/i.test(sys);
    if (sandboxUnavailable) {
      return [
        '=== ВЫПОЛНЕНИЕ КОДА НЕДОСТУПНО ===',
        'Текущая среда (веб/мобильная версия) не имеет песочницы для запуска кода. Команда {execute: ...} здесь не работает — НЕ вызывай её снова в этом ответе.',
        'Что делать вместо этого:',
        '• Покажи код пользователю в markdown-блоке и объясни ожидаемый вывод, честно пометив, что он не проверялся запуском.',
        '• Если задача визуальная/интерактивная — оформи её как <artifact> (HTML/JS), он запускается в песочнице браузера.',
        '• Если нужен точный расчёт — выполни его вручную, пошагово, с проверкой.',
        '=== КОНЕЦ ==='
      ].join('\n');
    }

    let tail;
    if (x.status === 'done' && x.exitCode === 0) {
      tail = 'Код выполнен успешно. Проанализируй вывод и продолжи ответ с того места, где остановился. Не запускай тот же код повторно без изменений.';
    } else if (x.status === 'timeout') {
      tail = attempt < maxAttempts
        ? `Процесс превысил таймаут. Ищи бесконечный цикл, ожидание input() без "stdin", тяжёлые сетевые вызовы или установку крупных пакетов. Оптимизируй код или увеличь "timeout" (до 120) и повтори (попытка ${attempt + 1} из ${maxAttempts}).`
        : 'Процесс снова превысил таймаут — лимит попыток исчерпан. Не запускай код ещё раз: объясни пользователю причину и предложи исправленный код без выполнения.';
    } else if (x.status === 'killed') {
      tail = 'Процесс остановлен пользователем. Не перезапускай его автоматически — продолжи ответ на основе имеющихся данных.';
    } else {
      const hint = /ModuleNotFoundError|No module named|Cannot find module/i.test(stderr)
        ? ' Похоже, не хватает библиотеки: в Python недостающие пакеты доустанавливаются автоматически, в Node используй только встроенные модули.'
        : (/SyntaxError|IndentationError/i.test(stderr) ? ' Синтаксическая ошибка — проверь экранирование \\n и \\" внутри JSON-строки "code".' : '');
      tail = attempt < maxAttempts
        ? `Код завершился с ошибкой.${hint} Исправь причину по STDERR и запусти ещё раз (попытка ${attempt + 1} из ${maxAttempts}).`
        : 'Код снова упал — лимит попыток исчерпан. Не запускай его ещё раз: объясни пользователю ошибку и предложи исправление без выполнения.';
    }

    return [
      '=== РЕЗУЛЬТАТ ВЫПОЛНЕНИЯ КОДА (' + String(x.lang || '?').toUpperCase() + ') ===',
      'Статус: ' + x.status + ' · exit code ' + (x.exitCode ?? '?') + ' · время ' + dur,
      x.stdin ? 'STDIN (что ты ввёл в терминал): ' + x.stdin.replace(/\n/g, ' ⏎ ') : '',
      '',
      'STDOUT:',
      stdout || '(пусто)',
      '',
      'STDERR:',
      stderr || '(пусто)',
      '',
      '=== КОНЕЦ РЕЗУЛЬТАТА ===',
      tail
    ].join('\n');
  }

  /* ═══════════════════════════════════════════════════════════════
     8. ГЛАВНЫЙ СИНХРОННЫЙ РЕНДЕРЕР ТЕКСТА И ИНСТРУМЕНТОВ
     ═══════════════════════════════════════════════════════════════ */

  renderContentWithSearches(content, searches) {
    content = this.stripWsCommands(content || '');
    if (!searches || !searches.length) return typeof window.mdToHtml === 'function' ? window.mdToHtml(content) : `<p>${esc(content)}</p>`;
    const parts = content.split(/\[\[WS:(\d+)\]\]/);
    let html = '';
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 0) {
        if (parts[i].trim()) html += typeof window.mdToHtml === 'function' ? window.mdToHtml(parts[i]) : `<p>${esc(parts[i])}</p>`;
      } else {
        const wsIdx = parseInt(parts[i], 10);
        html += `<div data-tool-slot="WS:${wsIdx}"></div>`;
      }
    }
    return html;
  }

  formatThinkingHtml(text) {
    if (!text || typeof text !== 'string') return '';
    let clean = text.trim();
    clean = clean.replace(/<\/?think>/gi, '');
    clean = clean.replace(/\[запущено параллельное мышление\]/g, '⟡ параллельное мышление запущено');

    // Защищаем кодовые блоки от превращения в живой DOM
    const codeBlocks = [];
    clean = clean.replace(/(```[\s\S]*?```|`[^`\n]+`)/g, (match) => {
      const placeholder = `@@THINK_CODE_${codeBlocks.length}@@`;
      codeBlocks.push(match);
      return placeholder;
    });

    // Экранируем все сырые HTML-теги вне блоков кода
    clean = clean.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Возвращаем экранированные кодовые блоки обратно
    clean = clean.replace(/@@THINK_CODE_(\d+)@@/g, (_, idx) => {
      const rawBlock = codeBlocks[Number(idx)] || '';
      return rawBlock.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    });

    let html = '';
    if (typeof window.mdToHtml === 'function') {
      html = window.mdToHtml(clean);
    } else {
      html = esc(clean).replace(/\n/g, '<br>');
    }

    // Оборачиваем кодовые блоки в изолированный моноширинный контейнер без тяжелых панелей инструментов
    html = html
      .replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '<div class="think-plain-text">$1</div>')
      .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '<div class="think-plain-text">$1</div>')
      .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '<span class="think-inline-text">$1</span>');

    return html;
  }

  renderThinkingWithSearches(thinking, searches) {
    let txt = String(thinking || '').trim();
    if (!searches || !searches.length) {
      return '<div class="think-body-inner">' + this.formatThinkingHtml(txt) + '</div>';
    }
    const parts = txt.split(/\[\[WS:(\d+)\]\]/);
    let html = '<div class="think-body-inner">';
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 0) {
        if (parts[i].trim()) html += this.formatThinkingHtml(parts[i]);
      } else {
        html += this.renderInlineSearchCard(searches[parseInt(parts[i], 10)], parseInt(parts[i], 10));
      }
    }
    html += '</div>';
    return html;
  }

  renderToolCard(kind, idx, m) {
    if (!m) return '';
    if (kind === 'IMGRQ') return this.renderImgRequestCard((m.imageRequests || [])[idx], idx);
    if (kind === 'WS') return this.renderInlineSearchCard((m.inlineSearches || [])[idx], idx);
    if (kind === 'ART') return this.renderArtifactCard((m.artifacts || [])[idx], idx);
    if (kind === 'THINK') return this.renderThinkCard((m.thinkSessions || [])[idx], idx);
    if (kind === 'EXEC') return this.renderExecCard((m.executions || [])[idx], idx);
    if (kind === 'FETCH_URL') return this.renderUrlFetchCard((m.urlFetches || [])[idx], idx);
    if (kind === 'TODO') return this.renderTodoCard((m.todoSessions || [])[idx], idx);
    return '';
  }

  getToolCardHash(kind, idx, m) {
    if (!m) return '0';
    if (kind === 'ART') {
      const a = (m.artifacts || [])[idx];
      return a ? `${a.id}_${a.version}_${a.title}_${a.code?.length || 0}` : '0';
    }
    if (kind === 'ART_SHAPING') {
      return 'shaping_active';
    }
    if (kind === 'IMGRQ') {
      const r = (m.imageRequests || [])[idx];
      return r ? `${r.id}_${r.status}_${Math.round(r.progress || 0)}_${r.dataUrl ? 1 : 0}_${(r.images || []).length}` : '0';
    }
    if (kind === 'WS') {
      const s = (m.inlineSearches || [])[idx];
      return s ? `${s.status}_${(s.queries || []).length}_${(s.sources || []).length}_${s.collapsed ? 1 : 0}` : '0';
    }
    if (kind === 'THINK') {
      const s = (m.thinkSessions || [])[idx];
      return s ? `${s.id}_${s.status}_${s.tasks.map(t => t.status + (t.result ? 1 : 0)).join(',')}` : '0';
    }
    if (kind === 'EXEC') {
      const x = (m.executions || [])[idx];
      return x ? `${x.id}_${x.status}_${x.exitCode}_${x.codeOpen ? 1 : 0}_${(x.output || []).length}` : '0';
    }
    if (kind === 'FETCH_URL') {
      const s = (m.urlFetches || [])[idx];
      return s ? `${s.id}_${s.status}_${s.urls.map(u => `${u.status}_${Math.round(u.percent || 0)}_${u.disabled ? 1 : 0}_${u.expanded ? 1 : 0}_${(u.content || '').length}`).join(',')}` : '0';
    }
    if (kind === 'TODO') {
      const s = (m.todoSessions || [])[idx];
      return s ? `${s.id}_${s.status}_${s.isCollapsed ? 1 : 0}_${s.tasks.map(t => `${t.status}_${t.result || ''}_${Math.round(t.urlFetch?.percent || 0)}_${t.search?.status || ''}`).join(',')}` : '0';
    }
    return '0';
  }

  reconcileToolSlots(container, m) {
    if (!container) return;
    const slots = container.querySelectorAll('[data-tool-slot]');
    if (!slots.length) return;

    if (!container._toolNodeCache) container._toolNodeCache = new Map();
    const cache = container._toolNodeCache;

    slots.forEach(slot => {
      const slotKey = slot.dataset.toolSlot;
      const [kind, idxStr] = slotKey.split(':');
      const idx = parseInt(idxStr, 10);
      const currentHash = this.getToolCardHash(kind, idx, m);

      const existingNode = cache.get(slotKey);
      if (existingNode && existingNode.dataset.cardHash === currentHash) {
        slot.replaceWith(existingNode);
      } else {
        const temp = document.createElement('div');
        if (kind === 'ART_SHAPING') {
          temp.innerHTML = '<div class="artifact-thinking-pill no-sel" data-art-shaping="1" data-tool-mount="ART_SHAPING:0"><span class="artifact-orb-slot"><canvas class="artifact-orb-canvas" width="64" height="64"></canvas></span><div class="artifact-thinking-info"><span class="artifact-thinking-label">Строю приложение…</span><span class="artifact-thinking-sub">Подстраиваю под ваши требования</span></div></div>';
        } else {
          temp.innerHTML = this.renderToolCard(kind, idx, m);
        }
        const freshNode = temp.firstElementChild;
        if (freshNode) {
          freshNode.dataset.toolMount = slotKey;
          freshNode.dataset.cardHash = currentHash;
          cache.set(slotKey, freshNode);
          slot.replaceWith(freshNode);
          if (kind === 'WS' && typeof window.enhanceSearchOrbs === 'function') {
            window.enhanceSearchOrbs(freshNode);
          }
        } else {
          slot.remove();
        }
      }
    });
  }

  renderMsgContent(content, m) {
    content = this.stripImgCommands(content || '');
    content = this.stripUrlFetchCommands(content);
    content = this.stripTodoCommands(content);
    if (!/\[\[(ART|IMGRQ|WS|THINK|EXEC|FETCH_URL|TODO):\d+\]\]/.test(content)) return this.renderContentWithSearches(content, m ? m.inlineSearches : null);
    const parts = String(content).split(/\[\[(ART|IMGRQ|WS|THINK|EXEC|FETCH_URL|TODO):(\d+)\]\]/);
    let html = '';
    for (let i = 0; i < parts.length; i += 3) {
      const txt = parts[i];
      if (txt && txt.trim()) html += this.renderContentWithSearches(txt, m ? m.inlineSearches : null);
      const kind = parts[i + 1];
      if (!kind) break;
      const idx = parseInt(parts[i + 2], 10);
      html += `<div data-tool-slot="${kind}:${idx}"></div>`;
    }
    return html;
  }

  /* ── Парсер медиаплееров ── */

  parseTimeParam(t) {
    if (!t) return 0;
    if (/^\d+$/.test(t)) return parseInt(t, 10);
    let sec = 0;
    const h = t.match(/(\d+)\s*h/i);
    const m = t.match(/(\d+)\s*m/i);
    const s = t.match(/(\d+)\s*s/i);
    if (h) sec += parseInt(h[1], 10) * 3600;
    if (m) sec += parseInt(m[1], 10) * 60;
    if (s) sec += parseInt(s[1], 10);
    return sec || 0;
  }

  parseMediaLink(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return null;
    let sanitized = rawUrl.trim().replace(/^[<\(\[\{"']+|[>\)\]\}"']+$/g, '').replace(/[,\.;:!]+$/, '');
    let urlObj;
    try { urlObj = new URL(sanitized); } catch (e) { return null; }
    if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') return null;
    const href = urlObj.href;
    const host = urlObj.hostname.toLowerCase().replace(/^www\./, '');

    // RuTube
    if (host === 'rutube.ru' || host.endsWith('.rutube.ru')) {
      const plMatch = (urlObj.pathname + urlObj.search).match(/(?:plst|playlists?|playlist_id)[=\/]([a-zA-Z0-9_-]+)/i);
      if (plMatch && plMatch[1]) {
        const plId = plMatch[1].replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
        const pParam = urlObj.searchParams.get('p');
        const q = new URLSearchParams();
        if (pParam) q.set('p', pParam);
        const queryStr = q.toString() ? `?${q.toString()}` : '';
        return { type: 'rutube', provider: 'Rutube Плейлист', icon: 'i-play', url: href, embedUrl: `https://rutube.ru/play/embed/plst/${encodeURIComponent(plId)}/${queryStr}` };
      }
      const vMatch = urlObj.pathname.match(/\/(?:video(?:\/private)?|play\/embed|shorts)\/([a-zA-Z0-9_-]{5,64})/i) || urlObj.pathname.match(/\/([a-fA-F0-9]{32})/i);
      let rutubeId = vMatch ? vMatch[1] : '';
      if (!rutubeId) {
        const parts = urlObj.pathname.split('/').filter(Boolean);
        const reserved = ['person', 'channel', 'user', 'tags', 'feeds', 'category', 'live', 'topic', 'plst', 'playlist', 'playlists'];
        if (parts.length > 0 && !reserved.includes(parts[0].toLowerCase())) rutubeId = parts[parts.length - 1] || '';
      }
      rutubeId = (rutubeId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
      if (rutubeId && rutubeId.length >= 5) {
        const pParam = urlObj.searchParams.get('p');
        const tParam = urlObj.searchParams.get('t') || urlObj.searchParams.get('time');
        const q = new URLSearchParams();
        if (pParam) q.set('p', pParam);
        if (tParam) { const sec = this.parseTimeParam(tParam); if (sec) q.set('t', sec); }
        const queryStr = q.toString() ? `?${q.toString()}` : '';
        return { type: 'rutube', provider: 'Rutube', icon: 'i-play', url: href, embedUrl: `https://rutube.ru/play/embed/${encodeURIComponent(rutubeId)}/${queryStr}` };
      }
    }

    // YouTube
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com' || host === 'youtu.be' || host === 'youtube-nocookie.com' || host.endsWith('.youtube.com')) {
      const listParam = urlObj.searchParams.get('list');
      const vParam = urlObj.searchParams.get('v');
      if ((urlObj.pathname.includes('/playlist') || !vParam) && listParam) {
        return { type: 'youtube', provider: 'YouTube Плейлист', icon: 'i-play', url: href, embedUrl: `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(listParam)}` };
      }
      let videoId = '';
      if (host === 'youtu.be') videoId = urlObj.pathname.replace(/^\/+/, '').split('/')[0];
      else if (vParam) videoId = vParam;
      else {
        const m = urlObj.pathname.match(/\/(?:shorts|live|embed|v)\/([a-zA-Z0-9_-]{6,20})/i);
        if (m) videoId = m[1];
      }
      videoId = (videoId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20);
      if (videoId) {
        const q = new URLSearchParams();
        q.set('enablejsapi', '0'); q.set('rel', '0'); q.set('iv_load_policy', '3');
        if (listParam) q.set('list', listParam);
        const tParam = urlObj.searchParams.get('t') || urlObj.searchParams.get('time') || urlObj.searchParams.get('start');
        if (tParam) { const sec = this.parseTimeParam(tParam); if (sec) q.set('start', sec); }
        return { type: 'youtube', provider: 'YouTube', icon: 'i-play', url: href, embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?${q.toString()}` };
      }
    }

    // VK
    if (host === 'vk.com' || host === 'm.vk.com' || host === 'vkvideo.ru' || host === 'vk.ru' || host.endsWith('.vk.com') || host.endsWith('.vkvideo.ru') || host.endsWith('.vk.ru')) {
      let oid = '', vid = '', hash = urlObj.searchParams.get('hash') || '';
      if (urlObj.searchParams.has('oid') && urlObj.searchParams.has('id')) {
        oid = urlObj.searchParams.get('oid') || ''; vid = urlObj.searchParams.get('id') || '';
      } else if (urlObj.searchParams.has('z')) {
        const zMatch = (urlObj.searchParams.get('z') || '').match(/video(-?\d+)_(\d+)/i);
        if (zMatch) { oid = zMatch[1]; vid = zMatch[2]; }
      } else {
        const m = href.match(/(?:video|clip|playlist)[_\/-](-?\d+)[_](\d+)/i) || urlObj.pathname.match(/\/(?:video|clip|playlist)\/(-?\d+)_(\d+)/i);
        if (m) { oid = m[1]; vid = m[2]; }
      }
      if (oid && vid) {
        const hashQuery = hash ? `&hash=${encodeURIComponent(hash)}` : '';
        return { type: 'vk', provider: href.includes('clip') ? 'VK Клип' : href.includes('playlist') ? 'VK Плейлист' : 'VK Видео', icon: 'i-play', url: href, embedUrl: `https://vk.com/video_ext.php?oid=${encodeURIComponent(oid)}&id=${encodeURIComponent(vid)}&hd=2${hashQuery}` };
      }
    }

    // Direct Media
    if (/\.(mp4|webm|ogg|mov|m4v|ogv)($|\?)/i.test(urlObj.pathname)) return { type: 'direct_video', provider: 'Видео', icon: 'i-play', url: href };
    if (/\.(mp3|wav|ogg|aac|m4a|flac|opus|mka)($|\?)/i.test(urlObj.pathname)) return { type: 'direct_audio', provider: 'Аудиозапись', icon: 'i-volume', url: href };
    if (/\.(png|jpe?g|webp|gif|svg|bmp|avif)($|\?)/i.test(urlObj.pathname)) return { type: 'direct_image', provider: 'Изображение', icon: 'i-image', url: href };

    return null;
  }

  buildMediaCard(media) {
    const card = document.createElement('div');
    card.className = 'inline-media-card no-sel';
    let contentHtml = '';
    if (media.embedUrl) {
      contentHtml = `<div class="inline-media-video-wrap"><iframe src="${esc(media.embedUrl)}" sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" loading="lazy" allowfullscreen title="${esc(media.provider)} Player"></iframe></div>`;
    } else if (media.type === 'direct_video') {
      contentHtml = `<div class="inline-media-video-wrap"><video controls preload="metadata" playsinline><source src="${esc(media.url)}">Ваш браузер не поддерживает видео.</video></div>`;
    } else if (media.type === 'direct_audio') {
      contentHtml = `<div class="inline-media-audio-wrap"><audio controls preload="metadata"><source src="${esc(media.url)}">Ваш браузер не поддерживает аудио.</audio></div>`;
    } else if (media.type === 'direct_image') {
      contentHtml = `<div class="inline-media-img-wrap"><img src="${esc(media.url)}" alt="Медиа" loading="lazy"></div>`;
    }
    card.innerHTML = `
      <div class="inline-media-head">
        <span class="inline-media-tag"><svg class="ic"><use href="#${media.icon}"/></svg>${esc(media.provider)}</span>
        <a class="inline-media-link-btn" href="${esc(media.url)}" target="_blank" rel="noopener noreferrer" title="Открыть в источнике">
          <span>Источник</span><svg class="ic"><use href="#i-external"/></svg>
        </a>
      </div>
      ${contentHtml}`;
    if (media.type === 'direct_image') {
      const img = card.querySelector('img');
      if (img && typeof window.openImageViewer === 'function') {
        img.addEventListener('click', () => window.openImageViewer(media.url, 'Изображение'));
      }
    }
    return card;
  }

  enhanceMediaEmbeds(root) {
    if (!root) return;
    const links = root.querySelectorAll('a[href]');
    links.forEach(a => {
      if (a.dataset.mediaProcessed) return;
      if (a.closest('.wsearch-body, .inline-media-card, .att-chip, .code-tools, pre, code')) return;
      const href = a.getAttribute('href') || a.textContent || '';
      const media = this.parseMediaLink(href);
      if (!media) return;
      a.dataset.mediaProcessed = '1';
      const card = this.buildMediaCard(media);
      const listItem = a.closest('li');
      if (listItem) listItem.appendChild(card);
      else {
        const parentBlock = a.closest('p, blockquote, div, table') || a;
        let targetNode = parentBlock;
        while (targetNode.nextElementSibling && targetNode.nextElementSibling.classList.contains('inline-media-card')) {
          targetNode = targetNode.nextElementSibling;
        }
        if (targetNode.nextSibling) targetNode.parentNode.insertBefore(card, targetNode.nextSibling);
        else targetNode.parentNode.appendChild(card);
      }
    });
  }

  extractAllMessageSources(m) {
    if (!m) return [];
    const sources = [];
    const seen = new Set();
    const dHost = typeof window.domainHost === 'function' ? window.domainHost : (u => {
      try { return new URL(u).hostname.replace(/^www\./, ''); } catch (_) { return 'веб-сайт'; }
    });

    const addSrc = (uri, title, snippet) => {
      if (!uri || typeof uri !== 'string') return;
      let cleanUri = uri.trim();
      if (!/^https?:\/\//i.test(cleanUri)) return;
      try {
        const parsed = new URL(cleanUri);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
      } catch (_) { return; }

      if (cleanUri.includes('r.jina.ai/')) {
        const actual = cleanUri.replace(/^https?:\/\/r\.jina\.ai\//i, '');
        if (/^https?:\/\//i.test(actual)) return addSrc(actual, title, snippet);
      }

      const normKey = cleanUri.toLowerCase().replace(/\/$/, '');
      if (seen.has(normKey)) return;
      seen.add(normKey);

      const host = dHost(cleanUri) || 'веб-сайт';
      const cleanTitle = (title && typeof title === 'string' && title.trim() && title.trim() !== cleanUri)
        ? title.trim()
        : host;

      sources.push({
        uri: cleanUri,
        title: cleanTitle,
        host,
        snippet: snippet || ''
      });
    };

    if (m.webSearch && Array.isArray(m.webSearch.sources)) {
      m.webSearch.sources.forEach(s => addSrc(s.uri || s.url, s.title, s.snippet));
    }
    if (Array.isArray(m.inlineSearches)) {
      m.inlineSearches.forEach(is => {
        if (Array.isArray(is.sources)) {
          is.sources.forEach(s => addSrc(s.uri || s.url, s.title, s.snippet));
        }
      });
    }
    if (Array.isArray(m.urlFetches)) {
      m.urlFetches.forEach(uf => {
        if (Array.isArray(uf.urls)) {
          uf.urls.forEach(u => {
            if (u && !u.disabled && u.status === 'done') {
              addSrc(u.url, u.title, u.content || '');
            }
          });
        }
      });
    }
    if (Array.isArray(m.todoSessions)) {
      m.todoSessions.forEach(td => {
        if (Array.isArray(td.tasks)) {
          td.tasks.forEach(t => {
            if (t.search && Array.isArray(t.search.sources)) {
              t.search.sources.forEach(s => addSrc(s.uri || s.url, s.title, s.snippet));
            }
            if (t.urlFetch && Array.isArray(t.urlFetch.pages)) {
              t.urlFetch.pages.forEach(p => addSrc(p.url, p.title, ''));
            }
          });
        }
      });
    }
    if (m.content) {
      const mdLinkRe = /\[([^\]\n]{1,120})\]\((https?:\/\/[^\s\)]+)\)/gi;
      let lm;
      while ((lm = mdLinkRe.exec(m.content)) !== null) {
        addSrc(lm[2].trim(), lm[1].trim(), '');
      }
    }
    return sources;
  }

  enhanceSourceBadgesAndCitations(root, m) {
    if (!root) return;
    const body = root.querySelector('.md-body');
    if (!body) return;

    // Во время активного потока стриминга не перестраиваем DOM цитат, чтобы исключить мерцание и потерю кликов
    if (m && m.status === 'streaming') return;

    const sources = this.extractAllMessageSources(m);

    // 1. Превращение стандартных внешних ссылок в тексте в аккуратные бейджи-карточки
    body.querySelectorAll('a[href^="http"]').forEach(a => {
      if (a.dataset.sourceProcessed) return;
      if (a.closest('.code-tools, .code-lines, pre, code, .inline-media-card, .msg-sources-shelf')) return;
      const url = a.getAttribute('href');
      if (!url) return;

      a.dataset.sourceProcessed = '1';
      const host = domainHost(url) || 'веб-сайт';
      const text = (a.textContent || '').trim();
      const title = (text && text !== url) ? text : host;

      a.classList.add('source-citation-badge');
      a.innerHTML = `
        <span class="scb-fav" data-uri="${esc(url)}">${this.faviconImg(url)}</span>
        <span class="scb-text">${esc(title)}</span>
        <svg class="scb-ext ic"><use href="#i-external"/></svg>
      `;
    });

    // 2. Распознавание цитат [1], [2], [1, 2] и их замена на интерактивные мини-карточки источников
    if (sources.length > 0 && !body.dataset.citationsMapped) {
      const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
        acceptNode: node => {
          if (!node || !node.nodeValue || !/\[\s*\d{1,2}(?:\s*,\s*\d{1,2})*\s*\]/.test(node.nodeValue)) {
            return NodeFilter.FILTER_REJECT;
          }
          const parent = node.parentElement;
          if (!parent || parent.closest('a, pre, code, script, style, .inline-media-card, .code-tools')) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      });

      const textNodes = [];
      while (walker.nextNode()) textNodes.push(walker.currentNode);

      textNodes.forEach(node => {
        const text = node.nodeValue;
        const regex = /\[(\s*\d{1,2}(?:\s*,\s*\d{1,2})*\s*)\]/g;
        let lastIdx = 0;
        let match;
        const frag = document.createDocumentFragment();
        let changed = false;

        while ((match = regex.exec(text)) !== null) {
          const rawNumbers = match[1].split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n));
          const matchedSources = rawNumbers.map(num => sources[num - 1]).filter(Boolean);

          if (matchedSources.length > 0) {
            changed = true;
            if (match.index > lastIdx) {
              frag.appendChild(document.createTextNode(text.slice(lastIdx, match.index)));
            }

            matchedSources.forEach(src => {
              const pill = document.createElement('a');
              pill.className = 'source-citation-card no-sel';
              pill.href = src.uri;
              pill.target = '_blank';
              pill.rel = 'noopener noreferrer';
              pill.title = `${src.title} (${src.host})`;
              pill.innerHTML = `
                <span class="scc-fav" data-uri="${esc(src.uri)}">${this.faviconImg(src.uri)}</span>
                <span class="scc-title">${esc(src.title)}</span>
                <svg class="scc-ext ic"><use href="#i-external"/></svg>
              `;
              frag.appendChild(pill);
            });

            lastIdx = regex.lastIndex;
          }
        }

        if (changed) {
          if (lastIdx < text.length) {
            frag.appendChild(document.createTextNode(text.slice(lastIdx)));
          }
          node.parentNode.replaceChild(frag, node);
        }
      });

      if (m.status === 'done') {
        body.dataset.citationsMapped = '1';
      }
    }
  }
}

// Создаем глобальный инстанс
const toolCalling = new ToolCallingController();
window.toolCalling = toolCalling;

// Экспорт моделей, справочников и вспомогательных функций в глобальную область
window.IMG_MODELS = IMG_MODELS;
window.IG_BG_LABELS = IG_BG_LABELS;
window.EXEC_LANG_LABELS = EXEC_LANG_LABELS;
window.igRatioLabel = igRatioLabel;
window.resolveImgModel = resolveImgModel;
window.IMG_CMD_RE = IMG_CMD_RE;
window.WS_CMD_RE = WS_CMD_RE;
window.THINK_CMD_RE = THINK_CMD_RE;
window.THINK_BUDGET = THINK_BUDGET;

// Делегированные методы контроллера
window.buildTemporalContextInstructions = () => toolCalling.buildTemporalContextInstructions();
window.buildImageGenInstructions = () => toolCalling.buildImageGenInstructions();
window.buildArtifactInstructions = () => toolCalling.buildArtifactInstructions();
window.buildUrlReadingInstructions = (canSearch) => toolCalling.buildUrlReadingInstructions(canSearch);
window.buildDeepThinkInstructions = () => toolCalling.buildDeepThinkInstructions();
window.buildCodeExecutionInstructions = () => toolCalling.buildCodeExecutionInstructions();
window.buildWebSearchInstructions = (model) => toolCalling.buildWebSearchInstructions(model);
window.getSystemPromptText = (model) => toolCalling.getSystemPromptText(model);

window.detectCodeExecutionCommand = (text) => toolCalling.detectCodeExecutionCommand(text);
window.stripExecCommands = (text) => toolCalling.stripExecCommands(text);
window.spawnCodeExecution = (chat, aiMsg, cmd, rawCmd, location) => toolCalling.spawnCodeExecution(chat, aiMsg, cmd, rawCmd, location);
window.runCodeExecution = (x, externalSignal) => toolCalling.runCodeExecution(x, externalSignal);
window.runOpenRouterHostedShell = (x, externalSignal) => toolCalling.runOpenRouterHostedShell(x, externalSignal);
window.formatExecResult = (x, attempt, maxAttempts) => toolCalling.formatExecResult(x, attempt, maxAttempts);
window.getToolAvailability = (model) => toolCalling.getToolAvailability(model);

window.detectWebSearchCommand = (text) => toolCalling.detectWebSearchCommand(text);
window.stripWsCommands = (text) => toolCalling.stripWsCommands(text);
window.performWebSearches = (queries, signal) => toolCalling.performWebSearches(queries, signal);
window.performWebSearch = (query, signal) => toolCalling.performWebSearch(query, signal);
window.formatSearchResults = (results, queries, used, max, inTodo) => toolCalling.formatSearchResults(results, queries, used, max, inTodo);
window.fetchWebImages = (query, signal) => toolCalling.fetchWebImages(query, signal);
window.fetchCommonsImages = (query, signal) => toolCalling.fetchCommonsImages(query, signal);
window.translateImageQuery = (q, signal) => toolCalling.translateImageQuery(q, signal);
window.shouldAttachImages = (t) => toolCalling.shouldAttachImages(t);
window.cleanImageQuery = (t) => toolCalling.cleanImageQuery(t);

window.detectTodoCommand = (text) => toolCalling.detectTodoCommand(text);
window.stripTodoCommands = (text) => toolCalling.stripTodoCommands(text);
window.spawnTodoSession = (chat, aiMsg, rawCmd, tasks, location) => toolCalling.spawnTodoSession(chat, aiMsg, rawCmd, tasks, location);
window.updateTodoSession = (chat, aiMsg, rawCmd, step, status, result, location) => toolCalling.updateTodoSession(chat, aiMsg, rawCmd, step, status, result, location);
window.addTodoTasks = (chat, aiMsg, rawCmd, newTasks, location) => toolCalling.addTodoTasks(chat, aiMsg, rawCmd, newTasks, location);
window.formatTodoProgress = (session) => toolCalling.formatTodoProgress(session);
window.renderTodoCard = (session, idx) => toolCalling.renderTodoCard(session, idx);

window.detectUrlFetchCommand = (text) => toolCalling.detectUrlFetchCommand(text);
window.stripUrlFetchCommands = (text) => toolCalling.stripUrlFetchCommands(text);
window.spawnUrlFetchSession = (chat, aiMsg, rawCmd, urls, location) => toolCalling.spawnUrlFetchSession(chat, aiMsg, rawCmd, urls, location);
window.formatUrlFetchResults = (session) => toolCalling.formatUrlFetchResults(session);
window.renderUrlFetchCard = (session, idx) => toolCalling.renderUrlFetchCard(session, idx);

window.detectThinkCommand = (text) => toolCalling.detectThinkCommand(text);
window.spawnThinkSession = (chat, aiMsg, rawCmd, tasks, location) => toolCalling.spawnThinkSession(chat, aiMsg, rawCmd, tasks, location);
window.runParallelThink = (chat, aiMsg, session, history, partialContent, signal) => toolCalling.runParallelThink(chat, aiMsg, session, history, partialContent, signal);
window.formatThinkResults = (session) => toolCalling.formatThinkResults(session);

window.detectImageGenCommand = (text) => toolCalling.detectImageGenCommand(text);
window.stripImgCommands = (text) => toolCalling.stripImgCommands(text);
window.getAllDialogueImages = (chat, upToAiMsgId) => toolCalling.getAllDialogueImages(chat, upToAiMsgId);
window.resolveDialogueReferences = (chat, aiMsg, refsParam) => toolCalling.resolveDialogueReferences(chat, aiMsg, refsParam);
window.spawnImageRequest = (chat, aiMsg, rawCmd, promptText, refsParam) => toolCalling.spawnImageRequest(chat, aiMsg, rawCmd, promptText, refsParam);
window.handleImageRequests = (chat, aiMsg) => toolCalling.handleImageRequests(chat, aiMsg);
window.handleImageRequests = (chat, aiMsg) => toolCalling.handleImageRequests(chat, aiMsg);
window.requestImageGeneration = (imgModel, opts, prompt, signal, onProgress) => toolCalling.requestImageGeneration(imgModel, opts, prompt, signal, onProgress);

window.findArtifactOpen = (text) => toolCalling.findArtifactOpen(text);
window.parseArtifact = (raw) => toolCalling.parseArtifact(raw);
window.spawnArtifact = (chat, aiMsg, raw) => toolCalling.spawnArtifact(chat, aiMsg, raw);
window.trackStreamArtifacts = (chat, aiMsg, trk) => toolCalling.trackStreamArtifacts(chat, aiMsg, trk);
window.handlePendingArtifacts = (chat, aiMsg) => toolCalling.handlePendingArtifacts(chat, aiMsg);
window.sealHtml = (raw) => toolCalling.sealHtml(raw);

window.getDeepThinkMax = () => toolCalling.getDeepThinkMax();
window.getWsLimit = () => toolCalling.getWsLimit();
window.getImgCfg = () => toolCalling.getImgCfg();

window['renderMsgContent'] = (content, m) => toolCalling.renderMsgContent(content, m);
window['formatThinkingHtml'] = (text) => toolCalling.formatThinkingHtml(text);
window['renderThinkingWithSearches'] = (thinking, searches) => toolCalling.renderThinkingWithSearches(thinking, searches);
window['renderContentWithSearches'] = (content, searches) => toolCalling.renderContentWithSearches(content, searches);
window['extractUrlsFromText'] = (text) => toolCalling.extractUrlsFromText(text);
window['fetchUrlContent'] = (url, signal, onProgress) => toolCalling.fetchUrlContent(url, signal, onProgress);
window['fetchAllUrlContents'] = (urls, signal, onProgress) => toolCalling.fetchAllUrlContents(urls, signal, onProgress);
window['renderArtifactCard'] = (art, idx) => toolCalling.renderArtifactCard(art, idx);
window['renderImgRequestCard'] = (req, idx) => toolCalling.renderImgRequestCard(req, idx);
window['renderInlineSearchCard'] = (s, idx) => toolCalling.renderInlineSearchCard(s, idx);
window['renderThinkCard'] = (session, idx) => toolCalling.renderThinkCard(session, idx);
window['renderExecCard'] = (x, idx) => toolCalling.renderExecCard(x, idx);

window['parseMediaLink'] = (url) => toolCalling.parseMediaLink(url);
window['buildMediaCard'] = (media) => toolCalling.buildMediaCard(media);
window['enhanceMediaEmbeds'] = (root) => toolCalling.enhanceMediaEmbeds(root);
window['extractAllMessageSources'] = (m) => toolCalling.extractAllMessageSources(m);
window['enhanceSourceBadgesAndCitations'] = (root, m) => toolCalling.enhanceSourceBadgesAndCitations(root, m);
window['domainHost'] = domainHost;