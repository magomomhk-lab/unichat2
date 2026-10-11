/* ============================================================
openrouter.js:
openrouter.js — прямое подключение к OpenRouter API
Работает только когда пользователь выбрал OpenRouter как
источник API и указал свой sk-or-… ключ.
SSE-стриминг, reasoning, tool_calls, image-generation.
============================================================ */
'use strict';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

/* Серверные инструменты, которые конкретная модель или пресет уже отклонили (400).
   Хранятся 15 минут: повторный 400 на каждое сообщение не нужен. */
const OR_REJECTED_TOOLS_TTL = 15 * 60 * 1000;
const orRejectedToolsCache = new Map();

function getRejectedToolTypes(modelId) {
  const entry = orRejectedToolsCache.get(modelId);
  if (!entry) return new Set();
  if (Date.now() - entry.ts > OR_REJECTED_TOOLS_TTL) {
    orRejectedToolsCache.delete(modelId);
    return new Set();
  }
  return entry.types;
}

function rememberRejectedTools(modelId, types) {
  const current = getRejectedToolTypes(modelId);
  types.forEach(t => current.add(t));
  orRejectedToolsCache.set(modelId, { types: current, ts: Date.now() });
}

window.clearOpenRouterRejectedTools = () => orRejectedToolsCache.clear();

/* Парсер HTTP-ошибок OpenRouter — возвращает человекочитаемое сообщение */
async function parseOpenRouterError(resp) {
  let msg = 'HTTP ' + resp.status;
  try {
    const j = await resp.json();
    if (j.error) {
      msg = typeof j.error === 'string' ? j.error : (j.error.message || JSON.stringify(j.error));
    } else if (j.message) {
      msg = j.message;
    }
  } catch (e) {
    try {
      const rawText = await resp.text();
      if (rawText) msg += ': ' + rawText.slice(0, 240);
    } catch (_) { }
  }
  if (resp.status === 401) return 'Неверный ключ OpenRouter (401). Проверьте sk-or-… в настройках.';
  if (resp.status === 402) return 'Недостаточно средств или кредитов на аккаунте OpenRouter.';
  if (resp.status === 403) return 'Модель недоступна для вашего ключа/региона (403).';
  if (resp.status === 404) return 'Модель не найдена на OpenRouter (404).';
  if (resp.status === 429) return 'Превышен rate-limit OpenRouter. Подождите или увеличьте лимиты.';
  if (resp.status >= 500) return 'Внутренняя ошибка OpenRouter (' + resp.status + '). Попробуйте позже.';
  return msg;
}

/* Формирование заголовков OpenRouter. Referer обязателен для ранжирования
   в публичных лидербордах и защиты от злоупотреблений ключом. */
const OR_APP_CONSTANTS = Object.freeze({
  title: 'MoonSSS',
  referer: 'https://unichat2.sahbanovtimur228.workers.dev',
  favicon: 'https://unichat2.sahbanovtimur228.workers.dev/favicon.ico',
  description: 'MoonSSS — премиальный ИИ-ассистент с поддержкой передовых моделей, инструментов и живых артефактов.',
  categories: 'general-chat,programming-app'
});

function buildOpenRouterHeaders(apiKey, subTitle = '') {
  const getAttr = (typeof window !== 'undefined' && typeof window.getOpenRouterAttributionHeaders === 'function')
    ? window.getOpenRouterAttributionHeaders
    : null;

  const baseHeaders = getAttr ? getAttr(subTitle) : {
    'HTTP-Referer': OR_APP_CONSTANTS.referer,
    'X-Title': OR_APP_CONSTANTS.title
  };

  const headers = {
    'Content-Type': 'application/json',
    ...baseHeaders
  };
  if (apiKey && String(apiKey).trim().length > 0) {
    headers['Authorization'] = 'Bearer ' + String(apiKey).trim().replace(/[^\x21-\x7E]/g, '');
  }
  return headers;
}

/* Нормализация модели из каталога OpenRouter GET /api/v1/models в формат MoonSSS */
function normalizeOpenRouterModel(raw) {
  if (!raw || !raw.id) return null;
  const id = String(raw.id).trim();
  const name = String(raw.name || id).trim();
  const inputModalities = Array.isArray(raw.architecture?.input_modalities)
    ? raw.architecture.input_modalities
    : [];
  const hasVision = inputModalities.includes('image') || String(raw.architecture?.modality || '').includes('image');

  let supportedParams = [];
  if (Array.isArray(raw.supported_parameters)) {
    supportedParams = raw.supported_parameters.map(p => String(p).toLowerCase().trim()).filter(Boolean);
  }

  const hasReasoning = supportedParams.includes('reasoning') || supportedParams.includes('include_reasoning') || /reasoning|deepseek-r1|qwq|o1|o3|o4/i.test(id);
  const hasTools = supportedParams.includes('tools') || supportedParams.includes('function_calling');

  const promptPerToken = readFirstNumber(raw.pricing?.prompt);
  const completionPerToken = readFirstNumber(raw.pricing?.completion);
  const promptPerM = promptPerToken !== null ? promptPerToken * 1000000 : null;
  const completionPerM = completionPerToken !== null ? completionPerToken * 1000000 : null;
  const isFree = (promptPerM === 0 && completionPerM === 0) || id.endsWith(':free');

  const created = typeof raw.created === 'number' ? raw.created : (Number(raw.created) || Number(raw.created_at) || 0);

  const authorSplit = splitModelAuthorAndSlug(id);
  const author = authorSplit.author || 'OpenRouter';
  const authorCap = author.charAt(0).toUpperCase() + author.slice(1);
  const ctx = raw.context_length || raw.top_provider?.context_length || 0;

  // Применение интеллектуального AI-резолвера иконок
  const icon = getAiModelIcon(id, raw);

  const formatPrice = (val) => {
    if (val === null || val === undefined) return 'Динамически';
    if (val === 0) return '$0 (Free)';
    if (val < 0.01) return `$${val.toFixed(4)}`;
    if (val < 0.1) return `$${val.toFixed(3)}`;
    return `$${val.toFixed(2)}`;
  };

  const rawDesc = String(raw.description || '').trim();

  return {
    id,
    name,
    created,
    provider: authorCap,
    author: author.toLowerCase(),
    icon,
    api: 'openrouter',
    reasoning: hasReasoning,
    vision: hasVision,
    supportsTools: hasTools,
    supportedParameters: supportedParams,
    contextLength: ctx,
    context: formatContextLength(ctx),
    tagline: rawDesc || `${authorCap} · OpenRouter Model Engine`,
    description: rawDesc || `${authorCap} нейросетевая модель высокой производительности, доступная через OpenRouter.`,
    tokenizer: raw.architecture?.tokenizer || null,
    modality: raw.architecture?.modality || null,
    pricing: {
      prompt: promptPerM,
      completion: completionPerM,
      promptFormatted: formatPrice(promptPerM),
      completionFormatted: formatPrice(completionPerM),
      isFree
    },
    isOpenRouterDynamic: true
  };
}

/* Загрузка полного актуального каталога моделей OpenRouter (публичный эндпоинт) */
async function fetchOpenRouterModels(apiKey, signal) {
  const url = 'https://openrouter.ai/api/v1/models';
  const headers = {
    'Accept': 'application/json',
    ...buildOpenRouterHeaders(apiKey)
  };

  const resp = await fetch(url, { method: 'GET', headers, signal });
  if (!resp.ok) {
    throw new Error(await parseOpenRouterError(resp));
  }

  const json = await resp.json();
  return Array.isArray(json?.data) ? json.data : [];
}

/* Определение реально доступных вариантов (flavors) для конкретной модели OpenRouter:
   standard (базовая без суффикса), nitro (:nitro), exacto (:exacto), free (:free), extended (:extended), online (:online) */
/* Индекс «базовый id → варианты» строится один раз и пересобирается только при смене каталога.
   Раньше для каждой модели перебирался весь каталог при каждой отрисовке. */
let _flavorIndex = null;
let _flavorIndexKey = '';
function getFlavorIndex() {
  const orModels = (typeof window.state !== 'undefined' && Array.isArray(window.state?.openRouterModels)) ? window.state.openRouterModels : [];
  const curated = (typeof MODELS !== 'undefined' && Array.isArray(MODELS)) ? MODELS : [];
  const key = curated.length + ':' + orModels.length + ':' + (orModels[0]?.id || '') + ':' + (orModels[orModels.length - 1]?.id || '');
  if (_flavorIndex && key === _flavorIndexKey) return _flavorIndex;
  const idx = new Map();
  [...curated, ...orModels].forEach(m => {
    if (!m || !m.id) return;
    const mid = String(m.id).toLowerCase().trim();
    const base = mid.replace(/:(nitro|exacto|free|online|extended)$/i, '');
    if (!idx.has(base)) idx.set(base, new Set());
    idx.get(base).add(mid);
  });
  _flavorIndex = idx;
  _flavorIndexKey = key;
  return idx;
}

function getModelAvailableFlavors(modelOrId) {
  const rawId = typeof modelOrId === 'string' ? modelOrId : (modelOrId?.id || '');
  if (!rawId) return [{ id: 'standard', label: 'Стандарт', desc: 'Базовая модель (без суффикса)' }];
  if (rawId.startsWith('@preset/')) return [{ id: 'standard', label: 'Стандарт', desc: 'Конфигурация пресета' }];

  const cleanBaseId = rawId.replace(/:(nitro|exacto|free|online|extended)$/i, '');
  const matchingIds = getFlavorIndex().get(cleanBaseId.toLowerCase()) || new Set();

  const isImageModel = (typeof window.IMG_MODELS !== 'undefined' && window.IMG_MODELS.some(m => m.id === cleanBaseId || m.id === rawId)) ||
    cleanBaseId.includes('flux') || cleanBaseId.includes('riverflow') || cleanBaseId.includes('muse-image') || cleanBaseId.includes('mai-image');
  if (isImageModel) {
    return [{ id: 'standard', label: 'Стандарт', desc: 'Базовая модель генерации' }];
  }

  const flavors = [
    { id: 'standard', label: 'Стандарт', desc: 'Базовый маршрут инференса (оптимальный баланс)' },
    { id: 'nitro', label: 'Nitro (:nitro)', desc: 'Быстрый инференс с максимальной скоростью и минимальным TTFT' },
    { id: 'exacto', label: 'Exacto (:exacto)', desc: 'Точная маршрутизация без квантований с максимальной точностью' }
  ];

  const hasFreeSupport = matchingIds.has(`${cleanBaseId.toLowerCase()}:free`) ||
    rawId.includes(':free') ||
    Boolean(modelOrId?.pricing?.isFree) ||
    Boolean(modelOrId?.id?.endsWith(':free'));

  if (hasFreeSupport) {
    flavors.push({ id: 'free', label: 'Free (:free)', desc: 'Бесплатный серверный пул OpenRouter' });
  }
  if (matchingIds.has(`${cleanBaseId.toLowerCase()}:extended`)) {
    flavors.push({ id: 'extended', label: 'Extended (:extended)', desc: 'Расширенное контекстное окно' });
  }
  if (matchingIds.has(`${cleanBaseId.toLowerCase()}:online`)) {
    flavors.push({ id: 'online', label: 'Online (:online)', desc: 'Модель со встроенным интернет-доступом' });
  }

  if (typeof window.MODEL_ENDPOINTS_CATALOG !== 'undefined' && window.MODEL_ENDPOINTS_CATALOG[cleanBaseId]) {
    const cat = window.MODEL_ENDPOINTS_CATALOG[cleanBaseId];
    if (Array.isArray(cat.flavors) && cat.flavors.length > 1) {
      return cat.flavors;
    }
  }

  return flavors;
}
window.getModelAvailableFlavors = getModelAvailableFlavors;

