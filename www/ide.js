/**ide.js: */

/**
 * IDE Core Application Controller
 * Pure Vanilla ES6+ & Strict IndexedDB Persistence
 * Cross-platform: Web, Electron, Capacitor (Android)
 */

/* ==========================================================================
   1. DATABASE CONTROLLER (INDEXEDDB ONLY - NO LOCALSTORAGE)
   ========================================================================== */
class DatabaseController {
  constructor(dbName = 'WebIDE_Database', version = 2) {
    this.dbName = dbName;
    this.version = version;
    this.db = null;
    this.fallbackStore = new Map();
  }

  async init() {
    return new Promise((resolve) => {
      if (!window.indexedDB) {
        console.warn('IndexedDB unavailable. Utilizing in-memory state.');
        return resolve(null);
      }

      try {
        const request = indexedDB.open(this.dbName, this.version);

        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (db.objectStoreNames.contains('files')) {
            const fileStore = event.target.transaction.objectStore('files');
            if (fileStore.indexNames.contains('path')) fileStore.deleteIndex('path');
            if (fileStore.indexNames.contains('parentId')) fileStore.deleteIndex('parentId');
            fileStore.createIndex('parentId', 'parentId', { unique: false });
            fileStore.createIndex('path', 'path', { unique: false });
          } else {
            const fileStore = db.createObjectStore('files', { keyPath: 'id' });
            fileStore.createIndex('parentId', 'parentId', { unique: false });
            fileStore.createIndex('path', 'path', { unique: false });
          }

          if (!db.objectStoreNames.contains('timeline')) {
            const tlStore = db.createObjectStore('timeline', { keyPath: 'id' });
            tlStore.createIndex('fileId', 'fileId', { unique: false });
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
          console.warn('IndexedDB initial access failed. Using memory fallback:', event.target.error);
          this.db = null;
          resolve(null);
        };
      } catch (err) {
        console.warn('IndexedDB critical failure:', err);
        this.db = null;
        resolve(null);
      }
    });
  }

  async getAllFiles() {
    if (!this.db) return Array.from(this.fallbackStore.values());
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction('files', 'readonly');
        const store = tx.objectStore('files');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve(Array.from(this.fallbackStore.values()));
      } catch (_) {
        resolve(Array.from(this.fallbackStore.values()));
      }
    });
  }

  async saveFile(fileObj) {
    this.fallbackStore.set(fileObj.id, fileObj);
    if (!this.db) return fileObj.id;
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction('files', 'readwrite');
        const store = tx.objectStore('files');
        const req = store.put(fileObj);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(fileObj.id);
      } catch (_) {
        resolve(fileObj.id);
      }
    });
  }

  async deleteFile(id) {
    this.fallbackStore.delete(id);
    if (!this.db) return;
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction('files', 'readwrite');
        const store = tx.objectStore('files');
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      } catch (_) {
        resolve();
      }
    });
  }

  async addTimelineEntry(fileId, content) {
    const entry = {
      id: 'tl_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      fileId,
      content,
      timestamp: Date.now()
    };
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('timeline', 'readwrite');
      const store = tx.objectStore('timeline');
      const req = store.add(entry);
      req.onsuccess = () => resolve(entry);
      req.onerror = () => reject(req.error);
    });
  }

  async getTimeline(fileId) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('timeline', 'readonly');
      const store = tx.objectStore('timeline');
      const index = store.index('fileId');
      const req = index.getAll(fileId);
      req.onsuccess = () => {
        const sorted = (req.result || []).sort((a, b) => b.timestamp - a.timestamp);
        resolve(sorted);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async getSetting(key, defaultVal = null) {
    return new Promise((resolve) => {
      const tx = this.db.transaction('settings', 'readonly');
      const store = tx.objectStore('settings');
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : defaultVal);
      req.onerror = () => resolve(defaultVal);
    });
  }

  async saveSetting(key, value) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('settings', 'readwrite');
      const store = tx.objectStore('settings');
      const req = store.put({ key, value });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}

/* ==========================================================================
   2. SYNTAX HIGHLIGHTER & ICONS GENERATOR (PURE INLINE SVG)
   ========================================================================== */
class UIHelper {
  static getFileIconSvg(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    switch (ext) {
      case 'html':
      case 'htm':
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#e44d26" stroke-width="1.6"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>`;
      case 'css':
      case 'scss':
      case 'less':
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#42a5f5" stroke-width="1.6"><path d="M4 4l2 16 6 2 6-2 2-16H4z"></path></svg>`;
      case 'js':
      case 'mjs':
      case 'cjs':
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffca28" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="M15 8v6a2 2 0 0 1-2 2h-1M9 13a2 2 0 0 0 2 2"></path></svg>`;
      case 'ts':
      case 'tsx':
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3178c6" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="M8 9h8M12 9v9M17 13c0 2-1 3-2.5 3"></path></svg>`;
      case 'jsx':
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#61dafb" stroke-width="1.6"><circle cx="12" cy="12" r="2"></circle><ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(30 12 12)"></ellipse><ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(-30 12 12)"></ellipse></svg>`;
      case 'json':
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#66bb6a" stroke-width="1.6"><path d="M8 3H6a2 2 0 0 0-2 2v3m0 8v3a2 2 0 0 0 2 2h2m8-18h2a2 2 0 0 1 2 2v3m0 8v3a2 2 0 0 1-2 2h-2"></path></svg>`;
      case 'py':
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3776ab" stroke-width="1.6"><path d="M12 9H6a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h6v-6zm0 0V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v5h-6zm0 6h6a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-6v6zm0 0v5a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-5h6z"></path></svg>`;
      case 'rs':
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dea584" stroke-width="1.6"><circle cx="12" cy="12" r="9"></circle><path d="M9 9h6M12 9v6M9 15h6"></path></svg>`;
      case 'go':
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00add8" stroke-width="1.6"><path d="M4 12h8m4 0a4 4 0 1 1-4-4"></path></svg>`;
      case 'c':
      case 'cpp':
      case 'h':
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#659ad2" stroke-width="1.6"><path d="M18 9a5 5 0 1 0 0 6M19 12h4M21 10v4"></path></svg>`;
      case 'cs':
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9b4993" stroke-width="1.6"><path d="M16 8a5 5 0 1 0 0 8M17 10h4M17 14h4M19 8v8"></path></svg>`;
      case 'php':
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#777bb4" stroke-width="1.6"><ellipse cx="12" cy="12" rx="9" ry="6"></ellipse><path d="M9 10h3a2 2 0 0 1 0 4H9v3"></path></svg>`;
      case 'sql':
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#e38c00" stroke-width="1.6"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>`;
      case 'yaml':
      case 'yml':
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#cb171e" stroke-width="1.6"><path d="M4 4l5 7v9h2v-9l5-7h-3l-3 5-3-5H4z"></path></svg>`;
      case 'svg':
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ff9800" stroke-width="1.6"><circle cx="6" cy="6" r="3"></circle><circle cx="18" cy="18" r="3"></circle><path d="M6 9v6a3 3 0 0 0 3 3h6"></path></svg>`;
      case 'md':
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ab47bc" stroke-width="1.6"><rect x="3" y="4" width="18" height="16" rx="2"></rect><polyline points="7 15 7 9 10 12 13 9 13 15"></polyline><polyline points="17 12 19 12 19 9"></polyline></svg>`;
      default:
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b949e" stroke-width="1.6"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>`;
    }
  }

  static getFolderIconSvg(isOpen) {
    if (isOpen) {
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#e5a93c" stroke-width="1.6"><path d="M2 11V6a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v2"></path><path d="M2 11l2 9a2 2 0 0 0 2 1h14a2 2 0 0 0 2-1l2-9H2z"></path></svg>`;
    }
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#e5a93c" stroke-width="1.6"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
  }

