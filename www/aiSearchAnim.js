/* ============================================================
   aiSearchAnim.js
   Высокопроизводительный SearchOrb для карточек веб-поиска:
   - Полное отключение тяжелого shadowBlur (ликвидация нагрева CPU/GPU)
   - Адаптивное число частиц (24 на мобильных, 48 на десктопе)
   - Автоматическая гибернация через IntersectionObserver вне видимости
   - Спокойная, плавная кинематика вращения без хаотичных вспышек
============================================================ */
'use strict';

class SearchOrb {
    constructor(canvasOrSelector, options = {}) {
        this.canvas = typeof canvasOrSelector === 'string' ? document.querySelector(canvasOrSelector) : canvasOrSelector;
        if (!this.canvas) return;

        this.ctx = this.canvas.getContext('2d', { alpha: true });
        this.options = Object.assign({
            state: options.state || 'searching',
            size: options.size || 56,
            theme: options.theme || 'auto',
            color: options.color || null,
            speed: typeof options.speed === 'number' ? options.speed : 0.85
        }, options);
        this.state = this.options.state;
        this.size = this.options.size;
        this.theme = this.options.theme;
        this.color = this.options.color;
        this.speed = this.options.speed;

        this.rafId = null;
        this.lastTime = performance.now();
        this.dpr = 1;
        this.width = 56;
        this.height = 56;
        this.particles = [];
        this.angleOffset = 0;
        this.isVisible = true;
        this.observer = null;

        this.isMobile = (typeof window !== 'undefined') &&
            ((window.matchMedia && matchMedia('(pointer:coarse)').matches) || window.innerWidth <= 768);

        this.init();
    }

    init() {
        this.resize();
        this.initParticles();
        this.setupVisibilityObserver();
        this.start();
    }