// Автоматическая защита каталога: предотвращаем ложные defaultFlavor: 'free'
if (typeof window !== 'undefined') {
  const origGetCatalog = window.getModelCatalogEntry;
  window.getModelCatalogEntry = function (modelId) {
    let entry = origGetCatalog ? origGetCatalog(modelId) : null;
    const baseId = String(modelId || '').trim().replace(/:(nitro|exacto|free|online|extended)$/i, '');
    if (!entry) {
      entry = window.MODEL_ENDPOINTS_CATALOG?.[baseId] || { name: modelId };
    }
    const safeEntry = { ...entry };
    safeEntry.flavors = getModelAvailableFlavors(modelId);
    const validIds = new Set(safeEntry.flavors.map(f => f.id));
    if (safeEntry.defaultFlavor && !validIds.has(safeEntry.defaultFlavor)) {
      safeEntry.defaultFlavor = 'standard';
    }
    return safeEntry;
  };
}

/* Сборка конфигурации провайдеров для запросов OpenRouter с поддержкой actualModelId,
   строгой фиксацией (provider.only), гарантированным отключением silent-fallback
   и защитой конфиденциальности (data_collection: 'deny') */
function buildOpenRouterProviderPayload(settings, targetModelOrId) {
  if (!settings || !targetModelOrId) return null;
  const actualModelId = typeof targetModelOrId === 'string' ? targetModelOrId : (targetModelOrId.id || '');
  if (!actualModelId) return null;

  const normalize = (value) => [...new Set(
    (Array.isArray(value) ? value : [])
      .map(String)
      .map(s => s.trim())
      .filter(Boolean)
  )];

  const baseModelId = actualModelId.replace(/:[a-zA-Z0-9_.-]+$/i, '');
  const cfg = (settings.modelProviders && (settings.modelProviders[actualModelId] || settings.modelProviders[baseModelId])) || {};

  const provider = {};
  const ignored = normalize(cfg.ignore);
  const explicitOnly = normalize(cfg.only).filter(id => !ignored.includes(id));

  // Получаем чистый routing slug провайдера
  const selectedRoutingSlug = (cfg.selectedProviderSlug || cfg.selectedProvider || '').trim();
  const allowFallbacks = typeof cfg.allow_fallbacks === 'boolean'
    ? cfg.allow_fallbacks
    : typeof cfg.allowfallbacks === 'boolean'
      ? cfg.allowfallbacks
      : true;

  provider.allow_fallbacks = allowFallbacks;

  if (cfg.data_collection === 'deny') {
    provider.data_collection = 'deny';
  }

  // Если выбран конкретный узел:
  if (selectedRoutingSlug && selectedRoutingSlug !== 'auto') {
    if (!allowFallbacks) {
      provider.only = [selectedRoutingSlug];
    } else {
      provider.order = [selectedRoutingSlug];
    }
  } else if (explicitOnly.length) {
    provider.only = explicitOnly;
  } else {
    let orderSource = [];
    if (Array.isArray(cfg.order) && cfg.order.length > 0) {
      orderSource = cfg.order;
    } else if (typeof cfg.customOrder === 'string' && cfg.customOrder.trim()) {
      orderSource = cfg.customOrder.split(',');
    }
    const order = normalize(orderSource).filter(id => !ignored.includes(id));
    if (order.length) {
      provider.order = order;
    } else if (['price', 'throughput', 'latency'].includes(cfg.sort)) {
      provider.sort = cfg.sort;
    }
  }

  if (ignored.length) provider.ignore = ignored;

  const quantizations = normalize(cfg.quantizations);
  if (quantizations.length) {
    provider.quantizations = quantizations;
  }

  return Object.keys(provider).length > 0 ? provider : null;
}

/* ============================================================
   АВТОНОМНЫЙ РЕЗОЛВЕР ЛОКАЛЬНЫХ ИКОНОК ИИ-МОДЕЛЕЙ OPENROUTER
   Работает полностью в офлайн-режиме без обращений к Google Favicons
   и CDN. Сопоставляет префикс автора/модели с локальными ассетами.
   ============================================================ */

const LOCAL_AI_MODEL_ICONS = {
  'sourceful/': 'riverflow.png',
  'sourceful': 'riverflow.png',
  'black-forest-labs/': 'flux.png',
  'black-forest-labs': 'flux.png',
  'bfl/': 'flux.png',
  'bfl': 'flux.png',
  'upstage/': 'upstage.png',
  'upstage': 'upstage.png',
  'upstage/zdr': 'upstage.png',
  'tencent/': 'hunyuan-color.svg',
  'tencent': 'hunyuan-color.svg',
  'inclusionai/': 'ling.png',
  'inclusionai': 'ling.png',
  'qwen/': 'qwen-color.svg',
  'qwen': 'qwen-color.svg',
  'z-ai/': 'z-ai.png',
  'z-ai': 'z-ai.png',
  'meta/': 'meta-color.svg',
  'meta': 'meta-color.svg',
  'meta-llama/': 'meta-color.svg',
  'meta-llama': 'meta-color.svg',
  'deepseek/': 'deepseek-color.svg',
  'deepseek': 'deepseek-color.svg',
  'dots-studio/': 'DotsStudio.png',
  'dots-studio': 'DotsStudio.png',
  'google/': 'gemini-color.svg',
  'google': 'gemini-color.svg',
  'bytedance-seed/': 'bytedance-seed.png',
  'bytedance-seed': 'bytedance-seed.png',
  'bytedance/': 'bytedance-seed.png',
  'bytedance': 'bytedance-seed.png',
  'x-ai/': 'grok.png',
  'x-ai': 'grok.png',
  'liquid/': 'liquid.png',
  'liquid': 'liquid.png',
  'nvidia/': 'nvidia-color.svg',
  'nvidia': 'nvidia-color.svg',
  'sakana/': 'sakana.png',
  'sakana': 'sakana.png',
  'thinkingmachines/': 'thinkingmachines.png',
  'thinkingmachines': 'thinkingmachines.png',
  'poolside/': 'poolside-color.svg',
  'poolside': 'poolside-color.svg',
  'moonshotai/': 'MoonshotAI.png',
  'moonshotai': 'MoonshotAI.png',
  'kwaipilot/': 'Kwaipilot.png',
  'kwaipilot': 'Kwaipilot.png',
  'stealth/': 'Stealth.svg',
  'stealth': 'Stealth.svg',
  'cloudflare/': 'cloudflare.png',
  'cloudflare': 'cloudflare.png',
  'apodex/': 'Apodex-dark.svg',
  'apodex': 'Apodex-dark.svg',
  'unbiased/': 'Unbiased.png',
  'unbiased': 'Unbiased.png',
  'openai/': 'chat-gpt.png',
  'openai': 'chat-gpt.png',
  'aion-labs/': 'aion-labs.png',
  'aion-labs': 'aion-labs.png',
  'nex-agi/': 'NexAGI.svg',
  'nex-agi': 'NexAGI.svg',
  'cohere/': 'Cohere.png',
  'cohere': 'Cohere.png',
  'minimax/': 'minimax-color.svg',
  'minimax': 'minimax-color.svg',
  'stepfun/': 'stepfun.png',
  'stepfun': 'stepfun.png',
  'perceptron/': 'perceptron.png',
  'perceptron': 'perceptron.png',
  'ibm-granite/': 'IBMGranite.svg',
  'ibm-granite': 'IBMGranite.svg',
  'ibm/': 'IBMGranite.svg',
  'ibm': 'IBMGranite.svg',
  'mistralai/': 'Mistral.png',
  'mistralai': 'Mistral.png',
  'xiaomi/': 'xiaomi.png',
  'xiaomi': 'xiaomi.png',
  'arcee-ai/': 'arcee-ai.jfif',
  'arcee-ai': 'arcee-ai.jfif',
  'inception/': 'Inception.svg',
  'inception': 'Inception.svg',
  'writer/': 'writer.png',
  'writer': 'writer.png',
  'relace/': 'relace.png',
  'relace': 'relace.png',
  'amazon/': 'amazon.png',
  'amazon': 'amazon.png',
  'perplexity/': 'Perplexity.png',
  'perplexity': 'Perplexity.png',
  'thedrummer/': 'TheDrummer.png',
  'thedrummer': 'TheDrummer.png',
  'nousresearch/': 'nousresearch.png',
  'nousresearch': 'nousresearch.png',
  'morph/': 'morph.jfif',
  'morph': 'morph.jfif',
  'baidu/': 'baidu.png',
  'baidu': 'baidu.png',
  'microsoft/': 'MAI.png',
  'microsoft': 'MAI.png',
  'anthropic/': 'claude-color.svg',
  'anthropic': 'claude-color.svg',
  'openrouter/': 'openrouter-color.svg',
  'openrouter': 'openrouter-color.svg'
};

const AI_BRAND_DOMAINS_MAP = {
  openai: 'openai.com',
  anthropic: 'anthropic.com',
  google: 'google.com',
  meta: 'meta.com',
  deepseek: 'deepseek.com',
  mistralai: 'mistral.ai',
  qwen: 'qwenlm.ai',
  cohere: 'cohere.com',
  together: 'together.ai',
  groq: 'groq.com',
  fireworks: 'fireworks.ai',
  deepinfra: 'deepinfra.com',
  lepton: 'lepton.ai',
  novita: 'novita.ai',
  hyperbolic: 'hyperbolic.xyz',
  neets: 'neets.ai',
  featherless: 'featherless.ai',
  avian: 'avian.io',
  parasail: 'parasail.io',
  kluster: 'kluster.ai',
  chutes: 'chutes.ai',
  baseplate: 'baseplate.ai',
  mancer: 'mancer.tech',
  upstage: 'upstage.ai'
};

