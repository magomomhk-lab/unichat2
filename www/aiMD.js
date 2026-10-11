// Это aiMD.js. Суть этого файла в том, что он содержит код для работы с Markdown
// Дело в том, что в нашем приложении мы используем Markdown для отображения, например, таблиц и сравнений.
// Однако если элементов для сравнения много, например, пять элементов, то в ширь Markdown может не помещаться в экран, и тогда появляется горизонтальная прокрутка.
// Чтобы избежать этого, мы используем aiMD.js, который оборачивает таблицы и сравнения в, так сказать, "изображение таблицы",
// которое можно просматривать, приближая или отдаляя его как изображение, не нарушая при этом разметку Markdown.
/**
 * Дело в том, что, например в случае с этой таблицей:
Параметр сравнения	Supabase (PostgreSQL BaaS)	IndexedDB (Native Browser / WebView)	SQLite (Native / Capacitor Plugin)	RxDB / WatermelonDB (Офлайн-абстракция)
Архитектурный тип	Клиент-серверная реляционная СУБД (PostgreSQL)	Встроенное NoSQL документное / key-value хранилище	Встроенная бессерверная реляционная SQL СУБД	Реактивная офлайн-first надстройка (над IndexedDB / SQLite)
Среда выполнения	Удаленный сервер / Edge Functions / Self-hosted Docker	Браузерный движок (Chromium, Gecko, WebKit)	Нативный бинарный уровень ОС / C-модуль	JavaScript/TypeScript среда выполнения приложения
Поддержка Web (Браузер)	Полная (через REST, WebSockets, GraphQL)	Нативная (100% поддержка всеми браузерами)	Ограниченная (требует WASM / OPFS / sql.js)	Полная (использует IndexedDB как адаптер)
Поддержка Electron	Полная (HTTP/WS сетевые вызовы)	Нативная (встроена в движок Chromium)	Полная (через better-sqlite3 или нативные Node C++ аддоны)	Полная (адаптер SQLite или IndexedDB)
Поддержка Capacitor (Android)	Полная (через сетевой стек WebView)	Нативная (встроена в Android System WebView)	Высокая (через @capacitor-community/sqlite)	Высокая (адаптер через нативный плагин SQLite)
Работа в режиме Offline	Недоступна без локального кеширующего слоя	Полная автономная работа без подключения к сети	Полная автономная работа без подключения к сети	Специализированная (offline-first с очередью мутаций)
Механизм синхронизации	Realtime WebSockets (CDC через Postgres WAL)	Отсутствует (требуется ручная синхронизация)	Отсутствует (требуется ручная синхронизация)	Встроенный 2-way sync протокол (включая коннектор к Postgres/Supabase)
Схема данных	Строгая типизация, реляционные связи, Foreign Keys	NoSQL: Object Stores, индексация по ключам	Строгая типизация SQL, внешние ключи, транзакции ACID	Схемы данных JSON Schema / типизированные модели с миграциями
Модель транзакций	Полный ACID на уровне сервера БД	Асинхронные транзакции (readwrite, readonly)	Полный ACID (WAL-мод, локальная файловая блокировка)	Транзакционные очереди с версионированием документов
Лимиты объема хранилища	Зависят от тарифа диска сервера (ГБ / ТБ)	Квота диска браузера (~20-60% свободного места)	Ограничено свободным дисковым пространством устройства	Ограничено нижележащим адаптером (IndexedDB или диск)
Сложность запросов	Сложные JOIN, агрегации, оконные функции, pgvector	Простые выборки по ключу, курсоры, поиск по диапазону IDBKeyRange	Полный SQL-синтаксис, индексы, виртуальные таблицы FTS5	Реактивные запросы (RxJS Observables), цепочки фильтров, реляционные линки
Безопасность и авторизация	Row Level Security (RLS), JWT-токены, роли Postgres	Изоляция по Same-Origin Policy браузера	Защита на уровне файловой системы ОС, поддержка шифрования SQLCipher	Защита на уровне хранилища адаптера + клиентское шифрование полей
Задержка чтения / записи (Latency)	Зависит от RTT сети (~20-150 мс)	Мгновенно локально (~1-5 мс, асинхронный event loop)	Мгновенно локально (<1 мс при нативном IPC / fsync)	Мгновенно локально с реактивным обновлением UI

    Появляется проблема, что на устройствах с маленьким экраном, например на телефоне, эта таблица не помещается в ширину экрана, и тогда появляется горизонтальная прокрутка, что не очень удобно для пользователя и выглядит, например, так:
    Параме              (PostgreS       Indexe
    тр сравне           QL BaaS)        DB (Nativ
    ния	Supabase
        Вот что тут неудобно, окончания если не помещаются в экран, то они обрезаются и не видны пользователю. Чтобы этого избежать, мы используем aiMD.js, который оборачивает таблицы и сравнения в, так сказать, "изображение таблицы", которое можно просматривать, приближая или отдаляя его как изображение, не нарушая при этом разметку Markdown.
 */

