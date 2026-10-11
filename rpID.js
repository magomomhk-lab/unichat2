/**
 * Roleplay Character ID & Cloning Controller (Pure Vanilla JS)
 * Управляет генерацией уникальных ID, валидацией чистоты формы и клонированием персонажей.
 */
class CharacterIDManager {
    /**
     * Генерация уникального человекочитаемого ID (например: CHAR-7K2M-9P4X)
     */
    static generateID() {
        const part1 = Math.random().toString(36).substring(2, 6).toUpperCase();
        const part2 = Date.now().toString(36).slice(-4).toUpperCase();
        return `CHAR-${part1}-${part2}`;
    }

    /**
     * Проверка: является ли форма создания персонажа ПОЛНОСТЬЮ пустой
     */
    static isFormCompletelyEmpty() {
        const name = document.getElementById('char-name')?.value.trim() || '';
        const desc = document.getElementById('char-desc')?.value.trim() || '';
        const rel = document.getElementById('char-relationship')?.value.trim() || '';
        const tone = document.getElementById('char-tone')?.value.trim() || '';
        const scenario = document.getElementById('char-scenario')?.value.trim() || '';
        const greeting = document.getElementById('char-greeting')?.value.trim() || '';
        const protocol = document.getElementById('char-protocol')?.value.trim() || '';

        // Проверка аватара
        const avatarImg = document.getElementById('avatar-img');
        const hasAvatar = avatarImg && avatarImg.style.display !== 'none' && avatarImg.src && avatarImg.src.length > 50;

        // Проверка содержимого всех созданных блоков памяти
        let hasMemoryText = false;
        const memoryContents = document.querySelectorAll('#memory-container .mem-content');
        memoryContents.forEach(textarea => {
            if (textarea.value.trim().length > 0) {
                hasMemoryText = true;
            }
        });

        // Если хотя бы одно поле заполнено или есть аватар — форма НЕ пустая
        return !name && !desc && !rel && !tone && !scenario && !greeting && !protocol && !hasAvatar && !hasMemoryText;
    }

    /**
     * Инициализация интерфейса блока ID при открытии редактора/создания
     */
    static initCreatorUI(existingCharId = null) {
        const displayWrap = document.getElementById('char-id-display-wrap');
        const importWrap = document.getElementById('char-id-import-wrap');
        const idLabel = document.getElementById('char-id-label');
        const displayInput = document.getElementById('char-display-id');
        const importInput = document.getElementById('char-import-id-input');
        const hiddenId = document.getElementById('char-id');

        if (!displayWrap || !importWrap) return;

        if (existingCharId) {
            // Режим редактирования существующего персонажа: показываем его ID для копирования
            displayWrap.style.display = 'flex';
            importWrap.style.display = 'none';
            if (idLabel) idLabel.innerText = 'ID персонажа (для копирования)';
            if (displayInput) displayInput.value = existingCharId;
        } else {
            // Режим создания нового персонажа: генерируем новый уникальный ID и показываем поле для импорта
            const newGeneratedId = this.generateID();
            if (hiddenId) hiddenId.value = newGeneratedId;

            displayWrap.style.display = 'none';
            importWrap.style.display = 'flex';
            if (idLabel) idLabel.innerText = 'Клонирование персонажа по ID';
            if (importInput) importInput.value = '';
        }
    }