  static highlightCode(text, filename = '') {
    const ext = (filename.split('.').pop() || '').toLowerCase();
    const escapeHtml = (str) =>
      str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    if (ext === 'html' || ext === 'htm' || ext === 'svg' || ext === 'xml') {
      const escaped = escapeHtml(text);
      const htmlTokenRegex = /(&lt;!--[\s\S]*?--&gt;)|(&lt;!DOCTYPE[\s\S]*?&gt;)|(&lt;\/?)([a-zA-Z0-9\-:]+)((?:[^&]|&(?!gt;))*)(\/?&gt;)/gi;
      return escaped.replace(htmlTokenRegex, (m, comment, doctype, openTag, tagName, attrs, closeTag) => {
        if (comment) return `<span class="tok-comment">${comment}</span>`;
        if (doctype) return `<span class="tok-doctype">${doctype}</span>`;
        let highlightedAttrs = '';
        if (attrs) {
          highlightedAttrs = attrs.replace(/([a-zA-Z0-9\-:]+)(?=\s*=)|(&quot;[\s\S]*?&quot;|&#39;[\s\S]*?&#39;|'[\s\S]*?'|"[\s\S]*?")/g, (am, aName, aVal) => {
            if (aName) return `<span class="tok-attr">${aName}</span>`;
            if (aVal) return `<span class="tok-string">${aVal}</span>`;
            return am;
          });
        }
        return `${openTag}<span class="tok-tag">${tagName}</span>${highlightedAttrs}${closeTag}`;
      }) + '\n';
    }

    if (ext === 'js' || ext === 'json' || ext === 'ts' || ext === 'mjs') {
      const escaped = escapeHtml(text);
      const tokenRegex = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(&quot;(?:\\.|(?!&quot;)[^\\\n])*&quot;|&#39;(?:\\.|(?!&#39;)[^\\\n])*&#39;|`(?:\\.|[^`\\])*`)|(\b(?:const|let|var|function|return|if|else|for|while|class|import|export|from|new|async|await|try|catch|switch|case|break|default|typeof|instanceof|void|yield|this|super)\b)|(\b(?:true|false|null|undefined|NaN)\b)|(\b\d+(?:\.\d+)?\b)|(\b[a-zA-Z_$][a-zA-Z0-9_$]*(?=\s*\())|([+\-*/%=!&|<>?:~^]+)/g;
      return escaped.replace(tokenRegex, (m, comment, str, kw, bool, num, fn, op) => {
        if (comment) return `<span class="tok-comment">${comment}</span>`;
        if (str) return `<span class="tok-string">${str}</span>`;
        if (kw || bool) return `<span class="tok-keyword">${kw || bool}</span>`;
        if (num) return `<span class="tok-number">${num}</span>`;
        if (fn) return `<span class="tok-function">${fn}</span>`;
        if (op) return `<span class="tok-operator">${op}</span>`;
        return m;
      }) + '\n';
    }

    if (ext === 'css' || ext === 'scss') {
      const escaped = escapeHtml(text);
      const cssRegex = /(\/\*[\s\S]*?\*\/)|([a-zA-Z\-]+)(?=\s*:)|(:\s*[^;{}]+;)|([{};])/g;
      return escaped.replace(cssRegex, (m, comment, prop, val, punct) => {
        if (comment) return `<span class="tok-comment">${comment}</span>`;
        if (prop) return `<span class="tok-attr">${prop}</span>`;
        if (val) return `<span class="tok-string">${val}</span>`;
        if (punct) return `<span class="tok-keyword">${punct}</span>`;
        return m;
      }) + '\n';
    }

    return escapeHtml(text) + '\n';
  }

  static formatTimeAgo(ts) {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  static ansiToHtml(str) {
    if (!str) return '';
    const escapeHtml = (s) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const colors = {
      30: '#4b5563', 31: '#f87171', 32: '#4ade80', 33: '#facc15',
      34: '#60a5fa', 35: '#c084fc', 36: '#38bdf8', 37: '#f3f4f6',
      90: '#6b7280', 91: '#ef4444', 92: '#22c55e', 93: '#eab308',
      94: '#3b82f6', 95: '#a855f7', 96: '#06b6d4', 97: '#ffffff'
    };
    let result = '';
    const parts = str.split(/\x1b\[/);
    result += escapeHtml(parts[0]);

    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      const match = part.match(/^([0-9;]*)m([\s\S]*)$/);
      if (match) {
        const codes = match[1].split(';').map(Number);
        const text = escapeHtml(match[2]);
        let styles = [];
        for (const code of codes) {
          if (code === 0) styles = [];
          else if (code === 1) styles.push('font-weight:600');
          else if (code === 2) styles.push('opacity:0.7');
          else if (code === 4) styles.push('text-decoration:underline');
          else if (colors[code]) styles.push(`color:${colors[code]}`);
        }
        if (styles.length > 0) {
          result += `<span style="${styles.join(';')}">${text}</span>`;
        } else {
          result += text;
        }
      } else {
        result += escapeHtml(part);
      }
    }
    return result;
  }
}

/* ==========================================================================
   3. APP CONTROLLER (MAIN LOGIC)
   ========================================================================== */
class AppController {
  constructor() {
    this.db = new DatabaseController();
    this.files = [];
    this.openTabs = [];
    this.activeFileId = null;
    this.clipboard = null; // { type: 'cut'|'copy', id: string }
    this.expandedFolders = new Set(['root']);
    this.contextTarget = null;
    this.longPressTimer = null;

    // Terminal History, Autocomplete & Virtual CWD
    this.terminalHistory = [];
    this.historyIndex = -1;
    this.tempHistoryDraft = '';
    this.virtualCwdId = 'root';

    // In-memory unsaved drafts buffer (fileId -> unsaved content)
    this.drafts = new Map();
    this.runningProcess = null;

    // Нативный IPC-мост для Electron (через preload execStart / onExecEvent)
    const hasElectronApi = typeof window !== 'undefined' && !!(window.electronAPI && (window.electronAPI.execStart || window.electronAPI.isElectron));
    const isWin = (window.electronAPI && window.electronAPI.platform === 'win32') || (typeof navigator !== 'undefined' && navigator.userAgent.includes('Windows'));

    this.activeExecutionId = null;
    this.nativeBridge = {
      isElectron: hasElectronApi,
      isWindows: isWin,
      currentCwd: (window.electronAPI && window.electronAPI.cwd) ? window.electronAPI.cwd : (isWin ? 'C:\\workspace' : '/workspace')
    };

    if (this.nativeBridge.isElectron && window.electronAPI.onExecEvent) {
      window.electronAPI.onExecEvent((payload) => {
        if (!payload || payload.id !== this.activeExecutionId) return;

        if (payload.type === 'stdout' || payload.type === 'stderr') {
          this.appendTerminalOutput(payload.data, true);
        } else if (payload.type === 'exit' || payload.type === 'timeout' || payload.type === 'killed' || payload.type === 'error') {
          this.runningProcess = null;
          this.activeExecutionId = null;
          this.updateTerminalPrompt();

          if (payload.type === 'exit' && payload.code !== 0 && payload.code !== null) {
            this.appendTerminalOutput(`[Process exited with code ${payload.code}]`);
          } else if (payload.type === 'timeout') {
            this.appendTerminalOutput(`[Process timeout reached]`);
          } else if (payload.type === 'error') {
            this.appendTerminalOutput(`[Error: ${payload.data}]`);
          }
        }
      });
    }

    this.dom = {
      sidebar: document.getElementById('sidebar'),
      fileTree: document.getElementById('file-tree'),
      resizer: document.getElementById('sidebar-resizer'),
      tabsBar: document.getElementById('tabs-bar'),
      codeEditor: document.getElementById('code-editor'),
      codeOutput: document.getElementById('code-output'),
      gutter: document.getElementById('gutter'),
      terminalPanel: document.getElementById('terminal-panel'),
      terminalInput: document.getElementById('terminal-input'),
      terminalOutput: document.getElementById('terminal-output'),
      terminalPrompt: document.getElementById('terminal-prompt'),
      problemsBadge: document.getElementById('problems-badge'),
      problemsList: document.getElementById('problems-list'),
      timelinePanel: document.getElementById('timeline-panel'),
      timelineList: document.getElementById('timeline-list'),
      contextMenu: document.getElementById('context-menu'),
      backdrop: document.getElementById('sidebar-backdrop'),
      sbPos: document.getElementById('sb-pos'),
      sbLang: document.getElementById('sb-lang'),
      activeFileIndicator: document.getElementById('active-file-indicator'),
      openWithModal: document.getElementById('open-with-modal')
    };
  }

  async start() {
    await this.db.init();
    await this.loadInitialProject();
    this.updateTerminalPrompt();
    this.attachEventListeners();
    this.renderFileTree();
    this.renderTabs();
    this.validateCurrentCode();
  }

  async loadInitialProject() {
    if (this.nativeBridge.isElectron && window.electronAPI.readWorkspace) {
      await this.scanNativeWorkspace();
    } else {
      this.files = await this.db.getAllFiles();
      if (this.files.length === 0) {
        const seedFiles = [
          { id: 'root', name: 'workspace', type: 'folder', parentId: null, path: '/' },
          { id: 'f_html', name: 'index.html', type: 'file', parentId: 'root', path: '/index.html', content: '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>App</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <h1>IDE Studio</h1>\n  <script src="main.js"></script>\n</body>\n</html>' },
          { id: 'f_css', name: 'style.css', type: 'file', parentId: 'root', path: '/style.css', content: 'body {\n  background: #0c0d0e;\n  color: #c69214;\n  font-family: sans-serif;\n}' },
          { id: 'f_js', name: 'main.js', type: 'file', parentId: 'root', path: '/main.js', content: 'console.log("IDE Ready on Windows");' },
          { id: 'f_md', name: 'README.md', type: 'file', parentId: 'root', path: '/README.md', content: '# IDE Studio\nMinimalist SaaS Engine with Windows native disk support.' }
        ];
        for (const item of seedFiles) {
          await this.db.saveFile(item);
        }
        this.files = seedFiles;
      }
    }

    const titleEl = document.getElementById('project-title');
    if (titleEl) {
      titleEl.textContent = this.nativeBridge.currentCwd.split(/[\\/]/).pop() || 'workspace';
    }

    const firstFile = this.files.find((f) => f.type === 'file');
    if (firstFile) {
      this.openFile(firstFile.id);
    }
  }

  async scanNativeWorkspace() {
    if (!this.nativeBridge.isElectron) return;
    try {
      const res = await window.electronAPI.readWorkspace(this.nativeBridge.currentCwd);
      this.nativeBridge.currentCwd = res.cwd;
      const rootNode = {
        id: 'root',
        name: res.cwd.split(/[\\/]/).pop() || 'workspace',
        type: 'folder',
        parentId: null,
        path: '/'
      };
      this.files = [rootNode, ...res.files];
      for (const item of this.files) {
        await this.db.saveFile(item);
      }
    } catch (err) {
      console.warn('Native scan error:', err);
    }
  }

  /* ================= FILE TREE MANAGEMENT ================= */
  renderFileTree() {
    this.dom.fileTree.innerHTML = '';
    const rootNodes = this.files.filter((f) => f.parentId === 'root');
    rootNodes.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1));

    rootNodes.forEach((node) => {
      this.renderTreeNode(node, this.dom.fileTree, 0);
    });
  }

