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
uniform vec2 uPlane;            // plane size in world units
uniform vec4 uTrail[TRAIL];     // pointer wake: xy = position, zw = velocity (plane-local)
uniform float uTrailLife[TRAIL]; // 1 = fresh, decays to 0
uniform float uTrailRadius;
uniform vec4 uBursts[BURSTS];    // sprite disruptions: xy = centre, z = start (uClock), w = set
uniform float uClock;            // real seconds, for the disruptions
uniform vec3 uSources[SOURCES]; // speaker drivers: xy = position (plane-local), z = strength
uniform float uBeatAge;         // seconds since the latest kick
uniform float uBeatInterval;    // seconds between kicks
uniform float uWarp;            // fluid folding amount, 1 = default
uniform float uBass;            // kick push strength, 1 = default
uniform vec2 uFocus;            // where the field is densest (the speaker), plane-local
uniform float uFocusRadius;     // how far the dense area reaches
uniform float uFocusFloor;      // visibility left at the edges, 0..1
uniform float uFocusBoost;      // visibility at the speaker, 1 = unchanged
uniform float uClumps;          // extra visibility in drifting random regions
uniform sampler2D uGlyphMask;   // glyph shapes over the screen (red = signs, green = halo)
uniform float uGlyphStrength;   // 0 hides them (other views), 1 = full
uniform float uPointSize;
uniform float uPixelRatio;

attribute float aRandom;

varying float vAlpha;
varying float vHeat;

${simplexNoise}

vec2 noise2(vec3 p) {
  return vec2(snoise(p), snoise(p + vec3(31.4, 17.7, 0.0)));
}

float fbm(vec3 p) {
  return snoise(p) * 0.6 + snoise(p * 2.1 + 3.7) * 0.3 + snoise(p * 4.3 + 8.1) * 0.1;
}

