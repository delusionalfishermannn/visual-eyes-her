import * as THREE from 'three';

/**
 * Curated palette library for Visual Eyes Her.
 * Every palette guarantees a luminous, non-black atmospheric base,
 * rich focal colors, and metadata for mood/accessibility matching.
 */
export const PALETTES = [
  {
    id: 'cosmic-transcendence',
    name: 'Cosmic Transcendence',
    colorBlindSafe: false,
    warmth: 0.45,
    calm: 0.5,
    bgDeep: '#12082b',
    bgMid: '#2a1259',
    primary: '#9d4edd',
    secondary: '#00f5d4',
    accent: '#ffd166',
    highlight: '#f7c6db',
  },
  {
    id: 'molten-aurora',
    name: 'Molten Aurora',
    colorBlindSafe: false,
    warmth: 0.72,
    calm: 0.35,
    bgDeep: '#190b28',
    bgMid: '#3c1642',
    primary: '#ff6b6b',
    secondary: '#ffd166',
    accent: '#4ecdc4',
    highlight: '#fff1d0',
  },
  {
    id: 'biolume-abyss',
    name: 'Bioluminescent Sea',
    colorBlindSafe: true,
    warmth: 0.22,
    calm: 0.8,
    bgDeep: '#07192e',
    bgMid: '#0f3457',
    primary: '#00e5ff',
    secondary: '#38b6ff',
    accent: '#ffe066',
    highlight: '#c8fbff',
  },
  {
    id: 'rose-nebula',
    name: 'Rose Quartz Nebula',
    colorBlindSafe: false,
    warmth: 0.68,
    calm: 0.75,
    bgDeep: '#1d0d26',
    bgMid: '#3d1c47',
    primary: '#f4a2c8',
    secondary: '#b892ff',
    accent: '#ffc87c',
    highlight: '#ffeaf4',
  },
  {
    id: 'prismatic-dawn',
    name: 'Prismatic Dawn',
    colorBlindSafe: false,
    warmth: 0.6,
    calm: 0.45,
    bgDeep: '#141133',
    bgMid: '#2d2669',
    primary: '#7b61ff',
    secondary: '#ff7eb3',
    accent: '#48cae4',
    highlight: '#ffe8a3',
  },
  {
    id: 'velvet-solstice',
    name: 'Solaris Gold & Indigo',
    colorBlindSafe: true,
    warmth: 0.78,
    calm: 0.55,
    bgDeep: '#10142e',
    bgMid: '#222b59',
    primary: '#ffb703',
    secondary: '#fb8500',
    accent: '#64dfdf',
    highlight: '#fff3c4',
  },
  {
    id: 'emerald-ether',
    name: 'Sylvan Ether',
    colorBlindSafe: false,
    warmth: 0.38,
    calm: 0.7,
    bgDeep: '#091f24',
    bgMid: '#133c42',
    primary: '#2ec4b6',
    secondary: '#80ed99',
    accent: '#ffd166',
    highlight: '#e0fbfc',
  },
  {
    id: 'cividis-dream',
    name: 'Cividis Harmonic (CVD Safe)',
    colorBlindSafe: true,
    warmth: 0.5,
    calm: 0.85,
    bgDeep: '#0c1d36',
    bgMid: '#1f385c',
    primary: '#4c72b0',
    secondary: '#ddaa33',
    accent: '#f4e04d',
    highlight: '#fff7cc',
  },
  {
    id: 'okabe-starlight',
    name: 'Okabe Starlight (CVD Safe)',
    colorBlindSafe: true,
    warmth: 0.52,
    calm: 0.6,
    bgDeep: '#0d1829',
    bgMid: '#1a2f4d',
    primary: '#56b4e9',
    secondary: '#e69f00',
    accent: '#cc79a7',
    highlight: '#f0f7ff',
  },
  {
    id: 'viridis-canopy',
    name: 'Viridis Canopy (CVD Safe)',
    colorBlindSafe: true,
    warmth: 0.42,
    calm: 0.65,
    bgDeep: '#190e2e',
    bgMid: '#2a3d59',
    primary: '#21918c',
    secondary: '#5ec962',
    accent: '#fde725',
    highlight: '#f6ffbd',
  },
];

export function getPaletteById(id) {
  return PALETTES.find((p) => p.id === id) || PALETTES[0];
}

