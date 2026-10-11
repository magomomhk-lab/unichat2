/**
 * AETHER MEDIA ENGINE
 * Pure Vanilla Object-Oriented Client Architecture (Electron / Capacitor / Web)
 * Strict IndexedDB persistence layer (No localStorage/sessionStorage)
 * YouTube IFrame Player API & YouTube Data API v3 integration
 */

/* ==========================================================================
   1. DatabaseController: Pure IndexedDB (No localStorage/sessionStorage)
   ========================================================================== */
class DatabaseController {
  constructor(dbName = 'AetherMediaDB', version = 2) {
    this.dbName = dbName;
    this.version = version;
    this.db = null;
  }

  async init() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('history')) {
          const historyStore = db.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
          historyStore.createIndex('timestamp', 'timestamp', { unique: false });
          historyStore.createIndex('url', 'url', { unique: false });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('IndexedDB init failure:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  async addHistory(item) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('history', 'readwrite');
      const store = tx.objectStore('history');
      const record = {
        ...item,
        timestamp: Date.now()
      };
      const request = store.add(record);

      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async getHistory(limit = 24) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('history', 'readonly');
      const store = tx.objectStore('history');
      const index = store.index('timestamp');
      const items = [];

      const cursorRequest = index.openCursor(null, 'prev');

      cursorRequest.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor && items.length < limit) {
          items.push(cursor.value);
          cursor.continue();
        } else {
          resolve(items);
        }
      };

      cursorRequest.onerror = (e) => reject(e.target.error);
    });
  }

  async deleteHistoryItem(id) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('history', 'readwrite');
      const store = tx.objectStore('history');
      const request = store.delete(Number(id));

      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async clearHistory() {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('history', 'readwrite');
      const store = tx.objectStore('history');
      const request = store.clear();

      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async getSetting(key) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('settings', 'readonly');
      const store = tx.objectStore('settings');
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result ? request.result.value : null);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async setSetting(key, value) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('settings', 'readwrite');
      const store = tx.objectStore('settings');
      const request = store.put({ key, value });

      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  }
}

/* ==========================================================================
   2. YouTubeIframeManager: YouTube IFrame Player API Client Engine
   ========================================================================== */
class YouTubeIframeManager {
  constructor(containerId, callbacks = {}) {
    this.containerId = containerId;
    this.callbacks = callbacks;
    this.player = null;
    this.isReady = false;
    this.apiReadyPromise = null;
    this.progressTimer = null;
  }

  loadApi() {
    if (this.apiReadyPromise) return this.apiReadyPromise;

    this.apiReadyPromise = new Promise((resolve) => {
      if (window.YT && window.YT.Player) {
        resolve(window.YT);
        return;
      }

      const existingTag = document.getElementById('youtube-iframe-api-script');
      if (!existingTag) {
        const tag = document.createElement('script');
        tag.id = 'youtube-iframe-api-script';
        tag.src = 'https://www.youtube.com/iframe_api';
        const firstScript = document.getElementsByTagName('script')[0];
        firstScript.parentNode.insertBefore(tag, firstScript);
      }

      const checkInterval = setInterval(() => {
        if (window.YT && window.YT.Player) {
          clearInterval(checkInterval);
          resolve(window.YT);
        }
      }, 50);

      const prevCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        clearInterval(checkInterval);
        if (typeof prevCallback === 'function') prevCallback();
        resolve(window.YT);
      };
    });