/* ============================================================
   aiMD.js — Высокопроизводительный процессор Markdown-таблиц MoonSSS
   Прямой аппаратный Canvas 2D движок без SVG foreignObject.
   Преобразует любые сложные таблицы в сверхчёткие Retina-изображения
   с поддержкой полноэкранного зума, панорамирования и жестов.
============================================================ */

'use strict';

class MarkdownTableEnhancer {
    constructor() {
        this.cache = new Map();
        this.observer = null;
        this.init();
    }

    init() {
        // Синхронизация темы оформления при динамическом переключении
        const observer = new MutationObserver(mutations => {
            for (const m of mutations) {
                if (m.attributeName === 'data-theme') {
                    this.reRenderAll();
                    break;
                }
            }
        });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    }

    /* Безопасное извлечение текста ячейки без зависимости от видимости в DOM */
    getCellText(cell) {
        if (!cell) return '';

        // 1. Быстрая попытка через innerText, если элемент не скрыт
        try {
            const it = cell.innerText;
            if (typeof it === 'string' && it.trim().length > 0) {
                return it.trim();
            }
        } catch (_) {}

        // 2. Отказоустойчивый парсинг через клон (работает даже если таблица внутри закрытого <details>)
        const clone = cell.cloneNode(true);
        clone.querySelectorAll('script, style, svg').forEach(el => el.remove());
        clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
        clone.querySelectorAll('p, div, li').forEach(el => el.append('\n'));

        const raw = clone.textContent || '';
        return raw
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .split('\n')
            .map(line => line.replace(/[ \t]+/g, ' ').trim())
            .filter((line, i, arr) => line.length > 0 || arr.length <= 1)
            .join('\n')
            .trim();
    }

    /* Получение актуальных дизайн-токенов с гарантированным вычислением CSS var() в чистый rgb/rgba для Canvas */
    getThemeTokens() {
        const root = document.documentElement;
        const isLight = root.dataset.theme === 'light';
        const dummy = document.createElement('div');
        dummy.style.display = 'none';
        (document.body || root).appendChild(dummy);

        const resolveColor = (cssVal, fallback) => {
            if (!cssVal) return fallback;
            try {
                dummy.style.color = cssVal;
                const computed = window.getComputedStyle(dummy).color;
                return computed || fallback;
            } catch (_) {
                return fallback;
            }
        };

        const tokens = {
            isLight,
            bg: resolveColor('var(--custom-bg, var(--bg0))', isLight ? '#f0f2f5' : '#141414'),
            cardBg: resolveColor('var(--custom-card-bg, var(--panel-solid))', isLight ? '#ffffff' : '#18181b'),
            headerBg: resolveColor(isLight ? 'rgba(241, 245, 249, 0.96)' : 'rgba(30, 30, 36, 0.96)', isLight ? '#f1f5f9' : '#1e1e24'),
            altRowBg: resolveColor(isLight ? 'rgba(248, 250, 252, 0.75)' : 'rgba(255, 255, 255, 0.025)', isLight ? '#f8fafc' : '#1e1e24'),
            border: resolveColor('var(--line)', isLight ? 'rgba(0, 0, 0, 0.09)' : 'rgba(255, 255, 255, 0.10)'),
            borderStrong: resolveColor('var(--line-strong)', isLight ? 'rgba(0, 0, 0, 0.16)' : 'rgba(255, 255, 255, 0.18)'),
            text: resolveColor('var(--text)', isLight ? '#0f172a' : '#f8fafc'),
            textDim: resolveColor('var(--text-dim)', isLight ? '#475569' : '#94a3b8'),
            textFaint: resolveColor('var(--text-faint)', isLight ? '#64748b' : '#64748b'),
            accent: resolveColor('var(--accent)', isLight ? '#1d4ed8' : '#8fd0f5'),
            accentSoft: resolveColor('var(--accent-soft)', isLight ? 'rgba(29, 78, 216, 0.12)' : 'rgba(143, 208, 245, 0.16)')
        };

        dummy.remove();
        return tokens;
    }

