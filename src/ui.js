/**
 * visual-eyes-her — Studio HUD & Interactive Controller
 *
 * Binds:
 *  - Hide/Show UI immersion toggle (H) + Studio Drawer toggle (D)
 *  - Audio mode buttons (Self, Mic, File, Synth)
 *  - Explicit steering actions (Like, Skip, Save, Calmer, Brighter, More Abstract, More Energetic)
 *  - Automation levels (Manual, Guided, Adaptive, Autonomous)
 *  - Instant Overrides & Locks (Family, Palette, Motion, Particles)
 *  - Creative Tuning Sliders, Personalization Opt-In & Editable Weights, Saved Scenes
 *  - Accessibility Toggles & Performance Quality Selector + Live Telemetry
 */

import {
  AESTHETIC_FAMILIES,
  MOTION_STYLES,
  PARTICLE_BEHAVIORS,
} from './preferences.js';
import { getAvailablePalettes } from './palettes.js';

export class UIController {
  constructor({ prefs, director, perf, onAudioSelect }) {
    this.prefs = prefs;
    this.director = director;
    this.perf = perf;
    this.onAudioSelect = onAudioSelect;

    this.uiHidden = false;
    this.drawerOpen = false;
    this._toastTimer = null;
    this._lastTelemetryTime = 0;
    this._lastLogKey = '';

    this._cacheElements();
    this._populateSelects();
    this._renderFamilyWeightSliders();
    this._renderSavedScenes();
    this._bindEvents();
    this._syncFromPrefs();

    this.prefs.onChange((_mgr, reason) => {
      this._syncFromPrefs();
      if (reason === 'accessibility') {
        this._populatePaletteSelect();
      }
      if (reason === 'save-scene' || reason === 'delete-scene') {
        this._renderSavedScenes();
      }
    });
  }

  _cacheElements() {
    this.hud = document.getElementById('hud');
    this.toast = document.getElementById('toast');
    this.showCornerBtn = document.getElementById('show-ui-corner');
    this.drawer = document.getElementById('studio-drawer');
    this.toggleDrawerBtn = document.getElementById('toggle-drawer-btn');
    this.hideUiBtn = document.getElementById('hide-ui-btn');
    this.directorPill = document.getElementById('director-pill');

    this.audioModeBadge = document.getElementById('audio-mode-badge');
    this.arcPhaseBadge = document.getElementById('arc-phase-badge');
    this.directorLiveText = document.getElementById('director-live-text');
    this.arcProgressBar = document.getElementById('arc-progress-bar');
    this.perfBadge = document.getElementById('perf-badge');

    this.fileInput = document.getElementById('audio-file-input');
    this.quickIntensity = document.getElementById('quick-intensity');

    this.selectFamily = document.getElementById('select-family');
    this.selectPalette = document.getElementById('select-palette');
    this.selectMotion = document.getElementById('select-motion');
    this.selectParticles = document.getElementById('select-particles');

    this.directorLog = document.getElementById('director-log');
    this.audioTrackLabel = document.getElementById('audio-track-label');
    this.meterEnergy = document.getElementById('meter-energy');
    this.meterBass = document.getElementById('meter-bass');
    this.meterMids = document.getElementById('meter-mids');
    this.meterHighs = document.getElementById('meter-highs');
    this.telTempo = document.getElementById('tel-tempo');
    this.telOnsets = document.getElementById('tel-onsets');
    this.telStereo = document.getElementById('tel-stereo');
    this.telSection = document.getElementById('tel-section');

    this.consentToggle = document.getElementById('consent-toggle');
    this.familyWeightsList = document.getElementById('family-weights-list');
    this.savedScenesList = document.getElementById('saved-scenes-list');
    this.savedCount = document.getElementById('saved-count');

    this.perfFpsDetail = document.getElementById('perf-fps-detail');
    this.perfTierDetail = document.getElementById('perf-tier-detail');
    this.perfParticlesDetail = document.getElementById('perf-particles-detail');
    this.perfMemDetail = document.getElementById('perf-mem-detail');
    this.perfGpuDetail = document.getElementById('perf-gpu-detail');
  }

  _populateSelects() {
    this.selectFamily.innerHTML = AESTHETIC_FAMILIES.map(
      (f) => `<option value="${f.id}">${f.name}</option>`
    ).join('');

    this._populatePaletteSelect();

    this.selectMotion.innerHTML = MOTION_STYLES.map(
      (m) => `<option value="${m.id}">${m.name}</option>`
    ).join('');

    this.selectParticles.innerHTML = PARTICLE_BEHAVIORS.map(
      (p) => `<option value="${p.id}">${p.name}</option>`
    ).join('');
  }

