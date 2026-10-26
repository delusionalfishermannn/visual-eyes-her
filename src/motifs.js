import * as THREE from 'three';
import { focalVert, focalFrag, ribbonVert, ribbonFrag } from './shaders.js';

function createFocalMaterial(surfaceStyle = 0.0, seed = 0.0, transparent = true) {
  return new THREE.ShaderMaterial({
    vertexShader: focalVert,
    fragmentShader: focalFrag,
    uniforms: {
      uTime: { value: 0 },
      uBass: { value: 0 },
      uMids: { value: 0 },
      uHighs: { value: 0 },
      uOnset: { value: 0 },
      uDetail: { value: 1.0 },
      uQuality: { value: 0.85 },
      uOpacity: { value: 1.0 },
      uSurfaceStyle: { value: surfaceStyle },
      uSeed: { value: seed },
      uMorphAmount: { value: 0.5 },
      uPrimary: { value: new THREE.Color(0x9d4edd) },
      uSecondary: { value: new THREE.Color(0x00f5d4) },
      uAccent: { value: new THREE.Color(0xffd166) },
      uHighlight: { value: new THREE.Color(0xffffff) },
    },
    transparent,
    depthWrite: !transparent,
    side: THREE.DoubleSide,
  });
}

function createRibbonMaterial(seed = 0.0, contourLines = 0.0) {
  return new THREE.ShaderMaterial({
    vertexShader: ribbonVert,
    fragmentShader: ribbonFrag,
    uniforms: {
      uTime: { value: 0 },
      uBass: { value: 0 },
      uMids: { value: 0 },
      uHighs: { value: 0 },
      uFlow: { value: 1.0 },
      uQuality: { value: 0.85 },
      uOpacity: { value: 1.0 },
      uSeed: { value: seed },
      uContourLines: { value: contourLines },
      uPrimary: { value: new THREE.Color(0x9d4edd) },
      uSecondary: { value: new THREE.Color(0x00f5d4) },
      uAccent: { value: new THREE.Color(0xffd166) },
      uHighlight: { value: new THREE.Color(0xffffff) },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

function buildMobiusGeometry(radius = 2.1, halfWidth = 0.68, uSeg = 120, vSeg = 18) {
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i <= uSeg; i++) {
    const u = (i / uSeg) * Math.PI * 2;
    for (let j = 0; j <= vSeg; j++) {
      const v = ((j / vSeg) * 2 - 1) * halfWidth;
      const halfU = u * 0.5;
      const r = radius + v * Math.cos(halfU);
      const x = r * Math.cos(u);
      const z = r * Math.sin(u);
      const y = v * Math.sin(halfU) * 1.25;
      positions.push(x, y, z);
      uvs.push(i / uSeg, j / vSeg);
    }
  }

  for (let i = 0; i < uSeg; i++) {
    for (let j = 0; j < vSeg; j++) {
      const a = i * (vSeg + 1) + j;
      const b = (i + 1) * (vSeg + 1) + j;
      const c = (i + 1) * (vSeg + 1) + (j + 1);
      const d = i * (vSeg + 1) + (j + 1);
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// ============================================================================
// BUILDERS FOR ALL 10 AESTHETIC FAMILIES
// ============================================================================

function buildOrganic() {
  const group = new THREE.Group();
  const materials = [];
  const parts = [];

  // Central breathing bioluminescent heart
  const coreMat = createFocalMaterial(0.0, 0.12);
  materials.push(coreMat);
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.18, 4), coreMat);
  group.add(core);

  // 10 sinuous organic tendrils unfurling radially
  const count = 10;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const elev = ((i % 3) - 1) * 0.55;
    const pts = [];
    for (let s = 0; s <= 7; s++) {
      const t = s / 7;
      const r = 0.6 + t * 3.6;
      const curl = angle + Math.sin(t * Math.PI * 1.4 + i) * 0.65;
      const y = elev * r * 0.45 + Math.sin(t * Math.PI * 1.8 + i * 0.7) * 0.9;
      pts.push(new THREE.Vector3(Math.cos(curl) * r, y, Math.sin(curl) * r));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const tubeGeo = new THREE.TubeGeometry(curve, 36, 0.13 - (i % 2) * 0.03, 10, false);
    const mat = createFocalMaterial(0.0, 0.2 + i * 0.13);
    materials.push(mat);
    const mesh = new THREE.Mesh(tubeGeo, mat);
    group.add(mesh);
    parts.push({ mesh, idx: i });
  }

  return {
    group,
    materials,
    update(time, audio, motionScale, weight) {
      const breath = 1 + audio.bass * 0.28 + Math.sin(time * 1.4) * 0.08;
      core.scale.setScalar(breath);
      group.rotation.y = time * 0.14 * motionScale;
      parts.forEach(({ mesh, idx }) => {
        mesh.rotation.z = Math.sin(time * 0.8 * motionScale + idx * 0.7) * (0.12 + audio.mids * 0.18);
        mesh.rotation.x = Math.cos(time * 0.65 * motionScale + idx) * 0.1;
      });
    },
  };
}

function buildCrystalline() {
  const group = new THREE.Group();
  const materials = [];
  const spires = [];

  // Inner faceted geode nucleus
  const coreMat = createFocalMaterial(1.0, 0.4);
  materials.push(coreMat);
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(1.05, 1), coreMat);
  group.add(core);

  // 14 radial hexagonal quartz prisms
  const dirs = [
    [0, 1, 0], [0, -1, 0], [1, 0.25, 0], [-1, 0.25, 0],
    [0, 0.25, 1], [0, 0.25, -1], [0.7, 0.7, 0.7], [-0.7, 0.7, 0.7],
    [0.7, 0.7, -0.7], [-0.7, 0.7, -0.7], [0.7, -0.65, 0.65], [-0.7, -0.65, 0.65],
    [0.65, -0.65, -0.7], [-0.65, -0.65, -0.7],
  ];

  dirs.forEach((d, i) => {
    const dir = new THREE.Vector3(d[0], d[1], d[2]).normalize();
    const len = 1.9 + (i % 4) * 0.58;
    const radius = 0.22 + (i % 3) * 0.07;
    const geo = new THREE.ConeGeometry(radius, len, 6, 1);
    geo.translate(0, len * 0.42, 0);
    const mat = createFocalMaterial(1.0, 1.1 + i * 0.21);
    materials.push(mat);
    const spire = new THREE.Mesh(geo, mat);
    spire.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    group.add(spire);
    spires.push({ spire, dir, baseLen: len, idx: i });
  });

  return {
    group,
    materials,
    update(time, audio, motionScale) {
      group.rotation.y = time * 0.18 * motionScale;
      group.rotation.x = Math.sin(time * 0.22 * motionScale) * 0.22;
      core.rotation.y = -time * 0.45 * motionScale;
      spires.forEach(({ spire, idx }) => {
        const pulse = 1 + audio.highs * 0.32 + Math.sin(time * 2.1 + idx) * 0.08 + audio.onset * 0.22;
        spire.scale.set(1, pulse, 1);
      });
    },
  };
}

function buildFluid() {
  const group = new THREE.Group();
  const materials = [];
  const ribbons = [];

  // Flowing ferrofluid torus-knot centerpiece
  const knotMat = createFocalMaterial(2.0, 2.2);
  materials.push(knotMat);
  const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(1.5, 0.42, 150, 24, 2, 3), knotMat);
  group.add(knot);

  // 3 luminous silk aurora ribbons gliding around the knot
  for (let i = 0; i < 3; i++) {
    const geo = new THREE.PlaneGeometry(1.7, 15, 16, 72);
    geo.rotateX(-Math.PI / 2);
    const rMat = createRibbonMaterial(i * 1.7, 0.0);
    materials.push(rMat);
    const mesh = new THREE.Mesh(geo, rMat);
    mesh.position.y = (i - 1) * 0.85;
    mesh.rotation.y = (i * Math.PI) / 3;
    group.add(mesh);
    ribbons.push(mesh);
  }

  return {
    group,
    materials,
    update(time, audio, motionScale) {
      knot.rotation.x = time * 0.25 * motionScale;
      knot.rotation.y = time * 0.32 * motionScale;
      knot.scale.setScalar(1 + audio.bass * 0.22);
      ribbons.forEach((r, i) => {
        r.rotation.z = Math.sin(time * 0.35 * motionScale + i) * 0.24;
        r.material.uniforms.uFlow.value = (0.7 + audio.energy * 1.4) * motionScale;
      });
    },
  };
}

function buildCelestial() {
  const group = new THREE.Group();
  const materials = [];
  const rings = [];
  const moons = [];

  // Singularity / Sun Core
  const sunMat = createFocalMaterial(2.0, 3.4);
  materials.push(sunMat);
  const sun = new THREE.Mesh(new THREE.SphereGeometry(1.25, 42, 32), sunMat);
  group.add(sun);

  // 3 Concentric Tilted Accretion Rings
  for (let i = 0; i < 3; i++) {
    const rMat = createFocalMaterial(4.0, 4.0 + i * 0.6);
    materials.push(rMat);
    const torus = new THREE.Mesh(new THREE.TorusGeometry(2.2 + i * 1.05, 0.06 + (2 - i) * 0.025, 16, 96), rMat);
    torus.rotation.x = Math.PI * 0.38 + i * 0.24;
    torus.rotation.y = i * 0.5;
    group.add(torus);
    rings.push(torus);
  }

  // 5 Orbiting Moons
  for (let i = 0; i < 5; i++) {
    const mMat = createFocalMaterial(1.0, 5.2 + i);
    materials.push(mMat);
    const moon = new THREE.Mesh(new THREE.SphereGeometry(0.18 + (i % 3) * 0.08, 20, 16), mMat);
    group.add(moon);
    moons.push({ moon, radius: 2.4 + i * 0.72, speed: 0.55 - i * 0.07, tilt: (i - 2) * 0.28, phase: i * 1.3 });
  }

  return {
    group,
    materials,
    update(time, audio, motionScale) {
      sun.scale.setScalar(1 + audio.bass * 0.28 + audio.onset * 0.16);
      sun.rotation.y = time * 0.2 * motionScale;
      rings.forEach((ring, i) => {
        ring.rotation.z = time * (0.22 + i * 0.09) * motionScale * (i % 2 === 0 ? 1 : -1);
        ring.rotation.x = Math.PI * 0.36 + Math.sin(time * 0.25 * motionScale + i) * 0.22;
      });
      moons.forEach((m) => {
        const a = time * m.speed * motionScale + m.phase;
        m.moon.position.set(
          Math.cos(a) * m.radius,
          Math.sin(a * 1.2) * m.radius * Math.sin(m.tilt),
          Math.sin(a) * m.radius
        );
      });
    },
  };
}

function buildArchitectural() {
  const group = new THREE.Group();
  const materials = [];
  const frames = [];

  // 6 Nested Non-Euclidean Portal Frames receding and gently rotating
  for (let i = 0; i < 6; i++) {
    const frameGroup = new THREE.Group();
    const size = 1.5 + i * 0.62;
    const thick = 0.14;
    const mat = createFocalMaterial(4.0, 6.0 + i * 0.35);
    materials.push(mat);

    const top = new THREE.Mesh(new THREE.BoxGeometry(size * 2, thick, thick * 1.6), mat);
    top.position.y = size;
    const bot = new THREE.Mesh(new THREE.BoxGeometry(size * 2, thick, thick * 1.6), mat);
    bot.position.y = -size;
    const left = new THREE.Mesh(new THREE.BoxGeometry(thick, size * 2, thick * 1.6), mat);
    left.position.x = -size;
    const right = new THREE.Mesh(new THREE.BoxGeometry(thick, size * 2, thick * 1.6), mat);
    right.position.x = size;

    frameGroup.add(top, bot, left, right);
    frameGroup.position.z = (2.5 - i) * 1.15;
    group.add(frameGroup);
    frames.push({ frameGroup, idx: i });
  }

  return {
    group,
    materials,
    update(time, audio, motionScale) {
      group.rotation.y = Math.sin(time * 0.16 * motionScale) * 0.38;
      frames.forEach(({ frameGroup, idx }) => {
        const dir = idx % 2 === 0 ? 1 : -1;
        frameGroup.rotation.z = time * 0.12 * motionScale * dir + idx * 0.18 + audio.mids * 0.2 * dir;
        const breathe = 1 + audio.bass * 0.16 + Math.sin(time * 1.2 + idx * 0.5) * 0.05;
        frameGroup.scale.setScalar(breathe);
      });
    },
  };
}

function buildMicroscopic() {
  const group = new THREE.Group();
  const materials = [];
  const organelles = [];

  // Delicate Radiolarian Wireframe Endoskeleton
  const shellGeo = new THREE.IcosahedronGeometry(2.45, 2);
  const wireMat = new THREE.MeshBasicMaterial({
    color: 0x8ef9f3,
    wireframe: true,
    transparent: true,
    opacity: 0.45,
    blending: THREE.AdditiveBlending,
  });
  const shell = new THREE.Mesh(shellGeo, wireMat);
  group.add(shell);

  // Outer translucent membrane
  const memMat = createFocalMaterial(0.0, 7.1);
  materials.push(memMat);
  const membrane = new THREE.Mesh(new THREE.IcosahedronGeometry(2.2, 3), memMat);
  group.add(membrane);

  // 6 Inner Mitosis Organelle Spheres
  for (let i = 0; i < 6; i++) {
    const oMat = createFocalMaterial(2.0, 7.6 + i * 0.4);
    materials.push(oMat);
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.38 + (i % 2) * 0.14, 24, 20), oMat);
    group.add(sphere);
    organelles.push({ sphere, idx: i });
  }

  return {
    group,
    materials,
    wireMat,
    update(time, audio, motionScale, weight, colors) {
      shell.rotation.y = time * 0.15 * motionScale;
      shell.rotation.x = -time * 0.11 * motionScale;
      wireMat.color.copy(colors.highlight);
      wireMat.opacity = 0.36 * weight * (0.8 + audio.highs * 0.6);

      membrane.material.uniforms.uOpacity.value = 0.34 * weight;
      membrane.scale.setScalar(1 + audio.bass * 0.2);

      organelles.forEach(({ sphere, idx }) => {
        const a = time * 0.55 * motionScale + idx * 1.047;
        const r = 0.75 + Math.sin(time * 0.9 + idx) * 0.35 + audio.mids * 0.35;
        sphere.position.set(
          Math.cos(a) * r,
          Math.sin(a * 1.3 + idx) * r * 0.7,
          Math.sin(a) * r
        );
      });
    },
  };
}

