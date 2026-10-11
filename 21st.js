'use strict';

/* ============================================================
   LiquidGradientBackground — Высокопроизводительный WebGL2 шейдер
   21st.js Pure Vanilla JavaScript ES6+
============================================================ */

const PatternShapes = {
  Checks: 0,
  Stripes: 1,
  Edge: 2
};

const GRADIENT_PRESETS = {
  Prism: {
    color1: '#070b14',
    color2: '#2563eb',
    color3: '#8fd0f5',
    rotation: -35,
    proportion: 50,
    scale: 0.55,
    speed: 24,
    distortion: 6,
    swirl: 55,
    swirlIterations: 8,
    softness: 65,
    offset: 0,
    shape: 'Checks',
    shapeSize: 45
  },
  Lava: {
    color1: '#FF9F21',
    color2: '#FF0303',
    color3: '#000000',
    rotation: 114,
    proportion: 100,
    scale: 0.52,
    speed: 30,
    distortion: 7,
    swirl: 18,
    swirlIterations: 20,
    softness: 100,
    offset: 717,
    shape: 'Edge',
    shapeSize: 12
  },
  Plasma: {
    color1: '#B566FF',
    color2: '#000000',
    color3: '#000000',
    rotation: 0,
    proportion: 63,
    scale: 0.75,
    speed: 30,
    distortion: 5,
    swirl: 61,
    swirlIterations: 5,
    softness: 100,
    offset: -168,
    shape: 'Checks',
    shapeSize: 28
  },
  Pulse: {
    color1: '#66FF85',
    color2: '#000000',
    color3: '#000000',
    rotation: -167,
    proportion: 92,
    scale: 0,
    speed: 20,
    distortion: 54,
    swirl: 75,
    swirlIterations: 3,
    softness: 28,
    offset: -813,
    shape: 'Checks',
    shapeSize: 79
  },
  Vortex: {
    color1: '#000000',
    color2: '#FFFFFF',
    color3: '#000000',
    rotation: 50,
    proportion: 41,
    scale: 0.4,
    speed: 20,
    distortion: 0,
    swirl: 100,
    swirlIterations: 3,
    softness: 5,
    offset: -744,
    shape: 'Stripes',
    shapeSize: 80
  },
  Mist: {
    color1: '#050505',
    color2: '#FF66B8',
    color3: '#050505',
    rotation: 0,
    proportion: 33,
    scale: 0.48,
    speed: 39,
    distortion: 4,
    swirl: 65,
    swirlIterations: 5,
    softness: 100,
    offset: -235,
    shape: 'Edge',
    shapeSize: 48
  }
};

const VERTEX_SHADER_SRC = `#version 300 es
in vec4 a_position;
void main() {
  gl_Position = a_position;
}`;

