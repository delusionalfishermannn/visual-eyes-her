/**
 * visual-eyes-her — Adaptive Experience Director & Automatic Scene Composer
 *
 * Implements:
 *  - Living Visual Arc: Introduce → Develop → Transform/Combine → Peak → Breathing Room
 *  - Visual History tracking (avoids repetition, stagnation, and abrupt cuts)
 *  - Multi-factor scoring across audio features, novelty, accessibility, and user preferences
 *  - 4 Automation Levels: Manual, Guided, Adaptive, Autonomous
 *  - Live "What's Changing" telemetry + instant user overrides & axis locks
 */

import {
  AESTHETIC_FAMILIES,
  MOTION_STYLES,
  PARTICLE_BEHAVIORS,
  TRANSITION_TYPES,
} from './preferences.js';
import { getAvailablePalettes, getPaletteById } from './palettes.js';

const ARC_PHASES = [
  { id: 'introduce', label: 'Introduce', baseDuration: 15, arcIntensity: 0.78 },
  { id: 'develop', label: 'Develop', baseDuration: 18, arcIntensity: 0.95 },
  { id: 'transform', label: 'Transform & Blend', baseDuration: 16, arcIntensity: 1.05 },
  { id: 'peak', label: 'Peak Radiance', baseDuration: 13, arcIntensity: 1.22 },
  { id: 'breathing', label: 'Breathing Room', baseDuration: 14, arcIntensity: 0.65 },
];

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export class ExperienceDirector {
  constructor(prefs) {
    this.prefs = prefs;

    // Active scene recipe
    this.recipe = {
      family: 'celestial',
      prevFamily: null,
      secondaryFamily: null,
      palette: 'cosmic-transcendence',
      motionStyle: 'orbital-glide',
      particleBehavior: 'orbital',
      transitionType: 'morph-dissolve',
    };

    // User instant-override locks (any axis can be pinned)
    this.locks = {
      family: false,
      palette: false,
      motionStyle: false,
      particleBehavior: false,
    };

    // Transition & Arc state
    this.arcIndex = 0;
    this.phaseTimer = 0;
    this.phaseDuration = 15;
    this.sceneElapsed = 0;

    this.transitionProgress = 1.0; // 0..1
    this.transitionDuration = 5.5;
    this.secondaryWeight = 0.0;

    // Recent visual history to prevent obvious repetition
    this.history = {
      families: ['celestial'],
      palettes: ['cosmic-transcendence'],
      motions: ['orbital-glide'],
      particles: ['orbital'],
    };

    // Transparent narrative of what the engine is doing right now
    this.currentAction = 'Introducing Celestial Orbital in Cosmic Transcendence';
    this.recentChanges = [this.currentAction];

    // Enforce color-blind safe palette immediately if active on boot
    if (this.prefs.accessibility.colorBlindSafe) {
      const safe = getAvailablePalettes(true);
      if (safe.length && !getPaletteById(this.recipe.palette).colorBlindSafe) {
        this.recipe.palette = safe[0].id;
      }
    }
  }

  _recordHistory(key, value, maxLen = 6) {
    const arr = this.history[key];
    if (!arr) return;
    if (arr[arr.length - 1] !== value) {
      arr.push(value);
      if (arr.length > maxLen) arr.shift();
    }
  }

  _announce(text) {
    this.currentAction = text;
    if (this.recentChanges[0] !== text) {
      this.recentChanges.unshift(text);
      if (this.recentChanges.length > 5) this.recentChanges.pop();
    }
  }

  get currentArcPhase() {
    return ARC_PHASES[this.arcIndex] || ARC_PHASES[0];
  }

  /**
   * Instant user overrides (always respected immediately, in any automation mode).
   */
  overrideFamily(familyId, pinLock = false) {
    if (!AESTHETIC_FAMILIES.some((f) => f.id === familyId)) return;
    if (pinLock) this.locks.family = true;
    if (this.recipe.family === familyId) return;

    this.recipe.prevFamily = this.recipe.family;
    this.recipe.family = familyId;
    this.recipe.secondaryFamily = null;
    this.transitionProgress = 0.0;
    this.transitionDuration = 3.2;
    this.sceneElapsed = 0;
    this._recordHistory('families', familyId, 6);

    const fObj = AESTHETIC_FAMILIES.find((f) => f.id === familyId);
    this._announce(`User selected focal motif → ${fObj ? fObj.name : familyId}`);
  }

  overridePalette(paletteId, pinLock = false) {
    const p = getPaletteById(paletteId);
    if (!p) return;
    if (pinLock) this.locks.palette = true;
    this.recipe.palette = p.id;
    this._recordHistory('palettes', p.id, 5);
    this._announce(`Palette shifted → ${p.name}`);
  }

  overrideMotionStyle(motionId, pinLock = false) {
    const m = MOTION_STYLES.find((x) => x.id === motionId);
    if (!m) return;
    if (pinLock) this.locks.motionStyle = true;
    this.recipe.motionStyle = m.id;
    this._recordHistory('motions', m.id, 4);
    this._announce(`Motion style → ${m.name}`);
  }

  overrideParticleBehavior(behaviorId, pinLock = false) {
    const b = PARTICLE_BEHAVIORS.find((x) => x.id === behaviorId);
    if (!b) return;
    if (pinLock) this.locks.particleBehavior = true;
    this.recipe.particleBehavior = b.id;
    this._recordHistory('particles', b.id, 4);
    this._announce(`Particles → ${b.name}`);
  }

  toggleLock(key) {
    if (key in this.locks) {
      this.locks[key] = !this.locks[key];
      this._announce(`${key} ${this.locks[key] ? 'pinned by user' : 'unlocked for composer'}`);
    }
  }

  applySavedScene(savedEntry) {
    if (!savedEntry || !savedEntry.recipe) return;
    const r = savedEntry.recipe;
    if (r.family && r.family !== this.recipe.family) {
      this.recipe.prevFamily = this.recipe.family;
      this.recipe.family = r.family;
      this.transitionProgress = 0.0;
      this.transitionDuration = 3.5;
    }
    this.recipe.secondaryFamily = r.secondaryFamily || null;
    if (r.palette) this.recipe.palette = r.palette;
    if (r.motionStyle) this.recipe.motionStyle = r.motionStyle;
    if (r.particleBehavior) this.recipe.particleBehavior = r.particleBehavior;
    if (savedEntry.controls) {
      Object.entries(savedEntry.controls).forEach(([k, v]) => this.prefs.setControl(k, v));
    }
    this.sceneElapsed = 0;
    this._announce(`Recalled saved scene: "${savedEntry.name}"`);
  }

  /**
   * User clicked Skip (or composer triggered next full chapter).
   */
  skipToFreshScene(audio, isUserSkip = true) {
    if (isUserSkip) {
      this.prefs.recordSteering('skip', this.recipe, this.sceneElapsed);
    }
    this.arcIndex = 0;
    this.phaseTimer = 0;
    this._composeNextChapter(audio, isUserSkip);
  }

  _scoreFamilyCandidate(fam, audio) {
    // Penalize recently shown families strongly to avoid repetition
    const recencyIdx = this.history.families.lastIndexOf(fam.id);
    let score = 1.0;
    if (fam.id === this.recipe.family) score -= 2.5;
    else if (recencyIdx >= 0) {
      const stepsAgo = this.history.families.length - 1 - recencyIdx;
      score -= Math.max(0.15, 1.25 - stepsAgo * 0.28);
    }

    const novelty = this.prefs.controls.novelty;
    const learnedW = this.prefs.learned.familyWeights[fam.id] || 0;
    const biases = this.prefs.learned.biases;

    // Balance learned preference vs novelty exploration
    score += learnedW * (1.15 - novelty * 0.55);

    // Abstraction bias alignment
    score += (fam.abstractness - 0.5) * biases.abstraction * 0.85;

    // Calm mode & energy alignment
    if (this.prefs.accessibility.calmMode || biases.energy < -0.25) {
      score += fam.calmAffinity * 0.65;
    }

    // Audio mood alignment when signal is reliable
    if (audio && audio.mood && audio.mood.reliable) {
      if (audio.mood.arousal > 0.62) {
        if (['crystalline', 'celestial', 'geometric', 'surreal'].includes(fam.id)) score += 0.35;
      } else if (audio.mood.arousal < 0.38) {
        if (['organic', 'fluid', 'landscape', 'painterly'].includes(fam.id)) score += 0.35;
      }
    }

    // Controlled stochastic exploration scaled by novelty
    score += (Math.random() - 0.3) * (0.35 + novelty * 0.85);
    return score;
  }

  _pickBestFamily(audio, excludeId = null) {
    let best = AESTHETIC_FAMILIES[0];
    let bestScore = -999;
    for (const fam of AESTHETIC_FAMILIES) {
      if (fam.id === excludeId) continue;
      const s = this._scoreFamilyCandidate(fam, audio);
      if (s > bestScore) {
        bestScore = s;
        best = fam;
      }
    }
    return best;
  }

  _pickBestPalette(audio) {
    const candidates = getAvailablePalettes(this.prefs.accessibility.colorBlindSafe);
    const novelty = this.prefs.controls.novelty;
    const biases = this.prefs.learned.biases;

    let best = candidates[0];
    let bestScore = -999;

    for (const pal of candidates) {
      let score = 1.0;
      if (pal.id === this.recipe.palette && candidates.length > 1) score -= 1.8;
      const recIdx = this.history.palettes.lastIndexOf(pal.id);
      if (recIdx >= 0) {
        const stepsAgo = this.history.palettes.length - 1 - recIdx;
        score -= Math.max(0.1, 0.9 - stepsAgo * 0.25);
      }

      const learnedW = this.prefs.learned.paletteWeights[pal.id] || 0;
      score += learnedW * (1.0 - novelty * 0.45);

      if (this.prefs.accessibility.calmMode || biases.energy < -0.2) {
        score += pal.calm * 0.5;
      }
      if (audio && audio.mood && audio.mood.reliable) {
        score += (1 - Math.abs(pal.warmth - audio.mood.warmth)) * 0.35;
      }
      score += (Math.random() - 0.3) * (0.3 + novelty * 0.7);

      if (score > bestScore) {
        bestScore = score;
        best = pal;
      }
    }
    return best;
  }

  _pickMotionStyle(audio, phaseId) {
    const calm = this.prefs.accessibility.calmMode;
    const targetEnergy =
      phaseId === 'breathing'
        ? 0.22
        : phaseId === 'peak'
          ? 0.8
          : audio && audio.mood && audio.mood.reliable
            ? audio.mood.arousal
            : 0.48 + this.prefs.learned.biases.energy * 0.25;

    let best = MOTION_STYLES[0];
    let bestScore = -999;

    for (const m of MOTION_STYLES) {
      let s = 1.0 - Math.abs(m.energy - (calm ? 0.25 : targetEnergy));
      if (m.id === this.recipe.motionStyle) s -= 0.45;
      s += (this.prefs.learned.motionWeights[m.id] || 0) * 0.5;
      s += Math.random() * 0.35;
      if (s > bestScore) {
        bestScore = s;
        best = m;
      }
    }
    return best;
  }

  _pickParticleBehavior(phaseId) {
    if (phaseId === 'breathing' || this.prefs.accessibility.calmMode) {
      return Math.random() < 0.6 ? PARTICLE_BEHAVIORS[5] : PARTICLE_BEHAVIORS[0]; // dust or gentle orbital
    }
    const pool = PARTICLE_BEHAVIORS.filter((b) => b.id !== this.recipe.particleBehavior);
    return pool[Math.floor(Math.random() * pool.length)] || PARTICLE_BEHAVIORS[0];
  }

  _composeNextChapter(audio, forceSwitch = false) {
    const mode = this.prefs.automationMode;
    const changes = [];

    // Pick transition style
    const tType = TRANSITION_TYPES[Math.floor(Math.random() * TRANSITION_TYPES.length)];
    this.recipe.transitionType = tType.id;

    // Focal motif selection (Guided holds focal unless user explicitly skipped)
    if ((!this.locks.family && (mode === 'adaptive' || mode === 'autonomous')) || forceSwitch) {
      if (!this.locks.family || forceSwitch) {
        const nextFam = this._pickBestFamily(audio, this.recipe.family);
        this.recipe.prevFamily = this.recipe.family;
        this.recipe.family = nextFam.id;
        this.transitionProgress = 0.0;
        this.transitionDuration = forceSwitch ? 3.4 : 6.0;
        this.sceneElapsed = 0;
        this._recordHistory('families', nextFam.id, 6);
        changes.push(nextFam.name);
      }
    }

    this.recipe.secondaryFamily = null;

    if (!this.locks.palette || forceSwitch) {
      const nextPal = this._pickBestPalette(audio);
      this.recipe.palette = nextPal.id;
      this._recordHistory('palettes', nextPal.id, 5);
      changes.push(nextPal.name);
    }

    if (!this.locks.motionStyle) {
      const nextMot = this._pickMotionStyle(audio, 'introduce');
      this.recipe.motionStyle = nextMot.id;
      this._recordHistory('motions', nextMot.id, 4);
    }

    if (!this.locks.particleBehavior) {
      const nextPart = this._pickParticleBehavior('introduce');
      this.recipe.particleBehavior = nextPart.id;
      this._recordHistory('particles', nextPart.id, 4);
    }

    if (changes.length) {
      this._announce(`Composed → ${changes.join(' · ')} (${tType.name})`);
    }
  }

  _advanceArcPhase(audio) {
    const mode = this.prefs.automationMode;
    if (mode === 'manual') return;

    this.arcIndex = (this.arcIndex + 1) % ARC_PHASES.length;
    this.phaseTimer = 0;
    const phase = this.currentArcPhase;

    // Compute organic phase duration (shorter when novelty/tempo is brisk, longer in calm mode)
    const noveltyFactor = 1.15 - this.prefs.controls.novelty * 0.35;
    const calmFactor = this.prefs.accessibility.calmMode ? 1.35 : 1.0;
    this.phaseDuration = phase.baseDuration * noveltyFactor * calmFactor;

    if (phase.id === 'introduce') {
      this._composeNextChapter(audio, false);
    } else if (phase.id === 'develop') {
      if (!this.locks.palette && Math.random() < 0.65) {
        const pal = this._pickBestPalette(audio);
        this.recipe.palette = pal.id;
        this._recordHistory('palettes', pal.id, 5);
        this._announce(`Developing motif · Palette drifting → ${pal.name}`);
      } else {
        this._announce(`Developing focal details & harmonic motion`);
      }
    } else if (phase.id === 'transform') {
      // Introduce a subtle harmonic secondary motif (keeps focal centerpiece clear!)
      if (mode === 'adaptive' || mode === 'autonomous') {
        const sec = this._pickBestFamily(audio, this.recipe.family);
        this.recipe.secondaryFamily = sec.id;
        if (!this.locks.particleBehavior) {
          const pb = this._pickParticleBehavior('transform');
          this.recipe.particleBehavior = pb.id;
        }
        this._announce(`Blending subtle ${sec.name} halo around focal motif`);
      } else {
        this._announce(`Guided transformation · Deepening light & particles`);
      }
    } else if (phase.id === 'peak') {
      if (!this.locks.motionStyle && !this.prefs.accessibility.calmMode) {
        const m = this._pickMotionStyle(audio, 'peak');
        this.recipe.motionStyle = m.id;
      }
      this._announce(`Arc Peak · Full harmonic bloom & expansion`);
    } else if (phase.id === 'breathing') {
      // Clear secondary layer so negative space & serenity open up
      this.recipe.secondaryFamily = null;
      if (!this.locks.motionStyle) {
        const m = this._pickMotionStyle(audio, 'breathing');
        this.recipe.motionStyle = m.id;
      }
      if (!this.locks.particleBehavior) {
        const pb = this._pickParticleBehavior('breathing');
        this.recipe.particleBehavior = pb.id;
      }
      this._announce(`Visual breathing room · Spacious calm drift`);
    }
  }

  /**
   * Main per-frame director update.
   */
  update(dt, audio) {
    this.sceneElapsed += dt;

    // Enforce color-vision-safe palette immediately if user toggles accessibility
    if (this.prefs.accessibility.colorBlindSafe) {
      const curPal = getPaletteById(this.recipe.palette);
      if (!curPal.colorBlindSafe) {
        const nextSafe = this._pickBestPalette(audio);
        this.recipe.palette = nextSafe.id;
        this._announce(`Switched to CVD-safe palette → ${nextSafe.name}`);
      }
    }

    // Advance transition progress
    if (this.transitionProgress < 1.0) {
      this.transitionProgress = Math.min(1.0, this.transitionProgress + dt / this.transitionDuration);
      if (this.transitionProgress >= 1.0) {
        this.recipe.prevFamily = null;
      }
    }

    // Smooth secondary blend weight (only active during transform/peak, capped at 0.30 for focal clarity)
    const phase = this.currentArcPhase;
    const targetSecWeight =
      this.recipe.secondaryFamily && (phase.id === 'transform' || phase.id === 'peak')
        ? phase.id === 'transform'
          ? 0.28
          : 0.22
        : 0.0;
    this.secondaryWeight += (targetSecWeight - this.secondaryWeight) * Math.min(1, dt * 0.9);

    // Automation progression
    if (this.prefs.automationMode !== 'manual') {
      this.phaseTimer += dt;

      // Musical section coupling (conservative: only nudge arc when section confidence is reliable)
      if (
        (this.prefs.automationMode === 'adaptive' || this.prefs.automationMode === 'autonomous') &&
        audio &&
        audio.sectionReliable &&
        this.phaseTimer > 6.5
      ) {
        if (audio.section === 'peak' && phase.id !== 'peak') {
          this.arcIndex = 2; // step into peak
          this._advanceArcPhase(audio);
        } else if (audio.section === 'breath' && phase.id === 'peak') {
          this._advanceArcPhase(audio); // step gracefully into breathing room
        }
      }

      if (this.phaseTimer >= this.phaseDuration) {
        this._advanceArcPhase(audio);
      }
    }

    return {
      recipe: this.recipe,
      locks: this.locks,
      arcPhase: this.currentArcPhase,
      arcProgress: clamp(this.phaseTimer / Math.max(1, this.phaseDuration), 0, 1),
      transitionProgress: this.transitionProgress,
      secondaryWeight: this.secondaryWeight,
      currentAction: this.currentAction,
      recentChanges: this.recentChanges,
    };
  }
}
