/**
 * visual-eyes-her — Adaptive Audio & Internal Pulse Engine
 *
 * Continuously analyzes:
 *  - Audio energy & smoothed loudness
 *  - Frequency balance (bass, lowMids, mids, highs, spectral centroid, warmth/brightness tilt)
 *  - Tempo estimate (BPM + explicit confidence; never guessed when uncertain)
 *  - Onset impulse & sliding-window onset density
 *  - Dynamics (short-vs-long energy swell/drop & crest factor)
 *  - Stereo movement (L/R pan & stereo width via ChannelSplitterNode; graceful fallback on mono/mic)
 *  - Conservative musical section & mood estimation (only marked reliable when signal warrants it)
 */

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export class AudioAnalyzer {
  constructor() {
    this.audioCtx = null;
    this.analyser = null;
    this.analyserL = null;
    this.analyserR = null;
    this.splitter = null;
    this.source = null;
    this.mediaStream = null;
    this.element = null;
    this.objectUrl = null;
    this.synthNodes = null;

    this.mode = 'off'; // 'off' | 'mic' | 'file' | 'synth'

    this.freqData = null;
    this.prevFreqData = null;
    this.timeDataL = null;
    this.timeDataR = null;

    // Continuous smoothed features
    this.energy = 0;
    this.bass = 0;
    this.lowMids = 0;
    this.mids = 0;
    this.highs = 0;
    this.centroid = 0.45;
    this.frequencyBalance = 0; // -1 bass/warm .. +1 bright/treble
    this.onset = 0;
    this.onsetDensity = 0; // onsets / second
    this.dynamicTrend = 0; // -1 dropping .. +1 building
    this.dynamicCrest = 0; // 0..1 punchiness
    this.stereoPan = 0;    // -1..+1
    this.stereoWidth = 0;  // 0..1
    this.stereoReliable = false;

    // Tempo & section tracking (conservative)
    this.tempoBpm = null;
    this.tempoConfidence = 0;
    this.tempoReliable = false;

    this.section = 'uncertain';
    this.sectionConfidence = 0;
    this.sectionReliable = false;
    this.mood = {
      arousal: 0.35,
      warmth: 0.5,
      label: 'Self-Generating',
      reliable: false,
    };

    // Internal history buffers
    this._shortEnergy = 0;
    this._longEnergy = 0;
    this._fluxAvg = 0.02;
    this._onsetCooldown = 0;
    this._onsetTimestamps = []; // seconds
    this._activeAudioTime = 0;
    this._fileName = '';

    // Self-generating internal organic engine (for 'off' mode)
    this._self = {
      phase: Math.random() * 10,
      tempoHz: 0.72,
      nextBeat: 0.8,
      driftA: Math.random() * 6.28,
      driftB: Math.random() * 6.28,
      swellPhase: 0,
      onsetEnv: 0,
    };
  }

  get fileName() {
    return this._fileName;
  }

  async init(mode, file = null) {
    this.stop();
    if (mode === 'off') {
      this.mode = 'off';
      return true;
    }

    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      console.warn('Web Audio API unavailable');
      this.mode = 'off';
      return false;
    }

    try {
      this.audioCtx = new Ctx();
      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }

      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.68;
      this.analyser.minDecibels = -95;
      this.analyser.maxDecibels = -12;

      this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
      this.prevFreqData = new Float32Array(this.analyser.frequencyBinCount);

      // Stereo analysis branch
      this.splitter = this.audioCtx.createChannelSplitter(2);
      this.analyserL = this.audioCtx.createAnalyser();
      this.analyserR = this.audioCtx.createAnalyser();
      this.analyserL.fftSize = 512;
      this.analyserR.fftSize = 512;
      this.timeDataL = new Float32Array(this.analyserL.fftSize);
      this.timeDataR = new Float32Array(this.analyserR.fftSize);

      if (mode === 'mic') {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Microphone access unavailable');
        }
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
        this.source = this.audioCtx.createMediaStreamSource(this.mediaStream);
        // Connect ONLY to analysers (never destination, avoiding speaker feedback!)
        this.source.connect(this.analyser);
        this.source.connect(this.splitter);
        this.splitter.connect(this.analyserL, 0);
        this.splitter.connect(this.analyserR, 1);
      } else if (mode === 'file' && file) {
        this._fileName = file.name || 'Audio Track';
        this.objectUrl = URL.createObjectURL(file);
        this.element = document.createElement('audio');
        this.element.crossOrigin = 'anonymous';
        this.element.src = this.objectUrl;
        this.element.loop = true;
        this.source = this.audioCtx.createMediaElementSource(this.element);
        this.source.connect(this.analyser);
        this.source.connect(this.splitter);
        this.splitter.connect(this.analyserL, 0);
        this.splitter.connect(this.analyserR, 1);
        this.analyser.connect(this.audioCtx.destination);
        await this.element.play();
      } else if (mode === 'synth') {
        this._fileName = 'Generative Ambient Synth';
        this.synthNodes = this._buildAmbientSynth(this.audioCtx);
        this.synthNodes.output.connect(this.analyser);
        this.synthNodes.output.connect(this.splitter);
        this.splitter.connect(this.analyserL, 0);
        this.splitter.connect(this.analyserR, 1);
        this.analyser.connect(this.audioCtx.destination);
      } else {
        this.stop();
        return false;
      }

      this.mode = mode;
      this._activeAudioTime = 0;
      this._onsetTimestamps = [];
      return true;
    } catch (err) {
      console.warn('Audio init fallback:', err);
      this.stop();
      return false;
    }
  }

  _buildAmbientSynth(ctx) {
    const master = ctx.createGain();
    master.gain.value = 0.24;

    const pannerL = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const pannerR = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pannerL) pannerL.pan.value = -0.55;
    if (pannerR) pannerR.pan.value = 0.55;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1400;
    filter.Q.value = 2.2;

    // Warm harmonic pad + rhythmic sub pulse
    const freqs = [55, 110, 164.81, 220, 277.18, 329.63];
    const oscs = freqs.map((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = idx === 0 ? 'sine' : idx % 2 === 0 ? 'triangle' : 'sawtooth';
      osc.frequency.value = f;
      osc.detune.value = (idx - 2.5) * 4;
      gain.gain.value = idx === 0 ? 0.36 : 0.08;
      osc.connect(gain);
      if (pannerL && pannerR && idx > 1) {
        gain.connect(idx % 2 === 0 ? pannerL : pannerR);
      } else {
        gain.connect(filter);
      }
      osc.start();
      return { osc, gain, baseFreq: f };
    });

    if (pannerL) pannerL.connect(filter);
    if (pannerR) pannerR.connect(filter);
    filter.connect(master);

    // Gentle rhythmic pulse modulator (~96 BPM)
    const timer = setInterval(() => {
      if (!this.audioCtx || this.audioCtx.state !== 'running') return;
      const now = ctx.currentTime;
      // Sub pulse envelope
      const subGain = oscs[0].gain.gain;
      subGain.cancelScheduledValues(now);
      subGain.setValueAtTime(0.48, now);
      subGain.exponentialRampToValueAtTime(0.12, now + 0.52);

      // Occasional high harmonic shimmer
      const shimmerIdx = 2 + Math.floor(Math.random() * 4);
      const sg = oscs[shimmerIdx].gain.gain;
      sg.cancelScheduledValues(now);
      sg.setValueAtTime(0.16, now);
      sg.exponentialRampToValueAtTime(0.04, now + 0.45);

      filter.frequency.setTargetAtTime(800 + Math.random() * 2400, now, 0.25);
      if (pannerL && pannerR) {
        const p = Math.sin(now * 0.7) * 0.75;
        pannerL.pan.setTargetAtTime(p, now, 0.2);
        pannerR.pan.setTargetAtTime(-p, now, 0.2);
      }
    }, 625);

    return {
      output: master,
      stop() {
        clearInterval(timer);
        oscs.forEach(({ osc }) => {
          try { osc.stop(); } catch (_) {}
        });
        try { master.disconnect(); } catch (_) {}
      },
    };
  }

  stop() {
    if (this.synthNodes) {
      this.synthNodes.stop();
      this.synthNodes = null;
    }
    if (this.element) {
      try {
        this.element.pause();
        this.element.src = '';
      } catch (_) {}
      this.element = null;
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
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

    this.freqData = null;
    this.prevFreqData = null;
    this.timeDataL = null;
    this.timeDataR = null;
    this.mode = 'off';
    this._fileName = '';
    this.tempoBpm = null;
    this.tempoConfidence = 0;
    this.tempoReliable = false;
    this.section = 'uncertain';
    this.sectionConfidence = 0;
    this.sectionReliable = false;
    this.stereoReliable = false;
  }

  binForFreq(freq) {
    if (!this.analyser || !this.audioCtx) return 0;
    const nyquist = this.audioCtx.sampleRate / 2;
    return clamp(
      Math.floor((freq / nyquist) * (this.analyser.frequencyBinCount - 1)),
      0,
      this.analyser.frequencyBinCount - 1
    );
  }

  bandEnergy(loHz, hiHz) {
    if (!this.freqData) return 0;
    const lo = this.binForFreq(loHz);
    const hi = Math.max(lo, this.binForFreq(hiHz));
    let sum = 0;
    for (let i = lo; i <= hi; i++) {
      sum += this.freqData[i] / 255;
    }
    return sum / (hi - lo + 1);
  }

  /**
   * Main per-frame update.
   * @param {number} dtSeconds frame delta in seconds
   * @param {number} pulseSpeed user speed multiplier for internal pulse mode
   */
  update(dtSeconds = 0.016, pulseSpeed = 1.0) {
    const dt = clamp(dtSeconds, 0.001, 0.1);
    const nowSec = performance.now() / 1000;

    if (this.mode === 'off' || !this.analyser || !this.freqData) {
      return this._updateSelfGenerating(dt, pulseSpeed);
    }

    // Resume suspended context if needed
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }

    this.analyser.getByteFrequencyData(this.freqData);

    // 1. Frequency bands
    const rawSub = this.bandEnergy(20, 70);
    const rawBass = this.bandEnergy(45, 180);
    const rawLowMids = this.bandEnergy(180, 600);
    const rawMids = this.bandEnergy(400, 2200);
    const rawHighs = this.bandEnergy(2200, 10000);
    const rawEnergy = rawBass * 0.36 + rawLowMids * 0.24 + rawMids * 0.24 + rawHighs * 0.16;

    // Spectral centroid & frequency balance (-1 warm .. +1 bright)
    let sumFreq = 0;
    let sumMag = 0;
    const nBins = this.freqData.length;
    const nyquist = this.audioCtx.sampleRate / 2;
    let spectralFlux = 0;

    for (let i = 0; i < nBins; i++) {
      const mag = this.freqData[i] / 255;
      const freq = (i / (nBins - 1)) * nyquist;
      sumFreq += freq * mag;
      sumMag += mag;

      const diff = mag - this.prevFreqData[i];
      if (diff > 0) {
        // Weight low-to-mid percussive bins slightly stronger for beat onset
        const weight = i < 40 ? 1.5 : 0.85;
        spectralFlux += diff * weight;
      }
      this.prevFreqData[i] = mag;
    }
    spectralFlux /= nBins;

    const rawCentroid = sumMag > 0.5 ? clamp((sumFreq / sumMag - 180) / 6800, 0, 1) : 0.45;
    const lowSum = rawSub + rawBass + rawLowMids * 0.5;
    const highSum = rawMids * 0.5 + rawHighs * 1.35;
    const rawBalance = lowSum + highSum > 0.02 ? clamp((highSum - lowSum) / (lowSum + highSum), -1, 1) : 0;

    // Smooth core bands
    const attack = 0.28;
    const release = 0.12;
    this.bass = lerp(this.bass, rawBass, rawBass > this.bass ? attack : release);
    this.lowMids = lerp(this.lowMids, rawLowMids, 0.2);
    this.mids = lerp(this.mids, rawMids, rawMids > this.mids ? attack : release);
    this.highs = lerp(this.highs, rawHighs, rawHighs > this.highs ? 0.32 : 0.15);
    this.energy = lerp(this.energy, rawEnergy, 0.22);
    this.centroid = lerp(this.centroid, rawCentroid, 0.16);
    this.frequencyBalance = lerp(this.frequencyBalance, rawBalance, 0.15);

    // 2. Dynamics (short vs long term energy & crest)
    this._shortEnergy = lerp(this._shortEnergy, rawEnergy, clamp(dt * 3.2, 0.01, 0.4));
    this._longEnergy = lerp(this._longEnergy, rawEnergy, clamp(dt * 0.28, 0.002, 0.08));
    if (rawEnergy > 0.035) {
      this._activeAudioTime += dt;
    } else {
      this._activeAudioTime = Math.max(0, this._activeAudioTime - dt * 0.5);
    }

    const diffEnergy = this._shortEnergy - this._longEnergy;
    this.dynamicTrend = lerp(this.dynamicTrend, clamp(diffEnergy * 4.2, -1, 1), 0.12);
    const peakInstant = Math.max(rawBass, rawMids, rawHighs);
    const crestRaw = this._longEnergy > 0.03 ? clamp((peakInstant - this._longEnergy) * 2.2, 0, 1) : 0;
    this.dynamicCrest = lerp(this.dynamicCrest, crestRaw, 0.18);

    // 3. Spectral-flux onset detection & sliding-window onset density
    this._fluxAvg = lerp(this._fluxAvg, spectralFlux, 0.08);
    if (this._onsetCooldown > 0) this._onsetCooldown -= dt;

    const fluxThreshold = Math.max(0.011, this._fluxAvg * 1.55);
    if (spectralFlux > fluxThreshold && rawEnergy > 0.045 && this._onsetCooldown <= 0) {
      const strength = clamp((spectralFlux - fluxThreshold) * 28, 0.25, 1.0);
      this.onset = Math.max(this.onset, strength);
      this._onsetCooldown = 0.13; // max ~7.5 onsets/sec
      this._onsetTimestamps.push(nowSec);
      if (this._onsetTimestamps.length > 32) {
        this._onsetTimestamps.shift();
      }
      this._estimateTempo(nowSec);
    } else {
      this.onset *= Math.pow(0.04, dt); // smooth rapid decay (~150ms)
    }

    // Prune onsets older than 8s for density calculation
    while (this._onsetTimestamps.length > 0 && nowSec - this._onsetTimestamps[0] > 8.0) {
      this._onsetTimestamps.shift();
    }
    const recent6s = this._onsetTimestamps.filter((t) => nowSec - t <= 6.0).length;
    this.onsetDensity = lerp(this.onsetDensity, recent6s / 6.0, 0.15);

    // Decay tempo confidence if beats stop arriving
    const lastOnsetAge = this._onsetTimestamps.length
      ? nowSec - this._onsetTimestamps[this._onsetTimestamps.length - 1]
      : 99;
    if (lastOnsetAge > 3.5) {
      this.tempoConfidence *= Math.pow(0.5, dt);
      this.tempoReliable = this.tempoConfidence >= 0.48;
    }

    // 4. Stereo movement (pan & width)
    this._updateStereo();

    // 5. Conservative musical section & mood estimation
    this._updateSectionAndMood();

    return this.snapshot();
  }

  _estimateTempo() {
    const ts = this._onsetTimestamps;
    if (ts.length < 6) {
      this.tempoConfidence = 0;
      this.tempoReliable = false;
      return;
    }

    // Collect inter-onset intervals between nearby beats, folded into 68..168 BPM
    const bpmCandidates = [];
    const start = Math.max(0, ts.length - 16);
    for (let i = start; i < ts.length - 1; i++) {
      for (let step = 1; step <= 2 && i + step < ts.length; step++) {
        const ioi = ts[i + step] - ts[i];
        if (ioi < 0.22 || ioi > 2.2) continue;
        let bpm = 60 / ioi;
        while (bpm < 68) bpm *= 2;
        while (bpm > 168) bpm /= 2;
        bpmCandidates.push(bpm);
      }
    }

    if (bpmCandidates.length < 5) {
      this.tempoConfidence = 0;
      this.tempoReliable = false;
      return;
    }

    // Find tightest cluster (+/- 3.5 BPM)
    let bestBpm = 120;
    let bestScore = 0;
    for (let i = 0; i < bpmCandidates.length; i++) {
      const center = bpmCandidates[i];
      let score = 0;
      let weightedSum = 0;
      for (let j = 0; j < bpmCandidates.length; j++) {
        const dist = Math.abs(bpmCandidates[j] - center);
        if (dist <= 3.8) {
          const w = 1 - dist / 4.2;
          score += w;
          weightedSum += bpmCandidates[j] * w;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestBpm = weightedSum / Math.max(0.001, score);
      }
    }

    const consistency = clamp(bestScore / (bpmCandidates.length * 0.62), 0, 1);
    this.tempoConfidence = lerp(this.tempoConfidence, consistency, 0.35);
    this.tempoReliable = this.tempoConfidence >= 0.48;
    if (this.tempoReliable) {
      this.tempoBpm = this.tempoBpm ? lerp(this.tempoBpm, bestBpm, 0.28) : bestBpm;
    }
  }

  _updateStereo() {
    if (!this.analyserL || !this.analyserR || !this.timeDataL || !this.timeDataR || this.mode === 'mic') {
      // Microphone inputs are typically mono channel 0; fall back gracefully rather than faking hard-left pan
      this.stereoPan = lerp(this.stereoPan, 0, 0.15);
      this.stereoWidth = lerp(this.stereoWidth, 0, 0.15);
      this.stereoReliable = false;
      return;
    }

    this.analyserL.getFloatTimeDomainData(this.timeDataL);
    this.analyserR.getFloatTimeDomainData(this.timeDataR);

    let sumL = 0;
    let sumR = 0;
    let sumMid = 0;
    let sumSide = 0;
    const len = this.timeDataL.length;

    for (let i = 0; i < len; i++) {
      const l = this.timeDataL[i];
      const r = this.timeDataR[i];
      sumL += l * l;
      sumR += r * r;
      const mid = (l + r) * 0.5;
      const side = (l - r) * 0.5;
      sumMid += mid * mid;
      sumSide += side * side;
    }

    const rmsL = Math.sqrt(sumL / len);
    const rmsR = Math.sqrt(sumR / len);
    const total = rmsL + rmsR;

    if (total < 0.01) {
      this.stereoReliable = false;
      this.stereoPan = lerp(this.stereoPan, 0, 0.1);
      this.stereoWidth = lerp(this.stereoWidth, 0, 0.1);
      return;
    }

    const rawPan = clamp((rmsR - rmsL) / total, -1, 1);
    const rawWidth = clamp(Math.sqrt(sumSide / Math.max(1e-6, sumMid + sumSide)) * 1.6, 0, 1);

    this.stereoPan = lerp(this.stereoPan, rawPan, 0.18);
    this.stereoWidth = lerp(this.stereoWidth, rawWidth, 0.14);
    this.stereoReliable = true;
  }

  _updateSectionAndMood() {
    // Never invent track structure when audio has just started or is near-silent
    if (this._activeAudioTime < 4.5 || this._longEnergy < 0.04) {
      this.section = 'uncertain';
      this.sectionConfidence = clamp(this._activeAudioTime / 5.0, 0, 0.35);
      this.sectionReliable = false;
      this.mood = {
        arousal: clamp(this.energy * 1.4, 0.1, 0.9),
        warmth: clamp(0.5 - this.frequencyBalance * 0.35, 0.1, 0.9),
        label: this._longEnergy < 0.025 ? 'Waiting for signal…' : 'Listening…',
        reliable: false,
      };
      return;
    }

    const arousal = clamp(this.energy * 0.65 + clamp(this.onsetDensity / 3.2, 0, 1) * 0.35, 0, 1);
    const warmth = clamp(0.5 - this.frequencyBalance * 0.42, 0, 1);

    let sec = 'groove';
    let conf = 0.56;

    if (this.energy > 0.46 && this.onsetDensity > 1.7) {
      sec = 'peak';
      conf = clamp(0.55 + (this.energy - 0.42) * 1.1, 0.55, 0.92);
    } else if (this.dynamicTrend > 0.22 && this.energy > 0.2) {
      sec = 'build';
      conf = clamp(0.5 + this.dynamicTrend * 0.6, 0.5, 0.86);
    } else if (this.dynamicTrend < -0.22 || (this.energy < 0.18 && this.onsetDensity < 0.6)) {
      sec = this._longEnergy > 0.24 ? 'breath' : 'ambient';
      conf = 0.62;
    } else if (this.onsetDensity >= 0.8) {
      sec = 'groove';
      conf = 0.6;
    } else {
      sec = 'ambient';
      conf = 0.54;
    }

    this.section = sec;
    this.sectionConfidence = lerp(this.sectionConfidence, conf, 0.12);
    this.sectionReliable = this.sectionConfidence >= 0.5;

    let moodLabel = 'Balanced Flow';
    if (arousal >= 0.66 && warmth >= 0.5) moodLabel = 'Euphoric & Warm';
    else if (arousal >= 0.66) moodLabel = 'Radiant & Kinetic';
    else if (arousal <= 0.34 && warmth >= 0.5) moodLabel = 'Warm Meditative';
    else if (arousal <= 0.34) moodLabel = 'Crystalline Ambient';
    else if (warmth >= 0.58) moodLabel = 'Deep Hypnotic';
    else moodLabel = 'Luminous Drift';

    this.mood = {
      arousal,
      warmth,
      label: moodLabel,
      reliable: this.sectionReliable,
    };
  }

  _updateSelfGenerating(dt, pulseSpeed = 1.0) {
    const s = this._self;
    const speed = clamp(pulseSpeed, 0.1, 3.0);
    s.phase += dt * s.tempoHz * speed;
    s.driftA += dt * 0.23 * speed;
    s.driftB += dt * 0.11 * speed;
    s.swellPhase += dt * 0.065 * speed;

    // Organic gentle rhythmic heartbeat without mechanical repetition
    if (s.phase >= s.nextBeat) {
      s.onsetEnv = 0.65 + Math.random() * 0.35;
      s.tempoHz = clamp(s.tempoHz + (Math.random() - 0.5) * 0.05, 0.45, 1.05);
      s.nextBeat = s.phase + (0.85 + Math.random() * 0.45);
    } else {
      s.onsetEnv *= Math.pow(0.08, dt * speed);
    }

    const macroSwell = Math.sin(s.swellPhase) * 0.5 + 0.5; // ~95s breath arc
    const waveA = Math.sin(s.phase * Math.PI * 1.5 + Math.sin(s.driftA)) * 0.5 + 0.5;
    const waveB = Math.sin(s.driftA * 1.7 + Math.cos(s.driftB * 2.1)) * 0.5 + 0.5;
    const waveC = Math.sin(s.driftB * 3.1 + 1.4) * 0.5 + 0.5;

    this.bass = 0.28 + 0.42 * waveA * (0.65 + 0.35 * macroSwell) + s.onsetEnv * 0.18;
    this.lowMids = 0.25 + 0.35 * waveB;
    this.mids = 0.24 + 0.42 * waveB * (0.7 + 0.3 * waveC);
    this.highs = 0.18 + 0.38 * waveC * (0.55 + 0.45 * macroSwell);
    this.energy = this.bass * 0.38 + this.mids * 0.36 + this.highs * 0.26;
    this.centroid = 0.32 + 0.38 * waveC;
    this.frequencyBalance = (this.highs - this.bass) * 0.65;
    this.onset = s.onsetEnv;
    this.onsetDensity = 0.55 + macroSwell * 0.5;
    this.dynamicTrend = Math.cos(s.swellPhase) * 0.45;
    this.dynamicCrest = 0.25 + s.onsetEnv * 0.4;
    this.stereoPan = Math.sin(s.driftB * 0.8) * 0.35;
    this.stereoWidth = 0.45 + 0.25 * waveB;
    this.stereoReliable = false;
    this.tempoBpm = null;
    this.tempoConfidence = 0;
    this.tempoReliable = false;
    this.section = 'uncertain';
    this.sectionConfidence = 0;
    this.sectionReliable = false;
    this.mood = {
      arousal: clamp(0.28 + macroSwell * 0.42, 0, 1),
      warmth: clamp(0.5 - this.frequencyBalance * 0.3, 0, 1),
      label: 'Internal Generative Pulse',
      reliable: false,
    };

    return this.snapshot();
  }

  snapshot() {
    return {
      mode: this.mode,
      fileName: this._fileName,
      energy: this.energy,
      bass: this.bass,
      lowMids: this.lowMids,
      mids: this.mids,
      highs: this.highs,
      centroid: this.centroid,
      frequencyBalance: this.frequencyBalance,
      onset: this.onset,
      onsetDensity: this.onsetDensity,
      dynamicTrend: this.dynamicTrend,
      dynamicCrest: this.dynamicCrest,
      stereoPan: this.stereoPan,
      stereoWidth: this.stereoWidth,
      stereoReliable: this.stereoReliable,
      tempoBpm: this.tempoReliable && this.tempoBpm ? Math.round(this.tempoBpm) : null,
      tempoConfidence: this.tempoConfidence,
      tempoReliable: this.tempoReliable,
      section: this.sectionReliable ? this.section : 'uncertain',
      sectionConfidence: this.sectionConfidence,
      sectionReliable: this.sectionReliable,
      mood: this.mood,
    };
  }
}
