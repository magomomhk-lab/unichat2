/* ============================================================
proxymodel.js:
ProxyModel — API-слой MoonSSS (ProxyAPI.ru)
Только сетевые запросы, стриминг, системный промпт.
UI-логика находится в ai.html.

ЗАВИСИМОСТИ (должны быть определены в ai.html ДО подключения этого файла):
- window.state — объект состояния приложения
- toast(msg, type, dur) — функция уведомлений
- getImgCfg() — получить настройки генерации изображений
- window.domainHost(uri) — извлечь домен из URL
- fetchOpenverseImages(query, signal) — поиск в Openverse

ПОРЯДОК ПОДКЛЮЧЕНИЯ:
1. CDN-библиотеки (marked, DOMPurify, highlight.js)
2. proxymodel.js (этот файл)
3. Основной скрипт ai.html
============================================================ */

/* ---------- Каталог моделей ----------
   Место для новых моделей: добавляйте объекты в массив MODELS.
   api: 'openrouter' | 'anthropic' | 'gemini'
   Для anthropic/gemini укажите нативный id в поле native.   */
var MODELS = window.MODELS || [
  {
    id: "@preset/uni-max",
    name: "Uni Max",
    provider: "Uni",
    api: "openrouter",
    requiresOpenRouter: true,
    reasoning: false,
    vision: true,
    tagline: "Максимальная глубина и качество ответов",
    icon: "uni-max.jpeg",
    reasoningLevels: ["off"],
  },
  {
    id: "qwen/qwen3.8-max-prime",
    name: "Qwen 3.8 Max Prime",
    provider: "OpenRouter",
    api: "openrouter",
    reasoning: true,
    vision: true,
    tagline: "Максимальная мощь Alibaba",
    icon: "qwen-color.svg",
    reasoningLevels: ["always"],
  },
  {
    id: "qwen/qwen3.8-flash",
    name: "Qwen 3.8 Flash",
    provider: "OpenRouter",
    api: "openrouter",
    reasoning: true,
    vision: true,
    tagline: "Скорость и эффективность",
    icon: "qwen-color.svg",
    reasoningLevels: ["off", "minimal", "low", "medium", "high", "xhigh", "max"],
  },
  {
    id: "meta/muse-spark-1.3-contributor",
    name: "Muse Spark 1.3 Contributor",
    provider: "OpenRouter",
    api: "openrouter",
    reasoning: true,
    vision: true,
    tagline: "Сборка для контрибьюторов Meta",
    icon: "meta-color.svg",
    reasoningLevels: ["high", "xhigh", "max"],
  },
  {
    id: "x-ai/grok-4.7",
    name: "Grok 4.7",
    provider: "OpenRouter",
    api: "openrouter",
    reasoning: true,
    vision: true,
    tagline: "AI from SpaceXAI",
    icon: "grok.png",
    reasoningLevels: ["always"],
  },
  {
    id: "deepseek/deepseek-v4.1-flash",
    name: "DeepSeek v4.1 Flash",
    provider: "OpenRouter",
    api: "openrouter",
    reasoning: true,
    vision: true,
    tagline: "Скорость и эффективность",
    icon: "deepseek-color.svg",
    reasoningLevels: ["always"],
  },
  {
    id: "openai/gpt-6-luna",
    name: "GPT-6 Luna",
    provider: "OpenRouter",
    api: "openrouter",
    reasoning: true,
    vision: true,
    tagline: "Передовой интеллект OpenAI",
    icon: "chat-gpt.png",
    reasoningLevels: ["off", "low", "medium", "high", "xhigh", "max"],
  },
  // {
  //   id: "openai/gpt-5.6-terra",
  //   name: "GPT-5.6 Terra",
  //   provider: "OpenRouter",
  //   api: "openrouter",
  //   reasoning: true,
  //   vision: true,
  //   tagline: "Глубокий анализ и стабильность OpenAI",
  //   icon: "chat-gpt.png",
  //   reasoningLevels: ["off", "low", "medium", "high", "xhigh", "max"],
  // },
  {
    id: "openai/gpt-6.1-sol",
    name: "GPT-6.1 Sol",
    provider: "OpenRouter",
    api: "openrouter",
    reasoning: true,
    vision: true,
    tagline: "Солнечная скорость и интеллект OpenAI",
    icon: "chat-gpt.png",
    reasoningLevels: ["always"],
  },
  {
    id: "openai/gpt-5-nano",
    name: "GPT-5 Nano",
    provider: "OpenRouter",
    api: "openrouter",
    reasoning: true,
    vision: true,
    tagline: "Сверхлёгкая модель OpenAI",
    icon: "chat-gpt.png",
    reasoningLevels: ["minimal", "medium", "high"],
  },
  {
    id: "z-ai/glm-5.3-prime",
    name: "GLM-5.3 Prime",
    provider: "OpenRouter",
    api: "openrouter",
    reasoning: true,
    vision: false,
    tagline: "Последняя версия Z-AI",
    icon: "z-ai.png",
    reasoningLevels: ["always"],
  },
  {
    id: "z-ai/glm-5.3",
    name: "GLM-5.3",
    provider: "OpenRouter",
    api: "openrouter",
    reasoning: true,
    vision: false,
    tagline: "Последняя версия Z-AI",
    icon: "z-ai.png",
    reasoningLevels: ["high", "max"],
  },
  {
    id: "z-ai/glm-5.3-flash",
    name: "GLM-5.3 Flash",
    provider: "OpenRouter",
    api: "openrouter",
    reasoning: "true",
    vision: "true",
    //tagline: "",
    icon: "z-ai.png",
    reasoningLevels: ["always"],
  },
  {
    id: "anthropic/claude-fable-5.1",
    name: "Claude 5.1 Fable",
    provider: "Anthropic",
    api: "anthropic",
    native: "claude-fable-5.1",
    reasoning: true,
    vision: true,
    tagline: "Флагманская глубина Anthropic",
    icon: "claude-color.svg",
    reasoningLevels: ["by Claude"],
  },
  {
    id: "anthropic/claude-opus-5.5",
    name: "Claude 5.5 Opus",
    provider: "Anthropic",
    api: "anthropic",
    native: "claude-opus-5.5",
    reasoning: true,
    vision: true,
    tagline: "Флагманская глубина Anthropic",
    icon: "claude-color.svg",
    reasoningLevels: ["always"],
  },
  {
    id: "anthropic/claude-sonnet-5.5",
    name: "Claude 5.5 Sonnet",
    provider: "Anthropic",
    api: "anthropic",
    native: "claude-sonnet-5.5",
    reasoning: true,
    vision: true,
    tagline: "Баланс ума и скорости",
    icon: "claude-color.svg",
    reasoningLevels: ["always"],
  },
  {
    id: "anthropic/claude-haiku-5.5",
    name: "Claude 5.5 Haiku",
    provider: "Anthropic",
    api: "anthropic",
    native: "claude-haiku-5-5",
    reasoning: true,
    vision: true,
    tagline: "Баланс ума и скорости",
    icon: "claude-color.svg",
    reasoningLevels: ["always"],
  },
  {
    id: "google/gemini-3.8-flash",
    name: "Gemini 3.8 Flash",
    provider: "Google",
    api: "gemini",
    native: "gemini-3.8-flash",
    reasoning: true,
    vision: true,
    tagline: "Мультимодальность Google",
    icon: "gemini-color.svg",
    reasoningLevels: ["low", "medium", "high"],
  },
  {
    id: "moonshotai/kimi-k3",
    name: "Kimi k3",
    provider: "OpenRouter",
    api: "openrouter",
    reasoning: true,
    vision: true,
    tagline: "Рассуждающая модель Moonshot AI",
    icon: "MoonshotAI.png",
    reasoningLevels: ["low", "max"],
  },

  {
    id: "minimax/minimax-m3",
    name: "MiniMax M3",
    provider: "OpenRouter",
    api: "openrouter",
    reasoning: true,
    vision: true,
    tagline: "Инновации от MiniMax",
    icon: "minimax-color.svg",
    reasoningLevels: ["off", "always"],
  },
  {
    id: "openrouter/auto-beta",
    name: "AutoRouter",
    provider: "OpenRouter",
    api: "openrouter",
    reasoning: false,
    vision: true,
    tagline: "Лучшая модель под каждый запрос",
    icon: "openrouter-color.svg",
    reasoningLevels: ["off"],
  },
  {
    id: "openrouter/fusion",
    name: "Auto Fusion",
    provider: "OpenRouter",
    api: "openrouter",
    reasoning: false,
    vision: true,
    tagline: "Максимум возможностей авто-выбора",
    icon: "openrouter-color.svg",
    reasoningLevels: ["off"],
  },
];
var modelThinkingConfigs = window.modelThinkingConfigs || {
  "@preset/uni-max": [
    { value: "off", label: "Автоматически", desc: "Размышления настраиваются автоматически" },
  ],
  "openrouter/fusion": [
    {
      value: "off",
      label: "Автоматически",
      desc: "Встроенный консилиум моделей и веб-поиск",
    },
  ],
  "openrouter/auto-beta": [
    {
      value: "off",
      label: "Автоматически",
      desc: "Автоматический выбор модели маршрутизатором",
    },
  ],
  "deepseek/deepseek-v4.1-flash": [
    {
      value: "always",
      label: "Автоматически",
      desc: "Встроенный консилиум моделей и веб-поиск",
    },
  ],

  "openai/gpt-6-luna": [
    {
      value: "off",
      label: "Без размышлений",
      desc: "Прямой быстрый ответ (Non-reasoning)",
    },
    {
      value: "low",
      label: "Низкий (Low)",
      desc: "Поверхностные рассуждения"
    },
    {
      value: "medium",
      label: "Средний (Medium)",
      desc: "Сбалансированное обдумывание",
    },
    {
      value: "high",
      label: "Высокий (High)",
      desc: "Глубокая логика"
    },
    {
      value: "xhigh",
      label: "Очень высокий (xHigh)",
      desc: "Сложное проектирование",
    },
    {
      value: "max",
      label: "Максимум (Max)",
      desc: "Предельная глубина анализа",
    },
  ],
  // "openai/gpt-5.6-terra": [
  //   {
  //     value: "off",
  //     label: "Без размышлений",
  //     desc: "Прямой быстрый ответ (Non-reasoning)",
  //   },
  //   {
  //     value: "low",
  //     label: "Низкий (Low)",
  //     desc: "Поверхностные рассуждения"
  //   },
  //   {
  //     value: "medium",
  //     label: "Средний (Medium)",
  //     desc: "Сбалансированное обдумывание",
  //   },
  //   {
  //     value: "high",
  //     label: "Высокий (High)",
  //     desc: "Глубокая логика"
  //   },
  //   {
  //     value: "xhigh",
  //     label: "Очень высокий (xHigh)",
  //     desc: "Сложное проектирование",
  //   },
  //   {
  //     value: "max",
  //     label: "Максимум (Max)",
  //     desc: "Предельная глубина анализа",
  //   },
  // ],
  "openai/gpt-6.1-sol": [
    {
      value: "always",
      label: "by OpenAI",
      desc: "Встроенный консилиум моделей и веб-поиск",
    },
  ],
  "openai/gpt-5-nano": [
    {
      value: "minimal",
      label: "Минимальный (Minimal)",
      desc: "Сверхбыстрый ответ с базовой логикой",
    },
    {
      value: "medium",
      label: "Средний (Medium)",
      desc: "Сбалансированное обдумывание",
    },
    { value: "high", label: "Высокий (High)", desc: "Глубокая логика" },
  ],
  "anthropic/claude-fable-5.1": [
    {
      value: "always",
      label: "Adaptive (Auto)",
      desc: "Встроенные адаптивные размышления Claude 5.1 (всегда активны)"
    }
  ],
  "anthropic/claude-opus-5.5": [
    {
      value: "always",
      label: "Adaptive (Auto)",
      desc: "Встроенные адаптивные размышления Claude 5.1 (всегда активны)"
    }
  ],
  "anthropic/claude-sonnet-5.5": [
    {
      value: "always",
      label: "Adaptive (Auto)",
      desc: "Встроенные адаптивные размышления Claude (всегда активны)"
    }
  ],
  "anthropic/claude-haiku-5.5": [
    {
      value: "always",
      label: "Adaptive (Auto)",
      desc: "Встроенные адаптивные размышления Claude (всегда активны)"
    }
  ],
  "google/gemini-3.8-flash": [
    {
      value: "low",
      label: "Low",
      desc: "Быстрый ответ",
    },
    {
      value: "medium",
      label: "Medium",
      desc: "Средний уровень",
    },
    {
      value: "high",
      label: "High",
      desc: "Высокий уровень",
    },
  ],

  "moonshotai/kimi-k3": [
    {
      value: "low",
      label: "Low",
      desc: "Глубокий пошаговый анализ Kimi",
    },
    {
      value: "max",
      label: "Max",
      desc: "Предельная глубина рассуждений Kimi k3",
    },
  ],

  "minimax/minimax-m3": [
    {
      value: "off",
      label: "Отключено",
      desc: "Прямой быстрый ответ"
    },
    {
      value: "always",
      label: "Включено",
      desc: "Показывать пошаговые размышления",
    },
  ],
  "qwen/qwen3.8-max-prime": [
    {
      value: "always",
      label: "by Qwen",
      desc: "от Qwen. Работает автоматически"
    },
  ],
  "z-ai/glm-5.3-prime": [
    {
      value: "high",
      label: "Высокий (High)",
      desc: "Полное рассуждение",
    },
    {
      value: "max",
      label: "Максимум (Max)",
      desc: "Предельная глубина анализа",
    },
  ],
  "z-ai/glm-5.3": [
    {
      value: "high",
      label: "Высокий (High)",
      desc: "Полное рассуждение",
    },
    {
      value: "max",
      label: "Максимум (Max)",
      desc: "Предельная глубина анализа",
    },
  ],
  "z-ai/glm-5.3-flash": [
    {
      value: "always",
      label: "Встроенное размышление",
      desc: "Faster Answer",
    }
  ],
  "x-ai/grok-4.7": [
    {
      value: "always",
      label: "Всегда",
      desc: "by X (Twitter)"
    },
  ],
  "meta/muse-spark-1.3-contributor": [
    {
      value: "high",
      label: "Высокий (High)",
      desc: "Полное рассуждение",
    },
    {
      value: "xhigh",
      label: "Очень высокий (XHigh)",
      desc: "Сложное проектирование",
    },
    {
      value: "max",
      label: "Максимум (Max)",
      desc: "Предельная глубина анализа",
    },
  ],
  "qwen/qwen3.8-flash": [
    {
      value: "off",
      label: "Отключено (None)",
      desc: "Прямой быстрый ответ без размышлений",
    },
    {
      value: "minimal",
      label: "Минимальный (Minimal)",
      desc: "Сверхбыстрый ответ с базовой логикой",
    },
    {
      value: "low",
      label: "Низкий (Low)",
      desc: "Краткое планирование",
    },
    {
      value: "medium",
      label: "Средний (Medium)",
      desc: "Сбалансированное обдумывание",
    },
    {
      value: "high",
      label: "Высокий (High)",
      desc: "Полное рассуждение",
    },
    {
      value: "xhigh",
      label: "Очень высокий (XHigh)",
      desc: "Сложное проектирование",
    },
    {
      value: "max",
      label: "Максимум (Max)",
      desc: "Предельная глубина анализа",
    },
  ],
};

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
/* SUGGESTIONS — UI, находится в ai.html */