  _populatePaletteSelect() {
    const pals = getAvailablePalettes(this.prefs.accessibility.colorBlindSafe);
    this.selectPalette.innerHTML = pals
      .map((p) => `<option value="${p.id}">${p.name}</option>`)
      .join('');
    if (pals.some((p) => p.id === this.director.recipe.palette)) {
      this.selectPalette.value = this.director.recipe.palette;
    }
  }

  _renderFamilyWeightSliders() {
    this.familyWeightsList.innerHTML = AESTHETIC_FAMILIES.map(
      (f) => `
      <div class="slider-row">
        <div class="slider-label">
          <span>${f.name}</span>
          <output id="fw-val-${f.id}">0.00</output>
        </div>
        <input type="range" data-family-weight="${f.id}" min="-1" max="1" step="0.05" value="0" />
      </div>
    `
    ).join('');

    this.familyWeightsList.querySelectorAll('[data-family-weight]').forEach((el) => {
      el.addEventListener('input', () => {
        const fid = el.dataset.familyWeight;
        this.prefs.setFamilyWeight(fid, parseFloat(el.value));
      });
    });
  }

  _renderSavedScenes() {
    const scenes = this.prefs.savedScenes;
    this.savedCount.textContent = String(scenes.length);
    if (!scenes.length) {
      this.savedScenesList.innerHTML =
        '<div class="saved-empty">Press ★ Save (or B) to bookmark favorite visual moments.</div>';
      return;
    }

    this.savedScenesList.innerHTML = '';
    scenes.forEach((entry) => {
      const row = document.createElement('div');
      row.className = 'saved-item';

      const loadBtn = document.createElement('button');
      loadBtn.type = 'button';
      loadBtn.className = 'saved-load-btn';
      loadBtn.textContent = entry.name;
      loadBtn.addEventListener('click', () => {
        this.director.applySavedScene(entry);
        this.showToast(`Loaded "${entry.name}"`);
      });

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'saved-del-btn';
      delBtn.title = 'Delete saved scene';
      delBtn.textContent = '✕';
      delBtn.addEventListener('click', () => {
        this.prefs.deleteSavedScene(entry.id);
      });

      row.append(loadBtn, delBtn);
      this.savedScenesList.appendChild(row);
    });
  }

