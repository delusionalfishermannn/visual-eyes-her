/**
 * visual-eyes-her — Master 3D Scene Renderer
 *
 * Integrates:
 *  - Atmospheric Nebula Dome (luminous non-black depth)
 *  - 10-Family MotifStage (clear focal centerpiece + subtle harmonic secondary blend)
 *  - Adaptive Multi-Behavior Particle Field (zero-GC dynamic drawRange + fade)
 *  - 6 Smooth Camera Motion Styles + Stereo Pan Coupling
 *  - Anti-Flash / Photosensitivity Envelope & Adaptive Quality Scaling
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { backdropVert, backdropFrag, particleVert, particleFrag } from './shaders.js';
import { MotifStage } from './motifs.js';
import { PaletteBlender } from './palettes.js';

const MAX_PARTICLES = 12000;

const BEHAVIOR_INDEX = {
  orbital: 0,
  vortex: 1,
  updraft: 2,
  curl: 3,
  radial: 4,
  dust: 5,
};

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

class AdaptiveParticleField {
  constructor(maxCount = MAX_PARTICLES) {
    this.maxCount = maxCount;
    const positions = new Float32Array(maxCount * 3);
    const randoms = new Float32Array(maxCount * 3);
    const indexNorm = new Float32Array(maxCount);

    for (let i = 0; i < maxCount; i++) {
      // Distribute in a hollow spherical-toroidal cloud around the focal stage (r = 3.2..24)
      const u = Math.random();
      const r = 3.2 + Math.pow(u, 0.78) * 21.0;
      const theta = Math.random() * Math.PI * 2;
      const cosPhi = (Math.random() * 2 - 1) * 0.88;
      const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));

      positions[i * 3] = r * sinPhi * Math.cos(theta);
      positions[i * 3 + 1] = r * cosPhi * 0.72;
      positions[i * 3 + 2] = r * sinPhi * Math.sin(theta);

      randoms[i * 3] = Math.random();                  // seed
      randoms[i * 3 + 1] = 0.55 + Math.random() * 1.3; // sizeScale
      randoms[i * 3 + 2] = Math.random();              // colorMix

      indexNorm[i] = i / maxCount;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 3));
    geo.setAttribute('aIndexNorm', new THREE.BufferAttribute(indexNorm, 1));

    this.material = new THREE.ShaderMaterial({
      vertexShader: particleVert,
      fragmentShader: particleFrag,
      uniforms: {
        uTime: { value: 0 },
        uBass: { value: 0 },
        uMids: { value: 0 },
        uHighs: { value: 0 },
        uOnset: { value: 0 },
        uPixelRatio: { value: 1.0 },
        uBehavior: { value: 0 },
        uActiveRatio: { value: 0.7 },
        uMotionScale: { value: 1.0 },
        uStereoPan: { value: 0.0 },
        uPrimary: { value: new THREE.Color(0x9d4edd) },
        uSecondary: { value: new THREE.Color(0x00f5d4) },
        uAccent: { value: new THREE.Color(0xffd166) },
        uHighlight: { value: new THREE.Color(0xffffff) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geo, this.material);
    this.activeCount = Math.floor(maxCount * 0.65);
    geo.setDrawRange(0, this.activeCount);
  }

  update({ time, audio, colors, behaviorId, activeRatio, motionScale, pixelRatio }) {
    const ratio = clamp(activeRatio, 0.04, 1.0);
    // Keep drawRange slightly above uActiveRatio so shader's smoothstep fade tail renders cleanly
    const drawCount = Math.min(this.maxCount, Math.ceil(this.maxCount * Math.min(1, ratio + 0.08)));
    this.activeCount = Math.round(this.maxCount * ratio);
    this.points.geometry.setDrawRange(0, drawCount);

    const u = this.material.uniforms;
    u.uTime.value = time;
    u.uBass.value = audio.bass;
    u.uMids.value = audio.mids;
    u.uHighs.value = audio.highs;
    u.uOnset.value = audio.onset;
    u.uPixelRatio.value = pixelRatio;
    u.uBehavior.value = BEHAVIOR_INDEX[behaviorId] ?? 0;
    u.uActiveRatio.value = ratio;
    u.uMotionScale.value = motionScale;
    u.uStereoPan.value = audio.stereoPan || 0;
    u.uPrimary.value.copy(colors.primary);
    u.uSecondary.value.copy(colors.secondary);
    u.uAccent.value.copy(colors.accent);
    u.uHighlight.value.copy(colors.highlight);
  }
}

export class VisualScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.fogColor = new THREE.Color(0x12082b);
    this.scene.fog = new THREE.FogExp2(this.fogColor, 0.022);

    const w = Math.max(1, canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, canvas.clientHeight || window.innerHeight);

    this.camera = new THREE.PerspectiveCamera(56, w / h, 0.1, 240);
    this.camera.position.set(0, 1.6, 9.2);
    this._camTargetPos = new THREE.Vector3(0, 1.6, 9.2);
    this._camLookAt = new THREE.Vector3(0, 0, 0);
    this._motionAngle = 0;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
    this.renderer.setSize(w, h, false);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x100726, 1);

    // Post-processing Bloom Composer
    this.composer = null;
    this.bloomPass = null;
    try {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.95, 0.65, 0.28);
      this.composer.addPass(this.bloomPass);
    } catch (err) {
      console.warn('Bloom fallback to direct WebGLRenderer:', err);
      this.composer = null;
    }

    // 1. Atmospheric Sky-Sphere Backdrop
    this.backdropMaterial = new THREE.ShaderMaterial({
      vertexShader: backdropVert,
      fragmentShader: backdropFrag,
      uniforms: {
        uTime: { value: 0 },
        uBass: { value: 0 },
        uMids: { value: 0 },
        uHighs: { value: 0 },
        uBrightness: { value: 0.9 },
        uQuality: { value: 0.85 },
        uStereoPan: { value: 0 },
        uBgDeep: { value: new THREE.Color(0x12082b) },
        uBgMid: { value: new THREE.Color(0x2a1259) },
        uPrimary: { value: new THREE.Color(0x9d4edd) },
        uSecondary: { value: new THREE.Color(0x00f5d4) },
        uAccent: { value: new THREE.Color(0xffd166) },
      },
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.backdropMesh = new THREE.Mesh(new THREE.SphereGeometry(115, 42, 28), this.backdropMaterial);
    this.backdropMesh.renderOrder = -10;
    this.scene.add(this.backdropMesh);

    // 2. Motif Stage (all 10 families)
    this.motifStage = new MotifStage();
    this.scene.add(this.motifStage.root);

    // 3. Supporting Adaptive Particle Field
    this.particleField = new AdaptiveParticleField(MAX_PARTICLES);
    this.scene.add(this.particleField.points);

    // 4. Palette Blender
    this.paletteBlender = new PaletteBlender('cosmic-transcendence');

    // Anti-flash smoothed envelopes
    this._safeOnset = 0;
    this._safeBloom = 0.85;
    this._safeExposure = 1.1;
    this._animTime = 0;
  }

  get glContext() {
    return this.renderer.getContext();
  }

  get activeParticleCount() {
    return this.particleField.activeCount;
  }

  resize(width, height, pixelRatio = null) {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (pixelRatio !== null) {
      this.renderer.setPixelRatio(pixelRatio);
    }
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      this.composer.setSize(w, h);
    }
  }

  setPixelRatio(dpr) {
    const w = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      this.composer.setSize(w, h);
    }
  }

  update(dt, rawAudio, directorState, prefs, perfStatus) {
    const effective = prefs.getEffectiveControls();
    const access = prefs.accessibility;
    const recipe = directorState.recipe;
    const arcMultiplier = directorState.arcPhase.arcIntensity || 1.0;

    // Advance internal shader clock smoothly scaled by motion & intensity
    const timeRate = 0.25 + effective.motion * 0.75;
    this._animTime += dt * timeRate;
    const t = this._animTime;

    // Apply Audio Reactivity & Intensity scaling + Photosensitivity Anti-Flash Limiter
    const react = effective.reactivity * effective.intensity * arcMultiplier;
    const maxOnsetCap = access.reducedFlashes || access.calmMode ? 0.14 : 0.85;
    const rawScaledOnset = Math.min(maxOnsetCap, rawAudio.onset * react * 0.85);

    // Rate-limit onset rise & decay so rapid strobing (>3Hz high-contrast flash) cannot happen
    const maxRise = (access.reducedFlashes ? 0.9 : 3.2) * dt;
    if (rawScaledOnset > this._safeOnset) {
      this._safeOnset = Math.min(rawScaledOnset, this._safeOnset + maxRise);
    } else {
      this._safeOnset = lerp(this._safeOnset, rawScaledOnset, clamp(dt * 5.0, 0.02, 0.35));
    }

    const audio = {
      energy: clamp(rawAudio.energy * react, 0, 1.4),
      bass: clamp(rawAudio.bass * react, 0, 1.35),
      mids: clamp(rawAudio.mids * react, 0, 1.35),
      highs: clamp(rawAudio.highs * react, 0, 1.35),
      centroid: rawAudio.centroid,
      onset: this._safeOnset,
      stereoPan: access.reducedMotion ? 0 : (rawAudio.stereoPan || 0),
    };

    // Update Palette Blender
    this.paletteBlender.setTarget(recipe.palette, 5.2);
    const colors = this.paletteBlender.update(dt, {
      colorRange: effective.colorRange,
      brightness: effective.brightness,
      lowerBrightness: access.lowerBrightness,
      centroid: audio.centroid,
    });

    // Update Fog (subtle depth veil swells gently during 'nebula-veil' transitions)
    this.fogColor.copy(colors.bgDeep).lerp(colors.bgMid, 0.35);
    this.scene.fog.color.copy(this.fogColor);
    const veilBoost =
      recipe.transitionType === 'nebula-veil'
        ? Math.sin(directorState.transitionProgress * Math.PI) * 0.018
        : 0;
    this.scene.fog.density = 0.018 + veilBoost;

    // Update Atmospheric Backdrop Dome
    const bu = this.backdropMaterial.uniforms;
    bu.uTime.value = t;
    bu.uBass.value = audio.bass;
    bu.uMids.value = audio.mids;
    bu.uHighs.value = audio.highs;
    bu.uBrightness.value = effective.brightness;
    bu.uQuality.value = perfStatus.budget.shaderQuality;
    bu.uStereoPan.value = audio.stereoPan;
    bu.uBgDeep.value.copy(colors.bgDeep);
    bu.uBgMid.value.copy(colors.bgMid);
    bu.uPrimary.value.copy(colors.primary);
    bu.uSecondary.value.copy(colors.secondary);
    bu.uAccent.value.copy(colors.accent);
    this.backdropMesh.position.copy(this.camera.position);

    // Update Focal & Secondary Motifs
    this.motifStage.update({
      time: t,
      dt,
      audio,
      colors,
      focalId: recipe.family,
      prevFocalId: recipe.prevFamily,
      transitionProgress: directorState.transitionProgress,
      transitionType: recipe.transitionType,
      secondaryId: recipe.secondaryFamily,
      secondaryWeight: directorState.secondaryWeight * perfStatus.budget.secondaryDetail,
      controls: effective,
      shaderQuality: perfStatus.budget.shaderQuality,
    });

    // Update Supporting Particle Field
    const activeRatio = clamp(
      perfStatus.budget.particleRatio * (0.28 + effective.density * 0.68),
      0.04,
      1.0
    );
    this.particleField.update({
      time: t,
      audio,
      colors,
      behaviorId: recipe.particleBehavior,
      activeRatio,
      motionScale: effective.motion,
      pixelRatio: this.renderer.getPixelRatio(),
    });

    // Update Camera Choreography (6 Motion Styles, smoothly damped)
    this._updateCamera(dt, t, recipe.motionStyle, effective, access, audio);

    // Update Post-Processing Bloom & Exposure safely
    const maxBloom = access.lowerBrightness ? 0.55 : access.reducedFlashes ? 0.78 : 1.35;
    const desiredBloom = clamp(
      (0.58 + effective.brightness * 0.35 + audio.highs * 0.22 + audio.onset * 0.28) *
        (0.75 + effective.intensity * 0.25),
      0.25,
      maxBloom
    );
    this._safeBloom = lerp(this._safeBloom, desiredBloom, clamp(dt * 3.0, 0.02, 0.2));

    const maxExp = access.lowerBrightness ? 0.85 : 1.38;
    const desiredExp = clamp(0.78 + effective.brightness * 0.42, 0.5, maxExp);
    this._safeExposure = lerp(this._safeExposure, desiredExp, clamp(dt * 2.5, 0.02, 0.2));
    this.renderer.toneMappingExposure = this._safeExposure;

    if (this.composer && this.bloomPass && perfStatus.budget.bloomEnabled) {
      this.bloomPass.strength = this._safeBloom;
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  _updateCamera(dt, time, motionStyle, controls, access, audio) {
    const mot = access.reducedMotion ? 0.08 : controls.motion;
    this._motionAngle += dt * 0.16 * mot;
    const a = this._motionAngle;

    let x = 0;
    let y = 1.35;
    let z = 9.0;

    switch (motionStyle) {
      case 'orbital-glide':
        x = Math.sin(a) * 3.6;
        z = Math.cos(a) * 8.8;
        y = 1.4 + Math.sin(a * 0.7) * 1.1;
        break;
      case 'spiral-ascension':
        x = Math.sin(a * 1.3) * 3.2;
        z = Math.cos(a * 1.3) * 8.2;
        y = 1.8 + Math.sin(time * 0.22) * 2.1;
        break;
      case 'pendulum-sway':
        x = Math.sin(time * 0.28) * 3.8 * Math.min(1.2, mot);
        y = 1.2 + Math.cos(time * 0.19) * 0.8;
        z = 8.8 + Math.sin(time * 0.15) * 1.1;
        break;
      case 'kinetic-pulse':
        x = Math.sin(a * 1.6) * 2.8;
        y = 1.3 + Math.cos(a * 1.2) * 1.3;
        z = 8.4 - audio.bass * 1.1 - audio.onset * 0.65;
        break;
      case 'zero-gravity':
        x = Math.sin(time * 0.09) * 1.6;
        y = 1.1 + Math.sin(time * 0.07) * 0.7;
        z = 9.4 + Math.cos(time * 0.06) * 0.9;
        break;
      case 'breathing':
      default:
        x = Math.sin(time * 0.12) * 1.4;
        y = 1.35 + Math.sin(time * 0.18) * 0.55;
        z = 9.1 - audio.bass * 0.75 + Math.cos(time * 0.15) * 0.85;
        break;
    }

    // Gentle stereo pan nudge
    x += audio.stereoPan * 0.65;

    this._camTargetPos.set(x, y, z);
    this.camera.position.lerp(this._camTargetPos, clamp(dt * 1.6, 0.01, 0.15));

    this._camLookAt.set(audio.stereoPan * 0.25, 0.05, 0);
    this.camera.lookAt(this._camLookAt);
  }
}