  renderTreeNode(node, container, level) {
    const itemEl = document.createElement('div');
    itemEl.className = `tree-node ${node.id === this.activeFileId ? 'active' : ''}`;
    itemEl.style.paddingLeft = `${level * 14 + 10}px`;
    itemEl.dataset.id = node.id;
    itemEl.dataset.type = node.type;

    if (node.type === 'folder') {
      const isExpanded = this.expandedFolders.has(node.id);
      itemEl.innerHTML = `
        <span class="tree-arrow ${isExpanded ? 'open' : ''}">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </span>
        <span class="tree-icon">${UIHelper.getFolderIconSvg(isExpanded)}</span>
        <span class="tree-item-label">${node.name}</span>
      `;

      itemEl.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.expandedFolders.has(node.id)) {
          this.expandedFolders.delete(node.id);
        } else {
          this.expandedFolders.add(node.id);
        }
        this.renderFileTree();
      });
    } else {
      itemEl.innerHTML = `
        <span class="tree-arrow"></span>
        <span class="tree-icon">${UIHelper.getFileIconSvg(node.name)}</span>
        <span class="tree-item-label">${node.name}</span>
      `;

      itemEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openFile(node.id);
        if (window.innerWidth <= 768) {
          this.toggleSidebar(false);
        }
      });
    }

    // Right-click context trigger
    itemEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showContextMenu(e.clientX, e.clientY, node);
    });

    // Mobile Long-press trigger (1s)
    itemEl.addEventListener('touchstart', (e) => {
      this.longPressTimer = setTimeout(() => {
        const touch = e.touches[0];
        this.showContextMenu(touch.clientX, touch.clientY, node);
      }, 1000);
    }, { passive: true });

    itemEl.addEventListener('touchend', () => clearTimeout(this.longPressTimer));
    itemEl.addEventListener('touchmove', () => clearTimeout(this.longPressTimer));

    container.appendChild(itemEl);

    if (node.type === 'folder' && this.expandedFolders.has(node.id)) {
      const children = this.files.filter((f) => f.parentId === node.id);
      children.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1));
      children.forEach((child) => this.renderTreeNode(child, container, level + 1));
    }
  }

  /* ================= CONTEXT MENUS ================= */
  showContextMenu(x, y, node = null) {
    this.contextTarget = node;
    const cm = this.dom.contextMenu;
    cm.innerHTML = '';

    if (!node || node.id === 'root') {
      // Клик по пустому месту в Explorer
      cm.innerHTML = `
        <div class="context-menu-item" data-action="new-file-root">New File</div>
        <div class="context-menu-item" data-action="new-folder-root">New Folder...</div>
        <div class="context-separator"></div>
        <div class="context-menu-item" data-action="reveal-explorer">Reveal in File Explorer</div>
        <div class="context-menu-item" data-action="open-terminal">Open in Integrated Terminal</div>
        <div class="context-menu-item ${!this.clipboard ? 'disabled' : ''}" data-action="paste-root">Paste</div>
      `;
    } else if (node.type === 'file') {
      cm.innerHTML = `
        <div class="context-menu-item" data-action="live-server">Open in Live Server</div>
        <div class="context-menu-item" data-action="open-side">Open to the Side</div>
        <div class="context-menu-item" data-action="open-with">Open with...</div>
        <div class="context-menu-item" data-action="reveal-explorer">Reveal in File Explorer</div>
        <div class="context-menu-item" data-action="open-browser">Open in Integrated Browser</div>
        <div class="context-menu-item" data-action="open-terminal">Open in Integrated Terminal</div>
        <div class="context-menu-item" data-action="open-timeline">Open Timeline</div>
        <div class="context-separator"></div>
        <div class="context-menu-item" data-action="cut">Cut</div>
        <div class="context-menu-item" data-action="copy">Copy</div>
        <div class="context-menu-item" data-action="copy-path">Copy Path</div>
        <div class="context-menu-item" data-action="copy-rel-path">Copy Relative Path</div>
        <div class="context-separator"></div>
        <div class="context-menu-item" data-action="rename">Rename</div>
        <div class="context-menu-item danger" data-action="delete">Delete</div>
      `;
    } else {
      cm.innerHTML = `
        <div class="context-menu-item" data-action="new-file-in">New File</div>
        <div class="context-menu-item" data-action="new-folder-in">New Folder...</div>
        <div class="context-separator"></div>
        <div class="context-menu-item" data-action="reveal-explorer">Reveal in File Explorer</div>
        <div class="context-menu-item" data-action="open-terminal">Open in Integrated Terminal</div>
        <div class="context-menu-item" data-action="find-in-folder">Find in Folder</div>
        <div class="context-separator"></div>
        <div class="context-menu-item" data-action="cut">Cut</div>
        <div class="context-menu-item" data-action="copy">Copy</div>
        <div class="context-menu-item ${!this.clipboard ? 'disabled' : ''}" data-action="paste">Paste</div>
        <div class="context-menu-item" data-action="copy-path">Copy Path</div>
        <div class="context-menu-item" data-action="copy-rel-path">Copy Relative Path</div>
        <div class="context-separator"></div>
        <div class="context-menu-item" data-action="rename">Rename</div>
        <div class="context-menu-item danger" data-action="delete">Delete</div>
      `;
    }

    // Position correction
    cm.style.display = 'block';
    const rect = cm.getBoundingClientRect();
    let posX = x;
    let posY = y;

    if (posX + rect.width > window.innerWidth) posX = window.innerWidth - rect.width - 8;
    if (posY + rect.height > window.innerHeight) posY = window.innerHeight - rect.height - 8;

    cm.style.left = `${Math.max(4, posX)}px`;
    cm.style.top = `${Math.max(4, posY)}px`;
  }

  closeContextMenu() {
    this.dom.contextMenu.style.display = 'none';
    this.contextTarget = null;
  }

  /* ================= FILE & FOLDER OPERATIONS WITH DISK SYNC ================= */
  syncNativeFile(fileOrPath, content) {
    if (!this.nativeBridge.isElectron || !this.nativeBridge.fs) return;
    try {
      const fullPath = typeof fileOrPath === 'object'
        ? (fileOrPath.realPath || this.getDiskPath(fileOrPath.path))
        : this.getDiskPath(fileOrPath);

      const dir = this.nativeBridge.path.dirname(fullPath);
      if (!this.nativeBridge.fs.existsSync(dir)) {
        this.nativeBridge.fs.mkdirSync(dir, { recursive: true });
      }
      this.nativeBridge.fs.writeFileSync(fullPath, content !== undefined ? content : '', 'utf8');

      if (typeof fileOrPath === 'object') {
        fileOrPath.realPath = fullPath;
      }
    } catch (err) {
      console.error('Physical disk write error:', err);
      this.appendTerminalOutput(`Disk Write Error: ${err.message}`);
    }
  }

  syncNativeFolder(folderOrPath) {
    if (!this.nativeBridge.isElectron || !this.nativeBridge.fs) return;
    try {
      const fullPath = typeof folderOrPath === 'object'
        ? (folderOrPath.realPath || this.getDiskPath(folderOrPath.path))
        : this.getDiskPath(folderOrPath);

      if (!this.nativeBridge.fs.existsSync(fullPath)) {
        this.nativeBridge.fs.mkdirSync(fullPath, { recursive: true });
      }

      if (typeof folderOrPath === 'object') {
        folderOrPath.realPath = fullPath;
      }
    } catch (err) {
      console.error('Physical dir creation error:', err);
      this.appendTerminalOutput(`Folder Create Error: ${err.message}`);
    }
  }

  getDiskPath(relPath) {
    if (!this.nativeBridge.path) return relPath;
    if (this.nativeBridge.path.isAbsolute(relPath)) return relPath;
    const cleanRel = relPath.replace(/^\/+/, '');
    return this.nativeBridge.path.resolve(this.nativeBridge.currentCwd, cleanRel);
  }

  async createNewNodePrompt(type, parentId = 'root') {
    this.expandedFolders.add(parentId);
    this.renderFileTree();

    const parentEl = Array.from(this.dom.fileTree.querySelectorAll('.tree-node')).find((el) => el.dataset.id === parentId);
    const tempNode = document.createElement('div');
    tempNode.className = 'tree-node';
    tempNode.style.paddingLeft = `${(parentEl ? 2 : 0) * 14 + 20}px`;
    tempNode.innerHTML = `
      <span class="tree-icon">${type === 'folder' ? UIHelper.getFolderIconSvg(false) : UIHelper.getFileIconSvg('default')}</span>
      <input type="text" class="tree-rename-input" />
    `;

    if (parentEl && parentEl.nextSibling) {
      this.dom.fileTree.insertBefore(tempNode, parentEl.nextSibling);
    } else {
      this.dom.fileTree.appendChild(tempNode);
    }

    const input = tempNode.querySelector('input');
    input.focus();

    let isHandled = false;
    const finish = async (cancelled) => {
      if (isHandled) return;
      isHandled = true;

      const val = input.value.trim();
      if (tempNode && tempNode.parentNode) {
        tempNode.remove();
      }

      if (cancelled || !val) {
        this.renderFileTree();
        return;
      }

      const parent = this.files.find((f) => f.id === parentId);
      const parentPath = parent && parent.path !== '/' ? parent.path : '';
      const newPath = `${parentPath}/${val}`.replace(/\/+/g, '/');

      let realPath = undefined;
      if (this.nativeBridge.isElectron && this.nativeBridge.path) {
        if (parent && parent.realPath) {
          realPath = this.nativeBridge.path.join(parent.realPath, val);
        } else {
          realPath = this.getDiskPath(newPath);
        }
      }

      const newNode = {
        id: 'n_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        name: val,
        type,
        parentId,
        path: newPath,
        realPath,
        content: type === 'file' ? '' : undefined,
        updatedAt: Date.now()
      };

      // Синхронизация с реальным диском ПК до сохранения в IndexedDB
      if (type === 'folder') {
        this.syncNativeFolder(newNode);
      } else {
        this.syncNativeFile(newNode, '');
      }

      await this.db.saveFile(newNode);
      this.files.push(newNode);

      this.renderFileTree();
      if (type === 'file') this.openFile(newNode.id);
    };

    input.addEventListener('blur', () => finish(false));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        finish(true);
      }
    });
  }

  async inlineRename(node) {
    const nodeEl = Array.from(this.dom.fileTree.querySelectorAll('.tree-node')).find((el) => el.dataset.id === node.id);
    if (!nodeEl) return;

    const label = nodeEl.querySelector('.tree-item-label');
    const oldName = node.name;
    const oldPath = node.path;
    label.innerHTML = `<input type="text" class="tree-rename-input" value="${oldName}" />`;
    const input = label.querySelector('input');
    input.focus();
    input.select();

    let isHandled = false;
    const commit = async (cancelled) => {
      if (isHandled) return;
      isHandled = true;

      const val = input.value.trim();
      if (cancelled || !val || val === oldName) {
        this.renderFileTree();
        return;
      }
      node.name = val;
      const parts = node.path.split('/');
      parts.pop();
      node.path = `${parts.join('/')}/${val}`;

      // Переименование на реальном диске
      if (this.nativeBridge.isElectron && this.nativeBridge.fs) {
        try {
          const oldDisk = this.getDiskPath(oldPath);
          const newDisk = this.getDiskPath(node.path);
          if (this.nativeBridge.fs.existsSync(oldDisk)) {
            this.nativeBridge.fs.renameSync(oldDisk, newDisk);
          }
        } catch (err) {
          console.warn('Physical disk rename failed:', err);
        }
      }

      await this.db.saveFile(node);
      this.renderFileTree();
      this.renderTabs();
    };

    input.addEventListener('blur', () => commit(false));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        commit(true);
      }
    });
  }

  async deleteNode(id) {
    const targetNode = this.files.find((f) => f.id === id);
    if (targetNode && this.nativeBridge.isElectron && this.nativeBridge.fs) {
      try {
        const diskPath = this.getDiskPath(targetNode.path);
        if (this.nativeBridge.fs.existsSync(diskPath)) {
          this.nativeBridge.fs.rmSync(diskPath, { recursive: true, force: true });
        }
      } catch (err) {
        console.warn('Disk removal error:', err);
      }
    }

    const toDelete = [id];
    const gatherDescendants = (parentId) => {
      this.files.filter((f) => f.parentId === parentId).forEach((child) => {
        toDelete.push(child.id);
        if (child.type === 'folder') gatherDescendants(child.id);
      });
    };
    gatherDescendants(id);

    for (const deleteId of toDelete) {
      await this.db.deleteFile(deleteId);
      this.files = this.files.filter((f) => f.id !== deleteId);
      this.closeTab(deleteId);
    }
    this.renderFileTree();
    this.renderTabs();
  }

  async pasteNode(targetFolderId) {
    if (!this.clipboard) return;
    const sourceNode = this.files.find((f) => f.id === this.clipboard.id);
    if (!sourceNode) return;

    if (this.clipboard.type === 'cut') {
      sourceNode.parentId = targetFolderId;
      await this.db.saveFile(sourceNode);
      this.clipboard = null;
    } else if (this.clipboard.type === 'copy') {
      const copyNode = {
        ...sourceNode,
        id: 'n_' + Date.now(),
        name: 'copy_' + sourceNode.name,
        parentId: targetFolderId,
        path: `/copy_${sourceNode.name}`
      };
      await this.db.saveFile(copyNode);
      this.files.push(copyNode);
    }
    this.renderFileTree();
  }

  /* ================= TABS & EDITOR VIEW ================= */
  captureCurrentEditorDraft() {
    if (!this.activeFileId) return;
    const file = this.files.find((f) => f.id === this.activeFileId);
    if (!file) return;

    const currentVal = this.dom.codeEditor.value;
    if (currentVal !== (file.content || '')) {
      this.drafts.set(this.activeFileId, currentVal);
    } else {
      this.drafts.delete(this.activeFileId);
    }
  }

  openFile(id) {
    const file = this.files.find((f) => f.id === id && f.type === 'file');
    if (!file) return;

    // Сохраняем черновик текущего открытого файла в память перед переключением
    if (this.activeFileId && this.activeFileId !== id) {
      this.captureCurrentEditorDraft();
    }

    // В Electron считываем актуальное состояние с диска только если нет несохраненного черновика
    if (this.nativeBridge.isElectron && this.nativeBridge.fs && !this.drafts.has(id)) {
      const diskPath = file.realPath || this.getDiskPath(file.path);
      try {
        if (this.nativeBridge.fs.existsSync(diskPath)) {
          file.content = this.nativeBridge.fs.readFileSync(diskPath, 'utf8');
        }
      } catch (err) {
        console.warn('Physical read error:', err);
      }
    }

    if (!this.openTabs.includes(id)) {
      this.openTabs.push(id);
    }
    this.activeFileId = id;
    this.loadFileIntoEditor(file);
    this.renderTabs();
    this.renderFileTree();
    this.renderTimelineList(id);
  }

  closeTab(id) {
    this.drafts.delete(id);
    this.openTabs = this.openTabs.filter((tId) => tId !== id);
    if (this.activeFileId === id) {
      this.activeFileId = this.openTabs.length > 0 ? this.openTabs[this.openTabs.length - 1] : null;
      if (this.activeFileId) {
        const file = this.files.find((f) => f.id === this.activeFileId);
        this.loadFileIntoEditor(file);
      } else {
        this.dom.codeEditor.value = '';
        this.dom.codeOutput.innerHTML = '';
        this.dom.gutter.innerHTML = '';
        this.dom.activeFileIndicator.textContent = 'No file opened';
        this.dom.sbLang.textContent = 'Plain Text';
      }
    }
    this.renderTabs();
    this.renderFileTree();
  }

  renderTabs() {
    this.dom.tabsBar.innerHTML = '';
    this.openTabs.forEach((id) => {
      const file = this.files.find((f) => f.id === id);
      if (!file) return;

      const isDirty = this.drafts.has(file.id);
      const tab = document.createElement('div');
      tab.className = `tab-item ${file.id === this.activeFileId ? 'active' : ''} ${isDirty ? 'dirty' : ''}`;
      tab.dataset.id = file.id;
      tab.innerHTML = `
        <span class="tree-icon">${UIHelper.getFileIconSvg(file.name)}</span>
        <span>${file.name}</span>
        <span class="tab-dot"></span>
        <span class="tab-close">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </span>
      `;

      tab.addEventListener('click', (e) => {
        if (!e.target.closest('.tab-close')) this.openFile(file.id);
      });

      tab.querySelector('.tab-close').addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeTab(file.id);
      });

      this.dom.tabsBar.appendChild(tab);
    });
  }

  loadFileIntoEditor(file) {
    const contentToDisplay = this.drafts.has(file.id) ? this.drafts.get(file.id) : (file.content || '');
    this.dom.codeEditor.value = contentToDisplay;
    this.dom.activeFileIndicator.textContent = file.name;
    this.dom.sbLang.textContent = file.name.split('.').pop().toUpperCase();
    this.updateSyntaxAndGutter();
    this.checkDirtyState();
    this.validateCurrentCode();
  }

  updateSyntaxAndGutter() {
    const text = this.dom.codeEditor.value;
    const file = this.files.find((f) => f.id === this.activeFileId);
    this.dom.codeOutput.innerHTML = UIHelper.highlightCode(text, file ? file.name : '');

    const lines = text.split('\n').length;
    let gutterHtml = '';
    const currentLine = (this.dom.codeEditor.value.substr(0, this.dom.codeEditor.selectionStart).match(/\n/g) || []).length + 1;

    for (let i = 1; i <= lines; i++) {
      gutterHtml += `<div class="gutter-line ${i === currentLine ? 'active' : ''}">${i}</div>`;
    }
    this.dom.gutter.innerHTML = gutterHtml;
    this.updateCursorStats();
  }

  updateCursorStats() {
    const selStart = this.dom.codeEditor.selectionStart;
    const textBefore = this.dom.codeEditor.value.substr(0, selStart);
    const line = (textBefore.match(/\n/g) || []).length + 1;
    const col = selStart - textBefore.lastIndexOf('\n');
    this.dom.sbPos.textContent = `Ln ${line}, Col ${col}`;
  }

  checkDirtyState() {
    if (this.activeFileId) {
      const file = this.files.find((f) => f.id === this.activeFileId);
      if (file) {
        const currentVal = this.dom.codeEditor.value;
        if (currentVal !== (file.content || '')) {
          this.drafts.set(file.id, currentVal);
        } else {
          this.drafts.delete(file.id);
        }
      }
    }

    const tabElements = this.dom.tabsBar.querySelectorAll('.tab-item');
    tabElements.forEach((tabEl) => {
      const tabId = tabEl.dataset.id;
      tabEl.classList.toggle('dirty', this.drafts.has(tabId));
    });
  }

  async saveActiveFile() {
    if (!this.activeFileId) return;
    const file = this.files.find((f) => f.id === this.activeFileId);
    if (!file) return;

    file.content = this.dom.codeEditor.value;
    file.updatedAt = Date.now();
    this.drafts.delete(file.id);

    // Физическая запись на диск ПК в среде Electron
    if (this.nativeBridge.isElectron && this.nativeBridge.fs) {
      this.syncNativeFile(file, file.content);
    }

    // Персистентное сохранение в IndexedDB
    await this.db.saveFile(file);
    await this.db.addTimelineEntry(file.id, file.content);
    this.renderTimelineList(file.id);
    this.renderTabs();
    this.validateCurrentCode();
    this.checkDirtyState();
  }

  handleContextMenuAction(action) {
    const node = this.contextTarget;

    switch (action) {
      case 'new-file-root':
        this.createNewNodePrompt('file', 'root');
        break;
      case 'new-folder-root':
        this.createNewNodePrompt('folder', 'root');
        break;
      case 'paste-root':
        this.pasteNode('root');
        break;
      case 'new-file-in':
        if (node) this.createNewNodePrompt('file', node.id);
        break;
      case 'new-folder-in':
        if (node) this.createNewNodePrompt('folder', node.id);
        break;
      case 'rename':
        if (node) this.inlineRename(node);
        break;
      case 'delete':
        if (node) this.deleteNode(node.id);
        break;
      case 'cut':
        if (node) this.clipboard = { type: 'cut', id: node.id };
        break;
      case 'copy':
        if (node) this.clipboard = { type: 'copy', id: node.id };
        break;
      case 'paste':
        if (node) this.pasteNode(node.id);
        break;
      case 'copy-path':
        if (node && navigator.clipboard) {
          const p = this.nativeBridge.isElectron ? this.getDiskPath(node.path) : node.path;
          navigator.clipboard.writeText(p);
        }
        break;
      case 'copy-rel-path':
        if (node && navigator.clipboard) navigator.clipboard.writeText('.' + node.path);
        break;
      case 'reveal-explorer':
        if (this.nativeBridge.isElectron && this.nativeBridge.shell) {
          try {
            const diskPath = node ? this.getDiskPath(node.path) : this.nativeBridge.currentCwd;
            this.nativeBridge.shell.showItemInFolder(diskPath);
          } catch (_) {
            this.appendTerminalOutput(`Physical path: ${node ? node.path : this.nativeBridge.currentCwd}`);
          }
        } else {
          this.appendTerminalOutput(`Virtual path: ${node ? node.path : '/'}`);
        }
        break;
      case 'find-in-folder':
        const fb = document.getElementById('find-bar');
        fb.style.display = 'flex';
        document.getElementById('find-input').focus();
        break;
      case 'open-side':
        if (node) this.openFile(node.id);
        break;
      case 'open-timeline':
        this.openTimelinePanel();
        break;
      case 'open-terminal':
        this.toggleTerminal(true);
        if (node) this.executeTerminalCommand(`cd ${node.path}`);
        break;
      case 'open-with':
        this.dom.openWithModal.style.display = 'flex';
        break;
      case 'live-server':
      case 'open-browser':
        this.runLiveBrowser();
        break;
      default:
        break;
    }
    this.closeContextMenu();
  }

  /* ================= TIMELINE / REVISIONS ================= */
  async renderTimelineList(fileId) {
    if (!fileId) return;
    const list = await this.db.getTimeline(fileId);
    this.dom.timelineList.innerHTML = '';

    if (list.length === 0) {
      this.dom.timelineList.innerHTML = `<div class="timeline-empty">No revisions recorded yet. Hit Save (Ctrl+S).</div>`;
      return;
    }

    list.forEach((entry) => {
      const card = document.createElement('div');
      card.className = 'timeline-card';
      card.innerHTML = `
        <div class="timeline-card-head">
          <span>${UIHelper.formatTimeAgo(entry.timestamp)}</span>
          <button class="timeline-rollback-btn">Restore</button>
        </div>
        <div class="timeline-item-detail">${entry.content.substring(0, 45).replace(/\n/g, ' ')}...</div>
      `;

      card.querySelector('.timeline-rollback-btn').addEventListener('click', () => {
        this.dom.codeEditor.value = entry.content;
        this.updateSyntaxAndGutter();
        this.saveActiveFile();
      });

      this.dom.timelineList.appendChild(card);
    });
  }

  openTimelinePanel() {
    this.dom.timelinePanel.classList.remove('collapsed');
    if (this.activeFileId) this.renderTimelineList(this.activeFileId);
  }

  /* ================= REAL TERMINAL & SHELL ENGINE (CROSS-PLATFORM) ================= */
  updateTerminalPrompt() {
    if (!this.dom.terminalPrompt) return;
    if (this.nativeBridge.isElectron && this.nativeBridge.isWindows) {
      this.dom.terminalPrompt.textContent = `PS ${this.nativeBridge.currentCwd}>`;
    } else if (this.nativeBridge.isElectron) {
      const base = this.nativeBridge.path ? this.nativeBridge.path.basename(this.nativeBridge.currentCwd) : 'workspace';
      this.dom.terminalPrompt.textContent = `dev@${base}:~$`;
    } else {
      const vPath = this.getVirtualFolderPathString(this.virtualCwdId);
      this.dom.terminalPrompt.textContent = `PS ${vPath}>`;
    }
  }

  toggleTerminal(forceOpen = null) {
    if (forceOpen === true) {
      this.dom.terminalPanel.classList.remove('collapsed');
      this.dom.terminalInput.focus();
    } else if (forceOpen === false) {
      this.dom.terminalPanel.classList.add('collapsed');
    } else {
      this.dom.terminalPanel.classList.toggle('collapsed');
      if (!this.dom.terminalPanel.classList.contains('collapsed')) {
        this.dom.terminalInput.focus();
      }
    }
  }

  getVirtualFolderPathString(folderId) {
    if (!folderId || folderId === 'root') {
      return 'C:\\workspace';
    }
    const pathParts = [];
    let curr = this.files.find((f) => f.id === folderId);
    while (curr && curr.id !== 'root') {
      pathParts.unshift(curr.name);
      curr = this.files.find((f) => f.id === curr.parentId);
    }
    return `C:\\workspace\\${pathParts.join('\\')}`;
  }

  resolveVirtualNode(targetPath, baseFolderId = this.virtualCwdId) {
    if (!targetPath || targetPath === '.' || targetPath === './') {
      const baseNode = this.files.find((f) => f.id === baseFolderId);
      return { targetNode: baseNode || { id: 'root', name: 'workspace', type: 'folder', parentId: null }, parentId: baseFolderId, name: '', exists: true };
    }

    const clean = targetPath.trim().replace(/^['"]|['"]$/g, '').replace(/\\/g, '/');
    let currentFolderId = baseFolderId;

    if (clean === '/' || clean === '~' || clean.toLowerCase() === 'c:' || clean.toLowerCase().startsWith('c:/workspace')) {
      const sub = clean.replace(/^c:\/workspace\/?/i, '').replace(/^[\/~]/, '');
      if (!sub) {
        return { targetNode: this.files.find((f) => f.id === 'root'), parentId: null, name: 'workspace', exists: true };
      }
      currentFolderId = 'root';
    } else if (clean.startsWith('/')) {
      currentFolderId = 'root';
    }

    const parts = clean.split('/').filter(Boolean).filter((p) => p !== 'c:' && p.toLowerCase() !== 'workspace');
    if (parts.length === 0) {
      return { targetNode: this.files.find((f) => f.id === 'root'), parentId: null, name: 'workspace', exists: true };
    }

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;

      if (part === '.') {
        continue;
      }

      if (part === '..') {
        if (currentFolderId === 'root') continue;
        const curr = this.files.find((f) => f.id === currentFolderId);
        currentFolderId = curr ? (curr.parentId || 'root') : 'root';
        if (isLast) {
          const targetNode = this.files.find((f) => f.id === currentFolderId);
          return { targetNode, parentId: targetNode ? targetNode.parentId : null, name: targetNode ? targetNode.name : 'workspace', exists: !!targetNode };
        }
        continue;
      }

      const match = this.files.find((f) => f.parentId === currentFolderId && f.name.toLowerCase() === part.toLowerCase());

      if (isLast) {
        return {
          targetNode: match || null,
          parentId: currentFolderId,
          name: part,
          exists: !!match
        };
      } else {
        if (!match || match.type !== 'folder') {
          return { targetNode: null, parentId: currentFolderId, name: part, exists: false };
        }
        currentFolderId = match.id;
      }
    }

    return { targetNode: null, parentId: currentFolderId, name: '', exists: false };
  }

  handleTerminalTabCompletion() {
    const input = this.dom.terminalInput;
    const val = input.value;
    const parts = val.split(' ');
    const currentToken = parts[parts.length - 1];

    if (parts.length === 1) {
      const builtins = [
        'help', 'clear', 'cls', 'dir', 'ls', 'cd', 'pwd', 'cat', 'type', 'head', 'tail',
        'touch', 'mkdir', 'rm', 'del', 'rmdir', 'cp', 'copy', 'mv', 'move', 'rename',
        'code', 'open', 'edit', 'node', 'js', 'eval', 'grep', 'find', 'wc', 'stat',
        'history', 'echo', 'whoami', 'date', 'time'
      ];
      const matches = builtins.filter((c) => c.startsWith(currentToken.toLowerCase()));
      if (matches.length === 1) {
        input.value = matches[0] + ' ';
      } else if (matches.length > 1) {
        this.appendTerminalOutput(matches.join('   '));
      }
      return;
    }

    const currentFiles = this.files.filter((f) => f.parentId === this.virtualCwdId).map((f) => f.name);
    const matches = currentFiles.filter((n) => n.toLowerCase().startsWith(currentToken.toLowerCase()));

    if (matches.length === 1) {
      parts[parts.length - 1] = matches[0];
      input.value = parts.join(' ');
    } else if (matches.length > 1) {
      this.appendTerminalOutput(matches.join('   '));
    }
  }

  async executeTerminalCommand(cmd) {
    const raw = cmd.trim();
    if (!raw) return;

    const currentPrompt = this.dom.terminalPrompt.textContent;
    this.appendTerminalOutput(`${currentPrompt} ${raw}`);

    const lowerRaw = raw.toLowerCase();
    if (lowerRaw === 'cls' || lowerRaw === 'clear') {
      this.dom.terminalOutput.innerHTML = '';
      return;
    }

    // Распознавание команд перенаправления вывода (> и >>)
    let redirectMode = null; // 'overwrite' | 'append'
    let redirectFile = null;
    let baseCmd = raw;

    if (raw.includes('>>')) {
      const segs = raw.split('>>');
      baseCmd = segs[0].trim();
      redirectFile = segs[1].trim();
      redirectMode = 'append';
    } else if (raw.includes('>')) {
      const segs = raw.split('>');
      baseCmd = segs[0].trim();
      redirectFile = segs[1].trim();
      redirectMode = 'overwrite';
    }

    const handleOutput = async (outputText) => {
      if (redirectFile && redirectMode) {
        const resolved = this.resolveVirtualNode(redirectFile);
        let targetNode = resolved.targetNode;

        if (!targetNode) {
          targetNode = {
            id: 'n_' + Date.now(),
            name: resolved.name,
            type: 'file',
            parentId: resolved.parentId,
            path: `/${resolved.name}`,
            content: ''
          };
          this.files.push(targetNode);
        }

        if (redirectMode === 'overwrite') {
          targetNode.content = outputText;
        } else {
          targetNode.content = (targetNode.content || '') + (targetNode.content ? '\n' : '') + outputText;
        }

        await this.db.saveFile(targetNode);
        if (this.nativeBridge.isElectron && this.nativeBridge.fs) {
          this.syncNativeFile(targetNode.path, targetNode.content);
        }
        this.renderFileTree();
        if (this.activeFileId === targetNode.id) {
          this.loadFileIntoEditor(targetNode);
        }
      } else {
        this.appendTerminalOutput(outputText);
      }
    };

    // Нативное исполнение команд в среде Electron через preload execStart
    const firstWord = baseCmd.split(' ')[0].toLowerCase();
    const ideInternalCommands = ['code', 'open', 'edit'];

    if (this.nativeBridge.isElectron && window.electronAPI.execStart && !ideInternalCommands.includes(firstWord)) {
      const execId = 'term_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
      this.activeExecutionId = execId;
      this.runningProcess = true;

      if (this.dom.terminalPrompt) {
        this.dom.terminalPrompt.textContent = `[Running: ${baseCmd.substring(0, 24)}...] (Ctrl+C)`;
      }

      window.electronAPI.execStart({
        id: execId,
        lang: 'bash', // В main.js на Windows автоматически запускает через cmd.exe /c
        code: baseCmd,
        cwd: this.nativeBridge.currentCwd,
        timeout: 0,
        interactive: true
      });
      return;
    }

    // Виртуальный Shell движок (Web, Capacitor Android, Electron IDE Actions)
    const tokens = baseCmd.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
    const command = (tokens[0] || '').toLowerCase();
    const args = tokens.slice(1).map((a) => a.replace(/^['"]|['"]$/g, ''));

    switch (command) {
      case 'help':
      case '?': {
        const helpText = [
          '=== SaaS IDE Terminal Commands ===',
          'Navigation & View:',
          '  pwd                     - Show current working directory',
          '  ls / dir [-l, -a]       - List files and subdirectories',
          '  cd [path]               - Change directory (e.g. cd .., cd src, cd /)',
          '  cls / clear             - Clear terminal screen',
          '',
          'File Management:',
          '  touch / new [file]      - Create an empty file',
          '  mkdir [folder]          - Create a new directory',
          '  cat / type [file]       - Display file contents',
          '  head / tail [-n N] [f]  - View first / last N lines of a file',
          '  code / open [file]      - Open file directly into active editor',
          '  cp / copy [src] [dest]  - Copy file or folder',
          '  mv / move [src] [dest]  - Move or rename file/folder',
          '  rm / del [file/folder]  - Delete file or directory recursively',
          '',
          'Execution & Tools:',
          '  node / js [file/expr]   - Execute JS file or inline JS in safe runtime',
          '  grep / find [term] [f]  - Search pattern across file or workspace',
          '  wc [file]               - Count lines, words and characters in file',
          '  stat [file]             - Detailed file metadata & statistics',
          '  echo [text] [> | >> f]  - Print text or redirect to file',
          '  history [-c]            - Show or clear command history',
          '  whoami / hostname       - Show runtime environment & client info',
          '  date / time             - Print current timestamp'
        ].join('\n');
        handleOutput(helpText);
        break;
      }

      case 'pwd': {
        const vPath = this.getVirtualFolderPathString(this.virtualCwdId);
        handleOutput(vPath);
        break;
      }

      case 'dir':
      case 'ls': {
        let targetFolderId = this.virtualCwdId;
        if (args.length > 0 && !args[0].startsWith('-')) {
          const resolved = this.resolveVirtualNode(args[0]);
          if (!resolved.exists || resolved.targetNode.type !== 'folder') {
            handleOutput(`Directory not found: ${args[0]}`);
            return;
          }
          targetFolderId = resolved.targetNode.id;
        }

        const items = this.files.filter((f) => f.parentId === targetFolderId);
        if (items.length === 0) {
          handleOutput('Directory is empty.');
          return;
        }

        items.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1));
        const formatted = items.map((item) => {
          const dateStr = new Date(item.updatedAt || Date.now()).toLocaleDateString();
          const typeStr = item.type === 'folder' ? '<DIR> ' : '      ';
          const sizeStr = item.type === 'file' ? `${(item.content || '').length} B`.padStart(8, ' ') : '        ';
          return `${dateStr}  ${typeStr}  ${sizeStr}  ${item.name}`;
        }).join('\n');

        const folderName = targetFolderId === 'root' ? 'workspace' : (this.files.find((f) => f.id === targetFolderId)?.name || 'workspace');
        handleOutput(`Directory of ${folderName}:\n\n${formatted}\n\nTotal: ${items.length} item(s)`);
        break;
      }

      case 'cd': {
        const targetPath = args[0];
        if (!targetPath || targetPath === '~' || targetPath === '/' || targetPath === '\\') {
          this.virtualCwdId = 'root';
          this.updateTerminalPrompt();
          return;
        }

        const resolved = this.resolveVirtualNode(targetPath);
        if (resolved.exists && resolved.targetNode && resolved.targetNode.type === 'folder') {
          this.virtualCwdId = resolved.targetNode.id;
          this.updateTerminalPrompt();
        } else {
          handleOutput(`The system cannot find the path specified: ${targetPath}`);
        }
        break;
      }

      case 'type':
      case 'cat': {
        if (!args[0]) {
          handleOutput('Usage: cat <filename> or type <filename>');
          return;
        }
        const resolved = this.resolveVirtualNode(args[0]);
        if (!resolved.exists || !resolved.targetNode || resolved.targetNode.type !== 'file') {
          handleOutput(`File not found: ${args[0]}`);
          return;
        }
        handleOutput(resolved.targetNode.content || '<empty>');
        break;
      }

      case 'head':
      case 'tail': {
        if (!args[0]) {
          handleOutput(`Usage: ${command} [-n lines] <filename>`);
          return;
        }
        let lineLimit = 10;
        let fileArg = args[0];
        if (args[0] === '-n' && args[1]) {
          lineLimit = parseInt(args[1], 10) || 10;
          fileArg = args[2];
        }
        if (!fileArg) {
          handleOutput('Missing filename argument.');
          return;
        }
        const resolved = this.resolveVirtualNode(fileArg);
        if (!resolved.exists || !resolved.targetNode || resolved.targetNode.type !== 'file') {
          handleOutput(`File not found: ${fileArg}`);
          return;
        }
        const lines = (resolved.targetNode.content || '').split('\n');
        const selected = command === 'head' ? lines.slice(0, lineLimit) : lines.slice(-lineLimit);
        handleOutput(selected.join('\n'));
        break;
      }

      case 'code':
      case 'open':
      case 'edit': {
        if (!args[0]) {
          handleOutput(`Usage: ${command} <filename>`);
          return;
        }
        let resolved = this.resolveVirtualNode(args[0]);
        if (!resolved.exists) {
          const newFile = {
            id: 'n_' + Date.now(),
            name: resolved.name,
            type: 'file',
            parentId: resolved.parentId,
            path: `/${resolved.name}`,
            content: ''
          };
          await this.db.saveFile(newFile);
          this.files.push(newFile);
          this.renderFileTree();
          resolved = { targetNode: newFile };
        }

        if (resolved.targetNode && resolved.targetNode.type === 'file') {
          this.openFile(resolved.targetNode.id);
          handleOutput(`Opened in editor: ${resolved.targetNode.name}`);
        } else {
          handleOutput(`Cannot open directory in editor: ${args[0]}`);
        }
        break;
      }

      case 'touch':
      case 'new': {
        if (!args[0]) {
          handleOutput(`Usage: ${command} <filename>`);
          return;
        }
        const resolved = this.resolveVirtualNode(args[0]);
        if (resolved.exists) {
          resolved.targetNode.updatedAt = Date.now();
          await this.db.saveFile(resolved.targetNode);
          handleOutput(`Updated timestamp for '${args[0]}'`);
          return;
        }
        const parentNode = this.files.find((f) => f.id === resolved.parentId);
        const parentPath = parentNode && parentNode.path !== '/' ? parentNode.path : '';
        const computedPath = `${parentPath}/${resolved.name}`.replace(/\/+/g, '/');

        let realPath = undefined;
        if (this.nativeBridge.isElectron && this.nativeBridge.path) {
          realPath = parentNode && parentNode.realPath
            ? this.nativeBridge.path.join(parentNode.realPath, resolved.name)
            : this.getDiskPath(computedPath);
        }

        const newNode = {
          id: 'n_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
          name: resolved.name,
          type: 'file',
          parentId: resolved.parentId,
          path: computedPath,
          realPath,
          content: '',
          updatedAt: Date.now()
        };

        if (this.nativeBridge.isElectron && this.nativeBridge.fs) {
          this.syncNativeFile(newNode, '');
        }
        await this.db.saveFile(newNode);
        this.files.push(newNode);
        this.renderFileTree();
        handleOutput(`Created file '${resolved.name}'`);
        break;
      }

      case 'mkdir': {
        if (!args[0]) {
          handleOutput('Usage: mkdir <folder_name>');
          return;
        }
        const resolved = this.resolveVirtualNode(args[0]);
        if (resolved.exists) {
          handleOutput(`A subdirectory or file '${args[0]}' already exists.`);
          return;
        }

        const parentNode = this.files.find((f) => f.id === resolved.parentId);
        const parentPath = parentNode && parentNode.path !== '/' ? parentNode.path : '';
        const computedPath = `${parentPath}/${resolved.name}`.replace(/\/+/g, '/');

        let realPath = undefined;
        if (this.nativeBridge.isElectron && this.nativeBridge.path) {
          realPath = parentNode && parentNode.realPath
            ? this.nativeBridge.path.join(parentNode.realPath, resolved.name)
            : this.getDiskPath(computedPath);
        }

        const newFolder = {
          id: 'n_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
          name: resolved.name,
          type: 'folder',
          parentId: resolved.parentId,
          path: computedPath,
          realPath,
          updatedAt: Date.now()
        };

        if (this.nativeBridge.isElectron && this.nativeBridge.fs) {
          this.syncNativeFolder(newFolder);
        }
        await this.db.saveFile(newFolder);
        this.files.push(newFolder);
        this.renderFileTree();
        handleOutput(`Created directory '${resolved.name}'`);
        break;
      }

      case 'rm':
      case 'del':
      case 'rmdir':
      case 'unlink': {
        if (!args[0]) {
          handleOutput(`Usage: ${command} <file_or_folder>`);
          return;
        }
        const resolved = this.resolveVirtualNode(args[0]);
        if (!resolved.exists || !resolved.targetNode) {
          handleOutput(`File or folder not found: ${args[0]}`);
          return;
        }
        if (resolved.targetNode.id === 'root') {
          handleOutput('Cannot delete workspace root directory.');
          return;
        }
        await this.deleteNode(resolved.targetNode.id);
        handleOutput(`Deleted '${args[0]}'`);
        break;
      }

      case 'cp':
      case 'copy': {
        if (args.length < 2) {
          handleOutput('Usage: cp <source> <destination_name>');
          return;
        }
        const src = this.resolveVirtualNode(args[0]);
        if (!src.exists || !src.targetNode) {
          handleOutput(`Source file not found: ${args[0]}`);
          return;
        }
        const dest = this.resolveVirtualNode(args[1]);
        const copyNode = {
          ...src.targetNode,
          id: 'n_' + Date.now(),
          name: dest.name || `copy_${src.targetNode.name}`,
          parentId: dest.parentId,
          path: `/${dest.name || src.targetNode.name}`,
          updatedAt: Date.now()
        };
        await this.db.saveFile(copyNode);
        this.files.push(copyNode);
        this.renderFileTree();
        handleOutput(`Copied '${args[0]}' to '${copyNode.name}'`);
        break;
      }

      case 'mv':
      case 'move':
      case 'rename': {
        if (args.length < 2) {
          handleOutput('Usage: mv <source> <target_name>');
          return;
        }
        const src = this.resolveVirtualNode(args[0]);
        if (!src.exists || !src.targetNode) {
          handleOutput(`Source not found: ${args[0]}`);
          return;
        }
        const dest = this.resolveVirtualNode(args[1]);
        src.targetNode.name = dest.name;
        src.targetNode.parentId = dest.parentId;
        src.targetNode.updatedAt = Date.now();
        await this.db.saveFile(src.targetNode);
        this.renderFileTree();
        this.renderTabs();
        handleOutput(`Renamed '${args[0]}' to '${dest.name}'`);
        break;
      }

      case 'node':
      case 'js':
      case 'eval': {
        if (!args[0]) {
          handleOutput('Usage: node <file.js> or node "<expression>"');
          return;
        }
        let codeToRun = args.join(' ');
        const resolved = this.resolveVirtualNode(args[0]);
        if (resolved.exists && resolved.targetNode && resolved.targetNode.type === 'file') {
          codeToRun = resolved.targetNode.content || '';
        }

        const logs = [];
        const originalLog = console.log;
        const originalError = console.error;
        const originalWarn = console.warn;

        console.log = (...a) => logs.push(a.map((item) => (typeof item === 'object' ? JSON.stringify(item, null, 2) : String(item))).join(' '));
        console.error = (...a) => logs.push('[ERROR] ' + a.join(' '));
        console.warn = (...a) => logs.push('[WARN] ' + a.join(' '));

        try {
          const result = new Function(codeToRun)();
          if (result !== undefined) logs.push(typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result));
          handleOutput(logs.length > 0 ? logs.join('\n') : '<Completed with return value: undefined>');
        } catch (err) {
          handleOutput(`Runtime Error: ${err.message}`);
        } finally {
          console.log = originalLog;
          console.error = originalError;
          console.warn = originalWarn;
        }
        break;
      }

      case 'grep':
      case 'find': {
        if (!args[0]) {
          handleOutput('Usage: grep <search_term> [optional_file]');
          return;
        }
        const term = args[0].toLowerCase();
        const results = [];

        if (args[1]) {
          const resolved = this.resolveVirtualNode(args[1]);
          if (!resolved.exists || resolved.targetNode.type !== 'file') {
            handleOutput(`File not found: ${args[1]}`);
            return;
          }
          const lines = (resolved.targetNode.content || '').split('\n');
          lines.forEach((l, i) => {
            if (l.toLowerCase().includes(term)) {
              results.push(`${resolved.targetNode.name}:${i + 1}: ${l.trim()}`);
            }
          });
        } else {
          this.files.filter((f) => f.type === 'file').forEach((file) => {
            const lines = (file.content || '').split('\n');
            lines.forEach((l, i) => {
              if (l.toLowerCase().includes(term)) {
                results.push(`${file.name}:${i + 1}: ${l.trim()}`);
              }
            });
          });
        }

        handleOutput(results.length > 0 ? results.join('\n') : `No matches found for '${term}'`);
        break;
      }

      case 'wc': {
        if (!args[0]) {
          handleOutput('Usage: wc <filename>');
          return;
        }
        const resolved = this.resolveVirtualNode(args[0]);
        if (!resolved.exists || resolved.targetNode.type !== 'file') {
          handleOutput(`File not found: ${args[0]}`);
          return;
        }
        const content = resolved.targetNode.content || '';
        const lines = content.split('\n').length;
        const words = content.trim() ? content.trim().split(/\s+/).length : 0;
        const chars = content.length;
        handleOutput(`  ${lines}  ${words}  ${chars}  ${resolved.targetNode.name}`);
        break;
      }

      case 'stat': {
        if (!args[0]) {
          handleOutput('Usage: stat <filename>');
          return;
        }
        const resolved = this.resolveVirtualNode(args[0]);
        if (!resolved.exists || !resolved.targetNode) {
          handleOutput(`Target not found: ${args[0]}`);
          return;
        }
        const n = resolved.targetNode;
        const statText = [
          `  File: ${n.name}`,
          `  Type: ${n.type.toUpperCase()}`,
          `  Path: ${n.path || '/' + n.name}`,
          `  Size: ${n.type === 'file' ? (n.content || '').length + ' bytes' : '<Directory>'}`,
          `  ID:   ${n.id}`,
          `  Last Modified: ${new Date(n.updatedAt || Date.now()).toISOString()}`
        ].join('\n');
        handleOutput(statText);
        break;
      }

      case 'history': {
        if (args[0] === '-c') {
          this.terminalHistory = [];
          this.historyIndex = -1;
          handleOutput('History cleared.');
          return;
        }
        if (this.terminalHistory.length === 0) {
          handleOutput('No commands recorded in history.');
          return;
        }
        const list = this.terminalHistory.map((h, i) => `  ${String(i + 1).padStart(4, ' ')}  ${h}`).join('\n');
        handleOutput(list);
        break;
      }

      case 'echo': {
        handleOutput(args.join(' '));
        break;
      }

      case 'whoami': {
        const platform = this.nativeBridge.isElectron ? 'Electron Native Desktop' : navigator.userAgent.includes('Android') ? 'Capacitor Android Mobile' : 'Standard Web Browser';
        handleOutput(`developer (Platform: ${platform})`);
        break;
      }

      case 'hostname': {
        handleOutput(window.location.hostname || 'localhost-studio');
        break;
      }

      case 'date':
      case 'time': {
        handleOutput(new Date().toString());
        break;
      }

      case 'python':
      case 'python3':
      case 'py': {
        if (args.join(' ').includes('http.server') || args.join(' ').includes('-m http.server')) {
          const port = args.find((a) => /^\d+$/.test(a)) || '8080';
          handleOutput(`Serving HTTP on 0.0.0.0 port ${port} (http://localhost:${port}/) ...\nOpening Live Preview...`);
          this.runLiveBrowser();
          return;
        }

        if (args[0] && (args[0].endsWith('.py') || args[0].endsWith('.txt'))) {
          const resolved = this.resolveVirtualNode(args[0]);
          if (!resolved.exists || !resolved.targetNode) {
            handleOutput(`python: can't open file '${args[0]}': [Errno 2] No such file or directory`);
            return;
          }
          handleOutput(`[Python Runtime Emulator]\nExecuting ${args[0]}...\nProcess finished with exit code 0.`);
          return;
        }

        if (args.length > 0 && args[0] === '-c') {
          handleOutput(`[Python Eval]: ${args.slice(1).join(' ')}`);
          return;
        }

        handleOutput(`Python 3.11.4 (Virtual Studio Sandbox)\nType "help", "copyright", "credits" or "license" for more information.\nUse 'python -m http.server' to start live server.`);
        break;
      }

      case 'serve':
      case 'live-server':
      case 'start': {
        handleOutput('Starting local development server...\nLaunching Integrated Preview.');
        this.runLiveBrowser();
        break;
      }

      case 'git': {
        const sub = args[0];
        if (sub === 'status') {
          handleOutput(`On branch main\nYour branch is up to date with 'origin/main'.\n\nChanges not staged for commit:\n  (use "git add <file>..." to update what will be committed)\n\n  modified:   style.css\n\nno changes added to commit (use "git add")`);
        } else if (sub === 'log') {
          handleOutput(`commit 7fa3bc98a12 (HEAD -> main, origin/main)\nAuthor: developer <dev@workspace>\nDate:   ${new Date().toDateString()}\n\n    Initial SaaS project workspace setup`);
        } else {
          handleOutput(`git version 2.41.0.windows.1 (Virtual Workspace)\nExecuted git ${args.join(' ')} successfully.`);
        }
        break;
      }

      case 'npm':
      case 'yarn':
      case 'pnpm': {
        const action = args[0] || 'run';
        if (action === 'start' || action === 'dev' || action === 'serve') {
          handleOutput(`> workspace@1.0.0 ${action}\n> vite / dev-server running at http://localhost:3000\nLaunching preview window.`);
          this.runLiveBrowser();
        } else {
          handleOutput(`[Virtual Package Manager] ${command} ${args.join(' ')} completed. 0 vulnerabilities found.`);
        }
        break;
      }

      default: {
        handleOutput(`'${command}' is not recognized as an internal or external command, operable program or batch file. Type 'help' for available commands.`);
        break;
      }
    }
  }

  appendTerminalOutput(text, isAnsi = false) {
    const line = document.createElement('div');
    line.style.whiteSpace = 'pre-wrap';
    line.style.wordBreak = 'break-word';
    if (isAnsi) {
      line.innerHTML = UIHelper.ansiToHtml(text);
    } else {
      line.textContent = text;
    }
    this.dom.terminalOutput.appendChild(line);
    this.dom.terminalOutput.scrollTop = this.dom.terminalOutput.scrollHeight;
  }

  /* ================= SYNTAX & CODE VALIDATOR (PROBLEMS PANEL) ================= */
  validateCurrentCode() {
    if (!this.activeFileId) return;
    const file = this.files.find((f) => f.id === this.activeFileId);
    if (!file) return;

    const code = this.dom.codeEditor.value;
    const ext = file.name.split('.').pop().toLowerCase();
    const problems = [];

    // Валидация JavaScript / JSON
    if (ext === 'js' || ext === 'mjs') {
      try {
        new Function(code);
      } catch (err) {
        let line = 1;
        const match = err.stack ? err.stack.match(/<anonymous>:(\d+):(\d+)/) : null;
        if (match) line = parseInt(match[1], 10) - 2;
        problems.push({
          file: file.name,
          line: Math.max(1, line),
          message: err.message,
          severity: 'error'
        });
      }
    } else if (ext === 'json') {
      try {
        if (code.trim()) JSON.parse(code);
      } catch (err) {
        let line = 1;
        const posMatch = err.message.match(/position\s+(\d+)/i);
        if (posMatch) {
          const charPos = parseInt(posMatch[1], 10);
          line = code.substring(0, charPos).split('\n').length;
        }
        problems.push({
          file: file.name,
          line,
          message: err.message,
          severity: 'error'
        });
      }
    } else if (ext === 'html' || ext === 'htm') {
      // Проверка незакрытых тегов и базового синтаксиса HTML
      const openTags = [];
      const tagRegex = /<\/?([a-zA-Z0-9\-]+)[^>]*>/g;
      let match;
      const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr', '!doctype']);

      while ((match = tagRegex.exec(code)) !== null) {
        const fullTag = match[0];
        const tagName = match[1].toLowerCase();
        if (voidTags.has(tagName) || fullTag.endsWith('/>')) continue;

        if (fullTag.startsWith('</')) {
          if (openTags.length === 0 || openTags[openTags.length - 1] !== tagName) {
            const line = code.substring(0, match.index).split('\n').length;
            problems.push({
              file: file.name,
              line,
              message: `Unexpected closing tag </${tagName}>`,
              severity: 'warn'
            });
          } else {
            openTags.pop();
          }
        } else {
          openTags.push(tagName);
        }
      }
    }

    this.renderProblems(problems);
  }

  renderProblems(problems) {
    this.dom.problemsList.innerHTML = '';
    this.dom.problemsBadge.textContent = problems.length;
    this.dom.problemsBadge.classList.toggle('has-errors', problems.length > 0);

    if (problems.length === 0) {
      this.dom.problemsList.innerHTML = `<div class="problem-empty">No problems detected in ${this.dom.activeFileIndicator.textContent}.</div>`;
      return;
    }

    problems.forEach((prob) => {
      const item = document.createElement('div');
      item.className = 'problem-item';
      item.innerHTML = `
        <span class="problem-severity-${prob.severity}">${prob.severity.toUpperCase()}</span>
        <span class="problem-loc">[Ln ${prob.line}]</span>
        <span class="problem-msg">${prob.message}</span>
      `;
      item.addEventListener('click', () => {
        this.goToLine(prob.line);
      });
      this.dom.problemsList.appendChild(item);
    });
  }

  goToLine(lineNumber) {
    const lines = this.dom.codeEditor.value.split('\n');
    let charIndex = 0;
    for (let i = 0; i < Math.min(lineNumber - 1, lines.length); i++) {
      charIndex += lines[i].length + 1;
    }
    this.dom.codeEditor.focus();
    this.dom.codeEditor.setSelectionRange(charIndex, charIndex + (lines[lineNumber - 1] || '').length);
    this.updateCursorStats();
  }

  /* ================= LIVE BROWSER / PREVIEW TRIGGER ================= */
  runLiveBrowser() {
    const htmlFile = this.files.find((f) => f.name.endsWith('.html')) || this.files.find((f) => f.type === 'file');
    if (!htmlFile) {
      this.appendTerminalOutput('Live Preview: No files found in workspace to preview.');
      return;
    }

    if (window.IdeBrowserController && typeof window.IdeBrowserController.launch === 'function') {
      window.IdeBrowserController.launch(htmlFile.content);
      return;
    }

    // Встроенный предпросмотр: связывание HTML + CSS + JS из рабочего пространства
    let previewModal = document.getElementById('integrated-live-preview-modal');
    if (!previewModal) {
      previewModal = document.createElement('div');
      previewModal.id = 'integrated-live-preview-modal';
      previewModal.style.cssText = 'position:fixed;top:40px;right:20px;width:min(600px,90vw);height:min(500px,80vh);background:#121316;border:1px solid rgba(255,255,255,0.15);border-radius:8px;box-shadow:0 20px 40px rgba(0,0,0,0.6);z-index:9999;display:flex;flex-direction:column;overflow:hidden;backdrop-filter:blur(10px);';
      
      previewModal.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 14px;background:#181a1f;border-bottom:1px solid rgba(255,255,255,0.08);font-size:12px;color:#9da5b4;user-select:none;">
          <span style="display:flex;align-items:center;gap:6px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polygon points="10 8 16 12 10 16 10 8"></polygon></svg>
            Live Preview (${htmlFile.name})
          </span>
          <button id="btn-close-live-preview" style="background:none;border:none;color:#9da5b4;cursor:pointer;font-size:16px;line-height:1;">&times;</button>
        </div>
        <iframe id="integrated-preview-iframe" style="flex:1;border:none;background:#fff;width:100%;height:100%;"></iframe>
      `;
      document.body.appendChild(previewModal);

      previewModal.querySelector('#btn-close-live-preview').addEventListener('click', () => {
        previewModal.style.display = 'none';
      });
    }

    let sourceHtml = htmlFile.content || '<!DOCTYPE html><html><body><h1>Empty File</h1></body></html>';
    
    // Внедрение локальных стилей CSS и JS файлов из виртуального дерева
    const cssFiles = this.files.filter((f) => f.name.endsWith('.css'));
    cssFiles.forEach((css) => {
      sourceHtml = sourceHtml.replace(new RegExp(`<link[^>]*href=["']\\.?\\/?${css.name}["'][^>]*>`, 'gi'), `<style>${css.content || ''}</style>`);
    });

    const jsFiles = this.files.filter((f) => f.name.endsWith('.js'));
    jsFiles.forEach((js) => {
      sourceHtml = sourceHtml.replace(new RegExp(`<script[^>]*src=["']\\.?\\/?${js.name}["'][^>]*>\\s*<\\/script>`, 'gi'), `<script>${js.content || ''}<\/script>`);
    });

    const iframe = previewModal.querySelector('#integrated-preview-iframe');
    previewModal.style.display = 'flex';
    iframe.srcdoc = sourceHtml;
  }

  toggleSidebar(state = null) {
    const isHidden = this.dom.sidebar.classList.toggle('hidden', state === null ? undefined : !state);
    if (this.dom.backdrop) {
      this.dom.backdrop.classList.toggle('active', !isHidden && window.innerWidth <= 768);
    }
  }

  /* ================= ATTACH EVENT LISTENERS ================= */
  attachEventListeners() {
    const bindClick = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', fn);
    };

    // Synchronized scroll between textarea and pre highlight layer
    if (this.dom.codeEditor) {
      this.dom.codeEditor.addEventListener('scroll', () => {
        if (this.dom.codeOutput && this.dom.codeOutput.parentElement) {
          this.dom.codeOutput.parentElement.scrollTop = this.dom.codeEditor.scrollTop;
          this.dom.codeOutput.parentElement.scrollLeft = this.dom.codeEditor.scrollLeft;
        }
        if (this.dom.gutter) {
          this.dom.gutter.scrollTop = this.dom.codeEditor.scrollTop;
        }
      });

      this.dom.codeEditor.addEventListener('input', () => {
        this.updateSyntaxAndGutter();
        this.checkDirtyState();
        this.validateCurrentCode();
      });

      this.dom.codeEditor.addEventListener('click', () => this.updateCursorStats());
      this.dom.codeEditor.addEventListener('keyup', () => {
        this.updateCursorStats();
        this.checkDirtyState();
      });

      this.dom.codeEditor.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
          e.preventDefault();
          const start = this.dom.codeEditor.selectionStart;
          const end = this.dom.codeEditor.selectionEnd;
          this.dom.codeEditor.value = this.dom.codeEditor.value.substring(0, start) + '  ' + this.dom.codeEditor.value.substring(end);
          this.dom.codeEditor.selectionStart = this.dom.codeEditor.selectionEnd = start + 2;
          this.updateSyntaxAndGutter();
        }
      });
    }

    document.addEventListener('selectionchange', () => {
      if (this.dom.codeEditor && document.activeElement === this.dom.codeEditor) {
        this.updateCursorStats();
      }
    });

    // Поиск по коду (Ctrl+F)
    const findBar = document.getElementById('find-bar');
    const findInput = document.getElementById('find-input');
    const findCount = document.getElementById('find-count');

    if (findInput && findCount && this.dom.codeEditor) {
      findInput.addEventListener('input', () => {
        const query = findInput.value;
        if (!query) {
          findCount.textContent = '0/0';
          return;
        }
        const text = this.dom.codeEditor.value;
        const matches = text.split(query).length - 1;
        findCount.textContent = matches > 0 ? `Matches: ${matches}` : 'No matches';
      });
    }

    bindClick('btn-close-find', () => {
      if (findBar) findBar.style.display = 'none';
      if (this.dom.codeEditor) this.dom.codeEditor.focus();
    });

    // Мобильный свайп для закрытия сайдбара
    if (this.dom.sidebar) {
      let touchStartX = 0;
      this.dom.sidebar.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
      }, { passive: true });

      this.dom.sidebar.addEventListener('touchend', (e) => {
        const diffX = touchStartX - e.changedTouches[0].clientX;
        if (diffX > 60 && window.innerWidth <= 768) {
          this.toggleSidebar(false);
        }
      });
    }

    // Global Keybindings (Ctrl+S, Ctrl+F, Ctrl+B, Ctrl+`)
    window.addEventListener('keydown', (e) => {
      const isCmdOrCtrl = e.ctrlKey || e.metaKey;
      if (isCmdOrCtrl && e.key.toLowerCase() === 's') {
        e.preventDefault();
        this.saveActiveFile();
      } else if (isCmdOrCtrl && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        if (findBar) {
          findBar.style.display = findBar.style.display === 'none' ? 'flex' : 'none';
          if (findBar.style.display === 'flex' && findInput) {
            findInput.focus();
            findInput.select();
          }
        }
      } else if (isCmdOrCtrl && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        this.toggleSidebar();
      } else if (isCmdOrCtrl && e.key === '`') {
        e.preventDefault();
        this.toggleTerminal();
      }
    });

    // Toolbar Buttons
    bindClick('btn-save', () => this.saveActiveFile());
    bindClick('btn-toggle-sidebar', () => this.toggleSidebar());
    bindClick('btn-new-file', () => this.createNewNodePrompt('file', 'root'));
    bindClick('btn-new-folder', () => this.createNewNodePrompt('folder', 'root'));
    bindClick('btn-terminal-toggle', () => this.toggleTerminal());
    bindClick('btn-timeline-toggle', () => {
      if (this.dom.timelinePanel) {
        this.dom.timelinePanel.classList.toggle('collapsed');
        if (!this.dom.timelinePanel.classList.contains('collapsed') && this.activeFileId) {
          this.renderTimelineList(this.activeFileId);
        }
      }
    });
    bindClick('btn-close-timeline', () => {
      if (this.dom.timelinePanel) this.dom.timelinePanel.classList.add('collapsed');
    });
    bindClick('btn-live-browser', () => this.runLiveBrowser());

    // Terminal Commands & Keys
    if (this.dom.terminalInput) {
      this.dom.terminalInput.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key.toLowerCase() === 'c') {
          if (this.runningProcess && this.activeExecutionId) {
            if (this.nativeBridge.isElectron && window.electronAPI.execKill) {
              window.electronAPI.execKill(this.activeExecutionId);
            }
            this.appendTerminalOutput('^C [Process terminated]');
            this.runningProcess = null;
            this.activeExecutionId = null;
            this.updateTerminalPrompt();
          }
          return;
        }

        if (e.key === 'Enter') {
          const val = this.dom.terminalInput.value;
          if (val.trim()) {
            this.terminalHistory.push(val);
            this.historyIndex = this.terminalHistory.length;
          }
          this.executeTerminalCommand(val);
          this.dom.terminalInput.value = '';
          this.tempHistoryDraft = '';
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (this.terminalHistory.length === 0) return;
          if (this.historyIndex === this.terminalHistory.length) {
            this.tempHistoryDraft = this.dom.terminalInput.value;
          }
          if (this.historyIndex > 0) {
            this.historyIndex--;
            this.dom.terminalInput.value = this.terminalHistory[this.historyIndex];
            setTimeout(() => {
              this.dom.terminalInput.selectionStart = this.dom.terminalInput.selectionEnd = this.dom.terminalInput.value.length;
            }, 0);
          }
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (this.historyIndex < this.terminalHistory.length - 1) {
            this.historyIndex++;
            this.dom.terminalInput.value = this.terminalHistory[this.historyIndex];
          } else if (this.historyIndex === this.terminalHistory.length - 1) {
            this.historyIndex = this.terminalHistory.length;
            this.dom.terminalInput.value = this.tempHistoryDraft;
          }
        } else if (e.key === 'Tab') {
          e.preventDefault();
          this.handleTerminalTabCompletion();
        }
      });
    }

    bindClick('btn-clear-terminal', () => {
      if (this.dom.terminalOutput) this.dom.terminalOutput.innerHTML = '';
    });
    bindClick('btn-close-terminal', () => this.toggleTerminal(false));

    if (this.dom.terminalPanel) {
      this.dom.terminalPanel.addEventListener('click', (e) => {
        if (!e.target.closest('button') && !e.target.closest('.terminal-tab') && this.dom.terminalInput) {
          this.dom.terminalInput.focus();
        }
      });
    }

    // Контекстное меню по свободному месту в дереве файлов
    if (this.dom.fileTree) {
      this.dom.fileTree.addEventListener('contextmenu', (e) => {
        if (e.target === this.dom.fileTree) {
          e.preventDefault();
          e.stopPropagation();
          this.showContextMenu(e.clientX, e.clientY, null);
        }
      });
    }

    // Вкладки терминала
    document.querySelectorAll('.terminal-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.terminal-tab').forEach((t) => t.classList.remove('active'));
        document.querySelectorAll('.terminal-tab-view').forEach((v) => v.classList.remove('active'));
        tab.classList.add('active');
        const targetId = tab.dataset.target ? tab.dataset.target.replace('tab-', 'view-') : null;
        if (targetId) {
          const targetEl = document.getElementById(targetId);
          if (targetEl) targetEl.classList.add('active');
        }
      });
    });

    // Context Menu Interaction
    if (this.dom.contextMenu) {
      this.dom.contextMenu.addEventListener('click', (e) => {
        const item = e.target.closest('.context-menu-item');
        if (item && !item.classList.contains('disabled')) {
          this.handleContextMenuAction(item.dataset.action);
        }
      });
    }
    window.addEventListener('click', () => this.closeContextMenu());

    // Sidebar Resizer
    if (this.dom.resizer && this.dom.sidebar) {
      let isResizing = false;
      this.dom.resizer.addEventListener('mousedown', () => {
        isResizing = true;
        this.dom.resizer.classList.add('resizing');
        document.body.style.userSelect = 'none';
      });
      window.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const newWidth = Math.min(Math.max(140, e.clientX), 500);
        this.dom.sidebar.style.width = `${newWidth}px`;
      });
      window.addEventListener('mouseup', () => {
        if (isResizing) {
          isResizing = false;
          this.dom.resizer.classList.remove('resizing');
          document.body.style.userSelect = '';
        }
      });
    }

    // Mobile swipe and backdrop
    bindClick('btn-close-sidebar-mobile', () => this.toggleSidebar(false));
    if (this.dom.backdrop) {
      this.dom.backdrop.addEventListener('click', () => this.toggleSidebar(false));
    }

    // Open-With Modal
    bindClick('btn-close-modal', () => {
      if (this.dom.openWithModal) this.dom.openWithModal.style.display = 'none';
    });

    if (this.dom.openWithModal) {
      this.dom.openWithModal.querySelectorAll('.modal-list-item').forEach((item) => {
        item.addEventListener('click', () => {
          this.dom.openWithModal.style.display = 'none';
          if (item.dataset.app === 'internal-browser') this.runLiveBrowser();
        });
      });
    }
  }
}

// App Bootstrap
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const app = new AppController();
    await app.start();
  } catch (err) {
    console.error('Fatal initialization error:', err);
  }
});