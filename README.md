# ParticleFaceAvatar — API Reference

**Version:** 1.0.0  
**Dependencies:** Three.js r128+ (loaded from CDN or your bundle)  
**Files:** `ParticleFaceAvatar.js` (ES module) + `avatar-demo.html`

---

## Quick Integration

```js
import { ParticleFaceAvatar } from './ParticleFaceAvatar.js';

// 1. Plug into your existing Three.js scene
const avatar = new ParticleFaceAvatar(scene, camera, {
  particleCount: 5000,   // base particle budget
  quality: 'auto',       // 'low' | 'medium' | 'high' | 'auto'
});

// 2. Position it in your scene
avatar.setPosition(0, 0, 0);
```

---

## Constructor

```js
new ParticleFaceAvatar(scene, camera, options)
```

| Option | Type | Default | Description |
|---|---|---|---|
| `particleCount` | `number` | `4800` | Base particle count (auto-scaled by quality tier) |
| `faceWidth` | `number` | `1.4` | Face width in world units |
| `faceHeight` | `number` | `1.8` | Face height in world units |
| `particleSize` | `number` | `0.018` | Initial point size |
| `blinkRate` | `number` | `0.25` | Average blinks per second |
| `blinkRateVariance` | `number` | `0.15` | ± randomization on blink rate |
| `saccadeInterval` | `number` | `2200` | ms between micro-saccades |
| `saccadeAmplitude` | `number` | `0.012` | Max saccade shift (world units) |
| `visemeFadeIn` | `number` | `80` | ms to ramp viseme in |
| `visemeFadeOut` | `number` | `60` | ms to ramp viseme out |
| `emotionTransitionMs` | `number` | `380` | Default emotion blend duration |
| `quality` | `string` | `'auto'` | Quality tier (auto-detects GPU) |
| `position` | `{x,y,z}` | — | Initial world position |

---

## Viseme / Phoneme Integration

### `avatar.onVisemeEvent(event | event[])`

Primary pipeline integration point. Feed events from your TTS or phoneme system.

```js
// Single event
avatar.onVisemeEvent({
  viseme:    'AA',            // phoneme code (see table below)
  startTime: performance.now() + 50,  // absolute timestamp (ms)
  duration:  180,             // ms
  weight:    1.0,             // 0–1 blend weight
});

// Timeline array (recommended: sort by startTime)
avatar.onVisemeEvent([
  { viseme: 'HH', startTime: t0,       duration: 80  },
  { viseme: 'EH', startTime: t0 + 80,  duration: 120 },
  { viseme: 'L',  startTime: t0 + 200, duration: 80  },
  { viseme: 'OW', startTime: t0 + 280, duration: 150 },
]);
```

**Timing assumption:** `startTime` is `performance.now()` epoch (ms). Events
arriving before `startTime` are buffered; late events are applied immediately
with a short crossfade. Missing events gracefully decay to neutral.

---

### `avatar.adaptVisemeStream(format, data)`

Adapter for common third-party formats. No custom TTS engine required.

```js
// Azure Cognitive Services TTS viseme events
avatar.adaptVisemeStream('azure', [
  { audioOffset: 0,       visemeId: 0  },
  { audioOffset: 1000000, visemeId: 19 },  // 100ns units
  { audioOffset: 2500000, visemeId: 1  },
]);

// Oculus LipSync (30fps frame indices)
avatar.adaptVisemeStream('oculus', [
  { frameIndex: 0,  viseme: 'PP' },
  { frameIndex: 4,  viseme: 'AA' },
  { frameIndex: 9,  viseme: 'OW' },
]);

// Generic phoneme array
avatar.adaptVisemeStream('phoneme-array', [
  { phoneme: 'HH', time: 0,   duration: 90  },
  { phoneme: 'AH', time: 90,  duration: 130 },
  { phoneme: 'L',  time: 220, duration: 80  },
]);
```

---

### Supported Viseme Codes

| Code | Description | Code | Description |
|------|-------------|------|-------------|
| `PP` / `BB` / `MM` | Bilabial closure | `AA` / `AH` | Open vowel |
| `FF` / `VV` | Labiodental | `EH` / `E` | Front mid vowel |
| `TH` | Dental fricative | `IH` / `IY` / `I` | High front vowel |
| `DD` | Alveolar stop | `OW` / `O` | Back round vowel |
| `KK` | Velar stop | `UW` / `UH` / `U` | High back vowel |
| `CH` | Palatal affricate | `ER` / `RR` | R-colored vowel |
| `SS` | Sibilant | `AW` / `AY` / `OY` | Diphthongs |
| `NN` / `L` / `W` / `Y` | Approximants | `neutral` / `rest` | Closed rest |