function getAiModelIcon(modelOrId, rawModel) {
  const rawId = (typeof modelOrId === 'string' ? modelOrId : (modelOrId?.id || '')).toLowerCase().trim();
  if (!rawId) return null;

  // Очищаем ID от версий, flavor-тегов и квантований (:nitro, :free, :exacto, :online и т.д.)
  const cleanId = rawId.replace(/:[a-zA-Z0-9_.-]+$/i, '');
  const slashIdx = cleanId.indexOf('/');
  const authorSlug = slashIdx > 0 ? cleanId.slice(0, slashIdx).replace(/[^a-z0-9.-]/g, '') : cleanId;

  // 1. Приоритет: Проверка локального кураторского каталога MODELS
  if (typeof MODELS !== 'undefined' && Array.isArray(MODELS)) {
    const curated = MODELS.find(m => {
      const mId = m.id.toLowerCase();
      return mId === rawId || mId.replace(/:[a-zA-Z0-9_.-]+$/i, '') === cleanId;
    });
    if (curated && curated.icon && !curated.icon.startsWith('http')) {
      return curated.icon;
    }
  }

  // 2. Прямой поиск в словаре LOCAL_AI_MODEL_ICONS (по префиксу со слэшем и чистому слагу)
  if (LOCAL_AI_MODEL_ICONS[`${authorSlug}/`]) return LOCAL_AI_MODEL_ICONS[`${authorSlug}/`];
  if (LOCAL_AI_MODEL_ICONS[authorSlug]) return LOCAL_AI_MODEL_ICONS[authorSlug];
  if (LOCAL_AI_MODEL_ICONS[`${cleanId}/`]) return LOCAL_AI_MODEL_ICONS[`${cleanId}/`];
  if (LOCAL_AI_MODEL_ICONS[cleanId]) return LOCAL_AI_MODEL_ICONS[cleanId];

  for (const [prefix, iconPath] of Object.entries(LOCAL_AI_MODEL_ICONS)) {
    if (prefix.endsWith('/') && cleanId.startsWith(prefix)) {
      return iconPath;
    }
    if (cleanId === prefix || authorSlug === prefix.replace(/\/$/, '')) {
      return iconPath;
    }
  }

  // 3. Семейства моделей и подстроки (гарантированный офлайн-поиск по ключевым вендорам)
  if (cleanId.includes('sourceful') || cleanId.includes('riverflow')) return 'riverflow.png';
  if (cleanId.includes('black-forest-labs') || cleanId.includes('flux') || cleanId.includes('bfl')) return 'flux.png';
  if (cleanId.includes('upstage')) return 'upstage.png';
  if (cleanId.includes('tencent') || cleanId.includes('hunyuan')) return 'hunyuan-color.svg';
  if (cleanId.includes('inclusion') || cleanId.includes('ling')) return 'ling.png';
  if (cleanId.includes('qwen') || cleanId.includes('qwq') || cleanId.includes('alibaba')) return 'qwen-color.svg';
  if (cleanId.includes('glm') || cleanId.includes('z-ai') || cleanId.includes('zhipu')) return 'z-ai.png';
  if (cleanId.includes('llama') || cleanId.includes('meta')) return 'meta-color.svg';
  if (cleanId.includes('deepseek')) return 'deepseek-color.svg';
  if (cleanId.includes('dots-studio') || cleanId.includes('dotsstudio')) return 'DotsStudio.png';
  if (cleanId.includes('gemini') || cleanId.includes('gemma') || cleanId.includes('google')) return 'gemini-color.svg';
  if (cleanId.includes('bytedance') || cleanId.includes('seed')) return 'bytedance-seed.png';
  if (cleanId.includes('grok') || cleanId.includes('x-ai')) return 'grok.png';
  if (cleanId.includes('liquid') || cleanId.includes('lfm')) return 'liquid.png';
  if (cleanId.includes('nvidia') || cleanId.includes('nemotron')) return 'nvidia-color.svg';
  if (cleanId.includes('sakana')) return 'sakana.png';
  if (cleanId.includes('thinkingmachines')) return 'thinkingmachines.png';
  if (cleanId.includes('poolside') || cleanId.includes('laguna')) return 'poolside-color.svg';
  if (cleanId.includes('kimi') || cleanId.includes('moonshot')) return 'MoonshotAI.png';
  if (cleanId.includes('kwaipilot') || cleanId.includes('kwai')) return 'Kwaipilot.png';
  if (cleanId.includes('gpt') || cleanId.includes('o1') || cleanId.includes('o3') || cleanId.includes('o4') || cleanId.includes('openai')) return 'chat-gpt.png';
  if (cleanId.includes('aion-labs') || cleanId.includes('aion')) return 'aion-labs.png';
  if (cleanId.includes('nex-agi') || cleanId.includes('nexagi')) return 'NexAGI.svg';
  if (cleanId.includes('cohere') || cleanId.includes('command')) return 'Cohere.png';
  if (cleanId.includes('minimax')) return 'minimax-color.svg';
  if (cleanId.includes('stepfun') || cleanId.includes('step-fun') || cleanId.includes('step')) return 'stepfun.png';
  if (cleanId.includes('perceptron')) return 'perceptron.png';
  if (cleanId.includes('granite') || cleanId.includes('ibm')) return 'IBMGranite.svg';
  if (cleanId.includes('mistral') || cleanId.includes('mixtral') || cleanId.includes('codestral')) return 'Mistral.png';
  if (cleanId.includes('xiaomi')) return 'xiaomi.png';
  if (cleanId.includes('arcee')) return 'arcee-ai.jfif';
  if (cleanId.includes('inception')) return 'Inception.svg';
  if (cleanId.includes('writer') || cleanId.includes('palmyra')) return 'writer.png';
  if (cleanId.includes('relace')) return 'relace.png';
  if (cleanId.includes('amazon') || cleanId.includes('nova')) return 'amazon.png';
  if (cleanId.includes('perplexity') || cleanId.includes('sonar')) return 'Perplexity.png';
  if (cleanId.includes('thedrummer')) return 'TheDrummer.png';
  if (cleanId.includes('nousresearch') || cleanId.includes('hermes')) return 'nousresearch.png';
  if (cleanId.includes('morph')) return 'morph.jfif';
  if (cleanId.includes('baidu') || cleanId.includes('ernie')) return 'baidu.png';
  if (cleanId.includes('microsoft') || cleanId.includes('phi') || cleanId.includes('wizardlm') || cleanId.includes('mai')) return 'MAI.png';
  if (cleanId.includes('claude') || cleanId.includes('anthropic')) return 'claude-color.svg';
  if (cleanId.includes('openrouter') || cleanId.includes('auto-beta') || cleanId.includes('fusion')) return 'openrouter-color.svg';

  // 4. ТОЛЬКО И ИСКЛЮЧИТЕЛЬНО ЕСЛИ ВСТРОЕННЫЙ ЛОКАЛЬНЫЙ АССЕТ НЕ НАЙДЕН:
  // Пытаемся получить favicon из онлайн-метаданных OpenRouter (если это сторонний новый вендор)
  const raw = rawModel || {};
  const onlineDirect = [
    raw.icon_url,
    raw.iconUrl,
    raw.favicon_url,
    raw.faviconUrl,
    raw.logo_url,
    raw.architecture?.icon_url
  ].find(u => typeof u === 'string' && u.trim().length > 0 && (u.startsWith('http://') || u.startsWith('https://') || u.startsWith('data:')));

  if (onlineDirect) return onlineDirect.trim();

  // Если для неизвестной компании задан домен в AI_BRAND_DOMAINS_MAP
  if (authorSlug && AI_BRAND_DOMAINS_MAP[authorSlug]) {
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(AI_BRAND_DOMAINS_MAP[authorSlug])}&sz=64`;
  }

  return null;
}

function getProviderFavicon(endpoint) {
  if (!endpoint || endpoint.id === 'auto') return 'openrouter-color.svg';

  const raw = endpoint.raw || {};
  const provider = raw.provider || {};

  const rawSlug = String(
    endpoint.providerSlug ||
    raw.provider_slug ||
    raw.providerSlug ||
    raw.slug ||
    raw.id ||
    endpoint.id ||
    ''
  ).toLowerCase().trim();

  const cleanSlug = rawSlug
    .split('/')[0]
    .split('::')[0]
    .split('@')[0]
    .split(':')[0]
    .replace(/[^a-z0-9.-]/g, '');

  // 1. Приоритет: локальная иконка (без обращений к сети)
  const localIcon = getAiModelIcon(cleanSlug, raw);
  if (localIcon) return localIcon;

  // 2. Прямая ссылка из OpenRouter API (только если локальной нет)
  const directIcon = [
    raw.favicon_url,
    raw.faviconUrl,
    raw.icon_url,
    raw.iconUrl,
    raw.logo_url,
    raw.logoUrl,
    provider.favicon_url,
    provider.faviconUrl,
    provider.icon_url,
    provider.iconUrl
  ].find(u => typeof u === 'string' && u.trim().length > 0 && (u.startsWith('http://') || u.startsWith('https://') || u.startsWith('data:')));

  if (directIcon) return directIcon.trim();

  // 3. Фолбэк на домен бренда
  if (cleanSlug && AI_BRAND_DOMAINS_MAP[cleanSlug]) {
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(AI_BRAND_DOMAINS_MAP[cleanSlug])}&sz=64`;
  }

  return 'openrouter-color.svg';
}

function providerIconHtml(endpoint) {
  const src = getProviderFavicon(endpoint);
  return `<img class="provider-favicon" src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='openrouter-color.svg'">`;
}

/* Динамическая загрузка актуальных эндпоинтов модели из OpenRouter API с кэшированием (TTL 120s) */
const openRouterEndpointsMemoryCache = new Map();

function splitModelAuthorAndSlug(modelId) {
  const cleanId = String(modelId || '').trim().replace(/:[a-zA-Z0-9_.-]+$/i, '');
  const slashIndex = cleanId.indexOf('/');
  if (slashIndex <= 0 || slashIndex === cleanId.length - 1) {
    return { author: '', slug: cleanId };
  }
  return {
    author: cleanId.slice(0, slashIndex),
    slug: cleanId.slice(slashIndex + 1)
  };
}

function formatContextLength(n) {
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 1000000) {
    return `${(n / 1000000).toFixed(2).replace(/\.?0+$/, '')}M`;
  }
  return `${Math.round(n / 1000)}K`;
}

function normalizePercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n <= 1 ? n * 100 : n;
}

function readFirstNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return null;
}

function formatLatencyMetric(valueInSecondsOrMs) {
  if (!Number.isFinite(valueInSecondsOrMs) || valueInSecondsOrMs <= 0) return null;
  // Если значение меньше 50 — это секунды (например, 0.38s)
  if (valueInSecondsOrMs < 50) {
    if (valueInSecondsOrMs < 1) {
      return `${Math.round(valueInSecondsOrMs * 1000)}ms`;
    }
    return `${valueInSecondsOrMs.toFixed(2)}s`;
  }
  // Если значение >= 50 — это уже миллисекунды (например, 380ms)
  return `${Math.round(valueInSecondsOrMs)}ms`;
}

function formatThroughputMetric(valueTps) {
  if (!Number.isFinite(valueTps) || valueTps <= 0) return null;
  return `${Math.round(valueTps)} tok/s`;
}