export function getAvailablePalettes(colorBlindSafeOnly = false) {
  if (!colorBlindSafeOnly) return PALETTES;
  return PALETTES.filter((p) => p.colorBlindSafe);
}

/**
 * Smoothly interpolates between palettes and applies user colorRange,
 * brightness, and accessibility constraints with zero abrupt jumps.
 */
export class PaletteBlender {
  constructor(initialId = 'cosmic-transcendence') {
    const p = getPaletteById(initialId);
    this.currentId = p.id;
    this.targetId = p.id;
    this.transition = 1.0;
    this.transitionDuration = 5.5;

    this._from = this._parsePalette(p);
    this._to = this._parsePalette(p);

    this.colors = {
      bgDeep: this._from.bgDeep.clone(),
      bgMid: this._from.bgMid.clone(),
      primary: this._from.primary.clone(),
      secondary: this._from.secondary.clone(),
      accent: this._from.accent.clone(),
      highlight: this._from.highlight.clone(),
    };

    this._driftPhase = 0;
  }

  _parsePalette(p) {
    return {
      bgDeep: new THREE.Color(p.bgDeep),
      bgMid: new THREE.Color(p.bgMid),
      primary: new THREE.Color(p.primary),
      secondary: new THREE.Color(p.secondary),
      accent: new THREE.Color(p.accent),
      highlight: new THREE.Color(p.highlight),
    };
  }

  setTarget(paletteId, duration = 5.5) {
    const p = getPaletteById(paletteId);
    if (p.id === this.targetId && this.transition >= 1.0) return;

    // Snapshot current blended colors as the new start point so mid-transition retargeting is seamless
    this._from = {
      bgDeep: this.colors.bgDeep.clone(),
      bgMid: this.colors.bgMid.clone(),
      primary: this.colors.primary.clone(),
      secondary: this.colors.secondary.clone(),
      accent: this.colors.accent.clone(),
      highlight: this.colors.highlight.clone(),
    };
    this._to = this._parsePalette(p);
    this.targetId = p.id;
    this.currentId = p.id;
    this.transition = 0.0;
    this.transitionDuration = Math.max(0.8, duration);
  }

  update(dt, { colorRange = 0.75, brightness = 0.7, lowerBrightness = false, centroid = 0.5 } = {}) {
    if (this.transition < 1.0) {
      this.transition = Math.min(1.0, this.transition + dt / this.transitionDuration);
    }
    // Smooth cosine ease
    const t = 0.5 - 0.5 * Math.cos(this.transition * Math.PI);

    this._driftPhase += dt * (0.12 + centroid * 0.18);
    const drift = Math.sin(this._driftPhase) * 0.5 + 0.5;

    this.colors.bgDeep.lerpColors(this._from.bgDeep, this._to.bgDeep, t);
    this.colors.bgMid.lerpColors(this._from.bgMid, this._to.bgMid, t);
    this.colors.primary.lerpColors(this._from.primary, this._to.primary, t);
    this.colors.secondary.lerpColors(this._from.secondary, this._to.secondary, t);
    this.colors.accent.lerpColors(this._from.accent, this._to.accent, t);
    this.colors.highlight.lerpColors(this._from.highlight, this._to.highlight, t);

    // Apply colorRange: at low colorRange, secondary & accent pull closer to primary
    const rangeClamp = Math.max(0.05, Math.min(1.2, colorRange));
    if (rangeClamp < 1.0) {
      this.colors.secondary.lerp(this.colors.primary, 1.0 - rangeClamp);
      this.colors.accent.lerp(this.colors.primary, (1.0 - rangeClamp) * 0.85);
    } else if (rangeClamp > 1.0) {
      // Slight gentle harmonic drift toward accent when wide color range is requested
      this.colors.secondary.lerp(this.colors.accent, (rangeClamp - 1.0) * 0.35 * drift);
    }

    // Brightness & accessibility cap
    const maxBright = lowerBrightness ? 0.68 : 1.35;
    const lumScale = Math.min(maxBright, 0.45 + brightness * 0.85);

    this.colors.bgDeep.multiplyScalar(Math.min(1.25, lumScale * 0.95));
    this.colors.bgMid.multiplyScalar(Math.min(1.3, lumScale));
    this.colors.primary.multiplyScalar(lumScale);
    this.colors.secondary.multiplyScalar(lumScale);
    this.colors.accent.multiplyScalar(lumScale);
    this.colors.highlight.multiplyScalar(Math.min(1.2, lumScale));

    return this.colors;
  }
}
