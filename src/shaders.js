/**
 * visual-eyes-her — Verified GLSL Shader Suite
 *
 * Includes:
 *  1. Atmospheric Nebula Dome (guarantees vivid, non-black living depth at all times)
 *  2. Multi-Aesthetic Focal Surface Shader (organic, crystalline, fluid, painterly, architectural/geometric)
 *  3. Flowing Aurora / Topographic Ribbon Shader
 *  4. Multi-Behavior Adaptive Particle Shader (orbital, vortex, updraft, curl, radial, suspended dust)
 *
 * Note: Uses THREE.ShaderMaterial built-in attributes (position, normal, uv) cleanly
 * and concatenates GLSL_NOISE into every stage that calls noise() or fbm().
 */

export const GLSL_NOISE = /* glsl */ `
float vehHash(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}

float vehNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);

  return mix(
    mix(
      mix(vehHash(i + vec3(0.0, 0.0, 0.0)), vehHash(i + vec3(1.0, 0.0, 0.0)), f.x),
      mix(vehHash(i + vec3(0.0, 1.0, 0.0)), vehHash(i + vec3(1.0, 1.0, 0.0)), f.x),
      f.y
    ),
    mix(
      mix(vehHash(i + vec3(0.0, 0.0, 1.0)), vehHash(i + vec3(1.0, 0.0, 1.0)), f.x),
      mix(vehHash(i + vec3(0.0, 1.0, 1.0)), vehHash(i + vec3(1.0, 1.0, 1.0)), f.x),
      f.y
    ),
    f.z
  );
}

float vehFbm(vec3 p, float quality) {
  float v = 0.0;
  float a = 0.5;
  v += a * vehNoise(p);
  p = p * 2.02 + vec3(17.1, 31.7, 11.3);
  a *= 0.5;
  v += a * vehNoise(p);
  if (quality > 0.45) {
    p = p * 2.03 + vec3(13.7, 7.9, 23.1);
    a *= 0.5;
    v += a * vehNoise(p) * clamp((quality - 0.45) * 3.0, 0.0, 1.0);
  }
  if (quality > 0.8) {
    p = p * 2.01 + vec3(5.3, 19.4, 29.2);
    a *= 0.5;
    v += a * vehNoise(p) * clamp((quality - 0.8) * 5.0, 0.0, 1.0);
  }
  return v;
}
`;

// ============================================================================
// 1. ATMOSPHERIC NEBULA DOME SHADER (Vivid, non-black cosmic canvas)
// ============================================================================
export const backdropVert = /* glsl */ `
varying vec3 vWorldDir;
varying vec2 vUv;

void main() {
  vUv = uv;
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldDir = normalize(worldPos.xyz);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const backdropFrag = /* glsl */ `
${GLSL_NOISE}

uniform float uTime;
uniform float uBass;
uniform float uMids;
uniform float uHighs;
uniform float uBrightness;
uniform float uQuality;
uniform float uStereoPan;
uniform vec3 uBgDeep;
uniform vec3 uBgMid;
uniform vec3 uPrimary;
uniform vec3 uSecondary;
uniform vec3 uAccent;

varying vec3 vWorldDir;
varying vec2 vUv;

