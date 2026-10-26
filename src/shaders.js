/**
 * visual-eyes-her — shaders
 * Custom GLSL for the transcendent dreamscape.
 * Noise, volumetric glow, liquid ribbon flow, and particle swarms.
 */

// Reusable 3D value noise (organic, cheap, coherent)
const noise3d = `
float hash(vec3 p) {
  p = fract(p * vec3(123.34, 456.21, 789.65));
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y * 157.0 + p.z * 113.0) * 43758.5453);
}
float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n = i.x + i.y * 157.0 + 113.0 * i.z;
  return mix(
    mix(mix(hash(vec3(n, 0.0, 0.0)), hash(vec3(n + 1.0, 0.0, 0.0)), f.x),
        mix(hash(vec3(n, 1.0, 0.0)), hash(vec3(n + 1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(hash(vec3(n, 0.0, 1.0)), hash(vec3(n + 1.0, 0.0, 1.0)), f.x),
        mix(hash(vec3(n, 1.0, 1.0)), hash(vec3(n + 1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
`;

// ------------------------------------------------------------------
// Mesh material (fractal architecture & tessellations)
// Vertex displacement by noise + breathing; emissive iridescent color.
export const meshVert = `
uniform float uTime;
uniform float uBass;
uniform float uMids;
uniform float uPulse;
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec3 aColor;
attribute float aSeed;
varying vec3 vColor;
varying float vNoise;
varying vec3 vPosition;
void main() {
  vPosition = position;
  vec3 p = position + normal * aSeed * 0.05;
  float n = noise(p * 1.4 + uTime * 0.15);
  n += noise(p * 4.2 + uTime * 0.3) * 0.5;
  float breathe = 1.0 + uBass * 0.6 + sin(uTime * 2.0 + aSeed) * 0.08 * uPulse;
  vec3 displaced = position + normal * (n * 0.18 + uBass * 0.35) * breathe;
  vNoise = n;
  vColor = aColor;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
}
`;

export const meshFrag = `
uniform float uTime;
uniform float uBass;
uniform float uMids;
uniform float uHighs;
uniform vec3 uColorA;
uniform vec3 uColorB;
varying vec3 vColor;
varying float vNoise;
varying vec3 vPosition;
void main() {
  float shift = sin(uTime * 0.7 + vPosition.x * 0.5) * 0.5 + 0.5;
  vec3 color = mix(vColor, uColorA, vNoise * 0.5 + shift * 0.3);
  color = mix(color, uColorB, uMids * 0.4);
  float glow = 1.0 + vNoise * 1.2 + uHighs * 1.5;
  color *= glow;
  // subtle chromatic fringe hint via color channel offset simulation
  float vignette = 1.0 - length(vPosition.xy) * 0.05;
  gl_FragColor = vec4(color * vignette, 0.95);
}
`;

// ------------------------------------------------------------------
// Liquid light river (ribbon)
// Flowing noise-displaced ribbon with chromatic gradient.
export const ribbonVert = `
uniform float uTime;
uniform float uBass;
uniform float uFlow;
attribute vec3 aPosition;
attribute vec2 aUv;
attribute vec3 aColor;
varying vec2 vUv;
varying vec3 vColor;
varying float vNoise;
void main() {
  vUv = aUv;
  vColor = aColor;
  vec3 p = position;
  float n = noise(p * 1.2 + uTime * 0.2 * uFlow) * 0.5;
  n += noise(p * 3.5 - uTime * 0.3 * uFlow) * 0.25;
  n += noise(p * 8.0 + uTime * 0.5) * 0.12;
  p += normal * (n * 0.4 + uBass * 0.25);
  // drift the ribbon forward along its length
  p.xz += vec2(sin(uTime * 0.5 + aUv.y) * 0.2, cos(uTime * 0.3 + aUv.y) * 0.15) * uFlow;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  vNoise = n;
}
`;

export const ribbonFrag = `
uniform float uTime;
uniform float uHighs;
uniform vec3 uColorA;
uniform vec3 uColorB;
varying vec2 vUv;
varying vec3 vColor;
varying float vNoise;
void main() {
  float t = vUv.y + uTime * 0.15;
  vec3 base = mix(uColorA, uColorB, sin(t * 1.3 + vUv.x) * 0.5 + 0.5);
  vec3 color = mix(base, vColor, 0.5);
  float spark = noise(vec3(vUv * 8.0, uTime * 2.0));
  float glow = 1.0 + smoothstep(0.7, 1.0, spark) * 1.5 + uHighs * 1.2;
  color *= glow;
  // alpha ribbon edges fade out
  float edge = 1.0 - abs(vUv.x * 2.0 - 1.0);
  edge = pow(edge, 1.2);
  gl_FragColor = vec4(color * edge, edge * 0.6);
}
`;

// ------------------------------------------------------------------
// Particle swarm
export const particleVert = `
uniform float uTime;
uniform float uMids;
uniform float uHighs;
uniform float uPulse;
attribute vec3 aPosition;
attribute vec3 aOffset;
attribute vec3 aColor;
attribute float aSize;
attribute float aSeed;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = aColor;
  vec3 p = position;
  // swirl + drift
  float angle = uTime * (0.15 + aSeed * 0.4) + aOffset.y * 0.5;
  float r = aOffset.x * 0.6 + uMids * 1.2;
  p.x += sin(angle) * r;
  p.z += cos(angle) * r;
  p.y += sin(uTime * 0.7 + aSeed * 3.0 + aOffset.z) * (0.15 + uMids * 0.4);
  // high-energy bursts kick particles outward
  float burst = uHighs * 2.0 + uPulse * 0.5;
  p += normalize(position) * burst * aSeed * 0.6;
  float size = aSize * (0.6 + uMids * 1.4 + uHighs * 1.2 + sin(uTime * 5.0 + aSeed) * 0.3);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = size;
  vAlpha = 0.5 + uHighs * 0.5;
}
`;

export const particleFrag = `
uniform float uHighs;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float r = length(gl_PointCoord - vec2(0.5));
  if (r > 0.5) discard;
  float glow = 1.0 - r * 2.0;
  glow = pow(glow, 1.4);
  vec3 color = vColor * (1.0 + uHighs * 0.8);
  // center hot spot
  color *= 0.6 + glow * 1.2;
  gl_FragColor = vec4(color, vAlpha * glow);
}
`;