const FRAGMENT_SHADER_SRC = `#version 300 es
precision highp float;

uniform float u_time;
uniform float u_pixelRatio;
uniform vec2 u_resolution;

uniform float u_scale;
uniform float u_rotation;
uniform vec4 u_color1;
uniform vec4 u_color2;
uniform vec4 u_color3;
uniform float u_proportion;
uniform float u_softness;
uniform float u_shape;
uniform float u_shapeScale;
uniform float u_distortion;
uniform float u_swirl;
uniform float u_swirlIterations;

out vec4 fragColor;

#define TWO_PI 6.28318530718
#define PI 3.14159265358979323846

vec2 rotate(vec2 uv, float th) {
  return mat2(cos(th), sin(th), -sin(th), cos(th)) * uv;
}

float random(vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

float noise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = random(i);
  float b = random(i + vec2(1.0, 0.0));
  float c = random(i + vec2(0.0, 1.0));
  float d = random(i + vec2(1.0, 1.0));

  vec2 u = f * f * (3.0 - 2.0 * f);

  float x1 = mix(a, b, u.x);
  float x2 = mix(c, d, u.x);
  return mix(x1, x2, u.y);
}

vec4 blend_colors(vec4 c1, vec4 c2, vec4 c3, float mixer, float edgesWidth, float edge_blur) {
  vec3 color1 = c1.rgb * c1.a;
  vec3 color2 = c2.rgb * c2.a;
  vec3 color3 = c3.rgb * c3.a;

  float r1 = smoothstep(.0 + .35 * edgesWidth, .7 - .35 * edgesWidth + .5 * edge_blur, mixer);
  float r2 = smoothstep(.3 + .35 * edgesWidth, 1. - .35 * edgesWidth + edge_blur, mixer);

  vec3 blended_color_2 = mix(color1, color2, r1);
  float blended_opacity_2 = mix(c1.a, c2.a, r1);

  vec3 c = mix(blended_color_2, color3, r2);
  float o = mix(blended_opacity_2, c3.a, r2);
  return vec4(c, o);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;

  float t = .5 * u_time;
  float noise_scale = .0005 + .006 * u_scale;

  uv -= .5;
  uv *= (noise_scale * u_resolution);
  uv = rotate(uv, u_rotation * .5 * PI);
  uv /= u_pixelRatio;
  uv += .5;

  float n1 = noise(uv * 1. + t);
  float n2 = noise(uv * 2. - t);
  float angle = n1 * TWO_PI;
  uv.x += 4. * u_distortion * n2 * cos(angle);
  uv.y += 4. * u_distortion * n2 * sin(angle);

  float iterations_number = ceil(clamp(u_swirlIterations, 1., 30.));
  for (float i = 1.; i <= iterations_number; i++) {
    uv.x += clamp(u_swirl, 0., 2.) / i * cos(t + i * 1.5 * uv.y);
    uv.y += clamp(u_swirl, 0., 2.) / i * cos(t + i * 1. * uv.x);
  }

  float proportion = clamp(u_proportion, 0., 1.);
  float shape = 0.;
  float mixer = 0.;

  if (u_shape < .5) {
    vec2 checks_shape_uv = uv * (.5 + 3.5 * u_shapeScale);
    shape = .5 + .5 * sin(checks_shape_uv.x) * cos(checks_shape_uv.y);
    mixer = shape + .48 * sign(proportion - .5) * pow(abs(proportion - .5), .5);
  } else if (u_shape < 1.5) {
    vec2 stripes_shape_uv = uv * (.25 + 3. * u_shapeScale);
    float f = fract(stripes_shape_uv.y);
    shape = smoothstep(.0, .55, f) * smoothstep(1., .45, f);
    mixer = shape + .48 * sign(proportion - .5) * pow(abs(proportion - .5), .5);
  } else {
    float sh = 1. - uv.y;
    sh -= .5;
    sh /= (noise_scale * u_resolution.y);
    sh += .5;
    float shape_scaling = .2 * (1. - u_shapeScale);
    shape = smoothstep(.45 - shape_scaling, .55 + shape_scaling, sh + .3 * (proportion - .5));
    mixer = shape;
  }

  vec4 color_mix = blend_colors(u_color1, u_color2, u_color3, mixer, 1. - clamp(u_softness, 0., 1.), .01 + .01 * u_scale);
  fragColor = vec4(color_mix.rgb, color_mix.a);
}`;

function parseColorToRgba(colorStr) {
  let r = 0, g = 0, b = 0, a = 1;
  const str = String(colorStr || '').trim();

  if (str.startsWith('rgba(')) {
    const p = str.slice(5, -1).split(',');
    r = parseFloat(p[0]) / 255;
    g = parseFloat(p[1]) / 255;
    b = parseFloat(p[2]) / 255;
    a = parseFloat(p[3]);
  } else if (str.startsWith('rgb(')) {
    const p = str.slice(4, -1).split(',');
    r = parseFloat(p[0]) / 255;
    g = parseFloat(p[1]) / 255;
    b = parseFloat(p[2]) / 255;
  } else if (str.startsWith('hsla(') || str.startsWith('hsl(')) {
    const isHsla = str.startsWith('hsla(');
    const p = str.slice(isHsla ? 5 : 4, -1).split(',');
    const h = parseFloat(p[0]) / 360;
    const s = parseFloat(p[1]) / 100;
    const l = parseFloat(p[2]) / 100;
    a = isHsla ? parseFloat(p[3]) : 1;

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const pVal = 2 * l - q;
    const hue2rgb = (t) => {
      let tc = t;
      if (tc < 0) tc += 1;
      if (tc > 1) tc -= 1;
      if (tc < 1 / 6) return pVal + (q - pVal) * 6 * tc;
      if (tc < 1 / 2) return q;
      if (tc < 2 / 3) return pVal + (q - pVal) * (2 / 3 - tc) * 6;
      return pVal;
    };
    r = hue2rgb(h + 1 / 3);
    g = hue2rgb(h);
    b = hue2rgb(h - 1 / 3);
  } else if (str.startsWith('#')) {
    const c = str.slice(1);
    if (c.length === 3) {
      r = parseInt(c[0] + c[0], 16) / 255;
      g = parseInt(c[1] + c[1], 16) / 255;
      b = parseInt(c[2] + c[2], 16) / 255;
    } else if (c.length >= 6) {
      r = parseInt(c.slice(0, 2), 16) / 255;
      g = parseInt(c.slice(2, 4), 16) / 255;
      b = parseInt(c.slice(4, 6), 16) / 255;
      if (c.length === 8) {
        a = parseInt(c.slice(6, 8), 16) / 255;
      }
    }
  }

  return [
    Math.max(0, Math.min(1, r)),
    Math.max(0, Math.min(1, g)),
    Math.max(0, Math.min(1, b)),
    Math.max(0, Math.min(1, a))
  ];
}

