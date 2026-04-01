/**
 * ParticleFaceAvatar.js
 * =====================
 * Lightweight, viseme-capable particle face renderer for Three.js/WebGL.
 * Integrates into existing avatar scenes via a clean, documented API.
 *
 * @version 1.0.0
 * @license MIT
 *
 * INTEGRATION QUICK-START:
 *   import { ParticleFaceAvatar } from './ParticleFaceAvatar.js';
 *   const avatar = new ParticleFaceAvatar(scene, camera, { container: domEl });
 *   avatar.onVisemeEvent({ viseme: 'AA', startTime: 0, duration: 200 });
 *   avatar.setEmotion('joy', 0.8);
 *   avatar.setGaze(0.1, -0.05);
 */

'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────

const VISEME_SHAPES = {
  // Each viseme maps to [mouthOpenY, mouthWideX, lipRoundness, jawDrop]
  // Values 0–1, used to morph particle cloud keyframes
  neutral: [0.00, 0.45, 0.30, 0.00],
  rest:    [0.00, 0.45, 0.30, 0.00],
  PP:      [0.00, 0.38, 0.10, 0.00], // bilabial plosive
  FF:      [0.12, 0.40, 0.05, 0.05], // labiodental
  TH:      [0.10, 0.44, 0.08, 0.04],
  DD:      [0.18, 0.46, 0.10, 0.08],
  kk:      [0.22, 0.48, 0.12, 0.10],
  CH:      [0.20, 0.42, 0.25, 0.08],
  SS:      [0.15, 0.50, 0.15, 0.06],
  nn:      [0.14, 0.46, 0.10, 0.06],
  RR:      [0.25, 0.40, 0.40, 0.12],
  aa:      [0.55, 0.52, 0.10, 0.35], // open vowel
  E:       [0.35, 0.60, 0.05, 0.18], // front mid
  I:       [0.28, 0.65, 0.05, 0.12], // high front
  O:       [0.40, 0.35, 0.60, 0.22], // back round
  U:       [0.30, 0.30, 0.70, 0.15], // high back round
  // Common aliases
  AH:      [0.55, 0.52, 0.10, 0.35],
  AW:      [0.45, 0.38, 0.55, 0.28],
  AY:      [0.42, 0.55, 0.08, 0.20],
  EH:      [0.35, 0.58, 0.06, 0.18],
  ER:      [0.28, 0.42, 0.38, 0.14],
  EY:      [0.30, 0.60, 0.05, 0.14],
  IH:      [0.26, 0.63, 0.05, 0.10],
  IY:      [0.25, 0.68, 0.04, 0.10],
  OW:      [0.38, 0.32, 0.65, 0.20],
  OY:      [0.42, 0.34, 0.60, 0.22],
  UH:      [0.28, 0.33, 0.62, 0.14],
  UW:      [0.28, 0.28, 0.75, 0.14],
  W:       [0.20, 0.28, 0.70, 0.08],
  Y:       [0.22, 0.60, 0.12, 0.10],
  L:       [0.18, 0.48, 0.10, 0.07],
  M:       [0.00, 0.38, 0.10, 0.00],
  B:       [0.00, 0.40, 0.10, 0.00],
  P:       [0.00, 0.38, 0.10, 0.00],
  F:       [0.12, 0.40, 0.05, 0.05],
  V:       [0.12, 0.40, 0.05, 0.05],
};

const EMOTION_CONFIGS = {
  // [browRaise, browFurrow, cheekRaise, cornerPull, lowerLipPull, eyeOpen]
  neutral:  [0.00,  0.00,  0.00,  0.00,  0.00,  1.00],
  joy:      [0.20,  0.00,  0.70,  0.80,  0.10,  0.90],
  anger:    [-0.30, 0.85,  0.10, -0.30,  0.30,  1.10],
  sadness:  [-0.20, 0.20, -0.10, -0.50,  0.20,  0.75],
  surprise: [0.90,  0.00,  0.10,  0.10,  0.00,  1.40],
  fear:     [0.70,  0.60,  0.05,  0.00,  0.20,  1.35],
  disgust:  [-0.10, 0.40,  0.30, -0.20,  0.50,  0.90],
};

