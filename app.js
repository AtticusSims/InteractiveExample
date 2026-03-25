// ---------------------------------------------------------------------------
// Particle Artwork — Multi-scene interactive experience
// Scene 1: Hand gesture particles (MediaPipe Hands)
// Scene 2: Face-mapped particles  (MediaPipe Face Mesh)
// ---------------------------------------------------------------------------

const canvas  = document.getElementById('canvas');
const ctx     = canvas.getContext('2d');
const video   = document.getElementById('video');
const menu    = document.getElementById('menu');
const backBtn = document.getElementById('backBtn');
const handStatusEl  = document.getElementById('handStatus');
const audioStatusEl = document.getElementById('audioStatus');
const statusBar     = document.getElementById('status');
const handDebugPanel        = document.getElementById('handDebugPanel');
const handDebugCamera       = document.getElementById('handDebugCamera');
const debugShowCameraEl     = document.getElementById('debugShowCamera');
const debugShowLandmarksEl  = document.getElementById('debugShowLandmarks');
const debugShowConnectEl    = document.getElementById('debugShowConnections');
const debugFpsEl            = document.getElementById('debugFps');
const debugHandsCountEl     = document.getElementById('debugHandsCount');
const debugLatencyEl        = document.getElementById('debugLatency');
const debugHeartStateEl     = document.getElementById('debugHeartState');
const debugClapStateEl      = document.getElementById('debugClapState');
const debugHandAEl          = document.getElementById('debugHandA');
const debugHandBEl          = document.getElementById('debugHandB');
const debugGestureLineEl    = document.getElementById('debugGestureLine');
const debugEventsEl         = document.getElementById('debugEvents');
const faceDebugCamera       = document.getElementById('faceDebugCamera');
const faceDebugCtx          = faceDebugCamera ? faceDebugCamera.getContext('2d') : null;
const faceSimModeEl         = document.getElementById('faceSimMode');
const facePerfModeEl        = document.getElementById('facePerfMode');
const faceDebugStatsEl      = document.getElementById('faceDebugStats');
const debugShowMaskEl       = document.getElementById('debugShowMask');
const debugShowDensityEl    = document.getElementById('debugShowDensity');
const debugShowVectorsEl    = document.getElementById('debugShowVectors');
const debugShowSaturationEl = document.getElementById('debugShowSaturation');

let W, H;
let onResizeCallbacks = [];
function resize() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
  for (const cb of onResizeCallbacks) cb();
}
resize();
window.addEventListener('resize', resize);

// ---- Shared state ---------------------------------------------------------
let audioLevel = 0;
let baseHue    = 200;
let activeScene = null;   // 'hands' | 'face' | null
let animFrameId = null;
let cameraInstance = null;
let mediaStream    = null;

// ---- Sound FX context -----------------------------------------------------
let sfxCtx = null;
function initSfx() {
  if (!sfxCtx) sfxCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function playGatherSound() {
  if (!sfxCtx) return;
  const t = sfxCtx.currentTime;
  for (const [type, freq, detune] of [['sine', 320, 0], ['triangle', 325, 6]]) {
    const osc  = sfxCtx.createOscillator();
    const gain = sfxCtx.createGain();
    osc.type = type; osc.detune.value = detune;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 2.6, t + 0.35);
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.12, t + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc.connect(gain).connect(sfxCtx.destination);
    osc.start(t); osc.stop(t + 0.55);
  }
  const sparkle = sfxCtx.createOscillator();
  const sGain   = sfxCtx.createGain();
  sparkle.type = 'sine';
  sparkle.frequency.setValueAtTime(1800, t);
  sparkle.frequency.exponentialRampToValueAtTime(3200, t + 0.25);
  sGain.gain.setValueAtTime(0.001, t);
  sGain.gain.linearRampToValueAtTime(0.06, t + 0.02);
  sGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  sparkle.connect(sGain).connect(sfxCtx.destination);
  sparkle.start(t); sparkle.stop(t + 0.35);
}

function playExplosionSound() {
  if (!sfxCtx) return;
  const t   = sfxCtx.currentTime;
  const len = sfxCtx.sampleRate;
  const buf = sfxCtx.createBuffer(1, len, sfxCtx.sampleRate);
  const d   = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

  const noise = sfxCtx.createBufferSource(); noise.buffer = buf;
  const filt  = sfxCtx.createBiquadFilter(); filt.type = 'lowpass';
  filt.frequency.setValueAtTime(3000, t);
  filt.frequency.exponentialRampToValueAtTime(80, t + 0.45);
  const nGain = sfxCtx.createGain();
  nGain.gain.setValueAtTime(0.35, t);
  nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  noise.connect(filt).connect(nGain).connect(sfxCtx.destination);
  noise.start(t); noise.stop(t + 0.55);

  const bass  = sfxCtx.createOscillator(); bass.type = 'sine';
  bass.frequency.setValueAtTime(160, t);
  bass.frequency.exponentialRampToValueAtTime(28, t + 0.35);
  const bGain = sfxCtx.createGain();
  bGain.gain.setValueAtTime(0.45, t);
  bGain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
  bass.connect(bGain).connect(sfxCtx.destination);
  bass.start(t); bass.stop(t + 0.5);

  const crackle = sfxCtx.createBufferSource(); crackle.buffer = buf;
  const hpf     = sfxCtx.createBiquadFilter(); hpf.type = 'highpass'; hpf.frequency.value = 4000;
  const cGain   = sfxCtx.createGain();
  cGain.gain.setValueAtTime(0.001, t);
  cGain.gain.linearRampToValueAtTime(0.08, t + 0.05);
  cGain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
  crackle.connect(hpf).connect(cGain).connect(sfxCtx.destination);
  crackle.start(t); crackle.stop(t + 0.75);
}

// ---- Audio analysis (shared) ----------------------------------------------
function setupAudio() {
  navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
    const audioCtx  = new (window.AudioContext || window.webkitAudioContext)();
    const source    = audioCtx.createMediaStreamSource(stream);
    const analyser  = audioCtx.createAnalyser(); analyser.fftSize = 256;
    source.connect(analyser);
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    function poll() {
      analyser.getByteTimeDomainData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) { const v = (dataArray[i] - 128) / 128; sum += v * v; }
      audioLevel = Math.min(1, Math.sqrt(sum / dataArray.length) * 3);
      audioStatusEl.textContent = `Audio: ${(audioLevel * 100).toFixed(0)}%`;
      requestAnimationFrame(poll);
    }
    poll();
  }).catch(() => { audioStatusEl.textContent = 'Audio: denied'; });
}