function buildLandscape() {
  const group = new THREE.Group();
  const materials = [];
  const monoliths = [];

  // Rolling Topographic Contour Horizon
  const terrainGeo = new THREE.PlaneGeometry(24, 20, 76, 64);
  terrainGeo.rotateX(-Math.PI / 2);
  const terrainMat = createRibbonMaterial(8.2, 0.92);
  materials.push(terrainMat);
  const terrain = new THREE.Mesh(terrainGeo, terrainMat);
  terrain.position.y = -2.1;
  group.add(terrain);

  // Sky Aurora Ribbon Veil above horizon
  const skyGeo = new THREE.PlaneGeometry(18, 4.5, 48, 16);
  const skyMat = createRibbonMaterial(9.4, 0.15);
  materials.push(skyMat);
  const skyAurora = new THREE.Mesh(skyGeo, skyMat);
  skyAurora.position.set(0, 2.5, -3.5);
  skyAurora.rotation.x = 0.25;
  group.add(skyAurora);

  // 3 Levitating Horizon Monoliths
  for (let i = 0; i < 3; i++) {
    const mMat = createFocalMaterial(1.0, 8.8 + i);
    materials.push(mMat);
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.65 + (i === 1 ? 0.35 : 0), 0), mMat);
    m.scale.set(0.75, 1.9, 0.75);
    m.position.set((i - 1) * 3.1, 0.8 + (i === 1 ? 0.6 : 0), -1.2);
    group.add(m);
    monoliths.push({ m, idx: i });
  }

  return {
    group,
    materials,
    update(time, audio, motionScale) {
      terrain.material.uniforms.uFlow.value = (0.65 + audio.bass * 1.1) * motionScale;
      skyAurora.material.uniforms.uFlow.value = (0.85 + audio.mids * 1.2) * motionScale;
      monoliths.forEach(({ m, idx }) => {
        m.position.y = (idx === 1 ? 1.35 : 0.75) + Math.sin(time * 0.9 * motionScale + idx * 1.5) * 0.35;
        m.rotation.y = time * 0.28 * motionScale * (idx % 2 === 0 ? 1 : -1);
      });
    },
  };
}