const DEFAULTS = {
  particleCount: 4800,        // base count; scaled by quality tier
  faceWidth: 1.4,             // world units
  faceHeight: 1.8,
  particleSize: 0.018,
  skinColor: 0xf5c5a3,
  accentColor: 0xe8956d,
  eyeColor: 0x3a6186,
  lipColor: 0xc47878,
  blinkRate: 0.25,            // blinks/sec average
  blinkRateVariance: 0.15,
  saccadeInterval: 2200,      // ms between micro-saccades
  saccadeAmplitude: 0.012,
  visemeFadeIn: 80,           // ms
  visemeFadeOut: 60,          // ms
  emotionTransitionMs: 380,
  quality: 'auto',            // 'low' | 'medium' | 'high' | 'auto'
};

// ─── Utilities ────────────────────────────────────────────────────────────────

function lerp(a, b, t) { return a + (b - a) * Math.max(0, Math.min(1, t)); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function easeInOut(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }
function rand(lo, hi) { return lo + Math.random() * (hi - lo); }
function seededNoise(x, y, t) {
  // Lightweight pseudo-noise for organic movement without importing a library
  return Math.sin(x * 3.7 + t * 0.8) * Math.cos(y * 2.9 + t * 0.6) * 0.5 + 0.5;
}

// ─── Quality Detection ────────────────────────────────────────────────────────

function detectQualityTier() {
  const gl = document.createElement('canvas').getContext('webgl');
  if (!gl) return 'low';
  const renderer = gl.getParameter(gl.RENDERER) || '';
  const isMobile = /mobile|android|iphone|ipad/i.test(navigator.userAgent);
  if (isMobile) return 'medium';
  if (/intel/i.test(renderer) && !/iris/i.test(renderer)) return 'medium';
  return 'high';
}

const QUALITY_MULTIPLIERS = { low: 0.4, medium: 0.7, high: 1.0 };

// ─── Particle Geometry Builder ─────────────────────────────────────────────────

/**
 * Generates the "rest pose" particle positions for a stylized face.
 * Returns Float32Array[count * 3] in local face space.
 * Region tagging is stored separately for morph targeting.
 */
function buildFaceParticles(count, fw, fh) {
  // Distribution: skin 60%, feature highlights 20%, lips 12%, brows 8%
  const regions = {
    skin:  Math.floor(count * 0.60),
    cheek: Math.floor(count * 0.10),
    lips:  Math.floor(count * 0.12),
    brows: Math.floor(count * 0.08),
    eyes:  Math.floor(count * 0.10),
  };

  const positions  = new Float32Array(count * 3);
  const restPos    = new Float32Array(count * 3); // stored for morphing
  const regionTags = new Uint8Array(count);       // 0=skin,1=cheek,2=lips,3=brow,4=eye
  const colors     = new Float32Array(count * 3);

  let idx = 0;

  function place(x, y, z, region) {
    if (idx >= count) return;
    positions[idx * 3]     = x;
    positions[idx * 3 + 1] = y;
    positions[idx * 3 + 2] = z;
    restPos[idx * 3]       = x;
    restPos[idx * 3 + 1]   = y;
    restPos[idx * 3 + 2]   = z;
    regionTags[idx]        = region;
    idx++;
  }

  // ── Skin (elliptical face outline) ──
  for (let i = 0; i < regions.skin; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random());
    // Slight vertical elongation
    const x = Math.cos(angle) * r * fw * 0.48 + rand(-0.01, 0.01);
    const y = Math.sin(angle) * r * fh * 0.46 + rand(-0.01, 0.01);
    place(x, y, rand(-0.01, 0.02), 0);
  }

  // ── Cheek blush region ──
  for (let i = 0; i < regions.cheek; i++) {
    const side = i < regions.cheek / 2 ? -1 : 1;
    const cx = side * fw * 0.28 + rand(-0.08, 0.08);
    const cy = fh * -0.05 + rand(-0.07, 0.07);
    place(cx, cy, 0.03 + rand(0, 0.01), 1);
  }

  // ── Lips ──
  const lipCount = regions.lips;
  for (let i = 0; i < lipCount; i++) {
    const t = i / lipCount;
    const upper = i < lipCount * 0.45;
    const lower = i >= lipCount * 0.55;
    const angle = t * Math.PI;
    const lx = Math.cos(angle - Math.PI / 2) * fw * 0.14 + rand(-0.015, 0.015);
    const ly = fh * (upper ? -0.24 : lower ? -0.31 : -0.275) + rand(-0.01, 0.01);
    place(lx, ly, 0.04 + rand(0, 0.015), 2);
  }

  // ── Brows ──
  for (let i = 0; i < regions.brows; i++) {
    const side = i < regions.brows / 2 ? -1 : 1;
    const t = (i % (regions.brows / 2)) / (regions.brows / 2);
    const bx = side * (fw * 0.10 + t * fw * 0.14) + rand(-0.01, 0.01);
    const by = fh * 0.22 + Math.sin(t * Math.PI) * 0.03 + rand(-0.01, 0.01);
    place(bx, by, 0.03 + rand(0, 0.01), 3);
  }

  // ── Eyes ──
  for (let i = 0; i < regions.eyes; i++) {
    const side = i < regions.eyes / 2 ? -1 : 1;
    const angle = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * 0.05;
    const ex = side * fw * 0.22 + Math.cos(angle) * r + rand(-0.005, 0.005);
    const ey = fh * 0.10 + Math.sin(angle) * r * 0.6 + rand(-0.005, 0.005);
    place(ex, ey, 0.05 + rand(0, 0.01), 4);
  }

  // Fill remainder with skin
  while (idx < count) {
    const x = rand(-fw * 0.45, fw * 0.45);
    const y = rand(-fh * 0.45, fh * 0.45);
    const inEllipse = (x / (fw * 0.48)) ** 2 + (y / (fh * 0.46)) ** 2;
    if (inEllipse <= 1) place(x, y, 0, 0);
  }

  // Assign base colors by region
  const skinR = 0xf5 / 255, skinG = 0xc5 / 255, skinB = 0xa3 / 255;
  const cheekR = 0xe8 / 255, cheekG = 0x95 / 255, cheekB = 0x6d / 255;
  const lipR  = 0xc4 / 255, lipG  = 0x78 / 255, lipB  = 0x78 / 255;
  const browR = 0x5a / 255, browG = 0x3a / 255, browB = 0x28 / 255;
  const eyeR  = 0x3a / 255, eyeG  = 0x61 / 255, eyeB  = 0x86 / 255;

  const REGION_COLORS = [
    [skinR, skinG, skinB],
    [cheekR, cheekG, cheekB],
    [lipR,  lipG,  lipB],
    [browR, browG, browB],
    [eyeR,  eyeG,  eyeB],
  ];

  for (let i = 0; i < count; i++) {
    const [r, g, b] = REGION_COLORS[regionTags[i]];
    colors[i * 3]     = r + rand(-0.04, 0.04);
    colors[i * 3 + 1] = g + rand(-0.04, 0.04);
    colors[i * 3 + 2] = b + rand(-0.04, 0.04);
  }

  return { positions, restPos, regionTags, colors };
}