/* ── Генерация изображений и системные промпты делегированы в toolCalling.js ── */

/* Журнал реальных вызовов инструментов в ответе ассистента.
   Строится только из данных приложения (не из текста модели),
   чтобы модель в следующих ходах видела, что вызовы действительно были. */
function buildToolJournal(m) {
  const lines = [];
  const fmt = s => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 240);

  (m.serverTools || []).forEach(t => {
    const parts = [
      `- ${t.name || 'openrouter:subagent'} (серверный субагент)`,
      `статус: ${t.status || 'done'}`
    ];
    if (t.model) parts.push(`модель: ${t.model}`);
    if (t.task) parts.push(`задача: «${fmt(t.task)}»`);
    if (t.output) parts.push(`ответ субагента: «${fmt(t.output)}»`);
    if (t.error) parts.push(`ошибка: ${fmt(t.error)}`);
    lines.push(parts.join(' · '));
  });

  const wsQueries = (m.webSearch && Array.isArray(m.webSearch.queries)) ? m.webSearch.queries : [];
  if (wsQueries.length) {
    const srcCount = (m.webSearch.sources || []).length;
    lines.push(`- web_search · запросы: ${wsQueries.map(q => '«' + fmt(q) + '»').join(', ')} · источников: ${srcCount}`);
  }

  (m.urlFetches || []).forEach(sess => {
    (sess.urls || []).forEach(u => {
      lines.push(`- fetch_url · ${u.url} · статус: ${u.status}${u.status === 'done' ? ' · текст прочитан' : ''}`);
    });
  });

  (m.executions || []).forEach(x => {
    lines.push(`- execute · ${x.lang} · exit ${x.exitCode ?? '?'} · статус: ${x.status}`);
  });

  (m.thinkSessions || []).forEach(s => {
    const done = (s.tasks || []).filter(t => t.status === 'done').length;
    lines.push(`- thinking_ (параллельное мышление) · веток: ${(s.tasks || []).length} · завершено: ${done}`);
  });

  (m.artifacts || []).forEach(a => {
    lines.push(`- artifact · «${a.title}» · v${a.version}`);
  });

  (m.imageRequests || []).forEach(r => {
    lines.push(`- image_generation · ${r.model} · статус: ${r.status}`);
  });

  if (!lines.length) return '';
  return `[ЖУРНАЛ ВЫЗОВОВ ИНСТРУМЕНТОВ В ЭТОМ ОТВЕТЕ (записано системой, это реальные вызовы)]\n${lines.join('\n')}\n[КОНЕЦ ЖУРНАЛА]\n\n`;
}

/* ---------- Отправка ---------- */
function formatAssistantContentForHistory(m) {
  let textContent = buildToolJournal(m) + (m.content || "");

  // Собираем все источники сообщения (inlineSearches + webSearch) с их точными полными URL
  const allSources = [];
  const seenUris = new Set();
  (m.inlineSearches || []).forEach(s => {
    (s.sources || []).forEach(src => {
      if (src && src.uri && !seenUris.has(src.uri)) {
        seenUris.add(src.uri);
        allSources.push(src);
      }
    });
  });
  if (m.webSearch && Array.isArray(m.webSearch.sources)) {
    m.webSearch.sources.forEach(src => {
      if (src && src.uri && !seenUris.has(src.uri)) {
        seenUris.add(src.uri);
        allSources.push(src);
      }
    });
  }

  // Подмешиваем результаты поиска [[WS:n]] для последующих ходов диалога
  if (Array.isArray(m.inlineSearches) && m.inlineSearches.length > 0) {
    m.inlineSearches.forEach((s, sIdx) => {
      const targetPattern = new RegExp(`\\[\\[WS:${sIdx}\\]\\]`, 'g');
      if (targetPattern.test(textContent)) {
        if (s.sources && s.sources.length > 0) {
          const srcBlock = s.sources.map((src, i) =>
            `[ИСТОЧНИК #${i + 1}: «${src.title || src.uri}» (URL: ${src.uri})]\n${src.snippet || ''}`
          ).join('\n\n');
          textContent = textContent.replace(targetPattern, `\n[РЕЗУЛЬТАТЫ ПОИСКА: ${s.queries?.join('; ')}]\n${srcBlock}\n[КОНЕЦ РЕЗУЛЬТАТОВ ПОИСКА]\n`);
        } else {
          textContent = textContent.replace(targetPattern, `\n[Поиск в интернете: ${s.queries?.join('; ')}]\n`);
        }
      }
    });
  }

  // Страховка: если маркеры [[WS]] отсутствовали в тексте ответа (поиск был в thinking или нативном поиске),
  // но источники были найдены — прикрепляем их явным блоком, чтобы модель видела точные URL для последующего fetch_url
  if (allSources.length > 0 && !textContent.includes('[ИСТОЧНИК #') && !textContent.includes('[РЕЗУЛЬТАТЫ ПОИСКА:')) {
    const srcList = allSources.map((src, i) =>
      `[ИСТОЧНИК #${i + 1}: «${src.title || src.uri}» (URL: ${src.uri})]\n${src.snippet || ''}`
    ).join('\n\n');
    textContent += `\n\n[ИСТОЧНИКИ И ССЫЛКИ, НАЙДЕННЫЕ В ЭТОМ ОТВЕТЕ]:\n${srcList}\n[КОНЕЦ ИСТОЧНИКОВ]\n`;
  }

  // Подмешиваем только активный контент из агентного чтения ссылок fetch_url для последующих ходов диалога
  if (Array.isArray(m.urlFetches) && m.urlFetches.length > 0) {
    m.urlFetches.forEach((sess, sessIdx) => {
      const activeUrls = (sess.urls || []).filter(u => !u.disabled && u.status === 'done' && u.content);
      const targetPattern = new RegExp(`\\[\\[FETCH_URL:${sessIdx}\\]\\]`, 'g');
      if (activeUrls.length > 0) {
        const urlSummaryBlock = activeUrls.map((u, i) =>
          `\n[ВЕБ-СТРАНИЦА #${i + 1}: «${u.title || u.url}» (${u.url})]\n${u.content}\n[КОНЕЦ ВЕБ-СТРАНИЦЫ]\n`
        ).join('\n');
        textContent = textContent.replace(targetPattern, urlSummaryBlock);
      } else {
        textContent = textContent.replace(targetPattern, '[контекст веб-страниц отключен пользователем]');
      }
    });
  }

  // Обогащаем контекст сгенерированными изображениями и их точными промптами с указанием их ID для refs
  const chat = typeof window.activeChat === 'function' ? window.activeChat() : null;
  const allImages = (window.toolCalling && typeof window.toolCalling.getAllDialogueImages === 'function')
    ? window.toolCalling.getAllDialogueImages(chat)
    : [];

  (m.imageRequests || []).forEach(r => {
    if (r.status === 'done' && r.dataUrl) {
      const p = r.prompt || r.aiPrompt || '';
      const matched = allImages.find(im => im.dataUrl === r.dataUrl);
      const idTag = matched ? ` (id: ${matched.id})` : '';
      textContent += `\n\n[ИЗОБРАЖЕНИЕ В ДИАЛОГЕ${idTag}: сгенерировано ИИ по промпту: "${p}"]`;
    }
  });
  (m.generatedImages || []).forEach(g => {
    if (g.status === 'done' && g.dataUrl) {
      const p = g.prompt || '';
      const matched = allImages.find(im => im.dataUrl === g.dataUrl);
      const idTag = matched ? ` (id: ${matched.id})` : '';
      textContent += `\n\n[ИЗОБРАЖЕНИЕ В ДИАЛОГЕ${idTag}: сгенерировано ИИ по промпту: "${p}"]`;
    }
  });

  return textContent;
}

window.formatAssistantContentForHistory = formatAssistantContentForHistory;

