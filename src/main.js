import * as THREE from 'three';
import { AudioAnalyzer } from './audio.js';
import { buildScene, updateScene } from './scene.js';
import { initUI } from './ui.js';

const canvas = document.getElementById('glcanvas');

// Build the dream scene
const sceneObj = buildScene(canvas);

// Audio analyzer + UI
const audio = new AudioAnalyzer();
const ui = initUI((mode) => {
  ui.setStatus(mode === 'off' ? 'No audio — internal pulse engine active' : 'Initializing audio…');
});

// Resize handler
function onResize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  sceneObj.camera.aspect = w / h;
  sceneObj.camera.updateProjectionMatrix();
  sceneObj.renderer.setSize(w, h, false);
  if (sceneObj.composer) {
    sceneObj.composer.setSize(w, h);
  }
}
window.addEventListener('resize', onResize);
onResize();

// ---------------------------------------------------------------
// Self-generating internal pulse engine (audio-off mode)
// Produces randomized-but-constrained tempo nodes, phase-shifted
// loops that never exactly repeat, and organic tempo drift.
const pulseEngine = {
  phase: 0,
  tempo: 0.85, // cycles per second
  nextBeat: 0,
  textureDrift: 0,

  update(dt) {
    // Advance phase
    this.phase += dt * this.tempo;

    let onset = 0;
    if (this.phase >= this.nextBeat) {
      onset = 1;
      this.nextBeat += 1 / this.tempo;
      // Organic tempo drift (constrained)
      this.tempo += (Math.random() - 0.5) * 0.06;
      this.tempo = Math.min(Math.max(this.tempo, 0.5), 1.5);
      // Occasionally nudge the next beat for gentle unpredictability
      if (Math.random() < 0.2) {
        this.nextBeat += (Math.random() - 0.5) * 0.4;
      }
    }

    // Slow macro swells + micro texture variations
    const macro = Math.sin(this.phase * Math.PI * 2) * 0.5 + 0.5;
    const micro = Math.sin(this.phase * Math.PI * 7 + this.textureDrift) * 0.5 + 0.5;
    this.textureDrift += dt * 0.4;

    // Feature outputs (0..1)
    const bass = 0.28 + 0.42 * macro;
    const mids = 0.2 + 0.35 * micro + 0.15 * Math.sin(this.phase * Math.PI * 3);
    const highs = 0.1 + 0.3 * Math.sin(this.phase * Math.PI * 5 + 1);
    const centroid = 0.4 + 0.3 * Math.sin(this.phase * 0.7);

    return { bass, mids, highs, centroid, onset, macro };
  },
};

// ---------------------------------------------------------------
// Audio mode wiring
async function startAudioMode(mode, file) {
  ui.setStatus(mode === 'off' ? 'No audio — internal pulse engine active' : 'Initializing audio…');
  const ok = await audio.init(mode, file);
  if (!ok) {
    ui.setStatus('Web Audio unavailable — using internal pulse');
    ui.mode = 'off';
    return;
  }
  if (mode === 'mic') {
    ui.setStatus('Microphone live — bass/mids/highs driving visuals');
  } else if (mode === 'file') {
    ui.setStatus('Audio file playing — spectral bands mapped to layers');
  }
}

function stopAudio() {
  audio.stop();
  ui.mode = 'off';
  ui.setStatus('No audio — internal pulse engine active');
}

// Microphone toggle
ui.micToggle.addEventListener('click', async () => {
  const nowActive = ui.micToggle.classList.toggle('active');
  ui.micToggle.textContent = nowActive ? 'Stop Microphone' : 'Start Microphone';
  if (nowActive) {
    await startAudioMode('mic');
  } else {
    stopAudio();
  }
});

// Audio file input
ui.fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  ui.mode = 'file';
  startAudioMode('file', file);
});

// ---------------------------------------------------------------
// Render loop
let lastTime = performance.now() / 1000;

function frame() {
  const now = performance.now() / 1000;
  const dt = Math.min(now - lastTime, 0.05);
  lastTime = now;
  const time = now;

  const intensity = ui.intensity;
  const pulseSpeed = ui.pulseSpeed;
  const mode = ui.mode;

  let audioFeatures;
  let pulse = 1.0;

  if (mode === 'off') {
    // Self-generating hypnotic cascade
    const gen = pulseEngine.update(dt * pulseSpeed);
    audioFeatures = gen;
    // Map internal beat to pulse
    pulse = 0.6 + 0.9 * gen.onset + 0.4 * gen.macro;
  } else {
    audioFeatures = audio.update();
    const { bass, mids, highs, onset } = audioFeatures;
    // Combine bands into a single pulse drive
    pulse = 0.5 + bass * 1.2 + mids * 0.6 + highs * 0.5 + onset * 1.5;
    pulse = Math.min(Math.max(pulse, 0), 2);
  }

  // Clamp pulse by intensity slider
  pulse *= intensity;

  updateScene(sceneObj, time, audioFeatures, pulse);

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