class LiquidGradientBackground {
  constructor(container, options = {}) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    if (!this.container) {
      console.warn('[LiquidGradient] Контейнер не найден');
      return;
    }

    this.options = Object.assign({
      preset: 'Prism',
      noise: { opacity: 0.14, scale: 1 },
      speed: null,
      customConfig: null
    }, options);

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'liquid-gradient-canvas';
    this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;';
    this.container.appendChild(this.canvas);

    this.noiseLayer = null;
    if (this.options.noise && this.options.noise.opacity > 0) {
      this.noiseLayer = document.createElement('div');
      this.noiseLayer.className = 'liquid-gradient-noise';
      this.noiseLayer.style.cssText = `
        position: absolute;
        inset: 0;
        background-image: url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwBAMAAAClLOS0AAAAElBMVEUAAAAAAAAAAAAAAAAAAAAAAADgKxmiAAAABnRSTlMCCgkGBAVJOAVJAAAASklEQVQ4y2NgGAWjYBSMglEwCgY/YGRgZBQUYmJiZGQEkYwMjIyMgoKCjIyMIJKBgRFIMjIyAklGRkYGRkFBYEcwMDIyMjAOUQAA1I4HwVwZAkYAAAAASUVORK5CYII=");
        background-size: ${(this.options.noise.scale || 1) * 200}px;
        background-repeat: repeat;
        opacity: ${(this.options.noise.opacity / 2).toFixed(3)};
        pointer-events: none;
      `;
      this.container.appendChild(this.noiseLayer);
    }

    this.gl = null;
    this.program = null;
    this.uniforms = {};
    this.positionBuffer = null;
    this.frameId = null;
    this.startTime = performance.now();
    this.isSuspended = false;
    this.resizeObserver = null;
    this.elapsedTime = 0;
    this.lastFrameTime = null;
    this.lastDrawTime = 0;
    this.paramsDirty = true;
    this.destroyed = false;
    this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.mobileQuery = window.matchMedia('(max-width: 768px), (pointer: coarse)');