    return this.apiReadyPromise;
  }

  async createPlayer(videoId = null, playlistId = null) {
    await this.loadApi();

    return new Promise((resolve) => {
      this.destroy();

      // Гарантируем восстановление DOM-узла монтирования, если предыдущий iframe был уничтожен
      const containerParent = document.getElementById('yt-player-container');
      if (containerParent) {
        containerParent.innerHTML = `<div id="${this.containerId}"></div>`;
      }

      // В среде Electron (app://) и Capacitor (capacitor://) передаем валидный веб-origin https://www.youtube.com
      const safeOrigin = (window.location.protocol.startsWith('http'))
        ? window.location.origin
        : 'https://www.youtube.com';

      const playerVars = {
        autoplay: 1,
        playsinline: 1,
        rel: 0,
        modestbranding: 1,
        enablejsapi: 1,
        origin: safeOrigin
      };

      if (playlistId && !videoId) {
        playerVars.listType = 'playlist';
        playerVars.list = playlistId;
      }

      const playerOptions = {
        width: '100%',
        height: '100%',
        host: 'https://www.youtube.com',
        playerVars: playerVars,
        events: {
          onReady: (event) => {
            this.isReady = true;
            this.startProgressPolling();
            if (this.callbacks.onReady) this.callbacks.onReady(event);
            resolve(this.player);
          },
          onStateChange: (event) => {
            if (this.callbacks.onStateChange) this.callbacks.onStateChange(event);
          },
          onPlaybackRateChange: (event) => {
            if (this.callbacks.onPlaybackRateChange) this.callbacks.onPlaybackRateChange(event);
          },
          onError: (event) => {
            if (this.callbacks.onError) this.callbacks.onError(event);
          },
          onAutoplayBlocked: (event) => {
            if (this.callbacks.onAutoplayBlocked) this.callbacks.onAutoplayBlocked(event);
          }
        }
      };

      if (videoId) {
        playerOptions.videoId = videoId;
      }

      this.player = new window.YT.Player(this.containerId, playerOptions);
    });
  }

  startProgressPolling() {
    this.stopProgressPolling();
    this.progressTimer = setInterval(() => {
      if (!this.player || !this.isReady) return;
      try {
        const currentTime = typeof this.player.getCurrentTime === 'function' ? this.player.getCurrentTime() : 0;
        const duration = typeof this.player.getDuration === 'function' ? this.player.getDuration() : 0;
        const loadedFraction = typeof this.player.getVideoLoadedFraction === 'function' ? this.player.getVideoLoadedFraction() : 0;
        
        if (this.callbacks.onProgress) {
          this.callbacks.onProgress({ currentTime, duration, loadedFraction });
        }
      } catch (err) {
        // Suppress polling race errors
      }
    }, 250);
  }

  stopProgressPolling() {
    if (this.progressTimer) {
      clearInterval(this.progressTimer);
      this.progressTimer = null;
    }
  }

  play() {
    if (this.player && this.player.playVideo) this.player.playVideo();
  }

  pause() {
    if (this.player && this.player.pauseVideo) this.player.pauseVideo();
  }

  stop() {
    if (this.player && this.player.stopVideo) this.player.stopVideo();
  }

  seekTo(seconds, allowSeekAhead = true) {
    if (this.player && this.player.seekTo) {
      this.player.seekTo(seconds, allowSeekAhead);
    }
  }

  setVolume(volume) {
    if (this.player && this.player.setVolume) {
      this.player.setVolume(Math.max(0, Math.min(100, volume)));
    }
  }

  getVolume() {
    return this.player && this.player.getVolume ? this.player.getVolume() : 100;
  }

  mute() {
    if (this.player && this.player.mute) this.player.mute();
  }

  unMute() {
    if (this.player && this.player.unMute) this.player.unMute();
  }

  isMuted() {
    return this.player && this.player.isMuted ? this.player.isMuted() : false;
  }

  setPlaybackRate(rate) {
    if (this.player && this.player.setPlaybackRate) {
      this.player.setPlaybackRate(rate);
    }
  }

  getAvailablePlaybackRates() {
    return this.player && this.player.getAvailablePlaybackRates ? this.player.getAvailablePlaybackRates() : [1];
  }

  nextVideo() {
    if (this.player && this.player.nextVideo) this.player.nextVideo();
  }

  previousVideo() {
    if (this.player && this.player.previousVideo) this.player.previousVideo();
  }

  setLoop(loop) {
    if (this.player && this.player.setLoop) this.player.setLoop(Boolean(loop));
  }

  setShuffle(shuffle) {
    if (this.player && this.player.setShuffle) this.player.setShuffle(Boolean(shuffle));
  }

  loadVideoById(opts) {
    if (this.player && this.player.loadVideoById) {
      this.player.loadVideoById(opts);
    }
  }

  loadPlaylist(opts) {
    if (this.player && this.player.loadPlaylist) {
      this.player.loadPlaylist(opts);
    }
  }

  destroy() {
    this.stopProgressPolling();
    if (this.player && typeof this.player.destroy === 'function') {
      try {
        this.player.destroy();
      } catch (e) {
        console.warn('Destroy player error:', e);
      }
    }
    this.player = null;
    this.isReady = false;
  }
}

/* ==========================================================================
   3. YouTubeDataAPI: REST API v3 Integration Client
   ========================================================================== */
class YouTubeDataAPI {
  constructor(apiKeyProvider) {
    this.apiKeyProvider = apiKeyProvider;
    this.baseUrl = 'https://www.googleapis.com/youtube/v3';
  }

  async getKey() {
    return typeof this.apiKeyProvider === 'function' ? await this.apiKeyProvider() : null;
  }

  async search(query, maxResults = 12) {
    const apiKey = await this.getKey();
    if (!apiKey) {
      throw new Error('API ключ YouTube не настроен');
    }

    const params = new URLSearchParams({
      part: 'snippet',
      maxResults: String(maxResults),
      q: query.trim(),
      type: 'video,playlist',
      key: apiKey
    });

    const res = await fetch(`${this.baseUrl}/search?${params.toString()}`);
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      const msg = errJson.error ? errJson.error.message : `HTTP Error ${res.status}`;
      throw new Error(`Ошибка YouTube Data API: ${msg}`);
    }

    const data = await res.json();
    return (data.items || []).map(item => ({
      id: item.id.videoId || item.id.playlistId,
      kind: item.id.kind.includes('playlist') ? 'playlist' : 'video',
      title: item.snippet.title,
      description: item.snippet.description,
      channelTitle: item.snippet.channelTitle,
      publishedAt: item.snippet.publishedAt,
      thumbnail: (item.snippet.thumbnails.medium || item.snippet.thumbnails.default || {}).url
    }));
  }

  async getVideoDetails(videoId) {
    const apiKey = await this.getKey();
    if (!apiKey) return null;

    try {
      const params = new URLSearchParams({
        part: 'snippet,contentDetails,statistics',
        id: videoId,
        key: apiKey
      });

      const res = await fetch(`${this.baseUrl}/videos?${params.toString()}`);
      if (!res.ok) return null;

      const data = await res.json();
      if (data.items && data.items.length > 0) {
        const item = data.items[0];
        return {
          title: item.snippet.title,
          channelTitle: item.snippet.channelTitle,
          description: item.snippet.description,
          viewCount: item.statistics ? item.statistics.viewCount : null,
          duration: item.contentDetails ? item.contentDetails.duration : null,
          thumbnail: (item.snippet.thumbnails.high || item.snippet.thumbnails.default || {}).url
        };
      }
    } catch {
      return null;
    }
    return null;
  }

  async validateKey(testKey) {
    if (!testKey || typeof testKey !== 'string') return false;
    const params = new URLSearchParams({
      part: 'snippet',
      maxResults: '1',
      q: 'Google',
      type: 'video',
      key: testKey.trim()
    });

    const res = await fetch(`${this.baseUrl}/search?${params.toString()}`);
    return res.ok;
  }
}