function normalizeOpenRouterEndpoint(ep) {
  if (!ep || typeof ep !== 'object') return null;

  // Извлечение чистого slug провайдера для provider.only
  const rawSlug = String(
    ep.provider_slug ||
    ep.provider_tag ||
    ep.slug ||
    ep.tag ||
    ep.provider?.slug ||
    ep.provider?.tag ||
    ep.id ||
    ep.provider_name ||
    ep.name ||
    ''
  ).trim();

  if (!rawSlug) return null;

  const routingSlug = rawSlug.toLowerCase().replace(/[\s_]+/g, '-');
  const providerName = String(ep.provider_name || ep.name || ep.provider?.name || rawSlug).trim();
  const region = ep.region || ep.location || ep.provider?.region || null;

  const endpointId = String(
    ep.id ||
    ep.endpoint_id ||
    (region ? `${routingSlug}/${region}` : routingSlug)
  );

  const privacyRaw = String(
    ep.privacy ||
    ep.data_collection ||
    ep.provider?.data_collection ||
    (ep.is_zero_data_retention ? 'zdr' : '')
  ).toLowerCase();

  const isZdr = Boolean(
    ep.is_zero_data_retention === true ||
    ep.zdr === true ||
    ep.zero_data_retention === true ||
    privacyRaw.includes('deny') ||
    privacyRaw.includes('zdr') ||
    privacyRaw.includes('zero')
  );

  const privacy = isZdr
    ? 'Private (ZDR)'
    : (privacyRaw.includes('private') ? 'Private' : 'Logs');

  const promptPerToken = readFirstNumber(ep.pricing?.prompt, ep.pricing?.input, ep.input_price, ep.prompt_price);
  const completionPerToken = readFirstNumber(ep.pricing?.completion, ep.pricing?.output, ep.output_price, ep.completion_price);
  const cacheReadPerToken = readFirstNumber(ep.pricing?.input_cache_read, ep.pricing?.cache_read, ep.cache_read_price);

  const pricePerM = (perToken) => {
    if (!Number.isFinite(perToken)) return null;
    const value = perToken * 1000000;
    if (value === 0) return 'Бесплатно ($0)';
    return `$${value.toFixed(value < 0.1 ? 4 : 2)}`;
  };

  // TTFT: время до первого токена
  const ttftRaw = readFirstNumber(
    ep.ttft,
    ep.ttft_p50,
    ep.ttftP50,
    ep.metrics?.ttft,
    ep.metrics?.ttft_p50,
    ep.performance?.ttft,
    ep.performance?.ttft_p50,
    ep.stats?.ttft
  );

  // Latency: общая задержка инференса
  const latencyRaw = readFirstNumber(
    ep.latency,
    ep.latency_last_30m,
    ep.latency_p50,
    ep.p50_latency,
    ep.metrics?.latency,
    ep.metrics?.latency_p50,
    ep.performance?.latency,
    ep.performance?.latency_p50,
    ep.stats?.latency
  );

  // Throughput: скорость генерации (Tokens/s)
  const throughputRaw = readFirstNumber(
    ep.throughput,
    ep.throughput_last_30m,
    ep.throughput_p50,
    ep.throughputP50,
    ep.tokens_per_second,
    ep.tokensPerSecond,
    ep.tps,
    ep.metrics?.throughput,
    ep.metrics?.throughput_p50,
    ep.metrics?.tokens_per_second,
    ep.metrics?.tps,
    ep.performance?.throughput,
    ep.performance?.tokens_per_second,
    ep.stats?.throughput
  );

  const contextLength = readFirstNumber(
    ep.context_length,
    ep.max_context_length,
    ep.context_length_tokens,
    ep.top_provider?.context_length,
    ep.max_context
  );

  // Извлечение поддерживаемых параметров (Supported Parameters)
  let supportedParameters = [];
  if (Array.isArray(ep.supported_parameters)) {
    supportedParameters = ep.supported_parameters;
  } else if (Array.isArray(ep.parameters)) {
    supportedParameters = ep.parameters;
  } else if (typeof ep.supported_parameters === 'object' && ep.supported_parameters !== null) {
    supportedParameters = Object.keys(ep.supported_parameters);
  }

  supportedParameters = [...new Set(
    supportedParameters.map(p => String(p).trim().toLowerCase()).filter(Boolean)
  )];

  const rawUptime = readFirstNumber(
    ep.uptime,
    ep.uptime_last_1d,
    ep.uptime_last_30m,
    ep.uptime_last_5m,
    ep.uptime_last_24h,
    ep.metrics?.uptime,
    ep.stats?.uptime
  );
  const uptimePercent = normalizePercent(rawUptime);

  const locationName = region ? `${providerName} (${region})` : providerName;
  const displayName = isZdr && !/\bzdr\b/i.test(locationName) ? `${locationName} (ZDR)` : locationName;

  return {
    id: endpointId,
    endpointId,
    providerSlug: routingSlug,
    name: displayName,
    providerName,
    region,
    quantization: ep.quantization || ep.quant || null,
    privacy,
    isZdr,
    status: ep.status ?? 1,
    uptime: uptimePercent,
    uptimePercent,
    ttftNum: ttftRaw,
    ttft: formatLatencyMetric(ttftRaw),
    latencyNum: latencyRaw,
    latency: formatLatencyMetric(latencyRaw),
    throughputNum: throughputRaw,
    throughput: formatThroughputMetric(throughputRaw),
    contextLengthNum: contextLength,
    context: formatContextLength(contextLength),
    inputPriceNum: promptPerToken == null ? null : promptPerToken * 1000000,
    outputPriceNum: completionPerToken == null ? null : completionPerToken * 1000000,
    cacheReadPriceNum: cacheReadPerToken == null ? null : cacheReadPerToken * 1000000,
    inputPrice: pricePerM(promptPerToken),
    outputPrice: pricePerM(completionPerToken),
    cacheReadPrice: pricePerM(cacheReadPerToken),
    supportedParameters,
    supportsTools: supportedParameters.includes('tools') || supportedParameters.includes('function_calling'),
    supportsReasoning: supportedParameters.includes('reasoning') || supportedParameters.includes('include_reasoning'),
    raw: ep
  };
}

async function fetchOpenRouterModelEndpoints(modelId, apiKey, signal) {
  const targetId = String(modelId || '').trim();
  if (!targetId || targetId.startsWith('@preset/')) return [];

  const cacheKey = `or_ep_${targetId}`;
  const now = Date.now();
  const cached = openRouterEndpointsMemoryCache.get(cacheKey);
  if (cached && (now - cached.ts < 120000)) {
    return cached.data;
  }

  const referer = (typeof location !== 'undefined' && location.origin && !location.origin.startsWith('file') && !location.origin.startsWith('app') && !location.origin.startsWith('capacitor'))
    ? location.origin : 'https://unichat2.sahbanovtimur228.workers.dev/ai';

  const rawKey = apiKey && apiKey.trim() ? apiKey.trim() : (window.state?.settings?.orKey || '').trim();
  const hasValidOrKey = rawKey && rawKey.startsWith('sk-or-');

  const headers = {
    'Accept': 'application/json',
    'HTTP-Referer': referer,
    'X-Title': 'MoonSSS'
  };
  if (hasValidOrKey) {
    headers['Authorization'] = `Bearer ${rawKey}`;
  }

  const { author, slug } = splitModelAuthorAndSlug(targetId);
  const endpointsUrlsToTry = [];

  if (author && slug) {
    endpointsUrlsToTry.push(`https://openrouter.ai/api/v1/models/${author}/${slug}/endpoints`);
    endpointsUrlsToTry.push(`https://openrouter.ai/api/v1/models/${author}/${slug}`);
  }

  let lastError = null;

  for (const url of endpointsUrlsToTry) {
    if (signal?.aborted) return [];
    try {
      let resp = await fetch(url, { method: 'GET', headers, signal });

      // Если авторизация дала отказ, повторяем без токена
      if ((resp.status === 401 || resp.status === 403) && headers['Authorization']) {
        const publicHeaders = { 'Accept': 'application/json', 'HTTP-Referer': referer, 'X-Title': 'MoonSSS' };
        resp = await fetch(url, { method: 'GET', headers: publicHeaders, signal });
      }

      if (!resp.ok) continue;

      const json = await resp.json();
      let rawEndpoints = [];

      if (Array.isArray(json?.data?.endpoints)) {
        rawEndpoints = json.data.endpoints;
      } else if (Array.isArray(json?.endpoints)) {
        rawEndpoints = json.endpoints;
      } else if (Array.isArray(json?.data)) {
        rawEndpoints = json.data;
      } else if (json?.data && typeof json.data === 'object') {
        if (Array.isArray(json.data.endpoints)) {
          rawEndpoints = json.data.endpoints;
        } else if (json.data.top_provider) {
          rawEndpoints = [json.data.top_provider];
        }
      }

      if (Array.isArray(rawEndpoints) && rawEndpoints.length > 0) {
        const seenEndpointIds = new Set();
        const parsed = [];

        for (const ep of rawEndpoints) {
          const item = normalizeOpenRouterEndpoint(ep);
          if (!item) continue;
          if (seenEndpointIds.has(item.endpointId)) continue;
          seenEndpointIds.add(item.endpointId);
          parsed.push(item);
        }

        if (parsed.length > 0) {
          parsed.sort((a, b) => (a.ttftNum ?? a.latencyNum ?? 999) - (b.ttftNum ?? b.latencyNum ?? 999));
          openRouterEndpointsMemoryCache.set(cacheKey, { ts: now, data: parsed });
          return parsed;
        }
      }
    } catch (err) {
      if (err?.name === 'AbortError' || signal?.aborted) return [];
      lastError = err;
    }
  }

  console.warn(`[MoonSSS] OpenRouter endpoints: no live telemetry for ${targetId}`, lastError || '');
  openRouterEndpointsMemoryCache.set(cacheKey, { ts: now, data: [] });
  return [];
}

/* Преобразование настроек reasoning в формат OpenRouter на основе supported_parameters модели */
function mapReasoningToOpenRouter(reasoningLevel, modelId, modelObj) {
  if (!reasoningLevel || reasoningLevel === 'off' || reasoningLevel === 'not-supported') return null;
  const cleanId = String(modelId || '').toLowerCase().replace(/:[a-zA-Z0-9_.-]+$/i, '');
  const supported = Array.isArray(modelObj?.supportedParameters)
    ? modelObj.supportedParameters
    : Array.isArray(modelObj?.supported_parameters)
      ? modelObj.supported_parameters
      : [];

  const hasIncludeReasoning = supported.includes('include_reasoning') || /deepseek-r1|deepseek\/r1/i.test(cleanId);
  const hasReasoning = supported.includes('reasoning');

  if (hasIncludeReasoning && !hasReasoning) {
    /* Модели типа DeepSeek-R1 принимают флаг include_reasoning: true */
    return { include_reasoning: true };
  }

  const effortMap = {
    'minimal': 'low', 'low': 'low',
    'medium': 'medium', 'mid': 'medium',
    'high': 'high', 'xhigh': 'high', 'max': 'high', 'always': 'high'
  };
  const effort = effortMap[reasoningLevel] || 'medium';
  return { effort };
}

/* Построение списка сообщений с поддержкой вложений (изображения, файлы, артефакты).
   Формат совместим с OpenAI Vision API, который использует OpenRouter. */
function buildOpenRouterMessages(history, systemPrompt, model, chat) {
  const messages = [];

  const activeChatObj = chat || (typeof window.activeChat === 'function' ? window.activeChat() : null) || (window.state?.chats?.find(c => c.id === window.state?.activeId));
  const targetModel = model || (window.state?.settings?.modelId && typeof window.getModel === 'function' ? window.getModel(window.state.settings.modelId) : null);
  const rolePolicy = typeof window.getRequestRolePolicy === 'function'
    ? window.getRequestRolePolicy(targetModel, activeChatObj)
    : { inputRole: 'user', instructionRole: 'system', developerMode: false };

  const effectiveSysPrompt = String(systemPrompt || '').trim();
  if (effectiveSysPrompt) {
    messages.push({ role: rolePolicy.instructionRole, content: effectiveSysPrompt });
  }

  const canUseVision = targetModel ? Boolean(targetModel.vision) : true;
  for (const m of history) {
    if (m.role === 'user' || m.role === 'developer') {
      const txt = typeof window.textWithFiles === 'function'
        ? window.textWithFiles(m)
        : (typeof textWithFiles === 'function' ? textWithFiles(m) : (m.content || ' '));
      const collectImgs = typeof window.collectAttachmentVisionImages === 'function'
        ? window.collectAttachmentVisionImages
        : (typeof collectAttachmentVisionImages === 'function' ? collectAttachmentVisionImages : null);
      const imgs = collectImgs ? collectImgs(m.attachments) : (m.attachments || []).filter(a => a.kind === 'image' && a.dataUrl);

      if (imgs.length > 0 && canUseVision) {
        messages.push({
          role: rolePolicy.inputRole,
          content: [
            { type: 'text', text: txt || ' ' },
            ...imgs.map(im => {
              const safeUrl = (typeof window.fixDataUrlMime === 'function')
                ? window.fixDataUrlMime(im.dataUrl, im.mime || 'image/jpeg')
                : im.dataUrl;
              return {
                type: 'image_url',
                image_url: {
                  url: safeUrl
                }
              };
            })
          ]
        });
      } else {
        messages.push({
          role: rolePolicy.inputRole,
          content: txt || ' '
        });
      }
    } else {
      const textContent = typeof window.formatAssistantContentForHistory === 'function'
        ? window.formatAssistantContentForHistory(m)
        : (m.content || '');

      messages.push({ role: 'assistant', content: textContent || ' ' });
    }
  }
  return messages;
}

