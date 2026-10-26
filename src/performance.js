/**
 * visual-eyes-her — Automatic Performance Optimizer
 *
 * Continuously monitors FPS, frame latency, memory, device capability,
 * and battery/power constraints (where available).
 * Gracefully scales pixelRatio, particle count, shader complexity, and bloom
 * without degrading the core aesthetic or causing abrupt pops.
 */

export const QUALITY_TIERS = [
  {
    id: 'low',
    label: 'Eco',
    maxPixelRatio: 0.9,
    particleRatio: 0.22,
    shaderQuality: 0.35,
    bloomEnabled: true, // Keep gentle bloom so core glow aesthetic stays intact!
    bloomHalfRes: true,
    secondaryDetail: 0.45,
  },
  {
    id: 'medium',
    label: 'Balanced',
    maxPixelRatio: 1.2,
    particleRatio: 0.5,
    shaderQuality: 0.65,
    bloomEnabled: true,
    bloomHalfRes: true,
    secondaryDetail: 0.75,
  },
  {
    id: 'high',
    label: 'High',
    maxPixelRatio: 1.65,
    particleRatio: 0.8,
    shaderQuality: 0.9,
    bloomEnabled: true,
    bloomHalfRes: false,
    secondaryDetail: 1.0,
  },
  {
    id: 'ultra',
    label: 'Ultra',
    maxPixelRatio: 2.0,
    particleRatio: 1.0,
    shaderQuality: 1.0,
    bloomEnabled: true,
    bloomHalfRes: false,
    secondaryDetail: 1.0,
  },
];

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export class PerformanceOptimizer {
  constructor(gl = null) {
    this.mode = 'auto'; // 'auto' | 'low' | 'medium' | 'high' | 'ultra'
    this.deviceInfo = this._probeDevice(gl);

    // Choose sensible starting tier based on hardware capability
    this.currentTierIndex = this.deviceInfo.initialTier;

    // Frame timing ring buffer (ms)
    this._samples = new Float32Array(90);
    this._sampleIdx = 0;
    this._sampleCount = 0;

    this.fps = 60;
    this.frameMs = 16.6;
    this.p95Ms = 16.7;
    this.memoryMb = null;
    this.battery = { supported: false, level: 1, charging: true, powerConstrained: false };

    // Hysteresis timers (seconds)
    this._lowFpsTimer = 0;
    this._highFpsTimer = 0;
    this._cooldownTimer = 2.0; // warm-up grace period on boot
    this._pixelRatioDirty = true;

    // Smoothly interpolated runtime budgets
    const initTier = QUALITY_TIERS[this.currentTierIndex];
    this.budget = {
      pixelRatio: Math.min(window.devicePixelRatio || 1, initTier.maxPixelRatio),
      particleRatio: initTier.particleRatio,
      shaderQuality: initTier.shaderQuality,
      secondaryDetail: initTier.secondaryDetail,
      bloomEnabled: initTier.bloomEnabled,
    };

    this.lastActionNote = `Auto (${initTier.label})`;
    this._initBatteryMonitor();
  }

  _probeDevice(gl) {
    const cores = navigator.hardwareConcurrency || 4;
    const ramGb = navigator.deviceMemory || 4;
    const dpr = window.devicePixelRatio || 1;
    let rendererName = 'WebGL GPU';
    let isSoftware = false;

    if (gl) {
      try {
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        if (dbg) {
          rendererName = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || rendererName;
          isSoftware = /swiftshader|llvmpipe|software|basic render/i.test(rendererName);
        }
      } catch (_) {}
    }

    let initialTier = 2; // High default
    if (isSoftware || cores <= 2 || ramGb <= 2) {
      initialTier = 0; // Eco
    } else if (cores <= 4 || ramGb <= 4) {
      initialTier = 1; // Balanced
    } else if (cores >= 8 && ramGb >= 8 && dpr >= 1.5) {
      initialTier = 2; // Start High, let Auto promote to Ultra if 60fps holds effortlessly
    }

    return {
      cores,
      ramGb,
      rendererName,
      isSoftware,
      initialTier,
    };
  }

  _initBatteryMonitor() {
    if (typeof navigator !== 'undefined' && typeof navigator.getBattery === 'function') {
      navigator
        .getBattery()
        .then((bat) => {
          const sync = () => {
            const constrained = !bat.charging && bat.level <= 0.22;
            this.battery = {
              supported: true,
              level: bat.level,
              charging: bat.charging,
              powerConstrained: constrained,
            };
          };
          sync();
          bat.addEventListener('levelchange', sync);
          bat.addEventListener('chargingchange', sync);
        })
        .catch(() => {});
    }
  }

  _resetTimingWindow() {
    this._sampleIdx = 0;
    this._sampleCount = 0;
    this.frameMs = 16.6;
    this.p95Ms = 16.7;
    this.fps = 60;
    this._lowFpsTimer = 0;
    this._highFpsTimer = 0;
  }

  setMode(mode) {
    if (!['auto', 'low', 'medium', 'high', 'ultra'].includes(mode)) return;
    this.mode = mode;
    if (mode !== 'auto') {
      const idx = QUALITY_TIERS.findIndex((t) => t.id === mode);
      if (idx >= 0) {
        this.currentTierIndex = idx;
        this._pixelRatioDirty = true;
        this._resetTimingWindow();
        this.lastActionNote = `Pinned: ${QUALITY_TIERS[idx].label}`;
      }
    } else {
      this._resetTimingWindow();
      this.lastActionNote = `Auto (${QUALITY_TIERS[this.currentTierIndex].label})`;
    }
  }

  /**
   * Call once per frame with raw un-clamped frame delta in milliseconds.
   */
  update(rawFrameMs) {
    // Ignore tab-background pauses (> 400ms)
    if (rawFrameMs > 400) return this.getStatus();

    const dtSec = clamp(rawFrameMs / 1000, 0.001, 0.15);
    this._samples[this._sampleIdx] = rawFrameMs;
    this._sampleIdx = (this._sampleIdx + 1) % this._samples.length;
    this._sampleCount = Math.min(this._samples.length, this._sampleCount + 1);

    // Compute rolling average & p95 latency
    let sum = 0;
    const valid = [];
    for (let i = 0; i < this._sampleCount; i++) {
      const v = this._samples[i];
      sum += v;
      valid.push(v);
    }
    const avgMs = sum / Math.max(1, this._sampleCount);
    valid.sort((a, b) => a - b);
    const p95 = valid[Math.min(valid.length - 1, Math.floor(valid.length * 0.95))] || avgMs;

    this.frameMs = lerp(this.frameMs, avgMs, 0.15);
    this.p95Ms = lerp(this.p95Ms, p95, 0.15);
    this.fps = clamp(1000 / Math.max(4, this.frameMs), 1, 240);

    // Sample JS heap memory occasionally where available (Chromium)
    if (performance && performance.memory && this._sampleIdx === 0) {
      this.memoryMb = Math.round(performance.memory.usedJSHeapSize / (1024 * 1024));
    }

    // Automatic tier governance with hysteresis
    if (this.mode === 'auto') {
      if (this._cooldownTimer > 0) {
        this._cooldownTimer -= dtSec;
      } else {
        // Respect battery saver constraint
        const maxAllowedTier = this.battery.powerConstrained ? 1 : 3;
        if (this.currentTierIndex > maxAllowedTier) {
          this.currentTierIndex = maxAllowedTier;
          this._pixelRatioDirty = true;
          this._cooldownTimer = 3.0;
          this._resetTimingWindow();
          this.lastActionNote = `Battery Saver (${QUALITY_TIERS[this.currentTierIndex].label})`;
        } else if (this.fps < 47 || this.p95Ms > 33) {
          this._lowFpsTimer += dtSec;
          this._highFpsTimer = 0;
          if (this._lowFpsTimer >= 1.6 && this.currentTierIndex > 0) {
            this.currentTierIndex--;
            this._cooldownTimer = 2.8;
            this._pixelRatioDirty = true;
            this._resetTimingWindow();
            this.lastActionNote = `Simplified → ${QUALITY_TIERS[this.currentTierIndex].label}`;
          }
        } else if (this.fps >= 56.5 && this.p95Ms < 21.5 && this.currentTierIndex < maxAllowedTier) {
          this._highFpsTimer += dtSec;
          this._lowFpsTimer = Math.max(0, this._lowFpsTimer - dtSec);
          if (this._highFpsTimer >= 5.2) {
            this.currentTierIndex++;
            this._cooldownTimer = 3.5;
            this._pixelRatioDirty = true;
            this._resetTimingWindow();
            this.lastActionNote = `Restored → ${QUALITY_TIERS[this.currentTierIndex].label}`;
          }
        } else {
          this._lowFpsTimer = Math.max(0, this._lowFpsTimer - dtSec * 0.5);
          this._highFpsTimer = Math.max(0, this._highFpsTimer - dtSec * 0.5);
        }
      }
    }

    // Smoothly interpolate continuous quality budgets (zero visual pops!)
    const target = QUALITY_TIERS[this.currentTierIndex];
    const smoothRate = clamp(dtSec * 1.8, 0.01, 0.2);
    this.budget.particleRatio = lerp(this.budget.particleRatio, target.particleRatio, smoothRate);
    this.budget.shaderQuality = lerp(this.budget.shaderQuality, target.shaderQuality, smoothRate);
    this.budget.secondaryDetail = lerp(this.budget.secondaryDetail, target.secondaryDetail, smoothRate);
    this.budget.bloomEnabled = target.bloomEnabled;

    const targetDpr = Math.min(window.devicePixelRatio || 1, target.maxPixelRatio);
    if (Math.abs(this.budget.pixelRatio - targetDpr) > 0.04) {
      this.budget.pixelRatio = targetDpr;
      this._pixelRatioDirty = true;
    }

    return this.getStatus();
  }

  consumePixelRatioChange() {
    if (!this._pixelRatioDirty) return null;
    this._pixelRatioDirty = false;
    return this.budget.pixelRatio;
  }

  getStatus() {
    const tier = QUALITY_TIERS[this.currentTierIndex];
    return {
      mode: this.mode,
      tierId: tier.id,
      tierLabel: tier.label,
      fps: Math.round(this.fps),
      frameMs: this.frameMs.toFixed(1),
      p95Ms: this.p95Ms.toFixed(1),
      memoryMb: this.memoryMb,
      battery: this.battery,
      deviceInfo: this.deviceInfo,
      budget: this.budget,
      note: this.lastActionNote,
    };
  }
}