  showToast(message, durationMs = 1900) {
    if (!this.toast) return;
    this.toast.textContent = message;
    this.toast.classList.add('visible');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this.toast.classList.remove('visible');
    }, durationMs);
  }

  setUIVisible(visible) {
    this.uiHidden = !visible;
    this.hud.classList.toggle('ui-hidden', this.uiHidden);
    document.body.classList.toggle('immersive-mode', this.uiHidden);
    if (this.uiHidden) {
      this.showToast('UI Hidden · Press H to restore controls', 1600);
    }
  }

  setDrawerOpen(open) {
    this.drawerOpen = Boolean(open);
    this.drawer.classList.toggle('open', this.drawerOpen);
    this.toggleDrawerBtn.classList.toggle('active', this.drawerOpen);
    this.toggleDrawerBtn.setAttribute('aria-expanded', String(this.drawerOpen));
  }

  setAudioButtonState(mode) {
    document.querySelectorAll('[data-audio]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.audio === mode);
    });
    const labels = {
      off: 'SELF PULSE',
      mic: 'LIVE MIC',
      file: 'AUDIO TRACK',
      synth: 'AMBIENT SYNTH',
    };
    this.audioModeBadge.textContent = labels[mode] || 'SELF PULSE';
  }

  _bindEvents() {
    // Immersion Hide/Show & Drawer Toggle
    this.hideUiBtn.addEventListener('click', () => this.setUIVisible(false));
    this.showCornerBtn.addEventListener('click', () => this.setUIVisible(true));
    this.toggleDrawerBtn.addEventListener('click', () => this.setDrawerOpen(!this.drawerOpen));
    this.directorPill.addEventListener('click', () => this.setDrawerOpen(!this.drawerOpen));

    // Drawer Tabs
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
        document.querySelectorAll('.tab-panel').forEach((p) => {
          p.classList.toggle('active', p.dataset.panel === target);
        });
      });
    });

    // Audio Source Buttons
    document.querySelectorAll('[data-audio]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.audio;
        if (mode === 'file') {
          this.fileInput.click();
        } else {
          this.onAudioSelect(mode, null);
        }
      });
    });

    this.fileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        this.onAudioSelect('file', file);
      }
      this.fileInput.value = '';
    });

    // Explicit Steering Buttons
    document.querySelectorAll('[data-steer]').forEach((btn) => {
      btn.addEventListener('click', () => this._handleSteer(btn.dataset.steer));
    });

    // Immediate Quick Intensity Slider
    this.quickIntensity.addEventListener('input', () => {
      this.prefs.setControl('intensity', parseFloat(this.quickIntensity.value));
    });

    // Automation Mode Buttons
    document.querySelectorAll('[data-auto]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.prefs.setAutomationMode(btn.dataset.auto);
        this.showToast(`Automation: ${btn.textContent}`);
      });
    });

    // Instant Override Selects & Lock Pins
    this.selectFamily.addEventListener('change', () => {
      this.director.overrideFamily(this.selectFamily.value, false);
    });
    this.selectPalette.addEventListener('change', () => {
      this.director.overridePalette(this.selectPalette.value, false);
    });
    this.selectMotion.addEventListener('change', () => {
      this.director.overrideMotionStyle(this.selectMotion.value, false);
    });
    this.selectParticles.addEventListener('change', () => {
      this.director.overrideParticleBehavior(this.selectParticles.value, false);
    });

    document.querySelectorAll('[data-lock]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.lock;
        this.director.toggleLock(key);
        this._syncLockButtons();
      });
    });

    // Creative Tuning Sliders
    document.querySelectorAll('[data-control]').forEach((el) => {
      el.addEventListener('input', () => {
        this.prefs.setControl(el.dataset.control, parseFloat(el.value));
      });
    });

    document.getElementById('reset-controls-btn').addEventListener('click', () => {
      this.prefs.resetControls();
      this.showToast('Visual tuning reset to defaults');
    });

    // Personalization Consent, Bias Editors & Reset
    this.consentToggle.addEventListener('change', () => {
      this.prefs.setLearningConsent(this.consentToggle.checked);
      this.showToast(
        this.consentToggle.checked
          ? 'Local preference memory enabled'
          : 'Local preference memory turned off & cleared'
      );
    });

    document.querySelectorAll('[data-bias]').forEach((el) => {
      el.addEventListener('input', () => {
        this.prefs.setBias(el.dataset.bias, parseFloat(el.value));
      });
    });

    document.getElementById('reset-learned-btn').addEventListener('click', () => {
      this.prefs.resetLearned();
      this.showToast('Learned preference profile reset');
    });

    // Accessibility Checkboxes
    document.querySelectorAll('[data-access]').forEach((el) => {
      el.addEventListener('change', () => {
        this.prefs.setAccessibility(el.dataset.access, el.checked);
      });
    });

    // Performance Quality Mode
    document.querySelectorAll('[data-quality]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const q = btn.dataset.quality;
        this.perf.setMode(q);
        document.querySelectorAll('[data-quality]').forEach((b) => b.classList.toggle('active', b === btn));
        this.showToast(`Quality: ${btn.textContent}`);
      });
    });

    // Global Keyboard Hotkeys
    window.addEventListener('keydown', (e) => {
      if (e.target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) {
        if (e.key === 'Escape') e.target.blur();
        else return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key.toLowerCase();
      switch (key) {
        case 'h':
          e.preventDefault();
          this.setUIVisible(this.uiHidden);
          break;
        case 'd':
        case 'tab':
          e.preventDefault();
          if (this.uiHidden) this.setUIVisible(true);
          this.setDrawerOpen(!this.drawerOpen);
          break;
        case 'escape':
          if (this.drawerOpen) this.setDrawerOpen(false);
          break;
        case 'l':
          e.preventDefault();
          this._handleSteer('like');
          break;
        case 'n':
        case ' ':
          e.preventDefault();
          this._handleSteer('skip');
          break;
        case 'b':
          e.preventDefault();
          this._handleSteer('save');
          break;
        case 'c':
          e.preventDefault();
          this.prefs.setAccessibility('calmMode', !this.prefs.accessibility.calmMode);
          this.showToast(this.prefs.accessibility.calmMode ? 'Calm Mode On' : 'Calm Mode Off');
          break;
        case 'm':
          e.preventDefault();
          this.onAudioSelect('mic', null);
          break;
        case 's':
          e.preventDefault();
          this.onAudioSelect('off', null);
          break;
        case 'f':
          e.preventDefault();
          this.fileInput.click();
          break;
        case '1':
          this.prefs.setAutomationMode('manual');
          this.showToast('Automation: Manual');
          break;
        case '2':
          this.prefs.setAutomationMode('guided');
          this.showToast('Automation: Guided');
          break;
        case '3':
          this.prefs.setAutomationMode('adaptive');
          this.showToast('Automation: Adaptive');
          break;
        case '4':
          this.prefs.setAutomationMode('autonomous');
          this.showToast('Automation: Autonomous');
          break;
        case 'arrowup':
          e.preventDefault();
          this.prefs.setControl('intensity', this.prefs.controls.intensity + 0.1);
          this.showToast(`Intensity: ${this.prefs.controls.intensity.toFixed(2)}`, 1100);
          break;
        case 'arrowdown':
          e.preventDefault();
          this.prefs.setControl('intensity', this.prefs.controls.intensity - 0.1);
          this.showToast(`Intensity: ${this.prefs.controls.intensity.toFixed(2)}`, 1100);
          break;
      }
    });
  }

  _handleSteer(action) {
    if (action === 'like') {
      this.prefs.recordSteering('like', this.director.recipe, this.director.sceneElapsed);
      this.showToast('♥ Liked — reinforcing motif & palette affinity');
    } else if (action === 'skip') {
      this.director.skipToFreshScene(null, true);
      this.showToast('⏭ Transitioning to fresh visual composition');
    } else if (action === 'save') {
      const saved = this.prefs.saveSceneSnapshot(this.director.recipe);
      this.showToast(`★ Saved "${saved.name}"`);
    } else if (action === 'calmer') {
      this.prefs.recordSteering('calmer', this.director.recipe);
      this.showToast('Gentler motion & softer intensity');
    } else if (action === 'brighter') {
      this.prefs.recordSteering('brighter', this.director.recipe);
      this.showToast('Lifted luminance & glow');
    } else if (action === 'moreAbstract') {
      this.prefs.recordSteering('moreAbstract', this.director.recipe);
      this.showToast('Higher abstraction & sculptural morphing');
    } else if (action === 'moreEnergetic') {
      this.prefs.recordSteering('moreEnergetic', this.director.recipe);
      this.showToast('Boosted kinetic energy & audio coupling');
    }
  }

  _syncLockButtons() {
    document.querySelectorAll('[data-lock]').forEach((btn) => {
      const locked = Boolean(this.director.locks[btn.dataset.lock]);
      btn.classList.toggle('locked', locked);
      btn.textContent = locked ? '🔒' : '🔓';
    });
  }

  _syncFromPrefs() {
    // Automation buttons
    document.querySelectorAll('[data-auto]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.auto === this.prefs.automationMode);
    });

    // Quick intensity + all control sliders
    this.quickIntensity.value = String(this.prefs.controls.intensity);
    Object.entries(this.prefs.controls).forEach(([k, val]) => {
      const slider = document.querySelector(`[data-control="${k}"]`);
      const out = document.getElementById(`val-${k}`);
      if (slider) slider.value = String(val);
      if (out) out.textContent = Number(val).toFixed(2);
    });

    // Consent & Biases
    this.consentToggle.checked = this.prefs.learningConsent;
    Object.entries(this.prefs.learned.biases).forEach(([k, val]) => {
      const slider = document.querySelector(`[data-bias="${k}"]`);
      const out = document.getElementById(`bias-val-${k}`);
      if (slider) slider.value = String(val);
      if (out) out.textContent = Number(val).toFixed(2);
    });

    // Family weights
    Object.entries(this.prefs.learned.familyWeights).forEach(([fid, val]) => {
      const slider = document.querySelector(`[data-family-weight="${fid}"]`);
      const out = document.getElementById(`fw-val-${fid}`);
      if (slider) slider.value = String(val);
      if (out) out.textContent = Number(val).toFixed(2);
    });

    // Accessibility checkboxes
    Object.entries(this.prefs.accessibility).forEach(([k, val]) => {
      const cb = document.querySelector(`[data-access="${k}"]`);
      if (cb) cb.checked = Boolean(val);
    });
  }

  /**
   * Throttled live HUD telemetry update (~7 Hz so DOM writes stay ultra-lightweight).
   */
  updateTelemetry(nowMs, audioSnap, directorState, perfStatus, activeParticles) {
    if (nowMs - this._lastTelemetryTime < 140) return;
    this._lastTelemetryTime = nowMs;

    // Top bar pills
    this.arcPhaseBadge.textContent =
      this.prefs.automationMode === 'manual' ? 'MANUAL' : directorState.arcPhase.label.toUpperCase();
    this.directorLiveText.textContent = directorState.currentAction;
    this.arcProgressBar.style.width = `${Math.round(directorState.arcProgress * 100)}%`;

    const modeSuffix = perfStatus.mode === 'auto' ? `Auto:${perfStatus.tierLabel}` : perfStatus.tierLabel;
    this.perfBadge.textContent = `${perfStatus.fps} FPS · ${modeSuffix}`;

    // Sync active dropdown values if user isn't currently focused on them
    const r = directorState.recipe;
    if (document.activeElement !== this.selectFamily) this.selectFamily.value = r.family;
    if (document.activeElement !== this.selectPalette) this.selectPalette.value = r.palette;
    if (document.activeElement !== this.selectMotion) this.selectMotion.value = r.motionStyle;
    if (document.activeElement !== this.selectParticles) this.selectParticles.value = r.particleBehavior;
    this._syncLockButtons();

    // If drawer is closed, skip updating inner drawer meters to save DOM work
    if (!this.drawerOpen) return;

    // Director Log
    const logKey = directorState.recentChanges.join('|');
    if (logKey !== this._lastLogKey) {
      this._lastLogKey = logKey;
      this.directorLog.innerHTML = directorState.recentChanges
        .map((line) => `<li>${line}</li>`)
        .join('');
    }

    // Audio meters & conservative readouts
    this.audioTrackLabel.textContent =
      audioSnap.mode === 'off'
        ? 'Internal Pulse'
        : audioSnap.fileName || (audioSnap.mode === 'mic' ? 'Live Microphone' : 'Active');

    this.meterEnergy.style.width = `${Math.min(100, Math.round(audioSnap.energy * 115))}%`;
    this.meterBass.style.opacity = String(0.25 + Math.min(0.75, audioSnap.bass));
    this.meterMids.style.opacity = String(0.25 + Math.min(0.75, audioSnap.mids));
    this.meterHighs.style.opacity = String(0.25 + Math.min(0.75, audioSnap.highs));

    if (audioSnap.mode === 'off') {
      this.telTempo.textContent = 'Internal Organic Pulse';
      this.telStereo.textContent = 'Synthetic Drift';
      this.telSection.textContent = 'Self-Generating Arc';
    } else {
      this.telTempo.textContent = audioSnap.tempoReliable
        ? `~${audioSnap.tempoBpm} BPM (${Math.round(audioSnap.tempoConfidence * 100)}% conf)`
        : 'Uncertain — using direct rhythm';

      if (audioSnap.stereoReliable) {
        const panLabel =
          Math.abs(audioSnap.stereoPan) < 0.08
            ? 'Centered'
            : audioSnap.stereoPan < 0
              ? `Left ${Math.round(Math.abs(audioSnap.stereoPan) * 100)}%`
              : `Right ${Math.round(audioSnap.stereoPan * 100)}%`;
        this.telStereo.textContent = `${panLabel} · Width ${Math.round(audioSnap.stereoWidth * 100)}%`;
      } else {
        this.telStereo.textContent = 'Mono / Centered';
      }

      this.telSection.textContent = audioSnap.sectionReliable
        ? `${audioSnap.section.toUpperCase()} · ${audioSnap.mood.label}`
        : audioSnap.mood.label;
    }
    this.telOnsets.textContent = `${audioSnap.onsetDensity.toFixed(1)} /s`;

    // Performance tab details
    this.perfFpsDetail.textContent = `${perfStatus.fps} FPS · ${perfStatus.frameMs} ms (p95 ${perfStatus.p95Ms} ms)`;
    this.perfTierDetail.textContent = perfStatus.note;
    this.perfParticlesDetail.textContent = `${activeParticles.toLocaleString()} pts · ${perfStatus.budget.pixelRatio.toFixed(2)}x DPR`;

    const memPart = perfStatus.memoryMb ? `${perfStatus.memoryMb} MB Heap` : 'Heap N/A';
    const batPart = perfStatus.battery.supported
      ? `${Math.round(perfStatus.battery.level * 100)}% ${perfStatus.battery.charging ? '⚡' : '🔋'}`
      : 'AC / Standard';
    this.perfMemDetail.textContent = `${memPart} · ${batPart}`;
    this.perfGpuDetail.textContent = `${perfStatus.deviceInfo.cores} cores · ${perfStatus.deviceInfo.rendererName.slice(0, 36)}`;
  }
}