// ─── Main Class ───────────────────────────────────────────────────────────────

/**
 * ParticleFaceAvatar
 *
 * @param {THREE.Scene}    scene   - Your existing Three.js scene
 * @param {THREE.Camera}   camera  - Your existing camera
 * @param {object}         opts    - Options (see DEFAULTS above)
 */
export class ParticleFaceAvatar {
  constructor(scene, camera, opts = {}) {
    this._scene  = scene;
    this._camera = camera;
    this._opts   = Object.assign({}, DEFAULTS, opts);

    // Quality tier
    const tier = this._opts.quality === 'auto'
      ? detectQualityTier()
      : this._opts.quality;
    this._qualityMul = QUALITY_MULTIPLIERS[tier] ?? 0.7;
    this._particleCount = Math.floor(this._opts.particleCount * this._qualityMul);

    // State
    this._clock        = { now: performance.now() };
    this._visemeQueue  = [];
    this._activeViseme = { shape: VISEME_SHAPES.neutral.slice(), weight: 0 };
    this._targetViseme = VISEME_SHAPES.neutral.slice();
    this._currentShape = VISEME_SHAPES.neutral.slice();

    this._emotion       = 'neutral';
    this._emotionWeight = 1.0;
    this._targetEmotion = 'neutral';
    this._emotionBlend  = 1.0;
    this._emotionStart  = 0;
    this._emotionFrom   = EMOTION_CONFIGS.neutral.slice();
    this._emotionTo     = EMOTION_CONFIGS.neutral.slice();
    this._emotionCurrent= EMOTION_CONFIGS.neutral.slice();

    this._gazeX = 0;   // -1..1 horizontal
    this._gazeY = 0;   // -1..1 vertical
    this._gazeTarget = { x: 0, y: 0 };

    this._blinkState      = 'open';   // 'open' | 'closing' | 'opening'
    this._blinkProgress   = 0;
    this._nextBlinkIn     = this._nextBlinkDelay();
    this._lastBlinkCheck  = performance.now();

    this._saccadeOffset   = { x: 0, y: 0 };
    this._saccadeTarget   = { x: 0, y: 0 };
    this._lastSaccade     = performance.now();

    this._disposed = false;
    this._lastFrameTime = performance.now();

    this._visemeEventBuffer = []; // for adapter ingestion

    this._init();
    this._startLoop();
  }