// ===========================================================================
//  SCENE 1 — HAND GESTURES
// ===========================================================================
const HandScene = (() => {
  let handPoints    = [];
  let handSkeletons = [];
  let rawHandLandmarks = [];
  let handLabels = [];
  const particles   = [];
  const MAX_PARTICLES = 900;
  const SPAWN_RATE    = 4;
  const SPAWN_RATE_LOUD = 16;

  const PINCH_CLOSE = 0.35;
  const PINCH_OPEN  = 0.55;
  const handGesture = [
    { pinched: false, center: { x: 0, y: 0 } },
    { pinched: false, center: { x: 0, y: 0 } },
  ];

  const CLAP_CLOSE = 140;
  const CLAP_APART = 260;
  let clapState = { together: false };
  let clapDistance = null;

  const HEART_TIP_DIST   = 120;
  const HEART_THUMB_DIST = 120;
  let heartActive    = false;
  let wasHeartActive = false;
  let heartCenter    = { x: 0, y: 0 };
  let heartScale     = 1;
  let heartMetrics   = { indexDist: null, thumbDist: null, candidate: false };

  const handMetrics = [
    { norm: 1, handSize: 0, avgSpread: 0, pinched: false, label: '--', score: 0 },
    { norm: 1, handSize: 0, avgSpread: 0, pinched: false, label: '--', score: 0 },
  ];

  const debugUi = { showCamera: true, showLandmarks: true, showConnections: true };
  let debugControlsBound = false;
  let debugLatencyMs = 0;
  let lastResultTime = 0;
  let smoothedFps = 0;
  const debugEvents = [];
  const MAX_DEBUG_EVENTS = 12;
  const debugCamCtx = handDebugCamera ? handDebugCamera.getContext('2d') : null;

  const HEART_CURVE = [];
  for (let i = 0; i < 200; i++) {
    const t  = (i / 200) * Math.PI * 2;
    const rx = 16 * Math.pow(Math.sin(t), 3);
    const ry = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    HEART_CURVE.push({ x: rx / 17, y: ry / 17 });
  }

  class Particle {
    constructor(x, y) {
      this.x = x; this.y = y;
      this.vx = (Math.random() - 0.5) * 1.5;
      this.vy = (Math.random() - 0.5) * 1.5;
      this.baseRadius = Math.random() * 3 + 1.5;
      this.radius = this.baseRadius;
      this.hue  = baseHue + (Math.random() - 0.5) * 40;
      this.life = 1.0;
      this.decay = Math.random() * 0.006 + 0.003;
      this.isFlower   = false;
      this.rotation   = Math.random() * Math.PI * 2;
      this.petalCount = Math.floor(Math.random() * 3) + 5;
      this.heartTarget = null;
    }

    update() {
      this.radius = this.baseRadius * (1 + audioLevel * 4);
      this.hue += audioLevel * 2;

      if (heartActive) {
        if (!this.heartTarget) {
          const hp = HEART_CURVE[Math.floor(Math.random() * HEART_CURVE.length)];
          this.heartTarget = { x: hp.x, y: hp.y };
        }
        const tx = heartCenter.x + this.heartTarget.x * heartScale;
        const ty = heartCenter.y + this.heartTarget.y * heartScale;
        this.vx += (tx - this.x) * 0.07;
        this.vy += (ty - this.y) * 0.07;
        this.vx *= 0.80; this.vy *= 0.80;
        this.hue += (345 - (this.hue % 360)) * 0.06;
        this.life = Math.max(this.life, 0.6);
        this.x += this.vx; this.y += this.vy;
        return;
      }
      this.heartTarget = null;

      if (this.isFlower) {
        this.vy += 0.04;
        this.vx += (Math.random() - 0.5) * 0.15;
        this.vx *= 0.985; this.vy *= 0.985;
        this.rotation += 0.015;
      }

      for (const p of handPoints) {
        const dx = p.x - this.x, dy = p.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const range = 250 + (p.strength - 1) * 60;
        if (dist < range && dist > 1) {
          const force = ((range - dist) / range) * 0.6 * p.strength;
          this.vx += (dx / dist) * force;
          this.vy += (dy / dist) * force;
        }
      }

      if (!this.isFlower) { this.vx *= 0.96; this.vy *= 0.96; }
      this.x += this.vx; this.y += this.vy;
      this.life -= this.decay;
    }

    draw() {
      if (this.life <= 0) return;
      const alpha = Math.max(0, this.life);
      if (this.isFlower) { drawFlower(this.x, this.y, this.radius, this.hue, alpha, this.rotation, this.petalCount); return; }
      const inHeart   = this.heartTarget !== null;
      const sat       = inHeart ? 90 : 80;
      const lightness = inHeart ? 65 + audioLevel * 15 : 55 + audioLevel * 20;
      const glow      = inHeart ? 22 + audioLevel * 18 : 12 + audioLevel * 20;
      ctx.save();
      ctx.globalAlpha  = alpha;
      ctx.shadowBlur   = glow;
      ctx.shadowColor  = `hsl(${this.hue}, ${sat}%, ${lightness}%)`;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${this.hue}, ${sat}%, ${lightness}%)`;
      ctx.fill();
      ctx.restore();
    }

    isDead() { return this.life <= 0; }
  }

  function spawnParticles() {
    const rate = Math.floor(SPAWN_RATE + audioLevel * (SPAWN_RATE_LOUD - SPAWN_RATE));
    for (let i = 0; i < rate; i++) {
      if (particles.length >= MAX_PARTICLES) break;
      let x, y;
      if (handPoints.length > 0 && Math.random() < 0.5) {
        const hp = handPoints[Math.floor(Math.random() * handPoints.length)];
        x = hp.x + (Math.random() - 0.5) * 80;
        y = hp.y + (Math.random() - 0.5) * 80;
      } else { x = Math.random() * W; y = Math.random() * H; }
      particles.push(new Particle(x, y));
    }
  }

  function drawFlower(x, y, size, hue, alpha, rotation, petalCount) {
    const s = Math.max(size, 2), petalLen = s * 3.2, petalW = s * 1.4;
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.rotate(rotation);
    for (let i = 0; i < petalCount; i++) {
      const a = (Math.PI * 2 * i) / petalCount;
      ctx.save(); ctx.rotate(a); ctx.beginPath();
      ctx.ellipse(petalLen * 0.55, 0, petalLen, petalW, 0, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${hue + i * 12}, 72%, 64%)`; ctx.fill(); ctx.restore();
    }
    ctx.beginPath(); ctx.arc(0, 0, s * 1.3, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${hue + 45}, 85%, 78%)`; ctx.fill(); ctx.restore();
  }

  function triggerClap() {
    for (const p of particles) {
      p.isFlower = true; p.vx *= 0.25; p.vy *= 0.25; p.decay *= 0.45;
      p.hue = [0, 30, 50, 280, 320][Math.floor(Math.random() * 5)] + Math.random() * 20;
    }
  }

  function explodeParticles(cx, cy) {
    const BURST = 100;
    for (let i = 0; i < BURST; i++) {
      if (particles.length >= MAX_PARTICLES) break;
      const angle = (Math.PI * 2 * i) / BURST + (Math.random() - 0.5) * 0.4;
      const speed = 4 + Math.random() * 14;
      const p = new Particle(cx + (Math.random() - 0.5) * 10, cy + (Math.random() - 0.5) * 10);
      p.vx = Math.cos(angle) * speed; p.vy = Math.sin(angle) * speed;
      p.baseRadius = Math.random() * 5 + 2; p.radius = p.baseRadius;
      p.life = 1.4; p.decay = 0.008 + Math.random() * 0.008;
      p.hue = baseHue + Math.random() * 80;
      particles.push(p);
    }
  }

  const HAND_CONNECTIONS = [
    [0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],
    [0,9],[9,10],[10,11],[11,12],[0,13],[13,14],[14,15],[15,16],
    [0,17],[17,18],[18,19],[19,20],[5,9],[9,13],[13,17],
  ];

  function pushDebugEvent(message) {
    const stamp = new Date().toLocaleTimeString();
    debugEvents.unshift(`[${stamp}] ${message}`);
    if (debugEvents.length > MAX_DEBUG_EVENTS) debugEvents.length = MAX_DEBUG_EVENTS;
    if (debugEventsEl) debugEventsEl.textContent = debugEvents.join('\n');
  }

  function bindDebugControls() {
    if (debugControlsBound) return;
    debugControlsBound = true;
    if (debugShowCameraEl) {
      debugShowCameraEl.addEventListener('change', () => { debugUi.showCamera = debugShowCameraEl.checked; });
    }
    if (debugShowLandmarksEl) {
      debugShowLandmarksEl.addEventListener('change', () => { debugUi.showLandmarks = debugShowLandmarksEl.checked; });
    }
    if (debugShowConnectEl) {
      debugShowConnectEl.addEventListener('change', () => { debugUi.showConnections = debugShowConnectEl.checked; });
    }
  }

  function resizeDebugCamera() {
    if (!handDebugCamera) return;
    const rect = handDebugCamera.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const targetW = Math.max(1, Math.floor(rect.width * dpr));
    const targetH = Math.max(1, Math.floor(rect.height * dpr));
    if (handDebugCamera.width !== targetW || handDebugCamera.height !== targetH) {
      handDebugCamera.width = targetW;
      handDebugCamera.height = targetH;
    }
  }

  function drawDebugCameraOverlay() {
    if (!debugCamCtx || !handDebugCamera) return;
    resizeDebugCamera();
    const vw = handDebugCamera.width;
    const vh = handDebugCamera.height;

    debugCamCtx.clearRect(0, 0, vw, vh);
    debugCamCtx.fillStyle = 'rgba(4, 8, 10, 0.9)';
    debugCamCtx.fillRect(0, 0, vw, vh);

    if (debugUi.showCamera && video.readyState >= 2) {
      debugCamCtx.save();
      debugCamCtx.translate(vw, 0);
      debugCamCtx.scale(-1, 1);
      debugCamCtx.drawImage(video, 0, 0, vw, vh);
      debugCamCtx.restore();
    }

    if (!debugUi.showLandmarks || rawHandLandmarks.length === 0) return;

    for (let h = 0; h < rawHandLandmarks.length; h++) {
      const lm = rawHandLandmarks[h];
      const pinched = handGesture[h] && handGesture[h].pinched;
      const lineColor = pinched ? 'rgba(255, 215, 64, 0.95)' : 'rgba(0, 255, 180, 0.9)';
      const pointColor = pinched ? '#ffdc3c' : '#00ffb4';

      if (debugUi.showConnections) {
        debugCamCtx.save();
        debugCamCtx.lineWidth = 2;
        debugCamCtx.strokeStyle = lineColor;
        for (const [a, b] of HAND_CONNECTIONS) {
          const ax = (1 - lm[a].x) * vw, ay = lm[a].y * vh;
          const bx = (1 - lm[b].x) * vw, by = lm[b].y * vh;
          debugCamCtx.beginPath();
          debugCamCtx.moveTo(ax, ay);
          debugCamCtx.lineTo(bx, by);
          debugCamCtx.stroke();
        }
        debugCamCtx.restore();
      }

      for (let i = 0; i < lm.length; i++) {
        const x = (1 - lm[i].x) * vw, y = lm[i].y * vh;
        const isTip = [4, 8, 12, 16, 20].includes(i);
        debugCamCtx.beginPath();
        debugCamCtx.arc(x, y, isTip ? 5 : 3, 0, Math.PI * 2);
        debugCamCtx.fillStyle = isTip ? '#ff4f92' : pointColor;
        debugCamCtx.fill();
      }
    }
  }

  function updateDebugUi() {
    if (!handDebugPanel || handDebugPanel.classList.contains('hidden')) return;
    const fpsText = smoothedFps > 0 ? `${smoothedFps.toFixed(1)} FPS` : '0 FPS';
    if (debugFpsEl) debugFpsEl.textContent = fpsText;
    if (debugHandsCountEl) debugHandsCountEl.textContent = `${handSkeletons.length}`;
    if (debugLatencyEl) debugLatencyEl.textContent = Number.isFinite(debugLatencyMs) ? `${debugLatencyMs.toFixed(1)} ms` : '-- ms';
    if (debugHeartStateEl) debugHeartStateEl.textContent = heartActive ? 'true' : 'false';
    if (debugClapStateEl) debugClapStateEl.textContent = clapState.together ? 'true' : 'false';

    if (debugHandAEl) {
      const h0 = handMetrics[0];
      debugHandAEl.textContent = `H0 (${h0.label} ${(h0.score * 100).toFixed(0)}%): pinched=${h0.pinched} norm=${h0.norm.toFixed(3)} spread=${h0.avgSpread.toFixed(1)} size=${h0.handSize.toFixed(1)}`;
    }
    if (debugHandBEl) {
      const h1 = handMetrics[1];
      debugHandBEl.textContent = `H1 (${h1.label} ${(h1.score * 100).toFixed(0)}%): pinched=${h1.pinched} norm=${h1.norm.toFixed(3)} spread=${h1.avgSpread.toFixed(1)} size=${h1.handSize.toFixed(1)}`;
    }
    if (debugGestureLineEl) {
      const clapText = clapDistance == null ? '--' : clapDistance.toFixed(1);
      const heartIdx = heartMetrics.indexDist == null ? '--' : heartMetrics.indexDist.toFixed(1);
      const heartThm = heartMetrics.thumbDist == null ? '--' : heartMetrics.thumbDist.toFixed(1);
      debugGestureLineEl.textContent =
        `gestures: heartCandidate=${heartMetrics.candidate} heartActive=${heartActive} indexDist=${heartIdx} thumbDist=${heartThm} clapDist=${clapText}`;
    }
    drawDebugCameraOverlay();
  }

  function drawHandSkeletons() {
    for (let h = 0; h < handSkeletons.length; h++) {
      const lm = handSkeletons[h];
      const pinched   = handGesture[h] && handGesture[h].pinched;
      const lineColor = pinched ? 'rgba(255, 220, 60, 0.8)' : 'rgba(0, 255, 180, 0.6)';
      const jointColor = pinched ? '#ffdc3c' : '#00ffb4';
      ctx.save(); ctx.strokeStyle = lineColor; ctx.lineWidth = pinched ? 3 : 2;
      for (const [a, b] of HAND_CONNECTIONS) {
        ctx.beginPath(); ctx.moveTo(lm[a].x, lm[a].y); ctx.lineTo(lm[b].x, lm[b].y); ctx.stroke();
      }
      for (let i = 0; i < lm.length; i++) {
        const isTip = [4, 8, 12, 16, 20].includes(i);
        ctx.beginPath(); ctx.arc(lm[i].x, lm[i].y, isTip ? 6 : 3, 0, Math.PI * 2);
        ctx.fillStyle = isTip ? '#ff4488' : jointColor; ctx.fill();
      }
      ctx.restore();
    }
  }

  let handsModel = null;

  function setupTracking() {
    bindDebugControls();
    handsModel = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });
    handsModel.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.5 });

    let frameStartMs = 0;

    handsModel.onResults((results) => {
      try {
        handPoints = []; handSkeletons = [];
        rawHandLandmarks = [];
        handLabels = results.multiHandedness || [];
        const now = performance.now();
        if (lastResultTime > 0) {
          const fps = 1000 / Math.max(1, now - lastResultTime);
          smoothedFps = smoothedFps === 0 ? fps : smoothedFps * 0.85 + fps * 0.15;
        }
        lastResultTime = now;
        if (frameStartMs > 0) debugLatencyMs = now - frameStartMs;

        if (results.multiHandLandmarks) {
          const trackedHands = Math.min(results.multiHandLandmarks.length, handGesture.length);
          if (results.multiHandLandmarks.length > handGesture.length) {
            pushDebugEvent(`extra hands ignored: ${results.multiHandLandmarks.length}`);
          }
          for (let h = 0; h < trackedHands; h++) {
          const landmarks = results.multiHandLandmarks[h];
          rawHandLandmarks.push(landmarks);
          const all21 = landmarks.map((lm) => ({ x: (1 - lm.x) * W, y: lm.y * H }));
          handSkeletons.push(all21);

          const tipIdx = [4, 8, 12, 16, 20];
          const tips = tipIdx.map((i) => all21[i]);
          const cx = tips.reduce((s, p) => s + p.x, 0) / tips.length;
          const cy = tips.reduce((s, p) => s + p.y, 0) / tips.length;
          const handSize = Math.hypot(all21[0].x - all21[9].x, all21[0].y - all21[9].y);
          const avgSpread = tips.reduce((s, p) => s + Math.hypot(p.x - cx, p.y - cy), 0) / tips.length;
          const norm = handSize > 0 ? avgSpread / handSize : 1;

          const state = handGesture[h];
          const wasPinched = state.pinched;
          if (wasPinched) {
            state.pinched = norm <= PINCH_OPEN;
            if (state.pinched) {
              state.center = { x: cx, y: cy };
            } else {
              explodeParticles(state.center.x, state.center.y);
              playExplosionSound();
            }
          } else {
            state.pinched = norm < PINCH_CLOSE;
            if (state.pinched) {
              state.center = { x: cx, y: cy };
              playGatherSound();
            }
          }

          const handed = handLabels[h] || {};
          handMetrics[h] = {
            norm,
            handSize,
            avgSpread,
            pinched: state.pinched,
            label: handed.label || '--',
            score: handed.score || 0,
          };
          if (!wasPinched && state.pinched) pushDebugEvent(`pinch start hand ${h}`);
          if (wasPinched && !state.pinched) pushDebugEvent(`pinch release hand ${h}`);

          const str = state.pinched ? 3.0 : 1.0;
          for (const idx of [0, 4, 8, 12, 16, 20]) handPoints.push({ x: all21[idx].x, y: all21[idx].y, strength: str });
        }
        for (let h = trackedHands; h < handGesture.length; h++) {
          handGesture[h].pinched = false;
          handMetrics[h] = { norm: 1, handSize: 0, avgSpread: 0, pinched: false, label: '--', score: 0 };
        }

        if (trackedHands === 2) {
          const palmIdx = [0, 5, 9, 13, 17];
          const centers = handSkeletons.map((lm) => ({
            x: palmIdx.reduce((s, i) => s + lm[i].x, 0) / palmIdx.length,
            y: palmIdx.reduce((s, i) => s + lm[i].y, 0) / palmIdx.length,
          }));
          const dist = Math.hypot(centers[0].x - centers[1].x, centers[0].y - centers[1].y);
          clapDistance = dist;
          const clapCandidate = dist < CLAP_CLOSE;
          if (!clapState.together && dist < CLAP_CLOSE) {
            clapState.together = true;
            triggerClap();
            pushDebugEvent('clap trigger');
          }
          if (clapState.together && dist > CLAP_APART) clapState.together = false;
          const idx0 = handSkeletons[0][8], idx1 = handSkeletons[1][8];
          const thm0 = handSkeletons[0][4], thm1 = handSkeletons[1][4];
          const indexDist = Math.hypot(idx0.x - idx1.x, idx0.y - idx1.y);
          const thumbDist = Math.hypot(thm0.x - thm1.x, thm0.y - thm1.y);
          heartMetrics.indexDist = indexDist;
          heartMetrics.thumbDist = thumbDist;
          const indexMid = { x: (idx0.x + idx1.x) / 2, y: (idx0.y + idx1.y) / 2 };
          const thumbMid = { x: (thm0.x + thm1.x) / 2, y: (thm0.y + thm1.y) / 2 };
          const verticalGap = thumbMid.y - indexMid.y;
          const HEART_MIN_VERTICAL_GAP = 24;
          const HEART_MIN_PALM_DIST = CLAP_CLOSE + 25;
          const isHeartShape =
            indexDist < HEART_TIP_DIST &&
            thumbDist < HEART_THUMB_DIST &&
            verticalGap > HEART_MIN_VERTICAL_GAP;
          const isHeart = isHeartShape && dist > HEART_MIN_PALM_DIST && !clapCandidate;
          heartMetrics.candidate = isHeartShape;
          if (isHeart) {
            if (!wasHeartActive) playGatherSound();
            heartActive = true;
            heartCenter = { x: (indexMid.x + thumbMid.x) / 2, y: (indexMid.y + thumbMid.y) / 2 };
            heartScale = Math.hypot(indexMid.x - thumbMid.x, indexMid.y - thumbMid.y) * 0.9;
            if (!wasHeartActive) pushDebugEvent('heart gesture start');
          } else {
            heartActive = false;
          }
          if (clapCandidate && isHeartShape) {
            pushDebugEvent('heart suppressed by clap proximity');
          }
        } else {
          clapState.together = false;
          clapDistance = null;
          heartActive = false;
          heartMetrics.indexDist = null;
          heartMetrics.thumbDist = null;
          heartMetrics.candidate = false;
        }
        wasHeartActive = heartActive;

        handStatusEl.textContent = `Hand: ${results.multiHandLandmarks.length} detected`;
      } else {
        handGesture[0].pinched = false; handGesture[1].pinched = false;
        clapState.together = false; heartActive = false; wasHeartActive = false;
        clapDistance = null;
        heartMetrics.indexDist = null;
        heartMetrics.thumbDist = null;
        heartMetrics.candidate = false;
        handMetrics[0] = { norm: 1, handSize: 0, avgSpread: 0, pinched: false, label: '--', score: 0 };
        handMetrics[1] = { norm: 1, handSize: 0, avgSpread: 0, pinched: false, label: '--', score: 0 };
        handStatusEl.textContent = 'Hand: none';
      }
        updateDebugUi();
      } catch (error) {
        pushDebugEvent(`tracking error: ${error && error.message ? error.message : 'unknown'}`);
      }
    });

    cameraInstance = new Camera(video, {
      onFrame: async () => {
        if (activeScene === 'hands') {
          frameStartMs = performance.now();
          await handsModel.send({ image: video });
        }
      },
      width: 640, height: 480,
    });
    cameraInstance.start();
  }

  function animate() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.fillRect(0, 0, W, H);
    baseHue = (baseHue + 0.1) % 360;
    spawnParticles();
    for (let i = particles.length - 1; i >= 0; i--) {
      particles[i].update(); particles[i].draw();
      if (particles[i].isDead()) particles.splice(i, 1);
    }
    drawHandSkeletons();
    updateDebugUi();
    animFrameId = requestAnimationFrame(animate);
  }

  return {
    start() {
      handStatusEl.textContent = 'Hand: --';
      audioStatusEl.textContent = 'Audio: --';
      statusBar.classList.remove('hidden');
      if (handDebugPanel) handDebugPanel.classList.remove('hidden');
      smoothedFps = 0;
      lastResultTime = 0;
      debugLatencyMs = 0;
      debugEvents.length = 0;
      if (debugEventsEl) debugEventsEl.textContent = 'tracking started...';
      pushDebugEvent('hand debug enabled');
      setupTracking();
      setupAudio();
      animate();
    },
    stop() {
      particles.length = 0;
      handPoints = []; handSkeletons = [];
      rawHandLandmarks = [];
      heartActive = false; wasHeartActive = false;
      handGesture[0].pinched = false; handGesture[1].pinched = false;
      if (handDebugPanel) handDebugPanel.classList.add('hidden');
    },
  };
})();

// ===========================================================================
//  SCENE 2 — FACE GATHERED GRID
//  Multi-solver architecture:
//   - hybrid: density-aware attractors + boundary mask + deterministic transport
//   - cloth:  hybrid attractors + lightweight cloth constraints (experimental)
//   - legacy: original nearest-landmark spring behavior
// ===========================================================================
const FaceScene = (() => {
  const GRID_SPACING = 16;
  const GRID_PAD_CELLS = 16;
  const INFLUENCE = 92;
  const MASK_BLEND_DIST = 48;
  const FACE_OVAL_IDX = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
  const CELL = 30;

  let particles = [];
  let gridBuilt = false;
  let gridCols = 0;
  let gridRows = 0;
  let gridMinX = 0;
  let gridMinY = 0;

  let faceLandmarks = [];
  let faceOutline = [];
  let faceCenter = { x: 0, y: 0 };
  let faceRadius = 160;
  let faceDetected = false;
  let faceMeshModel = null;

  let hashCols = 0;
  let hashRows = 0;
  let spatialHash = [];

  let occCols = 0;
  let occRows = 0;
  let occupancyGrid = new Uint16Array(1);

  let landmarkDensity = new Float32Array(0);
  let landmarkSaturation = new Float32Array(0);
  let landmarkFeatureWeight = new Float32Array(0);
  let assignedLandmark = new Int16Array(0);
  let assignedDistance = new Float32Array(0);

  let gatherCompression = 0;
  let frameCounter = 0;

  let simMode = 'hybrid';
  let perfMode = 'auto'; // auto | quality | balanced | fast
  let updateMs = 0;
  let smoothUpdateMs = 0;
  let perfLevel = 0; // 0 = high, 1 = medium, 2 = low
  let activeAttractors = 0;

  let showWireframe = true;
  let showLandmarks = true;
  let showLabels = true;
  let showCamera = true;
  const debugOverlay = {
    showMask: true,
    showDensity: true,
    showVectors: false,
    showSaturation: true,
  };

  // ---- Mouth-open detection & rainbow puke --------------------------------
  let mouthOpen = false;
  let mouthOpenness = 0;
  let mouthCenter = { x: 0, y: 0 };
  let mouthWidth = 0;
  const rainbowParticles = [];
  const MAX_RAINBOW = 1200;
  const LIP_TOP = 13;
  const LIP_BOTTOM = 14;
  const LIP_LEFT = 78;
  const LIP_RIGHT = 308;
  const MOUTH_OPEN_THRESHOLD = 0.06;
  let rawOpenness = 0;
  const LEFT_EYE_IDX = new Set([33,7,163,144,145,153,154,155,133,173,157,158,159,160,161,246]);
  const RIGHT_EYE_IDX = new Set([362,382,381,380,374,373,390,249,263,466,388,387,386,385,384,398]);
  const MOUTH_IDX = new Set([61,146,91,181,84,17,314,405,321,375,291,409,270,269,267,0,37,39,40,185,78,308,13,14]);
  const LEFT_BROW_IDX = new Set([70,63,105,66,107,55,65,52,53,46]);
  const RIGHT_BROW_IDX = new Set([300,293,334,296,336,285,295,282,283,276]);
  const NOSE_IDX = new Set([168,6,197,195,5,4,1,19,94,2,98,327,326]);

  function featureWeightForLandmark(idx) {
    if (LEFT_EYE_IDX.has(idx) || RIGHT_EYE_IDX.has(idx)) return 1.95;
    if (MOUTH_IDX.has(idx)) return 1.9;
    if (LEFT_BROW_IDX.has(idx) || RIGHT_BROW_IDX.has(idx)) return 1.75;
    if (NOSE_IDX.has(idx)) return 1.8;
    return 1.0;
  }

  function rebuildFeatureWeights() {
    if (landmarkFeatureWeight.length !== faceLandmarks.length) {
      landmarkFeatureWeight = new Float32Array(faceLandmarks.length);
    }
    for (let i = 0; i < faceLandmarks.length; i++) {
      landmarkFeatureWeight[i] = featureWeightForLandmark(i);
    }
  }

  class GridParticle {
    constructor(homeX, homeY, row, col) {
      this.homeX = homeX;
      this.homeY = homeY;
      this.x = homeX;
      this.y = homeY;
      this.vx = 0;
      this.vy = 0;
      this.disp = 0;
      this.depth = 0;
      this.row = row;
      this.col = col;
      this.targetX = homeX;
      this.targetY = homeY;
      this.attract = 0;
      this.inside = 0;
    }
  }

  class RainbowParticle {
    constructor(x, y, hue, spread, openness) {
      this.x = x + (Math.random() - 0.5) * spread;
      this.y = y + Math.random() * 4;
      this.vx = (Math.random() - 0.5) * (2 + openness * 4);
      this.vy = 3 + Math.random() * 6 + openness * 4;
      this.hue = hue;
      this.life = 1;
      this.decay = 0.005 + Math.random() * 0.007;
      this.radius = 2 + Math.random() * 2.5;
    }

    update() {
      this.vy += 0.18;
      this.vx += (Math.random() - 0.5) * 0.5;
      this.vx *= 0.985;
      this.vy *= 0.995;
      this.x += this.vx;
      this.y += this.vy;
      this.life -= this.decay;
      this.hue = (this.hue + 1.5) % 360;
    }

    draw() {
      if (this.life <= 0) return;
      const alpha = Math.max(0, this.life);
      const glow = 8 + audioLevel * 35;
      const light = 55 + audioLevel * 25;
      const r = this.radius + audioLevel * 3;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.shadowBlur = glow;
      ctx.shadowColor = `hsl(${this.hue}, 100%, ${light}%)`;
      ctx.beginPath();
      ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${this.hue}, 100%, ${light}%)`;
      ctx.fill();
      ctx.restore();
    }

    isDead() {
      return this.life <= 0;
    }
  }

  function allocateWorkingArrays() {
    const lmCount = faceLandmarks.length || 1;
    landmarkDensity = new Float32Array(lmCount);
    landmarkSaturation = new Float32Array(lmCount);
    landmarkFeatureWeight = new Float32Array(lmCount);
    assignedLandmark = new Int16Array(particles.length);
    assignedDistance = new Float32Array(particles.length);
    for (let i = 0; i < assignedLandmark.length; i++) assignedLandmark[i] = -1;
  }

  function buildGrid() {
    particles = [];
    gridMinX = -GRID_PAD_CELLS * GRID_SPACING;
    gridMinY = -GRID_PAD_CELLS * GRID_SPACING;
    const gridMaxX = W + GRID_PAD_CELLS * GRID_SPACING;
    const gridMaxY = H + GRID_PAD_CELLS * GRID_SPACING;
    gridCols = Math.floor((gridMaxX - gridMinX) / GRID_SPACING) + 1;
    gridRows = Math.floor((gridMaxY - gridMinY) / GRID_SPACING) + 1;
    for (let r = 0; r < gridRows; r++) {
      for (let c = 0; c < gridCols; c++) {
        const x = gridMinX + c * GRID_SPACING;
        const y = gridMinY + r * GRID_SPACING;
        particles.push(new GridParticle(x, y, r, c));
      }
    }
    allocateWorkingArrays();
    gridBuilt = true;
  }

  function rebuildHash() {
    hashCols = Math.ceil(W / CELL);
    hashRows = Math.ceil(H / CELL);
    spatialHash = new Array(hashCols * hashRows);
    for (let i = 0; i < spatialHash.length; i++) spatialHash[i] = [];
    for (let i = 0; i < faceLandmarks.length; i++) {
      const lm = faceLandmarks[i];
      const col = Math.floor(lm.x / CELL);
      const row = Math.floor(lm.y / CELL);
      if (col >= 0 && col < hashCols && row >= 0 && row < hashRows) {
        spatialHash[row * hashCols + col].push(i);
      }
    }
  }

  function nearestLandmark(px, py, radiusCells = 3) {
    if (faceLandmarks.length === 0 || spatialHash.length === 0) return null;
    const col = Math.floor(px / CELL);
    const row = Math.floor(py / CELL);
    let bestDist = Infinity;
    let bestIdx = -1;
    for (let dr = -radiusCells; dr <= radiusCells; dr++) {
      for (let dc = -radiusCells; dc <= radiusCells; dc++) {
        const c = col + dc;
        const r = row + dr;
        if (c < 0 || c >= hashCols || r < 0 || r >= hashRows) continue;
        const cell = spatialHash[r * hashCols + c];
        for (let k = 0; k < cell.length; k++) {
          const lm = faceLandmarks[cell[k]];
          const dx = lm.x - px;
          const dy = lm.y - py;
          const d = dx * dx + dy * dy;
          if (d < bestDist) {
            bestDist = d;
            bestIdx = cell[k];
          }
        }
      }
    }
    return bestIdx >= 0 ? { idx: bestIdx, dist: Math.sqrt(bestDist) } : null;
  }

  function distanceToSegment(px, py, ax, ay, bx, by) {
    const vx = bx - ax;
    const vy = by - ay;
    const wx = px - ax;
    const wy = py - ay;
    const c1 = vx * wx + vy * wy;
    if (c1 <= 0) return Math.hypot(px - ax, py - ay);
    const c2 = vx * vx + vy * vy;
    if (c2 <= c1) return Math.hypot(px - bx, py - by);
    const t = c1 / c2;
    const qx = ax + t * vx;
    const qy = ay + t * vy;
    return Math.hypot(px - qx, py - qy);
  }

  function pointInPolygon(px, py, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x;
      const yi = polygon[i].y;
      const xj = polygon[j].x;
      const yj = polygon[j].y;
      const intersects = ((yi > py) !== (yj > py)) && (px < ((xj - xi) * (py - yi)) / ((yj - yi) || 1e-5) + xi);
      if (intersects) inside = !inside;
    }
    return inside;
  }

  function signedDistanceToFace(x, y) {
    if (faceOutline.length < 3) return -999;
    const inside = pointInPolygon(x, y, faceOutline);
    let minDist = Infinity;
    for (let i = 0; i < faceOutline.length; i++) {
      const a = faceOutline[i];
      const b = faceOutline[(i + 1) % faceOutline.length];
      const d = distanceToSegment(x, y, a.x, a.y, b.x, b.y);
      if (d < minDist) minDist = d;
    }
    return inside ? minDist : -minDist;
  }

  function mapContractedHome(homeX, homeY) {
    const dx = homeX - faceCenter.x;
    const dy = homeY - faceCenter.y;
    const dist = Math.hypot(dx, dy);
    const radius = Math.max(120, faceRadius * 2);
    const falloff = Math.exp(-dist / radius);
    const contract = gatherCompression * falloff;
    return {
      x: faceCenter.x + dx * (1 - contract),
      y: faceCenter.y + dy * (1 - contract),
      contract,
    };
  }

  function isNearFaceRegion(x, y, margin) {
    if (!faceDetected || faceLandmarks.length === 0) return false;
    const dx = Math.abs(x - faceCenter.x);
    const dy = Math.abs(y - faceCenter.y);
    const r = faceRadius + margin;
    return dx <= r && dy <= r;
  }

  function rebuildDensity() {
    if (faceLandmarks.length === 0) return;
    if (landmarkDensity.length !== faceLandmarks.length) allocateWorkingArrays();
    for (let i = 0; i < faceLandmarks.length; i++) {
      const lm = faceLandmarks[i];
      const col = Math.floor(lm.x / CELL);
      const row = Math.floor(lm.y / CELL);
      let acc = 0;
      let count = 0;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const c = col + dc;
          const r = row + dr;
          if (c < 0 || c >= hashCols || r < 0 || r >= hashRows) continue;
          const cell = spatialHash[r * hashCols + c];
          for (let k = 0; k < cell.length; k++) {
            const idx = cell[k];
            if (idx === i) continue;
            const o = faceLandmarks[idx];
            const d = Math.hypot(o.x - lm.x, o.y - lm.y);
            if (d < 90) {
              acc += 1 - d / 90;
              count++;
            }
          }
        }
      }
      const density = 0.75 + Math.min(1.5, count > 0 ? acc / Math.max(1, count * 0.35) : 0);
      const featureBoost = landmarkFeatureWeight[i] || 1;
      landmarkDensity[i] = density * featureBoost;
    }
  }

  function rebuildLandmarkSaturation() {
    if (faceLandmarks.length === 0) return;
    if (landmarkSaturation.length !== faceLandmarks.length) allocateWorkingArrays();
    landmarkSaturation.fill(0);
    const counts = new Uint16Array(faceLandmarks.length);
    activeAttractors = 0;

    const cullMargin = INFLUENCE * 2.2;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const mapped = mapContractedHome(p.homeX, p.homeY);
      const hit = nearestLandmark(mapped.x, mapped.y, 2);
      assignedLandmark[i] = -1;
      assignedDistance[i] = 0;
      if (!isNearFaceRegion(mapped.x, mapped.y, cullMargin)) continue;
      if (!hit || hit.dist > INFLUENCE) continue;
      assignedLandmark[i] = hit.idx;
      assignedDistance[i] = hit.dist;
      counts[hit.idx]++;
    }

    for (let i = 0; i < counts.length; i++) {
      const cap = (6 + landmarkDensity[i] * 5.5) * (landmarkFeatureWeight[i] || 1);
      const sat = Math.max(0, 1 - counts[i] / cap);
      landmarkSaturation[i] = sat;
      if (sat > 0.2) activeAttractors++;
    }
  }

  function rebuildOccupancy() {
    const occCell = GRID_SPACING * 1.8;
    occCols = Math.max(1, Math.ceil(W / occCell));
    occRows = Math.max(1, Math.ceil(H / occCell));
    const required = occCols * occRows;
    if (occupancyGrid.length !== required) occupancyGrid = new Uint16Array(required);
    occupancyGrid.fill(0);
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (p.x < 0 || p.x > W || p.y < 0 || p.y > H) continue;
      const col = Math.max(0, Math.min(occCols - 1, Math.floor((p.x / W) * occCols)));
      const row = Math.max(0, Math.min(occRows - 1, Math.floor((p.y / H) * occRows)));
      occupancyGrid[row * occCols + col]++;
    }
  }

  function occupancyPressureAt(x, y) {
    if (occCols === 0 || occRows === 0) return 0;
    const col = Math.max(0, Math.min(occCols - 1, Math.floor((x / W) * occCols)));
    const row = Math.max(0, Math.min(occRows - 1, Math.floor((y / H) * occRows)));
    const val = occupancyGrid[row * occCols + col];
    return Math.max(0, (val - 7) / 10);
  }

  function updateFaceGeometry() {
    if (faceLandmarks.length === 0) {
      faceOutline = [];
      return;
    }
    faceOutline = FACE_OVAL_IDX.filter((idx) => idx < faceLandmarks.length).map((idx) => faceLandmarks[idx]);
    const center = faceOutline.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    faceCenter = { x: center.x / Math.max(1, faceOutline.length), y: center.y / Math.max(1, faceOutline.length) };
    let r = 0;
    for (const p of faceOutline) r = Math.max(r, Math.hypot(p.x - faceCenter.x, p.y - faceCenter.y));
    faceRadius = Math.max(80, r);
  }

  function detectMouth() {
    if (faceLandmarks.length < 400) { mouthOpen = false; return; }
    const top = faceLandmarks[LIP_TOP];
    const bot = faceLandmarks[LIP_BOTTOM];
    const left = faceLandmarks[LIP_LEFT];
    const right = faceLandmarks[LIP_RIGHT];
    const lipGap = Math.abs(bot.y - top.y);
    const faceH = Math.abs(faceLandmarks[10].y - faceLandmarks[152].y) || 1;
    rawOpenness = lipGap / faceH;
    mouthOpen = rawOpenness > MOUTH_OPEN_THRESHOLD;
    const target = mouthOpen ? Math.min(1, (rawOpenness - MOUTH_OPEN_THRESHOLD) * 4) : 0;
    mouthOpenness += (target - mouthOpenness) * 0.3;
    mouthCenter = { x: (left.x + right.x) / 2, y: (top.y + bot.y) / 2 };
    mouthWidth = Math.abs(right.x - left.x);
  }

  function setupFaceTracking() {
    faceMeshModel = new FaceMesh({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
    });
    faceMeshModel.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    faceMeshModel.onResults((results) => {
      if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const raw = results.multiFaceLandmarks[0];
        let zMin = Infinity;
        let zMax = -Infinity;
        for (let i = 0; i < raw.length; i++) {
          if (raw[i].z < zMin) zMin = raw[i].z;
          if (raw[i].z > zMax) zMax = raw[i].z;
        }
        const zRange = zMax - zMin || 1;
        faceLandmarks = raw.map((lm) => ({
          x: (1 - lm.x) * W,
          y: lm.y * H,
          z: lm.z,
          nz: 1 - (lm.z - zMin) / zRange,
        }));
        faceDetected = true;
        rebuildHash();
        rebuildFeatureWeights();
        updateFaceGeometry();
        detectMouth();
        handStatusEl.textContent = `Face: detected | Mouth: ${(rawOpenness * 100).toFixed(0)}%${mouthOpen ? ' OPEN' : ''}`;
      } else {
        faceLandmarks = [];
        faceDetected = false;
        faceOutline = [];
        mouthOpen = false;
        mouthOpenness *= 0.85;
        handStatusEl.textContent = 'Face: none';
      }
    });

    cameraInstance = new Camera(video, {
      onFrame: async () => { if (activeScene === 'face') await faceMeshModel.send({ image: video }); },
      width: 640, height: 480,
    });
    cameraInstance.start();
  }

  function resetParticles() {
    gatherCompression = 0;
    for (const p of particles) {
      p.x = p.homeX;
      p.y = p.homeY;
      p.vx = 0;
      p.vy = 0;
      p.disp = 0;
      p.depth = 0;
      p.attract = 0;
      p.inside = 0;
      p.targetX = p.homeX;
      p.targetY = p.homeY;
    }
  }

  function spawnRainbow() {
    if (mouthOpenness < 0.02) return;
    const count = Math.floor(4 + mouthOpenness * 18 + audioLevel * 14);
    for (let i = 0; i < count; i++) {
      if (rainbowParticles.length >= MAX_RAINBOW) break;
      const hue = (i / count) * 360 + Math.random() * 40;
      rainbowParticles.push(new RainbowParticle(mouthCenter.x, mouthCenter.y, hue, mouthWidth * 0.7, mouthOpenness));
    }
  }

  function updateAndDrawRainbow() {
    for (let i = rainbowParticles.length - 1; i >= 0; i--) {
      rainbowParticles[i].update();
      rainbowParticles[i].draw();
      if (rainbowParticles[i].isDead()) rainbowParticles.splice(i, 1);
    }
  }

  function updateLegacy() {
    const hasFace = faceDetected && faceLandmarks.length > 0;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const mapped = mapContractedHome(p.homeX, p.homeY);
      let targetX = mapped.x;
      let targetY = mapped.y;
      let targetDisp = 0;
      let targetDepth = 0;
      if (hasFace) {
        const hit = nearestLandmark(mapped.x, mapped.y, 3);
        if (hit && hit.dist < INFLUENCE) {
          const lm = faceLandmarks[hit.idx];
          const t = 1 - hit.dist / INFLUENCE;
          const pullStrength = t * t * 0.65;
          targetX = mapped.x + (lm.x - mapped.x) * pullStrength;
          targetY = mapped.y + (lm.y - mapped.y) * pullStrength;
          targetDisp = pullStrength;
          targetDepth = lm.nz;
        }
      }
      p.vx += (targetX - p.x) * 0.11;
      p.vy += (targetY - p.y) * 0.11;
      if (p.disp > 0.1 && audioLevel > 0.1) {
        p.vx += (Math.random() - 0.5) * audioLevel * 1.8 * p.disp;
        p.vy += (Math.random() - 0.5) * audioLevel * 1.8 * p.disp;
      }
      p.vx *= 0.73;
      p.vy *= 0.73;
      p.x += p.vx;
      p.y += p.vy;
      p.disp += (targetDisp - p.disp) * 0.2;
      p.depth += (targetDepth - p.depth) * 0.2;
      p.targetX = targetX;
      p.targetY = targetY;
    }
  }

  function computeHybridTargets() {
    const hasFace = faceDetected && faceLandmarks.length > 0;
    if (!hasFace) {
      gatherCompression += (0 - gatherCompression) * 0.06;
      for (const p of particles) {
        const mapped = mapContractedHome(p.homeX, p.homeY);
        p.targetX = mapped.x;
        p.targetY = mapped.y;
        p.attract = 0;
        p.inside = 0;
      }
      return;
    }

    if ((frameCounter & 1) === 0 || activeAttractors === 0) rebuildLandmarkSaturation();
    const targetCompression = Math.min(0.42, 0.1 + (activeAttractors / Math.max(1, faceLandmarks.length)) * 1.15 + mouthOpenness * 0.1);
    gatherCompression += (targetCompression - gatherCompression) * 0.08;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const mapped = mapContractedHome(p.homeX, p.homeY);
      if (!isNearFaceRegion(mapped.x, mapped.y, INFLUENCE + MASK_BLEND_DIST * 1.8)) {
        p.targetX = mapped.x;
        p.targetY = mapped.y;
        p.attract = 0;
        p.inside = 0;
        continue;
      }
      const signedDist = signedDistanceToFace(mapped.x, mapped.y);
      const insideBlend = Math.max(0, Math.min(1, (signedDist + MASK_BLEND_DIST) / (MASK_BLEND_DIST * 2)));
      let targetX = mapped.x;
      let targetY = mapped.y;
      let attract = 0;
      let depth = 0;

      const hitIdx = assignedLandmark[i];
      const hitDist = assignedDistance[i];
      if (hitIdx >= 0 && hitDist < INFLUENCE && hitIdx < faceLandmarks.length) {
        const lm = faceLandmarks[hitIdx];
        const t = 1 - hitDist / INFLUENCE;
        const density = landmarkDensity[hitIdx] || 1;
        const sat = landmarkSaturation[hitIdx] || 0;
        const featureWeight = landmarkFeatureWeight[hitIdx] || 1;
        attract = Math.max(0, t * t * density * sat * featureWeight * insideBlend);
        targetX = mapped.x + (lm.x - mapped.x) * Math.min(0.985, attract * 0.98);
        targetY = mapped.y + (lm.y - mapped.y) * Math.min(0.985, attract * 0.98);
        depth = lm.nz;
      }
      p.targetX = targetX;
      p.targetY = targetY;
      p.attract = attract;
      p.inside = insideBlend;
      p.depth += (depth - p.depth) * 0.2;
    }
  }

  function integrateHybrid(strength = 1) {
    if ((frameCounter & 1) === 0) rebuildOccupancy();
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const pressure = occupancyPressureAt(p.x, p.y);
      const outSpring = (1 - p.inside) * 0.16 + 0.035;
      const inSpring = p.inside * 0.13;
      const k = (outSpring + inSpring) * strength;
      p.vx += (p.targetX - p.x) * k;
      p.vy += (p.targetY - p.y) * k;

      if (pressure > 0) {
        // lightweight repulsion in compressed regions
        p.vx += ((p.x - faceCenter.x) / Math.max(20, faceRadius * 1.8)) * pressure * 0.42;
        p.vy += ((p.y - faceCenter.y) / Math.max(20, faceRadius * 1.8)) * pressure * 0.42;
      }
      if (p.disp > 0.1 && audioLevel > 0.1) {
        p.vx += (Math.random() - 0.5) * audioLevel * p.disp * 1.5;
        p.vy += (Math.random() - 0.5) * audioLevel * p.disp * 1.5;
      }
      const damping = 0.82 - p.inside * 0.09;
      p.vx *= damping;
      p.vy *= damping;
      p.x += p.vx;
      p.y += p.vy;
      const dispTarget = Math.min(1, Math.hypot(p.targetX - p.homeX, p.targetY - p.homeY) / (GRID_SPACING * 5.2));
      p.disp += (dispTarget - p.disp) * 0.22;
    }
  }

  function applyClothConstraints(iterations, stiffness) {
    const rest = GRID_SPACING;
    for (let iter = 0; iter < iterations; iter++) {
      for (let r = 0; r < gridRows; r++) {
        for (let c = 0; c < gridCols; c++) {
          const idx = r * gridCols + c;
          const p = particles[idx];
          if (c + 1 < gridCols) {
            const q = particles[idx + 1];
            const dx = q.x - p.x;
            const dy = q.y - p.y;
            const d = Math.hypot(dx, dy) || 1e-5;
            const diff = (d - rest) / d;
            const corr = diff * 0.5 * stiffness;
            p.x += dx * corr;
            p.y += dy * corr;
            q.x -= dx * corr;
            q.y -= dy * corr;
          }
          if (r + 1 < gridRows) {
            const q = particles[idx + gridCols];
            const dx = q.x - p.x;
            const dy = q.y - p.y;
            const d = Math.hypot(dx, dy) || 1e-5;
            const diff = (d - rest) / d;
            const corr = diff * 0.5 * stiffness;
            p.x += dx * corr;
            p.y += dy * corr;
            q.x -= dx * corr;
            q.y -= dy * corr;
          }
        }
      }
    }
  }

  function updateHybrid() {
    computeHybridTargets();
    integrateHybrid(1);
  }

  function updateCloth() {
    computeHybridTargets();
    integrateHybrid(0.8);
    applyClothConstraints(perfLevel > 0 ? 1 : 2, 0.42);
    // Post-constraint soft return to target to keep facial anchoring.
    for (const p of particles) {
      p.x += (p.targetX - p.x) * 0.09;
      p.y += (p.targetY - p.y) * 0.09;
    }
  }

  const solvers = {
    hybrid: { update: updateHybrid, reset: resetParticles },
    cloth: { update: updateCloth, reset: resetParticles },
    legacy: { update: updateLegacy, reset: resetParticles },
  };

  function updateParticles() {
    frameCounter++;
    const densityInterval = perfLevel === 2 ? 8 : perfLevel === 1 ? 6 : 4;
    if (frameCounter % densityInterval === 0 && faceDetected && faceLandmarks.length > 0) rebuildDensity();
    const solver = solvers[simMode] || solvers.hybrid;
    solver.update();
  }

  function drawParticles() {
    ctx.fillStyle = `hsla(${baseHue}, 38%, 44%, 0.32)`;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (p.x < -20 || p.x > W + 20 || p.y < -20 || p.y > H + 20) continue;
      if (p.disp > 0.04 && p.inside > 0.35) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    const drawStride = perfLevel === 2 ? 2 : 1;
    for (let i = 0; i < particles.length; i += drawStride) {
      const p = particles[i];
      if (p.x < -20 || p.x > W + 20 || p.y < -20 || p.y > H + 20) continue;
      const d = p.disp;
      if (d <= 0.05) continue;
      const dep = p.depth;
      const r = 0.95 + d * (0.9 + dep * 1.55) + audioLevel * d * 1.05;
      const bloomScale = perfLevel === 2 ? 0.55 : perfLevel === 1 ? 0.75 : 1;
      const bloom = d * (14 + dep * 34 + audioLevel * 15) * bloomScale;
      const hue = (baseHue + dep * 50) % 360;
      const sat = 74 - dep * 22;
      const lightness = 33 + d * 40 + dep * 28;
      const alpha = 0.45 + d * 0.65;
      ctx.shadowBlur = bloom;
      ctx.shadowColor = `hsla(${hue}, ${sat + 10}%, ${Math.min(90, lightness + 15)}%, ${Math.min(1, d * 1.2)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${hue}, ${sat}%, ${lightness}%, ${alpha})`;
      ctx.fill();
    }
    ctx.restore();

    // Extra bloom pass to recover the original displacement punch.
    if (perfLevel < 2) {
      ctx.save();
      const bloomStride = perfLevel === 1 ? 2 : 1;
      for (let i = 0; i < particles.length; i += bloomStride) {
        const p = particles[i];
        if (p.x < -20 || p.x > W + 20 || p.y < -20 || p.y > H + 20) continue;
        const d = p.disp;
        if (d <= 0.12) continue;
        const dep = p.depth;
        const hue = (baseHue + dep * 50) % 360;
        ctx.shadowBlur = (22 + d * 34 + dep * 18 + audioLevel * 16) * (perfLevel === 1 ? 0.75 : 1);
        ctx.shadowColor = `hsla(${hue}, 90%, 72%, ${Math.min(1, d * 0.9)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 0.8 + d * 0.55, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${hue}, 88%, 66%, ${0.25 + d * 0.35})`;
        ctx.fill();
      }
      ctx.restore();
    }
  }

  const DEBUG_CONNECTIONS = [
    [10,338],[338,297],[297,332],[332,284],[284,251],[251,389],[389,356],[356,454],
    [454,323],[323,361],[361,288],[288,397],[397,365],[365,379],[379,378],[378,400],
    [400,377],[377,152],[152,148],[148,176],[176,149],[149,150],[150,136],[136,172],
    [172,58],[58,132],[132,93],[93,234],[234,127],[127,162],[162,21],[21,54],
    [54,103],[103,67],[67,109],[109,10],
    [33,7],[7,163],[163,144],[144,145],[145,153],[153,154],[154,155],[155,133],
    [133,173],[173,157],[157,158],[158,159],[159,160],[160,161],[161,246],[246,33],
    [362,382],[382,381],[381,380],[380,374],[374,373],[373,390],[390,249],[249,263],
    [263,466],[466,388],[388,387],[387,386],[386,385],[385,384],[384,398],[398,362],
    [61,146],[146,91],[91,181],[181,84],[84,17],[17,314],[314,405],[405,321],
    [321,375],[375,291],[291,409],[409,270],[270,269],[269,267],[267,0],[0,37],
    [37,39],[39,40],[40,185],[185,61],
    [70,63],[63,105],[105,66],[66,107],[107,55],[55,65],[65,52],[52,53],[53,46],
    [300,293],[293,334],[334,296],[296,336],[336,285],[285,295],[295,282],[282,283],[283,276],
    [168,6],[6,197],[197,195],[195,5],[5,4],[4,1],[1,19],[19,94],[94,2],
  ];

  function resizeFaceDebugCamera() {
    if (!faceDebugCamera) return;
    const rect = faceDebugCamera.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const targetW = Math.max(1, Math.floor(rect.width * dpr));
    const targetH = Math.max(1, Math.floor(rect.height * dpr));
    if (faceDebugCamera.width !== targetW || faceDebugCamera.height !== targetH) {
      faceDebugCamera.width = targetW;
      faceDebugCamera.height = targetH;
    }
  }

  function drawDensityOverlay(vw, vh, sx, sy) {
    if (!debugOverlay.showDensity || faceLandmarks.length === 0 || landmarkDensity.length !== faceLandmarks.length) return;
    for (let i = 0; i < faceLandmarks.length; i++) {
      const lm = faceLandmarks[i];
      const den = Math.max(0, landmarkDensity[i] - 0.7);
      const radius = 2 + den * 5;
      const alpha = Math.min(0.55, den * 0.22);
      faceDebugCtx.beginPath();
      faceDebugCtx.arc(lm.x * sx, lm.y * sy, radius, 0, Math.PI * 2);
      faceDebugCtx.fillStyle = `rgba(0, 200, 255, ${alpha})`;
      faceDebugCtx.fill();
    }
  }

  function drawSaturationOverlay(sx, sy) {
    if (!debugOverlay.showSaturation || faceLandmarks.length === 0 || landmarkSaturation.length !== faceLandmarks.length) return;
    for (let i = 0; i < faceLandmarks.length; i++) {
      const lm = faceLandmarks[i];
      const sat = landmarkSaturation[i];
      const r = 1.6 + (1 - sat) * 3;
      faceDebugCtx.beginPath();
      faceDebugCtx.arc(lm.x * sx, lm.y * sy, r, 0, Math.PI * 2);
      faceDebugCtx.fillStyle = sat > 0.3 ? 'rgba(255,255,255,0.65)' : 'rgba(255,64,64,0.8)';
      faceDebugCtx.fill();
    }
  }

  function drawVectorOverlay(sx, sy) {
    if (!debugOverlay.showVectors) return;
    faceDebugCtx.save();
    faceDebugCtx.strokeStyle = 'rgba(255, 170, 70, 0.75)';
    faceDebugCtx.lineWidth = 1;
    for (let i = 0; i < particles.length; i += 180) {
      const p = particles[i];
      if (p.attract <= 0.02) continue;
      const x = p.x * sx;
      const y = p.y * sy;
      const tx = p.targetX * sx;
      const ty = p.targetY * sy;
      faceDebugCtx.beginPath();
      faceDebugCtx.moveTo(x, y);
      faceDebugCtx.lineTo(tx, ty);
      faceDebugCtx.stroke();
    }
    faceDebugCtx.restore();
  }

  function drawMaskOverlay(sx, sy) {
    if (!debugOverlay.showMask || faceOutline.length < 3) return;
    faceDebugCtx.save();
    faceDebugCtx.strokeStyle = 'rgba(120, 255, 180, 0.8)';
    faceDebugCtx.lineWidth = 1.6;
    faceDebugCtx.beginPath();
    faceDebugCtx.moveTo(faceOutline[0].x * sx, faceOutline[0].y * sy);
    for (let i = 1; i < faceOutline.length; i++) {
      faceDebugCtx.lineTo(faceOutline[i].x * sx, faceOutline[i].y * sy);
    }
    faceDebugCtx.closePath();
    faceDebugCtx.stroke();
    faceDebugCtx.restore();
  }

  function updateFaceDebugStats() {
    if (!faceDebugStatsEl) return;
    const particleCount = particles.length;
    const compressionText = gatherCompression.toFixed(3);
    const activeText = `${activeAttractors}/${faceLandmarks.length || 0}`;
    faceDebugStatsEl.textContent =
      `mode=${simMode} | perf=${perfMode}/${perfLevel} | update=${updateMs.toFixed(2)} ms | compression=${compressionText}\n` +
      `particles=${particleCount} | attractors=${activeText} | face=${faceDetected ? 'yes' : 'no'}`;
  }

  function drawDebugFacePanel() {
    if (!faceDebugCtx || !faceDebugCamera) return;
    resizeFaceDebugCamera();
    const vw = faceDebugCamera.width;
    const vh = faceDebugCamera.height;
    const sx = vw / Math.max(1, W);
    const sy = vh / Math.max(1, H);

    faceDebugCtx.clearRect(0, 0, vw, vh);
    faceDebugCtx.fillStyle = 'rgba(4, 8, 10, 0.92)';
    faceDebugCtx.fillRect(0, 0, vw, vh);

    if (showCamera && video.readyState >= 2) {
      faceDebugCtx.save();
      faceDebugCtx.translate(vw, 0);
      faceDebugCtx.scale(-1, 1);
      faceDebugCtx.drawImage(video, 0, 0, vw, vh);
      faceDebugCtx.restore();
    }

    if (showWireframe && faceLandmarks.length > 0) {
      faceDebugCtx.save();
      faceDebugCtx.strokeStyle = `hsla(${baseHue}, 50%, 45%, 0.55)`;
      faceDebugCtx.lineWidth = 1.2;
      for (const [a, b] of DEBUG_CONNECTIONS) {
        if (a >= faceLandmarks.length || b >= faceLandmarks.length) continue;
        const la = faceLandmarks[a];
        const lb = faceLandmarks[b];
        faceDebugCtx.beginPath();
        faceDebugCtx.moveTo(la.x * sx, la.y * sy);
        faceDebugCtx.lineTo(lb.x * sx, lb.y * sy);
        faceDebugCtx.stroke();
      }
      faceDebugCtx.restore();
    }

    if (showLandmarks && faceLandmarks.length > 0) {
      faceDebugCtx.save();
      for (let i = 0; i < faceLandmarks.length; i++) {
        const lm = faceLandmarks[i];
        const dep = lm.nz;
        const r = 1.2 + dep * 1.5 + audioLevel * 0.9;
        faceDebugCtx.beginPath();
        faceDebugCtx.arc(lm.x * sx, lm.y * sy, r, 0, Math.PI * 2);
        faceDebugCtx.fillStyle = `hsla(${(baseHue + dep * 50) % 360}, 70%, ${48 + dep * 24}%, 0.85)`;
        faceDebugCtx.fill();
      }
      faceDebugCtx.restore();
    }

    drawDensityOverlay(vw, vh, sx, sy);
    drawSaturationOverlay(sx, sy);
    drawMaskOverlay(sx, sy);
    drawVectorOverlay(sx, sy);

    if (showLabels) {
      faceDebugCtx.save();
      faceDebugCtx.font = '10px monospace';
      faceDebugCtx.fillStyle = 'rgba(255, 255, 120, 0.82)';
      faceDebugCtx.textAlign = 'center';
      if (faceLandmarks.length > 0) {
        const labelMap = { 1: 'nose', 33: 'L-eye', 263: 'R-eye', 61: 'L-lip', 291: 'R-lip', 10: 'forehead', 152: 'chin' };
        for (const [idx, label] of Object.entries(labelMap)) {
          const i = parseInt(idx, 10);
          if (i >= faceLandmarks.length) continue;
          const lm = faceLandmarks[i];
          faceDebugCtx.fillText(label, lm.x * sx, lm.y * sy - 8);
        }
      } else {
        faceDebugCtx.fillText('No face detected', vw * 0.5, vh * 0.5);
      }
      faceDebugCtx.restore();
    }
    updateFaceDebugStats();
  }

  function animate() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(0, 0, W, H);
    baseHue = (baseHue + 0.08) % 360;

    const t0 = performance.now();
    updateParticles();
    updateMs = performance.now() - t0;
    smoothUpdateMs = smoothUpdateMs === 0 ? updateMs : smoothUpdateMs * 0.85 + updateMs * 0.15;
    if (perfMode === 'quality') perfLevel = 0;
    else if (perfMode === 'balanced') perfLevel = 1;
    else if (perfMode === 'fast') perfLevel = 2;
    else perfLevel = smoothUpdateMs > 18 ? 2 : smoothUpdateMs > 12 ? 1 : 0;
    drawParticles();
    spawnRainbow();
    updateAndDrawRainbow();
    drawDebugFacePanel();

    animFrameId = requestAnimationFrame(animate);
  }

  function resetSimulation() {
    const solver = solvers[simMode] || solvers.hybrid;
    solver.reset();
    rainbowParticles.length = 0;
    updateFaceDebugStats();
  }

  return {
    start() {
      handStatusEl.textContent = 'Face: --';
      audioStatusEl.textContent = 'Audio: --';
      statusBar.classList.remove('hidden');
      if (!gridBuilt) buildGrid();
      resetSimulation();
      setupFaceTracking();
      setupAudio();
      animate();
    },
    stop() {
      faceLandmarks = [];
      faceDetected = false;
      faceOutline = [];
      mouthOpen = false;
      mouthOpenness = 0;
      rainbowParticles.length = 0;
      if (faceDebugCtx && faceDebugCamera) faceDebugCtx.clearRect(0, 0, faceDebugCamera.width, faceDebugCamera.height);
    },
    rebuild() {
      gridBuilt = false;
    },
    toggleLayer(layer) {
      if (layer === 'wireframe') showWireframe = !showWireframe;
      if (layer === 'landmarks') showLandmarks = !showLandmarks;
      if (layer === 'labels') showLabels = !showLabels;
      if (layer === 'camera') showCamera = !showCamera;
    },
    setMode(mode) {
      if (!solvers[mode]) return;
      simMode = mode;
      resetSimulation();
    },
    setPerfMode(mode) {
      if (!['auto', 'quality', 'balanced', 'fast'].includes(mode)) return;
      perfMode = mode;
      if (perfMode === 'quality') perfLevel = 0;
      else if (perfMode === 'balanced') perfLevel = 1;
      else if (perfMode === 'fast') perfLevel = 2;
      updateFaceDebugStats();
    },
    setOverlayFlags(flags) {
      debugOverlay.showMask = !!flags.showMask;
      debugOverlay.showDensity = !!flags.showDensity;
      debugOverlay.showVectors = !!flags.showVectors;
      debugOverlay.showSaturation = !!flags.showSaturation;
    },
    reset() {
      resetSimulation();
    },
  };
})();