function collectAttachmentVisionImages(attachments) {
  const images = [];
  const seenUrls = new Set();

  (attachments || []).forEach(a => {
    if (!a) return;
    
    // Прямые изображения
    if (a.kind === "image" && a.dataUrl && !seenUrls.has(a.dataUrl)) {
      seenUrls.add(a.dataUrl);
      images.push({ dataUrl: a.dataUrl, mime: a.mime || "image/jpeg", name: a.name || "Изображение" });
    } 
    // Документы (PDF, DOCX, PPTX): передаем отрендеренные страницы и извлеченные схемы/иллюстрации
    else if (a.kind === "document" && Array.isArray(a.images)) {
      a.images.forEach(im => {
        if (im && im.dataUrl && !seenUrls.has(im.dataUrl)) {
          seenUrls.add(im.dataUrl);
          images.push({
            dataUrl: im.dataUrl,
            mime: im.mime || "image/jpeg",
            name: `${a.name || 'Документ'} (${im.name || 'Страница/Слайд'})`
          });
        }
      });
    } 
    // Видео: передаем ключевые кадры (keyframes)
    else if (a.kind === "video" && Array.isArray(a.keyframes)) {
      a.keyframes.forEach(kf => {
        if (kf && kf.dataUrl && !seenUrls.has(kf.dataUrl)) {
          seenUrls.add(kf.dataUrl);
          images.push({
            dataUrl: kf.dataUrl,
            mime: "image/jpeg",
            name: `${a.name || 'Видео'} (${kf.name || 'Кадр'})`
          });
        }
      });
    }
  });

  // Защита от превышения лимитов полезной нагрузки: максимум 24 изображения за один запрос
  return images.slice(0, 24);
}
window.collectAttachmentVisionImages = collectAttachmentVisionImages;

function textWithFiles(m) {
  let t = m.content || "";
  const chat = typeof window.activeChat === 'function' ? window.activeChat() : null;
  const allImages = (window.toolCalling && typeof window.toolCalling.getAllDialogueImages === 'function')
    ? window.toolCalling.getAllDialogueImages(chat)
    : [];

  const attachedImgs = [];
  (m.attachments || []).forEach((f, idx) => {
    if (f.kind === "image" && f.dataUrl) {
      const matched = allImages.find(im => im.dataUrl === f.dataUrl);
      const idLabel = matched ? matched.id : `img_${idx + 1}`;
      attachedImgs.push(`• [ИЗОБРАЖЕНИЕ В ДИАЛОГЕ #${matched ? matched.seq : idx + 1} (id: ${idLabel}, описание/название: «${f.name || 'Изображение'}»)]`);
    } else if (f.kind === "file" || f.kind === "text") {
      const fileName = f.name || `Файл #${idx + 1}`;
      const charCount = (f.text || "").length;
      t += `\n\n═══════════════════════════════════════════════════════════════\n[ТЕКСТОВОЕ СОДЕРЖИМОЕ ВЛОЖЕНИЯ #${idx + 1}: «${fileName}» (${charCount} симв.)]\n${f.text}\n[КОНЕЦ СОДЕРЖИМОГО «${fileName}»]\n═══════════════════════════════════════════════════════════════\n`;
    } else if (f.kind === "document") {
      const fileName = f.name || `Документ #${idx + 1}`;
      const docType = String(f.docType || 'документ').toUpperCase();
      const pageInfo = f.pageCount ? `, ${f.pageCount} стр.` : '';
      const visualCount = (f.images && f.images.length) ? f.images.length : 0;
      const visualNote = visualCount > 0 
        ? `\n[ВИЗУАЛЬНЫЕ СТРАНИЦЫ]: Страницы этого документа также переданы как изображения в твоё зрительное восприятие (Vision). Используй как извлечённый текст, так и визуальные схемы/таблицы.`
        : '';
      t += `\n\n═══════════════════════════════════════════════════════════════\n[ИЗВЛЕЧЁННЫЙ ТЕКСТ И ТАБЛИЦЫ ${docType} #${idx + 1}: «${fileName}»${pageInfo}]\n${f.text || ''}${visualNote}\n[КОНЕЦ СОДЕРЖИМОГО «${fileName}»]\n═══════════════════════════════════════════════════════════════\n`;
    } else if (f.kind === "audio") {
      const fileName = f.name || `Аудиозапись #${idx + 1}`;
      const durStr = f.duration ? ` · ~${Math.round(f.duration)} сек.` : '';
      const transcriptStr = f.transcript ? `\nТранскрипция аудиодорожки (распознанная речь):\n${f.transcript}` : '\n(Аудиофайл прикреплён к запросу)';
      t += `\n\n═══════════════════════════════════════════════════════════════\n[ВЛОЖЕННАЯ АУДИОЗАПИСЬ #${idx + 1}: «${fileName}»${durStr}]${transcriptStr}\n[КОНЕЦ АУДИОЗАПИСИ]\n═══════════════════════════════════════════════════════════════\n`;
    } else if (f.kind === "video") {
      const fileName = f.name || `Видеозапись #${idx + 1}`;
      const durStr = f.duration ? ` · ~${Math.round(f.duration)} сек.` : '';
      const frameCount = (f.keyframes || []).length;
      t += `\n\n═══════════════════════════════════════════════════════════════\n[ВЛОЖЕННАЯ ВИДЕОЗАПИСЬ #${idx + 1}: «${fileName}»${durStr} (${frameCount} ключевых кадров передано в Vision)]\n${f.text || ''}\n[КОНЕЦ ВИДЕОЗАПИСИ]\n═══════════════════════════════════════════════════════════════\n`;
    } else if (f.kind === "artifact") {
      t += `\n\n[АРТЕФАКТ ДЛЯ РЕДАКТИРОВАНИЯ: «${f.name}», id: ${f.artId}, версия ${f.version}]\nТекущий полный код артефакта:\n\`\`\`html\n${f.code}\n\`\`\`\nСоздай обновлённую версию этого артефакта: выведи тег <artifact> с ТЕМ ЖЕ id="${f.artId}" и полным изменённым кодом.\n`;
    }
  });

  if (attachedImgs.length > 0) {
    t += `\n\n[ПРИКРЕПЛЁННЫЕ ИЗОБРАЖЕНИЯ ПОЛЬЗОВАТЕЛЯ ДЛЯ ВОЗМОЖНОГО РЕФЕРЕНСА]:\n${attachedImgs.join('\n')}\n(Ты можешь использовать их как референс стиля или персонажа, указав id через refs=... в {image_generation[...]})\n`;
  }

  // Автоматически внедряем только активное (не удаленное и не отключенное пользователем) содержимое веб-страниц
  if (Array.isArray(m.urlContents) && m.urlContents.length > 0) {
    m.urlContents.forEach((page, idx) => {
      if (page.disabled) return;
      const pUrl = page.url || '';
      const pTitle = page.title || pUrl;
      const pContent = page.content || '';
      if (!pContent) return;
      t += `\n\n═══════════════════════════════════════════════════════════════\n[СОДЕРЖИМОЕ ВЕБ-СТРАНИЦЫ ПО ССЫЛКЕ #${idx + 1}: «${pTitle}» (${pUrl})]\n${pContent}\n[КОНЕЦ СОДЕРЖИМОГО СТРАНИЦЫ «${pUrl}»]\n═══════════════════════════════════════════════════════════════\n`;
    });
  }

  return t;
}

async function parseError(resp) {
  let msg = `HTTP ${resp.status}`;
  try {
    const j = await resp.json();
    msg =
      (j.error && (j.error.message || j.error)) || j.message || j.detail || msg;
    if (typeof msg !== "string") msg = JSON.stringify(msg);
  } catch (e) { }
  if (resp.status === 403) {
    const origin =
      window.location &&
        window.location.origin &&
        !window.location.origin.startsWith("file:")
        ? window.location.origin
        : "moonsss.app";
    msg = `Доступ запрещен (403). Проверьте настройки ключа ProxyAPI: 1) Включен ли доступ к OpenRouter; 2) Добавлен ли домен "${origin}" в белый список HTTP-Referer.`;
  }
  if (resp.status === 402)
    msg = "Недостаточно средств на балансе ProxyAPI (402). Пополните баланс.";
  if (resp.status === 401)
    msg = "Неверный API-ключ ProxyAPI (401). Проверьте правильность токена.";
  if (resp.status === 400) msg = "Неверный формат запроса (400): " + msg;
  throw new Error(msg);
}
async function readSSE(resp, onData) {
  const reader = resp.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/, "");
      buf = buf.slice(i + 1);
      // Игнорируем служебные строки SSE (event:, id:, retry:) и пустые строки-разделители
      if (
        !line ||
        line.startsWith("event:") ||
        line.startsWith("id:") ||
        line.startsWith("retry:")
      )
        continue;
      if (line.startsWith("data:")) {
        const payload = line.slice(5).trim();
        if (payload && payload !== "[DONE]") onData(payload);
      }
    }
  }
}

/* ============================================================
   ГЕНЕРАЦИЯ ИЗОБРАЖЕНИЙ: Сетевые вызовы через ProxyAPI / OpenRouter
   ============================================================ */

function resolveApiRoute(settings, model) {
  if (model && model.requiresOpenRouter) {
    const hasOR = !!String((settings && settings.orKey) || (window.state && window.state.settings && window.state.settings.orKey) || '').trim();
    return { useProxy: false, useORDirect: hasOR, missing: hasOR ? null : 'openrouter' };
  }
  const s = settings || (typeof state !== 'undefined' ? state.settings : window.state?.settings) || {};
  const modelCfg = (model && s.modelProviders && s.modelProviders[model.id]) || {};
  const src = modelCfg.apiSource && modelCfg.apiSource !== 'inherit' ? modelCfg.apiSource : (s.apiSource || 'auto');
  const hasProxy = !!(s.proxyKey || '').trim();
  const hasOR = !!(s.orKey || '').trim();
  const isORMdl = model && (model.api === 'openrouter' || model.isOpenRouterDynamic);

  if (src === 'proxy') {
    return { useProxy: hasProxy, useORDirect: false, missing: hasProxy ? null : 'proxy' };
  }
  if (src === 'openrouter') {
    return { useProxy: false, useORDirect: hasOR, missing: hasOR ? null : 'openrouter' };
  }

  // Режим 'auto': интеллектуальный выбор прямого шлюза под архитектуру модели
  if (isORMdl) {
    if (hasOR) return { useProxy: false, useORDirect: true, missing: null };
    if (hasProxy) return { useProxy: true, useORDirect: false, missing: null };
    return { useProxy: false, useORDirect: false, missing: 'openrouter' };
  }

  if (hasProxy) return { useProxy: true, useORDirect: false, missing: null };
  if (hasOR) return { useProxy: false, useORDirect: true, missing: null };
  return { useProxy: false, useORDirect: false, missing: 'proxy' };
}

function getAppSettings() {
  return (typeof state !== 'undefined' && state.settings) || window.state?.settings || {};
}