void main() {
  vec3 dir = normalize(vWorldDir);
  dir.x += uStereoPan * 0.12;

  // Vertical & radial atmospheric gradient
  float horizon = 1.0 - abs(dir.y * 0.85);
  horizon = pow(clamp(horizon, 0.0, 1.0), 1.6);

  // Slow flowing volumetric nebula curtains
  vec3 flowCoord = dir * 2.4 + vec3(uTime * 0.035, -uTime * 0.022, uTime * 0.028);
  float nebA = vehFbm(flowCoord, uQuality);
  float nebB = vehFbm(dir * 4.2 - vec3(uTime * 0.05, uTime * 0.03, -uTime * 0.04) + nebA * 1.1, uQuality);

  vec3 col = mix(uBgDeep, uBgMid, clamp(horizon * 0.8 + nebA * 0.45, 0.0, 1.0));

  // Luminous aurora veils
  float auroraMask = smoothstep(0.36, 0.82, nebB) * (0.42 + 0.35 * horizon + uBass * 0.22);
  vec3 auroraCol = mix(uPrimary, uSecondary, clamp(nebA * 1.3 + sin(uTime * 0.15) * 0.2, 0.0, 1.0));
  col += auroraCol * auroraMask * 0.52;

  // Warm accent mist near focal horizon
  float mist = smoothstep(0.48, 0.88, nebA * nebB * 1.7) * (0.22 + uMids * 0.28);
  col += uAccent * mist * 0.32;

  // Subtle distant starlight shimmer on high frequencies
  if (uQuality > 0.4) {
    float stars = vehNoise(dir * 48.0 + vec3(0.0, uTime * 0.04, 0.0));
    float twinkle = smoothstep(0.86, 0.98, stars) * (0.18 + uHighs * 0.45);
    col += mix(uSecondary, vec3(1.0), 0.5) * twinkle;
  }

  // Ensure a rich minimum atmospheric floor so it is never pitch black
  col = max(col, uBgDeep * 0.7 + vec3(0.018, 0.012, 0.035));
  col *= clamp(uBrightness, 0.25, 1.5);

  gl_FragColor = vec4(col, 1.0);
}
`;

// ============================================================================
// 2. MULTI-AESTHETIC FOCAL SURFACE SHADER
// uSurfaceStyle:
//   0.0 = Organic subsurface velvet
//   1.0 = Crystalline prismatic facet Fresnel
//   2.0 = Fluid silk / ferrofluid ripple
//   3.0 = Painterly soft wash
//   4.0 = Sacred geometric / architectural rim glow
// ============================================================================
export const focalVert = /* glsl */ `
${GLSL_NOISE}

uniform float uTime;
uniform float uBass;
uniform float uMids;
uniform float uHighs;
uniform float uOnset;
uniform float uDetail;
uniform float uQuality;
uniform float uSurfaceStyle;
uniform float uSeed;
uniform float uMorphAmount;

varying vec3 vNormalView;
varying vec3 vViewPos;
varying vec3 vLocalPos;
varying vec2 vUv;
varying float vNoise;

void main() {
  vUv = uv;
  vLocalPos = position;

  float freq = (1.35 + uDetail * 1.1) * (uSurfaceStyle > 0.5 && uSurfaceStyle < 1.5 ? 2.1 : 1.0);
  vec3 samplePos = position * freq + vec3(uSeed * 7.3 + uTime * 0.22, uTime * 0.17, -uTime * 0.19);
  float n = vehFbm(samplePos, uQuality);

  // Style-specific displacement signature
  float amp = 0.08 + uMorphAmount * 0.24;
  if (uSurfaceStyle > 1.5 && uSurfaceStyle < 2.5) {
    // Fluid silk: smoother higher-amplitude flowing ripples
    float wave = sin(position.x * 2.6 + uTime * 1.6) * cos(position.y * 2.2 - uTime * 1.3) * 0.5 + 0.5;
    n = mix(n, wave, 0.45);
    amp *= 1.35;
  } else if (uSurfaceStyle > 0.5 && uSurfaceStyle < 1.5) {
    // Crystalline: terraced faceted displacement
    n = floor(n * 6.0) / 6.0;
    amp *= 0.7;
  } else if (uSurfaceStyle > 3.5) {
    // Architectural / sacred geometric: crisp subtle breathing, preserves clean form
    amp *= 0.32;
  }

  float audioDrive = 1.0 + uBass * 0.65 + uOnset * 0.35;
  vec3 displaced = position + normal * ((n - 0.45) * amp * audioDrive);

  vec4 mvPos = modelViewMatrix * vec4(displaced, 1.0);
  vViewPos = -mvPos.xyz;
  vNormalView = normalize(normalMatrix * normal);
  vNoise = n;

  gl_Position = projectionMatrix * mvPos;
}
`;

export const focalFrag = /* glsl */ `
${GLSL_NOISE}

