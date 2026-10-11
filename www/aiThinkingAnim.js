// Это aiThinkingAnim.js. Сейчас тут реализована логика работы typescript, но надо перевести её БЕЗ ПОТЕРИ КАЧЕСТВА в JavaScript и ЗАМЕНИТЬ ею анимацию размышлений в ai.html.
// Эта анимация В РАЗЫ лучше той, что сейчас реализована в ai.html/js/css. ИМЕННО ЭТА АНИМАЦИЯ! Этот размер кнопки, ЭТА ЖЕ сфера, ЭТА ЖЕ анимация, ЭТОТ ЖЕ размыер и СООТВЕТСВТУЮЩИЙ ЕМУ меню размышлений.

/**
 * ThinkingOrb — Pure Vanilla JavaScript Canvas Engine (ported from thinking-orbs by Jakub Antalik).
 * High-performance 2D Canvas engine with 3D projection, depth shading, and z-sorting.
 * States: 'working', 'searching', 'solving', 'listening', 'composing', 'shaping'.
 * Tuned size presets: 64 (chat-avatar / pill scale) and 20 (inline scale).
 * Fully compatible with Electron Desktop, Capacitor Android WebView, and Web Browsers.
 */
(function (global) {
  'use strict';

  const INSTANCES = new Set();
  let sharedClockRaf = null;
  let sharedClockStart = performance.now();

  function getGlobalTheme() {
    if (typeof document === 'undefined') return 'dark';
    const docTheme = document.documentElement.dataset.theme;
    if (docTheme === 'light' || docTheme === 'dark') return docTheme;
    if (document.documentElement.classList.contains('light')) return 'light';
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
    return 'dark';
  }

  function parseHexToRgb(hex) {
    if (!hex || typeof hex !== 'string') return null;
    let c = hex.replace(/^#/, '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    if (c.length !== 6) return null;
    const num = parseInt(c, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }

  class ThinkingOrb {
    constructor(canvasOrContainer, options = {}) {
      this.options = Object.assign({
        state: 'composing',
        size: 28,
        theme: 'auto',
        color: null,
        speed: 1.0,
        paused: false,
        ariaLabel: 'AI Agent is thinking'
      }, options);

      this.canvas = null;
      this.ctx = null;
      this.width = 0;
      this.height = 0;
      this.dpr = 1;
      this.phase = 0;
      this.lastFrameTime = performance.now();
      this.isVisible = true;
      this.intersectionObserver = null;
      this.resolvedTheme = 'dark';

      this.state = this.options.state;
      this.initCanvas(canvasOrContainer);
      this.syncTheme();
      this.setupObservers();

      INSTANCES.add(this);
      ThinkingOrb.startSharedClock();
    }

    initCanvas(target) {
      if (!target) return;
      if (typeof target === 'string') {
        target = document.querySelector(target);
      }
      if (target instanceof HTMLCanvasElement) {
        this.canvas = target;
      } else if (target instanceof HTMLElement) {
        let cv = target.querySelector('canvas');
        if (!cv) {
          cv = document.createElement('canvas');
          target.appendChild(cv);
        }
        this.canvas = cv;
      }
      if (!this.canvas) return;

      this.ctx = this.canvas.getContext('2d', { alpha: true });
      this.canvas.setAttribute('role', 'img');
      this.canvas.setAttribute('aria-label', this.options.ariaLabel || 'AI Agent is thinking');
      this.resize();
    }

    resize(sizeOverride) {
      if (!this.canvas || !this.ctx) return;
      const parentH = this.canvas.parentElement ? Math.round(this.canvas.parentElement.clientHeight) : 0;
      const size = sizeOverride || (parentH > 10 ? parentH : (this.options.size || 28));
      this.options.size = size;

      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.width = size;
      this.height = size;

      const physicalW = Math.round(size * this.dpr);
      const physicalH = Math.round(size * this.dpr);

      if (this.canvas.width !== physicalW || this.canvas.height !== physicalH) {
        this.canvas.width = physicalW;
        this.canvas.height = physicalH;
      }
      this.canvas.style.width = '100%';
      this.canvas.style.height = '100%';
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    setupObservers() {
      if (typeof IntersectionObserver !== 'undefined' && this.canvas) {
        this.intersectionObserver = new IntersectionObserver((entries) => {
          entries.forEach(e => {
            this.isVisible = e.isIntersecting;
          });
        }, { threshold: 0.05 });
        this.intersectionObserver.observe(this.canvas);
      }
    }

    syncTheme(explicitTheme) {
      const mode = explicitTheme || this.options.theme;
      if (mode === 'auto' || !mode) {
        this.resolvedTheme = getGlobalTheme();
      } else {
        this.resolvedTheme = mode === 'light' ? 'light' : 'dark';
      }
    }

    setState(newState) {
      this.state = newState;
      if (this.options.state !== newState) {
        this.options.state = newState;
      }
    }

    setTheme(newTheme) {
      this.options.theme = newTheme;
      this.syncTheme(newTheme);
    }

    setColor(colorHex) {
      this.options.color = colorHex;
    }

    setSpeed(speedMultiplier) {
      this.options.speed = Math.max(0, speedMultiplier || 1.0);
    }

    setPaused(isPaused) {
      this.options.paused = !!isPaused;
    }

    update(dt) {
      if (this.options.paused || !this.isVisible) return;
      const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const effectiveSpeed = prefersReduced ? 0.15 : (this.options.speed || 1.0);
      this.phase += (dt / 1000) * effectiveSpeed;
    }

    render() {
      if (!this.canvas || !this.ctx || !this.isVisible) return;
      const ctx = this.ctx;
      const w = this.width;
      const h = this.height;
      const cx = w / 2;
      const cy = h / 2;
      const t = this.phase;

      ctx.clearRect(0, 0, w, h);

      const isDense = this.options.size >= 40;
      const R = (w / 2) * 0.78;
      const baseDotRadius = isDense ? (w >= 60 ? 1.6 : 1.3) : 1.05;

      const isDark = this.resolvedTheme === 'dark';
      const customRgb = parseHexToRgb(this.options.color);
      const inkR = customRgb ? customRgb.r : (isDark ? 255 : 18);
      const inkG = customRgb ? customRgb.g : (isDark ? 255 : 24);
      const inkB = customRgb ? customRgb.b : (isDark ? 255 : 38);

      const dots = [];
      const state = this.options.state || 'composing';

      switch (state) {
        case 'composing': {
          // Undulating multi-band sash ribbon wrapping around the sphere
          const bands = isDense ? 5 : 3;
          const pointsPerBand = isDense ? 40 : 20;
          for (let b = 0; b < bands; b++) {
            const bOffset = (b - (bands - 1) / 2) * (isDense ? 0.14 : 0.20);
            for (let i = 0; i < pointsPerBand; i++) {
              const u = (Math.PI * 2 * i) / pointsPerBand;
              const angle = u + t * 1.35;
              const waveLat = 0.58 * Math.sin(2 * angle) + 0.22 * Math.cos(3 * angle - t * 0.75);
              const lat = Math.max(-0.85, Math.min(0.85, waveLat + bOffset));
              const cosLat = Math.cos(lat);

              const X0 = R * Math.cos(angle) * cosLat;
              const Y0 = R * Math.sin(lat);
              const Z0 = R * Math.sin(angle) * cosLat;

              const rotX = -0.42;
              const rotY = 0.35;
              const x1 = X0 * Math.cos(rotY) + Z0 * Math.sin(rotY);
              const z1 = -X0 * Math.sin(rotY) + Z0 * Math.cos(rotY);
              const y = Y0 * Math.cos(rotX) - z1 * Math.sin(rotX);
              const z = Y0 * Math.sin(rotX) + z1 * Math.cos(rotX);
              const x = x1;

              dots.push({ x: cx + x, y: cy + y, z, r: baseDotRadius });
            }
          }
          break;
        }

        case 'solving': {
          // Bands scramble in quarter turns and click back aligned
          const bandCount = isDense ? 5 : 3;
          const dotsPerBand = isDense ? [16, 26, 34, 26, 16] : [10, 16, 10];
          const cycle = 3.6;
          const progress = (t % cycle) / cycle;

          for (let k = 0; k < bandCount; k++) {
            const kNorm = (k - (bandCount - 1) / 2) / ((bandCount - 1) / 2 || 1);
            const lat = Math.asin(kNorm * 0.75);
            const rBand = R * Math.cos(lat);
            const yBand = R * Math.sin(lat);

            const quarterTarget = ((k % 2 === 0 ? 1 : -1) * (k + 1) * Math.PI) / 2;
            let bandAngle = 0;
            if (progress < 0.5) {
              const p = progress / 0.5;
              const ease = p * p * (3 - 2 * p);
              bandAngle = ease * quarterTarget;
            } else if (progress < 0.8) {
              const p = (progress - 0.5) / 0.3;
              const ease = p * p * (3 - 2 * p);
              bandAngle = (1 - ease) * quarterTarget;
            } else {
              bandAngle = 0;
            }

            const count = dotsPerBand[k] || 16;
            for (let j = 0; j < count; j++) {
              const theta = (Math.PI * 2 * j) / count + bandAngle + t * 0.35;
              const X0 = rBand * Math.cos(theta);
              const Y0 = yBand;
              const Z0 = rBand * Math.sin(theta);

              const rotX = -0.32;
              const rotY = 0.40;
              const x1 = X0 * Math.cos(rotY) + Z0 * Math.sin(rotY);
              const z1 = -X0 * Math.sin(rotY) + Z0 * Math.cos(rotY);
              const y = Y0 * Math.cos(rotX) - z1 * Math.sin(rotX);
              const z = Y0 * Math.sin(rotX) + z1 * Math.cos(rotX);
              const x = x1;

              dots.push({ x: cx + x, y: cy + y, z, r: baseDotRadius });
            }
          }
          break;
        }

        case 'working': {
          // Particles running along tilted intersecting orbits
          const orbits = isDense ? [
            { count: 28, rad: R * 0.95, tiltX: 0.55, tiltY: 0.4, speed: 1.4 },
            { count: 24, rad: R * 0.85, tiltX: -0.65, tiltY: -0.5, speed: -1.7 },
            { count: 28, rad: R * 1.02, tiltX: 1.15, tiltY: 0.8, speed: 1.9 }
          ] : [
            { count: 14, rad: R * 0.95, tiltX: 0.55, tiltY: 0.4, speed: 1.4 },
            { count: 14, rad: R * 0.88, tiltX: -0.65, tiltY: -0.5, speed: -1.7 }
          ];

          orbits.forEach(orb => {
            for (let i = 0; i < orb.count; i++) {
              const theta = (Math.PI * 2 * i) / orb.count + t * orb.speed;
              const X0 = orb.rad * Math.cos(theta);
              const Y0 = 0;
              const Z0 = orb.rad * Math.sin(theta);

              const x1 = X0 * Math.cos(orb.tiltY) + Z0 * Math.sin(orb.tiltY);
              const z1 = -X0 * Math.sin(orb.tiltY) + Z0 * Math.cos(orb.tiltY);
              const y = Y0 * Math.cos(orb.tiltX) - z1 * Math.sin(orb.tiltX);
              const z = Y0 * Math.sin(orb.tiltX) + z1 * Math.cos(orb.tiltX);
              const x = x1;

              dots.push({ x: cx + x, y: cy + y, z, r: baseDotRadius });
            }
          });
          break;
        }

        case 'searching': {
          // Scan meridian sweeps across a dotted globe
          const totalPoints = isDense ? 120 : 34;
          const sweep = (t * 2.2) % (Math.PI * 2);
          const goldenRatio = (1 + Math.sqrt(5)) / 2;

          for (let i = 0; i < totalPoints; i++) {
            const y0 = 1 - (i / (totalPoints - 1)) * 2;
            const radiusAtY = Math.sqrt(Math.max(0, 1 - y0 * y0));
            const theta = 2 * Math.PI * i / goldenRatio;

            const X0 = R * radiusAtY * Math.cos(theta);
            const Y0 = R * y0;
            const Z0 = R * radiusAtY * Math.sin(theta);

            const rotX = -0.28;
            const rotY = 0.35;
            const x1 = X0 * Math.cos(rotY) + Z0 * Math.sin(rotY);
            const z1 = -X0 * Math.sin(rotY) + Z0 * Math.cos(rotY);
            const y = Y0 * Math.cos(rotX) - z1 * Math.sin(rotX);
            const z = Y0 * Math.sin(rotX) + z1 * Math.cos(rotX);
            const x = x1;

            const lon = Math.atan2(Z0, X0);
            const diff = ((sweep - lon) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
            const sweepIntensity = diff < 0.5 ? Math.exp(-diff * 5) : 0.12;

            dots.push({ x: cx + x, y: cy + y, z, r: baseDotRadius, intensity: sweepIntensity });
          }
          break;
        }

        case 'listening': {
          // A waveform rolls through latitude rings
          const rings = isDense ? 6 : 4;
          const pts = isDense ? 24 : 12;
          for (let k = 0; k < rings; k++) {
            const yNorm = (k - (rings - 1) / 2) / ((rings - 1) / 2 || 1);
            const rBase = R * Math.cos(Math.asin(yNorm * 0.8));
            const yBase = R * yNorm * 0.78;

            for (let j = 0; j < pts; j++) {
              const theta = (Math.PI * 2 * j) / pts + t * 0.4;
              const wave = Math.sin(t * 4.5 - yBase * 0.12) * Math.cos(theta * 2 + t * 2.5);
              const rEff = rBase * (1 + 0.18 * wave);

              const X0 = rEff * Math.cos(theta);
              const Y0 = yBase + wave * 2.5;
              const Z0 = rEff * Math.sin(theta);

              const rotX = -0.3;
              const rotY = 0.35;
              const x1 = X0 * Math.cos(rotY) + Z0 * Math.sin(rotY);
              const z1 = -X0 * Math.sin(rotY) + Z0 * Math.cos(rotY);
              const y = Y0 * Math.cos(rotX) - z1 * Math.sin(rotX);
              const z = Y0 * Math.sin(rotX) + z1 * Math.cos(rotX);
              const x = x1;

              dots.push({ x: cx + x, y: cy + y, z, r: baseDotRadius });
            }
          }
          break;
        }

        case 'shaping':
        default: {
          // Dotted outline morphs circle -> triangle -> square
          const points = isDense ? 64 : 28;
          const cycle = (t * 0.55) % 3;
          const stage = Math.floor(cycle);
          const morph = cycle - stage;
          const ease = morph * morph * (3 - 2 * morph);

          for (let i = 0; i < points; i++) {
            const angle = (Math.PI * 2 * i) / points + t * 0.4;

            const rCircle = 1.0;
            const triA = ((angle % ((Math.PI * 2) / 3)) + (Math.PI * 2) / 3) % ((Math.PI * 2) / 3) - Math.PI / 3;
            const rTriangle = Math.min(1.4, Math.cos(Math.PI / 3) / Math.cos(triA));
            const sqA = ((angle % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2) - Math.PI / 4;
            const rSquare = Math.min(1.3, Math.cos(Math.PI / 4) / Math.cos(sqA));

            let radFactor = 1.0;
            if (stage === 0) radFactor = rCircle * (1 - ease) + rTriangle * ease;
            else if (stage === 1) radFactor = rTriangle * (1 - ease) + rSquare * ease;
            else radFactor = rSquare * (1 - ease) + rCircle * ease;

            const rad = R * 0.92 * radFactor;
            const X0 = rad * Math.cos(angle);
            const Y0 = rad * Math.sin(angle);
            const Z0 = R * 0.25 * Math.sin(angle * 3 + t * 2);

            const rotX = -0.35;
            const rotY = 0.35;
            const x1 = X0 * Math.cos(rotY) + Z0 * Math.sin(rotY);
            const z1 = -X0 * Math.sin(rotY) + Z0 * Math.cos(rotY);
            const y = Y0 * Math.cos(rotX) - z1 * Math.sin(rotX);
            const z = Y0 * Math.sin(rotX) + z1 * Math.cos(rotX);
            const x = x1;

            dots.push({ x: cx + x, y: cy + y, z, r: baseDotRadius });
          }
          break;
        }
      }

      // Depth-sort all 3D dots so back points are occluded by front points
      dots.sort((a, b) => a.z - b.z);

      // Render dots to canvas with authentic depth shading
      for (let i = 0; i < dots.length; i++) {
        const dot = dots[i];
        const zNorm = Math.max(-1, Math.min(1, dot.z / (R || 1)));
        const depthFactor = (zNorm + 1) / 2;

        let alpha;
        if (typeof dot.intensity === 'number') {
          alpha = Math.max(0.12, Math.min(1.0, 0.18 + 0.82 * dot.intensity));
        } else {
          alpha = Math.max(0.15, Math.min(1.0, 0.20 + 0.80 * Math.pow(depthFactor, 1.3)));
        }

        if (!isDark) {
          alpha = Math.min(0.92, alpha * 0.90);
        }

        const rad = dot.r * (0.75 + 0.35 * depthFactor);

        ctx.fillStyle = `rgba(${inkR}, ${inkG}, ${inkB}, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, Math.max(0.5, rad), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    destroy() {
      INSTANCES.delete(this);
      if (this.intersectionObserver && this.canvas) {
        try { this.intersectionObserver.unobserve(this.canvas); } catch (_) { }
        this.intersectionObserver.disconnect();
      }
      this.canvas = null;
      this.ctx = null;
    }

    static startSharedClock() {
      if (sharedClockRaf) return;
      let lastTime = performance.now();

      const loop = (now) => {
        const dt = Math.min(64, now - lastTime);
        lastTime = now;

        INSTANCES.forEach(instance => {
          instance.update(dt);
          instance.render();
        });

        if (INSTANCES.size > 0) {
          sharedClockRaf = requestAnimationFrame(loop);
        } else {
          sharedClockRaf = null;
        }
      };

      sharedClockRaf = requestAnimationFrame(loop);
    }

    static syncTheme(theme) {
      INSTANCES.forEach(instance => {
        instance.syncTheme(theme);
      });
    }

    static createPill(opts = {}) {
      const {
        text = 'Thinking….',
        state = 'composing',
        size = 28,
        theme = 'auto',
        color = null,
        onClick = null
      } = opts;

      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'think-pill-btn no-sel';
      pill.innerHTML = `
        <span class="think-orb-slot"><canvas class="think-orb-canvas" width="${size}" height="${size}"></canvas></span>
        <span class="think-pill-text">${text}</span>
        <svg class="tchev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9.5l6 6 6-6"/></svg>
      `;

      const canvas = pill.querySelector('.think-orb-canvas');
      const orb = new ThinkingOrb(canvas, { state, size, theme, color });
      pill._orbInstance = orb;

      if (typeof onClick === 'function') {
        pill.addEventListener('click', onClick);
      }

      return pill;
    }
  }

  // Global registration
  global.ThinkingOrb = ThinkingOrb;
})(typeof window !== 'undefined' ? window : globalThis);