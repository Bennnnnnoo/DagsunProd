// Ashima Arts 3D simplex noise (MIT). https://github.com/ashima/webgl-noise
const simplexNoise = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`;

export const vertexShader = /* glsl */ `
uniform float uTime;
uniform vec2 uPlane;        // plane size in world units
uniform vec2 uMouse;        // pointer position in plane-local space
uniform float uMouseForce;  // 0 = idle, grows with pointer speed
uniform float uMouseRadius;
uniform float uPointSize;
uniform float uPixelRatio;

attribute float aRandom;

varying float vAlpha;
varying float vHeat;

${simplexNoise}

void main() {
  vec3 p = vec3(position.xy * uPlane, 0.0);
  float t = uTime * 0.12;
  vec2 q = p.xy * 0.55;

  // Layered noise: slow large swell + finer ripple, plus a lateral drift.
  float swell = snoise(vec3(q, t));
  float ripple = snoise(vec3(q * 2.3 + 5.0, t * 1.6));
  p.z += swell * 0.55 + ripple * 0.12;
  p.xy += vec2(snoise(vec3(q + 11.0, t)), snoise(vec3(q + 23.0, t))) * 0.12;

  // Pointer: radial push + swirl + lift, gaussian falloff.
  vec2 d = p.xy - uMouse;
  float dist = length(d);
  float falloff = exp(-(dist * dist) / (uMouseRadius * uMouseRadius)) * uMouseForce;
  vec2 dir = d / max(dist, 1e-4);
  p.xy += dir * falloff * 0.45 + vec2(-dir.y, dir.x) * falloff * 0.35;
  p.z += falloff * 0.9;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;

  float size = uPointSize * (0.6 + aRandom * 0.8) * (1.0 + falloff * 1.5);
  gl_PointSize = size * uPixelRatio / -mv.z;

  vHeat = clamp(falloff, 0.0, 1.0);
  vAlpha = (0.25 + 0.75 * smoothstep(-0.6, 0.7, p.z)) * (0.5 + aRandom * 0.5);
}
`;

export const fragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uAccent;

varying float vAlpha;
varying float vHeat;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c);
  if (r > 0.5) discard;
  float soft = smoothstep(0.5, 0.0, r);
  vec3 color = mix(uColor, uAccent, vHeat);
  gl_FragColor = vec4(color, soft * vAlpha);
}
`;