void main() {
  vec3 p = vec3(position.xy * uPlane, 0.0);

  // The glyphs are made of the field: particles whose resting spot falls inside
  // one are inked boldly and flow with everything else, a little more gently so
  // the sign still reads while it bends.
  vec2 home = p.xy; // undisplaced, so the signs (and clumps) don't jitter with the flow
  vec4 homeClip = projectionMatrix * modelViewMatrix * vec4(home, 0.0, 1.0);
  vec2 glyphMask = texture2D(uGlyphMask, homeClip.xy / homeClip.w * 0.5 + 0.5).rg * uGlyphStrength;
  float glyph = glyphMask.r;
  // The field clears out around each sign, so the sign stands out.
  float clearing = glyphMask.g * (1.0 - min(glyph * 3.0, 1.0));
  float hold = mix(1.0, GLYPH_FLOW, min(glyph * 2.0, 1.0));
  float t = uTime * 0.08;
  vec2 q = p.xy * 0.45;

  // Pointer wake: drag along the stroke and record how stirred this spot is.
  vec2 drag = vec2(0.0);
  float stir = 0.0;
  for (int i = 0; i < TRAIL; i++) {
    vec2 d = p.xy - uTrail[i].xy;
    float f = exp(-dot(d, d) / (uTrailRadius * uTrailRadius)) * uTrailLife[i];
    drag += uTrail[i].zw * f;
    stir += f;
  }

  // Sprite disruptions: a ring kicks particles outward from where a figure
  // appeared or vanished, and the middle churns, then it all settles.
  vec2 burstPush = vec2(0.0);
  for (int i = 0; i < BURSTS; i++) {
    float age = uClock - uBursts[i].z;
    if (uBursts[i].w < 0.5 || age < 0.0 || age > BURST_LIFE) continue;
    vec2 d = p.xy - uBursts[i].xy;
    float dist = length(d);
    float fade = 1.0 - age / BURST_LIFE;
    fade *= fade;
    float ring = exp(-pow((dist - age * 0.9) / 0.1, 2.0)) * fade;
    float core = exp(-dist * dist / 0.04) * fade;
    burstPush += d / max(dist, 1e-4) * ring * 0.12;
    stir += ring * 0.9 + core * 1.2;
  }
  stir = min(stir, 1.5);

  // Two-level domain warp gives the slow, folding fluid motion.
  vec2 w1 = noise2(vec3(q, t));
  vec2 w2 = noise2(vec3(q + 1.8 * w1 + vec2(1.7, 9.2), t * 1.4));
  // Stirred regions pick up faster, finer turbulence.
  vec2 churn = noise2(vec3(q * 3.5 + w2, t * 4.0)) * stir;

  p.xy += (w2 * 0.22 * uWarp + churn * 0.14) * hold + drag * 0.05 + burstPush;
  p.z = (fbm(vec3(q + w2 * 1.3, t * 0.8)) * 0.75 * uWarp + stir * snoise(vec3(q * 5.0, t * 12.0)) * 0.15) * hold;

  // Kick drum: each driver pushes the air with the same envelope as its cone
  // (instant hit, quick decay), arriving later the further away a particle is.
  // Only the strongest driver at each point counts, so every particle gets one
  // clean push per kick, in time with the cones, and settles before the next.
  float wave = 0.0;
  vec2 push = vec2(0.0);
  for (int s = 0; s < SOURCES; s++) {
    vec2 fromSource = p.xy - uSources[s].xy;
    float dist = length(fromSource);
    float reach = exp(-dist * 1.6) * uSources[s].z;
    for (int k = 0; k < KICKS; k++) {
      float t = uBeatAge + float(k) * uBeatInterval - dist / SOUND_SPEED;
      float e = t > 0.0 ? exp(-t * KICK_DECAY) * (1.0 - exp(-t * 60.0)) * reach : 0.0;
      if (e > wave) {
        wave = e;
        push = fromSource / max(dist, 1e-4) * e;
      }
    }
  }
  wave *= uBass;
  push *= uBass;
  p.xy += push * 0.12;
  p.z += wave * 0.3;

  // Slow per-particle shimmer so the field never sits completely still.
  float phase = aRandom * 6.2831;
  p.xy += vec2(sin(uTime * 0.9 + phase), cos(uTime * 0.7 + phase * 1.3)) * 0.004;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;

  // Clumps: slow, large-scale noise picks random regions (anywhere on screen)
  // where particles are bigger and inked more densely, so it's less uniformly faint.
  float clump = smoothstep(0.2, 0.75, snoise(vec3(home * 0.6 + 7.3, uTime * 0.04))) * uClumps;


  float size = (1.0 + clump * 0.5 + glyph * 1.4) * uPointSize * (0.6 + aRandom * 0.8) * (1.0 + stir * 0.4 + wave * 0.6);
  gl_PointSize = size * uPixelRatio / -mv.z;

  vHeat = clamp(stir, 0.0, 1.0);
  // Wavefronts read as darker, denser bands of dither.
  // The kick's push reads as darker, denser dither.
  float ink = 0.15 + 0.6 * smoothstep(-0.55, 0.6, p.z) + wave * 0.8;
  // Concentrate the field around the speaker; it thins to a trace at the edges.
  vec2 fromFocus = p.xy - uFocus;
  float focus = exp(-dot(fromFocus, fromFocus) / (uFocusRadius * uFocusRadius));
  vAlpha = min(ink, 1.2) * (0.35 + aRandom * 0.4) * (mix(uFocusFloor, uFocusBoost, focus) + clump);
  vAlpha *= 1.0 - clearing * 0.85;
  vAlpha = mix(vAlpha, 1.6, min(glyph * 1.5, 1.0));
}
`;

export const fragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uAccent;
uniform float uDitherScale; // device pixels per dither cell

varying float vAlpha;
varying float vHeat;

// Ordered (Bayer) dither thresholds in [0, 1), recursive form.
float bayer2(vec2 a) {
  a = floor(a);
  return fract(dot(a, vec2(0.5, a.y * 0.75)));
}
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c);
  if (r > 0.5) discard;

  // Coverage falls off linearly to the edge; dither it to on/off pixels.
  float coverage = (1.0 - r * 2.0) * vAlpha;
  if (coverage <= bayer4(gl_FragCoord.xy / uDitherScale)) discard;

  gl_FragColor = vec4(mix(uColor, uAccent, vHeat), 1.0);
}
`;
