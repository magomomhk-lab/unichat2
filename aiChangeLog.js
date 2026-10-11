/* ============================================================
   MoonSSS — Модуль Истории Обновлений (aiChangeLog.js)
   Адаптивный таймлайн с поддержкой Markdown, изображений,
   тегов версий и сохранением прочитанного статуса в IndexedDB.
============================================================ */

'use strict';

class ChangelogController {
    constructor() {
        this.overlay = null;
        this.body = null;
        this.badgeDot = null;
        this.latestBadge = null;
        this.dbKey = 'last_read_changelog_version';

        // Реестр релизов (от новых к старым)
        this.entries = [
            {
                version: "???.??.??",
                date: "7.10.2026",
                title: "Most UPD!",
                description: "Большие обновления",
                items: [
                    "Are you ready?!...",
                    "Версия 2.0.0 уже на подходе!",
                ],
            },
            {
                version: "1.9.9",
                date: "3.10.2026",
                title: "Most UPD!",
                description: "Большие обновления",
                items: [
                    "Обновлен UI приложения. Теперь кнопки и прочие элементы приложение обновлены до эффекта жидкого стекла",
                    "Изменено содержание настроек. Теперь в них можно быстро переключаться между вкладками Общие / API / Среда и хранилище",
                    "Больше адаптации под мобильные устройства. Теперь в настройках можно быстро переключаться между вкладками Общие / API / Среда и хранилище",
                    "Теперь контекстное меню функций сообщения появляются лишь при осознанном нажатии по сообщению. Это предотвращает случайные активации и отвлекающие факторы",
                    "Панель артефакта улучшена",
                    "Поиск в интернете улучшен. Теперь поиск в интернете работает быстрее и точнее",
                    "MarkDown-просмотр улучшен. Теперь его можно просматривать в виде удобной таблицы с поддержкой изображений и ссылок",
                    "Прочие мелкие, но значимые улучшения"
                ],
            },
            {
                version: "1.2.0",
                date: "29.09.2026",
                title: "Design Adaption!",
                description: "Обновление и адаптация UI всего приложения!",
                items: [
                    "Обновлен UI приложения. Теперь кнопки и прочие элементы приложение обновлены до эффекта жидкого стекла (Бета версия)",
                    "Во вкладку списка моделей добавлена новая модель от Anthropic – Claude 5.5 Sonnet!",
                    "Прочие мелкие, но значимые улучшения"
                ],
            },
            {
                version: "1.1.0",
                date: "25.09.2026",
                title: "Some Fixed&more!",
                description: "Обновления создания артефактов, стабильности поля ввода, добавление новых форматов файловых референсов!",
                items: [
                    "Теперь можно отправлять ИИ видео, музыку, word и другие файлы! Больше доступа – продуктивнее работа;",
                    "Обновлено поле ввода. Теперь на смартфонах поле ввода активируется тогда, когда вам нужно. Никаких случайных активаций и отвлекающих факторов;",
                    "Создание артефактов. Теперь этот фрагмент находится строго в сообщении и адаптирован под более широкий размер экранов;",
                    "Добавлено больше инновационных ИИ."
                ],
            },
            {
                version: "1.0.0",
                date: "20.09.2026",
                title: "Almost there!",
                description: "Масштабные обновления визуального оформления блоков размышления, веб-поиска, создания артефактов и прочего. Также была улучшена логика работы и взаимосвязей инструментов классического режима MoonSSS",
                items: [
                    "Интерактивная Студия разработчика: создание Canvas-эффектов, частиц и комет с поддержкой горячего перезапуска.",
                    "Раздельная калибровка типографики под русский (Cyrillic), английский (Latin) и японский (日本語) языки.",
                    "Аппаратный шлейф генерации и 16-шаговая интерполяция цвета в пространстве HSLA.",
                    "Каталог «Свой дизайн»: экспорт, импорт и полная инспекция созданных дизайн-пресетов."
                ],
                button: {
                    text: "Открыть настройки темы",
                    action: "appearance"
                }
            },
        ];
    }

