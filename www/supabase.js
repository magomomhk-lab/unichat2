/**
 * MoonSSS — Supabase Client & Community Room Controller
 * Pure Vanilla ES6+, In-App Authentication, Zero LocalStorage
 */

class SupabaseCommunityController {
  constructor() {
    this.supabaseUrl = 'https://wciqrfxsittcaxlewpwu.supabase.co';
    this.supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjaXFyZnhzaXR0Y2F4bGV3cHd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0NzY2NzYsImV4cCI6MjA5MTA1MjY3Nn0.l0P2YR8QUIsvUFZ6aZDBNuDywYjwS_bOuYLXhULuYNA';
    this.activeTab = 'images';
    this.activeAuthTab = 'signin';
    this.cachedImages = [];
    this.cachedChats = [];
    this.cachedStyles = [];
    this._publishImageTarget = null;
    this._publishStyleTarget = null;
  }

  async _headers(authRequired = false) {
    const headers = {
      'apikey': this.supabaseKey,
      'Content-Type': 'application/json'
    };
    if (window.authController) {
      const token = await window.authController.getValidToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      } else if (authRequired) {
        throw new Error('Требуется авторизация в аккаунте');
      }
    }
    return headers;
  }

  // --- API: ЗАГРУЗКА ДАННЫХ ---

  async getCommunityImages(search = '') {
    let url = `${this.supabaseUrl}/rest/v1/community_images?select=*&order=created_at.desc`;
    if (search && search.trim()) {
      url += `&title=ilike.*${encodeURIComponent(search.trim())}*`;
    }
    const res = await fetch(url, { headers: await this._headers() });
    if (!res.ok) throw new Error('Не удалось загрузить изображения сообщества');
    this.cachedImages = await res.json();
    return this.cachedImages;
  }

  async getCommunityChats(search = '') {
    let url = `${this.supabaseUrl}/rest/v1/community_chats?select=*&order=created_at.desc`;
    if (search && search.trim()) {
      url += `&title=ilike.*${encodeURIComponent(search.trim())}*`;
    }
    const res = await fetch(url, { headers: await this._headers() });
    if (!res.ok) throw new Error('Не удалось загрузить чаты сообщества');
    this.cachedChats = await res.json();
    return this.cachedChats;
  }

  async getCommunityStyles(search = '') {
    let url = `${this.supabaseUrl}/rest/v1/community_styles?select=*&order=created_at.desc`;
    if (search && search.trim()) {
      url += `&title=ilike.*${encodeURIComponent(search.trim())}*`;
    }
    const res = await fetch(url, { headers: await this._headers() });
    if (!res.ok) throw new Error('Не удалось загрузить стили сообщества');
    this.cachedStyles = await res.json();
    return this.cachedStyles;
  }

  async publishStyle({ title, description, themeData }) {
    const user = await window.authController.getCurrentUser();
    if (!user) {
      this.openAuthModal('signin');
      throw new Error('Войдите в аккаунт для публикации');
    }

    const meta = user.user_metadata || {};
    const displayName = meta.full_name || (meta.username ? `@${meta.username}` : user.email?.split('@')[0] || 'Создатель MoonSSS');

    const payload = {
      user_id: user.id,
      user_name: displayName,
      avatar_url: meta.avatar_url || null,
      title: title.trim(),
      description: description ? description.trim() : '',
      theme_data: themeData
    };

    const res = await fetch(`${this.supabaseUrl}/rest/v1/community_styles`, {
      method: 'POST',
      headers: {
        ...(await this._headers(true)),
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Ошибка сохранения стиля в БД Supabase');
    }

    return await res.json();
  }

  async deleteCommunityStyle(id, itemUserId) {
    const user = await window.authController.getCurrentUser();
    if (!user || user.id !== itemUserId) {
      throw new Error('Вы можете удалять только свои собственные публикации стилей');
    }

    const token = await window.authController.getValidToken();
    if (!token) throw new Error('Требуется авторизация');

    const delRes = await fetch(`${this.supabaseUrl}/rest/v1/community_styles?id=eq.${id}&user_id=eq.${user.id}`, {
      method: 'DELETE',
      headers: {
        'apikey': this.supabaseKey,
        'Authorization': `Bearer ${token}`
      }
    });

    if (!delRes.ok) {
      const err = await delRes.json().catch(() => ({}));
      throw new Error(err.message || 'Ошибка удаления стиля из БД');
    }

    return true;
  }

  // --- API: ПУБЛИКАЦИЯ ИЗОБРАЖЕНИЯ И ЗАЩИТА ОТ ДУБЛИКАТОВ ---

  _dataUrlToBlob(dataUrl) {
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
      console.warn('[Supabase] DataURL to Blob decoding error:', e);
      return null;
    }
  }

  async _computeImageHash(blobOrDataUrl) {
    try {
      let arrayBuffer;
      if (typeof blobOrDataUrl === 'string' && blobOrDataUrl.startsWith('data:')) {
        const commaIdx = blobOrDataUrl.indexOf(',');
        const base64 = commaIdx !== -1 ? blobOrDataUrl.slice(commaIdx + 1) : blobOrDataUrl;
        const binaryStr = atob(base64.replace(/\s+/g, ''));
        const len = binaryStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        arrayBuffer = bytes.buffer;
      } else if (blobOrDataUrl instanceof Blob) {
        arrayBuffer = await blobOrDataUrl.arrayBuffer();
      } else if (typeof blobOrDataUrl === 'string' && /^https?:\/\//i.test(blobOrDataUrl)) {
        const resp = await fetch(blobOrDataUrl);
        const blob = await resp.blob();
        arrayBuffer = await blob.arrayBuffer();
      } else {
        throw new Error('Некорректный формат данных изображения');
      }

      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      console.warn('[Supabase] Hash calculation fallback:', e);
      if (typeof blobOrDataUrl === 'string') {
        let h = 0;
        for (let i = 0; i < blobOrDataUrl.length; i++) {
          h = ((h << 5) - h + blobOrDataUrl.charCodeAt(i)) | 0;
        }
        return 'hash_' + Math.abs(h).toString(16) + '_' + blobOrDataUrl.length;
      }
      return 'hash_' + Date.now().toString(36);
    }
  }

  async uploadImageToStorage(blobOrDataUrl, fileName) {
    let blob;
    if (typeof blobOrDataUrl === 'string' && blobOrDataUrl.startsWith('data:')) {
      blob = this._dataUrlToBlob(blobOrDataUrl);
      if (!blob) {
        throw new Error('Не удалось декодировать данные изображения');
      }
    } else {
      blob = blobOrDataUrl;
    }

    const mime = blob.type || 'image/png';
    const ext = mime.includes('webp') ? 'webp' : mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : 'png';
    const filePath = `public/${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${ext}`;
    const token = await window.authController.getValidToken();

    if (!token) {
      throw new Error('Требуется авторизация в аккаунте для публикации файлов');
    }

    const uploadRes = await fetch(`${this.supabaseUrl}/storage/v1/object/community-images/${filePath}`, {
      method: 'POST',
      headers: {
        'apikey': this.supabaseKey,
        'Authorization': `Bearer ${token}`,
        'Content-Type': mime
      },
      body: blob
    });

    if (!uploadRes.ok) {
      let errMsg = 'Ошибка загрузки файла в хранилище Supabase Storage';
      try {
        const errJson = await uploadRes.json();
        errMsg = errJson.message || errJson.error || errMsg;
      } catch (_) {}
      throw new Error(errMsg);
    }

    const publicUrl = `${this.supabaseUrl}/storage/v1/object/public/community-images/${filePath}`;
    return { publicUrl, filePath };
  }

  async publishImage({ title, description, prompt, hidePrompt, allowDownload, modelName, imageData }) {
    const user = await window.authController.getCurrentUser();
    if (!user) {
      this.openAuthModal('signin');
      throw new Error('Войдите в аккаунт для публикации');
    }

    // 1. Вычисляем криптографический отпечаток содержимого изображения (SHA-256)
    const imageHash = await this._computeImageHash(imageData);

    // 2. Предварительная проверка наличия такого отпечатка в БД (экономим трафик и место в Storage)
    try {
      const checkRes = await fetch(`${this.supabaseUrl}/rest/v1/community_images?image_hash=eq.${imageHash}&select=id,title`, {
        headers: await this._headers()
      });
      if (checkRes.ok) {
        const existing = await checkRes.json();
        if (Array.isArray(existing) && existing.length > 0) {
          throw new Error(`Это изображение уже опубликовано в Community Room («${existing[0].title || 'Без названия'}»)`);
        }
      }
    } catch (checkErr) {
      if (checkErr.message && checkErr.message.includes('уже опубликовано')) {
        throw checkErr;
      }
    }

    // 3. Загрузка файла в Storage только после подтверждения уникальности
    const { publicUrl, filePath } = await this.uploadImageToStorage(imageData, title);
    const meta = user.user_metadata || {};
    const displayName = meta.full_name || (meta.username ? `@${meta.username}` : user.email?.split('@')[0] || 'Создатель MoonSSS');

    const payload = {
      user_id: user.id,
      user_name: displayName,
      avatar_url: meta.avatar_url || null,
      title: title.trim(),
      description: description ? description.trim() : '',
      prompt: hidePrompt ? null : (prompt || ''),
      hide_prompt: !!hidePrompt,
      allow_download: allowDownload !== false,
      model_name: modelName || 'Riverflow 2.5 Pro',
      image_url: publicUrl,
      storage_path: filePath,
      image_hash: imageHash
    };

    const res = await fetch(`${this.supabaseUrl}/rest/v1/community_images`, {
      method: 'POST',
      headers: {
        ...(await this._headers(true)),
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 409 || (err.message && (err.message.includes('unique') || err.message.includes('duplicate')))) {
        throw new Error('Это изображение уже опубликовано в Community Room');
      }
      throw new Error(err.message || 'Ошибка сохранения записи в БД Supabase');
    }

    return await res.json();
  }

// --- API: РЕДАКТИРОВАНИЕ ПУБЛИКАЦИИ АВТОРОМ ---

  async updateCommunityImage(id, { title, description, prompt, hidePrompt, allowDownload }) {
    const user = await window.authController.getCurrentUser();
    if (!user) throw new Error('Требуется авторизация в аккаунте');

    const token = await window.authController.getValidToken();
    if (!token) throw new Error('Сессия истекла, войдите заново');

    const payload = {
      title: title.trim(),
      description: description ? description.trim() : '',
      prompt: hidePrompt ? null : (prompt || ''),
      hide_prompt: !!hidePrompt,
      allow_download: allowDownload !== false
    };

    const res = await fetch(`${this.supabaseUrl}/rest/v1/community_images?id=eq.${id}&user_id=eq.${user.id}`, {
      method: 'PATCH',
      headers: {
        'apikey': this.supabaseKey,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      let errMsg = 'Ошибка обновления параметров изображения в БД';
      try {
        const errJson = await res.json();
        errMsg = errJson.message || errJson.error || errMsg;
      } catch (_) {}
      throw new Error(errMsg);
    }

    return await res.json();
  }

  // --- API: БЕЗОПАСНОЕ УДАЛЕНИЕ СОБСТВЕННЫХ ПУБЛИКАЦИЙ ---

  async deleteCommunityImage(id, storagePath, itemUserId) {
    const user = await window.authController.getCurrentUser();
    if (!user || user.id !== itemUserId) {
      throw new Error('Вы можете удалять только свои собственные публикации');
    }

    const token = await window.authController.getValidToken();
    if (!token) throw new Error('Требуется авторизация');

    // 1. Удаление записи из таблицы БД Supabase
    const delRes = await fetch(`${this.supabaseUrl}/rest/v1/community_images?id=eq.${id}&user_id=eq.${user.id}`, {
      method: 'DELETE',
      headers: {
        'apikey': this.supabaseKey,
        'Authorization': `Bearer ${token}`
      }
    });

    if (!delRes.ok) {
      const err = await delRes.json().catch(() => ({}));
      throw new Error(err.message || 'Ошибка удаления изображения из БД');
    }

    // 2. Удаление файла из Storage Bucket
    if (storagePath) {
      try {
        await fetch(`${this.supabaseUrl}/storage/v1/object/community-images`, {
          method: 'DELETE',
          headers: {
            'apikey': this.supabaseKey,
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ prefixes: [storagePath] })
        });
      } catch (e) {
        console.warn('[Supabase] Storage file cleanup non-fatal error:', e);
      }
    }

    return true;
  }

  async deleteCommunityChat(id, itemUserId) {
    const user = await window.authController.getCurrentUser();
    if (!user || user.id !== itemUserId) {
      throw new Error('Вы можете удалять только свои собственные диалоги');
    }

    const token = await window.authController.getValidToken();
    if (!token) throw new Error('Требуется авторизация');

    const delRes = await fetch(`${this.supabaseUrl}/rest/v1/community_chats?id=eq.${id}&user_id=eq.${user.id}`, {
      method: 'DELETE',
      headers: {
        'apikey': this.supabaseKey,
        'Authorization': `Bearer ${token}`
      }
    });

    if (!delRes.ok) {
      const err = await delRes.json().catch(() => ({}));
      throw new Error(err.message || 'Ошибка удаления диалога');
    }

    return true;
  }

  // --- UI: УПРАВЛЕНИЕ COMMUNITY ROOM ---

  async openCommunityModal() {
    let modal = document.getElementById('communityModalOverlay');
    if (!modal) {
      this._buildCommunityDOM();
      modal = document.getElementById('communityModalOverlay');
    }
    // Гарантируем завершение чтения сессии из IndexedDB перед отрисовкой плашки
    if (window.authController) {
      await window.authController.getCurrentUser();
    }
    modal.classList.add('show', 'active');
    document.documentElement.dataset.view = 'community';
    this._updateAuthBar();
    this.switchTab(this.activeTab);

    // Добавляем обработчик Esc для Community Room
    this._escHandler = (e) => {
      if (e.key === 'Escape') {
        const subOverlay = document.querySelector('.cr-auth-overlay.show, .cr-publish-overlay.show, .cr-profile-overlay.show, .cr-crop-overlay.show');
        if (!subOverlay) {
          this.closeCommunityModal();
        }
      }
    };
    window.addEventListener('keydown', this._escHandler);
  }

  closeCommunityModal() {
    const modal = document.getElementById('communityModalOverlay');
    if (modal) {
      modal.classList.remove('show', 'active');
      document.documentElement.dataset.view = 'chat';
      const grid = document.getElementById('crFeedGrid');
      if (grid) grid.innerHTML = '';
    }
    if (this._escHandler) {
      window.removeEventListener('keydown', this._escHandler);
      this._escHandler = null;
    }
  }

  switchTab(tab) {
    this.activeTab = tab;
    document.querySelectorAll('.cr-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    const pubStyleBtn = document.getElementById('crPublishStyleBtn');
    if (pubStyleBtn) {
      pubStyleBtn.style.display = tab === 'styles' ? 'inline-flex' : 'none';
    }
    this.refreshFeed();
  }

  async refreshFeed() {
    const grid = document.getElementById('crFeedGrid');
    const search = document.getElementById('crSearchInput')?.value || '';
    if (!grid) return;

    grid.innerHTML = '<div class="cr-loading"><span class="cr-spinner"></span><span>Загрузка артефактов сообщества…</span></div>';

    try {
      if (this.activeTab === 'images') {
        const images = await this.getCommunityImages(search);
        this._renderImagesFeed(images, grid);
      } else if (this.activeTab === 'chats') {
        const chats = await this.getCommunityChats(search);
        this._renderChatsFeed(chats, grid);
      } else if (this.activeTab === 'styles') {
        const styles = await this.getCommunityStyles(search);
        this._renderStylesFeed(styles, grid);
      }
    } catch (e) {
      grid.innerHTML = `<div class="cr-empty"><svg class="ic"><use href="#i-alert"/></svg><span>${e.message}</span></div>`;
    }
  }

  _renderImagesFeed(images, container) {
    if (!images || images.length === 0) {
      container.innerHTML = '<div class="cr-empty"><svg class="ic"><use href="#i-image"/></svg><span>В Community Room пока нет опубликованных изображений. Будьте первыми!</span></div>';
      return;
    }

    const currentUserId = window.authController?.currentUser?.id;
    container.innerHTML = '';
    const gridWrapper = document.createElement('div');
    gridWrapper.className = 'cr-images-grid';

    images.forEach(item => {
      const card = document.createElement('article');
      card.className = 'cr-image-card';
      
      const isOwner = currentUserId && (currentUserId === item.user_id);
      const hasPrompt = !item.hide_prompt && item.prompt;
      const downloadBtnHtml = item.allow_download ? `
        <button class="btn-cr-action cr-btn-download" data-url="${item.image_url}" data-title="${encodeURIComponent(item.title)}" title="Скачать">
          <svg class="ic"><use href="#i-download"/></svg>
        </button>
      ` : '';

      const editBtnHtml = isOwner ? `
        <button class="btn-cr-action cr-btn-edit" title="Редактировать публикацию" data-id="${item.id}">
          <svg class="ic"><use href="#i-pencil"/></svg>
        </button>
      ` : '';

      const deleteBtnHtml = isOwner ? `
        <button class="btn-cr-action danger cr-btn-delete" title="Удалить своё изображение" data-id="${item.id}">
          <svg class="ic"><use href="#i-trash"/></svg>
        </button>
      ` : '';

      const authorAvatarHtml = item.avatar_url
        ? `<img src="${item.avatar_url}" class="cr-author-avatar-img" alt="" onerror="this.outerHTML='<span class=\\'cr-author-avatar-ph\\'>${(item.user_name || 'U')[0].toUpperCase()}</span>'">`
        : `<span class="cr-author-avatar-ph">${(item.user_name || 'U')[0].toUpperCase()}</span>`;

      card.innerHTML = `
        <div class="cr-img-wrap" title="Нажмите для полноэкранного просмотра и зума">
          <img src="${item.image_url}" alt="${item.title}" loading="lazy">
          <div class="cr-img-badge">${item.model_name || 'Riverflow Pro'}</div>
          <div class="cr-img-zoom-hint no-sel"><svg class="ic"><use href="#i-eye"/></svg></div>
        </div>
        <div class="cr-img-meta">
          <h4 class="cr-img-title">${esc(item.title)}</h4>
          ${item.description ? `
            <div class="cr-img-desc-box" role="button" tabindex="0" title="Нажмите для открытия полной информации" aria-label="Открыть полное описание">
              <p class="cr-img-desc">
                <span class="cr-img-desc-text">${esc(item.description)}</span>
              </p>
              <span class="cr-img-desc-expand-hint no-sel"><svg class="ic"><use href="#i-external"/></svg>Описание</span>
            </div>
          ` : ''}
          ${hasPrompt ? `
            <div class="cr-img-prompt-box" role="button" tabindex="0" title="Нажмите для просмотра полного промпта" aria-label="Открыть промпт">
              <div class="cr-img-prompt-header no-sel">
                <span class="cr-prompt-tag"><svg class="ic"><use href="#i-spark"/></svg>Промпт</span>
                <span class="cr-prompt-expand-hint"><svg class="ic"><use href="#i-external"/></svg>Показать</span>
              </div>
              <p class="cr-img-prompt-text">${esc(item.prompt)}</p>
            </div>
          ` : ''}
          <div class="cr-card-footer">
            <div class="cr-author">
              <span class="cr-author-avatar-box">${authorAvatarHtml}</span>
              <span class="cr-author-name-text">${esc(item.user_name || 'Создатель')}</span>
            </div>
            <div class="cr-actions-group">
              <button class="btn-cr-action cr-btn-info" title="Подробная информация и промпт" data-id="${item.id}">
                <svg class="ic"><use href="#i-info"/></svg>
              </button>
              ${hasPrompt ? `
                <button class="btn-cr-action cr-btn-copy-prompt" data-prompt="${encodeURIComponent(item.prompt)}" title="Копировать промпт">
                  <svg class="ic"><use href="#i-copy"/></svg>
                </button>
              ` : ''}
              <button class="btn-cr-action cr-btn-copy-link" data-url="${item.image_url}" title="Копировать ссылку">
                <svg class="ic"><use href="#i-external"/></svg>
              </button>
              ${downloadBtnHtml}
              ${editBtnHtml}
              ${deleteBtnHtml}
            </div>
          </div>
        </div>
      `;

      // Открытие модального окна полной информации и промпта
      const descBox = card.querySelector('.cr-img-desc-box');
      if (descBox) {
        const openDesc = (e) => {
          e.stopPropagation();
          this.openDescriptionModal(item);
        };
        descBox.onclick = openDesc;
        descBox.onkeydown = (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openDesc(e);
          }
        };
      }

      const promptBox = card.querySelector('.cr-img-prompt-box');
      if (promptBox) {
        const openPrompt = (e) => {
          e.stopPropagation();
          this.openDescriptionModal(item);
        };
        promptBox.onclick = openPrompt;
        promptBox.onkeydown = (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openPrompt(e);
          }
        };
      }

      const infoBtn = card.querySelector('.cr-btn-info');
      if (infoBtn) {
        infoBtn.onclick = (e) => {
          e.stopPropagation();
          this.openDescriptionModal(item);
        };
      }

      if (isOwner) {
        const editBtn = card.querySelector('.cr-btn-edit');
        if (editBtn) {
          editBtn.onclick = (e) => {
            e.stopPropagation();
            this.openEditImageModal(item);
          };
        }
      }

      // Полноэкранный просмотр изображения с зумом и перемещением
      card.querySelector('.cr-img-wrap').onclick = () => {
        if (typeof window.openImageViewer === 'function') {
          window.openImageViewer(item.image_url, item.title || 'Изображение Community Room');
        }
      };

      card.querySelector('.cr-btn-copy-link').onclick = (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(item.image_url);
        if (window.toast) window.toast('Ссылка на изображение скопирована', 'ok');
      };

      if (hasPrompt) {
        card.querySelector('.cr-btn-copy-prompt').onclick = (e) => {
          e.stopPropagation();
          navigator.clipboard.writeText(item.prompt);
          if (window.toast) window.toast('Промпт генерации скопирован', 'ok');
        };
      }

      if (item.allow_download) {
        card.querySelector('.cr-btn-download').onclick = (e) => {
          e.stopPropagation();
          const a = document.createElement('a');
          a.href = item.image_url;
          a.download = `${item.title || 'image'}.png`;
          a.target = '_blank';
          document.body.appendChild(a);
          a.click();
          a.remove();
        };
      }

      if (isOwner) {
        card.querySelector('.cr-btn-delete').onclick = async (e) => {
          e.stopPropagation();
          if (!confirm(`Удалить публикацию «${item.title}» из Community Room?`)) return;
          try {
            await this.deleteCommunityImage(item.id, item.storage_path, item.user_id);
            if (window.toast) window.toast('Изображение успешно удалено', 'info');
            this.refreshFeed();
          } catch (err) {
            if (window.toast) window.toast(`Ошибка удаления: ${err.message}`, 'err');
          }
        };
      }

      gridWrapper.appendChild(card);
    });

    container.appendChild(gridWrapper);
  }

  _renderChatsFeed(chats, container) {
    if (!chats || chats.length === 0) {
      container.innerHTML = '<div class="cr-empty"><svg class="ic"><use href="#i-chat"/></svg><span>В Community Room пока нет опубликованных диалогов.</span></div>';
      return;
    }

    const currentUserId = window.authController?.currentUser?.id;
    container.innerHTML = '';
    const gridWrapper = document.createElement('div');
    gridWrapper.className = 'cr-chats-grid';

    chats.forEach(chat => {
      const card = document.createElement('article');
      card.className = 'cr-chat-card';
      const msgCount = Array.isArray(chat.messages) ? chat.messages.length : 0;
      const isOwner = currentUserId && (currentUserId === chat.user_id);

      const deleteBtnHtml = isOwner ? `
        <button class="btn-cr-action danger cr-btn-delete-chat" title="Удалить свой диалог" data-id="${chat.id}">
          <svg class="ic"><use href="#i-trash"/></svg>
        </button>
      ` : '';

      const authorAvatarHtml = chat.avatar_url
        ? `<img src="${chat.avatar_url}" class="cr-author-avatar-img" alt="" onerror="this.outerHTML='<span class=\\'cr-author-avatar-ph\\'>${(chat.user_name || 'U')[0].toUpperCase()}</span>'">`
        : `<span class="cr-author-avatar-ph">${(chat.user_name || 'U')[0].toUpperCase()}</span>`;

      card.innerHTML = `
        <div class="cr-chat-header">
          <div class="cr-chat-badge"><svg class="ic"><use href="#i-chip"/></svg>${chat.model || 'Auto'}</div>
          <span class="cr-chat-count">${msgCount} сообщ.</span>
        </div>
        <h4 class="cr-chat-title">${chat.title}</h4>
        <div class="cr-card-footer">
          <div class="cr-author">
            <span class="cr-author-avatar-box">${authorAvatarHtml}</span>
            <span class="cr-author-name-text">${chat.user_name || 'Исследователь'}</span>
          </div>
          <div class="cr-actions-group">
            <button class="btn btn-ghost btn-sm cr-btn-copy-chat-prompt" title="Скопировать контекст диалога">
              <svg class="ic"><use href="#i-copy"/></svg>Промпт
            </button>
            ${deleteBtnHtml}
          </div>
        </div>
      `;

      card.querySelector('.cr-btn-copy-chat-prompt').onclick = () => {
        const text = (chat.messages || []).map(m => `[${m.role}]: ${m.content}`).join('\n\n');
        navigator.clipboard.writeText(text);
        if (window.toast) window.toast('Контекст диалога скопирован в буфер', 'ok');
      };

      if (isOwner) {
        card.querySelector('.cr-btn-delete-chat').onclick = async () => {
          if (!confirm(`Удалить диалог «${chat.title}» из Community Room?`)) return;
          try {
            await this.deleteCommunityChat(chat.id, chat.user_id);
            if (window.toast) window.toast('Диалог удален', 'info');
            this.refreshFeed();
          } catch (err) {
            if (window.toast) window.toast(`Ошибка удаления: ${err.message}`, 'err');
          }
        };
      }

      gridWrapper.appendChild(card);
    });

    container.appendChild(gridWrapper);
  }

  // --- UI: ВНУТРЕННЕЕ ОКНО АВТОРИЗАЦИИ ПО 6-ЗНАЧНОМУ EMAIL OTP-КОДУ ---

  openAuthModal(tab = 'signin') {
    this._authOtpEmail = '';
    this.activeAuthTab = tab;
    this._stopOtpCountdown();
    let modal = document.getElementById('crAuthModalOverlay');
    if (!modal) {
      this._buildAuthModalDOM();
      modal = document.getElementById('crAuthModalOverlay');
    }
    this._setAuthTab(this.activeAuthTab);
    this._showAuthStep('email');
    const errBox = document.getElementById('crAuthErrorBox');
    if (errBox) errBox.style.display = 'none';
    modal.classList.add('show', 'active');
    setTimeout(() => {
      const emailInput = document.getElementById('crAuthEmail');
      if (emailInput) emailInput.focus();
    }, 120);
  }

  closeAuthModal() {
    this._stopOtpCountdown();
    const modal = document.getElementById('crAuthModalOverlay');
    if (modal) modal.classList.remove('show', 'active');
  }

  _setAuthTab(tab) {
    this.activeAuthTab = tab;
    const isSignUp = tab === 'signup';
    
    document.querySelectorAll('.cr-auth-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.authtab === tab);
    });

    const nameField = document.getElementById('crAuthNameField');
    const submitBtnText = document.getElementById('crAuthSendOtpBtnText');
    const subtitle = document.getElementById('crAuthStepSubtitle');

    if (nameField) nameField.style.display = isSignUp ? 'block' : 'none';
    if (submitBtnText) submitBtnText.textContent = isSignUp ? 'Зарегистрироваться через код' : 'Получить код подтверждения';
    if (subtitle) {
      subtitle.textContent = isSignUp 
        ? 'Создайте аккаунт MoonSSS. Код подтверждения придёт на ваш Email / Gmail.'
        : 'Введите вашу почту. Мы отправим одноразовый код подтверждения для входа.';
    }
  }

  _showAuthStep(step) {
    const stepEmail = document.getElementById('crAuthStepEmail');
    const stepOtp = document.getElementById('crAuthStepOtp');
    const title = document.getElementById('crAuthModalTitle');
    const errBox = document.getElementById('crAuthErrorBox');
    if (errBox) errBox.style.display = 'none';

    if (step === 'otp') {
      if (stepEmail) stepEmail.style.display = 'none';
      if (stepOtp) stepOtp.style.display = 'block';
      if (title) title.textContent = 'Код подтверждения Gmail';
      const otpInp = document.getElementById('crAuthOtpCode');
      if (otpInp) {
        otpInp.value = '';
        setTimeout(() => otpInp.focus(), 120);
      }
    } else {
      if (stepEmail) stepEmail.style.display = 'block';
      if (stepOtp) stepOtp.style.display = 'none';
      if (title) title.textContent = 'Аккаунт MoonSSS';
    }
  }

  _startOtpCountdown(seconds = 60) {
    this._stopOtpCountdown();
    let remaining = seconds;
    const resendBtn = document.getElementById('crAuthResendOtpBtn');
    const resendText = document.getElementById('crAuthResendText');
    if (!resendBtn || !resendText) return;

    resendBtn.disabled = true;
    resendText.textContent = `Отправить повторно (${remaining}с)`;

    this._authOtpTimer = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        this._stopOtpCountdown();
        resendBtn.disabled = false;
        resendText.textContent = 'Отправить код повторно';
      } else {
        resendText.textContent = `Отправить повторно (${remaining}с)`;
      }
    }, 1000);
  }

  _stopOtpCountdown() {
    if (this._authOtpTimer) {
      clearInterval(this._authOtpTimer);
      this._authOtpTimer = null;
    }
  }

  async _handleSendOtp() {
    const email = document.getElementById('crAuthEmail').value.trim();
    const name = document.getElementById('crAuthName').value.trim();
    const errBox = document.getElementById('crAuthErrorBox');
    const sendBtn = document.getElementById('crAuthSendOtpBtn');
    const isSignUp = this.activeAuthTab === 'signup';

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errBox.textContent = 'Введите корректный адрес электронной почты (например, name@gmail.com)';
      errBox.style.display = 'block';
      return;
    }

    if (isSignUp && name && name.length < 2) {
      errBox.textContent = 'Имя или никнейм должно быть не короче 2 символов';
      errBox.style.display = 'block';
      return;
    }

    sendBtn.disabled = true;
    sendBtn.innerHTML = '<span class="cr-spinner"></span> Отправка кода…';
    errBox.style.display = 'none';

    try {
      await window.authController.sendOtp(email, name, isSignUp);
      this._authOtpEmail = email;
      const targetEmailEl = document.getElementById('crOtpTargetEmail');
      if (targetEmailEl) targetEmailEl.textContent = email;

      this._showAuthStep('otp');
      this._startOtpCountdown(60);
      if (window.toast) window.toast('Код отправлен. Проверьте Gmail (включая папку Спам)', 'ok', 4000);
    } catch (e) {
      errBox.textContent = e.message || 'Ошибка отправки кода на почту';
      errBox.style.display = 'block';
    } finally {
      sendBtn.disabled = false;
      sendBtn.innerHTML = `<svg class="ic"><use href="#i-send"/></svg><span id="crAuthSendOtpBtnText">${isSignUp ? 'Зарегистрироваться через код' : 'Получить код подтверждения'}</span>`;
    }
  }

  async _handleVerifyOtp() {
    const otpCode = document.getElementById('crAuthOtpCode').value.trim();
    const errBox = document.getElementById('crAuthErrorBox');
    const verifyBtn = document.getElementById('crAuthVerifyOtpBtn');

    if (!otpCode || otpCode.length < 6) {
      errBox.textContent = 'Введите полный код подтверждения из письма';
      errBox.style.display = 'block';
      return;
    }

    verifyBtn.disabled = true;
    verifyBtn.innerHTML = '<span class="cr-spinner"></span> Проверка кода…';
    errBox.style.display = 'none';

    try {
      await window.authController.verifyOtp(this._authOtpEmail, otpCode, this.activeAuthTab);
      if (window.toast) window.toast('Авторизация успешно выполнена!', 'ok', 2500);
      this.closeAuthModal();
      this._updateAuthBar();
      this.refreshFeed();
    } catch (e) {
      errBox.textContent = e.message || 'Неверный или просроченный код';
      errBox.style.display = 'block';
    } finally {
      verifyBtn.disabled = false;
      verifyBtn.innerHTML = '<svg class="ic"><use href="#i-check"/></svg>Подтвердить и войти';
    }
  }

  // --- UI: МОДАЛЬНОЕ ОКНО ПРОСМОТРА ПОЛНОЙ ИНФОРМАЦИИ И ПРОМПТА ---

  openDescriptionModal(item) {
    let modal = document.getElementById('crDescViewerOverlay');
    if (!modal) {
      this._buildDescModalDOM();
      modal = document.getElementById('crDescViewerOverlay');
    }

    document.getElementById('crDescViewerTitle').textContent = item.title || 'Информация о генерации';
    document.getElementById('crDescViewerModel').textContent = item.model_name || 'Riverflow Pro';
    document.getElementById('crDescViewerAuthor').textContent = item.user_name || 'Создатель';
    
    const descTextField = document.getElementById('crDescTextField');
    const descViewerText = document.getElementById('crDescViewerText');
    if (item.description && item.description.trim()) {
      if (descTextField) descTextField.style.display = 'block';
      if (descViewerText) descViewerText.textContent = item.description;
    } else {
      if (descTextField) descTextField.style.display = 'none';
      if (descViewerText) descViewerText.textContent = '';
    }

    const hasPrompt = !item.hide_prompt && item.prompt && item.prompt.trim();
    const promptSec = document.getElementById('crDescPromptSec');
    const promptHiddenSec = document.getElementById('crDescPromptHiddenSec');
    const promptTextEl = document.getElementById('crDescViewerPrompt');
    const copyPromptBtn = document.getElementById('crDescCopyPromptBtn');
    const copyPromptTopBtn = document.getElementById('crDescCopyPromptTopBtn');
    const statusPill = document.getElementById('crDescViewerStatusPill');

    if (hasPrompt) {
      if (promptSec) promptSec.style.display = 'block';
      if (promptHiddenSec) promptHiddenSec.style.display = 'none';
      if (promptTextEl) promptTextEl.textContent = item.prompt;
      if (copyPromptBtn) copyPromptBtn.style.display = 'inline-flex';
      if (statusPill) {
        statusPill.className = 'cr-desc-status-pill ready';
        statusPill.innerHTML = `<svg class="ic"><use href="#i-spark"/></svg><span>Промпт открыт</span>`;
      }

      const doCopyPrompt = () => {
        navigator.clipboard.writeText(item.prompt);
        if (window.toast) window.toast('Промпт генерации скопирован в буфер', 'ok', 1800);
      };

      if (copyPromptBtn) copyPromptBtn.onclick = doCopyPrompt;
      if (copyPromptTopBtn) copyPromptTopBtn.onclick = doCopyPrompt;
    } else {
      if (promptSec) promptSec.style.display = 'none';
      if (promptHiddenSec) promptHiddenSec.style.display = 'flex';
      if (copyPromptBtn) copyPromptBtn.style.display = 'none';
      if (statusPill) {
        statusPill.className = 'cr-desc-status-pill locked';
        statusPill.innerHTML = `<svg class="ic"><use href="#i-lock"/></svg><span>Промпт скрыт</span>`;
      }
    }

    const thumb = document.getElementById('crDescViewerThumb');
    if (thumb) {
      thumb.src = item.image_url;
      thumb.onclick = () => {
        if (typeof window.openImageViewer === 'function') {
          window.openImageViewer(item.image_url, item.title || 'Изображение');
        }
      };
    }

    const copyDescBtn = document.getElementById('crDescCopyTextBtn');
    if (copyDescBtn) {
      if (item.description && item.description.trim()) {
        copyDescBtn.style.display = 'inline-flex';
        copyDescBtn.onclick = () => {
          navigator.clipboard.writeText(item.description);
          if (window.toast) window.toast('Описание скопировано в буфер', 'ok', 1800);
        };
      } else {
        copyDescBtn.style.display = 'none';
      }
    }

    modal.classList.add('show', 'active');
  }

  closeDescriptionModal() {
    const modal = document.getElementById('crDescViewerOverlay');
    if (modal) modal.classList.remove('show', 'active');
  }

  _buildDescModalDOM() {
    const wrap = document.createElement('div');
    wrap.className = 'overlay cr-desc-overlay';
    wrap.id = 'crDescViewerOverlay';

    wrap.innerHTML = `
      <div class="modal cr-desc-modal" role="dialog" aria-modal="true" aria-label="Детальная информация о генерации">
        <div class="modal-head">
          <div class="cr-head-title">
            <svg class="ic" style="color:var(--accent)"><use href="#i-spark"/></svg>
            <h2 id="crDescViewerTitle">Информация о генерации</h2>
          </div>
          <button class="icon-btn" id="crDescCloseBtn" aria-label="Закрыть"><svg class="ic"><use href="#i-x"/></svg></button>
        </div>
        <div class="modal-body cr-desc-modal-body">
          <div class="cr-desc-meta-bar">
            <img id="crDescViewerThumb" class="cr-desc-thumb" alt="" title="Нажмите для полноэкранного просмотра">
            <div class="cr-desc-meta-info">
              <span class="cr-desc-author-pill"><svg class="ic"><use href="#i-chat"/></svg><span id="crDescViewerAuthor">Создатель</span></span>
              <span class="cr-desc-model-pill"><svg class="ic"><use href="#i-chip"/></svg><span id="crDescViewerModel">Riverflow Pro</span></span>
              <span class="cr-desc-status-pill" id="crDescViewerStatusPill"><svg class="ic"><use href="#i-spark"/></svg><span>Промпт открыт</span></span>
            </div>
          </div>
          <div class="field" id="crDescTextField" style="margin-top:6px">
            <div class="field-label-row">
              <label>Описание от автора:</label>
            </div>
            <div class="cr-desc-content-box" id="crDescViewerText"></div>
          </div>
          <div class="field" id="crDescPromptSec" style="margin-top:6px">
            <div class="field-label-row" style="display:flex;align-items:center;justify-content:space-between">
              <label>Промпт генерации (Prompt):</label>
              <button class="btn btn-ghost btn-sm" id="crDescCopyPromptTopBtn" type="button" style="padding:2px 8px;font-size:11px">
                <svg class="ic"><use href="#i-copy"/></svg>Копировать
              </button>
            </div>
            <div class="cr-prompt-content-box" id="crDescViewerPrompt"></div>
          </div>
          <div class="cr-desc-lock-box" id="crDescPromptHiddenSec" style="display:none">
            <svg class="ic"><use href="#i-lock"/></svg>
            <span>Автор решил скрыть оригинальный промпт для этой генерации</span>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="crDescDoneBtn">Закрыть</button>
          <button class="btn btn-ghost" id="crDescCopyTextBtn"><svg class="ic"><use href="#i-copy"/></svg>Скопировать описание</button>
          <button class="btn btn-acc" id="crDescCopyPromptBtn"><svg class="ic"><use href="#i-spark"/></svg>Скопировать промпт</button>
        </div>
      </div>
    `;

    document.body.appendChild(wrap);

    document.getElementById('crDescCloseBtn').onclick = () => this.closeDescriptionModal();
    document.getElementById('crDescDoneBtn').onclick = () => this.closeDescriptionModal();
    wrap.onclick = (e) => { if (e.target === wrap) this.closeDescriptionModal(); };
  }

  // --- UI: МОДАЛЬНОЕ ОКНО РЕДАКТИРОВАНИЯ ПУБЛИКАЦИИ АВТОРОМ ---

  openEditImageModal(item) {
    this._editTargetItem = item;
    let modal = document.getElementById('crEditImageOverlay');
    if (!modal) {
      this._buildEditModalDOM();
      modal = document.getElementById('crEditImageOverlay');
    }

    document.getElementById('crEditImgPreview').src = item.image_url;
    document.getElementById('crEditImgTitle').value = item.title || '';
    document.getElementById('crEditImgModel').value = item.model_name || 'Riverflow 2.5 Pro';
    document.getElementById('crEditImgDesc').value = item.description || '';
    document.getElementById('crEditImgPrompt').value = item.prompt || '';
    document.getElementById('crEditHidePrompt').checked = !!item.hide_prompt;
    document.getElementById('crEditAllowDownload').checked = item.allow_download !== false;

    const promptField = document.getElementById('crEditPromptField');
    if (promptField) {
      promptField.style.display = item.hide_prompt ? 'none' : 'block';
    }

    modal.classList.add('show', 'active');
  }

  closeEditImageModal() {
    const modal = document.getElementById('crEditImageOverlay');
    if (modal) modal.classList.remove('show', 'active');
    this._editTargetItem = null;
  }

  async submitImageEdit() {
    if (!this._editTargetItem) return;
    const title = document.getElementById('crEditImgTitle').value.trim();
    if (!title) {
      if (window.toast) window.toast('Название изображения не может быть пустым', 'warn');
      return;
    }

    const btn = document.getElementById('crEditSubmitBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="cr-spinner"></span> Сохранение…';

    try {
      await this.updateCommunityImage(this._editTargetItem.id, {
        title,
        description: document.getElementById('crEditImgDesc').value,
        prompt: document.getElementById('crEditImgPrompt').value,
        hidePrompt: document.getElementById('crEditHidePrompt').checked,
        allowDownload: document.getElementById('crEditAllowDownload').checked
      });

      if (window.toast) window.toast('Публикация успешно обновлена!', 'ok');
      this.closeEditImageModal();
      this.refreshFeed();
    } catch (e) {
      if (window.toast) window.toast(e.message || 'Ошибка обновления', 'err', 4000);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<svg class="ic"><use href="#i-check"/></svg>Сохранить изменения';
    }
  }

  _buildEditModalDOM() {
    const wrap = document.createElement('div');
    wrap.className = 'overlay cr-edit-overlay';
    wrap.id = 'crEditImageOverlay';

    wrap.innerHTML = `
      <div class="modal cr-publish-modal cr-edit-modal" role="dialog" aria-modal="true" aria-label="Редактирование публикации">
        <div class="modal-head">
          <div class="cr-head-title">
            <svg class="ic" style="color:var(--accent)"><use href="#i-pencil"/></svg>
            <h2>Редактировать публикацию</h2>
          </div>
          <button class="icon-btn" id="crEditCloseBtn" aria-label="Закрыть"><svg class="ic"><use href="#i-x"/></svg></button>
        </div>
        <div class="modal-body">
          <div class="cr-pub-preview-box">
            <img id="crEditImgPreview" alt="Предпросмотр">
          </div>
          <div class="field">
            <label for="crEditImgTitle">Название изображения <span class="req">*</span></label>
            <input type="text" id="crEditImgTitle" class="ws-input" placeholder="Название работы..." maxlength="80">
          </div>
          <div class="field">
            <label for="crEditImgModel">Генерирующая модель <span class="opt">(Неизменяемый параметр)</span></label>
            <input type="text" id="crEditImgModel" class="ws-input" readonly>
          </div>
          <div class="field">
            <label for="crEditImgDesc">Описание изображения <span class="opt">(По желанию)</span></label>
            <textarea id="crEditImgDesc" class="field-area" style="min-height:70px" placeholder="Детальное описание деталей, композиции, сюжета..." maxlength="500"></textarea>
          </div>
          <div class="field" id="crEditPromptField">
            <label for="crEditImgPrompt">Текст промпта <span class="opt">(Если открыт)</span></label>
            <textarea id="crEditImgPrompt" class="field-area" style="min-height:60px" placeholder="Prompt генерации..." spellcheck="false"></textarea>
          </div>
          <div class="set-card cr-pub-switches">
            <div class="set-row">
              <div>
                <div class="sr-t">Скрыть промпт в Community Room</div>
                <div class="sr-s">Если включено, промпт скрыт от других пользователей</div>
              </div>
              <input type="checkbox" id="crEditHidePrompt" class="cr-checkbox">
            </div>
            <div class="set-row">
              <div>
                <div class="sr-t">Разрешить скачивание изображения</div>
                <div class="sr-s">Пользователи могут скачать файл в оригинальном качестве</div>
              </div>
              <input type="checkbox" id="crEditAllowDownload" class="cr-checkbox">
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="crEditCancelBtn">Отмена</button>
          <button class="btn btn-acc" id="crEditSubmitBtn"><svg class="ic"><use href="#i-check"/></svg>Сохранить изменения</button>
        </div>
      </div>
    `;

    document.body.appendChild(wrap);

    document.getElementById('crEditCloseBtn').onclick = () => this.closeEditImageModal();
    document.getElementById('crEditCancelBtn').onclick = () => this.closeEditImageModal();
    document.getElementById('crEditSubmitBtn').onclick = () => this.submitImageEdit();
    wrap.onclick = (e) => { if (e.target === wrap) this.closeEditImageModal(); };

    const hidePromptCb = document.getElementById('crEditHidePrompt');
    const promptField = document.getElementById('crEditPromptField');
    hidePromptCb.onchange = () => {
      promptField.style.display = hidePromptCb.checked ? 'none' : 'block';
    };
  }

  // --- UI: МОДАЛЬНОЕ ОКНО ПУБЛИКАЦИИ ИЗОБРАЖЕНИЯ ---

  openImagePublishModal(imgObj) {
    const user = window.authController?.currentUser;
    if (!user) {
      if (window.toast) window.toast('Сначала войдите в аккаунт', 'info');
      this.openAuthModal('signin');
      return;
    }

    this._publishImageTarget = imgObj;
    let modal = document.getElementById('crPublishImageOverlay');
    if (!modal) {
      this._buildPublishModalDOM();
      modal = document.getElementById('crPublishImageOverlay');
    }

    document.getElementById('crPubImgPreview').src = imgObj.url || imgObj.data;
    document.getElementById('crPubImgTitle').value = imgObj.title || 'Новая генерация';
    document.getElementById('crPubImgModel').value = imgObj.model || 'Riverflow 2.5 Pro';
    document.getElementById('crPubImgDesc').value = '';
    
    const hidePromptCb = document.getElementById('crPubHidePrompt');
    if (hidePromptCb) hidePromptCb.checked = true;
    
    const allowDownloadCb = document.getElementById('crPubAllowDownload');
    if (allowDownloadCb) allowDownloadCb.checked = true;

    const promptPreviewField = document.getElementById('crPubPromptPreviewField');
    const promptPreviewText = document.getElementById('crPubPromptPreviewText');
    if (promptPreviewField && promptPreviewText) {
      promptPreviewText.textContent = imgObj.prompt || '';
      promptPreviewField.style.display = (hidePromptCb && !hidePromptCb.checked && imgObj.prompt) ? 'block' : 'none';
    }

    modal.classList.add('show', 'active');
  }

  closeImagePublishModal() {
    const modal = document.getElementById('crPublishImageOverlay');
    if (modal) modal.classList.remove('show', 'active');
    this._publishImageTarget = null;
  }

  async submitImagePublish() {
    if (!this._publishImageTarget) return;
    const title = document.getElementById('crPubImgTitle').value.trim();
    if (!title) {
      if (window.toast) window.toast('Введите обязательное название изображения', 'warn');
      return;
    }

    const btn = document.getElementById('crPubSubmitBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="cr-spinner"></span> Публикация…';

    try {
      await this.publishImage({
        title,
        description: document.getElementById('crPubImgDesc').value,
        prompt: this._publishImageTarget.prompt || '',
        hidePrompt: document.getElementById('crPubHidePrompt').checked,
        allowDownload: document.getElementById('crPubAllowDownload').checked,
        modelName: document.getElementById('crPubImgModel').value,
        imageData: this._publishImageTarget.url || this._publishImageTarget.data
      });

      if (window.toast) window.toast('Изображение успешно опубликовано в Community Room!', 'ok');
      this.closeImagePublishModal();
      if (document.getElementById('communityModalOverlay')?.classList.contains('active')) {
        this.refreshFeed();
      }
    } catch (e) {
      if (window.toast) window.toast(e.message || 'Ошибка публикации', 'err', 4000);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<svg class="ic"><use href="#i-send"/></svg>Опубликовать';
    }
  }

  _updateAuthBar() {
    const container = document.getElementById('crAuthContainer');
    if (!container) return;
    const user = window.authController?.currentUser;

    if (user) {
      const meta = user.user_metadata || {};
      const nickname = meta.full_name || user.email?.split('@')[0] || 'Пользователь';
      const username = meta.username ? `@${meta.username}` : user.email;
      const avatarSrc = meta.avatar_url;

      const avatarHtml = avatarSrc
        ? `<img src="${avatarSrc}" class="cr-avatar-img" alt="" onerror="this.outerHTML='<span class=\\'cr-avatar-ph\\'>${nickname[0].toUpperCase()}</span>'">`
        : `<span class="cr-avatar-ph">${nickname[0].toUpperCase()}</span>`;

      container.innerHTML = `
        <div class="cr-auth-profile">
          <button class="cr-avatar-btn" id="crOpenProfileBtn" title="Настроить профиль и аватар" type="button">
            <div class="cr-avatar">${avatarHtml}</div>
            <div class="cr-user-info">
              <span class="cr-user-name">${nickname}</span>
              <span class="cr-user-email">${username}</span>
            </div>
          </button>
          <div style="display:flex;gap:6px;align-items:center">
            <button class="btn btn-ghost btn-sm" id="crEditProfileBtn" title="Настройки профиля" type="button">
              <svg class="ic"><use href="#i-pencil"/></svg><span>Профиль</span>
            </button>
            <button class="btn btn-ghost btn-sm" id="crSignOutBtn" title="Выйти из аккаунта" type="button">
              <svg class="ic"><use href="#i-x"/></svg><span>Выйти</span>
            </button>
          </div>
        </div>
      `;
      document.getElementById('crOpenProfileBtn').onclick = () => this.openProfileModal();
      document.getElementById('crEditProfileBtn').onclick = () => this.openProfileModal();
      document.getElementById('crSignOutBtn').onclick = async () => {
        await window.authController.signOut();
        this._updateAuthBar();
        this.refreshFeed();
      };
    } else {
      container.innerHTML = `
        <div class="cr-auth-banner">
          <div class="cr-ab-text">
            <span>Участвуйте в Community Room</span>
          </div>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            <button class="btn btn-ghost btn-sm" id="crOpenAuthBtn" type="button">
              <svg class="ic"><use href="#i-key"/></svg><span>Войти / Регистрация</span>
            </button>
            <button class="btn btn-acc btn-sm" id="crGoogleSignInBtn" type="button">
              <svg class="ic"><use href="#i-spark"/></svg><span>Google</span>
            </button>
          </div>
        </div>
      `;
      document.getElementById('crOpenAuthBtn').onclick = () => this.openAuthModal('signin');
      document.getElementById('crGoogleSignInBtn').onclick = async () => {
        await window.authController.signInWithGoogle();
        this._updateAuthBar();
        this.refreshFeed();
      };
    }
  }

  _buildCommunityDOM() {
    const wrap = document.createElement('div');
    wrap.className = 'overlay cr-overlay-fullscreen';
    wrap.id = 'communityModalOverlay';

    wrap.innerHTML = `
      <div class="cr-app-window" role="dialog" aria-modal="true" aria-label="Community Room">
        <header class="cr-topbar no-sel">
          <div class="cr-topbar-left">
            <div class="logo glitch glitch-sm" data-text="Community Room">
              <span class="l-moon">Community</span><span class="l-sss">Room</span>
            </div>
          </div>
          <div class="cr-tabs-nav" role="tablist" aria-label="Разделы Community Room">
            <button class="cr-tab-btn active" data-tab="images" role="tab" aria-selected="true">
              <svg class="ic"><use href="#i-image"/></svg><span>Изображения</span>
            </button>
            <button class="cr-tab-btn" data-tab="styles" role="tab" aria-selected="false">
              <svg class="ic"><use href="#i-palette"/></svg><span>Стили</span>
            </button>
            <button class="cr-tab-btn" data-tab="chats" role="tab" aria-selected="false">
              <svg class="ic"><use href="#i-chat"/></svg><span>Чаты</span>
            </button>
          </div>
          <div class="cr-topbar-right">
            <button class="icon-btn" id="crCloseBtn" aria-label="Закрыть Community Room" title="Закрыть (Esc)"><svg class="ic"><use href="#i-x"/></svg></button>
          </div>
        </header>
        <div class="cr-subbar">
          <div id="crAuthContainer"></div>
          <div class="cr-search-bar">
            <button class="btn btn-acc btn-sm" id="crPublishStyleBtn" type="button" style="display:none;margin-right:6px">
              <svg class="ic"><use href="#i-plus"/></svg><span>Опубликовать стиль</span>
            </button>
            <svg class="ic"><use href="#i-search"/></svg>
            <input type="text" id="crSearchInput" placeholder="Поиск по названию…" autocomplete="off" spellcheck="false" aria-label="Поиск по Community Room">
            <button class="btn btn-ghost btn-sm cr-refresh-btn" id="crRefreshBtn" type="button" title="Обновить ленту сообщества" aria-label="Обновить"><svg class="ic"><use href="#i-refresh"/></svg><span>Обновить</span></button>
            <button class="btn btn-ghost btn-sm" id="crSearchBtn" type="button"><svg class="ic"><use href="#i-search"/></svg><span>Найти</span></button>
          </div>
        </div>
        <main class="cr-content-area" id="crFeedGrid"></main>
      </div>
    `;

    document.body.appendChild(wrap);

    document.getElementById('crCloseBtn').onclick = () => this.closeCommunityModal();
    wrap.onclick = (e) => { if (e.target === wrap) this.closeCommunityModal(); };
    wrap.querySelectorAll('.cr-tab-btn').forEach(btn => {
      btn.onclick = () => {
        wrap.querySelectorAll('.cr-tab-btn').forEach(b => b.setAttribute('aria-selected', b === btn ? 'true' : 'false'));
        this.switchTab(btn.dataset.tab);
      };
    });

    const pubStyleBtn = document.getElementById('crPublishStyleBtn');
    if (pubStyleBtn) {
      pubStyleBtn.onclick = () => {
        this.openStylePublishModal();
      };
    }

    const searchInp = document.getElementById('crSearchInput');
    searchInp.onkeydown = (e) => { if (e.key === 'Enter') this.refreshFeed(); };
    document.getElementById('crSearchBtn').onclick = () => this.refreshFeed();

    const refreshBtn = document.getElementById('crRefreshBtn');
    if (refreshBtn) {
      refreshBtn.onclick = async () => {
        if (refreshBtn.classList.contains('is-spinning')) return;
        refreshBtn.classList.add('is-spinning');
        try {
          await this.refreshFeed();
          if (window.toast) window.toast('Лента Community Room обновлена', 'ok', 1800);
        } catch (err) {
          if (window.toast) window.toast('Ошибка обновления данных', 'err');
        } finally {
          setTimeout(() => refreshBtn.classList.remove('is-spinning'), 450);
        }
      };
    }

    if (window.authController) {
      window.authController.onAuthStateChange(() => {
        this._updateAuthBar();
      });
    }
  }

  _buildAuthModalDOM() {
    const wrap = document.createElement('div');
    wrap.className = 'overlay cr-auth-overlay';
    wrap.id = 'crAuthModalOverlay';

    wrap.innerHTML = `
      <div class="modal cr-auth-modal" role="dialog" aria-modal="true" aria-label="Аутентификация">
        <div class="modal-head">
          <div class="cr-head-title">
            <svg class="ic" style="color:var(--accent)"><use href="#i-key"/></svg>
            <h2 id="crAuthModalTitle">Аккаунт MoonSSS</h2>
          </div>
          <button class="icon-btn" id="crAuthCloseBtn" aria-label="Закрыть"><svg class="ic"><use href="#i-x"/></svg></button>
        </div>
        <div class="modal-body">
          <div id="crAuthErrorBox" class="cr-auth-error" style="display:none"></div>

          <!-- Шаг 1: Ввод Email / Регистрация -->
          <div id="crAuthStepEmail">
            <div class="cr-auth-segmented no-sel">
              <button type="button" class="cr-auth-tab-btn active" data-authtab="signin">Вход</button>
              <button type="button" class="cr-auth-tab-btn" data-authtab="signup">Регистрация</button>
            </div>

            <p class="cr-auth-step-desc" id="crAuthStepSubtitle">
              Введите вашу почту. Мы отправим 6-значный одноразовый код для входа.
            </p>

            <div class="field" id="crAuthNameField" style="display:none">
              <label for="crAuthName">Ваше имя / Никнейм <span class="opt">(для профиля и публикаций)</span></label>
              <input type="text" id="crAuthName" class="ws-input" placeholder="Например: CyberArtist" maxlength="40" autocomplete="nickname">
            </div>

            <div class="field">
              <label for="crAuthEmail">Email (Gmail / Почта) <span class="req">* (код придёт в письмо)</span></label>
              <input type="email" id="crAuthEmail" class="ws-input" placeholder="username@gmail.com" autocomplete="email" spellcheck="false">
            </div>

            <button type="button" class="btn btn-acc" id="crAuthSendOtpBtn" style="width:100%;margin-top:8px">
              <svg class="ic"><use href="#i-send"/></svg><span id="crAuthSendOtpBtnText">Получить 6-значный код</span>
            </button>

            <div class="cr-auth-divider">
              <span>или быстрый вход</span>
            </div>

            <button type="button" class="btn btn-ghost" id="crAuthGoogleBtn" style="width:100%">
              <svg class="ic" style="color:var(--accent)"><use href="#i-spark"/></svg>Войти через Google OAuth
            </button>
          </div>

          <!-- Шаг 2: Ввод кода подтверждения из Gmail -->
          <div id="crAuthStepOtp" style="display:none">
            <div class="cr-otp-header-info">
              <div class="cr-otp-sub-text">Код подтверждения безопасности отправлен на почту:</div>
              <div class="cr-otp-target-email" id="crOtpTargetEmail">user@gmail.com</div>
              <div class="cr-otp-gmail-hint">
                <svg class="ic"><use href="#i-info"/></svg>
                <span>Проверьте папку «Входящие» или «Спам» в вашей почте</span>
              </div>
              <button type="button" class="cr-otp-change-email-btn" id="crOtpChangeEmailBtn">
                <svg class="ic"><use href="#i-pencil"/></svg>Изменить email
              </button>
            </div>

            <div class="field" style="margin-top:14px">
              <label for="crAuthOtpCode">Введите код подтверждения</label>
              <input type="text" id="crAuthOtpCode" class="ws-input cr-otp-input" placeholder="••••••••" maxlength="8" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code">
            </div>

            <button type="button" class="btn btn-acc" id="crAuthVerifyOtpBtn" style="width:100%;margin-top:8px">
              <svg class="ic"><use href="#i-check"/></svg>Подтвердить и войти
            </button>

            <div class="cr-otp-resend-row">
              <button type="button" class="btn btn-ghost btn-sm" id="crAuthResendOtpBtn" disabled>
                <svg class="ic"><use href="#i-refresh"/></svg><span id="crAuthResendText">Отправить повторно (60с)</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(wrap);

    document.getElementById('crAuthCloseBtn').onclick = () => this.closeAuthModal();
    wrap.onclick = (e) => { if (e.target === wrap) this.closeAuthModal(); };

    wrap.querySelectorAll('.cr-auth-tab-btn').forEach(btn => {
      btn.onclick = () => this._setAuthTab(btn.dataset.authtab);
    });

    document.getElementById('crAuthSendOtpBtn').onclick = () => this._handleSendOtp();
    document.getElementById('crAuthEmail').onkeydown = (e) => { if (e.key === 'Enter') this._handleSendOtp(); };
    document.getElementById('crAuthName').onkeydown = (e) => { if (e.key === 'Enter') this._handleSendOtp(); };

    document.getElementById('crAuthVerifyOtpBtn').onclick = () => this._handleVerifyOtp();
    document.getElementById('crOtpChangeEmailBtn').onclick = () => this._showAuthStep('email');
    document.getElementById('crAuthResendOtpBtn').onclick = () => this._handleSendOtp();

    const otpInp = document.getElementById('crAuthOtpCode');
    otpInp.oninput = () => {
      otpInp.value = otpInp.value.replace(/\D/g, '').slice(0, 8);
      // Авто-отправка при заполнении 8 цифр
      if (otpInp.value.length === 8) {
        this._handleVerifyOtp();
      }
    };
    otpInp.onkeydown = (e) => { if (e.key === 'Enter') this._handleVerifyOtp(); };
    otpInp.onpaste = (e) => {
      e.preventDefault();
      const pasted = (e.clipboardData || window.clipboardData).getData('text').trim().replace(/\D/g, '').slice(0, 8);
      if (pasted) {
        otpInp.value = pasted;
        if (pasted.length >= 6) {
          this._handleVerifyOtp();
        }
      }
    };

    document.getElementById('crAuthGoogleBtn').onclick = async () => {
      this.closeAuthModal();
      await window.authController.signInWithGoogle();
      this._updateAuthBar();
      this.refreshFeed();
    };
  }

  _buildPublishModalDOM() {
    const wrap = document.createElement('div');
    wrap.className = 'overlay cr-publish-overlay';
    wrap.id = 'crPublishImageOverlay';

    wrap.innerHTML = `
      <div class="modal cr-publish-modal" role="dialog" aria-modal="true" aria-label="Отправить в Community Room">
        <div class="modal-head">
          <div class="cr-head-title">
            <svg class="ic" style="color:var(--accent)"><use href="#i-spark"/></svg>
            <h2>Отправить в Community Room</h2>
          </div>
          <button class="icon-btn" id="crPubCloseBtn" aria-label="Закрыть"><svg class="ic"><use href="#i-x"/></svg></button>
        </div>
        <div class="modal-body">
          <div class="cr-pub-preview-box">
            <img id="crPubImgPreview" alt="Предпросмотр">
          </div>
          <div class="field">
            <label for="crPubImgTitle">Название изображения <span class="req">* (Обязательно для поиска)</span></label>
            <input type="text" id="crPubImgTitle" class="ws-input" placeholder="Например: Неоновый кибер-город..." maxlength="80">
          </div>
          <div class="field">
            <label for="crPubImgModel">Генерирующая модель <span class="opt">(Неизменяемый параметр)</span></label>
            <input type="text" id="crPubImgModel" class="ws-input" readonly>
          </div>
          <div class="field">
            <label for="crPubImgDesc">Описание изображения <span class="opt">(По желанию)</span></label>
            <textarea id="crPubImgDesc" class="field-area" style="min-height:60px" placeholder="Краткое описание деталей, стиля или композиции..." maxlength="300"></textarea>
          </div>
          <div class="field" id="crPubPromptPreviewField" style="display:none">
            <label>Текст промпта <span class="opt">(будет виден всем в Community Room)</span></label>
            <div class="cr-prompt-content-box" id="crPubPromptPreviewText" style="max-height:85px;font-size:11.5px"></div>
          </div>
          <div class="set-card cr-pub-switches">
            <div class="set-row">
              <div>
                <div class="sr-t">Скрыть промпт в Community Room</div>
                <div class="sr-s">Если включено, промпт не публикуется. Отключите, чтобы поделиться промптом.</div>
              </div>
              <input type="checkbox" id="crPubHidePrompt" class="cr-checkbox" checked>
            </div>
            <div class="set-row">
              <div>
                <div class="sr-t">Разрешить скачивание изображения</div>
                <div class="sr-s">Пользователи смогут скачивать полноразмерный файл</div>
              </div>
              <input type="checkbox" id="crPubAllowDownload" class="cr-checkbox" checked>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="crPubCancelBtn">Отмена</button>
          <button class="btn btn-acc" id="crPubSubmitBtn"><svg class="ic"><use href="#i-send"/></svg>Опубликовать</button>
        </div>
      </div>
    `;

    document.body.appendChild(wrap);

    document.getElementById('crPubCloseBtn').onclick = () => this.closeImagePublishModal();
    document.getElementById('crPubCancelBtn').onclick = () => this.closeImagePublishModal();
    document.getElementById('crPubSubmitBtn').onclick = () => this.submitImagePublish();
    wrap.onclick = (e) => { if (e.target === wrap) this.closeImagePublishModal(); };

    const hidePromptCb = document.getElementById('crPubHidePrompt');
    const promptPreviewField = document.getElementById('crPubPromptPreviewField');
    if (hidePromptCb && promptPreviewField) {
      hidePromptCb.onchange = () => {
        const hasText = this._publishImageTarget?.prompt;
        promptPreviewField.style.display = (!hidePromptCb.checked && hasText) ? 'block' : 'none';
      };
    }
  }

  // --- UI: МОДАЛЬНОЕ ОКНО РЕДАКТИРОВАНИЯ ПРОФИЛЯ ---

  openProfileModal() {
    const user = window.authController?.currentUser;
    if (!user) {
      this.openAuthModal('signin');
      return;
    }

    let modal = document.getElementById('crProfileModalOverlay');
    if (!modal) {
      this._buildProfileModalDOM();
      modal = document.getElementById('crProfileModalOverlay');
    }

    const meta = user.user_metadata || {};
    this._pendingAvatarUrl = meta.avatar_url || '';
    document.getElementById('crProfFullName').value = meta.full_name || '';
    document.getElementById('crProfUsername').value = meta.username || '';

    const preview = document.getElementById('crProfAvatarPreview');
    if (this._pendingAvatarUrl) {
      preview.innerHTML = `<img src="${this._pendingAvatarUrl}" alt="Аватар">`;
    } else {
      preview.innerHTML = `<span class="cr-prof-avatar-ph">${(meta.full_name || user.email || 'U')[0].toUpperCase()}</span>`;
    }

    document.getElementById('crProfErrorBox').style.display = 'none';
    modal.classList.add('show', 'active');
  }

  closeProfileModal() {
    const modal = document.getElementById('crProfileModalOverlay');
    if (modal) modal.classList.remove('show', 'active');
  }

  async syncAuthorProfileToCommunity(displayName, avatarUrl) {
    const user = await window.authController?.getCurrentUser();
    if (!user) return;
    const token = await window.authController?.getValidToken();
    if (!token) return;

    const payload = {
      user_name: displayName,
      avatar_url: avatarUrl || null
    };

    const headers = {
      'apikey': this.supabaseKey,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    };

    // 1. Пакетное обновление метаданных автора во всех его изображениях
    try {
      await fetch(`${this.supabaseUrl}/rest/v1/community_images?user_id=eq.${user.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(payload)
      });
    } catch (err) {
      console.warn('[Supabase] Ошибка синхронизации автора в community_images:', err);
    }

    // 2. Пакетное обновление метаданных автора во всех его диалогах
    try {
      await fetch(`${this.supabaseUrl}/rest/v1/community_chats?user_id=eq.${user.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(payload)
      });
    } catch (err) {
      console.warn('[Supabase] Ошибка синхронизации автора в community_chats:', err);
    }

    // 3. Пакетное обновление метаданных автора во всех его опубликованных стилях
    try {
      await fetch(`${this.supabaseUrl}/rest/v1/community_styles?user_id=eq.${user.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(payload)
      });
    } catch (err) {
      console.warn('[Supabase] Ошибка синхронизации автора в community_styles:', err);
    }
  }

  _renderStylesFeed(styles, container) {
    if (!styles || styles.length === 0) {
      container.innerHTML = '<div class="cr-empty"><svg class="ic"><use href="#i-palette"/></svg><span>В Community Room пока нет опубликованных стилей. Опубликуйте свой уникальный дизайн!</span></div>';
      return;
    }

    const currentUserId = window.authController?.currentUser?.id;
    container.innerHTML = '';
    const gridWrapper = document.createElement('div');
    gridWrapper.className = 'cr-styles-grid';

    styles.forEach(item => {
      const card = document.createElement('article');
      card.className = 'cr-style-card';

      const tData = item.theme_data || {};
      const cThemes = tData.customThemes || {};
      const darkCfg = cThemes.dark || {};
      const lightCfg = cThemes.light || {};
      const mainCfg = darkCfg.bgColor ? darkCfg : lightCfg;

      const codeCfg = tData.customCode || {};
      const hasCss = Boolean((codeCfg.dark?.css && codeCfg.dark.css.trim()) || (codeCfg.light?.css && codeCfg.light.css.trim()));
      const hasJs = Boolean((codeCfg.dark?.js && codeCfg.dark.js.trim()) || (codeCfg.light?.js && codeCfg.light.js.trim()));
      const hasCursor = Boolean(tData.customCursor && (tData.customCursor.dark?.pointerPresetId !== 'system' || tData.customCursor.light?.pointerPresetId !== 'system'));
      const hasTypo = Boolean(tData.typography && (tData.typography.ru?.font !== 'system' || tData.typography.en?.font !== 'system'));

      const isOwner = currentUserId && (currentUserId === item.user_id);
      const deleteBtnHtml = isOwner ? `
        <button class="btn-cr-action danger cr-btn-delete-style" title="Удалить свой стиль" data-id="${item.id}">
          <svg class="ic"><use href="#i-trash"/></svg>
        </button>
      ` : '';

      const authorAvatarHtml = item.avatar_url
        ? `<img src="${item.avatar_url}" class="cr-author-avatar-img" alt="" onerror="this.outerHTML='<span class=\\'cr-author-avatar-ph\\'>${(item.user_name || 'U')[0].toUpperCase()}</span>'">`
        : `<span class="cr-author-avatar-ph">${(item.user_name || 'U')[0].toUpperCase()}</span>`;

      const bgCol = mainCfg.bgColor || '#141414';
      const textCol = mainCfg.textColor || '#f8fafc';
      const accentCol = mainCfg.accentColor || '#8fd0f5';
      const streamCol = mainCfg.streamColor || '#ffd700';
      const userBg = mainCfg.userBubbleBg || '#262626';
      const aiBg = mainCfg.aiBubbleBg || '#18181b';

      const styleInlineVars = `
        --cr-st-bg: ${bgCol};
        --cr-st-text: ${textCol};
        --cr-st-accent: ${accentCol};
        --cr-st-stream: ${streamCol};
        --cr-st-user-bg: ${userBg};
        --cr-st-ai-bg: ${aiBg};
      `;

      card.innerHTML = `
        <div class="cr-style-header">
          <div class="cr-style-title-wrap">
            <h4 class="cr-style-title">${esc(item.title)}</h4>
            <div class="cr-author" style="margin-top:2px">
              <span class="cr-author-avatar-box">${authorAvatarHtml}</span>
              <span class="cr-author-name-text">${esc(item.user_name || 'Дизайнер')}</span>
            </div>
          </div>
          <div class="cr-style-badges">
            ${hasCss ? '<span class="cr-style-badge cr-badge-accent" title="Включает авторский CSS"><svg class="ic"><use href="#i-palette"/></svg>CSS</span>' : ''}
            ${hasJs ? '<span class="cr-style-badge cr-badge-accent" title="Включает скрипты спецэффектов (Canvas JS)"><svg class="ic"><use href="#i-terminal"/></svg>JS</span>' : ''}
            ${hasCursor ? '<span class="cr-style-badge cr-badge-subtle" title="Включает профиль курсоров"><svg class="ic"><use href="#i-cursor"/></svg>Курсор</span>' : ''}
            ${hasTypo ? '<span class="cr-style-badge cr-badge-subtle" title="Включает гарнитуры шрифтов"><svg class="ic"><use href="#i-pencil"/></svg>Шрифты</span>' : ''}
          </div>
        </div>

        ${item.description ? `<p class="cr-style-desc">${esc(item.description)}</p>` : ''}

        <div class="cr-style-viewport no-sel" style="${styleInlineVars}">
          <div class="cr-style-vp-head">
            <span class="cr-style-vp-logo">MoonSSS</span>
            <span class="cr-style-vp-tag">Style Viewport</span>
          </div>
          <div class="cr-style-vp-bubble user">Стиль автора для MoonSSS</div>
          <div class="cr-style-vp-bubble ai">
            <span>Шлейф стрима:</span>
            <span class="cr-style-vp-laser">Лазерное свечение</span>
          </div>
          <div class="cr-style-vp-footer">
            <span class="cr-style-vp-btn">Кнопка</span>
            <span class="cr-style-vp-swatches">
              <span class="cr-swatch" style="background:${bgCol}" title="Фон"></span>
              <span class="cr-swatch" style="background:${accentCol}" title="Акцент"></span>
              <span class="cr-swatch" style="background:${streamCol}" title="Шлейф"></span>
            </span>
          </div>
        </div>

        <div class="cr-card-footer">
          <div class="cr-actions-group" style="width:100%;justify-content:space-between">
            <div style="display:flex;gap:6px;align-items:center">
              <button class="btn btn-acc btn-sm cr-btn-apply-style" title="Применить этот стиль в приложении прямо сейчас">
                <svg class="ic"><use href="#i-spark"/></svg>Применить
              </button>
              <button class="btn btn-ghost btn-sm cr-btn-save-style" title="Сохранить в локальный каталог «Свой дизайн»">
                <svg class="ic"><use href="#i-cube"/></svg>В коллекцию
              </button>
            </div>
            <div style="display:flex;gap:4px;align-items:center">
              <button class="btn-cr-action cr-btn-inspect-style" title="Инспектировать токены, CSS и JS код">
                <svg class="ic"><use href="#i-eye"/></svg>
              </button>
              ${deleteBtnHtml}
            </div>
          </div>
        </div>
      `;

      card.querySelector('.cr-btn-apply-style').onclick = () => {
        if (typeof window.applyThemeDataDirectly === 'function') {
          window.applyThemeDataDirectly(item.theme_data, item.title);
        } else if (window.toast) {
          window.toast('Функция применения темы инициализируется…', 'info');
        }
      };

      card.querySelector('.cr-btn-save-style').onclick = () => {
        const s = window.state?.settings;
        if (!s) return;
        if (!Array.isArray(s.savedThemes)) s.savedThemes = [];

        const newPreset = {
          id: 'preset_' + Date.now().toString(36),
          title: item.title,
          desc: item.description || `Стиль от @${item.user_name || 'сообщество'}`,
          createdAt: Date.now(),
          customThemes: item.theme_data?.customThemes || {},
          customCursor: item.theme_data?.customCursor || {},
          customCode: item.theme_data?.customCode || {},
          typography: item.theme_data?.typography || {}
        };

        s.savedThemes.unshift(newPreset);
        if (typeof window.save === 'function') window.save(true);
        if (typeof window.renderSavedThemes === 'function') window.renderSavedThemes();
        if (window.toast) window.toast(`Стиль «${item.title}» добавлен в ваш раздел «Свой дизайн»`, 'ok', 2500);
      };

      card.querySelector('.cr-btn-inspect-style').onclick = () => {
        this.openStyleInspectorModal(item);
      };

      if (isOwner) {
        card.querySelector('.cr-btn-delete-style').onclick = async (e) => {
          e.stopPropagation();
          if (!confirm(`Удалить опубликованный стиль «${item.title}» из Community Room?`)) return;
          try {
            await this.deleteCommunityStyle(item.id, item.user_id);
            if (window.toast) window.toast('Стиль удален из Community Room', 'info');
            this.refreshFeed();
          } catch (err) {
            if (window.toast) window.toast(`Ошибка удаления: ${err.message}`, 'err');
          }
        };
      }

      gridWrapper.appendChild(card);
    });

    container.appendChild(gridWrapper);
  }

  openStylePublishModal(presetOrTheme) {
    const user = window.authController?.currentUser;
    if (!user) {
      if (window.toast) window.toast('Сначала войдите в аккаунт', 'info');
      this.openAuthModal('signin');
      return;
    }

    this._publishStyleTarget = presetOrTheme || null;
    let modal = document.getElementById('crPublishStyleOverlay');
    if (!modal) {
      this._buildStylePublishModalDOM();
      modal = document.getElementById('crPublishStyleOverlay');
    }

    const selectEl = document.getElementById('crPubStylePresetSelect');
    const titleInp = document.getElementById('crPubStyleTitle');
    const descInp = document.getElementById('crPubStyleDesc');
    const savedList = window.state?.settings?.savedThemes || [];

    selectEl.innerHTML = `
      <option value="current">Текущее активное оформление приложения</option>
      ${savedList.map((st, idx) => `<option value="${st.id}">Пресет: ${esc(st.title)}</option>`).join('')}
    `;

    if (presetOrTheme && presetOrTheme.id) {
      selectEl.value = presetOrTheme.id;
      titleInp.value = presetOrTheme.title || '';
      descInp.value = presetOrTheme.desc || '';
    } else {
      selectEl.value = 'current';
      titleInp.value = '';
      descInp.value = '';
    }

    this._updatePublishStyleSummary();

    selectEl.onchange = () => {
      const val = selectEl.value;
      if (val === 'current') {
        titleInp.value = '';
        descInp.value = '';
      } else {
        const item = savedList.find(x => x.id === val);
        if (item) {
          titleInp.value = item.title || '';
          descInp.value = item.desc || '';
        }
      }
      this._updatePublishStyleSummary();
    };

    modal.classList.add('show', 'active');
  }

  closeStylePublishModal() {
    const modal = document.getElementById('crPublishStyleOverlay');
    if (modal) modal.classList.remove('show', 'active');
    this._publishStyleTarget = null;
  }

  _updatePublishStyleSummary() {
    const selectEl = document.getElementById('crPubStylePresetSelect');
    const summaryBox = document.getElementById('crPubStyleSummaryBox');
    if (!selectEl || !summaryBox) return;

    let targetData = null;
    const val = selectEl.value;
    const s = window.state?.settings || {};

    if (val === 'current') {
      targetData = {
        customThemes: s.customThemes || {},
        customCursor: s.customCursor || {},
        customCode: s.customCode || {},
        typography: s.typography || {}
      };
    } else {
      const savedList = s.savedThemes || [];
      const item = savedList.find(x => x.id === val);
      targetData = item ? {
        customThemes: item.customThemes || {},
        customCursor: item.customCursor || {},
        customCode: item.customCode || {},
        typography: item.typography || {}
      } : null;
    }

    if (!targetData) {
      summaryBox.innerHTML = '<span class="cr-text-muted">Данные темы не найдены</span>';
      return;
    }

    const dark = targetData.customThemes?.dark || {};
    const light = targetData.customThemes?.light || {};
    const code = targetData.customCode || {};
    const darkCssLines = (code.dark?.css || '').trim().split('\n').filter(Boolean).length;
    const darkJsLines = (code.dark?.js || '').trim().split('\n').filter(Boolean).length;

    summaryBox.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11.5px">
        <div style="display:flex;align-items:center;gap:6px">
          <span class="cr-swatch" style="background:${dark.bgColor || '#141414'}"></span>
          <span class="cr-swatch" style="background:${dark.accentColor || '#8fd0f5'}"></span>
          <span class="cr-swatch" style="background:${dark.streamColor || '#ffd700'}"></span>
          <span>Тёмный профиль</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <span class="cr-swatch" style="background:${light.bgColor || '#f0f2f5'}"></span>
          <span class="cr-swatch" style="background:${light.accentColor || '#1d4ed8'}"></span>
          <span>Светлый профиль</span>
        </div>
      </div>
      <div style="font-size:11px;color:var(--cr-text-muted);display:flex;gap:10px;flex-wrap:wrap">
        <span>CSS: <b>${darkCssLines} строк</b></span>
        <span>Canvas JS: <b>${darkJsLines} строк</b></span>
        <span>Курсоры: <b>${targetData.customCursor?.dark?.pointerPresetId || 'Standard'}</b></span>
      </div>
    `;
  }

  async submitStylePublish() {
    const title = document.getElementById('crPubStyleTitle').value.trim();
    const desc = document.getElementById('crPubStyleDesc').value.trim();
    const selectEl = document.getElementById('crPubStylePresetSelect');
    const s = window.state?.settings || {};

    if (!title) {
      if (window.toast) window.toast('Введите название публикуемого стиля', 'warn');
      return;
    }

    let themeData = null;
    if (selectEl.value === 'current') {
      themeData = {
        customThemes: JSON.parse(JSON.stringify(s.customThemes || {})),
        customCursor: JSON.parse(JSON.stringify(s.customCursor || {})),
        customCode: JSON.parse(JSON.stringify(s.customCode || {})),
        typography: JSON.parse(JSON.stringify(s.typography || {}))
      };
    } else {
      const item = (s.savedThemes || []).find(x => x.id === selectEl.value);
      if (item) {
        themeData = {
          customThemes: JSON.parse(JSON.stringify(item.customThemes || {})),
          customCursor: JSON.parse(JSON.stringify(item.customCursor || {})),
          customCode: JSON.parse(JSON.stringify(item.customCode || {})),
          typography: JSON.parse(JSON.stringify(item.typography || {}))
        };
      }
    }

    if (!themeData) {
      if (window.toast) window.toast('Не удалось подготовить структуру стиля', 'err');
      return;
    }

    const submitBtn = document.getElementById('crPubStyleSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="cr-spinner"></span> Публикация стиля…';

    try {
      await this.publishStyle({
        title,
        description: desc,
        themeData
      });

      if (window.toast) window.toast(`Стиль «${title}» опубликован в Community Room!`, 'ok');
      this.closeStylePublishModal();
      this.switchTab('styles');
    } catch (err) {
      if (window.toast) window.toast(err.message || 'Ошибка публикации стиля', 'err', 4000);
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<svg class="ic"><use href="#i-send"/></svg>Опубликовать стиль';
    }
  }

  _buildStylePublishModalDOM() {
    const wrap = document.createElement('div');
    wrap.className = 'overlay cr-publish-overlay';
    wrap.id = 'crPublishStyleOverlay';

    wrap.innerHTML = `
      <div class="modal cr-publish-modal cr-publish-style-modal" role="dialog" aria-modal="true" aria-label="Публикация стиля в Community Room">
        <div class="modal-head">
          <div class="cr-head-title">
            <svg class="ic" style="color:var(--accent)"><use href="#i-palette"/></svg>
            <h2>Опубликовать стиль в Community Room</h2>
          </div>
          <button class="icon-btn" id="crPubStyleCloseBtn" aria-label="Закрыть"><svg class="ic"><use href="#i-x"/></svg></button>
        </div>
        <div class="modal-body">
          <div class="field">
            <label for="crPubStylePresetSelect">Источник конфигурации стиля</label>
            <select id="crPubStylePresetSelect" class="ws-input" style="cursor:pointer"></select>
          </div>
          <div class="field">
            <label for="crPubStyleTitle">Название стиля <span class="req">*</span></label>
            <input type="text" id="crPubStyleTitle" class="ws-input" placeholder="Например: Cyberpunk 2026, Vercel Neon..." maxlength="80">
          </div>
          <div class="field">
            <label for="crPubStyleDesc">Описание и концепция <span class="opt">(По желанию)</span></label>
            <textarea id="crPubStyleDesc" class="field-area" style="min-height:70px" placeholder="Опишите палитру, атмосферу, назначение и эффекты..." maxlength="400"></textarea>
          </div>
          <div class="field">
            <label>Параметры бандла стиля (Dark + Light + Code)</label>
            <div id="crPubStyleSummaryBox" class="cr-style-summary-box"></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="crPubStyleCancelBtn">Отмена</button>
          <button class="btn btn-acc" id="crPubStyleSubmitBtn"><svg class="ic"><use href="#i-send"/></svg>Опубликовать стиль</button>
        </div>
      </div>
    `;

    document.body.appendChild(wrap);

    document.getElementById('crPubStyleCloseBtn').onclick = () => this.closeStylePublishModal();
    document.getElementById('crPubStyleCancelBtn').onclick = () => this.closeStylePublishModal();
    document.getElementById('crPubStyleSubmitBtn').onclick = () => this.submitStylePublish();
    wrap.onclick = (e) => { if (e.target === wrap) this.closeStylePublishModal(); };
  }

  openStyleInspectorModal(item) {
    let modal = document.getElementById('crStyleInspectorOverlay');
    if (!modal) {
      this._buildStyleInspectorModalDOM();
      modal = document.getElementById('crStyleInspectorOverlay');
    }

    const tData = item.theme_data || {};
    const darkCfg = tData.customThemes?.dark || {};
    const lightCfg = tData.customThemes?.light || {};
    const code = tData.customCode || {};

    document.getElementById('crInspStyleTitle').textContent = item.title;
    document.getElementById('crInspStyleAuthor').textContent = `Автор: @${item.user_name || 'Создатель'}`;
    document.getElementById('crInspStyleDesc').textContent = item.description || 'Пользовательский визуальный стиль для MoonSSS';

    document.getElementById('crInspDarkCss').textContent = code.dark?.css || '/* Пользовательский CSS отсутствует */';
    document.getElementById('crInspDarkJs').textContent = code.dark?.js || '// Пользовательский Canvas JS отсутствует';
    document.getElementById('crInspLightCss').textContent = code.light?.css || '/* Пользовательский CSS отсутствует */';
    document.getElementById('crInspLightJs').textContent = code.light?.js || '// Пользовательский Canvas JS отсутствует';

    const tokensGrid = document.getElementById('crInspTokensGrid');
    tokensGrid.innerHTML = `
      <div class="cr-insp-token-card"><span class="cr-swatch" style="background:${darkCfg.bgColor || '#141414'}"></span><div><div class="k">Dark Bg</div><div class="v">${darkCfg.bgColor || '#141414'}</div></div></div>
      <div class="cr-insp-token-card"><span class="cr-swatch" style="background:${darkCfg.accentColor || '#8fd0f5'}"></span><div><div class="k">Dark Accent</div><div class="v">${darkCfg.accentColor || '#8fd0f5'}</div></div></div>
      <div class="cr-insp-token-card"><span class="cr-swatch" style="background:${darkCfg.streamColor || '#ffd700'}"></span><div><div class="k">Dark Stream</div><div class="v">${darkCfg.streamColor || '#ffd700'}</div></div></div>
      <div class="cr-insp-token-card"><span class="cr-swatch" style="background:${lightCfg.bgColor || '#f0f2f5'}"></span><div><div class="k">Light Bg</div><div class="v">${lightCfg.bgColor || '#f0f2f5'}</div></div></div>
      <div class="cr-insp-token-card"><span class="cr-swatch" style="background:${lightCfg.accentColor || '#1d4ed8'}"></span><div><div class="k">Light Accent</div><div class="v">${lightCfg.accentColor || '#1d4ed8'}</div></div></div>
    `;

    document.getElementById('crInspApplyBtn').onclick = () => {
      if (typeof window.applyThemeDataDirectly === 'function') {
        window.applyThemeDataDirectly(item.theme_data, item.title);
      }
      this.closeStyleInspectorModal();
    };

    modal.classList.add('show', 'active');
  }

  closeStyleInspectorModal() {
    const modal = document.getElementById('crStyleInspectorOverlay');
    if (modal) modal.classList.remove('show', 'active');
  }

  _buildStyleInspectorModalDOM() {
    const wrap = document.createElement('div');
    wrap.className = 'overlay cr-desc-overlay';
    wrap.id = 'crStyleInspectorOverlay';

    wrap.innerHTML = `
      <div class="modal cr-desc-modal cr-style-inspector-modal" role="dialog" aria-modal="true" aria-label="Инспектор стиля сообщества">
        <div class="modal-head">
          <div class="cr-head-title">
            <svg class="ic" style="color:var(--accent)"><use href="#i-eye"/></svg>
            <h2 id="crInspStyleTitle">Инспектор стиля</h2>
          </div>
          <button class="icon-btn" id="crInspCloseBtn" aria-label="Закрыть"><svg class="ic"><use href="#i-x"/></svg></button>
        </div>
        <div class="modal-body" style="max-height:75vh;overflow-y:auto">
          <div style="margin-bottom:10px">
            <div id="crInspStyleAuthor" style="font-size:12px;color:var(--cr-accent);font-weight:600"></div>
            <p id="crInspStyleDesc" style="font-size:12px;color:var(--cr-text-secondary);margin-top:4px"></p>
          </div>

          <div class="field">
            <label>Ключевые цветовые токены</label>
            <div id="crInspTokensGrid" class="cr-insp-tokens-grid"></div>
          </div>

          <div class="field" style="margin-top:12px">
            <div style="display:flex;align-items:center;justify-content:space-between">
              <label>Custom CSS (Dark):</label>
              <button class="btn btn-ghost btn-sm" id="crCopyDarkCssBtn" type="button" style="padding:2px 8px;font-size:11px"><svg class="ic"><use href="#i-copy"/></svg>Копировать CSS</button>
            </div>
            <pre class="inspect-code-pre"><code id="crInspDarkCss"></code></pre>
          </div>

          <div class="field" style="margin-top:12px">
            <div style="display:flex;align-items:center;justify-content:space-between">
              <label>Custom Canvas JS (Dark):</label>
              <button class="btn btn-ghost btn-sm" id="crCopyDarkJsBtn" type="button" style="padding:2px 8px;font-size:11px"><svg class="ic"><use href="#i-copy"/></svg>Копировать JS</button>
            </div>
            <pre class="inspect-code-pre"><code id="crInspDarkJs"></code></pre>
          </div>

          <div class="field" style="margin-top:12px">
            <div style="display:flex;align-items:center;justify-content:space-between">
              <label>Custom CSS (Light):</label>
              <button class="btn btn-ghost btn-sm" id="crCopyLightCssBtn" type="button" style="padding:2px 8px;font-size:11px"><svg class="ic"><use href="#i-copy"/></svg>Копировать CSS</button>
            </div>
            <pre class="inspect-code-pre"><code id="crInspLightCss"></code></pre>
          </div>

          <div class="field" style="margin-top:12px">
            <div style="display:flex;align-items:center;justify-content:space-between">
              <label>Custom Canvas JS (Light):</label>
              <button class="btn btn-ghost btn-sm" id="crCopyLightJsBtn" type="button" style="padding:2px 8px;font-size:11px"><svg class="ic"><use href="#i-copy"/></svg>Копировать JS</button>
            </div>
            <pre class="inspect-code-pre"><code id="crInspLightJs"></code></pre>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="crInspDoneBtn">Закрыть</button>
          <button class="btn btn-acc" id="crInspApplyBtn"><svg class="ic"><use href="#i-spark"/></svg>Применить этот стиль</button>
        </div>
      </div>
    `;

    document.body.appendChild(wrap);

    document.getElementById('crInspCloseBtn').onclick = () => this.closeStyleInspectorModal();
    document.getElementById('crInspDoneBtn').onclick = () => this.closeStyleInspectorModal();
    wrap.onclick = (e) => { if (e.target === wrap) this.closeStyleInspectorModal(); };

    const bindCopy = (btnId, codeId, msg) => {
      const b = document.getElementById(btnId);
      if (b) b.onclick = () => {
        const text = document.getElementById(codeId)?.textContent || '';
        navigator.clipboard.writeText(text);
        if (window.toast) window.toast(msg, 'ok', 1600);
      };
    };

    bindCopy('crCopyDarkCssBtn', 'crInspDarkCss', 'CSS (Dark) скопирован');
    bindCopy('crCopyDarkJsBtn', 'crInspDarkJs', 'JS (Dark) скопирован');
    bindCopy('crCopyLightCssBtn', 'crInspLightCss', 'CSS (Light) скопирован');
    bindCopy('crCopyLightJsBtn', 'crInspLightJs', 'JS (Light) скопирован');
  }

  async _handleProfileSave() {
    const fullName = document.getElementById('crProfFullName').value.trim();
    const username = document.getElementById('crProfUsername').value.trim();
    const btn = document.getElementById('crProfSaveBtn');
    const errBox = document.getElementById('crProfErrorBox');

    btn.disabled = true;
    btn.innerHTML = '<span class="cr-spinner"></span> Сохранение…';
    errBox.style.display = 'none';

    try {
      const updatedUser = await window.authController.updateProfile({
        fullName,
        username,
        avatarUrl: this._pendingAvatarUrl
      });

      // Формируем актуальное имя пользователя для обновления карточек
      const meta = updatedUser?.user_metadata || {};
      const displayName = meta.full_name || (meta.username ? `@${meta.username}` : updatedUser?.email?.split('@')[0] || 'Создатель MoonSSS');
      const avatarUrl = meta.avatar_url || this._pendingAvatarUrl || null;

      // Синхронизируем новое имя и аватар со всеми уже опубликованными карточками в БД
      await this.syncAuthorProfileToCommunity(displayName, avatarUrl);

      if (window.toast) window.toast('Профиль и публикации успешно обновлены!', 'ok');
      this.closeProfileModal();
      this._updateAuthBar();
      this.refreshFeed();
    } catch (e) {
      errBox.textContent = e.message || 'Ошибка обновления профиля';
      errBox.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<svg class="ic"><use href="#i-check"/></svg>Сохранить изменения';
    }
  }

  _openAvatarCropper(imageSrc) {
    let cropModal = document.getElementById('crCropModalOverlay');
    if (!cropModal) {
      this._buildCropModalDOM();
      cropModal = document.getElementById('crCropModalOverlay');
    }

    this._cropState = {
      src: imageSrc,
      scale: 1,
      minScale: 0.5,
      maxScale: 3,
      x: 0,
      y: 0,
      isDragging: false,
      startX: 0,
      startY: 0
    };

    const canvas = document.getElementById('crCropCanvas');
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this._cropState.img = img;
      const size = 300;
      this._cropState.scale = Math.max(size / img.width, size / img.height);
      this._cropState.minScale = this._cropState.scale * 0.7;
      this._cropState.maxScale = this._cropState.scale * 3.5;
      this._cropState.x = (size - img.width * this._cropState.scale) / 2;
      this._cropState.y = (size - img.height * this._cropState.scale) / 2;
      
      const zoomRange = document.getElementById('crCropZoomRange');
      zoomRange.min = this._cropState.minScale;
      zoomRange.max = this._cropState.maxScale;
      zoomRange.value = this._cropState.scale;
      
      this._renderCropCanvas();
      cropModal.classList.add('show', 'active');
    };
    img.src = imageSrc;
  }

  _renderCropCanvas() {
    const canvas = document.getElementById('crCropCanvas');
    if (!canvas || !this._cropState?.img) return;
    const ctx = canvas.getContext('2d');
    const size = 300;
    canvas.width = size;
    canvas.height = size;

    ctx.clearRect(0, 0, size, size);
    
    // Рисуем изображение с трансформацией
    ctx.save();
    ctx.drawImage(
      this._cropState.img,
      this._cropState.x,
      this._cropState.y,
      this._cropState.img.width * this._cropState.scale,
      this._cropState.img.height * this._cropState.scale
    );
    ctx.restore();

    // Затемнение вне круга
    ctx.save();
    ctx.fillStyle = 'hsla(0, 0%, 0%, 0.65)';
    ctx.beginPath();
    ctx.rect(0, 0, size, size);
    ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2, true);
    ctx.fill();

    // Льдисто-серебристая круглая граница видоискателя
    ctx.strokeStyle = 'hsla(210, 30%, 88%, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  _generateCroppedBlob() {
    return new Promise((resolve) => {
      const { img, x, y, scale } = this._cropState;
      const size = 300;
      const outCanvas = document.createElement('canvas');
      const outSize = 512;
      outCanvas.width = outSize;
      outCanvas.height = outSize;
      const ctx = outCanvas.getContext('2d');

      ctx.beginPath();
      ctx.arc(outSize / 2, outSize / 2, outSize / 2, 0, Math.PI * 2);
      ctx.clip();

      const factor = outSize / size;
      ctx.drawImage(
        img,
        x * factor,
        y * factor,
        img.width * scale * factor,
        img.height * scale * factor
      );

      outCanvas.toBlob((blob) => resolve(blob), 'image/png', 0.95);
    });
  }

  _buildCropModalDOM() {
    const wrap = document.createElement('div');
    wrap.className = 'overlay cr-crop-overlay';
    wrap.id = 'crCropModalOverlay';

    wrap.innerHTML = `
      <div class="modal cr-crop-modal" role="dialog" aria-modal="true" aria-label="Кадрирование аватара">
        <div class="modal-head">
          <div class="cr-head-title">
            <svg class="ic" style="color:var(--accent)"><use href="#i-camera"/></svg>
            <h2>Кадрирование аватара</h2>
          </div>
          <button class="icon-btn" id="crCropCloseBtn" aria-label="Закрыть"><svg class="ic"><use href="#i-x"/></svg></button>
        </div>
        <div class="modal-body cr-crop-modal-body">
          <div class="cr-crop-canvas-wrap">
            <canvas id="crCropCanvas" width="300" height="300"></canvas>
          </div>
          <div class="cr-crop-controls">
            <svg class="ic"><use href="#i-minus"/></svg>
            <input type="range" id="crCropZoomRange" step="0.01" style="flex:1;accent-color:var(--accent)">
            <svg class="ic"><use href="#i-plus"/></svg>
          </div>
          <div class="cr-avatar-note" style="text-align:center">Перетаскивайте изображение и используйте ползунок для масштабирования</div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="crCropCancelBtn">Отмена</button>
          <button class="btn btn-acc" id="crCropApplyBtn"><svg class="ic"><use href="#i-check"/></svg>Применить аватар</button>
        </div>
      </div>
    `;

    document.body.appendChild(wrap);

    const closeCrop = () => wrap.classList.remove('show', 'active');
    document.getElementById('crCropCloseBtn').onclick = closeCrop;
    document.getElementById('crCropCancelBtn').onclick = closeCrop;

    const canvas = document.getElementById('crCropCanvas');
    const onPointerDown = (e) => {
      this._cropState.isDragging = true;
      this._cropState.startX = e.clientX - this._cropState.x;
      this._cropState.startY = e.clientY - this._cropState.y;
      canvas.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e) => {
      if (!this._cropState?.isDragging) return;
      this._cropState.x = e.clientX - this._cropState.startX;
      this._cropState.y = e.clientY - this._cropState.startY;
      this._renderCropCanvas();
    };
    const onPointerUp = (e) => {
      this._cropState.isDragging = false;
      try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    };

    canvas.onpointerdown = onPointerDown;
    canvas.onpointermove = onPointerMove;
    canvas.onpointerup = onPointerUp;
    canvas.onpointercancel = onPointerUp;

    document.getElementById('crCropZoomRange').oninput = (e) => {
      const newScale = parseFloat(e.target.value);
      const size = 300;
      const cx = size / 2;
      const cy = size / 2;
      const ratio = newScale / this._cropState.scale;
      this._cropState.x = cx - (cx - this._cropState.x) * ratio;
      this._cropState.y = cy - (cy - this._cropState.y) * ratio;
      this._cropState.scale = newScale;
      this._renderCropCanvas();
    };

    document.getElementById('crCropApplyBtn').onclick = async () => {
      const applyBtn = document.getElementById('crCropApplyBtn');
      applyBtn.disabled = true;
      applyBtn.innerHTML = '<span class="cr-spinner"></span> Загрузка…';
      try {
        const croppedBlob = await this._generateCroppedBlob();
        const { publicUrl } = await this.uploadImageToStorage(croppedBlob, 'avatar.png');
        this._pendingAvatarUrl = publicUrl;
        document.getElementById('crProfAvatarPreview').innerHTML = `<img src="${publicUrl}" alt="Аватар">`;
        closeCrop();
        if (window.toast) window.toast('Аватар подготовлен! Нажмите «Сохранить изменения»', 'ok');
      } catch (err) {
        if (window.toast) window.toast(`Ошибка сохранения аватара: ${err.message}`, 'err');
      } finally {
        applyBtn.disabled = false;
        applyBtn.innerHTML = '<svg class="ic"><use href="#i-check"/></svg>Применить аватар';
      }
    };
  }

  _buildProfileModalDOM() {
    const wrap = document.createElement('div');
    wrap.className = 'overlay cr-profile-overlay';
    wrap.id = 'crProfileModalOverlay';

    wrap.innerHTML = `
      <div class="modal cr-profile-modal" role="dialog" aria-modal="true" aria-label="Настройки профиля">
        <div class="modal-head">
          <div class="cr-head-title">
            <svg class="ic" style="color:var(--accent)"><use href="#i-spark"/></svg>
            <h2>Профиль пользователя</h2>
          </div>
          <button class="icon-btn" id="crProfCloseBtn" aria-label="Закрыть"><svg class="ic"><use href="#i-x"/></svg></button>
        </div>
        <div class="modal-body">
          <div id="crProfErrorBox" class="cr-auth-error" style="display:none"></div>

          <div class="cr-profile-avatar-row">
            <div class="cr-avatar-preview-lg" id="crProfAvatarPreview">
              <span class="cr-prof-avatar-ph">U</span>
            </div>
            <div class="cr-avatar-controls">
              <button type="button" class="btn btn-ghost btn-sm" id="crProfUploadAvatarBtn">
                <svg class="ic"><use href="#i-camera"/></svg>Загрузить и обрезать фото
              </button>
              <input type="file" id="crProfAvatarFileInput" accept="image/png,image/jpeg,image/webp" style="display:none">
              <span class="cr-avatar-note">Кадрирование в круг 1:1, PNG / JPG до 10 МБ</span>
            </div>
          </div>

          <div class="field">
            <label for="crProfFullName">Отображаемое имя / Никнейм</label>
            <input type="text" id="crProfFullName" class="ws-input" placeholder="Например: CyberArtist" maxlength="50">
          </div>

          <div class="field">
            <label for="crProfUsername">Уникальный @username</label>
            <div class="cr-input-prefix-wrap">
              <span class="cr-prefix">@</span>
              <input type="text" id="crProfUsername" class="ws-input" placeholder="cyber_creator" maxlength="30" autocomplete="off" spellcheck="false">
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="crProfCancelBtn">Отмена</button>
          <button class="btn btn-acc" id="crProfSaveBtn"><svg class="ic"><use href="#i-check"/></svg>Сохранить изменения</button>
        </div>
      </div>
    `;

    document.body.appendChild(wrap);

    document.getElementById('crProfCloseBtn').onclick = () => this.closeProfileModal();
    document.getElementById('crProfCancelBtn').onclick = () => this.closeProfileModal();
    document.getElementById('crProfSaveBtn').onclick = () => this._handleProfileSave();
    wrap.onclick = (e) => { if (e.target === wrap) this.closeProfileModal(); };

    const fileInput = document.getElementById('crProfAvatarFileInput');
    document.getElementById('crProfUploadAvatarBtn').onclick = () => fileInput.click();
    fileInput.onchange = (e) => {
      const file = e.target.files && e.target.files[0];
      if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () => {
          this._openAvatarCropper(reader.result);
        };
        reader.readAsDataURL(file);
      }
      e.target.value = '';
    };
  }
}

window.supabaseCommunity = new SupabaseCommunityController();