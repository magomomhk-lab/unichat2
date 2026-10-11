/* ============================================================
   aiAppAnim.js — Thinking Orbs Engine (Vanilla ES6+)
   Dotted thought-orb animations for AI & agent interfaces.
   Tuned states: shaping, working, searching, solving, listening, composing
============================================================ */

(() => {
  'use strict';

  const activeThinkingOrbs = new Set();

  class ThinkingOrb {
    constructor(canvasOrContainer, options = {}) {
    if (typeof canvasOrContainer === 'string') {
      this.container = document.querySelector(canvasOrContainer);
      this.canvas = document.createElement('canvas');
      if (this.container) this.container.appendChild(this.canvas);
    } else if (canvasOrContainer instanceof HTMLCanvasElement) {
      this.canvas = canvasOrContainer;
      this.container = canvasOrContainer.parentElement;
    } else if (canvasOrContainer instanceof HTMLElement) {
      this.container = canvasOrContainer;
      this.canvas = document.createElement('canvas');
      this.container.appendChild(this.canvas);
    } else {
      this.canvas = document.createElement('canvas');
    }

    this.ctx = this.canvas.getContext('2d', { alpha: true });
    this.options = Object.assign({
      state: options.state || 'shaping',
      size: options.size || 64,
      theme: options.theme || 'auto',
      color: options.color || null,
      speed: typeof options.speed === 'number' ? options.speed : 1.0,
      paused: !!options.paused
    }, options);
    this.state = this.options.state;
    this.size = this.options.size;
    this.theme = this.options.theme;
    this.customColor = this.options.color;
    this.speed = this.options.speed;
    this.paused = this.options.paused;

    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.rafId = null;
    this.startTime = performance.now();
    this.lastTime = this.startTime;
    this.isVisible = true;

    activeThinkingOrbs.add(this);
    this.init();
  }

  init() {
    this.setupCanvas();
    this.setupObserver();
    this.startLoop();
  }

  setupCanvas() {
    if (!this.canvas) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssSize = this.size;
    this.canvas.width = Math.round(cssSize * this.dpr);
    this.canvas.height = Math.round(cssSize * this.dpr);
    this.canvas.style.width = cssSize + 'px';
    this.canvas.style.height = cssSize + 'px';
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', this.getAriaLabel());
  }

  getAriaLabel() {
    const labels = {
      working: 'Processing task…',
      searching: 'Searching web & context…',
      solving: 'Reasoning through problem…',
      listening: 'Capturing audio…',
      composing: 'Drafting response…',
      shaping: 'Structuring artifact…'
    };
    return labels[this.state] || 'AI thinking…';
  }

  setupObserver() {
    if (typeof IntersectionObserver !== 'undefined' && this.canvas) {
      this.observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          this.isVisible = entry.isIntersecting;
          if (this.isVisible && !this.rafId && !this.paused) {
            this.startLoop();
          }
        });
      }, { threshold: 0.05 });
      this.observer.observe(this.canvas);
    }

    this.visHandler = () => {
      if (document.hidden) {
        this.isVisible = false;
      } else {
        this.isVisible = true;
        if (!this.rafId && !this.paused) this.startLoop();
      }
    };
    document.addEventListener('visibilitychange', this.visHandler);
  }

  resolveThemeIsDark() {
    if (this.theme === 'dark') return true;
    if (this.theme === 'light') return false;

    let node = this.canvas;
    while (node && node !== document.documentElement) {
      if (node.dataset && (node.dataset.theme === 'dark' || node.dataset.theme === 'light')) {
        return node.dataset.theme === 'dark';
      }
      if (node.classList && (node.classList.contains('dark') || node.classList.contains('light'))) {
        return node.classList.contains('dark');
      }
      node = node.parentElement;
    }

    const docTheme = document.documentElement.dataset.theme;
    if (docTheme) return docTheme === 'dark';

    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  getInkColor(alpha, depthFactor) {
    if (this.customColor) {
      if (this.customColor.startsWith('#')) {
        const hex = this.customColor.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16) || 140;
        const g = parseInt(hex.substring(2, 4), 16) || 200;
        const b = parseInt(hex.substring(4, 6), 16) || 245;
        return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
      }
      return this.customColor;
    }

    const isDark = this.resolveThemeIsDark();
    if (isDark) {
      const v = Math.round(210 + 45 * depthFactor);
      return `rgba(${v}, ${v}, ${v}, ${alpha.toFixed(3)})`;
    } else {
      const v = Math.round(25 + 35 * (1 - depthFactor));
      return `rgba(${v}, ${v}, ${v}, ${alpha.toFixed(3)})`;
    }
  }

  startLoop() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    let lastRenderTime = 0;
    const isMobileDevice = (typeof window !== 'undefined') &&
      ((window.matchMedia && matchMedia('(pointer:coarse)').matches) || window.innerWidth <= 768);
    const frameInterval = isMobileDevice ? (1000 / 30) : (1000 / 60);

    const loop = (ts) => {
      if (!this.isVisible || this.paused) {
        this.rafId = null;
        return;
      }
      if (ts - lastRenderTime >= frameInterval) {
        lastRenderTime = ts;
        this.render(ts);
      }
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  render(ts) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (!ctx || w <= 0 || h <= 0) return;

    ctx.clearRect(0, 0, w, h);

    const t = ((ts - this.startTime) / 1000) * this.speed;
    const cx = w / 2;
    const cy = h / 2;
    const radius = (w / 2) * 0.72;

    const dots = [];

    switch (this.state) {
      case 'shaping':
        this.computeShaping(t, radius, dots);
        break;
      case 'working':
        this.computeWorking(t, radius, dots);
        break;
      case 'searching':
        this.computeSearching(t, radius, dots);
        break;
      case 'solving':
        this.computeSolving(t, radius, dots);
        break;
      case 'listening':
        this.computeListening(t, radius, dots);
        break;
      case 'composing':
      default:
        this.computeComposing(t, radius, dots);
        break;
    }

    dots.sort((a, b) => a.z - b.z);

    for (let i = 0; i < dots.length; i++) {
      const d = dots[i];
      const normZ = Math.max(-1, Math.min(1, d.z / radius));
      const depthFactor = (normZ + 1) / 2;
      const alpha = Math.max(0.08, Math.min(0.98, d.alpha !== undefined ? d.alpha : 0.2 + 0.8 * depthFactor));
      const r = Math.max(1, (d.size || 2.4) * (0.65 + 0.55 * depthFactor) * (this.dpr / 2));

      ctx.beginPath();
      ctx.arc(cx + d.x, cy + d.y, r, 0, Math.PI * 2);
      ctx.fillStyle = this.getInkColor(alpha, depthFactor);
      ctx.fill();
    }
  }

  /* 1. SHAPING: Дот-контур плавно трансформируется: Circle -> Triangle -> Square -> Circle */
  computeShaping(t, R, out) {
    const N = 42;
    const cycle = (t * 0.45) % 3;
    const stage = Math.floor(cycle);
    const rawP = cycle - stage;
    const p = rawP * rawP * (3 - 2 * rawP);

    const yaw = t * 0.6;
    const tilt = 0.28;

    for (let i = 0; i < N; i++) {
      const u = i / N;
      const theta = u * Math.PI * 2;

      // Форма 0: Окружность
      const cX = R * Math.cos(theta);
      const cY = R * Math.sin(theta);

      // Форма 1: Равносторонний треугольник
      const triU = (u * 3) % 3;
      const triSide = Math.floor(triU);
      const triF = triU - triSide;
      const v0Ang = -Math.PI / 2 + (triSide * 2 * Math.PI) / 3;
      const v1Ang = -Math.PI / 2 + ((triSide + 1) * 2 * Math.PI) / 3;
      const tX = R * (Math.cos(v0Ang) * (1 - triF) + Math.cos(v1Ang) * triF);
      const tY = R * (Math.sin(v0Ang) * (1 - triF) + Math.sin(v1Ang) * triF);

      // Форма 2: Скруглённый квадрат
      const sqU = (u * 4) % 4;
      const sqSide = Math.floor(sqU);
      const sqF = sqU - sqSide;
      const sR = R * 0.88;
      let sX = 0, sY = 0;
      if (sqSide === 0) { sX = -sR + 2 * sR * sqF; sY = -sR; }
      else if (sqSide === 1) { sX = sR; sY = -sR + 2 * sR * sqF; }
      else if (sqSide === 2) { sX = sR - 2 * sR * sqF; sY = sR; }
      else { sX = -sR; sY = sR - 2 * sR * sqF; }

      let x2d = 0, y2d = 0;
      if (stage === 0) {
        x2d = cX * (1 - p) + tX * p;
        y2d = cY * (1 - p) + tY * p;
      } else if (stage === 1) {
        x2d = tX * (1 - p) + sX * p;
        y2d = tY * (1 - p) + sY * p;
      } else {
        x2d = sX * (1 - p) + cX * p;
        y2d = sY * (1 - p) + cY * p;
      }

      const z3d = Math.sin(theta + t * 1.5) * (R * 0.28);
      const rotX = x2d * Math.cos(yaw) - z3d * Math.sin(yaw);
      const rotZ = x2d * Math.sin(yaw) + z3d * Math.cos(yaw);
      const rotY = y2d * Math.cos(tilt) - rotZ * Math.sin(tilt);
      const finalZ = y2d * Math.sin(tilt) + rotZ * Math.cos(tilt);

      out.push({
        x: rotX,
        y: rotY,
        z: finalZ,
        size: 2.8,
        alpha: 0.35 + 0.65 * ((finalZ / R + 1) / 2)
      });
    }
  }

  /* 2. WORKING: Частицы вращаются по наклоненным орбитам */
  computeWorking(t, R, out) {
    const orbits = [
      { tiltX: 0.85, tiltY: 0.4, speed: 1.2, count: 14, r: R * 0.95 },
      { tiltX: -0.65, tiltY: 0.9, speed: -1.0, count: 12, r: R * 0.8 },
      { tiltX: 0.2, tiltY: -0.8, speed: 1.5, count: 10, r: R * 0.68 }
    ];

    orbits.forEach((orb, oIdx) => {
      for (let i = 0; i < orb.count; i++) {
        const phi = (i / orb.count) * Math.PI * 2 + t * orb.speed;
        let x = orb.r * Math.cos(phi);
        let y = orb.r * Math.sin(phi);
        let z = 0;

        const y1 = y * Math.cos(orb.tiltX) - z * Math.sin(orb.tiltX);
        const z1 = y * Math.sin(orb.tiltX) + z * Math.cos(orb.tiltX);
        const x2 = x * Math.cos(orb.tiltY) + z1 * Math.sin(orb.tiltY);
        const z2 = -x * Math.sin(orb.tiltY) + z1 * Math.cos(orb.tiltY);

        out.push({ x: x2, y: y1, z: z2, size: 2.5 });
      }
    });
  }

  /* 3. SEARCHING: Сканирующий меридиан проходит по точечной сфере */
  computeSearching(t, R, out) {
    const latBands = 7;
    const scanAngle = (t * 2.2) % (Math.PI * 2);

    for (let b = 1; b < latBands; b++) {
      const lat = (b / latBands) * Math.PI - Math.PI / 2;
      const cosLat = Math.cos(lat);
      const sinLat = Math.sin(lat);
      const rRing = R * cosLat;
      const count = Math.max(4, Math.round(18 * cosLat));

      for (let i = 0; i < count; i++) {
        const lon = (i / count) * Math.PI * 2 + t * 0.4;
        const x = rRing * Math.cos(lon);
        const z = rRing * Math.sin(lon);
        const y = R * sinLat;

        let diff = Math.abs(lon - scanAngle) % (Math.PI * 2);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        const scanProximity = Math.max(0, 1 - diff / 0.65);

        out.push({
          x,
          y,
          z,
          size: 2.2 + scanProximity * 2.2,
          alpha: 0.2 + scanProximity * 0.8
        });
      }
    }
  }

  /* 4. SOLVING: Пояса вращаются с задержками и возвращаются в фазу */
  computeSolving(t, R, out) {
    const bands = 5;
    const period = 3.2;
    const cycle = (t / period) % 1;
    const isScramble = cycle < 0.65;
    const p = isScramble ? Math.sin((cycle / 0.65) * Math.PI) : 0;

    for (let b = 0; b < bands; b++) {
      const lat = ((b + 0.5) / bands) * Math.PI - Math.PI / 2;
      const rBand = R * Math.cos(lat);
      const y = R * Math.sin(lat);
      const count = 12;
      const bandOffset = ((b % 2 === 0 ? 1 : -1) * (Math.PI / 2)) * p;

      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + t * 0.6 + bandOffset;
        const x = rBand * Math.cos(angle);
        const z = rBand * Math.sin(angle);
        out.push({ x, y, z, size: 2.4 });
      }
    }
  }

  /* 5. LISTENING: Волны проходят через кольца широты */
  computeListening(t, R, out) {
    const rings = 6;
    for (let r = 0; r < rings; r++) {
      const lat = ((r + 0.5) / rings) * Math.PI - Math.PI / 2;
      const count = 14;
      for (let i = 0; i < count; i++) {
        const phi = (i / count) * Math.PI * 2;
        const wave = Math.sin(phi * 2 - t * 4 + lat * 2) * (R * 0.16);
        const curR = (R + wave) * Math.cos(lat);
        const x = curR * Math.cos(phi + t * 0.5);
        const z = curR * Math.sin(phi + t * 0.5);
        const y = (R + wave) * Math.sin(lat);

        out.push({ x, y, z, size: 2.3 });
      }
    }
  }

  /* 6. COMPOSING: Волнообразная лента из точек */
  computeComposing(t, R, out) {
    const points = 38;
    for (let i = 0; i < points; i++) {
      const u = i / points;
      const phi = u * Math.PI * 2;
      const yWave = Math.sin(phi * 2 + t * 2.5) * (R * 0.38);
      const curR = Math.sqrt(Math.max(0, R * R - yWave * yWave));
      const x = curR * Math.cos(phi + t * 0.8);
      const z = curR * Math.sin(phi + t * 0.8);

      out.push({ x, y: yWave, z, size: 2.6 });
    }
  }

  setState(newState) {
    if (this.options) this.options.state = newState;
    if (this.state === newState) return;
    this.state = newState;
    if (this.canvas) this.canvas.setAttribute('aria-label', this.getAriaLabel());
  }

  setTheme(newTheme) {
    if (this.options) this.options.theme = newTheme;
    this.theme = newTheme;
  }

  setColor(newColor) {
    if (this.options) this.options.color = newColor;
    this.customColor = newColor;
  }

  setSpeed(newSpeed) {
    if (this.options) this.options.speed = newSpeed;
    this.speed = newSpeed;
  }

  destroy() {
    activeThinkingOrbs.delete(this);
    if (this.rafId) cancelAnimationFrame(this.rafId);
    if (this.observer) this.observer.disconnect();
    if (this.visHandler) document.removeEventListener('visibilitychange', this.visHandler);
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.remove();
    }
  }

  static syncTheme(newTheme) {
    activeThinkingOrbs.forEach(orb => {
      if (orb && typeof orb.setTheme === 'function') {
        orb.setTheme(newTheme);
      }
    });
  }

  static createPill(opts = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'thinking-orb-pill no-sel ' + (opts.className || '');

    const slot = document.createElement('span');
    slot.className = 'thinking-orb-slot';

    const canvas = document.createElement('canvas');
    canvas.width = opts.size || 56;
    canvas.height = opts.size || 56;
    slot.appendChild(canvas);

    const info = document.createElement('div');
    info.className = 'thinking-orb-content';

    const label = document.createElement('span');
    label.className = 'thinking-orb-label';
    label.textContent = opts.label || 'Shaping….';

    info.appendChild(label);

    if (opts.subtitle) {
      const sub = document.createElement('span');
      sub.className = 'thinking-orb-sub';
      sub.textContent = opts.subtitle;
      info.appendChild(sub);
    }

    wrap.appendChild(slot);
    wrap.appendChild(info);

    const orb = new ThinkingOrb(canvas, {
      state: opts.state || 'shaping',
      size: opts.size || 56,
      theme: opts.theme || 'auto',
      color: opts.color || null,
      speed: opts.speed || 1.0
    });

    wrap._orbInstance = orb;
    return wrap;
  }
}