    async init() {
        this.overlay = document.getElementById('changelogOverlay');
        this.body = document.getElementById('changelogBody');
        this.badgeDot = document.getElementById('changelogBadgeDot');
        this.latestBadge = document.getElementById('clLatestBadge');

        if (!this.entries || !this.entries.length) return;

        const latestVersion = this.entries[0].version;
        if (this.latestBadge) {
            this.latestBadge.textContent = latestVersion;
        }

        // Проверяем статус прочтения в IndexedDB (без localStorage)
        try {
            const lastRead = window.dbCtrl ? await window.dbCtrl.get(this.dbKey) : null;
            const isUnread = !lastRead || lastRead !== latestVersion;
            if (this.badgeDot) {
                this.badgeDot.hidden = !isUnread;
            }
        } catch (_) {
            if (this.badgeDot) this.badgeDot.hidden = false;
        }
    }

    async open() {
        if (!this.overlay) this.init();
        if (!this.overlay) return;

        this.render();
        this.overlay.classList.add('show');

        if (window.navCtrl) {
            window.navCtrl.push('changelog');
        }

        // Отмечаем последнюю версию как прочитанную в IndexedDB
        if (this.entries && this.entries.length) {
            const latestVersion = this.entries[0].version;
            try {
                if (window.dbCtrl) {
                    await window.dbCtrl.set(this.dbKey, latestVersion);
                }
                if (this.badgeDot) {
                    this.badgeDot.hidden = true;
                }
            } catch (_) {}
        }
    }

    close(opts = {}) {
        if (!this.overlay) return;
        this.overlay.classList.remove('show');
        if (window.navCtrl && !opts.fromPopstate) {
            window.navCtrl.pop('changelog');
        }
    }

    render() {
        if (!this.body) return;

        const formatText = (txt) => {
            if (typeof window.mdToHtml === 'function') {
                return window.mdToHtml(txt);
            }
            return String(txt || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        };

        const html = `
            <div class="cl-timeline">
                ${this.entries.map((entry, idx) => {
                    const isLatest = idx === 0;
                    return `
                        <article class="cl-entry" data-version="${window.esc(entry.version)}">
                            <div class="cl-version-col no-sel">
                                <span class="cl-tag-badge ${isLatest ? 'is-latest' : ''}">${window.esc(entry.version)}</span>
                                <span class="cl-date">${window.esc(entry.date)}</span>
                            </div>

                            <div class="cl-content-col">
                                <h3 class="cl-title">${window.esc(entry.title)}</h3>
                                <div class="cl-desc">${formatText(entry.description)}</div>

                                ${entry.items && entry.items.length ? `
                                    <ul class="cl-items-list">
                                        ${entry.items.map(item => `<li class="cl-item">${formatText(item)}</li>`).join('')}
                                    </ul>
                                ` : ''}

                                ${entry.image ? `
                                    <div class="cl-image-wrap">
                                        <img src="${window.esc(entry.image)}" alt="${window.esc(entry.title)}" loading="lazy" data-zoom-img="${window.esc(entry.image)}">
                                    </div>
                                ` : ''}

                                ${entry.button ? `
                                    <button type="button" class="btn btn-ghost btn-sm cl-action-btn" data-cl-action="${window.esc(entry.button.action || '')}" data-cl-url="${window.esc(entry.button.url || '')}">
                                        <svg class="ic"><use href="#i-chevron-right"/></svg>
                                        <span>${window.esc(entry.button.text)}</span>
                                    </button>
                                ` : ''}
                            </div>
                        </article>
                    `;
                }).join('')}
            </div>
        `;

        this.body.innerHTML = html;

        // Привязка действий кнопок и клика по изображениям
        this.body.querySelectorAll('[data-zoom-img]').forEach(img => {
            img.onclick = () => {
                if (typeof window.openImageViewer === 'function') {
                    window.openImageViewer(img.dataset.zoomImg, img.alt);
                }
            };
        });

        this.body.querySelectorAll('.cl-action-btn').forEach(btn => {
            btn.onclick = () => {
                const action = btn.dataset.clAction;
                const url = btn.dataset.clUrl;
                this.close();

                if (action && typeof window.openSettings === 'function') {
                    window.openSettings(action);
                } else if (url) {
                    if (typeof window.openExternalUrl === 'function') {
                        window.openExternalUrl(url);
                    } else {
                        window.open(url, '_blank', 'noopener,noreferrer');
                    }
                }
            };
        });
    }
}

// Экспорт глобального контроллера
window.changelogController = new ChangelogController();