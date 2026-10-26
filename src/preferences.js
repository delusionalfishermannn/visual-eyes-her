/**
 * visual-eyes-her — Personalization, Creative Controls & Accessibility Store
 *
 * Principles:
 *  - Respects user agency: persistent preference learning is OPT-IN (off by default).
 *  - Transparent, editable, and resettable at any time.
 *  - Uses localStorage ONLY when permitted (or when user explicitly clicks Save Scene).
 *  - Never stores audio, personal data, or credentials.
 */

export const AESTHETIC_FAMILIES = [
  { id: 'organic', name: 'Organic Mycelia', abstractness: 0.45, calmAffinity: 0.72 },
  { id: 'crystalline', name: 'Crystalline Geode', abstractness: 0.4, calmAffinity: 0.6 },
  { id: 'fluid', name: 'Fluid Silk & Ferro', abstractness: 0.65, calmAffinity: 0.75 },
  { id: 'celestial', name: 'Celestial Orbital', abstractness: 0.35, calmAffinity: 0.68 },
  { id: 'architectural', name: 'Architectural Portals', abstractness: 0.38, calmAffinity: 0.5 },
  { id: 'microscopic', name: 'Microscopic Radiolaria', abstractness: 0.7, calmAffinity: 0.62 },
  { id: 'landscape', name: 'Dreaming Landscape', abstractness: 0.25, calmAffinity: 0.85 },
  { id: 'geometric', name: 'Sacred Geometric', abstractness: 0.55, calmAffinity: 0.55 },
  { id: 'painterly', name: 'Painterly Nebula', abstractness: 0.82, calmAffinity: 0.78 },
  { id: 'surreal', name: 'Surreal Continuum', abstractness: 0.92, calmAffinity: 0.52 },
];

export const MOTION_STYLES = [
  { id: 'breathing', name: 'Volumetric Breathing', energy: 0.3 },
  { id: 'orbital-glide', name: 'Orbital Glide', energy: 0.5 },
  { id: 'spiral-ascension', name: 'Spiral Ascension', energy: 0.7 },
  { id: 'pendulum-sway', name: 'Pendulum Sway', energy: 0.4 },
  { id: 'kinetic-pulse', name: 'Kinetic Pulse', energy: 0.85 },
  { id: 'zero-gravity', name: 'Zero-Gravity Drift', energy: 0.22 },
];

export const PARTICLE_BEHAVIORS = [
  { id: 'orbital', name: 'Keplerian Swarms' },
  { id: 'vortex', name: 'Spiral Vortex' },
  { id: 'updraft', name: 'Luminous Updraft' },
  { id: 'curl', name: 'Turbulent Curl Flock' },
  { id: 'radial', name: 'Harmonic Bloom Shells' },
  { id: 'dust', name: 'Suspended Starlight' },
];

export const TRANSITION_TYPES = [
  { id: 'morph-dissolve', name: 'Morph Dissolve' },
  { id: 'nebula-veil', name: 'Nebula Veil' },
  { id: 'harmonic-bloom', name: 'Harmonic Crest' },
  { id: 'radial-iris', name: 'Spatial Iris' },
];

const STORAGE_CONSENT_KEY = 'veh_learning_consent_v1';
const STORAGE_PROFILE_KEY = 'veh_learned_profile_v1';
const STORAGE_SCENES_KEY = 'veh_saved_scenes_v1';

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function createDefaultControls() {
  return {
    intensity: 1.0,
    novelty: 0.65,
    motion: 1.0,
    detail: 1.0,
    brightness: 0.9,
    colorRange: 0.85,
    density: 0.9,
    reactivity: 1.0,
    pulseSpeed: 1.0,
  };
}

export function createDefaultAccessibility() {
  const prefersReduced =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return {
    calmMode: false,
    reducedMotion: Boolean(prefersReduced),
    reducedFlashes: false,
    lowerBrightness: false,
    colorBlindSafe: false,
  };
}

export function createDefaultLearned() {
  const familyWeights = {};
  AESTHETIC_FAMILIES.forEach((f) => {
    familyWeights[f.id] = 0;
  });
  return {
    familyWeights,
    paletteWeights: {},
    motionWeights: {},
    biases: {
      energy: 0,       // -1 calmer .. +1 more energetic
      brightness: 0,   // -1 dimmer .. +1 brighter
      abstraction: 0,  // -1 grounded .. +1 abstract/surreal
    },
    interactionsCount: 0,
  };
}