function buildGeometric() {
  const group = new THREE.Group();
  const materials = [];

  // Sacred Nested Polyhedra + Luminous Edges
  const outerMat = createFocalMaterial(4.0, 10.1);
  const midMat = createFocalMaterial(1.0, 10.6);
  const innerMat = createFocalMaterial(4.0, 11.2);
  materials.push(outerMat, midMat, innerMat);

  const outerGeo = new THREE.DodecahedronGeometry(2.55, 0);
  const outerEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(outerGeo),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 })
  );

  const mid = new THREE.Mesh(new THREE.OctahedronGeometry(1.75, 0), midMat);
  const inner = new THREE.Mesh(new THREE.IcosahedronGeometry(1.02, 0), innerMat);

  // Subtle translucent faces on outer cage
  const outerMesh = new THREE.Mesh(outerGeo, outerMat);
  group.add(outerEdges, outerMesh, mid, inner);

  return {
    group,
    materials,
    outerEdges,
    update(time, audio, motionScale, weight, colors) {
      outerEdges.rotation.y = time * 0.22 * motionScale;
      outerEdges.rotation.x = time * 0.14 * motionScale;
      outerMesh.rotation.copy(outerEdges.rotation);
      outerMesh.material.uniforms.uOpacity.value = 0.24 * weight;

      outerEdges.material.color.copy(colors.highlight);
      outerEdges.material.opacity = 0.8 * weight;

      mid.rotation.y = -time * 0.34 * motionScale;
      mid.rotation.z = time * 0.21 * motionScale;
      mid.material.uniforms.uOpacity.value = 0.62 * weight;
      mid.scale.setScalar(1 + audio.mids * 0.22);

      inner.rotation.x = time * 0.48 * motionScale;
      inner.rotation.y = time * 0.38 * motionScale;
      inner.scale.setScalar(1 + audio.bass * 0.32 + audio.onset * 0.2);
    },
  };
}