  // ─── Initialization ─────────────────────────────────────────────────────────

  _init() {
    const { faceWidth: fw, faceHeight: fh } = this._opts;
    const count = this._particleCount;

    const { positions, restPos, regionTags, colors } =
      buildFaceParticles(count, fw, fh);

    this._restPositions = restPos;
    this._regionTags    = regionTags;
    this._workPositions = positions.slice(); // working copy for morphs

    // Three.js geometry
    this._geometry = new THREE.BufferGeometry();
    this._posAttr  = new THREE.BufferAttribute(new Float32Array(positions), 3);
    this._posAttr.setUsage(THREE.DynamicDrawUsage);
    this._geometry.setAttribute('position', this._posAttr);
    this._geometry.setAttribute('color',
      new THREE.BufferAttribute(colors, 3));

    // Circular sprite texture (avoid external fetch)
    this._spriteTex = this._makeCircleTex(64);

    this._material = new THREE.PointsMaterial({
      size: this._opts.particleSize * (this._qualityMul < 0.6 ? 1.3 : 1.0),
      map: this._spriteTex,
      vertexColors: true,
      transparent: true,
      alphaTest: 0.05,
      depthWrite: false,
      sizeAttenuation: true,
    });

    this._points = new THREE.Points(this._geometry, this._material);
    this._points.frustumCulled = false;

    // Offset group — allows external positioning
    this._group = new THREE.Group();
    this._group.add(this._points);

    if (this._opts.position) {
      const p = this._opts.position;
      this._group.position.set(p.x ?? 0, p.y ?? 0, p.z ?? 0);
    }

    this._scene.add(this._group);

    // Eye state per eye (left=0, right=1)
    this._eyeOpenness = [1.0, 1.0];
  }