/* ═══════════════════════════════════════════════════════════════
   Главный стриминг-метод для OpenRouter (прямой, без ProxyAPI)
   ═══════════════════════════════════════════════════════════════
   handlers:
     onText(t)             — фрагмент финального ответа
     onThink(t)            — фрагмент размышления (reasoning)
     onImage(url)          — готовый URL сгенерированного изображения
     onReasoningDetails(o) — структурированные шаги reasoning_details
     onWebSearch({queries, sources}) — результаты встроенного поиска
     signal                — AbortController.signal для отмены
*/
async function streamOpenRouterDirect(model, history, handlers, aiMsg, chat) {
  const settings = window.state?.settings || {};
  const apiKey = (settings.orKey || '').trim();
  if (!apiKey) throw new Error('Не указан ключ OpenRouter (sk-or-…)');

  const sysPromptFn = (typeof window.getSystemPromptText === 'function')
    ? window.getSystemPromptText
    : (typeof getSystemPromptText === 'function' ? getSystemPromptText : null);
  const systemPrompt = sysPromptFn ? sysPromptFn(model) : (settings.systemPrompt || '');
  const messages = buildOpenRouterMessages(history, systemPrompt, model, chat);
  const reasoning = mapReasoningToOpenRouter(settings.reasoning, model.id, model);

  // Централизованное определение актуального ID модели и flavor
  const rawBaseId = (model.api === 'anthropic' || model.api === 'gemini')
    ? model.id
    : (model.native || model.id);

  const cleanBaseId = rawBaseId.replace(/:(nitro|exacto|free|online|extended)$/i, '');
  const catalogEntry = typeof window.getModelCatalogEntry === 'function'
    ? window.getModelCatalogEntry(cleanBaseId)
    : (window.MODEL_ENDPOINTS_CATALOG?.[cleanBaseId] || {});

  const availableFlavors = getModelAvailableFlavors(cleanBaseId);
  const validFlavorIds = new Set(availableFlavors.map(f => f.id));

  const modelCfg = (settings.modelProviders && (settings.modelProviders[model.id] || settings.modelProviders[cleanBaseId])) || {};

  let activeFlavor = 'standard';
  if (modelCfg.flavor && validFlavorIds.has(modelCfg.flavor)) {
    activeFlavor = modelCfg.flavor;
  } else if (catalogEntry.defaultFlavor && validFlavorIds.has(catalogEntry.defaultFlavor)) {
    activeFlavor = catalogEntry.defaultFlavor;
  } else if (rawBaseId.endsWith(':free') && validFlavorIds.has('free')) {
    activeFlavor = 'free';
  } else if (rawBaseId.endsWith(':nitro') && validFlavorIds.has('nitro')) {
    activeFlavor = 'nitro';
  } else if (rawBaseId.endsWith(':exacto') && validFlavorIds.has('exacto')) {
    activeFlavor = 'exacto';
  }

  let actualModelId = cleanBaseId;
  if (activeFlavor && activeFlavor !== 'standard' && activeFlavor !== 'default') {
    const candidateId = `${cleanBaseId}:${activeFlavor}`;
    const orModels = (typeof window.state !== 'undefined' && Array.isArray(window.state?.openRouterModels)) ? window.state.openRouterModels : [];
    if (orModels.length > 0) {
      const existsOnOR = orModels.some(m => m.id === candidateId);
      if (existsOnOR) {
        actualModelId = candidateId;
      } else {
        console.warn(`[MoonSSS] Вариант "${activeFlavor}" отсутствует в реестре OpenRouter для "${cleanBaseId}". Используется базовый ID.`);
        actualModelId = cleanBaseId;
      }
    } else {
      actualModelId = candidateId;
    }
  }

  const payload = {
    model: actualModelId,
    messages,
    stream: true,
    temperature: typeof model.temperature === 'number' ? model.temperature : 1.0
  };

  /* Подключение серверного инструмента времени OpenRouter и клиентских инструментов */
  let userTimezone = 'UTC';
  try {
    userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch (_) { }

  const datetimeServerTool = {
    type: "openrouter:datetime",
    parameters: {
      timezone: userTimezone
    }
  };

  const supportsNativeTools = Boolean(
    model.supportsTools !== false && (
      model.supportsTools ||
      (Array.isArray(model.supportedParameters) && (model.supportedParameters.includes('tools') || model.supportedParameters.includes('function_calling')))
    )
  );

  const webFetchEngine = settings.webSearchCfg?.openrouter?.web_fetch_engine || 'auto';
  const webFetchServerTool = {
    type: "openrouter:web_fetch"
  };
  if (webFetchEngine && webFetchEngine !== 'auto') {
    webFetchServerTool.parameters = {
      engine: webFetchEngine
    };
  }

  // Серверный инструмент openrouter:shell поддерживается строго на Responses/Messages API
  // и изолированно запускается в toolCalling.js -> runOpenRouterHostedShell.
  // В основном чате через Chat Completions используются datetime, web_fetch и WEB_AGENT_TOOLS.
  /* Серверный поиск нужен только основному ответу (aiMsg есть), не параллельным веткам мышления */
  const orServerSearch = Boolean(
    aiMsg &&
    window.toolCalling &&
    typeof window.toolCalling.isOrServerSearchActive === 'function' &&
    window.toolCalling.isOrServerSearchActive(settings, model)
  );
  /* Субагенты: openrouter:subagent выполняется на сервере OpenRouter, только для основного ответа */
  const subagentTools = (aiMsg && !aiMsg._forceDirectAnswer && window.toolCalling &&
    typeof window.toolCalling.buildOpenRouterSubagentTools === 'function')
    ? window.toolCalling.buildOpenRouterSubagentTools()
    : [];
  /* Ветки параллельного мышления (aiMsg === null) и синтез без инструментов работают как чистый текстовый вызов */
  const isMainTurn = Boolean(aiMsg) && !aiMsg._forceDirectAnswer;
  if (isMainTurn && (supportsNativeTools || orServerSearch || subagentTools.length)) {
    /* datetime не передаём: дата и время уже есть в системном промпте (buildTemporalContextInstructions) */
    const rejected = getRejectedToolTypes(actualModelId);
    const toolsList = [webFetchServerTool].filter(t => !rejected.has(t.type));
    if (!rejected.has('openrouter:subagent')) toolsList.push(...subagentTools);
    if (orServerSearch) {
      toolsList.push(window.toolCalling.buildOpenRouterWebSearchTool(null, { serverMode: true }));
    }
    if (typeof window.WEB_AGENT_TOOLS !== 'undefined' && Array.isArray(window.WEB_AGENT_TOOLS)) {
      /* В серверном режиме клиентский web_search не нужен: поиск делает openrouter:web_search */
      toolsList.push(...window.WEB_AGENT_TOOLS.filter(t => !(orServerSearch && t.function && t.function.name === 'web_search')));
    }
    payload.tools = toolsList;
  }

  const configuredMaxTokens = model.max_output_tokens || model.maxTokens;
  if (typeof configuredMaxTokens === 'number' && configuredMaxTokens > 0) {
    payload.max_tokens = Math.max(configuredMaxTokens, 16384);
  } else {
    // Гарантируем просторный буфер вывода (16K токенов) для цельных HTML-артефактов и рассуждений
    payload.max_tokens = 16384;
  }

  const appMeta = window.APP_IDENTITY || OR_APP_CONSTANTS;

  if (chat && chat.id) {
    payload.session_id = String(chat.id).slice(0, 128);
  }
  if (aiMsg && aiMsg.id) {
    payload.user = 'user_' + String(chat?.id || aiMsg.id).slice(0, 64);
  }

  payload.trace = {
    trace_name: appMeta.title,
    generation_name: 'Chat Completion',
    environment: 'production'
  };

  payload.metadata = {
    app_title: appMeta.title,
    app_url: appMeta.refererUrl || appMeta.referer || 'https://unichat2.sahbanovtimur228.workers.dev',
    app_icon: appMeta.faviconUrl || appMeta.favicon || 'https://unichat2.sahbanovtimur228.workers.dev/favicon.ico',
    favicon_url: appMeta.faviconUrl || appMeta.favicon || 'https://unichat2.sahbanovtimur228.workers.dev/favicon.ico',
    description: appMeta.description
  };

  // Добавляем reasoning только если он поддерживается моделью и включен пользователем
  if (!aiMsg?._forceDirectAnswer && reasoning && (model.reasoning || reasoning.include_reasoning || reasoning.effort) && settings.reasoning !== 'off') {
    if (reasoning.include_reasoning) {
      payload.include_reasoning = true;
      payload.reasoning = { enabled: true };
    } else {
      payload.reasoning = reasoning;
    }
  } else if (aiMsg?._forceDirectAnswer) {
    payload.include_reasoning = false;
    if (model.id.startsWith('openai/') || model.api === 'openai') {
      payload.reasoning = { effort: 'low' };
    } else {
      delete payload.reasoning;
    }
  }

  // Индивидуальная маршрутизация через выбранные провайдеры для actualModelId (с учётом flavor)
  const providerPayload = model.requiresOpenRouter ? null : buildOpenRouterProviderPayload(settings, actualModelId);
  if (providerPayload) {
    payload.provider = providerPayload;
  }

  if (model.requiresOpenRouter) {
    // Пресет хранит свои параметры: не перезаписываем их значениями по умолчанию
    delete payload.temperature;
    delete payload.max_tokens;
  }
  const streamAbortCtrl = new AbortController();
  const onExternalAbort = () => {
    try { streamAbortCtrl.abort(); } catch (_) { }
  };

  if (handlers.signal) {
    if (handlers.signal.aborted) {
      streamAbortCtrl.abort();
    } else {
      handlers.signal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  let timedOut = false;
  let timeoutId = null;
  const timeoutError = () => new Error('Превышено время ожидания ответа от OpenRouter (прерывание по неактивности потока).');
  const armTimeout = (delayMs = 35000) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      timedOut = true;
      try { streamAbortCtrl.abort(); } catch (_) { }
    }, delayMs);
  };

  const targetEndpointUrl = OPENROUTER_URL;
  const requestBodyJson = JSON.stringify(payload);

  /* Субагент может выполнять вызовы инструментов до первого чанка: даём больше времени на подключение */
  const hasSubagentTool = Array.isArray(payload.tools) && payload.tools.some(t => t && t.type === 'openrouter:subagent');
  armTimeout(hasSubagentTool ? 180000 : 75000);
  let resp;
  try {
    resp = await fetch(targetEndpointUrl, {
      method: 'POST',
      headers: buildOpenRouterHeaders(apiKey),
      body: requestBodyJson,
      signal: streamAbortCtrl.signal
    });
  } catch (e) {
    clearTimeout(timeoutId);
    if (handlers.signal) handlers.signal.removeEventListener('abort', onExternalAbort);
    if (timedOut) throw timeoutError();
    if (e && e.name === 'AbortError') throw e;
    throw new Error('Сеть недоступна: ' + (e.message || e));
  }

  armTimeout(45000);
  /* 400: находим серверный инструмент, который отклоняет запрос, повторяем без него и запоминаем для модели */
  if (!resp.ok && resp.status === 400) {
    const firstErrText = await resp.clone().text().catch(() => '');
    console.warn('[MoonSSS] 400 от OpenRouter:', firstErrText.slice(0, 800));

    const serverTypes = (Array.isArray(payload.tools) ? payload.tools : [])
      .map(t => t && t.type)
      .filter(t => typeof t === 'string' && t.startsWith('openrouter:'));
    const candidates = ['openrouter:subagent', 'openrouter:web_fetch'].filter(c => serverTypes.includes(c));

    const buildBody = (drop) => {
      const { tools, ...rest } = payload;
      const kept = (tools || []).filter(t => !t || !drop.includes(t.type));
      return JSON.stringify(kept.length ? { ...rest, tools: kept } : rest);
    };
    const tryWithout = (drop) => fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: buildOpenRouterHeaders(apiKey),
      body: buildBody(drop),
      signal: streamAbortCtrl.signal
    });

    let fixed = null;
    /* Сначала пробуем убрать каждый кандидат по отдельности: так виден реальный виновник */
    for (const c of candidates) {
      const r = await tryWithout([c]);
      if (r.ok) { fixed = { drop: [c], resp: r }; break; }
    }
    /* Если по одному не помогло, пробуем убрать всех кандидатов сразу */
    if (!fixed && candidates.length > 1) {
      const r = await tryWithout(candidates);
      if (r.ok) fixed = { drop: candidates, resp: r };
    }

    if (fixed) {
      const { tools, ...rest } = payload;
      const kept = (tools || []).filter(t => !t || !fixed.drop.includes(t.type));
      if (kept.length) payload.tools = kept; else delete payload.tools;
      resp = fixed.resp;
      /* Субагенты: отказ связан с параметрами работника, а не с моделью — не блокируем инструмент на 15 минут */
      if (!fixed.drop.includes('openrouter:subagent')) rememberRejectedTools(actualModelId, fixed.drop);
      console.warn('[MoonSSS] модель отклонила', fixed.drop.join(', '), '— дальше без них');
      if (typeof window.toast === 'function') window.toast('Модель не приняла ' + fixed.drop.join(', ') + ', ответ без них', 'info', 3200);
    }
  }
  if (!resp.ok) {
    // Автоматический Fallback: если модель с flavor-суффиксом вернула 404, повторяем запрос с базовым чистым ID
    if (resp.status === 404 && actualModelId !== cleanBaseId) {
      console.warn(`[MoonSSS] OpenRouter 404 для "${actualModelId}". Автоматический откат на базовую модель "${cleanBaseId}"...`);
      actualModelId = cleanBaseId;
      payload.model = cleanBaseId;

      const fallbackProviderPayload = buildOpenRouterProviderPayload(settings, cleanBaseId);
      if (fallbackProviderPayload) {
        payload.provider = fallbackProviderPayload;
      } else {
        delete payload.provider;
      }

      armTimeout(75000);
      try {
        resp = await fetch(OPENROUTER_URL, {
          method: 'POST',
          headers: buildOpenRouterHeaders(apiKey),
          body: JSON.stringify(payload),
          signal: streamAbortCtrl.signal
        });
      } catch (retryErr) {
        clearTimeout(timeoutId);
        if (handlers.signal) handlers.signal.removeEventListener('abort', onExternalAbort);
        if (timedOut) throw timeoutError();
        if (retryErr && retryErr.name === 'AbortError') throw retryErr;
        throw new Error('Сеть недоступна: ' + (retryErr.message || retryErr));
      }

      if (resp.ok) {
        // Успешный откат: сбрасываем поврежденный flavor в настройках
        if (settings.modelProviders) {
          if (settings.modelProviders[cleanBaseId]) settings.modelProviders[cleanBaseId].flavor = 'standard';
          if (settings.modelProviders[model.id]) settings.modelProviders[model.id].flavor = 'standard';
          if (typeof window.save === 'function') window.save();
        }
        if (typeof window.toast === 'function') {
          window.toast(`Модель «${cleanBaseId}» запущена без суффикса (вариант недоступен)`, 'info', 2600);
        }
      }
    }
  }

  if (!resp.ok) {
    clearTimeout(timeoutId);
    if (handlers.signal) handlers.signal.removeEventListener('abort', onExternalAbort);
    const errMsg = await parseOpenRouterError(resp);
    if (resp.status === 404) {
      console.error(`[MoonSSS] OpenRouter 404 for model: "${actualModelId}" (original: "${model.id}")`);
      throw new Error(`Модель «${actualModelId}» не найдена в реестре OpenRouter. Проверьте правильность ID.`);
    }
    throw new Error(errMsg);
  }
  if (!resp.body) {
    clearTimeout(timeoutId);
    if (handlers.signal) handlers.signal.removeEventListener('abort', onExternalAbort);
    throw new Error('Пустое тело ответа OpenRouter');
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let sawDone = false;
  const toolCallsAccumulator = new Map();

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      armTimeout(hasSubagentTool ? 120000 : 35000); // Сброс тайм-аута при получении каждого чанка
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const raw of lines) {
        const line = raw.trim();
        if (!line || !line.startsWith('data:')) continue;
        const chunk = line.slice(5).trim();
        if (chunk === '[DONE]') { sawDone = true; break; }
        let obj;
        try { obj = JSON.parse(chunk); } catch (e) { continue; }
        handleOpenRouterChunk(obj, handlers, aiMsg, toolCallsAccumulator);
      }
      if (sawDone) break;
    }

    /* Эмитим накопленные завершённые tool_calls, если они не были закрыты досрочно */
    if (toolCallsAccumulator.size > 0 && typeof handlers.onNativeToolCall === 'function') {
      toolCallsAccumulator.forEach(tc => {
        try {
          const parsedArgs = JSON.parse(tc.arguments || '{}');
          handlers.onNativeToolCall({ id: tc.id, name: tc.name, args: parsedArgs });
        } catch (_) { }
      });
      toolCallsAccumulator.clear();
    }
  } catch (err) {
    if (timedOut) throw timeoutError();
    throw err;
  } finally {
    clearTimeout(timeoutId);
    if (handlers.signal) handlers.signal.removeEventListener('abort', onExternalAbort);
  }
}