    this.currentParams = this.resolveParams();
    this.initGL();
    this.bindEvents();
    this.start();
  }

  resolveParams() {
    if (this.options.customConfig) {
      return Object.assign({
        color1: '#050505',
        color2: '#66B3FF',
        color3: '#FFFFFF',
        rotation: 0,
        proportion: 35,
        scale: 1,
        speed: 25,
        distortion: 12,
        swirl: 80,
        swirlIterations: 10,
        softness: 100,
        offset: 0,
        shape: 'Checks',
        shapeSize: 10
      }, this.options.customConfig);
    }

    const presetName = this.options.preset && GRADIENT_PRESETS[this.options.preset] ? this.options.preset : 'Prism';
    const base = Object.assign({}, GRADIENT_PRESETS[presetName]);
    if (typeof this.options.speed === 'number') {
      base.speed = this.options.speed;
    }
    return base;
  }

  initGL() {
    const gl = this.canvas.getContext('webgl2', {
      premultipliedAlpha: false,
      alpha: true,
      antialias: false,
      powerPreference: 'high-performance'
    });

    if (!gl) {
      console.warn('[LiquidGradient] WebGL2 не поддерживается');
      return;
    }
    this.gl = gl;

    const vs = this.compileShader(gl.VERTEX_SHADER, VERTEX_SHADER_SRC);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SRC);
    if (!vs || !fs) {
      if (vs) gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
      return;
    }

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('[LiquidGradient] Link error:', gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return;
    }
    this.program = program;

    // В WebGL2 создаем выделенный VAO для гарантии сохранения привязок атрибутов вершин
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    this.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    const posLoc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);

    this.uniforms = {
      u_time: gl.getUniformLocation(program, 'u_time'),
      u_resolution: gl.getUniformLocation(program, 'u_resolution'),
      u_pixelRatio: gl.getUniformLocation(program, 'u_pixelRatio'),
      u_scale: gl.getUniformLocation(program, 'u_scale'),
      u_rotation: gl.getUniformLocation(program, 'u_rotation'),
      u_color1: gl.getUniformLocation(program, 'u_color1'),
      u_color2: gl.getUniformLocation(program, 'u_color2'),
      u_color3: gl.getUniformLocation(program, 'u_color3'),
      u_proportion: gl.getUniformLocation(program, 'u_proportion'),
      u_softness: gl.getUniformLocation(program, 'u_softness'),
      u_shape: gl.getUniformLocation(program, 'u_shape'),
      u_shapeScale: gl.getUniformLocation(program, 'u_shapeScale'),
      u_distortion: gl.getUniformLocation(program, 'u_distortion'),
      u_swirl: gl.getUniformLocation(program, 'u_swirl'),
      u_swirlIterations: gl.getUniformLocation(program, 'u_swirlIterations')
    };

    this.paramsDirty = true;
    this.resize();
  }

  compileShader(type, src) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('[LiquidGradient] Shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  resize() {
    if (!this.gl || !this.container) return;
    const width = Math.max(320, this.container.clientWidth || window.innerWidth || 360);
    const height = Math.max(320, this.container.clientHeight || window.innerHeight || 640);
    const pixelRatio = this.mobileQuery.matches ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
    this.pixelRatio = pixelRatio;

    const targetW = Math.max(1, Math.round(width * pixelRatio));
    const targetH = Math.max(1, Math.round(height * pixelRatio));

    if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
      this.canvas.width = targetW;
      this.canvas.height = targetH;
      this.canvas.style.width = width + 'px';
      this.canvas.style.height = height + 'px';
      this.gl.viewport(0, 0, targetW, targetH);
      this.paramsDirty = true;
    }
    this.start();
  }

  setPreset(presetName, speed) {
    if (GRADIENT_PRESETS[presetName]) {
      this.options.preset = presetName;
      this.options.customConfig = null;
      if (typeof speed === 'number') this.options.speed = speed;
      this.currentParams = this.resolveParams();
      this.paramsDirty = true;
      this.start();
    }
  }

  setColors(color1, color2, color3) {
    if (!this.options.customConfig) {
      this.options.customConfig = Object.assign({}, this.currentParams);
    }
    this.options.customConfig.color1 = color1;
    this.options.customConfig.color2 = color2;
    this.options.customConfig.color3 = color3;
    this.currentParams = this.resolveParams();
    this.paramsDirty = true;
    this.start();
  }

  setCustomConfig(cfg) {
    this.options.customConfig = Object.assign({}, cfg);
    this.currentParams = this.resolveParams();
    this.paramsDirty = true;
    this.start();
  }

  bindEvents() {
    this.handleResize = () => {
      if (this.resizeFrame || this.destroyed) return;
      this.resizeFrame = requestAnimationFrame(() => {
        this.resizeFrame = null;
        this.resize();
      });
    };
    window.addEventListener('resize', this.handleResize, { passive: true });

    if (window.ResizeObserver && this.container) {
      this.resizeObserver = new ResizeObserver(this.handleResize);
      this.resizeObserver.observe(this.container);
    }

    this.handleContextLost = (e) => {
      e.preventDefault();
      this.stop();
      this.program = null;
      this.positionBuffer = null;
    };

    this.handleContextRestored = () => {
      this.initGL();
      this.start();
    };

    this.canvas.addEventListener('webglcontextlost', this.handleContextLost, false);
    this.canvas.addEventListener('webglcontextrestored', this.handleContextRestored, false);

    // Observe only view boundaries, never the streaming message subtree.
    this.handleActivity = () => {
      if (this.isInactive()) this.stop();
      else this.start();
    };
    this.activityObserver = new MutationObserver(this.handleActivity);
    this.activityObserver.observe(document.documentElement, {
      attributes: true, attributeFilter: ['data-view', 'class']
    });
    ['settingsOverlay', 'uniOverlay', 'htmlPreview'].forEach(id => {
      const el = document.getElementById(id);
      if (el) this.activityObserver.observe(el, { attributes: true, attributeFilter: ['class', 'hidden'] });
    });
    document.addEventListener('visibilitychange', this.handleActivity);
    this.motionQuery.addEventListener('change', this.handleActivity);
    this.mobileQuery.addEventListener('change', this.handleResize);
  }

  isInactive() {
    if (this.destroyed || this.isSuspended || document.hidden) return true;
    // Miniature previews have their own owners; only the page background is covered.
    if (this.container.id !== 'liquidBgContainer') return false;
    return document.documentElement.dataset.view === 'settings'
      || document.documentElement.classList.contains('is-resizing')
      || document.getElementById('settingsOverlay')?.classList.contains('show')
      || document.getElementById('uniOverlay')?.hidden === false
      || document.getElementById('htmlPreview')?.classList.contains('hp-fullscreen');
  }

  start() {
    if (this.frameId || !this.program || this.isInactive()) return;
    this.lastFrameTime = null;
    this.lastDrawTime = 0;

    const render = (time) => {
      this.frameId = null;
      if (this.isInactive() || !this.program) return;
      const isStatic = this.motionQuery.matches || Number(this.currentParams.speed) === 0;
      if (!isStatic && this.lastFrameTime !== null) {
        this.elapsedTime += Math.min(time - this.lastFrameTime, 100) / 1000;
      }
      this.lastFrameTime = time;
      const interval = 1000 / (this.mobileQuery.matches ? 30 : 45);
      if (this.paramsDirty || !this.lastDrawTime || time - this.lastDrawTime >= interval - 0.5) {
        this.draw();
        this.lastDrawTime = time;
      }
      if (!isStatic) this.frameId = requestAnimationFrame(render);
    };

    this.frameId = requestAnimationFrame(render);
  }

  stop() {
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }

  suspend() {
    this.isSuspended = true;
    this.stop();
  }

  resume() {
    if (this.isSuspended) {
      this.isSuspended = false;
      this.start();
    }
  }

  draw() {
    const gl = this.gl;
    if (!gl || !this.program) return;

    const p = this.currentParams;
    const speedMultiplier = (p.speed / 100) * 5;

    gl.useProgram(this.program);

    if (this.vao) {
      gl.bindVertexArray(this.vao);
    } else {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    }

    gl.uniform1f(this.uniforms.u_time, this.elapsedTime * speedMultiplier + (p.offset || 0) * 0.01);
    gl.uniform2f(this.uniforms.u_resolution, Math.max(1, this.canvas.width), Math.max(1, this.canvas.height));
    gl.uniform1f(this.uniforms.u_pixelRatio, this.pixelRatio || 1);
    gl.uniform1f(this.uniforms.u_scale, p.scale || 0.55);
    gl.uniform1f(this.uniforms.u_rotation, ((p.rotation || 0) * Math.PI) / 180);

    const c1 = parseColorToRgba(p.color1);
    const c2 = parseColorToRgba(p.color2);
    const c3 = parseColorToRgba(p.color3);
    gl.uniform4f(this.uniforms.u_color1, c1[0], c1[1], c1[2], c1[3]);
    gl.uniform4f(this.uniforms.u_color2, c2[0], c2[1], c2[2], c2[3]);
    gl.uniform4f(this.uniforms.u_color3, c3[0], c3[1], c3[2], c3[3]);

    gl.uniform1f(this.uniforms.u_proportion, (p.proportion ?? 50) / 100);
    gl.uniform1f(this.uniforms.u_softness, (p.softness ?? 65) / 100);
    gl.uniform1f(this.uniforms.u_shape, PatternShapes[p.shape] ?? 0);
    gl.uniform1f(this.uniforms.u_shapeScale, (p.shapeSize ?? 45) / 100);
    gl.uniform1f(this.uniforms.u_distortion, (p.distortion ?? 6) / 50);
    gl.uniform1f(this.uniforms.u_swirl, (p.swirl ?? 55) / 100);
    gl.uniform1f(this.uniforms.u_swirlIterations, p.swirl === 0 ? 0 : (p.swirlIterations || 8));

    this.paramsDirty = false;

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    if (this.vao) {
      gl.bindVertexArray(null);
    }
  }

  destroy() {
    this.destroyed = true;
    this.stop();
    if (this.resizeFrame) cancelAnimationFrame(this.resizeFrame);
    this.activityObserver?.disconnect();
    document.removeEventListener('visibilitychange', this.handleActivity);
    this.motionQuery.removeEventListener('change', this.handleActivity);
    this.mobileQuery.removeEventListener('change', this.handleResize);
    if (this.gl) {
      if (this.positionBuffer) this.gl.deleteBuffer(this.positionBuffer);
      if (this.program) this.gl.deleteProgram(this.program);
    }
    window.removeEventListener('resize', this.handleResize);
    if (this.resizeObserver) this.resizeObserver.disconnect();
    if (this.canvas) {
      this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
      this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
      this.canvas.remove();
    }
    if (this.noiseLayer) this.noiseLayer.remove();
  }
}

window.LiquidGradientBackground = LiquidGradientBackground;
window.GRADIENT_PRESETS = GRADIENT_PRESETS;