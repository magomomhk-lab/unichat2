/* ============================================================
   aiGlassButton.js — macOS 14 (Sonoma) & visionOS Liquid Glass Engine
   Pure Vanilla ES6+ (Zero React, Zero External Dependencies)
   Динамический расчет преломления света, каустики и бликов для всех элементов UI
============================================================ */
'use strict';

class LiquidGlassController {
  constructor() {
    this.BINS = 24;
    this.LIGHT_SOURCE = { x: 0.5, y: 0.0 }; // Верхний центр сцены
    this.registeredElements = new Set();
    this.rafId = null;
    this.lastAzimuthKey = '';
    this.mouseX = null;
    this.mouseY = null;
    this.isTouch = false;

    this.profileCache = new Map();

    this.init();
  }

  init() {
    this.isTouch = (typeof window !== 'undefined') &&
      ((window.matchMedia && matchMedia('(pointer:coarse)').matches) || window.innerWidth <= 768);

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setup());
    } else {
      this.setup();
    }
  }

  setup() {
    // Разовое статическое начальное позиционирование света сверху
    this.updateLighting(this.LIGHT_SOURCE.x, this.LIGHT_SOURCE.y);
    this.setupPointerTracking();
  }

  setupPointerTracking() {
    if (this.isTouch || (typeof window !== 'undefined' && window.innerWidth <= 768)) return;

    let ticking = false;

    const onPointerMove = (e) => {
      if (ticking) return;
      ticking = true;

      requestAnimationFrame(() => {
        ticking = false;
        const w = window.innerWidth || 1920;
        const h = window.innerHeight || 1080;
        this.updateLighting(e.clientX / w, e.clientY / h);
      });
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('mouseleave', () => {
      this.updateLighting(this.LIGHT_SOURCE.x, this.LIGHT_SOURCE.y);
    }, { passive: true });
  }

  registerElement(el) {
    // Сохранено для обратной совместимости вызовов
  }

  calculateRefractionProfile(lightAz) {
    const key = lightAz.toFixed(2);
    if (this.profileCache.has(key)) {
      return this.profileCache.get(key);
    }

    const bins = this.BINS;
    const profile = new Array(bins).fill(0);
    let sumX = 0;
    let sumY = 0;

    for (let b = 0; b < bins; b++) {
      const ang = (b / bins) * Math.PI * 2 - Math.PI;
      const facing = Math.max(0, Math.cos(ang - lightAz));
      const bright = Math.pow(facing, 1.8) * 0.95 + 0.05;

      profile[b] = bright;
      sumX += Math.cos(ang) * bright;
      sumY += Math.sin(ang) * bright;
    }

    const domAngle = Math.atan2(sumY, sumX);
    const stops = [];
    for (let b = 0; b <= bins; b++) {
      const idx = b % bins;
      const t = profile[idx];
      const deg = (b / bins) * 360;
      const op = (0.06 + t * 0.65).toFixed(3);
      stops.push(`rgba(255,255,255,${op}) ${deg.toFixed(1)}deg`);
    }

    const lightAngleDeg = (domAngle * 180) / Math.PI + 90;
    const rimGradient = `conic-gradient(from ${lightAngleDeg.toFixed(1)}deg at 50% 50%, ${stops.join(', ')})`;

    const result = {
      domAngle,
      lightAngleDeg,
      rimGradient,
      magnitude: 0.72
    };

    if (this.profileCache.size > 120) {
      this.profileCache.clear();
    }
    this.profileCache.set(key, result);
    return result;
  }

  updateLighting(sourceX, sourceY) {
    // Центрированный вектор направления освещения относительно экрана
    const dx = sourceX - 0.5;
    const dy = sourceY - 0.2;
    const lightAz = Math.atan2(dy, dx);
    
    // Квантование до 1 знака (шаг ~5.7 градусов), исключающее непрерывный пересчёт стилей
    const azKey = lightAz.toFixed(1);
    if (azKey === this.lastAzimuthKey) return;
    this.lastAzimuthKey = azKey;

    const refraction = this.calculateRefractionProfile(lightAz);
    if (!refraction) return;

    const intensity = 0.55 + refraction.magnitude * 0.45;
    const cosVal = (-Math.cos(refraction.domAngle) * intensity).toFixed(2);
    const sinVal = (-Math.sin(refraction.domAngle) * intensity).toFixed(2);
    const rimIntensity = intensity.toFixed(2);

    // Обновляем только числовые коэффициенты блика (без тяжелого conic-gradient на весь DOM)
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--lg-cos', cosVal);
    rootStyle.setProperty('--lg-sin', sinVal);
    rootStyle.setProperty('--lg-rim-intensity', rimIntensity);
  }

  destroy() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.registeredElements.clear();
    this.profileCache.clear();
  }
}

// Инициализация глобального менеджера жидкого стекла
if (typeof window !== 'undefined') {
  window.liquidGlassController = new LiquidGlassController();
}