onResizeCallbacks.push(() => FaceScene.rebuild());

// ===========================================================================
//  NAVIGATION
// ===========================================================================

function stopCurrentScene() {
  if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
  if (cameraInstance) {
    try { cameraInstance.stop(); } catch (_) {}
    cameraInstance = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
  if (activeScene === 'hands') HandScene.stop();
  if (activeScene === 'face')  FaceScene.stop();
  activeScene = null;
}

const debugPanel = document.getElementById('debugPanel');
const debugPanelSwitch = document.getElementById('debugPanelSwitch');
const debugPanelEnabledEl = document.getElementById('debugPanelEnabled');
let debugPanelEnabled = true;

function attachStatusBarToPanel(panelEl) {
  if (!statusBar || !panelEl) return;
  if (statusBar.parentElement !== panelEl) panelEl.appendChild(statusBar);
}

function syncFaceDebugPanelVisibility() {
  if (!debugPanel) return;
  const shouldShow = activeScene === 'face' && debugPanelEnabled;
  debugPanel.classList.toggle('hidden', !shouldShow);
}

function showMenu() {
  stopCurrentScene();
  ctx.clearRect(0, 0, W, H);
  menu.classList.remove('hidden');
  backBtn.classList.add('hidden');
  statusBar.classList.add('hidden');
  if (debugPanel) debugPanel.classList.add('hidden');
  if (debugPanelSwitch) debugPanelSwitch.classList.add('hidden');
  if (handDebugPanel) handDebugPanel.classList.add('hidden');
}

function startScene(sceneName) {
  initSfx();
  menu.classList.add('hidden');
  backBtn.classList.remove('hidden');
  activeScene = sceneName;
  if (sceneName === 'face') {
    if (debugPanelSwitch) debugPanelSwitch.classList.remove('hidden');
    if (debugPanelEnabledEl) debugPanelEnabledEl.checked = debugPanelEnabled;
    if (debugPanel) attachStatusBarToPanel(debugPanel);
    syncFaceDebugPanelVisibility();
    if (faceSimModeEl) FaceScene.setMode(faceSimModeEl.value);
    if (facePerfModeEl) FaceScene.setPerfMode(facePerfModeEl.value);
    syncFaceOverlayFlags();
    if (handDebugPanel) handDebugPanel.classList.add('hidden');
    FaceScene.start();
  } else {
    if (debugPanel) debugPanel.classList.add('hidden');
    if (debugPanelSwitch) debugPanelSwitch.classList.add('hidden');
    if (sceneName === 'hands') {
      if (handDebugPanel) attachStatusBarToPanel(handDebugPanel);
      HandScene.start();
    }
  }
}

// Scene card click handlers
document.querySelectorAll('.scene-card').forEach((card) => {
  card.addEventListener('click', () => {
    const scene = card.dataset.scene;
    if (scene) startScene(scene);
  });
});

// Debug toggle click handlers
document.querySelectorAll('.debug-toggle').forEach((btn) => {
  btn.addEventListener('click', () => {
    const layer = btn.dataset.layer;
    FaceScene.toggleLayer(layer);
    btn.classList.toggle('active');
  });
});

if (faceSimModeEl) {
  faceSimModeEl.addEventListener('change', () => {
    FaceScene.setMode(faceSimModeEl.value);
  });
}

if (facePerfModeEl) {
  facePerfModeEl.addEventListener('change', () => {
    FaceScene.setPerfMode(facePerfModeEl.value);
  });
}

function syncFaceOverlayFlags() {
  FaceScene.setOverlayFlags({
    showMask: debugShowMaskEl ? debugShowMaskEl.checked : true,
    showDensity: debugShowDensityEl ? debugShowDensityEl.checked : true,
    showVectors: debugShowVectorsEl ? debugShowVectorsEl.checked : false,
    showSaturation: debugShowSaturationEl ? debugShowSaturationEl.checked : true,
  });
}

[debugShowMaskEl, debugShowDensityEl, debugShowVectorsEl, debugShowSaturationEl].forEach((el) => {
  if (!el) return;
  el.addEventListener('change', syncFaceOverlayFlags);
});
syncFaceOverlayFlags();

if (debugPanelEnabledEl) {
  debugPanelEnabledEl.addEventListener('change', () => {
    debugPanelEnabled = debugPanelEnabledEl.checked;
    syncFaceDebugPanelVisibility();
  });
}

backBtn.addEventListener('click', showMenu);

// Hide status bar and debug controls on initial load (menu is visible)
statusBar.classList.add('hidden');
if (debugPanel) debugPanel.classList.add('hidden');
if (debugPanelSwitch) debugPanelSwitch.classList.add('hidden');
if (handDebugPanel) handDebugPanel.classList.add('hidden');