  _makeCircleTex(size) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const half = size / 2;
    const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
    grad.addColorStop(0.0, 'rgba(255,255,255,1.0)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.8)');
    grad.addColorStop(1.0, 'rgba(255,255,255,0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }

  // ─── Render Loop ────────────────────────────────────────────────────────────

  _startLoop() {
    const loop = (ts) => {
      if (this._disposed) return;
      this._raf = requestAnimationFrame(loop);
      const dt = Math.min(ts - this._lastFrameTime, 100); // cap at 100ms
      this._lastFrameTime = ts;
      this._update(ts, dt);
    };
    this._raf = requestAnimationFrame(loop);
  }

  _update(ts, dt) {
    this._drainVisemeQueue(ts);
    this._updateViseme(ts, dt);
    this._updateEmotion(ts, dt);
    this._updateBlink(ts, dt);
    this._updateGaze(ts, dt);
    this._updateSaccades(ts, dt);
    this._applyMorphs(ts);
    this._posAttr.needsUpdate = true;
  }

  // ─── Viseme Pipeline ────────────────────────────────────────────────────────

  /**
   * Primary integration point: feed viseme events from your pipeline.
   *
   * Accepts either:
   *   A) Single event object:
   *      { viseme, startTime, duration, [weight] }
   *   B) Array of event objects (timeline)
   *
   * @param {object|Array} eventOrArray
   */
  onVisemeEvent(eventOrArray) {
    const events = Array.isArray(eventOrArray) ? eventOrArray : [eventOrArray];
    for (const ev of events) {
      this._visemeQueue.push({
        viseme:    (ev.viseme || ev.phoneme || 'neutral').toUpperCase(),
        startTime: ev.startTime ?? ev.start ?? performance.now(),
        duration:  ev.duration  ?? ev.dur  ?? 150,
        weight:    ev.weight    ?? 1.0,
      });
    }
    // Sort by startTime for deterministic playback
    this._visemeQueue.sort((a, b) => a.startTime - b.startTime);
  }

  /**
   * Adapter: converts common phoneme event formats.
   * Supports Oculus LipSync, Azure TTS viseme, and generic phoneme arrays.
   */
  adaptVisemeStream(format, data) {
    switch (format) {
      case 'oculus': {
        // data: [{ frameIndex, viseme }], 30fps assumed
        const events = data.map(({ frameIndex, viseme }, i, arr) => ({
          viseme,
          startTime: performance.now() + frameIndex * (1000 / 30),
          duration:  i < arr.length - 1
            ? (arr[i + 1].frameIndex - frameIndex) * (1000 / 30)
            : 100,
        }));
        this.onVisemeEvent(events);
        break;
      }
      case 'azure': {
        // data: [{ audioOffset, visemeId }]
        // Azure viseme IDs 0-21 -> map to phoneme codes
        const AZURE_MAP = [
          'neutral','AA','AA','AH','EH','ER','IH','IH','OW','OW',
          'UW','AA','RR','EH','UW','OW','AA','AH','EH','PP','FF','TH',
        ];
        const events = data.map((ev, i, arr) => ({
          viseme:    AZURE_MAP[ev.visemeId] || 'neutral',
          startTime: performance.now() + ev.audioOffset / 10000, // 100ns units
          duration:  i < arr.length - 1
            ? (arr[i + 1].audioOffset - ev.audioOffset) / 10000
            : 120,
        }));
        this.onVisemeEvent(events);
        break;
      }
      case 'phoneme-array': {
        // data: [{ phoneme, time, duration }]
        const events = data.map(ev => ({
          viseme:    ev.phoneme,
          startTime: performance.now() + (ev.time ?? 0),
          duration:  ev.duration ?? 120,
        }));
        this.onVisemeEvent(events);
        break;
      }
      default:
        console.warn('[ParticleFaceAvatar] Unknown adapter format:', format);
    }
  }

  _drainVisemeQueue(ts) {
    while (this._visemeQueue.length > 0 &&
           this._visemeQueue[0].startTime <= ts) {
      const ev = this._visemeQueue.shift();
      const key = ev.viseme;
      const shape = VISEME_SHAPES[key]
        || VISEME_SHAPES[key.toLowerCase()]
        || VISEME_SHAPES.neutral;
      this._activeViseme = {
        shape:     shape.slice(),
        weight:    ev.weight,
        endTime:   ts + ev.duration,
        fadeIn:    ts + this._opts.visemeFadeIn,
        fadeOut:   ts + ev.duration - this._opts.visemeFadeOut,
      };
    }
  }

  _updateViseme(ts, dt) {
    const av = this._activeViseme;
    if (!av || !av.endTime) {
      // Decay toward rest
      for (let i = 0; i < this._currentShape.length; i++) {
        this._currentShape[i] = lerp(this._currentShape[i],
          VISEME_SHAPES.neutral[i], dt / 120);
      }
      return;
    }

    let weight = av.weight;
    if (ts < av.fadeIn) {
      weight *= (ts - (av.fadeIn - this._opts.visemeFadeIn)) /
                this._opts.visemeFadeIn;
    } else if (ts > av.fadeOut) {
      weight *= 1 - (ts - av.fadeOut) / this._opts.visemeFadeOut;
    }
    weight = clamp(weight, 0, 1);

    if (ts > av.endTime) {
      this._activeViseme = null;
    }

    for (let i = 0; i < this._currentShape.length; i++) {
      const target = lerp(VISEME_SHAPES.neutral[i], av.shape[i], weight);
      this._currentShape[i] = lerp(this._currentShape[i], target, dt / 40);
    }
  }

  // ─── Emotion System ──────────────────────────────────────────────────────────

  /**
   * Set facial emotion with optional blend weight and transition time.
   *
   * @param {string} emotion  - 'neutral'|'joy'|'anger'|'sadness'|'surprise'|'fear'|'disgust'
   * @param {number} weight   - 0..1
   * @param {number} [ms]     - transition duration in ms (default: emotionTransitionMs)
   */
  setEmotion(emotion, weight = 1.0, ms = null) {
    if (!EMOTION_CONFIGS[emotion]) {
      console.warn('[ParticleFaceAvatar] Unknown emotion:', emotion);
      return;
    }
    this._emotionFrom   = this._emotionCurrent.slice();
    this._targetEmotion = emotion;
    this._emotionWeight = weight;
    this._emotionStart  = performance.now();
    this._emotionDur    = ms ?? this._opts.emotionTransitionMs;
    this._emotionTo     = EMOTION_CONFIGS[emotion].slice();
  }

  _updateEmotion(ts) {
    const elapsed = ts - this._emotionStart;
    const t = this._emotionDur > 0
      ? easeInOut(clamp(elapsed / this._emotionDur, 0, 1))
      : 1;
    for (let i = 0; i < this._emotionCurrent.length; i++) {
      const base = lerp(this._emotionFrom[i], this._emotionTo[i], t);
      this._emotionCurrent[i] = lerp(EMOTION_CONFIGS.neutral[i], base,
                                     this._emotionWeight);
    }
  }

  // ─── Eye Controls ────────────────────────────────────────────────────────────

  /**
   * Set gaze direction.
   * @param {number} x   - horizontal (-1=left, 0=center, 1=right)
   * @param {number} y   - vertical   (-1=down, 0=center, 1=up)
   * @param {object} [opts] - { smooth: true, speedMs: 300 }
   */
  setGaze(x, y, opts = {}) {
    this._gazeTarget.x = clamp(x, -1, 1);
    this._gazeTarget.y = clamp(y, -1, 1);
    this._gazeSmooth   = opts.smooth !== false;
    this._gazeSpeed    = opts.speedMs ?? 300;
  }

  /**
   * Trigger a manual blink.
   * @param {object} [opts] - { duration: 180 }
   */
  blink(opts = {}) {
    if (this._blinkState === 'open') {
      this._blinkDuration = opts.duration ?? 180;
      this._blinkState    = 'closing';
      this._blinkProgress = 0;
    }
  }

  /**
   * Configure blink behavior.
   * @param {object} cfg - { rate, variance, enabled }
   */
  setBlinkConfig(cfg = {}) {
    if (cfg.rate     !== undefined) this._opts.blinkRate     = cfg.rate;
    if (cfg.variance !== undefined) this._opts.blinkRateVariance = cfg.variance;
    if (cfg.enabled  !== undefined) this._blinkEnabled       = cfg.enabled;
  }

  _nextBlinkDelay() {
    const rate = this._opts.blinkRate + rand(
      -this._opts.blinkRateVariance,
       this._opts.blinkRateVariance
    );
    return (1 / Math.max(0.01, rate)) * 1000;
  }

  _updateBlink(ts, dt) {
    // Auto-blink timer
    if (this._blinkEnabled !== false) {
      if (ts - this._lastBlinkCheck > this._nextBlinkIn) {
        this._lastBlinkCheck = ts;
        this._nextBlinkIn    = this._nextBlinkDelay();
        this.blink();
      }
    }

    const dur = this._blinkDuration ?? 180;
    const half = dur / 2;

    if (this._blinkState === 'closing') {
      this._blinkProgress += dt;
      const t = clamp(this._blinkProgress / half, 0, 1);
      const v = easeInOut(t);
      this._eyeOpenness[0] = this._eyeOpenness[1] = 1 - v;
      if (this._blinkProgress >= half) {
        this._blinkState    = 'opening';
        this._blinkProgress = 0;
      }
    } else if (this._blinkState === 'opening') {
      this._blinkProgress += dt;
      const t = clamp(this._blinkProgress / half, 0, 1);
      const v = easeInOut(t);
      this._eyeOpenness[0] = this._eyeOpenness[1] = v;
      if (this._blinkProgress >= half) {
        this._blinkState    = 'open';
        this._blinkProgress = 0;
        this._eyeOpenness[0] = this._eyeOpenness[1] = 1;
      }
    }
  }

  _updateGaze(ts, dt) {
    const speed = this._gazeSpeed ?? 300;
    const t = this._gazeSmooth !== false ? dt / speed : 1;
    this._gazeX = lerp(this._gazeX, this._gazeTarget.x, clamp(t, 0, 1));
    this._gazeY = lerp(this._gazeY, this._gazeTarget.y, clamp(t, 0, 1));
  }

  _updateSaccades(ts) {
    if (ts - this._lastSaccade > this._opts.saccadeInterval + rand(-400, 400)) {
      this._lastSaccade   = ts;
      const amp = this._opts.saccadeAmplitude;
      this._saccadeTarget = { x: rand(-amp, amp), y: rand(-amp, amp) };
    }
    this._saccadeOffset.x = lerp(this._saccadeOffset.x,
      this._saccadeTarget.x, 0.08);
    this._saccadeOffset.y = lerp(this._saccadeOffset.y,
      this._saccadeTarget.y, 0.08);
  }

  // ─── Morph Application ───────────────────────────────────────────────────────

  _applyMorphs(ts) {
    const pos     = this._workPositions;
    const rest    = this._restPositions;
    const regions = this._regionTags;
    const count   = this._particleCount;
    const fw      = this._opts.faceWidth;
    const fh      = this._opts.faceHeight;

    const [mouthOpenY, mouthWideX, lipRound, jawDrop] = this._currentShape;
    const [browRaise, browFurrow, cheekRaise,
           cornerPull, lowerLipPull, eyeOpen] = this._emotionCurrent;

    const blinkL = this._eyeOpenness[0];
    const blinkR = this._eyeOpenness[1];

    const gazeX = this._gazeX + this._saccadeOffset.x;
    const gazeY = this._gazeY + this._saccadeOffset.y;

    const time = ts * 0.001;

    for (let i = 0; i < count; i++) {
      const ri = i * 3;
      let x = rest[ri], y = rest[ri + 1], z = rest[ri + 2];

      const region = regions[i];

      // Organic micro-drift on skin
      if (region === 0) {
        const noise = seededNoise(x * 4, y * 3, time * 0.3) * 0.003;
        x += noise; y += noise * 0.5;
      }

      // ── Lips / mouth region ──
      if (region === 2) {
        const isUpper = y > fh * -0.275;
        const xNorm   = x / (fw * 0.14); // -1..1 across lips

        // Mouth open: lower jaw drops
        if (!isUpper) {
          y -= mouthOpenY * fh * 0.08;
          y -= jawDrop * fh * 0.04;
        }
        // Mouth wide: stretch corners
        x += xNorm * mouthWideX * fw * 0.04;
        // Lip round: pucker/compress
        x *= 1 - lipRound * 0.25;

        // Emotion corner pull (joy=up, sadness=down)
        const cornerInfluence = Math.abs(xNorm);
        y += cornerPull * fh * 0.025 * cornerInfluence;
        if (!isUpper) y += lowerLipPull * fh * 0.015;

        z += mouthOpenY * 0.03;
      }

      // ── Brows ──
      if (region === 3) {
        const side = x < 0 ? -1 : 1;
        const browT = (Math.abs(x) - fw * 0.10) / (fw * 0.14);
        y += browRaise * fh * 0.06;
        // Furrow: inner brow descends
        if (browT < 0.3) y -= browFurrow * fh * 0.04;
        // Surprise: arch up
        x += side * browRaise * fw * 0.015 * browT;
      }

      // ── Cheeks ──
      if (region === 1) {
        y += cheekRaise * fh * 0.035;
        z += cheekRaise * 0.02;
      }

      // ── Eyes ──
      if (region === 4) {
        const side    = x < 0 ? 0 : 1; // 0=left, 1=right
        const blink   = side === 0 ? blinkL : blinkR;
        const eyeEmo  = eyeOpen;
        const eyeCx   = (side === 0 ? -1 : 1) * fw * 0.22;
        const eyeCy   = fh * 0.10;
        const dy      = y - eyeCy;

        // Blink: compress vertically
        y = eyeCy + dy * blink * eyeEmo;
        z += (1 - blink) * 0.02;

        // Gaze: shift iris center
        const gazeShiftX = gazeX * fw * 0.015;
        const gazeShiftY = gazeY * fh * 0.010;
        const distFromCenter = Math.sqrt((x - eyeCx) ** 2 + dy ** 2);
        if (distFromCenter < 0.055) {
          x += gazeShiftX;
          y += gazeShiftY;
        }
      }

      pos[ri]     = x;
      pos[ri + 1] = y;
      pos[ri + 2] = z;
    }

    this._posAttr.array.set(pos);
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  /**
   * Position the face in world space.
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  setPosition(x, y, z) { this._group.position.set(x, y, z); }

  /**
   * Rotate the face group.
   * @param {number} x  - rotation in radians
   * @param {number} y
   * @param {number} z
   */
  setRotation(x, y, z) { this._group.rotation.set(x, y, z); }

  /**
   * Scale the face uniformly.
   * @param {number} s
   */
  setScale(s) { this._group.scale.setScalar(s); }

  /**
   * Access the Three.js Group for manual scene manipulation.
   * @returns {THREE.Group}
   */
  get group() { return this._group; }

  /**
   * Force reset to neutral expression and clear viseme queue.
   */
  reset() {
    this._visemeQueue  = [];
    this._activeViseme = null;
    this._currentShape = VISEME_SHAPES.neutral.slice();
    this.setEmotion('neutral', 1.0, 200);
    this._gazeTarget   = { x: 0, y: 0 };
    this._blinkState   = 'open';
    this._eyeOpenness  = [1, 1];
  }

  /**
   * Blend two emotions together (priority-safe: mouth state preserved from viseme).
   * @param {string} emotionA
   * @param {string} emotionB
   * @param {number} blend  - 0 = full A, 1 = full B
   */
  blendEmotions(emotionA, emotionB, blend, ms = null) {
    if (!EMOTION_CONFIGS[emotionA] || !EMOTION_CONFIGS[emotionB]) return;
    const cfgA = EMOTION_CONFIGS[emotionA];
    const cfgB = EMOTION_CONFIGS[emotionB];
    const blended = cfgA.map((v, i) => lerp(v, cfgB[i], blend));
    this._emotionFrom   = this._emotionCurrent.slice();
    this._emotionTo     = blended;
    this._emotionStart  = performance.now();
    this._emotionDur    = ms ?? this._opts.emotionTransitionMs;
    this._emotionWeight = 1.0;
  }

  /**
   * Get current state snapshot (useful for debugging / recording).
   * @returns {object}
   */
  getState() {
    return {
      visemeQueue:    this._visemeQueue.length,
      activeViseme:   this._activeViseme ? 'active' : 'rest',
      currentShape:   this._currentShape.slice(),
      emotion:        this._targetEmotion,
      emotionWeight:  this._emotionWeight,
      gaze:           { x: this._gazeX, y: this._gazeY },
      eyeOpenness:    this._eyeOpenness.slice(),
      blinkState:     this._blinkState,
      particleCount:  this._particleCount,
    };
  }

  /**
   * Update particle size (for responsive scaling).
   * @param {number} size
   */
  setParticleSize(size) {
    this._material.size = size;
  }

  /**
   * Change skin/lip/eye tint at runtime.
   * @param {object} colors - { skin, lips, eyes } as 0xRRGGBB
   */
  setColors(colors) {
    // Rebuild color buffer — triggers on next frame
    if (!this._geometry) return;
    const arr = this._geometry.attributes.color.array;
    const regions = this._regionTags;
    const n = this._particleCount;

    const parse = (hex) => [
      ((hex >> 16) & 0xff) / 255,
      ((hex >>  8) & 0xff) / 255,
       (hex        & 0xff) / 255,
    ];

    const skinC  = colors.skin  ? parse(colors.skin)  : null;
    const lipC   = colors.lips  ? parse(colors.lips)  : null;
    const eyeC   = colors.eyes  ? parse(colors.eyes)  : null;

    for (let i = 0; i < n; i++) {
      const r = regions[i];
      let c = null;
      if (r === 0 && skinC) c = skinC;
      if (r === 2 && lipC)  c = lipC;
      if (r === 4 && eyeC)  c = eyeC;
      if (c) {
        arr[i * 3]     = c[0] + rand(-0.03, 0.03);
        arr[i * 3 + 1] = c[1] + rand(-0.03, 0.03);
        arr[i * 3 + 2] = c[2] + rand(-0.03, 0.03);
      }
    }
    this._geometry.attributes.color.needsUpdate = true;
  }

  /**
   * Dispose all Three.js resources and stop the render loop.
   */
  dispose() {
    this._disposed = true;
    cancelAnimationFrame(this._raf);
    this._geometry.dispose();
    this._material.dispose();
    this._spriteTex.dispose();
    this._scene.remove(this._group);
  }
}

// ─── Named exports for tree-shaking ──────────────────────────────────────────

export { VISEME_SHAPES, EMOTION_CONFIGS, DEFAULTS };