export class PreferencesManager {
  constructor() {
    this.automationMode = 'adaptive'; // 'manual' | 'guided' | 'adaptive' | 'autonomous'
    this.controls = createDefaultControls();
    this.accessibility = createDefaultAccessibility();
    this.learned = createDefaultLearned();
    this.savedScenes = [];
    this.learningConsent = false;
    this._listeners = new Set();

    this._loadFromLocal();
  }

  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _emit(reason = 'update') {
    this._saveToLocal();
    this._listeners.forEach((fn) => {
      try { fn(this, reason); } catch (_) {}
    });
  }

  _loadFromLocal() {
    try {
      const consentRaw = localStorage.getItem(STORAGE_CONSENT_KEY);
      this.learningConsent = consentRaw === 'true';

      if (this.learningConsent) {
        const raw = localStorage.getItem(STORAGE_PROFILE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.controls) Object.assign(this.controls, parsed.controls);
          if (parsed.accessibility) Object.assign(this.accessibility, parsed.accessibility);
          if (parsed.automationMode) this.automationMode = parsed.automationMode;
          if (parsed.learned) {
            if (parsed.learned.familyWeights) {
              Object.assign(this.learned.familyWeights, parsed.learned.familyWeights);
            }
            if (parsed.learned.paletteWeights) {
              Object.assign(this.learned.paletteWeights, parsed.learned.paletteWeights);
            }
            if (parsed.learned.motionWeights) {
              Object.assign(this.learned.motionWeights, parsed.learned.motionWeights);
            }
            if (parsed.learned.biases) {
              Object.assign(this.learned.biases, parsed.learned.biases);
            }
            this.learned.interactionsCount = parsed.learned.interactionsCount || 0;
          }
        }
      }

      const savedRaw = localStorage.getItem(STORAGE_SCENES_KEY);
      if (savedRaw) {
        const list = JSON.parse(savedRaw);
        if (Array.isArray(list)) this.savedScenes = list.slice(0, 24);
      }
    } catch (_) {
      // Graceful fallback if storage is blocked (e.g., strict private browsing)
    }
  }

  _saveToLocal() {
    try {
      localStorage.setItem(STORAGE_CONSENT_KEY, this.learningConsent ? 'true' : 'false');
      if (this.learningConsent) {
        const payload = {
          automationMode: this.automationMode,
          controls: this.controls,
          accessibility: this.accessibility,
          learned: this.learned,
        };
        localStorage.setItem(STORAGE_PROFILE_KEY, JSON.stringify(payload));
      } else {
        localStorage.removeItem(STORAGE_PROFILE_KEY);
      }
    } catch (_) {}
  }

  _saveScenesToLocal() {
    try {
      localStorage.setItem(STORAGE_SCENES_KEY, JSON.stringify(this.savedScenes));
    } catch (_) {}
  }

  setLearningConsent(allowed) {
    this.learningConsent = Boolean(allowed);
    this._emit('consent');
  }

  setAutomationMode(mode) {
    if (['manual', 'guided', 'adaptive', 'autonomous'].includes(mode)) {
      this.automationMode = mode;
      this._emit('automation');
    }
  }

  setControl(key, value) {
    if (!(key in this.controls)) return;
    const limits = {
      intensity: [0, 2],
      novelty: [0, 1],
      motion: [0, 2],
      detail: [0.1, 1.5],
      brightness: [0.2, 1.5],
      colorRange: [0.1, 1.2],
      density: [0.1, 1.5],
      reactivity: [0, 2],
      pulseSpeed: [0.2, 2.5],
    };
    const [lo, hi] = limits[key] || [0, 2];
    this.controls[key] = clamp(Number(value), lo, hi);
    this._emit('control');
  }

  setAccessibility(key, value) {
    if (!(key in this.accessibility)) return;
    this.accessibility[key] = Boolean(value);
    if (key === 'calmMode' && this.accessibility.calmMode) {
      // Calm mode gently softens intensity & flashes while remaining vivid
      this.controls.intensity = Math.min(this.controls.intensity, 0.75);
      this.controls.motion = Math.min(this.controls.motion, 0.6);
    }
    this._emit('accessibility');
  }

  /**
   * Effective runtime controls after applying Calm Mode & Accessibility guardrails.
   */
  getEffectiveControls() {
    const c = { ...this.controls };
    const a = this.accessibility;

    if (a.calmMode) {
      c.intensity = Math.min(c.intensity, 0.78);
      c.motion *= 0.55;
      c.reactivity *= 0.6;
      c.density *= 0.78;
    }
    if (a.reducedMotion) {
      c.motion *= 0.18;
    }
    if (a.lowerBrightness) {
      c.brightness = Math.min(c.brightness, 0.62);
    }
    return c;
  }

  /**
   * Explicit user feedback actions:
   * 'like' | 'skip' | 'calmer' | 'brighter' | 'moreAbstract' | 'moreEnergetic'
   */
  recordSteering(action, currentRecipe = null, timeInScene = 10) {
    this.learned.interactionsCount++;

    if (action === 'like' && currentRecipe) {
      const f = currentRecipe.family;
      const p = currentRecipe.palette;
      const m = currentRecipe.motionStyle;
      if (f) this.learned.familyWeights[f] = clamp((this.learned.familyWeights[f] || 0) + 0.25, -1, 1);
      if (p) this.learned.paletteWeights[p] = clamp((this.learned.paletteWeights[p] || 0) + 0.22, -1, 1);
      if (m) this.learned.motionWeights[m] = clamp((this.learned.motionWeights[m] || 0) + 0.18, -1, 1);
    } else if (action === 'skip' && currentRecipe) {
      // Only down-weight slightly if user skipped early in the scene
      const penalty = timeInScene < 12 ? 0.18 : 0.06;
      const f = currentRecipe.family;
      const p = currentRecipe.palette;
      if (f) this.learned.familyWeights[f] = clamp((this.learned.familyWeights[f] || 0) - penalty, -1, 1);
      if (p) this.learned.paletteWeights[p] = clamp((this.learned.paletteWeights[p] || 0) - penalty * 0.7, -1, 1);
    } else if (action === 'calmer') {
      this.controls.motion = clamp(this.controls.motion - 0.18, 0.1, 2);
      this.controls.intensity = clamp(this.controls.intensity - 0.14, 0.15, 2);
      this.controls.reactivity = clamp(this.controls.reactivity - 0.14, 0, 2);
      this.learned.biases.energy = clamp(this.learned.biases.energy - 0.2, -1, 1);
    } else if (action === 'brighter') {
      this.accessibility.lowerBrightness = false;
      this.controls.brightness = clamp(this.controls.brightness + 0.16, 0.2, 1.5);
      this.learned.biases.brightness = clamp(this.learned.biases.brightness + 0.2, -1, 1);
    } else if (action === 'moreAbstract') {
      this.controls.novelty = clamp(this.controls.novelty + 0.14, 0, 1);
      this.controls.detail = clamp(this.controls.detail + 0.12, 0.1, 1.5);
      this.learned.biases.abstraction = clamp(this.learned.biases.abstraction + 0.25, -1, 1);
    } else if (action === 'moreEnergetic') {
      this.accessibility.calmMode = false;
      this.controls.intensity = clamp(this.controls.intensity + 0.18, 0.1, 2);
      this.controls.motion = clamp(this.controls.motion + 0.18, 0.1, 2);
      this.controls.reactivity = clamp(this.controls.reactivity + 0.16, 0, 2);
      this.learned.biases.energy = clamp(this.learned.biases.energy + 0.22, -1, 1);
    }

    this._emit('steering');
  }

  /** Direct user editing of learned weights (transparency & editability). */
  setFamilyWeight(familyId, weight) {
    if (familyId in this.learned.familyWeights) {
      this.learned.familyWeights[familyId] = clamp(Number(weight), -1, 1);
      this._emit('edit-learned');
    }
  }

  setBias(biasKey, weight) {
    if (biasKey in this.learned.biases) {
      this.learned.biases[biasKey] = clamp(Number(weight), -1, 1);
      this._emit('edit-learned');
    }
  }

  resetLearned() {
    this.learned = createDefaultLearned();
    try { localStorage.removeItem(STORAGE_PROFILE_KEY); } catch (_) {}
    this._emit('reset-learned');
  }

  resetControls() {
    this.controls = createDefaultControls();
    this._emit('reset-controls');
  }

  saveSceneSnapshot(recipe, customName = '') {
    const familyObj = AESTHETIC_FAMILIES.find((f) => f.id === recipe.family);
    const label = customName || `${familyObj ? familyObj.name : recipe.family} · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const entry = {
      id: `scene_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: label,
      recipe: {
        family: recipe.family,
        secondaryFamily: recipe.secondaryFamily || null,
        palette: recipe.palette,
        motionStyle: recipe.motionStyle,
        particleBehavior: recipe.particleBehavior,
      },
      controls: { ...this.controls },
    };
    this.savedScenes.unshift(entry);
    if (this.savedScenes.length > 20) this.savedScenes.pop();
    this._saveScenesToLocal();
    this._emit('save-scene');
    return entry;
  }

  deleteSavedScene(id) {
    this.savedScenes = this.savedScenes.filter((s) => s.id !== id);
    this._saveScenesToLocal();
    this._emit('delete-scene');
  }
}