uniform float uTime;
uniform float uBass;
uniform float uMids;
uniform float uHighs;
uniform float uOnset;
uniform float uOpacity;
uniform float uSurfaceStyle;
uniform float uQuality;
uniform vec3 uPrimary;
uniform vec3 uSecondary;
uniform vec3 uAccent;
uniform vec3 uHighlight;

varying vec3 vNormalView;
varying vec3 vViewPos;
varying vec3 vLocalPos;
varying vec2 vUv;
varying float vNoise;

void main() {
  if (uOpacity <= 0.005) discard;

  vec3 N = normalize(vNormalView);
  vec3 V = normalize(vViewPos);
  float fresnel = pow(1.0 - abs(dot(N, V)), 2.2);

  // Key directional light + hemisphere fill in view space
  vec3 L1 = normalize(vec3(0.55, 0.75, 0.45));
  vec3 L2 = normalize(vec3(-0.65, -0.35, 0.6));
  float diff1 = max(dot(N, L1), 0.0);
  float diff2 = max(dot(N, L2), 0.0);

  // Iridescent color blend across form + noise
  float band = clamp(vNoise * 0.85 + sin(vLocalPos.y * 0.8 + uTime * 0.45) * 0.25, 0.0, 1.0);
  vec3 baseCol = mix(uPrimary, uSecondary, band);
  baseCol = mix(baseCol, uAccent, fresnel * (0.45 + uMids * 0.35));

  vec3 col = baseCol * (0.38 + diff1 * 0.65 + diff2 * 0.28);

  if (uSurfaceStyle > 0.5 && uSurfaceStyle < 1.5) {
    // Crystalline: crisp specular glints & dispersion rim
    vec3 H = normalize(L1 + V);
    float spec = pow(max(dot(N, H), 0.0), 28.0);
    col += uHighlight * spec * (0.85 + uHighs * 0.9);
    col += mix(uSecondary, uHighlight, 0.5) * pow(fresnel, 1.5) * 0.95;
  } else if (uSurfaceStyle > 2.5 && uSurfaceStyle < 3.5) {
    // Painterly wash:stippled brush texture & soft pastel bloom
    float brush = vehNoise(vLocalPos * 6.5 + vec3(uTime * 0.25));
    col = mix(col, uAccent, smoothstep(0.45, 0.85, brush) * 0.45);
    col += uHighlight * fresnel * 0.45;
  } else {
    // Organic / Fluid / Sacred rim luminescence
    col += mix(uSecondary, uHighlight, 0.45) * fresnel * (0.75 + uHighs * 0.65);
  }

  // Gentle audio-reactive inner core luminescence (anti-flash bounded)
  float innerGlow = 0.88 + vNoise * 0.42 + uBass * 0.38 + uOnset * 0.28;
  col *= clamp(innerGlow, 0.5, 2.1);

  float alpha = clamp(uOpacity * (0.76 + fresnel * 0.24), 0.0, 1.0);
  gl_FragColor = vec4(col, alpha);
}
`;

// ============================================================================
// 3. FLOWING AURORA / SILK / CONTOUR RIBBON SHADER
// ============================================================================
export const ribbonVert = /* glsl */ `
${GLSL_NOISE}

uniform float uTime;
uniform float uBass;
uniform float uMids;
uniform float uFlow;
uniform float uQuality;
uniform float uSeed;

varying vec2 vUv;
varying float vWave;
varying float vElev;

