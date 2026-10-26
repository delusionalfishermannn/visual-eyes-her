/**
 * visual-eyes-her — scene
 * Builds the Three.js dream scene and drives per-frame updates.
 *
 * Objects:
 *  - Fractal architecture (recursive breathing lattice)
 *  - Liquid light river (flowing noise ribbon)
 *  - Chromatic tessellations (floating polyhedra)
 *  - Particle swarm (responsive sparkles)
 *
 * Audio drives: bass->breathing/ripple, mids->particles/color,
 * highs->bloom/sparkle, onset->flash morphs.
 */

import * as THREE from 'three';
import { meshVert, meshFrag, ribbonVert, ribbonFrag, particleVert, particleFrag } from './shaders.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

const PALETTE = [
  new THREE.Color(0x0a0a2e), // deep indigo
  new THREE.Color(0x8a2be2), // electric violet
  new THREE.Color(0xffd700), // molten gold
  new THREE.Color(0x00ffff), // cyan plasma
  new THREE.Color(0xf4c2c2), // rose-quartz pastel
];

function paletteLerp(t) {
  t = ((t % 1) + 1) % 1;
  const i = t * (PALETTE.length - 1);
  const a = Math.floor(i);
  const b = Math.min(a + 1, PALETTE.length - 1);
  const f = i - a;
  return new THREE.Color().lerpColors(PALETTE[a], PALETTE[b], f);
}

// ------------------------------------------------------------------
// Fractal architecture: recursive breathing lattice
class FractalArchitecture {
  constructor() {
    this.group = new THREE.Group();
    this.meshes = [];
    this._build(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), 2.2, 6);
  }

  _build(pos, dir, length, depth) {
    if (depth <= 0 || length < 0.12) return;
    const geo = new THREE.BoxGeometry(0.14, length, 0.14);
    const mat = this._material();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    // orient box along dir
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    mesh.userData = { baseLength: length, seed: Math.random(), dir: dir.clone(), depth };
    this.group.add(mesh);
    this.meshes.push(mesh);

    const nextLen = length * 0.62;
    const branches = depth > 3 ? 3 : 2;
    for (let k = 0; k < branches; k++) {
      const angle = (k / branches) * Math.PI * 2 + depth * 0.7;
      const axis = new THREE.Vector3(Math.sin(angle), 0.3, Math.cos(angle)).normalize();
      const newDir = dir.clone().applyAxisAngle(axis, 0.55 + Math.random() * 0.6);
      const newPos = pos.clone().add(dir.clone().multiplyScalar(length * 0.55));
      this._build(newPos, newDir, nextLen, depth - 1);
    }
  }

  _material() {
    return new THREE.ShaderMaterial({
      vertexShader: meshVert,
      fragmentShader: meshFrag,
      uniforms: {
        uTime: { value: 0 },
        uBass: { value: 0 },
        uMids: { value: 0 },
        uHighs: { value: 0 },
        uPulse: { value: 0 },
        uColorA: { value: new THREE.Color(0x0a0a2e) },
        uColorB: { value: new THREE.Color(0x8a2be2) },
      },
      transparent: true,
      side: THREE.DoubleSide,
    });
  }

  update(time, audio, pulse) {
    const { bass, mids, highs, onset } = audio;
    // flash morph on onset: brighten + pulse
    const flash = onset > 0.5 ? 1.2 : 1.0;
    this.group.rotation.y = Math.sin(time * 0.12) * 0.15;
    this.group.rotation.x = Math.cos(time * 0.09) * 0.08;
    this.group.position.y = Math.sin(time * 0.25) * 0.15;

    this.meshes.forEach((m) => {
      const s = 1.0 + bass * 0.9 * flash + Math.sin(time * 1.5 + m.userData.seed) * 0.12 * pulse;
      m.scale.set(s, s, s);
      m.material.uniforms.uTime.value = time;
      m.material.uniforms.uBass.value = bass;
      m.material.uniforms.uMids.value = mids;
      m.material.uniforms.uHighs.value = highs;
      m.material.uniforms.uPulse.value = pulse * flash;
    });
  }

  setColors(colorA, colorB) {
    this.meshes.forEach((m) => {
      m.material.uniforms.uColorA.value.copy(colorA);
      m.material.uniforms.uColorB.value.copy(colorB);
    });
  }
}

