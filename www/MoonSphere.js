/* ============================================================
   MoonSphere.js — Высокопроизводительная голосовая сфера (Pure JS WebGL)
   Сконвертировано из VoicePoweredOrb TS/React без сторонних библиотек (без OGL/Three.js)
   Совместимо с Web, Electron и Capacitor (Android)
============================================================ */
'use strict';

class VoicePoweredOrb {
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.hue = options.hue || 0;
        this.voiceSensitivity = options.voiceSensitivity || 1.5;
        this.maxRotationSpeed = options.maxRotationSpeed || 1.2;
        this.maxHoverIntensity = options.maxHoverIntensity || 0.8;
        this.onVoiceDetected = options.onVoiceDetected || null;

        this.gl = null;
        this.program = null;
        this.buffer = null;
        this.uniforms = {};
        this.currentRot = 0;
        this.lastTime = 0;
        this.currentHue = this.hue;
        this.baseRotationSpeed = 0.3;
        this.isInitialized = false;

        this.vertSrc = `
            precision highp float;
            attribute vec2 position;
            attribute vec2 uv;
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position, 0.0, 1.0);
            }
        `;

        this.fragSrc = `
            precision highp float;

            uniform float iTime;
            uniform vec3 iResolution;
            uniform float hue;
            uniform float hover;
            uniform float rot;
            uniform float hoverIntensity;
            varying vec2 vUv;

            vec3 rgb2yiq(vec3 c) {
                float y = dot(c, vec3(0.299, 0.587, 0.114));
                float i = dot(c, vec3(0.596, -0.274, -0.322));
                float q = dot(c, vec3(0.211, -0.523, 0.312));
                return vec3(y, i, q);
            }

            vec3 yiq2rgb(vec3 c) {
                float r = c.x + 0.956 * c.y + 0.621 * c.z;
                float g = c.x - 0.272 * c.y - 0.647 * c.z;
                float b = c.x - 1.106 * c.y + 1.703 * c.z;
                return vec3(r, g, b);
            }

            vec3 adjustHue(vec3 color, float hueDeg) {
                float hueRad = hueDeg * 3.14159265 / 180.0;
                vec3 yiq = rgb2yiq(color);
                float cosA = cos(hueRad);
                float sinA = sin(hueRad);
                float i = yiq.y * cosA - yiq.z * sinA;
                float q = yiq.y * sinA + yiq.z * cosA;
                yiq.y = i;
                yiq.z = q;
                return yiq2rgb(yiq);
            }

            vec3 hash33(vec3 p3) {
                p3 = fract(p3 * vec3(0.1031, 0.11369, 0.13787));
                p3 += dot(p3, p3.yxz + 19.19);
                return -1.0 + 2.0 * fract(vec3(
                    p3.x + p3.y,
                    p3.x + p3.z,
                    p3.y + p3.z
                ) * p3.zyx);
            }

            float snoise3(vec3 p) {
                const float K1 = 0.333333333;
                const float K2 = 0.166666667;
                vec3 i = floor(p + (p.x + p.y + p.z) * K1);
                vec3 d0 = p - (i - (i.x + i.y + i.z) * K2);
                vec3 e = step(vec3(0.0), d0 - d0.yzx);
                vec3 i1 = e * (1.0 - e.zxy);
                vec3 i2 = 1.0 - e.zxy * (1.0 - e);
                vec3 d1 = d0 - (i1 - K2);
                vec3 d2 = d0 - (i2 - K1);
                vec3 d3 = d0 - 0.5;
                vec4 h = max(0.6 - vec4(
                    dot(d0, d0),
                    dot(d1, d1),
                    dot(d2, d2),
                    dot(d3, d3)
                ), 0.0);
                vec4 n = h * h * h * h * vec4(
                    dot(d0, hash33(i)),
                    dot(d1, hash33(i + i1)),
                    dot(d2, hash33(i + i2)),
                    dot(d3, hash33(i + 1.0))
                );
                return dot(vec4(31.316), n);
            }

            vec4 extractAlpha(vec3 colorIn) {
                float a = max(max(colorIn.r, colorIn.g), colorIn.b);
                return vec4(colorIn.rgb / (a + 1e-5), a);
            }

            const vec3 baseColor1 = vec3(0.611765, 0.262745, 0.996078);
            const vec3 baseColor2 = vec3(0.298039, 0.760784, 0.913725);
            const vec3 baseColor3 = vec3(0.062745, 0.078431, 0.600000);
            const float innerRadius = 0.6;
            const float noiseScale = 0.65;

            float light1(float intensity, float attenuation, float dist) {
                return intensity / (1.0 + dist * attenuation);
            }

            float light2(float intensity, float attenuation, float dist) {
                return intensity / (1.0 + dist * dist * attenuation);
            }

            vec4 draw(vec2 uv) {
                vec3 color1 = adjustHue(baseColor1, hue);
                vec3 color2 = adjustHue(baseColor2, hue);
                vec3 color3 = adjustHue(baseColor3, hue);

                float ang = atan(uv.y, uv.x);
                float len = length(uv);
                float invLen = len > 0.0 ? 1.0 / len : 0.0;

                float n0 = snoise3(vec3(uv * noiseScale, iTime * 0.5)) * 0.5 + 0.5;
                float r0 = mix(mix(innerRadius, 1.0, 0.4), mix(innerRadius, 1.0, 0.6), n0);
                float d0 = distance(uv, (r0 * invLen) * uv);
                float v0 = light1(1.0, 10.0, d0);
                v0 *= smoothstep(r0 * 1.05, r0, len);
                float cl = cos(ang + iTime * 2.0) * 0.5 + 0.5;

                float a = iTime * -1.0;
                vec2 pos = vec2(cos(a), sin(a)) * r0;
                float d = distance(uv, pos);
                float v1 = light2(1.5, 5.0, d);
                v1 *= light1(1.0, 50.0, d0);

                float v2 = smoothstep(1.0, mix(innerRadius, 1.0, n0 * 0.5), len);
                float v3 = smoothstep(innerRadius, mix(innerRadius, 1.0, 0.5), len);

                vec3 col = mix(color1, color2, cl);
                col = mix(color3, col, v0);
                col = (col + v1) * v2 * v3;
                col = clamp(col, 0.0, 1.0);

                return extractAlpha(col);
            }

            vec4 mainImage(vec2 fragCoord) {
                vec2 center = iResolution.xy * 0.5;
                float size = min(iResolution.x, iResolution.y);
                vec2 uv = (fragCoord - center) / size * 2.0;

                float angle = rot;
                float s = sin(angle);
                float c = cos(angle);
                uv = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y);

                uv.x += hover * hoverIntensity * 0.1 * sin(uv.y * 10.0 + iTime);
                uv.y += hover * hoverIntensity * 0.1 * sin(uv.x * 10.0 + iTime);

                return draw(uv);
            }

            void main() {
                vec2 fragCoord = vUv * iResolution.xy;
                vec4 col = mainImage(fragCoord);
                gl_FragColor = vec4(col.rgb * col.a, col.a);
            }
        `;
    }

    init() {
        if (!this.canvas) return false;
        try {
            const gl = this.canvas.getContext('webgl2', { alpha: true, antialias: true, premultipliedAlpha: false }) ||
                       this.canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false }) ||
                       this.canvas.getContext('experimental-webgl', { alpha: true, antialias: true, premultipliedAlpha: false });
            if (!gl) {
                console.warn('[VoicePoweredOrb] WebGL не поддерживается устройством');
                return false;
            }
            this.gl = gl;

            gl.clearColor(0.0, 0.0, 0.0, 0.0);
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

            const compile = (type, src) => {
                const s = gl.createShader(type);
                gl.shaderSource(s, src);
                gl.compileShader(s);
                if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
                    console.error('[VoicePoweredOrb] Shader compile error:', gl.getShaderInfoLog(s));
                    gl.deleteShader(s);
                    return null;
                }
                return s;
            };

            const vs = compile(gl.VERTEX_SHADER, this.vertSrc);
            const fs = compile(gl.FRAGMENT_SHADER, this.fragSrc);
            if (!vs || !fs) return false;

            const prog = gl.createProgram();
            gl.attachShader(prog, vs);
            gl.attachShader(prog, fs);
            gl.linkProgram(prog);

            if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
                console.error('[VoicePoweredOrb] Program link error:', gl.getProgramInfoLog(prog));
                return false;
            }

            this.program = prog;
            gl.useProgram(prog);

            // Буфер вершин и UV: полноэкранный квад (6 вершин)
            const vertices = new Float32Array([
                // pos.x, pos.y, uv.x, uv.y
                -1.0, -1.0, 0.0, 0.0,
                 1.0, -1.0, 1.0, 0.0,
                -1.0,  1.0, 0.0, 1.0,
                -1.0,  1.0, 0.0, 1.0,
                 1.0, -1.0, 1.0, 0.0,
                 1.0,  1.0, 1.0, 1.0
            ]);

            const buf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buf);
            gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
            this.buffer = buf;

            const stride = 4 * Float32Array.BYTES_PER_ELEMENT;
            const posLoc = gl.getAttribLocation(prog, 'position');
            const uvLoc = gl.getAttribLocation(prog, 'uv');

            gl.enableVertexAttribArray(posLoc);
            gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, stride, 0);

            if (uvLoc !== -1) {
                gl.enableVertexAttribArray(uvLoc);
                gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT);
            }

            this.uniforms = {
                iTime: gl.getUniformLocation(prog, 'iTime'),
                iResolution: gl.getUniformLocation(prog, 'iResolution'),
                hue: gl.getUniformLocation(prog, 'hue'),
                hover: gl.getUniformLocation(prog, 'hover'),
                rot: gl.getUniformLocation(prog, 'rot'),
                hoverIntensity: gl.getUniformLocation(prog, 'hoverIntensity')
            };

            this.isInitialized = true;
            return true;
        } catch (err) {
            console.error('[VoicePoweredOrb] Init failed:', err);
            return false;
        }
    }

    resize() {
        if (!this.canvas || !this.gl || !this.isInitialized) return;
        const host = this.canvas.parentElement;
        if (!host) return;

        const w = host.clientWidth || 360;
        const h = host.clientHeight || 360;
        const dpr = window.devicePixelRatio || 1;

        const targetW = Math.round(w * dpr);
        const targetH = Math.round(h * dpr);

        if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
            this.canvas.width = targetW;
            this.canvas.height = targetH;
            this.canvas.style.width = w + 'px';
            this.canvas.style.height = h + 'px';
            this.gl.viewport(0, 0, targetW, targetH);
        }
    }

    render(t, voiceLevel = 0, targetHue = 0) {
        if (!this.gl || !this.program || !this.isInitialized) return;
        const gl = this.gl;

        const dt = this.lastTime ? (t - this.lastTime) * 0.001 : 0.016;
        this.lastTime = t;

        // Кинематика вращения: увеличивается от голоса
        const voiceRotationSpeed = this.baseRotationSpeed + (voiceLevel * this.maxRotationSpeed * 2.0);
        this.currentRot += dt * (voiceLevel > 0.04 ? voiceRotationSpeed : this.baseRotationSpeed);

        this.currentHue = this.currentHue * 0.9 + targetHue * 0.1;

        const hoverVal = Math.min(voiceLevel * 2.0, 1.0);
        const hoverIntensityVal = Math.min(voiceLevel * this.maxHoverIntensity * 0.9, this.maxHoverIntensity);

        gl.useProgram(this.program);

        gl.uniform1f(this.uniforms.iTime, t * 0.001);
        gl.uniform3f(
            this.uniforms.iResolution,
            this.canvas.width,
            this.canvas.height,
            this.canvas.width / (this.canvas.height || 1)
        );
        gl.uniform1f(this.uniforms.hue, this.currentHue);
        gl.uniform1f(this.uniforms.hover, hoverVal);
        gl.uniform1f(this.uniforms.rot, this.currentRot);
        gl.uniform1f(this.uniforms.hoverIntensity, hoverIntensityVal);

        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    destroy() {
        if (!this.gl) return;
        try {
            if (this.buffer) this.gl.deleteBuffer(this.buffer);
            if (this.program) this.gl.deleteProgram(this.program);
            const ext = this.gl.getExtension('WEBGL_lose_context');
            if (ext) ext.loseContext();
        } catch (_) { }
        this.gl = null;
        this.program = null;
        this.buffer = null;
        this.isInitialized = false;
    }
}

// Экспорт для глобального использования в приложении
window.VoicePoweredOrb = VoicePoweredOrb;
window.MoonSphere = VoicePoweredOrb;