/* Состояние одного потока: разделители между сообщениями, дедупликация вызовов и цитат */
function newStreamState() {
  return { hadText: false, sep: false, fetched: new Set(), cited: new Set() };
}

/* Защитное извлечение данных серверного вызова openrouter:web_fetch из события/элемента.
   Формат элементов Responses API в бете может меняться, поэтому ищем поля во всех вложенных пулах. */
function extractServerFetchInfo(it) {
  if (!it || typeof it !== 'object') return null;
  if (!/web_fetch/i.test(String(it.type || '')) && !/web_fetch/i.test(String(it.name || ''))) return null;

  const parseMaybe = v => {
    if (typeof v === 'string') {
      try { const p = JSON.parse(v); return (p && typeof p === 'object') ? p : null; } catch (_) { return null; }
    }
    return (v && typeof v === 'object') ? v : null;
  };
  const pools = [it, it.arguments, it.input, it.parameters, it.args, it.output, it.result, it.response, it.data]
    .map((v, i) => (i === 0 ? v : parseMaybe(v)))
    .filter(Boolean);
  const pick = (...keys) => {
    for (const p of pools) {
      for (const k of keys) {
        const v = p[k];
        if (typeof v === 'string' && v) return v;
      }
    }
    return '';
  };

  const url = pick('url', 'uri', 'source_url');
  const errRaw = it.error && typeof it.error === 'object' ? (it.error.message || JSON.stringify(it.error)) : (it.error || pick('error'));
  const rawStatus = String(it.status || pick('status')).toLowerCase();

  let status = 'loading';
  if (errRaw || /fail|error|denied|blocked/.test(rawStatus)) status = 'error';
  else if (/complet|done|success|finish/.test(rawStatus)) status = 'done';

  return {
    id: String(it.id || it.call_id || it.item_id || ''),
    url,
    title: pick('title'),
    content: pick('content', 'text', 'markdown'),
    status,
    error: String(errRaw || '')
  };
}

/* Серверный субагент (openrouter:subagent): извлечение данных вызова для журнала */
function extractServerSubagentInfo(it) {
  if (!it || typeof it !== 'object') return null;
  if (!/subagent/i.test(String(it.type || '')) && !/subagent/i.test(String(it.name || ''))) return null;
  const parseMaybe = v => {
    if (typeof v === 'string') { try { return JSON.parse(v); } catch (_) { return v; } }
    return v;
  };
  const input = parseMaybe(it.arguments || it.input || it.parameters || it.args) || {};
  const output = parseMaybe(it.output || it.result || it.response);
  const rawErr = it.error ? (it.error.message || JSON.stringify(it.error)) : '';
  const rawStatus = String(it.status || '').toLowerCase();
  let status = 'running';
  if (rawErr || /fail|error|denied/.test(rawStatus)) status = 'error';
  else if (/complet|done|success|finish/.test(rawStatus) || output) status = 'done';
  let outText = '';
  if (typeof output === 'string') outText = output;
  else if (output && typeof output === 'object') {
    outText = output.text || output.content || output.result || output.output || JSON.stringify(output);
  }
  const inputObj = (input && typeof input === 'object') ? input : { value: input };
  return {
    id: String(it.id || it.call_id || it.item_id || ''),
    name: 'openrouter:subagent',
    model: String(inputObj.model || ''),
    task: String(inputObj.task || inputObj.input || inputObj.prompt || inputObj.instructions || '').slice(0, 600),
    output: String(outText || '').slice(0, 4000),
    status,
    error: String(rawErr || '').slice(0, 400)
  };
}

function emitServerSubagent(h, st, info) {
  if (!info || typeof h.onServerTool !== 'function') return;
  h.onServerTool(info);
}

/* Запись серверного вызова в сообщение: одна запись на id, поля обновляются по мере поступления */
window.recordServerTool = function (aiMsg, info) {
  if (!aiMsg || !info) return;
  if (!Array.isArray(aiMsg.serverTools)) aiMsg.serverTools = [];
  const same = info.id ? aiMsg.serverTools.find(x => x.id === info.id) : null;
  if (same) {
    Object.keys(info).forEach(k => {
      if (info[k] !== '' && info[k] !== undefined && info[k] !== null) same[k] = info[k];
    });
  } else {
    aiMsg.serverTools.push({ ...info, ts: Date.now() });
  }
};

function emitServerFetch(h, st, info) {
  if (!info || !info.url || typeof h.onServerFetch !== 'function') return;
  const key = info.id + '|' + info.url + '|' + info.status + '|' + (info.content || '').length;
  if (st.fetched.has(key)) return;
  st.fetched.add(key);
  h.onServerFetch(info);
}