/* ==========================================================================
   4. VideoParser: Universal Source Identifier
   ========================================================================== */
class VideoParser {
  static parse(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') {
      throw new Error('Указан пустой или неверный запрос');
    }

    const clean = rawUrl.trim();

    // YouTube Playlist pattern
    const ytPlaylistRegex = /[?&]list=([a-zA-Z0-9_-]+)/i;
    const playlistMatch = clean.match(ytPlaylistRegex);

    // YouTube Video pattern (поддерживает watch, embed, shorts, live, music.youtube.com и любые параметры)
    const ytVideoRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts|live)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
    const ytVideoMatch = clean.match(ytVideoRegex);

    // 11-значный прямой videoId
    const isDirectId = /^[a-zA-Z0-9_-]{11}$/.test(clean);

    if (playlistMatch && !ytVideoMatch && !isDirectId) {
      const listId = playlistMatch[1];
      return {
        type: 'youtube_playlist',
        provider: 'YouTube Playlist',
        playlistId: listId,
        title: `YouTube Playlist (${listId})`,
        sourceUrl: clean
      };
    }

    if (ytVideoMatch || isDirectId) {
      const videoId = isDirectId ? clean : ytVideoMatch[1];
      const listId = playlistMatch ? playlistMatch[1] : null;
      return {
        type: 'youtube',
        provider: 'YouTube',
        videoId: videoId,
        playlistId: listId,
        title: `YouTube Video (${videoId})`,
        sourceUrl: clean.startsWith('http') ? clean : `https://youtu.be/${videoId}`
      };
    }

    // Rutube regex pattern
    const rutubeRegex = /(?:rutube\.ru\/(?:video|play\/embed|shorts)\/)([a-zA-Z0-9]+)/i;
    const rutubeMatch = clean.match(rutubeRegex);

    if (rutubeMatch && rutubeMatch[1]) {
      const videoId = rutubeMatch[1];
      return {
        type: 'rutube',
        provider: 'Rutube',
        videoId: videoId,
        embedUrl: `https://rutube.ru/play/embed/${videoId}/?autoPlay=1`,
        title: `Rutube Video (${videoId})`,
        sourceUrl: clean
      };
    }

    // VK Video regex pattern
    const vkRegex = /(?:vk\.com|vkvideo\.ru)\/(?:video|clip)(-?\d+_\d+)/i;
    const vkMatch = clean.match(vkRegex);

    if (vkMatch && vkMatch[1]) {
      const videoId = vkMatch[1];
      const [oid, id] = videoId.split('_');
      return {
        type: 'vk',
        provider: 'VK Video',
        videoId: videoId,
        embedUrl: `https://vk.com/video_ext.php?oid=${oid}&id=${id}&autoplay=1`,
        title: `VK Video (${videoId})`,
        sourceUrl: clean
      };
    }

    // Vimeo regex pattern
    const vimeoRegex = /(?:vimeo\.com\/)(\d+)/i;
    const vimeoMatch = clean.match(vimeoRegex);

    if (vimeoMatch && vimeoMatch[1]) {
      return {
        type: 'vimeo',
        provider: 'Vimeo',
        videoId: vimeoMatch[1],
        embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1`,
        title: `Vimeo Stream (${vimeoMatch[1]})`,
        sourceUrl: clean
      };
    }

    // Direct Video files (.mp4, .webm, .ogg, .mov)
    const directRegex = /\.(mp4|webm|ogg|mov)(\?.*)?$/i;
    if (directRegex.test(clean)) {
      const filename = clean.split('/').pop().split('?')[0];
      return {
        type: 'direct',
        provider: 'Direct Stream',
        videoId: filename,
        embedUrl: clean,
        title: decodeURIComponent(filename),
        sourceUrl: clean
      };
    }

    // Check if it's a URL
    if (/^https?:\/\//i.test(clean)) {
      try {
        const parsed = new URL(clean);
        return {
          type: 'generic',
          provider: parsed.hostname,
          videoId: parsed.pathname,
          embedUrl: clean,
          title: `${parsed.hostname}${parsed.pathname}`,
          sourceUrl: clean
        };
      } catch {}
    }

    // Text search query fallback for Data API
    return {
      type: 'search_query',
      query: clean
    };
  }
}

/* ==========================================================================
   3. UIState & Notification System
   ========================================================================== */
class UIState {
  constructor() {
    this.toastContainer = document.getElementById('toast-container');
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.setAttribute('role', 'status');

    toast.innerHTML = `
      <div class="toast-icon" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
      </div>
      <div class="toast-message">${this.escapeHTML(message)}</div>
    `;

    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-out');
      toast.addEventListener('animationend', () => toast.remove());
    }, 3200);
  }

  escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
      tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      }[tag] || tag)
    );
  }
}

/* ==========================================================================
   5. AppController: Core Application Coordinator
   ========================================================================== */
class AppController {
  constructor() {
    this.db = new DatabaseController();
    this.ui = new UIState();
    this.ytDataApi = new YouTubeDataAPI(() => this.db.getSetting('yt_api_key'));

    // DOM References
    this.mediaForm = document.getElementById('media-form');
    this.mediaInput = document.getElementById('media-url-input');
    this.btnSubmit = document.getElementById('btn-submit');
    this.btnPaste = document.getElementById('btn-paste');
    this.btnClearHistory = document.getElementById('btn-clear-history');
    this.btnOpenSettings = document.getElementById('btn-open-settings');
    this.btnCloseSettings = document.getElementById('btn-close-settings');
    this.settingsModal = document.getElementById('settings-modal');
    this.apiKeyInput = document.getElementById('yt-api-key-input');
    this.btnSaveKey = document.getElementById('btn-save-key');
    this.btnTestKey = document.getElementById('btn-test-key');
    this.btnToggleKeyVis = document.getElementById('btn-toggle-key-visibility');
    this.keyStatusIndicator = document.getElementById('key-status-indicator');

    this.searchResultsSection = document.getElementById('search-results-section');
    this.searchResultsCounter = document.getElementById('search-results-counter');
    this.searchGrid = document.getElementById('search-grid');
    this.btnCloseSearch = document.getElementById('btn-close-search');

    this.stageCard = document.getElementById('stage-card');
    this.viewportFrame = document.getElementById('viewport-frame');
    this.viewportPlaceholder = document.getElementById('viewport-placeholder');
    this.ytMountWrapper = document.getElementById('yt-player-container');
    this.mediaSlot = document.getElementById('media-slot');
    this.activeTitle = document.getElementById('active-video-title');
    this.statusIndicator = document.getElementById('playback-status-indicator');
    this.engineStatusTag = document.getElementById('engine-status-tag');

    // Controls
    this.btnToggleAspect = document.getElementById('btn-toggle-aspect');
    this.btnFullscreen = document.getElementById('btn-fullscreen');
    this.deckScrubber = document.getElementById('deck-scrubber');
    this.scrubberProgress = document.getElementById('scrubber-progress');
    this.scrubberLoaded = document.getElementById('scrubber-loaded');
    this.scrubberThumb = document.getElementById('scrubber-thumb');
    this.btnCtrlPlay = document.getElementById('btn-ctrl-play');
    this.iconPlay = this.btnCtrlPlay.querySelector('.icon-play');
    this.iconPause = this.btnCtrlPlay.querySelector('.icon-pause');
    this.btnCtrlStop = document.getElementById('btn-ctrl-stop');
    this.btnCtrlPrev = document.getElementById('btn-ctrl-prev');
    this.btnCtrlNext = document.getElementById('btn-ctrl-next');
    this.btnCtrlMute = document.getElementById('btn-ctrl-mute');
    this.iconVolHigh = this.btnCtrlMute.querySelector('.icon-volume-high');
    this.iconVolMuted = this.btnCtrlMute.querySelector('.icon-volume-muted');
    this.volumeRange = document.getElementById('volume-range');
    this.timeCurrent = document.getElementById('time-current');
    this.timeDuration = document.getElementById('time-duration');
    this.btnCtrlSpeed = document.getElementById('btn-ctrl-speed');
    this.currentSpeedLabel = document.getElementById('current-speed-label');
    this.rateDropdown = document.getElementById('rate-dropdown');
    this.btnCtrlLoop = document.getElementById('btn-ctrl-loop');
    this.btnCtrlShuffle = document.getElementById('btn-ctrl-shuffle');

    this.historyGrid = document.getElementById('history-grid');
    this.historyEmpty = document.getElementById('history-empty');
    this.historyCounter = document.getElementById('history-counter');

    // State
    this.activeMode = 'none'; // 'youtube', 'direct', 'iframe'
    this.isLooping = false;
    this.isShuffled = false;
    this.currentDuration = 0;
    this.directVideoElement = null;

    // YouTube IFrame Manager
    this.ytManager = new YouTubeIframeManager('yt-player-mount', {
      onReady: (event) => this.handleYTReady(event),
      onStateChange: (event) => this.handleYTStateChange(event),
      onPlaybackRateChange: (event) => this.handleYTRateChange(event),
      onError: (event) => this.handleYTError(event),
      onAutoplayBlocked: (event) => this.handleYTAutoplayBlocked(event),
      onProgress: (prog) => this.handleYTProgress(prog)
    });

    this.init();
  }

  async init() {
    this.bindEvents();
    try {
      await this.db.init();
      await this.renderHistory();
    } catch (err) {
      this.ui.showToast('Ошибка инициализации локального хранилища');
    }
  }

  bindEvents() {
    this.mediaForm.addEventListener('submit', (e) => this.handleFormSubmit(e));
    this.btnPaste.addEventListener('click', () => this.handleClipboardPaste());
    this.btnClearHistory.addEventListener('click', () => this.handleClearHistory());
    this.btnToggleAspect.addEventListener('click', () => this.toggleAspectRatio());
    this.btnFullscreen.addEventListener('click', () => this.toggleFullscreen());

    // Settings Modal
    this.btnOpenSettings.addEventListener('click', () => this.openSettings());
    this.btnCloseSettings.addEventListener('click', () => this.settingsModal.close());
    this.btnSaveKey.addEventListener('click', () => this.saveApiKey());
    this.btnTestKey.addEventListener('click', () => this.testApiKey());
    this.btnToggleKeyVis.addEventListener('click', () => {
      this.apiKeyInput.type = this.apiKeyInput.type === 'password' ? 'text' : 'password';
    });

    // Search Drawer
    this.btnCloseSearch.addEventListener('click', () => {
      this.searchResultsSection.style.display = 'none';
    });

    this.searchGrid.addEventListener('click', (e) => {
      const card = e.target.closest('.search-card');
      if (card) {
        const id = card.dataset.id;
        const kind = card.dataset.kind;
        const url = kind === 'playlist' ? `https://www.youtube.com/playlist?list=${id}` : `https://youtu.be/${id}`;
        this.playSource(url);
        this.searchResultsSection.scrollIntoView({ behavior: 'smooth' });
      }
    });

    // Player Deck Controls
    this.btnCtrlPlay.addEventListener('click', () => this.togglePlayPause());
    this.btnCtrlStop.addEventListener('click', () => this.stopPlayback());
    this.btnCtrlPrev.addEventListener('click', () => this.prevTrack());
    this.btnCtrlNext.addEventListener('click', () => this.nextTrack());
    this.btnCtrlMute.addEventListener('click', () => this.toggleMute());
    this.volumeRange.addEventListener('input', (e) => this.handleVolumeChange(Number(e.target.value)));

    // Speed Controls
    this.btnCtrlSpeed.addEventListener('click', (e) => {
      e.stopPropagation();
      this.rateDropdown.style.display = this.rateDropdown.style.display === 'none' ? 'flex' : 'none';
    });
    document.addEventListener('click', () => {
      this.rateDropdown.style.display = 'none';
    });
    this.rateDropdown.addEventListener('click', (e) => {
      const opt = e.target.closest('.rate-opt');
      if (opt) {
        const rate = parseFloat(opt.dataset.rate);
        this.setPlaybackSpeed(rate);
      }
    });

    // Loop & Shuffle
    this.btnCtrlLoop.addEventListener('click', () => this.toggleLoop());
    this.btnCtrlShuffle.addEventListener('click', () => this.toggleShuffle());

    // Scrubber Dragging
    this.deckScrubber.addEventListener('pointerdown', (e) => this.handleScrubberInteraction(e));

    // History Actions
    this.historyGrid.addEventListener('click', (e) => {
      const playBtn = e.target.closest('[data-action="play"]');
      const deleteBtn = e.target.closest('[data-action="delete"]');

      if (playBtn) {
        const url = playBtn.dataset.url;
        this.playSource(url);
      } else if (deleteBtn) {
        const id = deleteBtn.dataset.id;
        this.deleteHistoryEntry(id);
      }
    });

    // Keyboard Hotkeys
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.mediaInput.focus();
      } else if (e.code === 'Space') {
        e.preventDefault();
        this.togglePlayPause();
      } else if (e.key.toLowerCase() === 'm') {
        this.toggleMute();
      } else if (e.key.toLowerCase() === 'f') {
        this.toggleFullscreen();
      } else if (e.key === 'ArrowLeft') {
        this.seekRelative(-5);
      } else if (e.key === 'ArrowRight') {
        this.seekRelative(5);
      }
    });
  }

  async handleFormSubmit(e) {
    e.preventDefault();
    const query = this.mediaInput.value.trim();

    if (!query) {
      this.ui.showToast('Введите URL или поисковый запрос');
      return;
    }

    this.setLoading(true);

    try {
      const parsed = VideoParser.parse(query);
      if (parsed.type === 'search_query') {
        await this.performYouTubeSearch(parsed.query);
      } else {
        await this.playSource(query, parsed);
        this.mediaInput.value = '';
      }
    } catch (err) {
      this.ui.showToast(err.message || 'Не удалось обработать запрос');
    } finally {
      this.setLoading(false);
    }
  }

  async performYouTubeSearch(query) {
    try {
      const results = await this.ytDataApi.search(query);
      this.renderSearchResults(results);
      this.ui.showToast(`Найдено результатов: ${results.length}`);
    } catch (err) {
      this.ui.showToast(err.message);
      // Fallback: If no API key, give guidance
      const key = await this.db.getSetting('yt_api_key');
      if (!key) {
        this.openSettings();
      }
    }
  }

  renderSearchResults(results) {
    this.searchResultsCounter.textContent = results.length;
    if (results.length === 0) {
      this.searchResultsSection.style.display = 'none';
      return;
    }

    this.searchGrid.innerHTML = results.map(item => `
      <article class="search-card" data-id="${this.ui.escapeHTML(item.id)}" data-kind="${this.ui.escapeHTML(item.kind)}">
        <div class="search-thumb-wrap">
          <img class="search-thumb" src="${this.ui.escapeHTML(item.thumbnail)}" alt="${this.ui.escapeHTML(item.title)}" loading="lazy" />
        </div>
        <div class="search-card-meta">
          <h4 class="search-card-title">${this.ui.escapeHTML(item.title)}</h4>
          <span class="search-card-channel">${this.ui.escapeHTML(item.channelTitle)}</span>
          <span class="search-card-published">${item.publishedAt ? new Date(item.publishedAt).toLocaleDateString() : ''}</span>
        </div>
      </article>
    `).join('');

    this.searchResultsSection.style.display = 'flex';
    this.searchResultsSection.scrollIntoView({ behavior: 'smooth' });
  }

  async playSource(rawUrl, parsedMeta = null) {
    const meta = parsedMeta || VideoParser.parse(rawUrl);

    if (meta.type === 'search_query') {
      await this.performYouTubeSearch(meta.query);
      return;
    }

    this.viewportPlaceholder.style.display = 'none';

    if (meta.type === 'youtube' || meta.type === 'youtube_playlist') {
      this.activeMode = 'youtube';
      this.mediaSlot.classList.remove('has-content');
      this.mediaSlot.innerHTML = '';
      this.ytMountWrapper.classList.add('active');
      this.engineStatusTag.textContent = 'YOUTUBE IFRAME API';

      // Fetch enriched title from Data API if available
      if (meta.videoId) {
        this.ytDataApi.getVideoDetails(meta.videoId).then(details => {
          if (details && details.title) {
            this.activeTitle.textContent = details.title;
            meta.title = details.title;
          }
        });
      }

      if (!this.ytManager.player) {
        await this.ytManager.createPlayer(meta.videoId, meta.playlistId);
      } else {
        if (meta.type === 'youtube_playlist') {
          this.ytManager.loadPlaylist({
            listType: 'playlist',
            list: meta.playlistId,
            index: 0
          });
        } else {
          this.ytManager.loadVideoById({ videoId: meta.videoId });
        }
      }
    } else {
      // Direct video or Third-Party embed
      this.ytManager.destroy();
      this.ytMountWrapper.classList.remove('active');
      this.mediaSlot.classList.add('has-content');
      this.mediaSlot.innerHTML = '';

      if (meta.type === 'direct') {
        this.activeMode = 'direct';
        this.engineStatusTag.textContent = 'HTML5 MEDIA';
        const video = document.createElement('video');
        video.src = meta.embedUrl;
        video.autoplay = true;
        video.playsInline = true;
        this.directVideoElement = video;
        this.bindDirectVideoEvents(video);
        this.mediaSlot.appendChild(video);
      } else {
        this.activeMode = 'iframe';
        this.engineStatusTag.textContent = meta.provider.toUpperCase();
        const iframe = document.createElement('iframe');
        iframe.src = meta.embedUrl;
        iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
        iframe.setAttribute('allowfullscreen', 'true');
        iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
        this.mediaSlot.appendChild(iframe);
      }
    }

    this.activeTitle.textContent = meta.title;
    this.statusIndicator.classList.add('active');
    this.stageCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Save to IndexedDB
    try {
      await this.db.addHistory({
        provider: meta.provider,
        title: meta.title,
        url: meta.sourceUrl
      });
      await this.renderHistory();
      this.ui.showToast(`Воспроизведение: ${meta.provider}`);
    } catch (err) {
      console.warn('History save failure:', err);
    }
  }

  bindDirectVideoEvents(video) {
    video.addEventListener('timeupdate', () => {
      const cur = video.currentTime || 0;
      const dur = video.duration || 0;
      this.handleYTProgress({
        currentTime: cur,
        duration: dur,
        loadedFraction: video.buffered.length > 0 ? video.buffered.end(video.buffered.length - 1) / dur : 0
      });
    });

    video.addEventListener('play', () => this.updatePlayState(true));
    video.addEventListener('pause', () => this.updatePlayState(false));
    video.addEventListener('ended', () => this.updatePlayState(false));
  }

  handleYTReady(event) {
    this.setVolumeUI(this.ytManager.getVolume());
    this.updatePlayState(true);
  }

  handleYTStateChange(event) {
    const state = event.data;
    if (window.YT) {
      if (state === window.YT.PlayerState.PLAYING) {
        this.updatePlayState(true);
        this.statusIndicator.classList.add('active');
      } else if (state === window.YT.PlayerState.PAUSED || state === window.YT.PlayerState.ENDED) {
        this.updatePlayState(false);
      } else if (state === window.YT.PlayerState.BUFFERING) {
        this.statusIndicator.classList.remove('active');
      }
    }
  }

  handleYTRateChange(event) {
    const rate = event.data;
    this.currentSpeedLabel.textContent = `${rate}x`;
    this.rateDropdown.querySelectorAll('.rate-opt').forEach(btn => {
      btn.classList.toggle('active', parseFloat(btn.dataset.rate) === rate);
    });
  }

  handleYTError(event) {
    const code = event.data;
    const errors = {
      2: 'Недопустимый параметр ID видео',
      5: 'Ошибка HTML5 проигрывателя',
      100: 'Видео не найдено или удалено',
      101: 'Встраивание запрещено правообладателем',
      150: 'Встраивание запрещено правообладателем'
    };
    this.ui.showToast(errors[code] || `Ошибка воспроизведения (${code})`);
  }

  handleYTAutoplayBlocked() {
    this.ui.showToast('Автовоспроизведение заблокировано политикой браузера. Нажмите Play.');
    this.updatePlayState(false);
  }

  handleYTProgress({ currentTime, duration, loadedFraction }) {
    this.currentDuration = duration || 0;
    const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
    const loadPct = Math.min(100, Math.max(0, loadedFraction * 100));

    this.scrubberProgress.style.width = `${pct}%`;
    this.scrubberLoaded.style.width = `${loadPct}%`;
    this.scrubberThumb.style.left = `${pct}%`;

    this.deckScrubber.setAttribute('aria-valuenow', Math.round(pct));
    this.timeCurrent.textContent = this.formatSeconds(currentTime);
    this.timeDuration.textContent = this.formatSeconds(duration);
  }

  handleScrubberInteraction(e) {
    const rect = this.deckScrubber.getBoundingClientRect();
    const calculatePct = (clientX) => {
      const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
      return x / rect.width;
    };

    const targetPct = calculatePct(e.clientX);
    const targetSeconds = targetPct * this.currentDuration;

    if (this.activeMode === 'youtube') {
      this.ytManager.seekTo(targetSeconds, true);
    } else if (this.activeMode === 'direct' && this.directVideoElement) {
      this.directVideoElement.currentTime = targetSeconds;
    }

    const onPointerMove = (moveEvent) => {
      const pct = calculatePct(moveEvent.clientX);
      this.scrubberProgress.style.width = `${pct * 100}%`;
      this.scrubberThumb.style.left = `${pct * 100}%`;
    };

    const onPointerUp = (upEvent) => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      const finalPct = calculatePct(upEvent.clientX);
      const finalSec = finalPct * this.currentDuration;
      if (this.activeMode === 'youtube') {
        this.ytManager.seekTo(finalSec, true);
      } else if (this.activeMode === 'direct' && this.directVideoElement) {
        this.directVideoElement.currentTime = finalSec;
      }
    };

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
  }

  togglePlayPause() {
    if (this.activeMode === 'youtube') {
      if (this.iconPlay.style.display === 'none') {
        this.ytManager.pause();
      } else {
        this.ytManager.play();
      }
    } else if (this.activeMode === 'direct' && this.directVideoElement) {
      if (this.directVideoElement.paused) {
        this.directVideoElement.play();
      } else {
        this.directVideoElement.pause();
      }
    }
  }

  stopPlayback() {
    if (this.activeMode === 'youtube') {
      this.ytManager.stop();
    } else if (this.activeMode === 'direct' && this.directVideoElement) {
      this.directVideoElement.pause();
      this.directVideoElement.currentTime = 0;
    }
    this.updatePlayState(false);
  }

  seekRelative(deltaSeconds) {
    if (this.activeMode === 'youtube' && this.ytManager.player && this.ytManager.player.getCurrentTime) {
      const cur = this.ytManager.player.getCurrentTime();
      this.ytManager.seekTo(Math.max(0, cur + deltaSeconds), true);
    } else if (this.activeMode === 'direct' && this.directVideoElement) {
      this.directVideoElement.currentTime = Math.max(0, this.directVideoElement.currentTime + deltaSeconds);
    }
  }

  handleVolumeChange(vol) {
    if (this.activeMode === 'youtube') {
      this.ytManager.setVolume(vol);
      if (vol > 0 && this.ytManager.isMuted()) this.ytManager.unMute();
    } else if (this.activeMode === 'direct' && this.directVideoElement) {
      this.directVideoElement.volume = vol / 100;
      this.directVideoElement.muted = vol === 0;
    }
    this.setVolumeUI(vol);
  }

  toggleMute() {
    if (this.activeMode === 'youtube') {
      if (this.ytManager.isMuted()) {
        this.ytManager.unMute();
        this.setVolumeUI(this.ytManager.getVolume());
      } else {
        this.ytManager.mute();
        this.setVolumeUI(0);
      }
    } else if (this.activeMode === 'direct' && this.directVideoElement) {
      this.directVideoElement.muted = !this.directVideoElement.muted;
      this.setVolumeUI(this.directVideoElement.muted ? 0 : this.directVideoElement.volume * 100);
    }
  }

  setVolumeUI(vol) {
    this.volumeRange.value = vol;
    const isMuted = vol === 0;
    this.iconVolHigh.style.display = isMuted ? 'none' : 'block';
    this.iconVolMuted.style.display = isMuted ? 'block' : 'none';
  }

  setPlaybackSpeed(rate) {
    if (this.activeMode === 'youtube') {
      this.ytManager.setPlaybackRate(rate);
    } else if (this.activeMode === 'direct' && this.directVideoElement) {
      this.directVideoElement.playbackRate = rate;
      this.currentSpeedLabel.textContent = `${rate}x`;
    }
    this.rateDropdown.style.display = 'none';
  }

  prevTrack() {
    if (this.activeMode === 'youtube') this.ytManager.previousVideo();
  }

  nextTrack() {
    if (this.activeMode === 'youtube') this.ytManager.nextVideo();
  }

  toggleLoop() {
    this.isLooping = !this.isLooping;
    this.btnCtrlLoop.classList.toggle('is-active', this.isLooping);
    if (this.activeMode === 'youtube') this.ytManager.setLoop(this.isLooping);
    this.ui.showToast(`Зацикливание: ${this.isLooping ? 'Вкл' : 'Выкл'}`);
  }

  toggleShuffle() {
    this.isShuffled = !this.isShuffled;
    this.btnCtrlShuffle.classList.toggle('is-active', this.isShuffled);
    if (this.activeMode === 'youtube') this.ytManager.setShuffle(this.isShuffled);
    this.ui.showToast(`Перемешивание: ${this.isShuffled ? 'Вкл' : 'Выкл'}`);
  }

  updatePlayState(isPlaying) {
    this.iconPlay.style.display = isPlaying ? 'none' : 'block';
    this.iconPause.style.display = isPlaying ? 'block' : 'none';
  }

  formatSeconds(secs) {
    if (!secs || isNaN(secs) || secs < 0) return '00:00';
    const totalSecs = Math.floor(secs);
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    const h = Math.floor(m / 60);
    if (h > 0) {
      const remM = m % 60;
      return `${h}:${remM < 10 ? '0' : ''}${remM}:${s < 10 ? '0' : ''}${s}`;
    }
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  }

  async openSettings() {
    const currentKey = await this.db.getSetting('yt_api_key');
    this.apiKeyInput.value = currentKey || '';
    this.updateKeyStatus(currentKey ? 'configured' : 'empty');
    this.settingsModal.showModal();
  }

  async saveApiKey() {
    const key = this.apiKeyInput.value.trim();
    await this.db.setSetting('yt_api_key', key || null);
    this.ui.showToast('Настройки API сохранены в IndexedDB');
    this.settingsModal.close();
  }

  async testApiKey() {
    const key = this.apiKeyInput.value.trim();
    if (!key) {
      this.updateKeyStatus('empty');
      return;
    }

    this.updateKeyStatus('testing');
    const isValid = await this.ytDataApi.validateKey(key);
    this.updateKeyStatus(isValid ? 'valid' : 'invalid');
  }

  updateKeyStatus(status) {
    this.keyStatusIndicator.className = 'key-status-indicator';
    const msgEl = this.keyStatusIndicator.querySelector('.status-msg');

    if (status === 'valid') {
      this.keyStatusIndicator.classList.add('is-valid');
      msgEl.textContent = 'Ключ валиден и готов к работе';
    } else if (status === 'invalid') {
      this.keyStatusIndicator.classList.add('is-error');
      msgEl.textContent = 'Ошибка проверки ключа (403/Invalid Key)';
    } else if (status === 'testing') {
      msgEl.textContent = 'Проверка подключения...';
    } else if (status === 'configured') {
      this.keyStatusIndicator.classList.add('is-valid');
      msgEl.textContent = 'Ключ загружен из IndexedDB';
    } else {
      msgEl.textContent = 'Ключ не настроен';
    }
  }

  async handleClipboardPaste() {
    try {
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        this.mediaInput.focus();
        this.ui.showToast('Буфер обмена не поддерживается платформой');
        return;
      }
      const text = await navigator.clipboard.readText();
      if (text) {
        this.mediaInput.value = text.trim();
        this.ui.showToast('Ссылка вставлена');
      }
    } catch {
      this.mediaInput.focus();
      this.ui.showToast('Разрешите доступ к буферу обмена');
    }
  }

  async renderHistory() {
    const items = await this.db.getHistory();
    this.historyCounter.textContent = items.length;

    if (items.length === 0) {
      this.historyEmpty.style.display = 'flex';
      this.historyGrid.innerHTML = '';
      return;
    }

    this.historyEmpty.style.display = 'none';
    this.historyGrid.innerHTML = items.map(item => `
      <article class="history-card">
        <div class="history-card-top">
          <span class="history-card-badge">${this.ui.escapeHTML(item.provider)}</span>
          <div class="history-card-actions">
            <button class="btn-icon" data-action="delete" data-id="${item.id}" title="Удалить из журнала" aria-label="Удалить запись">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
        <h3 class="history-title" title="${this.ui.escapeHTML(item.title)}">${this.ui.escapeHTML(item.title)}</h3>
        <p class="history-url">${this.ui.escapeHTML(item.url)}</p>
        <div class="history-card-footer">
          <time class="history-time">${this.formatTimestamp(item.timestamp)}</time>
          <button class="btn-play-chip" data-action="play" data-url="${this.ui.escapeHTML(item.url)}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            <span>Запуск</span>
          </button>
        </div>
      </article>
    `).join('');
  }

  async deleteHistoryEntry(id) {
    try {
      await this.db.deleteHistoryItem(id);
      await this.renderHistory();
      this.ui.showToast('Элемент удален из журнала');
    } catch {
      this.ui.showToast('Ошибка удаления');
    }
  }

  async handleClearHistory() {
    try {
      await this.db.clearHistory();
      await this.renderHistory();
      this.ui.showToast('Журнал просмотров очищен');
    } catch {
      this.ui.showToast('Не удалось очистить журнал');
    }
  }

  toggleAspectRatio() {
    this.viewportFrame.classList.toggle('ratio-21-9');
    const isUltraWide = this.viewportFrame.classList.contains('ratio-21-9');
    this.ui.showToast(`Формат кадра: ${isUltraWide ? '21:9 Cinemascope' : '16:9 Standard'}`);
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      this.viewportFrame.requestFullscreen().catch(() => {
        this.ui.showToast('Полноэкранный режим заблокирован');
      });
    } else {
      document.exitFullscreen();
    }
  }

  setLoading(isLoading) {
    if (isLoading) {
      this.btnSubmit.classList.add('is-loading');
      this.btnSubmit.disabled = true;
    } else {
      this.btnSubmit.classList.remove('is-loading');
      this.btnSubmit.disabled = false;
    }
  }

  formatTimestamp(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' · ' + date.toLocaleDateString([], { day: '2-digit', month: 'short' });
  }
}

// Global Bootstrap
document.addEventListener('DOMContentLoaded', () => {
  window.__AETHER_APP__ = new AppController();
});