    resolveThemeIsDark() {
        if (this.theme === 'dark') return true;
        if (this.theme === 'light') return false;
        const htmlTheme = document.documentElement.dataset.theme;
        if (htmlTheme) return htmlTheme !== 'light';
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    setupVisibilityObserver() {
        if (typeof IntersectionObserver !== 'undefined' && this.canvas) {
            this.observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    this.isVisible = entry.isIntersecting;
                    if (this.isVisible && !this.rafId) {
                        this.lastTime = performance.now();
                        this.start();
                    }
                });
            }, { threshold: 0.05 });
            this.observer.observe(this.canvas);
        }
    }

    initParticles() {
        this.particles = [];
        // Адаптивное масштабирование: на смартфонах минимум вычислений
        const count = this.isMobile ? (this.size <= 32 ? 14 : 24) : (this.size <= 32 ? 22 : 44);
        const maxR = (this.width / 2) * 0.84;

        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i) / count;
            const radius = 6 + Math.sqrt((i + 1) / count) * (maxR - 6);
            const orbitSpeed = (0.2 + (i % 3) * 0.15) * (i % 2 === 0 ? 1 : -1);
            const baseAlpha = 0.25 + (i % 4) * 0.18;
            const dotSize = this.isMobile ? 1.2 : (1.0 + (i % 3) * 0.4);

            this.particles.push({
                angle,
                radius,
                orbitSpeed,
                baseAlpha,
                dotSize
            });
        }
    }

    resize() {
        if (!this.canvas) return;
        this.dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.width = this.size;
        this.height = this.size;

        const targetW = Math.round(this.width * this.dpr);
        const targetH = Math.round(this.height * this.dpr);

        if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
            this.canvas.width = targetW;
            this.canvas.height = targetH;
            this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        }
    }

    setState(newState) {
        if (this.options) this.options.state = newState;
        if (this.state === newState) return;
        this.state = newState;
        this.speed = newState === 'searching' ? 0.95 : 0.45;
        if (this.options) this.options.speed = this.speed;
    }

    setTheme(newTheme) {
        if (this.options) this.options.theme = newTheme;
        this.theme = newTheme;
    }

    setColor(newColor) {
        if (this.options) this.options.color = newColor;
        this.color = newColor;
    }

    setSpeed(newSpeed) {
        if (this.options) this.options.speed = newSpeed;
        this.speed = newSpeed;
    }

    start() {
        if (this.rafId) return;
        const render = (ts) => {
            if (!this.canvas || !document.contains(this.canvas)) {
                this.destroy();
                return;
            }

            if (!this.isVisible || document.hidden) {
                this.rafId = null;
                return;
            }

            this.rafId = requestAnimationFrame(render);

            const dt = Math.min(0.064, (ts - this.lastTime) / 1000);
            this.lastTime = ts;

            this.draw(dt || 0.016);
        };
        this.rafId = requestAnimationFrame(render);
    }

    draw(dt) {
        const ctx = this.ctx;
        const cx = this.width / 2;
        const cy = this.height / 2;
        const isDark = this.resolveThemeIsDark();

        ctx.clearRect(0, 0, this.width, this.height);

        this.angleOffset += dt * this.speed;

        // Чистое матовое центральное ядро без тяжелого shadowBlur
        const coreGradient = ctx.createRadialGradient(cx, cy, 1, cx, cy, cx * 0.75);
        if (isDark) {
            coreGradient.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
            coreGradient.addColorStop(0.5, 'rgba(143, 208, 245, 0.06)');
            coreGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        } else {
            coreGradient.addColorStop(0, 'rgba(2, 132, 199, 0.14)');
            coreGradient.addColorStop(0.5, 'rgba(15, 23, 42, 0.04)');
            coreGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        }
        ctx.fillStyle = coreGradient;
        ctx.beginPath();
        ctx.arc(cx, cy, cx * 0.75, 0, Math.PI * 2);
        ctx.fill();

        // Спокойный фоновый световой луч во время поиска
        if (this.state === 'searching') {
            const sweep = (this.angleOffset * 1.8) % (Math.PI * 2);
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, cx * 0.88, sweep - 0.6, sweep);
            ctx.closePath();

            const beamGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, cx * 0.88);
            beamGrad.addColorStop(0, isDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(2, 132, 199, 0.20)');
            beamGrad.addColorStop(0.8, isDark ? 'rgba(143, 208, 245, 0.08)' : 'rgba(2, 132, 199, 0.05)');
            beamGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = beamGrad;
            ctx.fill();
            ctx.restore();
        }

        // Отрисовка стабильных геометрических точек без shadowBlur
        const baseColor = this.color
            ? this.color
            : (isDark ? '176, 204, 230' : '2, 132, 199');

        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            const currentAngle = p.angle + p.orbitSpeed * this.angleOffset;

            const px = cx + Math.cos(currentAngle) * p.radius;
            const py = cy + Math.sin(currentAngle) * p.radius;

            ctx.beginPath();
            ctx.arc(px, py, p.dotSize, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${baseColor}, ${p.baseAlpha})`;
            ctx.fill();
        }
    }

    destroy() {
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        if (this.canvas) {
            delete this.canvas._orbInstance;
        }
    }
}

function enhanceSearchOrbs(root) {
    if (!root) return;
    root.querySelectorAll('.wsearch-orb-canvas').forEach(cv => {
        if (cv._orbInstance) return;
        const orbState = cv.dataset.orbState || 'searching';
        const activeTheme = (window.state && window.state.settings && window.state.settings.theme) || 'auto';
        const themeColor = window.state?.settings?.customThemes?.[activeTheme]?.streamColor || null;

        cv._orbInstance = new SearchOrb(cv, {
            state: orbState,
            size: 56,
            theme: activeTheme,
            color: themeColor,
            speed: orbState === 'searching' ? 0.95 : 0.45
        });
    });
}

window.SearchOrb = SearchOrb;
window.enhanceSearchOrbs = enhanceSearchOrbs;