    /* Преобразование таблицы в валидный Markdown для буфера обмена */
    tableToMarkdown(table) {
        const rows = Array.from(table.querySelectorAll('tr'));
        if (!rows.length) return '';

        const matrix = rows.map(r => 
            Array.from(r.querySelectorAll('th, td')).map(c => 
                this.getCellText(c).replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ')
            )
        );

        if (!matrix.length) return '';
        const colCount = Math.max(...matrix.map(r => r.length));
        
        let md = '';
        matrix.forEach((row, i) => {
            while (row.length < colCount) row.push('');
            md += '| ' + row.join(' | ') + ' |\n';
            if (i === 0) {
                md += '| ' + row.map(() => '---').join(' | ') + ' |\n';
            }
        });
        return md;
    }

    /* Преобразование таблицы в формат CSV (с поддержкой Excel) */
    tableToCsv(table) {
        const rows = Array.from(table.querySelectorAll('tr'));
        return rows.map(r => 
            Array.from(r.querySelectorAll('th, td')).map(c => {
                const text = this.getCellText(c).replace(/"/g, '""');
                return /[",;\n]/.test(text) ? `"${text}"` : text;
            }).join(';')
        ).join('\r\n');
    }

    /* Вспомогательный алгоритм переноса строк по словам для ячейки заданной ширины */
    wrapTextLines(ctx, text, maxWidth) {
        if (!text || !text.trim()) return ['—'];
        const paragraphs = String(text).split('\n');
        const lines = [];

        for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
            const rawWords = paragraphs[pIdx].split(/\s+/).filter(Boolean);
            if (!rawWords.length) {
                if (paragraphs.length > 1) lines.push('');
                continue;
            }

            // Защита от переполнения: длинные неразрывные слова делятся на фрагменты по ширине
            const words = [];
            for (const w of rawWords) {
                if (ctx.measureText(w).width <= maxWidth) {
                    words.push(w);
                } else {
                    let chunk = '';
                    for (let cI = 0; cI < w.length; cI++) {
                        const testChunk = chunk + w[cI];
                        if (ctx.measureText(testChunk).width <= maxWidth) {
                            chunk = testChunk;
                        } else {
                            if (chunk) words.push(chunk);
                            chunk = w[cI];
                        }
                    }
                    if (chunk) words.push(chunk);
                }
            }

            if (!words.length) continue;

            let currentLine = words[0];
            for (let wIdx = 1; wIdx < words.length; wIdx++) {
                const word = words[wIdx];
                const testLine = currentLine + ' ' + word;
                const width = ctx.measureText(testLine).width;
                if (width <= maxWidth) {
                    currentLine = testLine;
                } else {
                    lines.push(currentLine);
                    currentLine = word;
                }
            }
            lines.push(currentLine);
        }
        return lines.length ? lines : ['—'];
    }

    /* 
       Прямой рендерер таблицы на HTML5 Canvas 2D:
       100% надежен, не блокируется браузерными политиками безопасности,
       поддерживает сверхвысокое разрешение Retina (2x scale) и точную типографику.
    */
    async renderTableToDataUrl(table, tokens) {
        const trs = Array.from(table.querySelectorAll('tr'));
        if (!trs.length) return null;

        // 1. Построение матрицы ячеек
        const matrix = [];
        let maxCols = 0;

        trs.forEach((tr, rIdx) => {
            const domCells = Array.from(tr.querySelectorAll('th, td'));
            if (domCells.length > maxCols) maxCols = domCells.length;
            matrix.push({
                isHeader: rIdx === 0,
                cells: domCells.map(c => ({
                    text: this.getCellText(c),
                    isTh: c.tagName.toLowerCase() === 'th' || rIdx === 0
                }))
            });
        });

        if (maxCols === 0) return null;

        // Выравнивание структуры строк
        matrix.forEach(row => {
            while (row.cells.length < maxCols) {
                row.cells.push({ text: '', isTh: false });
            }
        });

        // 2. Расчет метрик и калибровка колонок
        const fontFace = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
        const fontSize = 13;
        const headerFontSize = 13.5;
        const lineHeight = 19;
        const padX = 18;
        const padY = 14;

        // Измерительный контекст
        const measureCanvas = document.createElement('canvas');
        const mctx = measureCanvas.getContext('2d');
        if (!mctx) return null;

        // Минимальная и максимальная допустимая ширина колонки
        const minColWidth = maxCols <= 3 ? 180 : 150;
        const maxColWidth = maxCols <= 3 ? 380 : (maxCols <= 5 ? 290 : 230);
        const colWidths = new Array(maxCols).fill(minColWidth);

        // Расчет идеальной ширины каждой колонки с учётом длины слов
        for (let cIdx = 0; cIdx < maxCols; cIdx++) {
            let maxMeasured = minColWidth;

            matrix.forEach(row => {
                const cell = row.cells[cIdx];
                if (!cell || !cell.text) return;

                mctx.font = (row.isHeader || cell.isTh) 
                    ? `700 ${headerFontSize}px ${fontFace}` 
                    : `400 ${fontSize}px ${fontFace}`;

                const words = cell.text.split(/\s+/).filter(Boolean);
                let longestWordW = 0;
                words.forEach(w => {
                    const wWidth = mctx.measureText(w).width;
                    if (wWidth > longestWordW) longestWordW = wWidth;
                });

                const totalTextW = mctx.measureText(cell.text).width;
                const minFitW = longestWordW + padX * 2 + 12;
                const targetW = Math.max(minFitW, Math.min(maxColWidth, Math.ceil(totalTextW / 2.2 + padX * 2)));
                if (targetW > maxMeasured) {
                    maxMeasured = Math.ceil(targetW);
                }
            });

            colWidths[cIdx] = Math.max(minColWidth, maxMeasured);
        }

        // 3. Вычисление строк с переносом текста и высоты каждой строки
        matrix.forEach(row => {
            row.cells.forEach((cell, cIdx) => {
                const availW = colWidths[cIdx] - (padX * 2);
                mctx.font = (row.isHeader || cell.isTh) 
                    ? `700 ${headerFontSize}px ${fontFace}` 
                    : `400 ${fontSize}px ${fontFace}`;
                cell.lines = this.wrapTextLines(mctx, cell.text, availW);
            });

            const maxLines = Math.max(1, ...row.cells.map(c => c.lines.length));
            row.height = maxLines * lineHeight + (padY * 2);
        });

        // 4. Геометрические габариты результирующего изображения
        const cardMargin = 16;
        const bannerHeight = 44; // Верхняя статусная планка карточки с метаданными
        const tableWidth = colWidths.reduce((a, b) => a + b, 0);
        const tableHeight = matrix.reduce((sum, r) => sum + r.height, 0);

        const canvasW = tableWidth + (cardMargin * 2);
        const canvasH = tableHeight + (cardMargin * 2) + bannerHeight;

        // Аппаратное масштабирование Retina (2x DPR) для абсолютной резкости при зуме
        const dpr = 2.0;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(canvasW * dpr);
        canvas.height = Math.round(canvasH * dpr);
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.scale(dpr, dpr);

        // ── Отрисовка фона и контейнера карточки ──
        ctx.fillStyle = tokens.bg;
        ctx.fillRect(0, 0, canvasW, canvasH);

        // Карточка таблицы
        const tableStartX = cardMargin;
        const tableStartY = cardMargin + bannerHeight;
        const cardRadius = 14;

        // Верхний информационный баннер таблицы
        ctx.fillStyle = tokens.cardBg;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(tableStartX, cardMargin, tableWidth, bannerHeight - 4, [10, 10, 0, 0]);
        } else {
            ctx.rect(tableStartX, cardMargin, tableWidth, bannerHeight - 4);
        }
        ctx.fill();

        // Заголовок в статусном баннере
        ctx.fillStyle = tokens.textDim;
        ctx.font = `700 11px ${fontFace}`;
        ctx.fillText('MOONSSS · DATA SPECIFICATION TABLE', tableStartX + 16, cardMargin + 24);

        const metaText = `${maxCols} КОЛОНОК · ${matrix.length} СТРОК`;
        ctx.font = `600 10.5px monospace`;
        ctx.fillStyle = tokens.textFaint;
        const metaWidth = ctx.measureText(metaText).width;
        ctx.fillText(metaText, tableStartX + tableWidth - metaWidth - 16, cardMargin + 24);

        // Векторная отрисовка строк таблицы
        let curY = tableStartY;

        matrix.forEach((row, rIdx) => {
            const isHeader = row.isHeader;
            const rowH = row.height;

            // Фоновая подложка строки
            if (isHeader) {
                ctx.fillStyle = tokens.headerBg;
            } else if (rIdx % 2 === 1) {
                ctx.fillStyle = tokens.altRowBg;
            } else {
                ctx.fillStyle = tokens.cardBg;
            }
            ctx.fillRect(tableStartX, curY, tableWidth, rowH);

            // Тонкая горизонтальная линия разметки снизу строки
            ctx.strokeStyle = isHeader ? tokens.accent : tokens.border;
            ctx.lineWidth = isHeader ? 2 : 1;
            ctx.beginPath();
            ctx.moveTo(tableStartX, curY + rowH);
            ctx.lineTo(tableStartX + tableWidth, curY + rowH);
            ctx.stroke();

            // Отрисовка ячеек строки
            let curX = tableStartX;
            row.cells.forEach((cell, cIdx) => {
                const colW = colWidths[cIdx];

                // Вертикальный разделитель колонок (кроме первой)
                if (cIdx > 0) {
                    ctx.strokeStyle = tokens.border;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(curX, curY);
                    ctx.lineTo(curX, curY + rowH);
                    ctx.stroke();
                }

                // Типографика ячейки
                const isTh = isHeader || cell.isTh;
                ctx.fillStyle = isTh ? tokens.accent : tokens.text;
                ctx.font = isTh ? `700 ${headerFontSize}px ${fontFace}` : `400 ${fontSize}px ${fontFace}`;

                const textStartY = curY + padY + (lineHeight * 0.72);
                cell.lines.forEach((line, lIdx) => {
                    ctx.fillText(line, curX + padX, textStartY + (lIdx * lineHeight));
                });

                curX += colW;
            });

            curY += rowH;
        });

        // Внешняя аккуратная контурная рамка всей таблицы
        ctx.strokeStyle = tokens.borderStrong;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(tableStartX, tableStartY, tableWidth, tableHeight);

        return canvas.toDataURL('image/png');
    }