/* Цитаты (annotations) из message-элемента Responses API → источники сообщения */
function emitMessageCitations(h, st, item) {
  if (!item || item.type !== 'message' || !Array.isArray(item.content) || typeof h.onWebSearch !== 'function') return;
  const dHost = typeof window.domainHost === 'function' ? window.domainHost : (u => u);
  const sources = [];
  item.content.forEach(c => (c.annotations || []).forEach(a => {
    const uc = a.url_citation || a;
    const uri = uc.url || a.url || '';
    if (!/^https?:\/\//i.test(uri) || st.cited.has(uri)) return;
    st.cited.add(uri);
    sources.push({
      uri,
      title: (uc.title && uc.title !== uri) ? uc.title : dHost(uri),
      snippet: uc.snippet || a.snippet || ''
    });
  }));
  if (sources.length) h.onWebSearch({ queries: [], sources });
}

/* Обработка одного SSE-чанка OpenRouter. По структуре идентичен OpenAI,
   но имеет расширения: delta.reasoning, delta.images, delta.tool_calls, obj.provider. */
function handleOpenRouterChunk(obj, h, aiMsg, tcAcc) {
  if (obj?.provider && typeof h.onProvider === 'function') {
    h.onProvider(obj.provider);
  }
  if (obj?.model && typeof h.onResolvedModel === 'function') {
    h.onResolvedModel(obj.model);
  }

  // 1. Потоковые события Responses API (OpenRouter Responses + Hosted Shell Sandbox + Web Fetch)
  if (obj?.type) {
    const st = (tcAcc && (tcAcc._st || (tcAcc._st = newStreamState()))) || newStreamState();

    if (window.__MOON_DEBUG_SSE && /web_fetch/i.test(JSON.stringify(obj).slice(0, 600))) {
      console.debug('[MoonSSS] web_fetch SSE:', obj);
    }

    /* Начало нового output-элемента: сообщение (ставим разделитель) или серверный вызов (показываем загрузку) */
    if (obj.type === 'response.output_item.added' && obj.item) {
      if (obj.item.type === 'message') {
        st.sep = st.hadText;
      } else {
        const saStart = extractServerSubagentInfo(obj.item);
        if (saStart) emitServerSubagent(h, st, saStart);
        const startInfo = extractServerFetchInfo(obj.item);
        if (startInfo) emitServerFetch(h, st, startInfo);
      }
      return;
    }

    /* Нестандартные события вида response.web_fetch_call.* без вложенного item */
    if (/web_fetch/i.test(obj.type) && !obj.item) {
      const evInfo = extractServerFetchInfo(Object.assign({}, obj, { type: 'openrouter:web_fetch', id: obj.item_id || obj.id }));
      if (evInfo) {
        if (/(completed|done)$/i.test(obj.type) && evInfo.status !== 'error') evInfo.status = 'done';
        emitServerFetch(h, st, evInfo);
      }
      return;
    }

    /* События вида response.openrouter:subagent.* без вложенного item */
    if (/subagent/i.test(obj.type) && !obj.item) {
      const saEv = extractServerSubagentInfo(Object.assign({}, obj, { type: 'openrouter:subagent', id: obj.item_id || obj.id }));
      if (saEv) {
        if (/(completed|done)$/i.test(obj.type) && saEv.status !== 'error') saEv.status = 'done';
        emitServerSubagent(h, st, saEv);
      }
      return;
    }

    if (obj.type === 'response.output_text.delta' && typeof obj.delta === 'string') {
      if (obj.delta && typeof h.onText === 'function') {
        h.onText(st.sep ? '\n\n' + obj.delta : obj.delta);
        st.sep = false;
        st.hadText = true;
      }
      return;
    }
    if (obj.type === 'response.reasoning_summary_text.delta' && typeof obj.delta === 'string') {
      if (typeof h.onThink === 'function') h.onThink(obj.delta);
      return;
    }
    if (obj.type === 'response.output_item.done' && obj.item) {
      const it = obj.item;
      const saDone = extractServerSubagentInfo(it);
      if (saDone) emitServerSubagent(h, st, Object.assign(saDone, { status: saDone.status === 'error' ? 'error' : 'done' }));
      if (it.type === 'openrouter:shell' || it.type === 'shell_call') {
        if (typeof h.onNativeToolCall === 'function') {
          h.onNativeToolCall({
            id: it.id || `shell_${Date.now()}`,
            name: 'openrouter:shell',
            args: {
              command: it.command || it.call || '',
              stdout: it.stdout || '',
              stderr: it.stderr || '',
              exit_code: it.exit_code ?? it.outcome?.exit_code ?? 0
            }
          });
        }
      } else if (extractServerFetchInfo(it)) {
        const doneInfo = extractServerFetchInfo(it);
        if (doneInfo.status === 'loading') doneInfo.status = 'done';
        emitServerFetch(h, st, doneInfo);
      } else if (it.type === 'message') {
        emitMessageCitations(h, st, it);
      }
      return;
    }
    if (obj.type === 'response.completed' && obj.response) {
      if (obj.response.status === 'incomplete' && aiMsg) {
        aiMsg._hitLengthLimit = true;
      }
      (Array.isArray(obj.response.output) ? obj.response.output : []).forEach(outItem => {
        const finalSa = extractServerSubagentInfo(outItem);
        if (finalSa) emitServerSubagent(h, st, Object.assign(finalSa, { status: finalSa.status === 'error' ? 'error' : 'done' }));
        const finalInfo = extractServerFetchInfo(outItem);
        if (finalInfo) {
          if (finalInfo.status === 'loading') finalInfo.status = 'done';
          emitServerFetch(h, st, finalInfo);
        } else if (outItem && outItem.type === 'message') {
          emitMessageCitations(h, st, outItem);
        }
      });
      return;
    }
  }

  // 2. Стандартный поток Chat Completions API
  const choice = obj?.choices?.[0];
  if (!choice) return;
  const delta = choice.delta || {};

  /* 1. Размышления (reasoning / reasoning_content) */
  const think = delta.reasoning || delta.reasoning_content;
  if (typeof think === 'string' && think.length) {
    if (typeof h.onThink === 'function') h.onThink(think);
  }

  /* 2. Структурированные шаги reasoning_details (DeepSeek, Qwen) */
  if (Array.isArray(delta.reasoning_details) && delta.reasoning_details.length) {
    if (typeof h.onReasoningDetails === 'function') h.onReasoningDetails(delta.reasoning_details);
  }

  /* 3. Основной текст ответа */
  if (typeof delta.content === 'string' && delta.content.length) {
    if (typeof h.onText === 'function') h.onText(delta.content);
  }

  /* 4. Сгенерированные изображения (некоторые vision-модели возвращают URL) */
  if (Array.isArray(delta.images)) {
    for (const im of delta.images) {
      const url = im?.url || im?.image_url?.url || im?.b64_json
        ? (im.b64_json ? 'data:image/png;base64,' + im.b64_json : (im.url || im.image_url?.url))
        : null;
      if (url && typeof h.onImage === 'function') h.onImage(url);
    }
  }

  /* 4b. Источники и цитирования (включая openrouter:web_fetch и server web_search) */
  const rawCitations = obj?.citations || choice?.citations || delta?.citations;
  if (Array.isArray(rawCitations) && rawCitations.length && typeof h.onWebSearch === 'function') {
    const dHost = typeof window.domainHost === 'function' ? window.domainHost : (u => u);
    const sources = rawCitations.map(c => {
      const uri = typeof c === 'string' ? c : (c.url || c.uri || '');
      if (!uri || !/^https?:\/\//i.test(uri)) return null;
      return {
        uri,
        title: (typeof c === 'object' && c.title && c.title !== uri) ? c.title : dHost(uri),
        snippet: typeof c === 'object' ? (c.snippet || '') : ''
      };
    }).filter(Boolean);
    if (sources.length) h.onWebSearch({ queries: [], sources });
  }

  const rawAnnotations = delta?.annotations || choice?.annotations || choice?.message?.annotations;
  if (Array.isArray(rawAnnotations) && rawAnnotations.length && typeof h.onWebSearch === 'function') {
    const dHost = typeof window.domainHost === 'function' ? window.domainHost : (u => u);
    const sources = [];
    rawAnnotations.forEach(a => {
      const uc = a.url_citation || a;
      const uri = uc.url || a.url || '';
      if (uri && /^https?:\/\//i.test(uri)) {
        sources.push({
          uri,
          title: (uc.title && uc.title !== uri) ? uc.title : dHost(uri),
          snippet: uc.snippet || a.snippet || ''
        });
      }
    });
    if (sources.length) h.onWebSearch({ queries: [], sources });
  }

  /* 5. Накопление потоковых Tool Calls (OpenRouter / OpenAI / Claude) */
  if (Array.isArray(delta.tool_calls) && tcAcc) {
    for (const tc of delta.tool_calls) {
      const idx = tc.index ?? 0;
      if (!tcAcc.has(idx)) {
        tcAcc.set(idx, {
          id: tc.id || `call_${Date.now()}_${idx}`,
          name: tc.function?.name || '',
          arguments: ''
        });
      }
      const item = tcAcc.get(idx);
      if (tc.id) item.id = tc.id;
      if (tc.function?.name) item.name = tc.function.name;
      if (tc.function?.arguments) item.arguments += tc.function.arguments;
    }
  }

  /* При завершении выбора по tool_calls незамедлительно передаём вызовы в агентский цикл */
  if ((choice.finish_reason === 'tool_calls' || choice.finish_reason === 'stop') && tcAcc && tcAcc.size > 0) {
    if (typeof h.onNativeToolCall === 'function') {
      tcAcc.forEach(tc => {
        try {
          const parsedArgs = JSON.parse(tc.arguments || '{}');
          h.onNativeToolCall({ id: tc.id, name: tc.name, args: parsedArgs });
        } catch (_) { }
      });
      tcAcc.clear();
    }
  }

  /* 6. Перехват исчерпания лимита токенов */
  if (choice.finish_reason === 'length' && aiMsg) {
    aiMsg._hitLengthLimit = true;
  }

  /* 7. Сообщение об ошибке внутри потока */
  if (choice.error || obj.error) {
    const msg = choice.error?.message || obj.error?.message || 'Ошибка стриминга';
    throw new Error(msg);
  }
}

/* ============================================================
   RAG WEB SEARCH (SEARCH + EMBEDDINGS + RERANK) VIA OPENROUTER
   Используется когда выбран прямой ключ OpenRouter.
   Модели: perplexity/sonar (live-поиск), pplx-embed (дедуп), voyage-rerank (sort)
   ============================================================ */

async function fetchOpenRouterEmbeddings(texts, apiKey, signal) {
  const resp = await fetch('https://openrouter.ai/api/v1/embeddings', {
    method: 'POST',
    signal,
    headers: buildOpenRouterHeaders(apiKey),
    body: JSON.stringify({
      model: 'perplexity/pplx-embed-v1-0.6b',
      input: texts,
      encoding_format: 'float'
    })
  });
  if (!resp.ok) throw new Error(await parseOpenRouterError(resp));
  const data = await resp.json();
  return (data.data || [])
    .slice()
    .sort((a, b) => (a.index || 0) - (b.index || 0))
    .map(d => d.embedding);
}

async function fetchOpenRouterRerank(query, documents, apiKey, signal, topN = 5) {
  if (!Array.isArray(documents) || !documents.length) return [];
  const cleanQuery = String(query || '').trim();
  const safeTopN = Math.max(1, Math.min(topN || documents.length, documents.length));

  if (!cleanQuery) return documents.slice(0, safeTopN);

  // Валидация и нормализация пар [исходный объект, текст документа]
  const validPairs = [];
  documents.forEach(d => {
    if (!d) return;
    const rawContent = (d.title ? d.title + '\n' : '') + (d.text || d.snippet || d.uri || '');
    const cleanContent = rawContent.replace(/[\r\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
    if (cleanContent.length > 0) {
      validPairs.push({
        doc: d,
        text: cleanContent.slice(0, 8000)
      });
    }
  });

  if (!validPairs.length) return documents.slice(0, safeTopN);

  const targetTopN = Math.max(1, Math.min(safeTopN, validPairs.length));

  const resp = await fetch('https://openrouter.ai/api/v1/rerank', {
    method: 'POST',
    signal,
    headers: buildOpenRouterHeaders(apiKey),
    body: JSON.stringify({
      model: 'voyageai/rerank-3',
      query: cleanQuery,
      documents: validPairs.map(p => p.text),
      top_n: targetTopN
    })
  });

  if (!resp.ok) throw new Error(await parseOpenRouterError(resp));
  const data = await resp.json();

  const results = Array.isArray(data.results) ? data.results : (Array.isArray(data.data) ? data.data : []);
  if (!results.length) return documents.slice(0, targetTopN);

  // Сортировка по убыванию relevance_score и точное восстановление ссылок на объекты
  const ranked = results
    .slice()
    .sort((a, b) => (Number(b.relevance_score) || 0) - (Number(a.relevance_score) || 0))
    .map(r => (typeof r.index === 'number' && validPairs[r.index] ? validPairs[r.index].doc : null))
    .filter(Boolean);

  return ranked.length ? ranked : documents.slice(0, targetTopN);
}

/* Поисковые модели OpenRouter: sonar — быстрый, sonar-pro — глубже и больше цитат.
   Если основная модель недоступна (400/404), автоматически уходим на следующую. */
const OR_SEARCH_MODELS = ['perplexity/sonar', 'perplexity/sonar-pro'];

/* Извлечение текста и источников из ответа Sonar.
   Читаем ВСЕ каналы: Perplexity-пасc-through (search_results/citations),
   Chat Completions (choices + annotations), Responses API (output[])
   и markdown/голые ссылки в тексте — чтобы поиск не падал в «источники не найдены». */
function extractSonarPayload(data) {
  const sources = [];
  const seen = new Set();
  const texts = [];
  const push = (uri, title, snippet) => {
    if (!uri || typeof uri !== 'string' || seen.has(uri)) return;
    if (!/^https?:\/\//i.test(uri)) return;
    seen.add(uri);
    sources.push({ uri, title: title || uri, snippet: snippet || '' });
  };
  (data.search_results || []).forEach(r => push(r.url, r.title, r.snippet || r.content || ''));
  (data.citations || []).forEach(u => {
    if (typeof u === 'string') push(u, '', '');
    else if (u && u.url) push(u.url, u.title, u.snippet || '');
  });
  const msg = data.choices && data.choices[0] && data.choices[0].message;
  if (msg) {
    if (typeof msg.content === 'string' && msg.content) texts.push(msg.content);
    (msg.annotations || []).forEach(a => {
      const uc = a.url_citation || a;
      push(uc.url, uc.title, uc.snippet || uc.text || '');
    });
  }
  if (Array.isArray(data.output)) {
    for (const item of data.output) {
      if (!item || !Array.isArray(item.content)) continue;
      for (const part of item.content) {
        if (part.type === 'output_text' && part.text) texts.push(part.text);
        (part.annotations || []).forEach(a => {
          const uc = a.url_citation || a;
          push(uc.url, uc.title, uc.snippet || '');
        });
      }
    }
  }
  let content = texts.join('\n');
  const mdRe = /\[([^\]\n]{2,140})\]\((https?:\/\/[^\s()]+)\)/g;
  let m;
  while ((m = mdRe.exec(content)) !== null) push(m[2], m[1].trim(), '');
  const bareRe = /(https?:\/\/[^\s"'<>)]+)/g;
  while ((m = bareRe.exec(content)) !== null) push(m[1], '', '');
  return { content, sources };
}

/* Один запрос → Sonar с поддержкой OpenRouter и ProxyAPI.
   Инструкция вшита в user-сообщение без системной роли. */
async function searchViaSonar(query, apiKey, signal, isProxy = false) {
  let lastErr = null;
  const endpoint = isProxy ? 'https://api.proxyapi.ru/openrouter/v1/chat/completions' : OPENROUTER_URL;
  const cleanKey = String(apiKey || '').trim().replace(/[^\x21-\x7E]/g, '');
  const headers = isProxy ? {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + cleanKey,
    'HTTP-Referer': OR_APP_CONSTANTS.referer,
    'X-Title': OR_APP_CONSTANTS.title
  } : buildOpenRouterHeaders(cleanKey);

  for (const modelId of OR_SEARCH_MODELS) {
    if (signal && signal.aborted) throw new DOMException('Aborted', 'AbortError');
    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        signal,
        headers,
        body: JSON.stringify({
          model: modelId,
          stream: false,
          messages: [{
            role: 'user',
            content:
              'Perform a live web search for the query below. Write a concise factual summary ' +
              '(3-6 sentences) strictly based on retrieved pages. Then on a new line list the most ' +
              'relevant sources as markdown links [title](url). No opinions, no filler.\n\nQuery: ' + query
          }]
        })
      });
      if (resp.status === 400 || resp.status === 404) {
        lastErr = new Error(await parseOpenRouterError(resp));
        continue;
      }
      if (!resp.ok) throw new Error(await parseOpenRouterError(resp));
      return extractSonarPayload(await resp.json());
    } catch (e) {
      if (e && e.name === 'AbortError') throw e;
      lastErr = e;
    }
  }
  if (lastErr) throw lastErr;
  return { content: '', sources: [] };
}

/* Публичный поиск без ключей и без анонимных лимитов (DuckDuckGo + Wikipedia) */
async function searchViaPublicEngines(query, signal) {
  const sources = [];
  const cleanQ = encodeURIComponent(String(query || '').trim());
  if (!cleanQ) return { content: '', sources: [] };

  try {
    const ddgResp = await fetch(`https://api.duckduckgo.com/?q=${cleanQ}&format=json&no_html=1&skip_disambig=1`, { signal });
    if (ddgResp.ok) {
      const data = await ddgResp.json();
      if (data.AbstractURL && data.AbstractText) {
        sources.push({
          uri: data.AbstractURL,
          title: data.Heading || data.AbstractSource || data.AbstractURL,
          snippet: data.AbstractText
        });
      }
      if (Array.isArray(data.RelatedTopics)) {
        for (const topic of data.RelatedTopics) {
          if (topic.FirstURL && topic.Text) {
            sources.push({
              uri: topic.FirstURL,
              title: topic.Text.slice(0, 80),
              snippet: topic.Text
            });
            if (sources.length >= 4) break;
          }
        }
      }
    }
  } catch (_) { }

  try {
    const isCyr = /[а-яёА-ЯЁ]/.test(query);
    const lang = isCyr ? 'ru' : 'en';
    const wpResp = await fetch(`https://${lang}.wikipedia.org/w/api.php?action=opensearch&search=${cleanQ}&limit=4&namespace=0&format=json&origin=*`, { signal });
    if (wpResp.ok) {
      const [, titles, snippets, urls] = await wpResp.json();
      if (Array.isArray(urls)) {
        urls.forEach((u, i) => {
          if (u && !sources.some(s => s.uri === u)) {
            sources.push({
              uri: u,
              title: titles[i] || u,
              snippet: snippets[i] || ''
            });
          }
        });
      }
    }
  } catch (_) { }

  const content = sources.map(s => `[${s.title}](${s.uri}): ${s.snippet}`).join('\n');
  return { content, sources };
}

/* Косинусное сходство для семантической дедупликации */
function cosineSim(a, b) {
  const n = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/* Дедупликация: отбрасываем источники с близостью эмбеддингов выше порога */
async function dedupeByEmbeddings(docs, apiKey, signal, threshold) {
  if (docs.length < 2) return docs;
  const texts = docs.map(d => ((d.title || '') + ' ' + (d.snippet || '')).trim().slice(0, 1800) || ' ');
  const vecs = await fetchOpenRouterEmbeddings(texts, apiKey, signal);
  if (!Array.isArray(vecs) || vecs.length !== docs.length) return docs;
  const keep = [];
  for (let i = 0; i < docs.length; i++) {
    let dup = false;
    for (const k of keep) {
      if (cosineSim(vecs[i], vecs[k]) > (threshold || 0.92)) { dup = true; break; }
    }
    if (!dup) keep.push(i);
  }
  return keep.map(i => docs[i]);
}

/* Основной метод веб-поиска с поддержкой OpenRouter, ProxyAPI и публичного резерва */
async function performOpenRouterWebSearch(queries, signal) {
  const settings = window.state?.settings || {};
  const orKey = (settings.orKey || '').trim();
  const proxyKey = (settings.proxyKey || '').trim();
  const apiKey = orKey || proxyKey;
  const isProxy = !orKey && !!proxyKey;

  const qs = [...new Set((queries || []).filter(q => typeof q === 'string' && q.trim()))].slice(0, 4);
  if (!qs.length) return { sources: [] };

  /* Этап 1: поиск через Perplexity Sonar (при наличии ключа), иначе через публичные шлюзы */
  const perQuery = await Promise.all(qs.map(async (q) => {
    if (apiKey) {
      try {
        const res = await searchViaSonar(q, apiKey, signal, isProxy);
        if (res && res.sources && res.sources.length) return res;
      } catch (err) {
        if (err && err.name === 'AbortError') throw err;
        console.warn('[Search] Sonar inference failed, switching to public fallback:', q, err);
      }
    }
    return searchViaPublicEngines(q, signal).catch(e => {
      if (e && e.name === 'AbortError') throw e;
      return { content: '', sources: [] };
    });
  }));

  const seen = new Set();
  let docs = [];
  perQuery.forEach((r, i) => {
    (r.sources || []).forEach(s => {
      if (s && s.uri && !seen.has(s.uri)) { seen.add(s.uri); docs.push(s); }
    });
    if (r.content && r.content.trim()) {
      const uri = 'https://duckduckgo.com/?q=' + encodeURIComponent(qs[i]);
      if (!seen.has(uri)) {
        seen.add(uri);
        docs.push({
          uri,
          title: 'Сводка по запросу: ' + qs[i],
          snippet: r.content.trim().slice(0, 1500)
        });
      }
    }
  });
  if (!docs.length) return { sources: [] };

  /* Этап 2: семантический дедуп через pplx-embed (при прямом ключе OpenRouter) */
  if (orKey) {
    try {
      docs = await dedupeByEmbeddings(docs, orKey, signal, 0.92);
    } catch (_) { }
  }

  /* Этап 3: финальное ранжирование voyageai/rerank-3 (при прямом ключе OpenRouter) */
  if (orKey) {
    try {
      const ranked = await fetchOpenRouterRerank(qs.join(' '), docs, orKey, signal, Math.min(8, docs.length));
      if (ranked && ranked.length) docs = ranked;
    } catch (_) { }
  }

  return {
    sources: docs.map(r => ({ uri: r.uri, title: r.title, snippet: r.snippet }))
  };
}

/* Быстрый перевод запроса через OpenRouter (gpt-4o-mini, ~0.0002$ за вызов).
   Используется translateImageQuery для поиска картинок — устраняет таймаут
   на proxyapi.ru при отсутствии ProxyAPI-ключа или нестабильной сети. */
async function translateQueryViaOpenRouter(query, signal) {
  const settings = window.state?.settings || {};
  const apiKey = (settings.orKey || '').trim();
  if (!apiKey) return null;

  const timeoutCtrl = new AbortController();
  const timeoutId = setTimeout(() => timeoutCtrl.abort(), 15000);
  const combinedSignal = signal
    ? (typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function'
      ? AbortSignal.any([signal, timeoutCtrl.signal])
      : signal)
    : timeoutCtrl.signal;

  try {
    const resp = await fetch(OPENROUTER_URL, {
      method: 'POST',
      signal: combinedSignal,
      headers: buildOpenRouterHeaders(apiKey),
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        stream: false,
        max_tokens: 120,
        temperature: 0.3,
        messages: [{
          role: 'user',
          content:
            'Translate the following search query into 2-6 English keywords for image search. ' +
            'Reply with keywords only, separated by spaces, no punctuation, no explanations.\n\nQuery: ' +
            String(query || '').slice(0, 120)
        }],
        metadata: {
          app_title: (window.APP_IDENTITY?.title || 'MoonSSS'),
          app_url: (window.APP_IDENTITY?.refererUrl || 'https://unichat2.sahbanovtimur228.workers.dev/ai'),
          favicon_url: (window.APP_IDENTITY?.faviconUrl || 'https://unichat2.sahbanovtimur228.workers.dev/favicon.ico'),
          description: (window.APP_IDENTITY?.description || 'MoonSSS — премиальный ИИ-ассистент')
        }
      })
    });
    clearTimeout(timeoutId);
    if (!resp.ok) return null;
    const data = await resp.json();
    const t = (data.choices?.[0]?.message?.content || '').trim();
    return t && t.length < 140 ? t : null;
  } catch (e) {
    clearTimeout(timeoutId);
    if (e && e.name === 'AbortError') return null;
    return null;
  }
}

/* Экспорт в глобальную область для ai.html */
window.buildOpenRouterProviderPayload = buildOpenRouterProviderPayload;
window.fetchOpenRouterModelEndpoints = fetchOpenRouterModelEndpoints;
window.normalizeOpenRouterEndpoint = normalizeOpenRouterEndpoint;
window.getProviderFavicon = getProviderFavicon;
window.getAiModelIcon = getAiModelIcon;
window.providerIconHtml = providerIconHtml;
window.streamOpenRouterDirect = streamOpenRouterDirect;
window.parseOpenRouterError = parseOpenRouterError;
window.performOpenRouterWebSearch = performOpenRouterWebSearch;
window.performWebSearches = performOpenRouterWebSearch;
window.translateQueryViaOpenRouter = translateQueryViaOpenRouter;
window.fetchOpenRouterModels = fetchOpenRouterModels;
window.normalizeOpenRouterModel = normalizeOpenRouterModel;
window.getModelAvailableFlavors = getModelAvailableFlavors;