void main() {
  vUv = uv;
  vec3 p = position;

  float t = uTime * (0.35 + uFlow * 0.35);
  float n1 = vehFbm(vec3(p.xz * 0.28 + uSeed * 3.1, t * 0.45), uQuality);
  float wave = sin(p.x * 0.55 + t * 1.4 + uSeed) * cos(p.z * 0.35 - t * 0.9) * 0.5;

  float lift = (n1 - 0.45) * (1.5 + uBass * 1.6) + wave * (0.55 + uMids * 0.7);
  p.y += lift;

  vWave = n1;
  vElev = lift;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

export const ribbonFrag = /* glsl */ `
${GLSL_NOISE}

uniform float uTime;
uniform float uHighs;
uniform float uOpacity;
uniform float uContourLines;
uniform vec3 uPrimary;
uniform vec3 uSecondary;
uniform vec3 uAccent;
uniform vec3 uHighlight;

varying vec2 vUv;
varying float vWave;
varying float vElev;

void main() {
  if (uOpacity <= 0.005) discard;

  float travel = fract(vUv.y * 2.0 - uTime * 0.14);
  vec3 col = mix(uPrimary, uSecondary, sin(travel * 6.2831 + vWave * 3.0) * 0.5 + 0.5);
  col = mix(col, uAccent, smoothstep(0.45, 0.9, vWave) * 0.55);

  // Optional topographic contour lines (used strongly in Landscape / Architectural)
  if (uContourLines > 0.05) {
    float line = abs(fract(vElev * 2.2 - uTime * 0.12) - 0.5) * 2.0;
    float crisp = 1.0 - smoothstep(0.0, 0.16, line);
    col += uHighlight * crisp * uContourLines * (0.65 + uHighs * 0.5);
  }

  // Soft edge feathering so ribbons never look boxy
  float edgeX = sin(clamp(vUv.x, 0.0, 1.0) * 3.14159);
  float edgeY = sin(clamp(vUv.y, 0.0, 1.0) * 3.14159);
  float feather = pow(max(0.0, edgeX * edgeY), 0.65);

  float shimmer = 1.0 + uHighs * 0.55;
  gl_FragColor = vec4(col * shimmer, clamp(feather * uOpacity * 0.82, 0.0, 0.92));
}
`;

// ============================================================================
// 4. ADAPTIVE MULTI-BEHAVIOR PARTICLE SHADER
// uBehavior:
//   0 = Orbital Keplerian
//   1 = Spiral Vortex
//   2 = Luminous Updraft
//   3 = Curl Flock
//   4 = Harmonic Radial Shells
//   5 = Suspended Starlight Dust
// ============================================================================
export const particleVert = /* glsl */ `
uniform float uTime;
uniform float uBass;
uniform float uMids;
uniform float uHighs;
uniform float uOnset;
uniform float uPixelRatio;
uniform float uBehavior;
uniform float uActiveRatio;
uniform float uMotionScale;
uniform float uStereoPan;

attribute vec3 aRandom;     // x: seed (0..1), y: sizeScale (0.5..1.8), z: colorMix (0..1)
attribute float aIndexNorm; // 0..1 normalized particle index for graceful budget fading

varying float vColorMix;
varying float vSeed;
varying float vAlpha;

void main() {
  vColorMix = aRandom.z;
  vSeed = aRandom.x;

  // Smoothly fade particles near the active quality/density ceiling (zero pop!)
  float activeMask = 1.0 - smoothstep(max(0.02, uActiveRatio - 0.08), uActiveRatio, aIndexNorm);
  if (activeMask <= 0.005) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vAlpha = 0.0;
    return;
  }

  vec3 p = position;
  float t = uTime * (0.25 + 0.65 * uMotionScale);
  float seed = aRandom.x * 6.28318;

  if (uBehavior < 0.5) {
    // 0: Keplerian Orbital
    float radius = length(p.xz) + 0.001;
    float ang = atan(p.z, p.x) + t * (1.6 / (1.5 + radius * 0.28)) * (0.7 + aRandom.y * 0.5);
    p.x = cos(ang) * radius;
    p.z = sin(ang) * radius;
    p.y += sin(t * 1.4 + seed) * (0.35 + uMids * 0.65);
  } else if (uBehavior < 1.5) {
    // 1: Spiral Vortex
    float h = mod(p.y + 14.0 + t * 2.2, 28.0) - 14.0;
    float funnel = 0.35 + abs(h) * 0.12 + uBass * 0.35;
    float ang = atan(p.z, p.x) + t * 1.1 + h * 0.25;
    float r = length(p.xz) * funnel * 0.65;
    p.x = cos(ang) * r;
    p.z = sin(ang) * r;
    p.y = h;
  } else if (uBehavior < 2.5) {
    // 2: Luminous Updraft
    p.y = mod(p.y + 15.0 + t * (1.2 + aRandom.x * 1.4), 30.0) - 15.0;
    p.x += sin(t * 0.9 + p.y * 0.25 + seed) * (0.6 + uMids * 0.8);
    p.z += cos(t * 0.8 + p.y * 0.25 + seed) * (0.6 + uMids * 0.8);
  } else if (uBehavior < 3.5) {
    // 3: Turbulent Curl Flock
    p.x += sin(t * 1.1 + p.y * 0.35 + seed) * 1.4;
    p.y += cos(t * 0.95 + p.z * 0.35 + seed) * 1.2;
    p.z += sin(t * 1.05 + p.x * 0.35 + seed) * 1.4;
  } else if (uBehavior < 4.5) {
    // 4: Harmonic Radial Bloom Shells
    vec3 dir = normalize(p + vec3(0.0001));
    float shell = 4.5 + floor(aRandom.x * 4.0) * 3.2 + sin(t * 1.5 + seed) * (0.8 + uBass * 2.2);
    p = dir * (shell + uOnset * 2.0);
  } else {
    // 5: Suspended Starlight Dust (gentle calm drift)
    p.x += sin(t * 0.35 + seed) * 0.55;
    p.y += cos(t * 0.28 + seed * 1.3) * 0.55;
    p.z += sin(t * 0.31 + seed * 0.7) * 0.55;
  }

  // Subtle stereo pan sway & radial audio breath
  p.x += uStereoPan * 0.9 * (0.4 + aRandom.x * 0.6);
  p *= 1.0 + uBass * 0.14 + uOnset * 0.16;

  vec4 mvPos = modelViewMatrix * vec4(p, 1.0);
  float dist = max(1.8, -mvPos.z);

  float basePx = (3.2 + aRandom.y * 4.8) * (0.85 + uHighs * 0.65 + uMids * 0.35);
  float pointPx = basePx * uPixelRatio * (18.0 / dist);
  gl_PointSize = clamp(pointPx, 1.4, 38.0);

  // Fade smoothly near camera and far distance
  float nearFade = smoothstep(1.5, 4.2, dist);
  float farFade = 1.0 - smoothstep(26.0, 48.0, dist);
  vAlpha = activeMask * nearFade * farFade * (0.52 + uHighs * 0.35 + sin(uTime * 2.8 + seed) * 0.14);

  gl_Position = projectionMatrix * mvPos;
}
`;

export const particleFrag = /* glsl */ `
uniform vec3 uPrimary;
uniform vec3 uSecondary;
uniform vec3 uAccent;
uniform vec3 uHighlight;
uniform float uHighs;

varying float vColorMix;
varying float vSeed;
varying float vAlpha;

void main() {
  if (vAlpha <= 0.005) discard;

  vec2 uv = gl_PointCoord - vec2(0.5);
  float d = length(uv) * 2.0;
  if (d > 1.0) discard;

  // Soft radial halo + crisp luminous core
  float halo = pow(1.0 - d, 2.2);
  float core = smoothstep(0.35, 0.0, d);

  vec3 c1 = mix(uPrimary, uSecondary, vColorMix);
  vec3 col = mix(c1, uAccent, step(0.72, vSeed) * 0.65);
  col = mix(col, uHighlight, core * (0.55 + uHighs * 0.35));

  gl_FragColor = vec4(col * (0.85 + core * 0.9), clamp(vAlpha * halo, 0.0, 1.0));
}
`;