    /* Подключение логики к элементам разметки внутри сообщений */
    async enhanceTables(container) {
        if (!container) return;
        const tables = Array.from(container.querySelectorAll('.md-body table'));

        for (const table of tables) {
            // Исключаем повторное оборачивание уже обработанных таблиц
            if (table.closest('.md-table-card')) continue;

            const firstRow = table.querySelector('tr');
            const cols = firstRow ? firstRow.querySelectorAll('th, td').length : 0;
            const rows = table.querySelectorAll('tr').length;

            // Обрабатываем сравнительные таблицы с 2+ колонками
            if (cols < 2) continue;

            const tokens = this.getThemeTokens();
            const mdContent = this.tableToMarkdown(table);
            const csvContent = this.tableToCsv(table);

            const card = document.createElement('div');
            card.className = 'md-table-card no-sel';
            card.setAttribute('role', 'region');
            card.setAttribute('aria-label', `Таблица данных: ${cols} колонок, ${rows} строк`);

            const headerHtml = `
                <div class="md-table-header">
                    <div class="md-table-info">
                        <svg class="ic"><use href="#i-cube"/></svg>
                        <span class="md-table-title">Таблица сравнения</span>
                        <span class="md-table-badge">${cols} кол. · ${rows} стр.</span>
                    </div>
                    <div class="md-table-actions">
                        <button type="button" class="btn btn-ghost btn-sm md-table-btn-zoom" title="Полноэкранный просмотр с приближением (Zoom)">
                            <svg class="ic"><use href="#i-image"/></svg>
                            <span>Зум</span>
                        </button>
                        <button type="button" class="btn btn-ghost btn-sm md-table-btn-copy" title="Скопировать как Markdown">
                            <svg class="ic"><use href="#i-copy"/></svg>
                            <span>MD</span>
                        </button>
                        <button type="button" class="btn btn-ghost btn-sm md-table-btn-csv" title="Скопировать для Excel (CSV)">
                            <svg class="ic"><use href="#i-download"/></svg>
                            <span>CSV</span>
                        </button>
                    </div>
                </div>
            `;

            const imageContainer = document.createElement('div');
            imageContainer.className = 'md-table-image-wrap';
            imageContainer.innerHTML = `
                <div class="md-table-skeleton">
                    <span class="spin"></span>
                    <span>Генерация масштабируемого полотна таблицы…</span>
                </div>
            `;

            // Резервная разметка оригинальной таблицы в доступном аккордеоне
            const details = document.createElement('details');
            details.className = 'md-table-raw-details';
            details.innerHTML = `
                <summary class="md-table-summary">Текстовая разметка таблицы (горизонтальный скролл)</summary>
                <div class="md-table-scroll-view"></div>
            `;

            // Замена элемента в DOM
            table.parentNode.insertBefore(card, table);
            card.innerHTML = headerHtml;
            card.appendChild(imageContainer);
            card.appendChild(details);
            details.querySelector('.md-table-scroll-view').appendChild(table);

            // Аппаратная генерация изображения через нативный Canvas 2D
            try {
                const dataUrl = await this.renderTableToDataUrl(table, tokens);
                if (dataUrl) {
                    imageContainer.innerHTML = `
                        <div class="md-table-preview" title="Нажмите, чтобы открыть таблицу на весь экран и приблизить детали">
                            <img src="${dataUrl}" alt="Таблица данных" class="md-table-img" draggable="false">
                            <div class="md-table-zoom-overlay">
                                <svg class="ic"><use href="#i-image"/></svg>
                                <span>Нажмите для полноэкранного зума</span>
                            </div>
                        </div>
                    `;

                    // Открытие полноэкранного просмотрщика по клику на изображение
                    const previewEl = imageContainer.querySelector('.md-table-preview');
                    if (previewEl) {
                        previewEl.onclick = (e) => {
                            if (e) {
                                e.preventDefault();
                                e.stopPropagation();
                            }
                            if (typeof window.closeMsgContextMenu === 'function') window.closeMsgContextMenu();
                            if (typeof window.openImageViewer === 'function') {
                                window.openImageViewer(dataUrl, 'Таблица сравнения данных');
                            }
                        };
                    }

                    // Кнопка «Зум» в тулбаре карточки
                    const zoomBtn = card.querySelector('.md-table-btn-zoom');
                    if (zoomBtn) {
                        zoomBtn.onclick = (e) => {
                            if (e) {
                                e.preventDefault();
                                e.stopPropagation();
                            }
                            if (typeof window.closeMsgContextMenu === 'function') window.closeMsgContextMenu();
                            if (typeof window.openImageViewer === 'function') {
                                window.openImageViewer(dataUrl, 'Таблица сравнения данных');
                            }
                        };
                    }
                } else {
                    imageContainer.innerHTML = '<div class="md-table-skeleton">Разметка отображена ниже</div>';
                    details.open = true;
                }
            } catch (err) {
                console.warn('[aiMD] Table canvas render fallback:', err);
                imageContainer.innerHTML = '<div class="md-table-skeleton">Разметка отображена ниже</div>';
                details.open = true;
            }

            // Копирование Markdown
            const copyBtn = card.querySelector('.md-table-btn-copy');
            if (copyBtn) {
                copyBtn.onclick = (e) => {
                    if (e) e.stopPropagation();
                    navigator.clipboard.writeText(mdContent)
                        .then(() => {
                            if (typeof window.toast === 'function') window.toast('Таблица скопирована как Markdown', 'ok', 1800);
                        })
                        .catch(() => {
                            if (typeof window.toast === 'function') window.toast('Не удалось скопировать таблицу', 'err');
                        });
                };
            }

            // Копирование CSV
            const csvBtn = card.querySelector('.md-table-btn-csv');
            if (csvBtn) {
                csvBtn.onclick = (e) => {
                    if (e) e.stopPropagation();
                    navigator.clipboard.writeText(csvContent)
                        .then(() => {
                            if (typeof window.toast === 'function') window.toast('Таблица скопирована в формате CSV (Excel)', 'ok', 1800);
                        })
                        .catch(() => {
                            if (typeof window.toast === 'function') window.toast('Не удалось скопировать CSV', 'err');
                        });
                };
            }

            // Изоляция кликов внутри карточки: предотвращаем всплытие к .msg и случайное открытие меню
            card.addEventListener('click', e => {
                e.stopPropagation();
            });
        }
    }

