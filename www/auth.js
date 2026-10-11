/**
 * MoonSSS — Auth Controller (Google OAuth + Email/Password + Supabase + IndexedDB Session)
 * Pure Vanilla ES6+, Zero LocalStorage, Cross-Platform (Web / Electron / Capacitor)
 */
/**
 * auth.js
 */

class AuthController {
  constructor() {
    this.supabaseUrl = 'https://wciqrfxsittcaxlewpwu.supabase.co';
    this.supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjaXFyZnhzaXR0Y2F4bGV3cHd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0NzY2NzYsImV4cCI6MjA5MTA1MjY3Nn0.l0P2YR8QUIsvUFZ6aZDBNuDywYjwS_bOuYLXhULuYNA';
    this.currentUser = null;
    this.session = null;
    this._listeners = new Set();
    this._initSessionPromise = this._initFromIndexedDB();
  }

  async _openAuthDB() {
    return new Promise((resolve, reject) => {
      const rq = indexedDB.open('MoonSSS_DB', 2);
      rq.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('app_state')) {
          db.createObjectStore('app_state', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('auth_session')) {
          db.createObjectStore('auth_session', { keyPath: 'id' });
        }
      };
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => reject(rq.error);
    });
  }

  async _saveSessionToIDB(session) {
    const db = await this._openAuthDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('auth_session', 'readwrite');
      const st = tx.objectStore('auth_session');
      st.put({ id: 'current_session', value: session, updatedAt: Date.now() });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  async _clearSessionFromIDB() {
    const db = await this._openAuthDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('auth_session', 'readwrite');
      const st = tx.objectStore('auth_session');
      st.delete('current_session');
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  async _getSessionFromIDB() {
    try {
      const db = await this._openAuthDB();
      return new Promise((resolve) => {
        try {
          const tx = db.transaction('auth_session', 'readonly');
          const st = tx.objectStore('auth_session');
          const rq = st.get('current_session');
          rq.onsuccess = () => {
            db.close();
            resolve(rq.result ? rq.result.value : null);
          };
          rq.onerror = () => {
            db.close();
            resolve(null);
          };
        } catch (_) {
          try { db.close(); } catch (__) {}
          resolve(null);
        }
      });
    } catch (_) {
      return null;
    }
  }

  async _initFromIndexedDB() {
    try {
      // 1. Проверяем URL hash / search на наличие OAuth токенов
      if (window.location.hash || window.location.search) {
        const hasAuth = await this._handleAuthUrlCallback(window.location.href);
        if (hasAuth && window.history && window.history.replaceState) {
          history.replaceState(null, document.title, window.location.pathname);
        }
      }

      // 2. Читаем сохранённую сессию из IndexedDB
      const sessionData = await this._getSessionFromIDB();

      if (sessionData && (sessionData.access_token || sessionData.user)) {
        // Мгновенно восстанавливаем пользователя для интерфейса
        this.session = sessionData;
        this.currentUser = sessionData.user || null;

        // Нормализуем expires_at (перевод секунд в миллисекунды при необходимости)
        let expiresAt = Number(sessionData.expires_at || 0);
        if (expiresAt > 0 && expiresAt < 10000000000) {
          expiresAt *= 1000;
          this.session.expires_at = expiresAt;
        }

        // Если токен истекает в ближайшие 2 минуты или уже истек — обновляем в фоне
        const isExpiringSoon = !expiresAt || (expiresAt - Date.now() < 120000);
        if (isExpiringSoon && sessionData.refresh_token) {
          this._refreshAccessToken(sessionData.refresh_token, sessionData).catch(e => {
            console.warn('[AuthController] Background token refresh warning:', e);
          });
        }
      }
    } catch (e) {
      console.warn('[AuthController] Session init error:', e);
    }
    this._notifyListeners();
    return this.currentUser;
  }

  async _handleAuthUrlCallback(url) {
    try {
      const hashIndex = url.indexOf('#');
      const queryIndex = url.indexOf('?');
      let paramsStr = '';
      if (hashIndex !== -1) {
        paramsStr = url.substring(hashIndex + 1);
      } else if (queryIndex !== -1) {
        paramsStr = url.substring(queryIndex + 1);
      }
      const params = new URLSearchParams(paramsStr);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const expiresIn = params.get('expires_in');

      if (accessToken) {
        const user = await this._fetchUserFromToken(accessToken);
        if (user) {
          const expMs = Date.now() + (parseInt(expiresIn || '3600', 10) * 1000);
          this.session = {
            access_token: accessToken,
            refresh_token: refreshToken || '',
            expires_at: expMs,
            user
          };
          this.currentUser = user;
          await this._saveSessionToIDB(this.session);
          this._notifyListeners();
          return true;
        }
      }
    } catch (e) {
      console.error('[AuthController] Auth callback parse error:', e);
    }
    return false;
  }

  async _fetchUserFromToken(token) {
    try {
      const res = await fetch(`${this.supabaseUrl}/auth/v1/user`, {
        headers: {
          'apikey': this.supabaseKey,
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) return await res.json();
    } catch (e) {
      console.error('[AuthController] Fetch user error:', e);
    }
    return null;
  }

  async _refreshAccessToken(refreshToken, fallbackSession = null) {
    if (!refreshToken) return false;
    try {
      const res = await fetch(`${this.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: {
          'apikey': this.supabaseKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ refresh_token: refreshToken })
      });

      if (res.ok) {
        const data = await res.json();
        let expiresAt = Date.now() + ((data.expires_in || 3600) * 1000);
        if (data.expires_at) {
          expiresAt = Number(data.expires_at) < 10000000000 ? Number(data.expires_at) * 1000 : Number(data.expires_at);
        }
        const user = data.user || (fallbackSession ? fallbackSession.user : this.currentUser);

        this.session = {
          access_token: data.access_token,
          refresh_token: data.refresh_token || refreshToken,
          expires_at: expiresAt,
          user: user
        };
        this.currentUser = user;
        await this._saveSessionToIDB(this.session);
        this._notifyListeners();
        return true;
      }

      // Очищаем сессию ТОЛЬКО при явном отклонении токена сервером (400/401)
      if (res.status === 400 || res.status === 401) {
        console.warn('[AuthController] Refresh token revoked or invalid, signing out');
        await this._clearSessionFromIDB();
        this.session = null;
        this.currentUser = null;
        this._notifyListeners();
        return false;
      }
    } catch (e) {
      // При сетевой ошибке (нет интернета, задержка) НЕ удаляем сессию из базы!
      console.warn('[AuthController] Network error during token refresh, retaining current session:', e);
      if (fallbackSession) {
        this.session = fallbackSession;
        this.currentUser = fallbackSession.user || this.currentUser;
      }
      return true;
    }
    return false;
  }

  onAuthStateChange(callback) {
    this._listeners.add(callback);
    callback(this.currentUser, this.session);
    return () => this._listeners.delete(callback);
  }

  _notifyListeners() {
    this._listeners.forEach(cb => {
      try { cb(this.currentUser, this.session); } catch (e) { console.error(e); }
    });
  }

  async getCurrentUser() {
    await this._initSessionPromise;
    return this.currentUser;
  }

  async getValidToken() {
    await this._initSessionPromise;
    if (!this.session) return null;
    if (this.session.expires_at && this.session.expires_at - Date.now() < 60000) {
      const ok = await this._refreshAccessToken(this.session.refresh_token);
      if (!ok) return null;
    }
    return this.session.access_token;
  }

  async updateProfile({ fullName, username, avatarUrl }) {
    const token = await this.getValidToken();
    if (!token) throw new Error('Требуется авторизация');

    const metaData = {
      ...(this.currentUser?.user_metadata || {})
    };
    if (fullName !== undefined) metaData.full_name = fullName.trim();
    if (username !== undefined) metaData.username = username.trim().replace(/^@+/, '');
    if (avatarUrl !== undefined) metaData.avatar_url = avatarUrl.trim();

    const payload = JSON.stringify({ data: metaData });
    const headers = {
      'apikey': this.supabaseKey,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    let res;
    try {
      res = await fetch(`${this.supabaseUrl}/auth/v1/user`, {
        method: 'PUT',
        headers,
        body: payload
      });
    } catch (netErr) {
      console.warn('[AuthController] Ошибка прямого PUT-запроса:', netErr);
      throw new Error('Сетевая ошибка при обновлении профиля: ' + (netErr.message || 'нет связи с сервером'));
    }

    let data = null;
    const rawText = await res.text();
    if (rawText && rawText.trim()) {
      try {
        data = JSON.parse(rawText);
      } catch (parseErr) {
        console.warn('[AuthController] Ответ сервера не является валидным JSON:', rawText);
      }
    }

    if (!res.ok) {
      const errMsg = (data && (data.message || data.error_description || data.msg || data.error)) ||
                     (rawText ? rawText.slice(0, 120) : `HTTP ${res.status} (${res.statusText})`);
      throw new Error(errMsg);
    }

    if (!data) {
      data = {
        ...(this.currentUser || {}),
        user_metadata: metaData
      };
    }

    this.currentUser = data;
    if (this.session) {
      this.session.user = data;
      await this._saveSessionToIDB(this.session);
    }
    this._notifyListeners();
    return this.currentUser;
  }

  // --- АВТОРИЗАЦИЯ И РЕГИСТРАЦИЯ ПО 6-ЗНАЧНОМУ EMAIL OTP-КОДУ ---

  async sendOtp(email, fullName = '', isSignUp = false) {
    const cleanEmail = email.trim().toLowerCase();
    const payload = {
      email: cleanEmail,
      create_user: true
    };
    if (fullName && fullName.trim()) {
      payload.data = { 
        full_name: fullName.trim(),
        username: fullName.trim().toLowerCase().replace(/[^a-z0-9_]/g, '')
      };
    }

    const res = await fetch(`${this.supabaseUrl}/auth/v1/otp`, {
      method: 'POST',
      headers: {
        'apikey': this.supabaseKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg = data.msg || data.error_description || data.message || 'Ошибка отправки кода на email';
      if (errMsg.includes('rate limit')) {
        throw new Error('Слишком много запросов. Подождите пару минут перед повторной отправкой');
      }
      throw new Error(errMsg);
    }
    return data;
  }

  async verifyOtp(email, token, mode = 'email') {
    const cleanEmail = email.trim().toLowerCase();
    const cleanToken = token.trim().replace(/\s+/g, '');

    // Проверяем типы токенов: 'email' -> 'signup' -> 'magiclink'
    const verificationTypes = mode === 'signup' ? ['signup', 'email', 'magiclink'] : ['email', 'signup', 'magiclink'];
    let lastError = 'Неверный или устаревший код подтверждения';
    let data = null;

    for (const type of verificationTypes) {
      try {
        const res = await fetch(`${this.supabaseUrl}/auth/v1/verify`, {
          method: 'POST',
          headers: {
            'apikey': this.supabaseKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            type,
            email: cleanEmail,
            token: cleanToken
          })
        });

        const resData = await res.json().catch(() => ({}));
        if (res.ok && resData.access_token && resData.user) {
          data = resData;
          break;
        } else {
          lastError = resData.msg || resData.error_description || resData.message || lastError;
        }
      } catch (e) {
        lastError = e.message || lastError;
      }
    }

    if (!data) {
      throw new Error(lastError);
    }

    let expiresAt = Date.now() + ((data.expires_in || 3600) * 1000);
    if (data.expires_at) {
      expiresAt = Number(data.expires_at) < 10000000000 ? Number(data.expires_at) * 1000 : Number(data.expires_at);
    }

    this.session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: expiresAt,
      user: data.user
    };
    this.currentUser = data.user;
    await this._saveSessionToIDB(this.session);
    this._notifyListeners();

    return data;
  }

  async signUpWithEmail(email, password, fullName = '') {
    return await this.sendOtp(email, fullName);
  }

  async signInWithEmail(email, password) {
    return await this.sendOtp(email);
  }

  // --- GOOGLE OAUTH БЕЗ БЛОКИРОВКИ WEBVIEW ---

  async signInWithGoogle() {
    const redirectUrl = 'https://wciqrfxsittcaxlewpwu.supabase.co/auth/v1/callback';
    const authUrl = `${this.supabaseUrl}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectUrl)}`;

    // 1. Electron Desktop — безопасный нативный popup с чистым Chrome UA
    if (window.electronAPI && typeof window.electronAPI.authGoogle === 'function') {
      const returnUrl = await window.electronAPI.authGoogle(authUrl);
      if (returnUrl) {
        const ok = await this._handleAuthUrlCallback(returnUrl);
        if (ok && window.toast) window.toast(`Вход выполнен: ${this.currentUser?.email || ''}`, 'ok');
        return ok;
      }
      return false;
    }

    // 2. Mobile WebView (Capacitor Android / iOS)
    const isCapacitorNative = window.Capacitor && (typeof window.Capacitor.isNativePlatform === 'function' ? window.Capacitor.isNativePlatform() : window.Capacitor.isNative);
    if (isCapacitorNative) {
      if (window.Capacitor.Plugins && window.Capacitor.Plugins.Browser && typeof window.Capacitor.Plugins.Browser.open === 'function') {
        try {
          await window.Capacitor.Plugins.Browser.open({ url: authUrl, windowName: '_system' });
          return;
        } catch (_) {}
      }
      window.open(authUrl, '_system');
      return;
    }

    // 3. Web Browser Popup
    const popup = window.open(authUrl, 'google_auth_window', 'width=520,height=680,menubar=no,toolbar=no');
    if (!popup) {
      window.location.href = authUrl;
      return;
    }

    const timer = setInterval(async () => {
      try {
        if (popup.closed) {
          clearInterval(timer);
          return;
        }
        if (popup.location && popup.location.href && popup.location.href.includes('access_token=')) {
          const cbUrl = popup.location.href;
          clearInterval(timer);
          popup.close();
          const ok = await this._handleAuthUrlCallback(cbUrl);
          if (ok && window.toast) window.toast(`Вход выполнен: ${this.currentUser?.email || ''}`, 'ok');
        }
      } catch (e) {
        // Cross-origin до момента редиректа на callback — игнорируем
      }
    }, 350);
  }

  async signOut() {
    const token = this.session?.access_token;
    if (token) {
      try {
        await fetch(`${this.supabaseUrl}/auth/v1/logout`, {
          method: 'POST',
          headers: {
            'apikey': this.supabaseKey,
            'Authorization': `Bearer ${token}`
          }
        });
      } catch (e) {
        console.warn('[AuthController] SignOut remote error:', e);
      }
    }
    await this._clearSessionFromIDB();
    this.session = null;
    this.currentUser = null;
    this._notifyListeners();
  }
}

window.authController = new AuthController();