function enhanceArtifactOrbs(root) {
    if (!root) return;
    const pills = root.querySelectorAll('.artifact-thinking-pill, [data-art-shaping]');
    pills.forEach(pill => {
      const canvas = pill.querySelector('.artifact-orb-canvas');
      if (!canvas) return;
      const activeTheme = (window.state && window.state.settings && window.state.settings.theme) || 'dark';
      const accent = (window.state && window.state.settings && window.state.settings.customThemes?.[activeTheme]?.accentColor) || null;
      const OrbConstructor = window.ArtifactOrb || ThinkingOrb;
      if (!canvas._orbInstance) {
        canvas._orbInstance = new OrbConstructor(canvas, {
          state: 'shaping',
          size: 56,
          theme: activeTheme,
          color: accent,
          speed: 1.15
        });
      } else {
        if (typeof canvas._orbInstance.setTheme === 'function') canvas._orbInstance.setTheme(activeTheme);
        if (accent && typeof canvas._orbInstance.setColor === 'function') canvas._orbInstance.setColor(accent);
      }
    });
  }

  window.ArtifactOrb = ThinkingOrb;
  if (!window.ThinkingOrb) {
    window.ThinkingOrb = ThinkingOrb;
  }
  window.enhanceArtifactOrbs = enhanceArtifactOrbs;
})();