    /**
     * Копирование ID текущего персонажа в буфер обмена
     */
    static copyCurrentID() {
        const displayInput = document.getElementById('char-display-id');
        if (!displayInput || !displayInput.value) return;

        const idText = displayInput.value;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(idText).then(() => {
                if (typeof showToast === 'function') {
                    showToast(`ID скопирован: ${idText}`);
                }
                if (window.sound && typeof window.sound.playBubble === 'function') {
                    window.sound.playBubble();
                }
            }).catch(() => {
                this.fallbackCopy(idText);
            });
        } else {
            this.fallbackCopy(idText);
        }
    }

    static fallbackCopy(text) {
        const temp = document.createElement('textarea');
        temp.value = text;
        document.body.appendChild(temp);
        temp.select();
        document.execCommand('copy');
        document.body.removeChild(temp);
        if (typeof showToast === 'function') {
            showToast(`ID скопирован: ${text}`);
        }
    }

    /**
     * Клонирование данных персонажа по введенному ID
     */
    static cloneFromInput() {
        const importInput = document.getElementById('char-import-id-input');
        if (!importInput) return;

        const targetId = importInput.value.trim();
        if (!targetId) {
            if (typeof showToast === 'function') {
                showToast('Введите ID персонажа для клонирования!', true);
            }
            return;
        }

        // Строгая защита от перезаписи: клонирование разрешено ТОЛЬКО если форма абсолютно пуста
        if (!this.isFormCompletelyEmpty()) {
            if (typeof showToast === 'function') {
                showToast('Форма должна быть полностью пустой для импорта по ID!', true);
            }
            return;
        }

        // Поиск персонажа в локальной базе приложения (безопасный доступ к глобальному состоянию)
        const state = window.appState || (typeof appState !== 'undefined' ? appState : null);
        if (!state || !Array.isArray(state.characters)) {
            if (typeof showToast === 'function') {
                showToast('Ошибка базы данных персонажей.', true);
            }
            return;
        }

        // Поиск без учета регистра и с очисткой пробелов
        const normalizedTarget = targetId.toUpperCase();
        const sourceChar = state.characters.find(c =>
            c && c.id && (
                c.id.toUpperCase() === normalizedTarget ||
                String(c.id).trim() === targetId
            )
        );

        if (!sourceChar) {
            if (typeof showToast === 'function') {
                showToast(`Персонаж с ID "${targetId}" не найден!`, true);
            }
            return;
        }

        // Перенос всех заявленных атрибутов
        document.getElementById('char-name').value = sourceChar.name || '';
        document.getElementById('char-gender').value = sourceChar.gender || 'female';
        document.getElementById('char-desc').value = sourceChar.description || '';
        document.getElementById('char-relationship').value = sourceChar.relationship || '';
        document.getElementById('char-tone').value = sourceChar.tone || '';
        document.getElementById('char-scenario').value = sourceChar.scenario || '';
        document.getElementById('char-greeting').value = sourceChar.greeting || '';
        document.getElementById('char-protocol').value = sourceChar.protocol || '';

        const protocolVisEl = document.getElementById('char-protocol-visibility');
        if (protocolVisEl) {
            protocolVisEl.value = sourceChar.protocolVisibility || 'private';
        }

        // Перенос аватара
        const avatarImg = document.getElementById('avatar-img');
        const avatarIcon = document.getElementById('avatar-icon');
        if (sourceChar.avatar) {
            if (avatarImg) {
                avatarImg.src = sourceChar.avatar;
                avatarImg.style.display = 'block';
            }
            if (avatarIcon) avatarIcon.style.display = 'none';
        } else {
            if (avatarImg) avatarImg.style.display = 'none';
            if (avatarIcon) avatarIcon.style.display = 'block';
        }

        // Полное глубокое клонирование блоков памяти с генерацией независимых внутренних ключей
        const memContainer = document.getElementById('memory-container');
        if (memContainer) memContainer.innerHTML = '';
        if (Array.isArray(window.currentMemoryBoxes)) {
            window.currentMemoryBoxes.length = 0;
        }

        if (Array.isArray(sourceChar.memoryBoxes) && sourceChar.memoryBoxes.length > 0) {
            sourceChar.memoryBoxes.forEach(box => {
                if (typeof box === 'string') {
                    if (typeof addMemoryBox === 'function') {
                        addMemoryBox('', box, 'public', []);
                    }
                } else if (box && typeof box === 'object') {
                    if (typeof addMemoryBox === 'function') {
                        addMemoryBox(
                            box.title || '',
                            box.content || '',
                            box.visibility || 'public',
                            [],
                            'mem_' + Date.now() + Math.floor(Math.random() * 10000)
                        );
                    }
                }
            });
        }

        // Присвоение НОВОГО независимого уникального ID клонированному персонажу
        const newCloneId = this.generateID();
        document.getElementById('char-id').value = newCloneId;

        // Очищаем строку ввода ID
        importInput.value = '';

        if (typeof showToast === 'function') {
            showToast(`Данные персонажа «${sourceChar.name}» успешно скопированы! Присвоен новый ID.`);
        }
        if (window.sound && typeof window.sound.playChime === 'function') {
            window.sound.playChime();
        }
    }
}

window.CharacterIDManager = CharacterIDManager;