    /* Мгновенная адаптация палитры таблиц при смене темы */
    reRenderAll() {
        const cards = document.querySelectorAll('.md-table-card');
        const tokens = this.getThemeTokens();

        cards.forEach(async card => {
            const table = card.querySelector('table');
            const imgWrap = card.querySelector('.md-table-image-wrap');
            if (!table || !imgWrap) return;

            try {
                const dataUrl = await this.renderTableToDataUrl(table, tokens);
                if (!dataUrl) return;

                const img = imgWrap.querySelector('.md-table-img');
                if (img) img.src = dataUrl;

                const previewEl = imgWrap.querySelector('.md-table-preview');
                if (previewEl) {
                    previewEl.onclick = (e) => {
                        if (e) {
                            e.preventDefault();
                            e.stopPropagation();
                        }
                        if (typeof window.closeMsgContextMenu === 'function') window.closeMsgContextMenu();
                        if (typeof window.openImageViewer === 'function') {
                            window.openImageViewer(dataUrl, 'Таблица сравнения данных');
                        }
                    };
                }

                const zoomBtn = card.querySelector('.md-table-btn-zoom');
                if (zoomBtn) {
                    zoomBtn.onclick = (e) => {
                        if (e) {
                            e.preventDefault();
                            e.stopPropagation();
                        }
                        if (typeof window.closeMsgContextMenu === 'function') window.closeMsgContextMenu();
                        if (typeof window.openImageViewer === 'function') {
                            window.openImageViewer(dataUrl, 'Таблица сравнения данных');
                        }
                    };
                }
            } catch (_) { }
        });
    }
}

// Экспорт синглтона
window.aiMD = new MarkdownTableEnhancer();