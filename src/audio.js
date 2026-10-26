/**
 * visual-eyes-her — audio analyzer
 * Web Audio API: real-time FFT band extraction, onset detection,
 * spectral centroid. Falls back to idle (silent) features when no audio.
 */

export class AudioAnalyzer {
  constructor() {
    this.audioCtx = null;
    this.analyser = null;
    this.source = null;
    this.dataArray = null;
    this.mode = 'off'; // 'off' | 'mic' | 'file'
    this.element = null; // HTMLAudioElement for file mode

    // Smoothed feature outputs (0..1 unless noted)
    this.bass = 0;
    this.mids = 0;
    this.highs = 0;
    this.centroid = 0; // 0..1 normalized
    this.loudness = 0;
    this.onset = 0;    // 0..1 trigger-ish

    // Internal smoothing / onset state
    this._peak = { bass: 0, mids: 0, highs: 0, loud: 0 };
    this._prev = { bass: 0, mids: 0, highs: 0, loud: 0 };
    this._onsetCooldown = 0;
  }

  /** Return current smoothed features (call each frame). */
  get features() {
    return {
      bass: this.bass,
      mids: this.mids,
      highs: this.highs,
      centroid: this.centroid,
      loudness: this.loudness,
      onset: this.onset,
      mode: this.mode,
    };
  }

  /** Initialize audio for a given mode. */
  async init(mode, file = null) {
    this.stop();
    this.mode = mode;

    if (!window.AudioContext && !window.webkitAudioContext) {
      console.warn('Web Audio API not supported');
      return false;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.audioCtx = new Ctx({ sampleRate: 44100 });
    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }

    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.65;
    this.analyser.minDecibels = -100;
    this.analyser.maxDecibels = -10;
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);

    if (mode === 'mic') {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.source = this.audioCtx.createMediaStreamSource(stream);
    } else if (mode === 'file' && file) {
      this.element = document.createElement('audio');
      this.element.crossOrigin = 'anonymous';
      this.element.src = URL.createObjectURL(file);
      this.element.loop = true;
      this.source = this.audioCtx.createMediaElementSource(this.element);
      this.element.play().catch(() => {});
    }

    this.source.connect(this.analyser);
    this.analyser.connect(this.audioCtx.destination);
    return true;
  }

  stop() {
    if (this.element) {
      this.element.pause();
      this.element.src = '';
      this.element = null;
    }
    if (this.source) {
      try { this.source.disconnect(); } catch (_) {}
      this.source = null;
    }
    if (this.analyser) {
      try { this.analyser.disconnect(); } catch (_) {}
      this.analyser = null;
    }
    if (this.audioCtx) {
      try { this.audioCtx.close(); } catch (_) {}
      this.audioCtx = null;
    }
    this.dataArray = null;
    this.mode = 'off';
    // decay features to idle
    this.bass *= 0.9; this.mids *= 0.9; this.highs *= 0.9;
  }

  binForFreq(freq) {
    if (!this.analyser) return 0;
    const nyquist = this.audioCtx.sampleRate / 2;
    return Math.floor((freq / nyquist) * (this.analyser.frequencyBinCount - 1));
  }

  bandEnergy(loHz, hiHz) {
    if (!this.dataArray) return 0;
    const lo = this.binForFreq(loHz);
    const hi = Math.min(this.binForFreq(hiHz), this.dataArray.length - 1);
    if (hi < lo) return 0;
    let sum = 0;
    for (let i = lo; i <= hi; i++) sum += this.dataArray[i] / 255;
    return sum / (hi - lo + 1);
  }

  spectralCentroid() {
    if (!this.dataArray) return 0.5;
    let sumFreq = 0, sumMag = 0;
    const nyquist = this.audioCtx.sampleRate / 2;
    const n = this.dataArray.length;
    for (let i = 0; i < n; i++) {
      const mag = this.dataArray[i] / 255;
      const freq = (i / (n - 1)) * nyquist;
      sumFreq += freq * mag;
      sumMag += mag;
    }
    if (sumMag === 0) return 0.5;
    const centroidHz = sumFreq / sumMag;
    // normalize roughly 0..1 across 200..8000 Hz
    return Math.max(0, Math.min(1, (centroidHz - 200) / 7800));
  }

  overallLoudness() {
    if (!this.dataArray) return 0;
    let sum = 0;
    for (let i = 0; i < this.dataArray.length; i++) sum += this.dataArray[i];
    return sum / (this.dataArray.length * 255);
  }

  /** Call once per frame. Updates smoothed features & onset trigger. */
  update() {
    if (!this.analyser || !this.dataArray) {
      this._decayIdle();
      this.onset = 0;
      return this.features;
    }

    this.analyser.getByteFrequencyData(this.dataArray);

    const bass = this.bandEnergy(20, 160);
    const mids = this.bandEnergy(160, 1600);
    const highs = this.bandEnergy(1600, 9000);
    const loud = this.overallLoudness();
    const centroid = this.spectralCentroid();

    // Exponential smoothing (lower = smoother/laggier)
    const sm = 0.22;
    this.bass = lerp(this.bass, bass, sm);
    this.mids = lerp(this.mids, mids, sm);
    this.highs = lerp(this.highs, highs, sm);
    this.loudness = lerp(this.loudness, loud, sm);
    this.centroid = lerp(this.centroid, centroid, sm);

    // Onset detection: sudden bass rise above decaying peak
    let onset = 0;
    if (bass > 0.32 && bass > this._peak.bass * 1.35 && this._onsetCooldown <= 0) {
      onset = Math.min(1, (bass - this._peak.bass * 1.2) * 2);
      this._onsetCooldown = 10; // frames
    }
    this.onset = onset;

    // Track peaks with slow decay for onset reference
    this._peak.bass = Math.max(this._peak.bass, bass);
    this._peak.mids = Math.max(this._peak.mids, mids);
    this._peak.highs = Math.max(this._peak.highs, highs);
    this._peak.loud = Math.max(this._peak.loud, loud);
    const decay = 0.985;
    this._peak.bass *= decay;
    this._peak.mids *= decay;
    this._peak.highs *= decay;
    this._peak.loud *= decay;
    if (this._onsetCooldown > 0) this._onsetCooldown--;

    return this.features;
  }

  _decayIdle() {
    const d = 0.94;
    this.bass *= d; this.mids *= d; this.highs *= d;
    this.loudness *= d;
    this.onset = 0;
  }
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