---

## Emotion System

### `avatar.setEmotion(emotion, weight?, durationMs?)`

```js
avatar.setEmotion('joy');                    // full intensity
avatar.setEmotion('sadness', 0.6);           // 60% intensity
avatar.setEmotion('surprise', 1.0, 600);     // custom transition time
```

**Available emotions:** `neutral` · `joy` · `anger` · `sadness` · `surprise` · `fear` · `disgust`

**Priority-safe:** The emotion system only drives brows, cheeks, and corners.
Active visemes always take precedence on mouth parameters — no blending
conflict occurs during speech.

---

### `avatar.blendEmotions(emotionA, emotionB, blend, durationMs?)`

Blend between two emotions without committing to either.

```js
// 0 = pure joy, 1 = pure surprise, 0.5 = midpoint
avatar.blendEmotions('joy', 'surprise', 0.5);
avatar.blendEmotions('neutral', 'anger', 0.3, 500);
```

---

## Eye Controls

### `avatar.setGaze(x, y, options?)`

```js
avatar.setGaze(0, 0);                         // center
avatar.setGaze(-0.6, 0.3);                    // left and slightly up
avatar.setGaze(0.8, -0.4, { speedMs: 150 });  // fast dart right-down
avatar.setGaze(0, 0.2,   { smooth: false });  // instant (no interpolation)
```

- `x`: −1 (left) → +1 (right)
- `y`: −1 (down) → +1 (up)

---

### `avatar.blink(options?)`

```js
avatar.blink();                    // natural blink (~180ms)
avatar.blink({ duration: 500 });   // slow, deliberate blink
```

---

### `avatar.setBlinkConfig(config)`

```js
avatar.setBlinkConfig({
  rate:     0.3,   // blinks/sec
  variance: 0.1,   // ± randomization
  enabled:  true,  // false = manual blink only
});
```

---

## Scene Integration

```js
avatar.setPosition(0, 1.0, 0);       // world position
avatar.setRotation(0, 0.1, 0);       // Euler radians
avatar.setScale(1.2);                // uniform scale
avatar.setParticleSize(0.022);       // point size
avatar.group;                        // THREE.Group — add children, etc.
```

---

## Appearance

```js
avatar.setColors({
  skin: 0xc68642,   // hex skin tone
  lips: 0xa05535,   // hex lip color
  eyes: 0x4a3020,   // hex iris color
});
```

---

## State & Debugging

```js
const state = avatar.getState();
// Returns:
// {
//   visemeQueue:   2,           // buffered events
//   activeViseme:  'active',    // 'active' | 'rest'
//   currentShape:  [0.4, ...],  // [openY, wideX, round, jaw]
//   emotion:       'joy',
//   emotionWeight: 0.8,
//   gaze:          { x: 0.1, y: -0.05 },
//   eyeOpenness:   [0.92, 0.92],
//   blinkState:    'open',
//   particleCount: 3360,
//   qualityTier:   'medium',
// }
```

---

## Cleanup

```js
avatar.reset();    // clear queue, return to neutral (non-destructive)
avatar.dispose();  // free GPU resources, stop render loop
```

---

## Integration Checklist

1. **Include Three.js** before loading `ParticleFaceAvatar.js`
2. **Pass your existing `scene` and `camera`** — the module adds a `THREE.Group`
   to your scene with no side effects on your renderer settings
3. **Call `avatar.onVisemeEvent()`** from your audio/TTS event callback
4. **Do not call your own `renderer.render()`** inside the avatar — it uses
   `requestAnimationFrame` internally. Your render loop drives the renderer;
   the avatar drives particle CPU updates only.
5. **On resize**, call `camera.updateProjectionMatrix()` as normal — the avatar
   reads camera state automatically.
6. **Mobile**: set `quality: 'low'` or `'medium'` explicitly if you need a
   fixed budget; `'auto'` uses GPU detection heuristics.

---

## Performance Budget

| Tier | Particles | Target FPS |
|------|-----------|------------|
| high | ~4800 | 60fps desktop |
| medium | ~3360 | 60fps mid-range, 30fps mobile |
| low | ~1920 | 30fps low-end mobile |

CPU morphing runs on the main thread in `Float32Array` — no WASM, no workers.
Each frame: one typed array scan, one `BufferAttribute` upload. Total budget
under 2ms at medium quality on a 2020 mid-range device.