function fmtDur(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

/* ============================================================
   СЕТЕВЫЕ ВЫЗОВЫ ИНСТРУМЕНТОВ: Делегированы в toolCalling.js
   ============================================================ */
function resolveImgModel(name) {
  const n = String(name || "").trim().toLowerCase();
  if (!n) return null;
  const list = window.IMG_MODELS || (window.toolCalling && window.toolCalling.IMG_MODELS) || [];
  return (
    list.find((m) => m.id === n || m.name.toLowerCase() === n || (m.aliases && m.aliases.includes(n))) ||
    list.find((m) => m.aliases && m.aliases.some((a) => n.includes(a)))
  );
}

function getSharedAttributionHeaders(subTitle = '') {
  if (typeof window !== 'undefined' && typeof window.getOpenRouterAttributionHeaders === 'function') {
    return window.getOpenRouterAttributionHeaders(subTitle);
  }
  const appMeta = window.APP_IDENTITY || {
    title: 'MoonSSS',
    refererUrl: 'https://unichat2.sahbanovtimur228.workers.dev'
  };
  return {
    "HTTP-Referer": appMeta.refererUrl,
    "X-Title": appMeta.title
  };
}

/* --- OpenRouter через ProxyAPI (оплата ключом ProxyAPI) --- */
async function streamOpenRouter(model, history, cb, aiMsg, chat) {
  const s = getAppSettings();
  const direct = cb.direct;
  // Нативным OpenAI через ProxyAPI считаются только модели с явным api: 'openai'
  const isOpenAIModel = model.id.startsWith("openai/") && model.api !== "openrouter";

  // Динамическое вычисление актуального ID модели и выбранного flavor
  const rawBaseId = (model.api === 'anthropic' || model.api === 'gemini')
    ? model.id
    : (model.native || model.id);

  const cleanBaseId = rawBaseId.replace(/:[a-zA-Z0-9_.-]+$/i, '');
  const catalogEntry = typeof window.getModelCatalogEntry === 'function'
    ? window.getModelCatalogEntry(cleanBaseId)
    : (window.MODEL_ENDPOINTS_CATALOG?.[cleanBaseId] || {});

  const modelCfg = (s.modelProviders && (s.modelProviders[model.id] || s.modelProviders[cleanBaseId])) || {};
  const activeFlavor = modelCfg.flavor || catalogEntry.defaultFlavor || 'standard';

  let actualModel = cleanBaseId;
  if (activeFlavor && activeFlavor !== 'standard' && activeFlavor !== 'default') {
    actualModel = `${cleanBaseId}:${activeFlavor}`;
  }

  let url, key;
  if (direct) {
    url = "https://openrouter.ai/api/v1/chat/completions";
    key = s.orKey.trim();
  } else if (isOpenAIModel) {
    // ProxyAPI ведёт модели OpenAI отдельно: через OpenRouter они недоступны.
    url = "https://api.proxyapi.ru/openai/v1/chat/completions";
    key = s.proxyKey.trim();
    actualModel = cleanBaseId.replace(/^openai\//, "");
    const isSearchPreview =
      /^gpt-4o/.test(actualModel) && cb.wsEnabled && !cb.webSearchContext;
    if (!isSearchPreview) {
      return streamOpenAIResponses(model, history, cb, aiMsg, chat);
    }
  } else {
    url = "https://api.proxyapi.ru/openrouter/v1/chat/completions";
    key = s.proxyKey.trim();
  }

  // Build messages with web search context if available
  let msgs = [];
  {
    const rawMsgs = [];
    const sysPromptFn = typeof window.getSystemPromptText === 'function' ? window.getSystemPromptText : (typeof getSystemPromptText === 'function' ? getSystemPromptText : null);
    let sysText = typeof sysPromptFn === 'function' ? sysPromptFn(model) : (s.systemPrompt || '');
    const rolePolicy = typeof window.getRequestRolePolicy === 'function'
      ? window.getRequestRolePolicy(model, chat)
      : { inputRole: 'user', instructionRole: 'system', developerMode: false };

    if (sysText) {
      rawMsgs.push({ role: rolePolicy.instructionRole, content: sysText });
    }

    const canUseVision = Boolean(model && model.vision);
    for (const m of history) {
      if (m.role === "user" || m.role === "developer") {
        const imgs = collectAttachmentVisionImages(m.attachments);
        const txt = textWithFiles(m) || " ";
        if (imgs.length && canUseVision) {
          rawMsgs.push({
            role: rolePolicy.inputRole,
            content: [
              { type: "text", text: txt },
              ...imgs.map((im) => ({
                type: "image_url",
                image_url: { url: im.dataUrl },
              })),
            ],
          });
        } else {
          rawMsgs.push({ role: rolePolicy.inputRole, content: txt });
        }
      } else {
        let contentParts = [];
        const textContent = formatAssistantContentForHistory(m);

        const imgs = [];
        (m.imageRequests || []).forEach(r => {
          if (r.status === 'done' && r.dataUrl) imgs.push({ url: r.dataUrl });
        });
        (m.generatedImages || []).forEach(g => {
          if (g.status === 'done' && g.dataUrl) imgs.push({ url: g.dataUrl });
        });

        if (imgs.length && model.vision) {
          contentParts.push({ type: "text", text: textContent || " " });
          imgs.forEach(im => contentParts.push({ type: "image_url", image_url: { url: im.url } }));
        }

        const assistantMsg = {
          role: "assistant",
          content: contentParts.length ? contentParts : (textContent || " ")
        };

        if (Array.isArray(m.reasoning_details) && m.reasoning_details.length > 0) {
          assistantMsg.reasoning_details = m.reasoning_details;
        }
        if (m.encrypted_content) {
          assistantMsg.encrypted_content = m.encrypted_content;
        }
        if (Array.isArray(m.openai_reasoning)) {
          assistantMsg.openai_reasoning = m.openai_reasoning;
        }
        rawMsgs.push(assistantMsg);
      }
    }

    // Merge consecutive same-role messages (НИКОГДА не объединяем системные инструкции и developer-сообщения между собой)
    for (const msg of rawMsgs) {
      const last = msgs[msgs.length - 1];
      const isMergeable = last && last.role === msg.role && msg.role !== "developer" && msg.role !== "system";
      if (isMergeable) {
        if (
          typeof last.content === "string" &&
          typeof msg.content === "string"
        ) {
          last.content = (last.content + "\n\n" + msg.content).trim();
        } else if (Array.isArray(last.content) && Array.isArray(msg.content)) {
          last.content = [...last.content, ...msg.content];
        } else {
          msgs.push(msg);
        }
      } else {
        msgs.push(msg);
      }
    }
  }

  let isSearchPreviewModel = actualModel.includes("search-preview");
  // Build request body: основной поток всегда стримит,
  // веб-поиск выполняется отдельно в performWebSearch (Grounding)
  // Исключение: search-preview модели OpenAI не поддерживают SSE-стриминг
  const body = {
    model: actualModel,
    messages: msgs,
    stream: !isSearchPreviewModel,
  };

  if (chat && chat.id) {
    body.session_id = String(chat.id).slice(0, 128);
  }
  if (aiMsg && aiMsg.id) {
    body.user = 'user_' + String(chat?.id || aiMsg.id).slice(0, 64);
  }
  body.metadata = {
    app_title: (window.APP_IDENTITY?.title || 'MoonSSS'),
    app_url: (window.APP_IDENTITY?.refererUrl || 'https://unichat2.sahbanovtimur228.workers.dev'),
    app_icon: (window.APP_IDENTITY?.faviconUrl || 'https://unichat2.sahbanovtimur228.workers.dev/favicon.ico'),
    favicon_url: (window.APP_IDENTITY?.faviconUrl || 'https://unichat2.sahbanovtimur228.workers.dev/favicon.ico'),
    description: (window.APP_IDENTITY?.description || 'MoonSSS — премиальный ИИ-ассистент')
  };
  if (isSearchPreviewModel) {
    delete body.max_completion_tokens;
    delete body.temperature;
    delete body.reasoning_effort;
    // Search-preview модели имеют ограниченный набор параметров
    body.web_search_options = {
      search_context_size: "low",
      user_location: {
        type: "approximate",
        approximate: { country: "RU", city: "Moscow", region: "Moscow" },
      },
    };
  } else if (isOpenAIModel && !direct) {
    // Нативный протокол OpenAI: gpt-5 принимает max_completion_tokens,
    // уровень размышлений задаётся через reasoning_effort (low/medium/high/xhigh/max)
    const supportsSearchPreview = /^gpt-4o/.test(actualModel);
    if (cb.wsEnabled && !cb.webSearchContext && supportsSearchPreview) {
      const wsCfg = s.webSearchCfg?.openai || {};
      // Search-preview: нет SSE-стриминга и reasoning-параметров
      actualModel += "-search-preview";
      isSearchPreviewModel = true;
      body.model = actualModel;
      body.stream = false;
      delete body.max_completion_tokens;
      delete body.temperature;
      delete body.reasoning_effort;
      body.web_search_options = {
        search_context_size: wsCfg.context_size || "medium",
        user_location: {
          type: "approximate",
          approximate: {
            country: wsCfg.country || "RU",
            city: wsCfg.city || "Moscow",
            region: wsCfg.region || "Moscow",
          },
        },
      };
    } else {
      body.temperature = 1;
      if (s.reasoning !== "off" && s.reasoning !== "not-supported") {
        const effortMap = {
          minimal: "minimal",
          low: "low",
          mid: "medium",
          medium: "medium",
          high: "high",
          xhigh: "xhigh",
          max: "max",
        };
        body.reasoning_effort = effortMap[s.reasoning] || s.reasoning;
      }
    }
  } else {
    // Протокол OpenRouter (прямой ключ или не-OpenAI модели через ProxyAPI)
    // Лимит max_tokens опущен: модель выдаёт ответ до своего нативного максимума
    body.temperature = 1;
    const isOpenRouterModel =
      direct ||
      model.id.startsWith("openrouter/") ||
      model.id.startsWith("qwen/") ||
      model.provider === "OpenRouter";
    if (isOpenRouterModel || model.reasoning) {
      const modelCfg = (s.modelProviders && (s.modelProviders[model.id] || s.modelProviders[actualModel])) || {};
      const chosenEffort = modelCfg.reasoningEffort || s.reasoningEffort || "medium";
      const isAlwaysReasoning = Boolean(
        (Array.isArray(model.reasoningLevels) && model.reasoningLevels.includes("always") && !model.reasoningLevels.includes("off")) ||
        actualModel.includes("fable") ||
        actualModel.includes("opus-5") ||
        actualModel.includes("grok-4") ||
        actualModel.includes("hy4") ||
        actualModel.includes("deepseek-v4")
      );

      if (aiMsg?._forceDirectAnswer) {
        body.reasoning = { effort: "low" };
        body.include_reasoning = false;
      } else if (!isAlwaysReasoning && (s.reasoning === "off" || s.reasoning === "not-supported")) {
        body.reasoning = { enabled: false };
        body.include_reasoning = false;
      } else {
        // Для моделей с постоянным thinking: передаем актуальный effort и include_reasoning
        const eff = (s.reasoning === "off" || s.reasoning === "not-supported") ? "low" : (chosenEffort || "medium");
        body.reasoning = { effort: eff };
        const rawSummary = modelCfg.openaiReasoningSummary || s.openaiReasoningSummary;
        if (rawSummary && rawSummary !== "none" && rawSummary !== "off") {
          body.reasoning.summary = rawSummary;
        }
        const rawDisplay = modelCfg.claudeThinkingDisplay || s.claudeThinkingDisplay;
        if (rawDisplay) {
          body.reasoning.display = (s.reasoning === "off") ? "omitted" : rawDisplay;
        }
        body.include_reasoning = (s.reasoning !== "off");
      }
    }

    if (typeof window.buildOpenRouterProviderPayload === 'function') {
      const pPayload = window.buildOpenRouterProviderPayload(s, actualModel);
      if (pPayload) body.provider = pPayload;
    }

    if (!body.tools && !isSearchPreviewModel) {
      let userTz = 'UTC';
      try { userTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (_) { }
      const webFetchEngine = s.webSearchCfg?.openrouter?.web_fetch_engine || 'auto';
      const webFetchTool = { type: "openrouter:web_fetch" };
      if (webFetchEngine && webFetchEngine !== 'auto') {
        webFetchTool.parameters = { engine: webFetchEngine };
      }
      body.tools = [
        {
          type: "openrouter:datetime",
          parameters: { timezone: userTz }
        },
        webFetchTool
      ];
    }
  }

  const cleanKey = String(key || '').trim().replace(/[^\x21-\x7E]/g, '');
  const attribHeaders = getSharedAttributionHeaders();

  const streamAbortCtrl = new AbortController();
  const onExternalAbort = () => {
    try { streamAbortCtrl.abort(); } catch (_) { }
  };
  if (cb.signal) {
    if (cb.signal.aborted) streamAbortCtrl.abort();
    else cb.signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  let timedOut = false,
    timeoutId = null;
  const timeoutError = () =>
    new Error(
      "Превышено время ожидания ответа от сервера (Timeout). Проверьте интернет-соединение или ключ.",
    );
  const armTimeout = (delayMs = 35000) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      timedOut = true;
      try { streamAbortCtrl.abort(); } catch (_) { }
    }, delayMs);
  };

  armTimeout(75000);
  let resp;
  try {
    resp = await fetch(url, {
      method: "POST",
      signal: streamAbortCtrl.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + cleanKey,
        ...attribHeaders
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (cb.signal) cb.signal.removeEventListener('abort', onExternalAbort);
    if (timedOut) throw timeoutError();
    throw err;
  }
  armTimeout(45000);
  if (!resp.ok) {
    clearTimeout(timeoutId);
    if (cb.signal) cb.signal.removeEventListener('abort', onExternalAbort);
    await parseError(resp);
  }

  // Обработка non-streaming ответа для search-preview моделей
  if (isSearchPreviewModel) {
    let j;
    try {
      j = await resp.json();
    } catch (err) {
      clearTimeout(timeoutId);
      if (timedOut) throw timeoutError();
      throw err;
    }
    clearTimeout(timeoutId);
    if (j.error) {
      const errStr =
        typeof j.error === "string"
          ? j.error
          : j.error.message || JSON.stringify(j.error);
      throw new Error(errStr);
    }
    const ch = j.choices && j.choices[0];
    if (ch) {
      const msg = ch.message || {};
      if (typeof msg.content === "string" && msg.content)
        cb.onText(msg.content);
      const annotations = msg.annotations;
      if (Array.isArray(annotations) && annotations.length) {
        const sources = [];
        const seenUris = new Set();
        annotations.forEach((a) => {
          const uc = a.url_citation || {};
          const uri = uc.url || a.url || a.url_encoded || "";
          if (uri && !seenUris.has(uri)) {
            seenUris.add(uri);
            sources.push({
              uri,
              title: uc.title || a.title || uri,
              snippet: uc.snippet || a.snippet || "",
            });
          }
        });
        if (sources.length) cb.onWebSearch({ queries: [], sources });
      }
    }
    return;
  }

  // Track collected web search sources to emit once (for standard streaming)
  const collectedSources = [];
  const seenUris = new Set();
  let inThinkTag = false;
  let thinkTagBuffer = "";
  try {
    await readSSE(resp, (payload) => {
      armTimeout(35000);
      if (payload === "[DONE]") {
        if (thinkTagBuffer) {
          if (inThinkTag) cb.onThink(thinkTagBuffer);
          else cb.onText(thinkTagBuffer);
          thinkTagBuffer = "";
        }
        return;
      }
      let j;
      try {
        j = JSON.parse(payload);
      } catch (e) {
        return;
      }
      if (j.error) {
        const errStr =
          typeof j.error === "string"
            ? j.error
            : j.error.message || JSON.stringify(j.error);
        throw new Error(errStr);
      }
      const ch = j.choices && j.choices[0];
      if (!ch) return;
      const d = ch.delta || {};

      // Потоковый перехват рассуждений с буферизацией разрезанных тегов <think> и </think>
      if (typeof d.content === "string" && d.content) {
        let chunkText = thinkTagBuffer + d.content;
        thinkTagBuffer = "";
        while (chunkText) {
          if (!inThinkTag) {
            const startIdx = chunkText.indexOf("<think>");
            if (startIdx !== -1) {
              const before = chunkText.slice(0, startIdx);
              if (before) cb.onText(before);
              inThinkTag = true;
              chunkText = chunkText.slice(startIdx + 7);
            } else {
              const partialMatch = chunkText.match(/<\/?t?h?i?n?k?$/i);
              if (partialMatch && partialMatch.index !== undefined) {
                const before = chunkText.slice(0, partialMatch.index);
                if (before) cb.onText(before);
                thinkTagBuffer = chunkText.slice(partialMatch.index);
                chunkText = "";
              } else {
                cb.onText(chunkText);
                chunkText = "";
              }
            }
          } else {
            const endIdx = chunkText.indexOf("</think>");
            if (endIdx !== -1) {
              const thinkPart = chunkText.slice(0, endIdx);
              if (thinkPart) cb.onThink(thinkPart);
              inThinkTag = false;
              chunkText = chunkText.slice(endIdx + 8);
            } else {
              const partialMatch = chunkText.match(/<\/t?h?i?n?k?$/i);
              if (partialMatch && partialMatch.index !== undefined) {
                const before = chunkText.slice(0, partialMatch.index);
                if (before) cb.onThink(before);
                thinkTagBuffer = chunkText.slice(partialMatch.index);
                chunkText = "";
              } else {
                cb.onThink(chunkText);
                chunkText = "";
              }
            }
          }
        }
      }

      // Reasoning tokens (фильтруем случайные внутренние теги <think>)
      const r = d.reasoning ?? d.reasoning_content;
      if (typeof r === "string" && r) {
        const cleanR = r.replace(/<\/?think>/gi, '');
        if (cleanR) cb.onThink(cleanR);
      }
      if (d.reasoning_details && cb.onReasoningDetails)
        cb.onReasoningDetails(d.reasoning_details);
      // Images (OpenRouter)
      const im = (ch.message && ch.message.images) || d.images;
      if (Array.isArray(im))
        im.forEach((x) => {
          const u = x?.image_url?.url || x?.url;
          if (u) cb.onImage(u);
        });
      // Сохранение encrypted_content для reasoning-моделей OpenAI (GPT-5, o3, o4-mini)
      // Это поле содержит зашифрованный reasoning-контекст для передачи между ходами
      if (ch.finish_reason && ch.message && ch.message.encrypted_content) {
        if (aiMsg) aiMsg.encrypted_content = ch.message.encrypted_content;
      }

      if (ch.finish_reason === 'length' && aiMsg) {
        aiMsg._hitLengthLimit = true;
      }

      // Web search annotations (OpenAI search-preview)
      // Can appear in delta or in final message
      const msgAnnotations = ch.message && ch.message.annotations;
      const deltaAnnotations = d.annotations;
      const annotations = deltaAnnotations || msgAnnotations;
      const dHost = typeof window.domainHost === 'function' ? window.domainHost : (u => {
        try { return new URL(u).hostname.replace(/^www\./, ''); } catch (_) { return 'веб-сайт'; }
      });
      if (Array.isArray(annotations)) {
        annotations.forEach((a) => {
          const uc = a.url_citation || {};
          const uri = uc.url || a.url || a.url_encoded || "";
          if (uri && !seenUris.has(uri) && /^https?:\/\//i.test(uri)) {
            seenUris.add(uri);
            const sObj = {
              uri,
              title: (uc.title && uc.title !== uri) ? uc.title : dHost(uri),
              snippet: uc.snippet || a.snippet || "",
            };
            collectedSources.push(sObj);
            cb.onWebSearch({ queries: [], sources: [sObj] });
          }
        });
      }

      const rawCitations = j.citations || ch.citations || d.citations || (ch.message && ch.message.citations);
      if (Array.isArray(rawCitations)) {
        rawCitations.forEach((c) => {
          const uri = typeof c === 'string' ? c : (c.url || c.uri || '');
          if (uri && !seenUris.has(uri) && /^https?:\/\//i.test(uri)) {
            seenUris.add(uri);
            const sObj = {
              uri,
              title: (typeof c === 'object' && c.title && c.title !== uri) ? c.title : dHost(uri),
              snippet: typeof c === 'object' ? (c.snippet || '') : '',
            };
            collectedSources.push(sObj);
            cb.onWebSearch({ queries: [], sources: [sObj] });
          }
        });
      }

      // Emit web search results on final chunk (finish_reason present)
      if (ch.finish_reason && collectedSources.length) {
        cb.onWebSearch({ queries: [], sources: collectedSources });
      }
    });

    // Final emit if stream ended without finish_reason but we have sources
    if (collectedSources.length) {
      cb.onWebSearch({ queries: [], sources: collectedSources });
    }
  } catch (err) {
    if (timedOut) throw timeoutError();
    throw err;
  } finally {
    clearTimeout(timeoutId);
    if (cb.signal) cb.signal.removeEventListener('abort', onExternalAbort);
  }
}

/* --- OpenAI Responses API (нативный ProxyAPI) ---
Chat Completions не возвращает reasoning-текст вообще. Responses API с
reasoning.summary стримит видимые размышления (событие
response.reasoning_summary_text.delta), а reasoning-элементы с
encrypted_content сохраняются и возвращаются в input следующего хода —
модель продолжает цепочку и попадает в кэш (40–80% экономии по документации). */
async function streamOpenAIResponses(model, history, cb, aiMsg, chat) {
  const s = getAppSettings();
  const key = (s.proxyKey || "").trim();
  const actualModel = model.id.replace(/^openai\//, "");
  const input = [];
  const sysPromptFn = typeof window.getSystemPromptText === 'function' ? window.getSystemPromptText : (typeof getSystemPromptText === 'function' ? getSystemPromptText : null);
  let sysText = typeof sysPromptFn === 'function' ? sysPromptFn(model) : (s.systemPrompt || '');
  const rolePolicy = typeof window.getRequestRolePolicy === 'function'
    ? window.getRequestRolePolicy(model, chat)
    : { inputRole: 'user', instructionRole: 'system', developerMode: false };

  if (sysText) {
    input.push({ role: rolePolicy.instructionRole, content: sysText });
  }

  for (const m of history) {
    if (m.role === "user" || m.role === "developer") {
      const imgs = collectAttachmentVisionImages(m.attachments);
      const txt = textWithFiles(m) || " ";
      if (imgs.length) {
        input.push({
          role: rolePolicy.inputRole,
          content: [
            { type: "input_text", text: txt },
            ...imgs.map((im) => ({
              type: "input_image",
              image_url: im.dataUrl,
              detail: "auto",
            })),
          ],
        });
      } else {
        input.push({ role: rolePolicy.inputRole, content: txt });
      }
    } else {
      // ВАЖНО: Возвращаем reasoning-элементы ДО assistant-сообщения — цепочка продолжается
      // Это позволяет модели продолжать рассуждения с того же места и попадать в кэш (40-80% экономии)
      if (Array.isArray(m.openai_reasoning)) {
        m.openai_reasoning.forEach((it) => {
          if (it && it.encrypted_content) {
            input.push({
              type: "reasoning",
              encrypted_content: it.encrypted_content,
            });
          }
        });
      }
      const assistantText = formatAssistantContentForHistory(m);
      input.push({ role: "assistant", content: assistantText || " " });
    }
  }
  const effortMap = {
    minimal: "minimal",
    low: "low",
    medium: "medium",
    mid: "medium",
    high: "high",
    xhigh: "xhigh",
    max: "max",
  };
  const body = {
    model: actualModel,
    input,
    stream: true,
    temperature: 1,
    include: ["reasoning.encrypted_content"],
  };
  if (s.reasoning !== "off" && s.reasoning !== "not-supported") {
    const modelCfg = (s.modelProviders && (s.modelProviders[model.id] || s.modelProviders[actualModel])) || {};
    const rawSummary = modelCfg.openaiReasoningSummary || s.openaiReasoningSummary || "auto";
    const summaryVal = (rawSummary === "none" || rawSummary === "off" || rawSummary === "omitted") ? null : rawSummary;
    const modeVal = modelCfg.openaiReasoningMode || s.openaiReasoningMode || "standard";
    const chosenEffort = modelCfg.reasoningEffort || s.reasoningEffort || effortMap[s.reasoning] || "medium";

    body.reasoning = {
      effort: chosenEffort,
      summary: summaryVal,
      mode: modeVal,
    };
  }
  const useNativeOpenAISearch = (typeof window.toolCalling?.isModelUsingNativeSearch === 'function')
    ? window.toolCalling.isModelUsingNativeSearch(model, s)
    : ((s.webSearchCfg?.openai?.engine || 'native') === 'native');

  if (cb.wsEnabled && !cb.webSearchContext && useNativeOpenAISearch) {
    const wsCfg = s.webSearchCfg?.openai || {};
    const webSearchTool = {
      type: "web_search",
      search_context_size: wsCfg.context_size || "medium",
    };
    if (wsCfg.country || wsCfg.city || wsCfg.region) {
      webSearchTool.user_location = {
        type: "approximate",
        country: wsCfg.country || "RU",
        city: wsCfg.city || "Moscow",
        region: wsCfg.region || "Moscow",
      };
    }
    if (wsCfg.allowed_domains && wsCfg.allowed_domains.trim()) {
      webSearchTool.allowed_domains = wsCfg.allowed_domains.split(',').map(d => d.trim()).filter(Boolean);
    }
    if (wsCfg.blocked_domains && wsCfg.blocked_domains.trim()) {
      webSearchTool.blocked_domains = wsCfg.blocked_domains.split(',').map(d => d.trim()).filter(Boolean);
    }
    body.tools = [webSearchTool];
  }
  const cleanKey = String(key || '').trim().replace(/[^\x21-\x7E]/g, '');
  const attribHeaders = getSharedAttributionHeaders();

  const fetchPromise = fetch("https://api.proxyapi.ru/openai/v1/responses", {
    method: "POST",
    signal: cb.signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + cleanKey,
      ...attribHeaders
    },
    body: JSON.stringify({
      ...body,
      metadata: {
        app_title: (window.APP_IDENTITY?.title || 'MoonSSS'),
        app_url: (window.APP_IDENTITY?.refererUrl || 'https://unichat2.sahbanovtimur228.workers.dev/ai'),
        favicon_url: (window.APP_IDENTITY?.faviconUrl || 'https://unichat2.sahbanovtimur228.workers.dev/favicon.ico'),
        description: (window.APP_IDENTITY?.description || 'MoonSSS — премиальный ИИ-ассистент')
      }
    }),
  });
  let timedOut = false,
    timeoutId = null;
  const timeoutError = () =>
    new Error(
      "Превышено время ожидания ответа от OpenAI (Timeout). Проверьте интернет-соединение или ключ.",
    );
  const armTimeout = () => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      timedOut = true;
      try {
        cb.signal && cb.signal.abort();
      } catch (e) { }
    }, 120000);
  };
  armTimeout();
  let resp;
  try {
    resp = await fetchPromise;
  } catch (err) {
    clearTimeout(timeoutId);
    if (timedOut) throw timeoutError();
    throw err;
  }
  armTimeout();
  if (!resp.ok) {
    clearTimeout(timeoutId);
    await parseError(resp);
  }
  const collectedSources = [];
  const seenUris = new Set();
  try {
    await readSSE(resp, (payload) => {
      armTimeout();
      let j;
      try {
        j = JSON.parse(payload);
      } catch (e) {
        return;
      }
      const t = j.type || "";
      if (t === "error")
        throw new Error(
          j.message ||
          (j.error && j.error.message) ||
          "Ошибка OpenAI Responses",
        );
      if (
        t === "response.output_text.delta" &&
        typeof j.delta === "string" &&
        j.delta
      )
        cb.onText(j.delta);
      if (
        t === "response.reasoning_summary_text.delta" &&
        typeof j.delta === "string" &&
        j.delta
      )
        cb.onThink(j.delta);
      // Сохраняем reasoning-блоки и ссылки-источники OpenAI в реальном времени
      if (t === "response.output_item.done" && j.item) {
        if (j.item.type === "message" && Array.isArray(j.item.content)) {
          const dHost = typeof window.domainHost === 'function' ? window.domainHost : (u => {
            try { return new URL(u).hostname.replace(/^www\./, ''); } catch (_) { return 'веб-сайт'; }
          });
          j.item.content.forEach((c) =>
            (c.annotations || []).forEach((a) => {
              const uc = a.url_citation || {};
              const uri = uc.url || a.url || "";
              if (uri && !seenUris.has(uri) && /^https?:\/\//i.test(uri)) {
                seenUris.add(uri);
                const sObj = {
                  uri,
                  title: (uc.title && uc.title !== uri) ? uc.title : dHost(uri),
                  snippet: uc.snippet || a.snippet || "",
                };
                collectedSources.push(sObj);
                cb.onWebSearch({ queries: [], sources: [sObj] });
              }
            }),
          );
        }
        // Сохраняем encrypted_content из reasoning-элементов для продолжения цепочки
        if (j.item.type === "reasoning" && j.item.encrypted_content && aiMsg) {
          if (!aiMsg.openai_reasoning) aiMsg.openai_reasoning = [];
          aiMsg.openai_reasoning.push({
            type: "reasoning",
            encrypted_content: j.item.encrypted_content,
          });
        }
      }
      if (t === "response.completed" && j.response) {
        if (j.response.id && aiMsg) aiMsg.openai_response_id = j.response.id;
        if (j.response.status === "incomplete" && aiMsg) {
          aiMsg._hitLengthLimit = true;
        }
        // Финальное сохранение всех reasoning-элементов (страховка)
        if (aiMsg && Array.isArray(j.response.output)) {
          const rItems = j.response.output.filter(
            (it) => it && it.type === "reasoning" && it.encrypted_content,
          );
          if (rItems.length) {
            aiMsg.openai_reasoning = rItems.map((it) => ({
              type: "reasoning",
              encrypted_content: it.encrypted_content,
            }));
          }
        }
      }
    });
    if (collectedSources.length)
      cb.onWebSearch({ queries: [], sources: collectedSources });
  } catch (err) {
    if (timedOut) throw timeoutError();
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
/* --- Anthropic (нативный ProxyAPI) --- */
async function streamAnthropic(model, history, cb, aiMsg) {
  const s = getAppSettings();
  const msgs = [];
  for (const m of history) {
    if (m.role === "user" || m.role === "developer") {
      const parts = [];
      (m.attachments || []).forEach((a) => {
        if (a.kind === "image" && a.dataUrl) {
          const b64 = a.dataUrl.split(",")[1] || "";
          parts.push({
            type: "image",
            source: {
              type: "base64",
              media_type: a.mime || "image/jpeg",
              data: b64,
            },
          });
        } else if (a.kind === "document") {
          if (a.docType === 'pdf' && a.pdfBase64) {
            parts.push({
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: a.pdfBase64,
              },
            });
          } else if (Array.isArray(a.images)) {
            a.images.forEach(im => {
              if (im.dataUrl) {
                const b64 = im.dataUrl.split(",")[1] || "";
                parts.push({
                  type: "image",
                  source: { type: "base64", media_type: "image/jpeg", data: b64 },
                });
              }
            });
          }
        } else if (a.kind === "video" && Array.isArray(a.keyframes)) {
          a.keyframes.forEach(kf => {
            if (kf.dataUrl) {
              const b64 = kf.dataUrl.split(",")[1] || "";
              parts.push({
                type: "image",
                source: { type: "base64", media_type: "image/jpeg", data: b64 },
              });
            }
          });
        }
      });
      parts.push({ type: "text", text: textWithFiles(m) || " " });
      msgs.push({ role: "user", content: parts });
    } else {
      const contentBlocks = [];
      (m.thinking_blocks || []).forEach((tb) => {
        if (tb && typeof tb.thinking === "string" && tb.thinking.length) {
          contentBlocks.push({
            type: "thinking",
            thinking: tb.thinking,
            signature: tb.signature || "",
          });
        }
      });

      let textContent = formatAssistantContentForHistory(m);
      const imgs = [];
      (m.imageRequests || []).forEach(r => {
        if (r.status === 'done' && r.dataUrl) imgs.push(r.dataUrl);
      });
      (m.generatedImages || []).forEach(g => {
        if (g.status === 'done' && g.dataUrl) imgs.push(g.dataUrl);
      });

      imgs.forEach(dataUrl => {
        const b64 = dataUrl.split(",")[1] || "";
        const mime = (dataUrl.match(/^data:([^;,]+)/) || [])[1] || "image/jpeg";
        contentBlocks.push({
          type: "image",
          source: { type: "base64", media_type: mime, data: b64 }
        });
      });

      contentBlocks.push({ type: "text", text: textContent || " " });
      msgs.push({ role: "assistant", content: contentBlocks });
    }
  }
  const body = {
    model: model.native || model.id,
    stream: true,
    messages: msgs,
  };
  const isClaude5 =
    model.native &&
    (model.native.includes("opus-5") ||
      model.native.includes("sonnet-5") ||
      model.native.includes("fable-5") ||
      model.native.includes("claude-5"));
  const modelCfg = (s.modelProviders && (s.modelProviders[model.id] || s.modelProviders[model.native])) || {};
  const chosenEffort = modelCfg.reasoningEffort || s.reasoningEffort || "medium";
  const isOpus5 = model.native && model.native.includes("opus-5");
  const isOpusEnforced = isOpus5 && (chosenEffort === "xhigh" || chosenEffort === "max");

  const isAlwaysClaude = isClaude5 && (
    (model.native && (model.native.includes("fable") || model.native.includes("opus-5"))) ||
    isOpusEnforced
  );

  if (model.reasoning && (isAlwaysClaude || (s.reasoning !== "off" && s.reasoning !== "not-supported"))) {
    if (isClaude5) {
      // Claude 5.1 / 5.5: адаптивный протокол. Мышление всегда включено, при 'off' скрываем display
      const effortMap = {
        minimal: "low",
        low: "low",
        medium: "medium",
        mid: "medium",
        high: "high",
        xhigh: "xhigh",
        max: "max",
        always: "medium"
      };
      const defaultDisplay = (s.reasoning === "off") ? "omitted" : (modelCfg.claudeThinkingDisplay || s.claudeThinkingDisplay || "summarized");
      body.thinking = {
        type: "adaptive",
        display: defaultDisplay,
      };
      body.output_config = { effort: effortMap[chosenEffort] || "medium" };
      body.temperature = 1;
      body.max_tokens = 64000;
    } else {
      // Claude: классический extended thinking с расширенным бюджетом токенов
      const budget = THINK_BUDGET[s.reasoning] || 32768;
      body.thinking = { type: "enabled", budget_tokens: budget };
      body.temperature = 1;
      body.max_tokens = Math.max(64000, budget + 32000);
    }
  } else {
    body.temperature = 1;
    body.max_tokens = 64000;
  }
  const useNativeSearch = (typeof window.toolCalling?.isModelUsingNativeSearch === 'function')
    ? window.toolCalling.isModelUsingNativeSearch(model, s)
    : ((s.webSearchCfg?.anthropic?.engine || 'native') === 'native');

  if (cb.wsEnabled && !cb.webSearchContext && useNativeSearch) {
    const wsCfg = s.webSearchCfg?.anthropic || {};
    const webSearchTool = {
      type: "web_search_20250305",
      name: "web_search",
      max_uses: wsCfg.max_uses || 3,
    };

    if (wsCfg.allowed_domains && wsCfg.allowed_domains.trim()) {
      webSearchTool.allowed_domains = wsCfg.allowed_domains
        .split(",")
        .map((d) => d.trim())
        .filter((d) => d);
    }
    if (wsCfg.blocked_domains && wsCfg.blocked_domains.trim()) {
      webSearchTool.blocked_domains = wsCfg.blocked_domains
        .split(",")
        .map((d) => d.trim())
        .filter((d) => d);
    }

    if (wsCfg.city || wsCfg.country || wsCfg.region || wsCfg.timezone) {
      webSearchTool.user_location = {
        type: "approximate",
        country: wsCfg.country || "RU",
        city: wsCfg.city || "Moscow",
        region: wsCfg.region || "Moscow",
        timezone: wsCfg.timezone || "Europe/Moscow",
      };
    }

    body.tools = [webSearchTool];
  }
  // Формируем system prompt с учётом webSearchContext + инструмента генерации изображений
  const sysPromptFn = typeof getSystemPromptText === 'function' ? getSystemPromptText : window.getSystemPromptText;
  let systemContent = typeof sysPromptFn === 'function' ? sysPromptFn(model) : '';
  if (cb.webSearchContext && cb.webSearchContext.result) {
    const searchBlock = `
=== АКТУАЛЬНЫЕ РЕЗУЛЬТАТЫ ПОИСКА ИЗ ИНТЕРНЕТА (GROUNDING) ===
${cb.webSearchContext.result}
========================================================
Используй эти результаты для ответа. Ссылайся на источники, если это уместно.`;
    systemContent = systemContent
      ? systemContent + searchBlock
      : searchBlock.trim();
  }
  // Явное кэширование system prompt: Anthropic даёт 90% скидку на cache hit
  // Без cache_control провайдер кеширует по эвристикам — hit rate ниже
  if (systemContent) {
    body.system = [
      {
        type: "text",
        text: systemContent,
        cache_control: { type: "ephemeral" },
      },
    ];
  }
  const streamAbortCtrl = new AbortController();
  const onExternalAbort = () => {
    try { streamAbortCtrl.abort(); } catch (_) { }
  };
  if (cb.signal) {
    if (cb.signal.aborted) streamAbortCtrl.abort();
    else cb.signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  let timedOut = false,
    timeoutId = null;
  const timeoutError = () =>
    new Error(
      "Превышено время ожидания ответа от Anthropic (Timeout). Проверьте интернет-соединение или ключ.",
    );
  const armTimeout = (delayMs = 35000) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      timedOut = true;
      try { streamAbortCtrl.abort(); } catch (_) { }
    }, delayMs);
  };
  armTimeout(75000);
  let resp;
  try {
    resp = await fetch("https://api.proxyapi.ru/anthropic/v1/messages", {
      method: "POST",
      signal: streamAbortCtrl.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + s.proxyKey.trim(),
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (cb.signal) cb.signal.removeEventListener('abort', onExternalAbort);
    if (timedOut) throw timeoutError();
    throw err;
  }
  armTimeout(45000);
  if (!resp.ok) {
    clearTimeout(timeoutId);
    if (cb.signal) cb.signal.removeEventListener('abort', onExternalAbort);
    await parseError(resp);
  }
  try {
    await readSSE(resp, (payload) => {
      armTimeout(35000);
      let j;
      try {
        j = JSON.parse(payload);
      } catch (e) {
        return;
      }
      if (j.type === "error")
        throw new Error(j.error?.message || "Ошибка Anthropic");
      if (j.type === "content_block_start") {
        const cb2 = j.content_block || {};
        if (cb2.type === "thinking") {
          if (!aiMsg.thinking_blocks) aiMsg.thinking_blocks = [];
          aiMsg.thinking_blocks.push({
            type: "thinking",
            thinking: "",
            signature: "",
          });
        }
        if (
          (cb2.type === "web_search_tool_result" || cb2.type === "tool_result") &&
          Array.isArray(cb2.content)
        ) {
          const dHost = typeof window.domainHost === 'function' ? window.domainHost : (u => {
            try { return new URL(u).hostname.replace(/^www\./, ''); } catch (_) { return 'веб-сайт'; }
          });
          const sources = cb2.content
            .filter((r) => r && (r.type === "web_search_result" || r.url))
            .map((r) => ({
              uri: r.url || "",
              title: (r.title && r.title !== r.url) ? r.title : dHost(r.url),
              page_age: r.page_age || "",
            }))
            .filter((s) => s.uri && /^https?:\/\//i.test(s.uri));
          if (sources.length) cb.onWebSearch({ queries: [], sources });
        }
      }
      if (j.type === "message_delta") {
        if (j.delta?.stop_reason === "max_tokens" && aiMsg) {
          aiMsg._hitLengthLimit = true;
        }
      }
      if (j.type === "content_block_delta") {
        const d = j.delta || {};
        if (d.type === "text_delta" && d.text) cb.onText(d.text);
        if (d.type === "thinking_delta" && d.thinking) {
          cb.onThink(d.thinking);
          if (aiMsg.thinking_blocks && aiMsg.thinking_blocks.length > 0) {
            aiMsg.thinking_blocks[aiMsg.thinking_blocks.length - 1].thinking +=
              d.thinking;
          }
        }
        if (d.type === "signature_delta" && d.signature) {
          if (aiMsg.thinking_blocks && aiMsg.thinking_blocks.length > 0) {
            aiMsg.thinking_blocks[aiMsg.thinking_blocks.length - 1].signature =
              d.signature;
          }
        }
      }
      if (j.type === "content_block_stop") {
        // Завершение блока — ничего дополнительного не делаем,
        // thinking_blocks уже накоплены через content_block_delta
      }
    });
  } catch (err) {
    if (timedOut) throw timeoutError();
    throw err;
  } finally {
    clearTimeout(timeoutId);
    if (cb.signal) cb.signal.removeEventListener('abort', onExternalAbort);
  }
}

/* --- Gemini (нативный ProxyAPI) --- */
async function streamGemini(model, history, cb, aiMsg) {
  const s = getAppSettings();
  const contents = [];
  for (const m of history) {
    const parts = [];
    if (m.role === "user" || m.role === "developer") {
      (m.attachments || []).forEach((a) => {
        if (a.kind === "image" && a.dataUrl) {
          parts.push({
            inlineData: {
              mimeType: a.mime || "image/jpeg",
              data: a.dataUrl.split(",")[1] || "",
            },
          });
        } else if (a.kind === "audio" && a.dataUrl) {
          const b64 = a.dataUrl.split(",")[1] || "";
          if (b64) {
            parts.push({
              inlineData: {
                mimeType: a.mime || "audio/mp3",
                data: b64,
              },
            });
          }
        } else if (a.kind === "video") {
          const b64 = a.videoDataUrl ? a.videoDataUrl.split(",")[1] : (a.dataUrl ? a.dataUrl.split(",")[1] : "");
          if (b64 && a.sizeBytes && a.sizeBytes < 20 * 1024 * 1024) {
            parts.push({
              inlineData: {
                mimeType: a.mime || "video/mp4",
                data: b64,
              },
            });
          } else if (Array.isArray(a.keyframes)) {
            a.keyframes.forEach(kf => {
              if (kf.dataUrl) {
                parts.push({
                  inlineData: {
                    mimeType: "image/jpeg",
                    data: kf.dataUrl.split(",")[1] || "",
                  },
                });
              }
            });
          }
        } else if (a.kind === "document") {
          if (a.docType === 'pdf' && a.pdfBase64) {
            parts.push({
              inlineData: {
                mimeType: "application/pdf",
                data: a.pdfBase64,
              },
            });
          } else if (Array.isArray(a.images)) {
            a.images.forEach(im => {
              if (im.dataUrl) {
                parts.push({
                  inlineData: {
                    mimeType: "image/jpeg",
                    data: im.dataUrl.split(",")[1] || "",
                  },
                });
              }
            });
          }
        }
      });
      parts.push({ text: textWithFiles(m) || " " });
      contents.push({ role: "user", parts });
    } else {
      const assistantText = formatAssistantContentForHistory(m);
      const modelParts = [{ text: assistantText || " " }];
      // ВАЖНО: передаём thought_signature обратно для сохранения контекста рассуждений
      if (
        Array.isArray(m.thought_signatures) &&
        m.thought_signatures.length > 0
      ) {
        modelParts.forEach((part, idx) => {
          if (m.thought_signatures[idx]) {
            part.thoughtSignature = m.thought_signatures[idx];
          }
        });
      }
      contents.push({ role: "model", parts: modelParts });
    }
  }
  const genCfg = { temperature: 1 };
  if (model.reasoning && s.reasoning !== "off") {
    genCfg.thinkingConfig = {
      thinkingBudget: THINK_BUDGET[s.reasoning] || 4096,
      includeThoughts: true,
    };
  }
  const body = { contents, generationConfig: genCfg };
  const useNativeGeminiSearch = (typeof window.toolCalling?.isModelUsingNativeSearch === 'function')
    ? window.toolCalling.isModelUsingNativeSearch(model, s)
    : ((s.webSearchCfg?.gemini?.engine || 'native') === 'native');

  if (cb.wsEnabled && !cb.webSearchContext && useNativeGeminiSearch) {
    body.tools = [{ googleSearch: {} }];
  }
  // Формируем systemInstruction с учётом webSearchContext + инструмента генерации изображений
  const sysPromptFn = typeof getSystemPromptText === 'function' ? getSystemPromptText : window.getSystemPromptText;
  let systemContent = typeof sysPromptFn === 'function' ? sysPromptFn(model) : '';
  if (cb.webSearchContext && cb.webSearchContext.result) {
    const searchBlock = `\n\n=== АКТУАЛЬНЫЕ РЕЗУЛЬТАТЫ ПОИСКА ИЗ ИНТЕРНЕТА (GROUNDING) ===\n${cb.webSearchContext.result}\n========================================================\n\nИспользуй эти результаты для ответа. Ссылайся на источники, если это уместно.`;
    systemContent = systemContent
      ? systemContent + searchBlock
      : searchBlock.trim();
  }
  if (systemContent)
    body.systemInstruction = { parts: [{ text: systemContent }] };
  const url = `https://api.proxyapi.ru/google/v1beta/models/${model.native || model.id}:streamGenerateContent?alt=sse`;
  const fetchPromise = fetch(url, {
    method: "POST",
    signal: cb.signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + s.proxyKey.trim(),
    },
    body: JSON.stringify(body),
  });

  let timedOut = false,
    timeoutId = null;
  const timeoutError = () =>
    new Error(
      "Превышено время ожидания ответа от Gemini (Timeout). Проверьте интернет-соединение или ключ.",
    );
  const armTimeout = () => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      timedOut = true;
      try {
        cb.signal && cb.signal.abort();
      } catch (e) { }
    }, 120000);
  };
  armTimeout();
  let resp;
  try {
    resp = await fetchPromise;
  } catch (err) {
    clearTimeout(timeoutId);
    if (timedOut) throw timeoutError();
    throw err;
  }
  armTimeout(); // заголовки получены: перезапуск таймера до первого чанка
  if (!resp.ok) {
    clearTimeout(timeoutId);
    await parseError(resp);
  }
  try {
    await readSSE(resp, (payload) => {
      armTimeout(); // каждый полученный чанк сбрасывает таймер 120 сек
      let j;
      try {
        j = JSON.parse(payload);
      } catch (e) {
        return;
      }
      if (j.promptFeedback && j.promptFeedback.blockReason)
        throw new Error("Запрос заблокирован: " + j.promptFeedback.blockReason);
      const cand = j.candidates && j.candidates[0];
      if (!cand) return;
      if (cand.finishReason === "SAFETY")
        throw new Error("Ответ остановлен фильтрами безопасности");
      if (cand.finishReason === "MAX_TOKENS" && aiMsg) {
        aiMsg._hitLengthLimit = true;
      }
      (cand.content?.parts || []).forEach((p) => {
        if (typeof p.text === "string") {
          if (p.thought) {
            cb.onThink(p.text);
            // Сохраняем thought_signature для многоходовых диалогов
            if (p.thoughtSignature && aiMsg) {
              if (!aiMsg.thought_signatures) aiMsg.thought_signatures = [];
              aiMsg.thought_signatures.push(p.thoughtSignature);
            }
          } else {
            cb.onText(p.text);
          }
        }
      });
      if (cand.groundingMetadata) {
        const gm = cand.groundingMetadata;
        const queries = gm.webSearchQueries || [];
        const dHost = typeof window.domainHost === 'function' ? window.domainHost : (u => {
          try { return new URL(u).hostname.replace(/^www\./, ''); } catch (_) { return 'веб-сайт'; }
        });
        const sources = (gm.groundingChunks || [])
          .map((c) => {
            const rawUri = c.web?.uri || "";
            return {
              uri: rawUri,
              title: c.web?.title && c.web.title !== rawUri ? c.web.title : dHost(rawUri),
            };
          })
          .filter((s) => s.uri && /^https?:\/\//i.test(s.uri));
        if (queries.length || sources.length)
          cb.onWebSearch({ queries, sources });
      }
    });
  } catch (err) {
    if (timedOut) throw timeoutError();
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/* ═══════════════════════════════════════════════════════════════
   ЭКСПОРТ ФУНКЦИЙ В ГЛОБАЛЬНУЮ ОБЛАСТЬ (window)
   openrouter.js вызывает getSystemPromptText через глобальный
   скоуп. В Electron / Capacitor WebView function declarations
   могут не попадать в window автоматически — привязываем явно.
   ═══════════════════════════════════════════════════════════════ */
function isModelOpenAI(model) {
  if (!model) return false;
  const id = String(model.id || '').toLowerCase();
  const name = String(model.name || '').toLowerCase();
  const provider = String(model.provider || '').toLowerCase();
  const author = String(model.author || '').toLowerCase();
  return id.startsWith('openai/') ||
    id.includes('openai') ||
    id.includes('gpt-') ||
    id.includes('chatgpt') ||
    id.startsWith('o1') || id.includes('/o1') ||
    id.startsWith('o3') || id.includes('/o3') ||
    id.startsWith('o4') || id.includes('/o4') ||
    provider.includes('openai') ||
    author.includes('openai') ||
    name.includes('gpt') ||
    name.includes('openai');
}

function getRequestRolePolicy(model, chat) {
  const activeChatObj = chat ||
    (typeof window.activeChat === 'function' ? window.activeChat() : null) ||
    (window.state?.chats?.find(c => c.id === window.state?.activeId));

  const isOpenAI = isModelOpenAI(model);
  const isDeveloperChat = Boolean(activeChatObj && activeChatObj.role === 'developer');
  const developerMode = Boolean(isOpenAI && isDeveloperChat);

  return {
    isOpenAI,
    isDeveloperChat,
    developerMode,
    inputRole: 'user',
    instructionRole: developerMode ? 'developer' : 'system'
  };
}

window.isModelOpenAI = isModelOpenAI;
window.getRequestRolePolicy = getRequestRolePolicy;
window.resolveApiRoute = resolveApiRoute;
window.getAppSettings = getAppSettings;
window.textWithFiles = textWithFiles;
window.MODELS = MODELS;
/* ============================================================
   МЕТАДАННЫЕ ВАРИАНТОВ МОДЕЛЕЙ (FLAVORS & SERVICE TIERS)
   Каталог не содержит жестко зашитых провайдеров, цен и метрик.
   Все доступные узлы, цены, latency, throughput, uptime, ZDR
   и supported_parameters динамически загружаются из OpenRouter:
   GET /api/v1/models/{author}/{slug}/endpoints
   ============================================================ */
const GLOBAL_FLAVORS_CONFIG = [
  { id: "standard", label: "Стандарт", suffix: "", desc: "Базовый сбалансированный маршрут" },
  { id: "nitro", label: ":nitro", suffix: ":nitro", desc: "Приоритетная скорость инференса на LPU/H100" },
  { id: "exacto", label: ":exacto", suffix: ":exacto", desc: "Строгая калибровка структурированного вывода и Tool Use" },
  { id: "free", label: ":free", suffix: ":free", desc: "Бесплатный уровень доступа OpenRouter Free Tier" },
  { id: "online", label: ":online", suffix: ":online", desc: "Встроенный live веб-поиск провайдера" }
];

const MODEL_ENDPOINTS_CATALOG = {};

/* Универсальный динамический резолвер метаданных и вариантов модели */
function getModelCatalogEntry(modelOrId) {
  const rawId = typeof modelOrId === "string" ? modelOrId : (modelOrId?.id || "");
  if (!rawId) {
    return {
      name: "Модель",
      defaultFlavor: "standard",
      flavors: GLOBAL_FLAVORS_CONFIG.slice(0, 3)
    };
  }

  const cleanBaseId = rawId.replace(/:[a-zA-Z0-9_.-]+$/i, "");
  const knownModel = typeof window.getModel === 'function'
    ? window.getModel(rawId)
    : MODELS.find(m => m.id === rawId || m.id.replace(/:[a-zA-Z0-9_.-]+$/i, "") === cleanBaseId);

  const isFreeDefault = rawId.includes(":free") || (knownModel && ((knownModel.tagline && knownModel.tagline.toLowerCase().includes("free")) || knownModel.pricing?.isFree));

  return {
    name: knownModel ? knownModel.name : cleanBaseId,
    defaultFlavor: isFreeDefault ? "free" : "standard",
    contextLength: knownModel?.context || (knownModel?.contextLength ? `${Math.round(knownModel.contextLength / 1000)}K` : null),
    flavors: isFreeDefault
      ? [
        { id: "free", label: ":free", suffix: ":free", desc: "Бесплатная квота OpenRouter" },
        { id: "standard", label: "Стандарт", suffix: "", desc: "Стандартный платный поток" },
        { id: "nitro", label: ":nitro", suffix: ":nitro", desc: "Приоритетная скорость инференса" }
      ]
      : GLOBAL_FLAVORS_CONFIG.slice(0, 3)
  };
}

/* Универсальный резолвер уровней рассуждений (Reasoning Levels)
   Вычисляет допустимые этапы ТОЛЬКО для конкретной выбранной модели на основе
   supported_parameters, архитектуры и вендора OpenRouter */
function getModelThinkingConfig(modelOrId) {
  const rawId = typeof modelOrId === 'string' ? modelOrId : (modelOrId?.id || '');
  const cleanId = rawId.replace(/:[a-zA-Z0-9_.-]+$/i, '');

  // 1. Абсолютный приоритет: конфигурация курируемой модели из таблицы modelThinkingConfigs
  if (modelThinkingConfigs[rawId]) return modelThinkingConfigs[rawId];
  if (modelThinkingConfigs[cleanId]) return modelThinkingConfigs[cleanId];

  const modelObj = typeof modelOrId === 'object' && modelOrId !== null
    ? modelOrId
    : (typeof window.getModel === 'function' ? window.getModel(rawId) : null);

  const lowerId = (cleanId || rawId).toLowerCase();

  // 2. Модели DeepSeek R1 и специализированные квантованные R1-ветки
  if (lowerId.includes('deepseek-r1') || lowerId.includes('deepseek/r1') || lowerId.endsWith('/r1')) {
    return [
      { value: 'off', label: 'Отключено', desc: 'Прямой быстрый ответ' },
      { value: 'always', label: 'Включено (Always)', desc: 'Полная цепочка reasoning-токенов модели' }
    ];
  }

  // 3. Динамическая проверка supported_parameters OpenRouter
  const supported = Array.isArray(modelObj?.supportedParameters)
    ? modelObj.supportedParameters
    : Array.isArray(modelObj?.supported_parameters)
      ? modelObj.supported_parameters
      : [];

  if (supported.includes('include_reasoning')) {
    return [
      { value: 'off', label: 'Отключено', desc: 'Прямой быстрый ответ' },
      { value: 'always', label: 'Включено (Always)', desc: 'Полная цепочка reasoning-токенов модели' }
    ];
  }

  if (supported.includes('reasoning') || modelObj?.reasoning) {
    return [
      { value: 'off', label: 'Отключено (None)', desc: 'Прямой ответ без размышлений' },
      { value: 'minimal', label: 'Минимальный (Minimal)', desc: 'Краткое планирование' },
      { value: 'low', label: 'Низкий (Low)', desc: 'Базовая логика' },
      { value: 'medium', label: 'Средний (Medium)', desc: 'Сбалансированный анализ' },
      { value: 'high', label: 'Высокий (High)', desc: 'Глубокая проверка краевых случаев' },
      { value: 'xhigh', label: 'Очень высокий (xHigh)', desc: 'Сложное проектирование' },
      { value: 'max', label: 'Максимум (Max)', desc: 'Предельная глубина логики' }
    ];
  }

  // 4. Динамические модели семейства Anthropic Claude из каталога OpenRouter
  if (lowerId.includes('claude') || lowerId.startsWith('anthropic/')) {
    return [
      { value: 'off', label: 'Non-reasoning', desc: 'Прямой быстрый ответ без размышлений' },
      { value: 'low', label: 'Adaptive (Low)', desc: 'Быстрые базовые рассуждения (Low Effort)' },
      { value: 'medium', label: 'Adaptive (Medium)', desc: 'Сбалансированное обдумывание (Medium Effort)' },
      { value: 'high', label: 'Adaptive (High)', desc: 'Глубокий анализ логики и архитектуры (High Effort)' },
      { value: 'xhigh', label: 'Adaptive (xHigh)', desc: 'Комплексное проектирование (xHigh Effort)' },
      { value: 'max', label: 'Adaptive (Max)', desc: 'Максимальный бюджет рассуждений (Max Effort)' }
    ];
  }

  // 5. Динамические модели семейства OpenAI из каталога OpenRouter
  if (lowerId.startsWith('openai/o') || lowerId.includes('gpt-5') || lowerId.includes('o3-') || lowerId.includes('o1-') || lowerId.includes('o4-')) {
    return [
      { value: 'off', label: 'Без размышлений', desc: 'Прямой быстрый ответ (Non-reasoning)' },
      { value: 'minimal', label: 'Минимальный (Minimal)', desc: 'Сверхбыстрый ответ с базовой логикой' },
      { value: 'low', label: 'Низкий (Low)', desc: 'Поверхностные рассуждения' },
      { value: 'medium', label: 'Средний (Medium)', desc: 'Сбалансированное обдумывание' },
      { value: 'high', label: 'Высокий (High)', desc: 'Глубокая логика' },
      { value: 'xhigh', label: 'Очень высокий (xHigh)', desc: 'Сложное проектирование' },
      { value: 'max', label: 'Максимум (Max)', desc: 'Предельная глубина анализа' }
    ];
  }

  // 6. Модель без поддержки рассуждений
  return [
    { value: 'off', label: 'По умолчанию', desc: 'Стандартный инференс без цепочки рассуждений' }
  ];
}

window['modelThinkingConfigs'] = modelThinkingConfigs;
window['MODEL_ENDPOINTS_CATALOG'] = MODEL_ENDPOINTS_CATALOG;
window.getModelCatalogEntry = getModelCatalogEntry;
window.getModelThinkingConfig = getModelThinkingConfig;
window.resolveImgModel = resolveImgModel;
window.streamOpenRouter = streamOpenRouter;
window.streamOpenAIResponses = streamOpenAIResponses;
window.streamAnthropic = streamAnthropic;
window.streamGemini = streamGemini;