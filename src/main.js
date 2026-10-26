/**
 * visual-eyes-her — Application Entry
 *
 * Connects:
 *  1. Adaptive Experience Engine & Automatic Scene Composer (ExperienceDirector)
 *  2. Conservative Multi-Band Audio & Stereo Analyzer + Self-Generating Pulse (AudioAnalyzer)
 *  3. Respectful Local Personalization & Accessibility Store (PreferencesManager)
 *  4. Automatic Performance Optimizer (PerformanceOptimizer)
 *  5. 10-Family Sculptural 3D Renderer (VisualScene)
 *  6. Sleek Studio HUD & Hotkeys (UIController)
 */

import { AudioAnalyzer } from './audio.js';
import { PreferencesManager } from './preferences.js';
import { PerformanceOptimizer } from './performance.js';
import { ExperienceDirector } from './director.js';
import { VisualScene } from './scene.js';
import { UIController } from './ui.js';

const canvas = document.getElementById('glcanvas');

const prefs = new PreferencesManager();
const visualScene = new VisualScene(canvas);
const perf = new PerformanceOptimizer(visualScene.glContext);
const director = new ExperienceDirector(prefs);
const audio = new AudioAnalyzer();

const ui = new UIController({
  prefs,
  director,
  perf,
  async onAudioSelect(mode, file) {
    if (mode === 'off') {
      audio.stop();
      ui.setAudioButtonState('off');
      ui.showToast('Self-Generating internal pulse active');
      return;
    }

    // Toggle off if clicking active Mic or Synth again
    if ((mode === 'mic' || mode === 'synth') && audio.mode === mode) {
      audio.stop();
      ui.setAudioButtonState('off');
      ui.showToast('Audio stopped · Using internal pulse');
      return;
    }

    const ok = await audio.init(mode, file);
    if (!ok) {
      ui.setAudioButtonState('off');
      ui.showToast('Audio unavailable or denied — falling back gracefully');
      return;
    }

    ui.setAudioButtonState(mode);
    if (mode === 'mic') ui.showToast('Live Microphone connected');
    else if (mode === 'file') ui.showToast(`Playing: ${audio.fileName}`);
    else if (mode === 'synth') ui.showToast('Generative Ambient Synth active');
  },
});

function handleResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  visualScene.resize(w, h, perf.budget.pixelRatio);
}
window.addEventListener('resize', handleResize);
handleResize();

// Main continuous animation loop
let lastFrameMs = performance.now();

function animate(nowMs) {
  const rawDeltaMs = Math.max(0.5, nowMs - lastFrameMs);
  lastFrameMs = nowMs;
  const dt = Math.min(rawDeltaMs / 1000, 0.05);

  // 1. Performance monitoring & adaptive budget update
  const perfStatus = perf.update(rawDeltaMs);
  const newDpr = perf.consumePixelRatioChange();
  if (newDpr !== null) {
    visualScene.setPixelRatio(newDpr);
  }

  // 2. Continuous audio / internal pulse analysis
  const audioSnap = audio.update(dt, prefs.controls.pulseSpeed);

  // 3. Adaptive Experience Director & Automatic Scene Composition
  const directorState = director.update(dt, audioSnap);

  // 4. Render 3D scene
  visualScene.update(dt, audioSnap, directorState, prefs, perfStatus);

  // 5. Throttled HUD telemetry update
  ui.updateTelemetry(
    nowMs,
    audioSnap,
    directorState,
    perfStatus,
    visualScene.activeParticleCount
  );

  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);