// ------------------------------------------------------------------
// Liquid light river: flowing noise ribbon
class LiquidRiver {
  constructor() {
    const widthSeg = 12;
    const lengthSeg = 120;
    const geo = new THREE.PlaneGeometry(2.4, 30, widthSeg, lengthSeg);
    geo.rotateX(-Math.PI / 2);
    // UVs already 0..1 from plane
    const mat = new THREE.ShaderMaterial({
      vertexShader: ribbonVert,
      fragmentShader: ribbonFrag,
      uniforms: {
        uTime: { value: 0 },
        uFlow: { value: 0 },
        uBass: { value: 0 },
        uHighs: { value: 0 },
        uColorA: { value: new THREE.Color(0x00ffff) },
        uColorB: { value: new THREE.Color(0x8a2be2) },
      },
      transparent: true,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.set(0, 0.4, 0);
    this.mesh.rotation.x = -Math.PI / 2;
    this.group = new THREE.Group();
    this.group.add(this.mesh);
    // second ribbon, offset & counter-rotating for layered depth
    this.mesh2 = this.mesh.clone();
    this.mesh2.position.set(1.2, 0.2, -4);
    this.mesh2.rotation.z = Math.PI / 4;
    this.mesh2.material = this.mesh.material.clone();
    this.group.add(this.mesh2);
  }

  update(time, audio) {
    const { bass, highs } = audio;
    const flow = 1.0 + bass * 0.8 + highs * 0.6;
    this.group.position.y = Math.sin(time * 0.17) * 0.12;
    this.group.rotation.z = Math.sin(time * 0.11) * 0.06;
    [this.mesh, this.mesh2].forEach((m) => {
      m.material.uniforms.uTime.value = time;
      m.material.uniforms.uFlow.value = flow;
      m.material.uniforms.uBass.value = bass;
      m.material.uniforms.uHighs.value = highs;
    });
  }

  setColors(colorA, colorB) {
    [this.mesh, this.mesh2].forEach((m) => {
      m.material.uniforms.uColorA.value.copy(colorA);
      m.material.uniforms.uColorB.value.copy(colorB);
    });
  }
}

// ------------------------------------------------------------------
// Chromatic tessellations: floating polyhedra
class Tessellations {
  constructor() {
    this.group = new THREE.Group();
    const types = [
      { geo: new THREE.IcosahedronGeometry(0.7, 0), rotSpeed: 0.0004 },
      { geo: new THREE.TetrahedronGeometry(0.9, 0), rotSpeed: 0.0006 },
      { geo: new THREE.OctahedronGeometry(0.6, 0), rotSpeed: 0.0005 },
    ];
    types.forEach((t, i) => {
      const mat = new THREE.ShaderMaterial({
        vertexShader: meshVert,
        fragmentShader: meshFrag,
        uniforms: {
          uTime: { value: 0 },
          uBass: { value: 0 },
          uMids: { value: 0 },
          uHighs: { value: 0 },
          uPulse: { value: 0 },
          uColorA: { value: new THREE.Color(0xffd700) },
          uColorB: { value: new THREE.Color(0x00ffff) },
        },
        transparent: true,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(t.geo, mat);
      mesh.userData = {
        rotSpeed: t.rotSpeed,
        orbit: 3.2 + i * 2.2,
        angle: i * (Math.PI * 2 / 3),
        baseY: 1.5 + i * 1.2,
        seed: Math.random(),
      };
      mesh.position.set(
        Math.cos(mesh.userData.angle) * mesh.userData.orbit,
        mesh.userData.baseY,
        Math.sin(mesh.userData.angle) * mesh.userData.orbit
      );
      this.group.add(mesh);
      this.group.userData.meshes = this.group.userData.meshes || [];
      this.group.userData.meshes.push(mesh);
    });
  }

  update(time, audio, pulse) {
    const { bass, mids, highs, onset } = audio;
    const flash = onset > 0.5 ? 1.4 : 1.0;
    const meshes = this.group.userData.meshes || [];
    meshes.forEach((m, i) => {
      m.rotation.x += m.userData.rotSpeed * (1 + mids);
      m.rotation.y += m.userData.rotSpeed * 1.4 * (1 + mids);
      m.userData.angle += 0.008 * (1 + bass * 0.5);
      m.position.x = Math.cos(m.userData.angle) * m.userData.orbit;
      m.position.z = Math.sin(m.userData.angle) * m.userData.orbit;
      m.position.y = m.userData.baseY + Math.sin(time * 1.2 + i) * (0.25 + mids * 0.5);
      const s = 1.0 + bass * 0.7 * flash + Math.sin(time * 2 + i) * 0.1 * pulse;
      m.scale.set(s, s, s);
      m.material.uniforms.uTime.value = time;
      m.material.uniforms.uBass.value = bass;
      m.material.uniforms.uMids.value = mids;
      m.material.uniforms.uHighs.value = highs;
      m.material.uniforms.uPulse.value = pulse * flash;
    });
  }

  setColors(colorA, colorB) {
    const meshes = this.group.userData.meshes || [];
    meshes.forEach((m) => {
      m.material.uniforms.uColorA.value.copy(colorA);
      m.material.uniforms.uColorB.value.copy(colorB);
    });
  }
}

// ------------------------------------------------------------------
// Particle swarm
class ParticleSwarm {
  constructor(count = 3500) {
    this.count = count;
    const positions = new Float32Array(count * 3);
    const offsets = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const r = 6 + Math.random() * 26;
      const phi = Math.random() * Math.PI * 2;
      const costheta = 2 * Math.random() - 1;
      const z = costheta;
      const xy = Math.sqrt(1 - z * z);
      positions[3 * i] = xy * Math.cos(phi) * r;
      positions[3 * i + 1] = z * r + (Math.random() - 0.5) * 4;
      positions[3 * i + 2] = xy * Math.sin(phi) * r;
      offsets[3 * i] = Math.random() * 2 - 1;
      offsets[3 * i + 1] = Math.random() * 2 - 1;
      offsets[3 * i + 2] = Math.random() * 2 - 1;
      const c = paletteLerp(Math.random());
      colors[3 * i] = c.r; colors[3 * i + 1] = c.g; colors[3 * i + 2] = c.b;
      sizes[i] = 0.08 + Math.random() * 0.18;
      seeds[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aOffset', new THREE.BufferAttribute(offsets, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    const mat = new THREE.ShaderMaterial({
      vertexShader: particleVert,
      fragmentShader: particleFrag,
      uniforms: {
        uTime: { value: 0 },
        uMids: { value: 0 },
        uHighs: { value: 0 },
        uPulse: { value: 0 },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.mesh = new THREE.Points(geo, mat);
    this.group = new THREE.Group();
    this.group.add(this.mesh);
  }

  update(time, audio, pulse) {
    const { mids, highs } = audio;
    this.group.rotation.y = Math.sin(time * 0.06) * 0.12;
    this.group.rotation.x = Math.cos(time * 0.04) * 0.08;
    this.mesh.material.uniforms.uTime.value = time;
    this.mesh.material.uniforms.uMids.value = mids;
    this.mesh.material.uniforms.uHighs.value = highs;
    this.mesh.material.uniforms.uPulse.value = pulse;
  }
}

// ------------------------------------------------------------------
export function buildScene(canvas) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x020206, 0.017);

  const camera = new THREE.PerspectiveCamera(55, canvas.clientWidth / canvas.clientHeight, 0.1, 120);
  camera.position.set(0, 2.5, 9);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ReinhardToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // Bloom pass for chromatic glow / volumetric feel
  let composer = null;
  try {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(canvas.clientWidth, canvas.clientHeight),
      0.55, // strength
      0.85, // radius
      0.6   // threshold
    );
    composer.addPass(bloom);
  } catch (e) {
    console.warn('Bloom unavailable:', e);
  }

  const fractal = new FractalArchitecture();
  const river = new LiquidRiver();
  const tess = new Tessellations();
  const particles = new ParticleSwarm();

  scene.add(fractal.group, river.group, tess.group, particles.group);

  // ambient + point light for soft global illumination
  const ambient = new THREE.AmbientLight(0xffffff, 0.25);
  scene.add(ambient);
  const pLight = new THREE.PointLight(0xbc8ff0, 2.5, 20);
  pLight.position.set(0, 3, 4);
  scene.add(pLight);

  // time-varying color state
  let colorCycle = 0;

  function setColors(colorA, colorB) {
    fractal.setColors(colorA, colorB);
    river.setColors(colorA, colorB);
    tess.setColors(colorA, colorB);
  }

  function update(time, audio, pulse) {
    // drive color cycle by time + spectral centroid (audio warmth)
    colorCycle += 0.0012 + audio.centroid * 0.002;
    const colorA = paletteLerp(colorCycle);
    const colorB = paletteLerp(colorCycle + 0.6);
    setColors(colorA, colorB);

    fractal.update(time, audio, pulse);
    river.update(time, audio);
    tess.update(time, audio, pulse);
    particles.update(time, audio, pulse);

    // slow camera drift / breathing
    camera.position.x = Math.sin(time * 0.07) * 0.6;
    camera.position.z = 9 + Math.cos(time * 0.05) * 0.8;
    camera.position.y = 2.5 + Math.sin(time * 0.09) * 0.25;
    camera.lookAt(0, 0.6, 0);
  }

  function render(time) {
    update(time, { bass: 0, mids: 0, highs: 0, centroid: 0.5, onset: 0 }, 0);
    if (composer) composer.render();
    else renderer.render(scene, camera);
  }

  return {
    scene,
    camera,
    renderer,
    composer,
    render,
    update,
  };
}

export function updateScene(sceneObj, time, audio, pulse) {
  sceneObj.update(time, audio, pulse);
  sceneObj.camera.lookAt(sceneObj.scene.position);
  if (sceneObj.composer) sceneObj.composer.render();
  else sceneObj.renderer.render(sceneObj.scene, sceneObj.camera);
}
