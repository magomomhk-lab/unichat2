class WhisperManager {
    static REGEX = /\[whisper(?:\s+to=["']([^"']+)["'])?\]([\s\S]*?)\[\/whisper\]/gi;

    static activeTargetInputId = 'chat-input';
    static savedSelection = { start: 0, end: 0 };
    static selectedRecipientNames = [];

    /**
     * Получение текущего контекста чата во всех средах (Web, Electron, Capacitor).
     */
    static getCurrentContext() {
        const id = (typeof window.getCurrentChatId === 'function' ? window.getCurrentChatId() : null)
            || window.currentId
            || (typeof currentId !== 'undefined' ? currentId : null);

        const mode = (typeof window.getCurrentChatMode === 'function' ? window.getCurrentChatMode() : null)
            || window.currentMode
            || (typeof currentMode !== 'undefined' ? currentMode : 'solo');

        const state = window.appState
            || (typeof appState !== 'undefined' ? appState : null);

        return { currentId: id, currentMode: mode, appState: state };
    }

    /**
     * Извлечение списка доступных участников сцены для адресации шёпота.
     */
    static getChatParticipants() {
        const { currentId, currentMode, appState } = WhisperManager.getCurrentContext();
        if (!appState || !currentId) return [];

        const isGroup = currentMode === 'groups';
        const list = [];

        if (isGroup) {
            const group = appState.groups?.find(g => g.id === currentId);
            if (group && Array.isArray(group.participants)) {
                group.participants.forEach(pid => {
                    const c = appState.characters?.find(char => char.id === pid);
                    if (c) {
                        list.push({ id: c.id, name: c.name, avatar: c.avatar, isBot: true });
                    }
                });
            }
        } else {
            const char = appState.characters?.find(c => c.id === currentId);
            if (char) {
                list.push({ id: char.id, name: char.name, avatar: char.avatar, isBot: true });
            }
        }

        const userName = appState.userProfile?.name || 'User';
        list.push({
            id: 'user',
            name: userName,
            avatar: appState.userProfile?.avatar || 'https://via.placeholder.com/40/1e2028/FFFFFF?text=ME',
            isUser: true
        });

        return list;
    }

    /**
     * Парсинг списка адресатов из строки тега.
     */
    static parseRecipients(rawTo) {
        if (!rawTo) return [];
        return rawTo.split(',').map(name => name.trim()).filter(Boolean);
    }

    /**
     * Естественное литературное соединение имен в русском языке ("Эндрю и Юки", "Эндрю, Юки и Алексу").
     */
    static formatRecipientsReadable(recipients) {
        if (!recipients || recipients.length === 0) return 'собеседнику';
        if (recipients.length === 1) return recipients[0];
        if (recipients.length === 2) return `${recipients[0]} и ${recipients[1]}`;
        const last = recipients[recipients.length - 1];
        const rest = recipients.slice(0, recipients.length - 1).join(', ');
        return `${rest} и ${last}`;
    }

    /**
     * Проверка: слышит ли персонаж этот конкретный шёпот.
     */
    static isRecipient(targetNameOrId, recipientsList, appState) {
        if (!targetNameOrId || !recipientsList || recipientsList.length === 0) return false;
        const normalizedTarget = String(targetNameOrId).trim().toLowerCase();

        return recipientsList.some(r => {
            const normalizedR = r.trim().toLowerCase();
            if (normalizedR === normalizedTarget) return true;

            const userName = (appState?.userProfile?.name || 'User').trim().toLowerCase();
            if ((normalizedTarget === 'user' || normalizedTarget === userName) && (normalizedR === 'user' || normalizedR === userName)) return true;

            const char = appState?.characters?.find(c => c.id === targetNameOrId);
            if (char && char.name.trim().toLowerCase() === normalizedR) return true;

            return false;
        });
    }

    /**
     * Системная инструкция для нейросети по ролевому отыгрышу шёпота.
     */
    static getSystemPromptInstructions(currentPersonaName) {
        return `[WHISPER / SECRET SPEECH INSTRUCTIONS]:
- You can whisper secretly to one or more specific characters so others in the room DO NOT hear it.
- Format: Wrap whispered speech strictly in tags: [whisper to="TargetCharacterName"]whispered words[/whisper].
  For multiple listeners: [whisper to="Name1, Name2"]words[/whisper].
- Physical gestures (leaning in close, shielding mouth with a hand, lowering voice) must be placed in asterisks (*like this*) OUTSIDE the [whisper] tag.
- NEVER reveal secret whispered words in plain text.
- If someone whispers to YOU, you hear their words and may react accordingly.
- If someone whispers to SOMEONE ELSE, you only observe them whispering physically; you DO NOT hear or know what was said, and you must NEVER act on secret information you did not hear.`;
    }

    /**
     * Фильтрация истории чата перед отправкой ИИ:
     * Тот, кому шёпот не адресован, не получает секретный текст (он вырезается и заменяется адаптивным описанием).
     */
    static filterHistoryForAI(historyMessages, recipientCharId, isGroup, appState) {
        if (!Array.isArray(historyMessages)) return [];

        const activeChar = appState?.characters?.find(c => c.id === recipientCharId);
        const activeCharName = activeChar ? activeChar.name : (recipientCharId === 'user' ? (appState?.userProfile?.name || 'User') : '');

        return historyMessages.map(msg => {
            if (!msg || typeof msg.content !== 'string') return msg;
            if (!msg.content.includes('[whisper')) return msg;

            const isAuthor = (recipientCharId === 'user' && msg.role === 'user') ||
                             (msg.charId && msg.charId === recipientCharId) ||
                             (msg.role === 'ai' && msg.name === activeCharName);

            const filteredContent = msg.content.replace(WhisperManager.REGEX, (match, toAttr, whisperText) => {
                const recipients = WhisperManager.parseRecipients(toAttr);

                if (isAuthor) {
                    return `[whisper to="${toAttr || ''}"]${whisperText}[/whisper]`;
                }

                const isAddressed = WhisperManager.isRecipient(activeCharName, recipients, appState) ||
                                    WhisperManager.isRecipient(recipientCharId, recipients, appState);

                if (isAddressed) {
                    return `*(тихо шепчет вам на ухо): "${whisperText.trim()}"*`;
                } else {
                    const targetNames = WhisperManager.formatRecipientsReadable(recipients);
                    // Адаптивное, нейтральное и реалистичное повествование для сторонних персонажей
                    return `*(придвинувшись ближе, тихо шепчет что-то на ухо ${targetNames}, так что остальным слов не расслышать)*`;
                }
            });

            return {
                ...msg,
                content: filteredContent
            };
        });
    }

    /**
     * Безопасный рендеринг сообщения с изоляцией блоков шёпота от Markdown-парсера и порчи HTML-кавычек.
     */
    static renderMessageContent(rawContent, msg, appState, msgIndex) {
        if (!rawContent || !rawContent.includes('[whisper')) {
            const processed = rawContent.replace(/\*(.*?)\*/g, '\n\n*$1*\n\n');
            let mdHtml = marked.parse(processed);
            return WhisperManager.applyQuoteHighlight(mdHtml);
        }

        const userName = (appState?.userProfile?.name || 'User').trim();
        const isUserAuthor = (msg.role === 'user' && msg.name === userName) || (!msg.charId && msg.role === 'user');

        const whisperBlocks = [];
        let whisperBlockIndex = 0;

        // 1. Извлекаем блоки шёпота и заменяем их защищенными маркерами
        const tokenizedContent = rawContent.replace(WhisperManager.REGEX, (match, toAttr, whisperText) => {
            const currentBlockId = `whisper_${msgIndex}_${whisperBlockIndex++}`;
            const recipients = WhisperManager.parseRecipients(toAttr);
            const isUserRecipient = WhisperManager.isRecipient(userName, recipients, appState) ||
                                    WhisperManager.isRecipient('user', recipients, appState);

            const displayNames = WhisperManager.formatRecipientsReadable(recipients);
            let blockHTML = '';

            if (isUserAuthor || isUserRecipient) {
                const badgeLabel = isUserAuthor ? `Шёпот для: ${displayNames}` : `Шёпот вам от ${msg.name}`;
                blockHTML = `
                    <div class="whisper-block addressed">
                        <div class="whisper-header">
                            <span class="whisper-badge">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                                    <circle cx="9" cy="10" r="1"></circle>
                                    <circle cx="12" cy="10" r="1"></circle>
                                    <circle cx="15" cy="10" r="1"></circle>
                                </svg>
                                <span>${escapeHtml(badgeLabel)}</span>
                            </span>
                        </div>
                        <div class="whisper-text">«${escapeHtml(whisperText.trim())}»</div>
                    </div>
                `;
            } else {
                // Пользователь не был адресатом: отображаем жест и интерактивную кнопку "Подслушать"
                blockHTML = `
                    <div class="whisper-block secret" id="${currentBlockId}">
                        <div class="whisper-header">
                            <span class="whisper-badge secret-badge">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                                </svg>
                                <span>Шёпот для: ${escapeHtml(displayNames)}</span>
                            </span>
                            <button type="button" class="whisper-toggle-btn" onclick="WhisperManager.toggleReveal('${currentBlockId}')" title="Подслушать шёпот">
                                <svg class="whisper-icon-eye" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                                    <circle cx="12" cy="12" r="3"/>
                                </svg>
                                <span class="whisper-btn-text">Подслушать</span>
                            </button>
                        </div>
                        <div class="whisper-hint-narrative">
                            *${escapeHtml(msg.name)} что-то тихо говорит на ухо ${escapeHtml(displayNames)}, так что остальным слов не разобрать*
                        </div>
                        <div class="whisper-revealed-text" style="display: none;">
                            <div class="whisper-revealed-label">Подслушанный секрет:</div>
                            «${escapeHtml(whisperText.trim())}»
                        </div>
                    </div>
                `;
            }

            const slotIndex = whisperBlocks.length;
            whisperBlocks.push(blockHTML);
            return `\n\n%%WHISPER_SLOT_${slotIndex}%%\n\n`;
        });

        // 2. Обрабатываем отыгрыш звездочек и компилируем обычный текст через marked
        const processed = tokenizedContent.replace(/\*(.*?)\*/g, '\n\n*$1*\n\n');
        let mdHtml = marked.parse(processed);

        // 3. Безопасно подсвечиваем кавычки (до вставки готовых HTML-блоков, чтобы не испортить атрибуты)
        mdHtml = WhisperManager.applyQuoteHighlight(mdHtml);

        // 4. Возвращаем блоки шёпота в неповрежденном виде
        whisperBlocks.forEach((html, i) => {
            const token = new RegExp(`<p>%%WHISPER_SLOT_${i}%%<\\/p>|%%WHISPER_SLOT_${i}%%`, 'g');
            mdHtml = mdHtml.replace(token, html);
        });

        return mdHtml;
    }

    /**
     * Безопасная подсветка кавычек в тексте без повреждения HTML-тегов.
     */
    static applyQuoteHighlight(html) {
        if (!html) return '';
        return html
            .replace(/«([^»\n<>\/]+)»/g, '<strong class="quote-highlight">«$1»</strong>')
            .replace(/“([^”\n<>\/]+)”/g, '<strong class="quote-highlight">“$1”</strong>')
            .replace(/(^|[\s>(])"([^"\n<>\/]+)"(?=[\s<).,!?:;]|$)/g, '$1<strong class="quote-highlight">"$2"</strong>');
    }

    /**
     * Интерактивное скрытие/раскрытие чужого шёпота по кнопке «Подслушать / Скрыть».
     */
    static toggleReveal(blockId) {
        const block = document.getElementById(blockId);
        if (!block) return;
        const revealed = block.querySelector('.whisper-revealed-text');
        const btnText = block.querySelector('.whisper-btn-text');
        if (!revealed) return;

        const isHidden = revealed.style.display === 'none';
        revealed.style.display = isHidden ? 'block' : 'none';
        block.classList.toggle('revealed', isHidden);

        if (btnText) {
            btnText.innerText = isHidden ? 'Скрыть' : 'Подслушать';
        }

        if (window.sound) window.sound.playBubble();
    }

    /**
     * Открытие компоновщика шёпота с привязкой к активному полю ввода (чат или окно редактирования).
     */
    static openComposer(targetInputId = 'chat-input') {
        WhisperManager.activeTargetInputId = targetInputId;
        const targetEl = document.getElementById(targetInputId);

        let prefilledText = '';
        if (targetEl) {
            WhisperManager.savedSelection = {
                start: typeof targetEl.selectionStart === 'number' ? targetEl.selectionStart : targetEl.value.length,
                end: typeof targetEl.selectionEnd === 'number' ? targetEl.selectionEnd : targetEl.value.length
            };
            if (WhisperManager.savedSelection.start !== WhisperManager.savedSelection.end) {
                prefilledText = targetEl.value.substring(WhisperManager.savedSelection.start, WhisperManager.savedSelection.end).trim();
            }
        }

        const popover = document.getElementById('whisper-inline-popover');
        if (!popover) return;

        const whisperInput = document.getElementById('whisper-message-input');
        if (whisperInput) {
            whisperInput.value = prefilledText;
        }

        const participants = WhisperManager.getChatParticipants();
        const activeSenderName = (window.activeSender?.name || '').trim().toLowerCase();
        const availableRecipients = participants.filter(p => p.name.trim().toLowerCase() !== activeSenderName);

        if (availableRecipients.length === 0) {
            if (window.showToast) window.showToast("В этой сцене нет других собеседников для шёпота!", true);
            return;
        }

        // Если адресаты еще не выбраны — выбираем первого по умолчанию
        if (WhisperManager.selectedRecipientNames.length === 0 || !availableRecipients.some(p => WhisperManager.selectedRecipientNames.includes(p.name))) {
            WhisperManager.selectedRecipientNames = [availableRecipients[0].name];
        }

        WhisperManager.renderDropdown(availableRecipients);
        WhisperManager.updateDropdownSummary();

        // Гарантируем закрытое состояние списка при открытии панели
        WhisperManager.closeDropdownMenu();

        popover.classList.add('active');
        if (whisperInput) {
            setTimeout(() => whisperInput.focus(), 60);
        }

        if (window.sound) window.sound.playChime();
    }

    static closeComposer() {
        const popover = document.getElementById('whisper-inline-popover');
        if (popover) popover.classList.remove('active');
        WhisperManager.closeDropdownMenu();
    }

    static toggleDropdownMenu(e) {
        if (e) e.stopPropagation();
        const menu = document.getElementById('whisper-dropdown-menu');
        const arrow = document.getElementById('whisper-dropdown-arrow');
        if (!menu) return;

        const isOpen = menu.classList.toggle('active');
        if (arrow) arrow.style.transform = isOpen ? 'rotate(180deg)' : 'rotate(0deg)';
    }

    static closeDropdownMenu() {
        const menu = document.getElementById('whisper-dropdown-menu');
        const arrow = document.getElementById('whisper-dropdown-arrow');
        if (menu) menu.classList.remove('active');
        if (arrow) arrow.style.transform = 'rotate(0deg)';
    }

    /**
     * Отрисовка списка адресатов с простым мульти-выбором (клик переключает чекбокс).
     */
    static renderDropdown(participants) {
        const menu = document.getElementById('whisper-dropdown-menu');
        if (!menu) return;
        menu.innerHTML = '';

        participants.forEach(p => {
            const isSelected = WhisperManager.selectedRecipientNames.includes(p.name);
            const item = document.createElement('div');
            item.className = `whisper-dropdown-item ${isSelected ? 'active' : ''}`;
            item.innerHTML = `
                <div class="whisper-checkbox-square ${isSelected ? 'checked' : ''}">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                </div>
                <img src="${p.avatar || 'https://via.placeholder.com/28/1e2028/FFFFFF?text=AI'}" class="whisper-item-avatar">
                <span class="whisper-item-name">${escapeHtml(p.name)}</span>
            `;

            // Обычный клик переключает участие персонажа в списке слушателей шёпота
            item.onclick = (e) => {
                e.stopPropagation();
                if (WhisperManager.selectedRecipientNames.includes(p.name)) {
                    if (WhisperManager.selectedRecipientNames.length > 1) {
                        WhisperManager.selectedRecipientNames = WhisperManager.selectedRecipientNames.filter(n => n !== p.name);
                    } else {
                        if (window.showToast) window.showToast("Шёпот должен быть адресован хотя бы одному персонажу!", true);
                        return;
                    }
                } else {
                    WhisperManager.selectedRecipientNames.push(p.name);
                }

                WhisperManager.renderDropdown(participants);
                WhisperManager.updateDropdownSummary();
                if (window.sound) window.sound.playBubble();
            };

            menu.appendChild(item);
        });
    }

    static updateDropdownSummary() {
        const summary = document.getElementById('whisper-dropdown-summary');
        if (!summary) return;

        const count = WhisperManager.selectedRecipientNames.length;
        if (count === 0) {
            summary.innerHTML = `<span style="color: var(--text-muted);">Кому: выберите адресата...</span>`;
        } else if (count === 1) {
            summary.innerHTML = `<span style="color: var(--text-muted); font-size: 11px;">Кому:</span> <strong style="color: #00e5ff;">${escapeHtml(WhisperManager.selectedRecipientNames[0])}</strong>`;
        } else {
            const first = WhisperManager.selectedRecipientNames[0];
            const othersCount = count - 1;
            summary.innerHTML = `<span style="color: var(--text-muted); font-size: 11px;">Кому:</span> <strong style="color: #00e5ff;">${escapeHtml(first)}</strong> <span style="font-size: 11px; background: rgba(0,229,255,0.15); color:#00e5ff; padding: 2px 6px; border-radius: 6px; font-weight:700;">+${othersCount}</span>`;
        }
    }

    /**
     * Вставка сформированного шёпота в фокус текстового поля.
     */
    static insertWhisperAtCaret() {
        const targetInputId = WhisperManager.activeTargetInputId || 'chat-input';
        const targetEl = document.getElementById(targetInputId);
        if (!targetEl) return;

        if (WhisperManager.selectedRecipientNames.length === 0) {
            if (window.showToast) window.showToast("Выберите адресата шёпота!", true);
            return;
        }

        const whisperInput = document.getElementById('whisper-message-input');
        const customText = (whisperInput?.value || '').trim();
        const whisperBody = customText.length > 0 ? customText : 'текст шёпота';

        const recipientStr = WhisperManager.selectedRecipientNames.join(', ');
        const val = targetEl.value || '';
        const start = WhisperManager.savedSelection.start;
        const end = WhisperManager.savedSelection.end;

        const before = val.substring(0, start);
        const after = val.substring(end);

        // Аккуратные отступы вокруг шёпота
        const needSpaceBefore = before.length > 0 && !before.endsWith(' ') && !before.endsWith('\n');
        const needSpaceAfter = after.length > 0 && !after.startsWith(' ') && !after.startsWith('\n');

        const spacerPrefix = needSpaceBefore ? ' ' : '';
        const spacerSuffix = needSpaceAfter ? ' ' : '';

        const whisperTag = `${spacerPrefix}[whisper to="${recipientStr}"]${whisperBody}[/whisper]${spacerSuffix}`;

        targetEl.value = before + whisperTag + after;

        WhisperManager.closeComposer();
        targetEl.focus();

        const selectionNewStart = before.length + spacerPrefix.length + `[whisper to="${recipientStr}"]`.length;
        const selectionNewEnd = selectionNewStart + whisperBody.length;

        if (typeof targetEl.setSelectionRange === 'function') {
            targetEl.setSelectionRange(selectionNewStart, selectionNewEnd);
        }

        if (targetInputId === 'chat-input' && typeof window.autoResizeTextarea === 'function') {
            window.autoResizeTextarea(targetEl);
        }

        if (window.sound) window.sound.playChime();
    }
}

window.WhisperManager = WhisperManager;