function buildPainterly() {
  const group = new THREE.Group();
  const materials = [];
  const strokes = [];

  // Soft painterly central cloud wash
  const centerMat = createFocalMaterial(3.0, 12.1);
  materials.push(centerMat);
  const center = new THREE.Mesh(new THREE.SphereGeometry(1.25, 32, 24), centerMat);
  group.add(center);

  // 12 Sculptural Impasto Brushstroke Ribbons swirling in a 3D vortex
  for (let i = 0; i < 12; i++) {
    const radius = 1.6 + (i % 4) * 0.72;
    const arc = Math.PI * (0.65 + (i % 3) * 0.25);
    const startAngle = (i / 12) * Math.PI * 2;
    const pts = [];
    for (let s = 0; s <= 8; s++) {
      const t = s / 8;
      const a = startAngle + t * arc;
      const y = ((i % 5) - 2) * 0.55 + Math.sin(t * Math.PI + i) * 0.65;
      pts.push(new THREE.Vector3(Math.cos(a) * radius, y, Math.sin(a) * radius));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(curve, 32, 0.16 + (i % 3) * 0.06, 8, false);
    const mat = createFocalMaterial(3.0, 12.5 + i * 0.37);
    materials.push(mat);
    const stroke = new THREE.Mesh(geo, mat);
    group.add(stroke);
    strokes.push({ stroke, idx: i });
  }

  return {
    group,
    materials,
    update(time, audio, motionScale, weight) {
      center.material.uniforms.uOpacity.value = 0.72 * weight;
      center.scale.setScalar(1 + audio.bass * 0.24);
      group.rotation.y = time * 0.16 * motionScale;
      strokes.forEach(({ stroke, idx }) => {
        stroke.rotation.y = Math.sin(time * 0.4 * motionScale + idx * 0.5) * 0.25;
        stroke.rotation.z = Math.cos(time * 0.3 * motionScale + idx) * (0.1 + audio.mids * 0.16);
      });
    },
  };
}

function buildSurreal() {
  const group = new THREE.Group();
  const materials = [];
  const shards = [];

  // Twisted Möbius Continuum Sculpture
  const mobiusMat = createFocalMaterial(2.0, 14.2);
  materials.push(mobiusMat);
  const mobius = new THREE.Mesh(buildMobiusGeometry(2.15, 0.68, 120, 18), mobiusMat);
  group.add(mobius);

  // 8 Levitating Surreal Mirror Shards orbiting asymmetrically
  for (let i = 0; i < 8; i++) {
    const sMat = createFocalMaterial(1.0, 15.0 + i * 0.45);
    materials.push(sMat);
    const shard = new THREE.Mesh(new THREE.TetrahedronGeometry(0.42 + (i % 3) * 0.12, 0), sMat);
    shard.scale.set(0.55, 1.5, 0.28);
    group.add(shard);
    shards.push({ shard, idx: i });
  }

  return {
    group,
    materials,
    update(time, audio, motionScale) {
      mobius.rotation.y = time * 0.24 * motionScale;
      mobius.rotation.x = Math.sin(time * 0.31 * motionScale) * 0.38;
      mobius.scale.setScalar(1 + audio.bass * 0.18 + audio.onset * 0.14);

      shards.forEach(({ shard, idx }) => {
        const a = -time * 0.32 * motionScale + (idx / 8) * Math.PI * 2;
        const r = 3.25 + Math.sin(time * 0.9 + idx) * 0.45;
        shard.position.set(
          Math.cos(a) * r,
          Math.sin(a * 2 + idx) * 1.35,
          Math.sin(a) * r
        );
        shard.rotation.x = time * 0.6 * motionScale + idx;
        shard.rotation.z = time * 0.4 * motionScale;
      });
    },
  };
}

const BUILDERS = {
  organic: buildOrganic,
  crystalline: buildCrystalline,
  fluid: buildFluid,
  celestial: buildCelestial,
  architectural: buildArchitectural,
  microscopic: buildMicroscopic,
  landscape: buildLandscape,
  geometric: buildGeometric,
  painterly: buildPainterly,
  surreal: buildSurreal,
};

/**
 * Manages all 10 aesthetic families, ensuring one clear focal idea leads
 * with smooth non-cutting transitions and optional subtle harmonic secondary blending.
 */
export class MotifStage {
  constructor() {
    this.root = new THREE.Group();
    this.instances = {};

    Object.entries(BUILDERS).forEach(([id, buildFn]) => {
      const inst = buildFn();
      inst.weight = 0;
      inst.role = 'focal'; // 'focal' | 'secondary'
      inst.group.visible = false;
      this.root.add(inst.group);
      this.instances[id] = inst;
    });
  }

  /**
   * Updates weights and animates only active motifs (inactive motifs stay hidden for zero GPU cost).
   */
  update({
    time,
    dt,
    audio,
    colors,
    focalId,
    prevFocalId,
    transitionProgress, // 0..1
    transitionType,
    secondaryId,
    secondaryWeight, // 0..0.34
    controls,
    shaderQuality,
  }) {
    const smoothT = 0.5 - 0.5 * Math.cos(Math.min(1, Math.max(0, transitionProgress)) * Math.PI);

    Object.entries(this.instances).forEach(([id, inst]) => {
      let targetW = 0;
      let isSecondary = false;

      if (id === focalId) {
        targetW = prevFocalId && prevFocalId !== focalId ? smoothT : 1.0;
      } else if (id === prevFocalId && prevFocalId !== focalId) {
        targetW = 1.0 - smoothT;
      } else if (secondaryId && id === secondaryId && id !== focalId) {
        targetW = secondaryWeight;
        isSecondary = true;
      }

      // Smoothly converge weight so sudden overrides still dissolve gracefully
      inst.weight += (targetW - inst.weight) * Math.min(1, dt * 4.5);

      if (inst.weight < 0.008) {
        inst.group.visible = false;
        return;
      }

      inst.group.visible = true;
      const w = Math.min(1, inst.weight);

      // Transition spatial choreography (never a hard cut!)
      let scaleMod = 1.0;
      if (isSecondary) {
        // Secondary supporting motif stays outer/subtle so it enriches without obscuring focal centerpiece
        scaleMod = 1.38;
      } else if (transitionType === 'radial-iris') {
        scaleMod = 0.68 + 0.32 * w;
      } else if (transitionType === 'harmonic-bloom') {
        scaleMod = 0.88 + 0.12 * w + (1 - w) * 0.18;
      } else {
        scaleMod = 0.84 + 0.16 * w;
      }
      inst.group.scale.setScalar(scaleMod);

      // Update shared uniforms on all materials of this motif
      inst.materials.forEach((mat) => {
        const u = mat.uniforms;
        if (!u) return;
        u.uTime.value = time;
        u.uBass.value = audio.bass;
        u.uMids.value = audio.mids;
        u.uHighs.value = audio.highs;
        if (u.uOnset) u.uOnset.value = audio.onset;
        if (u.uDetail) u.uDetail.value = controls.detail;
        if (u.uQuality) u.uQuality.value = shaderQuality;
        if (u.uMorphAmount) {
          const morphBoost = transitionType === 'morph-dissolve' ? (1 - w) * 0.55 : 0;
          u.uMorphAmount.value = 0.35 + controls.detail * 0.35 + morphBoost;
        }
        if (u.uOpacity) u.uOpacity.value = isSecondary ? w * 0.65 : w;
        if (u.uPrimary) u.uPrimary.value.copy(colors.primary);
        if (u.uSecondary) u.uSecondary.value.copy(colors.secondary);
        if (u.uAccent) u.uAccent.value.copy(colors.accent);
        if (u.uHighlight) u.uHighlight.value.copy(colors.highlight);
      });

      // Run family-specific animation choreography
      inst.update(time, audio, controls.motion, w, colors);
    });
  }
}
